/* learn.js — 배우기: 레슨 목록, 레슨 진행(그림판 넘기기 · 직접 두기 · AI 채점 · 퀴즈 · 봇 도전), 진도 */
(function () {
  'use strict';
  const A = window.BadukApp;
  const { BLACK, WHITE, EMPTY, PASS } = Go;
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const esc = A.esc, el = A.el;
  const PARTS = window.LEARN_PARTS || [];
  const LESSONS = window.LEARN_LESSONS || [];
  let progress = A.store.get('learn', {});
  const saveProgress = () => { A.store.set('learn', progress); if (window.Sync && window.Sync.push) window.Sync.push('learn'); };
  let view = null, cur = null;

  // ───────── 좌표 ─────────
  const LET = 'ABCDEFGHJKLMNOPQRST';
  function pt(s, size) {
    s = s.trim().toUpperCase(); if (!s || s === 'PASS') return PASS;
    const x = LET.indexOf(s[0]), n = parseInt(s.slice(1), 10);
    if (x < 0 || x >= size || !(n >= 1 && n <= size)) throw new Error('bad coord ' + s);
    return (size - n) * size + x;
  }
  function pts(str, size) { // "A1 B2 C3-E5(사각형)"
    const out = [];
    for (const tok of (str || '').split(/[\s,]+/).filter(Boolean)) {
      if (tok.includes('-')) {
        const [a, b] = tok.split('-'); const p = pt(a, size), q = pt(b, size);
        const x0 = Math.min(p % size, q % size), x1 = Math.max(p % size, q % size), y0 = Math.min((p / size) | 0, (q / size) | 0), y1 = Math.max((p / size) | 0, (q / size) | 0);
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push(y * size + x);
      } else out.push(pt(tok, size));
    }
    return out;
  }
  const colorOf = c => c === 'w' || c === WHITE ? WHITE : BLACK;

  /** 스텝의 시작 판 */
  function setupBoard(step) {
    const size = step.size || 9;
    const b = new Go.Board(size);
    for (const p of pts(step.b, size)) { b.stones[p] = BLACK; }
    for (const p of pts(step.w, size)) { b.stones[p] = WHITE; }
    b.toPlay = colorOf(step.toPlay || step.first || 'b');
    return b;
  }
  function stepSize(step) { return step.size || 9; }

  // ───────── 목록 ─────────
  function lessonDone(id) { return !!(progress[id] && progress[id].done); }
  function nextLesson() { return LESSONS.find(l => !lessonDone(l.id)) || null; }
  function onShow() {
    const total = LESSONS.length, done = LESSONS.filter(l => lessonDone(l.id)).length;
    const next = nextLesson();
    const hero = $('#learn-hero');
    hero.innerHTML = `<div><h1>배우기</h1><div class="sub">${total}개 레슨 중 ${done}개 완료 · 레슨 하나에 3~5분</div></div>
      <div class="progress-bar"><div style="width:${total ? Math.round(done / total * 100) : 0}%"></div></div>
      <button class="btn primary lg block" id="learn-continue"><svg><use href="#i-book"/></svg>${next ? `이어서 배우기 · ${esc(next.title)}` : '모든 레슨 완료! 처음부터 복습하기'}</button>`;
    $('#learn-continue').onclick = () => openLesson((next || LESSONS[0]).id);
    const list = $('#learn-parts'); list.innerHTML = '';
    for (const part of PARTS) {
      const ls = LESSONS.filter(l => l.part === part.id);
      const d = ls.filter(l => lessonDone(l.id)).length;
      const card = el(`<div class="card pad-0 learn-part"><button class="learn-part-head"><div class="avatar" style="background:linear-gradient(140deg,${part.color},${part.color}aa);font-size:15px">${part.id}</div><div class="grow"><div class="primary-text">${esc(part.title)}</div><div class="secondary-text">${esc(part.desc)}</div><div class="progress-bar" style="margin-top:8px;height:5px"><div style="width:${ls.length ? Math.round(d / ls.length * 100) : 0}%"></div></div></div><span class="chip">${d}/${ls.length}</span></button><div class="list learn-lessons" hidden></div></div>`);
      const box = card.querySelector('.learn-lessons');
      for (const l of ls) {
        const done = lessonDone(l.id);
        const kind = l.steps.some(s => s.type === 'challenge') ? '실전' : `${l.mins || 4}분`;
        const row = el(`<button class="list-row"><span class="learn-dot ${done ? 'done' : ''}">${done ? '✓' : ''}</span><div class="grow"><div class="primary-text">${esc(l.title)}</div><div class="secondary-text">${esc(l.summary || '')}</div></div><span class="chip ${kind === '실전' ? 'accent' : ''}">${kind}</span><svg class="chev"><use href="#i-chev"/></svg></button>`);
        row.onclick = () => openLesson(l.id);
        box.appendChild(row);
      }
      const head = card.querySelector('.learn-part-head');
      const openKey = 'learnOpen' + part.id;
      box.hidden = !A.store.get(openKey, next && next.part === part.id);
      head.onclick = () => { box.hidden = !box.hidden; A.store.set(openKey, !box.hidden); };
      list.appendChild(card);
    }
  }

  // ───────── 레슨 ─────────
  function ensureView(size) {
    if (!view) {
      view = new BoardView($('#learn-wrap'), { size, theme: A.settings.theme, stoneStyle: A.settings.stone, coords: true });
      view.on('press', (e) => { if (!cur) return; const p = view.pointFromClient(e.clientX, e.clientY, 0); onTap(p); });
    }
    view.setTheme(A.settings.theme); view.setStoneStyle(A.settings.stone); view.setCoords(true);
    view.setSize(size);
    return view;
  }
  function onShowLesson() { if (view) view.resize(); }

  function openLesson(id) {
    const lesson = LESSONS.find(l => l.id === id); if (!lesson) return;
    cur = { lesson, si: 0 };
    A.showScreen('learn-lesson');
    startStep(0);
  }
  function startStep(i) {
    cur.si = i;
    const step = cur.lesson.steps[i];
    cur.step = step;
    cur.size = stepSize(step);
    cur.state = 'idle'; cur.feedback = null; cur.k = 0; cur.extra = null; cur.board = null;
    cur.solved = step.type === 'show' || step.type === 'text'; cur.aiBest = null; cur.quizPick = null;
    const hasBoard = !['quiz', 'text', 'challenge'].includes(step.type) || !!(step.b || step.w || step.moves);
    $('#learn-board-col').hidden = !hasBoard;
    if (hasBoard) {
      cur.board = setupBoard(step);
      if (step.type === 'show') { cur.seq = pts(step.moves || '', cur.size); cur.k = step.start != null ? step.start : 0; }
      ensureView(cur.size);
    }
    render();
    window.scrollTo(0, 0);
  }

  /** show 스텝: k수까지 둔 판 */
  function boardAtK() {
    const step = cur.step, b = setupBoard(step);
    const numbers = new Map(); let col = colorOf(step.first || 'b'); let last = -1;
    for (let i = 0; i < cur.k; i++) {
      const p = cur.seq[i];
      if (p !== PASS) { try { b.play(p, col); numbers.set(p, i + 1); last = p; } catch (e) { b.stones[p] = col; } }
      col = 3 - col;
    }
    for (const [p] of numbers) if (b.stones[p] === EMPTY) numbers.delete(p);
    return { b, numbers, last };
  }

  function marksOf(spec, size) {
    const out = [];
    if (!spec) return out;
    const add = (type, s, extra) => { for (const p of pts(s, size)) out.push(Object.assign({ type, p }, extra || {})); };
    if (spec.tri) add('triangle', spec.tri, { color: '#e8833a' });
    if (spec.circ) add('circle', spec.circ, { color: '#1baaa0' });
    if (spec.sq) add('square', spec.sq, { color: '#4f7cd9' });
    if (spec.x) add('label', spec.x, { text: '×', color: '#d9534f' });
    if (spec.dot) add('dot', spec.dot, { color: 'rgba(27,170,160,0.75)' });
    if (spec.labels) for (const k in spec.labels) out.push({ type: 'label', p: pt(k, size), text: spec.labels[k], color: '#1baaa0' });
    return out;
  }
  function ownerOf(spec, size) {
    if (!spec) return null;
    const o = new Int8Array(size * size);
    for (const p of pts(spec.b, size)) o[p] = BLACK;
    for (const p of pts(spec.w, size)) o[p] = WHITE;
    return o;
  }

  function draw() {
    if (!cur.board) return;
    const step = cur.step, size = cur.size;
    let stones = cur.board.stones, numbers = null, last = -1, marks = [], owner = null;
    if (step.type === 'show') {
      const r = boardAtK(); stones = r.b.stones; numbers = step.numbers === false ? null : r.numbers; last = r.last;
      const note = step.notes && step.notes[cur.k];
      marks = marksOf((note && note.marks) || (cur.k === cur.seq.length || !cur.seq.length ? step.marks : null), size);
      owner = ownerOf((note && note.terr) || (cur.k === cur.seq.length || !cur.seq.length ? step.terr : null), size);
    } else {
      marks = cur.state === 'idle' ? marksOf(step.marks, size) : [];
      if (cur.extra) { stones = cur.extra.stones; numbers = cur.extra.numbers; last = cur.extra.last; marks = marks.concat(cur.extra.marks || []); }
      if (step.terr && cur.state === 'idle') owner = ownerOf(step.terr, size);
    }
    view.setState({ stones, lastMove: last, ghost: null, dead: null, owner, marks, numbers, dimAll: false });
  }

  function render() {
    const { lesson, si, step } = cur;
    const n = lesson.steps.length;
    $('#learn-head').innerHTML = `<div class="learn-crumb">${esc(partTitle(lesson.part))}</div><div class="learn-title">${esc(lesson.title)}</div><div class="learn-steps">${lesson.steps.map((_, i) => `<i class="${i < si ? 'done' : i === si ? 'on' : ''}"></i>`).join('')}</div>`;
    if (cur.board) draw();
    const card = $('#learn-card');
    let html = `<div class="learn-text">${fmt(step.text || '')}</div>`;
    if (step.type === 'show' && cur.seq.length) {
      const note = step.notes && step.notes[cur.k];
      const col = (i) => (i % 2 === 0) ? colorOf(step.first || 'b') : 3 - colorOf(step.first || 'b');
      const moveTxt = cur.k > 0 ? `${cur.k}. ${A.colorName(col(cur.k - 1))} ${cur.seq[cur.k - 1] === PASS ? '손빼기' : Go.coordLabel(cur.seq[cur.k - 1], size())}` : '';
      html += `<div class="learn-note">${cur.k === 0 ? '<span class="muted">▶를 눌러 한 수씩 보세요.</span>' : `<b>${esc(moveTxt)}</b>${note && note.t ? ' — ' + fmt(note.t) : ''}`}</div>`;
      html += navRow(cur.k, cur.seq.length);
    }
    if (step.type === 'play' || step.type === 'ai') {
      const who = A.colorName(colorOf(step.toPlay || 'b'));
      if (cur.state === 'idle') html += `<div class="learn-task"><span class="stone-dot ${colorOf(step.toPlay || 'b') === BLACK ? 'b' : 'w'}"></span>${who} 차례 — 판에 직접 두세요${step.type === 'ai' ? ' <span class="chip">AI 채점</span>' : ''}</div>`;
      if (cur.state === 'thinking') html += `<div class="learn-task muted">AI가 채점하는 중…</div>`;
      if (cur.feedback) html += `<div class="learn-fb ${cur.feedback.ok ? 'ok' : 'no'}"><b>${cur.feedback.ok ? '좋아요!' : '아쉬워요'}</b> ${fmt(cur.feedback.text)}</div>`;
      if (cur.extra && cur.extra.seqLen) html += navRow(cur.extra.k, cur.extra.seqLen, 'ex');
    }
    if (step.type === 'quiz') {
      html += `<div class="learn-quiz">${step.options.map((o, i) => `<button class="learn-opt ${cur.quizPick === i ? (i === step.answer ? 'ok' : 'no') : (cur.quizPick != null && i === step.answer ? 'ok' : '')}" data-i="${i}" ${cur.quizPick != null ? 'disabled' : ''}>${fmt(o)}</button>`).join('')}</div>`;
      if (cur.quizPick != null) html += `<div class="learn-fb ${cur.quizPick === step.answer ? 'ok' : 'no'}"><b>${cur.quizPick === step.answer ? '정답!' : '오답'}</b> ${fmt(step.explain || '')}</div>`;
    }
    if (step.type === 'challenge') {
      const bot = A.botByLevel(step.bot || 1);
      html += `<div class="learn-challenge">${A.avatarHTML(bot)}<div class="grow"><div style="font-weight:700">${esc(bot.name)} ${esc(bot.rank)} · ${step.size || 9}줄${step.handicap ? ` · ${step.handicap}점 접바둑` : ''}</div><div class="small muted">${esc(step.goal || '이 레슨에서 배운 것을 실전에서 써 보세요.')}</div></div></div>
        <button class="btn primary block" id="learn-start-game"><svg><use href="#i-play"/></svg>도전하기</button>`;
    }
    card.innerHTML = html;
    // 네비게이션
    const bind = (id, fn) => { const b = $('#' + id); if (b) b.onclick = fn; };
    if (step.type === 'show') { bind('nv-first', () => goK(0)); bind('nv-prev', () => goK(cur.k - 1)); bind('nv-next', () => goK(cur.k + 1)); bind('nv-last', () => goK(cur.seq.length)); }
    if (cur.extra) { bind('ex-first', () => goEx(0)); bind('ex-prev', () => goEx(cur.extra.k - 1)); bind('ex-next', () => goEx(cur.extra.k + 1)); bind('ex-last', () => goEx(cur.extra.seqLen)); }
    $$('#learn-card .learn-opt').forEach(b => b.onclick = () => { cur.quizPick = +b.dataset.i; cur.solved = true; render(); });
    bind('learn-start-game', () => { markDone(); A.startGameWith({ size: step.size || 9, bot: step.bot || 1, color: BLACK, handicap: step.handicap || 0 }); });
    // 하단 버튼
    const ctl = $('#learn-controls'); ctl.innerHTML = '';
    const btn = (label, cls, fn, dis) => { const b = el(`<button class="btn ${cls}" ${dis ? 'disabled' : ''}>${label}</button>`); b.onclick = fn; ctl.appendChild(b); };
    btn('이전', 'secondary', () => startStep(si - 1), si === 0);
    if ((step.type === 'play' || step.type === 'ai') && !cur.solved && cur.state === 'idle') {
      if (cur.feedback && !cur.feedback.ok) btn('다시 두기', 'secondary', retry);
      btn('정답 보기', 'secondary', revealAnswer);
    }
    const last = si === n - 1;
    btn(last ? '레슨 완료' : '다음', 'primary', () => { if (last) finishLesson(); else startStep(si + 1); }, !cur.solved && step.type !== 'challenge');
  }
  const size = () => cur.size;
  function navRow(k, n, pre) {
    pre = pre || 'nv';
    return `<div class="nav-row" style="margin-top:10px">
      <button class="btn secondary" id="${pre}-first" aria-label="처음" ${k === 0 ? 'disabled' : ''}><svg><use href="#i-first"/></svg></button>
      <button class="btn secondary" id="${pre}-prev" aria-label="이전" ${k === 0 ? 'disabled' : ''}><svg><use href="#i-prev"/></svg></button>
      <button class="btn ${k < n ? 'primary' : 'secondary'}" id="${pre}-next" aria-label="다음" ${k >= n ? 'disabled' : ''}><svg><use href="#i-next"/></svg></button>
      <button class="btn secondary" id="${pre}-last" aria-label="끝" ${k >= n ? 'disabled' : ''}><svg><use href="#i-last"/></svg></button></div>`;
  }
  function goK(k) { cur.k = Math.max(0, Math.min(cur.seq.length, k)); render(); }
  function partTitle(id) { const p = PARTS.find(x => x.id === id); return p ? `${p.id}부 · ${p.title}` : ''; }
  function fmt(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>'); }

  // ───────── 직접 두기 ─────────
  function retry() { cur.feedback = null; cur.extra = null; cur.state = 'idle'; render(); }
  function onTap(p) {
    const step = cur.step;
    if (step.type === 'show') { if (cur.k < cur.seq.length) goK(cur.k + 1); return; }
    if (cur.extra && cur.extra.seqLen) { if (cur.extra.k < cur.extra.seqLen) goEx(cur.extra.k + 1); return; }
    if (p < 0 || cur.state !== 'idle' || cur.solved) return;
    if (cur.feedback && !cur.feedback.ok) { cur.feedback = null; cur.extra = null; }
    const color = colorOf(step.toPlay || 'b');
    const chk = cur.board.check(p, color);
    if (!chk.ok) { A.toast(chk.reason === 'occupied' ? '이미 돌이 있어요' : '둘 수 없는 자리예요'); return; }
    if (step.type === 'play') gradePlay(p, color); else gradeAI(p, color);
  }
  function gradePlay(p, color) {
    const step = cur.step, size = cur.size;
    const answers = pts(step.answer, size);
    const coordTxt = Go.coordLabel(p, size);
    if (answers.includes(p)) {
      cur.solved = true;
      cur.feedback = { ok: true, text: step.ok || '정답이에요.' };
      showContinuation(p, color, step.then);
      markStepSolved();
    } else {
      const no = step.no && Object.keys(step.no).find(k => pts(k, size).includes(p));
      cur.feedback = { ok: false, text: no ? step.no[no] : (step.wrong || `${coordTxt}은(는) 아니에요. 다시 생각해 보세요.`) };
      if (step.refute && step.refute[coordTxt]) showContinuation(p, color, step.refute[coordTxt]);
      else { const b = cur.board.clone(); try { b.play(p, color); } catch (_) { } cur.extra = { stones: b.stones, numbers: null, last: p, marks: [{ type: 'label', p, text: '×', color: '#d9534f' }] }; }
    }
    render();
  }
  /** p를 둔 뒤 이어지는 수순(then)을 화살표로 볼 수 있게 */
  function showContinuation(p, color, then) {
    const seq = [p].concat(then ? pts(then, cur.size) : []);
    cur.extra = { seq, k: seq.length > 1 ? 1 : 1, seqLen: seq.length > 1 ? seq.length : 0, color };
    goEx(1);
  }
  function goEx(k) {
    const ex = cur.extra; if (!ex || !ex.seq) return;
    ex.k = Math.max(0, Math.min(ex.seq.length, k));
    const b = cur.board.clone(); let col = ex.color; const numbers = new Map(); let last = -1;
    for (let i = 0; i < ex.k; i++) { const q = ex.seq[i]; if (q !== PASS) { try { b.play(q, col); numbers.set(q, i + 1); last = q; } catch (_) { b.stones[q] = col; } } col = 3 - col; }
    for (const [q] of numbers) if (b.stones[q] === EMPTY) numbers.delete(q);
    ex.stones = b.stones; ex.numbers = ex.seq.length > 1 ? numbers : null; ex.last = last;
    render();
  }
  async function gradeAI(p, color) {
    const step = cur.step, size = cur.size;
    cur.state = 'thinking'; cur.extra = { stones: (() => { const b = cur.board.clone(); b.play(p, color); return b.stones; })(), numbers: null, last: p };
    render();
    try {
      await A.ensureKata();
      const setup = { black: pts(step.b, size), white: pts(step.w, size) };
      const baseSpec = { size, komi: step.komi != null ? step.komi : 6.5, moves: [], setup: Object.assign({}, setup, { toPlay: color }) };
      // 기준 위치: color 차례. 최선수와 비교
      const specFor = q => ({ size, komi: baseSpec.komi, moves: [{ c: color, p: q }], setup: baseSpec.setup });
      if (!cur.aiBest) {
        const res = await A.kata.analyze(baseSpec, { playouts: A.kata.backend === 'webgl' ? 48 : 8, earlyStop: false });
        cur.aiBest = res.moves.filter(m => m.p >= 0).slice(0, 3);
      }
      const evalAfter = async q => { const r = await A.kata.evaluate(specFor(q)); return -r.lead; }; // 상대 차례 평가 → 내 기준
      const mine = await evalAfter(p);
      const bestP = cur.aiBest[0].p;
      const best = bestP === p ? mine : await evalAfter(bestP);
      const loss = Math.max(0, best - mine);
      const tol = step.tolerance != null ? step.tolerance : 2;
      const top3 = cur.aiBest.map(m => Go.coordLabel(m.p, size)).join(', ');
      const ok = loss <= tol || cur.aiBest.some(m => m.p === p);
      cur.state = 'idle';
      if (ok) {
        cur.solved = true; markStepSolved();
        cur.feedback = { ok: true, text: `${loss < 0.3 ? 'AI 1순위와 거의 같은 수예요.' : `AI 최선보다 약 ${loss.toFixed(1)}집 작지만 충분히 좋은 수예요.`} AI 추천: ${top3}. ${step.ok || ''}` };
      } else {
        cur.feedback = { ok: false, text: `AI 최선보다 약 ${loss.toFixed(1)}집 손해예요. ${step.hint || '더 큰 곳이 있어요.'}` };
      }
      cur.extra.marks = cur.aiBest.map((m, i) => ({ type: 'label', p: m.p, text: 'ABC'[i], color: i === 0 ? '#1baaa0' : '#7d8794' })).filter(m => m.p !== p);
      if (!ok) cur.extra.marks = [];
    } catch (err) {
      cur.state = 'idle'; cur.solved = true;
      cur.feedback = { ok: true, text: 'AI를 켜지 못해서 채점을 건너뛰었어요. ' + (step.ok || '') };
    }
    render();
  }
  function revealAnswer() {
    const step = cur.step, size = cur.size, color = colorOf(step.toPlay || 'b');
    cur.solved = true;
    if (step.type === 'play') {
      const a = pts(step.answer, size)[0];
      cur.feedback = { ok: true, text: '정답은 ' + Go.coordLabel(a, size) + '이에요. ' + (step.ok || '') };
      showContinuation(a, color, step.then);
    } else if (step.type === 'ai') {
      if (cur.aiBest && cur.aiBest.length) {
        cur.feedback = { ok: true, text: 'AI 추천은 ' + cur.aiBest.map(m => Go.coordLabel(m.p, size)).join(', ') + '이에요. ' + (step.ok || '') };
        const b = cur.board.clone();
        cur.extra = { stones: b.stones, numbers: null, last: -1, marks: cur.aiBest.map((m, i) => ({ type: 'label', p: m.p, text: 'ABC'[i], color: i === 0 ? '#1baaa0' : '#7d8794' })) };
      } else if (step.answer) {
        cur.feedback = { ok: true, text: '좋은 수는 ' + pts(step.answer, size).map(q => Go.coordLabel(q, size)).join(', ') + ' 등이에요. ' + (step.ok || '') };
        cur.extra = { stones: cur.board.stones, numbers: null, last: -1, marks: pts(step.answer, size).map(q => ({ type: 'circle', p: q, color: '#1baaa0' })) };
      } else cur.feedback = { ok: true, text: step.ok || '' };
    }
    cur.state = 'idle';
    render();
  }
  function markStepSolved() { }
  function markDone() {
    const id = cur.lesson.id; progress[id] = Object.assign({}, progress[id], { done: true, last: new Date().toISOString() }); saveProgress();
  }
  function finishLesson() {
    markDone();
    const idx = LESSONS.indexOf(cur.lesson), next = LESSONS[idx + 1];
    const s = A.openSheet(`<div class="result-hero"><div class="big win">레슨 완료!</div><div class="sub">${esc(cur.lesson.title)}</div></div>
      ${cur.lesson.takeaway ? `<div class="card" style="padding:14px"><div class="card-title">기억할 것</div><div class="small">${fmt(cur.lesson.takeaway)}</div></div>` : ''}
      <div class="btn-row"><button class="btn secondary" id="lf-list">목록</button>${next ? `<button class="btn primary" id="lf-next">다음 레슨</button>` : ''}</div>`);
    s.querySelector('#lf-list').onclick = () => { A.closeSheet(); A.showScreen('learn'); };
    const nb = s.querySelector('#lf-next'); if (nb) nb.onclick = () => { A.closeSheet(); openLesson(next.id); };
  }

  window.Learn = { onShow, onShowLesson, openLesson, getProgress: () => progress, replaceProgress: p => { progress = p; A.store.set('learn', progress); if (A.screen === 'learn') onShow(); }, _pts: pts };
})();
