// NVatar — PortraitWidget (floating profile circle + speech bubble).
//
// 채팅 SDK 와 독립. 호스트가 임의 페이지에 PIP-style overlay 로 박을 수 있음.
//   - portrait circle + bubble 이 한 unit. 드래그 시 같이 움직임.
//   - bubbleSide: 'left' | 'right' | 'auto' (런타임 변경 가능)
//   - 사용자 줌 (wheel/pinch) → portrait perspective 동적 조정
//   - VRM 또는 2D backbone (createPortrait factory 재사용)
//
// Usage:
//   import { PortraitWidget } from './js/sdk/portrait-widget.js';
//   const w = await PortraitWidget.create({
//     kind: 'vrm',
//     vrmUrl: 'https://.../model.vrm',
//     portraitSize: 96,
//     bubbleSide: 'auto',
//     initialPosition: { x: window.innerWidth - 280, y: window.innerHeight - 200 },
//     draggable: true,
//     zoomable: true,
//   });
//   w.setMessage('안녕!');
//   w.setEmotion({ joy: 70 });
//   w.setBubbleSide('left');
//   w.destroy();

import { createPortrait } from './portrait.js';

const STYLE_ID = 'nv-portrait-widget-style';

export class PortraitWidget {
  /** Async factory — VRM load + DOM mount 일괄. */
  static async create(opts = {}) {
    const w = new PortraitWidget(opts);
    await w._init(opts);
    return w;
  }

  constructor(opts = {}) {
    this.kind = opts.kind || 'vrm';
    this.portraitSize = opts.portraitSize ?? 96;
    this.bubbleSide = opts.bubbleSide || 'auto';   // 'left' | 'right' | 'auto'
    this.bubbleMaxWidth = opts.bubbleMaxWidth ?? 240;
    this.mountTo = opts.mountTo || document.body;
    this.draggable = opts.draggable !== false;
    this.zoomable = opts.zoomable !== false;
    this.minDistance = opts.minDistance ?? 0.4;
    this.maxDistance = opts.maxDistance ?? 3.0;
    // 자동 좌/우 임계 — bubble 이 swap 되는 viewport ratio (0~1).
    // hysteresis: swap 후 반대로 돌아가려면 (1 - threshold) 까지 가야 함 → 흔들림 방지.
    this.autoThreshold = opts.autoThreshold ?? 0.5;
    this.autoHysteresis = opts.autoHysteresis ?? 0.06;
    // 현재 자동 결정된 side (auto 모드에서 hysteresis 추적용)
    this._currentAutoSide = 'right';

    // 메시지 push 애니메이션 타이밍 — opt 로 외부에서도 조정 가능.
    this.bubbleEnterMs = opts.bubbleEnterMs ?? 1000;  // 새 bubble fade-in + slide-up
    this.bubbleFadeMs  = opts.bubbleFadeMs  ?? 3000;  // 이전 bubble fade-out 까지의 시간

    this.portrait = null;
    this.root = null;
    this.bubbleStackEl = null;   // bubble 컨테이너 (column-reverse)
    this.portraitEl = null;
    this._position = opts.initialPosition || null;   // {x, y} - null 이면 _init 에서 default
    this._destroyed = false;
    this._dragState = null;
  }

  async _init(opts) {
    ensureStyle();
    this._buildDom();
    if (this._position) this._applyPosition(this._position);
    else this._applyPosition(this._defaultPosition());

    this.portrait = await createPortrait({
      kind: this.kind,
      size: this.portraitSize,
      src: opts.imageSrc || null,
      emotionVariants: opts.emotionVariants || null,
    });
    this.portraitEl.appendChild(this.portrait.canvas);
    if (this.kind === 'vrm' && opts.vrmUrl) {
      await this.portrait.loadVrm(opts.vrmUrl);
    }

    if (this.draggable) this._attachDrag();
    if (this.zoomable) this.portrait.enableUserZoom({
      minDistance: this.minDistance,
      maxDistance: this.maxDistance,
      target: this.portraitEl,
    });

    if (this.bubbleSide === 'auto') this._refreshAutoSide();
  }

  // --- Public API ---

