/* board-view.js — 캔버스 바둑판 렌더러 (테마, 돌, 표식, 입력) */
(function (root) {
  'use strict';
  const EMPTY = 0, BLACK = 1, WHITE = 2;

  const THEMES = [
    { id: 'oak', name: '참나무', base: '#dcb467', grain: true, grainDark: '#8a5a1e', grainLight: '#f8e0a4', line: '#4a3414', lineAlpha: 0.72, coord: '#5a4320' },
    { id: 'maple', name: '단풍나무', base: '#efd9a9', grain: true, grainDark: '#b78c48', grainLight: '#fff6dc', line: '#5a4320', lineAlpha: 0.65, coord: '#6a5330' },
    { id: 'walnut', name: '호두나무', base: '#6e4b31', grain: true, grainDark: '#3b2412', grainLight: '#9d7249', line: '#f3e2c6', lineAlpha: 0.5, coord: '#e6d2b3' },
    { id: 'cherry', name: '벚나무', base: '#b9704f', grain: true, grainDark: '#6a3218', grainLight: '#e8a57f', line: '#3a1a0a', lineAlpha: 0.62, coord: '#3a1a0a' },
    { id: 'bamboo', name: '대나무', base: '#d8cb7c', grain: true, grainDark: '#8d8132', grainLight: '#f5ecad', line: '#4a4420', lineAlpha: 0.68, coord: '#4a4420' },
    { id: 'slate', name: '슬레이트', base: '#3c434c', grain: false, line: '#d7dfe9', lineAlpha: 0.42, coord: '#b8c2cf' },
    { id: 'mint', name: '민트', base: '#d4eadf', grain: false, line: '#1f5c48', lineAlpha: 0.5, coord: '#2f6b57' },
    { id: 'midnight', name: '미드나잇', base: '#1f2a44', grain: false, line: '#aabde3', lineAlpha: 0.45, coord: '#8ea1cb' },
    { id: 'paper', name: '종이', base: '#f6f1e6', grain: false, line: '#2a2a2a', lineAlpha: 0.62, coord: '#555' },
    { id: 'rose', name: '로즈', base: '#ead0ca', grain: false, line: '#5b2a2a', lineAlpha: 0.52, coord: '#6c3a3a' },
  ];
  const STONE_STYLES = [
    { id: 'shell', name: '조개·슬레이트' },
    { id: 'matte', name: '매트' },
    { id: 'flat', name: '플랫' },
  ];

  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  function hexA(hex, a) {
    const h = hex.replace('#', ''); const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  function paintWood(ctx, w, h, theme, seedNum) {
    ctx.fillStyle = theme.base; ctx.fillRect(0, 0, w, h);
    if (theme.grain) {
      const rnd = mulberry32(seedNum);
      const lines = Math.round(h / 2.6);
      ctx.lineCap = 'round';
      for (let i = 0; i < lines; i++) {
        const y = rnd() * h, amp = 1.5 + rnd() * 9, freq = 0.4 + rnd() * 1.8, phase = rnd() * Math.PI * 2;
        const dark = rnd() < 0.55;
        ctx.strokeStyle = dark ? theme.grainDark : theme.grainLight;
        ctx.globalAlpha = (dark ? 0.04 : 0.06) + rnd() * 0.08;
        ctx.lineWidth = 0.5 + rnd() * 2.4;
        ctx.beginPath();
        for (let x = -10; x <= w + 10; x += 6) {
          const yy = y + Math.sin(phase + (x / w) * Math.PI * freq) * amp + Math.sin(x / 13 + phase) * 0.7;
          if (x === -10) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    const g = ctx.createRadialGradient(w * 0.5, h * 0.45, w * 0.15, w * 0.5, h * 0.5, w * 0.85);
    g.addColorStop(0, 'rgba(255,255,255,0.06)'); g.addColorStop(1, 'rgba(0,0,0,0.13)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }

  function drawStone(ctx, x, y, r, color, style, alpha) {
    ctx.save();
    if (alpha != null && alpha < 1) ctx.globalAlpha = alpha;
    if (style !== 'flat' && !(alpha != null && alpha < 1)) {
      ctx.beginPath(); ctx.arc(x + r * 0.07, y + r * 0.12, r * 0.98, 0, Math.PI * 2);
      ctx.fillStyle = style === 'shell' ? 'rgba(0,0,0,0.38)' : 'rgba(0,0,0,0.28)';
      ctx.filter = 'blur(' + (r * 0.12) + 'px)';
      ctx.fill(); ctx.filter = 'none';
    }
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    if (style === 'flat') {
      ctx.fillStyle = color === BLACK ? '#17191c' : '#f7f7f4'; ctx.fill();
      if (color === WHITE) { ctx.lineWidth = Math.max(1, r * 0.06); ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.stroke(); }
    } else if (style === 'matte') {
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
      if (color === BLACK) { g.addColorStop(0, '#3a3e44'); g.addColorStop(1, '#101215'); }
      else { g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#d9d9d3'); }
      ctx.fillStyle = g; ctx.fill();
    } else {
      const g = ctx.createRadialGradient(x - r * 0.38, y - r * 0.4, r * 0.08, x, y, r * 1.05);
      if (color === BLACK) { g.addColorStop(0, '#5a5f66'); g.addColorStop(0.35, '#23262a'); g.addColorStop(1, '#070809'); }
      else { g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#f2f2ee'); g.addColorStop(1, '#c8c8c1'); }
      ctx.fillStyle = g; ctx.fill();
      if (color === WHITE) {
        // 은은한 조개 결
        ctx.save(); ctx.clip();
        ctx.globalAlpha = (alpha != null ? alpha : 1) * 0.08; ctx.strokeStyle = '#9a9a90'; ctx.lineWidth = Math.max(0.6, r * 0.05);
        for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.ellipse(x - r * 0.6, y + r * 0.2, r * (1.4 + k * 0.22), r * (0.9 + k * 0.14), -0.5, 0, Math.PI * 2); ctx.stroke(); }
        ctx.restore();
      }
    }
    ctx.restore();
  }

  class BoardView {
    constructor(wrap, opts) {
      this.wrap = wrap;
      this.canvas = document.createElement('canvas');
      wrap.appendChild(this.canvas);
      this.ctx = this.canvas.getContext('2d');
      this.size = opts.size || 19;
      this.theme = THEMES.find(t => t.id === opts.theme) || THEMES[0];
      this.stoneStyle = opts.stoneStyle || 'shell';
      this.coords = !!opts.coords;
      this.state = { stones: new Uint8Array(this.size * this.size), lastMove: -1, ghost: null, dead: null, owner: null, marks: [], numbers: null, dimAll: false };
      this.handlers = {};
      this.bgCache = null;
      this.cssSize = 0; this.dpr = 1;
      this._bindPointer();
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(wrap);
      this.resize();
    }
    on(ev, fn) { this.handlers[ev] = fn; return this; }
    emit(ev, ...a) { if (this.handlers[ev]) this.handlers[ev](...a); }

    setSize(size) { if (size !== this.size) { this.size = size; this.state.stones = new Uint8Array(size * size); this.bgCache = null; this.draw(); } }
    setTheme(id) { this.theme = THEMES.find(t => t.id === id) || THEMES[0]; this.bgCache = null; this.draw(); }
    setStoneStyle(id) { this.stoneStyle = id; this.draw(); }
    setCoords(v) { this.coords = !!v; this.bgCache = null; this.draw(); }
    setState(partial) { Object.assign(this.state, partial); this.draw(); }

    resize() {
      const w = this.wrap.clientWidth; if (!w) return;
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      if (w === this.cssSize && dpr === this.dpr) return;
      this.cssSize = w; this.dpr = dpr;
      this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(w * dpr);
      this.bgCache = null;
      this.draw();
    }

    geometry() {
      const S = this.canvas.width, n = this.size;
      const m = this.coords ? 1.25 : 0.78;
      const cell = S / (n - 1 + 2 * m);
      const margin = cell * m;
      return { S, cell, margin, r: cell * 0.47 };
    }
    pointXY(p) { const { cell, margin } = this.geometry(); const x = p % this.size, y = (p / this.size) | 0; return [margin + x * cell, margin + y * cell]; }

    /** 클라이언트 좌표 → 교차점 인덱스 (없으면 -1) */
    pointFromClient(cx, cy, offsetCells) {
      const rect = this.canvas.getBoundingClientRect();
      const scale = this.canvas.width / rect.width;
      const { cell, margin } = this.geometry();
      const x = (cx - rect.left) * scale, y = (cy - rect.top) * scale - (offsetCells || 0) * cell;
      const gx = Math.round((x - margin) / cell), gy = Math.round((y - margin) / cell);
      if (gx < 0 || gy < 0 || gx >= this.size || gy >= this.size) return -1;
      const dx = x - (margin + gx * cell), dy = y - (margin + gy * cell);
      if (dx * dx + dy * dy > cell * cell * 0.7) return -1;
      return gy * this.size + gx;
    }

    _bindPointer() {
      const c = this.canvas;
      let pressed = false, pid = null;
      c.addEventListener('pointerdown', e => {
        if (e.button != null && e.button !== 0) return;
        pressed = true; pid = e.pointerId;
        try { c.setPointerCapture(e.pointerId); } catch (_) { }
        this.emit('press', e, e.pointerType);
        e.preventDefault();
      });
      c.addEventListener('pointermove', e => {
        if (pressed && e.pointerId === pid) this.emit('drag', e, e.pointerType);
        else if (e.pointerType === 'mouse') this.emit('hover', e);
      });
      const up = e => { if (!pressed || e.pointerId !== pid) return; pressed = false; this.emit('release', e, e.pointerType); };
      c.addEventListener('pointerup', up);
      c.addEventListener('pointercancel', e => { if (pressed && e.pointerId === pid) { pressed = false; this.emit('cancel', e); } });
      c.addEventListener('pointerleave', e => { if (!pressed) this.emit('leave', e); });
      c.addEventListener('contextmenu', e => e.preventDefault());
    }

    _background() {
      const { S, cell, margin } = this.geometry();
      const n = this.size, t = this.theme;
      const off = document.createElement('canvas'); off.width = S; off.height = S;
      const ctx = off.getContext('2d');
      paintWood(ctx, S, S, t, 7 + n);
      // 선
      ctx.strokeStyle = hexA(t.line, t.lineAlpha);
      const lw = Math.max(1, cell * 0.045);
      ctx.lineWidth = lw; ctx.lineCap = 'square';
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const v = margin + i * cell;
        ctx.moveTo(margin, v); ctx.lineTo(margin + (n - 1) * cell, v);
        ctx.moveTo(v, margin); ctx.lineTo(v, margin + (n - 1) * cell);
      }
      ctx.stroke();
      // 외곽선 조금 두껍게
      ctx.lineWidth = lw * 1.6; ctx.strokeRect(margin, margin, (n - 1) * cell, (n - 1) * cell);
      // 화점
      const stars = (root.Go ? root.Go.starPoints(n) : []);
      ctx.fillStyle = hexA(t.line, Math.min(1, t.lineAlpha + 0.15));
      for (const p of stars) { const x = p % n, y = (p / n) | 0; ctx.beginPath(); ctx.arc(margin + x * cell, margin + y * cell, Math.max(2, cell * 0.11), 0, Math.PI * 2); ctx.fill(); }
      // 좌표
      if (this.coords) {
        const L = (root.Go && root.Go.COORD_LETTERS) || 'ABCDEFGHJKLMNOPQRST';
        ctx.fillStyle = t.coord; ctx.font = `600 ${Math.round(cell * 0.36)}px ${getComputedStyle(document.body).fontFamily}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (let i = 0; i < n; i++) {
          const v = margin + i * cell;
          ctx.fillText(L[i], v, margin * 0.42); ctx.fillText(L[i], v, S - margin * 0.42);
          ctx.fillText(String(n - i), margin * 0.42, v); ctx.fillText(String(n - i), S - margin * 0.42, v);
        }
      }
      return off;
    }

    draw() {
      const ctx = this.ctx, S = this.canvas.width; if (!S) return;
      if (!this.bgCache) this.bgCache = this._background();
      ctx.clearRect(0, 0, S, S);
      ctx.drawImage(this.bgCache, 0, 0);
      const { cell, margin, r } = this.geometry();
      const n = this.size, st = this.state, stones = st.stones;
      const dead = st.dead, owner = st.owner;
      const fontFamily = getComputedStyle(document.body).fontFamily;
      // 영역 표시
      if (owner) {
        for (let p = 0; p < n * n; p++) {
          const o = owner[p]; if (!o) continue;
          if (stones[p] !== EMPTY && !(dead && dead.has(p))) continue;
          const x = margin + (p % n) * cell, y = margin + ((p / n) | 0) * cell, s = cell * 0.32;
          ctx.fillStyle = o === BLACK ? 'rgba(15,17,20,0.75)' : 'rgba(255,255,255,0.85)';
          ctx.fillRect(x - s / 2, y - s / 2, s, s);
          if (o === WHITE) { ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1; ctx.strokeRect(x - s / 2, y - s / 2, s, s); }
        }
      }
      // 돌
      for (let p = 0; p < n * n; p++) {
        const c = stones[p]; if (c === EMPTY) continue;
        const x = margin + (p % n) * cell, y = margin + ((p / n) | 0) * cell;
        const isDead = dead && dead.has(p);
        drawStone(ctx, x, y, r, c, this.stoneStyle, isDead ? 0.4 : (st.dimAll ? 0.55 : 1));
        if (isDead) {
          ctx.strokeStyle = c === BLACK ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.75)'; ctx.lineWidth = Math.max(1.5, cell * 0.07);
          const k = r * 0.45; ctx.beginPath(); ctx.moveTo(x - k, y - k); ctx.lineTo(x + k, y + k); ctx.moveTo(x + k, y - k); ctx.lineTo(x - k, y + k); ctx.stroke();
        }
      }
      // 수 번호
      if (st.numbers) {
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (const [p, info] of st.numbers) {
          const c = stones[p]; if (c === EMPTY) continue;
          const x = margin + (p % n) * cell, y = margin + ((p / n) | 0) * cell;
          const txt = String(info.n != null ? info.n : info);
          ctx.font = `700 ${Math.round(r * (txt.length > 2 ? 0.8 : 1.0))}px ${fontFamily}`;
          ctx.fillStyle = c === BLACK ? '#f3f3f0' : '#1a1c1f';
          ctx.fillText(txt, x, y + r * 0.04);
        }
      }
      // 마지막 수 표시
      if (st.lastMove >= 0 && stones[st.lastMove] !== EMPTY && !(st.numbers && st.numbers.has(st.lastMove))) {
        const p = st.lastMove, x = margin + (p % n) * cell, y = margin + ((p / n) | 0) * cell;
        ctx.beginPath(); ctx.arc(x, y, r * 0.42, 0, Math.PI * 2);
        ctx.lineWidth = Math.max(1.5, r * 0.14); ctx.strokeStyle = stones[p] === BLACK ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.75)'; ctx.stroke();
      }
      // 표식
      for (const m of st.marks || []) {
        const p = m.p, x = margin + (p % n) * cell, y = margin + ((p / n) | 0) * cell;
        const onBlack = stones[p] === BLACK;
        const col = m.color || (stones[p] === EMPTY ? (this.theme.line) : onBlack ? '#ffffff' : '#111');
        ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = Math.max(1.5, r * 0.14);
        if (m.type === 'circle') { ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, Math.PI * 2); ctx.stroke(); }
        else if (m.type === 'triangle') { const k = r * 0.55; ctx.beginPath(); ctx.moveTo(x, y - k); ctx.lineTo(x + k * 0.9, y + k * 0.6); ctx.lineTo(x - k * 0.9, y + k * 0.6); ctx.closePath(); ctx.stroke(); }
        else if (m.type === 'square') { const k = r * 0.5; ctx.strokeRect(x - k, y - k, k * 2, k * 2); }
        else if (m.type === 'dot') { ctx.beginPath(); ctx.arc(x, y, r * 0.3, 0, Math.PI * 2); ctx.fill(); }
        else if (m.type === 'label') {
          if (stones[p] === EMPTY) {
            ctx.fillStyle = this.theme.base; ctx.beginPath(); ctx.arc(x, y, r * 0.78, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = m.color || this.theme.line; ctx.lineWidth = Math.max(1.5, r * 0.12); ctx.stroke();
            ctx.fillStyle = m.color || this.theme.line;
          }
          ctx.font = `800 ${Math.round(r * 0.95)}px ${fontFamily}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(m.text, x, y + r * 0.04);
        } else if (m.type === 'badge') {
          const bx = x + r * 0.66, by = y - r * 0.66, br = r * 0.56;
          ctx.fillStyle = m.color || '#2f9e44'; ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, r * 0.09); ctx.stroke();
          ctx.fillStyle = m.textColor || '#fff'; ctx.font = `800 ${Math.round(br * (m.text.length > 1 ? 0.95 : 1.15))}px ${fontFamily}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(m.text, bx, by + br * 0.06);
        } else if (m.type === 'ghost') {
          drawStone(ctx, x, y, r, m.color === 'w' ? WHITE : BLACK, this.stoneStyle, 0.55);
          if (m.text != null) { ctx.font = `700 ${Math.round(r * 0.9)}px ${fontFamily}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = m.color === 'w' ? '#111' : '#fff'; ctx.fillText(String(m.text), x, y + r * 0.04); }
        }
      }
      // 고스트(착수 예정)
      if (st.ghost && st.ghost.p >= 0 && stones[st.ghost.p] === EMPTY) {
        const p = st.ghost.p, x = margin + (p % n) * cell, y = margin + ((p / n) | 0) * cell;
        drawStone(ctx, x, y, r, st.ghost.c, this.stoneStyle, st.ghost.strong ? 0.85 : 0.5);
        if (st.ghost.strong) {
          ctx.strokeStyle = 'rgba(47,209,174,0.95)'; ctx.lineWidth = Math.max(2, r * 0.16);
          ctx.beginPath(); ctx.arc(x, y, r * 1.18, 0, Math.PI * 2); ctx.stroke();
          // 십자선
          ctx.strokeStyle = 'rgba(47,209,174,0.55)'; ctx.lineWidth = Math.max(1, r * 0.08);
          ctx.beginPath(); ctx.moveTo(margin, y); ctx.lineTo(margin + (n - 1) * cell, y); ctx.moveTo(x, margin); ctx.lineTo(x, margin + (n - 1) * cell); ctx.stroke();
        }
      }
    }
  }

  /** 테마 미리보기 썸네일 */
  function drawThumb(canvas, themeId, stoneStyle) {
    const t = THEMES.find(x => x.id === themeId) || THEMES[0];
    const S = 120; canvas.width = S; canvas.height = S;
    const ctx = canvas.getContext('2d');
    paintWood(ctx, S, S, t, 99);
    const n = 5, m = S * 0.14, cell = (S - 2 * m) / (n - 1);
    ctx.strokeStyle = hexA(t.line, t.lineAlpha); ctx.lineWidth = 1.3; ctx.beginPath();
    for (let i = 0; i < n; i++) { const v = m + i * cell; ctx.moveTo(m, v); ctx.lineTo(S - m, v); ctx.moveTo(v, m); ctx.lineTo(v, S - m); }
    ctx.stroke();
    const r = cell * 0.46;
    drawStone(ctx, m + cell, m + cell, r, BLACK, stoneStyle || 'shell');
    drawStone(ctx, m + cell * 2, m + cell * 2, r, WHITE, stoneStyle || 'shell');
    drawStone(ctx, m + cell * 3, m + cell * 1, r, WHITE, stoneStyle || 'shell');
    drawStone(ctx, m + cell * 2, m + cell * 3, r, BLACK, stoneStyle || 'shell');
  }

  root.BoardView = BoardView;
  root.BoardThemes = { THEMES, STONE_STYLES, drawThumb, drawStone };
})(window);
