// NVatar Room — Scene Setup, Room Building, Loading UI, Controls, Furniture, Animate Loop
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import S from './state.js';
import { t } from './i18n.js';
import { updateWalk } from './walk.js';
import { updateBubblePositions } from './bubble.js';
import { _adjustArmSpread } from './animation.js';

// --- Loading UI ---
export function updateLoading(pct, text) {
  const bar = document.getElementById('loadingBar');
  const txt = document.getElementById('loadingText');
  if (bar) bar.style.width = pct + '%';
  if (txt) txt.textContent = text;
}

export function hideLoading() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) { overlay.style.opacity = '0'; setTimeout(() => overlay.remove(), 500); }
}

export function waitForRoom(callback) {
  let waited = 0;
  const check = setInterval(() => {
    waited += 100;
    if (S.roomModel || waited > 15000) {
      clearInterval(check);
      callback();
    }
  }, 100);
}

// --- Init ---
export function init() {
  S.scene = new THREE.Scene();

  S.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
  S.camera.position.set(0, 2.0, 3.0);

  S.renderer = new THREE.WebGLRenderer({ antialias: true });
  S.renderer.setSize(window.innerWidth, window.innerHeight);
  S.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  S.renderer.shadowMap.enabled = true;
  S.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  S.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  S.renderer.toneMappingExposure = 1.2;
  document.body.appendChild(S.renderer.domElement);

  const bubbleLayer = document.createElement('div');
  bubbleLayer.id = 'bubbleLayer';
  bubbleLayer.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden;z-index:5;';
  document.body.appendChild(bubbleLayer);

  S.controls = new OrbitControls(S.camera, S.renderer.domElement);
  S.controls.target.set(0, 1, 0);
  S.controls.enableDamping = true;
  S.controls.maxPolarAngle = Math.PI * 0.55;
  S.controls.minDistance = 1.5;
  S.controls.maxDistance = 8;

  buildRoom();

  window.addEventListener('resize', () => {
    S.camera.aspect = window.innerWidth / window.innerHeight;
    S.camera.updateProjectionMatrix();
    S.renderer.setSize(window.innerWidth, window.innerHeight);
  });

  S.clock = new THREE.Clock();
  animate();
}

