// 웹캠 연결 + 영상을 정사각으로 꽉 채워 그리기
class Camera {
  constructor() {
    this.video = null;         // 카메라 영상이 재생되는 <video>. 꺼져 있으면 null
    this.stream = null;
    this.mirror = true;        // 좌우 반전 (거울처럼)
    this.busy = false;         // 연결 중
    this.onEnded = () => {};   // 카메라가 뽑히거나 권한이 회수됐을 때
  }

  get on() {
    return this.video !== null;
  }

  // 실패하면 사용자에게 보여줄 문구가 담긴 Error를 던진다.
  async start() {
    this.busy = true;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('이 주소에서는 카메라를 쓸 수 없어요. http://localhost 또는 HTTPS로 열어 주세요.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false,
      });
      this.stop();   // 이전에 켜 둔 게 있으면 정리

      // 화면에 붙어 있지 않은 video는 Safari에서 프레임이 안 나와서, 안 보이게 body에 붙여 둔다.
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
      document.body.appendChild(video);
      video.srcObject = stream;
      this.stream = stream;
      this.video = video;
      await video.play();

      stream.getVideoTracks()[0].addEventListener('ended', () => {
        this.stop();
        this.onEnded();
      });
    } catch (error) {
      console.error('카메라 연결 실패:', error);
      this.stop();
      throw new Error(this.describeError(error));
    } finally {
      this.busy = false;
    }
  }

  stop() {
    if (this.stream) this.stream.getTracks().forEach(track => track.stop());
    if (this.video) this.video.remove();
    this.stream = null;
    this.video = null;
  }

  // 브라우저가 준 에러 → 사용자에게 보여줄 문구
  describeError(error) {
    if (error.name === 'NotAllowedError') return '카메라 권한이 막혀 있어요. 주소창의 권한 설정에서 카메라를 허용해 주세요.';
    if (error.name === 'NotFoundError') return '연결된 카메라를 찾지 못했어요.';
    if (error.name === 'NotReadableError') return '카메라를 열지 못했어요. 다른 앱이 카메라를 쓰고 있는지 확인해 주세요.';
    if (error.name === 'Error') return error.message;   // 위에서 직접 던진 것
    return `카메라에 연결하지 못했어요. (${error.name}: ${error.message})`;
  }

  // g: 그릴 곳 (p5 또는 p5.Graphics)
  // p5의 image()는 일반 <video>를 못 받아서 캔버스 컨텍스트로 직접 그린다.
  draw(g) {
    const video = this.video;
    if (!video.videoWidth) return;   // 아직 첫 프레임이 안 옴

    // 짧은 변이 캔버스를 꽉 채우도록 키우고, 넘치는 쪽은 가운데 기준으로 잘라낸다.
    const size = g.width;
    const scale = Math.max(size / video.videoWidth, size / video.videoHeight);
    const width = video.videoWidth * scale;
    const height = video.videoHeight * scale;

    const ctx = g.drawingContext;
    ctx.save();
    if (this.mirror) {
      ctx.translate(size, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, (size - width) / 2, (size - height) / 2, width, height);
    ctx.restore();
  }
}
