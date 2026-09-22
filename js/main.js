'use strict';
// ---------------------------------------------------------------------------
// Núcleo del juego: escenas, guardado, menús y bucle principal
// ---------------------------------------------------------------------------
const UPGRADES = [
  { id: 'hp', name: 'Traje reforzado', desc: '+20 de vida máxima por nivel.', cost: [8, 16, 28] },
  { id: 'dmg', name: 'Golpes potenciados', desc: '+25% de daño cuerpo a cuerpo por nivel.', cost: [8, 16, 28] },
  { id: 'web', name: 'Fluido de red mejorado', desc: 'Las redes inmovilizan más tiempo y +1 cartucho.', cost: [6, 12, 22] },
  { id: 'swing', name: 'Lanzarredes calibrados', desc: 'Balanceo más rápido y potente.', cost: [6, 12, 22] },
  { id: 'focus', name: 'Hormigueo agudizado', desc: '+30% de foco por cada golpe.', cost: [8, 16, 28] },
];
const DIFF_NAMES = ['FÁCIL', 'NORMAL', 'DIFÍCIL'];

function defaultSave() {
  return {
    v: 1, stage: 0, tech: 0, upgrades: { hp: 0, dmg: 0, web: 0, swing: 0, focus: 0 },
    suits: ['nwh'], suit: 'nwh', tokens: [], stats: { crimes: 0, kos: 0 }, seenCityTip: false,
    cityX: 400, completed: false, started: false,
  };
}
function defaultSettings() {
  return { music: 6, sfx: 8, rumble: true, difficulty: 1, shake: true, touch: 'auto' };
}

// ---------------------------------------------------------------------------
// Pila de pantallas para menús anidados
// ---------------------------------------------------------------------------
class MenuStack {
  constructor(root) { this.stack = [root]; }
  push(s) { this.stack.push(s); }
  get top() { return this.stack[this.stack.length - 1]; }
  update(dt) {
    const top = this.top;
    const r = top.update(dt, this);
    if (r === 'back') {
      if (this.stack.length > 1) this.stack.pop();
      else return 'close';
    }
    if (r === 'close') return 'close';
    return null;
  }
  draw(ctx, t) { this.top.draw(ctx, t); }
}

function drawScreenTitle(ctx, title) {
  ctx.fillStyle = 'rgba(8,6,16,0.9)'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = UI.red; ctx.fillRect(0, 0, W, 22);
  ctx.fillStyle = UI.blue; ctx.fillRect(0, 22, W, 2);
  Font.draw(ctx, title, W / 2, 7, UI.paper, { align: 'center', shadow: UI.ink });
}

class ConfirmScreen {
  constructor(text, onYes) {
    this.text = text;
    this.menu = new Menu([{ label: 'Sí', act: () => { this.res = 'yes'; } }, { label: 'No', act: () => { this.res = 'back'; } }]);
    this.menu.sel = 1;
    this.onYes = onYes;
  }
  update(dt) {
    const r = this.menu.update(dt);
    if (this.res === 'yes') { this.res = null; this.onYes(); return 'back'; }
    if (this.res === 'back' || r === 'back') { this.res = null; return 'back'; }
    return null;
  }
  draw(ctx, t) {
    ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(0, 0, W, H);
    UI.panel(ctx, 60, 60, W - 120, 96);
    Font.wrap(this.text, W - 150).forEach((ln, i) => Font.draw(ctx, ln, W / 2, 74 + i * 11, UI.paper, { align: 'center' }));
    this.menu.draw(ctx, W / 2, 120, t);
  }
}

