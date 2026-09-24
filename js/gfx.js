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
const FLASH_PAL = makePal({ outline: '#ffffff', head: '#ffffff', hair: '#ffffff', torso: '#ffffff', leg: '#ffffff', boot: '#ffffff', eye: '#ffffff', face: 'flat' });

const SUITS = [
  { id: 'bnd', name: 'Traje Brand New Day', desc: 'Telarañas en relieve, costados azules y franjas negras.', pal: { webs: true, webLine: '#2c2a34', head: '#d0202c', torso: '#d0202c', torsoLow: '#d0202c', side: '#2a7ad8', trim: '#18161c', shoulder: '#d0202c', arm: '#2a7ad8', arm2: '#d0202c', leg: '#2a7ad8', boot: '#d0202c', face: 'spider', emblem: '#18161c', emblemStyle: 'long', eye: '#e8f0f4' } },
  { id: 'nwh', name: 'Traje hecho a mano', desc: 'Cosido por Peter tras No Way Home.', pal: { webs: true, webLine: '#5a0c14', head: '#e0202c', torso: '#e0202c', torsoLow: '#2046c8', side: '#2046c8', arm: '#e0202c', arm2: '#e0202c', leg: '#2046c8', boot: '#e0202c', face: 'spider', emblem: '#140a12', emblemStyle: 'long' } },
  { id: 'casero', name: 'Traje casero', desc: 'Sudadera roja y gafas. Donde todo empezó.', pal: { deco: 'hood', head: '#c8202a', torso: '#c8202a', torsoLow: '#c8202a', arm: '#c8202a', arm2: '#c8202a', hand: '#e8e8e8', leg: '#2a3a8a', boot: '#d8d8d8', face: 'goggles', emblem: '#140a12', eye: '#b8d8ff' } },
  { id: 'sigilo', name: 'Traje de sigilo', desc: 'El traje del "Mono Nocturno".', pal: { deco: 'stealth', head: '#20242c', torso: '#20242c', torsoLow: '#20242c', arm: '#20242c', leg: '#20242c', boot: '#2a2e38', face: 'spider', emblem: '#4a5060', eye: '#8ad8ff' } },
  { id: 'stark', name: 'Traje Stark', desc: 'Regalo del señor Stark.', pal: { webs: true, webLine: '#4a0a10', head: '#d82028', torso: '#d82028', torsoLow: '#1c38a8', side: '#1c38a8', trim: '#141418', shoulder: '#d82028', arm: '#1c38a8', arm2: '#d82028', leg: '#1c38a8', boot: '#d82028', face: 'spider', emblem: '#141418', emblemStyle: 'small' } },
  { id: 'ffh', name: 'Traje mejorado', desc: 'Rojo y negro, hecho en el jet de Stark.', pal: { webs: true, webLine: '#6a0a12', head: '#e01a24', torso: '#e01a24', torsoLow: '#e01a24', side: '#16161c', shoulder: '#e01a24', arm: '#16161c', arm2: '#e01a24', leg: '#16161c', boot: '#e01a24', face: 'spider', emblem: '#16161c', emblemStyle: 'long' } },
  { id: 'iron', name: 'Iron Spider', desc: 'Nanotecnología roja y dorada. Con patas de araña.', pal: { deco: 'ironlegs', head: '#c01822', torso: '#c01822', torsoLow: '#c01822', side: '#e0b030', trim: '#3a0a10', shoulder: '#c01822', arm: '#e0b030', arm2: '#c01822', leg: '#c01822', boot: '#e0b030', face: 'spider', emblem: '#e0b030', emblemStyle: 'long' } },
  { id: 'raimi', name: 'Traje clásico (96283)', desc: 'Regalo de Tierra-96283. Telarañas en relieve.', pal: { webs: true, webLine: '#2a1418', head: '#c8141e', torso: '#c8141e', torsoLow: '#c8141e', side: '#1a2a8a', arm: '#c8141e', arm2: '#c8141e', leg: '#1a2a8a', boot: '#c8141e', face: 'spider', emblem: '#140a12', emblemStyle: 'small', eye: '#d8e4f0', eyeSize: 0.9 } },
  { id: 'tasm', name: 'Traje de Tierra-120703', desc: 'Ojos grandes, azul eléctrico.', pal: { webs: true, webLine: '#1a1a24', head: '#d81a2a', torso: '#d81a2a', torsoLow: '#d81a2a', side: '#1a5ac8', shoulder: '#d81a2a', arm: '#1a5ac8', arm2: '#d81a2a', leg: '#1a5ac8', boot: '#d81a2a', face: 'spider', emblem: '#140a12', emblemStyle: 'long', eye: '#ffffff', eyeSize: 1.25 } },
  { id: 'verse', name: 'Traje del Spider-Verse', desc: 'Negro y rojo, con estilo de cómic.', pal: { webs: true, webLine: '#d8202c', head: '#1a1a22', torso: '#1a1a22', torsoLow: '#1a1a22', arm: '#1a1a22', arm2: '#1a1a22', hand: '#d8202c', leg: '#1a1a22', boot: '#d8202c', face: 'spider', emblem: '#d8202c', emblemStyle: 'long', eye: '#ffffff' } },
  { id: 'avanzado', name: 'Traje avanzado (1048)', desc: 'De una Tierra de consola. Araña blanca enorme.', pal: { webs: true, webLine: '#8a0c10', head: '#e02a24', torso: '#e02a24', torsoLow: '#e02a24', side: '#1a5ad0', shoulder: '#e02a24', arm: '#1a5ad0', arm2: '#e02a24', leg: '#1a5ad0', boot: '#e02a24', face: 'spider', emblem: '#f4f4f4', emblemStyle: 'big', eye: '#ffffff' } },
  { id: 'sociedad', name: 'Traje de la Sociedad Araña', desc: 'Diseñado en 2099. Rastrea anomalías.', pal: { webs: true, webLine: '#0a0e1a', head: '#1a2040', torso: '#1a2040', torsoLow: '#1a2040', side: '#c81a3a', trim: '#40e0ff', arm: '#1a2040', arm2: '#c81a3a', leg: '#1a2040', boot: '#c81a3a', face: 'spider', emblem: '#40e0ff', emblemStyle: 'long', eye: '#ff5070' } },
  { id: 'tierra0', name: 'Traje de Tierra-0', desc: 'El traje de antes del fuego. Todavía no está quemado.', pal: { webs: true, webLine: '#5a0c14', head: '#e8242e', torso: '#e8242e', torsoLow: '#e8242e', side: '#2a4ad8', arm: '#e8242e', arm2: '#e8242e', leg: '#2a4ad8', boot: '#e8242e', face: 'spider', emblem: '#140a12', emblemStyle: 'small', eye: '#ffe8a0' } },
  { id: 'cero', name: 'Traje quemado', desc: 'El traje de Peter Cero. Pesa más de lo que parece.', pal: { deco: 'burn', head: '#16141a', torso: '#16141a', torsoLow: '#2a1a14', arm: '#16141a', arm2: '#2a1a14', leg: '#16141a', boot: '#3a2014', face: 'spider', emblem: '#e06020', emblemStyle: 'long', eye: '#ffb060' } },
];
const START_SUITS = ['bnd', 'nwh', 'casero', 'stark', 'ffh', 'iron', 'avanzado'];
const GWEN_PAL = makePal({ deco: 'hood', outline: '#140a12', webs: true, webLine: '#e04a9a', head: '#f4f4f8', torso: '#f4f4f8', torsoLow: '#f4f4f8', side: '#1a1a22', arm: '#e04a9a', arm2: '#f4f4f8', hand: '#40c0d0', leg: '#f4f4f8', boot: '#40c0d0', face: 'spider', emblem: '#1a1a22', eye: '#ffffff' });
SUITS.forEach((s) => { s.palObj = makePal(Object.assign({ outline: '#140a12' }, s.pal)); });

