'use strict';
// ---------------------------------------------------------------------------
// Poderes de traje: cada traje tiene su propio poder, con su animación.
// Los poderes se desbloquean al conseguir el traje y se equipan aparte
// (pestaña PODERES), así que puedes llevar un traje con el poder de otro.
// ---------------------------------------------------------------------------

// ---------------- utilidades ----------------
const PW = {
  targets(world, p, r = 9999) {
    return world.enemies.filter((e) => !e.dead && e.hittable() && world.onScreen(e) && dist(p.cx, p.cy, e.cx, e.cy) < r);
  },
  hit(world, p, e, dmg, kx = 160, ky = -160, heavy = true) {
    if (e.dead || !e.hittable()) return;
    world.playerHits(e, dmg * (p.dmgMul || 1), kx, ky, heavy);
  },
  stun(world, e, dur, power = 2) {
    if (e.dead) return;
    if (e.isBoss) e.web(1, world, power); else e.web(dur, world);
  },
  quake(world, dur, amp) { world.quakeT = Math.max(world.quakeT || 0, dur); world.quakeAmp = amp; },
  pose(p, kind, dur) { p.powAnim = { kind, t: 0, dur }; },
  pop(world, text, x, y, c) { world.pops.push({ text, x, y, t: 0, c }); },
  later(world, t, fn) { world.fx.push(new FXDelay(t, fn)); },
  ground(p) { return p.onGround ? p.feet : p.feet + 20; },
};

// ---------------- efectos base ----------------
class FXDelay {
  constructor(t, fn) { this.t = t; this.fn = fn; }
  update(dt, world) { this.t -= dt; if (this.t <= 0) { this.fn(world); return false; } return true; }
  draw() {}
}

// Destello o filtro de pantalla completa
class FXScreen {
  constructor(kind, dur, color) { Object.assign(this, { kind, dur, color, t: 0 }); }
  update(dt) { this.t += dt; return this.t < this.dur; }
  draw(ctx, cam, t) {
    const u = this.t / this.dur, fade = Math.min(1, (1 - u) * 4, this.t * 8);
    ctx.save();
    switch (this.kind) {
      case 'flash': ctx.globalAlpha = (1 - u) * 0.8; ctx.fillStyle = this.color; ctx.fillRect(0, 0, VW, VH); break;
      case 'invert': if (Math.floor(this.t * 14) % 3 !== 2) { ctx.globalCompositeOperation = 'difference'; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, VW, VH); } break;
      case 'gray': ctx.globalAlpha = fade; ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, VW, VH); break;
      case 'tint': ctx.globalAlpha = fade * 0.22; ctx.fillStyle = this.color; ctx.fillRect(0, 0, VW, VH); break;
      case 'dark': {
        ctx.globalAlpha = fade * 0.85;
        const g = ctx.createRadialGradient(VW / 2, VH / 2, 30, VW / 2, VH / 2, VW * 0.6);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, this.color || '#000000');
        ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
        break;
      }
      case 'comic': {
        ctx.globalAlpha = fade * 0.35; ctx.fillStyle = this.color || '#ffe040';
        for (let y = 0; y < VH; y += 6) for (let x = (y / 6) % 2 * 3; x < VW; x += 6) ctx.fillRect(x, y, 2, 2);
        break;
      }
      case 'glitch': {
        ctx.globalAlpha = fade * 0.5;
        for (let i = 0; i < 6; i++) { ctx.fillStyle = pick(['#ff40c0', '#40ffe0', '#ffe040']); ctx.fillRect(0, rand(0, VH), VW, rand(1, 4)); }
        break;
      }
      case 'clock': {
        ctx.globalAlpha = fade * 0.18; ctx.fillStyle = '#4080ff'; ctx.fillRect(0, 0, VW, VH);
        ctx.globalAlpha = fade * 0.5; ctx.strokeStyle = '#a0c8ff'; ctx.lineWidth = 1;
        const cx = VW / 2, cy = VH / 2;
        ctx.beginPath(); ctx.arc(cx, cy, 70, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, 64, 0, TAU); ctx.stroke();
        for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 58, cy + Math.sin(a) * 58); ctx.lineTo(cx + Math.cos(a) * 64, cy + Math.sin(a) * 64); ctx.stroke(); }
        const a1 = -Math.PI / 2 + this.t * 0.4, a2 = -Math.PI / 2 + this.t * 4;
        ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a1) * 36, cy + Math.sin(a1) * 36); ctx.stroke();
        ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a2) * 54, cy + Math.sin(a2) * 54); ctx.stroke();
        break;
      }
    }
    ctx.restore();
  }
}

