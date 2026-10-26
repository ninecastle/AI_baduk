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
      // 앞 수의 탐색 나무를 이어받으면(reuseRoot) 이미 읽어 둔 만큼은 다시 계산하지 않음
      const reused = !!(limits.reuseRoot && limits.reuseRoot.children && limits.reuseRoot.visits > 0);
      const rootNode = reused ? limits.reuseRoot : new Node(1);
      this.rootGame = rootGame; this.rootNode = rootNode; this.lastRoot = rootNode; this.rootEquiv = null;
      // 판이 대칭이면 같은 자리끼리 묶어서 하나만 탐색 (예: 빈 판의 네 귀)
      { const b = rootGame.board; this.rootSyms = (reused || limits.noSymPrune) ? [] : boardSymmetries(p => b.colors[b.loc(p % L, (p / L) | 0)], L); }
      const budget = reused ? Math.max(limits.minNew != null ? limits.minNew : Math.min(2, maxPlayouts), maxPlayouts - rootNode.visits) : maxPlayouts;
      const rs = limits.reviewStop;
      const minStop = limits.minPlayouts != null ? limits.minPlayouts : Math.min(maxPlayouts, Math.max(12, Math.round(maxPlayouts * 0.15)));
      this.earlyStopped = false;
      this.ownSum = new Float32Array(L * L); this.ownN = 0;
      let playouts = 0;
      while (playouts < budget && !this.cancelled && (now() - t0) < maxMs) {
        const batch = [];
        for (let k = 0; k < B && playouts + batch.length < budget; k++) {
          const sel = this.select(rootNode, rootGame);
          if (!sel) break;
          if (sel.terminalDone) { playouts++; continue; }
          batch.push(sel);
          if (sel.node === rootNode && batch.length === 1 && playouts === 0) break; // 루트 먼저 단독 평가
        }
        if (!batch.length) { if (playouts >= budget) break; continue; }
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
        if (limits.earlyStop !== false && playouts >= minStop && this.decided(rootNode, budget - playouts)) { this.earlyStopped = true; break; }
        if (rs && playouts >= 2 && rootNode.visits >= rs.min && this.reviewDone(rootNode, rs)) { this.earlyStopped = true; break; }
      }
      return this.report(rootNode, rootGame, rootNode.visits, now() - t0);
    }

    /** 리뷰용 조기 종료: 실제로 둔 수가 1순위로 압도적이거나, 승부가 이미 완전히 기울었을 때 */
    reviewDone(root, rs) {
      const wr = root.visits ? root.winSum / root.visits : 0.5;
      if (wr > 0.97 || wr < 0.03) return true;
      const ch = root.children; if (!ch || !ch.length) return false;
      let a = null, tot = 0;
      for (const c of ch) { tot += c.node.visits; if (!a || c.node.visits > a.node.visits) a = c; }
      return rs.played != null && a.move === rs.played && tot > 0 && a.node.visits >= 0.7 * tot;
    }
    /** 둔 수에 해당하는 자식 나무 (다음 수 분석에 이어받기용) */
    childFor(loc) {
      const r = this.lastRoot; if (!r || !r.children) return null;
      const c = r.children.find(x => x.move === loc);
      return c && c.node.children ? c.node : null;
    }

    /** 더 생각해도 결과가 안 바뀌면 true: 1등 방문수를 남은 탐색으로 못 따라잡거나, 1등이 압도적이고 가치도 가장 높을 때 */
    decided(root, remaining) {
      const ch = root.children; if (!ch || ch.length < 2) return !!ch;
      let a = null, b = null;
      for (const c of ch) { if (!a || c.node.visits > a.node.visits) { b = a; a = c; } else if (!b || c.node.visits > b.node.visits) b = c; }
      if (!b || a.node.visits - b.node.visits > remaining) return true;
      const tot = root.visits || 1;
      if (a.node.visits < 0.75 * tot) return false;
      const qa = -a.node.valueSum / Math.max(1, a.node.visits);
      for (const c of ch) if (c !== a && c.node.visits >= 2 && -c.node.valueSum / c.node.visits > qa - 0.02) return false;
      return true;
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
      return { node, path, leaf, item: { bin, glob, legal, allSym: node === rootNode && !!this.ev.padTo } };
    }

    expand(node, r, leaf, legal) {
      if (node.children) return; // 이미 확장됨 (중복 평가)
      node.nn = { winrate: r.winrate, lead: r.lead, policy: r.policy };
      const L = this.L, b = leaf.board, children = [];
      const prune = node === this.rootNode && this.rootSyms && this.rootSyms.length ? symMaps(L) : null;
      if (prune) this.rootEquiv = new Map();
      for (let p = 0; p < L * L; p++) {
        if (!(legal[p] && r.policy[p] > 0)) continue;
        let prior = r.policy[p];
        if (prune) {
          let canon = p; for (const sy of this.rootSyms) canon = Math.min(canon, prune[sy][p]);
          if (!this.rootEquiv.has(canon)) this.rootEquiv.set(canon, []);
          this.rootEquiv.get(canon).push(p);
          if (canon !== p) continue;
          // 같은 자리 묶음의 사전확률을 모두 더함(중복 제외)
          const seen = new Set([p]); prior = r.policy[p]; for (const sy of this.rootSyms) { const q = prune[sy][p]; if (!seen.has(q)) { seen.add(q); prior += r.policy[q]; } }
        }
        children.push({ move: b.loc(p % L, (p / L) | 0), prior, node: new Node(prior) });
      }
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
      // 묶어 둔 대칭 자리는 같은 결과로 펼쳐서 보고 (수순도 대칭으로 변환)
      if (this.rootEquiv && this.rootSyms && this.rootSyms.length) {
        const maps = symMaps(L), extra = [];
        for (const m of moves) {
          if (m.p < 0) continue;
          const group = this.rootEquiv.get(m.p) || [];
          const n = group.length || 1; m.prior /= n;
          for (const q of group) {
            if (q === m.p) continue;
            const sy = [0].concat(this.rootSyms).find(t => maps[t][m.p] === q);
            extra.push(Object.assign({}, m, { p: q, pv: m.pv.map(x => x < 0 ? x : maps[sy][x]) }));
          }
        }
        moves.push(...extra);
      }
      moves.sort((a, c) => (c.visits - a.visits) || (c.prior - a.prior));
      const rootVisits = rootNode.visits;
      const ownership = new Float32Array(L * L);
      if (this.ownN) for (let p = 0; p < L * L; p++) ownership[p] = this.ownSum[p] / this.ownN;
      return { toPlay: rootGame.toPlay, playouts, ms, moves,
        winrate: rootVisits ? rootNode.winSum / rootVisits : 0.5, lead: rootVisits ? rootNode.leadSum / rootVisits : 0,
        nnWinrate: rootNode.nn ? rootNode.nn.winrate : null, nnLead: rootNode.nn ? rootNode.nn.lead : null, nnPolicy: rootNode.nn ? rootNode.nn.policy : null,
        ownership, rootVisits, earlyStopped: this.earlyStopped };
    }
  }

  /** 네트 → evaluator 어댑터 */
  /** 대칭 변환표: maps[s][p] = 원래 좌표 p가 대칭 s에서 가는 좌표 */
  const symCache = new Map();
  function symMaps(L) {
    let m = symCache.get(L); if (m) return m;
    m = [];
    for (let s = 0; s < 8; s++) {
      const a = new Int32Array(L * L);
      for (let p = 0; p < L * L; p++) {
        let x = p % L, y = (p / L) | 0;
        if (s & 4) { const t = x; x = y; y = t; }
        if (s & 1) x = L - 1 - x;
        if (s & 2) y = L - 1 - y;
        a[p] = y * L + x;
      }
      m.push(a);
    }
    symCache.set(L, m); return m;
  }
  /** 판이 대칭 s에 대해 그대로인지 (돌 배치 기준) */
  function boardSymmetries(colorsAt, L) {
    const maps = symMaps(L), out = [];
    for (let s = 1; s < 8; s++) { const mp = maps[s]; let ok = true; for (let p = 0; p < L * L && ok; p++) if (colorsAt(p) !== colorsAt(mp[p])) ok = false; if (ok) out.push(s); }
    return out;
  }

  /** 신경망 평가기. 항목마다 판을 무작위로 돌려서 평가하고(치우침 제거), allSym 항목은 8방향 평균 */
  function makeEvaluator(net, L, KN) {
    const maps = symMaps(L), FS = KF.NUM_BIN, LL = L * L;
    return {
      L,
      padTo: 0,
      randomSym: true,
      coalesce: false, _q: [], _sched: false,
      /** 여러 탐색이 동시에 부르면 한 번에 묶어서 계산 (GPU는 8개를 1개와 거의 같은 시간에 계산) */
      evaluate(items) {
        if (!this.coalesce) return this._evalNow(items);
        return new Promise((resolve, reject) => {
          this._q.push({ items, resolve, reject });
          if (this._sched) return;
          this._sched = true;
          const ch = new MessageChannel();
          ch.port1.onmessage = async () => {
            this._sched = false;
            const q = this._q; this._q = [];
            const all = [].concat(...q.map(x => x.items));
            try {
              const res = await this._evalNow(all);
              let k = 0; for (const x of q) { x.resolve(res.slice(k, k + x.items.length)); k += x.items.length; }
            } catch (err) { for (const x of q) x.reject(err); }
          };
          ch.port2.postMessage(0);
        });
      },
      async _evalNow(items) {
        // 1) 평가할 (항목, 대칭) 목록
        const jobs = [];
        for (let i = 0; i < items.length; i++) {
          if (items[i].allSym) for (let s = 0; s < 8; s++) jobs.push({ i, s });
          else jobs.push({ i, s: this.randomSym ? (Math.random() * 8) | 0 : 0 });
        }
        const raw = new Array(jobs.length);
        // 2) 8개씩 묶어서 계산 (GPU 모양 고정)
        const CH = this.padTo || 8;
        for (let j0 = 0; j0 < jobs.length; j0 += CH) {
          const chunk = jobs.slice(j0, j0 + CH), n0 = chunk.length;
          const N = (this.padTo && n0 > 1 && n0 < this.padTo) ? this.padTo : n0;
          const bin = new Float32Array(N * LL * FS), glob = new Float32Array(N * KF.NUM_GLOBAL), legals = [];
          for (let k = 0; k < n0; k++) {
            const { i, s } = chunk[k], it = items[i], mp = maps[s], off = k * LL * FS;
            if (s === 0) bin.set(it.bin, off);
            else for (let p = 0; p < LL; p++) { const src = p * FS, dst = off + mp[p] * FS; for (let c = 0; c < FS; c++) bin[dst + c] = it.bin[src + c]; }
            glob.set(it.glob, k * KF.NUM_GLOBAL);
            let lg = it.legal;
            if (s !== 0) { lg = new Uint8Array(LL + 1); for (let p = 0; p < LL; p++) lg[mp[p]] = it.legal[p]; lg[LL] = it.legal[LL]; }
            legals.push(lg);
          }
          const out = await net.forward(bin, glob, N, L);
          for (let k = 0; k < n0; k++) {
            const r = KN.postprocess(out, k, legals[k], L), mp = maps[chunk[k].s];
            if (chunk[k].s !== 0) {
              const pol = new Float32Array(LL + 1), own = new Float32Array(LL);
              for (let p = 0; p < LL; p++) { pol[p] = r.policy[mp[p]]; own[p] = r.ownership[mp[p]]; }
              pol[LL] = r.policy[LL]; r.policy = pol; r.ownership = own;
            }
            raw[j0 + k] = r;
          }
        }
        // 3) 항목별로 모으기 (여러 대칭이면 평균)
        const res = items.map(() => null), cnt = items.map(() => 0);
        for (let j = 0; j < jobs.length; j++) {
          const i = jobs[j].i, r = raw[j];
          if (!res[i]) { res[i] = r; cnt[i] = 1; continue; }
          const a = res[i]; cnt[i]++;
          for (let p = 0; p <= LL; p++) a.policy[p] += r.policy[p];
          for (let p = 0; p < LL; p++) a.ownership[p] += r.ownership[p];
          for (const k of ['winrate', 'scoreMean', 'scoreStdev', 'lead', 'varTime']) a[k] += r[k];
        }
        for (let i = 0; i < items.length; i++) if (cnt[i] > 1) {
          const a = res[i], n = cnt[i];
          for (let p = 0; p <= LL; p++) a.policy[p] /= n;
          for (let p = 0; p < LL; p++) a.ownership[p] /= n;
          for (const k of ['winrate', 'scoreMean', 'scoreStdev', 'lead', 'varTime']) a[k] /= n;
        }
        return res;
      }
    };
  }

  return { Search, Node, makeEvaluator, symMaps, boardSymmetries };
});
