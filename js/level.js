'use strict';
// ---------------------------------------------------------------------------
// Niveles: geometría, colisiones, rayos para telarañas y construcción
// ---------------------------------------------------------------------------
const BUCKET = 256;

class Level {
  constructor(o) {
    this.name = o.name || '';
    this.width = o.width;
    this.height = o.height || 480;
    this.groundY = o.groundY || 440;
    this.sky = o.sky || 'day';
    this.theme = o.theme || 'city';
    this.indoor = !!o.indoor;
    this.water = o.water || null; // y del agua (si hay)
    this.killY = this.water ? this.water + 12 : this.height + 40;
    this.solids = [];
    this.oneways = [];
    this.decor = [];
    this.front = [];
    this.spawns = [];
    this.arenas = [];
    this.tips = [];
    this.canons = [];
    this.checkpoints = [];
    this.tokens = [];
    this.groundSegs = []; // {x0,x1,type}
    this.night = this.sky === 'night' || this.sky === 'rift' || this.sky === 'dusk';
    this.buckets = [];
    this.qid = 0;
    this.anchorMinY = o.anchorMinY !== undefined ? o.anchorMinY : 30;
    this.bossArena = null;
    this.topY = o.topY || 0; // nada puede aparecer por encima (techo interior)
  }

  addSolid(x, y, w, h, kind = 'block', style = null, climb = true) {
    const s = { x, y, w, h, kind, style, climb, _q: 0, canvas: null };
    this.solids.push(s);
    return s;
  }

  addBuilding(x, w, h, style, seed) {
    const s = this.addSolid(x, this.groundY - h, w, h + (this.height - this.groundY) + 60, 'building', style);
    s.canvas = renderBuilding(w, h, style, seed || (x * 7 + h), this.night);
    s.vis = h;
    return s;
  }

  addGround(x0, x1, type = 'street') {
    const s = this.addSolid(x0, this.groundY, x1 - x0, this.height - this.groundY + 60, 'ground', type, false);
    this.groundSegs.push({ x0, x1, type });
    return s;
  }

  addOneway(x, y, w, kind = 'ledge') {
    const p = { x, y, w, h: 4, kind, _q: 0 };
    this.oneways.push(p);
    return p;
  }

  build() {
    const n = Math.ceil(this.width / BUCKET) + 1;
    this.buckets = [];
    for (let i = 0; i < n; i++) this.buckets.push([]);
    const addTo = (o) => {
      const a = clamp(Math.floor(o.x / BUCKET), 0, n - 1), b = clamp(Math.floor((o.x + o.w) / BUCKET), 0, n - 1);
      for (let i = a; i <= b; i++) this.buckets[i].push(o);
    };
    this.solids.forEach(addTo);
    this.oneways.forEach(addTo);
    return this;
  }

  near(x0, x1) {
    const out = [];
    const n = this.buckets.length;
    const a = clamp(Math.floor(x0 / BUCKET), 0, n - 1), b = clamp(Math.floor(x1 / BUCKET), 0, n - 1);
    const q = ++this.qid;
    for (let i = a; i <= b; i++) {
      for (const o of this.buckets[i]) {
        if (o._q !== q) { o._q = q; out.push(o); }
      }
    }
    return out;
  }

  // Mueve un cuerpo con colisiones. Devuelve info de contactos.
  move(e, dt) {
    const sp = Math.max(Math.abs(e.vx), Math.abs(e.vy)) * dt;
    const steps = Math.max(1, Math.ceil(sp / 5));
    const sdt = dt / steps;
    e.onGround = false; e.hitWall = 0; e.hitCeil = false; e.wallObj = null; e.groundObj = null;
    for (let i = 0; i < steps; i++) {
      const cand = this.near(e.x - 16, e.x + e.w + 16);
      // Eje X
      e.x += e.vx * sdt;
      for (const s of cand) {
        if (s.climb === undefined) continue;
        if (overlap(e, s)) {
          if (e.vx > 0 || (e.vx === 0 && e.x + e.w / 2 < s.x + s.w / 2)) { e.x = s.x - e.w; e.hitWall = 1; }
          else { e.x = s.x + s.w; e.hitWall = -1; }
          e.wallObj = s;
          e.vx = 0;
        }
      }
      // Eje Y
      const prevBottom = e.y + e.h;
      e.y += e.vy * sdt;
      for (const s of cand) {
        if (s.climb === undefined) {
          // plataforma de un sentido
          if (e.vy >= 0 && !(e.dropTimer > 0) && e.x + e.w > s.x && e.x < s.x + s.w &&
            prevBottom <= s.y + 0.5 && e.y + e.h >= s.y) {
            e.y = s.y - e.h; e.vy = 0; e.onGround = true; e.groundObj = s;
          }
          continue;
        }
        if (overlap(e, s)) {
          if (e.vy > 0 || (e.vy === 0 && e.y + e.h / 2 < s.y + s.h / 2)) { e.y = s.y - e.h; e.onGround = true; e.groundObj = s; }
          else { e.y = s.y + s.h; e.hitCeil = true; }
          e.vy = 0;
        }
      }
    }
    if (!e.onGround) {
      // comprobación de suelo "pegado" (para detectar que seguimos apoyados)
      const probe = { x: e.x, y: e.y + e.h, w: e.w, h: 1 };
      for (const s of this.near(e.x - 4, e.x + e.w + 4)) {
        if (s.climb === undefined) {
          if (!(e.dropTimer > 0) && e.vy >= 0 && Math.abs(e.y + e.h - s.y) < 0.5 && e.x + e.w > s.x && e.x < s.x + s.w) { e.onGround = true; e.groundObj = s; }
        } else if (overlap(probe, s) && e.vy >= 0) { e.onGround = true; e.groundObj = s; }
      }
    }
  }

  pointSolid(x, y, includeOneway = true) {
    for (const s of this.near(x - 1, x + 1)) {
      if (x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h) {
        if (s.climb === undefined && !includeOneway) continue;
        return s;
      }
    }
    return null;
  }

  rectFree(r) {
    for (const s of this.near(r.x - 2, r.x + r.w + 2)) {
      if (s.climb !== undefined && overlap(r, s)) return false;
    }
    return true;
  }

