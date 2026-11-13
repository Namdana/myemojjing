// 원본 영상에 효과를 입혀서 캔버스에 그린다.
//   original 그대로 / mono 흑백 / dots 하프톤 / ascii 문자 / pixel 모자이크
class Effect {
  constructor() {
    this.type = 'original';
    this.intensity = 32;      // 0~100. 클수록 입자가 커진다 (dots / ascii / pixel 에서만 사용)
    this.color = '#d9ff57';   // dots / ascii 의 색
  }

  get usesIntensity() {
    return this.type === 'dots' || this.type === 'ascii' || this.type === 'pixel';
  }

  // p: 결과를 그릴 p5, source: 원본이 그려진 p5.Graphics
  draw(p, source) {
    p.background('#10120e');

    if (this.type === 'original') {
      p.image(source, 0, 0);
    } else if (this.type === 'mono') {
      p.image(source, 0, 0);
      p.filter(p.GRAY);
    } else {
      this.drawGrid(p, source);
    }
  }

  // dots / ascii / pixel: 화면을 격자로 나누고, 칸마다 원본 픽셀 하나를 뽑아 점·문자·네모로 바꿔 그린다.
  drawGrid(p, source) {
    const cell = this.type === 'ascii'
      ? Math.round(9 + this.intensity * .12)    // 9~21px
      : Math.round(4 + this.intensity * .16);   // 4~20px
    const asciiChars = ' .:-=+*#%@';            // 어두움 → 밝음

    source.loadPixels();
    p.push();
    p.noStroke();
    p.fill(this.color);
    p.textFont('monospace');
    p.textSize(cell * 1.15);
    p.textAlign(p.CENTER, p.CENTER);

    for (let y = 0; y < source.height; y += cell) {
      for (let x = 0; x < source.width; x += cell) {
        const i = (y * source.width + x) * 4;
        const r = source.pixels[i];
        const g = source.pixels[i + 1];
        const b = source.pixels[i + 2];
        const brightness = (r * .299 + g * .587 + b * .114) / 255;   // 0(어두움) ~ 1(밝음)
        const centerX = x + cell / 2;
        const centerY = y + cell / 2;

        if (this.type === 'pixel') {
          p.fill(r, g, b);
          p.rect(x, y, cell, cell);
        } else if (this.type === 'dots') {
          p.circle(centerX, centerY, Math.max(1, brightness * cell * 1.06));   // 밝을수록 큰 점
        } else {
          p.text(asciiChars[Math.min(9, Math.floor(brightness * 10))], centerX, centerY);
        }
      }
    }
    p.pop();
  }
}
