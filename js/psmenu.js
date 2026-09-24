'use strict';
// ---------------------------------------------------------------------------
// Menú de pausa estilo PlayStation: pestañas MAPA · HABILIDADES · ARTILUGIOS ·
// TRAJES · RÉCORDS · MULTIJUGADOR · SISTEMA. Cambia de pestaña con L1 / R1
// (Q / E en el teclado).
// ---------------------------------------------------------------------------
const PS_COL = { bg: 'rgba(6,8,22,0.94)', line: 'rgba(90,120,200,0.18)', sel: 'rgba(224,32,44,0.45)', dim: '#6a6a88', blue: '#40b0ff' };
const COOP_COLS = ['#ff5060', '#40b0ff', '#60e070', '#ffd040'];

function psBackground(ctx, t) {
  ctx.fillStyle = PS_COL.bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = PS_COL.line;
  for (let i = -H; i < W; i += 18) { const x = (i + t * 6) % (W + H); ctx.fillRect(x, 0, 1, H); }
}
function psHints(ctx, parts) {
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, H - 11, W, 11);
  let p = parts.slice();
  while (p.length > 1 && Font.width(p.join('  ')) > W - 6) p.pop();
  Font.draw(ctx, p.join('  '), W / 2, H - 9, '#c8c8dc', { align: 'center' });
}
const L = (a) => '[' + Input.label(a) + ']';

// Qué dispositivo pulsó algo este fotograma (para saber quién es el jugador 1)
function pressedDevice(actions) {
  for (const id in Input.dev) for (const a of actions) if (Input.dev[id].pressed[a]) return id;
  if (Input.menuKeys && (Input.menuKeys.confirm || Input.menuKeys.back)) return 'kb';
  return null;
}

// ------------------------------------------------------------------ MAPA
class MapTab {
  constructor(M) { this.M = M; this.name = 'MAPA'; this.sel = 0; }
  list() {
    const w = this.M.world;
    return UNIVERSE_ORDER.filter((u) => (Game.save.visited || []).includes(u) || u === w.universe || (u === '616' && Game.save.stage >= STORY_DONE));
  }
  update(dt) {
    const L2 = this.list();
    if (Input.menu('up', dt)) { this.sel = (this.sel + L2.length - 1) % L2.length; Audio2.sfx('menu'); }
    if (Input.menu('down', dt)) { this.sel = (this.sel + 1) % L2.length; Audio2.sfx('menu'); }
    if (Input.confirm()) {
      const w = this.M.world, u = L2[this.sel];
      if (w.mode !== 'city') { this.msg = 'Termina o abandona el capítulo para viajar.'; Audio2.sfx('back'); }
      else if (u === w.universe) { this.msg = 'Ya estás aquí.'; }
      else { Audio2.sfx('select'); Game.save.cityPos[w.universe] = w.player.x; Game.saveGame(); Game.goCity({ universe: u }); return 'close'; }
    }
    return null;
  }
  draw(ctx, t) {
    const w = this.M.world, lv = w.level, U = UNIVERSES[w.universe];
    const mx = 10, my = 38, mw = W - 20, mh = 70;
    Font.draw(ctx, (w.mode === 'mission' ? chapterLabel(w.missionIdx) + ': ' + MISSIONS[w.missionIdx].name : U.name + ' · ' + U.city).toUpperCase(), mx, 30, UI.gold, {});
    ctx.fillStyle = 'rgba(20,24,48,0.9)'; ctx.fillRect(mx, my, mw, mh);
    ctx.strokeStyle = '#3a4a80'; ctx.lineWidth = 1; ctx.strokeRect(mx + 0.5, my + 0.5, mw - 1, mh - 1);
    const sx = (x) => mx + x / lv.width * mw, sy = (y) => my + y / lv.height * mh;
    for (const s of lv.solids) {
      if (s.kind === 'block') continue;
      ctx.fillStyle = s.kind === 'ground' ? '#4a4a64' : s.kind === 'tower' ? '#7a86b0' : '#56608a';
      ctx.fillRect(sx(s.x), sy(s.y), Math.max(1, s.w / lv.width * mw), Math.max(1, s.h / lv.height * mh));
    }
    ctx.fillStyle = '#8a90b0';
    for (const o of lv.oneways || []) ctx.fillRect(sx(o.x), sy(o.y), Math.max(1, o.w / lv.width * mw), 1);
    if (lv.water) { ctx.fillStyle = 'rgba(60,120,200,0.5)'; ctx.fillRect(mx, sy(lv.water), mw, my + mh - sy(lv.water)); }
    // arenas de la misión
    for (const a of lv.arenas) {
      ctx.fillStyle = a.done ? 'rgba(120,120,140,0.35)' : a.boss ? 'rgba(255,60,60,0.45)' : 'rgba(255,160,60,0.35)';
      ctx.fillRect(sx(a.x1), my + 2, Math.max(2, (a.x2 - a.x1) / lv.width * mw), mh - 4);
      if (a.boss && !a.done) Font.draw(ctx, 'JEFE', sx((a.x1 + a.x2) / 2), my + 3, '#ff8080', { align: 'center' });
    }
    // fragmentos
    for (const tk of lv.tokens) {
      const got = Game.save.tokens.includes(tk.id);
      ctx.fillStyle = got ? '#4a4a60' : (Math.floor(t * 3 + tk.idx) % 2 ? '#80ffe8' : '#ff60c0');
      ctx.fillRect(Math.round(sx(tk.x)) - 1, Math.round(sy(tk.y)) - 1, 3, 3);
    }
    if (w.markerX) { ctx.fillStyle = Math.floor(t * 4) % 2 ? '#60e0ff' : '#2080c0'; ctx.fillRect(Math.round(sx(w.markerX)), my, 2, mh); Font.draw(ctx, 'MISIÓN', sx(w.markerX), my + mh + 2, '#60e0ff', { align: 'center' }); }
    if (w.crime) { ctx.fillStyle = Math.floor(t * 6) % 2 ? '#ff3030' : '#ffffff'; ctx.fillRect(Math.round(sx(w.crime.x)) - 2, sy(lv.groundY) - 6, 5, 5); Font.draw(ctx, '!', sx(w.crime.x), sy(lv.groundY) - 14, '#ff4040', { align: 'center' }); }
    // vista de la cámara y jugadores
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.strokeRect(Math.round(sx(w.cam.x)) + 0.5, Math.round(sy(w.cam.y)) + 0.5, W / lv.width * mw, H / lv.height * mh);
    w.players.forEach((q, i) => {
      if (q.state === 'dead') return;
      ctx.fillStyle = COOP_COLS[i]; const px = Math.round(sx(q.cx)), py = Math.round(sy(q.cy));
      ctx.fillRect(px - 2, py - 2, 5, 5); ctx.fillStyle = '#fff'; ctx.fillRect(px, py, 1, 1);
      if (w.coop) Font.draw(ctx, 'J' + (i + 1), px, py - 9, COOP_COLS[i], { align: 'center', outline: '#000' });
    });
    // leyenda
    const ly = my + mh + 10;
    const leg = [['#ff5060', 'TÚ'], ['#80ffe8', 'FRAGMENTO'], ['#60e0ff', 'MISIÓN'], ['#ff3030', 'CRIMEN'], ['#ff8080', 'JEFE']];
    leg.forEach(([c, n], i) => { ctx.fillStyle = c; ctx.fillRect(mx + 238 + (i % 2) * 64, ly + Math.floor(i / 2) * 11 + 1, 4, 4); Font.draw(ctx, n, mx + 246 + (i % 2) * 64, ly + Math.floor(i / 2) * 11, UI.paper, {}); });
    // universos
    Font.draw(ctx, 'VIAJAR ENTRE UNIVERSOS', mx, ly, UI.gold, {});
    this.list().forEach((u, i) => {
      const y = ly + 11 + i * 9, sel = i === this.sel;
      if (sel) { ctx.fillStyle = PS_COL.sel; ctx.fillRect(mx - 2, y - 1, 224, 9); }
      const n = Game.save.tokens.filter((k) => String(k).startsWith(u + ':')).length;
      Font.draw(ctx, UNIVERSES[u].name.toUpperCase() + (u === w.universe ? ' (AQUÍ)' : ''), mx, y, sel ? UI.gold : UI.paper, {});
      Font.draw(ctx, n + '/5', mx + 220, y, n === 5 ? '#80ff80' : UI.dim, { align: 'right' });
    });
    if (this.msg) Font.draw(ctx, this.msg, W / 2, H - 22, '#ff9080', { align: 'center' });
  }
  hints() { return [L('JUMP') + ' VIAJAR', L('DODGE') + ' VOLVER']; }
}