  // Rayo para anclar la telaraña
  raycast(x0, y0, dx, dy, maxLen) {
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    for (let d = 6; d <= maxLen; d += 2) {
      const x = x0 + dx * d, y = y0 + dy * d;
      if (y < 0) return null;
      const s = this.pointSolid(x, y, true);
      if (s) return { x, y, d, s };
    }
    return null;
  }

  // Altura del suelo más alto bajo el punto x (para colocar cosas)
  surfaceY(x, fromY) {
    if (fromY === undefined || fromY < this.topY) fromY = this.topY;
    let best = this.height + 100;
    for (const s of this.near(x - 1, x + 1)) {
      if (x >= s.x && x < s.x + s.w && s.y >= fromY && s.y < best) best = s.y;
    }
    return best;
  }

  // ---------------- Dibujo ----------------
  draw(ctx, cx, cy, t) {
    const x0 = cx - 60, x1 = cx + W + 60;
    // agua o vacío
    if (this.water) {
      const wy = Math.round(this.water - cy);
      if (wy < H) {
        if (this.sky === 'ruin') {
          ctx.fillStyle = '#0a0204'; ctx.fillRect(0, wy - 20, W, H - wy + 20);
          ctx.fillStyle = 'rgba(255,70,20,0.18)'; ctx.fillRect(0, wy - 20, W, 6);
          for (let i = 0; i < 24; i++) {
            const xx = (i * 61 + Math.floor(t * 12) - Math.floor(cx * 0.6)) % (W + 20);
            ctx.fillStyle = i % 3 ? '#8a2a0c' : '#ff7020';
            ctx.fillRect((xx + W + 20) % (W + 20) - 10, wy - 10 + ((i * 13 + Math.floor(t * 20)) % 40), 1, 1);
          }
        } else {
          ctx.fillStyle = this.sky === 'rift' ? '#0a2a2a' : (this.night ? '#0c1838' : '#1c4a7a');
          ctx.fillRect(0, wy, W, H - wy);
          ctx.fillStyle = this.sky === 'rift' ? '#2a6a50' : (this.night ? '#2a4a80' : '#4a8ac0');
          for (let i = 0; i < 40; i++) {
            const xx = ((i * 53 + Math.floor(t * 20) + Math.floor(cx * 0.9)) % (W + 40)) - 20;
            const yy = wy + 3 + (i * 7) % Math.max(1, H - wy);
            ctx.fillRect(W - xx, yy, 6, 1);
          }
        }
      }
    }
    // decoración trasera
    for (const d of this.decor) {
      if (d.x + (d.w || 200) < x0 || d.x - 200 > x1) continue;
      drawDecor(ctx, d, cx, cy, t, this);
    }
    const vis = this.near(x0, x1);
    // 2.5D: caras laterales y superiores en perspectiva (primero lo más lejano al centro)
    const ext = [];
    for (const s of vis) {
      const sx = Math.round(s.x - cx), sy = Math.round(s.y - cy);
      if (sx > W + 40 || sx + s.w < -40 || sy > H) continue;
      ext.push({ s, sx, sy, d: Math.abs(sx + s.w / 2 - VP.x) });
    }
    ext.sort((a, b) => b.d - a.d);
    for (const e of ext) drawExtrusion(ctx, e.s, e.sx, e.sy, this, cx);
    // caras frontales
    for (const s of vis) {
      if (s.climb === undefined) {
        drawOneway(ctx, s, cx, cy, this);
        continue;
      }
      const sx = Math.round(s.x - cx), sy = Math.round(s.y - cy);
      if (sx > W || sx + s.w < 0 || sy > H) continue;
      if (s.kind === 'building' && s.canvas) {
        ctx.drawImage(s.canvas, sx, sy);
      } else if (s.kind === 'ground') {
        drawGround(ctx, s, sx, sy, this, cx);
      } else {
        drawBlock(ctx, s, sx, sy, this);
      }
    }
  }

  // Sombra en el suelo bajo un personaje (efecto de profundidad)
  shadow(ctx, x, feetY, cam, w = 10) {
    const sY = this.surfaceY(x, feetY - 2);
    const d = sY - feetY;
    if (d > 90 || sY > this.height) return;
    const a = 0.35 * (1 - d / 90);
    const ww = Math.round(w * (1 - d / 180));
    ctx.fillStyle = 'rgba(0,0,0,' + a.toFixed(2) + ')';
    const sx = Math.round(x - cam.x), sy = Math.round(sY - cam.y);
    ctx.fillRect(sx - ww / 2, sy - 1, ww, 2);
    ctx.fillRect(sx - ww / 2 + 2, sy - 2, ww - 4, 4);
  }

  drawFront(ctx, cx, cy, t) {
    for (const d of this.front) {
      if (d.x + (d.w || 100) < cx - 40 || d.x > cx + W + 40) continue;
      drawDecor(ctx, d, cx, cy, t, this);
    }
  }
}

