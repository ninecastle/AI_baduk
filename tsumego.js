/* tsumego.js — 사활 풀이기 (깊이 제한 AND/OR 탐색, 전치표, 벤슨 패스얼라이브, 패 처리)
   KataBoard 위에서 동작. 생성기(node)와 앱(브라우저) 공용. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./kata/kataboard.js'));
  else root.Tsumego = factory(root.KataBoard);
})(typeof self !== 'undefined' ? self : this, function (KB) {
  'use strict';
  const { EMPTY, BLACK, WHITE, WALL, NULL_LOC, PASS_LOC, Board, getOpp } = KB;

  /** 문제 정의 → 탐색 컨텍스트
   *  problem: { size, black:[pos], white:[pos], target:[pos](수비측 돌), attacker: color, toPlay, goal:'kill'|'live' }
   */
  class Solver {
    constructor(opts) {
      this.maxNodes = (opts && opts.maxNodes) || 400000;
      this.nodes = 0; this.tt = new Map();
    }
    static makeBoard(problem) {
      const b = new Board(problem.size);
      const L = problem.size;
      const loc = p => b.loc(p % L, (p / L) | 0);
      for (const p of problem.black) b.playMoveAssumeLegal(loc(p), BLACK);
      for (const p of problem.white) b.playMoveAssumeLegal(loc(p), WHITE);
      b.ko = NULL_LOC;
      return b;
    }
    /** 후보 영역: 목표 돌의 활로에서 빈 점을 따라 확장 (cap 초과 시 null) + 인접 공격측 체인의 바깥 활로(2개 미만일 때) */
    static region(board, targetLocs, attacker, cap) {
      const defender = getOpp(attacker);
      const seen = new Set(); const stack = [];
      for (const t of targetLocs) for (let i = 0; i < 4; i++) { const a = t + board.adj[i]; if (board.colors[a] === EMPTY && !seen.has(a)) { seen.add(a); stack.push(a); } }
      while (stack.length) {
        const p = stack.pop();
        if (seen.size > cap) return null;
        for (let i = 0; i < 4; i++) { const a = p + board.adj[i]; if (board.colors[a] === EMPTY && !seen.has(a)) { seen.add(a); stack.push(a); } }
      }
      // 영역에 인접한 공격측 체인의 활로가 영역 밖에 있고 적으면 포함 (잡힐 수 있으므로)
      const extra = new Set();
      const heads = new Set();
      for (const p of seen) for (let i = 0; i < 4; i++) { const a = p + board.adj[i]; if (board.colors[a] === attacker) heads.add(board.chainHead[a]); }
      for (const h of heads) {
        const libs = []; let cur = h;
        do { for (let i = 0; i < 4; i++) { const a = cur + board.adj[i]; if (board.colors[a] === EMPTY && !libs.includes(a)) libs.push(a); } cur = board.next[cur]; } while (cur !== h);
        const outside = libs.filter(l => !seen.has(l));
        if (outside.length <= 2) for (const l of outside) extra.add(l);
      }
      for (const e of extra) seen.add(e);
      return [...seen];
    }

    targetAlive(board, targetHeads) { // 벤슨 패스얼라이브 여부 (목표 돌 전부)
      const area = this._area || (this._area = new Uint8Array(board.M));
      board.calculateArea(area, false, false, false, false);
      for (const t of this.targetLocs) if (board.colors[t] === this.defender && area[t] !== this.defender) return false;
      return true;
    }
    targetCaptured(board) { for (const t of this.targetLocs) if (board.colors[t] === this.defender) return false; return true; }
    targetStonesLeft(board) { let n = 0; for (const t of this.targetLocs) if (board.colors[t] === this.defender) n++; return n; }

    legalFor(board, loc, pla) {
      if (board.colors[loc] !== EMPTY) return false;
      if (loc === board.ko && this.koFavor !== pla) return false; // 패 우대측은 패 금지 무시
      return !board.isSuicide(loc, pla);
    }
    moves(board, pla) {
      const out = [];
      for (const loc of this.cands) if (this.legalFor(board, loc, pla)) out.push(loc);
      // 정렬: 따냄/단수 관련 수 우선
      const opp = getOpp(pla);
      const score = loc => {
        let s = 0;
        for (let i = 0; i < 4; i++) {
          const a = loc + board.adj[i], c = board.colors[a];
          if (c === opp) { const l = board.getNumLiberties(a); if (l === 1) s += 50; else if (l === 2) s += 8; }
          else if (c === pla) { const l = board.getNumLiberties(a); if (l === 1) s += 30; }
          else if (c === EMPTY) s += 3;
        }
        return s;
      };
      out.sort((a, b) => score(b) - score(a));
      return out;
    }

    /** 공격측 차례: depth 안에 잡을 수 있는가 */
    kill(board, depth, pla) {
      this.nodes++;
      if (this.targetCaptured(board)) return true;
      if (this.nodes > this.maxNodes) throw new Error('budget');
      const key = board.h0 + ':' + board.h1 + ':' + pla + ':' + board.ko;
      let t = this.tt.get(key);
      if (t !== undefined) { if (depth >= t.kT) return true; if (depth <= t.kF) return false; }
      if (this.targetAlive(board)) { this.tt.set(key, { kT: Infinity, kF: Infinity, lT: 0, lF: -1 }); return false; }
      if (depth <= 0) return false;
      let res = false;
      if (pla === this.attacker) {
        for (const m of this.moves(board, pla)) {
          const rec = board.playMoveRecorded(m, pla);
          const ok = this.kill(board, depth - 1, getOpp(pla));
          board.undo(rec);
          if (ok) { res = true; this.bestKill.set(key, m); break; }
        }
      } else {
        // 수비측: 모든 응수(패스 포함)에 대해 잡혀야 함
        res = true;
        const ms = this.moves(board, pla);
        ms.push(PASS_LOC);
        for (const m of ms) {
          const rec = board.playMoveRecorded(m, pla);
          const ok = this.kill(board, depth - 1, getOpp(pla));
          board.undo(rec);
          if (!ok) { res = false; this.bestKill.set(key, m); break; } // 수비 성공수 기록
        }
      }
      t = this.tt.get(key); if (!t) { t = { kT: Infinity, kF: -1, lT: Infinity, lF: -1 }; this.tt.set(key, t); }
      if (res) { if (depth < t.kT) t.kT = depth; } else { if (depth > t.kF) t.kF = depth; }
      return res;
    }
    /** 수비측 관점: depth 안에 패스얼라이브로 살 수 있는가 */
    live(board, depth, pla) {
      this.nodes++;
      if (this.targetCaptured(board)) return false;
      if (this.nodes > this.maxNodes) throw new Error('budget');
      const key = board.h0 + ':' + board.h1 + ':' + pla + ':' + board.ko;
      let t = this.tt.get(key);
      if (t !== undefined) { if (depth >= t.lT) return true; if (depth <= t.lF) return false; }
      if (this.targetAlive(board)) { this.tt.set(key, { kT: Infinity, kF: Infinity, lT: 0, lF: -1 }); return true; }
      if (depth <= 0) return false;
      let res = false;
      if (pla === this.defender) {
        for (const m of this.moves(board, pla)) {
          const rec = board.playMoveRecorded(m, pla);
          const ok = this.live(board, depth - 1, getOpp(pla));
          board.undo(rec);
          if (ok) { res = true; this.bestLive.set(key, m); break; }
        }
      } else {
        res = true;
        const ms = this.moves(board, pla);
        ms.push(PASS_LOC);
        for (const m of ms) {
          const rec = board.playMoveRecorded(m, pla);
          const ok = this.live(board, depth - 1, getOpp(pla));
          board.undo(rec);
          if (!ok) { res = false; this.bestLive.set(key, m); break; }
        }
      }
      t = this.tt.get(key); if (!t) { t = { kT: Infinity, kF: -1, lT: Infinity, lF: -1 }; this.tt.set(key, t); }
      if (res) { if (depth < t.lT) t.lT = depth; } else { if (depth > t.lF) t.lF = depth; }
      return res;
    }

    /**
     * 풀이. 반환 { result:'kill'|'live'|'unknown', depth, move(첫 수 loc), line:[loc...], nodes }
     * goal: 'kill' (공격측이 잡기) | 'live' (수비측이 살기). koFavor: 패 우대 색 (null=엄격)
     */
    solve(problem, opts) {
      opts = opts || {};
      const board = Solver.makeBoard(problem);
      const L = problem.size;
      this.attacker = problem.attacker; this.defender = getOpp(problem.attacker);
      this.targetLocs = problem.target.map(p => board.loc(p % L, (p / L) | 0));
      this.koFavor = opts.koFavor == null ? null : opts.koFavor;
      const cands = opts.region ? opts.region.map(p => board.loc(p % L, (p / L) | 0)) : Solver.region(board, this.targetLocs, this.attacker, opts.regionCap || 14);
      if (!cands) return { result: 'unknown', reason: 'region too big' };
      this.cands = cands;
      this.tt = new Map(); this.bestKill = new Map(); this.bestLive = new Map(); this.nodes = 0;
      const maxDepth = opts.maxDepth || 12;
      const goal = opts.goal || problem.goal;
      const toPlay = problem.toPlay;
      try {
        for (let d = 1; d <= maxDepth; d++) {
          let ok;
          if (goal === 'kill') ok = this.kill(board, d, toPlay); else ok = this.live(board, d, toPlay);
          if (ok) {
            const line = this.extractLine(board, goal, toPlay, d);
            return { result: goal, depth: d, move: line.length ? line[0] : PASS_LOC, line, nodes: this.nodes, regionLocs: cands };
          }
        }
      } catch (e) { if (e.message !== 'budget') throw e; return { result: 'unknown', reason: 'budget', nodes: this.nodes, regionLocs: cands }; }
      return { result: 'unknown', reason: 'depth', nodes: this.nodes, regionLocs: cands };
    }
    /** 주 수순: 이기는 쪽은 기록된 최선수, 지는 쪽은 가장 오래 버티는 수 */
    extractLine(board, goal, toPlay, depth) {
      const line = []; const b = board.clone(); let pla = toPlay;
      const best = goal === 'kill' ? this.bestKill : this.bestLive;
      const winner = goal === 'kill' ? this.attacker : this.defender;
      const proven = bb => goal === 'kill' ? this.targetCaptured(bb) : this.targetAlive(bb);
      const provable = (bb, p, d) => { try { return goal === 'kill' ? this.kill(bb, d, p) : this.live(bb, d, p); } catch (_) { return false; } };
      let remaining = depth;
      for (let i = 0; i < depth + 4 && remaining >= 0; i++) {
        if (proven(b)) break;
        const key = b.h0 + ':' + b.h1 + ':' + pla + ':' + b.ko;
        let m;
        if (pla === winner) {
          m = best.get(key);
          if (m === undefined) { // 기록이 없으면 다시 찾기
            for (const cand of this.moves(b, pla)) { const r = b.playMoveRecorded(cand, pla); const ok = provable(b, getOpp(pla), remaining - 1); b.undo(r); if (ok) { m = cand; break; } }
          }
          if (m === undefined) break;
        } else {
          // 가장 오래 버티는 응수: 이기는 쪽이 필요로 하는 최소 깊이가 가장 큰 수
          let bestM = PASS_LOC, bestD = -1;
          const ms = this.moves(b, pla); ms.push(PASS_LOC);
          for (const cand of ms) {
            const r = b.playMoveRecorded(cand, pla);
            let need = -1;
            for (let d = 0; d <= remaining - 1; d++) { if (provable(b, getOpp(pla), d)) { need = d; break; } }
            b.undo(r);
            if (need < 0) need = remaining; // 못 잡는 수(있을 수 없지만) 최우선
            if (need > bestD || (need === bestD && bestM === PASS_LOC && cand !== PASS_LOC)) { bestD = need; bestM = cand; }
          }
          m = bestM;
        }
        line.push(m); b.playMoveAssumeLegal(m, pla); pla = getOpp(pla); remaining--;
      }
      return line;
    }
  }

  return { Solver };
});
