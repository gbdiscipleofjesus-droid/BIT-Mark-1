'use strict';
// ---------------------------------------------------------------------------
// Enemigos 3D: matones, pistoleros, brutos y el jefe El Desconocido.
// Proyectiles, partículas y la grieta multiversal.
// ---------------------------------------------------------------------------
const THUG3_PALS = [
  { torso: '#4a5a2a', leg: '#2a3450', hair: '#1a1a1a', face: 'beanie', head: '#d8a070' },
  { torso: '#6a2a2a', leg: '#2a2a30', hair: '#3a2416', face: 'human', head: '#b8845a' },
  { torso: '#2a3a5a', leg: '#3a3a3a', hair: '#8a2020', face: 'beanie', head: '#e0b088' },
  { torso: '#5a4a3a', leg: '#1e2a44', hair: '#141414', face: 'mask', head: '#141414', eye: '#e0e0e0' },
  { torso: '#3a3a3a', leg: '#4a3a2a', hair: '#e0c060', face: 'human', head: '#8a5a3a' },
].map((p) => makePal(Object.assign({ boot: '#1a1a1a', outline: '#140a12', hand: p.head }, p)));
const BRUTE3_PAL = makePal({ torso: '#5a5a62', torsoLow: '#3a3a42', arm: '#6a4a3a', arm2: '#c89070', hand: '#c89070', leg: '#2a2a34', boot: '#1a1a1a', head: '#c89070', hair: '#1a1a1a', face: 'beanie', outline: '#140a12' });
const E3 = {
  thug: { hp: 45, dmg: 11, speed: 5.2, range: 1.7, windup: 0.55, block: 0.2 },
  gunner: { hp: 34, dmg: 9, speed: 4.6, range: 12, windup: 0.8, ranged: true },
  brute: { hp: 110, dmg: 19, speed: 4.2, range: 2.0, windup: 0.8, armor: true },
};

class Particles3 {
  constructor(scene, n = 600) {
    this.n = n; this.i = 0;
    const g = new THREE.BufferGeometry();
    this.p = new Float32Array(n * 3).fill(-9999); this.c = new Float32Array(n * 3); this.v = new Float32Array(n * 3); this.life = new Float32Array(n);
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.c, 3));
    this.pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, depthWrite: false }));
    this.pts.frustumCulled = false; scene.add(this.pts);
  }
  burst(pos, n, color, sp = 6) {
    const c = new THREE.Color(color);
    for (let k = 0; k < n; k++) {
      const i = this.i; this.i = (this.i + 1) % this.n;
      this.p[i * 3] = pos.x; this.p[i * 3 + 1] = pos.y; this.p[i * 3 + 2] = pos.z;
      this.v[i * 3] = rand(-1, 1) * sp; this.v[i * 3 + 1] = rand(0, 1.2) * sp; this.v[i * 3 + 2] = rand(-1, 1) * sp;
      this.c[i * 3] = c.r; this.c[i * 3 + 1] = c.g; this.c[i * 3 + 2] = c.b; this.life[i] = rand(0.3, 0.8);
    }
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.p[i * 3 + 1] = -9999; continue; }
      this.v[i * 3 + 1] -= 14 * dt;
      for (let a = 0; a < 3; a++) this.p[i * 3 + a] += this.v[i * 3 + a] * dt;
    }
    this.pts.geometry.attributes.position.needsUpdate = true; this.pts.geometry.attributes.color.needsUpdate = true;
  }
}

class Proj3 {
  constructor(G, kind, pos, vel, dmg) {
    this.kind = kind; this.pos = pos.clone(); this.vel = vel; this.dmg = dmg; this.life = 3; this.dead = false;
    const col = kind === 'bullet' ? 0xffe070 : kind === 'web' ? 0xffa060 : 0xffffff;
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(kind === 'bullet' ? 0.09 : 0.22, 8, 6), new THREE.MeshBasicMaterial({ color: col }));
    G.scene.add(this.mesh); this.mesh.position.copy(this.pos);
  }
  update(dt, G) {
    this.pos.addScaledVector(this.vel, dt); this.life -= dt;
    this.mesh.position.copy(this.pos);
    const p = G.hero, c = p.pos.clone().add(new THREE.Vector3(0, 1.1, 0));
    if (c.distanceTo(this.pos) < 0.8) { if (p.damage(this.dmg, this.pos, G)) G.particles.burst(this.pos, 8, 0xffd080, 4); this.kill(G); return; }
    if (this.life <= 0 || this.pos.y < 0) { this.kill(G); return; }
    for (const b of City.near(this.pos.x, this.pos.z, 0)) if (this.pos.x > b.x0 && this.pos.x < b.x1 && this.pos.z > b.z0 && this.pos.z < b.z1 && this.pos.y < b.h) { this.kill(G); return; }
  }
  kill(G) { this.dead = true; G.scene.remove(this.mesh); this.mesh.geometry.dispose(); }
}

