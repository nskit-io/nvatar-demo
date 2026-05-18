// NVatar SDK Chat — Search history store + aux panel renderer.
//
// 저장 형태: avatarId → entries[] (각 entry = { id, query, results, ts })
//   results = bubble_lookup 응답의 액션 카드 list (title/url/eyebrow 등)
//
// 휘발성 (default) — 탭 닫으면 사라짐.
// persist: true 박으면 localStorage 백업 (key = `nvatar.sdk.search.{userId}`).
//
// 새 검색 결과 push 시 sdk.notifySearchUpdated(avatarId) 호출로 aux/overlay 갱신.

const LIMIT_PER_AVATAR = 50;

export class SearchHistoryStore {
  constructor({ userId, persist }) {
    this.userId = userId;
    this.persist = !!persist;
    this.key = `nvatar.sdk.search.${userId}`;
    this.byAvatar = new Map();
    if (this.persist) this._load();
  }

  add(avatarId, entry) {
    const id = avatarId | 0;
    const arr = this.byAvatar.get(id) || [];
    arr.unshift({ ...entry, ts: entry.ts || Date.now() });
    if (arr.length > LIMIT_PER_AVATAR) arr.length = LIMIT_PER_AVATAR;
    this.byAvatar.set(id, arr);
    if (this.persist) this._save();
  }

  list(avatarId) {
    return this.byAvatar.get(avatarId | 0) || [];
  }

  clear(avatarId) {
    if (avatarId == null) this.byAvatar.clear();
    else this.byAvatar.delete(avatarId | 0);
    if (this.persist) this._save();
  }

  _load() {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return;
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object') {
        Object.keys(obj).forEach(k => this.byAvatar.set(Number(k), obj[k]));
      }
    } catch (e) { /* silent */ }
  }

  _save() {
    try {
      const obj = {};
      this.byAvatar.forEach((v, k) => { obj[k] = v; });
      localStorage.setItem(this.key, JSON.stringify(obj));
    } catch (e) { /* quota 등 — silent */ }
  }
}

/**
 * Aux 패널 또는 search overlay 의 콘텐츠 렌더 — 검색 기록 아코디언.
 *
 *   el          : 부착할 DOM
 *   sdk         : sdk instance (api 호출, brand 색 등)
 *   activeAvatarId : 현재 채팅방 friend id. null 이면 전체 친구 통합 표시
 */
export function renderSearchHistoryPanel(el, sdk, activeAvatarId) {
  ensureSearchPanelStyle();
  el.innerHTML = '';

  const root = document.createElement('div');
  root.className = 'nv-search-panel';

  const titleHtml = `<div class="nv-search-panel-title">
    <span>대화 중 검색 기록</span>
  </div>`;
  root.insertAdjacentHTML('beforeend', titleHtml);

  const entries = activeAvatarId
    ? sdk.searchHistory.list(activeAvatarId)
    : collectAllEntries(sdk);

  if (!entries.length) {
    root.insertAdjacentHTML('beforeend', `<div class="nv-search-empty">
      아직 검색 기록이 없어요.<br>
      친구와의 대화 중 자료 검색이 생기면<br>여기에 모입니다.
    </div>`);
    el.appendChild(root);
    return;
  }

  const listEl = document.createElement('div');
  listEl.className = 'nv-search-list';
  entries.forEach(entry => listEl.appendChild(renderEntry(entry, sdk)));
  root.appendChild(listEl);
  el.appendChild(root);
}

function collectAllEntries(sdk) {
  const all = [];
  sdk.searchHistory.byAvatar.forEach(arr => arr.forEach(e => all.push(e)));
  all.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return all.slice(0, LIMIT_PER_AVATAR);
}

function renderEntry(entry, sdk) {
  const item = document.createElement('details');
  item.className = 'nv-search-entry';
  const query = entry.query || '(검색)';
  const count = (entry.results || []).length;
  const when = formatRelativeShort(entry.ts);

  item.innerHTML = `
    <summary class="nv-search-summary">
      <span class="nv-search-query">${escapeHtml(query)}</span>
      <span class="nv-search-meta">${count}건 · ${when}</span>
    </summary>
    <div class="nv-search-results"></div>
  `;
  const resultsEl = item.querySelector('.nv-search-results');
  (entry.results || []).forEach(r => {
    const card = document.createElement('a');
    card.className = 'nv-search-card';
    card.href = r.url || '#';
    card.target = '_blank';
    card.rel = 'noopener noreferrer';
    const eyebrow = r.eyebrow || r.source || '';
    card.innerHTML = `
      ${eyebrow ? `<div class="nv-search-card-eyebrow">${escapeHtml(eyebrow)}</div>` : ''}
      <div class="nv-search-card-title">${escapeHtml(r.title || r.url || '')}</div>
    `;
    resultsEl.appendChild(card);
  });
  return item;
}

function formatRelativeShort(ts) {
  if (!ts) return '';
  const diffSec = Math.max(0, (Date.now() - ts) / 1000);
  if (diffSec < 60) return '방금';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}분 전`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}시간 전`;
  return `${Math.floor(diffSec / 86400)}일 전`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function ensureSearchPanelStyle() {
  if (document.getElementById('nv-sdk-search-panel-style')) return;
  const css = `
.nv-search-panel { padding: 20px 16px 32px; }
.nv-search-panel-title {
  display: flex; align-items: baseline; gap: 8px;
  font-size: 13px; font-weight: 700; color: var(--nv-text-muted);
  letter-spacing: 0.3px;
  margin-bottom: 14px;
  text-transform: uppercase;
}
.nv-search-empty { text-align: center; color: var(--nv-text-faint); font-size: 13px; line-height: 1.7; padding: 40px 16px; }
.nv-search-list { display: flex; flex-direction: column; gap: 8px; }

.nv-search-entry {
  border: 1px solid var(--nv-border);
  border-radius: 12px;
  background: var(--nv-bg);
  overflow: hidden;
}
.nv-search-entry[open] { background: var(--nv-surface-alt); }
.nv-search-summary {
  list-style: none; cursor: pointer;
  padding: 12px 14px;
  display: flex; flex-direction: column; gap: 4px;
}
.nv-search-summary::-webkit-details-marker { display: none; }
.nv-search-query { font-size: 13.5px; font-weight: 600; color: var(--nv-text); line-height: 1.4; word-break: break-word; }
.nv-search-meta { font-size: 11px; color: var(--nv-text-faint); }
.nv-search-results { padding: 0 14px 14px; display: flex; flex-direction: column; gap: 8px; }
.nv-search-card {
  display: flex; flex-direction: column; gap: 3px;
  padding: 10px 12px;
  background: var(--nv-bg);
  border: 1px solid var(--nv-border);
  border-radius: 10px;
  text-decoration: none;
  transition: background 0.12s ease, border-color 0.12s ease;
}
.nv-search-card:hover { background: var(--nv-surface); border-color: var(--nv-primary); }
.nv-search-card-eyebrow { font-size: 10.5px; color: var(--nv-primary); font-weight: 600; letter-spacing: 0.2px; }
.nv-search-card-title { font-size: 12.5px; color: var(--nv-text); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
`;
  const s = document.createElement('style');
  s.id = 'nv-sdk-search-panel-style';
  s.textContent = css;
  document.head.appendChild(s);
}
