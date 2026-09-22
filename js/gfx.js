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
  pal.dark = {};
  for (const k of ['head', 'torso', 'torsoLow', 'arm', 'arm2', 'hand', 'leg', 'boot']) pal.dark[k] = shade(pal[k], -0.3);
  return pal;
}
const FLASH_PAL = makePal({ outline: '#ffffff', head: '#ffffff', hair: '#ffffff', torso: '#ffffff', leg: '#ffffff', boot: '#ffffff', eye: '#ffffff', face: 'flat' });

const SUITS = [
  { id: 'nwh', name: 'Traje hecho a mano', desc: 'Cosido por Peter tras No Way Home.', pal: { head: '#e0202c', torso: '#e0202c', torsoLow: '#2046c8', arm: '#e0202c', arm2: '#e0202c', leg: '#2046c8', boot: '#e0202c', face: 'spider', emblem: '#140a12' } },
  { id: 'casero', name: 'Traje casero', desc: 'Sudadera roja y gafas. Donde todo empezó.', pal: { head: '#c8202a', torso: '#c8202a', torsoLow: '#c8202a', arm: '#c8202a', arm2: '#c8202a', leg: '#2a3a8a', boot: '#d8d8d8', face: 'goggles', emblem: '#140a12', eye: '#b8d8ff' } },
  { id: 'sigilo', name: 'Traje de sigilo', desc: 'El traje del "Mono Nocturno".', pal: { head: '#20242c', torso: '#20242c', torsoLow: '#20242c', arm: '#20242c', leg: '#20242c', boot: '#2a2e38', face: 'spider', emblem: '#4a5060', eye: '#8ad8ff' } },
  { id: 'stark', name: 'Traje Stark', desc: 'Regalo del señor Stark.', pal: { head: '#d82028', torso: '#d82028', torsoLow: '#1c38a8', arm: '#1c38a8', arm2: '#d82028', leg: '#1c38a8', boot: '#d82028', face: 'spider', emblem: '#140a12' } },
  { id: 'ffh', name: 'Traje mejorado', desc: 'Rojo y negro, hecho en el jet de Stark.', pal: { head: '#e01a24', torso: '#e01a24', torsoLow: '#16161c', arm: '#16161c', arm2: '#e01a24', leg: '#16161c', boot: '#e01a24', face: 'spider', emblem: '#16161c' } },
  { id: 'iron', name: 'Iron Spider', desc: 'Nanotecnología roja y dorada.', pal: { head: '#c01822', torso: '#c01822', torsoLow: '#e0b030', arm: '#c01822', arm2: '#e0b030', leg: '#c01822', boot: '#e0b030', face: 'spider', emblem: '#e0b030' } },
];
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
    parts(true);
    const { hx, hy } = parts(false);
    this.face(ctx, hx, hy, hs, facing, pal, s, pose);
    if (pal.emblem && pal.face !== 'flat') {
      ctx.fillStyle = pal.emblem;
      const ex = Math.round((wp.mid[0] + wp.neck[0]) / 2), ey = Math.round((wp.mid[1] + wp.neck[1]) / 2);
      ctx.fillRect(ex, ey - 1, 1, 3);
      if (s > 1.2) ctx.fillRect(ex - 1, ey, 3, 1);
    }
    if (opts.extra) opts.extra(ctx, wp, facing, s);
    return wp;
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
    const bg = { spidey: '#2a1830', peter: '#2a1830', radio: '#18202a', cleary: '#1a2430', jjj: '#301818', shocker: '#2a2a10', mason: '#1e2418', gargan: '#102a18', mysterio: '#10281c', civil: '#202838', mj: '#281a24' }[who] || '#202020';
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
  strip(name, layer) {
    const key = name + layer;
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
    // Hitos del MCU en la tira lejana: Empire State y la Torre de los Vengadores
    if (layer === 'far') {
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

  drawBackground(ctx, name, camX, camY, levelH) {
    ctx.drawImage(this.sky(name), 0, 0);
    const far = this.strip(name, 'far');
    const mid = this.strip(name, 'mid');
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
  x.fillStyle = st.ledge; x.fillRect(0, 0, w, 3);
  x.fillStyle = st.dark; x.fillRect(0, 3, w, 1);
  return c;
}
