// Cada traje tiene su propio poder: todos se activan sin errores, hacen algo a los enemigos
// y se pueden equipar con otro traje puesto.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { resolve } from 'node:path';

const file = resolve(process.argv[2] || 'index.html');
const shots = process.argv[3] || '';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 768, height: 432 } });
const problems = [];
page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
await page.goto('file://' + file + '?lang=es');
await page.waitForTimeout(400);

const ids = await page.evaluate(() => SUITS.map((s) => s.id));
const uniq = await page.evaluate(() => new Set(SUITS.map((s) => s.power)).size === SUITS.length && SUITS.every((s) => POWER_DEFS[s.power]));
if (!uniq) problems.push('no todos los trajes tienen un poder propio');
const out = [];
for (const id of ids) {
  const r = await page.evaluate((id) => {
    const step = () => { Input.poll(); Game.step(1 / 60); };
    Game.save.started = true; Game.save.stage = 3; Game.save.suits = SUITS.map((s) => s.id);
    Game.save.suit = 'bnd'; Game.save.power = id; Game.fade = null;
    Game.scene = Game.missionScene(1);
    for (let i = 0; i < 5; i++) step();
    const w = Game.scene.world; w.dialog = null; w.setCutscene && w.setCutscene(false);
    const p = w.player; p.hp = p.maxHp;
    w.enemies = [];
    for (let i = 0; i < 4; i++) { const e = w.spawnEnemy('thug', p.x + (i % 2 ? 1 : -1) * (40 + i * 20), null); e.y = p.y; e.aggro = true; }
    for (let i = 0; i < 30; i++) step();
    const hp0 = w.enemies.reduce((a, e) => a + e.hp, 0);
    const cur = SuitPowers.current(p);
    p.powerCd = 0; SuitPowers.use(p, w);
    let anim = !!p.powAnim, fxMax = 0, stunned = 0;
    for (let i = 0; i < 300; i++) {
      step(); fxMax = Math.max(fxMax, w.fx.length);
      stunned = Math.max(stunned, w.enemies.filter((e) => e.webbed > 0 || e.frozenT > 0 || e.dead || e.suspendT > 0).length);
      if (i === 25) window.__mid = true;
    }
    const hp1 = w.enemies.reduce((a, e) => a + (e.dead ? 0 : e.hp), 0);
    const buff = ['furyT', 'cloakT', 'armsT', 'shieldT', 'armorT', 'reactT', 'unstopT', 'senseT'].some((k) => p[k] > 0) || w.slowEnemiesT > 0;
    return { id, cur, anim, fxMax, dmg: hp0 - hp1 + w.enemies.filter((e) => e.dead).length, stunned, buff, hp: p.hp, maxHp: p.maxHp, errors: Game.errors.slice(0, 2) };
  }, id);
  out.push(r);
  const effect = r.dmg > 0 || r.stunned > 0 || r.buff || r.fxMax > 0;
  if (r.cur !== id || !effect || !r.anim || r.errors.length) problems.push('poder ' + id + ' ' + JSON.stringify(r));
}
console.log(out.map((r) => r.id + ':' + (r.dmg > 0 ? 'D' : '') + (r.stunned ? 'S' : '') + (r.buff ? 'B' : '') + ' fx' + r.fxMax).join('  '));
// capturas a mitad de algunos poderes
if (shots) {
  for (const id of ['luchador', 'electro2', 'negro', 'sociedad', 'cyborg', 'multiverso', 'vintage', 'uk', 'punk', 'noir']) {
    await page.evaluate((id) => {
      const step = () => { Input.poll(); Game.step(1 / 60); };
      Game.save.power = id; Game.fade = null; Game.scene = Game.missionScene(1); for (let i = 0; i < 5; i++) step();
      const w = Game.scene.world; w.dialog = null; w.setCutscene && w.setCutscene(false); w.enemies = []; w.card = null;
      const p = w.player; p.x += 150; for (let i = 0; i < 40; i++) step();
      for (let i = 0; i < 4; i++) { const e = w.spawnEnemy('thug', p.x + (i % 2 ? 1 : -1) * (40 + i * 20), null); e.y = p.y; }
      for (let i = 0; i < 30; i++) step();
      p.powerCd = 0; SuitPowers.use(p, w);
      for (let i = 0; i < ({ luchador: 50, electro2: 42, negro: 30, cyborg: 50, noir: 30 }[id] || 20); i++) step();
      Game.render();
    }, id);
    await page.screenshot({ path: shots + '/pw_' + id + '.png' });
  }
}
// equipar desde el menú con otro traje puesto
const menu = await page.evaluate(() => {
  const step = () => { Input.poll(); Game.step(1 / 60); };
  Game.save.suit = 'nwh'; Game.save.power = null; Game.save.suits = ['bnd', 'nwh'];
  Game.fade = null; Game.scene = Game.cityScene('616', 800); for (let i = 0; i < 5; i++) step();
  const w = Game.scene.world; w.dialog = null; w.openPause(); w.pause.lock = 0;
  w.pause.tab = w.pause.tabs.findIndex((t) => t.name === 'PODERES');
  const tab = w.pause.tabs[w.pause.tab];
  const auto = SuitPowers.current(w.player);
  tab.sel = tab.rows.indexOf('bnd'); Input.keyLatch.Enter = true; step(); step();
  const eq = Game.save.power, now = SuitPowers.current(w.player);
  tab.sel = tab.rows.indexOf('luchador'); Input.keyLatch.Enter = true; step(); step();
  Game.render();
  return { tab: w.pause.tab, auto, eq, now, locked: Game.save.power, errors: Game.errors.slice(0, 2) };
});
console.log(JSON.stringify(menu));
if (!(menu.tab >= 0 && menu.auto === 'nwh' && menu.eq === 'bnd' && menu.now === 'bnd' && menu.locked === 'bnd' && !menu.errors.length)) problems.push('menú de poderes ' + JSON.stringify(menu));
await browser.close();
if (problems.length) { console.log('FALLOS:\n' + problems.join('\n')); process.exit(1); }
console.log('OK: ' + ids.length + ' trajes con poder propio y animación');
