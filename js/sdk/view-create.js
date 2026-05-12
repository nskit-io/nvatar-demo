// NVatar SDK Chat — Create Avatar dialog.
// Name (immutable) + persona (comma-separated) + MBTI dropdown + VRM model selection.

const MBTI_LIST = [
  'INTJ','INTP','ENTJ','ENTP',
  'INFJ','INFP','ENFJ','ENFP',
  'ISTJ','ISFJ','ESTJ','ESFJ',
  'ISTP','ISFP','ESTP','ESFP',
];

// 노출할 모델은 명시적인 uid 화이트리스트로 제어. 이름 매칭/유추 금지.
// 비어있으면 백엔드 인덱스 전체에서 thumbnail 가진 것 우선으로 첫 N개 노출.
// 시연 시 특정 3개로 고정하려면 여기에 uid 직접 박기:
//   const FEATURED_MODEL_UIDS = ['xxxxxxxx', 'yyyyyyyy', 'zzzzzzzz'];
const FEATURED_MODEL_UIDS = [];
const VISIBLE_MODEL_COUNT = 3;

const STYLE_ID = 'nv-sdk-create-style';

export async function openCreateDialog(sdk, root, onCreated) {
  ensureStyle();

  const overlay = document.createElement('div');
  overlay.className = 'nv-create-overlay';
  overlay.innerHTML = TEMPLATE;
  root.appendChild(overlay);

  // Populate MBTI dropdown
  const mbtiSel = overlay.querySelector('select[name=mbti]');
  MBTI_LIST.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m; opt.textContent = m;
    mbtiSel.appendChild(opt);
  });

  // Load VRM models
  const modelsGrid = overlay.querySelector('.nv-models');
  const models = await loadModels(sdk).catch(() => []);
  let selectedVrmUid = null;
  if (!models.length) {
    modelsGrid.innerHTML = `<div style="grid-column:1/-1;font-size:12px;color:#9ca3af;text-align:center;padding:12px;">사용 가능한 모델이 없습니다.</div>`;
  } else {
    models.forEach((m, idx) => {
      const cell = document.createElement('div');
      cell.className = 'nv-model';
      cell.dataset.uid = m.uid;
      const hasThumb = !!m.thumbnail;
      cell.innerHTML = `
        <div class="nv-model-thumb ${hasThumb ? '' : 'nv-model-thumb-empty'}" ${hasThumb ? `style="background-image:url('${m.thumbnail}')"` : ''}>
          ${hasThumb ? '' : '<span>No image</span>'}
        </div>
        <div class="nv-model-name">${escapeHtml(m.name || '')}</div>
      `;
      cell.addEventListener('click', () => {
        modelsGrid.querySelectorAll('.nv-model').forEach(c => c.classList.remove('selected'));
        cell.classList.add('selected');
        selectedVrmUid = m.uid;
      });
      modelsGrid.appendChild(cell);
    });
    // Auto-select first
    modelsGrid.firstElementChild.click();
  }

  const close = () => overlay.remove();
  overlay.querySelector('.nv-create-close').addEventListener('click', () => { close(); onCreated && onCreated(null); });
  overlay.querySelector('.nv-cancel-btn').addEventListener('click', () => { close(); onCreated && onCreated(null); });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) { close(); onCreated && onCreated(null); } });

  overlay.querySelector('.nv-submit-btn').addEventListener('click', async () => {
    const name = overlay.querySelector('input[name=name]').value.trim();
    const persona = overlay.querySelector('textarea[name=persona]').value.trim();
    const mbti = mbtiSel.value;

    if (!name) { flashError(overlay, '이름을 입력해주세요'); return; }
    if (!persona) { flashError(overlay, '페르소나를 입력해주세요'); return; }
    if (!mbti) { flashError(overlay, 'MBTI 를 선택해주세요'); return; }

    const submitBtn = overlay.querySelector('.nv-submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = '생성 중…';

    try {
      // Step 1: create avatar (tone derived from MBTI dimensions for now)
      const created = await sdk.api.createAvatar({
        name,
        persona,
        mbti,
        tone: deriveToneHint(mbti),
        speech_style: '',
        speech_level: 'polite',
        proactive_level: 3,
      });

      // Step 2: attach VRM model (PATCH)
      if (selectedVrmUid) {
        await sdk.api.patchAvatar(created.id, { vrm_uid: selectedVrmUid });
      }

      close();
      onCreated && onCreated(created);
    } catch (e) {
      submitBtn.disabled = false;
      submitBtn.textContent = '생성하기';
      flashError(overlay, '생성 실패: ' + (e.message || e));
    }
  });
}

async function loadModels(sdk) {
  const all = await sdk.api.listVrmModels();
  if (!all.length) return [];

  // 1) uid 화이트리스트가 있으면 그 순서대로 노출 (선언된 uid 만)
  if (FEATURED_MODEL_UIDS.length) {
    const byUid = new Map(all.map(m => [m.uid, m]));
    return FEATURED_MODEL_UIDS.map(uid => byUid.get(uid)).filter(Boolean);
  }

  // 2) 화이트리스트 없으면 백엔드 인덱스 순서 그대로. thumbnail 있는 것 우선.
  const withThumb = all.filter(m => m.thumbnail);
  const withoutThumb = all.filter(m => !m.thumbnail);
  return [...withThumb, ...withoutThumb].slice(0, VISIBLE_MODEL_COUNT);
}

