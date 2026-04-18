// Floating Panel Utility — drag + fold + localStorage persistence.
// Position stored as right/top (relative to right edge so resize keeps alignment).

export function makeFloating({ panelId, headerId, foldBtnId, storageKey, initialRight, initialTop }) {
  const panel = document.getElementById(panelId);
  const header = document.getElementById(headerId);
  const foldBtn = foldBtnId ? document.getElementById(foldBtnId) : null;
  if (!panel || !header) return null;

  const load = () => {
    try { return JSON.parse(localStorage.getItem(storageKey) || '{}'); }
    catch { return {}; }
  };
  const save = (s) => {
    try { localStorage.setItem(storageKey, JSON.stringify(s)); } catch {}
  };

  const state = load();

  // Apply saved or initial position
  if (typeof state.right === 'number') panel.style.right = state.right + 'px';
  else if (typeof initialRight === 'number') panel.style.right = initialRight + 'px';
  if (typeof state.top === 'number') panel.style.top = state.top + 'px';
  else if (typeof initialTop === 'number') panel.style.top = initialTop + 'px';
  if (state.folded) panel.classList.add('folded');

  function toggleFold() {
    const folded = panel.classList.toggle('folded');
    save({ ...load(), folded });
    if (foldBtn) foldBtn.textContent = folded ? '▢' : '➖';
  }
  if (foldBtn) {
    foldBtn.onclick = (e) => { e.stopPropagation(); toggleFold(); };
    foldBtn.textContent = state.folded ? '▢' : '➖';
  }
  header.addEventListener('dblclick', toggleFold);

  let dragging = false;
  let startMouseX = 0, startMouseY = 0;
  let startRight = 0, startTop = 0;

  header.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, input, select')) return;
    dragging = true;
    header.classList.add('dragging');
    try { header.setPointerCapture(e.pointerId); } catch {}
    startMouseX = e.clientX;
    startMouseY = e.clientY;
    const rect = panel.getBoundingClientRect();
    startRight = window.innerWidth - rect.right;
    startTop = rect.top;
    e.preventDefault();
  });

  header.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startMouseX;
    const dy = e.clientY - startMouseY;
    let newRight = startRight - dx;
    let newTop = startTop + dy;
    const w = panel.offsetWidth;
    newRight = Math.max(-w + 40, Math.min(window.innerWidth - 40, newRight));
    newTop = Math.max(0, Math.min(window.innerHeight - 40, newTop));
    panel.style.right = newRight + 'px';
    panel.style.top = newTop + 'px';
  });

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    header.classList.remove('dragging');
    try { header.releasePointerCapture(e.pointerId); } catch {}
    const rect = panel.getBoundingClientRect();
    save({
      ...load(),
      right: Math.round(window.innerWidth - rect.right),
      top: Math.round(rect.top),
    });
  }
  header.addEventListener('pointerup', endDrag);
  header.addEventListener('pointercancel', endDrag);

  return { toggleFold };
}
