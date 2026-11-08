/* Segue · demo tracks
 * Two original club tracks rendered in the browser with OfflineAudioContext.
 * No samples, no recordings: every sound is an oscillator or filtered noise,
 * so the demo works for anyone without touching copyrighted audio. */
const Synth = (() => {
  const hz = n => 440 * Math.pow(2, (n - 69) / 12);

  function noise(ctx, secs) {
    const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * secs), ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  function impulse(ctx, secs, decay) {
    const len = Math.floor(ctx.sampleRate * secs);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  // A tiny studio: instrument buses with tone shaping, sidechain ducking and a reverb send.
  function studio(ctx) {
    const master = ctx.createGain();
    master.gain.value = 0.75;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.008; comp.release.value = 0.18;
    master.connect(comp).connect(ctx.destination);
    const verb = ctx.createConvolver();
    verb.buffer = impulse(ctx, 2.4, 3.2);
    const verbOut = ctx.createGain();
    verbOut.gain.value = 0.4;
    verb.connect(verbOut).connect(master);
    const nb = noise(ctx, 3);

    function bus({ type, freq, q = 0.7, gain = 1, rev = 0, duck = false, pan = 0 }) {
      const input = ctx.createGain();
      let node = input, filter = null;
      if (type) {
        filter = ctx.createBiquadFilter();
        filter.type = type; filter.frequency.value = freq; filter.Q.value = q;
        node.connect(filter); node = filter;
      }
      const duckGain = ctx.createGain();
      node.connect(duckGain);
      const out = ctx.createGain();
      out.gain.value = gain;
      duckGain.connect(out);
      if (pan) {
        const p = ctx.createStereoPanner(); p.pan.value = pan;
        out.connect(p).connect(master);
      } else out.connect(master);
      if (rev) { const s = ctx.createGain(); s.gain.value = rev; out.connect(s).connect(verb); }
      return { input, filter, duck: duck ? duckGain.gain : null };
    }
    return { nb, bus };
  }

  function kick(ctx, dest, t, v = 1) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(170, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.1);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + 0.45);
  }

  function hit(ctx, nb, dest, t, decay, v) {
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = nb;
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + decay);
    s.connect(g).connect(dest);
    s.start(t, Math.random() * 2, decay + 0.05);
  }

  function note(ctx, dest, t, dur, midi, { type = 'sawtooth', v = 0.2, a = 0.005, r = 0.08, voices = 1, spread = 9, pluck = false } = {}) {
    const g = ctx.createGain(), end = t + Math.max(a, dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + a);
    if (pluck) g.gain.exponentialRampToValueAtTime(0.0005, end + r);
    else { g.gain.setValueAtTime(v, end); g.gain.exponentialRampToValueAtTime(0.0005, end + r); }
    g.connect(dest);
    for (let i = 0; i < voices; i++) {
      const o = ctx.createOscillator();
      o.type = type; o.frequency.value = hz(midi);
      if (voices > 1) o.detune.value = (i / (voices - 1) - 0.5) * 2 * spread;
      o.connect(g); o.start(t); o.stop(end + r + 0.02);
    }
  }

  function duck(param, t, beat, depth = 0.65) {
    param.setValueAtTime(1 - depth, t);
    param.linearRampToValueAtTime(1, t + beat * 0.6);
  }

  function sweep(ctx, nb, dest, t, len, from, to, v) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = nb; s.loop = true;
    f.type = 'bandpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + len);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + len);
    g.gain.setValueAtTime(0.0001, t + len + 0.01);
    s.connect(f).connect(g).connect(dest);
    s.start(t); s.stop(t + len + 0.05);
  }

  const inR = (bar, ranges) => ranges.some(([a, b]) => bar >= a && bar < b);

  // "Midnight Drive" — deep house, 124 BPM, A minor. 96 bars, long DJ-friendly outro.
  // Each builder sets up its buses and returns a function that schedules one bar.
  function buildA(ctx, S) {
    const beat = 60 / 124, barLen = beat * 4;
    const kickB = S.bus({ gain: 0.95 });
    const hat = S.bus({ type: 'highpass', freq: 8000, gain: 0.45, pan: 0.18 });
    const ohat = S.bus({ type: 'highpass', freq: 6000, gain: 0.32, pan: -0.12 });
    const clap = S.bus({ type: 'bandpass', freq: 1500, q: 0.9, gain: 0.75, rev: 0.3 });
    const bass = S.bus({ type: 'lowpass', freq: 380, q: 3, gain: 0.6, duck: true });
    const stab = S.bus({ type: 'lowpass', freq: 2200, q: 1.5, gain: 0.2, rev: 0.35, duck: true });
    const pad = S.bus({ type: 'lowpass', freq: 1500, gain: 0.15, rev: 0.6, duck: true });
    const lead = S.bus({ type: 'lowpass', freq: 3400, gain: 0.17, rev: 0.5, duck: true });
    const fx = S.bus({ type: 'highpass', freq: 2500, gain: 0.25, rev: 0.7 });

    const chords = [[57, 60, 64, 67], [53, 57, 60, 64], [57, 60, 64, 67], [55, 59, 62, 67]];
    const roots = [45, 41, 45, 43];
    const motif = [[0, 76, 0.5], [0.75, 74, 0.25], [1.5, 72, 0.5], [2.5, 69, 1], [4, 72, 0.5], [4.75, 74, 0.25], [5.5, 76, 0.5], [6.5, 79, 1]];
    stab.filter.frequency.setValueAtTime(2200, 64 * barLen);
    stab.filter.frequency.exponentialRampToValueAtTime(450, 80 * barLen);

    return bar => {
      const t0 = bar * barLen, c = bar % 4;
      const hasKick = inR(bar, [[0, 32], [40, 96]]);
      for (let b = 0; b < 4; b++) {
        const t = t0 + b * beat;
        if (hasKick) {
          kick(ctx, kickB.input, t, 1);
          [bass, stab, pad, lead].forEach(x => duck(x.duck, t, beat));
        }
        if (inR(bar, [[4, 32], [40, 92]])) for (let s = 0; s < 4; s++) hit(ctx, S.nb, hat.input, t + s * beat / 4, 0.03, s % 2 ? 0.12 : 0.22);
        if (inR(bar, [[8, 32], [40, 88]])) hit(ctx, S.nb, ohat.input, t + beat / 2, 0.18, 0.32);
        if ((b === 1 || b === 3) && inR(bar, [[16, 32], [40, 80]])) hit(ctx, S.nb, clap.input, t, 0.17, 0.9);
        if (inR(bar, [[80, 96]]) && (b === 1 || b === 3)) hit(ctx, S.nb, clap.input, t + beat * 0.75, 0.05, 0.35);
        if (inR(bar, [[8, 32], [40, 80]])) {
          const n = (c === 3 && b === 3) ? roots[c] + 7 : roots[c];
          note(ctx, bass.input, t + beat / 2, beat * 0.32, n, { v: 0.5, r: 0.05, voices: 2, spread: 6 });
        }
      }
      if (inR(bar, [[16, 40]])) chords[c].forEach(n => note(ctx, pad.input, t0, barLen * 0.92, n, { v: bar < 32 ? 0.08 : 0.14, a: 0.35, r: 0.7, voices: 2 }));
      if (inR(bar, [[40, 80]])) [0.5, 1.75, 2.5, 3.25].forEach(p => chords[c].forEach(n => note(ctx, stab.input, t0 + p * beat, beat * 0.22, n, { v: 0.16, r: 0.12, voices: 2 })));
      if (inR(bar, [[32, 40], [48, 64]])) motif.forEach(([p, n, d]) => {
        const pb = p - (bar % 2) * 4;
        if (pb >= 0 && pb < 4) note(ctx, lead.input, t0 + pb * beat, d * beat, n, { type: 'triangle', v: bar < 40 ? 0.22 : 0.3, r: 0.25, pluck: true });
      });
      if ([16, 40, 64].includes(bar)) hit(ctx, S.nb, fx.input, t0, 2.2, 0.5);
      if (bar === 36) sweep(ctx, S.nb, fx.input, t0, barLen * 4, 400, 7000, 0.35);
    };
  }

  // "Neon Tide" — melodic techno, 126 BPM, E minor. Drums-only intro, build, then a big drop at bar 48.
  function buildB(ctx, S) {
    const beat = 60 / 126, barLen = beat * 4;
    const kickB = S.bus({ gain: 1 });
    const hat = S.bus({ type: 'highpass', freq: 9000, gain: 0.42, pan: -0.15 });
    const ohat = S.bus({ type: 'highpass', freq: 5500, gain: 0.3, pan: 0.15 });
    const clap = S.bus({ type: 'bandpass', freq: 1800, q: 1.1, gain: 0.7, rev: 0.4 });
    const bass = S.bus({ type: 'lowpass', freq: 300, q: 4, gain: 0.55, duck: true });
    const arp = S.bus({ type: 'lowpass', freq: 600, q: 6, gain: 0.16, rev: 0.4, duck: true, pan: 0.1 });
    const pad = S.bus({ type: 'lowpass', freq: 1800, gain: 0.14, rev: 0.7, duck: true });
    const lead = S.bus({ type: 'lowpass', freq: 4000, gain: 0.16, rev: 0.5, duck: true });
    const fx = S.bus({ type: 'highpass', freq: 2000, gain: 0.25, rev: 0.7 });

    const chords = [[52, 55, 59, 62], [48, 52, 55, 59], [55, 59, 62, 66], [50, 54, 57, 62]];
    const roots = [40, 36, 43, 38];
    const motif = [[0, 71, 0.5], [1, 74, 0.5], [2, 76, 0.75], [3, 74, 0.25], [3.5, 71, 0.5], [5, 67, 0.5], [6, 69, 0.5], [7, 71, 1]];
    arp.filter.frequency.setValueAtTime(600, 16 * barLen);
    arp.filter.frequency.exponentialRampToValueAtTime(3500, 40 * barLen);
    arp.filter.frequency.setValueAtTime(2600, 48 * barLen);

    return bar => {
      const t0 = bar * barLen, c = bar % 4;
      const hasKick = inR(bar, [[0, 40], [48, 96]]);
      for (let b = 0; b < 4; b++) {
        const t = t0 + b * beat;
        if (hasKick) {
          kick(ctx, kickB.input, t, 1);
          [bass, arp, pad, lead].forEach(x => duck(x.duck, t, beat, 0.7));
        }
        if (inR(bar, [[0, 40], [48, 96]])) for (let s = 0; s < 4; s++) hit(ctx, S.nb, hat.input, t + s * beat / 4, 0.025, [0.1, 0.16, 0.24, 0.16][s]);
        if (inR(bar, [[8, 40], [48, 88]])) hit(ctx, S.nb, ohat.input, t + beat / 2, 0.15, 0.3);
        if ((b === 1 || b === 3) && inR(bar, [[16, 40], [48, 80]])) hit(ctx, S.nb, clap.input, t, 0.15, 0.85);
        if (bar >= 44 && bar < 48) {
          const rolls = bar < 46 ? 2 : 4;
          for (let s = 0; s < rolls; s++) hit(ctx, S.nb, clap.input, t + s * beat / rolls, 0.06, 0.25 + (bar - 44) * 0.12);
        }
        if (inR(bar, [[16, 40], [48, 80]])) [0.25, 0.5, 0.75].forEach((p, i) => note(ctx, bass.input, t + p * beat, beat * 0.2, roots[c] + (i === 1 ? 12 : 0), { v: 0.42, r: 0.04, voices: 2, spread: 5 }));
        if (inR(bar, [[16, 48], [48, 80]])) for (let s = 0; s < 4; s++) {
          const tones = chords[c];
          note(ctx, arp.input, t + s * beat / 4, beat * 0.18, tones[(b * 4 + s) % 4] + 12, { type: 'square', v: 0.14, r: 0.06, pluck: true });
        }
      }
      if (inR(bar, [[32, 48]])) chords[c].forEach(n => note(ctx, pad.input, t0, barLen * 0.95, n, { v: 0.12, a: 0.5, r: 0.8, voices: 3 }));
      if (inR(bar, [[48, 80]])) motif.forEach(([p, n, d]) => {
        const pb = p - (bar % 2) * 4;
        if (pb >= 0 && pb < 4) note(ctx, lead.input, t0 + pb * beat, d * beat, n, { v: 0.2, r: 0.3, voices: 3, spread: 12, pluck: true });
      });
      if ([16, 48, 80].includes(bar)) hit(ctx, S.nb, fx.input, t0, 2.4, 0.55);
      if (bar === 40) sweep(ctx, S.nb, fx.input, t0, barLen * 8, 300, 9000, 0.45);
    };
  }

  async function render(build, bpm, bars) {
    const sr = 44100, secs = bars * 4 * 60 / bpm + 0.6;
    const ctx = new OfflineAudioContext(2, Math.ceil(secs * sr), sr);
    // Schedule one bar at a time: thousands of idle nodes created up front would
    // all be processed every render quantum and make the render crawl.
    const playBar = build(ctx, studio(ctx)), barLen = 240 / bpm;
    playBar(0);
    for (let bar = 1; bar < bars; bar++) {
      ctx.suspend(Math.max(0, bar * barLen - 0.06)).then(() => { playBar(bar); ctx.resume(); });
    }
    const buf = await ctx.startRendering();
    let peak = 0;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i += 3) peak = Math.max(peak, Math.abs(d[i]));
    }
    const k = peak > 0 ? 0.89 / peak : 1;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] *= k;
    }
    return buf;
  }

  const DEMOS = {
    A: { title: 'Midnight Drive', artist: 'Segue 示例曲 · Deep House', render: () => render(buildA, 124, 96) },
    B: { title: 'Neon Tide', artist: 'Segue 示例曲 · Melodic Techno', render: () => render(buildB, 126, 96) },
  };
  return { DEMOS };
})();
