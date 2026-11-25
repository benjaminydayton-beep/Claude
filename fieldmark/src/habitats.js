'use strict';
// ============ procedural habitat painting ============
// Each habitat paints three parallax layers (far, mid, near) plus a foreground strip into
// pixel buffers, and records perches, light sources and water surfaces as it goes.
const WORLD_W = 1600;
const PAR = { far: 0.15, mid: 0.45, fore: 1.22 };
// wide enough for any view width between W_MIN and W_MAX
const layerW = f => Math.ceil(Math.max(W_MAX + (WORLD_W - W_MAX) * f, W_MIN + (WORLD_W - W_MIN) * f)) + 2;

// ---------- distant scenery ----------
function paintRidge(pb, o) {
  const { base, amp, scale, seed, ramp, sharp = false, snow = null, haze = 0 } = o;
  const top = x => {
    let n = fbm(x / scale, 0.5, seed, 4);
    if (sharp) n = 1 - Math.abs(n * 2 - 1);
    return base - amp * n;
  };
  for (let x = 0; x < pb.w; x++) {
    const t = Math.round(top(x)), sl = top(x - 2) - top(x + 2);
    for (let y = Math.max(0, t); y < pb.h; y++) {
      const d = y - t;
      let v = 0.72 - d / 90 + sl * 0.06 + (fbm(x / 6, y / 4, seed + 3, 2) - 0.5) * 0.25 + haze;
      let c = pick(ramp, v, x, y);
      if (snow && y < snow.line + (fbm(x / 9, 0, seed + 8, 2) - 0.5) * 22 && d < 26 + sl * 4) c = pick(snow.ramp, 0.6 + sl * 0.12 - d / 40, x, y);
      pb.set(x, y, c);
    }
  }
}
function paintMesas(pb, o) {
  const { base, seed, ramp, n = 5 } = o;
  const r = rng(seed);
  const mesas = [];
  for (let i = 0; i < n; i++) mesas.push({ x: (i + 0.2 + r() * 0.6) * pb.w / n, w: 50 + r() * 90, h: 40 + r() * 55, s: 6 + r() * 10 });
  const top = x => {
    let t = base;
    for (const m of mesas) {
      const d = Math.abs(x - m.x) - m.w / 2;
      const hh = d <= 0 ? m.h : Math.max(0, m.h - d * (m.h / m.s) * 0.6 - d * 0.4);
      t = Math.min(t, base - hh + (d <= 0 ? (fbm(x / 7, 1, seed, 2) - 0.5) * 3 : 0));
    }
    return t + (fbm(x / 40, 0, seed + 2, 3) - 0.5) * 8;
  };
  for (let x = 0; x < pb.w; x++) {
    const t = Math.round(top(x)), sl = top(x - 1) - top(x + 1);
    for (let y = Math.max(0, t); y < pb.h; y++) {
      const band = Math.floor((y + fbm(x / 25, 0, seed + 5, 2) * 6) / 7) % 3;
      const v = 0.62 - (y - t) / 160 + sl * 0.1 + (band === 0 ? 0.12 : band === 1 ? -0.05 : 0) + (hash2(x, y, seed) - 0.5) * 0.1;
      pb.set(x, y, pick(ramp, v, x, y));
    }
  }
}
function paintBlobLine(pb, o) {
  const { base, ramp, seed, step = 9, rmin = 8, rmax = 18, trunk = null } = o;
  const r = rng(seed);
  for (let x = -10; x < pb.w + 20; x += step * (0.6 + r() * 0.8)) {
    const rr = rmin + r() * (rmax - rmin), cy = base - rr * (0.6 + r() * 0.9);
    if (trunk) pb.rect(x - 1, cy, 2, base - cy + 40, trunk);
    pb.ellipse(x, cy, rr, rr * 0.92, (px, py, nx, ny) => {
      if (nx * nx + ny * ny > 0.82 + (hash2(px, py, seed) - 0.5) * 0.4) return null;
      return pick(ramp, 0.55 - ny * 0.35 - nx * 0.15 + (fbm(px / 3, py / 3, seed, 2) - 0.5) * 0.45, px, py);
    });
  }
  pb.rect(0, base, pb.w, pb.h - base, (x, y) => pick(ramp, 0.25 - (y - base) / 80, x, y));
}
function paintConiferLine(pb, o) {
  const { base, ramp, seed, step = 7, hmin = 16, hmax = 34, snow = null } = o;
  const r = rng(seed);
  for (let x = -6; x < pb.w + 10; x += step * (0.5 + r())) {
    const h = hmin + r() * (hmax - hmin), w = h * (0.38 + r() * 0.1), by = base + r() * 8;
    pb.poly([[x, by - h], [x - w / 2, by], [x + w / 2, by]], (px, py) => {
      const u = (px - (x - w / 2)) / w;
      let c = pick(ramp, 0.75 - u * 0.6 + (hash2(px, py, seed) - 0.5) * 0.3 - ((py - (by - h)) / h) * 0.2, px, py);
      if (snow && hash2(px, py, seed + 1) < 0.35 - (py - (by - h)) / h * 0.4) c = snow;
      return c;
    });
  }
  pb.rect(0, base + 4, pb.w, pb.h, (x, y) => pick(ramp, 0.15, x, y));
}

// ---------- ground ----------
function paintGround(pb, gy, o) {
  const { top, soil, seed, topH = 3, skip = null, pebble = null } = o;
  for (let x = 0; x < pb.w; x++) {
    if (skip && skip(x)) continue;
    const t = Math.round(gy(x));
    for (let y = Math.max(0, t); y < pb.h; y++) {
      const d = y - t;
      let c;
      if (d < topH) c = pick(top, 0.9 - d / topH * 0.55 + (hash2(x, y, seed) - 0.5) * 0.35, x, y);
      else {
        const v = 0.7 - (d / 60) * 0.6 + (fbm(x / 12, y / 5, seed, 3) - 0.5) * 0.7;
        c = pick(soil, v, x, y);
        if (pebble && hash2(x, y, seed + 9) < 0.01) c = pebble;
        c = mix(c, [14, 10, 12], clamp((d - 8) / 70, 0, 0.62));
      }
      pb.set(x, y, c);
    }
  }
  // stones embedded in the soil
  const r = rng(seed + 77), stone = o.stone || ramp('#3a3634', '#55504a', '#706a62', '#8a8478');
  for (let i = 0; i < pb.w / 16; i++) {
    const x = r() * pb.w;
    if (skip && skip(Math.floor(x))) continue;
    const t = gy(x), y = t + 7 + r() * 36, rx = 1.5 + r() * 3, ry = 1 + r() * 1.6, dk = clamp((y - t - 8) / 70, 0, 0.6);
    if (t > pb.h) continue;
    pb.ellipse(x, y, rx, ry, (px, py, nx, ny) => mix(pick(stone, 0.6 - ny * 0.5 - nx * 0.2, px, py), [14, 10, 12], dk));
  }
}
function paintTufts(pb, gy, o) {
  const { ramp, seed, density = 0.25, hmax = 5, skip = null } = o;
  for (let x = 0; x < pb.w; x++) {
    if (skip && skip(x)) continue;
    if (hash2(x, 7, seed) > density) continue;
    const t = Math.round(gy(x)), h = 1 + Math.floor(hash2(x, 3, seed) * hmax), lean = hash2(x, 5, seed) < 0.5 ? -1 : 1;
    for (let i = 0; i < h; i++) pb.set(x + (i > h / 2 ? lean : 0), t - 1 - i, pick(ramp, 0.4 + i / h * 0.6, x, t - i));
  }
}

