'use strict';
// ---------------------------------------------------------------------------
// Modelo 3D procedural de personaje (Spider-Man, villanos y matones).
// Cuerpo musculoso hecho con superficies de revolución, texturas pintadas en
// canvas a partir de la paleta de cada traje (telarañas en relieve, costados,
// franjas, emblema), lentes 3D curvadas sobre la máscara y un esqueleto sencillo
// animado por poses.
// ---------------------------------------------------------------------------
const TEX_CACHE = new Map();

function canvasTex(w, h, paint, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Silueta de araña del emblema (estilo: small, long, big)
function drawSpider(g, cx, cy, s, style, color) {
  g.save(); g.translate(cx, cy); g.scale(s, s); g.fillStyle = color; g.strokeStyle = color; g.lineCap = 'round';
  const E = EMBLEMS[style || 'small'] || EMBLEMS.small;
  for (const b of E.body) { g.beginPath(); g.ellipse(b[0], b[1], b[2], b[3], 0, 0, TAU); g.fill(); }
  for (const side of [-1, 1]) for (const l of E.legs) {
    g.lineWidth = E.lw * 2; g.beginPath(); g.moveTo(side * l[0], l[1]); g.lineTo(side * l[2], l[3]); g.lineTo(side * l[4], l[5]); g.stroke();
  }
  g.restore();
}

// Líneas de telaraña: rejilla que sigue la superficie (u alrededor, v a lo largo)
function webGrid(g, w, h, nu, nv, color, lw, x0 = 0, x1 = w, y0 = 0, y1 = h) {
  g.strokeStyle = color; g.lineWidth = lw;
  for (let k = 0; k <= nu; k++) { const x = x0 + (x1 - x0) * k / nu; g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke(); }
  for (let k = 0; k <= nv; k++) {
    const y = y0 + (y1 - y0) * k / nv;
    g.beginPath();
    for (let x = x0; x <= x1; x += w / nu) { const xm = x + w / nu / 2; g.moveTo(x, y); g.quadraticCurveTo(xm, y + (y1 - y0) / nv * 0.3, x + w / nu, y); }
    g.stroke();
  }
}
function webRadial(g, cx, cy, rMax, spokes, rings, color, lw, sx = 1) {
  g.strokeStyle = color; g.lineWidth = lw;
  for (let k = 0; k < spokes; k++) { const a = k / spokes * TAU; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * rMax * sx, cy + Math.sin(a) * rMax); g.stroke(); }
  for (let k = 1; k <= rings; k++) {
    const rr = rMax * k / rings;
    g.beginPath();
    for (let s = 0; s <= spokes; s++) {
      const a = s / spokes * TAU, a2 = (s + 0.5) / spokes * TAU, a3 = (s + 1) / spokes * TAU;
      const p = [cx + Math.cos(a) * rr * sx, cy + Math.sin(a) * rr];
      if (s === 0) g.moveTo(p[0], p[1]);
      g.quadraticCurveTo(cx + Math.cos(a2) * rr * 0.9 * sx, cy + Math.sin(a2) * rr * 0.9, cx + Math.cos(a3) * rr * sx, cy + Math.sin(a3) * rr);
    }
    g.stroke();
  }
}