// ---------------- 2.5D ----------------
const VP = { x: W / 2, y: 64 };
const DEPTH = 0.16;
function backPt(px, py, k = DEPTH) { return [px + (VP.x - px) * k, py + (VP.y - py) * k]; }
function poly(ctx, col, pts) {
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath(); ctx.fill();
}
const EXT_COLS = {
  crate: ['#4a3218', '#9a7a4a'], truck: ['#909098', '#e0e0e8'], pillar: ['#3a3020', '#8a7a58'], tower: ['#2e343c', '#7a8492'],
  beam: ['#4a2818', '#8a4a2a'],
};
const GROUND_TOP = { street: '#3c3c46', floor: '#34383e', bridge: '#50565e', stone: '#6a6654', void: '#2a1414' };
function drawExtrusion(ctx, s, sx, sy, lv, cx) {
  if (s.kind === 'block' || s.kind === 'ceiling') return;
  let side, top, h = s.h;
  if (s.climb === undefined) {
    // plataforma de un sentido: solo la cara superior fina
    if (sy <= VP.y) return;
    const [a, b] = backPt(sx, sy, DEPTH * 0.6), [c, d] = backPt(sx + s.w, sy, DEPTH * 0.6);
    poly(ctx, s.kind === 'scaffold' ? '#8a7030' : s.kind === 'catwalk' ? '#5a5e66' : '#2a2a30', [sx, sy, sx + s.w, sy, c, d, a, b]);
    return;
  }
  if (s.kind === 'building') {
    const st = BSTYLES[s.style] || BSTYLES.brick;
    side = s.sideCol || (s.sideCol = shade(st.dark, -0.2));
    top = s.topCol || (s.topCol = shade(st.ledge, -0.35));
    h = s.vis;
  } else if (s.kind === 'ground') {
    if (sy <= VP.y) return;
    const x1 = Math.max(sx, -60), x2 = Math.min(sx + s.w, W + 60);
    const [a, b] = backPt(x1, sy), [c, d] = backPt(x2, sy);
    poly(ctx, GROUND_TOP[s.style] || '#3c3c46', [x1, sy, x2, sy, c, d, a, b]);
    if (s.style === 'street') {
      // líneas de carril en perspectiva
      ctx.fillStyle = '#b8a840';
      const off = Math.floor(s.x + cx) % 1;
      for (let wx = Math.floor((cx + x1) / 40) * 40; wx < cx + x2; wx += 40) {
        const px = wx - cx - off;
        const [p1, q1] = backPt(px, sy, DEPTH * 0.55), [p2] = backPt(px + 18, sy, DEPTH * 0.55);
        ctx.fillRect(Math.round(p1), Math.round(q1), Math.max(1, Math.round(p2 - p1)), 1);
      }
    }
    return;
  } else {
    const c = EXT_COLS[s.kind] || ['#3a3e48', '#6a7280'];
    side = c[0]; top = c[1];
    h = Math.min(s.h, H + 40);
  }
  const x1 = sx, x2 = sx + s.w, y1 = sy, y2 = sy + Math.min(h, H - sy + 20);
  if (y1 > VP.y) {
    const [a, b] = backPt(x1, y1), [c, d] = backPt(x2, y1);
    poly(ctx, top, [x1, y1, x2, y1, c, d, a, b]);
  }
  if (x2 < VP.x) {
    const [a, b] = backPt(x2, y1), [c, d] = backPt(x2, y2);
    poly(ctx, side, [x2, y1, a, b, c, d, x2, y2]);
  } else if (x1 > VP.x) {
    const [a, b] = backPt(x1, y1), [c, d] = backPt(x1, y2);
    poly(ctx, side, [x1, y1, a, b, c, d, x1, y2]);
  }
}

function drawGround(ctx, s, sx, sy, lv, cx) {
  const type = s.style;
  const w = s.w, h = H;
  if (type === 'street') {
    ctx.fillStyle = '#9a9aa2'; ctx.fillRect(sx, sy, w, 4);
    ctx.fillStyle = '#6a6a72'; ctx.fillRect(sx, sy + 4, w, 2);
    ctx.fillStyle = '#34343c'; ctx.fillRect(sx, sy + 6, w, h);
    ctx.fillStyle = '#d8c850';
    const off = Math.floor(s.x) % 32;
    for (let xx = -off; xx < w; xx += 32) if (sx + xx > -20 && sx + xx < W) ctx.fillRect(sx + xx, sy + 20, 14, 2);
  } else if (type === 'floor') {
    ctx.fillStyle = '#5a5e66'; ctx.fillRect(sx, sy, w, 3);
    ctx.fillStyle = '#3a3e46'; ctx.fillRect(sx, sy + 3, w, h);
    ctx.fillStyle = '#e0b020';
    for (let xx = -(Math.floor(s.x) % 24); xx < w; xx += 24) if (sx + xx > -20 && sx + xx < W) ctx.fillRect(sx + xx, sy + 5, 12, 2);
  } else if (type === 'bridge') {
    ctx.fillStyle = '#7a8088'; ctx.fillRect(sx, sy, w, 3);
    ctx.fillStyle = '#44484e'; ctx.fillRect(sx, sy + 3, w, 10);
    ctx.fillStyle = '#2a2e34';
    for (let xx = -(Math.floor(s.x) % 16); xx < w; xx += 16) if (sx + xx > -20 && sx + xx < W) { ctx.fillRect(sx + xx, sy + 13, 2, 14); ctx.fillRect(sx + xx, sy + 13, 16, 2); }
  } else if (type === 'stone') {
    ctx.fillStyle = '#8a8672'; ctx.fillRect(sx, sy, w, 3);
    ctx.fillStyle = '#5e5a4a'; ctx.fillRect(sx, sy + 3, w, h);
    ctx.fillStyle = '#4a4638';
    for (let xx = -(Math.floor(s.x) % 20); xx < w; xx += 20) if (sx + xx > -20 && sx + xx < W) ctx.fillRect(sx + xx, sy + 8, 1, 10);
  } else {
    ctx.fillStyle = '#444'; ctx.fillRect(sx, sy, w, h);
  }
}

