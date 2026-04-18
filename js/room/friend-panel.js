// NVatar Room — Friend Panel
// Floating panel listing the user's own avatars; click to add/remove as friend in room.
import S from './state.js';
import { makeFloating } from './floating-panel.js';
import { addFriend, removeFriend, findFriendByAvatarId, getFriends } from './friend-avatar.js';

let panelEl = null;
let avatarsCache = [];

function getUserUid() {
  return localStorage.getItem('nvatar_uid') || '';
}

function getCurrentAvatarUid() {
  const p = new URLSearchParams(location.search);
  return p.get('avatar') || '';
}

function getSavedVrm(avatarId) {
  // Lobby stores: localStorage['nvatar_<id>'] = {vrm_uid, vrm_name, vrm_thumbnail}
  try {
    const saved = JSON.parse(localStorage.getItem('nvatar_' + avatarId) || '{}');
    if (!saved.vrm_uid) return null;
    return {
      uid: saved.vrm_uid,
      name: saved.vrm_name || '',
      thumbnail: saved.vrm_thumbnail || '',
    };
  } catch { return null; }
}

async function fetchAvatars() {
  const uid = getUserUid();
  if (!uid) return [];
  try {
    const resp = await fetch(`${S.API_BASE}/api/v1/avatars?user_id=${uid}`);
    const data = await resp.json();
    return data.response || [];
  } catch (e) {
    console.error('[FriendPanel] Fetch avatars failed:', e);
    return [];
  }
}

export async function initFriendPanel() {
  buildPanel();
  avatarsCache = await fetchAvatars();
  renderList();
}

export function toggleFriendPanel() {
  if (!panelEl) buildPanel();
  const open = panelEl.style.display !== 'none';
  panelEl.style.display = open ? 'none' : 'flex';
  const btn = document.getElementById('btnFriendPanel');
  if (btn) {
    btn.style.background = !open ? 'rgba(245,158,11,0.25)' : 'rgba(245,158,11,0.15)';
    btn.style.color = !open ? '#f59e0b' : '';
  }
  if (!open) {
    // Refresh on open
    fetchAvatars().then(list => { avatarsCache = list; renderList(); });
  }
}

function buildPanel() {
  if (panelEl) return;
  panelEl = document.createElement('div');
  panelEl.id = 'friendPanel';
  panelEl.className = 'floating-panel';
  panelEl.style.cssText = `
    position:absolute; top:80px; right:260px; width:280px; max-height:calc(100vh - 120px);
    display:none; flex-direction:column; z-index:34; pointer-events:auto;
    background:rgba(10,15,30,0.96); border:1px solid #334155; border-radius:12px;
    backdrop-filter:blur(12px); overflow:hidden; font-family:-apple-system,sans-serif;
  `;
  panelEl.innerHTML = `
    <div id="friendPanelHeader" class="panel-header" style="cursor:grab;user-select:none;display:flex;align-items:center;gap:6px;padding:8px 12px;border-bottom:1px solid #1e293b;">
      <span style="color:#475569;font-weight:700;letter-spacing:-1px;">⋮⋮</span>
      <span style="flex:1;font-size:12px;font-weight:700;color:#f59e0b;">👥 친구</span>
      <button id="friendPanelRefreshBtn" title="Refresh" style="padding:3px 8px;border:1px solid #334155;border-radius:4px;background:transparent;color:#94a3b8;font-size:11px;cursor:pointer;">↻</button>
      <button id="friendPanelFoldBtn" style="padding:3px 8px;border:1px solid #334155;border-radius:4px;background:transparent;color:#94a3b8;font-size:11px;cursor:pointer;">➖</button>
      <button id="friendPanelCloseBtn" style="padding:3px 8px;border:1px solid #334155;border-radius:4px;background:transparent;color:#94a3b8;font-size:11px;cursor:pointer;">✕</button>
    </div>
    <div class="panel-body" id="friendPanelBody" style="flex:1;overflow-y:auto;padding:6px;display:flex;flex-direction:column;gap:4px;min-height:120px;">
      <div style="padding:20px;color:#64748b;text-align:center;font-size:11px;">Loading...</div>
    </div>
  `;
  document.body.appendChild(panelEl);

  document.getElementById('friendPanelCloseBtn').onclick = (e) => { e.stopPropagation(); toggleFriendPanel(); };
  document.getElementById('friendPanelRefreshBtn').onclick = async (e) => {
    e.stopPropagation();
    avatarsCache = await fetchAvatars();
    renderList();
  };

  makeFloating({
    panelId: 'friendPanel',
    headerId: 'friendPanelHeader',
    foldBtnId: 'friendPanelFoldBtn',
    storageKey: 'nv.friendPanel',
  });
}

