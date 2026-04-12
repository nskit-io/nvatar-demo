// NVatar Avatar Lab — Mesh Analysis & Part Toggle
import * as THREE from 'three';
import S from './state.js';

export function findMorphMeshes() {
  S.morphMeshes = [];
  if (!S.currentModel) return;
  S.currentModel.traverse((node) => {
    if (node.isMesh && node.morphTargetDictionary && Object.keys(node.morphTargetDictionary).length > 0) {
      S.morphMeshes.push(node);
    }
  });
  const allNames = new Set();
  S.morphMeshes.forEach(m => Object.keys(m.morphTargetDictionary).forEach(k => allNames.add(k)));
  document.getElementById('morphInfo').textContent = S.morphMeshes.length > 0
    ? `${S.morphMeshes.length}개 mesh, ${allNames.size}개 blendshape`
    : 'Blendshape 없음';
  if (allNames.size > 0) console.log('[Avatar] Blendshapes:', [...allNames].sort().join(', '));
}

function getMeshMapKey() {
  return 'nvatar_meshmap_' + (S.currentModel?._vrmUrl || 'default');
}

function saveMeshMap() {
  localStorage.setItem(getMeshMapKey(), JSON.stringify(S.meshMap));
}

function loadMeshMap() {
  try { S.meshMap = JSON.parse(localStorage.getItem(getMeshMapKey()) || '{}'); }
  catch(e) { S.meshMap = {}; }
}

export function buildMeshList() {
  if (!S.currentModel) return;
  const container = document.getElementById('meshList');
  container.innerHTML = '';
  S.allMeshes = [];
  S.currentModel.traverse(node => { if (node.isMesh) S.allMeshes.push(node); });

  if (S.allMeshes.length === 0) {
    container.innerHTML = '<p style="font-size:11px;color:#475569;">메시 없음</p>';
    return;
  }
  loadMeshMap();
  const groups = {};
  const ungrouped = [];
  S.allMeshes.forEach(mesh => {
    const name = mesh.name || '';
    const group = S.meshMap[name];
    if (group) { if (!groups[group]) groups[group] = []; groups[group].push(mesh); }
    else ungrouped.push(mesh);
  });
  for (const [groupName, groupMeshes] of Object.entries(groups)) renderGroup(container, groupName, groupMeshes);
  if (ungrouped.length > 0) renderGroup(container, '미분류', ungrouped, true);
  console.log(`[MeshMap] ${S.allMeshes.length} meshes, ${Object.keys(groups).length} groups, ${ungrouped.length} ungrouped`);
}

function renderGroup(container, groupName, meshes, isUngrouped = false) {
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:4px 6px;background:#1e293b;border-radius:4px;margin-top:4px;cursor:pointer;';
  header.innerHTML = `<span style="font-size:13px;font-weight:600;${isUngrouped ? 'color:#64748b;' : ''}">${groupName} <span style="color:#64748b;font-weight:400;">(${meshes.length})</span></span><span class="gtog" style="font-size:12px;">👁</span>`;
  let visible = true;
  header.querySelector('.gtog').onclick = (e) => {
    e.stopPropagation(); visible = !visible;
    meshes.forEach(m => m.visible = visible);
    e.target.textContent = visible ? '👁' : '🚫';
    header.style.opacity = visible ? '1' : '0.5';
  };
  container.appendChild(header);

  const detail = document.createElement('div');
  detail.style.cssText = 'padding-left:6px;';
  meshes.forEach(mesh => {
    const name = mesh.name || 'unnamed';
    const verts = mesh.geometry?.attributes?.position?.count || 0;
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:4px;padding:3px 0;font-size:11px;color:#94a3b8;';

    const hiBtn = document.createElement('span');
    hiBtn.textContent = '🔴'; hiBtn.style.cssText = 'cursor:pointer;font-size:11px;';
    let origMat = null;
    hiBtn.onclick = () => {
      if (origMat) { mesh.material = origMat; origMat = null; hiBtn.textContent = '🔴'; }
      else { origMat = mesh.material; mesh.material = new THREE.MeshBasicMaterial({ color: 0xff3333, transparent: true, opacity: 0.8 }); hiBtn.textContent = '⬜'; mesh.visible = true; }
    };

    const visBtn = document.createElement('span');
    visBtn.textContent = '👁'; visBtn.style.cssText = 'cursor:pointer;font-size:12px;';
    visBtn.onclick = () => { mesh.visible = !mesh.visible; visBtn.textContent = mesh.visible ? '👁' : '🚫'; };

    const label = document.createElement('span');
    label.textContent = `${name} (${verts}v)`; label.title = name;
    label.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:120px;font-size:11px;';

    const groupInput = document.createElement('input');
    groupInput.value = S.meshMap[name] || ''; groupInput.placeholder = 'grp';
    groupInput.style.cssText = 'width:60px;padding:3px 6px;border:1px solid #334155;border-radius:4px;background:#0f172a;color:#a5b4fc;font-size:11px;outline:none;';
    groupInput.onchange = () => {
      const val = groupInput.value.trim();
      if (val) S.meshMap[name] = val; else delete S.meshMap[name];
      saveMeshMap(); buildMeshList();
    };

    row.appendChild(hiBtn); row.appendChild(visBtn); row.appendChild(label); row.appendChild(groupInput);
    detail.appendChild(row);
  });
  container.appendChild(detail);
}

export function logMeshTree() {
  if (!S.currentModel) { alert('모델을 먼저 로드하세요'); return; }
  console.log('[Avatar] Full scene tree:');
  S.currentModel.traverse(node => {
    const depth = []; let p = node;
    while (p.parent && p.parent !== S.currentModel) { depth.push('  '); p = p.parent; }
    const info = [];
    if (node.isMesh) info.push(`MESH (${node.geometry?.attributes?.position?.count || 0} verts)`);
    if (node.isBone) info.push('BONE');
    if (node.isSkinnedMesh) info.push('SKINNED');
    console.log(`${depth.join('')}${node.name || '(unnamed)'} ${info.join(' ')}`);
  });
}

export function showAllMesh() {
  if (!S.currentModel) { alert('모델을 먼저 로드하세요'); return; }
  S.currentModel.traverse(node => { if (node.isMesh) node.visible = true; });
  buildMeshList();
}
