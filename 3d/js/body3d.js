'use strict';
// ---------------------------------------------------------------------------
// Cuerpo 3D de una sola pieza: se define como una unión suave de formas
// (músculos), se convierte en malla con "surface nets", se ata al esqueleto
// (SkinnedMesh) y el traje se pinta en el shader: zonas de color, telarañas
// finas en relieve y emblema, sin costuras entre piezas.
// ---------------------------------------------------------------------------
const BODY_CACHE = new Map();

// ---- funciones de distancia ----
function sdRoundCone(px, py, pz, a, b, r0, r1) {
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
  const qx = px - a[0], qy = py - a[1], qz = pz - a[2];
  const l2 = bx * bx + by * by + bz * bz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, (qx * bx + qy * by + qz * bz) / l2)) : 0;
  const dx = qx - bx * t, dy = qy - by * t, dz = qz - bz * t;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - (r0 + (r1 - r0) * t);
}
function sdEllipsoid(px, py, pz, c, r) {
  const x = (px - c[0]) / r[0], y = (py - c[1]) / r[1], z = (pz - c[2]) / r[2];
  const k0 = Math.sqrt(x * x + y * y + z * z);
  const k1 = Math.sqrt((x / r[0]) ** 2 + (y / r[1]) ** 2 + (z / r[2]) ** 2);
  return k1 > 0 ? k0 * (k0 - 1) / k1 : -Math.min(r[0], r[1], r[2]);
}
function smin(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }

// ---- extracción de superficie (surface nets) ----
function surfaceNets(field, nx, ny, nz, ox, oy, oz, cell) {
  const idx = (x, y, z) => x + nx * (y + ny * z);
  const vIndex = new Int32Array(nx * ny * nz).fill(-1);
  const pos = [], nrm = [], ind = [];
  const C = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const v = new Float32Array(8);
  const F = (x, y, z) => field[idx(clamp(x, 0, nx - 1), clamp(y, 0, ny - 1), clamp(z, 0, nz - 1))];
  for (let z = 0; z < nz - 1; z++) for (let y = 0; y < ny - 1; y++) for (let x = 0; x < nx - 1; x++) {
    let mask = 0;
    for (let i = 0; i < 8; i++) { v[i] = field[idx(x + C[i][0], y + C[i][1], z + C[i][2])]; if (v[i] < 0) mask |= 1 << i; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of E) {
      if ((v[a] < 0) === (v[b] < 0)) continue;
      const t = v[a] / (v[a] - v[b]);
      sx += C[a][0] + (C[b][0] - C[a][0]) * t; sy += C[a][1] + (C[b][1] - C[a][1]) * t; sz += C[a][2] + (C[b][2] - C[a][2]) * t; n++;
    }
    const fx = x + sx / n, fy = y + sy / n, fz = z + sz / n;
    vIndex[idx(x, y, z)] = pos.length / 3;
    pos.push(ox + fx * cell, oy + fy * cell, oz + fz * cell);
    // normal suave: gradiente del campo
    const gx = F(x + 1, y, z) - F(x - 1, y, z) + F(x + 1, y + 1, z + 1) - F(x - 1, y + 1, z + 1);
    const gy = F(x, y + 1, z) - F(x, y - 1, z) + F(x + 1, y + 1, z + 1) - F(x + 1, y - 1, z + 1);
    const gz = F(x, y, z + 1) - F(x, y, z - 1) + F(x + 1, y + 1, z + 1) - F(x + 1, y + 1, z - 1);
    const gl = Math.hypot(gx, gy, gz) || 1;
    nrm.push(gx / gl, gy / gl, gz / gl);
  }
  // caras: un cuadrilátero por cada arista de la rejilla que cruza la superficie
  const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let z = 1; z < nz - 1; z++) for (let y = 1; y < ny - 1; y++) for (let x = 1; x < nx - 1; x++) {
    const f0 = field[idx(x, y, z)] < 0;
    for (let a = 0; a < 3; a++) {
      const e = axes[a], f1 = field[idx(x + e[0], y + e[1], z + e[2])] < 0;
      if (f0 === f1) continue;
      const u = axes[(a + 1) % 3], w = axes[(a + 2) % 3];
      const c0 = vIndex[idx(x, y, z)], c1 = vIndex[idx(x - u[0], y - u[1], z - u[2])];
      const c2 = vIndex[idx(x - u[0] - w[0], y - u[1] - w[1], z - u[2] - w[2])], c3 = vIndex[idx(x - w[0], y - w[1], z - w[2])];
      if (c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0) continue;
      if (f0) ind.push(c0, c1, c2, c0, c2, c3); else ind.push(c0, c2, c1, c0, c3, c2);
    }
  }
  return { pos, nrm, ind };
}

