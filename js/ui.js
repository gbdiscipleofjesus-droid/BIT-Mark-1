'use strict';
// ---------------------------------------------------------------------------
// Interfaz: menús, diálogos, HUD y controles táctiles
// ---------------------------------------------------------------------------
const UI = {
  red: '#e0202c', blue: '#2046c8', ink: '#140a12', paper: '#f4f0e8', gold: '#ffd040', dim: '#8a8aa0',

  panel(ctx, x, y, w, h, fill = 'rgba(12,10,24,0.88)', border = '#f4f0e8') {
    ctx.fillStyle = fill; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = border;
    ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x, y, 1, h); ctx.fillRect(x + w - 1, y, 1, h);
    ctx.fillStyle = UI.red; ctx.fillRect(x + 2, y + 2, 3, 1); ctx.fillRect(x + 2, y + 2, 1, 3);
    ctx.fillRect(x + w - 5, y + h - 3, 3, 1); ctx.fillRect(x + w - 3, y + h - 5, 1, 3);
  },

  bar(ctx, x, y, w, h, v, col, bg = '#2a1a24') {
    ctx.fillStyle = UI.ink; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = bg; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = col; ctx.fillRect(x, y, Math.round(w * clamp(v, 0, 1)), h);
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x, y, Math.round(w * clamp(v, 0, 1)), 1);
  },

  // Recuadro de narración de cómic (amarillo con borde negro)
  caption(ctx, x, y, w, h) {
    ctx.fillStyle = '#000000'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = '#f8e058'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#fff4a8'; ctx.fillRect(x, y, w, 1);
    ctx.fillStyle = '#c8a830'; ctx.fillRect(x, y + h - 1, w, 1);
  },
  // Bocadillo blanco redondeado con cola hacia (tx, ty)
  balloon(ctx, x, y, w, h, tx, ty) {
    const path = (grow) => {
      const r = 8 + grow;
      ctx.beginPath();
      ctx.moveTo(x + r - grow, y - grow); ctx.lineTo(x + w - r + grow, y - grow); ctx.quadraticCurveTo(x + w + grow, y - grow, x + w + grow, y + r - grow);
      ctx.lineTo(x + w + grow, y + h - r + grow); ctx.quadraticCurveTo(x + w + grow, y + h + grow, x + w - r + grow, y + h + grow);
      ctx.lineTo(x + r - grow, y + h + grow); ctx.quadraticCurveTo(x - grow, y + h + grow, x - grow, y + h - r + grow);
      ctx.lineTo(x - grow, y + r - grow); ctx.quadraticCurveTo(x - grow, y - grow, x + r - grow, y - grow); ctx.closePath();
    };
    const tail = (grow) => { ctx.beginPath(); ctx.moveTo(x + 14 - grow, y + h - 2); ctx.lineTo(tx, ty); ctx.lineTo(x + 30 + grow, y + h - 2); ctx.closePath(); };
    ctx.fillStyle = '#000000'; path(1.5); ctx.fill(); tail(1.5); ctx.fill();
    ctx.fillStyle = '#ffffff'; path(0); ctx.fill(); tail(0); ctx.fill();
  },
  // Viñeta de cómic con marco blanco (para retratos)
  comicPanel(ctx, x, y, w, h) {
    ctx.fillStyle = '#000000'; ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = '#000000'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  },

  spiderIcon(ctx, x, y, col = '#140a12') {
    ctx.fillStyle = col;
    ctx.fillRect(x + 3, y, 2, 7); ctx.fillRect(x + 2, y + 2, 4, 3);
    ctx.fillRect(x, y + 1, 2, 1); ctx.fillRect(x + 6, y + 1, 2, 1);
    ctx.fillRect(x, y + 5, 2, 1); ctx.fillRect(x + 6, y + 5, 2, 1);
    ctx.fillRect(x + 1, y + 3, 1, 1); ctx.fillRect(x + 6, y + 3, 1, 1);
  },

  // Etiqueta de botón según el dispositivo en uso
  button(ctx, action, x, y) {
    const lab = Input.label(action);
    const w = Font.width(lab) + 6;
    ctx.fillStyle = UI.paper; ctx.fillRect(x, y - 2, w, 11);
    ctx.fillStyle = UI.ink; ctx.fillRect(x + 1, y - 1, w - 2, 9);
    Font.draw(ctx, lab, x + 3, y, UI.paper);
    return w;
  },
};

