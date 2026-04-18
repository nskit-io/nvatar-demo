// NVatar Room — Room Editor (config-driven groups, physics constraints, save/load)
import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import S from './state.js';
import { loadRoomConfig, buildGroupDefs, getGroupDefs, findGroupForMesh, getConfig, getRoomFloorY } from './room-config.js';
import { isExploring, onExploreClick } from './room-explore.js';

let editMode = false;
let transformControls = null;
let selectedGroup = null;
let outlineMeshes = [];
let undoStack = [];
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const highlightColor = new THREE.Color(0x6366f1);

// Anchor proxy: invisible Object3D that TransformControls attaches to
let anchorProxy = null;

// Physics: cached initial Y for floor-locked groups
let floorY = null;

export async function initEditor() {
  if (!S.scene || !S.camera || !S.renderer) return;

  // Load room config
  const roomId = new URLSearchParams(location.search).get('room') || 'cozy_living_room';
  try {
    await loadRoomConfig(roomId);
  } catch (e) {
    console.error('[RoomEditor] Config load failed, using fallback:', e);
  }

  // Wait for room model to be ready
  await new Promise(resolve => {
    const check = setInterval(() => {
      if (S.roomModel) { clearInterval(check); resolve(); }
    }, 300);
  });

  // Build groups from config + live scene
  buildGroupDefs();

  // TransformControls setup
  transformControls = new TransformControls(S.camera, S.renderer.domElement);
  transformControls.setSize(0.7);
  transformControls.addEventListener('dragging-changed', (e) => {
    S.controls.enabled = !e.value;
  });
  transformControls.addEventListener('objectChange', onProxyMoved);
  S.scene.add(transformControls);

  anchorProxy = new THREE.Object3D();
  anchorProxy.name = '_editProxy';
  S.scene.add(anchorProxy);

  // Event listeners
  S.renderer.domElement.addEventListener('pointerdown', onPointerDown);
  S.renderer.domElement.addEventListener('pointerup', onPointerUp);
  window.addEventListener('keydown', onKeyDown);

  console.log('[RoomEditor] Initialized');
}

// --- Edit mode ---

export function toggleEditMode() {
  editMode = !editMode;
  const btn = document.getElementById('btnEditMode');
  if (btn) {
    btn.textContent = editMode ? '✏️ Editing' : '✏️ Edit';
    btn.style.borderColor = editMode ? '#6366f1' : '#334155';
    btn.style.color = editMode ? '#6366f1' : '#94a3b8';
  }
  const container = document.getElementById('modeControls');
  if (container) {
    if (editMode) {
      container.innerHTML = `
        <span id="editInfo" style="font-size:11px;color:#94a3b8;">Click an object</span>
        <button id="btnTranslate" class="edit-tool-btn active" style="padding:4px 10px;border:1px solid #6366f1;border-radius:6px;background:rgba(99,102,241,0.2);color:#6366f1;font-size:11px;cursor:pointer;">↔ Move</button>
        <button id="btnRotate" class="edit-tool-btn" style="padding:4px 10px;border:1px solid #334155;border-radius:6px;background:transparent;color:#94a3b8;font-size:11px;cursor:pointer;">🔄 Rotate</button>
        <button id="btnUndo" style="padding:4px 10px;border:1px solid #334155;border-radius:6px;background:transparent;color:#94a3b8;font-size:11px;cursor:pointer;opacity:0.4;">↩ Undo</button>
        <button id="btnAuthoring" style="padding:4px 10px;border:1px solid #334155;border-radius:6px;background:transparent;color:#94a3b8;font-size:11px;cursor:pointer;">✍ Authoring</button>
        <button id="btnLayoutSave" style="padding:4px 10px;border:1px solid #334155;border-radius:6px;background:transparent;color:#94a3b8;font-size:11px;cursor:pointer;">💾</button>
        <button id="btnLayoutLoad" style="padding:4px 10px;border:1px solid #334155;border-radius:6px;background:transparent;color:#94a3b8;font-size:11px;cursor:pointer;">📂</button>
        <span style="width:1px;height:18px;background:#334155;margin:0 2px;"></span>
      `;
      document.getElementById('btnTranslate').onclick = setEditTranslate;
      document.getElementById('btnRotate').onclick = setEditRotate;
      document.getElementById('btnUndo').onclick = undoEdit;
      document.getElementById('btnAuthoring').onclick = () => window.toggleAuthoringPanel && window.toggleAuthoringPanel();
      document.getElementById('btnLayoutSave').onclick = () => window.saveLayout && window.saveLayout();
      document.getElementById('btnLayoutLoad').onclick = () => window.loadLayout && window.loadLayout();
    } else {
      container.innerHTML = '';
    }
  }
  if (!editMode) deselectGroup();
  console.log('[RoomEditor] Edit mode:', editMode);
}

