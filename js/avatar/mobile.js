// NVatar Avatar Lab — Mobile Bottom Sheet & Sheet Builders
import S from './state.js';
import { load } from './loader.js';
import { setEmotion, EXPR_EMOJI, EXPR_LABEL } from './emotion.js';
import { playMixamo, FBX_EMOJI } from './fbx.js';

let _sheetVrmData = null;

export function openSheet(type) {
  const backdrop = document.getElementById('bsBackdrop');
  const sheet = document.getElementById('bsSheet');
  const title = document.getElementById('bsTitle');
  const body = document.getElementById('bsBody');
  body.innerHTML = '';

  if (type === 'vrm') {
    title.textContent = '👤 VRM Models';
    buildSheetVrm(body);
  } else if (type === 'fbx') {
    title.textContent = '💃 Mixamo Animations';
    buildSheetFbx(body);
  } else if (type === 'emo') {
    title.textContent = '😊 Emotions';
    buildSheetEmo(body);
  }
  backdrop.classList.add('open');
  sheet.classList.add('open');
}

export function closeSheet() {
  document.getElementById('bsBackdrop').classList.remove('open');
  document.getElementById('bsSheet').classList.remove('open');
}

async function buildSheetVrm(body) {
  if (!_sheetVrmData) {
    body.innerHTML = '<small style="color:#888;">로딩중...</small>';
    try {
      const res = await fetch(S.API_BASE + '/api/v1/assets');
      const data = await res.json();
      _sheetVrmData = data.vrm || [];
    } catch(e) {
      body.innerHTML = '<small style="color:#f87171;">서버 연결 실패</small>';
      return;
    }
  }
  body.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'bs-vrm-grid';
  _sheetVrmData.forEach(v => {
    const item = document.createElement('div');
    item.className = 'bs-vrm-item';
    const alias = v.meta?.alias;
    const name = alias ? alias.ko : v.name.replace('.vrm','');
    const rawThumb = v.thumbnail || '';
    const thumbUrl = rawThumb.startsWith('/') ? S.API_BASE + rawThumb : rawThumb;
    item.innerHTML = thumbUrl
      ? `<img class="bs-vrm-thumb" src="${thumbUrl}" alt="${name}"><div>${name}</div>`
      : `<div style="width:100%;aspect-ratio:1;border-radius:6px;background:#334155;margin-bottom:4px;display:flex;align-items:center;justify-content:center;">👤</div><div>${name}</div>`;
    item.onclick = () => {
      grid.querySelectorAll('.bs-vrm-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      const vrmUrl = v.path.startsWith('/') ? S.API_BASE + v.path : v.path;
      load(vrmUrl);
      setTimeout(closeSheet, 300);
    };
    grid.appendChild(item);
  });
  body.appendChild(grid);
}

function buildSheetFbx(body) {
  const names = Object.keys(S.fbxClips).sort();
  if (names.length === 0) {
    body.innerHTML = '<small style="color:#888;">VRM을 먼저 로드하세요</small>';
    return;
  }
  const grid = document.createElement('div');
  grid.className = 'bs-fbx-grid';
  // Off button
  const offBtn = document.createElement('button');
  offBtn.className = 'bs-fbx-btn';
  offBtn.textContent = '⏹ Off';
  offBtn.onclick = () => {
    grid.querySelectorAll('.bs-fbx-btn').forEach(b => b.classList.remove('active'));
    offBtn.classList.add('active');
    playMixamo(null, document.querySelector('.fbx-btn'));
    setTimeout(closeSheet, 200);
  };
  grid.appendChild(offBtn);

  names.forEach(name => {
    const btn = document.createElement('button');
    btn.className = 'bs-fbx-btn';
    const prefix = name.split('_')[0] || '';
    const shortName = name.includes('_') ? name.split('_').slice(1).join('_') : name;
    const emoji = FBX_EMOJI[prefix] || '🎬';
    btn.textContent = emoji + ' ' + shortName;
    btn.onclick = () => {
      grid.querySelectorAll('.bs-fbx-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      playMixamo(name, document.querySelector('.fbx-btn'));
      setTimeout(closeSheet, 200);
    };
    grid.appendChild(btn);
  });
  body.appendChild(grid);
}

function buildSheetEmo(body) {
  if (!window._vrm?.expressionManager) {
    body.innerHTML = '<small style="color:#888;">VRM을 먼저 로드하세요</small>';
    return;
  }
  const exprNames = Object.keys(window._vrm.expressionManager.expressionMap || {});
  if (exprNames.length === 0) {
    body.innerHTML = '<small style="color:#888;">이 모델은 표정 없음</small>';
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
  if (!sorted.includes('neutral')) sorted.unshift('neutral');
  const grid = document.createElement('div');
  grid.className = 'bs-fbx-grid';
  sorted.forEach(name => {
    const btn = document.createElement('button');
    btn.className = 'bs-fbx-btn';
    const emoji = EXPR_EMOJI[name] || '🎭';
    const label = EXPR_LABEL[name] || name;
    btn.textContent = emoji + ' ' + label;
    btn.onclick = () => {
      grid.querySelectorAll('.bs-fbx-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setEmotion(name);
    };
    grid.appendChild(btn);
  });
  body.appendChild(grid);
}
