'use strict';
// ---------------------------------------------------------------------------
// Controles 3D: teclado + ratón, mandos (PlayStation, Xbox, Nintendo Pro,
// genéricos) y táctil. Esquema tipo PlayStation:
//   Cruz/A saltar · Cuadrado/X golpe · Círculo/B esquivar · Triángulo/Y red
//   R2 balanceo · L2 impulso (zip) · L1 especial · R3 refuerzo · Options pausa
// ---------------------------------------------------------------------------
const ACT3 = ['JUMP', 'ATTACK', 'DODGE', 'WEB', 'SWING', 'ZIP', 'SPECIAL', 'ALLY', 'PAUSE', 'SPRINT'];
const KEYS3 = {
  JUMP: ['Space'], ATTACK: ['KeyJ'], DODGE: ['KeyC', 'ControlLeft', 'KeyL'], WEB: ['KeyF', 'KeyK'], SWING: ['ShiftLeft', 'ShiftRight'],
  ZIP: ['KeyE', 'KeyI'], SPECIAL: ['KeyR', 'KeyU'], ALLY: ['KeyT'], PAUSE: ['Escape', 'KeyP'], SPRINT: ['KeyV'],
};
const PAD3 = { JUMP: [0], ATTACK: [2], DODGE: [1], WEB: [3], SWING: [7, 5], ZIP: [6], SPECIAL: [4], ALLY: [11], PAUSE: [9, 8], SPRINT: [10] };
const MOUSE3 = { 0: 'ATTACK', 2: 'WEB' };

