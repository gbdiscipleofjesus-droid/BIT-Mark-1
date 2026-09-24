'use strict';
// ---------------------------------------------------------------------------
// Progreso estilo PlayStation: experiencia y niveles, árbol de habilidades,
// artilugios, poderes de traje, trajes fabricables, récords y retos.
// ---------------------------------------------------------------------------

// ---- Árbol de habilidades (3 ramas) ----
const SKILL_BRANCHES = [
  { id: 'd', name: 'DEFENSOR', color: '#ff5060', desc: 'Combate cuerpo a cuerpo' },
  { id: 'b', name: 'BALANCEADOR', color: '#40c0ff', desc: 'Movimiento y acrobacias' },
  { id: 'i', name: 'INNOVADOR', color: '#ffd040', desc: 'Telarañas y artilugios' },
];
const SKILLS = [
  { id: 'd_vida', b: 'd', name: 'Vitalidad', desc: '+25 de vida máxima.' },
  { id: 'd_foco', b: 'd', name: 'Concentración', desc: 'El foco sube un 30% más rápido.' },
  { id: 'd_remate', b: 'd', name: 'Remate', desc: 'La patada final del combo hace +50% de daño.', req: 'd_foco' },
  { id: 'd_contra', b: 'd', name: 'Contraataque perfecto', desc: 'Tras una esquiva perfecta, tu siguiente golpe hace el doble y lanza.', req: 'd_vida' },
  { id: 'd_sismo', b: 'd', name: 'Impacto sísmico', desc: 'El picado crea una onda enorme que atrapa a los enemigos.', req: 'd_remate' },
  { id: 'd_tiron', b: 'd', name: 'Tirón de red', desc: 'ARRIBA + disparo de red: atrae al enemigo hacia ti.', req: 'd_contra' },
  { id: 'd_escudo', b: 'd', name: 'Piel dura', desc: 'Recibes un 20% menos de daño.', req: 'd_sismo' },
  { id: 'b_veloz', b: 'b', name: 'Balanceo veloz', desc: 'Te balanceas un 15% más rápido.' },
  { id: 'b_triple', b: 'b', name: 'Triple salto', desc: 'Un salto extra en el aire.' },
  { id: 'b_trepa', b: 'b', name: 'Trepador experto', desc: 'Trepas un 60% más rápido.', req: 'b_veloz' },
  { id: 'b_planeo', b: 'b', name: 'Alas de telaraña', desc: 'Mantén SALTO mientras caes para planear.', req: 'b_triple' },
  { id: 'b_trucos', b: 'b', name: 'Acrobacias', desc: 'Los saltos y esquivas en el aire te dan foco.', req: 'b_trepa' },
  { id: 'b_picado', b: 'b', name: 'Picado relámpago', desc: 'El picado es más rápido y hace más daño.', req: 'b_planeo' },
  { id: 'b_impulso', b: 'b', name: 'Impulso final', desc: 'Al soltar la telaraña sales disparado más lejos.', req: 'b_trucos' },
  { id: 'i_cartuchos', b: 'i', name: 'Cartuchos extra', desc: '+2 cartuchos de red.' },
  { id: 'i_recarga', b: 'i', name: 'Recarga rápida', desc: 'La red se recarga el doble de rápido.' },
  { id: 'i_electrica', b: 'i', name: 'Red eléctrica', desc: 'Tus bolas de red también electrocutan.', req: 'i_cartuchos' },
  { id: 'i_impacto', b: 'i', name: 'Red de impacto', desc: 'Tus bolas de red empujan y derriban.', req: 'i_electrica' },
  { id: 'i_ingenio', b: 'i', name: 'Ingeniería', desc: '+1 carga en todos los artilugios.', req: 'i_recarga' },
  { id: 'i_frio', b: 'i', name: 'Refrigeración', desc: 'Los artilugios se recargan un 35% más rápido.', req: 'i_ingenio' },
  { id: 'i_poder', b: 'i', name: 'Batería del traje', desc: 'El poder del traje se recarga un 40% más rápido.', req: 'i_impacto' },
];

