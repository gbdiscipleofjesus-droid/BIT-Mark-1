'use strict';
// ---------------------------------------------------------------------------
// Spider-Man en 3D: movimiento tipo PlayStation (correr, parkour, trepar
// paredes, balanceo con física de péndulo, impulso a puntos), combate y cámara.
// ---------------------------------------------------------------------------
const HERO = { R: 0.35, GRAV: 24, RUN: 8.5, SPRINT: 14, JUMP: 9.8, JUMP2: 8.5, CLIMB: 5.5, WALLRUN: 11, MAXROPE: 48 };
const UP = new THREE.Vector3(0, 1, 0);

function webLineMesh(scene) {
  const g = new THREE.CylinderGeometry(0.018, 0.018, 1, 5, 1, true); g.translate(0, 0.5, 0); g.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xf4f4f8, transparent: true, opacity: 0.9 }));
  m.visible = false; scene.add(m);
  return m;
}
// gira el cuerpo sobre su centro (a 0,9 m del suelo)
function spinX(body, a) { body.rotation.x = a; body.position.set(0, 0.9 - 0.9 * Math.cos(a), -0.9 * Math.sin(a)); }
function placeLine(m, a, b) {
  const d = a.distanceTo(b);
  m.position.copy(a); m.lookAt(b); m.scale.set(1, 1, Math.max(0.01, d)); m.visible = true;
}

class Hero {
  constructor(scene, suitId) {
    this.scene = scene;
    this.pos = new THREE.Vector3(0, 0.3, 0); this.vel = new THREE.Vector3(); this.yaw = 0;
    this.state = 'ground'; this.st = 0; this.onGround = true; this.jumps = 0;
    this.hp = 100; this.maxHp = 100; this.focus = 0; this.inv = 0; this.combo = 0; this.comboT = 0; this.hitCount = 0;
    this.anchor = null; this.rope = 0; this.wall = null; this.zipT = null; this.attack = null; this.flipT = 0; this.runPh = 0;
    this.line = webLineMesh(scene); this.line2 = webLineMesh(scene);
    this.setSuit(suitId);
    this.tmp = new THREE.Vector3();
  }
  setSuit(id) {
    const s = SUITS.find((x) => x.id === id) || SUITS[0];
    this.suitId = s.id;
    if (this.rig) { this.scene.remove(this.rig.root); }
    this.rig = new Rig3D(s.palObj, { key: s.id });
    this.scene.add(this.rig.root);
  }
  get feet() { return this.pos.y; }
  handPos(side = 1) { const v = new THREE.Vector3(); this.rig.j[side > 0 ? 'haR' : 'haL'].getWorldPosition(v); return v; }

  // ---- entorno ----
  support(x, z, y) {
    let h = City.groundAt(x, z);
    for (const b of City.near(x, z, 1)) {
      if (x > b.x0 - 0.1 && x < b.x1 + 0.1 && z > b.z0 - 0.1 && z < b.z1 + 0.1 && y >= b.h - 0.6 && b.h > h) h = b.h;
    }
    return h;
  }
  // Empuja fuera de los edificios; devuelve el contacto más fuerte {b, n}
  collide() {
    const p = this.pos, R = HERO.R;
    let hit = null;
    for (const b of City.near(p.x, p.z, 2)) {
      if (p.y >= b.h - 0.05 || p.y + 1.7 < 0) continue;
      const cx = clamp(p.x, b.x0, b.x1), cz = clamp(p.z, b.z0, b.z1);
      const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
      if (d >= R) continue;
      let n;
      if (d > 1e-4) { n = new THREE.Vector3(dx / d, 0, dz / d); p.x = cx + n.x * R; p.z = cz + n.z * R; }
      else { // dentro: sale por la cara más cercana
        const opts = [[p.x - b.x0, -1, 0], [b.x1 - p.x, 1, 0], [p.z - b.z0, 0, -1], [b.z1 - p.z, 0, 1]].sort((a, c) => a[0] - c[0]);
        n = new THREE.Vector3(opts[0][1], 0, opts[0][2]);
        if (n.x) p.x = n.x < 0 ? b.x0 - R : b.x1 + R; else p.z = n.z < 0 ? b.z0 - R : b.z1 + R;
      }
      // normal de cara (eje dominante) para trepar
      const an = Math.abs(n.x) > Math.abs(n.z) ? new THREE.Vector3(sign(n.x), 0, 0) : new THREE.Vector3(0, 0, sign(n.z));
      const vn = this.vel.dot(an);
      if (vn < 0) this.vel.addScaledVector(an, -vn);
      hit = { b, n: an, speed: -vn };
    }
    const lim = CITY.MAX + 30;
    p.x = clamp(p.x, -lim, lim); p.z = clamp(p.z, -lim, lim);
    return hit;
  }

