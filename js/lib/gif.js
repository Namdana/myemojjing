// 작은 GIF 인코더 (외부 라이브러리 없음). 앱 코드에서는 맨 아래 encodeGif()만 쓴다.
//
// 순서: 프레임마다 ① 색을 128개로 줄이고(quantize) ② 픽셀을 LZW로 압축해서(writeLzw) 이어 붙인다.

const GIF_COLORS = 128;
const GIF_COLOR_BITS = 7;   // 2^7 = 128

// 바이트를 계속 이어 붙일 수 있는 버퍼
class ByteWriter {
  constructor() {
    this.buffer = new Uint8Array(1 << 16);
    this.length = 0;
  }

  reserve(count) {
    if (this.length + count <= this.buffer.length) return;
    const bigger = new Uint8Array(Math.max(this.buffer.length * 2, this.length + count));
    bigger.set(this.buffer.subarray(0, this.length));
    this.buffer = bigger;
  }

  byte(value) {
    this.reserve(1);
    this.buffer[this.length++] = value;
  }

  // 16비트 숫자 (작은 자리부터)
  u16(value) {
    this.byte(value & 255);
    this.byte(value >> 8 & 255);
  }

  bytes(array, count = array.length) {
    this.reserve(count);
    this.buffer.set(array.subarray(0, count), this.length);
    this.length += count;
  }

  text(string) {
    for (let i = 0; i < string.length; i++) this.byte(string.charCodeAt(i));
  }

  toUint8Array() {
    return this.buffer.slice(0, this.length);
  }
}

// ① 색 줄이기 (median cut)
// RGBA 픽셀 → { palette: 128색 RGB, indices: 픽셀마다 팔레트 번호 }
// 색을 채널당 5비트(총 32768칸)로 뭉뚱그려 센 다음, 색 상자를 가장 넓은 축으로 반씩 쪼개 128개를 만든다.
function quantize(rgba) {
  const binOf = i => (rgba[i] >> 3) << 10 | (rgba[i + 1] >> 3) << 5 | rgba[i + 2] >> 3;

  // 어떤 색(칸)이 몇 픽셀인지 센다.
  const pixelCount = new Uint32Array(32768);
  for (let i = 0; i < rgba.length; i += 4) pixelCount[binOf(i)]++;

  // 실제로 쓰인 칸만 모은다.
  let usedCount = 0;
  for (let bin = 0; bin < 32768; bin++) if (pixelCount[bin]) usedCount++;
  const bins = new Uint16Array(usedCount);
  for (let bin = 0, k = 0; bin < 32768; bin++) if (pixelCount[bin]) bins[k++] = bin;

  const channels = [bin => bin >> 10, bin => bin >> 5 & 31, bin => bin & 31];   // 칸 → R, G, B (0~31)

  // 상자 = bins[from..to) 구간. 가장 넓게 퍼진 축(axis)과 쪼갤 우선순위(score)를 같이 구해 둔다.
  function makeBox(from, to) {
    const min = [31, 31, 31], max = [0, 0, 0];
    let pixels = 0;
    for (let i = from; i < to; i++) {
      pixels += pixelCount[bins[i]];
      for (let c = 0; c < 3; c++) {
        const value = channels[c](bins[i]);
        if (value < min[c]) min[c] = value;
        if (value > max[c]) max[c] = value;
      }
    }
    let axis = 0;
    for (let c = 1; c < 3; c++) if (max[c] - min[c] > max[axis] - min[axis]) axis = c;
    const canSplit = to - from > 1;
    return { from, to, pixels, axis, score: canSplit ? pixels * (max[axis] - min[axis] + 1) : 0 };
  }

  // 점수가 가장 높은 상자를 골라, 픽셀 수가 반반이 되는 지점에서 쪼개기를 반복한다.
  const boxes = usedCount ? [makeBox(0, usedCount)] : [];
  while (boxes.length && boxes.length < GIF_COLORS) {
    let best = 0;
    for (let i = 1; i < boxes.length; i++) if (boxes[i].score > boxes[best].score) best = i;
    const box = boxes[best];
    if (!box.score) break;   // 더 쪼갤 수 있는 상자가 없음

    const channel = channels[box.axis];
    bins.subarray(box.from, box.to).sort((a, b) => channel(a) - channel(b));
    let middle = box.from, seen = 0;
    while (middle < box.to - 1 && seen + pixelCount[bins[middle]] <= box.pixels / 2) seen += pixelCount[bins[middle++]];
    if (middle === box.from) middle++;
    boxes.splice(best, 1, makeBox(box.from, middle), makeBox(middle, box.to));
  }

  // 상자 하나 = 팔레트 색 하나 (상자 안 색들의 평균)
  const palette = new Uint8Array(GIF_COLORS * 3);
  const paletteIndexOfBin = new Uint8Array(32768);
  boxes.forEach((box, index) => {
    let r = 0, g = 0, b = 0;
    for (let i = box.from; i < box.to; i++) {
      const bin = bins[i], weight = pixelCount[bin];
      r += ((bin >> 10) * 8 + 4) * weight;
      g += ((bin >> 5 & 31) * 8 + 4) * weight;
      b += ((bin & 31) * 8 + 4) * weight;
      paletteIndexOfBin[bin] = index;
    }
    palette[index * 3] = r / box.pixels;
    palette[index * 3 + 1] = g / box.pixels;
    palette[index * 3 + 2] = b / box.pixels;
  });

  const indices = new Uint8Array(rgba.length / 4);
  for (let i = 0, pixel = 0; i < rgba.length; i += 4, pixel++) indices[pixel] = paletteIndexOfBin[binOf(i)];
  return { palette, indices };
}

