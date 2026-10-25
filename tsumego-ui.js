/* tsumego-ui.js — 사활 문제집 화면: 난이도별 목록, 풀이(상대 최강 응수), 힌트, 해설, 진도 저장 */
(function () {
  'use strict';
  const A = window.BadukApp;
  const { BLACK, WHITE, EMPTY, PASS } = Go;
  const KB = window.KataBoard;
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const esc = A.esc, el = A.el;
  const LEVELS = [
    { lv: 1, name: '입문', desc: '단수·따내기, 두 집 만들기' },
    { lv: 2, name: '초급', desc: '기본 사활 모양의 급소' },
    { lv: 3, name: '중급', desc: '먹여치기·치중, 몇 수 앞 읽기' },
    { lv: 4, name: '고급', desc: '복잡한 모양, 깊은 읽기' },
    { lv: 5, name: '유단자', desc: '넓은 눈 공간, 긴 수순' },
  ];
  const ALL = (window.TSUMEGO_PROBLEMS || []);
  const byLevel = lv => ALL.filter(p => p.level === lv);
  let progress = A.store.get('tsumego', {});
  const saveProgress = () => { A.store.set('tsumego', progress); if (window.Sync) window.Sync.push('tsumego'); };
  let view = null, cur = null; // cur: {prob (변환됨), board(KB), solver, state, moves, hintLevel, ...}

  // ───────── 대칭 변환 ─────────
  const SIZE = 9;
  function transformPos(p, sym) {
    if (p < 0) return p;
    let x = p % SIZE, y = (p / SIZE) | 0;
    if (sym & 1) x = SIZE - 1 - x;
    if (sym & 2) y = SIZE - 1 - y;
    if (sym & 4) { const t = x; x = y; y = t; }
    return y * SIZE + x;
  }
  function transformProblem(p, sym) {
    const t = a => a.map(q => transformPos(q, sym));
    return Object.assign({}, p, { black: t(p.black), white: t(p.white), target: t(p.target), region: t(p.region), sols: t(p.sols), line: t(p.line) });
  }
  const symOf = id => { let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % 8; };

  // ───────── 홈 ─────────
  function stats(lv) { const ps = byLevel(lv); let solved = 0; for (const p of ps) if (progress[p.id] && progress[p.id].solved) solved++; return { total: ps.length, solved }; }
  function onShow() {
    const hero = $('#ts-hero');
    let total = 0, solved = 0; for (const l of LEVELS) { const s = stats(l.lv); total += s.total; solved += s.solved; }
    const next = nextUnsolved();
    hero.innerHTML = `<div><h1>사활</h1><div class="sub">${total}문제 중 ${solved}문제 해결 · 틀리면 상대가 바로 반격해요</div></div>
      <div class="quick-opts"><span class="chip">${ALL.filter(p => p.goal === 'kill').length} 잡기</span><span class="chip">${ALL.filter(p => p.goal === 'live').length} 살기</span><span class="chip accent">정답은 AI가 검증했어요</span></div>
      <button class="btn primary lg block" id="ts-continue"><svg><use href="#i-puzzle"/></svg>${next ? `이어서 풀기 · ${LEVELS[next.level - 1].name}` : '모두 풀었어요! 무작위 다시 풀기'}</button>`;
    $('#ts-continue').onclick = () => { const p = next || ALL[Math.floor(Math.random() * ALL.length)]; openProblem(p.id); };
    const list = $('#ts-levels'); list.innerHTML = '';
    for (const l of LEVELS) {
      const s = stats(l.lv);
      const pct = s.total ? Math.round(s.solved / s.total * 100) : 0;
      const row = el(`<button class="list-row"><div class="avatar" style="background:linear-gradient(140deg,var(--accent),#1b7f6b);color:var(--accent-ink);font-size:14px">${l.lv}</div><div class="grow"><div class="primary-text">${esc(l.name)} <span class="chip" style="margin-left:4px">${s.solved}/${s.total}</span></div><div class="secondary-text">${esc(l.desc)}</div><div class="progress-bar" style="margin-top:8px;height:5px"><div style="width:${pct}%"></div></div></div><svg class="chev"><use href="#i-chev"/></svg></button>`);
      row.onclick = () => openLevel(l.lv);
      list.appendChild(row);
    }
    const wrong = ALL.filter(p => progress[p.id] && progress[p.id].failed && !progress[p.id].solved);
    $('#ts-wrong-card').hidden = !wrong.length;
    const wl = $('#ts-wrong-list'); wl.innerHTML = '';
    for (const p of wrong.slice(0, 8)) { const r = problemRow(p); wl.appendChild(r); }
  }
  function nextUnsolved() {
    for (const l of LEVELS) { const p = byLevel(l.lv).find(x => !(progress[x.id] && progress[x.id].solved)); if (p) return p; }
    return null;
  }
  function problemRow(p) {
    const st = progress[p.id] || {};
    const tag = st.solved ? '<span class="chip accent">해결</span>' : st.failed ? `<span class="chip warn">틀림 ${st.failed}</span>` : '';
    const row = el(`<button class="list-row"><div class="avatar sm" style="background:${p.goal === 'kill' ? '#2e3a4a' : '#3b4a3e'};font-size:12px">${p.goal === 'kill' ? '잡' : '살'}</div><div class="grow"><div class="primary-text">${esc(titleOf(p))}</div><div class="secondary-text">${LEVELS[p.level - 1].name} · ${p.kind === 'corner' ? '귀' : '변'} · ${p.sols.length > 1 ? '정답 여러 개' : '정답 하나'}</div></div>${tag}<svg class="chev"><use href="#i-chev"/></svg></button>`);
    row.onclick = () => openProblem(p.id);
    return row;
  }
  const titleOf = p => `${numberOf(p)}번 · ${p.toPlay === BLACK ? '흑' : '백'} 선 ${p.goal === 'kill' ? '잡기' : '살기'}`;
  function numberOf(p) { return byLevel(p.level).indexOf(p) + 1; }

  function openLevel(lv) {
    const ps = byLevel(lv);
    const s = A.openSheet(`<h2>${esc(LEVELS[lv - 1].name)} · ${ps.length}문제</h2><div class="list" id="ts-level-list" style="max-height:60vh;overflow:auto"></div>`);
    const list = s.querySelector('#ts-level-list');
    for (const p of ps) { const r = problemRow(p); r.onclick = () => { A.closeSheet(); openProblem(p.id); }; list.appendChild(r); }
  }

  // ───────── 풀기 ─────────
  function ensureView() {
    if (!view) {
      view = new BoardView($('#ts-wrap'), { size: SIZE, theme: A.settings.theme, stoneStyle: A.settings.stone, coords: A.settings.coords });
      view.on('press', (e, type) => { if (!cur || cur.state !== 'play' || cur.busy) return; const p = view.pointFromClient(e.clientX, e.clientY, 0); if (type === 'mouse') { if (p >= 0) userMove(p); } else { cur.ghost = p; draw(); } })
        .on('drag', (e, type) => { if (!cur || cur.state !== 'play' || cur.busy || type === 'mouse') return; cur.ghost = view.pointFromClient(e.clientX, e.clientY, 0); draw(); })
        .on('release', (e, type) => { if (!cur || cur.state !== 'play' || cur.busy || type === 'mouse') return; const p = cur.ghost; cur.ghost = -1; draw(); if (p >= 0) userMove(p); })
        .on('hover', (e) => { if (!cur || cur.state !== 'play') return; const p = view.pointFromClient(e.clientX, e.clientY, 0); if (p !== cur.ghost) { cur.ghost = p; draw(); } });
    }
    view.setTheme(A.settings.theme); view.setStoneStyle(A.settings.stone); view.setCoords(A.settings.coords);
    return view;
  }
  function onShowPlay() { if (view) view.resize(); }

  function openProblem(id) {
    const raw = ALL.find(p => p.id === id); if (!raw) return;
    const prob = transformProblem(raw, symOf(id));
    const board = Tsumego.Solver.makeBoard(prob);
    cur = { raw, prob, board, state: 'play', moves: [], ghost: -1, hint: 0, busy: false, startBoard: board.clone(), lastMove: -1, msg: '', refute: -1 };
    A.showScreen('tsumego-play');
    ensureView();
    render();
  }
  const toLoc = p => cur.board.loc(p % SIZE, (p / SIZE) | 0);
  const toPos = loc => loc === KB.PASS_LOC ? -1 : cur.board.y(loc) * SIZE + cur.board.x(loc);
  function stonesArray(board) { const out = new Uint8Array(SIZE * SIZE); for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) out[y * SIZE + x] = board.colors[board.loc(x, y)]; return out; }

  function draw() {
    const marks = [];
    if (cur.hint >= 1 && cur.state === 'play') for (const p of cur.prob.region) if (cur.board.colors[toLoc(p)] === EMPTY) marks.push({ type: 'dot', p, color: 'rgba(47,209,174,0.55)' });
    if (cur.hint >= 2 && cur.state === 'play' && cur.moves.length === 0) for (const p of cur.prob.sols) marks.push({ type: 'circle', p, color: '#2fd1ae' });
    if (cur.refute >= 0) marks.push({ type: 'triangle', p: cur.refute, color: '#ff6b6b' });
    const numbers = cur.showLine ? cur.showLine : null;
    view.setState({ stones: stonesArray(cur.board), lastMove: cur.lastMove, ghost: cur.state === 'play' && cur.ghost >= 0 && cur.board.colors[toLoc(cur.ghost)] === EMPTY ? { p: cur.ghost, c: cur.prob.toPlay, strong: true } : null, dead: null, owner: null, marks, numbers, dimAll: false });
  }

  function render() {
    const p = cur.prob;
    const goalTxt = p.goal === 'kill' ? `${A.colorName(3 - p.toPlay)}을 잡으세요` : `${A.colorName(p.toPlay)}을 살리세요`;
    $('#ts-prompt').outerHTML = `<div class="player-bar active" id="ts-prompt"><div class="avatar" style="background:${p.goal === 'kill' ? 'linear-gradient(140deg,#4a5a6e,#2b3542)' : 'linear-gradient(140deg,#4d6b55,#2f4336)'}">${p.goal === 'kill' ? '잡' : '살'}</div><div class="pinfo"><div class="pname"><span class="stone-dot ${p.toPlay === BLACK ? 'b' : 'w'}"></span>${A.colorName(p.toPlay)} 선 — ${esc(goalTxt)}</div><div class="pmeta"><span>${esc(LEVELS[p.level - 1].name)} ${numberOf(cur.raw)}번</span><span>${p.kind === 'corner' ? '귀' : '변'}</span><span>${p.sols.length > 1 ? '정답 여러 개' : '정답 하나'}</span></div></div></div>`;
    draw();
    renderPanel();
  }
  function renderPanel() {
    const st = cur.state, panel = $('#ts-panel'), ctl = $('#ts-controls'); ctl.innerHTML = '';
    const btn = (icon, label, cls, fn, disabled) => { const b = el(`<button class="ctl ${cls || ''}" ${disabled ? 'disabled' : ''}><svg><use href="#i-${icon}"/></svg><span>${label}</span></button>`); b.onclick = fn; ctl.appendChild(b); return b; };
    if (st === 'play') {
      panel.innerHTML = `<div class="card-title">${cur.moves.length ? '계속 두세요' : '첫 수를 두세요'}</div><div class="small muted">${cur.msg || (cur.prob.goal === 'kill' ? '상대는 가장 끈질기게 버텨요. 잘못 두면 바로 살아 버립니다.' : '상대는 가장 매서운 수로 공격해요. 잘못 두면 바로 잡혀요.')}</div>${cur.hint ? `<div class="small" style="margin-top:8px">💡 ${cur.hint === 1 ? '초록 점이 승부가 나는 자리예요.' : '동그라미가 정답 자리예요.'}</div>` : ''}`;
      btn('spark', cur.hint === 0 ? '힌트' : cur.hint === 1 ? '힌트 더' : '힌트 끝', '', () => { if (cur.hint < 2) { cur.hint++; draw(); renderPanel(); } }, cur.hint >= 2 || cur.moves.length > 0);
      btn('undo', '처음부터', '', () => restart());
      btn('review', '정답 보기', '', () => showSolution());
    } else if (st === 'wrong') {
      panel.innerHTML = `<div class="review-move-head"><span class="badge blunder lg">✕</span><div><div class="t">틀렸어요</div><div class="s">${esc(cur.msg)}</div></div></div>`;
      btn('undo', '다시 풀기', 'confirm', () => restart());
      btn('review', '정답 보기', '', () => showSolution());
    } else if (st === 'solved') {
      panel.innerHTML = `<div class="review-move-head"><span class="badge best lg">★</span><div><div class="t">정답!</div><div class="s">${esc(cur.msg)}</div></div></div>`;
      btn('next', '다음 문제', 'confirm', () => nextProblem());
      btn('review', '해설 보기', '', () => showSolution());
    } else if (st === 'solution') {
      panel.innerHTML = `<div class="card-title">정답 수순</div><div class="small">${cur.lineText}</div><div class="small muted" style="margin-top:6px">숫자 순서대로 두면 ${cur.prob.goal === 'kill' ? '상대가 어떻게 버텨도 잡혀요' : '상대가 어떻게 공격해도 살아요'}.</div>`;
      btn('undo', '다시 풀기', '', () => restart());
      btn('next', '다음 문제', 'confirm', () => nextProblem());
    }
    $('#ts-status').innerHTML = st === 'play' ? `${cur.moves.length}수째 · ${A.colorName(cur.prob.toPlay)} 차례` : '';
  }
  function restart() { cur.board = cur.startBoard.clone(); cur.moves = []; cur.state = 'play'; cur.msg = ''; cur.refute = -1; cur.lastMove = -1; cur.showLine = null; cur.hint = 0; render(); }
  function nextProblem() {
    const ps = byLevel(cur.raw.level); const i = ps.indexOf(cur.raw);
    let next = ps.slice(i + 1).find(p => !(progress[p.id] && progress[p.id].solved)) || ps[i + 1] || nextUnsolved() || ps[0];
    openProblem(next.id);
  }

  function makeSolver() { return new Tsumego.Solver({ maxNodes: 400000 }); }
  /** 현재 위치에서 goal 달성 가능 여부와 상대 최강 응수 */
  function analyzeAfterUserMove() {
    const p = cur.prob, me = p.toPlay, opp = 3 - me;
    const s = makeSolver();
    s.attacker = p.attacker; s.defender = 3 - p.attacker;
    s.targetLocs = p.target.map(toLoc); s.koFavor = p.goal === 'kill' ? s.defender : s.attacker;
    s.cands = p.region.map(toLoc); s.tt = new Map(); s.bestKill = new Map(); s.bestLive = new Map();
    const b = cur.board;
    const maxD = Math.max(4, p.depth + 4 - cur.moves.length);
    const prove = (depth, pla) => { try { return p.goal === 'kill' ? s.kill(b, depth, pla) : s.live(b, depth, pla); } catch (_) { return false; } };
    // 이미 달성?
    if (p.goal === 'kill' ? s.targetCaptured(b) : s.targetAlive(b)) return { ok: true, done: true, solver: s };
    let ok = false, need = -1;
    for (let d = 1; d <= maxD; d++) { s.tt = new Map(); if (prove(d, opp)) { ok = true; need = d; break; } }
    if (!ok) {
      // 반박수: 상대가 두어 목표를 좌절시키는 수 (최강 응수)
      let refute = KB.PASS_LOC;
      const ms = s.moves(b, opp); ms.push(KB.PASS_LOC);
      for (const m of ms) {
        const rec = b.playMoveRecorded(m, opp);
        s.tt = new Map();
        const stillOk = prove(maxD, me);
        b.undo(rec);
        if (!stillOk) { refute = m; break; }
      }
      return { ok: false, refute, solver: s };
    }
    // 상대의 가장 끈질긴 응수: 필요한 깊이가 가장 큰 수
    let bestM = KB.PASS_LOC, bestD = -1;
    const ms = s.moves(b, opp); ms.push(KB.PASS_LOC);
    for (const m of ms) {
      const rec = b.playMoveRecorded(m, opp);
      let nd = need;
      for (let d = 0; d <= need - 1; d++) { s.tt = new Map(); if (prove(d, me)) { nd = d; break; } }
      b.undo(rec);
      if (nd > bestD || (nd === bestD && bestM === KB.PASS_LOC && m !== KB.PASS_LOC)) { bestD = nd; bestM = m; }
    }
    return { ok: true, done: false, need, reply: bestM, replyNeed: bestD, solver: s };
  }

  function userMove(pos) {
    const p = cur.prob, me = p.toPlay, loc = toLoc(pos);
    if (cur.board.colors[loc] !== EMPTY) return;
    if (!cur.board.isLegal(loc, me)) { A.toast('둘 수 없는 자리예요'); return; }
    if (!p.region.includes(pos)) { A.toast('문제와 상관없는 곳이에요. 승부가 나는 곳에 두세요'); return; }
    cur.busy = true;
    cur.board.playMoveAssumeLegal(loc, me); cur.moves.push({ c: me, p: pos }); cur.lastMove = pos; cur.ghost = -1; draw();
    setTimeout(() => {
      const r = analyzeAfterUserMove();
      if (r.done) { finishSolved(p.goal === 'kill' ? '상대 돌을 모두 잡았어요.' : '두 집을 내고 완전히 살았어요.'); return; }
      if (!r.ok) {
        const rf = r.refute;
        if (rf !== KB.PASS_LOC) { cur.board.playMoveAssumeLegal(rf, 3 - me); cur.moves.push({ c: 3 - me, p: toPos(rf) }); cur.lastMove = toPos(rf); cur.refute = toPos(rf); }
        cur.state = 'wrong';
        cur.msg = rf === KB.PASS_LOC ? (p.goal === 'kill' ? '이 수로는 잡을 수 없어요. 상대는 그냥 손을 빼도 살아요.' : '이 수로는 살 수 없어요.') : (p.goal === 'kill' ? `상대가 ${Go.coordLabel(toPos(rf), SIZE)}에 두면 살아요.` : `상대가 ${Go.coordLabel(toPos(rf), SIZE)}에 두면 잡혀요.`);
        mark(false); cur.busy = false; draw(); renderPanel(); return;
      }
      // 정답 방향. 결판이 났는지(남은 증명이 짧은지) 확인
      const settled = r.reply === KB.PASS_LOC || (p.goal === 'kill' ? r.need <= 3 : r.need <= 2);
      if (settled) { finishSolved(p.goal === 'kill' ? '상대는 더 이상 두 집을 낼 수 없어요.' : '상대가 어디를 두어도 두 집을 낼 수 있어요.'); return; }
      const rp = r.reply;
      if (rp === KB.PASS_LOC) { cur.msg = '상대가 손을 뺐어요. 계속 두세요.'; }
      else { cur.board.playMoveAssumeLegal(rp, 3 - me); cur.moves.push({ c: 3 - me, p: toPos(rp) }); cur.lastMove = toPos(rp); cur.msg = `상대가 ${Go.coordLabel(toPos(rp), SIZE)}에 버텼어요. 계속 두세요.`; }
      cur.busy = false; draw(); renderPanel();
    }, 250);
  }
  function finishSolved(msg) { cur.state = 'solved'; cur.msg = msg; mark(true); cur.busy = false; draw(); renderPanel(); }
  function mark(solved) {
    const st = progress[cur.raw.id] || { solved: 0, failed: 0 };
    if (solved) st.solved = (st.solved || 0) + 1; else st.failed = (st.failed || 0) + 1;
    st.last = new Date().toISOString(); progress[cur.raw.id] = st; saveProgress();
  }
  function showSolution() {
    const p = cur.prob;
    cur.board = cur.startBoard.clone(); cur.moves = []; cur.refute = -1; cur.lastMove = -1;
    const numbers = new Map(); let col = p.toPlay; const txt = [];
    const b = cur.board;
    p.line.forEach((pos, i) => { if (pos < 0) { txt.push(`${i + 1}.손빼기`); col = 3 - col; return; } b.playMoveAssumeLegal(toLoc(pos), col); numbers.set(pos, i + 1); txt.push(`${i + 1}.${A.colorName(col)} ${Go.coordLabel(pos, SIZE)}`); col = 3 - col; });
    for (const [pos] of numbers) if (b.colors[toLoc(pos)] === EMPTY) numbers.delete(pos);
    cur.showLine = numbers; cur.lineText = txt.join('  '); cur.state = 'solution'; cur.hint = 0;
    if (!(progress[cur.raw.id] && progress[cur.raw.id].solved)) mark(false);
    draw(); renderPanel();
  }

  // 테스트용: 현재 위치에서 정답 수 / 오답 수 찾기
  function debugNextGood() {
    if (!cur || cur.state !== 'play') return -1;
    const p = cur.prob, me = p.toPlay, opp = 3 - me;
    const s = makeSolver(); s.attacker = p.attacker; s.defender = 3 - p.attacker; s.targetLocs = p.target.map(toLoc); s.koFavor = p.goal === 'kill' ? s.defender : s.attacker; s.cands = p.region.map(toLoc); s.tt = new Map(); s.bestKill = new Map(); s.bestLive = new Map();
    const maxD = Math.max(4, p.depth + 4 - cur.moves.length);
    for (const m of s.moves(cur.board, me)) {
      const rec = cur.board.playMoveRecorded(m, me);
      let ok = false; try { ok = p.goal === 'kill' ? s.kill(cur.board, maxD, opp) : s.live(cur.board, maxD, opp); } catch (_) { }
      cur.board.undo(rec);
      if (ok) return toPos(m);
    }
    return -1;
  }
  function debugWrong() { if (!cur) return -1; const good = new Set(cur.prob.sols); for (const q of cur.prob.region) if (!good.has(q) && cur.board.colors[toLoc(q)] === EMPTY && cur.board.isLegal(toLoc(q), cur.prob.toPlay)) return q; return -1; }
  window.__tsProbe = debugNextGood; window.__tsProbeWrong = debugWrong;
  window.TsumegoUI = { onShow, onShowPlay, openProblem, getProgress: () => progress, replaceProgress: (p) => { progress = p; A.store.set('tsumego', progress); if (A.screen === 'tsumego') onShow(); } };
})();
