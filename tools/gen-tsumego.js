#!/usr/bin/env node
/* 사활 문제 생성기: 귀·변의 눈 모양을 무작위 생성 → 풀이기로 검증 → 난이도 분류 → tsumego-data.js
   사용: node gen-tsumego.js [count] [seed] */
const fs = require('fs');
const T = require('../tsumego.js');
const KB = require('../kata/kataboard.js');
const { BLACK, WHITE, PASS_LOC } = KB;

const SIZE = 9;
const TARGET_COUNT = parseInt(process.argv[2] || '420', 10);
let seed = parseInt(process.argv[3] || '7', 10) >>> 0;
const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
const rint = n => Math.floor(rnd() * n);
const P = (x, y) => y * SIZE + x;
const X = p => p % SIZE, Y = p => (p / SIZE) | 0;
const inb = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE;
const nb4 = p => { const x = X(p), y = Y(p), o = []; if (x > 0) o.push(p - 1); if (x < SIZE - 1) o.push(p + 1); if (y > 0) o.push(p - SIZE); if (y < SIZE - 1) o.push(p + SIZE); return o; };

/** 눈 공간 E 생성: 귀(corner) 또는 변(edge) */
function genEyeSpace(kind) {
  const n = (process.env.MIN_EYE ? parseInt(process.env.MIN_EYE,10) : 2) + rint(process.env.MIN_EYE ? 4 : 8); // 기본 2~9
  let start;
  if (kind === 'corner') start = P(rint(2), rint(2)); else start = P(2 + rint(4), rint(2));
  const E = new Set([start]);
  let tries = 0;
  while (E.size < n && tries++ < 200) {
    const arr = [...E]; const p = arr[rint(arr.length)];
    const cands = nb4(p).filter(q => !E.has(q) && Y(q) <= 3 && X(q) <= 6 && (kind === 'corner' ? true : X(q) >= 1));
    if (!cands.length) continue;
    E.add(cands[rint(cands.length)]);
  }
  return E;
}

function build(kind) {
  const E = genEyeSpace(kind);
  const D = new Set(), A = new Set();
  for (const p of E) for (const q of nb4(p)) if (!E.has(q)) D.add(q);
  // 수비 벽을 연결: 대각으로만 닿은 두 벽돌의 바깥쪽 연결점을 벽에 추가 (안쪽 연결점이 눈 공간이면)
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of [...D]) {
      const x = X(p), y = Y(p);
      for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const qx = x + dx, qy = y + dy; if (!inb(qx, qy)) continue;
        const q = P(qx, qy); if (!D.has(q)) continue;
        const c1 = P(x + dx, y), c2 = P(x, y + dy);
        const in1 = E.has(c1), in2 = E.has(c2);
        if (in1 && !D.has(c2) && !E.has(c2)) { D.add(c2); changed = true; }
        if (in2 && !D.has(c1) && !E.has(c1)) { D.add(c1); changed = true; }
      }
    }
  }
  for (const p of D) for (const q of nb4(p)) if (!E.has(q) && !D.has(q)) A.add(q);
  // 구조가 너무 크면 버림
  for (const p of A) if (Y(p) > 6 || X(p) > 8) return null;
  // 변형: 공격측 돌을 눈 안에 0~2개, 수비측 돌을 눈 안에 0~1개
  const inside = [...E];
  const black = [], white = [];
  const defender = rnd() < 0.5 ? BLACK : WHITE, attacker = 3 - defender;
  const put = (p, c) => (c === BLACK ? black : white).push(p);
  const extraA = rnd() < 0.45 ? 1 + rint(2) : 0, extraD = rnd() < 0.25 ? 1 : 0;
  const usedE = new Set();
  for (let i = 0; i < extraA && inside.length > 2; i++) { const p = inside[rint(inside.length)]; if (usedE.has(p)) continue; usedE.add(p); put(p, attacker); }
  for (let i = 0; i < extraD && inside.length > 3; i++) { const p = inside[rint(inside.length)]; if (usedE.has(p)) continue; usedE.add(p); put(p, defender); }
  for (const p of D) put(p, defender);
  for (const p of A) put(p, attacker);
  // 공격측 바깥 벽을 두텁게: A의 바깥 이웃 중 일부를 추가해 활로 확보 (2번째 고리)
  const ring2 = new Set();
  for (const p of A) for (const q of nb4(p)) if (!E.has(q) && !D.has(q) && !A.has(q)) ring2.add(q);
  for (const p of ring2) if (rnd() < 0.35) put(p, attacker);
  // 실제 판에 놓아 읽어오기 (자살수·따냄 반영) 및 건전성 검사
  const bd = T.Solver.makeBoard({ size: SIZE, black, white });
  const rb = [], rw = [];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) { const c = bd.colors[bd.loc(x, y)]; if (c === BLACK) rb.push(P(x, y)); else if (c === WHITE) rw.push(P(x, y)); }
  const target = [...D].filter(p => bd.colors[bd.loc(X(p), Y(p))] === defender);
  if (target.length !== D.size) return null; // 벽돌이 잡혔으면 버림
  // 공격측 체인은 활로 2개 이상, 수비 벽은 연결 상태(체인 1~2개)
  const heads = new Set();
  for (const p of (attacker === BLACK ? rb : rw)) { const loc = bd.loc(X(p), Y(p)); heads.add(bd.chainHead[loc]); }
  for (const h of heads) if (bd.libs[h] < 2) return null;
  const dheads = new Set(); for (const p of target) dheads.add(bd.chainHead[bd.loc(X(p), Y(p))]);
  if (dheads.size > 2) return null;
  return { size: SIZE, black: rb, white: rw, target, attacker, defender, kind, E: [...E] };
}