class OptionsScreen {
  constructor() {
    const s = Game.settings;
    const vol = (v) => '[' + '#'.repeat(v) + '-'.repeat(10 - v) + ']';
    this.menu = new Menu([
      { label: () => 'MÚSICA  ' + vol(s.music), left: () => { s.music = Math.max(0, s.music - 1); Game.applySettings(); }, right: () => { s.music = Math.min(10, s.music + 1); Game.applySettings(); } },
      { label: () => 'EFECTOS  ' + vol(s.sfx), left: () => { s.sfx = Math.max(0, s.sfx - 1); Game.applySettings(); }, right: () => { s.sfx = Math.min(10, s.sfx + 1); Game.applySettings(); } },
      { label: () => 'DIFICULTAD: < ' + DIFF_NAMES[s.difficulty] + ' >', left: () => { s.difficulty = Math.max(0, s.difficulty - 1); Game.applySettings(); }, right: () => { s.difficulty = Math.min(2, s.difficulty + 1); Game.applySettings(); } },
      { label: () => 'VIBRACIÓN DEL MANDO: ' + (s.rumble ? 'SÍ' : 'NO'), act: () => { s.rumble = !s.rumble; Game.applySettings(); if (s.rumble) Input.rumble(0.6, 0.6, 200); } },
      { label: () => 'SACUDIDA DE PANTALLA: ' + (s.shake ? 'SÍ' : 'NO'), act: () => { s.shake = !s.shake; Game.applySettings(); } },
      { label: () => 'CONTROLES TÁCTILES: ' + { auto: 'AUTO', on: 'SÍ', off: 'NO' }[s.touch], act: () => { s.touch = { auto: 'on', on: 'off', off: 'auto' }[s.touch]; Game.applySettings(); } },
      { label: 'PANTALLA COMPLETA', act: () => Game.toggleFullscreen() },
      { label: 'VOLVER', act: () => { this.done = true; } },
    ]);
  }
  update(dt) {
    const r = this.menu.update(dt);
    if (this.done) { this.done = false; return 'back'; }
    return r;
  }
  draw(ctx, t) {
    drawScreenTitle(ctx, 'OPCIONES');
    this.menu.draw(ctx, W / 2, 44, t, { lh: 17 });
    Font.draw(ctx, 'Usa izquierda/derecha para ajustar', W / 2, H - 14, UI.dim, { align: 'center' });
  }
}

class ControlsScreen {
  constructor() {
    this.sel = 0; this.capturing = null; this.capT = 0; this.rects = [];
    this.rows = ACTIONS.concat(['RESET', 'BACK']);
  }
  update(dt) {
    if (this.capturing) {
      this.capT -= dt;
      if (this.capT <= 0) { Input.capture = null; this.capturing = null; }
      return null;
    }
    if (Input.menu('up', dt)) { this.sel = (this.sel + this.rows.length - 1) % this.rows.length; Audio2.sfx('menu'); }
    if (Input.menu('down', dt)) { this.sel = (this.sel + 1) % this.rows.length; Audio2.sfx('menu'); }
    const tap = Input.takeTap();
    let act = Input.confirm();
    if (tap) {
      this.rects.forEach((r, i) => { if (tap.y >= r.y && tap.y < r.y + r.h) { if (this.sel === i) act = true; this.sel = i; } });
    }
    if (act) {
      const row = this.rows[this.sel];
      Audio2.sfx('select');
      if (row === 'BACK') return 'back';
      if (row === 'RESET') { Input.resetBinds(); return null; }
      this.capturing = row; this.capT = 8;
      Input.startCapture((res) => {
        const a = this.capturing;
        this.capturing = null;
        if (!a) return;
        if (res.type === 'key') {
          if (res.code === 'Escape') return;
          Input.keyBinds[a] = [res.code];
        } else {
          const bind = res.bind;
          const list = [bind];
          const def = DEFAULT_PAD[a].find((b) => b.a !== undefined);
          if (def && bind.a === undefined) list.push(def);
          Input.padBinds[a] = list;
        }
        Input.saveBinds();
        Audio2.sfx('select');
      });
      return null;
    }
    if (Input.back()) { Audio2.sfx('back'); return 'back'; }
    return null;
  }
  draw(ctx, t) {
    drawScreenTitle(ctx, 'CONTROLES');
    const dev = Input.padConnected ? 'MANDO: ' + (Input.padName || 'DESCONOCIDO').slice(0, 40) : 'SIN MANDO (CONECTA UNO Y PULSA UN BOTÓN)';
    Font.draw(ctx, dev, W / 2, 28, Input.padConnected ? '#80ff80' : UI.dim, { align: 'center' });
    Font.draw(ctx, 'ACCIÓN', 30, 40, UI.gold); Font.draw(ctx, 'TECLADO', 170, 40, UI.gold); Font.draw(ctx, 'MANDO', 262, 40, UI.gold);
    this.rects = [];
    this.rows.forEach((row, i) => {
      const y = 52 + i * 11;
      const sel = i === this.sel;
      if (sel) { ctx.fillStyle = 'rgba(224,32,44,0.35)'; ctx.fillRect(20, y - 2, W - 40, 10); }
      this.rects.push({ y: y - 2, h: 11 });
      const col = sel ? UI.gold : UI.paper;
      if (row === 'RESET') Font.draw(ctx, 'RESTABLECER CONTROLES', W / 2, y, col, { align: 'center' });
      else if (row === 'BACK') Font.draw(ctx, 'VOLVER', W / 2, y, col, { align: 'center' });
      else {
        Font.draw(ctx, ACTION_NAMES[row], 30, y, col);
        Font.draw(ctx, Input.keyBinds[row].map((c) => Input.keyLabel(c)).slice(0, 2).join(' / '), 170, y, col);
        Font.draw(ctx, Input.padBinds[row].map((b) => Input.padLabel(b)).slice(0, 2).join(' / '), 262, y, col);
      }
    });
    if (this.capturing) {
      ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(0, 0, W, H);
      UI.panel(ctx, 50, 80, W - 100, 56);
      Font.draw(ctx, 'PULSA UNA TECLA O BOTÓN PARA:', W / 2, 92, UI.paper, { align: 'center' });
      Font.draw(ctx, ACTION_NAMES[this.capturing], W / 2, 106, UI.gold, { align: 'center', scale: 1 });
      Font.draw(ctx, 'ESC CANCELA · ' + Math.ceil(this.capT) + 's', W / 2, 120, UI.dim, { align: 'center' });
    }
  }
}

