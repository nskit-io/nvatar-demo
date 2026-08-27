// NVatar Studio — Minimal TTS client
// /api/v1/tts (Voicebox 음성 클론 프록시 on NVatar backend) → ArrayBuffer / Audio element

const params = new URLSearchParams(location.search);
// nvatar backend 는 항상 nvatar.nskit.io (Mac Studio 프록시). 로컬 정적 서버에서도 동일.
// 로컬 NVatar 띄울 때만 ?api=http://localhost:54444 로 override.
export const API_BASE = params.get('api') || 'https://nvatar.nskit.io';

/**
 * Synthesize speech, return ArrayBuffer (for AudioContext.decodeAudioData).
 * 권장 — `<audio>` element 의 silent-playback quirk 회피.
 */
export async function synthArrayBuffer(text, opts = {}) {
  if (!text || !text.trim()) throw new Error('empty text');
  let url = `${API_BASE}/api/v1/tts?text=${encodeURIComponent(text)}`;
  if (opts.voiceId) url += `&voice_id=${encodeURIComponent(opts.voiceId)}`;
  if (opts.speed != null) url += `&speed=${opts.speed}`;
  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) {
    let msg = `TTS ${res.status}`;
    try { const j = await res.json(); if (j?.message) msg += ` — ${j.message}`; } catch {}
    throw new Error(msg);
  }
  return res.arrayBuffer();
}

/**
 * Synthesize speech via NVatar backend. (legacy: <audio> element path)
 * @param {string} text
 * @param {{voiceId?: string, speed?: number}} opts
 * @returns {Promise<HTMLAudioElement>}
 */
export async function synth(text, opts = {}) {
  if (!text || !text.trim()) throw new Error('empty text');

  let url = `${API_BASE}/api/v1/tts?text=${encodeURIComponent(text)}`;
  if (opts.voiceId) url += `&voice_id=${encodeURIComponent(opts.voiceId)}`;
  if (opts.speed != null) url += `&speed=${opts.speed}`;

  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) {
    let msg = `TTS ${res.status}`;
    try { const j = await res.json(); if (j?.message) msg += ` — ${j.message}`; } catch {}
    throw new Error(msg);
  }
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const audio = new Audio(blobUrl);
  audio.volume = 0.85;
  audio.crossOrigin = 'anonymous';  // for AudioContext routing
  // Caller is responsible for revoking blobUrl after ended/error.
  audio.addEventListener('ended', () => URL.revokeObjectURL(blobUrl), { once: true });
  audio.addEventListener('error', () => URL.revokeObjectURL(blobUrl), { once: true });
  return audio;
}


// ── 합성 캐시 + 선합성 ────────────────────────────────────────────────────────
// Voicebox 는 자기회귀 추론이라 **문장당 ~10초** 걸린다(ElevenLabs 는 1~2초였다).
// 재생 중에 합성하면 그 대기가 이전 슬라이드의 정지화면으로 **녹화에 그대로 박힌다.**
// → 시나리오 실행 전에 전 장면 나레이션을 미리 합성해 둔다.
const _ttsCache = new Map();
const _cacheKey = (text, voiceId) => `${voiceId || ''}\u0000${text}`;

/** 캐시 우선 합성. 반환은 항상 복사본 — decodeAudioData 가 버퍼를 detach 하기 때문. */
export async function synthArrayBufferCached(text, opts = {}) {
  const k = _cacheKey(text, opts.voiceId);
  if (!_ttsCache.has(k)) _ttsCache.set(k, await synthArrayBuffer(text, opts));
  return _ttsCache.get(k).slice(0);
}

/**
 * 나레이션 일괄 선합성. Voicebox 백엔드는 GPU 한 대라 병렬로 던져도 큐에 쌓일 뿐이고
 * 동시요청은 타임아웃 위험만 키운다 → **순차**로 돌리고 진행상황을 보고한다.
 * @param {string[]} texts
 * @param {{voiceId?: string}} opts
 * @param {(done:number, total:number, text:string, err?:Error)=>void} onProgress
 */
export async function prefetchNarrations(texts, opts = {}, onProgress) {
  const uniq = [...new Set(texts.filter(t => t && t.trim()))];
  let done = 0;
  for (const t of uniq) {
    let err;
    // 한 문장이 실패해도 나머지는 계속 — 재생 시점에 재시도된다.
    try { await synthArrayBufferCached(t, opts); } catch (e) { err = e; }
    onProgress?.(++done, uniq.length, t, err);
  }
  return uniq.length;
}

export function clearTtsCache() { _ttsCache.clear(); }
