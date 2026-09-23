'use strict';
// ---------------------------------------------------------------------------
// Gráficos: personajes procedurales en pixel art, retratos, cielos y edificios
// ---------------------------------------------------------------------------
const D2R = Math.PI / 180;

function thickLine(ctx, x0, y0, x1, y1, w) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = x1 - x0, dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
  const o = Math.floor(w / 2);
  for (let i = 0; i <= steps; i++) {
    ctx.fillRect(Math.round(x0 + dx * i / steps) - o, Math.round(y0 + dy * i / steps) - o, w, w);
  }
}

function makePal(p) {
  const pal = Object.assign({
    outline: '#140a12', head: '#e0a878', hair: '#3a2416', torso: '#555', torsoLow: null, arm: null, arm2: null,
    hand: null, leg: '#2a3a6a', boot: '#1a1a1a', eye: '#ffffff', face: 'human', emblem: null,
  }, p);
  pal.torsoLow = pal.torsoLow || pal.torso;
  pal.arm = pal.arm || pal.torso;
  pal.arm2 = pal.arm2 || pal.arm;
  pal.hand = pal.hand || pal.arm2;
  pal.dark = {}; pal.light = {};
  for (const k of ['head', 'torso', 'torsoLow', 'arm', 'arm2', 'hand', 'leg', 'boot']) {
    pal.dark[k] = shade(pal[k], -0.3);
    pal.light[k] = shade(pal[k], 0.28);
  }
  pal.webLine = pal.webLine || shade(pal.torso, -0.45);
  return pal;
}
const TRAIL_PAL = makePal({ outline: '#60e0ff', head: '#a0f0ff', hair: '#a0f0ff', torso: '#80d8ff', leg: '#4a90ff', boot: '#4a90ff', eye: '#ffffff', face: 'flat' });
const FLASH_PAL = makePal({ outline: '#ffffff', head: '#ffffff', hair: '#ffffff', torso: '#ffffff', leg: '#ffffff', boot: '#ffffff', eye: '#ffffff', face: 'flat' });

const SUITS = [
  { id: 'nwh', name: 'Traje hecho a mano', desc: 'Cosido por Peter tras No Way Home.', pal: { webs: true,  head: '#e0202c', torso: '#e0202c', torsoLow: '#2046c8', arm: '#e0202c', arm2: '#e0202c', leg: '#2046c8', boot: '#e0202c', face: 'spider', emblem: '#140a12' } },
  { id: 'casero', name: 'Traje casero', desc: 'Sudadera roja y gafas. Donde todo empezó.', pal: { deco: 'hood',  head: '#c8202a', torso: '#c8202a', torsoLow: '#c8202a', arm: '#c8202a', arm2: '#c8202a', leg: '#2a3a8a', boot: '#d8d8d8', face: 'goggles', emblem: '#140a12', eye: '#b8d8ff' } },
  { id: 'sigilo', name: 'Traje de sigilo', desc: 'El traje del "Mono Nocturno".', pal: { deco: 'stealth',  head: '#20242c', torso: '#20242c', torsoLow: '#20242c', arm: '#20242c', leg: '#20242c', boot: '#2a2e38', face: 'spider', emblem: '#4a5060', eye: '#8ad8ff' } },
  { id: 'stark', name: 'Traje Stark', desc: 'Regalo del señor Stark.', pal: { webs: true,  head: '#d82028', torso: '#d82028', torsoLow: '#1c38a8', arm: '#1c38a8', arm2: '#d82028', leg: '#1c38a8', boot: '#d82028', face: 'spider', emblem: '#140a12' } },
  { id: 'ffh', name: 'Traje mejorado', desc: 'Rojo y negro, hecho en el jet de Stark.', pal: { head: '#e01a24', torso: '#e01a24', torsoLow: '#16161c', arm: '#16161c', arm2: '#e01a24', leg: '#16161c', boot: '#e01a24', face: 'spider', emblem: '#16161c' } },
  { id: 'iron', name: 'Iron Spider', desc: 'Nanotecnología roja y dorada. Con patas de araña.', pal: { deco: 'ironlegs',  head: '#c01822', torso: '#c01822', torsoLow: '#e0b030', arm: '#c01822', arm2: '#e0b030', leg: '#c01822', boot: '#e0b030', face: 'spider', emblem: '#e0b030' } },
  { id: 'raimi', name: 'Traje clásico (96283)', desc: 'Regalo de Tierra-96283. Telarañas en relieve.', pal: { webs: true,  head: '#c8141e', torso: '#c8141e', torsoLow: '#1a2a8a', arm: '#c8141e', arm2: '#c8141e', leg: '#1a2a8a', boot: '#c8141e', face: 'spider', emblem: '#140a12', eye: '#d8e4f0' } },
  { id: 'tasm', name: 'Traje de Tierra-120703', desc: 'Ojos grandes, azul eléctrico.', pal: { webs: true,  head: '#d81a2a', torso: '#d81a2a', torsoLow: '#1a5ac8', arm: '#1a5ac8', arm2: '#d81a2a', leg: '#1a5ac8', boot: '#d81a2a', face: 'spider', emblem: '#140a12', eye: '#ffffff' } },
  { id: 'verse', name: 'Traje del Spider-Verse', desc: 'Negro y rojo, con estilo de cómic.', pal: { webs: true, webLine: '#d8202c',  head: '#1a1a22', torso: '#1a1a22', torsoLow: '#1a1a22', arm: '#1a1a22', arm2: '#d8202c', leg: '#1a1a22', boot: '#d8202c', face: 'spider', emblem: '#d8202c', eye: '#ffffff' } },
  { id: 'cero', name: 'Traje quemado', desc: 'El traje de Peter Cero. Pesa más de lo que parece.', pal: { deco: 'burn',  head: '#16141a', torso: '#16141a', torsoLow: '#2a1a14', arm: '#16141a', arm2: '#2a1a14', leg: '#16141a', boot: '#3a2014', face: 'spider', emblem: '#e06020', eye: '#ffb060' } },
];
const START_SUITS = ['nwh', 'casero', 'stark', 'ffh', 'iron'];
const GWEN_PAL = makePal({ deco: 'hood', outline: '#140a12', head: '#f4f4f8', torso: '#f4f4f8', torsoLow: '#f4f4f8', arm: '#e04a9a', arm2: '#f4f4f8', leg: '#f4f4f8', boot: '#40c0d0', face: 'spider', emblem: '#e04a9a', eye: '#ffffff' });
SUITS.forEach((s) => { s.palObj = makePal(Object.assign({ outline: '#140a12' }, s.pal)); });

