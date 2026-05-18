// NVatar SDK Chat — Entry point.
//
// Lightweight chat-only SDK. Layout 자동 분기:
//   < 900px              → mobile  (single column, hash routing)
//   900~1399px           → desktop (2-pane: list 4 / room 6)
//   >= 1400px            → wide    (3-pane: list / room / aux, aux 영역 active)
//
// Usage:
//   const sdk = new NVatarChatSDK({
//     container,
//     coreBase, resBase, whisperUrl,
//     userId,
//     brand: { title, logo, characters, colors, labels },
//     layout: 'auto',          // 'auto' | 'mobile' | 'desktop' | 'wide'
//     renderAux: (el, ctx) => { ... },   // wide 모드 보조 영역 hook
//   });
//   await sdk.start();

import { Api } from './api.js';
import { Router } from './router.js';
import { renderListView } from './view-list.js';
import { renderRoomView } from './view-room.js';
import { NoopActionProvider } from './action-provider.js';
import { resolveBrand, applyBrandVars, toSyncPayload } from './brand.js';
import { SearchHistoryStore, renderSearchHistoryPanel } from './search-history.js';

const BP_DESKTOP = 900;
const BP_WIDE    = 1400;
const SHELL_STYLE_ID = 'nv-sdk-shell-style';

export class NVatarChatSDK {
  constructor(opts) {
    if (!opts?.container) throw new Error('container required');
    if (!opts?.coreBase) throw new Error('coreBase required');
    if (!opts?.resBase) throw new Error('resBase required');
    if (!opts?.userId) throw new Error('userId required');

    this.container = opts.container;
    this.api = new Api({
      coreBase: opts.coreBase,
      resBase: opts.resBase,
      whisperUrl: opts.whisperUrl,
      userId: opts.userId,
    });
    this.userId = opts.userId;
    this.maxSlots = opts.maxSlots ?? 2;
    this.totalSlots = opts.totalSlots ?? 3;
    this.actionProvider = opts.actionProvider || new NoopActionProvider();
    this.brand = resolveBrand(opts.brand);
    this.layout = opts.layout || 'auto';   // 'auto' | 'mobile' | 'desktop' | 'wide'
    this.renderAux = typeof opts.renderAux === 'function' ? opts.renderAux : null;
    this.onClose = typeof opts.onClose === 'function' ? opts.onClose : null;
    // 검색 기록 영구화 — true 면 localStorage 백업. default 휘발성 (탭 닫으면 사라짐).
    this.searchHistory = new SearchHistoryStore({
      userId: this.userId,
      persist: opts.persistSearchHistory === true,
    });
    this._currentAvatarId = null;
    this._currentAvatarName = null;
    this._searchOverlay = null;

    this.mode = null;          // resolved mode ('mobile' | 'desktop' | 'wide')
    this.shellEl = null;       // wrapper inside container
    this.panes = {};
    this._resizeHandler = null;

    this.router = new Router({
      list: (ctx) => renderListView(this, ctx),
      room: (ctx) => renderRoomView(this, ctx),
    });
  }

  async start() {
    ensureShellStyle();
    this.container.innerHTML = '';
    this.container.classList.add('nv-sdk-root');
    applyBrandVars(this.container, this.brand);

    // 프랜차이즈 캐릭터 sync — backend (nv_vrm_models) 에 upsert.
    // brand.franchiseCode 박혀있을 때만. 실패해도 SDK 진입은 진행 (resilient).
    if (this.brand.franchiseCode && this.brand.characters.length) {
      try {
        await this.api.syncFranchiseCharacters(
          this.brand.franchiseCode,
          toSyncPayload(this.brand.characters),
        );
      } catch (e) {
        console.warn('[NVatar] franchise sync failed:', e.message || e);
      }
    }

    this.mode = this._resolveMode();
    this._buildShell(this.mode);
    this._wireRouter();
    await this._bootRoute();

    window.addEventListener('hashchange', this._onHashChange);
    if (this.layout === 'auto') {
      this._resizeHandler = debounce(() => this._maybeRelayout(), 180);
      window.addEventListener('resize', this._resizeHandler);
    }
  }

