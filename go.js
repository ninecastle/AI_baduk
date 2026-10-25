/* go.js — 바둑 규칙 참조 구현 (UI·기보·계가용)
   브라우저(window.Go)와 워커/노드(module.exports) 모두에서 사용 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Go = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const EMPTY = 0, BLACK = 1, WHITE = 2;
  const PASS = -1;

  function other(c) { return 3 - c; }

  // 결정적 난수 (조브리스트 해시용)
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return (t ^ t >>> 14) >>> 0;
    };
  }

  const zobristCache = {};
  function zobrist(size) {
    if (zobristCache[size]) return zobristCache[size];
    const n = size * size;
    const rnd = mulberry32(90125 + size);
    const a = [null, new Uint32Array(n), new Uint32Array(n)];
    const b = [null, new Uint32Array(n), new Uint32Array(n)];
    for (const c of [1, 2]) for (let i = 0; i < n; i++) { a[c][i] = rnd(); b[c][i] = rnd(); }
    return (zobristCache[size] = { a, b });
  }

  const neighborCache = {};
  function neighborTable(size) {
    if (neighborCache[size]) return neighborCache[size];
    const n = size * size;
    const t = new Array(n);
    for (let p = 0; p < n; p++) {
      const x = p % size, y = (p / size) | 0, arr = [];
      if (x > 0) arr.push(p - 1);
      if (x < size - 1) arr.push(p + 1);
      if (y > 0) arr.push(p - size);
      if (y < size - 1) arr.push(p + size);
      t[p] = arr;
    }
    return (neighborCache[size] = t);
  }

  class Board {
    constructor(size) {
      this.size = size;
      this.n = size * size;
      this.stones = new Uint8Array(this.n);
      this.toPlay = BLACK;
      this.ko = -1;                 // 단순 패 금지점
      this.captures = [0, 0, 0];    // captures[c] = c가 따낸 돌 수
      this.moves = [];              // {c, p}  p = PASS(-1) 또는 좌표 인덱스
      this.passes = 0;              // 연속 패스
      this.ha = 0; this.hb = 0;     // 조브리스트 해시
      this.hashes = new Set(['0:0']);
      this.nb = neighborTable(size);
      this.z = zobrist(size);
    }

    clone() {
      const b = new Board(this.size);
      b.stones.set(this.stones);
      b.toPlay = this.toPlay; b.ko = this.ko;
      b.captures = this.captures.slice();
      b.moves = this.moves.slice();
      b.passes = this.passes;
      b.ha = this.ha; b.hb = this.hb;
      b.hashes = new Set(this.hashes);
      return b;
    }

    idx(x, y) { return y * this.size + x; }
    xy(p) { return [p % this.size, (p / this.size) | 0]; }
    get(p) { return this.stones[p]; }

    hashKey() { return this.ha + ':' + this.hb; }
    _toggle(p, c) { this.ha ^= this.z.a[c][p]; this.hb ^= this.z.b[c][p]; }

    /** p의 돌이 속한 그룹과 활로 */
    group(p) {
      const c = this.stones[p];
      if (c === EMPTY) return null;
      const seen = new Uint8Array(this.n);
      const stones = [], libs = new Set();
      const stack = [p]; seen[p] = 1;
      while (stack.length) {
        const q = stack.pop();
        stones.push(q);
        for (const r of this.nb[q]) {
          const cr = this.stones[r];
          if (cr === EMPTY) libs.add(r);
          else if (cr === c && !seen[r]) { seen[r] = 1; stack.push(r); }
        }
      }
      return { color: c, stones, libs: [...libs] };
    }

    /** 모든 그룹 목록 */
    groups() {
      const seen = new Uint8Array(this.n);
      const out = [];
      for (let p = 0; p < this.n; p++) {
        if (this.stones[p] === EMPTY || seen[p]) continue;
        const g = this.group(p);
        for (const s of g.stones) seen[s] = 1;
        out.push(g);
      }
      return out;
    }

    /** 착수 합법성. {ok, reason} */
    check(p, c) {
      c = c || this.toPlay;
      if (p === PASS) return { ok: true };
      if (p < 0 || p >= this.n) return { ok: false, reason: 'out' };
      if (this.stones[p] !== EMPTY) return { ok: false, reason: 'occupied' };
      if (p === this.ko) return { ok: false, reason: 'ko' };
      // 자충 검사 및 동형반복 검사(착수 시뮬레이션)
      const sim = this._simulate(p, c);
      if (!sim.ok) return { ok: false, reason: 'suicide' };
      if (this.hashes.has(sim.ha + ':' + sim.hb)) return { ok: false, reason: 'superko' };
      return { ok: true };
    }

    _simulate(p, c) {
      const o = other(c);
      let ha = this.ha ^ this.z.a[c][p], hb = this.hb ^ this.z.b[c][p];
      this.stones[p] = c;
      let captured = [];
      for (const q of this.nb[p]) {
        if (this.stones[q] === o) {
          const g = this.group(q);
          if (g.libs.length === 0) captured.push(...g.stones);
        }
      }
      // 중복 제거
      captured = [...new Set(captured)];
      let ok = true;
      if (captured.length === 0) {
        const g = this.group(p);
        if (g.libs.length === 0) ok = false;
      }
      this.stones[p] = EMPTY;
      for (const s of captured) { ha ^= this.z.a[o][s]; hb ^= this.z.b[o][s]; }
      return { ok, captured, ha, hb };
    }

    /** 착수. 불법이면 throw. 반환: {captured:[...]} */
    play(p, c) {
      c = c || this.toPlay;
      if (p === PASS) {
        this.moves.push({ c, p: PASS });
        this.passes++;
        this.ko = -1;
        this.toPlay = other(c);
        return { captured: [] };
      }
      const chk = this.check(p, c);
      if (!chk.ok) throw new Error('illegal:' + chk.reason);
      const sim = this._simulate(p, c);
      const o = other(c);
      this.stones[p] = c;
      for (const s of sim.captured) this.stones[s] = EMPTY;
      this.captures[c] += sim.captured.length;
      this.ha = sim.ha; this.hb = sim.hb;
      this.hashes.add(this.hashKey());
      // 단순 패: 한 점 따내고, 둔 돌이 홀로 활로 1개
      this.ko = -1;
      if (sim.captured.length === 1) {
        const g = this.group(p);
        if (g.stones.length === 1 && g.libs.length === 1) this.ko = sim.captured[0];
      }
      this.moves.push({ c, p });
      this.passes = 0;
      this.toPlay = o;
      return { captured: sim.captured };
    }

    /** 수순 전체로 판 재구성 */
    static fromMoves(size, moves, setup) {
      const b = new Board(size);
      if (setup) {
        for (const p of (setup.black || [])) { b.stones[p] = BLACK; b._toggle(p, BLACK); }
        for (const p of (setup.white || [])) { b.stones[p] = WHITE; b._toggle(p, WHITE); }
        b.hashes = new Set([b.hashKey()]);
        if (setup.toPlay) b.toPlay = setup.toPlay;
      }
      for (const m of moves) b.play(m.p, m.c);
      return b;
    }

    /** 합법 착점 목록 */
    legalMoves(c) {
      c = c || this.toPlay;
      const out = [];
      for (let p = 0; p < this.n; p++) if (this.stones[p] === EMPTY && this.check(p, c).ok) out.push(p);
      return out;
    }
  }

  /** 접바둑 치석 위치 */
  function handicapPoints(size, k) {
    const pts = [];
    if (k < 2) return pts;
    let e;
    if (size >= 13) e = 3; else if (size >= 9) e = 2; else return pts;
    const m = (size - 1) / 2, f = size - 1 - e;
    const P = (x, y) => y * size + x;
    const corners = [P(f, e), P(e, f), P(f, f), P(e, e)]; // 우상, 좌하, 우하, 좌상
    const edges = [P(m, e), P(m, f), P(e, m), P(f, m)];
    const center = P(m, m);
    let list;
    if (size === 9) {
      list = [corners[0], corners[1], corners[2], corners[3], center];
      if (k === 2) list = [corners[0], corners[1]];
      return list.slice(0, Math.min(k, 5));
    }
    switch (k) {
      case 2: list = [corners[0], corners[1]]; break;
      case 3: list = [corners[0], corners[1], corners[2]]; break;
      case 4: list = corners.slice(); break;
      case 5: list = corners.concat([center]); break;
      case 6: list = corners.concat([edges[2], edges[3]]); break;
      case 7: list = corners.concat([edges[2], edges[3], center]); break;
      case 8: list = corners.concat(edges); break;
      default: list = corners.concat(edges, [center]); break;
    }
    return list.slice(0, Math.min(k, 9));
  }

  function starPoints(size) {
    if (size < 7) return [];
    const e = size >= 13 ? 3 : 2, m = (size - 1) / 2, f = size - 1 - e;
    const P = (x, y) => y * size + x;
    const pts = [P(e, e), P(f, e), P(e, f), P(f, f)];
    if (size % 2 === 1) {
      pts.push(P(m, m));
      if (size >= 13) pts.push(P(m, e), P(m, f), P(e, m), P(f, m));
    }
    return pts;
  }

  /** 집 계가(한국·일본식). dead: 사석 좌표 Set
      반환: {black:{territory,prisoners,total}, white:{territory,prisoners,komi,total}, owner:Int8Array, diff, result} */
  function territoryScore(board, dead, komi) {
    const n = board.n, size = board.size;
    const col = new Uint8Array(board.stones);
    let deadB = 0, deadW = 0;
    for (const p of dead) {
      if (col[p] === BLACK) deadB++;
      else if (col[p] === WHITE) deadW++;
      col[p] = EMPTY;
    }
    const owner = new Int8Array(n);
    const seen = new Uint8Array(n);
    const nb = neighborTable(size);
    let tB = 0, tW = 0;
    for (let p = 0; p < n; p++) {
      if (col[p] !== EMPTY || seen[p]) continue;
      const region = []; const stack = [p]; seen[p] = 1;
      let sawB = false, sawW = false;
      while (stack.length) {
        const q = stack.pop(); region.push(q);
        for (const r of nb[q]) {
          if (col[r] === EMPTY) { if (!seen[r]) { seen[r] = 1; stack.push(r); } }
          else if (col[r] === BLACK) sawB = true; else sawW = true;
        }
      }
      let o = 0;
      if (sawB && !sawW) o = BLACK; else if (sawW && !sawB) o = WHITE;
      for (const q of region) owner[q] = o;
      if (o === BLACK) tB += region.length; else if (o === WHITE) tW += region.length;
    }
    // 사석 자리는 상대 집으로 포함되므로 owner 표시 유지
    const prisB = board.captures[BLACK] + deadW; // 흑이 잡은 백돌
    const prisW = board.captures[WHITE] + deadB;
    const black = { territory: tB, prisoners: prisB, total: tB + prisB };
    const white = { territory: tW, prisoners: prisW, komi, total: tW + prisW + komi };
    const diff = black.total - white.total;
    return { black, white, owner, diff, result: resultString(diff) };
  }

  /** 영역 계가(중국식): 돌 + 집 */
  function areaScore(board, dead, komi) {
    const t = territoryScore(board, dead, 0);
    let sB = 0, sW = 0;
    for (let p = 0; p < board.n; p++) {
      if (dead.has(p)) continue;
      if (board.stones[p] === BLACK) sB++; else if (board.stones[p] === WHITE) sW++;
    }
    // 사석 자리는 상대 집으로 계산됨 (territoryScore의 owner)
    const black = { area: sB + t.black.territory, total: sB + t.black.territory };
    const white = { area: sW + t.white.territory, komi, total: sW + t.white.territory + komi };
    const diff = black.total - white.total;
    return { black, white, owner: t.owner, diff, result: resultString(diff) };
  }

  function resultString(diff) {
    if (diff === 0) return '빅 (무승부)';
    const w = diff > 0 ? '흑' : '백';
    return `${w} ${Math.abs(diff)}집 승`;
  }

  // ───── SGF ─────
  const SGF_LETTERS = 'abcdefghijklmnopqrstuvwxyz';
  function toSgfCoord(p, size) {
    if (p === PASS || p == null) return '';
    const x = p % size, y = (p / size) | 0;
    return SGF_LETTERS[x] + SGF_LETTERS[y];
  }
  function fromSgfCoord(s, size) {
    if (!s || s.length < 2 || s === 'tt') return PASS;
    const x = SGF_LETTERS.indexOf(s[0]), y = SGF_LETTERS.indexOf(s[1]);
    if (x < 0 || y < 0 || x >= size || y >= size) return PASS;
    return y * size + x;
  }

  function toSGF(g) {
    const esc = s => String(s == null ? '' : s).replace(/[\]\\]/g, m => '\\' + m);
    const parts = ['(;GM[1]FF[4]CA[UTF-8]AP[BadukLab]SZ[' + g.size + ']KM[' + g.komi + ']'];
    if (g.rules) parts.push('RU[' + esc(g.rules) + ']');
    if (g.handicap >= 2) parts.push('HA[' + g.handicap + ']');
    if (g.date) parts.push('DT[' + esc(g.date) + ']');
    if (g.black) parts.push('PB[' + esc(g.black) + ']');
    if (g.white) parts.push('PW[' + esc(g.white) + ']');
    if (g.blackRank) parts.push('BR[' + esc(g.blackRank) + ']');
    if (g.whiteRank) parts.push('WR[' + esc(g.whiteRank) + ']');
    if (g.result) parts.push('RE[' + esc(g.result) + ']');
    if (g.comment) parts.push('GC[' + esc(g.comment) + ']');
    if (g.setup && g.setup.black && g.setup.black.length) parts.push('AB' + g.setup.black.map(p => '[' + toSgfCoord(p, g.size) + ']').join(''));
    if (g.setup && g.setup.white && g.setup.white.length) parts.push('AW' + g.setup.white.map(p => '[' + toSgfCoord(p, g.size) + ']').join(''));
    for (const m of g.moves) parts.push(';' + (m.c === BLACK ? 'B' : 'W') + '[' + toSgfCoord(m.p, g.size) + ']');
    parts.push(')');
    return parts.join('');
  }

  /** 간단 SGF 파서 (주 분기만) */
  function parseSGF(text) {
    const props = []; // [{name, values:[]}] 노드 순서대로
    let i = 0; const n = text.length;
    const nodes = [];
    let depth = 0, mainDone = false;
    while (i < n) {
      const ch = text[i];
      if (ch === '(') { depth++; if (depth > 1 && nodes.length) { /* 변화 분기 시작 */ } i++; continue; }
      if (ch === ')') { depth--; i++; if (depth >= 1) { mainDone = true; } continue; }
      if (ch === ';') {
        if (mainDone) { i++; continue; }
        const node = {}; i++;
        while (i < n && text[i] !== ';' && text[i] !== '(' && text[i] !== ')') {
          if (/\s/.test(text[i])) { i++; continue; }
          let name = '';
          while (i < n && /[A-Za-z]/.test(text[i])) { name += text[i++]; }
          const values = [];
          while (i < n && text[i] === '[') {
            i++; let v = '';
            while (i < n && text[i] !== ']') { if (text[i] === '\\') { i++; } v += text[i++]; }
            i++; values.push(v);
          }
          if (name) node[name.toUpperCase()] = values;
        }
        nodes.push(node);
        continue;
      }
      i++;
    }
    if (!nodes.length) throw new Error('SGF 형식이 아닙니다');
    const rootN = nodes[0];
    const size = rootN.SZ ? parseInt(rootN.SZ[0], 10) : 19;
    const g = {
      size, komi: rootN.KM ? parseFloat(rootN.KM[0]) : 6.5,
      handicap: rootN.HA ? parseInt(rootN.HA[0], 10) : 0,
      black: rootN.PB ? rootN.PB[0] : '', white: rootN.PW ? rootN.PW[0] : '',
      result: rootN.RE ? rootN.RE[0] : '', date: rootN.DT ? rootN.DT[0] : '',
      setup: { black: [], white: [] }, moves: [],
    };
    for (const node of nodes) {
      if (node.AB) g.setup.black.push(...node.AB.map(s => fromSgfCoord(s, size)).filter(p => p >= 0));
      if (node.AW) g.setup.white.push(...node.AW.map(s => fromSgfCoord(s, size)).filter(p => p >= 0));
      if (node.B) g.moves.push({ c: BLACK, p: fromSgfCoord(node.B[0], size) });
      if (node.W) g.moves.push({ c: WHITE, p: fromSgfCoord(node.W[0], size) });
    }
    return g;
  }

  /** 좌표 표기: A19 등 (I 제외) */
  const COORD_LETTERS = 'ABCDEFGHJKLMNOPQRST';
  function coordLabel(p, size) {
    if (p === PASS) return '패스';
    const x = p % size, y = (p / size) | 0;
    return COORD_LETTERS[x] + (size - y);
  }

  return { EMPTY, BLACK, WHITE, PASS, other, Board, neighborTable, handicapPoints, starPoints,
    territoryScore, areaScore, resultString, toSGF, parseSGF, coordLabel, COORD_LETTERS };
});
