// Prueba de la versión 3D: carga, movimiento, balanceo, pared, combate y jefe.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { resolve } from 'node:path';
const file = resolve(process.argv[2] || '3d/index.html');
const shots = process.env.SHOTS || 'tests/shots';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
pg.on('pageerror', (e) => errs.push(e.message));
pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await pg.goto('file://' + file);
await pg.waitForFunction(() => typeof Game3 !== 'undefined' && Game3.hero, null, { timeout: 120000 }).catch(() => { console.log('no carga', errs); process.exit(1); });
// avanza la simulación de forma determinista (sin depender de los FPS)
await pg.evaluate(() => { Game3.loop = () => {}; window.sim = (n, f) => { for (let i = 0; i < n; i++) { if (f) f(i); Game3.step(1 / 30); } Game3.render(); }; window.K = (c, v) => { Input3.keys[c] = v; if (v) Input3.latch[c] = true; }; });
const shot = async (n) => { await pg.evaluate(() => Game3.render()); await pg.screenshot({ path: `${shots}/3d_${n}.png` }); };
const info = () => pg.evaluate(() => { const h = Game3.hero; return { st: h.state, x: +h.pos.x.toFixed(1), y: +h.pos.y.toFixed(1), z: +h.pos.z.toFixed(1), hp: h.hp, dialog: !!Game3.dialog, stage: Game3.stage, mode: Game3.mode, en: Game3.enemies.filter((e) => !e.dead).length, errors: Game3.errors || 0 }; });
await shot('00_start');
// pasar el diálogo de introducción
await pg.evaluate(() => sim(400, (i) => { if (i % 5 === 0) K('Space', true); else K('Space', false); }));
console.log('after intro', JSON.stringify(await info()));
// correr hacia delante
await pg.evaluate(() => { K('KeyW', true); sim(60); });
console.log('run', JSON.stringify(await info()));
await shot('01_run');
// saltar y balancearse
await pg.evaluate(() => { const h = Game3.hero; const r = City.buildings.filter((b) => b.h > 40 && b.h < 90 && !b.top)[3]; h.pos.set((r.x0 + r.x1) / 2, r.h, (r.z0 + r.z1) / 2); h.state = 'ground'; K('KeyW', true); sim(40); K('Space', true); sim(2); K('Space', false); sim(6); K('ShiftLeft', true); sim(25); });
console.log('swing', JSON.stringify(await info()));
await shot('02_swing');
await pg.evaluate(() => { sim(45); K('ShiftLeft', false); sim(15); });
console.log('after swing', JSON.stringify(await info()));
await shot('03_release');
await pg.evaluate(() => { K('KeyW', false); sim(90); });
// pared: ir contra el edificio más cercano
const wall = await pg.evaluate(() => {
  const h = Game3.hero; let best = null, bd = 1e9;
  for (const b of City.buildings) { if (b.top) continue; const cx = clamp(h.pos.x, b.x0, b.x1), cz = clamp(h.pos.z, b.z0, b.z1); const d = Math.hypot(h.pos.x - cx, h.pos.z - cz); if (d < bd && b.h > 20) { bd = d; best = b; } }
  // coloca al jugador en la calle frente a la cara sur del edificio, mirando hacia él
  h.pos.set((best.x0 + best.x1) / 2, City.groundAt((best.x0 + best.x1) / 2, best.z0 - 3), best.z0 - 3); h.state = 'ground'; h.vel.set(0, 0, 0);
  Game3.camYaw = 0; Game3.camPitch = -0.2;
  K('KeyW', true); sim(45);
  const r1 = { st: h.state, y: +h.pos.y.toFixed(1) };
  sim(Math.ceil(best.h / 5.5 * 30) + 30);
  const r2 = { st: h.state, y: +h.pos.y.toFixed(1), roof: best.h };
  K('KeyW', false); sim(10);
  return { r1, r2 };
});
console.log('wall', JSON.stringify(wall));
await shot('04_roof');
// saltar el diálogo si aparece, ir a la señal de la misión
await pg.evaluate(() => { const h = Game3.hero; const m = Game3.marker; h.pos.set(m.x - 12, 0.3, m.z - 12); h.state = 'air'; h.vel.set(0, 0, 0); sim(20); });
await pg.evaluate(() => sim(300, (i) => { K('Space', i % 6 === 0); }));
console.log('arena', JSON.stringify(await info()));
await shot('05_fight');
// bot de combate: golpea al enemigo más cercano y esquiva con el sentido arácnido
const fight = async (frames) => pg.evaluate((frames) => sim(frames, (i) => {
  const h = Game3.hero; if (Game3.dialog) { K('Space', i % 6 === 0); return; }
  K('Space', false); h.hp = Math.max(h.hp, 40);
  const e = Game3.target(h, 60, null);
  if (e) { const d = e.pos.clone().sub(h.pos); Game3.camYaw = Math.atan2(d.x, d.z); K('KeyW', d.length() > 2.5); }
  K('KeyJ', i % 7 === 0); K('KeyC', !!Game3.threatNear(h) && i % 5 === 0); K('KeyF', i % 40 === 0);
}), frames);
for (let r = 0; r < 12; r++) {
  await fight(300);
  const s = await info();
  console.log('fight', r, JSON.stringify(s), await pg.evaluate(() => Game3.boss ? Math.round(Game3.boss.hp) + ' ' + Game3.boss.state : '-'));
  if (s.stage === 'rift' || s.stage === 'done') break;
}
await shot('06_boss');
const fin = await pg.evaluate(() => { if (Game3.stage === 'rift') { const r = Game3.rift.position; Game3.hero.pos.set(r.x, Game3.hero.pos.y, r.z); sim(30); } return { stage: Game3.stage, mode: Game3.mode, ch1: SAVE3.ch1 }; });
console.log('end', JSON.stringify(fin));
await shot('07_end');
console.log(errs.length ? 'ERRORES ' + JSON.stringify(errs.slice(0, 5)) : 'OK 3D sin errores');
await b.close();
