'use strict';
// ============ procedural pixel-art bird sprites ============
// Every bird is assembled from simple shapes (ellipses, tapered capsules, polygons) in an
// unscaled coordinate space with the feet at (0,0), then rasterised per pixel with
// 3-step shading, plumage markings, an eye, and a coloured outline.

const PLANS = {
  song: () => ({ body: [0, -5, 4.6, 3.3, -0.45], head: [3.3, -8.7, 2.7, 2.6], tail: [-3.0, -3.6, -7.0, -0.8, 1.5, 1.0], wing: [-0.8, -5.4, 3.6, 2.2, -0.42], legs: [[0.6, -2.4, 0.9, 0], [-0.5, -2.4, -0.6, 0]], legW: 0.45, beak: { len: 2, th: 1.3, droop: 0.2 }, eye: [0.9, -0.4] }),
  king: () => ({ body: [0, -5, 4.4, 3.2, -0.5], head: [3.0, -9.6, 3.1, 2.9], tail: [-3.0, -3.0, -5.6, -0.8, 1.2, 0.9], wing: [-0.8, -5.4, 3.4, 2.1, -0.46], legs: [[0.5, -2.2, 0.7, 0], [-0.4, -2.2, -0.4, 0]], legW: 0.45, beak: { len: 4, th: 1.7, droop: 0.1 }, eye: [1.0, -0.5] }),
  dipper: () => ({ body: [0, -4.6, 4.6, 3.6, -0.25], head: [3.6, -7.9, 2.6, 2.5], tail: [-3.6, -5.0, -5.8, -7.2, 1.2, 0.9], wing: [-0.6, -5.0, 3.6, 2.4, -0.25], legs: [[0.6, -1.6, 0.9, 0], [-0.6, -1.6, -0.6, 0]], legW: 0.5, beak: { len: 1.8, th: 1.0, droop: 0.1 }, eye: [0.9, -0.4] }),
  woodpecker: () => ({ body: [-2.6, -8, 3.2, 5.4, 0.18], head: [-1.2, -13.6, 2.6, 2.5], tail: [-3.4, -4.4, -1.6, 2.8, 1.5, 0.9], wing: [-3.2, -8.6, 2.4, 4.4, 0.18], legs: [[-0.6, -6.0, 0.4, -4.4], [-0.8, -3.8, 0.3, -2.4]], legW: 0.5, beak: { len: 3, th: 1.2, droop: 0.1 }, eye: [0.6, -0.4] }),
  wader: () => ({ body: [-1, -17.5, 6.5, 3.4, -0.15], neck: [[3.8, -19, 5.6, -25, 1.5, 1.1], [5.6, -25, 4.6, -29.5, 1.1, 1.0]], head: [5.6, -31, 2.2, 1.8], tail: [-6.5, -17, -8.6, -15.4, 1.2, 0.8], wing: [-1.8, -18, 5.6, 2.6, -0.12], legs: [[0.8, -14.5, 1.2, 0], [-1.8, -14.5, -2.4, 0]], legW: 0.3, beak: { len: 6, th: 1.2, droop: 0.3 }, eye: [0.6, -0.4] }),
  duck: () => ({ body: [0, -2.6, 6.8, 3.4, 0.05], neck: [[4.2, -4.6, 5.2, -7.2, 1.9, 1.7]], head: [5.6, -8.2, 2.8, 2.6], tail: [-6.2, -3.8, -8.4, -5.6, 1.2, 0.6], wing: [-1, -3.8, 4.6, 2.0, 0.06], legs: [], legW: 0.5, beak: { len: 3, th: 1.5, droop: 0.6, flat: true }, eye: [0.7, -0.6], clip: 0 }),
  shore: () => ({ body: [0, -7, 4.6, 3, -0.1], head: [4, -10, 2.3, 2.2], tail: [-4, -7.5, -6.2, -7, 1.0, 0.7], wing: [-0.6, -7.6, 4.2, 2, -0.1], legs: [[0.2, -4.5, 0.5, 0], [-1, -4.5, -1.3, 0]], legW: 0.45, beak: { len: 3, th: 0.8, droop: 0.1 }, eye: [0.6, -0.4] }),
  gull: () => ({ body: [0, -7, 7, 3.8, -0.08], head: [6, -11.2, 2.8, 2.6], tail: [-6, -7.8, -8.6, -7.4, 1.4, 1.0], wing: [-1.8, -8, 6.6, 2.6, -0.06], legs: [[0.5, -3.6, 0.8, 0], [-0.6, -3.6, -0.8, 0]], legW: 0.5, beak: { len: 3.4, th: 1.1 }, eye: [0.7, -0.5] }),
  raptor: () => ({ body: [0, -8, 4.4, 7, -0.32], head: [2.6, -15.6, 2.9, 2.7], tail: [-2.6, -2.6, -4.2, 2.4, 1.8, 1.5], wing: [-1, -8.4, 3.8, 6.4, -0.3], legs: [[0.6, -2, 0.8, 0], [-0.4, -2, -0.4, 0]], legW: 0.8, beak: { len: 2.4, th: 1.6, hook: true }, eye: [1.0, -0.6] }),
  hummer: () => ({ body: [0, -4, 3, 1.6, -0.55], head: [2, -6.6, 1.7, 1.6], tail: [-1.8, -2.6, -3.4, -0.4, 0.8, 0.5], wing: null, legs: [], legW: 0.4, beak: { len: 4, th: 0.5 }, eye: [0.5, -0.3] }),
  parrot: () => ({ body: [0, -10, 4.2, 7.4, -0.25], head: [2, -18.6, 3.4, 3.2], tail: [-2.4, -4, -6.6, 14, 1.8, 0.7], wing: [-0.6, -9.6, 3.6, 6.8, -0.22], legs: [[0.6, -2.6, 0.8, 0], [-0.4, -2.6, -0.4, 0]], legW: 0.7, beak: { special: 'parrot' }, eye: [0.9, -0.7] }),
  toucan: () => ({ body: [0, -8, 4, 6, -0.3], head: [2.2, -14.6, 2.9, 2.7], tail: [-2.2, -3.4, -4.2, 4.6, 1.6, 1.2], wing: [-0.8, -8.2, 3.2, 5, -0.3], legs: [[0.6, -2.2, 0.8, 0], [-0.4, -2.2, -0.4, 0]], legW: 0.6, beak: { special: 'toucan' }, eye: [0.6, -0.4] }),
  puffin: () => ({ body: [0, -6.4, 3.8, 5.2, -0.25], head: [1.8, -12.2, 3, 2.8], tail: [-2.4, -3.0, -4, -1.2, 1.0, 0.6], wing: [-0.8, -6.6, 2.8, 4, -0.25], legs: [[0.4, -1.8, 0.6, 0], [-0.5, -1.8, -0.5, 0]], legW: 0.65, beak: { special: 'puffin' }, eye: [0.4, -0.7] }),
  pelican: () => ({ body: [-1, -9, 8, 4.6, -0.1], neck: [[5, -11, 6.4, -18, 1.9, 1.5]], head: [6.6, -20, 2.4, 2.2], tail: [-8.4, -9.5, -10.6, -8.6, 1.4, 1.0], wing: [-2, -9.8, 6.8, 3.2, -0.08], legs: [[0, -4.6, 0.2, 0], [-1.6, -4.6, -1.8, 0]], legW: 0.9, beak: { special: 'pelican' }, eye: [0.5, -0.6] }),
  roadrunner: () => ({ body: [0, -8, 5.2, 2.8, -0.15], neck: [[3.4, -9, 4.8, -11, 1.6, 1.4]], head: [5.2, -11.6, 2.3, 2.2], tail: [-4.6, -8.4, -13, -12.6, 1.5, 1.1], wing: [-0.6, -8.4, 4.2, 2, -0.15], legs: [[0.4, -5.4, 1.6, 0], [-0.6, -5.4, -1.6, 0]], legW: 0.55, beak: { len: 3.6, th: 1.0, droop: 0.3 }, eye: [0.5, -0.4] }),
  quail: () => ({ body: [0, -4.6, 4.8, 3.8, 0], head: [3.8, -8.6, 2.3, 2.2], tail: [-4.2, -5, -5.8, -4.6, 1.1, 0.8], wing: [-0.8, -5.2, 3.8, 2.4, 0], legs: [[0.4, -1.2, 0.4, 0], [-0.6, -1.2, -0.6, 0]], legW: 0.55, beak: { len: 1.2, th: 1.1 }, eye: [0.6, -0.4] }),
  quetzal: () => ({ body: [0, -6.4, 3.8, 4.6, -0.35], head: [2.4, -11.6, 2.8, 2.6], tail: [-1.8, -2.6, -6.2, 22, 1.3, 0.5], tail2: [-1.2, -2.6, -2.4, 2.8, 1.3, 1.0], wing: [-0.6, -6.8, 3, 4.2, -0.3], legs: [[0.6, -2.2, 0.8, 0]], legW: 0.6, beak: { len: 1.4, th: 1.2 }, eye: [0.6, -0.4] }),
};

