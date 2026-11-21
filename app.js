const demoDuration = 4400;
const liveLimit = 8000;
const holdLead = 700;
const demoWindow = 300;
const limit = (value, minimum, maximum) => Math.min(maximum, Math.max(value, minimum));
const $ = (id) => document.getElementById(id);

const presets = {
  early: { label: "Ca mẫu · Bấm sớm", onset: 1250, end: 3700, press: 460, duration: demoDuration, source: "preset" },
  matched: { label: "Ca mẫu · Khớp nhịp", onset: 520, end: 3950, press: 690, duration: demoDuration, source: "preset" },
  late: { label: "Ca mẫu · Bấm muộn", onset: 600, end: 3100, press: 1710, duration: demoDuration, source: "preset" },
  noisy: { label: "Ca mẫu · Nhiễu nền", onset: null, end: null, press: 920, duration: demoDuration, noisy: true, source: "preset" },
};
// mỗi lượt ghi rõ số liệu đến từ đâu, cả trên màn hình lẫn phiếu in
const sources = {
  preset: { short: "ca mẫu dựng sẵn", text: "Ca mẫu dựng sẵn · dữ liệu minh họa", note: "Ca mẫu: dữ liệu dựng sẵn để minh họa, không phải lượt đo." },
  hold: { short: "giữ nút", text: "Tự tập · mốc hít do người tập giữ nút", note: "Giữ nút: mốc bắt đầu hít do người tập tự đánh dấu bằng nút, không đo luồng khí." },
  mic: { short: "micro", text: "Tự tập · mốc hít ước lượng từ micro của máy", note: "Micro: mốc bắt đầu hít ước lượng từ micro của máy tính hoặc điện thoại, chưa phải đầu kẹp, chưa hiệu chuẩn." },
};
const sourceOf = (trial) => sources[trial?.source ?? "preset"];
const Detector = window.HoiThoDetector;
const results = {
  idle: ["○", "Chọn một ca mẫu hoặc tự tập một lượt", "Thử Bấm sớm rồi Khớp nhịp để thấy vị trí hai mốc thay đổi, hoặc dùng hai nút bên dưới để tự tập."],
  running: ["●", "Đang ghi lượt tập", "Giữ nút Hít vào trong lúc hít, bấm Bấm bình đúng lúc bạn muốn xịt thuốc."],
  calibrating: ["…", "Đang đo tiếng ồn nền", "Giữ yên khoảng một giây để micro đo tiếng ồn của phòng."],
  listening: ["●", "Micro đang nghe", "Bắt đầu hít mạnh (hoặc thổi nhẹ) gần micro, rồi bấm Bấm bình hoặc phím B."],
  early: ["←", "Bấm trước khi bắt đầu hít", "Thuốc phun ra khi chưa có luồng hít nên dễ đọng lại ở miệng họng. Lần sau: thở ra hết, bắt đầu hít chậm rồi mới bấm."],
  matched: ["≈", "Bấm ngay sau khi bắt đầu hít", "Đúng nhịp trong mô phỏng. Tiếp tục hít chậm, sâu 3–5 giây rồi nín thở khoảng 10 giây."],
  late: ["→", "Bấm muộn so với lúc bắt đầu hít", "Khi thuốc phun ra, một phần hơi hít đã qua. Lần sau: bấm ngay khi vừa bắt đầu hít."],
  "after-breath": ["→", "Bấm sau khi đã hít xong", "Thuốc phun ra lúc không còn luồng hít. Cần tập lại nhịp: bắt đầu hít rồi bấm ngay."],
  noisy: ["?", "Chưa đủ tín hiệu để kết luận", "Ghi được mốc bấm nhưng kênh âm không rõ, nên thiết bị để trống mốc hít và độ lệch thay vì đoán."],
  incomplete: ["?", "Thiếu mốc để đối chiếu", "Cần cả mốc bắt đầu hít và mốc bấm để tính độ lệch."],
  aborted: ["×", "Đã hủy lượt", "Lượt dừng giữa chừng vì rời màn hình hoặc đặt lại. Micro đã tắt; lượt này không được lưu."],
};
const parts = {
  clip: {
    tag: "Cơ khí",
    title: "Vỏ kẹp và gá theo một mẫu bình",
    description: "Gá in 3D bám vào vỏ ngoài phần trên của một mẫu bình tập pMDI. Đầu ngậm và cửa ra của thuốc để trống hoàn toàn; mặt bấm của hộp thuốc vẫn phẳng để ngón tay bấm như bình thường.",
    test: "So sánh lực bấm, hành trình và độ ổn định khi lắp, tháo và thao tác lặp. Kiểm tra khoảng hở quanh khe hút khí để đầu gắn không làm thay đổi luồng hít.",
  },
  switch: {
    tag: "Kênh 1 · Mốc bấm",
    title: "Công tắc hành trình",
    description: "Công tắc nhỏ ghi thời điểm hộp thuốc bị ấn xuống hết hành trình. Đây là mốc cơ học, không phụ thuộc tiếng ồn nên luôn có số kể cả khi kênh âm không rõ.",
    test: "Ghi song song với thiết bị tham chiếu trên bình tập. Thử cả chạm nhẹ và rung lắc để nhận diện ghi trùng hoặc ghi nhầm.",
  },
  mic: {
    tag: "Kênh 2 · Mốc bắt đầu hít",
    title: "Micro MEMS gần khe hút khí",
    description: "Khi hít, không khí đi vào qua khe quanh hộp thuốc ở phía trên thân bình. Micro đặt sát khe này, ngoài luồng thuốc, ghi tiếng luồng khí. Thuật toán xét cả năng lượng và độ phẳng phổ: tiếng luồng khí giống tiếng xì, còn tiếng nói, tiếng ngân, tiếng bíp có hài âm. Đoạn âm bắt đầu sát mốc công tắc phải kéo dài mới được tính, để không nhầm với tiếng xịt; có âm lạ quanh mốc hít thì đèn tím.",
    test: "Bàn thử tín hiệu tổng hợp bên dưới cho thấy hai giới hạn: âm “xì” kéo dài vẫn bị nhận nhầm, và khi tiếng hít chỉ cao hơn nền khoảng 6 dB thì phần lớn lượt bị bỏ ngỏ. Bước kế tiếp là ghi âm thật trên bình tập, đối chiếu với tín hiệu luồng khí tham chiếu. Nếu micro bỏ ngỏ quá nhiều, chuyển sang cảm biến chênh áp nhỏ tại khe hút khí.",
  },
  chip: {
    tag: "Phản hồi",
    title: "Hai mốc trên cùng một đồng hồ",
    description: "Vi điều khiển ESP32-C3 xử lý âm thanh trong bộ nhớ tạm, chỉ giữ mốc thời gian và trạng thái tín hiệu, rồi bật đèn: xanh khi đúng nhịp, vàng khi lệch, tím khi chưa đủ tín hiệu. Nhân viên y tế xem biểu đồ hai mốc qua Bluetooth năng lượng thấp.",
    test: "Đo sai số thời gian, độ nhạy phát hiện lệch nhịp và số lượt bị bỏ ngỏ. Ghi riêng lượt bị báo khớp dù tham chiếu cho thấy lệch.",
  },
};