// --- Room ---
function buildRoom() {
  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  S.scene.add(ambient);

  const dirLight = new THREE.DirectionalLight(0xFFE4B5, 0.8);
  dirLight.position.set(3, 5, 2);
  dirLight.castShadow = true;
  S.scene.add(dirLight);
  S.roomLights.push(dirLight);

  const pointLight = new THREE.PointLight(0xFFE4B5, 0.5, 15);
  pointLight.position.set(0, 3, 0);
  S.scene.add(pointLight);
  S.roomLights.push(pointLight);

  updateLoading(20, t('loadingRoom'));
  const roomLoader = new GLTFLoader();
  roomLoader.load(`${S.API_BASE}/static/room/cozy_living_room/scene.gltf`, (gltf) => {
    S.roomModel = gltf.scene;
    S.scene.add(S.roomModel);

    const rawBox = new THREE.Box3().setFromObject(S.roomModel);
    const rawSize = rawBox.getSize(new THREE.Vector3());
    console.log(`[Room] Raw: ${rawSize.x.toFixed(2)} x ${rawSize.y.toFixed(2)} x ${rawSize.z.toFixed(2)}`);

    const scale = 4.5 / rawSize.y;
    S.roomModel.scale.setScalar(scale);
    S.roomModel.updateMatrixWorld(true);

    S.roomModel.rotation.y = -Math.PI / 2;
    S.roomModel.updateMatrixWorld(true);
    const rotatedBox = new THREE.Box3().setFromObject(S.roomModel);
    const rotatedCenter = rotatedBox.getCenter(new THREE.Vector3());
    S.roomModel.position.x = -rotatedCenter.x;
    S.roomModel.position.z = -rotatedCenter.z - 1.5;
    const FLOOR_OFFSET = 0.90;
    S.roomModel.position.y = -rotatedBox.min.y - FLOOR_OFFSET;
    S.roomModel.updateMatrixWorld(true);

    S.roomModel.traverse(n => {
      if (n.isMesh) {
        n.receiveShadow = true;
        n.castShadow = true;
        if (n.geometry) {
          const objBox = new THREE.Box3().setFromObject(n);
          const objSize = objBox.getSize(new THREE.Vector3());
          if (objBox.min.y >= -0.1 && objSize.y > 0.3 && objSize.y < 3 && objSize.x < 4 && objSize.z < 4) {
            S.ROOM_OBJECTS.push(objBox);
          }
        }
      }
    });

    const finalBox = new THREE.Box3().setFromObject(S.roomModel);
    const halfX = (finalBox.max.x - finalBox.min.x) * 0.3;
    const halfZ = (finalBox.max.z - finalBox.min.z) * 0.3;
    S.ROOM_BOUNDS.minX = -halfX;
    S.ROOM_BOUNDS.maxX = halfX;
    S.ROOM_BOUNDS.minZ = finalBox.min.z + 0.5;
    S.ROOM_BOUNDS.maxZ = finalBox.max.z * 0.4;
    console.log(`[Room] Placed: bounds X[${S.ROOM_BOUNDS.minX.toFixed(1)}~${S.ROOM_BOUNDS.maxX.toFixed(1)}] Z[${S.ROOM_BOUNDS.minZ.toFixed(1)}~${S.ROOM_BOUNDS.maxZ.toFixed(1)}], ${S.ROOM_OBJECTS.length} collision objects`);
  }, undefined, (err) => {
    console.error('[Room] Failed to load GLTF:', err);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 8),
      new THREE.MeshStandardMaterial({ color: 0x8B7355, roughness: 0.8 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    S.scene.add(floor);
    S.roomModel = floor;
  });
}

// --- Controls ---
export function toggleLight() {
  S.lightOn = !S.lightOn;
  S.roomLights.forEach(l => l.intensity = S.lightOn ? 1.5 : 0.1);
}

export function resetView() {
  S.camera.position.set(0, 3.5, 6);
  S.controls.target.set(0, 0.8, 0);
}

// --- Furniture ---
export function addFurniture(type) {
  let mesh;
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.7 });

  switch(type) {
    case 'desk':
      mat.color = new THREE.Color(0x8B6914);
      const group = new THREE.Group();
      group.add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.6), mat));
      group.children[0].position.y = 0.7;
      const legMat = new THREE.MeshStandardMaterial({ color: 0x444444 });
      [[-0.55, 0, -0.25], [0.55, 0, -0.25], [-0.55, 0, 0.25], [0.55, 0, 0.25]].forEach(p => {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.7), legMat);
        leg.position.set(p[0], 0.35, p[2]);
        group.add(leg);
      });
      group.position.set(-2, 0, -1.5);
      group.castShadow = true;
      S.scene.add(group);
      break;
    case 'shelf':
      mat.color = new THREE.Color(0xA0522D);
      mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1.5, 0.3), mat);
      mesh.position.set(2.5, 0.75, -2);
      mesh.castShadow = true;
      S.scene.add(mesh);
      for (let i = 0; i < 5; i++) {
        const book = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, 0.2, 0.15),
          new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(Math.random(), 0.7, 0.5) })
        );
        book.position.set(2.2 + i * 0.12, 1.3, -2);
        S.scene.add(book);
      }
      break;
    case 'lamp':
      const lampGroup = new THREE.Group();
      lampGroup.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1), new THREE.MeshStandardMaterial({ color: 0x333333 })));
      lampGroup.children[0].position.y = 0.5;
      const shade = new THREE.Mesh(
        new THREE.ConeGeometry(0.2, 0.25, 16, 1, true),
        new THREE.MeshStandardMaterial({ color: 0xFFE4B5, side: THREE.DoubleSide, emissive: 0xFFE4B5, emissiveIntensity: 0.3 })
      );
      shade.position.y = 1.05;
      lampGroup.add(shade);
      const lampLight = new THREE.PointLight(0xFFE4B5, 0.5, 3);
      lampLight.position.y = 1;
      lampGroup.add(lampLight);
      lampGroup.position.set(-2, 0, -2);
      S.scene.add(lampGroup);
      break;
    case 'plant':
      const potMat = new THREE.MeshStandardMaterial({ color: 0xA0522D });
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.2, 16), potMat);
      pot.position.set(2.2, 0.1, 1);
      S.scene.add(pot);
      const leafMat = new THREE.MeshStandardMaterial({ color: 0x228B22 });
      for (let i = 0; i < 5; i++) {
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), leafMat);
        leaf.position.set(2.2 + (Math.random() - 0.5) * 0.15, 0.3 + Math.random() * 0.2, 1 + (Math.random() - 0.5) * 0.15);
        S.scene.add(leaf);
      }
      break;
  }
}