function solveBoth(prob, maxNodes) {
  const sK = new T.Solver({ maxNodes });
  const k = sK.solve(Object.assign({}, prob, { toPlay: prob.attacker }), { goal: 'kill', koFavor: prob.defender, maxDepth: 17, regionCap: 13 });
  const sL = new T.Solver({ maxNodes });
  const l = sL.solve(Object.assign({}, prob, { toPlay: prob.defender }), { goal: 'live', koFavor: prob.attacker, maxDepth: 17, regionCap: 13 });
  return { k, l, sK, sL };
}

/** 정답 첫수 집합 (goal 기준) */
function solutionMoves(prob, goal, solver, res) {
  const b = T.Solver.makeBoard(prob);
  const pla = goal === 'kill' ? prob.attacker : prob.defender;
  const out = [];
  const budget = solver.maxNodes; solver.maxNodes = budget * 2;
  for (const m of solver.moves(b, pla)) {
    const rec = b.playMoveRecorded(m, pla);
    let ok = false;
    try { ok = goal === 'kill' ? solver.kill(b, res.depth - 1, prob.defender) : solver.live(b, res.depth - 1, prob.attacker); } catch (_) { }
    b.undo(rec);
    if (ok) out.push(b.y(m) * SIZE + b.x(m));
  }
  return out;
}

function canonical(prob) {
  // 중복 제거용 키: 돌 배치 (색 무관하게 공격/수비로 정규화)
  const map = p => p;
  const a = (prob.attacker === BLACK ? prob.black : prob.white).map(map).sort((x, y) => x - y).join(',');
  const d = (prob.attacker === BLACK ? prob.white : prob.black).map(map).sort((x, y) => x - y).join(',');
  return a + '|' + d;
}

