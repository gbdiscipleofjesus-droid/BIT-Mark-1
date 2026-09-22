'use strict';
// ---------------------------------------------------------------------------
// Entrada unificada: teclado, cualquier mando (Gamepad API) y pantalla táctil
// ---------------------------------------------------------------------------
const ACTIONS = ['LEFT', 'RIGHT', 'UP', 'DOWN', 'JUMP', 'ATTACK', 'WEB', 'SHOOT', 'DODGE', 'SPECIAL', 'PAUSE'];
const ACTION_NAMES = {
  LEFT: 'Izquierda', RIGHT: 'Derecha', UP: 'Arriba', DOWN: 'Abajo', JUMP: 'Saltar',
  ATTACK: 'Golpear', WEB: 'Balancearse', SHOOT: 'Disparar red', DODGE: 'Esquivar',
  SPECIAL: 'Especial / curar', PAUSE: 'Pausa',
};
const DEFAULT_KEYS = {
  LEFT: ['ArrowLeft', 'KeyA'], RIGHT: ['ArrowRight', 'KeyD'], UP: ['ArrowUp', 'KeyW'], DOWN: ['ArrowDown', 'KeyS'],
  JUMP: ['Space', 'KeyZ', 'KeyK'], ATTACK: ['KeyX', 'KeyJ'], WEB: ['KeyC', 'KeyL'], SHOOT: ['KeyV', 'KeyI'],
  DODGE: ['ShiftLeft', 'ShiftRight', 'KeyO'], SPECIAL: ['KeyB', 'KeyU', 'KeyQ'], PAUSE: ['Escape', 'KeyP'],
};
// Mapeo "standard" del navegador (Xbox, PlayStation, Switch Pro, 8BitDo, etc.)
const DEFAULT_PAD = {
  LEFT: [{ b: 14 }, { a: 0, d: -1 }], RIGHT: [{ b: 15 }, { a: 0, d: 1 }],
  UP: [{ b: 12 }, { a: 1, d: -1 }], DOWN: [{ b: 13 }, { a: 1, d: 1 }],
  JUMP: [{ b: 0 }], DODGE: [{ b: 1 }], ATTACK: [{ b: 2 }], SHOOT: [{ b: 3 }],
  SPECIAL: [{ b: 4 }, { b: 6 }], WEB: [{ b: 5 }, { b: 7 }], PAUSE: [{ b: 9 }, { b: 8 }],
};
const AXIS_T = 0.45;

const TOUCH_BTNS = [
  { id: 'JUMP', x: 338, y: 190, r: 15, label: 'A' },
  { id: 'ATTACK', x: 308, y: 166, r: 15, label: 'X' },
  { id: 'DODGE', x: 364, y: 158, r: 12, label: 'B' },
  { id: 'SHOOT', x: 334, y: 136, r: 12, label: 'Y' },
  { id: 'WEB', x: 272, y: 192, r: 16, label: 'RED' },
  { id: 'SPECIAL', x: 270, y: 150, r: 11, label: 'ESP' },
  { id: 'PAUSE', x: 368, y: 16, r: 10, label: 'II' },
];