  destroy() {
    window.removeEventListener('hashchange', this._onHashChange);
    if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
    this.router.destroy();
    this.container.innerHTML = '';
    this.container.classList.remove('nv-sdk-root', 'nv-mode-mobile', 'nv-mode-desktop', 'nv-mode-wide');
  }

  // --- Navigation helpers (used by views) ---

  goToList() { this.router.go('list'); }
  goToRoom(avatarId, avatarName) {
    this._currentAvatarId = avatarId;
    this._currentAvatarName = avatarName;
    this.router.go('room', { avatarId, avatarName });
    this._updateSearchBadge();
    // wide 모드: aux 영역 갱신 (검색 기록 또는 호스트 콜백)
    if (this.mode === 'wide' && this.panes.aux) {
      this._renderAuxContent(this.panes.aux, avatarId);
    }
    // desktop/wide 에선 list pane 의 active highlight 갱신
    if (this.mode !== 'mobile' && this.panes.list) {
      this.panes.list.querySelectorAll('.nv-chat-row.is-active').forEach(r => r.classList.remove('is-active'));
      const row = this.panes.list.querySelector(`.nv-chat-row[data-avatar-id="${avatarId}"]`);
      if (row) row.classList.add('is-active');
    }
  }

  /** view-room 이 새 검색 결과 push 시 호출. aux/overlay/헤더 count 즉시 갱신. */
  notifySearchUpdated(avatarId) {
    void avatarId;
    this._updateSearchBadge();
    if (this.mode === 'wide' && this.panes.aux) {
      this._renderAuxContent(this.panes.aux, this._currentAvatarId);
    }
    if (this._searchOverlay) {
      const panel = this._searchOverlay.querySelector('.nv-sdk-search-panel');
      if (panel) this._renderAuxContent(panel, this._currentAvatarId);
    }
  }

