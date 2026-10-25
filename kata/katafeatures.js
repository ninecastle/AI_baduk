/* katafeatures.js — KataGo 신경망 입력 특징 V7 (모델 버전 8~10) 생성
   규칙 고정: 영역 계가(AREA), 세금 없음, 동형반복 금지(POSITIONAL), 자살수 금지, 버튼 없음, 인코어 없음 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./kataboard.js'));
  else root.KataFeatures = factory(root.KataBoard);
})(typeof self !== 'undefined' ? self : this, function (KB) {
  'use strict';
  const { EMPTY, BLACK, WHITE, NULL_LOC, PASS_LOC, getOpp } = KB;
  const NUM_BIN = 22, NUM_GLOBAL = 19, KOMI_CLIP = 20;

  /** 축 탐색: 탈출 불가 단수에 걸린 그룹들에 대해 f(loc, pos, workingMoves) 호출 */
  function iterLadders(board, nnLen, f) {
    const size = board.size;
    const solved = new Map(); // head → laddered
    const copy = board.clone();
    const buf = new Int32Array(size * size * 6 + 64);
    const working = [];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const loc = board.loc(x, y), stone = board.colors[loc];
      if (stone !== BLACK && stone !== WHITE) continue;
      const libs = board.getNumLiberties(loc);
      if (libs !== 1 && libs !== 2) continue;
      const pos = y * nnLen + x, head = board.chainHead[loc];
      if (solved.has(head)) { if (solved.get(head)) { working.length = 0; f(loc, pos, working); } continue; }
      let laddered;
      if (libs === 1) laddered = copy.searchIsLadderCaptured(loc, true, buf);
      else { working.length = 0; laddered = copy.searchIsLadderCapturedAttackerFirst2Libs(loc, buf, working); }
      solved.set(head, laddered);
      if (laddered) f(loc, pos, working);
    }
  }

  /** 동형반복으로 금지되는 착점 계산. hashes: Set of "h0:h1" (현재 위치 포함) */
  function superkoBanned(board, pla, hashes, out) {
    out.fill(0);
    if (!hashes) return out;
    const size = board.size;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const loc = board.loc(x, y);
      if (board.colors[loc] !== EMPTY || loc === board.ko) continue;
      if (board.isSuicide(loc, pla)) continue;
      const h = board.posHashAfterMove(loc, pla);
      if (hashes.has(h[0] + ':' + h[1])) out[loc] = 1;
    }
    return out;
  }

  /**
   * pos: { board, prev1, prev2, moves:[{loc,pla}], komi(백 기준), banned:Uint8Array(M)|null, consecutivePasses }
   * opts: { isRoot, conservativePass }
   * rowBin: Float32Array(nnLen*nnLen*22) NHWC, rowGlobal: Float32Array(19)
   */
  function fill(pos, pla, opts, nnLen, rowBin, rowGlobal) {
    const board = pos.board, size = board.size, opp = getOpp(pla);
    rowBin.fill(0); rowGlobal.fill(0);
    const FS = NUM_BIN;
    const col = board.colors;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const p = (y * nnLen + x) * FS, loc = board.loc(x, y), stone = col[loc];
      rowBin[p] = 1;
      if (stone === pla) rowBin[p + 1] = 1; else if (stone === opp) rowBin[p + 2] = 1;
      if (stone === pla || stone === opp) {
        const libs = board.getNumLiberties(loc);
        if (libs === 1) rowBin[p + 3] = 1; else if (libs === 2) rowBin[p + 4] = 1; else if (libs === 3) rowBin[p + 5] = 1;
      }
    }
    // 6: 패 금지점 + 동형반복 금지점
    if (board.ko !== NULL_LOC) rowBin[(board.y(board.ko) * nnLen + board.x(board.ko)) * FS + 6] = 1;
    if (pos.banned) {
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const loc = board.loc(x, y); if (pos.banned[loc] && loc !== board.ko) rowBin[(y * nnLen + x) * FS + 6] = 1; }
    }
    // 18,19: 현재 영역 (영역 계가, 세금 없음)
    const area = new Uint8Array(board.M);
    board.calculateArea(area, true, true, true, false);
    let boardScoreForPla = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const loc = board.loc(x, y), p = (y * nnLen + x) * FS;
      if (area[loc] === pla) { rowBin[p + 18] = 1; boardScoreForPla++; }
      else if (area[loc] === opp) { rowBin[p + 19] = 1; boardScoreForPla--; }
    }
    const selfKomiRaw = pla === WHITE ? pos.komi : -pos.komi;
    const finalScorePla = boardScoreForPla + selfKomiRaw;
    const finalWouldNotBeWin = finalScorePla <= 0;
    // 역사 숨김 여부
    const passWouldEndGame = (pos.consecutivePasses || 0) >= 1;
    let maxTurns = 5, suppressPassWouldEnd = false;
    if (passWouldEndGame && ((opts.conservativePass && opts.isRoot) || (opts.enablePassingHacks && finalWouldNotBeWin))) { maxTurns = 0; suppressPassWouldEnd = true; }
    const moves = pos.moves, n = moves.length;
    let included = 0;
    const amount = Math.min(maxTurns, n);
    const setHist = (m, feat, gidx) => {
      if (m.loc === PASS_LOC) rowGlobal[gidx] = 1;
      else if (m.loc !== NULL_LOC) rowBin[(board.y(m.loc) * nnLen + board.x(m.loc)) * FS + feat] = 1;
    };
    if (amount >= 1 && moves[n - 1].pla === opp) {
      included = 1; setHist(moves[n - 1], 9, 0);
      if (amount >= 2 && moves[n - 2].pla === pla) {
        included = 2; setHist(moves[n - 2], 10, 1);
        if (amount >= 3 && moves[n - 3].pla === opp) {
          included = 3; setHist(moves[n - 3], 11, 2);
          if (amount >= 4 && moves[n - 4].pla === pla) {
            included = 4; setHist(moves[n - 4], 12, 3);
            if (amount >= 5 && moves[n - 5].pla === opp) { included = 5; setHist(moves[n - 5], 13, 4); }
          }
        }
      }
    }
    // 축 특징 14,15,16,17
    iterLadders(board, nnLen, (loc, p, working) => {
      rowBin[p * FS + 14] = 1;
      if (col[loc] === opp && board.getNumLiberties(loc) > 1) {
        for (const w of working) rowBin[(board.y(w) * nnLen + board.x(w)) * FS + 17] = 1;
      }
    });
    const prev1 = included < 1 ? board : (pos.prev1 || board);
    iterLadders(prev1, nnLen, (loc, p) => { rowBin[p * FS + 15] = 1; });
    const prev2 = included < 2 ? prev1 : (pos.prev2 || prev1);
    iterLadders(prev2, nnLen, (loc, p) => { rowBin[p * FS + 16] = 1; });
    // 전역 특징
    let selfKomi = selfKomiRaw; const bArea = size * size;
    if (selfKomi > bArea + KOMI_CLIP) selfKomi = bArea + KOMI_CLIP;
    if (selfKomi < -bArea - KOMI_CLIP) selfKomi = -bArea - KOMI_CLIP;
    rowGlobal[5] = selfKomi / 20;
    rowGlobal[6] = 1; rowGlobal[7] = 0.5; // 동형반복 금지(positional)
    rowGlobal[14] = suppressPassWouldEnd ? 0 : (passWouldEndGame ? 1 : 0);
    // 덤 패리티 삼각파 (영역 계가)
    {
      const even = (bArea % 2) === 0;
      const komiFloor = even ? Math.floor(selfKomi / 2) * 2 : Math.floor((selfKomi - 1) / 2) * 2 + 1;
      let delta = selfKomi - komiFloor; if (delta < 0) delta = 0; if (delta > 2) delta = 2;
      rowGlobal[18] = delta < 0.5 ? delta : delta < 1.5 ? 1 - delta : delta - 2;
    }
    return included;
  }

  return { NUM_BIN, NUM_GLOBAL, fill, iterLadders, superkoBanned };
});
