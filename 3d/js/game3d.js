'use strict';
// ---------------------------------------------------------------------------
// Rompecánones 3D: bucle principal, cámara en tercera persona, misión del
// capítulo 1, crímenes del mundo abierto, interfaz, diálogos con voz y menú.
// ---------------------------------------------------------------------------
// Ajustes y partida compartidos con la versión 2.5D (trajes, cánones, voces)
const Game = {
  settings: Object.assign({ music: 7, sfx: 8, voices: 8 }, Store.get('sm_settings', {}) || {}),
  save: Object.assign({ suits: START_SUITS.slice(), canon: {}, endings: [], stage: 0 }, Store.get('sm_save', {}) || {}),
};
const SAVE3 = Object.assign({ suit: 'bnd', ch1: false, crimes: 0, invertY: false, sens: 5, fx: true }, Store.get('sm_save3d', {}) || {});
const save3 = () => Store.set('sm_save3d', SAVE3);
const $ = (id) => document.getElementById(id);

const Game3 = {
  time: 0, timeScale: 1, slowT: 0, hitStop: 0, shakeT: 0, camYaw: Math.PI, camPitch: -0.22, camDist: 4.5, lookIdle: 0,
  enemies: [], projs: [], floats: [], tokens: new Set(), menuOpen: false, dialog: null, mode: 'free', inCombat: false,
  kos: 0, comboN: 0, comboT: 0, allyCd: 0,

  init() {
    const cv = $('view');
    const R = this.renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
    R.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap;
    R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.1;
    R.outputColorSpace = THREE.SRGBColorSpace;
    this.post = new PostFX(R);
    this.post.enabled = SAVE3.fx !== false;
    const S = this.scene = new THREE.Scene();
    S.fog = new THREE.Fog(0xe8a488, 160, 1300);
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 4000);
    // cielo, luz del atardecer y reflejos
    const sunDir = new THREE.Vector3(-0.55, 0.32, -0.75).normalize();
    this.sunDir = sunDir;
    const sky = makeSky(S, sunDir);
    const pm = new THREE.PMREMGenerator(R);
    const envScene = new THREE.Scene(); envScene.add(sky.clone());
    S.environment = pm.fromScene(envScene, 0.04).texture;
    S.add(new THREE.HemisphereLight(0xffe0cc, 0x6a6878, 1.9));
    const fill = new THREE.DirectionalLight(0x9ab8ff, 0.7); fill.position.set(0.6, 0.8, 0.9); S.add(fill);
    const sun = this.sun = new THREE.DirectionalLight(0xffc89a, 3.2);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 400;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
    S.add(sun); S.add(sun.target);
    City.build(S);
    this.particles = new Particles3(S);
    this.hero = new Hero(S, Game.save.suits && Game.save.suits.includes(SAVE3.suit) ? SAVE3.suit : 'bnd');
    const start = this.streetPoint(4, 4, 0, 0.5);
    this.hero.pos.set(start.x, 0.3, start.z);
    this.checkpoint = this.hero.pos.clone();
    Input3.init(cv);
    Voice.init();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.setupMission();
    $('loading').style.display = 'none';
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  },

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    if (this.post) this.post.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  },

  // punto de calle junto a la manzana (i,j)
  streetPoint(i, j, fx, fz) {
    return new THREE.Vector3(CITY.MIN + i * CITY.CELL + fx * CITY.CELL, 0, CITY.MIN + j * CITY.CELL + fz * CITY.CELL);
  },

  // ------------------------------------------------------------------ misión
  setupMission() {
    Audio2.music('city');
    this.objective('TIERRA-616 · NUEVA YORK', '');
    if (!SAVE3.ch1) {
      this.mode = 'mission'; this.stage = 'intro';
      this.card('CAPÍTULO 1', 'LA GRIETA', 'Tierra-616 · Nueva York', 3.5);
      this.say(STORY.intro, () => {
        this.stage = 'follow';
        this.marker = this.streetPoint(7, 2, 0.1, 0.1);
        this.objective('CAPÍTULO 1 · LA GRIETA', 'Sigue la señal del impostor');
        this.hintTimer = 0;
      });
    } else this.freeRoam();
  },
  freeRoam() {
    this.mode = 'free'; this.marker = null;
    this.objective('MUNDO LIBRE · TIERRA-616', 'Detén crímenes por la ciudad');
    this.crimeT = 8;
  },
  updateMission(dt) {
    const p = this.hero;
    if (this.mode === 'mission') {
      if (this.stage === 'follow' && this.marker && p.pos.distanceTo(this.marker) < 18 && p.pos.y < 30) {
        this.stage = 'waves'; this.wave = 0; this.arenaPos = this.marker.clone();
        this.checkpoint = this.marker.clone().add(new THREE.Vector3(-10, 0.3, 0));
        this.say([['radio', '¡Atención! Una banda armada en la zona. Y un Spider-Man con traje quemado dirigiéndola...'], ['spidey', 'Genial. Un impostor con amigos.']], () => this.spawnWave());
      }
      if (this.stage === 'waves' && this.enemies.every((e) => e.dead) && !this.dialog) {
        this.wave++;
        if (this.wave < 2) this.spawnWave();
        else { this.stage = 'boss'; this.startBoss(); }
      }
      if (this.stage === 'rift' && this.rift && p.pos.distanceTo(this.rift.position) < 4) this.endChapter();
    }
    if (this.mode === 'free') this.updateCrimes(dt);
  },
  spawnWave() {
    const c = this.arenaPos;
    const W = [['thug', 'thug', 'gunner', 'thug'], ['brute', 'thug', 'gunner', 'thug', 'thug']][this.wave];
    this.objective('CAPÍTULO 1 · LA GRIETA', this.wave === 0 ? 'Derrota a la banda' : 'Derrota a los refuerzos');
    W.forEach((t, k) => { const a = k / W.length * TAU; this.spawnEnemy(t, c.x + Math.cos(a) * 9, c.z + Math.sin(a) * 9, true); });
    Audio2.music('action');
    if (this.wave === 0) this.toast('¡A PELEAR!', Input3.label('ATTACK') + ' golpe · ' + Input3.label('DODGE') + ' esquiva · ' + Input3.label('WEB') + ' red');
  },
  startBoss() {
    const c = this.arenaPos;
    const b = this.boss = new Desconocido3D(this, c.x + 6, c.z + 6);
    this.enemies.push(b);
    Audio2.music('boss');
    $('boss').style.display = 'block'; $('bossName').textContent = b.name;
    this.objective('CAPÍTULO 1 · LA GRIETA', 'Derrota a El Desconocido');
    this.say(STORY.bossIntro.desconocido0, () => { this.toast('CONSEJO', 'Atrápalo con red (' + Input3.label('WEB') + ') 5 veces para aturdirlo. No machaques botones: contraataca.'); });
  },
  onBossEscape(b) {
    this.particles.burst(b.pos.clone().add(new THREE.Vector3(0, 1, 0)), 60, 0x60ffe0, 10);
    this.rift = makeRift(this.scene, b.pos.clone().add(new THREE.Vector3(0, 3, 0)));
    this.rift.lookAt(this.hero.pos.x, this.rift.position.y, this.hero.pos.z);
    Audio2.sfx('glitch');
    this.later(1.2, () => {
      $('boss').style.display = 'none';
      for (const e of this.enemies) if (!e.dead && e !== b) e.die(new THREE.Vector3(0, 0, 1), this);
      Audio2.music('sad');
      this.say(STORY.bossOutro.desconocido0, () => { this.stage = 'rift'; this.objective('CAPÍTULO 1 · LA GRIETA', 'Entra en la grieta'); Audio2.music('ruin'); });
    });
  },
  endChapter() {
    this.stage = 'done'; SAVE3.ch1 = true; save3();
    this.card('CAPÍTULO 1 COMPLETADO', 'CONTINUARÁ...', 'Los capítulos 2 a 6 llegarán al 3D. Mientras, sigue la historia en la versión 2.5D.', 6);
    Audio2.sfx('win'); Audio2.music('credits');
    this.hero.pos.add(new THREE.Vector3(0, 0, 6)); this.hero.vel.set(0, 6, 0); this.hero.state = 'air';
    this.later(6, () => { if (this.rift) { this.scene.remove(this.rift); this.rift = null; } this.freeRoam(); Audio2.music('city'); });
  },

  // Crímenes aleatorios del mundo libre
  updateCrimes(dt) {
    if (this.crime) {
      if (this.crime.enemies.every((e) => e.dead)) {
        SAVE3.crimes++; save3();
        this.toast('¡CRIMEN DETENIDO!', pick(STORY.thanks)); Audio2.sfx('win'); Audio2.music('city');
        this.crime = null; this.marker = null; this.crimeT = rand(15, 30);
        this.objective('MUNDO LIBRE · TIERRA-616', 'Crímenes detenidos: ' + SAVE3.crimes);
      }
      return;
    }
    this.crimeT -= dt;
    if (this.crimeT > 0) return;
    const p = this.hero.pos;
    let i, j, tries = 0;
    do { i = randi(0, CITY.N - 1); j = randi(0, CITY.N - 1); tries++; } while (tries < 20 && this.streetPoint(i, j, 0.1, 0.1).distanceTo(p) < 90);
    const c = this.streetPoint(i, j, 0.12, 0.12);
    const types = pick([['thug', 'thug', 'thug'], ['thug', 'gunner', 'thug'], ['brute', 'thug', 'gunner'], ['gunner', 'gunner', 'thug', 'thug']]);
    this.crime = { pos: c, enemies: types.map((t, k) => this.spawnEnemy(t, c.x + Math.cos(k * 2) * 4, c.z + Math.sin(k * 2) * 4, false)) };
    this.marker = c;
    const kind = pick(['Atraco en una tienda', 'Banda armada en la calle', 'Asalto a un furgón', 'Pelea callejera']);
    this.objective('CRIMEN EN CURSO', kind + ' · sigue el marcador');
    this.say([['radio', kind + '. Todas las unidades... ¿o mejor un trepamuros?']]);
  },

  // temporizadores en tiempo de juego (se pausan con el menú)
  later(t, fn) { (this.timers || (this.timers = [])).push({ t, fn }); },
  updateTimers(dt) {
    if (!this.timers) return;
    for (const tm of this.timers.slice()) { tm.t -= dt; if (tm.t <= 0) { this.timers.splice(this.timers.indexOf(tm), 1); tm.fn(); } }
  },

  // ------------------------------------------------------------------ combate
  spawnEnemy(type, x, z, aggro) {
    const e = new Enemy3D(this, type, x, z, { aggro });
    this.enemies.push(e);
    return e;
  },
  addProj(p) { this.projs.push(p); },
  target(h, range, dir, visible) {
    let best = null, bs = 1e9;
    for (const e of this.enemies) {
      if (e.dead || e.state === 'escape' || e.state === 'intro') continue;
      const d = e.pos.clone().sub(h.pos); const dy = Math.abs(d.y); d.y = 0; const L = d.length();
      if (L > range || dy > 5) continue;
      let score = L;
      if (dir) score -= d.normalize().dot(dir) * 4;
      else score -= d.normalize().dot(new THREE.Vector3(Math.sin(this.camYaw), 0, Math.cos(this.camYaw))) * 1.5;
      if (score < bs) { bs = score; best = e; }
    }
    return best;
  },
  threatNear(h) {
    for (const e of this.enemies) if (!e.dead && e.windup && e.pos.distanceTo(h.pos) < (e.spec.ranged ? 20 : 5)) return e;
    for (const p of this.projs) if (p.pos.distanceTo(h.pos) < 7) return { pos: p.pos, windup: true };
    return null;
  },
  takeToken(e) { if (e.isBoss || e.spec.ranged) return true; if (this.tokens.size < 2 || this.tokens.has(e)) { this.tokens.add(e); return true; } return false; },
  releaseToken(e) { this.tokens.delete(e); },
  releaseTokenIfIdle(e) { if (e.state !== 'windup' && e.state !== 'attack' && e.state !== 'chase') this.tokens.delete(e); },
  onHit(heavy) {
    this.hitStop = heavy ? 0.08 : 0.04; this.shake(heavy ? 0.22 : 0.1);
    this.comboN++; this.comboT = 2;
    Input3.rumble && Input3.rumble();
  },
  onKO(e) { this.kos++; this.hero.gainFocus(12); this.releaseToken(e); if (Math.random() < 0.5) this.float(e.pos, pick(['¡K.O.!', '¡Pum!', '¡Zas!', '¡Fuera!'])); },
  onPlayerHurt() { this.comboN = 0; },
  perfectDodge(h) { this.slowT = 0.5; this.toast('', '¡ESQUIVA PERFECTA!'); h.gainFocus(15); Audio2.sfx('heal'); },
  shake(a) { this.shakeT = Math.max(this.shakeT, a); },

  // Refuerzo multiversal (R3): otro Spider-Man cruza por un portal
  callAlly() {
    const st = Game.save.stage || 0, list = [];
    if (st >= 2) list.push('raimi'); if (st >= 3) list.push('tasm'); if (st >= 4) list.push('verse');
    if (!list.length) { this.toast('', 'Aún no conoces a otros Spider-Man (avanza en la versión 2.5D)'); return; }
    if (this.allyCd > 0) { this.toast('', 'Refuerzo en ' + Math.ceil(this.allyCd) + ' s'); return; }
    this.allyCd = ALLY_CD;
    const id = pick(list), rig = new Rig3D(SUITS.find((s) => s.id === id).palObj, { key: id });
    const h = this.hero, off = new THREE.Vector3(Math.sin(this.camYaw + 1.2), 0, Math.cos(this.camYaw + 1.2)).multiplyScalar(3);
    rig.root.position.copy(h.pos).add(off);
    this.scene.add(rig.root);
    const portal = makeRift(this.scene, rig.root.position.clone().add(new THREE.Vector3(0, 1.2, 0))); portal.scale.setScalar(0.5);
    this.ally = { rig, t: 0, portal };
    this.say([[{ raimi: 'tobey', tasm: 'andrew', verse: 'miles' }[id], { raimi: '¡Aquí estoy, Peter!', tasm: 'Estoy bien, estoy bien... ¡Voy!', verse: '¡Salto de fe!' }[id]]], null, true);
    Audio2.sfx('glitch');
  },
  updateAlly(dt) {
    const a = this.ally; if (!a) return;
    a.t += dt;
    a.rig.apply(a.t < 0.6 ? P3.guard(a.t) : a.t < 1.6 ? P3.special(a.t) : P3.cheer(a.t), 0.3);
    a.portal.userData.spin(dt);
    if (a.t > 0.8 && !a.hit) {
      a.hit = true; this.shake(0.4); Audio2.sfx('special');
      for (const e of this.enemies) if (!e.dead && e.pos.distanceTo(a.rig.root.position) < 12) { e.takeHit(e.isBoss ? 30 : 40, e.pos.clone().sub(a.rig.root.position).setY(0).normalize(), true, true, this); if (!e.isBoss) e.web(this); }
      this.particles.burst(a.rig.root.position.clone().add(new THREE.Vector3(0, 1, 0)), 50, 0xffffff, 12);
    }
    if (a.t > 2.2) { this.scene.remove(a.rig.root); this.scene.remove(a.portal); this.ally = null; }
  },

  // ------------------------------------------------------------------ bucle
  loop(ts) {
    const now = ts;
    let dt = Math.min(0.05, (now - this.last) / 1000 || 0.016);
    this.last = now;
    try { this.step(dt); this.render(); } catch (e) { console.error(e); this.errors = (this.errors || 0) + 1; }
    requestAnimationFrame((t) => this.loop(t));
  },
  get inputOn() { return !this.dialog && !this.menuOpen && this.hero.state !== 'dead'; },
  step(dt) {
    Input3.poll();
    if (this.menuOpen) { this.menuInput(); return; }
    if (Input3.pressed('PAUSE')) { this.openMenu(); return; }
    if (this.dialog) this.updateDialog(dt);
    // tiempo: parón al golpear y cámara lenta al esquivar perfecto
    let ts = 1;
    if (this.hitStop > 0) { this.hitStop -= dt; ts = 0.05; }
    if (this.slowT > 0) { this.slowT -= dt; ts = Math.min(ts, 0.3); }
    const gdt = dt * ts;
    this.time += gdt;
    const h = this.hero;
    this.updateCamera(dt);
    h.update(gdt, this);
    if (h.state === 'dead' && h.st > 2) this.respawn();
    if (this.inputOn && Input3.pressed('ALLY')) this.callAlly();
    if (this.allyCd > 0) this.allyCd -= dt;
    this.updateAlly(gdt);
    for (const e of this.enemies) e.update(gdt, this);
    for (const e of this.enemies) if (e.remove) e.dispose(this);
    this.enemies = this.enemies.filter((e) => !e.remove);
    // separación entre enemigos
    for (let a = 0; a < this.enemies.length; a++) for (let b = a + 1; b < this.enemies.length; b++) {
      const A = this.enemies[a], B = this.enemies[b];
      if (A.dead || B.dead) continue;
      const d = A.pos.clone().sub(B.pos); d.y = 0; const L = d.length();
      if (L < 1.1 && L > 0.001) { d.multiplyScalar((1.1 - L) / L * 0.5); A.pos.add(d); B.pos.sub(d); }
    }
    for (const p of this.projs) p.update(gdt, this);
    this.projs = this.projs.filter((p) => !p.dead);
    this.particles.update(gdt);
    this.inCombat = this.enemies.some((e) => !e.dead && e.aggro && e.pos.distanceTo(h.pos) < 25);
    City.updateTraffic(gdt);
    City.updatePeds(gdt, this.inCombat ? h.pos : null);
    if (this.rift) this.rift.userData.spin(gdt);
    this.updateMission(dt);
    this.updateTimers(dt);
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.comboN = 0; }
    // sombra del sol siguiendo al jugador
    this.sun.position.copy(h.pos).addScaledVector(this.sunDir, 150); this.sun.target.position.copy(h.pos);
    this.updateHud(dt);
    this.updatePost(dt);
  },
  respawn() {
    const h = this.hero;
    h.hp = h.maxHp; h.state = 'air'; h.pos.copy(this.checkpoint).add(new THREE.Vector3(0, 1, 0)); h.vel.set(0, 0, 0); h.inv = 2;
    if (this.boss && !this.boss.dead) this.boss.hp = Math.min(this.boss.maxHp, this.boss.hp + this.boss.maxHp * 0.2);
    this.toast('', 'De vuelta al punto de control');
  },

  updateCamera(dt) {
    const h = this.hero, inv = SAVE3.invertY ? -1 : 1, sens = SAVE3.sens / 5;
    const L = Input3.look, M = Input3.mouseDelta || { x: 0, y: 0 };
    const manual = Math.abs(L.x) + Math.abs(L.y) > 0.05 || M.x || M.y;
    if (this.inputOn) {
      this.camYaw -= (L.x * 2.6 * dt + M.x * 0.0024) * sens;
      this.camPitch = clamp(this.camPitch - (L.y * 1.8 * dt + M.y * 0.0022) * sens * inv, -1.25, 0.55);
    }
    this.lookIdle = manual ? 0 : this.lookIdle + dt;
    // la cámara se coloca sola detrás del movimiento (como en PlayStation)
    const hv = Math.hypot(h.vel.x, h.vel.z);
    if (this.lookIdle > 0.9 && hv > 4 && (h.state === 'swing' || h.state === 'air' || hv > 10)) {
      const want = Math.atan2(h.vel.x, h.vel.z);
      let d = want - this.camYaw; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
      this.camYaw += d * Math.min(1, dt * 1.2);
      this.camPitch += (-0.18 - this.camPitch) * Math.min(1, dt * 0.8);
    }
    const speed = h.vel.length();
    if (this.finCam > 0) this.finCam -= dt;
    const wantDist = this.finCam > 0 ? 2.6 : h.state === 'swing' || (h.state === 'air' && speed > 12) ? 6.4 : h.state === 'wall' ? 5.2 : this.inCombat ? 5.6 : 4.3;
    this.camDist += (wantDist - this.camDist) * Math.min(1, dt * 3);
    const cam = this.camera;
    const tgt = h.pos.clone().add(new THREE.Vector3(0, 1.55, 0));
    const f = new THREE.Vector3(Math.sin(this.camYaw) * Math.cos(this.camPitch), Math.sin(this.camPitch), Math.cos(this.camYaw) * Math.cos(this.camPitch));
    const right = new THREE.Vector3(-Math.cos(this.camYaw), 0, Math.sin(this.camYaw));
    const dir = f.clone().negate();
    // evita que la cámara atraviese edificios
    let dist = this.camDist;
    const hit = City.raycast(tgt, dir, dist + 0.5);
    if (hit) dist = Math.max(1.2, hit.t - 0.4);
    const pos = tgt.clone().addScaledVector(dir, dist).addScaledVector(right, -0.35);
    pos.y = Math.max(pos.y, City.groundAt(pos.x, pos.z) + 0.3);
    cam.position.lerp(pos, 1 - Math.exp(-dt * 14));
    if (this.shakeT > 0) { this.shakeT = Math.max(0, this.shakeT - dt); cam.position.add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(this.shakeT * 0.35)); }
    cam.lookAt(tgt.clone().addScaledVector(right, -0.35));
    const fov = 60 + clamp(speed - 8, 0, 25) * 0.6;
    cam.fov += (fov - cam.fov) * Math.min(1, dt * 3); cam.updateProjectionMatrix();
  },

  render() { this.post.render(this.scene, this.camera, this.time); this.drawOverlay(); },
  // valores de la postproducción según lo que pasa en el juego
  updatePost(dt) {
    const h = this.hero, P = this.post;
    const sp = h.vel.length();
    const fast = (h.state === 'swing' || h.state === 'air' || h.state === 'zip') ? clamp((sp - 14) / 22, 0, 1) : 0;
    P.speed += (fast - P.speed) * Math.min(1, dt * 4);
    P.hit = Math.max(0, Math.max(P.hit - dt * 4, this.hitStop > 0 ? 1 : 0, this.shakeT > 0.15 ? 0.6 : 0));
    P.slow += ((this.slowT > 0 ? 1 : 0) - P.slow) * Math.min(1, dt * 8);
    P.danger += ((this.senseOn ? 0.6 + Math.sin(this.time * 12) * 0.4 : 0) - P.danger) * Math.min(1, dt * 10);
  },

  // ------------------------------------------------------------------ interfaz
  objective(small, text) { $('objSmall').textContent = small; $('objText').textContent = text; },
  toast(title, sub) {
    const el = $('toast');
    el.innerHTML = (title ? '<div>' + title + '</div>' : '') + (sub ? '<div style="font-size:15px;font-weight:600">' + sub + '</div>' : '');
    el.style.opacity = 1; clearTimeout(this.toastTo);
    this.toastTo = setTimeout(() => { el.style.opacity = 0; }, 2600);
  },
  card(small, big, sub, dur) {
    $('cardSmall').textContent = small; $('cardBig').textContent = big; $('cardSub').textContent = sub;
    const el = $('card'); el.style.opacity = 1; clearTimeout(this.cardTo);
    this.cardTo = setTimeout(() => { el.style.opacity = 0; }, dur * 1000);
  },
  float(pos, text) {
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = 'position:absolute;font-weight:900;font-size:18px;color:#fff;text-shadow:0 2px 0 #c01020,0 0 6px #000;pointer-events:none;white-space:nowrap';
    $('hud').appendChild(el);
    this.floats.push({ el, pos: pos.clone().add(new THREE.Vector3(0, 2.1, 0)), t: 0 });
  },
  // Diálogos (con voz)
  say(lines, cb, quick) {
    const L = prepLines(lines.filter(Boolean));
    if (!L.length) { if (cb) cb(); return; }
    this.dialog = { lines: L, i: -1, cb, quick, t: 0 };
    this.nextLine();
  },
  nextLine() {
    const d = this.dialog;
    d.i++;
    if (d.i >= d.lines.length) { $('dialog').style.display = 'none'; this.dialog = null; Voice.stop(); if (d.cb) d.cb(); return; }
    const [who, text] = d.lines[d.i];
    d.t = 0; d.text = text; d.shown = 0;
    const W = WHO[who] || { name: who, portrait: null };
    $('dName').textContent = W.name || '';
    const pc = $('portrait'), g = pc.getContext('2d');
    g.clearRect(0, 0, 24, 24);
    if (W.portrait) { g.drawImage(Portraits.get(W.portrait), 0, 0); pc.style.display = 'block'; } else pc.style.display = 'none';
    $('dialog').style.paddingLeft = W.portrait ? '92px' : '18px';
    $('dialog').style.display = 'block';
    $('dNext').textContent = (Input3.lastDevice === 'pad' ? Input3.label('JUMP') : Input3.lastDevice === 'touch' ? 'Toca' : 'Espacio') + ' ▸';
    Voice.speak(who, text);
  },
  updateDialog(dt) {
    const d = this.dialog;
    d.t += dt;
    d.shown = Math.min(d.text.length, Math.floor(d.t * 45));
    $('dText').textContent = d.text.slice(0, d.shown);
    const adv = Input3.pressed('JUMP') || Input3.pressed('ATTACK') || Input3.latchEnter || (Input3.menuNav && Input3.menuNav.ok);
    if (d.quick && d.t > 1.6) { this.nextLine(); return; }
    if (adv && d.t > 0.2) { if (d.shown < d.text.length) d.t = 999; else this.nextLine(); }
  },
  updateHud(dt) {
    const h = this.hero;
    const threat = this.threatNear(h);
    if (threat && !this.senseOn) Audio2.sfx('sense');
    this.senseOn = !!threat;
    const c = $('combo');
    c.style.opacity = this.comboN > 1 ? 1 : 0; c.textContent = 'x' + this.comboN;
    if (this.boss) $('bossBar').style.width = Math.max(0, this.boss.hp / this.boss.maxHp * 100) + '%';
    // consejos de controles
    if (!this.hintShown || this.hintDev !== Input3.lastDevice) {
      this.hintDev = Input3.lastDevice; this.hintShown = true;
      const k = (a) => '<kbd>' + Input3.label(a) + '</kbd>';
      $('hint').innerHTML = (Input3.lastDevice === 'keys' ? '<kbd>WASD</kbd> mover · <kbd>RATÓN</kbd> cámara (clic para capturar)<br>' : '') +
        k('JUMP') + 'saltar · ' + k('SWING') + 'balanceo (mantén en el aire) · ' + k('ZIP') + 'impulso<br>' + k('ATTACK') + 'golpe · ' + k('DODGE') + 'esquiva · ' + k('WEB') + 'red · ' + k('SPECIAL') + 'especial/remate · ' + k('ALLY') + 'refuerzo · ' + k('PAUSE') + 'menú';
    }
    this.hintT = (this.hintT || 0) + dt;
    $('hint').style.opacity = this.hintT < 25 ? 1 : 0.35;
  },
  // Proyección de textos 3D, marcador de misión y minimapa
  drawOverlay() {
    const cam = this.camera, w = window.innerWidth, hgt = window.innerHeight;
    const proj = (p) => { const v = p.clone().project(cam); return { x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * hgt, ok: v.z < 1 }; };
    for (const f of this.floats) {
      f.t += 0.016; const s = proj(f.pos.clone().add(new THREE.Vector3(0, f.t * 1.2, 0)));
      f.el.style.left = s.x + 'px'; f.el.style.top = s.y + 'px'; f.el.style.opacity = s.ok ? Math.max(0, 1 - f.t) : 0;
      f.el.style.transform = 'translate(-50%,-50%)';
      if (f.t > 1) f.el.remove();
    }
    this.floats = this.floats.filter((f) => f.t <= 1);
    // marcador de misión (flecha en pantalla)
    const an = $('anchor');
    if (this.marker) {
      const s = proj(this.marker.clone().add(new THREE.Vector3(0, 3, 0)));
      an.style.display = 'block';
      an.style.left = clamp(s.ok ? s.x : (s.x < w / 2 ? 30 : w - 30), 30, w - 30) + 'px'; an.style.top = clamp(s.ok ? s.y : hgt / 2, 60, hgt - 60) + 'px';
      an.style.borderColor = this.crime ? '#ff4040' : '#ffd060';
      an.title = Math.round(this.marker.distanceTo(this.hero.pos)) + ' m';
    } else an.style.display = 'none';
    this.drawMinimap();
    this.drawSense();
    this.drawTouch();
  },
  drawMinimap() {
    const cv = $('minimap'), g = cv.getContext('2d'), S = cv.width, C = S / 2, RM = S * 0.36, h = this.hero, sc = 0.45;
    g.clearRect(0, 0, S, S);
    g.save(); g.beginPath(); g.arc(C, C, RM, 0, TAU); g.clip();
    g.translate(C, C); g.rotate(this.camYaw - Math.PI);
    g.fillStyle = 'rgba(28,30,40,0.92)'; g.fillRect(-S, -S, S * 2, S * 2);
    for (const b of City.near(h.pos.x, h.pos.z, 160)) {
      const x = (b.x0 - h.pos.x) * sc, z = (b.z0 - h.pos.z) * sc;
      g.fillStyle = b.h > h.pos.y + 1 ? '#8e8a9c' : '#4a4858';
      g.fillRect(-x - (b.x1 - b.x0) * sc, z, (b.x1 - b.x0) * sc, (b.z1 - b.z0) * sc);
    }
    for (const e of this.enemies) if (!e.dead) { g.fillStyle = e.isBoss ? '#ff8020' : '#ff3040'; g.beginPath(); g.arc(-(e.pos.x - h.pos.x) * sc, (e.pos.z - h.pos.z) * sc, 2.6, 0, TAU); g.fill(); }
    if (this.marker) {
      let mx = -(this.marker.x - h.pos.x) * sc, mz = (this.marker.z - h.pos.z) * sc; const l = Math.hypot(mx, mz);
      if (l > RM - 6) { mx *= (RM - 6) / l; mz *= (RM - 6) / l; }
      g.fillStyle = this.crime ? '#ff4040' : '#ffd060'; g.beginPath(); g.moveTo(mx, mz - 7); g.lineTo(mx + 5, mz); g.lineTo(mx, mz + 7); g.lineTo(mx - 5, mz); g.fill();
    }
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 2; g.beginPath(); g.arc(C, C, RM, 0, TAU); g.stroke();
    // jugador (flecha hacia donde mira)
    g.save(); g.translate(C, C); g.rotate(-(h.yaw - this.camYaw));
    g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 5); g.lineTo(0, 2); g.lineTo(-5, 5); g.fill(); g.restore();
    // salud y concentración en arcos alrededor del minimapa (como en PlayStation)
    const a0 = Math.PI * 0.62, a1 = Math.PI * 1.92;
    const arc = (r, w, from, to, col) => { g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'butt'; g.beginPath(); g.arc(C, C, r, from, to); g.stroke(); };
    arc(RM + 9, 7, a0, a1, 'rgba(0,0,0,0.55)');
    const hp = clamp(h.hp / h.maxHp, 0, 1), hpc = hp < 0.3 ? (Math.sin(this.time * 10) > 0 ? '#ff3040' : '#b01020') : '#f02c3c';
    if (hp > 0) arc(RM + 9, 5, a0, a0 + (a1 - a0) * hp, hpc);
    // concentración: 4 segmentos
    const segs = 4, gap = 0.035, span = (a1 - a0) / segs;
    for (let k = 0; k < segs; k++) {
      const s0 = a0 + k * span + gap, s1 = a0 + (k + 1) * span - gap;
      arc(RM + 18, 5, s0, s1, 'rgba(0,0,0,0.5)');
      const f = clamp(h.focus / 25 - k, 0, 1);
      if (f > 0) arc(RM + 18, 4, s0, s0 + (s1 - s0) * f, f >= 1 ? (h.focus >= 100 ? '#ffe060' : '#60d8ff') : '#2a90c0');
    }
    g.fillStyle = '#fff'; g.font = 'bold 11px sans-serif'; g.textAlign = 'center';
    if (h.focus >= 100) { g.fillStyle = '#ffe060'; g.fillText('REMATE', C, S - 4); }
  },
  // sentido arácnido: líneas zigzag alrededor de la cabeza
  drawSense() {
    let c = this.fxCv;
    if (!c) { c = this.fxCv = document.createElement('canvas'); c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none'; $('hud').insertBefore(c, $('hud').firstChild); }
    const w = window.innerWidth, hh = window.innerHeight;
    if (c.width !== w || c.height !== hh) { c.width = w; c.height = hh; }
    const g = c.getContext('2d');
    g.clearRect(0, 0, w, hh);
    if (!this.senseOn || this.dialog) return;
    const head = this.hero.pos.clone().add(new THREE.Vector3(0, 1.85, 0));
    const dist = head.distanceTo(this.camera.position);
    const v = head.project(this.camera); if (v.z > 1) return;
    const x = (v.x + 1) / 2 * w, y = (1 - v.y) / 2 * hh, s = clamp(5 / dist, 0.5, 2) * (hh / 720);
    const fl = Math.floor(this.time * 20);
    g.save(); g.translate(x, y); g.lineJoin = 'miter'; g.lineCap = 'round';
    g.shadowColor = '#ff9020'; g.shadowBlur = 10 * s;
    for (let k = 0; k < 7; k++) {
      const a = -Math.PI / 2 + (k - 3) * 0.42, r0 = 16 * s, L = (18 + ((fl + k) % 3) * 5) * s;
      const ca = Math.cos(a), sa = Math.sin(a), px = -sa, py = ca;
      g.strokeStyle = k % 2 ? '#fff6c0' : '#ffd040'; g.lineWidth = 2.4 * s;
      g.beginPath(); g.moveTo(ca * r0, sa * r0);
      for (let j = 1; j <= 3; j++) { const rr = r0 + L * j / 3, z = (j % 2 ? 1 : -1) * 4 * s; g.lineTo(ca * rr + px * z, sa * rr + py * z); }
      g.stroke();
    }
    g.restore();
  },
  drawTouch() {
    const on = Input3.lastDevice === 'touch';
    let c = this.touchCv;
    if (!on) { if (c) c.style.display = 'none'; return; }
    if (!c) { c = this.touchCv = document.createElement('canvas'); c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none'; document.body.appendChild(c); }
    c.style.display = 'block'; c.width = window.innerWidth; c.height = window.innerHeight;
    const g = c.getContext('2d');
    g.font = 'bold 12px sans-serif'; g.textAlign = 'center';
    for (const b of Input3.touchButtons(c.width, c.height)) {
      g.fillStyle = Input3.touch.btn[b.a] ? 'rgba(224,32,44,0.6)' : 'rgba(255,255,255,0.18)';
      g.beginPath(); g.arc(b.x, b.y, b.r, 0, TAU); g.fill();
      g.fillStyle = '#fff'; g.fillText(Input3.label(b.a), b.x, b.y + 4);
    }
    const s = Input3.touch.stick;
    if (s) { g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 3; g.beginPath(); g.arc(s.ox, s.oy, 50, 0, TAU); g.stroke(); g.fillStyle = 'rgba(255,255,255,0.4)'; g.beginPath(); g.arc(s.x, s.y, 20, 0, TAU); g.fill(); }
  },

  // ------------------------------------------------------------------ menú
  openMenu() {
    this.menuOpen = true;
    if (document.pointerLockElement) document.exitPointerLock();
    Voice.stop();
    this.menuItems = [
      { label: () => 'CONTINUAR', act: () => this.closeMenu() },
      { label: () => 'TRAJE: ' + (SUITS.find((s) => s.id === this.hero.suitId) || SUITS[0]).name.toUpperCase(), act: () => this.nextSuit() },
      { label: () => 'CÁMARA: ' + (SAVE3.invertY ? 'INVERTIDA' : 'NORMAL'), act: () => { SAVE3.invertY = !SAVE3.invertY; save3(); } },
      { label: () => 'SENSIBILIDAD: ' + SAVE3.sens, act: () => { SAVE3.sens = SAVE3.sens % 10 + 1; save3(); } },
      { label: () => 'EFECTOS DE IMAGEN: ' + (SAVE3.fx ? 'SÍ' : 'NO (más rápido)'), act: () => { SAVE3.fx = !SAVE3.fx; this.post.enabled = SAVE3.fx; save3(); } },
      { label: () => 'REPETIR CAPÍTULO 1', act: () => { SAVE3.ch1 = false; save3(); location.reload(); } },
      { label: () => 'IR A LA VERSIÓN 2.5D', act: () => { location.href = '../index.html'; } },
    ];
    this.menuSel = 0; this.renderMenu();
    $('menu').style.display = 'flex';
  },
  closeMenu() { this.menuOpen = false; $('menu').style.display = 'none'; },
  nextSuit() {
    const owned = SUITS.filter((s) => (Game.save.suits || START_SUITS).includes(s.id) || START_SUITS.includes(s.id));
    const i = owned.findIndex((s) => s.id === this.hero.suitId);
    const n = owned[(i + 1) % owned.length];
    this.hero.setSuit(n.id); SAVE3.suit = n.id; save3();
  },
  renderMenu() {
    const box = $('menuBox');
    box.innerHTML = '<h2>PAUSA</h2>';
    this.menuItems.forEach((it, i) => {
      const b = document.createElement('button');
      b.textContent = it.label(); if (i === this.menuSel) b.className = 'sel';
      b.onclick = () => { this.menuSel = i; it.act(); if (this.menuOpen) this.renderMenu(); };
      box.appendChild(b);
    });
    const p = document.createElement('p');
    p.innerHTML = 'Crímenes detenidos: ' + SAVE3.crimes + ' · Enemigos derrotados: ' + this.kos + '<br>Juego de fans no oficial y sin fines de lucro.';
    box.appendChild(p);
  },
  menuInput() {
    const m = Input3.move;
    const up = (m.y < -0.5 && !this.navLock) || (Input3.menuNav && Input3.menuNav.up), down = (m.y > 0.5 && !this.navLock) || (Input3.menuNav && Input3.menuNav.down);
    this.navLock = Math.abs(m.y) > 0.5;
    if (up) { this.menuSel = (this.menuSel + this.menuItems.length - 1) % this.menuItems.length; this.renderMenu(); Audio2.sfx('select'); }
    if (down) { this.menuSel = (this.menuSel + 1) % this.menuItems.length; this.renderMenu(); Audio2.sfx('select'); }
    if (Input3.pressed('JUMP') || (Input3.menuNav && Input3.menuNav.ok && !Input3.pressed('JUMP'))) { this.menuItems[this.menuSel].act(); if (this.menuOpen) this.renderMenu(); }
    else if (Input3.pressed('PAUSE') || Input3.pressed('DODGE')) this.closeMenu();
  },
};

window.addEventListener('load', () => {
  try { Game3.init(); } catch (e) { console.error(e); $('loading').textContent = 'Tu navegador no puede mostrar 3D (WebGL). Prueba con Chrome, Edge o Safari actualizados.'; }
});
