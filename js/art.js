'use strict';
// ---------------------------------------------------------------------------
// Capa artística: portada pintada, atmósfera (luces, reflejos, clima, gradación),
// onomatopeyas de cómic y objetos dibujados con detalle vectorial.
// Todo se pinta a la resolución real del lienzo (no al píxel lógico).
// ---------------------------------------------------------------------------
const ART_FONT = 'Impact, Haettenschweiler, "Arial Black", "Franklin Gothic Heavy", "DejaVu Sans", sans-serif';

const Art = {
  // ------------------------------------------------------------ portada
  coverCache: null,
  buildCover() {
    const S = Math.min(RES, 6);
    const c = makeCanvas(W * S, H * S), g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.scale(S, S);
    const r = makeRng(1962);
    // cielo nocturno con resplandor morado y rojo sobre el horizonte
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#05040f'); sky.addColorStop(0.35, '#15103a'); sky.addColorStop(0.62, '#4a1c56'); sky.addColorStop(0.8, '#a8385a'); sky.addColorStop(1, '#f07a4a');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 160; i++) { g.fillStyle = 'rgba(255,255,255,' + r.range(0.2, 0.9).toFixed(2) + ')'; const s = r.chance(0.1) ? 1 : 0.5; g.fillRect(r.range(0, W), r.range(0, H * 0.5), s, s); }
    // luna enorme con halo
    const mx = 292, my = 62;
    let gl = g.createRadialGradient(mx, my, 20, mx, my, 110);
    gl.addColorStop(0, 'rgba(255,236,210,0.55)'); gl.addColorStop(0.3, 'rgba(230,170,200,0.18)'); gl.addColorStop(1, 'rgba(120,60,140,0)');
    g.fillStyle = gl; g.fillRect(0, 0, W, H);
    gl = g.createRadialGradient(mx - 8, my - 8, 4, mx, my, 34);
    gl.addColorStop(0, '#fffaf0'); gl.addColorStop(0.7, '#f4e2c8'); gl.addColorStop(1, '#d8b8a8');
    g.fillStyle = gl; g.beginPath(); g.arc(mx, my, 34, 0, TAU); g.fill();
    for (const [cx, cy, cr] of [[-10, -6, 7], [9, 8, 5], [12, -12, 4], [-4, 16, 3.5], [-18, 10, 3]]) { g.fillStyle = 'rgba(170,130,120,0.28)'; g.beginPath(); g.arc(mx + cx, my + cy, cr, 0, TAU); g.fill(); }
    // nubes pintadas a pinceladas
    for (let i = 0; i < 90; i++) {
      const cx = r.range(-40, W + 40), cy = r.range(40, 130), rx = r.range(14, 48), ry = rx * r.range(0.18, 0.32);
      const near = Math.max(0, 1 - Math.hypot(cx - mx, cy - my) / 150);
      g.fillStyle = 'rgba(' + Math.round(70 + near * 150) + ',' + Math.round(40 + near * 100) + ',' + Math.round(100 + near * 90) + ',' + (0.12 + near * 0.2).toFixed(2) + ')';
      g.beginPath(); g.ellipse(cx, cy, rx, ry, r.range(-0.1, 0.1), 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,220,230,' + (near * 0.25).toFixed(2) + ')';
      g.beginPath(); g.ellipse(cx - rx * 0.1, cy - ry * 0.5, rx * 0.7, ry * 0.35, 0, 0, TAU); g.fill();
    }
    // horizonte en tres capas con perspectiva atmosférica
    const layer = (base, hmin, hmax, col, winA, spires) => {
      let x = -10;
      while (x < W + 10) {
        const w = r.range(10, 26), h = r.range(hmin, hmax);
        g.fillStyle = col; g.fillRect(x, base - h, w, h + 60);
        if (r.chance(spires)) { g.beginPath(); g.moveTo(x + w * 0.3, base - h); g.lineTo(x + w / 2, base - h - r.range(10, 28)); g.lineTo(x + w * 0.7, base - h); g.fill(); }
        for (let yy = base - h + 3; yy < base; yy += 3) for (let xx = x + 2; xx < x + w - 2; xx += 2.5) if (r.chance(0.18)) { g.fillStyle = 'rgba(255,214,140,' + (winA * r.range(0.4, 1)).toFixed(2) + ')'; g.fillRect(xx, yy, 1, 1.4); }
        x += w + r.range(-2, 2);
      }
    };
    layer(176, 30, 90, '#5a2a5a', 0.35, 0.15);
    // hitos: Empire State y Chrysler
    g.fillStyle = '#44204a';
    g.fillRect(208, 70, 18, 110); g.fillRect(212, 58, 10, 12); g.fillRect(215, 44, 4, 14); g.fillRect(216.5, 30, 1, 14);
    g.beginPath(); g.moveTo(108, 190); g.lineTo(108, 80); g.lineTo(116, 60); g.lineTo(124, 80); g.lineTo(124, 190); g.fill();
    g.fillStyle = 'rgba(255,220,160,0.5)'; for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(116, 66 + i * 4, 3 - i * 0.4, Math.PI, TAU); g.fill(); }
    layer(190, 20, 70, '#2e1636', 0.55, 0.1);
    const fog = g.createLinearGradient(0, 140, 0, 200); fog.addColorStop(0, 'rgba(240,120,110,0)'); fog.addColorStop(1, 'rgba(240,120,110,0.22)');
    g.fillStyle = fog; g.fillRect(0, 140, W, 60);
    layer(216, 16, 50, '#170a1e', 0.75, 0.05);
    // azotea en primer plano (izquierda) con depósito de agua y antena
    g.fillStyle = '#07040a';
    g.beginPath(); g.moveTo(0, 176); g.lineTo(168, 176); g.lineTo(172, 180); g.lineTo(172, H); g.lineTo(0, H); g.fill();
    g.fillStyle = '#1a0e1e'; g.fillRect(0, 176, 170, 2);
    g.fillStyle = 'rgba(255,190,200,0.25)'; g.fillRect(0, 176, 168, 0.6);
    g.fillStyle = '#07040a';
    g.fillRect(20, 128, 3, 48); g.fillRect(44, 128, 3, 48); g.fillRect(18, 104, 32, 26);
    g.beginPath(); g.moveTo(15, 104); g.lineTo(34, 90); g.lineTo(53, 104); g.fill();
    g.strokeStyle = '#07040a'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(21, 150); g.lineTo(46, 130); g.moveTo(46, 150); g.lineTo(21, 130); g.stroke();
    g.fillRect(150, 120, 1.5, 56); g.fillRect(143, 130, 16, 1); g.fillRect(146, 138, 10, 1);
    g.fillStyle = '#ff3040'; g.beginPath(); g.arc(150.7, 119, 1.3, 0, TAU); g.fill();
    // trama de puntos de cómic
    for (let yy = 0; yy < H; yy += 3) for (let xx = (yy / 3) % 2 ? 1.5 : 0; xx < W; xx += 3) {
      const k = yy / H;
      g.fillStyle = 'rgba(0,0,0,' + (0.05 + k * 0.08).toFixed(3) + ')';
      g.beginPath(); g.arc(xx, yy, 0.35 + k * 0.5, 0, TAU); g.fill();
    }
    this.coverCache = c;
    return c;
  },
  cover(ctx, t, dim = 0, heroX = 118) {
    const c = this.coverCache || this.buildCover();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(c, 0, 0, W, H);
    ctx.imageSmoothingEnabled = false;
    // reflectores que barren el cielo
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const [bx, sp, ph] of [[60, 0.35, 0], [330, 0.28, 2]]) {
      const a = -Math.PI / 2 + Math.sin(t * sp + ph) * 0.5;
      const gr = ctx.createLinearGradient(bx, 200, bx + Math.cos(a) * 220, 200 + Math.sin(a) * 220);
      gr.addColorStop(0, 'rgba(255,230,200,0.18)'); gr.addColorStop(1, 'rgba(255,230,200,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(bx, 200);
      ctx.lineTo(bx + Math.cos(a - 0.06) * 240, 200 + Math.sin(a - 0.06) * 240); ctx.lineTo(bx + Math.cos(a + 0.06) * 240, 200 + Math.sin(a + 0.06) * 240); ctx.fill();
    }
    ctx.restore();
    // Spider-Man agazapado en la cornisa, con luz de luna de contorno
    const hx = heroX, hy = 176;
    this.glow(ctx, hx + 8, hy - 30, 55, '255,200,210', 0.2);
    Rig.draw(ctx, hx, hy, 1, Poses.stance(0.2), (SUITS.find((s) => s.id === Game.save.suit) || SUITS[0]).palObj, { scale: 4.2 });
    // telaraña que baja desde fuera de la pantalla
    ctx.strokeStyle = 'rgba(240,240,255,0.8)'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(hx + 50, -5); ctx.quadraticCurveTo(hx + 38, 60, hx + 26, hy - 58); ctx.stroke();
    // lluvia fina
    ctx.strokeStyle = 'rgba(200,210,255,0.18)'; ctx.lineWidth = 0.35;
    ctx.beginPath();
    for (let i = 0; i < 70; i++) { const x = (i * 53.7 + t * 40) % (W + 40) - 20, y = (i * 37.3 + t * 260) % (H + 20) - 10; ctx.moveTo(x, y); ctx.lineTo(x - 2, y + 7); }
    ctx.stroke();
    this.vignette(ctx, 0.55);
    if (dim) { ctx.fillStyle = 'rgba(6,4,14,' + dim + ')'; ctx.fillRect(0, 0, W, H); }
    // marco de cómic
    ctx.strokeStyle = '#000'; ctx.lineWidth = 4; ctx.strokeRect(0, 0, W, H);
    ctx.strokeStyle = '#f4f0e8'; ctx.lineWidth = 1; ctx.strokeRect(3, 3, W - 6, H - 6);
  },
  // logotipo con relieve, degradado y telaraña dentro de las letras
  logoCache: null,
  buildLogo() {
    const S = Math.min(RES, 6), LW = 360, LH = 70;
    const c = makeCanvas(LW * S, LH * S), g = c.getContext('2d');
    g.scale(S, S);
    const text = 'SPIDER-MAN';
    g.font = 'italic 900 44px ' + ART_FONT; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    const tw = g.measureText(text).width, sx = Math.min(1, 330 / tw);
    g.translate(LW / 2, 46); g.scale(sx, 1); g.transform(1, 0, -0.12, 1, 0, 0);
    // letras en una capa aparte para recortar la telaraña
    const l = makeCanvas(LW * S, LH * S), q = l.getContext('2d');
    q.scale(S, S); q.font = g.font; q.textAlign = 'center'; q.translate(LW / 2, 46); q.scale(sx, 1); q.transform(1, 0, -0.12, 1, 0, 0);
    const gr = q.createLinearGradient(0, -36, 0, 4);
    gr.addColorStop(0, '#ff8a7a'); gr.addColorStop(0.35, '#ee2230'); gr.addColorStop(0.7, '#b40c1e'); gr.addColorStop(1, '#5a0414');
    q.fillStyle = gr; q.fillText(text, 0, 0);
    q.globalCompositeOperation = 'source-atop';
    q.strokeStyle = 'rgba(40,0,6,0.6)'; q.lineWidth = 0.55;
    for (let i = -12; i <= 12; i++) { q.beginPath(); q.moveTo(0, 30); q.lineTo(i * 24, -60); q.stroke(); }
    for (let k = 1; k < 8; k++) { q.beginPath(); q.ellipse(0, 30, k * 26, k * 9, 0, Math.PI, TAU); q.stroke(); }
    q.fillStyle = 'rgba(255,255,255,0.3)'; q.fillRect(-200, -33, 400, 4);
    // relieve y contorno
    for (let i = 7; i > 0; i--) { g.fillStyle = i > 5 ? '#000' : '#4a0610'; g.fillText(text, i * 0.6, i * 0.6); }
    g.lineJoin = 'round'; g.strokeStyle = '#000'; g.lineWidth = 5; g.strokeText(text, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(l, 0, 0);
    this.logoCache = c;
    return c;
  },
  // logotipo con relieve, degradado y telaraña dentro de las letras
  logo(ctx, t, y) {
    const c = this.logoCache || this.buildLogo();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(c, W / 2 - 180, y - 8, 360, 70);
    ctx.imageSmoothingEnabled = false;
    const base = y + 38;
    // subtítulo con aberración cromática
    ctx.save();
    ctx.font = 'italic 900 16px ' + ART_FONT; ctx.textAlign = 'center';
    const gl = Math.sin(t * 3) > 0.96 ? 2 : 0.6;
    ctx.fillStyle = 'rgba(255,40,190,0.85)'; ctx.fillText('ROMPECÁNONES', W / 2 - gl, base + 20);
    ctx.fillStyle = 'rgba(40,240,255,0.85)'; ctx.fillText('ROMPECÁNONES', W / 2 + gl, base + 20);
    ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.strokeStyle = '#000'; ctx.strokeText('ROMPECÁNONES', W / 2, base + 20);
    ctx.fillStyle = '#ffffff'; ctx.fillText('ROMPECÁNONES', W / 2, base + 20);
    ctx.restore();
  },

  // ------------------------------------------------------------ utilidades
  glow(ctx, x, y, r, rgb, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(' + rgb + ',' + a + ')'); g.addColorStop(1, 'rgba(' + rgb + ',0)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  },
  vignette(ctx, a) {
    const g = ctx.createRadialGradient(W / 2, H * 0.48, H * 0.35, W / 2, H * 0.5, W * 0.62);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,8,' + a + ')');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  },

  // ------------------------------------------------------------ atmósfera del juego
  GRADES: {
    night: { top: 'rgba(30,40,120,0.16)', bot: 'rgba(255,140,80,0.05)', fx: 'rain', lamp: '255,214,150' },
    dusk: { top: 'rgba(70,30,120,0.15)', bot: 'rgba(255,120,90,0.08)', fx: 'rain', lamp: '255,210,160' },
    teal: { top: 'rgba(10,60,90,0.18)', bot: 'rgba(80,220,255,0.05)', fx: 'rain', lamp: '160,240,255' },
    sunset: { top: 'rgba(90,30,110,0.12)', bot: 'rgba(255,150,80,0.12)', fx: 'dust', lamp: '255,220,170' },
    golden: { top: 'rgba(120,60,40,0.1)', bot: 'rgba(255,190,90,0.14)', fx: 'dust', lamp: '255,230,180' },
    day: { top: 'rgba(60,120,220,0.06)', bot: 'rgba(255,230,180,0.06)', fx: 'dust', lamp: '255,240,200' },
    verse: { top: 'rgba(160,20,140,0.12)', bot: 'rgba(40,220,255,0.08)', fx: 'spark', lamp: '120,240,255' },
    neon: { top: 'rgba(120,20,160,0.14)', bot: 'rgba(255,60,160,0.08)', fx: 'spark', lamp: '255,120,210' },
    ruin: { top: 'rgba(80,10,0,0.18)', bot: 'rgba(255,90,20,0.14)', fx: 'ember', lamp: '255,120,40' },
    rift: { top: 'rgba(10,60,40,0.18)', bot: 'rgba(80,255,150,0.08)', fx: 'spark', lamp: '140,255,170' },
  },
  // luces con mezcla aditiva (en coordenadas de mundo, con el zoom activo)
  worldLights(ctx, world, cam, t) {
    const lv = world.level;
    if (lv.indoor) return;
    const G = this.GRADES[lv.sky] || this.GRADES.night;
    const dark = lv.night || ['dusk', 'teal', 'neon', 'verse', 'ruin', 'rift'].includes(lv.sky);
    if (!dark) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const d of lv.decor) {
      if (d.type !== 'lamp' || d.y !== lv.groundY) continue;
      const x = d.x - cam.x + 10, yb = d.y - (cam.y + STREET_D - 2), y = yb - 33;
      if (x < -60 || x > VW + 60) continue;
      const fl = 0.92 + Math.sin(t * 13 + d.x) * 0.03;
      this.glow(ctx, x, y, 22, G.lamp, 0.55 * fl); this.glow(ctx, x, y, 5, '255,255,240', 0.8);
      // cono de luz hasta la acera
      const gr = ctx.createLinearGradient(0, y, 0, yb + 4);
      gr.addColorStop(0, 'rgba(' + G.lamp + ',' + (0.28 * fl) + ')'); gr.addColorStop(1, 'rgba(' + G.lamp + ',0.02)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(x - 2, y); ctx.lineTo(x + 2, y); ctx.lineTo(x + 16, yb + 4); ctx.lineTo(x - 16, yb + 4); ctx.fill();
      // reflejo alargado en el asfalto mojado
      const ry = lv.groundY - cam.y - STREET_D * 0.45;
      const rr = ctx.createLinearGradient(0, ry - 14, 0, ry + 14);
      rr.addColorStop(0, 'rgba(' + G.lamp + ',0)'); rr.addColorStop(0.5, 'rgba(' + G.lamp + ',0.16)'); rr.addColorStop(1, 'rgba(' + G.lamp + ',0)');
      ctx.fillStyle = rr; ctx.fillRect(x - 3 + Math.sin(t * 2 + d.x) * 0.5, ry - 14, 6, 28);
    }
    ctx.restore();
  },
  // gradación, clima y viñeta (en coordenadas de pantalla)
  particles: [],
  screenGrade(ctx, world, t) {
    const lv = world.level;
    const G = this.GRADES[lv.sky] || this.GRADES.night;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, G.top); g.addColorStop(0.55, 'rgba(0,0,0,0)'); g.addColorStop(1, G.bot);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (!lv.indoor) this.weather(ctx, G.fx, t, world.cam);
    this.vignette(ctx, lv.indoor ? 0.5 : 0.38);
  },
  weather(ctx, kind, t, cam) {
    const n = kind === 'rain' ? 90 : 36, px = cam.x * ZOOM, py = cam.y * ZOOM;
    ctx.save();
    if (kind === 'rain') {
      ctx.strokeStyle = 'rgba(190,205,255,0.22)'; ctx.lineWidth = 0.4; ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = ((i * 97.3 - px * 0.9 - t * 60) % (W + 20) + W + 20) % (W + 20) - 10, y = ((i * 41.7 - py + t * 330) % (H + 20) + H + 20) % (H + 20) - 10;
        ctx.moveTo(x, y); ctx.lineTo(x - 2.5, y + 9);
      }
      ctx.stroke();
    } else {
      ctx.globalCompositeOperation = 'lighter';
      const col = kind === 'ember' ? '255,120,40' : kind === 'spark' ? '160,230,255' : '255,240,210';
      for (let i = 0; i < n; i++) {
        const sp = kind === 'ember' ? -24 : 5;
        const x = ((i * 71.3 - px * 0.6 + Math.sin(t * 0.7 + i) * 12) % (W + 20) + W + 20) % (W + 20) - 10;
        const y = ((i * 53.1 - py * 0.6 + t * sp * (1 + (i % 3) * 0.4)) % (H + 20) + H + 20) % (H + 20) - 10;
        const tw = 0.5 + 0.5 * Math.sin(t * 3 + i * 1.7);
        ctx.fillStyle = 'rgba(' + col + ',' + (0.25 + tw * 0.45).toFixed(2) + ')';
        ctx.beginPath(); ctx.arc(x, y, kind === 'dust' ? 0.5 : 0.7 + tw * 0.4, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  },

  // ------------------------------------------------------------ onomatopeyas de cómic
  pop(ctx, x, y, text, t, col) {
    const u = Math.min(1, t * 8), s = (t < 0.12 ? 0.6 + u * 0.6 : 1.2 - Math.min(0.2, (t - 0.12))) * 0.75;
    const a = t > 0.45 ? Math.max(0, 1 - (t - 0.45) * 4) : 1;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.rotate(-0.15 + (text.length % 3) * 0.1); ctx.scale(s, s);
    // estallido de estrella
    const spikes = 12, R0 = 12, R1 = 8;
    const star = (grow) => { ctx.beginPath(); for (let i = 0; i < spikes * 2; i++) { const rr = (i % 2 ? R1 : R0 + (i % 4 === 0 ? 2 : 0)) + grow, an = i / (spikes * 2) * TAU; ctx.lineTo(Math.cos(an) * rr * 1.35, Math.sin(an) * rr); } ctx.closePath(); };
    ctx.fillStyle = '#000'; star(1.2); ctx.fill();
    ctx.fillStyle = col || '#ffe040'; star(0); ctx.fill();
    ctx.fillStyle = '#ffffff'; star(-4.5); ctx.fill();
    ctx.font = 'italic 900 6px ' + ART_FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = 1.6; ctx.strokeStyle = '#000'; ctx.strokeText(text, 0, 0.5);
    ctx.fillStyle = '#e02030'; ctx.fillText(text, 0, 0.5);
    ctx.restore();
  },

  // ------------------------------------------------------------ objetos de la calle
  lamp(ctx, sx, sy, night) {
    ctx.fillStyle = '#10141a';
    ctx.beginPath(); ctx.roundRect(sx - 1.6, sy - 3, 5.2, 3, 0.6); ctx.fill();                 // base
    const g = ctx.createLinearGradient(sx, 0, sx + 2, 0); g.addColorStop(0, '#4a5462'); g.addColorStop(1, '#161a22');
    ctx.fillStyle = g; ctx.fillRect(sx, sy - 34, 2, 31);
    ctx.strokeStyle = '#161a22'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(sx + 1, sy - 33); ctx.quadraticCurveTo(sx + 2, sy - 38, sx + 9, sy - 36); ctx.stroke();
    ctx.fillStyle = '#161a22'; ctx.beginPath(); ctx.moveTo(sx + 6, sy - 36); ctx.lineTo(sx + 13, sy - 36); ctx.lineTo(sx + 11.5, sy - 33.5); ctx.lineTo(sx + 7.5, sy - 33.5); ctx.fill();
    ctx.fillStyle = night ? '#fff4c8' : '#c8ccd0'; ctx.beginPath(); ctx.ellipse(sx + 9.5, sy - 33.3, 2, 0.8, 0, 0, TAU); ctx.fill();
  },
  hydrant(ctx, sx, sy) {
    ctx.fillStyle = '#1a0406'; ctx.beginPath(); ctx.roundRect(sx - 1.4, sy - 8.6, 7.8, 8.8, 1.4); ctx.fill();
    const g = ctx.createLinearGradient(sx - 1, 0, sx + 6, 0); g.addColorStop(0, '#ff6a58'); g.addColorStop(0.45, '#d42020'); g.addColorStop(1, '#6a0808');
    ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(sx - 0.5, sy - 7.6, 6, 7.6, 1); ctx.fill();
    ctx.beginPath(); ctx.ellipse(sx + 2.5, sy - 7.8, 2.4, 1.6, 0, Math.PI, TAU); ctx.fill();
    ctx.fillStyle = '#b8a060'; ctx.fillRect(sx - 1.6, sy - 5.2, 8.2, 1.4); ctx.fillRect(sx + 1.8, sy - 9.8, 1.4, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(sx + 0.3, sy - 7, 0.6, 5);
  },
  car(ctx, sx, sy, color, taxi) {
    const c = color || '#c0a020';
    ctx.save(); ctx.translate(sx, sy);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(17, 0.2, 18, 1.6, 0, 0, TAU); ctx.fill();
    // carrocería con curvas
    const body = () => { ctx.beginPath(); ctx.moveTo(0.5, -4); ctx.lineTo(0.5, -8.5); ctx.quadraticCurveTo(1, -10.5, 5, -10.5); ctx.lineTo(8, -10.8); ctx.lineTo(12, -15.5); ctx.quadraticCurveTo(13, -16.4, 15, -16.4); ctx.lineTo(23, -16.4); ctx.quadraticCurveTo(25, -16.4, 26.5, -14.5); ctx.lineTo(29, -10.8); ctx.lineTo(32, -10.2); ctx.quadraticCurveTo(34, -9.5, 34, -7); ctx.lineTo(34, -4); ctx.closePath(); };
    ctx.fillStyle = '#050508'; ctx.save(); ctx.translate(0, 0); ctx.scale(1, 1); body(); ctx.lineWidth = 1.2; ctx.strokeStyle = '#050508'; ctx.stroke(); ctx.restore();
    const g = ctx.createLinearGradient(0, -16, 0, -3); g.addColorStop(0, shade(c, 0.35)); g.addColorStop(0.45, c); g.addColorStop(1, shade(c, -0.5));
    ctx.fillStyle = g; body(); ctx.fill();
    // ventanas con reflejo
    const gw = ctx.createLinearGradient(12, -16, 26, -11); gw.addColorStop(0, '#bfe4ff'); gw.addColorStop(0.5, '#4a6a90'); gw.addColorStop(1, '#1a2438');
    ctx.fillStyle = gw;
    ctx.beginPath(); ctx.moveTo(9.5, -11); ctx.lineTo(13, -15.2); ctx.lineTo(18.5, -15.2); ctx.lineTo(18.5, -11); ctx.fill();
    ctx.beginPath(); ctx.moveTo(19.5, -11); ctx.lineTo(19.5, -15.2); ctx.lineTo(24.5, -15.2); ctx.lineTo(27.5, -11); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0.5, -7.4, 33.5, 0.5);               // línea de puertas
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(2, -10, 30, 0.5);
    if (taxi) {
      for (let i = 0; i < 16; i++) { ctx.fillStyle = i % 2 ? '#111' : '#f4f0e0'; ctx.fillRect(2 + i * 1.9, -7, 1.9, 1); }
      ctx.fillStyle = '#111'; ctx.fillRect(15, -18.2, 7, 1.9); ctx.fillStyle = '#ffe890'; ctx.fillRect(15.5, -17.8, 6, 1.1);
    }
    ctx.fillStyle = '#fff6c0'; ctx.beginPath(); ctx.ellipse(33.4, -7.8, 0.7, 1.1, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ff3030'; ctx.fillRect(0.3, -8.8, 0.9, 1.8);
    // ruedas con llanta
    for (const wx of [7.5, 26.5]) {
      ctx.fillStyle = '#050505'; ctx.beginPath(); ctx.arc(wx, -3.5, 3.6, 0, TAU); ctx.fill();
      ctx.fillStyle = '#8a9098'; ctx.beginPath(); ctx.arc(wx, -3.5, 1.8, 0, TAU); ctx.fill();
      ctx.fillStyle = '#d8dde4'; ctx.beginPath(); ctx.arc(wx - 0.4, -3.9, 0.7, 0, TAU); ctx.fill();
    }
    ctx.restore();
  },

  // ------------------------------------------------------------ proyectiles y objetos
  proj(ctx, p, x, y, t) {
    const l = Math.hypot(p.vx, p.vy) || 1, dx = p.vx / l, dy = p.vy / l;
    const trail = (len, w, c0, c1) => {
      const g = ctx.createLinearGradient(x, y, x - dx * len, y - dy * len); g.addColorStop(0, c0); g.addColorStop(1, c1);
      ctx.strokeStyle = g; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - dx * len, y - dy * len); ctx.stroke();
    };
    switch (p.kind) {
      case 'web': case 'net': case 'darkweb': case 'redweb': {
        const c = p.kind === 'darkweb' ? '#302838' : p.kind === 'redweb' ? '#ff4050' : '#ffffff';
        trail(10, 0.8, c, 'rgba(255,255,255,0)');
        ctx.strokeStyle = c; ctx.lineWidth = 0.4;
        const r = p.kind === 'net' ? 5 : 3;
        for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + t * 3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); ctx.stroke(); }
        ctx.beginPath(); ctx.arc(x, y, r * 0.6, 0, TAU); ctx.stroke();
        ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, 1.1, 0, TAU); ctx.fill();
        return true;
      }
      case 'bullet': trail(9, 1.2, '#fff6c0', 'rgba(255,160,40,0)'); this.glow(ctx, x, y, 3, '255,220,120', 0.8); return true;
      case 'laser': trail(12, 1.4, p.fake ? '#b0ffc8' : '#ffd0d0', p.fake ? 'rgba(60,255,120,0)' : 'rgba(255,40,40,0)'); this.glow(ctx, x, y, 4, p.fake ? '60,255,120' : '255,60,60', 0.7); return true;
      case 'orb': case 'eorb': case 'riftorb': case 'shock': {
        const rgb = p.kind === 'orb' ? '200,120,255' : p.kind === 'riftorb' ? '100,255,170' : '120,200,255';
        const r = p.kind === 'shock' ? 7 : 5;
        this.glow(ctx, x, y, r * 1.8, rgb, 0.6);
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, y, r * 0.45, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(' + rgb + ',0.95)'; ctx.lineWidth = 0.5;
        for (let i = 0; i < 4; i++) { const a = t * 20 + i * 1.7; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a * 1.3) * r); ctx.stroke(); }
        return true;
      }
      case 'bomb': {
        ctx.fillStyle = '#0a0a0c'; ctx.beginPath(); ctx.arc(x, y, 3.2, 0, TAU); ctx.fill();
        ctx.fillStyle = '#3a3e48'; ctx.beginPath(); ctx.arc(x - 0.8, y - 0.8, 1.6, 0, TAU); ctx.fill();
        this.glow(ctx, x + 1.5, y - 3.6, 3, Math.floor(t * 12) % 2 ? '255,80,40' : '255,230,120', 0.9);
        return true;
      }
      case 'feather': {
        ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(dy, dx));
        ctx.fillStyle = '#0a0c10'; ctx.beginPath(); ctx.ellipse(0, 0, 4.6, 1.5, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#c8d0dc'; ctx.beginPath(); ctx.ellipse(0, 0, 4, 1, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#50ff60'; ctx.lineWidth = 0.3; ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(4, 0); ctx.stroke();
        ctx.restore(); return true;
      }
      case 'acid': {
        this.glow(ctx, x, y, 5, '140,255,80', 0.5);
        ctx.fillStyle = '#90ff60'; ctx.beginPath(); ctx.moveTo(x - dx * 4, y - dy * 4); ctx.arc(x, y, 2.2, 0, TAU); ctx.fill();
        ctx.fillStyle = '#e8ffc0'; ctx.beginPath(); ctx.arc(x - 0.7, y - 0.7, 0.7, 0, TAU); ctx.fill();
        return true;
      }
      default: return false;
    }
  },
  pickup(ctx, kind, x, y, t) {
    const b = Math.sin(t * 4) * 0.5;
    if (kind === 'health') {
      this.glow(ctx, x + 3, y + 3, 7, '80,255,120', 0.35 + b * 0.1);
      ctx.fillStyle = '#062010'; ctx.beginPath(); ctx.roundRect(x - 0.5, y - 0.5, 7, 7, 1.5); ctx.fill();
      const g = ctx.createLinearGradient(0, y, 0, y + 6); g.addColorStop(0, '#9cffb0'); g.addColorStop(1, '#20a040');
      ctx.fillStyle = g; ctx.fillRect(x + 2.2, y + 0.6, 1.6, 4.8); ctx.fillRect(x + 0.6, y + 2.2, 4.8, 1.6);
    } else {
      this.glow(ctx, x + 3, y + 3, 7, '255,210,80', 0.35 + b * 0.1);
      ctx.save(); ctx.translate(x + 3, y + 3); ctx.rotate(t * 1.5);
      ctx.fillStyle = '#3a2808';
      for (let i = 0; i < 8; i++) { ctx.rotate(TAU / 8); ctx.fillRect(-0.8, -3.6, 1.6, 1.6); }
      const g = ctx.createRadialGradient(-1, -1, 0, 0, 0, 3); g.addColorStop(0, '#fff2a0'); g.addColorStop(1, '#c08a20');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, TAU); ctx.fill();
      ctx.fillStyle = '#3a2808'; ctx.beginPath(); ctx.arc(0, 0, 0.9, 0, TAU); ctx.fill();
      ctx.restore();
    }
  },
  drone(ctx, x, y, body, eye, t, f) {
    ctx.save(); ctx.translate(x, y + 4);
    this.glow(ctx, 0, 5, 5, eye === '#60ff90' ? '96,255,144' : '255,80,80', 0.35);
    ctx.fillStyle = '#07080a'; ctx.beginPath(); ctx.ellipse(0, 0, 7.4, 3.6, 0, 0, TAU); ctx.fill();
    const g = ctx.createLinearGradient(0, -3, 0, 3); g.addColorStop(0, shade(body, 0.45)); g.addColorStop(1, shade(body, -0.45));
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, 6.6, 2.9, 0, 0, TAU); ctx.fill();
    // rotores
    for (const sx of [-7, 7]) {
      ctx.fillStyle = '#20242c'; ctx.fillRect(sx - 0.4, -4, 0.8, 2.5);
      ctx.fillStyle = 'rgba(200,210,230,0.5)'; ctx.beginPath(); ctx.ellipse(sx, -4, 3.5 + Math.sin(t * 60) * 0.8, 0.5, 0, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = '#050505'; ctx.beginPath(); ctx.arc(f * 2.5, 0.6, 1.7, 0, TAU); ctx.fill();
    ctx.fillStyle = eye; ctx.beginPath(); ctx.arc(f * 2.5, 0.6, 1.1, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(f * 2.5 - 0.6, 0, 0.5, 0.5);
    ctx.restore();
  },
};