// Onda expansiva: golpea a cada enemigo cuando el frente de la onda le llega
class FXWave {
  constructor(p, x, y, R, dur, color, onHit, opts = {}) { Object.assign(this, { p, x, y, R, dur, color, onHit, t: 0, done: new Set(), flat: opts.flat, width: opts.width || 3, rings: opts.rings || 1 }); }
  update(dt, world) {
    this.t += dt;
    const r = this.R * Math.min(1, this.t / this.dur);
    for (const e of world.enemies) {
      if (this.done.has(e) || e.dead || !e.hittable()) continue;
      const d = this.flat ? Math.abs(e.cx - this.x) + Math.abs(e.feet - this.y) * 2 : dist(this.x, this.y, e.cx, e.cy);
      if (d < r) { this.done.add(e); this.onHit(e, world); }
    }
    return this.t < this.dur + 0.25;
  }
  draw(ctx, cam) {
    const u = Math.min(1, this.t / this.dur), a = 1 - Math.max(0, (this.t - this.dur * 0.6) / (this.dur * 0.4 + 0.25));
    const x = this.x - cam.x, y = this.y - cam.y;
    ctx.save(); ctx.globalAlpha = clamp(a, 0, 1); ctx.strokeStyle = this.color;
    for (let k = 0; k < this.rings; k++) {
      const r = this.R * Math.max(0, u - k * 0.12);
      if (r <= 1) continue;
      ctx.lineWidth = Math.max(1, this.width * (1 - u * 0.6) - k);
      ctx.beginPath();
      if (this.flat) ctx.ellipse(x, y, r, r * 0.22, 0, 0, TAU); else ctx.arc(x, y, r, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// Terremoto: grietas en el suelo, rocas, polvo y pantalla temblando
class FXQuake {
  constructor(p, x, y, dur, R, dmg) {
    Object.assign(this, { p, x, y, dur, R, dmg, t: 0, pulse: 0 });
    this.cracks = [];
    for (let s = -1; s <= 1; s += 2) for (let k = 0; k < 3; k++) {
      const pts = [[0, 0]]; let cx = 0, cy = 0;
      const len = R * rand(0.5, 1);
      while (Math.abs(cx) < len) { cx += s * rand(6, 14); cy = clamp(cy + rand(-3, 3), -6 + k * 2, 6 - k); pts.push([cx, cy]); }
      this.cracks.push(pts);
    }
  }
  update(dt, world) {
    this.t += dt; this.pulse -= dt;
    PW.quake(world, 0.1, 5 * (1 - this.t / this.dur) + 1);
    if (this.pulse <= 0 && this.t < this.dur * 0.8) {
      this.pulse = 0.28;
      Audio2.sfx('heavy'); Input.rumble(1, 1, 200);
      for (const e of world.enemies) {
        if (e.dead || !e.hittable() || e.fly) continue;
        if (Math.abs(e.cx - this.x) < this.R * Math.min(1, this.t * 3 + 0.3)) {
          PW.hit(world, this.p, e, this.dmg, sign(e.cx - this.x || 1) * 60, -260, true);
        }
      }
    }
    // rocas y polvo
    if (Math.random() < 0.9) {
      const rx = this.x + rand(-this.R, this.R) * Math.min(1, this.t * 2 + 0.2);
      world.particles.add(rx, this.y - 1, rand(-40, 40), rand(-220, -90), rand(0.5, 0.9), pick(['#6a4a2a', '#8a6a40', '#4a3420']), pick([2, 3]), 600);
      world.particles.dust(rx, this.y, 2);
    }
    return this.t < this.dur;
  }
  draw(ctx, cam) {
    const u = Math.min(1, this.t / 0.35), fade = Math.min(1, (this.dur - this.t) * 2);
    ctx.save(); ctx.globalAlpha = fade;
    ctx.translate(this.x - cam.x, this.y - cam.y);
    for (const pts of this.cracks) {
      const n = Math.max(2, Math.floor(pts.length * u));
      ctx.strokeStyle = '#1a1008'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < n; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,140,40,0.55)'; ctx.lineWidth = 0.6; ctx.stroke();
    }
    // bloques de suelo levantados
    ctx.fillStyle = '#5a4028';
    for (let i = -3; i <= 3; i++) { const h = Math.max(0, Math.sin(this.t * 14 + i * 1.7)) * 4 * fade; ctx.fillRect(i * 16 - 5, -h - 1, 10, h + 1); }
    ctx.restore();
  }
}

// Línea que viaja hasta un enemigo (red, láser, tentáculo) y al llegar ejecuta onArrive
class FXLine {
  constructor(p, e, color, speed, onArrive, opts = {}) { Object.assign(this, { p, e, color, speed, onArrive, t: 0, hitT: -1, width: opts.width || 1, style: opts.style || 'web', life: opts.life || 0.35 }); this.x0 = opts.x0 !== undefined ? opts.x0 : p.cx; this.y0 = opts.y0 !== undefined ? opts.y0 : p.y + 8; }
  update(dt, world) {
    this.t += dt;
    const d = dist(this.x0, this.y0, this.e.cx, this.e.cy);
    if (this.hitT < 0 && this.t * this.speed >= d) { this.hitT = this.t; if (this.onArrive) this.onArrive(this.e, world); }
    return this.hitT < 0 ? this.t < 2 : this.t - this.hitT < this.life;
  }
  draw(ctx, cam, t) {
    const d = dist(this.x0, this.y0, this.e.cx, this.e.cy) || 1;
    const u = this.hitT < 0 ? Math.min(1, this.t * this.speed / d) : 1;
    const x0 = this.x0 - cam.x, y0 = this.y0 - cam.y;
    const x1 = x0 + (this.e.cx - this.x0) * u, y1 = y0 + (this.e.cy - this.y0) * u;
    ctx.save();
    if (this.hitT >= 0) ctx.globalAlpha = 1 - (this.t - this.hitT) / this.life;
    ctx.strokeStyle = this.color; ctx.lineWidth = this.width;
    ctx.beginPath(); ctx.moveTo(x0, y0);
    if (this.style === 'zap') {
      const n = 6;
      for (let i = 1; i < n; i++) { const k = i / n; ctx.lineTo(x0 + (x1 - x0) * k + rand(-3, 3), y0 + (y1 - y0) * k + rand(-3, 3)); }
    } else if (this.style === 'goo') {
      ctx.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + Math.sin(t * 20) * 6, x1, y1);
    }
    ctx.lineTo(x1, y1); ctx.stroke();
    if (this.style === 'laser') { ctx.globalAlpha *= 0.4; ctx.lineWidth = this.width * 3; ctx.stroke(); }
    ctx.fillStyle = this.color; ctx.fillRect(x1 - 1.5, y1 - 1.5, 3, 3);
    ctx.restore();
  }
}

// Capullo de red dibujado sobre el enemigo atrapado
class FXCocoon {
  constructor(e, dur, color) { Object.assign(this, { e, dur, color, t: 0 }); }
  update(dt) { this.t += dt; return this.t < this.dur && !this.e.dead; }
  draw(ctx, cam) {
    const e = this.e, x = e.cx - cam.x, top = e.y - cam.y - (e.z || 0), h = e.h * (e.scale || 1);
    const u = Math.min(1, this.t * 4);
    ctx.save(); ctx.strokeStyle = this.color; ctx.lineWidth = 0.8; ctx.globalAlpha = 0.9;
    const n = Math.floor(6 * u);
    for (let i = 0; i < n; i++) { const yy = top + e.h - h + 3 + i * h / 6; ctx.beginPath(); ctx.moveTo(x - 7, yy); ctx.lineTo(x + 7, yy + 3); ctx.stroke(); }
    ctx.beginPath(); ctx.ellipse(x, top + e.h - h / 2, 8, h / 2 + 1, 0, 0, TAU * u); ctx.stroke();
    ctx.restore();
  }
}

// Rayo que cae del cielo sobre un punto
class FXBolt {
  constructor(x, y, color, delay, onStrike) { Object.assign(this, { x, y, color, delay, onStrike, t: 0, fired: false }); this.pts = []; }
  update(dt, world) {
    this.t += dt;
    if (!this.fired && this.t >= this.delay) {
      this.fired = true;
      let px = this.x, py = world.cam.y - 10; this.pts = [[px, py]];
      while (py < this.y) { py += rand(10, 20); px += rand(-8, 8); this.pts.push([px, Math.min(py, this.y)]); }
      world.fx.push(new FXScreen('flash', 0.12, '#e0f4ff'));
      Audio2.sfx('explode'); world.shake(4);
      world.particles.burst(this.x, this.y, 12, this.color, 120);
      if (this.onStrike) this.onStrike(world);
    }
    return this.t < this.delay + 0.3;
  }
  draw(ctx, cam) {
    if (!this.fired) {
      // aviso: círculo en el suelo
      ctx.strokeStyle = this.color; ctx.globalAlpha = 0.6; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(this.x - cam.x, this.y - cam.y, 8 * (this.t / this.delay), 2, 0, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
      return;
    }
    const a = 1 - (this.t - this.delay) / 0.3;
    ctx.save(); ctx.globalAlpha = a;
    for (const [w, c] of [[4, this.color], [1.5, '#ffffff']]) {
      ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath();
      this.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x - cam.x, y - cam.y) : ctx.moveTo(x - cam.x, y - cam.y)));
      ctx.stroke();
    }
    ctx.restore();
  }
}

// Aura alrededor del jugador mientras dura el efecto
class FXAura {
  constructor(p, kind, dur, color) { Object.assign(this, { p, kind, dur, color, t: 0 }); }
  update(dt, world) {
    this.t += dt;
    const p = this.p;
    if (p.state === 'dead') return false;
    const col = this.color;
    switch (this.kind) {
      case 'fire': if (Math.random() < 0.7) world.particles.add(p.cx + rand(-7, 7), p.feet - rand(0, 26), rand(-10, 10), rand(-70, -30), rand(0.3, 0.6), pick([col, '#ffd040', '#ff4020']), pick([1, 2]), -40); break;
      case 'embers': if (Math.random() < 0.5) world.particles.add(p.cx + rand(-9, 9), p.feet - rand(0, 30), rand(-20, 20), rand(-50, -20), rand(0.4, 0.9), pick(['#ff8030', '#ffc060', '#801808']), 1, -20); break;
      case 'smoke': if (Math.random() < 0.3) world.particles.add(p.cx + rand(-6, 6), p.feet - rand(4, 24), rand(-12, 12), rand(-20, -5), rand(0.5, 0.9), pick(['#40444c', '#2a2c34']), 3, -10); break;
      case 'spark': if (Math.random() < 0.6) world.particles.spark(p.cx + rand(-8, 8), p.feet - rand(2, 28), col, 1); break;
      case 'gold': if (Math.random() < 0.4) world.particles.add(p.cx + rand(-10, 10), p.feet - rand(0, 30), 0, rand(-40, -15), rand(0.4, 0.8), pick(['#ffe070', '#fff4c0', col]), 1, 0); break;
      case 'heal': if (Math.random() < 0.5) world.particles.add(p.cx + rand(-9, 9), p.feet - rand(0, 20), 0, rand(-50, -25), rand(0.5, 0.9), pick(['#80ff90', '#e0ffe0', col]), 1, 0); break;
      case 'glitch': if (Math.random() < 0.3) world.particles.add(p.cx + rand(-9, 9), p.feet - rand(0, 28), rand(-30, 30), 0, 0.15, pick(['#ff40c0', '#40ffe0']), 2, 0); break;
    }
    return this.t < this.dur;
  }
  draw(ctx, cam, t) {
    const p = this.p, x = p.cx - cam.x, y = p.feet - cam.y - (p.z || 0);
    const end = Math.min(1, (this.dur - this.t) * 2);
    ctx.save(); ctx.globalAlpha = end;
    switch (this.kind) {
      case 'fire': ctx.fillStyle = 'rgba(255,90,30,0.18)'; ctx.beginPath(); ctx.ellipse(x, y - 15, 12 + Math.sin(t * 20), 20, 0, 0, TAU); ctx.fill(); break;
      case 'bubble': case 'lion': {
        const r = 20 + Math.sin(t * 6);
        ctx.strokeStyle = this.color; ctx.lineWidth = 1.2; ctx.globalAlpha = end * 0.8;
        ctx.beginPath(); ctx.arc(x, y - 15, r, 0, TAU); ctx.stroke();
        ctx.globalAlpha = end * 0.15; ctx.fillStyle = this.color; ctx.fill();
        ctx.globalAlpha = end * 0.6;
        if (this.kind === 'lion') { // cruz del Reino Unido
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - r, y - 15); ctx.lineTo(x + r, y - 15); ctx.moveTo(x, y - 15 - r); ctx.lineTo(x, y - 15 + r); ctx.stroke();
          ctx.strokeStyle = '#d0202c'; ctx.lineWidth = 1; ctx.stroke();
        } else for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + t; ctx.fillStyle = '#ffffff'; ctx.fillRect(x + Math.cos(a) * r - 1, y - 15 + Math.sin(a) * r - 1, 2, 2); }
        break;
      }
      case 'phase': ctx.strokeStyle = this.color; ctx.globalAlpha = end * (0.4 + 0.3 * Math.sin(t * 20)); ctx.lineWidth = 1; ctx.strokeRect(x - 9, y - 32, 18, 32); break;
      case 'armor': {
        const u = Math.min(1, this.t * 3);
        ctx.fillStyle = '#9aa0aa'; ctx.strokeStyle = '#40444c'; ctx.lineWidth = 0.5;
        for (let i = 0; i < 4; i++) { const k = 1 - u; const px = x - 6 + (i % 2) * 7 + (i % 2 ? 1 : -1) * k * 30, py = y - 26 + Math.floor(i / 2) * 9 - k * 20; ctx.globalAlpha = end * 0.55; ctx.fillRect(px, py, 5, 7); ctx.strokeRect(px, py, 5, 7); }
        break;
      }
      case 'sense': {
        ctx.strokeStyle = Math.floor(t * 16) % 2 ? '#ffffff' : this.color; ctx.lineWidth = 0.7;
        for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + t * 2, r0 = 14, r1 = 20 + Math.sin(t * 10 + i) * 2; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r0, y - 16 + Math.sin(a) * r0); ctx.lineTo(x + Math.cos(a + 0.15) * r1, y - 16 + Math.sin(a + 0.15) * r1); ctx.stroke(); }
        break;
      }
      case 'dark': ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(x, y - 15, 14, 22, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#ff2020'; ctx.fillRect(x + p.facing * 2 - 1, y - 30, 2, 1); break;
      case 'heal': ctx.strokeStyle = '#80ff90'; ctx.globalAlpha = end * 0.5; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x, y, 14, 3, 0, 0, TAU); ctx.stroke(); break;
      case 'unstop': ctx.strokeStyle = '#ff8030'; ctx.globalAlpha = end * (0.5 + 0.3 * Math.sin(t * 12)); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(x, y - 15, 13, 21, 0, 0, TAU); ctx.stroke(); break;
    }
    ctx.restore();
  }
}

