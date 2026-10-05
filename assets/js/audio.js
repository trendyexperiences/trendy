/* =========================================================================
   Trendy Experiences — sonido del antro, sintetizado en vivo (Web Audio)
   Un groove house tropical a 122 BPM. Un filtro pasa-bajos simula estar
   afuera del club: el sonido se abre conforme entras en la sección "Zonas".
   ========================================================================= */
(function () {
  'use strict';

  const BPM = 122;
  const STEP = 60 / BPM / 4; // semicorchea
  const LOOKAHEAD = 0.12;

  // Progresión: Am9 · Fmaj7 · Cmaj7 · Em7
  const CHORDS = [
    [57, 60, 64, 67, 71],
    [53, 57, 60, 64],
    [48, 55, 59, 64],
    [52, 55, 59, 62],
  ];
  const ROOTS = [33, 29, 36, 28];
  const ARP = [0, 3, 6, 8, 11, 14];

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  const ClubAudio = {
    ctx: null,
    running: false,
    openness: 0,
    _step: 0,
    _next: 0,
    _start: 0,
    _timer: null,

    init() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      const ctx = (this.ctx = new AC());

      this.master = ctx.createGain();
      this.master.gain.value = 0;
      this.filter = ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = 320;
      this.filter.Q.value = 0.9;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 4;
      this.bus = ctx.createGain();
      this.bus.gain.value = 0.9;

      // Reverb corta: un cuarto con paredes de concreto
      this.verb = ctx.createConvolver();
      this.verb.buffer = this._impulse(1.8, 2.6);
      this.verbSend = ctx.createGain();
      this.verbSend.gain.value = 0.22;

      this.bus.connect(this.filter);
      this.verbSend.connect(this.verb);
      this.verb.connect(this.filter);
      this.filter.connect(comp);
      comp.connect(this.master);
      this.master.connect(ctx.destination);

      this.noise = this._noise();
      return true;
    },

    _noise() {
      const ctx = this.ctx;
      const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      return buf;
    },

    _impulse(seconds, decay) {
      const ctx = this.ctx;
      const len = Math.floor(ctx.sampleRate * seconds);
      const buf = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
      return buf;
    },

    _env(gainNode, t, peak, attack, decay) {
      const g = gainNode.gain;
      g.setValueAtTime(0.0001, t);
      g.exponentialRampToValueAtTime(peak, t + attack);
      g.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    },

    kick(t) {
      const ctx = this.ctx;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(44, t + 0.12);
      this._env(g, t, 1.0, 0.003, 0.42);
      o.connect(g).connect(this.bus);
      o.start(t);
      o.stop(t + 0.5);
    },

    hat(t, open) {
      const ctx = this.ctx;
      const s = ctx.createBufferSource();
      s.buffer = this.noise;
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 7500;
      const g = ctx.createGain();
      this._env(g, t, open ? 0.16 : 0.06, 0.002, open ? 0.16 : 0.04);
      s.connect(f).connect(g).connect(this.bus);
      s.start(t, Math.random() * 0.5);
      s.stop(t + 0.25);
    },

    clap(t) {
      const ctx = this.ctx;
      const s = ctx.createBufferSource();
      s.buffer = this.noise;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1500;
      f.Q.value = 0.8;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      [0, 0.011, 0.022].forEach((d) => {
        g.gain.setValueAtTime(0.32, t + d);
        g.gain.exponentialRampToValueAtTime(0.03, t + d + 0.01);
      });
      g.gain.setValueAtTime(0.28, t + 0.033);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
      s.connect(f).connect(g);
      g.connect(this.bus);
      g.connect(this.verbSend);
      s.start(t, Math.random() * 0.5);
      s.stop(t + 0.3);
    },

    bass(t, midi) {
      const ctx = this.ctx;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = mtof(midi);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.Q.value = 6;
      f.frequency.setValueAtTime(900, t);
      f.frequency.exponentialRampToValueAtTime(140, t + 0.2);
      const g = ctx.createGain();
      this._env(g, t, 0.3, 0.005, 0.24);
      o.connect(f).connect(g).connect(this.bus);
      o.start(t);
      o.stop(t + 0.3);
    },

    pad(t, notes, dur) {
      const ctx = this.ctx;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1400;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.045, t + 0.35);
      g.gain.setValueAtTime(0.045, t + dur - 0.3);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      f.connect(g);
      g.connect(this.bus);
      g.connect(this.verbSend);
      notes.forEach((n) => {
        [-7, 7].forEach((det) => {
          const o = ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = mtof(n);
          o.detune.value = det;
          o.connect(f);
          o.start(t);
          o.stop(t + dur + 0.05);
        });
      });
    },

    // Marimba tropical
    pluck(t, midi) {
      const ctx = this.ctx;
      const o = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      o.type = 'sine';
      o2.type = 'sine';
      o.frequency.value = mtof(midi);
      o2.frequency.value = mtof(midi) * 4.01;
      const g = ctx.createGain();
      const g2 = ctx.createGain();
      this._env(g, t, 0.11, 0.002, 0.32);
      this._env(g2, t, 0.03, 0.001, 0.06);
      o.connect(g);
      o2.connect(g2);
      g2.connect(g);
      g.connect(this.bus);
      g.connect(this.verbSend);
      o.start(t);
      o2.start(t);
      o.stop(t + 0.4);
      o2.stop(t + 0.4);
    },

    _schedule(step, t) {
      const s = step % 16;
      const bar = Math.floor(step / 16) % 4;
      if (s % 4 === 0) this.kick(t);
      if (s === 4 || s === 12) this.clap(t);
      if (s % 4 === 2) this.hat(t, true);
      else if (s % 2 === 1) this.hat(t, false);
      if (s === 2 || s === 6 || s === 10 || s === 14 || s === 15) {
        this.bass(t, ROOTS[bar] + (s === 15 ? 12 : 0));
      }
      if (s === 0) this.pad(t, CHORDS[bar], STEP * 16);
      const ai = ARP.indexOf(s);
      if (ai !== -1) {
        const chord = CHORDS[bar];
        this.pluck(t, chord[(ai + bar) % chord.length] + 12);
      }
    },

    _tick() {
      const ctx = this.ctx;
      while (this._next < ctx.currentTime + LOOKAHEAD) {
        this._schedule(this._step, this._next);
        this._next += STEP;
        this._step++;
      }
    },

    phase() {
      if (!this.ctx) return 0;
      const beats = ((this.ctx.currentTime - this._start) / (60 / BPM)) % 1;
      return beats < 0 ? beats + 1 : beats;
    },

    async start() {
      if (!this.ctx && !this.init()) return false;
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      const now = this.ctx.currentTime;
      if (!this._timer) {
        this._step = 0;
        this._start = now + 0.06;
        this._next = this._start;
        this._timer = setInterval(() => this._tick(), 25);
      }
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(0.7, now + 1.6);
      this.running = true;
      this.setOpenness(this.openness, true);
      return true;
    },

    stop() {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(0, now + 0.5);
      this.running = false;
      setTimeout(() => {
        if (this.running) return;
        clearInterval(this._timer);
        this._timer = null;
        this.ctx.suspend();
      }, 600);
    },

    // Golpe de entrada: bajo profundo + barrido de aire, sin pasar por el filtro
    sting() {
      if (!this.ctx) return;
      const ctx = this.ctx;
      const t = ctx.currentTime + 0.02;
      const out = ctx.createGain();
      out.gain.value = 0.9;
      out.connect(ctx.destination);
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(90, t);
      o.frequency.exponentialRampToValueAtTime(28, t + 1.4);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.9, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 1.9);
      const n = ctx.createBufferSource();
      n.buffer = this.noise;
      n.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 1.2;
      f.frequency.setValueAtTime(6000, t);
      f.frequency.exponentialRampToValueAtTime(300, t + 1.2);
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, t);
      ng.gain.exponentialRampToValueAtTime(0.25, t + 0.05);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
      n.connect(f).connect(ng).connect(out);
      n.start(t);
      n.stop(t + 1.4);
    },

    // Sonidos de interfaz: un "tic" de cristal al pasar y un golpe suave al hacer clic
    blip(kind) {
      if (!this.ctx || !this.running) return;
      const ctx = this.ctx;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = kind === 'click' ? 'triangle' : 'sine';
      const f0 = kind === 'click' ? 520 : 1500 + Math.random() * 500;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f0 * (kind === 'click' ? 0.5 : 1.5), t + 0.08);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(kind === 'click' ? 0.12 : 0.035, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'click' ? 0.18 : 0.09));
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.2);
    },

    // 0 = afuera (apagado, sólo el bombo atraviesa la pared) · 1 = en la pista
    setOpenness(x, force) {
      x = Math.max(0, Math.min(1, x));
      if (!force && Math.abs(x - this.openness) < 0.005) return;
      this.openness = x;
      if (!this.ctx) return;
      const freq = 320 * Math.pow(56, x);
      this.filter.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.12);
    },
  };

  window.ClubAudio = ClubAudio;
})();
