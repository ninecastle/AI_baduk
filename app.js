/* app.js — 바둑랩 앱 (1단계: 봇 대전 · 계가 · 기보함 · 설정) */
(function () {
  'use strict';
  const { BLACK, WHITE, EMPTY, PASS } = Go;
  const RESIGN = -2;
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  // ───────── 봇 ─────────
  const BOTS = [
    { level: 1, name: '매', rank: '6급', desc: '감각으로 두지만 가끔 엉뚱한 수를 둬요.', color: '#8a6fdf' },
    { level: 2, name: '늑대', rank: '2급', desc: '빈틈을 파고드는 공격형.', color: '#6b7a8f' },
    { level: 3, name: '곰', rank: '1급', desc: 'AI의 첫 감각 그대로 두는 두터운 상대.', color: '#8d6a4a' },
    { level: 4, name: '표범', rank: '2단', desc: '몇 수 앞을 읽고 둬요. 곰보다 확실히 강해요.', color: '#d4a03a' },
    { level: 5, name: '호랑이', rank: '3단', desc: '실수를 놓치지 않아요.', color: '#e0563f' },
    { level: 6, name: '독수리', rank: '4단', desc: '넓게 보고 깊게 읽어요.', color: '#3f8fd4' },
    { level: 7, name: '용', rank: '5단', desc: '한 수에 몇 초씩 생각하는 강자.', color: '#2fa37a' },
    { level: 8, name: '현무', rank: '6단+', desc: '가장 깊게 읽는 봇. 한 수에 10초까지 걸려요.', color: '#2e7a9a' },
  ];
  const botByLevel = lv => BOTS.find(b => b.level === lv) || BOTS[2];

  // ───────── 저장소 ─────────
  const store = {
    get(k, d) { try { const v = localStorage.getItem('badukrab:' + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem('badukrab:' + k, JSON.stringify(v)); } catch (_) { } },
    del(k) { try { localStorage.removeItem('badukrab:' + k); } catch (_) { } },
  };
  const DEFAULT_SETTINGS = { theme: 'oak', stone: 'shell', coords: false, confirm: 'auto', sound: true, eval: false, size: 19, color: BLACK, handicap: 0, komi: 6.5, bot: 3 };
  const settings = Object.assign({}, DEFAULT_SETTINGS, store.get('settings', {}));
  const saveSettings = () => { store.set('settings', settings); if (window.Sync) window.Sync.push('settings'); };
  let archive = store.get('archive', []);
  const saveArchive = () => { store.set('archive', archive); if (window.Sync) window.Sync.push('archive'); };

  // ───────── 유틸 ─────────
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const fmtDate = iso => { const d = new Date(iso); return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const colorName = c => c === BLACK ? '흑' : '백';
  function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
  function esc(s) { return String(s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m])); }
  let avatarSeq = 0;
  function avatarHTML(bot, cls) {
    if (!bot) return `<div class="avatar me ${cls || ''}">나</div>`;
    const c = bot.color;
    if (window.BOT_ART && window.BOT_ART[bot.level]) { const uid = 'ag' + bot.level + '_' + (++avatarSeq); return `<div class="avatar art ${cls || ''}">${window.BOT_ART[bot.level].split('ag' + bot.level).join(uid)}</div>`; }
    return `<div class="avatar ${cls || ''}" style="background:linear-gradient(140deg,${c},${shade(c, -0.35)})">${esc(bot.name[0])}</div>`;
  }
  function shade(hex, k) {
    const h = hex.replace('#', ''); let r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    const f = v => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
    return `rgb(${f(r)},${f(g)},${f(b)})`;
  }

  // 토스트 / 시트
  let toastTimer = null;
  function toast(msg, ms) {
    const root = $('#toast-root'); root.innerHTML = '';
    const t = el(`<div class="toast">${esc(msg)}</div>`); root.appendChild(t);
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.remove(); }, ms || 2200);
  }
  function openSheet(html, opts) {
    closeSheet();
    const root = $('#sheet-root');
    const back = el(`<div class="sheet-backdrop"><div class="sheet" role="dialog"><div class="grab"></div>${html}</div></div>`);
    back.addEventListener('click', e => { if (e.target === back && !(opts && opts.sticky)) closeSheet(); });
    root.appendChild(back);
    return back.querySelector('.sheet');
  }
  function closeSheet() { $('#sheet-root').innerHTML = ''; }
  function confirmSheet(title, body, okText, okClass) {
    return new Promise(res => {
      const s = openSheet(`<h2>${esc(title)}</h2><div class="body">${esc(body)}</div><div class="btn-row"><button class="btn secondary" data-a="no">취소</button><button class="btn ${okClass || 'primary'}" data-a="ok">${esc(okText || '확인')}</button></div>`);
      s.querySelector('[data-a=no]').onclick = () => { closeSheet(); res(false); };
      s.querySelector('[data-a=ok]').onclick = () => { closeSheet(); res(true); };
    });
  }

  // ───────── 소리 ─────────
  let audio = null;
  function ensureAudio() { if (!audio) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { } } if (audio && audio.state === 'suspended') audio.resume().catch(() => { }); }
  function playStoneSound(capture) {
    if (!settings.sound) return; ensureAudio(); if (!audio) return;
    const t = audio.currentTime;
    const click = (at, f, gain) => {
      const o = audio.createOscillator(), g = audio.createGain(), bp = audio.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 1.2;
      o.type = 'triangle'; o.frequency.setValueAtTime(f, at); o.frequency.exponentialRampToValueAtTime(f * 0.5, at + 0.06);
      g.gain.setValueAtTime(gain, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.09);
      o.connect(bp); bp.connect(g); g.connect(audio.destination); o.start(at); o.stop(at + 0.1);
      const buf = audio.createBuffer(1, audio.sampleRate * 0.03, audio.sampleRate); const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
      const n = audio.createBufferSource(); n.buffer = buf; const ng = audio.createGain(); ng.gain.value = gain * 0.6; n.connect(ng); ng.connect(audio.destination); n.start(at);
    };
    click(t, 900, 0.25);
    if (capture) click(t + 0.08, 1300, 0.18);
  }

  // ───────── 엔진 (웹워커) ─────────
  let worker = null, pending = null, reqId = 0;
  function ensureWorker() {
    if (worker) return;
    worker = new Worker('engine.worker.js');
    worker.onmessage = e => { const d = e.data; if (pending && pending.id === d.id) { const p = pending; pending = null; d.error ? p.reject(new Error(d.error)) : p.resolve(d); } };
    worker.onerror = err => { if (pending) { const p = pending; pending = null; p.reject(err); } };
  }
  function engineCall(type, payload) {
    ensureWorker();
    return new Promise((resolve, reject) => { const id = ++reqId; pending = { id, resolve, reject }; worker.postMessage(Object.assign({ id, type }, payload)); });
  }
  function cancelEngine() {
    if (pending) { const p = pending; pending = null; p.reject(new Error('cancelled')); }
    if (worker) { worker.terminate(); worker = null; }
  }

  // ───────── KataGo 엔진 ─────────
  let kataStatus = { phase: 'idle', text: '' };
  const kata = new KataEngine({ onStatus: s => { kataStatus = s; renderKataStatus(); } });
  let kataFailed = false;
  async function ensureKata() {
    try { await kata.init(); } catch (err) { console.warn('KataGo 엔진 사용 불가:', err); kataStatus = { phase: 'error', text: 'AI 신경망을 쓸 수 없어 기본 엔진으로 둡니다' }; renderKataStatus(); throw err; }
  }
  function renderKataStatus() {
    const ov = $('#board-overlay');
    if (ov) {
      const loading = kataStatus.phase === 'model' || kataStatus.phase === 'tf' || kataStatus.phase === 'cpu';
      ov.hidden = !loading;
      ov.innerHTML = loading ? `<div><div style="font-size:15px;opacity:.85;margin-bottom:8px">AI 준비 중</div><div>${esc(kataStatus.text)}</div>${kataStatus.progress != null ? `<div style="margin:12px auto 0;width:180px;height:6px;border-radius:3px;background:rgba(255,255,255,.25)"><div style="height:100%;width:${Math.round(kataStatus.progress * 100)}%;background:#fff;border-radius:3px"></div></div>` : ''}</div>` : '';
    }
    const info = $('#engine-info'); if (info) info.textContent = kataStatus.phase === 'ready' ? kataStatus.text : kataStatus.phase === 'error' ? kataStatus.text : kataStatus.phase === 'idle' ? 'AI 신경망은 첫 대국·분석 때 내려받아요 (약 6MB)' : kataStatus.text;
  }
  // 난이도 → KataGo 사용법. temp: 정책 샘플링 온도, rnd: 무작위 수 확률, playouts: 탐색량
  const KATA_LEVELS = {
    1: { temp: 0.9, rnd: 0.03 }, 2: { temp: 0.5 }, 3: { temp: 0.12 },
    4: { playouts: 16, cpuPlayouts: 8, timeMs: 2500 }, 5: { playouts: 48, cpuPlayouts: 12, timeMs: 4000 },
    6: { playouts: 120, cpuPlayouts: 12, timeMs: 6000 }, 7: { playouts: 260, cpuPlayouts: 20, timeMs: 8000 }, 8: { playouts: 600, cpuPlayouts: 32, timeMs: 10000 },
  };
  function gameSpec() { return { size: game.size, komi: game.komi, moves: game.moves, setup: game.setup }; }
  function sampleTemp(probs, temp, exclude) {
    // probs: Float32Array, temp>0. 상위 후보 중 temp 샘플링
    const idx = []; for (let i = 0; i < probs.length; i++) if (probs[i] > 0 && !(exclude && exclude(i))) idx.push(i);
    if (!idx.length) return -1;
    if (temp < 0.05) { let b = idx[0]; for (const i of idx) if (probs[i] > probs[b]) b = i; return b; }
    let mx = -Infinity; for (const i of idx) mx = Math.max(mx, Math.log(probs[i]) / temp);
    const w = idx.map(i => Math.exp(Math.log(probs[i]) / temp - mx)); const s = w.reduce((a, b) => a + b, 0);
    let r = Math.random() * s; for (let k = 0; k < idx.length; k++) { r -= w[k]; if (r <= 0) return idx[k]; }
    return idx[idx.length - 1];
  }
  /** KataGo 기반 봇 착수. 반환 {move, winrate(봇 기준), blackWinrate} */
  /** 봇 기권 판단 (봇 관점 승률·집 차이). 세 번 연속 조건을 만족해야 기권
      - 압도적 차이(대마가 잡히는 등): 초반이라도 기권
      - 그 외: 판이 거의 채워진 중후반에 역전 가능성이 사실상 없을 때만 */
  function shouldResign(wrBot, leadBot) {
    const L = game.size, n = game.moves.length, area = L * L;
    if (n < Math.min(20, area * 0.2)) { game.botLowCount = 0; return false; }
    const huge = L >= 19 ? 30 : L >= 13 ? 20 : 12;   // 압도적 차이
    const lateNeed = L >= 19 ? 15 : L >= 13 ? 10 : 6; // 후반 기준
    const overwhelming = wrBot < 0.01 && leadBot < -huge;
    const lateHopeless = n >= area * 0.55 && wrBot < 0.03 && leadBot < -lateNeed;
    if (overwhelming || lateHopeless) game.botLowCount = (game.botLowCount || 0) + 1; else game.botLowCount = 0;
    return game.botLowCount >= 3;
  }
  async function kataGenmove(humanPassed) {
    const lv = KATA_LEVELS[game.botLevel] || KATA_LEVELS[4];
    const L = game.size, PASSI = L * L;
    const spec = gameSpec();
    const late = game.moves.length >= L * L * 0.3;
    if (lv.playouts) {
      let playouts = kata.backend === 'cpu-worker' ? lv.cpuPlayouts : lv.playouts;
      // 첫 몇 수(빈 귀 차지 등)는 고민할 게 적으니 짧게 생각
      if (game.moves.length < 4) playouts = Math.min(playouts, 24);
      const res = await kata.analyze(spec, { playouts, timeMs: lv.timeMs || 20000, onProgress: (d, t) => renderStatus(`<b>${esc(botByLevel(game.botLevel).name)}</b> 생각 중 · ${d}/${t}`) });
      if (!res.moves.length) return { move: PASS, winrate: res.winrate };
      const visits = new Float32Array(PASSI + 1); for (const m of res.moves) visits[m.p < 0 ? PASSI : m.p] = m.visits;
      let pick = lv.temp ? sampleTemp(visits, lv.temp) : -1;
      if (pick < 0) { let b = res.moves[0]; pick = b.p < 0 ? PASSI : b.p; }
      const best = res.moves[0];
      if (shouldResign(res.winrate, res.lead)) return { move: RESIGN, winrate: res.winrate };
      // 상대 패스 시: 이기고 있으면 패스로 종국
      if (humanPassed && res.lead > 0 && (best.p < 0 || late)) return { move: PASS, winrate: res.winrate };
      return { move: pick === PASSI ? PASS : pick, winrate: res.winrate };
    }
    const r = await kata.evaluate(spec);
    if (shouldResign(r.winrate, r.lead)) return { move: RESIGN, winrate: r.winrate };
    const probs = Float32Array.from(r.policy);
    if (lv.rnd && Math.random() < lv.rnd && game.moves.length > 2) {
      // 무작위 실수: 정책이 아주 낮은 수는 피함 (완전 엉뚱한 수 방지)
      const cands = []; for (let i = 0; i < PASSI; i++) if (probs[i] > 0.0005) cands.push(i);
      if (cands.length) return { move: cands[(Math.random() * cands.length) | 0], winrate: r.winrate, blunder: true };
    }
    // 종반 패스 처리: 상대가 패스했고 유리하면 패스, 또는 정책 1위가 패스
    let bestI = 0; for (let i = 1; i <= PASSI; i++) if (probs[i] > probs[bestI]) bestI = i;
    if (bestI === PASSI) return { move: PASS, winrate: r.winrate };
    if (humanPassed && late && r.lead > 0 && probs[PASSI] > 0.02) return { move: PASS, winrate: r.winrate };
    // 낮은 레벨에선 패스 샘플링 방지 (초반)
    const pick = sampleTemp(probs, lv.temp, i => i === PASSI && !late);
    return { move: pick < 0 || pick === PASSI ? PASS : pick, winrate: r.winrate };
  }

  // ───────── 상태 ─────────
  let screen = 'home';
  let game = null, board = null;
  let view = null, viewerView = null;
  let ghost = null;           // {p, c, strong}
  let aiming = false, confirmCandidate = -1;
  let botThinking = false, botToken = 0;
  let scoring = null;         // {dead:Set, owner, score, ownership}
  let lastEval = null;        // 흑 승률
  let viewer = null;          // {entry, positions, idx, numbers}

  // ───────── 화면 전환 ─────────
  const TITLES = { home: '', game: '대국', review: '게임 리뷰', 'review-moves': '한 수씩 보기', tsumego: '사활', 'tsumego-play': '사활', learn: '배우기', 'learn-lesson': '배우기', archive: '기보함', viewer: '기보', settings: '설정' };
  const TAB_OF = { home: 'home', game: 'home', review: 'review', 'review-moves': 'review', tsumego: 'tsumego', 'tsumego-play': 'tsumego', learn: 'learn', 'learn-lesson': 'learn', archive: 'archive', viewer: 'archive', settings: 'settings' };
  function showScreen(name) {
    screen = name;
    $$('.screen').forEach(s => { s.hidden = s.id !== 'screen-' + name; });
    const sub = name === 'game' || name === 'viewer' || name === 'settings' || name === 'review-moves' || name === 'tsumego-play' || name === 'learn-lesson';
    $('#btn-back').hidden = !sub;
    $('#brand').hidden = sub;
    $('#top-title').textContent = TITLES[name] || '';
    $('#btn-settings').hidden = name === 'settings';
    $$('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === TAB_OF[name]));
    window.scrollTo(0, 0);
    if (name === 'home') renderHome();
    if (name === 'archive') renderArchive();
    if (name === 'settings') renderSettings();
    if (name === 'review' && window.Review) window.Review.onShow();
    if (name === 'game') { if (game && board) { renderGame(); if (view) view.resize(); if (game.status === 'scoring' && scoring) recomputeScore(); if (isBotTurn() && !botThinking) botMove(); } else { showScreen('home'); return; } }
    if (name === 'viewer' && viewerView) viewerView.resize();
    if (name === 'review-moves' && window.Review) window.Review.onShowMoves();
    if (name === 'tsumego' && window.TsumegoUI) window.TsumegoUI.onShow();
    if (name === 'learn' && window.Learn) window.Learn.onShow();
    if (name === 'learn-lesson' && window.Learn) window.Learn.onShowLesson();
    if (name === 'tsumego-play' && window.TsumegoUI) window.TsumegoUI.onShowPlay();
  }
  $$('[data-tab]').forEach(b => b.addEventListener('click', () => {
    const t = b.dataset.tab;
    if (t === 'home' && game && game.status !== 'ended' && screen !== 'game') { showScreen('game'); return; }
    showScreen(t);
  }));
  $('#btn-settings').addEventListener('click', () => showScreen('settings'));
  $('#btn-back').addEventListener('click', () => {
    if (screen === 'game') showScreen('home');
    else if (screen === 'viewer') showScreen('archive');
    else if (screen === 'review-moves') showScreen('review');
    else if (screen === 'tsumego-play') showScreen('tsumego');
    else if (screen === 'learn-lesson') showScreen('learn');
    else showScreen(game && game.status !== 'ended' ? 'game' : 'home');
  });

  // ───────── 홈 ─────────
  function renderHome() {
    const bot = botByLevel(settings.bot);
    $('#hero-avatar').outerHTML = avatarHTML(bot, 'lg').replace('class="avatar', 'id="hero-avatar" class="avatar');
    $('#hero-name').innerHTML = `${esc(bot.name)} <span class="chip" style="margin-left:4px">${esc(bot.rank)}</span>`;
    $('#hero-desc').textContent = bot.desc;
    $('#hero-strength').innerHTML = BOTS.map(b => `<i class="${b.level <= bot.level ? 'on' : ''}"></i>`).join('');
    const colorTxt = settings.color === BLACK ? '흑' : settings.color === WHITE ? '백' : '랜덤';
    const komi = settings.handicap >= 2 ? 0.5 : settings.komi;
    $('#quick-opts').innerHTML = `<span class="chip">${settings.size}줄</span><span class="chip">내 돌 ${colorTxt}</span>${settings.handicap >= 2 ? `<span class="chip accent">${settings.handicap}점 접바둑</span>` : ''}<span class="chip">덤 ${komi}</span>`;
    $('#btn-resume').hidden = !(game && game.status !== 'ended');
    // 봇 그리드
    const grid = $('#bot-grid'); grid.innerHTML = '';
    for (const b of BOTS) {
      const cell = el(`<button class="bot-cell ${b.level === settings.bot ? 'active' : ''}">${avatarHTML(b)}<span class="name">${esc(b.name)}</span><span class="rank">${esc(b.rank)}</span></button>`);
      cell.onclick = () => { settings.bot = b.level; saveSettings(); renderHome(); };
      grid.appendChild(cell);
    }
    // 세그먼트
    $$('#seg-size button').forEach(b => b.classList.toggle('active', +b.dataset.v === settings.size));
    $$('#seg-color button').forEach(b => b.classList.toggle('active', +b.dataset.v === settings.color));
    $('#step-handicap .value').textContent = settings.handicap >= 2 ? `${settings.handicap}점` : '없음';
    $('#step-komi .value').textContent = settings.handicap >= 2 ? '0.5 (접바둑)' : `${settings.komi}집`;
    // 최근 대국
    const list = $('#recent-list'); list.innerHTML = '';
    const recent = archive.slice(0, 3);
    if (!recent.length) list.innerHTML = `<div class="empty"><svg><use href="#i-archive"/></svg><div class="t">아직 저장된 대국이 없어요</div><div>대국이 끝나면 기보를 저장할 수 있어요.</div></div>`;
    for (const e of recent) list.appendChild(archiveRow(e));
  }
  $$('#seg-size button').forEach(b => b.addEventListener('click', () => { settings.size = +b.dataset.v; if (settings.size === 9 && settings.handicap > 5) settings.handicap = 5; saveSettings(); renderHome(); }));
  $$('#seg-color button').forEach(b => b.addEventListener('click', () => { settings.color = +b.dataset.v; saveSettings(); renderHome(); }));
  $$('#step-handicap button').forEach(b => b.addEventListener('click', () => {
    const d = +b.dataset.d; let h = settings.handicap; const max = settings.size === 9 ? 5 : 9;
    if (h < 2) h = d > 0 ? 2 : 0; else h = Math.max(0, Math.min(max, h + d)); if (h === 1) h = 0;
    settings.handicap = h; saveSettings(); renderHome();
  }));
  $$('#step-komi button').forEach(b => b.addEventListener('click', () => {
    if (settings.handicap >= 2) return;
    settings.komi = Math.max(0.5, Math.min(9.5, settings.komi + (+b.dataset.d))); saveSettings(); renderHome();
  }));
  $('#btn-start').addEventListener('click', async () => {
    ensureAudio();
    if (game && game.status !== 'ended') { const ok = await confirmSheet('새 대국', '두던 대국이 있어요. 새로 시작하면 지금 대국은 사라져요.', '새로 시작', 'danger'); if (!ok) return; }
    startGame();
  });
  $('#btn-resume').addEventListener('click', () => { ensureAudio(); showScreen('game'); renderGame(); if (isBotTurn()) botMove(); });

  // ───────── 대국 ─────────
  function startGame() {
    cancelEngine(); botThinking = false; scoring = null; ghost = null; lastEval = null;
    const size = settings.size;
    const humanColor = settings.color === 0 ? (Math.random() < 0.5 ? BLACK : WHITE) : settings.color;
    const handicap = settings.handicap >= 2 ? settings.handicap : 0;
    const komi = handicap ? 0.5 : settings.komi;
    const setup = { black: Go.handicapPoints(size, handicap), white: [] };
    game = { id: uid(), size, komi, handicap, botLevel: settings.bot, humanColor, botColor: 3 - humanColor, setup, moves: [], status: 'playing', result: null, startedAt: new Date().toISOString(), evals: [], dead: [] };
    board = Go.Board.fromMoves(size, [], setup);
    if (handicap) board.toPlay = WHITE;
    saveGame();
    showScreen('game'); renderGame();
    ensureKata().then(() => kata.warmup(size)).catch(() => { });
    if (isBotTurn()) botMove();
  }
  function saveGame() { if (game) store.set('current', game); }
  const isBotTurn = () => game && game.status === 'playing' && board.toPlay === game.botColor;
  const isHumanTurn = () => game && game.status === 'playing' && board.toPlay === game.humanColor && !botThinking;

  function ensureView() {
    if (view) return view;
    view = new BoardView($('#board-wrap'), { size: game.size, theme: settings.theme, stoneStyle: settings.stone, coords: settings.coords });
    $('#board-wrap').appendChild(el('<div class="board-overlay" id="board-overlay" hidden></div>'));
    renderKataStatus();
    view.on('press', onPress).on('drag', onDrag).on('release', onRelease).on('hover', onHover).on('leave', () => { if (!aiming && ghost && !ghost.strong) { ghost = null; drawBoard(); } }).on('cancel', () => { aiming = false; });
    return view;
  }

  function renderGame() {
    ensureView();
    view.setSize(game.size);
    drawBoard();
    renderPlayerBars();
    renderControls();
    renderStatus();
    renderEval();
    $('#panel-scoring').hidden = game.status !== 'scoring';
  }

  function drawBoard() {
    if (!view) return;
    const last = game.moves.length ? game.moves[game.moves.length - 1].p : -1;
    let dead = scoring ? scoring.dead : null, owner = scoring ? scoring.score.owner : null;
    if (game.status === 'ended' && !scoring) { dead = new Set(game.dead || []); owner = game.owner || null; }
    view.setState({ stones: board.stones, lastMove: last, ghost, dead, owner, marks: [], numbers: null, dimAll: false });
  }
  /** AI 소유권으로 사석·영역 추정 (흑 기준 Float32Array 반환) */
  async function aiOwnership() {
    await ensureKata();
    const r = await kata.evaluate(gameSpec());
    const sign = board.toPlay === BLACK ? 1 : -1;
    const own = new Float32Array(r.ownership.length); for (let i = 0; i < own.length; i++) own[i] = sign * r.ownership[i];
    return { own, r };
  }
  function deadFromOwnership(own, threshold) {
    const dead = new Set();
    for (const g of board.groups()) { let s = 0; for (const p of g.stones) s += own[p]; s /= g.stones.length; if ((g.color === BLACK && s < -threshold) || (g.color === WHITE && s > threshold)) g.stones.forEach(p => dead.add(p)); }
    return dead;
  }

  function playerBarHTML(color) {
    const isBot = color === game.botColor; const bot = isBot ? botByLevel(game.botLevel) : null;
    const active = game.status === 'playing' && board.toPlay === color;
    const name = isBot ? bot.name : '나';
    const rank = isBot ? bot.rank : '';
    return `<div class="player-bar ${active ? 'active' : ''} ${isBot && botThinking ? 'thinking' : ''}">
      ${avatarHTML(bot)}
      <div class="pinfo"><div class="pname"><span class="stone-dot ${color === BLACK ? 'b' : 'w'}"></span>${esc(name)} ${rank ? `<span class="chip">${esc(rank)}</span>` : ''}</div>
      <div class="pmeta"><span class="caps">따낸 돌 <b class="num">${board.captures[color]}</b></span>${color === WHITE ? `<span>덤 ${game.komi}</span>` : ''}${game.handicap && color === BLACK ? `<span>${game.handicap}점</span>` : ''}</div></div>
      <span class="thinking">생각 중 <span class="dots"><span></span><span></span><span></span></span></span>
    </div>`;
  }
  function renderPlayerBars() {
    $('#pb-top').outerHTML = playerBarHTML(game.botColor).replace('class="player-bar', 'id="pb-top" class="player-bar');
    $('#pb-bottom').outerHTML = playerBarHTML(game.humanColor).replace('class="player-bar', 'id="pb-bottom" class="player-bar');
  }

  function renderControls() {
    const c = $('#controls'); c.innerHTML = '';
    if (game.status === 'scoring') { c.hidden = true; return; }
    c.hidden = false;
    const btn = (id, icon, label, cls, disabled) => { const b = el(`<button class="ctl ${cls || ''}" id="ctl-${id}" ${disabled ? 'disabled' : ''}><svg><use href="#i-${icon}"/></svg><span>${label}</span></button>`); c.appendChild(b); return b; };
    if (game.status === 'ended') {
      btn('result', 'review', '결과 보기').onclick = () => showResultSheet();
      btn('new', 'play', '새 대국').onclick = () => showScreen('home');
      btn('archive', 'archive', '기보함').onclick = () => showScreen('archive');
      btn('menu', 'more', '메뉴').onclick = showGameMenu;
      return;
    }
    const humanMoves = game.moves.filter(m => m.c === game.humanColor).length;
    if (ghost && ghost.strong && isHumanTurn()) {
      btn('confirm', 'check', `${Go.coordLabel(ghost.p, game.size)} 착수`, 'confirm').onclick = () => tryPlay(ghost.p);
      btn('cancel', 'undo', '취소').onclick = () => { ghost = null; drawBoard(); renderControls(); };
      btn('menu', 'more', '메뉴').onclick = showGameMenu;
      return;
    }
    btn('undo', 'undo', '무르기', '', humanMoves === 0).onclick = undoMove;
    btn('pass', 'pass', '패스', '', !isHumanTurn()).onclick = humanPass;
    btn('resign', 'flag', '기권').onclick = humanResign;
    btn('menu', 'more', '메뉴').onclick = showGameMenu;
  }

  function renderStatus(extra) {
    const s = $('#game-status');
    if (game.status === 'ended') { s.innerHTML = `<b>${esc(game.result.text)}</b>`; return; }
    if (game.status === 'scoring') { s.innerHTML = '양쪽 모두 패스 — <b>계가</b>'; return; }
    const n = game.moves.length;
    const last = n ? game.moves[n - 1] : null;
    let msg = botThinking ? `<b>${esc(botByLevel(game.botLevel).name)}</b>이(가) 생각 중` : `<b>${colorName(board.toPlay)}</b> 차례 · ${n}수`;
    if (last && last.p === PASS) msg = `${colorName(last.c)}이 패스했어요 · ` + msg;
    if (extra) msg = extra;
    s.innerHTML = msg;
  }

  function renderEval() {
    const row = $('#eval-row');
    row.hidden = !settings.eval || lastEval == null;
    if (row.hidden) return;
    const pct = Math.round(lastEval * 100);
    $('#eval-b').style.width = pct + '%';
    $('#eval-txt').textContent = `흑 ${pct}%`;
  }

  // 입력
  function needConfirm(type) { return settings.confirm === 'always' || (settings.confirm === 'auto' && type !== 'mouse'); }
  function onPress(e, type) {
    if (game.status === 'scoring') { const p = view.pointFromClient(e.clientX, e.clientY, 0); if (p >= 0) toggleDead(p); return; }
    if (!isHumanTurn()) return;
    const raw = view.pointFromClient(e.clientX, e.clientY, 0);
    if (type === 'mouse') {
      if (raw < 0) return;
      if (!needConfirm(type)) { tryPlay(raw); return; }
      if (ghost && ghost.strong && ghost.p === raw) { tryPlay(raw); return; }
      if (board.check(raw, game.humanColor).ok) { ghost = { p: raw, c: game.humanColor, strong: true }; drawBoard(); renderControls(); }
      return;
    }
    // 터치/펜
    if (ghost && ghost.strong && raw === ghost.p) { confirmCandidate = raw; return; }
    confirmCandidate = -1; aiming = true;
    const p = view.pointFromClient(e.clientX, e.clientY, 0);
    ghost = { p, c: game.humanColor, strong: true }; drawBoard();
  }
  function onDrag(e, type) {
    if (!aiming || !isHumanTurn()) return;
    const p = view.pointFromClient(e.clientX, e.clientY, 0);
    if (!ghost || ghost.p !== p) { ghost = { p, c: game.humanColor, strong: true }; drawBoard(); }
  }
  function onRelease(e, type) {
    if (game.status !== 'playing') return;
    if (confirmCandidate >= 0) { const raw = view.pointFromClient(e.clientX, e.clientY, 0); const p = confirmCandidate; confirmCandidate = -1; if (raw === p && ghost && ghost.p === p) tryPlay(p); return; }
    if (!aiming) return; aiming = false;
    if (!ghost || ghost.p < 0 || !board.check(ghost.p, game.humanColor).ok) { ghost = null; drawBoard(); renderControls(); return; }
    if (!needConfirm(type)) { tryPlay(ghost.p); return; }
    drawBoard(); renderControls();
  }
  function onHover(e) {
    if (!isHumanTurn() || (ghost && ghost.strong)) return;
    const p = view.pointFromClient(e.clientX, e.clientY, 0);
    const np = (p >= 0 && board.stones[p] === EMPTY) ? p : -1;
    if ((ghost ? ghost.p : -1) !== np) { ghost = np >= 0 ? { p: np, c: game.humanColor, strong: false } : null; drawBoard(); }
  }

  function tryPlay(p) {
    if (!isHumanTurn()) return;
    const chk = board.check(p, game.humanColor);
    if (!chk.ok) {
      const why = { ko: '패예요. 다른 곳에 한 번 둔 뒤 따낼 수 있어요.', suicide: '자충이에요. 둘 수 없는 자리예요.', superko: '같은 모양이 반복돼요. 둘 수 없어요.', occupied: '이미 돌이 있어요.' }[chk.reason] || '둘 수 없는 자리예요.';
      toast(why); ghost = null; drawBoard(); renderControls(); return;
    }
    const r = board.play(p, game.humanColor);
    game.moves.push({ c: game.humanColor, p });
    ghost = null; playStoneSound(r.captured.length > 0);
    saveGame(); renderGame();
    botMove();
  }

  function humanPass() {
    if (!isHumanTurn()) return;
    board.play(PASS, game.humanColor); game.moves.push({ c: game.humanColor, p: PASS });
    ghost = null; saveGame();
    if (board.passes >= 2) { startScoring(); return; }
    renderGame(); botMove(true);
  }

  async function humanResign() {
    if (game.status !== 'playing') return;
    const ok = await confirmSheet('기권', '정말 기권할까요? 상대의 불계승으로 기록돼요.', '기권하기', 'danger');
    if (!ok) return;
    cancelEngine(); botThinking = false;
    endGame({ winner: game.botColor, by: 'resign', text: `${colorName(game.botColor)} 불계승` });
  }

  function undoMove() {
    if (!game || game.status !== 'playing') return;
    const humanMoves = game.moves.filter(m => m.c === game.humanColor).length;
    if (!humanMoves) return;
    if (botThinking) { cancelEngine(); botThinking = false; botToken++; }
    while (game.moves.length && game.moves[game.moves.length - 1].c === game.botColor) game.moves.pop();
    if (game.moves.length && game.moves[game.moves.length - 1].c === game.humanColor) game.moves.pop();
    board = Go.Board.fromMoves(game.size, game.moves, game.setup);
    if (game.handicap && !game.moves.length) board.toPlay = WHITE;
    if (game.evals.length) game.evals = game.evals.filter(e => e.n <= game.moves.length);
    lastEval = game.evals.length ? game.evals[game.evals.length - 1].black : null;
    ghost = null; saveGame(); renderGame();
    if (isBotTurn()) botMove();
  }

  async function botMove(humanPassed) {
    if (!isBotTurn() || botThinking) return;
    botThinking = true; const token = ++botToken;
    renderPlayerBars(); renderControls(); renderStatus();
    let res = null;
    const tStart = Date.now();
    try {
      await ensureKata();
      if (token !== botToken || !game || game.status !== 'playing') return;
      res = await kataGenmove(!!humanPassed);
      const wait = 450 - (Date.now() - tStart); if (wait > 0) await new Promise(r => setTimeout(r, wait)); // 너무 즉답이면 어색해서
    } catch (err) {
      if (token !== botToken || !game || game.status !== 'playing') return;
      try {
        res = await engineCall('genmove', { size: game.size, komi: game.komi, moves: game.moves, setup: game.setup, level: Math.min(8, game.botLevel + 4), humanPassed: !!humanPassed });
      } catch (err2) { if (token === botToken) { botThinking = false; renderGame(); } return; }
    }
    if (token !== botToken || !game || game.status !== 'playing') return;
    botThinking = false;
    const botWr = res.winrate;
    lastEval = game.botColor === BLACK ? botWr : 1 - botWr;
    game.evals.push({ n: game.moves.length + 1, black: lastEval });
    if (res.move === RESIGN) { endGame({ winner: game.humanColor, by: 'resign', text: `${colorName(game.humanColor)} 불계승` }); return; }
    if (res.move === PASS) {
      board.play(PASS, game.botColor); game.moves.push({ c: game.botColor, p: PASS }); saveGame();
      if (board.passes >= 2) { startScoring(); return; }
      renderGame(); toast(`${botByLevel(game.botLevel).name}이(가) 패스했어요`); return;
    }
    const chk = board.check(res.move, game.botColor);
    if (!chk.ok) { board.play(PASS, game.botColor); game.moves.push({ c: game.botColor, p: PASS }); saveGame(); renderGame(); return; }
    const r = board.play(res.move, game.botColor);
    game.moves.push({ c: game.botColor, p: res.move });
    playStoneSound(r.captured.length > 0);
    saveGame(); renderGame();
  }

  // ───────── 계가 신청 (플레이어 → AI) ─────────
  async function requestScoring() {
    if (!game || game.status !== 'playing') return;
    if (botThinking) { toast('봇이 생각 중이에요. 잠시 뒤에 신청하세요'); return; }
    const L = game.size;
    if (game.moves.length < L * L * 0.4) { toast(`${botByLevel(game.botLevel).name}: 아직 초반이에요. 더 두어요!`); return; }
    renderStatus('AI가 계가 신청을 검토하는 중…');
    let accept = true, reason = '';
    try {
      const { own, r } = await aiOwnership();
      if (!game || game.status !== 'playing') return;
      const passProb = r.policy[L * L] || 0;
      let contested = 0;
      for (let i = 0; i < L * L; i++) if (board.stones[i] === EMPTY && Math.abs(own[i]) > 0.25 && Math.abs(own[i]) < 0.8) contested++;
      const blackLead = board.toPlay === BLACK ? r.lead : -r.lead;
      const botLead = game.botColor === BLACK ? blackLead : -blackLead;
      const over = passProb > 0.2 || contested <= Math.max(2, L * L * 0.01);
      if (over) { accept = true; reason = '좋아요, 계가해요.'; }
      else if (botLead > 3 && contested <= L * L * 0.05) { accept = true; reason = '좋아요. 조금 남았지만 계가해요.'; }
      else { accept = false; reason = botLead <= 0 ? '아직 둘 곳이 남았어요. 더 둬 볼게요.' : '경계가 아직 덜 정해졌어요. 조금 더 둬요.'; }
    } catch (_) { accept = true; reason = '좋아요, 계가해요.'; }
    const bot = botByLevel(game.botLevel);
    toast(`${bot.name}: ${reason}`, 2800);
    if (accept) startScoring(); else renderStatus();
  }

  // ───────── 계가 ─────────
  async function startScoring() {
    game.status = 'scoring'; ghost = null; cancelEngine(); botThinking = false;
    scoring = { dead: new Set(), ownership: null, score: Go.territoryScore(board, new Set(), game.komi) };
    renderGame(); $('#score-table').innerHTML = scoreTableHTML(scoring.score); renderStatus('사석을 판정하는 중…');
    try {
      let ownership = null, threshold = 0.35;
      try {
        await ensureKata();
        const r = await kata.evaluate(gameSpec());
        if (!game || game.status !== 'scoring') return;
        const sign = board.toPlay === BLACK ? 1 : -1; // 흑 기준으로 변환
        ownership = new Float32Array(r.ownership.length); for (let i = 0; i < ownership.length; i++) ownership[i] = sign * r.ownership[i];
        threshold = 0.2;
      } catch (_) {
        const res = await engineCall('estimate', { size: game.size, komi: game.komi, moves: game.moves, setup: game.setup });
        if (!game || game.status !== 'scoring') return;
        ownership = res.ownership;
      }
      scoring.ownership = ownership;
      const dead = new Set();
      for (const g of board.groups()) {
        let s = 0; for (const p of g.stones) s += ownership[p]; s /= g.stones.length;
        if ((g.color === BLACK && s < -threshold) || (g.color === WHITE && s > threshold)) g.stones.forEach(p => dead.add(p));
      }
      scoring.dead = dead;
    } catch (_) { }
    recomputeScore(); saveGame();
  }
  function toggleDead(p) {
    if (!scoring || board.stones[p] === EMPTY) return;
    const g = board.group(p);
    const isDead = scoring.dead.has(p);
    for (const s of g.stones) { if (isDead) scoring.dead.delete(s); else scoring.dead.add(s); }
    recomputeScore();
  }
  function recomputeScore() {
    scoring.score = Go.territoryScore(board, scoring.dead, game.komi);
    game.dead = [...scoring.dead];
    drawBoard(); renderStatus(); renderControls();
    $('#panel-scoring').hidden = false;
    $('#score-table').innerHTML = scoreTableHTML(scoring.score);
  }
  function scoreTableHTML(sc) {
    return `<div class="r"><span class="h"></span><span class="h">흑</span><span class="h">백</span></div>
      <div class="r"><span>집</span><span class="num">${sc.black.territory}</span><span class="num">${sc.white.territory}</span></div>
      <div class="r"><span>따낸 돌 + 사석</span><span class="num">${sc.black.prisoners}</span><span class="num">${sc.white.prisoners}</span></div>
      <div class="r"><span>덤</span><span class="num">–</span><span class="num">${sc.white.komi}</span></div>
      <div class="r total"><span>합계</span><span class="num">${sc.black.total}</span><span class="num">${sc.white.total}</span></div>`;
  }
  $('#btn-score-resume').addEventListener('click', () => {
    game.status = 'playing'; scoring = null; board.passes = 0; saveGame(); renderGame();
    if (isBotTurn()) botMove();
  });
  $('#btn-score-confirm').addEventListener('click', () => {
    const sc = scoring.score;
    const winner = sc.diff > 0 ? BLACK : sc.diff < 0 ? WHITE : 0;
    endGame({ winner, by: 'score', diff: sc.diff, text: sc.result, score: { black: sc.black, white: sc.white } });
  });

  // ───────── 종국 / 결과 ─────────
  function endGame(result) {
    game.status = 'ended'; game.result = result; game.endedAt = new Date().toISOString(); game.saved = false;
    cancelEngine(); botThinking = false; ghost = null;
    if (scoring) { game.dead = [...scoring.dead]; game.owner = Array.from(scoring.score.owner); }
    scoring = null;
    saveGame(); renderGame();
    $('#panel-scoring').hidden = true;
    showResultSheet(true);
    if (result.by === 'resign') {
      const g = game;
      aiOwnership().then(({ own }) => {
        if (game !== g) return;
        const dead = deadFromOwnership(own, 0.3);
        g.dead = [...dead];
        g.owner = Array.from(own, (v, i) => (board.stones[i] === EMPTY || dead.has(i)) ? (v > 0.5 ? BLACK : v < -0.5 ? WHITE : 0) : 0);
        saveGame(); drawBoard();
        if (archive.some(e => e.id === g.id)) { const e = archive.find(e => e.id === g.id); e.dead = g.dead; e.owner = g.owner; e.updatedAt = Date.now(); saveArchive(); }
      }).catch(() => { });
    }
  }
  function showResultSheet(askSave) {
    const r = game.result, bot = botByLevel(game.botLevel);
    const iWon = r.winner === game.humanColor, draw = r.winner === 0;
    const head = draw ? '빅' : iWon ? '승리!' : '패배';
    const html = `
      <div class="result-hero"><div class="big ${iWon ? 'win' : 'lose'}">${head}</div><div class="sub">${esc(r.text)}${r.by === 'resign' ? '' : ''}</div></div>
      <div class="vs">
        <div class="side">${avatarHTML(null, 'lg')}<span><span class="stone-dot ${game.humanColor === BLACK ? 'b' : 'w'}" style="display:inline-block;vertical-align:-2px;margin-right:4px"></span>나</span></div>
        <div class="mid">VS</div>
        <div class="side">${avatarHTML(bot, 'lg')}<span><span class="stone-dot ${game.botColor === BLACK ? 'b' : 'w'}" style="display:inline-block;vertical-align:-2px;margin-right:4px"></span>${esc(bot.name)} ${esc(bot.rank)}</span></div>
      </div>
      ${r.score ? `<div class="card" style="padding:12px 14px"><div class="score-table">${scoreTableHTML({ black: r.score.black, white: r.score.white })}</div></div>` : ''}
      <div id="result-actions"></div>`;
    const s = openSheet(html, { sticky: true });
    const actions = s.querySelector('#result-actions');
    const renderActions = () => {
      if (askSave && !game.saved && !game.declinedSave) {
        actions.innerHTML = `<div class="card" style="padding:14px"><div style="font-weight:700;margin-bottom:4px">기보를 저장할까요?</div><div class="small muted" style="margin-bottom:12px">기보함에 보관하면 언제든 다시 보고, 2단계부터는 게임 리뷰도 돌릴 수 있어요.</div><div class="btn-row"><button class="btn secondary" id="r-nosave">저장 안 함</button><button class="btn primary" id="r-save">저장</button></div></div>`;
        actions.querySelector('#r-save').onclick = () => { saveToArchive(game); game.saved = true; saveGame(); toast('기보함에 저장했어요'); renderActions(); };
        actions.querySelector('#r-nosave').onclick = () => { game.declinedSave = true; saveGame(); renderActions(); };
        return;
      }
      actions.innerHTML = `<div class="btn-row"><button class="btn primary" id="r-review"><svg><use href="#i-review"/></svg>게임 리뷰</button></div>
        <div class="btn-row"><button class="btn secondary" id="r-close">판 보기</button><button class="btn secondary" id="r-new">다시 대국</button></div>
        ${!game.saved ? `<button class="btn ghost block" id="r-save2">기보 저장</button>` : ''}`;
      actions.querySelector('#r-review').onclick = () => { if (!game.saved) { saveToArchive(game); game.saved = true; saveGame(); } closeSheet(); window.Review && window.Review.open(game.id); };
      actions.querySelector('#r-close').onclick = () => closeSheet();
      actions.querySelector('#r-new').onclick = () => { closeSheet(); showScreen('home'); };
      const s2 = actions.querySelector('#r-save2'); if (s2) s2.onclick = () => { saveToArchive(game); game.saved = true; saveGame(); toast('기보함에 저장했어요'); renderActions(); };
    };
    renderActions();
  }

  function saveToArchive(g) {
    const bot = botByLevel(g.botLevel);
    const entry = { id: g.id, date: g.endedAt || new Date().toISOString(), size: g.size, komi: g.komi, handicap: g.handicap, bot: { level: bot.level, name: bot.name, rank: bot.rank }, humanColor: g.humanColor,
      result: g.result, moves: g.moves, setup: g.setup, evals: g.evals, dead: g.dead || [], owner: g.owner || null };
    entry.updatedAt = Date.now();
    archive = archive.filter(e => e.id !== g.id); archive.unshift(entry); saveArchive();
  }

  function showGameMenu() {
    const s = openSheet(`<h2>메뉴</h2><div class="list">
      ${game.status === 'playing' ? `<button class="list-row" data-a="count"><svg class="chev" style="width:22px;height:22px"><use href="#i-check"/></svg><div class="grow"><div class="primary-text">계가 신청</div><div class="secondary-text">끝났다고 생각하면 AI에게 계가를 제안해요</div></div></button>` : ''}
      <button class="list-row" data-a="settings"><svg class="chev" style="width:22px;height:22px"><use href="#i-settings"/></svg><div class="grow"><div class="primary-text">설정</div><div class="secondary-text">테마, 좌표, 소리</div></div></button>
      <button class="list-row" data-a="sgf"><svg class="chev" style="width:22px;height:22px"><use href="#i-copy"/></svg><div class="grow"><div class="primary-text">SGF 복사</div><div class="secondary-text">현재 기보를 클립보드에 복사</div></div></button>
      <button class="list-row" data-a="save"><svg class="chev" style="width:22px;height:22px"><use href="#i-archive"/></svg><div class="grow"><div class="primary-text">지금 상태로 기보함에 저장</div></div></button>
      <button class="list-row" data-a="quit" style="color:var(--danger)"><svg class="chev" style="width:22px;height:22px;color:var(--danger)"><use href="#i-flag"/></svg><div class="grow"><div class="primary-text">대국 그만두기</div><div class="secondary-text">기록 없이 홈으로</div></div></button>
    </div>`);
    const cnt = s.querySelector('[data-a=count]'); if (cnt) cnt.onclick = () => { closeSheet(); requestScoring(); };
    s.querySelector('[data-a=settings]').onclick = () => { closeSheet(); showScreen('settings'); };
    s.querySelector('[data-a=sgf]').onclick = () => { closeSheet(); copyText(gameSGF(game)); };
    s.querySelector('[data-a=save]').onclick = () => { closeSheet(); saveToArchive(game); game.saved = true; saveGame(); toast('기보함에 저장했어요'); };
    s.querySelector('[data-a=quit]').onclick = async () => { closeSheet(); const ok = await confirmSheet('대국 그만두기', '지금 대국을 기록 없이 끝낼까요?', '그만두기', 'danger'); if (!ok) return; cancelEngine(); botThinking = false; game = null; board = null; scoring = null; store.del('current'); showScreen('home'); };
  }

  function gameSGF(g) {
    const bot = g.bot || botByLevel(g.botLevel);
    const me = '나', bn = `${bot.name} (${bot.rank})`;
    const names = g.names || { black: g.humanColor === BLACK ? me : bn, white: g.humanColor === WHITE ? me : bn };
    return Go.toSGF({ size: g.size, komi: g.komi, handicap: g.handicap, moves: g.moves, setup: g.setup, rules: 'Korean', date: (g.endedAt || g.date || g.startedAt || '').slice(0, 10),
      black: names.black, white: names.white, result: g.result ? sgfResult(g.result) : '' });
  }
  function sgfResult(r) { if (!r || !r.winner) return '0'; const w = r.winner === BLACK ? 'B' : 'W'; return r.by === 'resign' ? w + '+R' : w + '+' + Math.abs(r.diff); }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); toast('복사했어요'); }
    catch (_) {
      const s = openSheet(`<h2>SGF</h2><div class="body">아래 내용을 길게 눌러 복사하세요.</div><textarea style="width:100%;height:160px;border-radius:10px;border:1px solid var(--line);background:var(--surface-2);color:var(--fg);padding:10px;font-family:monospace;font-size:12px" readonly>${esc(text)}</textarea><button class="btn secondary block" id="c-close">닫기</button>`);
      s.querySelector('textarea').select(); s.querySelector('#c-close').onclick = closeSheet;
    }
  }

  // ───────── 기보함 ─────────
  function archiveRow(e) {
    const r = e.result; const iWon = r && r.winner === e.humanColor; const draw = r && r.winner === 0;
    const tag = e.imported ? '<span class="chip">SGF</span>' : !r ? '<span class="chip">진행 중</span>' : draw ? '<span class="chip">빅</span>' : iWon ? '<span class="chip accent">승</span>' : '<span class="chip warn">패</span>';
    const av = e.imported ? avatarHTML({ name: (e.names && e.names.white) || '백', color: '#5b6573' }, 'sm') : avatarHTML(botByLevel(e.bot.level), 'sm');
    const title = e.imported ? `${esc(e.names.black)} vs ${esc(e.names.white)} · ${e.size}줄` : `<span class="stone-dot ${e.humanColor === BLACK ? 'b' : 'w'}" style="display:inline-block;vertical-align:-2px;margin-right:6px;width:12px;height:12px"></span>${esc(e.bot.name)} ${esc(e.bot.rank)} · ${e.size}줄${e.handicap ? ` · ${e.handicap}점` : ''}`;
    const row = el(`<button class="list-row">${av}<div class="grow"><div class="primary-text">${title}</div><div class="secondary-text">${fmtDate(e.date)} · ${e.moves.length}수 · ${r ? esc(r.text) : ''}</div></div>${tag}<svg class="chev"><use href="#i-chev"/></svg></button>`);
    row.onclick = () => openViewer(e);
    return row;
  }
  function renderArchive() {
    const list = $('#archive-list'); list.innerHTML = '';
    if (!archive.length) { list.innerHTML = `<div class="empty"><svg><use href="#i-archive"/></svg><div class="t">기보함이 비어 있어요</div><div>대국이 끝나면 저장할지 물어볼게요. SGF 파일 내용을 붙여넣어 불러올 수도 있어요.</div></div>`; return; }
    for (const e of archive) list.appendChild(archiveRow(e));
  }
  $('#btn-import').addEventListener('click', () => {
    const s = openSheet(`<h2>SGF 불러오기</h2><div class="body">SGF 파일을 텍스트로 열어 내용을 붙여넣으세요.</div><textarea id="imp-text" style="width:100%;height:150px;border-radius:10px;border:1px solid var(--line);background:var(--surface-2);color:var(--fg);padding:10px;font-family:monospace;font-size:12px" placeholder="(;GM[1]FF[4]SZ[19]...)"></textarea><div class="btn-row"><button class="btn secondary" id="imp-cancel">취소</button><button class="btn primary" id="imp-ok">불러오기</button></div>`);
    s.querySelector('#imp-cancel').onclick = closeSheet;
    s.querySelector('#imp-ok').onclick = () => {
      try {
        const g = Go.parseSGF(s.querySelector('#imp-text').value);
        Go.Board.fromMoves(g.size, g.moves, g.setup); // 검증
        const entry = { id: uid(), date: new Date().toISOString(), size: g.size, komi: g.komi, handicap: g.handicap, bot: { level: 0, name: g.white || '백', rank: '' }, humanColor: BLACK, imported: true,
          names: { black: g.black || '흑', white: g.white || '백' }, result: g.result ? { winner: g.result[0] === 'B' ? BLACK : g.result[0] === 'W' ? WHITE : 0, by: /R/.test(g.result) ? 'resign' : 'score', text: g.result, diff: parseFloat(g.result.split('+')[1]) || 0 } : null, moves: g.moves, setup: g.setup, evals: [], dead: [] };
        archive.unshift(entry); saveArchive(); closeSheet(); renderArchive(); toast('불러왔어요');
      } catch (err) { toast('SGF를 읽지 못했어요: ' + (err.message || err)); }
    };
  });

  // ───────── 기보 뷰어 ─────────
  function openViewer(entry) {
    const positions = [];
    const b = Go.Board.fromMoves(entry.size, [], entry.setup);
    positions.push({ stones: new Uint8Array(b.stones), caps: b.captures.slice(), last: -1 });
    for (const m of entry.moves) { try { b.play(m.p, m.c); } catch (_) { break; } positions.push({ stones: new Uint8Array(b.stones), caps: b.captures.slice(), last: m.p }); }
    viewer = { entry, positions, idx: positions.length - 1, numbers: false };
    showScreen('viewer');
    if (!viewerView) {
      viewerView = new BoardView($('#viewer-wrap'), { size: entry.size, theme: settings.theme, stoneStyle: settings.stone, coords: settings.coords });
      viewerView.on('press', () => { });
    }
    viewerView.setSize(entry.size);
    $('#viewer-range').max = positions.length - 1;
    renderViewer();
  }
  function renderViewer() {
    const v = viewer; if (!v) return;
    const pos = v.positions[v.idx];
    let numbers = null;
    if (v.numbers) { numbers = new Map(); for (let i = 0; i < v.idx; i++) { const m = v.entry.moves[i]; if (m.p >= 0 && pos.stones[m.p] === m.c) numbers.set(m.p, i + 1); } }
    const atEnd = v.idx === v.positions.length - 1;
    const dead = (atEnd && v.entry.dead && v.entry.dead.length) ? new Set(v.entry.dead) : null;
    let owner = null;
    if (atEnd && v.entry.result) {
      if (v.entry.owner) owner = Uint8Array.from(v.entry.owner);
      else { try { const b = Go.Board.fromMoves(v.entry.size, v.entry.moves, v.entry.setup); owner = Go.territoryScore(b, dead || new Set(), v.entry.komi).owner; } catch (_) { } }
    }
    viewerView.setState({ stones: pos.stones, lastMove: pos.last, ghost: null, dead, owner, marks: [], numbers, dimAll: false });
    $('#viewer-range').value = v.idx;
    const e = v.entry; const bot = e.imported ? null : botByLevel(e.bot.level);
    const nameOf = c => e.imported ? (c === BLACK ? e.names.black : e.names.white) : (c === e.humanColor ? '나' : `${bot.name} ${bot.rank}`);
    const bar = (c, id) => `<div class="player-bar" id="${id}">${c === e.humanColor && !e.imported ? avatarHTML(null) : avatarHTML(bot || { name: nameOf(c), color: '#5b6573' })}<div class="pinfo"><div class="pname"><span class="stone-dot ${c === BLACK ? 'b' : 'w'}"></span>${esc(nameOf(c))}</div><div class="pmeta"><span class="caps">따낸 돌 <b class="num">${pos.caps[c]}</b></span>${c === WHITE ? `<span>덤 ${e.komi}</span>` : ''}</div></div></div>`;
    const topColor = e.imported ? WHITE : (3 - e.humanColor);
    $('#vpb-top').outerHTML = bar(topColor, 'vpb-top');
    $('#vpb-bottom').outerHTML = bar(3 - topColor, 'vpb-bottom');
    const m = v.idx > 0 ? e.moves[v.idx - 1] : null;
    $('#viewer-status').innerHTML = `<b>${v.idx}</b> / ${v.positions.length - 1}수${m ? ` · ${colorName(m.c)} ${Go.coordLabel(m.p, e.size)}` : ''}${e.result ? ` · ${esc(e.result.text)}` : ''}`;
    $('#v-numbers').setAttribute('aria-checked', String(v.numbers));
  }
  const vgo = i => { if (!viewer) return; viewer.idx = Math.max(0, Math.min(viewer.positions.length - 1, i)); renderViewer(); };
  $('#v-first').onclick = () => vgo(0); $('#v-prev').onclick = () => vgo(viewer.idx - 1); $('#v-next').onclick = () => vgo(viewer.idx + 1); $('#v-last').onclick = () => vgo(1e9);
  $('#viewer-range').addEventListener('input', e => vgo(+e.target.value));
  $('#v-numbers').onclick = () => { viewer.numbers = !viewer.numbers; renderViewer(); };
  $('#v-copy').onclick = () => copyText(gameSGF(Object.assign({ botLevel: viewer.entry.bot.level }, viewer.entry)));
  $('#v-review').onclick = () => { if (viewer && window.Review) window.Review.open(viewer.entry.id); };
  function deleteEntry(id) {
    const del = store.get('deleted', []); del.push(id); store.set('deleted', del.slice(-200));
    archive = archive.filter(e => e.id !== id); saveArchive();
  }
  $('#v-delete').onclick = async () => { const ok = await confirmSheet('기보 삭제', '이 기보를 지울까요? 리뷰 기록도 함께 사라져요.', '삭제', 'danger'); if (!ok) return; deleteEntry(viewer.entry.id); showScreen('archive'); toast('삭제했어요'); };
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && $('#sheet-root').firstChild && !$('#result-actions')) { closeSheet(); return; }
    if (screen !== 'viewer' || !viewer) return;
    if (e.key === 'ArrowLeft') { vgo(viewer.idx - 1); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { vgo(viewer.idx + 1); e.preventDefault(); }
    else if (e.key === 'Home') vgo(0); else if (e.key === 'End') vgo(1e9);
  });

  // ───────── 설정 ─────────
  function renderSettings() {
    const grid = $('#theme-grid'); grid.innerHTML = '';
    for (const t of BoardThemes.THEMES) {
      const cell = el(`<button class="theme-cell ${t.id === settings.theme ? 'active' : ''}"><canvas></canvas><span class="name">${esc(t.name)}</span></button>`);
      BoardThemes.drawThumb(cell.querySelector('canvas'), t.id, settings.stone);
      cell.onclick = () => { settings.theme = t.id; saveSettings(); applyBoardSettings(); renderSettings(); };
      grid.appendChild(cell);
    }
    const seg = $('#seg-stone'); seg.innerHTML = '';
    for (const s of BoardThemes.STONE_STYLES) { const b = el(`<button class="${s.id === settings.stone ? 'active' : ''}">${esc(s.name)}</button>`); b.onclick = () => { settings.stone = s.id; saveSettings(); applyBoardSettings(); renderSettings(); }; seg.appendChild(b); }
    renderKataStatus(); renderSync();
    $('#sw-coords').setAttribute('aria-checked', String(settings.coords));
    $('#sw-sound').setAttribute('aria-checked', String(settings.sound));
    $('#sw-eval').setAttribute('aria-checked', String(settings.eval));
    $$('#seg-confirm button').forEach(b => b.classList.toggle('active', b.dataset.v === settings.confirm));
  }
  function renderSync() {
    const body = $('#sync-body'); if (!body) return;
    const S = window.Sync;
    if (!S || !S.enabled) { body.innerHTML = `<p class="small muted">설치형 앱(GitHub Pages)에서 Firebase를 연결하면 기보함·사활 진도·설정이 패드와 폰 사이에 자동으로 맞춰져요. 지금 이 링크 버전에서는 이 기기에만 저장돼요.</p>`; return; }
    const st = S.status, u = S.user;
    const stTxt = { off: '꺼짐', none: '', ready: '로그인하면 동기화가 시작돼요', syncing: '동기화 중…', on: `동기화 켜짐${S.lastSync ? ' · 마지막 ' + S.lastSync.toLocaleTimeString() : ''}`, error: '동기화 오류 — 인터넷 연결을 확인하세요' }[st] || st;
    body.innerHTML = u
      ? `<div class="list-row" style="padding:6px 0"><div class="avatar sm" style="background:#3a4a5e">${esc((u.displayName || u.email || '?')[0])}</div><div class="grow"><div class="primary-text">${esc(u.displayName || '')}</div><div class="secondary-text">${esc(u.email || '')} · ${esc(stTxt)}</div></div><button class="btn sm secondary" id="sync-out">로그아웃</button></div>`
      : `<p class="small muted" style="margin-bottom:10px">같은 구글 계정으로 로그인한 기기끼리 기보함·사활 진도·설정이 자동으로 맞춰져요.</p><button class="btn primary block" id="sync-in">Google로 로그인</button><div class="hint" style="margin-top:8px">${esc(stTxt)}</div>`;
    const bi = $('#sync-in'); if (bi) bi.onclick = () => S.signIn();
    const bo = $('#sync-out'); if (bo) bo.onclick = async () => { const ok = await confirmSheet('로그아웃', '이 기기의 기록은 남아 있어요. 로그아웃할까요?', '로그아웃'); if (ok) S.signOut(); };
  }
  function applyBoardSettings() {
    for (const v of [view, viewerView]) { if (!v) continue; v.setTheme(settings.theme); v.setStoneStyle(settings.stone); v.setCoords(settings.coords); }
  }
  $('#btn-engine-test').onclick = async () => {
    const out = $('#engine-test-result'), btn = $('#btn-engine-test');
    btn.disabled = true; out.textContent = 'AI를 켜는 중…';
    try {
      const t0 = performance.now();
      await ensureKata();
      out.textContent = 'GPU 준비 중 (처음 한 번만 걸려요)…';
      await kata.warmup(19);
      const t1 = performance.now();
      const spec = { size: 19, komi: 6.5, moves: [{ c: BLACK, p: 3 * 19 + 15 }, { c: WHITE, p: 15 * 19 + 3 }], setup: null };
      out.textContent = '계산 속도 재는 중…';
      await kata.evaluate(spec);
      const t2 = performance.now();
      const r = await kata.analyze(spec, { playouts: 24 });
      const t3 = performance.now();
      const gpu = kata.backend === 'webgl';
      out.innerHTML = `<b>${gpu ? '✅ GPU 가속으로 작동 중' : '⚠️ CPU 모드로 작동 중 (느림)'}</b>${!gpu && kata.gpuError ? '<br><span class="muted">GPU 사용 불가 이유: ' + esc(kata.gpuError) + '</span>' : ''}<br>준비 ${((t1 - t0) / 1000).toFixed(1)}초(최초 1회) · 한 번 계산 ${Math.round(t2 - t1)}ms · 24수 읽기 ${((t3 - t2) / 1000).toFixed(1)}초${kata.selfTestErr != null ? ` · 점검 오차 ${kata.selfTestErr.toFixed(4)}` : ''}<br>AI 추천 첫 수: ${Go.coordLabel(r.moves[0].p, 19)}`;
    } catch (err) { out.textContent = '❌ AI를 켜지 못했어요: ' + (err && err.message || err); }
    btn.disabled = false; renderKataStatus();
  };
  $('#sw-coords').onclick = () => { settings.coords = !settings.coords; saveSettings(); applyBoardSettings(); renderSettings(); };
  $('#sw-sound').onclick = () => { settings.sound = !settings.sound; saveSettings(); renderSettings(); if (settings.sound) { ensureAudio(); playStoneSound(false); } };
  $('#sw-eval').onclick = () => { settings.eval = !settings.eval; saveSettings(); renderSettings(); if (game) renderEval(); };
  $$('#seg-confirm button').forEach(b => b.onclick = () => { settings.confirm = b.dataset.v; saveSettings(); renderSettings(); });

  // ───────── 부팅 ─────────
  function boot(hot) {
    const saved = (hot && hot.game) || store.get('current', null);
    if (saved && saved.moves) {
      try {
        game = saved; board = Go.Board.fromMoves(game.size, game.moves, game.setup);
        if (game.handicap && !game.moves.length) board.toPlay = WHITE;
        if (game.status === 'scoring') { scoring = { dead: new Set(game.dead || []), ownership: null, score: null }; scoring.score = Go.territoryScore(board, scoring.dead, game.komi); }
        lastEval = game.evals && game.evals.length ? game.evals[game.evals.length - 1].black : null;
      } catch (_) { game = null; board = null; store.del('current'); }
    }
    const startScreen = (hot && hot.screen) || 'home';
    if (startScreen === 'game' && game) { showScreen('game'); renderGame(); if (game.status === 'scoring') recomputeScore(); if (isBotTurn()) botMove(); }
    else showScreen('home');
    if (window.claude && window.claude.hot && window.claude.hot.snapshot) window.claude.hot.snapshot(() => ({ game, screen }));
    // 워커 미리 띄우기
    try { ensureWorker(); engineCall('ping', {}).catch(() => { }); } catch (_) { }
  }
  if (window.claude && window.claude.hot && window.claude.hot.ready) window.claude.hot.ready(boot);
  else boot((window.claude && window.claude.hot && window.claude.hot.data) || {});

  // 디버그/테스트용 읽기 전용 훅
  window.BadukLab = { get game() { return game; }, get board() { return board; }, get screen() { return screen; }, get thinking() { return botThinking; } };
  // 다른 모듈(리뷰·사활)용 앱 API
  window.BadukApp = {
    kata, ensureKata, settings, store, showScreen, toast, openSheet, closeSheet, confirmSheet, botByLevel, avatarHTML, esc, el, fmtDate, colorName, BOTS,
    getArchive: () => archive, findEntry: id => archive.find(e => e.id === id),
    updateEntry: (id, patch) => { const e = archive.find(x => x.id === id); if (e) { Object.assign(e, patch, { updatedAt: Date.now() }); saveArchive(); } return e; },
    replaceArchive: (list) => { archive = list; store.set('archive', archive); if (screen === 'archive') renderArchive(); if (screen === 'home') renderHome(); if (screen === 'review' && window.Review) window.Review.onShow(); },
    replaceSettings: (obj) => { Object.assign(settings, obj); store.set('settings', settings); applyBoardSettings(); if (screen === 'settings') renderSettings(); if (screen === 'home') renderHome(); },
    deletedIds: () => store.get('deleted', []),
    deleteEntry: id => deleteEntry(id),
    syncChanged: () => { if (screen === 'settings') renderSync(); },
    startGameWith: async (o) => {
      if (game && game.status !== 'ended') { const ok = await confirmSheet('새 대국', '두던 대국이 있어요. 새로 시작하면 지금 대국은 사라져요.', '새로 시작', 'danger'); if (!ok) return; }
      settings.size = o.size || 9; settings.bot = o.bot || 1; settings.color = o.color || BLACK; settings.handicap = o.handicap || 0; saveSettings(); startGame();
    },
    getKataStatus: () => kataStatus, isKataFailed: () => kataFailed,
    get screen() { return screen; },
  };
})();
