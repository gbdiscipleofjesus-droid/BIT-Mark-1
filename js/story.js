'use strict';
// ---------------------------------------------------------------------------
// Historia original: "Spider-Man: Rompecánones"
// Peter Parker (Tierra-616) tras Brand New Day y antes de enfrentarse a Doom.
// ---------------------------------------------------------------------------
const WHO = {
  narr: { name: '', portrait: null },
  peter: { name: 'Peter Parker', portrait: 'peter' },
  spidey: { name: 'Spider-Man', portrait: 'spidey' },
  radio: { name: 'Radio', portrait: 'radio' },
  static: { name: '¿...?', portrait: 'radio' },
  jjj: { name: 'J. Jonah Jameson', portrait: 'jjj' },
  desconocido: { name: 'El Desconocido', portrait: 'desconocido' },
  cero: { name: 'Peter Cero', portrait: 'cero' },
  tobey: { name: 'Peter (Tierra-96283)', portrait: 'tobey' },
  andrew: { name: 'Peter (Tierra-120703)', portrait: 'andrew' },
  miles: { name: 'Miles Morales', portrait: 'miles' },
  gwen: { name: 'Gwen Stacy (Tierra-65)', portrait: 'gwen' },
  gwenS: { name: 'Gwen Stacy', portrait: 'gwens' },
  miguel: { name: 'Miguel O\'Hara', portrait: 'miguel' },
  harry: { name: 'Harry Osborn', portrait: 'harry' },
  venom: { name: 'Venom', portrait: 'venom' },
  sandman: { name: 'Hombre de Arena', portrait: 'sandman' },
  rino: { name: 'Rino', portrait: 'rino' },
  electro: { name: 'Electro', portrait: 'electro' },
  mancha: { name: 'La Mancha', portrait: 'mancha' },
  richard: { name: 'Richard Parker', portrait: 'richard' },
  ben: { name: 'Ben Parker', portrait: 'ben' },
  davis: { name: 'Capitán Davis', portrait: 'davis' },
  doom: { name: '???', portrait: 'doom' },
  civil: { name: 'Ciudadano', portrait: 'civil' },
};

// ---------------- Universos (cada uno es una ciudad abierta) ----------------
const UNIVERSES = {
  '616': { id: '616', name: 'Tierra-616', city: 'Nueva York', sky: 'night', styles: 'manhattan', pals: 'thugs', tint: null, landmark: 'avengers',
    crimes: ['robo', 'caida', 'persecucion', 'drones'], signs: ['MIDTOWN', 'QUEENS', 'DAILY BUGLE'], music: 'city' },
  tobey: { id: 'tobey', name: 'Tierra-96283', city: 'Nueva York dorada', sky: 'golden', styles: 'queens', pals: 'thugs', tint: 'rgba(255,190,110,0.10)', landmark: 'empire',
    crimes: ['robo', 'caida', 'persecucion'], signs: ['PIZZA DE JOE', 'DAILY BUGLE', 'OSCORP'], music: 'city' },
  andrew: { id: 'andrew', name: 'Tierra-120703', city: 'Nueva York de cristal', sky: 'teal', styles: 'manhattan', pals: 'oscorp', tint: 'rgba(60,170,200,0.08)', landmark: 'oscorp',
    crimes: ['robo', 'caida', 'persecucion', 'drones'], signs: ['OSCORP', 'MIDTOWN SCIENCE', 'TORRE DEL RELOJ'], music: 'city' },
  miles: { id: 'miles', name: 'Tierra-1610', city: 'Brooklyn animado', sky: 'verse', styles: 'verse', pals: 'kingpin', tint: null, comic: true, landmark: 'alchemax',
    crimes: ['robo', 'persecucion', 'caida', 'drones'], signs: ['BROOKLYN', 'VISIONS', 'ALCHEMAX'], music: 'verse' },
  ruina: { id: 'ruina', name: 'Universo ¿Y si...?', city: 'Nueva York en ruinas', sky: 'ruin', styles: 'ruin', pals: 'zombie', tint: 'rgba(160,30,20,0.08)', landmark: 'ruins',
    crimes: ['zombies', 'ultron', 'caida'], signs: ['SIN CANON', 'VENGADORES', '¿Y SI...?'], music: 'ruin' },
};
const UNIVERSE_ORDER = ['616', 'tobey', 'andrew', 'miles', 'ruina'];

