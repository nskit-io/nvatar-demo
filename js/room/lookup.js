// NVatar Room — NVatarSDK & Lookup Results
import { t } from './i18n.js';

const _lookupStore = [];
let _lookupUnread = 0;
let _badgeBlink = null;

// SDK Core API
export const NVatarSDK = {
  onLookupResult: null,
  getLookupResults: () => [..._lookupStore],
  getUnreadCount: () => _lookupUnread,
  clearLookupResults: () => { _lookupStore.length = 0; _lookupUnread = 0; _updateBadge(); },
};

export function addLookupResult(data) {
  const result = typeof data === 'string'
    ? { query: '', text: data, items: [{ title: data.slice(0, 60), summary: data }], ts: new Date().toISOString(), read: false }
    : { ...data, ts: new Date().toISOString(), read: false };

  _lookupStore.push(result);
  _lookupUnread++;
  _updateBadge();
  _renderLookupItem(result, _lookupStore.length - 1);
  console.log(`[Lookup] #${_lookupStore.length}: ${result.query || result.text?.slice(0, 40)}`);
}

function _updateBadge() {
  const badge = document.getElementById('lookupBadge');
  if (_lookupStore.length === 0) {
    badge.style.display = 'none';
    if (_badgeBlink) { clearInterval(_badgeBlink); _badgeBlink = null; }
    return;
  }
  badge.style.display = '';
  badge.innerHTML = `${t('lookupResult')} <span id="lookupBadgeCount">${_lookupStore.length}</span>${t('lookupCount')}`;

  if (_lookupUnread > 0 && !_badgeBlink) {
    _badgeBlink = setInterval(() => {
      badge.style.opacity = badge.style.opacity === '0.4' ? '1' : '0.4';
    }, 600);
  } else if (_lookupUnread === 0 && _badgeBlink) {
    clearInterval(_badgeBlink);
    _badgeBlink = null;
    badge.style.opacity = '1';
  }
}

export function toggleLookupPanel(e) {
  if (e) e.stopPropagation();
  const panel = document.getElementById('lookupPanel');
  const show = panel.style.display !== 'flex';
  panel.style.display = show ? 'flex' : 'none';
  if (show) {
    panel.querySelectorAll('#lookupList > div > div:last-child').forEach(c => { c.style.display = 'none'; });
  }
}

function _renderLookupItem(result, idx) {
  const list = document.getElementById('lookupList');
  const item = document.createElement('div');
  item.id = 'lookup-' + idx;
  item.style.cssText = 'background:rgba(15,23,42,0.9);border:1px solid #334155;border-radius:8px;overflow:hidden;';
  if (!result.read) item.style.borderLeftColor = '#6366f1';
  item.style.borderLeftWidth = '3px';

  const header = document.createElement('div');
  header.style.cssText = 'padding:8px 10px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;';
  const queryText = result.query || (result.items?.[0]?.title) || t('lookupDefaultTitle');
  header.innerHTML = `
    <span style="font-size:12px;color:${result.read ? '#94a3b8' : '#e2e8f0'};font-weight:${result.read ? '400' : '600'};">${queryText.slice(0, 45)}</span>
    <span style="font-size:9px;color:#475569;">${result.ts?.slice(11, 16) || ''}</span>
  `;

  const content = document.createElement('div');
  content.style.cssText = 'padding:0 10px 10px;display:none;';

  if (result.items && result.items.length > 0) {
    result.items.forEach(it => {
      const row = document.createElement('div');
      row.style.cssText = 'margin-bottom:6px;padding:6px 8px;background:rgba(30,41,59,0.6);border-radius:6px;';
      row.innerHTML = `
        <div style="font-size:11px;color:#e2e8f0;font-weight:600;margin-bottom:2px;">${it.title}</div>
        ${it.summary ? `<div style="font-size:10px;color:#94a3b8;line-height:1.5;">${it.summary}</div>` : ''}
      `;
      content.appendChild(row);
    });
  } else {
    content.innerHTML = `<div style="font-size:11px;color:#94a3b8;line-height:1.5;white-space:pre-wrap;">${result.text || ''}</div>`;
  }

  header.addEventListener('click', (e) => {
    e.stopPropagation();
    const show = content.style.display === 'none';
    content.style.display = show ? 'block' : 'none';
    if (show && !result.read) {
      result.read = true;
      _lookupUnread = Math.max(0, _lookupUnread - 1);
      item.style.borderLeftColor = '#334155';
      header.querySelector('span').style.color = '#94a3b8';
      header.querySelector('span').style.fontWeight = '400';
      _updateBadge();
    }
  });

  item.appendChild(header);
  item.appendChild(content);
  list.insertBefore(item, list.firstChild);
}