const E = (k, a) => ({ k, t: 'E', x: a[0], y: a[1], rx: a[2], ry: a[3], a: a[4] || 0 });
const Cp = (k, a, minR = 0) => ({ k, t: 'C', x1: a[0], y1: a[1], x2: a[2], y2: a[3], r1: a[4], r2: a[5] === undefined ? a[4] : a[5], minR });
const Pp = (k, pts, ref) => ({ k, t: 'P', pts, ref });

function hitPart(p, x, y) {
  if (p.t === 'E') {
    const dx = x - p.x, dy = y - p.y, ca = Math.cos(p.a), sa = Math.sin(p.a);
    const lx = dx * ca + dy * sa, ly = -dx * sa + dy * ca;
    const nx = lx / p.rx, ny = ly / p.ry;
    if (nx * nx + ny * ny > 1) return null;
    const R = Math.max(p.rx, p.ry);
    return { lx, ly, nx, ny, sx: dx / p.rx, sy: dy / p.ry, ux: dx, uy: dy, R };
  }
  if (p.t === 'C') {
    const vx = p.x2 - p.x1, vy = p.y2 - p.y1, l2 = vx * vx + vy * vy || 1e-6;
    const t = clamp(((x - p.x1) * vx + (y - p.y1) * vy) / l2, 0, 1);
    const px = p.x1 + vx * t, py = p.y1 + vy * t;
    const r = Math.max(lerp(p.r1, p.r2, t), p.minR);
    const dx = x - px, dy = y - py;
    if (dx * dx + dy * dy > r * r) return null;
    const mx = (p.x1 + p.x2) / 2, my = (p.y1 + p.y2) / 2;
    return { t, sx: dx / r, sy: dy / r, ux: x - mx, uy: y - my, nx: 0, ny: 0 };
  }
  if (!inPoly(p.pts, x, y)) return null;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const q of p.pts) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const ref = p.ref || { x: cx, y: cy };
  return { sx: (x - cx) / Math.max(0.5, (x1 - x0) / 2), sy: (y - cy) / Math.max(0.5, (y1 - y0) / 2), ux: x - ref.x, uy: y - ref.y, nx: 0, ny: 0, rel: (x - x0) / Math.max(0.01, x1 - x0) };
}
function partBounds(p) {
  if (p.t === 'E') { const R = Math.max(p.rx, p.ry); return [p.x - R, p.y - R, p.x + R, p.y + R]; }
  if (p.t === 'C') { const r = Math.max(p.r1, p.r2, p.minR); return [Math.min(p.x1, p.x2) - r, Math.min(p.y1, p.y2) - r, Math.max(p.x1, p.x2) + r, Math.max(p.y1, p.y2) + r]; }
  let b = [1e9, 1e9, -1e9, -1e9];
  for (const q of p.pts) b = [Math.min(b[0], q[0]), Math.min(b[1], q[1]), Math.max(b[2], q[0]), Math.max(b[3], q[1])];
  return b;
}

