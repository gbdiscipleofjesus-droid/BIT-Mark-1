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
  punch2: { dur: 0.24, act: [0.04, 0.12], box: [6, -19, 16, 13], dmg: 1, kx: 80, ky: -40, pose: 'punch2', next: 'punch3' },
  punch3: { dur: 0.26, act: [0.04, 0.13], box: [4, -24, 17, 17], dmg: 1, kx: 90, ky: -60, pose: 'punch3', next: 'kick' },
  kick: { dur: 0.36, act: [0.08, 0.18], box: [4, -17, 21, 13], dmg: 2, kx: 240, ky: -160, pose: 'kick', heavy: true },
  uppercut: { dur: 0.38, act: [0.04, 0.16], box: [2, -32, 17, 30], dmg: 1.5, kx: 40, ky: -340, pose: 'uppercut', heavy: true },
  airkick: { dur: 0.3, act: [0.03, 0.2], box: [3, -15, 19, 15], dmg: 1.5, kx: 160, ky: -80, pose: 'airkick' },
  dive: { dur: 1.2, act: [0, 1.2], box: [-7, -8, 24, 12], dmg: 2, kx: 170, ky: -140, pose: 'dive', heavy: true },
  swingkick: { dur: 0.35, act: [0.02, 0.26], box: [2, -21, 23, 21], dmg: 3, kx: 300, ky: -130, pose: 'swingkick', heavy: true },
};