// ---------- props ----------
function leafBlobs(pb, blobs, ramp, seed, rough = 0.35) {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const b of blobs) { x0 = Math.min(x0, b.x - b.r); x1 = Math.max(x1, b.x + b.r); y0 = Math.min(y0, b.y - b.r); y1 = Math.max(y1, b.y + b.r); }
  const cy = (y0 + y1) / 2, R = (y1 - y0) / 2;
  for (let py = Math.floor(y0); py <= y1; py++) for (let px = Math.floor(x0); px <= x1; px++) {
    let best = -1, bn = null;
    for (const b of blobs) {
      const dx = px + 0.5 - b.x, dy = py + 0.5 - b.y;
      const q = 1 - (dx * dx + dy * dy) / (b.r * b.r);
      if (q > best) { best = q; bn = [dx / b.r, dy / b.r]; }
    }
    best -= (fbm(px / 2.6, py / 2.6, seed, 2) - 0.5) * rough;
    if (best <= 0) continue;
    const clump = fbm(px / 4.5, py / 4.5, seed + 5, 2) - 0.5;
    const v = 0.46 + 0.42 * (-bn[1] * 0.8 - bn[0] * 0.35) + clump * 0.7 - (py - cy) / R * 0.12 + (best < 0.12 ? -0.12 : 0);
    pb.set(px, py, pick(ramp, v, px, py));
  }
}
function deciduousTree(pb, x, gy, o, H) {
  const r = rng(o.seed);
  const h = o.h, R = o.R, bw = o.bw || 6 + r() * 4, tw = bw * 0.45, top = gy - h;
  const bark = o.bark;
  const trunkW = py => lerp(bw, tw, clamp((gy - py) / h, 0, 1));
  pb.poly([[x - bw / 2, gy + 3], [x + bw / 2, gy + 3], [x + tw / 2, top], [x - tw / 2, top]], (px, py) => {
    const w = trunkW(py), u = (px + 0.5 - (x - w / 2)) / w;
    return pick(bark, 0.9 - u * 0.8 + (fbm(px * 0.8, py * 0.1, o.seed, 2) - 0.5) * 0.6, px, py);
  });
  pb.poly([[x - bw / 2 - 4, gy + 2], [x - bw / 2 + 1, gy - 5], [x - bw / 2 + 1, gy + 2]], (px, py) => pick(bark, 0.55, px, py));
  pb.poly([[x + bw / 2 + 4, gy + 2], [x + bw / 2 - 1, gy - 5], [x + bw / 2 - 1, gy + 2]], (px, py) => pick(bark, 0.15, px, py));
  if (o.trunkPerch) {
    for (const f of [0.3, 0.5]) {
      const yy = Math.round(gy - h * f), w = trunkW(yy);
      H.perches.push({ type: 'trunk', x: Math.round(x - w / 2) + 1, y: yy, face: 1 });
      H.perches.push({ type: 'trunk', x: Math.round(x + w / 2) - 1, y: yy - 6, face: -1 });
    }
  }
  if (o.bare) {
    // dead snag: bare branches only
    const nb = 4;
    for (let i = 0; i < nb; i++) {
      const side = i % 2 ? 1 : -1, by = gy - h * (0.4 + i * 0.14), len = 16 + r() * 14;
      const bx0 = x + side * trunkW(by) * 0.3, ex = bx0 + side * len, ey = by - 6 - r() * 10;
      pb.line(bx0, by, ex, ey, t => lerp(3, 1, t), (px, py) => pick(bark, 0.55 + (py < by ? 0.2 : 0), px, py));
      H.perches.push({ type: 'branch', x: Math.round(lerp(bx0, ex, 0.7)), y: Math.round(lerp(by, ey, 0.7) - 1), face: side });
    }
    return;
  }
  const cx = x + (r() - 0.5) * 6, cy = top - R * 0.35;
  const blobs = [{ x: cx, y: cy, r: R * 0.62 }];
  const nbl = 5 + Math.floor(r() * 3);
  for (let i = 0; i < nbl; i++) {
    const a = (i / nbl) * TAU + r() * 0.6;
    blobs.push({ x: cx + Math.cos(a) * R * (0.45 + r() * 0.2), y: cy + Math.sin(a) * R * 0.38, r: R * (0.4 + r() * 0.18) });
  }
  leafBlobs(pb, blobs, o.leaf, o.seed);
  const nb = o.branches === undefined ? 2 + Math.floor(r() * 2) : o.branches;
  for (let i = 0; i < nb; i++) {
    const side = (i + (o.seed & 1)) % 2 ? 1 : -1;
    const by = gy - h * (0.38 + r() * 0.26), len = 15 + r() * 11;
    const bx0 = x + side * trunkW(by) * 0.25, ex = bx0 + side * len, ey = by - 4 - r() * 6;
    pb.line(bx0, by, ex, ey, t => lerp(3.2, 1.4, t), (px, py, t) => pick(bark, 0.62 - t * 0.2 + (hash2(px, py, 3) - 0.5) * 0.3, px, py));
    leafBlobs(pb, [{ x: ex + side * 2, y: ey - 2, r: 4 }, { x: ex + side * 5, y: ey + 1, r: 3 }], o.leaf, o.seed + i);
    H.perches.push({ type: 'branch', x: Math.round(lerp(bx0, ex, 0.68)), y: Math.round(lerp(by, ey, 0.68) - 1), face: side });
  }
}
function conifer(pb, x, gy, o, H) {
  const { h, w, ramp, bark, seed, snow } = o;
  const r = rng(seed);
  pb.rect(x - 1.5, gy - h * 0.2, 3, h * 0.2 + 3, (px, py) => pick(bark, px < x ? 0.7 : 0.3, px, py));
  const n = 6;
  let apexY = gy;
  for (let i = 0; i < n; i++) {
    const t = i / n, yb = gy - h * 0.12 - t * h * 0.8, tw = w * (1 - t * 0.8), th = h * 0.3 * (1 - t * 0.35);
    const pts = [[x, yb - th]];
    const segs = Math.max(3, Math.floor(tw / 4));
    pts.push([x - tw / 2, yb]);
    for (let k = 1; k < segs; k++) pts.push([x - tw / 2 + tw * k / segs, yb - (k % 2 ? 2 : 0)]);
    pts.push([x + tw / 2, yb]);
    pb.poly(pts, (px, py) => {
      const u = (px + 0.5 - (x - tw / 2)) / tw;
      const edgeY = yb - th * (1 - Math.abs(px + 0.5 - x) / (tw / 2));
      let c = pick(ramp, 0.8 - u * 0.6 - ((py - (yb - th)) / th) * 0.3 + (hash2(px, py, seed) - 0.5) * 0.3, px, py);
      if (snow && py - edgeY < 1.8 + hash2(px, 1, seed) * 1.6) c = pick(snow, 0.85 - u * 0.5, px, py);
      return c;
    });
    if (i === 1 || i === 3) {
      H.perches.push({ type: 'branch', x: Math.round(x - tw / 2 + 2), y: Math.round(yb - 1), face: -1 });
      H.perches.push({ type: 'branch', x: Math.round(x + tw / 2 - 2), y: Math.round(yb - 1), face: 1 });
    }
    apexY = yb - th;
  }
  H.perches.push({ type: 'treetop', x: Math.round(x), y: Math.round(apexY + 1), face: r() < 0.5 ? 1 : -1 });
}
function rock(pb, cx, gy, rw, rh, o, H, perchType) {
  const { ramp, seed, moss = null, snow = null } = o;
  const cy = gy - rh * 0.45;
  pb.ellipse(cx, cy, rw, rh, (px, py, nx, ny) => {
    if (py > gy + 2) return null;
    if (nx * nx + ny * ny > 0.9 + (hash2(px, py, seed) - 0.5) * 0.25) return null;
    let v = 0.58 - ny * 0.38 - nx * 0.2 + (fbm(px / 3, py / 3, seed, 2) - 0.5) * 0.45;
    if (hash2(px, Math.floor(py / 3), seed + 4) < 0.04) v -= 0.3;
    let c = pick(ramp, v, px, py);
    if (snow && ny < -0.35 + (hash2(px, 0, seed) - 0.5) * 0.3) c = pick(snow, 0.8 - nx * 0.3, px, py);
    else if (moss && ny < -0.45 + (fbm(px / 2, 0, seed, 1) - 0.5) * 0.4) c = pick(moss, 0.7 - nx * 0.3, px, py);
    return c;
  });
  const topY = Math.round(cy - rh) + 1;
  if (H && perchType) H.perches.push({ type: perchType, x: Math.round(cx), y: topY + 1, face: hash2(cx, 1, seed) < 0.5 ? 1 : -1 });
  return topY;
}
function cattails(pb, x, by, n, seed, H, withPerch = true) {
  const r = rng(seed);
  const stem = ramp('#2e4a22', '#3e6228', '#567e32', '#78a040');
  const head = ramp('#3a2414', '#5a3820', '#7a4e2a', '#946438');
  let best = null;
  for (let i = 0; i < n; i++) {
    const sx = x + (r() - 0.5) * 12, hgt = 20 + r() * 18, lean = (r() - 0.5) * 5;
    // leaves
    for (let k = 0; k < 2; k++) {
      const side = k ? 1 : -1, lh = 14 + r() * 14;
      pb.line(sx, by, sx + side * (3 + r() * 5), by - lh, 1, (px, py, t) => pick(stem, 0.3 + t * 0.6, px, py));
    }
    pb.line(sx, by, sx + lean, by - hgt, 1, (px, py, t) => pick(stem, 0.4 + t * 0.4, px, py));
    const hx = Math.round(sx + lean), hy = Math.round(by - hgt);
    pb.rect(hx - 1, hy + 2, 2, 7, (px, py) => pick(head, px === hx - 1 ? 0.8 : 0.35, px, py));
    pb.set(hx, hy, stem[1]); pb.set(hx, hy + 1, stem[1]);
    if (!best || hy < best.y) best = { x: hx, y: hy + 2 };
  }
  if (withPerch && H) H.perches.push({ type: 'reed', x: best.x, y: best.y, face: r() < 0.5 ? 1 : -1 });
}
function saguaro(pb, x, gy, h, seed, H) {
  const r = rng(seed);
  const cr = ramp('#1e3a22', '#2a4e2a', '#3a6632', '#4e7e3a', '#6a9648');
  const spine = hex('#e8e0b8');
  const cw = 8 + Math.floor(r() * 3);
  const col = (x0, y0, w, hh) => {
    pb.rect(x0, y0 + w / 2, w, hh - w / 2, (px, py) => {
      const u = (px + 0.5 - x0) / w;
      if (hash2(px, py, seed) < 0.05) return spine;
      return pick(cr, 0.88 - u * 0.75 + ((px - x0) % 2 ? -0.12 : 0.06), px, py);
    });
    pb.ellipse(x0 + w / 2, y0 + w / 2, w / 2, w / 2, (px, py, nx, ny) => pick(cr, 0.75 - nx * 0.4 - ny * 0.3 + ((px - x0) % 2 ? -0.1 : 0.05), px, py));
  };
  const narms = 1 + Math.floor(r() * 2.2);
  const arms = [];
  for (let i = 0; i < narms; i++) {
    const side = i % 2 ? 1 : -1, ay = gy - h * (0.35 + r() * 0.25), out = 7 + r() * 4, up = 12 + r() * 14;
    const aw = cw - 2;
    const ax = side > 0 ? x + cw / 2 + out - aw : x - cw / 2 - out;
    // elbow
    pb.rect(Math.min(x, ax), ay - aw / 2, Math.abs(ax - x) + aw, aw, (px, py) => pick(cr, 0.6 - (py - (ay - aw / 2)) / aw * 0.5, px, py));
    col(ax, ay - up, aw, up + aw / 2);
    arms.push({ x: ax + aw / 2, y: ay - up });
  }
  col(x - cw / 2, gy - h, cw, h + 3);
  if (H) {
    H.perches.push({ type: 'cactus', x: Math.round(x), y: Math.round(gy - h) + 1, face: r() < 0.5 ? 1 : -1 });
    for (const a of arms) H.perches.push({ type: 'cactus', x: Math.round(a.x), y: Math.round(a.y) + 1, face: r() < 0.5 ? 1 : -1 });
    H.perches.push({ type: 'trunk', x: Math.round(x - cw / 2), y: Math.round(gy - h * 0.55), face: 1 });
    H.perches.push({ type: 'trunk', x: Math.round(x + cw / 2) - 1, y: Math.round(gy - h * 0.7), face: -1 });
  }
}
function ocotillo(pb, x, gy, seed, H) {
  const r = rng(seed);
  const st = ramp('#3a3428', '#56503a', '#6e6a4a');
  const leaf = ramp('#4a6a2a', '#6a8a34');
  const fl = ramp('#a82418', '#e03a24', '#f87a3a');
  const n = 9 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / (n - 1) - 0.5) * 1.1 + (r() - 0.5) * 0.15, len = 34 + r() * 18;
    const ex = x + Math.cos(a) * len, ey = gy + Math.sin(a) * len;
    pb.line(x + (r() - 0.5) * 3, gy, ex, ey, 1, (px, py) => (hash2(px, py, seed) < 0.3 ? pick(leaf, 0.6, px, py) : pick(st, 0.5, px, py)));
    pb.rect(Math.round(ex) - 1, Math.round(ey) - 3, 2, 4, (px, py) => pick(fl, 0.9 - (py - ey + 3) / 4, px, py));
    if (H && i % 3 === 1) {
      const side = Math.cos(a) >= 0 ? 1 : -1;
      H.perches.push({ type: 'flower', x: Math.round(ex + side * 7), y: Math.round(ey + 1), face: -side, fx: Math.round(ex), fy: Math.round(ey - 1) });
    }
  }
}
function pricklyPear(pb, x, gy, seed) {
  const r = rng(seed);
  const pr = ramp('#2e4a26', '#3e6a30', '#5a8a3c', '#7aa64a');
  const pads = [[0, -6, 5, 7, 0], [-6, -15, 4, 6, -0.4], [5, -14, 4, 6, 0.4], [0, -22, 3.5, 5, 0.1]];
  for (const [dx, dy, rx, ry] of pads) {
    pb.ellipse(x + dx, gy + dy, rx, ry, (px, py, nx, ny) => (hash2(px, py, seed) < 0.06 ? hex('#e8e0b8') : pick(pr, 0.6 - nx * 0.35 - ny * 0.25, px, py)));
  }
  if (r() < 0.8) { pb.ellipse(x + 4, gy - 28, 1.5, 2, hex('#c8305a')); pb.ellipse(x - 3, gy - 27, 1.5, 2, hex('#a82a50')); }
}
function scrub(pb, x, gy, w, h, rp, seed) {
  const r = rng(seed);
  const blobs = [];
  for (let i = 0; i < 9; i++) blobs.push({ x: x + (r() - 0.5) * w, y: gy - h * 0.4 - r() * h * 0.6, r: 2.5 + r() * 3 });
  leafBlobs(pb, blobs, rp, seed, 0.55);
  for (let i = 0; i < 4; i++) pb.line(x + (r() - 0.5) * 4, gy + 1, x + (r() - 0.5) * w * 0.8, gy - h * 0.6, 1, hex('#4a3a2a'));
}
function fern(pb, x, gy, seed, rp) {
  const r = rng(seed);
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i - 2.5) * 0.42, len = 9 + r() * 7;
    const ex = x + Math.cos(a) * len, ey = gy + Math.sin(a) * len * 0.8;
    pb.line(x, gy, ex, ey, 1, (px, py, t) => pick(rp, 0.3 + t * 0.6, px, py));
    for (let k = 2; k < len; k += 2) {
      const tx = x + Math.cos(a) * k, ty = gy + Math.sin(a) * k * 0.8;
      pb.set(tx, ty - 1, pick(rp, 0.7, tx, ty)); pb.set(tx + Math.sign(Math.cos(a) || 1), ty, pick(rp, 0.5, tx, ty));
    }
  }
}
function mushroom(pb, x, gy, c) {
  pb.rect(x, gy - 3, 1, 3, hex('#e8dcc8'));
  pb.ellipse(x + 0.5, gy - 3.5, 2.5, 1.6, (px, py, nx, ny) => (ny < 0 && hash2(px, py, 9) < 0.25 ? hex('#f4f0e8') : mix(hex(c), [255, 255, 255], ny < -0.3 ? 0.15 : 0)));
}
function lampPost(pb, x, gy, H, wood = '#3a2a1e') {
  const wd = hex(wood);
  pb.rect(x, gy - 26, 2, 26, (px) => (px === x ? mix(wd, [255, 255, 255], 0.15) : wd));
  pb.rect(x - 1, gy - 27, 5, 1, wd);
  pb.rect(x + 2, gy - 25, 1, 2, hex('#2a2a2a'));
  pb.rect(x + 1, gy - 23, 3, 4, hex('#2a2620'));
  pb.rect(x + 2, gy - 22, 1, 2, hex('#6a6040'));
  H.lights.push({ x: x + 2.5, y: gy - 21, r: 70, col: [1, 0.78, 0.45], i: 0.95, lamp: true, flick: 0.04 });
  H.emit.push({ x: x + 1, y: gy - 23, w: 3, h: 4, col: [255, 214, 140], lamp: true, glow: 10 });
}

