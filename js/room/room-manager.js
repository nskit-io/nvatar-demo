// NVatar Room — Room Manager (centralized observer + orchestrator)
//
// Role: the room itself is the coordinator. It observes occupants, tracks
// conversation state, and issues orders to avatars. Avatars are reactive.
//
// Responsibilities:
//   1. Observe: who's in the room, last activity time, busy state.
//   2. Schedule: periodic tick to (maybe) order inter-avatar dialogue.
//   3. Route user input: parse name prefixes → single or multi target queue.
//   4. Sequential speech: queue prevents double-firing or overlap.
//   5. Gemma lock: ties to onBubbleComplete so next turn waits for finish.

import S from './state.js';
import { showBubble } from './bubble.js';
import { addChatMsg } from './chat.js';

// --- Config ---
const TICK_MIN_SEC = 35;
const TICK_MAX_SEC = 75;
const DIALOGUE_PROB = 0.6;
const DIALOGUE_MIN_GAP_MS = 25_000;
const BUSY_TIMEOUT_MS = 15_000;
const HOURLY_DIALOGUE_CAP = 6; // AFK / screensaver safeguard

// --- State ---
let _tickTimer = null;
let _lastDialogueAt = 0;
let _lastAddressed = 0; // sticky target index (default = main)
let _gemmaBusy = false;
let _busyTimeout = null;
const _dialogueTimestamps = []; // rolling window for hourly cap

// Speech queue: FIFO of pending user messages to dispatch
// Each entry: { toIndex, text, isUser }
const _queue = [];

// --- Lock ---
function _acquireLock(ms = BUSY_TIMEOUT_MS) {
  _gemmaBusy = true;
  if (_busyTimeout) clearTimeout(_busyTimeout);
  _busyTimeout = setTimeout(() => {
    _gemmaBusy = false;
    _busyTimeout = null;
    _pumpQueue();
  }, ms);
}
function _releaseLock() {
  _gemmaBusy = false;
  if (_busyTimeout) { clearTimeout(_busyTimeout); _busyTimeout = null; }
  _pumpQueue();
}

// --- Ws lookup ---
function _wsOf(index) {
  if (index === 0) return S.chatWs;
  return S.avatars[index]?._ws;
}
function _avatarOf(index) { return S.avatars[index]; }

function _occupantIndices() {
  const out = [];
  for (let i = 0; i < S.avatars.length; i++) {
    const a = S.avatars[i];
    const ws = _wsOf(i);
    if (a && ws && ws.readyState === 1) out.push(i);
  }
  return out;
}

// --- Target parsing ---
// Returns a list of avatar indices mentioned in the text (left-to-right).
// Strips matched prefixes iteratively. Example: "루빈아 비비, 안녕" → [rubinIdx, viviIdx]
function _escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function _extractTargets(text) {
  const targets = [];
  let remaining = text.trim();
  const indexByName = new Map();
  for (let i = 0; i < S.avatars.length; i++) {
    const a = S.avatars[i];
    if (a && a.name) indexByName.set(a.name, i);
  }
  const names = [...indexByName.keys()].sort((a, b) => b.length - a.length); // longest first

  let matched = true;
  while (matched) {
    matched = false;
    for (const name of names) {
      // Match "@Name", "Name야/아/님/씨", "Name:", "Name,", "Name " OR end-of-string
      const re = new RegExp(
        '^(?:@?' + _escRe(name) + ')[야아님씨]?\\s*(?:[,:;!?\\s]+|$)',
      );
      const m = remaining.match(re);
      if (m) {
        const idx = indexByName.get(name);
        if (idx !== undefined && !targets.includes(idx)) targets.push(idx);
        remaining = remaining.slice(m[0].length);
        matched = true;
        break;
      }
    }
  }
  return { targets, body: remaining || text };
}

