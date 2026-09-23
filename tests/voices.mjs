// Diálogos hablados (síntesis de voz simulada) y recarga del refuerzo multiversal
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { resolve } from 'node:path';
const browser = await chromium.launch();
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.addInitScript(() => {
  window.__spoken = []; window.__cancels = 0;
  const voices = [{ name: 'Mónica', lang: 'es-ES' }, { name: 'Jorge', lang: 'es-ES' }, { name: 'Samantha', lang: 'en-US' }];
  const synth = {
    getVoices: () => voices, onvoiceschanged: null,
    speak: (u) => window.__spoken.push({ text: u.text, pitch: u.pitch, rate: u.rate, voice: u.voice && u.voice.name, vol: u.volume }),
    cancel: () => { window.__cancels++; },
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: function (t) { this.text = t; }, configurable: true, writable: true });
});
await page.goto('file://' + resolve(process.argv[2] || 'index.html'));
await page.waitForTimeout(300);
const r = await page.evaluate(() => {
  const step = (n, f) => { for (let i = 0; i < n; i++) { if (f) f(i); Input.poll(); Game.step(1 / 60); } };
  const out = {};
  Game.fade = null; Game.save.started = true;
  Game.scene = new StoryScene(STORY.intro, () => new MenuScene());
  step(5);
  out.firstLine = window.__spoken[0];
  // avanzar líneas
  for (let k = 0; k < 4; k++) { Input.keyLatch.Enter = true; step(12); Input.keyLatch.Enter = true; step(12); }
  out.linesSpoken = window.__spoken.length;
  out.peterLine = window.__spoken.find((x) => x.text.startsWith('Traje nuevo'));
  const c0 = window.__cancels;
  Input.keyLatch.Escape = true; step(3);
  out.stoppedOnSkip = window.__cancels > c0;
  // Venom grave, Gwen con voz femenina
  window.__spoken = [];
  Game.fade = null;
  Game.scene = new StoryScene([['venom', 'Dos arañas...'], ['gwen', 'Cuidado, Peter.']], () => new MenuScene());
  step(12); Input.keyLatch.Enter = true; step(12); Input.keyLatch.Enter = true; step(12);
  out.venom = window.__spoken[0]; out.gwen = window.__spoken[1];
  // acotación eliminada
  out.cleaned = Voice.clean('(Por los altavoces) ¡Vaya, vaya!');
  // voces apagadas
  window.__spoken = []; Game.settings.voices = 0;
  Game.fade = null;
  Game.scene = new StoryScene([['peter', 'Hola']], () => new MenuScene()); step(3);
  out.silentWhenOff = window.__spoken.length === 0;
  Game.settings.voices = 8;
  // refuerzo: 90 s de recarga
  Game.save.stage = 4; Game.allyCd = 0;
  Game.fade = null;
  Game.scene = Game.missionScene(0); const w = Game.scene.world; w.card = null; step(5);
  Input.keyLatch.KeyE = true; step(2);
  out.allyCd = Math.round(w.allyCd);
  step(120); Input.keyLatch.KeyE = true; step(2);
  out.secondCallBlocked = !w.ally;
  out.errors = Game.errors;
  return out;
});
console.log(JSON.stringify(r, null, 1), errs);
await browser.close();
