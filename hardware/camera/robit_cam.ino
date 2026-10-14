/*
  Robit's eyes, wired version: a small camera board connected to Robit with 4 wires. No Wi-Fi, no battery of its own.
  It takes a photo only when Robit asks for it and sends it down the wire.

  Works on:  Seeed XIAO ESP32-S3 Sense   (recommended)
             AI-Thinker ESP32-CAM        (needs a USB-serial programmer to upload)

  WIRING (cross TX and RX!):
      camera TX  ->  Robit UART header RX  (GPIO44)
      camera RX  ->  Robit UART header TX  (GPIO43)
      camera GND ->  Robit GND  (and the servo / battery GND: all grounds joined)
      camera 5V  ->  5 V of the servo boost (XIAO: pin "5V")
    XIAO ESP32-S3 Sense:  its TX pin is D6, its RX pin is D7.
    AI-Thinker ESP32-CAM: TX = GPIO13, RX = GPIO14, power on the 5V pin.

  Arduino IDE: Board "XIAO_ESP32S3" with PSRAM "OPI PSRAM"  (or "AI Thinker ESP32-CAM").
  Check it without Robit: open the Serial Monitor, it prints "ready". (The photo wire is a separate serial port.)
*/
#include "esp_camera.h"

#define CAMERA_MODEL_XIAO_ESP32S3   // change to CAMERA_MODEL_AI_THINKER for the ESP32-CAM
#define LINK_BAUD    921600
#define FLIP_IMAGE   0              // 1 = upside down (if you mount the camera the other way up)
#define MIRROR_IMAGE 0

#if defined(CAMERA_MODEL_XIAO_ESP32S3)
  #define PWDN_GPIO_NUM  -1
  #define RESET_GPIO_NUM -1
  #define XCLK_GPIO_NUM  10
  #define SIOD_GPIO_NUM  40
  #define SIOC_GPIO_NUM  39
  #define Y9_GPIO_NUM    48
  #define Y8_GPIO_NUM    11
  #define Y7_GPIO_NUM    12
  #define Y6_GPIO_NUM    14
  #define Y5_GPIO_NUM    16
  #define Y4_GPIO_NUM    18
  #define Y3_GPIO_NUM    17
  #define Y2_GPIO_NUM    15
  #define VSYNC_GPIO_NUM 38
  #define HREF_GPIO_NUM  47
  #define PCLK_GPIO_NUM  13
  #define LINK_RX_PIN    44           // pin D7
  #define LINK_TX_PIN    43           // pin D6
#elif defined(CAMERA_MODEL_AI_THINKER)
  #define PWDN_GPIO_NUM  32
  #define RESET_GPIO_NUM -1
  #define XCLK_GPIO_NUM  0
  #define SIOD_GPIO_NUM  26
  #define SIOC_GPIO_NUM  27
  #define Y9_GPIO_NUM    35
  #define Y8_GPIO_NUM    34
  #define Y7_GPIO_NUM    39
  #define Y6_GPIO_NUM    36
  #define Y5_GPIO_NUM    21
  #define Y4_GPIO_NUM    19
  #define Y3_GPIO_NUM    18
  #define Y2_GPIO_NUM    5
  #define VSYNC_GPIO_NUM 25
  #define HREF_GPIO_NUM  23
  #define PCLK_GPIO_NUM  22
  #define LINK_RX_PIN    14
  #define LINK_TX_PIN    13
#else
  #error "Pick a camera model at the top"
#endif

static bool startCamera() {
  camera_config_t c = {};
  c.ledc_channel = LEDC_CHANNEL_0; c.ledc_timer = LEDC_TIMER_0;
  c.pin_d0 = Y2_GPIO_NUM; c.pin_d1 = Y3_GPIO_NUM; c.pin_d2 = Y4_GPIO_NUM; c.pin_d3 = Y5_GPIO_NUM;
  c.pin_d4 = Y6_GPIO_NUM; c.pin_d5 = Y7_GPIO_NUM; c.pin_d6 = Y8_GPIO_NUM; c.pin_d7 = Y9_GPIO_NUM;
  c.pin_xclk = XCLK_GPIO_NUM; c.pin_pclk = PCLK_GPIO_NUM; c.pin_vsync = VSYNC_GPIO_NUM; c.pin_href = HREF_GPIO_NUM;
  c.pin_sccb_sda = SIOD_GPIO_NUM; c.pin_sccb_scl = SIOC_GPIO_NUM;
  c.pin_pwdn = PWDN_GPIO_NUM; c.pin_reset = RESET_GPIO_NUM;
  c.xclk_freq_hz = 20000000;
  c.pixel_format = PIXFORMAT_JPEG;
  c.frame_size = FRAMESIZE_VGA;          // 640 x 480: enough for Claude to understand the scene
  c.jpeg_quality = 14;                   // 10 = best, 63 = smallest. 12-16 gives about 25-40 KB
  c.fb_count = 2;
  c.fb_location = CAMERA_FB_IN_PSRAM;
  c.grab_mode = CAMERA_GRAB_LATEST;
  if (esp_camera_init(&c) != ESP_OK) return false;
  sensor_t* s = esp_camera_sensor_get();
  if (s) { s->set_vflip(s, FLIP_IMAGE); s->set_hmirror(s, MIRROR_IMAGE); }
  return true;
}

static void sendPhoto() {
  camera_fb_t* fb = esp_camera_fb_get();            // drop one old frame so the picture is current
  if (fb) esp_camera_fb_return(fb);
  fb = esp_camera_fb_get();
  if (!fb) return;                                  // Robit will say his eyes are waking up
  uint32_t n = fb->len;
  const uint8_t head[8] = { 'R', 'B', 'T', '1', (uint8_t)n, (uint8_t)(n >> 8), (uint8_t)(n >> 16), (uint8_t)(n >> 24) };
  Serial1.write(head, 8);
  size_t off = 0;
  while (off < n) { size_t k = Serial1.write(fb->buf + off, min((size_t)1024, n - off)); off += k; }
  Serial1.flush();
  esp_camera_fb_return(fb);
}

void setup() {
  Serial.begin(115200);
  Serial1.setRxBufferSize(256);
  Serial1.begin(LINK_BAUD, SERIAL_8N1, LINK_RX_PIN, LINK_TX_PIN);
  if (!startCamera()) Serial.println("camera did not start: push the camera board in all the way, and set PSRAM to OPI PSRAM");
  else Serial.println("ready");
}

void loop() {
  // wait for A5 5A 'P' (the first bytes can be boot noise from Robit, so this pattern is checked strictly)
  static uint8_t st = 0;
  while (Serial1.available()) {
    uint8_t b = Serial1.read();
    if (st == 0) st = (b == 0xA5) ? 1 : 0;
    else if (st == 1) st = (b == 0x5A) ? 2 : (b == 0xA5 ? 1 : 0);
    else { if (b == 'P') sendPhoto(); st = (b == 0xA5) ? 1 : 0; }
  }
  delay(1);
}
