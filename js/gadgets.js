'use strict';
// ---------------------------------------------------------------------------
// Artilugios y poderes de traje en acción. Cada efecto es un objeto con
// update(dt, world) -> bool (sigue vivo) y draw(ctx, cam, t).
// ---------------------------------------------------------------------------
const Gadgets = {
  // cargas y recarga por jugador
  tick(p, dt) {
    if (!p.gch) { p.gch = {}; p.gcd = {}; }
    for (const g of GADGETS) {
      if (!Progress.gadgetUnlocked(g)) continue;
      const max = Progress.gadgetMax(g);
      if (p.gch[g.id] === undefined) p.gch[g.id] = max;
      if (p.gch[g.id] < max) {
        p.gcd[g.id] = (p.gcd[g.id] || 0) + dt;
        if (p.gcd[g.id] >= Progress.gadgetCd(g)) { p.gcd[g.id] = 0; p.gch[g.id]++; }
      } else p.gcd[g.id] = 0;
      if (p.gch[g.id] > max) p.gch[g.id] = max;
    }
    if (p.powerCd > 0) p.powerCd -= dt;
    for (const k of ['furyT', 'cloakT', 'armsT', 'shieldT', 'shockT', 'counterT']) if (p[k] > 0) p[k] = Math.max(0, p[k] - dt);
    if (p.furyT > 0) p.focus = Math.min(100, p.focus + 20 * dt);
  },
  selected(p) { return p.idx > 0 ? (p.gadgetSel || 'impacto') : Game.save.gadget; },
  cycle(p, world) {
    const owned = GADGETS.filter((g) => Progress.gadgetUnlocked(g));
    if (!owned.length) return;
    const cur = this.selected(p);
    const i = owned.findIndex((g) => g.id === cur);
    const n = owned[(i + 1) % owned.length];
    if (p.idx > 0) p.gadgetSel = n.id; else { Game.save.gadget = n.id; }
    world.float(n.name.toUpperCase(), p.cx, p.y - 14, n.color);
    Audio2.sfx('menu');
  },
  use(p, world) {
    const g = GADGETS.find((x) => x.id === this.selected(p));
    if (!g || !Progress.gadgetUnlocked(g)) return;
    if (!p.gch || !(p.gch[g.id] > 0)) { world.float('SIN CARGAS', p.cx, p.y - 10, '#a0a0a0'); Audio2.sfx('back'); return; }
    p.gch[g.id]--;
    const lv = Progress.gadgetLevel(g), f = p.facing, x = p.cx + f * 8, y = p.y + 8;
    p.shootPose = 0.25;
    Audio2.sfx('thwip');
    switch (g.id) {
      case 'impacto': world.fx.push(new GShot('impacto', p, x, y, f * 380, 0, lv)); break;
      case 'electrica': world.fx.push(new GShot('electrica', p, x, y, f * 360, 0, lv)); break;
      case 'rebote': world.fx.push(new GShot('rebote', p, x, y, f * 340, 0, lv)); break;
      case 'bomba': world.fx.push(new GBomb(p, x, y, f * 190, -230, lv)); break;
      case 'mina': world.fx.push(new GMine(p, p.cx, p.feet, lv)); break;
      case 'dron': world.fx.push(new GDrone(p, 9 + lv * 3)); break;
      case 'onda': {
        Audio2.sfx('special'); world.shake(3);
        world.fx.push(new GRing(p.cx + f * 20, p.cy, 70, '#c0ffc0', 0.35));
        for (const e of world.enemies) {
          if (e.dead || !e.hittable() || Math.abs((e.z || 0) - p.z) > LANE + 6) continue;
          const dx = e.cx - p.cx;
          if (dx * f > -8 && Math.abs(dx) < 90 + lv * 15 && Math.abs(e.cy - p.cy) < 40) { world.playerHits(e, 1 + lv * 0.3, f * 420, -220, true); Progress.rec('gadgetHits', 1); }
        }
        break;
      }
      case 'matriz': {
        Audio2.sfx('glitch');
        world.fx.push(new GRing(p.cx, p.cy, 90 + lv * 10, '#c080ff', 0.5));
        for (const e of world.enemies) {
          if (e.dead || !e.hittable() || dist(e.cx, e.cy, p.cx, p.cy) > 90 + lv * 10) continue;
          if (e.isBoss) { e.web(1, world); continue; }
          e.suspendT = 3 + lv; e.suspY = e.y; Progress.rec('gadgetHits', 1);
        }
        break;
      }
    }
  },
};

