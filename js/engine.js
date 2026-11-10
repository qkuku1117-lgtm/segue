/* Segue · audio engine
 * Two decks into a two-channel DJ mixer: 3-band EQ with kills, one-knob
 * filter (left = low-pass, right = high-pass), post-fader beat-synced echo,
 * channel faders, crossfader, limiter. Positions are tracked in track
 * seconds so tempo changes never lose the beat grid. */
const Engine = (() => {
  let ctx = null, masterIn, masterAn, echoDelay, echoFb, outGain, volume = 1;
  const MUTED = /[?&]mute\b/.test(location.search);
  const decks = {};
  const CTRL_DEFAULTS = { fader: 1, low: 0.5, mid: 0.5, high: 0.5, filter: 0, echo: 0 };

  function context() {
    if (!ctx) build();
    return ctx;
  }
  // the listener's volume: after the meters, so scoring and level displays never depend on it
  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (outGain && !MUTED) outGain.gain.setTargetAtTime(volume, ctx.currentTime, 0.02);
  }
  function resume() { context(); if (ctx.state !== 'running') ctx.resume(); }

  function bq(type, freq, q = 0.7) {
    const n = ctx.createBiquadFilter();
    n.type = type; n.frequency.value = freq; n.Q.value = q;
    return n;
  }

  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    masterIn = ctx.createGain();
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -4; lim.knee.value = 2; lim.ratio.value = 12; lim.attack.value = 0.002; lim.release.value = 0.12;
    masterAn = ctx.createAnalyser(); masterAn.fftSize = 2048;
    // ?mute keeps everything running (meters, scoring) but sends nothing to the speakers: for silent testing
    outGain = ctx.createGain();
    outGain.gain.value = MUTED ? 0 : volume;
    masterIn.connect(lim).connect(masterAn).connect(outGain).connect(ctx.destination);
    // echo bus: post-fader sends land here, the tail rings on after a fader cut
    const echoIn = ctx.createGain();
    echoDelay = ctx.createDelay(4); echoDelay.delayTime.value = 0.36;
    echoFb = ctx.createGain(); echoFb.gain.value = 0.55;
    const tone = bq('bandpass', 1400, 0.5), ret = ctx.createGain(); ret.gain.value = 0.85;
    echoIn.connect(echoDelay); echoDelay.connect(tone).connect(echoFb).connect(echoDelay);
    tone.connect(ret).connect(masterIn);
    ['A', 'B'].forEach(id => { decks[id] = makeDeck(id, echoIn); });
  }

  function makeDeck(id, echoIn) {
    const d = {
      id, buffer: null, an: null, src: null, playing: false, offset: 0, t0: 0,
      tempo: 0, bend: 0, ctrl: { ...CTRL_DEFAULTS, fader: id === 'A' ? 1 : 0 }, xf: 1,
    };
    d.trim = ctx.createGain();
    d.low = bq('lowshelf', 220); d.mid = bq('peaking', 1000, 0.8); d.high = bq('highshelf', 3200);
    d.hpf = bq('highpass', 20, 1); d.lpf = bq('lowpass', 20000, 1);
    d.fader = ctx.createGain(); d.xfGain = ctx.createGain(); d.send = ctx.createGain(); d.send.gain.value = 0;
    d.meter = ctx.createAnalyser(); d.meter.fftSize = 1024;
    d.trim.connect(d.low).connect(d.mid).connect(d.high).connect(d.hpf).connect(d.lpf).connect(d.fader).connect(d.xfGain).connect(masterIn);
    d.fader.connect(d.send).connect(echoIn);
    d.fader.connect(d.meter);
    applyAll(d);
    return d;
  }

  // ---- control laws (shared with the scoring model) ----
  const eqDb = v => v >= 0.5 ? (v - 0.5) / 0.5 * 6 : -40 * Math.pow((0.5 - v) / 0.5, 1.3);
  const eqLin = v => Math.pow(10, eqDb(v) / 20);
  const faderGain = v => v * v;
  const lpfHz = f => f < -0.02 ? 20000 * Math.pow(160 / 20000, -f) : 20000;
  const hpfHz = f => f > 0.02 ? 20 * Math.pow(4000 / 20, f) : 20;
  // how much of a deck's sub-bass survives the filter knob
  const filterLow = f => f > 0 ? Math.max(0, 1 - f / 0.35) : 1;
  const xfGains = x => [Math.min(1, (1 - x) * 2), Math.min(1, x * 2)];

  function set(param, v) { param.setTargetAtTime(v, ctx.currentTime, 0.012); }

  function applyAll(d) {
    const c = d.ctrl;
    set(d.low.gain, eqDb(c.low)); set(d.mid.gain, eqDb(c.mid)); set(d.high.gain, eqDb(c.high));
    set(d.lpf.frequency, lpfHz(c.filter)); set(d.hpf.frequency, hpfHz(c.filter));
    set(d.fader.gain, faderGain(c.fader)); set(d.send.gain, c.echo * 0.9);
    set(d.xfGain.gain, d.xf);
  }

  function setCtrl(id, name, v) {
    const d = decks[id];
    d.ctrl[name] = v;
    if (!ctx) return;
    if (name === 'low') set(d.low.gain, eqDb(v));
    else if (name === 'mid') set(d.mid.gain, eqDb(v));
    else if (name === 'high') set(d.high.gain, eqDb(v));
    else if (name === 'filter') { set(d.lpf.frequency, lpfHz(v)); set(d.hpf.frequency, hpfHz(v)); }
    else if (name === 'fader') set(d.fader.gain, faderGain(v));
    else if (name === 'echo') set(d.send.gain, v * 0.9);
  }

  function setCrossfader(x) {
    const [a, b] = xfGains(x);
    decks.A.xf = a; decks.B.xf = b;
    if (ctx) { set(decks.A.xfGain.gain, a); set(decks.B.xfGain.gain, b); }
  }

  // ---- transport ----
  const rate = d => (1 + d.tempo) * (1 + d.bend);
  function pos(d) {
    if (!d.playing) return d.offset;
    const now = ctx.currentTime;
    return now < d.t0 ? d.offset : d.offset + (now - d.t0) * rate(d);
  }
  function load(id, buffer, an) {
    const d = decks[id] || (context(), decks[id]);
    stop(d);
    d.buffer = buffer; d.an = an; d.offset = 0; d.tempo = 0; d.bend = 0;
  }
  function play(d, when) {
    if (!d.buffer || d.playing) return;
    const t = Math.max(when ?? ctx.currentTime, ctx.currentTime);
    const src = ctx.createBufferSource();
    src.buffer = d.buffer;
    src.playbackRate.value = rate(d);
    src.connect(d.trim);
    src.start(t, Math.max(0, d.offset));
    src.onended = () => { if (d.src === src) { d.offset = Math.min(pos(d), d.buffer.duration); d.playing = false; d.src = null; } };
    d.src = src; d.t0 = t; d.playing = true;
    updateEcho();
  }
  function stop(d) {
    if (!d.playing) return;
    d.offset = pos(d);
    const s = d.src; d.src = null; d.playing = false;
    try { s.stop(); } catch (e) { /* already ended */ }
  }
  function seek(d, sec) {
    const was = d.playing;
    stop(d);
    d.offset = Math.max(0, Math.min(sec, d.buffer ? d.buffer.duration - 0.05 : 0));
    if (was) play(d);
  }
  function retime(d) {
    if (!d.playing) return;
    const now = ctx.currentTime;
    if (now >= d.t0) { d.offset = pos(d); d.t0 = now; }
    d.src.playbackRate.setValueAtTime(rate(d), now);
    updateEcho();
  }
  function setTempo(d, t) { d.tempo = t; retime(d); }
  function setBend(d, b) { d.bend = b; retime(d); }

  const bpmNow = d => d.an ? d.an.bpm * rate(d) : 0;
  // fractional beat index of the deck's current position on its own grid
  const beatPos = d => d.an ? (pos(d) - d.an.down0) / d.an.beat : 0;
  // context time at which the deck reaches a given track second
  const ctxTimeOf = (d, sec) => ctx.currentTime + (sec - pos(d)) / rate(d);

  // Quantized start: the deck starts on the master's next beat.
  function playQuantized(d, master) {
    if (!master.playing || !master.an || !d.an) { play(d); return 0; }
    const bp = beatPos(master), next = Math.ceil(bp + 0.08);
    const sec = master.an.down0 + next * master.an.beat;
    // snap the incoming deck's cue to its own nearest beat
    const b = Math.round((d.offset - d.an.down0) / d.an.beat);
    d.offset = d.an.down0 + b * d.an.beat;
    play(d, ctxTimeOf(master, sec));
    return next;
  }

  // Match tempo to the master, and line up the beat phase if both are running.
  function sync(d, master) {
    if (!d.an || !master.an) return;
    d.tempo = bpmNow(master) / d.an.bpm - 1;
    d.bend = 0;
    retime(d);
    if (d.playing && master.playing && ctx.currentTime >= d.t0) {
      const fm = beatPos(master), fd = beatPos(d);
      let diff = (fm - Math.floor(fm)) - (fd - Math.floor(fd));
      if (diff > 0.5) diff -= 1; if (diff < -0.5) diff += 1;
      if (Math.abs(diff) > 0.01) seek(d, pos(d) + diff * d.an.beat);
    }
  }

  function updateEcho() {
    const m = decks.A.playing ? decks.A : decks.B;
    if (m && m.an) echoDelay.delayTime.setTargetAtTime(Math.min(3.9, m.an.beat * 0.75 / rate(m)), ctx.currentTime, 0.05);
  }

  // beat phase error between decks in milliseconds (positive: B is late)
  function phaseErrorMs() {
    const a = decks.A, b = decks.B;
    if (!a.playing || !b.playing || !a.an || !b.an || ctx.currentTime < b.t0) return null;
    const fa = beatPos(a), fb = beatPos(b);
    let diff = (fa - Math.floor(fa)) - (fb - Math.floor(fb));
    if (diff > 0.5) diff -= 1; if (diff < -0.5) diff += 1;
    return diff * (a.an.beat / rate(a)) * 1000;
  }

  // ---- model-side estimates used for coaching and scoring ----
  function deckLowShare(d) {
    if (!d.playing || !d.an || ctx.currentTime < d.t0) return 0;
    // per-bar low-end content keeps the estimate steady between kick hits
    const c = d.ctrl, content = d.an.barLow[Math.floor(d.an.barAt(pos(d)))] ?? 0;
    return faderGain(c.fader) * d.xf * Math.min(1.4, eqLin(c.low)) * filterLow(c.filter) * content;
  }
  function deckLevel(d) {
    if (!d.playing || ctx.currentTime < d.t0) return 0;
    const c = d.ctrl;
    const eq = 0.4 * Math.min(1.4, eqLin(c.low)) + 0.35 * Math.min(1.4, eqLin(c.mid)) + 0.25 * Math.min(1.4, eqLin(c.high));
    const filt = c.filter < -0.02 ? 1 - Math.abs(c.filter) * 0.55 : c.filter > 0.02 ? 1 - c.filter * 0.6 : 1;
    return faderGain(c.fader) * d.xf * eq * filt;
  }
  function meterLevel(d) {
    const buf = new Float32Array(d.meter.fftSize);
    d.meter.getFloatTimeDomainData(buf);
    let s = 0; for (let i = 0; i < buf.length; i += 2) s += buf[i] * buf[i];
    return Math.sqrt(s / (buf.length / 2));
  }
  function spectrum(out) { masterAn.getByteFrequencyData(out); return out; }

  return {
    context, resume, setVolume, decks, CTRL_DEFAULTS, load, play, stop, seek, setTempo, setBend, setCtrl, setCrossfader,
    playQuantized, sync, pos, rate, bpmNow, beatPos, phaseErrorMs, deckLowShare, deckLevel, meterLevel, spectrum,
    get now() { return ctx ? ctx.currentTime : 0; }, get analyser() { return masterAn; },
    ctxTimeOf, eqLin, eqDb, lpfHz, hpfHz,
  };
})();
