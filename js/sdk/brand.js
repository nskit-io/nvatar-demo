// NVatar SDK Chat — Brand token system.
//
// Hosts override visual identity via `new NVatarChatSDK({ brand: {...} })`.
// Anything omitted falls back to the NVatar defaults below.
//
// Colors flow into CSS variables on the SDK container (--nv-primary, etc.),
// so view-*.js stylesheets reference them instead of literal hex values.

// Character spec — 호스트(프랜차이즈) 가 자기 캐릭터를 SDK 에 등록할 때 형식.
// 엔바타 기본 = res 서버의 VRM models (`listVrmModels`) 이 자동 머지됨.
// 프랜차이즈 추가 = brand.characters 배열로 던지면 생성 다이얼로그에 추가 노출.
//
// 식별자(id)는 8자 이내. backend nv_avatars.vrm_uid CHAR(8) 자리에 박힘.
// 충돌 회피 위해 프랜차이즈 prefix 권장 (예: ekys0001 ~ ekys0005).
//
// kind:
//   'vrm' — three.js + three-vrm 렌더 (얼굴 본 + 표정 동기화)
//   '2d'  — 정적 이미지 (얼굴 cropped). emotion 무관 (또는 자산 swap)
//
// portrait 는 "얼굴 영역만" 들어와야 함 (정사각 권장). thumb 미지정 시 portrait 재사용.
export function normalizeCharacter(c) {
  if (!c || !c.id) return null;
  return {
    id: String(c.id).slice(0, 8),
    kind: c.kind === 'vrm' ? 'vrm' : '2d',
    name: c.name || c.id,
    portrait: c.portrait || c.thumb || null,
    thumb: c.thumb || c.portrait || null,
    vrmUrl: c.vrmUrl || null,
    emotionVariants: c.emotionVariants || null,   // { happy: url, sad: url, ... } 옵션
    preset: c.preset ? {
      role:        c.preset.role || null,
      persona:     c.preset.persona || null,
      mbti:        c.preset.mbti || null,
      speechLevel: c.preset.speechLevel || 'polite',
      tone:        c.preset.tone || null,
    } : null,
  };
}

const DEFAULT_BRAND = {
  title: 'NVatar 채팅',
  logo: null,                  // string (URL) | string (raw SVG markup) | null
  characters: [],              // 프랜차이즈 추가 캐릭터. 엔바타 default VRM 은 별도 머지됨.
  // showDefaultCharacters:
  //   true        — 자동 머지 (생성 다이얼로그에 NVatar VRM 즉시 노출)
  //   false       — 미노출 + 추가 버튼도 X (프랜차이즈 only 강제)
  //   'on-demand' — 미노출 (기본) + "NVatar 캐릭터 추가로 불러오기" 버튼 노출
  showDefaultCharacters: true,
  colors: {
    primary:    '#3b46c4',     // CTA, user bubble accent, slot border
    accent:     '#ef4444',     // section bar, danger
    background: '#ffffff',
    surface:    '#f3f4f6',     // assistant bubble, slot bg
    surfaceAlt: '#f9fafb',     // hover row
    border:     '#e5e7eb',
    text:       '#111827',
    textMuted:  '#6b7280',
    textFaint:  '#9ca3af',
  },
  labels: {
    entity:     '아바타',       // "친구" 등으로 override 가능
    sectionChats: '대화',
    empty:      '아직 만들어진 아바타가 없어요.\n아래에서 첫 아바타를 만들어보세요.',
    slotsLockedTitle: '슬롯이 가득 찼어요',
    slotsLockedBody:  '추가 슬롯은 구매 후 진행 가능합니다.\n슬롯 구매는 서비스 준비중입니다.',
  },
  font: 'inherit',
};

/**
 * Deep-merge host brand over defaults. Only known top-level keys are honored
 * (extra keys ignored — keeps the schema honest).
 */
export function resolveBrand(input) {
  const b = input || {};
  const chars = Array.isArray(b.characters) ? b.characters.map(normalizeCharacter).filter(Boolean) : [];
  return {
    title:  b.title  || DEFAULT_BRAND.title,
    logo:   b.logo   || DEFAULT_BRAND.logo,
    characters: chars,
    showDefaultCharacters: b.showDefaultCharacters !== false,
    colors: { ...DEFAULT_BRAND.colors, ...(b.colors || {}) },
    labels: {
      ...DEFAULT_BRAND.labels,
      ...(b.labels || {}),
    },
    font: b.font || DEFAULT_BRAND.font,
  };
}

/** Look up a character spec by id (for portrait factory / room view). */
export function findCharacter(brand, id) {
  if (!id) return null;
  return brand.characters.find(c => c.id === id) || null;
}

/**
 * Inject brand colors as CSS variables on the SDK root container.
 * Stylesheets reference `var(--nv-primary)` etc.
 */
export function applyBrandVars(container, brand) {
  const c = brand.colors;
  container.style.setProperty('--nv-primary',     c.primary);
  container.style.setProperty('--nv-accent',      c.accent);
  container.style.setProperty('--nv-bg',          c.background);
  container.style.setProperty('--nv-surface',     c.surface);
  container.style.setProperty('--nv-surface-alt', c.surfaceAlt);
  container.style.setProperty('--nv-border',      c.border);
  container.style.setProperty('--nv-text',        c.text);
  container.style.setProperty('--nv-text-muted',  c.textMuted);
  container.style.setProperty('--nv-text-faint',  c.textFaint);
  if (brand.font && brand.font !== 'inherit') {
    container.style.setProperty('--nv-font', brand.font);
  }
}

/**
 * Render brand header (logo + title). Used by list view header.
 * Returns HTML string — caller is responsible for sanitizing dynamic input.
 */
export function renderBrandHeader(brand) {
  let logoHtml = '';
  if (brand.logo) {
    const isSvg = /^<svg[\s>]/i.test(brand.logo.trim());
    logoHtml = isSvg
      ? `<span class="nv-brand-logo">${brand.logo}</span>`
      : `<img class="nv-brand-logo" src="${escapeAttr(brand.logo)}" alt="">`;
  }
  return `${logoHtml}<h1 class="nv-brand-title">${escapeText(brand.title)}</h1>`;
}

function escapeText(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function escapeAttr(s) { return escapeText(s); }
