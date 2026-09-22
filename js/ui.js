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
    this.i = 0; this.chars = 0; this.onDone = onDone; this.done = false; this.t = 0;
  }
  get cur() { return this.lines[this.i]; }
  update(dt) {
    if (this.done) return;
    this.t += dt;
    const cur = this.cur;
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
    if (this.onDone) this.onDone();
  }
  draw(ctx, t) {
    if (this.done) return;
    const cur = this.cur;
    const who = WHO[cur.who] || WHO.narr;
    const text = cur.text.slice(0, Math.floor(this.chars));
    if (cur.who === 'narr') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H);
      const lines = Font.wrap(cur.text, 300);
      const y0 = Math.round(H / 2 - lines.length * 6);
      let left = Math.floor(this.chars);
      lines.forEach((ln, i) => {
        const part = ln.slice(0, Math.max(0, left));
        left -= ln.length + 1;
        const x0 = Math.round(W / 2 - Font.width(ln) / 2);
        Font.draw(ctx, part, x0, y0 + i * 12, UI.paper, { shadow: UI.ink });
      });
    } else {
      const bx = 8, by = 148, bw = W - 16, bh = 60;
      UI.panel(ctx, bx, by, bw, bh);
      let tx = bx + 8;
      if (who.portrait) {
        ctx.drawImage(Portraits.get(who.portrait), bx + 6, by + 8, 24, 24);
        tx = bx + 38;
      }
      Font.draw(ctx, who.name, tx, by + 7, UI.gold, { shadow: UI.ink });
      const lines = Font.wrap(cur.text, bw - (tx - bx) - 10);
      let left = Math.floor(this.chars);
      lines.slice(0, 4).forEach((ln, i) => {
        const part = ln.slice(0, Math.max(0, left));
        left -= ln.length + 1;
        Font.draw(ctx, part, tx, by + 20 + i * 10, UI.paper);
      });
    }
    if (this.chars >= cur.text.length && Math.floor(t * 3) % 2) {
      ctx.fillStyle = UI.gold; ctx.fillRect(W - 20, 200, 5, 2); ctx.fillRect(W - 19, 202, 3, 1); ctx.fillRect(W - 18, 203, 1, 1);
    }
    Font.draw(ctx, '[' + Input.label('PAUSE') + '] SALTAR', W - 6, 4, '#8a8aa0', { align: 'right', shadow: UI.ink });
  }
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
function drawHUD(ctx, w, t) {
  const p = w.player;
  // Vida
  UI.panel(ctx, 3, 3, 96, 24, 'rgba(12,10,24,0.7)');
  ctx.drawImage(Portraits.get('spidey'), 6, 6, 18, 18);
  UI.bar(ctx, 28, 7, 66, 5, p.hp / p.maxHp, p.hp / p.maxHp < 0.3 && Math.floor(t * 6) % 2 ? '#ff8080' : UI.red);
  UI.bar(ctx, 28, 15, 66, 3, p.focus / 100, p.focus >= 50 ? UI.gold : '#b09030');
  ctx.fillStyle = UI.ink; ctx.fillRect(28 + 33, 14, 1, 5);
  for (let i = 0; i < p.maxWebs; i++) {
    ctx.fillStyle = i < p.webs ? '#ffffff' : '#3a3a4a';
    ctx.fillRect(28 + i * 5, 21, 3, 3);
  }
  // Tecnología
  const tech = String(Game.save.tech);
  const tw = Font.width(tech) + 16;
  UI.panel(ctx, W - tw - 6, 3, tw + 3, 13, 'rgba(12,10,24,0.7)');
  drawTechIcon(ctx, W - tw - 2, 6, t);
  Font.draw(ctx, tech, W - 6, 6, UI.gold, { align: 'right' });
  // Cánones rotos
  { const n = canonCount(); if (n > 0) { Font.draw(ctx, 'CANON ' + n + '/5', W - 6, 20, '#ff60c0', { align: 'right', shadow: UI.ink }); } }
  // Combo
  if (w.combo.n >= 3) {
    const s = 'x' + w.combo.n;
    Font.draw(ctx, s, W - 8, 42, UI.gold, { align: 'right', scale: 2, shadow: UI.ink });
    Font.draw(ctx, 'COMBO', W - 8, 60, UI.paper, { align: 'right', shadow: UI.ink });
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
    Font.draw(ctx, w.objective, 4, 32, UI.paper, { shadow: UI.ink });
  }
  if (w.crime) {
    const c = w.crime;
    const s = Math.max(0, Math.ceil(c.t));
    const lbl = 'CRIMEN: ' + c.label + '  ' + Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
    Font.draw(ctx, lbl, 4, w.objective ? 43 : 32, '#ff6060', { shadow: UI.ink });
  }
  // Jefe
  if (w.boss && !w.boss.dead && w.boss.state !== 'wait') {
    const b = w.boss;
    const bw = 200, bx = (W - bw) / 2, by = H - 14;
    Font.draw(ctx, b.name, W / 2, by - 10, UI.paper, { align: 'center', shadow: UI.ink });
    UI.bar(ctx, bx, by, bw, 5, b.hp / b.maxHp, b.phase === 2 ? '#ff6020' : '#c02030');
    ctx.fillStyle = UI.ink; ctx.fillRect(bx + bw / 2, by - 1, 1, 7);
  }
  // Consejo
  if (w.tip) {
    const lines = Font.wrap(w.tip.text, 250);
    const bh = lines.length * 10 + 8;
    const by = w.mode === 'city' ? 50 : 40;
    ctx.globalAlpha = Math.min(1, w.tip.t * 3, (w.tip.dur - w.tip.t + 0.3) * 3);
    UI.panel(ctx, W / 2 - 132, by, 264, bh, 'rgba(20,24,60,0.9)', '#9ab0ff');
    lines.forEach((ln, i) => Font.draw(ctx, ln, W / 2, by + 5 + i * 10, UI.paper, { align: 'center' }));
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
    const x = Math.round(f.x - w.cam.x), y = Math.round(f.y - w.cam.y);
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
      ctx.drawImage(ctx.canvas, 0, y, W, h, off, y, W, h);
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
    Font.draw(ctx, 'CÁNONES ROTOS: ' + n + '/5', W / 2, 100, '#60ffe0', { align: 'center' });
    for (let i = 0; i < 5; i++) { ctx.fillStyle = i < n ? '#ff60c0' : '#2a2a3a'; ctx.fillRect(W / 2 - 24 + i * 10, 112, 7, 4); }
    this.menu.draw(ctx, W / 2, 132, t, { lh: 18 });
    ctx.globalAlpha = 1;
  }
}
