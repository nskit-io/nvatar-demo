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

function _applyManualIdlePose(vrm) {
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
    if (!avatar) return;

    S.currentMixer = new THREE.AnimationMixer(avatar.scene);

    for (const name of Object.keys(MOOD_FBX)) {
      if (S.mixamoClips[name]) {
        S.moodActions[name] = S.currentMixer.clipAction(S.mixamoClips[name]);
        S.moodActions[name].loop = THREE.LoopRepeat;
      }
    }
    for (const name of Object.keys(GESTURE_FBX)) {
      const clipName = 'gesture_' + name;
      if (S.mixamoClips[clipName]) {
        S.gestureActions[name] = S.currentMixer.clipAction(S.mixamoClips[clipName]);
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
      S.walkAction = S.currentMixer.clipAction(S.mixamoClips.walking);
    }

    avatar._useMixamo = true;
    console.log('[Mixamo] Mood actions:', Object.keys(S.moodActions).join(', '));
  } catch(e) {
    console.error('[Mixamo] Load failed, falling back to manual pose:', e);
    const avatar = S.avatars[0];
    if (avatar && avatar.vrm) _applyManualIdlePose(avatar.vrm);
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

export function playGesture(name) {
  const action = S.gestureActions[name];
  if (!action || !S.currentMixer || S.walkState === 'walking') return;

  action.reset().play();
  if (S.currentAction && S.currentAction !== action) {
    action.crossFadeFrom(S.currentAction, 0.3, true);
  }
  S.currentAction = action;

  const onFinish = () => {
    S.currentMixer.removeEventListener('finished', onFinish);
    const returnAction = S.moodActions[S.currentMoodName] || S.idleAction;
    if (returnAction) {
      returnAction.reset().play();
      returnAction.crossFadeFrom(action, 0.3, true);
      S.currentAction = returnAction;
    }
  };
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
