/* Segue · track analysis
 * Runs entirely in the browser: the audio never leaves the viewer's machine.
 * Produces a 3-band envelope (for waveforms), BPM + beat grid, downbeat,
 * 8-bar phrase sections and a musical key on the Camelot wheel. */
const Analysis = (() => {
  const ENV_SR = 22050, HOP = 256, HOP_SEC = HOP / ENV_SR;
  const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const CAM_MAJ = { 0: 8, 7: 9, 2: 10, 9: 11, 4: 12, 11: 1, 6: 2, 1: 3, 8: 4, 3: 5, 10: 6, 5: 7 };
  const CAM_MIN = { 9: 8, 4: 9, 11: 10, 6: 11, 1: 12, 8: 1, 3: 2, 10: 3, 5: 4, 0: 5, 7: 6, 2: 7 };
  const KS_MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const KS_MIN = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  const tick = () => new Promise(r => setTimeout(r, 0));

  async function bandEnvelopes(buffer) {
    const len = Math.ceil(buffer.duration * ENV_SR);
    const oc = new OfflineAudioContext(3, len, ENV_SR);
    const src = oc.createBufferSource();
    src.buffer = buffer;
    const merger = oc.createChannelMerger(3);
    const f = (type, freq, q = 0.7) => { const n = oc.createBiquadFilter(); n.type = type; n.frequency.value = freq; n.Q.value = q; return n; };
    src.connect(f('lowpass', 160)).connect(merger, 0, 0);
    src.connect(f('highpass', 250)).connect(f('lowpass', 2500)).connect(merger, 0, 1);
    src.connect(f('highpass', 3500)).connect(merger, 0, 2);
    merger.connect(oc.destination);
    src.start();
    const r = await oc.startRendering();
    const frames = Math.floor(len / HOP);
    const env = [0, 1, 2].map(ch => {
      const d = r.getChannelData(ch), out = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        let s = 0;
        for (let j = i * HOP, e = j + HOP; j < e; j++) s += d[j] * d[j];
        out[i] = Math.sqrt(s / HOP);
      }
      return out;
    });
    const norm = arr => { let m = 0; for (const v of arr) m = Math.max(m, v); if (m > 0) for (let i = 0; i < arr.length; i++) arr[i] /= m; return m; };
    const peaks = env.map(norm);
    return { low: env[0], mid: env[1], high: env[2], peaks };
  }

  function onsetCurve(env) {
    const n = env.low.length, o = new Float32Array(n);
    for (let i = 1; i < n; i++) {
      o[i] = Math.max(0, env.low[i] - env.low[i - 1]) * 1.0
        + Math.max(0, env.mid[i] - env.mid[i - 1]) * 0.5
        + Math.max(0, env.high[i] - env.high[i - 1]) * 0.35;
    }
    return o;
  }

  function tempo(o) {
    const n = Math.min(o.length, Math.floor(90 / HOP_SEC));
    let best = 0, bestBpm = 120;
    for (let bpm = 70; bpm <= 185; bpm += 0.5) {
      const lag = 60 / bpm / HOP_SEC, l0 = Math.floor(lag), fr = lag - l0;
      let s = 0;
      for (let i = 0; i + l0 + 1 < n; i++) s += o[i] * (o[i + l0] * (1 - fr) + o[i + l0 + 1] * fr);
      const w = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 124) / 0.45, 2));
      if (s * w > best) { best = s * w; bestBpm = bpm; }
    }
    // refine: fold the onset curve at each candidate period, keep the sharpest comb
    let bestScore = -1, bpmFine = bestBpm, phaseSec = 0;
    const BINS = 72;
    for (let bpm = bestBpm - 1.5; bpm <= bestBpm + 1.5; bpm += 0.01) {
      const P = 60 / bpm / HOP_SEC, hist = new Float32Array(BINS);
      let total = 0;
      for (let i = 0; i < o.length; i++) {
        if (o[i] === 0) continue;
        hist[Math.floor(((i % P) / P) * BINS) % BINS] += o[i];
        total += o[i];
      }
      let mi = 0, mv = 0;
      for (let b = 0; b < BINS; b++) {
        const v = hist[b] + 0.5 * (hist[(b + 1) % BINS] + hist[(b + BINS - 1) % BINS]);
        if (v > mv) { mv = v; mi = b; }
      }
      const score = mv / (total || 1);
      if (score > bestScore) { bestScore = score; bpmFine = bpm; phaseSec = ((mi + 0.5) / BINS) * P * HOP_SEC; }
    }
    let bpm = bpmFine;
    if (Math.abs(bpm - Math.round(bpm)) < 0.07) bpm = Math.round(bpm);
    else bpm = Math.round(bpm * 100) / 100;
    const beat = 60 / bpm;
    // onset frames mark the end of the hop that contains the hit; nudge back half a hop
    const firstBeat = ((phaseSec - HOP_SEC * 0.5) % beat + beat) % beat;
    return { bpm, beat, firstBeat, confidence: Math.min(1, bestScore * 6) };
  }

  const meanRange = (arr, t0, t1) => {
    const a = Math.max(0, Math.floor(t0 / HOP_SEC)), b = Math.min(arr.length, Math.ceil(t1 / HOP_SEC));
    if (b <= a) return 0;
    let s = 0; for (let i = a; i < b; i++) s += arr[i];
    return s / (b - a);
  };

  function downbeat(env, grid, duration) {
    const { beat, firstBeat } = grid, nBeats = Math.floor((duration - firstBeat) / beat);
    const mid = [], low = [], hi = [];
    for (let j = 0; j < nBeats; j++) {
      const t = firstBeat + j * beat;
      mid.push(meanRange(env.mid, t, t + beat)); low.push(meanRange(env.low, t, t + beat)); hi.push(meanRange(env.high, t, t + beat));
    }
    const score = [0, 0, 0, 0];
    for (let j = 1; j < nBeats; j++) {
      score[j % 4] += Math.abs(mid[j] - mid[j - 1]) + 0.6 * Math.abs(low[j] - low[j - 1]) + 0.4 * Math.abs(hi[j] - hi[j - 1]);
    }
    // a track that starts on a hit almost always starts on a downbeat
    let firstHit = 0;
    while (firstHit < nBeats && low[firstHit] + mid[firstHit] < 0.05) firstHit++;
    const mean = (score[0] + score[1] + score[2] + score[3]) / 4 || 1;
    score[firstHit % 4] += mean * 0.35;
    const k = score.indexOf(Math.max(...score));
    let down0 = firstBeat + k * beat;
    while (down0 - 4 * beat > -beat * 0.25) down0 -= 4 * beat;
    return Math.max(0, down0);
  }

  function sections(env, grid, down0, duration) {
    const barSec = grid.beat * 4, nBars = Math.floor((duration - down0) / barSec);
    const E = [], L = [], M = [], Hh = [];
    for (let b = 0; b < nBars; b++) {
      const t = down0 + b * barSec;
      L.push(meanRange(env.low, t, t + barSec)); M.push(meanRange(env.mid, t, t + barSec)); Hh.push(meanRange(env.high, t, t + barSec));
      E.push((L[b] + M[b] + Hh[b]) / 3);
    }
    // phrase offset: where do 8-bar boundaries line up with the biggest changes?
    const ps = new Array(8).fill(0);
    for (let b = 1; b < nBars; b++) ps[b % 8] += Math.abs(E[b] - E[b - 1]) + Math.abs(L[b] - L[b - 1]);
    const phraseOffset = ps.indexOf(Math.max(...ps));
    const bounds = [0];
    for (let b = phraseOffset || 8; b < nBars; b += 8) if (b > 0) bounds.push(b);
    if (bounds[bounds.length - 1] !== nBars) bounds.push(nBars);
    const eMax = Math.max(...E, 1e-6), lMax = Math.max(...L, 1e-6);
    const phrases = [];
    for (let i = 0; i < bounds.length - 1; i++) {
      const a = bounds[i], b = bounds[i + 1];
      let e = 0, l = 0, m = 0, hi = 0;
      for (let k = a; k < b; k++) { e += E[k]; l += L[k]; m += M[k]; hi += Hh[k]; }
      const n = b - a;
      phrases.push({ start: a, end: b, energy: e / n / eMax, low: l / n / lMax, m: m / n, hi: hi / n });
    }
    // Fullness: how much is going on above the bass (chords, vocals, hats), which is what
    // separates a verse from a chorus far better than loudness does.
    const mMax = Math.max(...phrases.map(p => p.m), 1e-6), hMax = Math.max(...phrases.map(p => p.hi), 1e-6);
    phrases.forEach(p => { p.energy = 0.25 * p.low + 0.45 * p.m / mMax + 0.3 * p.hi / hMax; });
    // Three energy tiers, relative to the fullest phrase of this track.
    const pMax = Math.max(...phrases.map(p => p.energy), 1e-6);
    phrases.forEach(p => {
      const r = p.energy / pMax;
      p.tier = r >= 0.86 && p.low > 0.45 ? 2 : r >= 0.62 ? 1 : 0;
    });
    const lit = phrases.map((p, i) => p.tier > 0 ? i : -1).filter(i => i >= 0);
    const first = lit.length ? lit[0] : 0, last = lit.length ? lit[lit.length - 1] : phrases.length - 1;
    // Name phrases the way a listener would: intro / verse / pre-chorus / chorus / break / outro.
    phrases.forEach((p, i) => {
      if (p.tier === 0) p.type = i < first ? 'intro' : i > last ? 'outro' : 'break';
      else if (p.tier === 2) p.type = 'chorus';
      else p.type = phrases[i + 1] && phrases[i + 1].tier === 2 ? 'pre' : 'verse';
    });
    const merged = [];
    for (const p of phrases) {
      const prev = merged[merged.length - 1];
      if (prev && prev.type === p.type) { prev.end = p.end; prev.energy = Math.max(prev.energy, p.energy); }
      else merged.push({ type: p.type, start: p.start, end: p.end, energy: p.energy });
    }
    // The chorus that lands after a break (or the loudest one) is the drop people wait for.
    const choruses = merged.filter(s => s.type === 'chorus');
    const peak = merged.find((s, i) => s.type === 'chorus' && i > 0 && merged[i - 1].type === 'break')
      || choruses.reduce((m, s) => (!m || s.energy > m.energy ? s : m), null);
    if (peak) peak.type = 'drop';
    merged.forEach(s => { s.high = s.type === 'chorus' || s.type === 'drop'; s.tier = s.high ? 2 : ['verse', 'pre'].includes(s.type) ? 1 : 0; });
    const highs = merged.filter(s => s.high);
    const firstDrop = peak ? peak.start : highs.length ? highs[0].start : null;
    const lastDropEnd = highs.length ? highs[highs.length - 1].end : Math.round(nBars * 0.75);
    return { nBars, phraseOffset, phrases: phrases.map(p => [p.start, +(p.energy / pMax).toFixed(2), +p.low.toFixed(2)]), sections: merged, barEnergy: E.map(v => v / eMax), barLow: L.map(v => v / lMax), firstDrop, lastDropEnd };
  }

  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let j = 0; j < len / 2; j++) {
          const a = i + j, b = a + len / 2;
          const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
          const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
  }

  async function key(buffer) {
    const sr = 11025, N = 4096;
    const oc = new OfflineAudioContext(1, Math.ceil(buffer.duration * sr), sr);
    const src = oc.createBufferSource();
    src.buffer = buffer; src.connect(oc.destination); src.start();
    const d = (await oc.startRendering()).getChannelData(0);
    const chroma = new Float64Array(12), bassChroma = new Float64Array(12), win = new Float32Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
    const binPc = new Int8Array(N / 2).fill(-1), binW = new Float32Array(N / 2);
    for (let k = 1; k < N / 2; k++) {
      const f = k * sr / N;
      if (f < 55 || f > 2000) continue;
      const p = 69 + 12 * Math.log2(f / 440), r = Math.round(p);
      binPc[k] = ((r % 12) + 12) % 12;
      binW[k] = f < 150 ? 1.4 : 1; // bass notes say a lot about the tonic
    }
    const re = new Float32Array(N), im = new Float32Array(N), mag = new Float32Array(N / 2);
    let frame = 0;
    for (let s = 0; s + N <= d.length; s += N) {
      for (let i = 0; i < N; i++) { re[i] = d[s + i] * win[i]; im[i] = 0; }
      fft(re, im);
      for (let k = 1; k < N / 2; k++) mag[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      // keep only tonal peaks that stand well above the local spectrum: drums and noise are broadband
      for (let k = 9; k < N / 2 - 9; k++) {
        if (binPc[k] < 0 || mag[k] < mag[k - 1] || mag[k] < mag[k + 1]) continue;
        let loc = 0;
        for (let j = k - 8; j <= k + 8; j++) loc += mag[j];
        loc /= 17;
        if (mag[k] < loc * 2.5) continue;
        const m = mag[k] - loc;
        chroma[binPc[k]] += m * binW[k];
        if (k * sr / N < 180) bassChroma[binPc[k]] += m;
      }
      if (++frame % 40 === 0) await tick();
    }
    const corr = (a, b) => {
      const ma = a.reduce((x, y) => x + y) / 12, mb = b.reduce((x, y) => x + y) / 12;
      let n = 0, da = 0, db = 0;
      for (let i = 0; i < 12; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
      return n / Math.sqrt(da * db || 1);
    };
    // Pop and club progressions often fit several related keys almost equally well;
    // the note the bass sits on most is a strong hint for the tonic.
    const bMax = Math.max(...bassChroma) || 1;
    let best = { s: -9 };
    for (let t = 0; t < 12; t++) {
      const rot = Array.from({ length: 12 }, (_, i) => chroma[(i + t) % 12]);
      const bonus = 0.3 * bassChroma[t] / bMax;
      const rM = corr(rot, KS_MAJ), rm = corr(rot, KS_MIN);
      if (rM + bonus > best.s) best = { s: rM + bonus, r: rM, tonic: t, minor: false };
      if (rm + bonus > best.s) best = { s: rm + bonus, r: rm, tonic: t, minor: true };
    }
    return keyInfo(best.tonic, best.minor, best.r);
  }

  function keyInfo(tonic, minor, confidence = 1) {
    const num = (minor ? CAM_MIN : CAM_MAJ)[tonic];
    return { tonic, minor, name: NAMES[tonic] + (minor ? 'm' : ''), camelot: num + (minor ? 'A' : 'B'), num, letter: minor ? 'A' : 'B', confidence };
  }

  async function analyze(buffer, onStep = () => {}) {
    onStep('拆分频段');
    const env = await bandEnvelopes(buffer);
    await tick();
    onStep('检测 BPM 与节拍网格');
    const grid = tempo(onsetCurve(env));
    await tick();
    onStep('寻找小节线与乐句');
    const down0 = downbeat(env, grid, buffer.duration);
    const sec = sections(env, grid, down0, buffer.duration);
    await tick();
    onStep('识别调性');
    const k = await key(buffer);
    return {
      duration: buffer.duration, env, hopSec: HOP_SEC,
      bpm: grid.bpm, beat: grid.beat, beatConfidence: grid.confidence, down0,
      key: k, ...sec,
      barTime(bar) { return this.down0 + bar * this.beat * 4; },
      barAt(t) { return (t - this.down0) / (this.beat * 4); },
      lowAt(t) { const i = Math.floor(t / HOP_SEC); return i >= 0 && i < this.env.low.length ? this.env.low[i] : 0; },
      sectionAt(bar) { return this.sections.find(s => bar >= s.start && bar < s.end) || null; },
    };
  }

  // Re-derive bars and sections after the viewer nudges the downbeat by whole beats.
  function shiftDownbeat(an, beats) {
    let down0 = an.down0 + beats * an.beat;
    while (down0 - 4 * an.beat > -an.beat * 0.25) down0 -= 4 * an.beat;
    while (down0 < -0.01) down0 += 4 * an.beat;
    const sec = sections(an.env, { beat: an.beat }, down0, an.duration);
    Object.assign(an, { down0 }, sec);
    return an;
  }

  function compat(a, b) {
    const ka = a.key, kb = b.key;
    const diff = ((kb.num - ka.num) % 12 + 12) % 12;
    let rel, score;
    if (ka.num === kb.num && ka.letter === kb.letter) { rel = '同调'; score = 1; }
    else if (ka.num === kb.num) { rel = '关系大小调'; score = 0.9; }
    else if (ka.letter === kb.letter && (diff === 1 || diff === 11)) { rel = '相邻调'; score = 0.88; }
    else if (ka.letter === kb.letter && (diff === 2 || diff === 10)) { rel = '能量跳调'; score = 0.65; }
    else if (ka.letter !== kb.letter && (diff === 1 || diff === 11)) { rel = '对角混音'; score = 0.6; }
    else { rel = '调性冲突'; score = 0.35; }
    const bpmPct = (a.bpm / b.bpm - 1) * 100; // how much B has to change to meet A
    const semis = 12 * Math.log2(a.bpm / b.bpm);
    const abs = Math.abs(bpmPct);
    const bpmScore = abs <= 2 ? 1 : abs <= 4 ? 0.85 : abs <= 6 ? 0.6 : abs <= 8 ? 0.4 : 0.15;
    return { rel, keyScore: score, bpmPct, semis, bpmScore, overall: Math.round((score * 0.55 + bpmScore * 0.45) * 100) };
  }

  return { analyze, shiftDownbeat, compat, keyInfo, NAMES };
})();
