// NVatar Studio — Recorder
// canvas.captureStream + audio MediaStream → MediaRecorder → webm Blob

export class Recorder {
  constructor() {
    this.recorder = null;
    this.chunks = [];
    this.lastBlob = null;
    this.startedAt = 0;
  }

  /**
   * Start recording.
   * @param {HTMLCanvasElement} canvas - source canvas (typically portrait)
   * @param {MediaStream} audioStream - audio MediaStream (from AudioContext destination)
   * @param {number} fps
   */
  async start(canvas, audioStream, fps = 30) {
    if (this.isRecording()) throw new Error('already recording');

    this.chunks = [];
    this.lastBlob = null;

    const videoStream = canvas.captureStream(fps);
    const tracks = [
      ...videoStream.getVideoTracks(),
      ...(audioStream ? audioStream.getAudioTracks() : []),
    ];
    const stream = new MediaStream(tracks);

    // Codec selection — VP9+Opus preferred, fallback to whatever browser supports
    const candidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    const mimeType = candidates.find(t => MediaRecorder.isTypeSupported(t)) || '';

    // 🔥 비트레이트를 지정하지 않으면 MediaRecorder 가 캔버스 캡처에 아주 낮은 값을 고른다.
    //    실측: 지정 없이 720p 를 녹화했더니 **217 kbps** 로 나와 슬라이드 글자가 뭉개졌다.
    //    이 콘텐츠는 정지 슬라이드+텍스트라 프레임레이트보다 비트레이트가 화질을 지배한다.
    const opts = mimeType ? { mimeType } : {};
    opts.videoBitsPerSecond = 6_000_000;   // 720p 텍스트에 넉넉
    opts.audioBitsPerSecond = 128_000;
    this.recorder = new MediaRecorder(stream, opts);
    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start(100); // collect chunks every 100ms (smoother)
    this.startedAt = performance.now();
  }

  stop() {
    return new Promise((resolve, reject) => {
      if (!this.recorder) { reject(new Error('not started')); return; }
      const r = this.recorder;
      r.onstop = () => {
        this.lastBlob = new Blob(this.chunks, { type: r.mimeType || 'video/webm' });
        resolve(this.lastBlob);
      };
      r.onerror = (e) => reject(e.error || new Error('recorder error'));
      r.stop();
    });
  }

  isRecording() {
    return !!this.recorder && this.recorder.state === 'recording';
  }

  durationMs() {
    return this.isRecording() ? performance.now() - this.startedAt : 0;
  }
}
