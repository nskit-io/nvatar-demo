// NVatar Room — Authoring UI
// Sidebar panel for mesh listing, multi-select, group creation, and DB save.
import * as THREE from 'three';
import S from './state.js';
import { listTopLevelNodes, addGroup, getConfig, getGroupDefs, removeGroup } from './room-config.js';
import { makeFloating } from './floating-panel.js';

let panelEl = null;
let selectedMeshNames = new Set();
let highlightedNode = null;
let roomUid = null; // set when resolve is wired; for now derived from id
const highlightColor = new THREE.Color(0xf59e0b);

export async function initAuthoring() {
  buildPanel();
  // Listen to 3D clicks in authoring select mode
  window.addEventListener('authoring:meshPicked', (e) => {
    toggleMeshSelection(e.detail.name);
  });
}

export function toggleAuthoringPanel() {
  if (!panelEl) buildPanel();
  const open = panelEl.style.display !== 'none';
  panelEl.style.display = open ? 'none' : 'flex';
  window._authoringSelectMode = !open;
  const btn = document.getElementById('btnAuthoring');
  if (btn) {
    btn.style.background = !open ? 'rgba(245,158,11,0.2)' : 'transparent';
    btn.style.color = !open ? '#f59e0b' : '#94a3b8';
  }
  if (!open) refreshPanel();
  else clearHighlight();
}

function buildPanel() {
  if (panelEl) return;
  panelEl = document.createElement('div');
  panelEl.id = 'authoringPanel';
  panelEl.className = 'floating-panel';
  panelEl.style.cssText = `
    position:absolute; top:80px; right:16px; width:340px; max-height:calc(100vh - 120px);
    display:none; flex-direction:column; z-index:35; pointer-events:auto;
    background:rgba(10,15,30,0.96); border:1px solid #334155; border-radius:12px;
    backdrop-filter:blur(12px); overflow:hidden; font-family:-apple-system,sans-serif;
  `;
  panelEl.innerHTML = `
    <div id="authoringHeader" class="panel-header" style="cursor:grab;user-select:none;display:flex;align-items:center;gap:6px;padding:8px 12px;border-bottom:1px solid #1e293b;">
      <span style="color:#475569;font-weight:700;letter-spacing:-1px;">⋮⋮</span>
      <span style="flex:1;font-size:12px;font-weight:700;color:#f59e0b;">✍ Authoring</span>
      <button id="authoringSaveBtn" style="padding:3px 8px;border:1px solid #10b981;border-radius:4px;background:rgba(16,185,129,0.2);color:#10b981;font-size:11px;cursor:pointer;">💾 Save</button>
      <button id="authoringFoldBtn" style="padding:3px 8px;border:1px solid #334155;border-radius:4px;background:transparent;color:#94a3b8;font-size:11px;cursor:pointer;">➖</button>
      <button id="authoringCloseBtn" style="padding:3px 8px;border:1px solid #334155;border-radius:4px;background:transparent;color:#94a3b8;font-size:11px;cursor:pointer;">✕</button>
    </div>
    <div class="panel-body" style="display:flex;flex-direction:column;flex:1;min-height:0;">
      <div id="authoringRoomInfo" style="padding:6px 14px;font-size:10px;color:#64748b;border-bottom:1px solid #1e293b;"></div>
      <div style="padding:8px 14px 4px;font-size:10px;color:#94a3b8;font-weight:600;">Groups <span id="authoringGroupCount"></span></div>
      <div id="authoringGroupList" style="max-height:160px;overflow-y:auto;padding:0 10px;"></div>
      <div style="padding:8px 14px 4px;font-size:10px;color:#94a3b8;font-weight:600;display:flex;justify-content:space-between;">
        <span>All Meshes <span id="authoringMeshCount"></span></span>
        <span style="color:#64748b;font-weight:400;">shift-click in 3D</span>
      </div>
      <div id="authoringMeshList" style="flex:1;overflow-y:auto;padding:0 10px;min-height:180px;"></div>
      <div id="authoringActions" style="padding:10px 14px;border-top:1px solid #1e293b;display:flex;gap:6px;align-items:center;">
        <span id="authoringSelCount" style="font-size:11px;color:#94a3b8;flex:1;">0 selected</span>
        <button id="authoringClearBtn" style="padding:4px 10px;border:1px solid #334155;border-radius:4px;background:transparent;color:#94a3b8;font-size:11px;cursor:pointer;">Clear</button>
        <button id="authoringCreateBtn" style="padding:4px 10px;border:1px solid #f59e0b;border-radius:4px;background:rgba(245,158,11,0.2);color:#f59e0b;font-size:11px;cursor:pointer;" disabled>+ Group</button>
      </div>
    </div>
  `;
  document.body.appendChild(panelEl);

  document.getElementById('authoringCloseBtn').onclick = (e) => { e.stopPropagation(); toggleAuthoringPanel(); };
  document.getElementById('authoringSaveBtn').onclick = (e) => { e.stopPropagation(); saveConfigToDB(); };
  document.getElementById('authoringClearBtn').onclick = () => { selectedMeshNames.clear(); refreshPanel(); };
  document.getElementById('authoringCreateBtn').onclick = openCreateGroupModal;

  // Make draggable + foldable
  makeFloating({
    panelId: 'authoringPanel',
    headerId: 'authoringHeader',
    foldBtnId: 'authoringFoldBtn',
    storageKey: 'nv.authoringPanel',
  });
}