class Enemy3D {
  constructor(G, type, x, z, o = {}) {
    this.G = G; this.type = type; this.spec = E3[type] || E3.thug;
    this.id = Enemy3D.nextId = (Enemy3D.nextId || 0) + 1;
    this.pal = o.pal || (type === 'brute' ? BRUTE3_PAL : pick(THUG3_PALS));
    this.rig = new Rig3D(this.pal, { key: 'thug' + THUG3_PALS.indexOf(this.pal) + type, scale: type === 'brute' ? 1.18 : 1, bulk: type === 'brute' ? 1.4 : 1 });
    G.scene.add(this.rig.root);
    this.pos = new THREE.Vector3(x, 0, z); this.pos.y = Hero.prototype.support(x, z, 999);
    this.vel = new THREE.Vector3(); this.yaw = rand(0, TAU);
    this.hp = this.maxHp = this.spec.hp; this.state = 'idle'; this.t = rand(0.5, 1.5); this.dead = false; this.aggro = !!o.aggro;
    this.webs = 0; this.webT = 0; this.anim = rand(0, 5); this.onGround = true;
    if (type === 'gunner') {
      const gun = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.22), new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.7 }));
      gun.position.set(0, -0.07, 0.08); this.rig.j.haR.add(gun);
    }
    this.cocoon = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.9, transparent: true, opacity: 0.85 }));
    this.cocoon.scale.set(1, 2.3, 1); this.cocoon.position.y = 1; this.cocoon.visible = false; this.rig.root.add(this.cocoon);
  }
  get windup() { return this.state === 'windup' && this.t < 0.35; }
  hittable() { return !this.dead; }
  web(G) {
    if (this.dead) return;
    this.webs++;
    G.particles.burst(this.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), 6, 0xffffff, 3);
    if (this.webs >= (this.type === 'brute' ? 3 : 2)) { this.webs = 0; this.state = 'webbed'; this.webT = 4; this.t = 4; G.float(this.pos, '¡ATRAPADO!'); }
  }
  takeHit(dmg, dir, heavy, launch, G) {
    if (this.dead) return false;
    if (this.state !== 'webbed' && this.state !== 'air' && this.state !== 'hurt' && ((this.spec.armor && !heavy) || (this.spec.block && Math.random() < this.spec.block && this.state !== 'windup'))) {
      G.particles.burst(this.pos.clone().add(new THREE.Vector3(0, 1.3, 0)), 10, 0x80c0ff, 4); G.float(this.pos, '¡BLOQUEA!'); Audio2.sfx('back');
      this.state = 'recover'; this.t = 0.3; return false;
    }
    const mul = this.state === 'webbed' ? 1.5 : 1;
    this.hp -= dmg * mul;
    G.particles.burst(this.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), heavy ? 16 : 9, 0xffe0a0, heavy ? 7 : 4);
    Audio2.sfx(heavy ? 'heavy' : 'punch');
    this.aggro = true;
    if (this.hp <= 0) { this.die(dir, G); return true; }
    if (this.state === 'webbed') return true;
    if (launch || this.state === 'air') { this.state = 'air'; this.vel.set(dir.x * 1.5, launch ? 10 : 4.5, dir.z * 1.5); this.onGround = false; }
    else { this.state = 'hurt'; this.t = heavy ? 0.6 : 0.4; this.vel.set(dir.x * (heavy ? 7 : 3), 0, dir.z * (heavy ? 7 : 3)); }
    return true;
  }
  die(dir, G) {
    this.dead = true; this.state = 'down'; this.t = 0; this.vel.set(dir.x * 6, 5, dir.z * 6); this.onGround = false;
    G.onKO(this);
  }
  update(dt, G) {
    const p = G.hero, sp = this.spec;
    this.anim += dt; this.t -= dt;
    const to = p.pos.clone().sub(this.pos); to.y = 0; const dist = to.length();
    const ground = () => {
      this.vel.y -= 22 * dt; this.pos.addScaledVector(this.vel, dt);
      Hero.prototype.collide.call(this);
      const s = Hero.prototype.support(this.pos.x, this.pos.z, this.pos.y + 0.3);
      if (this.pos.y <= s) { this.pos.y = s; this.vel.y = 0; this.onGround = true; } else this.onGround = false;
    };
    if (this.dead) { this.vel.x *= Math.exp(-dt * 3); this.vel.z *= Math.exp(-dt * 3); ground(); if (this.t < -8) this.remove = true; this.animate(dt, G); return; }
    if (!this.aggro && dist < 22 && Math.abs(p.pos.y - this.pos.y) < 6) this.aggro = true;
    switch (this.state) {
      case 'idle':
        this.vel.x *= 0.8; this.vel.z *= 0.8;
        if (this.aggro) { this.state = 'chase'; this.t = rand(0.2, 0.8); }
        break;
      case 'chase': {
        if (dist > 0.1) this.yaw = Math.atan2(to.x, to.z);
        const want = sp.ranged ? (dist < 8 ? -1 : dist > 14 ? 1 : 0) : (dist > sp.range ? 1 : 0);
        // rodea al jugador cuando no le toca atacar
        const hasToken = G.tokens.has(this);
        const circle = !sp.ranged && !hasToken && dist < 5 ? 1 : 0;
        const dir = to.clone().normalize();
        const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(circle * (this.id % 2 ? 1 : -1));
        const tv = dir.multiplyScalar(want * sp.speed * (hasToken || sp.ranged ? 1 : dist > 4.5 ? 1 : 0)).add(side.multiplyScalar(2));
        this.vel.x += (tv.x - this.vel.x) * Math.min(1, dt * 8); this.vel.z += (tv.z - this.vel.z) * Math.min(1, dt * 8);
        if (this.t <= 0 && Math.abs(p.pos.y - this.pos.y) < 2.5 && (sp.ranged ? dist < 18 : dist < sp.range + 0.4) && G.takeToken(this)) { this.state = 'windup'; this.t = sp.windup; this.vel.set(0, 0, 0); }
        break;
      }
      case 'windup':
        this.yaw = Math.atan2(to.x, to.z);
        if (this.t <= 0) {
          if (sp.ranged) {
            const o = this.pos.clone().add(new THREE.Vector3(0, 1.35, 0)), tgt = p.pos.clone().add(new THREE.Vector3(0, 1.1, 0));
            G.addProj(new Proj3(G, 'bullet', o, tgt.sub(o).normalize().multiplyScalar(26), sp.dmg));
            Audio2.sfx('shoot'); this.state = 'recover'; this.t = rand(1.2, 2.0);
          } else {
            this.state = 'attack'; this.t = 0.25; this.hitDone = false;
            this.vel.copy(to.normalize().multiplyScalar(5));
          }
        }
        break;
      case 'attack':
        if (!this.hitDone && this.t < 0.15) {
          this.hitDone = true;
          if (dist < sp.range + 0.6 && Math.abs(p.pos.y - this.pos.y) < 1.5) p.damage(sp.dmg, this.pos, G);
        }
        this.vel.multiplyScalar(Math.exp(-dt * 8));
        if (this.t <= 0) { this.state = 'recover'; this.t = rand(0.6, 1.2); }
        break;
      case 'recover':
        this.vel.multiplyScalar(Math.exp(-dt * 8));
        if (this.t <= 0) { G.releaseToken(this); this.state = 'chase'; this.t = rand(0.3, 1.2); }
        break;
      case 'hurt':
        this.vel.multiplyScalar(Math.exp(-dt * 6));
        if (this.t <= 0) { G.releaseToken(this); this.state = 'chase'; this.t = rand(0.4, 1); }
        break;
      case 'air':
        if (this.onGround && this.vel.y <= 0) { this.state = 'hurt'; this.t = 0.7; }
        break;
      case 'webbed':
        this.vel.set(0, this.vel.y, 0);
        if (this.t <= 0) { this.state = 'chase'; this.t = 0.5; }
        break;
    }
    if (this.state !== 'windup' && this.state !== 'attack') G.releaseTokenIfIdle(this);
    ground();
    this.animate(dt, G);
  }
  animate(dt, G) {
    const R = this.rig, body = R.body;
    R.root.position.copy(this.pos); R.root.quaternion.setFromAxisAngle(UP, this.yaw);
    body.rotation.set(0, 0, 0); body.position.set(0, 0, 0);
    let pose;
    const hs = Math.hypot(this.vel.x, this.vel.z);
    switch (this.state) {
      case 'windup': pose = this.spec.ranged ? P3.aim() : P3.windup(1 - this.t / this.spec.windup); break;
      case 'attack': pose = this.type === 'brute' ? P3.uppercut(1 - this.t / 0.25) : P3.swingPunch(1 - this.t / 0.25); break;
      case 'hurt': pose = P3.hurt(); break;
      case 'air': pose = P3.fall(this.anim); spinX(body, -this.anim * 6); break;
      case 'webbed': pose = P3.webbed(); break;
      case 'down': pose = P3.down(); body.rotation.x = -Math.min(1, -this.t * 4) * Math.PI / 2; body.position.set(0, 0.15, 0); break;
      default: pose = hs > 0.5 ? (this.runPh = (this.runPh || 0) + dt * hs * 1.3, P3.run(this.runPh, false)) : G.inCombat && this.aggro ? P3.guard(this.anim) : P3.idle(this.anim);
    }
    this.cocoon.visible = this.state === 'webbed';
    R.apply(pose, 1 - Math.exp(-dt * 14));
  }
  dispose(G) { G.scene.remove(this.rig.root); }
}

