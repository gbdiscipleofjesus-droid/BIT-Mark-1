'use strict';
// ---------------------------------------------------------------------------
// Nueva York procedural en 3D: manzanas, rascacielos con ventanas por shader,
// calles con marcas, farolas, tráfico, peatones, parque, río y cielo de atardecer.
// ---------------------------------------------------------------------------
const CITY = { BLOCK: 64, STREET: 20, N: 9 };
CITY.CELL = CITY.BLOCK + CITY.STREET;
CITY.SIZE = CITY.CELL * CITY.N;
CITY.MIN = -CITY.SIZE / 2;
CITY.MAX = CITY.SIZE / 2;
const CURB = 0.25;

// ---- utilidades geométricas ----
function rayAABB(o, d, b, maxT) {
  let t0 = 0, t1 = maxT;
  const mins = [b.x0, 0, b.z0], maxs = [b.x1, b.h, b.z1], oo = [o.x, o.y, o.z], dd = [d.x, d.y, d.z];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(dd[i]) < 1e-8) { if (oo[i] < mins[i] || oo[i] > maxs[i]) return -1; continue; }
    let a = (mins[i] - oo[i]) / dd[i], c = (maxs[i] - oo[i]) / dd[i];
    if (a > c) { const t = a; a = c; c = t; }
    t0 = Math.max(t0, a); t1 = Math.min(t1, c);
    if (t0 > t1) return -1;
  }
  return t0;
}

// Material de edificio con ventanas, plantas y escaparates generados en el shader
function buildingMaterial(o) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: o.rough || 0.85, metalness: 0.05, envMapIntensity: 0.9 });
  const U = {
    uWin: { value: new THREE.Vector3(o.winW || 3.2, o.floor || 3.6, o.gap || 0.22) },
    uGlass: { value: new THREE.Color(o.glass || '#1a2a40') },
    uSky: { value: new THREE.Color(o.sky || '#f0a070') },
    uLitColor: { value: new THREE.Color(o.lit || '#ffc870') },
    uLit: { value: 0.18 }, uShop: { value: new THREE.Color('#402a18') },
  };
  m.userData.U = U;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 _wp = vec4(transformed, 1.0);
        vec3 _n = objectNormal;
        #ifdef USE_INSTANCING
          _wp = instanceMatrix * _wp; _n = mat3(instanceMatrix) * _n;
        #endif
        _wp = modelMatrix * _wp; vWP = _wp.xyz; vWN = normalize(mat3(modelMatrix) * _n);`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 vWP; varying vec3 vWN;
        uniform vec3 uWin; uniform vec3 uGlass; uniform vec3 uSky; uniform vec3 uLitColor; uniform float uLit; uniform vec3 uShop;
        float h21(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec3 n = normalize(vWN);
          if (abs(n.y) < 0.5) {
            float hc = abs(n.x) > 0.5 ? vWP.z : vWP.x;
            vec2 cell = vec2(hc / uWin.x, vWP.y / uWin.y);
            vec2 f = fract(cell);
            float win = step(uWin.z, f.x) * step(f.x, 1.0 - uWin.z) * step(0.26, f.y) * step(f.y, 0.86) * step(4.6, vWP.y);
            float rnd = h21(floor(cell) + floor(vWP.xz * 0.02) * 17.0 + n.xz * 3.0);
            vec3 glass = mix(uGlass, uSky, clamp(f.y * 0.5 + rnd * 0.35, 0.0, 1.0) * 0.55);
            diffuseColor.rgb = mix(diffuseColor.rgb, glass, win);
            roughnessFactor = mix(roughnessFactor, 0.12, win);
            metalnessFactor = mix(metalnessFactor, 0.55, win);
            totalEmissiveRadiance += win * step(1.0 - uLit, rnd) * uLitColor * (0.25 + rnd * 0.3);
            float shop = step(vWP.y, 4.0) * step(0.7, vWP.y) * step(0.1, f.x) * step(f.x, 0.9);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.1, 0.12, 0.15), shop);
            totalEmissiveRadiance += shop * uShop * (0.5 + h21(floor(cell.xx)) * 1.2);
            diffuseColor.rgb *= 1.0 - 0.2 * step(0.93, f.y) * (1.0 - win);
            diffuseColor.rgb *= 0.9 + 0.1 * h21(floor(vWP.xy * 0.5));
          } else {
            diffuseColor.rgb *= 0.5;
          }
        }`);
  };
  return m;
}

