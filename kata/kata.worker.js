/* kata.worker.js — CPU 폴백: 워커에서 KataGo 신경망 탐색 실행 */
importScripts('kataboard.js', 'katafeatures.js', 'katagame.js', 'katanet.js', 'katasearch.js');
let model = null, net = null;
const evaluators = new Map();
const reuse = new Map();
const movesSig = spec => spec.size + '|' + spec.moves.map(m => m.c + ':' + m.p).join(',');
function searchLimits(game, spec, d) {
  const lim = { maxPlayouts: d.playouts, earlyStop: d.earlyStop };
  if (d.reuseKey) {
    const prev = reuse.get(d.reuseKey);
    if (prev && spec.moves.length) {
      const last = spec.moves[spec.moves.length - 1];
      if (prev.sig === movesSig({ size: spec.size, moves: spec.moves.slice(0, -1) })) lim.reuseRoot = prev.search.childFor(game.locOf(last.p));
    }
    reuse.delete(d.reuseKey);
  }
  if (d.reviewStop) lim.reviewStop = { min: d.reviewStop.min, played: d.reviewStop.played == null ? null : game.locOf(d.reviewStop.played) };
  return lim;
}
function evFor(L) { let e = evaluators.get(L); if (!e) { e = KataSearch.makeEvaluator(net, L, KataNet); evaluators.set(L, e); } return e; }
self.onmessage = async (e) => {
  const d = e.data;
  try {
    if (d.type === 'load') { model = KataNet.parseKBN(d.model); net = new KataNet.CpuNet(model); self.postMessage({ id: d.id, ok: true }); return; }
    if (d.type === 'evaluate') {
      const spec = d.spec, L = spec.size, game = KataGame.Game.fromMoves(L, spec.komi, spec.moves, spec.setup);
      const bin = new Float32Array(L * L * KataFeatures.NUM_BIN), glob = new Float32Array(KataFeatures.NUM_GLOBAL);
      KataFeatures.fill(game.position(true), game.toPlay, { isRoot: true, conservativePass: true }, L, bin, glob);
      const [r] = await evFor(L).evaluate([{ bin, glob, legal: game.legalMask(), allSym: true }]);
      self.postMessage({ id: d.id, result: r });
      return;
    }
    if (d.type === 'analyze') {
      const spec = d.spec, game = KataGame.Game.fromMoves(spec.size, spec.komi, spec.moves, spec.setup);
      const search = new KataSearch.Search(evFor(spec.size), { batchSize: d.batchSize || Math.max(1, Math.min(4, Math.round(d.playouts / 8))) });
      const lim = searchLimits(game, spec, d);
      const res = await search.run(game, Object.assign(lim, { maxTimeMs: d.timeMs || 1e9, onProgress: (done, total) => self.postMessage({ type: 'progress', id: d.id, done, total }) }));
      if (d.reuseKey) reuse.set(d.reuseKey, { sig: movesSig(spec), search });
      self.postMessage({ id: d.id, result: res });
      return;
    }
    self.postMessage({ id: d.id, error: 'unknown ' + d.type });
  } catch (err) { self.postMessage({ id: d.id, error: String(err && err.stack || err) }); }
};
