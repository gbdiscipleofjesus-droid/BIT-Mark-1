'use strict';
// ---------------------------------------------------------------------------
// Escena de juego: ciudad abierta y misiones
// ---------------------------------------------------------------------------
const CIV_PALS = [
  { torso: '#c84848', leg: '#2a3a6a', hair: '#3a2416', head: '#e0b088' },
  { torso: '#48a868', leg: '#3a3a3a', hair: '#141414', head: '#8a5a3a' },
  { torso: '#e8c848', leg: '#5a3a2a', hair: '#8a4a20', head: '#f0c8a0' },
  { torso: '#6a58c8', leg: '#2a2a2a', hair: '#d8d8d8', head: '#c89870' },
  { torso: '#e8e8e8', leg: '#3a4a7a', hair: '#5a3018', head: '#a8704a' },
  { torso: '#e87830', leg: '#1a2a4a', hair: '#141414', head: '#e0b088' },
].map((p) => makePal(Object.assign({ boot: '#2a2a2a', face: 'human', outline: '#140a12' }, p)));

class Civilian {
  constructor(x, y, state = 'walk') {
    this.x = x; this.y = y; this.dir = Math.random() < 0.5 ? -1 : 1;
    this.speed = rand(14, 26); this.pal = pick(CIV_PALS); this.state = state; this.t = rand(0, 5);
    this.vy = 0; this.bubble = null; this.bubbleT = 0; this.w = 10; this.h = 22;
  }
  get cx() { return this.x; }
  update(dt, world) {
    this.t += dt;
    if (this.bubbleT > 0) this.bubbleT -= dt;
    const p = world.player;
    switch (this.state) {
      case 'walk':
        this.x += this.dir * this.speed * dt;
        if (p.onGround && Math.abs(p.cx - this.x) < 40 && Math.abs(p.feet - this.y) < 10 && Math.random() < dt * 0.6 && this.bubbleT <= 0 && world.civSayCd <= 0) {
          world.civSayCd = 3;
          this.state = 'cheer'; this.st = 1.6; this.say(pick(['¡Spidey!', '¡Hola, Spider-Man!', '¡Una foto!', '¡Mola!']));
        }
        break;
      case 'cheer':
        this.st -= dt;
        if (this.st <= 0) this.state = 'walk';
        break;
      case 'fall':
        this.y += 55 * dt;
        if (this.y >= world.level.groundY) { this.y = world.level.groundY; this.state = 'sit'; }
        break;
      default: break;
    }
  }
  say(s) { this.bubble = s; this.bubbleT = 2.2; }
  draw(ctx, cam, t) {
    const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y);
    if (x < -30 || x > W + 30 || y < -40 || y > H + 30) return;
    let pose, f = this.dir;
    switch (this.state) {
      case 'walk': pose = Poses.run(this.t * 5); pose.t = 2; pose.a1 *= 0.4; pose.b1 *= 0.4; break;
      case 'cheer': case 'saved': pose = Poses.cheer(this.t); break;
      case 'cower': pose = Poses.crouch(); pose.a1 = 150; pose.b1 = 160; f = 1; break;
      case 'hang': pose = Poses.fall(); pose.a1 = 175; pose.b1 = 175; pose.l1 = Math.sin(t * 8) * 30; pose.r1 = -Math.sin(t * 8) * 30; break;
      case 'fall': pose = Poses.fall(); pose.a1 = 150 + Math.sin(t * 20) * 20; pose.b1 = 150 - Math.sin(t * 20) * 20; break;
      case 'sit': pose = Poses.sit(); break;
      default: pose = Poses.idle(t);
    }
    Rig.draw(ctx, x, y, f, pose, this.pal);
    if (this.bubbleT > 0 && this.bubble) {
      const w = Font.width(this.bubble) + 6;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x - w / 2, y - 40, w, 11);
      ctx.fillRect(x - 1, y - 29, 3, 2);
      Font.draw(ctx, this.bubble, x, y - 38, UI.ink, { align: 'center' });
    }
  }
}

class World {
  constructor(mode, opts = {}) {
    this.mode = mode;
    this.missionIdx = opts.mission !== undefined ? opts.mission : -1;
    this.t = 0;
    if (mode === 'city') this.level = Levels.city(CITY_SKY[Game.save.stage] || 'day');
    else this.level = Levels.mission(this.missionIdx);
    const lv = this.level;
    const sx = opts.x !== undefined ? opts.x : (mode === 'city' ? 400 : 40);
    this.player = new Player(sx, 0);
    this.player.y = lv.surfaceY(sx + 5, 0) - this.player.h;
    if (this.player.y > lv.groundY) this.player.y = lv.groundY - this.player.h;
    this.player.lastSafe = { x: this.player.x, y: this.player.y };
    this.enemies = []; this.projs = []; this.pickups = []; this.floats = []; this.civs = [];
    this.particles = new Particles();
    this.cam = { x: clamp(this.player.cx - W / 2, 0, lv.width - W), y: clamp(this.player.cy - H * 0.55, 0, lv.height - H) };
    this.shakeAmt = 0; this.hitstopT = 0; this.slowT = 0; this.senseCd = 0;
    this.dialog = null; this.pause = null; this.gameOver = null;
    this.state = 'play'; this.deadT = 0;
    this.tokensUsed = 0;
    this.combo = { n: 0, t: 0 };
    this.stats = { kos: 0, time: 0, webs: 0, maxCombo: 0, tech: 0, hits: 0 };
    this.tip = null; this.tipQueue = [];
    this.radio = null; this.card = null;
    this.arena = null; this.boss = null; this.bossDoneT = -1;
    this.checkpoint = { x: sx };
    this.illusion = 0;
    this.crime = null; this.crimeT = 14; this.jjjT = rand(50, 80);
    this.markerX = null; this.markerArmed = true; this.autoSaveT = 20;
    this.objective = '';
    this.lockInput = 0;
    this.civSayCd = 0;
    // enemigos colocados
    for (const s of lv.spawns) this.spawnEnemy(s.type, s.x, s.y || null);
    if (mode === 'city') this.setupCity(opts);
    else this.setupMission(opts);
  }