// ---------------- Poses ----------------
const BASE_POSE = { t: 4, h: 0, l1: -12, l2: 6, r1: 14, r2: -6, a1: -15, a2: -35, b1: 15, b2: -50, hy: 0, rot: 0 };
function P(o) { return Object.assign({}, BASE_POSE, o); }
const Poses = {
  idle(t) { const b = Math.sin(t * 3); return P({ hy: b > 0.6 ? 1 : 0, a2: -35 - b * 5, b2: -50 + b * 5 }); },
  run(ph) {
    const s = Math.sin(ph), c = Math.cos(ph);
    return P({ t: 16, l1: -38 * s, l2: -40 - 30 * Math.max(0, -c), r1: 38 * s, r2: -40 - 30 * Math.max(0, c),
      a1: 40 * s, a2: -70, b1: -40 * s, b2: -70, hy: Math.abs(c) > 0.8 ? -1 : 0 });
  },
  jump() { return P({ t: 8, l1: -20, l2: -40, r1: 50, r2: -80, a1: 150, a2: 10, b1: 120, b2: 20 }); },
  fall() { return P({ t: 0, l1: -30, l2: -20, r1: 30, r2: -50, a1: 110, a2: 20, b1: 130, b2: 10 }); },
  flip(t) { return P({ t: 10, l1: 70, l2: -120, r1: 80, r2: -130, a1: 60, a2: -90, b1: 70, b2: -90, rot: t * 360 }); },
  swing(armAng) { return P({ t: 0, l1: 12, l2: -50, r1: 28, r2: -60, a1: -20, a2: -40, b1: armAng, b2: 0 }); },
  wall(t) { const s = Math.sin(t * 10); return P({ t: 0, l1: -50 + s * 10, l2: 90, r1: 60 - s * 10, r2: -110, a1: 150 + s * 10, a2: -30, b1: 120 - s * 10, b2: -40, hy: 2 }); },
  crouch() { return P({ t: 20, l1: -10, l2: 70, r1: 60, r2: -100, a1: 20, a2: -60, b1: 40, b2: -70, hy: 4 }); },
  punch1() { return P({ t: 18, l1: -25, l2: 10, r1: 25, r2: -10, a1: -30, a2: -60, b1: 90, b2: 0 }); },
  punch2() { return P({ t: 22, l1: -30, l2: 10, r1: 30, r2: -15, a1: 92, a2: 0, b1: -20, b2: -70 }); },
  kick() { return P({ t: -18, l1: -10, l2: 5, r1: 100, r2: -5, a1: 60, a2: -40, b1: -40, b2: -60 }); },
  airkick() { return P({ t: -10, l1: -25, l2: -70, r1: 80, r2: -5, a1: 100, a2: -20, b1: -30, b2: -40 }); },
  uppercut() { return P({ t: -8, l1: -10, l2: 0, r1: 10, r2: -20, a1: -20, a2: -60, b1: 170, b2: 0 }); },
  dive() { return P({ t: 35, l1: 5, l2: -90, r1: 40, r2: 0, a1: 150, a2: 0, b1: 150, b2: 0 }); },
  swingkick() { return P({ t: -25, l1: 60, l2: -10, r1: 95, r2: 0, a1: 150, a2: 0, b1: 120, b2: 0 }); },
  shoot() { return P({ t: 10, l1: -20, l2: 8, r1: 20, r2: -8, a1: -20, a2: -60, b1: 90, b2: -5 }); },
  hurt() { return P({ t: -22, h: -15, l1: -5, l2: 10, r1: 10, r2: -10, a1: -60, a2: -20, b1: -50, b2: -30 }); },
  ko() { return P({ t: 0, l1: -5, l2: 0, r1: 5, r2: 0, a1: 170, a2: 0, b1: 160, b2: 0, rot: -90, hy: 0 }); },
  special(t) { return P({ t: 0, l1: -40, l2: 20, r1: 40, r2: -20, a1: 100, a2: 0, b1: 100, b2: 0, rot: t * 720 }); },
  heal(t) { return P({ t: 5, l1: -20, l2: 60, r1: 40, r2: -90, a1: 40, a2: -120, b1: 50, b2: -120, hy: 3 + Math.sin(t * 20) }); },
  windup() { return P({ t: -12, l1: -25, l2: 10, r1: 25, r2: -10, a1: -10, a2: -40, b1: -70, b2: -60 }); },
  slam() { return P({ t: 30, l1: -35, l2: 40, r1: 45, r2: -60, a1: 60, a2: 0, b1: 50, b2: 0, hy: 2 }); },
  webbed() { return P({ t: 0, l1: -3, l2: 0, r1: 3, r2: 0, a1: -5, a2: 0, b1: 5, b2: 0 }); },
  aim() { return P({ t: 0, l1: -15, l2: 5, r1: 15, r2: -5, a1: 80, a2: 0, b1: 88, b2: 0 }); },
  cheer(t) { return P({ a1: 160 + Math.sin(t * 12) * 15, a2: 0, b1: 150 - Math.sin(t * 12) * 15, b2: 0 }); },
  roll(u) { return P({ t: 45, h: 30, l1: 95, l2: -140, r1: 105, r2: -140, a1: 80, a2: -110, b1: 90, b2: -110, hy: 7, rot: u * 360 }); },
  backflip(u) {
    const tuck = Math.sin(u * Math.PI);
    return P({ t: -10, l1: -10 + tuck * 70, l2: -20 - tuck * 100, r1: 10 + tuck * 80, r2: -30 - tuck * 100, a1: 170 - tuck * 60, a2: 0, b1: 165 - tuck * 60, b2: 0, rot: -u * 360 });
  },
  corkscrew(u) { return P({ t: -15, l1: -35, l2: -20, r1: 30, r2: -40, a1: 120, a2: 10, b1: 100, b2: 20, rot: -25 - u * 40 }); },
  guard() { return P({ t: -6, l1: -25, l2: 15, r1: 25, r2: -15, a1: 55, a2: -125, b1: 70, b2: -135, hy: 1 }); },
  sit() { return P({ t: 0, l1: 80, l2: -80, r1: 90, r2: -90, a1: 20, a2: -40, b1: 30, b2: -50, hy: 5 }); },
};

