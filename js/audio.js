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
  Bm: ['B', 'D', 'F#'], B: ['B', 'D#', 'F#'], 'F#m': ['F#', 'A', 'C#'],
};

// Pistas originales. lead: "nota:duración" en semicorcheas; '.' = silencio
const TRACKS = {
  // Temas heroicos originales con aire de dibujo animado arácnido de los 60:
  // metales (brass), acordes de golpe (stabs) y bajo caminante (walk).
  title: {
    bpm: 138, lead2: 'brass', walk: true, stabs: '..x...x...x..x..',
    chords: ['Em', 'Em', 'C', 'B', 'Em', 'Em', 'Am', 'B'],
    drums: { k: 'x.....x...x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.xx' },
    lead: 'E5:3 G5:1 B5:4 A#5:2 A5:2 G5:4 | E5:2 F#5:2 G5:2 A5:2 B5:8 | C6:3 B5:1 A5:4 G5:2 F#5:2 E5:4 | D#5:4 F#5:4 B5:8 | ' +
      'E5:3 G5:1 B5:4 D6:4 C#6:2 C6:2 | B5:4 G5:4 E5:8 | A5:3 C6:1 E6:4 D6:2 C6:2 B5:2 A5:2 | B5:4 D#6:4 E6:8',
  },
  city: {
    bpm: 144, lead2: 'brass', walk: true, stabs: '...x...x...x..x.',
    chords: ['Gm', 'Gm', 'Eb', 'D', 'Gm', 'Gm', 'Cm', 'D'],
    drums: { k: 'x.......x.......', s: '....x.......x..x', h: 'x..xx..xx..xx..x' },
    lead: 'G4:2 A#4:2 D5:2 G5:4 F#5:2 G5:2 D5:2 | D#5:4 D5:4 A#4:8 | G4:2 A#4:2 D5:2 G5:2 A#5:4 A5:2 G5:2 | F#5:8 D5:8 | ' +
      'G5:2 G5:2 F5:2 D#5:2 D5:4 A#4:4 | C5:2 D5:2 D#5:4 G5:8 | C6:3 A#5:1 A5:4 G5:2 F#5:2 D#5:4 | D5:4 F#5:4 A5:8',
  },
  action: {
    bpm: 152, lead2: 'brass', walk: true, stabs: 'x..x..x...x..x..', arp: true,
    chords: ['Am', 'Am', 'F', 'E', 'Am', 'Am', 'Dm', 'E'],
    drums: { k: 'x..x..x.x..x..x.', s: '....x.......x...', h: 'xxxxxxxxxxxxxxxx' },
    lead: 'A4:2 C5:2 E5:2 A5:2 G#5:2 A5:2 B5:2 C6:2 | B5:4 A5:4 E5:8 | F5:2 A5:2 C6:2 F6:2 E6:2 D6:2 C6:2 A5:2 | G#5:8 E5:4 B4:4 | ' +
      'A5:3 A5:1 C6:2 A5:2 E5:4 A4:4 | C5:2 D5:2 E5:4 A5:8 | D6:3 C6:1 A5:2 F5:2 D5:4 F5:4 | E5:4 G#5:4 B5:4 E6:4',
  },
  boss: {
    bpm: 160, lead2: 'brass', stabs: 'x.x...x.x...x.x.', arp: true, bass: 'xxxxxxxxxxxxxxxx',
    chords: ['Cm', 'Cm', 'Ab', 'Bb', 'Cm', 'Cm', 'Fm', 'G'],
    drums: { k: 'x.x.x.x.x.x.x.x.', s: '....x.......x.xx', h: 'x.xxx.xxx.xxx.xx' },
    lead: 'C5:2 Eb5:2 G5:2 C6:2 B5:4 G5:4 | C6:2 Bb5:2 Ab5:2 G5:2 Eb5:8 | Ab5:4 G5:4 F5:4 Eb5:4 | F5:4 G5:4 Bb5:8 | ' +
      'C6:2 .:2 C6:2 Eb6:2 D6:4 C6:4 | G5:8 Eb5:8 | F5:4 Ab5:4 C6:4 Ab5:4 | B5:8 D6:4 G5:4',
  },
  verse: {
    bpm: 92, chords: ['Dm', 'Am', 'Bb', 'C', 'Dm', 'Am', 'Bb', 'A'],
    bass: 'x..x....x.x.....', arp: false, drums: { k: 'x......x..x.....', s: '....x.......x...', h: 'x.xxx.x.x.xxx.x.' },
    lead: 'A4:2 .:2 D5:2 .:2 F5:4 E5:4 | E5:8 C5:8 | D5:2 .:2 F5:2 .:2 A5:4 G5:4 | G5:8 E5:8 | ' +
      'A5:3 G5:3 F5:2 E5:4 D5:4 | C5:8 A4:8 | Bb4:4 D5:4 F5:4 A5:4 | A5:12 .:4',
  },
  ruin: {
    bpm: 72, chords: ['Cm', 'Ab', 'Fm', 'G', 'Cm', 'Ab', 'Fm', 'G'],
    bass: 'x.......x.......', arp: true, drums: { k: 'x...............', s: '................', h: '........x.......' },
    lead: 'G4:8 Eb5:8 | C5:16 | F4:8 Ab4:4 C5:4 | B4:16 | G4:8 Eb5:4 D5:4 | C5:16 | Ab4:8 F4:8 | G4:16',
  },
  // Canción original de los créditos: vals irregular (13 pulsos) con clavecín
  credits: {
    bpm: 150, barSteps: 13, harp: true, arpPattern: [0, 1, 2, 1, 0, 1, 2, 1, 0, 2, 1, 2, 1],
    chords: ['Em', 'C', 'G', 'D', 'Em', 'C', 'Am', 'B', 'C', 'G', 'Am', 'F', 'C', 'G', 'F', 'G'],
    bass: 'x.....x......', arp: true, drums: { k: 'x.....x......', s: '.........x...', h: '.............' },
    lead: 'B4:3 G4:2 E4:3 F#4:2 G4:3 | E4:5 G4:3 C5:5 | D5:3 B4:2 G4:3 A4:2 B4:3 | A4:8 F#4:5 | ' +
      'G4:3 B4:2 E5:3 D5:2 B4:3 | C5:5 B4:3 G4:5 | A4:3 C5:2 E5:3 D5:2 C5:3 | B4:8 D#5:5 | ' +
      'E5:3 E5:2 G5:3 E5:2 D5:3 | D5:5 B4:3 D5:5 | C5:3 E5:2 A5:3 G5:2 E5:3 | F5:8 E5:5 | ' +
      'G5:3 E5:2 C5:3 E5:2 G5:3 | B5:5 A5:3 G5:5 | A5:3 G5:2 F5:3 E5:2 D5:3 | D5:8 .:5',
  },
  sad: {
    bpm: 84, chords: ['Am', 'F', 'C', 'G', 'Am', 'F', 'C', 'E'],
    bass: 'x.......x.......', arp: true, drums: null,
    lead: 'E5:8 C5:4 D5:4 | A4:16 | G4:4 C5:4 E5:4 G5:4 | D5:16 | E5:8 C5:4 A5:4 | F5:12 E5:4 | E5:4 D5:4 C5:4 D5:4 | B4:16',
  },
};

