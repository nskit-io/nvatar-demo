// NVatar Avatar Lab — Emotion/Expression System
import S from './state.js';

const EMOTION_POSES = {
  happy: { expression: 'happy' },
  sad: { expression: 'sad' },
  angry: { expression: 'angry' },
  surprised: { expression: 'surprised' },
  relaxed: { expression: 'relaxed' },
  wink: { expression: 'blink' },
  neutral: { expression: 'neutral' },
};

export function applyEmotionPose(vrm, delta) {
  if (!vrm.humanoid) return;
  const speed = 3.0;
  const boneMap = {
    upperArmL: 'leftUpperArm', upperArmR: 'rightUpperArm',
    lowerArmL: 'leftLowerArm', lowerArmR: 'rightLowerArm',
  };
  for (const [key, boneName] of Object.entries(boneMap)) {
    const bone = vrm.humanoid.getNormalizedBoneNode(boneName);
    if (!bone) continue;
    const target = S.poseTarget[key] || 0;
    if (!S.poseCurrent[key]) S.poseCurrent[key] = 0;
    S.poseCurrent[key] += (target - S.poseCurrent[key]) * speed * delta;
    bone.rotation.z = S.poseCurrent[key];
  }
  const spineBone = vrm.humanoid.getNormalizedBoneNode('spine');
  if (spineBone) {
    const target = S.poseTarget.spine || 0;
    if (!S.poseCurrent.spine) S.poseCurrent.spine = 0;
    S.poseCurrent.spine += (target - S.poseCurrent.spine) * speed * delta;
    spineBone.rotation.x += S.poseCurrent.spine;
  }
}

export const EXPR_EMOJI = {
  neutral:'😐', happy:'😊', sad:'😢', angry:'😡', surprised:'😮', relaxed:'😌',
  blink:'😉', blinkLeft:'😉', blinkRight:'😉', aa:'👄', ih:'👄', ou:'👄', ee:'👄', oh:'👄',
  lookUp:'👆', lookDown:'👇', lookLeft:'👈', lookRight:'👉',
  joy:'😄', fun:'😆', sorrow:'😿', fear:'😨', love:'🥰', shy:'😳',
};
export const EXPR_LABEL = {
  neutral:'중립', happy:'기쁨', sad:'슬픔', angry:'화남', surprised:'놀람', relaxed:'편안',
  blink:'눈감기', blinkLeft:'왼눈', blinkRight:'오른눈', aa:'아', ih:'이', ou:'우', ee:'에', oh:'오',
  lookUp:'위보기', lookDown:'아래보기', lookLeft:'왼쪽보기', lookRight:'오른쪽보기',
  joy:'기쁨', fun:'즐거움', sorrow:'슬픔', fear:'공포', love:'사랑', shy:'수줍',
};

const EMOTIONS = {
  happy: { mouthSmileLeft: 0.7, mouthSmileRight: 0.7, eyeSquintLeft: 0.3, eyeSquintRight: 0.3, cheekSquintLeft: 0.4, cheekSquintRight: 0.4 },
  sad: { mouthFrownLeft: 0.6, mouthFrownRight: 0.6, browInnerUp: 0.5 },
  angry: { browDownLeft: 0.7, browDownRight: 0.7, mouthFrownLeft: 0.3, mouthFrownRight: 0.3, jawForward: 0.2 },
  surprised: { browInnerUp: 0.8, browOuterUpLeft: 0.6, browOuterUpRight: 0.6, eyeWideLeft: 0.7, eyeWideRight: 0.7, jawOpen: 0.3 },
  wink: { eyeBlinkLeft: 0.9, mouthSmileLeft: 0.5, mouthSmileRight: 0.3 },
  neutral: {},
};

export function buildEmotionButtons() {
  const grid = document.getElementById('emotionGrid');
  const info = document.getElementById('morphInfo');

  if (window._vrm && window._vrm.expressionManager) {
    const exprNames = Object.keys(window._vrm.expressionManager.expressionMap || {});
    if (exprNames.length === 0) {
      grid.innerHTML = '<small style="color:#888;">이 모델은 표정 없음</small>';
      info.textContent = '';
      return;
    }
    const order = ['neutral','happy','sad','angry','surprised','relaxed','joy','fun','sorrow','fear','love','shy'];
    const sorted = [...exprNames].sort((a,b) => {
      const ai = order.indexOf(a), bi = order.indexOf(b);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return a.localeCompare(b);
    });
    grid.innerHTML = '';
    if (!sorted.includes('neutral')) sorted.unshift('neutral');
    sorted.forEach(name => {
      const btn = document.createElement('button');
      btn.className = 'emo-btn';
      const emoji = EXPR_EMOJI[name] || '🎭';
      const label = EXPR_LABEL[name] || name;
      btn.innerHTML = emoji + ' ' + label;
      btn.onclick = () => setEmotion(name, btn);
      grid.appendChild(btn);
    });
    info.textContent = `${exprNames.length}개 표정 지원`;
    buildMobileEmoBar();
    return;
  }

  if (S.morphMeshes.length > 0) {
    const allNames = new Set();
    S.morphMeshes.forEach(m => Object.keys(m.morphTargetDictionary).forEach(k => allNames.add(k)));
    grid.innerHTML = '';
    const presets = ['neutral','happy','sad','angry','surprised','wink'];
    presets.forEach(name => {
      const btn = document.createElement('button');
      btn.className = 'emo-btn';
      btn.innerHTML = (EXPR_EMOJI[name] || '🎭') + ' ' + (EXPR_LABEL[name] || name);
      btn.onclick = () => setEmotion(name, btn);
      grid.appendChild(btn);
    });
    info.textContent = `${S.morphMeshes.length}개 mesh, ${allNames.size}개 blendshape`;
    return;
  }

  grid.innerHTML = '<small style="color:#888;">이 모델은 표정 없음</small>';
  info.textContent = '';
}