  _updateSearchBadge() {
    if (!this.headerEl) return;
    const badge = this.headerEl.querySelector('.nv-sdk-search-count');
    if (!badge) return;
    const id = this._currentAvatarId;
    const count = id ? this.searchHistory.list(id).length : 0;
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }
  }

  /** Used by view-room to decide if back button should be visible. */
  isMobileMode() { return this.mode === 'mobile'; }

  // --- internal ---

  _resolveMode() {
    if (this.layout !== 'auto') return this.layout;
    const w = window.innerWidth;
    if (w >= BP_WIDE) return 'wide';
    if (w >= BP_DESKTOP) return 'desktop';
    return 'mobile';
  }

  _buildShell(mode) {
    this.container.classList.remove('nv-mode-mobile', 'nv-mode-desktop', 'nv-mode-wide');
    this.container.classList.add(`nv-mode-${mode}`);

    const root = document.createElement('div');
    root.className = `nv-sdk-frame nv-sdk-frame-${mode}`;
    this.container.appendChild(root);
    this.shellEl = root;

    // Header — back/title/search (search btn 은 wide 가 아닐 때만 노출)
    const header = this._buildHeader(mode);
    root.appendChild(header);
    this.headerEl = header;

    // Body — 3-pane shell
    const shell = document.createElement('div');
    shell.className = `nv-shell nv-shell-${mode}`;
    root.appendChild(shell);

    if (mode === 'mobile') {
      const main = document.createElement('div');
      main.className = 'nv-pane nv-pane-main';
      shell.appendChild(main);
      this.panes = { main };
    } else {
      const list = document.createElement('div');
      list.className = 'nv-pane nv-pane-list';
      const room = document.createElement('div');
      room.className = 'nv-pane nv-pane-room';
      shell.appendChild(list);
      shell.appendChild(room);
      this.panes = { list, room };
      if (mode === 'wide') {
        const aux = document.createElement('div');
        aux.className = 'nv-pane nv-pane-aux';
        aux.innerHTML = this._defaultAuxPlaceholder();
        shell.appendChild(aux);
        this.panes.aux = aux;
        this._renderAuxContent(aux, null);
      }
    }
  }

  _buildHeader(mode) {
    const header = document.createElement('header');
    header.className = 'nv-sdk-header';
    const backHtml = this.onClose
      ? `<button class="nv-sdk-back" aria-label="닫기" type="button">${BACK_SVG}</button>`
      : `<span class="nv-sdk-back-spacer"></span>`;
    const titleHtml = `<h1 class="nv-sdk-title">${escapeText(this.brand.title)}</h1>`;
    // Search 버튼 — wide 가 아닐 때 (aux 영역 없을 때) 헤더에 박혀서 overlay 진입점.
    // 우측 상단 count badge — 현재 친구의 검색 기록 건수 (RAG 결과). 0 이면 숨김.
    const searchHtml = mode === 'wide'
      ? `<span class="nv-sdk-search-spacer"></span>`
      : `<button class="nv-sdk-search" aria-label="검색 기록" type="button">
           ${SEARCH_SVG}
           <span class="nv-sdk-search-count" style="display:none;">0</span>
         </button>`;
    header.innerHTML = backHtml + titleHtml + searchHtml;

    if (this.onClose) {
      header.querySelector('.nv-sdk-back').addEventListener('click', () => {
        try { this.onClose(); } catch (e) { console.error(e); }
      });
    }
    const searchBtn = header.querySelector('.nv-sdk-search');
    if (searchBtn) {
      searchBtn.addEventListener('click', () => this._openSearchOverlay());
    }
    return header;
  }

  /** Wide 모드 aux 영역 또는 search overlay 의 콘텐츠 렌더.
   *  호스트가 renderAux 박으면 그쪽 우선, 없으면 default = 검색 기록 아코디언. */
  _renderAuxContent(el, activeAvatarId) {
    if (this.renderAux) {
      try { this.renderAux(el, { sdk: this, avatarId: activeAvatarId, avatarName: this._currentAvatarName }); }
      catch (e) { console.error(e); }
      return;
    }
    renderSearchHistoryPanel(el, this, activeAvatarId);
  }

  _openSearchOverlay() {
    if (this._searchOverlay) { this._searchOverlay.remove(); this._searchOverlay = null; return; }
    const overlay = document.createElement('div');
    overlay.className = 'nv-sdk-search-overlay';
    overlay.innerHTML = `<div class="nv-sdk-search-panel"></div>`;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) { overlay.remove(); this._searchOverlay = null; }
    });
    this.shellEl.appendChild(overlay);
    this._searchOverlay = overlay;
    const panel = overlay.querySelector('.nv-sdk-search-panel');
    const activeId = this._currentAvatarId || null;
    this._renderAuxContent(panel, activeId);
  }

  _wireRouter() {
    if (this.mode === 'mobile') {
      this.router.mount(this.panes.main);
    } else {
      this.router.mountSplit(this.panes.list, this.panes.room);
    }
  }

  async _bootRoute() {
    const initial = this._parseHash();
    // hash 잔재 가드 — `#/room/{id}` 의 id 가 현재 사용자의 friend 가 아니면 list 로 fallback.
    // 다른 사용자 (게스트/이전 세션) 에서 만든 친구 id 가 URL 에 남아있어 그대로 room 에 진입되는
    // 보안 자리 차단.
    if (initial?.name === 'room' && initial.params?.avatarId) {
      const ok = await this._isOwnedAvatar(initial.params.avatarId);
      if (!ok) {
        console.warn('[NVatar] hash room ignored — not owned by current user:', initial.params.avatarId);
        location.hash = '#/list';
        if (this.mode === 'mobile') this.router.go('list');
        else this.router.go('list');
        return;
      }
    }
    if (this.mode === 'mobile') {
      this.router.go(initial?.name || 'list', initial?.params || {});
    } else {
      if (initial?.name === 'room' && initial.params?.avatarId) {
        this.goToRoom(initial.params.avatarId, initial.params.avatarName);
      } else {
        this.router.go('list');
      }
    }
  }

  async _isOwnedAvatar(avatarId) {
    try {
      const avatars = await this.api.listAvatars();
      return avatars.some(a => Number(a.id) === Number(avatarId));
    } catch (e) { return false; }
  }

  _maybeRelayout() {
    const next = this._resolveMode();
    if (next === this.mode) return;
    // mode 전환 — 라우터 상태 보존 위해 현재 route 캡처 후 재구축
    const currentRoute = this.router.current || { name: 'list', params: {} };
    this.router.destroy();
    this.router._listMounted = false;
    this.shellEl?.remove();
    this.mode = next;
    this._buildShell(next);
    this._wireRouter();
    if (currentRoute.name === 'room' && currentRoute.params?.avatarId) {
      this.goToRoom(currentRoute.params.avatarId, currentRoute.params.avatarName);
    } else {
      this.router.go('list');
    }
  }

  _onHashChange = async () => {
    const route = this._parseHash();
    if (!route) return;
    // hash 가 room 이면 ownership 검증 — 다른 사용자/세션의 잔재 차단
    if (route.name === 'room' && route.params?.avatarId) {
      const ok = await this._isOwnedAvatar(route.params.avatarId);
      if (!ok) {
        console.warn('[NVatar] hashchange room ignored — not owned:', route.params.avatarId);
        location.hash = '#/list';
        return;
      }
    }
    if (this.mode === 'mobile') {
      this.router.go(route.name, route.params, { fromHash: true });
    } else if (route.name === 'room' && route.params?.avatarId) {
      this.goToRoom(route.params.avatarId, route.params.avatarName);
    }
  };

  _parseHash() {
    const h = location.hash.replace(/^#\/?/, '');
    if (!h) return null;
    const [path, query] = h.split('?');
    const seg = path.split('/');
    if (seg[0] === 'list') return { name: 'list', params: {} };
    if (seg[0] === 'room' && seg[1]) {
      const params = new URLSearchParams(query || '');
      return { name: 'room', params: { avatarId: Number(seg[1]), avatarName: params.get('name') || '' } };
    }
    return null;
  }

  _defaultAuxPlaceholder() {
    return `<div class="nv-aux-default">
      <div class="nv-aux-default-icon">✨</div>
      <div class="nv-aux-default-text">친구를 선택하면<br>이 영역이 활용됩니다</div>
    </div>`;
  }
}