  get inputEnabled() { return !this.dialog && this.state === 'play' && !this.pause && this.lockInput <= 0; }

  setupMission() {
    const m = MISSIONS[this.missionIdx];
    this.card = { small: 'MISIÓN ' + (this.missionIdx + 1), big: m.name.toUpperCase(), sub: m.place, t: 0, dur: 3.2 };
    this.objective = 'OBJETIVO: AVANZA HACIA LA DERECHA';
    Audio2.music('action');
  }

  setupCity(opts) {
    const stage = Game.save.stage;
    if (stage >= 1 && stage <= 4) {
      this.markerX = MARKER_X[stage];
      this.objective = 'OBJETIVO: VE AL FARO AZUL (' + MARKER_PLACE[stage].toUpperCase() + ')';
      if (Math.abs(this.player.cx - this.markerX) < 80) this.markerArmed = false;
    } else {
      this.objective = 'MODO LIBRE: PROTEGE LA CIUDAD';
    }
    Audio2.music('city');
    const after = opts.afterMission;
    const lines = after !== undefined && STORY.afterCity[after] ? STORY.afterCity[after] : null;
    const showTip = () => { if (!Game.save.seenCityTip) { Game.save.seenCityTip = true; Game.saveGame(); this.showTip('tip_city', 9); } };
    if (lines) this.startDialog(lines, showTip);
    else showTip();
    if (!opts.afterMission && stage >= 5) this.card = { small: 'NUEVA YORK', big: 'MODO LIBRE', sub: 'Tecnología Stark: ' + Game.save.tokens.length + '/20', t: 0, dur: 2.5 };
  }

  // ---------------- utilidades para entidades ----------------
  float(text, x, y, color = '#ffffff') {
    this.floats.push({ text, x, y, color, life: 1.0 });
  }
  shake(a) { if (Game.settings.shake) this.shakeAmt = Math.max(this.shakeAmt, a); }
  hitstop(t) { this.hitstopT = Math.max(this.hitstopT, t); }
  addProj(p) { this.projs.push(p); }
  onScreen(e) { return e.x + e.w > this.cam.x - 10 && e.x < this.cam.x + W + 10 && e.y + e.h > this.cam.y - 20 && e.y < this.cam.y + H + 10; }
  bubble(who, text) { this.radio = { who, text, t: 0, dur: 3.5 }; }
  showTip(key, dur = 7) {
    const text = fillTip(STORY.tips[key] || key);
    if (this.tip) { this.tipQueue.push({ text, dur }); return; }
    const wait = this.card ? Math.max(0, this.card.dur - this.card.t) : 0;
    this.tip = { text, t: -wait, dur };
  }
  startDialog(lines, cb) {
    this.player.anchor = null;
    if (this.player.state !== 'dead') { this.player.state = 'cutscene'; this.player.attack = null; }
    this.dialog = new Dialog(lines, () => {
      this.dialog = null;
      if (this.player.state === 'cutscene') this.player.state = 'normal';
      this.lockInput = 0.15;
      if (cb) cb();
    });
  }

  spawnEnemy(type, x, y) {
    const e = new Enemy(type, x, 0);
    if (y === null || y === undefined) e.y = this.level.surfaceY(x + e.w / 2, 0) - e.h;
    else e.y = Math.max(y, this.level.topY + (this.level.topY ? 2 : -9999));
    e.hoverY = e.y;
    this.enemies.push(e);
    return e;
  }

  spawnMinion(type, arena) {
    const side = Math.random() < 0.5 ? 0 : 1;
    const x = arena ? (side ? arena.x2 - 24 : arena.x1 + 12) : this.player.x + 150;
    const e = this.spawnEnemy(type, x, this.cam.y - 30);
    e.arena = arena; e.aggro = true; e.state = 'chase';
    return e;
  }

  shootWeb(x, y, dir, dy) {
    const l = Math.hypot(1, dy);
    this.projs.push(new Proj('web', x, y, dir / l * 330, dy / l * 330, 'p', 0));
  }

