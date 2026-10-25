#!/usr/bin/env node
/* KataGo .bin.gz (model version 8~10, ReLU) → 바둑랩 압축 가중치 포맷(.kbn)
   사용: node convert-model.js in.bin.gz out.kbn [--f32]
   포맷: "KBN1" + uint32 headerLen + JSON header + float16(기본) 또는 float32 가중치 블록 */
const fs = require('fs');
const zlib = require('zlib');

const [,, inPath, outPath, ...flags] = process.argv;
if (!inPath || !outPath) { console.error('usage: convert-model.js in.bin.gz out.kbn [--f32]'); process.exit(1); }
const useF32 = flags.includes('--f32');

const raw = fs.readFileSync(inPath);
const buf = inPath.endsWith('.gz') ? zlib.gunzipSync(raw) : raw;
let pos = 0;
const isWs = c => c === 32 || c === 10 || c === 13 || c === 9;
function token() {
  while (pos < buf.length && isWs(buf[pos])) pos++;
  const s = pos; while (pos < buf.length && !isWs(buf[pos])) pos++;
  return buf.toString('latin1', s, pos);
}
const int = () => parseInt(token(), 10);
const num = () => parseFloat(token());
function floats(n) {
  while (pos < buf.length && buf[pos] !== 64 /* @ */) { if (!isWs(buf[pos])) throw new Error('expected @BIN@ at ' + pos); pos++; }
  const tag = buf.toString('latin1', pos, pos + 5); if (tag !== '@BIN@') throw new Error('bad BIN tag ' + tag);
  pos += 5;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) { let v = buf.readFloatLE(pos); pos += 4; if (Math.abs(v) < 1.17549435e-38) v = 0; out[i] = v; }
  return out;
}

const weights = []; let totalFloats = 0;
function store(arr) { const off = totalFloats; weights.push(arr); totalFloats += arr.length; return off; }

function conv() {
  const name = token(), ky = int(), kx = int(), ic = int(), oc = int(), dy = int(), dx = int();
  if (dy !== 1 || dx !== 1) throw new Error('dilation unsupported');
  const w = floats(ky * kx * ic * oc);
  return { name, ky, kx, ic, oc, w: store(w) };
}
function bn() {
  const name = token(), n = int(), eps = num(), hasScale = int(), hasBias = int();
  const mean = floats(n), variance = floats(n);
  const scale = hasScale ? floats(n) : new Float32Array(n).fill(1);
  const bias = hasBias ? floats(n) : new Float32Array(n);
  const ms = new Float32Array(n), mb = new Float32Array(n);
  for (let c = 0; c < n; c++) { ms[c] = scale[c] / Math.sqrt(variance[c] + eps); mb[c] = bias[c] - ms[c] * mean[c]; }
  return { name, n, scale: store(ms), bias: store(mb) };
}
function act(version) { const name = token(); let kind = 'ACTIVATION_RELU'; if (version >= 11) kind = token(); return { name, kind }; }
function matmul() { const name = token(), ic = int(), oc = int(); return { name, ic, oc, w: store(floats(ic * oc)) }; }
function matbias() { const name = token(), n = int(); return { name, n, w: store(floats(n)) }; }

