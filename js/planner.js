/* Segue · transition planner, scoring and the AI coach layer
 *
 * Division of labour (the core product decision):
 *   - The rule engine turns analysis into executable transition scripts:
 *     exact bars, exact knob targets. Deterministic, testable, scorable.
 *   - Claude (when the viewer allows it) judges and explains: which script
 *     suits this learner, why it sounds good, what beginners get wrong,
 *     and answers questions. It never has to be right about timing.
 *   - With no Claude available the rule engine's own copy is shown. */
const Planner = (() => {
  const CTRL_NAME = { fader: '音量推子', low: 'LOW', mid: 'MID', high: 'HIGH', filter: 'FILTER', echo: 'ECHO', play: 'PLAY', sync: 'SYNC' };
  const DEFAULTS = {
    A: { fader: 1, low: 0.5, mid: 0.5, high: 0.5, filter: 0, echo: 0 },
    B: { fader: 0, low: 0.5, mid: 0.5, high: 0.5, filter: 0, echo: 0 },
  };
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const align8 = b => Math.max(0, Math.floor(b / 8) * 8);
  const meanOf = (arr, a, b) => { let s = 0, n = 0; for (let i = Math.max(0, a); i < Math.min(arr.length, b); i++) { s += arr[i]; n++; } return n ? s / n : 0; };

  /* Where to mix. A DJ does not start "32 bars before the end": they find the phrase where the first song
   * thins out, and cue the second song so that its bass line arrives on the very bar the bass is swapped.
   * Try every phrase start of both songs and keep the pair that sounds best:
   *   out    the first song is past its last high point when the mix ends
   *   bass   the second song's bass line arrives on the swap bar (`half`), not before and not after
   *   lift   the second song is fuller after the mix than the first song was going out
   *   clean  little of the overlap has two melodies fighting
   *   early  the second song comes in from its opening, the way it was written to be mixed */
  function findSpot(A, B, len, half, c, fallback) {
    const startsA = [], startsB = [];
    for (let s = A.phraseOffset % 8; s + len <= A.nBars; s += 8) if (s >= 8 && s >= A.nBars * 0.4) startsA.push(s);
    const lastCue = Math.min(B.nBars - len - 8, Math.max(B.firstDrop ?? 0, 16));
    for (let s = B.phraseOffset % 8; s <= lastCue; s += 8) startsB.push(s);
    let best = null;
    for (const sA of startsA) for (const cB of startsB) {
      const ov = Analysis.overlap(A, B, sA, cB, len, c);
      const out = clamp(1 - Math.abs(sA + half - A.lastDropEnd) / 24);
      const before = meanOf(B.barBass, cB, cB + half), after = meanOf(B.barBass, cB + half, cB + half + 4);
      const bass = clamp((after - 0.3) / 0.4) * (0.55 + 0.45 * clamp(1 - before / 0.5));
      const lift = clamp(0.5 + (meanOf(B.barEnergy, cB + len, cB + len + 8) - meanOf(A.barEnergy, sA + len, sA + len + 8)));
      const early = 1 - cB / Math.max(8, lastCue);
      const score = 0.25 * out + 0.2 * bass + 0.1 * lift + 0.35 * (1 - ov.clash) + 0.1 * early + (sA === fallback.startA && cB === fallback.cueB ? 0.02 : 0);
      if (!best || score > best.score + 1e-9) best = { startA: sA, cueB: cB, score, out, bass, lift, ov };
    }
    if (!best) {
      const ov = Analysis.overlap(A, B, fallback.startA, fallback.cueB, len, c);
      best = { ...fallback, score: 0, out: 0.5, bass: 0.5, lift: 0.5, ov };
    }
    // what the coach can say about this spot, in the order a listener would notice it
    best.listen = {
      melody: +best.ov.mel.toFixed(2), blend: best.ov.harm == null ? null : +best.ov.harm.toFixed(2), clash: +best.ov.clash.toFixed(2),
      bassOnSwap: best.bass >= 0.7, bassIn: best.ov.bassIn, thinOut: best.out >= 0.6, duck: best.ov.clash >= 0.2,
    };
    return best;
  }

  function make(analA, analB) {
    const c = Analysis.compat(analA, analB);
    const outroA = analA.lastDropEnd, barsA = analA.nBars;
    const introB = analB.sections[0] && !analB.sections[0].high ? analB.sections[0].end : 0;
    const swapLen = barsA >= 48 ? 32 : 16;
    const plans = [];
    // two melodies that grind against each other: the first song's MID comes down early to make room
    const duckMid = (sp, bar, dur) => sp.listen.duck
      ? [{ bar, dur, deck: 'A', ctrl: 'mid', to: 0.22, label: '把前一首的 MID 收到 9 点', why: '两首的旋律不合，前一首先让出中频' }] : [];

    {
      const half = swapLen / 2;
      const sp = findSpot(analA, analB, swapLen, half, c, { startA: Math.max(8, align8(Math.min(outroA, barsA - swapLen))), cueB: analB.phraseOffset % 8 });
      plans.push({
        id: 'swap', name: '长混', en: 'Bass Swap', difficulty: 2, len: swapLen, startA: sp.startA, cueB: sp.cueB, listen: sp.listen,
        tagline: `两首歌叠 ${swapLen} 小节，在乐句点交换低频`,
        tags: ['夜店最常用', '丝滑'],
        fit: Math.round(100 * (0.3 * (1 - sp.ov.clash) + 0.2 * c.keyScore + 0.3 * c.bpmScore + 0.2 * (0.4 + 0.6 * sp.bass))),
        pre: [
          { deck: 'B', ctrl: 'sync', label: '按 SYNC，让后一首的速度追上前一首' },
          { deck: 'B', ctrl: 'low', to: 0, label: '把后一首的 LOW 拧到底' },
          { deck: 'B', ctrl: 'fader', to: 0, label: '后一首的推子放在最下面' },
        ],
        actions: [
          { bar: 0, deck: 'B', ctrl: 'play', label: '前一首进新乐句的第一拍，按后一首的 PLAY', why: '卡在乐句头，段落才对齐' },
          { bar: 0, dur: half / 2, deck: 'B', ctrl: 'fader', to: 1, label: `${half / 2} 小节内慢慢把后一首推满`, why: '后一首还没低音，慢慢推不抢戏' },
          ...duckMid(sp, half / 2, half / 2),
          { bar: half, deck: 'A', ctrl: 'low', to: 0, label: '交换低频：前一首的 LOW 拧到底', why: sp.listen.bassOnSwap ? '后一首的贝斯正好在这一拍进来' : '乐句头换低音，听着最顺' },
          { bar: half, deck: 'B', ctrl: 'low', to: 0.5, label: '同时把后一首的 LOW 拧回 12 点', why: '一出一进，低音只留一首' },
          { bar: half + 4, dur: 4, deck: 'A', ctrl: 'high', to: 0.22, label: '把前一首的 HIGH 慢慢收到 9 点', why: '两套镲会糊，前一首先退' },
          { bar: half + half / 2, dur: half / 2, deck: 'A', ctrl: 'fader', to: 0, label: `最后 ${half / 2} 小节把前一首拉下去`, why: '前一首自然淡出' },
        ],
      });
    }
    {
      const sp = findSpot(analA, analB, 16, 8, c, { startA: Math.max(8, align8(Math.min(outroA, barsA - 16))), cueB: analB.phraseOffset % 8 });
      plans.push({
        id: 'filter', name: '滤波推进', en: 'Filter Ride', difficulty: 2, len: 16, startA: sp.startA, cueB: sp.cueB, listen: sp.listen,
        tagline: '后一首从高通里长出来，前一首闷下去让位',
        tags: ['有张力', '16 小节'],
        fit: Math.round(100 * (0.25 * (1 - sp.ov.clash) + 0.15 * c.keyScore + 0.4 * c.bpmScore + 0.12)),
        pre: [
          { deck: 'B', ctrl: 'sync', label: '按 SYNC，让后一首的速度追上前一首' },
          { deck: 'B', ctrl: 'filter', to: 0.75, label: '后一首的 FILTER 往右拧到 4 点钟（高通）' },
          { deck: 'B', ctrl: 'fader', to: 0, label: '后一首的推子放在最下面' },
        ],
        actions: [
          { bar: 0, deck: 'B', ctrl: 'play', label: '前一首进新乐句的第一拍，按后一首的 PLAY', why: '后一首现在只有高频' },
          { bar: 0, dur: 4, deck: 'B', ctrl: 'fader', to: 1, label: '4 小节内推满后一首', why: '只有高频，推满不打架' },
          { bar: 4, dur: 8, deck: 'B', ctrl: 'filter', to: 0, label: '8 小节内把后一首的 FILTER 转回 12 点', why: '慢慢打开，就是一段铺垫' },
          { bar: 4, dur: 8, deck: 'A', ctrl: 'filter', to: -0.6, label: '同时前一首的 FILTER 往左拧到 8 点钟', why: '前一首变闷，把空间让给后一首' },
          { bar: 8, deck: 'A', ctrl: 'low', to: 0, label: '前一首的 LOW 拧到底', why: '后一首的低音要来了，前一首先让' },
          { bar: 12, dur: 4, deck: 'A', ctrl: 'fader', to: 0, label: '最后 4 小节拉下前一首', why: '后一首全开了，前一首退场' },
        ],
      });
    }
    {
      const exit = Math.max(8, align8(analA.lastDropEnd));
      const S = Math.min(exit, barsA - 4) - 4;
      const cue = analB.firstDrop ?? analB.phraseOffset % 8;
      // the two songs barely overlap here: only the echo tail of the first one rings over the second
      const ov = Analysis.overlap(analA, analB, S + 4, cue, 2, c);
      plans.push({
        id: 'echo', name: '回声收尾', en: 'Echo Out', difficulty: 1, len: 8, startA: S, cueB: cue,
        listen: { melody: 0, blend: ov.harm == null ? null : +ov.harm.toFixed(2), clash: 0, bassOnSwap: false, bassIn: 0, thinOut: true, cut: true },
        tagline: '前一首用回声甩出去，后一首直接从 drop 砸进来',
        tags: ['新手友好', '干脆利落'],
        fit: Math.round(100 * (0.1 * c.keyScore + 0.3 * c.bpmScore + 0.35 * (analB.firstDrop != null ? 1 : 0.5) + 0.1)),
        pre: [
          { deck: 'B', ctrl: 'sync', label: '按 SYNC，让后一首的速度追上前一首' },
          { deck: 'B', ctrl: 'fader', to: 1, label: '后一首的推子先推满（它会从 drop 直接进来）' },
        ],
        actions: [
          { bar: 2, dur: 2, deck: 'A', ctrl: 'filter', to: -0.35, label: '前一首的 FILTER 往左拧一点', why: '前一首变暗，预告要换歌' },
          { bar: 3, deck: 'A', ctrl: 'echo', to: 0.8, label: '最后一小节：打开前一首的 ECHO', why: '让最后一拍拖出尾巴' },
          { bar: 4, deck: 'A', ctrl: 'fader', to: 0, label: '前一首的推子一把拉下', why: '尾巴还在响，像甩出去' },
          { bar: 4, deck: 'B', ctrl: 'play', label: '同一拍按后一首的 PLAY', why: '后一首从高潮直接接上' },
          { bar: 6, deck: 'A', ctrl: 'echo', to: 0, label: '回声收掉', why: '收掉回声' },
        ],
      });
    }
    plans.forEach(normalize);
    // a long overlap needs the two tempos close: past about 6% the pitch shift is audible, so the short hand-over wins
    const gap = Math.abs(c.bpmPct);
    if (gap > 6) plans.forEach(p => { p.fit = p.id === 'echo' ? Math.min(96, p.fit + 22) : Math.round(p.fit * 0.8); p.tempoGap = true; });
    // an overlap that will sound sour is the other reason to keep it short
    const long = plans.find(p => p.id === 'swap').listen, cut = plans.find(p => p.id === 'echo');
    cut.sour = long.duck;
    if (long.clash >= 0.45 && gap <= 6) cut.fit = Math.min(94, cut.fit + 14);
    const ranked = [...plans].sort((a, b) => b.fit - a.fit || a.difficulty - b.difficulty);
    ranked[0].pick = true;
    return { plans, compat: c, reasons: reasons(analA, analB, c, plans), pickId: ranked[0].id };
  }

  function normalize(p) {
    const st = { A: { ...DEFAULTS.A }, B: { ...DEFAULTS.B } };
    p.pre.forEach(x => { if (x.to != null) st[x.deck][x.ctrl] = x.to; });
    p.actions.sort((a, b) => a.bar - b.bar);
    p.actions.forEach(a => {
      a.dur = a.dur || 0;
      if (a.ctrl !== 'play') { a.from = st[a.deck][a.ctrl]; st[a.deck][a.ctrl] = a.to; }
    });
    const groups = new Map();
    p.actions.forEach(a => { if (!groups.has(a.bar)) groups.set(a.bar, []); groups.get(a.bar).push(a); });
    p.steps = [...groups.entries()].map(([bar, acts]) => ({ bar, end: Math.max(...acts.map(a => a.bar + a.dur)), actions: acts }));
    p.playBar = (p.actions.find(a => a.ctrl === 'play') || {}).bar ?? 0;
    p.why = p.actions.map(a => a.why).filter(Boolean)[0];
  }

  // The full mixer state the script asks for at a given bar relative to the transition start.
  function stateAt(p, rel) {
    const st = { A: { ...DEFAULTS.A }, B: { ...DEFAULTS.B }, bPlaying: rel >= p.playBar };
    p.pre.forEach(x => { if (x.to != null) st[x.deck][x.ctrl] = x.to; });
    for (const a of p.actions) {
      if (a.ctrl === 'play' || rel < a.bar) continue;
      st[a.deck][a.ctrl] = a.dur > 0 && rel < a.bar + a.dur ? a.from + (a.to - a.from) * (rel - a.bar) / a.dur : a.to;
    }
    return st;
  }

  function reasons(A, B, c, plans) {
    const out = [];
    out.push({ k: '调性', v: `${A.key.camelot} → ${B.key.camelot}`, note: c.rel, good: c.keyScore >= 0.85 });
    const pct = c.bpmPct;
    out.push({ k: '速度', v: `${A.bpm} → ${B.bpm}`, note: `后一首${pct >= 0 ? '加快' : '放慢'} ${Math.abs(pct).toFixed(1)}%`, good: Math.abs(pct) <= 4 });
    const swap = plans.find(p => p.id === 'swap');
    out.push({ k: '前一首出口', v: `第 ${swap.startA} 小节`, note: `后面还有 ${A.nBars - swap.startA} 小节可混`, good: A.nBars - swap.startA >= 16 });
    const intro = B.sections[0];
    out.push({ k: '后一首入口', v: intro ? `${intro.end - intro.start} 小节前奏` : '无前奏', note: B.firstDrop != null ? `drop 在第 ${B.firstDrop} 小节` : '没找到明显 drop', good: !!intro && !intro.high });
    return out;
  }

  // ---------- scoring ----------
  function evaluate(p, rec, meta) {
    const within = (a, b) => rec.filter(s => s.rel >= a && s.rel <= b);
    const stepResults = p.steps.map(step => {
      const parts = step.actions.map(a => {
        if (a.ctrl === 'play') {
          if (meta.bStartRel == null) return { a, score: 0, note: '后一首没放出来' };
          const off = Math.round((meta.bStartRel - a.bar) * 4);
          const by = meta.bStartBy === 'ai' ? '（帮你按的）' : '';
          return { a, score: off === 0 ? (meta.bStartBy === 'ai' ? 0.5 : 1) : clamp(1 - Math.abs(off) / 4) * 0.7, note: (off === 0 ? '卡在乐句第一拍' : `${off > 0 ? '晚' : '早'}了 ${Math.abs(off)} 拍`) + by, off };
        }
        const val = s => s[a.deck][a.ctrl];
        if (a.dur > 0) {
          const span = within(a.bar, a.bar + a.dur);
          const err = span.length ? span.reduce((t, s) => t + Math.abs(val(s) - stateAt(p, s.rel)[a.deck][a.ctrl]), 0) / span.length : 1;
          const tail = within(a.bar + a.dur, a.bar + a.dur + 1.5);
          const miss = tail.length ? Math.min(...tail.map(s => Math.abs(val(s) - a.to))) : 1;
          const score = 0.55 * clamp(1 - err / 0.3) + 0.45 * (miss < 0.12 ? 1 : clamp(1 - (miss - 0.12) / 0.3));
          return { a, score, note: miss >= 0.12 ? '没到目标位置' : err > 0.15 ? '推得不够匀' : '跟得很稳' };
        }
        const win = within(a.bar - 2, a.bar + 3), near = s => Math.abs(val(s) - a.to) < 0.12;
        const hitS = win.find((s, i) => i > 0 && near(s) && !near(win[i - 1]));
        if (!hitS) {
          // early is fine, but only if the viewer actually moved it there: a control that never left the target earns nothing
          if (win.length && win.every(near) && rec.some(s => s.rel < a.bar - 2 && !near(s))) return { a, score: 0.7, note: '提前就位了' };
          return { a, score: 0, note: '漏了这步' };
        }
        const dt = (hitS.rel - a.bar) * 4;
        return { a, score: clamp(1 - Math.max(0, Math.abs(dt) - 0.5) / 3), note: Math.abs(dt) <= 0.75 ? '时机准' : `${dt > 0 ? '晚' : '早'}了 ${Math.abs(dt).toFixed(1)} 拍`, dt };
      });
      return { step, parts, score: parts.reduce((t, x) => t + x.score, 0) / parts.length };
    });

    const win = within(0, p.len);
    const dt = win.length > 1 ? (win[win.length - 1].rel - win[0].rel) / (win.length - 1) : 0;
    const overlap = win.filter(s => s.phase != null && s.lvA > 0.05 && s.lvB > 0.05);
    const bHeard = win.some(s => s.lvB > 0.05);
    const beat = !bHeard ? 0 : overlap.length ? overlap.reduce((t, s) => t + clamp(1 - Math.max(0, Math.abs(s.phase) - 6) / 30), 0) / overlap.length : 1;
    const playStep = stepResults.flatMap(r => r.parts).find(x => x.a.ctrl === 'play');
    const off = playStep ? playStep.off : null;
    const phrase = off == null ? 0 : off === 0 ? (meta.bStartBy === 'ai' ? 0.6 : 1) : Math.abs(off) <= 1 ? 0.6 : Math.abs(off) <= 4 ? 0.3 : 0.1;
    const clashBars = win.filter(s => s.clash).length * dt;
    let bass = clamp(1 - clashBars * 4 / 8);
    const bad = win.filter(s => s.level < 0.42 || s.level > 1.95).length / (win.length || 1);
    let level = clamp(1 - bad * 1.6);
    // A clean-sounding mix that never handed over to B is not a transition.
    const end = within(p.len - 1, p.len + 0.5);
    const handover = end.length > 0 && end.every(s => s.lvB > 0.25 && s.lvA < 0.35);
    if (!handover) { bass = Math.min(bass, 0.4); level = Math.min(level, 0.4); }
    const steps = stepResults.reduce((t, r) => t + r.score, 0) / (stepResults.length || 1);
    const metrics = { beat, phrase, bass, level, steps };
    const total = Math.round(100 * (0.15 * beat + 0.2 * phrase + 0.25 * bass + 0.15 * level + 0.25 * steps));
    return { metrics, total, stepResults, handover, aiStarted: meta.bStartBy === 'ai', clashBeats: clashBars * 4, worstPhase: overlap.length ? Math.max(...overlap.map(s => Math.abs(s.phase))) : 0 };
  }

  const METRIC_LABEL = { beat: '节拍对齐', phrase: '乐句时机', bass: '低频干净', level: '音量平稳', steps: '动作到位' };

  return { make, stateAt, evaluate, CTRL_NAME, DEFAULTS, METRIC_LABEL };
})();