// ---------------- Capítulos ----------------
// stage = capítulo actual. El 0 es el prólogo; 1-4 tienen ciudad libre y misión.
const MISSIONS = [
  { name: 'La grieta', place: 'Tierra-616', universe: '616', markerX: null },
  { name: 'Un gran poder', place: 'Tierra-96283', universe: 'tobey', markerX: 3100 },
  { name: 'Tiempo roto', place: 'Tierra-120703', universe: 'andrew', markerX: 5200 },
  { name: 'Salto de fe', place: 'Tierra-1610', universe: 'miles', markerX: 3100 },
  { name: 'Nada es canon', place: 'Universo ¿Y si...?', universe: 'ruina', markerX: 6900 },
];
const MISSION_SUIT = ['sigilo', 'raimi', 'tasm', 'verse', 'cero'];

// ---------------- Eventos canónicos ----------------
const CANONS = {
  harry: {
    title: 'HARRY OSBORN',
    text: 'Harry va a interponerse entre Venom y Peter. En este universo, ese es su último acto.',
    save: 'SALVAR A HARRY (ROMPER EL CANON)', keep: 'DEJAR QUE OCURRA',
    flashes: ['crack', 'harry', 'doom', '2099', 'alone', 'ruin', 'spiders', 'harry'],
    saved: [
      ['narr', 'Peter se lanza antes que Harry. Una red. Un tirón. El planeador choca contra la pared vacía.'],
      ['harry', '¿Qué... qué ha pasado? Estoy vivo.'],
      ['tobey', 'Harry... Estás vivo.'],
      ['narr', 'Muy lejos, algo en el multiverso cruje, como un hueso que se rompe.'],
    ],
    kept: [
      ['harry', 'Peter... Eres mi mejor amigo.'],
      ['tobey', '...'],
      ['peter', 'Lo siento. Lo siento mucho.'],
      ['narr', 'El canon sigue en pie. Pero duele igual.'],
    ],
  },
  padres: {
    title: 'RICHARD Y MARY PARKER',
    text: 'Los padres de Peter viajan en este avión. En este universo, nunca llegan a su destino.',
    save: 'SALVARLOS (ROMPER EL CANON)', keep: 'DEJAR QUE OCURRA',
    flashes: ['plane', 'crack', 'doom', 'plane', '2099', 'spiders', 'alone', 'plane'],
    saved: [
      ['narr', 'Peter atraviesa la cabina, desarma al asesino y sujeta el avión con telarañas en mitad de la tormenta.'],
      ['richard', '¿Quién... quién eres?'],
      ['peter', 'Alguien que conoce a su hijo. Él los va a necesitar. Vuelvan a casa.'],
      ['narr', 'El avión aterriza. En algún lugar, un reloj se detiene un segundo.'],
    ],
    kept: [
      ['peter', 'No puedo... Si toco esto, todo se rompe. Lo siento.'],
      ['narr', 'El avión desaparece entre las nubes. Como siempre.'],
    ],
  },
  ben: {
    title: 'BEN PARKER',
    text: 'Ben Parker está a punto de cruzarse con un ladrón. En todos los universos, esta es la noche que crea a Spider-Man.',
    save: 'SALVAR AL TÍO BEN (ROMPER EL CANON)', keep: 'DEJAR QUE OCURRA',
    flashes: ['bentomb', 'crack', 'spiders', 'bentomb', 'doom', 'alone', '2099', 'bentomb'],
    saved: [
      ['narr', 'Una red atrapa la pistola. Otra atrapa al ladrón. El disparo nunca suena.'],
      ['ben', 'Gracias, muchacho. Oye... ¿te conozco?'],
      ['peter', 'No. Pero su sobrino tiene mucha suerte de tenerlo.'],
      ['ben', 'Dile que sea la persona que quiere ser. Eso es lo que importa.'],
    ],
    kept: [
      ['peter', 'Todos tenemos un tío Ben... y todos lo perdemos.'],
      ['narr', 'Un disparo en la noche. Un chico corre hacia la acera. Y nace un héroe.'],
    ],
  },
  gwen: {
    title: 'GWEN STACY',
    text: 'Gwen cae desde la torre del reloj. Andrew nunca llega a tiempo. Nunca.',
    save: 'SALVAR A GWEN (ROMPER EL CANON)', keep: 'DEJAR QUE OCURRA',
    flashes: ['clock', 'gwenfall', 'crack', 'clock', 'doom', 'gwenfall', '2099', 'gwenfall'],
    saved: [
      ['narr', 'Peter lanza dos telarañas. Andrew lanza la tercera. Esta vez, Gwen no toca el suelo.'],
      ['gwenS', '¿Peter? ¿...Dos Peters?'],
      ['andrew', 'La salvaste... La salvamos.'],
      ['andrew', 'Llevo tanto tiempo soñando con esto que no sé qué hacer ahora.'],
      ['peter', 'Empieza por decirle lo que sientes. Créeme.'],
    ],
    kept: [
      ['andrew', 'Otra vez no...'],
      ['peter', 'Lo siento, Peter. Lo siento mucho.'],
      ['andrew', 'No. Tú no tenías que cargar con esto. Es mío. Siempre ha sido mío.'],
    ],
  },
  davis: {
    title: 'CAPITÁN JEFFERSON DAVIS',
    text: 'El padre de Miles protege a los civiles bajo un edificio que se derrumba. Es su evento canónico.',
    save: 'SALVAR AL PADRE DE MILES (ROMPER EL CANON)', keep: 'DEJAR QUE OCURRA',
    flashes: ['2099', 'crack', 'spiders', 'doom', '2099', 'ruin', 'alone', 'spiders'],
    saved: [
      ['narr', 'Peter y Miles sostienen el techo con cien telarañas. El capitán Davis sale caminando.'],
      ['davis', '¿Estoy... vivo? ¿Miles? ¿Qué haces tú aquí?'],
      ['miles', '¡PAPÁ! Es... una larga historia.'],
      ['miguel', 'Acabas de condenar este universo, Parker. Espero que valga la pena.'],
    ],
    kept: [
      ['miles', 'No... Papá...'],
      ['gwen', 'Lo siento, Miles.'],
      ['peter', 'Yo... también lo siento. No sabes cuánto.'],
    ],
  },
};
const CANON_ORDER = ['harry', 'padres', 'ben', 'gwen', 'davis'];