// ---- beaks & crests ----
function beakParts(B, hx, hy, hrx, open, sp) {
  const parts = [];
  if (B.special === 'parrot') {
    const ref = { x: hx + 2.4, y: hy };
    parts.push(Pp('beakL', [[hx + 2.6, hy + 1.2], [hx + 3.9, hy + 1.5 + (open ? 0.8 : 0)], [hx + 3.4, hy + 2.7 + (open ? 0.8 : 0)], [hx + 2.4, hy + 2.3]], ref));
    parts.push(Pp('beak', [[hx + 2.2, hy - 1.9], [hx + 4.6, hy - 1.3], [hx + 5.4, hy + 0.8], [hx + 4.7, hy + 3.0], [hx + 4.0, hy + 1.6], [hx + 2.6, hy + 1.3]], ref));
    return { parts, bx: hx + 2.2, by: hy, len: 3.2 };
  }
  if (B.special === 'toucan') {
    const o = open ? 0.6 : 0, ref = { x: hx + 2.0, y: hy };
    parts.push(Pp('beak', [[hx + 2.0, hy - 1.8], [hx + 6, hy - 2.1 - o], [hx + 10.8, hy - 0.7 - o], [hx + 11.4, hy + 0.5 - o], [hx + 10.6, hy + 0.9], [hx + 6, hy + 1.6 + o], [hx + 2.2, hy + 1.8]], ref));
    return { parts, bx: hx + 2.0, by: hy, len: 9.4 };
  }
  if (B.special === 'puffin') {
    const ref = { x: hx + 2.4, y: hy };
    parts.push(Pp('beak', [[hx + 2.4, hy - 1.9], [hx + 5.4, hy + (open ? -0.5 : 0)], [hx + 5.0, hy + 0.9], [hx + 2.4, hy + 2.2]], ref));
    return { parts, bx: hx + 2.4, by: hy, len: 3.0 };
  }
  if (B.special === 'pelican') {
    const ref = { x: hx + 1.8, y: hy };
    parts.push(Pp('pouch', [[hx + 1.8, hy + 0.7], [hx + 13, hy + 1.6], [hx + 7, hy + 4.2 + (open ? 1.5 : 0)], [hx + 1.6, hy + 2.8]], ref));
    parts.push(Pp('beak', [[hx + 1.8, hy - 1.0], [hx + 13.4, hy + 0.8], [hx + 13.8, hy + 1.7], [hx + 1.8, hy + 0.8]], ref));
    return { parts, bx: hx + 1.8, by: hy, len: 12 };
  }
  const bx = hx + hrx * 0.8, by = hy + 0.25, th = B.th, len = B.len, dr = B.droop || 0;
  const ref = { x: bx, y: by };
  if (open) {
    parts.push(Pp('beak', [[bx - 0.5, by - th / 2], [bx + len, by + dr - 0.9], [bx - 0.5, by - 0.05]], ref));
    parts.push(Pp('beak', [[bx - 0.5, by + 0.05], [bx + len * 0.88, by + dr + 1.0], [bx - 0.5, by + th / 2]], ref));
  } else if (B.hook) {
    parts.push(Pp('beak', [[bx - 0.5, by - th / 2], [bx + len * 0.72, by - th / 2 + 0.25], [bx + len, by + th * 0.15], [bx + len * 0.9, by + th * 0.62], [bx + len * 0.55, by + th * 0.35], [bx - 0.5, by + th / 2]], ref));
  } else if (B.flat) {
    parts.push(Pp('beak', [[bx - 0.5, by - th / 2], [bx + len, by + dr - 0.35], [bx + len + 0.3, by + dr + 0.35], [bx - 0.5, by + th / 2]], ref));
  } else {
    parts.push(Pp('beak', [[bx - 0.5, by - th / 2], [bx + len, by + dr], [bx - 0.5, by + th / 2]], ref));
  }
  return { parts, bx, by, len };
}
function crestParts(type, k, hx, hy, hr) {
  const ref = { x: hx, y: hy };
  switch (type) {
    case 'pointed': return [Pp('crest', [[hx - 0.2 * hr, hy - 0.7 * hr], [hx - 1.1 * hr - 1.0 * k, hy - 1.3 * hr - 1.1 * k], [hx - 0.95 * hr, hy - 0.15 * hr]], ref)];
    case 'shaggy': return [Pp('crest', [[hx + 0.2, hy - hr * 0.9], [hx - hr * 1.2, hy - hr * 1.4], [hx - hr * 0.9, hy - hr * 0.85], [hx - hr * 1.6, hy - hr * 0.75], [hx - hr * 1.0, hy - hr * 0.3], [hx - hr * 1.5, hy + 0.1 * hr], [hx - hr * 0.6, hy + 0.2 * hr]], ref)];
    case 'round': return [Object.assign(E('crest', [hx + 0.3, hy - hr * 0.72, hr * 0.85, hr * 0.62, 0]), { ref })];
    case 'plume': return [Pp('crest', [[hx - 0.3, hy - hr * 0.8], [hx + 0.1, hy - hr * 1.9], [hx + 1.4, hy - hr * 2.35], [hx + 2.0, hy - hr * 1.95], [hx + 1.0, hy - hr * 1.7], [hx + 0.6, hy - hr * 0.8]], ref)];
    case 'backplume': return [Pp('crest', [[hx - 0.6, hy - 1.1], [hx - 5.6, hy + 0.3], [hx - 0.8, hy + 0.1]], ref)];
    case 'split': return [Pp('crest', [[hx - 0.4, hy - hr * 0.8], [hx - hr * 1.4, hy - hr * 1.9], [hx - hr * 0.9, hy - hr * 0.5]], ref), Pp('crest', [[hx - hr * 0.6, hy - hr * 0.6], [hx - hr * 2.0, hy - hr * 1.25], [hx - hr * 1.0, hy - hr * 0.1]], ref)];
    case 'swept': return [Pp('crest', [[hx + 0.6, hy - hr * 0.92], [hx - hr * 1.75, hy - hr * 0.3], [hx - hr * 1.55, hy + hr * 0.45], [hx - hr * 0.6, hy + hr * 0.2]], ref)];
  }
  return [];
}