class WorkshopScreen {
  constructor(world) {
    this.world = world;
    const items = UPGRADES.map((u) => ({
      label: () => {
        const lvl = Game.save.upgrades[u.id];
        return u.name + '  ' + '#'.repeat(lvl) + '-'.repeat(3 - lvl) + '  ' + (lvl >= 3 ? 'MÁX' : u.cost[lvl]);
      },
      act: () => this.buy(u),
    }));
    items.push({ label: 'VOLVER', act: () => { this.done = true; } });
    this.menu = new Menu(items);
    this.msg = ''; this.msgT = 0;
  }
  buy(u) {
    const lvl = Game.save.upgrades[u.id];
    if (lvl >= 3) { this.msg = 'Ya está al máximo.'; this.msgT = 2; return; }
    const c = u.cost[lvl];
    if (Game.save.tech < c) { this.msg = 'Te falta tecnología (' + (c - Game.save.tech) + ').'; this.msgT = 2; Audio2.sfx('back'); return; }
    Game.save.tech -= c;
    Game.save.upgrades[u.id]++;
    if (this.world) this.world.player.refreshStats();
    if (u.id === 'hp' && this.world) this.world.player.hp += 20;
    Game.saveGame();
    this.msg = '¡Mejora instalada!'; this.msgT = 2;
    Audio2.sfx('heal');
  }
  update(dt) {
    if (this.msgT > 0) this.msgT -= dt;
    const r = this.menu.update(dt);
    if (this.done) { this.done = false; return 'back'; }
    return r;
  }
  draw(ctx, t) {
    drawScreenTitle(ctx, 'TALLER DE PETER');
    drawTechIcon(ctx, W / 2 - 40, 31, t);
    Font.draw(ctx, 'TECNOLOGÍA: ' + Game.save.tech, W / 2 - 30, 31, UI.gold);
    this.menu.draw(ctx, W / 2, 52, t, { lh: 16 });
    const u = UPGRADES[this.menu.sel];
    if (u) Font.draw(ctx, u.desc, W / 2, 160, '#b0c0ff', { align: 'center' });
    if (this.msgT > 0) Font.draw(ctx, this.msg, W / 2, 178, UI.gold, { align: 'center' });
    Font.draw(ctx, 'Consigue tecnología derrotando enemigos,', W / 2, 192, UI.dim, { align: 'center' });
    Font.draw(ctx, 'deteniendo crímenes y buscando piezas Stark.', W / 2, 202, UI.dim, { align: 'center' });
  }
}

