/*
 * Hơi Thở – tìm mốc bắt đầu hít từ âm thanh.
 * Dùng chung cho trình duyệt (chế độ Micro của máy) và bàn thử tín hiệu tổng hợp trong bench/.
 *
 * Mỗi khung âm thanh cho hai đặc trưng:
 *   level    – năng lượng trong dải 400–6.000 Hz (dB so với toàn thang);
 *   flatness – độ phẳng phổ, trung bình theo năng lượng của bốn dải con. Tiếng luồng khí giống tiếng xì
 *              (phổ phẳng, gần 0,5); tiếng nói hữu thanh, tiếng ngân và tiếng bíp có hài âm nên phổ lồi lõm
 *              (độ phẳng thấp).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.HoiThoDetector = api;
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";

  const BAND = [400, 6000];
  const SUBBANDS = [[400, 900], [900, 1800], [1800, 3400], [3400, 6000]];
  const plans = new Map();

  function plan(size, sampleRate) {
    const key = size + ":" + sampleRate;
    if (plans.has(key)) return plans.get(key);
    const bits = Math.round(Math.log2(size));
    if (1 << bits !== size) throw new Error("Độ dài khung phải là lũy thừa của 2");
    const reverse = new Uint32Array(size);
    for (let i = 0; i < size; i += 1) {
      let r = 0;
      for (let b = 0; b < bits; b += 1) r |= ((i >> b) & 1) << (bits - 1 - b);
      reverse[i] = r;
    }
    const cos = new Float64Array(size / 2);
    const sin = new Float64Array(size / 2);
    for (let i = 0; i < size / 2; i += 1) {
      cos[i] = Math.cos(-2 * Math.PI * i / size);
      sin[i] = Math.sin(-2 * Math.PI * i / size);
    }
    const window = new Float64Array(size);
    let windowPower = 0;
    for (let i = 0; i < size; i += 1) {
      window[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / size);
      windowPower += window[i] * window[i];
    }
    const binHz = sampleRate / size;
    const bin = (hz) => Math.min(size / 2 - 1, Math.max(1, Math.round(hz / binHz)));
    const result = {
      size, reverse, cos, sin, window, windowPower,
      band: BAND.map(bin),
      subbands: SUBBANDS.map(([low, high]) => [bin(low), bin(high) - 1]),
      re: new Float64Array(size),
      im: new Float64Array(size),
      power: new Float64Array(size / 2),
    };
    plans.set(key, result);
    return result;
  }

  function fft(p) {
    const { size, reverse, cos, sin, re, im } = p;
    for (let i = 0; i < size; i += 1) {
      const j = reverse[i];
      if (j > i) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let length = 2; length <= size; length <<= 1) {
      const half = length >> 1;
      const step = size / length;
      for (let start = 0; start < size; start += length) {
        for (let k = 0; k < half; k += 1) {
          const wr = cos[k * step];
          const wi = sin[k * step];
          const a = start + k;
          const b = a + half;
          const xr = re[b] * wr - im[b] * wi;
          const xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr; im[b] = im[a] - xi;
          re[a] += xr; im[a] += xi;
        }
      }
    }
  }

  /** Đặc trưng của một khung (độ dài lũy thừa 2, ví dụ 2.048 mẫu ở 48 kHz hoặc 1.024 mẫu ở 24 kHz). */
  function analyzeFrame(samples, sampleRate) {
    const p = plan(samples.length, sampleRate);
    for (let i = 0; i < p.size; i += 1) { p.re[i] = samples[i] * p.window[i]; p.im[i] = 0; }
    fft(p);
    let total = 0;
    for (let k = p.band[0]; k <= p.band[1]; k += 1) {
      const value = p.re[k] * p.re[k] + p.im[k] * p.im[k];
      p.power[k] = value;
      total += value;
    }
    const level = 10 * Math.log10(2 * total / (p.size * p.windowPower) + 1e-12);
    let weighted = 0;
    let weight = 0;
    for (const [low, high] of p.subbands) {
      let sum = 0;
      let logSum = 0;
      const count = high - low + 1;
      for (let k = low; k <= high; k += 1) {
        const value = p.power[k] + 1e-24;
        sum += value;
        logSum += Math.log(value);
      }
      weighted += Math.exp(logSum / count) / (sum / count) * sum;
      weight += sum;
    }
    return { level, flatness: weight > 0 ? weighted / weight : 0 };
  }

  /** Khung kết thúc tại thời điểm chụp; đặc trưng thuộc về tâm khung, sớm hơn nửa độ dài khung. */
  const frameDelayMs = (size, sampleRate) => size / sampleRate * 500;

  const defaults = {
    calibrationMs: 900,   // đo tiếng ồn nền
    minRise: 6,           // ngưỡng = nền + max(6 dB, 2,5 SD)
    sdFactor: 2.5,
    onsetMs: 120,         // giống hơi hít liên tục 120 ms thì nhận là bắt đầu hít
    gapMs: 40,            // cho phép hụt ngắn trong đoạn hít
    endMs: 300,           // về gần nền 300 ms thì nhận là hết hít
    endMargin: 3,
    minSnr: 9,            // phân vị 90 của đoạn hít phải cao hơn nền ít nhất 9 dB
    flatMin: 0.35,        // ngưỡng độ phẳng phổ, chọn trên bộ ca hiệu chỉnh của bàn thử (seed 1000)
    pressGuardBefore: 40, // đoạn âm bắt đầu sát mốc công tắc có thể là tiếng xịt
    pressGuardAfter: 250,
    pressConfirmMs: 450,  // ...nên phải kéo dài 450 ms mới tính là hít
    voiceWindowMs: 500,   // âm có cao độ trong ±500 ms quanh mốc hít làm mốc không tin cậy
    voiceMs: 100,
    voiceOnlyMs: 200,
    maxBreathMs: 6000,    // một hơi hít không kéo dài quá 6 giây
    minBreathMs: 500,     // đoạn âm ngắn hơn 0,5 s không phải một hơi hít qua bình
    maxTonalShare: 0.2,   // đoạn có hơn 20% khung âm có cao độ là tiếng nói, bỏ qua và nghe tiếp
    backtrackMs: 400,     // dò ngược từ mốc phát hiện về lúc âm vừa nhích khỏi nền
  };

  const reasons = {
    none: "Không thấy đoạn âm giống hơi hít",
    voice: "Có tiếng nói hoặc âm có cao độ chen vào quanh lúc bắt đầu hít",
    tonal: "Chỉ nghe thấy tiếng nói hoặc âm có cao độ (tiếng ngân, tiếng bíp), không thấy hơi hít",
    sustained: "Âm kéo dài không dứt, không giống một hơi hít",
    weak: "Tiếng hít quá nhỏ so với tiếng ồn nền",
    short: "Lượt quá ngắn, chưa đo xong tiếng ồn nền",
  };

  function percentile(values, q) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  }

  class Calibrated {
    constructor(options) {
      this.o = { ...defaults, ...options };
      this.phase = "calibrating";
      this.calib = [];
      this.frames = [];
      this.start = null;
      this.floor = null;
      this.threshold = null;
      this.onset = null;
      this.end = null;
      this.pressAt = null;
    }
    press(t) { if (this.pressAt === null) this.pressAt = t; }
    calibrate(t, f) {
      if (this.start === null) this.start = t;
      this.calib.push(f.level);
      this.frames.push({ t, level: f.level, kind: 0 });
      if (t - this.start < this.o.calibrationMs) return true;
      const median = percentile(this.calib, 0.5);
      const sd = Math.sqrt(this.calib.reduce((s, v) => s + (v - median) ** 2, 0) / this.calib.length);
      this.floor = median;
      this.threshold = median + Math.max(this.o.minRise, this.o.sdFactor * sd);
      this.phase = "listening";
      return true;
    }
    trackEnd(t, level) {
      if (level < this.floor + this.o.endMargin) {
        this.quiet = this.quiet ?? t;
        if (t - this.quiet >= this.o.endMs) { this.end = this.quiet; this.phase = "done"; }
      } else this.quiet = null;
    }
  }

  /** Bản 20/11: chỉ dựa vào năng lượng. Giữ lại để so sánh trên bàn thử. */
  class EnergyDetector extends Calibrated {
    push(t, f) {
      if (this.phase === "calibrating") { this.calibrate(t, f); return; }
      this.frames.push({ t, level: f.level, kind: f.level > this.threshold ? 1 : 0 });
      this.peak = Math.max(this.peak ?? -Infinity, f.level);
      if (this.onset === null) {
        if (f.level > this.threshold) {
          this.run = this.run ?? t;
          if (t - this.run >= this.o.onsetMs) { this.onset = this.run; this.phase = "breath"; }
        } else this.run = null;
      } else if (this.end === null) this.trackEnd(t, f.level);
    }
    finish(t) {
      const out = { onset: this.onset, end: this.end, floor: this.floor, peak: this.peak ?? null, reason: null };
      if (this.phase === "calibrating") out.reason = "short";
      else if (this.onset === null) out.reason = "none";
      else if ((this.peak ?? -Infinity) - this.floor < this.o.minSnr) out.reason = "weak";
      else if (this.end === null) out.end = t;
      if (out.reason) { out.onset = null; out.end = null; }
      return out;
    }
  }

  /** Bản 21/11: thêm độ phẳng phổ, chặn tiếng xịt sát mốc bấm, bỏ qua đoạn giống tiếng nói và bỏ ngỏ khi có âm lạ quanh mốc hít. */
  class BreathDetector extends Calibrated {
    constructor(options) { super(options); this.rejected = []; }
    push(t, f) {
      if (this.phase === "calibrating") { this.calibrate(t, f); return; }
      const o = this.o;
      const loud = f.level > this.threshold;
      const kind = !loud ? 0 : f.flatness >= o.flatMin ? 1 : 2; // 0 yên, 1 giống hơi hít, 2 âm có cao độ
      this.frames.push({ t, level: f.level, flat: f.flatness, kind });
      if (this.onset === null) {
        if (kind === 1) {
          if (!this.run) this.run = { start: t, last: t };
          this.run.last = t;
        } else if (this.run && t - this.run.last > o.gapMs) this.run = null;
        if (this.run && this.run.last - this.run.start >= o.onsetMs) {
          const begin = this.run.start;
          const nearPress = this.pressAt !== null && begin >= this.pressAt - o.pressGuardBefore && begin <= this.pressAt + o.pressGuardAfter;
          if (!nearPress || this.run.last - begin >= o.pressConfirmMs) this.accept(begin);
        }
      } else if (this.end === null) {
        this.trackEnd(t, f.level);
        if (this.end !== null) this.review();
      }
    }
    // ngưỡng phát hiện cao nên mốc tìm được trễ hơn lúc bắt đầu hít; dò ngược với ngưỡng thấp hơn
    accept(begin) {
      const o = this.o;
      const low = this.floor + Math.max(o.endMargin, (this.threshold - this.floor) / 2);
      let onset = begin;
      for (let i = this.frames.length - 1; i >= 0; i -= 1) {
        const frame = this.frames[i];
        if (frame.t > begin) continue;
        if (begin - frame.t > o.backtrackMs || frame.level <= low || frame.flat < o.flatMin) break;
        onset = frame.t;
      }
      this.onset = onset;
      this.phase = "breath";
    }
    // khi đoạn âm kết thúc: quá ngắn hoặc nhiều khung có cao độ thì không phải hơi hít, bỏ qua và nghe tiếp
    review() {
      const o = this.o;
      const loud = this.frames.filter(frame => frame.t >= this.onset && frame.t <= this.end && frame.kind !== 0);
      const tonal = loud.filter(frame => frame.kind === 2).length;
      if (this.end - this.onset < o.minBreathMs || (loud.length && tonal / loud.length > o.maxTonalShare)) {
        this.rejected.push([this.onset, this.end]);
        this.onset = null; this.end = null; this.quiet = null; this.run = null;
        this.phase = "listening";
      }
    }
    tonalMs(from, to) {
      let total = 0;
      for (let i = 1; i < this.frames.length; i += 1) {
        const frame = this.frames[i];
        if (frame.kind === 2 && frame.t >= from && frame.t <= to) total += Math.min(50, frame.t - this.frames[i - 1].t);
      }
      return total;
    }
    finish(t) {
      const o = this.o;
      const out = { onset: this.onset, end: this.end, floor: this.floor, peak: null, reason: null };
      if (this.phase === "calibrating") out.reason = "short";
      else if (this.onset === null) out.reason = this.tonalMs(-Infinity, Infinity) >= o.voiceOnlyMs ? "tonal" : "none";
      else {
        const until = this.end ?? t;
        const inside = this.frames.filter(frame => frame.t >= this.onset && frame.t <= until).map(frame => frame.level);
        out.peak = percentile(inside, 0.9);
        if (this.tonalMs(this.onset - o.voiceWindowMs, this.onset + o.voiceWindowMs) >= o.voiceMs) out.reason = "voice";
        else if (this.end === null || until - this.onset > o.maxBreathMs) out.reason = "sustained";
        else if (out.peak - this.floor < o.minSnr) out.reason = "weak";
      }
      if (out.reason) { out.onset = null; out.end = null; }
      return out;
    }
  }

  return { analyzeFrame, frameDelayMs, defaults, reasons, EnergyDetector, BreathDetector, BAND, SUBBANDS };
});