// Proyectil de artilugio (impacto, eléctrica, rebote)
class GShot {
  constructor(kind, p, x, y, vx, vy, lv) { this.kind = kind; this.p = p; this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.lv = lv; this.z = p.z; this.t = 0; this.hits = new Set(); this.bounces = kind === 'rebote' ? 3 + lv : 0; }
  update(dt, world) {
    this.t += dt;
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (this.t > 1.2 || world.level.pointSolid(this.x, this.y, false, false)) return false;
    for (const e of world.enemies) {
      if (e.dead || this.hits.has(e) || !e.hittable() || Math.abs((e.z || 0) - this.z) > LANE + 6) continue;
      if (!overlap({ x: this.x - 4, y: this.y - 4, w: 8, h: 8 }, e.hurtbox())) continue;
      this.hits.add(e);
      Progress.rec('gadgetHits', 1);
      const f = sign(this.vx) || 1;
      if (this.kind === 'impacto') { world.playerHits(e, 1 + this.lv * 0.4, f * 320, -120, true); if (!e.dead) e.web(3 + this.lv, world); return false; }
      if (this.kind === 'electrica') {
        world.playerHits(e, 1.5 + this.lv * 0.5, f * 80, -60, false);
        if (!e.dead) e.web(2.5 + this.lv * 0.5, world);
        for (let i = 0; i < 10; i++) world.particles.spark(e.cx + rand(-8, 8), e.cy + rand(-10, 10), '#80e0ff', 1);
        Audio2.sfx('zap'); return false;
      }
      // rebote: salta al siguiente enemigo
      world.playerHits(e, 1 + this.lv * 0.3, f * 90, -60, false);
      if (!e.dead) e.web(2, world);
      if (--this.bounces <= 0) return false;
      let best = null, bd = 150;
      for (const o of world.enemies) { if (o.dead || this.hits.has(o) || !o.hittable()) continue; const d = dist(o.cx, o.cy, this.x, this.y); if (d < bd) { bd = d; best = o; } }
      if (!best) return false;
      const d = Math.max(1, bd); this.vx = (best.cx - this.x) / d * 360; this.vy = (best.cy - this.y) / d * 360; this.z = best.z || 0; this.t = 0;
    }
    return true;
  }
  draw(ctx, cam, t) {
    const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y - this.z);
    const c = { impacto: '#ffffff', electrica: Math.floor(t * 30) % 2 ? '#ffffff' : '#60e0ff', rebote: '#ffa0e0' }[this.kind];
    ctx.fillStyle = c; ctx.fillRect(x - 3, y - 3, 6, 6);
    ctx.fillStyle = '#20202a'; ctx.fillRect(x - 1, y - 1, 2, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(x - Math.sign(this.vx) * 8, y - 1, 6, 2);
  }
}

// Bomba de red: arco con gravedad, explota al tocar suelo o enemigo
class GBomb {
  constructor(p, x, y, vx, vy, lv) { this.p = p; this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.lv = lv; this.z = p.z; this.t = 0; }
  update(dt, world) {
    this.t += dt; this.vy += GRAV * 0.7 * dt; this.x += this.vx * dt; this.y += this.vy * dt;
    let boom = this.t > 1.6 || world.level.pointSolid(this.x, this.y + 2, true, false);
    for (const e of world.enemies) if (!e.dead && overlap({ x: this.x - 3, y: this.y - 3, w: 6, h: 6 }, e.hurtbox())) boom = true;
    if (!boom) return true;
    const r = 55 + this.lv * 12;
    Audio2.sfx('explode'); world.shake(4);
    world.particles.burst(this.x, this.y, 30, '#ffffff', 150);
    world.fx.push(new GRing(this.x, this.y, r, '#a0e0ff', 0.4));
    for (const e of world.enemies) {
      if (e.dead || !e.hittable() || dist(e.cx, e.cy, this.x, this.y) > r) continue;
      world.playerHits(e, 0.8 + this.lv * 0.3, sign(e.cx - this.x || 1) * 120, -120, false);
      if (!e.dead) e.web(3.5 + this.lv * 0.5, world);
      Progress.rec('gadgetHits', 1);
    }
    return false;
  }
  draw(ctx, cam, t) {
    const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y - this.z);
    ctx.fillStyle = '#2a2a34'; ctx.fillRect(x - 3, y - 3, 7, 7);
    ctx.fillStyle = Math.floor(t * 12) % 2 ? '#ff4040' : '#a0e0ff'; ctx.fillRect(x - 1, y - 1, 3, 3);
  }
}