const presetButtons = [...document.querySelectorAll("[data-preset]")];
const modeButtons = [...document.querySelectorAll("[data-mode]")];
const routeLinks = [...document.querySelectorAll(".navigation a")];
const views = [...document.querySelectorAll(".view")];
const partButtons = [...document.querySelectorAll("[data-part]")];
const compareSelectors = [$("compare-a"), $("compare-b")];
const mainChart = $("signal");
const charts = [$("signal-a"), $("signal-b")];
const scrubber = $("scrubber");
const playButton = $("play");
const inhalePad = $("inhale-pad");
const pressPad = $("press-pad");
const userTrials = [];
let selectedPreset = null;
let current = null;
let cursor = 0;
let viewing = "lab";
let replayOrigin = null;
let frame = 0;
let mode = "hold";
let live = null; // { origin, phase, finishAt, detector }
let audio = null; // { ctx, analyser, buffer, stream } – chỉ tồn tại trong một lượt micro
let micOpening = false;
let aborted = false;

// ---------- classification ----------
function classify(trial) {
  if (!trial) return "idle";
  if (trial.noisy) return "noisy";
  if (trial.onset === null || trial.press === null) return "incomplete";
  if (trial.press < trial.onset) return "early";
  if (trial.end !== null && trial.press > trial.end) return "after-breath";
  return trial.press - trial.onset <= demoWindow ? "matched" : "late";
}
const seconds = new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const oneDecimal = new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0, signDisplay: "exceptZero" });
const timeLabel = (value) => value === null || value === undefined ? "—" : `${seconds.format(value / 1000)} s`;
function afterPress(trial) {
  if (!trial || trial.noisy || trial.press === null || trial.end === null || trial.onset === null) return null;
  if (trial.press < trial.onset || trial.press > trial.end) return null;
  return trial.end - trial.press;
}
function readings(trial) {
  if (!trial) return ["—", "—", "—", "—"];
  const { press, onset } = trial;
  const offset = onset === null || press === null ? "—" : `${whole.format(press - onset)} ms`;
  const hold = afterPress(trial);
  return [timeLabel(onset), timeLabel(press), offset, hold === null ? "—" : `${oneDecimal.format(hold / 1000)} s`];
}
function coaching(trial) {
  const state = classify(trial);
  const [, title, text] = results[state];
  if (state === "noisy" && trial.reason) return [title, `${Detector.reasons[trial.reason]}, nên để trống mốc hít và độ lệch thay vì đoán. Thử lại ở chỗ yên hơn, không nói trong lúc hít.`];
  const hold = afterPress(trial);
  const extra = hold === null ? "" : hold < 3000
    ? ` Sau khi bấm mới hít thêm ${oneDecimal.format(hold / 1000)} s; nên hít tiếp chậm, sâu khoảng 3–5 s.`
    : ` Sau khi bấm còn hít thêm ${oneDecimal.format(hold / 1000)} s.`;
  return [title, text + extra];
}

