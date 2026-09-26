// Idiomas (selección al empezar, traducción, chino) y quitar habilidades para recuperar puntos.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { resolve } from 'node:path';

const file = resolve(process.argv[2] || 'index.html');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 768, height: 432 } });
const problems = [];
page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
await page.goto('file://' + file);
await page.waitForTimeout(400);

const r = await page.evaluate(() => {
  const out = {};
  const step = (n = 1) => { for (let i = 0; i < n; i++) { Input.poll(); Game.step(1 / 60); } };
  out.first = Game.scene.constructor.name;
  // elegir ENGLISH con flechas + Enter
  const key = (code) => { window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code })); step(); window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code })); step(); };
  step(30);
  const sc = Game.scene; sc.sel = 0;
  key('ArrowDown'); key('Enter'); step(60);
  out.lang = Game.settings.lang; out.after = Game.scene.constructor.name;
  out.en = [tr('NUEVA PARTIDA'), tr('OBJETIVO: AVANZA HACIA LA DERECHA'), tr('[ESPACIO] APRENDER'), tr('+3 PUNTOS RECUPERADOS')];
  Game.setLang('zh');
  out.zh = [tr('NUEVA PARTIDA'), tr('Vitalidad')];
  out.zhW = Font.width('NUEVA PARTIDA') > 0;
  out.wrap = Font.wrap('Muévete con las flechas o WASD. En la calle, [ARRIBA] y [ABAJO] te llevan al fondo o al frente.', 120).length;
  Game.render();
  Game.setLang('es');
  out.es = tr('NUEVA PARTIDA');
  // quitar habilidades
  Game.save.started = true; Game.save.skillPts = 3; Game.save.skills = [];
  const vida = SKILLS.find((s) => s.id === 'd_vida');
  const dep = SKILLS.find((s) => s.req === 'd_vida');
  Progress.learn(vida); if (dep) Progress.learn(dep);
  out.learned = Game.save.skills.length; out.ptsAfterLearn = Game.save.skillPts;
  out.refund = Progress.unlearn(vida); out.ptsAfterUnlearn = Game.save.skillPts; out.left = Game.save.skills.length;
  Progress.learn(vida); out.reset = Progress.resetSkills(); out.ptsReset = Game.save.skillPts;
  return out;
});
console.log(JSON.stringify(r));
const ok = r.first === 'LangScene' && r.lang === 'en' && r.after === 'TitleScene' && r.en[0] === 'NEW GAME' && /OBJECTIVE/.test(r.en[1]) && /\[SPACE\]/.test(r.en[2]) && /REFUNDED/.test(r.en[3])
  && /[一-鿿]/.test(r.zh[0]) && r.zhW && r.wrap >= 2 && r.es === 'NUEVA PARTIDA'
  && r.learned >= 1 && r.refund === r.learned && r.ptsAfterUnlearn === 3 && r.left === 0 && r.reset === 1 && r.ptsReset === 3;
if (!ok) problems.push('i18n/respec incorrecto');
await browser.close();
if (problems.length) { console.log('FALLOS:\n' + problems.join('\n')); process.exit(1); }
console.log('OK: idiomas y quitar habilidades');