  /**
   * 새 말풍선 push. 기존 말풍선들은 fade-out (bubbleFadeMs) 후 제거.
   * 빈/null 입력 → 모든 말풍선 즉시 fade-out (clearMessages 와 동일).
   *
   * 동작 시퀀스:
   *   1) 새 bubble element 생성 + appendChild (column-reverse → visual 최하단)
   *   2) 기존 bubble 들에 .is-fading class → opacity 0 (fade transition: bubbleFadeMs)
   *   3) RAF 후 새 bubble 에 .is-visible class → fade-in + slide-up (enter transition: bubbleEnterMs)
   *   4) bubbleFadeMs + 100ms 후 fading bubble 들 DOM 제거 (cleanup)
   */
  setMessage(text, opts = {}) {
    if (this._destroyed) return;
    const t = text == null ? '' : String(text);
    if (!t.trim()) { this.clearMessages(); return; }

    // 기존 bubble 들 fade-out 시작 (이미 fading 중인 건 그대로 진행).
    this._beginFadeExisting();

    const bubble = document.createElement('div');
    bubble.className = 'nv-pw-bubble';
    bubble.textContent = t;
    this.bubbleStackEl.appendChild(bubble);

    // 두 RAF 대기 — first RAF 에 style commit, second 에 transition trigger.
    // 단일 RAF 면 brand-new element 의 transition 이 박히지 않는 브라우저가 있음.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (this._destroyed) return;
        bubble.classList.add('nv-pw-bubble-visible');
      });
    });

    if (opts.autoHide && opts.autoHide > 0) {
      setTimeout(() => {
        if (this._destroyed) return;
        this._fadeAndRemove(bubble);
      }, opts.autoHide);
    }
  }

  /** 현재 표시 중인 모든 말풍선 fade-out + 제거. */
  clearMessages() {
    if (!this.bubbleStackEl) return;
    Array.from(this.bubbleStackEl.children).forEach(b => this._fadeAndRemove(b));
  }

  _beginFadeExisting() {
    Array.from(this.bubbleStackEl.children).forEach(b => this._fadeAndRemove(b));
  }

  _fadeAndRemove(bubble) {
    if (bubble.dataset.fading === '1') return;   // 중복 호출 방지
    bubble.dataset.fading = '1';
    bubble.classList.add('nv-pw-bubble-fading');
    // fade transition (bubbleFadeMs) 종료 후 DOM 제거. + 100ms buffer.
    setTimeout(() => bubble.remove(), this.bubbleFadeMs + 100);
  }

  /** portrait 감정 위임. */
  setEmotion(emotions) {
    this.portrait?.setEmotion(emotions);
  }

  /** 말풍선 좌/우 강제 지정. 'auto' 면 portrait 위치로 자동 결정. */
  setBubbleSide(side) {
    if (side !== 'left' && side !== 'right' && side !== 'auto') return;
    this.bubbleSide = side;
    if (side === 'auto') this._refreshAutoSide();
    else this._applyBubbleSide(side);
  }

  /** widget 위치 강제 지정. */
  setPosition({ x, y }) {
    this._applyPosition({ x, y });
    if (this.bubbleSide === 'auto') this._refreshAutoSide();
  }

  getPosition() { return { ...this._position }; }

  /** portrait perspective 직접 제어 (host UI 슬라이더 등). */
  setCamera(params) { this.portrait?.setCamera(params); }
  getCamera() { return this.portrait?.getCamera?.() || null; }

  show() { this.root.style.display = ''; }
  hide() { this.root.style.display = 'none'; }

  destroy() {
    this._destroyed = true;
    this._detachDrag();
    this.portrait?.destroy();
    this.root?.remove();
    this.root = null;
  }

  // --- Internal ---

  _buildDom() {
    this.root = document.createElement('div');
    this.root.className = 'nv-pw-root';
    this.root.style.setProperty('--nv-pw-size', this.portraitSize + 'px');
    this.root.style.setProperty('--nv-pw-bubble-max', this.bubbleMaxWidth + 'px');
    this.root.style.setProperty('--nv-pw-enter-ms', this.bubbleEnterMs + 'ms');
    this.root.style.setProperty('--nv-pw-fade-ms', this.bubbleFadeMs + 'ms');

    // bubble stack — column-reverse 라 DOM appendChild = visual 최하단 (최신).
    // portrait baseline 에 새 메시지가 align, 오래된 게 위로 밀려 올라감.
    this.bubbleStackEl = document.createElement('div');
    this.bubbleStackEl.className = 'nv-pw-bubble-stack';

    this.portraitEl = document.createElement('div');
    this.portraitEl.className = 'nv-pw-portrait';

    // 기본 right side (portrait 왼쪽, 말풍선 오른쪽). _applyBubbleSide 가 flex-direction swap.
    this.root.appendChild(this.portraitEl);
    this.root.appendChild(this.bubbleStackEl);
    this.mountTo.appendChild(this.root);

    const initialSide = this.bubbleSide === 'auto' ? 'right' : this.bubbleSide;
    this._applyBubbleSide(initialSide);
  }

  _applyBubbleSide(side) {
    this.root.classList.toggle('nv-pw-side-left', side === 'left');
    this.root.classList.toggle('nv-pw-side-right', side === 'right');
  }

  /**
   * Auto-side 결정 — portrait 의 viewport 내 X 중심을 보고 swap.
   * hysteresis: 현재 side 와 반대로 가려면 threshold 를 넘어서 hysteresis 만큼 더 가야 함.
   *   현재 right → left 로 가려면 ratio < (threshold - hysteresis)
   *   현재 left  → right 로 가려면 ratio > (threshold + hysteresis)
   * 가운데서 미세 진동 방지.
   */
  _refreshAutoSide() {
    if (this.bubbleSide !== 'auto' || !this.portraitEl) return;
    const rect = this.portraitEl.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const ratio = centerX / window.innerWidth;   // 0 = 좌측, 1 = 우측
    const t = this.autoThreshold;
    const h = this.autoHysteresis;
    let next = this._currentAutoSide;
    // portrait 가 우측에 있을수록 (ratio ↑) 말풍선은 좌측으로 가야 함.
    if (this._currentAutoSide === 'right' && ratio > t + h) next = 'left';
    else if (this._currentAutoSide === 'left' && ratio < t - h) next = 'right';
    if (next !== this._currentAutoSide) {
      this._currentAutoSide = next;
      this._applyBubbleSide(next);
    }
  }

  _defaultPosition() {
    // 화면 우하단 — portrait 의 우측에 말풍선이 viewport 밖으로 안 튀어나가도록
    // bubble 폭 + 여백 만큼 안쪽으로 박음. side='auto' 면 자동 좌측 swap 됨.
    const pad = 24;
    const w = this.portraitSize + this.bubbleMaxWidth + 40;
    const h = this.portraitSize + 60;
    return {
      x: Math.max(pad, window.innerWidth - w - pad),
      y: Math.max(pad, window.innerHeight - h - pad),
    };
  }

  _applyPosition({ x, y }) {
    this._position = { x, y };
    this.root.style.left = x + 'px';
    this.root.style.top = y + 'px';
  }

  _attachDrag() {
    // portrait circle 잡고 끌면 widget 전체 이동. 말풍선은 텍스트 선택을 위해 drag 핸들 X.
    let startX = 0, startY = 0, baseX = 0, baseY = 0, active = false;
    const onDown = (e) => {
      const pt = e.touches ? e.touches[0] : e;
      active = true;
      startX = pt.clientX; startY = pt.clientY;
      baseX = this._position.x; baseY = this._position.y;
      this.root.classList.add('nv-pw-dragging');
      // wheel 줌과 drag 가 wheel 이벤트에서 충돌하지 않게 — 줌은 wheel 만 쓰니 OK.
    };
    const onMove = (e) => {
      if (!active) return;
      const pt = e.touches ? e.touches[0] : e;
      // root = portrait size 박스. portrait 가 viewport 안에 항상 절반은 보이도록 clamp.
      const sz = this.portraitSize;
      const minVisible = sz * 0.5;
      const nx = Math.min(window.innerWidth - minVisible, Math.max(minVisible - sz, baseX + (pt.clientX - startX)));
      const ny = Math.min(window.innerHeight - minVisible, Math.max(minVisible - sz, baseY + (pt.clientY - startY)));
      this._applyPosition({ x: nx, y: ny });
      if (this.bubbleSide === 'auto') this._refreshAutoSide();
      if (e.cancelable) e.preventDefault();
    };
    const onUp = () => {
      active = false;
      this.root.classList.remove('nv-pw-dragging');
    };

    this.portraitEl.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    this.portraitEl.addEventListener('touchstart', (e) => {
      // 두 손가락이면 핀치(줌) — drag 무시.
      if (e.touches.length === 1) onDown(e);
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1) onMove(e);
    }, { passive: false });
    window.addEventListener('touchend', onUp);
    window.addEventListener('touchcancel', onUp);

    this._dragState = {
      cleanup: () => {
        this.portraitEl.removeEventListener('mousedown', onDown);
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      },
    };
  }

  _detachDrag() {
    if (this._dragState) { this._dragState.cleanup(); this._dragState = null; }
  }
}

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const css = `
/* Root = portrait 의 anchor box. style.left/top 으로 위치 박힘.
   stack 은 absolute 로 portrait 옆에 박혀 위로 자라므로 portrait 좌표는 stack 길이와 무관하게 고정.
   root width/height = portrait size (stack 은 layout 에 영향 X — overflow visible 로 portrait 박스 밖으로 자람). */
.nv-pw-root {
  position: fixed;
  z-index: 9999;
  width: var(--nv-pw-size, 96px);
  height: var(--nv-pw-size, 96px);
  pointer-events: none;
  user-select: none;
  font-family: -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Segoe UI', 'Pretendard', sans-serif;
}

.nv-pw-portrait {
  pointer-events: auto;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: rgba(255,255,255,0.95);
  box-shadow: 0 4px 20px rgba(0,0,0,0.18);
  overflow: hidden;
  cursor: grab;
  touch-action: none;
  position: relative;
}
.nv-pw-dragging .nv-pw-portrait { cursor: grabbing; }

/* Bubble stack — absolute. portrait 의 bottom 라인에 align, 위로 자라남.
   flex-direction: column (정방향) — DOM appendChild = visual 최하단 = 최신.
   stack 길이가 자라도 portrait 위치 변동 X. */
.nv-pw-bubble-stack {
  position: absolute;
  bottom: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  pointer-events: none;        /* stack 컨테이너는 hit-test 통과, 자식 bubble 만 받음 */
  max-width: var(--nv-pw-bubble-max, 240px);
  width: max-content;          /* 짧은 텍스트 시 stack 박스가 max 까지 늘어나지 않게 */
}
.nv-pw-side-right .nv-pw-bubble-stack {
  left: 100%;
  margin-left: 10px;
  align-items: flex-start;
}
.nv-pw-side-left .nv-pw-bubble-stack {
  right: 100%;
  margin-right: 10px;
  align-items: flex-end;
}

.nv-pw-bubble {
  pointer-events: auto;
  max-width: 100%;
  padding: 10px 14px;
  background: #ffffff;
  color: #111827;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.14);
  font-size: 14px;
  line-height: 1.55;
  /* CJK 친화 wrap — 어절 보존 + 긴 단어/URL overflow 방지 */
  word-break: keep-all;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  position: relative;
  /* 등장 전 상태 — 살짝 아래 + 투명 */
  opacity: 0;
  transform: translateY(14px);
  /* enter (visible 으로 가는 transition) 와 fade-out (fading 으로 가는 transition) 분리.
     enter: var(--nv-pw-enter-ms) — 1s slide+fade-in
     fade-out: var(--nv-pw-fade-ms) — 3s opacity 만 */
  transition:
    opacity var(--nv-pw-enter-ms, 1000ms) ease,
    transform var(--nv-pw-enter-ms, 1000ms) cubic-bezier(0.16, 1, 0.3, 1);
  flex-shrink: 0;
}
.nv-pw-bubble-visible { opacity: 1; transform: translateY(0); }

/* fade-out 단계 — transform 은 유지 (위로 밀려나는 효과는 stack flow 가 처리),
   opacity 만 천천히 0 으로. transition duration override. */
.nv-pw-bubble-fading {
  opacity: 0 !important;
  transition: opacity var(--nv-pw-fade-ms, 3000ms) ease !important;
  pointer-events: none;
}

/* 말풍선 꼬리 — portrait 쪽으로. 최신 (visual 최하단 = DOM 마지막 = :last-child) bubble 에만 표시.
   오래된 bubble 은 꼬리 숨김 (꼬리는 portrait 가리키는 신호이므로). */
.nv-pw-bubble-stack .nv-pw-bubble:last-child::after {
  content: '';
  position: absolute;
  bottom: 14px;
  width: 0; height: 0;
  border: 8px solid transparent;
}
.nv-pw-side-right .nv-pw-bubble-stack .nv-pw-bubble:last-child::after {
  left: -14px;
  border-right-color: #ffffff;
  border-left: 0;
}
.nv-pw-side-left .nv-pw-bubble-stack .nv-pw-bubble:last-child::after {
  right: -14px;
  border-left-color: #ffffff;
  border-right: 0;
}

@media (prefers-color-scheme: dark) {
  .nv-pw-bubble { background: #1f2937; color: #f3f4f6; }
  .nv-pw-side-right .nv-pw-bubble-stack .nv-pw-bubble:last-child::after { border-right-color: #1f2937; }
  .nv-pw-side-left  .nv-pw-bubble-stack .nv-pw-bubble:last-child::after { border-left-color: #1f2937; }
  .nv-pw-portrait { background: rgba(31,41,55,0.95); }
}
`;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = css;
  document.head.appendChild(s);
}
