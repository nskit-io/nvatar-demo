// NVatar Avatar Lab — Floating Face Portrait (auto expression cycle)
import * as THREE from 'three';
import S from './state.js';

let _renderer = null;
let _camera = null;
let _canvas = null;
let _active = false;
let _camDist = 1.1;  // auto-focused distance
let _camYOff = 0.25;
let _lookYOff = 0.08;
let _measured = false;
let _cycleTimer = 0;
let _currentExpr = 'neutral';
let _targetExpr = 'neutral';
let _blendProgress = 1; // 1 = fully transitioned
const CYCLE_INTERVAL = 2.5; // seconds
const BLEND_SPEED = 3.0; // blend per second

const SKIP_EXPRS = new Set([
  'blink', 'blinkLeft', 'blinkRight',
  'lookUp', 'lookDown', 'lookLeft', 'lookRight',
  'aa', 'ih', 'ou', 'ee', 'oh', // visemes
  'a', 'i', 'u', 'e', 'o',
]);

function _initDrag(el, bounds) {
  let dragging = false, startX, startY, origLeft, origTop;

  const onStart = (x, y) => {
    dragging = true;
    startX = x; startY = y;
    origLeft = el.offsetLeft;
    origTop = el.offsetTop;
    el.style.transition = 'none';
  };
  const onMove = (x, y) => {
    if (!dragging) return;
    const dx = x - startX, dy = y - startY;
    const maxL = bounds.clientWidth - el.offsetWidth;
    const maxT = bounds.clientHeight - el.offsetHeight;
    el.style.left = Math.max(0, Math.min(maxL, origLeft + dx)) + 'px';
    el.style.top = Math.max(0, Math.min(maxT, origTop + dy)) + 'px';
  };
  const onEnd = () => { dragging = false; };

  const stop = (e) => { e.stopPropagation(); e.preventDefault(); };

  // Mouse — stopPropagation blocks OrbitControls underneath
  el.addEventListener('mousedown', (e) => { stop(e); onStart(e.clientX, e.clientY); });
  el.addEventListener('mousemove', stop);
  el.addEventListener('wheel', stop, { passive: false });
  window.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
  window.addEventListener('mouseup', onEnd);

  // Touch
  el.addEventListener('touchstart', (e) => { e.stopPropagation(); const t = e.touches[0]; onStart(t.clientX, t.clientY); });
  el.addEventListener('touchmove', (e) => { e.stopPropagation(); if (!dragging) return; const t = e.touches[0]; onMove(t.clientX, t.clientY); });
  window.addEventListener('touchend', onEnd);
}

/**
 * initPortrait(options)
 * @param {Object} opts
 * @param {HTMLElement} opts.container  - 부모 요소 (기본: #viewer)
 * @param {number}      opts.size      - CSS px 크기 (기본: 256)
 * @param {number}      opts.round     - border-radius px (기본: size/2 = 원형)
 *                                       size=72, round=36 → 원형
 *                                       size=72, round=12 → 라운드 사각
 *                                       size=72, round=0  → 정사각
 * @param {boolean}     opts.label     - 표정 라벨 표시 (기본: true)
 * @param {boolean}     opts.autoShow  - VRM 로드 시 자동 표시 (기본: true)
 */
let _opts = {};

export function initPortrait(opts = {}) {
  const sz = opts.size ?? 256;
  _opts = {
    size: sz,
    round: opts.round ?? Math.floor(sz / 2),
    label: opts.label ?? true,
    autoShow: opts.autoShow ?? true,
  };
  const container = opts.container || document.getElementById('viewer');
  if (!container) return;

  const canvasSz = sz * 2; // retina 2x
  const radius = _opts.round + 'px';

  // Wrapper
  const wrap = document.createElement('div');
  wrap.id = 'portraitWrap';
  wrap.style.cssText = `position:absolute;top:14px;left:14px;z-index:60;width:${sz}px;height:${sz}px;border-radius:${radius};overflow:hidden;border:2px solid rgba(99,102,241,0.5);background:#0f172a;box-shadow:0 4px 20px rgba(0,0,0,0.5);display:none;cursor:pointer;`;
  wrap.title = 'Face Portrait';

  _canvas = document.createElement('canvas');
  _canvas.width = canvasSz;
  _canvas.height = canvasSz;
  _canvas.style.cssText = 'width:100%;height:100%;display:block;';
  wrap.appendChild(_canvas);

  // Expression label
  if (_opts.label) {
    const labelFontSize = sz >= 128 ? '13px' : '9px';
    const labelPad = sz >= 128 ? '4px' : '1px';
    const label = document.createElement('div');
    label.id = 'portraitLabel';
    label.style.cssText = `position:absolute;bottom:0;left:0;right:0;text-align:center;font-size:${labelFontSize};color:#e2e8f0;background:rgba(15,23,42,0.75);padding:${labelPad} 0;backdrop-filter:blur(4px);pointer-events:none;`;
    label.textContent = '';
    wrap.appendChild(label);
  }

  container.appendChild(wrap);

  // Drag to move
  _initDrag(wrap, container);

  // Renderer
  _renderer = new THREE.WebGLRenderer({ canvas: _canvas, antialias: true, alpha: true });
  _renderer.setSize(canvasSz, canvasSz);
  _renderer.setPixelRatio(1);
  _renderer.outputColorSpace = THREE.SRGBColorSpace;

  // Camera (tight FOV for portrait)
  _camera = new THREE.PerspectiveCamera(18, 1, 0.01, 10);
}

