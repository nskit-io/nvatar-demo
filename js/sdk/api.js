// NVatar SDK Chat — REST + WebSocket adapter.
//
// Two backend domains:
//   coreBase  — chat WS, avatars CRUD, messages       (e.g. https://nvatar.nskit.io)
//   resBase   — VRM model registry, thumbnails, /vrm/ (e.g. https://nvatar-res.nskit.io)
//   whisperUrl— STT endpoint                          (e.g. https://whisper.nskit.io/api/v1/transcribe)

export class Api {
  constructor({ coreBase, resBase, whisperUrl, userId }) {
    this.coreBase = coreBase.replace(/\/$/, '');
    this.resBase = resBase.replace(/\/$/, '');
    this.whisperUrl = whisperUrl || 'https://whisper.nskit.io/api/v1/transcribe';
    this.userId = userId;
    this.wsBase = this.coreBase.replace(/^http/, 'ws');
  }

  // --- Avatars (core) ---

  async listAvatars() {
    const r = await fetch(`${this.coreBase}/api/v1/avatars?user_id=${encodeURIComponent(this.userId)}`);
    const d = await r.json();
    if (d.code && d.code !== 200) throw new Error(d.message || 'list failed');
    return d.response || [];
  }

  // listAvatars 응답은 emotions/MBTI/os_state 미포함 — 슬롯/portrait 클릭 시
  // stats 다이얼로그 채우려면 별도 단건 fetch 필요.
  async getAvatar(avatarId) {
    const r = await fetch(`${this.coreBase}/api/v1/avatars/${avatarId}`);
    const d = await r.json();
    if (d.code && d.code !== 200) throw new Error(d.message || 'get failed');
    return d.response || null;
  }

  async createAvatar(payload) {
    const body = { user_id: this.userId, ...payload };
    const r = await fetch(`${this.coreBase}/api/v1/avatars`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!d.response) throw new Error(d.message || d.detail || 'create failed');
    return d.response;
  }

  async patchAvatar(avatarId, patch) {
    const r = await fetch(`${this.coreBase}/api/v1/avatars/${avatarId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const d = await r.json();
    if (!d.response) throw new Error(d.message || d.detail || 'patch failed');
    return d.response;
  }

  async deleteAvatar(avatarId) {
    const r = await fetch(`${this.coreBase}/api/v1/avatars/${avatarId}`, { method: 'DELETE' });
    const d = await r.json();
    if (d.code && d.code !== 200) throw new Error(d.message || 'delete failed');
    return true;
  }

  async getMessages(avatarId, limit = 50, beforeId = null, includeCompacted = false) {
    const qs = new URLSearchParams({ limit: String(limit), user_id: this.userId });
    if (beforeId != null) qs.set('before_id', String(beforeId));
    if (includeCompacted) qs.set('include_compacted', 'true');
    const r = await fetch(`${this.coreBase}/api/v1/avatars/${avatarId}/messages?${qs}`);
    if (r.status === 403) return [];
    const d = await r.json();
    return d.response || [];
  }

  async clearMessages(avatarId) {
    const r = await fetch(`${this.coreBase}/api/v1/avatars/${avatarId}/messages`, {
      method: 'DELETE',
    });
    const d = await r.json();
    if (d.code && d.code !== 200) throw new Error(d.message || 'clear failed');
    return true;
  }

  // --- VRM (res) ---

  async listVrmModels() {
    const r = await fetch(`${this.resBase}/api/v1/vrm/models?active_only=true`);
    const d = await r.json();
    return (d.models || []).map(m => this._absolutizeModel(m));
  }

  /** franchise:
   *  null/omit  → 전체 (NVatar 기본 + 모든 프랜차이즈)
   *  'none'     → NVatar 기본 (franchise_code IS NULL) 만
   *  'ekys'     → 해당 프랜차이즈만
   */
  async listCharacters(franchise) {
    const qs = new URLSearchParams({ active_only: 'true' });
    if (franchise) qs.set('franchise', franchise);
    const r = await fetch(`${this.resBase}/api/v1/vrm/models?${qs}`);
    const d = await r.json();
    return (d.models || []).map(m => this._absolutizeModel(m));
  }

  /** 프랜차이즈 캐릭터 일괄 upsert. SDK init 시 자동 호출 (brand.franchiseCode 박혀있을 때).
   *  payload = [{ char_code, kind, name, thumbnail, portrait, vrm_url, preset }]
   */
  async syncFranchiseCharacters(franchiseCode, characters) {
    const r = await fetch(
      `${this.resBase}/api/v1/vrm/franchise/${encodeURIComponent(franchiseCode)}/characters`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characters }),
      },
    );
    const d = await r.json();
    if (d.code && d.code !== 200) throw new Error(d.message || d.detail || 'sync failed');
    return (d.characters || []).map(m => this._absolutizeModel(m));
  }

  async resolveVrm(uid) {
    const r = await fetch(`${this.resBase}/api/v1/vrm/resolve/${uid}`);
    const d = await r.json();
    if (!d.model) throw new Error('VRM resolve failed');
    return this._absolutizeModel(d.model);
  }

  _absolutizeModel(m) {
    const abs = (u) => {
      if (!u) return u;
      if (/^https?:/i.test(u)) return u;
      return this.resBase + (u.startsWith('/') ? '' : '/') + u;
    };
    return { ...m, thumbnail: abs(m.thumbnail), portrait: abs(m.portrait), url: abs(m.url) };
  }

  // --- Chat WebSocket (core) ---
  //
  // Server-emitted types: typing | bubble | bubble_lookup | lookup_start |
  //                       lookup_end | emotion_update | proactive | error

  openChatSocket(avatarId) {
    const url = `${this.wsBase}/ws/chat/${avatarId}`;
    const ws = new WebSocket(url);
    const handlers = new Set();

    ws.addEventListener('message', (e) => {
      let data;
      try { data = JSON.parse(e.data); } catch { return; }
      handlers.forEach(fn => { try { fn(data); } catch(err) { console.error(err); } });
    });

    return {
      raw: ws,
      ready: new Promise((resolve, reject) => {
        ws.addEventListener('open', () => resolve());
        ws.addEventListener('error', reject);
      }),
      send(text) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'message', text }));
        }
      },
      // Send an arbitrary event (e.g. client_ready, monologue_request).
      // Required so the backend can trigger first_meeting greeting + proactive queue flush.
      sendEvent(type, payload = {}) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type, ...payload }));
        }
      },
      onMessage(fn) { handlers.add(fn); return () => handlers.delete(fn); },
      onClose(fn) { ws.addEventListener('close', fn); },
      close() { try { ws.close(); } catch(e) {} },
      get isOpen() { return ws.readyState === WebSocket.OPEN; },
    };
  }

  // --- Whisper STT ---

  async transcribe(audioBlob, opts = {}) {
    const formData = new FormData();
    formData.append('file', audioBlob, opts.filename || 'voice.webm');
    const r = await fetch(this.whisperUrl, { method: 'POST', body: formData });
    const d = await r.json();
    if (d.code !== 200) throw new Error(d.message || 'STT failed');
    return (d.text || '').trim();
  }
}
