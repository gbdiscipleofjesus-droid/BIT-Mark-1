# Spider-Man: Ecos de Nueva York

Videojuego de fans **no oficial** en pixel art (estilo 16-bit) para el navegador. Mezcla **plataformas**, **beat 'em up** y **mundo abierto**, con una historia original ambientada en el MCU seis meses después de *Spider-Man: No Way Home*.

> Juego de fans sin fines de lucro. Spider-Man y todos sus personajes son propiedad de Marvel.

## Cómo jugar

- **Rápido:** abre `dist/spiderman.html` en Chrome, Edge, Firefox o Safari. Es un solo archivo, sin instalar nada y sin internet.
- **Desde el código:** abre `index.html`.

La partida se guarda sola en el navegador.

## Historia

Nadie recuerda a Peter Parker. Mac Gargan y el Hojalatero asaltan el almacén de Control de Daños y roban la tecnología del Buitre, los drones de Mysterio, armas chitauri y **un fragmento del hechizo de Doctor Strange** que podría reabrir el multiverso.

| Misión | Lugar | Jefe |
|---|---|---|
| 1. Tu amigable vecino | Queens | Shocker |
| 2. Control de Daños | Almacén del Muelle 7 | Exo-Matón |
| 3. Alas de acero | Puente de Brooklyn | Buitre Mk II |
| 4. Nada es lo que parece | Times Square | Mysterio (drones) |
| 5. El Escorpión | Isla de la Libertad | Escorpión |

Entre misiones, Nueva York es libre: crímenes aleatorios (atracos, persecuciones, civiles en peligro, drones), 20 piezas de tecnología Stark ocultas, un taller con 5 mejoras y 6 trajes desbloqueables. J. Jonah Jameson opina de todo por la radio.

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
js/               motor y juego: entrada, audio sintetizado, gráficos, niveles, jugador, enemigos, historia, interfaz
tools/build.mjs   genera dist/spiderman.html (todo en un archivo)
tests/            pruebas automáticas con Playwright
```

Todo (gráficos, música y efectos) se genera por código: no hay imágenes ni audios externos.

## Pruebas

```
node tools/build.mjs          # genera dist/spiderman.html
node tests/smoke.mjs          # recorre todas las escenas, misiones, ciudad y menús buscando errores
node tests/combat.mjs         # un bot derrota a los 5 jefes jugando
node tests/gamepad.mjs        # simula mandos Xbox, PlayStation, Switch y genérico
node tests/rebind.mjs         # reasignación de teclado y mando
```