export function getPortraitOpts() { return _opts; }

export function showPortrait() {
  const wrap = document.getElementById('portraitWrap');
  if (wrap) { wrap.style.display = 'block'; _active = true; _cycleTimer = 0; _measured = false; }
}

export function hidePortrait() {
  const wrap = document.getElementById('portraitWrap');
  if (wrap) { wrap.style.display = 'none'; _active = false; }
}

export function togglePortrait() {
  _active ? hidePortrait() : showPortrait();
}

function getExpressionList() {
  const vrm = window._vrm;
  if (!vrm?.expressionManager) return [];
  return Object.keys(vrm.expressionManager.expressionMap || {})
    .filter(n => !SKIP_EXPRS.has(n));
}

function pickNextExpression() {
  const list = getExpressionList();
  if (list.length === 0) return 'neutral';
  // Weighted: include neutral more often
  const pool = [...list, 'neutral'];
  let next;
  do { next = pool[Math.floor(Math.random() * pool.length)]; } while (next === _currentExpr && pool.length > 1);
  return next;
}

export function updatePortrait(delta) {
  if (!_active || !_renderer || !S.scene || !S.currentModel) return;

  const vrm = window._vrm;
  if (!vrm?.humanoid) return;

  // Track head position
  const headBone = vrm.humanoid.getNormalizedBoneNode('head');
  if (!headBone) return;

  const headPos = new THREE.Vector3();
  headBone.getWorldPosition(headPos);

  // Auto-focus: measure head size once per model load, scale camera accordingly
  if (!_measured) {
    _measured = true;
    const neckBone = vrm.humanoid.getNormalizedBoneNode('neck');
    const chestBone = vrm.humanoid.getNormalizedBoneNode('upperChest') || vrm.humanoid.getNormalizedBoneNode('chest');

    if (neckBone && chestBone) {
      const neckPos = new THREE.Vector3();
      const chestPos = new THREE.Vector3();
      neckBone.getWorldPosition(neckPos);
      chestBone.getWorldPosition(chestPos);
      // Head-to-chest span as reference unit (typical ~0.25 for standard VRM)
      const span = headPos.distanceTo(chestPos);
      const scale = span / 0.25; // 0.25 = reference span for current tuned values
      _camDist = 1.4 * scale;
      _camYOff = 0.30 * scale;
      _lookYOff = 0.08 * scale;
    } else {
      // Fallback: use model bounding box
      const box = new THREE.Box3().setFromObject(S.currentModel);
      const height = box.getSize(new THREE.Vector3()).y;
      const scale = height / 1.6; // 1.6 = typical full body height
      _camDist = 1.4 * scale;
      _camYOff = 0.30 * scale;
      _lookYOff = 0.08 * scale;
    }
  }

  // Camera positioning with auto-focused values
  const camOffset = new THREE.Vector3(0, _camYOff, _camDist);
  _camera.position.copy(headPos).add(camOffset);
  _camera.lookAt(headPos.x, headPos.y + _lookYOff, headPos.z);

  // Expression cycling
  _cycleTimer += delta;
  if (_cycleTimer >= CYCLE_INTERVAL) {
    _cycleTimer = 0;
    _currentExpr = _targetExpr;
    _targetExpr = pickNextExpression();
    _blendProgress = 0;
  }

  // Blend expressions
  if (_blendProgress < 1 && vrm.expressionManager) {
    _blendProgress = Math.min(1, _blendProgress + delta * BLEND_SPEED);
    const ease = _blendProgress * _blendProgress * (3 - 2 * _blendProgress); // smoothstep

    const allExprs = getExpressionList();
    allExprs.forEach(name => {
      let val = 0;
      if (name === _currentExpr) val = 1 - ease;
      if (name === _targetExpr) val = ease;
      vrm.expressionManager.setValue(name, val);
    });
  }

  // Update label
  const label = document.getElementById('portraitLabel');
  if (label) {
    const showing = _blendProgress < 0.5 ? _currentExpr : _targetExpr;
    label.textContent = showing === 'neutral' ? '' : showing;
  }

  // Render portrait
  const bg = S.scene.background;
  S.scene.background = null; // transparent for portrait
  _renderer.render(S.scene, _camera);
  S.scene.background = bg;
}
