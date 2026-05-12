// NVatar SDK Chat — Chat room view (KakaoTalk-style + portrait travel).
//
// Behaviors:
//  - left bubble (assistant, gray) / right bubble (user, yellow)
//  - date dividers, group consecutive same-author/minute (name once, time once)
//  - portrait (MiniPortrait) travels to the latest assistant bubble row;
//    older bubbles release their portrait slot (padding-left drops),
//    so the row visually re-expands when portrait moves on.
//  - WS chat protocol: typing | bubble | bubble_lookup | lookup_start |
//                       lookup_end | emotion_update | proactive | error
//  - Whisper STT mic button.

import { MiniPortrait } from './portrait-mini.js';

const STYLE_ID = 'nv-sdk-room-style';
const BUBBLE_GAP_MS = 400;
const DEBOUNCE_MS = 800;
const WHISPER_MAX_SEC = 20;

export async function renderRoomView(sdk, ctx) {
  ensureStyle();

  const root = ctx.root;
  const avatarId = ctx.params.avatarId;
  const avatarName = ctx.params.avatarName || '아바타';
  root.innerHTML = renderTemplate(avatarName);

  const els = {
    msgs: root.querySelector('.nv-msgs'),
    typing: root.querySelector('.nv-typing'),
    portraitSlot: root.querySelector('.nv-portrait'),
    input: root.querySelector('.nv-input'),
    sendBtn: root.querySelector('.nv-send'),
    micBtn: root.querySelector('.nv-mic'),
    statusDot: root.querySelector('.nv-status'),
  };

  // State
  const state = {
    sock: null,
    portrait: null,
    portraitAnchor: null,     // current assistant row that owns the portrait
    bubbleQueue: [],
    bubbleProcessing: false,
    pendingMessages: [],
    debounceTimer: null,
    isComposing: false,
    rendererCleanup: null,
    rows: [],                 // [{ role, content, ts, el }]
    lastDateLabel: '',
    media: null,
    isRecording: false,
    micSec: 0,
    micTimer: null,
  };

  // Back button → list
  root.querySelector('.nv-back').addEventListener('click', () => history.back());

  // Boot: VRM resolve + load + open WS + restore history
  bootRoom().catch(err => addSystemMsg('초기화 실패: ' + (err.message || err)));

  async function bootRoom() {
    // 1) Fetch avatar (for vrm_uid + name)
    const all = await sdk.api.listAvatars();
    const avatar = all.find(a => a.id === avatarId);
    if (!avatar) throw new Error('Avatar not found');
    root.querySelector('.nv-title').textContent = `${avatar.name}와의 채팅`;

    // 2) Portrait widget (created early so it can attach as soon as first bubble arrives)
    state.portrait = new MiniPortrait({ size: 56 });
    els.portraitSlot.appendChild(state.portrait.canvas);

    // 3) Resolve + load VRM (best-effort). api.resolveVrm 이 이미 절대 URL 로 변환해줌.
    if (avatar.vrm_uid) {
      try {
        const model = await sdk.api.resolveVrm(avatar.vrm_uid);
        console.log('[NVatar] loading VRM:', model.url);
        await state.portrait.loadVrm(model.url);
        console.log('[NVatar] VRM loaded');
      } catch (e) {
        console.error('[NVatar] VRM load failed:', e);
        addSystemMsg('아바타 모델 로딩에 실패했어요 (' + (e.message || e) + ')');
      }
    } else {
      addSystemMsg('아바타에 모델이 연결되어 있지 않아요');
    }

    // 4) Restore message history. 백엔드는 ORDER BY id ASC (오래된 것 먼저) 로 응답.
    try {
      const history = await sdk.api.getMessages(avatarId, 50);
      console.log('[NVatar] history:', history.length, 'messages');
      if (history.length) {
        history.forEach(m => {
          const role = m.role === 'user' ? 'user' : 'assistant';
          appendMessage({ role, content: m.content, ts: m.created_at, fromHistory: true, name: avatar.name });
        });
        // Portrait travel to latest assistant after history paint.
        // VRM may still be loading; movePortraitToLatest is idempotent and will
        // re-anchor automatically on subsequent bubbles.
        movePortraitToLatest();
      }
    } catch(e) {
      console.error('[NVatar] history load failed:', e);
      addSystemMsg('이전 대화 불러오기 실패: ' + (e.message || e));
    }

    // 5) Open WebSocket
    state.sock = sdk.api.openChatSocket(avatarId);
    await state.sock.ready;
    els.statusDot.classList.add('online');

    state.sock.onMessage((data) => handleWsMessage(data, avatar.name));
    state.sock.onClose(() => {
      els.statusDot.classList.remove('online');
      addSystemMsg('연결이 끊겼습니다');
    });

    // 6) Signal client_ready — 백엔드가 첫 인사(호칭 정하기) + 대기 중 proactive 를
    //    이 신호 후에 발화. 이게 없으면 아바타가 먼저 말 안 함.
    state.sock.sendEvent('client_ready');

    scrollBottom();
  }

  // --- WS handlers ---

  function handleWsMessage(data, avatarName) {
    switch (data.type) {
      case 'typing':
        showTyping();
        break;
      case 'bubble':
      case 'bubble_lookup':
        state.bubbleQueue.push({ text: data.text, lookup: data.type === 'bubble_lookup', name: avatarName });
        if (!state.bubbleProcessing) processBubbleQueue();
        break;
      case 'lookup_start':
        showTyping();
        addSystemMsg('관련 정보를 찾아보고 있어요…');
        break;
      case 'lookup_end':
        hideTyping();
        break;
      case 'emotion_update':
        if (data.emotions && state.portrait) state.portrait.setEmotion(data.emotions);
        break;
      case 'proactive':
        // 프로액티브 채팅 — 시간 기반 발화 + client_ready 시 큐 flush.
        appendMessage({ role: 'assistant', content: data.message, ts: new Date().toISOString(), name: avatarName, proactive: true });
        movePortraitToLatest();
        break;
      case 'error':
        hideTyping();
        addSystemMsg('오류: ' + data.text);
        els.sendBtn.disabled = false;
        break;

      // --- Explicitly ignored (out of scope for chat-only SDK) ---
      case 'monologue':       // 혼잣말 — 사용자 요구로 SDK 비노출. monologue_request 도 SDK 가 보내지 않음.
      case 'avatar_return':   // 환경 re-entry 신호 (Avatar OS) — 환경 요소 비활성
      case 'code_result':     // code-assist 패턴 전용 — 이번 SDK 는 normal 모드만
      case 'monologue_start':
      case 'monologue_end':
        console.debug('[NVatar] ignored event:', data.type);
        break;

      default:
        console.debug('[NVatar] unhandled event:', data.type, data);
    }
  }

  async function processBubbleQueue() {
    state.bubbleProcessing = true;
    while (state.bubbleQueue.length > 0) {
      const item = state.bubbleQueue.shift();
      hideTyping();
      els.sendBtn.disabled = false;
      appendMessage({ role: 'assistant', content: item.text, ts: new Date().toISOString(), name: item.name, lookup: item.lookup });
      movePortraitToLatest();
      if (state.bubbleQueue.length > 0) {
        await sleep(BUBBLE_GAP_MS);
      }
    }
    state.bubbleProcessing = false;
  }

  // --- Message append + grouping + portrait travel ---

  function appendMessage({ role, content, ts, name, lookup, proactive }) {
    const date = new Date(ts || Date.now());
    const dateLabel = formatDateLabel(date);
    const timeLabel = formatTime(date);

    // Date divider if date changed
    if (dateLabel !== state.lastDateLabel) {
      const div = document.createElement('div');
      div.className = 'nv-date-divider';
      div.innerHTML = `<span>${dateLabel}</span>`;
      els.msgs.insertBefore(div, els.typing);
      state.lastDateLabel = dateLabel;
    }

    // Grouping: same role + same minute as previous row → previous row's time hides.
    // Name labels are not rendered (portrait is the sole identity signal).
    const prev = state.rows[state.rows.length - 1];
    const sameGroup = prev && prev.role === role && prev.timeLabel === timeLabel && !prev.isProactive;
    if (sameGroup && prev.el) {
      const prevTime = prev.el.querySelector('.nv-time');
      if (prevTime) prevTime.style.display = 'none';
    }

    const row = document.createElement('div');
    row.className = `nv-row nv-row-${role}` + (proactive ? ' nv-proactive' : '');
    row.innerHTML = `
      <div class="nv-bubble-wrap">
        <div class="nv-bubble ${lookup ? 'nv-bubble-lookup' : ''}">${escapeHtml(content)}</div>
        <div class="nv-time">${escapeHtml(timeLabel)}</div>
      </div>
    `;
    els.msgs.insertBefore(row, els.typing);

    state.rows.push({ role, content, ts, timeLabel, isProactive: !!proactive, el: row });
    scrollBottom();
  }

  function movePortraitToLatest() {
    // Find latest assistant row
    let latest = null;
    for (let i = state.rows.length - 1; i >= 0; i--) {
      if (state.rows[i].role === 'assistant') { latest = state.rows[i]; break; }
    }
    if (!latest) return;

    // Release portrait slot on previous anchor row
    if (state.portraitAnchor && state.portraitAnchor !== latest.el) {
      state.portraitAnchor.classList.remove('nv-has-portrait');
    }

    latest.el.classList.add('nv-has-portrait');
    state.portraitAnchor = latest.el;

    // Portrait lives inside .nv-msgs (scrolls with content) — use offsetTop directly.
    // RAF wait ensures the row's geometry is settled (padding-left transition just kicked in).
    requestAnimationFrame(() => {
      const top = latest.el.offsetTop;
      els.portraitSlot.style.transform = `translateY(${Math.max(0, top)}px)`;
      els.portraitSlot.classList.add('nv-visible');
    });
  }

  function addSystemMsg(text) {
    const row = document.createElement('div');
    row.className = 'nv-row nv-row-system';
    row.innerHTML = `<div class="nv-sys">${escapeHtml(text)}</div>`;
    els.msgs.insertBefore(row, els.typing);
    scrollBottom();
  }

  function showTyping() { els.typing.classList.add('nv-visible'); scrollBottom(); }
  function hideTyping() { els.typing.classList.remove('nv-visible'); }
  function scrollBottom() { requestAnimationFrame(() => { els.msgs.scrollTop = els.msgs.scrollHeight; }); }

  // --- Input ---

  els.input.addEventListener('compositionstart', () => { state.isComposing = true; });
  els.input.addEventListener('compositionend', () => { state.isComposing = false; });
  els.input.addEventListener('keydown', (e) => {
    if (state.isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitInput(); }
  });
  els.sendBtn.addEventListener('click', submitInput);

  function submitInput() {
    const text = els.input.value.trim();
    if (!text || !state.sock?.isOpen) return;
    appendMessage({ role: 'user', content: text, ts: new Date().toISOString() });
    els.input.value = '';

    // Debounce successive sends into one combined message
    state.pendingMessages.push(text);
    clearTimeout(state.debounceTimer);
    state.debounceTimer = setTimeout(flushPending, DEBOUNCE_MS);
  }

  function flushPending() {
    if (!state.pendingMessages.length || !state.sock?.isOpen) return;
    const combined = state.pendingMessages.join('\n');
    state.pendingMessages = [];
    els.sendBtn.disabled = true;
    showTyping();
    state.sock.send(combined);
  }

  // --- Mic / Whisper STT ---

  els.micBtn.addEventListener('click', () => state.isRecording ? stopMic() : startMic());

  async function startMic() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const rec = new MediaRecorder(stream, { mimeType });
      const chunks = [];
      rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        if (!chunks.length) return;
        const blob = new Blob(chunks, { type: mimeType });
        await transcribeAndSend(blob, mimeType.includes('webm') ? 'webm' : 'm4a');
      };
      rec.start();
      state.media = rec;
      state.isRecording = true;
      state.micSec = 0;
      els.micBtn.classList.add('recording');
      state.micTimer = setInterval(() => {
        state.micSec++;
        if (state.micSec >= WHISPER_MAX_SEC) stopMic();
      }, 1000);
    } catch (e) {
      addSystemMsg('마이크 권한이 필요합니다');
    }
  }

  function stopMic() {
    if (state.media && state.media.state === 'recording') state.media.stop();
    state.isRecording = false;
    clearInterval(state.micTimer);
    els.micBtn.classList.remove('recording');
  }

  async function transcribeAndSend(blob, ext) {
    addSystemMsg('음성 인식 중…');
    try {
      const text = await sdk.api.transcribe(blob, { filename: 'voice.' + ext });
      if (text) {
        els.input.value = text;
        submitInput();
        clearTimeout(state.debounceTimer);
        flushPending();
      } else {
        addSystemMsg('음성이 인식되지 않았어요');
      }
    } catch (e) {
      addSystemMsg('음성 인식 실패: ' + (e.message || e));
    }
  }

  // --- Cleanup on route change ---

  return () => {
    if (state.sock) state.sock.close();
    if (state.portrait) state.portrait.destroy();
    clearTimeout(state.debounceTimer);
    clearInterval(state.micTimer);
    if (state.media && state.media.state === 'recording') state.media.stop();
  };
}

