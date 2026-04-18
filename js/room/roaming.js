// NVatar Room — Autonomous Roaming, Monologue, Camera Helpers
import * as THREE from 'three';
import S from './state.js';
import { crossfadeToMood } from './animation.js';
import { clearMoodTimer } from './mood.js';

// --- Viewport-aware roaming bounds ---
function _getVisibleRoamBounds() {
  const margin = 0.25;
  const roomBnd = {
    minX: S.ROOM_BOUNDS.minX * 0.5, maxX: S.ROOM_BOUNDS.maxX * 0.5,
    minZ: S.ROOM_BOUNDS.minZ * 0.5, maxZ: S.ROOM_BOUNDS.maxZ * 0.5,
  };
  let visMinX = roomBnd.maxX, visMaxX = roomBnd.minX;
  let visMinZ = roomBnd.maxZ, visMaxZ = roomBnd.minZ;
  const steps = 8;
  for (let gx = 0; gx <= steps; gx++) {
    for (let gz = 0; gz <= steps; gz++) {
      const wx = roomBnd.minX + (roomBnd.maxX - roomBnd.minX) * (gx / steps);
      const wz = roomBnd.minZ + (roomBnd.maxZ - roomBnd.minZ) * (gz / steps);
      const feet = new THREE.Vector3(wx, 0, wz).project(S.camera);
      const head = new THREE.Vector3(wx, 1.85, wz).project(S.camera);
      const fsx = feet.x * 0.5 + 0.5, fsy = -feet.y * 0.5 + 0.5;
      const hsx = head.x * 0.5 + 0.5, hsy = -head.y * 0.5 + 0.5;
      const feetOk = fsx > margin && fsx < 1 - margin && fsy > margin && fsy < 1 - margin && feet.z < 1;
      const headOk = hsx > margin && hsx < 1 - margin && hsy > 0 && hsy < 1 - margin && head.z < 1;
      if (feetOk && headOk) {
        if (wx < visMinX) visMinX = wx;
        if (wx > visMaxX) visMaxX = wx;
        if (wz < visMinZ) visMinZ = wz;
        if (wz > visMaxZ) visMaxZ = wz;
      }
    }
  }
  if (visMinX >= visMaxX || visMinZ >= visMaxZ) {
    return { minX: -0.3, maxX: 0.3, minZ: -0.2, maxZ: 0.2 };
  }
  return { minX: visMinX, maxX: visMaxX, minZ: visMinZ, maxZ: visMaxZ };
}

// --- Autonomous Roaming ---
const ROAM = {
  enabled: true,
  minWait: 8,
  maxWait: 20,
  boundary: { minX: -1.8, maxX: 1.8, minZ: -1.2, maxZ: 1.5 },
  idleVariants: ['idle', 'lookAround', 'weightShift'],
  lastActivity: 0,
  pauseAfterChat: 10,
};
let roamTimer = null;
let roamActive = false;

export function startRoaming() {
  if (roamTimer) return;
  roamActive = true;
  scheduleNextRoam();
  console.log('[Roam] Started autonomous roaming');
}

function scheduleNextRoam() {
  if (!roamActive) return;
  const delay = (ROAM.minWait + Math.random() * (ROAM.maxWait - ROAM.minWait)) * 1000;
  roamTimer = setTimeout(() => {
    roamTimer = null;
    doRoamAction();
  }, delay);
}

function doRoamAction() {
  if (!roamActive || S.walkState === 'walking') { scheduleNextRoam(); return; }

  const timeSinceActivity = (Date.now() - ROAM.lastActivity) / 1000;
  if (timeSinceActivity < ROAM.pauseAfterChat) { scheduleNextRoam(); return; }

  if (Math.random() < 0.5) {
    const bnd = _getVisibleRoamBounds();
    const tx = bnd.minX + Math.random() * (bnd.maxX - bnd.minX);
    const tz = bnd.minZ + Math.random() * (bnd.maxZ - bnd.minZ);
    S.walkTarget = { x: tx, z: tz };
    S.walkState = 'walking';
  } else {
    const variant = ROAM.idleVariants[Math.floor(Math.random() * ROAM.idleVariants.length)];
    if (variant !== S.currentMoodName) {
      crossfadeToMood(variant);
      setTimeout(() => {
        if (S.walkState !== 'walking' && S.currentMoodName === variant) {
          crossfadeToMood('idle');
        }
      }, 5000 + Math.random() * 5000);
    }
  }

  scheduleNextRoam();
}