class SuitsScreen {
  constructor() {
    const items = SUITS.map((s) => ({
      label: () => (Game.save.suits.includes(s.id) ? s.name : '???') + (Game.save.suit === s.id ? '  (PUESTO)' : ''),
      act: () => {
        if (Game.save.suits.includes(s.id)) { Game.save.suit = s.id; Game.saveGame(); Audio2.sfx('select'); }
        else Audio2.sfx('back');
      },
    }));
    items.push({ label: 'VOLVER', act: () => { this.done = true; } });
    this.menu = new Menu(items);
    this.menu.sel = Math.max(0, SUITS.findIndex((s) => s.id === Game.save.suit));
  }
  update(dt) {
    const r = this.menu.update(dt);
    if (this.done) { this.done = false; return 'back'; }
    return r;
  }
  draw(ctx, t) {
    drawScreenTitle(ctx, 'TRAJES');
    this.menu.draw(ctx, 24, 44, t, { lh: 16, align: 'left' });
    const s = SUITS[this.menu.sel];
    if (s) {
      ctx.fillStyle = '#1a1830'; ctx.fillRect(250, 36, 110, 130);
      const unlocked = Game.save.suits.includes(s.id);
      const pal = unlocked ? s.palObj : FLASH_PAL;
      if (!unlocked) ctx.globalAlpha = 0.15;
      Rig.draw(ctx, 305, 150, Math.sin(t) > 0 ? 1 : -1, Poses.idle(t), pal, { scale: 4 });
      ctx.globalAlpha = 1;
      const lines = Font.wrap(unlocked ? s.desc : 'Bloqueado: completa la misión ' + (MISSION_SUIT.indexOf(s.id) + 1) + '.', 150);
      lines.forEach((ln, i) => Font.draw(ctx, ln, 305, 176 + i * 10, UI.paper, { align: 'center' }));
    }
  }
}

class PauseRoot {
  constructor(world) {
    this.world = world;
    const city = world.mode === 'city';
    this.menu = new Menu([
      { label: 'REANUDAR', act: () => { this.res = 'close'; } },
      { label: 'TALLER', act: () => this.stack.push(new WorkshopScreen(world)) },
      { label: 'TRAJES', act: () => this.stack.push(new SuitsScreen()) },
      { label: 'CONTROLES', act: () => this.stack.push(new ControlsScreen()) },
      { label: 'OPCIONES', act: () => this.stack.push(new OptionsScreen()) },
      city ? { label: 'GUARDAR Y SALIR AL MENÚ', act: () => { Game.save.cityX = world.player.x; Game.saveGame(); Game.toMenu(); } }
        : { label: 'ABANDONAR MISIÓN', act: () => this.stack.push(new ConfirmScreen('¿Abandonar la misión? Volverás a la ciudad.', () => { Game.goCity({ x: MARKER_X[world.missionIdx] ? MARKER_X[world.missionIdx] - 100 : Game.save.cityX }); })) },
    ]);
    if (Game.save.stage === 0 && !city) this.menu.items[5] = { label: 'SALIR AL MENÚ PRINCIPAL', act: () => this.stack.push(new ConfirmScreen('¿Salir al menú? Perderás el progreso de esta misión.', () => Game.toMenu())) };
  }
  update(dt) {
    const r = this.menu.update(dt);
    if (this.res) { const x = this.res; this.res = null; return x; }
    return r;
  }
  draw(ctx, t) {
    ctx.fillStyle = 'rgba(8,6,16,0.8)'; ctx.fillRect(0, 0, W, H);
    Font.draw(ctx, 'PAUSA', W / 2, 26, UI.paper, { align: 'center', scale: 3, shadow: UI.red });
    this.menu.draw(ctx, W / 2, 70, t, { lh: 15 });
    const s = Game.save;
    const info = 'TECNOLOGÍA ' + s.tech + '   PIEZAS STARK ' + s.tokens.length + '/20   CRÍMENES ' + (s.stats.crimes || 0);
    Font.draw(ctx, info, W / 2, 172, UI.dim, { align: 'center' });
    if (this.world.mode === 'mission') Font.draw(ctx, 'MISIÓN ' + (this.world.missionIdx + 1) + ': ' + MISSIONS[this.world.missionIdx].name, W / 2, 186, UI.gold, { align: 'center' });
    else if (s.stage >= 1 && s.stage <= 4) Font.draw(ctx, 'SIGUIENTE: ' + MISSIONS[s.stage].name + ' (' + MARKER_PLACE[s.stage] + ')', W / 2, 186, UI.gold, { align: 'center' });
  }
}

