#!/usr/bin/env node
/* 레슨 제작용: 수순 분석/자가대국
   node kata-pv.js size "D4 Q16 ..." playouts [selfplayN] [first=b] [B=".."] [W=".."] */
const fs = require('fs');
const KN = require('../kata/katanet.js'), KG = require('../kata/katagame.js'), KS = require('../kata/katasearch.js');
const [,, sizeS, movesS, poS, spS] = process.argv;
const size = +sizeS, LET = 'ABCDEFGHJKLMNOPQRST';
const pt = s => (size - parseInt(s.slice(1), 10)) * size + LET.indexOf(s[0].toUpperCase());
const lab = p => p < 0 ? 'pass' : LET[p % size] + (size - ((p / size) | 0));
const buf = fs.readFileSync(__dirname + '/../models/b10c128.wasm');
const net = new KN.CpuNet(KN.parseKBN(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)));
const ev = KS.makeEvaluator(net, size, KN);
(async () => {
  const setup = (process.env.B || process.env.W) ? { black: (process.env.B || '').split(/\s+/).filter(Boolean).map(pt), white: (process.env.W || '').split(/\s+/).filter(Boolean).map(pt), toPlay: process.env.TO === 'w' ? 2 : 1 } : null;
  let c = setup ? setup.toPlay : (process.env.FIRST === 'w' ? 2 : 1);
  const moves = (movesS || '').split(/\s+/).filter(Boolean).map(s => { const m = { c, p: pt(s) }; c = 3 - c; return m; });
  const g = KG.Game.fromMoves(size, 6.5, moves, setup);
  const n = +(spS || 0), seq = [];
  for (let i = 0; i <= n; i++) {
    const s = new KS.Search(ev, { batchSize: 8 });
    const res = await s.run(g, { maxPlayouts: +poS || 200 });
    if (i === n) {
      console.log((g.toPlay === 1 ? 'B' : 'W') + ' to play. winrate', res.winrate.toFixed(3), 'lead', res.lead.toFixed(1));
      for (const m of res.moves.slice(0, 6)) console.log(lab(m.p).padEnd(5), 'v=' + m.visits, 'lead=' + (m.lead != null ? m.lead.toFixed(1) : '?'), 'pv:', (m.pv || []).map(lab).join(' '));
      break;
    }
    const best = res.moves[0].p; seq.push(lab(best)); g.play(g.locOf(best), g.toPlay);
  }
  if (seq.length) console.log('selfplay:', seq.join(' '));
})();
