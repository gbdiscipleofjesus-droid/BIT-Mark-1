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
- **Música:** la de los créditos es original. En Opciones puedes cargar tu propia canción (MP3) para que suene en los créditos.

## Controles

Todos los controles se pueden reasignar en **Controles** (teclado y mando).

| Acción | Teclado | Mando (posición Xbox) |
|---|---|---|
| Moverse | Flechas / WASD | Stick izquierdo / cruceta |
| Saltar (doble salto) | Espacio / Z / K | A |
| Golpear (combos) | X / J | X |
| Balancearse (mantener) | C / L | RB / RT |
| Disparar red | V / I | Y |
| Esquivar | Shift / O | B |
| Especial (mantener = curar) | B / U / Q | LB / LT |
| Pausa | Esc / P | Start / Select |

- **Mandos:** Xbox, PlayStation, Switch Pro, 8BitDo y mandos genéricos. Los botones se muestran con el nombre de tu mando, y tienes vibración si el navegador la admite.
- **Táctil:** en el móvil aparecen joystick y botones en pantalla.
- **Trucos:** Arriba + Golpear lanza al enemigo al aire. Abajo + Golpear en el aire es una patada en picado. Cuando aparecen líneas sobre la cabeza (el hormigueo), esquiva.

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
node tests/rebind.mjs         # reasignación de teclado y mando
```
