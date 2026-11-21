// Bàn thử tín hiệu tổng hợp cho kênh micro của Hơi Thở.
// Chạy: node bench/run-bench.js            (in kết quả, ghi bench/results.json, bench/KET-QUA.md, bench-results.js)
//       node bench/run-bench.js --tune     (so các ngưỡng độ phẳng phổ trên bộ ca hiệu chỉnh, không ghi file)
"use strict";
const fs = require("fs");
const path = require("path");
const D = require("../detector.js");
const s = require("./synth.js");

const SR = 24000;          // đủ cho dải 400–6.000 Hz
const SIZE = 1024;         // 42,7 ms, cùng độ phân giải tần số với khung 2.048 mẫu ở 48 kHz trên trình duyệt
const HOP = 400;           // 16,7 ms, xấp xỉ một khung hình 60 Hz
const LENGTH_MS = 8000;    // giới hạn một lượt, như trong demo
const BG = -62;            // mức tiếng nền của phòng trong dải 400–6.000 Hz (dB toàn thang)
const WINDOW = 300;        // ngưỡng diễn thử "khớp nhịp" của demo
const TRIALS = 50;
const SEEDS = { tune: 1000, test: 5000 };

const N = s.ms(SR, LENGTH_MS);

function classify(onset, end, press) {
  if (onset === null) return "abstain";
  if (press < onset) return "early";
  if (end !== null && press > end) return "after";
  return press - onset <= WINDOW ? "matched" : "late";
}

function background(r) {
  const signal = s.pink(N, r);
  return s.scaleTo(signal, SR, 0, N, BG + r.range(-2, 2), SIZE);
}
function place(target, part, atMs, levelDb, r, from = 0, to = part.length) {
  s.scaleTo(part, SR, from, to, levelDb, Math.min(SIZE, 2 ** Math.floor(Math.log2(Math.max(64, to - from)))));
  s.addInto(target, part, s.ms(SR, atMs));
}
function addPress(signal, r, pressMs, withSpray) {
  place(signal, s.click(SR, r), pressMs, BG + r.range(15, 25), r);
  if (withSpray) place(signal, s.spray(SR, r), pressMs + r.range(0, 15), BG + r.range(12, 20), r);
}
function addBreath(signal, r, snr, onsetRange = [1500, 3000]) {
  const onset = r.range(...onsetRange);
  const durationMs = r.range(2000, 4500);
  const b = s.breath(SR, r, { durationMs, riseMs: r.range(150, 400), fallMs: r.range(250, 500) });
  place(signal, b.signal, onset, BG + snr, r, b.plateau[0], b.plateau[1]);
  const kind = r.pick(["early", "matched", "late"]);
  const press = kind === "early" ? onset - r.range(80, 900)
    : kind === "matched" ? onset + r.range(20, 250)
    : onset + r.range(450, Math.min(1300, durationMs - 300));
  return { onset, end: onset + durationMs, press };
}