const Rig = {
  pts: {},
  compute(pose, s) {
    const rot = (pose.rot || 0) * D2R;
    const hip = [0, (-10 + (pose.hy || 0)) * s];
    const t = pose.t * D2R;
    const tu = [Math.sin(t), -Math.cos(t)];
    const add = (p, d, l) => [p[0] + d[0] * l, p[1] + d[1] * l];
    const limb = (a) => [Math.sin(a * D2R), Math.cos(a * D2R)];
    const neck = add(hip, tu, 7 * s);
    const sh = add(hip, tu, 6 * s);
    const hd = [Math.sin(t + pose.h * D2R), -Math.cos(t + pose.h * D2R)];
    const head = add(neck, hd, 3 * s);
    const k1 = add(hip, limb(pose.l1), 5 * s), f1 = add(k1, limb(pose.l1 + pose.l2), 5 * s);
    const k2 = add(hip, limb(pose.r1), 5 * s), f2 = add(k2, limb(pose.r1 + pose.r2), 5 * s);
    const e1 = add(sh, limb(pose.a1), 4 * s), h1 = add(e1, limb(pose.a1 + pose.a2), 4 * s);
    const e2 = add(sh, limb(pose.b1), 4 * s), h2 = add(e2, limb(pose.b1 + pose.b2), 4 * s);
    const pts = { hip, neck, sh, head, k1, f1, k2, f2, e1, h1, e2, h2, mid: [(hip[0] + neck[0]) / 2, (hip[1] + neck[1]) / 2] };
    if (rot) {
      const c = Math.cos(rot), sn = Math.sin(rot);
      for (const k in pts) {
        const dx = pts[k][0] - hip[0], dy = pts[k][1] - hip[1];
        pts[k] = [hip[0] + dx * c - dy * sn, hip[1] + dx * sn + dy * c];
      }
    }
    return pts;
  },

  // Dibuja un personaje. x,y = pies (centro). Devuelve los puntos en coordenadas de mundo.
  draw(ctx, x, y, facing, pose, pal, opts = {}) {
    const s = opts.scale || 1;
    const lp = this.compute(pose, s);
    const wp = {};
    for (const k in lp) wp[k] = [Math.round(x + facing * lp[k][0]), Math.round(y + lp[k][1])];
    const lw = Math.max(2, Math.round(2 * s)), tw = Math.max(4, Math.round((opts.bulk || 4) * s));
    const hs = Math.max(5, Math.round(5 * s));
    const parts = (outline) => {
      const o = outline ? 2 : 0;
      const col = (k, back) => outline ? pal.outline : (back ? pal.dark[k] : pal[k]);
      // pierna trasera
      ctx.fillStyle = col('leg', true); thickLine(ctx, ...wp.hip, ...wp.k1, lw + o);
      ctx.fillStyle = col('leg', true); thickLine(ctx, ...wp.k1, ...mixp(wp.k1, wp.f1, 0.4), lw + o);
      ctx.fillStyle = col('boot', true); thickLine(ctx, ...mixp(wp.k1, wp.f1, 0.4), ...wp.f1, lw + o);
      // brazo trasero
      ctx.fillStyle = col('arm', true); thickLine(ctx, ...wp.sh, ...wp.e1, lw + o);
      ctx.fillStyle = col('arm2', true); thickLine(ctx, ...wp.e1, ...wp.h1, lw + o);
      if (opts.extraBack && !outline) opts.extraBack(ctx, wp, facing, s);
      // torso
      ctx.fillStyle = col('torsoLow'); thickLine(ctx, ...wp.hip, ...wp.mid, tw + o);
      ctx.fillStyle = col('torso'); thickLine(ctx, ...wp.mid, ...wp.neck, tw + o);
      // cabeza
      ctx.fillStyle = col('head');
      const hx = wp.head[0] - Math.floor(hs / 2), hy = wp.head[1] - Math.floor(hs / 2);
      ctx.fillRect(hx - o / 2, hy - o / 2, hs + o, hs + o);
      // pierna delantera
      ctx.fillStyle = col('leg'); thickLine(ctx, ...wp.hip, ...wp.k2, lw + o);
      ctx.fillStyle = col('leg'); thickLine(ctx, ...wp.k2, ...mixp(wp.k2, wp.f2, 0.4), lw + o);
      ctx.fillStyle = col('boot'); thickLine(ctx, ...mixp(wp.k2, wp.f2, 0.4), ...wp.f2, lw + o);
      // brazo delantero
      ctx.fillStyle = col('arm'); thickLine(ctx, ...wp.sh, ...wp.e2, lw + o);
      ctx.fillStyle = col('arm2'); thickLine(ctx, ...wp.e2, ...wp.h2, lw + o);
      if (!outline) {
        ctx.fillStyle = pal.hand; ctx.fillRect(wp.h2[0] - Math.floor(lw / 2), wp.h2[1] - Math.floor(lw / 2), lw, lw);
      }
      return { hx, hy };
    };
    if (pal.deco === 'ironlegs' && pal.face !== 'flat') this.ironLegs(ctx, wp, facing, s, pose);
    parts(true);
    const { hx, hy } = parts(false);
    if (pal.face !== 'flat') this.detail(ctx, wp, facing, s, pal, lw, tw, hx, hy, hs);
    this.face(ctx, hx, hy, hs, facing, pal, s, pose);
    if (pal.emblem && pal.face !== 'flat') {
      ctx.fillStyle = pal.emblem;
      const ex = Math.round((wp.mid[0] + wp.neck[0]) / 2), ey = Math.round((wp.mid[1] + wp.neck[1]) / 2);
      ctx.fillRect(ex, ey - 1, 1, 3);
      ctx.fillRect(ex - 1, ey, 3, 1);
      if (s >= 1.15) { ctx.fillRect(ex - 2, ey - 1, 1, 1); ctx.fillRect(ex + 2, ey - 1, 1, 1); ctx.fillRect(ex - 2, ey + 2, 1, 1); ctx.fillRect(ex + 2, ey + 2, 1, 1); }
    }
    if (opts.extra) opts.extra(ctx, wp, facing, s);
    return wp;
  },

  // Sombreado, brillos y detalles de traje (telarañas, capucha, quemaduras...)
  detail(ctx, wp, f, s, pal, lw, tw, hx, hy, hs) {
    // cabeza redondeada: esquinas con contorno
    ctx.fillStyle = pal.outline;
    ctx.fillRect(hx, hy, 1, 1); ctx.fillRect(hx + hs - 1, hy, 1, 1);
    // brillo superior de la cabeza
    ctx.fillStyle = pal.light.head;
    ctx.fillRect(hx + 1, hy, hs - 2, 1);
    // brillos en extremidades delanteras y torso (luz desde arriba)
    const hi = (k, a, b) => { ctx.fillStyle = pal.light[k]; thickLine(ctx, a[0], a[1] - Math.floor(lw / 2), b[0], b[1] - Math.floor(lw / 2), 1); };
    hi('arm', wp.sh, wp.e2); hi('arm2', wp.e2, wp.h2);
    hi('leg', wp.hip, wp.k2);
    ctx.fillStyle = pal.light.torso;
    thickLine(ctx, wp.mid[0] + f * Math.floor(tw / 2), wp.mid[1], wp.neck[0] + f * Math.floor(tw / 2), wp.neck[1], 1);
    // hombro
    ctx.fillStyle = pal.torso; ctx.fillRect(wp.sh[0] - 1, wp.sh[1] - 1, 3, 2);
    // pies con punta
    ctx.fillStyle = pal.boot; ctx.fillRect(wp.f2[0] + (f > 0 ? 0 : -1), wp.f2[1], 2, 1);
    // cinturón entre la parte alta y baja del torso
    if (pal.torsoLow !== pal.torso) { ctx.fillStyle = pal.dark.torsoLow; thickLine(ctx, wp.mid[0] - Math.floor(tw / 2), wp.mid[1], wp.mid[0] + Math.floor(tw / 2), wp.mid[1], 1); }
    // líneas de telaraña del traje
    if (pal.webs) {
      ctx.fillStyle = pal.webLine;
      thickLine(ctx, wp.mid[0], wp.mid[1], wp.neck[0], wp.neck[1], 1);
      ctx.fillRect(hx + Math.floor(hs / 2), hy + 1, 1, hs - 1);
      ctx.fillRect(hx + 1, hy + hs - 2, hs - 2, 1);
      const m1 = mixp(wp.sh, wp.e2, 0.5), m2 = mixp(wp.hip, wp.k2, 0.5);
      ctx.fillRect(m1[0], m1[1], 1, 1); ctx.fillRect(m2[0], m2[1], 1, 1);
    }
    if (pal.deco === 'hood') {
      ctx.fillStyle = pal.dark.torso;
      ctx.fillRect(hx - 1, hy - 1, hs + 2, 2);
      ctx.fillRect(f > 0 ? hx - 1 : hx + hs - 1, hy, 2, hs);
    } else if (pal.deco === 'burn') {
      ctx.fillStyle = '#3a2014';
      ctx.fillRect(hx + (f > 0 ? 0 : hs - 2), hy + 1, 2, 2);
      ctx.fillStyle = '#e06020';
      const m = mixp(wp.hip, wp.neck, 0.3); ctx.fillRect(m[0] - f, m[1], 1, 1);
      if (Math.floor(Date.now() / 150) % 3 === 0) ctx.fillRect(wp.k2[0], wp.k2[1] - 1, 1, 1);
    } else if (pal.deco === 'stealth') {
      ctx.fillStyle = '#3a4050';
      thickLine(ctx, wp.sh[0] - 2, wp.sh[1], wp.hip[0] - 2, wp.hip[1], 1);
    }
  },

  // Patas mecánicas de la Iron Spider
  ironLegs(ctx, wp, f, s, pose) {
    const t = Date.now() / 300;
    const base = mixp(wp.sh, wp.hip, 0.3);
    ctx.fillStyle = '#e0b030';
    for (let i = 0; i < 4; i++) {
      const side = i < 2 ? -1 : 1, k = i % 2;
      const kx = base[0] + side * (6 + k * 3) * s, ky = base[1] - (5 - k * 3) * s + Math.sin(t + i) * 1;
      const tx = kx + side * (4 + k * 2) * s, ty = ky + (8 + k * 3) * s;
      thickLine(ctx, base[0], base[1], kx, ky, 1);
      thickLine(ctx, kx, ky, tx, ty, 1);
    }
  },

  face(ctx, hx, hy, hs, f, pal, s, pose) {
    const front = f > 0 ? hx + hs - 1 : hx; // columna frontal
    const inward = -f;
    const u = Math.max(1, Math.round(s));
    if ((pose.rot || 0) % 360 > 60 && (pose.rot || 0) % 360 < 300) return; // de espaldas / girando: sin detalles
    switch (pal.face) {
      case 'spider':
        for (const e of [front, front + inward * 2 * u]) {
          ctx.fillStyle = pal.outline;
          ctx.fillRect(f > 0 ? e - u : e, hy + u, 2 * u, 3 * u);
          ctx.fillStyle = pal.eye;
          ctx.fillRect(e, hy + 2 * u, u, u);
        }
        break;
      case 'goggles':
        ctx.fillStyle = '#101010';
        ctx.fillRect(Math.min(front, front + inward * 3 * u), hy + u, 4 * u, 2 * u);
        ctx.fillStyle = pal.eye;
        ctx.fillRect(front, hy + u, u, u);
        ctx.fillRect(front + inward * 2 * u, hy + u, u, u);
        break;
      case 'human':
        ctx.fillStyle = pal.hair;
        ctx.fillRect(hx, hy, hs, 2 * u);
        ctx.fillRect(f > 0 ? hx : hx + hs - u, hy, u, hs - u);
        ctx.fillStyle = '#140a12';
        ctx.fillRect(front + inward * u, hy + 2 * u, u, u);
        break;
      case 'beanie':
        ctx.fillStyle = pal.hair;
        ctx.fillRect(hx, hy - u, hs, 3 * u);
        ctx.fillStyle = '#140a12';
        ctx.fillRect(front + inward * u, hy + 2 * u, u, u);
        break;
      case 'mask':
        ctx.fillStyle = pal.hair;
        ctx.fillRect(hx, hy, hs, hs);
        ctx.fillStyle = pal.eye;
        ctx.fillRect(front + inward * u, hy + 2 * u, u, u);
        ctx.fillRect(front + inward * 3 * u, hy + 2 * u, u, u);
        break;
      case 'visor':
        ctx.fillStyle = pal.eye;
        ctx.fillRect(Math.min(front, front + inward * 2 * u), hy + Math.round(hs * 0.35), 3 * u, u);
        break;
      case 'venom':
        ctx.fillStyle = pal.eye;
        ctx.fillRect(Math.min(front, front + inward * 2 * u), hy + u, 3 * u, 2 * u);
        ctx.fillRect(front + inward * 3 * u, hy + u, u, u);
        ctx.fillRect(Math.min(front, front + inward * 3 * u), hy + hs - 2 * u, 4 * u, u);
        break;
      case 'spot':
        ctx.fillStyle = '#101010';
        ctx.fillRect(front + inward * u, hy + u, 2 * u, 2 * u);
        ctx.fillRect(front + inward * 3 * u, hy + 3 * u, u, u);
        break;
      case 'bowl':
        ctx.fillStyle = 'rgba(190,230,255,0.55)';
        ctx.fillRect(hx - u, hy - u, hs + 2 * u, hs + 2 * u);
        ctx.fillStyle = '#6cf07a';
        ctx.fillRect(hx + u, hy + u, hs - 2 * u, hs - 2 * u);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(hx, hy, u, u);
        break;
      default: break;
    }
  },
};
function mixp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }

