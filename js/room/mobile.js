// NVatar Room — Mobile UI (Chat Fade, Mobile Lookup Dialog, Selector Sync)
import S from './state.js';
import { t, changeLang } from './i18n.js';
import { TTS_CONFIG, toggleTTS as _baseTTS } from './tts.js';
import { toggleLookupPanel as _baseLookup } from './lookup.js';

const _isMobile = () => window.innerWidth <= 768;
let _chatFadeTimer = null;
let _chatState = 'idle';
let _chatConversing = false;

// --- Chat Fade System ---
function _chatEnterIdle() {
  if (!_isMobile()) return;
  _chatState = 'fading';
  const msgs = document.getElementById('chatMessages');
  msgs.classList.add('chat-sweep-fade');
  setTimeout(() => {
    msgs.classList.remove('chat-sweep-fade');
    const overlay = document.getElementById('chatOverlay');
    overlay.classList.add('chat-idle');
    overlay.querySelectorAll('.chat-active-msg').forEach(el => el.classList.remove('chat-active-msg'));
    _chatState = 'idle';
  }, 5000);
}

function _chatStartFadeTimer() {
  clearTimeout(_chatFadeTimer);
  if (!_isMobile()) return;
  _chatFadeTimer = setTimeout(() => {
    _chatConversing = false;
    _chatState = 'fading';
    _chatEnterIdle();
  }, 5000);
}

function _onBubbleComplete() {
  if (!_isMobile() || _chatState !== 'active') return;
  // bubble.js calls this when the bubble queue is empty (all done).
  // Do NOT start fade if TTS is still playing — _onTTSComplete handles that.
  if (TTS_CONFIG.enabled) return;
  _chatStartFadeTimer();
}

function _onTTSComplete() {
  if (!_isMobile() || _chatState !== 'active') return;
  _chatConversing = false;
  _chatStartFadeTimer();
}

function _chatShowMsg(el) {
  if (!_isMobile()) return;
  const msgs = document.getElementById('chatMessages');
  msgs.classList.remove('chat-sweep-fade');
  msgs.style.opacity = '1';
  msgs.style.webkitMaskImage = '';
  msgs.style.maskImage = '';
  const overlay = document.getElementById('chatOverlay');
  if (!overlay.classList.contains('chat-idle')) overlay.classList.add('chat-idle');
  el.classList.add('chat-active-msg');
  _chatState = 'active';
}

function _chatRevealAll() {
  if (!_isMobile()) return;
  const msgs = document.getElementById('chatMessages');
  msgs.classList.remove('chat-sweep-fade');
  msgs.style.opacity = '1';
  msgs.style.webkitMaskImage = '';
  msgs.style.maskImage = '';
  const overlay = document.getElementById('chatOverlay');
  overlay.classList.remove('chat-idle');
  _chatState = 'active';
  _chatStartFadeTimer();
}

// Chat msg hook — called by chat.js via S.hooks.onChatMsg
function _onChatMsg(role, el) {
  if (!_isMobile()) return;
  if (role === 'user') {
    _chatConversing = true;
    clearTimeout(_chatFadeTimer);
    _chatShowMsg(el);
  } else if (role === 'avatar') {
    _chatShowMsg(el);
  } else if (role === 'system' || role === 'lookup') {
    _chatShowMsg(el);
    _chatStartFadeTimer();
  }
}

// --- Mobile Lookup Dialog ---
let _lookupDialogTimer = null;

let _lookupTouchBound = false;

export function openMobileLookup() {
  const dlg = document.getElementById('mobileLookupDialog');
  const body = document.getElementById('mobileLookupBody');
  body.innerHTML = document.getElementById('lookupList').innerHTML;
  dlg.style.display = 'flex';
  clearTimeout(_lookupDialogTimer);
  _lookupDialogTimer = setTimeout(closeMobileLookup, 5000);
  if (!_lookupTouchBound) {
    _lookupTouchBound = true;
    dlg.addEventListener('touchstart', () => {
      clearTimeout(_lookupDialogTimer);
      _lookupDialogTimer = setTimeout(closeMobileLookup, 5000);
    }, { passive: true });
  }
}

export function closeMobileLookup() {
  document.getElementById('mobileLookupDialog').style.display = 'none';
  clearTimeout(_lookupDialogTimer);
}

// --- Wrapped Functions (mobile overrides) ---
export function mobileToggleLookupPanel(e) {
  if (e) e.stopPropagation();
  if (_isMobile()) {
    openMobileLookup();
  } else {
    _baseLookup(e);
  }
}

export async function mobileChangeLang(lang) {
  await changeLang(lang);
  const sel = document.getElementById('langSelect');
  const msel = document.getElementById('mobileLangSelect');
  if (sel) sel.value = lang;
  if (msel) msel.value = lang;
}

export function mobileToggleTTS(btn) {
  _baseTTS(btn);
  const mBtn = document.getElementById('mobileTTS');
  if (mBtn) mBtn.textContent = TTS_CONFIG.enabled ? '🔊' : '🔇';
}

// --- Init (called by main.js) ---
export function initMobile() {
  // Set hooks
  S.hooks.onBubbleComplete = _onBubbleComplete;
  S.hooks.onTTSComplete = _onTTSComplete;
  S.hooks.onChatMsg = _onChatMsg;

  // Scroll → reveal all
  const msgs = document.getElementById('chatMessages');
  if (msgs) {
    msgs.addEventListener('scroll', () => {
      if (_isMobile() && _chatState === 'idle') _chatRevealAll();
    }, { passive: true });
    msgs.addEventListener('touchmove', () => {
      if (_isMobile() && _chatState === 'idle') _chatRevealAll();
    }, { passive: true });
  }

  // Mobile: start in idle state
  if (_isMobile()) {
    document.getElementById('chatOverlay').classList.add('chat-idle');
  }
}
