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
    const mod = await import('./portrait-mini.js');
    return new mod.MiniPortrait(opts);
  }
  const mod = await import('./portrait-2d.js');
  return new mod.Static2DPortrait(opts);
}
