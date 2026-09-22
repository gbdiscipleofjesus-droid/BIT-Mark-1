'use strict';
// ---------------------------------------------------------------------------
// Enemigos, jefes, proyectiles, objetos y partículas
// ---------------------------------------------------------------------------
const THUG_PALS = [
  { torso: '#4a5a2a', leg: '#2a3450', hair: '#1a1a1a', face: 'beanie', head: '#d8a070' },
  { torso: '#6a2a2a', leg: '#2a2a30', hair: '#3a2416', face: 'human', head: '#b8845a' },
  { torso: '#2a3a5a', leg: '#3a3a3a', hair: '#8a2020', face: 'beanie', head: '#e0b088' },
  { torso: '#5a4a3a', leg: '#1e2a44', hair: '#141414', face: 'mask', head: '#141414', eye: '#e0e0e0' },
  { torso: '#3a3a3a', leg: '#4a3a2a', hair: '#e0c060', face: 'human', head: '#8a5a3a' },
].map((p) => makePal(Object.assign({ boot: '#1a1a1a', outline: '#140a12' }, p)));
const THEME_PALS = {
  thugs: THUG_PALS,
  oscorp: [
    { torso: '#2a2e36', torsoLow: '#1a1c22', leg: '#1a1c22', head: '#20242a', hair: '#20242a', face: 'visor', eye: '#60ff90' },
    { torso: '#3a3e46', torsoLow: '#22252c', leg: '#22252c', head: '#20242a', hair: '#20242a', face: 'visor', eye: '#60ffe0' },
  ].map((p) => makePal(Object.assign({ boot: '#101014', outline: '#08080a' }, p))),
  kingpin: [
    { torso: '#3a1a4a', torsoLow: '#1a0a24', leg: '#1a1a22', head: '#c89070', hair: '#141414', face: 'human' },
    { torso: '#1a1a22', torsoLow: '#101014', leg: '#101014', head: '#8a5a3a', hair: '#141414', face: 'beanie' },
    { torso: '#e0205a', torsoLow: '#1a1a22', leg: '#1a1a22', head: '#e0b088', hair: '#e0e040', face: 'human' },
  ].map((p) => makePal(Object.assign({ boot: '#0a0a0a', outline: '#000000' }, p))),
  zombie: [
    { torso: '#3a4a2a', leg: '#2a2a3a', head: '#7a9a6a', hair: '#2a3a1a', face: 'human', eye: '#ff3030' },
    { torso: '#5a2a2a', leg: '#2a2a2a', head: '#8aaa7a', hair: '#1a1a1a', face: 'human', eye: '#ff3030' },
    { torso: '#6a1818', torsoLow: '#e0b030', leg: '#6a1818', head: '#6a1818', hair: '#6a1818', face: 'spider', eye: '#ffe0a0', emblem: '#140a12' },
  ].map((p) => makePal(Object.assign({ boot: '#1a1a1a', outline: '#0a0a06' }, p))),
};
let ENEMY_THEME = 'thugs';
const CHITAURI_PAL = makePal({ torso: '#3a2a4a', torsoLow: '#2a2030', arm: '#4a3a5a', leg: '#2a2030', boot: '#1a1420', head: '#20202a', hair: '#20202a', face: 'visor', eye: '#c060ff', outline: '#0a0610' });
const BRUTE_PAL = makePal({ torso: '#5a5a62', torsoLow: '#3a3a42', arm: '#6a4a3a', arm2: '#c89070', hand: '#c89070', leg: '#2a2a34', boot: '#1a1a1a', head: '#c89070', hair: '#1a1a1a', face: 'beanie', outline: '#140a12' });

const ENEMY_SPECS = {
  thug: { hp: 5, speed: 58, range: 17, windup: 0.5, dmg: 9, cd: [0.9, 1.9], kind: 'melee', tech: 1 },
  bat: { hp: 6, speed: 52, range: 25, windup: 0.62, dmg: 13, cd: [1.1, 2.0], kind: 'melee', weapon: 'bat', tech: 2 },
  gunner: { hp: 4, speed: 55, kind: 'ranged', prefer: [90, 150], windup: 0.7, dmg: 8, cd: [1.4, 2.4], proj: 'bullet', pspeed: 230, weapon: 'gun', tech: 2 },
  chitauri: { hp: 5, speed: 48, kind: 'ranged', prefer: [70, 140], windup: 0.8, dmg: 11, cd: [1.6, 2.6], proj: 'orb', pspeed: 150, weapon: 'alien', tech: 3 },
  brute: { hp: 14, speed: 42, range: 26, windup: 0.8, dmg: 17, cd: [1.4, 2.4], kind: 'melee', armor: 0.35, scale: 1.35, w: 14, h: 30, tech: 4 },
  drone: { hp: 3, speed: 70, kind: 'ranged', prefer: [60, 130], windup: 0.8, dmg: 8, cd: [1.6, 2.6], proj: 'laser', pspeed: 210, fly: true, w: 12, h: 8, tech: 2 },
  zombie: { hp: 6, speed: 34, range: 16, windup: 0.7, dmg: 11, cd: [1.0, 2.0], kind: 'melee', tech: 1 },
  ultron: { hp: 4, speed: 80, kind: 'ranged', prefer: [60, 130], windup: 0.7, dmg: 9, cd: [1.4, 2.2], proj: 'laser', pspeed: 230, fly: true, w: 12, h: 9, tech: 2 },
  decoy: { hp: 1, speed: 70, kind: 'ranged', prefer: [60, 140], windup: 0.9, dmg: 7, cd: [3, 4.5], proj: 'laser', pspeed: 200, fly: true, w: 14, h: 10, tech: 0 },
};
const DIFF_DMG = [0.6, 1, 1.4], DIFF_HP = [0.8, 1, 1.25], DIFF_TOKENS = [1, 2, 3];
let ENEMY_ID = 0;

class Enemy {
  constructor(type, x, y) {
    const sp = ENEMY_SPECS[type] || ENEMY_SPECS.thug;
    this.id = ++ENEMY_ID;
    this.type = type; this.spec = sp;
    this.w = sp.w || 10; this.h = sp.h || 22;
    this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.z = 0;
    this.hp = this.maxHp = Math.ceil(sp.hp * DIFF_HP[Game.settings.difficulty]);
    this.facing = -1; this.state = 'idle'; this.t = 0; this.anim = rand(0, 5);
    this.cd = rand(0.4, 1.2); this.webbed = 0; this.flash = 0; this.dead = false; this.koT = 0;
    this.fly = !!sp.fly; this.scale = sp.scale || 1;
    const pals = THEME_PALS[type === 'zombie' ? 'zombie' : ENEMY_THEME] || THUG_PALS;
    this.pal = type === 'chitauri' ? CHITAURI_PAL : (type === 'brute' && ENEMY_THEME !== 'zombie') ? BRUTE_PAL : pals[this.id % pals.length];
    this.hasToken = false; this.arena = null; this.aggro = false; this.onGround = false;
    this.hoverY = y; this.isBoss = false; this.noReward = false;
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  hurtbox() { return { x: this.x - 1, y: this.y, w: this.w + 2, h: this.h }; }
  hittable() { return !this.dead; }
  dmg() { return Math.round(this.spec.dmg * DIFF_DMG[Game.settings.difficulty]); }

  update(dt, world) {
    this.anim += dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.dead) {
      this.koT -= dt;
      this.vy = Math.min(this.vy + GRAV * dt, 400);
      if (this.onGround) this.vx = approach(this.vx, 0, 500 * dt);
      world.level.move(this, dt);
      if (this.koT <= 0) this.remove = true;
      return;
    }
    const p = world.player;
    const dx = p.cx - this.cx, dy = p.cy - this.cy, adx = Math.abs(dx);
    if (this.webbed > 0) {
      this.webbed -= dt;
      this.releaseToken(world);
      this.vx = approach(this.vx, 0, 400 * dt);
      this.vy = Math.min(this.vy + GRAV * dt, 400);
      world.level.move(this, dt);
      if (this.webbed <= 0) { this.state = 'chase'; this.t = 0; this.hoverY = Math.min(this.hoverY, this.y - 40); }
      this.clampArena();
      return;
    }
    if (this.cd > 0) this.cd -= dt;
    switch (this.state) {
      case 'idle':
        if ((adx < 210 && Math.abs(dy) < 140) || this.aggro) { this.state = 'chase'; this.aggro = true; }
        break;
      case 'chase': {
        this.facing = dx >= 0 ? 1 : -1;
        const sp = this.spec;
        let want = 0;
        if (sp.kind === 'ranged') {
          if (adx < sp.prefer[0]) want = -this.facing;
          else if (adx > sp.prefer[1]) want = this.facing;
          if (this.cd <= 0 && adx < sp.prefer[1] + 60 && Math.abs(dy) < (this.fly ? 160 : 70) && Math.abs(this.z - p.z) < LANE && world.onScreen(this)) {
            this.state = 'windup'; this.t = sp.windup; want = 0;
          }
        } else {
          if (adx > sp.range) want = this.facing;
          if (adx <= sp.range + 4 && Math.abs(dy) < 26 && Math.abs(this.z - p.z) < 6 && this.cd <= 0 && this.takeToken(world)) {
            this.state = 'windup'; this.t = sp.windup; want = 0;
          }
        }
        // no caer por bordes
        if (want && !this.fly && this.onGround) {
          const ahead = world.level.groundAhead(this.cx + want * (this.w / 2 + 4), this.y + this.h);
          if (!ahead) want = 0;
        }
        this.vx = approach(this.vx, want * sp.speed, 500 * dt);
        break;
      }
      case 'windup':
        this.t -= dt;
        this.vx = approach(this.vx, 0, 600 * dt);
        this.facing = dx >= 0 ? 1 : -1;
        if (this.t <= 0) this.doAttack(world);
        break;
      case 'attack':
        this.t -= dt;
        if (this.spec.kind === 'melee' && !this.hitDone) {
          const r = this.spec.range * this.scale;
          const box = { x: this.facing > 0 ? this.cx : this.cx - r - 4, y: this.y + 2, w: r + 4, h: this.h - 4 };
          if (overlap(box, p.hurtbox())) {
            this.hitDone = true;
            world.damagePlayer(this.dmg(), this.cx, this.z);
          }
        }
        if (this.t <= 0) { this.state = 'recover'; this.t = 0.45; this.cd = rand(...this.spec.cd); this.releaseToken(world); }
        break;
      case 'recover':
        this.t -= dt;
        this.vx = approach(this.vx, 0, 600 * dt);
        if (this.t <= 0) this.state = 'chase';
        break;
      case 'hurt':
        this.t -= dt;
        if (this.onGround) this.vx = approach(this.vx, 0, 500 * dt);
        if (this.t <= 0) this.state = 'chase';
        break;
      case 'air':
        if (this.onGround && this.vy >= 0) { this.state = 'down'; this.t = 0.5; }
        break;
      case 'down':
        this.t -= dt;
        this.vx = approach(this.vx, 0, 500 * dt);
        if (this.t <= 0) this.state = 'chase';
        break;
      default: this.state = 'chase';
    }
    this.updZ(dt, p, 45);
    if (this.fly && this.state !== 'air' && this.state !== 'down') {
      const targetY = Math.min(this.hoverY, p.y - 50) + Math.sin(this.anim * 2) * 8;
      this.vy = approach(this.vy, clamp((targetY - this.y) * 2, -80, 80), 300 * dt);
    } else {
      this.vy = Math.min(this.vy + GRAV * dt, 450);
    }
    world.level.move(this, dt);
    if (this.fly && (this.state === 'air' || this.state === 'down') && this.onGround && this.state === 'down' && this.t <= 0.05) this.hoverY = this.y - 50;
    this.clampArena();
  }

