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
    if (x < -30 || x > VW + 30 || y < -40 || y > VH + 30) return;
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
    this.universe = mode === 'city' ? (opts.universe || Game.save.universe || '616') : MISSIONS[this.missionIdx].universe;
    if (mode === 'city') this.level = Levels.city(this.universe);
    else this.level = Levels.mission(this.missionIdx);
    ENEMY_THEME = this.level.pals || 'thugs';
    const lv = this.level;
    const sx = opts.x !== undefined ? opts.x : (mode === 'city' ? 400 : 40);
    this.players = [];
    this.player = new Player(sx, 0);
    this.player.y = lv.surfaceY(sx + 5, 0) - this.player.h;
    if (this.player.y > lv.groundY) this.player.y = lv.groundY - this.player.h;
    this.player.lastSafe = { x: this.player.x, y: this.player.y };
    this.enemies = []; this.projs = []; this.pickups = []; this.floats = []; this.civs = []; this.fx = []; this.slowEnemiesT = 0; this.chalT = 1;
    this.particles = new Particles();
    this.cam = { x: clamp(this.player.cx - VW / 2, 0, lv.width - VW), y: clamp(this.player.cy - VH * 0.66, 0, lv.height - VH) };
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
    this.ally = null; this.allyCd = Game.allyCd || 0;
    this.flash = null; this.choice = null; this.pops = []; this.bossArena = null; this.markerMission = -1;
    // enemigos colocados
    for (const s of lv.spawns) this.spawnEnemy(s.type, s.x, s.y || null);
    if (mode === 'city') this.setupCity(opts);
    else this.setupMission(opts);
    this.setupPlayers();
  }

  // ---- multijugador local (hasta 4) ----
  // world.player es el jugador "activo": el que se está actualizando, el más cercano
  // al enemigo que se actualiza o, si no, el jugador 1.
  get player() { return this._focus || this.players[0]; }
  set player(p) { this.players[0] = p; }
  get coop() { return this.players.length > 1; }
  setupPlayers() {
    const cfg = Game.coop && Game.coop.length > 1 ? Game.coop : null;
    const p1 = this.players[0];
    p1.idx = 0;
    p1.input = cfg ? new PlayerInput(cfg[0].devs) : null;
    if (cfg && this.missionIdx !== EXTRA_MISSION) p1.suitId = cfg[0].suit;
    const keep = this.players.slice(1);
    this.players.length = 1;
    if (!cfg) return;
    for (let i = 1; i < cfg.length; i++) {
      const old = keep.find((q) => q.idx === i);
      const np = old || new Player(p1.x + i * 12, p1.y);
      np.idx = i; np.input = new PlayerInput(cfg[i].devs); np.suitId = cfg[i].suit;
      if (!old) { np.z = p1.z; np.lastSafe = { x: p1.lastSafe.x, y: p1.lastSafe.y }; np.inv = 1; }
      this.players.push(np);
    }
  }
  alivePlayers() { return this.players.filter((q) => q.state !== 'dead'); }
  nearestPlayer(x, y) {
    let best = null, bd = 1e9;
    for (const q of this.players) {
      if (q.state === 'dead') continue;
      const d = Math.abs(q.cx - x) + Math.abs(q.cy - y) * 0.5;
      if (d < bd) { bd = d; best = q; }
    }
    return best || this.players[0];
  }
  setCutscene(on) {
    for (const q of this.players) {
      if (on) { q.anchor = null; if (q.state !== 'dead') { q.state = 'cutscene'; q.attack = null; } }
      else if (q.state === 'cutscene') q.state = 'normal';
    }
  }

  get inputEnabled() { return !this.dialog && !this.flash && !this.choice && this.state === 'play' && !this.pause && this.lockInput <= 0; }

  missionMusic() { return this.universe === 'miles' || this.universe === 'n2099' ? 'verse' : this.universe === 'ruina' ? 'ruin' : 'action'; }

  setupMission() {
    const m = MISSIONS[this.missionIdx];
    this.card = { small: chapterLabel(this.missionIdx), big: m.name.toUpperCase(), sub: m.place, t: 0, dur: 3.2 };
    this.objective = 'OBJETIVO: AVANZA HACIA LA DERECHA';
    Audio2.music(this.missionMusic());
    if (m.extra) {
      // capítulo extra: eres el Peter de Tierra-0, con su traje de antes del fuego
      this.player.suitId = 'tierra0';
      this.startDialog(prepLines(STORY.extraIntro));
    }
  }

  setupCity(opts) {
    const stage = Game.save.stage, uid = this.universe, U = UNIVERSES[uid];
    Game.save.universe = uid;
    const mi = MISSIONS.findIndex((m) => m.universe === uid && m.markerX);
    if (mi > 0 && (stage === mi || stage >= STORY_DONE)) {
      this.markerX = MISSIONS[mi].markerX; this.markerMission = mi;
      this.objective = stage === mi ? 'OBJETIVO: VE AL FARO AZUL' : 'REPETIR CAPÍTULO: FARO AZUL';
      if (Math.abs(this.player.cx - this.markerX) < 80) this.markerArmed = false;
    } else if (stage >= STORY_DONE) this.objective = 'MODO LIBRE: ' + U.name.toUpperCase();
    else this.objective = 'UNIVERSO VISITADO · VIAJA DESDE EL MENÚ DE PAUSA';
    Audio2.music(U.music);
    if (!Array.isArray(Game.save.visited)) Game.save.visited = [];
    let lines = null;
    if (!Game.save.visited.includes(uid)) { Game.save.visited.push(uid); lines = STORY.arrival[uid]; Game.saveGame(); }
    const showTip = () => {
      if (!Game.save.seenCityTip) { Game.save.seenCityTip = true; Game.saveGame(); this.showTip('tip_city', 9); }
      if (!Game.save.seenAllyTip && this.allyList().length) { Game.save.seenAllyTip = true; Game.saveGame(); this.showTip('tip_ally', 8); }
    };
    this.card = { small: U.name.toUpperCase(), big: U.city.toUpperCase(), sub: 'Fragmentos: ' + Game.save.tokens.filter((k) => String(k).startsWith(uid + ':')).length + '/5', t: 0, dur: 2.8 };
    if (lines) this.startDialog(prepLines(lines), showTip);
    else showTip();
  }

  // ---------------- utilidades para entidades ----------------
  float(text, x, y, color = '#ffffff') {
    this.floats.push({ text, x, y, color, life: 1.0 });
  }
  shake(a) { if (Game.settings.shake) this.shakeAmt = Math.max(this.shakeAmt, a); }
  hitstop(t) { this.hitstopT = Math.max(this.hitstopT, t); }
  addProj(p) { if (p.z === undefined) p.z = this.emitterZ || 0; this.projs.push(p); }
  onScreen(e) { return e.x + e.w > this.cam.x - 10 && e.x < this.cam.x + VW + 10 && e.y + e.h > this.cam.y - 20 && e.y < this.cam.y + VH + 10; }
  bubble(who, text) {
    this.radio = { who, text, t: 0, dur: Math.max(3.5, text.length * 0.07) };
    if (!this.dialog) Voice.speak(who, text);
  }
  showTip(key, dur = 7) {
    const text = fillTip(STORY.tips[key] || key);
    if (this.tip) { this.tipQueue.push({ text, dur }); return; }
    const wait = this.card ? Math.max(0, this.card.dur - this.card.t) : 0;
    this.tip = { text, t: -wait, dur };
  }
  startDialog(lines, cb) {
    this.setCutscene(true);
    this.dialog = new Dialog(lines, () => {
      this.dialog = null;
      this.setCutscene(false);
      this.lockInput = 0.15;
      if (cb) cb();
    });
  }

  spawnEnemy(type, x, y) {
    const e = new Enemy(type, x, 0);
    if (y === null || y === undefined) e.y = this.level.surfaceY(x + e.w / 2, 0) - e.h;
    else e.y = Math.max(y, this.level.topY + (this.level.topY ? 2 : -9999));
    e.hoverY = e.y;
    if (e.y + e.h >= this.level.groundY - 1 || e.fly) e.z = rand(0, DEPTH_MAX);
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
    const w = new Proj('web', x, y, dir / l * 330, dy / l * 330, 'p', 0);
    w.z = this.player.z;
    this.projs.push(w);
  }

  playerHits(e, dmg, kx, ky, heavy) {
    const P = this.player;
    // poderes y habilidades que potencian el golpe
    if (P.furyT > 0) dmg *= 1.5;
    if (P.cloakT > 0) dmg *= 2;
    if (P.counterT > 0) { dmg *= 2; ky = Math.min(ky, -280); P.counterT = 0; this.float('¡CONTRA!', e.cx, e.y - 10, '#80e0ff'); }
    this.lastHitE = e; this.lastHitT = 3.5;
    if (!e.takeHit(dmg, kx, ky, heavy, this)) return;
    if (P.shockT > 0 && !e.dead) { e.web(0.8, this); for (let i = 0; i < 6; i++) this.particles.spark(e.cx + rand(-6, 6), e.cy + rand(-8, 8), '#80e0ff', 1); }
    this.hitstop(heavy ? 0.07 : 0.035);
    this.shake(heavy ? 3 : 1.5);
    this.particles.hit(e.cx, e.cy, heavy);
    Audio2.sfx(heavy ? 'heavy' : 'punch');
    Input.rumble(heavy ? 0.5 : 0.2, heavy ? 0.6 : 0.4, heavy ? 90 : 50);
    this.player.gainFocus(heavy ? 10 : 6);
    this.combo.n++; this.combo.t = 2.2;
    Progress.rec('maxCombo', this.combo.n, 'max');
    this.stats.hits++;
    if (this.level.comic && Math.random() < 0.6) this.pops.push({ text: pick(['¡POW!', '¡BAM!', '¡THWIP!', '¡KRAK!', '¡ZAS!']), x: e.cx + rand(-8, 8), y: e.y - 6, t: 0, c: pick(['#ffe040', '#40f0ff', '#ff4a8a']) });
    if (this.combo.n > this.stats.maxCombo) this.stats.maxCombo = this.combo.n;
  }

  areaHit(x, y, r, dmg, kx, ky, src, web) {
    for (const e of this.enemies) {
      if (e.dead || !e.hittable()) continue;
      if (dist(x, y, e.cx, e.cy) < r && Math.abs((e.z || 0) - ((src && src.z) || 0)) < 18) {
        this.playerHits(e, dmg, sign(e.cx - x || 1) * kx, ky, true);
        if (web && !e.dead) e.web(2, this);
      }
    }
    this.hitObjects({ x: x - r, y: y - r, w: r * 2, h: r * 2 }, src);
  }

  // Bola de red del jugador: habilidades de red eléctrica y de impacto
  onWebHit(e, proj) {
    if (Progress.has('i_electrica') && !e.dead) { e.takeHit(0.6, 0, 0, false, this); for (let i = 0; i < 5; i++) this.particles.spark(e.cx + rand(-6, 6), e.cy + rand(-8, 8), '#80e0ff', 1); }
    if (Progress.has('i_impacto') && !e.dead && !e.isBoss) { e.vx = sign(proj.vx || 1) * 220; e.vy = -120; }
  }
  // Tirón de red: atrae al enemigo que tienes delante
  yank(p) {
    let best = null, bd = 170;
    for (const e of this.enemies) {
      if (e.dead || !e.hittable() || e.isBoss || Math.abs((e.z || 0) - p.z) > LANE + 4) continue;
      const dx = (e.cx - p.cx) * p.facing;
      if (dx > 10 && dx < bd && Math.abs(e.cy - p.cy) < 50) { bd = dx; best = e; }
    }
    if (!best) return false;
    this.fx.push(new GBeam(p.cx, p.y + 8, best.cx, best.cy, '#ffffff'));
    best.x = p.cx + p.facing * 16 - best.w / 2; best.vx = 0; best.web(1.4, this);
    this.particles.burst(best.cx, best.cy, 8, '#ffffff', 60);
    Audio2.sfx('thwip');
    return true;
  }

  damagePlayer(dmg, srcX, srcZ) {
    if (srcZ !== undefined && Math.abs(srcZ - this.player.z) > LANE) return false;
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
      if (pr.hazard) { if (pr.t > -0.3 && pr.t < (pr.kind === 'tornado' ? pr.life : pr.warn) && Math.abs(p.cx - pr.x) < 40) return true; continue; }
      const dx = p.cx - pr.x, dy = p.cy - pr.y;
      if (Math.hypot(dx, dy) < 80 && (dx * pr.vx + dy * pr.vy) > 0) return true;
    }
    return false;
  }

  perfectDodge(p) {
    this.slowT = 0.6;
    Progress.rec('perfect', 1);
    if (Progress.has('d_contra')) p.counterT = 2;
    this.float('¡ESQUIVA PERFECTA!', p.cx, p.y - 10, '#80e0ff');
    p.gainFocus(20);
    Audio2.sfx('sense');
  }

  onEnemyKO(e) {
    Audio2.sfx('ko');
    if (e.noReward) { this.particles.burst(e.cx, e.cy, 12, '#60ff90', 80); return; }
    this.stats.kos++;
    Game.save.stats.kos = (Game.save.stats.kos || 0) + 1;
    Progress.addXP(e.type === 'brute' ? 25 : 12, this);
    const n = e.spec.tech || 1;
    for (let i = 0; i < n; i++) { const pk = new Pickup('tech', e.cx, e.cy); pk.z = e.z || 0; this.pickups.push(pk); }
    if (Math.random() < 0.25) { const pk = new Pickup('health', e.cx, e.cy); pk.z = e.z || 0; this.pickups.push(pk); }
  }

  onBossKO(b) {
    this.bossDoneT = 1.8;
    if (!b.escaped) { Progress.rec('bosses', 1); Progress.addXP(200, this); }
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
    // en multijugador, un compañero caído vuelve a los pocos segundos si queda alguien en pie
    if (this.coop && this.alivePlayers().length) {
      const q = this.player; q.reviveT = 5;
      this.float('¡J' + (q.idx + 1) + ' CAÍDO! VUELVE EN 5 s', q.cx, q.y - 16, '#ff8080');
      Audio2.sfx('fail');
      return;
    }
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
    p.x = p.lastSafe.x; p.y = p.lastSafe.y; p.vx = 0; p.vy = 0; p.anchor = null; p.state = 'normal'; p.inv = 1.2; p.hurtT = 1.2;
    if (this.arena) { p.x = clamp(p.x, this.arena.x1 + 4, this.arena.x2 - p.w - 4); p.y = this.level.surfaceY(p.cx, 0) - p.h; }
  }

  respawn() {
    const p = this.player;
    this.projs = []; this.gameOver = null; p.stuckT = 0;
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
    np.focus = p.focus; np.inv = 1.5; np.hurtT = 1.5; np.suitId = p.suitId;
    const others = this.players.slice(1);
    this.players = [np];
    for (const q of others) { q.state = 'normal'; q.hp = q.maxHp; q.x = np.x + q.idx * 12; q.y = np.y; q.vx = q.vy = 0; q.inv = 1.5; q.reviveT = 0; q.stuckT = 0; this.players.push(q); }
    this.setupPlayers();
    this.state = 'play';
    Audio2.music(this.mode === 'city' ? UNIVERSES[this.universe].music : this.missionMusic());
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
    if (this.arena && this.arena.done) { this.arena.active = false; this.arena = null; }
    const a = this.arena;
    if (!a) return;
    // paredes invisibles
    for (const q of this.players) {
      if (q.x < a.x1 + 2) { q.x = a.x1 + 2; if (q.vx < 0) q.vx = 0; if (q.state === 'swing' && q.anchor && q.anchor.x < a.x1) q.releaseSwing(); }
      if (q.x + q.w > a.x2 - 2) { q.x = a.x2 - 2 - q.w; if (q.vx > 0) q.vx = 0; if (q.state === 'swing' && q.anchor && q.anchor.x > a.x2) q.releaseSwing(); }
    }
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
    const d = Game.settings.difficulty;
    b.hp = b.maxHp = Math.ceil(b.maxHp * BOSS_HP_MUL[d]);
    b.baseDmg = b.baseDmg * BOSS_DMG_MUL[d];
    this.enemies.push(b);
    this.boss = b;
    const begin = () => {
      b.state = 'move'; b.t = 1.0;
      if (b.start) b.start(this);
      a.introDone = true;
      this.showTip('tip_boss', 5);
    };
    b.escapeAt = a.escape || 0;
    this.bossArena = a;
    const intro = STORY.bossIntro[a.boss];
    if (!a.introDone && intro) this.startDialog(prepLines(intro), begin);
    else begin();
  }

  afterBoss() {
    const a = this.bossArena, b = this.boss;
    if (!a) { this.complete(); return; }
    Audio2.music('sad');
    const finish = () => {
      if (a.final) {
        if (a.boss === 'desconocido4') this.finalChoice();
        else if (a.boss === 'doombot') { this.startDialog(prepLines(STORY.extraEnd), () => { this.state = 'complete'; Game.extraComplete(this.stats); }); }
        else this.complete();
        return;
      }
      a.done = true; a.active = false;
      this.arena = null; this.boss = null; this.bossArena = null;
      this.enemies = this.enemies.filter((e) => e !== b);
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 30);
      Audio2.music(this.missionMusic());
      this.float('¡SIGUE ADELANTE!', this.player.cx, this.player.y - 20, '#80ff80');
    };
    const next = () => { if (a.canonAfter) this.startCanon(a.canonAfter, finish); else finish(); };
    const outro = STORY.bossOutro[a.boss];
    if (outro) this.startDialog(prepLines(outro), next); else next();
  }

  // ---------------- refuerzo multiversal ----------------
  allyList() {
    const s = Game.save.stage, l = [];
    if (this.missionIdx === EXTRA_MISSION) return l;
    if (s >= 2) l.push('tobey');
    if (s >= 3) l.push('andrew');
    if (s >= 4) l.push('miles', 'gwen');
    return l;
  }
  callAlly() {
    const p = this.player;
    const list = this.allyList();
    if (!list.length) { this.float('AÚN NO CONOCES A OTROS SPIDER-MAN', p.cx, p.y - 12, '#c0c0d0'); Audio2.sfx('back'); return; }
    if (this.ally) return;
    if (this.allyCd > 0) { this.float('REFUERZO EN ' + Math.ceil(this.allyCd) + 's', p.cx, p.y - 12, '#c0c0d0'); Audio2.sfx('back'); return; }
    // se prefiere el aliado del universo actual
    const who = list.includes(this.universe) ? this.universe : pick(list);
    const dir = Math.random() < 0.5 ? 1 : -1;
    this.ally = { who, t: 0, dur: 1.5, dir, hit: false, z: p.z };
    this.allyCd = ALLY_CD; Game.allyCd = ALLY_CD;
    const lines = { tobey: '¡Aquí estoy, Peter!', andrew: 'Estoy bien, estoy bien... ¡Voy!', miles: '¡Salto de fe!', gwen: '¿Me echabas de menos?' };
    this.bubble(who === 'gwen' ? 'gwen' : who, lines[who]);
    Audio2.sfx('glitch'); Audio2.sfx('thwip');
    this.shake(3);
  }
  updateAlly(dt) {
    const a = this.ally;
    a.t += dt;
    if (!a.hit && a.t > a.dur * 0.5) {
      a.hit = true;
      Audio2.sfx('special'); this.shake(6); Input.rumble(0.8, 0.8, 250);
      for (const e of this.enemies) {
        if (e.dead || !e.hittable() || !this.onScreen(e)) continue;
        const dmg = e.isBoss ? 6 * this.player.dmgMul : 4 * this.player.dmgMul;
        this.playerHits(e, dmg, (e.cx > this.cam.x + VW / 2 ? 1 : -1) * 160, e.isBoss ? -40 : -220, true);
        if (!e.dead && !e.isBoss) e.web(2.5, this);
      }
      // detiene también el coche de una persecución
      if (this.crime && this.crime.car && !this.crime.car.stopped) this.stopCar();
    }
    if (a.t >= a.dur) this.ally = null;
  }
  drawAlly(ctx, cam, t) {
    const a = this.ally;
    const u = a.t / a.dur;
    const x = a.dir > 0 ? -30 + u * (VW + 60) : VW + 30 - u * (VW + 60);
    const y = 30 + Math.sin(u * Math.PI) * 40;
    // portales de entrada y salida
    const px = a.dir > 0 ? 16 : VW - 16, qx = a.dir > 0 ? VW - 16 : 16;
    for (const [xx, vis] of [[px, u < 0.3], [qx, u > 0.7]]) {
      if (!vis) continue;
      const cols = ['#ffffff', '#60ffe0', '#ff40c0', '#ffe040'];
      for (let i = 0; i < 40; i++) { ctx.fillStyle = cols[(i + Math.floor(t * 12)) % 4]; ctx.fillRect(Math.round(xx + Math.sin(i * 0.5 + t * 6) * 4), 20 + i, 3, 1); }
    }
    const anchorX = x + a.dir * 30, anchorY = 0;
    ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, Math.round(y) - 16); ctx.lineTo(Math.round(anchorX) + 0.5, anchorY); ctx.stroke();
    const pal = a.who === 'gwen' ? GWEN_PAL : SUITS.find((s) => s.id === { tobey: 'raimi', andrew: 'tasm', miles: 'verse' }[a.who]).palObj;
    const pose = u > 0.45 && u < 0.62 ? Poses.swingkick() : Poses.swing(170);
    if (!(u > 0.45 && u < 0.62)) pose.rot = Math.atan2(anchorX - x, y - anchorY) / D2R * a.dir * 0.9;
    Rig.draw(ctx, Math.round(x), Math.round(y), a.dir, pose, pal, { scale: 1.3 });
    if (a.hit && a.t < a.dur * 0.62) { ctx.fillStyle = 'rgba(255,255,255,' + (0.5 - (a.t - a.dur * 0.5) * 3) + ')'; ctx.fillRect(0, 0, W, H); }
  }

  // ---------------- eventos canónicos ----------------
  startCanon(id, cb) {
    const C = CANONS[id];
    this.setCutscene(true);
    Audio2.music(null);
    if (!Game.save.seenCanonTip) { Game.save.seenCanonTip = true; }
    this.flash = new FlashSeq(C.flashes, () => {
      this.flash = null;
      if (C.forced) {
        // Peter Cero ya eligió: no hay decisión, solo el recuerdo
        this.shake(6); Audio2.sfx('explode'); Audio2.music('sad');
        this.startDialog(prepLines(C.saved), () => { Audio2.music(this.missionMusic()); if (cb) cb(); });
        return;
      }
      this.choice = new ChoiceBox('EVENTO CANÓNICO: ' + C.title, C.text, [{ id: 'save', label: C.save }, { id: 'keep', label: C.keep }], (opt) => {
        this.choice = null;
        if (!Game.save.canon) Game.save.canon = {};
        Game.save.canon[id] = opt === 'save';
        Game.saveGame();
        if (opt === 'save') { this.shake(8); Audio2.sfx('explode'); Input.rumble(1, 1, 500); }
        else Audio2.sfx('fail');
        Audio2.music('sad');
        this.startDialog(prepLines(opt === 'save' ? C.saved : C.kept), () => {
          if (opt === 'save') this.float('CANON ROTO (' + canonCount() + '/' + CANON_ORDER.length + ')', this.player.cx, this.player.y - 20, '#ff60c0');
          Audio2.music(this.missionMusic());
          if (cb) cb();
        });
      });
    });
  }

  finalChoice() {
    const n = canonCount();
    const text = 'Cánones rotos: ' + n + '/' + CANON_ORDER.length + '. ' + (n <= 3 ? 'Las grietas todavía pueden cerrarse.' : 'Las grietas son enormes. Quizás demasiado.');
    Audio2.music('sad');
    this.choice = new ChoiceBox(STORY.finalChoice.title, text, STORY.finalChoice.options, (id) => {
      this.choice = null;
      Game.save.lastChoice = id;
      const ending = id === 'dentro' ? 'neutral' : id === 'deshacer' ? 'triste' : (n <= 3 ? 'feliz' : 'triste');
      this.state = 'complete';
      Game.finishGame(ending, this.stats);
    });
  }

  // ---------------- ciudad: crímenes ----------------
  updateCity(dt) {
    const p = this.player;
    // faro de misión
    if (this.markerX) {
      const d = Math.abs(p.cx - this.markerX);
      if (d > 70) this.markerArmed = true;
      if (this.markerArmed && d < 16 && p.feet > this.level.groundY - 70 && this.state === 'play' && !this.dialog) {
        const m = this.markerMission;
        this.markerArmed = false;
        this.startDialog(prepLines(STORY.briefing[m] || [['peter', 'Allá vamos otra vez.']]), () => {
          Game.save.cityPos[this.universe] = this.markerX - 100;
          Game.saveGame();
          Game.startMission(m);
        });
      }
    }
    // coleccionables
    for (const tk of this.level.tokens) {
      if (Game.save.tokens.includes(tk.id)) continue;
      if (this.players.some((q) => Math.abs(q.cx - tk.x) < 9 && Math.abs(q.cy - tk.y) < 14)) {
        Game.save.tokens.push(tk.id);
        this.addTech(3, false);
        Progress.addXP(40, this);
        this.float('FRAGMENTO ' + Game.save.tokens.length + '/' + STORY.fragments.length, tk.x, tk.y - 10, UI.gold);
        this.showTip('"' + STORY.fragments[tk.idx] + '"', 6);
        Audio2.sfx('coin');
        this.particles.burst(tk.x, tk.y, 12, '#60ffe0', 80);
        if (Game.save.tokens.length === 25) this.bubble('peter', 'Todos los fragmentos... Ahora entiendo un poco mejor el multiverso.');
        Game.saveGame();
      }
    }
    // civiles ambientales
    this.civs = this.civs.filter((c) => c.crime || (c.x > this.cam.x - 260 && c.x < this.cam.x + VW + 260));
    const amb = this.civs.filter((c) => !c.crime).length;
    if (amb < 7) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const x = side < 0 ? this.cam.x - rand(20, 200) : this.cam.x + VW + rand(20, 200);
      if (x > 20 && x < this.level.width - 20 && this.level.surfaceY(x, 0) >= this.level.groundY) {
        const c = new Civilian(x, this.level.groundY);
        c.dir = -side; c.z = rand(0, DEPTH_MAX);
        this.civs.push(c);
      }
    }
    // J. Jonah Jameson
    this.jjjT -= dt;
    if (this.jjjT <= 0 && !this.radio) { this.jjjT = rand(70, 110); const q = pick(STORY.radio[this.universe] || STORY.radio['616']); this.bubble(q[0], q[1]); }
    // crímenes
    if (!this.crime) {
      this.crimeT -= dt;
      if (this.crimeT <= 0) this.spawnCrime();
    } else this.updateCrime(dt);
    // autoguardado
    this.autoSaveT -= dt;
    if (this.autoSaveT <= 0 && p.onGround && this.state === 'play') { this.autoSaveT = 20; Game.save.cityPos[this.universe] = p.x; Game.save.universe = this.universe; Game.saveGame(); }
  }

  spawnCrime() {
    const p = this.player, lv = this.level;
    const stage = Game.save.stage;
    const types = UNIVERSES[this.universe].crimes.slice();
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
        e.y = lv.surfaceY(e.cx, lv.groundY - 40) - e.h;
        c.enemies.push(e);
      }
      const civ = new Civilian(x + 50, lv.groundY, 'cower'); civ.crime = true; civ.say('¡AYUDA!');
      this.civs.push(civ); c.civ = civ;
    } else if (type === 'zombies') {
      c.label = 'ZOMBIS';
      for (let i = 0; i < 4; i++) { const e = this.spawnEnemy('zombie', x + (i - 1.5) * 24, null); c.enemies.push(e); }
      const civ = new Civilian(x + 60, lv.surfaceY(x + 60, lv.groundY - 40), 'cower'); civ.crime = true; civ.say('¡AYUDA!');
      this.civs.push(civ); c.civ = civ;
    } else if (type === 'drones' || type === 'ultron') {
      c.label = type === 'ultron' ? 'ULTRONES' : 'DRONES DESCONTROLADOS';
      for (let i = 0; i < 3; i++) { const e = this.spawnEnemy(type === 'ultron' ? 'ultron' : 'drone', x + (i - 1) * 40, lv.groundY - 150 - i * 12); c.enemies.push(e); }
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
    this.bubble('radio', { robo: 'Atraco en curso. Varios sospechosos.', caida: '¡Alguien va a caer de un edificio!', persecucion: 'Coche huyendo a toda velocidad. ¡Detenedlo!', drones: 'Drones fuera de control atacando a civiles.', zombies: 'Zombis cerca de un superviviente.', ultron: 'Ultrones patrullando la zona.' }[type]);
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
      Progress.addXP(80, this);
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
    if (this.flash) { this.flash.update(dt); return; }
    if (this.choice) { this.choice.update(dt); return; }
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

    for (const q of this.players) { this._focus = q; q.update(gdt, this); }
    this._focus = null;
    this.updateCoop(dt);
    const p = this.player;
    if (this.slowEnemiesT > 0) this.slowEnemiesT -= dt;
    const edt = this.slowEnemiesT > 0 ? gdt * 0.35 : gdt;
    for (const e of this.enemies) { this.emitterZ = e.z || 0; this._focus = this.nearestPlayer(e.cx, e.cy); e.update(edt, this); }
    this.emitterZ = 0;
    this.enemies = this.enemies.filter((e) => !e.remove);
    for (const pr of this.projs) { this._focus = pr.owner === 'e' ? this.nearestPlayer(pr.x, pr.y) : null; pr.update(pr.owner === 'e' ? edt : gdt, this); }
    this._focus = null;
    this.projs = this.projs.filter((pr) => !pr.dead);
    this.fx = this.fx.filter((f) => f.update(gdt, this));
    // retos: se comprueban cada segundo
    this.chalT -= dt;
    if (this.chalT <= 0) { this.chalT = 1; Progress.checkChallenges(this); }
    for (const pk of this.pickups) { this._focus = this.nearestPlayer(pk.x, pk.y); pk.update(gdt, this); }
    this._focus = null;
    this.pickups = this.pickups.filter((pk) => !pk.dead);
    for (const c of this.civs) c.update(gdt, this);
    this.particles.update(gdt);
    this.updateFloats(gdt);
    // hormigueo arácnido
    if (this.senseCd > 0) this.senseCd -= dt;
    for (const q of this.players) {
      if (q.state !== 'dead' && this.threatNear(q)) {
        if (q.sense <= 0 && this.senseCd <= 0) { Audio2.sfx('sense'); this.senseCd = 0.5; }
        q.sense = 0.25;
      }
    }
    // Refuerzo multiversal (R3)
    if (this.allyCd > 0) { this.allyCd -= dt; Game.allyCd = this.allyCd; }
    if (this.inputEnabled && this.players.some((q) => q.state !== 'dead' && (q.input || Input).pressed('ALLY'))) this.callAlly();
    if (this.ally) this.updateAlly(gdt);
    if (this.combo.t > 0) { this.combo.t -= dt; if (this.combo.t <= 0) this.combo.n = 0; }
    if (this.shakeAmt > 0) this.shakeAmt = Math.max(0, this.shakeAmt - dt * 20);

    // consejos y puntos de control
    for (const tp of this.level.tips) {
      if (!tp.shown && p.cx > tp.x) { tp.shown = true; this.showTip(tp.text); }
    }
    for (const cp of this.level.checkpoints) {
      if (p.cx > cp.x && cp.x > this.checkpoint.x) this.checkpoint = { x: cp.x };
    }
    for (const lc of this.level.canons) {
      if (!lc.done && p.cx > lc.x && this.state === 'play' && !this.arena && !this.dialog) { lc.done = true; this.startCanon(lc.id); break; }
    }
    this.updateArenas(dt);
    if (this.mode === 'city') this.updateCity(dt);
    for (const pp of this.pops) pp.t += dt;
    if (this.lastHitT > 0) this.lastHitT -= dt;
    this.pops = this.pops.filter((pp) => pp.t < 0.5);

    // jefe derrotado
    if (this.bossDoneT > 0) {
      this.bossDoneT -= dt;
      if (this.bossDoneT <= 0) {
        this.bossDoneT = -1;
        this.afterBoss();
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
      if (this.boss && !this.boss.dead) this.objective = 'OBJETIVO: DERROTA ' + (this.boss.name.startsWith('EL ') ? 'AL ' + this.boss.name.slice(3) : 'A ' + this.boss.name);
      else if (this.arena) this.objective = 'OBJETIVO: DERROTA A LOS ENEMIGOS';
      else if (!this.boss) this.objective = 'OBJETIVO: AVANZA HACIA LA DERECHA';
      else this.objective = '';
    }
    this.updateCamera(dt);
  }

  // Compañeros: reaparición y "correa" para que nadie se quede fuera de la pantalla
  updateCoop(dt) {
    if (!this.coop) return;
    const lead = this.alivePlayers()[0];
    for (const q of this.players) {
      if (q.state === 'dead' && q.reviveT > 0) {
        q.reviveT -= dt;
        if (q.reviveT <= 0 && lead) {
          q.state = 'normal'; q.hp = Math.ceil(q.maxHp / 2); q.x = lead.x; q.y = lead.y - 4; q.z = lead.z; q.vx = 0; q.vy = 0; q.inv = 2; q.hurtT = 2;
          this.particles.burst(q.cx, q.cy, 16, '#60ffe0', 90);
          this.float('¡J' + (q.idx + 1) + ' VUELVE!', q.cx, q.y - 12, '#80ff80');
        }
      }
      if (!lead || q === lead || q.state === 'dead') continue;
      if (Math.abs(q.cx - lead.cx) > VW * 0.85 || Math.abs(q.cy - lead.cy) > VH * 0.9) {
        this.particles.burst(q.cx, q.cy, 10, '#60ffe0', 70);
        q.x = lead.x - (q.idx) * 10; q.y = lead.y; q.z = lead.z; q.vx = 0; q.vy = 0; q.anchor = null;
        if (['swing', 'wall', 'facade'].includes(q.state)) q.state = 'normal';
        this.particles.burst(q.cx, q.cy, 10, '#60ffe0', 70);
      }
    }
  }

  updateFloats(dt) {
    for (const f of this.floats) { f.life -= dt; f.y -= 18 * dt; }
    this.floats = this.floats.filter((f) => f.life > 0);
  }

  updateCamera(dt) {
    const lv = this.level;
    const al = this.coop ? this.alivePlayers() : [];
    const p = al.length ? { cx: al.reduce((s2, q) => s2 + q.cx, 0) / al.length, cy: al.reduce((s2, q) => s2 + q.cy, 0) / al.length, vx: al.reduce((s2, q) => s2 + q.vx, 0) / al.length, z: al.reduce((s2, q) => s2 + (q.z || 0), 0) / al.length } : this.player;
    let tx = p.cx - VW / 2 + clamp(p.vx * 0.2, -30, 30);
    let ty = p.cy - (p.z || 0) * 0.5 - VH * 0.66;
    const k = Math.min(1, dt * 6);
    let minX = 0, maxX = lv.width - VW;
    if (this.arena) {
      const a = this.arena;
      if (a.x2 - a.x1 <= VW) { minX = maxX = (a.x1 + a.x2) / 2 - VW / 2; }
      else { minX = Math.max(minX, a.x1); maxX = Math.min(maxX, a.x2 - VW); }
    }
    tx = clamp(tx, minX, maxX);
    ty = clamp(ty, 0, lv.height - VH);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * Math.min(1, dt * 5);
    this.cam.x = clamp(this.cam.x, 0, lv.width - VW);
    this.cam.y = clamp(this.cam.y, 0, lv.height - VH);
  }

  // ---------------- menús ----------------
  openPause() {
    Voice.stop();
    Audio2.sfx('select');
    this.pause = new PsMenu(this);
  }

  openGameOver() {
    const items = [
      { label: 'Reintentar desde el punto de control', act: () => { this.respawn(); } },
      { label: 'Volver a la ciudad', act: () => Game.goCity({ universe: this.universe, x: MISSIONS[this.missionIdx].markerX ? MISSIONS[this.missionIdx].markerX - 100 : 400 }) },
    ];
    if (Game.save.stage === 0 || this.missionIdx === EXTRA_MISSION) items[1] = { label: 'Menú principal', act: () => Game.toMenu() };
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
    // el fondo lejano se dibuja a resolución de pantalla; el mundo, con zoom
    if (lv.indoor) Scenery.drawIndoor(ctx, cam.x * ZOOM, cam.y * ZOOM);
    else Scenery.drawBackground(ctx, lv.sky, cam.x * ZOOM, cam.y * ZOOM, lv.height * ZOOM, lv.landmark);
    ctx.setTransform(RES * ZOOM, 0, 0, RES * ZOOM, 0, 0);
    Rig.ws = 1.2;
    FacadeRow.draw(ctx, lv, cam);
    if (this.boss && this.boss.drawIllusion) this.boss.drawIllusion(ctx, cam, t, this.boss.arena);
    lv.draw(ctx, cam.x, cam.y, t);
    // faro de misión
    if (this.markerX) {
      const mx = Math.round(this.markerX - cam.x);
      if (mx > -30 && mx < VW + 30) {
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
        const x = Math.round(tk.x - cam.x), y = Math.round(tk.y - cam.y + Math.sin(t * 3 + tk.idx) * 2);
        if (x < -10 || x > VW + 10 || y < -10 || y > VH + 10) continue;
        ctx.fillStyle = 'rgba(255,220,80,0.25)'; ctx.fillRect(x - 6, y - 6, 12, 12);
        ctx.fillStyle = UI.ink; ctx.fillRect(x - 4, y - 4, 9, 9);
        ctx.fillStyle = Math.floor(t * 4 + tk.idx) % 2 ? '#80ffe8' : '#ff60c0'; ctx.fillRect(x - 3, y - 3, 7, 7);
        ctx.fillStyle = '#20304a'; ctx.fillRect(x - 1, y - 1, 3, 3);
      }
    }
    // coche de persecución
    if (this.crime && this.crime.car) {
      const car = this.crime.car;
      drawDecor(ctx, { type: 'car', x: car.x, y: car.y + car.h, color: car.flash > 0 ? '#ffffff' : car.color }, cam.x, cam.y, t, lv);
      if (!car.stopped && Math.floor(t * 8) % 2) { ctx.fillStyle = '#ff3030'; ctx.fillRect(Math.round(car.x - cam.x) + 14, Math.round(car.y - cam.y), 5, 2); }
    }
    // entidades ordenadas por profundidad (las del fondo primero), con sombra
    const ents = [];
    for (const c of this.civs) ents.push({ z: c.z || 0, o: c, k: 0 });
    for (const pk of this.pickups) ents.push({ z: pk.z || 0, o: pk, k: 1 });
    for (const e of this.enemies) ents.push({ z: e.z || 0, o: e, k: 2 });
    for (const q of this.players) ents.push({ z: q.z || 0, o: q, k: 3 });
    ents.sort((a, b) => b.z - a.z || a.k - b.k);
    for (const en of ents) {
      const o = en.o, zo = Math.round(en.z);
      ctx.save(); ctx.translate(0, -zo);
      if (en.k === 3) lv.shadow(ctx, o.cx, o.feet, cam, 12);
      else if (en.k === 2 && !o.dead && this.onScreen(o)) lv.shadow(ctx, o.cx, o.y + o.h, cam, o.w + 4);
      o.draw(ctx, cam, t);
      ctx.restore();
    }
    if (this.ally) this.drawAlly(ctx, cam, t);
    for (const pr of this.projs) { ctx.save(); ctx.translate(0, -Math.round(pr.z || 0)); pr.draw(ctx, cam, t); ctx.restore(); }
    for (const f of this.fx) f.draw(ctx, cam, t);
    if (this.slowEnemiesT > 0) { ctx.fillStyle = 'rgba(80,120,255,0.08)'; ctx.fillRect(0, 0, W, H); }
    this.particles.draw(ctx, cam);
    lv.drawFront(ctx, cam.x, cam.y, t);
    // onomatopeyas de cómic
    for (const pp of this.pops) {
      const s2 = pp.t < 0.1 ? 2 : 1;
      Font.draw(ctx, pp.text, Math.round(pp.x - cam.x), Math.round(pp.y - cam.y - pp.t * 20), pp.c, { align: 'center', scale: s2, outline: '#000000' });
    }
    // vuelta a coordenadas de pantalla para los efectos y la interfaz
    ctx.setTransform(RES, 0, 0, RES, 0, 0);
    Rig.ws = 1;
    // tinte del universo
    if (lv.tint) { ctx.fillStyle = lv.tint; ctx.fillRect(0, 0, W, H); }
    if (lv.comic) {
      ctx.fillStyle = 'rgba(0,0,0,0.06)';
      for (let yy = 0; yy < H; yy += 3) ctx.fillRect(0, yy, W, 1);
    }
    // efecto de ilusión (Mysterio)
    if (this.illusion && this.boss && !this.boss.dead) {
      ctx.fillStyle = 'rgba(80,255,140,' + (0.05 + Math.sin(t * 3) * 0.04) + ')';
      ctx.fillRect(0, 0, W, H);
      for (let y = 0; y < H; y += 6) {
        const off = Math.round(Math.sin(t * 5 + y * 0.1) * 2);
        if (off) ctx.drawImage(ctx.canvas, 0, y * RES, W * RES, 2 * RES, off, y, W, 2);
      }
    }
    // indicador de crimen fuera de pantalla
    if (this.crime) {
      const cx = (this.crime.x - cam.x) * ZOOM;
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
      const mx = (this.markerX - cam.x) * ZOOM;
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
    else if (!this.flash && !this.choice) drawTouch(ctx);
    if (this.choice) this.choice.draw(ctx, t);
    if (this.flash) this.flash.draw(ctx, t);
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