// Canción de créditos elegida por el jugador (se guarda en su navegador)
const CustomSong = {
  blob: null, url: null, el: null, name: '',
  db(cb) {
    try {
      const req = indexedDB.open('sm_rompecanones', 1);
      req.onupgradeneeded = () => { try { req.result.createObjectStore('files'); } catch (e) { /* ya existe */ } };
      req.onsuccess = () => cb(req.result);
      req.onerror = () => cb(null);
    } catch (e) { cb(null); }
  },
  load() {
    this.db((db) => {
      if (!db) return;
      try {
        const g = db.transaction('files', 'readonly').objectStore('files').get('credits');
        g.onsuccess = () => { if (g.result && g.result.blob) this.set(g.result.blob, g.result.name, false); };
      } catch (e) { /* sin almacenamiento */ }
    });
  },
  set(blob, name, persist = true) {
    if (this.url) { try { URL.revokeObjectURL(this.url); } catch (e) { /* nada */ } }
    this.blob = blob; this.name = name || 'canción';
    this.url = URL.createObjectURL(blob);
    if (persist) this.db((db) => { if (!db) return; try { db.transaction('files', 'readwrite').objectStore('files').put({ blob, name: this.name }, 'credits'); } catch (e) { /* sin almacenamiento */ } });
  },
  clear() {
    this.stop();
    this.blob = null; this.url = null; this.name = '';
    this.db((db) => { if (!db) return; try { db.transaction('files', 'readwrite').objectStore('files').delete('credits'); } catch (e) { /* nada */ } });
  },
  pickFile(done) {
    try {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'audio/*';
      inp.onchange = () => { const f = inp.files && inp.files[0]; if (f) { this.set(f, f.name); if (done) done(true); } };
      inp.click();
    } catch (e) { if (done) done(false); }
  },
  play() {
    if (!this.url) return false;
    try {
      this.stop();
      this.el = new window.Audio(this.url);
      this.el.volume = clamp(Game.settings.music / 10, 0, 1);
      const pr = this.el.play();
      if (pr && pr.catch) pr.catch(() => {});
      return true;
    } catch (e) { return false; }
  },
  stop() { if (this.el) { try { this.el.pause(); } catch (e) { /* nada */ } this.el = null; } },
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
    const bs = def.barSteps || 16;
    const bars = def.chords.length;
    const steps = bars * bs;
    const lead = new Array(steps).fill(null);
    let pos = 0;
    def.lead.split(/\s+/).forEach((tok) => {
      if (!tok || tok === '|') return;
      const [n, d] = tok.split(':');
      const dur = parseInt(d, 10) || 1;
      if (n !== '.' && pos < steps) lead[pos] = { f: noteFreq(n), d: dur };
      pos += dur;
    });
    return { def, steps, lead, stepDur: 60 / def.bpm / 4, bs };
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
    const bs = t.bs || 16;
    const bar = Math.floor(step / bs), s = step % bs;
    const chord = CHORDS[def.chords[bar]] || CHORDS.C;
    const sd = t.stepDur;
    const ln = t.lead[step];
    if (ln) {
      if (def.lead2 === 'brass') {
        // metales: sierra brillante + cuadrada una octava abajo
        this.tone('sawtooth', ln.f, time, ln.d * sd * 0.9, 0.065, this.musicGain, 0.012);
        this.tone('square', ln.f / 2, time, ln.d * sd * 0.9, 0.04, this.musicGain, 0.012);
      } else this.tone('square', ln.f, time, ln.d * sd * 0.92, 0.1, this.musicGain, 0.02);
    }
    if (def.walk) {
      // bajo caminante: una nota del acorde por pulso
      if (s % 4 === 0) {
        const n = chord[[0, 1, 2, 1][s / 4 % 4]];
        this.tone('triangle', noteFreq(n + '2'), time, sd * 3.2, 0.34, this.musicGain, 0.01);
      }
    } else if (def.bass && def.bass[s] === 'x') this.tone('triangle', noteFreq(chord[0] + '2'), time, sd * 1.6, 0.32, this.musicGain, 0.01);
    if (def.stabs && def.stabs[s] === 'x') {
      for (const n of chord) this.tone('sawtooth', noteFreq(n + '4'), time, sd * 0.8, 0.022, this.musicGain, 0.004);
    }
    if (def.harp) {
      const idx = def.arpPattern[s % def.arpPattern.length];
      const oct = s % 4 === 3 ? '5' : '4';
      const f = noteFreq(chord[idx] + oct);
      this.tone('square', f, time, sd * 2.2, 0.04, this.musicGain, 0.002);
      this.tone('sawtooth', f * 2.003, time, sd * 1.2, 0.012, this.musicGain, 0.002);
    } else if (def.arp && s % 2 === 0) {
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
      case 'beat': this.tone('sine', 70, T, 0.18, 0.6, null, 0.005, 40); this.tone('sine', 62, T + 0.2, 0.2, 0.45, null, 0.005, 38); break;
      case 'glitch':
        this.noise(T, 0.12, 0.3, rand(800, 4000), 'bandpass');
        for (let i = 0; i < 3; i++) this.tone('square', rand(200, 2400), T + i * 0.03, 0.03, 0.05);
        break;
      default: break;
    }
  },
};