const Input3 = {
  keys: {}, down: {}, prev: {}, latch: {}, mouse: { dx: 0, dy: 0, locked: false, btn: {} },
  move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, lastDevice: 'keys', pad: null, padType: null, padName: '', seen: new Set(), cal: {},
  touch: { stick: null, look: null, btn: {} },
  init(canvas) {
    this.canvas = canvas;
    window.addEventListener('keydown', (e) => {
      if (!this.keys[e.code]) this.latch[e.code] = true;
      this.keys[e.code] = true; this.lastDevice = 'keys';
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      Audio2.unlock();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; this.mouse.btn = {}; });
    canvas.addEventListener('mousedown', (e) => {
      Audio2.unlock();
      if (!this.mouse.locked && canvas.requestPointerLock && !Game3.menuOpen) { try { canvas.requestPointerLock(); } catch (err) { /* sin bloqueo */ } }
      this.mouse.btn[e.button] = true; this.latch['M' + e.button] = true; this.lastDevice = 'keys';
    });
    window.addEventListener('mouseup', (e) => { this.mouse.btn[e.button] = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => { this.mouse.locked = document.pointerLockElement === canvas; });
    window.addEventListener('mousemove', (e) => { if (this.mouse.locked) { this.mouse.dx += e.movementX || 0; this.mouse.dy += e.movementY || 0; } });
    window.addEventListener('gamepadconnected', (e) => this.onPad(e.gamepad));
    // táctil: mitad izquierda = stick, mitad derecha = cámara; botones a la derecha
    const tp = (e) => {
      e.preventDefault(); Audio2.unlock(); this.lastDevice = 'touch';
      const r = canvas.getBoundingClientRect();
      const btns = {};
      let stick = null, look = null;
      for (const t of e.touches) {
        const x = t.clientX - r.left, y = t.clientY - r.top;
        const b = this.touchButton(x, y, r.width, r.height);
        if (b) { btns[b] = true; continue; }
        if (x < r.width * 0.45) {
          if (!this.touch.stick || this.touch.stick.id !== t.identifier) stick = { id: t.identifier, ox: x, oy: y, x, y };
          else stick = Object.assign(this.touch.stick, { x, y });
        } else {
          if (this.touch.look && this.touch.look.id === t.identifier) { this.mouse.dx += (x - this.touch.look.x) * 2; this.mouse.dy += (y - this.touch.look.y) * 2; }
          look = { id: t.identifier, x, y };
        }
      }
      for (const k in btns) if (!this.touch.btn[k]) this.latch['T' + k] = true;
      this.touch.btn = btns; this.touch.stick = stick; this.touch.look = look;
    };
    for (const ev of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) canvas.addEventListener(ev, tp, { passive: false });
  },
  touchButtons(w, h) {
    const s = Math.min(w, h) / 9;
    return [['JUMP', w - s * 1.3, h - s * 1.3], ['ATTACK', w - s * 2.6, h - s * 1.0], ['DODGE', w - s * 1.3, h - s * 2.6], ['SWING', w - s * 2.6, h - s * 2.4], ['WEB', w - s * 3.8, h - s * 1.2], ['PAUSE', w - s * 0.8, s * 0.8]].map(([a, x, y]) => ({ a, x, y, r: s * 0.55 }));
  },
  touchButton(x, y, w, h) { for (const b of this.touchButtons(w, h)) if (Math.hypot(x - b.x, y - b.y) < b.r) return b.a; return null; },
  onPad(gp) {
    const id = (gp.id || '').toLowerCase();
    this.padName = gp.id;
    this.padType = /054c|playstation|dualsense|dualshock|sony/.test(id) ? 'ps' : /057e|nintendo|pro controller|switch/.test(id) ? 'nintendo' : 'xbox';
    if (!this.seen.has(gp.id)) { this.seen.add(gp.id); Game3.toast('MANDO CONECTADO', { ps: 'PlayStation', nintendo: 'Nintendo Pro', xbox: 'Xbox / genérico' }[this.padType]); }
  },
  pads() { try { return Array.from(navigator.getGamepads ? navigator.getGamepads() || [] : []).filter((p) => p && p.connected !== false); } catch (e) { return []; } },
  // ejes con centro y recorrido aprendidos (Nintendo Pro por Bluetooth)
  axis(gp, i) {
    const v = gp.axes[i];
    if (v === undefined || Number.isNaN(v) || Math.abs(v) > 1.05) return 0;
    const key = gp.index + gp.id;
    const c = this.cal[key] || (this.cal[key] = { rest: gp.axes.map((a) => (Math.abs(a) > 0.35 ? 0 : a)), range: gp.axes.map(() => 0.3), trig: gp.axes.map((a) => Math.abs(a) > 0.8) });
    if (c.trig[i]) return 0;
    const d = v - (c.rest[i] || 0), a = Math.abs(d);
    if (a > c.range[i]) c.range[i] = Math.min(1, a);
    if (a < 0.06) c.rest[i] += d * 0.02;
    const n = clamp(d / c.range[i], -1, 1);
    return Math.abs(d) < 0.12 ? 0 : n;
  },
  hat(gp) {
    if (gp.mapping === 'standard' || gp.axes.length < 10) return null;
    const v = gp.axes[9];
    if (v === undefined || Math.abs(v) > 1.05) return null;
    const dirs = [[-1, 0, -1], [-0.714, 1, -1], [-0.428, 1, 0], [-0.142, 1, 1], [0.142, 0, 1], [0.428, -1, 1], [0.714, -1, 0], [1, -1, -1]];
    for (const d of dirs) if (Math.abs(v - d[0]) < 0.1) return { x: d[1], y: d[2] };
    return null;
  },
  poll() {
    const padDown = {};
    let mx = 0, my = 0, lx = 0, ly = 0;
    for (const gp of this.pads()) {
      if (this.padName !== gp.id) this.onPad(gp);
      let any = false;
      for (const a of ACT3) for (const b of PAD3[a]) { const btn = gp.buttons[b]; if (btn && (btn.pressed || btn.value > 0.4)) { padDown[a] = true; any = true; } }
      const std = gp.mapping === 'standard';
      const ax = this.axis(gp, 0), ay = this.axis(gp, 1);
      const bx = this.axis(gp, std ? 2 : 2), by = this.axis(gp, std ? 3 : (gp.axes.length > 5 ? 5 : 3));
      if (Math.hypot(ax, ay) > 0.15) { mx = ax; my = ay; any = true; }
      if (Math.hypot(bx, by) > 0.15) { lx = bx; ly = by; any = true; }
      // cruceta: botones 12-15 o eje "hat"
      const dp = (i) => gp.buttons[i] && gp.buttons[i].pressed;
      const h = this.hat(gp) || { x: (dp(15) ? 1 : 0) - (dp(14) ? 1 : 0), y: (dp(13) ? 1 : 0) - (dp(12) ? 1 : 0) };
      if (h.x || h.y) { mx = h.x; my = h.y; any = true; }
      if (any) this.lastDevice = 'pad';
    }
    // teclado
    const k = this.keys;
    const kx = ((k.KeyD || k.ArrowRight) ? 1 : 0) - ((k.KeyA || k.ArrowLeft) ? 1 : 0);
    const ky = ((k.KeyS || k.ArrowDown) ? 1 : 0) - ((k.KeyW || k.ArrowUp) ? 1 : 0);
    if (kx || ky) { const l = Math.hypot(kx, ky); mx = kx / l; my = ky / l; }
    if (k.KeyQ) lx = -1; if (k.KeyO) lx = 1;
    // táctil
    if (this.touch.stick) {
      const s = this.touch.stick, dx = s.x - s.ox, dy = s.y - s.oy, l = Math.hypot(dx, dy);
      if (l > 6) { mx = dx / Math.max(l, 50); my = dy / Math.max(l, 50); }
    }
    this.move = { x: mx, y: my };
    this.look = { x: lx, y: ly };                 // mando / teclas: velocidad
    this.mouseDelta = { x: this.mouse.dx, y: this.mouse.dy }; // ratón / táctil: desplazamiento
    this.mouse.dx = 0; this.mouse.dy = 0;
    for (const a of ACT3) {
      this.prev[a] = this.down[a];
      let d = !!padDown[a] || !!this.touch.btn[a], l = false;
      for (const c of KEYS3[a]) { if (k[c]) d = true; if (this.latch[c]) l = true; }
      for (const b in MOUSE3) if (MOUSE3[b] === a) { if (this.mouse.btn[b]) d = true; if (this.latch['M' + b]) l = true; }
      if (this.latch['T' + a]) l = true;
      this.down[a] = d || l;
      this.pressedMap[a] = (this.down[a] && !this.prev[a]) || (l && this.prev[a]);
    }
    this.menuNav = { up: this.latch.ArrowUp || this.latch.KeyW, down: this.latch.ArrowDown || this.latch.KeyS, ok: this.latch.Enter || this.latch.Space, back: this.latch.Escape };
    this.latch = {};
  },
  pressedMap: {},
  isDown(a) { return !!this.down[a]; },
  pressed(a) { return !!this.pressedMap[a]; },
  // Etiqueta del botón según el dispositivo
  label(a) {
    if (this.lastDevice === 'pad') {
      const t = this.padType;
      const face = t === 'ps' ? { JUMP: '✕', ATTACK: '□', DODGE: '○', WEB: '△' } : t === 'nintendo' ? { JUMP: 'B', ATTACK: 'Y', DODGE: 'A', WEB: 'X' } : { JUMP: 'A', ATTACK: 'X', DODGE: 'B', WEB: 'Y' };
      const rest = t === 'ps' ? { SWING: 'R2', ZIP: 'L2', SPECIAL: 'L1', ALLY: 'R3', PAUSE: 'OPTIONS', SPRINT: 'L3' } : t === 'nintendo' ? { SWING: 'ZR', ZIP: 'ZL', SPECIAL: 'L', ALLY: 'R3', PAUSE: '+', SPRINT: 'L3' } : { SWING: 'RT', ZIP: 'LT', SPECIAL: 'LB', ALLY: 'R3', PAUSE: 'MENU', SPRINT: 'L3' };
      return face[a] || rest[a] || a;
    }
    if (this.lastDevice === 'touch') return { JUMP: 'SALTO', ATTACK: 'GOLPE', DODGE: 'ESQUIVA', WEB: 'RED', SWING: 'BALANCEO', PAUSE: 'II' }[a] || a;
    return { JUMP: 'ESPACIO', ATTACK: 'CLIC / J', DODGE: 'C', WEB: 'CLIC DER. / F', SWING: 'SHIFT', ZIP: 'E', SPECIAL: 'R', ALLY: 'T', PAUSE: 'ESC', SPRINT: 'V' }[a] || a;
  },
};
