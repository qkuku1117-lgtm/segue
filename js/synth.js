/* Segue · demo tracks
 * Six original club tracks rendered in the browser with OfflineAudioContext.
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

  /* The other library tracks share one arranger: a spec names the patterns and the bar ranges each part plays in.
     Every track keeps a drums-first intro and a long outro so there is always room to mix in and out. */
  function makeTrack(sp) {
    return (ctx, S) => {
      const beat = 60 / sp.bpm, barLen = beat * 4, R = sp.r;
      const kickB = S.bus({ gain: 0.95 });
      const hat = S.bus({ type: 'highpass', freq: sp.hatHz || 8500, gain: 0.42, pan: 0.15 });
      const ohat = S.bus({ type: 'highpass', freq: 6000, gain: 0.3, pan: -0.12 });
      const clap = S.bus({ type: 'bandpass', freq: sp.clapHz || 1600, q: 1, gain: 0.72, rev: 0.32 });
      const perc = S.bus({ type: 'bandpass', freq: sp.percHz || 3200, q: 2.5, gain: 0.34, rev: 0.2, pan: -0.25 });
      const bass = S.bus({ type: 'lowpass', freq: sp.bassHz || 340, q: 3, gain: 0.58, duck: true });
      const keys = S.bus({ type: 'lowpass', freq: sp.keysHz || 2200, q: sp.keysQ || 1.2, gain: sp.keysGain || 0.19, rev: 0.4, duck: true, pan: 0.08 });
      const pad = S.bus({ type: 'lowpass', freq: 1600, gain: 0.14, rev: 0.65, duck: true });
      const lead = S.bus({ type: 'lowpass', freq: sp.leadHz || 3600, gain: 0.17, rev: 0.5, duck: true });
      const fx = S.bus({ type: 'highpass', freq: 2200, gain: 0.25, rev: 0.7 });
      (sp.keysSweep || []).forEach(([bar, f, ramp]) => {
        if (ramp) keys.filter.frequency.exponentialRampToValueAtTime(f, bar * barLen);
        else keys.filter.frequency.setValueAtTime(f, bar * barLen);
      });
      const ducked = [bass, keys, pad, lead];
      return bar => {
        const t0 = bar * barLen, c = bar % 4, ch = sp.chords[c], root = sp.roots[c];
        const on = k => !!R[k] && inR(bar, R[k]);
        for (let b = 0; b < 4; b++) {
          const t = t0 + b * beat;
          if (on('kick')) { kick(ctx, kickB.input, t, 1); ducked.forEach(x => duck(x.duck, t, beat, sp.duck || 0.65)); }
          if (on('hat')) sp.hat.forEach((v, i) => { if (v) hit(ctx, S.nb, hat.input, t + i * beat / 4, 0.028, v); });
          if (on('ohat')) hit(ctx, S.nb, ohat.input, t + beat / 2, 0.16, 0.3);
          if ((b === 1 || b === 3) && on('clap')) hit(ctx, S.nb, clap.input, t, 0.16, 0.88);
          if (on('bass')) {
            if (sp.bass === 'octave') { note(ctx, bass.input, t, beat * 0.36, root, { v: 0.44, r: 0.04, voices: 2, spread: 5 }); note(ctx, bass.input, t + beat / 2, beat * 0.3, root + 12, { v: 0.4, r: 0.04, voices: 2, spread: 5 }); }
            else if (sp.bass === 'roll') [0.25, 0.5, 0.75].forEach((p, i) => note(ctx, bass.input, t + p * beat, beat * 0.2, root + (i === 1 ? 12 : 0), { v: 0.42, r: 0.04, voices: 2, spread: 5 }));
            else if (sp.bass === 'long') { if (b === 0 || b === 2) note(ctx, bass.input, t + beat * 0.5, beat * 1.3, root + (b === 2 && c === 3 ? 7 : 0), { type: 'triangle', v: 0.62, a: 0.02, r: 0.12 }); }
            else note(ctx, bass.input, t + beat / 2, beat * 0.32, (c === 3 && b === 3) ? root + 7 : root, { v: 0.5, r: 0.05, voices: 2, spread: 6 });
          }
          if (on('keys')) {
            if (sp.keys === 'arp') for (let i = 0; i < 4; i++) note(ctx, keys.input, t + i * beat / 4, beat * 0.18, ch[(b * 4 + i) % ch.length] + 12, { type: 'square', v: 0.14, r: 0.06, pluck: true });
            else if (sp.keys === 'pluck') [0, 0.5].forEach((p, i) => note(ctx, keys.input, t + p * beat, beat * 0.3, ch[(b * 2 + i + (bar % 2)) % ch.length] + 12, { type: 'triangle', v: 0.3, r: 0.22, pluck: true }));
          }
          if (sp.roll && bar >= sp.roll[0] && bar < sp.roll[1]) {
            const n = bar < sp.roll[1] - 2 ? 2 : 4;
            for (let i = 0; i < n; i++) hit(ctx, S.nb, clap.input, t + i * beat / n, 0.06, 0.22 + (bar - sp.roll[0]) * 0.1);
          }
        }
        if (on('perc')) sp.perc.forEach(p => hit(ctx, S.nb, perc.input, t0 + p * beat, 0.05, 0.42));
        if (on('keys') && sp.keys === 'stab') sp.stab.forEach(p => ch.forEach(n => note(ctx, keys.input, t0 + p * beat, beat * 0.22, n, { v: 0.16, r: 0.12, voices: 2 })));
        if (on('pad')) ch.forEach(n => note(ctx, pad.input, t0, barLen * 0.94, n, { v: 0.11, a: 0.4, r: 0.8, voices: 2 }));
        if (on('lead')) sp.motif.forEach(([p, n, d]) => {
          const pb = p - (bar % 2) * 4;
          if (pb >= 0 && pb < 4) note(ctx, lead.input, t0 + pb * beat, d * beat, n, { type: sp.leadType || 'sawtooth', v: 0.22, r: 0.28, voices: sp.leadType === 'triangle' ? 1 : 3, spread: 11, pluck: true });
        });
        if ((sp.crash || []).includes(bar)) hit(ctx, S.nb, fx.input, t0, 2.3, 0.5);
        (sp.sweeps || []).forEach(([at, len]) => { if (bar === at) sweep(ctx, S.nb, fx.input, t0, barLen * len, 350, 8500, 0.4); });
      };
    };
  }

  // "Velvet Line" — disco house, 122 BPM, C minor. Octave bass and off-beat chord stabs.
  const velvet = makeTrack({
    bpm: 122, bass: 'octave', keys: 'stab', stab: [0.5, 1.5, 2.5, 3.5], keysHz: 2600, clapHz: 1400,
    chords: [[60, 63, 67, 70], [56, 60, 63, 67], [53, 56, 60, 63], [55, 59, 62, 65]], roots: [36, 44, 41, 43],
    motif: [[0, 79, 0.5], [1, 75, 0.5], [1.5, 77, 0.5], [2.5, 72, 1], [4, 75, 0.5], [5, 77, 0.5], [5.5, 79, 0.5], [6.5, 82, 1]],
    hat: [0.2, 0, 0.2, 0.1], perc: [0.75, 2.25, 3.75], leadType: 'triangle',
    r: { kick: [[0, 32], [40, 96]], hat: [[4, 32], [40, 92]], ohat: [[8, 32], [40, 88]], clap: [[16, 32], [40, 80]], perc: [[8, 32], [48, 88]],
      bass: [[8, 32], [40, 80]], keys: [[16, 32], [40, 72]], pad: [[24, 40]], lead: [[32, 40], [48, 64]] },
    crash: [16, 40, 72], sweeps: [[36, 4]],
  });

  // "Low Orbit" — tech house, 127 BPM, G minor. Sparse, rolling bass, busy percussion, a late drop at bar 48.
  const orbit = makeTrack({
    bpm: 127, bass: 'roll', keys: 'stab', stab: [1.75, 3.25], keysHz: 1500, keysQ: 4, keysGain: 0.17, bassHz: 300, percHz: 4200, clapHz: 1900, duck: 0.72,
    chords: [[55, 58, 62], [51, 55, 58], [48, 51, 55], [50, 54, 57]], roots: [43, 39, 36, 38],
    motif: [[0, 67, 0.25], [0.75, 67, 0.25], [1.5, 70, 0.5], [3, 65, 0.5], [4, 67, 0.25], [4.75, 67, 0.25], [5.5, 72, 0.5], [7, 70, 0.5]],
    hat: [0.1, 0.16, 0.24, 0.16], perc: [0.5, 1.25, 2.5, 3.25, 3.75],
    r: { kick: [[0, 40], [48, 96]], hat: [[0, 40], [48, 96]], ohat: [[8, 40], [48, 88]], clap: [[16, 40], [48, 80]], perc: [[4, 40], [48, 92]],
      bass: [[16, 40], [48, 80]], keys: [[24, 48], [56, 80]], pad: [[40, 48]], lead: [[48, 80]] },
    crash: [16, 48, 80], sweeps: [[44, 4]], roll: [44, 48],
    keysSweep: [[24, 900], [48, 2600, true]],
  });

  // "Glass Garden" — progressive house, 128 BPM, F sharp minor. A long arp build and a 16-bar breakdown.
  const glass = makeTrack({
    bpm: 128, bass: 'offbeat', keys: 'arp', keysHz: 500, keysQ: 5, keysGain: 0.16,
    chords: [[54, 57, 61, 64], [50, 54, 57, 61], [57, 61, 64, 69], [52, 56, 59, 64]], roots: [42, 38, 45, 40],
    motif: [[0, 73, 1], [1.5, 76, 0.5], [2.5, 78, 1], [4, 81, 1], [5.5, 78, 0.5], [6.5, 76, 1]],
    hat: [0.22, 0.1, 0.2, 0.12], perc: [1.5, 3.5],
    r: { kick: [[0, 32], [48, 96]], hat: [[4, 32], [48, 92]], ohat: [[8, 32], [48, 88]], clap: [[16, 32], [48, 80]], perc: [[16, 32], [48, 80]],
      bass: [[16, 32], [48, 80]], keys: [[8, 80]], pad: [[32, 48], [64, 80]], lead: [[40, 48], [56, 80]] },
    crash: [16, 32, 48, 80], sweeps: [[40, 8]], roll: [46, 48],
    keysSweep: [[8, 500], [32, 2400, true], [48, 3200, true]],
  });

  // "Slow Bloom" — organic house, 114 BPM, D minor. Soft sub bass and a marimba-like pluck; the slow one in the crate.
  const bloom = makeTrack({
    bpm: 114, bass: 'long', keys: 'pluck', keysHz: 2800, keysGain: 0.2, hatHz: 7000, percHz: 2400, clapHz: 1200, duck: 0.5,
    chords: [[62, 65, 69, 72], [58, 62, 65, 69], [55, 58, 62, 65], [57, 60, 64, 67]], roots: [38, 34, 43, 45],
    motif: [[0, 74, 1.5], [2, 77, 0.5], [3, 76, 1], [4, 72, 1.5], [6, 69, 0.5], [7, 72, 1]],
    hat: [0.12, 0.08, 0.2, 0.08], perc: [0.5, 1.75, 2.5, 3.5], leadType: 'triangle',
    r: { kick: [[0, 32], [40, 96]], hat: [[0, 32], [40, 96]], ohat: [[16, 32], [40, 80]], clap: [[16, 32], [40, 72]], perc: [[0, 32], [40, 92]],
      bass: [[8, 32], [40, 80]], keys: [[8, 72]], pad: [[24, 40], [56, 72]], lead: [[32, 40], [48, 72]] },
    crash: [8, 40, 72], sweeps: [[36, 4]],
  });

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

  /* The crate. Key and tempo here are what each track was written in; the analyser still measures the audio itself. */
  const LIBRARY = [
    { id: 'midnight', tonic: 9, title: 'Midnight Drive', genre: 'Deep House', bpm: 124, key: 'Am', num: 8, letter: 'A', bars: 96, build: buildA, mood: '温暖、稳' },
    { id: 'neon', tonic: 4, title: 'Neon Tide', genre: 'Melodic Techno', bpm: 126, key: 'Em', num: 9, letter: 'A', bars: 96, build: buildB, mood: '有推进感' },
    { id: 'velvet', tonic: 0, title: 'Velvet Line', genre: 'Disco House', bpm: 122, key: 'Cm', num: 5, letter: 'A', bars: 96, build: velvet, mood: '律动、明亮' },
    { id: 'orbit', tonic: 7, title: 'Low Orbit', genre: 'Tech House', bpm: 127, key: 'Gm', num: 6, letter: 'A', bars: 96, build: orbit, mood: '干、硬、鼓多' },
    { id: 'glass', tonic: 6, title: 'Glass Garden', genre: 'Progressive House', bpm: 128, key: 'F♯m', num: 11, letter: 'A', bars: 96, build: glass, mood: '长铺垫、大间奏' },
    { id: 'bloom', tonic: 2, title: 'Slow Bloom', genre: 'Organic House', bpm: 114, key: 'Dm', num: 7, letter: 'A', bars: 96, build: bloom, mood: '慢、松弛' },
  ];
  LIBRARY.forEach(t => {
    t.artist = `Segue 曲库 · ${t.genre}`;
    t.camelot = t.num + t.letter;
    t.duration = t.bars * 240 / t.bpm;
    t.render = () => render(t.build, t.bpm, t.bars);
  });
  const DEMOS = { A: LIBRARY[0], B: LIBRARY[1] };
  return { DEMOS, LIBRARY };
})();
