import { makeFloating } from './floating-panel.js';

export function initSidePanelDrag() {
  makeFloating({
    panelId: 'sidePanel',
    headerId: 'sidePanelHeader',
    foldBtnId: 'sidePanelFoldBtn',
    storageKey: 'nv.sidePanel',
  });
}
