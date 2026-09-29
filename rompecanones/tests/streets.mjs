// Se puede recorrer cada ciudad por la calle sin quedarse bloqueado, y trepar fachadas.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { resolve } from 'node:path';
const browser = await chromium.launch();
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('file://' + resolve(process.argv[2] || 'index.html'));
await page.waitForTimeout(300);
const r = await page.evaluate(() => {
  const step = (n, f) => { for (let i = 0; i < n; i++) { if (f) f(i); Input.poll(); Game.step(1 / 60); } };
  const out = [];
  Game.save.started = true; Game.save.stage = 5; Game.save.visited = ['616', 'tobey', 'andrew', 'miles', 'n2099', 'ruina'];
  for (const u of ['616', 'tobey', 'andrew', 'miles', 'n2099', 'ruina']) {
    Game.fade = null; Game.scene = Game.cityScene(u, 300);
    const w = Game.scene.world; w.crimeT = 1e9; w.markerX = null;
    const p = w.player; p.x = 60; p.y = w.level.surfaceY(65) - 22; p.state = 'normal';
    let lastX = p.x, stuck = 0, maxStuck = 0;
    // en las ruinas hay huecos: se saltan
    step(60 * 80, (i) => {
      Input.keys.ArrowRight = true; p.inv = 99; if (p.hp < 50) p.hp = 100;
      if (u === 'ruina') {
        const edge = p.onGround && !w.level.groundAhead(p.cx + 18, p.y + p.h);
        if (edge) Input.keyLatch.Space = true;
        Input.keys.Space = !p.onGround && p.vy < 0;
        if (!p.onGround && p.vy > 40 && p.airJumps > 0 && w.level.surfaceY(p.cx + 10, p.y + p.h) > p.y + p.h + 60) Input.keyLatch.Space = true;
      }
      if (Math.abs(p.x - lastX) < 0.1 && p.x < w.level.width - 30) { stuck++; maxStuck = Math.max(maxStuck, stuck); } else stuck = 0;
      lastX = p.x;
    });
    Input.keys.ArrowRight = false;
    out.push({ u, x: Math.round(p.x), reachedEnd: p.x > w.level.width - 60, maxStuckFrames: maxStuck });
  }
  // trepar una fachada hasta el tejado
  Game.fade = null; Game.scene = Game.cityScene('616', 300);
  const w = Game.scene.world; w.crimeT = 1e9;
  const b = w.level.solids.find((s) => s.kind === 'building' && s.vis > 120);
  const p = w.player; p.x = b.x + b.w / 2 - 5; p.y = w.level.groundY - 22; p.vy = 0; p.state = 'normal';
  step(5); Input.keyLatch.Space = true; step(8); Input.keys.ArrowUp = true;
  let sawFacade = false;
  step(60 * 6, () => { if (p.state === 'facade') sawFacade = true; });
  Input.keys.ArrowUp = false; step(20);
  out.push({ facadeClimb: sawFacade, onRoof: Math.abs(p.y + p.h - b.y) < 1 });
  return { out, errors: Game.errors };
});
console.log(JSON.stringify(r), errs);
const n = r.out.length - 1;
const ok = r.out.slice(0, n).every((x) => x.reachedEnd && x.maxStuckFrames < 120) && r.out[n].facadeClimb && r.out[n].onRoof && !r.errors.length && !errs.length;
console.log(ok ? 'OK: calles transitables' : 'FALLO');
await browser.close();
process.exit(ok ? 0 : 1);