// Remolino: atrae a los enemigos al centro y al final los lanza
class FXVortex {
  constructor(p, x, y, R, dur, colors, dmg, style) { Object.assign(this, { p, x, y, R, dur, colors, dmg, style, t: 0, tick: 0 }); }
  update(dt, world) {
    this.t += dt; this.tick -= dt;
    for (const e of world.enemies) {
      if (e.dead || !e.hittable() || e.isBoss) continue;
      const d = dist(this.x, this.y, e.cx, e.cy);
      if (d < this.R) { e.x += (this.x - e.cx) * Math.min(1, dt * 3); if (!e.fly) e.vy = Math.min(e.vy, -20); e.webbed = Math.max(e.webbed, 0.3); }
    }
    if (this.tick <= 0) { this.tick = 0.35; for (const e of world.enemies) if (!e.dead && e.hittable() && dist(this.x, this.y, e.cx, e.cy) < this.R * 0.5) PW.hit(world, this.p, e, this.dmg * 0.3, 0, -40, false); }
    if (Math.random() < 0.8) { const a = rand(0, TAU); world.particles.add(this.x + Math.cos(a) * this.R * 0.8, this.y + Math.sin(a) * this.R * 0.4, -Math.cos(a) * 80, -Math.sin(a) * 40, 0.4, pick(this.colors), 1, 0); }
    if (this.t >= this.dur) {
      for (const e of world.enemies) if (!e.dead && e.hittable() && dist(this.x, this.y, e.cx, e.cy) < this.R) PW.hit(world, this.p, e, this.dmg, sign(e.cx - this.x || 1) * 240, -300, true);
      world.fx.push(new FXWave(this.p, this.x, this.y, this.R, 0.3, this.colors[0], () => {}));
      world.shake(6); Audio2.sfx('explode');
      return false;
    }
    return true;
  }
  draw(ctx, cam, t) {
    const x = this.x - cam.x, y = this.y - cam.y, g = Math.min(1, this.t * 3);
    ctx.save();
    for (let k = 0; k < 3; k++) {
      ctx.strokeStyle = this.colors[k % this.colors.length]; ctx.lineWidth = 1.5 - k * 0.3; ctx.globalAlpha = 0.8;
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) {
        const u = i / 40, a = u * TAU * 2.5 + t * (7 + k) + k * 2, r = this.R * g * (1 - u) * (0.5 + k * 0.2);
        const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r * (this.style === 'tornado' ? 0.3 : 0.55) - (this.style === 'tornado' ? u * 50 - 25 : 0);
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.stroke();
    }
    if (this.style === 'portal') { ctx.fillStyle = '#000000'; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.ellipse(x, y, 10 * g, 16 * g, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = pick(this.colors); ctx.lineWidth = 2; ctx.stroke(); }
    ctx.restore();
  }
}

// Púa o tentáculo que brota del suelo bajo un enemigo
class FXSpike {
  constructor(p, e, delay, color, dmg, h = 30) { Object.assign(this, { p, e, delay, color, dmg, h, t: 0, hit: false }); this.x = e.cx; this.y = e.feet; }
  update(dt, world) {
    this.t += dt;
    if (!this.hit && this.t >= this.delay) { this.hit = true; PW.hit(world, this.p, this.e, this.dmg, 0, -320, true); world.particles.burst(this.x, this.y - 10, 8, this.color, 90); Audio2.sfx('heavy'); }
    return this.t < this.delay + 0.6;
  }
  draw(ctx, cam) {
    const x = this.x - cam.x, y = this.y - cam.y;
    if (this.t < this.delay) { ctx.fillStyle = this.color; ctx.globalAlpha = 0.5; ctx.fillRect(x - 6, y - 1, 12, 2); ctx.globalAlpha = 1; return; }
    const u = this.t - this.delay, k = u < 0.12 ? u / 0.12 : Math.max(0, 1 - (u - 0.3) / 0.3);
    const h = this.h * k;
    ctx.fillStyle = this.color;
    for (const [ox, sc] of [[0, 1], [-5, 0.6], [5, 0.7]]) { ctx.beginPath(); ctx.moveTo(x + ox - 3, y); ctx.quadraticCurveTo(x + ox + 3 * sc, y - h * sc * 0.6, x + ox, y - h * sc); ctx.lineTo(x + ox + 3, y); ctx.fill(); }
  }
}

// Proyectil del poder (aguijones, misiles, notas, monedas, meteoritos...)
class FXShot {
  constructor(p, x, y, vx, vy, kind, color, dmg, opts = {}) { Object.assign(this, { p, x, y, vx, vy, kind, color, dmg, t: 0, life: opts.life || 1.6, target: opts.target || null, grav: opts.grav || 0, r: opts.r || 8, trail: [] }); }
  update(dt, world) {
    this.t += dt;
    if (this.target && !this.target.dead) {
      const a = Math.atan2(this.target.cy - this.y, this.target.cx - this.x), sp = Math.hypot(this.vx, this.vy);
      const cur = Math.atan2(this.vy, this.vx); let da = a - cur; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
      const na = cur + clamp(da, -6 * dt, 6 * dt); this.vx = Math.cos(na) * sp; this.vy = Math.sin(na) * sp;
    }
    this.vy += this.grav * dt;
    this.trail.push([this.x, this.y]); if (this.trail.length > 6) this.trail.shift();
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (this.kind === 'missile' && Math.random() < 0.6) world.particles.add(this.x, this.y, rand(-10, 10), rand(-10, 10), 0.4, '#a0a0a8', 2, -10);
    for (const e of world.enemies) {
      if (e.dead || !e.hittable()) continue;
      if (Math.abs(e.cx - this.x) < this.r && Math.abs(e.cy - this.y) < e.h / 2 + 4) {
        PW.hit(world, this.p, e, this.dmg, sign(this.vx || 1) * 150, -140, this.dmg > 1);
        if (this.kind === 'missile' || this.kind === 'meteor' || this.kind === 'coin') { world.particles.burst(this.x, this.y, 10, this.kind === 'coin' ? '#ffe040' : '#ff9040', 100); Audio2.sfx('explode'); }
        return false;
      }
    }
    if (this.grav && this.y > (this.floor || 1e9)) return false;
    return this.t < this.life;
  }
  draw(ctx, cam, t) {
    const x = this.x - cam.x, y = this.y - cam.y;
    ctx.save();
    ctx.strokeStyle = this.color; ctx.globalAlpha = 0.4; ctx.lineWidth = 1;
    if (this.trail.length > 1) { ctx.beginPath(); this.trail.forEach(([a, b], i) => (i ? ctx.lineTo(a - cam.x, b - cam.y) : ctx.moveTo(a - cam.x, b - cam.y))); ctx.lineTo(x, y); ctx.stroke(); }
    ctx.globalAlpha = 1; ctx.fillStyle = this.color;
    switch (this.kind) {
      case 'note': ctx.fillRect(x - 2, y, 3, 2); ctx.fillRect(x, y - 5, 1, 5); ctx.fillRect(x, y - 5, 3, 1); break;
      case 'coin': ctx.fillStyle = Math.floor(t * 10) % 2 ? '#ffe040' : '#c09010'; ctx.fillRect(x - 2, y - 2, 4, 4); ctx.fillStyle = '#fff4c0'; ctx.fillRect(x - 1, y - 1, 1, 1); break;
      case 'meteor': ctx.fillStyle = '#ff8030'; ctx.beginPath(); ctx.arc(x, y, 3, 0, TAU); ctx.fill(); ctx.fillStyle = '#ffe080'; ctx.fillRect(x - 1, y - 1, 2, 2); break;
      case 'missile': ctx.fillStyle = '#d0d4dc'; ctx.fillRect(x - 2, y - 1, 4, 2); ctx.fillStyle = '#ff5030'; ctx.fillRect(x - 3 * sign(this.vx || 1), y - 1, 1, 2); break;
      case 'bot': ctx.fillStyle = '#16161c'; ctx.fillRect(x - 2, y - 1, 4, 2); ctx.fillStyle = this.color; ctx.fillRect(x - 1, y - 1, 1, 1); ctx.strokeStyle = '#16161c'; ctx.lineWidth = 0.5; for (let i = -1; i <= 1; i += 2) { ctx.beginPath(); ctx.moveTo(x - 2, y); ctx.lineTo(x - 3, y + 1 + (Math.floor(t * 20) % 2) * i); ctx.moveTo(x + 2, y); ctx.lineTo(x + 3, y + 1 - (Math.floor(t * 20) % 2) * i); ctx.stroke(); } break;
      default: ctx.fillRect(x - 2, y - 0.5, 4, 1.5);
    }
    ctx.restore();
  }
}

// Carrera relámpago: cruza la pantalla golpeando, dejando imágenes residuales
class FXDash {
  constructor(p, passes, color, dmg) { Object.assign(this, { p, passes, color, dmg, t: 0, k: 0, ghosts: [], hitSet: new Set() }); this.dir = p.facing; this.startX = p.x; }
  update(dt, world) {
    if (this.dead) return this.ghosts.length > 0;
    const p = this.p; this.t += dt;
    if (p.state === 'dead' || this.t > 3) { this.dead = true; return true; }
    const speed = 900;
    p.x += this.dir * speed * dt; p.vx = 0; p.vy = 0; p.inv = Math.max(p.inv, 0.3); p.facing = this.dir;
    this.ghosts.push({ x: p.cx, y: p.feet, a: 1 });
    for (const e of world.enemies) {
      if (e.dead || !e.hittable() || this.hitSet.has(e)) continue;
      if (Math.abs(e.cx - p.cx) < 14 && Math.abs(e.feet - p.feet) < 30) { this.hitSet.add(e); PW.hit(world, p, e, this.dmg, this.dir * 200, -220, true); }
    }
    const left = world.cam.x + 20, right = world.cam.x + VW - 20;
    if ((this.dir > 0 && p.cx > right) || (this.dir < 0 && p.cx < left)) {
      this.k++; this.dir = -this.dir; this.hitSet.clear(); Audio2.sfx('whoosh');
      if (this.k >= this.passes) { p.x = clamp(p.x, left, right - p.w); this.dead = true; }
    }
    return true;
  }
  draw(ctx, cam) {
    ctx.save();
    for (const g of this.ghosts) {
      g.a -= 0.06;
      if (g.a <= 0) continue;
      ctx.globalAlpha = g.a * 0.5; ctx.fillStyle = this.color;
      ctx.fillRect(g.x - cam.x - 4, g.y - cam.y - 30, 8, 30);
    }
    this.ghosts = this.ghosts.filter((g) => g.a > 0);
    ctx.restore();
  }
}
// Doble o sombra que lucha a tu lado
class FXClone {
  constructor(p, pal, dur, opts = {}) {
    Object.assign(this, { p, pal, dur, t: 0, cd: 0, atk: 0, alpha: opts.alpha || 0.85, dmg: opts.dmg || 1, fx: opts.fx || null, tint: opts.tint || null });
    this.x = p.cx + (opts.dx || -p.facing * 20); this.y = p.feet; this.f = p.facing;
  }
  update(dt, world) {
    this.t += dt; this.cd -= dt; if (this.atk > 0) this.atk -= dt;
    let best = null, bd = 1e9;
    for (const e of world.enemies) { if (e.dead || !e.hittable() || !world.onScreen(e)) continue; const d = Math.abs(e.cx - this.x); if (d < bd) { bd = d; best = e; } }
    if (best) {
      this.f = sign(best.cx - this.x) || this.f;
      if (bd > 14) this.x += this.f * 150 * dt;
      this.y = approach(this.y, best.feet, 120 * dt);
      if (bd <= 18 && this.cd <= 0) { this.cd = 0.4; this.atk = 0.2; PW.hit(world, this.p, best, this.dmg, this.f * 140, -120, false); if (this.fx) world.particles.spark(best.cx, best.cy, this.fx, 3); }
    } else { this.x = approach(this.x, this.p.cx - this.p.facing * 18, 120 * dt); this.y = approach(this.y, this.p.feet, 120 * dt); this.f = this.p.facing; }
    return this.t < this.dur;
  }
  draw(ctx, cam, t) {
    const a = Math.min(1, this.t * 4, (this.dur - this.t) * 2) * this.alpha;
    ctx.save(); ctx.globalAlpha = a;
    const pose = this.atk > 0 ? Poses.punch3() : Poses.run(t * 12);
    Rig.draw(ctx, Math.round(this.x - cam.x), Math.round(this.y - cam.y), this.f, pose, this.pal, { scale: PLAYER_SC });
    if (this.tint) { ctx.globalAlpha = a * 0.3; ctx.fillStyle = this.tint; ctx.fillRect(this.x - cam.x - 8, this.y - cam.y - 30, 16, 30); }
    ctx.restore();
  }
}

// Láser o cañón horizontal a lo largo del carril
class FXBeam {
  constructor(p, dur, color, dmg, opts = {}) { Object.assign(this, { p, dur, color, dmg, t: 0, tick: 0, h: opts.h || 8, eye: !!opts.eye, charge: opts.charge || 0.35 }); this.dir = p.facing; }
  update(dt, world) {
    const p = this.p; this.t += dt; this.tick -= dt;
    p.vx = 0; p.facing = this.dir;
    if (this.t > this.charge && this.tick <= 0) {
      this.tick = 0.12; world.shake(2);
      const y = this.y();
      for (const e of world.enemies) {
        if (e.dead || !e.hittable()) continue;
        if (sign(e.cx - p.cx) === this.dir && Math.abs(e.cy - y) < e.h / 2 + this.h && Math.abs((e.z || 0) - p.z) < LANE + 6) PW.hit(world, p, e, this.dmg * 0.25, this.dir * 120, -40, false);
      }
    }
    return this.t < this.dur;
  }
  y() { return this.eye ? this.p.y + 4 : this.p.y + 10; }
  draw(ctx, cam, t) {
    const p = this.p, x0 = p.cx - cam.x + this.dir * 8, y = this.y() - cam.y - (p.z || 0);
    ctx.save();
    if (this.t < this.charge) {
      const r = 2 + this.t / this.charge * 5;
      ctx.fillStyle = this.color; ctx.globalAlpha = 0.8; ctx.beginPath(); ctx.arc(x0, y, r, 0, TAU); ctx.fill();
      for (let i = 0; i < 4; i++) { const a = rand(0, TAU); ctx.fillRect(x0 + Math.cos(a) * 12, y + Math.sin(a) * 12, 1, 1); }
    } else {
      const k = Math.min(1, (this.dur - this.t) * 4), h = this.h * k * (0.8 + 0.2 * Math.sin(t * 40));
      const x1 = this.dir > 0 ? VW + 10 : -10;
      ctx.fillStyle = this.color; ctx.globalAlpha = 0.5;
      ctx.fillRect(Math.min(x0, x1), y - h, Math.abs(x1 - x0), h * 2);
      ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.9;
      ctx.fillRect(Math.min(x0, x1), y - h * 0.35, Math.abs(x1 - x0), h * 0.7);
    }
    ctx.restore();
  }
}

// Mira que se cierra sobre el enemigo y luego dispara
class FXReticle {
  constructor(e, delay, color, fn) { Object.assign(this, { e, delay, color, fn, t: 0 }); }
  update(dt, world) { this.t += dt; if (this.t >= this.delay) { if (!this.e.dead) this.fn(this.e, world); return false; } return true; }
  draw(ctx, cam) {
    const u = this.t / this.delay, r = 16 - u * 10, x = this.e.cx - cam.x, y = this.e.cy - cam.y - (this.e.z || 0);
    ctx.strokeStyle = this.color; ctx.lineWidth = 1;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.beginPath(); ctx.moveTo(x + sx * r, y + sy * (r - 4)); ctx.lineTo(x + sx * r, y + sy * r); ctx.lineTo(x + sx * (r - 4), y + sy * r); ctx.stroke(); }
    if (u > 0.7) { ctx.fillStyle = this.color; ctx.fillRect(x - 1, y - 1, 2, 2); }
  }
}

