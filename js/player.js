'use strict';
// ---------------------------------------------------------------------------
// Spider-Man
// ---------------------------------------------------------------------------
const GRAV = 950;
const PHYS = {
  run: 122, gAcc: 1100, fric: 1300, aAcc: 650, maxFall: 430, jump: -315, djump: -275,
  wallJumpX: 175, wallJumpY: -290, climb: 85, webLen: 200, swingAcc: 330, swingMax: 400,
};
const ATK = {
  punch1: { dur: 0.24, act: [0.04, 0.12], box: [6, -19, 16, 13], dmg: 1, kx: 70, ky: -40, pose: 'punch1', next: 'punch2' },
  punch2: { dur: 0.24, act: [0.04, 0.12], box: [6, -19, 16, 13], dmg: 1, kx: 80, ky: -40, pose: 'punch2', next: 'kick' },
  kick: { dur: 0.36, act: [0.08, 0.18], box: [4, -17, 21, 13], dmg: 2, kx: 240, ky: -160, pose: 'kick', heavy: true },
  uppercut: { dur: 0.38, act: [0.04, 0.16], box: [2, -32, 17, 30], dmg: 1.5, kx: 40, ky: -340, pose: 'uppercut', heavy: true },
  airkick: { dur: 0.3, act: [0.03, 0.2], box: [3, -15, 19, 15], dmg: 1.5, kx: 160, ky: -80, pose: 'airkick' },
  dive: { dur: 1.2, act: [0, 1.2], box: [-7, -8, 24, 12], dmg: 2, kx: 170, ky: -140, pose: 'dive', heavy: true },
  swingkick: { dur: 0.35, act: [0.02, 0.26], box: [2, -21, 23, 21], dmg: 3, kx: 300, ky: -130, pose: 'swingkick', heavy: true },
};

class Player {
  constructor(x, y) {
    this.w = 10; this.h = 22;
    this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.z = 0;
    this.facing = 1; this.state = 'normal'; this.st = 0;
    this.onGround = false; this.anim = 0; this.runPhase = 0;
    this.attack = null; this.comboNext = null; this.comboT = 0; this.queued = false;
    this.coyote = 0; this.jumpBuf = 0; this.airJumps = 1; this.flipT = 0;
    this.anchor = null; this.rope = 0; this.pendingWeb = 0;
    this.wallDir = 0; this.grabCd = 0; this.lockT = 0;
    this.inv = 0; this.dodgeCd = 0; this.shootCd = 0; this.webRegen = 0;
    this.sense = 0; this.senseDir = 0; this.holdT = 0;
    this.lastSafe = { x, y }; this.safeT = 0;
    this.dropTimer = 0; this.landT = 0; this.wasGround = false;
    this.refreshStats();
    this.hp = this.maxHp; this.focus = 0; this.webs = this.maxWebs;
  }

