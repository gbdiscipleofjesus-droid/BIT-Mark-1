// Bot de combate: se acerca, golpea, lanza red y esquiva. Comprueba que cada
// jefe se puede derrotar jugando (sin trucos) y mide el daño recibido.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { resolve } from 'node:path';

const file = resolve(process.argv[2] || 'index.html');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 768, height: 432 } });
const problems = [];
page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
await page.goto('file://' + file);
await page.waitForTimeout(500);

const result = await page.evaluate(() => {
  const out = [];
  const step = () => { Input.poll(); Game.step(1 / 60); };
  const clear = () => { for (const k in Input.keys) Input.keys[k] = false; };
  Game.save.started = true;
  const list = [[0, 'desconocido0'], [1, 'sandman'], [1, 'venom'], [2, 'rino'], [2, 'electro'], [3, 'mancha'], [3, 'miguel'], [4, 'desconocido4']];
  for (const [m, bossId] of list) {
    Game.fade = null;
    Game.scene = Game.missionScene(m);
    for (let i = 0; i < 5; i++) step();
    const w = Game.scene.world;
    const a = w.level.arenas.find((x) => x.boss === bossId);
    for (const o of w.level.arenas) if (o !== a) o.done = true;
    for (const c of w.level.canons) c.done = true;
    w.enemies = [];
    w.player.x = a.x1 + 40; w.player.y = w.level.surfaceY(a.x1 + 45) - 22;
    let dmgTaken = 0, frames = 0, deaths = 0;
    for (let i = 0; i < 60 * 240 && !(w.boss && w.boss.dead); i++) {
      if (w.flash || w.choice) break;
      clear();
      const p = w.player, b = w.boss;
      if (w.dialog) { if (i % 6 === 0) Input.keyLatch.Enter = true; step(); continue; }
      if (p.hp < p.maxHp * 0.3) { p.hp = p.maxHp; deaths++; }
      if (b && !b.dead && b.state !== 'wait') {
        frames++;
        const dx = b.cx - p.cx, dy = b.cy - p.cy;
        const near = Math.abs(dx) < 22 + b.w / 2;
        if (!near) Input.keys[dx > 0 ? 'ArrowRight' : 'ArrowLeft'] = true;
        else if ((dx > 0 ? 1 : -1) !== p.facing) Input.keys[dx > 0 ? 'ArrowRight' : 'ArrowLeft'] = true;
        if (p.sense > 0 && i % 4 === 0) Input.keyLatch.ShiftLeft = true;
        if (near && Math.abs(dy) < 30 && i % 8 === 0) Input.keyLatch.KeyX = true;
        if (dy < -30 && p.onGround && i % 20 === 0) Input.keyLatch.Space = true;
        if (dy < -30 && !p.onGround && p.vy > -40 && p.airJumps > 0) Input.keyLatch.Space = true;
        if (dy < -30 && !p.onGround && near && i % 6 === 0) Input.keyLatch.KeyX = true;
        if (i % 50 === 0 && b.state !== 'stunned') Input.keyLatch.KeyV = true;
        if (p.focus >= 50 && near && i % 30 === 0) Input.keyLatch.KeyB = true;
      }
      const hp0 = p.hp;
      step();
      if (w.player.hp < hp0) dmgTaken += hp0 - w.player.hp;
      if (p.state === 'dead') { deaths++; w.respawn(); }
    }
    const b = w.boss;
    out.push({ m, boss: b && b.name, dead: !!(b && b.dead), hp: b ? Math.round(b.hp) : null, secs: Math.round(frames / 60), dmgTaken: Math.round(dmgTaken), lowHpResets: deaths, errors: Game.errors.length });
    Game.errors.length = 0;
  }
  return out;
});
for (const r of result) console.log(JSON.stringify(r));
if (problems.length) console.log('PROBLEMS', problems);
await browser.close();
