/* katagame.js — 신경망 평가용 대국 상태 (판 + 수순 + 동형반복 해시). 앱의 Go.Board 수순으로부터 생성 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./kataboard.js'), require('./katafeatures.js'));
  else root.KataGame = factory(root.KataBoard, root.KataFeatures);
})(typeof self !== 'undefined' ? self : this, function (KB, KF) {
  'use strict';
  const { EMPTY, BLACK, WHITE, NULL_LOC, PASS_LOC, Board, getOpp } = KB;

  class Game {
    constructor(size, komi) {
      this.size = size; this.komi = komi;
      this.board = new Board(size);
      this.moves = [];            // {loc, pla}
      this.boards = [];           // 각 수 이후의 판 복제 (prev 보드용)
      this.hashes = new Set([this.board.hashKey()]);
      this.consecutivePasses = 0;
      this.toPlay = BLACK;
    }
    clone() {
      const g = new Game(this.size, this.komi);
      g.board = this.board.clone(); g.moves = this.moves.slice(); g.boards = this.boards.slice();
      g.hashes = new Set(this.hashes); g.consecutivePasses = this.consecutivePasses; g.toPlay = this.toPlay;
      return g;
    }
    /** 앱 좌표(y*size+x, -1=패스) → KataGo loc */
    locOf(p) { return p < 0 ? PASS_LOC : this.board.loc(p % this.size, (p / this.size) | 0); }
    posOf(loc) { return loc === PASS_LOC ? -1 : this.board.y(loc) * this.size + this.board.x(loc); }
    setup(blackPts, whitePts) {
      for (const p of blackPts || []) this.board.playMoveAssumeLegal(this.locOf(p), BLACK);
      for (const p of whitePts || []) this.board.playMoveAssumeLegal(this.locOf(p), WHITE);
      this.board.ko = NULL_LOC;
      this.hashes = new Set([this.board.hashKey()]);
      if ((blackPts || []).length && !(whitePts || []).length) this.toPlay = WHITE;
    }
    isLegal(loc, pla) {
      if (loc === PASS_LOC) return true;
      if (!this.board.isLegal(loc, pla)) return false;
      const h = this.board.posHashAfterMove(loc, pla);
      return !this.hashes.has(h[0] + ':' + h[1]);
    }
    play(loc, pla) {
      pla = pla || this.toPlay;
      this.boards.push(this.board.clone());
      this.board.playMoveAssumeLegal(loc, pla);
      this.moves.push({ loc, pla });
      this.hashes.add(this.board.hashKey());
      this.consecutivePasses = loc === PASS_LOC ? this.consecutivePasses + 1 : 0;
      this.toPlay = getOpp(pla);
    }
    /** 특징 계산용 위치 객체 */
    position(withBanned) {
      const n = this.boards.length;
      const banned = withBanned ? KF.superkoBanned(this.board, this.toPlay, this.hashes, new Uint8Array(this.board.M)) : null;
      return { board: this.board, prev1: n >= 1 ? this.boards[n - 1] : null, prev2: n >= 2 ? this.boards[n - 2] : null, moves: this.moves, komi: this.komi, banned, consecutivePasses: this.consecutivePasses };
    }
    /** 합법 착점 마스크 [L*L+1] (패스 포함) */
    legalMask() {
      const L = this.size, out = new Uint8Array(L * L + 1), pla = this.toPlay;
      for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) { const loc = this.board.loc(x, y); out[y * L + x] = this.isLegal(loc, pla) ? 1 : 0; }
      out[L * L] = 1;
      return out;
    }
    static fromMoves(size, komi, moves /* app {c,p} */, setup) {
      const g = new Game(size, komi);
      if (setup) { g.setup(setup.black, setup.white); if (setup.toPlay) g.toPlay = setup.toPlay; }
      for (const m of moves) g.play(g.locOf(m.p), m.c);
      return g;
    }
  }
  return { Game };
});
