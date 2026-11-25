'use strict';
// ============ game state, birds, photography, UI ============
const SAVE_KEY = 'fieldmark-save-v1';
const HOUR_SECONDS = 20;            // real seconds per in-game hour (a full day is 8 minutes)
const REST_SPEED = 12;              // time multiplier while resting
const FF_SPEEDS = [1, 4, 12];       // fast-forward settings for the clock
const VF = { w: 150, h: 96 };       // viewfinder size in game pixels (2x magnification)
const TOTAL = SPECIES.length;

const G = {
  state: 'title', overlay: null,
  habId: 'forest', hab: null, hour: 6.3, day: 1, t: 0,
  camX: 0, birds: [], parts: [], notes: [], flies: [],
  found: {},
  player: null,
  aim: { x: W / 2, y: H / 2 }, lastAim: { x: W / 2, y: H / 2 },
  focus: 0, focusTarget: null,
  spawnT: 1, rain: 0, E: null, lampOn: 0,
  activeLights: [], lampCone: null, beam: null,
  flash: 0, shotCd: 0, ff: 0, keys: {}, tkeys: {}, ambT: 0, hintT: 40,
  photoCardT: 0, mouseIn: false,
};
const SPR = {};
const spritesFor = sp => SPR[sp.id] || (SPR[sp.id] = buildSpeciesSprites(sp));
let PSPR = null;
let R = null;

const foundCount = () => Object.keys(G.found).length;
const speciesActive = (sp, h = G.hour) => sp.times.includes(phaseOf(h));
const bez = (a, b, c, t) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * b + t * t * c;

// ---------------- save / load ----------------
function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ found: G.found, hab: G.habId, hour: G.hour, day: G.day, muted: Sound.muted })); } catch (e) { /* storage unavailable */ }
}
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (!d) return false;
    G.found = d.found || {}; G.habId = HAB_INFO[d.hab] ? d.hab : 'forest'; G.hour = typeof d.hour === 'number' ? d.hour : 6.3; G.day = d.day || 1;
    Sound.muted = !!d.muted;
    return true;
  } catch (e) { return false; }
}

// ---------------- birds ----------------
let BIRD_ID = 0;
class Bird {
  constructor(sp) {
    this.id = ++BIRD_ID; this.sp = sp; this.F = spritesFor(sp);
    this.x = 0; this.y = 0; this.face = 1; this.state = 'arrive'; this.t = 0; this.anim = Math.random() * 3;
    this.alert = 0; this.singT = 0; this.lookT = 0; this.peckT = 0; this.flapT = 0;
    this.singCd = 2 + Math.random() * 7; this.idleT = 1 + Math.random() * 3; this.moveT = 0; this.vx = 0;
    this.stay = (sp.rarity < 0.5 ? 22 : 30) + Math.random() * 30;
  }
  sprite() {
    const F = this.F, st = this.state;
    if (this.sp.plan === 'hummer') return Math.floor(this.anim * 24) % 2 ? F.hov1 : F.hov2;
    const flapRate = this.sp.s > 1.5 ? 6 : 10;
    const flap = Math.floor(this.anim * flapRate) % 2 ? F.fly1 : F.fly2;
    if (st === 'arrive' || st === 'leave') return this.path && this.path.glide ? F.glide : flap;
    if (st === 'soar') return this.flapT > 0 ? flap : F.glide;
    if (st === 'swim' && this.sp.plan !== 'duck') return this.lookT > 0 ? F.swim : F.swim;
    if (this.singT > 0) return F.sing;
    if (this.peckT > 0) return F.peck;
    if (this.lookT > 0) return F.look;
    return F.idle;
  }
  flying() { return this.state === 'arrive' || this.state === 'leave' || this.state === 'soar' || this.sp.plan === 'hummer'; }
  center() {
    const s = this.sprite();
    return { x: this.x + this.face * (s.w / 2 - s.ax), y: this.y - s.ay + s.h / 2, r: Math.max(5, Math.max(s.w, s.h) * 0.42) };
  }
  flyTo(x1, y1, state) {
    const x0 = this.x, y0 = this.y, d = Math.hypot(x1 - x0, y1 - y0);
    const speed = this.sp.plan === 'hummer' ? 150 : this.sp.s > 1.5 ? 85 : 110;
    this.path = { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: Math.min(y0, y1) - 25 - d * 0.08, dur: Math.max(0.6, d / speed), u: 0, glide: this.sp.s > 1.5 && Math.random() < 0.5 };
    this.state = state;
  }
  release() { if (this.perch && this.perch.occ === this) this.perch.occ = null; }
  leave() {
    if (this.state === 'leave') return;
    this.release();
    const dir = G.player && G.player.x > this.x ? -1 : 1;
    this.flyTo(this.x + dir * (W * 0.8), Math.min(this.y - 120, 40) - Math.random() * 60, 'leave');
  }
  land() {
    const p = this.perch, type = p.type;
    this.x = p.x; this.y = p.y; this.t = 0;
    if (p.face) this.face = p.face;
    if (type === 'water') { this.state = 'swim'; this.vx = (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 3); }
    else if (type === 'wade') this.state = 'wade';
    else if (type === 'ground' || type === 'beach' || type === 'snow') { this.state = 'ground'; this.home = p.x; }
    else if (type === 'flower') { this.state = 'hover'; this.idleT = 3 + Math.random() * 3; }
    else if (type === 'sky') { this.state = 'soar'; this.cx = p.x; this.cy = p.y; this.th = 0; this.rx = 60 + Math.random() * 60; this.ry = 12 + Math.random() * 10; this.dirS = Math.random() < 0.5 ? 1 : -1; this.x = this.cx + this.rx; }
    else this.state = 'perch';
  }
  update(dt) {
    const sp = this.sp, hab = G.hab;
    this.t += dt; this.anim += dt;
    this.singT = Math.max(0, this.singT - dt); this.lookT = Math.max(0, this.lookT - dt); this.peckT = Math.max(0, this.peckT - dt); this.flapT = Math.max(0, this.flapT - dt);
    if (this.state === 'arrive' || this.state === 'leave') {
      const P = this.path; P.u += dt / P.dur;
      const u = Math.min(1, P.u), ue = this.state === 'arrive' ? 1 - Math.pow(1 - u, 1.7) : u * u * 0.4 + u * 0.6;
      const nx = bez(P.x0, P.cx, P.x1, ue), ny = bez(P.y0, P.cy, P.y1, ue);
      if (Math.abs(nx - this.x) > 0.02) this.face = nx > this.x ? 1 : -1;
      this.x = nx; this.y = ny;
      if (P.u >= 1) { if (this.state === 'leave') this.dead = true; else this.land(); }
      return;
    }
    if (this.state === 'walkin') {
      const dir = Math.sign(this.perch.x - this.x) || 1;
      this.face = dir; this.x += dir * (sp.g.runner ? 55 : 22) * dt; this.y = hab.groundY(this.x);
      if (Math.abs(this.perch.x - this.x) < 2) this.land();
    } else if (this.state === 'perch') {
      this.idleT -= dt;
      if (this.idleT <= 0) {
        const r = Math.random();
        if (r < 0.35) this.lookT = 0.5 + Math.random() * 0.8;
        else if (r < 0.55 && this.perch.type !== 'trunk' && this.perch.type !== 'burrow' && sp.plan !== 'owl') this.face = -this.face;
        else if (r < 0.7 && this.perch.type === 'trunk') {
          // woodpecker: drum or hitch up the trunk
          if (Math.random() < 0.5) { this.peckT = 0.7; playAt(this, (v, p) => Sound.drum(v * 0.6, p)); }
          else if (this.y > this.perch.y - 8) this.y -= 2;
        }
        this.idleT = 1 + Math.random() * 3;
      }
      if (this.perch.type === 'trunk' && this.peckT > 0) this.lookT = Math.floor(this.anim * 14) % 2 ? 0.05 : 0;
    } else if (this.state === 'ground') {
      if (this.moveT > 0) {
        this.moveT -= dt;
        const nx = this.x + this.vx * dt;
        const ok = nx > hab.minX + 10 && nx < WORLD_W - 10 && Math.abs(nx - this.home) < 60 && hab.groundY(nx) < 226 && Math.abs(hab.groundY(nx) - this.y) < 6;
        if (ok) { this.x = nx; this.y = hab.groundY(nx); } else { this.vx = -this.vx; this.face = Math.sign(this.vx); }
      } else {
        this.idleT -= dt;
        if (this.idleT <= 0) {
          if (Math.random() < 0.55) {
            const sp2 = sp.g.runner ? (sp.plan === 'roadrunner' ? 60 : 36) : sp.plan === 'quail' ? 18 : 20;
            this.vx = (Math.random() < 0.5 ? -1 : 1) * sp2; this.face = Math.sign(this.vx);
            this.moveT = 0.4 + Math.random() * (sp.g.runner ? 0.8 : 1.4);
          } else if (Math.random() < 0.7) this.peckT = 0.35 + Math.random() * 0.4;
          else this.lookT = 0.6;
          this.idleT = 0.4 + Math.random() * 1.6;
        }
      }
    } else if (this.state === 'swim') {
      const w = hab.water.find(q => this.perch.x >= q.x0 && this.perch.x <= q.x1);
      this.x += this.vx * dt;
      if (Math.abs(this.x - this.perch.x) > 55 || (w && (this.x < w.x0 + 12 || this.x > w.x1 - 12))) { this.vx = -this.vx; this.x += this.vx * dt * 2; }
      this.face = Math.sign(this.vx) || this.face;
      this.y = this.perch.y + (Math.sin(this.t * 1.7 + this.id) > 0.6 ? 1 : 0);
      this.idleT -= dt;
      if (this.idleT <= 0) { if (Math.random() < 0.4) this.lookT = 0.8; if (Math.random() < 0.3) this.vx = (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 4); this.idleT = 2 + Math.random() * 3; }
    } else if (this.state === 'wade') {
      this.idleT -= dt;
      if (this.moveT > 0) { this.moveT -= dt; this.x += this.face * 3.5 * dt; }
      if (this.idleT <= 0) {
        const r = Math.random();
        if (r < 0.3) this.peckT = 0.6; else if (r < 0.55) this.moveT = 1.5; else if (r < 0.7) this.face = -this.face; else this.lookT = 1;
        this.idleT = 2 + Math.random() * 4;
      }
    } else if (this.state === 'hover') {
      this.x = this.perch.x + Math.sin(this.t * 3.1) * 1.5; this.y = this.perch.y + Math.sin(this.t * 5.3) * 1.2; this.face = this.perch.face;
      this.idleT -= dt;
      if (this.idleT <= 0) {
        const next = hab.perches.filter(p => p.type === 'flower' && !p.occ && p !== this.perch && Math.abs(p.x - this.x) < 260);
        if (next.length && Math.random() < 0.7) { this.release(); this.perch = next[Math.floor(Math.random() * next.length)]; this.perch.occ = this; this.flyTo(this.perch.x, this.perch.y, 'arrive'); }
        else this.idleT = 2 + Math.random() * 3;
      }
    } else if (this.state === 'soar') {
      this.th += dt * 0.42 * this.dirS;
      const nx = this.cx + Math.cos(this.th) * this.rx;
      this.face = nx > this.x ? 1 : -1;
      this.x = nx; this.y = this.cy + Math.sin(this.th) * this.ry;
      if (this.flapT <= 0 && Math.random() < dt * 0.25) this.flapT = 0.8;
    }
    this.stay -= dt * (speciesActive(sp) ? 1 : 5);
    if (this.stay <= 0) { this.leave(); return; }
    this.updateAlert(dt);
    if (this.state !== 'leave') this.updateSong(dt);
  }
  updateAlert(dt) {
    const P = G.player, sp = this.sp;
    if (!P || G.state !== 'play') return;
    const c = this.center(), d = Math.hypot(c.x - P.x, c.y - (P.y - 18));
    const noise = P.moving ? (P.sneak ? 0.2 : 1) : 0;
    const hear = 125 * sp.shy;
    let inc = 0;
    if (d < hear) inc += noise * 0.6 * (1 - d / hear) * sp.shy;
    if (d < 14 + 22 * sp.shy && P.moving) inc += 1.4;
    if (G.lampCone && !sp.nocturnal && inCone(G.lampCone, c.x, c.y)) inc += 0.3;
    if (this.state === 'soar') inc *= 0.3;
    this.alert = clamp(this.alert + (inc > 0 ? inc * dt : -0.12 * dt), 0, 1.2);
    if (this.alert >= 1) {
      if (Math.random() < 0.5 && sp.call) playAt(this, (v, p) => Sound.call(sp.call.slice(0, 2), v, p));
      this.leave();
    }
  }
  updateSong(dt) {
    const sp = this.sp;
    if (!sp.call || this.alert > 0.5 || this.state === 'arrive' || this.state === 'walkin') return;
    const ph = phaseOf(G.hour);
    this.singCd -= dt * (ph === 'dawn' ? 1.8 : 1) * (sp.nocturnal && ph === 'night' ? 1.6 : 1);
    if (this.singCd > 0) return;
    const dur = playAt(this, (v, p) => Sound.call(sp.call, v, p)) || 1;
    this.singT = Math.min(2.2, dur);
    this.singCd = 7 + Math.random() * 11;
    const c = this.center();
    for (let i = 0; i < 2; i++) G.notes.push({ x: c.x + (Math.random() - 0.5) * 6, y: c.y - c.r - 2 - i * 6, vx: (Math.random() - 0.5) * 6, life: 1.6 + i * 0.3, max: 1.6 + i * 0.3 });
  }
}
function playAt(b, fn) {
  const P = G.player;
  if (!P || G.state !== 'play' || G.overlay) return 0;
  const d = Math.abs(b.x - P.x) + Math.abs(b.y - P.y) * 0.5;
  const vol = clamp(1 - d / 420, 0, 1) ** 1.4;
  return fn(vol, (b.x - P.x) / 240) || 0;
}
function inCone(cone, x, y) {
  const dx = x - cone.x, dy = y - cone.y, d = Math.hypot(dx, dy);
  if (d > cone.r) return false;
  let da = Math.atan2(dy, dx) - cone.a;
  da = Math.atan2(Math.sin(da), Math.cos(da));
  return Math.abs(da) < cone.half;
}