function drawBlock(ctx, s, sx, sy, lv) {
  const k = s.kind;
  if (k === 'crate') {
    ctx.fillStyle = '#6a4a2a'; ctx.fillRect(sx, sy, s.w, s.h);
    ctx.fillStyle = '#8a6a3a'; ctx.fillRect(sx + 1, sy + 1, s.w - 2, s.h - 2);
    ctx.fillStyle = '#5a3a1a';
    ctx.fillRect(sx, sy, s.w, 2); ctx.fillRect(sx, sy + s.h - 2, s.w, 2);
    ctx.fillRect(sx, sy, 2, s.h); ctx.fillRect(sx + s.w - 2, sy, 2, s.h);
    for (let i = 0; i < Math.min(s.w, s.h); i += 2) ctx.fillRect(sx + Math.floor(i * s.w / Math.min(s.w, s.h)), sy + i, 2, 2);
  } else if (k === 'ceiling') {
    ctx.fillStyle = '#1a1c22'; ctx.fillRect(sx, sy, s.w, s.h);
    ctx.fillStyle = '#2e3240'; ctx.fillRect(sx, sy + s.h - 6, s.w, 6);
    ctx.fillStyle = '#4a5060';
    for (let xx = -(Math.floor(s.x) % 40); xx < s.w; xx += 40) ctx.fillRect(sx + xx, sy + s.h - 6, 3, 6);
  } else if (k === 'truck') {
    ctx.fillStyle = '#d8d8d8'; ctx.fillRect(sx, sy, s.w, s.h - 6);
    ctx.fillStyle = s.style || '#2a5a9a'; ctx.fillRect(sx + s.w - 14, sy + 4, 14, s.h - 10);
    ctx.fillStyle = '#9ad0f0'; ctx.fillRect(sx + s.w - 10, sy + 6, 8, 6);
    ctx.fillStyle = '#141414'; ctx.fillRect(sx + 6, sy + s.h - 7, 8, 7); ctx.fillRect(sx + s.w - 14, sy + s.h - 7, 8, 7);
    ctx.fillStyle = '#b0b0b0'; ctx.fillRect(sx, sy, s.w, 2);
  } else if (k === 'pillar') {
    ctx.fillStyle = '#5a4a30'; ctx.fillRect(sx, sy, s.w, s.h);
    ctx.fillStyle = '#7a6a48'; ctx.fillRect(sx + 2, sy, 3, s.h);
    ctx.fillStyle = '#3a3020';
    for (let yy = 6; yy < Math.min(s.h, 400); yy += 12) ctx.fillRect(sx, sy + yy, s.w, 2);
  } else if (k === 'tower') {
    ctx.fillStyle = '#4a525e'; ctx.fillRect(sx, sy, s.w, s.h);
    ctx.fillStyle = '#6a7482'; ctx.fillRect(sx + 3, sy, 4, s.h); ctx.fillRect(sx + s.w - 7, sy, 4, s.h);
    ctx.fillStyle = '#2e343c';
    for (let yy = 10; yy < Math.min(s.h, 500); yy += 30) { ctx.fillRect(sx, sy + yy, s.w, 3); }
    ctx.fillStyle = '#8a94a2'; ctx.fillRect(sx - 2, sy, s.w + 4, 4);
  } else if (k === 'beam') {
    ctx.fillStyle = '#6a3a24'; ctx.fillRect(sx, sy, s.w, s.h);
    ctx.fillStyle = '#8a4a2a'; ctx.fillRect(sx, sy, s.w, 2);
    ctx.fillStyle = '#4a2818';
    for (let xx = 0; xx < s.w; xx += 8) ctx.fillRect(sx + xx, sy + 2, 1, s.h - 2);
  } else {
    ctx.fillStyle = '#505662'; ctx.fillRect(sx, sy, s.w, s.h);
    ctx.fillStyle = '#6a7280'; ctx.fillRect(sx, sy, s.w, 2);
  }
}

function drawOneway(ctx, p, cx, cy, lv) {
  const sx = Math.round(p.x - cx), sy = Math.round(p.y - cy);
  if (sx > W || sx + p.w < 0 || sy < -10 || sy > H) return;
  if (p.kind === 'catwalk') {
    ctx.fillStyle = '#8a8e96'; ctx.fillRect(sx, sy, p.w, 2);
    ctx.fillStyle = '#4a4e56';
    for (let xx = 0; xx < p.w; xx += 6) ctx.fillRect(sx + xx, sy + 2, 1, 5);
    ctx.fillRect(sx, sy + 6, p.w, 1);
  } else if (p.kind === 'scaffold') {
    ctx.fillStyle = '#c8a040'; ctx.fillRect(sx, sy, p.w, 3);
    ctx.fillStyle = '#7a6020'; ctx.fillRect(sx, sy + 3, p.w, 1);
    ctx.fillStyle = '#9a9aa0';
    ctx.fillRect(sx + 2, sy + 4, 1, 40); ctx.fillRect(sx + p.w - 3, sy + 4, 1, 40);
  } else {
    // escalera de incendios / cornisa
    ctx.fillStyle = '#3a3a40'; ctx.fillRect(sx, sy, p.w, 2);
    ctx.fillStyle = '#26262c';
    for (let xx = 0; xx < p.w; xx += 4) ctx.fillRect(sx + xx, sy - 6, 1, 6);
    ctx.fillRect(sx, sy - 6, p.w, 1);
    ctx.fillRect(sx + 2, sy + 2, 1, 10); ctx.fillRect(sx + p.w - 3, sy + 2, 1, 10);
  }
}