// --- helpers ---

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function formatDateLabel(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}년 ${m}월 ${day}일`;
}

function formatTime(d) {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function renderTemplate(name) {
  return `
<div class="nv-screen nv-room-screen">
  <header class="nv-header">
    <button class="nv-back" aria-label="뒤로">‹</button>
    <h1 class="nv-title">${escapeHtml(name)}와의 채팅</h1>
    <span class="nv-status" aria-hidden="true"></span>
  </header>
  <div class="nv-msgs-area">
    <div class="nv-msgs">
      <div class="nv-portrait" aria-hidden="true"></div>
      <div class="nv-typing"><div></div><div></div><div></div></div>
    </div>
  </div>
  <footer class="nv-input-area">
    <input class="nv-input" placeholder="여기에 메시지 입력" />
    <button class="nv-send" aria-label="보내기">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
    </button>
    <button class="nv-mic" aria-label="음성">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
    </button>
  </footer>
</div>`;
}

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const css = `
.nv-room-screen { display: flex; flex-direction: column; height: 100%; background: #ffffff; color: #111827; position: relative; }
.nv-room-screen .nv-header { display: flex; align-items: center; gap: 8px; padding: 14px 16px; border-bottom: 1px solid #e5e7eb; flex-shrink: 0; }
.nv-room-screen .nv-title { font-size: 18px; font-weight: 700; flex: 1; }
.nv-room-screen .nv-back { width: 32px; height: 32px; border: none; background: transparent; font-size: 24px; color: #111827; cursor: pointer; padding: 0; line-height: 1; }
.nv-status { width: 8px; height: 8px; border-radius: 50%; background: #d1d5db; }
.nv-status.online { background: #10b981; }

.nv-msgs-area { flex: 1; position: relative; overflow: hidden; }
.nv-msgs { position: relative; height: 100%; overflow-y: auto; padding: 14px 14px 16px; display: flex; flex-direction: column; gap: 4px; }

/* Bigger breathing room when speaker switches */
.nv-row-assistant + .nv-row-user,
.nv-row-user + .nv-row-assistant { margin-top: 14px; }

.nv-date-divider { display: flex; align-items: center; gap: 12px; margin: 18px 8px; }
.nv-date-divider::before, .nv-date-divider::after { content: ''; flex: 1; height: 1px; background: #e5e7eb; }
.nv-date-divider span { font-size: 13px; color: #4b5563; font-weight: 600; }

.nv-row { display: flex; flex-direction: column; gap: 4px; max-width: 100%; }
.nv-row-assistant { align-items: flex-start; padding-right: 32px; transition: padding-left 0.35s ease; padding-left: 4px; }
.nv-row-assistant.nv-has-portrait { padding-left: 68px; }
.nv-row-user { align-items: flex-end; padding-left: 32px; }
.nv-row-system { align-items: center; }

.nv-msg-name { font-size: 13px; font-weight: 700; color: #111827; }

.nv-bubble-wrap { display: flex; align-items: flex-end; gap: 6px; max-width: 100%; }
.nv-row-user .nv-bubble-wrap { flex-direction: row-reverse; }
.nv-bubble { padding: 10px 14px; border-radius: 14px; font-size: 14px; line-height: 1.55; word-break: break-word; white-space: pre-wrap; max-width: min(78%, 320px); }
.nv-row-assistant .nv-bubble { background: #f3f4f6; color: #111827; border-top-left-radius: 4px; }
.nv-row-user .nv-bubble { background: #fde68a; color: #111827; border-top-right-radius: 4px; }
.nv-bubble-lookup { border-left: 3px solid #10b981; }
.nv-time { font-size: 11px; color: #9ca3af; flex-shrink: 0; }
.nv-proactive .nv-bubble { background: #fef3c7; border: 1px solid #fcd34d; color: #92400e; }

.nv-sys { font-size: 11px; color: #9ca3af; padding: 4px 0; }

.nv-typing { display: none; align-items: center; gap: 4px; padding: 10px 14px; background: #f3f4f6; border-radius: 14px; border-top-left-radius: 4px; align-self: flex-start; margin-left: 68px; }
.nv-typing.nv-visible { display: inline-flex; }
.nv-typing div { width: 6px; height: 6px; border-radius: 50%; background: #9ca3af; animation: nv-bounce 1.3s infinite; }
.nv-typing div:nth-child(2) { animation-delay: 0.15s; }
.nv-typing div:nth-child(3) { animation-delay: 0.3s; }
@keyframes nv-bounce { 0%,60%,100% { transform: translateY(0); opacity: 0.4; } 30% { transform: translateY(-4px); opacity: 1; } }

/* Portrait — absolutely positioned inside .nv-msgs so it scrolls with content.
   transform: translateY() anchors it to the latest assistant row's offsetTop.
   Dark background so VRM characters (typically light-toned) stand out. */
.nv-portrait {
  position: absolute; left: 0; top: 0;
  width: 56px; height: 56px;
  border-radius: 50%;
  overflow: hidden;
  pointer-events: none;
  opacity: 0;
  transition: transform 0.35s cubic-bezier(.5,.1,.25,1), opacity 0.3s ease;
  -webkit-mask-image: radial-gradient(circle at center, black 82%, transparent 100%);
          mask-image: radial-gradient(circle at center, black 82%, transparent 100%);
  background: radial-gradient(circle at 50% 40%, #2a3447 0%, #0f172a 100%);
  border: 1px solid rgba(255,255,255,0.08);
}
.nv-portrait.nv-visible { opacity: 1; }

/* Input bar */
.nv-input-area { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-top: 1px solid #e5e7eb; flex-shrink: 0; background: #ffffff; }
.nv-input { flex: 1; padding: 12px 14px; font-size: 14px; border: 1px solid #e5e7eb; border-radius: 22px; background: #fff; color: #111827; outline: none; }
.nv-input:focus { border-color: #3b46c4; }
.nv-send, .nv-mic { width: 40px; height: 40px; border-radius: 50%; border: none; background: transparent; color: #6b7280; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.nv-send:active, .nv-mic:active { background: #f3f4f6; }
.nv-mic.recording { color: #ef4444; background: rgba(239,68,68,0.1); animation: nv-pulse 1.4s infinite; }
@keyframes nv-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.3); } 50% { box-shadow: 0 0 0 8px rgba(239,68,68,0); } }
`;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = css;
  document.head.appendChild(s);
}
