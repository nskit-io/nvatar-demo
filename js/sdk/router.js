// Hash-based router for SDK views.
//
// Two layouts:
//   single  — mobile: 한 mount root, route 마다 unmount + mount (list ↔ room 전환)
//   split   — desktop: list pane (영구 mount) + room pane (route 따라 mount/cleanup).
//             aux pane 은 router 가 직접 다루지 않음 — SDK 가 별도 hook 으로 채움.
//
// 각 route 는 cleanup 함수를 반환할 수 있음 — leave 시 WS/리스너 해제.

export class Router {
  constructor(routes) {
    this.routes = routes;
    this.mode = 'single';
    this.roots = { main: null, list: null, room: null };
    this.cleanups = { main: null, room: null };
    this.current = null;
    this._listMounted = false;
  }

  /** Single-pane mount. Mobile 모드. */
  mount(rootEl) {
    this.mode = 'single';
    this.roots.main = rootEl;
  }

  /** Split mount — list 는 영구, room 만 라우팅. Desktop 모드. */
  mountSplit(listEl, roomEl) {
    this.mode = 'split';
    this.roots.list = listEl;
    this.roots.room = roomEl;
    // list 영구 마운트 (1회만 호출)
    if (!this._listMounted && this.routes.list) {
      const ret = this.routes.list({ params: {}, root: listEl });
      // list cleanup 은 destroy 시까지 보관 안 함 — list 는 lifetime = SDK lifetime
      void ret;
      this._listMounted = true;
    }
  }

  go(name, params = {}, opts = {}) {
    if (!this.routes[name]) throw new Error('Unknown route: ' + name);

    // Sync hash unless triggered by hashchange
    if (!opts.fromHash) {
      const hash = this._encodeHash(name, params);
      if (location.hash !== hash) location.hash = hash;
    }
    this.current = { name, params };

    if (this.mode === 'single') {
      if (this.cleanups.main) { try { this.cleanups.main(); } catch(e) {} this.cleanups.main = null; }
      this.roots.main.innerHTML = '';
      const ret = this.routes[name]({ params, root: this.roots.main });
      this._stowCleanup('main', ret);
      return;
    }

    // split mode
    if (name === 'list') {
      // Desktop 에서 list 라우팅 = room pane 만 빈 상태로 클리어 (list 는 영구)
      if (this.cleanups.room) { try { this.cleanups.room(); } catch(e) {} this.cleanups.room = null; }
      this.roots.room.innerHTML = '';
      this.roots.room.appendChild(this._emptyRoomPane());
    } else if (name === 'room') {
      if (this.cleanups.room) { try { this.cleanups.room(); } catch(e) {} this.cleanups.room = null; }
      this.roots.room.innerHTML = '';
      const ret = this.routes.room({ params, root: this.roots.room });
      this._stowCleanup('room', ret);
    }
  }

  destroy() {
    Object.keys(this.cleanups).forEach(k => {
      if (this.cleanups[k]) { try { this.cleanups[k](); } catch(e) {} this.cleanups[k] = null; }
    });
  }

  _stowCleanup(slot, ret) {
    if (typeof ret === 'function') this.cleanups[slot] = ret;
    else if (ret && typeof ret.then === 'function') {
      ret.then(fn => { if (typeof fn === 'function') this.cleanups[slot] = fn; });
    }
  }

  _emptyRoomPane() {
    const wrap = document.createElement('div');
    wrap.className = 'nv-room-empty';
    wrap.innerHTML = `<div class="nv-room-empty-inner">
      <div class="nv-room-empty-icon">💬</div>
      <div class="nv-room-empty-text">왼쪽에서 친구를 선택하세요</div>
    </div>`;
    return wrap;
  }

  _encodeHash(name, params) {
    if (name === 'list') return '#/list';
    if (name === 'room') {
      const q = params.avatarName ? `?name=${encodeURIComponent(params.avatarName)}` : '';
      return `#/room/${params.avatarId}${q}`;
    }
    return '#/list';
  }
}