class PauseMenu {
  constructor(world) {
    const root = new PauseRoot(world);
    this.stack = new MenuStack(root);
    root.stack = this.stack;
    Audio2.musicGain && (Audio2.musicGain.gain.value = Game.settings.music / 10 * 0.2);
  }
  update(dt) {
    const r = this.stack.update(dt);
    if (r === 'close') { Game.applySettings(); return 'close'; }
    return null;
  }
  draw(ctx, t) { this.stack.draw(ctx, t); }
}

// ---------------------------------------------------------------------------
// Escenas
// ---------------------------------------------------------------------------
// Pequeño Spider-Man que se balancea por el fondo de los menús
function drawSwinger(ctx, t, sky) {
  const period = 7;
  const u = (t % period) / period;
  const x = -40 + u * (W + 80);
  const ax = Math.floor((x + 60) / 120) * 120 + 20;
  const swingY = 60 + Math.abs(Math.sin(u * Math.PI * 3)) * 40;
  const ay = 10;
  ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(ax + 0.5, ay); ctx.lineTo(x, swingY - 16); ctx.stroke();
  const pose = Poses.swing(170);
  pose.rot = Math.atan2(ax - x, swingY - ay) / D2R * 0.9;
  Rig.draw(ctx, Math.round(x), Math.round(swingY), 1, pose, SUITS[0].palObj);
}

function drawLogo(ctx, t, y = 30) {
  const title = 'SPIDER-MAN';
  Font.draw(ctx, title, W / 2 + 2, y + 2, '#140a12', { align: 'center', scale: 4 });
  Font.draw(ctx, title, W / 2, y, UI.red, { align: 'center', scale: 4, outline: '#140a12' });
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  const w = Font.width(title, 4);
  ctx.fillRect(W / 2 - w / 2, y + 1, w, 2);
  Font.draw(ctx, 'ECOS DE NUEVA YORK', W / 2, y + 36, UI.paper, { align: 'center', scale: 2, shadow: UI.blue });
}

class TitleScene {
  constructor() { this.t = 0; Audio2.music('title'); Input.clearAny(); }
  update(dt) {
    this.t += dt;
    const tap = Input.takeTap();
    if (this.t > 0.4 && (Input.anyPressed() || tap)) { Input.clearAny(); Audio2.unlock(); Audio2.sfx('select'); Game.change(() => new MenuScene()); }
  }
  draw(ctx) {
    Scenery.drawBackground(ctx, 'night', this.t * 30, 264, 480);
    drawSwinger(ctx, this.t);
    drawLogo(ctx, this.t, 40);
    if (Math.floor(this.t * 2) % 2) Font.draw(ctx, 'PULSA CUALQUIER BOTÓN', W / 2, 140, UI.paper, { align: 'center', shadow: UI.ink });
    Font.draw(ctx, 'Teclado · Mando · Pantalla táctil', W / 2, 172, '#9aa0c0', { align: 'center', shadow: UI.ink });
    Font.draw(ctx, 'Juego de fans no oficial y sin fines de lucro.', W / 2, 192, '#7a7a98', { align: 'center', shadow: UI.ink });
    Font.draw(ctx, 'Spider-Man y sus personajes son propiedad de Marvel.', W / 2, 203, '#7a7a98', { align: 'center', shadow: UI.ink });
  }
}