// Response-side speaker detection:
// Parse an avatar's own utterance to find if they addressed another avatar.
// Returns the addressed avatar's index, or -1.
function _detectAddressedInResponse(text, selfIndex) {
  const indexByName = new Map();
  for (let i = 0; i < S.avatars.length; i++) {
    if (i === selfIndex) continue;
    const a = S.avatars[i];
    if (a && a.name) indexByName.set(a.name, i);
  }
  const names = [...indexByName.keys()].sort((a, b) => b.length - a.length);
  for (const name of names) {
    // Addressing form: "Name 씨", "Name야", "Name아", "Name!", "Name,"
    const re = new RegExp(_escRe(name) + '[야아님씨]?(?:[\\s,!?]|$)');
    if (re.test(text)) return indexByName.get(name);
  }
  return -1;
}

// --- Public: user message entry point ---
export function onUserMessage(text) {
  const { targets } = _extractTargets(text);

  if (targets.length === 0) {
    // No explicit name — route to sticky target
    _enqueue({ toIndex: _lastAddressed, text, isUser: true });
    return;
  }

  if (targets.length === 1) {
    _lastAddressed = targets[0];
    _enqueue({ toIndex: targets[0], text, isUser: true });
    return;
  }

  // Multi-target: enqueue same text to each; they respond one-by-one
  _lastAddressed = targets[targets.length - 1];
  for (const idx of targets) {
    _enqueue({ toIndex: idx, text, isUser: true });
  }
}

function _enqueue(entry) {
  _queue.push(entry);
  _pumpQueue();
}

function _pumpQueue() {
  if (_gemmaBusy) return;
  if (_queue.length === 0) return;
  const next = _queue.shift();
  _dispatch(next);
}

function _dispatch(entry) {
  const ws = _wsOf(entry.toIndex);
  if (!ws || ws.readyState !== 1) {
    _pumpQueue();
    return;
  }
  _acquireLock();
  try { ws.send(JSON.stringify({ type: 'message', text: entry.text })); }
  catch (e) { console.warn('[RoomMgr] send failed:', e); _releaseLock(); return; }
  showBubble(entry.toIndex, '...');
  // User-initiated: the addressed avatar walks toward the user (camera)
  if (entry.isUser) {
    import('./roaming.js').then(mod => {
      if (entry.toIndex === 0) mod.returnToCenter && mod.returnToCenter();
      else mod.walkAvatarToCamera && mod.walkAvatarToCamera(entry.toIndex);
    });
  }
}

// --- Public: external hooks (called from chat.js ws handlers) ---

// Cascade depth limit — prevent infinite avatar-ping-pong
const MAX_CASCADE_DEPTH = 2;
let _cascadeDepth = 0;

// Called when an avatar receives a bubble. Analyze the text: if they addressed
// another avatar, shift sticky to that target and optionally cascade-forward
// the message so the addressed avatar responds naturally.
export function onAvatarResponse(avatarIndex, text) {
  if (!text || text === '...') return;
  const addressed = _detectAddressedInResponse(text, avatarIndex);
  if (addressed < 0) {
    // Reset cascade depth — chain ended
    _cascadeDepth = 0;
    return;
  }
  // Shift sticky so user's un-prefixed follow-up goes to the addressed avatar
  _lastAddressed = addressed;
  console.log(`[RoomMgr] ${S.avatars[avatarIndex]?.name} → ${S.avatars[addressed]?.name} (sticky updated)`);

  // Auto-cascade: if we're mid-chain and under depth limit, forward to addressed avatar
  if (_cascadeDepth < MAX_CASCADE_DEPTH) {
    _cascadeDepth++;
    const speaker = _avatarOf(avatarIndex);
    if (!speaker?.name) { _cascadeDepth = 0; return; }
    setTimeout(() => {
      const ws = _wsOf(addressed);
      if (!ws || ws.readyState !== 1) return;
      if (_gemmaBusy || _queue.length > 0) return;
      _acquireLock();
      try {
        ws.send(JSON.stringify({
          type: 'message',
          text: `${speaker.name}: ${text}`,
          relationship_id: `avatar:${speaker.avatarId || 0}`,
          from_avatar_id: speaker.avatarId || 0,
          ephemeral: false,
        }));
        // Note: the addressed avatar's response will already be logged by its ws handler.
        // The cascaded forward itself (speaker's original bubble) is already in log via
        // onAvatarResponse path that called addChatMsg('avatar', …). No duplicate log here.
      } catch (e) { console.warn('[RoomMgr] cascade failed:', e); _releaseLock(); }
    }, 2500);
  } else {
    _cascadeDepth = 0;
  }
}