// Mỗi ca trả về tín hiệu, mốc tham chiếu (nếu có hít) và mốc công tắc.
const breathCases = [
  { id: "quiet", title: "Phòng yên, có tiếng tách khi bấm", note: "Tiếng hít cao hơn nền 15 dB", build(r) {
    const x = background(r); const truth = addBreath(x, r, 15); addPress(x, r, truth.press, false); return { x, truth };
  } },
  { id: "spray", title: "Có tiếng xịt của bình tập", note: "Tiếng xịt 120–200 ms ngay sau mốc bấm", build(r) {
    const x = background(r); const truth = addBreath(x, r, 15); addPress(x, r, truth.press, true); return { x, truth };
  } },
  { id: "fan", title: "Quạt chạy suốt lượt", note: "Quạt làm nền ồn hơn 6–12 dB", build(r) {
    const x = background(r); place(x, s.fan(SR, r, LENGTH_MS, 1), 0, BG + r.range(6, 12), r);
    const truth = addBreath(x, r, 15); addPress(x, r, truth.press, false); return { x, truth };
  } },
  { id: "talk-before", title: "Có người nói trước lúc hít", note: "Câu nói kết thúc ít nhất 0,8 s trước khi hít", build(r) {
    const x = background(r); const truth = addBreath(x, r, 15, [2600, 3300]);
    const start = 950; const length = truth.onset - r.range(800, 1200) - start;
    place(x, s.speech(SR, r, length), start, BG + r.range(8, 18), r); addPress(x, r, truth.press, false); return { x, truth };
  } },
  { id: "talk-over", title: "Có người nói chen đúng lúc bắt đầu hít", note: "Câu nói 1–2,2 s phủ lên mốc hít", build(r) {
    const x = background(r); const truth = addBreath(x, r, 15);
    place(x, s.speech(SR, r, r.range(1000, 2200)), truth.onset + r.range(-900, 100), BG + r.range(6, 16), r);
    addPress(x, r, truth.press, false); return { x, truth };
  } },
];
const noBreathCases = [
  { id: "talk-only", title: "Chỉ có tiếng nói, không hít", note: "Câu nói 1,2–3 s", build(r) {
    const x = background(r); place(x, s.speech(SR, r, r.range(1200, 3000)), r.range(1000, 2500), BG + r.range(8, 20), r);
    const press = r.range(1800, 4000); addPress(x, r, press, false); return { x, truth: null, press };
  } },
  { id: "press-only", title: "Chỉ bấm và xịt, không hít", note: "Tiếng tách và tiếng xịt", build(r) {
    const x = background(r); const press = r.range(1800, 4000); addPress(x, r, press, true); return { x, truth: null, press };
  } },
  { id: "fan-on", title: "Quạt bật giữa lượt", note: "Âm nền tăng 8–15 dB và kéo dài đến hết lượt", build(r) {
    const x = background(r); const at = r.range(1500, 3000);
    place(x, s.fan(SR, r, LENGTH_MS - at), at, BG + r.range(8, 15), r, s.ms(SR, 400));
    const press = r.range(1800, 4000); addPress(x, r, press, false); return { x, truth: null, press };
  } },
  { id: "beep", title: "Tiếng bíp kéo dài", note: "Âm đơn 1–2,8 kHz, 1,5–3 s", build(r) {
    const x = background(r); place(x, s.beep(SR, r, r.range(1500, 3000)), r.range(1200, 3000), BG + r.range(8, 18), r);
    const press = r.range(1800, 4000); addPress(x, r, press, false); return { x, truth: null, press };
  } },
  { id: "hum", title: "Ngân dài “a…” hoặc “ừm…”", note: "Âm hữu thanh 1,5–3 s", build(r) {
    const x = background(r); place(x, s.hum(SR, r, r.range(1500, 3000)), r.range(1200, 3000), BG + r.range(8, 18), r);
    const press = r.range(1800, 4000); addPress(x, r, press, false); return { x, truth: null, press };
  } },
  { id: "hiss", title: "Âm “xì…” kéo dài", note: "Âm xát vô thanh 1,5–3 s, phổ giống tiếng luồng khí", build(r) {
    const x = background(r); const length = r.range(1500, 3000);
    place(x, s.hiss(SR, r, length), r.range(1200, 3000), BG + r.range(8, 18), r);
    const press = r.range(1800, 4000); addPress(x, r, press, false); return { x, truth: null, press };
  } },
];
const snrLevels = [20, 12, 6, 3, 0, -3, -6];
const snrCase = (snr) => ({ id: "snr" + snr, title: `Tiếng hít ${snr > 0 ? "+" : ""}${snr} dB so với nền`, build(r) {
  const x = background(r); const truth = addBreath(x, r, snr); addPress(x, r, truth.press, false); return { x, truth };
} });

function features(x) {
  const delay = D.frameDelayMs(SIZE, SR);
  const frames = [];
  for (let end = SIZE; end <= x.length; end += HOP) {
    const f = D.analyzeFrame(x.subarray(end - SIZE, end), SR);
    const tEnd = end * 1000 / SR;
    frames.push({ tEnd, t: tEnd - delay, level: f.level, flatness: f.flatness });
  }
  return frames;
}

// chạy một bộ nhận diện như demo: mốc công tắc vào đúng lúc, kết thúc 0,9 s sau khi có đủ mốc bấm và mốc hết hít
function runDetector(Detector, options, frames, pressMs) {
  const detector = new Detector(options);
  let finishAt = null;
  let last = frames[0].tEnd;
  for (const frame of frames) {
    last = frame.tEnd;
    if (frame.tEnd >= pressMs) detector.press(pressMs);
    detector.push(frame.t, frame);
    if (finishAt === null && detector.pressAt !== null && detector.end !== null) finishAt = frame.tEnd + 900;
    if (finishAt !== null && frame.tEnd >= finishAt) break;
  }
  return detector.finish(last);
}

