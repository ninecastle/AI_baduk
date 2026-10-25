/* engine.worker.js — 바둑 AI 봇 (몬테카를로 트리 탐색 + RAVE)
   웹워커에서 실행. 노드(테스트)에서도 require 가능. */
(function (root) {
  'use strict';

  const EMPTY = 0, BLACK = 1, WHITE = 2, WALL = 3;
  const PASS = -1, RESIGN = -2;

  // ───────── 빠른 판 (의사 활로 + 체인 리스트) ─────────
  class FastBoard {
    constructor(size) {
      this.size = size; this.W = size + 2; this.M = this.W * this.W;
      const M = this.M, W = this.W;
      this.color = new Uint8Array(M);
      for (let i = 0; i < W; i++) { this.color[i] = WALL; this.color[M - 1 - i] = WALL; this.color[i * W] = WALL; this.color[i * W + W - 1] = WALL; }
      this.next = new Int16Array(M);
      this.chain = new Int16Array(M);
      this.libs = new Int16Array(M);
      this.libSum = new Int32Array(M);
      this.libSq = new Float64Array(M);
      this.csize = new Int16Array(M);
      this.empties = new Int16Array(M);
      this.emptyPos = new Int16Array(M).fill(-1);
      this.nEmpty = 0;
      this.points = [];
      for (let y = 1; y <= size; y++) for (let x = 1; x <= size; x++) { const p = y * W + x; this.points.push(p); this._addEmpty(p); }
      this.ko = -1; this.toPlay = BLACK; this.caps = new Int16Array(3);
      this.lastMove = -1; this.lastMove2 = -1; this.passes = 0; this.moveCount = 0;
    }
    copyFrom(b) {
      this.color.set(b.color); this.next.set(b.next); this.chain.set(b.chain);
      this.libs.set(b.libs); this.libSum.set(b.libSum); this.libSq.set(b.libSq); this.csize.set(b.csize);
      this.empties.set(b.empties); this.emptyPos.set(b.emptyPos); this.nEmpty = b.nEmpty;
      this.ko = b.ko; this.toPlay = b.toPlay; this.caps.set(b.caps);
      this.lastMove = b.lastMove; this.lastMove2 = b.lastMove2; this.passes = b.passes; this.moveCount = b.moveCount;
    }
    _addEmpty(p) { this.emptyPos[p] = this.nEmpty; this.empties[this.nEmpty++] = p; }
    _removeEmpty(p) { const i = this.emptyPos[p]; const last = this.empties[--this.nEmpty]; this.empties[i] = last; this.emptyPos[last] = i; this.emptyPos[p] = -1; }
    inAtari(c) { return this.libs[c] > 0 && this.libSq[c] * this.libs[c] === this.libSum[c] * this.libSum[c]; }
    atariLib(c) { return (this.libSum[c] / this.libs[c]) | 0; }
    _addLib(c, p) { this.libs[c]++; this.libSum[c] += p; this.libSq[c] += p * p; }
    _removeLib(c, p) { this.libs[c]--; this.libSum[c] -= p; this.libSq[c] -= p * p; }

    isEyeLike(p, color) {
      const W = this.W, col = this.color;
      const n1 = col[p - 1], n2 = col[p + 1], n3 = col[p - W], n4 = col[p + W];
      if ((n1 !== color && n1 !== WALL) || (n2 !== color && n2 !== WALL) || (n3 !== color && n3 !== WALL) || (n4 !== color && n4 !== WALL)) return false;
      const opp = 3 - color;
      let walls = 0, opps = 0;
      const d1 = col[p - W - 1], d2 = col[p - W + 1], d3 = col[p + W - 1], d4 = col[p + W + 1];
      if (d1 === WALL) walls++; else if (d1 === opp) opps++;
      if (d2 === WALL) walls++; else if (d2 === opp) opps++;
      if (d3 === WALL) walls++; else if (d3 === opp) opps++;
      if (d4 === WALL) walls++; else if (d4 === opp) opps++;
      return walls > 0 ? opps === 0 : opps <= 1;
    }

    isLegal(p, color) {
      if (this.color[p] !== EMPTY || p === this.ko) return false;
      const W = this.W, col = this.color, opp = 3 - color;
      const nb0 = p - 1, nb1 = p + 1, nb2 = p - W, nb3 = p + W;
      if (col[nb0] === EMPTY || col[nb1] === EMPTY || col[nb2] === EMPTY || col[nb3] === EMPTY) return true;
      if (col[nb0] === color && !this.inAtari(this.chain[nb0])) return true;
      if (col[nb1] === color && !this.inAtari(this.chain[nb1])) return true;
      if (col[nb2] === color && !this.inAtari(this.chain[nb2])) return true;
      if (col[nb3] === color && !this.inAtari(this.chain[nb3])) return true;
      if (col[nb0] === opp && this.inAtari(this.chain[nb0])) return true;
      if (col[nb1] === opp && this.inAtari(this.chain[nb1])) return true;
      if (col[nb2] === opp && this.inAtari(this.chain[nb2])) return true;
      if (col[nb3] === opp && this.inAtari(this.chain[nb3])) return true;
      return false;
    }

    /** 착수 후 스스로 단수가 되는지(근사) */
    isSelfAtari(p, color) {
      const W = this.W, col = this.color, opp = 3 - color;
      let emptyN = 0, ownSafe = false, ownBig = false;
      const nbs = [p - 1, p + 1, p - W, p + W];
      for (let i = 0; i < 4; i++) {
        const q = nbs[i], cq = col[q];
        if (cq === EMPTY) emptyN++;
        else if (cq === color) { const c = this.chain[q]; if (!this.inAtari(c)) { ownSafe = true; if (this.libs[c] >= 4) ownBig = true; } }
        else if (cq === opp) { if (this.inAtari(this.chain[q])) return false; }
      }
      if (emptyN >= 2) return false;
      if (emptyN === 1 && ownSafe) return false;
      if (emptyN === 0 && ownBig) return false;
      return true;
    }

    pass() {
      this.passes++; this.ko = -1; this.lastMove2 = this.lastMove; this.lastMove = PASS;
      this.toPlay = 3 - this.toPlay; this.moveCount++;
    }

    play(p, color) {
      const W = this.W, col = this.color, opp = 3 - color;
      this._removeEmpty(p); col[p] = color;
      this.chain[p] = p; this.next[p] = p; this.csize[p] = 1; this.libs[p] = 0; this.libSum[p] = 0; this.libSq[p] = 0;
      const nbs = [p - 1, p + 1, p - W, p + W];
      for (let i = 0; i < 4; i++) if (col[nbs[i]] === EMPTY) this._addLib(p, nbs[i]);
      let captured = 0, capPos = -1;
      for (let i = 0; i < 4; i++) {
        const q = nbs[i];
        if (col[q] === opp) {
          const c = this.chain[q];
          this._removeLib(c, p);
          if (this.libs[c] === 0) { captured += this.csize[c]; capPos = q; this._removeChain(c, color); }
        }
      }
      for (let i = 0; i < 4; i++) { const q = nbs[i]; if (col[q] === color) this._removeLib(this.chain[q], p); }
      for (let i = 0; i < 4; i++) {
        const q = nbs[i];
        if (col[q] === color) { const c = this.chain[q]; if (c !== this.chain[p]) this._merge(this.chain[p], c); }
      }
      const cp = this.chain[p];
      this.ko = (captured === 1 && this.csize[cp] === 1 && this.libs[cp] === 1) ? capPos : -1;
      this.caps[color] += captured;
      this.lastMove2 = this.lastMove; this.lastMove = p; this.passes = 0;
      this.toPlay = opp; this.moveCount++;
      return captured;
    }

    _removeChain(c, capturer) {
      const W = this.W, col = this.color;
      let s = c;
      do {
        const nxt = this.next[s];
        col[s] = EMPTY; this._addEmpty(s);
        const nbs = [s - 1, s + 1, s - W, s + W];
        for (let i = 0; i < 4; i++) { const q = nbs[i]; if (col[q] === capturer) this._addLib(this.chain[q], s); }
        s = nxt;
      } while (s !== c);
    }

    _merge(a, b) {
      this.libs[a] += this.libs[b]; this.libSum[a] += this.libSum[b]; this.libSq[a] += this.libSq[b]; this.csize[a] += this.csize[b];
      let s = b;
      do { this.chain[s] = a; s = this.next[s]; } while (s !== b);
      const t = this.next[a]; this.next[a] = this.next[b]; this.next[b] = t;
    }

    /** 영역 점수(흑 - 백), 덤 미포함. owner 배열(옵션)에 소유자 기록 */
    areaScore(owner) {
      const col = this.color, W = this.W, pts = this.points;
      let s = 0;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], c = col[p];
        let o = 0;
        if (c === BLACK) o = BLACK; else if (c === WHITE) o = WHITE;
        else {
          const a = col[p - 1], b = col[p + 1], d = col[p - W], e = col[p + W];
          const sawB = a === BLACK || b === BLACK || d === BLACK || e === BLACK;
          const sawW = a === WHITE || b === WHITE || d === WHITE || e === WHITE;
          if (sawB && !sawW) o = BLACK; else if (sawW && !sawB) o = WHITE;
        }
        if (owner) owner[i] = o;
        if (o === BLACK) s++; else if (o === WHITE) s--;
      }
      return s;
    }
  }

  // ───────── 난수 ─────────
  let seed = (Date.now() ^ 0x5DEECE66D) >>> 0;
  function rnd() { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; }
  function rndInt(n) { return (rnd() * n) | 0; }

  // ───────── 플레이아웃 정책 ─────────
  const DIR8 = (W) => [-1, 1, -W, W, -W - 1, -W + 1, W - 1, W + 1];

  function randomLegal(b, color) {
    const n = b.nEmpty;
    if (n === 0) return PASS;
    const start = rndInt(n);
    for (let k = 0; k < n; k++) {
      const p = b.empties[(start + k) % n];
      if (b.isLegal(p, color) && !b.isEyeLike(p, color)) return p;
    }
    return PASS;
  }

  function policyMove(b, color, scratch) {
    const L = b.lastMove, W = b.W, col = b.color, opp = 3 - color;
    if (L >= 0) {
      // 1) 방금 둔 상대 돌이 단수면 따냄
      const lc = b.chain[L];
      if (rnd() < 0.9 && b.inAtari(lc)) {
        const q = b.atariLib(lc);
        if (b.isLegal(q, color)) return q;
      }
      // 2) 내 돌이 단수에 몰렸으면 구출 (활로 늘리기 / 주변 상대 따내기)
      if (rnd() < 0.9) {
        let cnt = 0;
        const nbs = [L - 1, L + 1, L - W, L + W];
        for (let i = 0; i < 4; i++) {
          const q = nbs[i];
          if (col[q] === color) {
            const c = b.chain[q];
            if (b.inAtari(c)) {
              // 주변 상대 단수 체인 따내기
              let s = c, found = -1;
              do {
                const ss = [s - 1, s + 1, s - W, s + W];
                for (let j = 0; j < 4 && found < 0; j++) { const r = ss[j]; if (col[r] === opp && b.inAtari(b.chain[r])) { const lib = b.atariLib(b.chain[r]); if (b.isLegal(lib, color)) found = lib; } }
                s = b.next[s];
              } while (s !== c && found < 0);
              if (found >= 0) return found;
              const lib = b.atariLib(c);
              if (b.isLegal(lib, color) && !b.isSelfAtari(lib, color)) { scratch[cnt++] = lib; }
            }
          }
        }
        if (cnt > 0) return scratch[rndInt(cnt)];
      }
      // 3) 마지막 수 주변 (8방향) 로컬 응수
      if (rnd() < 0.6) {
        const d = DIR8(W); let cnt = 0;
        for (let i = 0; i < 8; i++) {
          const q = L + d[i];
          if (col[q] === EMPTY && b.isLegal(q, color) && !b.isEyeLike(q, color) && !b.isSelfAtari(q, color)) scratch[cnt++] = q;
        }
        if (cnt > 0) return scratch[rndInt(cnt)];
      }
    }
    // 4) 무작위 (자기단수 회피 2회 시도)
    for (let t = 0; t < 2; t++) {
      const p = randomLegal(b, color);
      if (p === PASS) return PASS;
      if (!b.isSelfAtari(p, color) || t === 1) return p;
    }
    return PASS;
  }

  /** 플레이아웃 실행. amaf: 처음 둔 색 기록. 반환: 흑 기준 영역 점수(덤 미포함) */
  function playout(b, amaf, scratch, owner) {
    const maxMoves = b.size * b.size * 2 + 20;
    let moves = 0;
    while (b.passes < 2 && moves < maxMoves) {
      const color = b.toPlay;
      const p = policyMove(b, color, scratch);
      if (p === PASS) b.pass();
      else { b.play(p, color); if (amaf[p] === 0) amaf[p] = color; }
      moves++;
    }
    return b.areaScore(owner);
  }

  // ───────── 트리 ─────────
  class Node {
    constructor(moves, priors) {
      this.moves = moves; const n = moves.length;
      this.visits = new Int32Array(n); this.wins = new Float32Array(n);
      this.rave = new Int32Array(n); this.raveWins = new Float32Array(n);
      this.prior = priors; this.children = new Array(n).fill(null);
      this.total = 0;
    }
  }

  const RAVE_K = 1200, UCT_C = 0.45, PRIOR_W = 1.2, EXPAND_AT = 2;

  function linePos(b, p) { // 1 = 첫째 줄
    const W = b.W, x = p % W, y = (p / W) | 0, s = b.size;
    return Math.min(x, y, s + 1 - x, s + 1 - y);
  }

  function createNode(b, color, komi) {
    const col = b.color, W = b.W, opp = 3 - color;
    const moves = [], priors = [];
    const early = b.moveCount < b.size * b.size / 3;
    const L = b.lastMove, L2 = b.lastMove2;
    for (let i = 0; i < b.nEmpty; i++) {
      const p = b.empties[i];
      if (!b.isLegal(p, color) || b.isEyeLike(p, color)) continue;
      let pr = 0;
      const nbs = [p - 1, p + 1, p - W, p + W];
      let capSize = 0, save = false, nearOpp = false;
      for (let k = 0; k < 4; k++) {
        const q = nbs[k], cq = col[q];
        if (cq === opp) { nearOpp = true; const c = b.chain[q]; if (b.inAtari(c)) capSize += b.csize[c]; }
        else if (cq === color) { const c = b.chain[q]; if (b.inAtari(c)) save = true; }
      }
      if (capSize > 0) pr += 0.6 + 0.15 * Math.min(capSize, 6);
      const selfAtari = b.isSelfAtari(p, color);
      if (save && !selfAtari) pr += 0.6;
      if (selfAtari && capSize === 0) pr -= 0.7;
      const line = linePos(b, p);
      if (early) {
        if (line === 1) pr -= 0.5; else if (line === 2) pr -= 0.15; else if (line === 3 || line === 4) pr += 0.2;
        if (b.size >= 13 && b.moveCount < 12 && (line === 3 || line === 4)) {
          const x = p % W, y = (p / W) | 0, s = b.size;
          const ex = Math.min(x, s + 1 - x), ey = Math.min(y, s + 1 - y);
          if ((ex === 3 || ex === 4) && (ey === 3 || ey === 4)) pr += 0.6; // 귀 착점
        }
      } else if (line === 1 && !nearOpp && capSize === 0) pr -= 0.2;
      if (L >= 0) { const dx = Math.abs(p % W - L % W), dy = Math.abs(((p / W) | 0) - ((L / W) | 0)); if (dx <= 1 && dy <= 1) pr += 0.15; else if (dx <= 2 && dy <= 2) pr += 0.05; }
      if (L2 >= 0) { const dx = Math.abs(p % W - L2 % W), dy = Math.abs(((p / W) | 0) - ((L2 / W) | 0)); if (dx <= 1 && dy <= 1) pr += 0.08; }
      moves.push(p); priors.push(pr);
    }
    // 패스: 초반엔 강한 패널티
    moves.push(PASS); priors.push(early ? -2.0 : (moves.length < 4 ? 0.2 : -0.8));
    return new Node(moves, Float32Array.from(priors));
  }

  function select(node) {
    const n = node.moves.length;
    const logT = Math.log(node.total + 1);
    let best = -1, bestV = -Infinity;
    for (let i = 0; i < n; i++) {
      const v = node.visits[i], r = node.rave[i];
      const q = v > 0 ? node.wins[i] / v : 0.5;
      const rq = r > 0 ? node.raveWins[i] / r : q;
      const beta = r / (r + v + (r * v) / RAVE_K + 1e-9);
      const val = (1 - beta) * q + beta * rq + PRIOR_W * node.prior[i] / (1 + v) + UCT_C * Math.sqrt(logT / (v + 1));
      if (val > bestV) { bestV = val; best = i; }
    }
    return best;
  }

  class Search {
    constructor(size, komi) {
      this.size = size; this.komi = komi;
      this.root = null; this.rootBoard = new FastBoard(size);
      this.sb = new FastBoard(size);
      this.amaf = new Uint8Array(this.rootBoard.M);
      this.scratch = new Int16Array(64);
      this.ownerAcc = new Float32Array(size * size);
      this.ownerTmp = new Int8Array(size * size);
      this.ownerN = 0;
      this.pathNodes = []; this.pathIdx = []; this.pathColor = [];
      this.expandAt = size >= 19 ? 6 : size >= 13 ? 3 : EXPAND_AT;
      this.maxNodes = size >= 19 ? 8000 : size >= 13 ? 20000 : 40000;
      this.nodeCount = 0;
    }
    setPosition(b) { this.rootBoard.copyFrom(b); this.root = null; this.nodeCount = 0; this.ownerAcc.fill(0); this.ownerN = 0; }

    iterate() {
      const sb = this.sb; sb.copyFrom(this.rootBoard);
      const amaf = this.amaf; amaf.fill(0);
      if (!this.root) this.root = createNode(sb, sb.toPlay, this.komi);
      let node = this.root;
      const pathNodes = this.pathNodes, pathIdx = this.pathIdx, pathColor = this.pathColor;
      let depth = 0;
      while (true) {
        const color = sb.toPlay;
        const i = select(node);
        pathNodes[depth] = node; pathIdx[depth] = i; pathColor[depth] = color; depth++;
        const m = node.moves[i];
        if (m === PASS) sb.pass(); else { sb.play(m, color); if (amaf[m] === 0) amaf[m] = color; }
        if (sb.passes >= 2) break;
        let child = node.children[i];
        if (!child) {
          if (node.visits[i] >= this.expandAt && this.nodeCount < this.maxNodes) {
            child = createNode(sb, sb.toPlay, this.komi); node.children[i] = child; this.nodeCount++;
          } else break;
        }
        node = child;
        if (depth > 400) break;
      }
      let score;
      const ownerTmp = this.ownerTmp;
      if (sb.passes >= 2) score = sb.areaScore(ownerTmp); // 트리 안에서 양쪽 패스 → 그대로 평가
      else score = playout(sb, amaf, this.scratch, ownerTmp);
      // 소유권 누적 (루트 색 기준 아님: 흑 +1)
      const acc = this.ownerAcc; for (let k = 0; k < ownerTmp.length; k++) { const o = ownerTmp[k]; if (o === BLACK) acc[k] += 1; else if (o === WHITE) acc[k] -= 1; }
      this.ownerN++;
      const blackWin = (score - this.komi) > 0 ? 1 : 0;
      for (let d = 0; d < depth; d++) {
        const nd = pathNodes[d], i = pathIdx[d], c = pathColor[d];
        const win = c === BLACK ? blackWin : 1 - blackWin;
        nd.total++; nd.visits[i]++; nd.wins[i] += win;
        const mv = nd.moves, n = mv.length;
        for (let j = 0; j < n; j++) { const m = mv[j]; if (m >= 0 && amaf[m] === c) { nd.rave[j]++; nd.raveWins[j] += win; } }
      }
      return score;
    }

    run(maxPlayouts, maxMs) {
      const t0 = now();
      let it = 0;
      while (it < maxPlayouts) {
        for (let k = 0; k < 32 && it < maxPlayouts; k++, it++) this.iterate();
        if (now() - t0 > maxMs) break;
      }
      return { playouts: it, ms: now() - t0 };
    }

    rootStats() {
      const r = this.root; if (!r) return [];
      const out = [];
      for (let i = 0; i < r.moves.length; i++) {
        const v = r.visits[i];
        out.push({ move: r.moves[i], visits: v, winrate: v > 0 ? r.wins[i] / v : 0, prior: r.prior[i] });
      }
      out.sort((a, b) => b.visits - a.visits || b.winrate - a.winrate);
      return out;
    }
  }

  const now = (typeof performance !== 'undefined' && performance.now) ? () => performance.now() : () => Date.now();

  // ───────── 난이도 ─────────
  const LEVELS = [
    { id: 1, playouts: 120, ms: 400, temp: 2.2, blunder: 0.35, resign: false },
    { id: 2, playouts: 350, ms: 700, temp: 1.6, blunder: 0.22, resign: false },
    { id: 3, playouts: 900, ms: 1000, temp: 1.1, blunder: 0.12, resign: false },
    { id: 4, playouts: 2200, ms: 1500, temp: 0.7, blunder: 0.05, resign: false },
    { id: 5, playouts: 5000, ms: 2500, temp: 0.4, blunder: 0.0, resign: true },
    { id: 6, playouts: 10000, ms: 3500, temp: 0.2, blunder: 0.0, resign: true },
    { id: 7, playouts: 20000, ms: 5000, temp: 0.1, blunder: 0.0, resign: true },
    { id: 8, playouts: 60000, ms: 8000, temp: 0.0, blunder: 0.0, resign: true },
  ];

  function toPadded(p, size) { if (p < 0) return p; const W = size + 2; return ((p / size | 0) + 1) * W + (p % size) + 1; }
  function fromPadded(p, size) { if (p < 0) return p; const W = size + 2; return ((p / W | 0) - 1) * size + (p % W) - 1; }

  function buildBoard(size, moves, setup) {
    const b = new FastBoard(size);
    if (setup) {
      for (const p of (setup.black || [])) b.play(toPadded(p, size), BLACK);
      for (const p of (setup.white || [])) b.play(toPadded(p, size), WHITE);
      b.toPlay = setup.toPlay || BLACK; b.moveCount = 0; b.lastMove = -1; b.lastMove2 = -1; b.ko = -1; b.caps.fill(0);
    }
    for (const m of moves) {
      if (m.p === PASS) { b.toPlay = m.c; b.pass(); }
      else b.play(toPadded(m.p, size), m.c);
    }
    return b;
  }

  function chooseMove(stats, level, b, color) {
    const legal = stats.filter(s => s.visits > 0);
    if (!legal.length) return { move: PASS, winrate: 0.5 };
    const best = legal[0];
    // 실수(블런더): 무작위 합법수 (첫째 줄·자기단수 제외 시도)
    if (level.blunder > 0 && rnd() < level.blunder && b.moveCount > 2) {
      const cands = stats.filter(s => s.move >= 0 && !b.isSelfAtari(s.move, color) && linePos(b, s.move) > 1);
      if (cands.length) { const c = cands[rndInt(cands.length)]; return { move: c.move, winrate: best.winrate, blunder: true }; }
    }
    if (level.temp <= 0.01) return { move: best.move, winrate: best.winrate };
    // 방문수 기반 온도 샘플링 (상위 8개)
    const top = legal.slice(0, 8).filter(s => s.move >= 0 || s === best);
    const weights = top.map(s => Math.pow(s.visits / best.visits, 1 / level.temp));
    let sum = weights.reduce((a, b) => a + b, 0), r = rnd() * sum;
    for (let i = 0; i < top.length; i++) { r -= weights[i]; if (r <= 0) return { move: top[i].move, winrate: best.winrate }; }
    return { move: best.move, winrate: best.winrate };
  }

  const searches = {};
  function getSearch(size, komi) {
    const key = size + ':' + komi;
    if (!searches[key]) searches[key] = new Search(size, komi);
    return searches[key];
  }

  function genmove(req) {
    const { size, komi, moves, setup, level: lv, humanPassed } = req;
    const level = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, (lv || 1) - 1))];
    const b = buildBoard(size, moves, setup);
    const color = b.toPlay;
    const S = getSearch(size, komi);
    S.setPosition(b);
    const scale = size >= 19 ? 0.5 : size >= 13 ? 0.8 : 1;
    const info = S.run(Math.max(60, level.playouts * scale), level.ms);
    const stats = S.rootStats();
    const best = stats[0];
    let winrate = best ? best.winrate : 0.5;
    // 상대가 패스했고 현재 판에서 이기고 있으면 패스하여 종국
    if (humanPassed) {
      const ps = stats.find(s => s.move === PASS);
      const areaNow = b.areaScore(null) - komi;
      const myLead = color === BLACK ? areaNow : -areaNow;
      const late = b.moveCount >= size * size * 0.35;
      if ((ps && ps === best) || (late && myLead > 0 && winrate >= 0.4) || (late && ps && ps.visits > 20 && ps.winrate >= 0.5)) {
        return { move: PASS, winrate, playouts: info.playouts, ms: info.ms, stats: topStats(stats, size) };
      }
    }
    // 기권
    if (level.resign && b.moveCount > size * size * 0.25 && winrate < 0.08 && info.playouts > 500) {
      return { move: RESIGN, winrate, playouts: info.playouts, ms: info.ms, stats: topStats(stats, size) };
    }
    // 종반: 남은 수가 모두 손해면 패스
    const ch = chooseMove(stats, level, b, color);
    return { move: fromPadded(ch.move, size), winrate, blunder: !!ch.blunder, playouts: info.playouts, ms: info.ms, stats: topStats(stats, size) };
  }

  function topStats(stats, size) {
    return stats.slice(0, 6).map(s => ({ move: fromPadded(s.move, size), visits: s.visits, winrate: +s.winrate.toFixed(3) }));
  }

  /** 종국 소유권 추정 (사석 판정용). 반환 Float32Array(size*size): +1 흑, -1 백 */
  function estimate(req) {
    const { size, komi, moves, setup } = req;
    const b = buildBoard(size, moves, setup);
    const S = getSearch(size, komi);
    S.setPosition(b);
    const n = size >= 19 ? 600 : size >= 13 ? 1200 : 2000;
    const amaf = S.amaf, sb = S.sb, scratch = S.scratch, ownerTmp = S.ownerTmp;
    const acc = new Float32Array(size * size);
    const t0 = now();
    let k = 0;
    for (; k < n; k++) {
      sb.copyFrom(b); amaf.fill(0); sb.passes = 0;
      playout(sb, amaf, scratch, ownerTmp);
      for (let i = 0; i < acc.length; i++) { const o = ownerTmp[i]; if (o === BLACK) acc[i] += 1; else if (o === WHITE) acc[i] -= 1; }
      if (now() - t0 > 2500) { k++; break; }
    }
    for (let i = 0; i < acc.length; i++) acc[i] /= k;
    // 현재 영역 점수(흑-백)
    return { ownership: acc, playouts: k, areaDiff: b.areaScore(null) };
  }

  /** 빠른 형세 평가 */
  function evaluate(req) {
    const { size, komi, moves, setup, playouts } = req;
    const b = buildBoard(size, moves, setup);
    const S = getSearch(size, komi); S.setPosition(b);
    const info = S.run(playouts || 1500, 1500);
    const stats = S.rootStats();
    const best = stats[0];
    const wr = best ? best.winrate : 0.5;
    const blackWr = b.toPlay === BLACK ? wr : 1 - wr;
    return { blackWinrate: blackWr, toPlay: b.toPlay, playouts: info.playouts, stats: topStats(stats, size) };
  }

  const api = { FastBoard, Search, LEVELS, genmove, estimate, evaluate, buildBoard, toPadded, fromPadded, playout, PASS, RESIGN };

  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof self !== 'undefined' && typeof self.postMessage === 'function' && typeof window === 'undefined') {
    self.onmessage = (e) => {
      const req = e.data;
      try {
        let res;
        if (req.type === 'genmove') res = genmove(req);
        else if (req.type === 'estimate') res = estimate(req);
        else if (req.type === 'evaluate') res = evaluate(req);
        else if (req.type === 'ping') res = { ok: true };
        else res = { error: 'unknown' };
        self.postMessage(Object.assign({ id: req.id, type: req.type }, res));
      } catch (err) {
        self.postMessage({ id: req.id, type: req.type, error: String(err && err.stack || err) });
      }
    };
  }
  root.BadukEngine = api;
})(typeof self !== 'undefined' ? self : this);
