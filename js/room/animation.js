// NVatar Room — Mixamo FBX Animation Loading & Management
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import S from './state.js';

// Mixamo → VRM rig map (from pixiv/three-vrm)
export const mixamoVRMRigMap = {
  mixamorigHips:'hips',mixamorigSpine:'spine',mixamorigSpine1:'chest',mixamorigSpine2:'upperChest',
  mixamorigNeck:'neck',mixamorigHead:'head',
  mixamorigLeftShoulder:'leftShoulder',mixamorigLeftArm:'leftUpperArm',mixamorigLeftForeArm:'leftLowerArm',mixamorigLeftHand:'leftHand',
  mixamorigLeftHandThumb1:'leftThumbMetacarpal',mixamorigLeftHandThumb2:'leftThumbProximal',mixamorigLeftHandThumb3:'leftThumbDistal',
  mixamorigLeftHandIndex1:'leftIndexProximal',mixamorigLeftHandIndex2:'leftIndexIntermediate',mixamorigLeftHandIndex3:'leftIndexDistal',
  mixamorigLeftHandMiddle1:'leftMiddleProximal',mixamorigLeftHandMiddle2:'leftMiddleIntermediate',mixamorigLeftHandMiddle3:'leftMiddleDistal',
  mixamorigLeftHandRing1:'leftRingProximal',mixamorigLeftHandRing2:'leftRingIntermediate',mixamorigLeftHandRing3:'leftRingDistal',
  mixamorigLeftHandPinky1:'leftLittleProximal',mixamorigLeftHandPinky2:'leftLittleIntermediate',mixamorigLeftHandPinky3:'leftLittleDistal',
  mixamorigRightShoulder:'rightShoulder',mixamorigRightArm:'rightUpperArm',mixamorigRightForeArm:'rightLowerArm',mixamorigRightHand:'rightHand',
  mixamorigRightHandThumb1:'rightThumbMetacarpal',mixamorigRightHandThumb2:'rightThumbProximal',mixamorigRightHandThumb3:'rightThumbDistal',
  mixamorigRightHandIndex1:'rightIndexProximal',mixamorigRightHandIndex2:'rightIndexIntermediate',mixamorigRightHandIndex3:'rightIndexDistal',
  mixamorigRightHandMiddle1:'rightMiddleProximal',mixamorigRightHandMiddle2:'rightMiddleIntermediate',mixamorigRightHandMiddle3:'rightMiddleDistal',
  mixamorigRightHandRing1:'rightRingProximal',mixamorigRightHandRing2:'rightRingIntermediate',mixamorigRightHandRing3:'rightRingDistal',
  mixamorigRightHandPinky1:'rightLittleProximal',mixamorigRightHandPinky2:'rightLittleIntermediate',mixamorigRightHandPinky3:'rightLittleDistal',
  mixamorigLeftUpLeg:'leftUpperLeg',mixamorigLeftLeg:'leftLowerLeg',mixamorigLeftFoot:'leftFoot',mixamorigLeftToeBase:'leftToes',
  mixamorigRightUpLeg:'rightUpperLeg',mixamorigRightLeg:'rightLowerLeg',mixamorigRightFoot:'rightFoot',mixamorigRightToeBase:'rightToes',
};