// ---------------------------------------------------------------------------
// Voces: los diálogos se leen en voz alta con la síntesis de voz del sistema
// ---------------------------------------------------------------------------
// Tono (pitch) y velocidad (rate) de cada personaje; g = género de la voz preferida
const VOICE_STYLE = {
  narr: { pitch: 0.9, rate: 0.95, g: 'f' }, peter: { pitch: 1.15, rate: 1.08, g: 'm' }, spidey: { pitch: 1.15, rate: 1.1, g: 'm' },
  radio: { pitch: 0.9, rate: 1.15, g: 'm' }, static: { pitch: 0.6, rate: 0.9, g: 'm' }, jjj: { pitch: 0.7, rate: 1.25, g: 'm' },
  desconocido: { pitch: 0.45, rate: 0.85, g: 'm' }, cero: { pitch: 0.8, rate: 0.95, g: 'm' }, tobey: { pitch: 0.95, rate: 0.98, g: 'm' },
  andrew: { pitch: 1.2, rate: 1.12, g: 'm' }, miles: { pitch: 1.3, rate: 1.1, g: 'm' }, gwen: { pitch: 1.5, rate: 1.05, g: 'f' },
  gwenS: { pitch: 1.4, rate: 1.0, g: 'f' }, miguel: { pitch: 0.6, rate: 0.95, g: 'm' }, harry: { pitch: 1.0, rate: 1.0, g: 'm' },
  venom: { pitch: 0.1, rate: 0.8, g: 'm' }, sandman: { pitch: 0.5, rate: 0.85, g: 'm' }, rino: { pitch: 0.3, rate: 1.0, g: 'm' },
  electro: { pitch: 0.8, rate: 1.1, g: 'm' }, mancha: { pitch: 0.9, rate: 1.15, g: 'm' }, richard: { pitch: 0.8, rate: 0.95, g: 'm' },
  ben: { pitch: 0.7, rate: 0.9, g: 'm' }, davis: { pitch: 0.6, rate: 0.95, g: 'm' }, doom: { pitch: 0.2, rate: 0.8, g: 'm' },
  voice: { pitch: 1.3, rate: 0.85, g: 'f' }, civil: { pitch: 1.2, rate: 1.1, g: 'f' },
};
const FEMALE_VOICES = /m[oó]nica|paulina|marisol|ang[eé]lica|isabela|soledad|sof[ií]a|helena|laura|sabina|elvira|dalia|luc[ií]a|conchita|pen[eé]lope|francisca|female|mujer|google español de estados unidos/i;
const MALE_VOICES = /jorge|juan|diego|carlos|pablo|enrique|[aá]lvaro|ra[uú]l|andr[eé]s|eddy|reed|rocko|male|hombre|google español$/i;

