/* kataengine.js — 앱용 KataGo 엔진 래퍼: TF.js(WebGL) 우선, 실패 시 CPU 워커 폴백 */
(function (root) {
  'use strict';
  const TF_URLS = [
    'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/tensorflow/4.22.0/tf.min.js',
    'https://unpkg.com/@tensorflow/tfjs@4.22.0/dist/tf.min.js',
  ];
  // 빈 19줄 판 기준값 (KataGo 원본과 대조한 CPU 참조 출력): 자가 점검용
  const SELFTEST = { size: 19, winrateBlack: 0.4587, lead: -1.17, top: { 'D4': 0.137, 'Q4': 0.129, 'Q16': 0.122 } };

  function loadScript(url) {
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = url; s.async = true; s.onload = () => res(url); s.onerror = () => rej(new Error('load fail ' + url)); document.head.appendChild(s); });
  }
  async function loadTf() {
    if (root.tf) return root.tf;
    for (const u of TF_URLS) { try { await loadScript(u); if (root.tf) return root.tf; } catch (_) { } }
    throw new Error('TF.js 로드 실패');
  }

  class KataEngine {
    constructor(opts) {
      this.modelUrl = (opts && opts.modelUrl) || 'models/b10c128.wasm';
      this.onStatus = (opts && opts.onStatus) || (() => { });
      this.model = null; this.net = null; this.backend = null; // 'webgl' | 'cpu-worker'
      this.evaluators = new Map();
      this.worker = null; this.pending = null; this.reqId = 0;
      this.ready = null;
      this.busy = false;
    }
    init() {
      if (!this.ready) this.ready = this._init().catch(err => { this.ready = null; throw err; });
      return this.ready;
    }
    async _init() {
      this.onStatus({ phase: 'model', text: 'AI 신경망 내려받는 중…', progress: 0 });
      const buf = await this._fetchModel();
      this.model = KataNet.parseKBN(buf);
      this.modelBuffer = buf;
      let ok = false;
      try {
        this.onStatus({ phase: 'tf', text: 'AI 가속 엔진 준비 중…' });
        const tf = await loadTf();
        try { await tf.setBackend('webgl'); } catch (_) { }
        await tf.ready();
        if (tf.getBackend() !== 'webgl') throw new Error('webgl backend unavailable: ' + tf.getBackend());
        this.tf = tf;
        this.net = new KataNet.TfNet(this.model, tf);
        ok = await this._selfTest();
        if (!ok) { this.net.dispose(); this.net = null; }
      } catch (err) { console.warn('TF.js 실패, CPU 폴백:', err); this.gpuError = String(err && err.message || err); ok = false; }
      if (ok) this.backend = 'webgl';
      else {
        this.onStatus({ phase: 'cpu', text: 'AI를 CPU 모드로 준비 중…' });
        await this._startWorker();
        this.backend = 'cpu-worker';
      }
      this.onStatus({ phase: 'ready', text: this.backend === 'webgl' ? 'AI 준비 완료 (GPU 가속)' : 'AI 준비 완료 (CPU 모드, 느림)' , backend: this.backend });
      return this.backend;
    }
    async _fetchModel() {
      const res = await fetch(this.modelUrl);
      if (!res.ok) throw new Error('모델 파일을 받지 못했어요 (' + res.status + ')');
      const total = +res.headers.get('content-length') || 0;
      if (!res.body || !total) return await res.arrayBuffer();
      const reader = res.body.getReader(); const chunks = []; let got = 0;
      while (true) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); got += value.length; this.onStatus({ phase: 'model', text: `AI 신경망 내려받는 중… ${Math.round(got / total * 100)}%`, progress: got / total }); }
      const out = new Uint8Array(got); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; }
      return out.buffer;
    }
    async _selfTest() {
      // 두 번 계산해서 두 번째 결과로 판정 (가중치가 첫 계산 뒤에도 살아있는지까지 확인)
      await this._selfTestOnce();
      return await this._selfTestOnce();
    }
    async _selfTestOnce() {
      const L = SELFTEST.size;
      const g = new KataGame.Game(L, 7.5);
      const bin = new Float32Array(L * L * KataFeatures.NUM_BIN), glob = new Float32Array(KataFeatures.NUM_GLOBAL);
      KataFeatures.fill(g.position(false), g.toPlay, { isRoot: true, conservativePass: true }, L, bin, glob);
      const out = await this.net.forward(bin, glob, 1, L);
      const r = KataNet.postprocess(out, 0, g.legalMask(), L);
      const L19 = 'ABCDEFGHJKLMNOPQRST';
      let maxErr = Math.abs(r.winrate - SELFTEST.winrateBlack) + Math.abs(r.lead - SELFTEST.lead) * 0.05;
      for (const k in SELFTEST.top) { const x = L19.indexOf(k[0]), y = L - parseInt(k.slice(1), 10); maxErr = Math.max(maxErr, Math.abs(r.policy[y * L + x] - SELFTEST.top[k])); }
      console.log('KataGo self-test: winrate', r.winrate.toFixed(4), 'lead', r.lead.toFixed(2), 'maxErr', maxErr.toFixed(4));
      this.selfTestErr = maxErr;
      return maxErr < 0.06 && isFinite(maxErr);
    }
    async _startWorker() {
      this.worker = new Worker('kata/kata.worker.js');
      this.worker.onmessage = e => { const d = e.data; if (d.type === 'progress') { if (this.progressCb) this.progressCb(d.done, d.total); return; } if (this.pending && this.pending.id === d.id) { const p = this.pending; this.pending = null; d.error ? p.reject(new Error(d.error)) : p.resolve(d); } };
      const buf = this.modelBuffer.slice(0);
      await this._workerCall('load', { model: buf }, [buf]);
    }
    _workerCall(type, payload, transfer) {
      return new Promise((resolve, reject) => { const id = ++this.reqId; this.pending = { id, resolve, reject }; this.worker.postMessage(Object.assign({ id, type }, payload), transfer || []); });
    }
    evaluatorFor(size) {
      let ev = this.evaluators.get(size);
      if (!ev) { ev = KataSearch.makeEvaluator(this.net, size, KataNet); ev.padTo = 8; this.evaluators.set(size, ev); }
      return ev;
    }
    gameFromSpec(spec) { return KataGame.Game.fromMoves(spec.size, spec.komi, spec.moves, spec.setup); }

    /** GPU 계산이 실패하면 CPU 워커로 바꿔서 한 번 더 시도 */
    async _withFallback(fn) {
      try { return await fn(); }
      catch (err) {
        if (this.backend !== 'webgl' || (err && /cancel/.test(err.message))) throw err;
        console.warn('GPU 계산 실패, CPU로 전환:', err);
        try { this.net && this.net.dispose(); } catch (_) { }
        this.net = null; this.evaluators.clear();
        this.onStatus({ phase: 'cpu', text: 'AI를 CPU 모드로 다시 준비 중…' });
        await this._startWorker();
        this.backend = 'cpu-worker';
        this.onStatus({ phase: 'ready', text: 'AI 준비 완료 (CPU 모드, 느림)', backend: this.backend });
        return await fn();
      }
    }
    async analyze(spec, opts) { await this.init(); try { await this.warmup(spec.size); } catch (_) { } return this._withFallback(() => this._analyze(spec, opts)); }
    async evaluate(spec) { await this.init(); try { await this.warmup(spec.size); } catch (_) { } return this._withFallback(() => this._evaluate(spec)); }
    /** 분석: 위치의 탐색 결과 */
    async _analyze(spec, opts) {
      opts = opts || {};
      if (this.backend === 'cpu-worker') {
        this.progressCb = opts.onProgress;
        const r = await this._workerCall('analyze', { spec, playouts: opts.playouts || 50, timeMs: opts.timeMs || 0, batchSize: opts.batchSize, earlyStop: opts.earlyStop });
        return r.result;
      }
      const game = this.gameFromSpec(spec);
      const search = new KataSearch.Search(this.evaluatorFor(spec.size), { batchSize: opts.batchSize || Math.max(1, Math.min(8, Math.round((opts.playouts || 50) / 8))) });
      this.current = search;
      const res = await search.run(game, { maxPlayouts: opts.playouts || 50, maxTimeMs: opts.timeMs || 1e9, earlyStop: opts.earlyStop, onProgress: opts.onProgress, yield: () => new Promise(r => setTimeout(r, 0)) });
      this.current = null;
      return res;
    }
    cancel() { if (this.current) this.current.cancel(); }
    /** 판 크기별 GPU 준비(묶음 1, 8)를 미리 해둠. 이미 했으면 바로 끝 */
    async warmup(size) {
      await this.init();
      if (this.backend !== 'webgl') return;
      this.warmed = this.warmed || {};
      if (this.warmed[size]) return this.warmed[size];
      const L = size, FS = KataFeatures.NUM_BIN, G = KataFeatures.NUM_GLOBAL;
      this.warmed[size] = (async () => {
        for (const N of [1, 8]) await this.net.forward(new Float32Array(N * L * L * FS), new Float32Array(N * G), N, L);
      })();
      return this.warmed[size];
    }

    /** 신경망 한 번 평가 (정책·승률) */
    async _evaluate(spec) {
      if (this.backend === 'cpu-worker') { const r = await this._workerCall('evaluate', { spec }); return r.result; }
      const game = this.gameFromSpec(spec), L = spec.size;
      const bin = new Float32Array(L * L * KataFeatures.NUM_BIN), glob = new Float32Array(KataFeatures.NUM_GLOBAL);
      KataFeatures.fill(game.position(true), game.toPlay, { isRoot: true, conservativePass: true }, L, bin, glob);
      // 판을 8방향으로 돌려 평가한 평균 (대칭인 수는 같은 점수)
      const [r] = await this.evaluatorFor(L).evaluate([{ bin, glob, legal: game.legalMask(), allSym: true }]);
      return r;
    }
  }

  root.KataEngine = KataEngine;
})(window);