// Lightweight MBTI → tone hint (백엔드 tone 필드 비어있으면 안 되므로 기본값 제공).
// 본격적인 tone 학습은 백엔드 Avatar OS 가 대화로 진화.
function deriveToneHint(mbti) {
  const E = mbti[0] === 'E';
  const F = mbti[2] === 'F';
  if (E && F) return '밝고 따뜻한';
  if (E && !F) return '활기차고 명확한';
  if (!E && F) return '차분하고 공감하는';
  return '담담하고 차분한';
}

function flashError(overlay, msg) {
  let bar = overlay.querySelector('.nv-error');
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'nv-error';
    overlay.querySelector('.nv-create-dialog').appendChild(bar);
  }
  bar.textContent = msg;
  bar.style.opacity = '1';
  setTimeout(() => { bar.style.opacity = '0'; }, 2500);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

const TEMPLATE = `
<div class="nv-create-dialog">
  <header class="nv-create-header">
    <h2>아바타 생성</h2>
    <button class="nv-create-close" aria-label="닫기">×</button>
  </header>
  <div class="nv-create-body">
    <div class="nv-field">
      <label><span class="nv-bar"></span>아바타 이름</label>
      <input type="text" name="name" placeholder="아바타 이름 입력" maxlength="20" />
      <p class="nv-hint">아바타의 이름은 변경할 수 없습니다.</p>
    </div>

    <div class="nv-field">
      <label><span class="nv-bar"></span>아바타 페르소나</label>
      <textarea name="persona" placeholder="밝은 성격, 덤벙댐, 긍정적, ..." rows="3"></textarea>
      <p class="nv-hint">아바타의 특징이 될만한 요소를 콤마(,) 구분하여 입력하세요.</p>
    </div>

    <div class="nv-field">
      <label><span class="nv-bar"></span>아바타 MBTI 설정</label>
      <select name="mbti">
        <option value="">MBTI 선택</option>
      </select>
      <p class="nv-hint">MBTI 의 세부 수치는 랜덤하게 결정됩니다.<br>아바타와 오래 이야기 하면 MBTI 및 성격이 변할 수도 있어요.</p>
    </div>

    <div class="nv-field">
      <label><span class="nv-bar"></span>아바타 모델 선택</label>
      <div class="nv-models"></div>
    </div>
  </div>
  <footer class="nv-create-footer">
    <button class="nv-cancel-btn">취소</button>
    <button class="nv-submit-btn">생성하기</button>
  </footer>
</div>`;

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const css = `
.nv-create-overlay { position: absolute; inset: 0; background: rgba(15,23,42,0.5); display: flex; align-items: stretch; justify-content: center; z-index: 200; padding: 0; }
.nv-create-dialog { background: #fff; width: 100%; max-width: 420px; display: flex; flex-direction: column; max-height: 100%; }
@media (min-width: 768px) {
  .nv-create-overlay { align-items: center; padding: 24px; }
  .nv-create-dialog { border-radius: 16px; max-height: calc(100% - 48px); box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
}
.nv-create-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid #e5e7eb; flex-shrink: 0; }
.nv-create-header h2 { font-size: 18px; font-weight: 700; }
.nv-create-close { width: 32px; height: 32px; background: transparent; border: none; font-size: 24px; color: #6b7280; cursor: pointer; line-height: 1; }
.nv-create-body { flex: 1; overflow-y: auto; padding: 20px 20px 12px; }
.nv-field { margin-bottom: 22px; }
.nv-field label { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; margin-bottom: 8px; }
.nv-field .nv-bar { width: 4px; height: 14px; background: #ef4444; border-radius: 2px; }
.nv-field input[type=text], .nv-field textarea, .nv-field select {
  width: 100%; padding: 12px 14px; border: 1px solid #d1d5db; border-radius: 10px; font-size: 14px;
  background: #fff; color: #111827; font-family: inherit; outline: none;
}
.nv-field input[type=text]:focus, .nv-field textarea:focus, .nv-field select:focus { border-color: #3b46c4; }
.nv-field textarea { resize: vertical; min-height: 60px; }
.nv-hint { font-size: 11px; color: #9ca3af; margin-top: 6px; line-height: 1.5; }

.nv-models { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.nv-model { display: flex; flex-direction: column; align-items: center; gap: 6px; cursor: pointer; padding: 8px 4px; border-radius: 10px; }
.nv-model-thumb { width: 64px; height: 64px; border-radius: 50%; border: 1px solid #d1d5db; background: #f3f4f6 center/cover no-repeat; display: flex; align-items: center; justify-content: center; }
.nv-model-thumb-empty span { font-size: 10px; color: #9ca3af; }
.nv-model.selected .nv-model-thumb { border: 2px solid #3b46c4; box-shadow: 0 0 0 3px rgba(59,70,196,0.15); }
.nv-model-name { font-size: 12px; color: #374151; text-align: center; }

.nv-create-footer { display: flex; gap: 8px; padding: 12px 20px 16px; border-top: 1px solid #e5e7eb; flex-shrink: 0; }
.nv-cancel-btn, .nv-submit-btn { flex: 1; padding: 14px; border-radius: 10px; border: none; font-size: 15px; font-weight: 700; cursor: pointer; }
.nv-cancel-btn { background: #9ca3af; color: #fff; }
.nv-submit-btn { background: #3b46c4; color: #fff; }
.nv-submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.nv-error { position: absolute; left: 20px; right: 20px; bottom: 76px; background: #fee2e2; color: #b91c1c; font-size: 13px; padding: 10px 14px; border-radius: 8px; transition: opacity 0.3s; pointer-events: none; }
`;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = css;
  document.head.appendChild(s);
}
