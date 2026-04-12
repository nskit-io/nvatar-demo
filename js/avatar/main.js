// NVatar Avatar Lab — Entry Point & Bootstrap
import { toggleRotate, resetCamera } from './scene.js';
import { load, handleFile } from './loader.js';
import { setEmotion } from './emotion.js';
import { playMixamo } from './fbx.js';
import { logMeshTree, showAllMesh } from './mesh.js';
import { buildVrmListPanel, scanAllVrmBones } from './vrm-panel.js';

// Expose to window for HTML onclick handlers
window.load = (url, btn) => load(url, btn);
window.toggleRotate = toggleRotate;
window.resetCamera = resetCamera;
window.setEmotion = setEmotion;
window.playMixamo = playMixamo;
window.logMeshTree = logMeshTree;
window.showAllMesh = showAllMesh;
window.scanAllVrmBones = scanAllVrmBones;

window.switchTab = function(tab) {
  document.getElementById('tabMesh').classList.toggle('active', tab === 'mesh');
  document.getElementById('tabVrm').classList.toggle('active', tab === 'vrm');
  document.getElementById('tabMeshContent').style.display = tab === 'mesh' ? 'flex' : 'none';
  document.getElementById('tabVrmContent').style.display = tab === 'vrm' ? 'flex' : 'none';
};

// File upload
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => {
  e.preventDefault(); dropZone.classList.remove('dragover');
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => { if (fileInput.files.length) handleFile(fileInput.files[0]); });

// Init VRM list
buildVrmListPanel();