function emptyStats() { return { n: 0, concluded: 0, correct: 0, wrong: 0, abstain: 0, errors: [], reasons: {} }; }
function record(stats, result, truth, pressMs) {
  stats.n += 1;
  if (result.reason) { stats.abstain += 1; stats.reasons[result.reason] = (stats.reasons[result.reason] ?? 0) + 1; return; }
  stats.concluded += 1;
  if (!truth) return;
  stats.errors.push(result.onset - truth.onset);
  const right = classify(truth.onset, truth.end, pressMs) === classify(result.onset, result.end, pressMs);
  if (right) stats.correct += 1; else stats.wrong += 1;
}
const pct = (part, whole) => whole ? Math.round(1000 * part / whole) / 10 : 0;
function summary(stats, hasBreath) {
  const sorted = [...stats.errors].sort((a, b) => a - b);
  const abs = stats.errors.map(Math.abs).sort((a, b) => a - b);
  const q = (list, p) => list.length ? Math.round(list[Math.min(list.length - 1, Math.floor(p * list.length))]) : null;
  const base = { n: stats.n, abstain: pct(stats.abstain, stats.n), reasons: stats.reasons };
  if (!hasBreath) return { ...base, falseConclusion: pct(stats.concluded, stats.n) };
  return { ...base, concluded: pct(stats.concluded, stats.n), correct: pct(stats.correct, stats.n), wrong: pct(stats.wrong, stats.n),
    medianError: q(sorted, 0.5), p90AbsError: q(abs, 0.9) };
}

function runCase(spec, seed, variants) {
  const r = s.rng(seed);
  const stats = variants.map(() => emptyStats());
  for (let i = 0; i < TRIALS; i += 1) {
    const built = spec.build(r);
    const press = built.press ?? built.truth.press;
    const frames = features(built.x);
    variants.forEach((variant, index) => record(stats[index], runDetector(variant.Detector, variant.options, frames, press), built.truth, press));
  }
  return stats.map((stat) => summary(stat, Boolean(spec.hasBreath)));
}

function main() {
  const tune = process.argv.includes("--tune");
  const seedBase = tune ? SEEDS.tune : SEEDS.test;
  const flatCandidates = tune ? [0.2, 0.25, 0.3, 0.35, 0.4, 0.45] : [D.defaults.flatMin];
  const variants = [{ name: "v1", Detector: D.EnergyDetector, options: {} },
    ...flatCandidates.map((flatMin) => ({ name: "v2@" + flatMin, Detector: D.BreathDetector, options: { flatMin } }))];
  const all = [
    ...breathCases.map((c) => ({ ...c, hasBreath: true, group: "breath" })),
    ...noBreathCases.map((c) => ({ ...c, hasBreath: false, group: "none" })),
    ...snrLevels.map((snr) => ({ ...snrCase(snr), hasBreath: true, group: "snr", snr })),
  ];
  const started = Date.now();
  const rows = all.map((spec, index) => {
    const result = runCase(spec, seedBase + index * 97, variants);
    return { spec, result };
  });
  if (tune) {
    console.log("Bộ ca hiệu chỉnh (seed " + seedBase + "), " + TRIALS + " lượt mỗi ca");
    console.log("ca".padEnd(14) + variants.map((v) => v.name.padStart(22)).join(""));
    for (const { spec, result } of rows) {
      const cells = result.map((m) => spec.hasBreath ? `${m.correct}/${m.wrong}/${m.abstain} ${m.medianError ?? '-'}|${m.p90AbsError ?? '-'}` : `${m.falseConclusion}/-/${m.abstain}`);
      console.log(spec.id.padEnd(14) + cells.map((c) => c.padStart(22)).join(""));
    }
    console.log("(đúng/sai/bỏ ngỏ %, ca không hít: nhận nhầm/-/bỏ ngỏ %)  " + (Date.now() - started) + " ms");
    return;
  }
  const out = {
    generated: new Date().toISOString().slice(0, 10),
    settings: { sampleRate: SR, frame: SIZE, hop: HOP, trialsPerCase: TRIALS, seed: seedBase, background: BG, window: WINDOW, flatMin: D.defaults.flatMin },
    cases: rows.filter(({ spec }) => spec.group !== "snr").map(({ spec, result }) => ({ id: spec.id, group: spec.group, title: spec.title, note: spec.note, v1: result[0], v2: result[1] })),
    snr: rows.filter(({ spec }) => spec.group === "snr").map(({ spec, result }) => ({ snr: spec.snr, v1: result[0], v2: result[1] })),
  };
  const dir = __dirname;
  fs.writeFileSync(path.join(dir, "results.json"), JSON.stringify(out, null, 2) + "\n");
  fs.writeFileSync(path.join(dir, "..", "bench-results.js"), "// Sinh tự động bởi bench/run-bench.js – không sửa tay.\nwindow.HOI_THO_BENCH = " + JSON.stringify(out) + ";\n");
  fs.writeFileSync(path.join(dir, "KET-QUA.md"), markdown(out));
  console.log(markdown(out));
  console.log("Xong trong " + (Date.now() - started) + " ms");
}