// ---- Artilugios ----
const GADGETS = [
  { id: 'impacto', name: 'Red de impacto', desc: 'Una red pesada que empuja al enemigo y lo deja atrapado.', charges: 3, cd: 7, lvl: 1, color: '#e8e8f0' },
  { id: 'bomba', name: 'Bomba de red', desc: 'Explota y atrapa a todos los enemigos a su alrededor.', charges: 2, cd: 11, lvl: 2, color: '#a0e0ff' },
  { id: 'mina', name: 'Mina trampa', desc: 'Colócala en el suelo: atrapa y electrocuta al primero que pase.', charges: 3, cd: 9, lvl: 4, color: '#ffd040' },
  { id: 'dron', name: 'Dron araña', desc: 'Un pequeño dron que dispara a los enemigos durante un rato.', charges: 1, cd: 18, lvl: 6, color: '#ff6060' },
  { id: 'onda', name: 'Onda de choque', desc: 'Una ráfaga de aire que lanza lejos a los enemigos.', charges: 2, cd: 9, lvl: 8, color: '#c0ffc0' },
  { id: 'matriz', name: 'Matriz de suspensión', desc: 'Los enemigos cercanos flotan indefensos unos segundos.', charges: 2, cd: 13, lvl: 10, color: '#c080ff' },
  { id: 'electrica', name: 'Red eléctrica', desc: 'Electrocuta y aturde al enemigo.', charges: 3, cd: 8, lvl: 12, color: '#60e0ff' },
  { id: 'rebote', name: 'Red de rebote', desc: 'Rebota entre varios enemigos seguidos.', charges: 3, cd: 9, lvl: 14, color: '#ffa0e0' },
];
const GADGET_COST = [0, 20, 40];   // tecnología para subir a nivel 2 y 3

// ---- Poderes de traje ----
const SUIT_POWERS = {
  furia: { name: 'Furia de batalla', desc: '10 s: el foco se llena solo y golpeas un 50% más fuerte.' },
  rafaga: { name: 'Explosión de red', desc: 'Atrapa con red a todos los enemigos de la pantalla.' },
  hermano: { name: 'Spider-Bro', desc: 'Un dron amigo lucha contigo durante 15 s.' },
  invisible: { name: 'Camuflaje', desc: '8 s invisible: no te pueden dañar y tus golpes hacen el doble.' },
  brazos: { name: 'Brazos de hierro', desc: '12 s: patas mecánicas golpean a los enemigos cercanos.' },
  escudo: { name: 'Barrera', desc: '6 s de invulnerabilidad total.' },
  electrico: { name: 'Puños eléctricos', desc: '12 s: tus golpes electrocutan y aturden.' },
  sismo: { name: 'Terremoto', desc: 'Un golpe al suelo que derriba a todos los enemigos cercanos.' },
  tiempo: { name: 'Velocidad', desc: '6 s: el mundo va a cámara lenta, tú no.' },
  negativo: { name: 'Onda negativa', desc: 'Una onda que empuja, daña y atrapa a los enemigos.' },
};
const POWER_CD = 45;
// poder de los trajes de la historia
const STORY_SUIT_POWERS = { bnd: 'furia', nwh: 'rafaga', casero: 'hermano', sigilo: 'invisible', stark: 'electrico', ffh: 'escudo', iron: 'brazos', raimi: 'sismo', tasm: 'electrico', verse: 'invisible', avanzado: 'rafaga', sociedad: 'tiempo', tierra0: 'furia', cero: 'negativo' };