export function pauseRoaming() {
  ROAM.lastActivity = Date.now();
  _pauseMonologue();
}

// --- Per-friend roaming ---
// Each friend has a private timer; when it fires, either pick a random visible
// target or idle in place. Skips when speaking/walking/locked.
const FRIEND_ROAM = { minWait: 10, maxWait: 22 };

export function startFriendRoaming(friendIndex) {
  const a = S.avatars[friendIndex];
  if (!a || a._roamTimer) return;
  const schedule = () => {
    const delay = (FRIEND_ROAM.minWait + Math.random() * (FRIEND_ROAM.maxWait - FRIEND_ROAM.minWait)) * 1000;
    a._roamTimer = setTimeout(() => {
      _friendRoamTick(friendIndex);
      schedule();
    }, delay);
  };
  schedule();
  console.log(`[Roam] Friend "${a.name}" roaming started`);
}

export function stopFriendRoaming(friendIndex) {
  const a = S.avatars[friendIndex];
  if (!a || !a._roamTimer) return;
  clearTimeout(a._roamTimer);
  a._roamTimer = null;
}

function _friendRoamTick(friendIndex) {
  const a = S.avatars[friendIndex];
  if (!a || !a.scene) return;
  // Skip if this friend is already walking (e.g. responding to user)
  if (a._walkState === 'walking') return;
  // Skip if tab is hidden (AFK)
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

  // 60% chance to wander, 40% chance to stay (idle-in-place reduces fidgetiness)
  if (Math.random() > 0.6) return;

  const bnd = _getVisibleRoamBounds();
  const tx = bnd.minX + Math.random() * (bnd.maxX - bnd.minX);
  const tz = bnd.minZ + Math.random() * (bnd.maxZ - bnd.minZ);
  a._walkTarget = { x: tx, z: tz };
  a._walkState = 'walking';
  a._faceOnArrive = false; // free rotation on arrival, keep last heading
}

export function stopAllTimers() {
  roamActive = false;
  monoActive = false;
  if (roamTimer) { clearTimeout(roamTimer); roamTimer = null; }
  if (monoTimer) { clearTimeout(monoTimer); monoTimer = null; }
  clearMoodTimer();
}

// --- Monologue ---
const MONO = {
  minInterval: 30,
  maxInterval: 60,
  pauseAfterChat: 20,
};
let monoTimer = null;
let monoActive = false;

export function startMonologue() {
  if (monoActive) return;
  monoActive = true;
  _scheduleMonologue();
  console.log('[Mono] Started monologue routine');
}

function _scheduleMonologue() {
  if (!monoActive) return;
  const delay = (MONO.minInterval + Math.random() * (MONO.maxInterval - MONO.minInterval)) * 1000;
  monoTimer = setTimeout(_requestMonologue, delay);
}

function _requestMonologue() {
  monoTimer = null;
  if (!monoActive) return;

  const sinceActivity = (Date.now() - ROAM.lastActivity) / 1000;
  if (sinceActivity < MONO.pauseAfterChat) { _scheduleMonologue(); return; }

  // With friends present, Room Manager (room-manager.js) owns group activity.
  // Main's solo monologue only fires when truly alone.
  const hasFriends = S.avatars.some((a, i) => i >= 1 && a);
  if (!hasFriends && S.chatWs && S.chatWs.readyState === 1) {
    S.chatWs.send(JSON.stringify({ type: 'monologue_request' }));
  }
  _scheduleMonologue();
}

function _pauseMonologue() {
  if (monoTimer) { clearTimeout(monoTimer); monoTimer = null; }
  if (monoActive) _scheduleMonologue();
}

