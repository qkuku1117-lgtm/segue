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
    mode: 'guide', session: null, result: null, preview: null, cues: { A: 0, B: 0 }, chat: [],
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
    upload: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></svg>',
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
    return `<span class="ins${mini ? ' mini' : ''}" title="${a.label || ''}"><b class="dk dk-${a.deck}">${a.deck}</b><i class="ic">${icon}</i><span class="ins-k">${CTRL_SHORT[a.ctrl]}</span>${v ? `<span class="ins-v">${v}</span>` : ''}${!mini && a.dur ? `<span class="ins-d">${a.dur} 小节</span>` : ''}</span>`;
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
      const aria = { role: 'slider', tabindex: 0, 'aria-label': `${deck === 'X' ? '' : deck + ' '}${label}`, 'aria-valuemin': min, 'aria-valuemax': max };
      if (kind === 'knob') {
        this.face = h('div', { class: 'knob', ...aria });
        this.face.innerHTML = `<svg viewBox="-26 -26 52 52"><circle class="cap" r="19"/><line class="ptr" x1="0" y1="-7" x2="0" y2="-15"/><circle class="gdot" r="2.5" cx="0" cy="-24" style="display:none"/></svg>`;
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
      f.addEventListener('wheel', e => { e.preventDefault(); this.input(this.value - Math.sign(e.deltaY) * 0.03 * (this.max - this.min)); }, { passive: false });
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
      if (c === 'xf') return Math.abs(v - 0.5) < 0.01 ? 'CENTER' : `A ${Math.round(Math.min(1, (1 - v) * 2) * 100)} · B ${Math.round(Math.min(1, v * 2) * 100)}`;
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
        const gd = svg.querySelector('.gdot');
        if (this.ghost == null) gd.style.display = 'none';
        else {
          const [x, y] = pt(24, -135 + 270 * this.norm(this.ghost));
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

  /* ================= view 1 · tracks ================= */
  function trackCard(id) {
    const card = $('#track' + id), t = S.tracks[id];
    card.innerHTML = '';
    const ready = t && t.status === 'ready', an = ready ? t.an : null;
    card.append(h('div', { class: 'track-head' },
      h('i', { class: `dk lg dk-${id}`, 'aria-label': `Deck ${id}` }, id),
      h('div', { class: 'track-info' },
        h('div', { class: 'track-title' }, t && t.title ? t.title : '等待音频'),
        h('div', { class: 'track-sub' }, ready ? `${an.bpm} BPM · ${an.key.name} · ${an.key.camelot}` : t ? t.step || '准备中' : '上传或拖入歌曲')),
      uploadBtn(id)));
    if (!ready) {
      card.append(h('div', { class: 'loading' }, t && t.error ? h('div', { class: 'track-err' }, t.error) : h('div', { class: 'bars' }, h('i'), h('i'), h('i'), h('i'), h('i'))));
      return;
    }
    if (t.head == null) t.head = an.barTime(an.firstDrop ?? 0);
    // the row of capsules is the scrubber: a tap plays the section under the finger, a drag sets the exact spot
    const secs = an.sections.map(sec => {
      const name = SEC_LABEL[sec.type] || sec.type, from = an.barTime(sec.start), to = Math.min(an.duration, an.barTime(sec.end));
      return h('button', { class: `sec s${secTier(sec.type)}`, style: `flex:${(to - from).toFixed(2)} 1 0`, title: name, 'data-name': name, 'aria-label': `从${name}开始试听`, onclick: e => { if (e.detail === 0) playFrom(id, from); } }, name);
    });
    const strip = h('div', { class: 'strip', role: 'group', 'aria-label': `${t.title} 段落` }, ...secs, h('div', { class: 'playhead' }));
    card.append(strip);
    bindScrub(strip, id);
    card.append(h('div', { class: 'track-foot' },
      h('button', { class: 'play-btn', 'data-preview': id, 'aria-label': '播放或暂停试听', onclick: () => togglePreview(id) }),
      h('span', { class: 'track-time' }, h('span', { 'data-now': '' }), h('small', {}, ` / ${fmtTime(an.duration)}`)),
      h('div', { class: 'grid-fix', title: '小节线没对上第一拍时，手动挪一拍' }, '网格',
        h('button', { 'aria-label': '小节线左移一拍', onclick: () => nudgeGrid(id, -1) }, '◀'),
        h('button', { 'aria-label': '小节线右移一拍', onclick: () => nudgeGrid(id, 1) }, '▶'))));
    setHead(id, t.head);
    previewButtons();
    // a capsule too narrow for its name stays blank; the name is still its tooltip
    requestAnimationFrame(() => secs.forEach(b => { b.textContent = b.clientWidth && b.clientWidth < 30 ? '' : b.dataset.name; }));
  }
  function uploadBtn(id) {
    const input = h('input', { type: 'file', accept: 'audio/*', 'aria-label': `为 Deck ${id} 选择音频文件` });
    input.addEventListener('change', () => { if (input.files[0]) loadFile(id, input.files[0]); });
    return h('label', { class: 'icon-btn file-btn', title: '换歌：选择文件，或拖进这张卡片', html: ICON.upload }, input);
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
      box.append(h('div', { class: 'lead', html: wheelSVG(null, null) }), h('span', { class: 'track-sub' }, '分析中…'));
      return;
    }
    const c = Analysis.compat(A.an, B.an);
    const keyCls = c.keyScore >= 0.85 ? '' : c.keyScore >= 0.6 ? 'warn' : 'hot';
    const bpmCls = Math.abs(c.bpmPct) <= 4 ? '' : Math.abs(c.bpmPct) <= 8 ? 'warn' : 'hot';
    box.append(
      h('div', { class: 'lead', title: `Camelot 调性轮盘：${A.an.key.camelot} → ${B.an.key.camelot}` },
        h('span', { html: wheelSVG(A.an.key, B.an.key) }),
        h('div', { class: 'score' }, h('b', {}, String(c.overall)), h('span', {}, '匹配'))),
      h('span', { class: 'sep' }),
      h('div', { class: 'fact' }, h('b', {}, `${A.an.key.camelot} → ${B.an.key.camelot}`), h('small', { class: keyCls }, c.rel)),
      h('div', { class: 'fact', title: `变速带来 ${c.semis >= 0 ? '+' : ''}${c.semis.toFixed(2)} 半音的音高变化` }, h('b', {}, `${A.an.bpm} → ${B.an.bpm}`), h('small', { class: bpmCls }, `B ${c.bpmPct >= 0 ? '加快' : '放慢'} ${Math.abs(c.bpmPct).toFixed(1)}%`)));
  }

  // twelve hours of the Camelot wheel as dots; the two songs are the large ones
  function wheelSVG(ka, kb) {
    const at = (n, r) => { const [x, y] = pt(r, (n % 12) * 30); return [(20 + x).toFixed(1), (20 + y).toFixed(1)]; };
    let out = '<svg viewBox="0 0 40 40" role="img" aria-label="Camelot 调性轮盘">';
    for (let n = 1; n <= 12; n++) {
      const [x, y] = at(n, 16);
      out += `<circle cx="${x}" cy="${y}" r="2" fill="${C.rail}"/>`;
    }
    if (ka) { const [x, y] = at(ka.num, 16); out += `<circle cx="${x}" cy="${y}" r="4" fill="${C.text}"/>`; }
    if (kb) { const [x, y] = at(kb.num, 16); out += `<circle cx="${x}" cy="${y}" r="${ka && ka.num === kb.num ? 2 : 4}" fill="${C.coach}"/>`; }
    return out + '</svg>';
  }

  async function loadDemo(id) {
    const demo = Synth.DEMOS[id];
    S.tracks[id] = { status: 'loading', step: '正在网页里合成示例曲…', title: demo.title, artist: demo.artist };
    trackCard(id);
    try {
      const buf = await demo.render();
      await setTrack(id, buf, { title: demo.title, artist: demo.artist, source: 'demo' });
    } catch (e) {
      S.tracks[id] = { status: 'error', step: '示例曲合成失败', error: '浏览器不支持离线音频合成，可以直接上传一首歌。' };
      trackCard(id);
    }
  }
  async function loadFile(id, file) {
    if (S.preview) togglePreview(S.preview);
    const title = file.name.replace(/\.[^.]+$/, '');
    S.tracks[id] = { status: 'loading', step: '正在解码音频…', title, artist: '你上传的歌 · 只在本地分析' };
    trackCard(id); refreshTracksUI();
    try {
      const buf = await Engine.context().decodeAudioData(await file.arrayBuffer());
      await setTrack(id, buf, { title, artist: '你上传的歌 · 只在本地分析', source: 'user' });
    } catch (e) {
      S.tracks[id] = { status: 'error', step: '没能读取这个文件', title, error: '换一个 mp3、wav 或 m4a 文件试试。' };
      trackCard(id); refreshTracksUI();
    }
  }
  async function setTrack(id, buffer, meta) {
    S.tracks[id] = { ...meta, status: 'loading', step: '分析中…' };
    trackCard(id);
    const an = await Analysis.analyze(buffer, step => { S.tracks[id].step = step + '…'; const el = $('#track' + id + ' .loading div:nth-child(2)'); if (el) el.textContent = step + '…'; });
    S.tracks[id] = { ...meta, status: 'ready', buffer, an };
    Engine.load(id, buffer, an);
    trackCard(id);
    refreshTracksUI();
  }
  function nudgeGrid(id, beats) {
    const t = S.tracks[id];
    Analysis.shiftDownbeat(t.an, beats);
    trackCard(id); refreshTracksUI();
    toast(`Deck ${id} 小节线已${beats > 0 ? '右' : '左'}移一拍`);
  }
  function refreshTracksUI() {
    renderCompat();
    const ready = ['A', 'B'].every(k => S.tracks[k] && S.tracks[k].status === 'ready');
    $('#toPlans').disabled = !ready;
    if (ready) {
      S.planset = Planner.make(S.tracks.A.an, S.tracks.B.an);
      S.aiPlans = null; S.plan = null; S.result = null; S.picked = null;
    } else S.planset = null;
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
    ['A', 'B'].forEach(id => { const b = $(`#track${id} [data-preview]`); if (b) b.innerHTML = S.preview === id ? ICON.pause.replace('<svg', '<svg width="18" height="18"') : ICON.play.replace('<svg', '<svg width="18" height="18"'); });
  }
  // The structure bar is the scrubber: a tap plays the section under the finger, a drag sets the exact spot.
  function bindScrub(strip, id) {
    let down = null;
    const an = () => S.tracks[id].an;
    const tAt = e => { const r = strip.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width) * an().duration; };
    const secAt = t => an().sections.find(s => t >= an().barTime(s.start) && t < an().barTime(s.end)) || an().sections[an().sections.length - 1];
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
  const PLAN_LINE = { swap: p => `叠 ${p.len} 小节，换低频`, filter: () => 'B 渐开，A 渐闷', echo: () => '回声甩尾，B 砸入' };
  function renderPlans() {
    const ps = S.planset;
    if (!ps) return;
    const A = S.tracks.A, B = S.tracks.B;
    const ai = S.aiPlans;
    const pickId = ai ? ai.pick : ps.pickId, pick = ps.plans.find(p => p.id === pickId);
    if (!S.picked) S.picked = pickId;
    const pending = Coach.state === 'online' && !ai && !S.aiPlansFailed;
    $('#verdict').textContent = ai ? ai.headline : pending ? 'AI 正在听这两首歌…' : `这两首歌最适合${pick.name}。`;
    const box = $('#plans');
    box.innerHTML = '';
    ps.plans.forEach(p => {
      box.append(h('button', { class: 'plan', 'data-plan': p.id, onclick: () => paintPick(p.id) },
        planArt(p),
        h('span', { class: 'plan-head' },
          h('span', {}, h('span', { class: 'plan-name' }, p.name), h('span', { class: 'plan-line' }, PLAN_LINE[p.id](p))),
          h('span', { class: 'fit' }, h('b', {}, String(p.fit)), h('small', { class: p.id === pickId ? 'pick' : '' }, p.id === pickId ? 'AI 推荐' : '匹配'))),
        h('span', { class: 'plan-meta' },
          h('span', {}, `${p.len} 小节`),
          h('span', { class: 'dots', 'aria-label': `难度 ${p.difficulty} / 3` }, ...[1, 2, 3].map(i => h('i', { class: i <= p.difficulty ? 'on' : '' })))),
        h('span', { class: 'script', 'aria-label': '步骤', html: p.steps.map(st => st.actions.map(a => ins(a, true)).join('')).join('') })));
    });
    paintPick(S.picked);
    if (pending && !S.aiPlansAsked) {
      S.aiPlansAsked = true;
      const planset = ps;
      Coach.reviewPlans(A, B, ps).then(r => {
        if (S.planset !== planset) return;
        if (r) S.aiPlans = r; else S.aiPlansFailed = true;
        if (S.view === 'plans') renderPlans();
      });
    }
  }
  function paintPick(id) {
    S.picked = id;
    $$('.plan').forEach(el => { const on = el.dataset.plan === id; el.classList.toggle('on', on); el.setAttribute('aria-pressed', on); });
    const p = S.planset.plans.find(x => x.id === id), copy = (S.aiPlans && S.aiPlans.plans && S.aiPlans.plans[id]) || Coach.fallbackPlanCopy(p);
    $('#barName').textContent = p.name;
    $('#barWhy').textContent = copy.why;
    $('#barWhy').title = copy.pitfall ? `易错：${copy.pitfall}` : '';
  }
  /* The script drawn from the script: dark while a deck carries the weight of the mix, pale once it has let go,
     with the blue line at the moment of handover and a trail of dots where an echo rings on. */
  function planArt(p) {
    const x0 = -2, x1 = p.len + 2, pc = b => clamp((b - x0) / (x1 - x0)) * 100;
    const weight = (id, rel) => {
      const c = Planner.stateAt(p, rel)[id], f = c.filter;
      return clamp(c.fader * Math.min(1, Engine.eqLin(c.low)) * (f < 0 ? 1 + f * 0.8 : Math.max(0, 1 - f)));
    };
    const capsule = (id, from, to) => {
      const stops = [];
      for (let i = 0; i <= 32; i++) {
        const rel = from + (to - from) * i / 32;
        stops.push(`color-mix(in srgb, var(--text) ${Math.round(weight(id, Math.min(rel, to - 0.01)) * 100)}%, var(--rail)) ${(i / 32 * 100).toFixed(1)}%`);
      }
      return h('span', { class: 'cap', style: `left:${pc(from)}%;width:${pc(to) - pc(from)}%;background:linear-gradient(90deg,${stops.join(',')})` });
    };
    const outA = p.actions.filter(a => a.deck === 'A' && a.ctrl === 'fader').map(a => a.bar + a.dur).pop() ?? x1;
    const laneA = h('span', { class: 'lane a' }, capsule('A', x0, outA));
    if (p.actions.some(a => a.ctrl === 'echo' && a.to > 0)) {
      [[14, .7], [10, .45], [7, .3], [4, .2]].forEach(([s, o], i) => laneA.append(h('span', { class: 'dot', style: `left:${pc(outA) + 4 + i * 7}%;width:${s}px;height:${s}px;opacity:${o}` })));
    }
    const hand = p.actions.find(a => a.deck === 'A' && a.dur === 0 && ((a.ctrl === 'low' && a.to === 0) || (a.ctrl === 'fader' && a.to === 0)));
    return h('span', { class: 'art', 'aria-hidden': 'true' }, laneA, h('span', { class: 'lane b' }, capsule('B', p.playBar, x1)),
      hand ? h('span', { class: 'cut', style: `left:calc(12px + (100% - 24px) * ${pc(hand.bar) / 100})` }) : null);
  }

  function askPanel(box) {
    box.innerHTML = '';
    const log = h('div', { class: 'ask-log', 'aria-live': 'polite' });
    const input = h('input', { id: box.id + 'Input', placeholder: Coach.state === 'online' ? '问点什么…' : '离线时只能答上面几题', 'aria-label': '问 AI 教练' });
    const send = async q => {
      q = q.trim(); if (!q) return;
      input.value = '';
      log.append(h('div', { class: 'msg q' }, q));
      const a = h('div', { class: 'msg a' }, '…');
      log.append(a);
      const faq = Coach.FAQ.find(f => f.q === q);
      if (Coach.state === 'online') {
        S.chat.push({ role: 'user', content: q });
        const text = await Coach.ask(S.chat.slice(-6), S.tracks.A, S.tracks.B, S.plan, t => { a.textContent = t; });
        if (text) { a.textContent = text; S.chat.push({ role: 'assistant', content: text }); return; }
        S.chat.pop();
      }
      a.textContent = faq ? faq.a : '连不上 Claude 时，只能回答上面几题。';
    };
    box.append(
      h('h2', {}, '问教练'),
      h('div', { class: 'ask-chips' }, ...Coach.FAQ.map(f => h('button', { onclick: () => send(f.q) }, f.q))),
      h('form', { onsubmit: e => { e.preventDefault(); send(input.value); } }, input, h('button', { class: 'btn', type: 'submit' }, '发送')),
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
    ui.sync = h('button', { class: 'tbtn sync', onclick: () => syncPressed(id), title: id === 'B' ? '同步（S 键）' : '同步', 'aria-label': `同步 Deck ${id}`, html: ICON.sync.replace('<svg', '<svg width="20" height="20"') });
    ui.play = h('button', { class: 'tbtn play', onclick: () => playPressed(id), title: id === 'B' ? '播放（空格键）' : '播放', 'aria-label': `播放或暂停 Deck ${id}` });
    const k = (ctrl, label) => new Ctl(id, ctrl, 'knob', label).el;
    const fader = new Ctl(id, 'fader', 'vf', '音量推子');
    const meter = h('i');
    fader.face.querySelector('.groove').append(meter);
    deckUI[id + 'meter'] = meter;
    deckUI[id] = ui;
    return h('section', { class: 'deck', 'data-deck': id, 'aria-label': `Deck ${id}` },
      h('div', { class: 'deck-main' },
        h('div', { class: 'deck-info' }, h('i', { class: `dk lg dk-${id}` }, id), h('div', { class: 'meta' }, ui.title, ui.sub), ui.cue, ui.sync, ui.play),
        h('div', { class: 'knobs' }, k('low', 'LOW'), k('mid', 'MID'), k('high', 'HIGH'), k('filter', 'FILTER'), k('echo', 'ECHO'), k('tempo', 'TEMPO'))),
      fader.el);
  }
  function mixerPanel() {
    const row = id => { const i = h('i'); deckUI[id + 'low'] = i; return h('div', { class: 'low-row' }, h('span', {}, id), h('u', {}, i)); };
    const low = h('div', { class: 'lowmeter', title: '两台同时亮满就是低频打架' }, h('span', {}, '低频'), row('A'), row('B'));
    deckUI.low = low;
    deckUI.phase = h('div', { class: 'phase idle' }, h('i'), h('span', {}, '未起播'));
    const xf = new Ctl('X', 'xf', 'hf', '交叉推子');
    return h('section', { class: 'mixer', 'aria-label': '调音台' }, low, deckUI.phase,
      h('div', { class: 'xfade' }, h('div', { class: 'ends' }, h('span', {}, 'A'), h('span', {}, 'B')), xf.el));
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
    if (s && id === 'B' && s.bStartRel == null && s.mode !== 'demo') {
      const nb = Engine.playQuantized(d, other);
      s.bStartRel = nb / 4 - s.plan.startA; s.bStartBy = 'user';
      return;
    }
    if (other.playing) Engine.playQuantized(d, other); else Engine.play(d);
  }
  function cuePressed(id) {
    const d = Engine.decks[id];
    if (!d.buffer) return;
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
    if (S.session) cancelSession();
    S.mode = mode;
    $$('.seg button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
    if (mode !== 'free' && S.plan) primeDecks();
    if (mode === 'demo') startSession();
    else if (fresh && mode === 'guide') toast('先完成准备，再按开始');
    updateStartBtn();
  }
  function updateStartBtn() {
    const b = $('#startBtn');
    b.textContent = S.session ? '■ 停止' : S.mode === 'free' ? '▶ 播放 A' : S.mode === 'demo' ? '▶ 再看一遍' : '▶ 开始';
    b.classList.toggle('primary', !S.session);
    b.classList.toggle('quiet', !!S.session);
  }

  function startSession() {
    const p = S.plan;
    if (!p) return;
    Engine.resume();
    const A = Engine.decks.A, B = Engine.decks.B;
    stopAll();
    if (S.mode === 'demo') { resetMixer(); }
    Engine.seek(A, S.cues.A); Engine.seek(B, S.cues.B);
    S.session = { plan: p, mode: S.mode, rec: [], bStartRel: null, bStartBy: null, lastRec: 0, ended: false, synced: false, alerts: {} };
    Engine.play(A);
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
    toast('你接手了，照常计分');
    updateStartBtn();
  }
  function relNow() {
    const A = Engine.decks.A;
    return A.an.barAt(Engine.pos(A)) - S.plan.startA;
  }
  function endSessionEarly() {
    const s = S.session;
    if (!s) return;
    if (relNow() >= s.plan.playBar + 1 && s.mode !== 'demo') finishSession();
    else { cancelSession(); toast('已停止，不计分'); }
  }
  function finishSession() {
    const s = S.session;
    if (!s || s.ended) return;
    s.ended = true;
    const result = Planner.evaluate(s.plan, s.rec, s);
    S.session = null;
    stopAll(); clearGhosts(); updateStartBtn();
    if (s.mode === 'demo') {
      S.lastDemoScore = result.total;
      setMode('guide');
      toast('示范结束，轮到你了');
      return;
    }
    S.result = { plan: s.plan, result, rec: s.rec, meta: { bStartRel: s.bStartRel, bStartBy: s.bStartBy } };
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
  function rescue(s, rel) {
    const p = s.plan, A = Engine.decks.A, B = Engine.decks.B;
    if (B.playing || s.bStartRel != null || rel < p.playBar + 1) return;
    if (Math.abs(Engine.bpmNow(B) - Engine.bpmNow(A)) > 0.05) syncPressed('B');
    // start B where it would be had it started on time, so the phrases still line up
    const nb = Math.ceil(Engine.beatPos(A) + 0.08), startBeat = (p.startA + p.playBar) * 4;
    B.offset = B.an.barTime(p.cueB) + (nb - startBeat) * B.an.beat;
    Engine.play(B, Engine.ctxTimeOf(A, A.an.down0 + nb * A.an.beat));
    s.bStartRel = p.playBar; s.bStartBy = 'ai';
    toast('AI 代按了 PLAY，这步只算半分');
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
    return `<svg viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="${r}" fill="none" stroke="${C.rail}" stroke-width="4"/><circle cx="26" cy="26" r="${r}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${(c * clamp(frac)).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 26 26)"/></svg><b>${label}</b>`;
  }

  let lastCoachKey = '';
  function coach(rel) {
    const p = S.plan, s = S.session, A = Engine.decks.A, B = Engine.decks.B;
    const card = $('#coachCard');
    const alerts = [];
    const bothLow = Engine.deckLowShare(A) > 0.3 && Engine.deckLowShare(B) > 0.3;
    const phase = Engine.phaseErrorMs();
    deckUI.low.classList.toggle('clash', bothLow);
    if (bothLow) alerts.push(['hot', '低频打架：两台的 LOW 不要同时开']);
    if (phase != null && Math.abs(phase) > 25 && Engine.deckLevel(A) > 0.05 && Engine.deckLevel(B) > 0.05) alerts.push(['hot', `鼓点错开 ${Math.round(Math.abs(phase))} ms，按 SYNC`]);

    let when = '', what = '', why = '', cnt = '', now = false;
    const ghosts = new Map(); const wanted = new Set();
    let stepIdx = null, stepN = 0;
    if (S.mode === 'free' || !p) {
      when = '自由模式'; what = '两台随便玩';
      why = '';
      cnt = countSVG(0, '∞', '自由', C.faint);
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
          when = s ? `准备 · 还有 ${Math.max(0, Math.ceil(-relShown * 4))} 拍进入过渡` : '准备';
          what = unmet.map(x => ins(x)).join(''); why = '';
          unmet.forEach(x => { if (x.ctrl === 'sync') wanted.add('B.sync'); else ghosts.set(`${x.deck}.${x.ctrl}`, [x.to, true]); });
        } else {
          when = '准备好了 · 第一步'; what = steps[0].actions.map(a => ins(a)).join('');
          why = s ? '' : 'A 会提前 4 小节放起来';
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
          when = `第 ${st.bar} 小节 · ${demo ? 'AI 即将' : '马上'}`;
          cnt = countSVG(1 - beats / 16, beats <= 4 ? String(Math.ceil(beats)) : `${bars}:${rem}`, beats <= 4 ? '拍后' : '小节:拍', C.coach);
          now = beats <= 4;
        } else {
          const prog = st.end > st.bar ? clamp((rel - st.bar) / (st.end - st.bar)) : 1;
          when = `第 ${st.bar} 小节 · ${demo ? 'AI 正在做' : '现在'}`;
          cnt = countSVG(prog, demo ? 'AI' : '现在', st.end > st.bar ? `${Math.round(prog * 100)}%` : '', C.coach);
          now = true;
        }
        what = st.actions.map(a => ins(a)).join('');
        why = st.actions.map(a => a.why).filter(Boolean)[0] || '';
        if (!demo) {
          for (const a of p.actions) {
            if (a.ctrl === 'play') { if (Math.abs(a.bar - rel) <= 2 && s && s.bStartRel == null) wanted.add('B.play'); continue; }
            if (rel >= a.bar - 2 && rel <= a.bar + a.dur + 0.5) ghosts.set(`${a.deck}.${a.ctrl}`, [rel < a.bar ? a.to : Planner.stateAt(p, rel)[a.deck][a.ctrl], st.actions.includes(a)]);
          }
        }
        if (isPlay && !demo && beats <= 4 && beats > 0) alerts.push(['info', '数到 0 按 PLAY（空格）']);
      }
      if (s && s.bStartBy === 'ai') alerts.push(['info', 'AI 代按了 B']);
      if (s && s.bStartBy === 'user' && s.bStartRel != null) {
        const off = Math.round((s.bStartRel - p.playBar) * 4);
        alerts.push(off === 0 ? ['good', 'B 进得准'] : ['hot', `B ${off > 0 ? '晚' : '早'}了 ${Math.abs(off)} 拍`]);
      }
      if (demo) alerts.push(['info', '动旋钮就能接手']);
      stepIdx = idx; stepN = steps.length;
    }
    const statusKey = JSON.stringify([stepIdx, stepN, alerts]);
    if (statusKey !== lastCoachKey) {
      lastCoachKey = statusKey;
      $('#stepDots').innerHTML = Array.from({ length: stepN }, (_, i) => `<i class="${i < stepIdx || stepIdx === -1 ? 'done' : i === stepIdx ? 'cur' : ''}"></i>`).join('');
      $('#alerts').innerHTML = alerts.map(([k, t]) => `<span class="alert ${k === 'hot' ? '' : k}">${t}</span>`).join('');
    }
    card.classList.toggle('now', now);
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
      ui.sub.textContent = `${Engine.bpmNow(d).toFixed(1)} BPM · ${fmtTime(p)}`;
      if (ui.play._on !== d.playing) {
        ui.play._on = d.playing;
        ui.play.classList.toggle('on', d.playing);
        ui.play.innerHTML = (d.playing ? ICON.pause : ICON.play).replace('<svg', '<svg width="18" height="18"');
      }
      const other = Engine.decks[id === 'A' ? 'B' : 'A'];
      ui.sync.classList.toggle('on', !!other.an && Math.abs(Engine.bpmNow(d) - Engine.bpmNow(other)) < 0.05);
      const lv = d.playing ? Engine.meterLevel(d) : 0;
      deckUI[id + 'meter'].style.transform = `scaleY(${clamp(Math.sqrt(lv) * 1.6).toFixed(3)})`;
      deckUI[id + 'low'].style.transform = `scaleX(${clamp(Engine.deckLowShare(d)).toFixed(3)})`;
    }
    const ph = Engine.phaseErrorMs(), abs = ph == null ? null : Math.abs(ph);
    const [cls, txt] = ph == null ? ['idle', '未起播'] : abs < 10 ? ['', '节拍对齐'] : abs < 25 ? ['warn', `差 ${Math.round(abs)} ms`] : ['hot', `错开 ${Math.round(abs)} ms`];
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
    const top = 20, laneH = 44, gap = 6, laneY = li => top + li * (laneH + gap), p = S.mode !== 'free' ? S.plan : null;
    const xOfABar = b => xc + ((A.an.barTime(b) - Engine.pos(A)) / Engine.rate(A)) * pxs;
    g.font = `500 11px ${FONT}`;
    if (p) {
      const x0 = xOfABar(p.startA), x1 = xOfABar(p.startA + p.len);
      g.fillStyle = C.booth; capsule(g, x0, top - 4, x1 - x0, H - top + 4, 12); g.fill();
      g.fillStyle = C.dim;
      for (let b = 0; b <= p.len; b += 8) { const x = xOfABar(p.startA + b); if (x > -20 && x < w) g.fillText(String(b), x + 2, 11); }
    } else {
      g.fillStyle = C.dim;
      for (let b = 0; b <= A.an.nBars; b += 8) { const x = xOfABar(b); if (x > -20 && x < w) g.fillText(String(b + 1), x + 2, 11); }
    }
    ['A', 'B'].forEach((id, li) => {
      const d = Engine.decks[id], y = laneY(li);
      if (!d.an) return;
      const pos = Engine.pos(d), rate = Engine.rate(d), c = d.ctrl, X = t => xc + (t - pos) / rate * pxs;
      structure(g, d.an, X, y, laneH, { w, r: 10, sticky: 40, past: xc, alpha: 0.35 + 0.65 * clamp(c.fader * 1.4), oneLine: true });
      // the deck badge, solid for A and outlined for B, stays pinned to the edge
      g.beginPath(); g.arc(18, y + laneH / 2, 12, 0, Math.PI * 2);
      g.fillStyle = id === 'A' ? C.text : C.card; g.fill();
      if (id === 'B') { g.strokeStyle = C.text; g.lineWidth = 1.5; g.stroke(); }
      g.fillStyle = id === 'A' ? C.ink : C.text; g.font = `700 12px ${FONT}`; g.textAlign = 'center'; g.fillText(id, 18, y + laneH / 2 + 4); g.textAlign = 'left';
    });
    if (p) {
      const stack = {};
      for (const a of p.actions) {
        const li = a.deck === 'A' ? 0 : 1, sk = a.deck + a.bar, n = (stack[sk] = (stack[sk] ?? -1) + 1), cy = laneY(li) + laneH / 2 + n * 14 - (n ? 7 : 0), x = xOfABar(p.startA + a.bar);
        const x1 = xOfABar(p.startA + a.bar + a.dur);
        if (x1 < -10 || x > w + 10) continue;
        const col = x1 < xc ? C.faint : C.coach;
        if (a.dur > 0) { g.fillStyle = alpha(col, 0.55); capsule(g, x, cy - 2, x1 - x, 4, 2); g.fill(); }
        g.beginPath(); g.arc(x, cy, 6, 0, Math.PI * 2); g.fillStyle = col; g.fill();
        g.strokeStyle = C.card; g.lineWidth = 2; g.stroke();
      }
    }
    g.fillStyle = C.text; capsule(g, xc - 1, 14, 2, H - 14, 1); g.fill();
  }

  /* ================= view 4 · review ================= */
  function renderReview() {
    const R = S.result;
    if (!R) return;
    const { plan: p, result: r } = R;
    $('#reviewTitle').textContent = `${p.name} · ${p.en}`;
    $('#scoreNum').textContent = String(r.total);
    $('#scoreGrade').textContent = r.total >= 85 ? '可以上台了。' : r.total >= 70 ? '很接近了。' : r.total >= 50 ? '方向对了。' : '再来一次。';
    $('#scoreSub').textContent = S.lastDemoScore != null ? `AI 示范 ${S.lastDemoScore} 分` : '';
    const mx = $('#metrics');
    mx.innerHTML = '';
    Object.keys(Planner.METRIC_LABEL).forEach(k => {
      const v = Math.round(r.metrics[k] * 100);
      mx.append(h('div', { class: 'metric pre', style: `--v:${(v / 100).toFixed(3)}` }, h('span', {}, Planner.METRIC_LABEL[k]), h('u', {}, h('i')), h('b', {}, String(v))));
    });
    // the one thing to change next time: the weakest thing the viewer did
    const parts = r.stepResults.flatMap(sr => sr.parts), worst = parts.reduce((a, b) => b.score < a.score ? b : a, parts[0]);
    $('#nextChip').innerHTML = worst && worst.score < 0.8 ? `${ins(worst.a, true)}<span class="next-note">${worst.note}</span>` : '';
    const cm = $('#comment'), fallback = Coach.fallbackReview(r).split('\n').pop().replace(/^·\s*(下次目标：)?/, '');
    if (Coach.state === 'online') {
      cm.textContent = 'AI 正在听回放…';
      Coach.review(S.tracks.A, S.tracks.B, p, r, t => { cm.textContent = t; }).then(t => {
        if (S.result !== R) return;
        cm.textContent = t ? t.trim() : fallback;
      });
    } else cm.textContent = fallback;
    const sl = $('#stepsList');
    sl.innerHTML = '';
    r.stepResults.forEach(sr => {
      const ok = sr.score >= 0.75;
      sl.append(h('div', { class: 'srow pre', style: `transition-delay:${sl.childElementCount * 50}ms`, html: sr.step.actions.map(a => ins(a, true)).join('') },
        h('span', { class: 'note' + (ok ? ' ok' : ''), html: (ok ? ICON.check : '') + sr.parts.map(x => x.note).join(' · ') })));
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
      g.fillStyle = deckColor(r.deck); g.font = `600 11px ${FONT}`; g.fillText(`${r.deck} ${NAME[r.ctrl]}`, 4, y0 + rowH / 2 + 4);
      g.strokeStyle = C.coach; g.lineWidth = 2; g.setLineDash([5, 4]); g.beginPath();
      for (let px = X(x0); px <= X(x1); px += 3) { const rel = x0 + (px - L) / (w - L - 8) * (x1 - x0), v = Planner.stateAt(p, rel)[r.deck][r.ctrl]; px === X(x0) ? g.moveTo(px, Y(v)) : g.lineTo(px, Y(v)); }
      g.stroke(); g.setLineDash([]);
      g.strokeStyle = deckColor(r.deck); g.lineWidth = 2; g.beginPath();
      let started = false;
      rec.forEach(s => { if (s.rel < x0 || s.rel > x1) return; const x = X(s.rel), y = Y(s[r.deck][r.ctrl]); if (!started) { g.moveTo(x, y); started = true; } else g.lineTo(x, y); });
      g.stroke();
    });
    const m = R.meta;
    if (m.bStartRel != null) { const x = X(m.bStartRel); g.fillStyle = C['deck-b']; g.fillRect(x - 1, top - 4, 2, rows.length * rowH + 4); g.font = `500 10px ${FONT}`; g.fillText(m.bStartBy === 'ai' ? 'B 起播（AI 代按）' : 'B 起播', x + 4, top + rows.length * rowH + 14); }
  }

  /* ================= navigation & boot ================= */
  function updateNav() {
    const ready = !!S.planset;
    $$('nav.steps button').forEach(b => {
      const v = b.dataset.go;
      b.disabled = v === 'tracks' ? false : v === 'plans' ? !ready : v === 'practice' ? !(ready && S.plan) : !S.result;
      b.classList.toggle('on', v === S.view);
    });
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
    if (view === 'plans') { renderPlans(); askPanel($('#askPlans')); }
    if (view === 'practice') {
      buildConsole();
      $('#sessionTitle').textContent = S.plan ? S.plan.name : '练习';
      lastCoachKey = '';
    }
    if (view === 'review') renderReview();
  }

  function frame() {
    requestAnimationFrame(frame);
    if (!Engine.decks.A) return;
    if (S.view === 'practice') {
      const s = S.session;
      let rel = 0;
      if (s) {
        rel = relNow();
        if (s.mode === 'demo') autopilot(s, rel); else rescue(s, rel);
        if (Engine.now - s.lastRec > 0.03) { s.lastRec = Engine.now; s.rec.push(sampleNow(rel)); }
        if (rel > s.plan.len + 1.5 || (!Engine.decks.A.playing && rel > 0)) finishSession();
      }
      updateConsole(); coach(rel); drawLanes();
    } else if (S.view === 'tracks' && S.preview) {
      const d = Engine.decks[S.preview];
      if (d.an) setHead(S.preview, S.scrub && S.scrub.id === S.preview ? S.scrub.t : Engine.pos(d));
      if (!d.playing && !S.scrub) stopPreview();
    }
  }

  function updateChip(state) {
    const chip = $('#aiChip');
    chip.dataset.state = state;
    chip.querySelector('span').textContent = { checking: '连接中', online: 'AI 在线', offline: '离线教练', busy: 'AI 休息中' }[state];
    chip.title = state === 'online' ? '方案点评、复盘和问答由 Claude 实时生成' : '在 claude.ai 里打开并允许 AI 调用后，Claude 会接管点评和问答；现在由规则引擎教学';
    if (S.view === 'plans' && state === 'online' && !S.aiPlans) renderPlans();
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
    document.addEventListener('keydown', e => {
      if (S.view !== 'practice' || e.target.closest('input, textarea, [role="slider"]')) return;
      if (e.code === 'Space') { e.preventDefault(); playPressed('B'); }
      else if (e.key === 's' || e.key === 'S') syncPressed('B');
    });
    let rz;
    window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => {
      if (S.view === 'tracks') { trackCard('A'); trackCard('B'); }
      if (S.view === 'plans') renderPlans();
      if (S.view === 'review') drawCompare();
    }, 150); });
    // canvases and inline SVG read colours once; repaint when the viewer's theme flips
    const onTheme = () => {
      readColors();
      $$('canvas').forEach(c => { c._cache = null; });
      if (S.view === 'tracks') { trackCard('A'); trackCard('B'); renderCompat(); }
      if (S.view === 'plans') renderPlans();
      if (S.view === 'review') drawCompare();
    };
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', onTheme);
    new MutationObserver(onTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    Coach.onState(updateChip);
    Engine.context();
    loadDemo('A'); loadDemo('B');
    requestAnimationFrame(frame);
  }
  boot();
  window.__segue = { S, Engine, Planner };
})();