// Patas mecánicas (Iron Spider): salen poco a poco y golpean alrededor
class FXLegs {
  constructor(p, dur, color, spin) { Object.assign(this, { p, dur, color, spin, t: 0, hitT: 0, flash: 0 }); }
  update(dt, world) {
    const p = this.p; this.t += dt; this.hitT -= dt; if (this.flash > 0) this.flash -= dt;
    if (p.state === 'dead') return false;
    if (this.hitT <= 0 && this.t > 0.3) {
      this.hitT = this.spin ? 0.18 : 0.4;
      for (const e of world.enemies) {
        if (e.dead || !e.hittable() || Math.abs((e.z || 0) - p.z) > LANE + 4) continue;
        if (Math.abs(e.cx - p.cx) < (this.spin ? 48 : 44) && Math.abs(e.cy - p.cy) < 32) { PW.hit(world, p, e, this.spin ? 0.5 : 0.8, sign(e.cx - p.cx || 1) * 150, -110, false); this.flash = 0.1; if (!this.spin) break; }
      }
    }
    return this.t < this.dur;
  }
  draw(ctx, cam, t) {
    const p = this.p, x = Math.round(p.cx - cam.x), y = Math.round(p.y + 8 - cam.y - (p.z || 0));
    const ext = Math.min(1, this.t / 0.3) * Math.min(1, (this.dur - this.t) * 3);
    ctx.save(); ctx.strokeStyle = this.color; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      let a;
      if (this.spin) a = t * 14 + i * TAU / 4;
      else { const s = i < 2 ? -1 : 1, k = i % 2; a = (s < 0 ? Math.PI : 0) + (k ? 0.5 : -0.4) * (s < 0 ? -1 : 1) + Math.sin(t * 6 + i) * 0.15 + (this.flash > 0 ? 0.3 : 0); }
      const L1 = 12 * ext, L2 = 12 * ext;
      const ex = x + Math.cos(a) * L1, ey = y + Math.sin(a) * L1 * 0.8 - 6 * ext;
      const tx = ex + Math.cos(a + 0.9) * L2, ty = ey + Math.sin(a + 0.9) * L2 * 0.8 + 6;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.fillStyle = '#fff4c0'; ctx.fillRect(ex - 0.5, ey - 0.5, 1, 1);
    }
    ctx.restore();
  }
}

