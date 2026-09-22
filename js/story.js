'use strict';
// ---------------------------------------------------------------------------
// Historia original: "Spider-Man: Ecos de Nueva York"
// Ambientada seis meses después de Spider-Man: No Way Home (MCU)
// ---------------------------------------------------------------------------
const WHO = {
  narr: { name: '', portrait: null },
  peter: { name: 'Peter Parker', portrait: 'peter' },
  spidey: { name: 'Spider-Man', portrait: 'spidey' },
  radio: { name: 'Radio policial', portrait: 'radio' },
  cleary: { name: 'Agente Cleary', portrait: 'cleary' },
  jjj: { name: 'J. Jonah Jameson', portrait: 'jjj' },
  shocker: { name: 'Shocker', portrait: 'shocker' },
  mason: { name: 'El Hojalatero', portrait: 'mason' },
  gargan: { name: 'Escorpión', portrait: 'gargan' },
  mysterio: { name: '¿Mysterio?', portrait: 'mysterio' },
  voice: { name: 'Voz del fragmento', portrait: 'mj' },
  civil: { name: 'Ciudadano', portrait: 'civil' },
};

const MISSIONS = [
  { name: 'Tu amigable vecino', place: 'Queens' },
  { name: 'Control de Daños', place: 'Almacén del Muelle 7' },
  { name: 'Alas de acero', place: 'Puente de Brooklyn' },
  { name: 'Nada es lo que parece', place: 'Times Square' },
  { name: 'El Escorpión', place: 'Isla de la Libertad' },
];
const MISSION_SUIT = ['casero', 'sigilo', 'stark', 'ffh', 'iron'];
const MARKER_X = [null, 2560, 3060, 5250, 7020];
const MARKER_PLACE = [null, 'Muelle 7', 'Puente de Queensboro', 'Times Square', 'Battery Park'];
const CITY_SKY = ['day', 'day', 'sunset', 'dusk', 'night', 'day'];

