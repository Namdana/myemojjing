// 3초 카운트다운 → 캔버스를 초당 12장 캡처 → GIF 변환
//
// phase 흐름:  idle → countdown → recording → encoding → done
//                ↑______ cancel() / reset() ______________|
class Recorder {
  constructor() {
    this.phase = 'idle';
    this.duration = 1;       // 촬영 길이(초)
    this.count = 3;          // 카운트다운 숫자
    this.progress = 0;       // 촬영/변환 진행률 0~100
    this.result = null;      // 완성된 GIF의 object URL
    this.resultSize = 0;     // 완성된 GIF의 크기(바이트)

    // 촬영을 시작할 때마다 번호를 새로 매긴다. 취소하면 번호가 바뀌어서,
    // 돌고 있던 타이머/루프가 "내 번호가 아니네" 하고 스스로 멈춘다.
    this.runId = 0;

    this.onChange = () => {};        // 상태가 바뀔 때마다
    this.onError = message => {};    // 변환 실패
  }

  get busy() {
    return this.phase === 'countdown' || this.phase === 'recording' || this.phase === 'encoding';
  }

  // 값을 바꾸고 화면에 알린다.
  update(values) {
    Object.assign(this, values);
    this.onChange();
  }

  // canvas: 찍을 <canvas> 요소
  start(canvas) {
    if (this.phase !== 'idle') return;
    const id = ++this.runId;
    this.update({ phase: 'countdown', count: 3, progress: 0 });

    const timer = setInterval(() => {
      if (id !== this.runId) {          // 취소됨
        clearInterval(timer);
      } else if (this.count > 1) {      // 3 → 2 → 1
        this.update({ count: this.count - 1 });
      } else {                          // 1 다음: 촬영 시작
        clearInterval(timer);
        this.record(id, canvas);
      }
    }, 1000);
  }

  record(id, canvas) {
    const ctx = canvas.getContext('2d');
    const frames = [];
    const totalMs = this.duration * 1000;
    const frameGapMs = 1000 / 12;
    const startedAt = performance.now();
    let nextFrameAt = 0;
    this.update({ phase: 'recording' });

    const tick = now => {
      if (id !== this.runId) return;    // 취소됨
      const elapsed = now - startedAt;

      if (elapsed < totalMs && elapsed >= nextFrameAt) {
        frames.push(ctx.getImageData(0, 0, canvas.width, canvas.height).data.buffer);
        nextFrameAt = elapsed + frameGapMs;
      }
      this.update({ progress: Math.min(100, elapsed / totalMs * 100) });

      if (elapsed < totalMs) requestAnimationFrame(tick);
      else this.encode(id, frames, canvas.width, totalMs);
    };
    requestAnimationFrame(tick);
  }

  async encode(id, frames, size, durationMs) {
    this.update({ phase: 'encoding', progress: 0 });
    try {
      const onProgress = progress => this.update({ progress });
      const isCancelled = () => id !== this.runId;
      const bytes = await encodeGif(frames, size, durationMs, onProgress, isCancelled);
      if (!bytes) return;   // 취소됨

      const blob = new Blob([bytes], { type: 'image/gif' });
      this.update({ phase: 'done', result: URL.createObjectURL(blob), resultSize: blob.size });
    } catch (error) {
      console.error('GIF 변환 실패:', error);
      this.phase = 'idle';
      this.onError('GIF를 만들지 못했어요. 다시 촬영해 주세요.');
    }
  }

  // 촬영/변환 중단
  cancel() {
    if (!this.busy) return;
    this.runId++;
    this.update({ phase: 'idle', progress: 0 });
  }

  // 완성된 GIF를 버리고 다시 촬영 준비
  reset() {
    if (this.result) URL.revokeObjectURL(this.result);
    this.update({ phase: 'idle', result: null, progress: 0 });
  }
}
