// NVatar Room — Entry Point & Bootstrap
import * as THREE from 'three';
import S from './state.js';

// Enable asset cache so repeated FBX/GLB loads (friends, retargets) come from memory
THREE.Cache.enabled = true;
import { getUiLang, applyI18nUI } from './i18n.js';
import { init, toggleLight, resetView, addFurniture } from './scene.js';
import { loadVRM, loadLocalVRM } from './vrm-loader.js';
import { setMood } from './mood.js';
import { sendChat, addChatMsg } from './chat.js';
import { toggleMic } from './stt.js';
import { changeVoice, loadVoices } from './tts.js';
import { NVatarSDK } from './lookup.js';
import { mobileToggleLookupPanel, mobileChangeLang, mobileToggleTTS, openMobileLookup, closeMobileLookup, initMobile } from './mobile.js';
import { initEditor, toggleEditMode, setEditTranslate, setEditRotate, undoEdit, saveLayout, loadLayout } from './room-editor.js';
import { toggleExploreMode } from './room-explore.js';
import { initAuthoring, toggleAuthoringPanel } from './room-authoring.js';
import { initSidePanelDrag } from './side-panel-drag.js';
import { addRandomFriend } from './friend-avatar.js';
import { initFriendPanel, toggleFriendPanel } from './friend-panel.js';

// Expose to window for HTML onclick handlers
window.toggleLight = toggleLight;
window.toggleEditMode = toggleEditMode;
window.setEditTranslate = setEditTranslate;
window.setEditRotate = setEditRotate;
window.undoEdit = undoEdit;
window.saveLayout = saveLayout;
window.loadLayout = loadLayout;
window.toggleExploreMode = toggleExploreMode;
window.toggleAuthoringPanel = toggleAuthoringPanel;
window.addRandomFriend = addRandomFriend;
window.toggleFriendPanel = toggleFriendPanel;
window.resetView = resetView;
window.addFurniture = addFurniture;
window.loadVRM = (url, index = 0) => loadVRM(url, index);
window.loadLocalVRM = loadLocalVRM;
window.setMood = setMood;
window.sendChat = sendChat;
window.toggleMic = toggleMic;
window._changeLang = mobileChangeLang;
window._toggleTTS = mobileToggleTTS;
window._changeVoice = changeVoice;
window.toggleLookupPanel = mobileToggleLookupPanel;
window.openMobileLookup = openMobileLookup;
window.closeMobileLookup = closeMobileLookup;
window.NVatarSDK = NVatarSDK;

// Init scene
init();

// Init editor (async — loads config, waits for room)
initEditor().then(() => {
  // Auto-load saved layout after editor is ready
  loadLayout();
  // Authoring UI (builds DOM lazily on first toggle)
  initAuthoring();
});

// Init mobile hooks
initMobile();

// Side panel drag + fold
initSidePanelDrag();

// Friend panel (lists user's own avatars — click to add/remove as friend)
initFriendPanel();

// Room Manager — observer pattern. Owns scheduling, target resolution, queue, gemma lock.
import('./room-manager.js').then(mod => {
  mod.startScheduler();
  S.hooks.onBubbleComplete = () => mod.onBubbleComplete();
});

// Apply i18n
applyI18nUI();

// Sync lang selectors to URL lang
const uiLang = getUiLang();
const langSel = document.getElementById('langSelect');
if (langSel) langSel.value = uiLang;
const mobileLangSel = document.getElementById('mobileLangSelect');
if (mobileLangSel) mobileLangSel.value = uiLang;

// Load voices
loadVoices();

// URL params — avatar + vrm are opaque uids (8-char hex)
const urlParams = new URLSearchParams(window.location.search);
const paramAvatarUid = urlParams.get('avatar') || '';
const vrmUid = urlParams.get('vrm');

// avatar uid must be exactly 8 hex chars (no numeric ids)
if (!/^[0-9a-f]{8}$/.test(paramAvatarUid)) {
  console.warn('[Main] Invalid avatar uid, redirecting:', paramAvatarUid);
  location.replace('index.html');
  throw new Error('Invalid avatar param; redirecting');
}
S.paramAvatarUid = paramAvatarUid;
S.paramAvatarId = null;

async function resolveAndLoadVRM(uid) {
  if (!uid) { loadFallbackVRM(); return; }
  try {
    const resp = await fetch(`${S.RES_BASE}/api/v1/vrm/resolve/${encodeURIComponent(uid)}`);
    if (resp.ok) {
      const data = await resp.json();
      loadVRM(S.RES_BASE + data.model.url, 0);
      return;
    }
  } catch (e) {
    console.warn('[Main] VRM resolve failed:', e);
  }
  loadFallbackVRM();
}

async function loadFallbackVRM() {
  try {
    const resp = await fetch(`${S.RES_BASE}/api/v1/vrm/models`);
    if (resp.ok) {
      const data = await resp.json();
      const vic = data.models.find(m => m.name === 'Victoria');
      if (vic) { resolveAndLoadVRM(vic.uid); return; }
    }
  } catch (e) {}
  console.error('[Main] All VRM loading failed');
}

(async () => {
  try {
    const r = await fetch(`${S.API_BASE}/api/v1/avatars/by-uid/${encodeURIComponent(paramAvatarUid)}`);
    if (!r.ok) { location.replace('index.html'); return; }
    const d = await r.json();
    S.paramAvatarId = d.response.id;
  } catch (e) {
    console.error('[Main] avatar uid resolve failed:', e);
    location.replace('index.html');
    return;
  }
  resolveAndLoadVRM(vrmUid);
})();