// ② LZW 압축 (GIF 표준 방식)
// 자주 나오는 팔레트 번호 묶음에 코드를 붙여 가며, 코드를 비트 단위로 이어 쓴다. 255바이트씩 블록으로 끊어 out에 쓴다.
function writeLzw(indices, colorBits, out) {
  const clearCode = 1 << colorBits;   // "사전 초기화" 신호
  const endCode = clearCode + 1;      // "끝" 신호
  let nextCode = endCode + 1;
  let codeSize = colorBits + 1;       // 지금 코드 하나가 차지하는 비트 수

  // 비트를 모았다가 8비트가 차면 블록에 담는다.
  const block = new Uint8Array(255);
  let blockLength = 0, bitBuffer = 0, bitCount = 0;
  function writeCode(code) {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      block[blockLength++] = bitBuffer & 255;
      bitBuffer >>>= 8;
      bitCount -= 8;
      if (blockLength === 255) {
        out.byte(255);
        out.bytes(block, 255);
        blockLength = 0;
      }
    }
  }

  // 사전: (앞 코드, 다음 번호) → 코드. 해시 테이블로 찾는다.
  const TABLE_SIZE = 5003;
  const tableKeys = new Int32Array(TABLE_SIZE).fill(-1);
  const tableCodes = new Int32Array(TABLE_SIZE);

  out.byte(colorBits);
  writeCode(clearCode);
  let current = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const next = indices[i];
    const key = current << 8 | next;
    let slot = key % TABLE_SIZE;
    while (tableKeys[slot] !== -1 && tableKeys[slot] !== key) slot = (slot + 1) % TABLE_SIZE;

    if (tableKeys[slot] === key) {   // 이미 아는 묶음 → 더 길게 이어 본다
      current = tableCodes[slot];
      continue;
    }

    writeCode(current);
    if (nextCode === 4096) {         // 사전이 꽉 참 → 초기화
      writeCode(clearCode);
      nextCode = endCode + 1;
      codeSize = colorBits + 1;
      tableKeys.fill(-1);
    } else {                         // 새 묶음을 사전에 등록
      if (nextCode >= 1 << codeSize) codeSize++;
      tableKeys[slot] = key;
      tableCodes[slot] = nextCode++;
    }
    current = next;
  }
  writeCode(current);
  writeCode(endCode);

  if (bitCount > 0) block[blockLength++] = bitBuffer & 255;
  if (blockLength) {
    out.byte(blockLength);
    out.bytes(block, blockLength);
  }
  out.byte(0);   // 블록 끝
}

// frames: RGBA ArrayBuffer 배열 (size × size) → 무한 반복 GIF의 Uint8Array
//   onProgress(0~100)  프레임 하나 끝날 때마다
//   isCancelled()      true를 돌려주면 중단하고 null을 돌려준다
// 화면이 멈추지 않게 프레임마다 한 번씩 쉬어 간다.
async function encodeGif(frames, size, durationMs, onProgress, isCancelled) {
  if (!frames.length) throw new Error('촬영된 프레임이 없습니다. 다시 촬영해 주세요.');

  const out = new ByteWriter();

  // 헤더 + 화면 크기
  out.text('GIF89a');
  out.u16(size);
  out.u16(size);
  out.byte(0x70); out.byte(0); out.byte(0);   // 공통 팔레트 없음 (프레임마다 따로 가짐)

  // 무한 반복 설정
  out.byte(0x21); out.byte(0xff); out.byte(11);
  out.text('NETSCAPE2.0');
  out.byte(3); out.byte(1); out.u16(0); out.byte(0);

  // GIF의 프레임 간격은 10ms 단위. 실제로 찍힌 프레임 수에 맞게 나눠서 전체 길이가 durationMs와 딱 맞게 한다.
  const totalTicks = Math.round(durationMs / 10);
  for (let i = 0; i < frames.length; i++) {
    const { palette, indices } = quantize(new Uint8Array(frames[i]));
    const delay = Math.round((i + 1) * totalTicks / frames.length) - Math.round(i * totalTicks / frames.length);

    // 프레임 간격
    out.byte(0x21); out.byte(0xf9); out.byte(4);
    out.byte(0); out.u16(delay); out.byte(0); out.byte(0);

    // 프레임 위치/크기 + 이 프레임의 팔레트
    out.byte(0x2c);
    out.u16(0); out.u16(0); out.u16(size); out.u16(size);
    out.byte(0x80 | GIF_COLOR_BITS - 1);
    out.bytes(palette);

    writeLzw(indices, GIF_COLOR_BITS, out);

    onProgress(Math.round((i + 1) / frames.length * 100));
    await new Promise(resolve => setTimeout(resolve));
    if (isCancelled()) return null;
  }

  out.byte(0x3b);   // 파일 끝
  return out.toUint8Array();
}