  // Busca un punto de anclaje para la telaraña: alto y por delante
  findAnchor(dir, side) {
    const p = this.pos;
    const ideal = new THREE.Vector3(p.x + dir.x * 16 + (-dir.z) * side * 5, Math.max(p.y + 16, 22), p.z + dir.z * 16 + dir.x * side * 5);
    let best = null, bd = 1e9;
    for (const b of City.near(ideal.x, ideal.z, 34)) {
      if (b.h < p.y + 6) continue;
      let ax = clamp(ideal.x, b.x0, b.x1), az = clamp(ideal.z, b.z0, b.z1);
      // si el punto ideal cae dentro del edificio, se lleva a la fachada más cercana
      if (ax === ideal.x && az === ideal.z) {
        const f = [[ideal.x - b.x0, 0], [b.x1 - ideal.x, 1], [ideal.z - b.z0, 2], [b.z1 - ideal.z, 3]].sort((m, n) => m[0] - n[0])[0][1];
        if (f === 0) ax = b.x0; else if (f === 1) ax = b.x1; else if (f === 2) az = b.z0; else az = b.z1;
      }
      const ay = Math.min(b.h - 0.5, ideal.y + 6);
      const a = new THREE.Vector3(ax, ay, az);
      const d = a.distanceTo(ideal) + Math.max(0, -((ax - p.x) * dir.x + (az - p.z) * dir.z)) * 2;
      const len = a.distanceTo(p);
      if (len > HERO.MAXROPE || len < 8) continue;
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }
  // Punto de impulso: borde de azotea hacia donde mira la cámara
  findZip(cam) {
    const o = cam.position.clone(), d = new THREE.Vector3(); cam.getWorldDirection(d);
    const hit = City.raycast(o, d, 90);
    if (!hit) return null;
    const b = hit.b;
    const pt = o.clone().addScaledVector(d, hit.t);
    const t = new THREE.Vector3(clamp(pt.x, b.x0 + 0.6, b.x1 - 0.6), b.h + 0.1, clamp(pt.z, b.z0 + 0.6, b.z1 - 0.6));
    if (t.distanceTo(this.pos) > 70) return null;
    return t;
  }

  // ---- entrada relativa a la cámara ----
  wish(camYaw) {
    const m = Input3.move;
    const f = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw)), r = new THREE.Vector3(-Math.cos(camYaw), 0, Math.sin(camYaw));
    const w = new THREE.Vector3().addScaledVector(f, -m.y).addScaledVector(r, m.x);
    const l = w.length();
    if (l > 1) w.divideScalar(l);
    return w;
  }

  update(dt, G) {
    const inp = G.inputOn;
    const w = inp ? this.wish(G.camYaw) : new THREE.Vector3();
    const P = (a) => inp && Input3.pressed(a), D = (a) => inp && Input3.isDown(a);
    this.st += dt;
    for (const k of ['inv', 'comboT', 'flipT', 'landT', 'hurtT', 'webCd', 'dodgeCd']) if (this[k] > 0) this[k] = Math.max(0, this[k] - dt);
    if (this.comboT <= 0) this.combo = 0;
    if (this.state === 'dead' || this.state === 'cutscene') { this.physicsIdle(dt); return; }

    // --- combate (en suelo o aire) ---
    if (this.attack) { this.updateAttack(dt, G); }
    if (!this.attack && P('ATTACK') && this.state !== 'wall' && this.state !== 'swing') this.startAttack(G, w);
    if (P('DODGE') && this.dodgeCd <= 0 && this.state !== 'swing') { this.dodge(G, w); }
    if (P('WEB') && this.webCd <= 0) this.shootWeb(G);
    if (P('SPECIAL') && this.focus >= 50) this.special(G);
    if (this.state === 'dodge') { this.updDodge(dt, G); this.animate(dt, G); return; }
    if (this.attack && this.attack.lunge) { this.animate(dt, G); return; }

    switch (this.state) {
      case 'ground': this.updGround(dt, G, w, P, D); break;
      case 'air': this.updAir(dt, G, w, P, D); break;
      case 'swing': this.updSwing(dt, G, w, P, D); break;
      case 'wall': this.updWall(dt, G, w, P, D); break;
      case 'zip': this.updZip(dt, G, P); break;
      case 'hurt': this.physicsIdle(dt); if (this.st > 0.45) this.state = this.onGround ? 'ground' : 'air'; break;
    }
    this.animate(dt, G);
  }

  physicsIdle(dt) {
    this.vel.x *= Math.exp(-dt * 6); this.vel.z *= Math.exp(-dt * 6);
    this.vel.y -= HERO.GRAV * dt;
    this.pos.addScaledVector(this.vel, dt);
    this.collide();
    const s = this.support(this.pos.x, this.pos.z, this.pos.y);
    if (this.pos.y <= s) { this.pos.y = s; this.vel.y = 0; this.onGround = true; } else this.onGround = false;
  }

  updGround(dt, G, w, P, D) {
    const sprint = D('SPRINT') || D('SWING');
    const sp = (sprint ? HERO.SPRINT : HERO.RUN) * (w.length() > 0.2 ? 1 : 0);
    const tv = w.clone().normalize().multiplyScalar(sp);
    const k = 1 - Math.exp(-dt * (this.attack ? 3 : 12));
    this.vel.x += (tv.x - this.vel.x) * k; this.vel.z += (tv.z - this.vel.z) * k;
    if (w.length() > 0.2 && !this.attack) this.turnTo(Math.atan2(w.x, w.z), dt, 14);
    this.vel.y = 0;
    this.pos.addScaledVector(this.vel, dt);
    const hit = this.collide();
    // chocar contra una fachada corriendo = subir por la pared
    if (hit && w.length() > 0.3 && w.dot(hit.n) < -0.5 && !this.attack) { this.toWall(hit, G); return; }
    const s = this.support(this.pos.x, this.pos.z, this.pos.y + 0.3);
    if (this.pos.y - s > 0.4) { this.state = 'air'; this.onGround = false; this.jumps = 1; return; }
    this.pos.y = s; this.onGround = true;
    if (P('JUMP')) { this.vel.y = HERO.JUMP * (sprint ? 1.1 : 1); this.state = 'air'; this.onGround = false; this.jumps = 1; Audio2.sfx('jump'); }
    else if (P('ZIP')) this.tryZip(G);
    else if (sprint && P('SWING')) { this.vel.y = HERO.JUMP; this.state = 'air'; this.jumps = 1; }
  }

  updAir(dt, G, w, P, D) {
    const ac = 16;
    this.vel.x += w.x * ac * dt; this.vel.z += w.z * ac * dt;
    const hs = Math.hypot(this.vel.x, this.vel.z), cap = Math.max(HERO.SPRINT, this.airCap || 0);
    if (hs > cap) { this.vel.x *= cap / hs; this.vel.z *= cap / hs; }
    this.airCap = Math.max(HERO.SPRINT, (this.airCap || 0) - dt * 3);
    this.vel.y -= HERO.GRAV * dt;
    this.vel.y = Math.max(this.vel.y, -42);
    if (hs > 1) this.turnTo(Math.atan2(this.vel.x, this.vel.z), dt, 6);
    this.pos.addScaledVector(this.vel, dt);
    const hit = this.collide();
    if (hit && (w.dot(hit.n) < -0.2 || hit.speed > 4) && this.pos.y > City.groundAt(this.pos.x, this.pos.z) + 0.8) { this.toWall(hit, G); return; }
    const s = this.support(this.pos.x, this.pos.z, this.pos.y);
    if (this.pos.y <= s && this.vel.y <= 0) {
      this.pos.y = s; this.vel.y = 0; this.state = 'ground'; this.onGround = true; this.jumps = 0; this.landT = 0.18;
      if (this.fallSpeed > 25) { G.shake(0.25); G.particles.burst(this.pos, 14, 0xb8b0a0, 5); Audio2.sfx('land'); }
      return;
    }
    this.fallSpeed = -this.vel.y;
    if (D('SWING') && (P('SWING') || this.vel.y < 2) && (this.releaseT || 0) <= 0) this.tryAttach(G);
    if (this.releaseT > 0) this.releaseT -= dt;
    if (P('JUMP') && this.jumps < 2) { this.vel.y = HERO.JUMP2; this.jumps = 2; this.flipT = 0.5; Audio2.sfx('jump'); }
    if (P('ZIP')) this.tryZip(G);
  }

  tryAttach(G) {
    const hv = new THREE.Vector3(this.vel.x, 0, this.vel.z);
    const dir = hv.length() > 3 ? hv.normalize() : new THREE.Vector3(Math.sin(G.camYaw), 0, Math.cos(G.camYaw));
    this.side = -(this.side || 1);
    const a = this.findAnchor(dir, this.side);
    if (!a) return false;
    this.anchor = a; this.rope = a.distanceTo(this.pos); this.state = 'swing'; this.st = 0;
    this.swingDir = dir;
    Audio2.sfx('thwip');
    return true;
  }

  updSwing(dt, G, w, P, D) {
    const A = this.anchor;
    // gravedad + impulso del jugador
    this.vel.y -= HERO.GRAV * dt;
    const pump = w.length() > 0.2 ? w : this.swingDir;
    this.vel.addScaledVector(pump, 11 * dt);
    this.vel.addScaledVector(this.swingDir, 3 * dt);
    this.pos.addScaledVector(this.vel, dt);
    // la cuerda se acorta un poco para ganar altura
    this.rope = Math.max(8, this.rope - dt * 1.2);
    const d = this.pos.clone().sub(A), L = d.length();
    if (L > this.rope) {
      d.divideScalar(L);
      this.pos.copy(A).addScaledVector(d, this.rope);
      const vn = this.vel.dot(d);
      if (vn > 0) this.vel.addScaledVector(d, -vn);
    }
    const sp = this.vel.length();
    if (sp > 38) this.vel.multiplyScalar(38 / sp);
    const hv = new THREE.Vector3(this.vel.x, 0, this.vel.z);
    if (hv.length() > 1) { this.turnTo(Math.atan2(hv.x, hv.z), dt, 8); this.swingDir.lerp(hv.normalize(), dt * 2).normalize(); }
    const hit = this.collide();
    const s = this.support(this.pos.x, this.pos.z, this.pos.y);
    const release = !D('SWING') || P('JUMP');
    // se suelta si pasa el ancla (demasiado alto delante) o toca algo
    const passed = this.pos.y > A.y - 2 && this.st > 0.4;
    if (hit) { this.anchor = null; this.toWall(hit, G); return; }
    if (this.pos.y <= s + 0.05) { this.pos.y = s; this.anchor = null; this.state = 'ground'; this.vel.y = 0; return; }
    if (release || passed) {
      this.anchor = null; this.state = 'air'; this.jumps = 1; this.airCap = Math.max(HERO.SPRINT, hv.length() + 6);
      // impulso de salida: hacia delante y arriba (voltereta)
      this.vel.addScaledVector(this.swingDir, 5);
      if (this.vel.y > -4) this.vel.y += P('JUMP') ? 9 : 5;
      this.flipT = 0.55; this.releaseT = 0.12;
      Audio2.sfx('whoosh');
    }
  }

  toWall(hit, G) {
    this.state = 'wall'; this.wall = hit; this.anchor = null; this.vel.set(0, 0, 0); this.st = 0; this.jumps = 0;
    this.yaw = Math.atan2(-hit.n.x, -hit.n.z);
  }
  updWall(dt, G, w, P, D) {
    const { b, n } = this.wall;
    const t = new THREE.Vector3(-n.z, 0, n.x);
    const run = D('SPRINT') || D('SWING');
    const climb = run ? HERO.WALLRUN : HERO.CLIMB;
    let upv = -w.dot(n), lat = w.dot(t);
    // empujar la cámara hacia la pared = subir
    const cf = new THREE.Vector3(Math.sin(G.camYaw), 0, Math.cos(G.camYaw));
    if (Input3.move.y < -0.3 && cf.dot(n) > 0.3) upv = -Input3.move.y;
    this.vel.set(t.x * lat * climb, upv * climb, t.z * lat * climb);
    this.pos.addScaledVector(this.vel, dt);
    // pegado a la cara
    if (n.x) this.pos.x = n.x > 0 ? b.x1 + HERO.R : b.x0 - HERO.R; else this.pos.z = n.z > 0 ? b.z1 + HERO.R : b.z0 - HERO.R;
    this.crawlPh = (this.crawlPh || 0) + dt * (Math.abs(upv) + Math.abs(lat)) * 7;
    const inside = n.x ? (this.pos.z > b.z0 - 0.2 && this.pos.z < b.z1 + 0.2) : (this.pos.x > b.x0 - 0.2 && this.pos.x < b.x1 + 0.2);
    const gnd = City.groundAt(this.pos.x, this.pos.z);
    if (this.pos.y >= b.h - 0.3) {
      // arriba del todo: salta a la azotea con voltereta
      this.pos.y = b.h; this.pos.addScaledVector(n, -1.1); this.state = 'ground'; this.flipT = 0.45; this.vel.set(-n.x * 3, 0, -n.z * 3);
      return;
    }
    if (!inside) { this.state = 'air'; this.jumps = 1; return; }
    if (this.pos.y <= gnd + 0.02 && upv < 0) { this.pos.y = gnd; this.state = 'ground'; return; }
    this.pos.y = Math.max(this.pos.y, gnd);
    if (P('JUMP')) {
      this.state = 'air'; this.jumps = 1;
      const away = w.length() > 0.3 && w.dot(n) > 0.2;
      this.vel.copy(n).multiplyScalar(away ? 9 : 5).addScaledVector(UP, away ? 7 : 10);
      this.pos.addScaledVector(n, 0.2); this.flipT = 0.5; this.releaseT = 0.15;
      Audio2.sfx('jump');
    }
    if (D('SWING') && P('SWING')) { this.pos.addScaledVector(n, 0.3); this.state = 'air'; this.vel.copy(n).multiplyScalar(6).addScaledVector(UP, 6); }
    if (P('ZIP')) this.tryZip(G);
  }

  tryZip(G) {
    // con enemigos cerca, el impulso es un "golpe de telaraña"
    const e = G.target(this, 22, null, true);
    if (e) { this.webStrike(G, e); return; }
    const t = this.findZip(G.camera);
    if (!t) { G.toast('', 'Apunta a una azotea con la cámara'); return; }
    this.state = 'zip'; this.zipT = t; this.st = 0; this.anchor = null; Audio2.sfx('thwip');
    this.yaw = Math.atan2(t.x - this.pos.x, t.z - this.pos.z);
  }
  updZip(dt, G, P) {
    const d = this.zipT.clone().sub(this.pos), L = d.length();
    const sp = 34;
    if (L < 1.2 || this.st > 3) {
      this.state = 'air'; this.vel.set(d.x, 0, d.z).normalize().multiplyScalar(6); this.vel.y = 9; this.flipT = 0.55; this.jumps = 1; this.zipT = null;
      return;
    }
    this.vel.copy(d).divideScalar(L).multiplyScalar(sp);
    this.pos.addScaledVector(this.vel, dt);
  }

  // ---- combate ----
  startAttack(G, w) {
    const e = G.target(this, 7.5, w.length() > 0.3 ? w : null);
    const air = this.state === 'air';
    this.combo = this.comboT > 0 ? this.combo + 1 : 0;
    const seq = air ? ['airkick', 'airkick', 'airkick'] : ['jabR', 'jabL', 'kick', 'uppercut'];
    const kind = seq[this.combo % seq.length];
    this.attack = { kind, t: 0, dur: kind === 'uppercut' ? 0.5 : kind === 'kick' ? 0.45 : 0.34, hit: false, target: e, lunge: false };
    if (e) {
      const d = e.pos.clone().sub(this.pos); d.y = 0;
      this.yaw = Math.atan2(d.x, d.z);
      if (d.length() > 1.8) { this.attack.lunge = true; this.lungeFrom = this.pos.clone(); }
    }
    this.comboT = 0.9;
    Audio2.sfx('whoosh');
  }
  updateAttack(dt, G) {
    const a = this.attack, e = a.target;
    if (a.lunge) {
      // se lanza hacia el enemigo (estilo Arkham / PlayStation)
      const d = e && !e.dead ? e.pos.clone().sub(this.pos) : null;
      if (!d || d.length() < 1.5 || a.t > 0.35) { a.lunge = false; a.t = 0; }
      else { d.y = 0; const L = d.length(); this.pos.addScaledVector(d.divideScalar(L), Math.min(L - 1.3, 26 * dt)); this.yaw = Math.atan2(d.x, d.z); a.t += dt; this.collide(); return; }
    }
    a.t += dt;
    const air = this.state === 'air';
    if (!a.hit && a.t > a.dur * 0.42) {
      a.hit = true;
      const heavy = a.kind === 'kick' || a.kind === 'uppercut';
      const dmg = { jabR: 10, jabL: 10, kick: 15, uppercut: 13, airkick: 12 }[a.kind];
      const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      let any = false;
      for (const en of G.enemies) {
        if (en.dead) continue;
        const d = en.pos.clone().sub(this.pos); const dy = d.y; d.y = 0;
        if (d.length() < 2.3 && Math.abs(dy) < 2.2 && (d.length() < 0.8 || d.normalize().dot(fwd) > 0.2)) {
          const launch = a.kind === 'uppercut';
          if (en.takeHit(dmg, fwd, heavy, launch, G)) any = true;
        }
      }
      if (any) {
        this.hitCount++; this.gainFocus(6); G.onHit(heavy);
        if (air) { this.vel.y = Math.max(this.vel.y, 3); }
        if (a.kind === 'uppercut' && !air) { this.vel.y = 9; this.state = 'air'; this.jumps = 1; }
      }
    }
    if (a.t >= a.dur) this.attack = null;
    if (!air) { this.vel.x *= Math.exp(-dt * 10); this.vel.z *= Math.exp(-dt * 10); }
  }
  webStrike(G, e) {
    this.attack = { kind: 'airkick', t: 0, dur: 0.4, hit: false, target: e, lunge: true };
    this.state = 'air'; this.vel.set(0, 2, 0); this.jumps = 1;
    this.webFlash = { to: e.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), t: 0.3 };
    Audio2.sfx('thwip');
  }
  dodge(G, w) {
    const threat = G.threatNear(this);
    let dir = w.length() > 0.2 ? w.clone().normalize() : null;
    if (!dir && threat) { dir = this.pos.clone().sub(threat.pos); dir.y = 0; dir.normalize(); }
    if (!dir) dir = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.dodgeDir = dir; this.state = 'dodge'; this.st = 0; this.inv = 0.4; this.dodgeCd = 0.35; this.attack = null;
    this.dodgeKind = this.onGround ? (dir.dot(new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw))) > 0.3 ? 'roll' : 'backflip') : 'airflip';
    if (threat && threat.windup) G.perfectDodge(this);
    Audio2.sfx('dodge');
  }
  updDodge(dt, G) {
    const sp = this.st < 0.3 ? 12 : 0;
    this.vel.x = this.dodgeDir.x * sp; this.vel.z = this.dodgeDir.z * sp;
    this.vel.y -= HERO.GRAV * dt * (this.onGround ? 0 : 1);
    this.pos.addScaledVector(this.vel, dt);
    this.collide();
    const s = this.support(this.pos.x, this.pos.z, this.pos.y + 0.3);
    if (this.pos.y <= s + 0.01 || this.onGround) { this.pos.y = Math.max(s, this.pos.y <= s + 0.4 ? s : this.pos.y); this.onGround = this.pos.y <= s + 0.01; }
    if (this.st > 0.38) this.state = this.onGround ? 'ground' : 'air';
  }
  shootWeb(G) {
    const e = G.target(this, 18, null, true);
    this.webCd = 0.3;
    if (!e) return;
    this.webShot = { to: e.pos.clone().add(new THREE.Vector3(0, 1.1, 0)), t: 0.18, side: (this.webSide = -(this.webSide || 1)) };
    e.web(G);
    Audio2.sfx('shoot');
  }
  special(G) {
    this.focus -= 50; this.specialT = 0.7; this.inv = 0.7;
    G.shake(0.4); Audio2.sfx('special');
    for (const en of G.enemies) {
      if (en.dead) continue;
      const d = en.pos.clone().sub(this.pos); d.y = 0;
      if (d.length() < 6) en.takeHit(24, d.normalize(), true, true, G);
    }
    G.particles.burst(this.pos.clone().add(new THREE.Vector3(0, 1, 0)), 40, 0xffffff, 12);
  }
  gainFocus(n) { this.focus = Math.min(100, this.focus + n); }
  damage(n, from, G) {
    if (this.inv > 0 || this.state === 'dead' || this.state === 'dodge') return false;
    this.hp -= n; this.inv = 0.6; this.hurtT = 0.4; this.attack = null;
    const d = this.pos.clone().sub(from); d.y = 0; d.normalize();
    if (this.state === 'swing' || this.state === 'wall') { this.state = 'air'; this.anchor = null; }
    this.vel.x = d.x * 6; this.vel.z = d.z * 6;
    if (this.state === 'ground') { this.state = 'hurt'; this.st = 0; }
    G.shake(0.3); Audio2.sfx('hurt'); G.onPlayerHurt();
    if (this.hp <= 0) { this.hp = 0; this.state = 'dead'; this.st = 0; }
    return true;
  }

  turnTo(a, dt, k) {
    let d = a - this.yaw;
    while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
    this.yaw += d * Math.min(1, dt * k);
  }

  // ---- animación ----
  animate(dt, G) {
    const R = this.rig, t = G.time;
    let pose, k = 1 - Math.exp(-dt * 16);
    const body = R.body;
    body.rotation.set(0, 0, 0); body.position.set(0, 0, 0);
    this.rig.root.position.copy(this.pos);
    this.rig.root.quaternion.setFromAxisAngle(UP, this.yaw);
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.line.visible = false; this.line2.visible = false;
    switch (this.state) {
      case 'ground':
        if (this.attack) pose = this.attackPose();
        else if (hs > 0.6) { this.runPh += dt * hs * 1.25; pose = P3.run(this.runPh, hs > HERO.RUN + 1); k = 1 - Math.exp(-dt * 22); }
        else if (this.landT > 0) pose = P3.perch();
        else pose = G.inCombat ? P3.guard(t) : P3.idle(t);
        break;
      case 'air':
        pose = this.attack ? this.attackPose() : this.vel.y > 1 ? P3.jump() : P3.fall(t);
        if (this.flipT > 0) { pose = P3.flip(); spinX(body, (1 - this.flipT / 0.55) * TAU); }
        break;
      case 'swing': {
        const A = this.anchor;
        const ph = this.vel.dot(this.swingDir) / 18 * (this.vel.y > 0 ? 1 : -1);
        pose = P3.swing(ph);
        // orienta el cuerpo a lo largo de la cuerda
        const up = A.clone().sub(this.pos).normalize();
        const fwd = this.swingDir.clone().addScaledVector(up, -this.swingDir.dot(up)).normalize();
        const right = new THREE.Vector3().crossVectors(up, fwd);
        const m = new THREE.Matrix4().makeBasis(right, up, fwd);
        this.rig.root.quaternion.setFromRotationMatrix(m);
        this.rig.root.position.copy(this.pos).addScaledVector(up, -0.2);
        this.rig.root.updateMatrixWorld(true);
        placeLine(this.line, this.handPos(1), A);
        break;
      }
      case 'wall':
        pose = P3.crawl(this.crawlPh || 0);
        this.rig.root.position.addScaledVector(this.wall.n, 0.05);
        break;
      case 'zip':
        pose = P3.zip();
        this.rig.root.updateMatrixWorld(true);
        placeLine(this.line, this.handPos(1), this.zipT); placeLine(this.line2, this.handPos(-1), this.zipT);
        break;
      case 'dodge': {
        const u = clamp(this.st / 0.38, 0, 1);
        pose = P3.flip();
        const back = this.dodgeKind === 'backflip';
        const dy = Math.atan2(this.dodgeDir.x, this.dodgeDir.z);
        this.rig.root.quaternion.setFromAxisAngle(UP, back ? dy + Math.PI : dy);
        spinX(body, (back ? -1 : 1) * u * TAU);
        break;
      }
      case 'hurt': pose = P3.hurt(); break;
      case 'dead': pose = P3.down(); body.rotation.x = -Math.min(1, this.st * 3) * Math.PI / 2; body.position.set(0, 0.15, 0); break;
      default: pose = P3.idle(t);
    }
    if (this.specialT > 0) { this.specialT -= dt; pose = P3.special(this.specialT); }
    // disparo de red y golpe de telaraña
    if (this.webShot && this.webShot.t > 0) {
      this.webShot.t -= dt; pose = P3.webShoot(this.webShot.side);
      this.rig.root.updateMatrixWorld(true); placeLine(this.line2, this.handPos(this.webShot.side), this.webShot.to);
    }
    if (this.webFlash && this.webFlash.t > 0) { this.webFlash.t -= dt; this.rig.root.updateMatrixWorld(true); placeLine(this.line, this.handPos(1), this.webFlash.to); }
    R.apply(pose, k);
    // parpadeo al recibir daño
    R.root.visible = !(this.hurtT > 0 && Math.floor(this.hurtT * 20) % 2);
    if (R.ironLegs) R.ironLegs.forEach((l, i) => { l.rotation.x = -0.4 + Math.sin(t * 3 + i) * 0.15; });
  }
  attackPose() {
    const a = this.attack, u = a.lunge ? 0 : clamp(a.t / a.dur, 0, 1);
    if (a.lunge) return a.kind === 'airkick' ? P3.zip() : P3.run(this.runPh += 0.4, true);
    switch (a.kind) {
      case 'jabR': return P3.jab(u, 1);
      case 'jabL': return P3.jab(u, -1);
      case 'kick': return P3.kick(u);
      case 'uppercut': return P3.uppercut(u);
      default: return P3.airkick(u);
    }
  }
}