// --- Animate ---
function animate() {
  requestAnimationFrame(animate);
  const delta = S.clock.getDelta();
  S.elapsed += delta;
  if (S.controls) S.controls.update();

  if (S.currentMixer) { S.currentMixer.update(delta); if (S.avatars[0] && S.avatars[0].vrm) _adjustArmSpread(S.avatars[0].vrm); }

  updateWalk(delta);

  S.avatars.forEach((avatar, i) => {
    if (!avatar || !avatar.vrm) return;
    const vrm = avatar.vrm;

    // Auto blink
    avatar.blinkTimer += delta;
    if (avatar.blinkTimer > avatar.nextBlink) {
      if (vrm.expressionManager) {
        const blinkVal = Math.sin((avatar.blinkTimer - avatar.nextBlink) * 16) * 0.5 + 0.5;
        vrm.expressionManager.setValue('blink', blinkVal > 0.8 ? 1 : 0);
        if (avatar.blinkTimer > avatar.nextBlink + 0.2) {
          avatar.blinkTimer = 0;
          avatar.nextBlink = 2 + Math.random() * 5;
          vrm.expressionManager.setValue('blink', 0);
        }
      }
    }

    // Idle breathing
    if (vrm.humanoid) {
      const spine = vrm.humanoid.getNormalizedBoneNode('spine');
      if (spine) {
        spine.rotation.x = Math.sin(S.elapsed * 1.2) * 0.008;
        spine.rotation.z = Math.sin(S.elapsed * 0.5) * 0.003;
      }
    }

    // Wave animation
    if (avatar._waveAnim) {
      const tt = (S.elapsed - avatar._waveAnim.start) / avatar._waveAnim.duration;
      if (tt < 1) {
        avatar._waveAnim.bone.rotation.z = -1.2 + Math.sin(tt * Math.PI * 4) * 0.3;
      } else {
        avatar._waveAnim.bone.rotation.z = 0;
        avatar._waveAnim = null;
      }
    }

    // Think animation (head tilt)
    if (avatar._thinkAnim) {
      const tt = (S.elapsed - avatar._thinkAnim.start) / avatar._thinkAnim.duration;
      if (tt < 1) {
        avatar._thinkAnim.bone.rotation.z = Math.sin(tt * Math.PI) * 0.15;
        avatar._thinkAnim.bone.rotation.x = Math.sin(tt * Math.PI * 0.5) * 0.1;
      } else {
        avatar._thinkAnim = null;
      }
    }

    // Nod animation
    if (avatar._nodAnim) {
      const tt = (S.elapsed - avatar._nodAnim.start) / avatar._nodAnim.duration;
      if (tt < 1) {
        avatar._nodAnim.bone.rotation.x = Math.sin(tt * Math.PI * 3) * 0.15;
      } else {
        avatar._nodAnim = null;
      }
    }

    vrm.update(delta);
  });

  S.renderer.render(S.scene, S.camera);
  updateBubblePositions();
}