// ---------- signal ----------
function synthLevel(trial, time) {
  const floor = 0.033 + 0.013 * Math.sin(time * 0.063) + 0.014 * Math.sin(time * 0.157);
  if (!trial) return floor;
  if (trial.noisy) {
    const chatter = Math.sin(time * 0.0054) * Math.sin(time * 0.0144);
    return floor + 0.68 * Math.abs(chatter + 0.15 * Math.sin(time * 0.09));
  }
  if (trial.onset === null || time <= trial.onset || time > (trial.end ?? Infinity)) return floor;
  const rise = Math.min(1, (time - trial.onset) / 300);
  const hold = trial.end === null ? 1 : 0.08 + 0.92 * Math.min(1, (trial.end - time) / 470);
  return floor + 0.74 * rise * hold * (0.81 + 0.11 * Math.sin(time * 0.058) + 0.06 * Math.sin(time * 0.191));
}
function sampledLevel(trial, time) {
  const s = trial.samples;
  if (!s.length || time < s[0][0]) return 0.03;
  let lo = 0, hi = s.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (s[mid][0] <= time) lo = mid; else hi = mid - 1; }
  const span = Math.max(12, (trial.peak ?? -60) - (trial.floor ?? -70));
  return 0.03 + 0.8 * limit((s[lo][1] - (trial.floor ?? -70)) / span, 0, 1);
}
const levelAt = (trial, time) => trial && trial.samples ? sampledLevel(trial, time) : synthLevel(trial, time);

const darkTheme = { grid: "#333047", label: "#b5aecb", fill: "#69dec02b", trace: "#a9ebdf", onset: "#8de5d4", press: "#ffd19b", cursor: "#b6a0f077", tonal: "#b9aee052", bg: null };
const printTheme = { grid: "#d6d6d6", label: "#444", fill: "#2a8c7e22", trace: "#1f6f63", onset: "#1f6f63", press: "#c26a00", cursor: null, tonal: "#0000001a", bg: "#fff" };
const hasTonal = (trial) => Boolean(trial?.samples?.some((sample) => sample[2] === 2));
function plot(canvas, trial, horizon, shown = horizon, pointer = null, theme = darkTheme, size = null) {
  const width = size ? size[0] : canvas.clientWidth;
  const height = size ? size[1] : canvas.clientHeight;
  if (width === 0 || height === 0) return;
  const pixelRatio = size ? 2 : (window.devicePixelRatio || 1);
  const rasterWidth = Math.round(width * pixelRatio);
  const rasterHeight = Math.round(height * pixelRatio);
  if (canvas.width !== rasterWidth || canvas.height !== rasterHeight) {
    canvas.width = rasterWidth;
    canvas.height = rasterHeight;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  if (theme.bg) { ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, width, height); }
  const left = 12;
  const right = width - 14;
  const top = 8;
  const base = height - 24;
  const xAt = (time) => left + time / horizon * (right - left);
  const yAt = (level) => base - level * (base - top);
  ctx.lineWidth = 1;
  ctx.strokeStyle = theme.grid;
  ctx.beginPath();
  for (const level of [0, 0.25, 0.5, 0.75, 1]) {
    ctx.moveTo(left, yAt(level));
    ctx.lineTo(right, yAt(level));
  }
  ctx.font = "12px Segoe UI, system-ui, sans-serif";
  ctx.fillStyle = theme.label;
  ctx.textAlign = "center";
  const tickInterval = horizon > 4000 && width < 420 ? 2000 : 1000;
  for (let time = 0; time <= horizon; time += tickInterval) {
    const x = xAt(time);
    ctx.moveTo(x, top);
    ctx.lineTo(x, base);
    ctx.fillText(`${time / 1000} s`, x, height - 7);
  }
  ctx.stroke();

  // khung micro nghe ra âm có cao độ (tiếng nói, tiếng ngân, tiếng bíp): tô nền xám
  if (trial?.samples) {
    ctx.fillStyle = theme.tonal;
    const s = trial.samples;
    for (let i = 1; i < s.length; i += 1) {
      if (s[i][2] !== 2 || s[i][0] > shown) continue;
      const x0 = xAt(Math.max(0, s[i - 1][0]));
      ctx.fillRect(x0, top, Math.max(1, xAt(s[i][0]) - x0), base - top);
    }
  }

  const lastPoint = Math.min(shown, trial?.duration ?? horizon);
  const trace = new Path2D();
  const samples = Math.max(1, Math.round(xAt(lastPoint) - left));
  for (let index = 0; index <= samples; index += 1) {
    const time = lastPoint * index / samples;
    const level = trial ? levelAt(trial, time) : 0;
    if (index === 0) trace.moveTo(xAt(time), yAt(level));
    else trace.lineTo(xAt(time), yAt(level));
  }
  const area = new Path2D(trace);
  area.lineTo(xAt(lastPoint), base);
  area.lineTo(left, base);
  area.closePath();
  ctx.fillStyle = theme.fill;
  ctx.fill(area);
  ctx.strokeStyle = theme.trace;
  ctx.lineWidth = 1.8;
  ctx.stroke(trace);

  const marker = (time, color, dashed, label) => {
    if (time === null || time === undefined || time > shown) return;
    const x = xAt(time);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash(dashed ? [5, 4] : []);
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, base);
    ctx.stroke();
    ctx.setLineDash([]);
    if (label) {
      ctx.font = "600 11.5px Segoe UI, system-ui, sans-serif";
      const w = ctx.measureText(label).width + 10;
      const lx = limit(x - w / 2, left, right - w);
      ctx.fillStyle = color;
      ctx.fillRect(lx, top, w, 17);
      ctx.fillStyle = theme === printTheme ? "#fff" : "#141323";
      ctx.textAlign = "left";
      ctx.fillText(label, lx + 5, top + 12.5);
    }
  };
  const close = trial && trial.onset !== null && trial.press !== null && Math.abs(trial.press - trial.onset) < horizon * 0.09;
  marker(trial?.onset, theme.onset, false, close ? null : "Bắt đầu hít");
  marker(trial?.press, theme.press, true, close ? "Hít ≈ Bấm" : "Bấm");
  if (pointer !== null && pointer > 0 && theme.cursor) marker(pointer, theme.cursor, false, null);
}

