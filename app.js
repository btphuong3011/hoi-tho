const demoDuration = 3400;
const manualLimit = 6000;
const demoWindow = 300;
const limit = (value, minimum, maximum) => Math.min(maximum, Math.max(value, minimum));
const $ = (id) => document.getElementById(id);

const presets = {
  early: { label: "Bấm sớm", onset: 1250, end: 2800, press: 460, duration: demoDuration },
  matched: { label: "Khớp nhịp", onset: 720, end: 2820, press: 890, duration: demoDuration },
  late: { label: "Bấm muộn", onset: 600, end: 2750, press: 1710, duration: demoDuration },
  noisy: { label: "Nhiễu nền", onset: null, end: null, press: 920, duration: demoDuration, noisy: true },
};
const results = {
  idle: ["○", "Chọn một ca để bắt đầu", "Thử Bấm sớm rồi chọn ca Khớp nhịp để xem vị trí hai mốc thay đổi."],
  running: ["●", "Đang ghi một lượt mô phỏng", "Ghi các mốc bằng nút bên dưới rồi kết thúc lượt để xem độ lệch."],
  early: ["←", "Mốc bấm nằm trước mốc hít", "Vạch vàng nằm bên trái điểm bắt đầu của tín hiệu hít."],
  matched: ["≈", "Hai mốc gần nhau trong ca này", "Mốc bấm nằm trong khoảng đối chiếu 300 ms của mô hình giả lập."],
  late: ["→", "Mốc bấm đến muộn", "Vạch vàng nằm ngoài khoảng đối chiếu của mô hình giả lập."],
  "after-breath": ["→", "Mốc bấm nằm sau pha hít", "Tín hiệu hít đã kết thúc trước khi xuất hiện mốc bấm."],
  noisy: ["?", "Chưa đủ tín hiệu", "Ghi được mốc bấm. Kênh âm bị nhiễu nên bỏ trống mốc hít và độ lệch."],
  incomplete: ["?", "Thiếu mốc để đối chiếu", "Lượt diễn thử cần cả mốc bắt đầu hít và mốc bấm để tính độ lệch."],
};
const parts = {
  clip: {
    tag: "Cơ khí",
    title: "Vỏ kẹp và gá theo một mẫu bình",
    description: "Gá dự kiến bám trên vỏ ngoài của một mẫu bình tập pMDI. Thiết kế để hở đầu ngậm và cho phép tiếp cận mặt bấm.",
    test: "So sánh lực bấm, hành trình và độ ổn định khi lắp, tháo và thao tác lặp. Kiểm tra khoảng hở quanh các cửa khí.",
  },
  switch: {
    tag: "Kênh 1 · Mốc bấm",
    title: "Công tắc hành trình",
    description: "Công tắc dự kiến ghi thời điểm cơ cấu bấm chạm hành trình. Mốc này mô tả chuyển động cơ học.",
    test: "Ghi song song với thiết bị tham chiếu trên bình tập. Thử cả chạm nhẹ và rung lắc để nhận diện ghi trùng hoặc ghi nhầm.",
  },
  mic: {
    tag: "Kênh 2 · Mốc bắt đầu hít",
    title: "Micro MEMS xử lý tại chỗ",
    description: "Micro đặt ngoài vỏ. Vi điều khiển dự kiến trích đặc trưng âm trong bộ nhớ tạm để ước lượng mốc bắt đầu hít. Nhật ký chỉ giữ mốc thời gian và trạng thái tín hiệu.",
    test: "Đối chiếu với tín hiệu luồng khí tham chiếu. Thử khi có tiếng nói, tiếng quạt và khi vị trí kẹp thay đổi.",
  },
  chip: {
    tag: "Phản hồi",
    title: "Hai mốc trên cùng một đồng hồ",
    description: "Vi điều khiển dự kiến dùng ESP32-C3 để ghép hai mốc và cập nhật LED. Khi kênh âm không rõ, nhật ký giữ mốc bấm và đánh dấu chưa đủ tín hiệu. Có thể truyền sự kiện qua BLE ở giai đoạn sau.",
    test: "Đo sai số thời gian, độ nhạy phát hiện lệch nhịp và số lượt bị bỏ ngỏ. Ghi riêng lượt bị báo khớp dù tham chiếu cho thấy lệch.",
  },
};

const presetButtons = [...document.querySelectorAll("[data-preset]")];
const routeLinks = [...document.querySelectorAll(".navigation a")];
const views = [...document.querySelectorAll(".view")];
const partButtons = [...document.querySelectorAll("[data-part]")];
const compareSelectors = [$("compare-a"), $("compare-b")];
const mainChart = $("signal");
const charts = [$("signal-a"), $("signal-b")];
const scrubber = $("scrubber");
const playButton = $("play");
const startButton = $("start");
const breathButton = $("breath");
const pressButton = $("press");
let selectedPreset = null;
let current = null;
let latestManual = null;
let cursor = 0;
let viewing = "lab";
let manualStart = null;
let replayOrigin = null;
let frame = 0;