// Enemigos congelados (foto en negativo / hielo)
class FXFreeze {
  constructor(list, dur, color) { Object.assign(this, { list, dur, color, t: 0 }); for (const e of list) e.frozenT = dur; }
  update(dt) { this.t += dt; return this.t < this.dur; }
  draw(ctx, cam, t) {
    ctx.save(); ctx.globalAlpha = 0.45;
    for (const e of this.list) {
      if (e.dead || !(e.frozenT > 0)) continue;
      const h = e.h * (e.scale || 1);
      ctx.fillStyle = this.color; ctx.fillRect(e.cx - cam.x - e.w / 2 - 3, e.feet - cam.y - h - 3 - (e.z || 0), e.w + 6, h + 4);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(e.cx - cam.x - e.w / 2 - 2, e.feet - cam.y - h - 2 - (e.z || 0), 2, h * 0.5);
    }
    ctx.restore();
  }
}

// Marcas de estado sobre los enemigos (confusión, vergüenza...)
class FXMarks {
  constructor(list, dur, text, color) { Object.assign(this, { list, dur, text, color, t: 0 }); }
  update(dt) { this.t += dt; return this.t < this.dur; }
  draw(ctx, cam, t) {
    for (const e of this.list) {
      if (e.dead) continue;
      const bob = Math.sin(t * 6 + e.id) * 2;
      Font.draw(ctx, this.text[Math.floor(t * 3 + e.id) % this.text.length], Math.round(e.cx - cam.x), Math.round(e.y - cam.y - 12 + bob - (e.z || 0)), this.color, { align: 'center', outline: '#000000', raw: true });
    }
  }
}

// Garras: tres cortes rojos sobre el enemigo
class FXClaw {
  constructor(e, color) { Object.assign(this, { e, color, t: 0 }); this.x = e.cx; this.y = e.cy; }
  update(dt) { this.t += dt; return this.t < 0.35; }
  draw(ctx, cam) {
    const u = Math.min(1, this.t / 0.1), a = 1 - Math.max(0, this.t - 0.15) / 0.2;
    ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = this.color; ctx.lineWidth = 1.5;
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(this.x - cam.x - 10 + i * 4, this.y - cam.y - 12); ctx.lineTo(this.x - cam.x - 10 + i * 4 + 20 * u, this.y - cam.y - 12 + 22 * u); ctx.stroke(); }
    ctx.restore();
  }
}

// Red gigante tendida entre dos edificios (atrapa a todos)
class FXNet {
  constructor(x, y, w, h, dur) { Object.assign(this, { x, y, w, h, dur, t: 0 }); }
  update(dt) { this.t += dt; return this.t < this.dur; }
  draw(ctx, cam) {
    const u = Math.min(1, this.t / 0.35), a = Math.min(1, (this.dur - this.t) * 2);
    const x = this.x - cam.x, y = this.y - cam.y;
    ctx.save(); ctx.globalAlpha = a * 0.85; ctx.strokeStyle = '#f4f4f8'; ctx.lineWidth = 0.8;
    const cx = x + this.w / 2;
    for (let i = 0; i <= 10; i++) { const k = i / 10; ctx.beginPath(); ctx.moveTo(cx, y); ctx.lineTo(cx + (x + this.w * k - cx) * u, y + this.h * u); ctx.stroke(); }
    for (let j = 1; j <= 5; j++) { const k = j / 5 * u; ctx.beginPath(); ctx.moveTo(cx - this.w / 2 * k, y + this.h * k); ctx.quadraticCurveTo(cx, y + this.h * k + 6, cx + this.w / 2 * k, y + this.h * k); ctx.stroke(); }
    ctx.restore();
  }
}

// ---------------- helpers de poderes compuestos ----------------
function webAll(p, world, color, style, dur, power, opts = {}) {
  const T = PW.targets(world, p, opts.r);
  T.forEach((e, i) => world.fx.push(new FXLine(p, e, color, opts.speed || 520, (en, w) => {
    PW.stun(w, en, dur, power);
    if (opts.dmg) PW.hit(w, p, en, opts.dmg, 0, -60, false);
    w.fx.push(new FXCocoon(en, Math.min(dur, 4), color));
  }, { style, width: opts.width || 1, x0: opts.x0, y0: opts.y0 })));
  return T;
}