// Texturas de un traje / atuendo a partir de su paleta
function suitTextures(pal, key) {
  if (TEX_CACHE.has(key)) return TEX_CACHE.get(key);
  const webs = !!pal.webs, wl = pal.webLine || shade(pal.torso, -0.45);
  const T = {};
  const both = (w, h, paint) => ({ map: canvasTex(w, h, (g) => paint(g, false)), bump: canvasTex(w, h, (g) => paint(g, true), false) });
  // relieve: blanco = alto (las telarañas sobresalen)
  const col = (bump, c, hi = 0.2) => (bump ? 'rgb(' + Math.round(hi * 255) + ',' + Math.round(hi * 255) + ',' + Math.round(hi * 255) + ')' : c);
  // --- torso (u alrededor, frente en u=0.5; v de abajo arriba) ---
  T.torso = both(512, 512, (g, bump) => {
    const W = 512, H = 512;
    g.fillStyle = col(bump, pal.torso); g.fillRect(0, 0, W, H);
    const ey = H * 0.3; // centro del emblema (y del lienzo, arriba = cuello)
    if (webs) {
      webRadial(g, W / 2, ey, 360, 14, 9, col(bump, wl, 0.9), bump ? 3 : 2, 1);
      webRadial(g, 0, ey, 300, 12, 8, col(bump, wl, 0.9), bump ? 3 : 2); webRadial(g, W, ey, 300, 12, 8, col(bump, wl, 0.9), bump ? 3 : 2);
    }
    if (pal.side) {
      g.fillStyle = col(bump, pal.side, 0.25);
      for (const cx of [W * 0.25, W * 0.75]) { g.beginPath(); g.moveTo(cx - 44, H); g.lineTo(cx - 60, H * 0.35); g.quadraticCurveTo(cx, H * 0.12, cx + 60, H * 0.35); g.lineTo(cx + 44, H); g.fill(); }
      if (pal.trim) {
        g.strokeStyle = col(bump, pal.trim, 0.7); g.lineWidth = 7;
        for (const cx of [W * 0.25, W * 0.75]) { g.beginPath(); g.moveTo(cx - 44, H); g.lineTo(cx - 60, H * 0.35); g.quadraticCurveTo(cx, H * 0.12, cx + 60, H * 0.35); g.lineTo(cx + 44, H); g.stroke(); }
      }
    }
    if (pal.torsoLow && pal.torsoLow !== pal.torso) { g.fillStyle = col(bump, pal.torsoLow, 0.25); g.fillRect(0, H * 0.78, W, H * 0.22); }
    if (pal.deco === 'burn') { for (let i = 0; i < 40; i++) { g.fillStyle = bump ? '#000' : (i % 5 ? '#2a1a14' : '#e06020'); g.beginPath(); g.ellipse(Math.random() * W, Math.random() * H, 6 + Math.random() * 26, 4 + Math.random() * 14, Math.random() * 3, 0, TAU); g.fill(); } }
    if (pal.deco === 'stealth') { g.strokeStyle = col(bump, '#3a4458', 0.6); g.lineWidth = 3; for (const x of [W * 0.3, W * 0.7]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); } }
    if (pal.emblem) {
      const sz = pal.emblemStyle === 'big' ? 17 : pal.emblemStyle === 'long' ? 12 : 10;
      drawSpider(g, W / 2, ey + 6, sz, pal.emblemStyle, col(bump, pal.emblem, 0.7));
      if (pal.emblemStyle === 'long' || pal.emblemStyle === 'big') drawSpider(g, 0, ey + 40, sz * 0.8, 'small', col(bump, pal.emblem, 0.7));
      if (pal.emblemStyle === 'long' || pal.emblemStyle === 'big') drawSpider(g, W, ey + 40, sz * 0.8, 'small', col(bump, pal.emblem, 0.7));
    }
  });
  // --- pelvis ---
  T.pelvis = both(256, 128, (g, bump) => {
    g.fillStyle = col(bump, pal.torsoLow || pal.torso); g.fillRect(0, 0, 256, 128);
    if (pal.side) { g.fillStyle = col(bump, pal.side, 0.25); g.fillRect(40, 0, 50, 128); g.fillRect(166, 0, 50, 128); }
    if (webs && (pal.torsoLow || pal.torso) === pal.head) webGrid(g, 256, 128, 12, 3, col(bump, wl, 0.9), bump ? 3 : 2);
    if (pal.deco === 'hood' || pal.face === 'human' || pal.face === 'beanie' || pal.face === 'mask') { g.fillStyle = col(bump, shade(pal.torsoLow || pal.torso, -0.35)); g.fillRect(0, 0, 256, 14); }
  });
  // --- extremidades (v=1 arriba, junto a la articulación) ---
  const limb = (base, low, lowFrom, extra) => both(128, 256, (g, bump) => {
    g.fillStyle = col(bump, base); g.fillRect(0, 0, 128, 256);
    if (webs && base === pal.head) webGrid(g, 128, 256, 8, 9, col(bump, wl, 0.9), bump ? 3 : 2);
    if (low && low !== base) {
      const y = 256 * lowFrom;
      g.fillStyle = col(bump, low); g.fillRect(0, y, 128, 256 - y);
      if (webs && low === pal.head) webGrid(g, 128, 256 - y, 8, Math.max(2, Math.round(9 * (1 - lowFrom))), col(bump, wl, 0.9), bump ? 3 : 2, 0, 128, y, 256);
      if (pal.trim) { g.fillStyle = col(bump, pal.trim, 0.7); g.fillRect(0, y - 4, 128, 6); }
    }
    if (extra) extra(g, bump);
  });
  const human = pal.face === 'human' || pal.face === 'beanie' || pal.face === 'mask' || pal.face === 'goggles';
  T.upperArm = pal.shoulder ? limb(pal.shoulder, pal.arm, 0.36) : limb(pal.arm);
  T.foreArm = limb(pal.arm2, human ? pal.hand : pal.hand, human ? 0.86 : 0.92);
  T.hand = limb(pal.hand);
  T.pec = limb(pal.torso);
  T.thigh = limb(pal.leg);
  T.shin = limb(pal.leg, pal.boot, 0.42);
  T.foot = limb(pal.boot);
  // --- cabeza (esfera: cara en u=0.25, arriba = arriba del lienzo) ---
  T.head = both(512, 256, (g, bump) => {
    const W = 512, H = 256, fx = W * 0.25, fy = H * 0.56;
    g.fillStyle = col(bump, pal.head); g.fillRect(0, 0, W, H);
    switch (pal.face) {
      case 'spider': case 'venom':
        if (webs) { webRadial(g, fx, fy, 260, 16, 8, col(bump, wl, 0.9), bump ? 3 : 2, 1); webRadial(g, fx + W / 2, fy - 20, 200, 12, 6, col(bump, wl, 0.9), bump ? 3 : 2, 1); webRadial(g, fx - W / 2, fy - 20, 200, 12, 6, col(bump, wl, 0.9), bump ? 3 : 2, 1); }
        if (pal.face === 'venom') {
          g.fillStyle = col(bump, '#6a0a20'); g.beginPath(); g.ellipse(fx, H * 0.78, 60, 20, 0, 0, TAU); g.fill();
          g.fillStyle = col(bump, '#f4f4f4', 0.6);
          for (let k = -5; k <= 5; k++) { g.beginPath(); g.moveTo(fx + k * 11 - 5, H * 0.7); g.lineTo(fx + k * 11 + 5, H * 0.7); g.lineTo(fx + k * 11, H * 0.78); g.fill(); g.beginPath(); g.moveTo(fx + k * 11 - 5, H * 0.86); g.lineTo(fx + k * 11 + 5, H * 0.86); g.lineTo(fx + k * 11, H * 0.78); g.fill(); }
        }
        if (pal.deco === 'burn') for (let i = 0; i < 14; i++) { g.fillStyle = bump ? '#000' : (i % 4 ? '#2a1a14' : '#e06020'); g.beginPath(); g.ellipse(Math.random() * W, Math.random() * H, 8 + Math.random() * 20, 5 + Math.random() * 10, 0, 0, TAU); g.fill(); }
        break;
      case 'human': case 'beanie': case 'mask': case 'goggles': {
        const hair = pal.face === 'mask' ? pal.hair : pal.hair;
        if (pal.face === 'mask') { g.fillStyle = col(bump, hair); g.fillRect(0, 0, W, H); for (const s of [-1, 1]) { g.fillStyle = col(bump, '#e8c8a8'); g.fillRect(fx + s * 24 - 12, fy - 22, 24, 12); g.fillStyle = col(bump, '#140a12'); g.fillRect(fx + s * 24 - 4, fy - 20, 8, 8); } break; }
        if (pal.face === 'goggles') {
          g.fillStyle = col(bump, pal.head); g.fillRect(0, 0, W, H);
          g.fillStyle = col(bump, '#202024'); g.fillRect(0, fy - 34, W, 22);
          for (const s of [-1, 1]) { g.fillStyle = col(bump, '#202024'); g.beginPath(); g.arc(fx + s * 26, fy - 22, 22, 0, TAU); g.fill(); g.fillStyle = col(bump, pal.eye, 0.5); g.beginPath(); g.arc(fx + s * 26, fy - 22, 15, 0, TAU); g.fill(); }
          break;
        }
        // pelo arriba y detrás, orejas, ojos, cejas y boca
        g.fillStyle = col(bump, hair, 0.5);
        g.fillRect(0, 0, W, pal.face === 'beanie' ? H * 0.42 : H * 0.34);
        g.beginPath(); g.ellipse(W * 0.75, H * 0.3, W * 0.2, H * 0.36, 0, 0, TAU); g.fill();
        if (pal.face === 'beanie') { g.fillStyle = col(bump, shade(hair, -0.3)); g.fillRect(0, H * 0.4, W, 8); }
        for (const s of [-1, 1]) {
          g.fillStyle = col(bump, '#f4f0ea'); g.beginPath(); g.ellipse(fx + s * 22, fy - 16, 9, 5, 0, 0, TAU); g.fill();
          g.fillStyle = col(bump, '#2a1a10'); g.beginPath(); g.arc(fx + s * 22, fy - 16, 4, 0, TAU); g.fill();
          g.fillStyle = col(bump, hair); g.fillRect(fx + s * 22 - 11, fy - 30, 22, 4);
          g.fillStyle = col(bump, shade(pal.head, -0.15)); g.beginPath(); g.ellipse(fx + s * 128, fy - 6, 10, 18, 0, 0, TAU); g.fill();
        }
        g.fillStyle = col(bump, shade(pal.head, -0.25)); g.fillRect(fx - 5, fy - 10, 10, 18);
        g.fillStyle = col(bump, '#8a3a3a'); g.fillRect(fx - 14, fy + 22, 28, 4);
        break;
      }
      case 'visor':
        g.fillStyle = col(bump, '#101014'); g.fillRect(0, fy - 36, W * 0.5, 40);
        g.fillStyle = col(bump, pal.eye, 0.6); g.fillRect(fx - 60, fy - 28, 120, 18);
        break;
      case 'spot':
        g.fillStyle = col(bump, '#101010');
        for (const s of [[fx, fy - 14, 34], [fx + 60, fy + 30, 18], [fx - 140, fy - 60, 26], [fx + 200, fy, 30], [fx - 50, fy + 50, 14]]) { g.beginPath(); g.arc(s[0], s[1], s[2], 0, TAU); g.fill(); }
        break;
      case 'bowl':
        g.fillStyle = col(bump, '#4cd060'); g.fillRect(0, 0, W, H);
        break;
      default: break;
    }
    if (pal.deco === 'hood' && !bump) { g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(W * 0.45, 0, W * 0.6, H); }
  });
  // emisivo para visores y ojos brillantes
  if (pal.face === 'visor') T.headEmissive = canvasTex(512, 256, (g) => { g.fillStyle = '#000'; g.fillRect(0, 0, 512, 256); g.fillStyle = pal.eye; g.fillRect(128 - 60, 256 * 0.56 - 28, 120, 18); });
  TEX_CACHE.set(key, T);
  return T;
}

