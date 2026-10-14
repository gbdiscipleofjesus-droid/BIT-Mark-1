# Prueba de microWakeWord (el wake word que corre DENTRO de la placa)

Este sketch prueba el detector de wake word **local**: no usa Wi-Fi, ni internet, ni claves. El audio del micrófono pasa por un modelo pequeño (microWakeWord, el mismo que usa ESPHome) que corre en la ESP32-S3 y decide en milisegundos si dijiste la frase. Por eso es la forma rápida de despertar al robot: no hay que subir audio a ninguna nube.

> **Estado honesto:** el detector está probado en un computador con audio real (con el modelo "hey jarvis" detecta la frase y rechaza silencio, ruido y otras frases), y el sketch compila contra las librerías. **No lo he probado en la placa**, y **todavía no existe el modelo "hey buddy"**: hay que entrenarlo (sección 3). Mientras tanto el sketch trae "hey jarvis" solo para comprobar que la placa, el micrófono y el detector funcionan.

## 1. Instalar

1. Arduino IDE con los mismos ajustes de `Robit_Mark_1` (placa *ESP32S3 Dev Module*, **PSRAM: OPI PSRAM**, **USB CDC On Boot: Enabled**).
2. *Sketch > Include Library > Manage Libraries* → busca **TensorFlowLite_ESP32** (de Masayuki Tanaka) e instálala.
3. Carpeta `Hey_Buddy_MicroWakeWord` con estos tres archivos juntos: `Hey_Buddy_MicroWakeWord.ino`, `mww_core.h`, `model_data.h`.
4. Sube. Abre el Monitor Serie a 115200.

## 2. Probar con "hey jarvis" (para ver que todo funciona)

Al arrancar debes ver algo así:

```
model "Hey Jarvis" loaded: arena used 20xxx of 26956 bytes, cutoff 0.97, window 5. Free internal RAM: ...
mic channel: left
say: Hey Jarvis
alive: 800 model runs, 20 ms of audio takes 3xxx us to process (limit 20000)
```

Di **"hey jarvis"** con voz normal, a un metro de la placa. La barra celeste sube; cuando pasa la marca amarilla la pantalla se pone verde con *DETECTADO!*, suena un pitido doble y el Serial escribe `[WAKE] "Hey Jarvis" DETECTED`. El primer segundo después de encender es de calentamiento: no detecta.

- Si `20 ms of audio takes ... us` se acerca a 20000, el detector no alcanza a tiempo: avísame con ese número.
- Si la barra de micrófono casi no se mueve, baja `MIC_SHIFT` (de 12 a 11 o 10) arriba en el sketch.
- Si dices la frase y la barra sube pero no llega a la marca, baja `CUTOFF_OVERRIDE` (por ejemplo 90). Si se activa solo, súbelo (por ejemplo 99).

## 3. Entrenar "hey buddy" (y después "hey robit")

Un modelo se entrena con voces sintéticas: **no hay que grabar nada**. El autor de microWakeWord publica un notebook: `notebooks/basic_training_notebook.ipynb` en https://github.com/kahrendt/microWakeWord. Se abre en Google Colab con GPU (Runtime > Change runtime type > T4 GPU).

1. Ejecuta las celdas en orden. En la celda que dice `target_word = 'khum_puter'` pon la frase **escrita como suena**: prueba `'hey_buddy'` o `'hey bud ee'`. La primera celda genera una muestra para que la escuches: si suena mal, cambia la ortografía fonética. Para el otro: `'hey_ro_bit'`, `'hey_row_bit'`…
2. Deja que descargue los datos y entrene (en Colab es lento, puede tardar horas; es normal que parezca detenido).
3. Al final descarga `stream_state_internal_quant.tflite`.
4. Conviértelo para el sketch (en tu computador, con Python):
   ```
   python tools/tflite_a_header.py stream_state_internal_quant.tflite --name "hey buddy" --cutoff 0.9 --window 5 --arena 30000 > Hey_Buddy_MicroWakeWord/model_data.h
   ```
   Sube el sketch de nuevo. Si el Serial dice `AllocateTensors failed`, sube `--arena` (por ejemplo 40000).
5. **Afinar:** el notebook mismo avisa que el primer modelo "probablemente no sea usable a diario: le cuesta activarse o se activa de más". Ajusta `CUTOFF_OVERRIDE` en el sketch hasta que responda a ti y no a la tele. Si no hay forma, hay que volver al notebook: más muestras, otras ortografías, más pasos de entrenamiento.
6. Para pasar a **"hey robit"** repite los pasos 1 a 4 con la otra frase. El sketch no cambia, solo `model_data.h`.

Los datos de ruido que baja el notebook mezclan licencias: un modelo entrenado así sirve para **uso personal, no comercial**.

## 4. Después

Cuando el modelo "hey buddy" ande bien en este sketch, el siguiente paso es meterlo en `Robit_Mark_1`: el robot despertaría con este detector local en vez de mandar cada frase a la nube para ver si dijiste "hey buddy". Eso le quita un viaje por internet a cada activación, que ayuda directo a la meta de responder en 1 a 3 segundos.

## Créditos

El detector sigue el diseño de la integración `micro_wake_word` de ESPHome y usa los modelos y la librería de [microWakeWord](https://github.com/kahrendt/microWakeWord) (Kevin Ahrendt) y [TensorFlow Lite Micro](https://github.com/tanakamasayuki/Arduino_TensorFlowLite_ESP32). El modelo de ejemplo "hey jarvis" es de [esphome/micro-wake-word-models](https://github.com/esphome/micro-wake-word-models) (Apache 2.0, ver `LICENSE_modelo_hey_jarvis.txt`).