  // Profundidad (estilo beat 'em up): en la calle se alinean con Spider-Man
  updZ(dt, p, speed) {
    const street = onStreet(this);
    if (street || this.fly) {
      if (this.state !== 'idle' && this.state !== 'attack' && this.state !== 'hurt') {
        this.z = approach(this.z, clamp(p.z, 0, DEPTH_MAX), speed * dt);
      }
    } else if (this.onGround) this.z = approach(this.z, 0, 120 * dt);
  }

  clampArena() {
    if (this.arena) {
      if (this.x < this.arena.x1 + 2) { this.x = this.arena.x1 + 2; if (this.vx < 0) this.vx = 0; }
      if (this.x + this.w > this.arena.x2 - 2) { this.x = this.arena.x2 - 2 - this.w; if (this.vx > 0) this.vx = 0; }
    }
  }

  doAttack(world) {
    const sp = this.spec;
    this.state = 'attack'; this.hitDone = false;
    if (sp.kind === 'melee') {
      this.t = 0.16;
      this.vx = this.facing * 60;
      Audio2.sfx('whoosh');
    } else {
      this.t = 0.2;
      const p = world.player;
      const ox = this.cx + this.facing * 8, oy = this.fly ? this.y + this.h : this.y + 8;
      let ax = p.cx - ox, ay = p.cy - oy;
      if (sp.proj === 'bullet') ay = clamp(ay, -Math.abs(ax) * 0.3, Math.abs(ax) * 0.3);
      const l = Math.hypot(ax, ay) || 1;
      world.addProj(new Proj(sp.proj, ox, oy, ax / l * sp.pspeed, ay / l * sp.pspeed, 'e', this.dmg()));
      Audio2.sfx(sp.proj === 'laser' ? 'laser' : 'shoot');
    }
  }

  takeToken(world) {
    if (this.hasToken) return true;
    if (world.tokensUsed < DIFF_TOKENS[Game.settings.difficulty]) { world.tokensUsed++; this.hasToken = true; return true; }
    return false;
  }
  releaseToken(world) {
    if (this.hasToken) { this.hasToken = false; world.tokensUsed = Math.max(0, world.tokensUsed - 1); }
  }

  takeHit(dmg, kx, ky, heavy, world) {
    if (this.dead) return false;
    const armored = this.spec.armor && this.webbed <= 0 && this.state !== 'down' && this.state !== 'air';
    const eff = dmg * (this.webbed > 0 ? 1.5 : 1) * (armored ? this.spec.armor : 1);
    this.hp -= eff;
    this.flash = 0.1;
    this.aggro = true;
    if (this.hp <= 0) { this.die(kx, world); return true; }
    if (armored && !heavy) { this.vx = kx * 0.15; return true; }
    this.releaseToken(world);
    if (this.webbed > 0) { this.vx = kx * 0.3; return true; }
    this.vx = kx * (armored ? 0.3 : 1);
    if (ky < -200 && !armored) { this.vy = ky; this.state = 'air'; this.onGround = false; }
    else { this.vy = this.onGround ? ky * 0.35 : Math.min(this.vy, ky * 0.5); this.state = this.state === 'air' ? 'air' : 'hurt'; this.t = 0.3; }
    return true;
  }

  web(dur, world) {
    if (this.dead) return;
    if (this.type === 'decoy') { this.die(0, world); return; }
    this.webbed = dur;
    this.state = 'hurt'; this.t = 0.1;
    this.releaseToken(world);
    world.particles.burst(this.cx, this.cy, 6, '#ffffff', 60);
  }

  die(kx, world) {
    this.dead = true; this.state = 'ko'; this.koT = 1.1;
    this.vx = kx * 1.1 + sign(kx) * 60; this.vy = -180;
    this.fly = false;
    this.releaseToken(world);
    world.onEnemyKO(this);
  }

  // ---------------- dibujo ----------------
  draw(ctx, cam, t) {
    if (this.dead && this.koT < 0.5 && Math.floor(this.koT * 20) % 2) return;
    const x = Math.round(this.cx - cam.x), y = Math.round(this.y + this.h - cam.y);
    if (x < -60 || x > W + 60 || y < -60 || y > H + 80) return;
    if (this.type === 'drone' || this.type === 'decoy' || this.type === 'ultron') { this.drawDrone(ctx, x, y - this.h, t); return; }
    let pose;
    if (this.dead) pose = Poses.ko();
    else if (this.webbed > 0) pose = Poses.webbed();
    else switch (this.state) {
      case 'windup': pose = this.spec.kind === 'ranged' ? Poses.aim() : Poses.windup(); break;
      case 'attack': pose = this.spec.kind === 'ranged' ? Poses.aim() : (this.spec.weapon === 'bat' ? Poses.punch2() : Poses.punch1()); break;
      case 'hurt': pose = Poses.hurt(); break;
      case 'air': pose = Poses.hurt(); pose.rot = -30; break;
      case 'down': pose = Poses.ko(); break;
      default:
        pose = Math.abs(this.vx) > 8 ? Poses.run(this.anim * (this.type === 'zombie' ? 5 : 9)) : Poses.idle(this.anim);
        if (this.type === 'zombie') { pose.a1 = 80; pose.b1 = 85; pose.a2 = 0; pose.b2 = 0; pose.h = Math.sin(this.anim * 3) * 20; }
    }
    const pal = this.flash > 0 ? FLASH_PAL : this.pal;
    const wp = Rig.draw(ctx, x, y, this.facing, pose, pal, { scale: this.scale, bulk: this.type === 'brute' ? 6 : 4 });
    if (!this.dead) this.drawWeapon(ctx, wp, t);
    if (this.webbed > 0) drawWebWrap(ctx, x, y, this.w * this.scale, this.h, this.id);
    if (this.state === 'windup' && !this.dead && this.webbed <= 0 && Math.floor(t * 16) % 2 === 0) {
      ctx.fillStyle = '#ff5050';
      ctx.fillRect(wp.head[0] - 1, wp.head[1] - 9 * this.scale, 2, 3);
      ctx.fillRect(wp.head[0] - 1, wp.head[1] - 5 * this.scale, 2, 1);
    }
  }

  drawWeapon(ctx, wp, t) {
    const [hx, hy] = wp.h2;
    const f = this.facing;
    if (this.spec.weapon === 'bat') {
      ctx.fillStyle = '#8a5a2a';
      const up = this.state === 'windup';
      if (up) thickLine(ctx, hx, hy, hx - f * 6, hy - 10, 2);
      else thickLine(ctx, hx, hy, hx + f * 11, hy - 2, 2);
    } else if (this.spec.weapon === 'gun') {
      ctx.fillStyle = '#202020'; ctx.fillRect(f > 0 ? hx : hx - 5, hy - 1, 6, 2);
      if (this.state === 'attack' && this.t > 0.12) { ctx.fillStyle = '#ffe060'; ctx.fillRect(f > 0 ? hx + 6 : hx - 8, hy - 2, 3, 3); }
    } else if (this.spec.weapon === 'alien') {
      ctx.fillStyle = '#6a4a8a'; ctx.fillRect(f > 0 ? hx - 1 : hx - 7, hy - 2, 8, 3);
      ctx.fillStyle = this.state === 'windup' ? (Math.floor(t * 20) % 2 ? '#ffffff' : '#e080ff') : '#c060ff';
      ctx.fillRect(f > 0 ? hx + 6 : hx - 8, hy - 1, 2, 2);
    }
    if (this.state === 'windup' && this.spec.kind === 'ranged' && this.spec.proj === 'bullet') {
      ctx.fillStyle = 'rgba(255,40,40,0.5)';
      ctx.fillRect(f > 0 ? hx + 6 : hx - 66, hy, 60, 1);
    }
  }

  drawDrone(ctx, x, y, t) {
    const f = this.flash > 0;
    const body = f ? '#ffffff' : this.type === 'ultron' ? '#a8b0bc' : (this.type === 'decoy' || this.mysterio ? '#4a6a5a' : '#5a606c');
    const bx = x - 6, by = Math.round(y);
    ctx.fillStyle = '#140a12'; ctx.fillRect(bx - 1, by + 1, 14, 7);
    ctx.fillStyle = body; ctx.fillRect(bx, by + 2, 12, 5);
    ctx.fillStyle = shade(body, 0.3); ctx.fillRect(bx + 1, by + 2, 10, 1);
    const blink = Math.floor(t * 30) % 2;
    ctx.fillStyle = '#9aa0a8';
    ctx.fillRect(bx - 3 + (blink ? 0 : 1), by, 6, 1); ctx.fillRect(bx + 9 + (blink ? 1 : 0), by, 6, 1);
    ctx.fillRect(bx, by + 1, 1, 1); ctx.fillRect(bx + 11, by + 1, 1, 1);
    const eye = this.state === 'windup' ? (blink ? '#ffffff' : '#ff3030') : (this.mysterio || this.type === 'decoy' ? '#60ff90' : '#ff5050');
    ctx.fillStyle = eye; ctx.fillRect(bx + 5 + this.facing, by + 4, 2, 2);
    if (this.webbed > 0) drawWebWrap(ctx, x, by + 8, 12, 8, this.id);
  }
}

function drawWebWrap(ctx, x, y, w, h, seed) {
  ctx.fillStyle = 'rgba(240,240,240,0.9)';
  for (let i = 0; i < 6; i++) {
    const a = hash2(seed, i), b = hash2(i, seed);
    const x0 = x - w / 2 - 2 + a * (w + 4), y0 = y - h + b * h;
    thickLine(ctx, x0, y0, x0 + (b - 0.5) * w, y0 + (a - 0.5) * 8, 1);
  }
}

// ---------------------------------------------------------------------------
// Jefes
// ---------------------------------------------------------------------------
class Boss extends Enemy {
  constructor(type, x, y, o) {
    super('thug', x, y);
    this.type = type; this.isBoss = true;
    this.name = o.name; this.w = o.w; this.h = o.h; this.scale = o.scale || 1;
    this.hp = this.maxHp = Math.ceil(o.hp * DIFF_HP[Game.settings.difficulty]);
    this.baseDmg = o.dmg; this.pal = o.pal;
    this.phase = 1; this.stun = 0; this.webHits = 0; this.webNeed = o.webNeed || 3;
    this.state = 'wait'; this.t = 0; this.inv = 0; this.armorMul = o.armor || 1;
    this.spec = { kind: 'boss', tech: 0, dmg: o.dmg };
    this.contactDmg = false;
    this.facing = -1;
  }
  hurtbox() { return { x: this.x - 2, y: this.y, w: this.w + 4, h: this.h }; }
  hittable() { return !this.dead && this.state !== 'wait' && this.inv <= 0; }
  bdmg(m = 1) { return Math.round(this.baseDmg * m * DIFF_DMG[Game.settings.difficulty]); }
  speedMul() { return this.phase === 2 ? 1.3 : 1; }