export function onBubbleComplete() {
  _releaseLock();
}

// Called by friend-avatar.js when a new friend finishes loading. Schedules a
// welcome greeting from main → friend after ~8s so the user sees immediate life.
export function onFriendJoined(friendIndex) {
  setTimeout(() => _tryWelcome(friendIndex), 8000);
}

function _tryWelcome(friendIndex) {
  const friend = _avatarOf(friendIndex);
  const main = _avatarOf(0);
  if (!friend || !main) return;
  if (!main.name || !friend.name) {
    // Main name may still be loading — retry once
    setTimeout(() => _tryWelcomeRetry(friendIndex), 3000);
    return;
  }
  _doWelcome(friendIndex);
}

function _tryWelcomeRetry(friendIndex) {
  const friend = _avatarOf(friendIndex);
  const main = _avatarOf(0);
  if (!friend?.name || !main?.name) return; // give up
  _doWelcome(friendIndex);
}

function _doWelcome(friendIndex) {
  const friend = _avatarOf(friendIndex);
  const main = _avatarOf(0);
  if (!friend || !main) return;
  if (_gemmaBusy || _queue.length > 0) {
    // retry in 5s if busy
    setTimeout(() => _tryWelcome(friendIndex), 5000);
    return;
  }
  const friendWs = _wsOf(friendIndex);
  if (!friendWs || friendWs.readyState !== 1) {
    setTimeout(() => _tryWelcome(friendIndex), 3000);
    return;
  }

  const starter = WELCOME_STARTERS[Math.floor(Math.random() * WELCOME_STARTERS.length)]
    .replace('{NAME}', friend.name);
  _lastDialogueAt = Date.now();
  _dialogueTimestamps.push(Date.now());
  _acquireLock();

  // Main speaks the welcome — friend walks TO main (speaker stays put; listener approaches)
  showBubble(0, starter);
  addChatMsg('avatar', `${main.name}: ${starter}`);
  import('./tts.js').then(mod => mod.speakTTS(starter, main.voiceId));
  import('./roaming.js').then(mod => mod.walkToAvatar && mod.walkToAvatar(friendIndex, 0));
  console.log(`[RoomMgr] welcome: ${main.name} → ${friend.name}: "${starter}"`);

  // Forward to friend's ws so they respond in-character
  setTimeout(() => {
    try {
      friendWs.send(JSON.stringify({
        type: 'message',
        text: `${main.name}: ${starter}`,
        relationship_id: `avatar:${main.avatarId || 0}`,
        from_avatar_id: main.avatarId || 0,
        ephemeral: false,
      }));
      _lastAddressed = friendIndex;
    } catch (e) { console.warn('[RoomMgr] welcome forward failed:', e); _releaseLock(); }
  }, 2500);
}

// --- Scheduler: observe room + maybe order dialogue ---
export function startScheduler() {
  if (_tickTimer) return;
  _schedule();
  console.log('[RoomMgr] Scheduler started');
}
export function stopScheduler() {
  if (_tickTimer) clearTimeout(_tickTimer);
  _tickTimer = null;
}
function _schedule() {
  const delay = (TICK_MIN_SEC + Math.random() * (TICK_MAX_SEC - TICK_MIN_SEC)) * 1000;
  _tickTimer = setTimeout(_tick, delay);
}
function _tick() {
  _tickTimer = null;
  try { _maybeOrderDialogue(); }
  finally { _schedule(); }
}

