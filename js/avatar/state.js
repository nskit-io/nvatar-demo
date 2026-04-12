// NVatar Avatar Lab — Shared Mutable State
const API_BASE = location.hostname === 'nskit-io.github.io' ? 'https://nvatar.nskit.io' : '';

const S = {
  API_BASE,
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