class MenuScene {
  constructor() {
    this.t = 0;
    Audio2.music('title');
    const hasSave = Game.save.started;
    const root = {
      menu: new Menu([
        { label: 'CONTINUAR', disabled: () => !Game.save.started, act: () => Game.continueGame() },
        { label: 'NUEVA PARTIDA', act: () => { if (Game.save.started) this.stack.push(new ConfirmScreen('¿Empezar una partida nueva? Se borrará el progreso guardado.', () => Game.newGame())); else Game.newGame(); } },
        { label: 'CONTROLES', act: () => this.stack.push(new ControlsScreen()) },
        { label: 'OPCIONES', act: () => this.stack.push(new OptionsScreen()) },
        { label: 'CRÉDITOS', act: () => Game.change(() => new CreditsScene(() => new MenuScene())) },
      ]),
      update(dt) { const r = this.menu.update(dt); return r === 'back' ? null : r; },
      draw: (ctx, t) => {
        drawLogo(ctx, t, 30);
        root.menu.draw(ctx, W / 2, 100, t, { lh: 15 });
        if (Game.save.started) {
          const s = Game.save;
          const prog = s.stage >= 5 ? 'HISTORIA COMPLETADA' : 'MISIÓN ' + (s.stage + 1) + ' DE 5';
          Font.draw(ctx, prog + ' · PIEZAS STARK ' + s.tokens.length + '/20', W / 2, 186, UI.dim, { align: 'center', shadow: UI.ink });
        }
        Font.draw(ctx, Audio2.ready() ? '' : 'Haz clic o pulsa una tecla para activar el sonido', W / 2, 200, '#9aa0c0', { align: 'center', shadow: UI.ink });
      },
    };
    if (!hasSave) root.menu.sel = 1;
    this.stack = new MenuStack(root);
  }
  update(dt) { this.t += dt; this.stack.update(dt); }
  draw(ctx) {
    Scenery.drawBackground(ctx, 'night', this.t * 30, 264, 480);
    drawSwinger(ctx, this.t + 3);
    ctx.fillStyle = 'rgba(8,6,16,0.35)'; ctx.fillRect(0, 0, W, H);
    this.stack.draw(ctx, this.t);
    drawTouch(ctx);
  }
}

class StoryScene {
  constructor(lines, next, sky = 'night', music = 'sad') {
    this.t = 0; this.sky = sky; this.next = next;
    Audio2.music(music);
    this.dialog = new Dialog(lines, () => { Game.change(this.next); });
  }
  update(dt) { this.t += dt; this.dialog.update(dt); }
  draw(ctx) {
    Scenery.drawBackground(ctx, this.sky, 200 + this.t * 6, 264, 480);
    // azotea con Peter sentado mirando la ciudad
    ctx.fillStyle = '#1a1422'; ctx.fillRect(0, 178, W, 38);
    ctx.fillStyle = '#2a2232'; ctx.fillRect(0, 176, W, 3);
    drawDecor(ctx, { type: 'tank', x: 60, y: 176 }, 0, 0, this.t, { night: true });
    drawDecor(ctx, { type: 'antenna', x: 330, y: 176 }, 0, 0, this.t, { night: true });
    Rig.draw(ctx, 200, 176, 1, Poses.sit(), SUITS[0].palObj);
    this.dialog.draw(ctx, this.t);
  }
}

class ResultsScene {
  constructor(idx, stats, next) {
    this.t = 0; this.idx = idx; this.stats = stats; this.next = next;
    Audio2.music(null);
    Audio2.sfx('win');
    this.suit = SUITS.find((s) => s.id === MISSION_SUIT[idx]);
  }
  update(dt) {
    this.t += dt;
    const tap = Input.takeTap();
    if (this.t > 1.2 && (Input.confirm() || Input.pressed('ATTACK') || tap)) { Audio2.sfx('select'); Game.change(this.next); }
  }
  draw(ctx) {
    Scenery.drawBackground(ctx, 'dusk', this.t * 20, 264, 480);
    ctx.fillStyle = 'rgba(8,6,16,0.7)'; ctx.fillRect(0, 0, W, H);
    Font.draw(ctx, '¡MISIÓN COMPLETADA!', W / 2, 18, UI.gold, { align: 'center', scale: 2, shadow: UI.ink });
    Font.draw(ctx, 'MISIÓN ' + (this.idx + 1) + ': ' + MISSIONS[this.idx].name, W / 2, 42, UI.paper, { align: 'center' });
    const s = this.stats;
    const mm = Math.floor(s.time / 60), ss = Math.floor(s.time % 60);
    const rows = [
      ['TIEMPO', mm + ':' + ('0' + ss).slice(-2)],
      ['ENEMIGOS DERROTADOS', String(s.kos)],
      ['COMBO MÁXIMO', 'x' + s.maxCombo],
      ['REDES LANZADAS', String(s.webs)],
      ['TECNOLOGÍA OBTENIDA', '+' + s.tech + ' (+15 BONUS)'],
    ];
    rows.forEach(([a, b], i) => {
      if (this.t < 0.3 + i * 0.15) return;
      Font.draw(ctx, a, 80, 64 + i * 13, UI.paper);
      Font.draw(ctx, b, W - 80, 64 + i * 13, UI.gold, { align: 'right' });
    });
    if (this.suit && this.t > 1.2) {
      UI.panel(ctx, 70, 134, W - 140, 44, 'rgba(40,10,14,0.9)');
      Font.draw(ctx, '¡NUEVO TRAJE DESBLOQUEADO!', W / 2 + 14, 142, UI.gold, { align: 'center' });
      Font.draw(ctx, this.suit.name, W / 2 + 14, 156, UI.paper, { align: 'center' });
      Rig.draw(ctx, 92, 174, 1, Poses.idle(this.t), this.suit.palObj, { scale: 1.5 });
    }
    if (this.t > 1.2 && Math.floor(this.t * 2) % 2) Font.draw(ctx, 'PULSA [' + Input.label('JUMP') + '] PARA CONTINUAR', W / 2, 196, UI.paper, { align: 'center' });
  }
}

