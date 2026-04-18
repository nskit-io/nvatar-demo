// NVatar Room — Config Loader & Group Builder
// Loads room-config.json, builds groupDefs from live Three.js scene nodes.
import * as THREE from 'three';
import S from './state.js';

let config = null;
let groupDefs = [];
let structuralSet = new Set();
let lightSet = new Set();
let roomFloorWorldY = 0; // World-space Y of the room's actual interior floor

export async function loadRoomConfig(roomId) {
  const url = `${S.RES_BASE}/res/room/${roomId}/room-config.json`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to load room config: ${resp.status}`);
  config = await resp.json();
  console.log('[RoomConfig] Loaded:', config.id, `(${Object.keys(config.groups).length} groups)`);
  return config;
}

export function buildGroupDefs() {
  if (!config || !S.roomModel) return [];

  // Find RootNode container
  let rootNode = null;
  S.roomModel.traverse(n => { if (n.name === 'RootNode') rootNode = n; });
  const container = rootNode || S.roomModel;

  // Build name→node map from container children
  const nameMap = {};
  container.children.forEach(child => { nameMap[child.name] = child; });
  console.log('[RoomConfig] RootNode children:', Object.keys(nameMap));

  // Sets for exclusion
  structuralSet = new Set(config.structural || []);
  lightSet = new Set(config.lights || []);

  // Build group definitions
  groupDefs = [];
  const claimed = new Set();

  for (const [groupId, gcfg] of Object.entries(config.groups)) {
    const anchor = nameMap[gcfg.anchor];
    if (!anchor) {
      console.warn(`[RoomConfig] Anchor not found: "${gcfg.anchor}" (group: ${groupId})`);
      continue;
    }

    const members = [anchor];
    claimed.add(gcfg.anchor);

    for (const mn of (gcfg.members || [])) {
      if (nameMap[mn]) {
        members.push(nameMap[mn]);
        claimed.add(mn);
      } else {
        console.warn(`[RoomConfig] Member not found: "${mn}" (group: ${groupId})`);
      }
    }

    groupDefs.push({
      groupId,
      anchorName: gcfg.anchor,
      anchor,
      members,
      category: gcfg.category || 'movable',
      label: gcfg.label || groupId,
      floorLocked: gcfg.floorLocked || false,
    });
  }

  // Report unclaimed nodes (potential config gaps)
  const unclaimed = Object.keys(nameMap).filter(n =>
    !claimed.has(n) && !structuralSet.has(n) && !lightSet.has(n)
  );
  if (unclaimed.length > 0) {
    console.warn('[RoomConfig] Unclaimed nodes (not in any category):', unclaimed);
  }

  // Detect room floor Y (world space)
  // Strategy: find the floor structural node (largest horizontal mesh near bottom)
  // or use the bounding box bottom of a known floor-locked group as reference.
  roomFloorWorldY = detectRoomFloorY(container, nameMap);

  console.log(`[RoomConfig] ${groupDefs.length} groups, ${claimed.size} claimed, ${structuralSet.size} structural, ${lightSet.size} lights, ${unclaimed.length} unclaimed`);
  console.log(`[RoomConfig] Room floor Y (world): ${roomFloorWorldY.toFixed(3)}`);
  return groupDefs;
}

function detectRoomFloorY(container, nameMap) {
  // Method 1: Use a known floor-locked group's bottom as floor reference
  // The sofa or chair sitting on the actual floor gives us the best reference.
  for (const gd of groupDefs) {
    if (gd.floorLocked && gd.anchor) {
      const box = new THREE.Box3().setFromObject(gd.anchor);
      if (box.min.y > -10) { // Sanity check
        return box.min.y;
      }
    }
  }

  // Method 2: Find the floor structural node (Cube019 = "Birch Wood Flooring")
  const floorNames = (config.structural || []);
  for (const fname of floorNames) {
    const node = nameMap[fname];
    if (!node) continue;
    const box = new THREE.Box3().setFromObject(node);
    const size = box.getSize(new THREE.Vector3());
    // Floor is wide/deep but thin
    if (size.x > 1 && size.z > 1 && size.y < 0.5) {
      return box.max.y; // Top surface of the floor
    }
  }

  // Fallback: use room model bottom + offset
  const roomBox = new THREE.Box3().setFromObject(S.roomModel);
  return roomBox.min.y + 0.1;
}

export function getGroupDefs() { return groupDefs; }
export function getConfig() { return config; }
export function getRoomFloorY() { return roomFloorWorldY; }
export function isStructural(name) { return structuralSet.has(name); }
export function isLight(name) { return lightSet.has(name); }

// Enumerate all top-level RootNode children with their classification.
// Returns [{name, status, groupId?, node}] — status: 'group' | 'structural' | 'light' | 'unclassified'
export function listTopLevelNodes() {
  if (!S.roomModel) return [];
  let rootNode = null;
  S.roomModel.traverse(n => { if (n.name === 'RootNode') rootNode = n; });
  const container = rootNode || S.roomModel;

  // Build reverse lookup: nodeName → groupId
  const nameToGroupId = {};
  if (config && config.groups) {
    for (const [gid, gcfg] of Object.entries(config.groups)) {
      nameToGroupId[gcfg.anchor] = gid;
      (gcfg.members || []).forEach(m => { nameToGroupId[m] = gid; });
    }
  }

  const result = [];
  container.children.forEach(child => {
    const name = child.name;
    let status = 'unclassified';
    let groupId = null;
    if (nameToGroupId[name]) { status = 'group'; groupId = nameToGroupId[name]; }
    else if (structuralSet.has(name)) status = 'structural';
    else if (lightSet.has(name)) status = 'light';
    result.push({ name, status, groupId, node: child });
  });
  result.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}

// Add a new group to the live config + rebuild groupDefs
export function addGroup({ groupId, anchor, members, category, label, floorLocked }) {
  if (!config.groups) config.groups = {};
  if (config.groups[groupId]) throw new Error(`Group already exists: ${groupId}`);
  // Remove members from other groups (move semantics)
  const allMembers = [anchor, ...(members || [])];
  for (const [gid, gcfg] of Object.entries(config.groups)) {
    gcfg.members = (gcfg.members || []).filter(m => !allMembers.includes(m));
    if (allMembers.includes(gcfg.anchor)) {
      // Anchor was stolen — fall back to first remaining member, else delete group
      if (gcfg.members.length > 0) gcfg.anchor = gcfg.members.shift();
      else delete config.groups[gid];
    }
  }
  config.groups[groupId] = {
    anchor,
    members: members || [],
    category: category || 'movable',
    label: label || groupId,
    ...(floorLocked ? { floorLocked: true } : {}),
  };
  buildGroupDefs();
}

export function removeGroup(groupId) {
  if (!config || !config.groups || !config.groups[groupId]) return;
  delete config.groups[groupId];
  buildGroupDefs();
}

export function updateGroup(groupId, patch) {
  if (!config || !config.groups || !config.groups[groupId]) return;
  Object.assign(config.groups[groupId], patch);
  buildGroupDefs();
}

// Find the group that contains a given mesh (walks up hierarchy).
// Returns {group, unclassifiedName} — group is null for unclassified, unclassifiedName
// carries the top-level node name so callers can show it to the user.
export function findGroupForMesh(mesh) {
  let current = mesh;
  while (current && current !== S.scene) {
    for (const gd of groupDefs) {
      if (gd.members.includes(current)) return { group: gd };
    }
    current = current.parent;
  }

  let rootNode = null;
  S.roomModel.traverse(n => { if (n.name === 'RootNode') rootNode = n; });
  const container = rootNode || S.roomModel;

  current = mesh;
  while (current && current.parent !== container) {
    current = current.parent;
  }
  if (current && current.parent === container) {
    if (structuralSet.has(current.name) || lightSet.has(current.name)) {
      return { group: null, unclassifiedName: current.name, reason: 'structural_or_light' };
    }
    return { group: null, unclassifiedName: current.name, reason: 'unclassified' };
  }

  return { group: null };
}

// Get the top-level RootNode child for any mesh
export function getTopLevelNode(mesh) {
  let rootNode = null;
  S.roomModel.traverse(n => { if (n.name === 'RootNode') rootNode = n; });
  const container = rootNode || S.roomModel;

  let current = mesh;
  while (current && current.parent !== container) {
    current = current.parent;
  }
  return (current && current.parent === container) ? current : null;
}
