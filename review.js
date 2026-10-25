/* review.js — 게임 리뷰 (KataGo 분석: 정확도, 수 분류, 승률 그래프, 한 수씩 보기, 수순 보기) */
(function () {
  'use strict';
  const A = window.BadukApp;
  const { BLACK, WHITE, PASS } = Go;
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const esc = A.esc, el = A.el;

  const CLS = {
    brilliant: { name: '탁월한 수', sym: '!!', color: '#1baaa0' }, best: { name: '최선의 수', sym: '★', color: '#2f9e44' }, good: { name: '좋은 수', sym: '✓', color: '#5cb85c' }, ok: { name: '무난한 수', sym: '–', color: '#7d8794' },
    book: { name: '정석·포석', sym: '書', color: '#8d6e3f' }, inaccuracy: { name: '부정확', sym: '?!', color: '#e6b422', text: '#2b2300' }, mistake: { name: '실수', sym: '?', color: '#e8833a' }, miss: { name: '놓친 수', sym: '✕', color: '#d9534f' }, blunder: { name: '블런더', sym: '??', color: '#c0392b' },
  };
  const CLS_ORDER = ['brilliant', 'best', 'good', 'ok', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder'];
  const MODES = { quick: { playouts: 16, cpu: 1, name: '빠른 분석' }, deep: { playouts: 64, cpu: 6, name: '정밀 분석' } };
  let mode = A.store.get('reviewMode', 'quick');
  const cache = {};        // id → review (세션: 소유권 포함)
  let current = null;      // { entry, review, idx, pv: null|{kind, moves, depth, evalText}, showOwn }
  let rview = null;        // BoardView
  let run = null;          // 진행 중 분석 {cancelled}

  const badgeHTML = (cls, lg) => `<span class="badge ${cls} ${lg ? 'lg' : ''}">${CLS[cls].sym}</span>`;
  const coord = (p, size) => Go.coordLabel(p, size);

  // ───────── 리뷰 홈 ─────────
  function onShow() {
    $('#review-home').hidden = false; $('#review-progress').hidden = !!run; $('#review-summary').hidden = true;
    if (run) { $('#review-home').hidden = true; return; }
    $$('#review-mode button').forEach(b => b.classList.toggle('active', b.dataset.v === mode));
    const list = $('#review-list'); list.innerHTML = '';
    const entries = A.getArchive();
    if (!entries.length) { list.innerHTML = `<div class="empty"><svg><use href="#i-review"/></svg><div class="t">분석할 대국이 없어요</div><div>대국을 마치고 기보를 저장하면 여기서 리뷰할 수 있어요.</div></div>`; return; }
    for (const e of entries) {
      const r = e.result; const iWon = r && r.winner === e.humanColor;
      const av = e.imported ? A.avatarHTML({ name: (e.names && e.names.white) || '백', color: '#5b6573' }, 'sm') : A.avatarHTML(A.botByLevel(e.bot.level), 'sm');
      const title = e.imported ? `${esc(e.names.black)} vs ${esc(e.names.white)}` : `${esc(e.bot.name)} ${esc(e.bot.rank)}`;
      const reviewed = e.review ? `<span class="chip accent">${e.review.summary ? Math.round(e.review.summary[e.humanColor === BLACK ? 'black' : 'white'].accuracy) + '%' : '분석됨'}</span>` : `<span class="chip">${r ? (iWon ? '승' : r.winner === 0 ? '빅' : '패') : ''}</span>`;
      const row = el(`<button class="list-row">${av}<div class="grow"><div class="primary-text">${title} · ${e.size}줄</div><div class="secondary-text">${A.fmtDate(e.date)} · ${e.moves.length}수${r ? ' · ' + esc(r.text) : ''}${e.review ? ' · ' + esc(MODES[e.review.mode] ? MODES[e.review.mode].name : '') : ''}</div></div>${reviewed}<svg class="chev"><use href="#i-chev"/></svg></button>`);
      row.onclick = () => open(e.id);
      list.appendChild(row);
    }
  }
  $$('#review-mode button').forEach(b => b.onclick = () => { mode = b.dataset.v; A.store.set('reviewMode', mode); onShow(); });

  async function open(id) {
    const entry = A.findEntry(id); if (!entry) { A.toast('기보를 찾을 수 없어요'); return; }
    A.showScreen('review');
    if (entry.review && (cache[id] || entry.review.positions)) { if (!cache[id]) cache[id] = entry.review; showSummary(entry); return; }
    if (run) { A.toast('다른 대국을 분석하는 중이에요'); return; }
    await analyze(entry);
  }

  // ───────── 분석 ─────────
  async function analyze(entry) {
    const home = $('#review-home'), prog = $('#review-progress');
    home.hidden = true; prog.hidden = false; $('#review-summary').hidden = true;
    const bot = entry.imported ? null : A.botByLevel(entry.bot.level);
    $('#rp-avatar').outerHTML = (bot ? A.avatarHTML(bot, 'lg') : A.avatarHTML(null, 'lg')).replace('class="avatar', 'id="rp-avatar" style="margin:0 auto" class="avatar');
    $('#rp-title').textContent = `${MODES[mode].name} 준비 중`; $('#rp-sub').textContent = 'AI 엔진을 켜는 중…'; $('#rp-bar').style.width = '0%';
    run = { cancelled: false };
    $('#rp-cancel').onclick = () => { run.cancelled = true; A.kata.cancel(); };
    try {
      await A.ensureKata();
    } catch (err) { run = null; prog.hidden = true; home.hidden = false; A.toast('AI 신경망을 쓸 수 없어 리뷰를 할 수 없어요'); return; }
    const cpu = A.kata.backend === 'cpu-worker';
    const playouts = cpu ? MODES[mode].cpu : MODES[mode].playouts;
    const n = entry.moves.length, positions = [];
    const t0 = Date.now();
    for (let k = 0; k <= n; k++) {
      if (run.cancelled) break;
      const spec = { size: entry.size, komi: entry.komi, moves: entry.moves.slice(0, k), setup: entry.setup };
      let res;
      try { res = await A.kata.analyze(spec, { playouts }); }
      catch (err) { if (run.cancelled) break; console.warn(err); A.toast('분석 중 오류가 났어요'); break; }
      if (run.cancelled) break;
      positions.push(convertResult(res, entry.size));
      const elapsed = Date.now() - t0, per = elapsed / (k + 1), remain = Math.round(per * (n - k) / 1000);
      $('#rp-title').textContent = `${MODES[mode].name} 중 · ${k} / ${n}수`;
      $('#rp-sub').textContent = `${cpu ? 'CPU 모드 · ' : ''}남은 시간 약 ${remain >= 60 ? Math.ceil(remain / 60) + '분' : remain + '초'}`;
      $('#rp-bar').style.width = Math.round((k + 1) / (n + 1) * 100) + '%';
    }
    const done = positions.length === n + 1;
    run = null; prog.hidden = true;
    if (!done) { home.hidden = false; onShow(); A.toast('분석을 취소했어요'); return; }
    const review = buildReview(entry, positions, { mode, playouts, backend: A.kata.backend });
    cache[entry.id] = review;
    A.updateEntry(entry.id, { review: stripForStorage(review) });
    showSummary(entry);
  }

  function convertResult(res, size) {
    const sign = res.toPlay === BLACK ? 1 : -1;
    const wrB = x => x == null ? null : (sign > 0 ? x : 1 - x);
    const leadB = x => x == null ? null : sign * x;
    const top = res.moves.slice(0, 6).map(m => ({ p: m.p, visits: m.visits, prior: +m.prior.toFixed(4), wr: wrB(m.winrate), lead: leadB(m.lead) == null ? null : +leadB(m.lead).toFixed(2), pv: m.pv }));
    let own = null;
    if (res.ownership) { own = new Int8Array(size * size); for (let i = 0; i < own.length; i++) own[i] = Math.round(Math.max(-1, Math.min(1, res.ownership[i])) * 100); }
    return { wr: +wrB(res.winrate).toFixed(4), lead: +leadB(res.lead).toFixed(2), toPlay: res.toPlay, top, own, playouts: res.playouts };
  }

  function buildReview(entry, positions, meta) {
    const size = entry.size, n = entry.moves.length;
    const openingMoves = size >= 19 ? 16 : size >= 13 ? 10 : 6;
    const moves = [];
    const acc = { [BLACK]: [], [WHITE]: [] }, counts = { [BLACK]: {}, [WHITE]: {} };
    for (let i = 1; i <= n; i++) {
      const m = entry.moves[i - 1], c = m.c, p = m.p;
      const before = positions[i - 1], after = positions[i];
      const sign = c === BLACK ? 1 : -1;
      const wrB = sign > 0 ? before.wr : 1 - before.wr, wrA = sign > 0 ? after.wr : 1 - after.wr;
      const leadB = sign * before.lead, leadA = sign * after.lead;
      const loss = Math.max(0, leadB - leadA), wrLoss = Math.max(0, wrB - wrA);
      const top = before.top;
      const best = top.length ? top[0] : null;
      const rank = top.findIndex(t => t.p === p);
      const prior = rank >= 0 ? top[rank].prior : 0;
      const isBest = best && best.p === p;
      const opening = i <= openingMoves;
      let cls;
      if (p === PASS) cls = loss <= 1 ? 'ok' : loss <= 5 ? 'inaccuracy' : 'mistake';
      else if (isBest || loss <= 0.25) {
        const second = top.length > 1 && top[1].lead != null && best.lead != null ? Math.abs((sign * best.lead) - (sign * top[1].lead)) : 0;
        cls = (opening && rank >= 0 && rank <= 2) ? 'book' : (isBest && prior < 0.1 && second >= 2 && wrB > 0.1 && wrB < 0.9) ? 'brilliant' : 'best';
      }
      else if (loss <= 1.0) cls = (opening && rank >= 0 && rank <= 2) ? 'book' : 'good';
      else if (loss <= 2.5) cls = 'ok';
      else if (loss <= 5) cls = 'inaccuracy';
      else if (loss <= 10) cls = 'mistake';
      else cls = 'blunder';
      const missed = wrB >= 0.65 && wrA < 0.5 && loss >= 3;
      if (cls === 'inaccuracy' || cls === 'mistake') { if (missed) cls = 'miss'; }
      if (wrLoss >= 0.3 && cls !== 'blunder') cls = 'blunder';
      else if (wrLoss >= 0.15 && ['ok', 'inaccuracy', 'good', 'best', 'book'].includes(cls)) cls = 'mistake';
      const lossPct = Math.max(wrLoss * 100, loss * 2);
      const accMove = Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * lossPct) - 3.1669));
      acc[c].push(accMove); counts[c][cls] = (counts[c][cls] || 0) + 1;
      moves.push({ c, p, cls, loss: +loss.toFixed(2), wrLoss: +wrLoss.toFixed(4), best: best ? best.p : null, rank, prior, wrB: +wrB.toFixed(4), wrA: +wrA.toFixed(4), leadB: +leadB.toFixed(2), leadA: +leadA.toFixed(2) });
    }
    const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
    const summary = { black: { accuracy: mean(acc[BLACK]), counts: counts[BLACK] }, white: { accuracy: mean(acc[WHITE]), counts: counts[WHITE] } };
    return Object.assign({ date: new Date().toISOString(), size, positions, moves, summary }, meta);
  }
  function stripForStorage(review) {
    return Object.assign({}, review, { positions: review.positions.map(p => Object.assign({}, p, { own: null })) });
  }

  // ───────── 요약 화면 ─────────
  function showSummary(entry) {
    const review = cache[entry.id] || entry.review;
    $('#review-home').hidden = true; $('#review-progress').hidden = true;
    const box = $('#review-summary'); box.hidden = false;
    const bot = entry.imported ? null : A.botByLevel(entry.bot.level);
    const nameOf = c => entry.imported ? (c === BLACK ? entry.names.black : entry.names.white) : (c === entry.humanColor ? '나' : `${bot.name} ${bot.rank}`);
    const r = entry.result;
    const score = !r ? '' : r.winner === BLACK ? '1 – 0' : r.winner === WHITE ? '0 – 1' : '½ – ½';
    const s = review.summary;
    const rows = CLS_ORDER.map(k => { const b = s.black.counts[k] || 0, w = s.white.counts[k] || 0; return `<div class="cnt l ${b ? '' : 'zero'}">${b}</div><div class="mid">${badgeHTML(k)}<span>${CLS[k].name}</span></div><div class="cnt r ${w ? '' : 'zero'}">${w}</div>`; }).join('');
    const worst = review.moves.map((m, i) => ({ m, i })).filter(x => ['blunder', 'miss', 'mistake'].includes(x.m.cls)).sort((a, b) => b.m.loss - a.m.loss).slice(0, 3);
    box.innerHTML = `
      <div class="card" style="display:flex;flex-direction:column;gap:16px">
        <div class="section-head"><h2 style="display:flex;align-items:center;gap:8px"><svg style="width:22px;height:22px;color:var(--accent)"><use href="#i-review"/></svg>게임 리뷰</h2><span class="chip">${esc(MODES[review.mode] ? MODES[review.mode].name : '')} · ${review.playouts}읽기/수</span></div>
        <div class="acc-row">
          <div class="acc-card b"><div class="who">${esc(nameOf(BLACK))}</div><div class="num-big">${s.black.accuracy.toFixed(1)}</div><div class="lbl">정확도</div></div>
          <div class="acc-mid">${score}<div class="small muted" style="font-weight:500">${r ? esc(r.text) : ''}</div></div>
          <div class="acc-card w"><div class="who">${esc(nameOf(WHITE))}</div><div class="num-big">${s.white.accuracy.toFixed(1)}</div><div class="lbl">정확도</div></div>
        </div>
        <div class="cls-table">${rows}</div>
      </div>
      <div class="card" style="margin-top:18px;display:flex;flex-direction:column;gap:10px">
        <div class="card-title" style="margin:0">승률 흐름 (흑 기준)</div>
        <svg class="wr-graph" id="sum-graph" viewBox="0 0 600 120" preserveAspectRatio="none"></svg>
        <p class="hint">그래프를 누르면 그 수로 이동해요. 점은 실수·블런더 자리예요.</p>
      </div>
      ${worst.length ? `<div class="card" style="margin-top:18px"><div class="card-title">가장 아팠던 수</div><div class="cands">${worst.map(x => `<button class="cand" data-i="${x.i + 1}"><span class="mv">${x.i + 1}수</span>${badgeHTML(x.m.cls)}<span>${A.colorName(x.m.c)} ${coord(x.m.p, entry.size)}</span><span class="grow"></span><span class="stat">−${x.m.loss.toFixed(1)}집</span></button>`).join('')}</div></div>` : ''}
      <div class="btn-row" style="margin-top:18px"><button class="btn secondary" id="sum-back">다른 대국</button><button class="btn primary lg" id="sum-moves"><svg><use href="#i-next"/></svg>한 수씩 보기</button></div>
      <button class="btn ghost block" id="sum-redo" style="margin-top:6px">다시 분석 (${esc(MODES[mode].name)})</button>`;
    drawGraph($('#sum-graph'), review, -1, i => showMoves(entry, i));
    $('#sum-moves').onclick = () => showMoves(entry, 1);
    $('#sum-back').onclick = () => onShow();
    $('#sum-redo').onclick = async () => { const ok = await A.confirmSheet('다시 분석', `${MODES[mode].name}으로 처음부터 다시 분석할까요?`, '분석'); if (!ok) return; delete cache[entry.id]; A.updateEntry(entry.id, { review: null }); analyze(entry); };
    $$('#review-summary .cand').forEach(b => b.onclick = () => showMoves(entry, +b.dataset.i));
  }

  // ───────── 승률 그래프 ─────────
  function drawGraph(svg, review, idx, onPick) {
    const n = review.positions.length - 1, W = 600, H = 120;
    const x = i => n ? (i / n) * W : 0, y = wr => H - wr * H;
    let d = `M0,${y(review.positions[0].wr)}`;
    for (let i = 1; i <= n; i++) d += ` L${x(i).toFixed(1)},${y(review.positions[i].wr).toFixed(1)}`;
    const area = d + ` L${W},${H} L0,${H} Z`;
    const dots = review.moves.map((m, i) => ['blunder', 'miss', 'mistake', 'inaccuracy'].includes(m.cls) ? `<circle cx="${x(i + 1).toFixed(1)}" cy="${y(review.positions[i + 1].wr).toFixed(1)}" r="${m.cls === 'inaccuracy' ? 3 : 4.5}" fill="${m.cls === 'blunder' ? '#c0392b' : m.cls === 'miss' ? '#d9534f' : m.cls === 'mistake' ? '#e8833a' : '#e6b422'}" stroke="#fff" stroke-width="1.2"/>` : '').join('');
    svg.innerHTML = `<rect x="0" y="0" width="${W}" height="${H}" fill="#f1f1ee"/><path d="${area}" fill="#1b1d21"/><path d="${d}" fill="none" stroke="#6b7280" stroke-width="1.2"/><line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" stroke="#9aa3ad" stroke-width="0.8" stroke-dasharray="4 4"/>${dots}${idx >= 0 ? `<line x1="${x(idx).toFixed(1)}" y1="0" x2="${x(idx).toFixed(1)}" y2="${H}" stroke="var(--accent)" stroke-width="2"/>` : ''}`;
    const pick = e => { const r = svg.getBoundingClientRect(); const cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left; const i = Math.round(Math.max(0, Math.min(1, cx / r.width)) * n); onPick(i); };
    svg.onclick = pick;
    svg.onpointerdown = e => { if (e.pointerType !== 'mouse') return; let moving = true; const mv = ev => { if (moving) pick(ev); }; const up = () => { moving = false; window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); }; window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); };
  }

  // ───────── 한 수씩 보기 ─────────
  function ensureView(size) {
    if (!rview) {
      rview = new BoardView($('#review-wrap'), { size, theme: A.settings.theme, stoneStyle: A.settings.stone, coords: A.settings.coords });
      rview.on('press', (e) => { if (!current) return; if (current.pv) { const pv = current.pv; if (pv.depth < pv.moves.length) pvGo(pv.depth + 1); else extendPV(1, true); return; } const p = rview.pointFromClient(e.clientX, e.clientY, 0); onBoardTap(p); });
    }
    rview.setTheme(A.settings.theme); rview.setStoneStyle(A.settings.stone); rview.setCoords(A.settings.coords);
    rview.setSize(size);
    return rview;
  }
  function onShowMoves() { if (rview) rview.resize(); }

  function showMoves(entry, idx) {
    const review = cache[entry.id] || entry.review;
    const positions = [];
    const b = Go.Board.fromMoves(entry.size, [], entry.setup);
    positions.push(new Uint8Array(b.stones));
    for (const m of entry.moves) { try { b.play(m.p, m.c); } catch (_) { } positions.push(new Uint8Array(b.stones)); }
    current = { entry, review, boards: positions, idx: Math.max(0, Math.min(entry.moves.length, idx)), pv: null, showOwn: A.store.get('reviewOwn', false), evalCache: {} };
    A.showScreen('review-moves');
    ensureView(entry.size);
    $('#rv-range').max = entry.moves.length;
    renderMoves();
  }

  function onBoardTap(p) {
    if (!current || p < 0) return;
    // 후보수 라벨을 누르면 그 수순 보기
    const cands = candidatesAt(current.idx);
    const c = cands.find(x => x.p === p);
    if (c) { startPV(c, cands.indexOf(c)); }
  }

  function candidatesAt(idx) {
    // idx수가 놓이기 전 위치(idx-1)의 후보들. idx=0이면 첫 위치의 후보
    const pos = current.review.positions[idx > 0 ? idx - 1 : 0];
    return pos.top.filter(t => t.p >= 0).slice(0, 3);
  }

  function renderMoves() {
    const cur = current, { entry, review } = cur, size = entry.size, idx = cur.idx;
    const stones = cur.boards[idx];
    const marks = [];
    let numbers = null, ghostStones = null;
    const m = idx > 0 ? review.moves[idx - 1] : null;
    const mover = m ? m.c : (entry.setup && entry.setup.black.length ? WHITE : BLACK);
    let dispStones = stones;
    if (cur.pv) {
      // 수순 표시: 기준 위치(idx-1 또는 idx) 위에 번호 돌
      const base = cur.boards[cur.pv.baseIdx];
      dispStones = new Uint8Array(base);
      const tmp = Go.Board.fromMoves(size, [], null); tmp.stones.set(base);
      let col = cur.pv.firstColor;
      numbers = new Map();
      const depth = Math.min(cur.pv.depth, cur.pv.moves.length);
      for (let i = 0; i < depth; i++) {
        const p = cur.pv.moves[i];
        if (p < 0) { col = 3 - col; continue; }
        try { tmp.play(p, col); } catch (_) { break; }
        numbers.set(p, i + 1); col = 3 - col;
      }
      dispStones = tmp.stones;
      // 가린 돌 제거: 번호는 현재 살아있는 돌에만
      for (const [p] of numbers) if (dispStones[p] === 0) numbers.delete(p);
    } else {
      if (m && m.p >= 0 && stones[m.p] === m.c) marks.push({ type: 'badge', p: m.p, text: CLS[m.cls].sym, color: CLS[m.cls].color, textColor: CLS[m.cls].text || '#fff' });
      const cands = candidatesAt(idx);
      cands.forEach((c, i) => { if (!(m && c.p === m.p) && stones[c.p] === 0) marks.push({ type: 'label', p: c.p, text: 'ABC'[i], color: i === 0 ? '#1baaa0' : '#7d8794' }); });
    }
    const pos = review.positions[cur.pv ? cur.pv.baseIdx : idx];
    const own = cur.showOwn && pos && pos.own ? ownerArray(pos.own) : null;
    rview.setState({ stones: dispStones, lastMove: cur.pv ? -1 : (m ? m.p : -1), ghost: null, dead: null, owner: own, marks, numbers, dimAll: false });
    $('#rv-range').value = idx;
    // 플레이어 바
    const bot = entry.imported ? null : A.botByLevel(entry.bot.level);
    const nameOf = c => entry.imported ? (c === BLACK ? entry.names.black : entry.names.white) : (c === entry.humanColor ? '나' : `${bot.name} ${bot.rank}`);
    const accOf = c => review.summary[c === BLACK ? 'black' : 'white'].accuracy.toFixed(1);
    const bar = (c, id) => `<div class="player-bar" id="${id}">${c === entry.humanColor && !entry.imported ? A.avatarHTML(null) : A.avatarHTML(bot || { name: nameOf(c), color: '#5b6573' })}<div class="pinfo"><div class="pname"><span class="stone-dot ${c === BLACK ? 'b' : 'w'}"></span>${esc(nameOf(c))}</div><div class="pmeta"><span>정확도 <b class="num">${accOf(c)}</b></span></div></div><div class="num" style="font-weight:700;font-size:15px">${Math.round((c === BLACK ? pos.wr : 1 - pos.wr) * 100)}%</div></div>`;
    const topColor = entry.imported ? WHITE : 3 - entry.humanColor;
    $('#rv-top').outerHTML = bar(topColor, 'rv-top'); $('#rv-bottom').outerHTML = bar(3 - topColor, 'rv-bottom');
    drawGraph($('#rv-graph'), review, idx, i => { cur.pv = null; cur.idx = i; renderMoves(); });
    renderMoveCard();
  }

  function ownerArray(own) { const o = new Int8Array(own.length); for (let i = 0; i < own.length; i++) o[i] = own[i] > 35 ? BLACK : own[i] < -35 ? WHITE : 0; return o; }

  function renderMoveCard() {
    const cur = current, { entry, review } = cur, size = entry.size, idx = cur.idx;
    const card = $('#rv-card');
    const m = idx > 0 ? review.moves[idx - 1] : null;
    const pos = review.positions[idx];
    const leadTxt = l => l > 0 ? `흑 +${l.toFixed(1)}` : l < 0 ? `백 +${(-l).toFixed(1)}` : '호각';
    let html = '';
    if (cur.pv) {
      const pv = cur.pv;
      const depth = Math.min(pv.depth, pv.moves.length);
      const n = pv.moves.length, maxLen = 24;
      const colAt = i => (i % 2 === 0) ? pv.firstColor : 3 - pv.firstColor;
      const ev = pv.evals[depth];
      const cur1 = depth > 0 ? `${depth}. ${A.colorName(colAt(depth - 1))} ${coord(pv.moves[depth - 1], size)}` : '수순 시작 전';
      html += `<div class="review-move-head"><span class="chip accent">${esc(pv.title)}</span><span class="s">${depth} / ${n}수</span></div>`;
      html += `<div style="font-weight:700;font-size:16px">${esc(cur1)}</div>`;
      html += `<div class="small" style="min-height:20px">${ev ? `이 수까지 가면: <b>${esc(Math.abs(ev.lead) < 0.05 ? '호각' : leadTxt(ev.lead) + '집')}</b> · 흑 승률 <b>${Math.round(ev.wr * 100)}%</b>` : (pv.evalBusy ? '<span class="muted">형세 계산 중…</span>' : '')}</div>`;
      html += `<div class="nav-row">
        <button class="btn secondary" id="pv-first" aria-label="처음" ${depth <= 1 ? 'disabled' : ''}><svg><use href="#i-first"/></svg></button>
        <button class="btn secondary" id="pv-prev" aria-label="이전" ${depth <= 1 ? 'disabled' : ''}><svg><use href="#i-prev"/></svg></button>
        <button class="btn primary" id="pv-next" aria-label="다음" ${(depth >= n && (n >= maxLen || pv.extending)) ? 'disabled' : ''}><svg><use href="#i-next"/></svg></button>
        <button class="btn secondary" id="pv-last" aria-label="끝" ${depth >= n ? 'disabled' : ''}><svg><use href="#i-last"/></svg></button>
      </div>`;
      html += `<div class="hint">${pv.extending ? 'AI가 다음 수를 읽는 중…' : depth >= n ? (n >= maxLen ? '최대 24수까지 볼 수 있어요.' : '▶를 누르면 AI가 이어서 읽어요.') : '판을 눌러도 다음 수로 넘어가요.'}</div>`;
      html += `<div class="btn-row"><button class="btn secondary" id="pv-close">수순 닫기</button></div>`;
      card.innerHTML = html;
      $('#pv-first').onclick = () => pvGo(1);
      $('#pv-prev').onclick = () => pvGo(depth - 1);
      $('#pv-next').onclick = () => { if (depth < n) pvGo(depth + 1); else extendPV(1, true); };
      $('#pv-last').onclick = () => pvGo(n);
      $('#pv-close').onclick = () => { cur.pv = null; renderMoves(); };
      if (!ev && !pv.evalBusy) evalPV(pv, depth);
      return;
    }
    if (!m) {
      html += `<div class="review-move-head"><span class="t">시작 위치</span><span class="s">${leadTxt(pos.lead)} · 흑 승률 ${Math.round(pos.wr * 100)}%</span></div>`;
    } else {
      const cls = CLS[m.cls];
      const bestTxt = m.best == null ? '' : (m.best === m.p ? '' : `AI 추천: <b>${coord(m.best, size)}</b>`);
      html += `<div class="review-move-head">${badgeHTML(m.cls, true)}<div><div class="t">${idx}수 · ${A.colorName(m.c)} ${coord(m.p, size)} — ${cls.name}</div><div class="s">${m.loss > 0.05 ? `−${m.loss.toFixed(1)}집` : '손해 없음'} · 승률 ${(m.wrB * 100).toFixed(0)}% → ${(m.wrA * 100).toFixed(0)}% · ${leadTxt(pos.lead)}</div></div></div>`;
      if (bestTxt) html += `<div class="small">${bestTxt}</div>`;
    }
    const cands = candidatesAt(idx);
    if (cands.length) {
      html += `<div class="cands">${cands.map((c, i) => `<button class="cand ${m && c.p === m.p ? 'active' : ''}" data-i="${i}"><span class="lab">${'ABC'[i]}</span><span class="mv">${coord(c.p, size)}</span><span class="stat">${c.wr != null ? `${Math.round((m ? (m.c === BLACK ? c.wr : 1 - c.wr) : c.wr) * 100)}%` : ''}${c.lead != null ? ` · ${leadTxt(c.lead)}` : ''}${c.visits ? ` · ${c.visits}회 읽음` : ` · 감각 ${Math.round(c.prior * 100)}%`}</span><span class="grow"></span>${m && c.p === m.p ? '<span class="chip">둔 수</span>' : ''}<svg class="chev"><use href="#i-chev"/></svg></button>`).join('')}</div>`;
      html += `<div class="hint">후보를 누르면 AI가 내다본 수순을 판 위에서 볼 수 있어요.</div>`;
    }
    if (m && m.p >= 0) html += `<button class="btn secondary block" id="rv-played-pv">실제 둔 수 이후 예상 수순</button>`;
    html += `<div class="switch-row" style="border-top:1px solid var(--line);margin-top:4px"><div><div class="label">영역 표시</div><div class="desc">AI가 예상한 집</div></div><button class="switch" role="switch" aria-checked="${cur.showOwn}" id="rv-own" ${pos.own ? '' : 'disabled'}></button></div>`;
    card.innerHTML = html;
    $$('#rv-card .cand').forEach(b => b.onclick = () => startPV(cands[+b.dataset.i], +b.dataset.i));
    const pp = $('#rv-played-pv'); if (pp) pp.onclick = () => startPlayedPV();
    const sw = $('#rv-own'); if (sw) sw.onclick = () => { cur.showOwn = !cur.showOwn; A.store.set('reviewOwn', cur.showOwn); renderMoves(); };
  }

  function startPV(cand, i) {
    const cur = current, idx = cur.idx, size = cur.entry.size;
    const baseIdx = idx > 0 ? idx - 1 : 0;
    const firstColor = idx > 0 ? cur.review.moves[idx - 1].c : cur.review.positions[0].toPlay;
    const moves = (cand.pv && cand.pv.length ? cand.pv : [cand.p]).slice();
    const leadTxt = l => l > 0 ? `흑 +${l.toFixed(1)}집` : l < 0 ? `백 +${(-l).toFixed(1)}집` : '호각';
    const evalText = cand.wr != null ? `${leadTxt(cand.lead)} · 흑 승률 ${Math.round(cand.wr * 100)}%` : null;
    cur.pv = { kind: 'cand', title: `${'ABC'[i]} ${coord(cand.p, size)} 수순`, baseIdx, firstColor, moves, depth: 1, evals: {}, cand };
    renderMoves();
  }
  function startPlayedPV() {
    const cur = current, idx = cur.idx, size = cur.entry.size;
    const m = cur.review.moves[idx - 1];
    const after = cur.review.positions[idx];
    const reply = after.top.length ? after.top[0] : null;
    const moves = [m.p].concat(reply ? (reply.pv && reply.pv.length ? reply.pv : [reply.p]) : []);
    const leadTxt = l => l > 0 ? `흑 +${l.toFixed(1)}집` : l < 0 ? `백 +${(-l).toFixed(1)}집` : '호각';
    cur.pv = { kind: 'played', title: `실제 둔 수 ${coord(m.p, size)} 이후`, baseIdx: idx - 1, firstColor: m.c, moves, depth: 1, evals: { 1: { wr: after.wr, lead: after.lead } } };
    renderMoves();
  }
  function pvSeq(pv, depth) {
    const entry = current.entry, seq = entry.moves.slice(0, pv.baseIdx);
    let col = pv.firstColor;
    for (let i = 0; i < depth; i++) { seq.push({ c: col, p: pv.moves[i] }); col = 3 - col; }
    return { size: entry.size, komi: entry.komi, moves: seq, setup: entry.setup };
  }
  function pvGo(d) { const pv = current && current.pv; if (!pv) return; pv.depth = Math.max(1, Math.min(pv.moves.length, d)); renderMoves(); }
  /** depth수까지 둔 위치의 형세 (흑 기준). 신경망 한 번 평가라 빠름 */
  async function evalPV(pv, depth) {
    pv.evalBusy = true;
    try {
      const r = await A.kata.evaluate(pvSeq(pv, depth));
      const toPlay = (depth % 2 === 0) ? pv.firstColor : 3 - pv.firstColor;
      pv.evals[depth] = toPlay === BLACK ? { wr: r.winrate, lead: r.lead } : { wr: 1 - r.winrate, lead: -r.lead };
    } catch (_) { }
    pv.evalBusy = false;
    if (current && current.pv === pv && pv.depth === depth) renderMoveCard();
    else if (current && current.pv === pv && !pv.evals[pv.depth]) evalPV(pv, pv.depth);
  }
  /** 수순 끝에서 AI가 짧게 수읽기해서 다음 수를 덧붙임 */
  async function extendPV(steps, advance) {
    const cur = current, pv = cur.pv; if (!pv || pv.extending) return;
    pv.extending = true; renderMoveCard();
    try {
      const gpu = A.kata.backend === 'webgl';
      for (let k = 0; k < (steps || 1) && pv.moves.length < 24; k++) {
        const depth = pv.moves.length;
        const res = await A.kata.analyze(pvSeq(pv, depth), { playouts: gpu ? 24 : 6 });
        if (cur.pv !== pv) return;
        const toPlay = res.toPlay;
        pv.evals[depth] = toPlay === BLACK ? { wr: res.winrate, lead: res.lead } : { wr: 1 - res.winrate, lead: -res.lead };
        const best = res.moves[0];
        if (!best || best.p < 0) { A.toast('여기서 더 둘 곳이 없어요 (패스)'); break; }
        pv.moves.push(best.p);
      }
      if (advance) pv.depth = pv.moves.length;
    } catch (err) { A.toast('수순을 더 읽지 못했어요'); }
    pv.extending = false;
    if (cur.pv === pv) renderMoves();
  }

  const go = i => { if (!current) return; current.pv = null; current.idx = Math.max(0, Math.min(current.entry.moves.length, i)); renderMoves(); };
  $('#rv-first').onclick = () => go(0); $('#rv-prev').onclick = () => go(current.idx - 1); $('#rv-next').onclick = () => go(current.idx + 1); $('#rv-last').onclick = () => go(1e9);
  $('#rv-range').addEventListener('input', e => go(+e.target.value));
  document.addEventListener('keydown', e => {
    if (A.screen !== 'review-moves' || !current) return;
    if (current.pv) { const pv = current.pv; if (e.key === 'ArrowLeft') { pvGo(pv.depth - 1); e.preventDefault(); } else if (e.key === 'ArrowRight') { if (pv.depth < pv.moves.length) pvGo(pv.depth + 1); else extendPV(1, true); e.preventDefault(); } return; }
    if (e.key === 'ArrowLeft') { go(current.idx - 1); e.preventDefault(); } else if (e.key === 'ArrowRight') { go(current.idx + 1); e.preventDefault(); }
  });

  window.Review = { onShow, onShowMoves, open, CLS };
})();