// ---- esqueleto en reposo (pose "A", brazos separados del cuerpo) ----
const BONE_DEF = [
  // nombre, padre, posición local
  ['hips', null, [0, 0.98, 0]], ['spine', 'hips', [0, 0.1, 0]], ['neck', 'spine', [0, 0.47, 0]], ['head', 'neck', [0, 0.1, 0.01]],
  ['shL', 'spine', [0.205, 0.4, -0.01]], ['elL', 'shL', [0, -0.28, 0]], ['haL', 'elL', [0, -0.25, 0]],
  ['shR', 'spine', [-0.205, 0.4, -0.01]], ['elR', 'shR', [0, -0.28, 0]], ['haR', 'elR', [0, -0.25, 0]],
  ['thL', 'hips', [0.085, -0.04, 0]], ['knL', 'thL', [0, -0.43, 0]], ['ftL', 'knL', [0, -0.42, 0]],
  ['thR', 'hips', [-0.085, -0.04, 0]], ['knR', 'thR', [0, -0.43, 0]], ['ftR', 'knR', [0, -0.42, 0]],
];
const REST_ROT = { shL: [0, 0, 0.62], shR: [0, 0, -0.62], thL: [0, 0, 0.07], thR: [0, 0, -0.07], elL: [-0.1, 0, 0], elR: [-0.1, 0, 0] };

// posiciones de las articulaciones en reposo (espacio del cuerpo)
function restJoints() {
  const g = {}, objs = {};
  for (const [n, p, lp] of BONE_DEF) {
    const o = new THREE.Object3D(); o.position.set(...lp);
    const r = REST_ROT[n]; if (r) o.rotation.set(...r);
    if (p) objs[p].add(o);
    objs[n] = o;
  }
  objs.hips.updateMatrixWorld(true);
  for (const n in objs) { const v = new THREE.Vector3(); objs[n].getWorldPosition(v); g[n] = [v.x, v.y, v.z]; }
  // puntas: mano, pie (hacia delante) y cabeza
  const tip = (n, lx, ly, lz) => { const v = new THREE.Vector3(lx, ly, lz); objs[n].localToWorld(v); return [v.x, v.y, v.z]; };
  g.handTipL = tip('haL', 0, -0.085, 0.008); g.handTipR = tip('haR', 0, -0.085, 0.008);
  g.toeL = tip('ftL', 0, -0.055, 0.17); g.toeR = tip('ftR', 0, -0.055, 0.17);
  g.heelL = tip('ftL', 0, -0.06, -0.03); g.heelR = tip('ftR', 0, -0.06, -0.03);
  return g;
}