// ---------------------------------------------------------------------------
class Menu {
  constructor(items, opts = {}) {
    this.items = items; this.sel = 0; this.opts = opts; this.rects = [];
    this.skipDisabled(1);
  }
  label(it) { return typeof it.label === 'function' ? it.label() : it.label; }
  isDisabled(it) { return it.disabled && it.disabled(); }
  skipDisabled(dir) {
    for (let i = 0; i < this.items.length; i++) {
      if (!this.isDisabled(this.items[this.sel])) return;
      this.sel = (this.sel + dir + this.items.length) % this.items.length;
    }
  }
  move(dir) {
    this.sel = (this.sel + dir + this.items.length) % this.items.length;
    this.skipDisabled(dir);
    Audio2.sfx('menu');
  }
  // devuelve 'back' si se pidió volver
  update(dt) {
    if (Input.menu('up', dt)) this.move(-1);
    if (Input.menu('down', dt)) this.move(1);
    const it = this.items[this.sel];
    if (it && it.left && Input.menu('left', dt)) { it.left(); Audio2.sfx('menu'); }
    if (it && it.right && Input.menu('right', dt)) { it.right(); Audio2.sfx('menu'); }
    const tap = Input.takeTap();
    if (tap) {
      for (let i = 0; i < this.rects.length; i++) {
        const r = this.rects[i];
        if (r && tap.x >= r.x && tap.x <= r.x + r.w && tap.y >= r.y && tap.y <= r.y + r.h && !this.isDisabled(this.items[i])) {
          if (this.sel === i || !(this.items[i].left || this.items[i].right)) {
            this.sel = i;
            const t = this.items[i];
            if (t.right && !t.act) { t.right(); Audio2.sfx('menu'); }
            else if (t.act) { Audio2.sfx('select'); t.act(); }
            return null;
          }
          this.sel = i; Audio2.sfx('menu');
          return null;
        }
      }
    }
    if (Input.confirm() && it && !this.isDisabled(it)) {
      if (it.act) { Audio2.sfx('select'); it.act(); }
      else if (it.right) { it.right(); Audio2.sfx('menu'); }
      return null;
    }
    if (Input.back()) { Audio2.sfx('back'); return 'back'; }
    return null;
  }
  draw(ctx, x, y, t, o = {}) {
    const lh = o.lh || 14;
    const align = o.align || 'center';
    this.rects = [];
    this.items.forEach((it, i) => {
      const s = this.label(it);
      const sel = i === this.sel;
      const dis = this.isDisabled(it);
      const col = dis ? '#50506a' : sel ? UI.gold : UI.paper;
      const yy = y + i * lh;
      const w = Font.width(s);
      const x0 = align === 'center' ? x - w / 2 : x;
      if (sel) {
        ctx.fillStyle = 'rgba(224,32,44,0.35)';
        ctx.fillRect(x0 - 8, yy - 3, w + 16, 11);
        const bob = Math.floor(t * 4) % 2;
        UI.spiderIcon(ctx, x0 - 16 - bob, yy - 1, UI.red);
      }
      Font.draw(ctx, s, x0, yy, col, { shadow: UI.ink });
      this.rects.push({ x: x0 - 20, y: yy - 4, w: w + 40, h: lh });
    });
  }
}

