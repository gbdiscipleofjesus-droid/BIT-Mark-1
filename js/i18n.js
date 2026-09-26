'use strict';
// ---------------------------------------------------------------------------
// Traducción en tiempo de ejecución. El juego está escrito en español; tr()
// busca la cadena (o sus partes) en el diccionario del idioma activo.
// ---------------------------------------------------------------------------
const I18N = {
  lang: 'es',
  LANGS: [
    { id: 'es', name: 'ESPAÑOL', voice: 'es-ES' },
    { id: 'en', name: 'ENGLISH', voice: 'en-US' },
    { id: 'zh', name: '中文', voice: 'zh-CN' },
  ],
  maps: {}, pre: {}, suf: {}, memo: {}, miss: new Set(), // miss: cadenas sin traducir (pruebas)

  set(lang) {
    if (!this.LANGS.some(l => l.id === lang)) lang = 'es';
    this.lang = lang;
    if (lang === 'es' || this.maps[lang]) return;
    const src = (typeof I18N_DATA !== 'undefined' && I18N_DATA[lang]) || {};
    const m = new Map(), pre = [], suf = [];
    for (const k in src) {
      const lk = k.toLowerCase();
      m.set(lk, src[k]);
      const t = lk.trim();
      if (t.length > 3 && t !== lk && src[k].trim() && !m.has(t)) m.set(t, src[k].trim());
      if (/[ :]$/.test(k) && t.length > 1) pre.push([lk, src[k]]);
      if (/^ /.test(k) && t.length > 1) suf.push([lk, src[k]]);
    }
    pre.sort((a, b) => b[0].length - a[0].length);
    suf.sort((a, b) => b[0].length - a[0].length);
    this.maps[lang] = m; this.pre[lang] = pre; this.suf[lang] = suf; this.memo[lang] = new Map();
  },

  voice() { return (this.LANGS.find(l => l.id === this.lang) || this.LANGS[0]).voice; },

  tr(s) {
    if (this.lang === 'es' || s == null) return s;
    s = String(s);
    if (!s || !/[a-zA-ZÁÉÍÓÚÑáéíóúñ¡¿]/.test(s)) return s;
    const memo = this.memo[this.lang];
    let r = memo.get(s);
    if (r !== undefined) return r;
    r = this._tr(s, 0);
    if (r === s) this.miss.add(s);
    if (memo.size > 4000) memo.clear();
    memo.set(s, r);
    return r;
  },

  _tr(s, depth) {
    const m = this.maps[this.lang];
    const low = s.toLowerCase();
    let v = m.get(low);
    if (v !== undefined) return v;
    const tl = low.trim();
    if (tl !== low) {
      v = m.get(tl);
      if (v !== undefined) return s.match(/^\s*/)[0] + v + s.match(/\s*$/)[0];
    }
    if (depth > 6 || s.length < 2) return s;
    // prefijo conocido ("MANDO CONECTADO: " + nombre)
    for (const [k, t] of this.pre[this.lang]) {
      if (low.startsWith(k) && low.length > k.length) return t + this._tr(s.slice(k.length), depth + 1);
    }
    // sufijo conocido (valor + " de daño")
    for (const [k, t] of this.suf[this.lang]) {
      if (low.endsWith(k) && low.length > k.length) return this._tr(s.slice(0, s.length - k.length), depth + 1) + t;
    }
    // etiquetas de botón entre corchetes: "[ESPACIO] APRENDER"
    const b = s.match(/^(.*?)\[([^\]]+)\](.*)$/s);
    if (b) return (b[1] ? this._tr(b[1], depth + 1) : '') + '[' + this._tr(b[2], depth + 1) + ']' + (b[3] ? this._tr(b[3], depth + 1) : '');
    // separadores habituales
    const m2 = s.match(/^(.*?)(: | · | - |  +| \/ |\n)(.*)$/s);
    if (m2) return this._tr(m2[1], depth + 1) + m2[2] + this._tr(m2[3], depth + 1);
    // número delante o detrás ("3 VIDAS", "NIVEL 2")
    const n1 = s.match(/^([-+x×]?[\d.,%]+ ?)(.+)$/i);
    if (n1) { const t = this._tr(n1[2], depth + 1); if (t !== n1[2]) return n1[1] + t; }
    const n2 = s.match(/^(.+?)( ?[-+x×]?[\d.,%/]+)$/i);
    if (n2) { const t = this._tr(n2[1], depth + 1); if (t !== n2[1]) return t + n2[2]; }
    // etiqueta de tecla delante ("Q/E CAMBIAR PÁGINA")
    const w = s.match(/^([^\s]{1,6} )(.+)$/);
    if (w && !/[a-záéíóúñ]{3}/i.test(w[1])) { const t = this._tr(w[2], depth + 1); if (t !== w[2]) return w[1] + t; }
    return s;
  },
};
function tr(s) { return I18N.tr(s); }
// idioma guardado (también lo usa la versión 3D)
I18N.set((typeof Store !== 'undefined' && (Store.get('sm_settings', null) || {}).lang) || 'es');
