/* katasearch.js — 신경망 기반 몬테카를로 트리 탐색 (PUCT), 배치 평가, 가상손실
   evaluator: { L, evaluate(items:[{bin,glob,legal}]) → Promise<[{policy,winrate,lead,ownership,...}]> } */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./kataboard.js'), require('./katafeatures.js'), require('./katagame.js'));
  else root.KataSearch = factory(root.KataBoard, root.KataFeatures, root.KataGame);
})(typeof self !== 'undefined' ? self : this, function (KB, KF, KG) {
  'use strict';
  const { EMPTY, BLACK, WHITE, NULL_LOC, PASS_LOC, getOpp } = KB;
  const now = (typeof performance !== 'undefined' && performance.now) ? () => performance.now() : () => Date.now();

  class Node {
    constructor(prior) {
      this.prior = prior; this.visits = 0; this.valueSum = 0; this.winSum = 0; this.leadSum = 0;
      this.children = null; // [{move(loc), node}]
      this.nn = null;       // 리프 평가 결과
      this.terminal = null; // {utility, win, lead}
    }
    get q() { return this.visits > 0 ? this.valueSum / this.visits : 0; }
  }

  const DEFAULTS = { cpuct: 1.1, fpu: 0.25, rootFpu: 0.15, scoreUtil: 0.3, batchSize: 8, virtualLoss: 1.0, maxDepth: 300 };

  class Search {
    constructor(evaluator, opts) {
      this.ev = evaluator; this.opt = Object.assign({}, DEFAULTS, opts || {});
      this.L = evaluator.L;
      this.bin = new Float32Array(this.L * this.L * KF.NUM_BIN);
      this.glob = new Float32Array(KF.NUM_GLOBAL);
      this.cancelled = false;
    }
    cancel() { this.cancelled = true; }

    scoreUtility(lead, size) { return this.opt.scoreUtil * (2 / Math.PI) * Math.atan(lead / (Math.sqrt(size * size) / 2)); }

    /** 리프 위치 재구성: 루트 게임 복제 후 경로 착수 */
    makeLeaf(rootGame, path) {
      const board = rootGame.board.clone();
      const moves = rootGame.moves.slice(Math.max(0, rootGame.moves.length - 7));
      let prev1 = rootGame.boards.length >= 1 ? rootGame.boards[rootGame.boards.length - 1] : null;
      let prev2 = rootGame.boards.length >= 2 ? rootGame.boards[rootGame.boards.length - 2] : null;
      let pla = rootGame.toPlay, passes = rootGame.consecutivePasses;
      const pathHashes = [];
      for (const loc of path) {
        prev2 = prev1; prev1 = board.clone();
        board.playMoveAssumeLegal(loc, pla);
        moves.push({ loc, pla });
        pathHashes.push(board.hashKey());
        passes = loc === PASS_LOC ? passes + 1 : 0;
        pla = getOpp(pla);
      }
      return { board, prev1, prev2, moves, komi: rootGame.komi, pla, passes, pathHashes };
    }

    isLegalAt(leaf, rootGame, loc) {
      const b = leaf.board;
      if (loc === PASS_LOC) return true;
      if (!b.isLegal(loc, leaf.pla)) return false;
      const h = b.posHashAfterMove(loc, leaf.pla), key = h[0] + ':' + h[1];
      if (rootGame.hashes.has(key)) return false;
      for (const ph of leaf.pathHashes) if (ph === key) return false;
      return true;
    }

    legalMask(leaf, rootGame) {
      const L = this.L, out = new Uint8Array(L * L + 1), b = leaf.board;
      for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) out[y * L + x] = this.isLegalAt(leaf, rootGame, b.loc(x, y)) ? 1 : 0;
      out[L * L] = 1;
      return out;
    }

    /** 종국(연속 패스 2회) 평가: 영역 계가 */
    terminalValue(leaf) {
      const b = leaf.board, L = this.L, area = new Uint8Array(b.M);
      b.calculateArea(area, true, true, true, false);
      let black = 0, white = 0;
      for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) { const a = area[b.loc(x, y)]; if (a === BLACK) black++; else if (a === WHITE) white++; }
      const whiteLead = white - black + leaf.komi;
      const lead = leaf.pla === WHITE ? whiteLead : -whiteLead;
      const win = lead > 0 ? 1 : lead < 0 ? 0 : 0.5;
      return { win, lead, utility: (2 * win - 1) + this.scoreUtility(lead, L) };
    }

    async run(rootGame, limits) {
      const t0 = now();
      const maxPlayouts = limits.maxPlayouts || 100, maxMs = limits.maxTimeMs || 1e9;
      const B = Math.max(1, Math.min(this.opt.batchSize, maxPlayouts));
      this.cancelled = false;
      const L = this.L;
      const rootNode = new Node(1);
      this.rootGame = rootGame;
      this.ownSum = new Float32Array(L * L); this.ownN = 0;
      let playouts = 0;
      while (playouts < maxPlayouts && !this.cancelled && (now() - t0) < maxMs) {
        const batch = [];
        for (let k = 0; k < B && playouts + batch.length < maxPlayouts; k++) {
          const sel = this.select(rootNode, rootGame);
          if (!sel) break;
          if (sel.terminalDone) { playouts++; continue; }
          batch.push(sel);
          if (sel.node === rootNode && batch.length === 1 && playouts === 0) break; // 루트 먼저 단독 평가
        }
        if (!batch.length) { if (playouts >= maxPlayouts) break; continue; }
        const items = batch.map(s => s.item);
        const results = await this.ev.evaluate(items);
        for (let i = 0; i < batch.length; i++) {
          const s = batch[i], r = results[i];
          this.expand(s.node, r, s.leaf, s.item.legal);
          const u = (2 * r.winrate - 1) + this.scoreUtility(r.lead, L);
          this.backprop(s.path, u, r.winrate, r.lead, true);
          // 소유권 누적 (흑 기준)
          const sign = s.leaf.pla === BLACK ? 1 : -1;
          for (let p = 0; p < L * L; p++) this.ownSum[p] += sign * r.ownership[p];
          this.ownN++;
          playouts++;
        }
        if (limits.onProgress) limits.onProgress(playouts, maxPlayouts);
        if (limits.yield) await limits.yield();
      }
      return this.report(rootNode, rootGame, playouts, now() - t0);
    }

    select(rootNode, rootGame) {
      const path = [rootNode], moves = [];
      let node = rootNode, depth = 0;
      const vl = this.opt.virtualLoss;
      rootNode.visits += 1; rootNode.valueSum += vl;
      while (true) {
        if (!node.children) break; // 미확장 리프
        if (node.terminal) break;
        const n = node.children.length;
        if (n === 0) break;
        const sqrtN = Math.sqrt(node.visits + 1);
        const fpuRed = node === rootNode ? this.opt.rootFpu : this.opt.fpu;
        const parentQ = node.visits > 0 ? node.valueSum / node.visits - fpuRed : 0;
        let best = -Infinity, bi = 0;
        for (let i = 0; i < n; i++) {
          const ch = node.children[i], c = ch.node;
          const q = c.visits > 0 ? -c.valueSum / c.visits : parentQ;
          const s = q + this.opt.cpuct * ch.prior * sqrtN / (1 + c.visits);
          if (s > best) { best = s; bi = i; }
        }
        const ch = node.children[bi];
        path.push(ch.node); moves.push(ch.move);
        ch.node.visits += 1; ch.node.valueSum += vl; // 가상손실
        node = ch.node; depth++;
        if (depth >= this.opt.maxDepth) break;
      }
      // 노드가 이미 평가 대기중(가상손실만 있는 미확장 노드)이면 그대로 진행 (중복 평가 허용)
      const leaf = this.makeLeaf(rootGame, moves);
      if (node.terminal) { this.backprop(path, node.terminal.utility, node.terminal.win, node.terminal.lead, true); return { terminalDone: true }; }
      if (leaf.passes >= 2 && moves.length > 0) {
        node.terminal = this.terminalValue(leaf);
        node.children = [];
        this.backprop(path, node.terminal.utility, node.terminal.win, node.terminal.lead, true);
        return { terminalDone: true };
      }
      const legal = this.legalMask(leaf, rootGame);
      const bin = new Float32Array(this.L * this.L * KF.NUM_BIN), glob = new Float32Array(KF.NUM_GLOBAL);
      KF.fill({ board: leaf.board, prev1: leaf.prev1, prev2: leaf.prev2, moves: leaf.moves, komi: leaf.komi, banned: null, consecutivePasses: leaf.passes }, leaf.pla, { isRoot: node === rootNode, conservativePass: false }, this.L, bin, glob);
      // 동형반복 금지점 특징(6): 합법 마스크로부터
      const b = leaf.board;
      for (let y = 0; y < this.L; y++) for (let x = 0; x < this.L; x++) {
        const loc = b.loc(x, y);
        if (b.colors[loc] === EMPTY && !legal[y * this.L + x] && loc !== b.ko && !b.isSuicide(loc, leaf.pla)) bin[(y * this.L + x) * KF.NUM_BIN + 6] = 1;
      }
      return { node, path, leaf, item: { bin, glob, legal } };
    }

    expand(node, r, leaf, legal) {
      if (node.children) return; // 이미 확장됨 (중복 평가)
      node.nn = { winrate: r.winrate, lead: r.lead, policy: r.policy };
      const L = this.L, b = leaf.board, children = [];
      for (let p = 0; p < L * L; p++) if (legal[p] && r.policy[p] > 0) children.push({ move: b.loc(p % L, (p / L) | 0), prior: r.policy[p], node: new Node(r.policy[p]) });
      children.push({ move: PASS_LOC, prior: r.policy[L * L], node: new Node(r.policy[L * L]) });
      children.sort((a, c) => c.prior - a.prior);
      node.children = children;
    }

    backprop(path, utility, win, lead, replaceVirtual) {
      // path[0]=루트, path[i]=i번째 착수 후 노드. 리프 노드의 관점(둘 차례 플레이어)에서의 utility/win/lead가 주어짐.
      // 각 노드의 누적값은 그 노드에서 둘 차례인 플레이어 관점. 리프에서 멀어질수록 관점이 번갈아 바뀜.
      let u = utility, w = win, l = lead;
      const vl = this.opt.virtualLoss;
      for (let i = path.length - 1; i >= 0; i--) {
        const nd = path[i];
        if (replaceVirtual) nd.valueSum -= vl; // 가상손실 제거 (visits는 이미 더해짐)
        nd.valueSum += u; nd.winSum += w; nd.leadSum += l;
        u = -u; w = 1 - w; l = -l;
      }
    }

    pv(node, maxLen) {
      const out = [];
      let n = node;
      for (let i = 0; i < maxLen; i++) {
        if (!n.children || !n.children.length) break;
        let best = null;
        for (const ch of n.children) if (!best || ch.node.visits > best.node.visits) best = ch;
        if (!best || best.node.visits < 1) break;
        out.push(best.move); n = best.node;
      }
      return out;
    }

    report(rootNode, rootGame, playouts, ms) {
      const L = this.L, b = rootGame.board;
      const toPos = loc => loc === PASS_LOC ? -1 : b.y(loc) * L + b.x(loc);
      const moves = [];
      if (rootNode.children) {
        for (const ch of rootNode.children) {
          const c = ch.node;
          if (c.visits === 0 && ch.prior < 0.005) continue;
          moves.push({ p: toPos(ch.move), visits: c.visits, prior: ch.prior,
            winrate: c.visits ? 1 - c.winSum / c.visits : null, lead: c.visits ? -c.leadSum / c.visits : null,
            utility: c.visits ? -c.valueSum / c.visits : null, pv: [toPos(ch.move), ...this.pv(c, 12).map(toPos)] });
        }
      }
      moves.sort((a, c) => (c.visits - a.visits) || (c.prior - a.prior));
      const rootVisits = rootNode.visits;
      const ownership = new Float32Array(L * L);
      if (this.ownN) for (let p = 0; p < L * L; p++) ownership[p] = this.ownSum[p] / this.ownN;
      return { toPlay: rootGame.toPlay, playouts, ms, moves,
        winrate: rootVisits ? rootNode.winSum / rootVisits : 0.5, lead: rootVisits ? rootNode.leadSum / rootVisits : 0,
        nnWinrate: rootNode.nn ? rootNode.nn.winrate : null, nnLead: rootNode.nn ? rootNode.nn.lead : null, nnPolicy: rootNode.nn ? rootNode.nn.policy : null,
        ownership, rootVisits };
    }
  }

  /** 네트 → evaluator 어댑터 */
  function makeEvaluator(net, L, KN) {
    return {
      L,
      padTo: 0,
      async evaluate(items) {
        const n0 = items.length, FS = KF.NUM_BIN;
        // GPU는 입력 모양이 바뀔 때마다 다시 컴파일하므로 묶음 크기를 고정(1 또는 padTo)
        const N = (this.padTo && n0 > 1 && n0 < this.padTo) ? this.padTo : n0;
        const bin = new Float32Array(N * L * L * FS), glob = new Float32Array(N * KF.NUM_GLOBAL);
        for (let i = 0; i < n0; i++) { bin.set(items[i].bin, i * L * L * FS); glob.set(items[i].glob, i * KF.NUM_GLOBAL); }
        const out = await net.forward(bin, glob, N, L);
        const res = [];
        for (let i = 0; i < n0; i++) res.push(KN.postprocess(out, i, items[i].legal, L));
        return res;
      }
    };
  }

  return { Search, Node, makeEvaluator };
});
