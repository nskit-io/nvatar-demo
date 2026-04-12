// NVatar Room — WebSocket Chat, Message Display, Auto Reconnect
import S from './state.js';
import { t } from './i18n.js';
import { showBubble } from './bubble.js';
import { detectMoodFromText, detectGestureFromText, setMood } from './mood.js';
import { playGesture } from './animation.js';
import { speakTTS } from './tts.js';
import { returnToCenter, pauseRoaming } from './roaming.js';
import { addLookupResult, NVatarSDK } from './lookup.js';

export function connectChat(avatarId) {
  if (S.chatWs) S.chatWs.close();
  S.currentAvatarId = avatarId;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsHost = S.API_BASE ? 'nvatar.nskit.io' : location.host;
  S.chatWs = new WebSocket(`${proto}//${wsHost}/ws/chat/${avatarId}`);

  S.chatWs.onopen = () => {
    addChatMsg('system', t('connected'));
  };

  S.chatWs.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.type === 'bubble_lookup') {
      addLookupResult(data);
      if (NVatarSDK.onLookupResult) NVatarSDK.onLookupResult(data);
    } else if (data.type === 'bubble') {
      S._waitingForResponse = false;
      addChatMsg('avatar', data.text);
      showBubble(0, data.text);
      speakTTS(data.text);
      const mood = detectMoodFromText(data.text);
      if (mood) {
        setMood(mood);
        const gesture = detectGestureFromText(data.text);
        if (gesture) setTimeout(() => playGesture(gesture), 500);
      }
      pauseRoaming();
    } else if (data.type === 'typing') {
      showBubble(0, '...');
      returnToCenter();
      pauseRoaming();
    } else if (data.type === 'proactive') {
      showBubble(0, data.message);
      addChatMsg('avatar', data.message);
      speakTTS(data.message);
      const mood = detectMoodFromText(data.message);
      if (mood) setMood(mood);
    } else if (data.type === 'monologue') {
      showBubble(0, data.text);
      addChatMsg('avatar', data.text);
      const mood = detectMoodFromText(data.text);
      if (mood) setMood(mood);
    } else if (data.type === 'emotion_update' && data.emotions) {
      const emo = data.emotions;
      if (emo.joy > 65) { setMood('happy'); playGesture('cheer'); }
      else if (emo.sadness > 50) setMood('sad');
      else if (emo.excitement > 60) { setMood('happy'); playGesture('wave'); }
    }
  };

  S.chatWs.onclose = () => {
    addChatMsg('system', t('disconnected'));
    S.chatWs = null;
    _scheduleReconnect(avatarId);
  };

  S.chatWs.onerror = () => {};
}

// --- Auto Reconnect ---
let _reconnectTimer = null;
let _reconnectAttempt = 0;
const _RECONNECT_INTERVALS = [3000, 5000, 10000, 15000, 30000];

function _scheduleReconnect(avatarId) {
  if (_reconnectTimer) return;
  const delay = _RECONNECT_INTERVALS[Math.min(_reconnectAttempt, _RECONNECT_INTERVALS.length - 1)];
  _reconnectAttempt++;
  _reconnectTimer = setTimeout(async () => {
    _reconnectTimer = null;
    try {
      const res = await fetch(S.API_BASE + '/health');
      if (res.ok) {
        addChatMsg('system', '🔄 ' + t('reconnecting'));
        connectChat(avatarId);
        _reconnectAttempt = 0;
        return;
      }
    } catch(e) {}
    _scheduleReconnect(avatarId);
  }, delay);
}

// --- Chat Message Display ---
export function addChatMsg(role, text) {
  const container = document.getElementById('chatMessages');
  const el = document.createElement('div');
  el.className = 'chat-msg';
  if (role === 'user') {
    el.style.cssText = 'align-self:flex-end;background:#6366f1;color:#fff;padding:6px 12px;border-radius:12px;border-bottom-right-radius:2px;font-size:12px;max-width:80%;word-break:break-word;';
  } else if (role === 'avatar') {
    el.style.cssText = 'align-self:flex-start;background:rgba(30,41,59,0.95);color:#e2e8f0;padding:6px 12px;border-radius:12px;border-bottom-left-radius:2px;font-size:12px;max-width:80%;border:1px solid #334155;word-break:break-word;';
  } else if (role === 'lookup') {
    el.style.cssText = 'align-self:flex-start;background:rgba(20,30,48,0.9);color:#94a3b8;padding:8px 12px;border-radius:8px;font-size:11px;max-width:85%;border-left:3px solid #475569;word-break:break-word;';
    el.textContent = t('lookupPrefix') + text;
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
    // Notify mobile hook
    if (S.hooks.onChatMsg) S.hooks.onChatMsg(role, el);
    return;
  } else {
    el.style.cssText = 'align-self:center;color:#64748b;font-size:10px;padding:2px;';
  }
  el.textContent = text;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
  // Notify mobile hook
  if (S.hooks.onChatMsg) S.hooks.onChatMsg(role, el);
}

// --- IME Handling ---
let _imeComposing = false;
document.addEventListener('DOMContentLoaded', () => {
  const ci = document.getElementById('chatInput');
  if (ci) {
    ci.addEventListener('compositionstart', () => { _imeComposing = true; });
    ci.addEventListener('compositionend', () => { _imeComposing = false; });
    ci.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !_imeComposing) { e.preventDefault(); sendChat(); }
    });
  }
});

// --- Send Chat ---
export function sendChat() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';

  // Import dynamically to avoid circular — stopTTS is lightweight
  import('./tts.js').then(mod => mod.stopTTS());

  addChatMsg('user', text);

  if (S.chatWs && S.chatWs.readyState === 1) {
    S.chatWs.send(JSON.stringify({ type: 'message', text }));
    S._waitingForResponse = true;
    returnToCenter();
    pauseRoaming();
    showBubble(0, '...');
  } else {
    addChatMsg('system', t('noAvatarSend'));
  }
}