const City = {
  buildings: [], grid: new Map(), blocks: [], lamps: [], cars: [], peds: [], parks: [],
  cellOf(x) { return Math.floor((x - CITY.MIN) / CITY.CELL); },
  key(i, j) { return i * 100 + j; },

  build(scene, seed = 616) {
    const r = makeRng(seed);
    this.scene = scene;
    this.buildings = []; this.grid = new Map(); this.blocks = []; this.parks = [];
    const N = CITY.N, C = CITY.CELL, B = CITY.BLOCK, S = CITY.STREET;
    const mid = (N - 1) / 2;
    const lots = { brick: [], concrete: [], glass: [], stone: [] };
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const x0 = CITY.MIN + i * C + S / 2, z0 = CITY.MIN + j * C + S / 2;
        const blk = { i, j, x0, z0, x1: x0 + B, z1: z0 + B, park: false };
        this.blocks.push(blk);
        const dc = Math.hypot(i - mid, j - mid) / mid; // 0 centro, 1 borde
        if ((i === 2 && j === 6) || (i === 6 && j === 2)) { blk.park = true; this.parks.push(blk); continue; }
        // parcelas: la manzana se divide en 2x2, 3x2 o una torre única
        const layout = (i === mid && j === mid) ? 'tower' : r.chance(0.2) ? 'one' : r.chance(0.5) ? '2x2' : '3x2';
        const cuts = layout === 'tower' || layout === 'one' ? [[0, 0, 1, 1]] : layout === '2x2' ? [[0, 0, .5, .5], [.5, 0, 1, .5], [0, .5, .5, 1], [.5, .5, 1, 1]]
          : [[0, 0, .34, .5], [.34, 0, .67, .5], [.67, 0, 1, .5], [0, .5, .5, 1], [.5, .5, 1, 1]];
        for (const c of cuts) {
          const inset = 2.5;
          const bx0 = x0 + c[0] * B + inset, bx1 = x0 + c[2] * B - inset, bz0 = z0 + c[1] * B + inset, bz1 = z0 + c[3] * B - inset;
          let h;
          if (layout === 'tower') h = 230;
          else {
            const tall = 1 - dc;
            h = 14 + r.range(0, 1) * 40 + tall * tall * r.range(20, 150);
            if (r.chance(0.08)) h += 60;
          }
          h = Math.round(h / 3.6) * 3.6 + 0.6;
          const style = layout === 'tower' ? 'glass' : h > 110 ? r.pick(['glass', 'glass', 'concrete']) : h > 55 ? r.pick(['concrete', 'glass', 'stone', 'brick']) : r.pick(['brick', 'brick', 'stone', 'concrete']);
          const b = { x0: bx0, x1: bx1, z0: bz0, z1: bz1, h, style, tint: r.range(0.75, 1.15), id: this.buildings.length, landmark: layout === 'tower' };
          this.buildings.push(b); lots[style].push(b);
          // escalonado típico de Nueva York en torres altas
          if (h > 90 && layout !== 'tower' && r.chance(0.6)) {
            const sh = 6 + r.range(0, 0.18) * (bx1 - bx0);
            const t = { x0: bx0 + sh, x1: bx1 - sh, z0: bz0 + sh, z1: bz1 - sh, h: h + Math.round(r.range(12, 40) / 3.6) * 3.6, style, tint: b.tint, id: this.buildings.length, top: true };
            if (t.x1 - t.x0 > 6 && t.z1 - t.z0 > 6) { this.buildings.push(t); lots[style].push(t); }
          }
        }
      }
    }
    for (const b of this.buildings) this.addToGrid(b);

    const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
    const mats = {
      brick: buildingMaterial({ glass: '#1c2230', sky: '#e8a078', lit: '#ffc070' }),
      concrete: buildingMaterial({ glass: '#1a2636', sky: '#f0b890', lit: '#fff0c0', winW: 2.8 }),
      glass: buildingMaterial({ glass: '#203448', sky: '#ffc090', lit: '#d8f0ff', winW: 2.2, floor: 3.4, gap: 0.06, rough: 0.35 }),
      stone: buildingMaterial({ glass: '#202530', sky: '#e8b088', lit: '#ffd890', winW: 3.6, floor: 4.0 }),
    };
    this.mats = mats;
    const baseCol = { brick: ['#8a4232', '#7a3a2c', '#9a5238', '#6e3a30'], concrete: ['#9a9a96', '#8a8e94', '#b0aca0', '#7a7e86'], glass: ['#4a6680', '#3a5670', '#5a7890', '#40586e'], stone: ['#b8aa8c', '#a89a80', '#c8b89a', '#9a8e78'] };
    const mtx = new THREE.Matrix4(), col = new THREE.Color();
    for (const k in lots) {
      const L = lots[k];
      if (!L.length) continue;
      const im = new THREE.InstancedMesh(box, mats[k], L.length);
      L.forEach((b, n) => {
        mtx.makeScale(b.x1 - b.x0, b.h, b.z1 - b.z0); mtx.setPosition((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2);
        im.setMatrixAt(n, mtx);
        col.set(baseCol[k][n % 4]).multiplyScalar(b.tint); im.setColorAt(n, col);
      });
      im.castShadow = true; im.receiveShadow = true;
      scene.add(im);
    }
    // cornisas en lo alto de cada edificio
    const corn = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ color: 0xd8d0c0, roughness: 0.8 }), this.buildings.length);
    this.buildings.forEach((b, n) => {
      mtx.makeScale(b.x1 - b.x0 + 0.8, 0.7, b.z1 - b.z0 + 0.8); mtx.setPosition((b.x0 + b.x1) / 2, b.h - 0.7, (b.z0 + b.z1) / 2);
      corn.setMatrixAt(n, mtx);
      col.set(b.style === 'glass' ? '#8aa0b0' : b.style === 'brick' ? '#c8b8a0' : '#d8d0c0'); corn.setColorAt(n, col);
    });
    corn.receiveShadow = true; corn.castShadow = true; scene.add(corn);
    this.roofProps(scene, r);
    this.landmark(scene);
    this.ground(scene);
    this.streetProps(scene, r);
    this.traffic(scene, r);
    this.pedestrians(scene, r);
    this.parkTrees(scene, r);
  },

  addToGrid(b) {
    const i0 = this.cellOf(b.x0), i1 = this.cellOf(b.x1), j0 = this.cellOf(b.z0), j1 = this.cellOf(b.z1);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = this.key(i, j);
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k).push(b);
    }
  },
  near(x, z, rad = 0) {
    const out = new Set();
    const i0 = this.cellOf(x - rad - 1), i1 = this.cellOf(x + rad + 1), j0 = this.cellOf(z - rad - 1), j1 = this.cellOf(z + rad + 1);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const L = this.grid.get(this.key(i, j)); if (L) for (const b of L) out.add(b); }
    return out;
  },
  // altura del suelo (acera o calle) en x,z
  groundAt(x, z) {
    const i = this.cellOf(x), j = this.cellOf(z);
    if (i < 0 || j < 0 || i >= CITY.N || j >= CITY.N) return 0;
    const lx = x - (CITY.MIN + i * CITY.CELL), lz = z - (CITY.MIN + j * CITY.CELL);
    const s = CITY.STREET / 2;
    return (lx > s && lx < s + CITY.BLOCK && lz > s && lz < s + CITY.BLOCK) ? CURB : 0;
  },
  raycast(o, d, maxT) {
    let best = maxT, hit = null;
    const steps = Math.ceil(maxT / 30);
    const seen = new Set();
    for (let s = 0; s <= steps; s++) {
      const t = Math.min(maxT, s * 30);
      for (const b of this.near(o.x + d.x * t, o.z + d.z * t, 30)) {
        if (seen.has(b)) continue; seen.add(b);
        const tt = rayAABB(o, d, b, best);
        if (tt >= 0 && tt < best) { best = tt; hit = b; }
      }
      if (hit && best < t) break;
    }
    return hit ? { t: best, b: hit } : null;
  },

  roofProps(scene, r) {
    const towers = [], acs = [];
    for (const b of this.buildings) {
      if (b.landmark) continue;
      if (r.chance(b.h < 70 ? 0.5 : 0.15)) towers.push({ x: lerp(b.x0 + 4, b.x1 - 4, r.next()), z: lerp(b.z0 + 4, b.z1 - 4, r.next()), y: b.h });
      const n = r.int(1, 3);
      for (let k = 0; k < n; k++) acs.push({ x: lerp(b.x0 + 2, b.x1 - 2, r.next()), z: lerp(b.z0 + 2, b.z1 - 2, r.next()), y: b.h, s: r.range(1.5, 3) });
    }
    const mtx = new THREE.Matrix4();
    const wood = new THREE.MeshStandardMaterial({ color: 0x6a4a32, roughness: 0.9 });
    const tank = new THREE.CylinderGeometry(1.8, 1.8, 3.2, 12); tank.translate(0, 4.6, 0);
    const cone = new THREE.ConeGeometry(2, 1.4, 12); cone.translate(0, 6.9, 0);
    const legs = new THREE.CylinderGeometry(1.4, 1.6, 3, 6, 1, true); legs.translate(0, 1.5, 0);
    for (const [g, mat] of [[tank, wood], [cone, new THREE.MeshStandardMaterial({ color: 0x3a3230, roughness: 0.8 })], [legs, new THREE.MeshStandardMaterial({ color: 0x2a2a2a, wireframe: true })]]) {
      const im = new THREE.InstancedMesh(g, mat, Math.max(1, towers.length));
      towers.forEach((t, n) => { mtx.makeTranslation(t.x, t.y, t.z); im.setMatrixAt(n, mtx); });
      im.count = towers.length; im.castShadow = true; scene.add(im);
    }
    const acg = new THREE.BoxGeometry(1, 1, 1); acg.translate(0, 0.5, 0);
    const im = new THREE.InstancedMesh(acg, new THREE.MeshStandardMaterial({ color: 0x9a9ea4, roughness: 0.6, metalness: 0.3 }), Math.max(1, acs.length));
    acs.forEach((a, n) => { mtx.makeScale(a.s, a.s * 0.6, a.s * 0.8); mtx.setPosition(a.x, a.y, a.z); im.setMatrixAt(n, mtx); });
    im.count = acs.length; im.castShadow = true; scene.add(im);
    this.towers = towers;
  },

  // Torre central con letrero luminoso (hito del horizonte)
  landmark(scene) {
    const b = this.buildings.find((x) => x.landmark);
    if (!b) return;
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 3, 40, 8), new THREE.MeshStandardMaterial({ color: 0xc0c8d0, metalness: 0.8, roughness: 0.3 }));
    spire.position.set(cx, b.h + 20, cz); spire.castShadow = true; scene.add(spire);
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
    const g = cv.getContext('2d');
    g.clearRect(0, 0, 256, 256); g.fillStyle = '#ffffff'; g.font = 'bold 220px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('A', 128, 138);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(22, 22), new THREE.MeshBasicMaterial({ map: tex, transparent: true, color: 0xfff4d0 }));
    for (let k = 0; k < 4; k++) {
      const s = sign.clone(); const a = k * Math.PI / 2;
      s.position.set(cx + Math.sin(a) * ((b.x1 - b.x0) / 2 + 0.2), b.h - 16, cz + Math.cos(a) * ((b.z1 - b.z0) / 2 + 0.2)); s.rotation.y = a; scene.add(s);
    }
    this.landmarkPos = new THREE.Vector3(cx, b.h, cz);
  },

  ground(scene) {
    const N = CITY.N, C = CITY.CELL;
    // textura de una celda: asfalto, líneas y pasos de cebra
    const cv = document.createElement('canvas'); const T = 512; cv.width = T; cv.height = T;
    const g = cv.getContext('2d'); const px = T / C;
    g.fillStyle = '#4a4a50'; g.fillRect(0, 0, T, T);
    for (let i = 0; i < 4000; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.08)'; g.fillRect(Math.random() * T, Math.random() * T, 2, 2); }
    const s = CITY.STREET / 2 * px, bl = CITY.BLOCK * px;
    g.fillStyle = '#e8c040';
    for (let k = 0; k < T; k += 22) { g.fillRect(k, 0 - 1.2, 12, 2.4); g.fillRect(0 - 1.2, k, 2.4, 12); }
    g.fillStyle = 'rgba(240,240,240,0.85)';
    for (let k = 0; k < 7; k++) {
      const o = -s + 6 + k * (2 * s - 12) / 6;
      g.fillRect(s - 20, o - 1.5 + T, 14, 3); g.fillRect(s + bl + 6, o - 1.5 + T, 14, 3);
      g.fillRect(o - 1.5 + T, s - 20, 3, 14); g.fillRect(o - 1.5 + T, s + bl + 6, 3, 14);
      g.fillRect(s - 20, o - 1.5, 14, 3); g.fillRect(o - 1.5, s - 20, 3, 14);
    }
    const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(N, N); tex.anisotropy = 8; tex.colorSpace = THREE.SRGBColorSpace;
    const road = new THREE.Mesh(new THREE.PlaneGeometry(CITY.SIZE, CITY.SIZE), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
    road.rotation.x = -Math.PI / 2; road.receiveShadow = true; scene.add(road);
    // aceras (bloques algo elevados)
    const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
    const walk = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ color: 0x8a8884, roughness: 0.9 }), this.blocks.length);
    const mtx = new THREE.Matrix4(), col = new THREE.Color();
    this.blocks.forEach((b, n) => {
      mtx.makeScale(CITY.BLOCK, CURB, CITY.BLOCK); mtx.setPosition(b.x0 + CITY.BLOCK / 2, 0, b.z0 + CITY.BLOCK / 2); walk.setMatrixAt(n, mtx);
      col.set(b.park ? '#4a7a3a' : '#8a8884'); walk.setColorAt(n, col);
    });
    walk.receiveShadow = true; scene.add(walk);
    // río alrededor de la isla
    const water = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial({ color: 0x3a6080, roughness: 0.35, metalness: 0.25 }));
    water.rotation.x = -Math.PI / 2; water.position.y = -1.5; scene.add(water);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(CITY.SIZE + 8, 3, CITY.SIZE + 8), new THREE.MeshStandardMaterial({ color: 0x5a5a58, roughness: 0.9 }));
    edge.position.y = -1.51; scene.add(edge);
  },

  streetProps(scene, r) {
    const lamps = [];
    for (const b of this.blocks) {
      for (let k = 4; k < CITY.BLOCK; k += 16) {
        lamps.push({ x: b.x0 + k, z: b.z0 + 0.8, a: Math.PI }); lamps.push({ x: b.x0 + k, z: b.z1 - 0.8, a: 0 });
        lamps.push({ x: b.x0 + 0.8, z: b.z0 + k, a: -Math.PI / 2 }); lamps.push({ x: b.x1 - 0.8, z: b.z0 + k, a: Math.PI / 2 });
      }
    }
    this.lamps = lamps;
    const pole = new THREE.CylinderGeometry(0.09, 0.12, 7, 6); pole.translate(0, 3.5 + CURB, 0);
    const arm = new THREE.BoxGeometry(0.1, 0.1, 1.6); arm.translate(0, 6.9 + CURB, 0.8);
    const head = new THREE.BoxGeometry(0.4, 0.15, 0.7); head.translate(0, 6.8 + CURB, 1.5);
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    const dark = new THREE.MeshStandardMaterial({ color: 0x24282c, roughness: 0.6, metalness: 0.5 });
    for (const [g, m] of [[pole, dark], [arm, dark], [head, new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xffc060, emissiveIntensity: 1.2 })]]) {
      const im = new THREE.InstancedMesh(g, m, lamps.length);
      lamps.forEach((l, n) => { q.setFromAxisAngle(up, l.a); mtx.compose(new THREE.Vector3(l.x, 0, l.z), q, one); im.setMatrixAt(n, mtx); });
      if (g === pole) im.castShadow = true;
      scene.add(im);
    }
  },

  // Tráfico: coches que circulan por las calles (solo visual)
  traffic(scene, r) {
    const n = 90;
    const body = new THREE.BoxGeometry(1.9, 0.8, 4.4); body.translate(0, 0.75, 0);
    const cab = new THREE.BoxGeometry(1.7, 0.65, 2.3); cab.translate(0, 1.45, -0.2);
    const wheels = new THREE.BoxGeometry(2.0, 0.6, 3.2); wheels.translate(0, 0.32, 0);
    this.carMesh = new THREE.InstancedMesh(body, new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.6 }), n);
    this.cabMesh = new THREE.InstancedMesh(cab, new THREE.MeshStandardMaterial({ color: 0x223040, roughness: 0.1, metalness: 0.8 }), n);
    this.wheelMesh = new THREE.InstancedMesh(wheels, new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }), n);
    const cols = ['#f0c020', '#f0c020', '#f0c020', '#c02828', '#2a4a8a', '#e8e8e8', '#202020', '#6a6a70', '#2a6a4a'];
    const col = new THREE.Color();
    this.cars = [];
    for (let k = 0; k < n; k++) {
      const alongX = r.chance(0.5), line = r.int(0, CITY.N), dir = r.chance(0.5) ? 1 : -1;
      const c = CITY.MIN + line * CITY.CELL + (dir > 0 ? -3 : 3);
      this.cars.push({ alongX, c, dir, p: r.range(CITY.MIN, CITY.MAX), v: r.range(9, 15) });
      col.set(cols[k % cols.length]); this.carMesh.setColorAt(k, col);
    }
    for (const m of [this.carMesh, this.cabMesh, this.wheelMesh]) { m.castShadow = true; scene.add(m); }
    this.updateTraffic(0);
  },
  updateTraffic(dt) {
    if (!this.carMesh) return;
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), pos = new THREE.Vector3();
    this.cars.forEach((c, k) => {
      c.p += c.dir * c.v * dt;
      if (c.p > CITY.MAX) c.p = CITY.MIN; if (c.p < CITY.MIN) c.p = CITY.MAX;
      if (c.alongX) { pos.set(c.p, 0, c.c); q.setFromAxisAngle(up, c.dir > 0 ? Math.PI / 2 : -Math.PI / 2); }
      else { pos.set(c.c, 0, c.p); q.setFromAxisAngle(up, c.dir > 0 ? 0 : Math.PI); }
      mtx.compose(pos, q, one);
      this.carMesh.setMatrixAt(k, mtx); this.cabMesh.setMatrixAt(k, mtx); this.wheelMesh.setMatrixAt(k, mtx);
    });
    this.carMesh.instanceMatrix.needsUpdate = true; this.cabMesh.instanceMatrix.needsUpdate = true; this.wheelMesh.instanceMatrix.needsUpdate = true;
  },

  // Peatones: siluetas sencillas que caminan por las aceras
  pedestrians(scene, r) {
    const n = 160;
    const bodyG = new THREE.CapsuleGeometry(0.22, 0.9, 3, 8); bodyG.translate(0, 0.72 + CURB, 0);
    const headG = new THREE.SphereGeometry(0.13, 10, 8); headG.translate(0, 1.55 + CURB, 0);
    this.pedBody = new THREE.InstancedMesh(bodyG, new THREE.MeshStandardMaterial({ roughness: 0.8 }), n);
    this.pedHead = new THREE.InstancedMesh(headG, new THREE.MeshStandardMaterial({ roughness: 0.7 }), n);
    const shirts = ['#3a5a8a', '#8a2a2a', '#2a2a2a', '#d8d0c0', '#4a7a4a', '#7a5a3a', '#6a3a7a', '#c8a040'], skins = ['#e0b090', '#c89070', '#8a5a3a', '#f0c8a8', '#6a4028'];
    const col = new THREE.Color();
    this.peds = [];
    for (let k = 0; k < n; k++) {
      const b = r.pick(this.blocks);
      const side = r.int(0, 3), t = r.range(2, CITY.BLOCK - 2);
      this.peds.push({ b, side, t, v: r.range(1.0, 1.7) * (r.chance(0.5) ? 1 : -1), ph: r.range(0, 6), flee: 0 });
      col.set(r.pick(shirts)); this.pedBody.setColorAt(k, col);
      col.set(r.pick(skins)); this.pedHead.setColorAt(k, col);
    }
    this.pedBody.castShadow = true; scene.add(this.pedBody); scene.add(this.pedHead);
    this.updatePeds(0);
  },
  pedPos(p) {
    const b = p.b, o = 1.8;
    return p.side === 0 ? [b.x0 + p.t, b.z0 + o] : p.side === 1 ? [b.x0 + p.t, b.z1 - o] : p.side === 2 ? [b.x0 + o, b.z0 + p.t] : [b.x1 - o, b.z0 + p.t];
  },
  updatePeds(dt, danger) {
    if (!this.pedBody) return;
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), pos = new THREE.Vector3();
    this.peds.forEach((p, k) => {
      const [x0, z0] = this.pedPos(p);
      if (danger && Math.hypot(x0 - danger.x, z0 - danger.z) < 25) p.flee = 2;
      p.flee = Math.max(0, p.flee - dt);
      const sp = p.v * (p.flee > 0 ? 3.5 : 1);
      p.t += sp * dt; p.ph += dt * Math.abs(sp) * 5;
      if (p.t > CITY.BLOCK - 2 || p.t < 2) { p.v = -p.v; p.t = clamp(p.t, 2, CITY.BLOCK - 2); }
      const [x, z] = this.pedPos(p);
      const a = (p.side < 2 ? (p.v > 0 ? Math.PI / 2 : -Math.PI / 2) : (p.v > 0 ? 0 : Math.PI));
      q.setFromAxisAngle(up, a + Math.sin(p.ph) * 0.08);
      pos.set(x, Math.abs(Math.sin(p.ph)) * 0.05, z);
      mtx.compose(pos, q, one);
      this.pedBody.setMatrixAt(k, mtx); this.pedHead.setMatrixAt(k, mtx);
    });
    this.pedBody.instanceMatrix.needsUpdate = true; this.pedHead.instanceMatrix.needsUpdate = true;
  },

  parkTrees(scene, r) {
    const trees = [];
    for (const b of this.parks) for (let k = 0; k < 40; k++) trees.push({ x: r.range(b.x0 + 3, b.x1 - 3), z: r.range(b.z0 + 3, b.z1 - 3), s: r.range(0.8, 1.4) });
    const trunk = new THREE.CylinderGeometry(0.25, 0.35, 3, 6); trunk.translate(0, 1.5 + CURB, 0);
    const crown = new THREE.IcosahedronGeometry(2.4, 1); crown.translate(0, 4.6 + CURB, 0);
    const mtx = new THREE.Matrix4();
    for (const [g, c] of [[trunk, 0x4a3422], [crown, 0x3a6a2a]]) {
      const im = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: g === crown }), trees.length);
      trees.forEach((t, n) => { mtx.makeScale(t.s, t.s, t.s); mtx.setPosition(t.x, 0, t.z); im.setMatrixAt(n, mtx); });
      im.castShadow = true; scene.add(im);
    }
  },
};

