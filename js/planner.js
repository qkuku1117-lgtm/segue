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

  function make(analA, analB) {
    const c = Analysis.compat(analA, analB);
    const outroA = analA.lastDropEnd, barsA = analA.nBars;
    const introB = analB.sections[0] && !analB.sections[0].high ? analB.sections[0].end : 0;
    const swapLen = barsA >= 48 ? 32 : 16;
    const plans = [];

    {
      const S = Math.max(8, align8(Math.min(outroA, barsA - swapLen)));
      const half = swapLen / 2;
      plans.push({
        id: 'swap', name: '长混', en: 'Bass Swap', difficulty: 2, len: swapLen, startA: S, cueB: analB.phraseOffset % 8,
        tagline: `两首歌叠 ${swapLen} 小节，在乐句点交换低频`,
        tags: ['夜店最常用', '丝滑'],
        fit: Math.round(100 * (0.5 * c.keyScore + 0.3 * c.bpmScore + 0.2 * (introB >= 8 ? 1 : 0.55))),
        pre: [
          { deck: 'B', ctrl: 'sync', label: '按 B 的 SYNC，让 B 的速度追上 A' },
          { deck: 'B', ctrl: 'low', to: 0, label: '把 B 的 LOW 拧到底' },
          { deck: 'B', ctrl: 'fader', to: 0, label: 'B 的推子放在最下面' },
        ],
        actions: [
          { bar: 0, deck: 'B', ctrl: 'play', label: '在 A 的新乐句第一拍按 B 的 PLAY', why: '乐句对乐句，两首歌的段落才会同时变化' },
          { bar: 0, dur: half / 2, deck: 'B', ctrl: 'fader', to: 1, label: `${half / 2} 小节内慢慢把 B 推满`, why: 'B 现在只有中高频，慢慢推进来不会抢 A 的戏' },
          { bar: half, deck: 'A', ctrl: 'low', to: 0, label: '交换低频：A 的 LOW 拧到底', why: '在新乐句交换低频，听众只会觉得歌变了，不会觉得乱' },
          { bar: half, deck: 'B', ctrl: 'low', to: 0.5, label: '同时把 B 的 LOW 拧回 12 点', why: '同一拍里一出一进，低频永远只有一首' },
          { bar: half + 4, dur: 4, deck: 'A', ctrl: 'high', to: 0.22, label: '把 A 的 HIGH 慢慢收到 9 点', why: '两套镲叠在一起会糊，先让 A 的镲退场' },
          { bar: half + half / 2, dur: half / 2, deck: 'A', ctrl: 'fader', to: 0, label: `最后 ${half / 2} 小节把 A 拉下去`, why: 'A 只剩一点氛围了，让它自然淡出' },
        ],
      });
    }
    {
      const S = Math.max(8, align8(Math.min(outroA, barsA - 16)));
      plans.push({
        id: 'filter', name: '滤波推进', en: 'Filter Ride', difficulty: 2, len: 16, startA: S, cueB: analB.phraseOffset % 8,
        tagline: 'B 从高通里长出来，A 闷下去让位',
        tags: ['有张力', '16 小节'],
        fit: Math.round(100 * (0.4 * c.keyScore + 0.4 * c.bpmScore + 0.12)),
        pre: [
          { deck: 'B', ctrl: 'sync', label: '按 B 的 SYNC，让 B 的速度追上 A' },
          { deck: 'B', ctrl: 'filter', to: 0.75, label: 'B 的 FILTER 往右拧到 4 点钟（高通）' },
          { deck: 'B', ctrl: 'fader', to: 0, label: 'B 的推子放在最下面' },
        ],
        actions: [
          { bar: 0, deck: 'B', ctrl: 'play', label: '在 A 的新乐句第一拍按 B 的 PLAY', why: '高通下的 B 只剩镲和一点旋律' },
          { bar: 0, dur: 4, deck: 'B', ctrl: 'fader', to: 1, label: '4 小节内推满 B', why: '只有高频，推满也不会和 A 打架' },
          { bar: 4, dur: 8, deck: 'B', ctrl: 'filter', to: 0, label: '8 小节内把 B 的 FILTER 转回 12 点', why: '滤波慢慢打开，本身就是一段 build-up' },
          { bar: 4, dur: 8, deck: 'A', ctrl: 'filter', to: -0.6, label: '同时 A 的 FILTER 往左拧到 8 点钟', why: 'A 变闷，把空间让给 B' },
          { bar: 8, deck: 'A', ctrl: 'low', to: 0, label: 'A 的 LOW 拧到底', why: 'B 的低频快冒出来了，A 的先让出来' },
          { bar: 12, dur: 4, deck: 'A', ctrl: 'fader', to: 0, label: '最后 4 小节拉下 A', why: 'B 已经完全打开，A 可以退场了' },
        ],
      });
    }
    {
      const exit = Math.max(8, align8(analA.lastDropEnd));
      const S = Math.min(exit, barsA - 4) - 4;
      const cue = analB.firstDrop ?? analB.phraseOffset % 8;
      plans.push({
        id: 'echo', name: '回声收尾', en: 'Echo Out', difficulty: 1, len: 8, startA: S, cueB: cue,
        tagline: 'A 用回声甩出去，B 直接从 drop 砸进来',
        tags: ['新手友好', '干脆利落'],
        fit: Math.round(100 * (0.1 * c.keyScore + 0.3 * c.bpmScore + 0.35 * (analB.firstDrop != null ? 1 : 0.5) + 0.1)),
        pre: [
          { deck: 'B', ctrl: 'sync', label: '按 B 的 SYNC，让 B 的速度追上 A' },
          { deck: 'B', ctrl: 'fader', to: 1, label: 'B 的推子先推满（B 会从 drop 直接进来）' },
        ],
        actions: [
          { bar: 2, dur: 2, deck: 'A', ctrl: 'filter', to: -0.35, label: 'A 的 FILTER 往左拧一点', why: '先让 A 变暗，提示听众要换歌了' },
          { bar: 3, deck: 'A', ctrl: 'echo', to: 0.8, label: '最后一小节：打开 A 的 ECHO', why: '回声会把 A 的最后一拍拖出去' },
          { bar: 4, deck: 'A', ctrl: 'fader', to: 0, label: 'A 的推子一把拉下', why: '回声尾巴还在响，听起来是甩出去而不是断掉' },
          { bar: 4, deck: 'B', ctrl: 'play', label: '同一拍按 B 的 PLAY', why: 'B 直接从 drop 进来，能量无缝接上' },
          { bar: 6, deck: 'A', ctrl: 'echo', to: 0, label: '回声收掉', why: '收尾，免得回声一直滚' },
        ],
      });
    }
    plans.forEach(normalize);
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
    out.push({ k: '速度', v: `${A.bpm} → ${B.bpm}`, note: `B ${pct >= 0 ? '加快' : '放慢'} ${Math.abs(pct).toFixed(1)}%`, good: Math.abs(pct) <= 4 });
    const swap = plans.find(p => p.id === 'swap');
    out.push({ k: 'A 出口', v: `第 ${swap.startA} 小节`, note: `后面还有 ${A.nBars - swap.startA} 小节可混`, good: A.nBars - swap.startA >= 16 });
    const intro = B.sections[0];
    out.push({ k: 'B 入口', v: intro ? `${intro.end - intro.start} 小节前奏` : '无前奏', note: B.firstDrop != null ? `drop 在第 ${B.firstDrop} 小节` : '没找到明显 drop', good: !!intro && !intro.high });
    return out;
  }

  // ---------- scoring ----------
  function evaluate(p, rec, meta) {
    const within = (a, b) => rec.filter(s => s.rel >= a && s.rel <= b);
    const stepResults = p.steps.map(step => {
      const parts = step.actions.map(a => {
        if (a.ctrl === 'play') {
          if (meta.bStartRel == null) return { a, score: 0, note: 'B 没放出来' };
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

  const PERSONA = '你是 Segue 的 AI 混音教练：一位耐心、专业、说话口语化的俱乐部 DJ，正在教第一次接触打碟的新手。只用中文回答，不用 Markdown 标题，不编造数据里没有的事实。';

  function summary(A, B, plan) {
    const sec = an => an.sections.map(s => `${s.type}:${s.start}-${s.end}`).join(' ');
    return {
      A: { title: A.title, bpm: A.an.bpm, key: `${A.an.key.name} (${A.an.key.camelot})`, bars: A.an.nBars, sections: sec(A.an) },
      B: { title: B.title, bpm: B.an.bpm, key: `${B.an.key.name} (${B.an.key.camelot})`, bars: B.an.nBars, sections: sec(B.an) },
      plan: plan ? { id: plan.id, name: plan.name, bars: plan.len, steps: plan.steps.map(s => `第${s.bar}小节: ` + s.actions.map(a => `${a.deck} ${a.label}`).join(' + ')) } : undefined,
    };
  }

  async function reviewPlans(A, B, planset) {
    if (!sample) return null;
    const data = {
      ...summary(A, B),
      compat: { relation: planset.compat.rel, bpmChangeForB: `${planset.compat.bpmPct.toFixed(1)}%` },
      plans: planset.plans.map(p => ({ id: p.id, name: `${p.name} ${p.en}`, difficulty: p.difficulty, bars: p.len, startsAtABar: p.startA, bEntersAtBar: p.cueB, ruleFit: p.fit, steps: p.steps.map(s => `+${s.bar}: ` + s.actions.map(a => `${a.deck} ${a.label}`).join(' / ')) })),
    };
    const prompt = `${PERSONA}
下面是浏览器本地分析两首歌得到的数据，以及规则引擎生成的 3 个可执行过渡方案（时间点已经算好，你不需要改）。
请判断：哪个方案最适合这位新手现在先练？并为每个方案写一句"为什么这样接好听"和一句"新手最容易犯的错"。
只输出 JSON，不要任何其他文字：
{"pick":"<方案 id>","headline":"<不超过 28 个字的推荐理由>","plans":{"<id>":{"why":"<不超过 40 个字>","pitfall":"<不超过 30 个字>"}}}
数据：${JSON.stringify(data)}`;
    try {
      const r = await sample.json(prompt, { modelTier: 'quick' });
      if (!r || !r.plans || !planset.plans.some(p => p.id === r.pick)) return null;
      return r;
    } catch (e) { fail(e); return null; }
  }

  async function review(A, B, plan, result, onText) {
    if (!sample) return null;
    const m = result.metrics, steps = result.stepResults.map(r => ({ at: r.step.bar, did: r.step.actions.map(a => a.label).join(' + '), score: Math.round(r.score * 100), notes: r.parts.map(p => p.note) }));
    const prompt = `${PERSONA}
新手刚刚练完一次「${plan.name} ${plan.en}」过渡。下面是系统测到的结果（0-100）。
用一句话点评，不超过 32 个字：先说听众会听到的最大问题，再给下一次一个具体动作。如果做得很好，就具体夸一处。只输出这一句，不要引号、编号或换行。
数据：${JSON.stringify({ ...summary(A, B, plan), total: result.total, handedOverToB: result.handover, metrics: Object.fromEntries(Object.entries(m).map(([k, v]) => [Planner.METRIC_LABEL[k], Math.round(v * 100)])), lowClashBeats: +result.clashBeats.toFixed(1), worstBeatOffsetMs: Math.round(result.worstPhase), steps })}`;
    try { return (await sample(prompt, { modelTier: 'quick', onText: onText ? ({ text }) => onText(text) : undefined })).text; }
    catch (e) { fail(e); return null; }
  }

  async function ask(history, A, B, plan, onText) {
    if (!sample) return null;
    const ctx = `${PERSONA}
回答控制在 120 个字以内，能结合下面这两首歌的数据就结合。
当前情境：${JSON.stringify(summary(A, B, plan))}`;
    const turns = history.map((t, i) => ({ role: t.role, content: i === 0 ? `${ctx}\n\n学员的问题：${t.content}` : t.content }));
    try { return (await sample(turns, { modelTier: 'quick', cache: false, onText: ({ text }) => onText(text) })).text; }
    catch (e) { fail(e); return null; }
  }

  // ---------- offline words ----------
  const FAQ = [
    { q: '为什么要在乐句开头进歌？', a: '电子乐几乎都按 8 小节、16 小节一组来写，鼓组变化、贝斯进场都发生在乐句开头。B 在 A 的乐句第一拍进来，两首歌的段落就会同时变化，听众感觉是一首歌在自然发展。早一拍或晚一拍进，段落就错开了，耳朵会觉得哪里不对。' },
    { q: '低频打架是什么意思？', a: '底鼓和贝斯都挤在 200Hz 以下。两首歌的低频同时满开，底鼓会叠成"咚咚"两层，贝斯变浑，音响也容易过载。所以 DJ 的铁律是：同一时间只让一首歌拥有低频，用 LOW 旋钮在乐句点一出一进地交换。' },
    { q: 'SYNC 算作弊吗？', a: '不算。现在俱乐部里的播放器都带 SYNC，大部分职业 DJ 也会用。省下手动对拍的精力，可以花在选歌、乐句和 EQ 上，这些才是听众真正听得到的。等你熟了，再关掉 SYNC 用推子和 jog 盘练手动对拍，当作基本功。' },
    { q: '入门需要买什么设备？', a: '先什么都不用买。用电脑和键盘在 Segue 里练到能稳定完成一次长混，再考虑一台双通道的入门控制器，它和俱乐部设备的布局是一样的：两边播放、中间调音台。耳机可以晚点买，监听功能等你练到手动对拍时才用得上。' },
  ];

  function fallbackPlanCopy(p) {
    const map = {
      swap: { why: '两首歌长时间叠在一起，低频在乐句点干净地换手，听众几乎察觉不到换歌。', pitfall: '忘了先把 B 的 LOW 关掉，一推上来低频就打架。' },
      filter: { why: 'B 在高通里一点点长出来，本身就是一段上升的张力。', pitfall: '转滤波太快，8 小节的过程 2 小节就转完了。' },
      echo: { why: '回声把 A 的最后一拍甩出去，B 的 drop 正好补上，干脆有力。', pitfall: 'A 拉下和 B 起播没落在同一拍，中间出现空拍。' },
    };
    return map[p.id];
  }

  function fallbackReview(result) {
    const m = result.metrics, ks = Object.keys(m);
    // never praise something the AI did on the learner's behalf
    const earned = ks.filter(k => !(k === 'phrase' && result.aiStarted));
    const best = earned.reduce((a, b) => m[a] >= m[b] ? a : b), worst = ks.reduce((a, b) => m[a] <= m[b] ? a : b);
    const praise = m[best] < 0.6 ? '你完整走完了一次过渡，每一步在哪里已经心里有数。' : {
      beat: '两首歌的鼓点一直对得很齐，SYNC 用对了。', phrase: 'B 正好卡在乐句第一拍进来，段落是对齐的。', bass: '低频交换很干净，全程几乎没有两层底鼓。',
      level: '整段音量很稳，没有忽大忽小。', steps: '每个动作都按时间点完成了，手很稳。',
    }[best];
    const fix = !result.handover ? '过渡结束时 B 还没完全接过来（或者 A 还没退场），听众会觉得两首歌卡在了一起。' : {
      beat: `鼓点最多错开了 ${Math.round(result.worstPhase)} 毫秒，听起来会像"马蹄声"。下次先按 SYNC 再起播。`,
      phrase: 'B 没有在乐句第一拍进来，两首歌的段落错开了，听众会觉得节奏乱了一下。',
      bass: `有大约 ${result.clashBeats.toFixed(1)} 拍两首歌的低频同时开着，底鼓会叠成两层、发闷。`,
      level: '中间有一段音量掉下去或冲太高，舞池会明显感觉到。', steps: '有几个动作没做到目标位置，过渡听起来会不完整。',
    }[worst];
    const next = !result.handover ? '下次目标：先看一遍示范，记住 B 的推子什么时候推满。' : {
      beat: '下次目标：起播前确认 B 的 BPM 和 A 一致。', phrase: '下次目标：看到“现在”就按 PLAY。',
      bass: '下次目标：交换低频时两只手同时动，一拍内完成。', level: '下次目标：推 B 的时候，耳朵盯着总音量表。', steps: '下次目标：先看一遍示范，再跟着练。',
    }[worst];
    return `· ${praise}\n· ${fix}\n· ${next}`;
  }

  return {
    get state() { return state; }, onState(f) { listeners.push(f); f(state); },
    reviewPlans, review, ask, FAQ, fallbackPlanCopy, fallbackReview,
  };
})();
