// NVatar Avatar Lab — Mixamo FBX Animation System
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import S from './state.js';
import { setStatus } from './scene.js';
import { setEmotion } from './emotion.js';

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

export function _adjustArmSpread(vrm) {
  const h = vrm.humanoid;
  if (!h) return;
  const L = h.getNormalizedBoneNode('leftUpperArm');
  const R = h.getNormalizedBoneNode('rightUpperArm');
  if (L) { L.rotation.z -= 0.15; L.rotation.x += 0.05; }
  if (R) { R.rotation.z += 0.15; R.rotation.x += 0.05; }
}

function loadMixamoFBX(url, name, vrm) {
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
    const vrmHipsHeight = vrm.humanoid?.normalizedRestPose?.hips?.position?.[1] || 1;
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
            `${vrmNodeName}.${propertyName}`, track.times,
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
    const filtered = tracks.filter(t => {
      if (!t.name.endsWith('.position')) return true;
      if (hipsNodeName && t.name.startsWith(hipsNodeName + '.')) {
        for (let i = 0; i < t.values.length; i += 3) { t.values[i] = 0; t.values[i+2] = 0; }
        return true;
      }
      return false;
    });
    S.fbxClips[name] = new THREE.AnimationClip(name, clip.duration, filtered);
    const foundNodes = [], missingNodes = [];
    filtered.forEach(t => {
      const nodeName = t.name.split('.')[0];
      const node = S.currentModel.getObjectByName(nodeName);
      if (node) foundNodes.push(nodeName); else missingNodes.push(nodeName);
    });
    console.log(`[Mixamo] "${name}" loaded — ${filtered.length} tracks, found=${foundNodes.length}, missing=${missingNodes.length}`);
    if (missingNodes.length > 0) console.warn(`[Mixamo] Missing nodes:`, missingNodes.slice(0, 5));
  });
}

export async function initMixamoForVRM() {
  if (!S.currentModel || !window._vrm) return;
  S.fbxClips = {};
  S.fbxMixer = new THREE.AnimationMixer(S.currentModel);
  try {
    const res = await fetch(S.API_BASE + '/api/v1/assets');
    const assets = await res.json();
    for (const fbx of assets.fbx) {
      await loadMixamoFBX(fbx.path, fbx.name, window._vrm);
    }
    console.log(`[Mixamo] ${assets.fbx.length}개 애니메이션 로드 완료`);
    buildFbxButtons();
    if (S.fbxClips['Idle_Default']) {
      S.fbxCurrentAction = S.fbxMixer.clipAction(S.fbxClips['Idle_Default']);
      S.fbxCurrentAction.play();
      S.fbxCurrentName = 'Idle_Default';
    } else if (S.fbxClips['Idle_Breathing']) {
      S.fbxCurrentAction = S.fbxMixer.clipAction(S.fbxClips['Idle_Breathing']);
      S.fbxCurrentAction.play();
      S.fbxCurrentName = 'Idle_Breathing';
    }
  } catch(e) { console.error('[Mixamo]', e); }
}

const FBX_FACE = {
  Idle_Default:'neutral', Idle_Breathing:'neutral', Idle_WeightShift:'neutral',
  Idle_Happy:'happy', Idle_Sad:'sad', Idle_Thinking:'neutral',
  Idle_LookAround:'neutral', Idle_Sitting:'relaxed',
  Gesture_Wave:'happy', Gesture_Nod:'happy', Gesture_HeadShake:'sad',
  Gesture_Shrug:'neutral', Gesture_Clap:'happy', Gesture_Point:'neutral',
  Gesture_ThumbsUp:'happy', Gesture_Talk:'neutral', Gesture_Greeting:'happy',
  Emotion_Angry:'angry', Emotion_Cheer:'happy', Emotion_Cry:'sad',
  Emotion_Laugh:'happy', Emotion_Surprised:'surprised', Emotion_Victory:'happy',
  Walk_Default:'neutral', Walk_Casual:'neutral', Walk_Brisk:'neutral',
  Walk_Female:'neutral', Walk_Catwalk:'relaxed', Walk_Swagger:'happy',
  Dance_HipHop:'happy', Dance_RunningMan:'happy', Dance_Salsa:'happy',
  Action_StandToSit:'neutral',
};
const FBX_EMOJI = { Idle:'😐', Walk:'🚶', Gesture:'🤝', Emotion:'😊', Dance:'💃', Action:'🎬' };

export function playMixamo(name, btn) {
  document.querySelectorAll('.fbx-btn').forEach(b => b.classList.remove('active'));
  if (!S.fbxMixer) return;
  const CROSSFADE = 0.4;

  if (!name) {
    const idleClip = S.fbxClips['Idle_Default'] || S.fbxClips['Idle_Breathing'];
    if (idleClip && S.fbxCurrentAction) {
      const idleAction = S.fbxMixer.clipAction(idleClip);
      S.fbxCurrentAction.fadeOut(CROSSFADE);
      idleAction.reset().fadeIn(CROSSFADE).play();
      S.fbxCurrentAction = idleAction;
      S.fbxCurrentName = idleClip.name;
    } else if (S.fbxCurrentAction) {
      S.fbxCurrentAction.fadeOut(CROSSFADE);
      S.fbxCurrentAction = null;
      S.fbxCurrentName = null;
    }
    setEmotion('neutral');
    if (btn) btn.classList.add('active');
    return;
  }

  const clip = S.fbxClips[name];
  if (!clip) return;

  const prevAction = S.fbxCurrentAction;
  const newAction = S.fbxMixer.clipAction(clip);

  if (prevAction && prevAction !== newAction) {
    prevAction.fadeOut(CROSSFADE);
    newAction.reset().fadeIn(CROSSFADE).play();
  } else {
    newAction.reset().play();
  }

  S.fbxCurrentAction = newAction;
  S.fbxCurrentName = name;
  if (btn) btn.classList.add('active');

  const face = FBX_FACE[name];
  if (face) setEmotion(face);
}

function buildFbxButtons() {
  const area = document.getElementById('fbxButtonArea');
  const names = Object.keys(S.fbxClips).sort();
  if (names.length === 0) { area.innerHTML = '<small style="color:#888;">FBX 없음</small>'; return; }
  area.innerHTML = '';
  const groups = {};
  names.forEach(n => { const prefix = n.split('_')[0] || 'Other'; if (!groups[prefix]) groups[prefix] = []; groups[prefix].push(n); });

  const offBtn = document.createElement('button');
  offBtn.className = 'anim-btn fbx-btn';
  offBtn.textContent = '⏹ Off';
  offBtn.style.cssText = 'flex:0 0 auto;';
  offBtn.onclick = () => playMixamo(null, offBtn);
  area.appendChild(offBtn);

  Object.keys(groups).sort().forEach(prefix => {
    const label = document.createElement('div');
    label.style.cssText = 'width:100%;font-size:9px;color:#64748b;margin-top:4px;';
    label.textContent = prefix;
    area.appendChild(label);
    groups[prefix].forEach(name => {
      const btn = document.createElement('button');
      btn.className = 'anim-btn fbx-btn';
      const shortName = name.includes('_') ? name.split('_').slice(1).join('_') : name;
      btn.textContent = (FBX_EMOJI[prefix] || '🎬') + ' ' + shortName;
      btn.style.cssText = 'flex:0 0 auto;font-size:11px;';
      btn.onclick = () => playMixamo(name, btn);
      area.appendChild(btn);
    });
  });
}