// ---- Cielo de atardecer con sol ----
function makeSky(scene, sunDir) {
  const geo = new THREE.SphereGeometry(3000, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color('#2a3a78') }, mid: { value: new THREE.Color('#e87850') }, bottom: { value: new THREE.Color('#ffc890') }, sun: { value: sunDir.clone().normalize() } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; uniform vec3 sun; varying vec3 vD;
      void main(){ float h = vD.y; vec3 c = h > 0.0 ? mix(mid, top, pow(clamp(h * 2.2, 0.0, 1.0), 0.7)) : mix(mid, bottom, clamp(-h * 6.0, 0.0, 1.0));
        float s = max(dot(normalize(vD), sun), 0.0); c += vec3(1.0, 0.75, 0.45) * (pow(s, 600.0) * 6.0 + pow(s, 12.0) * 0.45);
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  scene.add(sky);
  // nubes planas
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 512;
  const g = cv.getContext('2d');
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * 512, y = Math.random() * 512, rr = 20 + Math.random() * 60;
    const gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, 'rgba(255,220,200,0.35)'); gr.addColorStop(1, 'rgba(255,220,200,0)');
    g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  const ct = new THREE.CanvasTexture(cv); ct.colorSpace = THREE.SRGBColorSpace;
  const clouds = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), new THREE.MeshBasicMaterial({ map: ct, transparent: true, depthWrite: false, fog: false, color: 0xffd0b0 }));
  clouds.rotation.x = Math.PI / 2; clouds.position.y = 420; scene.add(clouds);
  return sky;
}
