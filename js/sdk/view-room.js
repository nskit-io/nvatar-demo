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

import { createPortrait } from './portrait.js';
import { openStatsDialog } from './view-stats.js';
import { openSearchHistoryDialog } from './view-search-history.js';
import { showDialog } from './view-list.js';
import { findCharacter } from './brand.js';

const STYLE_ID = 'nv-sdk-room-style';
const BUBBLE_GAP_MS = 400;
const DEBOUNCE_MS = 800;
const WHISPER_MAX_SEC = 20;
const HISTORY_PAGE_SIZE = 50;
const SCROLL_TOP_THRESHOLD = 60;  // px from top before triggering older page load

export async function renderRoomView(sdk, ctx) {
  ensureStyle();

  const root = ctx.root;
  const avatarId = ctx.params.avatarId;
  const avatarName = ctx.params.avatarName || '아바타';
  root.innerHTML = renderTemplate(avatarName);
  // Desktop / wide 모드에선 헤더 좌측 백버튼 숨김 (옆에 list pane 영구 노출).
  if (sdk.isMobileMode && !sdk.isMobileMode()) {
    const back = root.querySelector('.nv-back');
    if (back) back.style.display = 'none';
  }

  const els = {
    msgs: root.querySelector('.nv-msgs'),
    typing: root.querySelector('.nv-typing'),
    portraitSlot: root.querySelector('.nv-portrait'),
    input: root.querySelector('.nv-input'),
    sendBtn: root.querySelector('.nv-send'),
    micBtn: root.querySelector('.nv-mic'),
    statusDot: root.querySelector('.nv-status'),
    searchBtn: root.querySelector('.nv-search-btn'),
    searchCount: root.querySelector('.nv-search-count'),
    clearBtn: root.querySelector('.nv-clear-btn'),
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
    avatar: null,             // resolved avatar record (for stats dialog)
    searches: [],             // bubble_lookup history — in-memory, cleared on route leave
    thinkingRow: null,        // placeholder row owning portrait while avatar "thinks"
    oldestLoadedId: null,     // cursor for scroll-top infinite history
    hasMoreHistory: true,     // false when backend returns < page size
    loadingMore: false,       // in-flight guard
  };

  // Portrait click → stats dialog (read-only)
  els.portraitSlot.addEventListener('click', (e) => {
    e.stopPropagation();
    if (state.avatar) openStatsDialog(root, state.avatar);
  });

  // Search history button — always visible. Empty state is handled by
  // the dialog itself ("이번 대화에서는 아직 검색이 없어요.")
  els.searchBtn.addEventListener('click', () => {
    openSearchHistoryDialog(root, state.searches);
  });

  function updateSearchBadge() {
    els.searchCount.textContent = state.searches.length;
    // Visual cue: dim the count badge when empty
    els.searchBtn.classList.toggle('nv-search-empty', state.searches.length === 0);
  }
  updateSearchBadge();

  // Conversation reset — wipes server-side history + reloads the room so
  // the first_meeting greeting fires fresh.
  els.clearBtn.addEventListener('click', () => {
    showDialog(root, {
      title: '대화 초기화',
      body: `${state.avatar?.name || '이 아바타'}와의 모든 대화 기록을 삭제할까요?\n되돌릴 수 없어요.`,
      cancel: '취소',
      confirm: '초기화',
      confirmDanger: true,
      onConfirm: async () => {
        try {
          await sdk.api.clearMessages(avatarId);
          // Re-enter the room — Router.cleanup closes WS, MiniPortrait.destroy,
          // then bootRoom restarts everything including client_ready.
          sdk.goToRoom(avatarId, state.avatar?.name || '');
        } catch (e) {
          showDialog(root, { title: '초기화 실패', body: e.message || String(e), confirm: '확인', onConfirm: () => {} });
        }
      },
    });
  });

  // Back button → list
  root.querySelector('.nv-back').addEventListener('click', () => history.back());

  // Boot: VRM resolve + load + open WS + restore history
  bootRoom().catch(err => addSystemMsg('초기화 실패: ' + (err.message || err)));

  async function bootRoom() {
    // 1) Fetch avatar (for vrm_uid + name). Prefer get-by-id to pick up
    //    emotions/MBTI fields that list endpoint may not include.
    let avatar;
    try {
      const res = await fetch(`${sdk.api.coreBase}/api/v1/avatars/${avatarId}`);
      const d = await res.json();
      avatar = d.response;
    } catch {}
    if (!avatar) {
      const all = await sdk.api.listAvatars();
      avatar = all.find(a => a.id === avatarId);
    }
    if (!avatar) throw new Error('Avatar not found');
    state.avatar = avatar;
    root.querySelector('.nv-title').textContent = `${avatar.name}와의 채팅`;

    // 2) Portrait widget — character source 분기:
    //    a) brand.characters 에 매칭 = 프랜차이즈 (kind 명시: vrm 또는 2d)
    //    b) 아니면 res 서버 VRM 으로 resolve (legacy / NVatar default)
    const franchiseChar = findCharacter(sdk.brand, avatar.vrm_uid);
    if (franchiseChar) {
      state.portrait = await createPortrait({
        kind: franchiseChar.kind,
        size: 56,
        src: franchiseChar.portrait,
        emotionVariants: franchiseChar.emotionVariants,
      });
      els.portraitSlot.appendChild(state.portrait.canvas);
      if (franchiseChar.kind === 'vrm' && franchiseChar.vrmUrl) {
        try { await state.portrait.loadVrm(franchiseChar.vrmUrl); }
        catch (e) { console.error('[NVatar] franchise VRM load failed:', e); }
      }
    } else {
      state.portrait = await createPortrait({ kind: 'vrm', size: 56 });
      els.portraitSlot.appendChild(state.portrait.canvas);
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
    }

    // 4) Restore message history (first page = newest 50).
    //    Older pages load on scroll-top via loadMoreHistory().
    try {
      const history = await sdk.api.getMessages(avatarId, HISTORY_PAGE_SIZE);
      console.log('[NVatar] history:', history.length, 'messages');
      if (history.length) {
        history.forEach(m => {
          const role = m.role === 'user' ? 'user' : 'assistant';
          appendMessage({ role, content: m.content, ts: m.created_at, fromHistory: true, name: avatar.name, msgId: m.id });
        });
        state.oldestLoadedId = history[0].id;
        state.hasMoreHistory = history.length >= HISTORY_PAGE_SIZE;
        movePortraitToLatest();
      } else {
        state.hasMoreHistory = false;
      }
    } catch(e) {
      console.error('[NVatar] history load failed:', e);
      addSystemMsg('이전 대화 불러오기 실패: ' + (e.message || e));
    }

    // Scroll-top loader for older messages
    els.msgs.addEventListener('scroll', onScrollMaybeLoadMore);

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
        // Suppress the separate typing bar when we already have a
        // placeholder row showing its own thinking dots.
        if (!state.thinkingRow) showTyping();
        break;
      case 'bubble':
        state.bubbleQueue.push({ type: 'bubble', text: data.text, name: avatarName });
        if (!state.bubbleProcessing) processBubbleQueue();
        break;
      case 'bubble_lookup': {
        const searchIdx = state.searches.length;
        state.searches.push({
          query: data.query,
          text: data.text || '',
          items: data.items || [],
          ts: new Date().toISOString(),
        });
        updateSearchBadge();
        // Render as a compact action card (one-line title), not as a chat bubble.
        // Tapping it opens the search history dialog scrolled+expanded to this entry.
        state.bubbleQueue.push({
          type: 'action_search',
          query: data.query || '검색 결과',
          searchIdx,
          name: avatarName,
        });
        if (!state.bubbleProcessing) processBubbleQueue();
        break;
      }
      case 'lookup_start':
        showTyping();
        addSystemMsg('관련 정보를 찾아보고 있어요…');
        break;
      case 'lookup_end':
        hideTyping();
        break;
      case 'emotion_update':
        if (data.emotions) {
          if (state.portrait) state.portrait.setEmotion(data.emotions);
          // Keep state.avatar.emotions live so stats dialog opens with fresh data
          if (state.avatar) state.avatar.emotions = { ...(state.avatar.emotions || {}), ...data.emotions };
        }
        break;
      case 'proactive':
        // 프로액티브 채팅 — 시간 기반 발화 + client_ready 시 큐 flush.
        appendMessage({ role: 'assistant', content: data.message, ts: new Date().toISOString(), name: avatarName, proactive: true });
        movePortraitToLatest();
        break;
      case 'error':
        hideTyping();
        clearThinkingPlaceholder();
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
      if (item.type === 'action_search') {
        appendActionBubble({
          query: item.query,
          searchIdx: item.searchIdx,
          ts: new Date().toISOString(),
        });
        // No portrait travel for action bubbles — portrait stays anchored to
        // the latest *spoken* assistant row, which keeps the avatar's identity
        // signal continuous through the search interaction.
      } else {
        // First assistant bubble after user send → fill the thinking
        // placeholder in-place (portrait already there).
        const filled = fillThinkingPlaceholder({
          content: item.text, name: item.name,
          lookup: false, ts: new Date().toISOString(),
        });
        if (!filled) {
          appendMessage({ role: 'assistant', content: item.text, ts: new Date().toISOString(), name: item.name });
          movePortraitToLatest();
        }
      }
      if (state.bubbleQueue.length > 0) {
        await sleep(BUBBLE_GAP_MS);
      }
    }
    state.bubbleProcessing = false;
  }

  function appendActionBubble({ query, searchIdx, ts }) {
    const date = new Date(ts || Date.now());
    const dateLabel = formatDateLabel(date);
    if (dateLabel !== state.lastDateLabel) {
      const div = document.createElement('div');
      div.className = 'nv-date-divider';
      div.innerHTML = `<span>${dateLabel}</span>`;
      els.msgs.insertBefore(div, els.typing);
      state.lastDateLabel = dateLabel;
    }
    const row = document.createElement('div');
    row.className = 'nv-row nv-row-action';
    row.innerHTML = `
      <button type="button" class="nv-action-card" data-search-idx="${searchIdx}">
        <span class="nv-action-icon">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </span>
        <span class="nv-action-body">
          <span class="nv-action-eyebrow">검색 결과</span>
          <span class="nv-action-title">${escapeHtml(query)}</span>
        </span>
        <span class="nv-action-chev" aria-hidden="true">›</span>
      </button>
      <div class="nv-time">${escapeHtml(formatTime(date))}</div>
    `;
    row.querySelector('.nv-action-card').addEventListener('click', () => {
      openSearchHistoryDialog(root, state.searches, { expandIdx: searchIdx });
    });
    els.msgs.insertBefore(row, els.typing);
    // Action rows don't take portrait — push a marker so grouping logic
    // doesn't fuse a following assistant bubble with whatever preceded.
    state.rows.push({ role: 'action', el: row, ts, timeLabel: formatTime(date) });
    scrollBottom();
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
    // Name label only renders for the row that currently owns the portrait
    // (CSS-gated via .nv-has-portrait). Other assistant rows render unlabeled.
    row.innerHTML = `
      ${role === 'assistant' ? `<div class="nv-msg-name">${escapeHtml(name || '')}</div>` : ''}
      <div class="nv-bubble-wrap">
        <div class="nv-bubble ${lookup ? 'nv-bubble-lookup' : ''}">${escapeHtml(content)}</div>
        <div class="nv-time">${escapeHtml(timeLabel)}</div>
      </div>
    `;
    els.msgs.insertBefore(row, els.typing);

    // For user bubbles, detect line-clamp overflow on next frame and wire up
    // tap-to-expand. Only marks bubbles that actually overflow — short ones
    // don't get a 더보기 label.
    if (role === 'user') {
      const bubble = row.querySelector('.nv-bubble');
      requestAnimationFrame(() => {
        if (bubble.scrollHeight > bubble.clientHeight + 2) {
          bubble.classList.add('nv-bubble-truncatable');
          bubble.addEventListener('click', () => {
            bubble.classList.toggle('nv-bubble-expanded');
            scrollBottom();
          });
        }
      });
    }

    state.rows.push({ role, content, ts, timeLabel, isProactive: !!proactive, el: row });
    if (role === 'user') {
      // After the user types, the prior assistant row (often the
      // portrait-owning one) needs to lift cleanly. block:'end' anchors
      // this user row at the visible bottom while letting nv-msgs's
      // padding-bottom keep input-bar breathing space — the prior
      // assistant box's real measured height pushes it up naturally.
      requestAnimationFrame(() => row.scrollIntoView({ block: 'end', behavior: 'smooth' }));
    } else {
      scrollBottom();
    }
  }

  function movePortraitToLatest() {
    // Find latest assistant row
    let latest = null;
    for (let i = state.rows.length - 1; i >= 0; i--) {
      if (state.rows[i].role === 'assistant') { latest = state.rows[i]; break; }
    }
    if (!latest) return;

    // Release previous anchor row (drops padding + name label)
    if (state.portraitAnchor && state.portraitAnchor !== latest.el) {
      state.portraitAnchor.classList.remove('nv-has-portrait');
    }
    latest.el.classList.add('nv-has-portrait');
    state.portraitAnchor = latest.el;

    // Detach → attach: move portrait DOM into the latest assistant row.
    // Canvas keeps its WebGL context across moves, so this is cheap.
    if (els.portraitSlot.parentElement !== latest.el) {
      latest.el.insertBefore(els.portraitSlot, latest.el.firstChild);
    }
    els.portraitSlot.classList.add('nv-visible');
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
    // Reserve a portrait-owning placeholder row below the user's message.
    // The prior assistant box loses its portrait + name label and becomes a
    // plain bubble row, so there's no awkward overlap during the wait.
    appendThinkingPlaceholder();
    state.sock.send(combined);
  }

  // Build a placeholder row immediately after a user send — portrait moves
  // here, thinking dots show inline. When the first assistant bubble arrives,
  // this row is mutated in-place into a normal bubble row (no DOM churn,
  // no portrait re-attach animation).
  function appendThinkingPlaceholder() {
    // Strip portrait status from the previous owner (becomes a plain row)
    if (state.portraitAnchor) {
      state.portraitAnchor.classList.remove('nv-has-portrait');
    }
    const row = document.createElement('div');
    row.className = 'nv-row nv-row-assistant nv-has-portrait nv-row-thinking';
    row.innerHTML = `
      <div class="nv-msg-name">${escapeHtml(state.avatar?.name || '')}</div>
      <div class="nv-thinking-dots" aria-label="생각 중"><div></div><div></div><div></div></div>
    `;
    els.msgs.insertBefore(row, els.typing);
    // Move portrait into placeholder as the row's first child (absolute,
    // positioned within row.padding-left:76px column).
    row.insertBefore(els.portraitSlot, row.firstChild);
    els.portraitSlot.classList.add('nv-visible');
    state.portraitAnchor = row;
    state.thinkingRow = row;
    scrollBottom();
  }

  // Mutate the placeholder into a real assistant bubble row. Portrait stays
  // anchored — no extra movePortraitToLatest needed.
  function fillThinkingPlaceholder({ content, name, lookup, ts }) {
    const row = state.thinkingRow;
    if (!row) return false;
    state.thinkingRow = null;

    const date = new Date(ts || Date.now());
    const timeLabel = formatTime(date);
    const dateLabel = formatDateLabel(date);
    if (dateLabel !== state.lastDateLabel) {
      const div = document.createElement('div');
      div.className = 'nv-date-divider';
      div.innerHTML = `<span>${dateLabel}</span>`;
      els.msgs.insertBefore(div, row);
      state.lastDateLabel = dateLabel;
    }

    const dots = row.querySelector('.nv-thinking-dots');
    if (dots) dots.remove();

    const wrap = document.createElement('div');
    wrap.className = 'nv-bubble-wrap';
    wrap.innerHTML = `
      <div class="nv-bubble ${lookup ? 'nv-bubble-lookup' : ''}">${escapeHtml(content)}</div>
      <div class="nv-time">${escapeHtml(timeLabel)}</div>
    `;
    row.appendChild(wrap);
    row.classList.remove('nv-row-thinking');

    state.rows.push({ role: 'assistant', content, ts, timeLabel, isProactive: false, el: row });
    scrollBottom();
    return true;
  }

  // Scroll-top trigger — pulls the next older page when user nears the top.
  function onScrollMaybeLoadMore() {
    if (state.loadingMore || !state.hasMoreHistory || state.oldestLoadedId == null) return;
    if (els.msgs.scrollTop <= SCROLL_TOP_THRESHOLD) {
      loadMoreHistory();
    }
  }

  async function loadMoreHistory() {
    state.loadingMore = true;
    const indicator = document.createElement('div');
    indicator.className = 'nv-history-loading';
    indicator.textContent = '이전 대화 불러오는 중…';
    els.msgs.insertBefore(indicator, els.msgs.firstChild);

    // Capture scroll anchor BEFORE prepending so we can preserve the user's
    // visual position after layout grows upward.
    const scrollHeightBefore = els.msgs.scrollHeight;
    const scrollTopBefore = els.msgs.scrollTop;

    try {
      // includeCompacted=true so users can walk back to the actual start
      // of a long conversation. LLM context builders still exclude
      // compacted by default.
      const older = await sdk.api.getMessages(avatarId, HISTORY_PAGE_SIZE, state.oldestLoadedId, true);
      indicator.remove();
      if (!older.length) {
        state.hasMoreHistory = false;
        const tag = document.createElement('div');
        tag.className = 'nv-history-end';
        tag.textContent = '대화의 시작입니다';
        els.msgs.insertBefore(tag, els.msgs.firstChild);
      } else {
        // Prepend in chronological order (oldest first). The new earliest
        // becomes the next cursor; we may still have more if backend filled
        // a full page.
        state.oldestLoadedId = older[0].id;
        state.hasMoreHistory = older.length >= HISTORY_PAGE_SIZE;

        // Reset date-divider tracking so prepended dates render correctly,
        // then re-emit the current oldest divider after to restore the seam.
        const seamDateLabel = state.lastDateLabel;
        state.lastDateLabel = '';

        // Find the first non-spacer, non-divider element to use as insertion
        // anchor so prepended rows sit above the existing content.
        const insertBefore = els.msgs.firstChild;
        for (const m of older) {
          const role = m.role === 'user' ? 'user' : 'assistant';
          prependMessage({
            role, content: m.content, ts: m.created_at,
            name: state.avatar?.name, msgId: m.id,
            insertBefore,
          });
        }
        // After prepend, restore previous date-divider label so the seam
        // re-emits the divider when appropriate
        state.lastDateLabel = seamDateLabel;
      }

      // Preserve scroll position: scrollTop += (heightAfter - heightBefore)
      requestAnimationFrame(() => {
        const grew = els.msgs.scrollHeight - scrollHeightBefore;
        els.msgs.scrollTop = scrollTopBefore + grew;
      });
    } catch (e) {
      indicator.remove();
      console.error('[NVatar] older history load failed:', e);
      const errEl = document.createElement('div');
      errEl.className = 'nv-history-end';
      errEl.style.color = '#ef4444';
      errEl.textContent = '이전 대화 불러오기 실패';
      els.msgs.insertBefore(errEl, els.msgs.firstChild);
    } finally {
      state.loadingMore = false;
    }
  }

  // Prepend a message at the top of the conversation (used by infinite history).
  // Simpler than appendMessage — no grouping merge with earlier rows (those
  // are older still and will be prepended in later pages), no portrait travel,
  // no scrollBottom. Date divider emitted when the page boundary crosses days.
  function prependMessage({ role, content, ts, name, msgId, insertBefore }) {
    const date = new Date(ts || Date.now());
    const dateLabel = formatDateLabel(date);
    const timeLabel = formatTime(date);
    if (dateLabel !== state.lastDateLabel) {
      const div = document.createElement('div');
      div.className = 'nv-date-divider';
      div.innerHTML = `<span>${dateLabel}</span>`;
      els.msgs.insertBefore(div, insertBefore);
      state.lastDateLabel = dateLabel;
    }
    const row = document.createElement('div');
    row.className = `nv-row nv-row-${role}`;
    row.innerHTML = `
      ${role === 'assistant' ? `<div class="nv-msg-name">${escapeHtml(name || '')}</div>` : ''}
      <div class="nv-bubble-wrap">
        <div class="nv-bubble">${escapeHtml(content)}</div>
        <div class="nv-time">${escapeHtml(timeLabel)}</div>
      </div>
    `;
    els.msgs.insertBefore(row, insertBefore);
    // Unshift to keep state.rows in chronological order
    state.rows.unshift({ role, content, ts, timeLabel, isProactive: false, el: row });
  }

  // Drop the placeholder without mutating into a bubble (used on error path).
  function clearThinkingPlaceholder() {
    if (!state.thinkingRow) return;
    // Move portrait out before the row dies (it's still our DOM widget).
    if (state.thinkingRow.contains(els.portraitSlot)) {
      // Park it next to typing — invisible, ready to re-attach on next bubble
      els.portraitSlot.classList.remove('nv-visible');
      els.msgs.insertBefore(els.portraitSlot, els.typing);
    }
    state.thinkingRow.remove();
    state.thinkingRow = null;
    // Re-anchor portrait to whatever assistant row was visually last
    state.portraitAnchor = null;
    movePortraitToLatest();
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
    els.msgs.removeEventListener('scroll', onScrollMaybeLoadMore);
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
    <button class="nv-search-btn nv-search-empty" aria-label="검색 이력">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <span class="nv-search-count">0</span>
    </button>
    <button class="nv-clear-btn" aria-label="대화 초기화">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>
    </button>
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
.nv-search-btn { display: inline-flex; align-items: center; gap: 4px; padding: 6px 8px; border: 1px solid #e5e7eb; border-radius: 14px; background: #f9fafb; color: #4b5563; cursor: pointer; font-size: 11px; font-weight: 600; }
.nv-search-btn:active { background: #e5e7eb; }
.nv-search-btn.nv-search-empty { color: #9ca3af; }
.nv-search-btn.nv-search-empty .nv-search-count { opacity: 0.6; }
.nv-search-count { font-variant-numeric: tabular-nums; }
.nv-clear-btn { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px; border: none; background: transparent; color: #6b7280; cursor: pointer; }
.nv-clear-btn:hover { color: #ef4444; background: #fef2f2; }
.nv-clear-btn:active { background: #fee2e2; }

.nv-msgs-area { flex: 1; position: relative; overflow: hidden; }
/* padding-bottom: leaves breathing room between the last message and the
   input bar even when scrolled fully down. */
.nv-msgs { position: relative; height: 100%; overflow-y: auto; padding: 14px 14px 64px; display: flex; flex-direction: column; gap: 4px; }

/* Bigger breathing room when speaker switches.
   Especially important when the assistant row owns a 56px portrait —
   without margin, the user bubble visually crowds the portrait box. */
.nv-row-assistant + .nv-row-user,
.nv-row-user + .nv-row-assistant { margin-top: 24px; }
.nv-row-action + .nv-row-user,
.nv-row-user + .nv-row-action { margin-top: 14px; }

.nv-history-loading, .nv-history-end {
  text-align: center; font-size: 11px; color: #9ca3af;
  padding: 10px 0; letter-spacing: 0.3px;
}
.nv-history-end { padding: 14px 0 6px; color: #d1d5db; font-style: italic; }

.nv-date-divider { display: flex; align-items: center; gap: 12px; margin: 18px 8px; }
.nv-date-divider::before, .nv-date-divider::after { content: ''; flex: 1; height: 1px; background: #e5e7eb; }
.nv-date-divider span { font-size: 13px; color: #4b5563; font-weight: 600; }

.nv-row { display: flex; flex-direction: column; gap: 4px; max-width: 100%; position: relative; }
.nv-row-assistant { align-items: flex-start; padding-right: 32px; padding-left: 4px; }
/* min-height > portrait (56px) + border + safe pad so the absolutely-positioned
   portrait can never overflow the row box and collide with the next message. */
.nv-row-assistant.nv-has-portrait { padding-left: 76px; min-height: 72px; padding-bottom: 4px; }
.nv-row-user { align-items: flex-end; padding-left: 32px; }
.nv-row-system { align-items: center; }
.nv-row-action { align-items: flex-start; padding: 4px 4px 4px 4px; }

/* Action card — compact tappable summary linking to the search history dialog */
.nv-action-card {
  display: flex; align-items: center; gap: 10px;
  width: 100%; max-width: min(86%, 340px);
  padding: 10px 12px;
  background: linear-gradient(180deg, #ffffff, #f9fafb);
  border: 1px solid #e0e7ff;
  border-radius: 14px;
  cursor: pointer; text-align: left;
  font-family: inherit;
  transition: background 0.15s ease, border-color 0.15s ease, transform 0.08s ease;
}
.nv-action-card:hover { background: #eef2ff; border-color: #c7d2fe; }
.nv-action-card:active { transform: scale(0.99); }
.nv-action-icon { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; background: #e0e7ff; color: #4f46e5; flex-shrink: 0; }
.nv-action-body { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
.nv-action-eyebrow { font-size: 11px; font-weight: 600; color: #6366f1; letter-spacing: 0.3px; }
.nv-action-title { font-size: 13px; font-weight: 600; color: #1f2937; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word; }
.nv-action-chev { color: #9ca3af; font-size: 18px; flex-shrink: 0; }

.nv-msg-name { display: none; font-size: 13px; font-weight: 700; color: #111827; margin-bottom: 4px; }
.nv-row-assistant.nv-has-portrait .nv-msg-name { display: block; }

.nv-bubble-wrap { display: flex; align-items: flex-end; gap: 6px; max-width: 100%; }
.nv-row-user .nv-bubble-wrap { flex-direction: row-reverse; }
.nv-bubble { padding: 10px 14px; border-radius: 14px; font-size: 14px; line-height: 1.55; word-break: break-word; white-space: pre-wrap; max-width: min(78%, 320px); }
.nv-row-assistant .nv-bubble { background: #f3f4f6; color: #111827; border-top-left-radius: 4px; }
.nv-row-user .nv-bubble { background: #fde68a; color: #111827; border-top-right-radius: 4px; cursor: pointer; }
/* Truncate long user bubbles to 4 lines; tap to expand/collapse */
.nv-row-user .nv-bubble {
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
  position: relative;
}
.nv-row-user .nv-bubble.nv-bubble-expanded { -webkit-line-clamp: unset; }
.nv-row-user .nv-bubble.nv-bubble-truncatable::after {
  content: '더보기';
  display: inline-block; margin-left: 4px;
  font-size: 11px; color: #92400e; font-weight: 600; opacity: 0.7;
}
.nv-row-user .nv-bubble.nv-bubble-expanded.nv-bubble-truncatable::after { content: '접기'; }
.nv-bubble-lookup { border-left: 3px solid #10b981; }
.nv-time { font-size: 11px; color: #9ca3af; flex-shrink: 0; }
.nv-proactive .nv-bubble { background: #fef3c7; border: 1px solid #fcd34d; color: #92400e; }

.nv-sys { font-size: 11px; color: #9ca3af; padding: 4px 0; }

.nv-typing { display: none; align-items: center; gap: 4px; padding: 10px 14px; background: #f3f4f6; border-radius: 14px; border-top-left-radius: 4px; align-self: flex-start; margin-left: 4px; }
.nv-typing.nv-visible { display: inline-flex; }
.nv-row-user + .nv-typing, .nv-row-assistant + .nv-typing { margin-top: 14px; }

/* Thinking placeholder — sits inside the portrait-owning row so the layout
   reserves the exact same height a real bubble row would occupy. */
.nv-thinking-dots { display: inline-flex; align-items: center; gap: 4px; padding: 10px 14px; background: #f3f4f6; border-radius: 14px; border-top-left-radius: 4px; align-self: flex-start; }
.nv-thinking-dots > div { width: 6px; height: 6px; border-radius: 50%; background: #9ca3af; animation: nv-bounce 1.3s infinite; }
.nv-thinking-dots > div:nth-child(2) { animation-delay: 0.15s; }
.nv-thinking-dots > div:nth-child(3) { animation-delay: 0.3s; }
.nv-typing div { width: 6px; height: 6px; border-radius: 50%; background: #9ca3af; animation: nv-bounce 1.3s infinite; }
.nv-typing div:nth-child(2) { animation-delay: 0.15s; }
.nv-typing div:nth-child(3) { animation-delay: 0.3s; }
@keyframes nv-bounce { 0%,60%,100% { transform: translateY(0); opacity: 0.4; } 30% { transform: translateY(-4px); opacity: 1; } }

/* Portrait — DOM-moved into the assistant row that currently "owns" it.
   Dark background so VRM characters (typically light-toned) stand out. */
.nv-portrait {
  position: absolute; left: 8px; top: 0;
  width: 56px; height: 56px;
  border-radius: 50%;
  overflow: hidden;
  pointer-events: auto;
  cursor: pointer;
  display: none;
  -webkit-mask-image: radial-gradient(circle at center, black 82%, transparent 100%);
          mask-image: radial-gradient(circle at center, black 82%, transparent 100%);
  background: radial-gradient(circle at 50% 40%, #2a3447 0%, #0f172a 100%);
  border: 1px solid rgba(255,255,255,0.08);
}
.nv-portrait.nv-visible { display: block; }

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
