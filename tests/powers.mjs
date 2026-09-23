// Poderes de los villanos: cada jefe debe usar sus ataques característicos.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { resolve } from 'node:path';

const file = resolve(process.argv[2] || 'index.html');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 768, height: 432 } });
const problems = [];
page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
await page.goto('file://' + file);
await page.waitForTimeout(500);

const list = [[1, 'sandman'], [1, 'venom'], [2, 'rino'], [2, 'electro'], [3, 'miguel'], [4, 'desconocido4']];
const report = [];
for (const [m, bossId] of list) {
  const r = await page.evaluate(([m, bossId]) => {
    const step = () => { Input.poll(); Game.step(1 / 60); };
    Game.save.started = true; Game.fade = null;
    Game.scene = Game.missionScene(m);
    for (let i = 0; i < 5; i++) step();
    const w = Game.scene.world;
    const a = w.level.arenas.find((x) => x.boss === bossId);
    for (const o of w.level.arenas) if (o !== a) o.done = true;
    for (const c of w.level.canons) c.done = true;
    w.enemies = [];
    w.player.x = a.x1 + 60; w.player.y = w.level.surfaceY(a.x1 + 65) - 22;
    const states = new Set(), kinds = new Set();
    let stuck = false, shot = null;
    for (let i = 0; i < 60 * 70; i++) {
      if (w.dialog) { if (i % 6 === 0) Input.keyLatch.Enter = true; step(); continue; }
      const p = w.player, b = w.boss;
      p.hp = p.maxHp;
      if (b && b.hp < b.maxHp * 0.2) b.hp = b.maxHp * 0.2; // mantener vivo para ver todas las fases
      if (b && i === 60 * 20) b.hp = b.maxHp * 0.45;
      if (b && i === 60 * 40) b.hp = b.maxHp * 0.22;
      step();
      if (b) states.add(b.state);
      for (const pr of w.projs) if (pr.owner === 'e') kinds.add(pr.hazard ? 'hazard:' + pr.kind : pr.kind);
      if (p.stuckT > 0) stuck = true;
      if (!shot && i > 600 && w.projs.some((pr) => pr.owner === 'e' && (pr.hazard || ['sand', 'debris', 'net', 'eorb'].includes(pr.kind)))) { shot = i; break; }
    }
    return { boss: bossId, states: [...states], kinds: [...kinds], stuck, errors: Game.errors.slice(0, 3) };
  }, [m, bossId]);
  await page.evaluate(() => Game.render());
  await page.screenshot({ path: `tests/shots/power-${bossId}.png` });
  // luego seguir para recoger todos los estados
  const r2 = await page.evaluate(() => {
    const step = () => { Input.poll(); Game.step(1 / 60); };
    const w = Game.scene.world; const states = new Set(), kinds = new Set(); let stuck = false;
    for (let i = 0; i < 60 * 60; i++) {
      const p = w.player, b = w.boss; p.hp = p.maxHp;
      if (b && b.hp < b.maxHp * 0.2) b.hp = b.maxHp * 0.2;
      if (b && i === 60 * 20) b.hp = b.maxHp * 0.22;
      step();
      if (b) states.add(b.state);
      for (const pr of w.projs) if (pr.owner === 'e') kinds.add(pr.hazard ? 'hazard:' + pr.kind : pr.kind);
      if (p.stuckT > 0) stuck = true;
    }
    return { states: [...states], kinds: [...kinds], stuck, errors: Game.errors.slice(0, 3) };
  });
  r.states = [...new Set([...r.states, ...r2.states])]; r.kinds = [...new Set([...r.kinds, ...r2.kinds])];
  r.stuck = r.stuck || r2.stuck; r.errors.push(...r2.errors);
  report.push(r);
  console.log(JSON.stringify(r));
}
if (problems.length) console.log('PROBLEMS', problems);
await browser.close();