// Primitivas del cuerpo (unión suave). bulk engorda torso y brazos.
function bodyPrims(J, bulk) {
  const P = [], sb = Math.sqrt(bulk);
  const cone = (a, b, r0, r1, k = 0.03) => P.push({ t: 'c', a, b, r0, r1, k });
  const ell = (c, r, k = 0.03) => P.push({ t: 'e', c, r, k });
  const mid = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
  const H = J.hips, S = J.spine, N = J.neck;
  // tronco
  ell([0, H[1] - 0.03, -0.005], [0.145 * bulk, 0.12, 0.105]);                         // pelvis
  ell([0, H[1] - 0.06, -0.06], [0.13 * bulk, 0.1, 0.08], 0.04);                        // glúteos
  ell([0, S[1] + 0.08, 0.0], [0.138 * bulk, 0.17, 0.09], 0.06);                      // abdomen
  ell([0, S[1] + 0.12, 0.045], [0.085 * bulk, 0.13, 0.05], 0.04);                     // abdominales
  for (const s of [-1, 1]) ell([s * 0.1 * bulk, S[1] + 0.0, -0.005], [0.06 * bulk, 0.11, 0.075], 0.05); // oblicuos
  ell([0, S[1] + 0.3, -0.008], [0.17 * bulk, 0.16, 0.105 * sb], 0.05);               // tórax
  for (const s of [-1, 1]) {
    ell([s * 0.078 * bulk, S[1] + 0.32, 0.062 * sb], [0.088 * bulk, 0.058, 0.042], 0.035); // pectorales
    ell([s * 0.13 * bulk, S[1] + 0.22, -0.02], [0.06 * bulk, 0.13, 0.07], 0.04);        // dorsales
    ell([s * 0.085, S[1] + 0.43, -0.03], [0.08, 0.045, 0.06], 0.04);                    // trapecios
  }
  cone([0, N[1] - 0.04, -0.005], [0, N[1] + 0.12, 0.012], 0.058, 0.05, 0.025);         // cuello
  for (const [s, L] of [[1, 'L'], [-1, 'R']]) {
    const sh = J['sh' + L], el = J['el' + L], ha = J['ha' + L], tip = J['handTip' + L];
    ell(sh, [0.068 * sb, 0.066 * sb, 0.07 * sb], 0.035);                                // deltoides
    cone(sh, el, 0.052 * sb, 0.04 * sb, 0.025);                                         // brazo
    ell(mid(sh, el, 0.5).map((v, i) => v + (i === 2 ? 0.018 : 0)), [0.045 * sb, 0.075, 0.042 * sb], 0.02); // bíceps
    cone(el, ha, 0.043 * sb, 0.03, 0.02);                                              // antebrazo
    ell(mid(el, ha, 0.25), [0.045 * sb, 0.07, 0.042 * sb], 0.02);
    ell(mid(ha, tip, 0.45), [0.034, 0.05, 0.04], 0.015);                                // puño
    const th = J['th' + L], kn = J['kn' + L], ft = J['ft' + L], toe = J['toe' + L], heel = J['heel' + L];
    cone(th, kn, 0.088 * sb, 0.055, 0.04);                                             // muslo
    ell(mid(th, kn, 0.4).map((v, i) => v + (i === 2 ? 0.02 : 0)), [0.075, 0.14, 0.07], 0.03); // cuádriceps
    cone(kn, ft, 0.053, 0.036, 0.02);                                                  // espinilla
    ell(mid(kn, ft, 0.3).map((v, i) => v + (i === 2 ? -0.025 : 0)), [0.05, 0.1, 0.05], 0.025); // gemelo
    cone(heel, toe, 0.042, 0.034, 0.03);                                               // pie
  }
  return P;
}

