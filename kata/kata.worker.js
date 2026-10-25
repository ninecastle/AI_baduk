/* kata.worker.js — CPU 폴백: 워커에서 KataGo 신경망 탐색 실행 */
importScripts('kataboard.js', 'katafeatures.js', 'katagame.js', 'katanet.js', 'katasearch.js');
let model = null, net = null;
const evaluators = new Map();
function evFor(L) { let e = evaluators.get(L); if (!e) { e = KataSearch.makeEvaluator(net, L, KataNet); evaluators.set(L, e); } return e; }
self.onmessage = async (e) => {
  const d = e.data;
  try {
    if (d.type === 'load') { model = KataNet.parseKBN(d.model); net = new KataNet.CpuNet(model); self.postMessage({ id: d.id, ok: true }); return; }
    if (d.type === 'evaluate') {
      const spec = d.spec, L = spec.size, game = KataGame.Game.fromMoves(L, spec.komi, spec.moves, spec.setup);
      const bin = new Float32Array(L * L * KataFeatures.NUM_BIN), glob = new Float32Array(KataFeatures.NUM_GLOBAL);
      KataFeatures.fill(game.position(true), game.toPlay, { isRoot: true, conservativePass: true }, L, bin, glob);
      const out = net.forward(bin, glob, 1, L);
      self.postMessage({ id: d.id, result: KataNet.postprocess(out, 0, game.legalMask(), L) });
      return;
    }
    if (d.type === 'analyze') {
      const spec = d.spec, game = KataGame.Game.fromMoves(spec.size, spec.komi, spec.moves, spec.setup);
      const search = new KataSearch.Search(evFor(spec.size), { batchSize: 4 });
      const res = await search.run(game, { maxPlayouts: d.playouts, maxTimeMs: d.timeMs || 1e9, onProgress: (done, total) => self.postMessage({ type: 'progress', done, total }) });
      self.postMessage({ id: d.id, result: res });
      return;
    }
    self.postMessage({ id: d.id, error: 'unknown ' + d.type });
  } catch (err) { self.postMessage({ id: d.id, error: String(err && err.stack || err) }); }
};