  takeHit(dmg, kx, ky, heavy, world) {
    if (!this.hittable()) return false;
    const mul = this.stun > 0 ? 1.5 : this.armorMul;
    this.hp -= dmg * mul;
    this.flash = 0.1;
    if (this.stun > 0) this.vx = kx * 0.25;
    if (this.escapeAt && this.hp <= this.maxHp * this.escapeAt) {
      this.hp = Math.max(1, this.hp); this.escaped = true;
      world.particles.burst(this.cx, this.cy, 24, '#e06020', 120); world.particles.burst(this.cx, this.cy, 16, '#60ffe0', 90);
      this.die(kx, world); return true;
    }
    if (this.hp <= 0) { this.hp = 0; this.die(kx, world); return true; }
    if (this.phase === 1 && this.hp <= this.maxHp / 2) {
      this.phase = 2; this.inv = 0.8; this.stun = 0;
      this.state = 'roar'; this.t = 1.0;
      Audio2.sfx('roar'); world.shake(6);
      this.onPhase2(world);
    }
    return true;
  }
  onPhase2() {}
  web(dur, world) {
    if (this.dead || this.state === 'wait' || this.stun > 0) return;
    this.webHits++;
    world.particles.burst(this.cx, this.cy, 6, '#ffffff', 60);
    if (this.webHits >= this.webNeed) {
      this.webHits = 0;
      this.stun = 2.6; this.state = 'stunned'; this.t = 2.6;
      world.float('¡ATURDIDO!', this.cx, this.y - 10, '#ffe060');
      Audio2.sfx('webhit');
      this.onStun(world);
    } else {
      world.float('RED ' + this.webHits + '/' + this.webNeed, this.cx, this.y - 10, '#ffffff');
    }
  }
  onStun() {}
  die(kx, world) {
    this.dead = true; this.state = 'ko'; this.koT = 99; this.vx = kx * 0.5; this.vy = -200; this.fly = false;
    Audio2.sfx('explode'); world.shake(8);
    world.onBossKO(this);
  }
  common(dt, world) {
    this.anim += dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.inv > 0) this.inv -= dt;
    if (this.stun > 0) this.stun -= dt;
  }
  update(dt, world) {
    this.common(dt, world);
    if (this.dead) {
      this.vy = Math.min(this.vy + GRAV * dt, 400);
      if (this.onGround) this.vx = approach(this.vx, 0, 400 * dt);
      world.level.move(this, dt);
      return;
    }
    if (this.state === 'wait') { this.vy = Math.min(this.vy + GRAV * dt, 400); world.level.move(this, dt); return; }
    if (this.state === 'roar') {
      this.t -= dt; this.vx = 0;
      this.vy = Math.min(this.vy + GRAV * dt, 400); world.level.move(this, dt);
      if (this.t <= 0) { this.state = 'move'; this.t = 0.5; }
      return;
    }
    if (this.state === 'stunned') {
      this.t -= dt;
      this.vx = approach(this.vx, 0, 400 * dt);
      this.vy = Math.min(this.vy + GRAV * dt, 400); world.level.move(this, dt);
      if (Math.floor(this.anim * 10) % 4 === 0) world.particles.spark(this.cx + rand(-6, 6), this.y - 4, '#ffe060', 1);
      if (this.t <= 0) { this.state = 'move'; this.t = 0.6; this.stun = 0; }
      this.clampArena();
      return;
    }
    this.updZ(dt, world.player, 28 * this.speedMul());
    this.ai(dt, world);
    this.clampArena();
    // daño por contacto en embestidas
    if (this.contactDmg && overlap(this.hurtbox(), world.player.hurtbox())) world.damagePlayer(this.bdmg(), this.cx, this.z);
  }
  ground(dt, world) {
    this.vy = Math.min(this.vy + GRAV * dt, 450);
    world.level.move(this, dt);
  }
  faceP(world) { this.facing = world.player.cx >= this.cx ? 1 : -1; }
  drawStun(ctx, x, y, t) {
    if (this.state !== 'stunned') return;
    for (let i = 0; i < 3; i++) {
      const a = t * 4 + i * TAU / 3;
      ctx.fillStyle = '#ffe060';
      ctx.fillRect(Math.round(x + Math.cos(a) * 8), Math.round(y + Math.sin(a) * 3), 2, 2);
    }
  }
  drawHP() {}
}

// ---- Jefe 1: Shocker ----
class Shocker extends Boss {
  constructor(x, y) {
    super('shocker', x, y, { name: 'SHOCKER', w: 12, h: 25, scale: 1.1, hp: 42, dmg: 12,
      pal: makePal({ head: '#d8b830', hair: '#6a5a20', torso: '#d8b830', torsoLow: '#8a7020', arm: '#8a7020', arm2: '#d8b830', hand: '#5a6a80', leg: '#6a5a30', boot: '#3a2a1a', face: 'goggles', eye: '#60c0ff', outline: '#140a12' }) });
  }
  ai(dt, world) {
    const p = world.player, adx = Math.abs(p.cx - this.cx);
    this.contactDmg = this.state === 'dash';
    switch (this.state) {
      case 'move': {
        this.faceP(world);
        this.t -= dt;
        let want = 0;
        if (adx < 80) want = -this.facing; else if (adx > 140) want = this.facing;
        this.vx = approach(this.vx, want * 60 * this.speedMul(), 400 * dt);
        if (this.t <= 0) {
          const r = Math.random();
          if (adx < 90 && r < 0.5) { this.state = 'dashWU'; this.t = 0.45; }
          else if (r < 0.75) { this.state = 'blastWU'; this.t = 0.6; }
          else { this.state = 'waveWU'; this.t = 0.7; this.slams = this.phase === 2 ? 2 : 1; }
          Audio2.sfx('zap');
        }
        break;
      }
      case 'blastWU':
        this.faceP(world); this.vx = approach(this.vx, 0, 600 * dt); this.t -= dt;
        if (this.t <= 0) {
          const angs = this.phase === 2 ? [-14, 0, 14] : [0];
          const ox = this.cx + this.facing * 10, oy = this.y + 10;
          const base = Math.atan2(p.cy - oy, p.cx - ox);
          for (const a of angs) {
            const r = base + a * D2R;
            world.addProj(new Proj('shock', ox, oy, Math.cos(r) * 175, Math.sin(r) * 175, 'e', this.bdmg()));
          }
          Audio2.sfx('zap'); world.shake(2);
          this.state = 'recover'; this.t = 0.8;
        }
        break;
      case 'waveWU':
        this.vx = approach(this.vx, 0, 600 * dt); this.t -= dt;
        if (this.t <= 0) {
          for (const d of [-1, 1]) world.addProj(new Proj('wave', this.cx + d * 8, this.y + this.h - 6, d * 190, 0, 'e', this.bdmg(0.9)));
          world.shake(4); Audio2.sfx('heavy');
          this.slams--;
          if (this.slams > 0) this.t = 0.5; else { this.state = 'recover'; this.t = 0.9; }
        }
        break;
      case 'dashWU':
        this.faceP(world); this.vx = 0; this.t -= dt;
        if (this.t <= 0) { this.state = 'dash'; this.t = 0.5; this.vx = this.facing * 280 * this.speedMul(); Audio2.sfx('whoosh'); }
        break;
      case 'dash':
        this.t -= dt;
        if (Math.floor(this.anim * 30) % 2) world.particles.spark(this.cx, this.cy, '#80d0ff', 1);
        if (this.t <= 0 || this.hitWall) { this.state = 'recover'; this.t = 0.8; }
        break;
      case 'recover':
        this.vx = approach(this.vx, 0, 500 * dt); this.t -= dt;
        if (this.t <= 0) { this.state = 'move'; this.t = rand(0.8, 1.4) / this.speedMul(); }
        break;
      default: this.state = 'move';
    }
    this.ground(dt, world);
  }
  draw(ctx, cam, t) {
    const x = Math.round(this.cx - cam.x), y = Math.round(this.y + this.h - cam.y);
    let pose;
    if (this.dead) pose = Poses.ko();
    else switch (this.state) {
      case 'blastWU': pose = Poses.aim(); break;
      case 'waveWU': pose = Poses.cheer(t); pose.a1 = 170; pose.b1 = 160; break;
      case 'dash': case 'dashWU': pose = Poses.punch1(); break;
      case 'stunned': pose = Poses.hurt(); break;
      case 'roar': pose = Poses.cheer(t); break;
      default: pose = Math.abs(this.vx) > 8 ? Poses.run(this.anim * 8) : Poses.idle(t);
    }
    const glow = this.state.endsWith('WU') && Math.floor(t * 20) % 2;
    const wp = Rig.draw(ctx, x, y, this.facing, pose, this.flash > 0 ? FLASH_PAL : this.pal, { scale: this.scale });
    for (const h of [wp.h1, wp.h2]) {
      ctx.fillStyle = '#3a4a60'; ctx.fillRect(h[0] - 3, h[1] - 3, 6, 6);
      ctx.fillStyle = glow ? '#ffffff' : '#60c0ff'; ctx.fillRect(h[0] - 1, h[1] - 1, 3, 3);
    }
    this.drawStun(ctx, wp.head[0], wp.head[1] - 8, t);
  }
}

// ---- Jefe 2: Exo-Matón ----
class ExoBrute extends Boss {
  constructor(x, y) {
    super('exo', x, y, { name: 'EXO-MATÓN', w: 18, h: 38, scale: 1.7, hp: 60, dmg: 15, armor: 0.5,
      pal: makePal({ head: '#4a4e58', hair: '#4a4e58', torso: '#e09020', torsoLow: '#3a3e48', arm: '#5a606c', arm2: '#7a808c', hand: '#9aa0ac', leg: '#3a3e48', boot: '#22252c', face: 'visor', eye: '#ff3030', outline: '#101014' }) });
    this.summoned = false;
  }
  onPhase2(world) {
    if (!this.summoned) { this.summoned = true; world.spawnMinion('thug', this.arena); world.spawnMinion('thug', this.arena); }
  }
  onStun() { this.vx = 0; }
  chooseAttack(adx) {
    if (adx < 42) { this.state = 'punchWU'; this.t = 0.7 / this.speedMul(); }
    else if (Math.random() < 0.5) { this.state = 'leapWU'; this.t = 0.5; }
    else { this.state = 'chargeWU'; this.t = 0.6; }
  }
  aiExtra() { return false; }
  drawExtra(ctx, wp) {
    ctx.fillStyle = '#7a808c'; ctx.fillRect(wp.sh[0] - 5, wp.sh[1] - 3, 10, 5);
    ctx.fillStyle = '#e09020'; ctx.fillRect(wp.sh[0] - 5, wp.sh[1] - 3, 10, 1);
  }
  ai(dt, world) {
    const p = world.player, adx = Math.abs(p.cx - this.cx);
    this.contactDmg = this.state === 'charge' || (this.state === 'leap' && this.vy > 0);
    if (this.aiExtra(dt, world)) return;
    switch (this.state) {
      case 'move':
        this.faceP(world); this.t -= dt;
        this.vx = approach(this.vx, (adx > 30 ? this.facing : 0) * 50 * this.speedMul(), 300 * dt);
        if (this.t <= 0 || adx < 36) { this.chooseAttack(adx); Audio2.sfx('roar'); }
        break;
      case 'punchWU':
        this.vx = 0; this.t -= dt;
        if (this.t <= 0) { this.state = 'punch'; this.t = 0.18; this.hitDone = false; Audio2.sfx('whoosh'); }
        break;
      case 'punch': {
        this.t -= dt;
        const box = { x: this.facing > 0 ? this.cx : this.cx - 38, y: this.y + 6, w: 38, h: this.h - 10 };
        if (!this.hitDone && overlap(box, p.hurtbox())) { this.hitDone = true; world.damagePlayer(this.bdmg(1.1), this.cx, this.z); }
        if (this.t <= 0) { this.state = 'recover'; this.t = 0.7; }
        break;
      }
      case 'leapWU':
        this.faceP(world); this.vx = 0; this.t -= dt;
        if (this.t <= 0) {
          this.state = 'leap'; this.vy = -440; this.onGround = false;
          this.vx = clamp((p.cx - this.cx) / 0.9, -260, 260);
          Audio2.sfx('jump');
        }
        break;
      case 'leap':
        if (this.onGround && this.vy >= 0) {
          this.vx = 0;
          for (const d of [-1, 1]) world.addProj(new Proj('wave', this.cx + d * 12, this.y + this.h - 6, d * 170, 0, 'e', this.bdmg(0.8)));
          world.shake(7); Audio2.sfx('explode'); world.particles.dust(this.cx, this.y + this.h, 12);
          this.state = 'stunned'; this.stun = 1.6; this.t = 1.6;
        }
        break;
      case 'chargeWU':
        this.faceP(world); this.vx = 0; this.t -= dt;
        if (this.t <= 0) { this.state = 'charge'; this.t = 1.6; Audio2.sfx('roar'); }
        break;
      case 'charge': {
        this.t -= dt;
        this.vx = this.facing * 240 * this.speedMul();
        if (Math.floor(this.anim * 20) % 2) world.particles.dust(this.cx - this.facing * 8, this.y + this.h, 1);
        const atWall = this.hitWall || (this.arena && (this.x <= this.arena.x1 + 3 || this.x + this.w >= this.arena.x2 - 3));
        if (atWall) {
          this.vx = -this.facing * 60; world.shake(6); Audio2.sfx('explode');
          this.state = 'stunned'; this.stun = 2.0; this.t = 2.0;
          world.float('¡SE ESTRELLÓ!', this.cx, this.y - 10, '#ffe060');
        } else if (this.t <= 0) { this.state = 'recover'; this.t = 0.5; }
        break;
      }
      case 'recover':
        this.vx = approach(this.vx, 0, 500 * dt); this.t -= dt;
        if (this.t <= 0) { this.state = 'move'; this.t = rand(0.8, 1.3); }
        break;
      default: this.state = 'move';
    }
    this.ground(dt, world);
  }
  draw(ctx, cam, t) {
    const x = Math.round(this.cx - cam.x), y = Math.round(this.y + this.h - cam.y);
    let pose;
    if (this.dead) pose = Poses.ko();
    else switch (this.state) {
      case 'punchWU': pose = Poses.windup(); break;
      case 'punch': pose = Poses.punch1(); break;
      case 'leapWU': pose = Poses.crouch(); break;
      case 'leap': pose = this.vy < 0 ? Poses.jump() : Poses.slam(); break;
      case 'charge': pose = Poses.run(this.anim * 14); pose.t = 30; break;
      case 'chargeWU': pose = Poses.crouch(); break;
      case 'stunned': pose = Poses.hurt(); break;
      case 'roar': pose = Poses.cheer(t); break;
      default: pose = Math.abs(this.vx) > 8 ? Poses.run(this.anim * 6) : Poses.idle(t);
    }
    if (this.state === 'whipWU') pose = Poses.windup();
    else if (this.state === 'whip') pose = Poses.punch1();
    const wp = Rig.draw(ctx, x, y, this.facing, pose, this.flash > 0 ? FLASH_PAL : this.pal, { scale: this.scale, bulk: 6 });
    this.drawExtra(ctx, wp, t);
    this.drawStun(ctx, wp.head[0], wp.head[1] - 10, t);
  }
}

