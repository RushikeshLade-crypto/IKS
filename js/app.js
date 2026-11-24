/* IKS Practice — single-page app, no build step.
   Data: window.QB (each question's o[0] is the correct answer; options are shuffled per session). */
(function () {
  'use strict';

  // ---------- constants & helpers ----------
  const UNITS = {
    1: { name: 'Introduction to Indian Knowledge System', blurb: 'Vedas, Vedāṅgas, Sanskrit, Vāk, ancient universities, number names and units' },
    2: { name: 'Arts, Literature, Culture and Scholars', blurb: '64 Kalās, Naṭarāja, Vālmīki, Vyāsa, Pāṇini, Patañjali, Śaṅkara, Agastya and more' },
    3: { name: 'Science and Mathematics', blurb: 'Zero, π, binary, magic squares, time, Kaṇāda, gravity, light and Indian scientists' }
  };
  const LETTERS = ['A', 'B', 'C', 'D'];
  const DEV = '०१२३४५६७८९';
  const toDev = n => String(n).replace(/\d/g, d => DEV[d]);
  const $ = (sel, el = document) => el.querySelector(sel);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
  const pct = (a, b) => b ? Math.round((a / b) * 100) : 0;
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

  const QB = (window.QB || []).map(q => Object.assign({ id: 'q' + q.u + '-' + hash(q.q) }, q));
  const BY_ID = Object.fromEntries(QB.map(q => [q.id, q]));
  const TOPICS = {}; // unit -> ordered topic list
  QB.forEach(q => { (TOPICS[q.u] = TOPICS[q.u] || []); if (!TOPICS[q.u].includes(q.t)) TOPICS[q.u].push(q.t); });

  // ---------- storage ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage full or blocked */ } }
  };
  let stats = store.get('iks-stats', {});        // id -> {a: attempts, c: correct, w: lastWasWrong}
  let marks = new Set(store.get('iks-marks', [])); // bookmarked ids
  let history = store.get('iks-history', []);     // recent sessions
  let prefs = Object.assign({ unit: 'all', topics: null, count: 20, order: 'random', mode: 'practice', fresh: false }, store.get('iks-prefs', {}));

  function record(q, ok) {
    const s = stats[q.id] || { a: 0, c: 0, w: false };
    s.a++; if (ok) s.c++; s.w = !ok;
    stats[q.id] = s; store.set('iks-stats', stats);
  }
  function toggleMark(id) { marks.has(id) ? marks.delete(id) : marks.add(id); store.set('iks-marks', [...marks]); }
  const mistakes = () => QB.filter(q => stats[q.id] && stats[q.id].w);

  // ---------- theme ----------
  $('#themeBtn').addEventListener('click', () => {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('iks-theme', root.dataset.theme); } catch (e) {}
  });

  // ---------- routing ----------
  const main = $('#main');
  let session = null;   // active quiz
  let lastResult = null;
  let timerId = null;

  function go(hashPath) { if (location.hash === hashPath) route(); else location.hash = hashPath; }
  window.addEventListener('hashchange', route);
  function route() {
    clearInterval(timerId);
    const path = location.hash.replace(/^#/, '') || '/';
    document.querySelectorAll('[data-nav]').forEach(a => a.removeAttribute('aria-current'));
    const navKey = path.startsWith('/revise') ? 'revise' : path.startsWith('/progress') ? 'progress' : 'home';
    const cur = document.querySelector(`[data-nav="${navKey}"]`); if (cur) cur.setAttribute('aria-current', 'page');
    if (path === '/quiz' && session) renderQuiz();
    else if (path === '/results' && lastResult) renderResults();
    else if (path.startsWith('/revise')) renderRevise();
    else if (path.startsWith('/progress')) renderProgress();
    else renderHome();
    main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  // ---------- session building ----------
  function pool(p) {
    let list = QB.filter(q => p.unit === 'all' || String(q.u) === String(p.unit));
    if (p.unit !== 'all' && p.topics && p.topics.length) list = list.filter(q => p.topics.includes(q.t));
    if (p.fresh) list = list.filter(q => !(stats[q.id] && stats[q.id].c > 0 && !stats[q.id].w));
    return list;
  }
  function startSession(questions, opts) {
    if (!questions.length) return;
    let list = opts.order === 'random' ? shuffle(questions) : questions.slice();
    if (opts.count && opts.count !== 'all') list = list.slice(0, +opts.count);
    session = {
      mode: opts.mode || 'practice',
      label: opts.label || 'Practice set',
      items: list.map(q => ({ id: q.id, order: shuffle([0, 1, 2, 3]), pick: null })),
      i: 0,
      started: Date.now(),
      limit: opts.mode === 'test' ? list.length * 60 : 0,
      opts
    };
    go('#/quiz');
  }

  // ---------- HOME ----------
  function renderHome() {
    const m = mistakes().length, b = marks.size;
    const seenCount = Object.keys(stats).filter(id => BY_ID[id]).length;
    main.innerHTML = `
      <section class="hero">
        <h1>Practise Indian Knowledge System, one question at a time.</h1>
        <p class="lede">${QB.length} multiple-choice questions from Units 1–3 of Section I, each with an explanation and the lecture or notes it comes from.${seenCount ? ` You have tried ${seenCount} of them so far.` : ''}</p>
        <div class="quick">
          <button class="btn primary" id="qRandom" type="button">Random 20 from all units</button>
          <button class="btn" id="qMistakes" type="button" ${m ? '' : 'disabled'}>Retry my mistakes${m ? ` (${m})` : ''}</button>
          <button class="btn" id="qMarks" type="button" ${b ? '' : 'disabled'}>Saved questions${b ? ` (${b})` : ''}</button>
        </div>
      </section>

      <section class="builder" aria-labelledby="bTitle">
        <h2 id="bTitle">Build your own set</h2>
        <div class="field">
          <span class="flabel" id="lUnit">Unit</span>
          <div class="seg" role="radiogroup" aria-labelledby="lUnit" id="unitSeg">
            ${['all', 1, 2, 3].map(u => `<button type="button" role="radio" data-unit="${u}" aria-checked="${String(prefs.unit) === String(u)}">${u === 'all' ? 'All units' : 'Unit ' + u}</button>`).join('')}
          </div>
        </div>
        <div class="field" id="topicField"></div>
        <div class="row-fields">
          <div class="field">
            <span class="flabel" id="lCount">Questions</span>
            <div class="seg" role="radiogroup" aria-labelledby="lCount" id="countSeg">
              ${[10, 20, 30, 50, 'all'].map(c => `<button type="button" role="radio" data-count="${c}" aria-checked="${String(prefs.count) === String(c)}">${c === 'all' ? 'All' : c}</button>`).join('')}
            </div>
          </div>
          <div class="field">
            <span class="flabel" id="lOrder">Order</span>
            <div class="seg" role="radiogroup" aria-labelledby="lOrder" id="orderSeg">
              <button type="button" role="radio" data-order="random" aria-checked="${prefs.order === 'random'}">Shuffled</button>
              <button type="button" role="radio" data-order="topic" aria-checked="${prefs.order === 'topic'}">Topic by topic</button>
            </div>
          </div>
        </div>
        <div class="field">
          <span class="flabel" id="lMode">Mode</span>
          <div class="modes" role="radiogroup" aria-labelledby="lMode" id="modeSeg">
            <button type="button" role="radio" data-mode="practice" aria-checked="${prefs.mode === 'practice'}">
              <strong>Practice</strong><span>See the answer and explanation after every question.</span></button>
            <button type="button" role="radio" data-mode="test" aria-checked="${prefs.mode === 'test'}">
              <strong>Mock test</strong><span>One minute per question. Answers and explanations at the end.</span></button>
          </div>
        </div>
        <label class="check"><input type="checkbox" id="freshBox" ${prefs.fresh ? 'checked' : ''}> Leave out questions I've already answered correctly</label>
        <div class="start-row">
          <button class="btn primary big" id="startBtn" type="button"></button>
          <p class="hint" id="startHint"></p>
        </div>
      </section>

      <section class="units" aria-labelledby="uTitle">
        <h2 id="uTitle">Units</h2>
        <div class="unit-list">
          ${[1, 2, 3].map(u => unitCard(u)).join('')}
        </div>
      </section>`;

    const savePrefs = () => store.set('iks-prefs', prefs);
    const refresh = () => {
      // topics
      const tf = $('#topicField');
      if (prefs.unit === 'all') {
        tf.innerHTML = `<span class="flabel">Topics</span><p class="muted small">Pick a single unit to choose topics.</p>`;
      } else {
        const ts = TOPICS[prefs.unit];
        const chosen = prefs.topics && prefs.topics.length ? prefs.topics.filter(t => ts.includes(t)) : ts.slice();
        prefs.topics = chosen;
        tf.innerHTML = `<div class="flabel-row"><span class="flabel" id="lTopic">Topics</span>
            <button type="button" class="link" id="tAll">Select all</button><button type="button" class="link" id="tNone">Clear</button></div>
          <div class="chips" role="group" aria-labelledby="lTopic">
            ${ts.map(t => { const n = QB.filter(q => q.u == prefs.unit && q.t === t).length; return `<button type="button" class="chip" aria-pressed="${chosen.includes(t)}" data-topic="${esc(t)}">${esc(t)} <span class="n">${n}</span></button>`; }).join('')}
          </div>`;
        tf.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => {
          const t = c.dataset.topic; const set = new Set(prefs.topics);
          set.has(t) ? set.delete(t) : set.add(t);
          prefs.topics = ts.filter(x => set.has(x)); savePrefs(); refresh();
        }));
        $('#tAll').onclick = () => { prefs.topics = ts.slice(); savePrefs(); refresh(); };
        $('#tNone').onclick = () => { prefs.topics = []; savePrefs(); refresh(); };
      }
      // start button
      const noTopics = prefs.unit !== 'all' && prefs.topics && prefs.topics.length === 0;
      const avail = noTopics ? 0 : pool(prefs).length;
      const n = prefs.count === 'all' ? avail : Math.min(+prefs.count, avail);
      const btn = $('#startBtn');
      btn.disabled = n === 0;
      btn.textContent = n === 0 ? 'No questions match' : `Start ${plural(n, 'question')}`;
      $('#startHint').textContent = noTopics ? 'Select at least one topic.' :
        (avail === 0 && prefs.fresh ? "You've answered every question here correctly. Untick the box above to practise them again." :
          `${avail} available with these settings${prefs.mode === 'test' ? `, with a ${n}-minute time limit` : ''}.`);
    };

    const bindSeg = (id, key, conv) => $(id).querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      $(id).querySelectorAll('button').forEach(x => x.setAttribute('aria-checked', 'false'));
      b.setAttribute('aria-checked', 'true');
      prefs[key] = conv(b.dataset[key]);
      if (key === 'unit') prefs.topics = null;
      savePrefs(); refresh();
    }));
    bindSeg('#unitSeg', 'unit', v => v === 'all' ? 'all' : +v);
    bindSeg('#countSeg', 'count', v => v === 'all' ? 'all' : +v);
    bindSeg('#orderSeg', 'order', v => v);
    bindSeg('#modeSeg', 'mode', v => v);
    $('#freshBox').addEventListener('change', e => { prefs.fresh = e.target.checked; savePrefs(); refresh(); });
    $('#startBtn').addEventListener('click', () => {
      const p = pool(prefs);
      const label = prefs.unit === 'all' ? 'All units' : `Unit ${prefs.unit}` + (prefs.topics && prefs.topics.length < TOPICS[prefs.unit].length ? (prefs.topics.length === 1 ? ` — ${prefs.topics[0]}` : ` — ${prefs.topics.length} topics`) : '');
      const ordered = prefs.order === 'topic' ? p.slice().sort((a, b) => a.u - b.u || TOPICS[a.u].indexOf(a.t) - TOPICS[b.u].indexOf(b.t)) : p;
      // when taking a subset in topic order, sample randomly first then sort, so every topic is represented
      let chosen = ordered;
      if (prefs.order === 'topic' && prefs.count !== 'all' && p.length > prefs.count) {
        const sample = new Set(shuffle(p).slice(0, prefs.count).map(q => q.id));
        chosen = ordered.filter(q => sample.has(q.id));
      }
      startSession(chosen, { order: prefs.order, count: prefs.count, mode: prefs.mode, label });
    });
    $('#qRandom').addEventListener('click', () => startSession(QB, { order: 'random', count: 20, mode: 'practice', label: 'Random mix — all units' }));
    $('#qMistakes').addEventListener('click', () => startSession(mistakes(), { order: 'random', count: 'all', mode: 'practice', label: 'My mistakes' }));
    $('#qMarks').addEventListener('click', () => startSession(QB.filter(q => marks.has(q.id)), { order: 'random', count: 'all', mode: 'practice', label: 'Saved questions' }));
    main.querySelectorAll('[data-unit-start]').forEach(b => b.addEventListener('click', () => {
      const u = +b.dataset.unitStart;
      startSession(QB.filter(q => q.u === u), { order: 'random', count: 20, mode: 'practice', label: `Unit ${u} — random 20` });
    }));
    refresh();
  }

  function unitCard(u) {
    const qs = QB.filter(q => q.u === u);
    const tried = qs.filter(q => stats[q.id]).length;
    const right = qs.filter(q => stats[q.id] && stats[q.id].c > 0 && !stats[q.id].w).length;
    return `<article class="unit">
      <div class="unit-num" aria-hidden="true">${toDev(u)}</div>
      <div class="unit-body">
        <h3>Unit ${u}: ${UNITS[u].name}</h3>
        <p class="muted">${UNITS[u].blurb}.</p>
        <div class="meter" role="img" aria-label="${right} of ${qs.length} answered correctly"><span style="width:${pct(right, qs.length)}%"></span></div>
        <p class="small muted">${right} of ${qs.length} mastered${tried ? `, ${tried} tried` : ''}, ${TOPICS[u].length} topics</p>
      </div>
      <button class="btn" type="button" data-unit-start="${u}">Practise 20</button>
    </article>`;
  }

  // ---------- QUIZ ----------
  function renderQuiz() {
    const s = session;
    const it = s.items[s.i];
    const q = BY_ID[it.id];
    const answered = it.pick !== null;
    const isPractice = s.mode === 'practice';
    const reveal = isPractice && answered;
    const total = s.items.length;
    const answeredCount = s.items.filter(x => x.pick !== null).length;

    main.innerHTML = `
      <section class="quiz" aria-live="polite">
        <div class="quiz-head">
          <div>
            <p class="set-label">${esc(s.label)}</p>
            <p class="counter">Question ${s.i + 1} of ${total} <span class="dev" lang="sa" aria-hidden="true">${toDev(s.i + 1)}/${toDev(total)}</span></p>
          </div>
          <div class="quiz-tools">
            ${s.mode === 'test' ? `<span class="timer" id="timer" role="timer" aria-label="Time left"></span>` : ''}
            <button class="btn small" id="markBtn" type="button" aria-pressed="${marks.has(q.id)}">${marks.has(q.id) ? 'Saved' : 'Save'}</button>
            <button class="btn small ghost" id="endBtn" type="button">${s.mode === 'test' ? 'Submit test' : 'End session'}</button>
          </div>
        </div>
        <ol class="mala" aria-label="Questions in this set">
          ${s.items.map((x, k) => {
            let st = 'todo';
            if (x.pick !== null) st = isPractice ? (x.order[x.pick] === 0 ? 'ok' : 'bad') : 'done';
            const can = !isPractice || x.pick !== null || k === s.i;
            return `<li><button type="button" class="bead ${st}${k === s.i ? ' cur' : ''}" data-go="${k}" ${can ? '' : 'disabled'} aria-label="Question ${k + 1}${st === 'ok' ? ', correct' : st === 'bad' ? ', wrong' : st === 'done' ? ', answered' : ''}"${k === s.i ? ' aria-current="step"' : ''}></button></li>`;
          }).join('')}
        </ol>
        <p class="topic-tag">Unit ${q.u} <span aria-hidden="true">/</span> ${esc(q.t)}</p>
        <h2 class="question">${esc(q.q)}</h2>
        <div class="options" role="group" aria-label="Answer options">
          ${it.order.map((oi, k) => {
            let cls = '';
            if (reveal) { if (oi === 0) cls = 'correct'; else if (k === it.pick) cls = 'wrong'; else cls = 'dim'; }
            else if (k === it.pick) cls = 'picked';
            return `<button type="button" class="opt ${cls}" data-k="${k}" ${reveal ? 'disabled' : ''} aria-pressed="${k === it.pick}">
              <span class="key">${LETTERS[k]}</span><span class="otext">${esc(q.o[oi])}</span>
              ${reveal && oi === 0 ? '<span class="verdict">Correct answer</span>' : ''}${reveal && k === it.pick && oi !== 0 ? '<span class="verdict">Your answer</span>' : ''}
            </button>`;
          }).join('')}
        </div>
        ${reveal ? explainBlock(q, it.order[it.pick] === 0) : ''}
        <div class="quiz-nav">
          <button class="btn ghost" id="prevBtn" type="button" ${s.i === 0 ? 'disabled' : ''}>Previous</button>
          <span class="muted small kbd-hint">Keys: 1–4 or A–D to answer, Enter for next</span>
          ${s.i < total - 1
            ? `<button class="btn primary" id="nextBtn" type="button" ${isPractice && !answered ? 'disabled' : ''}>${!isPractice && !answered ? 'Skip' : 'Next question'}</button>`
            : `<button class="btn primary" id="finishBtn" type="button" ${isPractice && !answered ? 'disabled' : ''}>${s.mode === 'test' ? 'Submit test' : 'See results'}</button>`}
        </div>
        ${s.mode === 'test' ? `<p class="small muted center">${answeredCount} of ${total} answered. You can move between questions and change answers until you submit.</p>` : ''}
      </section>`;

    main.querySelectorAll('.opt').forEach(b => b.addEventListener('click', () => choose(+b.dataset.k)));
    main.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { s.i = +b.dataset.go; renderQuiz(); }));
    $('#markBtn').onclick = () => { toggleMark(q.id); renderQuiz(); };
    $('#endBtn').onclick = () => {
      const left = s.items.filter(x => x.pick === null).length;
      if (left && !confirm(s.mode === 'test' ? `Submit now? ${plural(left, 'question')} unanswered will count as wrong.` : `End now? Results will include the ${answeredCount} you answered.`)) return;
      finish();
    };
    const prev = $('#prevBtn'); if (prev) prev.onclick = () => { s.i--; renderQuiz(); };
    const next = $('#nextBtn'); if (next) next.onclick = () => { s.i++; renderQuiz(); };
    const fin = $('#finishBtn'); if (fin) fin.onclick = () => {
      const left = s.items.filter(x => x.pick === null).length;
      if (s.mode === 'test' && left && !confirm(`Submit now? ${plural(left, 'question')} unanswered will count as wrong.`)) return;
      finish();
    };
    if (s.mode === 'test') startTimer();
    const cur = main.querySelector('.bead.cur'); if (cur) cur.scrollIntoView({ block: 'nearest', inline: 'center' });
    if (reveal) { const ex = $('.explain'); if (ex && ex.getBoundingClientRect().bottom > innerHeight) ex.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' }); }
  }

  function explainBlock(q, ok) {
    return `<div class="explain ${ok ? 'is-ok' : 'is-bad'}">
      <p class="explain-head">${ok ? 'Correct.' : 'Not quite.'} The answer is <strong>${esc(q.o[0])}</strong>.</p>
      <p>${esc(q.e)}</p>
      ${q.s ? `<p class="src">Source: ${esc(q.s)}</p>` : ''}
    </div>`;
  }

  function choose(k) {
    const s = session; const it = s.items[s.i];
    if (s.mode === 'practice') {
      if (it.pick !== null) return;
      it.pick = k;
      record(BY_ID[it.id], it.order[k] === 0);
    } else {
      it.pick = k;
    }
    renderQuiz();
    if (s.mode === 'practice') { const n = $('#nextBtn') || $('#finishBtn'); if (n) n.focus({ preventScroll: true }); }
  }

  function startTimer() {
    clearInterval(timerId);
    const s = session;
    const tick = () => {
      const left = Math.max(0, s.limit - Math.floor((Date.now() - s.started) / 1000));
      const el = $('#timer'); if (el) { el.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} left`; el.classList.toggle('low', left <= 60); }
      if (left === 0) { clearInterval(timerId); finish(true); }
    };
    tick(); timerId = setInterval(tick, 1000);
  }

  function finish(timedOut) {
    clearInterval(timerId);
    const s = session; if (!s) return;
    if (s.mode === 'test') s.items.forEach(it => { if (it.pick !== null) record(BY_ID[it.id], it.order[it.pick] === 0); else record(BY_ID[it.id], false); });
    const items = s.mode === 'practice' ? s.items.filter(it => it.pick !== null) : s.items;
    const correct = items.filter(it => it.pick !== null && it.order[it.pick] === 0).length;
    lastResult = { label: s.label, mode: s.mode, items, correct, timedOut: !!timedOut, secs: Math.round((Date.now() - s.started) / 1000), opts: s.opts };
    history.unshift({ d: Date.now(), label: s.label, mode: s.mode, c: correct, n: items.length });
    history = history.slice(0, 30); store.set('iks-history', history);
    session = null;
    go('#/results');
  }

  document.addEventListener('keydown', e => {
    if (!session || location.hash !== '#/quiz' || e.target.matches('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    const idx = ['1', '2', '3', '4'].indexOf(k) >= 0 ? +k - 1 : ['a', 'b', 'c', 'd'].indexOf(k);
    if (idx >= 0) { e.preventDefault(); choose(idx); return; }
    if (k === 'enter' || k === 'arrowright') {
      if (document.activeElement && document.activeElement.matches('.opt') && k === 'enter') return; // let button activate
      const n = $('#nextBtn') || $('#finishBtn'); if (n && !n.disabled) { e.preventDefault(); n.click(); }
    } else if (k === 'arrowleft') { const p = $('#prevBtn'); if (p && !p.disabled) { e.preventDefault(); p.click(); } }
    else if (k === 's') { const m = $('#markBtn'); if (m) m.click(); }
  });

  // ---------- RESULTS ----------
  function renderResults(filter = 'all') {
    const r = lastResult;
    const n = r.items.length;
    if (!n) { main.innerHTML = `<section class="results"><h1>No answers recorded</h1><p class="lede">You ended the session before answering anything.</p><p><a class="btn primary" href="#/">Back to practice</a></p></section>`; return; }
    const wrong = r.items.filter(it => it.pick === null || it.order[it.pick] !== 0);
    const score = pct(r.correct, n);
    const byTopic = {};
    r.items.forEach(it => { const q = BY_ID[it.id]; const key = `Unit ${q.u}: ${q.t}`; byTopic[key] = byTopic[key] || { c: 0, n: 0 }; byTopic[key].n++; if (it.pick !== null && it.order[it.pick] === 0) byTopic[key].c++; });
    const verdict = score >= 85 ? 'Excellent — you know this material well.' : score >= 65 ? 'Good. Review the ones you missed below.' : score >= 40 ? 'Getting there. Read the explanations for the misses, then retry them.' : 'Worth another pass. Try Revise mode for these topics first.';
    const mins = Math.floor(r.secs / 60), secs = r.secs % 60;
    const shown = filter === 'wrong' ? wrong : r.items;

    main.innerHTML = `
      <section class="results">
        <p class="set-label">${esc(r.label)}${r.mode === 'test' ? ' (mock test)' : ''}</p>
        <h1>You scored ${r.correct} out of ${n}.</h1>
        <div class="score-ring" style="--p:${score}" role="img" aria-label="${score} percent"><span>${score}%</span></div>
        <p class="lede">${verdict}${r.timedOut ? ' Time ran out, so unanswered questions were counted as wrong.' : ''} Time taken: ${mins ? mins + ' min ' : ''}${secs} s.</p>
        <div class="quick">
          ${wrong.length ? `<button class="btn primary" id="retryWrong" type="button">Retry the ${plural(wrong.length, 'missed question')}</button>` : ''}
          <button class="btn" id="again" type="button">New set, same settings</button>
          <a class="btn ghost" href="#/">Change settings</a>
        </div>

        <h2>By topic</h2>
        <table class="topic-table">
          <thead><tr><th scope="col">Topic</th><th scope="col">Score</th><th scope="col"><span class="sr">Bar</span></th></tr></thead>
          <tbody>${Object.entries(byTopic).sort((a, b) => a[1].c / a[1].n - b[1].c / b[1].n).map(([t, v]) =>
            `<tr><td>${esc(t)}</td><td class="num">${v.c}/${v.n}</td><td class="barcell"><div class="meter ${pct(v.c, v.n) < 50 ? 'weak' : ''}"><span style="width:${pct(v.c, v.n)}%"></span></div></td></tr>`).join('')}</tbody>
        </table>

        <div class="review-head">
          <h2>Review answers</h2>
          <div class="seg small" role="radiogroup" aria-label="Show">
            <button type="button" role="radio" data-f="all" aria-checked="${filter === 'all'}">All ${n}</button>
            <button type="button" role="radio" data-f="wrong" aria-checked="${filter === 'wrong'}">Missed ${wrong.length}</button>
          </div>
        </div>
        ${shown.length ? `<ol class="review">${shown.map(it => reviewItem(it)).join('')}</ol>` : '<p class="muted">Nothing missed. Well done.</p>'}
      </section>`;

    main.querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => renderResults(b.dataset.f)));
    const rw = $('#retryWrong'); if (rw) rw.onclick = () => startSession(wrong.map(it => BY_ID[it.id]), { order: 'random', count: 'all', mode: 'practice', label: 'Retry: missed questions' });
    $('#again').onclick = () => {
      const o = r.opts || {};
      if (o.label === 'My mistakes') return startSession(mistakes(), o);
      if (o.label === 'Saved questions') return startSession(QB.filter(q => marks.has(q.id)), o);
      if (o.label && o.label.startsWith('Unit ') && o.label.endsWith('random 20')) return startSession(QB.filter(q => q.u === +o.label[5]), o);
      if (o.label === 'Random mix — all units') return startSession(QB, o);
      startSession(pool(prefs), Object.assign({}, o, { label: r.label }));
    };
  }

  function reviewItem(it) {
    const q = BY_ID[it.id];
    const ok = it.pick !== null && it.order[it.pick] === 0;
    const yours = it.pick === null ? 'Not answered' : q.o[it.order[it.pick]];
    return `<li class="ritem ${ok ? 'is-ok' : 'is-bad'}">
      <p class="topic-tag">Unit ${q.u} <span aria-hidden="true">/</span> ${esc(q.t)}</p>
      <p class="rq">${esc(q.q)}</p>
      <p class="ra"><span class="tag ${ok ? 'ok' : 'bad'}">${ok ? 'Correct' : 'Missed'}</span>
        ${ok ? esc(q.o[0]) : `Your answer: <s>${esc(yours)}</s><br>Correct: <strong>${esc(q.o[0])}</strong>`}</p>
      <p class="re">${esc(q.e)}</p>
      <div class="ritem-foot">${q.s ? `<span class="src">Source: ${esc(q.s)}</span>` : '<span></span>'}
        <button type="button" class="link" data-mark="${q.id}">${marks.has(q.id) ? 'Saved' : 'Save for later'}</button></div>
    </li>`;
  }
  main.addEventListener('click', e => {
    const b = e.target.closest('[data-mark]'); if (!b) return;
    toggleMark(b.dataset.mark); b.textContent = marks.has(b.dataset.mark) ? 'Saved' : 'Save for later';
  });

  // ---------- REVISE ----------
  let rev = { unit: 1, topic: 'all', q: '', hide: false, saved: false };
  function renderRevise() {
    main.innerHTML = `
      <section class="revise">
        <h1>Revise</h1>
        <p class="lede">Every question with its answer and explanation, grouped by topic. Hide the answers to test yourself.</p>
        <div class="rev-controls">
          <div class="seg" role="radiogroup" aria-label="Unit" id="revUnit">
            ${[1, 2, 3].map(u => `<button type="button" role="radio" data-u="${u}" aria-checked="${rev.unit === u}">Unit ${u}</button>`).join('')}
            <button type="button" role="radio" data-u="0" aria-checked="${rev.unit === 0}">All</button>
          </div>
          <label class="sel"><span class="sr">Topic</span>
            <select id="revTopic">
              <option value="all">All topics</option>
              ${(rev.unit ? TOPICS[rev.unit] : []).map(t => `<option ${rev.topic === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
            </select></label>
          <label class="search"><span class="sr">Search</span><input id="revSearch" type="search" placeholder="Search questions, e.g. Nalanda" value="${esc(rev.q)}"></label>
          <label class="check"><input type="checkbox" id="revHide" ${rev.hide ? 'checked' : ''}> Hide answers</label>
          <label class="check"><input type="checkbox" id="revSaved" ${rev.saved ? 'checked' : ''}> Saved only</label>
        </div>
        <div id="revList"></div>
      </section>`;
    if (!rev.unit) $('#revTopic').disabled = true;
    const list = () => {
      const needle = rev.q.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      let qs = QB.filter(q => (!rev.unit || q.u === rev.unit) && (rev.topic === 'all' || q.t === rev.topic) && (!rev.saved || marks.has(q.id)));
      if (needle) qs = qs.filter(q => norm(q.q + ' ' + q.o[0] + ' ' + q.e + ' ' + q.t).includes(needle));
      if (!qs.length) { $('#revList').innerHTML = `<p class="muted">No questions match. Try a different word${rev.saved ? ', or untick “Saved only”' : ''}.</p>`; return; }
      const groups = {};
      qs.forEach(q => { const k = `Unit ${q.u}: ${q.t}`; (groups[k] = groups[k] || []).push(q); });
      $('#revList').innerHTML = `<p class="small muted">${plural(qs.length, 'question')}</p>` + Object.entries(groups).map(([g, arr]) => `
        <section class="rev-group"><h2>${esc(g)}</h2>
          <ol class="cards">${arr.map(q => `<li class="card">
            <p class="rq">${esc(q.q)}</p>
            ${rev.hide
              ? `<details><summary>Show answer</summary><p class="ans">${esc(q.o[0])}</p><p class="re">${esc(q.e)}</p></details>`
              : `<p class="ans">${esc(q.o[0])}</p><p class="re">${esc(q.e)}</p>`}
            <div class="ritem-foot">${q.s ? `<span class="src">${esc(q.s)}</span>` : '<span></span>'}<button type="button" class="link" data-mark="${q.id}">${marks.has(q.id) ? 'Saved' : 'Save for later'}</button></div>
          </li>`).join('')}</ol>
          <button type="button" class="btn small" data-practise="${esc(g)}">Practise these ${arr.length}</button>
        </section>`).join('');
      main.querySelectorAll('[data-practise]').forEach(b => b.addEventListener('click', () => {
        const arr = groups[b.dataset.practise];
        startSession(arr, { order: 'random', count: 'all', mode: 'practice', label: b.dataset.practise });
      }));
    };
    $('#revUnit').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { rev.unit = +b.dataset.u; rev.topic = 'all'; renderRevise(); }));
    $('#revTopic').addEventListener('change', e => { rev.topic = e.target.value; list(); });
    let deb; $('#revSearch').addEventListener('input', e => { clearTimeout(deb); deb = setTimeout(() => { rev.q = e.target.value; list(); }, 150); });
    $('#revHide').addEventListener('change', e => { rev.hide = e.target.checked; list(); });
    $('#revSaved').addEventListener('change', e => { rev.saved = e.target.checked; list(); });
    list();
  }

  // ---------- PROGRESS ----------
  function renderProgress() {
    const tried = QB.filter(q => stats[q.id]);
    const attempts = tried.reduce((a, q) => a + stats[q.id].a, 0);
    const corrects = tried.reduce((a, q) => a + stats[q.id].c, 0);
    const mastered = tried.filter(q => stats[q.id].c > 0 && !stats[q.id].w).length;
    main.innerHTML = `
      <section class="progress">
        <h1>Your progress</h1>
        ${tried.length ? `
        <p class="lede">You have tried ${tried.length} of ${QB.length} questions (${attempts} answers in total, ${pct(corrects, attempts)}% correct). ${mastered} are mastered — answered correctly the last time you saw them.</p>
        <p class="small muted">Progress is saved in this browser only. Clearing browser data or switching devices starts fresh.</p>
        ${[1, 2, 3].map(u => `
          <section class="prog-unit">
            <h2>Unit ${u}: ${UNITS[u].name}</h2>
            <table class="topic-table">
              <thead><tr><th scope="col">Topic</th><th scope="col">Tried</th><th scope="col">Accuracy</th><th scope="col"><span class="sr">Mastered</span></th></tr></thead>
              <tbody>${TOPICS[u].map(t => {
                const qs = QB.filter(q => q.u === u && q.t === t);
                const tr = qs.filter(q => stats[q.id]);
                const a = tr.reduce((x, q) => x + stats[q.id].a, 0), c = tr.reduce((x, q) => x + stats[q.id].c, 0);
                const m = tr.filter(q => stats[q.id].c > 0 && !stats[q.id].w).length;
                return `<tr><td>${esc(t)}</td><td class="num">${tr.length}/${qs.length}</td><td class="num">${a ? pct(c, a) + '%' : '–'}</td>
                  <td class="barcell"><div class="meter ${a && pct(c, a) < 50 ? 'weak' : ''}" role="img" aria-label="${m} of ${qs.length} mastered"><span style="width:${pct(m, qs.length)}%"></span></div></td></tr>`;
              }).join('')}</tbody>
            </table>
          </section>`).join('')}
        ${history.length ? `<h2>Recent sessions</h2>
          <ol class="hist">${history.slice(0, 12).map(h => `<li><span>${esc(h.label)}${h.mode === 'test' ? ' (test)' : ''}</span><span class="num">${h.c}/${h.n}</span><time class="muted small">${new Date(h.d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time></li>`).join('')}</ol>` : ''}
        <p><button class="btn ghost" id="resetBtn" type="button">Reset all progress</button></p>
        ` : `<p class="lede">Nothing here yet. Answer a few questions and your accuracy by unit and topic will show up here.</p><p><a class="btn primary" href="#/">Start practising</a></p>`}
      </section>`;
    const r = $('#resetBtn'); if (r) r.onclick = () => {
      if (!confirm('Reset all progress, mistakes and session history? Saved questions are kept.')) return;
      stats = {}; history = []; store.set('iks-stats', stats); store.set('iks-history', history); renderProgress();
    };
  }

  route();
})();
