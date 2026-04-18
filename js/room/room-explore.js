// NVatar Room — Node Exploration Mode
// Click any mesh to inspect: name, hierarchy, group, category, bounding box.
import * as THREE from 'three';
import S from './state.js';
import { findGroupForMesh, isStructural, isLight, getTopLevelNode } from './room-config.js';

let exploreMode = false;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let highlightedMeshes = [];
const cyanHL = new THREE.Color(0x22d3ee);

export function toggleExploreMode() {
  exploreMode = !exploreMode;
  const btn = document.getElementById('btnExplore');
  if (btn) {
    btn.textContent = exploreMode ? '🔍 Exploring' : '🔍 Explore';
    btn.style.borderColor = exploreMode ? '#22d3ee' : '#334155';
    btn.style.color = exploreMode ? '#22d3ee' : '#94a3b8';
  }
  if (!exploreMode) {
    clearHighlight();
    hidePanel();
  }
}

export function isExploring() { return exploreMode; }

// Returns true if explore mode consumed this click
export function onExploreClick(e) {
  if (!exploreMode || !S.roomModel) return false;

  const rect = S.renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, S.camera);

  const meshes = [];
  S.roomModel.traverse(n => { if (n.isMesh) meshes.push(n); });
  const intersects = raycaster.intersectObjects(meshes, false);

  if (intersects.length === 0) {
    clearHighlight();
    hidePanel();
    return true;
  }

  const hit = intersects[0].object;

  // Hierarchy path (hit → scene)
  const path = [];
  let cur = hit;
  while (cur && cur !== S.scene) {
    path.push(cur.name || cur.type);
    cur = cur.parent;
  }

  // Top-level RootNode child
  const topLevel = getTopLevelNode(hit);
  const nodeName = topLevel ? topLevel.name : hit.name;
  const nodeType = isStructural(nodeName) ? 'structural'
    : isLight(nodeName) ? 'light' : 'furniture';

  // Group lookup (only for furniture)
  const group = nodeType === 'furniture' ? (findGroupForMesh(hit)?.group || null) : null;

  // Highlight
  clearHighlight();
  const targets = group ? group.members : (topLevel ? [topLevel] : [hit]);
  targets.forEach(m => {
    m.traverse(n => {
      if (n.isMesh && n.material) {
        const mats = Array.isArray(n.material) ? n.material : [n.material];
        mats.forEach(mat => {
          if (!mat._origEE) mat._origEE = mat.emissive ? mat.emissive.clone() : new THREE.Color(0);
          if (mat.emissive) mat.emissive.copy(cyanHL).multiplyScalar(0.3);
        });
        highlightedMeshes.push(n);
      }
    });
  });

  // Bounding box info
  const target = topLevel || hit;
  const box = new THREE.Box3().setFromObject(target);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  showPanel({
    nodeName,
    nodeType,
    path: path.reverse().join(' → '),
    group,
    size: `${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}`,
    center: `(${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)})`,
  });

  return true;
}

function clearHighlight() {
  highlightedMeshes.forEach(n => {
    const mats = Array.isArray(n.material) ? n.material : [n.material];
    mats.forEach(mat => {
      if (mat._origEE && mat.emissive) mat.emissive.copy(mat._origEE);
      delete mat._origEE;
    });
  });
  highlightedMeshes = [];
}

function showPanel(info) {
  let panel = document.getElementById('explorePanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'explorePanel';
    panel.style.cssText = `
      position:absolute; top:60px; left:16px; width:320px;
      background:rgba(10,15,30,0.95); border:1px solid #22d3ee; border-radius:10px;
      padding:12px; pointer-events:auto; z-index:30; backdrop-filter:blur(12px);
      font-size:12px; color:#e2e8f0; font-family:-apple-system,sans-serif;
    `;
    document.body.appendChild(panel);
  }

  const catColors = {
    movable: '#22c55e', fixed: '#ef4444', decorative: '#a78bfa',
    structural: '#64748b', light: '#fbbf24',
  };
  const cat = info.group ? info.group.category : info.nodeType;
  const catColor = catColors[cat] || '#94a3b8';

  const groupInfo = info.group
    ? `<div style="padding:6px 8px;background:#1e293b;border-radius:6px;margin-bottom:6px;">
         <div style="color:#94a3b8;font-size:10px;">Group: <span style="color:#e2e8f0;font-weight:600;">${info.group.label}</span> (${info.group.members.length} part${info.group.members.length > 1 ? 's' : ''})</div>
         <div style="color:#94a3b8;font-size:10px;">ID: <span style="color:#64748b;">${info.group.groupId}</span></div>
         ${info.group.floorLocked ? '<div style="color:#22c55e;font-size:10px;">🔒 Floor locked</div>' : ''}
       </div>`
    : (info.nodeType === 'furniture'
      ? '<div style="color:#fbbf24;font-size:10px;margin-bottom:6px;">⚠ Not in any group (ad-hoc created)</div>'
      : `<div style="color:${catColor};font-size:10px;margin-bottom:6px;">${info.nodeType === 'structural' ? '🧱 Structural — not selectable' : '💡 Light — not selectable'}</div>`);

  panel.innerHTML = `
    <div style="font-weight:700;font-size:14px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
      <span><span style="color:#22d3ee;">🔍</span> ${info.nodeName}</span>
      <span style="padding:2px 8px;border-radius:4px;background:${catColor}22;color:${catColor};font-size:10px;font-weight:600;">${cat}</span>
    </div>
    <div style="color:#64748b;font-size:10px;margin-bottom:6px;word-break:break-all;line-height:1.4;">${info.path}</div>
    ${groupInfo}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:10px;">
      <div><span style="color:#64748b;">Size:</span> ${info.size}</div>
      <div><span style="color:#64748b;">Center:</span> ${info.center}</div>
    </div>
  `;
  panel.style.display = 'block';
}

function hidePanel() {
  const panel = document.getElementById('explorePanel');
  if (panel) panel.style.display = 'none';
}