function world_coop(p) { const w = Game.scene && Game.scene.world; return !!(w && w.coop && p.idx !== undefined); }

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
    this.hp = this.maxHp; this.focus = 0; this.webs = this.maxWebs; this.airJumps = this.maxAirJumps;
  }

  refreshStats() {
    const u = Game.save.upgrades;
    const S = (id) => Progress.has(id);
    this.maxHp = 100 + u.hp * 20 + (S('d_vida') ? 25 : 0);
    this.dmgMul = 1 + u.dmg * 0.25;
    this.webStun = 2.2 + u.web * 0.6;
    this.maxWebs = 5 + u.web + (S('i_cartuchos') ? 2 : 0);
    this.swingMul = 1 + u.swing * 0.12 + (S('b_veloz') ? 0.15 : 0);
    this.focusMul = 1 + u.focus * 0.3 + (S('d_foco') ? 0.3 : 0);
    this.maxAirJumps = S('b_triple') ? 2 : 1;
    this.climbMul = S('b_trepa') ? 1.6 : 1;
    this.webRegenT = S('i_recarga') ? 0.4 : 0.8;
    this.armor = S('d_escudo') ? 0.8 : 1;
    if (this.hp > this.maxHp) this.hp = this.maxHp;
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  get feet() { return this.y + this.h; }

  update(dt, world) {
    const lv = world.level;
    const inp = world.inputEnabled ? (this.input || Input) : null;
    const L = inp && inp.isDown('LEFT'), R = inp && inp.isDown('RIGHT');
    const U = inp && inp.isDown('UP'), Dn = inp && inp.isDown('DOWN');
    const pr = (a) => !!(inp && inp.pressed(a));
    const ix = (R ? 1 : 0) - (L ? 1 : 0);
    this.anim += dt;
    for (const k of ['inv', 'hurtT', 'dodgeCd', 'shootCd', 'grabCd', 'lockT', 'coyote', 'jumpBuf', 'flipT', 'comboT', 'dropTimer', 'landT', 'pendingWeb', 'throwT']) {
      if (this[k] > 0) this[k] = Math.max(0, this[k] - dt);
    }
    this.sense = Math.max(0, this.sense - dt);
    // recarga de cartuchos de red
    if (this.webs < this.maxWebs) {
      this.webRegen += dt;
      if (this.webRegen >= this.webRegenT) { this.webRegen = 0; this.webs++; }
    }
    if (pr('JUMP')) this.jumpBuf = 0.12;
    Gadgets.tick(this, dt);
    // récord de tiempo en el aire
    if (!this.onGround && !['wall', 'facade', 'dead', 'cutscene'].includes(this.state)) this.airT = (this.airT || 0) + dt;
    else { if (this.airT > 1) Progress.rec('airMax', Math.floor(this.airT), 'max'); this.airT = 0; }

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
    // ---- atrapado en la red de Miguel: machaca botones para soltarte ----
    if (this.stuckT > 0) {
      const mash = ['JUMP', 'ATTACK', 'DODGE', 'SHOOT', 'WEB', 'SPECIAL'].some(pr);
      this.stuckT = Math.max(0, this.stuckT - dt - (mash ? 0.14 : 0));
      if (mash) { world.particles.burst(this.cx, this.cy, 2, '#ff5050', 50); }
      this.attack = null; this.anchor = null;
      if (['swing', 'wall', 'facade', 'dodge'].includes(this.state)) this.state = 'normal';
      this.vx = approach(this.vx, 0, 800 * dt);
      this.vy = Math.min(this.vy + GRAV * dt, PHYS.maxFall);
      lv.move(this, dt);
      if (this.stuckT <= 0) { world.float('¡LIBRE!', this.cx, this.y - 8, '#ffffff'); this.inv = Math.max(this.inv, 0.4); }
      return;
    }

    // ---- esquiva (disponible en casi todos los estados) ----
    if (pr('DODGE') && this.dodgeCd <= 0 && ['normal', 'wall', 'swing', 'facade', 'grab'].includes(this.state)) {
      if (this.grabE) this.releaseGrab(false);
      this.attack = null;
      const back = ix !== 0 && ix !== this.facing;
      const ground = this.onGround;
      // 4 esquivas: rueda (suelo, adelante), voltereta atrás (suelo, atrás),
      // mortal (aire, adelante) y mortal atrás girando en horizontal (aire, atrás)
      this.dodgeKind = ground ? (back ? 'backflip' : 'roll') : (back ? 'corkscrew' : 'frontflip');
      this.anchor = null;
      this.state = 'dodge'; this.st = this.dodgeDur = back ? 0.36 : 0.3;
      this.inv = Math.max(this.inv, this.dodgeDur + 0.06);
      this.dodgeHit = new Set();
      const f = this.facing;
      switch (this.dodgeKind) {
        case 'roll': this.facing = ix || f; this.vx = this.facing * 250; this.vy = 0; break;
        case 'backflip': this.vx = -f * 215; this.vy = -175; this.onGround = false; break;
        case 'frontflip': this.facing = ix || f; this.vx = this.facing * 245; this.vy = Math.min(this.vy, -130); break;
        default: this.vx = -f * 230; this.vy = Math.min(this.vy, -150); break;
      }
      this.dodgeCd = 0.6;
      if (!ground && Progress.has('b_trucos')) this.gainFocus(4);
      Audio2.sfx('dodge');
      if (world.threatNear(this)) world.perfectDodge(this);
      world.particles.dust(this.cx, this.feet, 5);
    }

    // ---- artilugios y poder del traje ----
    if (['normal', 'swing', 'wall', 'facade'].includes(this.state)) {
      if (pr('GADGET')) Gadgets.use(this, world);
      if (pr('NEXT_GADGET')) Gadgets.cycle(this, world);
      if (pr('POWER')) SuitPowers.use(this, world);
    }
    // ---- disparo de red ----
    if (pr('SHOOT') && this.shootCd <= 0 && U && Progress.has('d_tiron') && this.state === 'normal' && world.yank(this)) {
      this.shootCd = 0.4; this.shootPose = 0.2;
    } else if (pr('SHOOT') && this.shootCd <= 0 && ['normal', 'swing', 'wall', 'facade'].includes(this.state)) {
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

    // ---- espera: de pie; con el botón de pose o tras un rato quieto, animaciones ----
    const busy = ix || U || Dn || this.attack || !this.onGround || this.state !== 'normal' ||
      ['JUMP', 'ATTACK', 'WEB', 'SHOOT', 'DODGE', 'SPECIAL', 'GADGET', 'POWER', 'ALLY'].some(pr) || Math.abs(this.vx) > 12;
    if (busy) { this.idleT = 0; this.emote = null; }
    else {
      this.idleT = (this.idleT || 0) + dt;
      if (this.emote) { this.emote.t += dt; if (this.emote.t >= this.emote.dur) { this.emote = null; this.idleT = 0; } }
      if (pr('EMOTE') || (!this.emote && this.idleT > 5)) this.startEmote();
    }
    switch (this.state) {
      case 'normal': this.updNormal(dt, world, ix, U, Dn, pr); break;
      case 'wall': this.updWall(dt, world, ix, U, Dn, pr); break;
      case 'facade': this.updFacade(dt, world, ix, U, Dn, pr); break;
      case 'swing': this.updSwing(dt, world, ix, U, Dn, pr); break;
      case 'grab': this.updGrab(dt, world, ix, pr); break;
      case 'dodge': {
        this.st -= dt;
        this.vy += GRAV * (this.dodgeKind === 'roll' ? 1 : 0.55) * dt;
        lv.move(this, dt);
        // las esquivas también golpean (menos que un ataque)
        const airFlip = this.dodgeKind === 'frontflip' || this.dodgeKind === 'corkscrew';
        const box = { x: this.x - 6, y: this.y, w: this.w + 12, h: this.h + (airFlip ? 22 : 0) };
        for (const e of world.enemies) {
          if (e.dead || this.dodgeHit.has(e) || !e.hittable() || Math.abs((e.z || 0) - this.z) > LANE) continue;
          if (overlap(box, e.hurtbox())) {
            this.dodgeHit.add(e);
            world.playerHits(e, 0.6 * this.dmgMul, sign(this.vx || this.facing) * 90, this.dodgeKind === 'roll' ? -40 : -90, false);
          }
        }
        if (this.dodgeKind === 'roll' && this.onGround && Math.floor(this.st * 40) % 3 === 0) world.particles.dust(this.cx, this.feet, 1);
        if (this.st <= 0) { this.state = 'normal'; this.vx *= 0.5; }
        break;
      }
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
        if (!(this.input || Input).isDown('SPECIAL') || !world.inputEnabled) {
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
    if (this.state === 'wall' || this.state === 'facade' || this.state === 'swing' || (this.onGround && !onStreet(this))) this.z = approach(this.z, 0, 160 * dt);
    // ---- aterrizaje ----
    if (this.onGround && !this.wasGround) {
      if (this.vyBefore > 250) { Audio2.sfx('land'); world.particles.dust(this.cx, this.feet, 4); this.landT = 0.1; }
      this.airJumps = this.maxAirJumps;
    }
    this.vyBefore = this.vy;
    this.wasGround = this.onGround;
    if (this.onGround) {
      this.coyote = 0.1;
      if (this.groundObj && this.groundObj.climb !== undefined && this.state === 'normal') {
        this.safeT += dt;
        // solo se guarda si hay suelo firme a ambos lados (lejos de los bordes)
        const fy = this.y + this.h;
        const firm = Math.abs(lv.surfaceY(this.cx - 28, fy - 4) - fy) < 2 && Math.abs(lv.surfaceY(this.cx + 28, fy - 4) - fy) < 2;
        if (this.safeT > 0.3 && firm) { this.lastSafe.x = this.x; this.lastSafe.y = this.y; this.safeT = 0; }
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
        if (Progress.has('b_trucos')) this.gainFocus(4);
        Audio2.sfx('jump');
        world.particles.dust(this.cx, this.feet, 3);
      }
    }
    if (!(this.input || Input).isDown('JUMP') && this.vy < -120 && !this.attack) this.vy += 1800 * dt; // salto variable
    // telaraña para balancearse
    if (pr('WEB') && !this.attack) {
      if (this.onGround) {
        this.vy = PHYS.jump * 0.85; this.onGround = false; this.coyote = 0;
        this.pendingWeb = 0.12;
        Audio2.sfx('jump');
      } else this.tryAttach(world, ix);
    }
    if (this.pendingWeb > 0 && !this.onGround && (this.input || Input).isDown('WEB') && this.vy > -200) { this.pendingWeb = 0; this.tryAttach(world, ix); }
    // agarre (como en Maximum Carnage): camina contra un matón para sujetarlo
    if (this.onGround && !this.attack && ix && control && this.grabCd <= 0) {
      const e = this.grabTarget(world, ix);
      this.pushT = e ? (this.pushT || 0) + dt : 0;
      if (e && this.pushT > 0.16) { this.startGrab(world, e); return; }
    } else this.pushT = 0;
    // ataques
    if (pr('ATTACK')) {
      if (this.attack) this.queued = true;
      else this.startAttack(world, U, Dn);
    }
    // gravedad y movimiento
    const g = (this.attack && !this.onGround && this.attack.type !== 'dive') ? GRAV * 0.5 : GRAV;
    this.vy = Math.min(this.vy + g * dt, this.attack && this.attack.type === 'dive' ? (Progress.has('b_picado') ? 700 : 520) : PHYS.maxFall);
    // alas de telaraña: planear manteniendo SALTO al caer
    this.gliding = false;
    if (Progress.has('b_planeo') && !this.onGround && this.vy > 50 && this.airJumps === 0 && !this.attack && (this.input || Input).isDown('JUMP')) {
      this.vy = 50; this.gliding = true;
      if (Math.abs(this.vx) < 150) this.vx += this.facing * 200 * dt;
    }
    lv.move(this, dt);
    // agarrarse a paredes
    if (!this.onGround && this.hitWall && this.grabCd <= 0 && this.wallObj && this.wallObj.climb && !this.attack &&
      (ix === this.hitWall || this.vy > 60)) {
      this.state = 'wall'; this.wallDir = this.hitWall; this.facing = this.hitWall;
      this.vx = 0; this.vy = 0; this.airJumps = this.maxAirJumps;
    }
    // trepar por la fachada de un edificio: en el aire, delante del edificio, mantén ARRIBA
    if (!this.onGround && U && this.grabCd <= 0 && !this.attack) {
      const f = lv.facadeAt(this);
      if (f) { this.state = 'facade'; this.facadeObj = f; this.vx = 0; this.vy = 0; this.airJumps = this.maxAirJumps; }
    }
  }

  updFacade(dt, world, ix, U, Dn, pr) {
    const lv = world.level, f = this.facadeObj;
    if (!f) { this.state = 'normal'; return; }
    if (pr('JUMP')) {
      this.state = 'normal'; this.vy = PHYS.jump * 0.9; this.vx = (ix || this.facing) * 90;
      this.grabCd = 0.3; this.jumpBuf = 0; Audio2.sfx('jump');
      return;
    }
    if (pr('WEB')) { this.state = 'normal'; this.grabCd = 0.3; this.vy = -150; this.tryAttach(world, ix || this.facing); return; }
    if (ix) this.facing = ix;
    this.vx = ix * 70 * this.climbMul;
    this.vy = (U ? -PHYS.climb : Dn ? PHYS.climb : 0) * this.climbMul;
    lv.move(this, dt);
    // arriba del todo: subir al tejado
    if (this.y + this.h <= f.y + 3) {
      this.y = f.y - this.h; this.vy = 0; this.vx = 0; this.state = 'normal'; this.grabCd = 0.25;
      return;
    }
    // abajo del todo (donde empieza la calle): se suelta y cae a la calle
    const bottom = facadeBottom(f, lv);
    if (this.y + this.h > bottom + 1) {
      // se agarró por debajo de la parte visible: sube solo hasta la fachada
      this.y = Math.max(bottom - this.h, this.y - 180 * dt);
    } else if (this.y + this.h >= bottom - 1 && Dn) {
      this.state = 'normal'; this.grabCd = 0.35; this.vy = 40; return;
    }
    // se salió por un lado o llegó al suelo
    const cx = this.cx;
    if (cx < f.x || cx > f.x + f.w || this.onGround) { this.state = 'normal'; this.grabCd = 0.25; }
    if ((this.vx || this.vy) && Math.floor(this.anim * 8) !== Math.floor((this.anim - dt) * 8)) Audio2.sfx('step');
  }

  updWall(dt, world, ix, U, Dn, pr) {
    const lv = world.level;
    this.facing = this.wallDir;
    let vy = 0;
    if (U) vy = -PHYS.climb * this.climbMul; else if (Dn) vy = PHYS.climb * this.climbMul;
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
    if (!(this.input || Input).isDown('WEB') || !world.inputEnabled) { this.releaseSwing(); return; }
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
    Progress.rec('swingDist', Math.hypot(this.vx, this.vy) * dt / 10);
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
    this.vx *= Progress.has('b_impulso') ? 1.3 : 1.12;
    if (this.vy < 0) this.vy -= Progress.has('b_impulso') ? 90 : 50;
    this.airJumps = this.maxAirJumps;
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
    if (type === 'dive') { this.vy = Progress.has('b_picado') ? 520 : 380; this.vx = this.facing * 70; }
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
      const big = Progress.has('d_sismo');
      world.areaHit(this.cx, this.feet - 8, big ? 64 : 28, Progress.has('b_picado') ? 1.6 : 1, 120, -160, this, big);
      if (big) world.fx.push(new GRing(this.cx, this.feet - 4, 64, '#e0c080', 0.4));
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
          const extra = (at.type === 'kick' && Progress.has('d_remate') ? 1.5 : 1) * (at.type === 'dive' && Progress.has('b_picado') ? 1.5 : 1);
          world.playerHits(e, d.dmg * this.dmgMul * extra, d.kx * this.facing, d.ky, !!d.heavy);
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

  startEmote() {
    const list = ['wave', 'stretch', 'scratch', 'flex', 'yoyo', 'sit', 'look'];
    let k = pick(list);
    if (this.emote && k === this.emote.kind) k = list[(list.indexOf(k) + 1) % list.length];
    this.emote = { kind: k, t: 0, dur: { wave: 1.6, stretch: 2, scratch: 1.6, flex: 1.8, yoyo: 2.6, sit: 3.5, look: 2.6 }[k] };
    this.idleT = 0;
  }

  // ---------------- agarre y lanzamiento ----------------
  grabTarget(world, ix) {
    for (const e of world.enemies) {
      if (e.dead || e.isBoss || e.fly || !e.onGround || e.grabbedBy || !e.hittable() || e.spec.armor || e.suspendT > 0) continue;
      if (!['thug', 'gunner', 'zombie', 'bat', 'brute'].includes(e.type)) continue;
      if (Math.abs((e.z || 0) - this.z) > 6 || sign(e.cx - this.cx) !== ix) continue;
      if (Math.abs(e.cx - this.cx) < (this.w + e.w) / 2 + 3 && Math.abs(e.feet - this.feet) < 6) return e;
    }
    return null;
  }
  startGrab(world, e) {
    this.state = 'grab'; this.grabE = e; this.grabT = 0; this.knees = 0; this.kneeT = 0; this.pushT = 0;
    this.vx = 0; this.facing = sign(e.cx - this.cx) || this.facing;
    e.grabbedBy = this; e.state = 'hurt'; e.t = 0.3; e.webbed = 0; e.releaseToken(world);
    Audio2.sfx('dodge');
  }
  releaseGrab(shove) {
    const e = this.grabE;
    if (e) { e.grabbedBy = null; if (!e.dead) { e.state = 'chase'; if (shove) { e.vx = this.facing * 90; e.cd = 0.6; } } }
    this.grabE = null; this.grabCd = 0.5;
    if (this.state === 'grab') this.state = 'normal';
  }
  updGrab(dt, world, ix, pr) {
    const e = this.grabE;
    if (!e || e.dead || e.remove) { this.releaseGrab(false); return; }
    this.grabT += dt;
    if (this.kneeT > 0) this.kneeT -= dt;
    this.vx = 0; this.vy = Math.min(this.vy + GRAV * dt, PHYS.maxFall);
    world.level.move(this, dt);
    // el matón queda sujeto delante
    e.x = this.cx + this.facing * 8 - e.w / 2; e.y = this.feet - e.h; e.z = this.z; e.facing = -this.facing; e.vx = 0; e.vy = 0;
    e.state = 'hurt'; e.t = 0.3;
    const away = ix && ix !== this.facing;
    if (pr('JUMP') || (pr('ATTACK') && (away || this.knees >= 2))) { this.throwGrab(world, away ? ix : this.facing); return; }
    if (pr('ATTACK') && this.kneeT <= 0) {
      this.knees++; this.kneeT = 0.14;
      world.playerHits(e, 0.9 * this.dmgMul, 0, 0, false);
      world.shake(1);
      if (e.dead) { this.releaseGrab(false); return; }
      e.state = 'hurt';
    }
    if (this.grabT > 1.8) this.releaseGrab(true);
  }
  throwGrab(world, dir) {
    const e = this.grabE;
    this.facing = dir; this.grabE = null; this.grabCd = 0.4;
    this.state = 'normal'; this.throwT = 0.3; this.lockT = 0.25;
    e.grabbedBy = null;
    e.x = this.cx + dir * 6 - e.w / 2;
    e.thrownT = 0.8; e.thrownHit = new Set([e]);
    world.playerHits(e, 1.5 * this.dmgMul, dir * 330, -240, true);
    Audio2.sfx('whoosh');
    world.float('¡LANZAMIENTO!', this.cx, this.y - 10, '#ffe060');
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
    if (this.cloakT > 0 || this.shieldT > 0) return false;
    if (this.grabE) this.releaseGrab(false);
    this.hp -= Math.round(dmg * (this.armor || 1));
    this.inv = 1.0; this.hurtT = 1.0;
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
    // parpadea solo tras recibir daño (no durante esquivas)
    if (this.hurtT > 0 && this.state !== 'dead' && Math.floor(this.hurtT * 16) % 2 === 0) return;
    if (this.cloakT > 0) ctx.globalAlpha = 0.3;
    const suit = SUITS.find((s) => s.id === (this.suitId || Game.save.suit)) || SUITS[0];
    const pal = suit.palObj;
    const x = Math.round(this.cx - cam.x), y = Math.round(this.feet - cam.y);
    let pose, f = this.facing;
    let dx = 0;
    switch (this.state) {
      case 'dead': pose = Poses.ko(); break;
      case 'hurt': pose = Poses.hurt(); break;
      case 'dodge': {
        const u = clamp(1 - this.st / (this.dodgeDur || 0.3), 0, 1);
        if (this.dodgeKind === 'roll') pose = Poses.roll(u);
        else if (this.dodgeKind === 'backflip') pose = Poses.backflip(u);
        else if (this.dodgeKind === 'frontflip') pose = Poses.flip(u);
        else { pose = Poses.corkscrew(u); this.spinX = Math.cos(u * TAU * 1.5); }
        break;
      }
      case 'wall': pose = Poses.wall(this.vy !== 0 ? this.anim : 0); f = this.wallDir; dx = f * 2; break;
      case 'facade': pose = Poses.wall((this.vy !== 0 || this.vx !== 0) ? this.anim : 0); pose.t = 0; break;
      case 'charge': pose = Poses.heal(this.anim); break;
      case 'grab': pose = this.kneeT > 0.05 ? Poses.knee() : Poses.grab(); break;
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
        else if (this.throwT > 0) pose = Poses.toss();
        else if (this.shootPose > 0) pose = Poses.shoot();
        else if (this.onGround) {
          if (Math.abs(this.vx) > 12 || this.zMoving) { this.runPhase += Math.max(Math.abs(this.vx), this.zMoving ? 80 : 0) * 0.0022 * 6; pose = Poses.run(Math.floor(this.runPhase / (TAU / 8)) * (TAU / 8)); }
          else if (this.landT > 0) pose = Poses.crouch();
          else if (this.emote) pose = Poses.emote(this.emote.kind, this.emote.t / this.emote.dur, this.emote.t);
          else pose = Poses.stand(t);
        } else if (this.flipT > 0) pose = Poses.flip(0.4 - this.flipT);
        else pose = this.vy < 0 ? Poses.jump() : Poses.fall();
    }
    // inclinación según la velocidad al correr
    if (this.onGround && this.state === 'normal' && !this.attack && Math.abs(this.vx) > 12) pose.t += 6;
    // aterrizaje con peso: se hunde un poco
    if (this.landT > 0 && this.state === 'normal') pose.hy = (pose.hy || 0) + Math.round(this.landT * 30);
    const SC = 1.35;
    const cork = this.state === 'dodge' && this.dodgeKind === 'corkscrew';
    if (cork) {
      const k = this.spinX || 1;
      ctx.save(); ctx.translate(x, 0); ctx.scale(Math.abs(k) < 0.2 ? 0.2 * sign(k || 1) : k, 1); ctx.translate(-x, 0);
    }
    const wp = Rig.draw(ctx, x + dx, y, f, pose, pal, { scale: SC });
    if (cork) ctx.restore();
    // yoyó de telaraña durante la animación de espera
    if (this.emote && this.emote.kind === 'yoyo' && this.state === 'normal') {
      const [hx, hy] = wp.h2, d = 4 + Math.abs(Math.sin(this.emote.t * 5)) * 12;
      ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx, hy + d); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(hx) - 1, Math.round(hy + d), 3, 3);
    }
    // arco de impacto durante los golpes
    if (this.attack) {
      const d = this.attack.def, at = this.attack.t;
      if (at >= d.act[0] && at <= d.act[1] + 0.04) {
        const u = (at - d.act[0]) / Math.max(0.05, d.act[1] - d.act[0]);
        const heavy = !!d.heavy;
        const r = heavy ? 14 : 10;
        const cx0 = x + f * (d.box[0] + d.box[2] * 0.5), cy0 = y + d.box[1] + d.box[3] * 0.5;
        ctx.strokeStyle = heavy ? 'rgba(255,230,120,0.85)' : 'rgba(255,255,255,0.8)';
        ctx.lineWidth = heavy ? 2 : 1;
        ctx.beginPath();
        const a0 = f > 0 ? -1.2 : Math.PI + 1.2, a1 = f > 0 ? -1.2 + 2.4 * Math.min(1, u + 0.3) : Math.PI + 1.2 - 2.4 * Math.min(1, u + 0.3);
        ctx.arc(cx0 - f * 4, cy0, r, Math.min(a0, a1), Math.max(a0, a1));
        ctx.stroke();
      }
    }
    // envuelto en la red roja de 2099
    if (this.stuckT > 0) {
      ctx.strokeStyle = 'rgba(255,60,60,0.9)'; ctx.lineWidth = 1;
      const top = y - 34, jit = Math.floor(t * 30) % 2;
      for (let i = 0; i < 5; i++) {
        const yy = top + 4 + i * 6 + jit;
        ctx.beginPath(); ctx.moveTo(x - 8, yy); ctx.lineTo(x + 8, yy + 3); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(x - 6, top); ctx.lineTo(x + 5, y); ctx.moveTo(x + 6, top); ctx.lineTo(x - 5, y); ctx.stroke();
    }
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
    // etiqueta de jugador en multijugador
    if (world_coop(this)) {
      const cols = ['#ff5060', '#40b0ff', '#60e070', '#ffd040'];
      Font.draw(ctx, 'J' + (this.idx + 1), wp.head[0], wp.head[1] - 16, cols[this.idx] || '#fff', { align: 'center', outline: '#000000' });
    }
    // hormigueo arácnido
    if (this.sense > 0) {
      // sentido arácnido: líneas en zigzag alrededor de la cabeza
      const hx = wp.head[0], hy = wp.head[1];
      ctx.lineWidth = 0.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = Math.floor(t * 20) % 2 ? '#ffffff' : '#ffe040';
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i - 2) * 0.5, r0 = 4.5, L = 3.5 + (Math.floor(t * 12) + i) % 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        ctx.beginPath(); ctx.moveTo(hx + ca * r0, hy + sa * r0);
        for (let j = 1; j <= 3; j++) { const rr = r0 + L * j / 3, z = (j % 2 ? 0.8 : -0.8); ctx.lineTo(hx + ca * rr - sa * z, hy + sa * rr + ca * z); }
        ctx.stroke();
      }
    }
    if (this.state === 'charge' && this.holdT > 0.15) {
      ctx.fillStyle = 'rgba(120,255,140,0.25)';
      const r = 8 + this.holdT * 12;
      ctx.fillRect(x - r, y - 26, r * 2, 28);
    }
    ctx.globalAlpha = 1;
    // efectos de los poderes de traje
    if (this.shieldT > 0) { ctx.strokeStyle = Math.floor(t * 10) % 2 ? '#80e0ff' : '#ffffff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y - 14, 17, 0, TAU); ctx.stroke(); }
    if (this.furyT > 0 && Math.floor(t * 12) % 2) { ctx.fillStyle = 'rgba(255,80,40,0.25)'; ctx.fillRect(x - 9, y - 30, 18, 30); }
    if (this.shockT > 0 && Math.floor(t * 20) % 3 === 0) { ctx.fillStyle = '#a0f0ff'; ctx.fillRect(x + rand(-8, 8), y - rand(4, 28), 1, 3); }
    if (this.gliding) { ctx.fillStyle = 'rgba(240,240,255,0.7)'; ctx.fillRect(x - 12, y - 20, 24, 1); ctx.fillRect(x - 9, y - 19, 18, 1); }
  }
}