const model = {};
model.name = token(); model.version = int();
if (model.version < 8 || model.version > 10) throw new Error('only model versions 8~10 supported, got ' + model.version);
model.numInputChannels = int(); model.numInputGlobalChannels = int();
const V = model.version;
// trunk
const trunk = { name: token(), numBlocks: int(), trunkNumChannels: int(), midNumChannels: int(), regularNumChannels: int(), dilatedNumChannels: int(), gpoolNumChannels: int() };
trunk.initialConv = conv(); trunk.initialMatMul = matmul();
trunk.blocks = [];
for (let i = 0; i < trunk.numBlocks; i++) {
  const kind = token();
  if (kind === 'ordinary_block') {
    trunk.blocks.push({ kind, name: token(), preBN: bn(), preAct: act(V), regularConv: conv(), midBN: bn(), midAct: act(V), finalConv: conv() });
  } else if (kind === 'gpool_block') {
    trunk.blocks.push({ kind, name: token(), preBN: bn(), preAct: act(V), regularConv: conv(), gpoolConv: conv(), gpoolBN: bn(), gpoolAct: act(V), gpoolToBiasMul: matmul(), midBN: bn(), midAct: act(V), finalConv: conv() });
  } else throw new Error('unsupported block kind ' + kind);
}
trunk.tipBN = bn(); trunk.tipAct = act(V);
model.trunk = trunk;
// policy head
const ph = { name: token() };
ph.p1Conv = conv(); ph.g1Conv = conv(); ph.g1BN = bn(); ph.g1Act = act(V); ph.gpoolToBiasMul = matmul(); ph.p1BN = bn(); ph.p1Act = act(V); ph.p2Conv = conv(); ph.gpoolToPassMul = matmul();
model.policy = ph;
// value head
const vh = { name: token() };
vh.v1Conv = conv(); vh.v1BN = bn(); vh.v1Act = act(V); vh.v2Mul = matmul(); vh.v2Bias = matbias(); vh.v2Act = act(V); vh.v3Mul = matmul(); vh.v3Bias = matbias(); vh.sv3Mul = matmul(); vh.sv3Bias = matbias(); vh.vOwnershipConv = conv();
model.value = vh;
while (pos < buf.length && isWs(buf[pos])) pos++;
if (pos !== buf.length) console.warn('warning: trailing bytes', buf.length - pos);

// 모든 activation이 RELU인지 확인
const allActs = [];
(function walk(o) { for (const k in o) { const v = o[k]; if (v && typeof v === 'object') { if (v.kind && v.kind.startsWith('ACTIVATION_')) allActs.push(v.kind); walk(v); } } })(model);
if (allActs.some(a => a !== 'ACTIVATION_RELU')) throw new Error('non-ReLU activations: ' + [...new Set(allActs)].join(','));

model.dtype = useF32 ? 'f32' : 'f16';
model.totalFloats = totalFloats;
const header = Buffer.from(JSON.stringify(model), 'utf8');
const all = new Float32Array(totalFloats); let o = 0; for (const w of weights) { all.set(w, o); o += w.length; }

function f32tof16(val) {
  const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer); f32[0] = val; const x = u32[0];
  const sign = (x >>> 16) & 0x8000; let exp = (x >>> 23) & 0xff; let mant = x & 0x7fffff;
  if (exp === 0xff) return sign | 0x7c00 | (mant ? 0x200 : 0);
  let e = exp - 127 + 15;
  if (e >= 0x1f) return sign | 0x7c00;
  if (e <= 0) { if (e < -10) return sign; mant = (mant | 0x800000) >> (1 - e); if (mant & 0x1000) mant += 0x2000; return sign | (mant >> 13); }
  if (mant & 0x1000) { mant += 0x2000; if (mant & 0x800000) { mant = 0; e += 1; if (e >= 0x1f) return sign | 0x7c00; } }
  return sign | (e << 10) | (mant >> 13);
}
let body;
if (useF32) body = Buffer.from(all.buffer);
else { const h = new Uint16Array(totalFloats); for (let i = 0; i < totalFloats; i++) h[i] = f32tof16(all[i]); body = Buffer.from(h.buffer); }

const head = Buffer.alloc(8); head.write('KBN1', 0, 'latin1'); head.writeUInt32LE(header.length, 4);
fs.writeFileSync(outPath, Buffer.concat([head, header, body]));
console.log(`${model.name} v${model.version}: ${trunk.numBlocks} blocks x ${trunk.trunkNumChannels}ch, ${totalFloats} params → ${outPath} (${((8 + header.length + body.length) / 1048576).toFixed(2)} MB, ${model.dtype})`);