// ---- Jefe 3: Buitre Mk II ----
class Vulture extends Boss {
  constructor(x, y) {
    super('vulture', x, y, { name: 'BUITRE MK II', w: 14, h: 22, scale: 1.1, hp: 52, dmg: 12,
      pal: makePal({ head: '#3a5a3a', hair: '#3a5a3a', torso: '#4a6a4a', torsoLow: '#2a3a2a', arm: '#4a6a4a', arm2: '#5a5a5a', leg: '#2a3a2a', boot: '#1a1a1a', face: 'goggles', eye: '#60ff60', outline: '#0e140e' }) });
    this.fly = true; this.state = 'wait'; this.side = 1;
  }
  onStun(world) { this.fly = false; this.vx = 0; }
  update(dt, world) {
    if (this.state === 'wait') { this.common(dt, world); this.vx = 0; this.vy = 0; return; }
    super.update(dt, world);
    if (this.state === 'move' && !this.fly) { this.fly = true; }
  }
  ai(dt, world) {
    const p = world.player;
    const ground = world.level.groundY;
    const hoverY = ground - 120 + Math.sin(this.anim * 2) * 8;
    this.fly = true;
    this.contactDmg = this.state === 'swoop';
    switch (this.state) {
      case 'move': {
        this.t -= dt;
        const tx = clamp(p.cx + this.side * 110, this.arena.x1 + 20, this.arena.x2 - 30);
        this.vx = approach(this.vx, clamp((tx - this.cx) * 2, -150, 150), 400 * dt);
        this.vy = approach(this.vy, clamp((hoverY - this.y) * 3, -160, 160), 500 * dt);
        this.faceP(world);
        if (this.t <= 0) {
          const r = Math.random();
          if (r < 0.4) { this.state = 'swoopWU'; this.t = 0.6; Audio2.sfx('roar'); }
          else if (r < 0.7) { this.state = 'bombs'; this.t = 0; this.bombs = this.phase === 2 ? 5 : 3; this.vx = -this.side * 160; this.bombT = 0.3; }
          else { this.state = 'featherWU'; this.t = 0.5; }
          this.side = -this.side;
        }
        break;
      }
      case 'swoopWU':
        this.vx = approach(this.vx, 0, 500 * dt); this.vy = approach(this.vy, -30, 300 * dt); this.t -= dt; this.faceP(world);
        if (this.t <= 0) {
          this.state = 'swoop'; this.t = 1.1;
          const dx = p.cx - this.cx, dy = p.cy - this.cy, l = Math.hypot(dx, dy) || 1;
          const s = 300 * this.speedMul();
          this.vx = dx / l * s; this.vy = dy / l * s;
          Audio2.sfx('whoosh');
        }
        break;
      case 'swoop':
        this.t -= dt;
        if (this.onGround || this.t <= 0 || this.y + this.h > ground - 4) { this.state = 'rise'; this.t = 0.9; }
        break;
      case 'rise':
        this.t -= dt;
        this.vx = approach(this.vx, 0, 300 * dt);
        this.vy = approach(this.vy, clamp((hoverY - this.y) * 3, -170, 170), 600 * dt);
        if (this.t <= 0) { this.state = 'move'; this.t = rand(1.2, 1.8) / this.speedMul(); }
        break;
      case 'bombs':
        this.vy = approach(this.vy, clamp((hoverY - 10 - this.y) * 3, -150, 150), 400 * dt);
        this.bombT -= dt;
        if (this.bombT <= 0 && this.bombs > 0) {
          this.bombs--; this.bombT = 0.35;
          world.addProj(new Proj('bomb', this.cx, this.y + this.h, this.vx * 0.3, 0, 'e', this.bdmg()));
        }
        if (this.x < this.arena.x1 + 12 || this.x + this.w > this.arena.x2 - 12) this.vx = -this.vx;
        if (this.bombs <= 0 && this.bombT <= 0) { this.state = 'move'; this.t = 1.2; }
        break;
      case 'featherWU':
        this.vx = approach(this.vx, 0, 400 * dt); this.vy = approach(this.vy, 0, 400 * dt); this.t -= dt; this.faceP(world);
        if (this.t <= 0) {
          const n = this.phase === 2 ? 5 : 3;
          const base = Math.atan2(p.cy - this.cy, p.cx - this.cx);
          for (let i = 0; i < n; i++) {
            const a = base + (i - (n - 1) / 2) * 0.22;
            world.addProj(new Proj('feather', this.cx, this.cy, Math.cos(a) * 200, Math.sin(a) * 200, 'e', this.bdmg(0.8)));
          }
          Audio2.sfx('shoot');
          this.state = 'move'; this.t = 1.4;
        }
        break;
      default: this.state = 'move'; this.t = 1;
    }
    world.level.move(this, dt);
  }
  draw(ctx, cam, t) {
    const x = Math.round(this.cx - cam.x), y = Math.round(this.y + this.h - cam.y);
    let pose;
    if (this.dead || this.state === 'stunned') pose = this.dead ? Poses.ko() : Poses.hurt();
    else if (this.state === 'swoop') { pose = Poses.dive(); }
    else pose = Poses.fall();
    const flap = this.state === 'stunned' || this.dead ? 0.3 : Math.sin(t * (this.state === 'swoop' ? 4 : 10));
    const drawWings = (c, wp, f) => {
      const [sx, sy] = wp.sh;
      for (const side of [-1, 1]) {
        const tipX = sx - f * 6 + side * 34, tipY = sy - 10 + flap * 12 * side * side;
        c.fillStyle = '#2a2e34';
        c.beginPath(); c.moveTo(sx, sy); c.lineTo(tipX, tipY); c.lineTo(tipX - side * 4, tipY + 8); c.lineTo(sx + side * 4, sy + 10); c.closePath(); c.fill();
        c.fillStyle = '#6a7482';
        for (let i = 1; i < 6; i++) {
          const u = i / 6;
          const px = sx + (tipX - sx) * u, py = sy + (tipY - sy) * u;
          c.fillRect(Math.round(px), Math.round(py), 2, 5 + i);
        }
        c.fillStyle = '#50ff60';
        c.fillRect(Math.round(tipX) - 1, Math.round(tipY), 2, 2);
      }
    };
    Rig.draw(ctx, x, y, this.facing, pose, this.flash > 0 ? FLASH_PAL : this.pal, { scale: this.scale, extraBack: drawWings });
    if (this.state === 'swoopWU' && Math.floor(t * 16) % 2) { ctx.fillStyle = '#ff4040'; ctx.fillRect(x - 1, y - 34, 2, 4); }
    this.drawStun(ctx, x, y - 30, t);
  }
}

