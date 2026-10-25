#!/usr/bin/env node
/* 레슨 데이터 검증: 좌표·합법성·수순·정답(사활 풀이기로 확인)·따냄 개수
   사용: node check-learn.js [lessonId...]  (없으면 전체) */
const fs = require('fs');
const Go = require('../go.js');
const T = require('../tsumego.js');
const window = {};
eval(fs.readFileSync(__dirname + '/../learn-data.js', 'utf8'));
const PARTS = window.LEARN_PARTS, LESSONS = window.LEARN_LESSONS;
const { BLACK, WHITE, EMPTY, PASS } = Go;
const LET = 'ABCDEFGHJKLMNOPQRST';
function pt(s, size) { s = s.trim().toUpperCase(); if (s === 'PASS') return PASS; const x = LET.indexOf(s[0]), n = parseInt(s.slice(1), 10); if (x < 0 || x >= size || !(n >= 1 && n <= size)) throw new Error('bad coord ' + s); return (size - n) * size + x; }
function pts(str, size) { const out = []; for (const tok of (str || '').split(/[\s,]+/).filter(Boolean)) { if (tok.includes('-')) { const [a, b] = tok.split('-'); const p = pt(a, size), q = pt(b, size); const x0 = Math.min(p % size, q % size), x1 = Math.max(p % size, q % size), y0 = Math.min((p / size) | 0, (q / size) | 0), y1 = Math.max((p / size) | 0, (q / size) | 0); for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push(y * size + x); } else out.push(pt(tok, size)); } return out; }
const col = c => c === 'w' ? WHITE : BLACK;
function setup(step) {
  const size = step.size || 9, b = new Go.Board(size);
  const bl = pts(step.b, size), wh = pts(step.w, size);
  for (const p of bl) { if (b.stones[p]) throw new Error('dup ' + Go.coordLabel(p, size)); b.stones[p] = BLACK; }
  for (const p of wh) { if (b.stones[p]) throw new Error('dup ' + Go.coordLabel(p, size)); b.stones[p] = WHITE; }
  // 활로 없는 돌 확인
  for (const g of b.groups()) if (g.libs.length === 0) throw new Error('group without liberties at ' + Go.coordLabel(g.stones[0], size));
  return b;
}
function ascii(b, marks) {
  const n = b.size; let s = '';
  for (let y = 0; y < n; y++) { s += String(n - y).padStart(2) + ' '; for (let x = 0; x < n; x++) { const p = y * n + x; s += (marks && marks.has(p)) ? '* ' : b.stones[p] === BLACK ? 'X ' : b.stones[p] === WHITE ? 'O ' : '. '; } s += '\n'; }
  return s + '   ' + LET.slice(0, n).split('').join(' ') + '\n';
}
function playSeq(b, seq, first, label) {
  let c = first; const caps = [];
  for (const p of seq) {
    if (p === PASS) { c = 3 - c; caps.push(0); continue; }
    const chk = b.check(p, c);
    if (!chk.ok) throw new Error(`${label}: illegal ${c === BLACK ? 'B' : 'W'} ${Go.coordLabel(p, b.size)} (${chk.reason})`);
    caps.push(b.play(p, c).captured.length); c = 3 - c;
  }
  return caps;
}
/** 정답 검증: 사활 풀이기로 kill/live 확인 */
function solverCheck(step, b, size) {
  const v = step.verify; if (!v) return null;
  const toPlay = col(step.toPlay || 'b');
  const target = pts(v.target, size);
  const attacker = v.goal === 'kill' ? toPlay : 3 - toPlay;
  const prob = { size, black: [], white: [], target, attacker, toPlay, goal: v.goal };
  for (let p = 0; p < size * size; p++) { if (b.stones[p] === BLACK) prob.black.push(p); else if (b.stones[p] === WHITE) prob.white.push(p); }
  const region = v.region ? pts(v.region, size) : null;
  const kb = T.Solver.makeBoard(prob);
  const s = new T.Solver({ maxNodes: 3000000 });
  s.attacker = attacker; s.defender = 3 - attacker; s.targetLocs = target.map(p => kb.loc(p % size, (p / size) | 0)); s.koFavor = v.goal === 'kill' ? s.defender : s.attacker;
  s.cands = (region || T.Solver.region(kb, s.targetLocs, attacker, 16) || []).map(p => typeof p === 'number' && region ? kb.loc(p % size, (p / size) | 0) : p);
  s.tt = new Map(); s.bestKill = new Map(); s.bestLive = new Map();
  const depth = v.depth || 9, wins = [];
  for (const m of s.moves(kb, toPlay)) {
    const r = kb.playMoveRecorded(m, toPlay);
    let ok = false;
    for (let d = 0; d <= depth && ok !== true; d++) {
      s.tt = new Map(); s.nodes = 0;
      try { ok = v.goal === 'kill' ? s.kill(kb, d, 3 - toPlay) : s.live(kb, d, 3 - toPlay); } catch (e) { ok = 'budget'; break; }
    }
    kb.undo(r);
    if (ok === 'budget') console.log('  (budget hit for', Go.coordLabel(kb.y(m) * size + kb.x(m), size) + ')');
    if (ok === true) wins.push(kb.y(m) * size + kb.x(m));
  }
  return wins;
}
let errors = 0, checked = 0;
const only = process.argv.slice(2);
const ids = new Set();
for (const l of LESSONS) {
  if (ids.has(l.id)) { console.log('DUP lesson id', l.id); errors++; } ids.add(l.id);
  if (!PARTS.find(p => p.id === l.part)) { console.log('no part', l.id); errors++; }
  if (only.length && !only.includes(l.id)) continue;
  l.steps.forEach((step, i) => {
    const tag = `${l.id}#${i + 1}(${step.type})`;
    try {
      const size = step.size || 9;
      const hasBoard = !!(step.b || step.w || step.moves) || ['show', 'play', 'ai'].includes(step.type);
      if (!hasBoard) return;
      const b = setup(step);
      checked++;
      if (step.marks) for (const k of ['tri', 'circ', 'sq', 'x', 'dot']) if (step.marks[k]) pts(step.marks[k], size);
      if (step.terr) { pts(step.terr.b, size); pts(step.terr.w, size); }
      if (step.type === 'show' && step.moves) {
        const seq = pts(step.moves, size);
        const caps = playSeq(b.clone(), seq, col(step.first || 'b'), tag);
        if (step.expectCaps) for (const k in step.expectCaps) if (caps[+k - 1] !== step.expectCaps[k]) throw new Error(`${tag}: move ${k} captured ${caps[+k - 1]}, expected ${step.expectCaps[k]}`);
        if (step.notes) for (const k in step.notes) { if (+k > seq.length) throw new Error(`${tag}: note at ${k} beyond moves`); const n = step.notes[k]; if (n.marks) for (const kk of ['tri', 'circ', 'sq', 'x', 'dot']) if (n.marks[kk]) pts(n.marks[kk], size); if (n.terr) { pts(n.terr.b, size); pts(n.terr.w, size); } }
        if (process.env.SHOW) console.log(tag + ' caps=' + caps.join(',') + '\n' + ascii((() => { const bb = b.clone(); playSeq(bb, seq, col(step.first || 'b'), tag); return bb; })()));
      }
      if (step.type === 'play') {
        const ans = pts(step.answer, size), c = col(step.toPlay || 'b');
        for (const a of ans) { const chk = b.check(a, c); if (!chk.ok) throw new Error(`${tag}: answer ${Go.coordLabel(a, size)} illegal (${chk.reason})`); }
        if (step.then) { const bb = b.clone(); playSeq(bb, [ans[0]].concat(pts(step.then, size)), c, tag + ' then'); }
        if (step.refute) for (const k in step.refute) { const bb = b.clone(); playSeq(bb, [pt(k, size)].concat(pts(step.refute[k], size)), c, tag + ' refute ' + k); }
        if (step.no) for (const k in step.no) pts(k, size);
        const wins = solverCheck(step, b, size);
        if (wins) {
          const a = new Set(ans), w = new Set(wins);
          const missing = wins.filter(p => !a.has(p)), wrong = ans.filter(p => !w.has(p));
          if (missing.length || wrong.length) throw new Error(`${tag}: solver winning moves [${wins.map(p => Go.coordLabel(p, size))}] vs answer [${ans.map(p => Go.coordLabel(p, size))}]`);
        }
        if (process.env.SHOW) console.log(tag + ' answer=' + ans.map(p => Go.coordLabel(p, size)) + (wins ? ' solver=' + wins.map(p => Go.coordLabel(p, size)) : '') + '\n' + ascii(b, new Set(ans)));
      }
      if (step.type === 'quiz' && (step.answer == null || step.answer >= step.options.length)) throw new Error(tag + ': bad quiz answer');
      if (step.type === 'ai') { const c = col(step.toPlay || 'b'); if (step.answer) for (const a of pts(step.answer, size)) if (!b.check(a, c).ok) throw new Error(tag + ': ai answer illegal'); if (process.env.SHOW) console.log(tag + '\n' + ascii(b)); }
    } catch (e) { console.log('ERR', e.message); errors++; }
  });
}
console.log(`lessons ${LESSONS.length}, boards checked ${checked}, errors ${errors}`);
process.exitCode = errors ? 1 : 0;