  playerHits(e, dmg, kx, ky, heavy) {
    if (!e.takeHit(dmg, kx, ky, heavy, this)) return;
    this.hitstop(heavy ? 0.07 : 0.035);
    this.shake(heavy ? 3 : 1.5);
    this.particles.hit(e.cx, e.cy, heavy);
    Audio2.sfx(heavy ? 'heavy' : 'punch');
    Input.rumble(heavy ? 0.5 : 0.2, heavy ? 0.6 : 0.4, heavy ? 90 : 50);
    this.player.gainFocus(heavy ? 10 : 6);
    this.combo.n++; this.combo.t = 2.2;
    this.stats.hits++;
    if (this.combo.n > this.stats.maxCombo) this.stats.maxCombo = this.combo.n;
  }

  areaHit(x, y, r, dmg, kx, ky, src, web) {
    for (const e of this.enemies) {
      if (e.dead || !e.hittable()) continue;
      if (dist(x, y, e.cx, e.cy) < r) {
        this.playerHits(e, dmg, sign(e.cx - x || 1) * kx, ky, true);
        if (web && !e.dead) e.web(2, this);
      }
    }
    this.hitObjects({ x: x - r, y: y - r, w: r * 2, h: r * 2 }, src);
  }

  damagePlayer(dmg, srcX) {
    const hit = this.player.takeDamage(dmg, srcX, this);
    if (hit) { this.combo.n = 0; }
    return hit;
  }

  isThreat(e) {
    if (e.dead || e.webbed > 0 || e.state === 'wait') return false;
    return e.state === 'windup' || (typeof e.state === 'string' && e.state.endsWith('WU')) || e.contactDmg || e.state === 'attack' || e.state === 'stab' || e.state === 'sweep';
  }

  threatNear(p) {
    for (const e of this.enemies) {
      if (this.isThreat(e) && Math.abs(e.cx - p.cx) < (e.isBoss ? 170 : 130) && Math.abs(e.cy - p.cy) < 110) return true;
    }
    for (const pr of this.projs) {
      if (pr.owner !== 'e') continue;
      const dx = p.cx - pr.x, dy = p.cy - pr.y;
      if (Math.hypot(dx, dy) < 80 && (dx * pr.vx + dy * pr.vy) > 0) return true;
    }
    return false;
  }

  perfectDodge(p) {
    this.slowT = 0.6;
    this.float('¡ESQUIVA PERFECTA!', p.cx, p.y - 10, '#80e0ff');
    p.gainFocus(20);
    Audio2.sfx('sense');
  }

  onEnemyKO(e) {
    Audio2.sfx('ko');
    if (e.noReward) { this.particles.burst(e.cx, e.cy, 12, '#60ff90', 80); return; }
    this.stats.kos++;
    Game.save.stats.kos = (Game.save.stats.kos || 0) + 1;
    const n = e.spec.tech || 1;
    for (let i = 0; i < n; i++) this.pickups.push(new Pickup('tech', e.cx, e.cy));
    if (Math.random() < 0.25) this.pickups.push(new Pickup('health', e.cx, e.cy));
  }

  onBossKO(b) {
    this.bossDoneT = 1.8;
    this.slowT = 1.2;
    this.projs = this.projs.filter((p) => p.owner === 'p');
    for (const e of this.enemies) if (!e.dead && e !== b) { e.dead = true; e.koT = 0.6; e.noReward = true; }
    Input.rumble(1, 1, 400);
  }

  addTech(n, big = true) {
    Game.save.tech += n;
    this.stats.tech += n;
    if (big) this.float('+' + n + ' TECNOLOGÍA', this.player.cx, this.player.y - 16, UI.gold);
  }

  hitObjects(box, src) {
    const c = this.crime;
    if (c && c.type === 'persecucion' && c.car && !c.car.stopped && overlap(box, c.car)) {
      if (!c.car.hitCd || c.car.hitCd <= 0) { c.car.hitCd = 0.3; this.damageCar(c.car, 1); }
    }
  }
  webObjects(proj) {
    const c = this.crime;
    if (c && c.type === 'persecucion' && c.car && !c.car.stopped && overlap(proj.box(), c.car)) {
      this.damageCar(c.car, 1); Audio2.sfx('webhit'); return true;
    }
    return false;
  }
  damageCar(car, n) {
    car.hp -= n;
    car.flash = 0.1;
    this.particles.burst(car.x + car.w / 2, car.y + 6, 6, '#ffffff', 60);
    this.float('RED ' + Math.max(0, 4 - car.hp) + '/4', car.x + car.w / 2, car.y - 6, '#ffffff');
    if (car.hp <= 0) this.stopCar();
  }

  // ---------------- muerte y reaparición ----------------
  onPlayerDeath() {
    this.state = 'dead'; this.deadT = 1.8;
    this.combo.n = 0;
    Audio2.music(null);
    Audio2.sfx('fail');
  }

  playerFell() {
    const p = this.player;
    if (p.state === 'dead') return;
    p.hp -= 15;
    this.float('-15', p.cx, p.lastSafe.y - 10, '#ff6060');
    Audio2.sfx('hurt');
    if (p.hp <= 0) { p.hp = 0; p.state = 'dead'; this.onPlayerDeath(); p.y = p.lastSafe.y; p.x = p.lastSafe.x; p.vy = 0; return; }
    p.x = p.lastSafe.x; p.y = p.lastSafe.y; p.vx = 0; p.vy = 0; p.anchor = null; p.state = 'normal'; p.inv = 1.2;
    if (this.arena) { p.x = clamp(p.x, this.arena.x1 + 4, this.arena.x2 - p.w - 4); p.y = this.level.surfaceY(p.cx, 0) - p.h; }
  }