// ---------------- Retratos para diálogos (24x24) ----------------
const Portraits = {
  cache: {},
  get(who) {
    if (this.cache[who]) return this.cache[who];
    const c = makeCanvas(24, 24);
    const x = c.getContext('2d');
    const R = (col, a, b, w, h) => { x.fillStyle = col; x.fillRect(a, b, w, h); };
    const bg = { spidey: '#2a1830', peter: '#2a1830', radio: '#18202a', cleary: '#1a2430', jjj: '#301818', shocker: '#2a2a10', mason: '#1e2418', gargan: '#102a18', mysterio: '#10281c', civil: '#202838', mj: '#281a24', tobey: '#2a1810', andrew: '#0a1a2a', miles: '#2a0a2a', gwen: '#1a1030', gwens: '#1a2030', miguel: '#0a1030', harry: '#1a2010', venom: '#101018', sandman: '#2a2010', rino: '#202028', mancha: '#303030', richard: '#1a1a20', ben: '#201a14', davis: '#101820', desconocido: '#1a0a06' }[who] || '#202020';
    R(bg, 0, 0, 24, 24);
    const face = (skin) => { R('#140a12', 6, 4, 12, 17); R(skin, 7, 5, 10, 15); R(skin, 5, 10, 2, 4); R(skin, 17, 10, 2, 4); };
    switch (who) {
      case 'spidey':
        R('#140a12', 5, 3, 14, 19); R('#e0202c', 6, 4, 12, 17);
        R('#140a12', 7, 8, 4, 5); R('#140a12', 13, 8, 4, 5); R('#ffffff', 8, 9, 2, 3); R('#ffffff', 14, 9, 2, 3);
        R('#a01018', 11, 4, 1, 17); R('#a01018', 6, 14, 12, 1); R('#a01018', 6, 18, 12, 1);
        R('#2046c8', 4, 21, 16, 3);
        break;
      case 'peter':
        face('#e8b890'); R('#5a3420', 6, 3, 12, 5); R('#5a3420', 6, 3, 2, 9); R('#5a3420', 16, 3, 2, 6);
        R('#140a12', 9, 11, 2, 2); R('#140a12', 14, 11, 2, 2); R('#b07860', 11, 17, 3, 1);
        R('#6a3a3a', 4, 21, 16, 3);
        break;
      case 'cleary':
        face('#b88a64'); R('#1a1410', 6, 3, 12, 4); R('#1a1410', 7, 16, 10, 5); R('#b88a64', 10, 17, 4, 1);
        R('#140a12', 9, 11, 2, 1); R('#140a12', 14, 11, 2, 1);
        R('#2a3040', 3, 21, 18, 3); R('#e8e8e8', 11, 21, 2, 3);
        break;
      case 'jjj':
        face('#e8b890'); R('#c8c8c8', 6, 2, 12, 4); R('#140a12', 8, 10, 3, 1); R('#140a12', 13, 10, 3, 1);
        R('#6a5a4a', 9, 15, 6, 2); R('#140a12', 10, 18, 4, 1);
        R('#2a3a6a', 3, 21, 18, 3); R('#c02020', 11, 21, 2, 3);
        break;
      case 'shocker':
        R('#140a12', 5, 3, 14, 19); R('#d8b830', 6, 4, 12, 17); R('#6a5a20', 6, 4, 12, 3);
        R('#140a12', 7, 9, 10, 3); R('#60c0ff', 8, 10, 3, 1); R('#60c0ff', 13, 10, 3, 1);
        R('#e8b890', 8, 14, 8, 5); R('#140a12', 10, 16, 4, 1); R('#8a7020', 3, 21, 18, 3);
        break;
      case 'mason':
        face('#d8a880'); R('#e8e8e8', 5, 3, 14, 3); R('#e8e8e8', 5, 3, 2, 10); R('#e8e8e8', 17, 3, 2, 10);
        R('#806020', 7, 9, 10, 3); R('#a0e0ff', 8, 10, 3, 1); R('#a0e0ff', 13, 10, 3, 1);
        R('#140a12', 10, 16, 4, 1); R('#4a4030', 3, 21, 18, 3);
        break;
      case 'gargan':
        R('#140a12', 5, 3, 14, 19); R('#2e7a3a', 6, 4, 12, 17); R('#1a4a22', 6, 4, 12, 4);
        R('#90ff60', 7, 10, 10, 2); R('#1a4a22', 11, 4, 2, 17); R('#e8a0a0', 9, 15, 6, 3); R('#140a12', 10, 16, 4, 1);
        R('#2e7a3a', 3, 21, 18, 3);
        break;
      case 'mysterio':
        R('#6a5a8a', 3, 18, 18, 6); R('#d8e0f0', 4, 1, 16, 18); R('#10281c', 5, 2, 14, 16);
        R('#40d060', 7, 5, 10, 10); R('#90ff90', 9, 7, 3, 3); R('#ffffff', 6, 3, 2, 2);
        break;
      case 'radio':
        R('#303840', 6, 6, 12, 15); R('#101418', 8, 8, 8, 5); R('#60ff80', 9, 9, 3, 1); R('#606870', 15, 1, 2, 6);
        R('#a0a8b0', 8, 15, 2, 2); R('#a0a8b0', 12, 15, 2, 2); R('#a0a8b0', 8, 18, 2, 2); R('#a0a8b0', 12, 18, 2, 2); R('#ff4040', 15, 16, 1, 1);
        break;
      case 'mj':
        face('#e8b890'); R('#4a2418', 5, 3, 14, 5); R('#4a2418', 5, 3, 3, 16); R('#4a2418', 16, 3, 3, 16);
        R('#140a12', 9, 11, 2, 2); R('#140a12', 14, 11, 2, 2); R('#b06060', 11, 17, 3, 1); R('#3a3a5a', 4, 21, 16, 3);
        break;
      case 'tobey':
        R('#140a12', 5, 3, 14, 19); R('#c8141e', 6, 4, 12, 17);
        R('#140a12', 7, 8, 4, 5); R('#140a12', 13, 8, 4, 5); R('#d8e4f0', 8, 9, 2, 3); R('#d8e4f0', 14, 9, 2, 3);
        R('#5a0a10', 11, 4, 1, 17); R('#5a0a10', 6, 13, 12, 1); R('#5a0a10', 6, 17, 12, 1); R('#5a0a10', 8, 5, 1, 16); R('#5a0a10', 15, 5, 1, 16);
        R('#1a2a8a', 4, 21, 16, 3);
        break;
      case 'andrew':
        R('#140a12', 5, 3, 14, 19); R('#d81a2a', 6, 4, 12, 17);
        R('#140a12', 6, 7, 5, 7); R('#140a12', 13, 7, 5, 7); R('#ffffff', 7, 8, 3, 5); R('#ffffff', 14, 8, 3, 5);
        R('#8a0a14', 11, 4, 1, 17); R('#8a0a14', 6, 16, 12, 1);
        R('#1a5ac8', 4, 21, 16, 3);
        break;
      case 'miles':
        R('#140a12', 5, 3, 14, 19); R('#1a1a22', 6, 4, 12, 17);
        R('#d8202c', 11, 4, 1, 17); R('#d8202c', 6, 12, 12, 1); R('#d8202c', 6, 16, 12, 1); R('#d8202c', 8, 5, 1, 15); R('#d8202c', 15, 5, 1, 15);
        R('#140a12', 7, 8, 4, 5); R('#140a12', 13, 8, 4, 5); R('#ffffff', 8, 9, 3, 3); R('#ffffff', 13, 9, 3, 3);
        R('#1a1a22', 4, 21, 16, 3); R('#d8202c', 11, 21, 2, 3);
        break;
      case 'gwen':
        R('#e8e8f0', 3, 2, 18, 22); R('#e04a9a', 5, 4, 14, 18);
        R('#f4f4f8', 6, 5, 12, 16); R('#140a12', 7, 8, 4, 5); R('#140a12', 13, 8, 4, 5); R('#ffffff', 8, 9, 2, 3); R('#ffffff', 14, 9, 2, 3);
        R('#d0d0d8', 11, 5, 1, 16); R('#40c0d0', 4, 21, 16, 3);
        break;
      case 'gwens':
        face('#f0c8a8'); R('#f0d060', 5, 3, 14, 5); R('#f0d060', 5, 3, 3, 14); R('#f0d060', 16, 3, 3, 14); R('#2a2a2a', 6, 6, 12, 1);
        R('#2a4a8a', 9, 11, 2, 2); R('#2a4a8a', 14, 11, 2, 2); R('#c06070', 11, 17, 3, 1); R('#3a3a5a', 4, 21, 16, 3);
        break;
      case 'miguel':
        R('#140a12', 5, 3, 14, 19); R('#1a2a6a', 6, 4, 12, 17);
        R('#d01a2a', 7, 5, 10, 3); R('#d01a2a', 10, 8, 4, 10); R('#d01a2a', 7, 16, 10, 2);
        R('#ff3040', 7, 9, 3, 2); R('#ff3040', 14, 9, 3, 2); R('#1a2a6a', 4, 21, 16, 3); R('#d01a2a', 10, 21, 4, 3);
        break;
      case 'harry':
        face('#e8c0a0'); R('#6a4020', 6, 3, 12, 5); R('#6a4020', 6, 3, 2, 8);
        R('#140a12', 9, 11, 2, 2); R('#140a12', 14, 11, 2, 2); R('#a06050', 11, 17, 3, 1); R('#2a3a2a', 4, 21, 16, 3);
        break;
      case 'venom':
        R('#0a0a10', 4, 2, 16, 21); R('#1a1a24', 5, 3, 14, 19);
        R('#ffffff', 6, 6, 5, 4); R('#ffffff', 13, 6, 5, 4); R('#ffffff', 7, 10, 3, 1); R('#ffffff', 14, 10, 3, 1);
        R('#ffffff', 7, 14, 10, 5); R('#0a0a10', 8, 15, 1, 3); R('#0a0a10', 10, 15, 1, 3); R('#0a0a10', 12, 15, 1, 3); R('#0a0a10', 14, 15, 1, 3);
        R('#e05080', 10, 17, 4, 5); R('#ffffff', 9, 21, 6, 3);
        break;
      case 'sandman':
        face('#c8a878'); R('#8a6a3a', 6, 3, 12, 3); R('#140a12', 9, 11, 2, 1); R('#140a12', 14, 11, 2, 1); R('#7a5a3a', 10, 17, 5, 1);
        R('#4a7a3a', 3, 21, 18, 3); R('#2a4a1a', 3, 22, 18, 1);
        break;
      case 'rino':
        R('#140a12', 4, 3, 16, 20); R('#6a6a72', 5, 4, 14, 18); R('#8a8a92', 5, 4, 14, 3);
        R('#e0e0d0', 10, 0, 4, 8); R('#c0c0b0', 11, 0, 2, 3); R('#e8b890', 8, 12, 8, 7); R('#140a12', 9, 14, 2, 1); R('#140a12', 13, 14, 2, 1);
        R('#4a4a52', 3, 21, 18, 3);
        break;
      case 'electro':
        R('#0a1a3a', 0, 0, 24, 24); face('#3a8aff'); R('#a0e0ff', 7, 6, 1, 10); R('#a0e0ff', 16, 8, 1, 9); R('#a0e0ff', 9, 17, 6, 1);
        R('#ffffff', 9, 11, 2, 2); R('#ffffff', 14, 11, 2, 2); R('#1a2a5a', 4, 21, 16, 3);
        break;
      case 'mancha':
        R('#140a12', 5, 3, 14, 19); R('#f0f0f0', 6, 4, 12, 17);
        R('#101010', 7, 5, 4, 4); R('#101010', 14, 7, 3, 3); R('#101010', 9, 12, 5, 5); R('#101010', 15, 15, 2, 3); R('#101010', 6, 17, 3, 3);
        R('#f0f0f0', 4, 21, 16, 3); R('#101010', 9, 21, 4, 3);
        break;
      case 'richard':
        face('#e0b890'); R('#4a3020', 6, 3, 12, 4); R('#202020', 8, 10, 4, 3); R('#202020', 13, 10, 4, 3); R('#202020', 12, 11, 1, 1);
        R('#8a8a8a', 9, 11, 2, 1); R('#8a8a8a', 14, 11, 2, 1); R('#8a6050', 11, 17, 3, 1); R('#5a4a3a', 4, 21, 16, 3);
        break;
      case 'ben':
        face('#e0b890'); R('#d0d0d0', 6, 3, 12, 3); R('#d0d0d0', 6, 3, 2, 8); R('#d0d0d0', 16, 3, 2, 8);
        R('#303030', 8, 10, 4, 3); R('#303030', 13, 10, 4, 3); R('#8a6050', 10, 17, 5, 1); R('#8a5a3a', 4, 21, 16, 3);
        break;
      case 'davis':
        face('#7a4a2a'); R('#1a2a4a', 5, 2, 14, 5); R('#e0c040', 11, 3, 2, 2); R('#140a12', 9, 11, 2, 2); R('#140a12', 14, 11, 2, 2);
        R('#2a1a10', 9, 15, 7, 2); R('#1a2a4a', 4, 21, 16, 3);
        break;
      case 'doom':
        R('#0a140a', 0, 0, 24, 24); R('#1e4a1e', 3, 1, 18, 23); R('#2a6a2a', 4, 2, 16, 4);
        R('#8a929a', 6, 5, 12, 16); R('#6a7078', 6, 5, 12, 2); R('#101010', 8, 9, 3, 2); R('#101010', 13, 9, 3, 2);
        R('#40ff60', 9, 9, 1, 1); R('#40ff60', 14, 9, 1, 1); R('#101010', 9, 15, 6, 1); R('#6a7078', 11, 12, 2, 3);
        break;
      case 'desconocido':
        R('#140a12', 5, 3, 14, 19); R('#16141a', 6, 4, 12, 17);
        R('#3a2014', 6, 4, 4, 6); R('#3a2014', 14, 14, 4, 5); R('#e06020', 7, 6, 1, 1); R('#e06020', 15, 16, 2, 1); R('#e06020', 12, 5, 1, 3);
        R('#140a12', 7, 8, 4, 5); R('#140a12', 13, 8, 4, 5); R('#ffb060', 8, 9, 2, 3); R('#e8c8a0', 14, 9, 2, 3);
        R('#2a1a14', 4, 21, 16, 3);
        break;
      case 'cero':
        R('#140806', 0, 0, 24, 24);
        face('#d8a888'); R('#2a1a10', 5, 2, 14, 5); R('#2a1a10', 5, 2, 2, 11); R('#2a1a10', 17, 2, 2, 8);
        R('#140a12', 9, 11, 2, 2); R('#140a12', 14, 11, 2, 2); R('#a06050', 13, 7, 1, 4); R('#a06050', 14, 13, 3, 1);
        R('#7a5040', 11, 17, 3, 1); R('#16141a', 4, 21, 16, 3); R('#e06020', 11, 22, 2, 2);
        break;
      default:
        face('#e0a878'); R('#3a2416', 6, 3, 12, 4); R('#140a12', 9, 11, 2, 1); R('#140a12', 14, 11, 2, 1); R('#4a6a8a', 4, 21, 16, 3);
    }
    R('#ffffff', 0, 0, 24, 1); R('#ffffff', 0, 23, 24, 1); R('#ffffff', 0, 0, 1, 24); R('#ffffff', 23, 0, 1, 24);
    this.cache[who] = c;
    return c;
  },
};

