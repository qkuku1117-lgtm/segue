/* Segue · interface
 * Four views on one page: tracks → AI plans → practice console → review. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const C = {};
  const readColors = () => ['ink', 'card', 'booth', 'booth-2', 'rail', 'text', 'dim', 'faint', 'deck-a', 'deck-b', 'coach', 'on-accent', 'warn', 'hot', 'sec1', 'sec2', 'sec3', 'sec4', 'st1', 'st2', 'st3', 'st4']
    .forEach(k => { C[k] = getComputedStyle(document.documentElement).getPropertyValue('--' + k).trim(); });
  const deckColor = id => id === 'A' ? C['deck-a'] : C['deck-b'];
  const FINE = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const FONT = '-apple-system, BlinkMacSystemFont, Helvetica Neue, PingFang SC, sans-serif';

  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'style') e.style.cssText = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (v != null && v !== false) e.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(k));
    return e;
  }
  function fit(cv) {
    const dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth, hh = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(hh * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(hh * dpr); }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { g, w, h: hh };
  }
  const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const alpha = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  let toastTimer;
  function toast(msg) {
    let t = $('.toast');
    if (!t) {
      t = h('div', { class: 'toast', role: 'status' });
      // hovering holds the message; leaving gives it a moment before it goes
      t.addEventListener('mouseenter', () => clearTimeout(toastTimer));
      t.addEventListener('mouseleave', () => { toastTimer = setTimeout(() => t.classList.remove('show'), 1500); });
      document.body.append(t);
    }
    t.textContent = msg;
    requestAnimationFrame(() => t.classList.add('show'));
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3600);
  }

  const S = {
    view: 'tracks', tracks: { A: null, B: null }, planset: null, aiPlans: null, plan: null,
    mode: 'guide', session: null, result: null, preview: null, cues: { A: 0, B: 0 }, chat: [], userFiles: [], drill: null, target: 'A',
  };
  const SEC_LABEL = { intro: '前奏', verse: '主歌', pre: '预副歌', chorus: '副歌', drop: '高潮', break: '间奏', outro: '尾奏' };
  const secTier = type => type === 'drop' ? 1 : type === 'chorus' || type === 'pre' ? 2 : type === 'verse' || type === 'break' ? 3 : 4;
  const secTone = type => { const k = secTier(type); return [C['sec' + k], C['st' + k]]; };
  /* An instruction is drawn, not described: the deck, the control in the state it should end up in, one word. */
  const ICON = {
    knob: v => { const a = (-135 + 270 * v) * Math.PI / 180, s = Math.sin(a), c = Math.cos(a); return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"/><line x1="${(12 + 3 * s).toFixed(1)}" y1="${(12 - 3 * c).toFixed(1)}" x2="${(12 + 7.5 * s).toFixed(1)}" y2="${(12 - 7.5 * c).toFixed(1)}" stroke="var(--ink)" stroke-width="2.4" stroke-linecap="round"/></svg>`; },
    fader: v => `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="10.75" y="3" width="2.5" height="18" rx="1.25" fill="currentColor" opacity=".28"/><rect x="6.5" y="${(3 + (1 - v) * 14).toFixed(1)}" width="11" height="4" rx="1.5" fill="currentColor"/></svg>`,
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5.8v12.4l9.6-6.2z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/></svg>',
    note: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 17.5V6l10-2v11.5"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="15.5" r="2.5"/></svg>',
    upload: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></svg>',
    chev: d => `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d < 0 ? 'm15 5-7 7 7 7' : 'm9 5 7 7-7 7'}"/></svg>`,
    stop: '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="3" fill="currentColor"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>',
    sync: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12a7 7 0 0 1 12-4.9L19 9M19 4.5V9h-4.5M19 12a7 7 0 0 1-12 4.9L5 15M5 19.5V15h4.5"/></svg>',
  };
  const CTRL_SHORT = { fader: '推子', low: 'LOW', mid: 'MID', high: 'HIGH', filter: 'FILTER', echo: 'ECHO', play: 'PLAY', sync: 'SYNC' };
  function verb(a) {
    const c = a.ctrl, to = a.to;
    if (c === 'play' || c === 'sync') return '';
    if (c === 'fader') return to >= 0.95 ? '推满' : to <= 0.05 ? '拉下' : `${Math.round(to * 100)}%`;
    if (c === 'filter') return Math.abs(to) < 0.02 ? '回中' : to < 0 ? '低通' : '高通';
    if (c === 'echo') return to > 0 ? '打开' : '关闭';
    return to <= 0.02 ? '关' : Math.abs(to - 0.5) < 0.02 ? '回中' : to < 0.5 ? '调低' : '调高';
  }
  function ins(a, mini) {
    const [mn, mx] = RANGES[a.ctrl] || [0, 1];
    const icon = a.ctrl === 'play' ? ICON.play : a.ctrl === 'sync' ? ICON.sync : a.ctrl === 'fader' ? ICON.fader(a.to) : ICON.knob((a.to - mn) / (mx - mn));
    const v = verb(a);
    return `<span class="ins${mini ? ' mini' : ''}" title="${a.label || ''}"><b class="dk dk-${a.deck}">${TAG[a.deck]}</b><i class="ic">${icon}</i><span class="ins-k">${CTRL_SHORT[a.ctrl]}</span>${v ? `<span class="ins-v">${v}</span>` : ''}${!mini && a.dur ? `<span class="ins-d">${a.dur} 小节</span>` : ''}</span>`;
  }

  function capsule(g, x, y, w, h, r) { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, Math.min(r, h / 2, w / 2)); else g.rect(x, y, w, h); }

  /* Song structure as a row of rounded capsules, one per section, placed by a time → x mapping.
     opts: w (canvas width), r (corner), past (x before which it is dimmed), alpha, sticky labels, tags per section. */
  function structure(g, an, X, y, h, o) {
    an.sections.forEach((s, si) => {
      const xa = X(an.barTime(s.start)) + 1.5, xb = X(Math.min(an.duration, an.barTime(s.end))) - 1.5;
      if (xb < 0 || xa > o.w || xb - xa < 2) return;
      const [fill, ink] = secTone(s.type);
      g.globalAlpha = o.alpha ?? 1;
      g.fillStyle = fill; capsule(g, xa, y, xb - xa, h, o.r); g.fill();
      if (o.hover === si) { g.strokeStyle = C.coach; g.lineWidth = 2; capsule(g, xa + 1, y + 1, xb - xa - 2, h - 2, o.r - 1); g.stroke(); }
      if (o.past != null && o.past > xa) {
        g.save(); capsule(g, xa, y, xb - xa, h, o.r); g.clip();
        g.fillStyle = alpha(C.ink, 0.5); g.fillRect(xa, y, Math.min(o.past, xb) - xa, h); g.restore();
      }
      g.globalAlpha = 1;
      const name = SEC_LABEL[s.type] || s.type, sub = `${s.end - s.start} 小节`;
      g.font = `600 ${o.big ? 13 : 12}px ${FONT}`;
      const tw = g.measureText(name).width;
      if (xb - xa < tw + 16) return;
      // labels stick to the left edge of the view while their section scrolls past
      const lx = o.sticky ? Math.min(Math.max(xa + 10, o.sticky), xb - tw - 10) : xa + 10;
      g.fillStyle = ink; g.globalAlpha = (o.alpha ?? 1) * (o.past != null && lx < o.past ? 0.6 : 1);
      const twoLines = h >= 40 && !o.oneLine;
      g.fillText(name, lx, twoLines ? y + h / 2 - 2 : y + h / 2 + 4);
      if (twoLines) {
        g.font = `500 11px ${FONT}`; g.globalAlpha *= 0.72;
        const extra = o.tags && o.tags.length ? o.tags.join(' · ') : sub;
        if (xb - lx > g.measureText(extra).width + 14) g.fillText(extra, lx, y + h / 2 + 13);
      }
      g.globalAlpha = 1;
    });
  }

  /* ================= controls ================= */
  const RANGES = { fader: [0, 1, 1], low: [0, 1, 0.5], mid: [0, 1, 0.5], high: [0, 1, 0.5], filter: [-1, 1, 0], echo: [0, 1, 0], tempo: [-0.08, 0.08, 0], xf: [0, 1, 0.5] };
  const BIPOLAR = new Set(['low', 'mid', 'high', 'filter', 'tempo']);
  const widgets = {};
  const pt = (r, a) => [r * Math.sin(a * Math.PI / 180), -r * Math.cos(a * Math.PI / 180)];
  function arc(r, a0, a1) {
    if (Math.abs(a1 - a0) < 0.5) return '';
    const [x0, y0] = pt(r, a0), [x1, y1] = pt(r, a1);
    return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0} ${a1 > a0 ? 1 : 0} ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }

  class Ctl {
    constructor(deck, ctrl, kind, label) {
      const [min, max, def] = RANGES[ctrl];
      Object.assign(this, { deck, ctrl, kind, min, max, def, value: ctrl === 'fader' && deck === 'B' ? 0 : def, ghost: null, active: false });
      this.el = h('div', { class: 'ctl ctl-' + kind });
      const aria = { role: 'slider', tabindex: 0, 'aria-label': `${deck === 'X' ? '' : ROLE[deck] + ' '}${label}`, 'aria-valuemin': min, 'aria-valuemax': max };
      if (kind === 'knob') {
        this.face = h('div', { class: 'knob', ...aria });
        this.face.innerHTML = `<svg viewBox="-26 -26 52 52"><path class="trk" d="${arc(23.5, -135, 135)}"/><path class="val"/><circle class="cap" r="17"/><line class="ptr" x1="0" y1="-6" x2="0" y2="-13"/><circle class="gdot" r="3" cx="0" cy="-23.5" style="display:none"/></svg>`;
        this.el.append(this.face, h('span', { class: 'lab' }, label));
      } else {
        this.face = h('div', { class: kind, ...aria }, h('div', { class: 'groove' }), h('div', { class: 'ghost' }), h('div', { class: 'cap' }));
        this.el.append(this.face);
      }
      this.tip = h('span', { class: 'tip', 'aria-hidden': 'true' });
      this.el.append(this.tip);
      this.bind();
      this.render();
      widgets[`${deck}.${ctrl}`] = this;
    }
    norm(v = this.value) { return (v - this.min) / (this.max - this.min); }
    bind() {
      const f = this.face;
      let startY = 0, startV = 0, rect = null;
      const fromPointer = e => {
        if (this.kind === 'knob') return startV + (startY - e.clientY) / 150 * (this.max - this.min) * (e.shiftKey ? 0.25 : 1);
        if (this.kind === 'vf') return this.max - clamp((e.clientY - rect.top - 16) / (rect.height - 32)) * (this.max - this.min);
        return this.min + clamp((e.clientX - rect.left - 10) / (rect.width - 20)) * (this.max - this.min);
      };
      f.addEventListener('pointerdown', e => {
        e.preventDefault();
        cancelAnimationFrame(this.tween);
        this.el.classList.add('dragging');
        f.setPointerCapture(e.pointerId);
        f.focus({ preventScroll: true });
        startY = e.clientY; startV = this.value; rect = f.getBoundingClientRect();
        if (this.kind !== 'knob') this.input(fromPointer(e));
        const move = ev => this.input(fromPointer(ev));
        const up = () => { this.el.classList.remove('dragging'); f.removeEventListener('pointermove', move); f.removeEventListener('pointerup', up); f.removeEventListener('pointercancel', up); };
        f.addEventListener('pointermove', move); f.addEventListener('pointerup', up); f.addEventListener('pointercancel', up);
      });
      f.addEventListener('dblclick', () => this.glide(this.def));
      f.addEventListener('wheel', e => { if (document.activeElement !== f) return; e.preventDefault(); this.input(this.value - Math.sign(e.deltaY) * 0.03 * (this.max - this.min)); }, { passive: false });
      f.addEventListener('keydown', e => {
        const step = (this.max - this.min) * (e.shiftKey ? 0.1 : 0.025);
        const k = { ArrowUp: step, ArrowRight: step, ArrowDown: -step, ArrowLeft: -step, PageUp: step * 4, PageDown: -step * 4 }[e.key];
        if (k != null) { e.preventDefault(); this.input(this.value + k); }
        else if (e.key === 'Home') { e.preventDefault(); this.input(this.min); }
        else if (e.key === 'End') { e.preventDefault(); this.input(this.max); }
      });
    }
    input(v) {
      v = clamp(v, this.min, this.max);
      if (BIPOLAR.has(this.ctrl) && Math.abs(v - this.def) < (this.max - this.min) * 0.015) v = this.def;
      applyCtrl(this.deck, this.ctrl, v, 'user');
    }
    // double-click reset: a short critically damped glide, interrupted by any grab
    glide(target) {
      cancelAnimationFrame(this.tween);
      const from = this.value, t0 = performance.now(), dur = 300;
      const step = now => {
        const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        this.input(from + (target - from) * e);
        if (k < 1) this.tween = requestAnimationFrame(step);
      };
      this.tween = requestAnimationFrame(step);
    }
    readout() {
      const v = this.value, c = this.ctrl;
      if (c === 'low' || c === 'mid' || c === 'high') { const db = Engine.eqDb(v); return v < 0.02 ? 'KILL' : `${db > 0 ? '+' : ''}${db.toFixed(1)} dB`; }
      if (c === 'filter') { if (Math.abs(v) < 0.02) return 'OFF'; const hz = v < 0 ? Engine.lpfHz(v) : Engine.hpfHz(v); return `${v < 0 ? 'LPF' : 'HPF'} ${hz >= 1000 ? (hz / 1000).toFixed(1) + 'k' : Math.round(hz)}`; }
      if (c === 'tempo') return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;
      if (c === 'xf') return Math.abs(v - 0.5) < 0.01 ? 'CENTER' : `前 ${Math.round(Math.min(1, (1 - v) * 2) * 100)} · 后 ${Math.round(Math.min(1, v * 2) * 100)}`;
      return `${Math.round(v * 100)}%`;
    }
    set(v) {
      if (Math.abs(v - this.value) < 1e-4) return;
      this.value = v;
      this.render();
    }
    setGhost(g, active) {
      const changed = (g == null) !== (this.ghost == null) || (g != null && Math.abs(g - this.ghost) > 0.004) || active !== this.active;
      if (!changed) return;
      this.ghost = g; this.active = active;
      this.el.classList.toggle('active', !!active);
      this.render();
    }
    render() {
      const n = this.norm();
      this.face.setAttribute('aria-valuenow', this.value.toFixed(2));
      this.face.setAttribute('aria-valuetext', this.readout());
      if (this.tip) this.tip.textContent = this.readout();
      if (this.kind === 'knob') {
        const a = -135 + 270 * n, svg = this.face.firstChild;
        svg.querySelector('.ptr').setAttribute('transform', `rotate(${a})`);
        svg.querySelector('.val').setAttribute('d', BIPOLAR.has(this.ctrl) ? arc(23.5, Math.min(0, a), Math.max(0, a)) : arc(23.5, -135, a));
        const gd = svg.querySelector('.gdot');
        if (this.ghost == null) gd.style.display = 'none';
        else {
          const [x, y] = pt(23.5, -135 + 270 * this.norm(this.ghost));
          gd.style.display = ''; gd.setAttribute('cx', x.toFixed(2)); gd.setAttribute('cy', y.toFixed(2));
        }
      } else {
        const cap = this.face.querySelector('.cap'), gh = this.face.querySelector('.ghost');
        const inset = this.kind === 'vf' ? 16 : 10, at = f => `calc(${inset}px + ${f * 100}% - ${f * 2 * inset}px)`;
        if (this.kind === 'vf') {
          cap.style.top = at(1 - n);
          if (this.ghost != null) gh.style.top = at(1 - this.norm(this.ghost));
        } else cap.style.left = at(n);
        gh.classList.toggle('on', this.ghost != null);
      }
    }
  }

  function applyCtrl(deck, ctrl, v, src) {
    if (ctrl === 'xf') Engine.setCrossfader(v);
    else if (ctrl === 'tempo') {
      Engine.setTempo(Engine.decks[deck], v);
      const other = Engine.decks[deck === 'A' ? 'B' : 'A'];
      // a synced partner follows the master's tempo
      if (deck === 'A' && Engine.decks.B.synced && other.an) { Engine.sync(other, Engine.decks.A); widgets['B.tempo']?.set(other.tempo); }
      if (src === 'user') Engine.decks[deck].synced = false;
    } else Engine.setCtrl(deck, ctrl, v);
    widgets[`${deck}.${ctrl}`]?.set(v);
    if (src === 'user' && S.session && S.session.mode === 'demo') takeOver();
  }

  function resetMixer() {
    Engine.context();
    for (const id of ['A', 'B']) {
      for (const [k, v] of Object.entries(Planner.DEFAULTS[id])) applyCtrl(id, k, v, 'reset');
      const d = Engine.decks[id];
      d.synced = false; d.bend = 0;
      applyCtrl(id, 'tempo', 0, 'reset');
    }
    applyCtrl('X', 'xf', 0.5, 'reset');
  }
  function stopAll() { if (!Engine.decks.A) return; Engine.stop(Engine.decks.A); Engine.stop(Engine.decks.B); }

  /* A record with its tonearm is each deck's play control: the label carries the deck letter and turns at 33⅓ rpm
     with the audio, and the arm sits on the groove the song has reached. */
  function vinyl(id, o, label, plain) {
    const el = h('button', { class: `vinyl vy-${id}`, 'aria-label': label, title: label, disabled: !o },
      h('span', { class: 'disc' }, h('span', { class: 'lbl' }, plain ? '' : id)), h('span', { class: 'arm', 'aria-hidden': 'true' }, h('i')));
    if (!o) return el;
    // a short press is a tap; anything that turns the record more than a few degrees is a hand on the platter
    let g = null;
    const done = cancelled => {
      if (!g) return;
      const was = g; g = null;
      clearTimeout(was.idle); el.classList.remove('held');
      if (was.turned > 6 || cancelled) { if (o.end) o.end(); } else o.tap();
    };
    el.addEventListener('pointerdown', e => {
      const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const ang = ev => Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI;
      g = { ang, a: ang(e), t: e.timeStamp, turned: 0 };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', e => {
      if (!g) return;
      let da = g.ang(e) - g.a;
      if (da > 180) da -= 360; else if (da < -180) da += 360;
      const dt = Math.max(1, e.timeStamp - g.t);
      g.a += da; g.t = e.timeStamp; g.turned += Math.abs(da);
      if (g.turned <= 6 || !o.turn) return;
      el.classList.add('held');
      o.turn(da, da / dt * 1000);
      // a hand that holds still stops pushing
      clearTimeout(g.idle); g.idle = setTimeout(() => { if (g) o.turn(0, 0); }, 90);
    });
    el.addEventListener('pointerup', () => done(false));
    el.addEventListener('pointercancel', () => done(true));
    el.addEventListener('click', e => { if (e.detail === 0) o.tap(); });
    return el;
  }
  function spinVinyl(el, sec, playing, progress) {
    if (!el) return;
    el.firstChild.style.transform = `rotate(${((sec * 200) % 360).toFixed(1)}deg)`;
    const arm = playing ? (18 + 20 * clamp(progress)).toFixed(1) : '0';
    if (el._arm !== arm) { el._arm = arm; el.style.setProperty('--arm', arm + 'deg'); el.classList.toggle('on', playing); el.setAttribute('aria-pressed', playing); }
  }

  /* ================= view 1 · tracks ================= */
  // nothing in the interface calls a song by a letter: they are the one before and the one after the mix,
  // and a round badge carries the single character
  const ROLE = { A: '前一首', B: '后一首' }, TAG = { A: '前', B: '后' };
  const dk = (d, cls) => h('i', { class: `dk dk-${d}` + (cls ? ' ' + cls : '') }, TAG[d]);
  const roleTag = (d, sm) => h('i', { class: `role role-${d}` + (sm ? ' sm' : '') }, ROLE[d]);
  function trackCard(id) {
    const card = $('#track' + id), t = S.tracks[id];
    card.innerHTML = '';
    const ready = t && t.status === 'ready', an = ready ? t.an : null;
    card.append(h('div', { class: 'track-head' },
      vinyl(id, ready ? {
        tap: () => togglePreview(id),
        // turning the record runs through the song: one turn is a few seconds
        turn: da => {
          const nt = clamp((S.scrub && S.scrub.id === id ? S.scrub.t : t.head) + da / 200 * 4, 0, an.duration - 0.1);
          S.scrub = { id, t: nt };
          setHead(id, nt);
          spinVinyl($(`#track${id} .vinyl`), nt, S.preview === id, nt / an.duration);
        },
        end: () => {
          const sc = S.scrub;
          S.scrub = null;
          if (sc && S.preview === id) Engine.seek(Engine.decks[id], sc.t);
        },
      } : null, `试听${t && t.title ? ' ' + t.title : ''}`, true),
      h('div', { class: 'track-info' },
        h('div', { class: 'track-title' }, t && t.title ? t.title : '还没有歌'),
        h('div', { class: 'track-sub' }, ready ? `${an.bpm} BPM · ${an.key.name} · ${an.key.camelot}${t.lib ? ' · ' + libOf(t.lib).genre : t.artist && t.artist !== '你的歌' ? ' · ' + t.artist : ''}` : t ? t.step || '准备中' : '从曲库里挑一首')),
      roleTag(id)));
    if (!ready) {
      if (t && t.error) card.append(h('div', { class: 'loading' }, h('div', { class: 'track-err' }, h('span', {}, t.error), h('button', { class: 'btn sm quiet', onclick: () => loadDemo(id) }, '先用示例曲'))));
      // the loading card has the shape of the finished one, so nothing jumps when the song arrives
      else card.append(h('div', { class: 'strip sk', 'aria-hidden': 'true' }, ...[1.2, 1, 2.2, 0.8, 3, 1.6].map(f => h('i', { style: `flex:${f}` }))),
        h('div', { class: 'track-foot sk', 'aria-hidden': 'true' }, h('i', { class: 'sk-line' })));
      return;
    }
    if (t.head == null) t.head = an.barTime(an.firstDrop ?? 0);
    // the row of capsules is the scrubber: a tap plays the section under the finger, a drag sets the exact spot
    const secs = an.sections.map(sec => {
      const name = SEC_LABEL[sec.type] || sec.type, from = an.barTime(sec.start), to = Math.min(an.duration, an.barTime(sec.end));
      return h('button', { class: `sec s${secTier(sec.type)}`, style: `flex:${(to - from).toFixed(2)} 1 0`, title: name, 'aria-label': `从${name}开始试听`, onclick: e => { if (e.detail === 0) playFrom(id, from); } }, h('span', {}, name));
    });
    const strip = h('div', { class: 'strip', role: 'group', 'aria-label': `${t.title} 段落` }, ...secs, h('div', { class: 'playhead' }));
    card.append(strip);
    bindScrub(strip, id);
    card.append(h('div', { class: 'track-foot' },
      h('span', { class: 'track-time' }, h('span', { 'data-now': '' }), h('small', {}, ` / ${fmtTime(an.duration)}`)),
      h('span', { class: 'track-hint' }, '点唱片试听'),
      h('div', { class: 'grid-fix', title: '第一拍没对上？挪一拍' }, '对拍',
        h('button', { 'aria-label': '小节线左移一拍', onclick: () => nudgeGrid(id, -1), html: ICON.chev(-1) }),
        h('button', { 'aria-label': '小节线右移一拍', onclick: () => nudgeGrid(id, 1), html: ICON.chev(1) }))));
    setHead(id, t.head);
    previewButtons();
  }

  /* The crate: six tracks written for the demo, plus whatever the viewer brings. A row goes onto a deck with one tap. */
  const USER_COVER = '<svg viewBox="0 0 44 44" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 30V13l14-3v17"/><circle cx="13.500" cy="30" r="3.500"/><circle cx="27.500" cy="27" r="3.500"/></svg>';
  let uidSeq = 0;
  function addUserFile(file) {
    const had = S.userFiles.find(u => u.file.name === file.name && u.file.size === file.size);
    if (had) return had;
    const u = { id: 'u' + (++uidSeq), file, title: file.name.replace(/\.[^.]+$/, ''), an: null };
    S.userFiles.push(u);
    return u;
  }
  function crateRows() {
    return [
      ...Synth.LIBRARY.map(L => ({ id: L.id, lib: true, title: L.title, meta: `${L.genre} · ${L.mood}`, bpm: L.bpm, cam: L.camelot, key: L.key, dur: L.duration, cmp: { key: { num: L.num, letter: L.letter }, bpm: L.bpm }, cover: coverSVG(L.id) })),
      ...S.userFiles.map(u => ({ id: u.id, title: u.title, meta: u.credit ? `${u.credit.artist} · ${u.credit.lic}` : u.an ? '你的歌' : '你的歌 · 放上去后分析', bpm: u.an ? u.an.bpm : '—', cam: u.an ? u.an.key.camelot : '—', key: u.an ? u.an.key.name : '', dur: u.an ? u.an.duration : null, cmp: u.an, file: u.file, cover: USER_COVER })),
    ];
  }
  function renderCrate() {
    const box = $('#crateRows'), A = S.tracks.A, B = S.tracks.B;
    const on = (t, r) => !!t && (r.lib ? t.lib === r.id : t.uid === r.id);
    box.innerHTML = '';
    crateRows().forEach(r => {
      const here = { A: on(A, r), B: on(B, r) };
      let fit = '—', good = false;
      if (!here.A && A && A.status === 'ready' && r.cmp) { const v = Analysis.compat(A.an, r.cmp).overall; fit = String(v); good = v >= 80; }
      const where = here.A ? 'A' : here.B ? 'B' : null;
      const row = h('button', { class: 'crate-row' + (where ? ' on' : ''), 'aria-label': `${r.title}${where ? `，${ROLE[where]}` : ''}`, onclick: () => { if (row._dragged) { row._dragged = false; return; } assign(S.target, r); } },
        h('span', { class: 'lib-cover', html: r.cover }),
        h('span', { class: 'lib-main' }, h('b', {}, r.title), h('small', {}, r.meta)),
        h('span', { class: 'c-num' }, String(r.bpm)),
        h('span', { class: 'c-key' }, h('b', {}, r.cam), h('small', {}, r.key)),
        h('span', { class: 'c-dur' }, r.dur ? fmtTime(r.dur) : '—'),
        h('span', { class: 'c-fit' + (good ? ' good' : '') }, fit),
        h('span', { class: 'c-on' }, where ? roleTag(where, true) : null));
      dragRow(row, r);
      box.append(row);
    });
    paintTarget();
  }
  // the record a tapped song goes to; tapping a card or the switch in the crate header changes it
  function setTarget(d) { S.target = d; paintTarget(); }
  function paintTarget() {
    ['A', 'B'].forEach(d => { $('#track' + d).classList.toggle('target', S.target === d); const b = $(`#targetSeg [data-t="${d}"]`); b.classList.toggle('on', S.target === d); b.setAttribute('aria-pressed', S.target === d); });
    pill($('#targetSeg'));
  }
  // with a mouse a row can also be carried onto a record
  function dragRow(row, r) {
    row.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch' || e.button !== 0) return;
      const x0 = e.clientX, y0 = e.clientY;
      let ghost = null, over = null;
      const deckAt = ev => { const el = document.elementFromPoint(ev.clientX, ev.clientY); const c = el && el.closest('.pair .track'); return c ? c.dataset.deck : null; };
      const move = ev => {
        if (!ghost) {
          if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 8) return;
          ghost = h('div', { class: 'drag-ghost', 'aria-hidden': 'true' }, h('span', { class: 'lib-cover', html: r.cover }), h('b', {}, r.title));
          document.body.append(ghost);
          document.body.classList.add('dragging-song');
        }
        ghost.style.transform = `translate(${ev.clientX + 12}px, ${ev.clientY + 12}px)`;
        const d = deckAt(ev);
        if (d !== over) { over = d; ['A', 'B'].forEach(k => $('#track' + k).classList.toggle('drop', k === d)); }
      };
      const up = ev => {
        window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
        if (!ghost) return;
        ghost.remove(); document.body.classList.remove('dragging-song');
        ['A', 'B'].forEach(k => $('#track' + k).classList.remove('drop'));
        row._dragged = true; setTimeout(() => { row._dragged = false; }, 0);
        const d = ev.type === 'pointerup' ? deckAt(ev) : null;
        if (d) { setTarget(d); assign(d, r); }
      };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    });
  }
  function assign(deck, r) {
    const other = deck === 'A' ? 'B' : 'A', on = t => !!t && (r.lib ? t.lib === r.id : t.uid === r.id);
    if (on(S.tracks[deck])) return;
    if (on(S.tracks[other])) {
      const ok = ['A', 'B'].every(k => S.tracks[k] && S.tracks[k].status === 'ready');
      if (ok) swapDecks(); else toast('等两首都准备好，再对调');
      return;
    }
    if (r.lib) loadLib(deck, r.id); else loadFile(deck, r.file, r.id);
  }
  function uploadBtn(id) {
    const input = h('input', { type: 'file', accept: 'audio/*', 'aria-label': `为${ROLE[id]}选择音频文件` });
    input.addEventListener('change', () => { if (input.files[0]) loadFile(id, input.files[0]); });
    return h('label', { class: 'icon-btn file-btn', title: '换一首（也可以直接拖进这张卡片）', 'aria-label': `把${ROLE[id]}换掉`, html: ICON.upload }, input);
  }
  function setHead(id, sec) {
    const t = S.tracks[id], card = $('#track' + id);
    if (!t || !t.an) return;
    t.head = sec;
    const ph = $('.playhead', card), now = $('[data-now]', card);
    if (ph) ph.style.left = `${clamp(sec / t.an.duration) * 100}%`;
    if (now) now.textContent = fmtTime(sec);
  }

  function renderCompat() {
    const box = $('#compat');
    box.innerHTML = '';
    const A = S.tracks.A, B = S.tracks.B;
    const ready = A && A.status === 'ready' && B && B.status === 'ready';
    $('#swapBtn').disabled = !ready;
    if (!ready) {
      const failed = [A, B].some(t => t && t.status === 'error');
      box.append(h('div', { class: 'lead', html: wheelSVG(null, null) }), h('span', { class: 'track-sub' }, failed ? '换一首就能继续' : '分析中…'));
      return;
    }
    const c = Analysis.compat(A.an, B.an);
    const keyCls = c.keyScore >= 0.85 ? '' : c.keyScore >= 0.6 ? 'warn' : 'hot';
    const bpmCls = Math.abs(c.bpmPct) <= 4 ? '' : Math.abs(c.bpmPct) <= 8 ? 'warn' : 'hot';
    box.append(
      h('div', { class: 'lead', title: `Camelot 调性轮盘：${A.an.key.camelot} → ${B.an.key.camelot}` },
        h('span', { html: wheelSVG(A.an.key, B.an.key) }),
        h('div', { class: 'score' }, h('b', {}, String(c.overall)), h('span', {}, '契合度'))),
      h('span', { class: 'sep' }),
      h('div', { class: 'fact' }, h('b', {}, `${A.an.key.camelot} → ${B.an.key.camelot}`), h('small', { class: keyCls }, c.rel)),
      h('div', { class: 'fact', title: `变速带来 ${c.semis >= 0 ? '+' : ''}${c.semis.toFixed(2)} 半音的音高变化` }, h('b', {}, `${A.an.bpm} → ${B.an.bpm}`), h('small', { class: bpmCls }, Math.abs(c.bpmPct) < 0.05 ? '速度一样' : `后一首${c.bpmPct >= 0 ? '加快' : '放慢'} ${Math.abs(c.bpmPct).toFixed(1)}%`)));
  }

  // twelve hours of the Camelot wheel as dots; the two songs are the large ones
  function wheelSVG(ka, kb) {
    const at = (n, r) => { const [x, y] = pt(r, (n % 12) * 30); return [(20 + x).toFixed(1), (20 + y).toFixed(1)]; };
    let out = '<svg viewBox="0 0 40 40" role="img" aria-label="Camelot 调性轮盘">';
    for (let n = 1; n <= 12; n++) {
      const [x, y] = at(n, 16);
      out += `<circle cx="${x}" cy="${y}" r="2" fill="var(--rail)"/>`;
    }
    if (ka) { const [x, y] = at(ka.num, 16); out += `<circle cx="${x}" cy="${y}" r="4" fill="var(--text)"/>`; }
    if (kb) { const [x, y] = at(kb.num, 16); out += `<circle cx="${x}" cy="${y}" r="${ka && ka.num === kb.num ? 2 : 4}" fill="var(--coach)"/>`; }
    return out + '</svg>';
  }

  const loadTok = { A: 0, B: 0 };
  const DECK_KEY = 'segue.decks.v1';
  const savedDecks = () => { try { return JSON.parse(localStorage.getItem(DECK_KEY)) || {}; } catch (e) { return {}; } };
  const libOf = id => Synth.LIBRARY.find(x => x.id === id);
  function loadDemo(id) {
    const other = S.tracks[id === 'A' ? 'B' : 'A'], want = savedDecks()[id];
    const pick = libOf(want) && !(other && other.lib === want) ? libOf(want) : Synth.LIBRARY.find(x => !(other && other.lib === x.id) && x.id === Synth.DEMOS[id].id) || Synth.LIBRARY.find(x => !(other && other.lib === x.id));
    return loadLib(id, pick.id);
  }
  async function loadLib(id, libId) {
    const demo = libOf(libId), tok = ++loadTok[id];
    if (S.preview) stopPreview();
    S.tracks[id] = { status: 'loading', step: '正在生成…', title: demo.title, artist: demo.artist, lib: demo.id };
    trackCard(id); refreshTracksUI();
    try { localStorage.setItem(DECK_KEY, JSON.stringify({ ...savedDecks(), [id]: demo.id })); } catch (e) { /* not kept */ }
    try {
      const buf = await demo.render();
      if (tok !== loadTok[id]) return;
      await setTrack(id, buf, { title: demo.title, artist: demo.artist, source: 'demo', lib: demo.id }, tok);
    } catch (e) {
      if (tok !== loadTok[id]) return;
      S.tracks[id] = { status: 'error', step: '示例曲合成失败', error: '这个浏览器放不了示例曲，换 Chrome 或 Safari，或者上传一首歌。' };
      trackCard(id);
    }
  }
  async function loadFile(id, file, uid) {
    if (S.preview) togglePreview(S.preview);
    if (!uid) uid = addUserFile(file).id;
    const title = file.name.replace(/\.[^.]+$/, ''), tok = ++loadTok[id];
    const own = S.userFiles.find(x => x.id === uid), by = own && own.credit ? own.credit.artist : '你的歌';
    const fail = error => { if (tok !== loadTok[id]) return; S.tracks[id] = { status: 'error', step: '没能用这首歌', title, error, uid }; trackCard(id); refreshTracksUI(); };
    if (file.type && !/^audio\/|^video\/mp4/.test(file.type)) return fail('这不是音频文件。试试 MP3、WAV 或 M4A。');
    if (file.size > 120 * 1024 * 1024) return fail('文件太大了，选一首 120 MB 以内的歌。');
    S.tracks[id] = { status: 'loading', step: '正在读取…', title, artist: by, uid };
    trackCard(id); refreshTracksUI();
    let buf;
    try { buf = await Engine.context().decodeAudioData(await file.arrayBuffer()); }
    catch (e) { return fail('读不了这个文件。试试 MP3、WAV 或 M4A。'); }
    if (tok !== loadTok[id]) return;
    if (buf.duration < 60) return fail('太短了，选一首 1 分钟以上的歌。');
    if (buf.duration > 15 * 60) return fail('太长了，选一首 15 分钟以内的歌。');
    await setTrack(id, buf, { title, artist: by, source: 'user', uid }, tok);
    const u = S.userFiles.find(x => x.id === uid), t = S.tracks[id];
    if (u && t && t.uid === uid && t.status === 'ready') { u.an = t.an; renderCrate(); }
  }
  async function setTrack(id, buffer, meta, tok) {
    if (tok == null) tok = ++loadTok[id];
    S.tracks[id] = { ...meta, status: 'loading', step: '分析中…' };
    trackCard(id);
    let an;
    try { an = await Analysis.analyze(buffer, step => { if (tok !== loadTok[id]) return; S.tracks[id].step = step + '…'; const el = $('#track' + id + ' .track-sub'); if (el) el.textContent = step + '…'; }); }
    catch (e) { an = null; }
    if (tok !== loadTok[id]) return;
    // the plans need room: about 40 bars of A to play out and 16 of B to come in on
    if (!an || an.nBars < 40 || !an.sections.length) {
      S.tracks[id] = { ...meta, status: 'error', step: '没能用这首歌', error: !an ? '这首歌分析失败了，换一首试试。' : '这首歌太短或拍子太乱，换一首节奏稳定的歌。' };
      trackCard(id); refreshTracksUI(); return;
    }
    // a crate track carries the key it was written in, the way a tagged file does; uploads are measured
    if (meta.lib) an.key = Analysis.keyInfo(libOf(meta.lib).tonic, true);
    S.tracks[id] = { ...meta, status: 'ready', buffer, an };
    Engine.load(id, buffer, an);
    trackCard(id);
    refreshTracksUI();
  }
  function nudgeGrid(id, beats) {
    const t = S.tracks[id];
    Analysis.shiftDownbeat(t.an, beats);
    trackCard(id); refreshTracksUI();
    toast(`小节线已${beats > 0 ? '右' : '左'}移一拍`);
  }
  function refreshTracksUI() {
    renderCompat();
    const ready = ['A', 'B'].every(k => S.tracks[k] && S.tracks[k].status === 'ready');
    $('#toPlans').disabled = !ready;
    $('#heroDemo').disabled = !ready;
    $('#heroDemoTxt').textContent = ready ? '听示范' : ['A', 'B'].some(k => S.tracks[k] && S.tracks[k].status === 'error') ? '先换一首' : '准备中…';
    S.drill = null;
    renderCrate();
    // any change to the songs invalidates everything downstream of them
    S.planset = ready ? Planner.make(S.tracks.A.an, S.tracks.B.an) : null;
    S.aiPlans = null; S.plan = null; S.result = null; S.picked = null; S.lastDemo = null;
    S.aiPlansAsked = false; S.aiPlansFailed = false; S.chat = [];
    if (S.view !== 'tracks') go('tracks');
    updateNav();
  }
  function startPreview(id, sec) {
    Engine.resume();
    if (S.preview && S.preview !== id) S.tracks[S.preview].head = Engine.pos(Engine.decks[S.preview]);
    stopAll();
    const d = Engine.decks[id];
    Engine.setCtrl(id, 'fader', 1); Engine.setCrossfader(0.5);
    ['low', 'mid', 'high'].forEach(k => Engine.setCtrl(id, k, 0.5)); Engine.setCtrl(id, 'filter', 0); Engine.setCtrl(id, 'echo', 0);
    Engine.setTempo(d, 0);
    Engine.seek(d, sec);
    Engine.play(d);
    S.preview = id;
    previewButtons();
  }
  function stopPreview() {
    if (S.preview) S.tracks[S.preview].head = Engine.pos(Engine.decks[S.preview]);
    stopAll(); S.preview = null;
    previewButtons();
  }
  function togglePreview(id) {
    if (S.preview === id) { stopPreview(); return; }
    const t = S.tracks[id];
    startPreview(id, t.head < t.an.duration - 1 ? t.head : t.an.barTime(t.an.firstDrop ?? 0));
  }
  // jump within the deck already playing, or start this one; always on a beat
  function playFrom(id, sec) {
    const an = S.tracks[id].an, b = Math.max(0, Math.round((sec - an.down0) / an.beat));
    const t = Math.min(an.duration - 0.1, an.down0 + b * an.beat);
    if (S.preview === id && Engine.decks[id].playing) Engine.seek(Engine.decks[id], t);
    else startPreview(id, t);
    setHead(id, t);
  }
  function previewButtons() {
    ['A', 'B'].forEach(id => { const v = $(`#track${id} .vinyl`), t = S.tracks[id]; if (v && t && t.an) spinVinyl(v, t.head || 0, S.preview === id, (t.head || 0) / t.an.duration); });
  }
  // The structure bar is the scrubber: a tap plays the section under the finger, a drag sets the exact spot.
  function bindScrub(strip, id) {
    let down = null;
    const an = () => S.tracks[id].an;
    const tAt = e => { const r = strip.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width) * an().duration; };
    const secAt = t => an().sections.find(s => t >= an().barTime(s.start) && t < an().barTime(s.end)) || an().sections[an().sections.length - 1] || { start: 0 };
    strip.addEventListener('pointerdown', e => {
      strip.setPointerCapture(e.pointerId);
      down = { x: e.clientX };
    });
    strip.addEventListener('pointermove', e => {
      if (!down) return;
      if (!down.moved && Math.abs(e.clientX - down.x) > 4) down.moved = true;
      if (down.moved) { S.scrub = { id, t: tAt(e) }; setHead(id, S.scrub.t); }
    });
    strip.addEventListener('pointerup', e => {
      if (!down) return;
      const t = tAt(e);
      if (down.moved) playFrom(id, t); else playFrom(id, an().barTime(secAt(t).start));
      down = null; S.scrub = null;
    });
    strip.addEventListener('pointercancel', () => { down = null; S.scrub = null; });
  }
  function swapDecks() {
    const A = S.tracks.A, B = S.tracks.B;
    if (!(A && A.status === 'ready' && B && B.status === 'ready')) return;
    stopPreview();
    S.tracks.A = B; S.tracks.B = A;
    Engine.load('A', B.buffer, B.an); Engine.load('B', A.buffer, A.an);
    trackCard('A'); trackCard('B');
    // each card slides in from the side it came from
    $('#trackA').classList.add('swap-in-r'); $('#trackB').classList.add('swap-in-l');
    const settle = () => { $('#trackA').classList.remove('swap-in-r'); $('#trackB').classList.remove('swap-in-l'); };
    requestAnimationFrame(() => requestAnimationFrame(settle)); setTimeout(settle, 80);
    refreshTracksUI();
    toast(`先放 ${B.title}，再接 ${A.title}`);
  }
  function bindDrop(id) {
    const card = $('#track' + id);
    card.addEventListener('dragover', e => { e.preventDefault(); card.classList.add('drag'); });
    card.addEventListener('dragleave', () => card.classList.remove('drag'));
    card.addEventListener('drop', e => {
      e.preventDefault(); card.classList.remove('drag');
      const f = e.dataTransfer.files[0];
      if (f) loadFile(id, f);
    });
  }

  /* ================= view 2 · plans ================= */
  const PLAN_LINE = { swap: p => `两首叠 ${p.len} 小节，再换低音`, filter: () => '后一首慢慢变亮，前一首慢慢变闷', echo: () => '前一首留个回声，后一首直接进来' };
  const ARROW = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>';
  function renderPlans(enter) {
    const ps = S.planset;
    if (!ps) return;
    const A = S.tracks.A, B = S.tracks.B, ai = S.aiPlans;
    const pickId = ai ? ai.pick : ps.pickId;
    if (!S.picked) S.picked = pickId;
    const pending = Coach.state === 'online' && !ai && !S.aiPlansFailed;
    const pl = $('#pairLine');
    pl.innerHTML = '';
    pl.append(dk('A'), h('b', {}, A.title), h('span', { html: ARROW }), dk('B'), h('b', {}, B.title),
      h('span', {}, `· 契合度 ${ps.compat.overall} ·`), h('button', { class: 'linkbtn', onclick: () => go('tracks') }, '换歌'));
    const box = $('#plans'), hist = loadHist();
    box.innerHTML = '';
    ps.plans.forEach((p, i) => {
      const mine = hist.filter(x => x.p === p.id).map(x => x.s), best = mine.length ? Math.max(...mine) : null;
      box.append(h('button', { class: 'plan' + (enter ? ' pre' : ''), style: `transition-delay:${enter ? i * 70 : 0}ms`, 'data-plan': p.id, onclick: () => paintPick(p.id) },
        h('span', { class: 'plan-head' },
          h('span', {}, h('span', { class: 'plan-name' }, p.name), h('span', { class: 'plan-line' }, PLAN_LINE[p.id](p))),
          h('span', { class: 'fit' }, h('b', {}, String(p.fit)), h('small', { class: p.id === pickId ? 'pick' : '' }, p.id === pickId ? (ai ? 'Claude 推荐' : '推荐') : '适合度'))),
        h('span', { class: 'plan-meta' },
          h('span', {}, `${p.len} 小节`),
          h('span', { class: 'dots', 'aria-label': `难度 ${p.difficulty} / 3` }, ...[1, 2, 3].map(n => h('i', { class: n <= p.difficulty ? 'on' : '' }))),
          h('span', { class: 'best' }, best != null ? `最好 ${best}` : ''))));
    });
    paintPick(S.picked);
    if (enter) { const show = () => $$('.plan.pre', box).forEach(e => e.classList.remove('pre')); requestAnimationFrame(() => requestAnimationFrame(show)); setTimeout(show, 80); setTimeout(() => $$('.plan', box).forEach(e => { e.style.transitionDelay = ''; }), 700); }
    if (pending && !S.aiPlansAsked) {
      S.aiPlansAsked = true;
      const planset = ps;
      Coach.reviewPlans(A, B, ps).then(r => {
        if (S.planset !== planset) return;
        if (r && r.plans) S.aiPlans = r; else S.aiPlansFailed = true;
        if (S.view === 'plans') renderPlans();
      });
    }
  }
  function paintPick(id) {
    S.picked = id;
    $$('.plan').forEach(el => { const on = el.dataset.plan === id; el.classList.toggle('on', on); el.setAttribute('aria-pressed', on); });
    const ps = S.planset, p = ps.plans.find(x => x.id === id), ai = S.aiPlans;
    const copy = (ai && ai.plans && ai.plans[id]) || Coach.fallbackPlanCopy(p);
    const pickId = ai ? ai.pick : ps.pickId, pending = Coach.state === 'online' && !ai && !S.aiPlansFailed;
    $('#barName').textContent = p.name;
    $('#barLine').textContent = PLAN_LINE[p.id](p);
    $('#barMeta').textContent = `${p.len} 小节 · 约 ${Math.round(p.len * 240 / S.tracks.A.an.bpm)} 秒 · ${p.actions.length} 个动作`;
    $('#whoSays').textContent = id !== pickId ? '' : ai ? 'Claude 推荐。' : pending ? 'Claude 在看…' : p.tempoGap ? '速度差得多，推荐这种。' : '推荐。';
    $('#claudeLine').classList.toggle('ai', !!ai);
    $('#barWhy').textContent = copy.why;
    $('#barPit').textContent = copy.pitfall || '';
    const sc = $('#score');
    sc.innerHTML = '';
    sc.append(...buildScore(p));
  }
  // the moment the two songs change hands: where A gives up its bass, or is cut
  const handOf = p => p.actions.find(a => a.deck === 'A' && a.dur === 0 && ((a.ctrl === 'low' && a.to === 0) || (a.ctrl === 'fader' && a.to === 0)));
  /* The score: both songs on one bar ruler, every move of the plan pinned to the bar it happens on.
     The same picture scrolls past on the practice stage and is drawn over in the review. */
  function buildScore(p) {
    const A = S.tracks.A.an, B = S.tracks.B.an;
    const x0 = -8, x1 = p.len + 8, span = x1 - x0, f = b => clamp((b - x0) / span), pc = b => (f(b) * 100).toFixed(3) + '%', wd = (a, b) => ((f(b) - f(a)) * 100).toFixed(3) + '%';
    const lane = (an, toRel, from, to) => an.sections.map(sec => {
      const a = Math.max(from, toRel(sec.start)), b = Math.min(to, toRel(sec.end));
      return b - a > 0.01 ? h('span', { class: `cap s${secTier(sec.type)}`, style: `left:${pc(a)};width:${wd(a, b)}` }, h('span', {}, SEC_LABEL[sec.type] || sec.type)) : null;
    });
    const moves = deck => {
      const acts = p.actions.filter(a => a.deck === deck), merged = new Set(), rows = [];
      // PLAY that lands with another move on the same bar is said in one chip
      const items = acts.filter(a => { if (a.ctrl !== 'play') return true; const mate = acts.find(b => b !== a && b.bar === a.bar); if (mate) merged.add(mate); return !mate; });
      const els = items.map(a => {
        const k = (merged.has(a) ? 'PLAY + ' : '') + CTRL_SHORT[a.ctrl], v = verb(a);
        const est = (34 + 13 * (k.length + v.length + (a.dur ? 4 : 0))) / 1000 * span;
        let r = rows.findIndex(end => end <= a.bar + 0.01);
        if (r < 0) r = rows.length;
        rows[r] = a.bar + Math.max(a.dur, est) + span * 0.01;
        return h('span', { class: 'mv' + (a.dur ? ' span' : ''), title: a.label || '', style: `left:${pc(a.bar)};top:${r * 36}px;${a.dur ? `width:${wd(a.bar, a.bar + a.dur)}` : ''}` }, k, v ? h('b', {}, v) : null, a.dur ? h('i', {}, `${a.dur} 小节`) : null);
      });
      return h('div', { class: 'sc-moves', style: `height:${Math.max(1, rows.length) * 36 - 4}px` }, els);
    };
    const hand = handOf(p), outA = p.actions.filter(a => a.deck === 'A' && a.ctrl === 'fader').map(a => a.bar + a.dur).pop() ?? p.len;
    const ticks = [];
    for (let b = 0; b <= p.len; b += 8) if (!hand || Math.abs(b - hand.bar) > 3) ticks.push(h('span', { class: 'tick', style: `left:${pc(b)}` }, String(b)));
    return [
      h('div', { class: 'sc-over', 'aria-hidden': 'true' }, h('span', { class: 'band', style: `left:${pc(p.playBar)};width:${wd(p.playBar, outA)}` })),
      h('span'), h('div', { class: 'sc-ruler' }, ticks, hand ? h('span', { class: 'hand', style: `left:${pc(hand.bar)}` }, `第 ${hand.bar} 小节 · ${hand.ctrl === 'low' ? '换低音' : '交接'}`) : null),
      dk('A'), h('div', { class: 'sc-lane' }, lane(A, b => b - p.startA, x0, Math.min(x1, A.nBars - p.startA))),
      h('span'), moves('A'),
      dk('B'), h('div', { class: 'sc-lane' }, lane(B, b => b - p.cueB + p.playBar, p.playBar, x1)),
      h('span'), moves('B'),
      hand ? h('div', { class: 'sc-over', 'aria-hidden': 'true' }, h('span', { class: 'line', style: `left:${pc(hand.bar)}` })) : null,
    ].filter(Boolean);
  }

  function askPanel(box) {
    box.innerHTML = '';
    box.classList.remove('open');
    const log = h('div', { class: 'ask-log', 'aria-live': 'polite' });
    const input = h('input', { id: box.id + 'Input', placeholder: '问教练任何问题', 'aria-label': '问教练' });
    let busy = false;
    const send = async q => {
      q = q.trim(); if (!q || busy) return;
      busy = true;
      input.value = '';
      log.append(h('div', { class: 'msg q' }, q));
      const a = h('div', { class: 'msg a' }, '…');
      log.append(a);
      const faq = Coach.FAQ.find(f => f.q === q);
      if (Coach.state === 'online') {
        S.chat.push({ role: 'user', content: q });
        const text = await Coach.ask(S.chat.slice(-6), S.tracks.A, S.tracks.B, S.plan, t => { a.textContent = t; });
        if (text) { a.textContent = text; S.chat.push({ role: 'assistant', content: text }); busy = false; return; }
        S.chat.pop();
      }
      a.textContent = faq ? faq.a : '现在没连上 Claude，先看看上面几个问题。';
      busy = false;
    };
    box.append(
      h('button', { class: 'btn sm quiet ask-toggle', 'aria-expanded': 'false', onclick: e => { const o = box.classList.toggle('open'); e.currentTarget.setAttribute('aria-expanded', o); } }, '问教练'),
      h('div', { class: 'ask-chips' }, ...Coach.FAQ.map(f => h('button', { onclick: () => send(f.q) }, f.q))),
      Coach.state === 'online' ? h('form', { onsubmit: e => { e.preventDefault(); send(input.value); } }, input, h('button', { class: 'btn', type: 'submit', 'aria-label': '发送' }, '发送')) : '',
      log);
  }

  /* ================= view 3 · practice ================= */
  const deckUI = {};
  function buildConsole() {
    const con = $('#console');
    if (con.childElementCount) return;
    con.append(deckPanel('A'), mixerPanel(), deckPanel('B'));
  }
  function deckPanel(id) {
    const ui = {};
    ui.title = h('div', { class: 't' }); ui.sub = h('div', { class: 's' });
    ui.cue = h('button', { class: 'tbtn cue', onclick: () => cuePressed(id), title: '停下时设置 CUE 点；播放时跳回 CUE 点' }, 'CUE');
    ui.sync = h('button', { class: 'tbtn sync', onclick: () => syncPressed(id), title: id === 'B' && FINE ? '同步（S）' : '同步', 'aria-label': `同步${ROLE[id]}`, html: ICON.sync.replace('<svg', '<svg width="20" height="20"') });
    ui.play = h('button', { class: 'tbtn play', onclick: () => playPressed(id), title: id === 'B' && FINE ? '播放（空格）' : '播放', 'aria-label': `播放或暂停${ROLE[id]}` });
    const k = (ctrl, label) => new Ctl(id, ctrl, 'knob', label).el;
    ui.vinyl = vinyl(id, {
      tap: () => playPressed(id),
      // a hand on a spinning record pushes it ahead or holds it back; on a stopped one it finds the spot
      turn: (da, vel) => {
        const d = Engine.decks[id];
        if (!d.buffer) return;
        if (d.playing) Engine.setBend(d, clamp(vel / 200 * 0.12, -0.12, 0.12));
        else if (!S.session) Engine.seek(d, clamp(Engine.pos(d) + da / 200, 0, d.an.duration - 0.1));
      },
      end: () => { const d = Engine.decks[id]; if (d.bend) Engine.setBend(d, 0); },
    }, `${ROLE[id]}：点按播放或暂停，转动微调`, true);
    deckUI[id] = ui;
    return h('section', { class: 'deck', 'data-deck': id, 'aria-label': ROLE[id] },
      h('div', { class: 'tt' }, ui.vinyl, h('div', { class: 'meta' }, h('div', { class: 'tl' }, dk(id), ui.title), ui.sub)),
      h('div', { class: 'deck-main' },
        h('div', { class: 'deck-info' }, ui.cue, ui.sync, ui.play),
        h('div', { class: 'knobs' }, k('low', 'LOW'), k('mid', 'MID'), k('high', 'HIGH'), k('filter', 'FILTER'), k('echo', 'ECHO'), k('tempo', 'TEMPO'))));
  }
  // both channel faders live in the mixer, side by side with the level meters between them, as on real gear
  function mixerPanel() {
    const fader = id => new Ctl(id, 'fader', 'vf', '音量推子').el;
    const meter = id => { const i = h('i'); deckUI[id + 'meter'] = i; return h('u', {}, i); };
    const row = id => { const i = h('i'); deckUI[id + 'low'] = i; return h('div', { class: 'low-row' }, h('span', {}, TAG[id]), h('u', {}, i)); };
    const low = h('div', { class: 'lowmeter', title: '两台同时亮满就是低频打架' }, h('span', {}, '低频占用'), row('A'), row('B'));
    deckUI.low = low;
    deckUI.phase = h('div', { class: 'phase idle' }, h('i'), h('span', {}, '还没对拍'));
    const xf = new Ctl('X', 'xf', 'hf', '交叉推子');
    return h('section', { class: 'mixer', 'aria-label': '调音台' },
      h('div', { class: 'mx-faders' }, fader('A'), h('div', { class: 'mx-meters', 'aria-hidden': 'true' }, meter('A'), meter('B')), fader('B')),
      h('div', { class: 'mx-side' }, low, deckUI.phase,
        h('div', { class: 'xfade' }, h('div', { class: 'ends' }, h('span', {}, TAG.A), h('span', {}, TAG.B)), xf.el)));
  }

  function playPressed(id) {
    Engine.resume();
    const d = Engine.decks[id], other = Engine.decks[id === 'A' ? 'B' : 'A'], s = S.session;
    if (!d.buffer) return;
    if (d.playing) {
      Engine.stop(d);
      if (s && id === 'A') endSessionEarly();
      return;
    }
    if (s && s.mode === 'demo') takeOver();
    if (s && id === 'B' && s.bStartRel == null) {
      const nb = Engine.playQuantized(d, other);
      s.bStartRel = nb / 4 - s.plan.startA; s.bStartBy = 'user';
      return;
    }
    if (other.playing) Engine.playQuantized(d, other); else Engine.play(d);
  }
  function cuePressed(id) {
    const d = Engine.decks[id];
    if (!d.buffer) return;
    if (S.session) { toast('练习中先不用 CUE'); return; }
    if (d.playing) { Engine.stop(d); Engine.seek(d, S.cues[id]); }
    else {
      const an = d.an, b = Math.round((Engine.pos(d) - an.down0) / an.beat);
      S.cues[id] = an.down0 + b * an.beat; Engine.seek(d, S.cues[id]);
      toast(`CUE 已设在第 ${Math.floor(b / 4) + 1} 小节`);
    }
  }
  function syncPressed(id) {
    Engine.resume();
    const d = Engine.decks[id], other = Engine.decks[id === 'A' ? 'B' : 'A'];
    if (!d.an || !other.an) return;
    Engine.sync(d, other);
    d.synced = true;
    widgets[id + '.tempo'].set(d.tempo);
  }

  function selectPlan(id, mode) {
    if (!S.planset) return go('tracks');
    S.drill = null;
    S.plan = S.planset.plans.find(p => p.id === id);
    cancelSession();
    S.result = null;
    go('practice');
    setMode(mode, true);
  }
  function primeDecks() {
    const p = S.plan, A = Engine.decks.A, B = Engine.decks.B;
    stopAll(); resetMixer();
    S.cues.A = A.an.barTime(Math.max(0, p.startA - 4));
    S.cues.B = B.an.barTime(p.cueB);
    Engine.seek(A, S.cues.A); Engine.seek(B, S.cues.B);
  }
  function setMode(mode, fresh) {
    if (mode === S.mode && !S.session && !fresh && mode !== 'demo') return;
    if (S.session) cancelSession();
    S.mode = mode;
    if (mode !== 'guide' && S.drill) { S.drill = null; paintDrill(); }
    $$('.seg button').forEach(b => { b.classList.toggle('on', b.dataset.mode === mode); b.setAttribute('aria-selected', b.dataset.mode === mode); });
    if (mode !== 'free' && S.plan) primeDecks();
    if (mode === 'demo') startSession();
    else if (fresh && mode === 'guide') toast('先照提示摆好，再按开始');
    updateStartBtn();
    pill($('.seg'));
  }
  function updateStartBtn() {
    const b = $('#startBtn');
    b.innerHTML = (S.session ? ICON.stop : ICON.play.replace('<svg', '<svg width="14" height="14"')) + (S.session ? '停止' : S.mode === 'free' ? (Engine.decks.A && Engine.decks.A.playing ? '暂停前一首' : '播放前一首') : S.mode === 'demo' ? '再看一遍' : S.drill ? '开始单练' : '开始');
    b.classList.toggle('primary', !S.session);
    b.classList.toggle('quiet', !!S.session);
  }

  function startSession() {
    const p = S.plan;
    if (!p) return;
    Engine.resume();
    const A = Engine.decks.A, B = Engine.decks.B;
    const dr = S.drill && S.mode === 'guide' && S.drill.plan === p ? S.drill : null;
    stopAll();
    if (S.mode === 'demo') { resetMixer(); }
    Engine.seek(A, S.cues.A); Engine.seek(B, S.cues.B);
    S.session = { plan: p, mode: S.mode, rec: [], bStartRel: null, bStartBy: null, lastRec: 0, ended: false, synced: false, alerts: {}, drill: dr };
    if (dr) {
      // a drill drops in a few bars before one step with the desk already set the way the script has it by then
      const st0 = Planner.stateAt(p, dr.from);
      ['A', 'B'].forEach(id => Object.keys(Planner.DEFAULTS[id]).forEach(k => applyCtrl(id, k, st0[id][k], 'reset')));
      syncPressed('B');
      Engine.seek(A, A.an.barTime(p.startA + dr.from));
    }
    Engine.play(A);
    if (dr && dr.from >= p.playBar) { catchUpB(p); S.session.bStartRel = p.playBar; S.session.bStartBy = 'drill'; }
    updateStartBtn();
  }
  function cancelSession() {
    if (!S.session) return;
    S.session = null;
    stopAll();
    clearGhosts();
    updateStartBtn();
  }
  function takeOver() {
    // the viewer grabbed a control during the demo: hand the session over
    const s = S.session;
    s.mode = 'guide'; S.mode = 'guide';
    $$('.seg button').forEach(b => b.classList.toggle('on', b.dataset.mode === 'guide'));
    if (s.bStartRel != null && s.bStartBy === 'demo') s.bStartBy = 'ai';
    toast('换你来了，开始计分');
    updateStartBtn();
    pill($('.seg'));
  }
  function relNow() {
    const A = Engine.decks.A;
    return A.an.barAt(Engine.pos(A)) - S.plan.startA;
  }
  function endSessionEarly() {
    const s = S.session;
    if (!s) return;
    if (s.drill ? relNow() >= s.drill.step.end : relNow() >= s.plan.playBar + 1 && s.mode !== 'demo') finishSession();
    else { cancelSession(); toast('已停止，不计分'); }
  }
  function finishSession() {
    const s = S.session;
    if (!s || s.ended) return;
    s.ended = true;
    const result = Planner.evaluate(s.plan, s.rec, s);
    S.session = null;
    stopAll(); clearGhosts(); updateStartBtn();
    if (s.drill) {
      const sr = result.stepResults.find(x => x.step === s.drill.step);
      toast(sr ? `这一步：${[...new Set(sr.parts.map(x => x.note))].join(' · ')}。可以再来一次` : '单练结束');
      return;
    }
    if (s.mode === 'demo') {
      S.lastDemo = { plan: s.plan, score: result.total };
      setMode('guide');
      toast('示范结束，轮到你了');
      return;
    }
    S.result = { plan: s.plan, result, rec: s.rec, meta: { bStartRel: s.bStartRel, bStartBy: s.bStartBy }, tries: recordTry(s.plan.id, result.total) };
    updateNav();
    go('review');
  }

  function sampleNow(rel) {
    const A = Engine.decks.A, B = Engine.decks.B;
    const la = Engine.deckLowShare(A), lb = Engine.deckLowShare(B);
    const lvA = Engine.deckLevel(A), lvB = Engine.deckLevel(B);
    return { rel, A: { ...A.ctrl }, B: { ...B.ctrl }, clash: la > 0.3 && lb > 0.3, level: lvA + lvB, lvA, lvB, phase: Engine.phaseErrorMs(), la, lb };
  }

  function autopilot(s, rel) {
    const p = s.plan, A = Engine.decks.A, B = Engine.decks.B;
    const st = Planner.stateAt(p, rel), k = clamp((rel + 3.5) / 2);
    for (const id of ['A', 'B']) for (const ctrl of Object.keys(Planner.DEFAULTS[id])) {
      const def = Planner.DEFAULTS[id][ctrl], target = rel < -1.5 ? def + (st[id][ctrl] - def) * k : st[id][ctrl];
      if (Math.abs(Engine.decks[id].ctrl[ctrl] - target) > 0.002) applyCtrl(id, ctrl, target, 'auto');
    }
    if (!s.synced && rel > -3) { syncPressed('B'); s.synced = true; }
    if (!B.playing && s.bStartRel == null && rel >= p.playBar - 0.5) {
      Engine.play(B, Engine.ctxTimeOf(A, A.an.barTime(p.startA + p.playBar)));
      s.bStartRel = p.playBar; s.bStartBy = 'demo';
    }
  }
  // start B where it would be had it started on time, so the phrases still line up
  function catchUpB(p) {
    const A = Engine.decks.A, B = Engine.decks.B;
    if (Math.abs(Engine.bpmNow(B) - Engine.bpmNow(A)) > 0.05) syncPressed('B');
    const nb = Math.ceil(Engine.beatPos(A) + 0.08), startBeat = (p.startA + p.playBar) * 4;
    B.offset = B.an.barTime(p.cueB) + (nb - startBeat) * B.an.beat;
    Engine.play(B, Engine.ctxTimeOf(A, A.an.down0 + nb * A.an.beat));
  }
  function paintDrill() {
    $('#sessionTitle').textContent = S.plan ? S.plan.name + (S.drill ? ` · 单练第 ${S.drill.step.bar} 小节` : '') : '练习';
    $('#fullBtn').hidden = !S.drill;
  }
  function rescue(s, rel) {
    const p = s.plan, B = Engine.decks.B;
    if (B.playing || s.bStartRel != null || rel < p.playBar + 1) return;
    catchUpB(p);
    s.bStartRel = p.playBar; s.bStartBy = 'ai';
    toast('帮你按了后一首的 PLAY，这一步记一半分');
  }

  function prepStatus(p) {
    const A = Engine.decks.A, B = Engine.decks.B;
    return p.pre.map(x => ({ ...x, done: x.ctrl === 'sync' ? Math.abs(Engine.bpmNow(B) - Engine.bpmNow(A)) < 0.05 : Math.abs(Engine.decks[x.deck].ctrl[x.ctrl] - x.to) < 0.08 }));
  }
  function clearGhosts() {
    Object.values(widgets).forEach(w => w.setGhost(null, false));
    ['A', 'B'].forEach(id => deckUI[id] && ['play', 'sync'].forEach(k => deckUI[id][k].classList.remove('wanted')));
  }

  function countSVG(frac, label, sub, color) {
    const r = 22, c = 2 * Math.PI * r;
    return `<svg viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="${r}" fill="none" stroke="${C.rail}" stroke-width="4"/><circle cx="26" cy="26" r="${r}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${(c * clamp(frac)).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 26 26)"/></svg><b>${label}${sub ? `<small>${sub}</small>` : ''}</b>`;
  }

  let lastCoachKey = '';
  function coach(rel) {
    const p = S.plan, s = S.session, A = Engine.decks.A, B = Engine.decks.B;
    const card = $('#coachCard');
    const alerts = [];
    const bothLow = Engine.deckLowShare(A) > 0.3 && Engine.deckLowShare(B) > 0.3;
    const phase = Engine.phaseErrorMs();
    deckUI.low.classList.toggle('clash', bothLow);
    if (bothLow) alerts.push(['hot', '低音打架，关一边 LOW']);
    if (phase != null && Math.abs(phase) > 25 && Engine.deckLevel(A) > 0.05 && Engine.deckLevel(B) > 0.05) alerts.push(['hot', `鼓点错开 ${Math.round(Math.abs(phase))} ms，按 SYNC`]);

    let when = '', what = '', why = '', cnt = '', now = false, next = '';
    const ghosts = new Map(); const wanted = new Set();
    let stepIdx = null, stepN = 0;
    if (S.mode === 'free' || !p) {
      when = '自由'; what = '随便玩，不计分';
      why = '';
      cnt = countSVG(0, '∞', '自由', C.faint);
    } else if (S.drill && !s) {
      const st = S.drill.step;
      when = `单练 · 第 ${st.bar} 小节`; what = st.actions.map(a => ins(a)).join('');
      why = '台子会自动摆好';
      cnt = countSVG(0, String(S.drill.to - S.drill.from), '小节', C.coach);
    } else {
      const prep = prepStatus(p);
      const relShown = s ? rel : -4;
      const steps = p.steps;
      const idx = steps.findIndex(st => relShown < st.end + (st.end === st.bar ? 0.5 : 0.25));
      const unmet = prep.filter(x => !x.done);
      const demo = s && s.mode === 'demo';
      if (!s || (relShown < 0 && unmet.length && !demo)) {
        // preparation
        if (unmet.length) {
          when = s ? `准备 · ${Math.max(0, Math.ceil(-relShown * 4))} 拍后开始` : '准备';
          what = unmet.map(x => ins(x)).join(''); why = '';
          unmet.forEach(x => { if (x.ctrl === 'sync') wanted.add('B.sync'); else ghosts.set(`${x.deck}.${x.ctrl}`, [x.to, true]); });
        } else {
          when = '准备好了 · 第一步'; what = steps[0].actions.map(a => ins(a)).join('');
          why = s ? '' : '前一首先放 4 小节';
        }
        cnt = countSVG(prep.filter(x => x.done).length / prep.length, `${prep.filter(x => x.done).length}/${prep.length}`, '准备', C.coach);
      } else if (idx === -1) {
        when = '收尾'; what = '接完了'; why = '';
        cnt = countSVG(1, '✓', '完成', C.coach);
      } else {
        const st = steps[idx], beats = (st.bar - rel) * 4;
        const isPlay = st.actions.some(a => a.ctrl === 'play');
        if (beats > 0) {
          const bars = Math.floor(beats / 4), rem = Math.ceil(beats - bars * 4);
          when = `第 ${st.bar} 小节 · 准备`;
          cnt = countSVG(1 - beats / 16, beats <= 4 ? String(Math.ceil(beats)) : String(Math.ceil(beats / 4)), beats <= 4 ? '拍' : '小节', C.coach);
          now = beats <= 4;
        } else {
          const prog = st.end > st.bar ? clamp((rel - st.bar) / (st.end - st.bar)) : 1;
          when = `第 ${st.bar} 小节 · ${demo ? '示范中' : '现在'}`;
          cnt = countSVG(prog, demo ? '示范' : '现在', '', C.coach);
          now = true;
        }
        what = st.actions.map(a => ins(a)).join('');
        why = st.actions.map(a => a.why).filter(Boolean)[0] || '';
        const nx = steps[idx + 1];
        if (nx) next = nx.actions.map(a => `${ROLE[a.deck]} ${CTRL_SHORT[a.ctrl]}${verb(a) ? ' ' + verb(a) : ''}`).join(' + ');
        if (!demo) {
          for (const a of p.actions) {
            if (a.ctrl === 'play') { if (Math.abs(a.bar - rel) <= 2 && s && s.bStartRel == null) wanted.add('B.play'); continue; }
            if (rel >= a.bar - 2 && rel <= a.bar + a.dur + 0.5) ghosts.set(`${a.deck}.${a.ctrl}`, [rel < a.bar ? a.to : Planner.stateAt(p, rel)[a.deck][a.ctrl], st.actions.includes(a)]);
          }
        }
        if (isPlay && !demo && beats <= 4 && beats > 0) alerts.push(['info', FINE ? '“现在”时按 PLAY（空格）' : '“现在”时按 PLAY']);
      }
      if (s && s.bStartBy === 'ai') alerts.push(['info', '帮你按了后一首']);
      if (s && s.bStartBy === 'user' && s.bStartRel != null) {
        const off = Math.round((s.bStartRel - p.playBar) * 4);
        alerts.push(off === 0 ? ['good', '后一首进得准'] : ['hot', `后一首${off > 0 ? '晚' : '早'}了 ${Math.abs(off)} 拍`]);
      }
      if (demo) alerts.push(['info', '动旋钮即接手']);
      stepIdx = idx; stepN = steps.length;
    }
    const statusKey = JSON.stringify([stepIdx, stepN, alerts]);
    if (statusKey !== lastCoachKey) {
      lastCoachKey = statusKey;
      $('#stepDots').innerHTML = Array.from({ length: stepN }, (_, i) => `<i class="${i < stepIdx || stepIdx === -1 ? 'done' : i === stepIdx ? 'cur' : ''}"></i>`).join('');
      $('#alerts').innerHTML = alerts.map(([k, t]) => `<span class="alert ${k === 'hot' ? '' : k}">${t}</span>`).join('');
    }
    card.classList.toggle('now', now);
    if (card._next !== next) { card._next = next; const el = $('#coachNext'); el.hidden = !next; el.lastChild.textContent = next; }
    if (card._cnt !== cnt) { card._cnt = cnt; $('#count').innerHTML = cnt; }
    // a new instruction crossfades in; a ticking countdown just updates in place
    if (card._what !== what) {
      const first = card._what == null, box = $('#coachText');
      card._what = what;
      const apply = () => { $('#coachWhen').textContent = when; $('#coachWhat').innerHTML = what; $('#coachWhy').textContent = why; box.classList.remove('fade'); };
      if (first) apply(); else { box.classList.add('fade'); clearTimeout(card._t); card._t = setTimeout(apply, 140); }
    } else if (card._when !== when && !$('#coachText').classList.contains('fade')) $('#coachWhen').textContent = when;
    card._when = when;
    for (const [k, w] of Object.entries(widgets)) { const gh = ghosts.get(k); w.setGhost(gh ? gh[0] : null, gh ? gh[1] : false); }
    ['A', 'B'].forEach(id => ['play', 'sync'].forEach(b => deckUI[id][b].classList.toggle('wanted', wanted.has(`${id}.${b}`))));
  }

  function updateConsole() {
    for (const id of ['A', 'B']) {
      const d = Engine.decks[id], ui = deckUI[id], t = S.tracks[id];
      if (!d || !ui) continue;
      ui.title.textContent = t ? t.title : '—';
      if (!d.an) continue;
      const p = Engine.pos(d);
      spinVinyl(ui.vinyl, p, d.playing, p / d.an.duration);
      ui.sub.textContent = `${Engine.bpmNow(d).toFixed(1)} BPM · ${fmtTime(p)}`;
      if (ui.play._on !== d.playing) {
        ui.play._on = d.playing;
        ui.play.classList.toggle('on', d.playing);
        ui.play.setAttribute('aria-pressed', d.playing);
        ui.play.innerHTML = (d.playing ? ICON.pause : ICON.play).replace('<svg', '<svg width="18" height="18"');
      }
      const other = Engine.decks[id === 'A' ? 'B' : 'A'];
      ui.sync.classList.toggle('on', !!other.an && Math.abs(Engine.bpmNow(d) - Engine.bpmNow(other)) < 0.05);
      const lv = d.playing ? Engine.meterLevel(d) : 0;
      deckUI[id + 'meter'].style.transform = `scaleY(${clamp(Math.sqrt(lv) * 1.6).toFixed(3)})`;
      deckUI[id + 'low'].style.transform = `scaleX(${clamp(Engine.deckLowShare(d)).toFixed(3)})`;
    }
    const ph = Engine.phaseErrorMs(), abs = ph == null ? null : Math.abs(ph);
    const [cls, txt] = ph == null ? ['idle', '未起播'] : abs < 10 ? ['', '鼓点对齐'] : abs < 25 ? ['warn', `鼓点差 ${Math.round(abs)} ms`] : ['hot', `错开 ${Math.round(abs)} ms`];
    if (deckUI.phase._txt !== txt) {
      deckUI.phase._txt = txt;
      deckUI.phase.className = 'phase ' + cls;
      deckUI.phase.lastChild.textContent = txt;
    }
  }

  function drawLanes() {
    const cv = $('#lanes'), { g, w, h: H } = fit(cv);
    if (!w || !H) return;
    g.clearRect(0, 0, w, H);
    const A = Engine.decks.A;
    if (!A || !A.an) return;
    const xc = Math.round(w * 0.28), realBar = A.an.beat * 4 / Engine.rate(A), pxs = w / (Math.min(24, w / 18) * realBar);
    const p = S.mode !== 'free' ? S.plan : null, rel = p ? relNow() : 0;
    // the score, top to bottom: ruler, A, A's moves, B, B's moves
    const laneH = 40, mvH = 24, yOf = { A: 24, B: 24 + laneH + 5 + mvH + 7 }, mvY = id => yOf[id] + laneH + 5;
    const xOfABar = b => xc + ((A.an.barTime(b) - Engine.pos(A)) / Engine.rate(A)) * pxs;
    g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    g.font = `500 11px ${FONT}`;
    if (p) {
      const x0 = xOfABar(p.startA), x1 = xOfABar(p.startA + p.len), hand = handOf(p);
      g.fillStyle = C.booth; capsule(g, x0, 18, x1 - x0, H - 18, 14); g.fill();
      g.fillStyle = C.dim;
      for (let b = 0; b <= p.len; b += 8) { if (hand && Math.abs(b - hand.bar) < 3) continue; const x = xOfABar(p.startA + b); if (x > -20 && x < w) g.fillText(String(b), x + 2, 12); }
      if (hand) {
        const x = xOfABar(p.startA + hand.bar);
        if (x > -90 && x < w) { g.fillStyle = C.coach; g.font = `600 11px ${FONT}`; g.fillText(`${hand.bar} · ${hand.ctrl === 'low' ? '换低音' : '交接'}`, x + 4, 12); g.fillRect(x - 0.5, 18, 1, H - 18); g.font = `500 11px ${FONT}`; }
      }
    } else {
      g.fillStyle = C.dim;
      for (let b = 0; b <= A.an.nBars; b += 8) { const x = xOfABar(b); if (x > -20 && x < w) g.fillText(String(b + 1), x + 2, 12); }
    }
    ['A', 'B'].forEach(id => {
      const d = Engine.decks[id], y = yOf[id];
      if (!d.an) return;
      const pos = Engine.pos(d), rate = Engine.rate(d), c = d.ctrl, X = t => xc + (t - pos) / rate * pxs;
      structure(g, d.an, X, y, laneH, { w, r: 10, sticky: 40, past: xc, alpha: 0.35 + 0.65 * clamp(c.fader * 1.4), oneLine: true });
      // the deck badge, solid for A and outlined for B, stays pinned to the edge
      g.beginPath(); g.arc(18, y + laneH / 2, 12, 0, Math.PI * 2);
      g.fillStyle = id === 'A' ? C.text : C.card; g.fill();
      if (id === 'B') { g.strokeStyle = C.text; g.lineWidth = 1.5; g.stroke(); }
      g.fillStyle = id === 'A' ? C.ink : C.text; g.font = `700 12px ${FONT}`; g.textAlign = 'center'; g.fillText(TAG[id], 18, y + laneH / 2 + 4); g.textAlign = 'left';
    });
    if (p) {
      // each move is a pill under its lane, starting on its bar; the one to do now is outlined
      const last = { A: -1e9, B: -1e9 };
      g.font = `600 11px ${FONT}`;
      for (const a of p.actions) {
        const y = mvY(a.deck), x = xOfABar(p.startA + a.bar), xe = xOfABar(p.startA + a.bar + a.dur);
        const k = CTRL_SHORT[a.ctrl], v = verb(a), kw = g.measureText(k).width, tw = kw + (v ? g.measureText(v).width + 5 : 0);
        const pw = Math.max(tw + 18, xe - x), px = Math.max(x, last[a.deck] + 6);
        if (px + pw < -10 || px > w + 10) continue;
        last[a.deck] = px + pw;
        const past = rel > a.bar + a.dur + 0.5, live = !past && rel >= a.bar - 2;
        g.fillStyle = C.card; capsule(g, px, y, pw, mvH, mvH / 2); g.fill();
        g.strokeStyle = live ? C.coach : C.rail; g.lineWidth = live ? 1.5 : 1; capsule(g, px + 0.75, y + 0.75, pw - 1.5, mvH - 1.5, mvH / 2); g.stroke();
        g.fillStyle = past ? C.dim : C.text; g.fillText(k, px + 9, y + 16);
        if (v) { g.fillStyle = past ? C.dim : C.coach; g.fillText(v, px + 9 + kw + 5, y + 16); }
      }
    }
    g.fillStyle = C.text; capsule(g, xc - 1, 14, 2, H - 14, 1); g.fill();
    g.font = `600 10px ${FONT}`;
    const nw = g.measureText('现在').width + 14;
    capsule(g, xc - nw / 2, 0, nw, 17, 8.5); g.fill();
    g.fillStyle = C.ink; g.textAlign = 'center'; g.fillText('现在', xc, 12.5); g.textAlign = 'left';
  }

  /* ================= view 4 · review ================= */
  function countUp(el, to) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !to) { el.textContent = String(to); return; }
    const t0 = performance.now(), dur = 900;
    el.textContent = '0';
    const step = now => {
      const k = Math.min(1, (now - t0) / dur);
      el.textContent = String(Math.round(to * (1 - Math.pow(1 - k, 4))));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step); setTimeout(() => { el.textContent = String(to); }, dur + 400);
  }
  // every scored run of this plan as one line: the last point is this run
  function sparkSVG(tries) {
    if (tries.length < 2) return '';
    const t = tries.slice(-12), w = 120, hh = 36, x = i => 4 + i * (w - 8) / (t.length - 1), y = v => hh - 4 - (v / 100) * (hh - 8);
    const pts = t.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    return `<svg viewBox="0 0 ${w} ${hh}" width="${w}" height="${hh}" role="img" aria-label="最近 ${t.length} 次的分数：${t.join('、')}"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/><circle cx="${x(t.length - 1).toFixed(1)}" cy="${y(t[t.length - 1]).toFixed(1)}" r="3.5" fill="currentColor"/></svg>`;
  }
  // a drill starts four bars before the step and runs two bars past it
  const drillWindow = st => ({ from: Math.max(-4, Math.floor(st.bar) - 4), to: Math.ceil(st.end) + 2 });
  function renderReview() {
    const R = S.result;
    if (!R) return go('tracks');
    if (S.reviewed === R) { requestAnimationFrame(drawCompare); return; }
    S.reviewed = R;
    const { plan: p, result: r } = R;
    const tries = R.tries || [r.total], best = tries.length > 1 ? Math.max(...tries.slice(0, -1)) : null;
    $('#reviewTitle').textContent = `${p.name} · 第 ${tries.length} 次`;
    countUp($('#scoreNum'), r.total);
    $('#scoreSpark').innerHTML = sparkSVG(tries);
    $('#scoreGrade').textContent = r.total >= 85 ? '可以上台了。' : r.total >= 70 ? '很接近了。' : r.total >= 50 ? '方向对了。' : '再来一次。';
    $('#scoreSub').textContent = [best != null ? (r.total > best ? `新纪录，之前最好 ${best}` : `最好 ${best}`) : '', S.lastDemo && S.lastDemo.plan === p ? `示范 ${S.lastDemo.score}` : ''].filter(Boolean).join(' · ');
    const mx = $('#metrics');
    mx.innerHTML = '';
    Object.keys(Planner.METRIC_LABEL).forEach(k => {
      const v = Math.round(r.metrics[k] * 100);
      mx.append(h('div', { class: 'metric pre' + (v < 70 ? ' low' : ''), style: `--v:${(v / 100).toFixed(3)}` }, h('span', {}, Planner.METRIC_LABEL[k]), h('u', {}, h('i')), h('b', {}, String(v))));
    });
    // the one thing to change next time: the weakest move, and the step it belongs to
    const parts = r.stepResults.flatMap(sr => sr.parts.map(x => ({ ...x, sr })));
    const worst = parts.reduce((a, b) => b.score < a.score ? b : a, parts[0]), fix = !!worst && worst.score < 0.8;
    R.drillStep = fix ? worst.sr.step : null;
    $('#nextH').textContent = fix ? '下次只改这一件事。' : '这次没什么要改的。';
    $('#nextChip').innerHTML = fix ? `${ins(worst.a, true)}<span class="next-note">${worst.note}</span>` : '';
    $('#drillBtn').hidden = !fix;
    if (fix) { const dw = drillWindow(worst.sr.step); $('#drillTxt').textContent = `只练这 ${dw.to - dw.from} 小节`; }
    const cm = $('#comment'), who = $('#commentWho'), line = $('#commentLine');
    const fallback = Coach.fallbackReview(r).split('\n').pop().replace(/^·\s*(下次目标：)?/, '');
    const offline = () => { line.classList.remove('ai'); who.textContent = '教练：'; cm.textContent = fallback; };
    if (Coach.state === 'online') {
      line.classList.add('ai'); who.textContent = 'Claude：'; cm.textContent = '正在写点评…';
      Coach.review(S.tracks.A, S.tracks.B, p, r, t => { if (S.result === R) cm.textContent = t; }).then(t => {
        if (S.result !== R) return;
        if (t) cm.textContent = t.trim(); else offline();
      });
    } else offline();
    const sl = $('#stepsList');
    sl.innerHTML = '';
    r.stepResults.forEach(sr => {
      const ok = sr.score >= 0.75, st = sr.step;
      sl.append(h('div', { class: 'srow pre', style: `transition-delay:${sl.childElementCount * 50}ms` },
        h('span', { class: 'sbar' }, st.end > st.bar ? `${st.bar} → ${st.end}` : `第 ${st.bar} 小节`),
        h('span', { class: 'sins', html: st.actions.map(a => ins(a, true)).join('') }),
        h('span', { class: 'note' + (ok ? ' ok' : ''), html: (ok ? ICON.check : '') + [...new Set(sr.parts.map(x => x.note))].join(' · ') })));
    });
    requestAnimationFrame(drawCompare);
    // the review is seen once per run, so it may arrive with a little ceremony
    const reveal = () => $$('#view-review .pre').forEach(e => e.classList.remove('pre'));
    requestAnimationFrame(() => requestAnimationFrame(reveal)); setTimeout(reveal, 80);
    askPanel($('#askReview'));
  }
  function drawCompare() {
    const R = S.result, cv = $('#compareCanvas');
    if (!R || !cv.isConnected) return;
    const p = R.plan, rec = R.rec;
    const rows = [];
    p.actions.forEach(a => { if (a.ctrl !== 'play' && !rows.some(r => r.deck === a.deck && r.ctrl === a.ctrl)) rows.push({ deck: a.deck, ctrl: a.ctrl }); });
    rows.sort((a, b) => a.deck.localeCompare(b.deck));
    const rowH = 44, top = 22;
    cv.style.height = `${top + rows.length * rowH + 22}px`;
    const { g, w, h: H } = fit(cv);
    if (!w || !H) return;
    g.clearRect(0, 0, w, H);
    const L = 86, x0 = -2, x1 = p.len + 2, X = b => L + (b - x0) / (x1 - x0) * (w - L - 8);
    g.font = `500 10px ${FONT}`;
    for (let b = 0; b <= p.len; b += 4) { g.fillStyle = alpha(C.text, b % 8 === 0 ? 0.12 : 0.05); g.fillRect(X(b), top - 4, 1, rows.length * rowH + 4); if (b % 8 === 0) { g.fillStyle = C.faint; g.fillText(String(b), X(b) + 3, H - 6); } }
    // clash band
    rec.forEach((s, i) => { if (s.clash && s.rel >= x0 && s.rel <= x1) { const nx = rec[i + 1] ? X(rec[i + 1].rel) : X(s.rel) + 2; g.fillStyle = alpha(C.hot, 0.35); g.fillRect(X(s.rel), 2, Math.max(1.5, nx - X(s.rel)), 12); } });
    g.fillStyle = C.faint; g.fillText('低频打架', 4, 12);
    const NAME = { fader: '推子', low: 'LOW', mid: 'MID', high: 'HIGH', filter: 'FILTER', echo: 'ECHO' };
    rows.forEach((r, i) => {
      const y0 = top + i * rowH, [mn, mx] = RANGES[r.ctrl], Y = v => y0 + rowH - 6 - clamp((v - mn) / (mx - mn)) * (rowH - 12);
      g.fillStyle = alpha(C.text, 0.03); g.fillRect(L, y0 + 2, w - L - 8, rowH - 4);
      g.fillStyle = deckColor(r.deck); g.font = `600 11px ${FONT}`; g.fillText(`${TAG[r.deck]} ${NAME[r.ctrl]}`, 4, y0 + rowH / 2 + 4);
      g.strokeStyle = C.coach; g.lineWidth = 2; g.setLineDash([5, 4]); g.beginPath();
      for (let px = X(x0); px <= X(x1); px += 3) { const rel = x0 + (px - L) / (w - L - 8) * (x1 - x0), v = Planner.stateAt(p, rel)[r.deck][r.ctrl]; px === X(x0) ? g.moveTo(px, Y(v)) : g.lineTo(px, Y(v)); }
      g.stroke(); g.setLineDash([]);
      g.strokeStyle = deckColor(r.deck); g.lineWidth = 2; g.beginPath();
      let started = false;
      rec.forEach(s => { if (s.rel < x0 || s.rel > x1) return; const x = X(s.rel), y = Y(s[r.deck][r.ctrl]); if (!started) { g.moveTo(x, y); started = true; } else g.lineTo(x, y); });
      g.stroke();
    });
    const m = R.meta;
    if (m.bStartRel != null) { const x = X(m.bStartRel); g.fillStyle = C['deck-b']; g.fillRect(x - 1, top - 4, 2, rows.length * rowH + 4); g.font = `500 10px ${FONT}`; g.fillText(m.bStartBy === 'ai' ? '后一首起播（帮你按的）' : '后一首起播', x + 4, top + rows.length * rowH + 14); }
  }

  /* ================= navigation & boot ================= */
  function updateNav() {
    const ready = !!S.planset;
    $$('nav.steps button').forEach(b => {
      const v = b.dataset.go;
      b.disabled = v === 'tracks' ? false : v === 'plans' ? !ready : v === 'practice' ? !(ready && S.plan) : !S.result;
      b.classList.toggle('on', v === S.view);
      if (v === S.view) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
    pill($('nav.steps'));
  }
  /* the dark pill behind the current tab slides instead of jumping */
  function pill(box) {
    let p = box.querySelector('.pill');
    if (!p) { p = h('i', { class: 'pill', 'aria-hidden': 'true' }); box.prepend(p); }
    const on = box.querySelector('button.on');
    if (!on || !on.offsetWidth) return;
    const first = !p.style.width;
    if (first) p.classList.add('still');
    p.style.width = on.offsetWidth + 'px';
    p.style.transform = `translateX(${on.offsetLeft}px)`;
    if (first) requestAnimationFrame(() => requestAnimationFrame(() => p.classList.remove('still')));
  }
  function go(view) {
    if (view === S.view) { updateNav(); return; }
    if (S.view === 'practice') cancelSession();
    if (S.view === 'tracks' && S.preview) stopPreview();
    if (view !== 'practice') stopAll();
    const order = ['tracks', 'plans', 'practice', 'review'], dir = order.indexOf(view) >= order.indexOf(S.view) ? 'from-next' : 'from-back';
    S.view = view;
    // the practice view is a black stage; everything drawn on canvas reads its colours from the same tokens
    if (view === 'practice') document.documentElement.dataset.stage = 'practice'; else delete document.documentElement.dataset.stage;
    readColors();
    $$('.view').forEach(v => { v.hidden = v.id !== 'view-' + view; });
    const vEl = $('#view-' + view);
    vEl.classList.add(dir);
    // two frames normally; the timeout covers a throttled background tab so the view never stays hidden
    const shown = () => vEl.classList.remove(dir);
    requestAnimationFrame(() => requestAnimationFrame(shown)); setTimeout(shown, 80);
    updateNav();
    window.scrollTo({ top: 0 });
    if (view === 'plans') { renderPlans(true); askPanel($('#askPlans')); }
    if (view === 'practice') {
      buildConsole();
      // whatever happened elsewhere (a finished run, a preview) the desk starts from the plan's opening state
      if (S.plan && S.mode !== 'free') primeDecks(); else { stopAll(); resetMixer(); }
      updateStartBtn();
      pill($('.seg'));
      paintDrill();
      lastCoachKey = '';
    }
    if (view === 'review') renderReview();
  }

  let lastTick = 0;
  function frame() { requestAnimationFrame(frame); tick(); }
  function tick() {
    lastTick = performance.now();
    if (!Engine.decks.A) return;
    if (S.view === 'practice') {
      const s = S.session;
      let rel = 0;
      if (s) {
        rel = relNow();
        if (s.mode === 'demo') autopilot(s, rel); else rescue(s, rel);
        if (Engine.now - s.lastRec > 0.03) { s.lastRec = Engine.now; s.rec.push(sampleNow(rel)); }
        if (rel > (s.drill ? s.drill.to : s.plan.len + 1.5)) finishSession();
        else if (!Engine.decks.A.playing) endSessionEarly();
      }
      updateConsole(); coach(rel); drawLanes();
    } else if (S.view === 'tracks' && S.preview) {
      const d = Engine.decks[S.preview];
      if (d.an) {
        const pos = S.scrub && S.scrub.id === S.preview ? S.scrub.t : Engine.pos(d);
        setHead(S.preview, pos);
        spinVinyl($(`#track${S.preview} .vinyl`), pos, true, pos / d.an.duration);
      }
      if (!d.playing && !S.scrub) stopPreview();
    }
  }

  function updateChip(state) {
    const chip = $('#aiChip');
    chip.dataset.state = state;
    chip.querySelector('span').textContent = { checking: '连接中', online: 'Claude 在线', offline: '内置教练', busy: 'Claude 稍后再试' }[state];
    chip.title = state === 'online' ? '方案点评、复盘和问答由 Claude 实时生成。点开看分工' : '现在由内置教练讲解。在 claude.ai 里打开，Claude 会接管点评和问答。点开看分工';
    if (S.view === 'plans' && state === 'online' && !S.aiPlans) renderPlans();
  }

  /* ---- the explainer: three steps on the first page, and the same three plus a control glossary in the help sheet ---- */
  const HOW = [
    ['<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6"/></svg>', '放两首歌', '拖进卡片，或从曲库里挑'],
    ['<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11 3.5l1.9 5.6 5.6 1.9-5.6 1.9L11 18.5l-1.9-5.6L3.5 11l5.6-1.9zM18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/></svg>', 'AI 出三种接法', '看谁更合适，先听一遍'],
    [() => ICON.knob(0.72), '跟着练，打分复盘', '照着图标拧，练完看哪步没到位'],
  ];
  const howItems = () => HOW.map(([ic, b, sm]) => `<li><span class="how-ic">${typeof ic === 'function' ? ic() : ic}</span><span><b>${b}</b><small>${sm}</small></span></li>`).join('');
  const XF_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="10.75" width="18" height="2.5" rx="1.25" fill="currentColor" opacity=".28"/><rect x="10" y="6.5" width="4" height="11" rx="1.5" fill="currentColor"/></svg>';
  const GLOSS = [
    [() => ICON.knob(0.5), 'LOW', '低频：鼓和贝斯的分量。换歌时只留一台的低频。'],
    [() => ICON.knob(0.5), 'MID', '中频：人声和旋律。'],
    [() => ICON.knob(0.5), 'HIGH', '高频：镲片和空气感。'],
    [() => ICON.knob(0.3), 'FILTER', '滤波：往左变闷，往右变薄，用来把一首歌藏起来。'],
    [() => ICON.knob(0.8), 'ECHO', '回声：让声音拖着尾巴离开。'],
    [() => ICON.knob(0.5), 'TEMPO', '速度：调快调慢，让两首歌一样快。'],
    [() => ICON.fader(0.8), '推子', '这一台有多响。'],
    [() => XF_ICON, '交叉推子', '在前一首和后一首之间分配音量。'],
    [() => ICON.play, 'PLAY', '开始或暂停这一台。'],
    [() => ICON.sync, 'SYNC', '一键把速度和拍子对齐另一台。'],
    [() => 'CUE', 'CUE', '停着时按，记下起点；播放中按，跳回起点。'],
  ];
  function openHelp(section) {
    const dlg = $('#help');
    if (!$('#gloss').childElementCount) {
      $('#help .how').innerHTML = howItems();
      $('#gloss').innerHTML = GLOSS.map(([ic, b, sm]) => `<div class="g-item"><span class="g-ic">${ic()}</span><span><b>${b}</b><small>${sm}</small></span></div>`).join('');
    }
    if (S.preview) stopPreview();
    dlg.showModal();
    if (section === 'about') $('#help .about').scrollIntoView({ block: 'nearest' });
  }

  /* ---- the crate: six tracks written for the demo, plus the viewer's own files ---- */
  const COVER = {
    midnight: '<path d="M27 9a13.5 13.5 0 1 0 8 23.5A11.5 11.5 0 0 1 27 9z" fill="currentColor"/>',
    neon: '<path d="M8 16c4.7-5 9.3 5 14 0s9.300-5 14 0M8 22c4.700-5 9.300 5 14 0s9.300-5 14 0M8 28c4.700-5 9.300 5 14 0s9.300-5 14 0"/>',
    velvet: '<circle cx="22" cy="22" r="14"/><circle cx="22" cy="22" r="8.500"/><circle cx="22" cy="22" r="2.500" fill="currentColor"/>',
    orbit: '<ellipse cx="22" cy="22" rx="15" ry="6.500" transform="rotate(-28 22 22)"/><circle cx="22" cy="22" r="4.500" fill="currentColor"/>',
    glass: '<path d="M22 7l12 15-12 15-12-15zM10 22h24M22 7l-4 15 4 15 4-15z"/>',
    bloom: '<circle cx="22" cy="14.500" r="5.500"/><circle cx="29.500" cy="22" r="5.500"/><circle cx="22" cy="29.500" r="5.500"/><circle cx="14.500" cy="22" r="5.500"/><circle cx="22" cy="22" r="2" fill="currentColor"/>',
  };
  const coverSVG = id => `<svg viewBox="0 0 44 44" fill="none" stroke="currentColor" stroke-width="1.800" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${COVER[id]}</svg>`;
  /* ---- listener settings: volume and appearance, remembered in this browser ---- */
  const VOL = { v: 0.8, muted: false };
  const VOL_ICON = l => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.500v5h3.500l4.500 4v-13l-4.500 4z" fill="currentColor" stroke-width="1.500"/>${l === 0 ? '<path d="m16 9.500 5 5m0-5-5 5"/>' : l === 1 ? '<path d="M15.500 9.500a3.500 3.500 0 0 1 0 5"/>' : '<path d="M15.500 9.500a3.500 3.500 0 0 1 0 5M18 7a7 7 0 0 1 0 10"/>'}</svg>`;
  function setVol(patch, silent) {
    Object.assign(VOL, patch);
    const eff = VOL.muted ? 0 : VOL.v;
    Engine.setVolume(eff * eff);
    const btn = $('#volBtn'), range = $('#volRange');
    btn.innerHTML = VOL_ICON(eff === 0 ? 0 : eff < 0.5 ? 1 : 2);
    btn.setAttribute('aria-pressed', VOL.muted);
    btn.title = VOL.muted ? '取消静音（M）' : '静音（M）';
    range.value = Math.round(VOL.v * 100);
    range.style.setProperty('--p', (VOL.muted ? 0 : VOL.v * 100) + '%');
    if (!silent) { try { localStorage.setItem('segue.vol', JSON.stringify(VOL)); } catch (e) { /* not kept */ } }
  }
  const THEMES = ['auto', 'light', 'dark'];
  const THEME_ICON = {
    auto: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>',
    light: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.600 5.600 7 7M17 17l1.400 1.400M5.600 18.400 7 17M17 7l1.400-1.400"/></svg>',
    dark: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M20 14.500A8.500 8.500 0 0 1 9.500 4 8.500 8.500 0 1 0 20 14.500z" fill="currentColor"/></svg>',
  };
  function setTheme(t, silent) {
    if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
    const btn = $('#themeBtn'), name = { auto: '跟随系统', light: '浅色', dark: '深色' }[t];
    btn.dataset.theme = t;
    btn.innerHTML = THEME_ICON[t];
    btn.title = `外观：${name}`; btn.setAttribute('aria-label', `外观：${name}，点按切换`);
    if (!silent) { try { localStorage.setItem('segue.theme', t); } catch (e) { /* not kept */ } toast(`外观：${name}`); }
  }
  function wireChrome() {
    try { Object.assign(VOL, JSON.parse(localStorage.getItem('segue.vol')) || {}); } catch (e) { /* defaults */ }
    setVol({}, true);
    $('#volBtn').addEventListener('click', () => setVol({ muted: !VOL.muted }));
    $('#volRange').addEventListener('input', e => setVol({ v: e.target.value / 100, muted: false }));
    let th = 'auto';
    try { th = localStorage.getItem('segue.theme') || 'auto'; } catch (e) { /* default */ }
    setTheme(THEMES.includes(th) ? th : 'auto', true);
    $('#themeBtn').addEventListener('click', () => setTheme(THEMES[(THEMES.indexOf($('#themeBtn').dataset.theme) + 1) % 3]));
    const bring = files => { const n = [...files].map(addUserFile).length; if (n) { renderCrate(); toast(n > 1 ? `${n} 首歌进了曲库，点一下放上去` : '进了曲库，点一下放上去'); } };
    $('#crateFile').addEventListener('change', e => { bring(e.target.files); e.target.value = ''; });
    $$('#targetSeg button').forEach(b => b.addEventListener('click', () => setTarget(b.dataset.t)));
    ['A', 'B'].forEach(d => $('#track' + d).addEventListener('click', e => { if (!e.target.closest('button, .strip')) setTarget(d); }));
    const crate = $('#crate');
    crate.addEventListener('dragover', e => { e.preventDefault(); crate.classList.add('drag'); });
    crate.addEventListener('dragleave', () => crate.classList.remove('drag'));
    crate.addEventListener('drop', e => { e.preventDefault(); crate.classList.remove('drag'); bring(e.dataTransfer.files); });
    $('#fullBtn').addEventListener('click', () => { if (S.session) cancelSession(); S.drill = null; paintDrill(); if (S.plan) primeDecks(); updateStartBtn(); });
    $('#drillBtn').addEventListener('click', () => {
      const R = S.result;
      if (!R || !R.drillStep) return;
      const pl = R.plan, st = R.drillStep;
      selectPlan(pl.id, 'guide');
      S.drill = { plan: pl, step: st, ...drillWindow(st) };
      paintDrill(); updateStartBtn();
    });
  }

  /* ---- practice history, kept in this browser only ---- */
  const HIST_KEY = 'segue.history.v1';
  function loadHist() { try { return JSON.parse(localStorage.getItem(HIST_KEY)) || []; } catch (e) { return []; } }
  function recordTry(planId, score) {
    const all = loadHist();
    all.push({ p: planId, s: score, t: Date.now() });
    try { localStorage.setItem(HIST_KEY, JSON.stringify(all.slice(-60))); } catch (e) { /* private mode: history just isn't kept */ }
    return all.filter(x => x.p === planId).map(x => x.s);
  }

  /* ---- finding songs online: Creative Commons releases in the Internet Archive's netlabel collection.
     Its search, file lists and audio all carry open CORS headers, so a page can download a song and analyse it
     like an upload. Licences that forbid derivatives are left out: a mix is one. ---- */
  const IA = 'https://archive.org';
  const FIND_STYLES = ['Deep House', 'Tech House', 'House', 'Techno', 'Minimal', 'Disco'];
  const EXT_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 5h5v5M19 5l-8 8M11 6H7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-4"/></svg>';
  const Find = { q: null, page: 1, tok: 0 };
  const ccName = url => { const m = /licenses\/([a-z-]+)\/([\d.]+)/.exec(url || ''); return m ? `CC ${m[1].toUpperCase()} ${m[2]}` : /zero|publicdomain/.test(url || '') ? 'CC0' : 'CC'; };
  const secOf = v => v == null ? 0 : String(v).split(':').reduce((a, b) => a * 60 + (parseFloat(b) || 0), 0);
  const one = v => Array.isArray(v) ? v[0] : v;
  function findState(msg) { const list = $('#findList'); list.innerHTML = ''; list.append(h('div', { class: 'find-msg' }, msg)); }
  async function findSongs(q, page) {
    const list = $('#findList'), tok = ++Find.tok;
    Find.q = q; Find.page = page || 1;
    $$('#findChips button').forEach(b => b.classList.toggle('on', q.style === b.textContent));
    list.innerHTML = '';
    list.append(...[0, 1, 2, 3, 4].map(() => h('div', { class: 'find-row sk', 'aria-hidden': 'true' })));
    const what = q.style ? `subject:("${q.style.toLowerCase()}")` : `(${q.text.replace(/[^\p{L}\p{N}\s-]/gu, ' ').trim()})`;
    const query = `collection:netlabels AND mediatype:audio AND licenseurl:*creativecommons* AND NOT licenseurl:*nd* AND ${what}`;
    const url = `${IA}/advancedsearch.php?q=${encodeURIComponent(query)}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=licenseurl&sort[]=${encodeURIComponent('downloads desc')}&rows=6&page=${Find.page}&output=json`;
    let docs;
    try { docs = (await (await fetch(url)).json()).response.docs; }
    catch (e) { if (tok === Find.tok) findState('连不上 Internet Archive。这个页面可能不能联网，换单文件版再试。'); return; }
    if (tok !== Find.tok) return;
    if (!docs.length) { findState(Find.page > 1 ? '没有更多了。' : '没找到，换个词试试。'); return; }
    let shown = 0;
    await Promise.all(docs.map(async d => {
      let m;
      try { m = await (await fetch(`${IA}/metadata/${encodeURIComponent(d.identifier)}`)).json(); } catch (e) { return; }
      if (tok !== Find.tok || !m || !m.files) return;
      // single songs only: long enough to mix, short enough to download
      // (a release often carries the same song at several bitrates: keep the uploader's own file, once per title)
      const seen = new Set();
      const songs = m.files.filter(f => /\.mp3$/i.test(f.name) && secOf(f.length) >= 150 && secOf(f.length) <= 540 && +f.size <= 30e6)
        .sort((a, b) => (b.source === 'original') - (a.source === 'original'))
        .filter(f => { const k = String(f.title || f.name).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
        .sort((a, b) => a.name.localeCompare(b.name)).slice(0, 3);
      if (!songs.length) return;
      if (!shown++) list.innerHTML = '';
      const release = String(one(d.title) || d.identifier).replace(/\s*[\[(][^\])]*[\])]\s*/g, ' ').trim() || d.identifier;
      songs.forEach(f => list.append(findRow({
        id: d.identifier, name: f.name, len: secOf(f.length), size: +f.size, release, lic: ccName(one(d.licenseurl)),
        title: String(f.title || f.name.replace(/\.mp3$/i, '').replace(/^\d+[\s._-]*/, '')).replace(/[\/\\]/g, '-'),
        artist: f.artist || f.creator || one(d.creator) || '未知艺人',
      })));
    }));
    if (tok === Find.tok && !shown) findState('这一批没有长度合适的歌，点“换一批”。');
  }
  function findRow(it) {
    return h('div', { class: 'find-row' },
      h('button', { class: 'find-pick', 'aria-label': `${it.title}，${it.artist}，放到${ROLE[S.target]}`, onclick: () => { $('#finder').close(); loadRemote(S.target, it); } },
        h('span', { class: 'lib-main' }, h('b', {}, it.title), h('small', {}, `${it.artist} · ${it.release}`)),
        h('span', { class: 'c-dur' }, fmtTime(it.len)),
        h('span', { class: 'find-lic' }, it.lic)),
      h('a', { class: 'icon-btn find-src', href: `${IA}/details/${encodeURIComponent(it.id)}`, target: '_blank', rel: 'noopener', 'aria-label': '在 Internet Archive 查看来源和授权', title: '来源和授权', html: EXT_ICON }));
  }
  function openFinder() {
    if (S.preview) stopPreview();
    const chips = $('#findChips');
    if (!chips.childElementCount) FIND_STYLES.forEach(s => chips.append(h('button', { type: 'button', onclick: () => { $('#findInput').value = ''; findSongs({ style: s }); } }, s)));
    $('#finder').showModal();
    if (!Find.q) findSongs({ style: FIND_STYLES[0] });
  }
  // a found song is downloaded into this browser, joins the crate as a row, and from there is an upload like any other
  async function loadRemote(id, it) {
    const key = `${it.id}/${it.name}`, had = S.userFiles.find(u => u.credit && u.credit.key === key);
    if (had) { assign(id, crateRows().find(r => r.id === had.id)); return; }
    if (S.preview) stopPreview();
    const tok = ++loadTok[id];
    S.tracks[id] = { status: 'loading', step: '正在下载…', title: it.title, artist: it.artist };
    trackCard(id); refreshTracksUI();
    let blob;
    try {
      const res = await fetch(`${IA}/download/${encodeURIComponent(it.id)}/${it.name.split('/').map(encodeURIComponent).join('/')}`);
      if (!res.ok) throw new Error(res.status);
      const total = +res.headers.get('content-length') || it.size, reader = res.body.getReader(), parts = [];
      let got = 0, last = -1;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (tok !== loadTok[id]) { reader.cancel(); return; }
        parts.push(value); got += value.length;
        const pct = Math.min(99, Math.round(got / total * 100));
        if (pct !== last) { last = pct; S.tracks[id].step = `正在下载… ${pct}%`; const el = $(`#track${id} .track-sub`); if (el) el.textContent = S.tracks[id].step; }
      }
      blob = new Blob(parts, { type: 'audio/mpeg' });
    } catch (e) {
      if (tok !== loadTok[id]) return;
      S.tracks[id] = { status: 'error', step: '没能用这首歌', title: it.title, error: '下载失败了，换一首或稍后再试。' };
      trackCard(id); refreshTracksUI(); return;
    }
    if (tok !== loadTok[id]) return;
    const file = new File([blob], it.title + '.mp3', { type: 'audio/mpeg' });
    const u = addUserFile(file);
    u.credit = { key, artist: it.artist, lic: it.lic, url: `${IA}/details/${encodeURIComponent(it.id)}` };
    renderCrate();
    await loadFile(id, file, u.id);
  }

  /* ---- first visit: a short walk through the first page. Each step is pinned to the thing it is about,
     the rest of the page is dimmed and blurred. As many steps as there are things to point at, no more. ---- */
  const TOUR_KEY = 'segue.tour.v1';
  const TOUR = [
    { at: ['#trackA', '#trackB'], side: 'right', t: '两张唱片', d: '上面的先放，下面的接上去。点唱片试听，转动它找位置。' },
    { at: ['#crate'], side: 'left', t: '换歌', d: FINE ? '先点选一张唱片，再点曲库里的一首；也可以直接拖到唱片上。' : '先点选一张唱片，再点曲库里的一首。' },
    { at: ['.seam-row'], side: 'right', t: '搭不搭', d: '分数越高越好接。右边的按钮把两首对调。' },
    { at: ['.pair-acts'], side: 'right', t: '看接法', d: 'AI 给出三种接法，选一种跟着练。想再看这段引导，点右上角的问号。' },
  ];
  const Tour = { on: false, i: 0 };
  const tourSeen = () => { try { return !!localStorage.getItem(TOUR_KEY); } catch (e) { return false; } };
  function tourRect(step) {
    const els = step.at.map(s => $(s)).filter(Boolean);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    els.forEach(el => { const b = el.getBoundingClientRect(); x0 = Math.min(x0, b.left); y0 = Math.min(y0, b.top); x1 = Math.max(x1, b.right); y1 = Math.max(y1, b.bottom); });
    const pad = 6, x = Math.max(4, x0 - pad), y = Math.max(4, y0 - pad), w = Math.min(innerWidth - 4, x1 + pad) - x, hh = Math.min(innerHeight - 4, y1 + pad) - y;
    return { x, y, w, h: hh, r: Math.min((parseFloat(getComputedStyle(els[0]).borderTopLeftRadius) || 12) + pad, w / 2, hh / 2) };
  }
  // the shade is one sheet with a rounded hole cut where the thing is
  function tourPaint(r) {
    const T = Tour, f = n => n.toFixed(1), q = f(r.r);
    const hole = `M${f(r.x + r.r)} ${f(r.y)}h${f(r.w - 2 * r.r)}a${q} ${q} 0 0 1 ${q} ${q}v${f(r.h - 2 * r.r)}a${q} ${q} 0 0 1 -${q} ${q}h${f(2 * r.r - r.w)}a${q} ${q} 0 0 1 -${q} -${q}v${f(2 * r.r - r.h)}a${q} ${q} 0 0 1 ${q} -${q}z`;
    const cp = `path(evenodd, "M0 0h${innerWidth}v${innerHeight}h${-innerWidth}z${hole}")`;
    T.shade.style.webkitClipPath = cp; T.shade.style.clipPath = cp;
    Object.assign(T.ring.style, { transform: `translate(${f(r.x)}px, ${f(r.y)}px)`, width: f(r.w) + 'px', height: f(r.h) + 'px', borderRadius: q + 'px' });
  }
  // the card sits beside the thing where there is room, otherwise at the far end of the screen
  function tourCard(r, side) {
    const c = Tour.card, vw = innerWidth, vh = innerHeight, m = 12, gap = 16, cw = c.offsetWidth, ch = c.offsetHeight;
    const fits = { right: vw - (r.x + r.w) - gap - m >= cw, left: r.x - gap - m >= cw, bottom: vh - (r.y + r.h) - gap - m >= ch, top: r.y - gap - m >= ch };
    const s = [side, 'right', 'left', 'bottom', 'top'].find(k => fits[k]);
    let x, y;
    if (s === 'right' || s === 'left') { x = s === 'right' ? r.x + r.w + gap : r.x - gap - cw; y = r.h > ch + 48 ? r.y + 24 : r.y + (r.h - ch) / 2; }
    else if (s) { x = r.x + (r.w - cw) / 2; y = s === 'bottom' ? r.y + r.h + gap : r.y - gap - ch; }
    // no room beside it: under a thing that fills the screen (its top is what matters), else at the far end
    else { x = (vw - cw) / 2; y = r.h > vh * 0.55 || r.y + r.h / 2 < vh / 2 ? vh - ch - m : 76; }
    c.style.transform = `translate(${Math.round(clamp(x, m, Math.max(m, vw - cw - m)))}px, ${Math.round(clamp(y, m, Math.max(m, vh - ch - m)))}px)`;
  }
  function tourShow(i, still) {
    const T = Tour, step = TOUR[i], n = TOUR.length;
    T.i = i; T.shownAt = performance.now();
    // bring the thing into view first, then measure it
    const els = step.at.map(s => $(s)), top = els[0].getBoundingClientRect().top, bottom = els[els.length - 1].getBoundingClientRect().bottom, head = 76, vh = innerHeight;
    if (top < head || bottom > vh - 12) window.scrollBy({ top: bottom - top > vh - head - 24 ? top - head : (top + bottom) / 2 - (vh + head) / 2, behavior: 'instant' });
    T.n.textContent = `${i + 1} / ${n}`;
    T.t.textContent = step.t; T.d.textContent = step.d;
    T.prev.style.display = i ? '' : 'none';
    T.next.textContent = i === n - 1 ? '开始' : '下一步';
    [...T.dots.children].forEach((d, k) => d.classList.toggle('on', k === i));
    const to = tourRect(step), from = still || !T.rect ? to : T.rect;
    tourCard(to, step.side);
    const dur = still || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 360, t0 = performance.now();
    cancelAnimationFrame(T.raf); clearTimeout(T.tm);
    const run = () => {
      const k = dur ? clamp((performance.now() - t0) / dur) : 1, e = 1 - Math.pow(1 - k, 4), mix = key => from[key] + (to[key] - from[key]) * e;
      T.rect = { x: mix('x'), y: mix('y'), w: mix('w'), h: mix('h'), r: mix('r') };
      tourPaint(T.rect);
      if (k < 1) T.raf = requestAnimationFrame(run);
    };
    run();
    // a throttled page gets no frames: land on the target anyway
    T.tm = setTimeout(() => { cancelAnimationFrame(T.raf); T.rect = to; tourPaint(to); }, dur + 80);
  }
  function startTour() {
    const T = Tour;
    if (T.on || S.view !== 'tracks' || $('#help').open) return;
    if (S.preview) stopPreview();
    T.shade = h('div', { class: 'tour-shade' }); T.ring = h('div', { class: 'tour-ring' });
    T.n = h('span', { class: 'tour-n' }); T.t = h('h2', { id: 'tourT' }); T.d = h('p', { id: 'tourD' });
    T.dots = h('span', { class: 'tour-dots', 'aria-hidden': 'true' }, TOUR.map(() => h('i')));
    T.prev = h('button', { class: 'btn sm quiet', onclick: () => tourShow(T.i - 1) }, '上一步');
    T.next = h('button', { class: 'btn sm primary', onclick: () => { if (T.i < TOUR.length - 1) tourShow(T.i + 1); else endTour(); } }, '下一步');
    T.card = h('div', { class: 'tour-card still', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'tourT', 'aria-describedby': 'tourD' },
      h('div', { class: 'tour-top' }, T.n, h('button', { class: 'tour-skip', onclick: endTour }, '跳过')),
      T.t, T.d, h('div', { class: 'tour-foot' }, T.dots, T.prev, T.next));
    T.el = h('div', { class: 'tour' }, T.shade, T.ring, T.card);
    if (!(window.CSS && CSS.supports('clip-path', 'path("M0 0h1v1z")'))) T.el.classList.add('no-clip');
    T.inert = [...document.body.children].filter(el => !/^(SCRIPT|STYLE)$/.test(el.tagName));
    T.inert.forEach(el => { el.inert = true; });
    document.body.append(T.el);
    T.on = true; T.rect = null;
    T.key = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endTour(); }
      else if (e.key === 'ArrowRight') T.next.click();
      else if (e.key === 'ArrowLeft') { if (T.i > 0) tourShow(T.i - 1); }
      else if (e.key === 'Tab') {
        const f = [...T.card.querySelectorAll('button')].filter(b => b.style.display !== 'none');
        e.preventDefault(); f[(f.indexOf(document.activeElement) + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      }
    };
    // the page moved under the card (a resize, a rotated phone): measure again, no glide
    T.fix = () => {
      if (!T.on || performance.now() - T.shownAt < 450) return;
      cancelAnimationFrame(T.raf); clearTimeout(T.tm);
      T.rect = tourRect(TOUR[T.i]); tourPaint(T.rect); tourCard(T.rect, TOUR[T.i].side);
    };
    document.addEventListener('keydown', T.key, true);
    window.addEventListener('resize', T.fix); window.addEventListener('scroll', T.fix, { passive: true });
    T.el.addEventListener('wheel', e => e.preventDefault(), { passive: false });
    T.el.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
    tourShow(0, true);
    T.next.focus({ preventScroll: true });
    const free = () => T.card.classList.remove('still');
    requestAnimationFrame(() => requestAnimationFrame(free)); setTimeout(free, 120);
  }
  function endTour() {
    const T = Tour;
    if (!T.on) return;
    T.on = false;
    try { localStorage.setItem(TOUR_KEY, '1'); } catch (e) { /* shown again next time */ }
    cancelAnimationFrame(T.raf); clearTimeout(T.tm);
    document.removeEventListener('keydown', T.key, true);
    window.removeEventListener('resize', T.fix); window.removeEventListener('scroll', T.fix);
    T.inert.forEach(el => { el.inert = false; });
    const el = T.el;
    el.classList.add('out'); setTimeout(() => el.remove(), 260);
    window.scrollTo({ top: 0 });
  }

  function boot() {
    readColors();
    trackCard('A'); trackCard('B'); renderCompat();
    bindDrop('A'); bindDrop('B');
    $$('nav.steps button').forEach(b => b.addEventListener('click', () => go(b.dataset.go)));
    $('#toPlans').addEventListener('click', () => go('plans'));
    $('#swapBtn').addEventListener('click', swapDecks);
    $('#demoBtn').addEventListener('click', () => selectPlan(S.picked, 'demo'));
    $('#practiceBtn').addEventListener('click', () => selectPlan(S.picked, 'guide'));
    $$('.seg button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
    $('#startBtn').addEventListener('click', () => {
      if (S.session) { endSessionEarly(); return; }
      if (S.mode === 'free') { playPressed('A'); return; }
      startSession();
    });
    $('#backPlans').addEventListener('click', () => go('plans'));
    $('#againBtn').addEventListener('click', () => { const id = S.result.plan.id; selectPlan(id, 'guide'); });
    $('#watchBtn').addEventListener('click', () => { const id = S.result.plan.id; selectPlan(id, 'demo'); });
    $('#otherBtn').addEventListener('click', () => go('plans'));
    $('#aiChip').addEventListener('click', () => openHelp('about'));
    $('#brandHome').addEventListener('click', e => { e.preventDefault(); go('tracks'); });
    $('#heroDemo').addEventListener('click', () => { if (S.planset) selectPlan(S.aiPlans ? S.aiPlans.pick : S.planset.pickId, 'demo'); });
    $('#newSongsBtn').addEventListener('click', () => go('tracks'));
    try { if (localStorage.getItem('segue.hint.mobile')) $('#mobileHint').hidden = true; } catch (e) { /* ignore */ }
    $('#mobileHintX').addEventListener('click', () => { $('#mobileHint').hidden = true; try { localStorage.setItem('segue.hint.mobile', '1'); } catch (e) { /* ignore */ } });
    $('#helpBtn').addEventListener('click', openHelp);
    $('#footHelp').addEventListener('click', openHelp);
    $('#helpClose').addEventListener('click', () => $('#help').close());
    $('#findBtn').addEventListener('click', openFinder);
    $('#finderClose').addEventListener('click', () => $('#finder').close());
    $('#finder').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.close(); });
    $('#findForm').addEventListener('submit', e => { e.preventDefault(); const text = $('#findInput').value.trim(); if (text) findSongs({ text }); });
    $('#findMore').addEventListener('click', () => { if (Find.q) findSongs(Find.q, Find.page + 1); });
    $('#tourAgain').addEventListener('click', () => { $('#help').close(); go('tracks'); setTimeout(startTour, 120); });
    // a click on the dimmed backdrop lands on the dialog element itself
    $('#help').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.close(); });
    document.addEventListener('keydown', e => {
      if (Tour.on || $('#help').open || $('#finder').open || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target.closest('input, textarea')) return;
      if (e.key === 'm' || e.key === 'M') { setVol({ muted: !VOL.muted }); return; }
      if (e.key === '?') { openHelp(); return; }
      if (S.view !== 'practice' || e.target.closest('[role="slider"]')) return;
      if (e.key === 'Enter' && !e.target.closest('button, a')) { e.preventDefault(); $('#startBtn').click(); return; }
      // a button the keyboard landed on keeps its own Space; one that was just clicked does not
      if (e.target.closest('button, a') && e.target.matches(':focus-visible')) return;
      if (e.code === 'Space') { e.preventDefault(); playPressed('B'); }
      else if (e.key === 's' || e.key === 'S') syncPressed('B');
    });
    let rz, lastW = innerWidth;
    window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => {
      if (innerWidth === lastW) return;
      lastW = innerWidth;
      if (S.view === 'tracks') { trackCard('A'); trackCard('B'); }
      if (S.view === 'plans') renderPlans();
      if (S.view === 'review') drawCompare();
      pill($('nav.steps')); pill($('.seg'));
    }, 150); });
    // canvases and inline SVG read colours once; repaint when the viewer's theme flips
    const onTheme = () => {
      readColors();
      if (S.view === 'tracks') { trackCard('A'); trackCard('B'); renderCompat(); }
      if (S.view === 'plans') renderPlans();
      if (S.view === 'review') drawCompare();
    };
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', onTheme);
    new MutationObserver(onTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    Coach.onState(updateChip);
    Engine.context();
    wireChrome();
    // the walk-through waits for both records, so every step has something real to point at
    Promise.allSettled([loadDemo('A'), loadDemo('B')]).then(() => { if (!tourSeen() || /[?&]tour\b/.test(location.search)) setTimeout(startTour, 300); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => pill($('nav.steps')));
    requestAnimationFrame(frame);
    // a covered or throttled page stops getting animation frames while the audio plays on: keep the clock moving
    setInterval(() => { if (performance.now() - lastTick > 400 && (S.session || S.preview)) tick(); }, 200);
    // a run that carries on in a background tab cannot be followed or scored fairly, so it stops
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) return;
      if (S.session) { cancelSession(); toast('切到后台了，这次不计分'); }
      if (S.preview) stopPreview();
    });
  }
  boot();
  window.__segue = { S, Engine, Planner };
})();
