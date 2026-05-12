// NVatar SDK Chat — Read-only stats dialog (emotions + MBTI spectrum).
//
// Triggered by portrait click. Charts animate from 0 to target on open.
//
// Data sources:
//   emotions  — avatar.emotions (9 dims): joy/sadness/anger/anxiety/
//               affection/excitement/boredom/trust/curiosity
//   MBTI      — avatar.mbti (4-letter string). Backend init pattern is
//               70 toward the chosen pole / 30 toward opposite. Mirrored
//               here client-side until a spectrum endpoint is exposed.

const STYLE_ID = 'nv-sdk-stats-style';

const EMOTION_LABELS = {
  joy:        '기쁨',
  affection:  '애정',
  trust:      '신뢰',
  excitement: '설렘',
  curiosity:  '호기심',
  anxiety:    '불안',
  sadness:    '슬픔',
  boredom:    '지루함',
  anger:      '화남',
};

// MBTI dichotomies — left pole / right pole / dim index in 4-letter string
const MBTI_AXES = [
  { idx: 0, left: 'E', right: 'I', leftLabel: '외향',     rightLabel: '내향'     },
  { idx: 1, left: 'S', right: 'N', leftLabel: '감각',     rightLabel: '직관'     },
  { idx: 2, left: 'T', right: 'F', leftLabel: '사고',     rightLabel: '감정'     },
  { idx: 3, left: 'J', right: 'P', leftLabel: '판단',     rightLabel: '인식'     },
];

const POLE_STRONG = 70;  // matches backend init_spectrum_from_mbti
const POLE_WEAK   = 30;

export function openStatsDialog(root, avatar) {
  ensureStyle();

  const overlay = document.createElement('div');
  overlay.className = 'nv-stats-overlay';
  overlay.innerHTML = renderTemplate(avatar);
  root.appendChild(overlay);

  const close = () => {
    overlay.classList.add('nv-stats-leaving');
    setTimeout(() => overlay.remove(), 180);
  };
  overlay.querySelector('.nv-stats-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', escClose);
  function escClose(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escClose); }
  }

  // Trigger entrance animation, then chart fills on next frame
  requestAnimationFrame(() => {
    overlay.classList.add('nv-stats-entered');
    requestAnimationFrame(() => {
      overlay.querySelectorAll('[data-fill]').forEach((el, i) => {
        el.style.transitionDelay = (i * 30) + 'ms';
        el.style.width = el.dataset.fill + '%';
      });
      overlay.querySelectorAll('[data-marker]').forEach((el, i) => {
        el.style.transitionDelay = (300 + i * 60) + 'ms';
        el.style.left = el.dataset.marker + '%';
      });
    });
  });
}

