'use strict';
// ---------------------------------------------------------------------------
// Postproducción al estilo de los juegos de consola: la escena se dibuja en HDR
// en un búfer propio, se le añade resplandor (bloom) de las luces intensas y
// luego un paso final aplica tono fílmico, gradación de color, viñeta, líneas
// de velocidad al balancearse, aberración cromática en los golpes y el tinte
// azulado de la cámara lenta.
// ---------------------------------------------------------------------------
const POST_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

class PostFX {
  constructor(renderer) {
    this.r = renderer;
    this.enabled = true;
    this.speed = 0; this.hit = 0; this.slow = 0; this.danger = 0;
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.quad = new THREE.Mesh(tri);
    this.quad.frustumCulled = false;
    this.qScene = new THREE.Scene(); this.qScene.add(this.quad);
    this.qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const rtOpts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter };
    this.main = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, samples: 4 });
    this.mips = [];
    for (let i = 0; i < 5; i++) this.mips.push(new THREE.WebGLRenderTarget(4, 4, rtOpts));
    // brillo: umbral suave + primer reducido
    this.mPre = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThr: { value: 1.25 } },
      vertexShader: POST_VS,
      fragmentShader: `uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThr; varying vec2 vUv;
        vec3 s(vec2 o) { return texture2D(tSrc, vUv + o * uTexel).rgb; }
        void main() {
          vec3 c = (s(vec2(-1.0, -1.0)) + s(vec2(1.0, -1.0)) + s(vec2(-1.0, 1.0)) + s(vec2(1.0, 1.0))) * 0.25;
          float l = max(c.r, max(c.g, c.b));
          float k = clamp((l - uThr + 0.5) / 1.0, 0.0, 1.0); k = k * k;
          gl_FragColor = vec4(c * max(k, l - uThr) / max(l, 1e-4), 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    // reducción con filtro de 13 muestras
    this.mDown = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } },
      vertexShader: POST_VS,
      fragmentShader: `uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
        vec3 s(vec2 o) { return texture2D(tSrc, vUv + o * uTexel).rgb; }
        void main() {
          vec3 c = s(vec2(0.0)) * 0.125;
          c += (s(vec2(-1.0, -1.0)) + s(vec2(1.0, -1.0)) + s(vec2(-1.0, 1.0)) + s(vec2(1.0, 1.0))) * 0.125;
          c += (s(vec2(-2.0, -2.0)) + s(vec2(2.0, -2.0)) + s(vec2(-2.0, 2.0)) + s(vec2(2.0, 2.0))) * 0.03125;
          c += (s(vec2(-2.0, 0.0)) + s(vec2(2.0, 0.0)) + s(vec2(0.0, -2.0)) + s(vec2(0.0, 2.0))) * 0.0625;
          gl_FragColor = vec4(c, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    // ampliación con filtro tienda (se suma a la capa de arriba)
    this.mUp = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uW: { value: 1 } },
      vertexShader: POST_VS,
      fragmentShader: `uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uW; varying vec2 vUv;
        vec3 s(vec2 o) { return texture2D(tSrc, vUv + o * uTexel).rgb; }
        void main() {
          vec3 c = s(vec2(0.0)) * 4.0;
          c += (s(vec2(-1.0, 0.0)) + s(vec2(1.0, 0.0)) + s(vec2(0.0, -1.0)) + s(vec2(0.0, 1.0))) * 2.0;
          c += s(vec2(-1.0, -1.0)) + s(vec2(1.0, -1.0)) + s(vec2(-1.0, 1.0)) + s(vec2(1.0, 1.0));
          gl_FragColor = vec4(c / 16.0 * uW, 1.0);
        }`,
      blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true,
    });
    // composición final
    this.mFinal = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null }, tBloom: { value: null }, uBloom: { value: 0.32 }, uExposure: { value: 1.1 },
        uTime: { value: 0 }, uSpeed: { value: 0 }, uHit: { value: 0 }, uSlow: { value: 0 }, uDanger: { value: 0 }, uAspect: { value: 1 },
      },
      vertexShader: POST_VS,
      fragmentShader: `uniform sampler2D tScene, tBloom; uniform float uBloom, uExposure, uTime, uSpeed, uHit, uSlow, uDanger, uAspect; varying vec2 vUv;
        vec3 RRTAndODTFit(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
        vec3 aces(vec3 c) {
          const mat3 I = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
          const mat3 O = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
          c *= uExposure / 0.6; c = I * c; c = RRTAndODTFit(c); c = O * c; return clamp(c, 0.0, 1.0);
        }
        vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
        float h12(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main() {
          vec2 uv = vUv, d = uv - 0.5;
          // aberración cromática en los golpes fuertes y a gran velocidad
          float ca = uHit * 0.0025 + uSpeed * 0.002;
          vec3 col;
          if (ca > 0.0001) {
            col.r = texture2D(tScene, uv - d * ca).r; col.g = texture2D(tScene, uv).g; col.b = texture2D(tScene, uv + d * ca).b;
          } else col = texture2D(tScene, uv).rgb;
          // difuminado radial al ir muy rápido
          if (uSpeed > 0.05) {
            vec3 acc = col; float w = 1.0;
            for (int i = 1; i < 6; i++) { float f = float(i) / 6.0; float k = 1.0 - f; acc += texture2D(tScene, uv - d * f * 0.045 * uSpeed).rgb * k; w += k; }
            float m = smoothstep(0.12, 0.5, length(d));
            col = mix(col, acc / w, m);
          }
          col += texture2D(tBloom, uv).rgb * uBloom;
          col = aces(col);
          // gradación: sombras frías, luces cálidas (look de atardecer de consola)
          float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
          col = mix(col, col * vec3(0.9, 0.97, 1.1), (1.0 - l) * 0.35);
          col = mix(col, col * vec3(1.06, 1.0, 0.92), l * 0.3);
          col = mix(vec3(l), col, 1.1);
          col = (col - 0.5) * 1.05 + 0.5;
          // cámara lenta: desaturado y tinte azul
          col = mix(col, vec3(l) * vec3(0.75, 0.9, 1.2), uSlow * 0.55);
          // sentido arácnido: pulso rojo en los bordes
          float vig = smoothstep(0.85, 0.2, length(d * vec2(uAspect * 0.8, 1.0)));
          col *= mix(0.55, 1.0, vig);
          float edge = smoothstep(0.42, 0.75, length(d * vec2(uAspect * 0.75, 1.0)));
          col = mix(col, vec3(0.9, 0.12, 0.06), edge * uDanger * 0.12);
          // líneas de velocidad
          if (uSpeed > 0.2) {
            float a = atan(d.y, d.x * uAspect) / 6.2832 * 220.0;
            float n = h12(vec2(floor(a), floor(uTime * 14.0)));
            float thin = 1.0 - smoothstep(0.0, 0.18, abs(fract(a) - 0.5));
            float r = length(d * vec2(uAspect, 1.0));
            float line = step(0.93, n) * thin * smoothstep(0.45, 0.85, r) * (uSpeed - 0.2) * 0.4;
            col = mix(col, vec3(1.0), line);
          }
          col = clamp(col, 0.0, 1.0);
          col = toSRGB(col);
          col += (h12(uv * 1000.0 + uTime) - 0.5) / 255.0;
          gl_FragColor = vec4(col, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
  }
  setSize(w, h) {
    const pr = this.r.getPixelRatio();
    const W = Math.max(4, Math.floor(w * pr)), H = Math.max(4, Math.floor(h * pr));
    this.main.setSize(W, H);
    let mw = W >> 1, mh = H >> 1;
    for (const m of this.mips) { m.setSize(Math.max(2, mw), Math.max(2, mh)); mw >>= 1; mh >>= 1; }
    this.mFinal.uniforms.uAspect.value = W / H;
  }
  pass(mat, target) {
    this.quad.material = mat;
    this.r.setRenderTarget(target);
    this.r.render(this.qScene, this.qCam);
  }
  render(scene, camera, time) {
    const R = this.r;
    if (!this.enabled) { R.setRenderTarget(null); R.render(scene, camera); return; }
    const tm = R.toneMapping;
    R.setRenderTarget(this.main); R.render(scene, camera);
    const M = this.mips;
    this.mPre.uniforms.tSrc.value = this.main.texture;
    this.mPre.uniforms.uTexel.value.set(1 / this.main.width, 1 / this.main.height);
    this.pass(this.mPre, M[0]);
    for (let i = 1; i < M.length; i++) {
      this.mDown.uniforms.tSrc.value = M[i - 1].texture;
      this.mDown.uniforms.uTexel.value.set(1 / M[i - 1].width, 1 / M[i - 1].height);
      this.pass(this.mDown, M[i]);
    }
    R.autoClear = false;
    for (let i = M.length - 1; i > 0; i--) {
      this.mUp.uniforms.tSrc.value = M[i].texture;
      this.mUp.uniforms.uTexel.value.set(1 / M[i].width, 1 / M[i].height);
      this.mUp.uniforms.uW.value = 1;
      this.pass(this.mUp, M[i - 1]);
    }
    R.autoClear = true;
    const U = this.mFinal.uniforms;
    U.tScene.value = this.main.texture; U.tBloom.value = M[0].texture;
    U.uTime.value = time; U.uSpeed.value = this.speed; U.uHit.value = this.hit; U.uSlow.value = this.slow; U.uDanger.value = this.danger;
    U.uExposure.value = R.toneMappingExposure;
    R.toneMapping = THREE.NoToneMapping;
    this.pass(this.mFinal, null);
    R.toneMapping = tm;
  }
}
