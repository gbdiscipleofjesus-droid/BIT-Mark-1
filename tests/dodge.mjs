// Las 4 esquivas: tipo correcto, dirección, invulnerabilidad y daño leve
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { resolve } from 'node:path';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1152, height: 648 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto('file://' + resolve(process.argv[2] || 'index.html'));
await page.waitForTimeout(300);
const out = {};
for (const [name, air, back] of [['roll', false, false], ['backflip', false, true], ['frontflip', true, false], ['corkscrew', true, true]]) {
  out[name] = await page.evaluate(([air, back, name]) => {
    const step = (n, f) => { for (let i = 0; i < n; i++) { if (f) f(i); Input.poll(); Game.step(1 / 60); } };
    Game.fade = null; Game.save.started = true; Game.scene = Game.missionScene(1);
    const w = Game.scene.world; w.card = null; w.enemies = []; w.level.tips.forEach((t) => { t.shown = true; });
    w.level.arenas.forEach((a) => { a.done = true; }); const p = w.player; p.x = 1460; p.y = w.level.groundY - 22; p.facing = 1; step(10);
    const e = w.spawnEnemy('thug', back ? p.x - 30 : p.x + 22, w.level.groundY - 22); e.z = p.z; e.state = 'idle'; e.spec = Object.assign({}, e.spec, { block: 0 });
    const hp0 = e.hp, x0 = p.x;
    if (air) { Input.keyLatch.Space = true; step(10); }
    Input.keys[back ? 'ArrowLeft' : 'ArrowRight'] = true;
    Input.keyLatch.ShiftLeft = true; step(2);
    const kind = p.dodgeKind, inv = p.inv > 0, facing = p.facing;
    Input.keys.ArrowLeft = false; Input.keys.ArrowRight = false;
    step(12); Game.render();
    return { kind, ok: kind === name, invulnerable: inv, facingKept: back ? facing === 1 : true, movedRightWay: back ? p.x < x0 : p.x > x0, damaged: e.hp < hp0, dmg: +(hp0 - e.hp).toFixed(2) };
  }, [air, back, name]);
  await page.screenshot({ path: 'tests/shots/70_dodge_' + name + '.png' });
}
console.log(JSON.stringify(out, null, 1), errs);
await browser.close();