const Input = {
  keys: {}, keyLatch: {},
  down: {}, prev: {}, pressedMap: {}, releasedMap: {},
  keyBinds: null, padBinds: null,
  lastDevice: 'kb', padType: 'xbox', padConnected: false, padName: '',
  padBlocked: false, seenPads: new Set(), toast: null, // aviso en pantalla sobre mandos
  touch: { active: false, stick: null, buttons: {}, used: false },
  tap: null, // {x,y} último toque/clic en coordenadas del juego
  capture: null, // función de captura para reasignar controles
  repeat: {},
  canvas: null,
  rumbleOn: true,
  anyKeyEvent: false,

  init(canvas) {
    this.canvas = canvas;
    const saved = Store.get('sm_binds', null);
    this.keyBinds = deepCopy(DEFAULT_KEYS);
    this.padBinds = deepCopy(DEFAULT_PAD);
    if (saved && saved.keys && saved.pad) {
      for (const a of ACTIONS) {
        if (Array.isArray(saved.keys[a]) && saved.keys[a].length) this.keyBinds[a] = saved.keys[a];
        if (Array.isArray(saved.pad[a]) && saved.pad[a].length) this.padBinds[a] = saved.pad[a];
      }
    }
    for (const a of ACTIONS) { this.down[a] = false; this.prev[a] = false; }

    window.addEventListener('keydown', (e) => {
      const code = e.code || e.key;
      if (this.capture) {
        e.preventDefault();
        this.capture({ type: 'key', code });
        return;
      }
      if (!e.repeat) this.keyLatch[code] = true;
      this.keys[code] = true;
      this.lastDevice = 'kb';
      this.anyKeyEvent = true;
      if (this.isGameKey(code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      const code = e.code || e.key;
      this.keys[code] = false;
    });
    window.addEventListener('blur', () => { this.keys = {}; this.keyLatch = {}; this.touch.buttons = {}; this.touch.stick = null; });
    window.addEventListener('gamepadconnected', (e) => { this.onPad(e.gamepad); });
    window.addEventListener('gamepaddisconnected', (e) => {
      this.padConnected = false;
      if (e && e.gamepad) this.seenPads.delete(e.gamepad.id);
      this.showToast('MANDO DESCONECTADO', 'Vuelve a conectarlo y pulsa un botón.');
    });
    // Algunos navegadores bloquean los mandos dentro de marcos (iframes)
    try {
      const pp = document.permissionsPolicy || document.featurePolicy;
      if (pp && pp.allowsFeature && !pp.allowsFeature('gamepad')) this.padBlocked = true;
    } catch (e) { /* sin política */ }
    try { if (navigator.getGamepads) navigator.getGamepads(); } catch (e) { this.padBlocked = true; }

    const toGame = (cx, cy) => {
      const r = canvas.getBoundingClientRect();
      return { x: (cx - r.left) / r.width * W, y: (cy - r.top) / r.height * H };
    };
    const onTouch = (e) => {
      e.preventDefault();
      this.touch.used = true;
      this.lastDevice = 'touch';
      this.touch.buttons = {};
      let stick = null;
      for (const t of e.touches) {
        const p = toGame(t.clientX, t.clientY);
        let onBtn = false;
        for (const b of TOUCH_BTNS) {
          if (dist(p.x, p.y, b.x, b.y) < b.r + 7) { this.touch.buttons[b.id] = true; onBtn = true; }
        }
        if (!onBtn && p.x < W * 0.45) {
          const prevStick = this.touch.stick;
          if (prevStick && prevStick.id === t.identifier) stick = { id: t.identifier, ox: prevStick.ox, oy: prevStick.oy, x: p.x, y: p.y };
          else if (!stick) stick = { id: t.identifier, ox: p.x, oy: p.y, x: p.x, y: p.y };
        }
      }
      this.touch.stick = stick;
    };
    canvas.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        const p = toGame(t.clientX, t.clientY);
        this.tap = p;
      }
      onTouch(e);
      Audio2.unlock();
    }, { passive: false });
    canvas.addEventListener('touchmove', onTouch, { passive: false });
    canvas.addEventListener('touchend', onTouch, { passive: false });
    canvas.addEventListener('touchcancel', onTouch, { passive: false });
    canvas.addEventListener('mousedown', (e) => {
      this.tap = toGame(e.clientX, e.clientY);
      Audio2.unlock();
    });
    window.addEventListener('keydown', () => Audio2.unlock());
  },

  isGameKey(code) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab', 'Backspace'].includes(code)) return true;
    for (const a of ACTIONS) if (this.keyBinds[a].includes(code)) return true;
    return false;
  },

  onPad(gp) {
    this.padConnected = true;
    this.padName = gp.id || '';
    const id = this.padName.toLowerCase();
    const first = !this.seenPads.has(gp.id);
    this.seenPads.add(gp.id);
    if (/054c|playstation|dualsense|dualshock|ps4|ps5|sony/.test(id)) this.padType = 'ps';
    else if (/057e|nintendo|pro controller|joy-con|switch/.test(id)) this.padType = 'nintendo';
    else if (gp.mapping === 'standard' || /xbox|045e|xinput/.test(id)) this.padType = 'xbox';
    else this.padType = 'generic';
    if (first) {
      const nice = { ps: 'PLAYSTATION', nintendo: 'NINTENDO PRO', xbox: 'XBOX', generic: 'GENÉRICO' }[this.padType];
      this.showToast('MANDO CONECTADO: ' + nice, gp.mapping === 'standard' ? '¡Listo para jugar!' : 'Si algún botón no va, reasígnalo en Controles.');
    }
  },

  showToast(title, sub) { this.toast = { title, sub, t: 0 }; },

  getPads() {
    let pads = [];
    try { pads = navigator.getGamepads ? Array.from(navigator.getGamepads() || []) : []; } catch (e) { pads = []; this.padBlocked = true; }
    return pads.filter((p) => p && p.connected !== false);
  },

  // Lee el "hat" (cruceta como eje) típico de mandos genéricos
  hatDir(gp) {
    if (gp.mapping === 'standard' || gp.axes.length < 10) return null;
    const v = gp.axes[9];
    if (v === undefined || Math.abs(v) > 1.05) return null;
    const dirs = [[-1, 'U'], [-0.714, 'UR'], [-0.428, 'R'], [-0.142, 'DR'], [0.142, 'D'], [0.428, 'DL'], [0.714, 'L'], [1, 'UL']];
    for (const [val, d] of dirs) if (Math.abs(v - val) < 0.1) return d;
    return null;
  },

  padActive(gp, bind) {
    if (bind.b !== undefined) {
      const btn = gp.buttons[bind.b];
      return !!btn && (btn.pressed || btn.value > 0.5);
    }
    if (bind.a !== undefined) {
      const v = gp.axes[bind.a];
      return v !== undefined && v * bind.d > AXIS_T;
    }
    return false;
  },

  poll() {
    const pads = this.getPads();
    const padDown = {};
    for (const a of ACTIONS) padDown[a] = false;
    for (const gp of pads) {
      if (!this.padConnected || this.padName !== gp.id) this.onPad(gp);
      let any = false;
      for (const a of ACTIONS) {
        for (const bind of this.padBinds[a]) {
          if (this.padActive(gp, bind)) { padDown[a] = true; any = true; }
        }
      }
      const hat = this.hatDir(gp);
      if (hat) {
        if (hat.includes('U')) padDown.UP = true;
        if (hat.includes('D')) padDown.DOWN = true;
        if (hat.includes('L')) padDown.LEFT = true;
        if (hat.includes('R')) padDown.RIGHT = true;
        any = true;
      }
      if (any) this.lastDevice = 'pad';
      if (this.capture) this.checkPadCapture(gp);
    }
    if (this.capture) {
      for (const a of ACTIONS) { this.down[a] = false; this.prev[a] = false; }
      this.keyLatch = {};
      return;
    }
    // Táctil
    const tdown = {};
    if (this.touch.stick) {
      const dx = this.touch.stick.x - this.touch.stick.ox;
      const dy = this.touch.stick.y - this.touch.stick.oy;
      if (dx < -8) tdown.LEFT = true;
      if (dx > 8) tdown.RIGHT = true;
      if (dy < -10) tdown.UP = true;
      if (dy > 10) tdown.DOWN = true;
    }
    for (const k in this.touch.buttons) tdown[k] = true;

    for (const a of ACTIONS) {
      this.prev[a] = this.down[a];
      let kd = false, latch = false;
      for (const code of this.keyBinds[a]) {
        if (this.keys[code]) kd = true;
        if (this.keyLatch[code]) latch = true;
      }
      this.down[a] = kd || latch || padDown[a] || !!tdown[a];
      this.pressedMap[a] = (this.down[a] && !this.prev[a]) || (latch && this.prev[a] && !kd);
      this.releasedMap[a] = !this.down[a] && this.prev[a];
    }
    this.menuKeys = {
      up: this.keyLatch.ArrowUp, down: this.keyLatch.ArrowDown, left: this.keyLatch.ArrowLeft, right: this.keyLatch.ArrowRight,
      confirm: this.keyLatch.Enter || this.keyLatch.Space || this.keyLatch.NumpadEnter,
      back: this.keyLatch.Escape || this.keyLatch.Backspace,
    };
    this.keyLatch = {};
  },

  // Captura la siguiente pulsación del mando para reasignar
  padRest: null,
  checkPadCapture(gp) {
    if (!this.padRest) {
      this.padRest = { axes: gp.axes.slice(), btn: gp.buttons.map((b) => b.pressed) };
      return;
    }
    for (let i = 0; i < gp.buttons.length; i++) {
      if (gp.buttons[i].pressed && !this.padRest.btn[i]) { this.capture({ type: 'pad', bind: { b: i } }); return; }
      if (!gp.buttons[i].pressed) this.padRest.btn[i] = false;
    }
    for (let i = 0; i < gp.axes.length; i++) {
      const rest = this.padRest.axes[i] || 0;
      const v = gp.axes[i];
      if (Math.abs(v - rest) > 0.6 && Math.abs(v) > 0.6 && Math.abs(v) <= 1.01) {
        this.capture({ type: 'pad', bind: { a: i, d: v > 0 ? 1 : -1 } });
        return;
      }
    }
  },

  startCapture(fn) {
    this.padRest = null;
    this.keyLatch = {};
    this.capture = (res) => { this.capture = null; this.padRest = null; this.keys = {}; fn(res); };
  },

  saveBinds() { Store.set('sm_binds', { keys: this.keyBinds, pad: this.padBinds }); },
  resetBinds() { this.keyBinds = deepCopy(DEFAULT_KEYS); this.padBinds = deepCopy(DEFAULT_PAD); this.saveBinds(); },

  isDown(a) { return !!this.down[a]; },
  pressed(a) { return !!this.pressedMap[a]; },
  released(a) { return !!this.releasedMap[a]; },
  anyPressed() {
    for (const a of ACTIONS) if (this.pressedMap[a]) return true;
    return !!(this.menuKeys && (this.menuKeys.confirm || this.menuKeys.back)) || this.anyKeyEvent;
  },
  clearAny() { this.anyKeyEvent = false; },

  // Navegación de menú con autorrepetición
  menu(dir, dt) {
    const act = { up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT' }[dir];
    if (this.menuKeys && this.menuKeys[dir]) return true;
    if (this.pressed(act)) { this.repeat[dir] = 0.38; return true; }
    if (this.isDown(act)) {
      this.repeat[dir] = (this.repeat[dir] || 0) - dt;
      if (this.repeat[dir] <= 0) { this.repeat[dir] = 0.11; return true; }
    }
    return false;
  },
  confirm() { return this.pressed('JUMP') || !!(this.menuKeys && this.menuKeys.confirm); },
  back() { return this.pressed('DODGE') || !!(this.menuKeys && this.menuKeys.back) || this.pressed('PAUSE'); },
  takeTap() { const t = this.tap; this.tap = null; return t; },

  rumble(strong, weak, ms) {
    if (!this.rumbleOn) return;
    for (const gp of this.getPads()) {
      try {
        if (gp.vibrationActuator && gp.vibrationActuator.playEffect) {
          gp.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {});
        }
      } catch (e) { /* sin vibración */ }
    }
  },

  showTouch() {
    if (Game.settings.touch === 'on') return true;
    if (Game.settings.touch === 'off') return false;
    return this.touch.used && this.lastDevice === 'touch';
  },

  // Nombre legible de un control para mostrar en pantalla
  label(action) {
    if (this.lastDevice === 'touch') {
      const b = TOUCH_BTNS.find((t) => t.id === action);
      return b ? b.label : ACTION_NAMES[action];
    }
    if (this.lastDevice === 'pad') {
      const bind = this.padBinds[action][0];
      return bind ? this.padLabel(bind) : '?';
    }
    const code = this.keyBinds[action][0];
    return this.keyLabel(code);
  },

  keyLabel(code) {
    if (!code) return '?';
    const map = { Space: 'ESPACIO', ShiftLeft: 'SHIFT', ShiftRight: 'SHIFT', Escape: 'ESC', Enter: 'ENTER', ArrowLeft: '<', ArrowRight: '>', ArrowUp: 'ARRIBA', ArrowDown: 'ABAJO', ControlLeft: 'CTRL', ControlRight: 'CTRL', AltLeft: 'ALT', Tab: 'TAB', Backspace: 'BORRAR' };
    if (map[code]) return map[code];
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('Numpad')) return 'NUM' + code.slice(6);
    return code.toUpperCase().slice(0, 8);
  },

  padLabel(bind) {
    if (bind.a !== undefined) return 'EJE' + bind.a + (bind.d > 0 ? '+' : '-');
    const i = bind.b;
    const names = {
      xbox: ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'VIEW', 'MENU', 'LS', 'RS', 'ARRIBA', 'ABAJO', 'IZQ', 'DER'],
      ps: ['X', 'O', 'CUADRADO', 'TRIÁNGULO', 'L1', 'R1', 'L2', 'R2', 'SHARE', 'OPTIONS', 'L3', 'R3', 'ARRIBA', 'ABAJO', 'IZQ', 'DER'],
      nintendo: ['B', 'A', 'Y', 'X', 'L', 'R', 'ZL', 'ZR', '-', '+', 'LS', 'RS', 'ARRIBA', 'ABAJO', 'IZQ', 'DER'],
    };
    const set = names[this.padType];
    if (set && set[i] !== undefined) return set[i];
    return 'BOTÓN ' + (i + 1);
  },
};
