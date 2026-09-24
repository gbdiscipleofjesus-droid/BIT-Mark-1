// Multijugador local: 4 mandos simulados, lobby, movimiento independiente,
// compañeros caídos que vuelven, artilugios, poderes, habilidades y menú.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { resolve } from 'node:path';
const file = resolve(process.argv[2] || 'index.html');
const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: 1152, height: 648 } });
const errs = [];
pg.on('pageerror', (e) => errs.push(e.message));
await pg.goto('file://' + file); await pg.waitForTimeout(400);
const r = await pg.evaluate(() => {
  const out = {};
  const mk = (i, id) => ({ id, mapping: 'standard', connected: true, index: i, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) });
  const pads = [mk(0, 'Xbox Controller (045e)'), mk(1, 'DualSense Wireless Controller (054c)'), mk(2, 'Pro Controller (057e)'), mk(3, 'Generic USB Gamepad')];
  navigator.getGamepads = () => pads;
  const step = (n = 1, f) => { for (let i = 0; i < n; i++) { if (f) f(i); Input.poll(); Game.step(1 / 60); } };
  const btn = (p, b, v) => { pads[p].buttons[b].pressed = v; pads[p].buttons[b].value = v ? 1 : 0; };
  Game.save.started = true; Game.save.stage = 3; Game.fade = null;
  Game.scene = Game.cityScene('616', 900);
  step(5);
  const w = Game.scene.world; w.dialog = null; w.setCutscene(false);
  // J1 abre el menú con su mando (pad 0) y va a la pestaña MULTIJUGADOR
  btn(0, 9, true); step(1); btn(0, 9, false); step(12);
  out.menuOpen = !!w.pause;
  w.pause.tab = 5; w.pause.lock = 0;
  // los mandos 1, 2 y 3 se unen con SALTAR (A / cruz / B)
  for (const p of [1, 2, 3]) { btn(p, 0, true); step(1); btn(p, 0, false); step(2); }
  // el J2 cambia de traje con la cruceta
  btn(1, 15, true); step(1); btn(1, 15, false); step(2);
  out.coop = Game.coop && Game.coop.map((c) => c.devs.join('+') + ':' + c.suit);
  out.players = w.players.length;
  btn(0, 9, true); step(1); btn(0, 9, false); step(5);
  out.menuClosed = !w.pause;
  // cada jugador se mueve con su mando: J2 a la derecha, J3 a la izquierda
  const x0 = w.players.map((q) => q.x);
  step(40, () => { pads[1].axes[0] = 1; pads[2].axes[0] = -1; });
  pads[1].axes[0] = 0; pads[2].axes[0] = 0;
  out.moved = w.players.map((q, i) => Math.round(q.x - x0[i]));
  // el J4 salta
  const y4 = w.players[3].y; btn(3, 0, true); step(6); btn(3, 0, false);
  out.p4jumped = w.players[3].y < y4 - 5;
  // enemigos: atacan al jugador más cercano; J2 cae y vuelve
  const p2 = w.players[1];
  w._focus = p2; p2.inv = 0; w.damagePlayer(9999, p2.cx - 10, p2.z); w._focus = null;
  out.p2dead = p2.state === 'dead'; out.gameState = w.state;
  step(60 * 6);
  out.p2back = p2.state !== 'dead' && p2.hp > 0;
  // artilugios y poderes (J1 con teclado)
  for (let i = 0; i < 4; i++) w.spawnEnemy('thug', w.players[0].x + 40 + i * 12, null);
  Game.save.level = 20;
  Input.keyLatch.KeyG = true; step(30);
  out.fx = w.fx.length >= 0;
  Input.keyLatch.KeyT = true; step(2); out.gadget2 = Game.save.gadget;
  for (let g = 0; g < 8; g++) { Input.keyLatch.KeyG = true; step(20); Input.keyLatch.KeyT = true; step(3); }
  Input.keyLatch.KeyH = true; step(30);
  out.powerUsed = (Game.save.records.powers || 0) > 0;
  out.gadgetHits = Game.save.records.gadgetHits || 0;
  // habilidades
  Game.save.skillPts = 3; const ok = Progress.learn(SKILLS.find((s) => s.id === 'b_triple'));
  w.players.forEach((q) => q.refreshStats());
  out.skill = ok && w.players[0].maxAirJumps === 2;
  // cámara en el centro del grupo
  step(30);
  const cx = w.alivePlayers().reduce((s, q) => s + q.cx, 0) / w.alivePlayers().length;
  out.camCentered = Math.abs(w.cam.x + W / 2 - cx) < 90 || w.cam.x <= 1;
  Game.render();
  out.errors = Game.errors.length;
  return out;
});
console.log(JSON.stringify(r, null, 1));
await pg.screenshot({ path: 'tests/shots/coop.png' });
const ok = r.players === 4 && r.moved[1] > 20 && r.moved[2] < -20 && r.p4jumped && r.p2dead && r.gameState === 'play' && r.p2back && r.powerUsed && r.skill && !errs.length && !r.errors;
console.log(ok ? 'OK: multijugador' : 'FALLO', errs);
await b.close();
process.exit(ok ? 0 : 1);
