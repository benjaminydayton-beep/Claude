'use strict';
// ============ synthesized audio (no sound files) ============
const Sound = {
  ctx: null, master: null, birdBus: null, ambBus: null, muted: false, amb: {},
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.7; this.master.connect(c.destination);
    this.birdBus = c.createGain(); this.birdBus.gain.value = 0.8; this.birdBus.connect(this.master);
    this.ambBus = c.createGain(); this.ambBus.gain.value = 0.55; this.ambBus.connect(this.master);
    const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    const loop = (type, f, q) => {
      const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
      const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const g = c.createGain(); g.gain.value = 0;
      src.connect(fl); fl.connect(g); g.connect(this.ambBus); src.start();
      return g;
    };
    this.amb.wind = loop('lowpass', 380, 0.7);
    this.amb.water = loop('bandpass', 700, 0.8);
    this.amb.surf = loop('lowpass', 900, 0.5);
    this.amb.rain = loop('highpass', 1800, 0.5);
    this.amb.creek = loop('bandpass', 1500, 0.6);
    this.amb.fire = loop('bandpass', 2600, 0.9);
  },
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.05); },
  setAmb(name, v) { const g = this.amb[name]; if (g) g.gain.setTargetAtTime(clamp(v, 0, 1), this.ctx.currentTime, 0.4); },
  out(vol, pan) {
    const c = this.ctx, g = c.createGain(); g.gain.value = vol;
    if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); g.connect(p); p.connect(this.birdBus); }
    else g.connect(this.birdBus);
    return g;
  },
  // play a species call; returns its duration in seconds
  call(notes, vol, pan) {
    if (!notes) return 0;
    let dur = 0;
    for (const n of notes) dur += n[3] + n[4];
    if (!this.ctx || this.muted || vol < 0.02) return dur;
    const c = this.ctx, out = this.out(vol, pan);
    let t = c.currentTime + 0.02;
    for (const [type, f0, f1, d, gap, v] of notes) { this.note(type, f0, f1, d, v, t, out); t += d + gap; }
    setTimeout(() => { try { out.disconnect(); } catch (e) { /* already gone */ } }, (dur + 0.6) * 1000);
    return dur;
  },
  note(type, f0, f1, d, v, t, out) {
    const c = this.ctx, g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    const atk = type === 't' ? 0.04 : 0.008;
    g.gain.exponentialRampToValueAtTime(v, t + atk);
    g.gain.setValueAtTime(v, t + Math.max(atk, d - 0.03));
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    g.connect(out);
    const end = t + d + 0.02;
    if (type === 'n') {
      const src = c.createBufferSource(); src.buffer = this.noise;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(f0, t); bp.frequency.linearRampToValueAtTime(f1, t + d); bp.Q.value = 6;
      const am = c.createGain(); am.gain.value = 0;
      if (d > 0.15) { // buzzy trill: amplitude-modulate the noise
        const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 38;
        const lg = c.createGain(); lg.gain.value = 0.5; lfo.connect(lg); lg.connect(am.gain); am.gain.value = 0.5;
        lfo.start(t); lfo.stop(end);
      } else am.gain.value = 1;
      src.connect(bp); bp.connect(am); am.connect(g);
      src.start(t, Math.random()); src.stop(end);
      return;
    }
    const o = c.createOscillator();
    o.type = type === 'h' ? 'sawtooth' : type === 'q' ? 'sawtooth' : type === 't' ? 'triangle' : 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + d);
    if (type === 'h' || type === 'q') {
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = type === 'q' ? 1100 : f0 * 1.6; bp.Q.value = type === 'q' ? 2.2 : 3;
      o.connect(bp); bp.connect(g);
      const o2 = c.createOscillator(); o2.type = 'square'; o2.frequency.setValueAtTime(f0 * 1.01, t); o2.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * 1.01), t + d);
      const g2 = c.createGain(); g2.gain.value = 0.35; o2.connect(g2); g2.connect(bp); o2.start(t); o2.stop(end);
    } else if (type === 't') {
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; o.connect(lp); lp.connect(g);
    } else o.connect(g);
    o.start(t); o.stop(end);
  },
  shutter() {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, out = this.out(0.5, 0);
    for (const [dt, f] of [[0, 3200], [0.07, 2200]]) {
      const src = c.createBufferSource(); src.buffer = this.noise;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 1.5;
      const g = c.createGain(), t = c.currentTime + dt;
      g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
      src.connect(bp); bp.connect(g); g.connect(out); src.start(t, Math.random()); src.stop(t + 0.06);
    }
  },
  blip(f = 880, d = 0.08, v = 0.2) { if (!this.ctx || this.muted) return; const out = this.out(v, 0); this.note('s', f, f * 1.5, d, 0.6, this.ctx.currentTime + 0.01, out); },
  fanfare() { if (!this.ctx || this.muted) return; const out = this.out(0.25, 0); let t = this.ctx.currentTime + 0.02; for (const f of [784, 988, 1175, 1568]) { this.note('s', f, f, 0.12, 0.5, t, out); t += 0.1; } },
  cricket(vol, pan) { if (!this.ctx || this.muted || vol < 0.02) return; const out = this.out(vol, pan); let t = this.ctx.currentTime + 0.01; for (let i = 0; i < 3; i++) { this.note('s', 4700, 4650, 0.035, 0.25, t, out); t += 0.06; } },
  frog(vol, pan) { if (!this.ctx || this.muted || vol < 0.02) return; const out = this.out(vol, pan); const t = this.ctx.currentTime + 0.01; this.note('q', 210, 150, 0.12, 0.5, t, out); this.note('q', 230, 160, 0.14, 0.5, t + 0.16, out); },
  drum(vol, pan) { if (!this.ctx || this.muted || vol < 0.02) return; const out = this.out(vol, pan); let t = this.ctx.currentTime + 0.01; for (let i = 0; i < 14; i++) { this.note('n', 900, 700, 0.02, 1, t, out); t += 0.045; } },
};