// ---------- buildings ----------
function cabin(pb, x, gy, H) {
  const logs = ramp('#3a2416', '#5a3a22', '#7a522e', '#94683a');
  const roof = ramp('#2a2224', '#3e3236', '#56484a', '#6e5e5c');
  const stone = ramp('#4a4a4e', '#66666a', '#88888c');
  const w = 78, hh = 30, x0 = x, y0 = gy - hh;
  pb.rect(x0 - 2, gy - 4, w + 4, 6, (px, py) => pick(stone, hash2(px >> 2, py >> 1, 4), px, py));
  pb.rect(x0, y0, w, hh - 4, (px, py) => {
    const row = Math.floor((py - y0) / 4), inRow = (py - y0) % 4;
    return pick(logs, (inRow === 0 ? 0.85 : inRow === 3 ? 0.1 : 0.5) + (hash2(px >> 3, row, 2) - 0.5) * 0.3, px, py);
  });
  // log ends
  for (let yy = y0; yy < gy - 4; yy += 4) { pb.ellipse(x0 - 1, yy + 2, 2, 2, logs[3]); pb.ellipse(x0 + w + 1, yy + 2, 2, 2, logs[2]); }
  // roof
  pb.poly([[x0 - 8, y0 + 2], [x0 + w + 8, y0 + 2], [x0 + w - 14, y0 - 22], [x0 + 14, y0 - 22]], (px, py) => {
    const row = Math.floor((py - (y0 - 22)) / 3);
    return pick(roof, 0.7 - (py - y0 + 22) / 30 + ((px + row * 3) % 8 === 0 ? -0.35 : 0), px, py);
  });
  pb.rect(x0 - 8, y0 + 2, w + 16, 1, roof[0]);
  // chimney
  pb.rect(x0 + w - 24, y0 - 30, 8, 14, (px, py) => pick(stone, hash2(px >> 1, py >> 1, 5), px, py));
  H.chimney = { x: x0 + w - 20, y: y0 - 31 };
  // door
  pb.rect(x0 + 14, gy - 22, 11, 18, (px, py) => pick(logs, (px - x0 - 14) % 4 === 0 ? 0.05 : 0.3, px, py));
  pb.set(x0 + 22, gy - 13, hex('#c8a040'));
  // window (dark glass; glows at night)
  const wx = x0 + 42, wy = y0 + 6;
  pb.rect(wx - 1, wy - 1, 20, 13, logs[0]);
  pb.rect(wx, wy, 18, 11, hex('#1c2430'));
  pb.rect(wx + 8, wy, 2, 11, logs[1]); pb.rect(wx, wy + 5, 18, 1, logs[1]);
  H.emit.push({ x: wx, y: wy, w: 18, h: 11, col: [255, 196, 110], lamp: true, glow: 22, frame: [wx + 8, wy + 5] });
  H.lights.push({ x: wx + 9, y: wy + 12, r: 95, col: [1, 0.72, 0.4], i: 0.85, lamp: true, flick: 0.05 });
  // porch lantern
  pb.rect(x0 + 30, gy - 26, 1, 3, hex('#2a2a2a'));
  pb.rect(x0 + 29, gy - 23, 3, 4, hex('#2a2620'));
  H.emit.push({ x: x0 + 29, y: gy - 23, w: 3, h: 4, col: [255, 210, 130], lamp: true, glow: 10 });
  H.lights.push({ x: x0 + 30.5, y: gy - 21, r: 60, col: [1, 0.75, 0.42], i: 0.8, lamp: true, flick: 0.06 });
}
function boardwalk(pb, x0, x1, deckY, H, railing = true) {
  const wood = ramp('#3a2a1c', '#5a4028', '#765638', '#927048');
  for (let x = x0 + 6; x < x1; x += 26) pb.rect(x, deckY + 4, 3, H_ - deckY, (px, py) => pick(wood, px === x ? 0.5 : 0.1, px, py));
  pb.rect(x0, deckY, x1 - x0, 4, (px, py) => pick(wood, (py === deckY ? 0.95 : py === deckY + 3 ? 0.05 : 0.55) + ((px - x0) % 9 === 0 ? -0.4 : 0) + (hash2(px >> 3, 1, 3) - 0.5) * 0.2, px, py));
  if (railing) {
    for (let x = x0 + 4; x < x1; x += 52) {
      pb.rect(x, deckY - 11, 2, 11, (px) => pick(wood, px === x ? 0.8 : 0.3, px, 0));
      H.perches.push({ type: 'post', x: x + 1, y: deckY - 11, face: hash2(x, 2, 1) < 0.5 ? 1 : -1 });
    }
    pb.rect(x0, deckY - 10, x1 - x0, 1, wood[2]);
    pb.rect(x0, deckY - 5, x1 - x0, 1, wood[1]);
  }
}
const H_ = H;