function renderList() {
  const body = document.getElementById('friendPanelBody');
  if (!body) return;
  body.innerHTML = '';

  const uid = getUserUid();
  if (!uid) {
    body.innerHTML = '<div style="padding:20px;color:#ef4444;text-align:center;font-size:11px;">User ID 없음 (로비에서 진입 필요)</div>';
    return;
  }

  const currentUid = getCurrentAvatarUid();
  const others = avatarsCache.filter(a => a.uid !== currentUid);

  if (others.length === 0) {
    body.innerHTML = '<div style="padding:20px;color:#64748b;text-align:center;font-size:11px;">다른 아바타 없음<br><a href="index.html" style="color:#6366f1;">로비로 이동</a></div>';
    return;
  }

  others.forEach(a => {
    const inRoom = !!findFriendByAvatarId(a.id);
    // Prefer DB-stored vrm_uid, fall back to localStorage (for avatars created before the column existed)
    let vrm = a.vrm_uid ? { uid: a.vrm_uid, name: '', thumbnail: '' } : null;
    if (!vrm) vrm = getSavedVrm(a.id);
    else {
      // enrich with localStorage cached name/thumbnail if available
      const ls = getSavedVrm(a.id);
      if (ls && ls.uid === vrm.uid) { vrm.name = ls.name; vrm.thumbnail = ls.thumbnail; }
    }
    const thumbUrl = vrm?.thumbnail ? `${S.RES_BASE}${vrm.thumbnail}` : null;

    const row = document.createElement('div');
    row.style.cssText = `display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid ${inRoom ? '#f59e0b' : '#334155'};border-radius:8px;background:${inRoom ? 'rgba(245,158,11,0.08)' : 'transparent'};`;
    row.innerHTML = `
      <div style="width:36px;height:36px;border-radius:50%;background:#0f172a;border:1px solid #334155;overflow:hidden;flex-shrink:0;">
        ${thumbUrl ? `<img src="${thumbUrl}" style="width:100%;height:100%;object-fit:cover;" alt="">` : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#64748b;font-size:16px;">👤</div>'}
      </div>
      <div style="flex:1;overflow:hidden;">
        <div style="font-size:12px;color:#e2e8f0;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${a.name}</div>
        <div style="font-size:10px;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${vrm?.name || '(VRM 미지정)'}</div>
      </div>
      <button data-aid="${a.id}" class="friend-toggle-btn" style="padding:4px 10px;border:1px solid ${inRoom ? '#ef4444' : '#f59e0b'};border-radius:4px;background:${inRoom ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)'};color:${inRoom ? '#ef4444' : '#f59e0b'};font-size:11px;cursor:pointer;">${inRoom ? '나감' : '입장'}</button>
    `;
    body.appendChild(row);
  });

  body.querySelectorAll('.friend-toggle-btn').forEach(btn => {
    btn.onclick = async () => {
      const aid = parseInt(btn.getAttribute('data-aid'), 10);
      const avatar = avatarsCache.find(a => a.id === aid);
      if (!avatar) return;
      const existing = findFriendByAvatarId(aid);
      if (existing) {
        removeFriend(existing.index);
      } else {
        const vrm = getSavedVrm(aid);
        btn.textContent = '...';
        btn.disabled = true;
        await addFriend({
          avatarId: aid,
          vrmUid: (avatar.vrm_uid || vrm?.uid) || null,
          name: avatar.name,
          voiceId: avatar.voice_id || null,
        });
      }
      renderList();
    };
  });
}

// Refresh whenever friends list changes (called from friend-avatar on add/remove)
window.addEventListener('friends:changed', renderList);