function buildBody(bulk) {
  const key = 'b' + bulk;
  if (BODY_CACHE.has(key)) return BODY_CACHE.get(key);
  const J = restJoints();
  const prims = bodyPrims(J, bulk);
  const cell = 0.0125, pad = 0.06;
  let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
  const bbox = (p) => {
    if (p.t === 'e') return [p.c[0] - p.r[0], p.c[1] - p.r[1], p.c[2] - p.r[2], p.c[0] + p.r[0], p.c[1] + p.r[1], p.c[2] + p.r[2]];
    const r = Math.max(p.r0, p.r1);
    return [Math.min(p.a[0], p.b[0]) - r, Math.min(p.a[1], p.b[1]) - r, Math.min(p.a[2], p.b[2]) - r, Math.max(p.a[0], p.b[0]) + r, Math.max(p.a[1], p.b[1]) + r, Math.max(p.a[2], p.b[2]) + r];
  };
  for (const p of prims) { const b = bbox(p); x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); z0 = Math.min(z0, b[2]); x1 = Math.max(x1, b[3]); y1 = Math.max(y1, b[4]); z1 = Math.max(z1, b[5]); }
  x0 -= pad; y0 -= pad; z0 -= pad; x1 += pad; y1 += pad; z1 += pad;
  const nx = Math.ceil((x1 - x0) / cell) + 1, ny = Math.ceil((y1 - y0) / cell) + 1, nz = Math.ceil((z1 - z0) / cell) + 1;
  const field = new Float32Array(nx * ny * nz).fill(1);
  // cada primitiva solo toca su caja (rápido)
  for (const p of prims) {
    const b = bbox(p), m = p.k + 0.01;
    const ix0 = Math.max(0, Math.floor((b[0] - m - x0) / cell)), ix1 = Math.min(nx - 1, Math.ceil((b[3] + m - x0) / cell));
    const iy0 = Math.max(0, Math.floor((b[1] - m - y0) / cell)), iy1 = Math.min(ny - 1, Math.ceil((b[4] + m - y0) / cell));
    const iz0 = Math.max(0, Math.floor((b[2] - m - z0) / cell)), iz1 = Math.min(nz - 1, Math.ceil((b[5] + m - z0) / cell));
    for (let z = iz0; z <= iz1; z++) for (let y = iy0; y <= iy1; y++) for (let x = ix0; x <= ix1; x++) {
      const px = x0 + x * cell, py = y0 + y * cell, pz = z0 + z * cell;
      const d = p.t === 'e' ? sdEllipsoid(px, py, pz, p.c, p.r) : sdRoundCone(px, py, pz, p.a, p.b, p.r0, p.r1);
      const i = x + nx * (y + ny * z);
      field[i] = smin(field[i], d, p.k);
    }
  }
  const mesh = surfaceNets(field, nx, ny, nz, x0, y0, z0, cell);
  // pesos de piel: cada vértice sigue a los huesos más cercanos
  const names = BONE_DEF.map((b) => b[0]);
  const segs = [
    ['hips', J.hips, J.spine, 0.14], ['spine', J.spine, [0, J.neck[1] - 0.02, 0], 0.17], ['neck', J.neck, J.head, 0.06],
    ['shL', J.shL, J.elL, 0.06], ['elL', J.elL, J.haL, 0.045], ['haL', J.haL, J.handTipL, 0.04],
    ['shR', J.shR, J.elR, 0.06], ['elR', J.elR, J.haR, 0.045], ['haR', J.haR, J.handTipR, 0.04],
    ['thL', J.thL, J.knL, 0.08], ['knL', J.knL, J.ftL, 0.055], ['ftL', J.heelL, J.toeL, 0.045],
    ['thR', J.thR, J.knR, 0.08], ['knR', J.knR, J.ftR, 0.055], ['ftR', J.heelR, J.toeR, 0.045],
  ];
  const nv = mesh.pos.length / 3;
  const sIdx = new Uint16Array(nv * 4), sW = new Float32Array(nv * 4);
  for (let i = 0; i < nv; i++) {
    const px = mesh.pos[i * 3], py = mesh.pos[i * 3 + 1], pz = mesh.pos[i * 3 + 2];
    const cand = segs.map(([n, a, b, r]) => {
      let d = Math.max(0.001, sdRoundCone(px, py, pz, a, b, 0, 0) / r);
      // un vértice del brazo o de la pierna no debe seguir al tronco (y al revés)
      if ((n === 'spine' || n === 'hips') && Math.abs(px) > 0.19 * bulk && py > J.hips[1]) d *= 2.5;
      return [names.indexOf(n), 1 / Math.pow(d, 6)];
    }).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const tot = cand.reduce((s, c) => s + c[1], 0);
    cand.forEach((c, k) => { sIdx[i * 4 + k] = c[0]; sW[i * 4 + k] = c[1] / tot; });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(mesh.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.nrm, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(sIdx, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sW, 4));
  g.setIndex(mesh.ind);
  g.computeBoundingSphere();
  const res = { geo: g, J, segs };
  BODY_CACHE.set(key, res);
  return res;
}