function refreshPanel() {
  if (!panelEl) return;
  const cfg = getConfig();
  const info = document.getElementById('authoringRoomInfo');
  if (info) info.textContent = `Room: ${cfg ? cfg.name || cfg.id : '(unknown)'}`;

  // Groups
  const groups = getGroupDefs();
  const gc = document.getElementById('authoringGroupCount');
  if (gc) gc.textContent = `(${groups.length})`;
  const glist = document.getElementById('authoringGroupList');
  if (glist) {
    glist.innerHTML = '';
    groups.forEach(gd => {
      const icon = gd.category === 'fixed' ? '🔒' : (gd.category === 'decorative' ? '🎨' : '📦');
      const row = document.createElement('div');
      row.style.cssText = `display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:4px;font-size:11px;color:#cbd5e1;cursor:pointer;`;
      row.innerHTML = `
        <span>${icon}</span>
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${gd.label}</span>
        <span style="color:#64748b;font-size:10px;">${gd.members.length}p</span>
        <button data-gid="${gd.groupId}" class="authoring-del-btn" style="padding:2px 6px;border:1px solid #334155;border-radius:3px;background:transparent;color:#64748b;font-size:10px;cursor:pointer;">✕</button>
      `;
      row.onmouseenter = () => { row.style.background = 'rgba(99,102,241,0.15)'; };
      row.onmouseleave = () => { row.style.background = 'transparent'; };
      row.onclick = (ev) => {
        if (ev.target.classList.contains('authoring-del-btn')) return;
        highlightGroup(gd);
      };
      glist.appendChild(row);
    });
    glist.querySelectorAll('.authoring-del-btn').forEach(b => {
      b.onclick = (ev) => {
        ev.stopPropagation();
        const gid = b.getAttribute('data-gid');
        if (confirm(`Delete group "${gid}"? Members become unclassified.`)) {
          removeGroup(gid);
          refreshPanel();
        }
      };
    });
  }

  // Meshes
  const nodes = listTopLevelNodes();
  const mc = document.getElementById('authoringMeshCount');
  if (mc) mc.textContent = `(${nodes.length})`;
  const mlist = document.getElementById('authoringMeshList');
  if (mlist) {
    mlist.innerHTML = '';
    nodes.forEach(n => {
      const isSelected = selectedMeshNames.has(n.name);
      const row = document.createElement('div');
      const statusBadge = {
        group: `<span style="color:#6366f1;">[${n.groupId}]</span>`,
        structural: '<span style="color:#64748b;">[struct]</span>',
        light: '<span style="color:#fbbf24;">[light]</span>',
        unclassified: '<span style="color:#ef4444;">[none]</span>',
      }[n.status];
      row.style.cssText = `display:flex;align-items:center;gap:6px;padding:3px 6px;border-radius:4px;font-size:10.5px;cursor:pointer;${isSelected ? 'background:rgba(245,158,11,0.15);' : ''}`;
      row.innerHTML = `
        <input type="checkbox" ${isSelected ? 'checked' : ''} data-name="${n.name}" style="cursor:pointer;">
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#cbd5e1;">${n.name}</span>
        ${statusBadge}
      `;
      row.querySelector('input').onclick = (ev) => {
        ev.stopPropagation();
        toggleMeshSelection(n.name);
      };
      row.onclick = () => highlightNode(n.node, n.name);
      mlist.appendChild(row);
    });
  }

  const selCnt = document.getElementById('authoringSelCount');
  if (selCnt) selCnt.textContent = `${selectedMeshNames.size} selected`;
  const createBtn = document.getElementById('authoringCreateBtn');
  if (createBtn) createBtn.disabled = selectedMeshNames.size === 0;
}

function toggleMeshSelection(name) {
  if (selectedMeshNames.has(name)) selectedMeshNames.delete(name);
  else selectedMeshNames.add(name);
  refreshPanel();
}

function highlightNode(node, name) {
  clearHighlight();
  if (!node) return;
  highlightedNode = node;
  node.traverse(n => {
    if (n.isMesh && n.material) {
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      mats.forEach(mat => {
        if (!mat._authOrig) mat._authOrig = mat.emissive ? mat.emissive.clone() : new THREE.Color(0);
        if (mat.emissive) mat.emissive.copy(highlightColor).multiplyScalar(0.35);
      });
    }
  });
}

function highlightGroup(gd) {
  clearHighlight();
  gd.members.forEach(m => {
    m.traverse(n => {
      if (n.isMesh && n.material) {
        const mats = Array.isArray(n.material) ? n.material : [n.material];
        mats.forEach(mat => {
          if (!mat._authOrig) mat._authOrig = mat.emissive ? mat.emissive.clone() : new THREE.Color(0);
          if (mat.emissive) mat.emissive.copy(highlightColor).multiplyScalar(0.35);
        });
      }
    });
  });
  highlightedNode = gd.anchor;
}