// ---------------- los poderes (uno por traje) ----------------
// pose: animación del jugador al activarlo
const POWER_DEFS = {
  bnd: { name: 'Furia de batalla', desc: '10 s envuelto en llamas: el foco se llena solo y golpeas un 50% más fuerte.', pose: 'roar', run(p, w) {
    p.furyT = 10; w.fx.push(new FXAura(p, 'fire', 10, '#ff5020'));
    w.fx.push(new FXScreen('flash', 0.3, '#ff4020')); w.fx.push(new FXWave(p, p.cx, p.cy, 70, 0.3, '#ff6030', (e, ww) => PW.hit(ww, p, e, 0.6, sign(e.cx - p.cx || 1) * 200, -120)));
    PW.pop(w, '¡GRRAAH!', p.cx, p.y - 20, '#ff6030');
  } },
  nwh: { name: 'Explosión de red', desc: 'Lanza telarañas a todos los enemigos de la pantalla y los envuelve en capullos.', pose: 'thwip', run(p, w) {
    webAll(p, w, '#ffffff', 'web', 4, 4);
  } },
  casero: { name: 'Spider-Bro', desc: 'Tu amigo manda un dron que sale volando de la mochila y lucha contigo 15 s.', pose: 'point', run(p, w) {
    w.fx.push(new GDrone(p, 15, true)); w.particles.burst(p.cx, p.y + 6, 14, '#c0c8d0', 80); PW.pop(w, '¡TE CUBRO!', p.cx, p.y - 20, '#80e0ff');
  } },
  sigilo: { name: 'Bomba de humo', desc: 'Una nube de humo: 8 s invisible, no te pueden dañar y tus golpes hacen el doble.', pose: 'crouch', run(p, w) {
    p.cloakT = 8; w.fx.push(new FXAura(p, 'smoke', 8));
    for (let i = 0; i < 40; i++) w.particles.add(p.cx + rand(-20, 20), p.feet - rand(0, 30), rand(-60, 60), rand(-50, 10), rand(0.6, 1.2), pick(['#50545c', '#3a3e46', '#6a6e76']), 4, -20);
  } },
  stark: { name: 'Muerte instantánea', desc: 'Karen apunta a cada enemigo y el traje dispara a la vez: mucho daño.', pose: 'point', run(p, w) {
    w.fx.push(new FXScreen('tint', 1.2, '#ff2020'));
    PW.targets(w, p).forEach((e, i) => w.fx.push(new FXReticle(e, 0.6 + i * 0.08, '#ff3030', (en, ww) => {
      ww.fx.push(new FXLine(p, en, '#ffffff', 1400, (x, w2) => { PW.hit(w2, p, x, 3, sign(x.cx - p.cx || 1) * 220, -200); w2.particles.burst(x.cx, x.cy, 10, '#ff4040', 100); }));
      Audio2.sfx('thwip');
    })));
  } },
  ffh: { name: 'Drones E.D.I.T.H.', desc: 'Drones en el cielo disparan láseres a los enemigos durante unos segundos.', pose: 'point', run(p, w) {
    for (let k = 0; k < 3; k++) PW.later(w, 0.2 + k * 0.5, (ww) => {
      for (const e of PW.targets(ww, p)) ww.fx.push(new FXLine(p, e, '#60c0ff', 2000, (en, w2) => PW.hit(w2, p, en, 0.9, 0, -80, false), { style: 'laser', width: 1, x0: e.cx + rand(-60, 60), y0: ww.cam.y + 4, life: 0.15 }));
      Audio2.sfx('zap');
    });
    w.fx.push(new FXScreen('flash', 0.2, '#60c0ff'));
  } },
  iron: { name: 'Brazos de hierro', desc: '12 s: cuatro patas mecánicas salen de la espalda y golpean a los enemigos cercanos.', pose: 'roar', run(p, w) {
    p.armsT = 12; w.fx.push(new FXLegs(p, 12, '#e0b030', false)); w.particles.burst(p.cx, p.y + 8, 12, '#e0b030', 80);
  } },
  raimi: { name: 'Red del tren', desc: 'Tiende una red gigante de lado a lado que atrapa a todos los enemigos.', pose: 'thwip', run(p, w) {
    const x = w.cam.x + 10, y = w.cam.y + 10;
    w.fx.push(new FXNet(x, y, VW - 20, VH - 40, 4));
    for (const e of PW.targets(w, p)) { PW.stun(w, e, 5, 3); w.fx.push(new FXCocoon(e, 4, '#f4f4f8')); }
    Audio2.sfx('thwip');
  } },
  tasm: { name: 'Cadena eléctrica', desc: 'Sobrecarga los lanzarredes: un rayo salta de enemigo en enemigo.', pose: 'thwip', run(p, w) {
    const T = PW.targets(w, p).sort((a, b) => dist(p.cx, p.cy, a.cx, a.cy) - dist(p.cx, p.cy, b.cx, b.cy));
    let src = { cx: p.cx, cy: p.y + 8 };
    T.forEach((e, i) => { const from = src; PW.later(w, i * 0.12, (ww) => { ww.fx.push(new FXLine(p, e, '#80e0ff', 3000, (en, w2) => { PW.hit(w2, p, en, 1.6, 0, -100); PW.stun(w2, en, 2, 2); w2.particles.spark(en.cx, en.cy, '#ffffff', 6); }, { style: 'zap', width: 1.5, x0: from.cx, y0: from.cy, life: 0.3 })); Audio2.sfx('zap'); }); src = e; });
  } },
  verse: { name: 'Golpe venenoso', desc: 'Una descarga bioeléctrica roja y amarilla aturde a todos los que están cerca.', pose: 'roar', run(p, w) {
    w.fx.push(new FXScreen('comic', 0.8, '#ffe040'));
    w.fx.push(new FXWave(p, p.cx, p.cy, 110, 0.35, '#ffe040', (e, ww) => { PW.hit(ww, p, e, 1.8, sign(e.cx - p.cx || 1) * 200, -160); PW.stun(ww, e, 3, 2); ww.particles.spark(e.cx, e.cy, '#ff3030', 6); }, { rings: 3, width: 3 }));
    for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; w.particles.add(p.cx, p.cy, Math.cos(a) * 200, Math.sin(a) * 200, 0.3, i % 2 ? '#ff2030' : '#ffe040', 2, 0); }
    PW.pop(w, '¡ZZAK!', p.cx, p.y - 20, '#ffe040');
  } },
  avanzado: { name: 'Flor de red', desc: 'Gira en el aire disparando telarañas en todas direcciones.', pose: 'spin', run(p, w) {
    if (p.onGround) p.vy = -260;
    for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; PW.later(w, i * 0.03, (ww) => ww.fx.push(new FXShot(p, p.cx, p.cy, Math.cos(a) * 320, Math.sin(a) * 320, 'web', '#ffffff', 0.6, { life: 0.6, r: 10 }))); }
    PW.later(w, 0.2, (ww) => { for (const e of PW.targets(ww, p, 150)) { PW.stun(ww, e, 3, 2); ww.fx.push(new FXCocoon(e, 3, '#ffffff')); } });
  } },
  sociedad: { name: 'Distorsión temporal', desc: '6 s: el mundo va a cámara lenta y tú no. Aparece el reloj de 2099.', pose: 'cast', run(p, w) {
    w.slowEnemiesT = 6; w.fx.push(new FXScreen('clock', 6)); w.fx.push(new FXWave(p, p.cx, p.cy, 200, 0.5, '#a0c8ff', () => {}, { rings: 2 }));
  } },
  tierra0: { name: 'Segundo aliento', desc: 'Recuperas vida poco a poco durante 8 s, rodeado de luz dorada.', pose: 'cast', run(p, w) {
    w.fx.push(new FXAura(p, 'gold', 8, '#ffd040'));
    w.fx.push(new FXHeal(p, 8, 0.5)); w.fx.push(new FXScreen('flash', 0.25, '#fff4c0'));
  } },
  cero: { name: 'Onda negativa', desc: 'La pantalla se invierte y una onda empuja, daña y atrapa a los enemigos.', pose: 'roar', run(p, w) {
    w.fx.push(new FXScreen('invert', 0.5));
    w.fx.push(new FXWave(p, p.cx, p.cy, 130, 0.45, '#ffffff', (e, ww) => { PW.hit(ww, p, e, 1.8, sign(e.cx - p.cx || 1) * 300, -200); PW.stun(ww, e, 2, 2); }, { rings: 2 }));
    w.fx.push(new FXWave(p, p.cx, p.cy, 100, 0.5, '#101010', () => {}));
  } },
  negro: { name: 'Tentáculos simbionte', desc: 'Tentáculos negros brotan del suelo bajo cada enemigo y los lanzan por los aires.', pose: 'roar', run(p, w) {
    PW.targets(w, p).forEach((e, i) => w.fx.push(new FXSpike(p, e, 0.3 + i * 0.08, '#141418', 2.2, 36)));
    w.fx.push(new FXScreen('dark', 1.2, '#000000')); PW.pop(w, '¡NOSOTROS!', p.cx, p.y - 20, '#f4f4f4');
  } },
  escarlata: { name: 'Aguijones', desc: 'Dispara un abanico de aguijones de las muñecas que atraviesa a los enemigos.', pose: 'thwip', run(p, w) {
    for (let i = -3; i <= 3; i++) PW.later(w, (i + 3) * 0.03, (ww) => ww.fx.push(new FXShot(p, p.cx + p.facing * 6, p.y + 8, p.facing * 420 * Math.cos(i * 0.12), 420 * Math.sin(i * 0.12), 'sting', '#ff4050', 1.2, { life: 0.8 })));
  } },
  noir: { name: 'Emboscada en blanco y negro', desc: 'Todo se vuelve en blanco y negro y golpeas a cada enemigo desde las sombras.', pose: 'crouch', run(p, w) {
    w.fx.push(new FXScreen('gray', 2.2));
    PW.targets(w, p).forEach((e, i) => PW.later(w, 0.3 + i * 0.25, (ww) => {
      if (e.dead) return;
      p.x = e.cx - e.facing * 12 - p.w / 2; p.facing = sign(e.cx - p.cx) || 1;
      ww.fx.push(new FXScreen('flash', 0.08, '#ffffff'));
      PW.hit(ww, p, e, 2.2, p.facing * 180, -180); Audio2.sfx('heavy');
    }));
  } },
  punk: { name: 'Acorde de poder', desc: 'Toca un acorde brutal: ondas de sonido y notas que tumban a todos.', pose: 'roar', run(p, w) {
    for (let k = 0; k < 3; k++) PW.later(w, k * 0.25, (ww) => {
      ww.fx.push(new FXWave(p, p.cx, p.cy, 140, 0.4, pick(['#ff3040', '#40a0ff', '#ffffff']), (e, w2) => PW.hit(w2, p, e, 0.9, sign(e.cx - p.cx || 1) * 260, -150), { rings: 2, width: 2 }));
      for (let i = 0; i < 6; i++) ww.fx.push(new FXShot(p, p.cx, p.cy - 6, rand(-200, 200), rand(-160, -40), 'note', pick(['#ff3040', '#40a0ff', '#ffffff']), 0.3, { life: 0.8 }));
      Audio2.sfx('heavy'); ww.shake(4);
    });
    PW.pop(w, '¡WRAAANG!', p.cx, p.y - 22, '#ff3040');
  } },
  clasico2099: { name: 'Garras de 2099', desc: 'Cruzas la pantalla con la capa y dejas cortes de garra en cada enemigo.', pose: 'spin', run(p, w) {
    w.fx.push(new FXDash(p, 2, '#d01a2a', 1.4));
    for (const e of PW.targets(w, p)) PW.later(w, rand(0.05, 0.4), (ww) => ww.fx.push(new FXClaw(e, '#ff3040')));
  } },
  uk: { name: 'Escudo del león', desc: '7 s protegido por un escudo con la cruz británica que destruye los proyectiles.', pose: 'cast', run(p, w) {
    p.shieldT = 7; p.inv = Math.max(p.inv, 7); w.fx.push(new FXAura(p, 'lion', 7, '#1a3a9a')); w.fx.push(new FXProjEater(p, 7));
  } },
  superior: { name: 'Arañabots', desc: 'Suelta un enjambre de arañas robot que corren hacia los enemigos y explotan.', pose: 'crouch', run(p, w) {
    const T = PW.targets(w, p);
    for (let i = 0; i < 10; i++) { const e = T.length ? T[i % T.length] : null; PW.later(w, i * 0.06, (ww) => ww.fx.push(new FXShot(p, p.cx, p.feet - 2, p.facing * rand(120, 200), rand(-40, 0), 'bot', '#ff3030', 1, { target: e, life: 2.5 }))); }
  } },
  velocity: { name: 'Velocidad terminal', desc: 'Cruzas la pantalla tres veces a toda velocidad golpeando a todos.', pose: 'spin', run(p, w) {
    w.fx.push(new FXDash(p, 3, '#40e0ff', 1.3)); w.fx.push(new FXScreen('tint', 0.9, '#40e0ff'));
  } },
  fundacion: { name: 'Fase molecular', desc: '6 s intangible: los ataques te atraviesan y tus golpes empujan más.', pose: 'cast', run(p, w) {
    p.shieldT = 6; w.fx.push(new FXAura(p, 'phase', 6, '#80c0ff'));
    for (let i = 0; i < 20; i++) w.particles.add(p.cx + rand(-10, 10), p.feet - rand(0, 30), rand(-30, 30), rand(-30, 30), 0.5, '#80c0ff', 1, 0);
  } },
  antiock: { name: 'Pulso EMP', desc: 'Un pulso electromagnético azul deja a todos los enemigos paralizados.', pose: 'roar', run(p, w) {
    w.fx.push(new FXScreen('flash', 0.3, '#2060e0'));
    w.fx.push(new FXWave(p, p.cx, p.cy, 220, 0.6, '#60c0ff', (e, ww) => { PW.stun(ww, e, 4, 3); PW.hit(ww, p, e, 0.8, 0, -60, false); for (let i = 0; i < 4; i++) ww.particles.spark(e.cx, e.cy, '#80c0ff', 2); }, { rings: 3, width: 4 }));
  } },
  bigtime: { name: 'Sigilo verde', desc: '8 s invisible con brillo verde: los enemigos te pierden y se quedan confusos.', pose: 'crouch', run(p, w) {
    p.cloakT = 8; w.fx.push(new FXAura(p, 'spark', 8, '#40ff90'));
    const T = PW.targets(w, p); for (const e of T) PW.stun(w, e, 3, 1); w.fx.push(new FXMarks(T, 3, ['?', '??', '?!'], '#40ff90'));
  } },
  armadura1: { name: 'Placas blindadas', desc: '10 s: placas de metal se atornillan al traje y recibes la mitad de daño.', pose: 'roar', run(p, w) {
    p.armorT = 10; w.fx.push(new FXAura(p, 'armor', 10)); Audio2.sfx('heavy');
  } },
  armadura2: { name: 'Blindaje reactivo', desc: 'Una explosión plateada al activarlo y, durante 10 s, cada golpe que recibes explota.', pose: 'roar', run(p, w) {
    p.reactT = 10; w.fx.push(new FXAura(p, 'armor', 10));
    w.fx.push(new FXWave(p, p.cx, p.cy, 90, 0.3, '#d0d4dc', (e, ww) => PW.hit(ww, p, e, 1.5, sign(e.cx - p.cx || 1) * 240, -180), { rings: 2 }));
  } },
  armadura4: { name: 'Láser de lentes', desc: 'Las lentes cargan y disparan un láser rojo a lo largo de la calle.', pose: 'point', run(p, w) {
    w.fx.push(new FXBeam(p, 1.4, '#ff3030', 1.6, { h: 4, eye: true, charge: 0.4 })); Audio2.sfx('zap');
  } },
  electro2: { name: 'Tormenta eléctrica', desc: 'Rayos caen del cielo sobre cada enemigo, con truenos y destellos.', pose: 'cast', run(p, w) {
    w.fx.push(new FXScreen('tint', 1.6, '#202060'));
    PW.targets(w, p).forEach((e, i) => w.fx.push(new FXBolt(e.cx, e.feet, '#80e0ff', 0.35 + i * 0.15, (ww) => { PW.hit(ww, p, e, 2.2, 0, -200); PW.stun(ww, e, 2, 2); })));
  } },
  reilly: { name: 'Clon de Ben', desc: 'Aparece un clon con sudadera azul que lucha a tu lado durante 12 s.', pose: 'point', run(p, w) {
    const s = SUITS.find((x) => x.id === 'reilly'); w.fx.push(new FXClone(p, s.palObj, 12, { dmg: 1 }));
    w.particles.burst(p.cx - p.facing * 20, p.cy, 16, '#2a4ad8', 80);
  } },
  guerras: { name: 'Tela alienígena', desc: 'Lanzas redes de simbionte a todos, los arrastras al centro y chocan entre sí.', pose: 'thwip', run(p, w) {
    const T = webAll(p, w, '#f0f0f4', 'goo', 1.5, 2, { width: 1.5 });
    const cx = p.cx + p.facing * 60;
    PW.later(w, 0.4, (ww) => ww.fx.push(new FXVortex(p, cx, p.cy, 130, 1.2, ['#f0f0f4', '#16161c'], 2.4, 'goo')));
  } },
  bastion: { name: 'Último bastión', desc: 'Recuperas vida y durante 10 s nada te derriba; brasas a tu alrededor.', pose: 'roar', run(p, w) {
    p.unstopT = 10; p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * 0.3));
    w.fx.push(new FXAura(p, 'embers', 10)); w.fx.push(new FXAura(p, 'unstop', 10)); w.float('+' + Math.round(p.maxHp * 0.3), p.cx, p.y - 10, '#80ff80');
  } },
  negativo: { name: 'Foto congelada', desc: 'Un flash de cámara en negativo congela a todos los enemigos 4 s.', pose: 'point', run(p, w) {
    w.fx.push(new FXScreen('flash', 0.2, '#ffffff')); w.fx.push(new FXScreen('invert', 0.3));
    const T = PW.targets(w, p).filter((e) => !e.isBoss); w.fx.push(new FXFreeze(T, 4, '#d0d0d0'));
    for (const e of PW.targets(w, p)) if (e.isBoss) PW.stun(w, e, 2, 3);
    Audio2.sfx('select');
  } },
  luchador: { name: 'Terremoto', desc: 'Saltas y caes con todo tu peso: la tierra se agrieta, la pantalla tiembla y los enemigos salen volando.', pose: 'slam', run(p, w) {
    if (p.onGround) { p.vy = -330; p.onGround = false; }
    w.fx.push(new FXSlam(p, (ww) => {
      ww.fx.push(new FXQuake(p, p.cx, p.feet, 1.6, 170, 0.8));
      ww.fx.push(new FXWave(p, p.cx, p.feet, 170, 0.4, '#a07840', () => {}, { flat: true, rings: 3, width: 3 }));
      ww.fx.push(new FXScreen('flash', 0.15, '#e0c080'));
      PW.pop(ww, '¡BRRUUUM!', p.cx, p.y - 26, '#e0a040');
    }));
  } },
  calzones: { name: '¡Qué vergüenza!', desc: 'Los enemigos se quedan mirándote paralizados de vergüenza 4 s.', pose: 'flex', run(p, w) {
    const T = PW.targets(w, p); for (const e of T) PW.stun(w, e, 4, 2);
    w.fx.push(new FXMarks(T, 4, ['!', '!!', '...'], '#ff80c0')); w.fx.push(new FXScreen('tint', 0.6, '#ff80c0'));
    PW.pop(w, '¡TA-DÁ!', p.cx, p.y - 22, '#ff80c0');
  } },
  bolsa: { name: '¡Bombástico!', desc: 'Una explosión de confeti y fuegos artificiales que daña a todos los cercanos.', pose: 'flex', run(p, w) {
    for (let k = 0; k < 5; k++) PW.later(w, k * 0.15, (ww) => { const x = p.cx + rand(-80, 80), y = p.cy - rand(10, 60); ww.particles.burst(x, y, 20, pick(['#ff4040', '#40c0ff', '#ffe040', '#60ff80', '#ff60e0']), 120); Audio2.sfx('explode'); for (const e of PW.targets(ww, p)) if (dist(x, y, e.cx, e.cy) < 60) PW.hit(ww, p, e, 1, sign(e.cx - x || 1) * 180, -160); });
    PW.pop(w, '¡BOMBÁSTICO!', p.cx, p.y - 24, '#ffe040');
  } },
  milesclasico: { name: 'Camuflaje', desc: 'Te vuelves invisible con un parpadeo eléctrico: 8 s sin recibir daño y golpes dobles.', pose: 'crouch', run(p, w) {
    p.cloakT = 8; w.fx.push(new FXAura(p, 'glitch', 8)); w.fx.push(new FXScreen('glitch', 0.4));
  } },
  ghost: { name: 'Ritmo de batería', desc: 'Cuatro golpes de batería al ritmo: cada uno lanza una onda rosa y turquesa.', pose: 'cast', run(p, w) {
    for (let k = 0; k < 4; k++) PW.later(w, k * 0.3, (ww) => { ww.fx.push(new FXWave(p, p.cx, p.feet, 120, 0.3, k % 2 ? '#40c0d0' : '#e04a9a', (e, w2) => PW.hit(w2, p, e, 0.8, sign(e.cx - p.cx || 1) * 160, -140), { flat: true, rings: 2 })); ww.shake(3); Audio2.sfx('heavy'); PW.pop(ww, ['¡PUM!', '¡TSS!', '¡PUM!', '¡CRASH!'][k], p.cx + rand(-20, 20), p.y - 20, k % 2 ? '#40c0d0' : '#e04a9a'); });
  } },
  mayday: { name: 'Sentido perfecto', desc: '10 s: el sentido arácnido esquiva por ti cualquier golpe.', pose: 'cast', run(p, w) {
    p.senseT = 10; w.fx.push(new FXAura(p, 'sense', 10, '#ffe040'));
  } },
  seda: { name: 'Capullos de seda', desc: 'Hilos de seda envuelven a los enemigos cercanos durante mucho tiempo.', pose: 'thwip', run(p, w) {
    webAll(p, w, '#f0f0f4', 'goo', 7, 4, { r: 170, speed: 300 });
    for (let i = 0; i < 20; i++) w.particles.add(p.cx, p.cy, rand(-150, 150), rand(-100, 50), 0.6, '#f0f0f4', 1, 0);
  } },
  '1602': { name: 'Torbellino de capa', desc: 'Giras con la capa y levantas un tornado que arrastra a los enemigos.', pose: 'spin', run(p, w) {
    w.fx.push(new FXVortex(p, p.cx + p.facing * 50, p.feet - 20, 110, 2, ['#b01820', '#e0d0b0', '#5a3a20'], 2.4, 'tornado'));
  } },
  cyborg: { name: 'Cañón de brazo', desc: 'El brazo se convierte en cañón y dispara un rayo enorme a lo largo del carril.', pose: 'point', run(p, w) {
    w.fx.push(new FXBeam(p, 1.6, '#40e0ff', 2.4, { h: 9, charge: 0.6 })); Audio2.sfx('zap');
  } },
  vintage: { name: '¡KA-POW!', desc: 'La escena se convierte en viñeta de cómic y cada enemigo recibe un golpe con onomatopeya.', pose: 'roar', run(p, w) {
    w.fx.push(new FXScreen('comic', 1.4, '#ffe040'));
    PW.targets(w, p).forEach((e, i) => PW.later(w, 0.2 + i * 0.12, (ww) => { PW.hit(ww, p, e, 2, sign(e.cx - p.cx || 1) * 220, -220); PW.pop(ww, pick(['¡KA-POW!', '¡BLAM!', '¡WHAM!', '¡SOCK!']), e.cx, e.y - 10, pick(['#ffe040', '#ff4040', '#40c0ff'])); }));
  } },
  dorado: { name: 'Lluvia de oro', desc: 'Llueven monedas de oro del cielo sobre los enemigos. Cada una deja algo de tecnología.', pose: 'cast', run(p, w) {
    for (let i = 0; i < 18; i++) PW.later(w, i * 0.07, (ww) => { const s = new FXShot(p, ww.cam.x + rand(20, VW - 20), ww.cam.y - 10, rand(-20, 20), 120, 'coin', '#ffe040', 1.2, { grav: 400, life: 2 }); s.floor = p.feet + 10; ww.fx.push(s); });
    Game.save.tech = (Game.save.tech || 0) + 3; w.float('+3 TEC', p.cx, p.y - 30, '#ffe040');
  } },
  sombra: { name: 'Clones de sombra', desc: 'Tres sombras moradas salen de ti y atacan durante 8 s.', pose: 'roar', run(p, w) {
    const s = SUITS.find((x) => x.id === 'sombra');
    for (let i = 0; i < 3; i++) w.fx.push(new FXClone(p, s.palObj, 8, { alpha: 0.55, dmg: 0.6, dx: (i - 1) * 24, tint: '#5a2a90', fx: '#c080ff' }));
    w.fx.push(new FXScreen('tint', 0.6, '#5a2a90'));
  } },
  integrado: { name: 'Misiles araña', desc: 'Salen minimisiles teledirigidos de los hombros, con estela de humo.', pose: 'roar', run(p, w) {
    const T = PW.targets(w, p);
    for (let i = 0; i < 8; i++) { const e = T.length ? T[i % T.length] : null; PW.later(w, i * 0.08, (ww) => ww.fx.push(new FXShot(p, p.cx, p.y + 2, rand(-120, 120), -220, 'missile', '#ff5030', 1.3, { target: e, life: 2.5 }))); }
  } },
  oscuro: { name: 'Noche eterna', desc: 'Todo se oscurece 6 s: los enemigos no ven y tus golpes hacen el doble.', pose: 'crouch', run(p, w) {
    p.cloakT = 6; w.fx.push(new FXScreen('dark', 6, '#000000')); w.fx.push(new FXAura(p, 'dark', 6));
    const T = PW.targets(w, p); for (const e of T) PW.stun(w, e, 2.5, 1); w.fx.push(new FXMarks(T, 2.5, ['?'], '#ff5050'));
  } },
  arana_hierro_2: { name: 'Taladro de patas', desc: 'Las patas mecánicas giran a tu alrededor como un taladro durante 4 s.', pose: 'spin', run(p, w) {
    w.fx.push(new FXLegs(p, 4, '#e0b030', true)); Audio2.sfx('whoosh');
  } },
  multiverso: { name: 'Grieta multiversal', desc: 'Abres un portal entre universos que se traga a los enemigos y los escupe.', pose: 'cast', run(p, w) {
    w.fx.push(new FXScreen('glitch', 1.8)); w.fx.push(new FXVortex(p, p.cx + p.facing * 70, p.cy, 150, 1.8, ['#ff40c0', '#40ffe0', '#ffe040'], 3, 'portal'));
  } },
};