// ------------------------------------------------------------------ HABILIDADES
class SkillsTab {
  constructor(M) { this.M = M; this.name = 'HABILIDADES'; this.col = 0; this.row = 0; }
  cols() { return SKILL_BRANCHES.map((b) => SKILLS.filter((s) => s.b === b.id)); }
  update(dt) {
    const C = this.cols();
    if (Input.menu('left', dt)) { this.col = (this.col + 2) % 3; this.row = Math.min(this.row, C[this.col].length - 1); Audio2.sfx('menu'); }
    if (Input.menu('right', dt)) { this.col = (this.col + 1) % 3; this.row = Math.min(this.row, C[this.col].length - 1); Audio2.sfx('menu'); }
    if (Input.menu('up', dt)) { this.row = (this.row + C[this.col].length - 1) % C[this.col].length; Audio2.sfx('menu'); }
    if (Input.menu('down', dt)) { this.row = (this.row + 1) % C[this.col].length; Audio2.sfx('menu'); }
    if (Input.confirm()) {
      const sk = C[this.col][this.row];
      if (Progress.learn(sk)) { Audio2.sfx('heal'); this.flash = 0.4; for (const q of this.M.world.players) q.refreshStats(); }
      else Audio2.sfx('back');
    }
    if (this.flash > 0) this.flash -= dt;
    return null;
  }
  draw(ctx, t) {
    const s = Game.save, C = this.cols();
    Font.draw(ctx, 'NIVEL ' + s.level, 10, 29, UI.gold, {});
    UI.bar(ctx, 62, 30, 80, 4, s.xp / Progress.xpNeed(s.level), '#60c0ff');
    Font.draw(ctx, s.xp + '/' + Progress.xpNeed(s.level), 146, 29, '#a0c8ff', {});
    Font.draw(ctx, 'PUNTOS: ' + s.skillPts, W - 10, 29, s.skillPts ? UI.gold : UI.dim, { align: 'right' });
    const cw = (W - 20) / 3;
    SKILL_BRANCHES.forEach((b, ci) => {
      const x = 10 + ci * cw;
      ctx.fillStyle = b.color; ctx.fillRect(x, 40, cw - 6, 2);
      Font.draw(ctx, b.name, x + (cw - 6) / 2, 45, b.color, { align: 'center' });
      C[ci].forEach((sk, ri) => {
        const y = 57 + ri * 13, sel = ci === this.col && ri === this.row;
        const has = Progress.has(sk.id), can = Progress.canLearn(sk), locked = sk.req && !Progress.has(sk.req);
        ctx.fillStyle = sel ? PS_COL.sel : has ? 'rgba(255,208,64,0.15)' : 'rgba(255,255,255,0.05)';
        ctx.fillRect(x, y - 2, cw - 6, 11);
        if (sel && this.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(x, y - 2, cw - 6, 11); }
        ctx.fillStyle = has ? UI.gold : can ? '#ffffff' : '#3a3a50'; ctx.fillRect(x + 2, y + 1, 5, 5);
        if (has) { ctx.fillStyle = UI.ink; ctx.fillRect(x + 3, y + 3, 1, 1); ctx.fillRect(x + 4, y + 4, 1, 1); ctx.fillRect(x + 5, y + 2, 1, 2); }
        let nm = sk.name.toUpperCase(); while (Font.width(nm) > cw - 18) nm = nm.slice(0, -1);
        Font.draw(ctx, nm, x + 10, y, has ? UI.gold : locked ? PS_COL.dim : UI.paper, {});
      });
    });
    const sk = C[this.col][this.row];
    UI.panel(ctx, 10, 152, W - 20, 40, 'rgba(20,24,48,0.9)');
    Font.draw(ctx, sk.name.toUpperCase(), 16, 157, SKILL_BRANCHES[this.col].color, {});
    Font.wrap(sk.desc, W - 40).slice(0, 2).forEach((ln, i) => Font.draw(ctx, ln, 16, 168 + i * 10, UI.paper, {}));
    const st = Progress.has(sk.id) ? 'APRENDIDA' : sk.req && !Progress.has(sk.req) ? 'REQUIERE: ' + SKILLS.find((x) => x.id === sk.req).name.toUpperCase() : Game.save.skillPts ? 'COSTE: 1 PUNTO' : 'SIN PUNTOS: SUBE DE NIVEL';
    Font.draw(ctx, st, W - 16, 157, Progress.has(sk.id) ? '#80ff80' : UI.dim, { align: 'right' });
  }
  hints() { return [L('JUMP') + ' APRENDER', L('DODGE') + ' VOLVER']; }
}

