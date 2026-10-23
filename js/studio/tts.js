// NVatar Studio — Minimal TTS client
// /api/v1/tts (TTS proxy on the NVatar backend) → ArrayBuffer / Audio element

const params = new URLSearchParams(location.search);
// 기본은 데모 백엔드(현재 중단). 다른 NVatar 서버를 쓸 때는 ?api=<서버 URL> 로 override.
export const API_BASE = params.get('api') || 'https://nvatar.nskit.io';

/**
 * NSKit 백엔드는 **오류도 HTTP 200 으로** 준다 — 판정은 body 의 `code` 다.
 *
 * 🔴 그래서 `res.ok` 만 보면 오류 JSON 이 오디오로 흘러가 `decodeAudioData` 에서 터진다.
 *    실측 2026-09-30: Azure 구독이 죽어 `{"code":401,"message":"Azure error: "}` 가
 *    HTTP 200 으로 왔고, 로그에는 8개 씬 전부 `Unable to decode audio data` 만 남았다.
 *    **무엇이 고장났는지 로그가 말해 주지 않아** 원인까지 가는 데 시간이 걸렸고,
 *    그날 녹화는 0.0 KB 로 나와 발행이 통째로 실패했다.
 * 🔑 성공 응답은 오디오다 — `Content-Type` 이 audio/* 가 아니면 그건 오류다.
 */
async function _ensureAudio(res) {
  if (!res.ok) {
    let msg = `TTS ${res.status}`;
    try { const j = await res.json(); if (j?.message) msg += ` — ${j.message}`; } catch {}
    throw new Error(msg);
  }
  const ct = res.headers.get('content-type') || '';
  if (!ct.startsWith('audio/')) {
    let msg = `TTS 실패 (content-type=${ct || '없음'})`;
    try {
      const j = await res.clone().json();
      if (j?.code || j?.message) msg = `TTS ${j.code ?? '?'} — ${j.message ?? ''}`.trim();
    } catch {}
    throw new Error(msg);
  }
  return res;
}

/**
 * Synthesize speech, return ArrayBuffer (for AudioContext.decodeAudioData).
 * 권장 — `<audio>` element 의 silent-playback quirk 회피.
 */
export async function synthArrayBuffer(text, opts = {}) {
  if (!text || !text.trim()) throw new Error('empty text');
  let url = `${API_BASE}/api/v1/tts?text=${encodeURIComponent(text)}`;
  if (opts.voiceId) url += `&voice_id=${encodeURIComponent(opts.voiceId)}`;
  if (opts.speed != null) url += `&speed=${opts.speed}`;
  const res = await _ensureAudio(await fetch(url, { method: 'POST' }));
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

  const res = await _ensureAudio(await fetch(url, { method: 'POST' }));
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
// TTS 엔진에 따라 **문장당 수 초 이상** 걸릴 수 있다.
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
