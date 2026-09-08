// NVatar Room — TTS (Server Proxy)
import S from './state.js';
import { t } from './i18n.js';

export const TTS_CONFIG = { volume: 0.67, enabled: true, voiceId: null, voiceName: '' };
const ttsQueue = [];
let ttsPlaying = false;
let ttsCurrentAudio = null;

export function stopTTS() {
  ttsQueue.length = 0;
  ttsPlaying = false;
  if (ttsCurrentAudio) {
    ttsCurrentAudio.pause();
    if (ttsCurrentAudio.src) URL.revokeObjectURL(ttsCurrentAudio.src);
    ttsCurrentAudio = null;
  }
}

export function toggleTTS(btn) {
  TTS_CONFIG.enabled = !TTS_CONFIG.enabled;
  btn.textContent = TTS_CONFIG.enabled ? t('ttsOn') : t('ttsOff');
  btn.style.background = TTS_CONFIG.enabled ? 'rgba(99,102,241,0.3)' : 'transparent';
  console.log('[TTS] enabled:', TTS_CONFIG.enabled);
}

export function changeVoice(voiceId) {
  TTS_CONFIG.voiceId = voiceId || null;
  const sel = document.getElementById('voiceSelect');
  const name = sel?.options[sel.selectedIndex]?.text || '기본';
  TTS_CONFIG.voiceName = name;
  // Persist selection
  try { localStorage.setItem('nvatar_voice_id', voiceId || ''); } catch {}
  // Persist per-avatar to DB (uses resolved numeric id, not uid)
  const avatarId = S.currentAvatarId || S.paramAvatarId;
  if (avatarId) {
    fetch(`${S.API_BASE}/api/v1/avatars/${avatarId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voice_id: voiceId || '' }),
    }).catch(() => {});
  }
  console.log('[TTS] voice changed:', voiceId, name);
}

export async function loadVoices() {
  try {
    // ⚠️ lang 을 안 넘기면 서버가 한국어 목록만 준다 —
    //    영어 아바타가 한국어 음성으로 읽던 원인.
    const _lang = new URLSearchParams(location.search).get('lang') || 'ko';
    const res = await fetch(`${S.API_BASE}/api/v1/tts/voices?lang=${encodeURIComponent(_lang)}`);
    const data = await res.json();
    if (data.code !== 200 || !data.voices) return;
    const sel = document.getElementById('voiceSelect');
    if (!sel) return;
    data.voices.forEach(v => {
      if (!v.voice_id) return;
      const opt = document.createElement('option');
      opt.value = v.voice_id;
      opt.textContent = v.display_name;
      sel.appendChild(opt);
    });
    // Restore: prefer avatar's voice_id from DB; fall back to localStorage
    let saved = null;
    const avatarId = S.paramAvatarId;
    if (avatarId) {
      try {
        const r = await fetch(`${S.API_BASE}/api/v1/avatars/${avatarId}`);
        const d = await r.json();
        if (d?.response?.voice_id) saved = d.response.voice_id;
      } catch {}
    }
    if (!saved) saved = localStorage.getItem('nvatar_voice_id');
    if (saved) {
      const match = [...sel.options].find(o => o.value === saved);
      if (match) {
        sel.value = saved;
        TTS_CONFIG.voiceId = saved;
        TTS_CONFIG.voiceName = match.text;
        console.log('[TTS] Restored voice:', saved);
      } else {
        localStorage.removeItem('nvatar_voice_id');
        console.log('[TTS] Saved voice not found, using default');
      }
    }
  } catch(e) {
    console.warn('[TTS] Failed to load voices:', e.message);
  }
}

// Fallback: if TTS fails with saved voice, retry with default
async function _ttsWithFallback(ttsUrl) {
  let res = await fetch(ttsUrl, { method: 'POST' });
  if (!res.ok && TTS_CONFIG.voiceId) {
    // Retry without voice_id
    const fallbackUrl = ttsUrl.replace(/&voice_id=[^&]*/, '');
    console.warn('[TTS] Voice failed, retrying with default');
    res = await fetch(fallbackUrl, { method: 'POST' });
  }
  return res;
}

export function isTTSPlaying() {
  return ttsPlaying || ttsQueue.length > 0;
}

// text: string OR {text, voiceId} for per-avatar voice override
export async function speakTTS(text, voiceIdOverride) {
  if (!TTS_CONFIG.enabled || !text || text === '...') return;
  ttsQueue.push({ text, voiceId: voiceIdOverride || null });
  if (!ttsPlaying) processQueue();
}

async function processQueue() {
  if (ttsQueue.length === 0) { ttsPlaying = false; if (S.hooks.onTTSComplete) S.hooks.onTTSComplete(); return; }
  ttsPlaying = true;
  const { text, voiceId } = ttsQueue.shift();
  const useVoice = voiceId || TTS_CONFIG.voiceId;
  try {
    // voice_id 가 없을 때 서버가 아바타 언어의 기본 음성을 고르도록 lang 을 함께 보낸다.
    const _lang = new URLSearchParams(location.search).get('lang') || 'ko';
    let ttsUrl = `${S.API_BASE}/api/v1/tts?text=${encodeURIComponent(text)}` + `&lang=${encodeURIComponent(_lang)}`;
    if (useVoice) ttsUrl += `&voice_id=${encodeURIComponent(useVoice)}`;
    const res = await _ttsWithFallback(ttsUrl);
    if (!res.ok) { processQueue(); return; }
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const audio = new Audio(blobUrl);
    audio.volume = TTS_CONFIG.volume;
    audio.onended = () => { URL.revokeObjectURL(blobUrl); ttsCurrentAudio = null; processQueue(); };
    audio.onerror = () => { URL.revokeObjectURL(blobUrl); ttsCurrentAudio = null; processQueue(); };
    ttsCurrentAudio = audio;
    audio.play().catch(() => { ttsCurrentAudio = null; processQueue(); });
  } catch (e) {
    console.warn('[TTS] Error:', e.message);
    processQueue();
  }
}