// ---------- the six habitats ----------
function newHab(id) {
  return { id, perches: [], lights: [], emit: [], water: [], decor: {} };
}
const HAB_INFO = {
  forest: { name: 'Maplewood Forest', blurb: 'Mixed hardwood forest with a ranger cabin. Woodpeckers on the trunks, songbirds in the branches, an owl after dark.', need: 0 },
  wetland: { name: 'Cattail Marsh', blurb: 'A boardwalk over open water and reed beds. Wading herons, dabbling ducks and singing blackbirds.', need: 3 },
  coast: { name: 'Puffin Point', blurb: 'Sea cliffs with a lighthouse, a long beach and a fishing pier. Seabirds, shorebirds and an Osprey overhead.', need: 7 },
  desert: { name: 'Saguaro Flats', blurb: 'Sonoran desert of saguaros, ocotillo and burrows. Hot days, cool campfire nights.', need: 11 },
  mountain: { name: 'Granite Pass', blurb: 'Alpine meadows, snowy pines and a cold mountain stream beneath jagged peaks.', need: 15 },
  rainforest: { name: 'Cloud Rainforest', blurb: 'Towering buttressed trees, vines and glowing fungi. Rain showers roll through the canopy.', need: 20 },
};

const HAB_BUILDERS = {
  forest() {
    const Hb = newHab('forest');
    const gy = x => 213 + 5 * Math.sin(x / 140) + 2 * Math.sin(x / 37 + 1);
    Hb.groundY = gy; Hb.walkY = gy;
    Hb.amb = [0.94, 0.97, 0.92];
    const far = new PB(layerW(PAR.far), H), mid = new PB(layerW(PAR.mid), H), near = new PB(WORLD_W, H), fore = new PB(layerW(PAR.fore), H);
    paintRidge(far, { base: 150, amp: 46, scale: 110, seed: 11, ramp: ramp('#2e4662', '#3c5874', '#4c6a86', '#5e7e98', '#7090a8') });
    paintRidge(far, { base: 184, amp: 26, scale: 70, seed: 12, ramp: ramp('#2a4448', '#36544e', '#44645a', '#567666') });
    paintBlobLine(mid, { base: 200, seed: 13, ramp: ramp('#14281c', '#1c3626', '#26462e', '#325838', '#406a42'), step: 10, rmin: 10, rmax: 22, trunk: hex('#1a1612') });
    paintConiferLine(mid, { base: 205, seed: 14, ramp: ramp('#10221a', '#183024', '#22402c'), step: 18, hmin: 22, hmax: 40 });
    const grass = ramp('#2a4e26', '#3e6a2e', '#588838', '#7aa444', '#9cbc52');
    const soil = ramp('#22160f', '#33231a', '#463224', '#5c4430', '#6e5438');
    paintGround(near, gy, { top: grass, soil, seed: 15, topH: 3, pebble: hex('#7a6a5a') });
    const bark = ramp('#241a14', '#38281e', '#4e3a2a', '#66503a', '#7e6a50');
    const leafG = ramp('#16301e', '#1f4226', '#2e5a2e', '#447636', '#62903e', '#86ac4c', '#aec660');
    const leafA = ramp('#4a1c12', '#6e2a16', '#983e1a', '#c05e22', '#dc8a2c', '#eeb448');
    const trees = [[40, 66, 30], [175, 72, 32], [320, 58, 27], [455, 74, 33], [600, 62, 29], [1000, 70, 31], [1135, 60, 28], [1280, 76, 34], [1420, 64, 30], [1560, 70, 32]];
    trees.forEach(([x, h, R], i) => deciduousTree(near, x, Math.round(gy(x)), { h, R, seed: 100 + i, bark, leaf: i === 3 || i === 7 ? leafA : leafG, trunkPerch: i % 2 === 0 }, Hb));
    cabin(near, 742, Math.round(gy(780)), Hb);
    for (const [x, s] of [[110, 1], [250, 2], [395, 3], [530, 4], [905, 5], [1065, 6], [1210, 7], [1350, 8], [1490, 9]]) scrub(near, x, Math.round(gy(x)), 18, 10, leafG, 200 + s);
    for (const [x, s] of [[140, 1], [365, 2], [690, 3], [940, 4], [1180, 5], [1385, 6]]) fern(near, x, Math.round(gy(x)), 300 + s, ramp('#2a5a2a', '#3e7a32', '#5a9a3c'));
    for (const x of [205, 512, 1100, 1312]) mushroom(near, x, Math.round(gy(x)), '#c83a2a');
    const rockR = ramp('#3c3c40', '#56565a', '#707074', '#8c8c8e', '#a6a6a4');
    for (const [x, w, h] of [[285, 9, 6], [660, 12, 7], [1240, 8, 5], [1515, 10, 6]]) rock(near, x, Math.round(gy(x)), w, h, { ramp: rockR, seed: x, moss: ramp('#3a5a2a', '#507a32') }, Hb, null);
    // fallen log
    near.rect(548, Math.round(gy(560)) - 6, 34, 6, (px, py) => pick(bark, py === Math.round(gy(560)) - 6 ? 0.9 : 0.45 + (hash2(px >> 2, py, 1) - 0.5) * 0.4, px, py));
    near.ellipse(582, Math.round(gy(560)) - 3, 3, 3, (px, py, nx, ny) => pick(ramp('#6a4a30', '#a88050', '#c8a070'), 0.5 - Math.hypot(nx, ny) * 0.4 + 0.3, px, py));
    lampPost(near, 980, Math.round(gy(980)), Hb);
    paintTufts(near, gy, { ramp: grass, seed: 16, density: 0.35, hmax: 5 });
    for (let x = 60; x < WORLD_W - 60; x += 34) if (Math.abs(x - 780) > 60) Hb.perches.push({ type: 'ground', x, y: Math.round(gy(x)), face: 1 });
    // foreground grass & ferns
    const fg = ramp('#0c1a10', '#132618', '#1c3420');
    for (let x = 0; x < fore.w; x += 3) { const h = 4 + hash2(x, 1, 17) * 12; fore.line(x, H, x + (hash2(x, 2, 17) - 0.5) * 6, H - h, 1, (px, py, t) => pick(fg, t, px, py)); }
    for (let x = 30; x < fore.w; x += 150 + hash2(x, 0, 18) * 120) fern(fore, x, H + 4, x, fg);
    Hb.fireflies = true; Hb.leaves = leafA;
    Hb.spawnX = 300;
    return finishHab(Hb, far, mid, near, fore);
  },

  wetland() {
    const Hb = newHab('wetland');
    const WL = 200;
    const land = x => x < 254 || x > 1356;
    const gl = x => 211 + 3 * Math.sin(x / 60);
    const gy = x => (x < 200 ? gl(x) : x < 254 ? lerp(gl(200), 290, smooth((x - 200) / 54)) : x > 1410 ? gl(x) : x > 1356 ? lerp(290, gl(1410), smooth((x - 1356) / 54)) : 400);
    Hb.groundY = gy;
    Hb.walkY = x => (x < 196 || x > 1414 ? gy(x) : 214);
    Hb.water.push({ x0: 204, x1: 1406, y: WL });
    Hb.amb = [0.97, 1.0, 0.97];
    const far = new PB(layerW(PAR.far), H), mid = new PB(layerW(PAR.mid), H), near = new PB(WORLD_W, H), fore = new PB(layerW(PAR.fore), H);
    paintRidge(far, { base: 170, amp: 30, scale: 140, seed: 21, ramp: ramp('#3a5468', '#46627a', '#56748a', '#68869a') });
    paintBlobLine(far, { base: 196, seed: 22, ramp: ramp('#2a4434', '#34523c', '#406246', '#4e7452'), step: 7, rmin: 5, rmax: 11 });
    paintBlobLine(mid, { base: 202, seed: 23, ramp: ramp('#1e3a26', '#28482e', '#345a36', '#446e40', '#5a8648'), step: 12, rmin: 8, rmax: 18, trunk: hex('#1e1a14') });
    // reed bank at the far shore
    for (let x = 0; x < mid.w; x += 2) { const h = 3 + hash2(x, 0, 24) * 9; mid.line(x, 203, x + (hash2(x, 1, 24) - 0.5) * 2, 203 - h, 1, (px, py, t) => pick(ramp('#4a5a2a', '#6a7a34', '#8a9644'), t, px, py)); }
    for (let y = 203; y < H; y++) for (let x = 0; x < mid.w; x++) mid.clear(x, y);
    const grass = ramp('#2e4e22', '#426a2a', '#5a8634', '#78a040');
    const soil = ramp('#20180f', '#302418', '#433222', '#56422c');
    paintGround(near, gy, { top: grass, soil, seed: 25, topH: 3, skip: x => !land(x) });
    const bark = ramp('#2a221c', '#3e3228', '#544636', '#6a5c48', '#86765e');
    const leaf = ramp('#1e3a1e', '#2a4e26', '#3c6a2e', '#568838', '#78a446', '#9cbe5a');
    deciduousTree(near, 70, Math.round(gy(70)), { h: 70, R: 32, seed: 201, bark, leaf, trunkPerch: false }, Hb);
    deciduousTree(near, 175, Math.round(gy(175)), { h: 58, R: 26, seed: 202, bark, leaf }, Hb);
    deciduousTree(near, 1450, Math.round(gy(1450)), { h: 72, R: 33, seed: 203, bark, leaf }, Hb);
    deciduousTree(near, 1560, Math.round(gy(1560)), { h: 60, R: 28, seed: 204, bark, leaf }, Hb);
    // dead snags standing in the water
    const snag = ramp('#3a3634', '#56504c', '#746e68', '#948c84');
    deciduousTree(near, 590, 208, { h: 82, R: 0, bw: 7, seed: 205, bark: snag, bare: true }, Hb);
    deciduousTree(near, 1170, 208, { h: 70, R: 0, bw: 6, seed: 206, bark: snag, bare: true }, Hb);
    // lily pads
    const pad = ramp('#2a4a22', '#3e6a2a', '#5a8a34');
    for (let i = 0; i < 26; i++) { const x = 260 + hash2(i, 1, 26) * 1090, y = 203 + hash2(i, 2, 26) * 8; near.ellipse(x, y, 3 + hash2(i, 3, 26) * 2, 1, (px, py) => pick(pad, 0.6 + (hash2(px, py, 2) - 0.5) * 0.5, px, py)); if (i % 5 === 0) near.set(x, y - 1, hex('#f4e8f0')); }
    // cattail clumps
    const clumps = [[262, 6], [330, 4], [455, 7], [660, 5], [770, 6], [905, 4], [1010, 7], [1100, 5], [1250, 6], [1335, 5]];
    clumps.forEach(([x, n], i) => cattails(near, x, 203 + (i % 3), n, 400 + i, Hb));
    cattails(near, 1428, Math.round(gy(1428)), 6, 450, Hb);
    cattails(near, 186, Math.round(gy(186)), 5, 451, Hb);
    // wading spots and swimming spots
    for (const x of [300, 395, 520, 700, 840, 960, 1060, 1210, 1300]) Hb.perches.push({ type: 'wade', x, y: 207, face: hash2(x, 3, 1) < 0.5 ? 1 : -1 });
    for (const x of [350, 430, 560, 720, 820, 940, 1050, 1150, 1280]) Hb.perches.push({ type: 'water', x, y: 204, face: hash2(x, 4, 1) < 0.5 ? 1 : -1 });
    boardwalk(near, 196, 1414, 214, Hb);
    for (const x of [420, 820, 1220]) lampPost(near, x, 214, Hb);
    paintTufts(near, gy, { ramp: grass, seed: 27, density: 0.4, hmax: 6, skip: x => !land(x) });
    const fg = ramp('#0c1810', '#122416', '#1a321c');
    for (let x = 0; x < fore.w; x += 2) { if (hash2(x, 9, 28) < 0.45) continue; const h = 6 + hash2(x, 1, 28) * 18; fore.line(x, H, x + (hash2(x, 2, 28) - 0.5) * 8, H - h, 1, (px, py, t) => pick(fg, t, px, py)); }
    Hb.fireflies = true; Hb.mist = true;
    Hb.spawnX = 160;
    return finishHab(Hb, far, mid, near, fore);
  },

  coast() {
    const Hb = newHab('coast');
    const WL = 200;
    const cliffTop = x => 70 + fbm(x / 40, 3, 31, 3) * 16;
    const gy = x => (x < 1110 ? 214 - smooth(invLerp(345, 1110, x)) * 2 : lerp(212, 290, smooth(invLerp(1110, 1175, x))));
    Hb.groundY = gy;
    Hb.walkY = x => (x < 1100 ? gy(x) : 211);
    Hb.water.push({ x0: 1080, x1: WORLD_W, y: WL });
    Hb.amb = [1, 1, 1];
    const far = new PB(layerW(PAR.far), H), mid = new PB(layerW(PAR.mid), H), near = new PB(WORLD_W, H), fore = new PB(layerW(PAR.fore), H);
    // ocean to the horizon, with a distant headland and islands
    const sea = ramp('#14304e', '#1c3e60', '#264e72', '#326084', '#467896');
    paintRidge(far, { base: 151, amp: 22, scale: 50, seed: 33, ramp: ramp('#3a4c5c', '#4a5e6e', '#5c7080') });
    for (let x = 0; x < far.w * 0.5; x++) if (fbm(x / 50, 0, 34, 2) < 0.55) for (let y = 0; y < 150; y++) far.clear(x, y);
    far.rect(0, 150, far.w, H - 150, (x, y) => pick(sea, 0.85 - (y - 150) / 110 + (hash2(x >> 2, y, 32) < 0.06 ? 0.25 : 0), x, y));
    // dunes with beach grass
    const dune = ramp('#8a7656', '#a68e66', '#bea478', '#d2ba8c');
    paintRidge(mid, { base: 206, amp: 16, scale: 60, seed: 35, ramp: dune });
    for (let x = 0; x < mid.w; x += 2) if (hash2(x, 0, 36) < 0.6) { const t = 206 - 16 * fbm(x / 60, 0.5, 35, 4); const h = 3 + hash2(x, 1, 36) * 7; mid.line(x, t, x + 1, t - h, 1, (px, py, s) => pick(ramp('#6a7a3a', '#8a9a4a', '#aab868'), s, px, py)); }
    // the cliff
    const rockR = ramp('#2e2a2c', '#46403e', '#5e5650', '#786e64', '#948a7c', '#aea494');
    for (let x = 0; x < 350; x++) {
      const t = x <= 300 ? cliffTop(x) : lerp(cliffTop(300), 216, smooth((x - 300) / 50));
      for (let y = Math.round(t); y < H; y++) {
        const band = Math.floor((y + fbm(x / 30, 0, 37, 2) * 12) / 9);
        let v = 0.62 - (x > 280 ? (x - 280) / 120 : 0) + (band % 2 ? 0.1 : -0.06) + (fbm(x / 5, y / 9, 38, 2) - 0.5) * 0.5 - (y - t) / 500;
        if (hash2(x >> 1, Math.floor(y / 14), 39) < 0.05) v -= 0.35;
        near.set(x, y, pick(rockR, v, x, y));
      }
      const gt = Math.round(t);
      for (let k = 0; k < 3; k++) near.set(x, gt + k, pick(ramp('#3a5a26', '#527a2e', '#6e9a3a'), 0.9 - k * 0.35, x, gt + k));
      if (hash2(x, 0, 40) < 0.5) near.set(x, gt - 1, hex('#6e9a3a'));
    }
    // ledges with puffins
    for (const ly of [112, 138, 164, 188]) {
      const xs = ly < 130 ? [60, 300] : [30, 312];
      for (let x = xs[0]; x < xs[1]; x++) {
        if (fbm(x / 18, ly, 41, 2) < 0.38) continue;
        near.set(x, ly, rockR[5]); near.set(x, ly + 1, rockR[4]); near.set(x, ly + 2, rockR[0]); near.set(x, ly + 3, rockR[0]);
      }
      for (let x = xs[0] + 10; x < xs[1] - 6; x += 24) if (fbm(x / 18, ly, 41, 2) >= 0.38) Hb.perches.push({ type: 'cliff', x, y: ly, face: hash2(x, ly, 2) < 0.5 ? 1 : -1 });
    }
    // lighthouse
    const lx = 120, lbase = Math.round(cliffTop(120)) + 2, lh = 60;
    near.poly([[lx - 9, lbase], [lx + 9, lbase], [lx + 6, lbase - lh], [lx - 6, lbase - lh]], (px, py) => {
      const u = (px - (lx - 9)) / 18, band = Math.floor((lbase - py) / 12) % 2;
      const base = band ? ramp('#7a1e1e', '#a82a26', '#c83a30', '#e05a44') : ramp('#8a8a90', '#b8b8bc', '#dcdcdc', '#f4f4f0');
      return pick(base, 0.95 - u * 0.85, px, py);
    });
    near.rect(lx - 9, lbase - lh - 2, 18, 2, hex('#2a2a2a'));
    near.rect(lx - 5, lbase - lh - 10, 10, 8, hex('#1c2430'));
    near.rect(lx - 1, lbase - lh - 10, 1, 8, hex('#2a2a2a'));
    near.poly([[lx - 6, lbase - lh - 10], [lx + 6, lbase - lh - 10], [lx, lbase - lh - 17]], (px, py) => pick(ramp('#5a1818', '#8a2420', '#a83028'), px < lx ? 0.9 : 0.3, px, py));
    near.rect(lx - 2, lbase - 9, 4, 9, hex('#3a2a1e'));
    Hb.decor.lighthouse = { x: lx, y: lbase - lh - 6 };
    Hb.emit.push({ x: lx - 5, y: lbase - lh - 10, w: 10, h: 8, col: [255, 236, 170], lamp: true, glow: 26 });
    Hb.lights.push({ x: lx, y: lbase - lh - 6, r: 90, col: [1, 0.92, 0.7], i: 1, lamp: true });
    // beach
    const sand = ramp('#a88a5c', '#c4a46e', '#d8ba84', '#e8cc98', '#f2dcae');
    const sandS = ramp('#6a5434', '#7e6640', '#94784c', '#a88a5c');
    paintGround(near, gy, { top: sand, soil: sandS, seed: 42, topH: 4, skip: x => x < 320, pebble: hex('#d8d0c0') });
    // driftwood and rocks
    near.line(520, gy(520) - 1, 556, gy(556) - 3, 2.4, (px, py) => pick(ramp('#6a5a48', '#8a7a64', '#b0a088'), hash2(px, py, 3), px, py));
    const brock = ramp('#2a2c30', '#3e4044', '#565a5c', '#70767a', '#8a9094');
    for (const [x, w, h] of [[430, 10, 7], [690, 14, 9], [880, 9, 6], [1040, 12, 8]]) rock(near, x, Math.round(gy(x)), w, h, { ramp: brock, seed: x, moss: ramp('#1e3a2a', '#2e5038') }, Hb, 'rock');
    for (let x = 860; x < 1100; x += 22) Hb.perches.push({ type: 'beach', x, y: Math.round(gy(x)), face: 1 });
    for (let x = 400; x < 860; x += 40) Hb.perches.push({ type: 'beach', x, y: Math.round(gy(x)), face: -1 });
    // pier
    const wood = ramp('#2a2018', '#43342a', '#5e4a38', '#7a624a');
    for (let x = 1150; x < 1575; x += 60) {
      near.rect(x, 194, 4, H - 194, (px, py) => pick(wood, (px - x) / 4 * -0.6 + 0.8 + (hash2(px, py >> 2, 1) - 0.5) * 0.3, px, py));
      near.rect(x, 194, 4, 1, wood[3]);
      Hb.perches.push({ type: 'post', x: x + 2, y: 194, face: hash2(x, 0, 5) < 0.5 ? 1 : -1 });
    }
    boardwalk(near, 1100, 1580, 211, Hb, false);
    lampPost(near, 1300, 211, Hb, '#2a2a2e');
    lampPost(near, 1500, 211, Hb, '#2a2a2e');
    for (const x of [1210, 1290, 1370, 1440, 1520]) Hb.perches.push({ type: 'water', x, y: 205, face: hash2(x, 9, 9) < 0.5 ? 1 : -1 });
    const fg = ramp('#1a1a12', '#2a2818', '#3a3620');
    for (let x = 0; x < fore.w; x += 3) { if (fbm(x / 40, 0, 43, 2) < 0.5) continue; const h = 5 + hash2(x, 1, 43) * 14; fore.line(x, H, x + (hash2(x, 2, 43) - 0.5) * 10, H - h, 1, (px, py, t) => pick(fg, t, px, py)); }
    Hb.spray = true;
    Hb.spawnX = 500;
    return finishHab(Hb, far, mid, near, fore);
  },

  desert() {
    const Hb = newHab('desert');
    const gy = x => 213 + 4 * Math.sin(x / 190) + 2 * Math.sin(x / 61 + 2);
    Hb.groundY = gy; Hb.walkY = gy;
    Hb.amb = [1.04, 1.0, 0.94];
    const far = new PB(layerW(PAR.far), H), mid = new PB(layerW(PAR.mid), H), near = new PB(WORLD_W, H), fore = new PB(layerW(PAR.fore), H);
    paintMesas(far, { base: 176, seed: 51, ramp: ramp('#6a3a3a', '#8a4a3e', '#a65e44', '#c0764e', '#d48e5c'), n: 4 });
    paintMesas(mid, { base: 200, seed: 52, ramp: ramp('#5a2e22', '#7a3e2a', '#965032', '#ae623a', '#c27644'), n: 6 });
    for (let i = 0; i < 18; i++) { const x = hash2(i, 0, 53) * mid.w; saguaro(mid, x, 202 + hash2(i, 1, 53) * 6, 14 + hash2(i, 2, 53) * 12, 500 + i, null); }
    const sand = ramp('#b88a58', '#cc9c66', '#dcb078', '#e8c28c', '#f2d4a2');
    const soil = ramp('#7a4a2e', '#8e5a38', '#a46c44', '#b87c50');
    paintGround(near, gy, { top: sand, soil, seed: 54, topH: 4, pebble: hex('#e0c8a8') });
    for (let x = 0; x < WORLD_W; x++) if (hash2(x, 0, 55) < 0.04) { const t = Math.round(gy(x)); near.set(x, t + 6 + Math.floor(hash2(x, 1, 55) * 30), hex('#5a3a24')); }
    const rockR = ramp('#4a2e24', '#6a4030', '#8a5640', '#a87050', '#c48c64');
    for (const [x, w, h] of [[200, 12, 8], [640, 16, 11], [1150, 10, 7], [1440, 14, 9]]) rock(near, x, Math.round(gy(x)), w, h, { ramp: rockR, seed: x }, Hb, 'rock');
    const creo = ramp('#2e3a1e', '#3e4e26', '#566630', '#6e7e3a');
    for (const x of [60, 280, 520, 760, 900, 1240, 1380, 1530]) scrub(near, x, Math.round(gy(x)), 16, 11, creo, x);
    for (const x of [390, 1000, 1330]) pricklyPear(near, x, Math.round(gy(x)), x);
    // burrows
    for (const x of [470, 1470]) {
      const t = Math.round(gy(x));
      near.ellipse(x, t, 13, 4, (px, py, nx, ny) => (py > t + 1 ? null : pick(sand, 0.7 - ny * 0.4 - nx * 0.15, px, py)));
      near.ellipse(x + 7, t, 3, 2.2, hex('#2a1810'));
      Hb.perches.push({ type: 'burrow', x: x - 2, y: t - 3, face: x < 800 ? 1 : -1 });
    }
    for (const [x, h, s] of [[120, 64, 1], [330, 78, 2], [575, 58, 3], [820, 82, 4], [1080, 70, 5], [1290, 60, 6], [1560, 74, 7]]) saguaro(near, x, Math.round(gy(x)), h, 600 + s, Hb);
    for (const [x, s] of [[240, 1], [700, 2], [1200, 3]]) ocotillo(near, x, Math.round(gy(x)), 700 + s, Hb);
    // campfire with log seats
    const fx = 950, ft = Math.round(gy(fx));
    for (let i = 0; i < 7; i++) near.ellipse(fx - 7 + i * 2.3, ft - 1, 1.6, 1.4, pick(ramp('#4a4448', '#6a6468', '#8a8488'), hash2(i, 0, 2), i, 0));
    near.rect(fx - 30, ft - 4, 14, 4, (px, py) => pick(ramp('#3a2618', '#5a3e26', '#7a5636'), py === ft - 4 ? 0.9 : 0.4, px, py));
    near.rect(fx + 18, ft - 4, 14, 4, (px, py) => pick(ramp('#3a2618', '#5a3e26', '#7a5636'), py === ft - 4 ? 0.9 : 0.4, px, py));
    Hb.decor.campfire = { x: fx, y: ft - 2 };
    Hb.lights.push({ x: fx, y: ft - 6, r: 110, col: [1, 0.62, 0.3], i: 1.1, lamp: true, flick: 0.18 });
    for (let x = 40; x < WORLD_W - 40; x += 30) Hb.perches.push({ type: 'ground', x, y: Math.round(gy(x)), face: 1 });
    paintTufts(near, gy, { ramp: ramp('#8a8a4a', '#a8a65a', '#c4c070'), seed: 56, density: 0.08, hmax: 3 });
    const fg = ramp('#2a1a12', '#3a2618', '#4a3420');
    for (let x = 40; x < fore.w; x += 120 + hash2(x, 0, 57) * 160) rock(fore, x, H + 4, 10 + hash2(x, 1, 57) * 10, 8, { ramp: fg, seed: x }, null, null);
    Hb.dust = true; Hb.clearNight = true;
    Hb.spawnX = 860;
    return finishHab(Hb, far, mid, near, fore);
  },

  mountain() {
    const Hb = newHab('mountain');
    // a mountain stream runs along the east end of the pass
    const creek = x => x > 1470;
    const gyBase = x => 212 + 8 * Math.sin(x / 170) + 3 * Math.sin(x / 53);
    const gy = x => (creek(x) ? 400 : x > 1440 ? lerp(gyBase(1440), 290, smooth((x - 1440) / 30)) : gyBase(x));
    Hb.groundY = gy;
    Hb.walkY = gyBase;
    Hb.maxX = 1436;
    Hb.water.push({ x0: 1446, x1: WORLD_W, y: 204, flow: true });
    Hb.amb = [0.98, 1.0, 1.05];
    const far = new PB(layerW(PAR.far), H), mid = new PB(layerW(PAR.mid), H), near = new PB(WORLD_W, H), fore = new PB(layerW(PAR.fore), H);
    const snowR = ramp('#9aa8c0', '#bcc8da', '#dce4ee', '#f4f8fc');
    paintRidge(far, { base: 172, amp: 110, scale: 90, seed: 61, sharp: true, ramp: ramp('#2c3448', '#3a4258', '#4a5268', '#5c647a', '#70788c'), snow: { line: 120, ramp: snowR } });
    paintRidge(far, { base: 188, amp: 50, scale: 60, seed: 62, sharp: true, ramp: ramp('#283040', '#343e50', '#424c5e', '#525c6e'), snow: { line: 150, ramp: snowR } });
    paintRidge(mid, { base: 200, amp: 26, scale: 80, seed: 63, ramp: ramp('#1a2a26', '#223630', '#2c4238', '#38503e') });
    paintConiferLine(mid, { base: 196, seed: 64, ramp: ramp('#0e1e1a', '#162a22', '#20382c', '#2c4836'), step: 6, hmin: 16, hmax: 34, snow: hex('#dce4ee') });
    const grass = ramp('#3a5a2e', '#4e7234', '#688c3e', '#86a64c');
    const soil = ramp('#26201c', '#3a3028', '#4e4236', '#625444');
    const snowy = x => (x > 60 && x < 330) || (x > 1000 && x < 1270);
    paintGround(near, gy, { top: grass, soil, seed: 65, topH: 3, skip: creek, pebble: hex('#8a8a8a') });
    for (let x = 0; x < WORLD_W; x++) if (snowy(x) && !creek(x)) {
      const t = Math.round(gy(x)), d = x < 600 ? Math.min(x - 60, 330 - x) : Math.min(x - 1000, 1270 - x);
      const depth = clamp(d / 8, 1, 4) | 0;
      for (let k = -1; k < depth; k++) near.set(x, t + k, pick(snowR, 0.95 - k * 0.2, x, t + k));
    }
    const bark = ramp('#22180f', '#36281c', '#4a382a', '#5e4a38');
    const pine = ramp('#0e2218', '#163020', '#1f402a', '#2a5232', '#38663c');
    const pineXs = [[30, 80, 30], [150, 96, 36], [270, 70, 26], [395, 90, 34], [520, 76, 28], [640, 100, 38], [770, 86, 32], [890, 74, 28], [1030, 98, 36], [1150, 84, 32], [1400, 92, 34]];
    pineXs.forEach(([x, h, w], i) => conifer(near, x, Math.round(gy(x)), { h, w, ramp: pine, bark, seed: 800 + i, snow: snowR }, Hb));
    const rockR = ramp('#34363c', '#4c4e56', '#666a72', '#82868e', '#a0a4aa');
    for (const [x, w, h] of [[95, 14, 10], [460, 18, 12], [590, 10, 7], [700, 16, 10], [960, 12, 8], [1100, 14, 9]]) rock(near, x, Math.round(gy(x)), w, h, { ramp: rockR, seed: x, snow: snowR }, Hb, 'rock');
    // stream rocks
    for (const [x, w, h] of [[1488, 8, 5], [1522, 10, 6], [1560, 8, 5]]) rock(near, x, 212, w, h, { ramp: ramp('#2a2c30', '#3e4248', '#585c62', '#70747a'), seed: x }, Hb, 'streamrock');
    // stone hut
    const wood = ramp('#2e2016', '#4a3424', '#644a34', '#7e6246');
    const hx = 1240, ht = Math.round(gy(1270));
    near.rect(hx, ht - 26, 60, 28, (px, py) => pick(rockR, 0.3 + hash2(px >> 2, (py >> 1) + ((px >> 2) & 1), 7) * 0.5 + ((py - ht) % 5 === 0 ? -0.25 : 0), px, py));
    near.poly([[hx - 6, ht - 25], [hx + 66, ht - 25], [hx + 30, ht - 46]], (px, py) => {
      const d = py - (ht - 46 + Math.abs(px - (hx + 30)) * 21 / 36);
      return d < 3 ? pick(snowR, 0.9, px, py) : pick(wood, 0.6 - (py - (ht - 46)) / 40 + ((px % 5) === 0 ? -0.3 : 0), px, py);
    });
    near.rect(hx + 8, ht - 18, 10, 18, wood[1]);
    near.rect(hx + 34, ht - 20, 14, 10, hex('#1c2430')); near.rect(hx + 40, ht - 20, 1, 10, wood[0]);
    Hb.emit.push({ x: hx + 34, y: ht - 20, w: 14, h: 10, col: [255, 190, 110], lamp: true, glow: 20, frame: [hx + 40, -1] });
    Hb.lights.push({ x: hx + 41, y: ht - 10, r: 90, col: [1, 0.72, 0.42], i: 0.85, lamp: true, flick: 0.05 });
    Hb.chimney = { x: hx + 48, y: ht - 44 };
    near.rect(hx + 46, ht - 44, 5, 8, (px, py) => pick(rockR, 0.5, px, py));
    paintTufts(near, gy, { ramp: grass, seed: 66, density: 0.3, hmax: 4, skip: x => snowy(x) || x > 1440 });
    for (let x = 70; x < 330; x += 26) Hb.perches.push({ type: 'snow', x, y: Math.round(gy(x)) - 1, face: 1 });
    for (let x = 1010; x < 1270; x += 26) Hb.perches.push({ type: 'snow', x, y: Math.round(gy(x)) - 1, face: -1 });
    const fg = ramp('#0e1612', '#16221a', '#1e2e22');
    for (let x = 0; x < fore.w; x += 3) { if (hash2(x, 0, 67) < 0.5) continue; const h = 4 + hash2(x, 1, 67) * 10; fore.line(x, H, x + (hash2(x, 2, 67) - 0.5) * 5, H - h, 1, (px, py, t) => pick(fg, t, px, py)); }
    Hb.snow = true; Hb.aurora = true;
    Hb.spawnX = 560;
    return finishHab(Hb, far, mid, near, fore);
  },

  rainforest() {
    const Hb = newHab('rainforest');
    const gy = x => 216 + 3 * Math.sin(x / 90) + 2 * Math.sin(x / 29);
    Hb.groundY = gy; Hb.walkY = gy;
    Hb.amb = [0.8, 0.9, 0.82];
    const far = new PB(layerW(PAR.far), H), mid = new PB(layerW(PAR.mid), H), near = new PB(WORLD_W, H), fore = new PB(layerW(PAR.fore), H);
    paintRidge(far, { base: 150, amp: 70, scale: 80, seed: 71, ramp: ramp('#2a4a46', '#345a52', '#406a5c', '#507c68', '#64907a') });
    // waterfall
    for (let y = 70; y < H; y++) for (let x = 250; x < 262; x++) if (far.a(x, y) && hash2(x, y >> 1, 72) < 0.85) far.set(x, y, pick(ramp('#a8c8c8', '#d0e4e4', '#f0f8f8'), 0.4 + hash2(x, y >> 2, 3) * 0.6, x, y));
    paintBlobLine(far, { base: 192, seed: 73, ramp: ramp('#1e3e30', '#28503a', '#346244', '#42744e'), step: 7, rmin: 7, rmax: 14 });
    paintBlobLine(mid, { base: 206, seed: 74, ramp: ramp('#0e2418', '#16321e', '#204226', '#2c5430', '#3a683a'), step: 16, rmin: 14, rmax: 30, trunk: hex('#1a1810') });
    const soil = ramp('#1a120c', '#2a1e14', '#3c2c1e', '#4e3a28');
    const top = ramp('#24381c', '#344c22', '#48622a', '#5e7a34');
    paintGround(near, gy, { top, soil, seed: 75, topH: 3 });
    const bark = ramp('#2a2a22', '#3e3e32', '#56564a', '#706e60', '#8c8a7a');
    const leaf = ramp('#0e2a16', '#163a1c', '#204c22', '#2e6228', '#40782e', '#5a9238', '#7aac46');
    // canopy band across the top
    const cblobs = [];
    for (let x = -20; x < WORLD_W + 20; x += 14) cblobs.push({ x: x + hash2(x, 0, 76) * 8, y: 8 + hash2(x, 1, 76) * 26, r: 16 + hash2(x, 2, 76) * 14 });
    for (let i = 0; i < cblobs.length; i += 6) leafBlobs(near, cblobs.slice(i, i + 7), leaf, 77 + i, 0.45);
    // giant buttressed trees with horizontal branches
    for (const [x, tw, s] of [[150, 26, 1], [570, 32, 2], [990, 28, 3], [1420, 30, 4]]) {
      const t = Math.round(gy(x));
      near.rect(x - tw / 2, 0, tw, t + 3, (px, py) => {
        const u = (px + 0.5 - (x - tw / 2)) / tw;
        let v = 0.9 - u * 0.8 + (fbm(px * 0.5, py * 0.06, s, 2) - 0.5) * 0.5;
        if (hash2(px, py >> 3, s) < 0.03) v -= 0.3;
        let c = pick(bark, v, px, py);
        if (fbm(px / 3, py / 6, s + 9, 2) > 0.66) c = pick(ramp('#2a4a22', '#3e6a2a', '#5a8a34'), v, px, py);
        return c;
      });
      for (const side of [-1, 1]) for (const [w, hh] of [[22, 34], [14, 22]]) {
        near.poly([[x + side * tw * 0.3, t - hh], [x + side * (tw / 2 + w), t + 2], [x + side * tw * 0.3, t + 2]], (px, py, u, v) => pick(bark, side < 0 ? 0.75 - v * 0.3 : 0.3 - v * 0.2, px, py));
      }
      for (const [by, len, dir] of [[150, 70, -1], [118, 90, 1], [86, 60, -1], [70, 80, 1]]) {
        const bx = x + dir * tw / 2, ex = bx + dir * len, ey = by - 8;
        near.line(bx, by, ex, ey, t2 => lerp(6, 2.5, t2), (px, py, t2) => pick(bark, 0.7 - t2 * 0.2 - ((py - lerp(by, ey, t2)) > 0 ? 0.35 : 0), px, py));
        // moss and bromeliads on top
        for (let k = 0.15; k < 0.95; k += 0.18) {
          const mx = lerp(bx, ex, k), my = lerp(by, ey, k) - lerp(3, 1.2, k);
          near.ellipse(mx, my, 3, 1.4, (px, py) => pick(ramp('#2e5226', '#46722e', '#64903a'), hash2(px, py, 2) * 0.6 + 0.3, px, py));
        }
        const bmx = lerp(bx, ex, 0.5), bmy = lerp(by, ey, 0.5) - 3;
        for (let k = 0; k < 5; k++) near.line(bmx, bmy, bmx + (k - 2) * 2, bmy - 4 - (k % 2) * 2, 1, k === 2 ? hex('#d83a3a') : hex('#4a8a3a'));
        const type = by < 100 ? 'canopy' : 'branch';
        for (const k of [0.62, 0.86]) Hb.perches.push({ type, x: Math.round(lerp(bx, ex, k)), y: Math.round(lerp(by, ey, k) - lerp(3, 1.2, k)), face: dir });
      }
      // glowing fungi at the base
      for (let k = 0; k < 4; k++) {
        const fx2 = x + (k - 1.5) * 7 + (s % 2 ? 3 : -3), fy = t - 3 - (k % 2) * 6;
        near.ellipse(fx2, fy, 2, 1, hex('#7ae8d8')); near.set(fx2, fy + 1, hex('#e8f0e0'));
        Hb.emit.push({ x: fx2 - 2, y: fy - 1, w: 4, h: 2, col: [120, 255, 220], always: true, glow: 8 });
      }
      Hb.lights.push({ x, y: t - 8, r: 46, col: [0.35, 1, 0.85], i: 0.55, always: true });
    }
    // lianas
    for (let i = 0; i < 14; i++) {
      const x0 = 40 + i * 113 + hash2(i, 0, 78) * 40, len = 70 + hash2(i, 1, 78) * 90;
      for (let y = 46; y < 46 + len; y++) {
        const x = x0 + Math.sin(y / 16 + i) * 5;
        near.set(x, y, pick(ramp('#2a3a1a', '#3e5226', '#566e30'), 0.5, x, y));
        if (y % 7 === 0) { near.set(x + 1, y, hex('#4a8a34')); near.set(x + 2, y + 1, hex('#3a6a2a')); }
      }
    }
    // understory: broad leaves, palms, heliconia
    const bl = ramp('#163a1c', '#1f5024', '#2c682c', '#3e8236', '#58a042');
    for (let x = 30; x < WORLD_W; x += 70 + hash2(x, 0, 79) * 50) {
      const t = Math.round(gy(x));
      for (let k = 0; k < 4; k++) {
        const a = -Math.PI / 2 + (k - 1.5) * 0.55, L = 14 + hash2(x, k, 80) * 10;
        const ex = x + Math.cos(a) * L, ey = t + Math.sin(a) * L;
        near.line(x, t, ex, ey, 1, bl[1]);
        near.ellipse(ex, ey, 5, 2.6, (px, py, nx, ny) => (Math.abs(nx) < 0.08 ? bl[0] : pick(bl, 0.6 - ny * 0.4 + (hash2(px, py, 5) - 0.5) * 0.3, px, py)));
      }
    }
    for (const [x, s] of [[330, 1], [780, 2], [1210, 3]]) {
      const t = Math.round(gy(x));
      near.line(x, t, x + 2, t - 36, 1, hex('#3e6a2a'));
      for (let k = 0; k < 6; k++) {
        const by = t - 10 - k * 4.5, side = k % 2 ? 1 : -1;
        near.poly([[x + 1, by], [x + 1 + side * 7, by - 3], [x + 1 + side * 2, by + 2]], (px, py, u) => (Math.abs(px - x - 1) > 5 ? hex('#f0c030') : hex(k % 3 === 2 ? '#c82a2a' : '#e0382e')));
      }
      for (let k = 0; k < 3; k++) near.ellipse(x - 6 + k * 6, t - 8 - k * 3, 6, 2.2, (px, py, nx, ny) => pick(bl, 0.55 - ny * 0.3, px, py));
      Hb.perches.push({ type: 'flowerperch', x: x + 2, y: t - 37, face: s % 2 ? 1 : -1 });
    }
    paintTufts(near, gy, { ramp: top, seed: 81, density: 0.3, hmax: 4 });
    // foreground: big leaves at the bottom, hanging vines at the top
    const fg = ramp('#06140a', '#0c1e10', '#122816');
    for (let x = 20; x < fore.w; x += 90 + hash2(x, 0, 82) * 90) for (let k = 0; k < 3; k++) fore.ellipse(x + k * 10 - 10, H - 4 - k * 5, 12, 5, (px, py, nx, ny) => (Math.abs(ny + nx * 0.3) < 0.08 ? fg[0] : pick(fg, 0.6 - ny * 0.5, px, py)));
    for (let x = 60; x < fore.w; x += 160 + hash2(x, 1, 82) * 140) { const len = 30 + hash2(x, 2, 82) * 40; for (let y = 0; y < len; y++) { const xx = x + Math.sin(y / 9) * 3; fore.set(xx, y, fg[1]); if (y % 9 === 0) fore.ellipse(xx + ((y / 9) % 2 ? 3 : -3), y + 1, 3, 1.5, fg[2]); } }
    Hb.rain = true; Hb.mist = true;
    Hb.spawnX = 380;
    return finishHab(Hb, far, mid, near, fore);
  },
};

function finishHab(Hb, far, mid, near, fore) {
  const info = HAB_INFO[Hb.id];
  Hb.name = info.name; Hb.blurb = info.blurb; Hb.need = info.need;
  Hb.layers = { far: far.canvas(), mid: mid.canvas(), near: near.canvas(), fore: fore.canvas() };
  Hb.perches.forEach(p => { p.occ = null; });
  Hb.minX = 14; Hb.maxX = Hb.maxX || WORLD_W - 14;
  return Hb;
}
const HAB_CACHE = {};
function getHabitat(id) { return HAB_CACHE[id] || (HAB_CACHE[id] = HAB_BUILDERS[id]()); }