// ---- geometry for a pose ----
function birdGeometry(sp, pose) {
  const g = sp.g || {};
  if (sp.plan === 'owl' && !pose.fly) return owlGeometry(sp, pose);
  const P = PLANS[sp.plan === 'owl' ? 'raptor' : sp.plan]();
  if (g.head) P.head = g.head.slice();
  if (g.tail) P.tail = g.tail.slice();
  if (g.legW) P.legW = g.legW;
  if (g.beakLen) P.beak.len = g.beakLen;
  if (g.beakTh) P.beak.th = g.beakTh;
  if (g.beakDroop !== undefined) P.beak.droop = g.beakDroop;
  if (g.hook) P.beak.hook = true;
  if (sp.plan === 'owl') { P.beak = { len: 1.2, th: 1.4, hook: true }; P.head = [2.4, -15.4, 3.4, 3.2]; }
  if (pose.fly) return flightGeometry(sp, P, pose);
  const parts = [];
  let [hx, hy, hrx, hry] = P.head;
  let hd = [0, 0];
  if (pose.name === 'look') hd = [-0.3, -0.25];
  if (pose.name === 'sing') hd = [0.25, -0.45];
  if (pose.name === 'peck') hd = sp.plan === 'wader' ? [2.5, 6] : sp.plan === 'shore' ? [1.6, 3.6] : sp.plan === 'roadrunner' ? [1.6, 3.4] : [1.4, 3.0];
  hx += hd[0]; hy += hd[1];
  const minLeg = 0.52 / sp.s;
  for (let i = P.legs.length - 1; i >= 0; i--) { const l = P.legs[i]; parts.push(Cp('legs', [l[0], l[1], l[2], l[3], P.legW, P.legW * 0.9], minLeg)); }
  if (P.tail) parts.push(Cp('tail', P.tail, 0.5 / sp.s));
  if (P.tail2) parts.push(Cp('under', P.tail2));
  parts.push(E('body', P.body));
  if (P.wing) parts.push(E('wing', P.wing));
  if (P.neck) P.neck.forEach((n, i) => {
    const a = n.slice();
    if (i === P.neck.length - 1) { a[2] += hd[0]; a[3] += hd[1]; }
    if (i > 0) { a[0] += hd[0] * 0.5; a[1] += hd[1] * 0.5; }
    if (i === 0 && P.neck.length > 1) { a[2] += hd[0] * 0.5; a[3] += hd[1] * 0.5; }
    parts.push(Cp('neck', a));
  });
  if (g.crest) parts.push(...crestParts(g.crest, g.crestSize || 1, hx, hy, hrx));
  const head = E('head', [hx, hy, hrx, hry, 0]);
  parts.push(head);
  const bk = beakParts(P.beak, hx, hy, hrx, pose.name === 'sing', sp);
  parts.push(...bk.parts);
  return { parts, eye: [hx + P.eye[0], hy + P.eye[1]], beak: bk, head, clip: P.clip };
}

function owlGeometry(sp, pose) {
  const g = sp.g || {}, L = g.longLegs ? 3.2 : 0;
  const parts = [];
  const hd = pose.name === 'look' ? [0.7, -0.2] : pose.name === 'sing' ? [0, -0.5] : [0, 0];
  if (L > 0) { parts.push(Cp('legs', [-1.3, -1 - L, -1.4, 0, 0.6], 0.5 / sp.s)); parts.push(Cp('legs', [1.3, -1 - L, 1.4, 0, 0.6], 0.5 / sp.s)); }
  parts.push(Cp('tail', [0, -2 - L, 0, 1.2 - L, 1.6, 1.2]));
  parts.push(E('body', [0, -6 - L, 4.8, 6.0, 0]));
  parts.push(E('belly', [0, -5.6 - L, 3.2, 4.6, 0]));
  parts.push(E('wing', [-3.9, -6.4 - L, 1.9, 4.8, 0.12]));
  parts.push(E('wing', [3.9, -6.4 - L, 1.9, 4.8, -0.12]));
  parts.push(E('legs', [-1.5, -0.4 - (L > 0 ? 0 : 0.2), 1.1, 0.55, 0]));
  parts.push(E('legs', [1.5, -0.4 - (L > 0 ? 0 : 0.2), 1.1, 0.55, 0]));
  const hx = hd[0], hy = -13.4 - L + hd[1];
  if (g.tufts) {
    parts.push(Pp('crest', [[hx - 2.0, hy - 2.2], [hx - 3.9, hy - 6.4], [hx - 3.7, hy - 1.5]], { x: hx, y: hy }));
    parts.push(Pp('crest', [[hx + 2.0, hy - 2.2], [hx + 3.9, hy - 6.4], [hx + 3.7, hy - 1.5]], { x: hx, y: hy }));
  }
  const head = E('head', [hx, hy, 4.5, 3.9, 0]);
  parts.push(head);
  parts.push(E('face', [hx, hy + 0.3, 3.6, 3.0, 0]));
  const er = Math.max(0.95, 1.05 / sp.s);
  parts.push(E('eye', [hx - 1.55, hy - 0.3, er, er, 0]));
  parts.push(E('eye', [hx + 1.55, hy - 0.3, er, er, 0]));
  parts.push(Pp('beak', [[hx - 0.6, hy + 0.5], [hx + 0.6, hy + 0.5], [hx, hy + 2.2]], { x: hx, y: hy }));
  return { parts, eye: null, head, frontal: true, blink: pose.name === 'look' && g.blinkWhite };
}

function flightGeometry(sp, P, pose) {
  const g = sp.g || {};
  const [bx0, by0, brx, bry] = P.body;
  let len = Math.max(brx, bry), thick = Math.min(brx, bry);
  if (sp.plan === 'owl') { len = 5.4; thick = 3.4; }
  const parts = [];
  const span = len * 2.0 * (sp.plan === 'raptor' || sp.plan === 'owl' ? 1.25 : sp.plan === 'gull' || sp.plan === 'pelican' ? 1.35 : sp.plan === 'wader' ? 1.3 : 1);
  const [, , hrx, hry] = P.head;
  let hx = len + hrx * 0.35, hy = -thick * 0.45;
  if (sp.plan === 'wader' || sp.plan === 'pelican') { hx = len * 0.95; hy = -thick * 1.0; }
  const tl = P.tail ? Math.min(Math.hypot(P.tail[2] - P.tail[0], P.tail[3] - P.tail[1]), sp.plan === 'quetzal' ? 18 : 9) : 2;
  if (sp.plan === 'wader') parts.push(Cp('legs', [-len * 0.6, thick * 0.3, -len * 0.6 - 12, thick * 0.55, P.legW], 0.5 / sp.s));
  if (P.tail) parts.push(Cp('tail', [-len * 0.75, 0, -len * 0.75 - tl * 0.85, 0.5, P.tail[4], P.tail[5]], 0.5 / sp.s));
  // far wing (darker) first
  const up = [[len * 0.35, -thick * 0.4], [-len * 0.45, -thick * 0.4], [-len * 0.95, -span * 0.62], [-len * 0.45, -span], [len * 0.2, -span * 0.9]];
  const down = [[len * 0.35, 0.2], [-len * 0.45, 0.2], [-len * 0.85, span * 0.62], [-len * 0.35, span * 0.86], [len * 0.25, span * 0.62]];
  const glide = [[len * 0.45, -thick * 0.3], [-len * 0.5, -thick * 0.3], [-len * 1.35, -span * 0.44], [-len * 0.6, -span * 0.64], [len * 0.35, -span * 0.48]];
  parts.push(E('body', [0, 0, len, thick * 0.85, 0]));
  if (P.neck && sp.plan !== 'wader' && sp.plan !== 'pelican') parts.push(Cp('neck', [len * 0.6, -thick * 0.2, hx - hrx * 0.3, hy, 1.6, 1.4]));
  if (sp.plan === 'wader' || sp.plan === 'pelican') parts.push(Cp('neck', [len * 0.55, -thick * 0.4, hx, hy + 0.6, 1.8, 1.4]));
  if (g.crest && g.crest !== 'plume') parts.push(...crestParts(g.crest, (g.crestSize || 1) * 0.6, hx, hy, hrx));
  const head = E('head', [hx, hy, hrx, hry, 0]);
  parts.push(head);
  const bk = beakParts(P.beak, hx, hy, hrx, false, sp);
  parts.push(...bk.parts);
  const wpts = pose.fly === 'up' ? up : pose.fly === 'down' ? down : glide;
  const wing = Pp('wing', wpts, { x: 0, y: 0 });
  wing.span = span; wing.flight = true;
  parts.push(wing);
  return { parts, eye: [hx + P.eye[0], hy + P.eye[1]], beak: bk, head, flight: true };
}

