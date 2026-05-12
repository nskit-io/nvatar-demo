// NVatar SDK Chat — Search (lookup) history accordion.
//
// In-memory only — populated as bubble_lookup events arrive during the
// current chat session. Cleared on route leave.

const STYLE_ID = 'nv-sdk-search-history-style';

export function openSearchHistoryDialog(root, searches, opts = {}) {
  ensureStyle();

  const overlay = document.createElement('div');
  overlay.className = 'nv-sh-overlay';
  overlay.innerHTML = renderTemplate(searches);
  root.appendChild(overlay);

  const close = () => {
    overlay.classList.add('nv-sh-leaving');
    setTimeout(() => overlay.remove(), 180);
  };
  overlay.querySelector('.nv-sh-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', escClose);
  function escClose(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escClose); }
  }

  // Accordion toggles
  overlay.querySelectorAll('.nv-sh-item').forEach((item) => {
    const header = item.querySelector('.nv-sh-item-header');
    header.addEventListener('click', () => {
      item.classList.toggle('nv-sh-open');
    });
  });

  requestAnimationFrame(() => {
    overlay.classList.add('nv-sh-entered');
    // Optional: open + scroll to a specific entry (when launched from an
    // action bubble that references one particular lookup result).
    if (opts.expandIdx != null) {
      const target = overlay.querySelector(`.nv-sh-item[data-idx="${opts.expandIdx}"]`);
      if (target) {
        target.classList.add('nv-sh-open');
        // Wait one more frame for the entry transition to settle before scroll
        requestAnimationFrame(() => {
          target.scrollIntoView({ block: 'center', behavior: 'smooth' });
          target.classList.add('nv-sh-flash');
          setTimeout(() => target.classList.remove('nv-sh-flash'), 1200);
        });
      }
    }
  });
}

function renderTemplate(searches) {
  const list = searches.length
    ? searches.slice().reverse().map((s, idx) => renderItem(s, searches.length - 1 - idx)).join('')
    : `<div class="nv-sh-empty">이번 대화에서는 아직 검색이 없어요.</div>`;

  return `
<div class="nv-sh-dialog">
  <header class="nv-sh-header">
    <h2>검색 히스토리 <span>(${searches.length})</span></h2>
    <button class="nv-sh-close" aria-label="닫기">×</button>
  </header>
  <div class="nv-sh-body">
    ${list}
  </div>
  <p class="nv-sh-note">이 목록은 현재 대화창이 열려있는 동안만 유지됩니다.</p>
</div>`;
}

function renderItem(s, idx) {
  const query = escapeHtml(s.query || '(쿼리 없음)');
  const time = formatTime(s.ts);
  const text = escapeHtml(s.text || '');
  const items = Array.isArray(s.items) ? s.items : [];
  const itemList = items.length ? `
    <ul class="nv-sh-items">
      ${items.map(it => `<li>${renderResultItem(it)}</li>`).join('')}
    </ul>` : '';

  return `
    <div class="nv-sh-item" data-idx="${idx}">
      <button class="nv-sh-item-header" type="button">
        <span class="nv-sh-q">${query}</span>
        <span class="nv-sh-time">${time}</span>
        <span class="nv-sh-chev" aria-hidden="true">▾</span>
      </button>
      <div class="nv-sh-item-body">
        ${text ? `<p class="nv-sh-text">${text}</p>` : ''}
        ${itemList}
      </div>
    </div>`;
}

