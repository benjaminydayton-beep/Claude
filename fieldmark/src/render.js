'use strict';
// ============ time of day, sky, lighting, water and effects ============
const AMB_KEYS = [[0, [0.17, 0.19, 0.36]], [4.6, [0.18, 0.2, 0.38]], [5.6, [0.5, 0.42, 0.52]], [6.6, [0.92, 0.74, 0.62]], [8, [1, 0.96, 0.9]], [12, [1, 1, 1]], [16.6, [1, 0.95, 0.86]], [18.1, [1, 0.7, 0.5]], [19.3, [0.58, 0.42, 0.52]], [20.3, [0.2, 0.22, 0.4]], [24, [0.17, 0.19, 0.36]]];
const SKY_KEYS = [[0, '#070b22', '#141c44'], [4.6, '#0a0f2a', '#1c2250'], [5.6, '#262a5c', '#c4685a'], [6.6, '#4a6aa8', '#f2aa6a'], [8, '#4a8ad8', '#a8d0f0'], [12, '#3a7ad8', '#9ad0f4'], [16.6, '#4a80d0', '#bad6ea'], [18.1, '#4a5a9a', '#f08a50'], [19.3, '#2a2a5a', '#a44a5a'], [20.3, '#0c1034', '#242a58'], [24, '#070b22', '#141c44']].map(k => [k[0], hex(k[1]), hex(k[2])]);
function keyed(keys, h, idx) {
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (h >= a[0] && h <= b[0]) { const t = smooth((h - a[0]) / (b[0] - a[0])); return mix(a[idx], b[idx], t); }
  }
  return keys[0][idx];
}
function phaseOf(h) { return h >= 5 && h < 8 ? 'dawn' : h >= 8 && h < 17 ? 'day' : h >= 17 && h < 20 ? 'dusk' : 'night'; }
const PHASE_LABEL = { dawn: 'Dawn', day: 'Day', dusk: 'Dusk', night: 'Night' };
function fmtTime(h) {
  const hh = Math.floor(h) % 24, mm = Math.floor((h % 1) * 60);
  const ap = hh < 12 ? 'AM' : 'PM', h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${ap}`;
}

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    const r = rng(99);
    this.stars = Array.from({ length: 300 }, () => ({ x: Math.floor(r() * W_MAX), y: Math.floor(r() * 175), b: 0.3 + r() * 0.7, p: r() * TAU }));
    this.clouds = this.makeClouds();
    this.resize(W);
  }
  // (re)build every screen-sized buffer for a new view width
  resize(w) {
    W = w;
    this.canvas.width = W; this.canvas.height = H;
    this.ctx.imageSmoothingEnabled = false;
    const mk = () => { const c = makeCanvas(W, H); const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return [c, x]; };
    [this.sky, this.skyCtx] = mk();
    [this.world, this.wctx] = mk();
    [this.mask, this.mctx] = mk();
    [this.light, this.lctx] = mk();
    [this.tmp, this.tctx] = mk();
    [this.snap, this.sctx] = mk();
    [this.snap2, this.snap2c] = mk();
    this.skyImg = this.skyCtx.createImageData(W, H);
    this.vignette = this.makeVignette();
    this.blurC = makeCanvas(Math.ceil(W / 4), Math.ceil(H / 4));
  }
  makeClouds() {
    const out = [];
    for (let i = 0; i < 6; i++) {
      const r = rng(500 + i), w = 50 + Math.floor(r() * 50), h = 20;
      const pb = new PB(w, h);
      const cr = ramp('#b8c0d0', '#d4dae6', '#eef2f8', '#ffffff');
      const blobs = [];
      for (let k = 0; k < 6; k++) blobs.push({ x: 8 + r() * (w - 16), y: 10 + r() * 3, r: 4 + r() * 6 });
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let best = -1, by = 0;
        for (const b of blobs) { const q = 1 - ((x - b.x) ** 2 + (y - b.y) ** 2) / (b.r * b.r); if (q > best) { best = q; by = (y - b.y) / b.r; } }
        if (best > 0 && y < 15) pb.set(x, y, pick(cr, 0.75 - by * 0.5 - (y > 12 ? 0.4 : 0), x, y));
      }
      out.push({ c: pb.canvas(), x: r() * (W_MAX + 400), y: 18 + r() * 70, s: 0.5 + r() * 0.8, par: 0.04 + r() * 0.05 });
    }
    return out;
  }
  makeVignette() {
    const c = makeCanvas(W, H), x = c.getContext('2d');
    const g = x.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.62);
    g.addColorStop(0, 'rgba(10,8,20,0)'); g.addColorStop(1, 'rgba(10,8,20,0.42)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    return c;
  }
  // per-frame environment values
  env(hour, hab, rainAmt) {
    let amb = keyed(AMB_KEYS, hour, 1);
    amb = [amb[0] * hab.amb[0], amb[1] * hab.amb[1], amb[2] * hab.amb[2]];
    const rf = 1 - rainAmt * 0.28;
    amb = amb.map(v => clamp(v * rf, 0, 1.05));
    let top = keyed(SKY_KEYS, hour, 1), hor = keyed(SKY_KEYS, hour, 2);
    if (hab.id === 'desert') hor = mix(hor, [240, 170, 110], 0.18 * clamp(lum(hor) * 1.5, 0, 1));
    if (hab.id === 'rainforest') { top = mix(top, [120, 150, 150], 0.15); hor = mix(hor, [190, 210, 200], 0.2); }
    if (rainAmt > 0) { const g = mix(top, hor, 0.5); top = mix(top, scaleC([120, 130, 140], lum(g) * 1.2), rainAmt * 0.7); hor = mix(hor, scaleC([150, 160, 165], lum(hor) * 1.1), rainAmt * 0.7); }
    const L = lum([amb[0] * 255, amb[1] * 255, amb[2] * 255]);
    const night = clamp((0.72 - L) / 0.45, 0, 1);
    const day = clamp((L - 0.6) / 0.35, 0, 1);
    return { amb, top, hor, L, night, day, hour };
  }
  drawSky(E, t, hab) {
    const d = this.skyImg.data, bands = [];
    for (let i = 0; i <= 16; i++) bands.push(mix(E.top, E.hor, Math.pow(i / 16, 1.25)));
    for (let y = 0; y < H; y++) {
      const tf = clamp(y / 205, 0, 1) * 16;
      const b0 = Math.floor(tf), fr = tf - b0;
      for (let x = 0; x < W; x++) {
        const c = bands[Math.min(16, b0 + (fr > dith(x, y) ? 1 : 0))];
        const i = (y * W + x) << 2;
        d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
      }
    }
    // stars
    if (E.night > 0.05) {
      const k = E.night * (hab.clearNight ? 1.2 : 1);
      for (const s of this.stars) {
        if (s.x >= W) continue;
        const tw = 0.6 + 0.4 * Math.sin(t * 2 + s.p);
        const a = clamp(s.b * tw * k, 0, 1), i = (s.y * W + s.x) << 2;
        d[i] = lerp(d[i], 255, a); d[i + 1] = lerp(d[i + 1], 250, a); d[i + 2] = lerp(d[i + 2], 235, a);
      }
    }
    this.skyCtx.putImageData(this.skyImg, 0, 0);
    const sc = this.skyCtx;
    // sun & moon
    const h = E.hour;
    if (h > 5.2 && h < 19.8) {
      const u = (h - 5.2) / 14.6, sx = 30 + u * (W - 60), sy = 205 - Math.sin(u * Math.PI) * 175;
      const low = 1 - Math.sin(u * Math.PI);
      const scol = mix([255, 250, 225], [255, 150, 70], low * low);
      sc.globalCompositeOperation = 'lighter';
      const g = sc.createRadialGradient(sx, sy, 2, sx, sy, 60);
      g.addColorStop(0, rgba(scol, 0.55)); g.addColorStop(1, rgba(scol, 0));
      sc.fillStyle = g; sc.fillRect(sx - 60, sy - 60, 120, 120);
      sc.globalCompositeOperation = 'source-over';
      this.pixelDisc(sc, sx, sy, 7, scol, mix(scol, [255, 255, 255], 0.5));
      this.sun = { x: sx, y: sy, col: scol };
    } else this.sun = null;
    if (h > 18.5 || h < 6.5) {
      const u = ((h - 18.5 + 24) % 24) / 12, mx = 40 + u * (W - 80), my = 200 - Math.sin(u * Math.PI) * 160;
      sc.globalCompositeOperation = 'lighter';
      const g = sc.createRadialGradient(mx, my, 2, mx, my, 34);
      g.addColorStop(0, 'rgba(200,210,255,0.25)'); g.addColorStop(1, 'rgba(200,210,255,0)');
      sc.fillStyle = g; sc.fillRect(mx - 34, my - 34, 68, 68);
      sc.globalCompositeOperation = 'source-over';
      this.pixelDisc(sc, mx, my, 5, [226, 228, 236], [250, 250, 255]);
      sc.fillStyle = 'rgba(150,154,170,0.9)'; sc.fillRect(Math.round(mx) - 2, Math.round(my) - 1, 2, 2); sc.fillRect(Math.round(mx) + 1, Math.round(my) + 2, 1, 1);
    }
    // aurora (mountains)
    if (hab.aurora && E.night > 0.3) {
      sc.globalCompositeOperation = 'lighter';
      for (let x = 0; x < W; x += 2) {
        const y0 = 26 + Math.sin(x * 0.018 + t * 0.25) * 14 + Math.sin(x * 0.05 + t * 0.6) * 5;
        const hh = 34 + Math.sin(x * 0.04 + t * 0.4) * 14;
        const a = 0.13 * E.night * (0.6 + 0.4 * Math.sin(x * 0.03 + t));
        const g = sc.createLinearGradient(0, y0, 0, y0 + hh);
        g.addColorStop(0, `rgba(120,80,220,0)`); g.addColorStop(0.4, `rgba(80,255,160,${a})`); g.addColorStop(1, 'rgba(60,200,140,0)');
        sc.fillStyle = g; sc.fillRect(x, y0, 2, hh);
      }
      sc.globalCompositeOperation = 'source-over';
    }
    // clouds
    for (const c of this.clouds) {
      const span = W_MAX + 400, x = ((c.x + t * 3 * c.s - this.camX * c.par) % span + span) % span - 160;
      this.tintDraw(sc, c.c, 0, 0, c.c.width, c.c.height, x, c.y, mix(E.amb, [E.hor[0] / 255, E.hor[1] / 255, E.hor[2] / 255], 0.35), null, 0, 0.92);
    }
  }
  pixelDisc(ctx, cx, cy, r, c, hi) {
    cx = Math.round(cx); cy = Math.round(cy);
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      if (x * x + y * y > r * r + 1) continue;
      ctx.fillStyle = rgba(x + y < -r * 0.6 ? hi : c);
      ctx.fillRect(cx + x, cy + y, 1, 1);
    }
  }
  // Draw an image region tinted (multiply) by `tint` (0..1 rgb) with optional haze mix.
  tintDraw(dst, img, sx, sy, sw, sh, dx, dy, tint, haze, hazeA, alpha = 1) {
    const t = this.tctx;
    t.globalCompositeOperation = 'source-over'; t.globalAlpha = 1;
    t.clearRect(0, 0, W, H);
    t.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    t.globalCompositeOperation = 'multiply';
    t.fillStyle = rgba([tint[0] * 255, tint[1] * 255, tint[2] * 255]);
    t.fillRect(0, 0, sw, sh);
    t.globalCompositeOperation = 'destination-in';
    t.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    if (haze && hazeA > 0) { t.globalCompositeOperation = 'source-atop'; t.fillStyle = rgba(haze, hazeA); t.fillRect(0, 0, sw, sh); }
    t.globalCompositeOperation = 'source-over';
    dst.globalAlpha = alpha;
    dst.drawImage(this.tmp, 0, 0, sw, sh, Math.round(dx), Math.round(dy), sw, sh);
    dst.globalAlpha = 1;
  }
  // ---- light map ----
  buildLightMap(E, G) {
    const l = this.lctx, camX = this.camX;
    l.globalCompositeOperation = 'source-over';
    l.fillStyle = rgba([E.amb[0] * 255, E.amb[1] * 255, E.amb[2] * 255]);
    l.fillRect(0, 0, W, H);
    l.globalCompositeOperation = 'lighter';
    for (const L of G.activeLights) {
      const x = L.x - camX, y = L.y;
      if (x < -L.r || x > W + L.r) continue;
      const k = L.k;
      if (k <= 0.01) continue;
      const g = l.createRadialGradient(x, y, 0, x, y, L.r);
      const c = L.col;
      g.addColorStop(0, rgba([c[0] * 255 * k, c[1] * 255 * k, c[2] * 255 * k]));
      g.addColorStop(0.4, rgba([c[0] * 255 * k * 0.45, c[1] * 255 * k * 0.45, c[2] * 255 * k * 0.45]));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      l.fillStyle = g; l.fillRect(x - L.r, y - L.r, L.r * 2, L.r * 2);
    }
    const lamp = G.lampCone;
    if (lamp) {
      const x = lamp.x - camX, y = lamp.y;
      l.save();
      l.beginPath(); l.moveTo(x, y); l.arc(x, y, lamp.r, lamp.a - lamp.half, lamp.a + lamp.half); l.closePath(); l.clip();
      const g = l.createRadialGradient(x, y, 0, x, y, lamp.r);
      g.addColorStop(0, 'rgba(255,248,225,1)'); g.addColorStop(0.4, 'rgba(115,111,100,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      l.fillStyle = g; l.fillRect(x - lamp.r, y - lamp.r, lamp.r * 2, lamp.r * 2);
      l.restore();
      const g2 = l.createRadialGradient(x, y + 8, 0, x, y + 8, 22);
      g2.addColorStop(0, 'rgba(120,115,100,1)'); g2.addColorStop(1, 'rgba(0,0,0,0)');
      l.fillStyle = g2; l.fillRect(x - 22, y - 14, 44, 44);
    }
    const beam = G.beam;
    if (beam && beam.k > 0.02) {
      const x = beam.x - camX;
      l.beginPath(); l.moveTo(x, beam.y);
      l.lineTo(x + beam.dir * beam.len, beam.y - 10); l.lineTo(x + beam.dir * beam.len, beam.y + 34); l.closePath();
      const g = l.createLinearGradient(x, 0, x + beam.dir * beam.len, 0);
      g.addColorStop(0, rgba([255 * beam.k, 240 * beam.k, 190 * beam.k])); g.addColorStop(1, 'rgba(0,0,0,0)');
      l.fillStyle = g; l.fill();
    }
    l.globalCompositeOperation = 'source-over';
  }
  applyLighting() {
    const w = this.wctx;
    this.mctx.clearRect(0, 0, W, H);
    this.mctx.drawImage(this.world, 0, 0);
    w.globalCompositeOperation = 'multiply';
    w.drawImage(this.light, 0, 0);
    w.globalCompositeOperation = 'destination-in';
    w.drawImage(this.mask, 0, 0);
    w.globalCompositeOperation = 'source-over';
  }
  // ---- water: mirrored reflection of what is above the waterline ----
  drawWater(E, G, t) {
    const ctx = this.ctx, camX = this.camX;
    for (const wtr of G.hab.water) {
      const sx0 = Math.max(0, Math.round(wtr.x0 - camX)), sx1 = Math.min(W, Math.round(wtr.x1 - camX));
      if (sx1 <= sx0) continue;
      const wl = wtr.y, ww = sx1 - sx0;
      this.sctx.clearRect(0, 0, W, H);
      this.sctx.drawImage(this.canvas, 0, 0);
      const g = ctx.createLinearGradient(0, wl, 0, H);
      const deep = scaleC([18, 40, 58], 0.4 + E.L * 0.6);
      g.addColorStop(0, rgba(mix(E.hor, deep, 0.45))); g.addColorStop(1, rgba(deep));
      ctx.fillStyle = g; ctx.fillRect(sx0, wl, ww, H - wl);
      for (let y = wl; y < H; y++) {
        const d = y - wl, sy = wl - 1 - d;
        if (sy < 0) break;
        const off = Math.round(Math.sin(d * 0.45 + t * 2.4 + (wtr.flow ? t * 3 : 0)) * Math.min(2.5, d * 0.12));
        ctx.globalAlpha = 0.62 - (d / (H - wl)) * 0.35;
        ctx.drawImage(this.snap, sx0, sy, ww, 1, sx0 + off, y, ww, 1);
      }
      ctx.globalAlpha = 1;
      // bird reflections, mirrored about each bird's own waterline and clipped to the water
      ctx.save();
      ctx.beginPath(); ctx.rect(sx0, wl, ww, H - wl); ctx.clip();
      for (const b of G.birds) {
        if (!(b.state === 'swim' || b.state === 'wade')) continue;
        const bx = b.x - camX;
        if (bx < sx0 - 30 || bx > sx1 + 30) continue;
        const spr = b.sprite(), m = b.state === 'wade' ? b.y - 2 : b.y;
        ctx.save(); ctx.globalAlpha = 0.2 + E.L * 0.14;
        ctx.translate(Math.round(bx), Math.round(m) * 2); ctx.scale(b.face >= 0 ? 1 : -1, -1);
        ctx.drawImage(spr.c, -spr.ax, Math.round(b.y) - spr.ay);
        ctx.restore();
      }
      ctx.restore();
      // shimmer highlights
      const hl = mix(E.hor, [255, 255, 255], 0.35);
      ctx.fillStyle = rgba(hl, 0.35 + E.day * 0.25);
      for (let i = 0; i < 40; i++) {
        const y = wl + 2 + Math.floor(hash2(i, 1, 7) * (H - wl - 4));
        const xw = ((hash2(i, 2, 7) * 600 + t * (8 + i % 5) * (wtr.flow ? 3 : 1)) % (ww + 40)) - 20 + sx0;
        const len = 2 + Math.floor(hash2(i, 3, 7) * 6);
        if (Math.sin(t * 1.5 + i) > 0.2) ctx.fillRect(Math.round(xw), y, len, 1);
      }
      // sun glitter path
      if (this.sun && E.day > 0.05) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = rgba(this.sun.col, 0.25 * E.day);
        for (let i = 0; i < 26; i++) {
          const y = wl + 1 + Math.floor(hash2(i, 9, 8) * 40), sp = 6 + (y - wl) * 0.6;
          const x = this.sun.x + (hash2(i, Math.floor(t * 3), 8) - 0.5) * sp * 2;
          if (x > sx0 && x < sx1) ctx.fillRect(Math.round(x), y, 2 + (i % 3), 1);
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      // objects standing in the water go back on top
      ctx.drawImage(this.world, sx0, wl, ww, H - wl, sx0, wl, ww, H - wl);
    }
  }
}