// ------------------------------------------------------------------ ARTILUGIOS
class GadgetsTab {
  constructor(M) { this.M = M; this.name = 'ARTILUGIOS'; this.sel = Math.max(0, GADGETS.findIndex((g) => g.id === Game.save.gadget)); }
  rows() { return GADGETS.map((g) => ({ g })).concat(UPGRADES.map((u) => ({ u }))); }
  update(dt) {
    const R = this.rows();
    if (Input.menu('up', dt)) { this.sel = (this.sel + R.length - 1) % R.length; Audio2.sfx('menu'); }
    if (Input.menu('down', dt)) { this.sel = (this.sel + 1) % R.length; Audio2.sfx('menu'); }
    const r = R[this.sel];
    if (r.g) {
      const g = r.g;
      if (Input.confirm()) {
        if (!Progress.gadgetUnlocked(g)) { this.msg = 'Se desbloquea en el nivel ' + g.lvl + '.'; Audio2.sfx('back'); }
        else { Game.save.gadget = g.id; Game.saveGame(); this.msg = g.name + ' equipado.'; Audio2.sfx('select'); }
      }
      if (Input.pressed('ATTACK') && Progress.gadgetUnlocked(g)) {
        const lv = Progress.gadgetLevel(g);
        if (lv >= 3) this.msg = 'Ya está al máximo.';
        else if (Game.save.tech < GADGET_COST[lv]) { this.msg = 'Te falta tecnología (' + (GADGET_COST[lv] - Game.save.tech) + ').'; Audio2.sfx('back'); }
        else { Game.save.tech -= GADGET_COST[lv]; Game.save.gadgetLvl[g.id] = lv + 1; Game.saveGame(); this.msg = '¡' + g.name + ' mejorado a nivel ' + (lv + 1) + '!'; Audio2.sfx('heal'); }
      }
    } else if (Input.confirm()) {
      const u = r.u, lvl = Game.save.upgrades[u.id];
      if (lvl >= 3) this.msg = 'Ya está al máximo.';
      else if (Game.save.tech < u.cost[lvl]) { this.msg = 'Te falta tecnología (' + (u.cost[lvl] - Game.save.tech) + ').'; Audio2.sfx('back'); }
      else {
        Game.save.tech -= u.cost[lvl]; Game.save.upgrades[u.id]++; Game.saveGame();
        for (const q of this.M.world.players) { q.refreshStats(); if (u.id === 'hp') q.hp += 20; }
        this.msg = '¡Mejora instalada!'; Audio2.sfx('heal');
      }
    }
    return null;
  }
  draw(ctx, t) {
    const R = this.rows();
    Font.draw(ctx, 'ARTILUGIOS', 10, 29, UI.gold, {});
    drawTechIcon(ctx, W - 64, 28, t); Font.draw(ctx, 'TECNOLOGÍA ' + Game.save.tech, W - 10, 29, UI.gold, { align: 'right' });
    R.forEach((r, i) => {
      const y = i < GADGETS.length ? 38 + i * 10 : 50 + i * 10, sel = i === this.sel;
      if (i === GADGETS.length) Font.draw(ctx, 'MEJORAS STARK', 10, y - 11, UI.gold, {});
      if (sel) { ctx.fillStyle = PS_COL.sel; ctx.fillRect(8, y - 1, 176, 9); }
      if (r.g) {
        const g = r.g, un = Progress.gadgetUnlocked(g);
        ctx.fillStyle = un ? g.color : '#3a3a50'; ctx.fillRect(12, y, 6, 6);
        Font.draw(ctx, un ? g.name.toUpperCase() : '???  (NV ' + g.lvl + ')', 22, y, un ? (Game.save.gadget === g.id ? UI.gold : UI.paper) : PS_COL.dim, {});
        if (un) Font.draw(ctx, '*'.repeat(Progress.gadgetLevel(g)), 180, y, UI.gold, { align: 'right' });
      } else {
        const lvl = Game.save.upgrades[r.u.id];
        Font.draw(ctx, r.u.name.toUpperCase(), 22, y, UI.paper, {});
        Font.draw(ctx, '#'.repeat(lvl) + '-'.repeat(3 - lvl), 180, y, UI.gold, { align: 'right' });
      }
    });
    // ficha del elemento seleccionado
    const r = R[this.sel];
    UI.panel(ctx, 192, 38, W - 200, 150, 'rgba(20,24,48,0.9)');
    if (r.g) {
      const g = r.g, un = Progress.gadgetUnlocked(g);
      Font.draw(ctx, un ? g.name.toUpperCase() : 'BLOQUEADO', 198, 44, un ? g.color : PS_COL.dim, {});
      Font.wrap(un ? g.desc : 'Sube al nivel ' + g.lvl + ' para desbloquearlo.', W - 214).forEach((ln, i) => Font.draw(ctx, ln, 198, 58 + i * 10, UI.paper, {}));
      if (un) {
        const lv = Progress.gadgetLevel(g);
        Font.draw(ctx, 'NIVEL ' + lv + '/3', 198, 100, UI.gold, {});
        Font.draw(ctx, 'CARGAS: ' + Progress.gadgetMax(g), 198, 112, UI.paper, {});
        Font.draw(ctx, 'RECARGA: ' + Progress.gadgetCd(g).toFixed(1) + ' s', 198, 124, UI.paper, {});
        Font.draw(ctx, lv < 3 ? 'MEJORAR: ' + GADGET_COST[lv] + ' TEC ' + L('ATTACK') : 'NIVEL MÁXIMO', 198, 140, lv < 3 ? '#80e0ff' : '#80ff80', {});
        Font.draw(ctx, Game.save.gadget === g.id ? 'EQUIPADO' : L('JUMP') + ' EQUIPAR', 198, 152, Game.save.gadget === g.id ? '#80ff80' : UI.dim, {});
        Font.draw(ctx, 'EN JUEGO: ' + L('GADGET') + ' USAR', 198, 166, UI.dim, {});
        Font.draw(ctx, L('NEXT_GADGET') + ' CAMBIAR DE ARTILUGIO', 198, 176, UI.dim, {});
      }
    } else {
      const u = r.u, lvl = Game.save.upgrades[u.id];
      Font.draw(ctx, u.name.toUpperCase(), 198, 44, UI.gold, {});
      Font.wrap(u.desc, W - 214).forEach((ln, i) => Font.draw(ctx, ln, 198, 58 + i * 10, UI.paper, {}));
      Font.draw(ctx, lvl >= 3 ? 'NIVEL MÁXIMO' : 'COSTE: ' + u.cost[lvl] + ' TECNOLOGÍA', 198, 100, lvl >= 3 ? '#80ff80' : '#80e0ff', {});
    }
    if (this.msg) Font.draw(ctx, this.msg, W / 2, H - 22, UI.gold, { align: 'center' });
  }
  hints() { return [L('JUMP') + ' EQUIPAR / COMPRAR', L('ATTACK') + ' MEJORAR', L('DODGE') + ' VOLVER']; }
}