  refreshStats() {
    const u = Game.save.upgrades;
    this.maxHp = 100 + u.hp * 20;
    this.dmgMul = 1 + u.dmg * 0.25;
    this.webStun = 2.2 + u.web * 0.6;
    this.maxWebs = 5 + u.web;
    this.swingMul = 1 + u.swing * 0.12;
    this.focusMul = 1 + u.focus * 0.3;
    if (this.hp > this.maxHp) this.hp = this.maxHp;
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  get feet() { return this.y + this.h; }

  update(dt, world) {
    const lv = world.level;
    const inp = world.inputEnabled ? Input : null;
    const L = inp && inp.isDown('LEFT'), R = inp && inp.isDown('RIGHT');
    const U = inp && inp.isDown('UP'), Dn = inp && inp.isDown('DOWN');
    const pr = (a) => !!(inp && inp.pressed(a));
    const ix = (R ? 1 : 0) - (L ? 1 : 0);
    this.anim += dt;
    for (const k of ['inv', 'dodgeCd', 'shootCd', 'grabCd', 'lockT', 'coyote', 'jumpBuf', 'flipT', 'comboT', 'dropTimer', 'landT', 'pendingWeb']) {
      if (this[k] > 0) this[k] = Math.max(0, this[k] - dt);
    }
    this.sense = Math.max(0, this.sense - dt);
    // recarga de cartuchos de red
    if (this.webs < this.maxWebs) {
      this.webRegen += dt;
      if (this.webRegen >= 0.8) { this.webRegen = 0; this.webs++; }
    }
    if (pr('JUMP')) this.jumpBuf = 0.12;

    if (this.state === 'dead') {
      this.vy += GRAV * dt; this.vx = approach(this.vx, 0, 300 * dt);
      lv.move(this, dt);
      this.st += dt;
      return;
    }
    if (this.state === 'cutscene') {
      this.vy = Math.min(this.vy + GRAV * dt, PHYS.maxFall);
      this.vx = approach(this.vx, 0, PHYS.fric * dt);
      lv.move(this, dt);
      if (this.anchor) this.anchor = null;
      return;
    }

    // ---- esquiva (disponible en casi todos los estados) ----
    if (pr('DODGE') && this.dodgeCd <= 0 && ['normal', 'wall', 'swing'].includes(this.state)) {
      this.attack = null;
      const dir = ix || this.facing;
      this.facing = dir;
      this.anchor = null;
      this.state = 'dodge'; this.st = 0.28;
      this.inv = Math.max(this.inv, 0.36);
      this.vx = dir * 250; this.vy = this.onGround ? 0 : Math.min(this.vy, -60);
      this.dodgeCd = 0.6;
      Audio2.sfx('dodge');
      if (world.threatNear(this)) world.perfectDodge(this);
      world.particles.dust(this.cx, this.feet, 5);
    }

    // ---- disparo de red ----
    if (pr('SHOOT') && this.shootCd <= 0 && ['normal', 'swing', 'wall'].includes(this.state)) {
      if (this.webs > 0) {
        this.webs--; this.shootCd = 0.3;
        let dy = 0;
        if (U) dy = -0.6; else if (Dn && !this.onGround) dy = 0.6;
        const dir = this.state === 'wall' ? -this.wallDir : this.facing;
        if (this.state === 'wall') this.facing = dir;
        world.shootWeb(this.cx + dir * 6, this.y + 7, dir, dy);
        this.shootPose = 0.2;
        Audio2.sfx('thwip');
      } else {
        world.float('SIN RED', this.cx, this.y - 6, '#a0a0a0');
      }
    }
    if (this.shootPose > 0) this.shootPose -= dt;

    // ---- especial / curación ----
    if (pr('SPECIAL') && ['normal', 'swing'].includes(this.state) && !this.attack) {
      if (this.focus >= 50) {
        if (this.onGround) { this.state = 'charge'; this.holdT = 0; this.st = 0; }
        else this.doSpin(world);
      } else {
        world.float('FOCO INSUFICIENTE', this.cx, this.y - 8, '#e0c040');
        Audio2.sfx('back');
      }
    }

    switch (this.state) {
      case 'normal': this.updNormal(dt, world, ix, U, Dn, pr); break;
      case 'wall': this.updWall(dt, world, ix, U, Dn, pr); break;
      case 'swing': this.updSwing(dt, world, ix, U, Dn, pr); break;
      case 'dodge':
        this.st -= dt;
        this.vy += GRAV * 0.4 * dt;
        lv.move(this, dt);
        if (this.st <= 0) { this.state = 'normal'; this.vx *= 0.5; }
        break;
      case 'hurt':
        this.st -= dt;
        this.vy = Math.min(this.vy + GRAV * dt, PHYS.maxFall);
        if (this.onGround) this.vx = approach(this.vx, 0, 600 * dt);
        lv.move(this, dt);
        if (this.st <= 0) this.state = 'normal';
        break;
      case 'charge':
        this.holdT += dt;
        this.vx = approach(this.vx, 0, PHYS.fric * dt);
        this.vy = Math.min(this.vy + GRAV * dt, PHYS.maxFall);
        lv.move(this, dt);
        if (this.holdT > 0.15 && Math.floor(this.holdT * 30) % 3 === 0) world.particles.spark(this.cx + rand(-8, 8), this.feet - rand(0, 20), '#80ff90', 1);
        if (!Input.isDown('SPECIAL') || !world.inputEnabled) {
          if (this.holdT < 0.6) this.doSpin(world);
          else this.state = 'normal';
        } else if (this.holdT >= 0.6) {
          this.focus -= 50;
          const heal = 35;
          this.hp = Math.min(this.maxHp, this.hp + heal);
          world.float('+' + heal + ' VIDA', this.cx, this.y - 8, '#60ff80');
          Audio2.sfx('heal');
          world.particles.burst(this.cx, this.cy, 14, '#80ff90', 80);
          this.state = 'normal';
        }
        break;
      case 'special':
        this.st -= dt;
        this.vx = approach(this.vx, 0, 400 * dt);
        this.vy = Math.min(this.vy + GRAV * 0.3 * dt, 200);
        lv.move(this, dt);
        if (this.st <= 0) this.state = 'normal';
        break;
      default: this.state = 'normal';
    }

    // ---- ataques activos ----
    if (this.attack) this.updAttack(dt, world);

    // ---- profundidad: solo en la calle; en tejados, paredes y balanceo vuelve al frente ----
    if (this.state === 'wall' || this.state === 'swing' || (this.onGround && !onStreet(this))) this.z = approach(this.z, 0, 160 * dt);
    // ---- aterrizaje ----
    if (this.onGround && !this.wasGround) {
      if (this.vyBefore > 250) { Audio2.sfx('land'); world.particles.dust(this.cx, this.feet, 4); this.landT = 0.1; }
      this.airJumps = 1;
    }
    this.vyBefore = this.vy;
    this.wasGround = this.onGround;
    if (this.onGround) {
      this.coyote = 0.1;
      if (this.groundObj && this.groundObj.climb !== undefined && this.state === 'normal') {
        this.safeT += dt;
        if (this.safeT > 0.3) { this.lastSafe.x = this.x; this.lastSafe.y = this.y; this.safeT = 0; }
      }
    }
    // caída al agua / fuera del mapa
    if (this.y > lv.killY) world.playerFell();
  }

  updNormal(dt, world, ix, U, Dn, pr) {
    const lv = world.level;
    const control = this.lockT <= 0 && !(this.attack && this.onGround);
    // moverse hacia el fondo (arriba) o hacia delante (abajo) en la calle
    this.zMoving = false;
    if (control && onStreet(this) && !(Dn && pr('JUMP'))) {
      if (U && this.z < DEPTH_MAX) { this.z = Math.min(DEPTH_MAX, this.z + 78 * dt); this.zMoving = true; }
      if (Dn && this.z > 0) { this.z = Math.max(0, this.z - 78 * dt); this.zMoving = true; }
    }
    // movimiento horizontal
    if (control && ix) {
      const acc = this.onGround ? PHYS.gAcc : PHYS.aAcc;
      const maxS = PHYS.run;
      if (Math.abs(this.vx) <= maxS || sign(this.vx) !== ix) this.vx = clamp(this.vx + ix * acc * dt, -Math.max(maxS, Math.abs(this.vx)), Math.max(maxS, Math.abs(this.vx)));
      if (!this.attack) this.facing = ix;
    } else if (this.onGround) {
      this.vx = approach(this.vx, 0, PHYS.fric * dt);
    } else {
      this.vx = approach(this.vx, 0, 120 * dt);
    }
    if (!this.onGround && Math.abs(this.vx) > PHYS.run) this.vx = approach(this.vx, sign(this.vx) * PHYS.run, 90 * dt);
    // bajar de plataformas de un sentido
    if (Dn && this.onGround && pr('JUMP') && this.groundObj && this.groundObj.climb === undefined) {
      this.dropTimer = 0.25; this.jumpBuf = 0; this.y += 1;
    }
    // salto
    if (this.jumpBuf > 0 && !this.attack) {
      if (this.coyote > 0) {
        this.vy = PHYS.jump; this.coyote = 0; this.jumpBuf = 0; this.onGround = false;
        Audio2.sfx('jump');
      } else if (this.airJumps > 0) {
        this.vy = PHYS.djump; this.airJumps--; this.jumpBuf = 0; this.flipT = 0.4;
        Audio2.sfx('jump');
        world.particles.dust(this.cx, this.feet, 3);
      }
    }
    if (!Input.isDown('JUMP') && this.vy < -120 && !this.attack) this.vy += 1800 * dt; // salto variable
    // telaraña para balancearse
    if (pr('WEB') && !this.attack) {
      if (this.onGround) {
        this.vy = PHYS.jump * 0.85; this.onGround = false; this.coyote = 0;
        this.pendingWeb = 0.12;
        Audio2.sfx('jump');
      } else this.tryAttach(world, ix);
    }
    if (this.pendingWeb > 0 && !this.onGround && Input.isDown('WEB') && this.vy > -200) { this.pendingWeb = 0; this.tryAttach(world, ix); }
    // ataques
    if (pr('ATTACK')) {
      if (this.attack) this.queued = true;
      else this.startAttack(world, U, Dn);
    }
    // gravedad y movimiento
    const g = (this.attack && !this.onGround && this.attack.type !== 'dive') ? GRAV * 0.5 : GRAV;
    this.vy = Math.min(this.vy + g * dt, this.attack && this.attack.type === 'dive' ? 520 : PHYS.maxFall);
    lv.move(this, dt);
    // agarrarse a paredes
    if (!this.onGround && this.hitWall && this.grabCd <= 0 && this.wallObj && this.wallObj.climb && !this.attack &&
      (ix === this.hitWall || this.vy > 60)) {
      this.state = 'wall'; this.wallDir = this.hitWall; this.facing = this.hitWall;
      this.vx = 0; this.vy = 0; this.airJumps = 1;
    }
  }

  updWall(dt, world, ix, U, Dn, pr) {
    const lv = world.level;
    this.facing = this.wallDir;
    let vy = 0;
    if (U) vy = -PHYS.climb; else if (Dn) vy = PHYS.climb;
    this.vx = this.wallDir * 40; this.vy = vy;
    const oldY = this.y;
    lv.move(this, dt);
    if (pr('JUMP')) {
      this.state = 'normal';
      this.vx = -this.wallDir * PHYS.wallJumpX; this.vy = PHYS.wallJumpY;
      this.facing = -this.wallDir; this.grabCd = 0.22; this.lockT = 0.14; this.jumpBuf = 0;
      Audio2.sfx('jump');
      return;
    }
    if (pr('WEB')) { this.state = 'normal'; this.grabCd = 0.25; this.vx = -this.wallDir * 120; this.vy = -150; this.tryAttach(world, -this.wallDir); return; }
    if (this.hitWall !== this.wallDir) {
      if (vy < 0) {
        // subir al tejado
        this.state = 'normal'; this.vy = -230; this.vx = this.wallDir * 90; this.grabCd = 0.3;
        return;
      }
      this.state = 'normal'; this.grabCd = 0.2;
      return;
    }
    if (this.onGround && Dn) { this.state = 'normal'; this.grabCd = 0.3; return; }
    if (ix === -this.wallDir) { this.state = 'normal'; this.grabCd = 0.25; this.vx = -this.wallDir * 60; return; }
    if (this.hitCeil && vy < 0) this.y = oldY;
    if (vy !== 0 && Math.floor(this.anim * 8) !== Math.floor((this.anim - dt) * 8)) Audio2.sfx('step');
  }

  tryAttach(world, ix) {
    const lv = world.level;
    let dir = ix || (Math.abs(this.vx) > 30 ? sign(this.vx) : this.facing);
    this.facing = dir;
    const hx = this.cx, hy = this.y + 4;
    const tries = [38, 22, 55];
    for (const deg of tries) {
      const a = deg * D2R;
      const dx = dir * Math.sin(a), dy = -Math.cos(a);
      const hit = lv.raycast(hx, hy, dx, dy, PHYS.webLen);
      let ax, ay;
      if (hit) { ax = hit.x; ay = hit.y; }
      else if (!lv.indoor) {
        const len = 150;
        ax = hx + dx * len; ay = hy + dy * len;
        if (ay < lv.anchorMinY) continue;
      } else continue;
      if (hy - ay < 24) continue;
      this.anchor = { x: ax, y: ay };
      this.rope = Math.max(40, Math.hypot(ax - hx, ay - hy));
      this.state = 'swing';
      this.attack = null;
      Audio2.sfx('thwip');
      return true;
    }
    world.float('¡SIN ANCLAJE!', this.cx, this.y - 8, '#c0c0c0');
    return false;
  }

  updSwing(dt, world, ix, U, Dn, pr) {
    const lv = world.level;
    const a = this.anchor;
    if (!a) { this.state = 'normal'; return; }
    if (!Input.isDown('WEB') || !world.inputEnabled) { this.releaseSwing(); return; }
    if (pr('ATTACK')) {
      this.releaseSwing();
      this.attack = { type: 'swingkick', t: 0, hit: new Set(), def: ATK.swingkick };
      this.vx += this.facing * 40;
      Audio2.sfx('whoosh');
      return;
    }
    if (pr('JUMP')) { this.releaseSwing(); this.vy = Math.min(this.vy, 0) - 140; Audio2.sfx('jump'); return; }
    const hx = this.cx, hy = this.y + 4;
    let dx = hx - a.x, dy = hy - a.y;
    let len = Math.hypot(dx, dy) || 1;
    // impulso tangencial
    if (ix && dy > 0) {
      let tx = -dy / len, ty = dx / len;
      if (tx * ix < 0) { tx = -tx; ty = -ty; }
      this.vx += tx * PHYS.swingAcc * this.swingMul * dt;
      this.vy += ty * PHYS.swingAcc * this.swingMul * dt;
      this.facing = ix;
    } else if (Math.abs(this.vx) > 20) this.facing = sign(this.vx);
    if (U) this.rope = Math.max(40, this.rope - 100 * dt);
    if (Dn) this.rope = Math.min(PHYS.webLen + 20, this.rope + 100 * dt);
    this.vy += GRAV * dt;
    lv.move(this, dt);
    if (this.onGround) { this.releaseSwing(); return; }
    if (this.hitWall && this.wallObj && this.wallObj.climb) {
      this.anchor = null; this.state = 'wall'; this.wallDir = this.hitWall; this.facing = this.hitWall; this.vx = 0; this.vy = 0;
      return;
    }
    // restricción de cuerda
    dx = this.cx - a.x; dy = this.y + 4 - a.y;
    len = Math.hypot(dx, dy) || 1;
    if (len > this.rope) {
      const nx = dx / len, ny = dy / len;
      const tx = a.x + nx * this.rope - this.w / 2, ty = a.y + ny * this.rope - 4;
      if (lv.rectFree({ x: tx, y: ty, w: this.w, h: this.h })) { this.x = tx; this.y = ty; }
      const vr = this.vx * nx + this.vy * ny;
      if (vr > 0) { this.vx -= vr * nx; this.vy -= vr * ny; }
    }
    const sp = Math.hypot(this.vx, this.vy), mx = PHYS.swingMax * this.swingMul;
    if (sp > mx) { this.vx *= mx / sp; this.vy *= mx / sp; }
    if (dy < -6) this.releaseSwing();
  }

  releaseSwing() {
    if (this.state !== 'swing') return;
    this.state = 'normal';
    this.anchor = null;
    this.vx *= 1.12;
    if (this.vy < 0) this.vy -= 50;
    this.airJumps = 1;
    this.grabCd = 0.1;
    Audio2.sfx('whoosh');
  }

  startAttack(world, U, Dn) {
    let type;
    if (!this.onGround) {
      if (Dn) type = 'dive';
      else if (Math.hypot(this.vx, this.vy) > 230) type = 'swingkick';
      else type = 'airkick';
    } else if (U && !onStreet(this)) type = 'uppercut';
    else if (this.comboT > 0 && this.comboNext) type = this.comboNext;
    else type = 'punch1';
    this.attack = { type, t: 0, hit: new Set(), def: ATK[type] };
    if (type === 'dive') { this.vy = 380; this.vx = this.facing * 70; }
    else if (type === 'uppercut') { this.vy = -200; this.onGround = false; }
    else if (this.onGround) this.vx = this.facing * 60;
    Audio2.sfx(type === 'kick' || type === 'uppercut' ? 'whoosh' : 'dodge');
  }

  updAttack(dt, world) {
    const at = this.attack;
    const d = at.def;
    at.t += dt;
    if (at.type === 'dive' && this.onGround) {
      world.particles.dust(this.cx, this.feet, 8);
      world.shake(3);
      Audio2.sfx('heavy');
      world.areaHit(this.cx, this.feet - 8, 28, 1, 120, -160, this);
      this.attack = null;
      return;
    }
    if (at.t >= d.act[0] && at.t <= d.act[1]) {
      const [bx, by, bw, bh] = d.box;
      const box = { x: this.facing > 0 ? this.cx + bx : this.cx - bx - bw, y: this.feet + by, w: bw, h: bh };
      for (const e of world.enemies) {
        if (e.dead || at.hit.has(e) || !e.hittable()) continue;
        if (Math.abs((e.z || 0) - this.z) > LANE) continue;
        if (overlap(box, e.hurtbox())) {
          at.hit.add(e);
          world.playerHits(e, d.dmg * this.dmgMul, d.kx * this.facing, d.ky, !!d.heavy);
        }
      }
      world.hitObjects(box, this);
    }
    if (at.t >= d.dur) {
      this.attack = null;
      if (d.next) { this.comboNext = d.next; this.comboT = 0.35; }
      else { this.comboNext = null; this.comboT = 0; }
      if (this.queued && this.onGround && d.next) {
        this.queued = false;
        this.attack = { type: d.next, t: 0, hit: new Set(), def: ATK[d.next] };
        this.vx = this.facing * 60;
        Audio2.sfx(d.next === 'kick' ? 'whoosh' : 'dodge');
      }
      this.queued = false;
    }
  }

  doSpin(world) {
    this.focus -= 50;
    this.state = 'special'; this.st = 0.55;
    this.vy = -120;
    this.attack = null;
    Audio2.sfx('special');
    world.shake(4);
    world.particles.burst(this.cx, this.cy, 24, '#ffffff', 160);
    world.areaHit(this.cx, this.cy, 80, 3 * this.dmgMul, 260, -200, this, true);
  }

  gainFocus(v) { this.focus = Math.min(100, this.focus + v * this.focusMul); }

  hurtbox() { return { x: this.x + 1, y: this.y + 2, w: this.w - 2, h: this.h - 2 }; }

  // Devuelve true si el golpe entró
  takeDamage(dmg, srcX, world) {
    if (this.inv > 0 || this.state === 'dodge' || this.state === 'dead' || this.state === 'cutscene') return false;
    this.hp -= dmg;
    this.inv = 1.0;
    this.anchor = null; this.attack = null;
    const dir = this.cx >= srcX ? 1 : -1;
    this.state = 'hurt'; this.st = 0.3;
    this.vx = dir * 150; this.vy = -170;
    Audio2.sfx('hurt');
    Input.rumble(0.8, 0.4, 180);
    world.shake(4);
    world.particles.burst(this.cx, this.cy, 8, '#ff4040', 90);
    if (this.hp <= 0) {
      this.hp = 0; this.state = 'dead'; this.st = 0;
      world.onPlayerDeath();
    }
    return true;
  }

  // ---------------- Dibujo ----------------
  draw(ctx, cam, t) {
    if (this.inv > 0 && this.state !== 'dead' && Math.floor(this.inv * 16) % 2 === 0) return;
    const suit = SUITS.find((s) => s.id === Game.save.suit) || SUITS[0];
    const pal = suit.palObj;
    const x = Math.round(this.cx - cam.x), y = Math.round(this.feet - cam.y);
    let pose, f = this.facing;
    let dx = 0;
    switch (this.state) {
      case 'dead': pose = Poses.ko(); break;
      case 'hurt': pose = Poses.hurt(); break;
      case 'dodge': pose = this.onGround ? Poses.crouch() : Poses.flip(0.28 - this.st); if (this.onGround) pose = Poses.flip((0.28 - this.st) * 1.2); break;
      case 'wall': pose = Poses.wall(this.vy !== 0 ? this.anim : 0); f = this.wallDir; dx = f * 2; break;
      case 'charge': pose = Poses.heal(this.anim); break;
      case 'special': pose = Poses.special(0.55 - this.st); break;
      case 'swing': {
        const a = this.anchor;
        const lx = (a.x - this.cx) * f, ly = a.y - (this.y + 4);
        const ang = Math.atan2(lx, -ly) / D2R;
        pose = Poses.swing(170);
        pose.rot = ang * 0.9;
        break;
      }
      default:
        if (this.attack) pose = Poses[this.attack.def.pose]();
        else if (this.shootPose > 0) pose = Poses.shoot();
        else if (this.onGround) {
          if (Math.abs(this.vx) > 12 || this.zMoving) { this.runPhase += Math.max(Math.abs(this.vx), this.zMoving ? 80 : 0) * 0.0022 * 6; pose = Poses.run(this.runPhase); }
          else if (this.landT > 0) pose = Poses.crouch();
          else pose = Poses.idle(t);
        } else if (this.flipT > 0) pose = Poses.flip(0.4 - this.flipT);
        else pose = this.vy < 0 ? Poses.jump() : Poses.fall();
    }
    const wp = Rig.draw(ctx, x + dx, y, f, pose, pal);
    // línea de telaraña
    if (this.state === 'swing' && this.anchor) {
      ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(wp.h2[0] + 0.5, wp.h2[1] + 0.5);
      ctx.lineTo(Math.round(this.anchor.x - cam.x) + 0.5, Math.round(this.anchor.y - cam.y) + 0.5);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(this.anchor.x - cam.x) - 1, Math.round(this.anchor.y - cam.y) - 1, 3, 3);
    }
    // hormigueo arácnido
    if (this.sense > 0) {
      ctx.fillStyle = Math.floor(t * 20) % 2 ? '#ffffff' : '#ffe040';
      const hx = wp.head[0], hy = wp.head[1];
      for (const s of [-1, 1]) {
        const bx = hx + s * 5;
        for (let i = 0; i < 3; i++) {
          ctx.fillRect(bx + s * i * 2, hy - 6 - i * 2, 1, 2);
          ctx.fillRect(bx + s * i * 2 + s, hy - 8 - i * 2, 1, 2);
        }
      }
    }
    if (this.state === 'charge' && this.holdT > 0.15) {
      ctx.fillStyle = 'rgba(120,255,140,0.25)';
      const r = 8 + this.holdT * 12;
      ctx.fillRect(x - r, y - 26, r * 2, 28);
    }
  }
}
