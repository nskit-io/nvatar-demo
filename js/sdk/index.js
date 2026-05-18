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
import { resolveBrand, applyBrandVars } from './brand.js';

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
    // 호스트가 박으면 list 헤더 우측에 close (X) 버튼 노출 + 클릭 시 콜백 (PAGE.hidePage 등).
    this.onClose = typeof opts.onClose === 'function' ? opts.onClose : null;

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

    this.mode = this._resolveMode();
    this._buildShell(this.mode);
    this._wireRouter();
    this._bootRoute();

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
    this.router.go('room', { avatarId, avatarName });
    // wide 모드: aux 영역에 컨텍스트 갱신
    if (this.mode === 'wide' && this.panes.aux && this.renderAux) {
      try { this.renderAux(this.panes.aux, { avatarId, avatarName, sdk: this }); } catch (e) { console.error(e); }
    }
    // desktop/wide 에선 list pane 의 active highlight 갱신 (CSS selector)
    if (this.mode !== 'mobile' && this.panes.list) {
      this.panes.list.querySelectorAll('.nv-chat-row.is-active').forEach(r => r.classList.remove('is-active'));
      const row = this.panes.list.querySelector(`.nv-chat-row[data-avatar-id="${avatarId}"]`);
      if (row) row.classList.add('is-active');
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

    const shell = document.createElement('div');
    shell.className = `nv-shell nv-shell-${mode}`;
    this.container.appendChild(shell);
    this.shellEl = shell;

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
        if (this.renderAux) {
          try { this.renderAux(aux, { sdk: this }); } catch (e) { console.error(e); }
        }
      }
    }
  }

  _wireRouter() {
    if (this.mode === 'mobile') {
      this.router.mount(this.panes.main);
    } else {
      this.router.mountSplit(this.panes.list, this.panes.room);
    }
  }

  _bootRoute() {
    const initial = this._parseHash();
    if (this.mode === 'mobile') {
      this.router.go(initial?.name || 'list', initial?.params || {});
    } else {
      // Desktop/wide: list 는 이미 영구 마운트. room 은 hash 따라 또는 empty.
      if (initial?.name === 'room' && initial.params?.avatarId) {
        this.goToRoom(initial.params.avatarId, initial.params.avatarName);
      } else {
        this.router.go('list');   // room pane 클리어 + empty placeholder
      }
    }
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

  _onHashChange = () => {
    const route = this._parseHash();
    if (!route) return;
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

function ensureShellStyle() {
  if (document.getElementById(SHELL_STYLE_ID)) return;
  const css = `
.nv-sdk-root { width: 100%; height: 100%; position: relative; overflow: hidden; background: var(--nv-bg); }
.nv-shell { width: 100%; height: 100%; display: flex; }

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