// ---------------------------------------------------------------------------
class Dialog {
  constructor(lines, onDone) {
    this.lines = lines.map(([who, text]) => ({ who, text }));
    this.i = 0; this.chars = 0; this.onDone = onDone; this.done = false; this.t = 0; this.spoken = -1;
  }
  get cur() { return this.lines[this.i]; }
  update(dt) {
    if (this.done) return;
    this.t += dt;
    const cur = this.cur;
    if (this.spoken !== this.i) { this.spoken = this.i; Voice.speak(cur.who, cur.text); }
    const prev = Math.floor(this.chars);
    this.chars = Math.min(cur.text.length, this.chars + dt * 55);
    if (Math.floor(this.chars) !== prev && Math.floor(this.chars) % 3 === 0) Audio2.sfx('type');
    const tap = Input.takeTap();
    const adv = Input.confirm() || Input.pressed('ATTACK') || !!tap;
    if (Input.pressed('PAUSE') || (Input.menuKeys && Input.menuKeys.back)) { this.finish(); return; }
    if (adv && this.t > 0.15) {
      if (this.chars < cur.text.length) this.chars = cur.text.length;
      else {
        this.i++; this.chars = 0; this.t = 0;
        if (this.i >= this.lines.length) this.finish();
      }
    }
  }
  finish() {
    if (this.done) return;
    this.done = true;
    Voice.stop();
    if (this.onDone) this.onDone();
  }
  draw(ctx, t) {
    if (this.done) return;
    const cur = this.cur;
    const who = WHO[cur.who] || WHO.narr;
    const text = cur.text.slice(0, Math.floor(this.chars));
    if (cur.who === 'narr') {
      // narración: página de cómic oscura con recuadro amarillo
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, H);
      const lines = Font.wrap(cur.text, 280);
      const bh = lines.length * 11 + 12, bw = 296;
      const bx = Math.round(W / 2 - bw / 2), by = Math.round(H / 2 - bh / 2);
      UI.caption(ctx, bx, by, bw, bh);
      let left = Math.floor(this.chars);
      lines.forEach((ln, i) => {
        const part = ln.slice(0, Math.max(0, left));
        left -= ln.length + 1;
        Font.draw(ctx, part, bx + 8, by + 7 + i * 11, '#1a1008');
      });
    } else {
      // diálogo: viñeta con el retrato y bocadillo blanco
      const px = 10, py = 150, ps = 48;
      if (who.portrait) {
        UI.comicPanel(ctx, px, py, ps, ps);
        ctx.drawImage(Portraits.get(who.portrait), px, py, ps, ps);
      }
      const bx = who.portrait ? px + ps + 16 : 16, bw = W - bx - 12;
      const lines = Font.wrap(cur.text, bw - 16).slice(0, 4);
      const bh = Math.max(36, lines.length * 10 + 22), by = H - bh - 12;
      UI.balloon(ctx, bx, by, bw, bh, who.portrait ? px + ps + 2 : bx + 10, who.portrait ? py + 18 : by + bh + 8);
      UI.caption(ctx, bx + 6, by - 7, Font.width(who.name) + 8, 11);
      Font.draw(ctx, who.name, bx + 10, by - 5, '#1a1008');
      let left = Math.floor(this.chars);
      lines.forEach((ln, i) => {
        const part = ln.slice(0, Math.max(0, left));
        left -= ln.length + 1;
        Font.draw(ctx, part, bx + 8, by + 10 + i * 10, '#101018');
      });
    }
    if (this.chars >= cur.text.length && Math.floor(t * 3) % 2) {
      ctx.fillStyle = UI.red; ctx.fillRect(W - 26, H - 20, 5, 2); ctx.fillRect(W - 25, H - 18, 3, 1); ctx.fillRect(W - 24, H - 17, 1, 1);
    }
    Font.draw(ctx, '[' + Input.label('PAUSE') + '] SALTAR', W - 6, 4, '#8a8aa0', { align: 'right', shadow: UI.ink });
  }
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
// Barra de 16 bits: marco negro, relleno con brillo y marcas cada 8 píxeles
function mcBar(ctx, x, y, w, h, v, col, hi) {
  ctx.fillStyle = '#000000'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = '#3a1418'; ctx.fillRect(x, y, w, h);
  const f = Math.round(w * clamp(v, 0, 1));
  ctx.fillStyle = col; ctx.fillRect(x, y, f, h);
  ctx.fillStyle = hi; ctx.fillRect(x, y, f, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x, y + h - 1, f, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  for (let i = 8; i < w; i += 8) ctx.fillRect(x + i, y, 1, h);
}
const GRUNT_NAMES = { thug: ['PANDILLERO', 'MATÓN', 'CARTERISTA', 'PUNK', 'GORILA', 'MALEANTE'], gunner: ['PISTOLERO', 'TIRADOR'], brute: ['GRANDULLÓN', 'TORO'], zombie: ['ZOMBI'], chitauri: ['CHITAURI'], bat: ['BATEADOR'] };
function enemyLabel(e) {
  if (e.name) return e.name;
  const L = GRUNT_NAMES[e.type];
  return L ? L[e.id % L.length] : String(e.type || 'ENEMIGO').toUpperCase();
}
function drawHUD(ctx, w, t) {
  const p = w.player;
  // Vida (estilo Maximum Carnage: cara, nombre y barras largas)
  UI.comicPanel(ctx, 6, 6, 20, 20);
  ctx.drawImage(Portraits.get('spidey'), 6, 6, 20, 20);
  Font.draw(ctx, 'SPIDER-MAN', 32, 4, '#ffffff', { outline: '#000000' });
  const low = p.hp / p.maxHp < 0.3 && Math.floor(t * 6) % 2;
  mcBar(ctx, 32, 14, 84, 6, p.hp / p.maxHp, low ? '#ff9090' : '#e82828', '#ff8a6a');
  Font.draw(ctx, 'RED', 32, 22, '#9ad8ff', { outline: '#000000' });
  for (let i = 0; i < p.maxWebs; i++) {
    ctx.fillStyle = '#000000'; ctx.fillRect(51 + i * 6, 22, 5, 5);
    ctx.fillStyle = i < p.webs ? '#e8f4ff' : '#2a2a3a'; ctx.fillRect(52 + i * 6, 23, 3, 3);
  }
  mcBar(ctx, 32 + 52, 23, 32, 3, p.focus / 100, p.focus >= 50 ? '#ffd040' : '#b08a30', '#fff0a0');
  // Nivel y experiencia
  const sv = Game.save;
  UI.bar(ctx, 6, 31, 110, 1, (sv.xp || 0) / Progress.xpNeed(sv.level || 1), '#60c0ff');
  Font.draw(ctx, 'NV ' + (sv.level || 1) + (sv.skillPts ? '  +' + sv.skillPts + ' PH' : ''), 6, 34, sv.skillPts ? UI.gold : '#a0c8ff', { outline: '#000000' });
  // Compañeros (multijugador)
  if (w.coop) {
    const cols = ['#ff5060', '#40b0ff', '#60e070', '#ffd040'];
    w.players.slice(1).forEach((q, i) => {
      const x = 120 + i * 50, y = 14;
      UI.panel(ctx, x, y, 47, 13, 'rgba(12,10,24,0.7)');
      Font.draw(ctx, 'J' + (q.idx + 1), x + 3, y + 3, cols[q.idx], {});
      if (q.state === 'dead') Font.draw(ctx, q.reviveT > 0 ? Math.ceil(q.reviveT) + 's' : 'KO', x + 17, y + 3, '#ff8080', {});
      else { UI.bar(ctx, x + 16, y + 3, 28, 3, q.hp / q.maxHp, UI.red); UI.bar(ctx, x + 16, y + 8, 28, 2, q.focus / 100, UI.gold); }
    });
  }
  // Artilugio y poder del traje
  {
    const g = GADGETS.find((x) => x.id === Gadgets.selected(p));
    const bossOn = w.boss && !w.boss.dead && w.boss.state !== 'wait';
    const gx = W - 133, gy = H - 26;
    if (g && Progress.gadgetUnlocked(g) && !w.dialog) {
      UI.panel(ctx, gx, gy, 128, 22, 'rgba(12,10,24,0.7)');
      ctx.fillStyle = g.color; ctx.fillRect(gx + 3, gy + 3, 7, 7); ctx.fillStyle = UI.ink; ctx.fillRect(gx + 5, gy + 5, 3, 3);
      Font.draw(ctx, g.name.toUpperCase(), gx + 13, gy + 3, UI.paper, {});
      const max = Progress.gadgetMax(g), ch = (p.gch && p.gch[g.id]) || 0;
      for (let i = 0; i < max; i++) { ctx.fillStyle = i < ch ? g.color : '#3a3a4a'; ctx.fillRect(gx + 124 - (max - i) * 5, gy + 4, 3, 4); }
      // poder del traje
      const pw = SUIT_POWERS[SuitPowers.current(p)], rdy = !(p.powerCd > 0);
      Font.draw(ctx, (rdy ? '' : Math.ceil(p.powerCd) + 's ') + pw.name.toUpperCase(), gx + 13, gy + 13, rdy ? UI.gold : UI.dim, {});
      ctx.fillStyle = rdy ? UI.gold : '#3a3a4a'; ctx.fillRect(gx + 4, gy + 14, 5, 5);
    }
  }
  // Refuerzo multiversal
  if (w.allyList && w.allyList().length) {
    const ready = w.allyCd <= 0 && !w.ally;
    const ix = w.mode === "city" ? 272 : 122, iy = 6;
    ctx.fillStyle = UI.ink; ctx.fillRect(ix - 1, iy - 1, 16, 16);
    ctx.fillStyle = ready ? (Math.floor(t * 3) % 2 ? '#60ffe0' : '#ff40c0') : '#2a2a3a'; ctx.fillRect(ix, iy, 14, 14);
    if (!ready) { const f = clamp(1 - w.allyCd / ALLY_CD, 0, 1); ctx.fillStyle = '#60ffe0'; ctx.fillRect(ix, iy + 14 - Math.round(14 * f), 14, Math.round(14 * f)); }
    UI.spiderIcon(ctx, ix + 3, iy + 4, UI.ink);
    Font.draw(ctx, Input.label('ALLY'), ix + 7, iy + 17, ready ? UI.paper : UI.dim, { align: 'center', shadow: UI.ink });
  }
  // Tecnología
  const tech = String(Game.save.tech);
  const tw = Font.width(tech) + 16;
  UI.panel(ctx, W - tw - 6, 3, tw + 3, 13, 'rgba(12,10,24,0.7)');
  drawTechIcon(ctx, W - tw - 2, 6, t);
  Font.draw(ctx, tech, W - 6, 6, UI.gold, { align: 'right' });
  // Cánones rotos
  { const n = canonCount(); if (n > 0 && w.missionIdx !== EXTRA_MISSION) { Font.draw(ctx, 'CANON ' + n + '/' + CANON_ORDER.length, W - 6, 20, '#ff60c0', { align: 'right', shadow: UI.ink }); } }
  // Combo
  if (w.combo.n >= 3) {
    const s = 'x' + w.combo.n;
    const cy = w.boss && !w.boss.dead && w.boss.state !== 'wait' ? 26 : 0;
    Font.draw(ctx, s, W - 8, 42 + cy, UI.gold, { align: 'right', scale: 2, shadow: UI.ink });
    Font.draw(ctx, 'COMBO', W - 8, 60 + cy, UI.paper, { align: 'right', shadow: UI.ink });
  }
  // Minimapa de la ciudad
  if (w.mode === 'city') {
    const mx = 120, my = 5, mw = 144;
    ctx.fillStyle = 'rgba(12,10,24,0.75)'; ctx.fillRect(mx - 2, my - 2, mw + 4, 9);
    ctx.fillStyle = '#2a3050'; ctx.fillRect(mx, my + 2, mw, 1);
    const sx = (x) => mx + Math.round(x / w.level.width * mw);
    if (w.universe === '616') { ctx.fillStyle = '#4a6aa0'; ctx.fillRect(sx(2620), my + 1, sx(3520) - sx(2620), 3); }
    if (w.markerX) { ctx.fillStyle = Math.floor(t * 4) % 2 ? '#60e0ff' : '#2080c0'; ctx.fillRect(sx(w.markerX) - 1, my - 1, 3, 7); }
    if (w.crime) { ctx.fillStyle = Math.floor(t * 6) % 2 ? '#ff3030' : '#ffffff'; ctx.fillRect(sx(w.crime.x) - 1, my, 3, 5); }
    ctx.fillStyle = '#ffffff'; ctx.fillRect(sx(p.cx) - 1, my, 2, 5);
  }
  // Objetivo
  if (w.objective) {
    Font.draw(ctx, w.objective, 6, 44, UI.paper, { outline: '#000000' });
  }
  if (w.crime) {
    const c = w.crime;
    const s = Math.max(0, Math.ceil(c.t));
    const lbl = 'CRIMEN: ' + c.label + '  ' + Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
    Font.draw(ctx, lbl, 6, w.objective ? 55 : 44, '#ff6060', { outline: '#000000' });
  }
  // Jefe
  // enemigo actual: nombre y barra arriba a la derecha (como en Maximum Carnage)
  {
    const bossOn = w.boss && !w.boss.dead && w.boss.state !== 'wait';
    const e = bossOn ? w.boss : (w.lastHitT > 0 && w.lastHitE && !w.lastHitE.remove ? w.lastHitE : null);
    if (e) {
      const bw = bossOn ? 130 : 84, bx = W - bw - 8, by = 32;
      Font.draw(ctx, enemyLabel(e), W - 8, by - 10, bossOn ? '#ffd040' : '#ffffff', { align: 'right', outline: '#000000' });
      mcBar(ctx, bx, by, bw, bossOn ? 6 : 4, Math.max(0, e.hp) / e.maxHp, e.phase === 2 ? '#ff7020' : '#e0c020', '#fff0a0');
    }
  }
  // Consejo
  if (w.tip) {
    const lines = Font.wrap(w.tip.text, 250);
    const bh = lines.length * 10 + 8;
    const by = w.mode === 'city' ? 50 : 40;
    ctx.globalAlpha = Math.min(1, w.tip.t * 3, (w.tip.dur - w.tip.t + 0.3) * 3);
    UI.caption(ctx, W / 2 - 132, by + 20, 264, bh);
    lines.forEach((ln, i) => Font.draw(ctx, ln, W / 2, by + 25 + i * 10, '#1a1008', { align: 'center' }));
    ctx.globalAlpha = 1;
  }
  // Radio / comunicaciones (no bloquea)
  if (w.radio) {
    const r = w.radio;
    const who = WHO[r.who];
    const lines = Font.wrap(r.text, 190).slice(0, 4);
    const bh = Math.max(34, lines.length * 10 + 16);
    const bx = W - 236, by = H - bh - 6 - (w.boss ? 22 : 0);
    UI.panel(ctx, bx, by, 230, bh, 'rgba(40,10,14,0.9)', '#ffb0b0');
    ctx.drawImage(Portraits.get(who.portrait), bx + 4, by + 5, 24, 24);
    Font.draw(ctx, who.name, bx + 32, by + 4, UI.gold);
    lines.forEach((ln, i) => Font.draw(ctx, ln, bx + 32, by + 15 + i * 10, UI.paper));
  }
  // Textos flotantes
  for (const f of w.floats) {
    const x = Math.round((f.x - w.cam.x) * ZOOM), y = Math.round((f.y - w.cam.y) * ZOOM);
    ctx.globalAlpha = Math.min(1, f.life * 2);
    Font.draw(ctx, f.text, x, y, f.color, { align: 'center', outline: UI.ink });
    ctx.globalAlpha = 1;
  }
  // Tarjeta de título
  if (w.card && w.card.t < w.card.dur) {
    const c = w.card;
    const a = Math.min(1, c.t * 3, (c.dur - c.t) * 2);
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 76, W, 52);
    ctx.fillStyle = UI.red; ctx.fillRect(0, 76, W, 2); ctx.fillRect(0, 126, W, 2);
    Font.draw(ctx, c.small, W / 2, 84, UI.gold, { align: 'center' });
    Font.draw(ctx, c.big, W / 2, 98, UI.paper, { align: 'center', scale: 2, shadow: UI.ink });
    if (c.sub) Font.draw(ctx, c.sub, W / 2, 116, '#b0b0c8', { align: 'center' });
    ctx.globalAlpha = 1;
  }
}

