import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { resolve } from 'node:path';
const browser = await chromium.launch();
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('file://' + resolve('index.html'));
await page.waitForTimeout(400);
const sim = (n) => page.evaluate((n) => { for (let i = 0; i < n; i++) { Input.poll(); Game.step(1 / 60); } }, n);
await page.evaluate(() => { Game.fade = null; Game.scene = new MenuScene(); Game.scene.stack.push(new ControlsScreen()); });
await sim(5);
await page.keyboard.press('Enter'); await sim(5);          // captura para IZQUIERDA
const capturing = await page.evaluate(() => Game.scene.stack.top.capturing);
await page.keyboard.press('KeyN'); await sim(5);
const k = await page.evaluate(() => Input.keyBinds.LEFT.join(','));
// mando: reasignar SALTAR (fila 4) al botón 7
await page.evaluate(() => {
  const pad = { id: 'Test pad', mapping: 'standard', connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  window.__pad = pad; navigator.getGamepads = () => [pad];
  Game.scene.stack.top.sel = 4;
});
await page.keyboard.press('Enter'); await sim(3);
await page.evaluate(() => { window.__pad.buttons[7].pressed = true; }); await sim(3);
await page.evaluate(() => { window.__pad.buttons[7].pressed = false; }); await sim(3);
const j = await page.evaluate(() => JSON.stringify(Input.padBinds.JUMP));
const saved = await page.evaluate(() => localStorage.getItem('sm_binds') !== null);
console.log({ capturing, left: k, jump: j, saved, errs });
await browser.close();
