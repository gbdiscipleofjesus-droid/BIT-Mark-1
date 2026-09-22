// Movimiento en profundidad estilo beat 'em up clásico
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { resolve } from 'node:path';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1152, height: 648 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('file://' + resolve(process.argv[2] || 'index.html'));
await page.waitForTimeout(400);
const r = await page.evaluate(() => {
  const step = (n, f) => { for (let i = 0; i < n; i++) { if (f) f(i); Input.poll(); Game.step(1 / 60); } };
  Game.fade = null; Game.save.started = true; Game.scene = Game.missionScene(0);
  const w = Game.scene.world; w.card = null; w.enemies = []; w.tip = null; w.level.tips.forEach((t) => { t.shown = true; });
  step(20);
  const p = w.player;
  const out = { z0: p.z };
  Input.keys.ArrowUp = true; step(40); Input.keys.ArrowUp = false;
  out.zUp = Math.round(p.z);
  Input.keys.ArrowDown = true; step(15); Input.keys.ArrowDown = false;
  out.zDown = Math.round(p.z);
  // enemigo en otro carril: el golpe no conecta
  p.z = 0;
  const e = w.spawnEnemy('thug', p.x + 14, null); e.z = 25; e.state = 'idle'; e.aggro = false;
  const hp0 = e.hp;
  Input.keyLatch.KeyX = true; step(20);
  out.otherLaneHit = e.hp < hp0;
  e.z = 0; e.x = p.x + 14;
  Input.keyLatch.KeyX = true; step(20);
  out.sameLaneHit = e.hp < hp0;
  // el enemigo se alinea con el jugador
  const e2 = w.spawnEnemy('thug', p.x + 100, null); e2.z = 25; e2.aggro = true; e2.state = 'chase';
  p.z = 3; p.inv = 99;
  step(90);
  out.enemyAligns = Math.round(e2.z);
  // subir a un tejado devuelve la profundidad a 0
  Game.render();
  return { out, errors: Game.errors };
});
await page.screenshot({ path: 'tests/shots/50_depth.png' });
console.log(JSON.stringify(r), errs);
await browser.close();
