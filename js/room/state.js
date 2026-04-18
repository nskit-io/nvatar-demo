// NVatar Room — Shared Mutable State Hub
// All modules import S and read/write properties on this single object.
// Using an object (not primitive exports) so mutations are visible across modules.

// --- Server URL resolution ---
// API_BASE: core server (chat, avatar, memory, tts, channel)
// RES_BASE: resource server (static files, VRM, room, assets, layout)
//
// Local dev:  API_BASE='' (same-origin :54445 → but chat goes to :54444)
//             RES_BASE='' (same-origin :54445)
// GitHub Pages: API→nvatar.nskit.io, RES→nvatar-res.nskit.io
// Production:  same as GitHub Pages

// Environment-based server URLs — no query-param override (prevents external redirection
// attacks and avoids leaking server addresses in shareable URLs).
const _isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
const API_BASE = _isLocal ? 'http://localhost:54444' : 'https://nvatar.nskit.io';
const RES_BASE = _isLocal ? '' : 'https://nvatar-res.nskit.io';

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
