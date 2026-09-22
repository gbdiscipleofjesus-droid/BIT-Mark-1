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
    const x0 = cx - 40, x1 = cx + W + 40;
    // agua
    if (this.water) {
      const wy = Math.round(this.water - cy);
      if (wy < H) {
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
    // decoración trasera
    for (const d of this.decor) {
      if (d.x + (d.w || 200) < x0 || d.x - 200 > x1) continue;
      drawDecor(ctx, d, cx, cy, t, this);
    }
    for (const s of this.near(x0, x1)) {
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

  drawFront(ctx, cx, cy, t) {
    for (const d of this.front) {
      if (d.x + (d.w || 100) < cx - 40 || d.x > cx + W + 40) continue;
      drawDecor(ctx, d, cx, cy, t, this);
    }
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
};
const NEON = ['#e03080', '#30c0e0', '#e0c030', '#40e070', '#a050e0', '#e06030'];
const BILLBOARD_TEXT = ['STARK', 'BUGLE.NET', 'DELMAR', 'ROXXON', 'OSCORP', 'FERIA', 'PIZZA', 'BRAVO', 'MIDTOWN', 'SNACKS', 'MARVELOSO', 'TACOS'];

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
    if (r.chance(0.5)) lv.decor.push({ type: r.pick(['tank', 'ac', 'antenna', 'ac']), x: x + r.int(6, Math.max(7, w - 24)), y: top });
    if (o.billboards && r.chance(0.5) && h > 90) {
      lv.decor.push({ type: 'billboard', x: x + 6, y: top + r.int(20, 50), w: Math.min(w - 12, 70), h: 22, color: r.pick(NEON), text: r.pick(BILLBOARD_TEXT) });
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

function streetDecor(lv, x0, x1, r, night) {
  for (let x = x0 + 20; x < x1 - 20; x += r.int(60, 130)) {
    const ty = r.pick(['lamp', 'hydrant', 'car', 'lamp', 'car']);
    if (ty === 'car') lv.decor.push({ type: 'car', x, y: lv.groundY, color: r.pick(['#c0a020', '#a02828', '#2a4a8a', '#e8e8e8', '#3a3a3a']), taxi: r.chance(0.3) });
    else lv.decor.push({ type: ty, x, y: lv.groundY });
  }
}

function addArena(lv, x1, x2, waves, opts = {}) {
  lv.arenas.push({ x1, x2, waves, wave: -1, active: false, done: false, boss: opts.boss || null, title: opts.title || null });
  lv.checkpoints.push({ x: x1 + 20 });
}

const Levels = {
  // ---------------- Ciudad abierta ----------------
  city(sky) {
    const lv = new Level({ name: 'Nueva York', width: 7200, height: 480, groundY: 440, sky, theme: 'city' });
    const r = makeRng(2019);
    lv.addGround(0, 2620, 'street');
    lv.addGround(2620, 3520, 'bridge');
    lv.addGround(3520, 7200, 'street');
    lv.addSolid(-40, 0, 40, 480, 'block');
    lv.addSolid(7200, 0, 40, 480, 'block');
    const q = roofRun(lv, 120, 2500, r, { wmin: 70, wmax: 140, hmin: 60, hmax: 170, gmin: 20, gmax: 70, styles: STYLE_SETS.queens, ledges: true });
    streetDecor(lv, 0, 2600, r);
    lv.decor.push({ type: 'sign', x: 40, y: 380, w: 60, text: 'QUEENS' });
    lv.decor.push({ type: 'sign', x: 2520, y: 380, w: 66, text: 'MUELLE 7' });
    // Puente de Queensboro
    lv.addSolid(2760, 150, 36, 290, 'tower', null, true);
    lv.addSolid(3340, 150, 36, 290, 'tower', null, true);
    lv.decor.push({ type: 'cable', x: 2620, y: 330, x2: 2778, y2: 152, sag: 30 });
    lv.decor.push({ type: 'cable', x: 2778, y: 152, x2: 3358, y2: 152, sag: 120 });
    lv.decor.push({ type: 'cable', x: 3358, y: 152, x2: 3520, y2: 330, sag: 30 });
    lv.decor.push({ type: 'car', x: 2900, y: 440, color: '#e8e8e8' });
    lv.decor.push({ type: 'car', x: 3150, y: 440, color: '#c0a020', taxi: true });
    const m = roofRun(lv, 3600, 4850, r, { wmin: 90, wmax: 160, hmin: 140, hmax: 300, gmin: 30, gmax: 90, styles: STYLE_SETS.manhattan, ledges: true });
    const ts = roofRun(lv, 4950, 5700, r, { wmin: 90, wmax: 150, hmin: 120, hmax: 260, gmin: 40, gmax: 90, styles: STYLE_SETS.times, ledges: true, billboards: true });
    const m2 = roofRun(lv, 5800, 6850, r, { wmin: 90, wmax: 170, hmin: 150, hmax: 320, gmin: 30, gmax: 90, styles: STYLE_SETS.manhattan, ledges: true });
    streetDecor(lv, 3520, 7200, r);
    lv.decor.push({ type: 'sign', x: 3560, y: 380, w: 72, text: 'MANHATTAN' });
    lv.decor.push({ type: 'sign', x: 4990, y: 380, w: 84, text: 'TIMES SQUARE' });
    lv.decor.push({ type: 'sign', x: 6960, y: 380, w: 84, text: 'BATTERY PARK' });
    lv.decor.push({ type: 'dock', x: 6900, y: 440, w: 300 });
    // Fichas de tecnología Stark coleccionables (20)
    const all = q.concat(m, ts, m2);
    const rr = makeRng(77);
    const used = new Set();
    let id = 0;
    while (id < 20 && used.size < all.length) {
      const b = all[rr.int(0, all.length - 1)];
      if (used.has(b)) continue;
      used.add(b);
      const high = rr.chance(0.35);
      lv.tokens.push({ id: id++, x: b.x + b.w / 2, y: b.y - (high ? rr.int(60, 110) : 14) });
    }
    return lv.build();
  },

  mission(n) {
    const fn = [this.m1, this.m2, this.m3, this.m4, this.m5][n];
    return fn.call(this).build();
  },

  // ---------------- Misión 1: Queens ----------------
  m1() {
    const lv = new Level({ name: 'Queens', width: 3400, sky: 'sunset', theme: 'city' });
    const r = makeRng(101);
    lv.addGround(0, 3400, 'street');
    lv.addSolid(-40, 0, 40, 480, 'block', null, false);
    lv.addSolid(3400, 0, 40, 480, 'block', null, false);
    lv.addBuilding(300, 90, 60, 'brick', 11);
    lv.addBuilding(430, 110, 130, 'brown', 12);
    roofRun(lv, 600, 1400, r, { wmin: 80, wmax: 130, hmin: 110, hmax: 190, gmin: 50, gmax: 100, styles: STYLE_SETS.queens, ledges: true });
    streetDecor(lv, 0, 3400, r);
    roofRun(lv, 1900, 2600, r, { wmin: 80, wmax: 130, hmin: 100, hmax: 180, gmin: 40, gmax: 90, styles: STYLE_SETS.queens, ledges: true });
    lv.tips.push({ x: 40, text: 'tip_move' }, { x: 250, text: 'tip_wall' }, { x: 560, text: 'tip_swing' }, { x: 1000, text: 'tip_swing2' },
      { x: 1480, text: 'tip_fight' }, { x: 1560, text: 'tip_sense' }, { x: 1950, text: 'tip_web' }, { x: 2690, text: 'tip_brute' }, { x: 2400, text: 'tip_special' });
    addArena(lv, 1440, 1840, [['thug', 'thug', 'thug'], ['thug', 'gunner', 'thug']]);
    lv.spawns.push({ type: 'thug', x: 2050, y: 0 }, { type: 'gunner', x: 2300, y: 0 }, { type: 'thug', x: 2450, y: 0 });
    addArena(lv, 2660, 3000, [['bat', 'thug', 'thug'], ['brute', 'thug']]);
    lv.decor.push({ type: 'car', x: 3100, y: 440, color: '#3a3a3a' });
    lv.addSolid(2604, 412, 50, 28, 'truck', '#4a6a3a', false);
    addArena(lv, 3040, 3400, [], { boss: 'shocker' });
    return lv;
  },

  // ---------------- Misión 2: Almacén de Control de Daños ----------------
  m2() {
    const lv = new Level({ name: 'Almacén de Control de Daños', width: 3000, height: 300, groundY: 270, sky: 'night', theme: 'warehouse', indoor: true, anchorMinY: 0, topY: 112 });
    const r = makeRng(202);
    lv.addGround(0, 3000, 'floor');
    lv.addSolid(-40, 0, 40, 300, 'block', null, false);
    lv.addSolid(3000, 0, 40, 300, 'block', null, false);
    lv.addSolid(0, 0, 3000, 110, 'ceiling', null, false);
    for (let x = 60; x < 3000; x += 180) lv.decor.push({ type: 'light', x, y: 110, len: 10 });
    const crates = (x0, x1) => {
      for (let x = x0; x < x1; x += r.int(70, 140)) {
        const w = r.pick([20, 24, 30]), h = r.pick([20, 24, 36, 48]);
        lv.addSolid(x, 270 - h, w, h, 'crate');
        if (r.chance(0.4) && h < 40) lv.addSolid(x + 2, 270 - h - 20, 20, 20, 'crate');
      }
    };
    const catwalks = (x0, x1) => {
      for (let x = x0; x < x1; x += r.int(130, 200)) lv.addOneway(x, r.int(175, 205), r.int(60, 110), 'catwalk');
    };
    for (let x = 100; x < 2900; x += r.int(160, 260)) lv.decor.push({ type: 'shelf', x, y: 270, w: r.int(40, 70), h: r.int(60, 110) });
    crates(120, 640); catwalks(80, 660);
    lv.decor.push({ type: 'dodc', x: 160, y: 124 });
    lv.spawns.push({ type: 'thug', x: 380, y: 0 }, { type: 'gunner', x: 560, y: 0 });
    addArena(lv, 700, 1060, [['thug', 'thug', 'gunner'], ['chitauri', 'thug', 'thug']]);
    crates(1120, 1640); catwalks(1100, 1660);
    lv.spawns.push({ type: 'chitauri', x: 1300, y: 0 }, { type: 'thug', x: 1450, y: 0 }, { type: 'gunner', x: 1580, y: 0 });
    addArena(lv, 1700, 2060, [['brute', 'chitauri'], ['thug', 'thug', 'bat', 'gunner']]);
    crates(2120, 2520); catwalks(2100, 2540);
    lv.spawns.push({ type: 'bat', x: 2300, y: 0 }, { type: 'chitauri', x: 2450, y: 0 });
    lv.decor.push({ type: 'vault', x: 2880, y: 270 });
    lv.tips.push({ x: 60, text: 'tip_indoor' });
    addArena(lv, 2600, 3000, [], { boss: 'exo' });
    return lv;
  },

  // ---------------- Misión 3: Puente ----------------
  m3() {
    const lv = new Level({ name: 'Puente de Brooklyn', width: 3600, sky: 'dusk', theme: 'bridge', water: 470 });
    const r = makeRng(303);
    lv.addSolid(-40, 0, 40, 480, 'block', null, false);
    lv.addSolid(3600, 0, 40, 480, 'block', null, false);
    // tablero con huecos destrozados
    const gaps = [[560, 640], [1450, 1530], [1720, 1800], [2560, 2650]];
    let x = 0;
    for (const [g0, g1] of gaps) { lv.addGround(x, g0, 'bridge'); x = g1; }
    lv.addGround(x, 3600, 'bridge');
    for (const tx of [400, 1300, 2450, 3050]) lv.addSolid(tx, 130, 40, 310, 'tower');
    lv.decor.push({ type: 'cable', x: 0, y: 300, x2: 420, y2: 132, sag: 30 });
    lv.decor.push({ type: 'cable', x: 420, y: 132, x2: 1320, y2: 132, sag: 150 });
    lv.decor.push({ type: 'cable', x: 1320, y: 132, x2: 2470, y2: 132, sag: 170 });
    lv.decor.push({ type: 'cable', x: 2470, y: 132, x2: 3070, y2: 132, sag: 120 });
    lv.decor.push({ type: 'cable', x: 3070, y: 132, x2: 3600, y2: 300, sag: 30 });
    for (const [tx, col] of [[250, '#8a2a2a'], [760, '#2a5a8a'], [1100, '#5a5a5a'], [2200, '#8a6a2a']]) lv.addSolid(tx, 414, 64, 26, 'truck', col, false);
    for (let i = 0; i < 8; i++) lv.decor.push({ type: 'car', x: r.int(100, 3500), y: 440, color: r.pick(['#c0a020', '#a02828', '#2a4a8a', '#e8e8e8']), taxi: r.chance(0.4) });
    lv.addOneway(560, 380, 80, 'scaffold');
    lv.addOneway(1450, 370, 80, 'scaffold');
    lv.addOneway(1720, 380, 80, 'scaffold');
    lv.addOneway(2560, 370, 90, 'scaffold');
    lv.spawns.push({ type: 'thug', x: 700, y: 0 }, { type: 'gunner', x: 820, y: 0 }, { type: 'drone', x: 1600, y: 360 }, { type: 'thug', x: 1900, y: 0 });
    addArena(lv, 900, 1260, [['thug', 'gunner', 'thug'], ['chitauri', 'chitauri', 'thug']]);
    addArena(lv, 1950, 2360, [['drone', 'drone', 'thug', 'thug'], ['brute', 'gunner']]);
    lv.spawns.push({ type: 'drone', x: 2700, y: 360 }, { type: 'chitauri', x: 2850, y: 0 });
    lv.tips.push({ x: 60, text: 'tip_water' });
    addArena(lv, 3140, 3600, [], { boss: 'vulture' });
    return lv;
  },

  // ---------------- Misión 4: Times Square ----------------
  m4() {
    const lv = new Level({ name: 'Times Square', width: 3400, sky: 'night', theme: 'times' });
    const r = makeRng(404);
    lv.addGround(0, 3400, 'street');
    lv.addSolid(-40, 0, 40, 480, 'block', null, false);
    lv.addSolid(3400, 0, 40, 480, 'block', null, false);
    roofRun(lv, 150, 950, r, { wmin: 90, wmax: 140, hmin: 130, hmax: 250, gmin: 50, gmax: 100, styles: STYLE_SETS.times, ledges: true, billboards: true });
    roofRun(lv, 1400, 1950, r, { wmin: 90, wmax: 140, hmin: 130, hmax: 250, gmin: 50, gmax: 100, styles: STYLE_SETS.times, ledges: true, billboards: true });
    roofRun(lv, 2400, 2900, r, { wmin: 90, wmax: 140, hmin: 130, hmax: 250, gmin: 50, gmax: 100, styles: STYLE_SETS.times, ledges: true, billboards: true });
    streetDecor(lv, 0, 3400, r);
    for (let i = 0; i < 6; i++) lv.decor.push({ type: 'billboard', x: 980 + i * 70 + (i > 2 ? 600 : 0), y: 300, w: 56, h: 30, color: NEON[i % NEON.length], text: ['BUGLE.NET', 'MYSTERIO', '¿HÉROE?', 'E.D.I.T.H.', 'DELMAR', 'STARK'][i] });
    lv.spawns.push({ type: 'drone', x: 500, y: 300 }, { type: 'thug', x: 700, y: 0 }, { type: 'drone', x: 1600, y: 250 }, { type: 'gunner', x: 1700, y: 0 }, { type: 'drone', x: 2600, y: 260 });
    addArena(lv, 1000, 1360, [['drone', 'drone', 'drone'], ['thug', 'thug', 'drone', 'gunner']]);
    addArena(lv, 2000, 2360, [['chitauri', 'brute', 'drone'], ['drone', 'drone', 'bat', 'thug']]);
    lv.tips.push({ x: 60, text: 'tip_illusion' });
    addArena(lv, 2980, 3400, [], { boss: 'mysterio' });
    return lv;
  },

  // ---------------- Misión 5: Estatua de la Libertad ----------------
  m5() {
    const lv = new Level({ name: 'Isla de la Libertad', width: 3300, sky: 'rift', theme: 'liberty', water: 470 });
    const r = makeRng(505);
    lv.addSolid(-40, 0, 40, 480, 'block', null, false);
    lv.addSolid(3300, 0, 40, 480, 'block', null, false);
    lv.addGround(0, 420, 'stone');
    lv.decor.push({ type: 'statue', x: 2950, y: 440 });
    // andamios sobre el agua
    const pillars = [[480, 330], [620, 290], [760, 350]];
    for (const [px, py] of pillars) { lv.addSolid(px, py, 22, 480 - py, 'pillar'); lv.addOneway(px - 30, py + 30, 30, 'scaffold'); }
    lv.addGround(820, 1200, 'stone');
    const p2 = [[1260, 320], [1380, 260], [1500, 300], [1620, 250], [1740, 330]];
    for (const [px, py] of p2) { lv.addSolid(px, py, 22, 480 - py, 'pillar'); lv.addOneway(px + 22, py + 40, 34, 'scaffold'); }
    lv.addGround(1800, 2200, 'stone');
    const p3 = [[2260, 300], [2400, 260], [2540, 320]];
    for (const [px, py] of p3) { lv.addSolid(px, py, 22, 480 - py, 'pillar'); lv.addOneway(px - 34, py + 36, 34, 'scaffold'); }
    lv.addGround(2620, 3300, 'stone');
    for (let x = 900; x < 3300; x += 700) lv.addSolid(x + 200, 390, 16, 50, 'pillar');
    lv.spawns.push({ type: 'thug', x: 250, y: 0 }, { type: 'drone', x: 700, y: 250 }, { type: 'drone', x: 1500, y: 200 }, { type: 'chitauri', x: 2000, y: 0 });
    addArena(lv, 840, 1190, [['thug', 'thug', 'chitauri', 'gunner'], ['brute', 'brute']]);
    addArena(lv, 1820, 2190, [['drone', 'chitauri', 'chitauri'], ['bat', 'bat', 'brute']]);
    lv.tips.push({ x: 60, text: 'tip_final' });
    addArena(lv, 2660, 3300, [], { boss: 'scorpion' });
    return lv;
  },
};