// ---- Jefe 4: Mysterio (enjambre de drones) ----
class MysterioSwarm extends Boss {
  constructor(x, y) {
    super('mysterio', x, y, { name: 'MYSTERIO (DRONES)', w: 14, h: 10, scale: 1, hp: 55, dmg: 9, webNeed: 2,
      pal: THUG_PALS[0] });
    this.fly = true; this.mysterio = true; this.decoys = []; this.shuffleT = 3; this.fireT = 2; this.slot = 0; this.alpha = 1;
  }
  hurtbox() { return { x: this.x - 3, y: this.y - 3, w: this.w + 6, h: this.h + 6 }; }
  start(world) {
    this.spawnDecoys(world, 2);
  }
  spawnDecoys(world, n) {
    for (const d of this.decoys) if (!d.dead) { d.remove = true; d.dead = true; }
    this.decoys = [];
    for (let i = 0; i < n; i++) {
      const d = new Enemy('decoy', this.x + rand(-60, 60), this.y);
      d.mysterio = true; d.arena = this.arena; d.aggro = true; d.state = 'chase'; d.noReward = true;
      d.cd = rand(1, 3);
      this.decoys.push(d);
      world.enemies.push(d);
    }
  }
  onPhase2(world) {
    this.spawnDecoys(world, 4);
    world.illusion = 1;
  }
  onStun() { this.fly = false; }
  update(dt, world) {
    if (this.state === 'wait') { this.common(dt, world); return; }
    super.update(dt, world);
    // reponer señuelos
    this.decoys = this.decoys.filter((d) => !d.remove);
    if (!this.dead && this.state !== 'stunned') {
      this.respawnT = (this.respawnT || 0) + dt;
      const want = this.phase === 2 ? 4 : 2;
      if (this.decoys.filter((d) => !d.dead).length < want && this.respawnT > 3) {
        this.respawnT = 0;
        const d = new Enemy('decoy', this.x + rand(-40, 40), this.y);
        d.mysterio = true; d.arena = this.arena; d.aggro = true; d.state = 'chase'; d.noReward = true; d.cd = 2;
        this.decoys.push(d); world.enemies.push(d);
        world.particles.burst(d.cx, d.cy, 10, '#60ff90', 60);
      }
    }
    if (this.dead) for (const d of this.decoys) { if (!d.dead) { d.dead = true; d.remove = true; world.particles.burst(d.cx, d.cy, 10, '#60ff90', 60); } }
  }
  ai(dt, world) {
    const p = world.player;
    const ground = world.level.groundY;
    this.fly = true;
    this.shuffleT -= dt;
    this.fireT -= dt;
    this.t -= dt;
    // moverse entre puntos
    if (this.t <= 0 || !this.target) {
      this.t = rand(1.2, 2.2) / this.speedMul();
      this.target = { x: clamp(p.cx + rand(-120, 120), this.arena.x1 + 20, this.arena.x2 - 30), y: ground - rand(70, 130) };
    }
    this.vx = approach(this.vx, clamp((this.target.x - this.cx) * 2, -120, 120), 300 * dt);
    this.vy = approach(this.vy, clamp((this.target.y - this.cy) * 2, -120, 120), 300 * dt);
    this.faceP(world);
    if (this.state === 'windup') {
      this.wT -= dt;
      if (this.wT <= 0) {
        const ox = this.cx, oy = this.y + this.h;
        const dx = p.cx - ox, dy = p.cy - oy, l = Math.hypot(dx, dy) || 1;
        const n = this.phase === 2 ? 3 : 1;
        for (let i = 0; i < n; i++) {
          const a = Math.atan2(dy, dx) + (i - (n - 1) / 2) * 0.25;
          world.addProj(new Proj('laser', ox, oy, Math.cos(a) * 220, Math.sin(a) * 220, 'e', this.bdmg()));
        }
        Audio2.sfx('laser');
        this.state = 'move';
        this.fireT = rand(1.6, 2.4) / this.speedMul();
      }
    } else if (this.fireT <= 0) { this.state = 'windup'; this.wT = 0.7; }
    // barajar: todos los drones intercambian posiciones
    if (this.shuffleT <= 0) {
      this.shuffleT = this.phase === 2 ? 2.4 : 3.4;
      const live = this.decoys.filter((d) => !d.dead);
      if (live.length) {
        const d = pick(live);
        const tx = d.x, ty = d.y;
        d.x = this.x; d.y = this.y; this.x = tx; this.y = ty;
        world.particles.burst(this.cx, this.cy, 8, '#60ff90', 50);
        world.particles.burst(d.cx, d.cy, 8, '#60ff90', 50);
        Audio2.sfx('whoosh');
      }
    }
    world.level.move(this, dt);
  }
  draw(ctx, cam, t) {
    const x = Math.round(this.cx - cam.x), y = Math.round(this.y - cam.y);
    if (this.dead) { this.drawDrone(ctx, x, y, t); return; }
    this.drawDrone(ctx, x, y, t);
    this.drawStun(ctx, x, y - 6, t);
  }
  // Ilusión gigante de Mysterio al fondo
  drawIllusion(ctx, cam, t, arena) {
    if (this.dead) return;
    const cx = Math.round((arena.x1 + arena.x2) / 2 - cam.x), base = Math.round(world_groundScreen(cam, arena));
    ctx.globalAlpha = 0.18 + Math.sin(t * 2) * 0.05;
    ctx.fillStyle = '#6a3a8a'; ctx.fillRect(cx - 44, base - 110, 88, 110);
    ctx.fillStyle = '#3a8a4a'; ctx.fillRect(cx - 26, base - 110, 52, 80);
    ctx.fillStyle = '#d0e8ff'; ctx.beginPath(); ctx.arc(cx, base - 132, 24, 0, TAU); ctx.fill();
    ctx.fillStyle = '#50ff80'; ctx.beginPath(); ctx.arc(cx, base - 132, 18 + Math.sin(t * 5) * 2, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }
}
function world_groundScreen(cam, arena) { return (arena.groundY || 440) - cam.y; }

// ---- Jefe 5: Escorpión ----
class Scorpion extends Boss {
  constructor(x, y) {
    super('scorpion', x, y, { name: 'ESCORPIÓN', w: 14, h: 29, scale: 1.3, hp: 85, dmg: 14,
      pal: makePal({ head: '#2e7a3a', hair: '#1a4a22', torso: '#2e7a3a', torsoLow: '#1a4a22', arm: '#2e7a3a', arm2: '#1a4a22', hand: '#90a090', leg: '#1a4a22', boot: '#2e7a3a', face: 'visor', eye: '#90ff60', outline: '#08140a' }) });
    this.tailExt = 0; this.riftT = 5;
  }
  onPhase2(world) {
    if (this.type !== 'scorpion') return;
    world.bubble('gargan', '¡El fragmento... me hace más fuerte!');
    this.pal = makePal({ head: '#3a9a4a', hair: '#1a5a2a', torso: '#3a9a4a', torsoLow: '#1a5a2a', arm: '#3a9a4a', arm2: '#1a5a2a', hand: '#b0ffb0', leg: '#1a5a2a', boot: '#3a9a4a', face: 'visor', eye: '#ffffff', outline: '#08140a' });
  }
  ai(dt, world) {
    const p = world.player, adx = Math.abs(p.cx - this.cx);
    this.contactDmg = this.state === 'leap' && this.vy > 0;
    this.tailExt = approach(this.tailExt, this.state === 'stab' ? 1 : 0, dt * 8);
    if (this.phase === 2 && !this.noRift) {
      this.riftT -= dt;
      if (this.riftT <= 0) {
        this.riftT = rand(4, 6);
        for (let i = 0; i < 3; i++) {
          const x = clamp(p.cx + rand(-100, 100), this.arena.x1 + 10, this.arena.x2 - 10);
          const o = new Proj('riftorb', x, world.cam.y - 10 - i * 30, 0, 60, 'e', this.bdmg(0.8));
          o.warnY = world.level.groundY;
          world.addProj(o);
        }
      }
    }
    switch (this.state) {
      case 'move': {
        this.faceP(world); this.t -= dt;
        let want = 0;
        if (adx > 70) want = this.facing; else if (adx < 36) want = -this.facing;
        this.vx = approach(this.vx, want * 72 * this.speedMul(), 400 * dt);
        if (this.t <= 0) {
          const r = Math.random();
          if (adx < 80 && r < 0.4) { this.state = 'stabWU'; this.t = 0.55 / this.speedMul(); }
          else if (adx < 80 && r < 0.7) { this.state = 'sweepWU'; this.t = 0.5 / this.speedMul(); }
          else if (r < 0.85) { this.state = 'acidWU'; this.t = 0.5; }
          else { this.state = 'leapWU'; this.t = 0.4; }
        }
        break;
      }
      case 'stabWU':
        this.faceP(world); this.vx = approach(this.vx, 0, 600 * dt); this.t -= dt;
        if (this.t <= 0) { this.state = 'stab'; this.t = 0.28; this.hitDone = false; Audio2.sfx('whoosh'); }
        break;
      case 'stab': {
        this.t -= dt;
        const box = { x: this.facing > 0 ? this.cx + 6 : this.cx - 64, y: this.y + 4, w: 58, h: 14 };
        if (!this.hitDone && overlap(box, p.hurtbox())) { this.hitDone = true; world.damagePlayer(this.bdmg(1.1), this.cx, this.z); }
        if (this.t <= 0) { this.state = 'recover'; this.t = 0.6; }
        break;
      }
      case 'sweepWU':
        this.vx = 0; this.t -= dt;
        if (this.t <= 0) { this.state = 'sweep'; this.t = 0.3; this.hitDone = false; Audio2.sfx('whoosh'); }
        break;
      case 'sweep': {
        this.t -= dt;
        const box = { x: this.cx - 52, y: this.y + this.h - 12, w: 104, h: 12 };
        if (!this.hitDone && overlap(box, p.hurtbox())) { this.hitDone = true; world.damagePlayer(this.bdmg(0.9), this.cx, this.z); }
        if (this.t <= 0) { this.state = 'recover'; this.t = 0.5; }
        break;
      }
      case 'acidWU':
        this.faceP(world); this.vx = approach(this.vx, 0, 600 * dt); this.t -= dt;
        if (this.t <= 0) {
          const n = this.phase === 2 ? 3 : 1;
          for (let i = 0; i < n; i++) {
            const tx = p.cx + (i - (n - 1) / 2) * 40;
            const vx = clamp((tx - this.cx) / 0.74, -320, 320);
            world.addProj(new Proj(this.projKind || 'acid', this.cx, this.y + 6, vx, -260, 'e', this.bdmg(0.8)));
          }
          Audio2.sfx('shoot');
          this.state = 'recover'; this.t = 0.6;
        }
        break;
      case 'leapWU':
        this.faceP(world); this.vx = 0; this.t -= dt;
        if (this.t <= 0) { this.state = 'leap'; this.vy = -380; this.onGround = false; this.vx = clamp((p.cx - this.cx) / 0.8, -240, 240); Audio2.sfx('jump'); }
        break;
      case 'leap':
        if (this.onGround && this.vy >= 0) {
          this.vx = 0; world.shake(4); Audio2.sfx('heavy'); world.particles.dust(this.cx, this.y + this.h, 8);
          if (this.phase === 2) for (const d of [-1, 1]) world.addProj(new Proj('wave', this.cx + d * 10, this.y + this.h - 6, d * 180, 0, 'e', this.bdmg(0.7)));
          this.state = 'recover'; this.t = 0.6;
        }
        break;
      case 'recover':
        this.vx = approach(this.vx, 0, 500 * dt); this.t -= dt;
        if (this.t <= 0) { this.state = 'move'; this.t = rand(0.7, 1.2) / this.speedMul(); }
        break;
      default: this.state = 'move';
    }
    this.ground(dt, world);
  }
  draw(ctx, cam, t) {
    const x = Math.round(this.cx - cam.x), y = Math.round(this.y + this.h - cam.y);
    let pose;
    if (this.dead) pose = Poses.ko();
    else switch (this.state) {
      case 'stabWU': case 'acidWU': pose = Poses.windup(); break;
      case 'stab': pose = Poses.punch1(); break;
      case 'sweepWU': case 'sweep': pose = Poses.crouch(); break;
      case 'leapWU': pose = Poses.crouch(); break;
      case 'leap': pose = this.vy < 0 ? Poses.jump() : Poses.slam(); break;
      case 'stunned': pose = Poses.hurt(); break;
      case 'roar': pose = Poses.cheer(t); break;
      default: pose = Math.abs(this.vx) > 8 ? Poses.run(this.anim * 8) : Poses.idle(t);
    }
    if (this.phase === 2 && !this.dead) {
      ctx.fillStyle = 'rgba(100,255,140,' + (0.12 + Math.sin(t * 8) * 0.06) + ')';
      ctx.fillRect(x - 16, y - 44, 32, 46);
    }
    const self = this;
    const tail = (c, wp, f, s) => {
      const hip = wp.hip;
      const ext = self.tailExt;
      const sweep = self.state === 'sweep' || self.state === 'sweepWU';
      const n = 9;
      let px = hip[0], py = hip[1];
      for (let i = 1; i <= n; i++) {
        const u = i / n;
        let tx, ty;
        if (sweep) { tx = hip[0] - f * (u * 30) * Math.cos(t * 20); ty = hip[1] + u * 12; }
        else {
          const curlX = -f * Math.sin(u * Math.PI) * 18, curlY = -u * 34;
          const stabX = f * u * 58, stabY = -4 - u * 4;
          tx = hip[0] + curlX * (1 - ext) + stabX * ext;
          ty = hip[1] + curlY * (1 - ext) + stabY * ext;
        }
        c.fillStyle = '#08140a'; c.fillRect(Math.round(tx) - 2, Math.round(ty) - 2, 5, 5);
        c.fillStyle = i === n ? '#e0e0a0' : (i % 2 ? '#2e7a3a' : '#1a4a22'); c.fillRect(Math.round(tx) - 1, Math.round(ty) - 1, 3, 3);
        px = tx; py = ty;
      }
      c.fillStyle = self.phase === 2 ? '#90ff90' : '#e0e0a0';
      c.fillRect(Math.round(px) + f * 2, Math.round(py), 3, 2);
    };
    const wp = Rig.draw(ctx, x, y, this.facing, pose, this.flash > 0 ? FLASH_PAL : this.pal, { scale: this.scale, extraBack: tail });
    if (this.state === 'stabWU' || this.state === 'sweepWU') {
      if (Math.floor(t * 16) % 2) { ctx.fillStyle = '#ff4040'; ctx.fillRect(wp.head[0] - 1, wp.head[1] - 12, 2, 4); }
    }
    this.drawStun(ctx, wp.head[0], wp.head[1] - 10, t);
  }
}



// ---------------------------------------------------------------------------
// Proyectiles
// ---------------------------------------------------------------------------
class Proj {
  constructor(kind, x, y, vx, vy, owner, dmg) {
    this.kind = kind; this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.owner = owner; this.dmg = dmg || 0;
    this.life = { darkweb: 2, spot: 3, redweb: 2.5, web: 0.7, bullet: 2, orb: 3, laser: 2, shock: 3, wave: 2.4, bomb: 4, feather: 2.5, acid: 3, riftorb: 6 }[kind] || 2;
    this.g = { bomb: 600, acid: 700, redweb: 700, spot: 500, riftorb: 0 }[kind] || 0;
    this.r = { darkweb: 4, spot: 5, redweb: 4, web: 4, bullet: 2, orb: 4, laser: 2, shock: 6, wave: 6, bomb: 4, feather: 3, acid: 4, riftorb: 6 }[kind] || 3;
    this.dead = false; this.t = 0; this.z = undefined;
  }
  box() { return { x: this.x - this.r, y: this.y - this.r, w: this.r * 2, h: this.r * 2 }; }
  update(dt, world) {
    this.t += dt; this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    this.vy += this.g * dt;
    this.x += this.vx * dt; this.y += this.vy * dt;
    const lv = world.level;
    if (this.kind === 'wave') {
      const s = lv.surfaceY(this.x, this.y - 14);
      if (Math.abs(s - (this.y + 6)) > 10) { this.dead = true; return; }
      this.y = s - 6;
      if (Math.floor(this.t * 30) % 2) world.particles.spark(this.x, this.y + 4, this.dmg > 0 ? '#80d0ff' : '#90ff90', 1);
    } else if (lv.pointSolid(this.x, this.y, false, false) || this.y > lv.killY) {
      if (this.kind === 'bomb' || this.kind === 'riftorb') this.explode(world);
      else if (this.kind === 'acid' || this.kind === 'redweb' || this.kind === 'spot') { world.particles.burst(this.x, this.y, 8, '#90ff60', 60); this.dead = true; }
      else { world.particles.burst(this.x, this.y, 4, this.owner === 'p' ? '#ffffff' : '#ffe060', 50); this.dead = true; }
      return;
    }
    if (this.owner === 'p') {
      for (const e of world.enemies) {
        if (e.dead || !e.hittable()) continue;
        if (Math.abs((e.z || 0) - (this.z || 0)) > LANE + 2) continue;
        if (overlap(this.box(), e.hurtbox())) {
          e.web(world.player.webStun, world);
          if (!e.isBoss) e.takeHit(0.5, sign(this.vx) * 40, 0, false, world);
          Audio2.sfx('webhit');
          world.stats.webs++;
          this.dead = true;
          return;
        }
      }
      if (world.webObjects(this)) { this.dead = true; return; }
    } else {
      const p = world.player;
      if (overlap(this.box(), p.hurtbox()) && Math.abs((this.z || 0) - p.z) <= LANE + 2) {
        if (this.kind === 'bomb' || this.kind === 'riftorb') { this.explode(world); return; }
        if (world.damagePlayer(this.dmg, this.x, this.z)) { this.dead = true; world.particles.burst(this.x, this.y, 5, '#ff8040', 60); }
      }
    }
  }
  explode(world) {
    this.dead = true;
    Audio2.sfx('explode'); world.shake(4);
    world.particles.burst(this.x, this.y, 16, '#ffa040', 120);
    world.particles.burst(this.x, this.y, 8, '#606060', 60);
    const p = world.player;
    if (dist(this.x, this.y, p.cx, p.cy) < 28 && Math.abs((this.z || 0) - p.z) < 16) world.damagePlayer(this.dmg, this.x);
  }
  draw(ctx, cam, t) {
    const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y);
    switch (this.kind) {
      case 'web':
        ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 2, y - 2, 5, 5);
        ctx.fillStyle = '#c8c8d0'; ctx.fillRect(x - 2 - sign(this.vx) * 6, y, 6, 1);
        break;
      case 'bullet': ctx.fillStyle = '#ffe060'; ctx.fillRect(x - 2, y - 1, 4, 2); break;
      case 'orb':
        ctx.fillStyle = Math.floor(t * 20) % 2 ? '#e0a0ff' : '#a040ff'; ctx.fillRect(x - 3, y - 3, 7, 7);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 1, y - 1, 3, 3);
        break;
      case 'laser': {
        ctx.strokeStyle = this.fake ? '#60ff90' : '#ff4040'; ctx.lineWidth = 2;
        const l = Math.hypot(this.vx, this.vy) || 1;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - this.vx / l * 8, y - this.vy / l * 8); ctx.stroke();
        break;
      }
      case 'shock':
        ctx.fillStyle = 'rgba(120,200,255,0.4)'; ctx.fillRect(x - 7, y - 7, 14, 14);
        ctx.fillStyle = Math.floor(t * 30) % 2 ? '#ffffff' : '#80d0ff'; ctx.fillRect(x - 4, y - 4, 8, 8);
        break;
      case 'wave':
        ctx.fillStyle = this.dmg > 0 ? 'rgba(128,208,255,0.8)' : 'rgba(144,255,144,0.8)';
        for (let i = 0; i < 4; i++) ctx.fillRect(x - 6 + i * 3, y + 6 - (4 + (i % 2) * 5), 2, 4 + (i % 2) * 5);
        break;
      case 'bomb':
        ctx.fillStyle = '#202020'; ctx.fillRect(x - 3, y - 3, 6, 6);
        ctx.fillStyle = Math.floor(t * 12) % 2 ? '#ff3030' : '#ffe060'; ctx.fillRect(x - 1, y - 5, 2, 2);
        break;
      case 'feather':
        ctx.fillStyle = '#c0c8d0'; ctx.fillRect(x - 3, y - 1, 6, 2); ctx.fillStyle = '#50ff60'; ctx.fillRect(x - 1, y - 1, 2, 2);
        break;
      case 'acid':
        ctx.fillStyle = '#90ff60'; ctx.fillRect(x - 3, y - 3, 6, 6); ctx.fillStyle = '#e0ffb0'; ctx.fillRect(x - 1, y - 2, 2, 2);
        break;
      case 'darkweb':
        ctx.fillStyle = '#16141a'; ctx.fillRect(x - 3, y - 3, 7, 7);
        ctx.fillStyle = '#e06020'; ctx.fillRect(x - 1, y - 1, 3, 3);
        break;
      case 'redweb':
        ctx.fillStyle = '#ff3040'; ctx.fillRect(x - 3, y - 3, 6, 6); ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 1, y - 1, 2, 2);
        break;
      case 'spot':
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, y, 6, 0, TAU); ctx.fill();
        ctx.fillStyle = '#000000'; ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU); ctx.fill();
        break;
      case 'riftorb':
        ctx.fillStyle = 'rgba(80,255,140,0.35)'; ctx.fillRect(x - 8, y - 8, 16, 16);
        ctx.fillStyle = '#b0ffc0'; ctx.fillRect(x - 4, y - 4, 8, 8);
        // aviso en el suelo
        ctx.fillStyle = Math.floor(t * 10) % 2 ? '#50ff80' : '#208040';
        { const gy = Math.round(this.warnY !== undefined ? this.warnY - cam.y : H - 20); ctx.fillRect(x - 8, gy, 16, 2); }
        break;
      default: break;
    }
  }
}