function markdown(out) {
  const lines = [];
  const { settings } = out;
  lines.push("# Kết quả bàn thử tín hiệu tổng hợp", "");
  lines.push(`Sinh bởi \`node bench/run-bench.js\` ngày ${out.generated}. ${settings.trialsPerCase} lượt mỗi ca, tín hiệu tổng hợp ${settings.sampleRate / 1000} kHz, khung ${settings.frame} mẫu, bước ${settings.hop} mẫu, seed ${settings.seed}. Ngưỡng độ phẳng phổ ${settings.flatMin} được chọn trên bộ ca hiệu chỉnh riêng (\`--tune\`), không phải bộ ca dưới đây.`, "");
  lines.push("**Đây là tín hiệu tổng hợp để thử logic, chưa phải ghi âm thật trên đầu kẹp.** Mốc tham chiếu là lúc lưu lượng tổng hợp bắt đầu tăng. v1 = thuật toán bản 20/11 (chỉ năng lượng); v2 = bản 21/11 (thêm độ phẳng phổ, dò ngược mốc hít, chặn tiếng xịt sát mốc bấm, bỏ qua đoạn giống tiếng nói, bỏ ngỏ khi có âm lạ quanh mốc hít).", "");
  lines.push("## Ca có hơi hít", "", "| Ca | v1 phân loại sai | v2 phân loại sai | v2 bỏ ngỏ | v2 phân loại đúng | v2 lệch mốc hít (trung vị / P90 trị tuyệt đối) |", "|---|---:|---:|---:|---:|---:|");
  for (const c of out.cases.filter((c) => c.group === "breath")) lines.push(`| ${c.title} | ${c.v1.wrong}% | ${c.v2.wrong}% | ${c.v2.abstain}% | ${c.v2.correct}% | ${c.v2.medianError === null ? "—" : `${c.v2.medianError} / ${c.v2.p90AbsError} ms`} |`);
  lines.push("", "## Ca không có hơi hít", "", "| Ca | v1 nhận nhầm | v2 nhận nhầm | v2 bỏ ngỏ |", "|---|---:|---:|---:|");
  for (const c of out.cases.filter((c) => c.group === "none")) lines.push(`| ${c.title} | ${c.v1.falseConclusion}% | ${c.v2.falseConclusion}% | ${c.v2.abstain}% |`);
  lines.push("", "## Theo độ lớn tiếng hít so với nền", "", "| Tiếng hít so với nền | v2 phân loại đúng | v2 phân loại sai | v2 bỏ ngỏ | v2 lệch mốc hít (trung vị) |", "|---:|---:|---:|---:|---:|");
  for (const row of out.snr) lines.push(`| ${row.snr > 0 ? "+" : ""}${row.snr} dB | ${row.v2.correct}% | ${row.v2.wrong}% | ${row.v2.abstain}% | ${row.v2.medianError === null ? "—" : row.v2.medianError + " ms"} |`);
  lines.push("", "Lệch mốc hít: dương là máy nhận muộn hơn mốc tham chiếu. Phân loại: bấm sớm, khớp nhịp (≤ 300 ms, tham số diễn thử), bấm muộn.", "");
  return lines.join("\n");
}

if (require.main === module) main();