// ---------------- spawning ----------------
function choosePerch(type) {
  const cx = G.camX + W / 2, P = G.player;
  if (type === 'sky') return { type: 'sky', x: clamp(cx + (Math.random() - 0.5) * W * 0.7, 160, WORLD_W - 160), y: 38 + Math.random() * 45, virtual: true };
  const list = G.hab.perches.filter(p => p.type === type && !p.occ && Math.abs(p.x - cx) < W * 0.5 + 150 && (!P || Math.abs(p.x - P.x) > 45));
  return list.length ? list[Math.floor(Math.random() * list.length)] : null;
}
function trySpawn(initial) {
  const ph = phaseOf(G.hour);
  const pool = SPECIES.filter(s => s.hab === G.habId && s.times.includes(ph));
  const counts = {};
  for (const b of G.birds) counts[b.sp.id] = (counts[b.sp.id] || 0) + 1;
  const cand = pool.filter(s => (counts[s.id] || 0) < (s.rarity < 0.5 ? 1 : 2));
  if (!cand.length) return false;
  let tot = 0;
  const wts = cand.map(s => { const w = s.rarity * (G.found[s.id] ? 1 : 1.7); tot += w; return w; });
  let r = Math.random() * tot, sp = cand[0];
  for (let i = 0; i < cand.length; i++) { r -= wts[i]; if (r <= 0) { sp = cand[i]; break; } }
  const types = sp.perch.slice().sort(() => Math.random() - 0.5);
  for (const type of types) {
    const p = choosePerch(type);
    if (!p) continue;
    const b = new Bird(sp);
    b.perch = p; if (!p.virtual) p.occ = b;
    if (initial) { b.x = p.x; b.y = p.y; b.land(); b.stay *= 0.7 + Math.random() * 0.5; }
    else if ((sp.plan === 'quail' || sp.plan === 'roadrunner') && type === 'ground') {
      let side = Math.random() < 0.5 ? -1 : 1;
      if (p.x + side * 280 < 20 || p.x + side * 280 > WORLD_W - 20) side = -side;
      b.x = p.x + side * 280; b.y = G.hab.groundY(b.x); b.state = 'walkin'; b.face = -side;
    } else {
      let side = Math.random() < 0.5 ? -1 : 1;
      b.x = p.x + side * W * 0.62; b.y = Math.max(-20, Math.min(p.y, 120) - 100 - Math.random() * 40);
      b.flyTo(p.x, p.y, 'arrive');
    }
    G.birds.push(b);
    return true;
  }
  return false;
}

// ---------------- light queries (match the rendered light map) ----------------
function falloff(t) { return t < 0.4 ? lerp(1, 0.45, t / 0.4) : lerp(0.45, 0, (t - 0.4) / 0.6); }
function lightAt(x, y) {
  const E = G.E;
  const c = E.amb.slice();
  for (const L of G.activeLights) {
    const d = Math.hypot(x - L.x, y - L.y);
    if (d < L.r) { const f = falloff(d / L.r) * L.k; c[0] += L.col[0] * f; c[1] += L.col[1] * f; c[2] += L.col[2] * f; }
  }
  if (G.lampCone && inCone(G.lampCone, x, y)) { const f = falloff(Math.hypot(x - G.lampCone.x, y - G.lampCone.y) / G.lampCone.r); c[0] += f; c[1] += f * 0.97; c[2] += f * 0.88; }
  const B = G.beam;
  if (B && B.k > 0.02) {
    const dx = (x - B.x) * B.dir;
    if (dx > 0 && dx < B.len && y > B.y - 10 * dx / B.len - 2 && y < B.y + 34 * dx / B.len + 2) { const f = B.k * (1 - dx / B.len); c[0] += f; c[1] += f * 0.94; c[2] += f * 0.75; }
  }
  return clamp(0.3 * Math.min(1, c[0]) + 0.59 * Math.min(1, c[1]) + 0.11 * Math.min(1, c[2]), 0, 1);
}
function computeLights(E) {
  const hab = G.hab, t = G.t;
  const lampOn = clamp((0.78 - E.L) / 0.3, 0, 1);
  G.lampOn = lampOn;
  const L = [];
  for (const s of hab.lights) {
    let k = s.always ? s.i * (0.5 + 0.5 * clamp((0.9 - E.L) / 0.4, 0, 1)) : s.lamp ? s.i * lampOn : s.i;
    if (s.flick) k *= 1 - s.flick + s.flick * 2 * vnoise(t * 9, s.x, 3);
    L.push({ x: s.x, y: s.y, r: s.r, col: s.col, k });
  }
  if (E.night > 0.3 && hab.fireflies) for (const f of G.flies) L.push({ x: f.x, y: f.y, r: 14, col: [0.75, 1, 0.35], k: f.b * 0.55 * E.night });
  G.activeLights = L;
  const P = G.player;
  if (P && P.lamp && G.state === 'play') {
    const lp = playerSprite(P).lamp, hx = P.x + P.face * lp[0], hy = P.y + lp[1];
    let a = P.face > 0 ? 0.18 : Math.PI - 0.18;
    if (P.mode === 'camera') a = Math.atan2(G.aim.y - hy, G.camX + G.aim.x - hx);
    G.lampCone = { x: hx, y: hy, r: 230, a, half: 0.4 };
  } else G.lampCone = null;
  if (hab.decor.lighthouse) {
    const lh = hab.decor.lighthouse, cs = Math.cos(t * 0.7);
    G.beam = { x: lh.x, y: lh.y, dir: cs >= 0 ? 1 : -1, len: 520 * Math.abs(cs), k: 0.55 * lampOn * Math.abs(cs) };
  } else G.beam = null;
}