function loadMixamoAnimation(url, vrm, name) {
  const loader = new FBXLoader();
  return loader.loadAsync(url).then((asset) => {
    const clip = THREE.AnimationClip.findByName(asset.animations, 'mixamo.com') || asset.animations[0];
    if (!clip) throw new Error('No animation clip found');

    const tracks = [];
    const restRotationInverse = new THREE.Quaternion();
    const parentRestWorldRotation = new THREE.Quaternion();
    const _quatA = new THREE.Quaternion();

    const motionHipsNode = asset.getObjectByName('mixamorigHips');
    const motionHipsHeight = motionHipsNode ? motionHipsNode.position.y : 1;
    const vrmHipsHeight = vrm.humanoid.normalizedRestPose?.hips?.position?.[1] || 1;
    const hipsPositionScale = vrmHipsHeight / motionHipsHeight;

    clip.tracks.forEach((track) => {
      const trackSplitted = track.name.split('.');
      const mixamoRigName = trackSplitted[0];
      const vrmBoneName = mixamoVRMRigMap[mixamoRigName];
      const vrmNodeName = vrm.humanoid?.getNormalizedBoneNode(vrmBoneName)?.name;
      const mixamoRigNode = asset.getObjectByName(mixamoRigName);

      if (vrmNodeName != null) {
        const propertyName = trackSplitted[1];
        mixamoRigNode.getWorldQuaternion(restRotationInverse).invert();
        mixamoRigNode.parent.getWorldQuaternion(parentRestWorldRotation);

        if (track instanceof THREE.QuaternionKeyframeTrack) {
          for (let i = 0; i < track.values.length; i += 4) {
            const flatQuaternion = track.values.slice(i, i + 4);
            _quatA.fromArray(flatQuaternion);
            _quatA.premultiply(parentRestWorldRotation).multiply(restRotationInverse);
            _quatA.toArray(flatQuaternion);
            flatQuaternion.forEach((v, index) => { track.values[index + i] = v; });
          }
          tracks.push(new THREE.QuaternionKeyframeTrack(
            `${vrmNodeName}.${propertyName}`,
            track.times,
            track.values.map((v, i) => (vrm.meta?.metaVersion === '0' && i % 2 === 0 ? -v : v)),
          ));
        } else if (track instanceof THREE.VectorKeyframeTrack) {
          const value = track.values.map((v, i) =>
            (vrm.meta?.metaVersion === '0' && i % 3 !== 1 ? -v : v) * hipsPositionScale
          );
          tracks.push(new THREE.VectorKeyframeTrack(`${vrmNodeName}.${propertyName}`, track.times, value));
        }
      }
    });

    const hipsNodeName = vrm.humanoid?.getNormalizedBoneNode('hips')?.name;
    const filteredTracks = tracks.filter(t => {
      if (!t.name.endsWith('.position')) return true;
      if (hipsNodeName && t.name.startsWith(hipsNodeName + '.')) {
        for (let i = 0; i < t.values.length; i += 3) {
          t.values[i] = 0;
          t.values[i+2] = 0;
        }
        return true;
      }
      return false;
    });
    const retargetedClip = new THREE.AnimationClip(name, clip.duration, filteredTracks);
    S.mixamoClips[name] = retargetedClip;
    console.log(`[Mixamo] Loaded "${name}" (${tracks.length} tracks, ${clip.duration.toFixed(1)}s)`);
    return retargetedClip;
  });
}

export function _adjustArmSpread(vrm) {
  const h = vrm.humanoid;
  if (!h) return;
  const L = h.getNormalizedBoneNode('leftUpperArm');
  const R = h.getNormalizedBoneNode('rightUpperArm');
  if (L) { L.rotation.z -= 0.15; L.rotation.x += 0.05; }
  if (R) { R.rotation.z += 0.15; R.rotation.x += 0.05; }
}

export function applyManualIdlePose(vrm) {
  const h = vrm.humanoid;
  if (!h) return;
  const DEG = Math.PI / 180;
  const poses = {
    leftShoulder: { z: 10 * DEG }, rightShoulder: { z: -10 * DEG },
    leftUpperArm: { z: 65 * DEG }, rightUpperArm: { z: -65 * DEG },
    leftLowerArm: { z: 3 * DEG, y: 5 * DEG }, rightLowerArm: { z: -3 * DEG, y: -5 * DEG },
    leftHand: { z: 5 * DEG }, rightHand: { z: -5 * DEG },
    spine: { x: -1 * DEG }, head: { x: 3 * DEG },
  };
  for (const [boneName, rot] of Object.entries(poses)) {
    const node = h.getNormalizedBoneNode(boneName);
    if (!node) continue;
    if (rot.x) node.rotation.x = rot.x;
    if (rot.y) node.rotation.y = rot.y;
    if (rot.z) node.rotation.z = rot.z;
  }
  console.log('[Fallback] Manual idle pose applied');
}

