// NVatar Avatar Lab — Shared Mutable State
// 백엔드 주소 결정.
// 예전엔 GitHub Pages 일 때만 원격을 쓰고 그 외에는 상대경로였다 — nvatar 백엔드가
// 이 페이지를 직접 서빙한다는 전제였다. 그런데 정적 서버(python http.server 등)로 열면
// `/api/v1/assets` 가 그 서버로 가서 404 → VRM 로드 실패한다.
// → **백엔드가 아닌 곳에서 열렸으면 원격을 쓴다.** ?api=/?res= 로 덮어쓸 수 있다.
const _p = new URLSearchParams(location.search);
const _selfHosted = /(^|\.)nvatar(-res)?\.nskit\.io$/.test(location.hostname);
const API_BASE = _p.get('api') || (_selfHosted ? '' : 'https://nvatar.nskit.io');
const RES_BASE = _p.get('res') || (_selfHosted ? '' : 'https://nvatar-res.nskit.io');

const S = {
  API_BASE,
  RES_BASE,
  scene: null,
  camera: null,
  renderer: null,
  controls: null,

  currentModel: null,
  mixer: null,
  animations: [],
  currentAction: null,
  isRotating: false,
  morphMeshes: [],

  // Clock & timing
  elapsed: 0,
  nextBlink: 2 + Math.random() * 4,
  blinkPhase: -1,

  // Mouse (for lookAt)
  mouseX: 0,
  mouseY: 0,

  // Emotion
  currentEmotionPose: null,
  poseTarget: {},
  poseCurrent: {},

  // FBX
  fbxMixer: null,
  fbxClips: {},
  fbxCurrentAction: null,
  fbxCurrentName: null,

  // Mesh
  meshMap: {},
  allMeshes: [],
};

export default S;
