'use strict';
// ---------------------------------------------------------------------------
// Sprites detallados: cada personaje se rasteriza píxel a píxel a resolución
// de sprite (SPR_D píxeles por píxel lógico, estilo retro). Las extremidades son cápsulas con volumen:
// luz desde arriba a la izquierda en 4 tonos con tramado, contorno entre piezas,
// telarañas que rodean el cuerpo, ojos de lente con borde grueso y emblema.
// ---------------------------------------------------------------------------
const LIGHT = (() => { const l = [-0.45, -0.62, 0.64], n = Math.hypot(...l); return l.map((v) => v / n); })();

// Emblemas: ellipses del cuerpo [cx, cy, rx, ry] y patas [x0,y0,x1,y1,x2,y2] (lado derecho;
// el izquierdo es simétrico). Unidades del emblema; +y hacia abajo.
const EMBLEMS = {
  small: { unit: 0.34, lw: 0.55, body: [[0, -1.1, 0.8, 0.9], [0, 0.9, 1.0, 1.5]],
    legs: [[0.5, -1.2, 1.8, -2.4, 2.4, -1.6], [0.7, -0.5, 2.1, -0.9, 2.7, 0.3], [0.7, 0.3, 2.0, 1.1, 2.4, 2.5], [0.5, 0.9, 1.5, 2.2, 1.7, 3.6]] },
  long: { unit: 0.4, lw: 0.5, body: [[0, -1.3, 0.7, 0.8], [0, 0.2, 0.85, 1.2], [0, 2.0, 0.75, 1.5]],
    legs: [[0.5, -1.4, 2.4, -3.6, 3.8, -2.4], [0.7, -0.6, 3.2, -1.4, 4.2, 0.6], [0.7, 0.4, 3.0, 1.6, 3.6, 4.0], [0.5, 1.0, 2.0, 3.6, 2.4, 6.0]] },
  big: { unit: 0.62, lw: 0.7, body: [[0, -1.4, 0.9, 1.0], [0, 0.2, 1.0, 1.3], [0, 2.2, 0.9, 1.9]],
    legs: [[0.6, -1.6, 2.2, -3.2, 3.6, -2.8], [0.8, -0.6, 3.0, -1.0, 4.0, 0.8], [0.8, 0.5, 2.6, 2.4, 3.0, 4.6], [0.6, 1.3, 1.6, 3.8, 1.8, 6.4]] },
};

function segDist(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy;
  const t = l2 ? clamp(((px - x0) * dx + (py - y0) * dy) / l2, 0, 1) : 0;
  return Math.hypot(px - x0 - dx * t, py - y0 - dy * t);
}
function inEmblem(E, ex, ey) {
  for (const b of E.body) { const a = (ex - b[0]) / b[2], c = (ey - b[1]) / b[3]; if (a * a + c * c <= 1) return true; }
  const ax = Math.abs(ex);
  for (const l of E.legs) {
    if (segDist(ax, ey, l[0], l[1], l[2], l[3]) <= E.lw || segDist(ax, ey, l[2], l[3], l[4], l[5]) <= E.lw * 0.8) return true;
  }
  return false;
}

// Sombreado de 16 bits: las sombras tiran a morado/azul y las luces a amarillo
function hueShade(hex, amt, hs) {
  const n = parseInt(hex.slice(1), 16);
  let r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let hh = 0, ss = 0, l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn; ss = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hh *= 60;
  }
  const toward = (from, to, k) => { let d = ((to - from + 540) % 360) - 180; return (from + d * k + 360) % 360; };
  if (ss > 0.08) {
    if (amt < 0) { hh = toward(hh, 255, 0.16 * hs); ss = Math.min(1, ss * 1.1); }
    else { hh = toward(hh, 55, 0.1 * hs); ss *= 0.9; }
  }
  l = amt < 0 ? l * (1 + amt) : l + (1 - l) * amt;
  const q = l < 0.5 ? l * (1 + ss) : l + ss - l * ss, p = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  const hx = (v) => ('0' + Math.round(clamp(v, 0, 1) * 255).toString(16)).slice(-2);
  const k = hh / 360;
  return '#' + hx(f(k + 1 / 3)) + hx(f(k)) + hx(f(k - 1 / 3));
}

