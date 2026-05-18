// NVatar SDK Chat — Portrait factory.
//
// 자산 종류에 따라 VRM 또는 2D 백본 인스턴스를 반환. 호출처는 backbone-agnostic.
//
//   const p = createPortrait({ kind: 'vrm', size: 56 });
//   await p.loadVrm(vrmUrl);
//
//   const p = createPortrait({ kind: '2d', size: 56, src: '/assets/sage.png' });
//   // loadVrm 호출 불필요 (또는 noop)
//
// VRM 분기는 dynamic import 로 분리 — 2D-only 호스트는 three.js 자체 로드 X.

export async function createPortrait(opts) {
  const kind = opts?.kind === 'vrm' ? 'vrm' : '2d';
  if (kind === 'vrm') {
    // 호스트 importmap 자리 박혀있지 않을 시 SDK 가 자체 inject (single 'three' source).
    // portrait-mini.js 와 three-vrm 의 sub-import 가 같은 esm.sh URL 으로 resolve → dedupe.
    ensureThreeImportMap();
    const mod = await import('./portrait-mini.js');
    return new mod.MiniPortrait(opts);
  }
  const mod = await import('./portrait-2d.js');
  return new mod.Static2DPortrait(opts);
}

function ensureThreeImportMap() {
  if (document.getElementById('nv-three-importmap')) return;
  // 이미 'three' resolved 됐는지 — script[type=importmap] 외 module 의 import 가
  // 한번 박힌 후 importmap 박으면 효과 X. SDK 의 모든 module 호출이 SDK_BASE 의
  // dynamic import 라 진입 직전 박으면 안전 (modern browser 의 multiple importmap 지원).
  const script = document.createElement('script');
  script.type = 'importmap';
  script.id = 'nv-three-importmap';
  script.textContent = JSON.stringify({
    imports: {
      'three': 'https://esm.sh/three@0.160.0',
      'three/addons/': 'https://esm.sh/three@0.160.0/examples/jsm/',
    },
  });
  document.head.appendChild(script);
}