const MOOD_FBX = {
  idle:      S.RES_BASE + '/res/fbx/mixamo/Idle_Default.fbx',
  happy:     S.RES_BASE + '/res/fbx/mixamo/Idle_Happy.fbx',
  sad:       S.RES_BASE + '/res/fbx/mixamo/Idle_Sad.fbx',
  think:     S.RES_BASE + '/res/fbx/mixamo/Idle_Thinking.fbx',
  lookAround:S.RES_BASE + '/res/fbx/mixamo/Idle_LookAround.fbx',
  weightShift:S.RES_BASE + '/res/fbx/mixamo/Idle_WeightShift.fbx',
};
const GESTURE_FBX = {
  wave:    S.RES_BASE + '/res/fbx/mixamo/Gesture_Wave.fbx',
  nod:     S.RES_BASE + '/res/fbx/mixamo/Gesture_Nod.fbx',
  laugh:   S.RES_BASE + '/res/fbx/mixamo/Emotion_Laugh.fbx',
  cheer:   S.RES_BASE + '/res/fbx/mixamo/Emotion_Cheer.fbx',
  surprised:S.RES_BASE + '/res/fbx/mixamo/Emotion_Surprised.fbx',
};

export async function loadMixamoAnimations(vrm) {
  // Capture reference at start — if avatar changes mid-load, bail out
  const targetAvatar = S.avatars[0];
  try {
    for (const [name, path] of Object.entries(MOOD_FBX)) {
      await loadMixamoAnimation(path, vrm, name);
    }
    for (const [name, path] of Object.entries(GESTURE_FBX)) {
      await loadMixamoAnimation(path, vrm, 'gesture_' + name);
    }
    await loadMixamoAnimation(S.RES_BASE + '/res/fbx/mixamo/Walk_Default.fbx', vrm, 'walking');
    console.log(`[Mixamo] All animations loaded (${Object.keys(S.mixamoClips).length} clips)`);

    const avatar = S.avatars[0];
    if (!avatar || avatar !== targetAvatar) {
      console.warn('[Mixamo] Avatar changed during load, skipping mixer setup');
      return;
    }

    S.currentMixer = new THREE.AnimationMixer(avatar.scene);
    const mixer = S.currentMixer;

    for (const name of Object.keys(MOOD_FBX)) {
      if (S.mixamoClips[name]) {
        S.moodActions[name] = mixer.clipAction(S.mixamoClips[name]);
        S.moodActions[name].loop = THREE.LoopRepeat;
      }
    }
    for (const name of Object.keys(GESTURE_FBX)) {
      const clipName = 'gesture_' + name;
      if (S.mixamoClips[clipName]) {
        S.gestureActions[name] = mixer.clipAction(S.mixamoClips[clipName]);
        S.gestureActions[name].loop = THREE.LoopOnce;
        S.gestureActions[name].clampWhenFinished = true;
      }
    }

    if (S.moodActions.idle) {
      S.idleAction = S.moodActions.idle;
      S.idleAction.play();
      S.currentAction = S.idleAction;
      S.currentMoodName = 'idle';
    }

    if (S.mixamoClips.walking) {
      S.walkAction = mixer.clipAction(S.mixamoClips.walking);
    }

    avatar._useMixamo = true;
    console.log('[Mixamo] Mood actions:', Object.keys(S.moodActions).join(', '));
  } catch(e) {
    console.error('[Mixamo] Load failed, falling back to manual pose:', e);
    const avatar = S.avatars[0];
    if (avatar && avatar.vrm) applyManualIdlePose(avatar.vrm);
  }
}

export function switchToWalk() {
  if (!S.walkAction || !S.currentAction) return;
  if (S.currentAction === S.walkAction) return;
  S.walkAction.reset().play();
  S.walkAction.crossFadeFrom(S.currentAction, 0.3, true);
  S.currentAction = S.walkAction;
}

export function switchToIdle() {
  if (!S.currentAction) return;
  const targetIdle = S.moodActions[S.currentMoodName] || S.idleAction;
  if (!targetIdle || S.currentAction === targetIdle) return;
  targetIdle.reset().play();
  targetIdle.crossFadeFrom(S.currentAction, 0.3, true);
  S.currentAction = targetIdle;
}

let _gestureFinishListener = null;

