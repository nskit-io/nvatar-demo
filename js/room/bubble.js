// NVatar Room — Speech Bubble System (Pure DOM)
import * as THREE from 'three';
import S from './state.js';

let bubbleIdCounter = 0;
let _bubbleQueue = [];
let _bubbleProcessing = false;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function toScreen(position3D) {
  const vec = position3D.clone().project(S.camera);
  return {
    x: (vec.x * 0.5 + 0.5) * window.innerWidth,
    y: (-vec.y * 0.5 + 0.5) * window.innerHeight,
  };
}

export function updateBubblePositions() {
  S.avatars.forEach((avatar, i) => {
    if (!avatar || !avatar.scene || !avatar._bubbleDivs) return;
    const headPos = new THREE.Vector3(0, 1.85, 0);
    avatar.scene.localToWorld(headPos);
    const screen = toScreen(headPos);

    const facePos = new THREE.Vector3(0, 1.55, 0);
    avatar.scene.localToWorld(facePos);
    const faceScreen = toScreen(facePos);

    avatar._bubbleDivs.forEach(div => {
      if (div.style.opacity === '0') return;
      const bubbleH = div.offsetHeight || 40;
      const bubbleW = div.offsetWidth || 160;
      const pad = 8;
      const vw = window.innerWidth;
      const halfW = bubbleW / 2;

      let bx = screen.x;
      let by = screen.y - bubbleH;

      const headOffScreen = screen.x < -50 || screen.x > vw + 50 || screen.y < -50 || screen.y > window.innerHeight + 50;
      const tooNarrow = (bx - halfW < pad && bx + halfW > vw - pad);

      if (headOffScreen || tooNarrow) {
        bx = vw / 2;
        by = pad + 10;
      } else {
        if (by < pad) by = pad;
        if (by + bubbleH > faceScreen.y) by = faceScreen.y - bubbleH;
        if (bx - halfW < pad) bx = halfW + pad;
        if (bx + halfW > vw - pad) bx = vw - halfW - pad;
      }

      div.style.left = bx + 'px';
      div.style.top = by + 'px';
      div.style.transform = 'translate(-50%, 0)';
    });
  });
}

export function showBubble(index, text) {
  _bubbleQueue.push({ index, text });
  if (!_bubbleProcessing) processNextBubble();
}

async function processNextBubble() {
  if (_bubbleQueue.length === 0) { _bubbleProcessing = false; return; }
  _bubbleProcessing = true;

  const { index, text } = _bubbleQueue.shift();
  const avatar = S.avatars[index];
  if (!avatar || !avatar.scene) { _bubbleProcessing = false; processNextBubble(); return; }
  if (!avatar._bubbleDivs) avatar._bubbleDivs = [];

  if (avatar._currentBubbleDiv) {
    const old = avatar._currentBubbleDiv;
    old.style.transition = 'all 1.2s ease-out';
    old.style.transform = 'translate(-50%, -100%) translateY(-40px)';
    old.style.opacity = '0';
    setTimeout(() => { old.remove(); avatar._bubbleDivs = avatar._bubbleDivs.filter(d => d !== old); }, 1300);
    await sleep(300);
  }

  if (avatar._bubbleTimer) { clearInterval(avatar._bubbleTimer); avatar._bubbleTimer = null; }

  const id = ++bubbleIdCounter;
  const div = document.createElement('div');
  div.id = 'bubble-' + id;
  const maxBubbleW = Math.min(200, window.innerWidth * 0.6);
  div.style.cssText = `position:absolute;transform:translate(-50%,-100%);background:rgba(30,41,59,0.95);color:#e2e8f0;padding:8px 12px;border-radius:12px;font-size:12px;max-width:${maxBubbleW}px;line-height:1.5;border:1px solid #334155;backdrop-filter:blur(4px);font-family:-apple-system,sans-serif;transition:all 1s ease-out;opacity:1;pointer-events:none;`;
  document.getElementById('bubbleLayer').appendChild(div);

  avatar._bubbleDivs.push(div);
  avatar._currentBubbleDiv = div;

  await new Promise(resolve => {
    let i = 0;
    div.textContent = '';
    avatar._bubbleTimer = setInterval(() => {
      if (i < text.length) {
        div.textContent += text[i];
        i++;
      } else {
        clearInterval(avatar._bubbleTimer);
        avatar._bubbleTimer = null;
        resolve();
      }
    }, 50);
  });

  await sleep(2000);

  if (avatar._autoFadeTimer) clearTimeout(avatar._autoFadeTimer);
  avatar._autoFadeTimer = setTimeout(() => {
    if (avatar._currentBubbleDiv && avatar._currentBubbleDiv === div) {
      div.style.transition = 'all 1.5s ease-out';
      div.style.transform = 'translate(-50%, -100%) translateY(-30px)';
      div.style.opacity = '0';
      setTimeout(() => {
        div.remove();
        avatar._bubbleDivs = avatar._bubbleDivs.filter(d => d !== div);
        if (avatar._currentBubbleDiv === div) avatar._currentBubbleDiv = null;
      }, 1600);
    }
  }, 60000);

  _bubbleProcessing = false;
  if (_bubbleQueue.length > 0) {
    processNextBubble();
  } else {
    if (S.hooks.onBubbleComplete) S.hooks.onBubbleComplete();
  }
}
