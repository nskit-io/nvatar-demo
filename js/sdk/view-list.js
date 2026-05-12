// NVatar SDK Chat — Index view.
// Avatar list (thumbnail + last message + date) + slot counter button + create dialog.

import { openCreateDialog } from './view-create.js';

const STYLE_ID = 'nv-sdk-list-style';

export async function renderListView(sdk, ctx) {
  ensureStyle();

  const root = ctx.root;
  root.innerHTML = TEMPLATE;

  const listEl = root.querySelector('.nv-list');
  const ctaEl = root.querySelector('.nv-cta-btn');

  // Back button: 데모 컨텍스트에선 history.back() 으로 호스트 페이지 복귀
  root.querySelector('.nv-back').addEventListener('click', () => history.back());

  // Initial load
  await refresh();

  ctaEl.addEventListener('click', async () => {
    const current = ctaEl.dataset.count | 0;
    if (current >= sdk.maxSlots) {
      showLockedDialog(root);
      return;
    }
    openCreateDialog(sdk, root, async (newAvatar) => {
      await refresh();
      if (newAvatar) sdk.goToRoom(newAvatar.id, newAvatar.name);
    });
  });

  async function refresh() {
    try {
      // Load avatars + vrm thumbnail index in parallel (백엔드 인덱스를 그대로 신뢰).
      const [avatars, vrmModels] = await Promise.all([
        sdk.api.listAvatars(),
        sdk.api.listVrmModels().catch(() => []),
      ]);
      const thumbByUid = new Map(vrmModels.filter(m => m.thumbnail).map(m => [m.uid, m.thumbnail]));
      renderList(avatars, thumbByUid);
      updateCta(avatars.length);
      // Background: fetch last message previews (parallel, best-effort)
      avatars.forEach(a => hydratePreview(a));
    } catch (e) {
      listEl.innerHTML = `<div class="nv-empty" style="color:#ef4444;">불러오기 실패: ${e.message || e}</div>`;
    }
  }

  function renderList(avatars, thumbByUid) {
    if (!avatars.length) {
      listEl.innerHTML = `<div class="nv-empty">아직 만들어진 아바타가 없어요.<br>아래 버튼으로 첫 아바타를 만들어보세요.</div>`;
      return;
    }
    listEl.innerHTML = '';
    avatars.forEach(a => {
      const item = document.createElement('div');
      item.className = 'nv-item';
      item.dataset.avatarId = a.id;
      const thumbUrl = a.vrm_uid ? thumbByUid.get(a.vrm_uid) : null;
      const thumbStyle = thumbUrl ? `style="background-image:url('${thumbUrl}')"` : '';
      item.innerHTML = `
        <div class="nv-thumb ${thumbUrl ? '' : 'nv-thumb-empty'}" data-vrm-uid="${a.vrm_uid || ''}" ${thumbStyle}></div>
        <div class="nv-body">
          <div class="nv-name">${escapeHtml(a.name)}</div>
          <div class="nv-bubble" data-preview="${a.id}">…</div>
          <div class="nv-date" data-date="${a.id}"></div>
        </div>
        <button class="nv-del" aria-label="삭제">×</button>
      `;
      item.querySelector('.nv-body').addEventListener('click', () => sdk.goToRoom(a.id, a.name));
      item.querySelector('.nv-thumb').addEventListener('click', () => sdk.goToRoom(a.id, a.name));
      item.querySelector('.nv-del').addEventListener('click', (ev) => {
        ev.stopPropagation();
        confirmDelete(a, refresh);
      });
      listEl.appendChild(item);
    });
  }

  async function hydratePreview(avatar) {
    try {
      const msgs = await sdk.api.getMessages(avatar.id, 1);
      const last = msgs[msgs.length - 1];
      const preview = root.querySelector(`[data-preview="${avatar.id}"]`);
      const dateEl = root.querySelector(`[data-date="${avatar.id}"]`);
      if (!preview || !dateEl) return;
      if (!last) {
        preview.textContent = '아직 대화가 없어요.';
        dateEl.textContent = '';
      } else {
        preview.textContent = trimPreview(last.content);
        dateEl.textContent = formatDate(last.created_at);
      }
    } catch (e) { /* silent */ }
  }

  function confirmDelete(avatar, after) {
    showDialog(root, {
      title: `${avatar.name} 삭제`,
      body: `이 아바타와 대화 기록이 모두 삭제됩니다. 계속할까요?`,
      cancel: '취소',
      confirm: '삭제',
      confirmDanger: true,
      onConfirm: async () => {
        try {
          await sdk.api.deleteAvatar(avatar.id);
          await after();
        } catch (e) { alert('삭제 실패: ' + e.message); }
      },
    });
  }

  function updateCta(count) {
    const max = sdk.maxSlots;
    ctaEl.textContent = `새 아바타 추가하기 (${count}/${max})`;
    ctaEl.dataset.count = count;
    ctaEl.classList.toggle('locked', count >= max);
  }
}

function showLockedDialog(root) {
  showDialog(root, {
    title: '슬롯이 가득 찼어요',
    body: '추가 슬롯은 구매 후 진행 가능합니다.\n슬롯 구매는 서비스 준비중입니다.',
    confirm: '확인',
    onConfirm: () => {},
  });
}

// --- Generic dialog shared with this module ---

