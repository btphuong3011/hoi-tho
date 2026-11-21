// Tín hiệu tổng hợp cho bàn thử: tiếng hít, tiếng nền, tiếng bấm, tiếng xịt, tiếng nói, quạt, bíp, ngân, xì.
// Đây là mô hình đơn giản để thử logic, không thay cho ghi âm thật trên đầu kẹp.
"use strict";
const { analyzeFrame } = require("../detector.js");

function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (lo, hi) => lo + (hi - lo) * next();
  next.normal = () => {
    const u = Math.max(next(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
  };
  next.pick = (list) => list[Math.floor(next() * list.length)];
  return next;
}

// biquad theo RBJ cookbook
function biquad(type, freq, q, sr) {
  const w = 2 * Math.PI * freq / sr;
  const alpha = Math.sin(w) / (2 * q);
  const c = Math.cos(w);
  let b0, b1, b2;
  if (type === "lowpass") { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; }
  else if (type === "highpass") { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; }
  else { b0 = alpha; b1 = 0; b2 = -alpha; } // bandpass, đỉnh 0 dB
  const a0 = 1 + alpha;
  const f = { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: -2 * c / a0, a2: (1 - alpha) / a0, x1: 0, x2: 0, y1: 0, y2: 0 };
  return (x) => {
    const y = f.b0 * x + f.b1 * f.x1 + f.b2 * f.x2 - f.a1 * f.y1 - f.a2 * f.y2;
    f.x2 = f.x1; f.x1 = x; f.y2 = f.y1; f.y1 = y;
    return y;
  };
}
const chain = (...filters) => (x) => filters.reduce((v, filter) => filter(v), x);

const ms = (sr, value) => Math.round(value * sr / 1000);

function noise(n, r, shape = (x) => x) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) out[i] = shape(r.normal());
  return out;
}

// nhiễu hồng (Paul Kellet, bản rút gọn): tiếng nền của phòng
function pink(n, r) {
  const out = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i += 1) {
    const white = r.normal();
    b0 = 0.99765 * b0 + white * 0.0990460;
    b1 = 0.96300 * b1 + white * 0.2965164;
    b2 = 0.57000 * b2 + white * 1.0526913;
    out[i] = b0 + b1 + b2 + white * 0.1848;
  }
  return out;
}

// năng lượng trung bình trong dải 400–6.000 Hz trên một đoạn (dB)
function bandLevel(signal, sr, from, to, size) {
  let sum = 0, count = 0;
  const hop = size / 2;
  for (let start = Math.max(0, from); start + size <= Math.min(signal.length, to); start += hop) {
    const { level } = analyzeFrame(signal.subarray(start, start + size), sr);
    sum += 10 ** (level / 10);
    count += 1;
  }
  return count ? 10 * Math.log10(sum / count) : -120;
}
function scaleTo(signal, sr, from, to, targetDb, size) {
  const gain = 10 ** ((targetDb - bandLevel(signal, sr, from, to, size)) / 20);
  for (let i = 0; i < signal.length; i += 1) signal[i] *= gain;
  return signal;
}
function addInto(target, source, offset = 0) {
  for (let i = 0; i < source.length && i + offset < target.length; i += 1) if (i + offset >= 0) target[i + offset] += source[i];
}

// Tiếng hít: nhiễu luồng khí qua dải rộng, biên độ theo lưu lượng^1,5; mốc tham chiếu = lúc lưu lượng bắt đầu tăng.
function breath(sr, r, { durationMs, riseMs, fallMs }) {
  const n = ms(sr, durationMs + fallMs);
  const filter = chain(biquad("highpass", 300, 0.7, sr), biquad("bandpass", r.range(900, 1900), 0.55, sr));
  const out = new Float32Array(n);
  const wobble = r.range(0.0015, 0.004);
  for (let i = 0; i < n; i += 1) {
    const t = i * 1000 / sr;
    let flow;
    if (t < riseMs) flow = 0.5 - 0.5 * Math.cos(Math.PI * t / riseMs);
    else if (t < durationMs) flow = 1 - 0.25 * (t - riseMs) / (durationMs - riseMs);
    else flow = 0.75 * (0.5 + 0.5 * Math.cos(Math.PI * (t - durationMs) / fallMs));
    const amplitude = flow ** 1.5 * (1 + 0.08 * Math.sin(t * wobble * 2 * Math.PI));
    out[i] = filter(r.normal()) * amplitude;
  }
  return { signal: out, plateau: [ms(sr, riseMs), ms(sr, durationMs)] };
}

// tiếng tách của công tắc/bình: xung tắt nhanh
function click(sr, r) {
  const n = ms(sr, 15);
  const ring = r.range(2500, 4000);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const t = i / sr;
    out[i] = Math.exp(-t / 0.0025) * (r.normal() + 0.8 * Math.sin(2 * Math.PI * ring * t));
  }
  return out;
}

// tiếng xịt của bình tập có khí đẩy
function spray(sr, r) {
  const lengthMs = r.range(120, 200);
  const n = ms(sr, lengthMs);
  const filter = biquad("highpass", 1500, 0.7, sr);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const t = i * 1000 / sr;
    out[i] = filter(r.normal()) * Math.min(1, t / 8) * Math.exp(-t / (lengthMs / 2.5));
  }
  return out;
}

