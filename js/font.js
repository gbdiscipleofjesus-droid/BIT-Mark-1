'use strict';
// ---------------------------------------------------------------------------
// Fuente de mapa de bits 5x7 (mayúsculas) con acentos y signos del español
// ---------------------------------------------------------------------------
const FONT_GLYPHS = {
  'A': '0e11111f111111', 'B': '1e11111e11111e', 'C': '0e11101010110e', 'D': '1c12111111121c',
  'E': '1f10101e10101f', 'F': '1f10101e101010', 'G': '0e11101711110f', 'H': '1111111f111111',
  'I': '0e04040404040e', 'J': '0702020202120c', 'K': '11121418141211', 'L': '1010101010101f',
  'M': '111b1515111111', 'N': '11111915131111', 'O': '0e11111111110e', 'P': '1e11111e101010',
  'Q': '0e11111115120d', 'R': '1e11111e141211', 'S': '0f10100e01011e', 'T': '1f040404040404',
  'U': '1111111111110e', 'V': '11111111110a04', 'W': '1111111515150a', 'X': '11110a040a1111',
  'Y': '11110a04040404', 'Z': '1f01020408101f',
  '0': '0e11131519110e', '1': '040c040404040e', '2': '0e11010204081f', '3': '1f02040201110e',
  '4': '02060a121f0202', '5': '1f101e0101110e', '6': '0608101e11110e', '7': '1f010204080808',
  '8': '0e11110e11110e', '9': '0e11110f01020c',
  ' ': '00000000000000', '.': '00000000000c0c', ',': '000000000c0408', '!': '04040404040004',
  '¡': '04000404040404', '?': '0e110102040004', '¿': '0400040810110e', ':': '000c0c000c0c00',
  ';': '000c0c000c0408', '-': '0000001f000000', '+': '0004041f040400', '/': '01010204081010',
  '(': '02040808080402', ')': '08040202020408', "'": '04040800000000', '"': '0a0a0000000000',
  '%': '18190204081303', '*': '0004150e150400', '=': '00001f001f0000', '<': '02040810080402',
  '>': '08040201020408', '#': '0a0a1f0a1f0a0a', '_': '0000000000001f', '[': '0e08080808080e',
  ']': '0e02020202020e', '&': '0c12140815120d', '·': '0000000c0c0000', '@': '0e11171517100e',
};
// Acentos: letra base + marca dibujada por encima
const FONT_ACCENTS = {
  'Á': ['A', 'acute'], 'É': ['E', 'acute'], 'Í': ['I', 'acute'], 'Ó': ['O', 'acute'], 'Ú': ['U', 'acute'],
  'Ü': ['U', 'dia'], 'Ñ': ['N', 'tilde'], 'À': ['A', 'grave'], 'È': ['E', 'grave'],
};
const FONT_MARKS = {
  acute: [[3, -2], [2, -1]],
  grave: [[1, -2], [2, -1]],
  dia: [[1, -2], [3, -2]],
  tilde: [[1, -2], [2, -2], [0, -1], [3, -1], [4, -2]],
};

const Font = {
  cache: new Map(),
  missing: new Set(), // caracteres sin glifo (para pruebas)
  CW: 6, // ancho de celda
  LH: 10, // alto de línea (incluye espacio para acentos)
  chars: null,

  init() {
    this.chars = Object.keys(FONT_GLYPHS).concat(Object.keys(FONT_ACCENTS));
    this.index = {};
    this.chars.forEach((c, i) => { this.index[c] = i; });
  },

  atlas(color) {
    let a = this.cache.get(color);
    if (a) return a;
    const n = this.chars.length;
    const c = makeCanvas(n * 6, 9);
    const x = c.getContext('2d');
    x.fillStyle = color;
    this.chars.forEach((ch, i) => {
      let base = ch, mark = null;
      if (FONT_ACCENTS[ch]) { base = FONT_ACCENTS[ch][0]; mark = FONT_ACCENTS[ch][1]; }
      const g = FONT_GLYPHS[base];
      for (let r = 0; r < 7; r++) {
        const bits = parseInt(g.substr(r * 2, 2), 16);
        for (let b = 0; b < 5; b++) {
          if (bits & (16 >> b)) x.fillRect(i * 6 + b, r + 2, 1, 1);
        }
      }
      if (mark) FONT_MARKS[mark].forEach(([mx, my]) => x.fillRect(i * 6 + mx, my + 2, 1, 1));
    });
    this.cache.set(color, c);
    return c;
  },

  norm(str) {
    return String(str).toUpperCase();
  },

  width(str, scale = 1) {
    const s = this.norm(str);
    return s.length ? (s.length * this.CW - 1) * scale : 0;
  },

  // align: 'left' | 'center' | 'right'. y es la parte superior de la letra (sin acento)
  draw(ctx, str, x, y, color = '#ffffff', opts = {}) {
    const scale = opts.scale || 1;
    const s = this.norm(str);
    let w = this.width(s, scale);
    let px = x;
    if (opts.align === 'center') px = x - Math.floor(w / 2);
    else if (opts.align === 'right') px = x - w;
    px = Math.round(px); const py = Math.round(y);
    if (opts.shadow) this._draw(ctx, s, px + scale, py + scale, opts.shadow, scale);
    if (opts.outline) {
      for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        this._draw(ctx, s, px + ox * scale, py + oy * scale, opts.outline, scale);
      }
    }
    this._draw(ctx, s, px, py, color, scale);
    return w;
  },

  _draw(ctx, s, x, y, color, scale) {
    const a = this.atlas(color);
    for (let i = 0; i < s.length; i++) {
      const idx = this.index[s[i]];
      if (idx === undefined) { this.missing.add(s[i]); continue; }
      if (s[i] === ' ') continue;
      ctx.drawImage(a, idx * 6, 0, 5, 9, x + i * this.CW * scale, y - 2 * scale, 5 * scale, 9 * scale);
    }
  },

  // Divide texto en líneas de como máximo maxW píxeles
  wrap(str, maxW, scale = 1) {
    const words = String(str).split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w;
      if (this.width(test, scale) > maxW && cur) { lines.push(cur); cur = w; }
      else cur = test;
    }
    if (cur) lines.push(cur);
    return lines;
  },
};
Font.init();