// ---- Trajes fabricables (estilo PlayStation) ----
// lvl = nivel mínimo, tech = coste de fabricación
const EXTRA_SUITS = [
  ['negro', 'Traje simbionte', 'Negro, con la araña blanca enorme. Tiene hambre.', 'rafaga', 2, 20, { head: '#141418', torso: '#141418', torsoLow: '#141418', arm: '#141418', leg: '#141418', boot: '#141418', face: 'spider', emblem: '#f4f4f4', emblemStyle: 'big', eye: '#ffffff' }],
  ['escarlata', 'Araña Escarlata', 'Sudadera azul sin mangas sobre el traje rojo.', 'furia', 2, 20, { deco: 'hood', webs: true, webLine: '#5a0a10', head: '#c01820', torso: '#2a50b8', torsoLow: '#c01820', arm: '#c01820', arm2: '#c01820', leg: '#c01820', boot: '#c01820', face: 'spider', emblem: '#c01820', emblemStyle: 'long', eye: '#e8f0f4' }],
  ['noir', 'Spider-Man Noir', 'Años 30, blanco y negro, sombrero y gafas de aviador.', 'invisible', 3, 25, { deco: 'noir', head: '#24242a', torso: '#2a2a30', torsoLow: '#1a1a20', arm: '#2a2a30', arm2: '#1a1a20', leg: '#1a1a20', boot: '#101014', face: 'goggles', eye: '#a0a0a8' }],
  ['punk', 'Spider-Punk', 'Cresta, chaqueta con pinchos y mucha actitud.', 'sismo', 3, 25, { deco: 'punk', webs: true, webLine: '#1a1a22', head: '#d82030', torso: '#20242e', torsoLow: '#2a40c0', side: '#d82030', arm: '#20242e', arm2: '#d82030', leg: '#2a40c0', boot: '#20242e', face: 'spider', emblem: '#f4f4f4', emblemStyle: 'small', eye: '#ffffff' }],
  ['clasico2099', 'Spider-Man 2099 clásico', 'Azul oscuro con la calavera araña roja.', 'tiempo', 4, 30, { deco: 'cape', capeCol: '#d01a2a', head: '#1a2050', torso: '#1a2050', torsoLow: '#1a2050', arm: '#1a2050', leg: '#1a2050', boot: '#1a2050', hand: '#d01a2a', face: 'spider', emblem: '#d01a2a', emblemStyle: 'big', eye: '#ff3040' }],
  ['uk', 'Spider-UK', 'El agente araña del Reino Unido.', 'escudo', 4, 30, { webs: true, webLine: '#0a1a50', head: '#d0202c', torso: '#1a3a9a', torsoLow: '#1a3a9a', side: '#d0202c', trim: '#f4f4f4', arm: '#d0202c', arm2: '#1a3a9a', leg: '#1a3a9a', boot: '#d0202c', face: 'spider', emblem: '#f4f4f4', emblemStyle: 'long' }],
  ['superior', 'Superior Spider-Man', 'Rojo y negro, garras y ojos rojos. Más listo que nadie.', 'brazos', 5, 35, { webs: true, webLine: '#1a1a22', head: '#c01820', torso: '#c01820', torsoLow: '#16161c', side: '#16161c', arm: '#16161c', arm2: '#c01820', leg: '#16161c', boot: '#c01820', face: 'spider', emblem: '#16161c', emblemStyle: 'long', eye: '#ff3a3a' }],
  ['velocity', 'Traje Velocity', 'Líneas de energía azules para correr más que nadie.', 'tiempo', 5, 35, { head: '#16161c', torso: '#16161c', torsoLow: '#16161c', side: '#c01820', trim: '#40e0ff', arm: '#16161c', arm2: '#c01820', leg: '#16161c', boot: '#c01820', face: 'spider', emblem: '#40e0ff', emblemStyle: 'long', eye: '#80f0ff' }],
  ['fundacion', 'Fundación Futura', 'Blanco y negro, del grupo de científicos más brillante.', 'escudo', 6, 40, { head: '#1a1a22', torso: '#f0f0f4', torsoLow: '#1a1a22', side: '#1a1a22', arm: '#f0f0f4', arm2: '#1a1a22', leg: '#1a1a22', boot: '#f0f0f4', face: 'spider', emblem: '#1a1a22', emblemStyle: 'small', eye: '#80c0ff' }],
  ['antiock', 'Traje Anti-Ock', 'Diseñado para vencer al doctor de los tentáculos.', 'electrico', 6, 40, { head: '#16161c', torso: '#16161c', torsoLow: '#16161c', side: '#2060e0', trim: '#80c0ff', arm: '#16161c', leg: '#16161c', boot: '#16161c', face: 'spider', emblem: '#f4f4f4', emblemStyle: 'big', eye: '#60c0ff' }],
  ['bigtime', 'Traje de sigilo verde', 'Brilla en verde para despistar a los sensores.', 'invisible', 7, 40, { deco: 'stealth', head: '#101418', torso: '#101418', torsoLow: '#101418', side: '#101418', trim: '#40ff90', arm: '#101418', leg: '#101418', boot: '#101418', face: 'spider', emblem: '#40ff90', emblemStyle: 'long', eye: '#40ff90' }],
  ['armadura1', 'Armadura MK I', 'Placas de metal atornilladas. Pesada pero dura.', 'escudo', 7, 45, { deco: 'armor', head: '#8a8e96', torso: '#8a8e96', torsoLow: '#5a5e66', arm: '#8a8e96', arm2: '#5a5e66', leg: '#5a5e66', boot: '#3a3e46', face: 'spider', emblem: '#d01a2a', emblemStyle: 'small', eye: '#d0e8ff' }],
  ['armadura2', 'Armadura MK II', 'Plata y rojo, con blindaje reactivo.', 'escudo', 8, 45, { deco: 'armor', head: '#c01820', torso: '#b8bcc4', torsoLow: '#c01820', side: '#c01820', arm: '#b8bcc4', arm2: '#c01820', leg: '#b8bcc4', boot: '#c01820', face: 'spider', emblem: '#c01820', emblemStyle: 'long', eye: '#ffffff' }],
  ['armadura4', 'Armadura MK IV', 'Rojo oscuro y negro, con lentes brillantes.', 'brazos', 9, 50, { deco: 'armor', head: '#16161c', torso: '#9a1018', torsoLow: '#16161c', side: '#16161c', trim: '#ff4040', arm: '#16161c', arm2: '#9a1018', leg: '#16161c', boot: '#9a1018', face: 'spider', emblem: '#ff4040', emblemStyle: 'long', eye: '#ff6060' }],
  ['electro2', 'Traje eléctrico', 'Azul y blanco, con chispas en las manos.', 'electrico', 9, 50, { head: '#f4f4f8', torso: '#2050d0', torsoLow: '#2050d0', side: '#f4f4f8', trim: '#ffe040', arm: '#2050d0', arm2: '#f4f4f8', hand: '#ffe040', leg: '#2050d0', boot: '#f4f4f8', face: 'spider', emblem: '#ffe040', emblemStyle: 'long', eye: '#80e0ff' }],
  ['reilly', 'Traje de Ben Reilly', 'Azul con una araña roja gigante en el pecho.', 'furia', 10, 50, { deco: 'hood', webs: true, webLine: '#0a1a60', head: '#d01a24', torso: '#2a4ad8', torsoLow: '#d01a24', arm: '#d01a24', arm2: '#d01a24', leg: '#d01a24', boot: '#d01a24', face: 'spider', emblem: '#d01a24', emblemStyle: 'big' }],
  ['guerras', 'Guerras Secretas', 'Blanco y negro, de otro planeta.', 'rafaga', 10, 55, { head: '#16161c', torso: '#16161c', torsoLow: '#16161c', side: '#f0f0f4', arm: '#16161c', arm2: '#f0f0f4', leg: '#16161c', boot: '#f0f0f4', face: 'spider', emblem: '#f0f0f4', emblemStyle: 'long', eye: '#ffffff' }],
  ['bastion', 'Último bastión', 'El traje clásico, roto después de mil batallas.', 'furia', 11, 55, { deco: 'burn', webs: true, webLine: '#4a0a10', head: '#b01820', torso: '#b01820', torsoLow: '#1a2a7a', side: '#1a2a7a', arm: '#b01820', leg: '#1a2a7a', boot: '#b01820', face: 'spider', emblem: '#140a12', emblemStyle: 'small', eye: '#e8f0f4' }],
  ['negativo', 'Traje negativo', 'Colores invertidos, como una foto en negativo.', 'negativo', 11, 55, { webs: true, webLine: '#f4f4f4', head: '#101010', torso: '#101010', torsoLow: '#f0f0f0', side: '#f0f0f0', arm: '#101010', arm2: '#101010', leg: '#f0f0f0', boot: '#101010', face: 'spider', emblem: '#f4f4f4', emblemStyle: 'long', eye: '#101010' }],
  ['luchador', 'Traje de lucha libre', 'Con el que Peter peleó por dinero. Qué tiempos.', 'sismo', 12, 55, { deco: 'hood', head: '#c01820', torso: '#2040a0', torsoLow: '#2040a0', arm: '#c01820', arm2: '#c01820', leg: '#2040a0', boot: '#c01820', face: 'goggles', emblem: '#140a12', eye: '#a0c0ff' }],
  ['calzones', 'Solo ropa interior', 'Eh... ¿dónde está el resto del traje?', 'furia', 12, 60, { head: '#d0202c', torso: '#e8b890', torsoLow: '#f4f4f4', arm: '#e8b890', arm2: '#e8b890', hand: '#e8b890', leg: '#e8b890', boot: '#d0202c', face: 'spider', eye: '#e8f0f4', webs: true, webLine: '#5a0a10' }],
  ['bolsa', 'Hombre Bolsa Bombástico', 'Una bolsa de papel en la cabeza y mucha dignidad.', 'escudo', 13, 60, { head: '#c8a870', torso: '#16161c', torsoLow: '#16161c', arm: '#16161c', leg: '#16161c', boot: '#16161c', face: 'bag', eye: '#140a12' }],
  ['milesclasico', 'Miles clásico', 'Negro con telarañas rojas. El de Brooklyn.', 'invisible', 13, 60, { webs: true, webLine: '#e0202c', head: '#16161c', torso: '#16161c', torsoLow: '#16161c', arm: '#16161c', leg: '#16161c', boot: '#e0202c', hand: '#e0202c', face: 'spider', emblem: '#e0202c', emblemStyle: 'big', eye: '#ffffff' }],
  ['ghost', 'Ghost-Spider', 'Capucha blanca, telarañas rosas y zapatillas turquesa.', 'rafaga', 14, 60, { deco: 'hood', webs: true, webLine: '#e04a9a', head: '#f4f4f8', torso: '#f4f4f8', torsoLow: '#f4f4f8', side: '#16161c', arm: '#e04a9a', arm2: '#f4f4f8', hand: '#40c0d0', leg: '#f4f4f8', boot: '#40c0d0', face: 'spider', emblem: '#16161c', eye: '#ffffff' }],
  ['mayday', 'Spider-Girl', 'La hija de Peter en otro futuro.', 'tiempo', 14, 65, { webs: true, webLine: '#0a1a50', head: '#d0202c', torso: '#d0202c', torsoLow: '#1a3aa0', side: '#1a3aa0', arm: '#1a3aa0', arm2: '#d0202c', leg: '#1a3aa0', boot: '#d0202c', face: 'spider', emblem: '#f4f4f4', emblemStyle: 'small', eye: '#ffffff' }],
  ['seda', 'Seda', 'Negro y blanco, fabrica su propia tela.', 'rafaga', 15, 65, { head: '#16161c', torso: '#16161c', torsoLow: '#16161c', side: '#f0f0f4', arm: '#f0f0f4', arm2: '#16161c', leg: '#16161c', boot: '#16161c', face: 'mask', hair: '#16161c', emblem: '#f0f0f4', emblemStyle: 'long', eye: '#f0f0f4' }],
  ['1602', 'Araña de 1602', 'Capa, botas altas y siglos de historia.', 'sismo', 15, 65, { deco: 'cape', webs: true, webLine: '#3a1a10', head: '#b01820', torso: '#b01820', torsoLow: '#5a3a20', arm: '#b01820', leg: '#5a3a20', boot: '#3a2414', face: 'spider', emblem: '#140a12', emblemStyle: 'small', eye: '#f0e0c0' }],
  ['cyborg', 'Spider-Cyborg', 'Medio máquina, medio arácnido.', 'brazos', 16, 70, { head: '#b8bcc4', torso: '#d0202c', torsoLow: '#2040a0', side: '#b8bcc4', trim: '#40e0ff', arm: '#b8bcc4', arm2: '#b8bcc4', hand: '#b8bcc4', leg: '#2040a0', boot: '#b8bcc4', face: 'spider', emblem: '#40e0ff', emblemStyle: 'small', eye: '#40e0ff' }],
  ['vintage', 'Cómic vintage', 'Como en las primeras viñetas: líneas gruesas y colores planos.', 'furia', 16, 70, { webs: true, webLine: '#000000', head: '#e02020', torso: '#e02020', torsoLow: '#1a3ae0', side: '#1a3ae0', arm: '#e02020', arm2: '#e02020', leg: '#1a3ae0', boot: '#e02020', face: 'spider', emblem: '#000000', emblemStyle: 'small', eye: '#ffffff', eyeSize: 1.15 }],
  ['dorado', 'Armadura dorada', 'Oro puro. Brilla demasiado para el sigilo.', 'escudo', 17, 75, { deco: 'armor', head: '#e0b030', torso: '#e0b030', torsoLow: '#a07818', arm: '#e0b030', arm2: '#a07818', leg: '#a07818', boot: '#e0b030', face: 'spider', emblem: '#6a4a08', emblemStyle: 'long', eye: '#fff4c0' }],
  ['sombra', 'Traje sombra', 'Morado y negro, para moverse de noche.', 'invisible', 17, 75, { head: '#1a1426', torso: '#1a1426', torsoLow: '#1a1426', side: '#5a2a90', trim: '#c080ff', arm: '#1a1426', leg: '#1a1426', boot: '#5a2a90', face: 'spider', emblem: '#c080ff', emblemStyle: 'long', eye: '#e0c0ff' }],
  ['integrado', 'Traje integrado', 'Rojo, azul y oro: lo mejor de Stark y de Peter.', 'brazos', 18, 80, { webs: true, webLine: '#3a0a10', head: '#c81820', torso: '#c81820', torsoLow: '#c81820', side: '#1c38a8', trim: '#e0b030', shoulder: '#c81820', arm: '#1c38a8', arm2: '#c81820', leg: '#1c38a8', boot: '#c81820', face: 'spider', emblem: '#e0b030', emblemStyle: 'long' }],
  ['oscuro', 'Traje oscuro', 'Negro mate con líneas rojas. Para las noches largas.', 'negativo', 19, 85, { webs: true, webLine: '#a01018', head: '#121216', torso: '#121216', torsoLow: '#121216', side: '#121216', trim: '#c01820', arm: '#121216', leg: '#121216', boot: '#121216', face: 'spider', emblem: '#c01820', emblemStyle: 'long', eye: '#ff5050' }],
  ['arana_hierro_2', 'Iron Spider clásico', 'Rojo y dorado con patas mecánicas, versión cómic.', 'brazos', 20, 90, { deco: 'ironlegs', head: '#c01822', torso: '#c01822', torsoLow: '#e0b030', side: '#e0b030', arm: '#c01822', arm2: '#e0b030', leg: '#c01822', boot: '#e0b030', face: 'spider', emblem: '#e0b030', emblemStyle: 'big', eye: '#fff0c0' }],
  ['multiverso', 'Traje del multiverso', 'Cambia de color con cada grieta que cruzaste.', 'tiempo', 22, 100, { webs: true, webLine: '#ffffff', head: '#6020c0', torso: '#20a0c0', torsoLow: '#c020a0', side: '#e0c020', arm: '#c02060', arm2: '#20c080', leg: '#2040c0', boot: '#e06020', face: 'spider', emblem: '#ffffff', emblemStyle: 'long', eye: '#ffffff' }],
];
for (const [id, name, desc, power, lvl, tech, pal] of EXTRA_SUITS) {
  SUITS.push({ id, name, desc, pal, power, lvl, tech, craft: true, palObj: makePal(Object.assign({ outline: '#140a12' }, pal)) });
}
for (const s of SUITS) if (!s.power) s.power = STORY_SUIT_POWERS[s.id] || 'furia';