class CreditsScene {
  constructor(next) { this.t = 0; this.next = next; Audio2.music('title'); }
  update(dt) {
    this.t += dt;
    const tap = Input.takeTap();
    const end = this.t > STORY.credits.length * 3.2 + 2;
    if (end || (this.t > 1.5 && (Input.confirm() || Input.back() || tap))) { Game.change(this.next); this.t = -999; }
  }
  draw(ctx) {
    Scenery.drawBackground(ctx, 'night', this.t * 25, 264, 480);
    drawSwinger(ctx, this.t * 0.8);
    ctx.fillStyle = 'rgba(8,6,16,0.45)'; ctx.fillRect(0, 0, W, H);
    const i = Math.floor(Math.max(0, this.t) / 3.2);
    const c = STORY.credits[Math.min(i, STORY.credits.length - 1)];
    const lt = (Math.max(0, this.t) % 3.2);
    ctx.globalAlpha = i >= STORY.credits.length ? 1 : Math.min(1, lt * 2, (3.2 - lt) * 2);
    Font.draw(ctx, c[0], W / 2, 80, UI.gold, { align: 'center', scale: i === 0 ? 3 : 1, shadow: UI.ink });
    Font.wrap(c[1], 300).forEach((ln, k) => Font.draw(ctx, ln, W / 2, (i === 0 ? 112 : 96) + k * 11, UI.paper, { align: 'center', shadow: UI.ink }));
    ctx.globalAlpha = 1;
  }
}

class PlayScene {
  constructor(world) { this.world = world; }
  update(dt) { this.world.update(dt); }
  draw(ctx) { this.world.draw(ctx); }
}

