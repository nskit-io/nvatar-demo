// NVatar Room — Entry Point & Bootstrap
import S from './state.js';
import { getUiLang, applyI18nUI } from './i18n.js';
import { init, toggleLight, resetView, addFurniture } from './scene.js';
import { loadVRM, loadLocalVRM } from './vrm-loader.js';
import { setMood } from './mood.js';
import { sendChat, addChatMsg } from './chat.js';
import { toggleMic } from './stt.js';
import { changeVoice, loadVoices } from './tts.js';
import { NVatarSDK } from './lookup.js';
import { mobileToggleLookupPanel, mobileChangeLang, mobileToggleTTS, openMobileLookup, closeMobileLookup, initMobile } from './mobile.js';

// Expose to window for HTML onclick handlers
window.toggleLight = toggleLight;
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

// Init mobile hooks
initMobile();

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

// Load from URL params
const urlParams = new URLSearchParams(window.location.search);
S.paramAvatarId = urlParams.get('avatar');
const paramVRM = urlParams.get('vrm') || S.API_BASE + '/static/vrm/vroid-samples/Victoria_Rubin.vrm';

loadVRM(paramVRM, 0);
