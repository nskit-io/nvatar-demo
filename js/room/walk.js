// NVatar Room — Click-to-Walk, Collision, Walk Cycle
import * as THREE from 'three';
import S from './state.js';
import { switchToWalk, switchToIdle, friendSwitchToWalk, friendSwitchToIdle } from './animation.js';
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

const AVATAR_CLEARANCE = 0.55;
function checkAvatarCollision(selfIndex, x, z) {
  for (let i = 0; i < S.avatars.length; i++) {
    if (i === selfIndex) continue;
    const other = S.avatars[i];
    if (!other || !other.scene) continue;
    const op = other.scene.position;
    if (Math.hypot(x - op.x, z - op.z) < AVATAR_CLEARANCE) return true;
  }
  return false;
}

function _faceAvatar(mover, target) {
  const mp = mover.position, tp = target.position;
  mover.rotation.y = Math.atan2(tp.x - mp.x, tp.z - mp.z) + Math.PI;
}

export function updateWalk(delta) {
  // Main avatar (S.walkTarget / S.walkState / S.walkAction)
  const avatar = S.avatars[0];
  if (avatar && avatar.vrm && avatar.scene && S.walkState === 'walking' && S.walkTarget) {
    const model = avatar.scene;
    const dx = S.walkTarget.x - model.position.x;
    const dz = S.walkTarget.z - model.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const step = WALK_SPEED * delta;
    if (dist <= step || dist < 0.05) {
      model.position.x = S.walkTarget.x;
      model.position.z = S.walkTarget.z;
      S.walkTarget = null;
      S.walkState = 'idle';
      if (avatar._approachTargetIndex != null) {
        const tgt = S.avatars[avatar._approachTargetIndex];
        if (tgt && tgt.scene) _faceAvatar(model, tgt.scene);
        avatar._approachTargetIndex = null;
      } else if (avatar._returnToCenter) {
        _faceCamera(model); avatar._returnToCenter = false;
      }
      switchToIdle();
    } else {
      const nx = dx / dist, nz = dz / dist;
      const newX = model.position.x + nx * step;
      const newZ = model.position.z + nz * step;
      if (!checkCollision(newX, newZ) && !checkAvatarCollision(0, newX, newZ)) {
        model.position.x = newX;
        model.position.z = newZ;
        model.rotation.y = Math.atan2(nx, nz) + Math.PI;
        switchToWalk();
      } else {
        // Blocked — stop at current position and face target if approach mode
        if (avatar._approachTargetIndex != null) {
          const tgt = S.avatars[avatar._approachTargetIndex];
          if (tgt && tgt.scene) _faceAvatar(model, tgt.scene);
          avatar._approachTargetIndex = null;
        }
        S.walkTarget = null; S.walkState = 'idle'; switchToIdle();
      }
    }
  }

  // Friends (per-avatar walk state + anim)
  for (let i = 1; i < S.avatars.length; i++) {
    const a = S.avatars[i];
    if (!a || !a.scene) continue;
    if (a._walkState !== 'walking' || !a._walkTarget) {
      if (a._wasWalking) { friendSwitchToIdle(a); a._wasWalking = false; }
      continue;
    }
    const model = a.scene;
    const dx = a._walkTarget.x - model.position.x;
    const dz = a._walkTarget.z - model.position.z;
    const dist = Math.hypot(dx, dz);
    const step = WALK_SPEED * delta;
    if (dist <= step || dist < 0.05) {
      model.position.x = a._walkTarget.x;
      model.position.z = a._walkTarget.z;
      a._walkTarget = null;
      a._walkState = 'idle';
      if (a._approachTargetIndex != null) {
        const tgt = S.avatars[a._approachTargetIndex];
        if (tgt && tgt.scene) _faceAvatar(model, tgt.scene);
        a._approachTargetIndex = null;
      } else if (a._faceOnArrive) {
        _faceCamera(model); a._faceOnArrive = false;
      }
      friendSwitchToIdle(a); a._wasWalking = false;
      continue;
    }
    const nx = dx / dist, nz = dz / dist;
    const newX = model.position.x + nx * step;
    const newZ = model.position.z + nz * step;
    if (!checkCollision(newX, newZ) && !checkAvatarCollision(i, newX, newZ)) {
      model.position.x = newX;
      model.position.z = newZ;
      model.rotation.y = Math.atan2(nx, nz) + Math.PI;
      if (!a._wasWalking) { friendSwitchToWalk(a); a._wasWalking = true; }
    } else {
      // Blocked — face target if approach mode, stop walking
      if (a._approachTargetIndex != null) {
        const tgt = S.avatars[a._approachTargetIndex];
        if (tgt && tgt.scene) _faceAvatar(model, tgt.scene);
        a._approachTargetIndex = null;
      }
      a._walkTarget = null;
      a._walkState = 'idle';
      friendSwitchToIdle(a); a._wasWalking = false;
    }
  }
}