/* The AI coach. Uses Claude through the artifact's `sample` capability when the
 * viewer allows it; otherwise falls back to the rule engine's own words. */
const Coach = (() => {
  let sample = null, state = 'checking';
  const listeners = [];
  const emit = () => listeners.forEach(f => f(state));

  (async () => {
    try {
      if (window.claude && typeof window.claude.use === 'function') sample = await window.claude.use('sample');
    } catch (e) { sample = null; }
    state = sample ? 'online' : 'offline';
    emit();
  })();

  function fail(e) {
    if (e && (e.code === 'not_granted' || e.code === 'unavailable')) { sample = null; state = 'offline'; emit(); }
    else if (e && e.code === 'rate_limited') { state = 'busy'; emit(); setTimeout(() => { if (sample) { state = 'online'; emit(); } }, 30000); }
  }

  const PERSONA = '你是 Segue 的 AI 混音教练：一位耐心、专业、说话口语化的俱乐部 DJ，正在教第一次接触打碟的新手。只用中文回答，不用 Markdown 标题，不编造数据里没有的事实。两首歌一律叫“前一首”和“后一首”，不要写 A、B 或 Deck。';
  // whatever the model writes, the interface never calls a song by a letter
  const noAB = s => typeof s === 'string' ? s.replace(/(^|[^A-Za-z0-9#♯])\s?(?:Deck\s?)?([AB])(?![A-Za-z0-9#♯♭])\s?/g, (m, pre, d) => pre + (d === 'A' ? '前一首' : '后一首')) : s;

  function summary(A, B, plan) {
    const sec = an => an.sections.map(s => `${s.type}:${s.start}-${s.end}`).join(' ');
    return {
      前一首: { title: A.title, bpm: A.an.bpm, key: `${A.an.key.name} (${A.an.key.camelot})`, bars: A.an.nBars, sections: sec(A.an) },
      后一首: { title: B.title, bpm: B.an.bpm, key: `${B.an.key.name} (${B.an.key.camelot})`, bars: B.an.nBars, sections: sec(B.an) },
      plan: plan ? { id: plan.id, name: plan.name, bars: plan.len, 重叠段听感: listenWords(plan), steps: plan.steps.map(s => `第${s.bar}小节: ` + s.actions.map(a => a.label).join(' + ')) } : undefined,
    };
  }

  // the listening results in words the model (and a person reading the prompt) can use directly
  function heard(c) {
    const out = {};
    if (c.shift || Math.abs(c.cents) > 30) out.变速后的音高 = `后一首整体${c.semis >= 0 ? '升高' : '降低'} ${Math.abs(c.semis).toFixed(2)} 个半音，听到的调是 ${c.heardKey.name} (${c.heardKey.camelot})${Math.abs(c.cents) > 30 ? '，夹在两个调之间，长音叠着会发酸' : ''}`;
    if (Math.abs(c.loudDb) >= 1.5) out.响度 = `后一首比前一首${c.loudDb > 0 ? '响' : '轻'} ${Math.abs(c.loudDb).toFixed(1)} dB（已自动补平）`;
    return out;
  }
  function listenWords(p) {
    const L = p.listen;
    if (!L) return undefined;
    if (L.cut) return { 重叠: '几乎不重叠，只有前一首的回声尾巴', 回声尾巴和后一首的音: L.blend == null ? '后一首进来时没有旋律' : L.blend >= 0.6 ? '合得上' : '不太合，回声别留太久' };
    return {
      两首同时有旋律的比例: `${Math.round(L.melody * 100)}%`,
      叠在一起的音: L.blend == null ? '有一首只有鼓，不会打架' : L.blend >= 0.7 ? '很合' : L.blend >= 0.45 ? '基本合' : '不合，会发酸',
      后一首的贝斯: L.bassIn == null ? '这段里一直没进来' : L.bassOnSwap ? `正好在换低频那一拍（第 ${L.bassIn} 小节）进来` : L.bassIn === 0 ? '从一开始就有，所以先关它的 LOW' : `在第 ${L.bassIn} 小节进来`,
      前一首: L.thinOut ? '混的时候正在收尾变薄' : '混的时候还在高潮里',
    };
  }

  async function reviewPlans(A, B, planset) {
    if (!sample) return null;
    const data = {
      ...summary(A, B),
      compat: { relation: planset.compat.rel, 后一首需要变速: `${planset.compat.bpmPct.toFixed(1)}%`, ...heard(planset.compat) },
      plans: planset.plans.map(p => ({ id: p.id, name: `${p.name} ${p.en}`, difficulty: p.difficulty, bars: p.len, 前一首从第几小节开始混: p.startA, 后一首从它的第几小节进: p.cueB, ruleFit: p.fit, 重叠段听感: listenWords(p), steps: p.steps.map(s => `+${s.bar}: ` + s.actions.map(a => a.label).join(' / ')) })),
    };
    const prompt = `${PERSONA}
下面是浏览器本地分析两首歌得到的数据，以及规则引擎生成的 3 个可执行过渡方案（时间点已经算好，你不需要改）。
“重叠段听感”是逐小节听两首歌叠在一起的那一段得到的：旋律重叠多不多、叠在一起的音合不合、后一首的贝斯在哪一拍进来。点评要用上这些具体发现，不要说放在任何两首歌上都成立的话。
请判断：哪个方案最适合这位新手现在先练？并为每个方案写一句"为什么这样接好听"和一句"新手最容易犯的错"。
只输出 JSON，不要任何其他文字：
{"pick":"<方案 id>","headline":"<不超过 16 个字的推荐理由>","plans":{"<id>":{"why":"<不超过 24 个字，口语>","pitfall":"<不超过 18 个字>"}}}
数据：${JSON.stringify(data)}`;
    try {
      const r = await sample.json(prompt, { modelTier: 'quick' });
      if (!r || !r.plans || !planset.plans.some(p => p.id === r.pick)) return null;
      r.headline = noAB(r.headline);
      Object.values(r.plans).forEach(x => { if (x) { x.why = noAB(x.why); x.pitfall = noAB(x.pitfall); } });
      return r;
    } catch (e) { fail(e); return null; }
  }

  async function review(A, B, plan, result, onText) {
    if (!sample) return null;
    const m = result.metrics, steps = result.stepResults.map(r => ({ at: r.step.bar, did: r.step.actions.map(a => a.label).join(' + '), score: Math.round(r.score * 100), notes: r.parts.map(p => p.note) }));
    const prompt = `${PERSONA}
新手刚刚练完一次「${plan.name} ${plan.en}」过渡。下面是系统测到的结果（0-100）。
用一句话点评，不超过 32 个字：先说听众会听到的最大问题，再给下一次一个具体动作。如果做得很好，就具体夸一处。只输出这一句，不要引号、编号或换行。
数据：${JSON.stringify({ ...summary(A, B, plan), total: result.total, 交接完成: result.handover, metrics: Object.fromEntries(Object.entries(m).map(([k, v]) => [Planner.METRIC_LABEL[k], Math.round(v * 100)])), lowClashBeats: +result.clashBeats.toFixed(1), worstBeatOffsetMs: Math.round(result.worstPhase), steps })}`;
    try { return noAB((await sample(prompt, { modelTier: 'quick', onText: onText ? ({ text }) => onText(noAB(text)) : undefined })).text); }
    catch (e) { fail(e); return null; }
  }

  async function ask(history, A, B, plan, onText) {
    if (!sample) return null;
    const ctx = `${PERSONA}
回答控制在 120 个字以内，能结合下面这两首歌的数据就结合。
当前情境：${JSON.stringify(summary(A, B, plan))}`;
    const turns = history.map((t, i) => ({ role: t.role, content: i === 0 ? `${ctx}\n\n学员的问题：${t.content}` : t.content }));
    try { return noAB((await sample(turns, { modelTier: 'quick', cache: false, onText: ({ text }) => onText(noAB(text)) })).text); }
    catch (e) { fail(e); return null; }
  }

  // ---------- offline words ----------
  const FAQ = [
    { q: '为什么要在乐句开头进歌？', a: '电子乐几乎都按 8 小节、16 小节一组来写，鼓组变化、贝斯进场都发生在乐句开头。后一首在前一首的乐句第一拍进来，两首歌的段落就会同时变化，听众感觉是一首歌在自然发展。早一拍或晚一拍进，段落就错开了，耳朵会觉得哪里不对。' },
    { q: '低频打架是什么意思？', a: '底鼓和贝斯都挤在 200Hz 以下。两首歌的低频同时满开，底鼓会叠成"咚咚"两层，贝斯变浑，音响也容易过载。所以 DJ 的铁律是：同一时间只让一首歌拥有低频，用 LOW 旋钮在乐句点一出一进地交换。' },
    { q: 'SYNC 算作弊吗？', a: '不算。现在俱乐部里的播放器都带 SYNC，大部分职业 DJ 也会用。省下手动对拍的精力，可以花在选歌、乐句和 EQ 上，这些才是听众真正听得到的。等你熟了，再关掉 SYNC 用推子和 jog 盘练手动对拍，当作基本功。' },
    { q: '入门需要买什么设备？', a: '先什么都不用买。用电脑和键盘在 Segue 里练到能稳定完成一次长混，再考虑一台双通道的入门控制器，它和俱乐部设备的布局是一样的：两边播放、中间调音台。耳机可以晚点买，监听功能等你练到手动对拍时才用得上。' },
  ];

  function fallbackPlanCopy(p) {
    const map = {
      swap: { why: '叠得久，在乐句头换低音，几乎听不出换歌。', pitfall: '忘关后一首的 LOW，一推就打架。' },
      filter: { why: '后一首从高频里慢慢长出来，自带张力。', pitfall: '滤波转太快，没撑满 8 小节。' },
      echo: { why: '前一首留个回声甩出去，后一首的高潮直接补上。', pitfall: '前一首拉下和后一首起播没落在同一拍。' },
    };
    const copy = { ...map[p.id] }, L = p.listen;
    if (!L || L.cut) { if (p.sour) copy.why = '这两首叠久了会发酸，干脆利落地换最好听。'; return copy; }
    // say what was heard in this pair's overlap, not what is true of every pair
    if (L.duck) { copy.why = '有几小节两首都有旋律，而且音不太合。'; copy.pitfall = p.id === 'swap' ? '前一首的 MID 收晚了，中间会发酸。' : copy.pitfall; }
    else if (L.melody < 0.12 && p.id === 'swap') copy.why = L.bassOnSwap ? '后一首先只进鼓，贝斯正好在换低音那拍进来。' : '后一首先只进鼓，和前一首的旋律不抢。';
    else if (L.bassOnSwap && p.id === 'swap') copy.why = '后一首的贝斯正好在换低音那一拍进来。';
    else if (L.blend != null && L.blend >= 0.7 && L.melody >= 0.3) copy.why = '两首的旋律叠在一起是合的，可以放心叠久一点。';
    return copy;
  }

  function fallbackReview(result) {
    const m = result.metrics, ks = Object.keys(m);
    // never praise something the AI did on the learner's behalf
    const earned = ks.filter(k => !(k === 'phrase' && result.aiStarted));
    const best = earned.reduce((a, b) => m[a] >= m[b] ? a : b), worst = ks.reduce((a, b) => m[a] <= m[b] ? a : b);
    const praise = m[best] < 0.6 ? '你完整走完了一次过渡，每一步在哪里已经心里有数。' : {
      beat: '两首歌的鼓点一直对得很齐，SYNC 用对了。', phrase: '后一首正好卡在乐句第一拍进来，段落是对齐的。', bass: '低频交换很干净，全程几乎没有两层底鼓。',
      level: '整段音量很稳，没有忽大忽小。', steps: '每个动作都按时间点完成了，手很稳。',
    }[best];
    const fix = !result.handover ? '过渡结束时后一首还没完全接过来（或者前一首还没退场），听众会觉得两首歌卡在了一起。' : {
      beat: `鼓点最多错开了 ${Math.round(result.worstPhase)} 毫秒，听起来会像"马蹄声"。下次先按 SYNC 再起播。`,
      phrase: '后一首没有在乐句第一拍进来，两首歌的段落错开了，听众会觉得节奏乱了一下。',
      bass: `有大约 ${result.clashBeats.toFixed(1)} 拍两首歌的低频同时开着，底鼓会叠成两层、发闷。`,
      level: '中间有一段音量掉下去或冲太高，舞池会明显感觉到。', steps: '有几个动作没做到目标位置，过渡听起来会不完整。',
    }[worst];
    const next = !result.handover ? '下次目标：先看一遍示范，记住后一首的推子什么时候推满。' : {
      beat: '下次目标：起播前确认后一首的 BPM 和前一首一致。', phrase: '下次目标：看到“现在”就按 PLAY。',
      bass: '下次目标：交换低频时两只手同时动，一拍内完成。', level: '下次目标：推后一首的时候，耳朵盯着总音量表。', steps: '下次目标：先看一遍示范，再跟着练。',
    }[worst];
    return `· ${praise}\n· ${fix}\n· ${next}`;
  }

  return {
    get state() { return state; }, onState(f) { listeners.push(f); f(state); },
    reviewPlans, review, ask, FAQ, fallbackPlanCopy, fallbackReview,
  };
})();