function _maybeOrderDialogue() {
  // AFK defense: pause when tab hidden (screensaver mode can override via config later)
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

  const occ = _occupantIndices();
  if (occ.length < 2) return;
  if (_gemmaBusy || _queue.length > 0) return;
  if (Date.now() - _lastDialogueAt < DIALOGUE_MIN_GAP_MS) return;

  // Hourly cap — prune > 1h, then check
  const oneHourAgo = Date.now() - 3600_000;
  while (_dialogueTimestamps.length && _dialogueTimestamps[0] < oneHourAgo) {
    _dialogueTimestamps.shift();
  }
  if (_dialogueTimestamps.length >= HOURLY_DIALOGUE_CAP) return;

  if (Math.random() > DIALOGUE_PROB) return;

  const from = occ[Math.floor(Math.random() * occ.length)];
  const rest = occ.filter(i => i !== from);
  const to = rest[Math.floor(Math.random() * rest.length)];
  _dialogueTimestamps.push(Date.now());
  _orderDialogue(from, to);
}

const STARTERS = [
  '{NAME}야, 지금 뭐 생각하고 있어?',
  '{NAME}야, 창밖에 햇살이 좋네. 산책하고 싶지 않아?',
  '{NAME}, 요즘 재미있는 거 있어?',
  '{NAME}야, 너는 여행하면 어디로 가고 싶어?',
  '{NAME}, 오늘 기분은 어때?',
  '{NAME}야, 좋아하는 음악 하나 추천해줄래?',
  '{NAME}, 최근에 뭔가 새롭게 배운 거 있어?',
  '{NAME}야, 이 방 분위기 어때? 편하지?',
];

const WELCOME_STARTERS = [
  '{NAME}야, 어서와! 이 방에 와줘서 반가워.',
  '{NAME}, 잘 지냈어? 우리 방에 놀러 와줘서 고마워.',
  '{NAME}야, 오랜만이네! 이리 와서 얘기하자.',
  '{NAME}, 환영해! 편하게 둘러봐.',
  '{NAME}야, 와! 너 왔구나. 가까이 와, 대화하자.',
];

function _orderDialogue(fromIndex, toIndex) {
  const self = _avatarOf(fromIndex);
  const target = _avatarOf(toIndex);
  if (!self || !target) return;
  // Guard: both names must be populated (main avatar name loads async from API)
  if (!self.name || !target.name) {
    console.warn('[RoomMgr] name not populated yet, skipping dialogue order');
    return;
  }
  const starter = STARTERS[Math.floor(Math.random() * STARTERS.length)].replace('{NAME}', target.name);
  _lastDialogueAt = Date.now();
  _acquireLock();

  showBubble(fromIndex, starter);
  addChatMsg('avatar', `${self.name}: ${starter}`);
  // Speak the starter out loud with the initiator's voice — pair of "물어봄" + "대답"
  import('./tts.js').then(mod => mod.speakTTS(starter, self.voiceId));
  // Listener approaches speaker (speaker stays put)
  import('./roaming.js').then(mod => mod.walkToAvatar && mod.walkToAvatar(toIndex, fromIndex));
  console.log(`[RoomMgr] order: ${self.name} → ${target.name}: "${starter}"`);

  // Forward to target's ws after 2.5s so they respond in-character.
  // P1: tag the message so target's server knows this is an inter-avatar dialogue, not user.
  const fromAvatarId = self.avatarId || 0; // 0 = main avatar (no id) → still treated as inter-avatar via relationship_id
  setTimeout(() => {
    const ws = _wsOf(toIndex);
    if (ws && ws.readyState === 1) {
      try {
        ws.send(JSON.stringify({
          type: 'message',
          text: `${self.name}: ${starter}`,
          relationship_id: `avatar:${fromAvatarId}`,
          from_avatar_id: fromAvatarId,
          // Ephemeral while idle-triggered — let users opt into persistence later
          // For now, persist so early users experience relationship growth.
          ephemeral: false,
        }));
        _lastAddressed = toIndex;
      } catch (e) { console.warn('[RoomMgr] dialogue forward failed:', e); _releaseLock(); }
    } else { _releaseLock(); }
  }, 2500);
}

// --- Introspection (debug / external callers) ---
export function getLastAddressed() { return _lastAddressed; }
export function setLastAddressed(index) {
  if (typeof index === 'number' && index >= 0) _lastAddressed = index;
}
export function isGemmaBusy() { return _gemmaBusy; }
export function markGemmaBusy(ms) { _acquireLock(ms); }
export function releaseGemmaBusy() { _releaseLock(); }
