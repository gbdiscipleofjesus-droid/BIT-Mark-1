'use strict';
// ---------------------------------------------------------------------------
// Audio sintetizado (WebAudio): efectos y música chiptune original
// ---------------------------------------------------------------------------
const NOTE_IDX = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
function noteFreq(n) {
  const m = /^([A-G][#b]?)(\d)$/.exec(n);
  if (!m) return 0;
  const midi = NOTE_IDX[m[1]] + (parseInt(m[2], 10) + 1) * 12;
  return 440 * Math.pow(2, (midi - 69) / 12);
}
const CHORDS = {
  Dm: ['D', 'F', 'A'], Bb: ['Bb', 'D', 'F'], C: ['C', 'E', 'G'], A: ['A', 'C#', 'E'], F: ['F', 'A', 'C'],
  Gm: ['G', 'Bb', 'D'], Am: ['A', 'C', 'E'], Em: ['E', 'G', 'B'], G: ['G', 'B', 'D'], D: ['D', 'F#', 'A'],
  Eb: ['Eb', 'G', 'Bb'], Cm: ['C', 'Eb', 'G'], Fm: ['F', 'Ab', 'C'], Ab: ['Ab', 'C', 'Eb'], E: ['E', 'G#', 'B'],
  Bm: ['B', 'D', 'F#'],
};

// Pistas originales. lead: "nota:duración" en semicorcheas; '.' = silencio
const TRACKS = {
  title: {
    bpm: 112, chords: ['Dm', 'Bb', 'C', 'A', 'Dm', 'Bb', 'Gm', 'A'],
    bass: 'x...x.x.x...x.x.', arp: true, drums: { k: 'x.......x.......', s: '....x.......x...', h: '..x...x...x...x.' },
    lead: 'D5:4 F5:2 A5:6 G5:2 F5:2 | F5:4 D5:2 Bb4:6 C5:4 | E5:4 G5:2 C6:6 Bb5:2 A5:2 | A5:12 .:4 | ' +
      'D5:4 F5:2 A5:6 D6:4 | D6:2 C6:2 Bb5:4 F5:8 | G5:4 Bb5:4 D6:4 C6:2 Bb5:2 | A5:8 C#5:4 E5:4',
  },
  city: {
    bpm: 132, chords: ['G', 'Em', 'C', 'D', 'G', 'Em', 'Am', 'D'],
    bass: 'x..x..x.x..x..x.', arp: false, drums: { k: 'x...x...x...x...', s: '....x.......x..x', h: 'x.x.x.x.x.x.x.x.' },
    lead: 'B4:2 D5:2 G5:4 F#5:2 G5:2 A5:4 | G5:2 E5:2 B4:4 .:4 E5:4 | C5:2 E5:2 G5:4 A5:2 G5:2 E5:4 | F#5:6 A5:2 D5:8 | ' +
      'B4:2 D5:2 G5:4 B5:4 A5:4 | G5:2 E5:2 G5:4 B5:8 | A5:2 C6:2 E5:4 D5:2 C5:2 A4:4 | D5:4 F#5:4 A5:8',
  },
  action: {
    bpm: 142, chords: ['Em', 'C', 'D', 'Bm', 'Em', 'C', 'Am', 'B'],
    bass: 'x.xx.xx.x.xx.xx.', arp: true, drums: { k: 'x..x..x.x..x..x.', s: '....x.......x...', h: 'xxxxxxxxxxxxxxxx' },
    lead: 'E5:2 .:2 E5:2 G5:2 B5:4 A5:4 | G5:4 E5:4 C5:8 | D5:2 .:2 D5:2 F#5:2 A5:4 G5:4 | F#5:8 B4:8 | ' +
      'E5:2 G5:2 B5:4 E6:4 D6:4 | C6:4 B5:4 G5:8 | A5:4 C6:4 E5:4 A5:4 | B5:6 A5:2 G5:4 F#5:4',
  },
  boss: {
    bpm: 156, chords: ['Cm', 'Cm', 'Ab', 'Bb', 'Cm', 'Cm', 'Fm', 'G'],
    bass: 'xxxxxxxxxxxxxxxx', arp: true, drums: { k: 'x.x.x.x.x.x.x.x.', s: '....x.......x.xx', h: 'x.xxx.xxx.xxx.xx' },
    lead: 'C5:2 Eb5:2 G5:2 C6:2 B5:4 G5:4 | C6:2 Bb5:2 Ab5:2 G5:2 Eb5:8 | Ab5:4 G5:4 F5:4 Eb5:4 | F5:4 G5:4 Bb5:8 | ' +
      'C6:2 .:2 C6:2 Eb6:2 D6:4 C6:4 | G5:8 Eb5:8 | F5:4 Ab5:4 C6:4 Ab5:4 | B5:8 D6:4 G5:4',
  },
  sad: {
    bpm: 84, chords: ['Am', 'F', 'C', 'G', 'Am', 'F', 'C', 'E'],
    bass: 'x.......x.......', arp: true, drums: null,
    lead: 'E5:8 C5:4 D5:4 | A4:16 | G4:4 C5:4 E5:4 G5:4 | D5:16 | E5:8 C5:4 A5:4 | F5:12 E5:4 | E5:4 D5:4 C5:4 D5:4 | B4:16',
  },
};

const Audio2 = {
  ctx: null, master: null, musicGain: null, sfxGain: null, noiseBuf: null,
  musicVol: 0.6, sfxVol: 0.8,
  track: null, trackName: '', step: 0, nextTime: 0, timer: null, events: null,
  lastPlay: {},

  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain(); this.master.gain.value = 0.7; this.master.connect(this.ctx.destination);
        this.musicGain = this.ctx.createGain(); this.musicGain.connect(this.master);
        this.sfxGain = this.ctx.createGain(); this.sfxGain.connect(this.master);
        this.applyVolumes();
        const len = this.ctx.sampleRate;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.timer = setInterval(() => this.schedule(), 25);
        if (this.pendingTrack) { const t = this.pendingTrack; this.pendingTrack = null; this.music(t); }
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    } catch (e) { this.ctx = null; }
  },

  ready() { return !!(this.ctx && this.ctx.state === 'running'); },

  applyVolumes() {
    if (!this.ctx) return;
    this.musicGain.gain.value = this.musicVol * 0.5;
    this.sfxGain.gain.value = this.sfxVol;
  },

  // ---------------- Música ----------------
  music(name) {
    if (!this.ctx) { this.pendingTrack = name; return; }
    if (this.trackName === name) return;
    this.trackName = name;
    this.track = name ? this.compile(TRACKS[name]) : null;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.08;
  },

  compile(def) {
    if (!def) return null;
    const bars = def.chords.length;
    const steps = bars * 16;
    const lead = new Array(steps).fill(null);
    let pos = 0;
    def.lead.split(/\s+/).forEach((tok) => {
      if (!tok || tok === '|') return;
      const [n, d] = tok.split(':');
      const dur = parseInt(d, 10) || 1;
      if (n !== '.' && pos < steps) lead[pos] = { f: noteFreq(n), d: dur };
      pos += dur;
    });
    return { def, steps, lead, stepDur: 60 / def.bpm / 4 };
  },

  schedule() {
    if (!this.ctx || !this.track || this.ctx.state !== 'running') return;
    const t = this.track;
    // si nos quedamos atrás (pestaña en segundo plano), reajusta
    if (this.nextTime < this.ctx.currentTime - 0.2) this.nextTime = this.ctx.currentTime + 0.05;
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      this.playStep(t, this.step, this.nextTime);
      this.nextTime += t.stepDur;
      this.step = (this.step + 1) % t.steps;
    }
  },

  playStep(t, step, time) {
    const def = t.def;
    const bar = Math.floor(step / 16), s = step % 16;
    const chord = CHORDS[def.chords[bar]] || CHORDS.C;
    const sd = t.stepDur;
    const ln = t.lead[step];
    if (ln) this.tone('square', ln.f, time, ln.d * sd * 0.92, 0.1, this.musicGain, 0.02);
    if (def.bass[s] === 'x') this.tone('triangle', noteFreq(chord[0] + '2'), time, sd * 1.6, 0.32, this.musicGain, 0.01);
    if (def.arp && s % 2 === 0) {
      const n = chord[(s / 2) % 3];
      this.tone('square', noteFreq(n + '4'), time, sd * 0.8, 0.035, this.musicGain, 0.005);
    }
    if (def.drums) {
      if (def.drums.k[s] === 'x') this.kick(time);
      if (def.drums.s[s] === 'x') this.noise(time, 0.1, 0.12, 1800, 'bandpass', this.musicGain);
      if (def.drums.h[s] === 'x') this.noise(time, 0.03, 0.04, 8000, 'highpass', this.musicGain);
    }
  },

  // ---------------- Primitivas ----------------
  tone(type, freq, time, dur, vol, dest, attack = 0.005, freqEnd = null) {
    if (!this.ctx || !freq) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, time);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), time + dur);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(vol, time + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    o.connect(g); g.connect(dest || this.sfxGain);
    o.start(time); o.stop(time + dur + 0.02);
  },

  noise(time, dur, vol, freq, ftype, dest, freqEnd = null) {
    if (!this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = ftype || 'lowpass';
    f.frequency.setValueAtTime(freq, time);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), time + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    src.connect(f); f.connect(g); g.connect(dest || this.sfxGain);
    src.start(time, Math.random() * 0.5); src.stop(time + dur + 0.02);
  },

  kick(time) {
    this.tone('sine', 150, time, 0.14, 0.5, this.musicGain, 0.002, 40);
  },

  // ---------------- Efectos ----------------
  sfx(name) {
    if (!this.ready()) return;
    const now = this.ctx.currentTime;
    if (this.lastPlay[name] && now - this.lastPlay[name] < 0.035) return;
    this.lastPlay[name] = now;
    const T = now + 0.005;
    switch (name) {
      case 'jump': this.tone('square', 260, T, 0.12, 0.12, null, 0.005, 560); break;
      case 'land': this.noise(T, 0.06, 0.15, 500, 'lowpass'); break;
      case 'punch': this.noise(T, 0.07, 0.35, 1400, 'lowpass'); this.tone('sine', 140, T, 0.08, 0.3, null, 0.002, 60); break;
      case 'heavy': this.noise(T, 0.16, 0.45, 900, 'lowpass'); this.tone('square', 110, T, 0.14, 0.18, null, 0.002, 45); break;
      case 'thwip': this.noise(T, 0.13, 0.28, 3200, 'bandpass', null, 900); break;
      case 'webhit': this.tone('triangle', 700, T, 0.1, 0.2, null, 0.003, 280); break;
      case 'hurt': this.tone('square', 420, T, 0.25, 0.18, null, 0.003, 110); this.noise(T, 0.1, 0.2, 700, 'lowpass'); break;
      case 'ko': this.tone('square', 320, T, 0.4, 0.14, null, 0.003, 50); this.noise(T, 0.25, 0.25, 600, 'lowpass'); break;
      case 'coin': this.tone('square', 988, T, 0.06, 0.1); this.tone('square', 1319, T + 0.06, 0.18, 0.1); break;
      case 'menu': this.tone('square', 660, T, 0.04, 0.08); break;
      case 'select': this.tone('square', 880, T, 0.1, 0.1, null, 0.003, 1320); break;
      case 'back': this.tone('square', 520, T, 0.08, 0.08, null, 0.003, 330); break;
      case 'explode': this.noise(T, 0.7, 0.6, 1400, 'lowpass', null, 80); this.tone('sine', 90, T, 0.5, 0.4, null, 0.002, 30); break;
      case 'zap':
        for (let i = 0; i < 4; i++) this.tone('sawtooth', rand(300, 1400), T + i * 0.04, 0.05, 0.08);
        break;
      case 'shoot': this.noise(T, 0.05, 0.25, 3000, 'highpass'); this.tone('square', 900, T, 0.08, 0.08, null, 0.002, 200); break;
      case 'laser': this.tone('square', 1400, T, 0.18, 0.08, null, 0.002, 300); break;
      case 'roar': this.tone('sawtooth', 110, T, 0.7, 0.2, null, 0.05, 55); this.noise(T, 0.6, 0.2, 400, 'lowpass'); break;
      case 'sense': this.tone('sine', 1500, T, 0.05, 0.07); this.tone('sine', 1900, T + 0.06, 0.05, 0.07); break;
      case 'heal': [523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, T + i * 0.06, 0.12, 0.12)); break;
      case 'dodge': this.noise(T, 0.16, 0.2, 1200, 'bandpass', null, 3000); break;
      case 'whoosh': this.noise(T, 0.2, 0.14, 600, 'bandpass', null, 1800); break;
      case 'special': this.tone('sawtooth', 200, T, 0.4, 0.12, null, 0.01, 1600); this.noise(T, 0.4, 0.2, 2000, 'bandpass'); break;
      case 'alert': this.tone('square', 880, T, 0.08, 0.08); this.tone('square', 660, T + 0.1, 0.08, 0.08); break;
      case 'win': [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone('square', f, T + i * 0.09, 0.14, 0.1)); break;
      case 'fail': [392, 330, 262].forEach((f, i) => this.tone('square', f, T + i * 0.14, 0.2, 0.1)); break;
      case 'type': this.tone('square', 1200, T, 0.015, 0.03); break;
      case 'step': this.noise(T, 0.03, 0.05, 400, 'lowpass'); break;
      default: break;
    }
  },
};
