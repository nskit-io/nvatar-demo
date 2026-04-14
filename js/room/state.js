// NVatar Room — Shared Mutable State Hub
// All modules import S and read/write properties on this single object.
// Using an object (not primitive exports) so mutations are visible across modules.

// API base: from URL param > localStorage > hostname detection > empty (same-origin)
const _params = new URLSearchParams(location.search);
const _serverParam = _params.get('server');
const _savedServer = localStorage.getItem('nvatar_server_url');
const _isGitHubPages = location.hostname === 'nskit-io.github.io' || location.hostname.endsWith('.github.io');
const API_BASE = _serverParam || _savedServer || (_isGitHubPages ? 'https://nvatar.nskit.io' : '');

const S = {
  API_BASE,
  // Three.js core
  scene: null,
  camera: null,
  renderer: null,
  controls: null,
  clock: null,

  // Avatars
  avatars: [],
  elapsed: 0,

  // Room
  roomModel: null,
  roomLights: [],
  lightOn: true,
  ROOM_OBJECTS: [],
  ROOM_BOUNDS: { minX: -2.5, maxX: 2.5, minZ: -2, maxZ: 2 },

  // Animation
  mixamoClips: {},
  currentMixer: null,
  currentAction: null,
  idleAction: null,
  walkAction: null,
  moodActions: {},
  gestureActions: {},
  currentMoodName: 'idle',

  // Walk
  walkTarget: null,
  walkState: 'idle',

  // Chat
  chatWs: null,
  currentAvatarId: null,

  // Flags
  _waitingForResponse: false,

  // URL params (set by main.js)
  paramAvatarId: null,

  // Hooks (for cross-module callbacks without circular deps)
  hooks: {
    onBubbleComplete: null,
    onTTSComplete: null,
    onChatMsg: null,
    onReconnect: null,
  },
};

export default S;
