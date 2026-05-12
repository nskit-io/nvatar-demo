// Minimal hash-based router for SDK views.
// Each route returns a "cleanup" function to tear down WS/listeners on leave.

export class Router {
  constructor(routes) {
    this.routes = routes;
    this.root = null;
    this.current = null;
    this.cleanup = null;
  }

  mount(rootEl) {
    this.root = rootEl;
  }

  go(name, params = {}, opts = {}) {
    if (!this.routes[name]) throw new Error('Unknown route: ' + name);
    if (this.cleanup) { try { this.cleanup(); } catch(e) {} this.cleanup = null; }

    // Sync hash unless triggered by hashchange
    if (!opts.fromHash) {
      const hash = this._encodeHash(name, params);
      if (location.hash !== hash) location.hash = hash;
    }

    this.root.innerHTML = '';
    this.current = { name, params };
    const ctx = { params, root: this.root };
    const ret = this.routes[name](ctx);
    if (typeof ret === 'function') this.cleanup = ret;
    else if (ret && typeof ret.then === 'function') ret.then(fn => { if (typeof fn === 'function') this.cleanup = fn; });
  }

  destroy() {
    if (this.cleanup) { try { this.cleanup(); } catch(e) {} this.cleanup = null; }
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