// ---- colouring ----
function markLocal(p, hit) {
  if (p.t === 'E' && p.k !== 'head' && p.k !== 'face' && p.k !== 'belly' && p.k !== 'crest' && p.k !== 'eye') return [hit.lx, hit.ly];
  return [hit.ux, hit.uy];
}
function markHit(m, p, hit, px, py, isBelly, idx) {
  const [u, v] = markLocal(p, hit);
  if (m.belly && !isBelly) return false;
  if (m.back && isBelly) return false;
  if (m.e) {
    const q = ((u - m.e[0]) / m.e[2]) ** 2 + ((v - m.e[1]) / m.e[3]) ** 2;
    if (q > 1) return false;
    if (m.rin && q < m.rin * m.rin) return false;
    if (m.half === 'bottom' && v < m.e[1]) return false;
    if (m.half === 'top' && v > m.e[1]) return false;
  }
  if (m.seg) {
    const [x1, y1, x2, y2, r] = m.seg;
    const vx = x2 - x1, vy = y2 - y1, t = clamp(((u - x1) * vx + (v - y1) * vy) / (vx * vx + vy * vy), 0, 1);
    if (Math.hypot(u - x1 - vx * t, v - y1 - vy * t) > r) return false;
  }
  if (m.tt) { if (hit.t === undefined || hit.t < m.tt[0] || hit.t > m.tt[1]) return false; }
  if (m.pat) {
    if (m.pat === 'spots') return hash2(px, py, idx * 7 + 3) < m.d;
    if (m.pat === 'streak') return hash2(px, py >> 1, idx * 7 + 5) < m.d;
    if (m.pat === 'bars') {
      if (m.thr !== undefined && p.t === 'E' && hit.nx > m.thr) return false;
      return m.axis === 'x' ? px % m.period === 0 : py % m.period === 0;
    }
    if (m.pat === 'tip') {
      if (p.flight) return Math.hypot(hit.ux, hit.uy) / p.span > 0.62;
      if (p.t !== 'E') return false;
      return p.rx >= p.ry ? hit.nx < -m.thr : hit.ny > m.thr;
    }
  }
  return true;
}

const SHADOW_TINT = [28, 22, 56];
function makeBirdSprite(sp, pose, geo) {
  const G = geo || birdGeometry(sp, pose);
  const s = sp.s, parts = G.parts, C = {};
  for (const k in sp.c) C[k] = hex(sp.c[k]);
  const g = sp.g || {};
  const hiTint = g.hiTint ? hex(g.hiTint) : [255, 246, 226];
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of parts) { const b = partBounds(p); x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]); }
  const clipY = pose.clip !== undefined ? pose.clip : G.clip;
  if (clipY !== undefined && !pose.fly) y1 = Math.min(y1, clipY);
  const ox = Math.floor(x0 * s) - 2, oy = Math.floor(y0 * s) - 2;
  const w = Math.ceil(x1 * s) - ox + 3, h = Math.ceil(y1 * s) - oy + 3;
  const pb = new PB(w, h);
  const pid = new Int16Array(w * h).fill(-1);
  const beakBands = g.beakBands ? g.beakBands.map(b => [b[0], hex(b[1])]) : null;
  const beakLower = g.beakLower ? hex(g.beakLower) : null;
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const wx = (px + ox + 0.5) / s, wy = (py + oy + 0.5) / s;
    if (clipY !== undefined && !pose.fly && wy > clipY) continue;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      const hit = hitPart(p, wx, wy);
      if (!hit) continue;
      let c, isBelly = false, alpha = 1;
      switch (p.k) {
        case 'body':
          if (!G.frontal && !G.flight) isBelly = p.rx >= p.ry ? hit.ny > 0.12 : hit.nx > 0.12;
          if (G.flight) isBelly = hit.ny > 0.25;
          c = isBelly ? C.belly : C.back; break;
        case 'head':
          c = C.head;
          if (C.throat && !G.frontal && hit.ux > -0.2 * p.rx && hit.uy > 0.3 * p.ry) c = C.throat;
          break;
        case 'neck': c = C.neck || C.head; break;
        case 'crest': c = C.crest || C.head; break;
        case 'wing': c = C.wing; break;
        case 'tail': c = C.tail; break;
        case 'under': c = C.under || C.belly; break;
        case 'legs': c = C.legs; break;
        case 'face': c = C.face || C.head; break;
        case 'belly': c = C.belly; break;
        case 'pouch': c = C.pouch || C.beak; break;
        case 'beakL': c = beakLower || C.beak; break;
        case 'beak': {
          c = C.beak;
          const bk = G.beak;
          let last = 1;
          if (beakBands && bk) {
            const t = (wx - bk.bx) / bk.len;
            for (const [t0, bc] of beakBands) if (t >= t0) c = bc;
            last = beakBands[beakBands.length - 1][0];
            if (beakLower && wy > bk.by + 0.2 && t < last) c = beakLower;
          } else if (beakLower && bk && wy > bk.by + 0.3) c = beakLower;
          break;
        }
        case 'eye': {
          const d = Math.hypot(hit.sx, hit.sy);
          c = G.blink ? [240, 240, 236] : d < 0.5 ? [16, 12, 16] : (C.eye || [240, 200, 50]);
          pb.set(px, py, c); pid[py * w + px] = i;
          c = null; break;
        }
        case 'blur': c = C.wing; alpha = 0.6; break;
      }
      if (!c) break;
      // markings
      if (sp.m) for (let mi = 0; mi < sp.m.length; mi++) {
        const m = sp.m[mi];
        const on = Array.isArray(m.on) ? m.on : [m.on];
        let key = p.k === 'beakL' ? 'beak' : p.k;
        if (!on.includes(key)) continue;
        if (G.flight && p.k === 'wing' && (m.e || m.seg)) continue;
        if (G.flight && p.k === 'body' && (m.e || m.seg)) continue;
        if (markHit(m, p, hit, px, py, isBelly, mi)) c = hex(m.col);
      }
      // 3-step shading, light from the upper left
      const b = 0.55 - 0.45 * clamp(hit.sy, -1, 1) - 0.18 * clamp(hit.sx, -1, 1);
      if (b > 0.88) c = mix(c, hiTint, 0.22);
      else if (b < 0.22) c = mix(c, SHADOW_TINT, 0.32);
      pb.set(px, py, c, alpha);
      pid[py * w + px] = i;
      break;
    }
  }
  // wing inner contour: darken wing pixels that border other filled parts below/behind them
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const id = pid[py * w + px];
    if (id < 0 || parts[id].k !== 'wing') continue;
    const below = py + 1 < h ? pid[(py + 1) * w + px] : -1;
    const behind = px - 1 >= 0 ? pid[py * w + px - 1] : -1;
    if ((below >= 0 && parts[below].k !== 'wing') || (behind >= 0 && parts[behind].k !== 'wing')) {
      const i4 = (py * w + px) << 2;
      pb.d[i4] *= 0.78; pb.d[i4 + 1] *= 0.78; pb.d[i4 + 2] *= 0.8;
    }
  }
  // eye (side-view birds)
  if (G.eye) {
    const ex = Math.floor(G.eye[0] * s) - ox, ey = Math.floor(G.eye[1] * s) - oy;
    const big = G.head.rx * s >= 3.6;
    const dark = [16, 12, 18];
    if (C.ring) { pb.set(ex, ey - 1, C.ring); pb.set(ex, ey + 1, C.ring); if (big) pb.set(ex - 1, ey, C.ring); }
    if (pose.name === 'look' && g.blinkWhite) pb.set(ex, ey, [244, 244, 240]);
    else {
      // big heads with a coloured iris get iris + pupil; everything else a single dark eye pixel
      if (C.eye && big && !C.ring) pb.set(ex - 1, ey, C.eye);
      pb.set(ex, ey, dark);
    }
  }
  outlinePB(pb);
  return { c: pb.canvas(), ax: -ox, ay: -oy, w, h };
}