function updatePlayhead() {
  const horizon = current?.duration ?? demoDuration;
  scrubber.max = horizon;
  scrubber.value = cursor;
  $("cursor-value").value = timeLabel(cursor);
  plot(mainChart, current, horizon, current ? cursor : horizon, live ? null : cursor);
}

// ---------- lab rendering ----------
function labState() {
  if (live) return live.phase;
  if (aborted && !current) return "aborted";
  return classify(current);
}
function refreshLab() {
  const state = labState();
  const [symbol] = results[state];
  let [, title, text] = results[state];
  if (!live && current) [title, text] = coaching(current);
  const values = readings(current);
  ["breath-readout", "press-readout", "delta-readout", "hold-readout"].forEach((id, index) => {
    $(id).textContent = live && index >= 2 ? "—" : values[index];
  });
  const indicatorState = { noisy: "unknown", incomplete: "unknown", aborted: "idle", "after-breath": "late", calibrating: "running", listening: "running" };
  $("feedback").dataset.state = indicatorState[state] ?? state;
  $("feedback-symbol").textContent = symbol;
  $("feedback-title").textContent = title;
  $("feedback-text").textContent = text;
  $("indicator").dataset.state = $("feedback").dataset.state;
  const led = { idle: "Chờ lượt thử", aborted: "Chờ lượt thử", running: "Đang ghi mốc", calibrating: "Đo tiếng ồn", listening: "Micro đang nghe", noisy: "Tím · chưa đủ tín hiệu", incomplete: "Thiếu mốc" };
  $("led-text").textContent = led[state] ?? (state === "matched" ? "Xanh · đúng nhịp" : "Vàng · lệch nhịp");
  for (const button of presetButtons) {
    button.setAttribute("aria-pressed", button.dataset.preset === selectedPreset);
    button.disabled = Boolean(live);
  }
  for (const button of modeButtons) {
    button.setAttribute("aria-pressed", button.dataset.mode === mode);
    button.disabled = Boolean(live);
  }
  $("reset").disabled = false;
  playButton.disabled = !current || Boolean(live);
  playButton.textContent = replayOrigin === null ? "Phát lại" : "Tạm dừng";
  scrubber.disabled = !current || Boolean(live);
  $("live-actions").hidden = !live;
  $("mic-start").hidden = !(mode === "mic" && !live);
  $("mic-start").disabled = micOpening;
  $("mic-start").textContent = micOpening ? "Đang mở micro…" : "Bắt đầu lượt";
  $("mic-meter").classList.toggle("on", Boolean(audio));
  if (!micOpening) $("mic-status").textContent = audio
    ? "● Micro đang bật cho lượt này"
    : "Micro chỉ bật khi bấm Bắt đầu lượt và tự tắt khi lượt kết thúc";
  $("source-note").textContent = current ? sourceOf(current).text : "chọn ca mẫu hoặc tự tập";
  $("tonal-key").hidden = !hasTonal(current);
  inhalePad.hidden = mode === "mic";
  $("mic-meter").hidden = mode !== "mic";
  pressPad.disabled = mode === "mic" && !live;
  pressPad.classList.toggle("done", Boolean(live && current?.press !== null));
  inhalePad.classList.toggle("done", Boolean(live && current?.end !== null));
  $("practice-hint").innerHTML = mode === "mic"
    ? "Bấm <b>Bắt đầu lượt</b>, giữ yên một giây để đo tiếng ồn, rồi hít mạnh (hoặc thổi nhẹ) gần micro và bấm <b>Bấm bình</b> (phím B). Không nói trong lúc tập: tiếng nói làm lượt bị bỏ ngỏ."
    : "Giữ nút <b>Hít vào</b> trong lúc hít như khi dùng bình thật, bấm <b>Bấm bình</b> đúng lúc muốn xịt thuốc. Trên máy tính: giữ <b>phím cách</b> để hít, phím <b>B</b> để bấm.";
  $("trial-count").textContent = userTrials.length ? `${userTrials.length} lượt tự tập trong phiên này · xem ở mục Đối chiếu` : "";
  updatePlayhead();
}

function stopReplay() {
  if (replayOrigin === null) return;
  replayOrigin = null;
  cancelAnimationFrame(frame);
  playButton.textContent = "Phát lại";
}
function loadPreset(key) {
  if (live) return;
  stopReplay();
  aborted = false;
  selectedPreset = key;
  current = presets[key];
  cursor = current.duration;
  refreshLab();
}

