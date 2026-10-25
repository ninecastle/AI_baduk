/* kataboard.js — KataGo 식 바둑판 (체인·활로 추적, 되돌리기, 축 탐색, 벤슨 패스얼라이브, 조브리스트 해시)
   KataGo cpp/game/board.cpp 를 충실히 이식. 신경망 입력 특징 계산에 사용. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KataBoard = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const EMPTY = 0, BLACK = 1, WHITE = 2, WALL = 3;
  const NULL_LOC = 0, PASS_LOC = 1;
  const getOpp = c => 3 - c;

  // ── 조브리스트 (결정적) ──
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return (t ^ t >>> 14) >>> 0; }; }
  const Z_MAX = 22 * 23 + 1;
  const ZOB = [new Uint32Array(Z_MAX * 4), new Uint32Array(Z_MAX * 4)];
  { const r = mulberry32(0x5EED1234); for (let i = 0; i < Z_MAX * 4; i++) { ZOB[0][i] = r(); ZOB[1][i] = r(); } }

  class Board {
    constructor(size) {
      this.size = size; this.W = size + 1;
      this.M = (size + 1) * (size + 2) + 1;
      const M = this.M;
      this.colors = new Uint8Array(M).fill(WALL);
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) this.colors[this.loc(x, y)] = EMPTY;
      this.chainHead = new Int16Array(M);
      this.next = new Int16Array(M);
      this.libs = new Int16Array(M);   // by head
      this.csize = new Int16Array(M);  // by head
      this.ko = NULL_LOC;
      this.adj = [-this.W, -1, 1, this.W];
      this.diag = [-this.W - 1, -this.W + 1, this.W - 1, this.W + 1];
      this.h0 = 0; this.h1 = 0;
      this.numBlackCaptures = 0; this.numWhiteCaptures = 0; // 잡힌 돌 수 (그 색의 돌)
    }
    loc(x, y) { return (x + 1) + (y + 1) * this.W; }
    x(loc) { return (loc % this.W) - 1; }
    y(loc) { return ((loc / this.W) | 0) - 1; }
    clone() { const b = new Board(this.size); b.copyFrom(this); return b; }
    copyFrom(b) {
      this.colors.set(b.colors); this.chainHead.set(b.chainHead); this.next.set(b.next); this.libs.set(b.libs); this.csize.set(b.csize);
      this.ko = b.ko; this.h0 = b.h0; this.h1 = b.h1; this.numBlackCaptures = b.numBlackCaptures; this.numWhiteCaptures = b.numWhiteCaptures;
    }
    hashKey() { return this.h0 + ':' + this.h1; }
    _hx(loc, c) { this.h0 ^= ZOB[0][loc * 4 + c]; this.h1 ^= ZOB[1][loc * 4 + c]; }

    getNumLiberties(loc) { return this.libs[this.chainHead[loc]]; }
    getChainSize(loc) { return this.csize[this.chainHead[loc]]; }
    getNumImmediateLiberties(loc) {
      const c = this.colors, a = this.adj; let n = 0;
      if (c[loc + a[0]] === EMPTY) n++; if (c[loc + a[1]] === EMPTY) n++; if (c[loc + a[2]] === EMPTY) n++; if (c[loc + a[3]] === EMPTY) n++;
      return n;
    }
    isSuicide(loc, pla) {
      if (loc === PASS_LOC) return false;
      const opp = getOpp(pla), c = this.colors;
      for (let i = 0; i < 4; i++) {
        const adj = loc + this.adj[i], ca = c[adj];
        if (ca === EMPTY) return false;
        if (ca === pla) { if (this.getNumLiberties(adj) > 1) return false; }
        else if (ca === opp) { if (this.getNumLiberties(adj) === 1) return false; }
      }
      return true;
    }
    isLegal(loc, pla) {
      if (loc === PASS_LOC) return true;
      return loc >= 0 && loc < this.M && this.colors[loc] === EMPTY && loc !== this.ko && !this.isSuicide(loc, pla);
    }
    wouldBeKoCapture(loc, pla) {
      const c = this.colors; if (c[loc] !== EMPTY) return false;
      const opp = getOpp(pla); let cap = NULL_LOC;
      for (let i = 0; i < 4; i++) {
        const adj = loc + this.adj[i];
        if (c[adj] !== WALL && c[adj] !== opp) return false;
        if (c[adj] === opp && this.getNumLiberties(adj) === 1) { if (cap !== NULL_LOC) return false; cap = adj; }
      }
      if (cap === NULL_LOC) return false;
      return this.csize[this.chainHead[cap]] === 1;
    }
    isAdjacentToPla(loc, pla) { const c = this.colors; for (let i = 0; i < 4; i++) if (c[loc + this.adj[i]] === pla) return true; return false; }
    isAdjacentToPlaHead(pla, loc, head) { const c = this.colors; for (let i = 0; i < 4; i++) { const a = loc + this.adj[i]; if (c[a] === pla && this.chainHead[a] === head) return true; } return false; }
    isLibertyOf(loc, head) {
      const c = this.colors, ch = this.chainHead, col = c[head];
      for (let i = 0; i < 4; i++) { const a = loc + this.adj[i]; if (c[a] === col && ch[a] === head) return true; }
      return false;
    }
    getBoundNumLibertiesAfterPlay(loc, pla) {
      const opp = getOpp(pla), c = this.colors;
      let imm = 0, numCaps = 0, potCap = 0, connSum = 0, connMax = 0;
      for (let i = 0; i < 4; i++) {
        const adj = loc + this.adj[i], ca = c[adj];
        if (ca === EMPTY) imm++;
        else if (ca === opp) { const h = this.chainHead[adj]; if (this.libs[h] === 1) { numCaps++; potCap += this.csize[h]; } }
        else if (ca === pla) { const l = this.libs[this.chainHead[adj]] - 1; connSum += l; if (l > connMax) connMax = l; }
      }
      return [numCaps + (connMax > imm ? connMax : imm), imm + potCap + connSum];
    }
    getNumLibertiesAfterPlay(loc, pla, max) {
      const opp = getOpp(pla), c = this.colors, ch = this.chainHead;
      const libs = []; const capHeads = [];
      for (let i = 0; i < 4; i++) {
        const adj = loc + this.adj[i];
        if (c[adj] === EMPTY) { libs.push(adj); if (libs.length >= max) return max; }
        else if (c[adj] === opp && this.getNumLiberties(adj) === 1) {
          libs.push(adj); if (libs.length >= max) return max;
          const h = ch[adj]; if (!capHeads.includes(h)) capHeads.push(h);
        }
      }
      const wouldBeEmpty = (lc) => { if (c[lc] === EMPTY) return true; if (c[lc] === opp) return capHeads.includes(ch[lc]); return false; };
      const connHeads = [];
      for (let i = 0; i < 4; i++) {
        const adj = loc + this.adj[i];
        if (c[adj] === pla) {
          const h = ch[adj]; if (connHeads.includes(h)) continue; connHeads.push(h);
          let cur = adj;
          do {
            for (let k = 0; k < 4; k++) {
              const pl = cur + this.adj[k];
              if (pl !== loc && wouldBeEmpty(pl) && !libs.includes(pl)) { libs.push(pl); if (libs.length >= max) return max; }
            }
            cur = this.next[cur];
          } while (cur !== adj);
        }
      }
      return libs.length;
    }
    countHeuristicConnectionLibertiesX2(loc, pla) {
      let n = 0; const c = this.colors;
      for (let i = 0; i < 4; i++) { const adj = loc + this.adj[i]; if (c[adj] === pla) { const l = this.libs[this.chainHead[adj]]; if (l > 1) n += l * 2 - 3; } }
      return n;
    }

    // ── 착수 ──
    playMoveAssumeLegal(loc, pla) {
      if (loc === PASS_LOC) { this.ko = NULL_LOC; return; }
      const opp = getOpp(pla), c = this.colors, ch = this.chainHead;
      c[loc] = pla; this._hx(loc, pla);
      ch[loc] = loc; this.next[loc] = loc; this.csize[loc] = 1; this.libs[loc] = this.getNumImmediateLiberties(loc);
      let numCaptured = 0, possibleKo = NULL_LOC;
      const oppSeen = [];
      for (let i = 0; i < 4; i++) {
        const adj = loc + this.adj[i];
        if (c[adj] === pla) {
          if (ch[adj] === ch[loc]) continue;
          this.libs[ch[adj]]--;
          this._mergeChains(adj, loc);
        } else if (c[adj] === opp) {
          const oh = ch[adj];
          if (oppSeen.includes(oh)) continue;
          this.libs[oh]--; oppSeen.push(oh);
          if (this.libs[oh] === 0) { numCaptured += this._removeChain(adj); possibleKo = adj; }
        }
      }
      const h = ch[loc];
      this.ko = (numCaptured === 1 && this.csize[h] === 1 && this.libs[h] === 1) ? possibleKo : NULL_LOC;
      if (pla === BLACK) this.numWhiteCaptures += numCaptured; else this.numBlackCaptures += numCaptured;
      if (this.libs[ch[loc]] === 0) { // 자살수 (허용 시)
        const n = this.csize[ch[loc]]; this._removeChain(loc);
        if (pla === BLACK) this.numBlackCaptures += n; else this.numWhiteCaptures += n;
      }
    }
    playMoveRecorded(loc, pla) {
      const rec = { loc, pla, ko: this.ko, capDirs: 0 };
      if (loc !== PASS_LOC) {
        const opp = getOpp(pla), c = this.colors;
        for (let i = 0; i < 4; i++) { const adj = loc + this.adj[i]; if (c[adj] === opp && this.getNumLiberties(adj) === 1) rec.capDirs |= (1 << i); }
        if (rec.capDirs === 0 && this.isSuicide(loc, pla)) rec.capDirs = 0x10;
      }
      this.playMoveAssumeLegal(loc, pla);
      return rec;
    }
    undo(rec) {
      this.ko = rec.ko;
      const loc = rec.loc; if (loc === PASS_LOC) return;
      const c = this.colors, ch = this.chainHead, pla = rec.pla, opp = getOpp(pla);
      for (let i = 0; i < 4; i++) {
        const adj = loc + this.adj[i];
        if (rec.capDirs & (1 << i)) {
          if (c[adj] === EMPTY) {
            this._addChain(adj, opp);
            const n = this.csize[ch[adj]];
            if (pla === BLACK) this.numWhiteCaptures -= n; else this.numBlackCaptures -= n;
          }
        }
      }
      if (rec.capDirs === 0x10) {
        this._addChain(loc, pla);
        const n = this.csize[ch[loc]];
        if (pla === BLACK) this.numBlackCaptures -= n; else this.numWhiteCaptures -= n;
      }
      this._hx(loc, c[loc]); c[loc] = EMPTY;
      this._changeSurroundingLiberties(loc, opp, +1);
      if (this.csize[ch[loc]] > 1) {
        let numNeighbors = 0;
        for (let i = 0; i < 4; i++) if (c[loc + this.adj[i]] === pla) numNeighbors++;
        if (numNeighbors <= 1) {
          let head = ch[loc];
          if (head === loc) {
            const newHead = this.next[loc];
            let cur = loc; do { ch[cur] = newHead; cur = this.next[cur]; } while (cur !== loc);
            this.libs[newHead] = this.libs[head]; this.csize[newHead] = this.csize[head];
            head = newHead;
          }
          { let cur = head; while (this.next[cur] !== loc) cur = this.next[cur]; this.next[cur] = this.next[loc]; }
          let delta = 0;
          for (let i = 0; i < 4; i++) { const adj = loc + this.adj[i]; if (c[adj] === EMPTY && !this.isLibertyOf(adj, head)) delta--; }
          delta++;
          this.libs[head] += delta; this.csize[head]--;
        } else {
          let cur = loc; do { ch[cur] = NULL_LOC; cur = this.next[cur]; } while (cur !== loc);
          for (let i = 0; i < 4; i++) { const adj = loc + this.adj[i]; if (c[adj] === pla && ch[adj] === NULL_LOC) this._rebuildChain(adj, pla); }
        }
      }
    }
    _mergeChains(loc1, loc2) {
      const ch = this.chainHead, c = this.colors;
      let head1 = ch[loc1], head2 = ch[loc2];
      if (this.csize[head1] < this.csize[head2]) { const t = head1; head1 = head2; head2 = t; }
      this.csize[head1] += this.csize[head2];
      let newLibs = 0, loc = head2;
      while (true) {
        for (let i = 0; i < 4; i++) { const adj = loc + this.adj[i]; if (c[adj] === EMPTY && !this.isLibertyOf(adj, head1)) newLibs++; }
        ch[loc] = head1;
        if (this.next[loc] !== head2) loc = this.next[loc]; else break;
      }
      this.libs[head1] += newLibs;
      this.next[loc] = this.next[head1]; this.next[head1] = head2;
    }
    _removeChain(loc) {
      let n = 0; const c = this.colors, opp = getOpp(c[loc]);
      let cur = loc;
      do { this._hx(cur, c[cur]); c[cur] = EMPTY; n++; this._changeSurroundingLiberties(cur, opp, +1); cur = this.next[cur]; } while (cur !== loc);
      return n;
    }
    _changeSurroundingLiberties(loc, pla, delta) {
      const c = this.colors, ch = this.chainHead, a = this.adj;
      const a0 = loc + a[0], a1 = loc + a[1], a2 = loc + a[2], a3 = loc + a[3];
      if (c[a0] === pla) this.libs[ch[a0]] += delta;
      if (c[a1] === pla && !(c[a0] === pla && ch[a0] === ch[a1])) this.libs[ch[a1]] += delta;
      if (c[a2] === pla && !(c[a0] === pla && ch[a0] === ch[a2]) && !(c[a1] === pla && ch[a1] === ch[a2])) this.libs[ch[a2]] += delta;
      if (c[a3] === pla && !(c[a0] === pla && ch[a0] === ch[a3]) && !(c[a1] === pla && ch[a1] === ch[a3]) && !(c[a2] === pla && ch[a2] === ch[a3])) this.libs[ch[a3]] += delta;
    }
    _addChain(loc, pla) {
      this.libs[loc] = 0; this.csize[loc] = 0;
      const front = this._addChainHelper(loc, loc, loc, pla);
      this.next[loc] = front;
    }
    _addChainHelper(head, tailTarget, loc, pla) {
      const c = this.colors;
      c[loc] = pla; this._hx(loc, pla); this.chainHead[loc] = head; this.csize[head]++; this.next[loc] = tailTarget;
      this._changeSurroundingLiberties(loc, getOpp(pla), -1);
      let nextTail = loc;
      for (let i = 0; i < 4; i++) { const adj = loc + this.adj[i]; if (c[adj] === EMPTY) nextTail = this._addChainHelper(head, nextTail, adj, pla); }
      return nextTail;
    }
    _rebuildChain(loc, pla) {
      this.libs[loc] = 0; this.csize[loc] = 0;
      const front = this._rebuildChainHelper(loc, loc, loc, pla);
      this.next[loc] = front;
    }
    _rebuildChainHelper(head, tailTarget, loc, pla) {
      const c = this.colors, ch = this.chainHead;
      let add = 0;
      for (let i = 0; i < 4; i++) { const adj = loc + this.adj[i]; if (c[adj] === EMPTY && !this.isLibertyOf(adj, head)) add++; }
      this.libs[head] += add;
      ch[loc] = head; this.csize[head]++; this.next[loc] = tailTarget;
      let nextTail = loc;
      for (let i = 0; i < 4; i++) { const adj = loc + this.adj[i]; if (c[adj] === pla && ch[adj] !== head) nextTail = this._rebuildChainHelper(head, nextTail, adj, pla); }
      return nextTail;
    }

    /** 착수 후의 위치 해시 (동형반복 검사용). 반환 [h0,h1] */
    posHashAfterMove(loc, pla) {
      if (loc === PASS_LOC) return [this.h0, this.h1];
      let h0 = this.h0 ^ ZOB[0][loc * 4 + pla], h1 = this.h1 ^ ZOB[1][loc * 4 + pla];
      const opp = getOpp(pla), c = this.colors, ch = this.chainHead;
      let suicide = true; const capHeads = [];
      for (let i = 0; i < 4; i++) {
        const adj = loc + this.adj[i];
        if (c[adj] === EMPTY) suicide = false;
        else if (c[adj] === pla && this.getNumLiberties(adj) > 1) suicide = false;
        else if (c[adj] === opp && this.getNumLiberties(adj) === 1) {
          const h = ch[adj]; if (capHeads.includes(h)) continue; capHeads.push(h); suicide = false;
          let cur = adj; do { h0 ^= ZOB[0][cur * 4 + opp]; h1 ^= ZOB[1][cur * 4 + opp]; cur = this.next[cur]; } while (cur !== adj);
        }
      }
      if (suicide) {
        for (let i = 0; i < 4; i++) {
          const adj = loc + this.adj[i];
          if (c[adj] === pla && this.getNumLiberties(adj) === 1) {
            const h = ch[adj]; if (capHeads.includes(h)) continue; capHeads.push(h);
            let cur = adj; do { h0 ^= ZOB[0][cur * 4 + pla]; h1 ^= ZOB[1][cur * 4 + pla]; cur = this.next[cur]; } while (cur !== adj);
          }
        }
        h0 ^= ZOB[0][loc * 4 + pla]; h1 ^= ZOB[1][loc * 4 + pla];
      }
      return [h0, h1];
    }

    // ── 전술 보조 ──
    findLiberties(loc, buf, bufStart, bufIdx) {
      let n = 0; const c = this.colors; let cur = loc;
      do {
        for (let i = 0; i < 4; i++) {
          const lib = cur + this.adj[i];
          if (c[lib] === EMPTY) {
            let dup = false;
            for (let j = bufStart; j < bufIdx + n; j++) if (buf[j] === lib) { dup = true; break; }
            if (!dup) { buf[bufIdx + n] = lib; n++; }
          }
        }
        cur = this.next[cur];
      } while (cur !== loc);
      return n;
    }
    findLibertyGainingCaptures(loc, buf, bufStart, bufIdx) {
      const opp = getOpp(this.colors[loc]), c = this.colors, ch = this.chainHead;
      const checked = []; let n = 0; let cur = loc;
      do {
        for (let i = 0; i < 4; i++) {
          const adj = cur + this.adj[i];
          if (c[adj] === opp) {
            const h = ch[adj];
            if (this.libs[h] === 1 && !checked.includes(h)) { n += this.findLiberties(adj, buf, bufStart, bufIdx + n); checked.push(h); }
          }
        }
        cur = this.next[cur];
      } while (cur !== loc);
      return n;
    }
    hasLibertyGainingCaptures(loc) {
      const opp = getOpp(this.colors[loc]), c = this.colors; let cur = loc;
      do { for (let i = 0; i < 4; i++) { const adj = cur + this.adj[i]; if (c[adj] === opp && this.libs[this.chainHead[adj]] === 1) return true; } cur = this.next[cur]; } while (cur !== loc);
      return false;
    }
    isAdjacent(a, b) { const d = Math.abs(a - b); return d === 1 || d === this.W; }

    searchIsLadderCapturedAttackerFirst2Libs(loc, buf, workingMoves) {
      const c = this.colors;
      if (c[loc] !== BLACK && c[loc] !== WHITE) return false;
      if (this.libs[this.chainHead[loc]] !== 2) return false;
      const pla = c[loc], opp = getOpp(pla);
      this.findLiberties(loc, buf, 0, 0);
      const move0 = buf[0], move1 = buf[1];
      let w0 = false, w1 = false;
      if (this.isLegal(move0, opp)) { const r = this.playMoveRecorded(move0, opp); w0 = this.searchIsLadderCaptured(loc, true, buf); this.undo(r); }
      if (this.isLegal(move1, opp)) { const r = this.playMoveRecorded(move1, opp); w1 = this.searchIsLadderCaptured(loc, true, buf); this.undo(r); }
      if (w0 || w1) { workingMoves.length = 0; if (w0) workingMoves.push(move0); if (w1) workingMoves.push(move1); return true; }
      return false;
    }

    searchIsLadderCaptured(loc, defenderFirst, buf) {
      const c = this.colors;
      if (c[loc] !== BLACK && c[loc] !== WHITE) return false;
      const ch = this.chainHead;
      if (this.libs[ch[loc]] > 2 || (defenderFirst && this.libs[ch[loc]] > 1)) return false;
      const pla = c[loc], opp = getOpp(pla);
      const koSaved = this.ko;
      if (defenderFirst) this.ko = NULL_LOC;
      const stackSize = this.size * this.size * 3 / 2 + 1 | 0;
      const starts = new Int32Array(stackSize + 2), lens = new Int32Array(stackSize + 2), curs = new Int32Array(stackSize + 2);
      const records = new Array(stackSize + 2);
      let stackIdx = 0, nodeCount = 0;
      const MAX_NODES = 25000;
      curs[0] = -1; starts[0] = 0; lens[0] = 0;
      let returnValue = false, returnedFromDeeper = false;
      while (true) {
        if (stackIdx <= -1) { this.ko = koSaved; return returnValue; }
        if (stackIdx >= stackSize - 1) { returnValue = true; returnedFromDeeper = true; stackIdx--; continue; }
        if (nodeCount >= MAX_NODES) {
          stackIdx -= 1;
          while (stackIdx >= 0) { this.undo(records[stackIdx]); stackIdx -= 1; }
          this.ko = koSaved;
          return false;
        }
        const isDefender = (defenderFirst && (stackIdx % 2) === 0) || (!defenderFirst && (stackIdx % 2) === 1);
        if (curs[stackIdx] === -1) {
          const libs = this.libs[ch[loc]];
          if (!isDefender && libs <= 1) { returnValue = true; returnedFromDeeper = true; stackIdx--; continue; }
          if (!isDefender && libs >= 3) { returnValue = false; returnedFromDeeper = true; stackIdx--; continue; }
          if (isDefender && libs >= 2) { returnValue = false; returnedFromDeeper = true; stackIdx--; continue; }
          if (isDefender && this.ko !== NULL_LOC) { returnValue = false; returnedFromDeeper = true; stackIdx--; continue; }
          const start = starts[stackIdx];
          let moveListLen = 0;
          if (isDefender) {
            moveListLen = this.findLibertyGainingCaptures(loc, buf, start, start);
            moveListLen += this.findLiberties(loc, buf, start, start + moveListLen);
            const [lower, upper] = this.getBoundNumLibertiesAfterPlay(buf[start + moveListLen - 1], pla);
            if (lower >= 3) { returnValue = false; returnedFromDeeper = true; stackIdx--; continue; }
            if (moveListLen === 1 && upper <= 1) { returnValue = true; returnedFromDeeper = true; stackIdx--; continue; }
          } else {
            moveListLen += this.findLiberties(loc, buf, start, start);
            let libs0 = this.getNumImmediateLiberties(buf[start]);
            let libs1 = this.getNumImmediateLiberties(buf[start + 1]);
            if (libs0 === 0 && libs1 === 0 && this.wouldBeKoCapture(buf[start], opp) && this.wouldBeKoCapture(buf[start + 1], opp)) {
              if (this.getNumLibertiesAfterPlay(buf[start], pla, 3) <= 2 && this.getNumLibertiesAfterPlay(buf[start + 1], pla, 3) <= 2) {
                if (!this.hasLibertyGainingCaptures(loc)) { returnValue = true; returnedFromDeeper = true; stackIdx--; continue; }
              }
            }
            if (!this.isAdjacent(buf[start], buf[start + 1])) {
              if (libs0 >= 3 && libs1 >= 3) { returnValue = false; returnedFromDeeper = true; stackIdx--; continue; }
              else if (libs0 >= 3) { moveListLen = 1; }
              else if (libs1 >= 3) { buf[start] = buf[start + 1]; moveListLen = 1; }
            }
            if (moveListLen > 1) {
              libs0 = libs0 * 2 + this.countHeuristicConnectionLibertiesX2(buf[start], pla);
              libs1 = libs1 * 2 + this.countHeuristicConnectionLibertiesX2(buf[start + 1], pla);
              if (libs1 > libs0) { const t = buf[start]; buf[start] = buf[start + 1]; buf[start + 1] = t; }
            }
          }
          lens[stackIdx] = moveListLen;
          curs[stackIdx] = 0;
        } else {
          if (returnedFromDeeper) this.undo(records[stackIdx]);
          if (isDefender && !returnValue) { returnedFromDeeper = true; stackIdx--; continue; }
          if (!isDefender && returnValue) { returnedFromDeeper = true; stackIdx--; continue; }
          curs[stackIdx]++;
        }
        if (curs[stackIdx] >= lens[stackIdx]) { returnValue = isDefender; returnedFromDeeper = true; stackIdx--; continue; }
        const move = buf[starts[stackIdx] + curs[stackIdx]];
        const p = isDefender ? pla : opp;
        if (!this.isLegal(move, p)) { returnValue = isDefender; returnedFromDeeper = false; continue; }
        records[stackIdx] = this.playMoveRecorded(move, p);
        nodeCount++;
        stackIdx++;
        curs[stackIdx] = -1;
        starts[stackIdx] = starts[stackIdx - 1] + lens[stackIdx - 1];
        lens[stackIdx] = 0;
      }
    }

    /** 영역 계산 (패스얼라이브 돌·집, 큰 영역). result: Uint8Array(M) */
    calculateArea(result, nonPassAliveStones, safeBigTerritories, unsafeBigTerritories, suicideLegal) {
      result.fill(EMPTY);
      this._calculateAreaForPla(BLACK, safeBigTerritories, unsafeBigTerritories, suicideLegal, result);
      this._calculateAreaForPla(WHITE, safeBigTerritories, unsafeBigTerritories, suicideLegal, result);
      if (nonPassAliveStones) {
        for (let y = 0; y < this.size; y++) for (let x = 0; x < this.size; x++) { const loc = this.loc(x, y); if (result[loc] === EMPTY) result[loc] = this.colors[loc]; }
      }
    }
    _calculateAreaForPla(pla, safeBig, unsafeBig, suicideLegal, result) {
      const opp = getOpp(pla), c = this.colors, ch = this.chainHead, M = this.M, size = this.size;
      const regionIdxByLoc = new Int16Array(M).fill(-1);
      const nextEmptyOrOpp = new Int16Array(M);
      const bordersNonPassAlive = new Uint8Array(M);
      const vitalLists = []; // per region: array of pla heads
      const regionHeads = [], numInternalMax2 = [], containsOpp = [];
      const queue = new Int16Array(M);
      const buildRegion = (initialLoc, regionIdx) => {
        let tailTarget = initialLoc;
        let vital = vitalLists[regionIdx];
        let qh = 0, qt = 1; queue[0] = initialLoc; regionIdxByLoc[initialLoc] = regionIdx;
        while (qh !== qt) {
          const loc = queue[qh++];
          if (vital.length > 0 && (suicideLegal || c[loc] === EMPTY)) {
            const nv = []; for (const h of vital) if (this.isAdjacentToPlaHead(pla, loc, h)) nv.push(h);
            vital = nv; vitalLists[regionIdx] = nv;
          }
          if (numInternalMax2[regionIdx] < 2 && !this.isAdjacentToPla(loc, pla)) numInternalMax2[regionIdx]++;
          if (c[loc] === opp) containsOpp[regionIdx] = true;
          nextEmptyOrOpp[loc] = tailTarget; tailTarget = loc;
          for (let i = 0; i < 4; i++) {
            const adj = loc + this.adj[i];
            if ((c[adj] === EMPTY || c[adj] === opp) && regionIdxByLoc[adj] === -1) { queue[qt++] = adj; regionIdxByLoc[adj] = regionIdx; }
          }
        }
        return tailTarget;
      };
      let atLeastOnePla = false;
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const loc = this.loc(x, y);
        if (regionIdxByLoc[loc] !== -1) continue;
        if (c[loc] !== EMPTY) { if (c[loc] === pla) atLeastOnePla = true; continue; }
        const idx = regionHeads.length;
        regionHeads.push(loc); numInternalMax2.push(0); containsOpp.push(false);
        const init = [];
        for (let i = 0; i < 4; i++) { const adj = loc + this.adj[i]; if (c[adj] === pla) { const h = ch[adj]; if (!init.includes(h)) init.push(h); } }
        vitalLists.push(init);
        const tail = buildRegion(loc, idx);
        nextEmptyOrOpp[loc] = tail;
      }
      const plaHeads = [];
      for (let loc = 0; loc < M; loc++) if (c[loc] === pla && ch[loc] === loc) plaHeads.push(loc);
      const killed = new Uint8Array(M);
      const vitalCount = new Int16Array(M);
      for (let i = 0; i < regionHeads.length; i++) for (const h of vitalLists[i]) vitalCount[h]++;
      while (true) {
        let killedAny = false;
        for (const h of plaHeads) {
          if (killed[h]) continue;
          if (vitalCount[h] < 2) {
            killed[h] = 1; killedAny = true;
            let cur = h;
            do {
              for (let j = 0; j < 4; j++) {
                const adj = cur + this.adj[j], ri = regionIdxByLoc[adj];
                if (ri >= 0 && !bordersNonPassAlive[regionHeads[ri]] && (c[adj] === EMPTY || c[adj] === opp)) {
                  bordersNonPassAlive[regionHeads[ri]] = 1;
                  for (const ph of vitalLists[ri]) vitalCount[ph]--;
                }
              }
              cur = this.next[cur];
            } while (cur !== h);
          }
        }
        if (!killedAny) break;
      }
      for (const h of plaHeads) { if (!killed[h]) { let cur = h; do { result[cur] = pla; cur = this.next[cur]; } while (cur !== h); } }
      for (let i = 0; i < regionHeads.length; i++) {
        const head = regionHeads[i];
        let shouldMark = numInternalMax2[i] <= 1 && !bordersNonPassAlive[head] && atLeastOnePla;
        shouldMark = shouldMark || (safeBig && !containsOpp[i] && !bordersNonPassAlive[head] && atLeastOnePla);
        if (shouldMark) { let cur = head; do { result[cur] = pla; cur = nextEmptyOrOpp[cur]; } while (cur !== head); }
        else if (unsafeBig && !containsOpp[i] && atLeastOnePla) { let cur = head; do { if (result[cur] === EMPTY) result[cur] = pla; cur = nextEmptyOrOpp[cur]; } while (cur !== head); }
      }
    }
  }

  return { EMPTY, BLACK, WHITE, WALL, NULL_LOC, PASS_LOC, Board, getOpp };
});