// ---------------------------------------------------------------------------
// Objetos recogibles
// ---------------------------------------------------------------------------
class Pickup {
  constructor(kind, x, y) {
    this.kind = kind; this.x = x; this.y = y; this.vx = rand(-40, 40); this.vy = -150; this.w = 6; this.h = 6;
    this.life = 12; this.dead = false; this.t = 0; this.z = 0;
  }
  update(dt, world) {
    this.t += dt; this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    const p = world.player;
    const d = dist(p.cx, p.cy, this.x + 3, this.y + 3);
    if (d < 50 && this.t > 0.35) {
      this.vx = (p.cx - this.x) * 6; this.vy = (p.cy - this.y) * 6;
      this.z = approach(this.z, p.z, 120 * dt);
      this.x += this.vx * dt; this.y += this.vy * dt;
    } else {
      this.vy = Math.min(this.vy + GRAV * dt, 300);
      this.vx = approach(this.vx, 0, 60 * dt);
      world.level.move(this, dt);
    }
    if (d < 10 && this.t > 0.2 && Math.abs(this.z - p.z) < 12) {
      this.dead = true;
      if (this.kind === 'health') {
        p.hp = Math.min(p.maxHp, p.hp + 15);
        world.float('+15', p.cx, p.y - 6, '#60ff80');
        Audio2.sfx('heal');
      } else {
        world.addTech(1, false);
        Audio2.sfx('coin');
      }
    }
  }
  draw(ctx, cam, t) {
    if (this.life < 3 && Math.floor(t * 10) % 2) return;
    const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y + Math.sin(t * 5) * 1);
    if (this.kind === 'health') {
      ctx.fillStyle = '#140a12'; ctx.fillRect(x - 1, y - 1, 8, 8);
      ctx.fillStyle = '#40e060'; ctx.fillRect(x + 2, y, 2, 6); ctx.fillRect(x, y + 2, 6, 2);
    } else drawTechIcon(ctx, x, y, t);
  }
}

function drawTechIcon(ctx, x, y, t) {
  ctx.fillStyle = '#140a12'; ctx.fillRect(x - 1, y - 1, 8, 8);
  ctx.fillStyle = Math.floor(t * 6) % 2 ? '#ffe070' : '#e0b030'; ctx.fillRect(x, y, 6, 6);
  ctx.fillStyle = '#6a4a10'; ctx.fillRect(x + 2, y + 2, 2, 2);
}

// ---------------------------------------------------------------------------
// Partículas
// ---------------------------------------------------------------------------
class Particles {
  constructor() { this.list = []; }
  add(x, y, vx, vy, life, color, size = 1, g = 0) {
    if (this.list.length > 400) this.list.shift();
    this.list.push({ x, y, vx, vy, life, max: life, color, size, g });
  }
  spark(x, y, color, n = 3) { for (let i = 0; i < n; i++) this.add(x, y, rand(-60, 60), rand(-80, 20), rand(0.15, 0.35), color, 1, 200); }
  burst(x, y, n, color, sp = 100) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = rand(sp * 0.3, sp);
      this.add(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.2, 0.5), color, randi(1, 2), 150);
    }
  }
  dust(x, y, n) { for (let i = 0; i < n; i++) this.add(x + rand(-5, 5), y - 1, rand(-40, 40), rand(-30, -5), rand(0.25, 0.5), '#b8b0a0', 2, 20); }
  hit(x, y, heavy) {
    const c = heavy ? '#ffe060' : '#ffffff';
    for (let i = 0; i < (heavy ? 10 : 6); i++) {
      const a = rand(0, TAU), s = rand(60, heavy ? 200 : 140);
      this.add(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.1, 0.25), c, heavy ? 2 : 1, 0);
    }
  }
  update(dt) {
    const l = this.list;
    for (let i = l.length - 1; i >= 0; i--) {
      const p = l[i];
      p.life -= dt;
      if (p.life <= 0) { l.splice(i, 1); continue; }
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    }
  }
  draw(ctx, cam) {
    for (const p of this.list) {
      const x = Math.round(p.x - cam.x), y = Math.round(p.y - cam.y);
      if (x < -4 || x > W + 4 || y < -4 || y > H + 4) continue;
      ctx.fillStyle = p.color;
      ctx.fillRect(x, y, p.size, p.size);
    }
  }
}