/** 주 수순을 따라가며 이기는 쪽의 '갈림길'(정답수가 2개 이하인 결정) 수를 셈 */
function decisionCount(prob, goal, solver, res) {
  const b = T.Solver.makeBoard(prob);
  const winner = goal === 'kill' ? prob.attacker : prob.defender;
  let pla = prob.toPlay, remaining = res.depth, crit = 0, steps = 0;
  const budget = solver.maxNodes; solver.maxNodes = budget * 3;
  for (const m of res.line) {
    if (pla === winner && remaining >= 2) {
      let wins = 0, cands = 0;
      for (const c of solver.moves(b, pla)) {
        cands++;
        const rec = b.playMoveRecorded(c, pla);
        let ok = false; try { ok = goal === 'kill' ? solver.kill(b, remaining - 1, 3 - pla) : solver.live(b, remaining - 1, 3 - pla); } catch (_) { }
        b.undo(rec);
        if (ok) wins++;
      }
      if (cands >= 3 && wins <= 2) crit++;
      steps++;
    }
    b.playMoveAssumeLegal(m, pla); pla = 3 - pla; remaining--;
  }
  solver.maxNodes = budget;
  return { crit, steps };
}
function difficulty(dec, regionSize, depth, goal) {
  const S = regionSize, C = dec.crit;
  let lv;
  if (S <= 3 && C <= 1 && depth <= 7) lv = 1;
  else if (S <= 4 && C <= 2) lv = 2;
  else if ((S <= 5 && C <= 2) || (S <= 6 && C <= 1)) lv = 3;
  else if (S <= 7 && C <= 3) lv = 4;
  else lv = 5;
  if (goal === 'live' && depth <= 1) lv = 1;
  if (goal === 'live' && depth >= 7 && lv < 4) lv = 4;
  if (goal === 'kill' && depth >= 15 && lv < 4) lv = 4;
  return Math.max(1, Math.min(5, lv));
}

const problems = []; const seen = new Set();
const perLevel = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
const CAP = Math.ceil(TARGET_COUNT / 5) + 10;
let attempts = 0;
const t0 = Date.now();
while (problems.length < TARGET_COUNT && attempts < 40000) {
  attempts++;
  const kind = rnd() < 0.6 ? 'corner' : 'edge';
  const prob = build(kind); if (!prob) continue;
  const key = canonical(prob); if (seen.has(key)) continue; seen.add(key);
  let r;
  try { r = solveBoth(prob, 250000); } catch (e) { continue; }
  const { k, l, sK, sL } = r;
  if (k.result !== 'kill' || l.result !== 'live') continue; // 선수가 결정적인 위치만
  const region = k.regionLocs.length;
  // 두 문제: 공격측 선 잡기 / 수비측 선 살기
  const killSol = solutionMoves(prob, 'kill', sK, k);
  const liveSol = solutionMoves(prob, 'live', sL, l);
  if (!killSol.length || !liveSol.length) continue;
  const b = T.Solver.makeBoard(prob);
  const toPos = loc => loc === PASS_LOC ? -1 : b.y(loc) * SIZE + b.x(loc);
  const base = { size: SIZE, black: prob.black, white: prob.white, target: prob.target, attacker: prob.attacker, kind, region: k.regionLocs.map(toPos) };
  const mk = (goal, res, sols, solver) => {
    const toPlay = goal === 'kill' ? prob.attacker : prob.defender;
    const dec = decisionCount(Object.assign({}, prob, { toPlay }), goal, solver, res);
    const lv = difficulty(dec, region, res.depth, goal);
    return Object.assign({ id: 'g' + (problems.length + 1), goal, toPlay, depth: res.depth, crit: dec.crit, sols, line: res.line.map(toPos), level: lv }, base);
  };
  const pk = mk('kill', k, killSol, sK), pl = mk('live', l, liveSol, sL);
  for (const p of [pk, pl]) {
    if (process.env.ONLY_LEVEL && p.level !== parseInt(process.env.ONLY_LEVEL, 10)) continue;
    if (perLevel[p.level] >= CAP) continue;
    perLevel[p.level]++; p.id = 'g' + (problems.length + 1); problems.push(p);
  }
  if (problems.length % 50 === 0) console.error(`${problems.length} problems, ${attempts} attempts, ${((Date.now() - t0) / 1000).toFixed(0)}s`, JSON.stringify(perLevel));
}
console.error('done', problems.length, 'attempts', attempts, JSON.stringify(perLevel), ((Date.now() - t0) / 1000).toFixed(0) + 's');
const out = 'window.TSUMEGO_PROBLEMS = ' + JSON.stringify(problems) + ';\n';
fs.writeFileSync(process.argv[4] || __dirname + '/../tsumego-data.js', out);
console.error('written', (out.length / 1024).toFixed(0), 'KB');