// ---- Jefe: El Desconocido (Peter Cero, sin revelar) ----
class Desconocido3D extends Enemy3D {
  constructor(G, x, z) {
    super(G, 'thug', x, z, { pal: SUITS.find((s) => s.id === 'cero').palObj, aggro: true });
    this.scene = G.scene;
    G.scene.remove(this.rig.root);
    this.rig = new Rig3D(this.pal, { key: 'cero', scale: 1.02 });
    this.rig.root.add(this.cocoon); G.scene.add(this.rig.root);
    this.isBoss = true; this.name = 'EL DESCONOCIDO';
    this.hp = this.maxHp = 620; this.phase = 1; this.state = 'intro'; this.t = 1; this.streak = 0; this.lastHit = -9; this.stun = 0; this.webNeed = 5;
    this.spec = { hp: 620, dmg: 14, speed: 9, range: 1.8, windup: 0.45 };
    // brasas del traje quemado
    this.embers = 0;
  }
  web(G) {
    if (this.dead || this.state === 'escape') return;
    this.webs++;
    G.float(this.pos, 'RED ' + this.webs + '/' + this.webNeed);
    if (this.webs >= this.webNeed) { this.webs = 0; this.state = 'stunned'; this.t = 2.2; G.float(this.pos, '¡ATURDIDO!'); }
  }
  takeHit(dmg, dir, heavy, launch, G) {
    if (this.dead || this.state === 'intro' || this.state === 'escape' || this.state === 'zipUp' || this.state === 'dive') return false;
    // castiga machacar botones: contraataque tras muchos golpes seguidos
    this.streak = G.time - this.lastHit < 0.9 ? this.streak + 1 : 1; this.lastHit = G.time;
    if (this.streak >= 6 && this.state !== 'stunned') {
      this.streak = 0; G.float(this.pos, '¡CONTRAATAQUE!'); G.shake(0.5); Audio2.sfx('explode');
      G.particles.burst(this.pos.clone().add(new THREE.Vector3(0, 1, 0)), 40, 0xff7020, 10);
      const p = G.hero; if (p.pos.distanceTo(this.pos) < 4.5) { p.damage(16, this.pos, G); p.vel.y = 7; p.state = 'air'; }
      this.state = 'recover'; this.t = 0.4;
      return false;
    }
    const mul = this.state === 'stunned' ? 1.6 : 0.85;
    this.hp -= dmg * mul;
    G.particles.burst(this.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), 12, 0xff9040, 5);
    Audio2.sfx(heavy ? 'heavy' : 'punch');
    if (this.phase === 1 && this.hp < this.maxHp * 0.6) {
      this.phase = 2; G.float(this.pos, '¡FURIA!'); G.shake(0.4);
      for (let k = 0; k < 3; k++) G.spawnEnemy(k === 2 ? 'gunner' : 'thug', this.pos.x + rand(-10, 10), this.pos.z + rand(-10, 10), true);
      this.state = 'riftWU'; this.t = 0.5;
    }
    if (this.hp <= this.maxHp * 0.3) { this.hp = this.maxHp * 0.3; this.state = 'escape'; this.t = 2.5; G.onBossEscape(this); return true; }
    if (this.state !== 'stunned' && heavy && Math.random() < 0.5) { this.state = 'recover'; this.t = 0.25; this.vel.set(dir.x * 5, 0, dir.z * 5); }
    return true;
  }
  update(dt, G) {
    const p = G.hero;
    this.anim += dt; this.t -= dt;
    const to = p.pos.clone().sub(this.pos); const dy = to.y; to.y = 0; const dist = to.length();
    const spd = this.phase === 2 ? 1.3 : 1;
    const ground = () => {
      this.vel.y -= 22 * dt; this.pos.addScaledVector(this.vel, dt);
      Hero.prototype.collide.call(this);
      const s = Hero.prototype.support(this.pos.x, this.pos.z, this.pos.y + 0.3);
      if (this.pos.y <= s) { this.pos.y = s; this.vel.y = 0; this.onGround = true; } else this.onGround = false;
    };
    if (++this.embers % 3 === 0) G.particles.burst(this.pos.clone().add(new THREE.Vector3(rand(-0.3, 0.3), rand(0.4, 1.6), rand(-0.3, 0.3))), 1, 0xff6020, 1);
    switch (this.state) {
      case 'intro': this.vel.set(0, this.vel.y, 0); this.yaw = Math.atan2(to.x, to.z); if (this.t <= 0 && G.inputOn) { this.state = 'move'; this.t = 1; } break;
      case 'move': {
        this.yaw = Math.atan2(to.x, to.z);
        const want = dist > 5 ? 1 : dist < 3 ? -0.6 : 0;
        const side = new THREE.Vector3(-to.z, 0, to.x).normalize().multiplyScalar(Math.sin(this.anim * 1.3) * 4);
        const tv = to.clone().normalize().multiplyScalar(want * 7 * spd).add(side);
        this.vel.x += (tv.x - this.vel.x) * Math.min(1, dt * 6); this.vel.z += (tv.z - this.vel.z) * Math.min(1, dt * 6);
        if (this.t <= 0) {
          const r = Math.random();
          if (r < 0.4) { this.state = 'lunge'; this.t = 0.6; this.hits = this.phase === 2 ? 4 : 3; }
          else if (r < 0.65) { this.state = 'ballsWU'; this.t = 0.5; }
          else if (r < 0.85) { this.state = 'zipUp'; this.t = 0.7; this.vel.set(0, 16, 0); Audio2.sfx('thwip'); }
          else { this.state = this.phase === 2 ? 'riftWU' : 'lunge'; this.t = 0.5; this.hits = 3; }
        }
        break;
      }
      case 'lunge':
        this.yaw = Math.atan2(to.x, to.z);
        if (dist > 1.7) { const d = to.clone().normalize().multiplyScalar(15 * spd); this.vel.x = d.x; this.vel.z = d.z; }
        if (dist <= 1.8 || this.t <= 0) { this.state = 'windup'; this.t = 0.42 / spd; this.vel.set(0, 0, 0); }
        break;
      case 'windup':
        this.yaw = Math.atan2(to.x, to.z);
        if (this.t <= 0) { this.state = 'attack'; this.t = 0.22; this.hitDone = false; this.vel.copy(to.normalize().multiplyScalar(6)); }
        break;
      case 'attack':
        if (!this.hitDone && this.t < 0.12) { this.hitDone = true; if (dist < 2.4 && Math.abs(dy) < 1.6) p.damage(this.spec.dmg, this.pos, G); }
        this.vel.multiplyScalar(Math.exp(-dt * 8));
        if (this.t <= 0) { this.hits--; if (this.hits > 0) { this.state = 'windup'; this.t = 0.3 / spd; } else { this.state = 'recover'; this.t = 0.9 / spd; } }
        break;
      case 'ballsWU':
        this.yaw = Math.atan2(to.x, to.z); this.vel.multiplyScalar(0.8);
        if (this.t <= 0) {
          const o = this.pos.clone().add(new THREE.Vector3(0, 1.4, 0));
          for (let k = -1; k <= 1; k++) {
            const tgt = p.pos.clone().add(new THREE.Vector3(0, 1, 0)); const d = tgt.sub(o).normalize();
            d.applyAxisAngle(UP, k * 0.18);
            G.addProj(new Proj3(G, 'web', o, d.multiplyScalar(20), 10));
          }
          Audio2.sfx('shoot'); this.state = 'recover'; this.t = 0.8;
        }
        break;
      case 'zipUp':
        if (this.t <= 0) { this.state = 'dive'; this.diveTo = p.pos.clone(); this.t = 1.2; G.float(this.diveTo, '⚠'); }
        this.vel.x *= 0.9; this.vel.z *= 0.9; this.vel.y = Math.max(this.vel.y - 22 * dt, 0) + 22 * dt;
        break;
      case 'dive': {
        const d = this.diveTo.clone().sub(this.pos); const L = d.length();
        this.vel.copy(d.normalize().multiplyScalar(26));
        if (L < 1 || this.onGround || this.t <= 0) {
          this.state = 'recover'; this.t = 1.1; this.vel.set(0, 0, 0);
          G.shake(0.5); Audio2.sfx('explode'); G.particles.burst(this.pos.clone().add(new THREE.Vector3(0, 0.3, 0)), 40, 0xff7020, 9);
          if (p.pos.distanceTo(this.pos) < 4.2 && p.pos.y - this.pos.y < 1.2) p.damage(18, this.pos, G);
        }
        break;
      }
      case 'riftWU':
        this.vel.multiplyScalar(0.8);
        if (this.t <= 0) {
          G.particles.burst(this.pos.clone().add(new THREE.Vector3(0, 1, 0)), 30, 0x60ffe0, 6);
          const back = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw)).multiplyScalar(2.2);
          this.pos.copy(p.pos).add(back); this.pos.y = p.pos.y;
          G.particles.burst(this.pos.clone().add(new THREE.Vector3(0, 1, 0)), 30, 0xff6020, 6);
          Audio2.sfx('glitch');
          this.state = 'windup'; this.t = 0.4; this.hits = 2;
        }
        break;
      case 'recover': this.vel.multiplyScalar(Math.exp(-dt * 6)); if (this.t <= 0) { this.state = 'move'; this.t = rand(0.6, 1.4) / spd; } break;
      case 'stunned': this.vel.set(0, this.vel.y, 0); if (this.t <= 0) { this.state = 'move'; this.t = 0.5; } break;
      case 'escape':
        this.vel.set(0, 3, 0);
        if (this.t <= 0) { this.remove = true; this.dead = true; }
        break;
    }
    if (this.state === 'zipUp' || this.state === 'dive' || this.state === 'escape') { this.pos.addScaledVector(this.vel, dt); } else ground();
    this.animBoss(dt, G);
  }
  get windup() { return (this.state === 'windup' && this.t < 0.3) || (this.state === 'dive' && this.t < 0.9); }
  animBoss(dt, G) {
    const R = this.rig, body = R.body;
    R.root.position.copy(this.pos); R.root.quaternion.setFromAxisAngle(UP, this.yaw);
    body.rotation.set(0, 0, 0); body.position.set(0, 0, 0);
    let pose;
    const hs = Math.hypot(this.vel.x, this.vel.z);
    switch (this.state) {
      case 'windup': pose = P3.windup(0.8); break;
      case 'attack': pose = (this.hits % 2) ? P3.jab(1 - this.t / 0.22, 1) : P3.kick(1 - this.t / 0.22); break;
      case 'ballsWU': pose = P3.webShoot(1); break;
      case 'zipUp': pose = P3.zip(); break;
      case 'dive': pose = P3.airkick(0.5); break;
      case 'stunned': pose = P3.hurt(); break;
      case 'intro': case 'escape': pose = P3.cheer(this.anim); break;
      case 'riftWU': pose = P3.flip(); break;
      default: pose = hs > 1 ? (this.runPh = (this.runPh || 0) + dt * hs * 1.2, P3.run(this.runPh, true)) : P3.guard(this.anim);
    }
    this.cocoon.visible = false;
    R.apply(pose, 1 - Math.exp(-dt * 18));
  }
}

// Grieta multiversal (anillo de energía)
function makeRift(scene, pos) {
  const g = new THREE.Group();
  const cols = [0x60ffe0, 0xff40c0, 0xffe040, 0xffffff];
  for (let k = 0; k < 4; k++) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(2.4 + k * 0.3, 0.06, 6, 40), new THREE.MeshBasicMaterial({ color: cols[k], transparent: true, opacity: 0.8 }));
    m.rotation.y = k * 0.4; g.add(m);
  }
  const core = new THREE.Mesh(new THREE.CircleGeometry(2.3, 32), new THREE.MeshBasicMaterial({ color: 0x0a0a1a, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
  g.add(core);
  g.position.copy(pos); scene.add(g);
  g.userData.spin = (dt) => { g.children.forEach((c, i) => { c.rotation.z += dt * (i + 1) * 0.8; if (i < 4) c.rotation.x += dt * 0.3 * (i % 2 ? 1 : -1); }); };
  return g;
}