// ---------------- habitat travel ----------------
function enterHabitat(id, keepX) {
  if (G.hab) for (const p of G.hab.perches) p.occ = null;
  G.habId = id; G.hab = getHabitat(id);
  G.birds = []; G.parts = []; G.notes = [];
  const x = keepX ? G.player.x : G.hab.spawnX;
  G.player = { x, y: G.hab.walkY(x), face: 1, mode: 'walk', moving: false, sneak: false, lamp: G.player ? G.player.lamp : false, walkT: 0 };
  G.camX = clamp(x - W / 2, 0, WORLD_W - W);
  G.flies = Array.from({ length: 22 }, (_, i) => ({ ox: Math.random() * W, oy: 120 + Math.random() * 90, p: Math.random() * TAU, x: 0, y: 0, b: 0 }));
  for (let i = 0; i < 3; i++) trySpawn(true);
  G.spawnT = 2;
  UI.updateHud(true);
}

// ---------------- input ----------------
// Walking keys always walk (they lower the camera); the viewfinder is aimed with the mouse or I/J/K/L.
const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', KeyI: 'aimU', ArrowUp: 'aimU', KeyW: 'aimU', KeyK: 'aimD', ArrowDown: 'aimD', KeyS: 'aimD', KeyJ: 'aimL', KeyL: 'aimR', ShiftLeft: 'sneak', ShiftRight: 'sneak', KeyT: 'rest' };
function playerSprite(P) {
  if (P.mode === 'camera') return P.sneak ? PSPR.cameraCrouch : PSPR.camera;
  if (P.mode === 'rest') return PSPR.rest;
  if (P.moving) return P.sneak ? PSPR.crouchWalk[Math.floor(P.walkT) % 4] : PSPR.walk[Math.floor(P.walkT) % 6];
  return P.sneak ? PSPR.crouch : PSPR.idle;
}
function cycleFF() { G.ff = (G.ff + 1) % FF_SPEEDS.length; Sound.blip(600 + G.ff * 300, 0.05, 0.1); UI.ffLabel(); }
function down(k) { return G.keys[k] || G.tkeys[k]; }
function toggleCamera(force) {
  const P = G.player;
  if (!P || G.state !== 'play' || G.overlay) return;
  const on = force !== undefined ? force : P.mode !== 'camera';
  P.mode = on ? 'camera' : 'walk';
  G.focus = 0; G.focusTarget = null;
  if (on && !G.mouseIn) { G.aim.x = clamp(P.x - G.camX + P.face * 80, VF.w / 2, W - VF.w / 2); G.aim.y = clamp(P.y - 60, VF.h / 2, H - VF.h / 2); }
  UI.touchMode();
}
function onKeyDown(e) {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  Sound.init();
  if (G.state === 'title') { if (e.code === 'Enter' || e.code === 'Space') { UI.start(); e.preventDefault(); } return; }
  const k = KEYMAP[e.code];
  if (k) { G.keys[k] = true; if (e.code.startsWith('Arrow')) e.preventDefault(); }
  if (e.repeat) return;
  switch (e.code) {
    case 'Space': case 'KeyC': if (!G.overlay) { toggleCamera(); e.preventDefault(); } break;
    case 'Enter': case 'KeyE': if (!G.overlay && G.player.mode === 'camera') shoot(); break;
    case 'KeyF': if (!G.overlay) { G.player.lamp = !G.player.lamp; Sound.blip(G.player.lamp ? 1200 : 800, 0.05, 0.12); } break;
    case 'KeyG': case 'Tab': UI.toggle('guide'); e.preventDefault(); break;
    case 'KeyM': UI.toggle('map'); break;
    case 'KeyH': UI.toggle('help'); break;
    case 'KeyN': UI.toggleSound(); break;
    case 'KeyX': if (!G.overlay) cycleFF(); break;
    case 'Escape': if (G.overlay) UI.close(); else if (G.player.mode === 'camera') toggleCamera(false); else UI.toggle('help'); break;
  }
}
function onKeyUp(e) { const k = KEYMAP[e.code]; if (k) G.keys[k] = false; }

// ---------------- update ----------------
function update(dt) {
  G.t += dt;
  if (G.state === 'title') {
    G.camX = clamp(380 + Math.sin(G.t * 0.05) * 300, 0, WORLD_W - W);
    for (const b of G.birds) b.update(dt);
    G.birds = G.birds.filter(b => !b.dead);
    G.spawnT -= dt; if (G.spawnT <= 0) { if (G.birds.length < 5) trySpawn(false); G.spawnT = 3; }
    updateParticles(dt);
    return;
  }
  if (G.overlay) return;
  const P = G.player, hab = G.hab;
  const resting = down('rest') && P.mode !== 'camera';
  const ts = Math.max(resting ? REST_SPEED : 1, FF_SPEEDS[G.ff]);
  G.hour += dt * ts / HOUR_SECONDS;
  if (G.hour >= 24) { G.hour -= 24; G.day++; }
  if (hab.rain) { const target = Math.sin(G.day * 1.7 + G.hour * 0.55) > 0.25 ? 1 : 0; G.rain += (target - G.rain) * Math.min(1, dt * 0.25 * ts); } else G.rain = 0;
  // player
  P.sneak = !!down('sneak');
  if (P.mode === 'camera' && (down('left') || down('right'))) toggleCamera(false);
  if (P.mode === 'camera') {
    const ax = (down('aimR') ? 1 : 0) - (down('aimL') ? 1 : 0), ay = (down('aimD') ? 1 : 0) - (down('aimU') ? 1 : 0);
    G.aim.x = clamp(G.aim.x + ax * 110 * dt, 0, W); G.aim.y = clamp(G.aim.y + ay * 110 * dt, 0, H);
    P.moving = false;
  } else {
    P.mode = resting ? 'rest' : 'walk';
    const dir = resting ? 0 : (down('right') ? 1 : 0) - (down('left') ? 1 : 0);
    const sp = P.sneak ? 20 : 52;
    const nx = clamp(P.x + dir * sp * dt, hab.minX, hab.maxX);
    P.moving = dir !== 0 && nx !== P.x;
    if (dir) P.face = dir;
    P.x = nx; P.y = hab.walkY(P.x);
    if (P.moving) P.walkT += dt * (P.sneak ? 6 : 11);
  }
  const target = P.mode === 'camera' ? G.camX : clamp(P.x - W / 2 + P.face * 30, 0, WORLD_W - W);
  G.camX += (target - G.camX) * Math.min(1, dt * 3);
  // birds
  for (const b of G.birds) b.update(dt);
  for (const b of G.birds) if (b.dead) b.release();
  G.birds = G.birds.filter(b => !b.dead);
  G.spawnT -= dt * Math.min(ts, 4);
  if (G.spawnT <= 0) {
    const ph = phaseOf(G.hour), cap = ph === 'dawn' ? 7 : ph === 'night' ? 3 : 6;
    if (G.birds.length < cap) trySpawn(false);
    G.spawnT = 2.5 + Math.random() * 3;
  }
  // camera focus
  if (P.mode === 'camera') {
    const ax = G.camX + G.aim.x, ay = G.aim.y;
    let best = null, bd = 1e9;
    for (const b of G.birds) { const c = b.center(); const d = Math.hypot(c.x - ax, c.y - ay); if (d < c.r + 6 && d < bd) { bd = d; best = b; } }
    const spd = Math.hypot(G.aim.x - G.lastAim.x, G.aim.y - G.lastAim.y) / Math.max(dt, 1e-3);
    if (best && best === G.focusTarget) { if (spd < 70) G.focus = Math.min(1, G.focus + dt * (best.flying() ? 1.05 : 1.7)); else G.focus = Math.max(0, G.focus - dt * 2); }
    else { G.focusTarget = best; G.focus = 0; }
  }
  G.lastAim.x = G.aim.x; G.lastAim.y = G.aim.y;
  G.shotCd = Math.max(0, G.shotCd - dt); G.flash = Math.max(0, G.flash - dt * 4);
  updateParticles(dt);
  updateAmbience(dt);
  G.hintT -= dt;
  if (G.photoCardT > 0) { G.photoCardT -= dt; if (G.photoCardT <= 0) UI.hidePhoto(); }
  UI.tick(dt);
}

