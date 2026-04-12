// NVatar Room — Mood/Gesture Detection & Expression
import S from './state.js';
import { crossfadeToMood } from './animation.js';

const MOOD_PATTERNS = {
  happy: [
    '😊','😆','😄','😁','🤩','💖','💕','✨','🎉','🥳','🌸','🚀','💪','👍',
    'ㅋㅋ','헤헤','하하','ㅎㅎ','기쁘','기분 좋','좋아요','멋져','대박','완전'
  ],
  sad: [
    '😢','😭','🥺','😞','💔',
    'ㅠㅠ','ㅜㅜ','슬프','슬퍼','힘들','괜찮','미안','아쉬'
  ],
  think: [
    '🤔','💭','음...','글쎄','어디보자','생각해'
  ],
};

const GESTURE_PATTERNS = {
  wave:     ['안녕','반가','👋','하이','헬로'],
  laugh:    ['ㅋㅋㅋ','하하하','😂','🤣','웃겨','빵터'],
  cheer:    ['🎉','🥳','축하','대박','최고','짱'],
  surprised:['헐','😮','😲','놀라','진짜?','대박'],
  nod:      ['그렇지','맞아','응응','ㅇㅇ','동의'],
};

export function detectGestureFromText(text) {
  for (const [gesture, patterns] of Object.entries(GESTURE_PATTERNS)) {
    for (const p of patterns) {
      if (text.includes(p)) return gesture;
    }
  }
  return null;
}

export function detectMoodFromText(text) {
  let best = null;
  let bestCount = 0;
  for (const [mood, patterns] of Object.entries(MOOD_PATTERNS)) {
    let count = 0;
    for (const p of patterns) {
      if (text.includes(p)) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      best = mood;
    }
  }
  return bestCount > 0 ? best : null;
}

let _moodRevertTimer = null;
const MOOD_HOLD_SEC = 8;
const MOOD_FADE_SEC = 2;

export function setMood(mood, holdSec) {
  const hold = holdSec || MOOD_HOLD_SEC;

  if (S.walkState !== 'walking') {
    crossfadeToMood(mood === 'idle' ? 'idle' : mood);
  }

  S.avatars.forEach((avatar, i) => {
    if (!avatar || !avatar.vrm) return;
    const vrm = avatar.vrm;
    const em = vrm.expressionManager;
    if (!em) return;

    for (const name of Object.keys(em.expressionMap || {})) {
      if (name === 'blink') continue;
      em.setValue(name, 0);
    }

    switch(mood) {
      case 'happy': em.setValue('happy', 1); break;
      case 'sad': em.setValue('sad', 1); break;
      case 'wave':
        em.setValue('happy', 0.5);
        if (vrm.humanoid) {
          const arm = vrm.humanoid.getNormalizedBoneNode('rightUpperArm');
          if (arm) { avatar._waveAnim = { bone: arm, start: S.elapsed, duration: 2 }; }
        }
        break;
      case 'think': break;
      case 'nod':
        if (vrm.humanoid) {
          const head = vrm.humanoid.getNormalizedBoneNode('head');
          if (head) { avatar._nodAnim = { bone: head, start: S.elapsed, duration: 1.5 }; }
        }
        break;
    }
    em.update();
  });

  if (_moodRevertTimer) clearTimeout(_moodRevertTimer);
  if (mood !== 'idle') {
    _moodRevertTimer = setTimeout(() => {
      fadeToIdle();
      _moodRevertTimer = null;
    }, hold * 1000);
  }
}

function fadeToIdle() {
  crossfadeToMood('idle');

  const steps = 10;
  const intervalMs = (MOOD_FADE_SEC * 1000) / steps;
  let step = 0;
  const fade = setInterval(() => {
    step++;
    const tt = step / steps;
    S.avatars.forEach(avatar => {
      if (!avatar || !avatar.vrm) return;
      const em = avatar.vrm.expressionManager;
      if (!em) return;
      for (const name of Object.keys(em.expressionMap || {})) {
        if (name === 'blink') continue;
        const cur = em.getValue(name);
        if (cur > 0) em.setValue(name, cur * (1 - tt));
      }
      em.update();
    });
    if (step >= steps) clearInterval(fade);
  }, intervalMs);
}
