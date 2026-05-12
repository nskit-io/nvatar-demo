// NVatar SDK Chat — Entry point.
// Lightweight chat-only SDK: no environment/room, 1:1 chat, MBTI/persona/Avatar-OS preserved.
//
// Usage:
//   const sdk = new NVatarChatSDK({ container, apiBase, userId, maxSlots, totalSlots });
//   await sdk.start();

import { Api } from './api.js';
import { Router } from './router.js';
import { renderListView } from './view-list.js';
import { renderRoomView } from './view-room.js';
import { NoopActionProvider } from './action-provider.js';

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

    this.router = new Router({
      list: (ctx) => renderListView(this, ctx),
      room: (ctx) => renderRoomView(this, ctx),
    });
  }

  async start() {
    this.container.innerHTML = '';
    this.router.mount(this.container);
    // Boot route from hash or default to list
    const initial = this._parseHash() || { name: 'list' };
    this.router.go(initial.name, initial.params);
    window.addEventListener('hashchange', () => {
      const route = this._parseHash() || { name: 'list' };
      this.router.go(route.name, route.params, { fromHash: true });
    });
  }

  destroy() {
    this.router.destroy();
    this.container.innerHTML = '';
  }

  // --- Navigation helpers (used by views) ---

  goToList() { this.router.go('list'); }
  goToRoom(avatarId, avatarName) { this.router.go('room', { avatarId, avatarName }); }

  // --- Hash routing ---
  //
  // #/list                 → 인덱스
  // #/room/123?name=비비   → 채팅 룸 (avatarId=123)
  //
  // Hash routing 이유: 모바일 뒤로가기(swipe) 가 자연스럽게 동작. history.back() 만으로 인덱스 복귀.

  _parseHash() {
    const h = location.hash.replace(/^#\/?/, '');
    if (!h) return null;
    const [path, query] = h.split('?');
    const seg = path.split('/');
    if (seg[0] === 'list') return { name: 'list' };
    if (seg[0] === 'room' && seg[1]) {
      const params = new URLSearchParams(query || '');
      return { name: 'room', params: { avatarId: Number(seg[1]), avatarName: params.get('name') || '' } };
    }
    return null;
  }
}
