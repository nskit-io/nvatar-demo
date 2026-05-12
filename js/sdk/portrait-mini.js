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
    // Tuned to match avatar/portrait.js defaults — these work for standard VRM rigs.
    this._camDist = 1.1;
    this._camYOff = 0.25;
    this._lookYOff = 0.08;

    // Expression blending
    this._currentExpr = 'neutral';
    this._currentIntensity = 0;
    this._targetExpr = 'neutral';
    this._targetIntensity = 0;
    this._blendProgress = 1;

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

  destroy() {
    this._destroyed = true;
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
      this._updateCamera();
      this._updateExpressionBlend(delta);
      // VRM 자체 업데이트 (lookat 등). lookAt 비활성: chat 룸 portrait 은 정적 카메라.
      if (typeof this.vrm.update === 'function') this.vrm.update(delta);
      this._render();
    }

    requestAnimationFrame(this._loop);
  }

  _updateCamera() {
    const headBone = this.vrm.humanoid?.getNormalizedBoneNode('head');
    if (!headBone) return;
    const headPos = new THREE.Vector3();
    headBone.getWorldPosition(headPos);

    if (!this._measured) {
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