// ---------------------------------------------------------------------------
// Jefes de Rompecánones
// ---------------------------------------------------------------------------
class Sandman extends ExoBrute {
  constructor(x, y) {
    super(x, y);
    this.type = 'sandman'; this.name = 'HOMBRE DE ARENA';
    this.w = 22; this.h = 44; this.scale = 2.0;
    this.hp = this.maxHp = Math.ceil(50 * DIFF_HP[Game.settings.difficulty]);
    this.pal = makePal({ head: '#c8a878', hair: '#8a6a3a', torso: '#4a7a3a', torsoLow: '#6a5a3a', arm: '#c8a060', arm2: '#b89050', hand: '#d8b070', leg: '#6a5a3a', boot: '#3a2a1a', face: 'human', outline: '#2a1a0a' });
    this.summoned = true;
  }
  drawExtra(ctx, wp, t) {
    ctx.fillStyle = '#2a4a1a';
    for (let i = 0; i < 3; i++) ctx.fillRect(wp.mid[0] - 4, wp.mid[1] - 6 + i * 4, 9, 1);
    ctx.fillStyle = 'rgba(210,180,120,0.7)';
    for (let i = 0; i < 4; i++) ctx.fillRect(Math.round(wp.hip[0] + Math.sin(t * 7 + i) * 10), Math.round(wp.hip[1] + 8 + (i * 5 + t * 30) % 14), 2, 2);
  }
}

class Venom extends ExoBrute {
  constructor(x, y) {
    super(x, y);
    this.type = 'venom'; this.name = 'VENOM';
    this.hp = this.maxHp = Math.ceil(70 * DIFF_HP[Game.settings.difficulty]);
    this.scale = 1.6; this.w = 16; this.h = 36;
    this.pal = makePal({ head: '#101018', hair: '#101018', torso: '#101018', arm: '#101018', leg: '#101018', boot: '#101018', face: 'venom', eye: '#ffffff', outline: '#000000' });
    this.summoned = true;
  }
  chooseAttack(adx) {
    const r = Math.random();
    if (adx < 42 && r < 0.4) { this.state = 'punchWU'; this.t = 0.6 / this.speedMul(); }
    else if (adx < 90 && r < 0.75) { this.state = 'whipWU'; this.t = 0.55 / this.speedMul(); }
    else if (r < 0.88) { this.state = 'leapWU'; this.t = 0.45; }
    else { this.state = 'chargeWU'; this.t = 0.55; }
  }
  aiExtra(dt, world) {
    if (this.state === 'whipWU') {
      this.faceP(world); this.vx = 0; this.t -= dt;
      if (this.t <= 0) { this.state = 'whip'; this.t = 0.3; this.hitDone = false; Audio2.sfx('whoosh'); }
    } else if (this.state === 'whip') {
      this.t -= dt;
      const box = { x: this.facing > 0 ? this.cx : this.cx - 78, y: this.y + 8, w: 78, h: 14 };
      if (!this.hitDone && overlap(box, world.player.hurtbox())) { this.hitDone = true; world.damagePlayer(this.bdmg(), this.cx, this.z); }
      if (this.t <= 0) { this.state = 'recover'; this.t = 0.6; }
    } else return false;
    this.ground(dt, world);
    return true;
  }
  drawExtra(ctx, wp, t) {
    ctx.fillStyle = '#e8e8f0';
    const [x, y] = wp.mid;
    ctx.fillRect(x - 1, y - 8, 3, 12); ctx.fillRect(x - 6, y - 7, 5, 2); ctx.fillRect(x + 2, y - 7, 5, 2); ctx.fillRect(x - 6, y - 1, 5, 2); ctx.fillRect(x + 2, y - 1, 5, 2);
    if (this.state === 'whip' || this.state === 'whipWU') {
      const [hx, hy] = wp.h2, f = this.facing;
      const len = this.state === 'whip' ? 76 : 12;
      ctx.fillStyle = '#000000'; thickLine(ctx, hx, hy, hx + f * len, hy + Math.sin(t * 30) * 3, 4);
      ctx.fillStyle = '#3a3a4a'; thickLine(ctx, hx, hy - 1, hx + f * len, hy - 1 + Math.sin(t * 30) * 3, 1);
    }
  }
}

class Rino extends ExoBrute {
  constructor(x, y) {
    super(x, y);
    this.type = 'rino'; this.name = 'RINO';
    this.hp = this.maxHp = Math.ceil(55 * DIFF_HP[Game.settings.difficulty]);
    this.pal = makePal({ head: '#6a6a72', hair: '#6a6a72', torso: '#5a5a62', torsoLow: '#3a3a42', arm: '#6a6a72', arm2: '#5a5a62', hand: '#8a8a92', leg: '#4a4a52', boot: '#2a2a32', face: 'visor', eye: '#ffe060', outline: '#101014' });
    this.summoned = true;
  }
  chooseAttack(adx) {
    if (adx < 40 && Math.random() < 0.4) { this.state = 'punchWU'; this.t = 0.65 / this.speedMul(); }
    else if (Math.random() < 0.7) { this.state = 'chargeWU'; this.t = 0.55; }
    else { this.state = 'leapWU'; this.t = 0.5; }
  }
  drawExtra(ctx, wp) {
    const [hx, hy] = wp.head, f = this.facing;
    ctx.fillStyle = '#e8e8d8';
    ctx.fillRect(hx + f * 5 - 1, hy - 4, 3, 5); ctx.fillRect(hx + f * 7 - 1, hy - 7, 2, 4);
    ctx.fillStyle = '#8a8a92'; ctx.fillRect(wp.sh[0] - 6, wp.sh[1] - 3, 12, 5);
  }
}

class Electro extends Shocker {
  constructor(x, y) {
    super(x, y);
    this.type = 'electro'; this.name = 'ELECTRO';
    this.hp = this.maxHp = Math.ceil(55 * DIFF_HP[Game.settings.difficulty]);
    this.pal = makePal({ head: '#3a8aff', hair: '#3a8aff', torso: '#1a2030', torsoLow: '#12161e', arm: '#1a2030', arm2: '#3a8aff', hand: '#a0e0ff', leg: '#12161e', boot: '#0a0c12', face: 'visor', eye: '#ffffff', outline: '#040810' });
  }
  draw(ctx, cam, t) {
    const x = Math.round(this.cx - cam.x), y = Math.round(this.y + this.h - cam.y);
    ctx.fillStyle = 'rgba(80,170,255,' + (0.12 + Math.sin(t * 20) * 0.06) + ')';
    ctx.fillRect(x - 14, y - 34, 28, 36);
    super.draw(ctx, cam, t);
    if (Math.floor(t * 15) % 3 === 0) {
      ctx.fillStyle = '#c0f0ff';
      let px = x, py = y - 30;
      for (let i = 0; i < 5; i++) { const nx = px + rand(-6, 6), ny = py - 4; thickLine(ctx, px, py, nx, ny, 1); px = nx; py = ny; }
    }
  }
}