// ---------------- Poses ----------------
const BASE_POSE = { t: 4, h: 0, l1: -12, l2: 6, r1: 14, r2: -6, a1: -15, a2: -35, b1: 15, b2: -50, hy: 0, rot: 0 };
function P(o) { return Object.assign({}, BASE_POSE, o); }
const Poses = {
  idle(t) { const b = Math.sin(t * 3); return P({ hy: b > 0.6 ? 1 : 0, a2: -35 - b * 5, b2: -50 + b * 5 }); },
  // la pose agachada clásica de Spider-Man (2 fotogramas de respiración)
  stance(t) { const b = Math.floor(t * 2.5) % 2; return P({ t: 30, h: -25, l1: -30, l2: 100, r1: 70, r2: -125, a1: 30, a2: -90, b1: 70 + b * 8, b2: -40, hy: 6 + b }); },
  // guardia de Maximum Carnage: medio agachado, puños arriba, respiración en 2 fotogramas
  mcStance(t) { const b = Math.floor(t * 2.2) % 2; return P({ t: 18, h: -12, l1: -28, l2: 40 + b * 8, r1: 34, r2: -50 - b * 8, a1: 45, a2: -115, b1: 65 + b * 6, b2: -105, hy: 3 + b }); },
  // caminar encorvado con los puños en guardia
  mcWalk(ph) {
    const s = Math.sin(ph), c = Math.cos(ph);
    return P({ t: 18, h: -10, l1: -32 * s, l2: 20 + 40 * Math.max(0, -c), r1: 32 * s, r2: -20 - 40 * Math.max(0, c),
      a1: 40 + 18 * s, a2: -110, b1: 60 - 18 * s, b2: -105, hy: Math.abs(c) > 0.8 ? 0 : 1 });
  },
  punch3() { return P({ t: 8, l1: -30, l2: 15, r1: 35, r2: -20, a1: -20, a2: -70, b1: 135, b2: -35 }); },
  grab() { return P({ t: 14, l1: -25, l2: 20, r1: 30, r2: -25, a1: 75, a2: -45, b1: 85, b2: -45, hy: 1 }); },
  knee() { return P({ t: 6, l1: -10, l2: 5, r1: 100, r2: -120, a1: 70, a2: -35, b1: 80, b2: -40 }); },
  toss() { return P({ t: -28, l1: -35, l2: 20, r1: 30, r2: -10, a1: 160, a2: -10, b1: 170, b2: -10 }); },
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
  // El cuerpo se rasteriza píxel a píxel a resolución fina (RES): volumen con luz,
  // contorno, telarañas en relieve, ojos de lente y emblema.
  draw(ctx, x, y, facing, pose, pal, opts = {}) {
    const s = opts.scale || 1;
    pose = quantizePose(pose);
    const lp = this.compute(pose, s);
    const wp = {};
    for (const k in lp) wp[k] = [Math.round(x + facing * lp[k][0]), Math.round(y + lp[k][1])];
    if (opts.extraBack) opts.extraBack(ctx, wp, facing, s);
    if (pal.deco === 'cape' && pal.face !== 'flat') {
      // capa que ondea hacia atrás
      const t = Date.now() / 300, f = facing;
      ctx.fillStyle = pal.capeCol || pal.boot; ctx.strokeStyle = pal.outline; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(wp.sh[0] + f * 2 * s, wp.sh[1] - 1 * s); ctx.lineTo(wp.sh[0] - f * 3 * s, wp.sh[1]);
      ctx.lineTo(wp.hip[0] - f * (9 + Math.sin(t) * 2) * s, wp.hip[1] + 6 * s); ctx.lineTo(wp.hip[0] - f * 2 * s, wp.hip[1] + 4 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    const img = Sprite.cached(pose, lp, facing, s, pal, opts);
    ctx.drawImage(img.canvas, 0, 0, img.w, img.h, Math.round(x * SPR_D - img.ox) / SPR_D, Math.round(y * SPR_D - img.oy) / SPR_D, img.w / SPR_D, img.h / SPR_D);
    if (pal.deco === 'noir' && pal.face !== 'flat') {
      // sombrero de ala (fedora)
      const hx = wp.head[0], hy = wp.head[1];
      ctx.fillStyle = '#18181c';
      ctx.fillRect(hx - 3.6 * s, hy - 2.4 * s, 7.2 * s, 1 * s);
      ctx.fillRect(hx - 2.3 * s, hy - 4.6 * s, 4.6 * s, 2.4 * s);
      ctx.fillStyle = '#50505a'; ctx.fillRect(hx - 2.3 * s, hy - 2.9 * s, 4.6 * s, 0.6 * s);
    } else if (pal.deco === 'punk' && pal.face !== 'flat') {
      // cresta de colores
      const hx = wp.head[0], hy = wp.head[1];
      const cols = ['#40e0ff', '#ff40a0', '#ffe040'];
      for (let i = -2; i <= 2; i++) {
        ctx.fillStyle = cols[(i + 3) % 3];
        ctx.beginPath(); ctx.moveTo(hx + i * s - 0.7 * s, hy - 2 * s); ctx.lineTo(hx + i * s + 0.7 * s, hy - 2 * s); ctx.lineTo(hx + i * s * 1.3, hy - (4.8 - Math.abs(i) * 0.6) * s); ctx.fill();
      }
    }
    if (pal.face === 'bowl') {
      ctx.fillStyle = 'rgba(190,230,255,0.22)'; ctx.strokeStyle = 'rgba(230,245,255,0.7)'; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.arc(wp.head[0] + 0.5, wp.head[1], 3.6 * s, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(wp.head[0] - 2 * s, wp.head[1] - 2.6 * s, 1, 1);
    }
    if (opts.extra) opts.extra(ctx, wp, facing, s);
    return wp;
  },
};
// Animación retro: los ángulos van a saltos (como fotogramas dibujados a mano)
const Q_KEYS = ['t', 'h', 'l1', 'l2', 'r1', 'r2', 'a1', 'a2', 'b1', 'b2'];
function quantizePose(p) {
  const o = Object.assign({}, p);
  for (const k of Q_KEYS) o[k] = Math.round((p[k] || 0) / 15) * 15;
  o.rot = Math.round((p.rot || 0) / 30) * 30;
  o.hy = Math.round(p.hy || 0);
  return o;
}
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
      case 'lyla':
        R('#0a1830', 0, 0, 24, 24); R('#40f0ff', 7, 3, 10, 12); R('#a0ffff', 8, 4, 8, 2); R('#ff70c0', 6, 3, 12, 3); R('#ff70c0', 6, 3, 2, 12);
        R('#0a1830', 9, 8, 2, 2); R('#0a1830', 13, 8, 2, 2); R('#0a1830', 10, 12, 4, 1); R('#40f0ff', 5, 16, 14, 6); R('#a0ffff', 8, 17, 8, 1);
        break;
      case 'gabriella':
        face('#c89878'); R('#2a1a10', 5, 3, 14, 5); R('#2a1a10', 5, 3, 3, 14); R('#2a1a10', 16, 3, 3, 14);
        R('#140a12', 9, 11, 2, 2); R('#140a12', 14, 11, 2, 2); R('#c06070', 11, 17, 3, 1); R('#f0a0c0', 4, 21, 16, 3);
        break;
      case 'prowler':
        R('#140a12', 4, 2, 16, 21); R('#3a2a5a', 5, 3, 14, 19); R('#241a3a', 5, 3, 14, 5);
        R('#60ff80', 7, 10, 10, 3); R('#b0ffc0', 8, 11, 3, 1); R('#b0ffc0', 13, 11, 3, 1); R('#1a1426', 7, 15, 10, 5); R('#3a2a5a', 3, 21, 18, 3);
        break;
      case 'vulture':
        R('#1a0a14', 0, 0, 24, 24); R('#140a12', 5, 3, 14, 19); R('#2a2a34', 6, 4, 12, 17); R('#c81a3a', 6, 4, 12, 4);
        R('#ff4060', 7, 10, 10, 2); R('#e8b890', 9, 14, 6, 5); R('#140a12', 10, 16, 4, 1); R('#c81a3a', 2, 20, 20, 4);
        break;
      case 'doombot':
        R('#0a140a', 0, 0, 24, 24); R('#1e4a1e', 3, 1, 18, 23); R('#6a7078', 6, 5, 12, 16); R('#8a929a', 7, 6, 10, 3);
        R('#101010', 8, 9, 3, 2); R('#101010', 13, 9, 3, 2); R('#40ff60', 9, 9, 1, 1); R('#40ff60', 14, 9, 1, 1); R('#40ff60', 11, 17, 2, 2);
        break;
      case 'may':
        face('#f0c8a8'); R('#6a4a3a', 5, 3, 14, 5); R('#6a4a3a', 5, 3, 3, 12); R('#6a4a3a', 16, 3, 3, 12);
        R('#303030', 8, 10, 4, 3); R('#303030', 13, 10, 4, 3); R('#c06070', 11, 17, 3, 1); R('#8a4a6a', 4, 21, 16, 3);
        break;
      case 'tony':
        face('#e0b088'); R('#2a1a10', 6, 3, 12, 4); R('#2a1a10', 9, 16, 7, 4); R('#e0b088', 11, 17, 3, 1);
        R('#140a12', 9, 11, 2, 1); R('#140a12', 14, 11, 2, 1); R('#8a1a20', 3, 21, 18, 3); R('#a0e8ff', 11, 21, 2, 2);
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
  neon: { bands: ['#0a0418', '#1a0630', '#340a48', '#5a0e5a', '#8a1a60', '#c02a5a'], far: '#2a0e44', mid: '#16082a', win: '#40f0ff', sun: null, stars: true, neon: true },
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
    if (def.neon) {
      // coches voladores y anuncios holográficos
      const r = makeRng(2099);
      for (let i = 0; i < 18; i++) { x.fillStyle = r.chance(0.5) ? '#ff4aa0' : '#40f0ff'; x.fillRect(r.int(0, W), r.int(20, 120), r.int(3, 6), 1); }
      x.fillStyle = 'rgba(64,240,255,0.25)'; x.fillRect(40, 30, 50, 14); x.fillStyle = 'rgba(255,74,160,0.25)'; x.fillRect(290, 50, 40, 18);
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
    } else if (layer === 'far' && landmark === 'spire') {
      // aguja de Alchemax 2099 y torre de la Sociedad Araña
      x.fillStyle = col;
      const tx = 500;
      x.beginPath(); x.moveTo(tx, sh); x.lineTo(tx + 18, sh - 158); x.lineTo(tx + 22, sh - 158); x.lineTo(tx + 40, sh); x.fill();
      x.fillRect(tx + 19, sh - 176, 2, 18);
      x.fillStyle = '#ff4aa0'; x.fillRect(tx + 19, sh - 178, 2, 2);
      x.fillStyle = def.win; for (let yy = sh - 140; yy < sh - 8; yy += 10) x.fillRect(tx + 14 + (sh - yy) * 0.03, yy, 12 - (sh - yy) * 0.06, 1);
      x.fillStyle = col; x.fillRect(180, sh - 120, 40, 120); x.fillRect(172, sh - 96, 56, 6);
      x.fillStyle = '#c81a3a'; x.fillRect(196, sh - 116, 8, 8);
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

  drawIndoor(ctx, camX) {
    ctx.fillStyle = '#12141a'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#1a1d24';
    for (let x = -(camX * 0.5 % 120); x < W; x += 120) ctx.fillRect(Math.round(x), 0, 60, H);
    ctx.fillStyle = '#20242c';
    for (let x = -(camX * 0.5 % 240); x < W; x += 240) ctx.fillRect(Math.round(x) + 20, 60, 100, 60);
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


// ---------------------------------------------------------------------------
// Fila de fachadas detrás de la calle (estilo beat 'em up de 16 bits): ladrillo,
// ventanas con alféizar, tiendas con toldo y persiana, grafitis, escaleras de
// incendio y depósitos de agua. Se pinta a resolución de pantalla (2x) y se repite.
// ---------------------------------------------------------------------------
const FACADE_PALS = {
  default: { walls: [['#6a2c2a', '#4a1c20', '#8a3e34'], ['#4e3a52', '#34263c', '#665070'], ['#5a4a3a', '#3c2e26', '#7a6450'], ['#3e4a5e', '#28303e', '#56647a']],
    glass: '#141a34', glassHi: '#2c3a66', lit: '#f8d070', litDim: '#c08a40', trim: '#b8a488', trimDk: '#6a5a4a', street: '#1a1420', neonA: '#ff3a6a', neonB: '#3ae0ff', ink: '#0a060c' },
  ruin: { walls: [['#3a1a14', '#200c0a', '#4e2418'], ['#2e1c1a', '#1a0e0c', '#40261e']], glass: '#0a0404', glassHi: '#2a0c06', lit: '#ff7020', litDim: '#a03a10', trim: '#5a3a2a', trimDk: '#2a1810', street: '#100404', neonA: '#ff5020', neonB: '#ff9030', ink: '#060202' },
  neon: { walls: [['#241c44', '#140e2a', '#342a5c'], ['#1c2440', '#0e1428', '#2a3458']], glass: '#0c0c24', glassHi: '#2a2a60', lit: '#40f0ff', litDim: '#ff4aa0', trim: '#ff4aa0', trimDk: '#6a1a50', street: '#0a0618', neonA: '#ff4aa0', neonB: '#40f0ff', ink: '#05030c' },
  verse: { walls: [['#5a1a6a', '#34104a', '#7a2a8a'], ['#1a3a7a', '#0e2250', '#2a5aa0']], glass: '#10081e', glassHi: '#3a2060', lit: '#40f0ff', litDim: '#ff5aa0', trim: '#ffd040', trimDk: '#8a5a10', street: '#140a20', neonA: '#ff3a8a', neonB: '#40f0ff', ink: '#000000' },
  rift: { walls: [['#1e3a30', '#10241c', '#2c5044'], ['#26303a', '#141c24', '#384654']], glass: '#06100c', glassHi: '#1c4a38', lit: '#b0ffb0', litDim: '#50c080', trim: '#6a8a7a', trimDk: '#2a3a32', street: '#060c0a', neonA: '#50ff90', neonB: '#b0ffe0', ink: '#020604' },
};
const FacadeRow = {
  cache: {},
  palFor(sky) { return FACADE_PALS[sky] || FACADE_PALS.default; },
  strip(sky, day) {
    const key = sky + (day ? 'd' : 'n');
    if (this.cache[key]) return this.cache[key];
    const P = this.palFor(sky);
    const SW = 2048, SH = 300; // píxeles de pantalla (= 1024 x 150 unidades de mundo)
    const c = makeCanvas(SW, SH), g = c.getContext('2d');
    const r = makeRng(sky.length * 977 + (day ? 5 : 0));
    const R = (col, x, y, w, h) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    let x = 0;
    while (x < SW) {
      let bw = r.int(10, 20) * 8; if (x + bw > SW - 40) bw = SW - x;
      const bh = r.int(150, 290), top = SH - bh;
      const wall = r.pick(P.walls);
      const [base, dark, lite] = wall;
      // callejón entre edificios
      if (r.chance(0.12) && bw < SW - x - 60) {
        const aw = r.int(4, 7) * 8;
        R(P.ink, x, SH - 150, aw, 150); R(shade(base, -0.55), x + 4, SH - 146, aw - 8, 146);
        // contenedor de basura
        R('#1e3a2a', x + 6, SH - 26, aw - 12, 22); R('#2e5a3e', x + 6, SH - 26, aw - 12, 3); R(P.ink, x + 6, SH - 4, aw - 12, 2);
        x += aw; continue;
      }
      R(base, x, top, bw, bh);
      // ladrillo: hiladas cada 4 px, juntas desplazadas
      const brick = r.chance(0.7);
      if (brick) for (let yy = top + 10; yy < SH; yy += 4) {
        R(dark, x, yy, bw, 1);
        const off = ((yy - top) / 4) % 2 ? 0 : 4;
        for (let xx = x + off; xx < x + bw; xx += 8) R(dark, xx, yy - 3, 1, 3);
        if (hash2(yy, x) < 0.25) R(lite, x + Math.floor(hash2(x, yy) * bw), yy - 3, 5, 1);
      } else {
        for (let xx = x + 12; xx < x + bw; xx += 24) R(dark, xx, top + 8, 1, bh);
        for (let yy = top + 22; yy < SH; yy += 22) R(dark, x, yy, bw, 1);
      }
      // cornisa con dentículos y sombra
      R(P.trim, x - 2, top, bw + 4, 6); R(P.trimDk, x - 2, top + 6, bw + 4, 2);
      for (let xx = x; xx < x + bw; xx += 6) R(P.trimDk, xx, top + 8, 3, 3);
      R('rgba(0,0,0,0.35)', x, top + 11, bw, 3);
      // bordes verticales (sombra de volumen)
      R(dark, x, top, 3, bh); R('rgba(0,0,0,0.3)', x + bw - 4, top, 4, bh);
      // ventanas
      const floors = [], shopH = 64;
      const ww = r.pick([12, 14, 16]), wh = r.pick([18, 22, 24]), gapX = ww + r.int(10, 16), floorH = wh + r.int(14, 20);
      const cols = Math.max(1, Math.floor((bw - 16) / gapX)), x0w = x + Math.floor((bw - (cols * gapX - (gapX - ww))) / 2);
      for (let fy = top + 22; fy + wh < SH - shopH - 8; fy += floorH) floors.push(fy);
      for (const fy of floors) for (let k = 0; k < cols; k++) {
        const wx = x0w + k * gapX;
        R(P.trimDk, wx - 2, fy - 3, ww + 4, 3); R(P.trim, wx - 2, fy - 4, ww + 4, 1);          // dintel
        R(P.ink, wx - 1, fy - 1, ww + 2, wh + 2);
        const lit = !day && hash2(wx, fy) < 0.35;
        if (lit) {
          R(P.lit, wx, fy, ww, wh); R(P.litDim, wx, fy + wh - 5, ww, 5);
          if (hash2(fy, wx) < 0.4) { R(P.litDim, wx + 3, fy + 6, 5, wh - 6); R(P.litDim, wx + 4, fy + 3, 3, 3); } // silueta
          else for (let yy = fy + 2; yy < fy + wh - 5; yy += 3) R(P.litDim, wx, yy, ww, 1);           // persiana
        } else {
          R(P.glass, wx, fy, ww, wh);
          for (let i = 0; i < 5; i++) R(P.glassHi, wx + ww - 3 - i, fy + 2 + i * 2, 2, 2);         // reflejo
        }
        R(P.ink, wx + (ww >> 1), fy, 1, wh);                                                     // parteluz
        R(P.ink, wx, fy + (wh >> 1) - 1, ww, 1);
        R(P.trim, wx - 3, fy + wh + 1, ww + 6, 2); R('rgba(0,0,0,0.4)', wx - 2, fy + wh + 3, ww + 4, 2); // alféizar
      }
      // escalera de incendios
      if (floors.length > 2 && r.chance(0.55)) {
        const fx = x0w + Math.max(0, (cols >> 1) - 1) * gapX - 6, fw = Math.min(bw - 12, gapX * 2 + 12);
        for (let i = 0; i < floors.length; i++) {
          const py = floors[i] + wh + 4;
          R(P.ink, fx, py, fw, 3); R('#3a3a44', fx, py, fw, 1);
          for (let xx = fx; xx <= fx + fw; xx += 4) R(P.ink, xx, py - 12, 1, 12);
          R(P.ink, fx, py - 13, fw, 1);
          if (i < floors.length - 1) {
            const ny = floors[i + 1] + wh + 4, dir = i % 2;
            for (let k = 0; k < 16; k++) { const lx = dir ? fx + 6 + k * 2 : fx + fw - 8 - k * 2; R(P.ink, lx, py + 3 + Math.floor((ny - py - 3) * k / 16), 2, 2); }
          }
        }
      }
      // planta baja: tienda con toldo, rótulo, escaparate y puerta (o persiana con grafiti)
      const sy = SH - shopH;
      R(P.trimDk, x, sy - 4, bw, 4); R(P.trim, x, sy - 5, bw, 1);
      if (r.chance(0.35)) {
        R('#5a5e66', x + 6, sy + 10, bw - 12, shopH - 10);
        for (let yy = sy + 12; yy < SH; yy += 3) R('#3e424a', x + 6, yy, bw - 12, 1);
        const gc = [P.neonA, P.neonB, '#ffe040', '#60e060'];
        // grafiti: letras de trazo grueso con contorno
        const tags = Math.max(1, Math.floor((bw - 20) / 60));
        for (let tg = 0; tg < tags; tg++) {
          const gx0 = x + 12 + tg * 60 + Math.floor(hash2(tg, x) * 10), gy0 = sy + 22 + Math.floor(hash2(x, tg) * 14), col = gc[(tg + x) % 4];
          const strokes = [];
          for (let L = 0; L < 4; L++) {
            const lx = gx0 + L * 11, h1 = hash2(L + tg, x + L);
            strokes.push([[lx, gy0 + 16], [lx + 2, gy0], [lx + 8, gy0 + (h1 < 0.5 ? 8 : 2)], [lx + 9, gy0 + 16]]);
          }
          for (const pass of [0, 1]) {
            g.strokeStyle = pass ? col : P.ink; g.lineWidth = pass ? 3 : 6; g.lineJoin = 'round'; g.lineCap = 'round';
            for (const st of strokes) { g.beginPath(); g.moveTo(st[0][0], st[0][1]); for (const pt of st.slice(1)) g.lineTo(pt[0], pt[1]); g.stroke(); }
          }
          R('#ffffff', gx0 + 3, gy0 + 3, 2, 2);
        }
      } else {
        const sign = r.pick([P.neonA, P.neonB, '#e0c030', '#40c060', '#e06030']);
        R(P.ink, x + 6, sy - 2, bw - 12, 12); R(shade(sign, -0.5), x + 7, sy - 1, bw - 14, 10);
        for (let xx = x + 12; xx < x + bw - 14; xx += 7) R(day ? shade(sign, 0.3) : sign, xx, sy + 2, 5, 4); // letras
        const glassY = sy + 20;
        R(P.ink, x + 6, glassY - 1, bw - 12, shopH - 19);
        R(day ? '#2a3448' : shade(P.lit, -0.35), x + 7, glassY, bw - 14, shopH - 21);
        for (let xx = x + 7; xx < x + bw - 7; xx += 20) R(P.ink, xx, glassY, 1, shopH - 21);
        for (let i = 0; i < 6; i++) R('rgba(255,255,255,0.25)', x + 12 + i * 2, glassY + 4 + i * 3, 2, 2);
        const dx = x + bw - 28; R(P.ink, dx - 1, glassY - 1, 18, shopH - 19); R(shade(base, -0.4), dx, glassY, 16, shopH - 20); R(P.trim, dx + 12, glassY + 20, 2, 3);
        // toldo a rayas
        const aw1 = r.pick([P.neonA, '#c82828', '#2a7a3a', '#2a4a9a']), aw2 = '#e8e0d0';
        for (let yy = 0; yy < 12; yy++) {
          const inset = Math.floor(yy / 3);
          for (let xx = x + 4 - inset; xx < x + bw - 4 + inset; xx += 8) R(((xx - x) / 8 | 0) % 2 ? aw1 : aw2, xx, sy + 8 + yy, 8, 1);
        }
        R('rgba(0,0,0,0.45)', x + 2, sy + 20, bw - 4, 4);
        for (let xx = x + 2; xx < x + bw - 4; xx += 8) R(aw1, xx, sy + 20, 4, 3);
      }
      // bajante y depósito de agua
      if (r.chance(0.5)) { const px = x + bw - 8; R('#2a2a30', px, top + 12, 3, bh - 12); for (let yy = top + 30; yy < SH; yy += 40) R('#4a4a52', px - 1, yy, 5, 2); }
      if (r.chance(0.3)) {
        const tx = x + r.int(10, Math.max(11, bw - 40));
        R(P.ink, tx + 4, top - 12, 2, 12); R(P.ink, tx + 22, top - 12, 2, 12);
        R('#4a3222', tx, top - 38, 28, 26); for (let yy = top - 36; yy < top - 12; yy += 5) R('#2e1e14', tx, yy, 28, 1);
        g.fillStyle = '#2e1e14'; g.beginPath(); g.moveTo(tx - 2, top - 38); g.lineTo(tx + 14, top - 50); g.lineTo(tx + 30, top - 38); g.fill();
      }
      x += bw;
    }
    // acera superior (base de la fila)
    R(P.ink, 0, SH - 2, SW, 2);
    this.cache[key] = c;
    return c;
  },
  // cam en unidades de mundo; se dibuja con el zoom activo
  draw(ctx, lv, cam) {
    if (lv.indoor || !lv.facadeRow) return;
    const st = this.strip(lv.sky, lv.sky === 'day' || lv.sky === 'golden');
    const sw = st.width / ZOOM, sh = st.height / ZOOM;
    const par = 0.82;
    const bottom = lv.groundY - STREET_D + 3 - cam.y;
    const off = -((cam.x * par) % sw);
    for (let i = -1; i < 2; i++) {
      const xx = Math.floor((off + i * sw) * ZOOM) / ZOOM;
      if (xx > VW || xx + sw < 0) continue;
      ctx.drawImage(st, xx, bottom - sh, sw, sh);
    }
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
  futuro: { base: '#1a1a34', dark: '#0c0c1c', ledge: '#ff4aa0', win: '#141432', lit: '#40f0ff', frame: '#0c0c1c' },
  futuro2: { base: '#28203e', dark: '#140e24', ledge: '#40f0ff', win: '#18142c', lit: '#ff80c0', frame: '#140e24' },
  stone: { base: '#8a8470', dark: '#5e5a4a', ledge: '#b0aa94', win: '#3a3a30', lit: '#fff0b0', frame: '#6e6a58' },
};

function renderBuilding(w, h, styleName, seed, night) {
  // se pinta al doble de resolución (1 píxel = 1 píxel de pantalla con el zoom)
  const Z = ZOOM, W2 = Math.ceil(w * Z), H2 = Math.ceil(h * Z);
  const st = BSTYLES[styleName] || BSTYLES.brick;
  const c = makeCanvas(W2, H2);
  const x = c.getContext('2d');
  const R = (col, xx, yy, ww, hh) => { x.fillStyle = col; x.fillRect(xx, yy, ww, hh); };
  const r = makeRng(seed);
  const ink = '#0a060c';
  const base = night ? shade(st.base, -0.18) : st.base, dark = night ? shade(st.dark, -0.2) : st.dark;
  const lite = shade(st.base, 0.18);
  R(base, 0, 0, W2, H2);
  const brick = styleName === 'brick' || styleName === 'brown' || styleName === 'ruin';
  const glass = styleName === 'glass' || styleName === 'futuro' || styleName === 'futuro2';
  if (brick) {
    for (let yy = 12; yy < H2; yy += 4) {
      R(dark, 0, yy, W2, 1);
      const off = (yy / 4) % 2 ? 0 : 4;
      for (let xx = off; xx < W2; xx += 8) R(dark, xx, yy - 3, 1, 3);
      if (hash2(yy, seed) < 0.3) R(lite, Math.floor(hash2(seed, yy) * W2), yy - 3, 6, 1);
    }
  } else if (!glass) {
    for (let xx = 16; xx < W2; xx += 32) R(dark, xx, 10, 1, H2);
    for (let yy = 30; yy < H2; yy += 24) R(dark, 0, yy, W2, 1);
  }
  // pilastras laterales con volumen
  R(lite, 0, 0, 3, H2); R(dark, 3, 0, 2, H2); R(dark, W2 - 5, 0, 5, H2); R(ink, W2 - 1, 0, 1, H2);
  if (glass) {
    // muro cortina: montantes y cristales con reflejo
    const cw = 14, ch = 16;
    for (let yy = 14; yy < H2 - 4; yy += ch) for (let xx = 8; xx < W2 - 10; xx += cw) {
      const lit = night && hash2(xx + seed, yy) < 0.3;
      R(st.frame, xx - 1, yy - 1, cw, ch);
      R(lit ? st.lit : st.win, xx, yy, cw - 2, ch - 2);
      if (!lit) { R(shade(st.win, 0.25), xx, yy, cw - 2, 2); for (let i = 0; i < 4; i++) R(shade(st.win, 0.35), xx + cw - 5 - i, yy + 4 + i * 2, 2, 2); }
    }
    if (styleName !== 'glass') { R(st.ledge, 5, 0, 2, H2); R(st.ledge, W2 - 7, 0, 2, H2); for (let yy = 24; yy < H2; yy += 48) R(st.ledge, 0, yy, W2, 1); }
  } else {
    const ww = styleName === 'stone' ? 12 : 10, wh = styleName === 'stone' ? 20 : 16;
    const gx = ww + 10, gy = wh + 12;
    const cols = Math.max(1, Math.floor((W2 - 14) / gx)), x0 = Math.floor((W2 - (cols * gx - 10)) / 2);
    const litP = night ? 0.4 : 0.1;
    for (let yy = 18; yy < H2 - 14; yy += gy) for (let k = 0; k < cols; k++) {
      const xx = x0 + k * gx;
      R(st.frame, xx - 2, yy - 3, ww + 4, 2);                          // dintel
      R(ink, xx - 1, yy - 1, ww + 2, wh + 2);
      if (r.chance(litP)) {
        R(st.lit, xx, yy, ww, wh); R(shade(st.lit, -0.3), xx, yy + wh - 4, ww, 4);
        for (let b = yy + 2; b < yy + wh - 4; b += 3) R(shade(st.lit, -0.18), xx, b, ww, 1);
      } else {
        R(st.win, xx, yy, ww, wh);
        for (let i = 0; i < 4; i++) R(shade(st.win, 0.3), xx + ww - 3 - i, yy + 2 + i * 2, 2, 2);
      }
      R(ink, xx + (ww >> 1), yy, 1, wh); R(ink, xx, yy + (wh >> 1), ww, 1);
      R(st.frame, xx - 2, yy + wh + 1, ww + 4, 2); R('rgba(0,0,0,0.35)', xx - 1, yy + wh + 3, ww + 2, 2); // alféizar
    }
    // escalera de incendios en los de ladrillo
    if (brick && W2 > 60 && H2 > 120 && hash2(seed, 3) < 0.6) {
      const fx = x0 + gx - 6, fw = Math.min(W2 - 20, gx * 2 + 2);
      for (let yy = 18 + gy; yy < H2 - 20; yy += gy) {
        const py = yy + wh + 3;
        R(ink, fx, py, fw, 3); R('#3a3a44', fx, py, fw, 1);
        for (let xx = fx; xx <= fx + fw; xx += 4) R(ink, xx, py - 11, 1, 11);
        R(ink, fx, py - 12, fw, 1);
        const dir = ((yy / gy) | 0) % 2;
        for (let k = 0; k < 12; k++) R(ink, dir ? fx + 4 + k * 2 : fx + fw - 6 - k * 2, py + 3 + Math.floor((gy - 3) * k / 12), 2, 2);
      }
    }
  }
  if (styleName === 'verse' || styleName === 'verse2') {
    x.fillStyle = 'rgba(255,255,255,0.10)';
    for (let yy = 0; yy < H2; yy += 4) for (let xx = (yy % 8 ? 2 : 0); xx < W2; xx += 4) x.fillRect(xx, yy, 2, 2);
    R('#000000', 0, 0, 4, H2); R('#000000', W2 - 4, 0, 4, H2);
  }
  // cornisa con dentículos
  R(st.ledge, 0, 0, W2, 5); R(shade(st.ledge, 0.25), 0, 0, W2, 1); R(dark, 0, 5, W2, 2);
  for (let xx = 2; xx < W2; xx += 6) R(dark, xx, 7, 3, 3);
  R('rgba(0,0,0,0.35)', 0, 10, W2, 3);
  if (styleName === 'ruin') {
    for (let xx = 0; xx < W2; xx += 6) { const d = Math.floor(hash2(seed, xx) * 20); x.clearRect(xx, 0, 6, d); }
    for (let i = 0; i < 8; i++) {
      const bx = Math.floor(hash2(i, seed) * W2), by = Math.floor(hash2(seed, i) * H2);
      R('rgba(0,0,0,0.45)', bx, by, 16, 26); R('rgba(255,110,30,0.5)', bx + 4, by + 20, 8, 2);
    }
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