// ---------------- Cielos y skylines ----------------
const SKIES = {
  day: { bands: ['#2c6cc8', '#3a80d8', '#4c94e0', '#62a8e8', '#80bcee', '#a4d0f2'], far: '#7a9ec8', mid: '#5a7aa8', win: '#c8e0f8', sun: '#fff4c0', stars: false },
  sunset: { bands: ['#2b1b4a', '#4a2462', '#7a2e6a', '#b8466a', '#e8735a', '#f6a65a'], far: '#5a3060', mid: '#3a2048', win: '#ffd890', sun: '#ffe0a0', stars: false },
  dusk: { bands: ['#141a40', '#232a5a', '#3a3470', '#5e3e7c', '#8a4a7c', '#b85e78'], far: '#2e2a58', mid: '#1e1c40', win: '#ffe08a', sun: null, stars: true },
  night: { bands: ['#04060f', '#070b1c', '#0b1128', '#101838', '#152046', '#1c2a58'], far: '#141c3c', mid: '#0c1128', win: '#ffd870', sun: null, moon: true, stars: true },
  golden: { bands: ['#3a2a4a', '#6a3a4a', '#a0503a', '#d07838', '#f0a040', '#ffd070'], far: '#7a4a3a', mid: '#4a2a28', win: '#ffe0a0', sun: '#fff0b0', stars: false },
  teal: { bands: ['#020a14', '#051626', '#082236', '#0c3046', '#124058', '#1a526a'], far: '#0e2a3a', mid: '#081a26', win: '#9af0ff', sun: null, moon: true, stars: true },
  verse: { bands: ['#1a0830', '#3a0c50', '#6a1060', '#a01868', '#e02870', '#ff6a60'], far: '#4a1060', mid: '#260838', win: '#40f0ff', sun: null, stars: true, halftone: true },
  ruin: { bands: ['#0a0204', '#1a0406', '#300808', '#4a0e08', '#6a1a0a', '#8a2a0c'], far: '#200808', mid: '#120406', win: '#ff7020', sun: null, stars: false, debris: true },
  rift: { bands: ['#04070a', '#07100f', '#0a1a16', '#0f2820', '#15382a', '#1c4a36'], far: '#10241e', mid: '#0a1612', win: '#b0ffb0', sun: null, moon: false, stars: true, rift: true },
};