// ---------- live practice ----------
const elapsed = () => Math.round(performance.now() - live.origin);
function beginLive(withMic) {
  stopReplay();
  selectedPreset = null;
  aborted = false;
  const number = userTrials.length + 1;
  current = { label: `Lượt tự tập ${number} · ${withMic ? "micro" : "giữ nút"}`, onset: null, end: null, press: null, duration: liveLimit, source: withMic ? "mic" : "hold" };
  if (withMic) {
    current.samples = [];
    current.floor = -70; current.peak = -60;
    const size = audio.analyser.fftSize;
    live = { origin: performance.now(), phase: "calibrating", finishAt: null, detector: new Detector.BreathDetector(), delay: Detector.frameDelayMs(size, audio.ctx.sampleRate) };
  } else {
    live = { origin: performance.now() - holdLead, phase: "running", finishAt: null };
  }
  cursor = 0;
  refreshLab();
  frame = requestAnimationFrame(tick);
}
function scheduleFinish() {
  if (!live) return;
  const ready = current.press !== null && (current.end !== null || current.noisy);
  if (ready && live.finishAt === null) {
    live.finishAt = elapsed() + 900;
    const token = live;
    setTimeout(() => { if (live === token) finishLive(); }, 950);
  }
}
function finishLive() {
  if (!live) return;
  const t = elapsed();
  if (current.source === "mic") {
    const verdict = live.detector.finish(t);
    current.onset = verdict.onset;
    current.end = verdict.end;
    current.floor = verdict.floor ?? current.floor;
    if (verdict.reason) { current.noisy = true; current.reason = verdict.reason; }
  } else if (current.onset !== null && current.end === null) current.end = Math.min(t, liveLimit);
  const lastEvent = Math.max(current.end ?? 0, current.press ?? 0, current.onset ?? 0);
  current.duration = Math.max(demoDuration, Math.min(liveLimit, lastEvent + 800));
  if (current.samples) current.duration = Math.max(current.duration, Math.min(t, liveLimit));
  cursor = current.duration;
  live = null;
  cancelAnimationFrame(frame);
  closeMic();
  inhalePad.classList.remove("holding");
  userTrials.push(current);
  setCompareOptions(true);
  refreshLab();
}
// dừng lượt giữa chừng (rời màn hình, đặt lại): bỏ lượt và tắt micro
function abortLive() {
  if (!live) { closeMic(); return; }
  live = null;
  cancelAnimationFrame(frame);
  closeMic();
  inhalePad.classList.remove("holding");
  current = null;
  aborted = true;
  cursor = 0;
  refreshLab();
}
function inhaleDown() {
  if (mode !== "hold" || viewing !== "lab") return;
  if (!live) beginLive(false);
  if (current.onset === null) { current.onset = elapsed(); inhalePad.classList.add("holding"); refreshLab(); }
}
function inhaleUp() {
  if (!live || mode !== "hold") return;
  inhalePad.classList.remove("holding");
  if (current.onset !== null && current.end === null) { current.end = elapsed(); scheduleFinish(); refreshLab(); }
}
function pressCanister() {
  if (viewing !== "lab") return;
  if (!live) { if (mode === "mic") return; beginLive(false); }
  if (live.phase === "calibrating") return;
  if (current.press === null) {
    current.press = elapsed();
    live.detector?.press(current.press);
    pressPad.classList.add("flash");
    setTimeout(() => pressPad.classList.remove("flash"), 260);
    scheduleFinish();
    refreshLab();
  }
}

// Micro chỉ mở khi bắt đầu một lượt và đóng ngay khi lượt kết thúc, bị hủy, đổi chế độ hoặc rời màn hình.
// Phát hiện mốc hít nằm trong detector.js (năng lượng + độ phẳng phổ), dùng chung với bàn thử bench/.
async function openMic() {
  if (audio) return true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") await ctx.resume();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = ctx.sampleRate > 30000 ? 2048 : 1024; // khoảng 43 ms mỗi khung
    ctx.createMediaStreamSource(stream).connect(analyser);
    audio = { ctx, analyser, buffer: new Float32Array(analyser.fftSize), stream };
    return true;
  } catch (error) {
    return false;
  }
}
function closeMic() {
  if (!audio) return;
  for (const track of audio.stream.getTracks()) track.stop();
  audio.ctx.close().catch(() => {});
  audio = null;
  $("mic-bar").style.width = "0%";
}
async function startMicTrial() {
  if (live || micOpening || mode !== "mic") return;
  micOpening = true;
  refreshLab();
  $("mic-status").textContent = "Đang xin quyền dùng micro…";
  const ok = await openMic();
  micOpening = false;
  if (!ok) {
    refreshLab();
    $("mic-status").textContent = "Không mở được micro (chưa cho phép hoặc máy không có micro). Có thể dùng chế độ Giữ nút.";
    return;
  }
  if (mode !== "mic" || viewing !== "lab" || document.hidden) { closeMic(); refreshLab(); return; }
  beginLive(true);
}
function micStep(t) {
  audio.analyser.getFloatTimeDomainData(audio.buffer);
  const features = Detector.analyzeFrame(audio.buffer, audio.ctx.sampleRate);
  const at = t - live.delay;
  const detector = live.detector;
  $("mic-bar").style.width = `${limit((features.level + 75) / 55, 0, 1) * 100}%`;
  detector.push(at, features);
  const last = detector.frames[detector.frames.length - 1];
  current.samples.push([at, features.level, last.kind]);
  current.peak = Math.max(current.peak, features.level);
  if (live.phase === "calibrating" && detector.phase !== "calibrating") {
    live.phase = "listening";
    current.floor = detector.floor;
    current.peak = Math.max(current.peak, detector.floor + 1);
    refreshLab();
  }
  if (detector.onset !== current.onset || detector.end !== current.end) {
    current.onset = detector.onset;
    current.end = detector.end;
    if (current.end !== null) scheduleFinish();
    refreshLab();
  }
}