const STORY = {
  intro: [
    ['narr', 'Tierra-616. Después de todo lo que pasó... Peter Parker sigue en pie.'],
    ['narr', 'Un nuevo día. Una nueva vida. Pero algo se acerca: un nombre que se susurra entre los universos. Doom.'],
    ['peter', 'Otra noche tranquila. Patrullar, cenar algo, dormir cuatro horas. El plan perfecto.'],
    ['narr', 'Entonces, el cielo se rompe.'],
    ['peter', '¿Eso es una grieta? ¿Otra vez? No, no, no. El doctor Strange me va a matar.'],
    ['radio', '¡Alerta en Control de Daños! Un intruso con traje de araña se lleva un dispositivo de contención...'],
    ['peter', '¿Traje de araña? Yo estoy aquí... Genial. Un impostor.'],
  ],
  // Llegada a cada universo (se muestra al entrar por primera vez)
  arrival: {
    tobey: [
      ['narr', 'Tierra-96283. Una Nueva York cálida y dorada, que huele a pizza.'],
      ['peter', 'Esto... me suena. ¿El Daily Bugle? ¿Aquí todavía imprimen periódicos?'],
      ['tobey', '¿Peter? Vaya. Otra vez el multiverso.'],
      ['peter', '¡Peter 2! Digo... ¡hola! Busco a un Spider-Man con el traje quemado.'],
      ['tobey', 'Lo vi saltar desde Oscorp. Pero ahora tenemos otro problema: algo negro y pegajoso anda suelto.'],
    ],
    andrew: [
      ['narr', 'Tierra-120703. Una ciudad azul y fría. Aquí los relojes no marcan la misma hora.'],
      ['andrew', '¿Otro Peter? No sé si es una buena señal o una muy mala.'],
      ['peter', '¡Peter 3! ¿Cómo estás?'],
      ['andrew', '¿Sinceramente? Estoy bien. Estoy bien. ...Vale, no estoy bien. El tiempo se está rompiendo.'],
      ['andrew', 'Veo momentos de mi vida que se repiten. Mis padres. Mi tío. Ella.'],
    ],
    miles: [
      ['narr', 'Tierra-1610. El aire es distinto: puntos, colores, líneas de cómic.'],
      ['miles', '¡Otro Spider-Man! ¿De dónde eres tú?'],
      ['peter', 'Tierra-616. Allí tenemos... menos colores.'],
      ['gwen', 'Cuidado, Peter. La Sociedad Araña sabe lo que estás haciendo. Miguel te está buscando.'],
      ['peter', '¿Miguel?'],
      ['gwen', 'Spider-Man 2099. Cree que los cánones son sagrados. Y no se equivoca del todo.'],
    ],
    ruina: [
      ['narr', 'Universo ¿Y si...? Una Nueva York en ruinas flota sobre la nada.'],
      ['narr', 'Aquí no quedan cánones. Solo restos.'],
      ['peter', '¿Hola? ...¿Hay alguien?'],
      ['static', '...si alguien oye esto... no sigas al hombre del traje quemado... él fue quien...'],
      ['peter', '¿Quien qué? ¡¿Quien qué?! ...Genial. Hasta las radios del fin del mundo me dejan con la intriga.'],
    ],
    '616': [
      ['narr', 'Tierra-616. Casa.'],
      ['peter', 'Todo sigue igual. Y a la vez nada es igual.'],
    ],
  },
  briefing: [
    null,
    [
      ['tobey', 'Venom está en el centro. Y Flint... el Hombre de Arena, también.'],
      ['peter', '¿Los dos juntos? Qué suerte la mía.'],
      ['tobey', 'La suerte Parker. Existe en todos los universos.'],
    ],
    [
      ['andrew', 'El Desconocido está en Oscorp. Dice que puede devolverme todo lo que perdí.'],
      ['peter', '¿Y tú le crees?'],
      ['andrew', 'Quiero creerle. Ese es el problema.'],
    ],
    [
      ['miles', 'La Mancha está abriendo agujeros por todo Brooklyn. Y tu Desconocido le da órdenes.'],
      ['peter', 'Pues vamos. ¿Tú y yo?'],
      ['miles', 'Sí. Pero voy a hacerlo a mi manera.'],
    ],
    [
      ['peter', 'La señal del Desconocido viene de la vieja Torre de los Vengadores.'],
      ['peter', 'Si esto es lo que pasa cuando rompes todo... tengo que detenerlo.'],
      ['peter', 'Un gran poder... Sí, sí. Ya lo sé.'],
    ],
  ],
  bossIntro: {
    desconocido0: [
      ['desconocido', '...'],
      ['spidey', '¡Eh! Ese traje es horrible. Y lo dice alguien que se cosió el suyo.'],
      ['desconocido', 'Todavía no lo entiendes. Pero lo entenderás.'],
      ['desconocido', 'Cada universo tiene su dolor. Su canon. Voy a romperlos todos.'],
    ],
    sandman: [
      ['sandman', 'No quiero hacer esto, chico. Pero no tengo elección.'],
      ['spidey', 'Siempre hay elección. Te lo dice alguien que siempre elige fatal.'],
    ],
    venom: [
      ['venom', 'Dos arañas... Nos encantan los aperitivos.'],
      ['tobey', '¡Cuidado! Se alimenta de rabia.'],
      ['spidey', 'Entonces voy a estar muy tranquilo. Súper tranquilo. Zen.'],
    ],
    rino: [
      ['rino', '¡Soy el RINO! ¡Y voy a aplastarte, bicho!'],
      ['spidey', 'Genial. Un tanque que habla.'],
    ],
    electro: [
      ['electro', '¡Todos me olvidan! ¡Hoy la ciudad entera sabrá mi nombre!'],
      ['spidey', 'Créeme, amigo: sé lo que es que nadie te recuerde. No hace falta apagar la ciudad.'],
    ],
    mancha: [
      ['mancha', '¿Me recuerdas? ...No, claro. Nadie me recuerda. ¡Hasta hoy!'],
      ['spidey', 'Oye, te entiendo mejor de lo que crees.'],
    ],
    miguel: [
      ['miguel', 'Anomalía detectada. Parker, llevas {N} cánones rotos.'],
      ['spidey', 'Solo intentaba salvar a gente.'],
      ['miguel', 'Todos lo intentamos. Y así es como caen los universos.'],
      ['miles', '¡Miguel, déjalo en paz!'],
    ],
    desconocido4: [
      ['desconocido', 'Bienvenido a mi casa, Peter.'],
      ['spidey', '¿Tu casa? Aquí no hay nada.'],
      ['desconocido', 'Por eso. Aquí lo salvé todo. A todos. Y el universo no pudo soportarlo.'],
      ['desconocido', 'Rompiste {N} cánones para llegar hasta aquí. Ya sabes lo que se siente.'],
      ['spidey', '¿Quién eres?'],
      ['desconocido', 'Pelea. Y lo verás.'],
    ],
  },
  bossOutro: {
    desconocido0: [
      ['desconocido', 'Suficiente. Si quieres respuestas, sígueme, Parker.'],
      ['narr', 'El Desconocido salta a la grieta. Peter duda un segundo.'],
      ['peter', 'Señor Stark... no me siento bien con esto.'],
      ['peter', 'Allá voy.'],
    ],
    sandman: [
      ['sandman', 'Mi hija... Tengo que volver con ella.'],
      ['spidey', 'Pues vuelve. Hoy nadie tiene que ser el malo.'],
    ],
    venom: [
      ['venom', 'Nosotros... volveremos...'],
      ['narr', 'Entre el humo, alguien vuela hacia Venom en un planeador...'],
    ],
    rino: [
      ['rino', 'Ugh... mi armadura...'],
      ['andrew', 'Buen trabajo. Yo tardé tres películas en ganarle.'],
      ['peter', '¿Qué?'],
      ['andrew', 'Nada, nada.'],
    ],
    electro: [
      ['electro', 'Tú... me has visto...'],
      ['spidey', 'Te veo, Max. Descansa.'],
      ['narr', 'Las luces vuelven. Y en lo alto de la torre del reloj, alguien grita un nombre.'],
      ['andrew', '¡GWEN!'],
    ],
    mancha: [
      ['mancha', 'Los agujeros... se cierran... ¡Esto no ha terminado!'],
      ['gwen', 'Peter, sal de ahí. Miguel viene a por ti.'],
    ],
    miguel: [
      ['miguel', 'Eres terco... como todos nosotros.'],
      ['gwen', '¡Peter! El edificio... ¡El padre de Miles está dentro!'],
    ],
    desconocido4: [
      ['narr', 'La máscara quemada cae al suelo.'],
      ['cero', '¿Lo ves? Soy tú. Sin la suerte. Sin nadie que me dijera que no.'],
      ['spidey', '...Peter.'],
      ['cero', 'Antes me llamaba así. Ahora soy Peter Cero. El primero que lo rompió todo.'],
      ['cero', 'Salvé a mis padres, al tío Ben, a Gwen, a Tony... a todos. Y mi universo se partió en mil pedazos.'],
      ['cero', 'Doom me prometió reconstruirlo si abría suficientes grietas. Y tú me ayudaste, ¿sabes?'],
      ['peter', 'No lo sabía...'],
      ['cero', 'Nadie lo sabe. Hasta que es demasiado tarde.'],
      ['narr', 'Las grietas crecen. Hay que decidir.'],
    ],
  },
  finalChoice: {
    title: 'LA ÚLTIMA DECISIÓN',
    options: [
      { id: 'mano', label: 'TENDERLE LA MANO' },
      { id: 'deshacer', label: 'DESHACER LOS CÁNONES ROTOS' },
      { id: 'dentro', label: 'CERRAR LAS GRIETAS DESDE DENTRO' },
    ],
  },
  endings: {
    feliz: {
      title: 'FINAL: UN NUEVO DÍA',
      lines: [
        ['peter', 'No tienes que estar solo. Nunca tuviste que estarlo.'],
        ['cero', '...Hace años que nadie me decía eso.'],
        ['cero', 'Las grietas necesitan un ancla. Alguien que no pertenezca a ningún universo. Ese soy yo.'],
        ['peter', '¡No! Tiene que haber otra forma.'],
        ['cero', 'La hay: tú vuelves a casa. Y cuando luches contra Doom, recuerda que alguien te eligió.'],
        ['narr', 'Peter Cero se convierte en luz. Las grietas se cierran, una a una.'],
        '{SAVED}',
        ['narr', 'Tierra-616. Amanece.'],
        ['peter', 'Un gran poder conlleva una gran responsabilidad. Y a veces, también, un poco de suerte.'],
      ],
    },
    triste: {
      title: 'FINAL: EL PRECIO',
      lines: [
        '{WHY}',
        ['peter', '...Lo haré.'],
        '{UNDO}',
        ['cero', 'Ahora lo entiendes. Por eso yo no pude.'],
        ['narr', 'Peter Cero se desvanece con los restos de su mundo. El multiverso respira de nuevo.'],
        ['narr', 'Tierra-616. Peter vuelve a un apartamento vacío.'],
        ['peter', 'Salvé el multiverso. Entonces... ¿por qué me siento así?'],
      ],
    },
    neutral: {
      title: 'FINAL: ENTRE MUNDOS',
      lines: [
        ['peter', 'Si alguien tiene que quedarse entre los universos... que sea yo.'],
        ['cero', '¿Por qué harías eso?'],
        ['peter', 'Porque tú ya perdiste demasiado. Vuelve. Empieza de nuevo.'],
        ['narr', 'Peter entra en la grieta y la cierra desde dentro.'],
        ['narr', 'Tobey siente que olvidó algo importante. Andrew mira el cielo sin saber por qué. Miles dibuja una araña que no reconoce.'],
        ['narr', 'Todo lo que salvó sigue en pie. Pero nadie, en ningún universo, recuerda su nombre.'],
        ['peter', 'Otra vez nadie me recuerda. ...Pero esta vez lo elegí yo.'],
        ['narr', 'Entre los universos, un Spider-Man sigue balanceándose. Por si alguien lo necesita.'],
      ],
    },
  },
  postCredits: {
    feliz: [['doom', 'Qué conmovedor, Parker. Disfruta de tu nuevo día.'], ['doom', 'Nos veremos muy pronto.']],
    triste: [['doom', 'Ya has perdido, Parker. Solo que todavía no lo sabes.']],
    neutral: [['doom', 'Un héroe perdido entre mundos... Justo donde lo quería.']],
  },
  savedLines: {
    harry: ['En Tierra-96283, Harry Osborn despierta con una sonrisa.', 'En Tierra-96283, una tumba lleva el nombre de Harry Osborn.'],
    padres: ['En Tierra-120703, un avión aterriza a salvo bajo la lluvia.', 'En Tierra-120703, un niño sigue esperando a sus padres.'],
    ben: ['Un tío Ben enseña a su sobrino a cambiar una rueda.', 'Una acera guarda para siempre el recuerdo del tío Ben.'],
    gwen: ['Gwen Stacy da un discurso de graduación. Esta vez, termina.', 'Una torre del reloj sigue marcando la misma hora.'],
    davis: ['El capitán Davis llega tarde a cenar. Miles lo abraza igual.', 'Miles lleva la placa de su padre en el bolsillo.'],
  },
  undoLines: {
    harry: 'Harry vuelve a caer.',
    padres: 'El avión vuelve a perderse en la tormenta.',
    ben: 'El tío Ben vuelve a quedarse en la acera.',
    gwen: 'Gwen vuelve a caer.',
    davis: 'El capitán Davis vuelve a quedarse atrás.',
  },
  // Fragmentos coleccionables: frases con significado (easter eggs)
  fragments: [
    'Un gran poder conlleva una gran responsabilidad.',
    '¡Hora de la pizza! Nadie paga a tiempo, ni en este universo.',
    'Señor Stark... no me siento bien.',
    '¿Qué es un salto de fe? Confianza.',
    'Cualquiera puede llevar la máscara.',
    'Nadie puede salvar a todos. Pero todos pueden intentarlo.',
    'Cuando nadie te recuerda, la ciudad todavía lo hace.',
    'Estoy bien. De verdad. Estoy bien.',
    'El tío Ben decía: sé la persona que quieres ser.',
    'Ya no soy el único, ¿verdad?',
    'El canon no es el destino. Es una cicatriz.',
    'Las grietas suenan como un latido.',
    'Doom no conquista mundos. Espera a que se rompan solos.',
    'Un Spider-Man con el traje quemado miraba desde la azotea.',
    'La Sociedad Araña nunca olvida una anomalía.',
    'Si pudieras salvarlos a todos... ¿lo harías?',
    'Gwen: en todos los universos, siempre hay una caída.',
    'Miles: voy a hacer las cosas a mi manera.',
    'Tobey: a veces, para hacer lo correcto, hay que renunciar a lo que más quieres.',
    'Andrew: pensé que no podía salvar a nadie.',
    'Yo también llevé esa máscara. Yo también la amé.',
    'Tony habría sabido qué hacer. O habría hecho un chiste.',
    'MJ, Ned: algún día os lo contaré todo.',
    'La esperanza es lo que nos hace fuertes.',
    'Todos somos Spider-Man. Incluso tú.',
  ],
  radio: {
    '616': [
      ['jjj', '¡Grietas en el cielo! ¡Otra vez! ¡Y adivinen quién estaba debajo! ¡Spider-Man!'],
      ['jjj', '¿Por qué se tapa la cara? ¡Porque tiene algo que esconder! ¡Suscríbanse a TheDailyBugle.net!'],
      ['jjj', 'Mis fuentes dicen que el trepamuros come pizza sin pagar. ¡No me consta, pero lo sospecho!'],
    ],
    tobey: [
      ['jjj', '¡Quiero fotos de esa amenaza con telarañas! ¡En mi mesa! ¡Ahora!'],
      ['jjj', '¿Dos Spider-Man? ¡Genial! ¡Ahora tengo el doble de titulares!'],
      ['jjj', '¿Héroe? ¡Criminal! ¡Vándalo! ¡Amenaza! ...¿Me quedé sin palabras? ¡Nunca!'],
    ],
    andrew: [
      ['radio', 'A todas las unidades: apagones en Midtown. Evitad los cables sueltos.'],
      ['radio', 'Oscorp niega cualquier relación con los "fantasmas" de la torre del reloj.'],
      ['radio', 'Reportes de un hombre enorme con armadura de rinoceronte. No, no es una broma.'],
    ],
    miles: [
      ['radio', 'Agujeros negros en las paredes de Brooklyn. Si ve uno, no lo toque. Ni lo mire.'],
      ['radio', 'Nuevo mural de Spider-Man en Brooklyn. El artista dice que "lo vio en un sueño".'],
      ['radio', 'Aviso de Alchemax: los experimentos de esta semana son "totalmente seguros".'],
    ],
    ruina: [
      ['static', '...¿hay alguien...? ...los zombis han cruzado el puente...'],
      ['static', '...Ultron sigue buscando... no salgáis de noche...'],
      ['static', '...él salvó a todos... y luego no quedó nadie a quien salvar...'],
    ],
  },
  thanks: ['¡Gracias, Spider-Man!', '¡Eres el mejor, Spidey!', '¡Te debo una!', '¡Mi héroe!', '¡Sabía que vendrías!', '¡Otro Spider-Man!'],
  tips: {
    tip_move: 'Muévete con {MOVE}. En la calle, {UP} y {DOWN} te llevan al fondo o al frente. Salta con {JUMP} (dos veces = doble salto).',
    tip_wall: 'Salta contra un edificio para pegarte a la pared. Trepa con {UP}/{DOWN} y salta con {JUMP}.',
    tip_swing: '¡Balanceo! En el aire, mantén {WEB} para lanzar una telaraña. Suelta para salir disparado.',
    tip_swing2: 'Mientras te balanceas: {UP}/{DOWN} acorta o alarga la telaraña y {ATTACK} lanza una patada.',
    tip_fight: '¡A pelear! Ponte a la misma altura que el enemigo con {UP}/{DOWN}. {ATTACK} encadena golpes; el tercero lo lanza por los aires.',
    tip_sense: '¿Ves las líneas sobre tu cabeza? Es el hormigueo arácnido: esquiva con {DODGE} o apártate de su carril con {UP}/{DOWN}.',
    tip_web: '{SHOOT} dispara una bola de red que inmoviliza enemigos. Los enemigos atrapados reciben más daño.',
    tip_brute: 'Los enemigos grandes llevan blindaje: atrápalos con red ({SHOOT}) para romper su guardia.',
    tip_special: 'Golpear llena la barra de foco. {SPECIAL}: ataque giratorio. Mantén {SPECIAL} en el suelo para curarte.',
    tip_boss: 'Consejo: atrapa a los jefes con {SHOOT} varias veces para aturdirlos.',
    tip_city: 'Ciudad libre: detén crímenes (!), busca 5 fragmentos del multiverso y ve al faro azul para seguir. {PAUSE}: menú, taller, trajes y viajes.',
    tip_canon: 'Eventos canónicos: puedes salvar a quien el canon condena. Pero cada canon roto agrieta el multiverso.',
    tip_ruin: 'Aquí nada sigue las reglas. Cuidado con los zombis: son lentos, pero no se rinden.',
    tip_verse: 'En este universo todo es un cómic. ¡Hasta tus golpes suenan!',
  },
  credits: [
    ['SPIDER-MAN', 'ROMPECÁNONES'],
    ['UN JUEGO NO OFICIAL HECHO POR FANS', ''],
    ['IDEA E HISTORIA', 'Un fan de Spider-Man, con Claude Code'],
    ['DISEÑO, PROGRAMACIÓN,', 'GRÁFICOS Y MÚSICA ORIGINAL'],
    ['INSPIRADO EN', 'Las películas de Spider-Man de Tobey Maguire, Andrew Garfield y Tom Holland, y el Spider-Verse'],
    ['PERSONAJES', 'Spider-Man, Miles Morales, Gwen Stacy, Miguel O\'Hara, Venom, Electro, Rino, La Mancha, el Hombre de Arena y Doctor Doom son propiedad de Marvel.'],
    ['SIN FINES DE LUCRO', 'Hecho con cariño por fans, para fans.'],
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

function canonCount() {
  const c = Game.save.canon || {};
  return CANON_ORDER.filter((k) => c[k] === true).length;
}

// Sustituye marcadores dinámicos en diálogos
function prepLines(lines) {
  const out = [];
  const n = canonCount();
  for (const ln of lines) {
    if (typeof ln === 'string') {
      const c = Game.save.canon || {};
      if (ln === '{SAVED}') {
        for (const k of CANON_ORDER) if (c[k] !== undefined) out.push(['narr', STORY.savedLines[k][c[k] ? 0 : 1]]);
      } else if (ln === '{UNDO}') {
        const saved = CANON_ORDER.filter((k) => c[k] === true);
        if (saved.length) saved.forEach((k) => out.push(['narr', STORY.undoLines[k]]));
        else out.push(['narr', 'No había nada que deshacer. Solo quedaba cerrar las grietas por la fuerza.']);
      } else if (ln === '{WHY}') {
        if (Game.save.lastChoice === 'mano') {
          out.push(['cero', 'Rompiste demasiados cánones, Peter. Las grietas ya no se cierran con buenas intenciones.']);
          out.push(['cero', 'Solo queda una forma: deshacer todo lo que salvaste.']);
        } else {
          out.push(['peter', 'Si deshago lo que cambié, las grietas se cerrarán.']);
          out.push(['cero', '¿Sabes lo que te costará?']);
        }
      }
      continue;
    }
    out.push([ln[0], ln[1].replace('{N}', String(n))]);
  }
  return out;
}
