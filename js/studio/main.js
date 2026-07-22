// NVatar Studio — Recording PoC v1.5 (Evidence-driven Scenes)
//
// v1 → v1.5: scene 에 visual 필드 추가. 각 scene 마다 *증거*(DB 출력 / 코드 diff /
// 터미널 / 이미지) 를 스테이지에 띄우고 narration 이 그걸 설명. 글만 읽는 채널 아님.
//
// scene 스키마:
//   {
//     "caption": "큰 텍스트 (선택)",
//     "narration": "TTS 발화 (선택)",
//     "visual": {
//       "kind": "text" | "terminal" | "code" | "image",
//       "title": "패널 상단 헤더 (선택)",
//       "content": "텍스트 본문 (text/terminal/code)",
//       "url": "이미지 URL (image)"
//     }
//   }
//
// ⚠️ PoC 단계 — visual.content 는 *재현된* 출력. 프로덕션에선 실제 캡처(screenshot,
// `git show 03168c6`, `mysql -e ...` 결과) 로 교체 권장. 구조만 먼저 검증.

import { MiniPortrait } from '../sdk/portrait-mini.js';
import { synth, synthArrayBuffer, API_BASE } from './tts.js';
import { Recorder } from './recorder.js';

const RES_BASE = 'https://nvatar-res.nskit.io';
const DEFAULT_VOICE_INDEX = 4;

const STAGE_W = 1280;
const STAGE_H = 720;
const PORTRAIT_SIZE = 180;
const PORTRAIT_MARGIN = 28;
const PORTRAIT_X = STAGE_W - PORTRAIT_SIZE - PORTRAIT_MARGIN;
const PORTRAIT_Y = STAGE_H - PORTRAIT_SIZE - PORTRAIT_MARGIN;

// ---------- 로깅 (밀리초 timestamp 포함, recorder log 에서 timing 분석용) ----------
const _t0 = performance.now();
const statusEl = document.getElementById('status');
function log(msg) {
  const t = new Date().toLocaleTimeString();
  const ms = (performance.now() - _t0).toFixed(0).padStart(6, ' ');
  if (statusEl) {
    statusEl.textContent += `[${t}] ${msg}\n`;
    statusEl.scrollTop = statusEl.scrollHeight;
  }
  console.log(`[studio][+${ms}ms] ${msg}`);
}

// ---------- portrait ----------
const portrait = new MiniPortrait({ size: PORTRAIT_SIZE });
window.portrait = portrait;

// ---------- stage canvas ----------
const stageCanvas = document.getElementById('stageCanvas');
stageCanvas.width = STAGE_W;
stageCanvas.height = STAGE_H;
const stageCtx = stageCanvas.getContext('2d');
window.stageCanvas = stageCanvas;

let currentScene = { caption: '', narration: '', visual: null };
let sceneIndex = 0;
let sceneTotal = 0;

function updateSceneIndicator() {
  const el = document.getElementById('sceneIndicator');
  if (el) el.textContent = `${STAGE_W}×${STAGE_H} · scene ${sceneIndex || '-'}/${sceneTotal || '-'}`;
}

// ---------- 텍스트 wrap (Korean char-by-char) ----------
function wrapText(ctx, text, maxWidth) {
  if (!text) return [];
  const lines = [];
  let cur = '';
  for (const ch of text) {
    if (ch === '\n') { lines.push(cur); cur = ''; continue; }
    const test = cur + ch;
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur); cur = ch;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawCenteredWrapped(ctx, text, cx, cy, maxWidth, lineHeight) {
  const lines = wrapText(ctx, text, maxWidth);
  const totalH = lines.length * lineHeight;
  const startY = cy - totalH / 2 + lineHeight / 2;
  for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], cx, startY + i * lineHeight);
}

function drawWrappedLeft(ctx, text, x, y, maxWidth, lineHeight) {
  const lines = wrapText(ctx, text, maxWidth);
  for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], x, y + i * lineHeight);
}

// ---------- 둥근 사각형 ----------
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ---------- 이미지 preload ----------
const _imgCache = new Map();
function preloadImage(url) {
  if (_imgCache.has(url)) return _imgCache.get(url);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  const promise = new Promise((resolve, reject) => {
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
  });
  img.src = url;
  const entry = { img, promise };
  _imgCache.set(url, entry);
  return entry;
}