function updateParticles(dt) {
  const hab = G.hab, E = G.E, t = G.t;
  if (!hab || !E) return;
  // fireflies follow the view
  for (const f of G.flies) {
    f.x = G.camX + ((f.ox + Math.sin(t * 0.3 + f.p) * 30) % W + W) % W; f.y = f.oy + Math.sin(t * 0.7 + f.p * 2) * 12;
    f.b = Math.max(0, Math.sin(t * 1.3 + f.p * 5)) ** 3;
  }
  const spawn = (n, fn) => { for (let i = 0; i < n; i++) G.parts.push(fn()); };
  const ts = G.camX;
  if (hab.leaves && Math.random() < dt * 1.5) spawn(1, () => ({ k: 'leaf', x: ts + Math.random() * W, y: 40 + Math.random() * 60, vx: 6, vy: 10, life: 12, c: hab.leaves[1 + Math.floor(Math.random() * 4)], p: Math.random() * 6 }));
  if (hab.snow && Math.random() < dt * 30) spawn(1, () => ({ k: 'snow', x: ts + Math.random() * (W + 60) - 30, y: -4, vx: -6 - Math.random() * 6, vy: 14 + Math.random() * 10, life: 20, p: Math.random() * 6 }));
  if (hab.rain && G.rain > 0.05) { const n = Math.floor(G.rain * 220 * dt + Math.random()); spawn(n, () => ({ k: 'rain', x: ts + Math.random() * (W + 80) - 20, y: -6, vx: -40, vy: 260 + Math.random() * 60, life: 2 })); }
  if (hab.dust && E.day > 0.3 && Math.random() < dt * 6) spawn(1, () => ({ k: 'dust', x: ts + Math.random() * W, y: 150 + Math.random() * 60, vx: 10 + Math.random() * 10, vy: -2, life: 6 }));
  if ((hab.mist && (phaseOf(G.hour) === 'dawn' || hab.id === 'rainforest')) && Math.random() < dt * 0.8) spawn(1, () => ({ k: 'mist', x: ts - 40 + Math.random() * (W + 80), y: 185 + Math.random() * 25, vx: 3 + Math.random() * 3, vy: 0, life: 14, max: 14, r: 30 + Math.random() * 30 }));
  if (hab.chimney && G.lampOn > 0.2 && Math.random() < dt * 2) spawn(1, () => ({ k: 'smoke', x: hab.chimney.x, y: hab.chimney.y, vx: 4 + Math.random() * 3, vy: -9, life: 5, max: 5 }));
  if (hab.decor.campfire && G.lampOn > 0.1 && Math.random() < dt * 5) spawn(1, () => ({ k: 'ember', x: hab.decor.campfire.x + (Math.random() - 0.5) * 6, y: hab.decor.campfire.y - 6, vx: (Math.random() - 0.5) * 8, vy: -18 - Math.random() * 12, life: 1.6 }));
  for (const p of G.parts) {
    p.life -= dt;
    if (p.k === 'leaf') { p.x += (p.vx + Math.sin(t * 2 + p.p) * 12) * dt; p.y += p.vy * dt; if (p.y > G.hab.groundY(p.x)) { p.vy = 0; p.vx = 0; } }
    else if (p.k === 'snow') { p.x += (p.vx + Math.sin(t + p.p) * 6) * dt; p.y += p.vy * dt; if (p.y > G.hab.groundY(p.x)) p.life = 0; }
    else if (p.k === 'rain') { p.x += p.vx * dt; p.y += p.vy * dt; if (p.y > G.hab.groundY(p.x)) { p.life = 0; if (Math.random() < 0.2) G.parts.push({ k: 'splash', x: p.x, y: G.hab.groundY(p.x) - 1, life: 0.15 }); } }
    else { p.x += (p.vx || 0) * dt; p.y += (p.vy || 0) * dt; }
  }
  G.parts = G.parts.filter(p => p.life > 0 && p.x > G.camX - 120 && p.x < G.camX + W + 120);
  if (G.parts.length > 900) G.parts.splice(0, G.parts.length - 900);
  for (const n of G.notes) { n.life -= dt; n.y -= 9 * dt; n.x += n.vx * dt; }
  G.notes = G.notes.filter(n => n.life > 0);
}

function updateAmbience(dt) {
  G.ambT -= dt;
  if (G.ambT > 0 || !Sound.ctx) return;
  G.ambT = 0.25;
  const hab = G.hab, P = G.player, E = G.E, id = hab.id;
  if (!E) return;
  const ph = phaseOf(G.hour);
  Sound.setAmb('wind', 0.1 + (id === 'mountain' ? 0.16 : 0) + (id === 'coast' ? 0.06 : 0) + (id === 'desert' ? 0.05 : 0));
  Sound.setAmb('water', id === 'wetland' ? 0.08 : 0);
  Sound.setAmb('surf', id === 'coast' ? (0.05 + 0.2 * clamp((P.x - 700) / 500, 0, 1)) * (0.6 + 0.4 * Math.sin(G.t * 0.6)) : 0);
  Sound.setAmb('rain', id === 'rainforest' ? G.rain * 0.4 : 0);
  Sound.setAmb('creek', id === 'mountain' ? clamp(1 - Math.abs(P.x - 1520) / 360, 0, 1) * 0.35 : 0);
  Sound.setAmb('fire', id === 'desert' ? clamp(1 - Math.abs(P.x - 950) / 220, 0, 1) * 0.22 * G.lampOn : 0);
  if (ph === 'night' && (id === 'forest' || id === 'wetland' || id === 'desert') && Math.random() < 0.35) Sound.cricket(0.05 + Math.random() * 0.05, Math.random() * 2 - 1);
  if (id === 'wetland' && (ph === 'night' || ph === 'dusk') && Math.random() < 0.08) Sound.frog(0.12, Math.random() * 2 - 1);
  if (id === 'rainforest' && ph === 'day' && Math.random() < 0.05) Sound.call([['n', 5200, 5400, 1.2, 0, 0.12]], 0.4, Math.random() * 2 - 1);
}

// ---------------- photography ----------------
function shoot() {
  if (G.shotCd > 0 || G.player.mode !== 'camera') return;
  G.shotCd = 0.6; G.flash = 1;
  Sound.shutter();
  const ax = G.camX + G.aim.x, ay = G.aim.y;
  // capture what the viewfinder shows
  const photo = makeCanvas(VF.w, VF.h), px = photo.getContext('2d');
  px.imageSmoothingEnabled = false;
  px.drawImage(R.snap2, G.aim.x - VF.w / 4, G.aim.y - VF.h / 4, VF.w / 2, VF.h / 2, 0, 0, VF.w, VF.h);
  applyBlur(px, photo, 1 - G.focus);
  let b = null, bd = 1e9;
  for (const o of G.birds) { const c = o.center(); const d = Math.hypot(c.x - ax, c.y - ay); if (d < c.r + 6 && d < bd) { bd = d; b = o; } }
  for (const o of G.birds) if (Math.abs(o.x - G.player.x) < 90) o.alert = Math.min(1.2, o.alert + 0.12 * o.sp.shy);
  if (!b) { UI.showPhoto(photo, null, 0, 0, 'No bird in the frame. Center the reticle on a bird.'); return; }
  const c = b.center();
  const focus = b === G.focusTarget ? G.focus : 0;
  const center = 1 - clamp(bd / (c.r + 6), 0, 1);
  const L = lightAt(c.x, c.y);
  const lightS = clamp((L - 0.12) / 0.5, 0, 1);
  const action = b.singT > 0 || b.flying() ? 0.06 : 0;
  const score = clamp(0.4 * focus + 0.25 * center + 0.35 * lightS + action, 0, 1);
  let pct = Math.round(score * 100);
  let stars = pct >= 85 ? 3 : pct >= 65 ? 2 : pct >= 42 ? 1 : 0;
  // poor light or focus hides field marks no matter how well framed the shot is
  if (lightS < 0.25 || focus < 0.35) stars = 0;
  else if (lightS < 0.45 || focus < 0.7) stars = Math.min(stars, 1);
  if (stars === 0) pct = Math.min(pct, 41); else if (stars === 1) pct = Math.min(pct, 64);
  let msg = '';
  if (lightS < 0.25) msg = 'Too dark to see field marks. Switch on your headlamp (F) or wait for better light.';
  else if (focus < 0.35) msg = 'Too blurry. Hold the reticle steady on the bird until the focus ring turns green.';
  else if (center < 0.4 && stars < 3) msg = 'The bird is at the edge of the frame. Center it.';
  else if (stars === 3) msg = 'A field-guide quality shot!';
  else if (stars === 2) msg = 'A clear, identifiable photo.';
  else if (lightS < 0.45) msg = 'Identifiable, but dim. More light would bring out the colors.';
  else if (focus < 0.7) msg = 'Identifiable, but soft. Wait for the ring to turn green.';
  else msg = 'Identifiable, just barely.';
  if (action && stars > 0) msg += b.flying() ? ' In flight, too.' : ' Caught it singing.';
  const sp = b.sp, prev = G.found[sp.id];
  let tag = '';
  if (stars > 0) {
    if (!prev) {
      tag = 'new';
      G.found[sp.id] = { stars, score: pct, photo: photo.toDataURL('image/png'), day: G.day, hour: G.hour };
      Sound.fanfare();
      UI.toast(`New species: ${sp.name}`, 'new');
      for (const id of HABITAT_ORDER) { const need = HAB_INFO[id].need; if (need > 0 && foundCount() === need) UI.toast(`${HAB_INFO[id].name} unlocked. Open the map (M) to travel.`, 'unlock'); }
      if (foundCount() === TOTAL) UI.toast('All 36 species photographed. Your field guide is complete!', 'unlock');
    } else if (pct > prev.score) {
      tag = 'better';
      G.found[sp.id] = { stars: Math.max(stars, prev.stars), score: pct, photo: photo.toDataURL('image/png'), day: G.day, hour: G.hour };
    }
    save();
  }
  UI.showPhoto(photo, stars > 0 ? sp : null, stars, pct, msg, tag);
}
function applyBlur(ctx, canvas, amt) {
  if (amt <= 0.05) return;
  const s = makeCanvas(Math.max(8, canvas.width / 5), Math.max(6, canvas.height / 5)), sx = s.getContext('2d');
  sx.imageSmoothingEnabled = true; sx.drawImage(canvas, 0, 0, s.width, s.height);
  ctx.save(); ctx.imageSmoothingEnabled = true; ctx.globalAlpha = clamp(amt, 0, 1) * 0.9;
  ctx.drawImage(s, 0, 0, canvas.width, canvas.height); ctx.restore(); ctx.imageSmoothingEnabled = false;
}

