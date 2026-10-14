/*
  Robit Mark 1 - PRUEBA DE microWakeWord (detector de wake word DENTRO de la placa, sin Wi-Fi ni internet)

  Placa: Waveshare ESP32-S3-Touch-LCD-1.85.  Ajustes Arduino igual que Robit_Mark_1 (PSRAM: OPI PSRAM, USB CDC On Boot: Enabled).
  Libreria extra: "TensorFlowLite_ESP32" (de Masayuki Tanaka) - Sketch > Include Library > Manage Libraries.

  Que hace: escucha el microfono, pasa el audio por el modelo microWakeWord de model_data.h y, cuando oye la frase,
  la pantalla se pone verde con "DETECTADO", suena un pitido doble y el Monitor Serie (115200) lo anota.
  El modelo que trae por defecto es "hey jarvis" (ya entrenado, solo para comprobar que todo funciona).
  Para "hey buddy" / "hey robit": entrena tu modelo (ver README) y reemplaza model_data.h.
*/
#include <Arduino.h>
#include <Wire.h>
#include <ESP_I2S.h>
#include <Arduino_GFX_Library.h>
#include <TensorFlowLite_ESP32.h>
#include "model_data.h"
#include "mww_core.h"

// ---- ajustes
#define MIC_SHIFT      12      // ganancia del microfono: mas bajo = mas fuerte (10..14). Si "mic level" casi no se mueve, baja a 10 u 11
#define CUTOFF_OVERRIDE 0      // 0 = usar el del modelo. En porcentaje: pon 90 si no te detecta, o 99 si detecta de mas
#define SHOW_SERIAL_PROB 1     // 1 = imprime la probabilidad cuando pasa de 0.10

// ---- pines de la placa (los mismos de Robit_Mark_1)
#define PIN_I2C_SDA 11
#define PIN_I2C_SCL 10
#define PIN_LCD_BL   5
#define PIN_MIC_WS   2
#define PIN_MIC_SCK 15
#define PIN_MIC_SD  39
#define PIN_SPK_BCK 48
#define PIN_SPK_LRCK 38
#define PIN_SPK_DIN 47
#define TCA_ADDR  0x20
#define MIC_RATE 16000
#define SPK_RATE 24000

I2SClass i2sMic, i2sSpk;
Arduino_DataBus *bus = new Arduino_ESP32QSPI(21, 40, 46, 45, 42, 41, false);
Arduino_GFX *panel = new Arduino_ST77916(bus, -1, 0, true, 360, 360, 0, 0, 0, 0, st77916_150_init_operations, sizeof(st77916_150_init_operations));
Arduino_Canvas *gfx = new Arduino_Canvas(360, 360, panel);
#define COL(r, g, b) gfx->color565(r, g, b)

MicroWakeWord mww;
volatile uint8_t gProb = 0, gAvg = 0;
volatile uint32_t gHits = 0, gLastHit = 0, gInfer = 0, gInferUs = 0;
volatile float gLevel = 0;
volatile bool gBeep = false, gReady = false;
const char* gErr = "";

static void i2cWrite8(uint8_t a, uint8_t r, uint8_t v) { Wire.beginTransmission(a); Wire.write(r); Wire.write(v); Wire.endTransmission(); }
static void lcdReset() {
  i2cWrite8(TCA_ADDR, 0x03, 0xFC); i2cWrite8(TCA_ADDR, 0x01, 0xFF); delay(10);
  i2cWrite8(TCA_ADDR, 0x01, 0xFC); delay(20); i2cWrite8(TCA_ADDR, 0x01, 0xFF); delay(120);
}
static void flushScreen() {                                   // the screen driver needs small pieces (see Robit_Mark_1)
  uint16_t *fb = gfx->getFramebuffer();
  for (int y = 0; y < 360; y += 2) panel->draw16bitRGBBitmap(0, y, fb + y * 360, 360, 2);
}