export function setEditTranslate() {
  if (transformControls) transformControls.setMode('translate');
  updateToolbarBtns('translate');
}

export function setEditRotate() {
  if (transformControls) transformControls.setMode('rotate');
  updateToolbarBtns('rotate');
}

export function undoEdit() {
  if (undoStack.length === 0) return;
  const entry = undoStack.pop();
  entry.snapshots.forEach(s => {
    s.node.position.copy(s.pos);
    s.node.quaternion.copy(s.quat);
  });
  if (selectedGroup && selectedGroup.anchorName === entry.anchorName) {
    syncProxyToGroup(selectedGroup);
    transformControls.detach();
    transformControls.attach(anchorProxy);
  }
  updateUndoBtn();
  console.log('[RoomEditor] Undo:', entry.anchorName);
}

// --- Selection ---

function selectGroup(gd) {
  // Fixed category → reject selection
  if (gd.category === 'fixed') {
    showToast(`🔒 ${gd.label} is fixed — cannot move`);
    return;
  }

  if (selectedGroup === gd) return;
  deselectGroup();
  selectedGroup = gd;

  // Undo snapshot
  const snapshots = gd.members.map(m => ({
    node: m, pos: m.position.clone(), quat: m.quaternion.clone(),
  }));
  undoStack.push({ anchorName: gd.anchorName, snapshots });
  updateUndoBtn();

  // Proxy placement
  syncProxyToGroup(gd);
  transformControls.attach(anchorProxy);

  // Floor Y capture for floor-locked groups (union of all members)
  if (gd.floorLocked) {
    const box = computeGroupBox(gd);
    floorY = box.min.y;
  } else {
    floorY = null;
  }

  // Highlight
  outlineMeshes = [];
  gd.members.forEach(m => {
    m.traverse(n => {
      if (n.isMesh && n.material) {
        const mats = Array.isArray(n.material) ? n.material : [n.material];
        mats.forEach(mat => {
          if (!mat._origEmissive) mat._origEmissive = mat.emissive ? mat.emissive.clone() : new THREE.Color(0);
          if (mat.emissive) mat.emissive.copy(highlightColor).multiplyScalar(0.2);
        });
        outlineMeshes.push(n);
      }
    });
  });

  const info = document.getElementById('editInfo');
  const catBadge = gd.category === 'decorative' ? ' 🎨' : ' 📦';
  if (info) info.textContent = gd.label + catBadge + (gd.members.length > 1 ? ` (${gd.members.length} parts)` : '');
  console.log('[RoomEditor] Selected:', gd.label, `[${gd.category}]`);
}

function deselectGroup() {
  if (!selectedGroup) return;
  outlineMeshes.forEach(n => {
    const mats = Array.isArray(n.material) ? n.material : [n.material];
    mats.forEach(mat => {
      if (mat._origEmissive && mat.emissive) mat.emissive.copy(mat._origEmissive);
    });
  });
  outlineMeshes = [];
  transformControls.detach();
  selectedGroup = null;
  floorY = null;
  const info = document.getElementById('editInfo');
  if (info) info.textContent = 'Click an object';
}

function computeGroupBox(gd) {
  const box = new THREE.Box3();
  let first = true;
  gd.members.forEach(m => {
    const b = new THREE.Box3().setFromObject(m);
    if (b.isEmpty()) return;
    if (first) { box.copy(b); first = false; }
    else { box.union(b); }
  });
  if (first) box.setFromObject(gd.anchor);
  return box;
}

