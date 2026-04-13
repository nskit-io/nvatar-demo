// NVatar Avatar Lab — Scene Setup & Animate Loop
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import S from './state.js';
import { applyEmotionPose } from './emotion.js';
import { _adjustArmSpread } from './fbx.js';

const clock = new THREE.Clock();

// Mouse tracking for lookAt
document.addEventListener('mousemove', (e) => {
  S.mouseX = (e.clientX / window.innerWidth) * 2 - 1;
  S.mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
});

export function initScene() {
  if (S.renderer) return;
  const container = document.getElementById('viewer');

  S.scene = new THREE.Scene();
  S.scene.background = new THREE.Color(0x0f172a);

  S.camera = new THREE.PerspectiveCamera(30, container.clientWidth / container.clientHeight, 0.1, 100);
  S.camera.position.set(0, 1.2, 3);

  S.renderer = new THREE.WebGLRenderer({ antialias: true });
  S.renderer.setSize(container.clientWidth, container.clientHeight);
  S.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  S.renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(S.renderer.domElement);

  S.scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(2, 3, 2);
  S.scene.add(dir);
  const fill = new THREE.DirectionalLight(0x6366f1, 0.2);
  fill.position.set(-2, 1, -1);
  S.scene.add(fill);

  const grid = new THREE.GridHelper(10, 20, 0x334155, 0x1e293b);
  S.scene.add(grid);

  S.controls = new OrbitControls(S.camera, S.renderer.domElement);
  S.controls.target.set(0, 1, 0);
  S.controls.enableDamping = true;
  S.controls.minDistance = 0.5;
  S.controls.maxDistance = 10;

  const ro = new ResizeObserver(() => {
    S.camera.aspect = container.clientWidth / container.clientHeight;
    S.camera.updateProjectionMatrix();
    S.renderer.setSize(container.clientWidth, container.clientHeight);
  });
  ro.observe(container);

  animate();
}

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  S.elapsed += delta;
  if (S.mixer) S.mixer.update(delta);
  if (S.fbxMixer) { S.fbxMixer.update(delta); if (window._vrm) _adjustArmSpread(window._vrm); }
  if (S.controls) S.controls.update();
  if (S.isRotating && S.currentModel) S.currentModel.rotation.y += 0.005;

  // VRM-specific updates
  if (window._vrm) {
    const vrm = window._vrm;

    // Auto blink
    if (S.blinkPhase < 0) {
      if (S.elapsed > S.nextBlink) S.blinkPhase = 0;
    } else {
      S.blinkPhase += delta * 8;
      const blinkVal = S.blinkPhase < 0.5 ? S.blinkPhase * 2 : Math.max(0, 2 - S.blinkPhase * 2);
      if (vrm.expressionManager) vrm.expressionManager.setValue('blink', blinkVal);
      if (S.blinkPhase > 1.0) {
        S.blinkPhase = -1;
        S.nextBlink = S.elapsed + 2 + Math.random() * 5;
        if (vrm.expressionManager) vrm.expressionManager.setValue('blink', 0);
      }
    }

    // LookAt
    if (vrm.lookAt) {
      vrm.lookAt.target = undefined;
      const yaw = S.mouseX * 20;
      const pitch = S.mouseY * 15;
      if (!vrm._lookYaw) vrm._lookYaw = 0;
      if (!vrm._lookPitch) vrm._lookPitch = 0;
      vrm._lookYaw += (yaw - vrm._lookYaw) * 0.08;
      vrm._lookPitch += (pitch - vrm._lookPitch) * 0.08;
    }

    // Idle breathing (only when NO FBX)
    if (vrm.humanoid && !S.fbxMixer) {
      const spine = vrm.humanoid.getNormalizedBoneNode('spine');
      const chest = vrm.humanoid.getNormalizedBoneNode('chest');
      const head = vrm.humanoid.getNormalizedBoneNode('head');
      const breathe = Math.sin(S.elapsed * 1.2) * 0.008;
      const sway = Math.sin(S.elapsed * 0.5) * 0.003;

      if (spine) { spine.rotation.x = breathe; spine.rotation.z = sway; }
      if (chest) { chest.rotation.x = breathe * 0.5; }

      if (head) {
        const headSway = Math.sin(S.elapsed * 0.3) * 0.01;
        const headNod = Math.sin(S.elapsed * 0.7) * 0.005;
        head.rotation.y = headSway + (vrm._lookYaw || 0) * Math.PI / 180 * 0.3;
        head.rotation.x = headNod + (vrm._lookPitch || 0) * Math.PI / 180 * 0.2;
      }

      if (S.currentEmotionPose && !S.fbxMixer) {
        applyEmotionPose(vrm, delta);
      }
    }

    vrm.update(delta);
  }

  // GLB morph blink
  if (!window._vrm && S.morphMeshes.length > 0) {
    if (S.blinkPhase < 0) {
      if (S.elapsed > S.nextBlink) S.blinkPhase = 0;
    } else {
      S.blinkPhase += delta * 8;
      const blinkVal = S.blinkPhase < 0.5 ? S.blinkPhase * 2 : Math.max(0, 2 - S.blinkPhase * 2);
      S.morphMeshes.forEach(mesh => {
        const lIdx = mesh.morphTargetDictionary['eyeBlinkLeft'];
        const rIdx = mesh.morphTargetDictionary['eyeBlinkRight'];
        if (lIdx !== undefined) mesh.morphTargetInfluences[lIdx] = blinkVal;
        if (rIdx !== undefined) mesh.morphTargetInfluences[rIdx] = blinkVal;
      });
      if (S.blinkPhase > 1.0) {
        S.blinkPhase = -1;
        S.nextBlink = S.elapsed + 2 + Math.random() * 5;
      }
    }
  }

  if (S.renderer) S.renderer.render(S.scene, S.camera);
}

export function toggleRotate() { S.isRotating = !S.isRotating; }

export function resetCamera() {
  if (!S.controls) return;
  S.camera.position.set(0, 1.2, 3);
  S.controls.target.set(0, 1, 0);
}

// --- Status bar with expandable detail ---
export function setStatus(type, text, detail) {
  const bar = document.getElementById('statusBar');
  const arrow = detail ? ' \u25B8' : '';
  bar.innerHTML = `<span class="status-tag ${type === 'ok' ? 'ok' : ''}" ${detail ? 'onclick="toggleStatusDetail()"' : ''}>${text}${arrow}</span>` +
    (detail ? `<div class="status-detail" id="statusDetail">${detail}</div>` : '');
}

export function toggleStatusDetail() {
  const d = document.getElementById('statusDetail');
  if (d) d.classList.toggle('open');
}

export function toggleMobileStatus() {
  document.getElementById('statusBar').classList.toggle('mobile-open');
}
