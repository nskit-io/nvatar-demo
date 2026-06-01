// NVatar SDK Chat — Static 2D portrait backbone.
//
// VRM 의존성 0 — three.js / three-vrm 안 부름. 단순 <img> 또는 background-image.
// 호스트 자산이 emotion variants 를 제공하면 setEmotion() 시 swap.
//
// Public API mirror of MiniPortrait:
//   attachTo(el) / detach() / loadVrm() (noop) / setEmotion() / destroy()
//
// loadVrm 시그니처를 그대로 둔 건 view-room 의 기존 호출 path 가 폴리모픽하게
// 동작하도록 — factory 만 통과시키면 caller 측 분기 X.

import { mapEmotionToExpression } from './emotion-map.js';

export class Static2DPortrait {
  constructor(opts = {}) {
    this.size = opts.size ?? 56;
    this.src = opts.src || null;
    this.variants = opts.emotionVariants || null;   // { happy: url, sad: url, ... }
    this._destroyed = false;
    this._currentExpr = 'neutral';

    this.canvas = document.createElement('div');
    this.canvas.className = 'nv-2d-portrait';
    // 부모 (.nv-portrait / .nv-slot-face / .nv-chat-thumb) 의 border + bg 사용 — 자식은 cover.
    this.canvas.style.cssText =
      `width:100%;height:100%;border-radius:50%;background-position:center;background-size:cover;background-repeat:no-repeat;display:block;`;
    if (this.src) this.canvas.style.backgroundImage = `url('${this.src}')`;
  }

  attachTo(parentEl) {
    if (!parentEl) return this.canvas;
    if (this.canvas.parentElement !== parentEl) parentEl.appendChild(this.canvas);
    return this.canvas;
  }

  detach() {
    if (this.canvas.parentElement) this.canvas.parentElement.removeChild(this.canvas);
  }

  // Polymorphic noop — VrmPortrait 시그니처와 동일하게 맞춤.
  // 2D 백본은 src 가 이미 생성자에 들어오므로 별도 load 필요 X.
  async loadVrm(url) {
    if (url && !this.src) {
      this.src = url;
      this.canvas.style.backgroundImage = `url('${url}')`;
    }
    return null;
  }

  setEmotion(emotions) {
    if (!this.variants) return;   // 자산 swap 없으면 정적
    const { expr } = mapEmotionToExpression(emotions);
    if (expr === this._currentExpr) return;
    const url = this.variants[expr] || this.src;
    if (url) this.canvas.style.backgroundImage = `url('${url}')`;
    this._currentExpr = expr;
  }

  // MiniPortrait 와 polymorphic — caller 가 backbone 분기 없이 호출 가능. 2D 는 perspective 없음 → noop.
  setCamera() { /* noop */ }
  getCamera() { return { distance: 1, yOffset: 0, lookYOffset: 0, fov: 0 }; }
  setAutoFit() { /* noop */ }
  setSize(size) {
    this.size = size;
    // canvas 는 inline-block 이라 부모 fill — 외부 wrapper 가 사이즈 정의함. noop OK.
  }
  enableUserZoom() { /* 2D 는 줌 X (정적 이미지). UI 에서 zoom 컨트롤 숨김. */ }
  disableUserZoom() { /* noop */ }

  destroy() {
    this._destroyed = true;
    this.detach();
  }
}
