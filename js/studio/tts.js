// NVatar Studio — Minimal TTS client
// /api/v1/tts (ElevenLabs voice clone proxy on NVatar backend) → Audio element

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