export function playGesture(name) {
  const action = S.gestureActions[name];
  if (!action || !S.currentMixer || S.walkState === 'walking') return;

  // Remove stale listener from previous gesture
  if (_gestureFinishListener) {
    S.currentMixer.removeEventListener('finished', _gestureFinishListener);
    _gestureFinishListener = null;
  }

  action.reset().play();
  if (S.currentAction && S.currentAction !== action) {
    action.crossFadeFrom(S.currentAction, 0.3, true);
  }
  S.currentAction = action;

  const onFinish = (e) => {
    if (e.action !== action) return; // Ignore other actions finishing
    S.currentMixer.removeEventListener('finished', onFinish);
    _gestureFinishListener = null;
    const returnAction = S.moodActions[S.currentMoodName] || S.idleAction;
    if (returnAction) {
      returnAction.reset().play();
      returnAction.crossFadeFrom(action, 0.3, true);
      S.currentAction = returnAction;
    }
  };
  _gestureFinishListener = onFinish;
  S.currentMixer.addEventListener('finished', onFinish);
}

const CROSSFADE_SEC = 0.5;

export function crossfadeToMood(targetMood) {
  if (!S.currentMixer) return;
  const targetAction = S.moodActions[targetMood] || S.moodActions.idle;
  if (!targetAction) return;
  if (S.currentMoodName === targetMood) return;

  targetAction.reset().play();
  if (S.currentAction && S.currentAction !== targetAction) {
    targetAction.crossFadeFrom(S.currentAction, CROSSFADE_SEC, true);
  }
  S.currentAction = targetAction;
  S.currentMoodName = targetMood;
}

// Per-avatar: set up a private mixer + idle/walking actions on the given avatar.
export async function setupAvatarAnimations(avatar, opts = {}) {
  if (!avatar || !avatar.vrm) return;
  const tag = avatar._friendIndex ?? 'm';
  try {
    const idleClip = await loadMixamoAnimation(MOOD_FBX.idle, avatar.vrm, `idle__a${tag}`);
    const walkClip = await loadMixamoAnimation(S.RES_BASE + '/res/fbx/mixamo/Walk_Default.fbx', avatar.vrm, `walk__a${tag}`);
    const mixer = new THREE.AnimationMixer(avatar.scene);
    avatar._mixer = mixer;
    avatar._actions = {};
    const idleAction = mixer.clipAction(idleClip);
    idleAction.loop = THREE.LoopRepeat;
    avatar._actions.idle = idleAction;
    const walkAction = mixer.clipAction(walkClip);
    walkAction.loop = THREE.LoopRepeat;
    avatar._actions.walk = walkAction;
    idleAction.play();
    avatar._currentAction = idleAction;
    avatar._useMixamo = true;
    console.log(`[AvatarAnim] Per-avatar mixer ready for "${avatar.name}" (idle + walk)`);
  } catch (e) {
    console.warn('[AvatarAnim] Per-avatar setup failed, using manual idle pose:', e);
    applyManualIdlePose(avatar.vrm);
  }
}

const FRIEND_CROSSFADE = 0.3;

export function friendSwitchToWalk(avatar) {
  if (!avatar?._actions?.walk || !avatar._actions?.idle) return;
  if (avatar._currentAction === avatar._actions.walk) return;
  const walk = avatar._actions.walk;
  walk.reset().play();
  if (avatar._currentAction) walk.crossFadeFrom(avatar._currentAction, FRIEND_CROSSFADE, true);
  avatar._currentAction = walk;
}

export function friendSwitchToIdle(avatar) {
  if (!avatar?._actions?.idle) return;
  if (avatar._currentAction === avatar._actions.idle) return;
  const idle = avatar._actions.idle;
  idle.reset().play();
  if (avatar._currentAction) idle.crossFadeFrom(avatar._currentAction, FRIEND_CROSSFADE, true);
  avatar._currentAction = idle;
}

// Friends get their own mixer updated separately (main avatar's mixer is S.currentMixer).
export function updateFriendMixers(delta) {
  if (!S.avatars) return;
  for (let i = 1; i < S.avatars.length; i++) {
    const a = S.avatars[i];
    if (a && a._mixer) a._mixer.update(delta);
  }
}