function debounce(fn, ms) {
  let t = null;
  return function(...args) {
    if (t) clearTimeout(t);
    t = setTimeout(() => { t = null; fn.apply(this, args); }, ms);
  };
}

function escapeText(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

const BACK_SVG = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`;
const SEARCH_SVG = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;

function ensureShellStyle() {
  if (document.getElementById(SHELL_STYLE_ID)) return;
  const css = `
.nv-sdk-root { width: 100%; height: 100%; position: relative; overflow: hidden; background: var(--nv-bg); }
.nv-sdk-frame { width: 100%; height: 100%; display: flex; flex-direction: column; }

/* SDK header (전체 layout 상단) */
.nv-sdk-header {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--nv-border);
  flex-shrink: 0;
  background: var(--nv-bg);
}
.nv-sdk-back, .nv-sdk-search {
  display: inline-flex; align-items: center; justify-content: center;
  width: 36px; height: 36px;
  background: transparent; border: none;
  color: var(--nv-text); cursor: pointer;
  border-radius: 10px;
  flex-shrink: 0;
  position: relative;
}
.nv-sdk-back:hover, .nv-sdk-search:hover { background: var(--nv-surface); }
.nv-sdk-back:active, .nv-sdk-search:active { background: var(--nv-border); }
.nv-sdk-search-count {
  position: absolute;
  top: 2px; right: 2px;
  min-width: 16px; height: 16px;
  padding: 0 5px;
  background: var(--nv-primary);
  color: #fff;
  font-size: 10px; font-weight: 700;
  border-radius: 8px;
  line-height: 1;
  display: inline-flex; align-items: center; justify-content: center;
  font-variant-numeric: tabular-nums;
}
.nv-sdk-back-spacer, .nv-sdk-search-spacer { width: 36px; height: 36px; flex-shrink: 0; }
.nv-sdk-title {
  flex: 1; min-width: 0;
  font-size: 16px; font-weight: 700;
  color: var(--nv-text);
  letter-spacing: -0.2px;
  text-align: center;
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}

