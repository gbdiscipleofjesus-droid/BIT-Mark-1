import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { resolve } from 'node:path';
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('file://' + resolve('index.html'));
await page.waitForTimeout(400);
const r = await page.evaluate(() => {
  const step = (n) => { for (let i = 0; i < n; i++) { Input.poll(); Game.step(1 / 60); } };
  const mk = (id, mapping) => ({ id, mapping, connected: true, axes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 3.28], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) });
  const out = {};
  for (const [name, id, mapping] of [['xbox', 'Xbox 360 Controller (XInput STANDARD GAMEPAD)', 'standard'], ['ps', 'DualSense Wireless Controller (Vendor: 054c Product: 0ce6)', 'standard'], ['switch', 'Pro Controller (Vendor: 057e Product: 2009)', 'standard'], ['generic', 'USB Gamepad (Vendor: 0079 Product: 0011)', '']]) {
    const pad = mk(id, mapping);
    navigator.getGamepads = () => [pad];
    Game.fade = null; Game.scene = Game.missionScene(0); Game.scene.world.card = null;
    const w = Game.scene.world;
    step(10);
    const y0 = w.player.y, x0 = w.player.x;
    pad.buttons[0].pressed = true; pad.axes[0] = 1;
    step(15);
    const jumped = w.player.y < y0 - 10, moved = w.player.x > x0 + 10;
    pad.buttons[0].pressed = false; pad.axes[0] = 0;
    step(60);
    pad.buttons[2].pressed = true; step(2); const attacked = !!w.player.attack; pad.buttons[2].pressed = false;
    step(20);
    pad.buttons[9].pressed = true; step(2); const paused = !!w.pause; pad.buttons[9].pressed = false; step(2);
    pad.buttons[1].pressed = true; step(2); pad.buttons[1].pressed = false; step(2);
    out[name] = { type: Input.padType, jumped, moved, attacked, paused, unpaused: !w.pause, jumpLabel: Input.label('JUMP') };
  }
  return { out, errors: Game.errors };
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
