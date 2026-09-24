'use strict';
// ---------------------------------------------------------------------------
// Utilidades generales
// ---------------------------------------------------------------------------
const W = 384, H = 216;
const TAU = Math.PI * 2;
const DEPTH_MAX = 28;   // profundidad de la calle (estilo Maximum Carnage)
const ALLY_CD = 90;     // segundos de recarga del refuerzo multiversal (R3)
const LANE = 9;         // diferencia de profundidad máxima para que un golpe conecte
const RES = 4;          // píxeles reales por píxel lógico
const SPR_D = 2;        // píxeles de sprite por píxel lógico (personajes en pixel art retro)
function onStreet(e) { return !!(e.onGround && e.groundObj && e.groundObj.kind === 'ground'); }

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function sign(v) { return v < 0 ? -1 : v > 0 ? 1 : 0; }
function approach(v, t, d) { return v < t ? Math.min(v + d, t) : Math.max(v - d, t); }
function rand(a, b) { return a + Math.random() * (b - a); }
function randi(a, b) { return Math.floor(rand(a, b + 1)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }

// Generador pseudoaleatorio determinista (para que la ciudad sea siempre igual)
function makeRng(seed) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (a, b) => a + next() * (b - a),
    int: (a, b) => Math.floor(a + next() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
  };
}

function hash2(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Almacenamiento seguro (puede fallar en modo privado o en iframes)
const Store = {
  get(key, def) {
    try {
      const v = window.localStorage.getItem(key);
      return v == null ? def : JSON.parse(v);
    } catch (e) { return def; }
  },
  set(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* sin almacenamiento */ }
  },
  remove(key) {
    try { window.localStorage.removeItem(key); } catch (e) { /* sin almacenamiento */ }
  },
};

function deepCopy(o) { return JSON.parse(JSON.stringify(o)); }

// Color: aclara/oscurece un hex #rrggbb
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
  const h = (v) => ('0' + Math.round(clamp(v, 0, 255)).toString(16)).slice(-2);
  return '#' + h(r) + h(g) + h(b);
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  return c;
}
