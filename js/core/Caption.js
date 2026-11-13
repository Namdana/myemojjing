// 테두리 두른 굵은 문구. 최대 두 줄, 위/아래 배치.
class Caption {
  constructor() {
    this.text = '완전 내 얘기';
    this.color = '#d9ff57';
    this.fontSize = 43;
    this.position = 'bottom';   // 'top' | 'bottom'
  }

  draw(p) {
    if (!this.text.trim()) return;

    const lines = this.text.split('\n').slice(0, 2);
    const lineHeight = this.fontSize + 6;
    const maxWidth = p.width - 50;
    // 첫 줄의 y. 아래 배치일 때는 마지막 줄이 바닥에서 50px 위에 오도록 거꾸로 계산한다.
    const firstLineY = this.position === 'top' ? 57 : p.height - 50 - (lines.length - 1) * lineHeight;

    p.push();
    p.textFont('Arial');   // 한글은 브라우저가 알아서 시스템 글꼴로 대체한다
    p.textStyle(p.BOLD);
    p.textAlign(p.CENTER, p.CENTER);
    p.stroke('#10120e');
    p.strokeWeight(8);
    p.strokeJoin(p.ROUND);
    p.fill(this.color);

    lines.forEach((line, i) => {
      // 줄이 캔버스보다 길면 그 줄만 글자를 줄여서 맞춘다.
      p.textSize(this.fontSize);
      const width = p.textWidth(line);
      if (width > maxWidth) p.textSize(this.fontSize * maxWidth / width);

      p.text(line, p.width / 2, firstLineY + i * lineHeight);
    });
    p.pop();
  }
}