// ------------------------------------------------------------------ TRAJES
class SuitsTab {
  constructor(M) { this.M = M; this.name = 'TRAJES'; this.sel = Math.max(0, SUITS.findIndex((s) => s.id === Game.save.suit)); this.scroll = 0; }
  status(s) {
    if (Progress.suitOwned(s)) return { own: true };
    if (s.craft) return { craft: true, ok: Game.save.level >= s.lvl && Game.save.tech >= s.tech };
    const mi = MISSION_SUIT.indexOf(s.id);
    return { story: mi >= 0 ? chapterLabel(mi) : 'la historia' };
  }
  update(dt) {
    const C = 8, n = SUITS.length;
    if (Input.menu('left', dt)) { this.sel = (this.sel + n - 1) % n; Audio2.sfx('menu'); }
    if (Input.menu('right', dt)) { this.sel = (this.sel + 1) % n; Audio2.sfx('menu'); }
    if (Input.menu('up', dt)) { this.sel = Math.max(0, this.sel - C); Audio2.sfx('menu'); }
    if (Input.menu('down', dt)) { this.sel = Math.min(n - 1, this.sel + C); Audio2.sfx('menu'); }
    const row = Math.floor(this.sel / C);
    if (row < this.scroll) this.scroll = row; if (row > this.scroll + 2) this.scroll = row - 2;
    const s = SUITS[this.sel], st = this.status(s);
    if (Input.confirm()) {
      if (st.own) { Game.save.suit = s.id; if (this.M.world.missionIdx !== EXTRA_MISSION) this.M.world.players[0].suitId = Game.coop ? s.id : undefined; if (Game.coop) Game.coop[0].suit = s.id; Game.saveGame(); this.msg = s.name + ' puesto.'; Audio2.sfx('select'); }
      else if (st.craft) {
        if (Game.save.level < s.lvl) { this.msg = 'Necesitas nivel ' + s.lvl + '.'; Audio2.sfx('back'); }
        else if (Game.save.tech < s.tech) { this.msg = 'Te falta tecnología (' + (s.tech - Game.save.tech) + ').'; Audio2.sfx('back'); }
        else { Game.save.tech -= s.tech; Game.save.suits.push(s.id); Game.save.suit = s.id; Game.saveGame(); this.msg = '¡' + s.name + ' fabricado!'; Audio2.sfx('win'); this.M.world.particles.burst(this.M.world.player.cx, this.M.world.player.cy, 20, UI.gold, 90); }
      } else { this.msg = 'Se consigue en ' + st.story.toLowerCase() + '.'; Audio2.sfx('back'); }
    }
    if (Input.pressed('ATTACK') && st.own) { Game.save.power = s.power; Game.saveGame(); this.msg = 'Poder equipado: ' + SUIT_POWERS[s.power].name + '.'; Audio2.sfx('select'); }
    if (Input.pressed('SHOOT')) { Game.save.power = null; Game.saveGame(); this.msg = 'Poder: el de cada traje.'; Audio2.sfx('menu'); }
    return null;
  }
  draw(ctx, t) {
    const C = 8, cw = 28, ch = 44, gx = 10, gy = 40;
    Font.draw(ctx, 'TRAJES ' + SUITS.filter((s) => Progress.suitOwned(s)).length + '/' + SUITS.length, 10, 29, UI.gold, {});
    drawTechIcon(ctx, W - 64, 28, t); Font.draw(ctx, 'TECNOLOGÍA ' + Game.save.tech, W - 10, 29, UI.gold, { align: 'right' });
    for (let r = 0; r < 3; r++) for (let c = 0; c < C; c++) {
      const i = (this.scroll + r) * C + c; if (i >= SUITS.length) continue;
      const s = SUITS[i], x = gx + c * cw, y = gy + r * ch, sel = i === this.sel, st = this.status(s);
      ctx.fillStyle = sel ? PS_COL.sel : Game.save.suit === s.id ? 'rgba(255,208,64,0.2)' : 'rgba(255,255,255,0.06)';
      ctx.fillRect(x, y, cw - 2, ch - 2);
      if (!st.own) ctx.globalAlpha = st.craft && st.ok ? 0.6 : 0.22;
      Rig.draw(ctx, x + 13, y + ch - 6, 1, Poses.idle(t + i), st.own || (st.craft && st.ok) ? s.palObj : FLASH_PAL, { scale: 1.05 });
      ctx.globalAlpha = 1;
      if (st.craft && !st.own) Font.draw(ctx, 'NV' + s.lvl, x + 13, y + 2, st.ok ? UI.gold : PS_COL.dim, { align: 'center' });
      if (Game.save.suit === s.id) { ctx.fillStyle = UI.gold; ctx.fillRect(x + 1, y + 1, 3, 3); }
    }
    // barra de desplazamiento
    const rows = Math.ceil(SUITS.length / C);
    ctx.fillStyle = '#2a2a40'; ctx.fillRect(gx + C * cw + 1, gy, 2, ch * 3);
    ctx.fillStyle = UI.gold; ctx.fillRect(gx + C * cw + 1, gy + this.scroll / rows * ch * 3, 2, 3 / rows * ch * 3);
    // ficha
    const s = SUITS[this.sel], st = this.status(s), px = 244;
    UI.panel(ctx, px, 38, W - px - 6, 162, 'rgba(20,24,48,0.9)');
    Rig.draw(ctx, px + 67, 110, Math.sin(t * 0.8) > 0 ? 1 : -1, Poses.idle(t), st.own || st.craft ? s.palObj : FLASH_PAL, { scale: 2.6 });
    let nm = s.name.toUpperCase(); while (Font.width(nm) > W - px - 12) nm = nm.slice(0, -1);
    Font.draw(ctx, nm, px + 67, 116, st.own ? UI.gold : UI.paper, { align: 'center' });
    Font.wrap(s.desc, W - px - 16).slice(0, 2).forEach((ln, i) => Font.draw(ctx, ln, px + 6, 128 + i * 9, '#b8b8d0', {}));
    const P = SUIT_POWERS[s.power];
    Font.draw(ctx, P.name.toUpperCase(), px + 6, 148, '#80e0ff', {});
    Font.wrap(P.desc, W - px - 16).slice(0, 3).forEach((ln, i) => Font.draw(ctx, ln, px + 6, 157 + i * 8, '#b8b8d0', {}));
    const stTxt = st.own ? (Game.save.suit === s.id ? 'PUESTO' : L('JUMP') + ' PONER') : st.craft ? 'CREAR: ' + s.tech + ' TEC NV' + s.lvl : st.story;
    Font.draw(ctx, stTxt, px + 6, 186, st.own ? '#80ff80' : st.craft && st.ok ? UI.gold : PS_COL.dim, {});
    const eq = Game.save.power ? SUIT_POWERS[Game.save.power].name : 'EL DEL TRAJE';
    Font.draw(ctx, 'PODER EQUIPADO: ' + eq.toUpperCase(), 10, 176, UI.gold, {});
    if (this.msg) Font.draw(ctx, this.msg, 10, 188, '#80ff80', {});
  }
  hints() { return [L('JUMP') + ' PONER / FABRICAR', L('ATTACK') + ' EQUIPAR PODER', L('SHOOT') + ' PODER DEL TRAJE', L('DODGE') + ' VOLVER']; }
}