function renderTemplate(avatar) {
  const emotions = avatar.emotions || {};
  const mbti = (avatar.mbti || '').toUpperCase();

  const emotionRows = Object.entries(EMOTION_LABELS).map(([key, label]) => {
    const val = clamp(emotions[key]);
    return `
      <div class="nv-bar-row">
        <div class="nv-bar-label">${label}</div>
        <div class="nv-bar-track">
          <div class="nv-bar-fill" data-fill="${val}" style="width:0%"></div>
        </div>
        <div class="nv-bar-value">${val}</div>
      </div>`;
  }).join('');

  // Avatar OS condition (energy/mood/social_desire/hunger).
  // Backend AvatarResponse doesn't yet expose these — we render whatever
  // is present and hide the whole section if nothing arrives.
  const os = avatar.os_state || avatar;
  const conditionDefs = [
    { key: 'energy',         label: '에너지',   cls: 'nv-bar-fill-energy' },
    { key: 'mood',           label: '기분',     cls: 'nv-bar-fill-mood',   range: 'signed' },
    { key: 'social_desire',  label: '사교욕구', cls: 'nv-bar-fill-social' },
    { key: 'hunger',         label: '허기',     cls: 'nv-bar-fill-hunger' },
  ];
  const conditionRows = conditionDefs
    .filter(d => typeof os[d.key] === 'number')
    .map(d => {
      // mood 는 -100~+100 가능 → 0~100 정규화. 나머지는 그대로 0~100
      const raw = os[d.key];
      const val = d.range === 'signed' ? clamp((raw + 100) / 2) : clamp(raw);
      const display = d.range === 'signed' ? Math.round(raw) : val;
      return `
        <div class="nv-bar-row">
          <div class="nv-bar-label">${d.label}</div>
          <div class="nv-bar-track">
            <div class="nv-bar-fill ${d.cls}" data-fill="${val}" style="width:0%"></div>
          </div>
          <div class="nv-bar-value">${display}</div>
        </div>`;
    }).join('');
  const conditionSection = conditionRows ? `
    <section>
      <h3>현재 컨디션</h3>
      <div class="nv-bars">${conditionRows}</div>
    </section>` : '';

  const mbtiRows = mbti.length === 4 ? MBTI_AXES.map(ax => {
    const ch = mbti[ax.idx];
    // Left pole strong => marker near 30% (left side); right pole strong => marker near 70%
    const leftScore = (ch === ax.left) ? POLE_STRONG : POLE_WEAK;
    const markerPos = 100 - leftScore;  // 0 = far left, 100 = far right
    const leftStrong = ch === ax.left;
    return `
      <div class="nv-mbti-row">
        <div class="nv-mbti-pole nv-mbti-left ${leftStrong ? 'nv-mbti-on' : ''}">
          <span class="nv-mbti-char">${ax.left}</span>
          <span class="nv-mbti-sub">${ax.leftLabel}</span>
        </div>
        <div class="nv-mbti-track">
          <div class="nv-mbti-axis"></div>
          <div class="nv-mbti-marker" data-marker="${markerPos}" style="left:50%"></div>
        </div>
        <div class="nv-mbti-pole nv-mbti-right ${!leftStrong ? 'nv-mbti-on' : ''}">
          <span class="nv-mbti-char">${ax.right}</span>
          <span class="nv-mbti-sub">${ax.rightLabel}</span>
        </div>
      </div>`;
  }).join('') : `<p class="nv-mbti-empty">MBTI 데이터 없음</p>`;

  return `
<div class="nv-stats-dialog">
  <header class="nv-stats-header">
    <h2>${escapeHtml(avatar.name || '아바타')} <span>의 상태</span></h2>
    <button class="nv-stats-close" aria-label="닫기">×</button>
  </header>
  <div class="nv-stats-body">
    <section>
      <h3>현재 감정</h3>
      <div class="nv-bars">${emotionRows}</div>
    </section>
    ${conditionSection}
    <section>
      <h3>MBTI 성향</h3>
      <div class="nv-mbti-grid">${mbtiRows}</div>
      ${mbti.length === 4 ? `<p class="nv-mbti-caption">현재 라벨: <b>${mbti}</b></p>` : ''}
    </section>
    <p class="nv-stats-note">아바타와 대화가 쌓이면 감정과 성향이 조금씩 변해요.</p>
  </div>
</div>`;
}