const Sprite = {
  size: 0, canvas: null, ctx: null, img: null, buf: null, grp: null, ramps: new Map(),

  ensure(n) {
    if (this.size >= n) return;
    const size = Math.max(256, Math.ceil(n / 64) * 64);
    this.canvas = makeCanvas(size, size); this.ctx = this.canvas.getContext('2d');
    this.img = this.ctx.createImageData(size, size);
    this.buf = new Uint32Array(this.img.data.buffer);
    this.grp = new Int16Array(size * size);
    this.size = size;
  },
  // 4 tonos (sombra, medio, base, brillo) en formato RGBA de 32 bits
  ramp(hex) {
    let r = this.ramps.get(hex);
    if (!r) {
      const h = typeof hex === 'string' && hex[0] === '#' ? hex : '#808080';
      const px = (c) => { const n = parseInt(c.slice(1), 16); return ((255 << 24) | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255)) >>> 0; };
      r = [px(hueShade(h, -0.5, 1)), px(hueShade(h, -0.26, 0.55)), px(h), px(hueShade(h, 0.32, 1))];
      this.ramps.set(hex, r);
    }
    return r;
  },

  // Caché de fotogramas: con las poses cuantizadas, cada fotograma se pinta una sola vez
  cache: new Map(), palIds: new WeakMap(), nextPal: 1,
  cached(pose, lp, facing, s, pal, opts) {
    let pid = this.palIds.get(pal);
    if (!pid) { pid = this.nextPal++; this.palIds.set(pal, pid); }
    const anim = pal.deco === 'ironlegs' || pal.deco === 'burn' ? Math.floor(Date.now() / 200) % 4 : 0;
    const key = pid + '|' + facing + '|' + s + '|' + (opts.bulk || 4) + '|' + anim + '|' + Q_KEYS.map((k) => pose[k]).join(',') + ',' + pose.rot + ',' + pose.hy;
    let e = this.cache.get(key);
    if (e) { this.cache.delete(key); this.cache.set(key, e); return e; }
    const img = this.render(lp, facing, s, pal, opts);
    const c = makeCanvas(img.w, img.h);
    c.getContext('2d').drawImage(img.canvas, 0, 0, img.w, img.h, 0, 0, img.w, img.h);
    e = { canvas: c, w: img.w, h: img.h, ox: img.ox, oy: img.oy };
    this.cache.set(key, e);
    if (this.cache.size > 900) this.cache.delete(this.cache.keys().next().value);
    return e;
  },

  render(lp, facing, s, pal, opts) {
    const F = SPR_D, U = s * F;
    const q = {};
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const k in lp) {
      const p = q[k] = [facing * lp[k][0] * F, lp[k][1] * F];
      x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
    }
    const pad = Math.ceil(5 * U * Math.max(1, (opts.bulk || 4) / 4));
    const ox = Math.ceil(-x0 + pad), oy = Math.ceil(-y0 + pad);
    const w = Math.ceil(x1 - x0 + pad * 2), h = Math.ceil(y1 - y0 + pad * 2);
    this.ensure(Math.max(w, h));
    const S = this.size, buf = this.buf, grp = this.grp;
    for (let r = 0; r < h; r++) { buf.fill(0, r * S, r * S + w); grp.fill(0, r * S, r * S + w); }
    for (const k in q) { q[k][0] += ox; q[k][1] += oy; }

    const flat = pal.face === 'flat';
    const bulk = (opts.bulk || 4) / 4, lb = 1 + (bulk - 1) * 0.5;
    const outline = this.ramp(pal.outline)[2];
    const parts = [];
    const add = (a, b, r0, r1, col, g, o = {}) => parts.push(Object.assign({ a, b, r0: r0 * U, r1: r1 * U, col, g }, o));
    const norm = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
    const along = (a, b, l) => { const d = norm([b[0] - a[0], b[1] - a[1]]); return [b[0] + d[0] * l, b[1] + d[1] * l]; };
    const footOf = (k, f) => { const d = norm([f[0] - k[0], f[1] - k[1]]); return [f[0] + d[1] * facing * 1.7 * U, f[1] - d[0] * facing * 1.7 * U]; };
    const cut = (t0, low, high) => (t) => (t < t0 ? low : high);

    // --- patas mecánicas (detrás de todo) ---
    if (pal.deco === 'ironlegs' && !flat) {
      const tt = Date.now() / 300, base = [q.sh[0] * 0.7 + q.hip[0] * 0.3, q.sh[1] * 0.7 + q.hip[1] * 0.3];
      for (let i = 0; i < 4; i++) {
        const side = i < 2 ? -1 : 1, kk = i % 2;
        const kn = [base[0] + side * (6 + kk * 3) * U, base[1] - (5 - kk * 3) * U + Math.sin(tt + i) * U * 0.6];
        const tp = [kn[0] + side * (4 + kk * 2) * U, kn[1] + (8 + kk * 3) * U];
        add(base, kn, 0.35, 0.3, '#e0b030', 30 + i); add(kn, tp, 0.3, 0.18, '#e0b030', 30 + i);
      }
    }
    const shinCol = pal.trim ? cut(0.42, pal.leg, pal.boot) : cut(0.42, pal.leg, pal.boot);
    const armCol = pal.shoulder ? cut(0.36, pal.shoulder, pal.arm) : pal.arm;
    // --- pierna y brazo traseros ---
    add(q.hip, q.k1, 1.95 * lb, 1.3 * lb, pal.leg, 1, { back: 1, bulge: 0.3, trimT: -1 });
    add(q.k1, q.f1, 1.35 * lb, 0.85 * lb, shinCol, 1, { back: 1, bulge: 0.42, trimT: pal.trim ? 0.42 : -1 });
    add(q.f1, footOf(q.k1, q.f1), 1.0 * lb, 0.82 * lb, pal.boot, 1, { back: 1 });
    add(q.sh, q.e1, 1.7 * lb, 1.2 * lb, armCol, 2, { back: 1, bulge: 0.4, trimT: pal.shoulder && pal.trim ? 0.36 : -1 });
    add(q.e1, q.h1, 1.3 * lb, 0.85 * lb, pal.arm2, 2, { back: 1, bulge: 0.32 });
    add(q.h1, q.h1, 1.45 * lb, 1.45 * lb, pal.hand, 2, { back: 1 });
    // --- torso: pelvis y pecho en V ---
    add(q.hip, q.mid, 2.2 * bulk, 2.1 * bulk, pal.torsoLow, 3, { torso: 1 });
    const chestTop = [q.sh[0] * 0.8 + q.neck[0] * 0.2, q.sh[1] * 0.8 + q.neck[1] * 0.2];
    add(q.mid, chestTop, 2.35 * bulk, 3.7 * bulk, pal.torso, 4, { torso: 1, chest: 1 });
    add(q.sh, q.head, 1.15 * lb, 1.1 * lb, pal.head, 4, {});
    // --- capucha / cabeza ---
    const up = norm([q.head[0] - q.neck[0], q.head[1] - q.neck[1]]);
    if (pal.deco === 'hood' && !flat) add([q.head[0] - up[0] * 1.2 * U, q.head[1] - up[1] * 1.2 * U], [q.head[0] + up[0] * 0.3 * U, q.head[1] + up[1] * 0.3 * U], 2.9, 2.9, shade(pal.torso, -0.12), 5, {});
    add([q.head[0] - up[0] * 0.35 * U, q.head[1] - up[1] * 0.35 * U], [q.head[0] + up[0] * 0.35 * U, q.head[1] + up[1] * 0.35 * U], 2.6, 2.6, pal.head, 6, { head: 1 });
    // --- pierna y brazo delanteros ---
    add(q.hip, q.k2, 1.95 * lb, 1.3 * lb, pal.leg, 7, { bulge: 0.3 });
    add(q.k2, q.f2, 1.35 * lb, 0.85 * lb, shinCol, 7, { bulge: 0.42, trimT: pal.trim ? 0.42 : -1 });
    add(q.f2, footOf(q.k2, q.f2), 1.0 * lb, 0.82 * lb, pal.boot, 7, {});
    add(q.sh, q.e2, 1.7 * lb, 1.2 * lb, armCol, 8, { bulge: 0.4, trimT: pal.shoulder && pal.trim ? 0.36 : -1 });
    add(q.e2, q.h2, 1.3 * lb, 0.85 * lb, pal.arm2, 8, { bulge: 0.32 });
    add(q.h2, q.h2, 1.45 * lb, 1.45 * lb, pal.hand, 8, {});

    const ctxInfo = { q, U, up, facing, pal, flat, outline, lowres: U < 2 };
    for (const P of parts) this.raster(P, ctxInfo);
    this.silhouette(w, h, outline);
    this.ctx.putImageData(this.img, 0, 0, 0, 0, w, h);
    return { canvas: this.canvas, w, h, ox, oy };
  },

  raster(P, I) {
    const S = this.size, buf = this.buf, grp = this.grp;
    const { U, pal, flat, outline, facing } = I;
    const ax = P.a[0], ay = P.a[1], dx = P.b[0] - ax, dy = P.b[1] - ay;
    const L2 = dx * dx + dy * dy, L = Math.sqrt(L2);
    const ux = L ? dx / L : 0, uy = L ? dy / L : -1;
    const rm = Math.max(P.r0, P.r1) + (P.bulge || 0) * U + 1.5;
    const bx0 = Math.max(0, Math.floor(Math.min(ax, ax + dx) - rm)), bx1 = Math.min(S - 1, Math.ceil(Math.max(ax, ax + dx) + rm));
    const by0 = Math.max(0, Math.floor(Math.min(ay, ay + dy) - rm)), by1 = Math.min(S - 1, Math.ceil(Math.max(ay, ay + dy) + rm));
    const webs = pal.webs && !flat && L > 0 && !I.lowres;
    const webR = webs ? this.ramp(pal.webLine) : null;
    const per = Math.max(5, 2.2 * U), lw = 1;
    const emb = P.chest && pal.emblem && !flat ? EMBLEMS[pal.emblemStyle || 'small'] : null;
    const eu = emb ? emb.unit * U * (P.r1 / (2.85 * U)) : 0;
    const embU = L * 0.55;
    const side = pal.side && P.torso && !flat;
    const g = P.g;
    for (let py = by0; py <= by1; py++) {
      for (let px = bx0; px <= bx1; px++) {
        const cx = px + 0.5 - ax, cy = py + 0.5 - ay;
        const t = L2 ? clamp((cx * dx + cy * dy) / L2, 0, 1) : 0;
        const ex = cx - dx * t, ey = cy - dy * t;
        const d = Math.sqrt(ex * ex + ey * ey), r = P.r0 + (P.r1 - P.r0) * t + (P.bulge ? P.bulge * U * Math.sin(Math.PI * t) : 0);
        if (d > r + 1) continue;
        const idx = py * S + px;
        if (d > r) { // anillo de contorno
          if (buf[idx] === 0 || grp[idx] !== g) { buf[idx] = outline; grp[idx] = g; }
          continue;
        }
        let col = typeof P.col === 'function' ? P.col(t) : P.col;
        const nx = ex / r, ny = ey / r, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        let tone;
        if (flat) tone = 2;
        else {
          // sombreado retro: bandas planas, sin degradados
          const li = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2];
          tone = I.lowres ? (li < 0.3 ? 1 : 2) : li < 0.18 ? 0 : li < 0.5 ? 1 : li < 0.9 ? 2 : 3;
          if (P.back) tone = Math.max(0, Math.min(tone, 2) - 1);
          if (tone === 3 && !P.head && li < 0.95) tone = 2; // brillo solo en lo más abultado del músculo
        }
        const v = (ex * -uy + ey * ux) / r; // -1..1 a lo ancho
        const u = t * L;
        let color = 0;
        if (!flat) {
          if (side) {
            const vf = v * facing;
            if (vf < -0.42) col = pal.side;
            if (pal.trim && Math.abs(vf + 0.42) * r < Math.max(1, U * 0.3)) col = pal.trim;
          }
          if (P.trimT >= 0 && pal.trim && Math.abs(t - P.trimT) * L < Math.max(1, U * 0.28)) col = pal.trim;
          if (P.head) { const hc = this.headPixel(px + 0.5, py + 0.5, I, P, col, tone); if (hc) { color = hc; } }
          if (!color && emb) {
            const eX = (v * r * facing) / eu - 0.35 / emb.unit, eY = (embU - u) / eu;
            if (inEmblem(emb, eX, eY)) color = this.ramp(pal.emblem)[Math.max(1, tone)];
          }
          if (!color && pal.deco === 'armor' && !P.head) {
            // placas de armadura: juntas oscuras y remaches brillantes
            const pp = per * 1.5;
            if (((u + pp * 0.5) % pp + pp) % pp < lw * 1.4) color = this.ramp(col)[Math.max(0, tone - 2)];
            else if (Math.abs(v) < 0.12 && ((u % pp) + pp) % pp < lw * 2) color = this.ramp(col)[3];
          }
          if (!color && webs && col === pal.head && !P.head) {
            const ring = ((u + per * 0.5 + (1 - nz) * 0.9 * U) % per + per) % per < lw;
            const arc = Math.asin(clamp(v, -1, 1)) * r;
            const lon = ((arc % per) + per) % per < lw;
            if (ring || lon) color = webR[Math.min(tone, 2)];
          }
          if (!color && pal.deco === 'burn') {
            const hsh = hash2(Math.floor(u / 2) + g * 97, Math.floor((v + 1) * r / 2));
            if (hsh < 0.1) color = this.ramp('#2a1a14')[tone];
            else if (hsh > 0.985 && Math.floor(Date.now() / 160 + hsh * 50) % 3 === 0) color = this.ramp('#ff7020')[3];
          } else if (!color && pal.deco === 'stealth' && Math.abs(Math.abs(v) - 0.5) * r < 0.7) color = this.ramp('#3a4458')[tone];
        }
        buf[idx] = color || this.ramp(col)[tone];
        grp[idx] = g;
      }
    }
  },

  // Cara: telaraña radial, ojos de lente, pelo, visores...
  headPixel(px, py, I, P, col, tone) {
    const { up, facing, pal, U } = I;
    const C = [(P.a[0] + P.b[0]) / 2, (P.a[1] + P.b[1]) / 2];
    const R = P.r0;
    // marco de la cabeza: adelante = perpendicular a "arriba" hacia donde mira
    const fwd = [-up[1] * facing, up[0] * facing];
    const ex = px - C[0], ey = py - C[1];
    const fx = (ex * fwd[0] + ey * fwd[1]) / R, fy = -(ex * up[0] + ey * up[1]) / R; // fy +: abajo
    const R4 = (c, t) => this.ramp(c)[t];
    const eyes = (sc, fill, border) => {
      const E = [[0.56, -0.06, 0.34, 0.27, -0.55], [0.0, -0.08, 0.38, 0.29, 0.45]];
      for (const e of E) {
        const rx = e[2] * sc, ry = e[3] * sc, c = Math.cos(e[4]), sn = Math.sin(e[4]);
        const lx = (fx - e[0]) * c + (fy - e[1]) * sn, ly = -(fx - e[0]) * sn + (fy - e[1]) * c;
        const k = (lx / rx) ** 2 + (ly / ry) ** 2;
        if (k <= 1) return R4(fill, ly < -ry * 0.35 ? 3 : 2);
        if (border && k <= 2.1) return R4(border, 0);
      }
      return 0;
    };
    switch (pal.face) {
      case 'spider': {
        const e = eyes((pal.eyeSize || 1) * (I.lowres ? 1.45 : 1), pal.eye, pal.outline);
        if (e) return e;
        if (pal.webs && !I.lowres) {
          const cx0 = 0.34, cy0 = 0.05, rx = fx - cx0, ry = fy - cy0;
          const rr = Math.hypot(rx, ry) * R, ang = Math.atan2(ry, rx);
          const seg = TAU / 10, fr = ang / seg - Math.round(ang / seg);
          const lw = Math.max(1, U * 0.26) * 0.55;
          if (Math.abs(fr) * seg * rr < lw || (rr % (0.5 * R)) < lw * 1.6) return R4(pal.webLine, Math.min(tone, 2));
        }
        return 0;
      }
      case 'goggles': {
        for (const e of [[0.62, -0.02, 0.24], [0.1, -0.02, 0.27]]) {
          const d = Math.hypot(fx - e[0], fy - e[1]);
          if (d < e[2]) return R4(pal.eye, d < e[2] * 0.45 && fy < e[1] ? 3 : 2);
          if (d < e[2] + 0.12) return R4('#202024', 1);
        }
        if (fy > -0.2 && fy < 0.16 && fx > -0.55) return R4('#202024', 1);
        return 0;
      }
      case 'human': case 'beanie': {
        const cap = pal.face === 'beanie';
        if (cap ? fy < -0.18 : (fy < -0.32 || (fx < -0.25 && fy < 0.35) || (fx < 0.05 && fy < -0.1))) return R4(pal.hair, cap && fy > -0.3 ? 1 : tone);
        if (Math.abs(fx - 0.62) < 0.1 && Math.abs(fy + 0.02) < 0.1) return R4('#140a12', 2);
        if (Math.abs(fx - 0.6) < 0.18 && Math.abs(fy + 0.2) < 0.05) return R4(pal.hair, 1);
        if (fx > 0.45 && fx < 0.8 && Math.abs(fy - 0.5) < 0.05) return R4(shade(pal.head, -0.4), 2);
        if (fx < 0.0 && fx > -0.25 && Math.abs(fy - 0.1) < 0.15) return R4(pal.head, 0); // oreja
        return 0;
      }
      case 'mask': {
        for (const e of [[0.62, -0.04], [0.18, -0.04]]) if (Math.abs(fx - e[0]) < 0.11 && Math.abs(fy - e[1]) < 0.08) return R4(pal.eye, 2);
        return R4(pal.hair, tone);
      }
      case 'visor':
        if (fy > -0.2 && fy < 0.06 && fx > -0.15) return R4(pal.eye, fy < -0.1 ? 3 : 2);
        if (fy > -0.28 && fy < 0.14 && fx > -0.25) return R4('#101014', 1);
        return 0;
      case 'venom': {
        const e = eyes(1.35, pal.eye, null);
        if (e) return e;
        if (fy > 0.3 && fy < 0.72 && fx > 0.05) {
          const toothRow = fy < 0.4 || fy > 0.62;
          if (toothRow && Math.floor((fx * 10) + (fy < 0.5 ? 0 : 0.5)) % 2 === 0) return R4('#f4f4f4', 2);
          return R4('#8a1030', fy > 0.5 ? 1 : 0);
        }
        return 0;
      }
      case 'spot':
        for (const sp of [[0.55, -0.08, 0.26], [0.08, 0.35, 0.16], [-0.4, -0.3, 0.2], [0.1, -0.5, 0.12]]) if (Math.hypot(fx - sp[0], fy - sp[1]) < sp[2]) return R4('#101010', 2);
        return 0;
      case 'bag': {
        // bolsa de papel con agujeros para los ojos y la boca
        for (const e of [[0.58, -0.08], [0.12, -0.1]]) if (Math.hypot(fx - e[0], (fy - e[1]) * 1.2) < 0.13) return R4('#140a12', 2);
        if (fx > 0.25 && fx < 0.75 && Math.abs(fy - 0.4) < 0.05) return R4('#140a12', 2);
        if (fy < -0.78) return R4(pal.head, 0);
        if (Math.floor((fx + 1) * 6) % 3 === 0 && Math.abs(fy) < 0.9) return R4(pal.head, Math.max(0, tone - 1));
        return 0;
      }
      case 'bowl':
        if (Math.abs(fx - 0.55) < 0.12 && Math.abs(fy + 0.05) < 0.1) return R4('#ffffff', 3);
        return R4('#4cd060', tone);
      default: return 0;
    }
  },

  // contorno exterior extra (1 píxel más) para que la figura se lea sobre cualquier fondo
  silhouette(w, h, outline) {
    const S = this.size, buf = this.buf, grp = this.grp;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * S + x;
        if (buf[i] !== 0) continue;
        if ((buf[i - 1] && grp[i - 1] >= 0) || (buf[i + 1] && grp[i + 1] >= 0) || (buf[i - S] && grp[i - S] >= 0) || (buf[i + S] && grp[i + S] >= 0)) { buf[i] = outline; grp[i] = -1; }
      }
    }
  },
};