function tick(now) {
  if (live) {
    const t = Math.round(now - live.origin);
    cursor = limit(t, 0, liveLimit);
    if (current.source === "mic") micStep(t);
    if (t >= liveLimit || (live.finishAt !== null && t >= live.finishAt)) {
      finishLive();
      return;
    }
  } else if (replayOrigin !== null) {
    cursor = limit(now - replayOrigin, 0, current.duration);
    if (cursor >= current.duration) {
      stopReplay();
      updatePlayhead();
      return;
    }
  } else {
    return;
  }
  updatePlayhead();
  frame = requestAnimationFrame(tick);
}

// ---------- comparison ----------
function trialFor(key) {
  if (key.startsWith("u")) return userTrials[Number(key.slice(1))];
  return presets[key];
}
const rowLabels = ["Nguồn số liệu", "Bắt đầu hít", "Mốc bấm", "Độ lệch bấm–hít", "Hít tiếp sau bấm", "Nhận xét"];
const verdictText = (trial) => results[classify(trial)][1] + (trial.reason ? ` (${Detector.reasons[trial.reason].toLowerCase()})` : "");
const comparisonRows = (trial) => [sourceOf(trial).text, ...readings(trial), verdictText(trial)];
function updateComparison() {
  const trials = compareSelectors.map(select => trialFor(select.value));
  const horizon = Math.max(...trials.map(trial => trial.duration));
  trials.forEach((trial, index) => {
    plot(charts[index], trial, horizon);
    const suffix = index === 0 ? "a" : "b";
    const children = comparisonRows(trial).flatMap((value, row) => {
      const label = document.createElement("dt");
      const detail = document.createElement("dd");
      label.textContent = rowLabels[row];
      detail.textContent = value;
      return [label, detail];
    });
    $("result-" + suffix).replaceChildren(...children);
    $("print-" + suffix).textContent = `Lượt ${suffix.toUpperCase()} · ${trial.label}`;
    const off = document.createElement("canvas");
    plot(off, trial, horizon, horizon, null, printTheme, [640, 150]);
    $("print-chart-" + suffix).src = off.toDataURL("image/png");
    $("print-cap-" + suffix).textContent = `Lượt ${suffix.toUpperCase()} · ${trial.label} · Nguồn: ${sourceOf(trial).text}`;
  });
  const used = [...new Set(trials.map((trial) => trial.source ?? "preset"))];
  $("print-source").textContent = "Nguồn số liệu. " + used.map((key) => sources[key].note).join(" ")
    + (trials.some(hasTonal) ? " Vùng xám: micro nghe ra âm có cao độ (tiếng nói, tiếng ngân, tiếng bíp)." : "");
  const columns = trials.map(comparisonRows);
  const rows = rowLabels.map((label, index) => {
    const tr = document.createElement("tr");
    const header = document.createElement("th");
    header.scope = "row";
    header.textContent = label;
    tr.append(header);
    for (const column of columns) {
      const cell = document.createElement("td");
      cell.textContent = column[index];
      tr.append(cell);
    }
    return tr;
  });
  $("print-results").replaceChildren(...rows);
  $("print-date").textContent = new Date().toLocaleDateString("vi-VN");
}
function setCompareOptions(preferUser = false) {
  const entries = Object.entries(presets).map(([key, trial]) => [key, trial.label]);
  userTrials.forEach((trial, index) => entries.push(["u" + index, trial.label]));
  compareSelectors.forEach((select, index) => {
    let previous = select.value || (index === 0 ? "early" : "matched");
    if (preferUser && userTrials.length) {
      if (index === 1) previous = "u" + (userTrials.length - 1);
      if (index === 0 && userTrials.length > 1) previous = "u" + (userTrials.length - 2);
    }
    const options = entries.map(([key, label]) => new Option(label, key));
    select.replaceChildren(...options);
    select.value = previous;
  });
}