// ---- Retos (bronce, plata, oro) ----
const CHALLENGES = [
  { id: 'combo', name: 'Maestro del combo', desc: 'Consigue un combo de golpes', stat: 'maxCombo', goals: [10, 25, 50], unit: 'x' },
  { id: 'kos', name: 'Amigo y vecino', desc: 'Derrota enemigos', stat: 'kos', goals: [50, 200, 500] },
  { id: 'crimes', name: 'Guardián de la ciudad', desc: 'Detén crímenes', stat: 'crimes', goals: [5, 20, 50] },
  { id: 'swing', name: 'Balanceador', desc: 'Recorre metros balanceándote', stat: 'swingDist', goals: [1000, 5000, 20000], unit: ' m' },
  { id: 'dodge', name: 'Sentido arácnido', desc: 'Esquivas perfectas', stat: 'perfect', goals: [10, 50, 150] },
  { id: 'gadget', name: 'Ingeniero', desc: 'Golpea enemigos con artilugios', stat: 'gadgetHits', goals: [10, 50, 150] },
  { id: 'boss', name: 'Cazavillanos', desc: 'Derrota jefes', stat: 'bosses', goals: [3, 9, 20] },
  { id: 'air', name: 'Siempre en el aire', desc: 'Segundos seguidos sin tocar el suelo', stat: 'airMax', goals: [6, 12, 25], unit: ' s' },
  { id: 'frag', name: 'Coleccionista', desc: 'Encuentra fragmentos del multiverso', stat: 'tokens', goals: [10, 20, 30] },
  { id: 'power', name: 'Poderoso', desc: 'Usa poderes de traje', stat: 'powers', goals: [5, 20, 60] },
];
const MEDALS = ['BRONCE', 'PLATA', 'ORO'];
const MEDAL_COL = ['#d08850', '#c8d0e0', '#ffd040'];

