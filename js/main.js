// 화면(UI) 담당.
//   버튼을 누르면 → EmojiManager의 값을 바꾸고
//   값이 바뀌면   → render()가 화면 전체를 현재 값에 맞게 다시 맞춘다.

const EFFECTS = [
  ['original', '오리지널'],
  ['mono', '모노'],
  ['dots', '하프톤'],
  ['ascii', '아스키'],
  ['pixel', '픽셀'],
];
const DURATIONS = [0.5, 1, 1.5, 2, 3];
const PRESETS = ['완전 내 얘기', '어쩌라고~', '오늘도 버텼다', 'ㅋㅋㅋㅋㅋ', '진짜요?'];
const COLORS = ['#d9ff57', '#ffffff', '#ff9ac6', '#8ed9ff', '#ffb45d'];
const STAGE_LABELS = {
  countdown: 'READY TO LOOP',
  recording: 'RECORDING',
  encoding: 'MAKING YOUR LOOP',
  done: 'YOUR LOOP IS READY',
};

const $ = selector => document.querySelector(selector);

const emoji = EmojiManager.getInstance();
const { camera, effect, caption, recorder } = emoji;

emoji.onChange = render;
emoji.mount($('#stage-host'));


// ── 1. 선택 버튼 만들기 (촬영 길이, 효과, 문구 프리셋, 색) ────────

// container 안에 버튼을 하나 만든다. 누르면 onClick(value) 후 화면을 갱신한다.
function addOption(container, value, label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.value = value;
  button.textContent = label;
  button.onclick = () => {
    onClick(value);
    render();
  };
  $(container).appendChild(button);
  return button;
}

function setColor(color) {
  effect.color = color;
  caption.color = color;
}

for (const seconds of DURATIONS) {
  addOption('#durations', seconds, `${seconds}초`, value => { recorder.duration = Number(value); });
}
for (const [type, name] of EFFECTS) {
  addOption('#effects', type, name, value => { effect.type = value; });
}
for (const text of PRESETS) {
  addOption('#presets', text, text, value => { caption.text = value; });
}
for (const color of COLORS) {
  const button = addOption('#colors', color, '', setColor);
  button.style.background = color;
  button.title = color;
}


// ── 2. 버튼/입력 연결 ───────────────────────────────────────

// 카메라
$('#camera-on').onclick = () => emoji.startCamera();
$('#camera-off').onclick = () => emoji.stopCamera();
$('#mirror').onclick = () => { camera.mirror = !camera.mirror; render(); };

// 촬영
$('#shutter').onclick = () => emoji.capture();
$('#cancel').onclick = () => recorder.cancel();
$('#retake').onclick = () => recorder.reset();

// 효과, 문구, 색
$('#intensity').oninput = event => {
  effect.intensity = Number(event.target.value);
  render();
};
$('#caption').oninput = event => {
  caption.text = event.target.value.split('\n').slice(0, 2).join('\n');   // 최대 두 줄
  render();
};
$('#pos-top').onclick = () => { caption.position = 'top'; render(); };
$('#pos-bottom').onclick = () => { caption.position = 'bottom'; render(); };
$('#text-size').onchange = event => { caption.fontSize = Number(event.target.value); };
$('#custom-color').oninput = event => {
  setColor(event.target.value);
  render();
};

// 오류, 도움말
$('#error-close').onclick = () => emoji.setError('');
$('#help-open').onclick = () => $('#help').showModal();
for (const button of document.querySelectorAll('#help [data-close]')) {
  button.onclick = () => $('#help').close();
}

// 촬영 중에 탭이 가려지면 프레임이 멈춰서 빈 GIF가 되므로 취소한다.
document.addEventListener('visibilitychange', () => {
  const capturing = recorder.phase === 'countdown' || recorder.phase === 'recording';
  if (document.hidden && capturing) {
    recorder.cancel();
    emoji.setError('촬영이 중단됐어요. 화면을 켠 상태에서 다시 촬영해 주세요.');
  }
});


// ── 3. 현재 값 → 화면 ───────────────────────────────────────

function show(selector, visible) {
  $(selector).hidden = !visible;
}