// ---- material del traje (patrón calculado por píxel) ----
const SUIT_GLSL = `
uniform vec3 uSegA[15]; uniform vec3 uSegB[15]; uniform float uSegR[15];
uniform vec3 cHead, cTorso, cLow, cSide, cTrim, cShoulder, cArm, cArm2, cHand, cLeg, cBoot, cEmblem, cWeb;
uniform float uWebs, uSide, uTrim, uShoulder, uEmblem, uEmbScale, uBurn, uBulk, uWaist, uChest;
varying vec3 vBind;
float segT(vec3 p, vec3 a, vec3 b) { vec3 ab = b - a; return clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0); }
float segD(vec3 p, vec3 a, vec3 b) { float t = segT(p, a, b); return length(p - a - (b - a) * t); }
float lineAA(float d, float w) { float f = fwidth(d) + 1e-5; return 1.0 - smoothstep(w - f, w + f, d); }
float h13(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float legD(vec2 p, vec2 a, vec2 b) { vec2 ab = b - a; float t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0); return length(p - a - ab * t); }
float spider(vec2 p) {
  p.x = abs(p.x);
  float d = length((p - vec2(0.0, 0.35)) / vec2(0.55, 0.7)) - 1.0;
  d = min(d, length((p - vec2(0.0, -0.9)) / vec2(0.7, 1.1)) - 1.0);
  float l = 1e3;
  l = min(l, legD(p, vec2(0.3, 0.6), vec2(1.6, 2.4))); l = min(l, legD(p, vec2(1.6, 2.4), vec2(2.6, 1.6)));
  l = min(l, legD(p, vec2(0.4, 0.2), vec2(2.2, 0.9))); l = min(l, legD(p, vec2(2.2, 0.9), vec2(2.9, -0.4)));
  l = min(l, legD(p, vec2(0.4, -0.4), vec2(2.0, -1.2))); l = min(l, legD(p, vec2(2.0, -1.2), vec2(2.4, -2.8)));
  l = min(l, legD(p, vec2(0.3, -0.9), vec2(1.3, -2.6))); l = min(l, legD(p, vec2(1.3, -2.6), vec2(1.5, -4.2)));
  return min(d * 0.35, l - 0.16);
}
vec3 suitColor(vec3 p) {
  // pieza más cercana
  float best = 1e3; int bi = 0;
  for (int i = 0; i < 15; i++) { float d = segD(p, uSegA[i], uSegB[i]) / uSegR[i]; if (d < best) { best = d; bi = i; } }
  vec3 a = uSegA[bi], b = uSegB[bi];
  float t = segT(p, a, b);
  vec3 ax = normalize(b - a);
  vec3 ref = abs(ax.z) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 0.0, 1.0);
  vec3 q = p - a - (b - a) * t;
  vec3 e1 = normalize(ref - ax * dot(ref, ax)), e2 = cross(ax, e1);
  float ang = atan(dot(q, e2), dot(q, e1));
  float rad = length(q);
  vec3 col = cTorso;
  bool torso = bi <= 1;
  bool face = false;
  if (torso) {
    col = p.y < uWaist ? cLow : cTorso;
    float side = abs(p.x) / (0.17 * uBulk);
    if (uSide > 0.5 && side > 0.74 - 0.12 * smoothstep(uWaist, uChest, p.y)) col = cSide;
    if (uTrim > 0.5 && abs(side - (0.74 - 0.12 * smoothstep(uWaist, uChest, p.y))) < 0.035) col = cTrim;
  } else if (bi == 2) col = cHead;
  else if (bi == 3 || bi == 6) { col = (uShoulder > 0.5 && t < 0.3) ? cShoulder : cArm; if (uShoulder > 0.5 && uTrim > 0.5 && abs(t - 0.3) < 0.03) col = cTrim; }
  else if (bi == 4 || bi == 7) col = cArm2;
  else if (bi == 5 || bi == 8) col = cHand;
  else if (bi == 9 || bi == 12) col = cLeg;
  else if (bi == 10 || bi == 13) { col = t > 0.45 ? cBoot : cLeg; if (uTrim > 0.5 && abs(t - 0.45) < 0.025) col = cTrim; }
  else col = cBoot;
  float web = 0.0;
  if (uWebs > 0.5 && distance(col, cHead) < 0.02) {
    if (torso) {
      vec2 c = p.z > 0.0 ? vec2(0.0, uChest + 0.02) : vec2(0.0, uChest - 0.02);
      vec2 d = vec2(p.x, p.y) - c;
      float r = length(d), an = atan(d.y, d.x);
      float sp = abs(fract(an / 6.2832 * 16.0 + 0.5) - 0.5) * r * 6.2832 / 16.0;
      float rg = abs(fract(r / 0.045) - 0.5) * 0.045;
      web = max(lineAA(sp, 0.0022), lineAA(abs(rg - 0.0225), 0.0024));
    } else {
      float u = ang * max(rad, 0.03);
      float per = 0.034;
      float lu = abs(fract(u / per) - 0.5) * per;
      float v = t * length(b - a) + (1.0 - cos(ang * 2.0)) * 0.006;
      float lv = abs(fract(v / 0.05) - 0.5) * 0.05;
      web = max(lineAA(abs(lu - per * 0.5), 0.0022), lineAA(abs(lv - 0.025), 0.0022));
    }
  }
  col = mix(col, cWeb, web);
  // emblema en el pecho y en la espalda
  if (uEmblem > 0.5 && torso && p.y > uWaist) {
    float s = uEmbScale;
    vec2 ep = (vec2(p.x, p.y - uChest)) / s;
    float d = spider(ep * vec2(1.0, -1.0));
    float m = 1.0 - smoothstep(-fwidth(d), fwidth(d), d);
    if (p.z > 0.02 || p.z < -0.04) col = mix(col, cEmblem, m);
  }
  if (uBurn > 0.5) {
    float n = h13(floor(p * 38.0));
    if (n > 0.8) col = mix(col, vec3(0.16, 0.1, 0.08), 0.85);
    if (n > 0.985) col = vec3(1.0, 0.45, 0.12);
  }
  return col;
}
`;