export function showDialog(root, { title, body, cancel, confirm, confirmDanger, onConfirm, onCancel }) {
  const overlay = document.createElement('div');
  overlay.className = 'nv-dialog-overlay';
  overlay.innerHTML = `
    <div class="nv-dialog">
      <div class="nv-dialog-title">${escapeHtml(title)}</div>
      <div class="nv-dialog-body">${escapeHtml(body)}</div>
      <div class="nv-dialog-actions">
        ${cancel ? `<button class="nv-btn nv-btn-secondary nv-cancel">${escapeHtml(cancel)}</button>` : ''}
        <button class="nv-btn ${confirmDanger ? 'nv-btn-danger' : 'nv-btn-primary'} nv-confirm">${escapeHtml(confirm || '확인')}</button>
      </div>
    </div>`;
  root.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('.nv-confirm').addEventListener('click', () => { close(); onConfirm && onConfirm(); });
  if (cancel) overlay.querySelector('.nv-cancel').addEventListener('click', () => { close(); onCancel && onCancel(); });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) { close(); onCancel && onCancel(); } });
}

// --- helpers ---

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function trimPreview(text) {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  return t.length > 60 ? t.slice(0, 60) + '…' : t;
}

function formatDate(s) {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d)) return '';
  return `${d.getFullYear()}. ${pad(d.getMonth()+1)}. ${pad(d.getDate())}`;
}
function pad(n) { return String(n).padStart(2, '0'); }

// --- Styles + template ---

const TEMPLATE = `
<div class="nv-screen nv-list-screen">
  <header class="nv-header">
    <button class="nv-back" aria-label="뒤로">‹</button>
    <h1>아바타 채팅</h1>
  </header>
  <main class="nv-main">
    <div class="nv-section-title"><span class="nv-bar"></span>아바타 목록</div>
    <div class="nv-list"></div>
    <button class="nv-cta-btn" data-count="0">새 아바타 추가하기 (0/2)</button>
    <ul class="nv-notice">
      <li>아바타 생성은 2슬롯까지 제공됩니다.</li>
      <li>더 많은 아바타를 만드려면 추가 슬롯을 구매해야합니다.</li>
      <li>슬롯 구매는 서비스 준비중입니다.</li>
    </ul>
  </main>
</div>`;

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const css = `
.nv-screen { display: flex; flex-direction: column; height: 100%; background: #ffffff; color: #111827; }
.nv-header { display: flex; align-items: center; gap: 8px; padding: 14px 16px; border-bottom: 1px solid #e5e7eb; flex-shrink: 0; }
.nv-header h1 { font-size: 18px; font-weight: 700; }
.nv-back { width: 32px; height: 32px; border: none; background: transparent; font-size: 24px; color: #111827; cursor: pointer; padding: 0; line-height: 1; }

.nv-main { flex: 1; overflow-y: auto; padding: 20px 16px 32px; }
.nv-section-title { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 600; margin-bottom: 16px; }
.nv-bar { width: 4px; height: 16px; background: #ef4444; border-radius: 2px; }

.nv-list { display: flex; flex-direction: column; gap: 18px; margin-bottom: 24px; }
.nv-item { display: grid; grid-template-columns: 64px 1fr auto; gap: 12px; align-items: start; }
.nv-thumb { width: 56px; height: 56px; border-radius: 50%; border: 1px solid #d1d5db; background: #f3f4f6 center/cover no-repeat; cursor: pointer; flex-shrink: 0; }
.nv-body { display: flex; flex-direction: column; gap: 4px; cursor: pointer; min-width: 0; }
.nv-name { font-size: 15px; font-weight: 700; }
.nv-bubble { display: inline-block; padding: 8px 12px; background: #f3f4f6; border-radius: 14px; font-size: 13px; color: #374151; line-height: 1.5; max-width: 100%; word-break: break-word; }
.nv-date { font-size: 11px; color: #9ca3af; margin-top: 2px; }
.nv-del { width: 28px; height: 28px; border: none; background: transparent; color: #9ca3af; font-size: 18px; cursor: pointer; border-radius: 4px; }
.nv-del:active { background: #fee2e2; color: #ef4444; }
.nv-empty { text-align: center; color: #9ca3af; padding: 32px 0; font-size: 13px; line-height: 1.6; }

.nv-cta-btn { width: 100%; padding: 16px; border: none; border-radius: 10px; background: #3b46c4; color: #fff; font-size: 15px; font-weight: 700; cursor: pointer; margin-bottom: 18px; }
.nv-cta-btn:active { background: #2f3aa3; }
.nv-cta-btn.locked { background: #9ca3af; }
.nv-cta-btn.locked:active { background: #6b7280; }

.nv-notice { list-style: none; padding: 0 4px; }
.nv-notice li { position: relative; padding-left: 18px; font-size: 12px; color: #6b7280; line-height: 1.8; }
.nv-notice li::before { content: '*'; position: absolute; left: 4px; top: 0; }

/* Dialog */
.nv-dialog-overlay { position: absolute; inset: 0; background: rgba(15,23,42,0.5); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 24px; }
.nv-dialog { background: #fff; border-radius: 16px; padding: 22px 20px 18px; max-width: 340px; width: 100%; box-shadow: 0 20px 50px rgba(0,0,0,0.3); }
.nv-dialog-title { font-size: 16px; font-weight: 700; margin-bottom: 10px; }
.nv-dialog-body { font-size: 13px; color: #4b5563; line-height: 1.6; white-space: pre-line; margin-bottom: 18px; }
.nv-dialog-actions { display: flex; gap: 8px; justify-content: flex-end; }
.nv-btn { padding: 10px 18px; border-radius: 8px; border: none; font-size: 14px; font-weight: 600; cursor: pointer; }
.nv-btn-primary { background: #3b46c4; color: #fff; }
.nv-btn-secondary { background: #e5e7eb; color: #374151; }
.nv-btn-danger { background: #ef4444; color: #fff; }
`;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = css;
  document.head.appendChild(style);
}