  respawn() {
    const p = this.player;
    this.projs = []; this.gameOver = null;
    // reiniciar arena en curso
    if (this.arena && !this.arena.done) {
      const a = this.arena;
      this.enemies = this.enemies.filter((e) => e.arena !== a && e !== this.boss);
      a.active = false; a.wave = -1; a.waitT = 0;
      this.arena = null; this.boss = null; this.illusion = 0;
    }
    this.tokensUsed = 0;
    for (const e of this.enemies) e.hasToken = false;
    const cp = this.mode === 'city' ? { x: p.lastSafe.x } : this.checkpoint;
    const np = new Player(cp.x, 0);
    np.y = this.level.surfaceY(cp.x + 5, 0) - np.h;
    if (this.mode === 'city') np.y = p.lastSafe.y;
    np.focus = p.focus; np.inv = 1.5;
    this.player = np;
    this.state = 'play';
    Audio2.music(this.mode === 'city' ? 'city' : 'action');
  }

  // ---------------- arenas ----------------
  updateArenas(dt) {
    const p = this.player;
    for (const a of this.level.arenas) {
      if (!a.done && !a.active && p.cx > a.x1 + 24 && p.cx < a.x2 && !this.arena && this.state === 'play') {
        a.active = true; this.arena = a;
        if (a.boss) this.startBoss(a);
        else { Audio2.sfx('alert'); this.float('¡EMBOSCADA!', p.cx, p.y - 20, '#ff6060'); this.nextWave(a); }
      }
    }
    const a = this.arena;
    if (!a) return;
    // paredes invisibles
    if (p.x < a.x1 + 2) { p.x = a.x1 + 2; if (p.vx < 0) p.vx = 0; if (p.state === 'swing' && p.anchor && p.anchor.x < a.x1) p.releaseSwing(); }
    if (p.x + p.w > a.x2 - 2) { p.x = a.x2 - 2 - p.w; if (p.vx > 0) p.vx = 0; if (p.state === 'swing' && p.anchor && p.anchor.x > a.x2) p.releaseSwing(); }
    if (!a.boss) {
      const alive = this.enemies.filter((e) => e.arena === a && !e.dead).length;
      if (alive === 0) {
        a.waitT = (a.waitT || 0) + dt;
        if (a.waitT > 0.8) { a.waitT = 0; this.nextWave(a); }
      }
    }
  }