// ------------------------------------------------------------------ RÉCORDS
class RecordsTab {
  constructor(M) { this.M = M; this.name = 'RÉCORDS'; }
  update() { return null; }
  draw(ctx, t) {
    const r = Game.save.records, s = Game.save;
    const rows = [
      ['NIVEL', s.level], ['COMBO MÁXIMO', 'x' + (r.maxCombo || 0)], ['ENEMIGOS DERROTADOS', Progress.stat('kos')], ['CRÍMENES DETENIDOS', Progress.stat('crimes')],
      ['JEFES DERROTADOS', r.bosses || 0], ['METROS BALANCEADO', Math.floor(r.swingDist || 0) + ' m'], ['MÁS TIEMPO EN EL AIRE', (r.airMax || 0) + ' s'],
      ['ESQUIVAS PERFECTAS', r.perfect || 0], ['GOLPES CON ARTILUGIOS', r.gadgetHits || 0], ['PODERES USADOS', r.powers || 0],
      ['FRAGMENTOS', Progress.stat('tokens') + '/' + STORY.fragments.length], ['TRAJES', SUITS.filter((x) => Progress.suitOwned(x)).length + '/' + SUITS.length],
    ];
    Font.draw(ctx, 'ESTADÍSTICAS', 10, 29, UI.gold, {});
    rows.forEach(([a, b], i) => { Font.draw(ctx, a, 10, 40 + i * 9, UI.paper, {}); Font.draw(ctx, String(b), 170, 40 + i * 9, UI.gold, { align: 'right' }); });
    Font.draw(ctx, 'MEJORES TIEMPOS', 10, 150, UI.gold, {});
    MISSIONS.forEach((m, i) => {
      const bt = s.bestTimes[i];
      const x = 10 + (i % 2) * 84, y = 160 + Math.floor(i / 2) * 9;
      Font.draw(ctx, (i === EXTRA_MISSION ? 'EX' : 'C' + (i + 1)) + ' ' + (bt ? Math.floor(bt / 60) + ':' + ('0' + (bt % 60)).slice(-2) : '--:--'), x, y, bt ? UI.paper : PS_COL.dim, {});
    });
    Font.draw(ctx, 'RETOS', 184, 29, UI.gold, {});
    CHALLENGES.forEach((ch, i) => {
      const y = 40 + i * 15, m = Progress.medal(ch), v = Progress.stat(ch.stat);
      for (let k = 0; k < 3; k++) { ctx.fillStyle = k < m ? MEDAL_COL[k] : '#2a2a40'; ctx.beginPath(); ctx.arc(188 + k * 7, y + 3, 3, 0, TAU); ctx.fill(); }
      Font.draw(ctx, ch.name.toUpperCase(), 210, y, m === 3 ? UI.gold : UI.paper, {});
      const goal = ch.goals[Math.min(m, 2)];
      UI.bar(ctx, 210, y + 9, 76, 2, Math.min(1, v / goal), m === 3 ? '#ffd040' : '#60c0ff');
      Font.draw(ctx, (m === 3 ? 'COMPLETO' : v + '/' + goal + (ch.unit || '')), W - 8, y + 7, UI.dim, { align: 'right' });
    });
  }
  hints() { return [L('DODGE') + ' VOLVER']; }
}

