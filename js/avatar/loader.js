// NVatar Avatar Lab — Model Loading (GLB + VRM)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import S from './state.js';
import { initScene, setStatus } from './scene.js';
import { buildEmotionButtons } from './emotion.js';
import { initMixamoForVRM } from './fbx.js';
import { findMorphMeshes, buildMeshList } from './mesh.js';

export function load(url, btn) {
  if (!url || !url.trim()) return;
  initScene();

  document.querySelectorAll('.model-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('overlay').classList.add('hidden');
  setStatus('loading', '로딩 중...');

  if (url.endsWith('.vrm')) {
    loadVRM(url);
  } else {
    loadGLB(url);
  }
}

function loadGLB(url) {
  const loader = new GLTFLoader();
  if (S.currentModel) { S.scene.remove(S.currentModel); S.currentModel = null; }
  S.mixer = null; S.animations = []; S.morphMeshes = [];
  window._vrm = null; S.fbxMixer = null;

  loader.load(url, (gltf) => {
    S.currentModel = gltf.scene;
    S.currentModel._vrmUrl = url;
    S.scene.add(S.currentModel);

    const box = new THREE.Box3().setFromObject(S.currentModel);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    S.currentModel.position.sub(center);
    S.currentModel.position.y += size.y / 2;
    S.camera.position.set(0, size.y * 0.6, size.y * 2.5);
    S.controls.target.set(0, size.y * 0.5, 0);

    S.animations = gltf.animations || [];
    if (S.animations.length > 0) {
      S.mixer = new THREE.AnimationMixer(S.currentModel);
      updateAnimList();
      playAnim(0);
    } else {
      document.getElementById('animList').innerHTML = '<p style="font-size:11px;color:#64748b;">애니메이션 없음</p>';
    }

    findMorphMeshes();
    buildMeshList();
    buildEmotionButtons();
    setStatus('ok', `GLB 로드 완료 (${S.animations.length} 애니, ${S.morphMeshes.length} morph mesh)`);
  }, undefined, (err) => {
    setStatus('error', '로드 실패: ' + (err.message || err));
  });
}

async function loadVRM(url) {
  try {
    const vrmModule = await import('https://cdn.jsdelivr.net/npm/@pixiv/three-vrm@3.3.3/lib/three-vrm.module.min.js');
    const { VRMLoaderPlugin } = vrmModule;

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    if (S.currentModel) { S.scene.remove(S.currentModel); S.currentModel = null; }
    S.mixer = null; S.animations = []; S.morphMeshes = [];

    loader.load(url, (gltf) => {
      const vrm = gltf.userData.vrm;
      if (!vrm) { setStatus('error', 'VRM 파싱 실패'); return; }

      S.currentModel = gltf.scene;
      S.currentModel._vrmUrl = url;
      S.currentModel.visible = false;
      S.scene.add(S.currentModel);
      S.currentModel.rotation.y = Math.PI;

      S.mixer = null;
      S.animations = [];
      window._vrm = vrm;

      findMorphMeshes();
      buildMeshList();
      setStatus('ok', `VRM 로드 완료 (expressions: ${Object.keys(vrm.expressionManager?.expressionMap || {}).join(', ') || 'none'})`);
      buildEmotionButtons();

      document.getElementById('animList').innerHTML = '<p style="font-size:11px;color:#64748b;">VRM: 표정은 감정 버튼으로 테스트</p>';

      initMixamoForVRM().then(() => {
        S.currentModel.visible = true;
      }).catch(() => {
        S.currentModel.visible = true;
      });
    }, undefined, (err) => {
      setStatus('error', 'VRM 로드 실패: ' + (err.message || err));
    });
  } catch(e) {
    setStatus('error', 'VRM 라이브러리 로드 실패: ' + e.message);
  }
}

function updateAnimList() {
  const list = document.getElementById('animList');
  list.innerHTML = '';
  S.animations.forEach((clip, i) => {
    const btn = document.createElement('button');
    btn.className = 'anim-btn';
    btn.textContent = clip.name || `Animation ${i}`;
    btn.onclick = () => playAnim(i);
    list.appendChild(btn);
  });
}

function playAnim(index) {
  if (!S.mixer || !S.animations[index]) return;
  if (S.currentAction) S.currentAction.fadeOut(0.3);
  S.currentAction = S.mixer.clipAction(S.animations[index]);
  S.currentAction.reset().fadeIn(0.3).play();
  document.querySelectorAll('.anim-btn').forEach((b, i) => b.classList.toggle('active', i === index));
}

export function handleFile(file) {
  const url = URL.createObjectURL(file);
  const ext = file.name.split('.').pop().toLowerCase();
  document.getElementById('dropZone').textContent = file.name;
  // Fix: route through load() which handles VRM/GLB dispatch
  load(url);
}
