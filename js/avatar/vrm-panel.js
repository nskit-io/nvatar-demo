// NVatar Avatar Lab — VRM List Panel & Bone Scanner
import * as THREE from 'three';
import S from './state.js';
import { load } from './loader.js';
import { mixamoVRMRigMap } from './fbx.js';

let vrmVerified = JSON.parse(localStorage.getItem('nvatar_vrm_verified') || '{}');

function saveVerified() {
  localStorage.setItem('nvatar_vrm_verified', JSON.stringify(vrmVerified));
}

export async function buildVrmListPanel() {
  const panel = document.getElementById('vrmListPanel');
  try {
    const res = await fetch(S.API_BASE + '/api/v1/assets');
    const data = await res.json();
    if (!data.vrm || data.vrm.length === 0) { panel.innerHTML = '<small style="color:#888;">VRM 없음</small>'; return; }
    panel.innerHTML = '';
    // Group by source
    const grouped = {};
    data.vrm.forEach(v => { if (!grouped[v.source]) grouped[v.source] = []; grouped[v.source].push(v); });

    Object.keys(grouped).sort().forEach(source => {
      const label = document.createElement('div');
      label.style.cssText = 'font-size:10px;color:#94a3b8;margin-top:6px;font-weight:600;';
      label.textContent = source.toUpperCase();
      panel.appendChild(label);

      grouped[source].forEach(v => {
        const card = document.createElement('div');
        card.className = 'vrm-card';
        const alias = v.meta?.alias;
        const displayName = alias ? (alias.ko + ' / ' + alias.en) : v.name;
        const creator = v.meta?.creator || '';
        const key = v.path;
        const checked = vrmVerified[key] !== false;

        card.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <div style="flex:1;min-width:0;">
              <div style="font-size:12px;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${displayName}</div>
              <div style="font-size:10px;color:#64748b;">${creator} <span class="bone-rate" style="color:#475569;">—</span></div>
            </div>
            <label style="display:flex;align-items:center;gap:4px;cursor:pointer;flex-shrink:0;" title="체크: 제스처 OK / 해제: 팔 본 없음">
              <input type="checkbox" ${checked ? 'checked' : ''} style="cursor:pointer;">
              <span class="vrm-badge ${checked ? 'ok' : 'ng'}">${checked ? 'OK' : 'NG'}</span>
            </label>
          </div>
        `;
        card.dataset.vrmPath = v.path;

        // Click card -> load VRM
        card.addEventListener('click', (e) => {
          if (e.target.tagName === 'INPUT') return;
          document.querySelectorAll('.vrm-card').forEach(c => c.classList.remove('loaded'));
          card.classList.add('loaded');
          const vrmUrl = v.path.startsWith('/') ? S.API_BASE + v.path : v.path;
          load(vrmUrl);
        });

        // Checkbox -> toggle verified
        const cb = card.querySelector('input');
        const badge = card.querySelector('.vrm-badge');
        cb.addEventListener('change', (e) => {
          e.stopPropagation();
          vrmVerified[key] = cb.checked;
          saveVerified();
          badge.className = 'vrm-badge ' + (cb.checked ? 'ok' : 'ng');
          badge.textContent = cb.checked ? 'OK' : 'NG';
          // Update meta.json on server
          fetch(S.API_BASE + '/api/v1/assets/verify', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({path: v.path, verified: cb.checked})
          }).catch(() => {});
        });

        panel.appendChild(card);
      });
    });
  } catch(e) {
    panel.innerHTML = '<small style="color:#f87171;">로드 실패</small>';
  }
}

// --- Bone mapping scanner ---
const CRITICAL_BONES = [
  'hips','spine','chest','upperChest','neck','head',
  'leftShoulder','leftUpperArm','leftLowerArm','leftHand',
  'rightShoulder','rightUpperArm','rightLowerArm','rightHand',
  'leftUpperLeg','leftLowerLeg','leftFoot',
  'rightUpperLeg','rightLowerLeg','rightFoot',
];
const ARM_BONES = [
  'leftShoulder','leftUpperArm','leftLowerArm','leftHand',
  'rightShoulder','rightUpperArm','rightLowerArm','rightHand',
];

export async function scanAllVrmBones() {
  const btn = document.getElementById('btnScanAll');
  const status = document.getElementById('scanStatus');
  btn.disabled = true;
  btn.textContent = '스캔 중...';

  try {
    const res = await fetch(S.API_BASE + '/api/v1/assets');
    const data = await res.json();
    const vrms = data.vrm.filter(v => v.path.endsWith('.vrm'));
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const { FBXLoader } = await import('three/addons/loaders/FBXLoader.js');
    const { VRMLoaderPlugin } = await import('https://cdn.jsdelivr.net/npm/@pixiv/three-vrm@3.3.2/lib/three-vrm.module.min.js');

    const vrmLoader = new GLTFLoader();
    vrmLoader.register((parser) => new VRMLoaderPlugin(parser));

    // Load reference FBX animation
    status.textContent = 'Idle FBX 로드중...';
    const fbxLoader = new FBXLoader();
    const fbxAsset = await fbxLoader.loadAsync(S.API_BASE + '/static/fbx/mixamo/Idle_Default.fbx');
    const refClip = THREE.AnimationClip.findByName(fbxAsset.animations, 'mixamo.com') || fbxAsset.animations[0];
    if (!refClip) { status.textContent = 'FBX 클립 없음'; return; }

    for (let i = 0; i < vrms.length; i++) {
      const v = vrms[i];
      status.textContent = `(${i+1}/${vrms.length}) ${v.name}...`;

      try {
        const scanUrl = v.path.startsWith('/') ? S.API_BASE + v.path : v.path;
        const gltf = await vrmLoader.loadAsync(scanUrl);
        const vrm = gltf.userData.vrm;
        if (!vrm || !vrm.humanoid) {
          updateCardScore(v.path, -1, '?');
          continue;
        }

        // Record T-pose arm positions
        const getArmAngle = (side) => {
          const upper = vrm.humanoid.getNormalizedBoneNode(side + 'UpperArm');
          const lower = vrm.humanoid.getNormalizedBoneNode(side + 'LowerArm');
          if (!upper || !lower) return null;
          const uPos = new THREE.Vector3(), lPos = new THREE.Vector3();
          upper.getWorldPosition(uPos);
          lower.getWorldPosition(lPos);
          const dir = new THREE.Vector3().subVectors(lPos, uPos).normalize();
          return Math.acos(Math.abs(dir.y)) * (180 / Math.PI);
        };

        const tPoseL = getArmAngle('left');
        const tPoseR = getArmAngle('right');

        // Apply Idle animation — retarget using same logic as loadMixamoAnimation
        const restRotInv = new THREE.Quaternion();
        const parentRestWorld = new THREE.Quaternion();
        const _q = new THREE.Quaternion();

        refClip.tracks.forEach(track => {
          const parts = track.name.split('.');
          const mixName = parts[0];
          const vrmBoneName = mixamoVRMRigMap[mixName];
          const vrmNode = vrm.humanoid?.getNormalizedBoneNode(vrmBoneName);
          const mixNode = fbxAsset.getObjectByName(mixName);
          if (!vrmNode || !mixNode) return;

          if (track instanceof THREE.QuaternionKeyframeTrack) {
            mixNode.getWorldQuaternion(restRotInv).invert();
            mixNode.parent.getWorldQuaternion(parentRestWorld);
            const vals = track.values.slice(0, 4);
            _q.fromArray(vals).premultiply(parentRestWorld).multiply(restRotInv);
            vrmNode.quaternion.copy(_q);
          }
        });

        // Update world matrices
        vrm.scene.updateMatrixWorld(true);

        // Measure arm angle after animation
        const animL = getArmAngle('left');
        const animR = getArmAngle('right');

        let armScore = '?';
        let detail = '';
        if (tPoseL !== null && animL !== null && tPoseR !== null && animR !== null) {
          const deltaL = Math.abs(animL - tPoseL);
          const deltaR = Math.abs(animR - tPoseR);
          const avgDelta = (deltaL + deltaR) / 2;
          const score = Math.min(100, Math.round((avgDelta / 30) * 100));
          armScore = score;
          detail = `L:${Math.round(tPoseL)}→${Math.round(animL)}° R:${Math.round(tPoseR)}→${Math.round(animR)}°`;
        }

        updateCardScore(v.path, armScore, detail);

        const ok = typeof armScore === 'number' && armScore >= 50;
        vrmVerified[v.path] = ok;
        saveVerified();
        updateCardVerified(v.path, ok);

        fetch(S.API_BASE + '/api/v1/assets/verify', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({path: v.path, verified: ok, boneRate: typeof armScore === 'number' ? armScore : 0, armRate: typeof armScore === 'number' ? armScore : 0})
        }).catch(() => {});

        // Cleanup
        vrm.scene.traverse(n => {
          if (n.geometry) n.geometry.dispose();
          if (n.material) {
            if (Array.isArray(n.material)) n.material.forEach(m => m.dispose());
            else n.material.dispose();
          }
        });
      } catch(e) {
        console.error(`[Scan] ${v.name}:`, e);
        updateCardScore(v.path, -1, 'ERR');
      }
    }
    status.textContent = `완료! ${vrms.length}개 스캔`;
  } catch(e) {
    status.textContent = '스캔 실패: ' + e.message;
  }
  btn.disabled = false;
  btn.textContent = '🔍 전체 FBX 호환성 스캔';
}

function updateCardScore(path, score, detail) {
  const card = document.querySelector(`.vrm-card[data-vrm-path="${CSS.escape(path)}"]`);
  if (!card) return;
  const rateEl = card.querySelector('.bone-rate');
  if (!rateEl) return;
  if (score < 0) {
    rateEl.textContent = '로드실패';
    rateEl.style.color = '#f87171';
    return;
  }
  if (score === '?') {
    rateEl.textContent = '측정불가';
    rateEl.style.color = '#64748b';
    return;
  }
  const color = score >= 50 ? '#4ade80' : score >= 20 ? '#fbbf24' : '#f87171';
  rateEl.innerHTML = `<span style="color:${color}" title="${detail}">호환 ${score}%</span>`;
}

function updateCardVerified(path, ok) {
  const card = document.querySelector(`.vrm-card[data-vrm-path="${CSS.escape(path)}"]`);
  if (!card) return;
  const cb = card.querySelector('input[type=checkbox]');
  const badge = card.querySelector('.vrm-badge');
  if (cb) cb.checked = ok;
  if (badge) {
    badge.className = 'vrm-badge ' + (ok ? 'ok' : 'ng');
    badge.textContent = ok ? 'OK' : 'NG';
  }
}