function suitMaterial(pal, info, bulk) {
  const c = (v) => new THREE.Color(v || '#808080');
  const segs = info.segs;
  const U = {
    uSegA: { value: segs.map((s) => new THREE.Vector3(...s[1])) },
    uSegB: { value: segs.map((s) => new THREE.Vector3(...s[2])) },
    uSegR: { value: segs.map((s) => s[3]) },
    cHead: { value: c(pal.head) }, cTorso: { value: c(pal.torso) }, cLow: { value: c(pal.torsoLow || pal.torso) },
    cSide: { value: c(pal.side || pal.torso) }, cTrim: { value: c(pal.trim || pal.outline) }, cShoulder: { value: c(pal.shoulder || pal.arm) },
    cArm: { value: c(pal.arm) }, cArm2: { value: c(pal.arm2) }, cHand: { value: c(pal.hand) }, cLeg: { value: c(pal.leg) }, cBoot: { value: c(pal.boot) },
    cEmblem: { value: c(pal.emblem || pal.torso) }, cWeb: { value: c(pal.webLine || shade(pal.torso, -0.45)) },
    uWebs: { value: pal.webs ? 1 : 0 }, uSide: { value: pal.side ? 1 : 0 }, uTrim: { value: pal.trim ? 1 : 0 }, uShoulder: { value: pal.shoulder ? 1 : 0 },
    uEmblem: { value: pal.emblem && (pal.face === 'spider' || pal.face === 'venom') ? 1 : 0 },
    uEmbScale: { value: pal.emblemStyle === 'big' ? 0.03 : pal.emblemStyle === 'long' ? 0.024 : 0.016 },
    uBurn: { value: pal.deco === 'burn' ? 1 : 0 }, uBulk: { value: bulk },
    uWaist: { value: info.J.spine[1] + 0.02 }, uChest: { value: info.J.spine[1] + 0.3 },
  };
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: pal.deco === 'armor' ? 0.35 : 0.58, metalness: pal.deco === 'armor' || pal.deco === 'ironlegs' ? 0.4 : 0.05, envMapIntensity: 0.8 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vBind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBind = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + SUIT_GLSL)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = suitColor(vBind);');
  };
  m.customProgramCacheKey = () => 'suit3';
  return m;
}