// container 안의 버튼 중 data-value가 value인 것만 선택 표시
function markSelected(container, value) {
  for (const button of document.querySelectorAll(`${container} button`)) {
    button.classList.toggle('active', button.dataset.value === String(value));
  }
}

function render() {
  renderStage();
  renderCaptureBar();
  renderControls();

  show('#error', emoji.error !== '');
  $('#error-text').textContent = emoji.error;
}

// 캔버스와 그 위에 겹치는 안내들 (캔버스 바깥 DOM이라 GIF에는 안 찍힌다)
function renderStage() {
  const { phase, duration, progress } = recorder;
  const remainingSeconds = (100 - progress) / 100 * duration;

  let label = STAGE_LABELS[phase];
  if (!label) label = camera.on ? 'CAMERA IS ON' : 'CAMERA IS OFF';
  $('#stage-label').textContent = label;

  show('#invite', phase === 'idle' && !camera.on);
  show('#countdown', phase === 'countdown');
  show('#rec-pill', phase === 'recording');
  show('#encoding', phase === 'encoding');
  show('#result-gif', phase === 'done');

  $('#count').textContent = recorder.count;
  $('#remain').textContent = `${remainingSeconds.toFixed(1)}s`;
  $('#encode-progress').textContent = `${Math.round(progress)}%`;

  $('#camera-on').disabled = camera.busy;
  $('#camera-on').textContent = camera.busy ? '카메라 연결 중…' : '카메라 켜기 →';

  // 완성된 GIF가 새로 나왔을 때만 미리보기와 저장 링크를 갈아 끼운다.
  if (phase === 'done' && $('#result-gif').src !== recorder.result) {
    $('#result-gif').src = recorder.result;
    $('#download').href = recorder.result;
    $('#download').download = `face-loop-${Date.now()}.gif`;
  }
}

// 캔버스 아래: 정보 줄, 촬영 버튼, 저장/다시 촬영
function renderCaptureBar() {
  const { phase, duration, progress, busy } = recorder;
  const done = phase === 'done';
  const megabytes = (recorder.resultSize / 1024 / 1024).toFixed(1);

  $('#meta').textContent = done ? `GIF · ${duration} SEC · ${megabytes} MB` : `${duration} SEC · INFINITE POSSIBILITIES`;
  show('#camera-off', camera.on && !busy);
  $('#mirror').disabled = busy || done;

  show('#capture-progress', phase === 'recording' || phase === 'encoding');
  $('#capture-progress').value = progress;

  show('#capture-idle', !done);
  show('#capture-done', done);
  $('#shutter').disabled = busy || !camera.on;
  $('#shutter').textContent = phase === 'recording' ? '■' : '●';
  $('#capture-hint').textContent = phase === 'recording' ? '지금, 마음껏 표현해요.' : '준비되면 눌러주세요.';
  $('#capture-meta').textContent = `3초 카운트다운 + ${duration}초 촬영`;

  show('#cancel', busy);
  $('#cancel').textContent = phase === 'encoding' ? '✕ 변환 취소' : '✕ 촬영 취소';
}

// 오른쪽 설정 패널
function renderControls() {
  const locked = recorder.busy || recorder.phase === 'done';   // 촬영 중이거나 결과를 보는 중에는 못 바꾼다
  $('#controls').disabled = locked;

  markSelected('#durations', recorder.duration);
  markSelected('#effects', effect.type);
  markSelected('#presets', caption.text);
  markSelected('#colors', effect.color);

  $('#intensity').disabled = !effect.usesIntensity;
  $('#intensity').value = effect.intensity;
  $('#intensity-label').textContent = effect.usesIntensity ? '효과 입자 크기' : '원본 그대로, 표정에 집중해요';
  $('#intensity-value').textContent = effect.intensity;

  // 입력 중인 칸을 건드리면 커서가 튀므로, 값이 다를 때만 넣는다.
  if ($('#caption').value !== caption.text) $('#caption').value = caption.text;
  $('#caption-count').textContent = `${caption.text.length}/30`;
  $('#pos-top').classList.toggle('active', caption.position === 'top');
  $('#pos-bottom').classList.toggle('active', caption.position === 'bottom');

  $('#color-hex').textContent = effect.color.toUpperCase();
  $('#custom-color').value = effect.color;
  $('#how-duration').textContent = recorder.duration;
}

render();