// ---------- visual 렌더 (text / terminal / code / image) ----------
function renderVisual(ctx, visual, x, y, w, h) {
  // panel
  ctx.fillStyle = '#0a0f1a';
  roundRect(ctx, x, y, w, h, 12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(99,102,241,0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  let contentTop = y + 24;
  if (visual.title) {
    ctx.fillStyle = '#a5b4fc';
    ctx.font = '18px Menlo, Consolas, "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(visual.title, x + 24, y + 16);
    contentTop = y + 56;
    ctx.strokeStyle = 'rgba(99,102,241,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 16, y + 46);
    ctx.lineTo(x + w - 16, y + 46);
    ctx.stroke();
  }

  if (visual.kind === 'image' && visual.url) {
    const entry = _imgCache.get(visual.url);
    if (entry && entry.img.complete && entry.img.naturalWidth > 0) {
      const availW = w - 32;
      const availH = h - (contentTop - y) - 16;
      const ar = entry.img.naturalWidth / entry.img.naturalHeight;
      let drawW = availW, drawH = availW / ar;
      if (drawH > availH) { drawH = availH; drawW = availH * ar; }
      const dx = x + (w - drawW) / 2;
      const dy = contentTop + (availH - drawH) / 2;
      ctx.drawImage(entry.img, dx, dy, drawW, drawH);
    } else {
      ctx.fillStyle = '#475569';
      ctx.font = '16px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('[image loading…]', x + w / 2, y + h / 2);
    }
  } else if (visual.kind === 'code' || visual.kind === 'terminal') {
    const fontSize = visual.fontSize || 20;
    ctx.font = `${fontSize}px Menlo, Consolas, "Courier New", monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const lineH = fontSize * 1.4;
    const lines = (visual.content || '').split('\n');
    const padX = 24;
    let lineY = contentTop;
    const bottom = y + h - 12;
    for (const line of lines) {
      if (lineY + lineH > bottom) break;
      let color = '#e2e8f0';
      if (visual.kind === 'terminal') {
        if (/^\$ /.test(line)) color = '#a5b4fc';                      // 프롬프트
        else if (/^→|^\+|^\|\s/.test(line)) color = '#cbd5e1';
        else if (/^[─+|]/.test(line)) color = '#475569';                // 테이블 보더
      }
      if (visual.kind === 'code') {
        if (/^\s*(\/\/|#|--).*/.test(line)) color = '#64748b';          // 주석
        else if (/^\+/.test(line)) color = '#86efac';                   // diff +
        else if (/^-/.test(line)) color = '#fca5a5';                    // diff -
      }
      ctx.fillStyle = color;
      ctx.fillText(line, x + padX, lineY);
      lineY += lineH;
    }
  } else {
    // text — 중앙 정렬 큰 글씨
    ctx.font = '28px -apple-system, "Apple SD Gothic Neo", "Pretendard", sans-serif';
    ctx.fillStyle = '#e2e8f0';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cy = (contentTop + (y + h)) / 2;
    drawCenteredWrapped(ctx, visual.content || '', x + w / 2, cy, w - 64, 40);
  }
}

// ---------- composite loop ----------
// 진단용 — 현재 그려진 scene 의 시그니처. 변경 시마다 로그 → audio 시작 시점과 비교 가능.
let _renderedSceneSig = '__init__';
function _trackRenderedSceneChange() {
  const sig = (currentScene.caption || '') + '|' + (currentScene.visual?.title || '') + '|' + (currentScene.narration || '').slice(0, 16);
  if (sig !== _renderedSceneSig) {
    _renderedSceneSig = sig;
    console.log(`[studio] ⊙ canvas render: ${(currentScene.caption || '(empty)').slice(0, 30)}`);
  }
}

(function composeStageLoop() {
  _trackRenderedSceneChange();
  stageCtx.fillStyle = '#0f172a';
  stageCtx.fillRect(0, 0, STAGE_W, STAGE_H);

  // accent bar
  stageCtx.fillStyle = 'rgba(99,102,241,0.5)';
  stageCtx.fillRect(40, 56, 4, 60);

  const hasVisual = currentScene.visual && currentScene.visual.kind;

  if (hasVisual) {
    // caption top (small)
    if (currentScene.caption) {
      stageCtx.fillStyle = '#f8fafc';
      stageCtx.font = 'bold 44px -apple-system, "Apple SD Gothic Neo", sans-serif';
      stageCtx.textAlign = 'left';
      stageCtx.textBaseline = 'top';
      stageCtx.fillText(currentScene.caption, 64, 56);
    }
    // visual middle
    renderVisual(stageCtx, currentScene.visual, 60, 140, STAGE_W - 120, 340);
    // narration bottom-left
    if (currentScene.narration) {
      stageCtx.fillStyle = 'rgba(226,232,240,0.92)';
      stageCtx.font = '26px -apple-system, "Apple SD Gothic Neo", sans-serif';
      stageCtx.textAlign = 'left';
      stageCtx.textBaseline = 'top';
      drawWrappedLeft(stageCtx, currentScene.narration, 60, 510, STAGE_W - 280, 38);
    }
  } else {
    // visual 없을 때: 큰 caption 중앙 + 작은 narration 하단
    if (currentScene.caption) {
      stageCtx.fillStyle = '#f8fafc';
      stageCtx.font = 'bold 84px -apple-system, "Apple SD Gothic Neo", sans-serif';
      stageCtx.textAlign = 'center';
      stageCtx.textBaseline = 'middle';
      drawCenteredWrapped(stageCtx, currentScene.caption, STAGE_W / 2, STAGE_H * 0.38, STAGE_W - 280, 100);
    }
    if (currentScene.narration) {
      stageCtx.fillStyle = 'rgba(226,232,240,0.92)';
      stageCtx.font = '30px -apple-system, "Apple SD Gothic Neo", sans-serif';
      stageCtx.textAlign = 'left';
      stageCtx.textBaseline = 'top';
      drawWrappedLeft(stageCtx, currentScene.narration, 64, STAGE_H - 160, STAGE_W - 280, 42);
    }
  }

  // portrait
  stageCtx.save();
  stageCtx.beginPath();
  stageCtx.arc(PORTRAIT_X + PORTRAIT_SIZE / 2, PORTRAIT_Y + PORTRAIT_SIZE / 2, PORTRAIT_SIZE / 2, 0, Math.PI * 2);
  stageCtx.clip();
  stageCtx.fillStyle = '#1e293b';
  stageCtx.fillRect(PORTRAIT_X, PORTRAIT_Y, PORTRAIT_SIZE, PORTRAIT_SIZE);
  stageCtx.drawImage(portrait.canvas, PORTRAIT_X, PORTRAIT_Y, PORTRAIT_SIZE, PORTRAIT_SIZE);
  stageCtx.restore();

  stageCtx.strokeStyle = 'rgba(99,102,241,0.6)';
  stageCtx.lineWidth = 3;
  stageCtx.beginPath();
  stageCtx.arc(PORTRAIT_X + PORTRAIT_SIZE / 2, PORTRAIT_Y + PORTRAIT_SIZE / 2, PORTRAIT_SIZE / 2, 0, Math.PI * 2);
  stageCtx.stroke();

  requestAnimationFrame(composeStageLoop);
})();

log(`Studio v1.5 ready · ${STAGE_W}×${STAGE_H} · API=${API_BASE}`);
updateSceneIndicator();

// ---------- 기본 시나리오 (EP-007 evidence-driven) ----------
const DEFAULT_SCENARIO = [
  {
    "caption": "라이브에서 65건 묵음",
    "visual": {
      "kind": "text",
      "title": "보고",
      "content": "한류 아이돌 이름 매칭이 안 됩니다.\n65건 K-culture 보너스 못 받는 중."
    },
    "narration": "어제까지 우리 작명 서비스 라이브에서, 65건이 묵음이었습니다."
  },
  {
    "caption": "보조 에이전트 주장",
    "visual": {
      "kind": "text",
      "title": "subagent",
      "content": "→ \"K-culture 데이터가 라이브에 INSERT 안 됐습니다.\"\n→ \"jp_kculture_name 테이블 비어있을 가능성.\""
    },
    "narration": "보조 에이전트는 데이터가 라이브에 없다고 보고했어요. 검증부터."
  },
  {
    "caption": "DB 직접 확인 → 131건 다 있음",
    "visual": {
      "kind": "terminal",
      "title": "newmyoung-api DB",
      "content": "$ mysql -e 'SELECT count(*), sum(active)\n             FROM jp_kculture_name;'\n\n+----------+-------------+\n| count(*) | sum(active) |\n+----------+-------------+\n|      131 |         131 |\n+----------+-------------+"
    },
    "narration": "DB를 열어 보니 131건 다 있습니다. 에이전트 주장 틀림."
  },
  {
    "caption": "진짜 원인 — 데이터 형태",
    "visual": {
      "kind": "terminal",
      "title": "japaneseReading 샘플",
      "content": "$ SELECT japaneseReading FROM jp_kculture_name LIMIT 5;\n\n  キム・テヒョン      ← 성·이름 형태\n  パク・ジミン       ← 매칭은 통째 검색\n  チョン・グク       ← 65건이 묵음\n  ミナ              ← 이름만 형태는 OK\n  ユナ"
    },
    "narration": "데이터는 성 이름으로 들어갔는데 매칭은 통째 검색이라, 65건이 묵음이었던 거죠."
  },
  {
    "caption": "코드 한 곳",
    "visual": {
      "kind": "code",
      "title": "JpNameService.java :: loadKcultureCache",
      "content": "for (var r : rows) {\n  String reading = katakanaToHiragana(r.japaneseReading);\n  kcultureSet.add(reading);\n+ // 성·이름 형태면 이름만 별도 등록\n+ if (reading.contains(\"・\")) {\n+   String[] parts = reading.split(\"[・\\\\s]+\");\n+   if (parts.length >= 2) {\n+     String given = parts[parts.length - 1];\n+     if (given.length() >= 2) kcultureSet.add(given);\n+   }\n+ }\n}"
    },
    "narration": "DB 수정 보류. 코드 한 곳. 마지막 토큰만 별도 등록하는 십 줄."
  },
  {
    "caption": "9% → 100%, false positive 0",
    "visual": {
      "kind": "terminal",
      "title": "python sim — 라이브 DB 131건 기반 Before/After",
      "content": "$ python sim_kculture.py\n\n                  Before     After\n  cache entries    118        176     (+58)\n  대표 15 매칭     3/15       13/15   (+10)\n  성·이름 커버     9%         100%\n  false positive   0          0       ✓"
    },
    "narration": "Python으로 라이브 DB 131건 기반 시뮬레이션. 매칭률 9퍼센트에서 100퍼센트. False positive 0."
  },
  {
    "caption": "결정 다섯 개",
    "visual": {
      "kind": "terminal",
      "title": "git log --oneline -2",
      "content": "$ git log --oneline -2\n\n03168c6 fix(jp): K-culture 매칭에서 성·이름 엔트리\n        이름 부분 분리 등록\nac9e5e2 fix: 골든타임 자시 midnight-crossing\n\n# 5단 결정:\n#  1. 에이전트 주장 보류 → 검증부터\n#  2. DB 안 건드림\n#  3. 코드 한 곳\n#  4. Python 시뮬로 Before/After\n#  5. 커밋"
    },
    "narration": "에이전트 주장은 보류. DB는 건드리지 않음. 코드는 한 곳. 검증은 시뮬레이션. 그리고 커밋."
  }
];

// textarea 초기 채움
const scenarioTextarea = document.getElementById('scenarioJson');
if (scenarioTextarea && !scenarioTextarea.value.trim()) {
  scenarioTextarea.value = JSON.stringify(DEFAULT_SCENARIO, null, 2);
}
window.studioLoadDefaultScenario = function () {
  scenarioTextarea.value = JSON.stringify(DEFAULT_SCENARIO, null, 2);
  log('기본 시나리오 로드 (EP-007 evidence-driven)');
};

// ---------- voice select ----------
(async function initVoices() {
  try {
    const r = await fetch(`${API_BASE}/api/v1/tts/voices`);
    const d = await r.json();
    const voices = d.voices || [];
    const sel = document.getElementById('voiceSelect');
    sel.innerHTML = '';
    voices.forEach((v, i) => {
      const opt = document.createElement('option');
      opt.value = v.voice_id;
      opt.textContent = `${i + 1}. ${v.display_name}`;
      sel.appendChild(opt);
    });
    if (voices[DEFAULT_VOICE_INDEX]) {
      sel.value = voices[DEFAULT_VOICE_INDEX].voice_id;
      log(`Voices ${voices.length}개, default = ${DEFAULT_VOICE_INDEX + 1}. ${voices[DEFAULT_VOICE_INDEX].display_name}`);
    }
  } catch (e) {
    log(`Voices 로드 실패: ${e?.message || e}`);
  }
})();

// ---------- VRM ----------
async function resolveVrmUrl(uidOrCharCode) {
  const r = await fetch(`${RES_BASE}/api/v1/vrm/resolve/${encodeURIComponent(uidOrCharCode)}`);
  if (!r.ok) throw new Error(`resolve HTTP ${r.status}`);
  const d = await r.json();
  if (d.code !== 200 || !d.model?.url) throw new Error('resolve: no model.url');
  const path = d.model.url;
  return /^https?:/i.test(path) ? path : RES_BASE + (path.startsWith('/') ? '' : '/') + path;
}

const MOUTH_KEYS = ['aa', 'A', 'a', 'oh', 'O'];

window.studioLoadVRM = async function () {
  const raw = (document.getElementById('vrmUrl')?.value || '').trim();
  if (!raw) { log('VRM uid/url 입력 필요'); return; }
  log(`Loading: ${raw}…`);
  try {
    const vrmUrl = /^https?:/i.test(raw) ? raw : await resolveVrmUrl(raw);
    if (vrmUrl !== raw) log(`Resolved → ${vrmUrl}`);
    await portrait.loadVrm(vrmUrl);
    const allKeys = Object.keys(portrait.vrm?.expressionManager?.expressionMap || {});
    const mouthKeys = allKeys.filter(k => MOUTH_KEYS.includes(k));
    log(`VRM loaded ✓ · mouth=[${mouthKeys.join(',') || 'NONE'}]`);
  } catch (e) {
    log(`VRM load failed: ${e?.message || e}`);
  }
};

window.studioPickRandomVRM = async function () {
  try {
    const r = await fetch(`${RES_BASE}/api/v1/vrm/models?active_only=true`);
    const d = await r.json();
    const list = d.models || [];
    if (!list.length) return;
    const pick = list[Math.floor(Math.random() * list.length)];
    document.getElementById('vrmUrl').value = pick.char_code || pick.uid;
    log(`Picked: ${pick.name}`);
    window.studioLoadVRM();
  } catch (e) { log(`Pick failed: ${e?.message || e}`); }
};

// ---------- Sino-Korean 숫자 ----------
const _SINO_DIGITS = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
const _SINO_UNITS_4 = ['', '십', '백', '천'];
const _SINO_BIG_UNITS = ['', '만', '억', '조'];
function toSinoKorean(n) {
  if (n === 0) return '영';
  if (n < 0) return '마이너스 ' + toSinoKorean(-n);
  const parts = []; let bigIdx = 0;
  while (n > 0) {
    const four = n % 10000;
    if (four > 0) {
      const s = String(four).padStart(4, '0');
      let chunk = '';
      for (let i = 0; i < 4; i++) {
        const d = parseInt(s[i], 10);
        if (d === 0) continue;
        const u = _SINO_UNITS_4[3 - i];
        if (d === 1 && u) chunk += u; else chunk += _SINO_DIGITS[d] + u;
      }
      parts.unshift(chunk + _SINO_BIG_UNITS[bigIdx]);
    }
    n = Math.floor(n / 10000); bigIdx++;
  }
  return parts.join('');
}
// 영어 단어 → 한국어 standard reading 사전 (ElevenLabs 가 phonetic 으로만 읽어 어색한 경우)
const READING_DICT = {
  'Python': '파이썬', 'python': '파이썬',
  'JavaScript': '자바스크립트', 'javascript': '자바스크립트',
  'TypeScript': '타입스크립트', 'typescript': '타입스크립트',
  'Java': '자바', 'java': '자바',
  'Node': '노드', 'node': '노드',
  'React': '리액트', 'react': '리액트',
  'Vue': '뷰',
  'Docker': '도커', 'docker': '도커',
  'Kubernetes': '쿠버네티스',
  'GitHub': '깃허브', 'github': '깃허브',
  'GitLab': '깃랩',
  'NSKit': '엔에스킷', 'nskit': '엔에스킷',
  'NVatar': '엔바타', 'nvatar': '엔바타',
};

function applyReadingDict(text) {
  for (const [en, ko] of Object.entries(READING_DICT)) {
    // word-boundary 매칭 (한글 옆에서도 깔끔하게 잡힘)
    text = text.replace(new RegExp(`\\b${en}\\b`, 'g'), ko);
  }
  return text;
}

function preprocessForKoreanTTS(text) {
  // 1) 영어 단어 사전 치환
  text = applyReadingDict(text);
  // 2) 숫자 → Sino-Korean
  return text.replace(/\d+(?:\.\d+)?/g, (m) => {
    if (/\./.test(m)) {
      const [int, frac] = m.split('.');
      if (int.length > 7) return m;
      return toSinoKorean(parseInt(int, 10)) + ' 점 ' + [...frac].map(d => _SINO_DIGITS[+d] || '영').join(' ');
    }
    if (m.length > 7) return m;
    return toSinoKorean(parseInt(m, 10));
  });
}
window.preprocessForKoreanTTS = preprocessForKoreanTTS;

// ---------- lipsync ----------
function findMouthKey(vrm) {
  const map = vrm?.expressionManager?.expressionMap || {};
  return MOUTH_KEYS.find(k => map[k]) || null;
}
let lipRAF = null, lipValue = 0;
function startLipsync(analyser, vrm) {
  if (!vrm?.expressionManager) return;
  const key = findMouthKey(vrm); if (!key) return;
  const buf = new Uint8Array(analyser.fftSize); lipValue = 0;
  const em = vrm.expressionManager;
  function tick() {
    analyser.getByteTimeDomainData(buf);
    let s = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; s += v * v; }
    const rms = Math.sqrt(s / buf.length);
    const target = Math.min(0.9, rms * 4.0);
    lipValue += (target - lipValue) * 0.5;
    em.setValue(key, Math.max(0, Math.min(1, lipValue)));
    lipRAF = requestAnimationFrame(tick);
  }
  tick();
}
function stopLipsync(vrm) {
  if (lipRAF) { cancelAnimationFrame(lipRAF); lipRAF = null; }
  const key = vrm ? findMouthKey(vrm) : null;
  if (key && vrm?.expressionManager) vrm.expressionManager.setValue(key, 0);
  lipValue = 0;
}

// ---------- shared AudioContext ----------
let audioCtx = null, recorderDest = null;
function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    recorderDest = audioCtx.createMediaStreamDestination();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return { ctx: audioCtx, recDest: recorderDest };
}

// ---------- speak ----------
let currentAudio = null;

// audio 끝난 후 짧은 무음 (AudioBufferSourceNode 경로엔 큰 tail 필요 없음).
const TTS_TAIL_SILENCE_MS = 300;
// 슬라이드 진입 → audio 시작까지의 호흡. 시청자가 슬라이드를 먼저 인지하고 TTS 가 따라옴.
// 400ms → 사용자 보고 시 짧다고 판단됨 → 1000ms 로 bump (canvas captureStream 의 frame 샘플링 lag 고려).
const SLIDE_LEAD_MS = 1000;

// 구조: prepareSpeak (fetch+decode, 이전 슬라이드 유지) → 호출자가 slide 전환 + slide-lead →
// speakAndAwait (start + onended + tail). 시각이 leading, 음성이 따라옴.
let currentSrcNode = null;

async function prepareSpeak(text) {
  if (!portrait.vrm) throw new Error('VRM not loaded');
  const voiceId = document.getElementById('voiceSelect')?.value || null;
  const processed = preprocessForKoreanTTS(text);
  log(`▷ ${processed.slice(0, 60)}${processed.length > 60 ? '…' : ''}`);

  let arrayBuf;
  try { arrayBuf = await synthArrayBuffer(processed, { voiceId }); }
  catch (e) { log(`  ❌ fetch failed: ${e?.message || e}`); throw e; }

  const { ctx, recDest } = ensureAudio();
  let buffer;
  try { buffer = await ctx.decodeAudioData(arrayBuf.slice(0)); }
  catch (e) { log(`  ❌ decode failed: ${e?.message || e}`); throw e; }

  const srcNode = ctx.createBufferSource();
  srcNode.buffer = buffer;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.3;
  srcNode.connect(analyser);
  analyser.connect(ctx.destination);
  analyser.connect(recDest);

  log(`  · ready · ${buffer.duration.toFixed(2)}s · ${arrayBuf.byteLength} bytes`);
  return { srcNode, analyser, expectedSec: buffer.duration };
}

async function speakAndAwait(prep) {
  const { srcNode, analyser, expectedSec } = prep;
  currentSrcNode = srcNode;
  return new Promise((resolve) => {
    let settled = false;
    const t0 = performance.now();
    const done = (reason) => {
      if (settled) return;
      settled = true;
      stopLipsync(portrait.vrm);
      try { srcNode.disconnect(); } catch {}
      try { analyser.disconnect(); } catch {}
      currentSrcNode = null;
      if (reason === 'ended') {
        const elapsed = ((performance.now() - t0) / 1000).toFixed(2);
        log(`  ✓ ended (${elapsed}s, expected ${expectedSec.toFixed(2)}s)`);
        setTimeout(resolve, TTS_TAIL_SILENCE_MS);
      } else {
        log(`  ⚠ ${reason}`);
        resolve();
      }
    };
    srcNode.onended = () => done('ended');
    setTimeout(() => done('timeout'), Math.max(15000, expectedSec * 2000 + 5000));
    try {
      srcNode.start();
      log(`  · start()`);
      startLipsync(analyser, portrait.vrm);
    } catch (e) {
      log(`  ❌ start failed: ${e?.message || e}`);
      done('start failed');
    }
  });
}

window.studioSpeak = async function () {
  const text = (document.getElementById('ttsText')?.value || '').trim();
  if (!text) { log('텍스트 없음'); return; }
  if (!portrait.vrm) { log('VRM 먼저 로드'); return; }
  window.studioStopTTS();
  try {
    // prepare → slide change → slide-lead → speak
    const prep = await prepareSpeak(text);
    currentScene = { caption: '', narration: text, visual: null };
    await sleep(SLIDE_LEAD_MS);
    await speakAndAwait(prep);
  } catch (e) { log(`Speak failed: ${e?.message || e}`); }
};
window.studioStopTTS = function () {
  if (currentSrcNode) {
    try { currentSrcNode.stop(); } catch {}
    try { currentSrcNode.disconnect(); } catch {}
    currentSrcNode = null;
  }
  if (currentAudio) { try { currentAudio.pause(); } catch {} currentAudio = null; }
  if (portrait.vrm) stopLipsync(portrait.vrm);
};
window.studioTestMouth = function () {
  if (!portrait.vrm) { log('VRM 먼저 로드'); return; }
  const key = findMouthKey(portrait.vrm);
  if (!key) { log(`mouth 키 없음. keys: ${Object.keys(portrait.vrm.expressionManager?.expressionMap || {}).join(', ')}`); return; }
  log(`Test mouth — '${key}' 1초 열기`);
  const em = portrait.vrm.expressionManager;
  em.setValue(key, 0.8); em.update();
  setTimeout(() => { em.setValue(key, 0); em.update(); }, 1000);
};

// ---------- scenario runner ----------
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
let scenarioCancelled = false, scenarioRunning = false;

async function preloadScenarioAssets(scenes) {
  const urls = scenes.map(s => s.visual?.url).filter(u => u);
  if (!urls.length) return;
  log(`이미지 ${urls.length}개 preload…`);
  await Promise.all(urls.map(u => preloadImage(u).promise.catch(e => log(`preload fail: ${u}`))));
}

const FINALIZE_SCENE = {
  caption: '',
  visual: {
    kind: 'text',
    title: '',
    content: '한 사람과 AI 가 함께 내린 결정들과,\n그 결정들이 만들어낸 작품들.'
  },
  narration: ''
};
const FINALIZE_DWELL_MS = 3000;

async function runScenario(scenes, opts = {}) {
  // 진행 hierarchy: scene 전환이 leading, TTS 가 그걸 보조 (slide-lead 후 시작).
  //   per scene with narration:
  //     1) prepareSpeak (이전 슬라이드 유지하며 fetch+decode, 사용자는 변화 없음)
  //     2) currentScene 갱신 — slide visibly 바뀜 (leading event)
  //     3) sleep(SLIDE_LEAD_MS) — 슬라이드 안정적으로 그려지고 시청자가 인지할 호흡
  //     4) speakAndAwait — TTS 가 slide 를 따라 시작
  const slideLeadMs = opts.slideLead ?? SLIDE_LEAD_MS;
  const silentDwell = opts.silentDwell ?? 3000;
  const useFinalize = opts.finalize !== false;
  scenarioCancelled = false; scenarioRunning = true;
  sceneTotal = scenes.length + (useFinalize ? 1 : 0);
  await preloadScenarioAssets(scenes);
  log(`🎬 Scenario start — ${scenes.length} scenes${useFinalize ? ' + finalize' : ''} · slide-lead=${slideLeadMs}ms`);

  for (let i = 0; i < scenes.length; i++) {
    if (scenarioCancelled) { log('🛑 cancelled'); break; }
    sceneIndex = i + 1;
    const sc = scenes[i] || {};
    const sceneData = {
      caption: sc.caption || '',
      narration: sc.narration || '',
      visual: sc.visual || null,
    };
    log(`▶ Scene ${sceneIndex}/${sceneTotal}: ${(sceneData.caption || '').slice(0, 32)}`);

    if (sceneData.narration) {
      // 1) Prepare audio (이전 슬라이드 유지)
      let prep;
      try { prep = await prepareSpeak(sceneData.narration); }
      catch (e) {
        log(`Scene ${sceneIndex} prep error: ${e?.message || e}`);
        currentScene = sceneData; updateSceneIndicator();
        await sleep(silentDwell);
        continue;
      }
      if (scenarioCancelled) break;

      // 2) Scene 전환 (LEADING — 슬라이드 visibly 바뀜)
      log(`  ⇢ currentScene = scene ${sceneIndex}`);
      currentScene = sceneData;
      updateSceneIndicator();

      // 2.5) 다음 RAF 2 프레임 대기 — canvas 가 실제로 새 슬라이드 그릴 시간 확보
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      log(`  ⇢ after 2 RAF (canvas should be painted)`);

      // 3) Slide-lead — 시청자가 슬라이드를 인지할 호흡
      await sleep(slideLeadMs);
      log(`  ⇢ slide-lead ${slideLeadMs}ms done → about to start audio`);
      if (scenarioCancelled) break;

      // 4) TTS 가 slide 를 보조 — start
      try { await speakAndAwait(prep); }
      catch (e) { log(`Scene ${sceneIndex} play error: ${e?.message || e}`); }
    } else {
      // narration 없는 scene — 즉시 슬라이드 + dwell
      currentScene = sceneData;
      updateSceneIndicator();
      await sleep(silentDwell);
    }
    if (scenarioCancelled) break;
  }
  // finalize scene
  if (useFinalize && !scenarioCancelled) {
    sceneIndex = scenes.length + 1;
    currentScene = opts.finalizeScene || FINALIZE_SCENE;
    updateSceneIndicator();
    log(`▶ Finalize (${FINALIZE_DWELL_MS / 1000}s dwell)`);
    await sleep(FINALIZE_DWELL_MS);
  }
  scenarioRunning = false;
  sceneIndex = 0;
  updateSceneIndicator();
  if (!scenarioCancelled) log(`✅ Scenario complete (${scenes.length} scenes${useFinalize ? ' + finalize' : ''})`);
}

window.studioRunScenario = function () {
  if (scenarioRunning) { log('이미 진행 중'); return; }
  if (!portrait.vrm) { log('VRM 먼저 로드'); return; }
  const text = document.getElementById('scenarioJson')?.value || '';
  let scenes;
  try { scenes = JSON.parse(text); if (!Array.isArray(scenes)) throw new Error('not array'); }
  catch (e) { log(`scenario JSON parse failed: ${e?.message || e}`); return; }
  runScenario(scenes).catch(e => log(`crashed: ${e?.message || e}`));
};

window.studioStopScenario = function () {
  scenarioCancelled = true;
  window.studioStopTTS();
  log('scenario stop 요청');
};

// ---------- recorder ----------
const recorder = new Recorder();
const recBtn = document.getElementById('recBtn');
const dlBtn = document.getElementById('dlBtn');

window.studioToggleRecord = async function () {
  if (!recorder.isRecording()) {
    if (!portrait.vrm) { log('VRM 먼저 로드'); return; }
    const { recDest } = ensureAudio();
    try {
      await recorder.start(stageCanvas, recDest.stream, 30);
      if (recBtn) { recBtn.textContent = '⏹ Stop Recording'; recBtn.classList.add('danger'); }
      if (dlBtn) dlBtn.disabled = true;
      log(`Recording… ${STAGE_W}×${STAGE_H}@30fps`);
    } catch (e) { log(`Record start failed: ${e?.message || e}`); }
  } else {
    try {
      const blob = await recorder.stop();
      if (recBtn) { recBtn.textContent = '⏺ Record'; recBtn.classList.remove('danger'); }
      if (dlBtn) dlBtn.disabled = false;
      const sec = ((performance.now() - recorder.startedAt) / 1000).toFixed(1);
      log(`Stopped — ${(blob.size / 1024).toFixed(1)} KB · ${sec}s`);
    } catch (e) { log(`Stop failed: ${e?.message || e}`); }
  }
};

window.studioDownload = function () {
  if (!recorder?.lastBlob) { log('녹화 없음'); return; }
  const url = URL.createObjectURL(recorder.lastBlob);
  const a = document.createElement('a');
  a.href = url; a.download = `nvatar-studio-${Date.now()}.webm`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  log('Downloaded');
};

log('Steps: [로드] → [⏺ Record] → [▶ Run Scenario] → [⏹] → [⬇]');