// Superficie de revolución para una extremidad que cuelga hacia -Y desde la articulación
function limbGeo(len, r0, r1, bulge = 0, bp = 0.6, seg = 14) {
  const pts = [new THREE.Vector2(0.0005, -len - r1 * 0.75)];
  for (let k = 0; k <= 12; k++) {
    const t = k / 12;
    const r = lerp(r1, r0, t) + bulge * Math.exp(-((t - bp) * (t - bp)) / 0.045);
    pts.push(new THREE.Vector2(r, -len + t * len));
  }
  pts.push(new THREE.Vector2(r0 * 0.6, r0 * 0.45));
  pts.push(new THREE.Vector2(0.0005, r0 * 0.6));
  const g = new THREE.LatheGeometry(pts, seg, Math.PI);
  g.computeVertexNormals();
  return g;
}
function torsoGeo(profile, sz) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 24, Math.PI);
  g.scale(1, 1, sz);
  g.computeVertexNormals();
  return g;
}

// Lente de la máscara proyectada sobre la esfera de la cabeza
function lensGeo(R, side, scale, grow, venom) {
  const s = new THREE.Shape();
  if (venom) {
    s.moveTo(-0.01, 0.035); s.quadraticCurveTo(0.05, 0.075, 0.1, 0.03); s.lineTo(0.085, -0.02); s.quadraticCurveTo(0.03, -0.055, -0.015, -0.03); s.lineTo(-0.01, 0.035);
  } else {
    // lente estilo MCU: ancha, con la punta exterior hacia arriba
    s.moveTo(-0.006, 0.018); s.quadraticCurveTo(0.03, 0.036, 0.078, 0.036); s.lineTo(0.084, 0.012); s.quadraticCurveTo(0.06, -0.03, 0.012, -0.032); s.quadraticCurveTo(-0.016, -0.02, -0.006, 0.018);
  }
  const g = subdivide(new THREE.ShapeGeometry(s, 12).toNonIndexed(), 3);
  const pos = g.attributes.position, v = new THREE.Vector3();
  // centro del ojo sobre la cara
  const ang = 0.12 * side, ey = 0.022;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i);
    x = (x - 0.03) * scale + 0.03; y *= scale;
    const px = side * (0.012 + x) , py = ey + y;
    v.set(Math.sin(ang) * R + px * Math.cos(ang), py, Math.cos(ang) * R);
    v.normalize().multiplyScalar(R * grow);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  if (side < 0) { const a = g.attributes.position.array; for (let i = 0; i < a.length; i += 9) for (let k = 0; k < 3; k++) { const t = a[i + 3 + k]; a[i + 3 + k] = a[i + 6 + k]; a[i + 6 + k] = t; } }
  g.computeVertexNormals();
  return g;
}
// Subdivide triángulos (geometría sin índices) para que se curven bien al proyectarlos
function subdivide(g, n) {
  let a = Array.from(g.attributes.position.array);
  for (let it = 0; it < n; it++) {
    const o = [];
    for (let i = 0; i < a.length; i += 9) {
      const A = a.slice(i, i + 3), B = a.slice(i + 3, i + 6), C = a.slice(i + 6, i + 9);
      const m = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
      const ab = m(A, B), bc = m(B, C), ca = m(C, A);
      o.push(...A, ...ab, ...ca, ...ab, ...B, ...bc, ...ca, ...bc, ...C, ...ab, ...bc, ...ca);
    }
    a = o;
  }
  const r = new THREE.BufferGeometry();
  r.setAttribute('position', new THREE.Float32BufferAttribute(a, 3));
  return r;
}