// Curación progresiva
class FXHeal {
  constructor(p, dur, frac) { Object.assign(this, { p, dur, frac, t: 0, acc: 0 }); }
  update(dt, world) {
    this.t += dt; this.acc += this.p.maxHp * this.frac / this.dur * dt;
    if (this.acc >= 1) { const n = Math.floor(this.acc); this.acc -= n; this.p.hp = Math.min(this.p.maxHp, this.p.hp + n); }
    return this.t < this.dur && this.p.state !== 'dead';
  }
  draw() {}
}
// Destruye proyectiles enemigos que tocan el escudo
class FXProjEater {
  constructor(p, dur) { Object.assign(this, { p, dur, t: 0 }); }
  update(dt, world) {
    this.t += dt;
    for (const pr of world.projs) if (!pr.dead && pr.owner !== 'p' && dist(pr.x, pr.y, this.p.cx, this.p.cy) < 26) { pr.dead = true; world.particles.burst(pr.x, pr.y, 6, '#ffffff', 60); }
    return this.t < this.dur;
  }
  draw() {}
}
// Salto y caída: el efecto ocurre al tocar el suelo
class FXSlam {
  constructor(p, fn) { Object.assign(this, { p, fn, t: 0 }); }
  update(dt, world) {
    this.t += dt; const p = this.p;
    if (this.t > 0.15 && p.vy >= 0) p.vy = Math.max(p.vy, 500);
    if ((this.t > 0.2 && p.onGround) || this.t > 1.4) { p.landT = 0.25; this.fn(world); return false; }
    return true;
  }
  draw(ctx, cam) {
    const p = this.p; if (this.t < 0.2 || this.p.onGround) return;
    ctx.fillStyle = 'rgba(255,220,160,0.5)';
    for (let i = 0; i < 3; i++) ctx.fillRect(p.cx - cam.x - 6 + i * 5, p.y - cam.y - 10 - i * 3, 1, 8);
  }
}