function classify(trial) {
  if (!trial) return "idle";
  if (trial.noisy) return "noisy";
  if (trial.onset === null || trial.press === null) return "incomplete";
  if (trial.press < trial.onset) return "early";
  if (trial.press > trial.end) return "after-breath";
  return trial.press - trial.onset <= demoWindow ? "matched" : "late";
}

const seconds = new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const whole = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0, signDisplay: "exceptZero" });
function timeLabel(value) {
  return value === null ? "—" : `${seconds.format(value / 1000)} s`;
}
function readings(trial) {
  if (!trial) return ["—", "—", "—"];
  const { press, onset } = trial;
  const offset = onset === null || press === null ? "—" : `${whole.format(press - onset)} ms`;
  return [timeLabel(onset), timeLabel(press), offset];
}

function signalLevel(trial, time) {
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

function plot(canvas, trial, horizon, shown = horizon, pointer = null) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width === 0 || height === 0) return;
  const pixelRatio = window.devicePixelRatio || 1;
  const rasterWidth = Math.round(width * pixelRatio);
  const rasterHeight = Math.round(height * pixelRatio);
  if (canvas.width !== rasterWidth || canvas.height !== rasterHeight) {
    canvas.width = rasterWidth;
    canvas.height = rasterHeight;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const left = 12;
  const right = width - 14;
  const top = 8;
  const base = height - 23;
  const xAt = (time) => left + time / horizon * (right - left);
  const yAt = (level) => base - level * (base - top);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#333047";
  ctx.beginPath();
  for (const level of [0, 0.25, 0.5, 0.75, 1]) {
    ctx.moveTo(left, yAt(level));
    ctx.lineTo(right, yAt(level));
  }
  ctx.font = "10px Segoe UI, sans-serif";
  ctx.fillStyle = "#b5aecb";
  ctx.textAlign = "center";
  const tickInterval = horizon > 4000 && width < 400 ? 2000 : 1000;
  for (let time = 0; time <= horizon; time += tickInterval) {
    const x = xAt(time);
    ctx.moveTo(x, top);
    ctx.lineTo(x, base);
    ctx.fillText(`${time / 1000} s`, x, height - 7);
  }
  ctx.stroke();

  const lastPoint = Math.min(shown, trial?.duration ?? horizon);
  const trace = new Path2D();
  const samples = Math.max(1, Math.round(xAt(lastPoint) - left));
  for (let index = 0; index <= samples; index += 1) {
    const time = lastPoint * index / samples;
    const level = trial ? signalLevel(trial, time) : 0;
    if (index === 0) trace.moveTo(xAt(time), yAt(level));
    else trace.lineTo(xAt(time), yAt(level));
  }
  const area = new Path2D(trace);
  area.lineTo(xAt(lastPoint), base);
  area.lineTo(left, base);
  area.closePath();
  ctx.fillStyle = "#69dec02b";
  ctx.fill(area);
  ctx.strokeStyle = "#a9ebdf";
  ctx.lineWidth = 1.65;
  ctx.stroke(trace);

  const marker = (time, color, dashed) => {
    if (time === null || time === undefined || time > shown) return;
    const x = xAt(time);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash(dashed ? [4, 3] : []);
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, base);
    ctx.stroke();
    ctx.setLineDash([]);
  };
  marker(trial?.onset, "#8de5d4", false);
  marker(trial?.press, "#ffd19b", true);
  if (pointer !== null && pointer > 0) marker(pointer, "#b6a0f077", false);
}

function updatePlayhead() {
  const horizon = current?.duration ?? demoDuration;
  scrubber.max = horizon;
  scrubber.value = cursor;
  $("cursor-value").value = timeLabel(cursor);
  plot(mainChart, current, horizon, current ? cursor : horizon, cursor);
}

function refreshLab() {
  const recording = manualStart !== null;
  const state = recording ? "running" : classify(current);
  const [symbol, title, text] = results[state];
  const [onset, press, offset] = readings(current);
  $("breath-readout").textContent = onset;
  $("press-readout").textContent = press;
  $("delta-readout").textContent = recording ? "—" : offset;
  const indicatorState = { noisy: "unknown", incomplete: "unknown", "after-breath": "late" };
  $("feedback").dataset.state = indicatorState[state] ?? state;
  $("feedback-symbol").textContent = symbol;
  $("feedback-title").textContent = title;
  $("feedback-text").textContent = text;
  $("indicator").dataset.state = $("feedback").dataset.state;
  const led = { idle: "Chờ lượt thử", running: "Đang ghi mốc", noisy: "Tín hiệu nhiễu", incomplete: "Thiếu mốc" };
  $("led-text").textContent = led[state] ?? (state === "matched" ? "Hai mốc gần nhau" : "Hai mốc lệch nhau");
  for (const button of presetButtons) {
    button.setAttribute("aria-pressed", button.dataset.preset === selectedPreset);
    button.disabled = recording;
  }
  startButton.disabled = recording;
  $("manual-controls").hidden = !recording;
  playButton.disabled = !current || recording;
  playButton.textContent = replayOrigin === null ? "Phát lại" : "Tạm dừng";
  scrubber.disabled = !current || recording;
  if (recording) {
    const inhaling = current.onset !== null && current.end === null;
    breathButton.setAttribute("aria-pressed", inhaling);
    breathButton.disabled = current.end !== null;
    breathButton.textContent = inhaling ? "Dừng hít giả lập" : current.end === null ? "Bắt đầu hít giả lập" : "Đã dừng hít";
    pressButton.disabled = current.press !== null;
    pressButton.textContent = pressButton.disabled ? "Đã ghi mốc bấm" : "Ghi mốc bấm";
  }
  updatePlayhead();
}

