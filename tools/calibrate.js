#!/usr/bin/env node
/* 봇 단계 간 실력 측정: 같은 신경망으로 단계 A vs B 대국 → 승률 → Elo 차이
   사용: node calibrate.js size levelA levelB games [seed] */
const fs = require('fs');
const KN = require('../kata/katanet.js');
const KG = require('../kata/katagame.js');
const KF = require('../kata/katafeatures.js');
const KS = require('../kata/katasearch.js');
const [,, sizeS, aS, bS, gS, seedS] = process.argv;
const size = +sizeS, LA = aS, LB = bS, games = +gS;
let seed = +(seedS || 1) >>> 0; const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
const LEVELS = JSON.parse(fs.readFileSync(__dirname + '/levels.json', 'utf8'));
const buf = fs.readFileSync(__dirname + '/../models/b10c128.wasm');
const net = new KN.CpuNet(KN.parseKBN(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)));
const ev = KS.makeEvaluator(net, size, KN);

function sampleTemp(probs, temp, exclude) {
  const idx = []; for (let i = 0; i < probs.length; i++) if (probs[i] > 0 && !(exclude && exclude(i))) idx.push(i);
  if (!idx.length) return -1;
  if (temp < 0.05) { let b = idx[0]; for (const i of idx) if (probs[i] > probs[b]) b = i; return b; }
  let mx = -Infinity; for (const i of idx) mx = Math.max(mx, Math.log(probs[i]) / temp);
  const w = idx.map(i => Math.exp(Math.log(probs[i]) / temp - mx)); const s = w.reduce((a, b) => a + b, 0);
  let r = rnd() * s; for (let k = 0; k < idx.length; k++) { r -= w[k]; if (r <= 0) return idx[k]; }
  return idx[idx.length - 1];
}
async function genmove(game, lv) {
  const L = size, P = L * L, late = game.moves.length >= L * L * 0.3;
  if (lv.playouts) {
    const s = new KS.Search(ev, { batchSize: lv.batch || Math.max(1, Math.min(8, Math.round(lv.playouts / 8))) });
    const res = await s.run(game, { maxPlayouts: lv.playouts });
    const visits = new Float32Array(P + 1); for (const m of res.moves) visits[m.p < 0 ? P : m.p] = m.visits;
    let pick = lv.temp ? sampleTemp(visits, lv.temp) : -1; if (pick < 0) pick = res.moves[0].p < 0 ? P : res.moves[0].p;
    return { p: pick === P ? -1 : pick, wr: res.winrate, lead: res.lead };
  }
  const bin = new Float32Array(L * L * KF.NUM_BIN), glob = new Float32Array(KF.NUM_GLOBAL);
  KF.fill(game.position(true), game.toPlay, { isRoot: true, conservativePass: true }, L, bin, glob);
  const r = KN.postprocess(net.forward(bin, glob, 1, L), 0, game.legalMask(), L);
  const probs = r.policy;
  if (lv.rnd && rnd() < lv.rnd && game.moves.length > 2) { const c = []; for (let i = 0; i < P; i++) if (probs[i] > 0.0005) c.push(i); if (c.length) return { p: c[(rnd() * c.length) | 0], wr: r.winrate, lead: r.lead }; }
  let bi = 0; for (let i = 1; i <= P; i++) if (probs[i] > probs[bi]) bi = i;
  if (bi === P) return { p: -1, wr: r.winrate, lead: r.lead };
  const pick = sampleTemp(probs, lv.temp, i => i === P && !late);
  return { p: pick < 0 || pick === P ? -1 : pick, wr: r.winrate, lead: r.lead };
}
(async () => {
  let winsA = 0; const t0 = Date.now();
  for (let g = 0; g < games; g++) {
    const aBlack = g % 2 === 0;
    const game = new KG.Game(size, 6.5);
    let result = null; const passes = { A: 0, B: 0 }; let how = 'count';
    for (let n = 0; n < size * size * 1.4; n++) {
      const blackToPlay = game.toPlay === 1;
      const lv = (blackToPlay === aBlack) ? LEVELS[LA] : LEVELS[LB];
      const mv = await genmove(game, lv);
      // 기권: 한쪽이 크게 지면 종료
      if (n > size * size * 0.25 && mv.wr < 0.03 && mv.lead < -15) { result = blackToPlay ? 'W' : 'B'; how = 'resign'; break; }
      if (mv.p < 0) passes[(blackToPlay === aBlack) ? 'A' : 'B']++;
      game.play(game.locOf(mv.p), game.toPlay);
      if (game.consecutivePasses >= 2) break;
    }
    if (!result) { // 신경망 형세로 판정
      const bin = new Float32Array(size * size * KF.NUM_BIN), glob = new Float32Array(KF.NUM_GLOBAL);
      KF.fill(game.position(true), game.toPlay, { isRoot: true, conservativePass: true }, size, bin, glob);
      const r = KN.postprocess(net.forward(bin, glob, 1, size), 0, game.legalMask(), size);
      const blackLead = game.toPlay === 1 ? r.lead : -r.lead;
      result = blackLead > 0 ? 'B' : 'W';
    }
    const aWon = (result === 'B') === aBlack; if (aWon) winsA++;
    console.error(`game ${g + 1}: A(${LA}) ${aBlack ? 'B' : 'W'} ${aWon ? 'won' : 'lost'} moves=${game.moves.length} ${how} passA=${passes.A} passB=${passes.B} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  const p = (winsA + 0.5) / (games + 1);
  const elo = -400 * Math.log10(1 / p - 1);
  console.log(JSON.stringify({ size, A: LA, B: LB, games, winsA, eloA_minus_B: Math.round(elo) }));
})();
