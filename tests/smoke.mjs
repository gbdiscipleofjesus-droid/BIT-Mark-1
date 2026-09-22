// Prueba automática: juega todas las escenas con un "bot" y busca errores.
// Uso: node tests/smoke.mjs [ruta-html]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const file = resolve(process.argv[2] || 'index.html');
const shots = resolve('tests/shots');
mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1152, height: 648 } });
const problems = [];
page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
await page.goto('file://' + file);
await page.waitForTimeout(800);

// Simulador determinista: avanza N fotogramas con teclas controladas
await page.evaluate(() => {
  window.__sim = (frames, script) => {
    const fn = script ? new Function('i', 'G', script) : null;
    for (let i = 0; i < frames; i++) {
      if (fn) fn(i, Game);
      Input.poll();
      Game.step(1 / 60);
      if (i % 3 === 0) Game.render();
    }
    Game.render();
    return Game.errors.length;
  };
  window.__press = (code) => { Input.keyLatch[code] = true; };
});
const sim = (frames, script = '') => page.evaluate(([f, s]) => window.__sim(f, s), [frames, script]);
const shot = (name) => page.screenshot({ path: `${shots}/${name}.png` });
const state = () => page.evaluate(() => ({
  scene: Game.scene.constructor.name,
  mode: Game.scene.world ? Game.scene.world.mode : null,
  errors: Game.errors.slice(0, 3),
}));
const log = async (label) => console.log(label, JSON.stringify(await state()));

await shot('01_title');
await page.evaluate(() => window.__press('Enter'));
await sim(40);
await shot('02_menu');
await log('menu');
// Nueva partida
await page.evaluate(() => window.__press('Enter'));
await sim(40);
await shot('03_story');
await log('story');
// saltar historia
await page.evaluate(() => window.__press('Escape'));
await sim(40);
await log('mission0');
await shot('04_mission0');

// Bot jugando la misión 1
const bot = `
  const k = Input.keys;
  k.ArrowRight = (i % 400) < 340;
  k.ArrowLeft = (i % 400) >= 360;
  if (i % 23 === 0) Input.keyLatch.Space = true;
  if (i % 9 === 0) Input.keyLatch.KeyX = true;
  k.KeyC = (i % 120) > 30 && (i % 120) < 90;
  if (i % 71 === 0) Input.keyLatch.KeyV = true;
  if (i % 97 === 0) Input.keyLatch.ShiftLeft = true;
  k.ArrowUp = (i % 300) > 250;
  if (i % 400 === 5) Input.keyLatch.KeyB = true;
  const w = G.scene.world;
  if (w && w.dialog && i % 5 === 0) Input.keyLatch.Enter = true;
  if (w && w.player && w.player.hp < 30) w.player.hp = w.player.maxHp;
`;
for (let r = 0; r < 6; r++) {
  await sim(600, bot);
  const info = await page.evaluate(() => { const w = Game.scene.world; return w ? { x: Math.round(w.player.x), st: w.player.state, en: w.enemies.length, arena: !!w.arena, boss: !!w.boss } : null; });
  console.log('bot m0', r, JSON.stringify(info));
}
await shot('05_mission0_bot');
await page.evaluate(() => { Object.keys(Input.keys).forEach((k) => { Input.keys[k] = false; }); });

// Muerte y reintento
await page.evaluate(() => { const w = Game.scene.world; w.player.inv = 0; w.player.state = 'normal'; w.damagePlayer(9999, 0); });
await sim(150);
await shot('06_gameover');
await log('gameover');
await page.evaluate(() => window.__press('Enter'));
await sim(30);
await log('after retry');

// Recorre cada misión y derrota al jefe
for (let m = 0; m < 5; m++) {
  await page.evaluate((m) => { Game.fade = null; Game.startMission(m); }, m);
  await sim(40);
  await shot(`10_m${m}_start`);
  // correr un poco con el bot
  await sim(600, bot);
  // teletransportar a la arena del jefe
  await page.evaluate(() => {
    const w = Game.scene.world;
    for (const a of w.level.arenas) if (!a.boss) { a.done = true; }
    w.arena = null;
    w.enemies = w.enemies.filter((e) => e.arena && e.arena.boss);
    const a = w.level.arenas.find((x) => x.boss);
    w.player.x = a.x1 + 40; w.player.y = w.level.surfaceY(a.x1 + 45, 0) - 22; w.player.vx = 0; w.player.vy = 0; w.player.state = 'normal';
  });
  await sim(20);
  await shot(`11_m${m}_bossintro`);
  // pasar diálogo
  await sim(200, `if (i % 8 === 0) Input.keyLatch.Enter = true;`);
  // pelea: el jugador es invulnerable, el bot ataca
  const fight = bot + `
    const w2 = G.scene.world; if (w2 && w2.player) { w2.player.inv = 1; }
  `;
  await sim(900, fight);
  await shot(`12_m${m}_fight`);
  const bossInfo = await page.evaluate(() => { const b = Game.scene.world && Game.scene.world.boss; return b ? { hp: Math.round(b.hp), max: b.maxHp, st: b.state, phase: b.phase } : null; });
  console.log('boss', m, JSON.stringify(bossInfo));
  // forzar derrota
  await page.evaluate(() => {
    const w = Game.scene.world; const b = w.boss;
    if (b) { b.inv = 0; if (b.state === 'wait') b.state = 'move'; b.stun = 0; b.takeHit(b.hp / b.armorMul + 5, 100, -100, true, w); }
  });
  await sim(200, `const w2 = G.scene.world; if (w2 && w2.player) w2.player.inv = 1;`);
  await sim(400, `if (i % 8 === 0) Input.keyLatch.Enter = true;`);
  await log(`after m${m}`);
  await shot(`13_m${m}_after`);
  await sim(200, `if (i % 30 === 0) Input.keyLatch.Enter = true;`);
  await log(`after m${m} continue`);
}
await sim(1200, `if (i % 30 === 0) Input.keyLatch.Enter = true;`);
await log('post credits');
await shot('20_city');