const Scenery = {
  skyCache: {}, stripCache: {},

  sky(name) {
    if (this.skyCache[name]) return this.skyCache[name];
    const def = SKIES[name];
    const c = makeCanvas(W, H);
    const x = c.getContext('2d');
    const n = def.bands.length;
    const bh = Math.ceil(H / n);
    for (let i = 0; i < n; i++) {
      x.fillStyle = def.bands[i];
      x.fillRect(0, i * bh, W, bh + 1);
      // difuminado con tramado entre bandas
      if (i < n - 1) {
        x.fillStyle = def.bands[i + 1];
        for (let yy = 0; yy < 4; yy++) {
          for (let xx = (yy % 2); xx < W; xx += (yy < 2 ? 4 : 2)) x.fillRect(xx, (i + 1) * bh - 4 + yy, 1, 1);
        }
      }
    }
    if (def.stars) {
      const r = makeRng(99);
      for (let i = 0; i < 70; i++) {
        x.fillStyle = r.chance(0.3) ? '#ffffff' : '#8890b8';
        x.fillRect(r.int(0, W), r.int(0, H * 0.6), 1, 1);
      }
    }
    if (def.moon) {
      x.fillStyle = '#f0f0d8'; x.beginPath(); x.arc(344, 26, 11, 0, TAU); x.fill();
      x.fillStyle = '#d8d8c0'; x.fillRect(338, 22, 3, 3); x.fillRect(346, 30, 4, 2);
    }
    if (def.sun) {
      x.fillStyle = def.sun; x.beginPath(); x.arc(290, 150, 20, 0, TAU); x.fill();
    }
    if (def.halftone) {
      for (let yy = 0; yy < H; yy += 4) for (let xx = (yy % 8 ? 2 : 0); xx < W; xx += 4) {
        const a = 0.08 + (yy / H) * 0.12;
        x.fillStyle = 'rgba(255,255,255,' + a.toFixed(2) + ')';
        x.fillRect(xx, yy, 1 + (yy > H / 2 ? 1 : 0), 1);
      }
    }
    if (def.debris) {
      const r = makeRng(66);
      for (let i = 0; i < 14; i++) {
        const dx = r.int(0, W), dy = r.int(10, 120), s = r.int(3, 12);
        x.fillStyle = '#1a0604'; x.fillRect(dx, dy, s, Math.ceil(s * 0.6));
        x.fillStyle = '#ff6020'; x.fillRect(dx, dy + Math.ceil(s * 0.6) - 1, s, 1);
      }
      x.fillStyle = 'rgba(255,90,30,0.35)';
      for (let i = 0; i < 3; i++) { x.beginPath(); x.arc(r.int(40, 340), r.int(20, 80), r.int(14, 30), 0, TAU); x.fill(); }
    }
    if (def.rift) {
      x.fillStyle = '#50ff90';
      for (let i = 0; i < 40; i++) {
        const yy = 30 + i, w = Math.max(1, 14 - Math.abs(20 - i) * 0.6);
        x.fillRect(250 + Math.sin(i * 0.5) * 6 - w / 2, yy, w, 1);
      }
      x.fillStyle = '#e0ffe8';
      for (let i = 5; i < 35; i++) x.fillRect(250 + Math.sin(i * 0.5) * 6, 30 + i, 1, 1);
    }
    this.skyCache[name] = c;
    return c;
  },

  // Tira de skyline repetible. layer: 'far' | 'mid'
  strip(name, layer, landmark = 'avengers') {
    const key = name + layer + landmark;
    if (this.stripCache[key]) return this.stripCache[key];
    const def = SKIES[name];
    const sw = 768, sh = 160;
    const c = makeCanvas(sw, sh);
    const x = c.getContext('2d');
    const r = makeRng(layer === 'far' ? 7 : 13);
    const col = def[layer];
    let px = 0;
    while (px < sw) {
      const bw = r.int(18, 48);
      const bh = layer === 'far' ? r.int(40, 120) : r.int(30, 90);
      x.fillStyle = col;
      x.fillRect(px, sh - bh, bw, bh);
      if (r.chance(0.2)) x.fillRect(px + bw / 2 - 1, sh - bh - r.int(6, 16), 2, 16);
      if (r.chance(0.25)) { x.fillRect(px + 3, sh - bh - 4, bw - 6, 4); }
      x.fillStyle = def.win;
      for (let wy = sh - bh + 4; wy < sh - 4; wy += 5) {
        for (let wx = px + 2; wx < px + bw - 2; wx += 4) {
          if (r.chance(layer === 'far' ? 0.12 : 0.2)) x.fillRect(wx, wy, 1, 2);
        }
      }
      px += bw + r.int(0, 4);
    }
    // Hitos de cada universo en la tira lejana
    if (layer === 'far' && landmark === 'ruins') {
      x.fillStyle = def.win;
      for (let i = 0; i < 60; i++) x.fillRect(r.int(0, sw), sh - r.int(0, 40), 1, 1);
      x.fillStyle = col;
      const tx = 560;
      x.fillRect(tx, sh - 120, 30, 120); x.fillRect(tx + 4, sh - 132, 12, 12);
      x.clearRect(tx + 18, sh - 124, 12, 20); x.clearRect(tx + 22, sh - 104, 8, 10);
    } else if (layer === 'far' && landmark === 'oscorp') {
      x.fillStyle = col;
      const tx = 540;
      x.fillRect(tx, sh - 150, 36, 150); x.fillRect(tx + 6, sh - 160, 24, 10); x.fillRect(tx + 16, sh - 176, 4, 16);
      x.fillStyle = def.win;
      x.fillRect(tx + 12, sh - 144, 12, 2); x.fillRect(tx + 12, sh - 134, 12, 2); x.fillRect(tx + 12, sh - 144, 2, 12); x.fillRect(tx + 22, sh - 144, 2, 12);
      x.fillStyle = col;
      const cx = 200;
      x.fillRect(cx, sh - 110, 24, 110); x.fillRect(cx + 4, sh - 124, 16, 14); x.fillRect(cx + 10, sh - 136, 4, 12);
      x.fillStyle = def.win; x.fillRect(cx + 8, sh - 120, 8, 8); x.fillStyle = col; x.fillRect(cx + 11, sh - 119, 1, 4); x.fillRect(cx + 11, sh - 116, 3, 1);
    } else if (layer === 'far' && landmark === 'alchemax') {
      x.fillStyle = col;
      const tx = 520;
      x.beginPath(); x.moveTo(tx, sh); x.lineTo(tx + 10, sh - 170); x.lineTo(tx + 40, sh - 170); x.lineTo(tx + 50, sh); x.fill();
      x.fillStyle = def.win;
      for (let yy = sh - 160; yy < sh - 10; yy += 12) x.fillRect(tx + 14, yy, 22, 2);
    } else if (layer === 'far') {
      x.fillStyle = col;
      const ex = 200;
      x.fillRect(ex, sh - 130, 26, 130); x.fillRect(ex + 5, sh - 145, 16, 15); x.fillRect(ex + 9, sh - 155, 8, 10); x.fillRect(ex + 12, sh - 160, 2, 8);
      const tx = 560;
      x.fillRect(tx, sh - 140, 30, 140); x.fillRect(tx + 30, sh - 118, 12, 118); x.fillRect(tx - 8, sh - 100, 8, 100);
      x.fillRect(tx + 4, sh - 150, 22, 10);
      x.fillStyle = def.win;
      // la "A" en lo alto de la torre
      x.fillRect(tx + 13, sh - 148, 4, 1); x.fillRect(tx + 12, sh - 147, 1, 5); x.fillRect(tx + 17, sh - 147, 1, 5); x.fillRect(tx + 12, sh - 145, 6, 1);
    }
    this.stripCache[key] = c;
    return c;
  },

  drawBackground(ctx, name, camX, camY, levelH, landmark) {
    ctx.drawImage(this.sky(name), 0, 0);
    const far = this.strip(name, 'far', landmark);
    const mid = this.strip(name, 'mid', landmark);
    const yBase = H - 20 - (camY - (levelH - H)) * 0.15;
    const fx = -((camX * 0.15) % far.width);
    for (let i = -1; i < 2; i++) ctx.drawImage(far, Math.floor(fx + i * far.width), Math.floor(yBase - far.height + 10));
    const mx = -((camX * 0.35) % mid.width);
    const yMid = H - (camY - (levelH - H)) * 0.3;
    for (let i = -1; i < 2; i++) ctx.drawImage(mid, Math.floor(mx + i * mid.width), Math.floor(yMid - mid.height + 20));
    ctx.fillStyle = SKIES[name].mid;
    ctx.fillRect(0, Math.floor(yMid + 20), W, H);
  },
};

