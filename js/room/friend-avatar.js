// NVatar Room — Friend Avatars
// MVP: add a second (or third) avatar to the room with a display name.
// No chat integration yet — visual presence + name label only.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import S from './state.js';
import { setupAvatarAnimations, applyManualIdlePose } from './animation.js';
import { connectFriendChat, closeFriendChat } from './chat.js';
import { startFriendRoaming, stopFriendRoaming } from './roaming.js';
// Friend activity is managed by the central Room Manager — no per-friend timers needed.

const TARGET_BONE_HEIGHT = 1.45; // head bone → foot bone distance (fallback when no main avatar)

// Measure humanoid head→foot bone distance (not mesh bbox, so hair/clothes don't skew)
function measureBoneHeight(vrm) {
  if (!vrm?.humanoid) return null;
  const head = vrm.humanoid.getRawBoneNode?.('head') || vrm.humanoid.getNormalizedBoneNode?.('head');
  const foot = vrm.humanoid.getRawBoneNode?.('leftFoot')
    || vrm.humanoid.getRawBoneNode?.('rightFoot')
    || vrm.humanoid.getNormalizedBoneNode?.('leftFoot');
  if (!head || !foot) return null;
  head.updateMatrixWorld(true);
  foot.updateMatrixWorld(true);
  const hw = new THREE.Vector3(); head.getWorldPosition(hw);
  const fw = new THREE.Vector3(); foot.getWorldPosition(fw);
  return Math.abs(hw.y - fw.y);
}

// Target = main avatar's head→foot if available, else TARGET_BONE_HEIGHT
function getTargetHeight() {
  const main = S.avatars?.[0];
  if (main?.vrm) {
    const h = measureBoneHeight(main.vrm);
    if (h && h > 0.1) return h;
  }
  return TARGET_BONE_HEIGHT;
}

// Friend slots start at index 1 (index 0 is the main avatar)
const friends = []; // { index, name, label, scene }

function _disposeModel(obj) {
  obj.traverse(node => {
    if (node.isMesh) {
      if (node.geometry) node.geometry.dispose();
      if (node.material) {
        const ms = Array.isArray(node.material) ? node.material : [node.material];
        ms.forEach(m => m.dispose());
      }
    }
  });
}

async function pickRandomVrm(excludeUid) {
  const resp = await fetch(`${S.RES_BASE}/api/v1/vrm/models`);
  const data = await resp.json();
  const pool = (data.models || []).filter(m => m.uid !== excludeUid && m.verified);
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

async function resolveVrmUrl(uid) {
  const resp = await fetch(`${S.RES_BASE}/api/v1/vrm/resolve/${uid}`);
  const data = await resp.json();
  // Convert internal /res/... path to absolute URL
  const url = data.model?.url || '';
  return url.startsWith('/res/') ? `${S.RES_BASE}${url}` : url;
}

function makeNameLabel(text) {
  // Create a simple sprite-based name label using canvas
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(15,23,42,0.9)';
  const padding = 12;
  ctx.font = 'bold 48px -apple-system, sans-serif';
  const metrics = ctx.measureText(text);
  const w = Math.min(metrics.width + padding * 2, canvas.width - 20);
  const h = 72;
  const x = (canvas.width - w) / 2;
  const y = (canvas.height - h) / 2;
  // Rounded rect
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 16);
  ctx.fill();
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#f59e0b';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.8, 0.2, 1);
  sprite.renderOrder = 1000;
  return sprite;
}

function _nextIndex() {
  // Find first free slot >= 1
  for (let i = 1; i < 8; i++) {
    if (!S.avatars[i]) return i;
  }
  return S.avatars.length;
}

function _friendSpawnPosition(index) {
  // Place friends to the right of main avatar, spaced 1.2m apart, clamped to room bounds
  const b = S.ROOM_BOUNDS;
  const x = Math.min(b.maxX - 0.3, 1.2 * index);
  const z = 0.2;
  return { x, z };
}