const Progress = {
  save() { return Game.save; },
  ensure() {
    const s = Game.save;
    if (typeof s.xp !== 'number') s.xp = 0;
    if (typeof s.level !== 'number') s.level = 1;
    if (typeof s.skillPts !== 'number') s.skillPts = 0;
    if (!Array.isArray(s.skills)) s.skills = [];
    if (!s.gadgetLvl || typeof s.gadgetLvl !== 'object') s.gadgetLvl = {};
    if (!GADGETS.find((g) => g.id === s.gadget)) s.gadget = 'impacto';
    if (!s.records || typeof s.records !== 'object') s.records = {};
    if (!s.medals || typeof s.medals !== 'object') s.medals = {};
    if (!s.bestTimes || typeof s.bestTimes !== 'object') s.bestTimes = {};
    if (s.power && !SUIT_POWERS[s.power]) s.power = null;
    // partidas antiguas: experiencia según lo ya conseguido
    if (!s.xpInit) {
      s.xpInit = true;
      const past = (s.stage || 0) * 300 + (s.tokens ? s.tokens.length * 40 : 0) + ((s.stats && s.stats.kos) || 0) * 10 + ((s.stats && s.stats.crimes) || 0) * 60;
      if (past > 0) this.addXP(past, null, true);
    }
  },
  has(id) { return Game.save.skills && Game.save.skills.includes(id); },
  xpNeed(lvl) { return 120 + lvl * 70; },
  addXP(n, world, silent) {
    const s = Game.save;
    s.xp += Math.round(n);
    while (s.level < 40 && s.xp >= this.xpNeed(s.level)) {
      s.xp -= this.xpNeed(s.level); s.level++; s.skillPts++;
      if (!silent && world) {
        const p = world.player;
        world.float('¡NIVEL ' + s.level + '! +1 PUNTO DE HABILIDAD', p.cx, p.y - 24, '#ffd040');
        Audio2.sfx('win');
        const g = GADGETS.find((x) => x.lvl === s.level);
        if (g) world.showTip('Nuevo artilugio: ' + g.name + '. Equípalo en el menú (ARTILUGIOS).', 6);
      }
    }
  },
  canLearn(sk) {
    const s = Game.save;
    return !this.has(sk.id) && s.skillPts > 0 && (!sk.req || this.has(sk.req));
  },
  learn(sk) {
    if (!this.canLearn(sk)) return false;
    Game.save.skillPts--; Game.save.skills.push(sk.id); Game.saveGame();
    return true;
  },
  gadgetUnlocked(g) { return (Game.save.level || 1) >= g.lvl; },
  gadgetLevel(g) { return Game.save.gadgetLvl[g.id] || 1; },
  gadgetMax(g) { return g.charges + (this.gadgetLevel(g) - 1) + (this.has('i_ingenio') ? 1 : 0); },
  gadgetCd(g) { return g.cd * (this.has('i_frio') ? 0.65 : 1) * (1 - (this.gadgetLevel(g) - 1) * 0.1); },
  suitOwned(s) { return Game.save.suits.includes(s.id); },
  // registra un récord (suma o máximo)
  rec(key, v, mode = 'add') {
    const r = Game.save.records;
    if (mode === 'max') { if (!(r[key] >= v)) r[key] = v; }
    else r[key] = (r[key] || 0) + v;
  },
  stat(key) {
    const s = Game.save;
    if (key === 'kos') return (s.stats && s.stats.kos) || 0;
    if (key === 'crimes') return (s.stats && s.stats.crimes) || 0;
    if (key === 'tokens') return (s.tokens || []).length;
    const v = s.records[key] || 0;
    return key === 'swingDist' ? Math.floor(v) : v;
  },
  medal(ch) { return Game.save.medals[ch.id] || 0; },
  // comprueba los retos y entrega medallas (XP + tecnología)
  checkChallenges(world) {
    for (const ch of CHALLENGES) {
      const have = this.medal(ch), v = this.stat(ch.stat);
      if (have < 3 && v >= ch.goals[have]) {
        Game.save.medals[ch.id] = have + 1;
        Game.save.tech += 10 * (have + 1);
        if (world) {
          const p = world.player;
          world.float('RETO: ' + ch.name.toUpperCase() + ' · ' + MEDALS[have], p.cx, p.y - 34, MEDAL_COL[have]);
          Audio2.sfx('coin');
        }
        this.addXP(100 * (have + 1), world);
      }
    }
  },
  bestTime(i, secs) {
    const b = Game.save.bestTimes;
    if (!(b[i] <= secs)) { b[i] = Math.round(secs); return true; }
    return false;
  },
};