function syncProxyToGroup(gd) {
  const box = computeGroupBox(gd);
  const center = box.getCenter(new THREE.Vector3());

  anchorProxy.position.copy(center);
  anchorProxy.quaternion.identity();
  anchorProxy.updateMatrixWorld(true);

  gd._offsets = gd.members.map(m => {
    const mw = new THREE.Vector3();
    m.getWorldPosition(mw);
    return { node: m, offset: mw.clone().sub(center), initQuat: m.quaternion.clone() };
  });
  gd._proxyInitPos = center.clone();
  gd._proxyInitQuat = anchorProxy.quaternion.clone();
}

// --- Physics-aware proxy movement ---

function onProxyMoved() {
  if (!selectedGroup || !selectedGroup._offsets) return;
  const gd = selectedGroup;

  if (transformControls.mode === 'translate') {
    let delta = new THREE.Vector3().subVectors(anchorProxy.position, gd._proxyInitPos);

    // Floor lock: keep items on the room's actual floor plane
    if (gd.floorLocked) {
      delta.y = 0;
      anchorProxy.position.y = gd._proxyInitPos.y;
    } else {
      // For non-floorLocked items (decorative), prevent sinking below room floor
      const roomFloor = getRoomFloorY();
      const testY = gd._proxyInitPos.y + delta.y;
      if (testY < roomFloor) {
        delta.y = roomFloor - gd._proxyInitPos.y;
      }
    }

    // Wall bounds clamping
    const bounds = S.ROOM_BOUNDS;
    const testPos = gd._proxyInitPos.clone().add(delta);
    if (testPos.x < bounds.minX) delta.x = bounds.minX - gd._proxyInitPos.x;
    if (testPos.x > bounds.maxX) delta.x = bounds.maxX - gd._proxyInitPos.x;
    if (testPos.z < bounds.minZ) delta.z = bounds.minZ - gd._proxyInitPos.z;
    if (testPos.z > bounds.maxZ) delta.z = bounds.maxZ - gd._proxyInitPos.z;

    // Apply clamped delta to proxy
    anchorProxy.position.copy(gd._proxyInitPos).add(delta);

    // Move all members
    gd._offsets.forEach(o => {
      const parentInv = new THREE.Matrix4();
      if (o.node.parent) parentInv.copy(o.node.parent.matrixWorld).invert();
      const worldTarget = gd._proxyInitPos.clone().add(o.offset).add(delta);
      const localTarget = worldTarget.applyMatrix4(parentInv);
      o.node.position.copy(localTarget);
    });
  }

  if (transformControls.mode === 'rotate') {
    const deltaQuat = anchorProxy.quaternion.clone().multiply(gd._proxyInitQuat.clone().invert());
    gd._offsets.forEach(o => {
      const rotatedOffset = o.offset.clone().applyQuaternion(deltaQuat);
      const parentInv = new THREE.Matrix4();
      if (o.node.parent) parentInv.copy(o.node.parent.matrixWorld).invert();
      const worldTarget = gd._proxyInitPos.clone().add(rotatedOffset);
      const localTarget = worldTarget.applyMatrix4(parentInv);
      o.node.position.copy(localTarget);
      o.node.quaternion.copy(deltaQuat).multiply(o.initQuat);
    });
  }
}

// --- Events ---

let ptrDown = null;
function onPointerDown(e) { ptrDown = { x: e.clientX, y: e.clientY }; }

function onPointerUp(e) {
  if (!S.roomModel || !ptrDown) return;
  const dx = e.clientX - ptrDown.x, dy = e.clientY - ptrDown.y;
  if (Math.sqrt(dx * dx + dy * dy) > 5) return;
  if (transformControls && transformControls.dragging) return;

  // Explore mode takes priority
  if (isExploring()) {
    onExploreClick(e);
    return;
  }

  if (!editMode) return;

  const rect = S.renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, S.camera);

  const meshes = [];
  S.roomModel.traverse(n => { if (n.isMesh) meshes.push(n); });
  const intersects = raycaster.intersectObjects(meshes, false);

  if (intersects.length > 0) {
    const hit = intersects[0].object;
    const result = findGroupForMesh(hit);
    const topName = result.unclassifiedName;

    // Authoring multi-select mode: shift-click or active authoring adds mesh to selection
    if ((e.shiftKey || window._authoringSelectMode) && topName) {
      window.dispatchEvent(new CustomEvent('authoring:meshPicked', { detail: { name: topName } }));
      return;
    }

    if (result.group) { selectGroup(result.group); return; }

    if (topName) {
      showToast(`${topName} — ${result.reason === 'structural_or_light' ? 'structural (not groupable)' : 'not grouped yet'}`);
    }
  }
  deselectGroup();
}