function drawTouch(ctx) {
  if (!Input.showTouch()) return;
  ctx.globalAlpha = 0.45;
  const st = Input.touch.stick;
  const ox = st ? st.ox : 52, oy = st ? st.oy : 172;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(ox, oy, 22, 0, TAU); ctx.fill();
  ctx.fillStyle = '#140a12';
  ctx.beginPath(); ctx.arc(ox, oy, 20, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffffff';
  const kx = st ? clamp(st.x - st.ox, -16, 16) : 0, ky = st ? clamp(st.y - st.oy, -16, 16) : 0;
  ctx.beginPath(); ctx.arc(ox + kx, oy + ky, 9, 0, TAU); ctx.fill();
  for (const b of TOUCH_BTNS) {
    const on = Input.touch.buttons[b.id];
    ctx.fillStyle = on ? UI.gold : '#ffffff';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
    ctx.fillStyle = b.id === 'WEB' ? UI.red : '#140a12';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r - 2, 0, TAU); ctx.fill();
    Font.draw(ctx, b.label, b.x, b.y - 3, '#ffffff', { align: 'center' });
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// Destellos antes de un evento canónico
// ---------------------------------------------------------------------------
const FLASH_WORDS = ['CANON', '¿Y SI...?', 'NO PUEDES SALVARLOS A TODOS', 'EVENTO CANÓNICO', 'TODO SE ROMPE', 'DOOM ESPERA', 'ANOMALÍA', 'OTRA VEZ NO'];
class FlashSeq {
  constructor(ids, onDone) {
    this.ids = ids; this.onDone = onDone; this.t = 0; this.done = false;
    this.intro = 0.5; this.each = 0.24;
    this.total = this.intro + ids.length * this.each + 0.4;
    this.last = -1;
    Audio2.sfx('glitch');
  }
  update(dt) {
    if (this.done) return;
    this.t += dt;
    const i = Math.floor((this.t - this.intro) / this.each);
    if (i !== this.last && i >= 0 && i < this.ids.length) { this.last = i; Audio2.sfx(i % 2 ? 'glitch' : 'beat'); Input.rumble(0.3, 0.6, 80); }
    if (this.t >= this.total) { this.done = true; this.onDone(); }
  }
  draw(ctx, t) {
    const lt = this.t;
    if (lt < this.intro) {
      ctx.fillStyle = 'rgba(255,255,255,' + (lt / this.intro * 0.9).toFixed(2) + ')';
      ctx.fillRect(0, 0, W, H);
      return;
    }
    const i = Math.min(this.ids.length - 1, Math.floor((lt - this.intro) / this.each));
    if (lt > this.intro + this.ids.length * this.each) {
      ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, W, H);
      return;
    }
    const local = (lt - this.intro) % this.each;
    FlashArt.draw(ctx, this.ids[i], local);
    // interferencia
    for (let k = 0; k < 6; k++) {
      const y = Math.floor(hash2(i, k) * H), h = 2 + Math.floor(hash2(k, i) * 8);
      const off = Math.round((hash2(k + i, 7) - 0.5) * 30);
      ctx.drawImage(ctx.canvas, 0, y * RES, W * RES, h * RES, off, y, W, h);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = 0; y < H; y += 2) ctx.fillRect(0, y, W, 1);
    ctx.fillStyle = i % 2 ? 'rgba(255,0,80,0.12)' : 'rgba(0,255,220,0.10)';
    ctx.fillRect(0, 0, W, H);
    if (local < 0.05) { ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(0, 0, W, H); }
    const word = FLASH_WORDS[Math.floor(hash2(i, 3) * FLASH_WORDS.length)];
    if (i % 2 === 1) Font.draw(ctx, word, W / 2, 20 + Math.floor(hash2(i, 9) * 160), '#ffffff', { align: 'center', scale: 2, outline: '#000000' });
  }
}

// ---------------------------------------------------------------------------
// Decisión (evento canónico / final)
// ---------------------------------------------------------------------------
class ChoiceBox {
  constructor(title, text, options, onPick) {
    this.title = title; this.text = text; this.options = options; this.onPick = onPick; this.t = 0; this.picked = false;
    this.menu = new Menu(options.map((o) => ({ label: o.label, act: () => this.pick(o.id) })));
  }
  pick(id) {
    if (this.picked || this.t < 0.6) return;
    this.picked = true;
    this.onPick(id);
  }
  update(dt) {
    this.t += dt;
    if (this.t < 0.6) { Input.takeTap(); return; }
    this.menu.update(dt);
  }
  draw(ctx, t) {
    ctx.fillStyle = 'rgba(4,2,10,0.92)'; ctx.fillRect(0, 0, W, H);
    // grietas en los bordes
    ctx.fillStyle = Math.floor(t * 6) % 2 ? '#60ffe0' : '#ff40c0';
    for (let i = 0; i < 20; i++) {
      const x = Math.floor(hash2(i, 1) * W), y = Math.floor(hash2(1, i) * H);
      if (x > 40 && x < W - 40 && y > 30 && y < H - 30) continue;
      ctx.fillRect(x, y, 1 + (i % 3), 1);
    }
    const a = Math.min(1, this.t * 2);
    ctx.globalAlpha = a;
    Font.draw(ctx, this.title, W / 2, 26, '#ff60c0', { align: 'center', shadow: '#000000' });
    Font.wrap(this.text, 300).forEach((ln, i) => Font.draw(ctx, ln, W / 2, 48 + i * 11, UI.paper, { align: 'center' }));
    const n = canonCount();
    Font.draw(ctx, 'CÁNONES ROTOS: ' + n + '/' + CANON_ORDER.length, W / 2, 100, '#60ffe0', { align: 'center' });
    for (let i = 0; i < CANON_ORDER.length; i++) { ctx.fillStyle = i < n ? '#ff60c0' : '#2a2a3a'; ctx.fillRect(W / 2 - CANON_ORDER.length * 5 + i * 10, 112, 7, 4); }
    this.menu.draw(ctx, W / 2, 132, t, { lh: 18 });
    ctx.globalAlpha = 1;
  }
}