// ---------------- Edificios pre-renderizados ----------------
const BSTYLES = {
  brick: { base: '#8a3a2a', dark: '#5a2418', ledge: '#b0604a', win: '#2a3040', lit: '#ffd870', frame: '#c8b090' },
  brown: { base: '#6a4430', dark: '#442a1c', ledge: '#8a6450', win: '#1e2430', lit: '#ffe090', frame: '#a08060' },
  concrete: { base: '#7a7e88', dark: '#50545e', ledge: '#a4a8b2', win: '#2a3448', lit: '#fff0a0', frame: '#9098a8' },
  glass: { base: '#2c4a6a', dark: '#1a2e46', ledge: '#6a8aaa', win: '#4a7aa8', lit: '#b8e0ff', frame: '#1a2e46' },
  warehouse: { base: '#3a3e44', dark: '#24272c', ledge: '#5a6068', win: '#1a1c20', lit: '#ffcc60', frame: '#2a2e34' },
  steel: { base: '#5a6470', dark: '#38404a', ledge: '#8a96a4', win: '#303844', lit: '#d0e8ff', frame: '#38404a' },
  verse: { base: '#3a1a6a', dark: '#1a0a3a', ledge: '#ff4a8a', win: '#1a1040', lit: '#40f0ff', frame: '#140828' },
  verse2: { base: '#1a4a7a', dark: '#0a2240', ledge: '#ffd040', win: '#0a1a30', lit: '#ff5aa0', frame: '#08142a' },
  ruin: { base: '#2a1a18', dark: '#140a08', ledge: '#4a2a20', win: '#0a0404', lit: '#ff6a20', frame: '#1a0c0a' },
  stone: { base: '#8a8470', dark: '#5e5a4a', ledge: '#b0aa94', win: '#3a3a30', lit: '#fff0b0', frame: '#6e6a58' },
};

function renderBuilding(w, h, styleName, seed, night) {
  const st = BSTYLES[styleName] || BSTYLES.brick;
  const c = makeCanvas(w, h);
  const x = c.getContext('2d');
  x.fillStyle = st.base; x.fillRect(0, 0, w, h);
  x.fillStyle = st.dark; x.fillRect(0, 0, 1, h); x.fillRect(w - 1, 0, 1, h);
  const r = makeRng(seed);
  if (styleName === 'brick' || styleName === 'brown') {
    x.fillStyle = st.dark;
    for (let yy = 4; yy < h; yy += 3) for (let xx = (yy % 6 ? 0 : 3); xx < w; xx += 6) x.fillRect(xx, yy, 1, 1);
  }
  const ww = styleName === 'glass' ? 3 : 4, wh = styleName === 'glass' ? 4 : 6;
  const gx = styleName === 'glass' ? 5 : 9, gy = styleName === 'glass' ? 6 : 11;
  const litP = night ? 0.45 : 0.12;
  for (let yy = 8; yy < h - 8; yy += gy) {
    for (let xx = 4; xx < w - 6; xx += gx) {
      x.fillStyle = st.frame; x.fillRect(xx - 1, yy - 1, ww + 2, wh + 2);
      x.fillStyle = r.chance(litP) ? st.lit : st.win;
      x.fillRect(xx, yy, ww, wh);
    }
  }
  if (styleName === 'verse' || styleName === 'verse2') {
    x.fillStyle = 'rgba(255,255,255,0.10)';
    for (let yy = 0; yy < h; yy += 3) for (let xx = (yy % 6 ? 1 : 0); xx < w; xx += 3) x.fillRect(xx, yy, 1, 1);
    x.fillStyle = '#000000'; x.fillRect(0, 0, 2, h); x.fillRect(w - 2, 0, 2, h);
  }
  x.fillStyle = st.ledge; x.fillRect(0, 0, w, 3);
  x.fillStyle = st.dark; x.fillRect(0, 3, w, 1);
  if (styleName === 'ruin') {
    // tejado roto y quemaduras
    for (let xx = 0; xx < w; xx += 4) { const d = Math.floor(hash2(seed, xx) * 10); x.clearRect(xx, 0, 4, d); }
    x.fillStyle = 'rgba(0,0,0,0.35)';
    for (let i = 0; i < 6; i++) x.fillRect(Math.floor(hash2(i, seed) * w), Math.floor(hash2(seed, i) * h), 8, 14);
  }
  return c;
}