/* Search overlay (mobile/desktop 모드에서 검색 버튼 클릭 시 띄움) */
.nv-sdk-search-overlay {
  position: absolute; inset: 0;
  background: rgba(15,23,42,0.5);
  z-index: 250;
  display: flex; align-items: stretch; justify-content: flex-end;
}
.nv-sdk-search-panel {
  width: 100%; max-width: 380px;
  background: var(--nv-bg);
  height: 100%;
  overflow-y: auto;
  box-shadow: -8px 0 30px rgba(0,0,0,0.2);
}

/* shell body (헤더 아래) */
.nv-shell { flex: 1; min-height: 0; display: flex; }

/* Mobile — single column */
.nv-shell-mobile .nv-pane-main { flex: 1; height: 100%; position: relative; overflow: hidden; }

/* Desktop — list 4 / room 6 */
.nv-shell-desktop { display: grid; grid-template-columns: 4fr 6fr; }
.nv-shell-desktop .nv-pane-list { border-right: 1px solid var(--nv-border); overflow: hidden; position: relative; }
.nv-shell-desktop .nv-pane-room { position: relative; overflow: hidden; }

/* Wide — chat 영역 (list+room) 7 : aux 3.
   chat 영역 안 비율은 desktop 과 동일 (4:6).
   grid-template-columns: list(4) room(6) aux(좌측 합계의 30%≈4.28).
   단순화: 28 / 42 / 30 → 4fr / 6fr / ~4.28fr ≈ 7/3 outer + 4/6 inner */
.nv-shell-wide { display: grid; grid-template-columns: 28fr 42fr 30fr; }
.nv-shell-wide .nv-pane-list { border-right: 1px solid var(--nv-border); overflow: hidden; position: relative; }
.nv-shell-wide .nv-pane-room { border-right: 1px solid var(--nv-border); position: relative; overflow: hidden; }
.nv-shell-wide .nv-pane-aux { overflow-y: auto; background: var(--nv-surface-alt, var(--nv-surface)); }

/* Empty room placeholder (desktop/wide, before a friend is selected) */
.nv-room-empty {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  background: var(--nv-bg);
}
.nv-room-empty-inner { text-align: center; color: var(--nv-text-faint); }
.nv-room-empty-icon { font-size: 40px; opacity: 0.5; margin-bottom: 12px; }
.nv-room-empty-text { font-size: 13px; }

/* Default aux placeholder */
.nv-aux-default {
  height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 24px; gap: 12px; color: var(--nv-text-faint); text-align: center;
}
.nv-aux-default-icon { font-size: 36px; opacity: 0.55; }
.nv-aux-default-text { font-size: 13px; line-height: 1.6; }

/* Active row highlight (desktop/wide list pane) */
.nv-chat-row.is-active { background: var(--nv-surface); }
.nv-chat-row.is-active:hover { background: var(--nv-surface); }
`;
  const s = document.createElement('style');
  s.id = SHELL_STYLE_ID;
  s.textContent = css;
  document.head.appendChild(s);
}