const Voice = {
  ok: false, voices: [], male: null, female: null, any: null,
  init() {
    try {
      if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return;
      this.ok = true;
      const pickV = () => {
        const all = window.speechSynthesis.getVoices() || [];
        const es = all.filter((v) => /^es([-_]|$)/i.test(v.lang || ''));
        this.voices = es;
        this.any = es.find((v) => /es[-_](ES|MX|US|419)/i.test(v.lang)) || es[0] || null;
        this.female = es.find((v) => FEMALE_VOICES.test(v.name)) || null;
        this.male = es.find((v) => MALE_VOICES.test(v.name) && v !== this.female) || null;
      };
      pickV();
      window.speechSynthesis.onvoiceschanged = pickV;
    } catch (e) { this.ok = false; }
  },
  clean(text) {
    return String(text)
      .replace(/^\([^)]*\)\s*/, '')          // acotaciones al principio: "(Por los altavoces)"
      .replace(/\.\.\./g, ', ')
      .replace(/["«»]/g, '')
      .trim();
  },
  speak(who, text) {
    if (!this.ok || !Game.settings.voices) return;
    const t = this.clean(text);
    if (!t) return;
    try {
      const synth = window.speechSynthesis;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(t);
      const st = VOICE_STYLE[who] || { pitch: 1, rate: 1, g: 'm' };
      const v = (st.g === 'f' ? this.female : this.male) || this.any;
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'es-ES';
      u.pitch = st.pitch; u.rate = st.rate;
      u.volume = clamp(Game.settings.voices / 10, 0, 1);
      synth.speak(u);
    } catch (e) { /* sin voz */ }
  },
  stop() { try { if (this.ok) window.speechSynthesis.cancel(); } catch (e) { /* nada */ } },
};