// Main API: add a specific avatar as friend (by avatarId + vrmUid).
// If vrmUid missing, falls back to random VRM.
export async function addFriend({ avatarId, vrmUid, name, voiceId } = {}) {
  // Prevent double-add of same avatar
  if (avatarId && friends.some(f => f.avatarId === avatarId)) {
    console.warn(`[Friend] Avatar ${avatarId} already in room`);
    return null;
  }

  let finalName = name;
  let finalVrmUid = vrmUid;

  if (!finalVrmUid) {
    const mainVrmUid = new URLSearchParams(location.search).get('vrm') || '';
    const pick = await pickRandomVrm(mainVrmUid);
    if (!pick) { alert('No VRM available'); return null; }
    finalVrmUid = pick.uid;
    finalName = finalName || pick.name;
  }
  if (!finalName || !finalName.trim()) return null;

  const url = await resolveVrmUrl(finalVrmUid);
  if (!url) { alert('VRM resolve failed'); return null; }

  const slotIndex = _nextIndex();
  const pos = _friendSpawnPosition(slotIndex);

  try {
    const vrmModule = await import('https://cdn.jsdelivr.net/npm/@pixiv/three-vrm@3.3.3/lib/three-vrm.module.min.js');
    const { VRMLoaderPlugin } = vrmModule;

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    return await new Promise((resolve) => {
      loader.load(url, async (gltf) => {
        const vrm = gltf.userData.vrm;
        if (!vrm) return resolve(null);
        const model = gltf.scene;
        model.rotation.y = Math.PI - 0.3;
        model.position.set(pos.x, 0, pos.z);
        model.traverse(n => { if (n.isMesh) n.castShadow = true; });

        // Bone-based scale normalization — match main avatar's head→foot distance
        S.scene.add(model);
        model.updateMatrixWorld(true);
        const rawH = measureBoneHeight(vrm);
        if (rawH && rawH > 0.1) {
          const target = getTargetHeight();
          const scale = target / rawH;
          model.scale.setScalar(scale);
          console.log(`[Friend] "${finalName}" bone=${rawH.toFixed(2)}m target=${target.toFixed(2)}m → ${scale.toFixed(2)}x`);
        }

        // No persistent name label — speech bubbles appear above each avatar's head when they talk
        const avatarObj = {
          vrm,
          scene: model,
          name: finalName,
          avatarId: avatarId || null,
          vrmUid: finalVrmUid,
          voiceId: voiceId || null,
          isFriend: true,
          _friendIndex: slotIndex,
        };
        S.avatars[slotIndex] = avatarObj;
        friends.push({ index: slotIndex, avatarId: avatarId || null, name: finalName, scene: model });

        // Apply idle pose immediately (no T-pose). Then kick off FBX idle setup async.
        applyManualIdlePose(vrm);
        setupAvatarAnimations(avatarObj, { modes: ['idle'] }).then(() => {
          console.log(`[Friend] "${finalName}" idle animation live`);
        });

        // Open per-friend chat ws so room-manager can forward messages addressed to this avatar
        if (avatarId) {
          connectFriendChat(slotIndex, avatarId);
        }
        // Start passive roaming (random wander when idle)
        startFriendRoaming(slotIndex);
        // Kickstart a welcome dialogue from main → this friend (~8s)
        import('./room-manager.js').then(mod => mod.onFriendJoined(slotIndex));

        console.log(`[Friend] ${finalName} loaded at slot ${slotIndex} (avatarId=${avatarId})`);
        refreshFriendList();
        resolve(slotIndex);
      });
    });
  } catch (e) {
    console.error('[Friend] Load failed:', e);
    alert('친구 로드 실패: ' + e.message);
    return null;
  }
}

// Convenience wrapper (prompt-based random friend)
export async function addRandomFriend(defaultName) {
  const name = (defaultName || prompt('친구 이름?', '')) || '';
  if (!name.trim()) return;
  return addFriend({ name });
}

export function findFriendByAvatarId(avatarId) {
  return friends.find(f => f.avatarId === avatarId) || null;
}

export function removeFriend(index) {
  const av = S.avatars[index];
  if (!av || !av.isFriend) return;
  if (av._mixer) { av._mixer.stopAllAction(); av._mixer.uncacheRoot(av.scene); av._mixer = null; }
  stopFriendRoaming(index);
  closeFriendChat(index);
  _disposeModel(av.scene);
  S.scene.remove(av.scene);
  S.avatars[index] = null;
  const i = friends.findIndex(f => f.index === index);
  if (i >= 0) friends.splice(i, 1);
  refreshFriendList();
}

export function removeAllFriends() {
  [...friends].forEach(f => removeFriend(f.index));
}

export function getFriends() {
  return [...friends];
}

// --- UI: chip list (optional quick view under top-bar) + event dispatch ---

let listEl = null;
function refreshFriendList() {
  window.dispatchEvent(new CustomEvent('friends:changed'));
  if (!listEl) listEl = document.getElementById('friendList');
  if (!listEl) return;
  listEl.innerHTML = '';
  if (friends.length === 0) { listEl.style.display = 'none'; return; }
  listEl.style.display = 'flex';
  friends.forEach(f => {
    const chip = document.createElement('div');
    chip.style.cssText = 'display:flex;align-items:center;gap:4px;padding:3px 8px;border:1px solid #f59e0b;border-radius:12px;background:rgba(245,158,11,0.15);color:#f59e0b;font-size:11px;';
    chip.innerHTML = `<span>👤 ${f.name}</span><button data-idx="${f.index}" class="friend-remove-btn" style="padding:0 4px;border:none;background:transparent;color:#f59e0b;cursor:pointer;font-size:11px;">✕</button>`;
    listEl.appendChild(chip);
  });
  listEl.querySelectorAll('.friend-remove-btn').forEach(b => {
    b.onclick = () => removeFriend(parseInt(b.getAttribute('data-idx'), 10));
  });
}