function renderResultItem(it) {
  // CSW returns {title, url, snippet, ...} typically — render defensively
  if (typeof it === 'string') return escapeHtml(it);
  if (it && typeof it === 'object') {
    const title = escapeHtml(it.title || it.name || it.snippet || JSON.stringify(it).slice(0, 80));
    const url = typeof it.url === 'string' ? it.url : null;
    return url
      ? `<a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${title}</a>`
      : title;
  }
  return '';
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d)) return '';
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s).replace(/`/g, '&#96;'); }

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const css = `
.nv-sh-overlay {
  position: absolute; inset: 0; z-index: 290;
  background: rgba(15,23,42,0); display: flex; align-items: flex-end;
  justify-content: center; transition: background 0.2s ease;
}
.nv-sh-overlay.nv-sh-entered { background: rgba(15,23,42,0.55); }
.nv-sh-overlay.nv-sh-leaving { background: rgba(15,23,42,0); }

.nv-sh-dialog {
  background: #ffffff; width: 100%; max-width: 420px;
  border-top-left-radius: 20px; border-top-right-radius: 20px;
  max-height: 80%; display: flex; flex-direction: column;
  transform: translateY(100%); transition: transform 0.28s cubic-bezier(.2,.7,.2,1);
  box-shadow: 0 -20px 60px rgba(0,0,0,0.25);
}
.nv-sh-overlay.nv-sh-entered .nv-sh-dialog { transform: translateY(0); }
.nv-sh-overlay.nv-sh-leaving .nv-sh-dialog { transform: translateY(100%); }

@media (min-width: 768px) {
  .nv-sh-overlay { align-items: center; padding: 24px; }
  .nv-sh-dialog { border-radius: 18px; max-height: calc(100% - 48px); }
}

.nv-sh-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid #e5e7eb; flex-shrink: 0; }
.nv-sh-header h2 { font-size: 16px; font-weight: 700; }
.nv-sh-header h2 span { color: #9ca3af; font-weight: 500; font-size: 14px; margin-left: 4px; }
.nv-sh-close { width: 32px; height: 32px; background: transparent; border: none; font-size: 24px; color: #6b7280; cursor: pointer; line-height: 1; }

.nv-sh-body { padding: 8px 12px 8px; overflow-y: auto; flex: 1; }
.nv-sh-empty { text-align: center; color: #9ca3af; padding: 32px 0; font-size: 13px; }

.nv-sh-item { border: 1px solid #e5e7eb; border-radius: 12px; margin: 8px 0; overflow: hidden; background: #fff; }
.nv-sh-item-header {
  width: 100%; padding: 12px 14px; display: grid;
  grid-template-columns: 1fr auto auto; gap: 8px; align-items: center;
  background: #f9fafb; border: none; cursor: pointer; text-align: left;
}
.nv-sh-item-header:hover { background: #f3f4f6; }
.nv-sh-q { font-size: 13px; font-weight: 600; color: #111827; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nv-sh-time { font-size: 11px; color: #9ca3af; font-variant-numeric: tabular-nums; }
.nv-sh-chev { color: #9ca3af; transition: transform 0.2s ease; }
.nv-sh-item.nv-sh-open .nv-sh-chev { transform: rotate(180deg); }

.nv-sh-item-body { max-height: 0; overflow: hidden; transition: max-height 0.3s ease; padding: 0 14px; }
.nv-sh-item.nv-sh-open .nv-sh-item-body { max-height: 600px; padding: 12px 14px 14px; }
.nv-sh-item.nv-sh-flash { animation: nvSearchFlash 1.2s ease; }
@keyframes nvSearchFlash {
  0%   { box-shadow: 0 0 0 0 rgba(99,102,241,0.5); }
  20%  { box-shadow: 0 0 0 6px rgba(99,102,241,0.25); }
  100% { box-shadow: 0 0 0 0 rgba(99,102,241,0); }
}
.nv-sh-text { font-size: 13px; color: #374151; line-height: 1.55; white-space: pre-wrap; margin-bottom: 8px; }
.nv-sh-items { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
.nv-sh-items li { font-size: 12px; color: #4b5563; padding: 6px 8px; background: #f9fafb; border-radius: 6px; line-height: 1.4; }
.nv-sh-items a { color: #3b46c4; text-decoration: none; }
.nv-sh-items a:hover { text-decoration: underline; }

.nv-sh-note { padding: 8px 20px 14px; font-size: 11px; color: #9ca3af; text-align: center; border-top: 1px solid #f3f4f6; }
`;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = css;
  document.head.appendChild(s);
}