class Mancha extends Boss {
  constructor(x, y) {
    super('mancha', x, y, { name: 'LA MANCHA', w: 11, h: 24, scale: 1.1, hp: 58, dmg: 12,
      pal: makePal({ head: '#f0f0f0', hair: '#f0f0f0', torso: '#f0f0f0', arm: '#f0f0f0', leg: '#f0f0f0', boot: '#101010', face: 'spot', eye: '#101010', outline: '#000000' }) });
    this.portals = [];
  }
  ai(dt, world) {
    const p = world.player, adx = Math.abs(p.cx - this.cx);
    this.inv = this.state === 'gone' ? 1 : 0;
    for (const po of this.portals) po.t += dt;
    switch (this.state) {
      case 'move': {
        this.faceP(world); this.t -= dt;
        this.vx = approach(this.vx, (adx > 60 ? this.facing : adx < 30 ? -this.facing : 0) * 55 * this.speedMul(), 300 * dt);
        if (this.t <= 0) {
          const r = Math.random();
          if (r < 0.45) {
            this.state = 'portalWU'; this.t = 0.8 / this.speedMul();
            const n = this.phase === 2 ? 2 : 1;
            this.portals = [];
            for (let i = 0; i < n; i++) this.portals.push({ x: p.cx + (i ? rand(-50, 50) : 0), y: p.y + 8, t: 0 });
          } else if (r < 0.75) { this.state = 'throwWU'; this.t = 0.5; }
          else { this.state = 'gone'; this.t = 0.6; world.particles.burst(this.cx, this.cy, 14, '#000000', 90); Audio2.sfx('whoosh'); }
        }
        break;
      }
      case 'portalWU':
        this.vx = 0; this.t -= dt;
        if (this.t <= 0) { this.state = 'portal'; this.t = 0.28; this.hitDone = false; Audio2.sfx('heavy'); }
        break;
      case 'portal':
        this.t -= dt;
        for (const po of this.portals) {
          const box = { x: po.x - 12, y: po.y - 10, w: 24, h: 22 };
          if (!this.hitDone && overlap(box, p.hurtbox())) { this.hitDone = true; world.damagePlayer(this.bdmg(), po.x); }
        }
        if (this.t <= 0) { this.portals = []; this.state = 'recover'; this.t = 0.7; }
        break;
      case 'throwWU':
        this.faceP(world); this.vx = 0; this.t -= dt;
        if (this.t <= 0) {
          const n = this.phase === 2 ? 3 : 2;
          for (let i = 0; i < n; i++) {
            const tx = p.cx + (i - (n - 1) / 2) * 36;
            world.addProj(new Proj('spot', this.cx, this.y + 6, clamp((tx - this.cx) / 0.8, -300, 300), -200, 'e', this.bdmg(0.8)));
          }
          Audio2.sfx('shoot');
          this.state = 'recover'; this.t = 0.6;
        }
        break;
      case 'gone':
        this.t -= dt; this.vx = 0;
        if (this.t <= 0) {
          const nx = clamp(p.cx + (Math.random() < 0.5 ? -80 : 80), this.arena.x1 + 20, this.arena.x2 - 30);
          this.x = nx - this.w / 2;
          this.y = world.level.surfaceY(this.cx, world.level.groundY - 60) - this.h;
          world.particles.burst(this.cx, this.cy, 14, '#000000', 90);
          this.state = 'recover'; this.t = 0.45;
        }
        break;
      case 'recover':
        this.vx = approach(this.vx, 0, 400 * dt); this.t -= dt;
        if (this.t <= 0) { this.state = 'move'; this.t = rand(0.7, 1.2) / this.speedMul(); }
        break;
      default: this.state = 'move';
    }
    if (this.state !== 'gone') this.ground(dt, world);
  }
  hittable() { return super.hittable() && this.state !== 'gone'; }
  draw(ctx, cam, t) {
    for (const po of this.portals) {
      const x = Math.round(po.x - cam.x), y = Math.round(po.y - cam.y);
      const r = Math.min(12, po.t * 30);
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(x, y, r + 2, (r + 2) * 0.7, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#000000'; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.7, 0, 0, TAU); ctx.fill();
      if (this.state === 'portal') { ctx.fillStyle = '#f0f0f0'; ctx.fillRect(x - 5, y - 4, 10, 8); ctx.fillStyle = '#101010'; ctx.fillRect(x - 3, y - 2, 2, 2); }
    }
    if (this.state === 'gone' && !this.dead) return;
    const x = Math.round(this.cx - cam.x), y = Math.round(this.y + this.h - cam.y);
    let pose;
    if (this.dead) pose = Poses.ko();
    else switch (this.state) {
      case 'portalWU': pose = Poses.cheer(t); break;
      case 'portal': pose = Poses.punch1(); break;
      case 'throwWU': pose = Poses.windup(); break;
      case 'stunned': pose = Poses.hurt(); break;
      default: pose = Math.abs(this.vx) > 8 ? Poses.run(this.anim * 8) : Poses.idle(t);
    }
    const wp = Rig.draw(ctx, x, y, this.facing, pose, this.flash > 0 ? FLASH_PAL : this.pal, { scale: this.scale });
    ctx.fillStyle = '#101010';
    ctx.fillRect(wp.mid[0] - 2, wp.mid[1] - 3, 3, 3); ctx.fillRect(wp.k2[0] - 1, wp.k2[1] - 1, 2, 2); ctx.fillRect(wp.e1[0] - 1, wp.e1[1], 2, 2);
    this.drawStun(ctx, wp.head[0], wp.head[1] - 9, t);
  }
}

class Miguel extends Scorpion {
  constructor(x, y) {
    super(x, y);
    this.type = 'miguel'; this.name = 'MIGUEL O\'HARA (2099)';
    this.hp = this.maxHp = Math.ceil(78 * DIFF_HP[Game.settings.difficulty]);
    this.scale = 1.2; this.w = 12; this.h = 27;
    this.projKind = 'redweb'; this.noRift = true;
    this.pal = makePal({ head: '#1a2a6a', hair: '#1a2a6a', torso: '#1a2a6a', torsoLow: '#10183a', arm: '#1a2a6a', arm2: '#1a2a6a', hand: '#d01a2a', leg: '#1a2a6a', boot: '#d01a2a', face: 'spider', eye: '#ff3040', emblem: '#d01a2a', outline: '#050818' });
  }
  draw(ctx, cam, t) {
    const x = Math.round(this.cx - cam.x), y = Math.round(this.y + this.h - cam.y);
    let pose;
    if (this.dead) pose = Poses.ko();
    else switch (this.state) {
      case 'stabWU': case 'acidWU': pose = Poses.windup(); break;
      case 'stab': pose = Poses.punch2(); break;
      case 'sweepWU': case 'sweep': pose = Poses.kick(); break;
      case 'leapWU': pose = Poses.crouch(); break;
      case 'leap': pose = this.vy < 0 ? Poses.jump() : Poses.dive(); break;
      case 'stunned': pose = Poses.hurt(); break;
      case 'roar': pose = Poses.cheer(t); break;
      default: pose = Math.abs(this.vx) > 8 ? Poses.run(this.anim * 9) : Poses.idle(t);
    }
    const cape = (c, wp, f) => {
      c.fillStyle = '#d01a2a';
      c.beginPath(); c.moveTo(wp.sh[0], wp.sh[1]); c.lineTo(wp.sh[0] - f * 10, wp.hip[1] + 6 + Math.sin(t * 6) * 2); c.lineTo(wp.sh[0] - f * 3, wp.hip[1] + 4); c.fill();
    };
    const wp = Rig.draw(ctx, x, y, this.facing, pose, this.flash > 0 ? FLASH_PAL : this.pal, { scale: this.scale, extraBack: cape });
    if (this.state === 'stab') {
      ctx.fillStyle = '#ffe0e0';
      for (let i = 0; i < 3; i++) thickLine(ctx, wp.h2[0], wp.h2[1] - 3 + i * 3, wp.h2[0] + this.facing * 26, wp.h2[1] - 6 + i * 4, 1);
    }
    if (this.phase === 2 && !this.dead) {
      ctx.fillStyle = 'rgba(255,40,60,0.15)'; ctx.fillRect(x - 12, y - 36, 24, 38);
    }
    this.drawStun(ctx, wp.head[0], wp.head[1] - 10, t);
  }
}

class Desconocido extends Boss {
  constructor(x, y, final) {
    const n = final ? canonCount() : 0;
    super(final ? 'desconocido4' : 'desconocido0', x, y, { name: 'EL DESCONOCIDO', w: 10, h: 22, scale: 1.05,
      hp: final ? 70 + n * 8 : 44, dmg: final ? 12 + n : 10,
      pal: SUITS.find((s) => s.id === 'cero').palObj });
    this.final = final; this.power = n; this.echoes = false;
  }
  speedMul() { return (this.phase === 2 ? 1.3 : 1) + this.power * 0.05; }
  onPhase2(world) {
    if (!this.final) return;
    world.bubble('desconocido', 'Cada canon que rompiste... me hace más fuerte.');
    if (!this.echoes) {
      this.echoes = true;
      for (let i = 0; i < 1 + Math.min(2, Math.floor(this.power / 2)); i++) {
        const e = world.spawnMinion('thug', this.arena);
        e.pal = this.pal; e.noReward = true;
      }
    }
  }
  ai(dt, world) {
    const p = world.player, adx = Math.abs(p.cx - this.cx);
    this.contactDmg = this.state === 'dash' || (this.state === 'dive' && this.vy > 0);
    switch (this.state) {
      case 'move': {
        this.faceP(world); this.t -= dt;
        let want = 0;
        if (adx > 110) want = this.facing; else if (adx < 50) want = -this.facing;
        this.vx = approach(this.vx, want * 95 * this.speedMul(), 500 * dt);
        if (this.t <= 0) {
          const r = Math.random();
          if (r < 0.3) { this.state = 'webWU'; this.t = 0.45; }
          else if (r < 0.55) { this.state = 'diveWU'; this.t = 0.4; }
          else if (r < 0.8) { this.state = 'dashWU'; this.t = 0.4; }
          else { this.state = 'zipWU'; this.t = 0.5; }
        }
        break;
      }
      case 'webWU':
        this.faceP(world); this.vx = 0; this.t -= dt;
        if (this.t <= 0) {
          const n = this.phase === 2 ? 3 : 2;
          const ox = this.cx + this.facing * 6, oy = this.y + 7;
          const base = Math.atan2(p.cy - oy, p.cx - ox);
          for (let i = 0; i < n; i++) {
            const a = base + (i - (n - 1) / 2) * 0.2;
            world.addProj(new Proj('darkweb', ox, oy, Math.cos(a) * 240, Math.sin(a) * 240, 'e', this.bdmg(0.8)));
          }
          Audio2.sfx('thwip');
          this.state = 'recover'; this.t = 0.5;
        }
        break;
      case 'diveWU':
        this.faceP(world); this.vx = 0; this.t -= dt;
        if (this.t <= 0) { this.state = 'dive'; this.vy = -430; this.onGround = false; this.vx = clamp((p.cx - this.cx) / 0.9, -260, 260); Audio2.sfx('jump'); }
        break;
      case 'dive':
        if (this.onGround && this.vy >= 0) {
          this.vx = 0; world.shake(3); Audio2.sfx('heavy'); world.particles.dust(this.cx, this.y + this.h, 8);
          if (this.phase === 2) for (const d of [-1, 1]) world.addProj(new Proj('wave', this.cx + d * 8, this.y + this.h - 6, d * 170, 0, 'e', this.bdmg(0.7)));
          this.state = 'recover'; this.t = 0.55;
        }
        break;
      case 'dashWU':
        this.faceP(world); this.vx = 0; this.t -= dt;
        if (this.t <= 0) { this.state = 'dash'; this.t = 0.4; this.vx = this.facing * 300 * this.speedMul(); Audio2.sfx('whoosh'); }
        break;
      case 'dash':
        this.t -= dt;
        if (Math.floor(this.anim * 30) % 2) world.particles.spark(this.cx, this.cy, '#e06020', 1);
        if (this.t <= 0 || this.hitWall) { this.state = 'recover'; this.t = 0.6; }
        break;
      case 'zipWU':
        this.vx = 0; this.t -= dt;
        if (this.t <= 0) {
          world.particles.burst(this.cx, this.cy, 10, '#e06020', 80);
          const side = p.facing > 0 ? -1 : 1;
          this.x = clamp(p.cx + side * 26, this.arena.x1 + 10, this.arena.x2 - 20) - this.w / 2;
          this.y = p.y + p.h - this.h;
          this.faceP(world);
          world.particles.burst(this.cx, this.cy, 10, '#e06020', 80);
          Audio2.sfx('thwip');
          this.state = 'punchWU'; this.t = 0.3;
        }
        break;
      case 'punchWU':
        this.vx = 0; this.t -= dt;
        if (this.t <= 0) { this.state = 'punch'; this.t = 0.18; this.hitDone = false; Audio2.sfx('whoosh'); }
        break;
      case 'punch': {
        this.t -= dt;
        const box = { x: this.facing > 0 ? this.cx : this.cx - 22, y: this.y + 3, w: 22, h: 14 };
        if (!this.hitDone && overlap(box, p.hurtbox())) { this.hitDone = true; world.damagePlayer(this.bdmg(), this.cx, this.z); }
        if (this.t <= 0) { this.state = 'recover'; this.t = 0.5; }
        break;
      }
      case 'recover':
        this.vx = approach(this.vx, 0, 500 * dt); this.t -= dt;
        if (this.t <= 0) { this.state = 'move'; this.t = rand(0.6, 1.1) / this.speedMul(); }
        break;
      default: this.state = 'move';
    }
    this.ground(dt, world);
  }
  draw(ctx, cam, t) {
    const x = Math.round(this.cx - cam.x), y = Math.round(this.y + this.h - cam.y);
    if (this.escaped && this.dead) return;
    let pose;
    if (this.dead && !this.escaped) pose = Poses.ko();
    else switch (this.state) {
      case 'webWU': case 'punchWU': pose = Poses.shoot(); break;
      case 'diveWU': pose = Poses.crouch(); break;
      case 'dive': pose = this.vy < 0 ? Poses.flip(this.anim) : Poses.dive(); break;
      case 'dash': case 'punch': pose = Poses.punch1(); break;
      case 'dashWU': pose = Poses.windup(); break;
      case 'zipWU': pose = Poses.crouch(); break;
      case 'stunned': pose = Poses.hurt(); break;
      case 'roar': pose = Poses.cheer(t); break;
      default: pose = Math.abs(this.vx) > 8 ? Poses.run(this.anim * 9) : Poses.idle(t);
    }
    if (this.phase === 2 && !this.dead) {
      ctx.globalAlpha = 0.35;
      Rig.draw(ctx, x + Math.round(Math.sin(t * 20) * 3), y, this.facing, pose, this.pal, { scale: this.scale });
      ctx.globalAlpha = 1;
    }
    const wp = Rig.draw(ctx, x, y, this.facing, pose, this.flash > 0 ? FLASH_PAL : this.pal, { scale: this.scale });
    ctx.globalAlpha = 1;
    if (Math.floor(t * 6) % 2 && !this.dead) { ctx.fillStyle = '#ff8030'; ctx.fillRect(wp.mid[0] + 1, wp.mid[1] - 2, 1, 1); }
    this.drawStun(ctx, wp.head[0], wp.head[1] - 8, t);
  }
}

const BOSS_CLASSES = {
  shocker: Shocker, exo: ExoBrute, vulture: Vulture, mysterio: MysterioSwarm, scorpion: Scorpion,
  sandman: Sandman, venom: Venom, rino: Rino, electro: Electro, mancha: Mancha, miguel: Miguel,
  desconocido0: class extends Desconocido { constructor(x, y) { super(x, y, false); } },
  desconocido4: class extends Desconocido { constructor(x, y) { super(x, y, true); } },
};
