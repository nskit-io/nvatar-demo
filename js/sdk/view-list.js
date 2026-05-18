// NVatar SDK Chat — Index view (KakaoTalk-style).
//
// IA: 상단 = 아바타 슬롯 (정체성 + 생성), 하단 = 대화 리스트 (활동).
//   ┌ 헤더 (brand logo + title)
//   ├ 슬롯 (100×100 카드 × totalSlots, 마지막은 잠금)
//   ├ 섹션 label "대화"
//   └ 채팅 row (썸네일 + 이름/시간 + 회색 버블 2줄)
//
// 슬롯 탭  → stats 다이얼로그 (감정/MBTI 정보 — 이름변경/설정 X)
// + 슬롯 탭 → 생성 다이얼로그
// 잠긴 슬롯 → 안내 다이얼로그
// row 탭   → 채팅방 진입

import { openCreateDialog } from './view-create.js';
import { openStatsDialog } from './view-stats.js';
import { renderBrandHeader } from './brand.js';

const STYLE_ID = 'nv-sdk-list-style';

export async function renderListView(sdk, ctx) {
  ensureStyle();

  const root = ctx.root;
  const brand = sdk.brand;
  const labels = brand.labels;
  root.innerHTML = renderTemplate(brand, sdk.totalSlots, !!sdk.onClose);

  const slotsEl = root.querySelector('.nv-slots');
  const listEl = root.querySelector('.nv-chats');
  const closeBtn = root.querySelector('.nv-list-close');
  if (closeBtn && sdk.onClose) {
    closeBtn.addEventListener('click', () => { try { sdk.onClose(); } catch (e) { console.error(e); } });
  }

  let avatarsCache = [];
  let thumbByUid = new Map();

  await refresh();

  async function refresh() {
    try {
      const [avatars, vrmModels] = await Promise.all([
        sdk.api.listAvatars(),
        sdk.api.listVrmModels().catch(() => []),
      ]);
      avatarsCache = avatars;
      thumbByUid = new Map(vrmModels.filter(m => m.thumbnail).map(m => [m.uid, m.thumbnail]));
      renderSlots(avatars);
      renderChats(avatars);
      avatars.forEach(a => hydratePreview(a));
    } catch (e) {
      listEl.innerHTML = `<div class="nv-empty" style="color:var(--nv-accent);">불러오기 실패: ${escapeHtml(e.message || String(e))}</div>`;
    }
  }

  // --- Top slots ---
  function renderSlots(avatars) {
    slotsEl.innerHTML = '';
    const total = sdk.totalSlots;
    for (let i = 0; i < total; i++) {
      const a = avatars[i];
      const lockedByPlan = i >= sdk.maxSlots;
      const card = document.createElement('button');
      card.className = 'nv-slot';
      card.type = 'button';

      if (a) {
        const thumb = a.vrm_uid ? thumbByUid.get(a.vrm_uid) : null;
        card.classList.add('nv-slot-filled');
        card.innerHTML = `
          <div class="nv-slot-face ${thumb ? '' : 'nv-slot-face-empty'}"
               ${thumb ? `style="background-image:url('${escapeAttr(thumb)}')"` : ''}></div>
          <div class="nv-slot-name">${escapeHtml(a.name)}</div>
        `;
        card.addEventListener('click', () => openSlotStats(a));
      } else if (lockedByPlan) {
        card.classList.add('nv-slot-locked');
        card.innerHTML = `
          <div class="nv-slot-face nv-slot-face-locked">${LOCK_SVG}</div>
          <div class="nv-slot-name">잠금</div>
        `;
        card.addEventListener('click', () => showLockedDialog(root, labels));
      } else {
        card.classList.add('nv-slot-empty');
        card.innerHTML = `
          <div class="nv-slot-face nv-slot-face-plus">${PLUS_SVG}</div>
          <div class="nv-slot-name">추가하기</div>
        `;
        card.addEventListener('click', () => openCreateDialog(sdk, root, async (newAvatar) => {
          await refresh();
          if (newAvatar) sdk.goToRoom(newAvatar.id, newAvatar.name);
        }));
      }
      slotsEl.appendChild(card);
    }
  }

  async function openSlotStats(a) {
    // listAvatars 응답은 emotions/MBTI 미포함 → 단건 fetch.
    try {
      const full = await sdk.api.getAvatar(a.id);
      openStatsDialog(root, full || a);
    } catch (e) {
      openStatsDialog(root, a);
    }
  }

  // --- Chat rows ---
  function renderChats(avatars) {
    if (!avatars.length) {
      listEl.innerHTML = `<div class="nv-empty">${escapeHtml(labels.empty).replace(/\n/g, '<br>')}</div>`;
      return;
    }
    listEl.innerHTML = '';
    avatars.forEach(a => {
      const item = document.createElement('div');
      item.className = 'nv-chat-row';
      item.dataset.avatarId = a.id;
      const thumb = a.vrm_uid ? thumbByUid.get(a.vrm_uid) : null;
      item.innerHTML = `
        <div class="nv-chat-thumb ${thumb ? '' : 'nv-chat-thumb-empty'}"
             ${thumb ? `style="background-image:url('${escapeAttr(thumb)}')"` : ''}></div>
        <div class="nv-chat-body">
          <div class="nv-chat-top">
            <div class="nv-chat-name">${escapeHtml(a.name)}</div>
            <div class="nv-chat-time" data-time="${a.id}"></div>
          </div>
          <div class="nv-chat-bubble" data-preview="${a.id}">…</div>
        </div>
        <button class="nv-chat-del" aria-label="삭제">×</button>
      `;
      const body = item.querySelector('.nv-chat-body');
      const thumbEl = item.querySelector('.nv-chat-thumb');
      const open = () => sdk.goToRoom(a.id, a.name);
      body.addEventListener('click', open);
      thumbEl.addEventListener('click', open);
      item.querySelector('.nv-chat-del').addEventListener('click', (ev) => {
        ev.stopPropagation();
        confirmDelete(a);
      });
      listEl.appendChild(item);
    });
  }

  async function hydratePreview(avatar) {
    try {
      const msgs = await sdk.api.getMessages(avatar.id, 1);
      const last = msgs[msgs.length - 1];
      const preview = root.querySelector(`[data-preview="${avatar.id}"]`);
      const timeEl = root.querySelector(`[data-time="${avatar.id}"]`);
      if (!preview || !timeEl) return;
      if (!last) {
        preview.textContent = '아직 대화가 없어요.';
        preview.classList.add('nv-chat-bubble-empty');
        timeEl.textContent = '';
      } else {
        preview.textContent = last.content || '';
        preview.classList.remove('nv-chat-bubble-empty');
        timeEl.textContent = formatRelativeTime(last.created_at);
      }
    } catch (e) { /* silent */ }
  }

  function confirmDelete(avatar) {
    showDialog(root, {
      title: `${avatar.name} 삭제`,
      body: `이 ${labels.entity}와(과) 대화 기록이 모두 삭제됩니다.\n계속할까요?`,
      cancel: '취소',
      confirm: '삭제',
      confirmDanger: true,
      onConfirm: async () => {
        try {
          await sdk.api.deleteAvatar(avatar.id);
          await refresh();
        } catch (e) { alert('삭제 실패: ' + e.message); }
      },
    });
  }
}