// ---------- routing & parts ----------
function showRoute(moveFocus) {
  const requested = location.hash.slice(1);
  viewing = ["compare", "design"].includes(requested) ? requested : "lab";
  if (viewing !== "lab") {
    stopReplay();
    if (live) finishLive();
  }
  for (const view of views) view.hidden = view.id !== viewing;
  for (const link of routeLinks) {
    if (link.hash === "#" + viewing) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  if (viewing === "compare") updateComparison();
  if (viewing === "lab") refreshLab();
  if (moveFocus) {
    const id = viewing === "lab" ? "lab-title" : viewing + "-title";
    $(id).focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
}
function selectPart(key) {
  const { tag, title, description, test } = parts[key];
  for (const button of partButtons) button.setAttribute("aria-pressed", button.dataset.part === key);
  $("part-tag").textContent = tag;
  $("part-title").textContent = title;
  $("part-description").textContent = description;
  $("part-test").textContent = test;
}

// ---------- bench ----------
// Kết quả bàn thử tín hiệu tổng hợp (bench/run-bench.js sinh ra bench-results.js).
const percent = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });
const plainMs = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const pctText = (value) => `${percent.format(value)}%`;
function cellRow(cells, header = false) {
  const tr = document.createElement("tr");
  cells.forEach((value, index) => {
    const cell = document.createElement(header ? "th" : index === 0 ? "th" : "td");
    if (header) cell.scope = "col"; else if (index === 0) cell.scope = "row";
    cell.textContent = value;
    tr.append(cell);
  });
  return tr;
}
function benchTable(caption, head, rows) {
  const table = document.createElement("table");
  table.className = "bom bench-table";
  const cap = document.createElement("caption");
  cap.textContent = caption;
  const thead = document.createElement("thead");
  thead.append(cellRow(head, true));
  const tbody = document.createElement("tbody");
  tbody.append(...rows.map((row) => cellRow(row)));
  table.append(cap, thead, tbody);
  const wrap = document.createElement("div");
  wrap.className = "bench-scroll";
  wrap.append(table);
  return wrap;
}
function renderBench() {
  const data = window.HOI_THO_BENCH;
  const host = $("bench");
  if (!data || !host) return;
  const byId = Object.fromEntries(data.cases.map((c) => [c.id, c]));
  const breath = data.cases.filter((c) => c.group === "breath");
  const none = data.cases.filter((c) => c.group === "none");
  const lag = (m) => m.medianError === null ? "—" : `${plainMs.format(m.medianError)} ms`;
  const tables = document.createElement("div");
  tables.className = "bench-tables";
  tables.append(
    benchTable("Ca có hơi hít: phân loại bấm sớm, khớp nhịp hay bấm muộn", ["Ca", "Bản 20/11: kết luận sai", "Bản mới: kết luận sai", "Bản mới: bỏ ngỏ (đèn tím)", "Bản mới: nhận mốc hít muộn (trung vị)"],
      breath.map((c) => [c.title, pctText(c.v1.wrong), pctText(c.v2.wrong), pctText(c.v2.abstain), lag(c.v2)])),
    benchTable("Ca không có hơi hít: máy có “thấy” hơi hít không có thật không", ["Ca", "Bản 20/11: nhận nhầm", "Bản mới: nhận nhầm", "Bản mới: bỏ ngỏ (đèn tím)"],
      none.map((c) => [c.title, pctText(c.v1.falseConclusion), pctText(c.v2.falseConclusion), pctText(c.v2.abstain)])),
  );
  const snr = document.createElement("figure");
  snr.className = "snr";
  const snrCaption = document.createElement("figcaption");
  snrCaption.innerHTML = "Bản mới theo độ lớn tiếng hít so với nền: <i class=\"k ok\"></i>đúng <i class=\"k bad\"></i>sai <i class=\"k abst\"></i>bỏ ngỏ";
  snr.append(snrCaption);
  for (const row of data.snr) {
    const line = document.createElement("div");
    line.className = "snr-row";
    const label = document.createElement("span");
    label.textContent = `${row.snr > 0 ? "+" : ""}${row.snr} dB`;
    const bar = document.createElement("span");
    bar.className = "snr-bar";
    bar.setAttribute("role", "img");
    bar.setAttribute("aria-label", `Đúng ${pctText(row.v2.correct)}, sai ${pctText(row.v2.wrong)}, bỏ ngỏ ${pctText(row.v2.abstain)}`);
    for (const [key, value] of [["ok", row.v2.correct], ["bad", row.v2.wrong], ["abst", row.v2.abstain]]) {
      const part = document.createElement("i");
      part.className = key;
      part.style.width = `${value}%`;
      bar.append(part);
    }
    const text = document.createElement("small");
    text.textContent = `${pctText(row.v2.correct)} đúng · ${pctText(row.v2.wrong)} sai · ${pctText(row.v2.abstain)} bỏ ngỏ`;
    line.append(label, bar, text);
    snr.append(line);
  }
  const snr6 = data.snr.find((row) => row.snr === 6);
  const notes = document.createElement("ul");
  notes.className = "bench-notes";
  const items = [
    `Bản 20/11 chỉ dựa vào năng lượng nên nhận nhầm ${pctText(byId["talk-only"].v1.falseConclusion)} lượt chỉ có tiếng nói và ${pctText(byId.beep.v1.falseConclusion)} lượt có tiếng bíp. Bản mới không nhận nhầm các ca này mà bật đèn tím.`,
    `Âm “xì” kéo dài vẫn bị nhận là hơi hít ở ${pctText(byId.hiss.v2.falseConclusion)} lượt: chỉ dựa vào âm thanh thì không tách được âm xát với tiếng luồng khí.`,
    `Khi tiếng hít chỉ cao hơn nền 6 dB, ${pctText(snr6.v2.abstain)} lượt bị bỏ ngỏ; phòng có quạt chạy: ${pctText(byId.fan.v2.abstain)}. Ít kết luận sai nhưng cũng ít dùng được. Taylor và cộng sự (2018) ghi nhận tiếng hít qua pMDI khoảng 62 dBA khi gắn bộ tạo âm Flo-Tone, còn khoảng 35 dBA khi không gắn (60 L/phút).`,
    `Trong mô hình tổng hợp, micro nhận mốc hít muộn hơn lúc luồng khí bắt đầu tăng khoảng ${lag(byId.quiet.v2)} (trung vị), vì tiếng chỉ đủ lớn khi lưu lượng đã tăng. Độ trễ thật phải đo và bù trên bàn thử có mốc luồng khí; ngưỡng 300 ms vẫn là tham số diễn thử.`,
  ];
  notes.append(...items.map((text) => { const li = document.createElement("li"); li.textContent = text; return li; }));
  const link = document.createElement("a");
  link.href = "https://pmc.ncbi.nlm.nih.gov/articles/PMC5794789/";
  link.target = "_blank"; link.rel = "noopener noreferrer";
  link.textContent = "Taylor, Sci Rep 2018 ↗";
  notes.children[2].append(" ", link);
  host.replaceChildren(tables, snr, notes);
  $("bench-meta").textContent = `${data.settings.trialsPerCase} lượt mỗi ca · chạy ngày ${new Date(data.generated).toLocaleDateString("vi-VN")} · ngưỡng độ phẳng phổ ${percent.format(data.settings.flatMin)} chọn trên bộ ca hiệu chỉnh riêng`;
}

