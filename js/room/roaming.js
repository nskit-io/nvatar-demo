// NVatar Room — Autonomous Roaming, Monologue, Camera Helpers
import * as THREE from 'three';
import S from './state.js';
import { crossfadeToMood } from './animation.js';

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

  if (S.chatWs && S.chatWs.readyState === 1) {
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