function stopReplay() {
  if (replayOrigin === null) return;
  replayOrigin = null;
  cancelAnimationFrame(frame);
  playButton.textContent = "Phát lại";
}

function tick(now) {
  if (manualStart !== null) {
    cursor = limit(now - manualStart, 0, manualLimit);
    if (cursor >= manualLimit) {
      finishManual();
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

function loadPreset(key) {
  stopReplay();
  selectedPreset = key;
  current = presets[key];
  cursor = current.duration;
  refreshLab();
}

function manualElapsed() {
  return Math.round(limit(performance.now() - manualStart, 0, manualLimit));
}

function finishManual(moveFocus = true) {
  if (manualStart === null) return;
  const time = manualElapsed();
  if (current.onset !== null && current.end === null) current.end = time;
  current.duration = Math.max(demoDuration, time);
  cursor = current.duration;
  latestManual = current;
  manualStart = null;
  cancelAnimationFrame(frame);
  setCompareOptions();
  refreshLab();
  if (moveFocus) startButton.focus();
}

function compareTrial(select) {
  return select.value === "manual" ? latestManual : presets[select.value];
}

const rowLabels = ["Bắt đầu hít", "Mốc bấm", "Độ lệch bấm–hít", "Nhận xét mô phỏng"];
function comparisonRows(trial) {
  return [...readings(trial), results[classify(trial)][1]];
}

function updateComparison() {
  const trials = compareSelectors.map(compareTrial);
  const horizon = Math.max(...trials.map(trial => trial.duration));
  for (let index = 0; index < trials.length; index += 1) {
    const trial = trials[index];
    plot(charts[index], trial, horizon);
    const suffix = index === 0 ? "a" : "b";
    const list = $("result-" + suffix);
    const children = comparisonRows(trial).flatMap((value, row) => {
      const label = document.createElement("dt");
      const detail = document.createElement("dd");
      label.textContent = rowLabels[row];
      detail.textContent = value;
      return [label, detail];
    });
    list.replaceChildren(...children);
    $("print-" + suffix).textContent = `Lượt ${suffix.toUpperCase()} · ${trial.label}`;
  }
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
}

function setCompareOptions() {
  const entries = Object.entries(presets);
  if (latestManual) entries.push(["manual", latestManual]);
  compareSelectors.forEach((select, index) => {
    const previous = select.value || (index === 0 ? "early" : "matched");
    const options = entries.map(([key, trial]) => new Option(trial.label, key));
    select.replaceChildren(...options);
    select.value = previous;
  });
}

function showRoute(moveFocus) {
  const requested = location.hash.slice(1);
  viewing = ["compare", "design"].includes(requested) ? requested : "lab";
  if (viewing !== "lab") {
    stopReplay();
    finishManual(false);
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

for (const button of presetButtons) button.addEventListener("click", () => loadPreset(button.dataset.preset));
for (const button of partButtons) button.addEventListener("click", () => selectPart(button.dataset.part));
for (const select of compareSelectors) select.addEventListener("change", updateComparison);
window.addEventListener("hashchange", () => showRoute(true));
window.addEventListener("beforeprint", updateComparison);
$("print").addEventListener("click", () => window.print());

startButton.addEventListener("click", () => {
  stopReplay();
  selectedPreset = null;
  current = { label: "Lượt tự thử mới nhất", onset: null, end: null, press: null, duration: manualLimit };
  cursor = 0;
  manualStart = performance.now();
  refreshLab();
  breathButton.focus();
  frame = requestAnimationFrame(tick);
});
breathButton.addEventListener("click", () => {
  if (manualStart === null || current.end !== null) return;
  if (current.onset === null) current.onset = manualElapsed();
  else current.end = manualElapsed();
  refreshLab();
  if (breathButton.disabled) (pressButton.disabled ? $("finish") : pressButton).focus();
});
pressButton.addEventListener("click", () => {
  if (manualStart === null || current.press !== null) return;
  current.press = manualElapsed();
  refreshLab();
  (breathButton.disabled ? $("finish") : breathButton).focus();
});
$("finish").addEventListener("click", () => finishManual());

playButton.addEventListener("click", () => {
  if (!current || manualStart !== null) return;
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
  current = null;
  selectedPreset = null;
  manualStart = null;
  cursor = 0;
  refreshLab();
});

new ResizeObserver(() => {
  if (viewing === "lab") updatePlayhead();
  if (viewing === "compare") updateComparison();
}).observe($("main"));
setCompareOptions();
selectPart("clip");
showRoute(false);