// ------------------------------------------------------------------ MULTIJUGADOR
// Hasta 4 jugadores. El J1 es quien abrió el menú; los demás se unen pulsando
// SALTAR en su propio mando (o en el teclado, si el J1 usa mando).
class CoopTab {
  constructor(M, standalone) {
    this.M = M; this.name = 'MULTIJUGADOR'; this.standalone = standalone;
    if (!Game.p1Dev) Game.p1Dev = M.openDev || 'kb';
    this.slots = Game.coop ? Game.coop.map((c) => ({ devs: c.devs.slice(), suit: c.suit })) : [{ devs: null, suit: Game.save.suit }];
    this.slots[0].devs = null; // J1: todo lo que no usen los demás
  }
  claimed() { const s = new Set(); this.slots.slice(1).forEach((sl) => sl.devs.forEach((d) => s.add(d))); return s; }
  ownedSuits() { return SUITS.filter((s) => Progress.suitOwned(s)); }
  cycle(sl, d) { const o = this.ownedSuits(); const i = o.findIndex((s) => s.id === sl.suit); sl.suit = o[(i + d + o.length) % o.length].id; Audio2.sfx('menu'); }
  update() {
    const claimed = this.claimed();
    for (const id in Input.dev) {
      const d = Input.dev[id];
      const slot = this.slots.findIndex((sl, i) => i > 0 && sl.devs.includes(id));
      if (slot < 0) {
        // unirse: cualquier dispositivo que no sea el del J1
        if (d.pressed.JUMP && id !== Game.p1Dev && !claimed.has(id) && this.slots.length < 4) {
          const used = new Set(this.slots.map((s) => s.suit));
          const free = this.ownedSuits().find((s) => !used.has(s.id)) || SUITS[0];
          this.slots.push({ devs: [id], suit: free.id });
          Audio2.sfx('select'); this.apply(); return null;
        }
        if (id === Game.p1Dev || (!claimed.has(id) && this.slots.length === 1)) {
          if (d.pressed.LEFT) this.cycle(this.slots[0], -1);
          if (d.pressed.RIGHT) this.cycle(this.slots[0], 1);
        }
      } else {
        const sl = this.slots[slot];
        if (d.pressed.LEFT) { this.cycle(sl, -1); this.apply(); }
        if (d.pressed.RIGHT) { this.cycle(sl, 1); this.apply(); }
        if (d.pressed.DODGE) { this.slots.splice(slot, 1); Audio2.sfx('back'); this.apply(); return null; }
      }
    }
    return null;
  }
  apply() {
    const claimed = this.claimed();
    if (this.slots.length < 2) { Game.coop = null; }
    else {
      // J1: su dispositivo + el teclado si nadie lo usa + mandos sin reclamar
      const p1 = Object.keys(Input.dev).filter((id) => !claimed.has(id));
      if (!p1.includes('kb') && !claimed.has('kb')) p1.push('kb');
      Game.coop = this.slots.map((sl, i) => ({ devs: i === 0 ? p1 : sl.devs, suit: sl.suit }));
    }
    if (this.slots[0].suit !== Game.save.suit && Progress.suitOwned(SUITS.find((s) => s.id === this.slots[0].suit))) Game.save.suit = this.slots[0].suit;
    const w = this.M && this.M.world;
    if (w) { w.setupPlayers(); if (!Game.coop && w.missionIdx !== EXTRA_MISSION) w.players[0].suitId = undefined; }
  }
  draw(ctx, t) {
    Font.draw(ctx, 'MULTIJUGADOR LOCAL · HASTA 4 JUGADORES', W / 2, 29, UI.gold, { align: 'center' });
    Font.draw(ctx, 'Cada amigo pulsa SALTAR en su propio mando para unirse.', W / 2, 40, UI.paper, { align: 'center' });
    const sw = (W - 20) / 4;
    for (let i = 0; i < 4; i++) {
      const x = 10 + i * sw, sl = this.slots[i];
      UI.panel(ctx, x + 2, 52, sw - 4, 136, sl ? 'rgba(20,24,48,0.95)' : 'rgba(20,24,48,0.5)');
      ctx.fillStyle = COOP_COLS[i]; ctx.fillRect(x + 2, 52, sw - 4, 3);
      Font.draw(ctx, 'JUGADOR ' + (i + 1), x + sw / 2, 59, COOP_COLS[i], { align: 'center' });
      if (!sl) {
        const blink = Math.floor(t * 2) % 2;
        Font.draw(ctx, 'PULSA', x + sw / 2, 100, blink ? UI.paper : UI.dim, { align: 'center' });
        Font.draw(ctx, 'SALTAR', x + sw / 2, 110, blink ? UI.gold : UI.dim, { align: 'center' });
        Font.draw(ctx, 'PARA UNIRTE', x + sw / 2, 120, blink ? UI.paper : UI.dim, { align: 'center' });
        continue;
      }
      const s = SUITS.find((q) => q.id === sl.suit) || SUITS[0];
      Rig.draw(ctx, x + sw / 2, 150, 1, i % 2 ? Poses.idle(t + i) : Poses.guard ? Poses.guard() : Poses.idle(t), s.palObj, { scale: 2.4 });
      const fit = (txt, wmax) => { let q = txt; while (Font.width(q) > wmax) q = q.slice(0, -1); return q; };
      const dev = i === 0 ? (Game.coop ? Input.devName(Game.p1Dev || 'kb') : 'TODOS') : sl.devs.map((d) => Input.devName(d)).join(' ');
      Font.draw(ctx, fit(dev, sw - 10), x + sw / 2, 68, UI.dim, { align: 'center' });
      Font.draw(ctx, '<', x + 6, 158, UI.gold, {}); Font.draw(ctx, '>', x + sw - 6, 158, UI.gold, { align: 'right' });
      Font.draw(ctx, fit(s.name.toUpperCase(), sw - 24), x + sw / 2, 158, UI.paper, { align: 'center' });
      Font.draw(ctx, fit(SUIT_POWERS[s.power].name.toUpperCase(), sw - 10), x + sw / 2, 168, '#80e0ff', { align: 'center' });
      if (i > 0) Font.draw(ctx, fit('ESQUIVAR: SALIR', sw - 8), x + sw / 2, 178, PS_COL.dim, { align: 'center' });
    }
    Font.draw(ctx, 'Los caídos vuelven a los 5 s.', W / 2, 192, UI.dim, { align: 'center' });
  }
  hints() { return ['IZQ/DER CAMBIA TRAJE', L('PAUSE') + ' LISTO']; }
}

