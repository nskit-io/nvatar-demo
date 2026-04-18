// NVatar Room — Mesh Swap (Hair/Clothing Exchange between VRM models)
// PoC: Load a donor VRM and transplant its Hair001 mesh onto the current avatar.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import S from './state.js';

let _donorCache = {};  // url → { vrm, scene }

/**
 * Swap the current avatar's hair with hair from a donor VRM.
 *
 * @param {string} donorUrl - URL of the donor VRM file
 * @param {string} meshName - Name of the mesh to swap (default: 'Hair001')
 */
export async function swapHairFromVRM(donorUrl, meshName = 'Hair001') {
  const avatar = S.avatars[0];
  if (!avatar || !avatar.scene) {
    console.warn('[MeshSwap] No avatar loaded');
    return false;
  }

  console.log(`[MeshSwap] Starting hair swap: donor=${donorUrl}, mesh=${meshName}`);

  try {
    // 1. Load donor VRM (cached)
    const donor = await _loadDonorVRM(donorUrl);
    if (!donor) {
      console.error('[MeshSwap] Failed to load donor VRM');
      return false;
    }

    // 2. Find hair mesh in donor
    const donorHair = _findMeshByName(donor.scene, meshName);
    if (!donorHair) {
      console.error(`[MeshSwap] Mesh '${meshName}' not found in donor`);
      return false;
    }
    console.log(`[MeshSwap] Donor hair found: ${donorHair.name}, ${donorHair.geometry?.attributes?.position?.count || 0} verts`);

    // 3. Find and hide current avatar's hair
    const currentHair = _findMeshGroup(avatar.scene, meshName);
    if (currentHair.length === 0) {
      console.warn(`[MeshSwap] No '${meshName}' mesh found in current avatar`);
    }
    currentHair.forEach(m => {
      m.visible = false;
      console.log(`[MeshSwap] Hidden: ${m.name}`);
    });

    // 4. Find avatar's skeleton
    const avatarSkeleton = _findSkeleton(avatar.scene);
    if (!avatarSkeleton) {
      console.error('[MeshSwap] No skeleton found in avatar');
      return false;
    }

    // 5. Clone donor hair meshes and bind to avatar skeleton
    const donorHairGroup = _findMeshGroup(donor.scene, meshName);
    let clonedCount = 0;

    for (const srcMesh of donorHairGroup) {
      const cloned = srcMesh.clone();
      cloned.name = `${srcMesh.name}_swapped`;
      cloned.frustumCulled = false;

      if (cloned.isSkinnedMesh && avatarSkeleton) {
        // Rebind to avatar's skeleton
        _rebindSkeleton(cloned, avatarSkeleton, donor.scene);
      }

      // Add to avatar's scene at root level
      avatar.scene.add(cloned);
      cloned.visible = true;
      clonedCount++;
      console.log(`[MeshSwap] Cloned: ${cloned.name}`);
    }

    // 6. Handle SpringBone (copy donor's spring bone settings)
    _transferSpringBones(donor.vrm, avatar.vrm, meshName);

    console.log(`[MeshSwap] ✅ Hair swap complete! ${clonedCount} meshes transplanted.`);
    return true;

  } catch (e) {
    console.error('[MeshSwap] Error:', e);
    return false;
  }
}

/**
 * Restore original hair (remove swapped meshes, show originals)
 */
export function restoreOriginalHair(meshName = 'Hair001') {
  const avatar = S.avatars[0];
  if (!avatar || !avatar.scene) return;

  // Remove swapped meshes
  const toRemove = [];
  avatar.scene.traverse(node => {
    if (node.isMesh && node.name.endsWith('_swapped')) {
      toRemove.push(node);
    }
  });
  toRemove.forEach(m => {
    avatar.scene.remove(m);
    if (m.geometry) m.geometry.dispose();
    console.log(`[MeshSwap] Removed: ${m.name}`);
  });

  // Show original meshes
  const originals = _findMeshGroup(avatar.scene, meshName);
  originals.forEach(m => {
    m.visible = true;
    console.log(`[MeshSwap] Restored: ${m.name}`);
  });

  console.log('[MeshSwap] Original hair restored');
}

// ── Internal helpers ──

async function _loadDonorVRM(url) {
  if (_donorCache[url]) return _donorCache[url];

  const vrmModule = await import('https://cdn.jsdelivr.net/npm/@pixiv/three-vrm@3.3.3/lib/three-vrm.module.min.js');
  const { VRMLoaderPlugin } = vrmModule;

  return new Promise((resolve) => {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    loader.load(url, (gltf) => {
      const vrm = gltf.userData.vrm;
      if (!vrm) { resolve(null); return; }
      // Don't add to scene — just keep in memory
      const result = { vrm, scene: gltf.scene };
      _donorCache[url] = result;
      console.log(`[MeshSwap] Donor VRM loaded: ${url}`);
      resolve(result);
    }, undefined, (err) => {
      console.error('[MeshSwap] Donor load error:', err);
      resolve(null);
    });
  });
}

function _findMeshByName(scene, name) {
  let found = null;
  scene.traverse(node => {
    if (node.isMesh && node.name && node.name.startsWith(name)) {
      found = node;
    }
  });
  return found;
}

function _findMeshGroup(scene, namePrefix) {
  const meshes = [];
  scene.traverse(node => {
    if (node.isMesh && node.name && node.name.startsWith(namePrefix) && !node.name.endsWith('_swapped')) {
      meshes.push(node);
    }
  });
  return meshes;
}

function _findSkeleton(scene) {
  let skeleton = null;
  scene.traverse(node => {
    if (node.isSkinnedMesh && node.skeleton) {
      skeleton = node.skeleton;
    }
  });
  return skeleton;
}

function _rebindSkeleton(clonedMesh, targetSkeleton, donorScene) {
  if (!clonedMesh.isSkinnedMesh) return;

  // Map donor bone names to target bones
  const donorSkeleton = clonedMesh.skeleton;
  const newBones = [];
  const missingBones = [];

  for (const donorBone of donorSkeleton.bones) {
    const name = donorBone.name;
    // Find matching bone in target skeleton by name
    const targetBone = targetSkeleton.bones.find(b => b.name === name);
    if (targetBone) {
      newBones.push(targetBone);
    } else {
      // Bone not found in target — create a dummy at same position
      missingBones.push(name);
      newBones.push(donorBone); // Keep original bone as fallback
    }
  }

  if (missingBones.length > 0) {
    console.warn(`[MeshSwap] ${missingBones.length} bones not found in target (hair-specific spring bones):`, missingBones.slice(0, 5).join(', '), missingBones.length > 5 ? '...' : '');
  }

  // Create new skeleton with mapped bones
  const newSkeleton = new THREE.Skeleton(newBones, donorSkeleton.boneInverses);
  clonedMesh.bind(newSkeleton);
  console.log(`[MeshSwap] Rebound skeleton: ${newBones.length} bones (${missingBones.length} missing)`);
}

function _transferSpringBones(donorVrm, targetVrm, meshName) {
  // SpringBone transfer is complex — for PoC, we skip it.
  // The hair will render correctly but won't have physics.
  // Full implementation would copy SpringBone joints and colliders.
  console.log('[MeshSwap] SpringBone transfer: skipped (PoC — hair physics disabled for swapped mesh)');
}