function showLockedDialog(root, labels) {
  showDialog(root, {
    title: labels.slotsLockedTitle,
    body: labels.slotsLockedBody,
    confirm: '확인',
    onConfirm: () => {},
  });
}

// --- Generic dialog (shared with create/room views) ---

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
function escapeAttr(s) { return escapeHtml(s); }
function pad(n) { return String(n).padStart(2, '0'); }

// KakaoTalk-style time formatting:
//   오늘  → "14:32"
//   어제  → "어제"
//   올해  → "5/16"
//   작년+ → "2025. 12. 30"
// Boundary uses local midnight (not 24h window) — "오늘 00:30" 과 "어제 23:30"
// 이 자연스럽게 갈리도록.
function formatRelativeTime(s) {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d)) return '';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate  = new Date(d.getFullYear(),   d.getMonth(),   d.getDate());
  const dayDiff = Math.round((startOfToday - startOfDate) / 86400000);
  if (dayDiff <= 0) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (dayDiff === 1) return '어제';
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}/${d.getDate()}`;
  return `${d.getFullYear()}. ${pad(d.getMonth() + 1)}. ${pad(d.getDate())}`;
}

// --- Inline SVG icons (lucide-aligned) ---

const LOCK_SVG = `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;

const PLUS_SVG = `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;

// --- Template ---

function renderTemplate(brand, totalSlots, withClose) {
  void totalSlots;  // slots rendered dynamically
  const closeBtn = withClose
    ? `<button class="nv-list-close" aria-label="닫기" type="button">${CLOSE_SVG}</button>`
    : '';
  return `