// Joints: nombres del esqueleto
const JOINTS = ['hips', 'spine', 'neck', 'head', 'shL', 'elL', 'haL', 'shR', 'elR', 'haR', 'thL', 'knL', 'ftL', 'thR', 'knR', 'ftR'];

class Rig3D {
  constructor(pal, o = {}) {
    this.pal = pal;
    const s = o.scale || 1, bulk = o.bulk || 1;
    this.root = new THREE.Group();
    this.body = new THREE.Group(); this.root.add(this.body); this.body.scale.setScalar(s);
    const T = suitTextures(pal, o.key || JSON.stringify(pal).slice(0, 400));
    const mat = (t, extra = {}) => new THREE.MeshStandardMaterial(Object.assign({ map: t.map, bumpMap: t.bump, bumpScale: 2.2, roughness: pal.face === 'visor' ? 0.45 : 0.62, metalness: pal.deco === 'ironlegs' ? 0.35 : 0.04 }, extra));
    const mesh = (geo, m, parent) => { const me = new THREE.Mesh(geo, m); me.castShadow = true; me.receiveShadow = true; parent.add(me); return me; };
    const J = this.j = {};
    const grp = (name, parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); J[name] = g; return g; };
    const hips = grp('hips', this.body, 0, 0.98, 0);
    mesh(torsoGeo([[0.0005, -0.13], [0.08, -0.12], [0.132 * bulk, -0.07], [0.14 * bulk, -0.01], [0.135 * bulk, 0.06], [0.128 * bulk, 0.12]], 0.7), mat(T.pelvis), hips);
    const spine = grp('spine', hips, 0, 0.1, 0);
    this.torso = mesh(torsoGeo([[0.125 * bulk, 0], [0.13 * bulk, 0.07], [0.15 * bulk, 0.16], [0.175 * bulk, 0.24], [0.192 * bulk, 0.31], [0.2 * bulk, 0.37], [0.175 * bulk, 0.43], [0.11, 0.47], [0.055, 0.5], [0.0005, 0.505]], 0.64), mat(T.torso), spine);
    // pectorales y trapecios para dar volumen
    const pec = new THREE.SphereGeometry(0.09, 14, 10); pec.scale(1, 0.62, 0.55);
    for (const sx of [-1, 1]) { const p = mesh(pec, mat(T.pec), spine); p.position.set(sx * 0.075 * bulk, 0.34, 0.07 * bulk); }
    const trap = new THREE.SphereGeometry(0.075, 12, 8); trap.scale(1.2, 0.55, 0.8);
    for (const sx of [-1, 1]) { const p = mesh(trap, mat(T.pec), spine); p.position.set(sx * 0.1 * bulk, 0.43, -0.02); }
    const neck = grp('neck', spine, 0, 0.47, 0);
    mesh(limbGeo(0.08, 0.052, 0.058, 0, 0.5, 10).rotateX(Math.PI).translate(0, 0, 0), mat(T.head), neck);
    const head = grp('head', neck, 0, 0.1, 0.01);
    const R = 0.118;
    const hg = new THREE.SphereGeometry(R, 28, 20); hg.scale(0.94, 1.12, 1.0);
    { // mandíbula: la parte baja de la cabeza se estrecha hacia la barbilla
      const pa = hg.attributes.position;
      for (let i = 0; i < pa.count; i++) {
        const y = pa.getY(i), t = clamp(-y / (R * 1.12), 0, 1), z = pa.getZ(i);
        pa.setX(i, pa.getX(i) * (1 - 0.3 * t * t));
        pa.setZ(i, z * (z > 0 ? 1 - 0.08 * t : 1 - 0.3 * t) + (z > 0 ? 0.012 * t : 0));
      }
      hg.computeVertexNormals();
    }
    const hm = mat(T.head, T.headEmissive ? { emissiveMap: T.headEmissive, emissive: 0xffffff, emissiveIntensity: 1.4 } : {});
    this.headMesh = mesh(hg, hm, head);
    if (pal.face === 'spider' || pal.face === 'venom') {
      const venom = pal.face === 'venom', sc = (pal.eyeSize || 1) * (venom ? 1.25 : 1);
      const white = new THREE.MeshStandardMaterial({ color: pal.eye, emissive: pal.eye, emissiveIntensity: 0.25, roughness: 0.25, metalness: 0.1 });
      const black = new THREE.MeshStandardMaterial({ color: pal.outline || '#101010', roughness: 0.5, side: THREE.DoubleSide });
      for (const side of [-1, 1]) {
        const b = new THREE.Mesh(lensGeo(R, side, sc * 1.28, 1.012, venom), black); b.scale.set(0.94, 1.12, 1); head.add(b);
        if (!venom) b.position.y = -0.002;
        const w = new THREE.Mesh(lensGeo(R, side, sc, 1.02, venom), white); w.scale.set(0.94, 1.12, 1); head.add(w);
      }
    }
    if (pal.face === 'bowl') {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 16), new THREE.MeshPhysicalMaterial({ color: 0xd8f0ff, transparent: true, opacity: 0.25, roughness: 0.05, metalness: 0.1 }));
      head.add(dome);
    }
    if (pal.deco === 'hood') {
      const hood = mesh(new THREE.SphereGeometry(0.15, 16, 12, 0, TAU, 0, Math.PI * 0.62), mat(T.pelvis), head); hood.rotation.x = -0.5; hood.position.set(0, 0.01, -0.03);
    }
    // brazos
    for (const [sx, L] of [[1, 'L'], [-1, 'R']]) {
      const sh = grp('sh' + L, spine, sx * 0.205 * bulk, 0.4, -0.01);
      const delt = new THREE.SphereGeometry(0.064 * Math.sqrt(bulk), 14, 10); delt.scale(1, 0.95, 1);
      mesh(delt, mat(T.upperArm), sh);
      mesh(limbGeo(0.28, 0.058 * Math.sqrt(bulk), 0.043 * Math.sqrt(bulk), 0.012 * bulk, 0.55), mat(T.upperArm), sh);
      const el = grp('el' + L, sh, 0, -0.28, 0);
      mesh(limbGeo(0.25, 0.047 * Math.sqrt(bulk), 0.033, 0.01 * bulk, 0.75), mat(T.foreArm), el);
      const ha = grp('ha' + L, el, 0, -0.25, 0);
      const hgeo = new THREE.SphereGeometry(0.05, 12, 10); hgeo.scale(0.8, 1.15, 0.95); hgeo.translate(0, -0.045, 0.004);
      mesh(hgeo, mat(T.hand), ha);
      const thumb = new THREE.CapsuleGeometry(0.014, 0.03, 3, 6); thumb.rotateZ(sx * 0.6); thumb.translate(sx * 0.03, -0.035, 0.02);
      mesh(thumb, mat(T.hand), ha);
    }
    // piernas
    for (const [sx, L] of [[1, 'L'], [-1, 'R']]) {
      const th = grp('th' + L, hips, sx * 0.082 * bulk, -0.04, 0);
      mesh(limbGeo(0.43, 0.092 * Math.sqrt(bulk), 0.058, 0.016 * bulk, 0.72), mat(T.thigh), th);
      const kn = grp('kn' + L, th, 0, -0.43, 0);
      mesh(limbGeo(0.42, 0.058, 0.04, 0.02, 0.72), mat(T.shin), kn);
      const ft = grp('ft' + L, kn, 0, -0.42, 0);
      const fgeo = new THREE.CapsuleGeometry(0.042, 0.15, 4, 10); fgeo.rotateX(Math.PI / 2); fgeo.scale(1, 0.72, 1); fgeo.translate(0, -0.035, 0.06);
      mesh(fgeo, mat(T.foot), ft);
    }
    // patas mecánicas de la Iron Spider
    if (pal.deco === 'ironlegs') {
      this.ironLegs = [];
      const gold = new THREE.MeshStandardMaterial({ color: 0xe0b030, metalness: 0.9, roughness: 0.25 });
      for (let k = 0; k < 4; k++) {
        const side = k < 2 ? -1 : 1;
        const a = new THREE.Group(); a.position.set(side * 0.06, 0.3, -0.12); spine.add(a);
        const s1 = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.5, 6).translate(0, 0.25, 0), gold); a.add(s1);
        const b = new THREE.Group(); b.position.y = 0.5; a.add(b);
        b.add(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.6, 6).translate(0, 0.3, 0), gold));
        a.rotation.set(-0.4, 0, side * (0.9 + (k % 2) * 0.6)); b.rotation.z = side * -1.6;
        this.ironLegs.push(a);
      }
    }
    this.cur = {}; for (const n of JOINTS) this.cur[n] = [0, 0, 0];
    this.hipsY = 0.98; this.curHipsY = 0.98;
  }
  // Aplica una pose (objeto joint -> [x,y,z]) con suavizado k (0..1)
  apply(pose, k) {
    for (const n of JOINTS) {
      const tg = pose[n] || [0, 0, 0], c = this.cur[n];
      for (let i = 0; i < 3; i++) c[i] += ((tg[i] || 0) - c[i]) * k;
      const J = this.j[n];
      if (J) J.rotation.set(c[0], c[1], c[2]);
    }
    const hy = 0.98 + (pose.hy || 0);
    this.curHipsY += (hy - this.curHipsY) * k;
    this.j.hips.position.y = this.curHipsY;
  }
  snap(pose) { this.apply(pose, 1); }
  dispose() { this.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
}

