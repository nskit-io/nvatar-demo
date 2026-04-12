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
  console.log('[TTS] voice changed:', voiceId, name);
}

export async function loadVoices() {
  try {
    const res = await fetch(S.API_BASE + '/api/v1/tts/voices');
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
    // Restore last selection from localStorage
    const saved = localStorage.getItem('nvatar_voice_id');
    if (saved && sel.querySelector(`option[value="${CSS.escape(saved)}"]`)) {
      sel.value = saved;
      TTS_CONFIG.voiceId = saved;
      TTS_CONFIG.voiceName = sel.options[sel.selectedIndex]?.text || '';
      console.log('[TTS] Restored voice:', saved);
    }
  } catch(e) {
    console.warn('[TTS] Failed to load voices:', e.message);
  }
}

export async function speakTTS(text) {
  if (!TTS_CONFIG.enabled || !text || text === '...') return;
  ttsQueue.push(text);
  if (!ttsPlaying) processQueue();
}

async function processQueue() {
  if (ttsQueue.length === 0) { ttsPlaying = false; if (S.hooks.onTTSComplete) S.hooks.onTTSComplete(); return; }
  ttsPlaying = true;
  const text = ttsQueue.shift();
  try {
    let ttsUrl = `${S.API_BASE}/api/v1/tts?text=${encodeURIComponent(text)}`;
    if (TTS_CONFIG.voiceId) ttsUrl += `&voice_id=${encodeURIComponent(TTS_CONFIG.voiceId)}`;
    const res = await fetch(ttsUrl, { method: 'POST' });
    if (!res.ok) { processQueue(); return; }
    const blob = await res.blob();
    const audio = new Audio(URL.createObjectURL(blob));
    audio.volume = TTS_CONFIG.volume;
    audio.onended = () => { ttsCurrentAudio = null; processQueue(); };
    audio.onerror = () => { ttsCurrentAudio = null; processQueue(); };
    ttsCurrentAudio = audio;
    audio.play();
  } catch (e) {
    console.warn('[TTS] Error:', e.message);
    processQueue();
  }
}
