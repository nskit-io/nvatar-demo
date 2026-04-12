// NVatar Room — i18n System
import S from './state.js';
import { TTS_CONFIG } from './tts.js';

const _urlLang = new URLSearchParams(window.location.search).get('lang') || 'ko';
let _uiLang = _urlLang;

export function getUiLang() { return _uiLang; }
export function setUiLang(lang) { _uiLang = lang; }

const I18N = {
  ko: {
    loading: 'NVatar 로딩 중...',
    preparingRoom: '방 준비 중...',
    loadingRoom: '방 로딩 중...',
    loadingAvatar: '아바타 로딩 중...',
    loadingAnim: '애니메이션 로딩 중...',
    waitingRoom: '방 대기 중...',
    ready: '준비 완료!',
    lobby: '← 로비',
    dblClickMove: '더블클릭: 이동',
    light: '💡 조명',
    camReset: '📷 리셋',
    langLabel: '언어',
    voiceLabel: '음성',
    ttsOn: '🔊 TTS ON',
    ttsOff: '🔇 TTS OFF',
    lookupResult: '🔍 검색 결과',
    lookupCount: '건',
    close: '닫기',
    placeholder: '메시지...',
    send: '전송',
    connected: '연결됨',
    disconnected: '연결 끊김 — 자동 재연결 중...',
    reconnecting: '서버 재연결 중...',
    noAvatar: '아바타를 먼저 연결하세요',
    noAvatarSend: '아바타를 먼저 선택하세요',
    langChanged: '언어가 변경되었습니다',
    langChangeFailed: '언어 변경 실패',
    lookupPrefix: '[검색 결과] ',
    lookupDefaultTitle: '검색 결과',
    micPermission: '마이크 권한이 필요합니다',
    micListening: '🎤 음성 인식 중...',
    micNoResult: '음성이 인식되지 않았어요',
    micServerFail: '음성 서버 연결 실패',
  },
  ja: {
    loading: 'NVatar ロード中...',
    preparingRoom: 'ルーム準備中...',
    loadingRoom: 'ルーム読み込み中...',
    loadingAvatar: 'アバター読み込み中...',
    loadingAnim: 'アニメーション読み込み中...',
    waitingRoom: 'ルーム待機中...',
    ready: '準備完了！',
    lobby: '← ロビー',
    dblClickMove: 'ダブルクリック: 移動',
    light: '💡 照明',
    camReset: '📷 リセット',
    langLabel: '言語',
    voiceLabel: '音声',
    ttsOn: '🔊 TTS ON',
    ttsOff: '🔇 TTS OFF',
    lookupResult: '🔍 検索結果',
    lookupCount: '件',
    close: '閉じる',
    placeholder: 'メッセージ...',
    send: '送信',
    connected: '接続済み',
    disconnected: '切断されました — 自動再接続中...',
    reconnecting: 'サーバーに再接続中...',
    noAvatar: 'アバターを先に接続してください',
    noAvatarSend: 'アバターを先に選択してください',
    langChanged: '言語が変更されました',
    langChangeFailed: '言語変更に失敗しました',
    lookupPrefix: '[検索結果] ',
    lookupDefaultTitle: '検索結果',
    micPermission: 'マイク権限が必要です',
    micListening: '🎤 音声認識中...',
    micNoResult: '音声が認識されませんでした',
    micServerFail: '音声サーバー接続失敗',
  },
  en: {
    loading: 'NVatar Loading...',
    preparingRoom: 'Preparing room...',
    loadingRoom: 'Loading room...',
    loadingAvatar: 'Loading avatar...',
    loadingAnim: 'Loading animations...',
    waitingRoom: 'Waiting for room...',
    ready: 'Ready!',
    lobby: '← Lobby',
    dblClickMove: 'Double-click: Move',
    light: '💡 Light',
    camReset: '📷 Reset',
    langLabel: 'Language',
    voiceLabel: 'Voice',
    ttsOn: '🔊 TTS ON',
    ttsOff: '🔇 TTS OFF',
    lookupResult: '🔍 Search Results',
    lookupCount: '',
    close: 'Close',
    placeholder: 'Message...',
    send: 'Send',
    connected: 'Connected',
    disconnected: 'Disconnected — auto-reconnecting...',
    reconnecting: 'Reconnecting to server...',
    noAvatar: 'Connect an avatar first',
    noAvatarSend: 'Select an avatar first',
    langChanged: 'Language changed',
    langChangeFailed: 'Language change failed',
    lookupPrefix: '[Search] ',
    lookupDefaultTitle: 'Search Results',
    micPermission: 'Microphone permission required',
    micListening: '🎤 Listening...',
    micNoResult: 'No speech detected',
    micServerFail: 'Voice server connection failed',
  },
  zh: {
    loading: 'NVatar 加载中...',
    preparingRoom: '准备房间...',
    loadingRoom: '加载房间...',
    loadingAvatar: '加载虚拟形象...',
    loadingAnim: '加载动画...',
    waitingRoom: '等待房间...',
    ready: '准备就绪！',
    lobby: '← 大厅',
    dblClickMove: '双击: 移动',
    light: '💡 灯光',
    camReset: '📷 重置',
    langLabel: '语言',
    voiceLabel: '语音',
    ttsOn: '🔊 TTS ON',
    ttsOff: '🔇 TTS OFF',
    lookupResult: '🔍 搜索结果',
    lookupCount: '条',
    close: '关闭',
    placeholder: '输入消息...',
    send: '发送',
    connected: '已连接',
    disconnected: '已断开 — 自动重连中...',
    reconnecting: '正在重新连接服务器...',
    noAvatar: '请先连接虚拟形象',
    noAvatarSend: '请先选择虚拟形象',
    langChanged: '语言已更改',
    langChangeFailed: '语言更改失败',
    lookupPrefix: '[搜索结果] ',
    lookupDefaultTitle: '搜索结果',
    micPermission: '需要麦克风权限',
    micListening: '🎤 语音识别中...',
    micNoResult: '未检测到语音',
    micServerFail: '语音服务器连接失败',
  },
};