const STORY = {
  intro: [
    ['narr', 'Nueva York. Seis meses después del hechizo que borró a Peter Parker de la memoria del mundo.'],
    ['narr', 'Nadie recuerda quién es. Ni Ned. Ni MJ. Ni Happy.'],
    ['narr', 'Pero la ciudad todavía tiene a alguien que la cuida.'],
    ['peter', 'Traje nuevo, cosido a mano. Radio de la policía encendida. Un apartamento diminuto... pero es mío.'],
    ['radio', 'A todas las unidades: asalto a un camión blindado en Queens. El sospechoso lleva guanteletes que disparan ondas de choque.'],
    ['peter', '¿Ondas de choque? No puede ser... ¿Herman Schultz? Se suponía que seguía en la cárcel.'],
    ['peter', 'Bueno. Hora de ser tu amigable vecino.'],
  ],
  briefing: [
    null,
    [
      ['cleary', 'Agente Cleary, Control de Daños. No me mires así, trepamuros. Necesito ayuda... y odio decirlo.'],
      ['spidey', '¿Qué ha pasado?'],
      ['cleary', 'Alguien vació nuestra bóveda: restos del traje de Toomes, drones de Beck, armas chitauri...'],
      ['cleary', '...y un fragmento cristalino que recogimos en la Estatua de la Libertad después del incidente de las "visitas". Brilla. Y no debería existir.'],
      ['spidey', '(Un fragmento del hechizo de Strange... Si alguien lo usa, podría volver a abrir el multiverso.)'],
      ['cleary', 'Los ladrones siguen dentro. Y no rompas nada... más.'],
    ],
    [
      ['radio', 'Reportes de un hombre con alas mecánicas sobre el puente. Está atacando vehículos.'],
      ['spidey', '¿Alas mecánicas? Ay, no. Por favor, que no sea el señor Toomes.'],
    ],
    [
      ['cleary', 'Los drones de Beck se han activado en Times Square. Las pantallas muestran... algo raro.'],
      ['spidey', '¿Raro cómo?'],
      ['cleary', 'Como si Mysterio hubiera vuelto.'],
      ['spidey', 'Beck está muerto. Esto es solo un truco. ...¿Verdad?'],
    ],
    [
      ['narr', 'El cielo sobre la bahía se agrieta. Una luz verde se derrama desde la antorcha de la estatua.'],
      ['spidey', 'Otra vez aquí... La última vez que estuve en esta estatua lo perdí todo.'],
      ['spidey', 'Esta vez no voy a perder la ciudad.'],
    ],
  ],
  bossIntro: [
    [
      ['shocker', '¡Mira quién vino! El bicho de las telarañas.'],
      ['spidey', 'Herman Schultz. ¿Guanteletes nuevos? Te quedan geniales. Muy de los 2000.'],
      ['shocker', 'Alguien me sacó de la jaula y me dio juguetes mejores. ¡Pruébalos!'],
    ],
    [
      ['mason', '(Por los altavoces) ¡Vaya, vaya! El chico araña. Te presento a mi nueva creación.'],
      ['spidey', '¿Phineas Mason? ¿El Hojalatero? ¡Tú trabajabas para Toomes!'],
      ['mason', 'Trabajaba. Ahora trabajo para quien pague mejor. ¡Exo-Matón, aplástalo!'],
    ],
    [
      ['mason', '¡Adrian nunca me dejó volarlo! ¡El Buitre Mark II es MÍO!'],
      ['spidey', 'Señor Mason, esas alas tienen más años que yo. ¡Bájese de ahí!'],
      ['mason', '¡Oblígame, chico!'],
    ],
    [
      ['mysterio', '¡Spider-Man! ¿Creíste que podías librarte de mí? ¡Nadie se olvida de Mysterio!'],
      ['spidey', 'Qué ironía. Todos se acuerdan de ti y de mí no se acuerda nadie.'],
      ['mysterio', 'La gente necesita creer. ¡Y hoy creerán que caíste!'],
    ],
    [
      ['gargan', '¡Por fin! Llevo años soñando con este momento, Spider-Man.'],
      ['spidey', '¿Mac Gargan? Bonito disfraz. ¿Escorpión? ¿En serio?'],
      ['gargan', 'Toomes nunca me dijo quién eras. Da igual. Con este fragmento abriré el multiverso y traeré a cada enemigo que hayas tenido.'],
      ['spidey', 'Si abres esa puerta, no sabes lo que vendrá.'],
      ['gargan', '¡Exacto! ¡Esa es la gracia!'],
    ],
  ],
  bossOutro: [
    [
      ['shocker', 'Ugh... Da igual, bicho... Gargan ya tiene lo que buscaba...'],
      ['spidey', '¿Gargan? ¿Mac Gargan? ¿El tipo del ferry?'],
      ['radio', '...alarma silenciosa en el almacén de Control de Daños, Muelle 7. Repito, Muelle 7...'],
      ['spidey', 'Genial. Lo que me faltaba.'],
    ],
    [
      ['mason', 'Impresionante... pero ya tenemos lo que vinimos a buscar. ¡Nos vemos en el puente, chico!'],
      ['cleary', 'Se llevaron el fragmento. Van hacia el puente.'],
      ['spidey', 'Entonces voy al puente.'],
    ],
    [
      ['mason', 'Mis alas... Está bien, está bien. Me rindo.'],
      ['spidey', '¿Qué quiere Gargan con el fragmento?'],
      ['mason', 'Abrir la puerta. Traer desde otros mundos a todos los que te odian. Dice que tú tienes la culpa de... todo.'],
      ['mason', 'Pero el fragmento necesita energía. Por eso se llevó los drones de Beck a Times Square.'],
    ],
    [
      ['spidey', 'Solo era un eco. Drones, hologramas... y mucho humo verde.'],
      ['cleary', 'Buen trabajo. Rastreamos la señal de control: viene de la Isla de la Libertad.'],
      ['spidey', 'Donde todo empezó.'],
    ],
    [
      ['gargan', 'No... el fragmento... es mío...'],
      ['narr', 'El fragmento rueda hasta los pies de Peter. En sus destellos aparecen rostros conocidos: Ned. MJ. May.'],
      ['voice', 'Úsame. Abre la puerta. Ellos volverán a recordarte.'],
      ['peter', '...Podría recuperarlos. Podría decirles quién soy.'],
      ['peter', 'Pero prometí mantenerlos a salvo. Y eso significa dejarles vivir sus vidas.'],
      ['narr', 'Peter aprieta el fragmento hasta convertirlo en polvo de luz. La grieta del cielo se cierra.'],
      ['cleary', 'Buen trabajo, Spider-Man. Por cierto... ¿quién eres en realidad?'],
      ['spidey', 'Solo tu amigable vecino.'],
    ],
  ],
  afterCity: [
    [
      ['jjj', '¡Aquí J. Jonah Jameson, de TheDailyBugle.net! El trepamuros destrozó media calle de Queens persiguiendo a un "supervillano". ¿Coincidencia? ¡No lo creo!'],
      ['peter', 'Siempre es un placer, JJ.'],
    ],
    [
      ['jjj', '¡Última hora! Robo en un almacén federal, ¿y adivinen quién estaba allí? ¡Spider-Man! ¡Yo solo digo lo que veo!'],
    ],
    [
      ['jjj', '¿Un buitre gigante? ¿Un tipo con telarañas? ¡Esta ciudad es un zoológico y Spider-Man es el cuidador!'],
    ],
    [
      ['jjj', '¡Luces verdes en el cielo sobre la Estatua de la Libertad! ¡Otra vez! ¡Juro que si Spider-Man está detrás de esto...!'],
    ],
    [
      ['jjj', '¡Spider-Man salvó la ciudad! ...Eso dicen. ¡Yo sigo sin fiarme de él! Aquí J. Jonah Jameson.'],
      ['peter', 'Algunas cosas nunca cambian. Y está bien.'],
    ],
  ],
  jjjQuips: [
    '¿Por qué se tapa la cara? ¡Porque tiene algo que esconder!',
    '¡Spider-Man! ¡Amenaza! ¡Peligro! ¡Suscríbanse a TheDailyBugle.net!',
    'Un lector escribe: "Spider-Man salvó a mi gato". ¡Seguro que él lo subió al árbol!',
    'Mis fuentes dicen que el trepamuros come pizza sin pagar. ¡No me consta, pero lo sospecho!',
    '¡Otro día, otro destrozo arácnido en esta ciudad!',
    '¿Telarañas en mi coche? ¡Esto es personal, Spider-Man!',
    'Hoy en el programa: ¿son las telarañas biodegradables? ¡Lo dudo mucho!',
  ],
  thanks: ['¡Gracias, Spider-Man!', '¡Eres el mejor, Spidey!', '¡Te debo una!', '¡Viva Spider-Man!', '¡Mi héroe!', '¡Sabía que vendrías!'],
  tips: {
    tip_move: 'Muévete con {MOVE}. Salta con {JUMP} y pulsa otra vez en el aire para un doble salto.',
    tip_wall: 'Salta contra un edificio para pegarte a la pared. Trepa con {UP}/{DOWN} y salta con {JUMP}.',
    tip_swing: '¡Balanceo! En el aire, mantén {WEB} para lanzar una telaraña. Suelta para salir disparado.',
    tip_swing2: 'Mientras te balanceas: {UP}/{DOWN} acorta o alarga la telaraña y {ATTACK} lanza una patada.',
    tip_fight: '¡A pelear! {ATTACK} encadena golpes. {UP} + {ATTACK} lanza al aire. {DOWN} + {ATTACK} en el aire: patada en picado.',
    tip_sense: '¿Ves las líneas sobre tu cabeza? Es el hormigueo arácnido: pulsa {DODGE} para esquivar a tiempo.',
    tip_web: '{SHOOT} dispara una bola de red que inmoviliza enemigos. Los enemigos atrapados reciben más daño.',
    tip_brute: 'Los matones grandes llevan blindaje: atrápalos con red ({SHOOT}) para romper su guardia.',
    tip_special: 'Golpear llena la barra de foco. {SPECIAL}: ataque giratorio. Mantén {SPECIAL} en el suelo para curarte.',
    tip_indoor: 'Dentro del almacén, la telaraña se engancha al techo.',
    tip_water: '¡Cuidado con los huecos del puente! Si caes al agua, perderás vida.',
    tip_illusion: 'Los drones de Beck crean ilusiones. El dron real se esconde entre copias.',
    tip_final: 'La batalla final. Usa todo lo que has aprendido.',
    tip_city: 'Ciudad libre: detén crímenes (!), busca 20 piezas de tecnología Stark y ve al faro azul para seguir la historia. {PAUSE}: menú, taller y trajes.',
    tip_boss: 'Consejo: atrapa a los jefes con {SHOOT} varias veces para aturdirlos.',
  },
  credits: [
    ['SPIDER-MAN', 'ECOS DE NUEVA YORK'],
    ['UN JUEGO NO OFICIAL HECHO POR FANS', ''],
    ['DISEÑO, PROGRAMACIÓN,', 'GRÁFICOS Y MÚSICA'],
    ['Creado con Claude Code', 'para un fan de Spider-Man'],
    ['HISTORIA ORIGINAL', 'inspirada en el Universo Cinematográfico de Marvel'],
    ['PERSONAJES', 'Spider-Man, Shocker, el Hojalatero, el Buitre, Mysterio, Escorpión, Agente Cleary y J. Jonah Jameson son propiedad de Marvel.'],
    ['SIN FINES DE LUCRO', 'Hecho con cariño por fans.'],
    ['GRACIAS POR JUGAR', 'Un gran poder conlleva una gran responsabilidad.'],
  ],
};

function fillTip(text) {
  return text.replace(/\{(\w+)\}/g, (m, a) => {
    if (a === 'MOVE') {
      if (Input.lastDevice === 'pad') return 'el stick o la cruceta';
      if (Input.lastDevice === 'touch') return 'el joystick';
      return 'las flechas o WASD';
    }
    return '[' + Input.label(a) + ']';
  });
}