// Mina trampa
class GMine {
  constructor(p, x, feet, lv) { this.p = p; this.x = x; this.y = feet - 2; this.lv = lv; this.z = p.z; this.t = 0; }
  update(dt, world) {
    this.t += dt;
    if (this.t > 25) return false;
    for (const e of world.enemies) {
      if (e.dead || !e.hittable() || Math.abs((e.z || 0) - this.z) > LANE + 6) continue;
      if (Math.abs(e.cx - this.x) < 16 && Math.abs(e.y + e.h - this.y) < 14) {
        Audio2.sfx('zap'); world.shake(3);
        world.fx.push(new GRing(this.x, this.y - 6, 40, '#ffd040', 0.35));
        for (const o of world.enemies) {
          if (o.dead || !o.hittable() || dist(o.cx, o.cy, this.x, this.y) > 40 + this.lv * 8) continue;
          world.playerHits(o, 1.5 + this.lv * 0.4, sign(o.cx - this.x || 1) * 60, -80, false);
          if (!o.dead) o.web(3 + this.lv * 0.5, world);
          Progress.rec('gadgetHits', 1);
        }
        return false;
      }
    }
    return true;
  }
  draw(ctx, cam, t) {
    const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y - this.z);
    ctx.fillStyle = '#20202a'; ctx.fillRect(x - 4, y - 2, 9, 3);
    ctx.fillStyle = Math.floor(t * 3) % 2 ? '#ffd040' : '#806010'; ctx.fillRect(x, y - 3, 1, 1);
    ctx.fillStyle = 'rgba(255,208,64,0.25)'; ctx.fillRect(x - 12, y, 25, 1);
  }
}

// Dron araña (también el poder Spider-Bro)
class GDrone {
  constructor(p, life, bro) { this.p = p; this.life = life; this.bro = bro; this.x = p.cx; this.y = p.y - 20; this.fire = 0.5; this.z = p.z; }
  update(dt, world) {
    this.life -= dt;
    if (this.life <= 0 || this.p.state === 'dead') { world.particles.burst(this.x, this.y, 8, '#ff6060', 60); return false; }
    const tx = this.p.cx - this.p.facing * 14, ty = this.p.y - 18 + Math.sin(world.t * 4) * 3;
    this.x += (tx - this.x) * Math.min(1, dt * 5); this.y += (ty - this.y) * Math.min(1, dt * 5); this.z = this.p.z;
    this.fire -= dt;
    if (this.fire <= 0) {
      let best = null, bd = this.bro ? 200 : 170;
      for (const e of world.enemies) { if (e.dead || !e.hittable()) continue; const d = dist(e.cx, e.cy, this.x, this.y); if (d < bd) { bd = d; best = e; } }
      if (best) {
        this.fire = this.bro ? 0.45 : 0.6;
        world.fx.push(new GBeam(this.x, this.y, best.cx, best.cy, this.bro ? '#80ffe0' : '#ff6060'));
        world.playerHits(best, this.bro ? 0.8 : 0.5, sign(best.cx - this.x) * 60, -40, false);
        Progress.rec('gadgetHits', 1);
        Audio2.sfx('laser');
      } else this.fire = 0.2;
    }
    return true;
  }
  draw(ctx, cam, t) {
    const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y - this.z);
    ctx.fillStyle = '#20202a'; ctx.fillRect(x - 4, y - 2, 9, 5);
    ctx.fillStyle = this.bro ? '#80ffe0' : '#ff4040'; ctx.fillRect(x - 1, y - 1, 3, 2);
    ctx.fillStyle = '#a0a0b0'; const w = Math.floor(t * 30) % 2 ? 4 : 2; ctx.fillRect(x - 4 - w, y - 3, w, 1); ctx.fillRect(x + 5, y - 3, w, 1);
    for (let i = 0; i < 4; i++) ctx.fillRect(x - 3 + i * 2, y + 3, 1, 2);
  }
}
class GBeam {
  constructor(x0, y0, x1, y1, c) { Object.assign(this, { x0, y0, x1, y1, c, t: 0.12 }); }
  update(dt) { this.t -= dt; return this.t > 0; }
  draw(ctx, cam) { ctx.strokeStyle = this.c; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(this.x0 - cam.x, this.y0 - cam.y); ctx.lineTo(this.x1 - cam.x, this.y1 - cam.y); ctx.stroke(); }
}
class GRing {
  constructor(x, y, r, c, dur) { Object.assign(this, { x, y, r, c, dur, t: 0 }); }
  update(dt) { this.t += dt; return this.t < this.dur; }
  draw(ctx, cam) {
    const u = this.t / this.dur;
    ctx.strokeStyle = this.c; ctx.globalAlpha = 1 - u; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(this.x - cam.x, this.y - cam.y, this.r * (0.3 + u * 0.7), 0, TAU); ctx.stroke();
    ctx.globalAlpha = 1;
  }
}
// Patas mecánicas del poder "Brazos de hierro"
class GArms {
  constructor(p) { this.p = p; this.hitT = 0; }
  update(dt, world) {
    const p = this.p;
    if (!(p.armsT > 0) || p.state === 'dead') return false;
    this.hitT -= dt;
    if (this.hitT <= 0) {
      this.hitT = 0.45;
      for (const e of world.enemies) {
        if (e.dead || !e.hittable() || Math.abs((e.z || 0) - p.z) > LANE + 4) continue;
        if (Math.abs(e.cx - p.cx) < 42 && Math.abs(e.cy - p.cy) < 30) { world.playerHits(e, 0.8, sign(e.cx - p.cx || 1) * 140, -90, false); this.flash = 0.1; break; }
      }
    }
    if (this.flash > 0) this.flash -= dt;
    return true;
  }
  draw(ctx, cam, t) {
    const p = this.p, x = Math.round(p.cx - cam.x), y = Math.round(p.y + 6 - cam.y - (p.z || 0));
    ctx.strokeStyle = '#e0b030'; ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const s = i < 2 ? -1 : 1, k = i % 2, a = Math.sin(t * 6 + i) * 3 + (this.flash > 0 ? 10 : 0);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + s * (10 + k * 5), y - 8 + k * 6 - a); ctx.lineTo(x + s * (18 + k * 6 + a), y + 6 + k * 4); ctx.stroke();
    }
  }
}