// ---- nombres y descripciones para los menús ----
const SUIT_POWERS = {};
for (const id in POWER_DEFS) SUIT_POWERS[id] = { name: POWER_DEFS[id].name, desc: POWER_DEFS[id].desc };
for (const s of SUITS) if (!SUIT_POWERS[s.power]) s.power = SUITS[0].id;

const SuitPowers = {
  // poder activo: el equipado en PODERES, o si no el del traje que llevas
  current(p) {
    if (p.idx > 0) { const s = SUITS.find((x) => x.id === p.suitId); return (s && s.power) || 'bnd'; }
    if (Game.save.power && SUIT_POWERS[Game.save.power] && this.unlocked(Game.save.power)) return Game.save.power;
    const s = SUITS.find((x) => x.id === (p.suitId || Game.save.suit));
    return (s && s.power) || 'bnd';
  },
  unlocked(id) { const s = SUITS.find((x) => x.power === id); return !s || Progress.suitOwned(s); },
  use(p, world) {
    if (p.powerCd > 0) { world.float('PODER EN ' + Math.ceil(p.powerCd) + ' s', p.cx, p.y - 12, '#c0c0d0'); Audio2.sfx('back'); return; }
    const id = this.current(p), D = POWER_DEFS[id];
    p.powerCd = POWER_CD * (Progress.has('i_poder') ? 0.6 : 1);
    Progress.rec('powers', 1);
    world.float(D.name.toUpperCase() + '!', p.cx, p.y - 20, '#ffd040');
    Audio2.sfx('special'); world.shake(3); Input.rumble(0.7, 0.7, 250);
    world.particles.burst(p.cx, p.cy, 16, '#ffd040', 100);
    PW.pose(p, D.pose || 'roar', D.pose === 'slam' ? 0.9 : 0.6);
    D.run(p, world);
  },
};