export function t(key) { return (I18N[_uiLang] || I18N.ko)[key] || (I18N.ko)[key] || key; }

export function applyI18nUI() {
  const $ = (sel) => document.querySelector(sel);
  const setText = (sel, key) => { const el = $(sel); if (el) el.textContent = t(key); };
  const setAttr = (sel, attr, key) => { const el = $(sel); if (el) el.setAttribute(attr, t(key)); };

  const loadH2 = $('#loadingOverlay h2');
  if (loadH2) loadH2.innerHTML = `<span style="color:#6366f1;">NVatar</span> ${t('loading').replace('NVatar ', '')}`;

  setText('[data-i18n="lobby"]', 'lobby');
  const hintEl = $('[data-i18n="dblClickMove"]');
  if (hintEl) hintEl.textContent = t('dblClickMove');
  setText('[data-i18n="light"]', 'light');
  setText('[data-i18n="camReset"]', 'camReset');

  setText('[data-i18n="langLabel"]', 'langLabel');
  setText('[data-i18n="voiceLabel"]', 'voiceLabel');

  const ttsBtn = $('#btnTTS');
  if (ttsBtn) {
    ttsBtn.textContent = TTS_CONFIG.enabled ? t('ttsOn') : t('ttsOff');
  }

  const badge = $('#lookupBadge');
  if (badge) {
    const count = $('#lookupBadgeCount')?.textContent || '0';
    badge.innerHTML = `${t('lookupResult')} <span id="lookupBadgeCount">${count}</span>${t('lookupCount')}`;
  }
  setText('[data-i18n="lookupHeader"]', 'lookupResult');
  setText('[data-i18n="close"]', 'close');

  setAttr('#chatInput', 'placeholder', 'placeholder');
  setText('[data-i18n="send"]', 'send');
}

export async function changeLang(lang) {
  if (!S.currentAvatarId) return;
  try {
    const r = await fetch(`${S.API_BASE}/api/v1/avatars/${S.currentAvatarId}/language`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: lang }),
    });
    const d = await r.json();
    if (d.code === 200) {
      const url = new URL(window.location.href);
      url.searchParams.set('lang', lang);
      window.location.replace(url.toString());
    }
  } catch (e) {
    // Caller handles UI feedback
  }
}