// nguyên âm hữu thanh: chuỗi hài âm theo F0, biên độ theo ba formant, cộng tiếng hơi (giọng thở) và rung F0
function voiced(sr, r, lengthMs, { f0, formants, vibrato = 0.02, breathy = r.range(0.08, 0.3), jitter = 0.012 }) {
  const n = ms(sr, lengthMs);
  const out = new Float32Array(n);
  const harmonics = [];
  let power = 0;
  for (let h = 1; h * f0 < Math.min(5500, sr / 2 - 200); h += 1) {
    const f = h * f0;
    let gain = 0;
    for (const [center, width, amp] of formants) gain += amp / (1 + ((f - center) / width) ** 2);
    gain *= 1 / Math.sqrt(h);
    if (gain > 0.003) { harmonics.push([h, gain, r() * 2 * Math.PI]); power += gain * gain / 2; }
  }
  const aspiration = chain(biquad("highpass", 400, 0.7, sr), biquad("bandpass", formants[1][0], 0.4, sr));
  const breathGain = breathy * Math.sqrt(power) * 2.2;
  const glide = r.range(-0.12, 0.12);
  let phase = 0;
  let wander = 0;
  for (let i = 0; i < n; i += 1) {
    const t = i / sr;
    const env = Math.min(1, i / ms(sr, 25), (n - i) / ms(sr, 30));
    wander = 0.995 * wander + 0.1 * r.normal();
    const freq = f0 * (1 + glide * i / n + vibrato * Math.sin(2 * Math.PI * 5 * t) + jitter * wander);
    phase += 2 * Math.PI * freq / sr;
    let value = 0;
    for (const [h, gain, offset] of harmonics) value += gain * Math.sin(h * phase + offset);
    out[i] = (value + breathGain * aspiration(r.normal())) * env;
  }
  return out;
}
const vowels = [
  [[750, 120, 1], [1250, 150, 0.6], [2600, 250, 0.25]], // a
  [[300, 80, 1], [2300, 200, 0.5], [3000, 300, 0.3]],   // i
  [[350, 90, 1], [800, 120, 0.5], [2400, 250, 0.15]],   // u
  [[500, 100, 1], [1800, 180, 0.55], [2600, 250, 0.3]], // e
  [[450, 100, 1], [900, 130, 0.6], [2600, 250, 0.2]],   // o
];

// âm xát vô thanh (s, x, th): nhiễu dải cao
function fricative(sr, r, lengthMs, low = 2500, high = 6000) {
  const n = ms(sr, lengthMs);
  const filter = chain(biquad("highpass", low, 0.7, sr), biquad("lowpass", high, 0.7, sr));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) out[i] = filter(r.normal()) * Math.min(1, i / ms(sr, 15), (n - i) / ms(sr, 20));
  return out;
}

// câu nói: âm tiết hữu thanh xen phụ âm xát và khoảng lặng ngắn
function speech(sr, r, lengthMs) {
  const out = new Float32Array(ms(sr, lengthMs));
  const f0 = r.range(100, 230);
  let t = 0;
  while (t < lengthMs - 120) {
    if (r() < 0.35) {
      const fr = fricative(sr, r, r.range(60, 130));
      for (let i = 0; i < fr.length; i += 1) fr[i] *= 0.35;
      addInto(out, fr, ms(sr, t));
      t += fr.length * 1000 / sr;
    }
    const syllable = r.range(140, 280);
    addInto(out, voiced(sr, r, Math.min(syllable, lengthMs - t), { f0: f0 * r.range(0.9, 1.12), formants: r.pick(vowels) }), ms(sr, t));
    t += syllable + r.range(20, 160);
  }
  return out;
}

// ngân dài: "a…" hoặc "ừm…", ít tiếng hơi hơn khi nói
function hum(sr, r, lengthMs) {
  const formants = r() < 0.5 ? vowels[0] : [[280, 70, 1], [1000, 150, 0.25], [2300, 250, 0.12]];
  return voiced(sr, r, lengthMs, { f0: r.range(110, 220), formants, vibrato: 0.01, breathy: r.range(0.03, 0.12) });
}
function beep(sr, r, lengthMs) {
  const n = ms(sr, lengthMs);
  const f = r.range(1000, 2800);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const t = i / sr;
    out[i] = (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(4 * Math.PI * f * t)) * Math.min(1, i / ms(sr, 5), (n - i) / ms(sr, 5));
  }
  return out;
}
function hiss(sr, r, lengthMs) { return fricative(sr, r, lengthMs, 2000, 6000); }

// quạt: nhiễu thiên về tần số thấp, tăng dần trong 300 ms rồi chạy đều
function fan(sr, r, lengthMs, rampMs = 300) {
  const n = ms(sr, lengthMs);
  const filter = biquad("lowpass", r.range(500, 900), 0.6, sr);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const t = i * 1000 / sr;
    out[i] = (filter(r.normal()) + 0.12 * r.normal()) * Math.min(1, t / rampMs);
  }
  return out;
}

module.exports = { rng, ms, pink, noise, breath, click, spray, speech, hum, beep, hiss, fan, bandLevel, scaleTo, addInto };
