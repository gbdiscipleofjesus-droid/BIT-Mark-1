// Mando Nintendo Switch Pro: detección, botones y avisos
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { resolve } from 'node:path';
const browser = await chromium.launch();
const out = {};
for (const [name, id, mapping, block] of [
  ['chrome', 'Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)', 'standard', false],
  ['safari', 'Pro Controller', 'standard', false],
  ['bloqueado', '', '', true],
]) {
  const page = await browser.newPage({ viewport: { width: 1152, height: 648 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript(([id, mapping, block]) => {
    if (block) { navigator.getGamepads = () => { throw new DOMException('blocked', 'SecurityError'); }; return; }
    const pad = { id, mapping, connected: true, index: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 18 }, () => ({ pressed: false, value: 0 })) };
    window.__pad = pad;
    navigator.getGamepads = () => [pad];
  }, [id, mapping, block]);
  await page.goto('file://' + resolve(process.argv[2] || 'index.html'));
  await page.waitForTimeout(300);
  const r = await page.evaluate((block) => {
    const step = (n, f) => { for (let i = 0; i < n; i++) { if (f) f(i); Input.poll(); Game.step(1 / 60); } };
    step(40);
    const res = { blocked: Input.padBlocked, toast: Input.toast && Input.toast.title, type: Input.padType };
    if (block) return res;
    // botón inferior (B en Nintendo) pasa la portada
    window.__pad.buttons[0].pressed = true; step(2); window.__pad.buttons[0].pressed = false; step(40);
    res.leftTitle = Game.scene.constructor.name;
    Game.fade = null; Game.save.started = true; Game.scene = Game.missionScene(0);
    const w = Game.scene.world; w.card = null; step(10);
    const p = w.player, y0 = p.y, x0 = p.x;
    window.__pad.buttons[0].pressed = true; window.__pad.axes[0] = 1; step(15);
    res.jumped = p.y < y0 - 10; res.moved = p.x > x0 + 10;
    window.__pad.buttons[0].pressed = false; window.__pad.axes[0] = 0; step(60);
    window.__pad.buttons[2].pressed = true; step(2); res.attacked = !!p.attack; window.__pad.buttons[2].pressed = false; step(30);
    window.__pad.buttons[12].pressed = true; step(20); res.dpadUpDepth = Math.round(p.z); window.__pad.buttons[12].pressed = false;
    // stick descalibrado (típico del Nintendo Pro por Bluetooth en Mac): centro 0.04, recorrido máx. ~0.3
    window.__pad.axes[0] = 0.04; window.__pad.axes[1] = -0.03; step(10);
    const x1 = p.x;
    window.__pad.axes[0] = 0.3; step(30);
    res.weakStickMovesRight = p.x > x1 + 15;
    window.__pad.axes[0] = 0.04; step(20);
    const x2 = p.x;
    window.__pad.axes[0] = -0.24; step(30);
    res.weakStickMovesLeft = p.x < x2 - 15;
    window.__pad.axes[0] = 0.04; step(5);
    // sin tocar el stick, no se mueve solo (sin deriva)
    const x3 = p.x; step(40); res.noDrift = Math.abs(p.x - x3) < 2;
    // stick derecho también sirve
    window.__pad.axes[2] = 0.9; step(30); res.rightStickMoves = p.x > x3 + 15; window.__pad.axes[2] = 0; step(5);
    // R3: refuerzo multiversal
    Game.save.stage = 4;
    const e = w.spawnEnemy('thug', p.x + 60, null); e.z = p.z; const hp0 = e.hp;
    step(5);
    window.__pad.buttons[11].pressed = true; step(2); window.__pad.buttons[11].pressed = false;
    res.allyCalled = !!w.ally;
    step(100);
    res.allyHitEnemy = e.hp < hp0 || e.dead;
    res.allyCooldown = Math.round(w.allyCd);
    res.labels = ['JUMP', 'ATTACK', 'SHOOT', 'DODGE', 'WEB', 'SPECIAL', 'PAUSE'].map((a) => a + '=' + Input.label(a)).join(' ');
    res.errors = Game.errors.length;
    return res;
  }, block);
  await page.evaluate(() => { Game.fade = null; Game.scene = new TitleScene(); for (let i = 0; i < 30; i++) { Input.poll(); Game.step(1 / 60); } Game.render(); });
  await page.screenshot({ path: 'tests/shots/60_pad_' + name + '.png' });
  out[name] = Object.assign(r, { pageErrors: errs });
  await page.close();
}
console.log(JSON.stringify(out, null, 1));
await browser.close();
