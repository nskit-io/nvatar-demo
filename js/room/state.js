// NVatar Room — Shared Mutable State Hub
// All modules import S and read/write properties on this single object.
// Using an object (not primitive exports) so mutations are visible across modules.

// --- Server URL resolution ---
// API_BASE: core server (chat, avatar, memory, tts, channel)
// RES_BASE: resource server (static files, VRM, room, assets, layout)
//
// Local dev:  API_BASE='' (same-origin), RES_BASE='' (same-origin)
// GitHub Pages: API→nvatar.nskit.io, RES→nvatar-res.nskit.io
// Production:  same as GitHub Pages

const _params = new URLSearchParams(location.search);
const _serverParam = _params.get('server');
const _savedServer = localStorage.getItem('nvatar_server_url');
const _isGitHubPages = location.hostname === 'nskit-io.github.io' || location.hostname.endsWith('.github.io');

// Core API: chat, avatar, memory, tts, channel
const _coreParam = _params.get('core') || _params.get('server');
const API_BASE = _coreParam || _savedServer || (_isGitHubPages ? 'https://nvatar.nskit.io' : '');

// Resource server: static, VRM, room, assets, layout
const _resParam = _params.get('res');
const RES_BASE = _resParam || (_isGitHubPages ? 'https://nvatar-res.nskit.io' : '');

const S = {
  API_BASE,
  RES_BASE,
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