// ---- Poderes de traje ----
const SuitPowers = {
  current(p) {
    if (p.idx > 0) { const s = SUITS.find((x) => x.id === p.suitId); return (s && s.power) || 'furia'; }
    if (Game.save.power) return Game.save.power;
    const s = SUITS.find((x) => x.id === (p.suitId || Game.save.suit));
    return (s && s.power) || 'furia';
  },
  use(p, world) {
    if (p.powerCd > 0) { world.float('PODER EN ' + Math.ceil(p.powerCd) + ' s', p.cx, p.y - 12, '#c0c0d0'); Audio2.sfx('back'); return; }
    const id = this.current(p), P = SUIT_POWERS[id];
    p.powerCd = POWER_CD * (Progress.has('i_poder') ? 0.6 : 1);
    Progress.rec('powers', 1);
    world.float(P.name.toUpperCase() + '!', p.cx, p.y - 20, '#ffd040');
    Audio2.sfx('special'); world.shake(4); Input.rumble(0.7, 0.7, 250);
    world.particles.burst(p.cx, p.cy, 24, '#ffd040', 120);
    const onScreen = (e) => !e.dead && e.hittable() && world.onScreen(e);
    switch (id) {
      case 'furia': p.furyT = 10; break;
      case 'rafaga':
        for (const e of world.enemies) if (onScreen(e)) { e.web(4, world); world.fx.push(new GBeam(p.cx, p.cy, e.cx, e.cy, '#ffffff')); }
        break;
      case 'hermano': world.fx.push(new GDrone(p, 15, true)); break;
      case 'invisible': p.cloakT = 8; break;
      case 'brazos': p.armsT = 12; world.fx.push(new GArms(p)); break;
      case 'escudo': p.shieldT = 6; p.inv = Math.max(p.inv, 6); break;
      case 'electrico': p.shockT = 12; break;
      case 'sismo':
        world.shake(8); world.fx.push(new GRing(p.cx, p.feet, 140, '#e0c080', 0.6));
        world.areaHit(p.cx, p.feet - 6, 140, 2.2 * p.dmgMul, 260, -300, p);
        break;
      case 'tiempo': world.slowEnemiesT = 6; break;
      case 'negativo':
        world.fx.push(new GRing(p.cx, p.cy, 110, '#ffffff', 0.5)); world.fx.push(new GRing(p.cx, p.cy, 80, '#101010', 0.5));
        world.areaHit(p.cx, p.cy, 110, 1.6 * p.dmgMul, 320, -200, p, true);
        break;
    }
  },
};