// ---------------------------------------------------------------------------
// Objeto principal
// ---------------------------------------------------------------------------
const Game = {
  canvas: null, ctx: null, scene: null, fade: null,
  settings: defaultSettings(), save: defaultSave(),
  acc: 0, last: 0, frame: 0, errors: [],

  init() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.ctx.imageSmoothingEnabled = false;
    this.loadAll();
    Input.init(this.canvas);
    this.applySettings();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('fullscreenchange', () => this.resize());
    this.resize();
    this.scene = new TitleScene();
    requestAnimationFrame((ts) => this.loop(ts));
  },

  loadAll() {
    const s = Store.get('sm_save', null);
    const base = defaultSave();
    if (s && typeof s === 'object') {
      this.save = Object.assign(base, s);
      this.save.upgrades = Object.assign(defaultSave().upgrades, s.upgrades || {});
      this.save.stats = Object.assign(defaultSave().stats, s.stats || {});
      if (!Array.isArray(this.save.tokens)) this.save.tokens = [];
      if (!Array.isArray(this.save.suits) || !this.save.suits.length) this.save.suits = ['nwh'];
      if (!SUITS.find((x) => x.id === this.save.suit)) this.save.suit = 'nwh';
      this.save.stage = clamp(parseInt(this.save.stage, 10) || 0, 0, 5);
      this.save.tech = Math.max(0, parseInt(this.save.tech, 10) || 0);
    } else this.save = base;
    const st = Store.get('sm_settings', null);
    this.settings = Object.assign(defaultSettings(), st && typeof st === 'object' ? st : {});
    this.settings.difficulty = clamp(parseInt(this.settings.difficulty, 10) || 0, 0, 2);
  },
  saveGame() { Store.set('sm_save', this.save); },
  applySettings() {
    Audio2.musicVol = this.settings.music / 10;
    Audio2.sfxVol = this.settings.sfx / 10;
    Audio2.applyVolumes();
    Input.rumbleOn = !!this.settings.rumble;
    Store.set('sm_settings', this.settings);
  },

  resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    let s = Math.min(vw / W, vh / H);
    if (s >= 3) s = Math.floor(s);
    this.canvas.style.width = Math.floor(W * s) + 'px';
    this.canvas.style.height = Math.floor(H * s) + 'px';
  },

  toggleFullscreen() {
    try {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
    } catch (e) { /* no disponible */ }
  },

  change(makeScene) {
    if (this.fade) return;
    this.fade = { t: 0, make: makeScene, phase: 'out' };
  },

  newGame() {
    const keepSuit = null;
    this.save = defaultSave();
    this.save.started = true;
    if (keepSuit) this.save.suit = keepSuit;
    this.saveGame();
    this.change(() => new StoryScene(STORY.intro, () => this.missionScene(0)));
  },
  continueGame() {
    if (this.save.stage === 0) this.change(() => this.missionScene(0));
    else this.change(() => new PlayScene(new World('city', { x: this.save.cityX })));
  },
  missionScene(i) { return new PlayScene(new World('mission', { mission: i })); },
  startMission(i) { this.change(() => this.missionScene(i)); },
  goCity(opts = {}) {
    if (this.save.stage === 0) { this.change(() => new MenuScene()); return; }
    this.change(() => new PlayScene(new World('city', Object.assign({ x: this.save.cityX }, opts))));
  },
  toMenu() { this.change(() => new MenuScene()); },

  missionComplete(i, stats) {
    this.save.tech += 15;
    this.save.stage = Math.max(this.save.stage, i + 1);
    const suit = MISSION_SUIT[i];
    if (suit && !this.save.suits.includes(suit)) this.save.suits.push(suit);
    const cx = i === 0 ? 400 : MARKER_X[i] - 100;
    this.save.cityX = cx;
    if (i === 4) this.save.completed = true;
    this.saveGame();
    const next = () => {
      if (i === 4) return new CreditsScene(() => new PlayScene(new World('city', { x: cx, afterMission: 4 })));
      return new PlayScene(new World('city', { x: cx, afterMission: i }));
    };
    this.change(() => new ResultsScene(i, stats, next));
  },

  loop(ts) {
    const now = ts / 1000;
    let dt = this.last ? now - this.last : 1 / 60;
    this.last = now;
    if (dt > 0.1) dt = 0.1;
    this.acc += dt;
    const step = 1 / 60;
    let n = 0;
    try {
      while (this.acc >= step && n < 6) {
        Input.poll();
        this.step(step);
        this.acc -= step; n++;
      }
      if (n >= 6) this.acc = 0;
      this.render();
    } catch (e) {
      this.errors.push(String(e && e.stack || e));
      console.error(e);
      if (this.errors.length > 20) this.errors.shift();
    }
    this.frame++;
    requestAnimationFrame((t) => this.loop(t));
  },

  step(dt) {
    if (this.fade) {
      const f = this.fade;
      f.t += dt;
      if (f.phase === 'out' && f.t >= 0.25) {
        const s = f.make();
        if (s) this.scene = s;
        f.phase = 'in'; f.t = 0;
        Input.tap = null;
      } else if (f.phase === 'in' && f.t >= 0.25) this.fade = null;
      if (f.phase === 'out') return;
    }
    this.scene.update(dt);
  },

  render() {
    const ctx = this.ctx;
    this.scene.draw(ctx);
    if (this.fade) {
      const a = this.fade.phase === 'out' ? this.fade.t / 0.25 : 1 - this.fade.t / 0.25;
      ctx.fillStyle = 'rgba(0,0,0,' + clamp(a, 0, 1) + ')';
      ctx.fillRect(0, 0, W, H);
    }
  },
};

window.addEventListener('load', () => Game.init());