// ---- audio: reads the mic all the time and feeds the detector (its own task, so drawing never makes it miss audio)
static void listenTask(void*) {
  static int32_t raw[320 * 2];                                // 320 stereo frames = 20 ms
  static int16_t pcm[320];
  int ch = 0, detect = 0; int64_t eL = 0, eR = 0; uint32_t lastPrint = 0;
  for (;;) {
    size_t n = i2sMic.readBytes((char*)raw, sizeof(raw));
    int frames = n / 8;
    if (frames <= 0) { vTaskDelay(1); continue; }
    if (detect < 25) {                                        // first 0.5 s: which channel has the mic
      for (int i = 0; i < frames; i++) { eL += abs(raw[2 * i] >> 14); eR += abs(raw[2 * i + 1] >> 14); }
      if (++detect == 25) { ch = (eR > eL) ? 1 : 0; Serial.printf("mic channel: %s\n", ch ? "right" : "left"); }
      continue;
    }
    int64_t acc = 0;
    for (int i = 0; i < frames; i++) {
      int32_t v = raw[2 * i + ch] >> MIC_SHIFT;
      if (v > 32767) v = 32767; else if (v < -32768) v = -32768;
      pcm[i] = (int16_t)v; acc += (int32_t)v * v;
    }
    gLevel = gLevel * 0.6f + 0.4f * min(1.0f, sqrtf((float)(acc / frames)) / 3000.0f);
    uint32_t t0 = micros();
    bool heard = mww.feed(pcm, frames);
    gInferUs = (micros() - t0);                               // time to process 20 ms of audio (must stay well below 20000)
    gProb = mww.lastProb(); gAvg = mww.avgProb(); gInfer = mww.inferences();
#if SHOW_SERIAL_PROB
    if (gProb > 25 && millis() - lastPrint > 100) { lastPrint = millis(); Serial.printf("  prob %.2f  (avg %.2f, need %.2f)\n", gProb / 255.0f, gAvg / 255.0f, mww.cutoff() / 255.0f); }
#endif
    if (heard) {
      gHits++; gLastHit = millis(); gBeep = true;
      Serial.printf("[WAKE] \"%s\" DETECTED  #%u  (avg %.2f)\n", MODEL_NAME, (unsigned)gHits, gAvg / 255.0f);
    }
  }
}

static void beepNow(int hz, int ms) {
  static int16_t b[2 * 2400];
  int n = min(2400, SPK_RATE / 1000 * ms);
  for (int i = 0; i < n; i++) { float env = min(1.0f, min(i, n - 1 - i) / 120.0f); int16_t v = (int16_t)(7000.0f * env * sinf(2.0f * 3.14159265f * hz * i / SPK_RATE)); b[2 * i] = v; b[2 * i + 1] = v; }
  i2sSpk.write((uint8_t*)b, n * 4);
}

static void draw(uint32_t now) {
  bool hit = gLastHit && now - gLastHit < 1500;
  uint16_t bg = hit ? COL(0, 110, 40) : COL(0, 0, 0);
  gfx->fillScreen(bg);
  gfx->setTextColor(0xFFFF);
  gfx->setTextSize(3);
  const char* title = hit ? "DETECTADO!" : (gReady ? "Escuchando" : "Error");
  int w = strlen(title) * 18; gfx->setCursor(180 - w / 2, 40); gfx->print(title);
  gfx->setTextSize(2); gfx->setTextColor(COL(160, 220, 255));
  String say = String("di: ") + MODEL_NAME; w = say.length() * 12; gfx->setCursor(180 - w / 2, 92); gfx->print(say.c_str());
  if (!gReady) { gfx->setTextSize(2); gfx->setTextColor(COL(255, 120, 100)); gfx->setCursor(30, 150); gfx->print(gErr); }
  // probability bar (0..1) with a mark where the detector triggers
  int bx = 40, by = 160, bw = 280, bh = 34;
  gfx->drawRoundRect(bx - 2, by - 2, bw + 4, bh + 4, 8, COL(90, 90, 90));
  int fillw = (int)(bw * (gAvg / 255.0f));
  gfx->fillRoundRect(bx, by, max(fillw, 2), bh, 6, hit ? COL(255, 255, 255) : COL(80, 220, 255));
  int cx = bx + (int)(bw * (mww.cutoff() / 255.0f)); gfx->fillRect(cx - 1, by - 8, 3, bh + 16, COL(255, 200, 60));
  gfx->setTextSize(2); gfx->setTextColor(0xFFFF);
  { char t[24]; snprintf(t, sizeof t, "prob %.2f", gAvg / 255.0f); gfx->setCursor(bx, by + bh + 12); gfx->print(t); }
  // microphone level
  int lw = (int)(bw * min(1.0f, (float)gLevel));
  gfx->fillRoundRect(bx, 262, bw, 10, 5, COL(40, 40, 40)); gfx->fillRoundRect(bx, 262, max(lw, 2), 10, 5, COL(120, 255, 140));
  gfx->setTextSize(1); gfx->setTextColor(COL(170, 170, 170)); gfx->setCursor(bx, 278); gfx->print("microfono");
  gfx->setTextSize(2); gfx->setTextColor(0xFFFF); { char t[24]; snprintf(t, sizeof t, "veces: %u", (unsigned)gHits); gfx->setCursor(110, 300); gfx->print(t); }
  flushScreen();
}

