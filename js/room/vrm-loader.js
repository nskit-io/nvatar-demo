// NVatar Room — VRM Model Loading
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import S from './state.js';
import { t } from './i18n.js';
import { updateLoading, hideLoading, waitForRoom } from './scene.js';
import { loadMixamoAnimations } from './animation.js';
import { startRoaming } from './roaming.js';
import { startMonologue } from './roaming.js';
import { connectChat } from './chat.js';

export async function loadVRM(url, index = 0) {
  updateLoading(10, t('loadingAvatar'));
  try {
    const vrmModule = await import('https://cdn.jsdelivr.net/npm/@pixiv/three-vrm@3.3.3/lib/three-vrm.module.min.js');
    const { VRMLoaderPlugin } = vrmModule;

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    loader.load(url, (gltf) => {
      const vrm = gltf.userData.vrm;
      if (!vrm) return;

      if (S.avatars[index]) {
        S.scene.remove(S.avatars[index].scene);
        if (S.avatars[index].bubble) S.scene.remove(S.avatars[index].bubble);
      }

      const model = gltf.scene;
      model.rotation.y = Math.PI;
      model.position.set(0, 0, 0);
      model.castShadow = true;
      model.traverse(n => { if (n.isMesh) n.castShadow = true; });
      model.visible = false;
      S.scene.add(model);

      S.avatars[index] = { vrm, scene: model, blinkTimer: 0, nextBlink: 2 + Math.random() * 4, _activeBubbles: [], _feetOffset: 0 };
      console.log('[Room] Avatar loaded at index', index);

      if (index === 0) {
        updateLoading(40, t('loadingAnim'));
        loadMixamoAnimations(vrm).then(() => {
          updateLoading(70, t('waitingRoom'));
          waitForRoom(() => {
            console.log(`[Avatar] Ready at Y=0`);
            model.visible = true;
            updateLoading(100, t('ready'));
            setTimeout(hideLoading, 300);
            startRoaming();
            startMonologue();
            if (S.paramAvatarId) {
              connectChat(S.paramAvatarId);
            }
          });
        }).catch(() => {
          model.visible = true;
          hideLoading();
        });
      } else {
        model.visible = true;
      }
    });
  } catch(e) {
    console.error('[Room] VRM load error:', e);
  }
}

export function loadLocalVRM(event) {
  const file = event.target.files[0];
  if (file) loadVRM(URL.createObjectURL(file), 0);
}