// Build all animation frames for one species.
function buildSpeciesSprites(sp) {
  const F = {};
  if (sp.plan === 'hummer') {
    const mk = up => {
      const geo = birdGeometry(sp, { name: 'idle' });
      const wpts = up ? [[0.4, -5.2], [-1.0, -5.0], [-3.4, -10.6], [-1.2, -11.0]] : [[0.4, -4.4], [-1, -4.4], [-3.8, -1.0], [-2.2, -0.2]];
      geo.parts.splice(geo.parts.findIndex(p => p.k === 'body') + 1, 0, Pp('blur', wpts));
      return geo;
    };
    F.hov1 = spriteFromGeo(sp, mk(true), 'idle');
    F.hov2 = spriteFromGeo(sp, mk(false), 'idle');
    F.idle = F.hov1; F.look = F.hov2; F.sing = F.hov1; F.peck = F.hov1;
    F.fly1 = F.hov1; F.fly2 = F.hov2; F.glide = F.hov1;
    return F;
  }
  F.idle = makeBirdSprite(sp, { name: 'idle' });
  F.look = makeBirdSprite(sp, { name: 'look' });
  F.sing = sp.call ? makeBirdSprite(sp, { name: 'sing' }) : F.look;
  F.peck = (sp.g && sp.g.groundFeeder) || sp.plan === 'wader' ? makeBirdSprite(sp, { name: 'peck' }) : F.look;
  F.fly1 = makeBirdSprite(sp, { name: 'fly', fly: 'up' });
  F.fly2 = makeBirdSprite(sp, { name: 'fly', fly: 'down' });
  F.glide = makeBirdSprite(sp, { name: 'fly', fly: 'glide' });
  if (sp.perch.includes('water') && sp.plan !== 'duck') {
    const legTop = sp.plan === 'gull' ? -3.4 : -4.4;
    const sw = makeBirdSprite(sp, { name: 'idle', clip: legTop });
    sw.ay += Math.round(legTop * sp.s); // re-anchor so the clip line sits on the waterline
    F.swim = sw;
  }
  return F;
}
function spriteFromGeo(sp, geo, name) { return makeBirdSprite(sp, { name }, geo); }