function drawDecor(ctx, d, cx, cy, t, lv) {
  const sx = Math.round(d.x - cx), sy = Math.round(d.y - cy);
  switch (d.type) {
    case 'clock': // esfera de la torre del reloj
      ctx.fillStyle = '#2a2a2a'; ctx.beginPath(); ctx.arc(sx, sy, 22, 0, TAU); ctx.fill();
      ctx.fillStyle = lv.night ? '#f0e8c0' : '#e8e0c8'; ctx.beginPath(); ctx.arc(sx, sy, 19, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2a2a2a';
      for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; ctx.fillRect(Math.round(sx + Math.cos(a) * 16) - 1, Math.round(sy + Math.sin(a) * 16) - 1, 2, 2); }
      thickLine(ctx, sx, sy, sx + Math.cos(t * 0.5) * 14, sy + Math.sin(t * 0.5) * 14, 1);
      thickLine(ctx, sx, sy, sx, sy - 10, 2);
      break;
    case 'rift': { // grieta multiversal
      const cols = ['#ffffff', '#60ffe0', '#ff40c0', '#ffe040'];
      for (let i = 0; i < 70; i++) {
        const yy = sy - 70 + i * 2;
        const w = Math.max(1, 12 - Math.abs(35 - i) * 0.3) + Math.sin(t * 8 + i) * 2;
        ctx.fillStyle = cols[(i + Math.floor(t * 10)) % cols.length];
        ctx.fillRect(Math.round(sx + Math.sin(i * 0.4 + t * 3) * 5 - w / 2), yy, Math.round(w), 2);
      }
      ctx.fillStyle = 'rgba(160,255,230,0.12)'; ctx.fillRect(sx - 30, sy - 80, 60, 150);
      break;
    }
    case 'tank': // tanque de agua en azotea
      ctx.fillStyle = '#3a2a1e';
      ctx.fillRect(sx + 2, sy - 8, 2, 8); ctx.fillRect(sx + 14, sy - 8, 2, 8);
      ctx.fillStyle = '#7a5a3a'; ctx.fillRect(sx, sy - 26, 18, 18);
      ctx.fillStyle = '#5a3e26'; for (let i = 0; i < 18; i += 4) ctx.fillRect(sx + i, sy - 26, 1, 18);
      ctx.fillStyle = '#4a3020'; ctx.fillRect(sx - 1, sy - 30, 20, 4); ctx.fillRect(sx + 4, sy - 33, 10, 3);
      break;
    case 'ac':
      ctx.fillStyle = '#9aa0a8'; ctx.fillRect(sx, sy - 8, 14, 8);
      ctx.fillStyle = '#5a6068'; ctx.fillRect(sx + 2, sy - 6, 6, 4);
      break;
    case 'antenna':
      ctx.fillStyle = '#50545c'; ctx.fillRect(sx, sy - 30, 1, 30); ctx.fillRect(sx - 4, sy - 22, 9, 1); ctx.fillRect(sx - 3, sy - 14, 7, 1);
      if (Math.floor(t * 2) % 2) { ctx.fillStyle = '#ff3030'; ctx.fillRect(sx, sy - 31, 1, 1); }
      break;
    case 'billboard': {
      const col = d.color || '#e03080';
      ctx.fillStyle = '#1a1a20'; ctx.fillRect(sx - 1, sy - 1, d.w + 2, d.h + 2);
      const glow = lv.night ? (Math.sin(t * 3 + d.x) > -0.8 ? col : shade(col, -0.5)) : shade(col, -0.2);
      ctx.fillStyle = glow; ctx.fillRect(sx, sy, d.w, d.h);
      ctx.fillStyle = shade(col, 0.5); ctx.fillRect(sx + 2, sy + 2, d.w - 4, 1);
      Font.draw(ctx, d.text || '', sx + d.w / 2, sy + Math.floor(d.h / 2) - 3, '#ffffff', { align: 'center' });
      break;
    }
    case 'lamp':
      ctx.fillStyle = '#2a2e36'; ctx.fillRect(sx, sy - 34, 2, 34); ctx.fillRect(sx, sy - 34, 8, 2);
      ctx.fillStyle = lv.night ? '#fff0a0' : '#d0d0c0'; ctx.fillRect(sx + 6, sy - 32, 3, 2);
      if (lv.night) { ctx.fillStyle = 'rgba(255,240,160,0.08)'; ctx.fillRect(sx - 4, sy - 30, 20, 30); }
      break;
    case 'hydrant':
      ctx.fillStyle = '#c02020'; ctx.fillRect(sx, sy - 7, 5, 7); ctx.fillRect(sx - 1, sy - 5, 7, 2); ctx.fillRect(sx + 1, sy - 9, 3, 2);
      break;
    case 'car': {
      ctx.fillStyle = d.color || '#c0a020'; ctx.fillRect(sx, sy - 10, 34, 7); ctx.fillRect(sx + 6, sy - 15, 20, 6);
      ctx.fillStyle = '#9ad0f0'; ctx.fillRect(sx + 8, sy - 14, 7, 4); ctx.fillRect(sx + 17, sy - 14, 7, 4);
      ctx.fillStyle = '#141414'; ctx.fillRect(sx + 4, sy - 4, 7, 4); ctx.fillRect(sx + 23, sy - 4, 7, 4);
      if (d.taxi) { ctx.fillStyle = '#141414'; ctx.fillRect(sx + 1, sy - 8, 32, 1); ctx.fillStyle = '#fff'; ctx.fillRect(sx + 13, sy - 17, 6, 2); }
      break;
    }
    case 'cable': // cables del puente
      ctx.fillStyle = '#8a929e';
      for (let i = 0; i <= 40; i++) {
        const u = i / 40;
        const xx = d.x + (d.x2 - d.x) * u;
        const yy = d.y + (d.y2 - d.y) * u + Math.sin(u * Math.PI) * (d.sag || 60);
        ctx.fillRect(Math.round(xx - cx), Math.round(yy - cy), 2, 1);
        if (i % 4 === 0) {
          const gy = lv.groundY;
          ctx.fillStyle = '#5a626e';
          ctx.fillRect(Math.round(xx - cx), Math.round(yy - cy), 1, Math.max(0, Math.round(gy - yy)));
          ctx.fillStyle = '#8a929e';
        }
      }
      break;
    case 'statue': {
      // Estatua de la Libertad al fondo (con andamios)
      const x = sx, y = sy;
      ctx.fillStyle = '#2a5a4a';
      ctx.fillRect(x - 30, y - 60, 60, 60);
      ctx.fillStyle = '#3a8a6e';
      ctx.fillRect(x - 12, y - 170, 24, 110);
      ctx.fillRect(x - 16, y - 120, 32, 60);
      ctx.fillRect(x - 7, y - 190, 14, 22);
      ctx.fillRect(x + 8, y - 230, 6, 60);
      ctx.fillStyle = '#e8c040'; ctx.fillRect(x + 6, y - 240, 10, 10);
      ctx.fillStyle = '#4aa080';
      for (let i = 0; i < 7; i++) ctx.fillRect(x - 10 + i * 3, y - 196, 2, 5);
      ctx.fillStyle = '#c8a040';
      for (let yy = y - 150; yy < y - 60; yy += 14) ctx.fillRect(x - 22, yy, 44, 1);
      ctx.fillRect(x - 22, y - 150, 1, 90); ctx.fillRect(x + 21, y - 150, 1, 90);
      // escudo del Capitán América (No Way Home)
      ctx.fillStyle = '#c02028'; ctx.beginPath(); ctx.arc(x - 16, y - 110, 9, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e8e8e8'; ctx.beginPath(); ctx.arc(x - 16, y - 110, 6, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2040a0'; ctx.beginPath(); ctx.arc(x - 16, y - 110, 3, 0, TAU); ctx.fill();
      break;
    }
    case 'shelf':
      ctx.fillStyle = '#2a2e34'; ctx.fillRect(sx, sy - d.h, 2, d.h); ctx.fillRect(sx + d.w - 2, sy - d.h, 2, d.h);
      for (let yy = 0; yy < d.h; yy += 18) {
        ctx.fillStyle = '#3a3e46'; ctx.fillRect(sx, sy - d.h + yy, d.w, 2);
        ctx.fillStyle = hash2(d.x, yy) > 0.5 ? '#5a4a30' : '#3a5a4a'; ctx.fillRect(sx + 4, sy - d.h + yy - 8, d.w - 8, 8);
      }
      break;
    case 'light': // lámpara industrial colgante
      ctx.fillStyle = '#20242a'; ctx.fillRect(sx, sy, 1, d.len);
      ctx.fillStyle = '#50545c'; ctx.fillRect(sx - 4, sy + d.len, 9, 3);
      ctx.fillStyle = 'rgba(255,220,140,0.07)';
      ctx.beginPath(); ctx.moveTo(sx - 4, sy + d.len + 3); ctx.lineTo(sx + 5, sy + d.len + 3); ctx.lineTo(sx + 40, sy + d.len + 160); ctx.lineTo(sx - 40, sy + d.len + 160); ctx.fill();
      break;
    case 'sign':
      ctx.fillStyle = '#e8e8e0'; ctx.fillRect(sx, sy, d.w, 11);
      ctx.fillStyle = '#20242a'; ctx.fillRect(sx, sy + 11, d.w, 1);
      Font.draw(ctx, d.text, sx + d.w / 2, sy + 2, '#20242a', { align: 'center' });
      break;
    case 'vault': // bóveda de Control de Daños
      ctx.fillStyle = '#2a2e36'; ctx.fillRect(sx, sy - 60, 70, 60);
      ctx.fillStyle = '#5a606c'; ctx.beginPath(); ctx.arc(sx + 35, sy - 30, 24, 0, TAU); ctx.fill();
      ctx.fillStyle = '#3a3e48'; ctx.beginPath(); ctx.arc(sx + 35, sy - 30, 18, 0, TAU); ctx.fill();
      ctx.fillStyle = '#8a92a0'; ctx.fillRect(sx + 20, sy - 31, 30, 2); ctx.fillRect(sx + 34, sy - 45, 2, 30);
      break;
    case 'dodc':
      ctx.fillStyle = '#1e2a3e'; ctx.fillRect(sx, sy, 90, 16);
      Font.draw(ctx, 'CONTROL DE DAÑOS', sx + 45, sy + 5, '#c8d8f0', { align: 'center' });
      break;
    case 'dock':
      ctx.fillStyle = '#5a4028'; ctx.fillRect(sx, sy, d.w, 4);
      ctx.fillStyle = '#3a2818'; for (let xx = 0; xx < d.w; xx += 12) ctx.fillRect(sx + xx, sy + 4, 3, 30);
      break;
    default: break;
  }
}

// ---------------------------------------------------------------------------
// Construcción de niveles
// ---------------------------------------------------------------------------
const STYLE_SETS = {
  queens: ['brick', 'brown', 'brick', 'concrete'],
  manhattan: ['concrete', 'glass', 'stone', 'glass', 'steel'],
  times: ['glass', 'steel', 'concrete', 'glass'],
  andrew: ['glass', 'steel', 'glass', 'stone'],
  verse: ['verse', 'verse2', 'brown', 'verse'],
  ruin: ['ruin'],
};
const NEON = ['#e03080', '#30c0e0', '#e0c030', '#40e070', '#a050e0', '#e06030'];
const BILLBOARD_TEXT = ['BUGLE.NET', 'DELMAR', 'ROXXON', 'OSCORP', 'FERIA', 'PIZZA', 'MIDTOWN', 'SNACKS', 'TACOS', 'ALCHEMAX', 'STARK', 'HORIZON'];

function roofRun(lv, x0, x1, r, o) {
  let x = x0;
  const out = [];
  while (x < x1 - o.wmin) {
    const w = Math.min(r.int(o.wmin, o.wmax), x1 - x);
    if (w < o.wmin) break;
    const h = r.int(o.hmin, o.hmax);
    const b = lv.addBuilding(x, w, h, r.pick(o.styles), r.int(1, 99999));
    out.push(b);
    const top = lv.groundY - h;
    if (r.chance(0.5) && o.styles[0] !== 'ruin') lv.decor.push({ type: r.pick(['tank', 'ac', 'antenna', 'ac']), x: x + r.int(6, Math.max(7, w - 24)), y: top });
    if (o.billboards && r.chance(0.5) && h > 90) {
      lv.decor.push({ type: 'billboard', x: x + 6, y: top + r.int(20, 50), w: Math.min(w - 12, 70), h: 22, color: r.pick(NEON), text: r.pick(o.boardText || BILLBOARD_TEXT) });
    }
    if (o.ledges && r.chance(0.45)) {
      const side = r.chance(0.5) ? -1 : 1;
      const ly = top + r.int(30, Math.max(31, h - 30));
      if (side < 0) lv.addOneway(x - 18, ly, 18, 'ledge');
      else lv.addOneway(x + w, ly, 18, 'ledge');
    }
    x += w + r.int(o.gmin, o.gmax);
  }
  return out;
}

function streetDecor(lv, x0, x1, r) {
  for (let x = x0 + 20; x < x1 - 20; x += r.int(60, 130)) {
    const ty = r.pick(['lamp', 'hydrant', 'car', 'lamp', 'car']);
    if (ty === 'car') lv.decor.push({ type: 'car', x, y: lv.groundY, color: r.pick(['#c0a020', '#a02828', '#2a4a8a', '#e8e8e8', '#3a3a3a']), taxi: r.chance(0.3) });
    else lv.decor.push({ type: ty, x, y: lv.groundY });
  }
}

function addArena(lv, x1, x2, waves, opts = {}) {
  lv.arenas.push({ x1, x2, waves, wave: -1, active: false, done: false, boss: opts.boss || null, final: !!opts.final, canonAfter: opts.canonAfter || null, escape: opts.escape || 0 });
  lv.checkpoints.push({ x: x1 + 20 });
}

function bounds(lv) {
  lv.addSolid(-40, 0, 40, lv.height, 'block', null, false);
  lv.addSolid(lv.width, 0, 40, lv.height, 'block', null, false);
}

function styledLevel(uid, o) {
  const U = UNIVERSES[uid];
  const lv = new Level(Object.assign({ sky: U.sky, theme: 'city' }, o));
  lv.universe = uid; lv.landmark = U.landmark; lv.tint = U.tint; lv.comic = !!U.comic; lv.pals = U.pals;
  return lv;
}

// Torre del reloj (Tierra-120703)
function clockTower(lv, x) {
  const b = lv.addBuilding(x, 70, 280, 'stone', 7);
  lv.decor.push({ type: 'clock', x: x + 35, y: lv.groundY - 250 });
  return b;
}

const Levels = {
  // ---------------- Ciudades abiertas (una por universo) ----------------
  city(uid) {
    const U = UNIVERSES[uid];
    const ruin = uid === 'ruina';
    const lv = styledLevel(uid, { name: U.city, width: 7200, height: 480, groundY: 440, water: ruin ? 470 : null });
    const r = makeRng(2019 + UNIVERSE_ORDER.indexOf(uid) * 101);
    bounds(lv);
    const all = [];
    if (uid === '616') {
      lv.addGround(0, 2620, 'street');
      lv.addGround(2620, 3520, 'bridge');
      lv.addGround(3520, 7200, 'street');
      all.push(...roofRun(lv, 120, 2500, r, { wmin: 70, wmax: 140, hmin: 60, hmax: 170, gmin: 20, gmax: 70, styles: STYLE_SETS.queens, ledges: true }));
      lv.addSolid(2760, 150, 36, 290, 'tower', null, true);
      lv.addSolid(3340, 150, 36, 290, 'tower', null, true);
      lv.decor.push({ type: 'cable', x: 2620, y: 330, x2: 2778, y2: 152, sag: 30 });
      lv.decor.push({ type: 'cable', x: 2778, y: 152, x2: 3358, y2: 152, sag: 120 });
      lv.decor.push({ type: 'cable', x: 3358, y: 152, x2: 3520, y2: 330, sag: 30 });
      all.push(...roofRun(lv, 3600, 7000, r, { wmin: 90, wmax: 160, hmin: 140, hmax: 300, gmin: 30, gmax: 90, styles: STYLE_SETS.manhattan, ledges: true, billboards: true }));
      streetDecor(lv, 0, 2600, r); streetDecor(lv, 3520, 7200, r);
    } else if (ruin) {
      // suelo roto sobre el vacío
      const gaps = [[900, 980], [1900, 2000], [2800, 2880], [3900, 3990], [4800, 4880], [5800, 5890]];
      let x = 0;
      for (const [g0, g1] of gaps) { lv.addGround(x, g0, 'stone'); lv.addOneway(g0 + 10, 400, g1 - g0 - 20, 'scaffold'); x = g1; }
      lv.addGround(x, 7200, 'stone');
      all.push(...roofRun(lv, 100, 7000, r, { wmin: 70, wmax: 150, hmin: 60, hmax: 260, gmin: 50, gmax: 140, styles: STYLE_SETS.ruin, ledges: true }));
      for (let i = 0; i < 14; i++) lv.addOneway(r.int(200, 7000), r.int(200, 330), r.int(30, 60), 'scaffold');
    } else {
      lv.addGround(0, 7200, 'street');
      const st = { tobey: STYLE_SETS.queens, andrew: STYLE_SETS.andrew, miles: STYLE_SETS.verse }[uid];
      const bt = { tobey: ['DAILY BUGLE', 'PIZZA DE JOE', 'OSCORP', 'MIDTOWN'], andrew: ['OSCORP', 'ROXXON', 'MIDTOWN', 'STACY'], miles: ['ALCHEMAX', 'VISIONS', 'BROOKLYN', '¡THWIP!'] }[uid];
      all.push(...roofRun(lv, 120, 4700, r, { wmin: 70, wmax: 150, hmin: 80, hmax: 260, gmin: 25, gmax: 80, styles: st, ledges: true, billboards: true, boardText: bt }));
      if (uid === 'andrew') clockTower(lv, 4800);
      all.push(...roofRun(lv, 4960, 7000, r, { wmin: 70, wmax: 150, hmin: 90, hmax: 280, gmin: 25, gmax: 80, styles: st, ledges: true, billboards: true, boardText: bt }));
      streetDecor(lv, 0, 7200, r);
    }
    U.signs.forEach((sg, i) => lv.decor.push({ type: 'sign', x: 40 + i * 2400, y: 380, w: Font.width(sg) + 10, text: sg }));
    // 5 fragmentos del multiverso por universo
    const rr = makeRng(77 + UNIVERSE_ORDER.indexOf(uid));
    const used = new Set();
    let id = 0;
    while (id < 5 && used.size < all.length) {
      const b = all[rr.int(0, all.length - 1)];
      if (used.has(b)) continue;
      used.add(b);
      lv.tokens.push({ id: uid + ':' + id, idx: UNIVERSE_ORDER.indexOf(uid) * 5 + id, x: b.x + b.w / 2, y: b.y - (rr.chance(0.4) ? rr.int(60, 110) : 14) });
      id++;
    }
    return lv.build();
  },

  mission(n) {
    const fn = [this.m0, this.m1, this.m2, this.m3, this.m4][n];
    return fn.call(this).build();
  },

  // ---------------- Prólogo: Tierra-616 ----------------
  m0() {
    const lv = styledLevel('616', { name: 'La grieta', width: 3400 });
    const r = makeRng(101);
    lv.addGround(0, 3400, 'street');
    bounds(lv);
    lv.addBuilding(300, 90, 60, 'brick', 11);
    lv.addBuilding(430, 110, 130, 'brown', 12);
    roofRun(lv, 600, 1400, r, { wmin: 80, wmax: 130, hmin: 110, hmax: 190, gmin: 50, gmax: 100, styles: STYLE_SETS.manhattan, ledges: true, billboards: true });
    streetDecor(lv, 0, 3400, r);
    roofRun(lv, 1900, 2600, r, { wmin: 80, wmax: 130, hmin: 100, hmax: 180, gmin: 40, gmax: 90, styles: STYLE_SETS.manhattan, ledges: true });
    lv.tips.push({ x: 40, text: 'tip_move' }, { x: 250, text: 'tip_wall' }, { x: 560, text: 'tip_swing' }, { x: 1000, text: 'tip_swing2' },
      { x: 1480, text: 'tip_fight' }, { x: 1560, text: 'tip_sense' }, { x: 1950, text: 'tip_web' }, { x: 2690, text: 'tip_brute' }, { x: 2400, text: 'tip_special' });
    addArena(lv, 1440, 1840, [['thug', 'thug', 'thug'], ['thug', 'gunner', 'thug']]);
    lv.spawns.push({ type: 'thug', x: 2050 }, { type: 'gunner', x: 2300 }, { type: 'thug', x: 2450 });
    addArena(lv, 2660, 3000, [['bat', 'thug', 'thug'], ['brute', 'thug']]);
    lv.decor.push({ type: 'rift', x: 3330, y: 330 });
    addArena(lv, 3040, 3400, [], { boss: 'desconocido0', final: true, escape: 0.5 });
    return lv;
  },

  // ---------------- Tierra-96283 ----------------
  m1() {
    const lv = styledLevel('tobey', { name: 'Un gran poder', width: 3700 });
    const r = makeRng(202);
    lv.addGround(0, 3700, 'street');
    bounds(lv);
    roofRun(lv, 150, 1000, r, { wmin: 80, wmax: 130, hmin: 100, hmax: 200, gmin: 50, gmax: 100, styles: STYLE_SETS.queens, ledges: true, billboards: true, boardText: ['DAILY BUGLE', 'PIZZA DE JOE'] });
    streetDecor(lv, 0, 3700, r);
    lv.decor.push({ type: 'sign', x: 60, y: 380, w: 80, text: 'PIZZA DE JOE' });
    lv.spawns.push({ type: 'thug', x: 500 }, { type: 'gunner', x: 800 });
    addArena(lv, 1060, 1420, [['thug', 'bat', 'thug'], ['gunner', 'thug', 'bat']]);
    addArena(lv, 1500, 1900, [], { boss: 'sandman' });
    roofRun(lv, 1960, 2800, r, { wmin: 80, wmax: 130, hmin: 100, hmax: 200, gmin: 50, gmax: 100, styles: STYLE_SETS.queens, ledges: true });
    lv.spawns.push({ type: 'gunner', x: 2300 }, { type: 'thug', x: 2500 });
    addArena(lv, 2860, 3220, [['brute', 'thug'], ['bat', 'bat', 'gunner']]);
    addArena(lv, 3280, 3700, [], { boss: 'venom', final: true, canonAfter: 'harry' });
    return lv;
  },

  // ---------------- Tierra-120703 ----------------
  m2() {
    const lv = styledLevel('andrew', { name: 'Tiempo roto', width: 3900 });
    const r = makeRng(303);
    lv.addGround(0, 3900, 'street');
    bounds(lv);
    lv.canons.push({ x: 120, id: 'padres' });
    lv.tips.push({ x: 60, text: 'tip_canon' });
    roofRun(lv, 250, 1100, r, { wmin: 80, wmax: 140, hmin: 120, hmax: 240, gmin: 50, gmax: 100, styles: STYLE_SETS.andrew, ledges: true, billboards: true, boardText: ['OSCORP', 'ROXXON'] });
    streetDecor(lv, 0, 3900, r);
    lv.spawns.push({ type: 'gunner', x: 700 }, { type: 'thug', x: 900 });
    addArena(lv, 1160, 1520, [['thug', 'gunner', 'thug'], ['brute', 'gunner']]);
    addArena(lv, 1600, 2000, [], { boss: 'rino' });
    lv.canons.push({ x: 2120, id: 'ben' });
    roofRun(lv, 2200, 3000, r, { wmin: 80, wmax: 140, hmin: 120, hmax: 240, gmin: 50, gmax: 100, styles: STYLE_SETS.andrew, ledges: true });
    lv.spawns.push({ type: 'drone', x: 2500, y: 330 }, { type: 'gunner', x: 2700 });
    clockTower(lv, 3060);
    addArena(lv, 3160, 3520, [['drone', 'gunner', 'thug'], ['brute', 'bat', 'drone']]);
    addArena(lv, 3520, 3900, [], { boss: 'electro', final: true, canonAfter: 'gwen' });
    return lv;
  },

  // ---------------- Tierra-1610 ----------------
  m3() {
    const lv = styledLevel('miles', { name: 'Salto de fe', width: 3900 });
    const r = makeRng(404);
    lv.addGround(0, 3900, 'street');
    bounds(lv);
    lv.tips.push({ x: 60, text: 'tip_verse' });
    roofRun(lv, 150, 1000, r, { wmin: 80, wmax: 140, hmin: 110, hmax: 230, gmin: 50, gmax: 100, styles: STYLE_SETS.verse, ledges: true, billboards: true, boardText: ['ALCHEMAX', '¡THWIP!', 'VISIONS'] });
    streetDecor(lv, 0, 3900, r);
    lv.spawns.push({ type: 'thug', x: 600 }, { type: 'drone', x: 900, y: 320 });
    addArena(lv, 1060, 1420, [['thug', 'thug', 'gunner'], ['drone', 'bat', 'brute']]);
    addArena(lv, 1500, 1900, [], { boss: 'mancha' });
    roofRun(lv, 1960, 2900, r, { wmin: 80, wmax: 140, hmin: 110, hmax: 230, gmin: 50, gmax: 100, styles: STYLE_SETS.verse, ledges: true, billboards: true, boardText: ['ALCHEMAX', 'BROOKLYN'] });
    lv.spawns.push({ type: 'gunner', x: 2300 }, { type: 'drone', x: 2600, y: 320 });
    addArena(lv, 2960, 3320, [['drone', 'drone', 'thug'], ['brute', 'gunner', 'bat']]);
    addArena(lv, 3400, 3900, [], { boss: 'miguel', final: true, canonAfter: 'davis' });
    return lv;
  },

  // ---------------- Universo ¿Y si...? ----------------
  m4() {
    const lv = styledLevel('ruina', { name: 'Nada es canon', width: 3700, water: 470 });
    const r = makeRng(505);
    bounds(lv);
    lv.tips.push({ x: 60, text: 'tip_ruin' });
    lv.addGround(0, 520, 'stone');
    for (const [px, py] of [[580, 380], [700, 340], [820, 370]]) lv.addOneway(px, py, 60, 'scaffold');
    lv.addGround(900, 1500, 'stone');
    roofRun(lv, 960, 1440, r, { wmin: 60, wmax: 110, hmin: 60, hmax: 180, gmin: 70, gmax: 120, styles: STYLE_SETS.ruin, ledges: true });
    lv.spawns.push({ type: 'zombie', x: 300 }, { type: 'zombie', x: 420 }, { type: 'ultron', x: 1100, y: 300 });
    for (const [px, py] of [[1560, 370], [1680, 320], [1800, 360], [1920, 310]]) lv.addOneway(px, py, 70, 'scaffold');
    lv.addGround(2000, 2600, 'stone');
    addArena(lv, 2040, 2560, [['zombie', 'zombie', 'zombie', 'zombie'], ['ultron', 'zombie', 'brute', 'ultron']]);
    for (const [px, py] of [[2660, 360], [2790, 330]]) lv.addOneway(px, py, 70, 'scaffold');
    lv.addGround(2900, 3700, 'stone');
    lv.decor.push({ type: 'rift', x: 3620, y: 300 });
    addArena(lv, 3000, 3700, [], { boss: 'desconocido4', final: true });
    return lv;
  },
};