// ---------------- drawing ----------------
function drawSprite(ctx, spr, x, y, face, clipY) {
  const dx = Math.round(x), dy = Math.round(y);
  let sh = spr.h;
  if (clipY !== undefined) sh = clamp(Math.round(clipY) - (dy - spr.ay), 0, spr.h);
  if (sh <= 0) return;
  if (face >= 0) ctx.drawImage(spr.c, 0, 0, spr.w, sh, dx - spr.ax, dy - spr.ay, spr.w, sh);
  else { ctx.save(); ctx.translate(dx, 0); ctx.scale(-1, 1); ctx.drawImage(spr.c, 0, 0, spr.w, sh, -spr.ax, dy - spr.ay, spr.w, sh); ctx.restore(); }
}
const NOTE = ['0110', '0101', '0100', '0100', '1100', '1100'];
function draw() {
  const hab = G.hab, ctx = R.ctx;
  const camX = Math.round(G.camX);
  R.camX = camX;
  const E = R.env(G.hour, hab, G.rain);
  G.E = E;
  computeLights(E);
  const P = G.player, t = G.t;
  // sky and distant layers
  R.drawSky(E, t, hab);
  ctx.drawImage(R.sky, 0, 0);
  const amb = E.amb, hz = E.hor;
  R.tintDraw(ctx, hab.layers.far, Math.round(camX * PAR.far), 0, W, H, 0, 0, mix(amb, [hz[0] / 255, hz[1] / 255, hz[2] / 255], 0.25), hz, 0.36);
  R.tintDraw(ctx, hab.layers.mid, Math.round(camX * PAR.mid), 0, W, H, 0, 0, amb, hz, 0.14 + G.rain * 0.15);
  // world layer
  const w = R.wctx;
  w.clearRect(0, 0, W, H);
  w.drawImage(hab.layers.near, camX, 0, W, H, 0, 0, W, H);
  // shadows in daylight
  if (E.day > 0.2) {
    w.fillStyle = `rgba(10,8,20,${0.22 * E.day})`;
    const shadow = (x, y, rw) => { w.beginPath(); w.ellipse(Math.round(x - camX), Math.round(y), rw, 1.5, 0, 0, TAU); w.fill(); };
    if (G.state === 'play') shadow(P.x, P.y, 6);
    for (const b of G.birds) if (b.state === 'ground' || b.state === 'walkin') shadow(b.x, b.y, 4 * b.sp.s);
  }
  // ripples
  w.fillStyle = 'rgba(220,235,255,0.55)';
  for (const b of G.birds) if (b.state === 'swim' || b.state === 'wade') {
    const ph = (t * 6 + b.id) % 6, bx = Math.round(b.x - camX), by = Math.round(b.state === 'wade' ? b.y - 3 : b.y + 1);
    w.fillRect(bx - 7 - ph, by, 3, 1); w.fillRect(bx + 5 + ph, by, 3, 1);
  }
  // entities sorted by depth
  const ents = G.birds.map(b => ({ y: b.state === 'swim' ? b.y - 20 : b.y, b }));
  if (G.state === 'play') ents.push({ y: P.y + 0.5, p: true });
  ents.sort((a, b) => a.y - b.y);
  for (const e of ents) {
    if (e.p) {
      const spr = playerSprite(P);
      drawSprite(w, spr, P.x - camX, P.y, P.face);
      if (P.lamp) { w.fillStyle = '#fff4c0'; w.fillRect(Math.round(P.x - camX + P.face * spr.lamp[0]), Math.round(P.y + spr.lamp[1]), 1, 1); }
    } else {
      const b = e.b;
      drawSprite(w, b.sprite(), b.x - camX, b.y, b.face, b.state === 'wade' ? b.y - 4 : undefined);
    }
  }
  // lit particles
  for (const p of G.parts) {
    const x = Math.round(p.x - camX), y = Math.round(p.y);
    if (p.k === 'leaf') { w.fillStyle = rgba(p.c); w.fillRect(x, y, 2, 1); w.fillRect(x + (Math.sin(t * 3 + p.p) > 0 ? 1 : 0), y + 1, 1, 1); }
    else if (p.k === 'dust') { w.fillStyle = 'rgba(236,210,170,0.6)'; w.fillRect(x, y, 1, 1); }
  }
  R.buildLightMap(E, G);
  R.applyLighting();
  ctx.drawImage(R.world, 0, 0);
  R.drawWater(E, G, t);
  // foreground silhouettes
  R.tintDraw(ctx, hab.layers.fore, Math.round(camX * PAR.fore), 0, W, H, 0, 0, amb.map(v => v * 0.7), null, 0);
  // emissive windows, lamps and fungi
  ctx.globalCompositeOperation = 'lighter';
  for (const em of hab.emit) {
    const k = em.always ? 0.35 + 0.65 * clamp((0.9 - E.L) / 0.4, 0, 1) : G.lampOn;
    if (k < 0.02) continue;
    const x = em.x - camX;
    if (x < -40 || x > W + 40) continue;
    ctx.fillStyle = rgba(em.col, 0.85 * k); ctx.fillRect(x, em.y, em.w, em.h);
    const cx = x + em.w / 2, cy = em.y + em.h / 2, g = ctx.createRadialGradient(cx, cy, 0, cx, cy, em.glow);
    g.addColorStop(0, rgba(em.col, 0.35 * k)); g.addColorStop(1, rgba(em.col, 0));
    ctx.fillStyle = g; ctx.fillRect(cx - em.glow, cy - em.glow, em.glow * 2, em.glow * 2);
  }
  ctx.globalCompositeOperation = 'source-over';
  for (const em of hab.emit) if (em.frame && G.lampOn > 0.02) { ctx.fillStyle = '#2a1c12'; const x = em.x - camX; ctx.fillRect(em.frame[0] - camX, em.y, 2, em.h); if (em.frame[1] > 0) ctx.fillRect(x, em.frame[1], em.w, 1); }
  // campfire
  if (hab.decor.campfire) {
    const cf = hab.decor.campfire, x = cf.x - camX, k = Math.max(0.35, G.lampOn);
    if (x > -40 && x < W + 40) {
      ctx.globalCompositeOperation = 'lighter';
      const cols = ['#ffe9a0', '#ffb84a', '#f2702a', '#b8361a'];
      for (let i = -3; i <= 3; i++) {
        const hgt = Math.max(1, Math.round((7 - Math.abs(i) * 1.6) * (0.7 + 0.5 * vnoise(t * 10, i * 3, 5))));
        for (let j = 0; j < hgt; j++) { ctx.fillStyle = cols[Math.min(3, Math.floor(j / hgt * 3 + Math.abs(i) * 0.4))]; ctx.globalAlpha = k; ctx.fillRect(Math.round(x + i), Math.round(cf.y - j), 1, 1); }
      }
      ctx.globalAlpha = 1;
      const g = ctx.createRadialGradient(x, cf.y - 4, 0, x, cf.y - 4, 30);
      g.addColorStop(0, `rgba(255,150,60,${0.4 * k})`); g.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = g; ctx.fillRect(x - 30, cf.y - 34, 60, 60);
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  // lighthouse beam
  if (G.beam && G.beam.k > 0.02) {
    const B = G.beam, x = B.x - camX;
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(x, 0, x + B.dir * B.len, 0);
    g.addColorStop(0, `rgba(255,240,190,${0.32 * B.k})`); g.addColorStop(1, 'rgba(255,240,190,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, B.y); ctx.lineTo(x + B.dir * B.len, B.y - 10); ctx.lineTo(x + B.dir * B.len, B.y + 34); ctx.closePath(); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  // god rays through the canopy
  if ((hab.id === 'forest' || hab.id === 'rainforest') && E.day > 0.05 && G.rain < 0.5) {
    ctx.globalCompositeOperation = 'lighter';
    const warm = mix([255, 240, 200], [255, 190, 120], 1 - E.day);
    for (let i = 0; i < Math.ceil(W / 80); i++) {
      const span = W + 280, sx = ((i * 197 + 60 - camX * 0.9) % span + span) % span - 140;
      const a = (0.035 + 0.02 * Math.sin(t * 0.4 + i)) * E.day * (1 - G.rain);
      const g = ctx.createLinearGradient(0, 0, 0, 210);
      g.addColorStop(0, rgba(warm, a)); g.addColorStop(1, rgba(warm, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx + 16, 0); ctx.lineTo(sx + 96, 210); ctx.lineTo(sx + 50, 210); ctx.closePath(); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  // weather & glowing particles
  const ambC = [amb[0] * 255, amb[1] * 255, amb[2] * 255];
  for (const p of G.parts) {
    const x = Math.round(p.x - camX), y = Math.round(p.y);
    if (p.k === 'snow') { ctx.fillStyle = rgba(mix(ambC, [255, 255, 255], 0.3), 0.9); ctx.fillRect(x, y, 1, 1); }
    else if (p.k === 'rain') { ctx.fillStyle = rgba(mix(ambC, [200, 220, 255], 0.3), 0.35); ctx.fillRect(x, y, 1, 4); }
    else if (p.k === 'splash') { ctx.fillStyle = 'rgba(200,220,255,0.35)'; ctx.fillRect(x - 1, y, 1, 1); ctx.fillRect(x + 1, y, 1, 1); }
    else if (p.k === 'mist') { const a = 0.07 * Math.sin(Math.PI * p.life / p.max); const g = ctx.createRadialGradient(x, y, 0, x, y, p.r); g.addColorStop(0, rgba(mix(E.hor, [255, 255, 255], 0.4), a)); g.addColorStop(1, rgba(E.hor, 0)); ctx.fillStyle = g; ctx.fillRect(x - p.r, y - p.r, p.r * 2, p.r * 2); }
    else if (p.k === 'smoke') { const a = 0.3 * (p.life / p.max); ctx.fillStyle = rgba(mix(ambC, [140, 140, 150], 0.5), a); const s = Math.round(2 + (1 - p.life / p.max) * 4); ctx.fillRect(x - s / 2, y - s / 2, s, s); }
    else if (p.k === 'ember') { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,170,70,${clamp(p.life, 0, 1)})`; ctx.fillRect(x, y, 1, 1); ctx.globalCompositeOperation = 'source-over'; }
  }
  if (E.night > 0.3 && hab.fireflies) {
    ctx.globalCompositeOperation = 'lighter';
    for (const f of G.flies) {
      if (f.b < 0.05) continue;
      const x = Math.round(f.x - camX), y = Math.round(f.y), a = f.b * E.night;
      ctx.fillStyle = `rgba(220,255,120,${a})`; ctx.fillRect(x, y, 1, 1);
      const g = ctx.createRadialGradient(x, y, 0, x, y, 6); g.addColorStop(0, `rgba(190,255,90,${a * 0.5})`); g.addColorStop(1, 'rgba(190,255,90,0)');
      ctx.fillStyle = g; ctx.fillRect(x - 6, y - 6, 12, 12);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  // headlamp: a faint visible beam plus a glow at the bulb
  if (G.lampCone && E.night > 0.1) {
    const C = G.lampCone, x = C.x - camX, y = C.y;
    ctx.globalCompositeOperation = 'lighter';
    const bg = ctx.createRadialGradient(x, y, 0, x, y, C.r);
    bg.addColorStop(0, `rgba(255,244,210,${0.1 * E.night})`); bg.addColorStop(1, 'rgba(255,244,210,0)');
    ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, C.r, C.a - C.half, C.a + C.half); ctx.closePath(); ctx.fill();
    const g = ctx.createRadialGradient(x, y, 0, x, y, 8); g.addColorStop(0, `rgba(255,245,200,${0.6 * E.night})`); g.addColorStop(1, 'rgba(255,245,200,0)');
    ctx.fillStyle = g; ctx.fillRect(x - 8, y - 8, 16, 16);
    ctx.globalCompositeOperation = 'source-over';
  }
  if (G.state === 'play' && P.mode === 'camera') { R.snap2c.clearRect(0, 0, W, H); R.snap2c.drawImage(R.canvas, 0, 0); }
  // song notes and alert marks
  for (const n of G.notes) {
    const a = clamp(n.life / n.max * 1.5, 0, 1), x = Math.round(n.x - camX), y = Math.round(n.y);
    ctx.fillStyle = `rgba(255,248,220,${a})`;
    for (let r = 0; r < 6; r++) for (let c = 0; c < 4; c++) if (NOTE[r][c] === '1') ctx.fillRect(x + c, y + r, 1, 1);
  }
  if (G.state === 'play') for (const b of G.birds) {
    if (b.alert < 0.45 || b.state === 'leave') continue;
    const c = b.center(), x = Math.round(c.x - camX) - 1, y = Math.round(c.y - c.r - 9);
    ctx.fillStyle = 'rgba(20,14,24,0.85)'; ctx.fillRect(x - 1, y - 1, 5, 7);
    drawText(ctx, b.alert > 0.75 ? '!' : '?', x, y, b.alert > 0.75 ? '#ff6a4a' : '#ffd860');
  }
  ctx.drawImage(R.vignette, 0, 0);
  if (G.state === 'play' && P.mode === 'rest') {
    ctx.fillStyle = 'rgba(10,8,20,0.25)'; ctx.fillRect(0, 0, W, H);
    drawText(ctx, 'RESTING... TIME PASSES QUICKLY', W / 2 - textW('RESTING... TIME PASSES QUICKLY') / 2, 24, '#f2e6c8');
  }
  if (G.state === 'play' && P.mode === 'camera') drawViewfinder(ctx);
  if (G.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${G.flash * 0.6})`; ctx.fillRect(0, 0, W, H); }
}

function drawViewfinder(ctx) {
  const ax = Math.round(G.aim.x), ay = Math.round(G.aim.y);
  const vx = clamp(ax - VF.w / 2, 2, W - VF.w - 2), vy = clamp(ay - VF.h / 2, 2, H - VF.h - 2);
  ctx.fillStyle = 'rgba(8,6,14,0.55)';
  ctx.fillRect(0, 0, W, vy); ctx.fillRect(0, vy + VF.h, W, H - vy - VF.h); ctx.fillRect(0, vy, vx, VF.h); ctx.fillRect(vx + VF.w, vy, W - vx - VF.w, VF.h);
  ctx.save();
  ctx.beginPath(); ctx.rect(vx, vy, VF.w, VF.h); ctx.clip();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(R.snap2, ax - VF.w / 4, ay - VF.h / 4, VF.w / 2, VF.h / 2, vx + (ax - VF.w / 2 - vx), vy + (ay - VF.h / 2 - vy), VF.w, VF.h);
  const blur = 1 - G.focus;
  if (blur > 0.05) {
    const s = R.blurC, sx = s.getContext('2d');
    sx.imageSmoothingEnabled = true; sx.clearRect(0, 0, s.width, s.height);
    sx.drawImage(R.snap2, ax - VF.w / 4, ay - VF.h / 4, VF.w / 2, VF.h / 2, 0, 0, VF.w / 5, VF.h / 5);
    ctx.imageSmoothingEnabled = true; ctx.globalAlpha = blur * 0.9;
    ctx.drawImage(s, 0, 0, VF.w / 5, VF.h / 5, vx + (ax - VF.w / 2 - vx), vy + (ay - VF.h / 2 - vy), VF.w, VF.h);
    ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = false;
  }
  ctx.restore();
  // frame brackets
  const fc = '#f4ecd8';
  ctx.fillStyle = fc;
  ctx.fillRect(vx, vy, 10, 1); ctx.fillRect(vx, vy, 1, 10);
  ctx.fillRect(vx + VF.w - 10, vy, 10, 1); ctx.fillRect(vx + VF.w - 1, vy, 1, 10);
  ctx.fillRect(vx, vy + VF.h - 1, 10, 1); ctx.fillRect(vx, vy + VF.h - 10, 1, 10);
  ctx.fillRect(vx + VF.w - 10, vy + VF.h - 1, 10, 1); ctx.fillRect(vx + VF.w - 1, vy + VF.h - 10, 1, 10);
  // reticle: a ring that closes as focus improves
  const rx = ax, ry = ay;
  const focused = G.focus >= 0.99;
  const rc = focused ? '#7dff8a' : G.focusTarget ? '#ffd860' : '#f4ecd8';
  const rr = Math.round(lerp(18, 9, G.focus));
  ctx.fillStyle = rc;
  for (let a = 0; a < 32; a++) { if (a % 4 === 3) continue; const th = a / 32 * TAU; ctx.fillRect(Math.round(rx + Math.cos(th) * rr), Math.round(ry + Math.sin(th) * rr), 1, 1); }
  ctx.fillRect(rx - 3, ry, 2, 1); ctx.fillRect(rx + 2, ry, 2, 1); ctx.fillRect(rx, ry - 3, 1, 2); ctx.fillRect(rx, ry + 2, 1, 2);
  // meters
  const L = G.focusTarget ? lightAt(G.focusTarget.center().x, G.focusTarget.center().y) : lightAt(G.camX + ax, ay);
  const my = vy + VF.h + 4 > H - 12 ? vy - 12 : vy + VF.h + 4;
  ctx.fillStyle = 'rgba(12,10,18,0.8)'; ctx.fillRect(vx, my - 1, VF.w, 10);
  drawText(ctx, 'FOCUS', vx + 3, my + 1, '#f4ecd8');
  ctx.fillStyle = '#3a3440'; ctx.fillRect(vx + 26, my + 2, 34, 3); ctx.fillStyle = focused ? '#7dff8a' : '#ffd860'; ctx.fillRect(vx + 26, my + 2, Math.round(34 * G.focus), 3);
  drawText(ctx, 'LIGHT', vx + 66, my + 1, '#f4ecd8');
  const lc = L < 0.25 ? '#ff6a4a' : L < 0.45 ? '#ffd860' : '#7dff8a';
  ctx.fillStyle = '#3a3440'; ctx.fillRect(vx + 89, my + 2, 34, 3); ctx.fillStyle = lc; ctx.fillRect(vx + 89, my + 2, Math.round(34 * clamp(L, 0, 1)), 3);
  if (G.focusTarget) {
    const sp = G.focusTarget.sp, name = G.found[sp.id] ? sp.name : '???';
    const ty = vy + 4;
    ctx.fillStyle = 'rgba(12,10,18,0.7)'; ctx.fillRect(vx + 3, ty - 1, textW(name) + 4, 7);
    drawText(ctx, name, vx + 5, ty, G.found[sp.id] ? '#f4ecd8' : '#ffd860');
  }
}

// ---------------- UI (HTML overlay) ----------------
const $ = id => document.getElementById(id);
const UI = {
  hudT: 0,
  init() {
    this.stage = $('stage'); this.cv = $('game');
    $('b-guide').onclick = () => this.toggle('guide');
    $('b-map').onclick = () => this.toggle('map');
    $('b-help').onclick = () => this.toggle('help');
    $('b-sound').onclick = () => this.toggleSound();
    $('b-ff').onclick = () => cycleFF();
    this.ffLabel();
    document.querySelectorAll('[data-close]').forEach(b => { b.onclick = () => this.close(); });
    $('t-start').onclick = () => this.start();
    $('t-new').onclick = () => { $('t-confirm').hidden = false; };
    $('t-no').onclick = () => { $('t-confirm').hidden = true; };
    $('t-yes').onclick = () => { G.found = {}; G.hour = 6.3; G.day = 1; G.habId = 'forest'; try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } $('t-confirm').hidden = true; this.refreshTitle(); };
    $('pc-close').onclick = () => this.hidePhoto();
    this.buildGuide();
    this.refreshTitle();
    this.sound();
    const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    G.touch = touch;
    if (touch) this.setupTouch();
    this.fit();
    window.addEventListener('resize', () => this.fit());
  },
  fit() {
    const wrap = $('app'), cs = getComputedStyle(wrap);
    const aw = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const ah = wrap.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    // Fill the screen: the scene keeps its 270-pixel height and the view widens or narrows
    // to match the screen's shape. Very tall (portrait) or ultra-wide screens get thin bars.
    let s = ah / H;
    if (s >= 2 && Math.floor(s) / s > 0.9) s = Math.floor(s);
    let w = clamp(Math.floor(aw / s), W_MIN, W_MAX);
    if (w * s > aw) s = aw / w;
    if (R && w !== W) {
      R.resize(w);
      G.camX = clamp(G.camX, 0, WORLD_W - W);
      G.aim.x = clamp(G.aim.x, 0, W);
    }
    this.stage.style.width = Math.floor(W * s) + 'px'; this.stage.style.height = Math.floor(H * s) + 'px';
    document.documentElement.style.setProperty('--u', s + 'px');
  },
  refreshTitle() {
    const n = foundCount();
    $('t-start').textContent = n > 0 || G.day > 1 ? `Continue (${n} of ${TOTAL} species)` : 'Start birding';
    $('t-new').hidden = !(n > 0 || G.day > 1);
  },
  start() {
    Sound.init(); Sound.setMuted(Sound.muted);
    $('title').hidden = true;
    G.state = 'play';
    if (G.realHour !== undefined) { G.hour = G.realHour; G.realHour = undefined; }
    enterHabitat(G.habId);
    G.hintT = 45;
    this.updateHud(true);
    const intro = G.touch ? 'Hold the arrows to walk. Tap Camera, drag to aim, then Shoot.' : 'Walk with A/D or the arrow keys. Press Space to raise your camera.';
    setTimeout(() => this.toast(foundCount() ? `Welcome back. ${foundCount()} of ${TOTAL} species in your guide.` : intro, 'info'), 400);
  },
  toggle(name) {
    if (G.state !== 'play') return;
    if (G.overlay === name) return this.close();
    this.close(true);
    G.overlay = name;
    $(name).hidden = false;
    if (G.player && G.player.mode === 'camera') toggleCamera(false);
    if (name === 'guide') this.renderGuide();
    if (name === 'map') this.renderMap();
    Sound.blip(660, 0.05, 0.1);
  },
  close(silent) {
    for (const n of ['guide', 'map', 'help']) $(n).hidden = true;
    G.overlay = null; G.keys = {};
    if (!silent) Sound.blip(520, 0.05, 0.08);
  },
  ffLabel() {
    const b = $('b-ff'), sp = FF_SPEEDS[G.ff];
    b.innerHTML = `▶▶ ${sp}×<kbd>X</kbd>`;
    b.setAttribute('aria-label', `Time speed ${sp}×. Click to change.`);
    b.classList.toggle('on', G.ff > 0);
    const t = $('tc-ff'); if (t) t.textContent = `▶▶ ${sp}×`;
    this.updateHud();
  },
  toggleSound() { Sound.init(); Sound.setMuted(!Sound.muted); this.sound(); save(); },
  sound() { $('b-sound').textContent = Sound.muted ? 'Sound off' : 'Sound on'; $('b-sound').setAttribute('aria-pressed', String(!Sound.muted)); },
  tick(dt) { this.hudT -= dt; if (this.hudT <= 0) { this.updateHud(); this.hudT = 0.25; } },
  updateHud() {
    if (!G.hab) return;
    $('hab-name').textContent = G.hab.name;
    const ph = phaseOf(G.hour);
    $('clock').textContent = `Day ${G.day} · ${fmtTime(G.hour)} · ${PHASE_LABEL[ph]}${G.ff ? ` · ${FF_SPEEDS[G.ff]}× speed` : ''}`;
    $('clock').dataset.phase = ph;
    const habFound = SPECIES.filter(s => s.hab === G.habId && G.found[s.id]).length;
    $('count').innerHTML = `<strong>${foundCount()}</strong> / ${TOTAL} species <span>· ${habFound} / 6 here</span>`;
    const P = G.player;
    let hint = '';
    if (P) {
      if (P.mode === 'camera') hint = G.touch ? 'Drag to aim · tap Shoot' : 'Hold steady until the ring turns green, then click or Enter · A/D walk away · Space lowers the camera';
      else if (G.hintT > 0) hint = 'A/D walk · hold Shift to crouch and sneak · Space camera · F headlamp · X fast-forward · G field guide · M map';
      else if (!SPECIES.some(sp => sp.hab === G.habId && speciesActive(sp))) hint = `No birds here are active at ${PHASE_LABEL[phaseOf(G.hour)].toLowerCase()}. Hold T to rest until they return, or open the map (M).`;
      else if (G.E && G.E.night > 0.6 && !P.lamp) hint = 'It\'s dark. Press F for your headlamp. Owls don\'t mind it, but other birds do.';
    }
    $('hint').textContent = hint; $('hint').hidden = !hint || G.touch && P.mode !== 'camera';
  },
  toast(text, kind = 'info') {
    const el = document.createElement('div');
    el.className = 'toast ' + kind; el.textContent = text;
    $('toasts').appendChild(el);
    setTimeout(() => el.classList.add('out'), 4200);
    setTimeout(() => el.remove(), 4800);
  },
  showPhoto(photo, sp, stars, pct, msg, tag) {
    const card = $('photo-card');
    const img = $('pc-img'); img.src = photo.toDataURL('image/png');
    $('pc-stars').innerHTML = [1, 2, 3].map(i => `<span class="${i <= stars ? 'on' : ''}">★</span>`).join('');
    $('pc-stars').setAttribute('aria-label', `${stars} of 3 stars`);
    $('pc-name').textContent = sp ? sp.name : stars === 0 ? 'Not identifiable' : '';
    $('pc-tag').textContent = tag === 'new' ? 'New species' : tag === 'better' ? 'Better photo saved' : '';
    $('pc-tag').hidden = !tag;
    $('pc-score').textContent = pct ? `Score ${pct}` : '';
    $('pc-msg').textContent = msg;
    card.hidden = false; card.classList.remove('pop'); void card.offsetWidth; card.classList.add('pop');
    G.photoCardT = 6;
  },
  hidePhoto() { $('photo-card').hidden = true; G.photoCardT = 0; },
  // ---- field guide ----
  buildGuide() {
    const list = $('g-list');
    list.innerHTML = '';
    for (const hid of HABITAT_ORDER) {
      const sec = document.createElement('div'); sec.className = 'g-sec';
      sec.innerHTML = `<h3>${HAB_INFO[hid].name}</h3>`;
      const grid = document.createElement('div'); grid.className = 'g-grid';
      for (const sp of SPECIES.filter(s => s.hab === hid)) {
        const b = document.createElement('button'); b.className = 'g-item'; b.dataset.id = sp.id; b.id = 'gi-' + sp.id;
        const c = document.createElement('canvas'); c.width = 48; c.height = 48;
        b.appendChild(c);
        const s = document.createElement('span'); b.appendChild(s);
        b.onclick = () => this.showEntry(sp.id);
        grid.appendChild(b);
      }
      sec.appendChild(grid); list.appendChild(sec);
    }
  },
  portrait(canvas, sp, scale, sil) {
    const F = spritesFor(sp), s = F.idle, x = canvas.getContext('2d');
    x.clearRect(0, 0, canvas.width, canvas.height); x.imageSmoothingEnabled = false;
    const k = Math.max(1, Math.min(scale, Math.floor(Math.min(canvas.width / s.w, canvas.height / s.h))));
    const img = sil ? silhouette(s.c, '#3b3428') : s.c;
    x.drawImage(img, Math.floor((canvas.width - s.w * k) / 2), Math.floor((canvas.height - s.h * k) / 2), s.w * k, s.h * k);
  },
  renderGuide() {
    $('g-progress').textContent = `${foundCount()} of ${TOTAL} species photographed`;
    for (const sp of SPECIES) {
      const b = $('gi-' + sp.id), f = G.found[sp.id];
      this.portrait(b.querySelector('canvas'), sp, 3, !f);
      b.querySelector('span').textContent = f ? sp.name : '???';
      b.classList.toggle('found', !!f);
      b.setAttribute('aria-label', f ? sp.name : 'Undiscovered species');
    }
    this.showEntry(this.sel || SPECIES.find(s => s.hab === G.habId).id);
  },
  showEntry(id) {
    this.sel = id;
    const sp = SPECIES_BY_ID[id], f = G.found[id], d = $('g-detail');
    document.querySelectorAll('.g-item').forEach(b => b.classList.toggle('sel', b.dataset.id === id));
    const when = sp.times.map(t => PHASE_LABEL[t]).join(', ');
    const where = sp.perch.map(p => PERCH_LABEL[p] || p).join(', ');
    const rar = sp.rarity >= 0.9 ? 'Common' : sp.rarity >= 0.55 ? 'Uncommon' : 'Rare';
    d.innerHTML = `
      <div class="d-head"><canvas id="d-por" width="144" height="120"></canvas>
        <div><p class="d-hab">${HAB_INFO[sp.hab].name}</p><h2>${f ? sp.name : 'Undiscovered'}</h2>${f ? `<p class="d-sci">${sp.sci}</p>` : ''}
        <p class="d-meta"><span>${rar}</span><span>Active: ${when}</span></p></div></div>
      ${f ? `<p class="d-label">Field marks</p><p>${sp.marks}</p><p class="d-label">Did you know?</p><p>${sp.fact}</p>
        <p class="d-label">Your best photo · ${'★'.repeat(f.stars)}${'☆'.repeat(3 - f.stars)} · score ${f.score}</p>
        <img class="d-photo" src="${f.photo}" alt="Your photo of a ${sp.name}">`
        : `<p class="d-label">Where to look</p><p>${where}. ${sp.nocturnal ? 'Mostly active after dark, so bring your headlamp.' : ''}</p>
        <p class="d-label">Hint</p><p>${sp.marks.split('.')[0]}.</p>`}`;
    this.portrait($('d-por'), sp, 6, !f);
  },
  renderMap() {
    const grid = $('m-grid'); grid.innerHTML = '';
    const n = foundCount();
    for (const id of HABITAT_ORDER) {
      const info = HAB_INFO[id], open = n >= info.need, here = id === G.habId;
      const habFound = SPECIES.filter(s => s.hab === id && G.found[s.id]).length;
      const card = document.createElement('button');
      card.className = 'm-card' + (open ? '' : ' locked') + (here ? ' here' : '');
      card.disabled = !open || here;
      const c = document.createElement('canvas'); c.width = 160; c.height = 90;
      this.habThumb(c, id, open);
      card.appendChild(c);
      const body = document.createElement('div'); body.className = 'm-body';
      body.innerHTML = `<h3>${info.name}</h3><p>${info.blurb}</p><p class="m-stat">${open ? (here ? 'You are here · ' : '') + `${habFound} / 6 species found` : `Locked · photograph ${info.need} species to unlock (${n}/${info.need})`}</p>`;
      card.appendChild(body);
      card.onclick = () => this.travel(id);
      grid.appendChild(card);
    }
  },
  habThumb(c, id, open) {
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
    const g = x.createLinearGradient(0, 0, 0, 90); g.addColorStop(0, '#5a8ad0'); g.addColorStop(1, '#c8def0');
    x.fillStyle = g; x.fillRect(0, 0, 160, 90);
    const hab = HAB_CACHE[id];
    if (hab) {
      const sx = clamp(hab.spawnX - 240, 0, WORLD_W - 480);
      for (const [k, f] of [['far', PAR.far], ['mid', PAR.mid], ['near', 1]]) x.drawImage(hab.layers[k], Math.round(sx * f), 0, 480, H, 0, 0, 160, 90);
    }
    if (!open) { x.fillStyle = 'rgba(30,26,20,0.65)'; x.fillRect(0, 0, 160, 90); }
  },
  travel(id) {
    if (id === G.habId) return;
    this.close(true);
    const fade = $('fade');
    fade.classList.add('on');
    setTimeout(() => {
      enterHabitat(id);
      save();
      fade.classList.remove('on');
      this.toast(`${HAB_INFO[id].name}`, 'info');
    }, 380);
  },
  touchMode() {
    if (!G.touch) return;
    const cam = G.player && G.player.mode === 'camera';
    $('tc-shoot').hidden = !cam;
    $('tc-cam').textContent = cam ? 'Lower' : 'Camera';
    $('tc-left').hidden = cam; $('tc-right').hidden = cam;
  },
  setupTouch() {
    $('touch').hidden = false;
    const hold = (id, key) => {
      const el = $(id);
      const on = e => { e.preventDefault(); Sound.init(); G.tkeys[key] = true; };
      const off = e => { e.preventDefault(); G.tkeys[key] = false; };
      el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off); el.addEventListener('pointerleave', off); el.addEventListener('pointercancel', off);
    };
    hold('tc-left', 'left'); hold('tc-right', 'right');
    $('tc-cam').onclick = () => toggleCamera();
    $('tc-lamp').onclick = () => { if (G.player) G.player.lamp = !G.player.lamp; };
    $('tc-ff').onclick = () => cycleFF();
    hold('tc-crouch', 'sneak');
    $('tc-shoot').onclick = () => shoot();
    this.touchMode();
  },
};
const PERCH_LABEL = { branch: 'tree branches', ground: 'on the ground', trunk: 'clinging to trunks', reed: 'cattail tops', post: 'posts and pilings', wade: 'wading in shallow water', water: 'swimming on open water', cliff: 'cliff ledges', rock: 'rocks and boulders', sky: 'soaring overhead', beach: 'along the beach', cactus: 'saguaro tops and arms', burrow: 'at burrow entrances', flower: 'hovering at ocotillo flowers', treetop: 'treetops', snow: 'on snowfields', streamrock: 'rocks in the stream', canopy: 'high canopy branches', flowerperch: 'heliconia flowers' };

// ---------------- pointer ----------------
function setupPointer() {
  const cv = $('game');
  const toGame = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; };
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointermove', e => {
    const p = toGame(e); G.mouseIn = e.pointerType === 'mouse';
    if (G.player && G.player.mode === 'camera') { G.aim.x = clamp(p.x, 0, W); G.aim.y = clamp(p.y, 0, H); }
  });
  cv.addEventListener('pointerdown', e => {
    Sound.init();
    if (G.state !== 'play' || G.overlay) return;
    const p = toGame(e);
    if (e.button === 2) { toggleCamera(); if (G.player.mode === 'camera') { G.aim.x = p.x; G.aim.y = p.y; } return; }
    if (e.pointerType !== 'mouse') { if (G.player.mode === 'camera') { G.aim.x = p.x; G.aim.y = p.y; } return; }
    if (G.player.mode !== 'camera') { toggleCamera(true); G.aim.x = p.x; G.aim.y = p.y; }
    else shoot();
  });
}

// ---------------- boot ----------------
function boot(hotData) {
  R = new Renderer($('game'));
  PSPR = buildPlayerSprites();
  load();
  if (hotData && hotData.save) { try { const d = hotData.save; G.found = d.found || G.found; G.habId = d.hab || G.habId; G.hour = d.hour || G.hour; G.day = d.day || G.day; } catch (e) { /* ignore */ } }
  for (const sp of SPECIES) spritesFor(sp);
  // title scene: the forest at dawn; the saved time of day is restored when play starts
  G.realHour = G.hour; G.hour = 6.6;
  G.hab = getHabitat('forest');
  for (let i = 0; i < 4; i++) trySpawn(true);
  UI.init();
  setupPointer();
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => { G.keys = {}; G.tkeys = {}; });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { save(); if (G.state === 'play' && !G.overlay) UI.toggle('help'); } });
  window.addEventListener('beforeunload', save);
  if (window.claude && window.claude.hot && window.claude.hot.snapshot) window.claude.hot.snapshot(() => ({ save: { found: G.found, hab: G.habId, hour: G.hour, day: G.day } }));
  // pre-generate the other habitats in the background so travel is instant
  const rest = HABITAT_ORDER.filter(h => h !== 'forest');
  const next = () => { const id = rest.shift(); if (!id) return; getHabitat(id); setTimeout(next, 60); };
  setTimeout(next, 300);
  let last = performance.now();
  const frame = now => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    try { update(dt); draw(); } catch (err) { console.error(err); }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  window.__fieldmark = G;
}