// ---------- events ----------
for (const button of presetButtons) button.addEventListener("click", () => loadPreset(button.dataset.preset));
for (const button of partButtons) button.addEventListener("click", () => selectPart(button.dataset.part));
for (const select of compareSelectors) select.addEventListener("change", updateComparison);
for (const button of modeButtons) button.addEventListener("click", () => {
  if (live || micOpening) return;
  closeMic();
  mode = button.dataset.mode;
  refreshLab();
});
$("mic-start").addEventListener("click", startMicTrial);
// rời màn hình (chuyển tab, khóa máy, đóng trang): hủy lượt đang ghi và tắt micro
document.addEventListener("visibilitychange", () => { if (document.hidden) abortLive(); });
window.addEventListener("pagehide", abortLive);
$("finish").addEventListener("click", () => finishLive());
window.addEventListener("hashchange", () => showRoute(true));
window.addEventListener("beforeprint", updateComparison);
$("print").addEventListener("click", () => { updateComparison(); window.print(); });

inhalePad.addEventListener("pointerdown", (event) => { event.preventDefault(); inhalePad.setPointerCapture?.(event.pointerId); inhaleDown(); });
inhalePad.addEventListener("pointerup", inhaleUp);
inhalePad.addEventListener("pointercancel", inhaleUp);
inhalePad.addEventListener("contextmenu", (event) => event.preventDefault());
inhalePad.addEventListener("keydown", (event) => { if ((event.key === "Enter") && !event.repeat) { event.preventDefault(); inhaleDown(); } });
inhalePad.addEventListener("keyup", (event) => { if (event.key === "Enter") inhaleUp(); });
pressPad.addEventListener("pointerdown", (event) => { event.preventDefault(); pressCanister(); });
pressPad.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.repeat) { event.preventDefault(); pressCanister(); } });
const typing = (target) => ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
document.addEventListener("keydown", (event) => {
  if (viewing !== "lab" || typing(event.target) || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.code === "Space") { event.preventDefault(); if (mode === "hold") inhaleDown(); else pressCanister(); }
  if (event.key === "b" || event.key === "B") { event.preventDefault(); pressCanister(); }
});
document.addEventListener("keyup", (event) => {
  if (event.code === "Space" && viewing === "lab" && !typing(event.target)) { event.preventDefault(); inhaleUp(); }
});

playButton.addEventListener("click", () => {
  if (!current || live) return;
  if (replayOrigin !== null) {
    stopReplay();
    return;
  }
  if (cursor >= current.duration) cursor = 0;
  replayOrigin = performance.now() - cursor;
  playButton.textContent = "Tạm dừng";
  updatePlayhead();
  frame = requestAnimationFrame(tick);
});
scrubber.addEventListener("input", () => {
  stopReplay();
  cursor = Number(scrubber.value);
  updatePlayhead();
});
$("reset").addEventListener("click", () => {
  stopReplay();
  cancelAnimationFrame(frame);
  live = null;
  closeMic();
  aborted = false;
  inhalePad.classList.remove("holding");
  current = null;
  selectedPreset = null;
  cursor = 0;
  refreshLab();
});

new ResizeObserver(() => {
  if (viewing === "lab") updatePlayhead();
  if (viewing === "compare") updateComparison();
}).observe($("main"));
setCompareOptions();
selectPart("clip");
renderBench();
showRoute(false);
const presetHash = new URLSearchParams(location.search).get("ca");
if (presetHash && presets[presetHash]) loadPreset(presetHash);