// --- Camera Helpers ---
function _getCameraFrontPos() {
  const tx = S.controls.target.x, tz = S.controls.target.z;
  const cx = S.camera.position.x, cz = S.camera.position.z;
  const dx = cx - tx, dz = cz - tz;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 0.1) return { x: tx, z: tz };
  let rx = tx + (dx / dist) * 1.2;
  let rz = tz + (dz / dist) * 1.2;
  rx = Math.max(S.ROOM_BOUNDS.minX + 0.3, Math.min(S.ROOM_BOUNDS.maxX - 0.3, rx));
  rz = Math.max(S.ROOM_BOUNDS.minZ + 0.3, Math.min(S.ROOM_BOUNDS.maxZ - 0.3, rz));
  return { x: rx, z: rz };
}

function _faceCamera(model) {
  const camPos = S.camera.position;
  model.rotation.y = Math.atan2(
    camPos.x - model.position.x,
    camPos.z - model.position.z
  ) + Math.PI;
}

export { _faceCamera };

export function returnToCenter() {
  const avatar = S.avatars[0];
  if (!avatar || !avatar.scene) return;
  const model = avatar.scene;
  const front = _getCameraFrontPos();
  const dx = front.x - model.position.x;
  const dz = front.z - model.position.z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  if (dist < 0.3) {
    _faceCamera(model);
    return;
  }

  S.walkTarget = { x: front.x, z: front.z };
  S.walkState = 'walking';
  avatar._returnToCenter = true;
}

// Per-avatar variant: friend walks toward a position slightly beside main/center so both fit in view.
export function walkAvatarToCamera(avatarIndex) {
  const avatar = S.avatars[avatarIndex];
  if (!avatar || !avatar.scene) return;
  const front = _getCameraFrontPos();
  // Offset so friend doesn't overlap main avatar
  const sideOffset = avatarIndex % 2 === 1 ? 0.7 : -0.7;
  const tx = Math.max(S.ROOM_BOUNDS.minX + 0.3, Math.min(S.ROOM_BOUNDS.maxX - 0.3, front.x + sideOffset));
  const tz = front.z;
  const model = avatar.scene;
  const dist = Math.hypot(tx - model.position.x, tz - model.position.z);
  if (dist < 0.3) {
    _faceCamera(model);
    return;
  }
  avatar._walkTarget = { x: tx, z: tz };
  avatar._walkState = 'walking';
  avatar._faceOnArrive = true;
}

// Listener approaches speaker: mover walks to ~approachDist away from target,
// on the side closer to the mover (shortest path). Clamped to room bounds.
export function walkToAvatar(moverIndex, targetIndex, approachDist = 0.9) {
  const mover = S.avatars[moverIndex];
  const target = S.avatars[targetIndex];
  if (!mover || !mover.scene || !target || !target.scene) return;
  const mpos = mover.scene.position;
  const tpos = target.scene.position;
  const dx = mpos.x - tpos.x;
  const dz = mpos.z - tpos.z;
  const dist = Math.hypot(dx, dz);
  let tx, tz;
  if (dist < 0.01) {
    const angle = Math.random() * Math.PI * 2;
    tx = tpos.x + Math.cos(angle) * approachDist;
    tz = tpos.z + Math.sin(angle) * approachDist;
  } else {
    const nx = dx / dist, nz = dz / dist;
    tx = tpos.x + nx * approachDist;
    tz = tpos.z + nz * approachDist;
  }
  const b = S.ROOM_BOUNDS;
  tx = Math.max(b.minX + 0.3, Math.min(b.maxX - 0.3, tx));
  tz = Math.max(b.minZ + 0.3, Math.min(b.maxZ - 0.3, tz));
  if (Math.hypot(tx - mpos.x, tz - mpos.z) < 0.3) {
    // Already close enough — just face target
    const yaw = Math.atan2(tpos.x - mpos.x, tpos.z - mpos.z) + Math.PI;
    mover.scene.rotation.y = yaw;
    return;
  }
  if (moverIndex === 0) {
    S.walkTarget = { x: tx, z: tz };
    S.walkState = 'walking';
    mover._returnToCenter = false;
    mover._approachTargetIndex = targetIndex;
  } else {
    mover._walkTarget = { x: tx, z: tz };
    mover._walkState = 'walking';
    mover._faceOnArrive = false;
    mover._approachTargetIndex = targetIndex;
  }
}