export function setEmotion(emotion, btn) {
  document.querySelectorAll('.emo-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  if (window._vrm && window._vrm.expressionManager) {
    const em = window._vrm.expressionManager;
    for (const name of Object.keys(em.expressionMap || {})) {
      em.setValue(name, 0);
    }
    const pose = EMOTION_POSES[emotion];
    if (pose) {
      if (pose.expression && em.expressionMap[pose.expression]) em.setValue(pose.expression, 1.0);
      S.poseTarget = { ...(pose.arms || {}), ...(pose.body || {}) };
      S.currentEmotionPose = emotion;
    } else if (emotion !== 'neutral' && em.expressionMap[emotion]) {
      em.setValue(emotion, 1.0);
    }
    if (emotion === 'neutral') {
      S.poseTarget = {};
      S.currentEmotionPose = 'neutral';
    }
    em.update();
    return;
  }

  const morphs = EMOTIONS[emotion] || {};
  S.morphMeshes.forEach(mesh => {
    for (let i = 0; i < mesh.morphTargetInfluences.length; i++) {
      mesh.morphTargetInfluences[i] = 0;
    }
    for (const [name, value] of Object.entries(morphs)) {
      const idx = mesh.morphTargetDictionary[name];
      if (idx !== undefined) mesh.morphTargetInfluences[idx] = value;
    }
  });
}

// --- Mobile Emotion Bar ---
export function buildMobileEmoBar() {
  const bar = document.getElementById('mobileEmoBar');
  if (!bar) return;
  bar.innerHTML = '';
  if (!window._vrm?.expressionManager) { bar.classList.remove('active'); return; }
  const allExprs = Object.keys(window._vrm.expressionManager.expressionMap || {});
  if (allExprs.length === 0) { bar.classList.remove('active'); return; }

  const emotionKeywords = [
    'neutral','happy','sad','angry','surprised','relaxed',
    'joy','fun','sorrow','fear','love','shy',
    'cheekpuff','jawopen','tongueout','eyewide'
  ];
  const filtered = allExprs.filter(name => {
    const lower = name.toLowerCase();
    return emotionKeywords.some(k => lower === k || lower.startsWith(k));
  });
  // Pair Left/Right into single buttons
  const pairMap = {};
  const singles = [];
  filtered.forEach(name => {
    const base = name.replace(/(Left|Right)$/i, '');
    if (base !== name) {
      if (!pairMap[base]) pairMap[base] = [];
      pairMap[base].push(name);
    } else {
      singles.push(name);
    }
  });

  const order = ['neutral','happy','sad','angry','surprised','relaxed','joy','fun','sorrow','fear','love','shy'];
  singles.sort((a,b) => {
    const ai = order.indexOf(a.toLowerCase()), bi = order.indexOf(b.toLowerCase());
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    return a.localeCompare(b);
  });

  // Single expression buttons
  singles.forEach(name => {
    const btn = document.createElement('button');
    btn.textContent = (EXPR_EMOJI[name.toLowerCase()] || EXPR_EMOJI[name] || '🎭') + ' ' + (EXPR_LABEL[name.toLowerCase()] || EXPR_LABEL[name] || name);
    btn.onclick = () => {
      bar.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setEmotion(name);
    };
    bar.appendChild(btn);
  });
  // Paired expressions (apply both sides)
  Object.keys(pairMap).forEach(base => {
    const names = pairMap[base];
    const btn = document.createElement('button');
    const lower = base.toLowerCase();
    btn.textContent = (EXPR_EMOJI[lower] || '🎭') + ' ' + (EXPR_LABEL[lower] || base);
    btn.onclick = () => {
      bar.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      names.forEach(n => {
        window._vrm.expressionManager.setValue(n, 1.0);
      });
      window._vrm.expressionManager.update();
    };
    bar.appendChild(btn);
  });

  if (bar.children.length > 0) bar.classList.add('active');
  else bar.classList.remove('active');
}
