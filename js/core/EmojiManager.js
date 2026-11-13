// p5 캔버스 하나와 그 위에 올라가는 것들을 전부 들고 있는 관리자 (싱글톤).
//
// 부품(camera, effect, caption …)은 서로를 모른다.
//   - 그릴 곳(p5)은 draw()의 인자로 받는다.
//   - 부품 사이의 조율(카메라가 끊기면 녹화 취소 등)은 전부 이 클래스에서 한다.
//
// 쓰는 법:
//   const emoji = EmojiManager.getInstance();
//   emoji.caption.text = '안녕';   ← 값만 바꾸면 다음 프레임에 반영
//   emoji.capture();
//
// 캔버스에 새 요소를 추가하려면:
//   draw(p)가 있는 클래스를 만들고, 아래 constructor에 한 줄 + draw()에 한 줄.
class EmojiManager {
  static instance = null;

  static getInstance() {
    if (!EmojiManager.instance) EmojiManager.instance = new EmojiManager();
    return EmojiManager.instance;
  }

  constructor() {
    this.size = 480;
    this.p = null;        // p5 인스턴스. 최종 결과 캔버스이자 GIF로 찍히는 대상 (mount()에서 만든다)
    this.source = null;   // 효과를 입히기 전 원본(카메라 영상)이 그려지는 p5.Graphics

    // 캔버스에 올라가는 것들
    this.camera = new Camera();
    this.effect = new Effect();
    this.caption = new Caption();

    this.recorder = new Recorder();

    this.error = '';            // 화면에 보여줄 오류 문구
    this.onChange = () => {};   // 화면(UI)을 다시 그려야 할 때 호출. main.js에서 연결한다.

    this.recorder.onChange = () => this.onChange();
    this.recorder.onError = message => this.setError(message);
    this.camera.onEnded = () => {
      this.recorder.cancel();
      this.setError('카메라 연결이 끊겼어요. 다시 연결해 주세요.');
    };
  }

  // host 안에 p5 캔버스를 만든다. (인스턴스 모드: 전역 함수 대신 p.xxx 로 쓴다)
  mount(host) {
    new p5(p => {
      p.setup = () => {
        p.createCanvas(this.size, this.size);
        p.pixelDensity(1);   // 레티나에서도 정확히 480×480 픽셀로 (GIF 크기와 맞춤)
        p.frameRate(30);
        this.source = p.createGraphics(this.size, this.size);
        this.source.pixelDensity(1);
        this.p = p;
        this.onChange();
      };
      p.draw = () => this.draw(p);
    }, host);
  }

  // 매 프레임: 원본(source)을 그리고 → 효과를 입혀 캔버스에 옮기고 → 문구를 얹는다.
  draw(p) {
    this.source.background('#191b18');
    if (this.camera.on) this.camera.draw(this.source);

    this.effect.draw(p, this.source);
    this.caption.draw(p);
  }

  // ── 부품 사이 조율 ─────────────────────────────────────────

  async startCamera() {
    this.setError('');
    const connecting = this.camera.start();
    this.onChange();   // "연결 중…" 표시
    try {
      await connecting;
    } catch (error) {
      this.error = error.message;
    }
    this.onChange();
  }

  stopCamera() {
    this.recorder.cancel();
    this.camera.stop();
    this.onChange();
  }

  capture() {
    if (!this.camera.on) return;   // 찍을 대상이 없음
    this.error = '';
    this.recorder.start(this.p.canvas);
  }

  setError(message) {
    this.error = message;
    this.onChange();
  }
}