function clamp(v) { return Math.max(0, Math.min(100, Math.round(Number(v) || 0))); }
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const css = `
.nv-stats-overlay {
  position: absolute; inset: 0; z-index: 300;
  background: rgba(15,23,42,0); display: flex; align-items: flex-end;
  justify-content: center; padding: 0;
  transition: background 0.2s ease;
}
.nv-stats-overlay.nv-stats-entered { background: rgba(15,23,42,0.55); }
.nv-stats-overlay.nv-stats-leaving { background: rgba(15,23,42,0); }

.nv-stats-dialog {
  background: #ffffff; width: 100%; max-width: 420px;
  border-top-left-radius: 20px; border-top-right-radius: 20px;
  max-height: 85%; display: flex; flex-direction: column;
  transform: translateY(100%); transition: transform 0.28s cubic-bezier(.2,.7,.2,1);
  box-shadow: 0 -20px 60px rgba(0,0,0,0.25);
}
.nv-stats-overlay.nv-stats-entered .nv-stats-dialog { transform: translateY(0); }
.nv-stats-overlay.nv-stats-leaving .nv-stats-dialog { transform: translateY(100%); }

@media (min-width: 768px) {
  .nv-stats-overlay { align-items: center; padding: 24px; }
  .nv-stats-dialog { border-radius: 18px; max-height: calc(100% - 48px); }
  .nv-stats-overlay .nv-stats-dialog { transform: translateY(20px) scale(0.96); opacity: 0; transition: transform 0.24s ease, opacity 0.2s ease; }
  .nv-stats-overlay.nv-stats-entered .nv-stats-dialog { transform: translateY(0) scale(1); opacity: 1; }
}

.nv-stats-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; border-bottom: 1px solid #e5e7eb; flex-shrink: 0;
}
.nv-stats-header h2 { font-size: 16px; font-weight: 700; }
.nv-stats-header h2 span { color: #6b7280; font-weight: 500; }
.nv-stats-close { width: 32px; height: 32px; background: transparent; border: none; font-size: 24px; color: #6b7280; cursor: pointer; line-height: 1; }

.nv-stats-body { padding: 18px 20px 24px; overflow-y: auto; flex: 1; }
.nv-stats-body section + section { margin-top: 22px; }
.nv-stats-body h3 { font-size: 13px; font-weight: 600; color: #6b7280; margin-bottom: 12px; letter-spacing: 0.3px; }

/* Emotion bars */
.nv-bars { display: flex; flex-direction: column; gap: 10px; }
.nv-bar-row { display: grid; grid-template-columns: 56px 1fr 32px; gap: 10px; align-items: center; }
.nv-bar-label { font-size: 13px; color: #374151; }
.nv-bar-track { height: 8px; background: #f3f4f6; border-radius: 6px; overflow: hidden; }
.nv-bar-fill {
  height: 100%; width: 0%;
  background: linear-gradient(90deg, #6366f1, #818cf8);
  border-radius: 6px;
  transition: width 0.75s cubic-bezier(.2,.7,.2,1);
}
.nv-bar-value { font-size: 12px; color: #6b7280; text-align: right; font-variant-numeric: tabular-nums; }

/* Warmer hue for negative-valence emotions */
.nv-bar-row:nth-of-type(n+6) .nv-bar-fill { background: linear-gradient(90deg, #f59e0b, #fbbf24); }
.nv-bar-row:nth-of-type(9) .nv-bar-fill { background: linear-gradient(90deg, #ef4444, #f87171); }

/* Condition (energy/mood/social/hunger) — distinct hues */
.nv-bar-fill-energy { background: linear-gradient(90deg, #10b981, #34d399) !important; }
.nv-bar-fill-mood   { background: linear-gradient(90deg, #ec4899, #f9a8d4) !important; }
.nv-bar-fill-social { background: linear-gradient(90deg, #06b6d4, #67e8f9) !important; }
.nv-bar-fill-hunger { background: linear-gradient(90deg, #f97316, #fdba74) !important; }

/* MBTI rows */
.nv-mbti-grid { display: flex; flex-direction: column; gap: 14px; }
.nv-mbti-row { display: grid; grid-template-columns: 56px 1fr 56px; gap: 10px; align-items: center; }
.nv-mbti-pole { display: flex; flex-direction: column; align-items: center; gap: 1px; color: #9ca3af; transition: color 0.3s ease; }
.nv-mbti-pole.nv-mbti-on { color: #3b46c4; }
.nv-mbti-char { font-size: 16px; font-weight: 800; line-height: 1.1; }
.nv-mbti-sub { font-size: 10px; color: inherit; opacity: 0.85; }
.nv-mbti-track { position: relative; height: 24px; }
.nv-mbti-axis {
  position: absolute; top: 50%; left: 0; right: 0; height: 4px; transform: translateY(-50%);
  background: linear-gradient(90deg, #c7d2fe 0%, #f3f4f6 50%, #fde68a 100%);
  border-radius: 4px;
}
.nv-mbti-marker {
  position: absolute; top: 50%; left: 50%;
  width: 16px; height: 16px; border-radius: 50%;
  background: #ffffff; border: 3px solid #3b46c4;
  transform: translate(-50%, -50%);
  box-shadow: 0 2px 6px rgba(0,0,0,0.18);
  transition: left 0.8s cubic-bezier(.2,.7,.2,1);
}
.nv-mbti-caption { margin-top: 12px; font-size: 13px; color: #6b7280; text-align: center; }
.nv-mbti-caption b { color: #3b46c4; letter-spacing: 1px; }
.nv-mbti-empty { font-size: 13px; color: #9ca3af; text-align: center; padding: 16px 0; }

.nv-stats-note { margin-top: 22px; font-size: 11px; color: #9ca3af; text-align: center; }
`;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = css;
  document.head.appendChild(s);
}
