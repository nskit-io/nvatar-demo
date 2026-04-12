// NVatar Room — Click-to-Walk, Collision, Walk Cycle
import * as THREE from 'three';
import S from './state.js';
import { switchToWalk, switchToIdle } from './animation.js';
import { pauseRoaming, _faceCamera } from './roaming.js';

const WALK_SPEED = 1.0;

// --- Click-to-Walk ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

document.addEventListener('dblclick', (event) => {
  if (!S.renderer) return;
  pauseRoaming();
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, S.camera);

  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const intersectPoint = new THREE.Vector3();
  raycaster.ray.intersectPlane(floorPlane, intersectPoint);

  if (intersectPoint) {
    const tx = Math.max(S.ROOM_BOUNDS.minX, Math.min(S.ROOM_BOUNDS.maxX, intersectPoint.x));
    const tz = Math.max(S.ROOM_BOUNDS.minZ, Math.min(S.ROOM_BOUNDS.maxZ, intersectPoint.z));
    S.walkTarget = { x: tx, z: tz };
    S.walkState = 'walking';
    showWalkIndicator(tx, tz);
  }
});

let walkIndicator = null;
function showWalkIndicator(x, z) {
  if (walkIndicator) S.scene.remove(walkIndicator);
  const geo = new THREE.RingGeometry(0.08, 0.12, 16);
  const mat = new THREE.MeshBasicMaterial({ color: 0x6366f1, side: THREE.DoubleSide, transparent: true, opacity: 0.7 });
  walkIndicator = new THREE.Mesh(geo, mat);
  walkIndicator.rotation.x = -Math.PI / 2;
  walkIndicator.position.set(x, 0.01, z);
  S.scene.add(walkIndicator);
  setTimeout(() => { if (walkIndicator) { S.scene.remove(walkIndicator); walkIndicator = null; } }, 2000);
}

function checkCollision(x, z) {
  const avatarBox = new THREE.Box3(
    new THREE.Vector3(x - 0.3, 0, z - 0.3),
    new THREE.Vector3(x + 0.3, 1.5, z + 0.3)
  );
  for (const objBox of S.ROOM_OBJECTS) {
    if (avatarBox.intersectsBox(objBox)) return true;
  }
  return false;
}

export function updateWalk(delta) {
  const avatar = S.avatars[0];
  if (!avatar || !avatar.vrm || !avatar.scene) return;
  const model = avatar.scene;

  if (S.walkState !== 'walking' || !S.walkTarget) return;

  const dx = S.walkTarget.x - model.position.x;
  const dz = S.walkTarget.z - model.position.z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  const step = WALK_SPEED * delta;

  if (dist <= step || dist < 0.05) {
    model.position.x = S.walkTarget.x;
    model.position.z = S.walkTarget.z;
    S.walkTarget = null;
    S.walkState = 'idle';
    if (avatar._returnToCenter) {
      _faceCamera(model);
      avatar._returnToCenter = false;
    }
    switchToIdle();
    return;
  }
  const nx = dx / dist;
  const nz = dz / dist;
  const newX = model.position.x + nx * step;
  const newZ = model.position.z + nz * step;

  if (!checkCollision(newX, newZ)) {
    model.position.x = newX;
    model.position.z = newZ;
  } else {
    S.walkTarget = null;
    S.walkState = 'idle';
    switchToIdle();
    return;
  }

  const angle = Math.atan2(nx, nz);
  model.rotation.y = angle + Math.PI;

  switchToWalk();
}