void setup() {
  Serial.begin(115200); delay(300);
  Serial.println("\nRobit Mark 1 - prueba microWakeWord");
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL, 400000);
  lcdReset();
  if (!gfx->begin(20000000)) Serial.println("display init failed (is PSRAM set to OPI PSRAM?)");
  ledcAttach(PIN_LCD_BL, 5000, 8); ledcWrite(PIN_LCD_BL, 200);
  gfx->fillScreen(0); flushScreen();

  float cut = MODEL_CUTOFF;
  if (CUTOFF_OVERRIDE > 0) cut = (float)CUTOFF_OVERRIDE / 100.0f;           // CUTOFF_OVERRIDE in percent, e.g. 90
  gReady = mww.begin(g_model, cut, MODEL_WINDOW, MODEL_ARENA);
  if (!gReady) { gErr = mww.error(); Serial.printf("detector failed: %s\n", gErr); }
  else Serial.printf("model \"%s\" loaded: arena used %u of %u bytes, cutoff %.2f, window %d. Free internal RAM: %u\n", MODEL_NAME, (unsigned)mww.arenaUsed(), (unsigned)MODEL_ARENA + 4096, mww.cutoff() / 255.0f, MODEL_WINDOW, (unsigned)heap_caps_get_free_size(MALLOC_CAP_INTERNAL));

  i2sMic.setPins(PIN_MIC_SCK, PIN_MIC_WS, -1, PIN_MIC_SD);
  if (!i2sMic.begin(I2S_MODE_STD, MIC_RATE, I2S_DATA_BIT_WIDTH_32BIT, I2S_SLOT_MODE_STEREO, I2S_STD_SLOT_BOTH)) Serial.println("mic I2S failed");
  i2sSpk.setPins(PIN_SPK_BCK, PIN_SPK_LRCK, PIN_SPK_DIN);
  if (!i2sSpk.begin(I2S_MODE_STD, SPK_RATE, I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_STEREO, I2S_STD_SLOT_BOTH)) Serial.println("speaker I2S failed");
  beepNow(660, 90); beepNow(880, 90);
  if (gReady) xTaskCreatePinnedToCore(listenTask, "listen", 12288, NULL, 6, NULL, 1);
  Serial.printf("say: %s\n(the first second is warm-up; then watch the bar)\n", MODEL_NAME);
}

void loop() {
  static uint32_t lastDraw = 0, lastInfo = 0;
  uint32_t now = millis();
  if (gBeep) { gBeep = false; beepNow(880, 70); beepNow(1175, 90); }
  if (now - lastDraw > 80) { lastDraw = now; draw(now); }
  if (gReady && now - lastInfo > 5000) { lastInfo = now; Serial.printf("alive: %u model runs, 20 ms of audio takes %u us to process (limit 20000)\n", (unsigned)gInfer, (unsigned)gInferUs); }
  delay(5);
}