// Silhouette (for undiscovered field-guide entries)
function silhouette(canvas, color) {
  const c = makeCanvas(canvas.width, canvas.height), x = c.getContext('2d');
  x.drawImage(canvas, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
  return c;
}

// ============ player sprite (field naturalist) ============
// Posed from a small skeleton (hip, shoulder, head, two-bone legs and arms) so walking,
// crouching, aiming and sitting all share one consistent, shaded character.
const PR = {
  skin: ramp('#8e5a3e', '#b87c58', '#dca27a', '#f0c49a'),
  hair: ramp('#2a1a12', '#432a1c', '#5c3c26'),
  hat: ramp('#3a4220', '#545e2e', '#6f7a3c', '#8c9850'),
  band: ramp('#4a2c16', '#6e4424'),
  flannel: ramp('#4e1c18', '#7a2c24', '#a03c2e', '#c0563e'),
  vest: ramp('#5a4224', '#806034', '#a48048', '#c4a062'),
  pants: ramp('#33382a', '#4a5238', '#626c48', '#7c8658'),
  boot: ramp('#1e1510', '#33241a', '#4c3626', '#664a34'),
  pack: ramp('#4a2a18', '#6e3e22', '#8e542e', '#ae6c3c'),
  roll: ramp('#2a3a2e', '#3e5644', '#56745a'),
  metal: ramp('#16181c', '#26292e', '#3a3e46', '#5a606a'),
};
const PW = 26, PH = 34, PGROUND = 32;
function shadeCap(pb, x1, y1, x2, y2, w, rp, dim = 0, fn) {
  const r = w / 2, vx = x2 - x1, vy = y2 - y1, l2 = vx * vx + vy * vy || 1e-6;
  for (let py = Math.floor(Math.min(y1, y2) - r); py <= Math.ceil(Math.max(y1, y2) + r); py++)
    for (let px = Math.floor(Math.min(x1, x2) - r); px <= Math.ceil(Math.max(x1, x2) + r); px++) {
      const cx = px + 0.5, cy = py + 0.5;
      const t = clamp(((cx - x1) * vx + (cy - y1) * vy) / l2, 0, 1);
      const dx = cx - (x1 + vx * t), dy = cy - (y1 + vy * t), d = Math.hypot(dx, dy);
      if (d > r) continue;
      const nx = dx / r, ny = dy / r;
      let b = 0.55 + 0.42 * (-0.6 * nx - 0.75 * ny) - dim;
      let c = rp[clamp(Math.round(b * (rp.length - 1)), 0, rp.length - 1)];
      if (fn) c = fn(px, py, t, c) || c;
      pb.set(px, py, c);
    }
}
function ik(ax, ay, bx, by, L1, L2, bend) {
  let dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy);
  const D = clamp(d, 0.01, L1 + L2 - 0.01);
  const a = (L1 * L1 - L2 * L2 + D * D) / (2 * D), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const ux = dx / (d || 1), uy = dy / (d || 1);
  return [ax + ux * a + uy * h * bend, ay + uy * a - ux * h * bend];
}
const plaid = (px, py, t, c) => ((px % 3 === 0) || (py % 3 === 0) ? mix(c, [30, 10, 10], 0.35) : null);
function makePlayerFrame(kind, ph = 0) {
  const pb = new PB(PW, PH);
  const crouch = kind === 'crouch' || kind === 'crouchwalk' || kind === 'camcrouch';
  const walking = kind === 'walk' || kind === 'crouchwalk';
  const sit = kind === 'rest';
  const cyc = ph * TAU;
  const bob = walking ? Math.abs(Math.sin(cyc)) * (crouch ? 0.5 : 1) : 0;
  // skeleton (facing right)
  let hip = [11.5, (crouch ? 24 : 18.6) - bob], sh = [12.4, (crouch ? 16.5 : 10.4) - bob];
  if (crouch) sh = [14.5, 16.6 - bob];
  if (sit) { hip = [10.5, 28.5]; sh = [11.5, 19.5]; }
  const head = [sh[0] + (crouch ? 2.2 : 0.8), sh[1] - 4.2];
  const thigh = 7, shin = 6.8;
  let feet;
  if (sit) feet = [[17, 31.5], [18.5, 31.5]];
  else if (walking) {
    const stride = crouch ? 3.2 : 4.6, s1 = Math.sin(cyc), c1 = Math.cos(cyc);
    feet = [[hip[0] - s1 * stride, PGROUND - Math.max(0, c1) * (crouch ? 1.2 : 2)], [hip[0] + s1 * stride, PGROUND - Math.max(0, -c1) * (crouch ? 1.2 : 2)]];
  } else feet = crouch ? [[hip[0] - 3, PGROUND], [hip[0] + 3.5, PGROUND]] : [[hip[0] - 1.6, PGROUND], [hip[0] + 1.8, PGROUND]];
  const legs = feet.map(f => ({ f, k: ik(hip[0], hip[1], f[0], f[1] - 1, thigh, shin, 1) }));
  // arms
  const shBack = [sh[0] - 1, sh[1] + 1], shFront = [sh[0] + 0.5, sh[1] + 1];
  let hands;
  if (kind === 'camera' || kind === 'camcrouch') hands = [[head[0] + 3.2, head[1] + 1.2], [head[0] + 3.6, head[1] + 1.6]];
  else if (sit) hands = [[16, 24.5], [17, 25]];
  else if (walking) { const sw = Math.sin(cyc) * (crouch ? 1.5 : 3); hands = [[sh[0] + sw, sh[1] + 9.2], [sh[0] - sw + 0.5, sh[1] + 9.2]]; }
  else if (crouch) hands = [[sh[0] + 2.5, sh[1] + 8], [sh[0] + 3.5, sh[1] + 7.5]];
  else hands = [[sh[0] - 0.3, sh[1] + 9.4], [sh[0] + 1.2, sh[1] + 9.4]];
  const arm = (s0, hnd) => ({ s: s0, h: hnd, e: ik(s0[0], s0[1], hnd[0], hnd[1], 4.6, 4.6, -1) });
  const aBack = arm(shBack, hands[0]), aFront = arm(shFront, hands[1]);
  const back = walking ? (Math.sin(cyc) > 0 ? 1 : 0) : 0; // which leg is behind
  const drawLeg = (L, dim) => {
    shadeCap(pb, hip[0], hip[1], L.k[0], L.k[1], 3.6, PR.pants, dim);
    shadeCap(pb, L.k[0], L.k[1], L.f[0], L.f[1] - 1.2, 3.1, PR.pants, dim);
    // boot: shaft, foot and sole
    const fx = Math.round(L.f[0]), fy = Math.round(L.f[1]);
    shadeCap(pb, L.f[0] - 0.2, L.f[1] - 2.6, L.f[0] + 0.2, L.f[1] - 1, 3.2, PR.boot, dim);
    pb.rect(fx - 1, fy - 2, 4, 2, (px, py) => pick(PR.boot, (py === fy - 2 ? 0.8 : 0.45) - dim, px, py));
    pb.rect(fx - 1, fy, 4, 1, mix(PR.boot[0], [0, 0, 0], 0.3));
    pb.set(fx, fy - 3, PR.band[1]);
  };
  const drawArm = (A, dim) => {
    shadeCap(pb, A.s[0], A.s[1], A.e[0], A.e[1], 2.8, PR.flannel, dim, plaid);
    shadeCap(pb, A.e[0], A.e[1], A.h[0], A.h[1], 2.5, PR.flannel, dim, plaid);
    shadeCap(pb, A.h[0], A.h[1], A.h[0] + 0.4, A.h[1] + 0.3, 2.2, PR.skin, dim);
  };
  // --- back to front ---
  drawArm(aBack, 0.22);
  drawLeg(legs[back], 0.18);
  // backpack with bedroll
  const lean = (sh[0] - hip[0]) / (hip[1] - sh[1]);
  const px0 = sh[0] - 5.4, py0 = sh[1] + 0.2;
  pb.poly([[px0, py0 + 1], [px0 + 3.8, py0], [px0 + 3.8 - lean * 6, py0 + 7.2], [px0 - lean * 6 - 0.2, py0 + 7.6]], (x, y, u, v) => pick(PR.pack, 0.85 - u * 0.5 - v * 0.25, x, y));
  pb.rect(Math.round(px0 - lean * 4), Math.round(py0 + 5), 4, 1, PR.pack[0]);
  shadeCap(pb, px0 + 0.2, py0 - 0.4, px0 + 3.8, py0 - 0.4, 2.2, PR.roll);
  // torso: flannel shirt under a field vest
  const tw = 3.2;
  const torso = [[sh[0] - tw, sh[1]], [sh[0] + tw - 0.6, sh[1]], [hip[0] + tw - 0.4, hip[1] + 0.8], [hip[0] - tw + 0.2, hip[1] + 0.8]];
  pb.poly(torso, (x, y, u) => { const c = pick(PR.flannel, 0.8 - u * 0.6, x, y); return plaid(x, y, 0, c) || c; });
  const vest = [[sh[0] - tw, sh[1] + 0.5], [sh[0] + 0.6, sh[1] + 0.5], [hip[0] + 1.2, hip[1]], [hip[0] - tw + 0.2, hip[1]]];
  pb.poly(vest, (x, y, u, v) => pick(PR.vest, 0.85 - u * 0.55 + (v > 0.55 && v < 0.62 ? -0.4 : 0), x, y));
  const vx2 = [[sh[0] + 2.0, sh[1] + 0.6], [sh[0] + tw - 0.6, sh[1] + 0.6], [hip[0] + tw - 0.4, hip[1]], [hip[0] + 2.6, hip[1]]];
  pb.poly(vx2, (x, y, u) => pick(PR.vest, 0.45 - u * 0.3, x, y));
  // belt
  pb.line(hip[0] - tw + 0.4, hip[1] + 0.3, hip[0] + tw - 0.6, hip[1] + 0.3, 1, PR.band[0]);
  pb.set(Math.round(hip[0] + 1), Math.round(hip[1] + 0.3), hex('#c8a040'));
  // binoculars on a neck strap
  pb.line(sh[0] + 0.5, sh[1], sh[0] + 2.2, sh[1] + 4, 1, PR.metal[1]);
  pb.rect(Math.round(sh[0] + 1.8), Math.round(sh[1] + 4), 2, 3, (x, y) => pick(PR.metal, y === Math.round(sh[1] + 4) ? 0.9 : 0.4, x, y));
  drawLeg(legs[1 - back], 0);
  // neck and head
  shadeCap(pb, sh[0] + 0.5, sh[1] + 0.5, head[0], head[1] + 2, 2.2, PR.skin);
  const hx = head[0], hy = head[1];
  pb.ellipse(hx, hy, 2.9, 3.2, (x, y, nx, ny) => pick(PR.skin, 0.62 - nx * 0.25 - ny * 0.3, x, y));
  pb.ellipse(hx - 1.6, hy - 0.4, 1.7, 2.6, (x, y) => pick(PR.hair, 0.5, x, y)); // hair at the back
  pb.set(Math.round(hx - 0.6), Math.round(hy + 0.2), PR.skin[1]); pb.set(Math.round(hx - 0.6), Math.round(hy + 1.2), PR.skin[1]); // ear
  pb.set(Math.round(hx + 1.6), Math.round(hy - 0.2), hex('#1c1210')); // eye
  pb.set(Math.round(hx + 1.6), Math.round(hy - 1.2), PR.hair[1]); // brow
  pb.set(Math.round(hx + 2.9), Math.round(hy + 0.6), PR.skin[1]); // nose
  pb.rect(Math.round(hx + 0.4), Math.round(hy + 2), 2, 1, mix(PR.skin[1], PR.hair[1], 0.5)); // stubble
  // bush hat: crown, band and wide brim
  const hy0 = Math.round(hy - 2.2);
  pb.ellipse(hx - 0.2, hy0 - 1.4, 2.8, 2.0, (x, y, nx, ny) => (ny > 0.15 ? null : pick(PR.hat, 0.7 - nx * 0.3 - ny * 0.4, x, y)));
  pb.rect(Math.round(hx - 2.8), hy0 - 1, 6, 1, (x, y) => pick(PR.band, 0.5, x, y));
  pb.rect(Math.round(hx - 4.4), hy0, 10, 1, (x, y) => pick(PR.hat, x < hx ? 0.5 : 0.3, x, y));
  pb.set(Math.round(hx + 5.6), hy0 + 1, PR.hat[1]); pb.set(Math.round(hx - 4.6), hy0 + 1, PR.hat[0]);
  const lamp = [Math.round(hx + 2.5) - 12, hy0 - 1 - PGROUND]; // headlamp on the hat band, relative to the feet
  pb.set(Math.round(hx + 2.5), hy0 - 1, hex('#d8d0b0'));
  // front arm and camera
  if (kind === 'camera' || kind === 'camcrouch') {
    drawArm(aFront, 0);
    const cx0 = Math.round(head[0] + 2), cy0 = Math.round(head[1] - 0.6);
    pb.rect(cx0, cy0, 4, 3, (x, y) => pick(PR.metal, y === cy0 ? 0.85 : 0.4, x, y));
    pb.rect(cx0 + 4, cy0 + 0.5, 2, 2, (x, y) => pick(PR.metal, 0.6, x, y));
    pb.set(cx0 + 6, cy0 + 1, hex('#7aa0c8')); pb.set(cx0 + 1, cy0 - 1, PR.metal[2]);
  } else drawArm(aFront, 0);
  outlinePB(pb, [18, 12, 16], 0.78);
  return { c: pb.canvas(), ax: 12, ay: PGROUND, w: pb.w, h: pb.h, lamp };
}
function buildPlayerSprites() {
  return {
    idle: makePlayerFrame('idle'),
    walk: [0, 1, 2, 3, 4, 5].map(i => makePlayerFrame('walk', i / 6)),
    crouch: makePlayerFrame('crouch'),
    crouchWalk: [0, 1, 2, 3].map(i => makePlayerFrame('crouchwalk', i / 4)),
    camera: makePlayerFrame('camera'),
    cameraCrouch: makePlayerFrame('camcrouch'),
    rest: makePlayerFrame('rest'),
  };
}