// ------------------------------------------------------------------ SISTEMA
class SystemTab {
  constructor(M) {
    this.M = M; this.name = 'SISTEMA';
    const w = M.world, city = w.mode === 'city';
    const items = [
      { label: 'REANUDAR', act: () => { this.res = 'close'; } },
      { label: 'CONTROLES', act: () => M.push(new ControlsScreen()) },
      { label: 'OPCIONES', act: () => M.push(new OptionsScreen()) },
    ];
    if (city) items.push({ label: 'GUARDAR Y SALIR AL MENÚ', act: () => { Game.save.cityPos[w.universe] = w.player.x; Game.saveGame(); Game.toMenu(); } });
    else if (Game.save.stage === 0 || w.missionIdx === EXTRA_MISSION) items.push({ label: 'SALIR AL MENÚ PRINCIPAL', act: () => M.push(new ConfirmScreen('¿Salir al menú? Perderás el progreso de este capítulo.', () => Game.toMenu())) });
    else items.push({ label: 'ABANDONAR CAPÍTULO', act: () => M.push(new ConfirmScreen('¿Abandonar el capítulo? Volverás a la ciudad.', () => { const m = MISSIONS[w.missionIdx]; Game.goCity({ universe: m.universe, x: m.markerX ? m.markerX - 100 : undefined }); })) });
    this.menu = new Menu(items);
  }
  update(dt) { const r = this.menu.update(dt); if (this.res) { const x = this.res; this.res = null; return x; } return r === 'back' ? null : r; }
  draw(ctx, t) {
    this.menu.draw(ctx, W / 2, 60, t, { lh: 18 });
    const s = Game.save;
    Font.draw(ctx, 'TECNOLOGÍA ' + s.tech + '   FRAGMENTOS ' + s.tokens.length + '/' + STORY.fragments.length + '   CÁNONES ROTOS ' + canonCount() + '/' + CANON_ORDER.length, W / 2, 160, UI.dim, { align: 'center' });
    const w = this.M.world, U = UNIVERSES[w.universe];
    Font.draw(ctx, w.mode === 'mission' ? chapterLabel(w.missionIdx) + ': ' + MISSIONS[w.missionIdx].name : U.name + ' · ' + U.city, W / 2, 174, UI.gold, { align: 'center' });
  }
  hints() { return [L('JUMP') + ' ACEPTAR', L('DODGE') + ' VOLVER']; }
}