<div class="nv-screen nv-list-screen">
  <header class="nv-list-header">
    ${renderBrandHeader(brand)}
    ${closeBtn}
  </header>
  <main class="nv-list-main">
    <section class="nv-slots-section">
      <div class="nv-slots"></div>
    </section>
    <section class="nv-chats-section">
      <div class="nv-section-label"><span class="nv-section-bar"></span>${escapeHtml(brand.labels.sectionChats)}</div>
      <div class="nv-chats"></div>
    </section>
  </main>
</div>`;
}

const CLOSE_SVG = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

// --- Styles (uses CSS variables injected by applyBrandVars) ---

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const css = `
.nv-sdk-root {
  font-family: var(--nv-font, -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Segoe UI', 'Pretendard', sans-serif);
  color: var(--nv-text);
  background: var(--nv-bg);
}

.nv-screen { display: flex; flex-direction: column; height: 100%; background: var(--nv-bg); color: var(--nv-text); }

/* Header */
.nv-list-header {
  display: flex; align-items: center; gap: 10px;
  padding: 16px 20px 8px;
  flex-shrink: 0;
}
.nv-brand-logo {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px;
  border-radius: 8px; overflow: hidden;
}
.nv-brand-logo img, .nv-brand-logo svg { width: 100%; height: 100%; object-fit: cover; display: block; }
.nv-brand-title { font-size: 22px; font-weight: 800; letter-spacing: -0.3px; flex: 1; min-width: 0; }
.nv-list-close {
  display: inline-flex; align-items: center; justify-content: center;
  width: 36px; height: 36px;
  background: transparent; border: none;
  color: var(--nv-text-muted); cursor: pointer;
  border-radius: 8px;
  flex-shrink: 0;
}
.nv-list-close:hover { background: var(--nv-surface); color: var(--nv-text); }
.nv-list-close:active { background: var(--nv-border); }

.nv-list-main { flex: 1; overflow-y: auto; padding: 8px 16px 32px; }

/* Slots — top section (100×100 cards) */
.nv-slots-section { padding: 12px 0 8px; }
.nv-slots {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 12px;
}
.nv-slot {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  background: transparent; border: none; padding: 8px 4px;
  cursor: pointer; font-family: inherit; color: inherit;
  border-radius: 14px;
  transition: background 0.12s ease, transform 0.08s ease;
}
.nv-slot:hover { background: var(--nv-surface-alt); }
.nv-slot:active { transform: scale(0.97); }

.nv-slot-face {
  width: 100px; height: 100px;
  border-radius: 22px;
  background: var(--nv-surface) center/cover no-repeat;
  border: 1px solid var(--nv-border);
  display: flex; align-items: center; justify-content: center;
}
.nv-slot-face-empty { background-color: var(--nv-surface); }
.nv-slot-face-locked { color: var(--nv-text-faint); background: var(--nv-surface); }
.nv-slot-face-plus { color: var(--nv-text-muted); background: var(--nv-bg); border-style: dashed; }
.nv-slot-name { font-size: 13px; font-weight: 600; color: var(--nv-text); max-width: 100px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; }
.nv-slot-locked .nv-slot-name,
.nv-slot-empty .nv-slot-name { color: var(--nv-text-faint); font-weight: 500; }

/* Section label "대화" */
.nv-chats-section { padding-top: 16px; }
.nv-section-label {
  display: flex; align-items: center; gap: 8px;
  font-size: 14px; font-weight: 700; color: var(--nv-text);
  margin: 0 4px 10px;
}
.nv-section-bar { width: 4px; height: 14px; background: var(--nv-accent); border-radius: 2px; }

/* Chat rows (KakaoTalk-style) */
.nv-chats { display: flex; flex-direction: column; }
.nv-chat-row {
  display: grid;
  grid-template-columns: 56px 1fr 28px;
  gap: 12px;
  align-items: flex-start;
  padding: 12px 8px;
  border-radius: 12px;
  cursor: pointer;
  transition: background 0.1s ease;
}
.nv-chat-row:hover { background: var(--nv-surface-alt); }
.nv-chat-thumb {
  width: 52px; height: 52px;
  border-radius: 16px;
  background: var(--nv-surface) center/cover no-repeat;
  border: 1px solid var(--nv-border);
  flex-shrink: 0;
}
.nv-chat-body { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.nv-chat-top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.nv-chat-name { font-size: 15px; font-weight: 700; color: var(--nv-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nv-chat-time { font-size: 11px; color: var(--nv-text-faint); flex-shrink: 0; font-variant-numeric: tabular-nums; }
.nv-chat-bubble {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 8px 12px;
  background: var(--nv-surface);
  border-radius: 14px;
  border-top-left-radius: 4px;
  font-size: 13px;
  color: var(--nv-text);
  line-height: 1.5;
  word-break: break-word;
  align-self: flex-start;
  max-width: 100%;
}
.nv-chat-bubble-empty { color: var(--nv-text-faint); }

.nv-chat-del {
  width: 28px; height: 28px;
  border: none; background: transparent;
  color: var(--nv-text-faint); font-size: 18px; line-height: 1;
  cursor: pointer; border-radius: 6px;
  opacity: 0; transition: opacity 0.15s ease;
}
.nv-chat-row:hover .nv-chat-del { opacity: 1; }
.nv-chat-del:active { background: #fee2e2; color: var(--nv-accent); opacity: 1; }

.nv-empty { text-align: center; color: var(--nv-text-faint); padding: 40px 0; font-size: 13px; line-height: 1.7; }

/* Dialog */
.nv-dialog-overlay { position: absolute; inset: 0; background: rgba(15,23,42,0.5); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 24px; }
.nv-dialog { background: var(--nv-bg); border-radius: 16px; padding: 22px 20px 18px; max-width: 340px; width: 100%; box-shadow: 0 20px 50px rgba(0,0,0,0.3); }
.nv-dialog-title { font-size: 16px; font-weight: 700; margin-bottom: 10px; color: var(--nv-text); }
.nv-dialog-body { font-size: 13px; color: var(--nv-text-muted); line-height: 1.6; white-space: pre-line; margin-bottom: 18px; }
.nv-dialog-actions { display: flex; gap: 8px; justify-content: flex-end; }
.nv-btn { padding: 10px 18px; border-radius: 8px; border: none; font-size: 14px; font-weight: 600; cursor: pointer; }
.nv-btn-primary { background: var(--nv-primary); color: #fff; }
.nv-btn-secondary { background: var(--nv-border); color: var(--nv-text); }
.nv-btn-danger { background: var(--nv-accent); color: #fff; }

/* Touch-friendly: always show delete on coarse pointers */
@media (pointer: coarse) {
  .nv-chat-del { opacity: 0.6; }
}
`;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = css;
  document.head.appendChild(style);
}
