// NVatar Room — Voice Recording + Whisper STT
import { t } from './i18n.js';
import { addChatMsg, sendChat } from './chat.js';

const WHISPER_URL = 'https://whisper.nskit.io/api/v1/transcribe';
const MAX_RECORD_SEC = 20;
let micRecorder = null;
let micChunks = [];
let micTimerInterval = null;
let micSec = 0;
let micRecording = false;

export function toggleMic() {
  micRecording ? stopMic() : startMic();
}

async function startMic() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micChunks = [];
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
    micRecorder = new MediaRecorder(stream, { mimeType });

    micRecorder.ondataavailable = e => { if (e.data.size > 0) micChunks.push(e.data); };
    micRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      if (micChunks.length > 0) transcribeAudio();
    };

    micRecorder.start();
    micRecording = true;
    micSec = 0;
    document.getElementById('micBtn').style.background = 'rgba(239,68,68,0.2)';
    document.getElementById('micBtn').style.borderColor = '#ef4444';
    document.getElementById('micTimer').style.display = '';
    updateMicDisplay();
    micTimerInterval = setInterval(() => {
      micSec++;
      updateMicDisplay();
      if (micSec >= MAX_RECORD_SEC) stopMic();
    }, 1000);
  } catch (e) {
    console.error('[STT] Mic error:', e);
    addChatMsg('system', t('micPermission') + ': ' + e.message);
  }
}

function stopMic() {
  if (micRecorder && micRecorder.state === 'recording') micRecorder.stop();
  micRecording = false;
  clearInterval(micTimerInterval);
  document.getElementById('micBtn').style.background = 'rgba(15,23,42,0.9)';
  document.getElementById('micBtn').style.borderColor = '#334155';
  document.getElementById('micTimer').style.display = 'none';
}

function updateMicDisplay() {
  document.getElementById('micTimer').textContent = Math.floor(micSec / 60) + ':' + String(micSec % 60).padStart(2, '0');
}

async function transcribeAudio() {
  const ext = micRecorder.mimeType.includes('webm') ? 'webm' : 'm4a';
  const file = new File(micChunks, 'voice.' + ext, { type: micRecorder.mimeType });

  addChatMsg('system', t('micListening'));

  try {
    const formData = new FormData();
    formData.append('file', file);
    const resp = await fetch(WHISPER_URL, { method: 'POST', body: formData });
    const data = await resp.json();
    if (data.code === 200 && data.text?.trim()) {
      document.getElementById('chatInput').value = data.text.trim();
      sendChat();
    } else {
      addChatMsg('system', t('micNoResult'));
    }
  } catch (e) {
    addChatMsg('system', t('micServerFail'));
  }
}