function onKeyDown(e) {
  if (!editMode && !isExploring()) return;
  if (e.key === 'Escape') {
    if (editMode) deselectGroup();
  }
  if (!editMode) return;
  if (e.key === 'g' || e.key === 'w') setEditTranslate();
  if (e.key === 'r') setEditRotate();
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undoEdit(); }
}

// --- Save / Load layout ---

export function serializeLayout() {
  const groups = getGroupDefs();
  const layout = {};
  groups.forEach(gd => {
    layout[gd.anchorName] = gd.members.map(m => ({
      name: m.name,
      px: m.position.x, py: m.position.y, pz: m.position.z,
      qx: m.quaternion.x, qy: m.quaternion.y, qz: m.quaternion.z, qw: m.quaternion.w,
    }));
  });
  return layout;
}

export function applyLayout(layout) {
  if (!layout) return;
  const groups = getGroupDefs();

  let rootNode = null;
  S.roomModel.traverse(n => { if (n.name === 'RootNode') rootNode = n; });
  const container = rootNode || S.roomModel;
  const nameMap = {};
  container.children.forEach(child => { nameMap[child.name] = child; });

  let applied = 0;
  for (const [anchorName, members] of Object.entries(layout)) {
    members.forEach(saved => {
      const node = nameMap[saved.name];
      if (!node) return;
      node.position.set(saved.px, saved.py, saved.pz);
      node.quaternion.set(saved.qx, saved.qy, saved.qz, saved.qw);
      applied++;
    });
  }
  console.log(`[RoomEditor] Layout applied: ${applied} nodes`);
}

export async function saveLayout() {
  if (!S.currentAvatarId) {
    showToast('⚠ No avatar — cannot save layout');
    return;
  }
  const layout = serializeLayout();
  const roomId = getConfig()?.id || 'cozy_living_room';
  try {
    const resp = await fetch(`${S.RES_BASE}/api/v1/room/layout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        avatar_id: S.currentAvatarId,
        room_id: roomId,
        layout,
      }),
    });
    if (resp.ok) {
      showToast('✅ Layout saved');
    } else {
      showToast('❌ Save failed');
    }
  } catch (e) {
    console.error('[RoomEditor] Save failed:', e);
    showToast('❌ Save failed');
  }
}

export async function loadLayout() {
  if (!S.currentAvatarId) return;
  const roomId = getConfig()?.id || 'cozy_living_room';
  try {
    const resp = await fetch(`${S.API_BASE}/api/v1/room/layout?avatar_id=${S.currentAvatarId}&room_id=${roomId}`);
    if (resp.ok) {
      const data = await resp.json();
      if (data.layout) {
        applyLayout(data.layout);
        console.log('[RoomEditor] Layout loaded from server');
      }
    }
  } catch (e) {
    console.error('[RoomEditor] Load layout failed:', e);
  }
}

// --- UI helpers ---

function updateToolbarBtns(mode) {
  document.querySelectorAll('.edit-tool-btn').forEach(b => {
    b.classList.remove('active');
    b.style.borderColor = '#334155'; b.style.background = 'transparent'; b.style.color = '#94a3b8';
  });
  const btn = document.getElementById('btn' + mode.charAt(0).toUpperCase() + mode.slice(1));
  if (btn) { btn.classList.add('active'); btn.style.borderColor = '#6366f1'; btn.style.background = 'rgba(99,102,241,0.2)'; btn.style.color = '#6366f1'; }
}

function updateUndoBtn() {
  const btn = document.getElementById('btnUndo');
  if (btn) btn.style.opacity = undoStack.length > 0 ? '1' : '0.4';
}

let toastTimer = null;
function showToast(msg) {
  let toast = document.getElementById('editorToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'editorToast';
    toast.style.cssText = `
      position:absolute; bottom:80px; left:50%; transform:translateX(-50%);
      padding:8px 20px; border-radius:20px; background:rgba(15,23,42,0.95);
      border:1px solid #334155; color:#e2e8f0; font-size:12px; z-index:40;
      backdrop-filter:blur(8px); transition:opacity 0.3s; pointer-events:none;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, 2000);
}