function clearHighlight() {
  if (!S.roomModel) return;
  S.roomModel.traverse(n => {
    if (n.isMesh && n.material) {
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      mats.forEach(mat => {
        if (mat._authOrig && mat.emissive) mat.emissive.copy(mat._authOrig);
      });
    }
  });
  highlightedNode = null;
}

function openCreateGroupModal() {
  if (selectedMeshNames.size === 0) return;
  const members = [...selectedMeshNames];
  const anchor = members[0]; // first selected becomes anchor

  const dlg = document.createElement('div');
  dlg.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:100;
    display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);
  `;
  dlg.innerHTML = `
    <div style="background:#0f172a;border:1px solid #334155;border-radius:12px;padding:20px;width:360px;color:#e2e8f0;font-family:-apple-system,sans-serif;">
      <h3 style="margin:0 0 12px;font-size:14px;color:#f59e0b;">+ Create Group</h3>
      <div style="font-size:11px;color:#64748b;margin-bottom:10px;">${members.length} members. Anchor: <b style="color:#cbd5e1;">${anchor}</b></div>
      <label style="display:block;font-size:11px;color:#94a3b8;margin-bottom:4px;">Group ID (internal, lowercase)</label>
      <input id="newGroupId" style="width:100%;padding:6px 10px;border:1px solid #334155;border-radius:4px;background:#020617;color:#e2e8f0;font-size:12px;" value="${anchor.toLowerCase().replace(/[^a-z0-9]/g,'_')}">
      <label style="display:block;font-size:11px;color:#94a3b8;margin:10px 0 4px;">Display Label</label>
      <input id="newGroupLabel" style="width:100%;padding:6px 10px;border:1px solid #334155;border-radius:4px;background:#020617;color:#e2e8f0;font-size:12px;" value="${anchor}">
      <label style="display:block;font-size:11px;color:#94a3b8;margin:10px 0 4px;">Category</label>
      <select id="newGroupCategory" style="width:100%;padding:6px 10px;border:1px solid #334155;border-radius:4px;background:#020617;color:#e2e8f0;font-size:12px;">
        <option value="movable">📦 movable (floor furniture)</option>
        <option value="decorative">🎨 decorative (hanging / shelf items)</option>
        <option value="fixed">🔒 fixed (cannot be moved)</option>
      </select>
      <label style="display:flex;align-items:center;gap:6px;margin-top:10px;font-size:11px;color:#94a3b8;">
        <input type="checkbox" id="newGroupFloor" checked>
        floor-locked (keep on floor when moved)
      </label>
      <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end;">
        <button id="newGroupCancel" style="padding:6px 14px;border:1px solid #334155;border-radius:4px;background:transparent;color:#94a3b8;font-size:12px;cursor:pointer;">Cancel</button>
        <button id="newGroupOk" style="padding:6px 14px;border:1px solid #f59e0b;border-radius:4px;background:rgba(245,158,11,0.2);color:#f59e0b;font-size:12px;cursor:pointer;">Create</button>
      </div>
    </div>
  `;
  document.body.appendChild(dlg);
  document.getElementById('newGroupCancel').onclick = () => dlg.remove();
  document.getElementById('newGroupOk').onclick = () => {
    const gid = document.getElementById('newGroupId').value.trim();
    const label = document.getElementById('newGroupLabel').value.trim();
    const cat = document.getElementById('newGroupCategory').value;
    const floor = document.getElementById('newGroupFloor').checked && cat === 'movable';
    if (!gid) { alert('Group ID required'); return; }
    try {
      addGroup({
        groupId: gid,
        anchor,
        members: members.slice(1),
        category: cat,
        label,
        floorLocked: floor,
      });
      selectedMeshNames.clear();
      dlg.remove();
      refreshPanel();
    } catch (e) {
      alert(e.message);
    }
  };
}

async function saveConfigToDB() {
  const cfg = getConfig();
  if (!cfg) { alert('No config loaded'); return; }
  // Need the room uid — try URL param first, else look up by slug
  const urlUid = new URLSearchParams(location.search).get('roomUid');
  let uid = urlUid;
  if (!uid) {
    try {
      const resp = await fetch(`${S.RES_BASE}/api/v1/room/models`);
      const data = await resp.json();
      const match = (data.rooms || []).find(r => r.name === cfg.name || r.uid);
      if (match) uid = match.uid;
    } catch (e) {}
  }
  if (!uid) { alert('Cannot resolve room uid'); return; }

  const btn = document.getElementById('authoringSaveBtn');
  const orig = btn ? btn.textContent : '';
  if (btn) btn.textContent = '⏳ Saving...';
  try {
    const resp = await fetch(`${S.RES_BASE}/api/v1/room/config/${uid}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    });
    if (resp.ok) {
      if (btn) { btn.textContent = '✅ Saved'; setTimeout(() => { btn.textContent = orig; }, 1500); }
    } else {
      if (btn) btn.textContent = '❌ Failed';
      console.error('Save failed:', await resp.text());
    }
  } catch (e) {
    if (btn) btn.textContent = '❌ Error';
    console.error(e);
  }
}
