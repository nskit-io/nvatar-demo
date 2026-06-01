// NVatar SDK Chat — Mini VRM portrait widget.
//
// Fork of avatar/portrait.js, customized for chat room:
//  - No auto-expression cycle (emotion driven only)
//  - setEmotion(emotions) API
//  - Self-contained scene (own renderer/camera/scene), no shared global state
//  - Camera auto-focuses to head bone
//
// Usage:
//   const p = new MiniPortrait({ size: 56 });
//   await p.loadVrm(url);
//   p.attachTo(domElement);
//   p.setEmotion({ joy: 70, sadness: 10 });
//   p.destroy();

// bare specifier — portrait.js factory 가 진입 시 importmap inject (single 'three'
// instance 보장). multiple instance 문제 (A.onBuild not function) 차단.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mapEmotionToExpression } from './emotion-map.js';

const BLEND_SPEED = 4.0;  // expression blend per second

export class MiniPortrait {
  constructor(opts = {}) {
    this.size = opts.size ?? 56;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.scene = new THREE.Scene();
    this.scene.background = null;

    // soft front-key light
    const amb = new THREE.AmbientLight(0xffffff, 0.7);
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(0, 1, 1.5);
    this.scene.add(amb, dir);

    this.camera = new THREE.PerspectiveCamera(18, 1, 0.01, 10);

    const canvasSz = this.size * this.dpr;
    this.canvas = document.createElement('canvas');
    this.canvas.width = canvasSz;
    this.canvas.height = canvasSz;
    this.canvas.style.cssText = `width:100%;height:100%;display:block;border-radius:50%;`;

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.size, this.size, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.vrm = null;
    this.vrmRoot = null;
    this._measured = false;
    this._autoFit = opts.autoFit !== false;   // false 시 외부에서 setCamera 만 control
    // Tuned to match avatar/portrait.js defaults — these work for standard VRM rigs.
    this._camDist = 1.1;
    this._camYOff = 0.25;
    this._lookYOff = 0.08;
    // FOV 도 옵션 (기본 18). setCamera 로 런타임 변경 가능.
    if (typeof opts.fov === 'number') this.camera.fov = opts.fov;
    // 사용자 줌 (wheel + pinch). default off — chat 모드는 portrait travel 만 쓰므로.
    this._zoom = null;   // { minDist, maxDist, sensitivity, target, cleanup }

    // Expression blending
    this._currentExpr = 'neutral';
    this._currentIntensity = 0;
    this._targetExpr = 'neutral';
    this._targetIntensity = 0;
    this._blendProgress = 1;

    // Idle motion state — gives the model a living feel
    this._idleClock = Math.random() * 10;            // staggered start
    this._nextBlinkAt = 2 + Math.random() * 3;        // first blink 2~5s in
    this._blinkUntil = 0;
    this._headBaseRot = null;                          // captured on first frame

    this._destroyed = false;
    this._lastT = performance.now();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  /** Attach the canvas as a child of `parentEl`. Returns the canvas. */
  attachTo(parentEl) {
    if (!parentEl) return this.canvas;
    if (this.canvas.parentElement !== parentEl) parentEl.appendChild(this.canvas);
    return this.canvas;
  }

  /** Detach from current parent (canvas stays alive). */
  detach() {
    if (this.canvas.parentElement) this.canvas.parentElement.removeChild(this.canvas);
  }

  async loadVrm(url) {
    if (!url) return;
    // three-vrm — importmap 의 'three' resolve 통해 single instance 공유.
    // jsdelivr URL 박되 sub-import 가 bare 'three' 박혀있어 importmap 사용.
    const vrmModule = await import('https://cdn.jsdelivr.net/npm/@pixiv/three-vrm@3.3.3/lib/three-vrm.module.min.js');
    const { VRMLoaderPlugin } = vrmModule;

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    return new Promise((resolve, reject) => {
      loader.load(url, (gltf) => {
        const vrm = gltf.userData.vrm;
        if (!vrm) return reject(new Error('VRM parse failed'));

        if (this.vrmRoot) this.scene.remove(this.vrmRoot);
        this.vrm = vrm;
        this.vrmRoot = gltf.scene;
        this.vrmRoot.rotation.y = Math.PI;  // face camera
        this.scene.add(this.vrmRoot);
        this._measured = false;
        resolve(vrm);
      }, undefined, reject);
    });
  }

  setEmotion(emotions) {
    if (!this.vrm) return;
    const { expr, intensity } = mapEmotionToExpression(emotions);
    if (expr === this._targetExpr && Math.abs(intensity - this._targetIntensity) < 0.05) return;
    this._currentExpr = this._targetExpr;
    this._currentIntensity = this._targetIntensity;
    this._targetExpr = expr;
    this._targetIntensity = intensity;
    this._blendProgress = 0;
  }

  /**
   * 카메라 파라미터 부분 update — 매 frame _updateCamera 가 _camDist/Y/lookY 를
   * 그대로 읽으므로 setter 가 박은 값이 즉시 다음 프레임에 반영됨.
   *   distance      카메라 ← head 거리 (작을수록 줌인)
   *   yOffset       카메라 높이 오프셋
   *   lookYOffset   lookAt target 높이 오프셋 (눈높이 미세조정)
   *   fov           PerspectiveCamera FOV (각도). 변경 시 projection matrix 재계산.
   */
  setCamera({ distance, yOffset, lookYOffset, fov } = {}) {
    if (typeof distance === 'number') this._camDist = distance;
    if (typeof yOffset === 'number') this._camYOff = yOffset;
    if (typeof lookYOffset === 'number') this._lookYOff = lookYOffset;
    if (typeof fov === 'number') {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** 현재 카메라 파라미터 스냅샷 (UI 슬라이더 동기화용). */
  getCamera() {
    return {
      distance: this._camDist,
      yOffset: this._camYOff,
      lookYOffset: this._lookYOff,
      fov: this.camera.fov,
    };
  }

  /** measured auto-fit 비활성. 외부가 setCamera 로 완전 제어. */
  setAutoFit(enabled) {
    this._autoFit = !!enabled;
    if (!enabled) this._measured = true;   // 다음 _updateCamera 에서 measure 스킵
  }

  /** 캔버스 사이즈 변경 — devicePixelRatio 반영 + aspect 갱신. */
  setSize(size) {
    this.size = size;
    const px = size * this.dpr;
    this.canvas.width = px;
    this.canvas.height = px;
    this.renderer.setSize(size, size, false);
    // aspect 는 정사각이라 그대로지만 명시.
    this.camera.aspect = 1;
    this.camera.updateProjectionMatrix();
  }

  /**
   * 사용자 줌 활성화 — wheel + pinch 로 _camDist 조정.
   *   minDistance / maxDistance: 줌 범위 clamp
   *   sensitivity: wheel deltaY 1 당 distance 곱해지는 비율 (default 0.0015)
   *   target: 이벤트 attach 대상 DOM (default canvas)
   */
  enableUserZoom(opts = {}) {
    this.disableUserZoom();
    const minDistance = opts.minDistance ?? 0.4;
    const maxDistance = opts.maxDistance ?? 3.0;
    const sensitivity = opts.sensitivity ?? 0.0015;
    const target = opts.target || this.canvas;

    const clamp = (d) => Math.min(maxDistance, Math.max(minDistance, d));

    const onWheel = (e) => {
      e.preventDefault();
      // deltaY > 0 = 휠 아래(축소), * sensitivity → distance 증가 = 줌아웃
      const factor = 1 + e.deltaY * sensitivity;
      this._camDist = clamp(this._camDist * factor);
    };

    let pinchStartDist = 0;
    let pinchStartCamDist = 0;
    const touchDist = (touches) => {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.hypot(dx, dy);
    };
    const onTouchStart = (e) => {
      if (e.touches.length !== 2) return;
      pinchStartDist = touchDist(e.touches);
      pinchStartCamDist = this._camDist;
    };
    const onTouchMove = (e) => {
      if (e.touches.length !== 2 || !pinchStartDist) return;
      e.preventDefault();
      const cur = touchDist(e.touches);
      // 두 손가락 벌어지면(cur ↑) → distance 줄어듦 = 줌인
      const ratio = pinchStartDist / cur;
      this._camDist = clamp(pinchStartCamDist * ratio);
    };
    const onTouchEnd = () => { pinchStartDist = 0; };

    target.addEventListener('wheel', onWheel, { passive: false });
    target.addEventListener('touchstart', onTouchStart, { passive: true });
    target.addEventListener('touchmove', onTouchMove, { passive: false });
    target.addEventListener('touchend', onTouchEnd);
    target.addEventListener('touchcancel', onTouchEnd);

    this._zoom = {
      target,
      cleanup: () => {
        target.removeEventListener('wheel', onWheel);
        target.removeEventListener('touchstart', onTouchStart);
        target.removeEventListener('touchmove', onTouchMove);
        target.removeEventListener('touchend', onTouchEnd);
        target.removeEventListener('touchcancel', onTouchEnd);
      },
    };
  }

  disableUserZoom() {
    if (this._zoom) { this._zoom.cleanup(); this._zoom = null; }
  }

  destroy() {
    this._destroyed = true;
    this.disableUserZoom();
    this.detach();
    if (this.vrmRoot) this.scene.remove(this.vrmRoot);
    this.renderer.dispose();
  }

  // --- internal ---

  _loop(t) {
    if (this._destroyed) return;
    const delta = Math.min(0.1, (t - this._lastT) / 1000);
    this._lastT = t;

    if (this.vrm) {
      this._idleClock += delta;
      this._updateIdleMotion(delta);
      this._updateCamera();
      this._updateExpressionBlend(delta);
      // VRM 자체 업데이트 (springbones, expression flush 등).
      if (typeof this.vrm.update === 'function') this.vrm.update(delta);
      this._render();
    }

    requestAnimationFrame(this._loop);
  }

  // Subtle idle: blink + slow head sway + breathing.
  // Keeps the portrait feeling alive without distracting from speech.
  _updateIdleMotion(delta) {
    const t = this._idleClock;

    // Head sway — gentle yaw/pitch sine, low amplitude
    const head = this.vrm.humanoid?.getNormalizedBoneNode('head');
    if (head) {
      if (!this._headBaseRot) {
        this._headBaseRot = { x: head.rotation.x, y: head.rotation.y, z: head.rotation.z };
      }
      head.rotation.y = this._headBaseRot.y + Math.sin(t * 0.6) * 0.035;
      head.rotation.x = this._headBaseRot.x + Math.sin(t * 0.4 + 1.3) * 0.020;
      head.rotation.z = this._headBaseRot.z + Math.sin(t * 0.3 + 2.1) * 0.010;
    }

    // Breathing — tiny chest scale oscillation
    const chest = this.vrm.humanoid?.getNormalizedBoneNode('upperChest')
      || this.vrm.humanoid?.getNormalizedBoneNode('chest')
      || this.vrm.humanoid?.getNormalizedBoneNode('spine');
    if (chest) {
      const breath = 1 + Math.sin(t * 1.6) * 0.012;
      chest.scale.set(breath, breath, breath);
    }

    // Blink — quick close/open at random intervals
    const emap = this.vrm.expressionManager?.expressionMap;
    if (emap && 'blink' in emap) {
      if (t >= this._nextBlinkAt && t < this._nextBlinkAt + 0.13) {
        // closing/open easing across 130ms
        const local = (t - this._nextBlinkAt) / 0.13;
        const v = local < 0.5 ? local * 2 : (1 - local) * 2;
        this.vrm.expressionManager.setValue('blink', Math.min(1, v));
      } else if (t >= this._nextBlinkAt + 0.13) {
        this.vrm.expressionManager.setValue('blink', 0);
        this._nextBlinkAt = t + 2.5 + Math.random() * 3;  // next blink 2.5~5.5s later
      }
    }
  }

  _updateCamera() {
    const headBone = this.vrm.humanoid?.getNormalizedBoneNode('head');
    if (!headBone) return;
    const headPos = new THREE.Vector3();
    headBone.getWorldPosition(headPos);

    if (!this._measured && this._autoFit) {
      this._measured = true;
      const chestBone = this.vrm.humanoid.getNormalizedBoneNode('upperChest')
        || this.vrm.humanoid.getNormalizedBoneNode('chest');
      if (chestBone) {
        const chestPos = new THREE.Vector3();
        chestBone.getWorldPosition(chestPos);
        const span = headPos.distanceTo(chestPos);
        const scale = span / 0.25;
        this._camDist = 1.1 * scale;
        this._camYOff = 0.25 * scale;
        this._lookYOff = 0.08 * scale;
      } else if (this.vrmRoot) {
        // Bounding-box fallback when neck/chest bones aren't available
        const box = new THREE.Box3().setFromObject(this.vrmRoot);
        const height = box.getSize(new THREE.Vector3()).y;
        const scale = (height || 1.6) / 1.6;
        this._camDist = 1.1 * scale;
        this._camYOff = 0.25 * scale;
        this._lookYOff = 0.08 * scale;
      }
    }

    const camOffset = new THREE.Vector3(0, this._camYOff, this._camDist);
    this.camera.position.copy(headPos).add(camOffset);
    this.camera.lookAt(headPos.x, headPos.y + this._lookYOff, headPos.z);
  }

  _updateExpressionBlend(delta) {
    if (!this.vrm.expressionManager) return;
    if (this._blendProgress < 1) {
      this._blendProgress = Math.min(1, this._blendProgress + delta * BLEND_SPEED);
    }
    const ease = this._blendProgress * this._blendProgress * (3 - 2 * this._blendProgress);  // smoothstep
    const curVal = this._currentIntensity * (1 - ease);
    const tgtVal = this._targetIntensity * ease;

    const emap = this.vrm.expressionManager.expressionMap || {};
    // Zero relevant keys first to avoid stale overlap
    ['happy','sad','angry','surprised','relaxed','neutral'].forEach(k => {
      if (k in emap) this.vrm.expressionManager.setValue(k, 0);
    });
    if (this._currentExpr in emap) this.vrm.expressionManager.setValue(this._currentExpr, curVal);
    if (this._targetExpr in emap) this.vrm.expressionManager.setValue(this._targetExpr, tgtVal);
  }

  _render() {
    this.renderer.render(this.scene, this.camera);
  }
}