// Ciudad: bot + crímenes
await page.evaluate(() => { Game.fade = null; Game.save.stage = 2; Game.goCity({ x: 1000 }); });
await sim(60, `if (i % 8 === 0) Input.keyLatch.Enter = true;`);
for (const type of ['robo', 'caida', 'persecucion', 'drones']) {
  await page.evaluate((type) => {
    const w = Game.scene.world;
    if (w.crime) w.endCrime(false, 'x');
    const orig = Math.random;
    let tries = 0;
    do { w.crime = null; w.spawnCrime(); tries++; } while (w.crime && w.crime.type !== type && tries < 60);
    if (w.crime) { w.player.x = w.crime.x - 60; w.player.y = w.level.groundY - 22; }
  }, type);
  await sim(900, bot);
  const ci = await page.evaluate(() => { const w = Game.scene.world; return { crime: w.crime ? w.crime.type : null, tech: Game.save.tech }; });
  console.log('crime', type, JSON.stringify(ci));
}
await shot('21_city_bot');
// recorrer toda la ciudad balanceándose
await sim(2400, bot.replace('k.ArrowLeft = (i % 400) >= 360;', 'k.ArrowLeft = false;'));
const cx = await page.evaluate(() => Math.round(Game.scene.world.player.x));
console.log('city x after run', cx);
await shot('22_city_far');

// Menú de pausa completo
await page.evaluate(() => { Game.save.tech = 200; });
await page.evaluate(() => window.__press('Escape'));
await sim(10);
await shot('30_pause');
for (let item = 1; item <= 4; item++) {
  await page.evaluate((item) => { const p = Game.scene.world.pause; const root = p.stack.stack[0]; root.menu.sel = item; }, item);
  await page.evaluate(() => window.__press('Enter'));
  await sim(10);
  await shot(`31_pause_${item}`);
  if (item === 1) { await page.evaluate(() => window.__press('Enter')); await sim(10); }
  if (item === 2) { await page.evaluate(() => { const top = Game.scene.world.pause.stack.top; top.menu.sel = 1; }); await page.evaluate(() => window.__press('Enter')); await sim(10); }
  if (item === 3) {
    await page.evaluate(() => window.__press('Enter')); await sim(5);
    await page.keyboard.press('KeyN'); await sim(5);
    const kb = await page.evaluate(() => Input.keyBinds.LEFT.join(','));
    console.log('rebind LEFT ->', kb);
    await page.evaluate(() => Input.resetBinds());
  }
  if (item === 4) { await page.evaluate(() => { Input.keyLatch.ArrowRight = true; }); await sim(5); }
  await page.evaluate(() => window.__press('Escape'));
  await sim(10);
}
await page.evaluate(() => window.__press('Escape'));
await sim(10);
await log('after pause');

// Mando simulado (mapeo estándar)
await page.evaluate(() => {
  const pad = { id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)', mapping: 'standard', connected: true, index: 0,
    axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  window.__pad = pad;
  navigator.getGamepads = () => [pad];
});
await sim(5);
const y0 = await page.evaluate(() => Game.scene.world.player.y);
await page.evaluate(() => { window.__pad.buttons[0].pressed = true; window.__pad.axes[0] = 1; });
await sim(12);
const pinfo = await page.evaluate(() => ({ y: Game.scene.world.player.y, vx: Game.scene.world.player.vx, dev: Input.lastDevice, type: Input.padType, label: Input.label('JUMP') }));
console.log('gamepad', y0, JSON.stringify(pinfo));
await page.evaluate(() => { window.__pad.buttons[0].pressed = false; window.__pad.axes[0] = 0; });
// mando genérico (no estándar) con cruceta en eje 9
await page.evaluate(() => {
  const pad = { id: 'Generic USB Joystick', mapping: '', connected: true, index: 0,
    axes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 3.28], buttons: Array.from({ length: 12 }, () => ({ pressed: false, value: 0 })) };
  window.__pad = pad;
  navigator.getGamepads = () => [pad];
});
await sim(3);
await page.evaluate(() => { window.__pad.axes[9] = 0.714; });
await sim(20);
const g2 = await page.evaluate(() => ({ vx: Game.scene.world.player.vx, type: Input.padType, left: Input.isDown('LEFT') }));
console.log('generic pad', JSON.stringify(g2));
await page.evaluate(() => { navigator.getGamepads = () => []; });

// Pantalla táctil
await page.evaluate(() => { Game.settings.touch = 'on'; });
await sim(5);
await shot('40_touch');
await page.evaluate(() => { Game.settings.touch = 'auto'; });

// dejar correr en tiempo real para validar el bucle requestAnimationFrame
await page.waitForTimeout(1500);
const fin = await page.evaluate(() => ({ errors: Game.errors, missing: Array.from(Font.missing), frame: Game.frame }));
console.log('frames', fin.frame, 'missing glyphs', JSON.stringify(fin.missing));
if (fin.errors.length) problems.push(...fin.errors);
console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'OK: sin errores');
await browser.close();
process.exit(problems.length ? 1 : 0);
