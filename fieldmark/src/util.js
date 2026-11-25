'use strict';
// ---------- core constants & math ----------
const W = 480, H = 270;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);

function hex(h) {
  h = h.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function col(c) { return typeof c === 'string' ? hex(c) : c; }
function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function scaleC(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
function rgba(c, a = 1) { return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; }
function lum(c) { return (0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]) / 255; }

// ---------- deterministic randomness ----------
function rng(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(x, y, s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul((s | 0) + 1, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const u = smooth(x - xi), v = smooth(y - yi);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
function fbm(x, y, s, oct = 3) {
  let v = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { v += a * vnoise(x * f, y * f, s + i * 31); n += a; a *= 0.5; f *= 2; }
  return v / n;
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
const dith = (x, y) => BAYER[((y & 3) << 2) | (x & 3)];
function ramp(...hs) { return hs.map(hex); }
// pick from a color ramp with ordered dithering between steps
function pick(r, v, x, y) {
  const f = clamp(v, 0, 1) * (r.length - 1);
  let i = Math.floor(f);
  if (f - i > dith(x, y)) i++;
  return r[Math.min(i, r.length - 1)];
}

// ---------- pixel buffer ----------
class PB {
  constructor(w, h) { this.w = w | 0; this.h = h | 0; this.d = new Uint8ClampedArray(this.w * this.h * 4); }
  set(x, y, c, a = 1) {
    x |= 0; y |= 0;
    if (!c || x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) << 2, d = this.d;
    if (a >= 1 || d[i + 3] === 0) {
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = a >= 1 ? 255 : Math.max(d[i + 3], a * 255);
    } else {
      d[i] = d[i] + (c[0] - d[i]) * a; d[i + 1] = d[i + 1] + (c[1] - d[i + 1]) * a; d[i + 2] = d[i + 2] + (c[2] - d[i + 2]) * a;
      d[i + 3] = Math.max(d[i + 3], a * 255);
    }
  }
  a(x, y) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0; return this.d[((y * this.w + x) << 2) + 3]; }
  get(x, y) { const i = ((y | 0) * this.w + (x | 0)) << 2; return [this.d[i], this.d[i + 1], this.d[i + 2]]; }
  clear(x, y) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= this.w || y >= this.h) return; this.d[((y * this.w + x) << 2) + 3] = 0; }
  rect(x, y, w, h, fn) {
    const f = typeof fn === 'function' ? fn : () => fn;
    for (let yy = Math.floor(y); yy < y + h; yy++) for (let xx = Math.floor(x); xx < x + w; xx++) this.set(xx, yy, f(xx, yy));
  }
  circle(cx, cy, r, fn) { this.ellipse(cx, cy, r, r, fn); }
  ellipse(cx, cy, rx, ry, fn) {
    const f = typeof fn === 'function' ? fn : () => fn;
    const x0 = Math.floor(cx - rx), x1 = Math.ceil(cx + rx), y0 = Math.floor(cy - ry), y1 = Math.ceil(cy + ry);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny <= 1) { const c = f(x, y, nx, ny); if (c) this.set(x, y, c); }
    }
  }
  poly(pts, fn) {
    const f = typeof fn === 'function' ? fn : () => fn;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
      if (inPoly(pts, x + 0.5, y + 0.5)) { const c = f(x, y, (x - x0) / Math.max(1, x1 - x0), (y - y0) / Math.max(1, y1 - y0)); if (c) this.set(x, y, c); }
    }
  }
  // thick line (round brush); fn receives (x,y,t)
  line(xa, ya, xb, yb, th, fn) {
    const f = typeof fn === 'function' ? fn : () => fn;
    const len = Math.hypot(xb - xa, yb - ya), n = Math.max(1, Math.ceil(len * 2));
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = xa + (xb - xa) * t, y = ya + (yb - ya) * t;
      const w = typeof th === 'function' ? th(t) : th;
      if (w <= 1.01) this.set(Math.floor(x), Math.floor(y), f(Math.floor(x), Math.floor(y), t));
      else this.ellipse(x, y, w / 2, w / 2, (px, py) => f(px, py, t));
    }
  }
  canvas() {
    const c = document.createElement('canvas'); c.width = this.w; c.height = this.h;
    c.getContext('2d').putImageData(new ImageData(this.d, this.w, this.h), 0, 0);
    return c;
  }
}
function inPoly(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// add a 1px selective outline (darkened neighbour colour) around opaque pixels
function outlinePB(pb, tint = [22, 16, 30], k = 0.72) {
  const src = new Uint8ClampedArray(pb.d);
  const w = pb.w, h = pb.h;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) << 2;
    if (src[i + 3] > 0) continue;
    let best = -1;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const j = (yy * w + xx) << 2;
      if (src[j + 3] > 200) { best = j; break; }
    }
    if (best >= 0) {
      const c = mix([src[best], src[best + 1], src[best + 2]], tint, k);
      pb.d[i] = c[0]; pb.d[i + 1] = c[1]; pb.d[i + 2] = c[2]; pb.d[i + 3] = 255;
    }
  }
}

// ---------- tiny 3x5 pixel font (for in-canvas labels) ----------
const FONT = {};
(() => {
  const g = {
    A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
    F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
    K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
    P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
    U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
    Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
    4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111',
    9: '111101111001110', '!': '010010010000010', '?': '110001010000010', ':': '000010000010000', '.': '000000000000010',
    '-': '000000111000000', '/': '001001010100100', '%': '101001010100101', '+': '000010111010000', ' ': '000000000000000',
    "'": '010010000000000', ',': '000000000010100'
  };
  for (const k in g) FONT[k] = g[k];
})();
function drawText(ctx, str, x, y, color, sc = 1) {
  ctx.fillStyle = color;
  str = String(str).toUpperCase();
  let cx = Math.round(x);
  for (const ch of str) {
    const g = FONT[ch] || FONT['?'];
    for (let i = 0; i < 15; i++) if (g[i] === '1') ctx.fillRect(cx + (i % 3) * sc, Math.round(y) + Math.floor(i / 3) * sc, sc, sc);
    cx += 4 * sc;
  }
}
const textW = (str, sc = 1) => String(str).length * 4 * sc - sc;

function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