// ---------------------------------------------------------------------------
// Destellos: imágenes rápidas antes de cada evento canónico
// ---------------------------------------------------------------------------
const FlashArt = {
  draw(ctx, id, t) {
    const R = (c, x, y, w, h) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
    const circ = (c, x, y, r) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };
    switch (id) {
      case 'doom':
        R('#020802', 0, 0, W, H);
        R('#123812', 122, 10, 140, 206); R('#1e4a1e', 132, 16, 120, 30);
        R('#7a828a', 146, 44, 92, 140); R('#9aa2aa', 146, 44, 92, 10);
        R('#0a0a0a', 160, 82, 24, 10); R('#0a0a0a', 200, 82, 24, 10);
        R(Math.floor(t * 20) % 2 ? '#60ff80' : '#20a040', 168, 85, 8, 4); R(Math.floor(t * 20) % 2 ? '#60ff80' : '#20a040', 208, 85, 8, 4);
        R('#0a0a0a', 172, 140, 40, 4); R('#5a6068', 186, 96, 12, 34);
        break;
      case '2099':
        R('#050818', 0, 0, W, H);
        for (let i = 0; i < 20; i++) R('#1a2a6a', 0, i * 11, W, 1);
        R('#1a2a6a', 150, 30, 84, 186); R('#d01a2a', 160, 40, 64, 20); R('#d01a2a', 184, 60, 16, 90); R('#d01a2a', 160, 140, 64, 16);
        R('#ff3040', 164, 70, 18, 8); R('#ff3040', 202, 70, 18, 8);
        R('#d01a2a', 100, 100, 50, 6); R('#d01a2a', 234, 100, 50, 6);
        Font.draw(ctx, '2099', W / 2, 190, '#ff3040', { align: 'center', scale: 2 });
        break;
      case 'crack':
        R('#ffffff', 0, 0, W, H);
        ctx.strokeStyle = '#000000'; ctx.lineWidth = 3;
        for (let k = 0; k < 6; k++) {
          ctx.beginPath(); let x = W / 2, y = H / 2; ctx.moveTo(x, y);
          for (let i = 0; i < 8; i++) { x += Math.cos(k + i * 0.7) * 30 + (hash2(k, i) - 0.5) * 30; y += Math.sin(k * 1.3 + i) * 20; ctx.lineTo(x, y); }
          ctx.stroke();
        }
        break;
      case 'harry':
        R('#1a1008', 0, 0, W, H); R('#3a2a1a', 0, 160, W, 56);
        R('#2a3a2a', 60, 60, 110, 16); R('#4a5a4a', 70, 56, 90, 6);
        circ('#e8c0a0', 190, 110, 22); R('#6a4020', 170, 86, 42, 14);
        R('#140a12', 180, 108, 5, 4); R('#140a12', 196, 108, 5, 4);
        R('#ff4040', 0, 0, W, 2); R('#ff4040', 0, H - 2, W, 2);
        break;
      case 'plane':
        R('#10141a', 0, 0, W, H);
        for (let i = 0; i < 30; i++) R('#3a4a6a', (i * 37 + t * 400) % W, (i * 23) % H, 1, 12);
        ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(-0.35);
        R('#d8d8e0', -110, -12, 220, 24); R('#b0b0b8', -30, -60, 50, 120); R('#b0b0b8', 80, -40, 20, 40);
        for (let i = 0; i < 8; i++) R('#2a3a5a', -90 + i * 22, -4, 10, 6);
        ctx.restore();
        R('#ff6020', 250, 120, 30, 20); R('#ffd040', 256, 124, 16, 10);
        break;
      case 'bentomb':
        R('#0a0c14', 0, 0, W, H); R('#1a2018', 0, 170, W, 46);
        R('#6a6a72', 142, 70, 100, 110); circ('#6a6a72', 192, 72, 50);
        R('#4a4a52', 150, 80, 84, 90);
        Font.draw(ctx, 'BEN PARKER', W / 2, 110, '#d0d0d8', { align: 'center' });
        Font.draw(ctx, 'TÍO. AMIGO. HÉROE.', W / 2, 126, '#a0a0a8', { align: 'center' });
        R('#c02020', 180, 172, 6, 6); R('#c02020', 198, 174, 6, 6);
        break;
      case 'clock':
        R('#060a10', 0, 0, W, H);
        circ('#c8c0a0', W / 2, H / 2, 80); circ('#1a1a1a', W / 2, H / 2, 72);
        for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; R('#c8c0a0', W / 2 + Math.cos(a) * 62 - 2, H / 2 + Math.sin(a) * 62 - 2, 4, 4); }
        ctx.strokeStyle = '#c8c0a0'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(W / 2, H / 2); ctx.lineTo(W / 2 + Math.cos(t * 6) * 50, H / 2 + Math.sin(t * 6) * 50); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(W / 2, H / 2); ctx.lineTo(W / 2, H / 2 - 36); ctx.stroke();
        break;
      case 'gwenfall':
        R('#04060c', 0, 0, W, H);
        for (let i = 0; i < 18; i++) R('#20283a', (i * 29) % W, 0, 2, H);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(W / 2 + 4, 0); ctx.lineTo(W / 2 + 4, 70 + t * 80); ctx.stroke();
        { const gy = 110 + t * 60; circ('#f0d060', W / 2, gy - 18, 9); R('#3a3a5a', W / 2 - 6, gy - 10, 12, 22); R('#f0c8a8', W / 2 - 14, gy - 16, 8, 3); R('#f0c8a8', W / 2 + 6, gy - 20, 8, 3); }
        break;
      case 'ruin':
        R('#1a0404', 0, 0, W, H);
        for (let i = 0; i < 12; i++) { const h = 40 + hash2(i, 3) * 120; R('#0a0202', i * 34, H - h, 28, h); R('#ff5020', i * 34 + 6, H - h + 10, 3, 3); }
        circ('rgba(255,80,20,0.4)', 280, 60, 40);
        break;
      case 'alone':
        R('#04040a', 0, 0, W, H); R('#0e0e1a', 0, 150, W, 66);
        circ('#e8e8d0', 300, 50, 16);
        Rig.draw(ctx, 180, 150, 1, Poses.sit(), SUITS[0].palObj, { scale: 3 });
        break;
      case 'spiders':
        R('#0a0a0a', 0, 0, W, H);
        for (let i = 0; i < 12; i++) {
          const x = 30 + (i % 6) * 60, y = 50 + Math.floor(i / 6) * 90;
          const cols = ['#e0202c', '#1a1a22', '#e8e8f0', '#1a2a6a', '#c8141e', '#16141a'];
          R(cols[i % cols.length], x - 20, y - 30, 40, 60);
          UI.spiderIcon(ctx, x - 4, y - 4, i % 2 ? '#ffffff' : '#140a12');
        }
        break;
      default: R('#000000', 0, 0, W, H);
    }
  },
};
