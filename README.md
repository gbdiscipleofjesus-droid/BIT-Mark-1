# Spider-Man: Rompecánones

Videojuego de fans **no oficial** en pixel art **2.5D** para el navegador. Mezcla **plataformas**, **beat 'em up** y **mundo abierto**, con una historia original ambientada entre *Spider-Man: Brand New Day* y la llegada de Doctor Doom.

> Juego de fans sin fines de lucro. Spider-Man y todos sus personajes son propiedad de Marvel.

## Cómo jugar

- **Rápido:** abre `dist/spiderman.html` en Chrome, Edge, Firefox o Safari. Es un solo archivo, sin instalar nada y sin internet.
- **Desde el código:** abre `index.html`.

La partida se guarda sola en el navegador.

## Historia

Una grieta se abre en el cielo de la Tierra-616 y un Spider-Man con el traje quemado, **El Desconocido**, roba un dispositivo y huye entre universos. Peter lo persigue por cuatro mundos. En cada uno puede **romper un evento canónico** para salvar a alguien que siempre muere, pero cada canon roto agrieta el multiverso y acerca a Doom.

| Capítulo | Universo | Jefes | Evento canónico |
|---|---|---|---|
| Prólogo: La grieta | Tierra-616 | El Desconocido | — |
| 1. Un gran poder | Tierra-96283 (Tobey) | Hombre de Arena, Venom | Harry Osborn |
| 2. Tiempo roto | Tierra-120703 (Andrew) | Rino, Electro | Sus padres, el tío Ben y Gwen |
| 3. Salto de fe | Tierra-1610 (Miles y Gwen) | La Mancha, Miguel O'Hara | El capitán Davis |
| 4. Nada es canon | Universo ¿Y si...? | ??? | La última decisión |

- **Tres finales:** feliz, triste y neutro (pero triste). Dependen de cuántos cánones rompas y de lo que elijas al final.
- **Mundo abierto:** cada universo es una ciudad libre con su propio estilo, crímenes aleatorios y 5 fragmentos con frases con significado (25 en total). Desde el menú de pausa se puede viajar entre los universos ya visitados.
- **Más contenido:** taller con 5 mejoras y 11 trajes.
- **Voces:** los diálogos se leen en voz alta con la voz en español del sistema, con un tono distinto para cada personaje. Se ajustan o apagan en Opciones → Voces.
- **Música:** la de los créditos es original. En Opciones puedes cargar tu propia canción (MP3) para que suene en los créditos.

## Controles

Todos los controles se pueden reasignar en **Controles** (teclado y mando).

| Acción | Teclado | Mando (posición Xbox) |
|---|---|---|
| Moverse (en la calle, arriba/abajo = fondo/frente) | Flechas / WASD | Stick izquierdo / cruceta |
| Saltar (doble salto) | Espacio / Z / K | A |
| Golpear (combos) | X / J | X |
| Balancearse (mantener) | C / L | RB / RT |
| Disparar red | V / I | Y |
| Esquivar | Shift / O | B |
| Especial (mantener = curar) | B / U / Q | LB / LT |
| Refuerzo multiversal (otro Spider-Man te ayuda, recarga 90 s) | E / F | R3 (hundir stick derecho) |
| Pausa | Esc / P | Start / Select |

- **Mandos:** Xbox, PlayStation, Switch Pro, 8BitDo y mandos genéricos. Los botones se muestran con el nombre de tu mando, y tienes vibración si el navegador la admite.
- **Táctil:** en el móvil aparecen joystick y botones en pantalla.
- **Trucos:** los edificios están detrás de la calle: para trepar uno, salta delante de él y mantén Arriba. En la calle te mueves en profundidad como en *Maximum Carnage*: solo golpeas (y te golpean) si estáis a la misma altura. En tejados, Arriba + Golpear lanza al enemigo al aire. Abajo + Golpear en el aire es una patada en picado. Cuando aparecen líneas sobre la cabeza (el hormigueo), esquiva.

## Si el mando no responde

1. **Juega con el archivo descargado** (`dist/spiderman.html`), no desde el enlace: dentro de otra página, Chrome bloquea los mandos por seguridad. El juego te avisa en la portada si pasa esto.
2. **Pulsa un botón del mando** con la ventana del juego seleccionada: el navegador no muestra el mando hasta ese momento. Verás el aviso "MANDO CONECTADO".
3. **Mac:** usa Chrome o Safari. Firefox reconoce mal el mando Pro de Nintendo.
4. **Mando Nintendo Pro por Bluetooth:** si no se empareja, mantén pulsado el botón pequeño de arriba (sincronizar) hasta que las luces parpadeen y conéctalo desde Ajustes → Bluetooth.
5. Si algún botón no hace lo que esperas, cámbialo en **Controles**.
6. **El stick:** el juego lo calibra solo (centro y recorrido), así que funciona aunque el mando lo envíe descentrado. En **Controles** hay un cuadrito que muestra el stick en vivo. Los dos sticks sirven para moverse.

## Estructura

```
index.html        página principal (carga los scripts de js/)
js/               motor y juego: entrada, audio sintetizado, gráficos 2.5D, niveles, jugador, enemigos, historia, interfaz
tools/build.mjs   genera dist/spiderman.html (todo en un archivo)
tests/            pruebas automáticas con Playwright
```

Todo (gráficos, música y efectos) se genera por código: no hay imágenes ni audios externos.

## Pruebas

```
node tools/build.mjs          # genera dist/spiderman.html
node tests/smoke.mjs          # recorre todas las escenas, misiones, ciudad y menús buscando errores
node tests/combat.mjs         # un bot derrota a los 8 jefes jugando
node tests/gamepad.mjs        # simula mandos Xbox, PlayStation, Switch y genérico
node tests/voices.mjs         # diálogos hablados y recarga del refuerzo
node tests/nintendo.mjs       # mando Nintendo Pro en Chrome y Safari, y aviso si el navegador lo bloquea
node tests/rebind.mjs         # reasignación de teclado y mando
node tests/streets.mjs        # las 5 ciudades se recorren sin bloquearse y se puede trepar
node tests/depth.mjs          # movimiento en profundidad y golpes por carril
```