// ------------------------------------------------------------------ Menú principal
class PsMenu {
  constructor(world) {
    this.world = world; this.t = 0; this.sub = null;
    this.openDev = pressedDevice(['PAUSE']) || Game.p1Dev || 'kb';
    if (!Game.coop) Game.p1Dev = this.openDev;
    this.tabs = [new MapTab(this), new SkillsTab(this), new GadgetsTab(this), new SuitsTab(this), new RecordsTab(this), new CoopTab(this), new SystemTab(this)];
    this.tab = 0; this.lock = 0.15;
    Audio2.musicGain && (Audio2.musicGain.gain.value = Game.settings.music / 10 * 0.2);
  }
  push(s) { this.sub = new MenuStack(s); }
  close() { Game.applySettings(); Game.saveGame(); return 'close'; }
  update(dt) {
    this.t += dt;
    if (this.lock > 0) { this.lock -= dt; return null; }
    if (this.sub) { const r = this.sub.update(dt); if (r === 'close') this.sub = null; return null; }
    const tab = this.tabs[this.tab];
    const prev = Input.pressed('SPECIAL') || (Input.keys.KeyQ && Input.pressed('SPECIAL'));
    const next = Input.pressed('WEB') || Input.pressed('ALLY');
    if (prev || next) { this.tab = (this.tab + (next ? 1 : this.tabs.length - 1)) % this.tabs.length; Audio2.sfx('menu'); return null; }
    const tabTap = Input.tap && Input.tap.y < 22;
    if (tabTap) { const i = Math.floor(Input.takeTap().x / (W / this.tabs.length)); if (this.tabs[i]) { this.tab = i; Audio2.sfx('menu'); } return null; }
    const r = tab.update(dt);
    if (r === 'close') return this.close();
    if (Input.pressed('PAUSE') || (!(tab instanceof CoopTab) && !(tab instanceof SystemTab) && Input.back())) return this.close();
    if (tab instanceof SystemTab && Input.back()) return this.close();
    return null;
  }
  draw(ctx, t) {
    psBackground(ctx, this.t);
    // barra de pestañas
    const tw = W / this.tabs.length;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, W, 20);
    const short = { HABILIDADES: 'HABILID.', ARTILUGIOS: 'ARTILUG.', MULTIJUGADOR: 'MULTIJ.' };
    this.tabs.forEach((tb, i) => {
      const act = i === this.tab, x = i * tw;
      if (act) { ctx.fillStyle = 'rgba(224,32,44,0.8)'; ctx.fillRect(x, 0, tw, 20); ctx.fillStyle = '#ffffff'; ctx.fillRect(x, 18, tw, 2); }
      Font.draw(ctx, short[tb.name] || tb.name, x + tw / 2, 7, act ? '#ffffff' : '#8a8aa8', { align: 'center' });
    });
    const tab = this.tabs[this.tab];
    tab.draw(ctx, this.t);
    psHints(ctx, tab.hints().concat([(Input.lastDevice === 'pad' ? 'L1/R1' : 'Q/E') + ' PESTAÑAS']));
    if (this.sub) this.sub.draw(ctx, t);
  }
}

// Lobby de multijugador desde el menú principal (sin partida en curso)
class CoopLobbyScreen {
  constructor() { this.t = 0; this.M = { world: null, openDev: pressedDevice(['JUMP']) || 'kb' }; Game.p1Dev = this.M.openDev; this.tab = new CoopTab(this.M, true); this.lock = 0.2; }
  update(dt) {
    this.t += dt;
    if (this.lock > 0) { this.lock -= dt; return null; }
    this.tab.update(dt);
    if (Input.pressed('PAUSE')) { Audio2.sfx('select'); return 'back'; }
    return null;
  }
  draw(ctx) { psBackground(ctx, this.t); ctx.fillStyle = 'rgba(224,32,44,0.8)'; ctx.fillRect(0, 0, W, 20); Font.draw(ctx, 'MULTIJUGADOR', W / 2, 7, '#ffffff', { align: 'center' }); this.tab.draw(ctx, this.t); psHints(ctx, ['IZQ/DER CAMBIA TRAJE', L('PAUSE') + ' LISTO (LUEGO ELIGE CONTINUAR)']); }
}