// ---------------------------------------------------------------------------
// Poses (radianes). El personaje mira hacia +Z.
//   thX<0 adelanta la pierna, knX>0 dobla la rodilla, shX<0 adelanta el brazo,
//   shZ>0 abre el brazo izquierdo (y <0 el derecho), elX<0 dobla el codo.
// ---------------------------------------------------------------------------
const P3 = {
  idle(t) {
    const b = Math.sin(t * 2) * 0.03;
    return { spine: [0.04 + b, 0, 0], neck: [-0.05, 0, 0], shL: [0.05, 0, 0.12], shR: [0.05, 0, -0.12], elL: [-0.35, 0, 0], elR: [-0.35, 0, 0], haL: [0, 0, 0.1], haR: [0, 0, -0.1],
      thL: [0, 0, 0.06], thR: [0, 0, -0.06], knL: [0.08, 0, 0], knR: [0.08, 0, 0], ftL: [-0.08, 0, 0], ftR: [-0.08, 0, 0], hy: -0.01 + b * 0.1 };
  },
  // Pose de guardia de combate (piernas abiertas, brazos arriba)
  guard(t) {
    const b = Math.sin(t * 5) * 0.03;
    return { spine: [0.18, 0.25, 0], neck: [-0.15, -0.25, 0], shL: [-0.7, 0, 0.35], elL: [-1.9, 0, 0], shR: [-0.4, 0, -0.45], elR: [-2.0, 0, 0], thL: [-0.35, 0, 0.18], knL: [0.55, 0, 0], thR: [0.3, 0, -0.15], knR: [0.5, 0, 0], ftL: [-0.2, 0, 0], ftR: [-0.2, 0, 0], hy: -0.08 + b };
  },
  run(ph, sprint) {
    const s = Math.sin(ph), c = Math.cos(ph), L = sprint ? 1.2 : 0.9;
    const kneeL = 0.25 + Math.max(0, Math.sin(ph + 1.9)) * (sprint ? 1.8 : 1.4), kneeR = 0.25 + Math.max(0, Math.sin(ph + Math.PI + 1.9)) * (sprint ? 1.8 : 1.4);
    return { spine: [sprint ? 0.45 : 0.22, s * 0.12, 0], neck: [sprint ? -0.35 : -0.18, -s * 0.1, 0],
      thL: [-s * L, 0, 0.04], thR: [s * L, 0, -0.04], knL: [kneeL, 0, 0], knR: [kneeR, 0, 0], ftL: [-0.2 + Math.max(0, -s) * 0.4, 0, 0], ftR: [-0.2 + Math.max(0, s) * 0.4, 0, 0],
      shL: [s * (sprint ? 1.1 : 0.8), 0, 0.12], shR: [-s * (sprint ? 1.1 : 0.8), 0, -0.12], elL: [-1.2, 0, 0], elR: [-1.2, 0, 0], hy: -0.04 + Math.abs(c) * 0.05 };
  },
  jump() { return { spine: [0.2, 0, 0], neck: [-0.2, 0, 0], thL: [-1.3, 0, 0.1], knL: [1.9, 0, 0], thR: [-0.3, 0, -0.1], knR: [0.7, 0, 0], shL: [-2.4, 0, 0.4], elL: [-0.3, 0, 0], shR: [0.4, 0, -0.6], elR: [-0.8, 0, 0], ftL: [0.3, 0, 0], ftR: [0.4, 0, 0] }; },
  fall(t) {
    const w = Math.sin(t * 6) * 0.1;
    return { spine: [0.1, 0, 0], neck: [-0.1, 0, 0], thL: [-0.5 + w, 0, 0.35], knL: [0.9, 0, 0], thR: [-0.1 - w, 0, -0.35], knR: [0.6, 0, 0], shL: [-0.4, 0, 1.25 + w], elL: [-0.5, 0, 0], shR: [-0.4, 0, -1.25 - w], elR: [-0.5, 0, 0] };
  },
  // Balanceo: brazo derecho arriba sujetando la telaraña; piernas según la fase del péndulo
  swing(ph) {
    const tuck = clamp(ph, -1, 1);
    return { spine: [0.1 - tuck * 0.25, 0, 0], neck: [-0.3, 0, 0], shR: [-3.0, 0, -0.15], elR: [-0.15, 0, 0], shL: [-0.6 + tuck * 0.4, 0, 0.6], elL: [-1.4, 0, 0],
      thL: [-0.9 - tuck * 0.5, 0, 0.12], knL: [1.2 + tuck * 0.6, 0, 0], thR: [-0.2 + tuck * 0.5, 0, -0.1], knR: [0.4 + Math.max(0, tuck) * 1.2, 0, 0], ftL: [0.3, 0, 0], ftR: [0.3, 0, 0] };
  },
  // Salida del balanceo: voltereta o pose de estrella
  swingRelease(t) { return { spine: [-0.2, 0, 0], shL: [-2.9, 0, 0.5], shR: [-2.9, 0, -0.5], elL: [0, 0, 0], elR: [0, 0, 0], thL: [0.2, 0, 0.3], thR: [0.5, 0, -0.3], knL: [0.6, 0, 0], knR: [1.2, 0, 0] }; },
  // Trepar: vientre contra la pared (la raíz se orienta en hero.js)
  crawl(ph) {
    const s = Math.sin(ph), c = Math.cos(ph);
    return { spine: [0.05, 0, 0], neck: [-0.9, 0, 0], shL: [-2.3 - s * 0.4, 0, 0.7], elL: [-1.2 + s * 0.3, 0, 0], shR: [-2.3 + s * 0.4, 0, -0.7], elR: [-1.2 - s * 0.3, 0, 0],
      thL: [-1.0 + s * 0.35, 0, 0.75], knL: [1.9, 0, 0], thR: [-1.0 - s * 0.35, 0, -0.75], knR: [1.9, 0, 0], ftL: [0.6, 0, 0], ftR: [0.6, 0, 0], hy: 0 };
  },
  wallrun(ph) { const p = P3.run(ph, true); p.spine = [0.1, 0, 0]; return p; },
  perch() { return { spine: [0.55, 0, 0], neck: [-0.6, 0, 0], thL: [-1.9, 0, 0.45], knL: [2.4, 0, 0], thR: [-1.9, 0, -0.45], knR: [2.4, 0, 0], shL: [-1.2, 0, 0.3], elL: [-0.4, 0, 0], shR: [-1.2, 0, -0.3], elR: [-0.4, 0, 0], ftL: [0.3, 0, 0], ftR: [0.3, 0, 0], hy: -0.42 }; },
  zip() { return { spine: [0.6, 0, 0], neck: [-0.6, 0, 0], shL: [-2.9, 0, 0.15], shR: [-2.9, 0, -0.15], elL: [0, 0, 0], elR: [0, 0, 0], thL: [0.3, 0, 0.1], thR: [0.5, 0, -0.1], knL: [0.5, 0, 0], knR: [0.9, 0, 0] }; },
  // Golpes (u = progreso 0..1)
  jab(u, side) {
    const e = Math.sin(Math.min(1, u * 1.6) * Math.PI);
    const R = side > 0;
    const p = { spine: [0.2, (R ? 0.5 : -0.5) * e, 0], neck: [-0.2, (R ? -0.4 : 0.4) * e, 0], thL: [-0.45, 0, 0.15], knL: [0.5, 0, 0], thR: [0.35, 0, -0.1], knR: [0.4, 0, 0], hy: -0.08 };
    p[R ? 'shR' : 'shL'] = [-1.55 * e - 0.3, 0, (R ? -0.2 : 0.2)]; p[R ? 'elR' : 'elL'] = [-1.6 * (1 - e) - 0.1, 0, 0];
    p[R ? 'shL' : 'shR'] = [-0.8, 0, R ? 0.3 : -0.3]; p[R ? 'elL' : 'elR'] = [-2.0, 0, 0];
    return p;
  },
  kick(u) {
    const e = Math.sin(Math.min(1, u * 1.5) * Math.PI);
    return { spine: [-0.3 * e, -0.6 * e, 0], thR: [-1.8 * e, 0, -0.3 * e], knR: [0.2 + (1 - e) * 1.2, 0, 0], thL: [0.2, 0, 0.1], knL: [0.4, 0, 0], shL: [-0.6, 0, 1.0 * e], shR: [0.5, 0, -1.2 * e], elL: [-0.8, 0, 0], elR: [-0.6, 0, 0], hy: -0.06 };
  },
  uppercut(u) {
    const e = Math.sin(Math.min(1, u * 1.4) * Math.PI);
    return { spine: [0.35 - 0.7 * e, 0.3, 0], neck: [-0.3 * e, 0, 0], shR: [-0.6 - 2.4 * e, 0, -0.2], elR: [-1.8 + 1.4 * e, 0, 0], shL: [0.4, 0, 0.4], elL: [-1.5, 0, 0], thL: [-0.7 * e, 0, 0.1], knL: [0.9 * e + 0.3, 0, 0], thR: [0.3, 0, -0.1], knR: [0.5, 0, 0], hy: -0.12 + e * 0.1 };
  },
  airkick(u) { const e = Math.sin(Math.min(1, u * 1.4) * Math.PI); return { spine: [-0.2, 0, 0], thR: [-1.6 * e - 0.3, 0, 0], knR: [0.3, 0, 0], thL: [0.3, 0, 0.2], knL: [1.4, 0, 0], shL: [-0.5, 0, 1.3], shR: [-0.5, 0, -1.3], elL: [-0.4, 0, 0], elR: [-0.4, 0, 0] }; },
  webShoot(side) { const p = P3.guard(0); p[side > 0 ? 'shR' : 'shL'] = [-1.55, 0, 0]; p[side > 0 ? 'elR' : 'elL'] = [0, 0, 0]; p[side > 0 ? 'haR' : 'haL'] = [-0.8, 0, 0]; return p; },
  flip() { return { spine: [0.5, 0, 0], neck: [-0.4, 0, 0], thL: [-2.0, 0, 0.2], knL: [2.4, 0, 0], thR: [-2.0, 0, -0.2], knR: [2.4, 0, 0], shL: [-1.4, 0, 0.2], elL: [-1.6, 0, 0], shR: [-1.4, 0, -0.2], elR: [-1.6, 0, 0], hy: 0.1 }; },
  special(t) { return { spine: [0.1, t * 30, 0], shL: [-1.5, 0, 1.5], shR: [-1.5, 0, -1.5], elL: [0, 0, 0], elR: [0, 0, 0], thL: [-0.4, 0, 0.3], knL: [0.6, 0, 0], thR: [-0.4, 0, -0.3], knR: [0.6, 0, 0] }; },
  hurt() { return { spine: [-0.45, 0, 0.1], neck: [0.3, 0, 0], shL: [0.3, 0, 0.8], shR: [0.3, 0, -0.8], elL: [-0.5, 0, 0], elR: [-0.5, 0, 0], thL: [-0.3, 0, 0.1], knL: [0.5, 0, 0], thR: [0.2, 0, -0.1], knR: [0.4, 0, 0], hy: -0.05 }; },
  down() { return { spine: [-0.1, 0, 0], neck: [0.2, 0, 0], shL: [-0.2, 0, 1.3], shR: [-0.2, 0, -1.3], elL: [-0.3, 0, 0], elR: [-0.3, 0, 0], thL: [0, 0, 0.2], thR: [-0.3, 0, -0.2], knL: [0.2, 0, 0], knR: [0.6, 0, 0] }; },
  webbed() { return { shL: [0, 0, 0.05], shR: [0, 0, -0.05], elL: [0, 0, 0], elR: [0, 0, 0], thL: [0, 0, 0.02], thR: [0, 0, -0.02] }; },
  windup(u) { return { spine: [0.1, -0.6 * u, 0], shR: [0.9 * u, 0, -0.5], elR: [-1.8, 0, 0], shL: [-0.9, 0, 0.3], elL: [-1.2, 0, 0], thL: [-0.4, 0, 0.1], knL: [0.4, 0, 0], thR: [0.3, 0, -0.1], knR: [0.4, 0, 0], hy: -0.05 }; },
  swingPunch(u) { const e = Math.sin(Math.min(1, u * 1.4) * Math.PI); return { spine: [0.25, 0.7 * e - 0.3, 0], shR: [-1.4, 0, -1.2 + 1.1 * e], elR: [-0.4, 0, 0], shL: [-0.6, 0, 0.3], elL: [-1.6, 0, 0], thL: [-0.5, 0, 0.1], knL: [0.5, 0, 0], thR: [0.4, 0, -0.1], knR: [0.4, 0, 0], hy: -0.06 }; },
  cheer(t) { return { shL: [-2.8 + Math.sin(t * 8) * 0.2, 0, 0.4], shR: [-2.8 - Math.sin(t * 8) * 0.2, 0, -0.4], elL: [-0.2, 0, 0], elR: [-0.2, 0, 0], spine: [-0.2, 0, 0], neck: [0.3, 0, 0] }; },
  aim() { return { spine: [0.1, 0.3, 0], shR: [-1.55, 0, 0], elR: [0, 0, 0], shL: [-1.4, 0, 0.3], elL: [-0.3, 0, 0], thL: [-0.3, 0, 0.15], knL: [0.3, 0, 0], thR: [0.3, 0, -0.1], knR: [0.3, 0, 0] }; },
};
