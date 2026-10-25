/* katanet.js — KataGo 모델(.kbn) 로딩 + 순전파 (CPU 순수 JS 백엔드, TF.js WebGL 백엔드)
   입력: NHWC [N, L, L, 22] + 전역 [N, 19]. 출력: 정책 로짓 [N, L*L+1], 가치 로짓 [N,3], 점수값 [N,4], 소유권(pre-tanh) [N, L*L] */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KataNet = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ── 모델 파일 파싱 ──
  function f16tof32(h) {
    const s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 0x1f, m = h & 0x3ff;
    if (e === 0) return s * m * Math.pow(2, -24);
    if (e === 0x1f) return m ? NaN : s * Infinity;
    return s * (1 + m / 1024) * Math.pow(2, e - 15);
  }
  function parseKBN(arrayBuffer) {
    const u8 = new Uint8Array(arrayBuffer);
    const tag = String.fromCharCode(u8[0], u8[1], u8[2], u8[3]);
    if (tag !== 'KBN1') throw new Error('not a KBN model');
    const headerLen = new DataView(arrayBuffer, 4, 4).getUint32(0, true);
    const header = JSON.parse(new TextDecoder().decode(u8.subarray(8, 8 + headerLen)));
    const bodyOff = 8 + headerLen;
    let weights;
    if (header.dtype === 'f32') {
      weights = new Float32Array(header.totalFloats);
      weights.set(new Float32Array(arrayBuffer.slice(bodyOff, bodyOff + header.totalFloats * 4)));
    } else {
      const h16 = new Uint16Array(arrayBuffer.slice(bodyOff, bodyOff + header.totalFloats * 2));
      weights = new Float32Array(header.totalFloats);
      // 룩업 테이블로 빠르게
      const lut = new Float32Array(65536); for (let i = 0; i < 65536; i++) lut[i] = f16tof32(i);
      for (let i = 0; i < h16.length; i++) weights[i] = lut[h16[i]];
    }
    header.weights = weights;
    header.W = (off, len) => weights.subarray(off, off + len);
    return header;
  }

  // ── CPU 백엔드 ──
  class CpuNet {
    constructor(model) { this.m = model; }
    conv(inp, N, L, Cin, cv) {
      const { ky, kx, ic, oc } = cv; if (ic !== Cin) throw new Error('conv channel mismatch ' + cv.name);
      const w = this.m.W(cv.w, ky * kx * ic * oc);
      const out = new Float32Array(N * L * L * oc);
      const ry = (ky - 1) >> 1, rx = (kx - 1) >> 1;
      for (let n = 0; n < N; n++) {
        for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) {
          const ob = ((n * L + y) * L + x) * oc;
          for (let dy = 0; dy < ky; dy++) {
            const iy = y + dy - ry; if (iy < 0 || iy >= L) continue;
            for (let dx = 0; dx < kx; dx++) {
              const ix = x + dx - rx; if (ix < 0 || ix >= L) continue;
              const ib = ((n * L + iy) * L + ix) * ic;
              const wb = (dy * kx + dx) * ic * oc;
              for (let ci = 0; ci < ic; ci++) {
                const v = inp[ib + ci]; if (v === 0) continue;
                const wo = wb + ci * oc;
                for (let co = 0; co < oc; co++) out[ob + co] += v * w[wo + co];
              }
            }
          }
        }
      }
      return out;
    }
    bnRelu(x, C, bn, relu) {
      const s = this.m.W(bn.scale, C), b = this.m.W(bn.bias, C);
      const out = new Float32Array(x.length);
      for (let i = 0; i < x.length; i += C) for (let c = 0; c < C; c++) { let v = x[i + c] * s[c] + b[c]; if (relu && v < 0) v = 0; out[i + c] = v; }
      return out;
    }
    matmul(x, N, mm) {
      const { ic, oc } = mm, w = this.m.W(mm.w, ic * oc), out = new Float32Array(N * oc);
      for (let n = 0; n < N; n++) for (let i = 0; i < ic; i++) { const v = x[n * ic + i]; if (v === 0) continue; for (let o = 0; o < oc; o++) out[n * oc + o] += v * w[i * oc + o]; }
      return out;
    }
    addBias(x, N, C, mb) { const b = this.m.W(mb.w, C); for (let n = 0; n < N; n++) for (let c = 0; c < C; c++) x[n * C + c] += b[c]; return x; }
    addNC(x, N, L, C, bias) { for (let n = 0; n < N; n++) for (let p = 0; p < L * L; p++) for (let c = 0; c < C; c++) x[(n * L * L + p) * C + c] += bias[n * C + c]; }
    gpool(x, N, L, C) { // [mean, mean*(sqrt(len)-14)*0.1, max]
      const out = new Float32Array(N * 3 * C), len = L * L, sq = Math.sqrt(len);
      for (let n = 0; n < N; n++) for (let c = 0; c < C; c++) {
        let s = 0, m = -1;
        for (let p = 0; p < len; p++) { const v = x[(n * len + p) * C + c]; s += v; if (v > m) m = v; }
        const mean = s / len;
        out[n * 3 * C + c] = mean; out[n * 3 * C + C + c] = mean * (sq - 14) * 0.1; out[n * 3 * C + 2 * C + c] = m;
      }
      return out;
    }
    vpool(x, N, L, C) {
      const out = new Float32Array(N * 3 * C), len = L * L, sq = Math.sqrt(len);
      for (let n = 0; n < N; n++) for (let c = 0; c < C; c++) {
        let s = 0; for (let p = 0; p < len; p++) s += x[(n * len + p) * C + c];
        const mean = s / len;
        out[n * 3 * C + c] = mean; out[n * 3 * C + C + c] = mean * (sq - 14) * 0.1; out[n * 3 * C + 2 * C + c] = mean * ((sq - 14) * (sq - 14) * 0.01 - 0.1);
      }
      return out;
    }
    relu(x) { for (let i = 0; i < x.length; i++) if (x[i] < 0) x[i] = 0; return x; }

    forward(bin, glob, N, L) {
      const m = this.m, t = m.trunk, C = t.trunkNumChannels;
      let trunk = this.conv(bin, N, L, m.numInputChannels, t.initialConv);
      const gm = this.matmul(glob, N, t.initialMatMul);
      this.addNC(trunk, N, L, C, gm);
      for (const blk of t.blocks) {
        if (blk.kind === 'ordinary_block') {
          const a = this.bnRelu(trunk, C, blk.preBN, true);
          const r = this.conv(a, N, L, C, blk.regularConv);
          const b = this.bnRelu(r, blk.regularConv.oc, blk.midBN, true);
          const o = this.conv(b, N, L, blk.regularConv.oc, blk.finalConv);
          for (let i = 0; i < trunk.length; i++) trunk[i] += o[i];
        } else {
          const a = this.bnRelu(trunk, C, blk.preBN, true);
          const r = this.conv(a, N, L, C, blk.regularConv);
          const g = this.conv(a, N, L, C, blk.gpoolConv);
          const g2 = this.bnRelu(g, blk.gpoolConv.oc, blk.gpoolBN, true);
          const pooled = this.gpool(g2, N, L, blk.gpoolConv.oc);
          const bias = this.matmul(pooled, N, blk.gpoolToBiasMul);
          this.addNC(r, N, L, blk.regularConv.oc, bias);
          const b = this.bnRelu(r, blk.regularConv.oc, blk.midBN, true);
          const o = this.conv(b, N, L, blk.regularConv.oc, blk.finalConv);
          for (let i = 0; i < trunk.length; i++) trunk[i] += o[i];
        }
      }
      trunk = this.bnRelu(trunk, C, t.tipBN, true);
      // 정책
      const ph = m.policy;
      const p1 = this.conv(trunk, N, L, C, ph.p1Conv);
      const g1 = this.bnRelu(this.conv(trunk, N, L, C, ph.g1Conv), ph.g1Conv.oc, ph.g1BN, true);
      const g1p = this.gpool(g1, N, L, ph.g1Conv.oc);
      const g1b = this.matmul(g1p, N, ph.gpoolToBiasMul);
      this.addNC(p1, N, L, ph.p1Conv.oc, g1b);
      const p1a = this.bnRelu(p1, ph.p1Conv.oc, ph.p1BN, true);
      const pol = this.conv(p1a, N, L, ph.p1Conv.oc, ph.p2Conv); // [N,L,L,1]
      const pass = this.matmul(g1p, N, ph.gpoolToPassMul);        // [N,1]
      const policy = new Float32Array(N * (L * L + 1));
      for (let n = 0; n < N; n++) { for (let p = 0; p < L * L; p++) policy[n * (L * L + 1) + p] = pol[n * L * L + p]; policy[n * (L * L + 1) + L * L] = pass[n]; }
      // 가치
      const vh = m.value;
      const v1 = this.bnRelu(this.conv(trunk, N, L, C, vh.v1Conv), vh.v1Conv.oc, vh.v1BN, true);
      const vp = this.vpool(v1, N, L, vh.v1Conv.oc);
      const v2 = this.relu(this.addBias(this.matmul(vp, N, vh.v2Mul), N, vh.v2Mul.oc, vh.v2Bias));
      const value = this.addBias(this.matmul(v2, N, vh.v3Mul), N, 3, vh.v3Bias);
      const sv = this.addBias(this.matmul(v2, N, vh.sv3Mul), N, vh.sv3Mul.oc, vh.sv3Bias);
      const own = this.conv(v1, N, L, vh.v1Conv.oc, vh.vOwnershipConv);
      return { policy, value, scoreValue: sv, ownership: own, N, L };
    }
  }

  // ── TF.js 백엔드 ──
  class TfNet {
    constructor(model, tf) {
      this.m = model; this.tf = tf; this.cache = new Map();
      this.tensors = [];
    }
    t(off, len, shape) {
      const key = off + ':' + len;
      let v = this.cache.get(key);
      if (!v) { v = this.tf.keep(this.tf.tensor(this.m.W(off, len), shape, 'float32')); this.cache.set(key, v); this.tensors.push(v); }
      return v;
    }
    dispose() { for (const v of this.tensors) v.dispose(); this.tensors = []; this.cache.clear(); }
    convT(cv) { return this.t(cv.w, cv.ky * cv.kx * cv.ic * cv.oc, [cv.ky, cv.kx, cv.ic, cv.oc]); }
    bnT(bn) { return [this.t(bn.scale, bn.n, [bn.n]), this.t(bn.bias, bn.n, [bn.n])]; }
    mmT(mm) { return this.t(mm.w, mm.ic * mm.oc, [mm.ic, mm.oc]); }
    mbT(mb) { return this.t(mb.w, mb.n, [mb.n]); }
    conv(x, cv) { return this.tf.conv2d(x, this.convT(cv), 1, 'same'); }
    bnRelu(x, bn) { const [s, b] = this.bnT(bn); return this.tf.relu(this.tf.add(this.tf.mul(x, s), b)); }
    gpool(x, L) { const tf = this.tf, sq = Math.sqrt(L * L); const mean = tf.mean(x, [1, 2]); const mx = tf.max(x, [1, 2]); return tf.concat([mean, tf.mul(mean, (sq - 14) * 0.1), mx], 1); }
    vpool(x, L) { const tf = this.tf, sq = Math.sqrt(L * L); const mean = tf.mean(x, [1, 2]); return tf.concat([mean, tf.mul(mean, (sq - 14) * 0.1), tf.mul(mean, (sq - 14) * (sq - 14) * 0.01 - 0.1)], 1); }
    addNC(x, bias) { return this.tf.add(x, this.tf.reshape(bias, [bias.shape[0], 1, 1, bias.shape[1]])); }

    /** 비동기: 결과 Float32Array 반환 */
    async forward(bin, glob, N, L) {
      const tf = this.tf, m = this.m, t = m.trunk;
      const outs = tf.tidy(() => {
        const input = tf.tensor(bin, [N, L, L, m.numInputChannels], 'float32');
        const ginput = tf.tensor(glob, [N, m.numInputGlobalChannels], 'float32');
        let trunk = this.addNC(this.conv(input, t.initialConv), tf.matMul(ginput, this.mmT(t.initialMatMul)));
        for (const blk of t.blocks) {
          const a = this.bnRelu(trunk, blk.preBN);
          let r = this.conv(a, blk.regularConv);
          if (blk.kind === 'gpool_block') {
            const g = this.bnRelu(this.conv(a, blk.gpoolConv), blk.gpoolBN);
            const pooled = this.gpool(g, L);
            r = this.addNC(r, tf.matMul(pooled, this.mmT(blk.gpoolToBiasMul)));
          }
          const b = this.bnRelu(r, blk.midBN);
          trunk = tf.add(trunk, this.conv(b, blk.finalConv));
        }
        trunk = this.bnRelu(trunk, t.tipBN);
        const ph = m.policy;
        let p1 = this.conv(trunk, ph.p1Conv);
        const g1 = this.bnRelu(this.conv(trunk, ph.g1Conv), ph.g1BN);
        const g1p = this.gpool(g1, L);
        p1 = this.addNC(p1, tf.matMul(g1p, this.mmT(ph.gpoolToBiasMul)));
        const pol = tf.reshape(this.conv(this.bnRelu(p1, ph.p1BN), ph.p2Conv), [N, L * L]);
        const pass = tf.matMul(g1p, this.mmT(ph.gpoolToPassMul));
        const policy = tf.concat([pol, pass], 1);
        const vh = m.value;
        const v1 = this.bnRelu(this.conv(trunk, vh.v1Conv), vh.v1BN);
        const vp = this.vpool(v1, L);
        const v2 = tf.relu(tf.add(tf.matMul(vp, this.mmT(vh.v2Mul)), this.mbT(vh.v2Bias)));
        const value = tf.add(tf.matMul(v2, this.mmT(vh.v3Mul)), this.mbT(vh.v3Bias));
        const sv = tf.add(tf.matMul(v2, this.mmT(vh.sv3Mul)), this.mbT(vh.sv3Bias));
        const own = tf.reshape(this.conv(v1, vh.vOwnershipConv), [N, L * L]);
        return [policy, value, sv, own];
      });
      const [policy, value, scoreValue, ownership] = await Promise.all(outs.map(o => o.data()));
      outs.forEach(o => o.dispose());
      return { policy, value, scoreValue, ownership, N, L };
    }
  }

  /** 출력 후처리: 플레이어 기준 → 수치. legal: Uint8Array(L*L+1) */
  function postprocess(out, n, legal, L) {
    const P = L * L + 1, pol = out.policy.subarray(n * P, (n + 1) * P);
    const probs = new Float32Array(P);
    let maxv = -Infinity;
    for (let i = 0; i < P; i++) if (legal[i]) { if (pol[i] > maxv) maxv = pol[i]; }
    let sum = 0;
    for (let i = 0; i < P; i++) { if (legal[i]) { const e = Math.exp(pol[i] - maxv); probs[i] = e; sum += e; } else probs[i] = 0; }
    if (sum > 0) for (let i = 0; i < P; i++) probs[i] /= sum;
    const v = out.value.subarray(n * 3, n * 3 + 3);
    const mx = Math.max(v[0], v[1]);
    const ew = Math.exp(v[0] - mx), el = Math.exp(v[1] - mx); // noResult 제외 (영역 계가 + 동형반복 금지)
    const win = ew / (ew + el);
    const sv = out.scoreValue.subarray(n * 4, n * 4 + 4);
    const softplus = x => x > 20 ? x : Math.log1p(Math.exp(x));
    const scoreMean = sv[0] * 20, scoreStdev = softplus(sv[1]) * 20, lead = sv[2] * 20, varTime = softplus(sv[3]) * 40;
    const own = new Float32Array(L * L);
    const ob = out.ownership.subarray(n * L * L, (n + 1) * L * L);
    for (let i = 0; i < L * L; i++) own[i] = Math.tanh(ob[i]);
    return { policy: probs, winrate: win, scoreMean, scoreStdev, lead, varTime, ownership: own };
  }

  return { parseKBN, CpuNet, TfNet, postprocess };
});