  nextWave(a) {
    a.wave++;
    if (a.wave >= a.waves.length) {
      a.done = true; a.active = false; this.arena = null;
      this.float('¡ZONA DESPEJADA!', this.player.cx, this.player.y - 20, '#80ff80');
      Audio2.sfx('win');
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 10);
      return;
    }
    const list = a.waves[a.wave];
    list.forEach((type, i) => {
      const side = i % 2;
      const x = side ? a.x2 - 30 - (i >> 1) * 14 : a.x1 + 14 + (i >> 1) * 14;
      let e;
      if (type === 'drone') e = this.spawnEnemy(type, x, this.level.groundY - rand(90, 130));
      else if (Math.random() < 0.35) e = this.spawnEnemy(type, x + (side ? -40 : 40), this.cam.y - 30 - i * 10);
      else e = this.spawnEnemy(type, x, null);
      e.arena = a; e.aggro = true; e.state = 'chase'; e.facing = side ? -1 : 1;
      e.cd = rand(0.8, 1.6);
    });
  }

  startBoss(a) {
    Audio2.music('boss');
    const cls = BOSS_CLASSES[a.boss];
    const x = a.x2 - 90;
    const b = new cls(x, 0);
    b.y = b.fly ? this.level.groundY - 140 : this.level.surfaceY(x + b.w / 2, 0) - b.h;
    b.arena = a; b.facing = -1;
    this.enemies.push(b);
    this.boss = b;
    const begin = () => {
      b.state = 'move'; b.t = 1.0;
      if (b.start) b.start(this);
      a.introDone = true;
      this.showTip('tip_boss', 5);
    };
    if (!a.introDone) this.startDialog(STORY.bossIntro[this.missionIdx], begin);
    else begin();
  }

  // ---------------- ciudad: crímenes ----------------
  updateCity(dt) {
    const p = this.player;
    // faro de misión
    if (this.markerX) {
      const d = Math.abs(p.cx - this.markerX);
      if (d > 70) this.markerArmed = true;
      if (this.markerArmed && d < 16 && p.feet > this.level.groundY - 70 && this.state === 'play' && !this.dialog) {
        const m = Game.save.stage;
        this.markerArmed = false;
        this.startDialog(STORY.briefing[m], () => {
          Game.save.cityX = this.markerX - 100;
          Game.saveGame();
          Game.startMission(m);
        });
      }
    }
    // coleccionables
    for (const tk of this.level.tokens) {
      if (Game.save.tokens.includes(tk.id)) continue;
      if (Math.abs(p.cx - tk.x) < 9 && Math.abs(p.cy - tk.y) < 14) {
        Game.save.tokens.push(tk.id);
        this.addTech(3, false);
        this.float('TECNOLOGÍA STARK ' + Game.save.tokens.length + '/20', tk.x, tk.y - 10, UI.gold);
        Audio2.sfx('coin');
        this.particles.burst(tk.x, tk.y, 12, UI.gold, 80);
        if (Game.save.tokens.length === 20) this.bubble('peter', '¡Todas las piezas! Con esto puedo mejorar mucho el traje.');
        Game.saveGame();
      }
    }
    // civiles ambientales
    this.civs = this.civs.filter((c) => c.crime || (c.x > this.cam.x - 260 && c.x < this.cam.x + W + 260));
    const amb = this.civs.filter((c) => !c.crime).length;
    if (amb < 7) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const x = side < 0 ? this.cam.x - rand(20, 200) : this.cam.x + W + rand(20, 200);
      if (x > 20 && x < this.level.width - 20 && this.level.surfaceY(x, 0) >= this.level.groundY) {
        const c = new Civilian(x, this.level.groundY);
        c.dir = -side;
        this.civs.push(c);
      }
    }
    // J. Jonah Jameson
    this.jjjT -= dt;
    if (this.jjjT <= 0 && !this.radio) { this.jjjT = rand(70, 110); this.bubble('jjj', pick(STORY.jjjQuips)); }
    // crímenes
    if (!this.crime) {
      this.crimeT -= dt;
      if (this.crimeT <= 0) this.spawnCrime();
    } else this.updateCrime(dt);
    // autoguardado
    this.autoSaveT -= dt;
    if (this.autoSaveT <= 0 && p.onGround && this.state === 'play') { this.autoSaveT = 20; Game.save.cityX = p.x; Game.saveGame(); }
  }

  spawnCrime() {
    const p = this.player, lv = this.level;
    const stage = Game.save.stage;
    const types = ['robo', 'caida', 'persecucion', 'robo'];
    if (stage >= 3) types.push('drones');
    const type = pick(types);
    let x = 0;
    for (let i = 0; i < 20; i++) {
      x = p.cx + (Math.random() < 0.5 ? -1 : 1) * rand(380, 900);
      if (x > 200 && x < lv.width - 200 && (!this.markerX || Math.abs(x - this.markerX) > 200)) break;
      x = clamp(p.cx + 600, 200, lv.width - 200);
    }
    const c = { type, x, t: 100, enemies: [] };
    if (type === 'robo') {
      c.label = 'ATRACO';
      const n = randi(2, 3);
      for (let i = 0; i < n; i++) {
        const e = this.spawnEnemy(i === 0 && stage >= 2 ? 'gunner' : pick(['thug', 'thug', 'bat']), x + (i - 1) * 26, lv.groundY - 22 - (i === 0 && stage >= 2 ? 0 : 0));
        e.y = lv.groundY - e.h;
        c.enemies.push(e);
      }
      const civ = new Civilian(x + 50, lv.groundY, 'cower'); civ.crime = true; civ.say('¡AYUDA!');
      this.civs.push(civ); c.civ = civ;
    } else if (type === 'drones') {
      c.label = 'DRONES DESCONTROLADOS';
      for (let i = 0; i < 3; i++) { const e = this.spawnEnemy('drone', x + (i - 1) * 40, lv.groundY - 150 - i * 12); c.enemies.push(e); }
    } else if (type === 'caida') {
      c.label = 'CIVIL EN PELIGRO';
      // buscar un edificio alto cerca
      let best = null;
      for (const s of lv.near(x - 300, x + 300)) {
        if (s.kind === 'building' && s.vis > 120 && (!best || Math.abs(s.x - x) < Math.abs(best.x - x))) best = s;
      }
      if (!best) { this.crimeT = 3; return; }
      const civ = new Civilian(best.x + best.w - 2, best.y + 22, 'hang'); civ.crime = true; civ.hangT = 14; civ.say('¡AYUDA!');
      c.x = civ.x; c.civ = civ; this.civs.push(civ);
    } else {
      c.label = 'PERSECUCIÓN';
      const dir = x > p.cx ? 1 : -1;
      c.car = { x, y: lv.groundY - 16, w: 34, h: 16, vx: dir * 105, hp: 4, stopped: false, color: pick(['#2a2a2a', '#6a1a1a', '#1a3a6a']) };
    }
    this.crime = c;
    this.bubble('radio', { robo: 'Atraco en curso. Varios sospechosos.', caida: '¡Alguien va a caer de un edificio!', persecucion: 'Coche huyendo a toda velocidad. ¡Detenedlo!', drones: 'Drones fuera de control atacando a civiles.' }[type]);
    Audio2.sfx('alert');
  }

  stopCar() {
    const c = this.crime;
    if (!c || !c.car) return;
    c.car.stopped = true; c.car.vx = 0;
    this.shake(3); Audio2.sfx('heavy');
    this.float('¡COCHE DETENIDO!', c.car.x + 17, c.car.y - 16, '#80ff80');
    for (let i = 0; i < 2; i++) {
      const e = this.spawnEnemy(pick(['thug', 'bat']), c.car.x + 6 + i * 20, this.level.groundY - 22);
      e.aggro = true; e.state = 'chase';
      c.enemies.push(e);
    }
  }

  updateCrime(dt) {
    const c = this.crime;
    c.t -= dt;
    const lv = this.level;
    if (c.car && !c.car.stopped) {
      c.car.x += c.car.vx * dt;
      if (c.car.hitCd > 0) c.car.hitCd -= dt;
      if (c.car.flash > 0) c.car.flash -= dt;
      c.x = c.car.x;
      if (c.car.x < 60 || c.car.x > lv.width - 100) { this.endCrime(false, 'Se escaparon... La próxima vez será.'); return; }
    }
    if (c.type === 'caida' && c.civ) {
      const civ = c.civ;
      if (civ.state === 'hang') {
        civ.hangT -= dt;
        if (civ.hangT <= 0) { civ.state = 'fall'; civ.say('¡AAAH!'); }
      }
      const p = this.player;
      if ((civ.state === 'hang' || civ.state === 'fall') && Math.abs(p.cx - civ.x) < 12 && Math.abs(p.cy - (civ.y - 11)) < 20) {
        civ.state = 'saved';
        civ.y = lv.surfaceY(civ.x, civ.y - 30);
        if (civ.y > lv.groundY) civ.y = lv.groundY;
        this.endCrime(true, pick(STORY.thanks), civ);
        return;
      }
      if (civ.state === 'fall' && civ.y >= lv.groundY) {
        civ.y = lv.groundY; civ.state = 'sit';
        this.endCrime(false, 'Los bomberos lo atraparon... ¡por poco!');
        return;
      }
    }
    if (c.enemies.length && c.enemies.every((e) => e.dead)) {
      this.endCrime(true, pick(STORY.thanks), c.civ);
      return;
    }
    if (c.t <= 0) this.endCrime(false, 'Llegaste tarde. La policía se encargó.');
  }

  endCrime(ok, msg, civ) {
    const c = this.crime;
    this.crime = null;
    this.crimeT = rand(14, 24);
    if (c.civ) {
      c.civ.crime = false; c.civ.st = 3;
      if (ok && c.civ.state !== 'saved') c.civ.state = 'cheer';
      if (!ok && (c.civ.state === 'hang' || c.civ.state === 'fall')) { c.civ.y = this.level.groundY; c.civ.state = 'sit'; }
    }
    if (ok) {
      const reward = 4 + Game.save.stage;
      this.addTech(reward);
      Game.save.stats.crimes = (Game.save.stats.crimes || 0) + 1;
      Audio2.sfx('win');
      if (civ) civ.say(msg);
      else this.bubble('civil', msg);
      if (Math.random() < 0.4) this.jjjT = Math.min(this.jjjT, 4);
      Game.saveGame();
    } else {
      this.bubble('radio', msg);
      Audio2.sfx('back');
      for (const e of c.enemies) if (!e.dead) { e.aggro = false; }
    }
  }

  // ---------------- bucle ----------------
  update(dt) {
    this.t += dt;
    if (this.card) { this.card.t += dt; if (this.card.t > this.card.dur) this.card = null; }
    if (this.radio) { this.radio.t += dt; if (this.radio.t > this.radio.dur) this.radio = null; }
    if (this.tip) {
      this.tip.t += dt;
      if (this.tip.t > this.tip.dur) this.tip = this.tipQueue.length ? Object.assign(this.tipQueue.shift(), { t: 0 }) : null;
    }
    if (this.lockInput > 0) this.lockInput -= dt;
    if (this.civSayCd > 0) this.civSayCd -= dt;
    // pausa
    if (this.pause) {
      if (this.pause.update(dt) === 'close') this.pause = null;
      return;
    }
    if (this.gameOver) {
      this.gameOver.update(dt);
      this.particles.update(dt);
      return;
    }
    if (this.dialog) {
      this.dialog.update(dt);
      this.updateFloats(dt);
      this.updateCamera(dt);
      return;
    }
    if (Input.pressed('PAUSE') && this.state === 'play') { this.openPause(); return; }
    if (this.hitstopT > 0) { this.hitstopT -= dt; this.updateCamera(dt); return; }
    let gdt = dt;
    if (this.slowT > 0) { this.slowT -= dt; gdt = dt * 0.4; }
    this.stats.time += dt;

    const p = this.player;
    p.update(gdt, this);
    for (const e of this.enemies) e.update(gdt, this);
    this.enemies = this.enemies.filter((e) => !e.remove);
    for (const pr of this.projs) pr.update(gdt, this);
    this.projs = this.projs.filter((pr) => !pr.dead);
    for (const pk of this.pickups) pk.update(gdt, this);
    this.pickups = this.pickups.filter((pk) => !pk.dead);
    for (const c of this.civs) c.update(gdt, this);
    this.particles.update(gdt);
    this.updateFloats(gdt);
    // hormigueo arácnido
    if (this.senseCd > 0) this.senseCd -= dt;
    if (p.state !== 'dead' && this.threatNear(p)) {
      if (p.sense <= 0 && this.senseCd <= 0) { Audio2.sfx('sense'); this.senseCd = 0.5; }
      p.sense = 0.25;
    }
    if (this.combo.t > 0) { this.combo.t -= dt; if (this.combo.t <= 0) this.combo.n = 0; }
    if (this.shakeAmt > 0) this.shakeAmt = Math.max(0, this.shakeAmt - dt * 20);

    // consejos y puntos de control
    for (const tp of this.level.tips) {
      if (!tp.shown && p.cx > tp.x) { tp.shown = true; this.showTip(tp.text); }
    }
    for (const cp of this.level.checkpoints) {
      if (p.cx > cp.x && cp.x > this.checkpoint.x) this.checkpoint = { x: cp.x };
    }
    this.updateArenas(dt);
    if (this.mode === 'city') this.updateCity(dt);

    // jefe derrotado
    if (this.bossDoneT > 0) {
      this.bossDoneT -= dt;
      if (this.bossDoneT <= 0) {
        this.bossDoneT = -1;
        Audio2.music('title');
        this.startDialog(STORY.bossOutro[this.missionIdx], () => this.complete());
      }
    }
    // muerte
    if (this.state === 'dead') {
      this.deadT -= dt;
      if (this.deadT <= 0 && !this.gameOver) {
        if (this.mode === 'city') {
          this.float('SPIDER-MAN SE RECUPERA...', this.player.cx, this.player.y - 20, '#ffffff');
          this.respawn();
        } else this.openGameOver();
      }
    }
    // objetivo
    if (this.mode === 'mission') {
      if (this.boss && !this.boss.dead) this.objective = 'OBJETIVO: DERROTA A ' + this.boss.name;
      else if (this.arena) this.objective = 'OBJETIVO: DERROTA A LOS ENEMIGOS';
      else if (!this.boss) this.objective = 'OBJETIVO: AVANZA HACIA LA DERECHA';
      else this.objective = '';
    }
    this.updateCamera(dt);
  }

  updateFloats(dt) {
    for (const f of this.floats) { f.life -= dt; f.y -= 18 * dt; }
    this.floats = this.floats.filter((f) => f.life > 0);
  }

  updateCamera(dt) {
    const p = this.player, lv = this.level;
    let tx = p.cx - W / 2 + clamp(p.vx * 0.25, -50, 50);
    let ty = p.cy - H * 0.55;
    const k = Math.min(1, dt * 6);
    let minX = 0, maxX = lv.width - W;
    if (this.arena) {
      const a = this.arena;
      if (a.x2 - a.x1 <= W) { minX = maxX = (a.x1 + a.x2) / 2 - W / 2; }
      else { minX = Math.max(minX, a.x1); maxX = Math.min(maxX, a.x2 - W); }
    }
    tx = clamp(tx, minX, maxX);
    ty = clamp(ty, 0, lv.height - H);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * Math.min(1, dt * 5);
    this.cam.x = clamp(this.cam.x, 0, lv.width - W);
    this.cam.y = clamp(this.cam.y, 0, lv.height - H);
  }

  // ---------------- menús ----------------
  openPause() {
    Audio2.sfx('select');
    this.pause = new PauseMenu(this);
  }

  openGameOver() {
    const items = [
      { label: 'Reintentar desde el punto de control', act: () => { this.respawn(); } },
      { label: 'Volver a la ciudad', act: () => Game.goCity({ x: MARKER_X[this.missionIdx] ? MARKER_X[this.missionIdx] - 100 : 400 }) },
    ];
    if (Game.save.stage === 0) items[1] = { label: 'Menú principal', act: () => Game.toMenu() };
    this.gameOver = new Menu(items);
  }

  complete() {
    this.state = 'complete';
    Game.missionComplete(this.missionIdx, this.stats);
  }

  // ---------------- dibujo ----------------
  draw(ctx) {
    const t = this.t;
    const sh = this.shakeAmt;
    const cam = { x: Math.round(this.cam.x + (sh ? rand(-sh, sh) : 0)), y: Math.round(this.cam.y + (sh ? rand(-sh, sh) : 0)) };
    const lv = this.level;
    if (lv.indoor) {
      ctx.fillStyle = '#12141a'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#1a1d24';
      for (let x = -(cam.x * 0.5 % 60); x < W; x += 60) ctx.fillRect(Math.round(x), 0, 30, H);
      ctx.fillStyle = '#20242c';
      for (let x = -(cam.x * 0.5 % 120); x < W; x += 120) ctx.fillRect(Math.round(x) + 10, 60, 50, 30);
    } else Scenery.drawBackground(ctx, lv.sky, cam.x, cam.y, lv.height);
    if (this.boss && this.boss.drawIllusion) this.boss.drawIllusion(ctx, cam, t, this.boss.arena);
    lv.draw(ctx, cam.x, cam.y, t);
    // faro de misión
    if (this.markerX) {
      const mx = Math.round(this.markerX - cam.x);
      if (mx > -30 && mx < W + 30) {
        ctx.fillStyle = 'rgba(80,200,255,' + (0.18 + Math.sin(t * 4) * 0.06) + ')';
        ctx.fillRect(mx - 8, 0, 16, Math.round(lv.groundY - cam.y));
        ctx.fillStyle = 'rgba(160,230,255,0.35)';
        ctx.fillRect(mx - 3, 0, 6, Math.round(lv.groundY - cam.y));
        const iy = Math.round(lv.groundY - cam.y - 46 + Math.sin(t * 3) * 3);
        UI.spiderIcon(ctx, mx - 4, iy, '#ffffff');
        Font.draw(ctx, 'MISIÓN', mx, iy - 12, '#a0e8ff', { align: 'center', outline: UI.ink });
      }
    }
    // coleccionables
    if (this.mode === 'city') {
      for (const tk of lv.tokens) {
        if (Game.save.tokens.includes(tk.id)) continue;
        const x = Math.round(tk.x - cam.x), y = Math.round(tk.y - cam.y + Math.sin(t * 3 + tk.id) * 2);
        if (x < -10 || x > W + 10 || y < -10 || y > H + 10) continue;
        ctx.fillStyle = 'rgba(255,220,80,0.25)'; ctx.fillRect(x - 6, y - 6, 12, 12);
        ctx.fillStyle = UI.ink; ctx.fillRect(x - 4, y - 4, 9, 9);
        ctx.fillStyle = Math.floor(t * 4 + tk.id) % 2 ? '#80e0ff' : '#ffd040'; ctx.fillRect(x - 3, y - 3, 7, 7);
        ctx.fillStyle = '#20304a'; ctx.fillRect(x - 1, y - 1, 3, 3);
      }
    }
    // coche de persecución
    if (this.crime && this.crime.car) {
      const car = this.crime.car;
      drawDecor(ctx, { type: 'car', x: car.x, y: car.y + car.h, color: car.flash > 0 ? '#ffffff' : car.color }, cam.x, cam.y, t, lv);
      if (!car.stopped && Math.floor(t * 8) % 2) { ctx.fillStyle = '#ff3030'; ctx.fillRect(Math.round(car.x - cam.x) + 14, Math.round(car.y - cam.y), 5, 2); }
    }
    for (const c of this.civs) c.draw(ctx, cam, t);
    for (const pk of this.pickups) pk.draw(ctx, cam, t);
    for (const e of this.enemies) e.draw(ctx, cam, t);
    this.player.draw(ctx, cam, t);
    for (const pr of this.projs) pr.draw(ctx, cam, t);
    this.particles.draw(ctx, cam);
    lv.drawFront(ctx, cam.x, cam.y, t);
    // efecto de ilusión (Mysterio)
    if (this.illusion && this.boss && !this.boss.dead) {
      ctx.fillStyle = 'rgba(80,255,140,' + (0.05 + Math.sin(t * 3) * 0.04) + ')';
      ctx.fillRect(0, 0, W, H);
      for (let y = 0; y < H; y += 6) {
        const off = Math.round(Math.sin(t * 5 + y * 0.1) * 2);
        if (off) ctx.drawImage(ctx.canvas, 0, y, W, 2, off, y, W, 2);
      }
    }
    // indicador de crimen fuera de pantalla
    if (this.crime) {
      const cx = this.crime.x - cam.x;
      if (cx < 0 || cx > W) {
        const left = cx < 0;
        const ax = left ? 6 : W - 14;
        const ay = 100;
        if (Math.floor(t * 4) % 2) {
          ctx.fillStyle = '#ff3030';
          for (let i = 0; i < 5; i++) ctx.fillRect(left ? ax + i : ax + 8 - i, ay - i, 1, i * 2 + 1);
        }
        Font.draw(ctx, '!', left ? ax + 10 : ax - 6, ay - 3, '#ff5050', { outline: UI.ink });
        Font.draw(ctx, Math.round(Math.abs(this.crime.x - this.player.cx) / 10) + 'M', left ? ax : ax + 8, ay + 8, '#ffffff', { align: left ? 'left' : 'right', outline: UI.ink });
      }
    }
    if (this.markerX) {
      const mx = this.markerX - cam.x;
      if (mx < 0 || mx > W) {
        const left = mx < 0;
        const ax = left ? 6 : W - 14, ay = 120;
        ctx.fillStyle = '#60d0ff';
        for (let i = 0; i < 5; i++) ctx.fillRect(left ? ax + i : ax + 8 - i, ay - i, 1, i * 2 + 1);
        Font.draw(ctx, Math.round(Math.abs(this.markerX - this.player.cx) / 10) + 'M', left ? ax : ax + 8, ay + 8, '#a0e8ff', { align: left ? 'left' : 'right', outline: UI.ink });
      }
    }
    drawHUD(ctx, this, t);
    if (this.dialog) this.dialog.draw(ctx, t);
    else drawTouch(ctx);
    if (this.state === 'dead' || this.gameOver) {
      const a = this.gameOver ? 0.7 : clamp(1 - this.deadT / 1.8, 0, 0.7);
      ctx.fillStyle = 'rgba(40,0,0,' + a + ')'; ctx.fillRect(0, 0, W, H);
    }
    if (this.gameOver) {
      Font.draw(ctx, '¡HAS CAÍDO!', W / 2, 60, UI.red, { align: 'center', scale: 3, shadow: UI.ink });
      Font.draw(ctx, 'Pero un héroe siempre se levanta.', W / 2, 92, UI.paper, { align: 'center' });
      this.gameOver.draw(ctx, W / 2, 120, t);
    }
    if (this.pause) this.pause.draw(ctx, t);
  }
}
