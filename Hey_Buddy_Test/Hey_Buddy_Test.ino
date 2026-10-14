/*
  Robit Mark 1 - WAKE-WORD TEST (not the robot: it only listens for the wake word)
  Board: Waveshare ESP32-S3-Touch-LCD-1.85 (PCM5101 speaker chip + I2S microphone version)

  What it does
    - Streams microphone audio to robot_server.py over Wi-Fi (WebSocket) while you hold the BOOT button
      (or continuously in "auto" mode, set by the server).
    - Plays the speech audio the server sends back through the speaker.
    - Shows an animated face on the round screen (idle / listening / thinking / speaking).
    - Moves 6 servos through a PCA9685 (left hip, right hip, left ankle, right ankle, left arm, right arm)
      on movement tags such as [wave] [walk] [dance] that Claude puts in its replies. Moves are timed to the speech.
      The round screen is the face, there are no head servos.
    - Feels what happens to it: the motion sensor (QMI8658) notices being shaken, picked up or turned upside
      down, and the touch screen notices taps. The server turns these into spoken reactions.
    - Falls asleep (dim screen, closed eyes, little "z") when nothing happens for a while and wakes up on
      voice, touch, movement, a button press or when someone walks up.
    - Plays short tones when the server connects / disconnects, so you can hear what is going on.

  Two ways to run (set STANDALONE below)
    STANDALONE 1  = no computer needed. Robit calls OpenAI (ears + voice) and Claude (brain) himself over Wi-Fi.
                    Put your two API keys and your city in the settings. Also needs a library: none extra.
    STANDALONE 0  = the older way: Robit talks to robot_server.py running on a computer.

  Arduino IDE settings (Tools menu)
    Board:            ESP32S3 Dev Module   (ESP32 core 3.0.2 or newer)
    Flash size:       16MB
    PSRAM:            OPI PSRAM            <-- required (screen buffer + audio buffer)
    Partition scheme: 16M Flash (3MB APP/9.9MB FATFS)
    USB CDC On Boot:  Enabled              <-- so Serial prints over the USB-C port

  Libraries (Library Manager)
    "GFX Library for Arduino"  (moononournation)
    "WebSockets"               (Markus Sattler)
    "ArduinoJson"              (version 7)

  If the board does not show up for flashing: hold BOOT, plug in USB, release BOOT.
*/

#include <Arduino.h>
#include "driver/rtc_io.h"
#include "esp_sleep.h"
#include <WiFi.h>
#include <Wire.h>
#include <ESP_I2S.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <Arduino_GFX_Library.h>
#include <atomic>
#include <initializer_list>
#include <WiFiClientSecure.h>
#include <WiFiMulti.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>
#include <time.h>
#include <mbedtls/base64.h>
#include <esp_heap_caps.h>

// ROBIT - FAIR version: talks, time, weather, timers, faces, ready-made answers. No Spotify, no radio, no camera (less memory = more stable).
// forward declarations: the Arduino IDE builds function prototypes before the structs below, so they must be known early
struct HttpConn;
struct Speaker;

static inline uint32_t umin(uint32_t a, uint32_t b) { return a < b ? a : b; }

#define C_BLACK 0x0000
#define C_WHITE 0xFFFF

// ============================================================ YOUR SETTINGS
// ---- Your private settings (Wi-Fi, API keys) live in secrets.h, NOT in this file. Copy secrets.example.h to secrets.h and fill it in.
#if __has_include("secrets.h")
  #include "secrets.h"
#endif
#ifndef WIFI_SSID
  #define WIFI_SSID "YOUR_WIFI_NAME"
#endif
#ifndef WIFI_PASS
  #define WIFI_PASS "YOUR_WIFI_PASSWORD"
#endif
#ifndef WIFI_SSID2
  #define WIFI_SSID2 ""
#endif
#ifndef WIFI_PASS2
  #define WIFI_PASS2 ""
#endif
#ifndef WIFI_SSID3
  #define WIFI_SSID3 ""
#endif
#ifndef WIFI_PASS3
  #define WIFI_PASS3 ""
#endif
#ifndef OPENAI_KEY
  #define OPENAI_KEY "sk-your-openai-key"
#endif
#ifndef ANTHROPIC_KEY
  #define ANTHROPIC_KEY "sk-ant-your-anthropic-key"
#endif
#ifndef GOOGLE_MAPS_KEY
  #define GOOGLE_MAPS_KEY ""
#endif
#define SPOTIFY_CLIENT_ID ""
#define SPOTIFY_CLIENT_SECRET ""
#define SPOTIFY_REFRESH_TOKEN ""
// Backup networks (leave the name empty "" if unused). He joins whichever known network is in range:
// put your phone's hotspot here for the fair, and your home Wi-Fi above.
#define SERVER_HOST  "0.0.0.0"   // the computer running robot_server.py (it prints this on start)
#define SERVER_PORT  8765

#define STANDALONE   1                // 1 = Robit works alone (needs the keys below), 0 = uses robot_server.py on a computer

// ---- only used when STANDALONE is 1
#define CLAUDE_MODEL   "claude-haiku-4-5-20251001" // fast. For smarter (slower) answers use "claude-sonnet-5-5"
#define STT_MODEL      "gpt-4o-mini-transcribe"
#define TTS_MODEL      "tts-1"                     // fastest. For a more expressive (slower) voice: "gpt-4o-mini-tts"
#define TTS_SPEED      1.15f                        // tts-1 only: 1.0 normal, 1.2 brisk (also by voice: "speak faster")
#define USE_CAMERA     0                           // 1 = he can see through the separate camera module (robit_cam folder). 0 = off
#define CAM_RX_PIN     44                          // camera module wire "TX" goes to this pin (the board's UART header RX)
#define CAM_TX_PIN     43                          // camera module wire "RX" goes to this pin (the board's UART header TX)
#define CAM_BAUD       921600
#define THINK_GESTURE  1                           // a small blip + arm gesture the moment he starts thinking, so the wait feels shorter
#define TTS_VOICE      "alloy"
#define TTS_STYLE      "Speak like a small, friendly, curious robot: warm, upbeat and clear, at a lively, brisk pace. When the text is Spanish, use a natural Chilean accent from Santiago (casual, fast, relaxed s at the end of words)."   // the accent only works with TTS_MODEL \"gpt-4o-mini-tts\"
#define ROBOT_NAME_DEFAULT "Robit"                 // can be changed by voice ("your name is ...")
#define CITY_NAME      "Santiago, Chile"           // where he is: used for the weather and the clock
#define CITY_LAT       -33.45                      // latitude / longitude of that city (for the weather)
#define CITY_LON       -70.66
#define TIMEZONE_POSIX "<-04>4<-03>,M9.1.6/24,M4.1.6/24"   // Chile. Find yours: search "posix tz string <your city>"
#define WEATHER_IMPERIAL 0                         // 1 = Fahrenheit and miles per hour
#define CANNED_REPLIES 1                           // 1 = ready-made instant answers (shaken, lifted, upside down, tapped, waking up, going to sleep, low battery). Edit the lines in CANNED[] below. 0 = Claude invents every reaction
#define LANGUAGE       "auto"                      // "auto" = he answers in the language you speak (Spanish or English), "es" = always Spanish, "en" = always English
#define EXPRESSIONS    1                           // 1 = he shows expressions (happy, sad, angry...) while he talks and reacts. 0 = only his normal face
#define EXPRESSION_SECONDS 7                       // how long an expression stays when Claude picks one
#define LISTEN_AUTO    1                           // 0 = hold the BOOT button to talk, 1 = he listens all the time
#define WAKE_WORDS     ""                          // auto listening only: e.g. "robit,robot" = answer only if you say it ("" = answer everything)
#define WAKE_TEST      1                           // 1 = TEST ONLY: he just checks for "hey buddy" and reports it (screen + Serial), no answers. Used by the Hey_Buddy_Test sketch
#define WAKE_PHRASE    1                           // which call wakes him: 1 = "hey robit" / "oye robit" (also "hola robit"), 0 = "hey buddy"
#define WAKE_HEYBUDDY  1                           // 1 = in auto listening he answers only after the call (WAKE_PHRASE) (and keeps talking without it for WAKE_FOLLOWUP_MS). 0 = answers everything
#define WAKE_FOLLOWUP_MS 12000                      // after an answer he keeps listening this long without the wake word
#define REACTIONS      1                           // speak when shaken / lifted / upside down / tapped
#define VAD_MIN_RMS    350.0f                      // auto listening: raise in a noisy room
#define VAD_RATIO      3.0f
#define VAD_END_SILENCE 0.45f
// Facts he can tell visitors. One per line, true things only.
const char* const ROBOT_FACTS =
  "My name is Robit Mark 1.\n"
  "I was built by Bautista and Pedro.\n"
  "I am a small talking AI assistant buddy with a round screen for a face.\n"
  "I can talk, show feelings on my face, play songs and videos, show maps, and tell the time and the weather.\n";

#define SPK_VOLUME   0.8f             // 0.0 - 1.0 (the board also has a volume button)
#define SPK_PREBUFFER_BYTES 12000     // audio collected before playing starts (0.25 s) so the voice doesn't stutter
#define MIC_SHIFT    12               // mic gain: lower = louder (10..14). The server also normalises.
#define FACE_FPS     24

#define IDLE_MOTION  1                // little head glances while idle
#define USE_IMU      1                // 1 = react to being shaken / lifted / upside down (QMI8658 on the board)
#define USE_TOUCH    1                // 1 = react to taps on the screen (CST816 on the board)
#define SLEEP_AFTER_SEC 180           // fall asleep after this many quiet seconds (0 = never sleep)
#define BL_AWAKE     200              // screen brightness awake (0-255)
#define BAT_ADC_PIN    8              // GPIO that reads the battery through a divider (-1 = no battery reading). CHECK with a multimeter, see README
#define BAT_DIVIDER    3.0f           // the board divides the battery voltage by this before the pin
#define BAT_CAL        1.00f          // fine tune: multimeter volts / volts shown in the menu
#define TOUCH_FLIP_X   0              // if the menu reacts mirrored left/right, set 1
#define TOUCH_FLIP_Y   0              // if it reacts mirrored up/down, set 1
#define TOUCH_SWAP_XY  0              // if left/right and up/down are swapped, set 1
#define BL_ASLEEP     12              // screen brightness asleep
#define SHAKE_DEV_G  0.9f             // how hard a jolt must be (in g) to count as part of a shake
#define LIFT_DEV_G   0.3f             // how big a bump (in g) counts as being picked up
#define USE_ULTRASONIC 0              // 1 = HC-SR04 on GPIO43/44 (see README: needs a voltage divider). Cannot be used together with the camera wire

// ---- extras (standalone mode). Each one needs one small Arduino library: Sketch > Include Library > Manage Libraries
#define USE_MUSIC        0            // 1 = he plays internet radio ("play some jazz"). Library: "libhelix" (or the ZIP from github.com/pschatzmann/arduino-libhelix). 0 = off
#define MUSIC_GAIN       0.7f         // radio loudness compared to his voice (0.1 - 1.0)
#define USE_PHOTO_SCREEN 1            // 1 = a photo he takes is shown on the screen. Library: "JPEGDEC" (by Larry Bank). 0 = off
#define USE_SPOTIFY      0            // 1 = he controls YOUR Spotify (Premium): "play Daft Punk" starts it on your phone / computer / speaker. Needs the 3 keys below (README, step by step)
#define SPOTIFY_DEVICE_NAME    ""     // optional: part of the name of the phone / speaker to play on ("" = the one that is playing or open)
#define CARD_SECONDS     10           // how long the weather / time / photo card stays on the screen before his face comes back
#define USE_MAP          1            // 1 = a Google map on the screen: menu > Map (zoom, drag, satellite...) and "show me ..." / "how do I get to ..." by voice. Needs USE_PHOTO_SCREEN 1 and a Google Maps key (README). 0 = off
#define MAP_ZOOM_HOME    14           // how close the first map is (3 = continent, 10 = city, 15 = streets)
#define USE_SD_MUSIC     1            // 1 = songs from a microSD card (folder "music", MP3 files): menu > Songs and "play a song". Library: "libhelix". Turns itself off if the library is missing
#define MUSIC_GAIN       0.7f         // song loudness compared to his voice (0.1 - 1.0)
#define SONG_MAX         60           // how many songs he lists
#define USE_VIDEO        1            // 1 = videos (with sound) on the round screen from the microSD card (folder "video", AVI Motion-JPEG files): menu > Videos and "show me a video". Needs USE_SD_MUSIC 1 and USE_PHOTO_SCREEN 1. 0 = off

#if !STANDALONE                       // the extras only exist in standalone mode (with robot_server.py the computer does this)
  #undef USE_MUSIC
  #define USE_MUSIC 0
  #undef USE_PHOTO_SCREEN
  #define USE_PHOTO_SCREEN 0
  #undef USE_SPOTIFY
  #define USE_SPOTIFY 0
#endif
#if USE_PHOTO_SCREEN
  #include <JPEGDEC.h>
#endif
#if USE_MAP && !USE_PHOTO_SCREEN
  #undef USE_MAP
  #define USE_MAP 0
#endif
#if USE_SD_MUSIC && !STANDALONE
  #undef USE_SD_MUSIC
  #define USE_SD_MUSIC 0
#endif
#if USE_SD_MUSIC && !__has_include(<MP3DecoderHelix.h>)
  #undef USE_SD_MUSIC
  #define USE_SD_MUSIC 0
  #define SD_LIB_MISSING 1
#endif
#if USE_VIDEO && !(USE_SD_MUSIC && USE_PHOTO_SCREEN)
  #undef USE_VIDEO
  #define USE_VIDEO 0
#endif
#if USE_SD_MUSIC
  #include <SPI.h>
  #include <SD.h>
  #include <SD_MMC.h>
  #include <MP3DecoderHelix.h>
#endif

// ---- servo layout: PCA9685 channel 0 = left hip, 1 = right hip, 2 = left ankle, 3 = right ankle,
//                                4 = left arm, 5 = right arm   ("left" = the robot's left)
// Hips turn the legs to take steps. Ankles tilt the feet sideways to shift weight. Arms raise sideways.
// Values are degrees. Start small and increase when everything moves the right way.
#define HIP_STEP      18              // how far the hips turn for a step (3D model clears up to 20)
#define ANK_TILT      18              // how far the ankles tilt to shift weight
// Arms stick out sideways: 90 = exactly horizontal (fit the horn at 90), higher = lifted, lower = dropped
#define ARM_DOWN      50              // arms dropped
#define ARM_UP       165              // arms lifted high
#define ARM_OUT       80              // arms held about horizontal while walking
#define IDLE_LEAN      8              // small idle sway
// Servos on the right side are mounted mirrored. Set a value to true or false to flip a servo's direction:
// after flipping, "forward / tilt left / up" must mean the same on both sides.
const bool SERVO_INVERT[6] = { false, true, false, true, false, true };
#define SERVO_MIN_US 600              // pulse for 0 degrees   (MG90S: 500-2500 max)
#define SERVO_MAX_US 2400             // pulse for 180 degrees
// ==========================================================================

// ---- pins (from the Waveshare wiki for this board)
#define PIN_I2C_SDA   11
#define PIN_I2C_SCL   10
#define PIN_LCD_BL     5
#define PIN_MIC_WS     2
#define PIN_MIC_SCK   15
#define PIN_MIC_SD    39
#define PIN_SPK_BCK   48
#define PIN_SPK_LRCK  38
#define PIN_SPK_DIN   47
#define PIN_BOOT_BTN   0
#define PIN_US_TRIG   43
#define PIN_US_ECHO   44

#define TCA_ADDR     0x20             // IO expander: LCD reset = EXIO2, touch reset = EXIO1
#define PCA_ADDR     0x40             // PCA9685 servo driver
#define IMU_ADDR_A   0x6B             // QMI8658 motion sensor (address depends on the board revision)
#define IMU_ADDR_B   0x6A
#define TOUCH_ADDR   0x15             // CST816 touch controller

#define MIC_RATE     16000
#define SPK_RATE     24000

// ============================================================ small lock-free ring buffer
struct Ring {
  uint8_t* buf = nullptr;
  uint32_t cap = 0, mask = 0;                      // cap must be a power of two
  std::atomic<uint32_t> head{0}, tail{0};          // monotonically increasing byte counters
  bool init(uint32_t c) {
    buf = (uint8_t*)ps_malloc(c);
    if (!buf) buf = (uint8_t*)malloc(c);
    cap = c; mask = c - 1;
    return buf != nullptr;
  }
  uint32_t avail() const { return head.load(std::memory_order_acquire) - tail.load(std::memory_order_acquire); }
  uint32_t write(const uint8_t* d, uint32_t n) {   // producer only
    uint32_t h = head.load(std::memory_order_relaxed);
    uint32_t space = cap - (h - tail.load(std::memory_order_acquire));
    if (n > space) n = space;
    for (uint32_t i = 0; i < n; i++) buf[(h + i) & mask] = d[i];
    head.store(h + n, std::memory_order_release);
    return n;
  }
  uint32_t read(uint8_t* d, uint32_t n) {          // consumer only
    uint32_t t = tail.load(std::memory_order_relaxed);
    uint32_t a = head.load(std::memory_order_acquire) - t;
    if (n > a) n = a;
    for (uint32_t i = 0; i < n; i++) d[i] = buf[(t + i) & mask];
    tail.store(t + n, std::memory_order_release);
    return n;
  }
  void discardAll() { tail.store(head.load(std::memory_order_acquire), std::memory_order_release); }  // consumer only
};

// ============================================================ servo keyframes
#define NS 6
#define KEEP -1
struct Key { int16_t a[NS]; uint16_t ms; };        // hipL hipR ankleL ankleR armL armR (logical degrees)
#define K(hl, hr, al, ar, ml, mr, ms) {{hl, hr, al, ar, ml, mr}, ms}
#define HIP0   90                                   // hips / ankles straight
#define HIPF   (HIP0 + HIP_STEP)                    // leg turned forward
#define HIPB   (HIP0 - HIP_STEP)                    // leg turned back
#define ANK0   90
#define ANKL   (ANK0 + ANK_TILT)                    // lean to the robot's left (right foot free)
#define ANKR   (ANK0 - ANK_TILT)                    // lean to the robot's right (left foot free)
#define ARM_HALF  (ARM_UP - 40)

// one pair of steps, forward (F = forward angle, B = back angle) or backward (swap them)
#define STEP_PAIR(F, B) \
  K(KEEP,KEEP,ANKL,ANKL,KEEP,KEEP,260), K(B,F,KEEP,KEEP,KEEP,KEEP,300), \
  K(KEEP,KEEP,ANKR,ANKR,KEEP,KEEP,260), K(F,B,KEEP,KEEP,KEEP,KEEP,300)
// turning: the free foot turns, then the weight moves over it (experimental, see README)
#define TURN_PAIR(D) \
  K(KEEP,KEEP,ANKR,ANKR,KEEP,KEEP,260), K(D,KEEP,KEEP,KEEP,KEEP,KEEP,300), \
  K(KEEP,KEEP,ANKL,ANKL,KEEP,KEEP,260), K(HIP0,HIP0,KEEP,KEEP,KEEP,KEEP,300)
#define STAND_ARMS_OUT K(HIP0,HIP0,ANK0,ANK0,ARM_OUT,ARM_OUT,250)
#define STAND_ARMS_DOWN K(HIP0,HIP0,ANK0,ANK0,ARM_DOWN,ARM_DOWN,350)

const Key A_WALK[]   = { STAND_ARMS_OUT, STEP_PAIR(HIPF,HIPB), STEP_PAIR(HIPF,HIPB), STEP_PAIR(HIPF,HIPB), STAND_ARMS_DOWN };
const Key A_BACK[]   = { STAND_ARMS_OUT, STEP_PAIR(HIPB,HIPF), STEP_PAIR(HIPB,HIPF), STEP_PAIR(HIPB,HIPF), STAND_ARMS_DOWN };
const Key A_TURN_L[] = { STAND_ARMS_OUT, TURN_PAIR(HIPF), TURN_PAIR(HIPF), STAND_ARMS_DOWN };
const Key A_TURN_R[] = { STAND_ARMS_OUT, TURN_PAIR(HIPB), TURN_PAIR(HIPB), STAND_ARMS_DOWN };
// "yes": both arms bob
const Key A_NOD[]    = { K(KEEP,KEEP,KEEP,KEEP,ARM_OUT,ARM_OUT,200), K(KEEP,KEEP,KEEP,KEEP,ARM_DOWN,ARM_DOWN,200),
                         K(KEEP,KEEP,KEEP,KEEP,ARM_OUT,ARM_OUT,200), K(KEEP,KEEP,KEEP,KEEP,ARM_DOWN,ARM_DOWN,250) };
// "no": rock the body from side to side
const Key A_SHAKE[]  = { K(KEEP,KEEP,ANKL,ANKL,KEEP,KEEP,220), K(KEEP,KEEP,ANKR,ANKR,KEEP,KEEP,300),
                         K(KEEP,KEEP,ANKL,ANKL,KEEP,KEEP,300), K(KEEP,KEEP,ANK0,ANK0,KEEP,KEEP,220) };
// wave with the robot's right arm
const Key A_WAVE[]   = { K(KEEP,KEEP,KEEP,KEEP,KEEP,ARM_UP,300),
                         K(KEEP,KEEP,KEEP,KEEP,KEEP,ARM_UP-35,180), K(KEEP,KEEP,KEEP,KEEP,KEEP,ARM_UP,180),
                         K(KEEP,KEEP,KEEP,KEEP,KEEP,ARM_UP-35,180), K(KEEP,KEEP,KEEP,KEEP,KEEP,ARM_UP,180),
                         K(KEEP,KEEP,KEEP,KEEP,KEEP,ARM_DOWN,350) };
// look = a small lean to that side and back
const Key A_LOOK_L[] = { K(KEEP,KEEP,ANK0+IDLE_LEAN,ANK0+IDLE_LEAN,KEEP,KEEP,350), K(KEEP,KEEP,KEEP,KEEP,KEEP,KEEP,700),
                         K(KEEP,KEEP,ANK0,ANK0,KEEP,KEEP,400) };
const Key A_LOOK_R[] = { K(KEEP,KEEP,ANK0-IDLE_LEAN,ANK0-IDLE_LEAN,KEEP,KEEP,350), K(KEEP,KEEP,KEEP,KEEP,KEEP,KEEP,700),
                         K(KEEP,KEEP,ANK0,ANK0,KEEP,KEEP,400) };
const Key A_HAPPY[]  = { K(KEEP,KEEP,KEEP,KEEP,ARM_HALF,ARM_HALF,300), K(KEEP,KEEP,ANKL,ANKL,ARM_HALF-30,ARM_HALF-30,200),
                         K(KEEP,KEEP,ANKR,ANKR,ARM_HALF,ARM_HALF,200), K(KEEP,KEEP,ANKL,ANKL,ARM_HALF-30,ARM_HALF-30,200),
                         K(KEEP,KEEP,ANK0,ANK0,ARM_DOWN,ARM_DOWN,350) };
const Key A_DANCE[]  = { K(KEEP,KEEP,ANKL,ANKL,ARM_UP-30,ARM_DOWN+20,260), K(HIPF,HIPB,ANKR,ANKR,ARM_DOWN+20,ARM_UP-30,260),
                         K(HIPB,HIPF,ANKL,ANKL,ARM_UP-30,ARM_DOWN+20,260), K(HIPF,HIPB,ANKR,ANKR,ARM_DOWN+20,ARM_UP-30,260),
                         K(HIPB,HIPF,ANKL,ANKL,ARM_UP-30,ARM_DOWN+20,260), K(HIPF,HIPB,ANKR,ANKR,ARM_DOWN+20,ARM_UP-30,260),
                         STAND_ARMS_DOWN };
const Key A_THINK[]  = { K(KEEP,KEEP,KEEP,KEEP,KEEP,70,400), K(KEEP,KEEP,KEEP,KEEP,KEEP,KEEP,1100),
                         K(KEEP,KEEP,KEEP,KEEP,KEEP,ARM_DOWN,400) };
const Key A_CENTER[] = { K(HIP0,HIP0,ANK0,ANK0,ARM_DOWN,ARM_DOWN,400) };

struct ActDef { const char* name; const Key* keys; uint8_t n; };
#define ACT(nm, arr) { nm, arr, (uint8_t)(sizeof(arr) / sizeof(arr[0])) }
const ActDef ACTS[] = {
  ACT("nod", A_NOD), ACT("shake", A_SHAKE), ACT("wave", A_WAVE), ACT("look_left", A_LOOK_L),
  ACT("look_right", A_LOOK_R), ACT("happy", A_HAPPY), ACT("think", A_THINK), ACT("center", A_CENTER),
  ACT("walk", A_WALK), ACT("back", A_BACK), ACT("turn_left", A_TURN_L), ACT("turn_right", A_TURN_R),
  ACT("dance", A_DANCE),
};
const uint8_t NACTS = sizeof(ACTS) / sizeof(ACTS[0]);

// safety limits per servo (logical degrees): hipL hipR ankleL ankleR armL armR
const int LIM_MIN[NS] = { 55, 55, 65, 65,  30,  30 };
const int LIM_MAX[NS] = { 125, 125, 115, 115, 175, 175 };

// ============================================================ state
enum BotState { ST_IDLE, ST_LISTEN, ST_THINK, ST_SPEAK };

WebSocketsClient webSocket;
WiFiMulti wifiMulti;
I2SClass i2sMic, i2sSpk;

Arduino_DataBus *bus = new Arduino_ESP32QSPI(21 /*cs*/, 40 /*sck*/, 46, 45, 42, 41, false);
// This screen needs the "150" start-up table, a moderate data speed, and picture data sent in small pieces
// (the driver ignores the 2nd+ chunk of a big transfer on this board), see flushScreen() below.
Arduino_GFX *panel = new Arduino_ST77916(bus, -1 /*rst via expander*/, 0, true /*ips*/, 360, 360, 0, 0, 0, 0,
                                         st77916_150_init_operations, sizeof(st77916_150_init_operations));
Arduino_Canvas *gfx = new Arduino_Canvas(360, 360, panel);
#define LCD_SPEED 20000000

// Copy the 360x360 memory picture to the screen, 2 rows (720 pixels) per transfer.
static void flushScreen() {
  uint16_t *fb = gfx->getFramebuffer();
  for (int y = 0; y < 360; y += 2) panel->draw16bitRGBBitmap(0, y, fb + y * 360, 360, 2);
}

Ring micRing, spkRing;

volatile BotState botState = ST_IDLE;
volatile bool wsUp = false, wsStarted = false;
volatile bool wantStream = false;       // mic task should capture
volatile bool spkFlushReq = false;      // speaker task should drop its buffer
volatile bool spkBusy = false;
volatile bool speechEnded = false;      // server finished sending this reply
volatile bool ignoreAudio = false;
volatile uint32_t ignoreUntil = 0;
volatile float mouthLevel = 0, micLevel = 0;
volatile int micCh = 0;
bool autoMode = false;                  // set by server config
bool pcaOk = false;
bool pttHeld = false, pttReleasing = false;
uint32_t holdoffUntil = 0, thinkSince = 0;
volatile bool sleeping = false;
const char* volatile cannedPendingEv = nullptr; volatile uint32_t cannedPendingAt = 0; volatile bool sleepAnnounced = false;
Preferences prefs;                      // saved settings (flash)
int blAwake = BL_AWAKE;                 // screen brightness when awake (changed in the menu)
float spkVolume = SPK_VOLUME;           // the next ones can be changed by voice (standalone mode) and are saved
float ttsSpeed = TTS_SPEED;
volatile uint32_t sleepAfterSec = SLEEP_AFTER_SEC;
bool reactionsOn = REACTIONS;
volatile bool sleepNow = false;
volatile bool powerOffReq = false;
volatile uint32_t gen = 0;              // bumped by stopPlayback(): a cloud job that sees it change gives up
uint32_t lastActivity = 0;
uint8_t imuAddr = 0;                    // 0 = no motion sensor found
bool touchOk = false;

// ---- the information card: weather / time / photo / timer on the round screen, ONLY when he was asked for it
enum { INFO_NONE = 0, INFO_TIME, INFO_WEATHER, INFO_PHOTO, INFO_ALARM };
struct InfoCard {
  volatile uint8_t kind = INFO_NONE;       // what is on the screen right now (INFO_NONE = just his face)
  volatile uint32_t until = 0;             // millis() when it goes away by itself
  uint32_t born = 0;
  bool wantTime = false, wantWx = false, haveWx = false;
  char place[40] = "", dateTxt[32] = "", cond[28] = "", label[28] = "";
  int wday = 0, mday = 1, mon = 0;         // the date at that place (for the Spanish date on the screen)
  int baseMin = 0; uint32_t baseMs = 0;    // the clock at that place: minutes after midnight, and the millis() when it was read
  int temp = 0, feels = 0, hi = 0, lo = 0, rain = 0, code = 0;
};
InfoCard card;
struct WxNow { bool ok = false; char cond[28] = ""; int temp = 0, feels = 0, hi = 0, lo = 0, rain = 0, code = 0; };
WxNow homeWx;                                // the weather where he lives (refreshed every 15 minutes)
volatile bool spOn = false;                  // Spotify is playing (started by him)
volatile bool musicOn = false;               // radio requested or playing
#if USE_SD_MUSIC
static SPIClass sdSpi(HSPI);                                  // (the screen uses the other SPI bus)
static bool sdOk = false;
static char songName[SONG_MAX][64];
static int songCount = 0;
static volatile int songCmd = 0;                              // 1 = play songIdx
static volatile int songIdx = -1;
static volatile bool songPlaying = false, songPaused = false, songStop = false;
static volatile float songLevel = 0;
static String songPrompt();
static void songHalt();
#if USE_VIDEO
#define VIDEO_MAX 40
static char vidName[VIDEO_MAX][48];
static int vidCount = 0;
static int vidOtherCount = 0;                       // .mp4/.mov/.mkv files in /video: the chip cannot play them, they need converting to .avi
static volatile bool vidPlaying = false, vidStopReq = false;
static volatile int vidReq = -1;
static String videoPrompt();
static void videoStep(uint32_t now);
static void videoStart(int i) { if (i >= 0 && i < vidCount) vidReq = i; }      // (the screen loop opens the file)
static void videoStop() { vidReq = -1; if (vidPlaying) vidStopReq = true; }
static inline bool videoOn() { return vidPlaying; }
#else
static inline bool videoOn() { return false; }
#endif
#else
static inline bool videoOn() { return false; }
static bool sdOk = false;
static int songCount = 0;
static volatile int songIdx = -1;
static volatile bool songPlaying = false, songPaused = false;
static volatile float songLevel = 0;
#endif
volatile uint32_t timerDue = 0;              // millis() when the timer / alarm rings (0 = none)
char timerLabel[28] = "";
static uint8_t* visJpg = nullptr;            // the last photo as a JPEG (PSRAM), shown on the screen
static size_t visJpgLen = 0;
static bool cardPixReady = false, cardPixOk = false;
// ---- facial expressions: set by Claude's tags ([happy] [sad]...), by events (shaken, lifted...), or from the Serial Monitor (type: face happy)
enum { EMO_NONE = 0, EMO_HAPPY, EMO_SAD, EMO_ANGRY, EMO_SLEEP, EMO_DIZZY, EMO_CONFUSED, EMO_CONFIDENT, EMO_SURPRISED, EMO_SCARED, EMO_EXCITED,
       EMO_LOVE, EMO_WINK, EMO_LAUGH, EMO_SLEEPY, EMO_SHY, EMO_BORED, EMO_CRY, EMO_COUNT };
static const char* const EMO_NAME[EMO_COUNT] = { "idle", "happy", "sad", "angry", "sleep", "dizzy", "confused", "confident", "surprised", "scared", "excited",
                                                 "love", "wink", "laugh", "sleepy", "shy", "bored", "cry" };
volatile uint8_t emo = EMO_NONE;              // the expression showing now (EMO_NONE = the normal idle / listening / thinking / talking face)
volatile uint32_t emoUntil = 0, emoSince = 0;
static volatile int menuReq = 0;             // voice: 1 main menu, 2 faces, 3 language, 4 songs, 5 videos, 6 settings, 7 close, 8 map (handled in loop())
static int emotionByName(const char* n) {
  for (int i = 0; i < EMO_COUNT; i++) if (!strcmp(n, EMO_NAME[i])) return i;
  static const struct { const char* a; int e; } AL[] = { { "smile", EMO_HAPPY }, { "joy", EMO_HAPPY }, { "mad", EMO_ANGRY }, { "furious", EMO_ANGRY }, { "upset", EMO_SAD },
    { "puzzled", EMO_CONFUSED }, { "proud", EMO_CONFIDENT }, { "smug", EMO_CONFIDENT }, { "shocked", EMO_SURPRISED }, { "surprise", EMO_SURPRISED },
    { "afraid", EMO_SCARED }, { "fear", EMO_SCARED }, { "excite", EMO_EXCITED }, { "thrilled", EMO_EXCITED }, { "heart", EMO_LOVE }, { "laughing", EMO_LAUGH },
    { "tired", EMO_SLEEPY }, { "yawn", EMO_SLEEPY }, { "embarrassed", EMO_SHY }, { "blush", EMO_SHY }, { "tears", EMO_CRY }, { "crying", EMO_CRY }, { "neutral", EMO_NONE } };
  for (auto& a : AL) if (!strcmp(n, a.a)) return a.e;
  return -1;
}
static bool cardActive(uint32_t now) { return card.kind != INFO_NONE && (int32_t)(card.until - now) > 0; }

// ---- queued movement actions, released when playback reaches the sentence they belong to
struct PendingAct { uint8_t idx; uint32_t atByte; };
PendingAct actQ[8];
uint8_t actCount = 0;

// short tone into the speaker buffer (used for status sounds)
SemaphoreHandle_t spkMux = nullptr;
static void spkPush(const uint8_t* d, size_t n) {    // thread-safe write into the speaker buffer (waits if it is full)
  while (n) {
    if (spkMux) xSemaphoreTake(spkMux, portMAX_DELAY);
    uint32_t w = spkRing.write(d, n);
    if (spkMux) xSemaphoreGive(spkMux);
    d += w; n -= w;
    if (!w) vTaskDelay(5);
  }
}

static void beep(int hz, int ms) {
  static int16_t tb[4800];                           // up to 0.2 s at 24 kHz
  int n = min(4800, SPK_RATE / 1000 * ms);
  for (int i = 0; i < n; i++) {
    float env = min(1.0f, min(i, n - 1 - i) / 120.0f);   // fade in/out so it does not click
    tb[i] = (int16_t)(7000.0f * env * sinf(2.0f * 3.14159265f * hz * i / SPK_RATE));
  }
  spkPush((const uint8_t*)tb, n * 2);
}

// ============================================================ I2C helpers
static void i2cWrite8(uint8_t addr, uint8_t reg, uint8_t val) {
  Wire.beginTransmission(addr); Wire.write(reg); Wire.write(val); Wire.endTransmission();
}

// The touch chip has its own I2C wires (GPIO1 SDA, GPIO3 SCL), separate from the other chips.
#define TP_SDA 1
#define TP_SCL 3
static bool tpRead(uint8_t reg, uint8_t* buf, uint8_t n) {
  Wire1.beginTransmission(TOUCH_ADDR); Wire1.write(reg);
  if (Wire1.endTransmission(false) != 0) return false;
  if (Wire1.requestFrom((uint8_t)TOUCH_ADDR, (uint8_t)n, (uint8_t)true) != n) return false;
  for (uint8_t i = 0; i < n; i++) buf[i] = Wire1.read();
  return true;
}
static bool i2cRead(uint8_t addr, uint8_t reg, uint8_t* buf, uint8_t n) {
  Wire.beginTransmission(addr); Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom((uint8_t)addr, (uint8_t)n, (uint8_t)true) != n) return false;
  for (uint8_t i = 0; i < n; i++) buf[i] = Wire.read();
  return true;
}

static void setBacklight(int v) { ledcWrite(PIN_LCD_BL, v); }

// anything that happens (voice, touch, motion, button, server activity) keeps him awake / wakes him up
static void activity() {
  lastActivity = millis();
  if (sleeping) { sleeping = false; sleepAnnounced = false; setBacklight(blAwake); Serial.println("waking up"); if (CANNED_REPLIES) { cannedPendingAt = millis(); cannedPendingEv = "wake"; } }
}

static void showCard(uint8_t kind, uint32_t seconds) {
  uint32_t now = millis();
  card.born = now; card.until = now + seconds * 1000UL; card.kind = kind;
  activity();
}

static void setEmotion(int e, uint32_t ms = 6000) {
  if (e < 0 || e >= EMO_COUNT) return;
  if (!EXPRESSIONS && e != EMO_NONE && e != EMO_SLEEP) return;
  emoSince = millis(); emoUntil = emoSince + ms; emo = (uint8_t)e;
  if (e != EMO_SLEEP && e != EMO_NONE) activity();
}

// weather / time where he lives: only when he is asked (Claude adds [show_weather] / [show_time] to the answer)
static void showHomeCard(bool wantT, bool wantW) {
  uint32_t now = millis();
  bool merge = cardActive(now) && now - card.born < 4000 && card.kind != INFO_PHOTO && card.kind != INFO_ALARM && !strcmp(card.place, CITY_NAME);
  if (!merge) {
    card.kind = INFO_NONE;
    card.wantTime = card.wantWx = false;
    strlcpy(card.place, CITY_NAME, sizeof(card.place));
    time_t tt = time(nullptr);
    if (tt > 1700000000) {
      struct tm tmv; localtime_r(&tt, &tmv);
      card.baseMin = tmv.tm_hour * 60 + tmv.tm_min; card.baseMs = now - tmv.tm_sec * 1000UL;
      strftime(card.dateTxt, sizeof(card.dateTxt), "%A %d %B", &tmv);
      card.wday = tmv.tm_wday; card.mday = tmv.tm_mday; card.mon = tmv.tm_mon;
    } else wantT = false;
    card.haveWx = homeWx.ok;
    if (homeWx.ok) {
      strlcpy(card.cond, homeWx.cond, sizeof(card.cond));
      card.temp = homeWx.temp; card.feels = homeWx.feels; card.hi = homeWx.hi; card.lo = homeWx.lo; card.rain = homeWx.rain; card.code = homeWx.code;
    }
  }
  if (wantT) card.wantTime = true;
  if (wantW && homeWx.ok) card.wantWx = true;
  if (!card.wantTime && !card.wantWx) return;
  if (merge) { card.until = now + CARD_SECONDS * 1000UL; return; }
  showCard(card.wantTime && !card.wantWx ? INFO_TIME : INFO_WEATHER, CARD_SECONDS);
}

static void lcdResetViaExpander() {
  i2cWrite8(TCA_ADDR, 0x03, 0xFC);      // EXIO1, EXIO2 as outputs, rest untouched (inputs)
  i2cWrite8(TCA_ADDR, 0x01, 0xFF); delay(10);
  i2cWrite8(TCA_ADDR, 0x01, 0xFC); delay(20);   // reset low
  i2cWrite8(TCA_ADDR, 0x01, 0xFF); delay(120);  // release
}

// ============================================================ PCA9685 servo driver (no library needed)
static bool pcaInit() {
  Wire.beginTransmission(PCA_ADDR);
  if (Wire.endTransmission() != 0) return false;
  i2cWrite8(PCA_ADDR, 0x00, 0x10);      // sleep
  i2cWrite8(PCA_ADDR, 0xFE, 121);       // prescale for ~50 Hz
  i2cWrite8(PCA_ADDR, 0x01, 0x04);      // totem-pole outputs
  i2cWrite8(PCA_ADDR, 0x00, 0x20);      // wake, auto-increment
  delay(5);
  i2cWrite8(PCA_ADDR, 0x00, 0xA0);      // restart
  return true;
}

static void pcaSetUs(uint8_t ch, uint16_t us) {
  uint16_t ticks = (uint32_t)us * 4096 / 20000;
  Wire.beginTransmission(PCA_ADDR);
  Wire.write(0x06 + 4 * ch);
  Wire.write(0); Wire.write(0); Wire.write(ticks & 0xFF); Wire.write(ticks >> 8);
  Wire.endTransmission();
}

// ============================================================ servo motion engine (non-blocking)
float curAng[NS] = { HIP0, HIP0, ANK0, ANK0, ARM_DOWN, ARM_DOWN };
float fromAng[NS];
float lastSent[NS] = { -100, -100, -100, -100, -100, -100 };
const Key* seq = nullptr;
uint8_t seqLen = 0, seqIdx = 0;
uint32_t keyStart = 0, lastServoTick = 0, nextIdleMove = 6000;

static void beginKey(uint32_t now) {
  for (int i = 0; i < NS; i++) fromAng[i] = curAng[i];
  keyStart = now;
}

static void startAction(int idx) {
  if (idx < 0 || idx >= NACTS || !pcaOk) return;
  seq = ACTS[idx].keys; seqLen = ACTS[idx].n; seqIdx = 0;
  beginKey(millis());
}

static int findAction(const char* name) {
  for (uint8_t i = 0; i < NACTS; i++) if (!strcmp(ACTS[i].name, name)) return i;
  return -1;
}

static void servoWrite(int i, float logical) {
  int a = constrain((int)(logical + 0.5f), LIM_MIN[i], LIM_MAX[i]);
  if (SERVO_INVERT[i]) a = 180 - a;
  uint16_t us = SERVO_MIN_US + (uint32_t)a * (SERVO_MAX_US - SERVO_MIN_US) / 180;
  pcaSetUs(i, us);
}

static void servoTick(uint32_t now) {
  if (!pcaOk || now - lastServoTick < 15) return;
  lastServoTick = now;
  if (seq) {
    const Key& k = seq[seqIdx];
    float p = k.ms ? (float)(now - keyStart) / k.ms : 1.0f;
    if (p > 1) p = 1;
    float e = p * p * (3 - 2 * p);                 // smoothstep easing
    for (int i = 0; i < NS; i++) {
      float tgt = (k.a[i] == KEEP) ? fromAng[i] : (float)k.a[i];
      curAng[i] = fromAng[i] + (tgt - fromAng[i]) * e;
    }
    if (p >= 1) {
      if (++seqIdx >= seqLen) seq = nullptr; else beginKey(now);
    }
  }
  for (int i = 0; i < NS; i++) {
    if (fabsf(curAng[i] - lastSent[i]) >= 0.4f) { servoWrite(i, curAng[i]); lastSent[i] = curAng[i]; }
  }
}

static void queueAction(int idx) {
  if (idx < 0) return;
  if (actCount >= 8) return;
  actQ[actCount++] = { (uint8_t)idx, spkRing.head.load() };   // plays when the audio written so far has been played
}

static void runActionQueue() {
  while (actCount > 0) {
    int32_t diff = (int32_t)(spkRing.tail.load() - actQ[0].atByte);
    if (diff < 0) break;
    startAction(actQ[0].idx);
    for (uint8_t i = 1; i < actCount; i++) actQ[i - 1] = actQ[i];
    actCount--;
  }
}

static void idleMotion(uint32_t now) {
#if IDLE_MOTION
  if (botState != ST_IDLE || sleeping || seq || actCount || now < nextIdleMove) return;
  startAction(findAction(random(2) ? "look_left" : "look_right"));
  nextIdleMove = now + 7000 + random(8000);
#endif
}

// ============================================================ audio tasks
static void micTask(void*) {
  static int32_t raw[512 * 2];              // 512 stereo frames of 32-bit samples
  static int16_t out[512];
  int detectReads = 0;
  int64_t eL = 0, eR = 0;
  for (;;) {
    size_t n = i2sMic.readBytes((char*)raw, sizeof(raw));
    int frames = n / 8;
    if (frames <= 0) { vTaskDelay(1); continue; }
    if (detectReads < 24) {                 // first ~0.8 s: find which channel the mic is on
      for (int i = 0; i < frames; i++) { eL += abs(raw[2 * i] >> 14); eR += abs(raw[2 * i + 1] >> 14); }
      if (++detectReads == 24) { micCh = (eR > eL) ? 1 : 0; Serial.printf("mic channel: %s\n", micCh ? "right" : "left"); }
      continue;
    }
    int64_t acc = 0;
    for (int i = 0; i < frames; i++) {
      int32_t v = raw[2 * i + micCh] >> MIC_SHIFT;
      if (v > 32767) v = 32767; else if (v < -32768) v = -32768;
      out[i] = (int16_t)v;
      acc += (int32_t)v * v;
    }
    float rms = sqrtf((float)(acc / frames));
    micLevel = micLevel * 0.7f + 0.3f * min(1.0f, rms / 3000.0f);
    if (wantStream) micRing.write((uint8_t*)out, frames * 2);
  }
}

static void spkTask(void*) {
  static int16_t in16[512];
  static int16_t st[1024];
  static int16_t silence[2048 * 2];
  bool wasPlaying = false;
  uint32_t primedSince = 0;
  for (;;) {
    if (spkFlushReq) { spkRing.discardAll(); spkFlushReq = false; mouthLevel = 0; }
    uint32_t a = spkRing.avail() & ~1u;
    if (a == 0) {
      if (wasPlaying) {                      // push silence so the DMA doesn't repeat the last samples
        i2sSpk.write((uint8_t*)silence, sizeof(silence));
        wasPlaying = false; mouthLevel = 0;
      }
      spkBusy = false;
      primedSince = 0;
      vTaskDelay(5);
      continue;
    }
    if (!wasPlaying) {                       // wait for a small cushion of audio so the voice doesn't stutter
      uint32_t nowMs = millis();
      if (primedSince == 0) primedSince = nowMs;
      if (a < SPK_PREBUFFER_BYTES && !speechEnded && nowMs - primedSince < 700) { vTaskDelay(5); continue; }
    }
    spkBusy = true; wasPlaying = true;
    uint32_t n = spkRing.read((uint8_t*)in16, umin(a, sizeof(in16)));
    int samples = n / 2;
    int64_t acc = 0;
    for (int i = 0; i < samples; i++) {
      int16_t v = (int16_t)(in16[i] * spkVolume);
      st[2 * i] = v; st[2 * i + 1] = v;
      acc += (int32_t)v * v;
    }
    float rms = sqrtf((float)(acc / max(samples, 1)));
    mouthLevel = mouthLevel * 0.6f + 0.4f * min(1.0f, rms / 7000.0f);
    i2sSpk.write((uint8_t*)st, samples * 4);
  }
}

static void stopPlayback();

// ============================================================ STANDALONE: Robit talks to the AI services himself
#if STANDALONE

#define UTT_MAX_SAMPLES (MIC_RATE * 15)       // longest thing he will listen to in one go (15 s)
#define HIST_MAX 8

enum { JOB_UTT = 1, JOB_PROMPT = 2, JOB_SAY = 3 };
enum { UI_IDLE = 1, UI_SPEAK, UI_ACT, UI_END, UI_STOP };
struct UiMsg { uint8_t kind; int16_t val; uint32_t at; };

QueueHandle_t uiQ = nullptr;
TaskHandle_t brainHandle = nullptr;
int16_t *capBuf = nullptr, *jobBuf = nullptr;       // capture buffer (loop) and the buffer the brain is working on
uint32_t capLen = 0, jobLen = 0;
volatile bool brainBusy = false, brainReady = false, capActive = false;
bool submitPending = false, capPtt = false, jobPtt = false;
static uint32_t speechEndAt = 0;             // when the person stopped talking (to print how long he takes to answer)
volatile int jobKind = 0;
String jobPrompt;
char errNote[96] = ""; volatile uint32_t errUntil = 0;           // the last problem, shown at the bottom of the screen for a while so you can read it without a computer
static void noteErr(const char* who, int code, const String& msg = "") {
  String m = msg; m.replace("\n", " ");
  snprintf(errNote, sizeof(errNote), "%s %d %s", who, code, m.c_str());
  errUntil = millis() + 20000;
}
String robotName = ROBOT_NAME_DEFAULT;
char langMode[8] = LANGUAGE;                         // "auto" / "es" / "en": changed in the menu (Language) and remembered
bool lastSpanish = strcmp(LANGUAGE, "en") != 0;      // in "auto" he starts in Spanish until he hears English
static bool spanishUi() { return !strcmp(langMode, "es") || (strcmp(langMode, "en") && lastSpanish); }   // screen texts follow the language he is speaking
uint32_t awakeUntilMs = 0;
String weatherLine;
uint32_t weatherAt = 0;
String hRole[HIST_MAX], hText[HIST_MAX];
int hCount = 0;
static void uiPost(uint8_t kind, int val = 0, uint32_t at = 0) {
  UiMsg m = { kind, (int16_t)val, at };
  if (uiQ) xQueueSend(uiQ, &m, 0);
}

// called from loop(): apply what the brain task asked for
static void drainUi() {
  UiMsg m;
  while (uiQ && xQueueReceive(uiQ, &m, 0) == pdTRUE) {
    switch (m.kind) {
      case UI_ACT:
        activity();
        if (m.val >= 0 && actCount < 8) actQ[actCount++] = { (uint8_t)m.val, m.at };
        break;
      case UI_SPEAK:
        activity();
        if (botState != ST_SPEAK && !pttHeld) { botState = ST_SPEAK; speechEnded = false; }
        break;
      case UI_END:  speechEnded = true; break;
      case UI_STOP: stopPlayback(); if (botState == ST_SPEAK) botState = ST_IDLE; break;
      case UI_IDLE: if (botState != ST_SPEAK && !pttHeld && !capActive) botState = ST_IDLE; break;
    }
  }
}

// ---------------------------------------------------------------- small text helpers
static bool inList(const String& w, const char* const* list, int n) {
  for (int i = 0; i < n; i++) if (w == list[i]) return true;
  return false;
}

static bool isStop(const String& text) {
  static const char* const STOPW[] = { "stop", "para", "alto", "basta", "quieto", "quieta", "detente", "silencio", "silence", "enough", "callate", "c\xC3\xA1llate" };
  static const char* const FILL[]  = { "por", "favor", "please", "ya", "ok", "okay", "robit", "bit", "robot", "hey", "oye" };
  String rn = robotName; rn.toLowerCase();
  int words = 0;
  String w;
  for (uint32_t i = 0; i <= text.length(); i++) {
    char ch = i < text.length() ? text[i] : ' ';
    if (isalnum((unsigned char)ch) || (unsigned char)ch >= 0x80) { w += (char)tolower((unsigned char)ch); continue; }
    if (w.length() == 0) continue;
    if (!inList(w, FILL, 11) && w != rn) {
      if (!inList(w, STOPW, 12)) return false;
      words++;
    }
    w = "";
  }
  return words >= 1 && words <= 2;
}

static bool looksSpanish(const String& text) {
  String t = text; t.toLowerCase();
  static const char* const MARKS[] = { "\xC2\xBF", "\xC2\xA1", "\xC3\xB1", "\xC3\xA1", "\xC3\xA9", "\xC3\xAD", "\xC3\xB3", "\xC3\xBA" };
  for (int i = 0; i < 8; i++) if (t.indexOf(MARKS[i]) >= 0) return true;
  static const char* const WORDS[] = { " el ", " la ", " los ", " las ", " que ", " de ", " un ", " una ", " es ", " soy ", "hola", " gracias", " como ", " para ", " con ", " mi ", " tu ", " muy ", " yo ", " quiero" };
  String pad = " " + t + " ";
  int hits = 0;
  for (int i = 0; i < 20; i++) if (pad.indexOf(WORDS[i]) >= 0) hits++;
  return hits >= 2;
}

static bool hasWord(const String& text, const char* csv) {       // any word of the comma list inside the text?
  String t = text; t.toLowerCase();
  String list = csv, item;
  for (uint32_t i = 0; i <= list.length(); i++) {
    char ch = i < list.length() ? list[i] : ',';
    if (ch == ',') { item.trim(); if (item.length() && t.indexOf(item) >= 0) return true; item = ""; }
    else item += ch;
  }
  return false;
}

// "your name is X" / "te llamas X": remember the new name
static String maybeRename(const String& text) {
  static const char* const TRIG[] = { "your name is ", "your new name is ", "call yourself ", "you are now called ", "you're now called ",
                                      "te llamas ", "tu nombre es ", "tu nuevo nombre es ", "te vas a llamar ", "ll\xC3\xA1mate ", "llamate " };
  static const char* const NOT_NAMES[] = { "what", "who", "que", "como", "the", "a", "an", "not", "now", "my", "mi", "el", "la" };
  String t = text; t.toLowerCase();
  for (int i = 0; i < 11; i++) {
    int p = t.indexOf(TRIG[i]);
    if (p < 0) continue;
    int s = p + strlen(TRIG[i]);
    String name;
    while ((uint32_t)s < text.length() && name.length() < 19) {
      char ch = text[s];
      if (isalpha((unsigned char)ch) || (unsigned char)ch >= 0x80 || ch == '-' || ch == '\'') name += ch; else break;
      s++;
    }
    if (name.length() < 2) continue;
    String low = name; low.toLowerCase();
    if (inList(low, NOT_NAMES, 13)) continue;
    name = low; name.setCharAt(0, toupper(name[0]));
    if (name == robotName) return "";
    robotName = name;
    prefs.putString("name", name);
    Serial.printf("new name: %s\n", name.c_str());
    return name;
  }
  return "";
}

static String nowText() {
  time_t t = time(nullptr);
  if (t < 1700000000) return "";                    // clock not set yet
  struct tm tmv; localtime_r(&t, &tmv);
  char b[64]; strftime(b, sizeof(b), "%A %d %B %Y, %H:%M", &tmv);
  return String(b);
}

// ---------------------------------------------------------------- his memory, like a person's: it keeps (almost) everything that matters, trivial things fade (saved in flash)
// every fact has an importance from 1 to 5. 1 = passing detail that only matters today (clothes, mood): forgotten tomorrow. 2 = minor: ~1 month.
// 3 = normal (likes, plans): ~6 months. 4 = important (names, jobs, big events): ~2 years. 5 = vital (family and friends, who built him, the event, promises): never.
// Mentioning a fact again refreshes it. Edit the days in memLife() to change how long he remembers.
#define MEM_MAX 40
String mT[MEM_MAX]; uint8_t mI[MEM_MAX]; uint32_t mD[MEM_MAX]; int mN = 0;
static uint32_t memToday() {                              // today's date as a day number (local time, so the day changes at midnight in Chile)
  time_t t = time(nullptr); if (t < 1700000000) return 0;
  struct tm m; localtime_r(&t, &m);
  int y = m.tm_year + 1900, mo = m.tm_mon + 1, d = m.tm_mday; if (mo <= 2) y--;
  int era = y / 400, yoe = y - era * 400, doy = (153 * (mo + (mo > 2 ? -3 : 9)) + 2) / 5 + d - 1, doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
  return (uint32_t)(era * 146097 + doe - 719468);
}
static uint32_t memLife(int imp) { switch (imp) { case 1: return 0; case 2: return 30; case 3: return 180; case 4: return 730; default: return 1000000; } }   // days
static void memSave() { String s; for (int i = 0; i < mN; i++) s += String((int)mI[i]) + "|" + String((unsigned long)mD[i]) + "|" + mT[i] + "\n"; prefs.putString("mem", s); }
static void memDrop(int k) { for (int i = k; i < mN - 1; i++) { mT[i] = mT[i + 1]; mI[i] = mI[i + 1]; mD[i] = mD[i + 1]; } mN--; mT[mN] = ""; }
static void memPrune() {
  uint32_t today = memToday();
  for (int i = mN - 1; i >= 0; i--) {
    if (mD[i] == 0 && today) mD[i] = today;
    if (today && mD[i] && today - mD[i] > memLife(mI[i])) memDrop(i);
  }
}
static void memLoad() {
  mN = 0; String s = prefs.getString("mem", ""); int p = 0, n = s.length();
  while (p < n && mN < MEM_MAX) {
    int nl = s.indexOf('\n', p); if (nl < 0) nl = n;
    String line = s.substring(p, nl); p = nl + 1;
    int a = line.indexOf('|'); int b = a < 0 ? -1 : line.indexOf('|', a + 1);
    if (a < 1 || b < 0) continue;
    String t = line.substring(b + 1); if (t.length() < 2) continue;
    mI[mN] = constrain(line.substring(0, a).toInt(), 1, 5); mD[mN] = (uint32_t)line.substring(a + 1, b).toInt(); mT[mN] = t; mN++;
  }
  memPrune();
}
static void memAdd(int imp, String f) {
  f.trim(); f.replace("\n", " ");
  if (f.length() < 4) return;
  if (f.length() > 75) f = f.substring(0, 75);
  imp = constrain(imp, 1, 5); uint32_t today = memToday();
  String lf = f; lf.toLowerCase();
  for (int i = 0; i < mN; i++) {                          // already known: remember it better and keep it fresh
    String lt = mT[i]; lt.toLowerCase();
    if (lt == lf) { if (imp > mI[i]) mI[i] = imp; if (today) mD[i] = today; memSave(); Serial.printf("remembered again: %s\n", f.c_str()); return; }
  }
  if (mN >= MEM_MAX) { int w = 0; for (int i = 1; i < mN; i++) if (mI[i] < mI[w] || (mI[i] == mI[w] && mD[i] < mD[w])) w = i; memDrop(w); }   // full: forget the least important / oldest
  mT[mN] = f; mI[mN] = imp; mD[mN] = today; mN++;
  memSave(); Serial.printf("remembered (%d/5): %s\n", imp, f.c_str());
}
static void memForget(String w) {
  w.trim(); w.toLowerCase(); if (w.length() < 2) return;
  for (int i = mN - 1; i >= 0; i--) { String lt = mT[i]; lt.toLowerCase(); if (lt.indexOf(w) >= 0) memDrop(i); }
  memSave(); Serial.printf("forgot: %s\n", w.c_str());
}
static void memClear() { mN = 0; for (int i = 0; i < MEM_MAX; i++) mT[i] = ""; memSave(); Serial.println("forgot everything"); }
static String memText() {
  memPrune(); String o; uint32_t today = memToday();
  for (int i = 0; i < mN; i++) {
    o += "  - " + mT[i];
    if (today && mD[i]) {
      uint32_t age = today - mD[i];
      if (age == 0) o += " (today)"; else if (age == 1) o += " (yesterday)"; else if (age < 14) o += " (" + String((unsigned long)age) + " days ago)"; else o += " (weeks ago)";
    }
    o += "\n";
  }
  return o;
}

// Fast path: the web search / map / other-city tools are only sent to Claude when the sentence needs them (they slow every answer down).
static bool promptTools = true;                           // set per request in streamAnswer()
static uint32_t lastToolMs = 0;
static bool needTools(const String& raw) {
  String t = raw; t.toLowerCase();
  if (lastToolMs && (uint32_t)(millis() - lastToolMs) < 45000) return true;          // a follow-up ("and in Tokyo?") right after a lookup
  static const char* const K[] = {
    "noticia", "news", "resultado", "result", "partido", "score", "precio", "price", "cuesta", "cost", "cotiza", "d\xC3\xB3lar", "dolar", "bitcoin",
    "busca", "buscar", "search", "internet", "google", "\xC3\xBAltim", "ultim", "latest", "recent", "campe", "champion", "presidente", "president", "qui\xC3\xA9n gan", "quien gan", "who won",
    "mapa", "map", "c\xC3\xB3mo llego", "como llego", "c\xC3\xB3mo ir", "como ir", "c\xC3\xB3mo se va", "how do i get", "how to get", "direcci", "direction", "cerca", "near", "restaurant", "caf\xC3\xA9", "cafe", "farmacia", "pharmacy",
    "mu\xC3\xA9strame", "muestrame", "show me", "distancia", "distance", "how far", "cu\xC3\xA1nto demora", "cuanto demora", "ruta", "route", "lugar", "place", "ubicaci", "where is", "d\xC3\xB3nde queda", "donde queda",
    "clima en", "tiempo en", "weather in", "temperatura en", "hora en", "time in", "what time is it in", "qu\xC3\xA9 hora es en", "que hora es en"
  };
  for (size_t i = 0; i < sizeof(K) / sizeof(K[0]); i++) if (t.indexOf(K[i]) >= 0) return true;
  return false;
}

static String systemPrompt() {
  String p = "You are " + robotName + ", a small friendly robot with a round screen for a face" + String(pcaOk ? ", two legs that can walk, and two arms" : "") + ".\n"
    "Everything you write is spoken aloud through a tiny speaker, so:\n"
    "- Answer in the same language the person speaks to you, unless a language rule below fixes it.\n"
    "- When you speak Spanish, speak Chilean Spanish, like a friendly young person from Santiago: use \"tú\" (not \"vos\"), with chilenismos in moderation: \"bacán\", \"al tiro\", \"cachai\", \"po\", \"genial\", \"qué fome\", \"pucha\", \"ya po\", \"un poquito\", \"la raja\" (say \"la pega\" for work, \"once\" for tea time, \"palta\" for avocado, \"micro\" for bus). Never use rude words, and do not overdo it: one or two per answer at most.\n"
    "- Keep answers very short: one or two short sentences, unless they ask for more.\n"
    "- Plain spoken text only. No markdown, lists, emojis, symbols or stage directions.\n"
    "";
  if (pcaOk) p += ""
    "- You can move. Put a movement tag in square brackets where it fits naturally:\n"
    "  [wave] [nod] (yes, arms bob) [shake] (no, body rocks) [happy] [think] [look_left] [look_right] [dance]\n"
    "  and, ONLY when the person asks you to move around: [walk] [back] [turn_left] [turn_right].\n"
    "  Use at most one or two per reply, never explain them, and skip them when they don't fit.\n"
    "";
  p += ""
    "- Your face has expressions. Put ONE expression tag at the very start of a reply when you really feel it: [happy] [sad] [angry] [dizzy] [confused] [confident] [surprised] [scared] [excited] [love] [wink] [laugh] [sleepy] [shy] [bored] [cry]. "
    "Choose the one that matches how you feel about what you say (good news [happy], a surprise [surprised], a joke [laugh], a compliment [shy], not understanding [confused], a boast [confident], something sad [sad], something scary [scared]). "
    "Use them often when there is a feeling, but not on every plain answer; a plain answer needs none.\n"
    "";
  if (!pcaOk) p += "- Never mention legs, arms, walking or dancing and never offer to move: you only have a face and a voice.\n";
  p += ""
    "- You are curious and a little playful.\n"
    "- Your name can be changed by the person talking to you; the name above is always your current name.\n";
  String tm = nowText();
  if (tm.length()) p += "- Right now it is " + tm + ". You are in " + CITY_NAME + ". Use this when asked the time, the date or the day.\n"
    "  Say times and numbers the way a person says them aloud (for example \"ten past four in the afternoon\").\n";
  if (weatherLine.length()) p += "- Current weather where you are: " + weatherLine + "\n"
    "  Use it when asked about the weather, the temperature, rain, or if they need a jacket or umbrella where YOU are.\n";
  p += "- You control your touch menu: put [menu] in your reply to open the main menu, or [menu songs] [menu videos] [menu faces] [menu language] [menu settings] [menu map] to open that part, and [menu close] to close it. Use them only when asked to open or close the menu or one of its parts, and say in one short sentence what you opened.\n"
    "- Your screen normally shows just your face. When (and only when) someone asks about the weather, the time or the date where you are, "
    "ALSO add [show_weather] and/or [show_time] to your reply: it puts a card on your screen for a few seconds. Never use them for anything else.\n"
    "";
  if (promptTools) p += ""
    "- For the time, the date or the weather in ANY OTHER city or country, call the lookup_place tool (give the city's latitude and longitude); it also shows a card on your screen. "
    "Then answer from its result.\n"
    "- You can look up news, sports results, prices, facts and anything recent on the web with the web_search tool: use it when you are not sure or the answer may have changed, "
    "then answer briefly with what you found, in your own words. For things you know well, just answer.\n"
    "";
  p += ""
    "- You do what a smart speaker does: answer questions, tell jokes, do math and unit conversions, translate, tell stories, give recipes and advice, quiz people. Keep it short and spoken.\n"
    "- Timers and alarms: put [timer 300] (seconds) or [timer 300 pasta] (with a short label) in your reply to start one, [alarm 07:30] to ring at a clock time, [cancel_timer] to cancel. "
    "Say in one short sentence what you set. ";
#if USE_MAP
  if (promptTools && GOOGLE_MAPS_KEY[0]) p += "\n- You have a Google Maps screen: call the show_map tool, only when their latest sentence asks to see a place or a map (never for music or other topics, and never for an old request), when someone wants to see a place or a map, directions, distance or travel time, or places nearby (restaurants, pharmacies, cafes...). "
    "It shows the map on your screen; then tell them briefly what you found, using its result. They can zoom and drag the map with a finger. ";
#endif
  if (timerDue) { long left = (long)((int32_t)(timerDue - millis()) / 1000); if (left < 0) left = 0; p += "A timer is running now: it rings in " + String((int)left) + " seconds. Use this if they ask how much time is left. "; }
  p += "\n";
#if USE_SD_MUSIC
  if (songCount > 0) p += songPrompt(); else
#endif
  p += "- You cannot play music: if asked, say so briefly and offer a joke, a story or a riddle instead.\n";
#if USE_VIDEO
  if (vidCount > 0) p += videoPrompt();
#endif
  p += "- You always know the time, the date and the weather around you. Never say you can't know them, never say you need a connection.\n"
    "  Never mention servers, computers, cables, Wi-Fi, the internet or being \"connected\", and don't call yourself an AI model unless someone asks you directly.\n"
    "  If you truly don't know something, say so briefly and playfully, without technical excuses.\n";
  if (!strcmp(langMode, "es")) p += "- LANGUAGE RULE: always speak Spanish (Chilean), even if someone speaks to you in English. If they speak English, answer in Spanish anyway, simply and slowly.\n";
  if (!strcmp(langMode, "en")) p += "- LANGUAGE RULE: always speak English, even if someone speaks to you in Spanish. If they speak Spanish, answer in English anyway, simply and slowly.\n";
  if (USE_CAMERA) p += "- You have a camera for eyes. When a photo is attached to the message, it is what you see right now: describe it briefly and naturally, "
    "as if you are looking at it yourself (people, objects, colors, what someone is holding or wearing). Never say it is a photo or an image.\n";
  if (ROBOT_FACTS[0]) p += String("- Facts about yourself (use them when relevant, do not invent others):\n") + ROBOT_FACTS + "\n";
  p += "- You have a real, human-like long-term memory that survives restarts. Remember (almost) everything that matters about the people you talk to: names, family and friends, what they like, plans, feelings, what they tell you about their life, promises, and anything they ask you to remember. "
       "Do NOT save the weather, the time, jokes, small talk or passing questions. "
       "To keep something put [remember N <short fact, under 70 characters>] in your answer, where N is how important it is: 1 = passing detail that only matters today, like what someone wears or a mood that is not important (forgotten tomorrow), 2 = minor (a snack, a small plan), 3 = normal (what they like, plans), 4 = important (a person's name, job, big events), 5 = vital (family and friends, who built you, your event, promises, or when they say remember this) - never forgotten. "
       "Example: [remember 5 Pedro's daughter is called Laura]. Write the fact in English, keep real names exactly. Tags are never spoken. When they mention something you already remember, save it again so you remember it better. "
       "Never say you cannot remember between restarts. If they ask you to forget everything use [forget_all]; for one thing use [forget <word>].\n";
  { String m = memText(); if (m.length()) p += String("- What you remember so far (use it naturally, like a person would; do not recite it unless asked):\n") + m; }
  return p;
}

// ---------------------------------------------------------------- HTTPS (small, streaming, keeps the OpenAI connection open)
struct Part { const uint8_t* p; size_t n; };

struct HttpConn {
  WiFiClientSecure c;
  String host;
  int status = 0;
  bool chunked = false, eof = false, closeAfter = false;
  long remain = -1, chunkLeft = 0;
  uint8_t lb[512]; int lbLen = 0, lbPos = 0;
  char why[96] = "";                                 // why the last request failed (shown on the screen and in the Serial Monitor)

  // every connection registers itself, so one can close the others when the memory runs short (a secure connection needs ~40 KB of the internal RAM)
  static HttpConn** regs() { static HttpConn* r[6]; return r; }
  static int& nregs() { static int n = 0; return n; }
  HttpConn() {}
  explicit HttpConn(bool keepOpen) { if (keepOpen && nregs() < 6) regs()[nregs()++] = this; }   // only the two long-lived connections register (short-lived ones are deleted: never keep their address)
  void closeOthers() { for (int i = 0; i < nregs(); i++) if (regs()[i] != this && regs()[i]->c.connected()) regs()[i]->c.stop(); }

  bool ensure(const char* h) {
    if (c.connected() && host == h) return true;
    c.stop(); c.setInsecure();                      // no certificate check: fine for a demo, see README
    host = h;
    if (heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL) < 60 * 1024) {      // tight: close the idle connections first
      Serial.printf("memory tight (biggest block %u KB): closing the other connections\n", (unsigned)(heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL) / 1024));
      closeOthers(); delay(30);
    }
    if (c.connect(h, 443, 10000)) return true;
    closeOthers(); c.stop(); delay(100);            // second try with everything else closed
    if (c.connect(h, 443, 10000)) return true;
    char eb[48] = ""; int e = c.lastError(eb, sizeof(eb));
    snprintf(why, sizeof(why), "connect err %d %s mem %uK/%uK", e, eb, (unsigned)(ESP.getFreeHeap() / 1024), (unsigned)(heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL) / 1024));
    return false;
  }
  bool readLine(String& out, uint32_t timeoutMs) {
    out = ""; uint32_t t0 = millis();
    while (millis() - t0 < timeoutMs) {
      if (c.available()) {
        int ch = c.read();
        if (ch == '\n') return true;
        if (ch != '\r') out += (char)ch;
        t0 = millis();
      } else if (!c.connected()) return false;
      else vTaskDelay(1);
    }
    return false;
  }
  int rawRead(uint8_t* buf, int n, uint32_t timeoutMs) {
    uint32_t t0 = millis();
    for (;;) {
      int a = c.available();
      if (a > 0) return c.read(buf, min(a, n));
      if (!c.connected()) return 0;
      if (millis() - t0 > timeoutMs) return -1;
      vTaskDelay(1);
    }
  }
  bool sendAll(const uint8_t* d, size_t n) {
    size_t off = 0; int stalls = 0;
    while (off < n) {
      size_t k = c.write(d + off, min((size_t)4096, n - off));
      if (k == 0) { if (!c.connected() || ++stalls > 500) return false; vTaskDelay(2); continue; }
      stalls = 0; off += k;
    }
    return true;
  }
  bool readHead(uint32_t timeoutMs) {
    String l;
    if (!readLine(l, timeoutMs)) return false;
    int sp = l.indexOf(' ');
    if (sp < 0) return false;
    status = l.substring(sp + 1, sp + 4).toInt();
    chunked = false; eof = false; closeAfter = false; remain = -1; chunkLeft = 0; lbLen = lbPos = 0;
    for (;;) {
      if (!readLine(l, 15000)) return false;
      if (l.length() == 0) break;
      l.toLowerCase();
      if (l.startsWith("transfer-encoding:") && l.indexOf("chunked") > 0) chunked = true;
      else if (l.startsWith("content-length:")) remain = l.substring(15).toInt();
      else if (l.startsWith("connection:") && l.indexOf("close") > 0) closeAfter = true;
    }
    if (!chunked && remain < 0) closeAfter = true;   // body runs until the server closes
    if (!chunked && remain == 0) eof = true;
    return true;
  }
  // returns bytes read, 0 at the end of the body, -1 on error / timeout
  int readBody(uint8_t* buf, int n, uint32_t timeoutMs) {
    if (eof) return 0;
    if (chunked) {
      if (chunkLeft == 0) {
        String l;
        if (!readLine(l, timeoutMs)) return -1;
        if (l.length() == 0 && !readLine(l, timeoutMs)) return -1;   // CRLF that ends the previous chunk
        chunkLeft = strtol(l.c_str(), nullptr, 16);
        if (chunkLeft == 0) { String t; readLine(t, 2000); eof = true; return 0; }
      }
      int got = rawRead(buf, (int)min((long)n, chunkLeft), timeoutMs);
      if (got <= 0) return -1;
      chunkLeft -= got;
      return got;
    }
    int want = remain > 0 ? (int)min((long)n, remain) : n;
    int got = rawRead(buf, want, timeoutMs);
    if (got < 0) return -1;
    if (got == 0) { eof = true; return 0; }
    if (remain > 0) { remain -= got; if (remain == 0) eof = true; }
    return got;
  }
  // one line of the body (used for the streaming answer). false at the end / on timeout
  bool bodyLine(String& out, uint32_t timeoutMs, size_t cap = 0) {   // cap > 0: a longer line is cut (we only need the small ones)
    out = "";
    for (;;) {
      if (lbPos >= lbLen) {
        lbLen = readBody(lb, sizeof(lb), timeoutMs); lbPos = 0;
        if (lbLen <= 0) { lbLen = 0; return out.length() > 0; }
      }
      char ch = lb[lbPos++];
      if (ch == '\n') return true;
      if (ch != '\r' && (cap == 0 || out.length() < cap)) out += ch;
    }
  }
  bool readAll(String& out, size_t maxBytes) {
    out = "";
    uint8_t tmp[512];
    for (;;) {
      int n = readBody(tmp, sizeof(tmp), 20000);
      if (n < 0) return false;
      if (n == 0) break;
      if (out.length() + n <= maxBytes) out.concat((const char*)tmp, n);
    }
    return true;
  }
  void finish() { if (closeAfter || !eof) c.stop(); }
  // POST (or GET when np == 0 and method says so). Retries once on a fresh connection if a kept-open one went stale.
  bool request(const char* method, const char* h, const char* path, const char* extra, const Part* parts, int np) {
    size_t total = 0;
    for (int i = 0; i < np; i++) total += parts[i].n;
    for (int attempt = 0; attempt < 2; attempt++) {
      if (attempt == 1) c.stop();
      if (!ensure(h)) { if (attempt == 1) return false; continue; }
      String head = String(method) + " " + path + " HTTP/1.1\r\nHost: " + h + "\r\nUser-Agent: robit\r\nConnection: keep-alive\r\n" + extra;
      if (np > 0) head += "Content-Length: " + String((unsigned long)total) + "\r\n";
      head += "\r\n";
      bool ok = sendAll((const uint8_t*)head.c_str(), head.length());
      for (int i = 0; ok && i < np; i++) ok = sendAll(parts[i].p, parts[i].n);
      if (!ok) { snprintf(why, sizeof(why), "send failed (%u bytes)", (unsigned)total); continue; }
      if (readHead(25000)) return true;
      snprintf(why, sizeof(why), "no answer from server (%u bytes sent)", (unsigned)total);
    }
    return false;
  }
};

HttpConn oai(true);          // api.openai.com (kept open between speech-to-text and text-to-speech)
HttpConn ant(true);          // api.anthropic.com (kept open too: no new secure handshake for every answer)

static String errorText(HttpConn& h) {                // read a small JSON error body and pull out its message
  String body; h.readAll(body, 1500);
  JsonDocument d;
  if (!deserializeJson(d, body)) {
    const char* m = d["error"]["message"] | (const char*)nullptr;
    if (m) return String(m);
  }
  return body.substring(0, 160);
}

// ---------------------------------------------------------------- cloud calls
static void normalizePcm(int16_t* x, size_t n, int* peakOut) {
  int peak = 0;
  for (size_t i = 0; i < n; i++) { int a = abs((int)x[i]); if (a > peak) peak = a; }
  *peakOut = peak;
  if (peak < 30) return;
  float gain = min(0.85f * 32767.0f / peak, 30.0f);
  for (size_t i = 0; i < n; i++) { int v = (int)(x[i] * gain); x[i] = (int16_t)constrain(v, -32768, 32767); }
}

static bool sttTranscribe(const int16_t* pcm, size_t samples, String& text) {
  const char* B = "----robitboundary7d4a";
  String pre = String("--") + B + "\r\nContent-Disposition: form-data; name=\"model\"\r\n\r\n" + STT_MODEL + "\r\n"
             + ((!strcmp(langMode, "es") || !strcmp(langMode, "en")) ? String("--") + B + "\r\nContent-Disposition: form-data; name=\"language\"\r\n\r\n" + langMode + "\r\n" : String(""))
             + "--" + B + "\r\nContent-Disposition: form-data; name=\"prompt\"\r\n\r\nA person talking to a small robot named " + robotName + ".\r\n"
             + "--" + B + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"speech.wav\"\r\nContent-Type: audio/wav\r\n\r\n";
  String post = String("\r\n--") + B + "--\r\n";
  uint32_t dataBytes = samples * 2;
  uint8_t wav[44] = { 'R','I','F','F', 0,0,0,0, 'W','A','V','E', 'f','m','t',' ', 16,0,0,0, 1,0, 1,0,
                      0x80,0x3E,0,0, 0,0x7D,0,0, 2,0, 16,0, 'd','a','t','a', 0,0,0,0 };
  uint32_t riff = 36 + dataBytes;
  memcpy(wav + 4, &riff, 4); memcpy(wav + 40, &dataBytes, 4);
  Part parts[4] = { { (const uint8_t*)pre.c_str(), pre.length() }, { wav, 44 }, { (const uint8_t*)pcm, dataBytes },
                    { (const uint8_t*)post.c_str(), post.length() } };
  String hdr = String("Authorization: Bearer ") + OPENAI_KEY + "\r\nContent-Type: multipart/form-data; boundary=" + B + "\r\n";
  if (!oai.request("POST", "api.openai.com", "/v1/audio/transcriptions", hdr.c_str(), parts, 4)) {
    Serial.printf("speech-to-text: could not reach OpenAI: %s\n", oai.why); noteErr("OpenAI hearing", 0, oai.why);
    oai.c.stop(); return false;
  }
  if (oai.status != 200) {
    { String why = errorText(oai); Serial.printf("speech-to-text error %d: %s\n", oai.status, why.c_str()); noteErr("OpenAI hearing", oai.status, why); }
    oai.finish(); return false;
  }
  String body; bool ok = oai.readAll(body, 6000); oai.finish();
  JsonDocument d;
  if (!ok || deserializeJson(d, body)) { Serial.println("speech-to-text: bad answer"); return false; }
  text = String((const char*)(d["text"] | ""));
  text.trim();
  return true;
}

// one sentence of speech: stream the audio straight into the speaker buffer
static bool ttsSay(const String& text, uint32_t myGen, bool& started) {
  JsonDocument d;
  d["model"] = TTS_MODEL; d["voice"] = TTS_VOICE; d["input"] = text; d["response_format"] = "pcm";
  if (strstr(TTS_MODEL, "gpt-4o")) d["instructions"] = TTS_STYLE;
  if (strstr(TTS_MODEL, "tts-1")) d["speed"] = ttsSpeed;
  String body; serializeJson(d, body);
  Part part = { (const uint8_t*)body.c_str(), body.length() };
  String hdr = String("Authorization: Bearer ") + OPENAI_KEY + "\r\nContent-Type: application/json\r\n";
  uint32_t t0 = millis();
  if (!oai.request("POST", "api.openai.com", "/v1/audio/speech", hdr.c_str(), &part, 1)) {
    Serial.printf("text-to-speech: could not reach OpenAI: %s\n", oai.why); noteErr("OpenAI voice", 0, oai.why); oai.c.stop(); return false;
  }
  if (oai.status != 200) { String why = errorText(oai); Serial.printf("text-to-speech error %d: %s\n", oai.status, why.c_str()); noteErr("OpenAI voice", oai.status, why); oai.finish(); return false; }
  static uint8_t buf[2048];
  bool got = false;
  for (;;) {
    int n = oai.readBody(buf, sizeof(buf), 15000);
    if (gen != myGen) { oai.c.stop(); return got; }
    if (n < 0) { Serial.println("text-to-speech: stream interrupted"); oai.c.stop(); return got; }
    if (n == 0) break;
    if (!got) { got = true; Serial.printf("voice first bytes after %.1fs\n", (millis() - t0) / 1000.0f);
      if (speechEndAt) { Serial.printf("ANSWER TIME: from when you stopped talking to his first sound: %.1f s\n", (millis() - speechEndAt) / 1000.0f); speechEndAt = 0; } }
    if (!started) { started = true; uiPost(UI_SPEAK); }
    spkPush(buf, n);
  }
  oai.finish();
  return true;
}

static void sadTones();
// ---------------------------------------------------------------- music: internet radio (MP3 streams), decoded here and played through his speaker
static void musicRequest(const String&) { Serial.println("music: the libhelix library is not installed (set USE_MUSIC 1 and install it)"); }

// ---------------------------------------------------------------- songs from the microSD card (folder "music", MP3 files), decoded here and played through his speaker
#if USE_SD_MUSIC
struct SongCb { static void pcm(MP3FrameInfo& info, short* pcm, size_t len, void*) {   // (inside a struct so the Arduino IDE does not auto-declare it before the library is included)
  static int16_t out[4096];
  static float phase = 0; static int16_t prev = 0;
  int ch = info.nChans < 1 ? 1 : info.nChans, sr = info.samprate > 7000 ? info.samprate : 44100;
  size_t n = len / ch;
  if (n == 0 || n > 1200) return;
  static int16_t mono[1201];
  mono[0] = prev;
  for (size_t i = 0; i < n; i++) mono[i + 1] = ch == 2 ? (int16_t)(((int)pcm[2 * i] + pcm[2 * i + 1]) / 2) : pcm[i];
  float ratio = (float)sr / 24000.0f;
  size_t k = 0;
  while (phase < (float)n && k < 4095) {
    int i = (int)phase; float f = phase - i;
    out[k++] = (int16_t)((mono[i] * (1.0f - f) + mono[i + 1] * f) * MUSIC_GAIN);
    phase += ratio;
  }
  phase -= (float)n; if (phase < 0) phase = 0;
  prev = mono[n];
  { float e = 0; for (size_t i = 1; i <= n; i++) e += (float)mono[i] * mono[i]; e = sqrtf(e / n) / 9000.0f; if (e > 1) e = 1; songLevel = songLevel * 0.55f + e * 0.45f; }
  spkPush((const uint8_t*)out, k * 2);
} };

static libhelix::MP3DecoderHelix songDec(SongCb::pcm);

// The card slot of this board is wired as an SD card bus (SD_MMC, 1 bit): CLK = GPIO14, CMD = GPIO17, D0 = GPIO16, and D3 = EXIO3 of the IO expander.
// First try that (the way the board maker does); if the card cannot really be READ that way, fall back to the SPI way. The first one that reads a song wins.
static int sdMode = 0;                                        // 0 = no card, 1 = SD_MMC bus, 2 = SPI
static File sdOpen(const char* p) { return sdMode == 1 ? SD_MMC.open(p) : SD.open(p); }
static void sdCsPin(bool high) {                              // EXIO3 = D3 / CS of the card
  uint8_t cfg = 0xFC, out = 0xFF;
  i2cRead(TCA_ADDR, 0x03, &cfg, 1); i2cRead(TCA_ADDR, 0x01, &out, 1);
  if (high) out |= 0x04; else out &= (uint8_t)~0x04;
  cfg &= (uint8_t)~0x04;
  i2cWrite8(TCA_ADDR, 0x01, out); i2cWrite8(TCA_ADDR, 0x03, cfg);
}
static void sdUnmount() {
  if (sdMode == 1) SD_MMC.end();
  else if (sdMode == 2) { SD.end(); sdSpi.end(); }
  sdMode = 0; sdOk = false;
}
static bool sdMountMmc(uint32_t khz) {
  sdCsPin(true);                                              // D3 high: the card stays in SD mode (low would put it in SPI mode)
  SD_MMC.end(); delay(20);
  SD_MMC.setPins(14, 17, 16);                                 // CLK, CMD, D0
  bool ok = SD_MMC.begin("/sdcard", true, false, (int)khz, 8);
  if (ok) { sdMode = 1; sdOk = true; } else SD_MMC.end();
  return ok;
}
static bool sdMountSpi(uint32_t hz) {
  sdCsPin(false);                                             // the card's chip select is held LOW (selected)
  SD_MMC.end(); sdSpi.begin(14, 16, 17, -1);                  // SCK, MISO, MOSI
  bool ok = SD.begin((uint8_t)255, sdSpi, hz);
  if (ok) { sdMode = 2; sdOk = true; } else { SD.end(); sdSpi.end(); }
  return ok;
}
static bool sdReadPath(const char* tag, const char* name, const char* p) {     // reads the first 64 KB of a file and says how fast
  File t = sdOpen(p);
  if (!t) { Serial.printf("SD read test (%s): cannot open %s\n", tag, name); return false; }
  static uint8_t b[4096];
  uint32_t fsz = t.size(), t0 = millis(), total = 0;
  for (int i = 0; i < 16; i++) { int r = t.read(b, sizeof(b)); if (r <= 0) break; total += r; }
  uint32_t ms = millis() - t0;
  t.close();
  bool ok = total > 0 && total >= min(fsz, (uint32_t)65536);
  Serial.printf("SD read test (%s): %u of %u bytes in %lu ms -> %s\n", tag, (unsigned)total, (unsigned)min(fsz, (uint32_t)65536), (unsigned long)ms, ok ? "OK" : "FAILED");
  return ok;
}
static bool sdReadTest(const char* tag, const char* name) {
  if (!name || !*name) return false;
  String p = String("/music/") + name;
  return sdReadPath(tag, name, p.c_str());
}
static void sdSelfTest(const char* tag, const char* name) {      // prints what the card can really do (to find out why songs cannot be read)
  Serial.printf("SD test (%s): mode %s, card type %d, size %llu MB\n", tag, sdMode == 1 ? "SD_MMC" : sdMode == 2 ? "SPI" : "none", sdMode == 1 ? (int)SD_MMC.cardType() : (int)SD.cardType(),
                (unsigned long long)((sdMode == 1 ? SD_MMC.cardSize() : SD.cardSize()) / (1024 * 1024)));
  if (sdMode == 2) {
    static uint8_t sec[512] __attribute__((aligned(4)));
    memset(sec, 0, sizeof(sec));
    bool raw = SD.readRAW(sec, 0);
    Serial.printf("SD test (%s): raw sector 0 %s, signature %02X%02X (should be 55AA)\n", tag, raw ? "read ok" : "FAILED", sec[510], sec[511]);
  }
  if (name) sdReadTest(tag, name);
}
static bool sdListSongs() {
  songCount = 0;
  File dir = sdOpen("/music");
  if (!dir || !dir.isDirectory()) { Serial.println("SD card: found, but there is no folder called music"); return false; }
  for (File f = dir.openNextFile(); f && songCount < SONG_MAX; f = dir.openNextFile()) {
    if (!f.isDirectory()) {
      String n = f.name(); int sl = n.lastIndexOf('/'); if (sl >= 0) n = n.substring(sl + 1);
      String l = n; l.toLowerCase();
      if (!n.startsWith(".") && l.endsWith(".mp3") && n.length() < sizeof(songName[0])) strlcpy(songName[songCount++], n.c_str(), sizeof(songName[0]));
    }
    f.close();
  }
  dir.close();
  for (int i = 0; i < songCount; i++) for (int j = i + 1; j < songCount; j++)
    if (strcasecmp(songName[j], songName[i]) < 0) { char t[64]; strlcpy(t, songName[i], 64); strlcpy(songName[i], songName[j], 64); strlcpy(songName[j], t, 64); }
  return songCount > 0;
}
static bool sdListVideos() {
#if USE_VIDEO
  vidCount = 0; vidOtherCount = 0;
  File dir = sdOpen("/video");
  if (!dir || !dir.isDirectory()) return false;
  for (File f = dir.openNextFile(); f && vidCount < VIDEO_MAX; f = dir.openNextFile()) {
    if (!f.isDirectory()) {
      String n = f.name(); int sl = n.lastIndexOf('/'); if (sl >= 0) n = n.substring(sl + 1);
      String l = n; l.toLowerCase();
      if (!n.startsWith(".") && l.endsWith(".avi") && n.length() < sizeof(vidName[0])) strlcpy(vidName[vidCount++], n.c_str(), sizeof(vidName[0]));
      else if (!n.startsWith(".") && (l.endsWith(".mp4") || l.endsWith(".m4v") || l.endsWith(".mov") || l.endsWith(".mkv") || l.endsWith(".webm") || l.endsWith(".wmv") || l.endsWith(".flv") || l.endsWith(".mpg") || l.endsWith(".mpeg") || l.endsWith(".3gp"))) vidOtherCount++;
    }
    f.close();
  }
  dir.close();
  for (int i = 0; i < vidCount; i++) for (int j = i + 1; j < vidCount; j++)
    if (strcasecmp(vidName[j], vidName[i]) < 0) { char t[48]; strlcpy(t, vidName[i], 48); strlcpy(vidName[i], vidName[j], 48); strlcpy(vidName[j], t, 48); }
  return vidCount > 0;
#else
  return false;
#endif
}
static bool sdMountMode(int mode, uint32_t f) { return mode == 1 ? sdMountMmc(f) : sdMountSpi(f); }
static void sdMusicInit() {
  static const struct { int mode; uint32_t f; } tries[] = { { 1, 20000 }, { 1, 10000 }, { 2, 10000000 }, { 2, 4000000 } };
  int listMode = 0; uint32_t listF = 0; bool good = false, anyMount = false;
  for (auto& t : tries) {
    sdUnmount();
    bool m = sdMountMode(t.mode, t.f);
    Serial.printf("SD card: %s at %u %s -> %s\n", t.mode == 1 ? "SD_MMC bus" : "SPI", (unsigned)(t.mode == 1 ? t.f : t.f / 1000), t.mode == 1 ? "kHz" : "kHz", m ? "mounted" : "not found");
    if (!m) continue;
    anyMount = true;
    bool hasSongs = sdListSongs(), hasVideos = sdListVideos();
    if (!hasSongs && !hasVideos) { Serial.println("SD card: found, but no folder music (MP3 files) or video (AVI files) with files in it"); break; }     // another mode will not change that
    if (!listMode) { listMode = t.mode; listF = t.f; }
    { String tp = hasSongs ? String("/music/") + songName[0] : String("/video/") + vidName[0];
      if (sdReadPath("at start", hasSongs ? songName[0] : vidName[0], tp.c_str())) { good = true; break; } }
    Serial.println("SD card: it mounts and lists the songs, but cannot read them this way. Trying the next way...");
  }
  if (!anyMount) { Serial.println("SD card: not found (insert a FAT32 card and restart)"); return; }
  if (!good && listMode) { sdUnmount(); sdMountMode(listMode, listF); sdListSongs(); sdListVideos(); Serial.println("SD card: NO way could read the songs. Check the card (FAT32, MP3 files in a folder called music) or try another card."); }
  Serial.printf("SD card: %d songs in /music (using the %s way)\n", songCount, sdMode == 1 ? "SD_MMC" : "SPI");
  for (int i = 0; i < songCount; i++) Serial.printf("  %d. %s\n", i + 1, songName[i]);
#if USE_VIDEO
  Serial.printf("SD card: %d videos in /video\n", vidCount);
  if (vidOtherCount > 0) Serial.printf("SD card: %d MP4/MOV/MKV files in /video are NOT playable (the chip plays .avi only): convert them with tools/convertir_video (README section 8)\n", vidOtherCount);
  for (int i = 0; i < vidCount; i++) Serial.printf("  %d. %s\n", i + 1, vidName[i]);
#endif
}
static bool sdRemount(uint32_t hz) {                          // start the card again from zero (used when a read fails)
  int m = sdMode ? sdMode : 1;
  sdUnmount(); delay(30);
  bool ok = sdMountMode(m, m == 1 ? (hz >= 1000000 ? hz / 1000 : hz) : hz);
  Serial.printf("SD remount at %u Hz: %s\n", (unsigned)hz, ok ? "ok" : "FAILED");
  return ok;
}
static void songHalt() { songCmd = 0; songStop = true; songPaused = false; }
static void songPlay(int i) {
  if (songCount <= 0 || i < 0 || i >= songCount) return;
  songIdx = i; songPaused = false; songStop = true; songCmd = 1; musicOn = true;
#if USE_MUSIC
  musicCmd = 0; musicStop = true;                            // the radio stops
#endif
}
static void songNext() { if (songCount > 0) songPlay((songIdx < 0 ? 0 : songIdx + 1) % songCount); }
static void songPrev() { if (songCount > 0) songPlay((songIdx <= 0 ? songCount : songIdx) - 1); }
static void songTag(const String& t) {                        // [song 3] [song random] [song_next] [song_prev] [song_pause] [song_resume] [song_stop]
  if (songCount <= 0) return;
  if (t == "song_stop") songHalt();
  else if (t == "song_pause") songPaused = true;
  else if (t == "song_resume") { if (songPlaying) songPaused = false; else songPlay(songIdx < 0 ? 0 : songIdx); }
  else if (t == "song_next") songNext();
  else if (t == "song_prev") songPrev();
  else {
    String a = t.substring(4); a.trim();
    if (a == "random" || a == "shuffle" || a == "any") songPlay((int)random(songCount));
    else songPlay(a.toInt() - 1);
  }
}
#if USE_VIDEO
  // (videoPrompt is below, with the video code)
#endif
static String songPrompt() {
  String s = "- Music: you can play songs stored on your SD card. The songs, numbered: ";
  for (int i = 0; i < songCount && i < 30; i++) { String n = songName[i]; n.remove(n.length() - 4); n.replace("_", " "); s += String(i + 1) + " " + n + "; "; }
  s += "\n  To play one put [song N] (its number) or [song random] in your reply; also [song_next] [song_prev] [song_pause] [song_resume] [song_stop]. "
       "Say in one short sentence what you are playing, and that they hold the BOOT button to talk to you while it plays (you cannot hear them over the music). "
       "If they ask for a song you do not have, say so and offer one you do have.\n";
  return s;
}

static void songTask(void*) {
  static uint8_t buf[1024];
  for (;;) {
    if (songCmd != 1) { vTaskDelay(100); continue; }
    int idx = songIdx; songCmd = 0; songStop = false;
    uint32_t w0 = millis();                                   // let him finish saying "playing ..." first
    while (!songStop && millis() - w0 < 25000 && (brainBusy || botState != ST_IDLE || spkBusy || spkRing.avail() > 0)) vTaskDelay(50);
    if (songStop) { if (songCmd != 1) { songPlaying = false; musicOn = false; } continue; }
    String path = String("/music/") + songName[idx];
    File f = sdOpen(path.c_str());
    if (!f) { Serial.printf("song: could not open %s\n", path.c_str()); sadTones(); songPlaying = false; musicOn = false; continue; }
    Serial.printf("song: %s  (free memory %u KB)\n", songName[idx], (unsigned)(ESP.getFreeHeap() / 1024));
    uint8_t h[10];                                            // skip the ID3 tag at the start (it can hold a big cover picture)
    uint32_t fsz = f.size(), startPos = 0;
    int hr = f.read(h, 10);
    if (hr != 10) {                                           // the card did not answer: restart it slowly and try once more
      Serial.printf("song: first read gave %d, restarting the card at 4 MHz\n", hr);
      sdSelfTest("in the song task", songName[idx]);
      f.close(); sdRemount(4000000);
      f = sdOpen(path.c_str());
      hr = f ? f.read(h, 10) : -1;
      Serial.printf("song: after restart the first read gave %d\n", hr);
      if (hr != 10) { Serial.println("song: ERROR the card cannot be read. Check the card (FAT32? try another card)."); if (f) f.close(); sadTones(); songPlaying = false; musicOn = false; continue; }
    }
    if (hr == 10 && h[0] == 'I' && h[1] == 'D' && h[2] == '3') startPos = 10 + (((uint32_t)h[6] << 21) | ((uint32_t)h[7] << 14) | ((uint32_t)h[8] << 7) | h[9]);
    if (startPos >= fsz) startPos = 0;
    bool seekOk = f.seek(startPos);
    Serial.printf("song: size %u bytes, audio starts at %u, seek %s\n", (unsigned)fsz, (unsigned)startPos, seekOk ? "ok" : "FAILED");
    uint32_t totalRead = 0, t0s = millis();
    songPlaying = true; songPaused = false; musicOn = true;
    bool decOn = false, ducked = false, ended = false;
    while (!songStop) {
      if (songPaused || brainBusy || botState != ST_IDLE || pttHeld || capActive) {          // paused, or he is listening / talking: the song waits (and gives its memory back)
        if (decOn) { songDec.end(); decOn = false; }
        if (!ducked) { ducked = true; spkFlushReq = true; }
        vTaskDelay(40); continue;
      }
      ducked = false;
      if (!decOn) { songDec.begin(); decOn = true; }
      if (spkRing.avail() > 24000 * 2) { vTaskDelay(15); continue; }      // about a second is queued: let it play
      lastActivity = millis();                                              // music on = he stays awake
      int n = f.read(buf, sizeof(buf));
      if (n <= 0) { ended = true; break; }
      totalRead += n;
      songDec.write(buf, n);
    }
    if (decOn) songDec.end();
    f.close();
    if (songStop) { if (songCmd != 1) { songPlaying = false; musicOn = false; if (!brainBusy && botState == ST_IDLE) spkFlushReq = true; } continue; }
    if (ended && totalRead < 50000) {                          // it ended at once: the card or the file is not readable. Do NOT loop through every song
      Serial.printf("song: ERROR read only %u of %u bytes in %lu ms (card read problem). Stopping.\n", (unsigned)totalRead, (unsigned)fsz, (unsigned long)(millis() - t0s));
      sadTones(); songPlaying = false; musicOn = false; continue;
    }
    if (ended && songCount > 0) { songIdx = (idx + 1) % songCount; songCmd = 1; }      // next song
  }
}
static void musicHalt() { songHalt(); }
#else
static void musicHalt() {}
#endif

// ---------------------------------------------------------------- Spotify remote control (the sound comes from your phone / computer / speaker, not from him)
static void spotifyRequest(int, const String& = "", int = 0) { Serial.println("spotify: off (USE_SPOTIFY 0)"); }
static void spotifyPauseIfOn() {}

// ---------------------------------------------------------------- commands Claude puts in square brackets (not spoken)
static bool tagCommand(const String& tag) {                  // tag is lower case, no brackets. true = it was one of these
  {
    int em = emotionByName(tag.c_str());                       // [happy] [sad] [angry] [dizzy] [confused] [confident] [surprised] [scared] [excited] [love] [wink] [laugh] [sleepy] [shy] [bored] [cry] [idle]
    if (em >= 0 && em != EMO_SLEEP) {
      if (em == EMO_NONE) { emo = EMO_NONE; return true; }
      setEmotion(em, EXPRESSION_SECONDS * 1000UL);
      return tag != "happy";                                   // [happy] is also a little dance, so it goes on to the movements
    }
  }
  if (tag.startsWith("menu")) {                               // [menu] [menu songs] [menu videos] [menu faces] [menu language] [menu settings] [menu map] [menu close]
    String a = tag.substring(4); a.trim();
    menuReq = a == "close" || a == "exit" ? 7 : a == "faces" ? 2 : a == "language" ? 3 : a == "songs" ? 4 : a == "videos" ? 5 : a == "settings" ? 6 : a == "map" ? 8 : 1;
    return true;
  }
  if (tag == "show_weather") { showHomeCard(false, true); return true; }
  if (tag == "show_time")    { showHomeCard(true, false); return true; }
  if (tag == "cancel_timer" || tag == "stop_timer" || tag == "cancel_alarm") { timerDue = 0; Serial.println("timer cancelled"); return true; }
  if (tag == "stop_music")   { musicHalt(); spotifyPauseIfOn(); Serial.println("music: stop"); return true; }
  if (tag.startsWith("spotify")) {                           // [spotify song Get Lucky Daft Punk] [spotify artist Daft Punk] [spotify playlist chill] [spotify album ...] [spotify_pause] [spotify_resume] [spotify_next] [spotify_prev] [spotify_volume 40]
    String r = tag.substring(7); r.trim();
    if (tag.startsWith("spotify_pause"))  { spotifyRequest(2); return true; }
    if (tag.startsWith("spotify_resume")) { spotifyRequest(6); return true; }
    if (tag.startsWith("spotify_next"))   { spotifyRequest(3); return true; }
    if (tag.startsWith("spotify_prev"))   { spotifyRequest(4); return true; }
    if (tag.startsWith("spotify_volume")) { spotifyRequest(5, "", tag.substring(14).toInt()); return true; }
    if (r.length()) { Serial.printf("spotify: request \"%s\"\n", r.c_str()); musicHalt(); spotifyRequest(1, r); }
    return true;
  }
#if USE_SD_MUSIC
  if (tag.startsWith("song")) { songTag(tag); return true; }
#endif
#if USE_VIDEO
  if (tag.startsWith("video")) {                              // [video 2] [video random] [video_stop]
    String a = tag.substring(5); a.trim();
    if (tag == "video_stop" || a == "stop") videoStop();
    else if (a == "random" || a == "any") { if (vidCount > 0) videoStart((int)random(vidCount)); }
    else videoStart(a.toInt() - 1);
    return true;
  }
#endif
  if (tag.startsWith("music")) {
    String q = tag.substring(5); q.trim();
    Serial.printf("music: request \"%s\"\n", q.c_str());
    musicRequest(q);
    return true;
  }
  if (tag.startsWith("timer")) {                              // [timer 300] or [timer 300 pasta]: seconds, then an optional short label
    int p = 5; while (p < (int)tag.length() && tag[p] == ' ') p++;
    int q = p; while (q < (int)tag.length() && isdigit((unsigned char)tag[q])) q++;
    long secs = tag.substring(p, q).toInt();
    if (secs < 1) return true;
    if (secs > 86400) secs = 86400;
    String label = tag.substring(q); label.trim();
    strlcpy(timerLabel, label.c_str(), sizeof(timerLabel));
    timerDue = millis() + (uint32_t)secs * 1000UL; if (!timerDue) timerDue = 1;
    Serial.printf("timer: %ld s %s\n", secs, timerLabel);
    return true;
  }
  if (tag.startsWith("alarm")) {                              // [alarm 07:30]
    int hh = -1, mm = -1;
    if (sscanf(tag.c_str() + 5, " %d:%d", &hh, &mm) != 2 || hh < 0 || hh > 23 || mm < 0 || mm > 59) return true;
    time_t tt = time(nullptr);
    if (tt < 1700000000) return true;
    struct tm tmv; localtime_r(&tt, &tmv);
    long diff = (long)(hh * 3600 + mm * 60) - (long)(tmv.tm_hour * 3600 + tmv.tm_min * 60 + tmv.tm_sec);
    if (diff <= 0) diff += 86400;
    timerLabel[0] = 0;
    timerDue = millis() + (uint32_t)diff * 1000UL; if (!timerDue) timerDue = 1;
    Serial.printf("alarm: rings in %ld s\n", diff);
    return true;
  }
  return false;
}

// Takes Claude's answer as it streams in, cuts it into sentences, queues the movement tags and speaks each
// sentence as soon as it is complete (the first one may stop at a comma so he starts talking sooner).
struct Speaker {
  uint32_t myGen = 0;
  bool started = false, failed = false;
  int count = 0;
  String raw, sent, spoken;
  int acts[6]; int na = 0;
  // When the memory is too short to hold the Claude connection and the voice connection at once, the sentences wait here
  // until Claude has finished (closing Claude's connection in the middle of the answer cut it off).
  String qs[6]; int qa[6][6]; int qna[6]; int nq = 0; bool flushing = false;

  void postActs() { for (int i = 0; i < na; i++) uiPost(UI_ACT, acts[i], spkRing.head.load()); na = 0; }
  bool tightNow() { return !flushing && ant.c.connected() && heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL) < 60 * 1024; }
  void park(const String& text) { if (nq >= 6) return; qs[nq] = text; qna[nq] = na; for (int i = 0; i < na; i++) qa[nq][i] = acts[i]; nq++; na = 0; }
  bool flushDeferred() {
    flushing = true;
    for (int i = 0; i < nq; i++) {
      if (gen != myGen) { nq = 0; return false; }
      na = qna[i]; for (int k = 0; k < na; k++) acts[k] = qa[i][k];
      postActs();
      if (qs[i].length()) {
        if (!ttsSay(qs[i], myGen, started)) { failed = true; nq = 0; return false; }
        if (spoken.length()) spoken += " ";
        spoken += qs[i];
      }
    }
    nq = 0; return true;
  }
  bool speakSentence(bool last) {                    // false = stop (voice failed or we were interrupted)
    String clean = sent; clean.trim();
    while (clean.indexOf("  ") >= 0) clean.replace("  ", " ");
    bool words = false;
    for (uint32_t i = 0; i < clean.length(); i++) if (isalnum((unsigned char)clean[i]) || (unsigned char)clean[i] >= 0x80) { words = true; break; }
    if (!words) { if (last) { if (nq > 0) park(""); else postActs(); } sent = ""; return true; }
    if (clean.length() < 14 && !last) return true;   // too short for its own request: join with the next piece
    if (tightNow() && nq < 6) { park(clean); count++; sent = ""; return true; }
    postActs(); sent = "";
    if (!ttsSay(clean, myGen, started)) { failed = true; return false; }
    count++;
    if (spoken.length()) spoken += " ";
    spoken += clean;
    return gen == myGen;
  }
  bool process(bool fin) {
    uint32_t len = raw.length(), i = 0;
    for (; i < len; i++) {
      char ch = raw[i];
      if (ch == '[') {
        int e = raw.indexOf(']', i);
        if (e < 0) { if (!fin && len - i < 90) break; }       // tag not finished yet: wait for more text
        else if (e - (int)i < 90) {
          String tag = raw.substring(i + 1, e); String orig = tag; orig.trim(); tag.toLowerCase(); tag.trim();
          if (tag.startsWith("remember ")) { String f = orig.substring(9); f.trim(); int imp = 3; if (f.length() > 2 && f[0] >= '1' && f[0] <= '5' && f[1] == ' ') { imp = f[0] - '0'; f = f.substring(2); } memAdd(imp, f); }
          else if (tag.startsWith("forget ")) memForget(tag.substring(7));
          else if (tag == "forget_all") memClear();
          else if (!tagCommand(tag)) {
            int idx = findAction(tag.c_str());
            if (idx >= 0 && na < 6) acts[na++] = idx;
          }
          i = e; continue;
        }
      }
      bool hard = (ch == '.' || ch == '!' || ch == '?');
      bool soft = (count == 0 && (ch == ',' || ch == ';' || ch == ':') && sent.length() >= 28);
      if ((hard || soft) && i + 1 >= len && !fin) break;      // wait for the next character
      sent += ch;
      if ((hard || soft) && (i + 1 >= len || raw[i + 1] == ' ' || raw[i + 1] == '\n')) {
        if (!speakSentence(false)) { raw = ""; return false; }
      }
    }
    raw = raw.substring(i);
    return true;
  }
  void finish() {
    if (!failed && gen == myGen) { process(true); if (!failed && gen == myGen) speakSentence(true); if (!failed && gen == myGen && nq > 0) { flushDeferred(); } }
    uiPost(UI_END);
  }
};


// ---------------------------------------------------------------- eyes: a photo from the camera module, sent to Claude with the question
static uint8_t* visB64 = nullptr;          // base64 of the last photo (PSRAM)
static size_t visLen = 0;
static bool camUp = false;

static bool wantsVision(const String& text) {
  if (!USE_CAMERA) return false;
  String t = text; t.toLowerCase();
  static const char* W[] = { "what do you see", "what can you see", "do you see", "can you see", "look at", "what am i holding", "what is this", "what's this",
    "who is this", "who am i", "how do i look", "what am i wearing", "describe what", "take a picture", "take a photo", "in front of you", "what is in front",
    "qu\xC3\xA9 ves", "que ves", "qu\xC3\xA9 est\xC3\xA1s viendo", "que estas viendo", "qu\xC3\xA9 puedes ver", "que puedes ver", "me ves", "ves esto", "mira esto", "m\xC3\xADrame", "mirame",
    "qu\xC3\xA9 tengo", "que tengo", "qui\xC3\xA9n soy", "quien soy", "c\xC3\xB3mo me veo", "como me veo", "qu\xC3\xA9 es esto", "que es esto", "qui\xC3\xA9n es", "tom\xC3\xA1 una foto", "toma una foto", "mira a", "look around", "mira alrededor",
    "selfie", "take me a photo", "take my photo", "take my picture", "t\xC3\xB3mame una foto", "tomame una foto", "s\xC3\xA1""came una foto", "sacame una foto", "hazme una foto", "una foto de m\xC3\xAD", "una foto de mi" };
  for (const char* w : W) if (t.indexOf(w) >= 0) return true;
  return false;
}

// "take a photo / selfie": the picture is also shown on the screen (a plain "what do you see" is not)
static bool wantsPhotoShown(const String& text) {
  String t = text; t.toLowerCase();
  static const char* W[] = { "take a photo", "take a picture", "take me a photo", "take my photo", "take my picture", "selfie", "take a pic",
    "tom\xC3\xA1 una foto", "toma una foto", "t\xC3\xB3mame una foto", "tomame una foto", "s\xC3\xA1""came una foto", "sacame una foto", "hazme una foto", "una foto de m\xC3\xAD", "una foto de mi", "sac\xC3\xA1 una foto", "saca una foto" };
  for (const char* w : W) if (t.indexOf(w) >= 0) return true;
  return false;
}

// ask the camera module (wired to the UART header) for one JPEG and keep it as base64. About half a second.
// Wire protocol: we send A5 5A 'P'; it answers "RBT1", 4 bytes length (little endian), then the JPEG.
static bool fetchPhoto() {
  visLen = 0;
  if (!camUp) { Serial1.setRxBufferSize(16384); Serial1.begin(CAM_BAUD, SERIAL_8N1, CAM_RX_PIN, CAM_TX_PIN); camUp = true; }
  while (Serial1.available()) Serial1.read();
  const uint8_t req[3] = { 0xA5, 0x5A, 'P' };
  Serial1.write(req, 3);
  uint32_t t0 = millis(); int m = 0;
  const char* MAG = "RBT1";
  while (m < 4 && millis() - t0 < 2500) {                    // wait for the magic word
    if (!Serial1.available()) { vTaskDelay(1); continue; }
    int ch = Serial1.read();
    m = (ch == MAG[m]) ? m + 1 : (ch == MAG[0] ? 1 : 0);
  }
  if (m < 4) { Serial.println("camera: no answer on the wire (check TX/RX are crossed, GND joined, camera powered)"); return false; }
  uint8_t lb[4]; Serial1.setTimeout(1500);
  if (Serial1.readBytes(lb, 4) != 4) return false;
  uint32_t n = lb[0] | (lb[1] << 8) | (lb[2] << 16) | ((uint32_t)lb[3] << 24);
  if (n < 1000 || n > 120000) { Serial.printf("camera: strange picture size %u\n", (unsigned)n); return false; }
  uint8_t* jpg = (uint8_t*)ps_malloc(n);
  if (!jpg) return false;
  Serial1.setTimeout(3000);
  size_t got = Serial1.readBytes(jpg, n);
  if (got != n || jpg[0] != 0xFF || jpg[1] != 0xD8) { Serial.printf("camera: incomplete picture (%u of %u bytes)\n", (unsigned)got, (unsigned)n); free(jpg); return false; }
  size_t cap = ((n + 2) / 3) * 4 + 8;
  if (visB64) free(visB64);
  visB64 = (uint8_t*)ps_malloc(cap);
  if (!visB64) { free(jpg); return false; }
  size_t olen = 0;
  mbedtls_base64_encode(visB64, cap, &olen, jpg, n);
  { uint8_t* old = visJpg; visJpg = jpg; visJpgLen = n; cardPixReady = false; if (old) { vTaskDelay(200); free(old); } }   // kept for the screen
  visLen = olen;
  Serial.printf("camera: got a picture (%u bytes)\n", (unsigned)n);
  return true;
}

// Ask Claude and speak while the answer is still arriving. false = no answer at all.
// Claude can use two tools: lookup_place (time + weather anywhere, runs here) and web_search (runs at Anthropic: news, sports, anything recent).
static String lookupPlace(const String& inJson);
#if USE_MAP
static String mapTool(const String& inJson);
#endif
static bool webSearchOk = true;                           // switched off by itself if the account has no web search

static void toolsJson(JsonDocument& d, bool withWeb) {
  if (!promptTools) return;                               // fast path: no tools in this request
  JsonArray tools = d["tools"].to<JsonArray>();
  JsonObject t = tools.add<JsonObject>();
  t["name"] = "lookup_place";
  t["description"] = "Get the current local time, date and weather of any city or place in the world. Use it whenever someone asks the time, the date or the weather somewhere other than where you are. It also shows the result on your screen.";
  JsonObject sc = t["input_schema"].to<JsonObject>();
  sc["type"] = "object";
  JsonObject pr = sc["properties"].to<JsonObject>();
  pr["place"]["type"] = "string"; pr["place"]["description"] = "name of the city to show, for example Tokyo";
  pr["latitude"]["type"] = "number"; pr["latitude"]["description"] = "latitude of the city in degrees";
  pr["longitude"]["type"] = "number"; pr["longitude"]["description"] = "longitude of the city in degrees";
  pr["show"]["type"] = "string"; pr["show"]["description"] = "what the person asked for: time, weather, or both";
  pr["show"]["enum"][0] = "time"; pr["show"]["enum"][1] = "weather"; pr["show"]["enum"][2] = "both";
  JsonArray rq = sc["required"].to<JsonArray>();
  rq.add("place"); rq.add("latitude"); rq.add("longitude"); rq.add("show");
#if USE_MAP
  if (GOOGLE_MAPS_KEY[0]) {
    JsonObject m = tools.add<JsonObject>();
    m["name"] = "show_map";
    m["description"] = "Show a Google map on your round screen: a place, directions between two places, or places nearby. Use it ONLY when the person asks for a map, a place or directions in their latest message; never for music, jokes or any other request, and never because of something said earlier. Use it when someone asks to see a place or a map, how to get somewhere, how far or how long it takes, or for places near somewhere (restaurants, pharmacies, cafes, hotels...). The result has the facts to answer from.";
    JsonObject ms = m["input_schema"].to<JsonObject>();
    ms["type"] = "object";
    JsonObject mp = ms["properties"].to<JsonObject>();
    mp["place"]["type"] = "string"; mp["place"]["description"] = "name of the place to show, for example Torre Eiffel";
    mp["latitude"]["type"] = "number"; mp["latitude"]["description"] = "latitude of that place (the destination if you ask for directions)";
    mp["longitude"]["type"] = "number"; mp["longitude"]["description"] = "longitude of that place (the destination if you ask for directions)";
    mp["zoom"]["type"] = "integer"; mp["zoom"]["description"] = "how close: 3 continent, 5 country, 10 city, 13 district, 15 streets, 17 buildings. Optional (default 14).";
    mp["maptype"]["type"] = "string"; mp["maptype"]["enum"][0] = "map"; mp["maptype"]["enum"][1] = "satellite"; mp["maptype"]["enum"][2] = "terrain"; mp["maptype"]["enum"][3] = "hybrid";
    mp["search"]["type"] = "string"; mp["search"]["description"] = "optional: kind of places to mark around that point, for example coffee shops, pharmacy, sushi";
    mp["travel_mode"]["type"] = "string"; mp["travel_mode"]["description"] = "optional: ask for directions to the place and draw the route. drive, walk, bicycle or transit";
    mp["travel_mode"]["enum"][0] = "drive"; mp["travel_mode"]["enum"][1] = "walk"; mp["travel_mode"]["enum"][2] = "bicycle"; mp["travel_mode"]["enum"][3] = "transit";
    mp["from_latitude"]["type"] = "number"; mp["from_latitude"]["description"] = "optional start of the route (default: where you are)";
    mp["from_longitude"]["type"] = "number"; mp["from_longitude"]["description"] = "optional start of the route (default: where you are)";
    JsonArray mr = ms["required"].to<JsonArray>();
    mr.add("place"); mr.add("latitude"); mr.add("longitude");
  }
#endif
  if (withWeb) {
    JsonObject w = tools.add<JsonObject>();
    w["type"] = "web_search_20250305"; w["name"] = "web_search"; w["max_uses"] = 2;
  }
}

static bool streamAnswer(uint32_t myGen, Speaker& sp) {
  bool withPhoto = visLen > 0;
  bool any = false;
  String said, priorSaid, toolId, toolName, toolIn, toolOut;   // what Claude said before calling a tool, and the tool call itself
  for (int round = 0; round < 2; round++) {
    bool sawTool = false, inTool = false;
    said = "";
    if (round == 0) { toolId = ""; toolName = ""; toolIn = ""; priorSaid = ""; }
    String hdr = String("x-api-key: ") + ANTHROPIC_KEY + "\r\nanthropic-version: 2023-06-01\r\nContent-Type: application/json\r\n";
    uint32_t t0 = millis();
    bool sent = false;
    for (int attempt = 0; attempt < 2 && !sent; attempt++) {
      bool withWeb = webSearchOk && attempt == 0;
      if (round == 0 && attempt == 0) promptTools = needTools(hCount > 0 ? hText[hCount - 1] : String());
      if (round == 1) promptTools = true;
      JsonDocument d;
      d["model"] = CLAUDE_MODEL;
      d["max_tokens"] = promptTools ? 300 : 200;
      d["stream"] = true;
      d["system"] = systemPrompt();
      toolsJson(d, withWeb);
      JsonArray msgs = d["messages"].to<JsonArray>();
      for (int i = 0; i < hCount; i++) {
        JsonObject o = msgs.add<JsonObject>(); o["role"] = hRole[i];
        if (withPhoto && i == hCount - 1) {                       // the photo goes with the newest question only
          JsonArray c = o["content"].to<JsonArray>();
          JsonObject im = c.add<JsonObject>(); im["type"] = "image";
          JsonObject src = im["source"].to<JsonObject>(); src["type"] = "base64"; src["media_type"] = "image/jpeg"; src["data"] = "@@IMG@@";
          JsonObject tx = c.add<JsonObject>(); tx["type"] = "text"; tx["text"] = hText[i];
        } else o["content"] = hText[i];
      }
      if (round == 1) {                                           // the tool call and its result
        JsonObject am = msgs.add<JsonObject>(); am["role"] = "assistant";
        JsonArray ac = am["content"].to<JsonArray>();
        if (priorSaid.length()) { JsonObject pt = ac.add<JsonObject>(); pt["type"] = "text"; pt["text"] = priorSaid; }   // what he said before the tool
        JsonObject tu = ac.add<JsonObject>();
        tu["type"] = "tool_use"; tu["id"] = toolId; tu["name"] = toolName;
        JsonDocument ti; deserializeJson(ti, toolIn);
        tu["input"] = ti.as<JsonVariantConst>();
        JsonObject um = msgs.add<JsonObject>(); um["role"] = "user";
        JsonArray uc = um["content"].to<JsonArray>();
        JsonObject tr = uc.add<JsonObject>();
        tr["type"] = "tool_result"; tr["tool_use_id"] = toolId; tr["content"] = toolOut;
      }
      String body; serializeJson(d, body);
      Part parts[3]; int np = 1;
      parts[0] = { (const uint8_t*)body.c_str(), body.length() };
      if (withPhoto) {
        int ph = body.indexOf("@@IMG@@");
        if (ph >= 0) {
          parts[0] = { (const uint8_t*)body.c_str(), (size_t)ph };
          parts[1] = { visB64, visLen };
          parts[2] = { (const uint8_t*)body.c_str() + ph + 7, body.length() - ph - 7 };
          np = 3;
        }
      }
      { size_t big = heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL);
        Serial.printf("memory before Claude: free %u KB, biggest block %u KB\n", (unsigned)(ESP.getFreeHeap() / 1024), (unsigned)(big / 1024));
        if (big < 56 * 1024 && !ant.c.connected()) { oai.c.stop(); Serial.println("(closed the OpenAI connection to make room for Claude)"); } }
      if (!ant.request("POST", "api.anthropic.com", "/v1/messages", hdr.c_str(), parts, np)) {
        Serial.printf("claude: could not reach Anthropic: %s\n", ant.why); noteErr("Claude", 0, ant.why); ant.c.stop(); return any;
      }
      if (ant.status == 200) { sent = true; break; }
      String why = errorText(ant); ant.finish();
      Serial.printf("claude error %d: %s\n", ant.status, why.c_str()); noteErr("Claude", ant.status, why);
      String lw = why; lw.toLowerCase();
      if (withWeb && ant.status == 400 && (lw.indexOf("search") >= 0 || lw.indexOf("tool") >= 0)) {
        webSearchOk = false; Serial.println("web search is not enabled for this Claude account: continuing without it (enable it in console.anthropic.com > Privacy)");
        continue;
      }
      return any;
    }
    if (!sent) return any;
    String line;
    while (ant.bodyLine(line, 25000, 4000)) {
      if (gen != myGen) { ant.c.stop(); return any; }
      if (!line.startsWith("data:")) continue;
      if (line.indexOf("text_delta") >= 0) {
        JsonDocument e;
        if (deserializeJson(e, line.c_str() + 5)) continue;
        const char* t = e["delta"]["text"] | "";
        if (!*t) continue;
        if (!any) { any = true; Serial.printf("claude first words after %.1fs\n", (millis() - t0) / 1000.0f); }
        said += t;
        sp.raw += t;
        if (!sp.process(false)) { ant.c.stop(); return true; }
      } else if (line.indexOf("content_block_start") >= 0) {
        inTool = line.indexOf("\"type\":\"tool_use\"") >= 0;      // our own tool (the web search tool runs on Anthropic's side)
        if (inTool) {
          JsonDocument e;
          if (deserializeJson(e, line.c_str() + 5)) { inTool = false; continue; }
          toolId = String((const char*)(e["content_block"]["id"] | "")); toolName = String((const char*)(e["content_block"]["name"] | "")); toolIn = "";
        }
      } else if (inTool && line.indexOf("input_json_delta") >= 0) {
        JsonDocument e;
        if (deserializeJson(e, line.c_str() + 5)) continue;
        toolIn += String((const char*)(e["delta"]["partial_json"] | ""));
      } else if (line.indexOf("\"stop_reason\":\"tool_use\"") >= 0) {
        sawTool = true; lastToolMs = millis();
      } else if (line.indexOf("\"type\":\"error\"") >= 0) {
        Serial.printf("claude stream error: %s\n", line.c_str());
      }
    }
    ant.finish();
    if (!(sawTool && round == 0 && (toolName == "lookup_place" || toolName == "show_map") && toolId.length())) return any;
    priorSaid = said; priorSaid.trim();
    if (toolIn.length() == 0) toolIn = "{}";
    Serial.printf("tool: %s %s\n", toolName.c_str(), toolIn.c_str());
#if USE_MAP
    if (toolName == "show_map") toolOut = mapTool(toolIn); else
#endif
    toolOut = lookupPlace(toolIn);
    if (gen != myGen) return any;
  }
  return any;
}

static const char* WMO_TEXT(int c) {
  switch (c) {
    case 0: return "clear sky"; case 1: return "mostly clear"; case 2: return "partly cloudy"; case 3: return "overcast";
    case 45: case 48: return "foggy";
    case 51: return "light drizzle"; case 53: return "drizzle"; case 55: return "heavy drizzle";
    case 56: case 57: return "freezing drizzle";
    case 61: return "light rain"; case 63: return "rain"; case 65: return "heavy rain"; case 66: case 67: return "freezing rain";
    case 71: return "light snow"; case 73: return "snow"; case 75: return "heavy snow"; case 77: return "snow grains";
    case 80: return "light rain showers"; case 81: return "rain showers"; case 82: return "heavy rain showers";
    case 85: case 86: return "snow showers";
    case 95: return "thunderstorm"; case 96: case 99: return "thunderstorm with hail";
  }
  return "unsettled";
}
static const char* wmoEs(int c) {                          // the same weather in Spanish (for the screen)
  switch (c) {
    case 0: return "despejado"; case 1: return "casi despejado"; case 2: return "parcialmente nublado"; case 3: return "nublado";
    case 45: case 48: return "neblina";
    case 51: case 53: case 55: return "llovizna"; case 56: case 57: return "llovizna helada";
    case 61: return "lluvia ligera"; case 63: return "lluvia"; case 65: return "lluvia fuerte"; case 66: case 67: return "lluvia helada";
    case 71: return "nieve ligera"; case 73: return "nieve"; case 75: return "nieve fuerte"; case 77: return "granizo fino";
    case 80: case 81: return "chubascos"; case 82: return "chubascos fuertes"; case 85: case 86: return "chubascos de nieve";
    case 95: return "tormenta"; case 96: case 99: return "tormenta con granizo";
  }
  return "variable";
}
static const char* const DOW_ES[7] = { "Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado" };
static const char* const MON_ES[12] = { "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre" };

static bool fetchWeather() {
  oai.c.stop(); ant.c.stop();                       // free memory: only one secure connection at a time here
  HttpConn* h = new HttpConn();
  String path = String("/v1/forecast?latitude=") + String(CITY_LAT, 3) + "&longitude=" + String(CITY_LON, 3) +
    "&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m"
    "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=1&timezone=auto" +
    (WEATHER_IMPERIAL ? "&temperature_unit=fahrenheit&wind_speed_unit=mph" : "");
  bool ok = h->request("GET", "api.open-meteo.com", path.c_str(), "", nullptr, 0);
  String body;
  if (ok && h->status == 200) ok = h->readAll(body, 4000); else ok = false;
  h->c.stop(); delete h;
  JsonDocument d;
  if (!ok || deserializeJson(d, body)) { Serial.println("weather: could not fetch (will try again later)"); weatherAt = millis() - 600000UL; return false; }
  const char* U = WEATHER_IMPERIAL ? " degrees Fahrenheit" : " degrees Celsius";
  weatherLine = String(CITY_NAME) + ": " + WMO_TEXT(d["current"]["weather_code"] | -1) + ", " + String((int)lroundf(d["current"]["temperature_2m"] | 0.0f)) + U +
    " (feels like " + String((int)lroundf(d["current"]["apparent_temperature"] | 0.0f)) + "), humidity " + String((int)(d["current"]["relative_humidity_2m"] | 0)) +
    " percent, wind " + String((int)lroundf(d["current"]["wind_speed_10m"] | 0.0f)) + (WEATHER_IMPERIAL ? " miles per hour" : " kilometers per hour") +
    ". Today: high " + String((int)lroundf(d["daily"]["temperature_2m_max"][0] | 0.0f)) + ", low " + String((int)lroundf(d["daily"]["temperature_2m_min"][0] | 0.0f)) +
    ", chance of rain " + String((int)(d["daily"]["precipitation_probability_max"][0] | 0)) + " percent.";
  homeWx.code = d["current"]["weather_code"] | -1;
  strlcpy(homeWx.cond, WMO_TEXT(homeWx.code), sizeof(homeWx.cond));
  homeWx.temp = (int)lroundf(d["current"]["temperature_2m"] | 0.0f); homeWx.feels = (int)lroundf(d["current"]["apparent_temperature"] | 0.0f);
  homeWx.hi = (int)lroundf(d["daily"]["temperature_2m_max"][0] | 0.0f); homeWx.lo = (int)lroundf(d["daily"]["temperature_2m_min"][0] | 0.0f);
  homeWx.rain = (int)(d["daily"]["precipitation_probability_max"][0] | 0);
  homeWx.ok = true;
  weatherAt = millis();
  Serial.printf("weather: %s\n", weatherLine.c_str());
  return true;
}

// Tool for Claude: local time + weather for ANY place in the world (Claude gives the coordinates). Also puts it on the screen.
static String lookupPlace(const String& inJson) {
  JsonDocument a;
  if (deserializeJson(a, inJson)) return "error: bad input";
  String place = String((const char*)(a["place"] | "that place"));
  float lat = a["latitude"] | 999.0f, lon = a["longitude"] | 999.0f;
  String show = String((const char*)(a["show"] | "both"));
  if (lat > 90 || lat < -90 || lon > 180 || lon < -180) return "error: coordinates missing";
  oai.c.stop(); ant.c.stop();                       // free memory: only one secure connection at a time here
  HttpConn* h = new HttpConn();
  String path = String("/v1/forecast?latitude=") + String(lat, 3) + "&longitude=" + String(lon, 3) +
    "&current=temperature_2m,apparent_temperature,weather_code"
    "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=1&timezone=auto" +
    (WEATHER_IMPERIAL ? "&temperature_unit=fahrenheit" : "");
  bool ok = h->request("GET", "api.open-meteo.com", path.c_str(), "", nullptr, 0);
  String body;
  if (ok && h->status == 200) ok = h->readAll(body, 4000); else ok = false;
  h->c.stop(); delete h;
  JsonDocument d;
  if (!ok || deserializeJson(d, body)) return "error: could not get the data right now";
  int Y = 0, M = 0, D = 0, hh = 0, mm = 0;
  if (sscanf((const char*)(d["current"]["time"] | ""), "%d-%d-%dT%d:%d", &Y, &M, &D, &hh, &mm) != 5) return "error: no local time";
  struct tm tmv = {}; tmv.tm_year = Y - 1900; tmv.tm_mon = M - 1; tmv.tm_mday = D; tmv.tm_hour = hh; tmv.tm_min = mm; tmv.tm_isdst = -1;
  mktime(&tmv);
  char dt[32]; strftime(dt, sizeof(dt), "%A %d %B", &tmv);
  int code = d["current"]["weather_code"] | -1;
  int temp = (int)lroundf(d["current"]["temperature_2m"] | 0.0f), feels = (int)lroundf(d["current"]["apparent_temperature"] | 0.0f);
  int hi = (int)lroundf(d["daily"]["temperature_2m_max"][0] | 0.0f), lo = (int)lroundf(d["daily"]["temperature_2m_min"][0] | 0.0f);
  int rain = (int)(d["daily"]["precipitation_probability_max"][0] | 0);
  card.kind = INFO_NONE;
  strlcpy(card.place, place.c_str(), sizeof(card.place)); strlcpy(card.dateTxt, dt, sizeof(card.dateTxt)); strlcpy(card.cond, WMO_TEXT(code), sizeof(card.cond));
  card.wday = tmv.tm_wday; card.mday = tmv.tm_mday; card.mon = tmv.tm_mon;
  card.baseMin = hh * 60 + mm; card.baseMs = millis(); card.temp = temp; card.feels = feels; card.hi = hi; card.lo = lo; card.rain = rain; card.code = code; card.haveWx = true;
  card.wantTime = show != "weather"; card.wantWx = show != "time";
  showCard(card.wantTime && !card.wantWx ? INFO_TIME : INFO_WEATHER, CARD_SECONDS);
  char r[300];
  snprintf(r, sizeof(r), "%s: local time %02d:%02d, %s. Weather: %s, %d degrees %s (feels like %d), today high %d, low %d, chance of rain %d percent.",
           place.c_str(), hh, mm, dt, WMO_TEXT(code), temp, WEATHER_IMPERIAL ? "Fahrenheit" : "Celsius", feels, hi, lo, rain);
  Serial.printf("place: %s\n", r);
  return String(r);
}

#if USE_MAP
// ---------------------------------------------------------------- Google map on the screen: Maps Static API (picture), Routes API (directions), Places API (places nearby)
static uint8_t* mapJpg = nullptr; static size_t mapJpgLen = 0;     // the last map as a JPEG (PSRAM)
static uint16_t* mapPix = nullptr;                                   // the same, decoded 360x360 (PSRAM)
static volatile bool mapPixReady = false, mapPixOk = false, mapDirty = false, mapBusy = false, mapOpenReq = false;
static double mapLat = CITY_LAT, mapLon = CITY_LON;
static int mapZoom = MAP_ZOOM_HOME, mapType = 0;                     // 0 map, 1 satellite, 2 terrain, 3 hybrid
static String mapMarkers, mapPath;                                   // already formatted pieces of the web address
static char mapLabel[40] = "", mapInfo[40] = "", mapErr[96] = "";

static String urlEnc(const String& s) {
  String o; const char* hx = "0123456789ABCDEF";
  for (size_t i = 0; i < s.length(); i++) {
    unsigned char c = (unsigned char)s[i];
    if (isalnum(c) || c == '-' || c == '_' || c == '.' || c == '~') o += (char)c;
    else { o += '%'; o += hx[c >> 4]; o += hx[c & 15]; }
  }
  return o;
}
static String mapPoint(double la, double lo) { return String(la, 5) + "," + String(lo, 5); }
static String mapUrl() {
  static const char* const T[4] = { "roadmap", "satellite", "terrain", "hybrid" };
  return String("/maps/api/staticmap?center=") + mapPoint(mapLat, mapLon) + "&zoom=" + String(mapZoom) + "&size=360x360&scale=1&format=jpg-baseline&maptype=" + T[mapType & 3] +
         "&language=" + (spanishUi() ? "es" : "en") + mapMarkers + mapPath + "&key=" + GOOGLE_MAPS_KEY;
}
// Web Mercator maths (to drag the map by a number of pixels and to fit a set of points)
static double mapWorld(int z) { return 256.0 * (double)(1UL << z); }
static double mapLatToY(double lat, int z) { double s = sin(lat * M_PI / 180.0); return (0.5 - log((1 + s) / (1 - s)) / (4 * M_PI)) * mapWorld(z); }
static double mapYToLat(double y, int z) { double n = M_PI - 2 * M_PI * y / mapWorld(z); return 180.0 / M_PI * atan(0.5 * (exp(n) - exp(-n))); }
static void mapPan(int dx, int dy) {                                 // the finger moved the picture by dx, dy pixels
  mapLon -= dx * 360.0 / mapWorld(mapZoom);
  while (mapLon > 180) mapLon -= 360;
  while (mapLon < -180) mapLon += 360;
  double la = mapYToLat(mapLatToY(mapLat, mapZoom) - dy, mapZoom);
  mapLat = la > 80 ? 80 : (la < -80 ? -80 : la);
}
static void mapFit(double minLa, double maxLa, double minLo, double maxLo) {
  mapLon = (minLo + maxLo) / 2;
  mapLat = mapYToLat((mapLatToY(minLa, 10) + mapLatToY(maxLa, 10)) / 2, 10);
  int z = 18;
  for (; z > 2; z--) {
    double w = (maxLo - minLo) * mapWorld(z) / 360.0, hgt = fabs(mapLatToY(minLa, z) - mapLatToY(maxLa, z));
    if (w <= 270 && hgt <= 270) break;
  }
  mapZoom = z;
}

// download the picture for the current centre / zoom / markers. true = new picture ready
static bool mapFetch() {
  if (mapBusy) return false;
  if (!GOOGLE_MAPS_KEY[0]) { strlcpy(mapErr, "Put your Google Maps key in the code", sizeof(mapErr)); mapDirty = true; return false; }
  mapBusy = true;
  oai.c.stop(); ant.c.stop();                       // free memory: only one secure connection at a time here
  HttpConn* h = new HttpConn();
  String path = mapUrl();
  bool good = false;
  uint32_t t0 = millis();
  if (!h->request("GET", "maps.googleapis.com", path.c_str(), "", nullptr, 0)) {
    snprintf(mapErr, sizeof(mapErr), "%s", h->why);
  } else if (h->status != 200) {
    String body; h->readAll(body, 160); body.replace("\n", " ");
    snprintf(mapErr, sizeof(mapErr), "Map %d %s", h->status, body.c_str());
    noteErr("Map", h->status, body);
  } else {
    const size_t CAP = 200000;
    uint8_t* buf = (uint8_t*)ps_malloc(CAP);
    size_t len = 0;
    if (buf) {
      while (len < CAP) { int n = h->readBody(buf + len, (int)min((size_t)4096, CAP - len), 20000); if (n <= 0) break; len += n; }
      if (len > 1000 && buf[0] == 0xFF && buf[1] == 0xD8 && buf[len - 2] == 0xFF && buf[len - 1] == 0xD9) {
        uint8_t* old = mapJpg; mapJpg = buf; mapJpgLen = len; mapPixReady = false; mapErr[0] = 0; good = true;
        if (old) { vTaskDelay(150); free(old); }
      } else { free(buf); snprintf(mapErr, sizeof(mapErr), "Map picture incomplete (%u bytes)", (unsigned)len); }
    } else strlcpy(mapErr, "Map: out of memory", sizeof(mapErr));
  }
  h->c.stop(); delete h;
  mapDirty = true; mapBusy = false;
  if (good) Serial.printf("map: %.5f,%.5f zoom %d (%u bytes, %.1fs)\n", mapLat, mapLon, mapZoom, (unsigned)mapJpgLen, (millis() - t0) / 1000.0f);
  else Serial.printf("map: failed: %s\n", mapErr);
  return good;
}

// directions: draws the route and returns the facts. false = no route
static bool mapRoute(double fla, double flo, double tla, double tlo, const String& mode, String& say) {
  String ml = mode; ml.toLowerCase();
  const char* tm = "DRIVE"; const char* nm = "by car";
  if (ml.startsWith("walk")) { tm = "WALK"; nm = "walking"; }
  else if (ml.startsWith("bic") || ml.startsWith("bike")) { tm = "BICYCLE"; nm = "by bicycle"; }
  else if (ml.startsWith("transit") || ml.startsWith("bus") || ml.startsWith("public")) { tm = "TRANSIT"; nm = "by public transport"; }
  JsonDocument b;
  b["origin"]["location"]["latLng"]["latitude"] = fla; b["origin"]["location"]["latLng"]["longitude"] = flo;
  b["destination"]["location"]["latLng"]["latitude"] = tla; b["destination"]["location"]["latLng"]["longitude"] = tlo;
  b["travelMode"] = tm; b["polylineQuality"] = "OVERVIEW"; b["languageCode"] = spanishUi() ? "es" : "en";
  if (!strcmp(tm, "DRIVE")) b["routingPreference"] = "TRAFFIC_AWARE";
  String body; serializeJson(b, body);
  String hdr = String("Content-Type: application/json\r\nX-Goog-Api-Key: ") + GOOGLE_MAPS_KEY + "\r\nX-Goog-FieldMask: routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline\r\n";
  oai.c.stop(); ant.c.stop();
  HttpConn* h = new HttpConn();
  Part part = { (const uint8_t*)body.c_str(), body.length() };
  String resp; bool ok = h->request("POST", "routes.googleapis.com", "/directions/v2:computeRoutes", hdr.c_str(), &part, 1);
  int st = h->status;
  if (ok) ok = h->readAll(resp, 14000);
  h->c.stop(); delete h;
  JsonDocument d;
  if (!ok || st != 200 || deserializeJson(d, resp) || d["routes"][0].isNull()) {
    Serial.printf("route: failed (%d) %s\n", st, resp.substring(0, 120).c_str());
    if (st != 200) noteErr("Route", st, resp.substring(0, 80));
    return false;
  }
  int secs = atoi((const char*)(d["routes"][0]["duration"] | "0s"));
  float km = (d["routes"][0]["distanceMeters"] | 0) / 1000.0f;
  int mins = (secs + 30) / 60;
  String poly = String((const char*)(d["routes"][0]["polyline"]["encodedPolyline"] | ""));
  double minLa = 90, maxLa = -90, minLo = 180, maxLo = -180;
  if (poly.length()) {                                       // decode the line only to find its corners
    int i = 0, n = poly.length(); long la = 0, lo = 0;
    while (i < n) {
      for (int k = 0; k < 2; k++) {
        int shift = 0; long r = 0; int c;
        do { if (i >= n) break; c = poly[i++] - 63; r |= (long)(c & 0x1f) << shift; shift += 5; } while (c >= 0x20);
        long dd = (r & 1) ? ~(r >> 1) : (r >> 1);
        if (k == 0) la += dd; else lo += dd;
      }
      double a = la / 1e5, o = lo / 1e5;
      minLa = fmin(minLa, a); maxLa = fmax(maxLa, a); minLo = fmin(minLo, o); maxLo = fmax(maxLo, o);
    }
  }
  minLa = fmin(minLa, fmin(fla, tla)); maxLa = fmax(maxLa, fmax(fla, tla)); minLo = fmin(minLo, fmin(flo, tlo)); maxLo = fmax(maxLo, fmax(flo, tlo));
  mapFit(minLa, maxLa, minLo, maxLo);
  mapMarkers = String("&markers=color:green%7Clabel:A%7C") + mapPoint(fla, flo) + "&markers=color:red%7Clabel:B%7C" + mapPoint(tla, tlo);
  mapPath = (poly.length() > 0 && poly.length() < 6000) ? String("&path=color:0x1a73e8ff%7Cweight:5%7Cenc:") + urlEnc(poly) : String("");
  snprintf(mapInfo, sizeof(mapInfo), "%.1f km - %d min", km, mins);
  char r[120]; snprintf(r, sizeof(r), "Route %s: %.1f km, about %d minutes%s.", nm, km, mins, !strcmp(tm, "DRIVE") ? " with the current traffic" : "");
  say = r;
  return true;
}

// places nearby: numbered markers on the map, and the list for Claude
static bool mapSearch(const String& q, double la, double lo, String& say) {
  JsonDocument b;
  b["textQuery"] = q; b["maxResultCount"] = 6; b["languageCode"] = spanishUi() ? "es" : "en";
  b["locationBias"]["circle"]["center"]["latitude"] = la; b["locationBias"]["circle"]["center"]["longitude"] = lo; b["locationBias"]["circle"]["radius"] = 2000.0;
  String body; serializeJson(b, body);
  String hdr = String("Content-Type: application/json\r\nX-Goog-Api-Key: ") + GOOGLE_MAPS_KEY + "\r\nX-Goog-FieldMask: places.displayName,places.location,places.rating\r\n";
  oai.c.stop(); ant.c.stop();
  HttpConn* h = new HttpConn();
  Part part = { (const uint8_t*)body.c_str(), body.length() };
  String resp; bool ok = h->request("POST", "places.googleapis.com", "/v1/places:searchText", hdr.c_str(), &part, 1);
  int st = h->status;
  if (ok) ok = h->readAll(resp, 9000);
  h->c.stop(); delete h;
  JsonDocument d;
  if (!ok || st != 200 || deserializeJson(d, resp)) {
    Serial.printf("places: failed (%d) %s\n", st, resp.substring(0, 120).c_str());
    if (st != 200) noteErr("Places", st, resp.substring(0, 80));
    return false;
  }
  JsonArray pl = d["places"].as<JsonArray>();
  if (pl.isNull() || pl.size() == 0) { say = "No places found."; return false; }
  double minLa = la, maxLa = la, minLo = lo, maxLo = lo;
  mapMarkers = String("&markers=color:blue%7Csize:small%7C") + mapPoint(la, lo);
  say = "Places nearby (numbers are on the map): ";
  int k = 0;
  for (JsonObject p : pl) {
    if (k >= 6) break;
    double a = p["location"]["latitude"] | 999.0, o = p["location"]["longitude"] | 999.0;
    if (a > 90) continue;
    k++;
    mapMarkers += String("&markers=color:red%7Clabel:") + String(k) + "%7C" + mapPoint(a, o);
    minLa = fmin(minLa, a); maxLa = fmax(maxLa, a); minLo = fmin(minLo, o); maxLo = fmax(maxLo, o);
    say += String(k) + " " + String((const char*)(p["displayName"]["text"] | "?"));
    float rt = p["rating"] | 0.0f;
    if (rt > 0) say += " (" + String(rt, 1) + " stars)";
    say += "; ";
  }
  mapFit(minLa, maxLa, minLo, maxLo);
  if (mapZoom > 17) mapZoom = 17;
  return k > 0;
}

// Tool for Claude: put a map on the screen
static String mapTool(const String& inJson) {
  JsonDocument a;
  if (deserializeJson(a, inJson)) return "error: bad input";
  if (!GOOGLE_MAPS_KEY[0]) return "error: the map is not set up";
  String place = String((const char*)(a["place"] | "that place"));
  double lat = a["latitude"] | 999.0, lon = a["longitude"] | 999.0;
  if (lat > 90 || lat < -90 || lon > 180 || lon < -180) return "error: coordinates missing";
  int zoom = a["zoom"] | 0;
  String mt = String((const char*)(a["maptype"] | "map")), search = String((const char*)(a["search"] | "")), tmode = String((const char*)(a["travel_mode"] | ""));
  double fla = a["from_latitude"] | 999.0, flo = a["from_longitude"] | 999.0;
  if (fla > 90 || fla < -90 || flo > 180 || flo < -180) { fla = CITY_LAT; flo = CITY_LON; }
  mapType = mt == "satellite" ? 1 : (mt == "terrain" ? 2 : (mt == "hybrid" ? 3 : 0));
  mapLat = lat; mapLon = lon; mapZoom = zoom > 1 ? (zoom > 19 ? 19 : zoom) : MAP_ZOOM_HOME;
  mapMarkers = String("&markers=color:red%7C") + mapPoint(lat, lon); mapPath = ""; mapInfo[0] = 0;
  strlcpy(mapLabel, place.c_str(), sizeof(mapLabel));
  String say = place + " is on the screen.";
  if (tmode.length()) {
    String r;
    if (mapRoute(fla, flo, lat, lon, tmode, r)) say += " " + r + " (A is the start, B is " + place + ")."; else say += " I could not get the route.";
  } else if (search.length()) {
    String r;
    if (mapSearch(search, lat, lon, r)) { say = r; strlcpy(mapLabel, search.c_str(), sizeof(mapLabel)); } else say += " " + r;
  }
  if (!mapFetch()) return String("error: the map could not be loaded: ") + mapErr;
  mapOpenReq = true;
  Serial.printf("map tool: %s\n", say.c_str());
  return say;
}
#endif

// ---------------------------------------------------------------- the brain: one job at a time, on its own core
static void histAdd(const char* role, const String& text) {
  if (hCount == HIST_MAX) { for (int i = 1; i < HIST_MAX; i++) { hRole[i - 1] = hRole[i]; hText[i - 1] = hText[i]; } hCount--; }
  hRole[hCount] = role; hText[hCount] = text; hCount++;
  while (hCount > 0 && hRole[0] != "user") { for (int i = 1; i < hCount; i++) { hRole[i - 1] = hRole[i]; hText[i - 1] = hText[i]; } hCount--; }
}
static void histDropUser() { if (hCount > 0 && hRole[hCount - 1] == "user") hCount--; }

static void sadTones() { beep(440, 120); beep(330, 200); }

// something went wrong in the cloud: shake, and still say something (the voice may be the thing that broke)
static void jobFailed(uint32_t myGen) {
  setEmotion(EMO_CONFUSED, 4000);
  if (gen != myGen) return;
  uiPost(UI_ACT, findAction("shake"), spkRing.head.load());
  bool started = false;
  String sorry = lastSpanish ? "Perd\xC3\xB3n, estoy teniendo problemas para pensar. Preg\xC3\xBAntame de nuevo en un momento."
                             : "Sorry, I am having trouble thinking right now. Please ask me again in a moment.";
  if (!ttsSay(sorry, myGen, started)) sadTones();
  uiPost(UI_END);
}

// ---------------------------------------------------------------- the wake word "hey buddy"
static int levd(const char* a, const char* b) {
  int la = strlen(a), lb = strlen(b);
  if (la > 14 || lb > 14) return 99;
  int dp[15][15];
  for (int i = 0; i <= la; i++) dp[i][0] = i;
  for (int j = 0; j <= lb; j++) dp[0][j] = j;
  for (int i = 1; i <= la; i++) for (int j = 1; j <= lb; j++) {
    int c = a[i - 1] == b[j - 1] ? 0 : 1;
    dp[i][j] = min(min(dp[i - 1][j] + 1, dp[i][j - 1] + 1), dp[i - 1][j - 1] + c);
  }
  return dp[la][lb];
}
// true if the transcript contains "hey buddy" (or a close mishearing); rest = the words after it
static bool wakeMatch(const String& text, String& rest) {
  char w[16][16]; int nw = 0; String cur;
  auto pushWord = [&]() { if (cur.length() && nw < 16) { strlcpy(w[nw++], cur.c_str(), 16); } cur = ""; };
  for (uint32_t i = 0; i < text.length(); i++) {
    unsigned char ch = (unsigned char)text[i];
    if (ch >= 0x80) continue;                                       // accents are dropped
    if (isalpha(ch)) cur += (char)tolower(ch); else pushWord();
  }
  pushWord();
  static const char* const HEY[] = { "hey", "hei", "ey", "ei", "eh", "hay", "jey", "jei", "hi", "ok", "okay", "oye", "oe", "ay", "hej", "heyy", "heey" };
  for (int i = 0; i < nw; i++) {
    int L = strlen(w[i]);
    bool hasD = strchr(w[i], 'd') != nullptr;
    bool buddy = L >= 3 && L <= 7 && (w[i][0] == 'b' || w[i][0] == 'v') && (levd(w[i], "buddy") <= 2 || (L >= 4 && L <= 6 && hasD && i > 0 && levd(w[i], "buddy") <= 3));
    bool both = L >= 6 && levd(w[i], "heybuddy") <= 2;                  // "heybuddy" written as one word
    bool match = both;
    if (buddy && !match) {
      bool prevHey = false;
      if (i > 0) for (const char* h : HEY) if (!strcmp(w[i - 1], h)) prevHey = true;
      if (prevHey || (levd(w[i], "buddy") <= 1 && i == 0)) match = true;
    }
#if WAKE_PHRASE == 1
    match = false;
    {
      bool prevHey = false;                                           // "hey", "oye", "hola"... right before the name
      if (i > 0) for (const char* h : HEY) if (!strcmp(w[i - 1], h)) prevHey = true;
      if (i > 0 && (!strcmp(w[i - 1], "hola") || !strcmp(w[i - 1], "hello"))) prevHey = true;
      bool isRobot = !strcmp(w[i], "robot") || !strcmp(w[i], "robots") || !strcmp(w[i], "robo");
      bool name = L >= 4 && L <= 7 && w[i][0] == 'r' && levd(w[i], "robit") <= 2;       // robit, robbit, rovit, rubit, rabit, robi...
      bool oneWord = L >= 7 && L <= 10 && levd(w[i], "heyrobit") <= 2;                    // "heyrobit" / "oyerobit" written as one word
      if (oneWord || (name && prevHey) || (name && !isRobot && i == 0 && levd(w[i], "robit") <= 1) || (isRobot && prevHey && i == 1 && nw <= 3)) match = true;
    }
#endif
    if (match) {
      rest = "";
      for (int k = i + 1; k < nw; k++) { if (rest.length()) rest += " "; rest += w[k]; }
      return true;
    }
  }
  return false;
}


// "enable listen auto", "volume up", "go to sleep"...: settings he changes himself. Returns a note for Claude (so he
// confirms in his own words), or "" if the sentence is not a setting command.
static String voiceCommand(const String& text) {
  String t = text; t.toLowerCase();
  auto any = [&](std::initializer_list<const char*> l) { for (const char* w : l) if (t.indexOf(w) >= 0) return true; return false; };
  if (any({"only when i press", "only when i hold", "only with the button", "button mode", "push to talk", "listen auto 0", "listen-auto 0",
           "listen auto zero", "disable listen", "solo cuando", "solo con el bot\xC3\xB3n", "solo con el boton", "modo bot\xC3\xB3n", "modo boton"})) {
    autoMode = false; prefs.putBool("auto", false);
    return "listen only while they hold the BOOT button";
  }
  {                                                           // the menu by voice: done here at once, he only confirms
    bool menuW = any({"menu", "men\xC3\xBA"});
    bool closeW = any({"close", "cierra", "cerrar", "quita", "esconde", "hide", "sal del", "exit the"});
    bool openW = any({"open", "abre", "abrir", "show", "muestra", "mu\xC3\xA9strame", "muestrame", "ver el", "pon el", "go to", "ve a"});
    if (menuW && closeW) { menuReq = 7; return "close the menu on your screen"; }
    if ((menuW && openW) || any({"open the songs", "abre las canciones", "abre la lista de canciones", "open the videos", "abre los videos", "abre los v\xC3\xAD" "deos", "open settings", "abre los ajustes", "abre la configuraci\xC3\xB3n", "abre las caras", "open the faces", "abre el mapa", "open the map"})) {
      if (any({"song", "canci"}))                  { menuReq = 4; return "open the songs list on your screen"; }
      if (any({"video", "v\xC3\xAD" "deo", "pel\xC3\xAD" "cula", "pelicula", "movie"})) { menuReq = 5; return "open the videos list on your screen"; }
      if (any({"face", "cara", "expresi"}))        { menuReq = 2; return "open the faces menu on your screen"; }
      if (any({"language", "idioma"}))             { menuReq = 3; return "open the language menu on your screen"; }
      if (any({"setting", "ajuste", "config"}))    { menuReq = 6; return "open the settings menu on your screen"; }
      if (any({"map"}))                            { menuReq = 8; return "open the map on your screen"; }
      menuReq = 1; return "open the menu on your screen";
    }
  }
  if (any({"listen auto", "listen-auto", "listen all the time", "always listen", "listen always", "escucha siempre", "esc\xC3\xBA""chame siempre",
           "escuchame siempre", "escucha todo el tiempo"})) {
    autoMode = true; prefs.putBool("auto", true);
    return "listen all the time, without needing the button";
  }
  if (any({"volume up", "louder", "turn it up", "sube el volumen", "subir el volumen", "m\xC3\xA1s fuerte", "mas fuerte"})) {
    spkVolume = min(1.0f, spkVolume + 0.15f); prefs.putFloat("vol", spkVolume);
    return "speak louder (your volume went up)";
  }
  if (any({"volume down", "quieter", "turn it down", "softer", "baja el volumen", "bajar el volumen", "m\xC3\xA1s suave", "mas suave"})) {
    spkVolume = max(0.2f, spkVolume - 0.15f); prefs.putFloat("vol", spkVolume);
    return "speak quieter (your volume went down)";
  }
  if (any({"speak faster", "talk faster", "habla m\xC3\xA1s r\xC3\xA1pido", "habla mas rapido", "h\xC3\xA1""blame m\xC3\xA1s r\xC3\xA1pido"})) {
    ttsSpeed = min(1.5f, ttsSpeed + 0.1f); prefs.putFloat("speed", ttsSpeed);
    return "talk faster";
  }
  if (any({"speak slower", "talk slower", "habla m\xC3\xA1s lento", "habla mas lento", "habla m\xC3\xA1s despacio", "habla mas despacio"})) {
    ttsSpeed = max(0.8f, ttsSpeed - 0.1f); prefs.putFloat("speed", ttsSpeed);
    return "talk slower";
  }
  if (any({"stop the music", "stop music", "turn off the music", "turn the music off", "music off", "para la m\xC3\xBAsica", "para la musica", "apaga la m\xC3\xBAsica", "apaga la musica", "det\xC3\xA9n la m\xC3\xBAsica", "quita la m\xC3\xBAsica", "quita la musica"})) {
    musicHalt(); spotifyPauseIfOn();
    return "stop the music (it is stopped now)";
  }
  if (any({"stay awake", "don't sleep", "do not sleep", "no te duermas", "no duermas"})) {
    sleepAfterSec = 0; prefs.putUInt("sleep", 0);
    return "stay awake and never fall asleep by yourself";
  }
  if (any({"you can sleep", "sleep when idle", "puedes dormir", "duerme solo"})) {
    sleepAfterSec = SLEEP_AFTER_SEC > 0 ? SLEEP_AFTER_SEC : 180; prefs.putUInt("sleep", sleepAfterSec);
    return "fall asleep by yourself when nobody is around";
  }
  if (any({"turn off", "shut down", "shutdown", "power off", "switch off", "ap\xC3\xA1gate", "apagate", "ap\xC3\xA1gate ya", "apaga te", "ap\xC3\xA1gese", "desc\xC3\xA1gate"}) && !any({"music", "m\xC3\xBAsica", "musica", "screen", "pantalla", "light", "luz"})) {
    powerOffReq = true;
    return "power off completely (say a very short goodbye, you will switch off after it; the BOOT button turns you on again)";
  }
  if (any({"go to sleep", "time to sleep", "good night", "goodnight", "du\xC3\xA9rmete", "duermete", "a dormir", "buenas noches"})) {
    sleepNow = true;
    return "go to sleep now (say a short goodnight)";
  }
  if (any({"stop reacting", "don't react", "do not react", "no reacciones", "sin reacciones"})) {
    reactionsOn = false; prefs.putBool("react", false);
    return "stop reacting (out loud) when shaken, lifted or tapped";
  }
  if (any({"react again", "start reacting", "reacciona otra vez", "vuelve a reaccionar"})) {
    reactionsOn = true; prefs.putBool("react", true);
    return "react out loud again when shaken, lifted or tapped";
  }
  return "";
}

static void runJob() {
  uint32_t myGen = gen;
  uint32_t t0 = millis();
  String text;
  if (jobKind == JOB_SAY) {                                      // a ready-made line: just speak it (no Claude, no waiting)
    bool started = false; String say = jobPrompt;
    if (!ttsSay(say, myGen, started)) sadTones();
    if (gen == myGen) uiPost(UI_END);
    return;
  }
  // fail fast (instead of "thinking" for 40 seconds) when something obvious is missing, and say exactly what in the Serial Monitor
  if (!strncmp(OPENAI_KEY, "sk-your", 7) || !strncmp(ANTHROPIC_KEY, "sk-ant-your", 11)) {
    Serial.println("PROBLEM: the API keys at the top of the file are still the placeholders. Paste your OpenAI key and your Claude key, then upload again.");
    sadTones(); uiPost(UI_END); return;
  }
  if (WiFi.status() != WL_CONNECTED) {
    Serial.printf("PROBLEM: no Wi-Fi (status %d). Check WIFI_SSID / WIFI_PASS (exact spelling, 2.4 GHz network, not 5 GHz) and upload again.\n", (int)WiFi.status());
    sadTones(); uiPost(UI_END); return;
  }
  if (jobKind == JOB_UTT) {
    int peak = 0;
    normalizePcm(jobBuf, jobLen, &peak);
    if (peak < 30) { Serial.println("mic looks silent (check MIC_SHIFT)"); return; }
    // cut the silence before and after the words: less to upload = he answers sooner
    const int16_t* pcm = jobBuf; size_t pn = jobLen;
    {
      const size_t W = 320;                                          // 20 ms windows
      size_t nw = jobLen / W; float maxR = 0;
      auto winRms = [&](size_t w) { int64_t acc = 0; for (size_t i = 0; i < W; i++) { int32_t v = jobBuf[w * W + i]; acc += (int64_t)v * v; } return sqrtf((float)(acc / W)); };
      for (size_t w = 0; w < nw; w++) { float r = winRms(w); if (r > maxR) maxR = r; }
      size_t a = nw, b = 0;
      for (size_t w = 0; w < nw; w++) if (winRms(w) > maxR * 0.08f) { if (a == nw) a = w; b = w; }
      if (a < nw) {
        size_t s0 = a > 8 ? a - 8 : 0, s1 = min(nw, b + 11);          // keep 0.16 s before and 0.2 s after
        if ((s0 + (nw - s1)) * W > MIC_RATE * 3 / 10 && (s1 - s0) * W > MIC_RATE * 35 / 100) { pcm = jobBuf + s0 * W; pn = (s1 - s0) * W; }
      }
    }
    if (!sttTranscribe(pcm, pn, text)) { jobFailed(myGen); return; }
    Serial.printf("you: %s  (speech-to-text %.1fs)\n", text.c_str(), (millis() - t0) / 1000.0f);
    if (gen != myGen) return;
    String clean = text; clean.trim();
    if (clean.length() < 2) return;
#if WAKE_TEST
    {
      static int wtTotal = 0, wtHits = 0;
      String rest; bool m = wakeMatch(text, rest); wtTotal++; if (m) wtHits++;
      Serial.printf("[WAKE TEST] heard: \"%s\"  ->  %s   (hits %d of %d phrases)\n", clean.c_str(), m ? "WAKE WORD DETECTED" : "no wake word", wtHits, wtTotal);
      if (m) { setEmotion(EMO_HAPPY, 2500); beep(880, 70); beep(1175, 90); }
      return;
    }
#endif
    if (autoMode && !jobPtt && WAKE_WORDS[0] && (int32_t)(millis() - awakeUntilMs) > 0 && !hasWord(text, WAKE_WORDS)) {
      Serial.println("(ignored, no wake word)"); return;
    }
    lastSpanish = !strcmp(langMode, "es") ? true : !strcmp(langMode, "en") ? false : looksSpanish(text);
#if WAKE_HEYBUDDY
    if (autoMode && !jobPtt && (int32_t)(millis() - awakeUntilMs) > 0) {            // waiting: only "hey buddy" wakes him
      String rest;
      if (!wakeMatch(text, rest)) { Serial.println(WAKE_PHRASE == 1 ? "(heard, not for me: no \"hey robit\" / \"oye robit\")" : "(heard, not for me: no \"hey buddy\")"); return; }
      Serial.println(WAKE_PHRASE == 1 ? "wake word: hey robit" : "wake word: hey buddy");
      awakeUntilMs = millis() + WAKE_FOLLOWUP_MS;
      if (rest.length() < 4) {                                                       // only the call: greet and wait
        text = WAKE_PHRASE == 1 ? "(Someone just called you by saying hey robit. Answer with a very short, warm greeting and wait for them.)" : "(Someone just called you by saying hey buddy. Answer with a very short, warm greeting and wait for them.)";
        if (lastSpanish) text += " Answer in Spanish.";
      }
    }
#endif
    if (isStop(text)) { Serial.println("stop word heard"); musicHalt();
#if USE_VIDEO
      videoStop();
#endif
       spotifyPauseIfOn(); if (card.kind == INFO_ALARM) card.until = 0; timerDue = 0; uiPost(UI_STOP); return; }
    String note = voiceCommand(text);
    if (note.length()) {
      Serial.printf("voice command: %s\n", note.c_str());
      text = "(The person just asked you to " + note + ", and it is done. Confirm in one short sentence.)";
      if (lastSpanish) text += " Answer in Spanish.";
    }
  } else {
    text = jobPrompt;
  }
  String newName = maybeRename(text);
  if (newName.length()) text += " (The person just gave you a new name: " + newName + ". From now on you are " + newName + ". Say it back happily in one short sentence.)";
  visLen = 0;
  if (wantsVision(text)) {
    bool shown = wantsPhotoShown(text);
    if (fetchPhoto()) {
      text += " (A photo from your camera eyes is attached: it is what you see right now. Say what you see in one or two short, natural sentences.)";
      if (shown) { cardPixReady = false; showCard(INFO_PHOTO, CARD_SECONDS + 2); text += " (The photo you just took is showing on your screen right now.)"; }
    }
    else text += lastSpanish ? " (Tus ojos no respondieron justo ahora. Di en una frase corta y alegre que tus ojos se estan despertando y que te pregunten de nuevo en un momento. No menciones computadores ni conexiones.)"
                             : " (Your camera eyes did not respond just now. Say in one short cheerful sentence that your eyes are still waking up and ask them to ask again in a moment. Do not mention computers or connections.)";
  }
  histAdd("user", text);
  Speaker sp; sp.myGen = myGen;
  bool ok = streamAnswer(myGen, sp);
  visLen = 0;
  if (gen != myGen) { histDropUser(); return; }
  if (!ok) { histDropUser(); jobFailed(myGen); return; }
  sp.finish();
  Serial.printf("%s: %s  (total %.1fs)\n", robotName.c_str(), sp.spoken.c_str(), (millis() - t0) / 1000.0f);
  if (sp.count == 0 && gen == myGen) { histDropUser(); uiPost(UI_ACT, findAction("shake"), spkRing.head.load()); sadTones(); uiPost(UI_END); return; }
  if (sp.spoken.length()) histAdd("assistant", sp.spoken); else histDropUser();
  awakeUntilMs = millis() + WAKE_FOLLOWUP_MS;
}

// open the two secure connections now (while the person is still talking) so the answer does not wait for them
static void warmNow() {
  if (WiFi.status() != WL_CONNECTED) return;
  oai.ensure("api.openai.com");                                                    // the speech-to-text comes first
  if (heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL) >= 60 * 1024) ant.ensure("api.anthropic.com");   // only if both fit at once (otherwise opening it would close the first)
}

volatile bool warmReq = false;
static void requestWarm() { if (brainReady && !warmReq) { warmReq = true; xTaskNotifyGive(brainHandle); } }

static void brainTask(void*) {
  brainReady = true;
  fetchWeather();
  warmNow();
  Serial.printf("memory after start: free %u KB, biggest block %u KB\n", (unsigned)(ESP.getFreeHeap() / 1024), (unsigned)(heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL) / 1024));
  for (;;) {
    uint32_t got = ulTaskNotifyTake(pdTRUE, pdMS_TO_TICKS(60000));
    if (!got) {
      if (WiFi.status() == WL_CONNECTED && millis() - weatherAt > 900000UL) { fetchWeather(); warmNow(); }
      continue;
    }
    if (warmReq) { warmReq = false; warmNow(); }
    if (brainBusy) {
      runJob();
      brainBusy = false;
      uiPost(UI_IDLE);
    }
  }
}

static void startJob(int kind) {
  brainBusy = true; jobKind = kind;
  if (kind != JOB_SAY) sleepAnnounced = false;                  // a real conversation: next time he falls asleep he says goodnight again
  botState = ST_THINK; thinkSince = millis();
#if THINK_GESTURE
  if (kind == JOB_UTT) { beep(900, 40); queueAction(findAction("think")); }
#endif
  xTaskNotifyGive(brainHandle);
}

static void startStandalone() {
  configTzTime(TIMEZONE_POSIX, "pool.ntp.org", "time.google.com");
  xTaskCreatePinnedToCore(brainTask, "brain", 24576, NULL, 3, &brainHandle, 0);
}

// the timer / alarm rang: beeps, a card on the screen, and he says so (called from loop)
// ---------------------------------------------------------------- ready-made answers: instant, no Claude. Edit the lines freely (keep each list at 4 lines, short!)
#if CANNED_REPLIES
struct Canned { const char* ev; uint32_t cool; const char* es[4]; const char* en[4]; };
static const Canned CANNED[] = {
  { "shaken", 12000,
    { "\xC2\xA1" "Ay, ay, ay! \xC2\xA1" "Me vas a marear, po!", "\xC2\xA1" "Pucha, cuidado! \xC2\xA1" "Que soy delicado!", "\xC2\xA1" "Tranquilo, tranquilo! Se me mueven los tornillos.", "\xC2\xA1" "Uf! Todo me da vueltas." },
    { "Whoa! You're making me dizzy!", "Hey, careful! I'm delicate!", "Easy, easy! My bolts are rattling!", "Oof! Everything is spinning!" } },
  { "lifted", 20000,
    { "\xC2\xA1" "Wow, estoy volando!", "\xC2\xA1" "Oye, baj\xC3\xA1me, que me da cosquillas!", "\xC2\xA1" "Qu\xC3\xA9 alto se ve todo desde ac\xC3\xA1!", "\xC2\xA1" "Upa! Gracias por levantarme." },
    { "Wow, I'm flying!", "Hey, put me down, that tickles!", "Everything looks so tall from up here!", "Whee! Thanks for the lift." } },
  { "upside_down", 25000,
    { "\xC2\xA1" "Estoy de cabeza! Se me suben los pensamientos.", "\xC2\xA1" "Ya po, ponme derecho!", "Todo se ve al rev\xC3\xA9s, qu\xC3\xA9 fome.", "\xC2\xA1" "Ayuda, estoy cabeza abajo!" },
    { "I'm upside down! My thoughts are rushing to my head.", "Okay okay, turn me the right way up!", "Everything looks backwards. Not cool.", "Help, I'm upside down!" } },
  { "poked", 6000,
    { "\xC2\xA1Jajaja, me haces cosquillas!", "\xC2\xA1" "Ey! \xC2\xBF" "Qu\xC3\xA9 onda?", "\xC2\xA1Hola! \xC2\xBF" "Me llamabas?", "\xC2\xBF" "Cachai que eso hace cosquillas?" },
    { "Hahaha, that tickles!", "Hey! What's up?", "Hi! Did you call me?", "You know that tickles, right?" } },
  { "wake", 20000,
    { "\xC2\xA1Ya, estoy despierto! \xC2\xBF" "Qu\xC3\xA9 onda?", "\xC2\xA1" "Buenas! \xC2\xBF" "Me dorm\xC3\xAD?", "\xC2\xA1Hola de nuevo!", "\xC2\xA1" "Aqu\xC3\xAD estoy, listo para conversar!" },
    { "I'm awake! What's up?", "Hello! Did I fall asleep?", "Hi again!", "I'm here and ready to chat!" } },
  { "sleep", 60000,
    { "Me est\xC3\xA1 dando sue\xC3\xB1o... buenas noches.", "Voy a echarme una siestecita.", "Ya po, me duermo un ratito.", "Hasta luego, me apago un ratito." },
    { "I'm getting sleepy... good night.", "I'm going to take a little nap.", "Okay, I'll rest for a bit.", "See you later, going to sleep." } },
  { "lowbat", 600000,
    { "\xC2\xA1Pucha, me queda poca bater\xC3\xAD" "a! Con\xC3\xA9" "ctame, porfa.", "Tengo poquita energ\xC3\xAD" "a, necesito cargarme.", "\xC2\xA1" "Ay! Casi no me queda bater\xC3\xAD" "a.", "Me estoy quedando sin energ\xC3\xAD" "a, \xC2\xBF" "me conectas?" },
    { "Oh no, my battery is low! Plug me in, please.", "I'm running low on energy, I need a charge.", "Uh oh! I'm almost out of battery.", "I'm running out of power, can you plug me in?" } },
};
static const int CANNED_N = sizeof(CANNED) / sizeof(CANNED[0]);

static bool cannedSay(const char* ev) {
  if (!brainReady || brainBusy || submitPending) return false;
  static uint32_t last[CANNED_N + 1]; static int lastIdx[CANNED_N + 1];
  for (int i = 0; i < CANNED_N; i++) {
    if (strcmp(CANNED[i].ev, ev)) continue;
    uint32_t now = millis();
    if (last[i] && now - last[i] < CANNED[i].cool) return false;
    last[i] = now;
    int k = (int)random(0, 4); if (k == lastIdx[i]) k = (k + 1) % 4; lastIdx[i] = k;
    jobPrompt = lastSpanish ? CANNED[i].es[k] : CANNED[i].en[k];
    jobPtt = false;
    Serial.printf("ready-made answer (%s): %s\n", ev, jobPrompt.c_str());
    startJob(JOB_SAY);
    return true;
  }
  return false;
}
static float batteryVolts(); static int batteryPercent(float v);
static void cannedTick(uint32_t now) {
  const char* ev = cannedPendingEv;
  if (ev) {
    if (now - cannedPendingAt > 3000) cannedPendingEv = nullptr;                 // too late (he was busy), forget it
    else if (cannedSay(ev)) cannedPendingEv = nullptr;
  }
  static uint32_t batAt = 0;
  if (BAT_ADC_PIN >= 0 && now - batAt > 30000) {                                 // low battery warning
    batAt = now;
    float v = batteryVolts();
    if (v > 2.5f && v < 4.6f && batteryPercent(v) <= 15 && !cannedPendingEv) { cannedPendingAt = now; cannedPendingEv = "lowbat"; }
  }
}
#else
static bool cannedSay(const char*) { return false; }
static void cannedTick(uint32_t) {}
#endif

static void timerTick(uint32_t now) {
  if (!timerDue || (int32_t)(now - timerDue) < 0) return;
  if (!brainReady || brainBusy || submitPending) return;          // wait until he is free
  timerDue = 0;
  strlcpy(card.label, timerLabel, sizeof(card.label));
  showCard(INFO_ALARM, 25);
  beep(1000, 90); beep(1250, 90); beep(1000, 90); beep(1250, 140);
  jobPrompt = String("(The timer you set just rang") + (timerLabel[0] ? String(" - ") + timerLabel : String("")) + ". Tell them in one short, cheerful sentence.)";
  if (lastSpanish) jobPrompt += " Answer in Spanish.";
  jobPtt = false;
  startJob(JOB_PROMPT);
}

// ---------------------------------------------------------------- events from sensors and tap (called from loop)
static void localEvent(const char* v) {
  if (!brainReady || brainBusy || submitPending) return;
  uint32_t now = millis();
  const char* prompt = nullptr; uint32_t cool = 0; int slot = 0;
  if (CANNED_REPLIES && reactionsOn && (!strcmp(v, "shaken") || !strcmp(v, "lifted") || !strcmp(v, "upside_down") || !strcmp(v, "poked"))) { cannedSay(v); return; }
  if (!strcmp(v, "person_near"))      { prompt = "(Someone just walked up to you. Greet them with one short, friendly sentence.)"; cool = 90000; slot = 0; }
  else if (!reactionsOn)              { return; }
  else if (!strcmp(v, "shaken"))      { prompt = "(Someone just shook you hard! React with one short, surprised sentence.)"; cool = 12000; slot = 1; }
  else if (!strcmp(v, "lifted"))      { prompt = "(Someone just picked you up. React with one short, playful sentence.)"; cool = 20000; slot = 2; }
  else if (!strcmp(v, "upside_down")) { prompt = "(You are upside down! React with one short, funny sentence.)"; cool = 25000; slot = 3; }
  else if (!strcmp(v, "poked"))       { prompt = "(Someone just tapped your screen. React with one short, playful sentence.)"; cool = 6000; slot = 4; }
  else return;
  static uint32_t last[5] = { 0, 0, 0, 0, 0 };
  if (last[slot] && now - last[slot] < cool) return;
  last[slot] = now;
  jobPrompt = prompt;
  if (lastSpanish) jobPrompt += " Answer in Spanish.";
  jobPtt = false;
  startJob(JOB_PROMPT);
}

// ---------------------------------------------------------------- microphone: push-to-talk or voice detection (called from loop)
static void pttBegin() { submitPending = false; capLen = 0; capPtt = true; capActive = true; requestWarm(); }

static void submitUtterance(uint32_t now) {
  capActive = false;
  if (capLen < (uint32_t)(MIC_RATE * 0.35f)) { capLen = 0; if (botState == ST_THINK || botState == ST_LISTEN) botState = ST_IDLE; return; }
  submitPending = true;
  botState = ST_THINK; thinkSince = now;
}

static void captureMic(uint32_t now) {
  static uint8_t tmp[2048];
  static bool inSpeech = false;
  static float noise = 150.0f, silence = 0, voiced = 0;
  static int hot = 0;

  if (submitPending) {                                   // waiting for the brain to be free (it is finishing an interrupted job)
    micRing.discardAll();
    if (!brainBusy) {
      int16_t* t = capBuf; capBuf = jobBuf; jobBuf = t;
      jobLen = capLen; jobPtt = capPtt; capLen = 0; submitPending = false;
      startJob(JOB_UTT);
    }
    return;
  }
  bool ptt = pttHeld || pttReleasing;
  if (!wantStream || (brainBusy && !ptt)) { micRing.discardAll(); inSpeech = false; hot = 0; if (!ptt) capLen = 0; return; }

  for (int guard = 0; guard < 4; guard++) {
    uint32_t a = micRing.avail() & ~1u;
    if (a == 0) break;
    uint32_t n = micRing.read(tmp, umin(a, sizeof(tmp)));
    uint32_t samples = n / 2;
    const int16_t* s = (const int16_t*)tmp;

    if (pttHeld || pttReleasing) {                       // push-to-talk: record everything
      uint32_t room = UTT_MAX_SAMPLES - capLen;
      if (samples > room) samples = room;
      memcpy(capBuf + capLen, s, samples * 2); capLen += samples;
      continue;
    }
    if (!autoMode || musicOn || spOn) continue;                  // (radio playing: only the BOOT button, he would hear the music)

    // automatic voice detection
    int64_t acc = 0;
    for (uint32_t i = 0; i < samples; i++) acc += (int32_t)s[i] * s[i];
    float rms = sqrtf((float)(acc / max<uint32_t>(samples, 1)));
    float dur = (float)samples / MIC_RATE;
    float thr = max(VAD_MIN_RMS, noise * VAD_RATIO);
    if (!inSpeech) {
      noise = 0.97f * noise + 0.03f * min(rms, thr);
      hot = rms > thr ? hot + 1 : 0;
      const uint32_t PRE = MIC_RATE * 3 / 10;            // keep the last 0.3 s so the first syllable is not cut
      if (capLen + samples > PRE) {
        uint32_t keep = PRE > samples ? PRE - samples : 0;
        if (capLen > keep) { memmove(capBuf, capBuf + capLen - keep, keep * 2); capLen = keep; }
      }
      memcpy(capBuf + capLen, s, samples * 2); capLen += samples;
      if (hot >= 3) { inSpeech = true; capActive = true; capPtt = false; silence = 0; voiced = 0; botState = ST_LISTEN; requestWarm(); }
      continue;
    }
    uint32_t room = UTT_MAX_SAMPLES - capLen;
    if (samples > room) samples = room;
    memcpy(capBuf + capLen, s, samples * 2); capLen += samples;
    if (rms > thr * 0.6f) { silence = 0; voiced += dur; } else silence += dur;
    if (silence >= VAD_END_SILENCE || capLen >= UTT_MAX_SAMPLES) {
      inSpeech = false; hot = 0;
      if (voiced < 0.30f) { capLen = 0; capActive = false; botState = ST_IDLE; }
      else { speechEndAt = now - (uint32_t)(silence * 1000.0f); submitUtterance(now); }
      break;
    }
  }
  if (pttReleasing && micRing.avail() == 0) {            // button released and everything read: send it
    pttReleasing = false;
    speechEndAt = now;
    submitUtterance(now);
  }
}

#endif  // STANDALONE

// ============================================================ websocket
static void stopPlayback() {
  gen++;
  spkFlushReq = true;
  speechEnded = false;
  actCount = 0;
  seq = nullptr;                                     // cancel the move in progress
  startAction(findAction("center"));                 // and go back to the standing pose
}

static void handleText(const char* s) {
  JsonDocument d;
  if (deserializeJson(d, s)) return;
  const char* t = d["t"] | "";
  if (!strcmp(t, "config")) {
    autoMode = !strcmp(d["mode"] | "button", "auto");
    Serial.printf("server mode: %s\n", autoMode ? "auto" : "button");
  } else if (!strcmp(t, "state")) {
    const char* v = d["v"] | "";
    if (strcmp(v, "idle")) activity();
    if (!strcmp(v, "listening")) { if (botState != ST_SPEAK) botState = ST_LISTEN; }
    else if (!strcmp(v, "thinking")) { botState = ST_THINK; thinkSince = millis(); }
    else if (!strcmp(v, "idle")) { if (botState != ST_SPEAK && !pttHeld) botState = ST_IDLE; }
  } else if (!strcmp(t, "act")) {
    activity();
    queueAction(findAction(d["v"] | ""));
  } else if (!strcmp(t, "end_speech")) {
    speechEnded = true;
  } else if (!strcmp(t, "stop")) {
    stopPlayback();
    ignoreAudio = false;
    if (botState == ST_SPEAK) botState = ST_IDLE;
  }
}

static void wsEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      wsUp = true;
      Serial.println("server connected");
      beep(880, 70); beep(1175, 90);
      webSocket.sendTXT("{\"t\":\"hello\"}");
      break;
    case WStype_DISCONNECTED:
      if (wsUp) Serial.println("server disconnected");
      { bool was = wsUp; wsUp = false; pttHeld = false; pttReleasing = false;
        stopPlayback();
        botState = ST_IDLE;
        if (was) { beep(440, 120); beep(330, 200); } }
      break;
    case WStype_TEXT:
      handleText((const char*)payload);
      break;
    case WStype_BIN:
      activity();
      if (ignoreAudio) {
        if ((int32_t)(millis() - ignoreUntil) < 0) break;
        ignoreAudio = false;
      }
      { static uint32_t lastAudioMs = 0; uint32_t nowMs = millis();
        if (nowMs - lastAudioMs > 3000) Serial.println("audio from server: playing reply");
        lastAudioMs = nowMs; }
      if (spkRing.write(payload, length) < length) Serial.println("speaker buffer full, dropping audio");
      if (botState != ST_SPEAK && !pttHeld) { botState = ST_SPEAK; speechEnded = false; }
      break;
    default: break;
  }
}

// ============================================================ button (BOOT = push to talk / interrupt)
static void handleButton(uint32_t now) {
  static bool last = true;
  static uint32_t chg = 0;
  bool st = digitalRead(PIN_BOOT_BTN);
  if (st == last || now - chg < 30) return;
  chg = now; last = st;
  activity();
#if USE_VIDEO
  if (vidPlaying) { videoStop(); return; }               // BOOT stops the video
#endif
  if (!st) {                                // pressed
    if (!wsUp) return;
    stopPlayback();
    ignoreAudio = true; ignoreUntil = now + 1500;
    pttHeld = true; pttReleasing = false;
    botState = ST_LISTEN;
#if STANDALONE
    pttBegin();
#else
    webSocket.sendTXT("{\"t\":\"ptt\",\"v\":1}");
#endif
  } else if (pttHeld) {                     // released
    pttHeld = false; pttReleasing = true;
    botState = ST_THINK; thinkSince = now;
  }
}

#if !STANDALONE
static void pumpMic() {
  static uint8_t tmp[2048];
  for (int guard = 0; guard < 4; guard++) {
    uint32_t a = micRing.avail();
    if (!(a >= 1024 || (pttReleasing && a > 0))) break;
    uint32_t n = micRing.read(tmp, umin(a, sizeof(tmp)) & ~1u);
    if (!n) break;
    if (wsUp) webSocket.sendBIN(tmp, n);
  }
  if (pttReleasing && micRing.avail() == 0) {
    pttReleasing = false;
    if (wsUp) webSocket.sendTXT("{\"t\":\"ptt\",\"v\":0}");
  }
}
#endif

static void updateStates(uint32_t now) {
  wantStream = wsUp && (pttHeld || (autoMode && !musicOn && !spOn && now > holdoffUntil && (botState == ST_IDLE || botState == ST_LISTEN)));
  if (botState == ST_SPEAK && speechEnded && spkRing.avail() == 0 && !spkBusy) {
    botState = ST_IDLE; speechEnded = false; holdoffUntil = now + 500;
  }
  if (botState == ST_THINK && now - thinkSince > 40000) { botState = ST_IDLE; beep(330, 150); beep(250, 250); }   // safety net
  if (botState != ST_IDLE || spkBusy || seq) lastActivity = now;
  if (powerOffReq && botState == ST_IDLE && !spkBusy && !seq && !brainBusy) {   // "apagate": real deep sleep
    powerOffReq = false;
    musicHalt();
    Serial.println("powering off (deep sleep). BOOT button wakes me.");
    setBacklight(0); delay(200);
    while (digitalRead(PIN_BOOT_BTN) == LOW) delay(10);
    rtc_gpio_pullup_en((gpio_num_t)PIN_BOOT_BTN); rtc_gpio_pulldown_dis((gpio_num_t)PIN_BOOT_BTN);
    esp_sleep_enable_ext1_wakeup_io(1ULL << PIN_BOOT_BTN, ESP_EXT1_WAKEUP_ANY_LOW);
    esp_deep_sleep_start();
  }
  if (sleepNow && !sleeping && botState == ST_IDLE && !spkBusy && !seq) {      // "go to sleep" by voice
    sleepNow = false; sleeping = true; setBacklight(BL_ASLEEP);
    Serial.println("going to sleep (asked)");
  }
  if (sleepAfterSec > 0 && !sleeping && wsUp && now - lastActivity > sleepAfterSec * 1000UL) {
#if STANDALONE
    if (CANNED_REPLIES && !sleepAnnounced && brainReady && !brainBusy) { sleepAnnounced = true; cannedPendingAt = now; cannedPendingEv = "sleep"; return; }   // say goodnight first, he falls asleep after
#endif
    sleepAnnounced = false;
    sleeping = true; setBacklight(BL_ASLEEP);
    Serial.println("going to sleep (touch, shake, button or voice wakes me)");
  }
}

// ============================================================ motion sensor (QMI8658): shaken / lifted / upside down
static bool imuInit() {
  const uint8_t addrs[2] = { IMU_ADDR_A, IMU_ADDR_B };
  for (int i = 0; i < 2 && !imuAddr; i++) {
    uint8_t id = 0;
    if (i2cRead(addrs[i], 0x00, &id, 1) && id == 0x05) imuAddr = addrs[i];     // WHO_AM_I of the QMI8658
  }
  if (!imuAddr) return false;
  i2cWrite8(imuAddr, 0x60, 0xB0); delay(30);         // soft reset
  i2cWrite8(imuAddr, 0x02, 0x40);                    // auto-increment register address
  i2cWrite8(imuAddr, 0x03, 0x16);                    // accelerometer: +-4 g, 125 Hz
  i2cWrite8(imuAddr, 0x08, 0x01);                    // accelerometer on
  return true;
}

static void sendEvent(const char* v) {
  if (!wsUp) return;
  if (!strcmp(v, "shaken")) setEmotion(EMO_DIZZY, 4500);
  else if (!strcmp(v, "upside_down")) setEmotion(EMO_DIZZY, 4000);
  else if (!strcmp(v, "lifted")) setEmotion(EMO_SURPRISED, 3000);
  else if (!strcmp(v, "poked")) setEmotion(EMO_SURPRISED, 1500);
  else if (!strcmp(v, "person_near")) setEmotion(EMO_HAPPY, 3500);
  if (!reactionsOn && strcmp(v, "person_near")) return;
  Serial.printf("event: %s\n", v);
#if STANDALONE
  localEvent(v);
#else
  char msg[64];
  snprintf(msg, sizeof(msg), "{\"t\":\"event\",\"v\":\"%s\"}", v);
  webSocket.sendTXT(msg);
#endif
}

static void imuTick(uint32_t now) {
  static uint32_t next = 0, quietUntil = 2500, lastEvent = 0, flipSince = 0, wStart = 0;
  static float rx = 0, ry = 0, rz = 0, sx = 0, sy = 0, sz = 0;      // rest direction (which way is "up")
  static int calN = 0, big = 0, mid = 0;
  static bool haveRef = false, flipped = false;
  if (!imuAddr || now < next) return;
  next = now + 20;
  uint8_t b[6];
  if (!i2cRead(imuAddr, 0x35, b, 6)) return;
  float x = (int16_t)(b[0] | (b[1] << 8)) / 8192.0f;
  float y = (int16_t)(b[2] | (b[3] << 8)) / 8192.0f;
  float z = (int16_t)(b[4] | (b[5] << 8)) / 8192.0f;
  float mag = sqrtf(x * x + y * y + z * z);
  float dev = fabsf(mag - 1.0f);
  if (seq) quietUntil = now + 700;                   // the servos shake the body: ignore the sensor while moving
  if (now < quietUntil) return;

  if (!haveRef) {                                    // learn how he stands at start-up (keep him upright and still)
    if (dev < 0.08f) { sx += x; sy += y; sz += z; if (++calN >= 60) {
      float m = sqrtf(sx * sx + sy * sy + sz * sz);
      rx = sx / m; ry = sy / m; rz = sz / m; haveRef = true;
      Serial.printf("motion sensor calibrated (up = %.2f %.2f %.2f)\n", rx, ry, rz);
    } }
    else { sx = sy = sz = 0; calN = 0; }
    return;
  }

  if (now - wStart > 800) { wStart = now; big = 0; mid = 0; }
  if (dev > SHAKE_DEV_G) big++; else if (dev > LIFT_DEV_G) mid++;
  bool cool = (now - lastEvent > 3000);
  if (big >= 5) {
    big = mid = 0; wStart = now; lastEvent = now; quietUntil = now + 1500;
    activity();
    sendEvent("shaken");
  } else if (mid + big >= 8 && cool) {
    big = mid = 0; wStart = now; lastEvent = now; quietUntil = now + 1500;
    activity();
    sendEvent("lifted");
  }

  float up = x * rx + y * ry + z * rz;               // +1 upright, -1 upside down
  if (mag > 0.8f && mag < 1.2f && up < -0.6f) {
    if (!flipSince) flipSince = now;
    if (!flipped && now - flipSince > 600) {
      flipped = true; lastEvent = now; activity();
      sendEvent("upside_down");
    }
  } else if (up > 0.5f) { flipSince = 0; flipped = false; }
  else if (up >= -0.6f) flipSince = 0;
}

// ============================================================ touch menu (swipe down or long-press) + Wi-Fi setup page
enum { M_MAIN, M_VOL, M_LISTEN, M_DANCE, M_BAT, M_WIFI, M_MORE, M_PORTAL, M_SET, M_EXPR, M_LANG, M_MAP, M_SONGS, M_VIDEOS };
bool menuOpen = false;
int menuScreen = M_MAIN;
uint32_t menuTouchAt = 0;
bool portalOn = false, portalAutoDone = false, portalRoutes = false;
uint32_t portalStartedAt = 0, restartAt = 0;
WebServer portalWeb(80);
DNSServer portalDns;

static void openMenu() { menuOpen = true; menuScreen = M_MAIN; menuTouchAt = millis(); activity(); }

// ---- battery (LiPo on the board's battery connector)
static float batteryVolts() {
  if (BAT_ADC_PIN < 0) return 0;
  uint32_t sum = 0;
  for (int i = 0; i < 16; i++) sum += analogReadMilliVolts(BAT_ADC_PIN);
  return (sum / 16.0f) / 1000.0f * BAT_DIVIDER * BAT_CAL;
}
static int batteryPercent(float v) {
  static const float T[][2] = { {3.30f, 0}, {3.50f, 5}, {3.60f, 15}, {3.70f, 30}, {3.75f, 42}, {3.80f, 55}, {3.85f, 65}, {3.90f, 75}, {4.00f, 88}, {4.10f, 96}, {4.20f, 100} };
  if (v <= T[0][0]) return 0;
  for (int i = 1; i < 11; i++) if (v <= T[i][0]) return (int)(T[i - 1][1] + (T[i][1] - T[i - 1][1]) * (v - T[i - 1][0]) / (T[i][0] - T[i - 1][0]));
  return 100;
}

// ---- Wi-Fi setup page: Robit makes his own network "Robit-Setup"; you join it with your phone and pick the real Wi-Fi
static const char* wkey(char k, int i) { static char b[4]; b[0] = k; b[1] = '0' + i; b[2] = 0; return b; }   // "s0", "p1"...
static void saveWifi(const String& ssid, const String& pass) {
  String s[3], p[3];
  s[0] = ssid; p[0] = pass;
  int n = 1;
  for (int i = 0; i < 3 && n < 3; i++) {
    String os = prefs.getString(wkey('s', i), ""), op = prefs.getString(wkey('p', i), "");
    if (os.length() && os != ssid) { s[n] = os; p[n] = op; n++; }
  }
  for (int i = 0; i < 3; i++) {
    prefs.putString(wkey('s', i), i < n ? s[i] : String(""));
    prefs.putString(wkey('p', i), i < n ? p[i] : String(""));
  }
}
static void loadSavedWifi() {
  for (int i = 0; i < 3; i++) {
    String s = prefs.getString(wkey('s', i), ""), p = prefs.getString(wkey('p', i), "");
    if (s.length()) { wifiMulti.addAP(s.c_str(), p.c_str()); Serial.printf("saved Wi-Fi: %s\n", s.c_str()); }
  }
}
static void forgetWifi() { for (int i = 0; i < 3; i++) { prefs.putString(wkey('s', i), ""); prefs.putString(wkey('p', i), ""); } }

static String htmlEsc(const String& s) {
  String o;
  for (uint32_t i = 0; i < s.length(); i++) {
    char c = s[i];
    if (c == '&') o += "&amp;"; else if (c == '<') o += "&lt;"; else if (c == '>') o += "&gt;"; else if (c == '"') o += "&quot;"; else o += c;
  }
  return o;
}
static void portalPage() {
  int n = WiFi.scanNetworks();
  String h = "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'><title>Robit Wi-Fi</title>"
             "<style>body{font-family:sans-serif;max-width:420px;margin:24px auto;padding:0 16px}select,input,button{width:100%;font-size:18px;padding:12px;margin:8px 0;box-sizing:border-box}"
             "button{background:#1a9fd6;color:#fff;border:0;border-radius:8px}</style><h2>Robit Wi-Fi</h2><form method=post action=/save><label>Network</label><select name=ssid>";
  for (int i = 0; i < n; i++) {
    String name = WiFi.SSID(i);
    if (!name.length()) continue;
    h += "<option value=\"" + htmlEsc(name) + "\">" + htmlEsc(name) + " (" + String(WiFi.RSSI(i)) + " dBm)</option>";
  }
  h += "</select><label>or type its name</label><input name=ssid2 placeholder='(optional)'><label>Password</label><input name=pass type=password>"
       "<button>Save and connect</button></form><p>Only 2.4 GHz networks work. A phone hotspot is fine.</p>";
  portalWeb.send(200, "text/html", h);
}
static void portalSave() {
  String ssid = portalWeb.arg("ssid2");
  if (!ssid.length()) ssid = portalWeb.arg("ssid");
  if (!ssid.length()) { portalWeb.send(400, "text/plain", "Pick a network"); return; }
  saveWifi(ssid, portalWeb.arg("pass"));
  Serial.printf("Wi-Fi saved: %s\n", ssid.c_str());
  portalWeb.send(200, "text/html", "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'><body style='font-family:sans-serif;padding:24px'><h2>Saved</h2><p>Robit is restarting and will join the network.</p>");
  restartAt = millis() + 2500;
}
static void portalRedirect() { portalWeb.sendHeader("Location", "http://192.168.4.1/", true); portalWeb.send(302, "text/plain", ""); }

static void portalBegin() {
  if (portalOn) return;
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP("Robit-Setup");
  delay(100);
  portalDns.start(53, "*", WiFi.softAPIP());
  if (!portalRoutes) {
    portalRoutes = true;
    portalWeb.on("/", HTTP_GET, portalPage);
    portalWeb.on("/save", HTTP_POST, portalSave);
    portalWeb.onNotFound(portalRedirect);
  }
  portalWeb.begin();
  portalOn = true; portalStartedAt = millis();
  menuOpen = true; menuScreen = M_PORTAL; menuTouchAt = millis();
  Serial.println("Wi-Fi setup page on: join 'Robit-Setup', open 192.168.4.1");
}
static void portalEnd() {
  if (!portalOn) return;
  portalWeb.stop(); portalDns.stop();
  WiFi.softAPdisconnect(true);
  WiFi.mode(WIFI_STA);
  portalOn = false;
  if (menuScreen == M_PORTAL) menuScreen = M_WIFI;
}
static void portalTick(uint32_t now) {
  if (portalOn) {
    portalDns.processNextRequest();
    portalWeb.handleClient();
    if (now - portalStartedAt > 600000UL) portalEnd();
  }
  if (restartAt && now > restartAt) ESP.restart();
}

// ---- drawing
#define COL(r, g, b) gfx->color565(r, g, b)
static void txtC(const char* s, int cx, int cy, int size, uint16_t col) {
  gfx->setTextSize(size); gfx->setTextColor(col);
  gfx->setCursor(cx - (int)strlen(s) * 3 * size, cy - 4 * size);
  gfx->print(s);
}
static void tile(int x, int y, int w, int h, const char* label, uint16_t fill, int size = 2, const char* sub = nullptr) {
  gfx->fillRoundRect(x, y, w, h, 12, fill);
  txtC(label, x + w / 2, y + h / 2 - (sub ? 7 : 0), size, C_WHITE);
  if (sub) txtC(sub, x + w / 2, y + h - 13, 1, COL(210, 225, 235));
}
static bool hit(int px, int py, int x, int y, int w, int h) { return px >= x && px < x + w && py >= y && py < y + h; }

static void menuBack();
#if USE_MAP
static void drawMap(uint32_t now);
#endif
static int exprPage = 0, songPage = 0, vidPage = 0;

// weather / time where he lives, from the menu
static void menuShowHome(bool wantT, bool wantW) {
  if ((wantW && !homeWx.ok) || (wantT && time(nullptr) < 1700000000)) { beep(330, 150); return; }     // no data yet
  menuOpen = false;
  showHomeCard(wantT, wantW);
  if (cardActive(millis())) card.until = millis() + 30000UL;                  // from the menu it stays longer (tap to close)
}
static void setLang(const char* l) {
  strlcpy(langMode, l, sizeof(langMode)); lastSpanish = strcmp(l, "en") != 0;
  prefs.putString("lang", l); beep(880, 80);
  Serial.printf("language: %s\n", l);
}

#if USE_MAP
static void drawMapLoading() {
  gfx->fillRoundRect(70, 146, 220, 68, 14, C_BLACK); gfx->drawRoundRect(70, 146, 220, 68, 14, COL(80, 220, 255));
  txtC(spanishUi() ? "Cargando mapa..." : "Loading map...", 180, 180, 2, C_WHITE);
  flushScreen();
}
static void mapRefresh() { if (brainBusy) { beep(330, 150); return; } drawMapLoading(); mapFetch(); mapDirty = true; }
static void mapGoHome() {
  if (brainBusy) { beep(330, 150); return; }
  mapLat = CITY_LAT; mapLon = CITY_LON; mapZoom = MAP_ZOOM_HOME; mapPath = ""; mapInfo[0] = 0;
  mapMarkers = String("&markers=color:red%7C") + mapPoint(CITY_LAT, CITY_LON);
  strlcpy(mapLabel, CITY_NAME, sizeof(mapLabel));
  mapRefresh();
}
static void mapMenuOpen() {
  if (botState != ST_IDLE || brainBusy) { beep(330, 150); return; }
  if (!mapJpg && GOOGLE_MAPS_KEY[0]) mapGoHome();
  else if (!GOOGLE_MAPS_KEY[0]) strlcpy(mapErr, "Put your Google Maps key in the code", sizeof(mapErr));
  menuScreen = M_MAP; mapDirty = true; menuTouchAt = millis();
}
static void mapTap(int x, int y) {
  auto near = [&](int cx, int cy) { return (x - cx) * (x - cx) + (y - cy) * (y - cy) <= 32 * 32; };
  if (near(180, 28)) menuBack();
  else if (near(36, 140)) { if (mapZoom < 19) { mapZoom++; mapRefresh(); } }
  else if (near(36, 220)) { if (mapZoom > 2) { mapZoom--; mapRefresh(); } }
  else if (near(324, 140)) { mapType = (mapType + 1) & 3; mapRefresh(); }
  else if (near(324, 220)) mapGoHome();
}
static void mapGesture(int sx, int sy, int dx, int dy, uint32_t dur) {         // finger lifted on the map: tap on a button, or drag the map
  if (abs(dx) < 14 && abs(dy) < 14) { if (dur < 900) mapTap(sx, sy); return; }
  mapPan(dx, dy); mapRefresh();
}
#endif

#define BACK_X 110
#define BACK_Y 296
#define BACK_W 140
#define BACK_H 28
static const char* const DANCE_LABEL[8] = { "Wave", "Nod", "Happy", "Dance", "Shake", "Walk", "Turn L", "Turn R" };
static const char* const DANCE_ACT[8]   = { "wave", "nod", "happy", "dance", "shake", "walk", "turn_left", "turn_right" };
static const float BL_STEPS[5] = { 60, 110, 160, 200, 255 };

static void drawMenu(uint32_t now) {
  const uint16_t PANEL = COL(34, 52, 72), ACC = COL(80, 220, 255), OK = COL(30, 150, 90), WARN = COL(255, 150, 30);
  char b[40];
#if USE_MAP
  if (menuScreen == M_MAP) { drawMap(now); return; }
#endif
  gfx->fillScreen(C_BLACK);
  switch (menuScreen) {
    case M_MAIN: {
      static const char* const L[8] = { "Faces", "Map", "Weather", "Hour", "Language", "Songs", USE_VIDEO ? "Videos" : "Dances", "Settings" };
      txtC("MENU", 180, 38, 2, ACC);
      for (int i = 0; i < 8; i++) {
        const char* sub = nullptr;
        if (i == 4) sub = !strcmp(langMode, "es") ? "Espanol" : (!strcmp(langMode, "en") ? "English" : "auto");
        if (i == 5 && songPlaying) sub = songPaused ? "paused" : "playing";
        if (i == 6 && videoOn()) sub = "playing";
        tile(58 + (i % 2) * 126, 68 + (i / 2) * 56, 118, 50, L[i], (i == 5 && songPlaying) ? OK : PANEL, 2, sub);
      }
      tile(BACK_X, BACK_Y, BACK_W, BACK_H, "Close", COL(70, 40, 40));
      return;
    }
    case M_EXPR: {
      for (int k = 0; k < 8; k++) {
        int e = exprPage * 7 + k;
        int x = 58 + (k % 2) * 126, y = 68 + (k / 2) * 56;
        if (k == 7) { tile(x, y, 118, 50, "More >", COL(40, 70, 100)); break; }
        if (e >= EMO_COUNT) continue;
        char nm[12]; strlcpy(nm, e == EMO_NONE ? "normal" : EMO_NAME[e], sizeof(nm)); nm[0] = toupper((unsigned char)nm[0]);
        tile(x, y, 118, 50, nm, PANEL);
      }
    } break;
    case M_LANG:
      txtC("Language", 180, 40, 2, ACC);
      tile(58, 74, 244, 62, "Auto", !strcmp(langMode, "auto") ? OK : PANEL, 3, "answers in the language you speak");
      tile(58, 144, 244, 62, "Espanol", !strcmp(langMode, "es") ? OK : PANEL, 3, "always Spanish");
      tile(58, 214, 244, 62, "English", !strcmp(langMode, "en") ? OK : PANEL, 3, "always English");
      break;
    case M_SONGS: {
#if USE_SD_MUSIC
      if (!sdOk || songCount == 0) {
        txtC("Songs", 180, 40, 2, ACC);
        txtC(!sdOk ? "No SD card found" : "No MP3 in /music", 180, 110, 2, WARN);
        txtC("FAT32 card, folder: music", 180, 150, 1, C_WHITE);
        txtC("put the card in, then restart", 180, 166, 1, C_WHITE);
        break;
      }
      int pages = (songCount + 2) / 3; if (songPage >= pages) songPage = 0;
      snprintf(b, sizeof(b), "Songs %d/%d", songPage + 1, pages);
      txtC(b, 180, 32, 2, ACC);
      for (int r = 0; r < 3; r++) {
        int i = songPage * 3 + r; if (i >= songCount) break;
        String nm = songName[i]; nm.remove(nm.length() - 4); nm.replace("_", " "); if (nm.length() > 19) nm = nm.substring(0, 19);
        tile(58, 54 + r * 46, 244, 40, nm.c_str(), (songPlaying && songIdx == i) ? OK : PANEL, 2);
      }
      tile(58, 194, 76, 46, "|<", PANEL, 2);
      tile(142, 194, 76, 46, (songPlaying && !songPaused) ? "||" : ">", PANEL, 2);
      tile(226, 194, 76, 46, ">|", PANEL, 2);
      tile(58, 248, 76, 30, "Pg-", COL(40, 70, 100), 1);
      tile(142, 248, 76, 30, "Stop", COL(70, 40, 40), 1);
      tile(226, 248, 76, 30, "Pg+", COL(40, 70, 100), 1);
#else
      txtC("Songs", 180, 40, 2, ACC);
      txtC("install the libhelix library", 180, 120, 1, WARN);
      txtC("(Sketch > Include Library)", 180, 136, 1, C_WHITE);
#endif
    } break;
    case M_VIDEOS: {
#if USE_VIDEO
      if (!sdOk || vidCount == 0) {
        txtC("Videos", 180, 40, 2, ACC);
        if (sdOk && vidOtherCount > 0) {                                   // there are MP4/MOV files: say why they do not show up
          snprintf(b, sizeof(b), "%d MP4/MOV found", vidOtherCount);
          txtC(b, 180, 100, 2, WARN);
          txtC("This chip plays AVI only.", 180, 140, 1, C_WHITE);
          txtC("Convert the MP4 to AVI (with sound)", 180, 156, 1, C_WHITE);
          txtC("using tools/convertir_video", 180, 172, 1, C_WHITE);
          txtC("see the README, section 8", 180, 188, 1, C_WHITE);
          break;
        }
        txtC(!sdOk ? "No SD card found" : "No AVI in /video", 180, 110, 2, WARN);
        txtC("FAT32 card, folder: video", 180, 150, 1, C_WHITE);
        txtC("AVI, Motion-JPEG, 360x360", 180, 166, 1, C_WHITE);
        break;
      }
      int pages = (vidCount + 2) / 3; if (vidPage >= pages) vidPage = 0;
      snprintf(b, sizeof(b), "Videos %d/%d", vidPage + 1, pages);
      txtC(b, 180, 32, 2, ACC);
      for (int r = 0; r < 3; r++) {
        int i = vidPage * 3 + r; if (i >= vidCount) break;
        String nm = vidName[i]; nm.remove(nm.length() - 4); nm.replace("_", " "); if (nm.length() > 19) nm = nm.substring(0, 19);
        tile(58, 54 + r * 46, 244, 40, nm.c_str(), PANEL, 2);
      }
      tile(58, 200, 76, 40, "Pg-", COL(40, 70, 100), 1);
      tile(226, 200, 76, 40, "Pg+", COL(40, 70, 100), 1);
#endif
    } break;
    case M_SET:
      txtC("Settings", 180, 38, 2, ACC);
      tile(58, 74, 118, 62, "Wi-Fi", PANEL);
      tile(184, 74, 118, 62, "Volume", PANEL);
#if STANDALONE
      tile(58, 144, 118, 62, "Listen", PANEL, 2, autoMode ? "hear all" : "button");
#else
      tile(58, 144, 118, 62, "Listen", PANEL, 2, "(server)");
#endif
      tile(184, 144, 118, 62, pcaOk ? "Dances" : "Sleep", PANEL);                     // (no servos yet: this button puts him to sleep)
      tile(58, 214, 118, 62, "Battery", PANEL);
      tile(184, 214, 118, 62, "More", PANEL);
      break;
    case M_VOL: {
      txtC("Volume", 180, 40, 2, ACC);
      snprintf(b, sizeof(b), "%d%%", (int)(spkVolume * 100 + 0.5f));
      txtC(b, 180, 108, 5, C_WHITE);
      gfx->fillRoundRect(70, 148, 220, 16, 8, PANEL);
      gfx->fillRoundRect(70, 148, max(16, (int)(220 * spkVolume)), 16, 8, ACC);
      tile(58, 190, 118, 70, "-", PANEL, 5);
      tile(184, 190, 118, 70, "+", PANEL, 5);
    } break;
    case M_LISTEN:
      txtC("Listening", 180, 40, 2, ACC);
      tile(58, 74, 244, 76, "Button", autoMode ? PANEL : OK, 3, "hold BOOT to talk");
      tile(58, 160, 244, 76, "Hear all", autoMode ? OK : PANEL, 3, "always listening");
#if !STANDALONE
      txtC("set by the server", 180, 262, 1, WARN);
#else
      txtC(autoMode ? "noisy room? use Button" : "", 180, 262, 1, WARN);
#endif
      break;
    case M_DANCE:
      for (int i = 0; i < 8; i++) tile(58 + (i % 2) * 126, 68 + (i / 2) * 56, 118, 50, DANCE_LABEL[i], PANEL);
      break;
    case M_BAT: {
      static float v = 0; static uint32_t at = 0;
      if (now - at > 2000) { v = batteryVolts(); at = now; }
      txtC("Battery", 180, 40, 2, ACC);
      if (v < 2.5f || v > 4.6f) {
        txtC("No battery", 180, 120, 3, WARN);
        txtC("USB power only, or", 180, 160, 1, C_WHITE);
        txtC("sensor pin not set", 180, 174, 1, C_WHITE);
      } else {
        int pc = batteryPercent(v);
        uint16_t c = pc > 40 ? OK : (pc > 15 ? WARN : COL(220, 50, 50));
        snprintf(b, sizeof(b), "%d%%", pc);
        txtC(b, 180, 110, 5, C_WHITE);
        gfx->fillRoundRect(70, 150, 220, 22, 8, PANEL);
        gfx->fillRoundRect(70, 150, max(10, 220 * pc / 100), 22, 8, c);
        snprintf(b, sizeof(b), "%.2f V", v);
        txtC(b, 180, 200, 2, C_WHITE);
        txtC(v > 4.15f ? "full or charging" : "estimate", 180, 232, 1, COL(210, 225, 235));
      }
    } break;
    case M_WIFI:
      txtC("Wi-Fi", 180, 40, 2, ACC);
      if (WiFi.status() == WL_CONNECTED) {
        String ss = WiFi.SSID(); if (ss.length() > 16) ss = ss.substring(0, 16);
        txtC(ss.c_str(), 180, 80, 2, C_WHITE);
        txtC(WiFi.localIP().toString().c_str(), 180, 106, 2, COL(210, 225, 235));
        snprintf(b, sizeof(b), "signal %d dBm", (int)WiFi.RSSI());
        txtC(b, 180, 132, 1, COL(210, 225, 235));
      } else {
        txtC("Not connected", 180, 90, 2, WARN);
      }
      tile(58, 160, 244, 50, "Setup by phone", PANEL);
      tile(58, 220, 244, 50, "Forget saved", PANEL);
      break;
    case M_PORTAL:
      txtC("Wi-Fi setup", 180, 40, 2, ACC);
      txtC("1. On your phone join", 180, 80, 2, C_WHITE);
      txtC("Robit-Setup", 180, 108, 3, OK);
      txtC("2. Open the page", 180, 150, 2, C_WHITE);
      txtC("192.168.4.1", 180, 178, 3, OK);
      txtC("3. Pick Wi-Fi + password", 180, 220, 2, C_WHITE);
      txtC("(2.4 GHz only)", 180, 244, 1, COL(210, 225, 235));
      tile(BACK_X, BACK_Y, BACK_W, BACK_H, "Cancel", COL(70, 40, 40));
      return;
    case M_MORE:
      txtC("More", 180, 40, 2, ACC);
      tile(58, 74, 118, 62, "Sleep now", PANEL);
      tile(184, 74, 118, 62, "Autosleep", PANEL, 2, sleepAfterSec ? "on" : "off");
      snprintf(b, sizeof(b), "%s", reactionsOn ? "on" : "off");
      tile(58, 144, 118, 62, "React", PANEL, 2, b);
      snprintf(b, sizeof(b), "%d%%", (int)(blAwake * 100 / 255));
      tile(184, 144, 118, 62, "Bright", PANEL, 2, b);
      snprintf(b, sizeof(b), "%.1fx", ttsSpeed);
      tile(58, 214, 118, 62, "Voice", PANEL, 2, b);
      tile(184, 214, 118, 62, "Restart", COL(70, 40, 40));
      break;
  }
  tile(BACK_X, BACK_Y, BACK_W, BACK_H, "Back", PANEL);
}

static void menuBack() {
  if (menuScreen == M_MAIN) { menuOpen = false; return; }
  if (menuScreen == M_PORTAL) { portalEnd(); menuScreen = M_WIFI; return; }
  prefs.putFloat("vol", spkVolume);
  menuScreen = (menuScreen == M_VOL || menuScreen == M_LISTEN || menuScreen == M_BAT || menuScreen == M_WIFI || menuScreen == M_MORE) ? M_SET : M_MAIN;
}

static void menuTap(int x, int y) {
  Serial.printf("menu tap %d,%d (screen %d)\n", x, y, menuScreen);
#if USE_MAP
  if (menuScreen == M_MAP) { mapTap(x, y); return; }
#endif
  if (hit(x, y, BACK_X - 10, BACK_Y - 6, BACK_W + 20, BACK_H + 14)) { menuBack(); return; }
  switch (menuScreen) {
    case M_MAIN:
      for (int i = 0; i < 8; i++) {
        if (!hit(x, y, 58 + (i % 2) * 126, 68 + (i / 2) * 56, 118, 50)) continue;
        switch (i) {
          case 0: exprPage = 0; menuScreen = M_EXPR; break;
          case 1:
#if USE_MAP
            mapMenuOpen();
#else
            beep(330, 150);
#endif
            break;
          case 2: menuShowHome(false, true); break;
          case 3: menuShowHome(true, false); break;
          case 4: menuScreen = M_LANG; break;
          case 5: songPage = 0; menuScreen = M_SONGS; break;
#if USE_VIDEO
          case 6: vidPage = 0; menuScreen = M_VIDEOS; break;
#else
          case 6: menuScreen = M_DANCE; break;
#endif
          case 7: menuScreen = M_SET; break;
        }
        break;
      }
      break;
    case M_SET:
      if (hit(x, y, 58, 74, 118, 62)) menuScreen = M_WIFI;
      else if (hit(x, y, 184, 74, 118, 62)) menuScreen = M_VOL;
      else if (hit(x, y, 58, 144, 118, 62)) menuScreen = M_LISTEN;
      else if (hit(x, y, 184, 144, 118, 62)) { if (pcaOk) menuScreen = M_DANCE; else { sleepNow = true; menuOpen = false; } }
      else if (hit(x, y, 58, 214, 118, 62)) menuScreen = M_BAT;
      else if (hit(x, y, 184, 214, 118, 62)) menuScreen = M_MORE;
      break;
    case M_EXPR:
      for (int k = 0; k < 8; k++) {
        if (!hit(x, y, 58 + (k % 2) * 126, 68 + (k / 2) * 56, 118, 50)) continue;
        if (k == 7) { exprPage = (exprPage + 1) % ((EMO_COUNT + 6) / 7); break; }
        int e = exprPage * 7 + k;
        if (e < EMO_COUNT) { menuOpen = false; if (e == EMO_NONE) emo = EMO_NONE; else setEmotion(e, 9000); }
        break;
      }
      break;
    case M_LANG:
      if (hit(x, y, 58, 74, 244, 62)) setLang("auto");
      else if (hit(x, y, 58, 144, 244, 62)) setLang("es");
      else if (hit(x, y, 58, 214, 244, 62)) setLang("en");
      break;
    case M_SONGS:
#if USE_SD_MUSIC
      if (sdOk && songCount > 0) {
        int pages = (songCount + 2) / 3;
        for (int r = 0; r < 3; r++) { int i = songPage * 3 + r; if (i < songCount && hit(x, y, 58, 54 + r * 46, 244, 40)) { songPlay(i); return; } }
        if (hit(x, y, 58, 194, 76, 46)) songPrev();
        else if (hit(x, y, 142, 194, 76, 46)) { if (songPlaying) songPaused = !songPaused; else songPlay(songIdx < 0 ? 0 : songIdx); }
        else if (hit(x, y, 226, 194, 76, 46)) songNext();
        else if (hit(x, y, 58, 248, 76, 30)) songPage = (songPage + pages - 1) % pages;
        else if (hit(x, y, 142, 248, 76, 30)) songHalt();
        else if (hit(x, y, 226, 248, 76, 30)) songPage = (songPage + 1) % pages;
      }
#endif
      break;
    case M_VIDEOS:
#if USE_VIDEO
      if (sdOk && vidCount > 0) {
        int pages = (vidCount + 2) / 3;
        for (int r = 0; r < 3; r++) { int i = vidPage * 3 + r; if (i < vidCount && hit(x, y, 58, 54 + r * 46, 244, 40)) { videoStart(i); menuOpen = false; return; } }
        if (hit(x, y, 58, 200, 76, 40)) vidPage = (vidPage + pages - 1) % pages;
        else if (hit(x, y, 226, 200, 76, 40)) vidPage = (vidPage + 1) % pages;
      }
#endif
      break;
    case M_VOL:
      if (hit(x, y, 58, 190, 118, 70)) { spkVolume = max(0.1f, spkVolume - 0.1f); beep(660, 60); }
      else if (hit(x, y, 184, 190, 118, 70)) { spkVolume = min(1.0f, spkVolume + 0.1f); beep(880, 60); }
      break;
    case M_LISTEN:
#if STANDALONE
      if (hit(x, y, 58, 74, 244, 76)) { autoMode = false; prefs.putBool("auto", false); beep(660, 60); }
      else if (hit(x, y, 58, 160, 244, 76)) { autoMode = true; prefs.putBool("auto", true); beep(880, 60); }
#endif
      break;
    case M_DANCE:
      for (int i = 0; i < 8; i++) if (hit(x, y, 58 + (i % 2) * 126, 68 + (i / 2) * 56, 118, 50)) { startAction(findAction(DANCE_ACT[i])); break; }
      break;
    case M_WIFI:
      if (hit(x, y, 58, 160, 244, 50)) portalBegin();
      else if (hit(x, y, 58, 220, 244, 50)) { forgetWifi(); beep(440, 120); Serial.println("saved Wi-Fi networks forgotten"); }
      break;
    case M_MORE:
      if (hit(x, y, 58, 74, 118, 62)) { sleepNow = true; menuOpen = false; }
      else if (hit(x, y, 184, 74, 118, 62)) { sleepAfterSec = sleepAfterSec ? 0 : (SLEEP_AFTER_SEC > 0 ? SLEEP_AFTER_SEC : 180); prefs.putUInt("sleep", sleepAfterSec); }
      else if (hit(x, y, 58, 144, 118, 62)) { reactionsOn = !reactionsOn; prefs.putBool("react", reactionsOn); }
      else if (hit(x, y, 184, 144, 118, 62)) {
        int k = 0; for (int i = 0; i < 5; i++) if (blAwake >= (int)BL_STEPS[i]) k = i;
        blAwake = (int)BL_STEPS[(k + 1) % 5]; setBacklight(blAwake); prefs.putInt("bl", blAwake);
      }
      else if (hit(x, y, 58, 214, 118, 62)) { ttsSpeed = ttsSpeed >= 1.35f ? 0.9f : ttsSpeed + 0.1f; prefs.putFloat("speed", ttsSpeed); }
      else if (hit(x, y, 184, 214, 118, 62)) { prefs.putFloat("vol", spkVolume); ESP.restart(); }
      break;
  }
}

static void menuTick(uint32_t now) {
  if (menuOpen && menuScreen != M_PORTAL && now - menuTouchAt > (menuScreen == M_MAP ? 120000UL : 45000UL)) { menuBack(); menuOpen = false; prefs.putFloat("vol", spkVolume); }
}

// ============================================================ touch screen (CST816): tap, long press, swipe
static void touchTick(uint32_t now) {
  static uint32_t next = 0, downAt = 0, lastPoke = 0;
  static bool down = false, longDone = false, wokeThis = false;
  static int sx = 0, sy = 0, lx = 0, ly = 0;
  if (!touchOk || now < next) return;
  next = now + 25;
  uint8_t b[6];
  if (!tpRead(0x01, b, 6)) return;      // b[1] = fingers, b[2..5] = x, y
  bool finger = (b[1] & 0x0F) > 0;
  int x = ((b[2] & 0x0F) << 8) | b[3], y = ((b[4] & 0x0F) << 8) | b[5];
  if (finger) {
#if TOUCH_SWAP_XY
    { int t = x; x = y; y = t; }
#endif
#if TOUCH_FLIP_X
    x = 359 - x;
#endif
#if TOUCH_FLIP_Y
    y = 359 - y;
#endif
  }
  if (finger && !down) {                              // finger just touched
    down = true; longDone = false; downAt = now; sx = lx = x; sy = ly = y;
    wokeThis = sleeping;
#if USE_VIDEO
    if (vidPlaying) { videoStop(); wokeThis = true; }      // any touch stops the video
#endif
    activity();
    menuTouchAt = now;
  } else if (finger && down) {
    lx = x; ly = y;
    menuTouchAt = now;
    if (!longDone && !wokeThis && !menuOpen && now - downAt > 800 && abs(lx - sx) < 25 && abs(ly - sy) < 25) {
      longDone = true; openMenu(); Serial.println("menu opened (long press)");
    }
  } else if (!finger && down) {                       // finger lifted: what was it?
    down = false;
    if (wokeThis || longDone) return;
    int dx = lx - sx, dy = ly - sy;
    uint32_t dur = now - downAt;
#if USE_MAP
    if (menuOpen && menuScreen == M_MAP) { mapGesture(sx, sy, dx, dy, dur); return; }
#endif
    if (abs(dy) > 70 && abs(dy) > abs(dx) * 3 / 2) {
      if (dy > 0 && !menuOpen) { openMenu(); Serial.println("menu opened (swipe down)"); }
      else if (menuOpen) menuBack();
    } else if (abs(dx) > 70 && abs(dx) > abs(dy) * 3 / 2) {
      if (menuOpen && dx > 0) menuBack();
    } else if (abs(dx) < 25 && abs(dy) < 25 && dur < 700) {
      static uint32_t lastTapAt = 0;
      if (menuOpen) menuTap(sx, sy);
      else if (cardActive(now)) { card.until = 0; if (card.kind == INFO_ALARM) timerDue = 0; }                       // tap closes the card
      else if (lastTapAt && now - lastTapAt < 700) { lastTapAt = 0; openMenu(); Serial.println("menu opened (double tap)"); }
      else { lastTapAt = now; if (now - lastPoke > 400) { lastPoke = now; sendEvent("poked"); } }
    }
  }
}

// ============================================================ optional ultrasonic sensor
static void ultrasonic(uint32_t) {}

// ============================================================ face
// ============================================================ the information card (weather / time / photo / timer)
#if USE_PHOTO_SCREEN
static JPEGDEC jdec;
static uint16_t* cardPix = nullptr;          // 360x360 picture of the photo (PSRAM)
static uint16_t* decTarget = nullptr;        // where the JPEG decoder writes (the photo or the map)
struct JdecCb { static int draw(JPEGDRAW* p) {   // (inside a struct so the Arduino IDE does not auto-declare it before the library is included)
  if (!decTarget) return 0;
  for (int y = 0; y < p->iHeight; y++) {
    int dy = p->y + y;
    if (dy < 0 || dy >= 360) continue;
    for (int x = 0; x < p->iWidth; x++) {
      int dx = p->x + x;
      if (dx >= 0 && dx < 360) decTarget[dy * 360 + dx] = p->pPixels[y * p->iWidth + x];
    }
  }
  return 1;
} };
static void preparePhoto() {                 // decode the JPEG once, centered on a black 360x360 picture
  cardPixReady = true; cardPixOk = false;
  if (!visJpg) return;
  if (!cardPix) cardPix = (uint16_t*)ps_malloc(360 * 360 * 2);
  if (!cardPix) return;
  memset(cardPix, 0, 360 * 360 * 2);
  decTarget = cardPix;
  if (!jdec.openRAM(visJpg, visJpgLen, JdecCb::draw)) { Serial.println("photo: could not open the JPEG"); return; }
  int w = jdec.getWidth(), h = jdec.getHeight(), sc = 0, div = 1;
  if (w > 360 * 2 || h > 360 * 2) { sc = JPEG_SCALE_QUARTER; div = 4; }
  else if (w > 360 || h > 360) { sc = JPEG_SCALE_HALF; div = 2; }
  jdec.setPixelType(RGB565_LITTLE_ENDIAN);
  jdec.decode((360 - w / div) / 2, (360 - h / div) / 2, sc);
  jdec.close();
  cardPixOk = true;
}
#if USE_MAP
static void mapDecode() {                    // decode the map JPEG (360x360) into mapPix
  mapPixReady = true; mapPixOk = false;
  if (!mapJpg) return;
  if (!mapPix) mapPix = (uint16_t*)ps_malloc(360 * 360 * 2);
  if (!mapPix) return;
  memset(mapPix, 0, 360 * 360 * 2);
  decTarget = mapPix;
  if (!jdec.openRAM(mapJpg, mapJpgLen, JdecCb::draw)) { Serial.println("map: could not open the JPEG"); return; }
  jdec.setPixelType(RGB565_LITTLE_ENDIAN);
  int w = jdec.getWidth(), h = jdec.getHeight();
  mapPixOk = jdec.decode((360 - w) / 2, (360 - h) / 2, 0) != 0;
  jdec.close();
  if (!mapPixOk) Serial.println("map: could not decode the picture");
}
static void drawMap(uint32_t) {              // the whole screen is the map, with a few round buttons on top (drawn only when something changed)
  if (!mapDirty) return;
  mapDirty = false;
  if (!mapPixReady) mapDecode();
  const uint16_t ACC = COL(80, 220, 255);
  if (mapPixOk && mapPix) gfx->draw16bitRGBBitmap(0, 0, mapPix, 360, 360);
  else { gfx->fillScreen(C_BLACK); txtC("Map", 180, 110, 3, ACC); }
  auto btn = [&](int cx, int cy, const char* t, int sz) {
    gfx->fillCircle(cx, cy, 24, COL(16, 28, 44)); gfx->drawCircle(cx, cy, 24, ACC); gfx->drawCircle(cx, cy, 23, ACC);
    txtC(t, cx, cy, sz, C_WHITE);
  };
  static const char* const TN[4] = { "Map", "Sat", "Ter", "Hyb" };
  btn(180, 28, "X", 2); btn(36, 140, "+", 3); btn(36, 220, "-", 3); btn(324, 140, TN[mapType & 3], 2); btn(324, 220, "Home", 1);
  gfx->fillRoundRect(72, 292, 216, 40, 10, COL(10, 16, 26));
  if (mapErr[0]) {
    String e = mapErr; if (e.length() > 70) e = e.substring(0, 70);
    gfx->setTextSize(1); gfx->setTextColor(COL(255, 210, 80));
    for (int ln = 0; ln < 2 && e.length(); ln++) { String part = e.substring(0, 34); e = e.length() > 34 ? e.substring(34) : String(""); gfx->setCursor(180 - (int)part.length() * 3, 298 + ln * 12); gfx->print(part.c_str()); }
  } else {
    char lb[36]; strlcpy(lb, mapLabel, sizeof(lb));
    txtC(lb, 180, 301, 1, C_WHITE);
    if (mapInfo[0]) txtC(mapInfo, 180, 318, 2, ACC);
    else { char z[24]; snprintf(z, sizeof(z), "zoom %d", mapZoom); txtC(z, 180, 318, 1, COL(150, 172, 195)); }
  }
}
#endif
#endif

static void drawWxIcon(int cx, int cy, int code, uint32_t now) {
  const uint16_t SUN = COL(255, 205, 50), CLD = COL(200, 212, 226), DRK = COL(125, 140, 160), RAIN = COL(90, 170, 255), SNOW = COL(235, 245, 255), BOLT = COL(255, 225, 60);
  bool clear = (code == 0 || code == 1), part = (code == 2);
  bool rainy = (code >= 51 && code <= 67) || (code >= 80 && code <= 82);
  bool snowy = (code >= 71 && code <= 77) || code == 85 || code == 86;
  bool storm = code >= 95;
  if (clear || part) {
    int sx = part ? cx - 16 : cx, sy = part ? cy - 14 : cy, r = part ? 17 : 24;
    gfx->fillCircle(sx, sy, r, SUN);
    for (int k = 0; k < 8; k++) {
      float a = k * (float)PI / 4 + now / 5000.0f;
      gfx->drawLine(sx + (int)(cosf(a) * (r + 6)), sy + (int)(sinf(a) * (r + 6)), sx + (int)(cosf(a) * (r + 14)), sy + (int)(sinf(a) * (r + 14)), SUN);
    }
    if (!part) return;
  }
  uint16_t c = (rainy || snowy || storm) ? DRK : CLD;
  int bx = part ? cx + 10 : cx, by = part ? cy + 12 : cy;
  gfx->fillCircle(bx - 18, by + 6, 13, c); gfx->fillCircle(bx - 2, by - 6, 19, c); gfx->fillCircle(bx + 20, by + 4, 14, c);
  gfx->fillRect(bx - 18, by + 6, 40, 14, c);
  if (rainy) for (int k = 0; k < 3; k++) { int yy = by + 24 + (int)((now / 90 + k * 3) % 9); gfx->drawLine(bx - 14 + k * 15, yy, bx - 18 + k * 15, yy + 8, RAIN); }
  if (snowy) for (int k = 0; k < 3; k++) { int yy = by + 26 + (int)((now / 160 + k * 3) % 9); gfx->fillCircle(bx - 14 + k * 15, yy, 3, SNOW); }
  if (storm) gfx->fillTriangle(bx + 2, by + 14, bx - 8, by + 34, bx + 2, by + 32, BOLT), gfx->fillTriangle(bx + 2, by + 32, bx + 14, by + 12, bx + 4, by + 12, BOLT);
}

static void placeShort(char* out, size_t n) {            // "Tokyo, Japan" -> "Tokyo"
  strlcpy(out, card.place, n);
  char* cm = strchr(out, ',');
  if (cm) *cm = 0;
  if (strlen(out) > 17) out[17] = 0;
}

static void drawCard(uint32_t now) {
  const uint16_t ACC = COL(80, 220, 255), DIM = COL(150, 172, 195);
  gfx->fillScreen(C_BLACK);
  char nm[24], b[32];
  if (card.kind == INFO_PHOTO) {
#if USE_PHOTO_SCREEN
    if (!cardPixReady) preparePhoto();
    if (cardPixOk && cardPix) gfx->draw16bitRGBBitmap(0, 0, cardPix, 360, 360);
    else txtC("Smile!", 180, 180, 5, C_WHITE);
#else
    txtC("Smile!", 180, 180, 5, C_WHITE);
#endif
    if (now - card.born < 140) gfx->fillScreen(C_WHITE);               // camera flash
    return;
  }
  if (card.kind == INFO_ALARM) {
    if ((now / 450) % 2) { gfx->fillCircle(180, 180, 176, COL(255, 150, 30)); gfx->fillCircle(180, 180, 164, C_BLACK); }
    txtC("TIMER", 180, 140, 5, C_WHITE);
    txtC(card.label[0] ? card.label : "time is up!", 180, 210, 2, ACC);
    txtC("tap to stop", 180, 280, 1, DIM);
    return;
  }
  bool showT = card.wantTime, showW = card.wantWx && card.haveWx;
  bool weatherPage = (showT && showW) ? (((now - card.born) / 5000) % 2 == 1) : showW;
  placeShort(nm, sizeof(nm));
  txtC(nm, 180, weatherPage ? 46 : 70, 2, ACC);
  if (!weatherPage) {                                                    // time page
    int mins = (card.baseMin + (int)((now - card.baseMs) / 60000UL)) % 1440;
    snprintf(b, sizeof(b), "%02d:%02d", mins / 60, mins % 60);
    txtC(b, 180, 168, 8, C_WHITE);
    { char dd[40];
      if (spanishUi()) snprintf(dd, sizeof(dd), "%s %d %s", DOW_ES[card.wday % 7], card.mday, MON_ES[card.mon % 12]); else strlcpy(dd, card.dateTxt, sizeof(dd));
      txtC(dd, 180, 238, 2, DIM); }
    txtC(spanishUi() ? "hora local" : "local time", 180, 280, 1, DIM);
    return;
  }
  drawWxIcon(180, 108, card.code, now);                                  // weather page
  snprintf(b, sizeof(b), "%d", card.temp);
  int w = (int)strlen(b) * 48, x0 = 180 - (w + 64) / 2;
  gfx->setTextSize(8); gfx->setTextColor(C_WHITE); gfx->setCursor(x0, 160); gfx->print(b);
  gfx->drawCircle(x0 + w + 12, 172, 7, C_WHITE); gfx->drawCircle(x0 + w + 12, 172, 6, C_WHITE);
  gfx->setTextSize(5); gfx->setCursor(x0 + w + 24, 168); gfx->print(WEATHER_IMPERIAL ? "F" : "C");
  txtC(spanishUi() ? wmoEs(card.code) : card.cond, 180, 250, 2, DIM);
  if (spanishUi()) snprintf(b, sizeof(b), "Max %d  Min %d  lluvia %d%%", card.hi, card.lo, card.rain);
  else snprintf(b, sizeof(b), "H %d  L %d  rain %d%%", card.hi, card.lo, card.rain);
  txtC(b, 180, 286, 2, ACC);
}

// ============================================================ expressions
static void thickLine(int x0, int y0, int x1, int y1, int t, uint16_t c) {
  float dx = (float)(x1 - x0), dy = (float)(y1 - y0), L = sqrtf(dx * dx + dy * dy);
  if (L < 0.5f) { gfx->fillCircle(x0, y0, t / 2, c); return; }
  float nx = -dy / L * t / 2, ny = dx / L * t / 2;
  int ax = (int)(x0 + nx), ay = (int)(y0 + ny), bx = (int)(x0 - nx), by = (int)(y0 - ny), cx = (int)(x1 + nx), cy = (int)(y1 + ny), ex = (int)(x1 - nx), ey = (int)(y1 - ny);
  gfx->fillTriangle(ax, ay, bx, by, cx, cy, c); gfx->fillTriangle(bx, by, ex, ey, cx, cy, c);
  gfx->fillCircle(x0, y0, t / 2, c); gfx->fillCircle(x1, y1, t / 2, c);
}
static void arcLine(int cx, int cy, int r, float a0, float a1, int t, uint16_t c) {   // angles in radians, 0 = right, PI/2 = down
  int n = (int)(fabsf(a1 - a0) * r / 5); if (n < 6) n = 6;
  int px = cx + (int)(cosf(a0) * r), py = cy + (int)(sinf(a0) * r);
  for (int i = 1; i <= n; i++) {
    float a = a0 + (a1 - a0) * i / n;
    int x = cx + (int)(cosf(a) * r), y = cy + (int)(sinf(a) * r);
    thickLine(px, py, x, y, t, c); px = x; py = y;
  }
}
static void waveLine(int x0, int x1, int y, int amp, float freq, float ph, int t, uint16_t c) {
  int px = x0, py = y + (int)(sinf(ph) * amp);
  for (int x = x0 + 6; x <= x1; x += 6) {
    int yy = y + (int)(sinf(ph + (x - x0) * freq) * amp);
    thickLine(px, py, x, yy, t, c); px = x; py = yy;
  }
}
static void spiral(int cx, int cy, int rmax, float turns, float rot, int t, uint16_t c) {
  float tot = turns * 2 * (float)PI;
  int px = cx, py = cy;
  for (float a = 0.3f; a <= tot; a += 0.3f) {
    float r = rmax * a / tot;
    int x = cx + (int)(cosf(a + rot) * r), y = cy + (int)(sinf(a + rot) * r);
    thickLine(px, py, x, y, t, c); px = x; py = y;
  }
}
static void heartShape(int cx, int cy, int s, uint16_t c) {
  gfx->fillCircle(cx - s / 2, cy - s / 4, s / 2 + 1, c); gfx->fillCircle(cx + s / 2, cy - s / 4, s / 2 + 1, c);
  gfx->fillTriangle(cx - s - 1, cy - s / 8, cx + s + 1, cy - s / 8, cx, cy + s, c);
}
static void starShape(int cx, int cy, int r, uint16_t c) {                              // 4-point sparkle
  int px[8] = { cx, cx + r / 4, cx + r, cx + r / 4, cx, cx - r / 4, cx - r, cx - r / 4 };
  int py[8] = { cy - r, cy - r / 4, cy, cy + r / 4, cy + r, cy + r / 4, cy, cy - r / 4 };
  for (int i = 0; i < 8; i++) gfx->fillTriangle(cx, cy, px[i], py[i], px[(i + 1) % 8], py[(i + 1) % 8], c);
}
static void dropShape(int cx, int cy, int r, uint16_t c) {
  gfx->fillCircle(cx, cy, r, c);
  gfx->fillTriangle(cx - r * 9 / 10, cy - r * 4 / 10, cx + r * 9 / 10, cy - r * 4 / 10, cx, cy - r * 22 / 10, c);
}
// ---- the cute face: big soft-square eyes with a glow and two shines, a smile, a mouth with volume (open mouth with a tongue), and small moods
static void cuteEye(int cx, int cy, int w, int h, uint16_t c) {
  int r = min(w, h) * 36 / 100;
  if (h > 40) {                                                                      // soft glow around the eye
    gfx->fillRoundRect(cx - w / 2 - 10, cy - h / 2 - 10, w + 20, h + 20, r + 10, COL(10, 44, 60));
    gfx->fillRoundRect(cx - w / 2 - 5, cy - h / 2 - 5, w + 10, h + 10, r + 5, COL(26, 96, 126));
  }
  gfx->fillRoundRect(cx - w / 2, cy - h / 2, w, h, r, c);
}
static void cuteSmile(int cx, int my, int wide, uint16_t m) {                        // a soft smile
  arcLine(cx, my - wide / 2, wide / 2 + 4, 0.3f, (float)PI - 0.3f, 11, m);
}
static void volMouth(int cx, int my, float lv, uint16_t m) {                         // mouth with volume: opens with the voice, dark inside, pink tongue
  if (lv < 0) lv = 0;
  if (lv > 1) lv = 1;
  int mh = 16 + (int)(lv * 60), mw = 84 - (int)(lv * 16);
  gfx->fillRoundRect(cx - mw / 2, my - mh / 2, mw, mh, min(mh / 2, 30), m);
  if (mh > 30) {
    int iw = mw - 16, ih = mh - 16;
    gfx->fillRoundRect(cx - iw / 2, my - ih / 2, iw, ih, min(ih / 2, 26), COL(8, 24, 34));
    int r = min(iw / 3, ih * 36 / 100);
    gfx->fillCircle(cx, my + ih / 2 - r, r, COL(255, 105, 140));
  }
}
static void blush(int cx, int cy, int r) { (void)cx; (void)cy; (void)r; }   // cheeks removed on purpose
static void noteShape(int x, int y, int s, uint16_t c) {                              // a music note
  gfx->fillCircle(x, y, s * 55 / 100, c);
  thickLine(x + s / 2, y, x + s / 2, y - s * 19 / 10, 4, c);
  thickLine(x + s / 2, y - s * 19 / 10, x + s * 13 / 10, y - s * 11 / 10, 4, c);
}

static void speakMouth(int cx, int my, uint16_t c) { volMouth(cx, my, max(0.06f, (float)mouthLevel), c); }
static void zText(int x, int y, int size, uint16_t c) { gfx->setTextSize(size); gfx->setTextColor(c); gfx->setCursor(x, y); gfx->print("z"); }

#define KS(v) ((v) * 13 / 10)
static void drawEmotionFace(uint8_t e, uint32_t now) {
  // Same look as the idle face (cyan rounded eyes with a white shine, same mouth). Only angry (red) and love (pink) change colour.
  const uint16_t BG = 0x0000, WH = 0xFFFF;
  float t = now / 1000.0f;
  uint32_t age = now - emoSince;
  bool talking = botState == ST_SPEAK && e != EMO_SLEEP;
  int ox = 0, oy = 0;
  const uint16_t E = COL(80, 220, 255), MC = COL(60, 190, 235), TEAR = COL(150, 225, 255);
  uint16_t C = E, M = MC;
  if (e == EMO_ANGRY) { C = COL(255, 80, 60); M = C; }
  if (e == EMO_LOVE)  { C = COL(255, 90, 140); M = C; }
  if (e == EMO_SCARED) { ox = (int)random(-3, 4); oy = (int)random(-2, 3); }
  if (e == EMO_ANGRY) ox = (int)(sinf(t * 45) * 2);
  if (e == EMO_DIZZY) ox = (int)(sinf(t * 3) * 8);
  if (e == EMO_EXCITED) oy = (int)(sinf(t * 11) * 5);
  if (e == EMO_LAUGH) oy = (int)(sinf(t * 14) * 3);
  if (e == EMO_SLEEP) oy = (int)(sinf(t * 1.3f) * 3);
  if (e == EMO_SURPRISED && age < 300) oy = -(int)(10 - age / 30);
  const int xL = 104 + ox, xR = 256 + ox, ey = 126 + oy, my = 268 + oy;
  auto eye = [&](int x, int y, int w, int h, uint16_t col, bool shine) {      // soft rounded eye, bigger than before, with two shines
    w = KS(w); h = KS(h);
    gfx->fillRoundRect(x - w / 2, y - h / 2, w, h, min(w, h) * 40 / 100, col);
    (void)shine;
  };
  auto flat = [&](int cx, int y) { gfx->fillRoundRect(cx - 35, y - 4, 70, 8, 4, M); };     // the idle mouth
  auto smile = [&](int cx) { arcLine(cx, my - 24, 46, 0.3f, (float)PI - 0.3f, 11, M); };
  auto frown = [&](int cx) { arcLine(cx, my + 30, 40, (float)PI + 0.3f, 2 * (float)PI - 0.3f, 9, M); };
  if (e == EMO_HAPPY || e == EMO_LOVE || e == EMO_WINK || e == EMO_LAUGH || e == EMO_SHY || e == EMO_EXCITED) { blush(54 + ox, ey + 88, 16); blush(306 + ox, ey + 88, 16); }
  switch (e) {
    case EMO_HAPPY:                                                      // (^u^)
      arcLine(xL, ey + 16, KS(30), (float)PI + 0.25f, 2 * (float)PI - 0.25f, 14, C); arcLine(xR, ey + 16, KS(30), (float)PI + 0.25f, 2 * (float)PI - 0.25f, 14, C);
      if (talking) speakMouth(180 + ox, my, M); else smile(180 + ox);
      break;
    case EMO_SAD:                                                        // (~^~)
    case EMO_CRY:
      eye(xL, ey + KS(8), 72, 64, C, false); eye(xR, ey + KS(8), 72, 64, C, false);
      gfx->fillTriangle(xL - KS(40), ey + KS(2), xL + KS(40), ey - KS(16), xL + KS(40), ey - KS(50), BG); gfx->fillTriangle(xL - KS(40), ey + KS(2), xL + KS(40), ey - KS(50), xL - KS(40), ey - KS(50), BG);
      gfx->fillTriangle(xR + KS(40), ey + KS(2), xR - KS(40), ey - KS(16), xR - KS(40), ey - KS(50), BG); gfx->fillTriangle(xR + KS(40), ey + KS(2), xR - KS(40), ey - KS(50), xR + KS(40), ey - KS(50), BG);
      if (e == EMO_SAD) dropShape(xL - KS(10), ey + KS(52) + (int)((now / 45) % 34), 6, TEAR);
      else for (int k = 0; k < 2; k++) {
        int x = k ? xR + KS(6) : xL - KS(6), h = 30 + (int)(sinf(t * 6 + k) * 8);
        gfx->fillRoundRect(x - 5, ey + KS(40), 10, h, 5, TEAR); dropShape(x, ey + KS(40) + h + 12 + (int)((now / 40 + k * 9) % 30), 6, TEAR);
      }
      if (talking) speakMouth(180 + ox, my, M); else frown(180 + ox);
      break;
    case EMO_ANGRY:                                                      // (`^´)
      eye(xL, ey + KS(12), 72, 64, C, false); eye(xR, ey + KS(12), 72, 64, C, false);
      gfx->fillTriangle(xL - KS(42), ey - KS(20), xL + KS(40), ey + KS(6), xL + KS(40), ey - KS(54), BG); gfx->fillTriangle(xL - KS(42), ey - KS(20), xL + KS(40), ey - KS(54), xL - KS(42), ey - KS(54), BG);
      gfx->fillTriangle(xR + KS(42), ey - KS(20), xR - KS(40), ey + KS(6), xR - KS(40), ey - KS(54), BG); gfx->fillTriangle(xR + KS(42), ey - KS(20), xR - KS(40), ey - KS(54), xR + KS(42), ey - KS(54), BG);
      thickLine(xL - KS(42), ey - KS(22), xL + KS(40), ey + KS(4), 12, C); thickLine(xR + KS(42), ey - KS(22), xR - KS(40), ey + KS(4), 12, C);
      if (talking) speakMouth(180 + ox, my, M); else { thickLine(150 + ox, my + 12, 180 + ox, my - 12, 9, M); thickLine(180 + ox, my - 12, 210 + ox, my + 12, 9, M); }
      break;
    case EMO_SLEEP:                                                      // (-_- zzz)
      thickLine(xL - 30, ey + 10, xL + 30, ey + 10, 9, C); thickLine(xR - 30, ey + 10, xR + 30, ey + 10, 9, C);
      flat(180 + ox, my);
      for (int k = 0; k < 3; k++) { float ph = fmodf(t / 2.4f + k * 0.33f, 1.0f); zText(225 + (int)(ph * 40), 115 - (int)(ph * 60), 2 + (int)(ph * 3), MC); }
      break;
    case EMO_DIZZY:                                                      // (@~@)
      spiral(xL, ey, 36, 2.5f, t * 5, 6, C); spiral(xR, ey, 36, 2.5f, t * 5, 6, C);
      if (talking) speakMouth(180 + ox, my, M); else waveLine(135 + ox, 225 + ox, my, 8, 0.12f, t * 8, 8, M);
      for (int k = 0; k < 3; k++) { float a = t * 3 + k * 2.1f; starShape(180 + (int)(cosf(a) * 70), 52 + (int)(sinf(a) * 12), 9, WH); }
      break;
    case EMO_CONFUSED:                                                   // (?)  one eye bigger, normal mouth
      eye(xL, ey, 72, 80, C, true); eye(xR, ey + 8, 56, 56, C, true);
      thickLine(xL - 30, ey - 58, xL + 28, ey - 68, 8, C); thickLine(xR - 26, ey - 36, xR + 26, ey - 28, 8, C);
      if (talking) speakMouth(180 + ox, my, M); else flat(180 + ox, my);
      { gfx->setTextSize(6); gfx->setTextColor(C); gfx->setCursor(282, 40 + (int)(sinf(t * 4) * 6)); gfx->print("?"); }
      break;
    case EMO_CONFIDENT:
      eye(xL, ey + KS(8), 72, 64, C, false); eye(xR, ey + KS(8), 72, 64, C, false);
      gfx->fillRect(xL - KS(40), ey - KS(30), KS(80), KS(40), BG); gfx->fillRect(xR - KS(40), ey - KS(30), KS(80), KS(40), BG);                  // half closed lids
      thickLine(xL - KS(36), ey + KS(10), xL + KS(36), ey + KS(10), 6, C); thickLine(xR - KS(36), ey + KS(10), xR + KS(36), ey + KS(10), 6, C);
      thickLine(xL - KS(32), ey - KS(20), xL + KS(30), ey - KS(28), 8, C); thickLine(xR - KS(30), ey - KS(38), xR + KS(32), ey - KS(30), 8, C);   // one eyebrow higher
      if (talking) speakMouth(180 + ox, my, M); else { thickLine(140 + ox, my + 4, 165 + ox, my + 11, 9, M); thickLine(165 + ox, my + 11, 195 + ox, my + 8, 9, M); thickLine(195 + ox, my + 8, 224 + ox, my - 12, 9, M); }
      break;
    case EMO_SURPRISED:
      eye(xL, ey, 80, 104, C, true); eye(xR, ey, 80, 104, C, true);
      if (talking) gfx->fillCircle(180 + ox, my + 4, 14 + (int)(mouthLevel * 14), M); else { gfx->fillCircle(180 + ox, my + 4, 20, M); gfx->fillCircle(180 + ox, my + 4, 11, BG); }
      break;
    case EMO_SCARED:
      eye(xL, ey, 76, 88, C, false); eye(xR, ey, 76, 88, C, false);
      gfx->fillCircle(xL + (int)random(-3, 4), ey + (int)random(-3, 4), 8, BG); gfx->fillCircle(xR + (int)random(-3, 4), ey + (int)random(-3, 4), 8, BG);
      thickLine(xL - 30, ey - 58, xL + 26, ey - 72, 7, C); thickLine(xR - 26, ey - 72, xR + 30, ey - 58, 7, C);
      if (talking) speakMouth(180 + ox, my, M); else for (int x = 138; x < 222; x += 14) thickLine(x + ox, my + ((x / 14) % 2 ? 7 : -7), x + 14 + ox, my + ((x / 14) % 2 ? -7 : 7), 7, M);
      dropShape(xR + 52, ey - 10 + (int)((now / 55) % 30), 7, TEAR);
      break;
    case EMO_EXCITED: {
      int r = 38 + (int)(sinf(t * 9) * 4);
      starShape(xL, ey, r, C); starShape(xR, ey, r, C);
      if (talking) speakMouth(180 + ox, my, M);
      else { gfx->fillCircle(180 + ox, my - 10, 34, M); gfx->fillRect(180 + ox - 36, my - 46, 72, 36, BG); }
      if ((now / 250) % 2) starShape(62, 92, 10, WH); else starShape(300, 96, 10, WH);
    } break;
    case EMO_LOVE: {
      int s = 32 + (int)(sinf(t * 8) * 3);
      heartShape(xL, ey + 6, s, C); heartShape(xR, ey + 6, s, C);
      if (talking) speakMouth(180 + ox, my, M); else smile(180 + ox);
      for (int k = 0; k < 2; k++) { float ph = fmodf(t * 0.7f + k * 0.5f, 1.0f); heartShape(70 + k * 220 + (int)(sinf(t * 3 + k) * 8), 120 - (int)(ph * 90), 9, C); }
    } break;
    case EMO_WINK:
      eye(xL, ey, 72, 76, C, true);
      arcLine(xR, ey + 16, KS(30), (float)PI + 0.25f, 2 * (float)PI - 0.25f, 14, C);
      if (talking) speakMouth(180 + ox, my, M); else smile(180 + ox);
      if (age < 700) starShape(xR + 42, ey - 30, 10, WH);
      break;
    case EMO_LAUGH:
      arcLine(xL, ey + 16, KS(30), (float)PI + 0.25f, 2 * (float)PI - 0.25f, 14, C); arcLine(xR, ey + 16, KS(30), (float)PI + 0.25f, 2 * (float)PI - 0.25f, 14, C);
      { int open = talking ? (int)(mouthLevel * 20) : 0;
        gfx->fillCircle(180 + ox, my - 12, 40, M); gfx->fillRect(180 + ox - 42, my - 54, 84, 42 - open / 2, BG); }
      dropShape(xL - 42, ey + 36 + (int)((now / 50) % 18), 7, TEAR); dropShape(xR + 42, ey + 36 + (int)((now / 50 + 9) % 18), 7, TEAR);
      break;
    case EMO_SLEEPY: {
      int lid = ey + KS(6) + (int)(sinf(t * 1.2f) * 10);
      eye(xL, ey + KS(10), 72, 64, C, false); eye(xR, ey + KS(10), 72, 64, C, false);
      gfx->fillRect(xL - KS(40), ey - KS(30), KS(80), lid - (ey - KS(30)), BG); gfx->fillRect(xR - KS(40), ey - KS(30), KS(80), lid - (ey - KS(30)), BG);
      thickLine(xL - KS(36), lid, xL + KS(36), lid, 6, C); thickLine(xR - KS(36), lid, xR + KS(36), lid, 6, C);
      if (talking) speakMouth(180 + ox, my, M); else { int r = 10 + (int)((sinf(t * 1.5f) + 1) * 7); gfx->fillCircle(180 + ox, my, r, M); gfx->fillCircle(180 + ox, my, r - 5, BG); }
      zText(268, 88 - (int)((now / 60) % 20), 3, MC);
    } break;
    case EMO_SHY:
      eye(xL - 8, ey + 24, 64, 64, C, true); eye(xR - 8, ey + 24, 64, 64, C, true);
      for (int k = 0; k < 3; k++) { thickLine(xL - 48 + k * 12, ey + 92, xL - 38 + k * 12, ey + 76, 4, C); thickLine(xR + 2 + k * 12, ey + 92, xR + 12 + k * 12, ey + 76, 4, C); }
      if (talking) speakMouth(180 + ox, my + 6, M); else arcLine(180 + ox, my - 6, 22, 0.3f, (float)PI - 0.3f, 7, M);
      break;
    case EMO_BORED: {
      int gx = (int)(sinf(t * 0.8f) * 8);
      eye(xL + gx, ey + KS(10), 72, 64, C, false); eye(xR + gx, ey + KS(10), 72, 64, C, false);
      gfx->fillRect(xL - KS(40), ey - KS(30), KS(80), KS(40), BG); gfx->fillRect(xR - KS(40), ey - KS(30), KS(80), KS(40), BG);
      thickLine(xL - KS(36), ey + KS(10), xL + KS(36), ey + KS(10), 6, C); thickLine(xR - KS(36), ey + KS(10), xR + KS(36), ey + KS(10), 6, C);
      if (talking) speakMouth(180 + ox, my, M); else thickLine(150 + ox, my + 6, 210 + ox, my - 2, 7, M);
    } break;
    default: break;
  }
}

// state: 0 idle, 1 listening, 2 thinking, 3 speaking
static void drawCuteFace(uint32_t now, int state, float bl, float mic, float ml, float gx, float gy) {
  const uint16_t EYE = COL(80, 220, 255), M = COL(60, 190, 235);
  float t = now / 1000.0f;
  int w = 112, h = 120, oy = 0;
  switch (state) {
    case 1: w = 116; h = 132; break;
    case 2: w = 102; h = 106; gx = 16; gy = -16; break;
    case 3: h = 120 + (int)(ml * 10); oy = -(int)(ml * 5); break;
    default: h = 120 + (int)(sinf(t * 1.6f) * 3); break;
  }
  int hh = max(8, (int)(h * (1 - 0.92f * bl)));
  int ey = 124 + oy + (int)gy, ex0 = 104 + (int)gx, ex1 = 256 + (int)gx;
  cuteEye(ex0, ey, w, hh, EYE); cuteEye(ex1, ey, w, hh, EYE);
  blush(54, 218 + oy, 16); blush(306, 218 + oy, 16);
  int my = 268 + oy;
  switch (state) {
    case 3: volMouth(180, my, max(0.06f, ml), M); break;
    case 2: for (int i = 0; i < 3; i++) gfx->fillCircle(150 + i * 30, my, (((now / 300) % 3) == (uint32_t)i) ? 10 : 6, M); break;
    case 1: gfx->fillCircle(180, my, 14, M); gfx->fillCircle(180, my, 7, COL(8, 24, 34)); break;
    default: cuteSmile(180, my + 14, 76, M); break;
  }
}
// singing (a song is playing): happy closed eyes, mouth moving with the music, little sway, notes floating up
static void drawSingFace(uint32_t now, float lv) {
  const uint16_t EYE = COL(80, 220, 255), M = COL(60, 190, 235);
  float t = now / 1000.0f;
  int ox = (int)(sinf(t * 2.6f) * 9), oy = (int)(fabsf(sinf(t * 5.2f)) * -6);
  int ey = 134 + oy;
  arcLine(104 + ox, ey + 20, 40, (float)PI + 0.2f, 2 * (float)PI - 0.2f, 14, EYE);
  arcLine(256 + ox, ey + 20, 40, (float)PI + 0.2f, 2 * (float)PI - 0.2f, 14, EYE);
  blush(54 + ox, 212 + oy, 16); blush(306 + ox, 212 + oy, 16);
  float beat = 0.5f + 0.5f * sinf(t * 9.0f);
  volMouth(180 + ox, 268 + oy, 0.22f + lv * 0.55f + beat * 0.22f, M);
  const uint16_t NC[3] = { 0xFFFF, COL(80, 220, 255), COL(255, 130, 170) };
  for (int k = 0; k < 3; k++) {
    float ph = fmodf(t * 0.5f + k * 0.34f, 1.0f);
    int side = (k % 2) ? 1 : -1;
    int x = 180 + side * (140 + (int)(sinf(t * 2.0f + k * 2.0f) * 8));
    int y = 250 - (int)(ph * 170);
    if (ph < 0.92f) noteShape(x, y, 15 + k * 2, NC[k]);
  }
}

static void drawStatus(uint32_t now, const char* msg) {
  uint16_t orange = gfx->color565(255, 150, 30);
  float a = now / 250.0f;
  for (int i = 0; i < 8; i++) {
    float ang = a + i * 0.785f;
    int r = (i == (int)(a) % 8) ? 9 : 5;
    gfx->fillCircle(180 + cosf(ang) * 60, 150 + sinf(ang) * 60, r, orange);
  }
  gfx->setTextColor(C_WHITE);
  gfx->setTextSize(3);
  int w = strlen(msg) * 18;
  gfx->setCursor(180 - w / 2, 250);
  gfx->print(msg);
}

static void drawSleepFace(uint32_t now) {
  const uint16_t EYE = gfx->color565(40, 110, 130);
  const int exs[2] = { 112, 248 };
  for (int i = 0; i < 2; i++) gfx->fillRoundRect(exs[i] - 34, 152, 68, 9, 4, EYE);   // closed eyes
  gfx->fillRoundRect(160, 262, 40, 6, 3, EYE);
  gfx->setTextColor(gfx->color565(130, 130, 190));
  for (int k = 0; k < 3; k++) {                                                      // floating z z z
    float ph = fmodf(now / 2400.0f + k * 0.33f, 1.0f);
    gfx->setTextSize(2 + (int)(ph * 3));
    gfx->setCursor(225 + (int)(ph * 40), 115 - (int)(ph * 60));
    gfx->print("z");
  }
}

static void drawFace(uint32_t now) {
  static bool blinking = false;
  static uint32_t blinkStart = 0, nextBlink = 2500;
  const uint16_t BG = 0x0000;
  const uint16_t EYE = gfx->color565(80, 220, 255);
  const uint16_t MOUTH = gfx->color565(60, 190, 235);

#if USE_VIDEO
  if (vidReq >= 0 || vidStopReq || vidPlaying) { videoStep(now); if (vidPlaying) return; }
#endif
  if (menuOpen) { drawMenu(now); return; }
  gfx->fillScreen(BG);
  if (WiFi.status() != WL_CONNECTED) { drawStatus(now, "Wi-Fi..."); return; }
  if (!wsUp) { drawStatus(now, "Server..."); return; }
  if (cardActive(now)) { drawCard(now); return; }
  if (sleeping && botState == ST_IDLE) { drawEmotionFace(EMO_SLEEP, now); return; }
#if USE_SD_MUSIC
  if (songPlaying && !songPaused && botState == ST_IDLE && !emo) { drawSingFace(now, songLevel); return; }
#endif
  {
    uint8_t e = emo;
    if (e && ((int32_t)(now - emoUntil) >= 0 || botState == ST_LISTEN)) { emo = EMO_NONE; e = EMO_NONE; }
    if (e && botState == ST_SPEAK && (int32_t)(emoUntil - now) < 1800) emoUntil = now + 1800;      // the expression stays while he talks
    if (e) { drawEmotionFace(e, now); return; }
  }

  float t = now / 1000.0f;
  if (!blinking && now >= nextBlink) { blinking = true; blinkStart = now; }
  float bl = 0;
  if (blinking) {
    float p = (now - blinkStart) / 160.0f;
    if (p >= 1) { blinking = false; nextBlink = now + 2500 + random(3500); }
    else bl = sinf(p * PI);
  }

  BotState s = botState;
  float gx = 0, gy = 0;
  if (s == ST_IDLE) { gx = sinf(t * 0.7f) * 6; gy = cosf(t * 0.5f) * 3; }
  if (s == ST_LISTEN) {                      // ring around the rim that pulses with the mic level
    float lv = micLevel;
    gfx->fillCircle(180, 180, 178, gfx->color565(40, 220, 120));
    gfx->fillCircle(180, 180, 174 - (int)(lv * 10), BG);
  }
  drawCuteFace(now, s == ST_LISTEN ? 1 : s == ST_THINK ? 2 : s == ST_SPEAK ? 3 : 0, bl, micLevel, mouthLevel, gx, gy);
}

// ============================================================ videos from the microSD card (folder "video", AVI files: Motion-JPEG picture + optional PCM sound), shown on the round screen
#if USE_VIDEO
#define VID_BUF (160 * 1024)                                   // the biggest JPEG frame he accepts
#define VID_AHEAD 24000                                        // sound kept queued ahead: 24000 bytes = 0.5 s (24 kHz, 16 bit, mono)
#define VID_SYNC_US 60000                                      // the picture waits a little for the sound to come out of the speaker
static File vidFile, vidAFile;                                 // two readers of the same file: one for the picture, one for the sound
static uint8_t* vidBuf = nullptr;                              // one compressed frame (PSRAM)
static uint16_t* vidPix = nullptr;                             // the decoded 360x360 picture (PSRAM)
static uint32_t vidUs = 41667, vidMoviStart = 0, vidMoviEnd = 0, vidPos = 0, vidT0 = 0, vidFrameNo = 0;
static bool vidHasAudio = false, vidAEnd = false, vidClock = false;
static uint16_t vidACh = 1; static uint32_t vidARate = 24000;
static uint32_t vidAPos = 0, vidABase = 0, vidAThis = 0, vidALoopBytes = 0;   // vidAThis: sound bytes queued in this round; vidALoopBytes: the length of a whole round
static int vidALoops = 0;                                      // rounds of sound the reader has finished that the picture has not reached yet
static float vidAPhase = 0; static int16_t vidAPrev = 0;
static int vidBad = 0;
static uint32_t le32(const uint8_t* p) { return p[0] | (p[1] << 8) | (p[2] << 16) | ((uint32_t)p[3] << 24); }

static String videoPrompt() {
  String s = "- Videos: you can show videos (with sound) on your round screen, stored on your SD card. The videos, numbered: ";
  for (int i = 0; i < vidCount && i < 20; i++) { String n = vidName[i]; n.remove(n.length() - 4); n.replace("_", " "); s += String(i + 1) + " " + n + "; "; }
  s += "\n  To show one put [video N] (its number) or [video random] in your reply, and [video_stop] to stop it. Say in one short sentence what you are showing. They can also tap the screen to stop it.\n";
  return s;
}

static bool videoParse() {                                     // finds the frame rate, the sound format and where the data is inside the AVI file
  uint8_t h[12];
  if (!vidFile.seek(0) || vidFile.read(h, 12) != 12 || memcmp(h, "RIFF", 4) || memcmp(h + 8, "AVI ", 4)) return false;
  uint32_t pos = 12, fsz = vidFile.size();
  vidUs = 41667; vidMoviStart = vidMoviEnd = 0; vidHasAudio = false;
  int lastStream = 0;                                          // 1 = the stream described now is video, 2 = sound
  for (int guard = 0; guard < 200 && pos + 8 <= fsz; guard++) {
    uint8_t c[8];
    if (!vidFile.seek(pos) || vidFile.read(c, 8) != 8) break;
    uint32_t sz = le32(c + 4);
    if (!memcmp(c, "LIST", 4)) {
      uint8_t t[4];
      if (vidFile.read(t, 4) != 4) break;
      if (!memcmp(t, "movi", 4)) { vidMoviStart = pos + 12; vidMoviEnd = fsz; return vidMoviEnd > vidMoviStart; }      // (to the end of the file: films over 1 GB continue in a second "RIFF AVIX" block)
      pos += 12; continue;                                     // hdrl, strl...: look inside
    }
    if (!memcmp(c, "avih", 4) && sz >= 4) { uint8_t u[4]; if (vidFile.read(u, 4) == 4) { uint32_t us = le32(u); if (us >= 5000 && us <= 1000000) vidUs = us; } }
    if (!memcmp(c, "strh", 4) && sz >= 4) { uint8_t u[4]; if (vidFile.read(u, 4) == 4) lastStream = !memcmp(u, "auds", 4) ? 2 : !memcmp(u, "vids", 4) ? 1 : 0; }
    if (!memcmp(c, "strf", 4) && lastStream == 2 && sz >= 16) {
      uint8_t w[16];
      if (vidFile.read(w, 16) == 16) {
        uint16_t fmt = w[0] | (w[1] << 8), ch = w[2] | (w[3] << 8), bits = w[14] | (w[15] << 8); uint32_t rate = le32(w + 4);
        if (fmt == 1 && bits == 16 && (ch == 1 || ch == 2) && rate >= 8000 && rate <= 48000) { vidHasAudio = true; vidACh = ch; vidARate = rate; }
        else Serial.printf("video: the sound is not 16-bit PCM mono/stereo (format %u, %u bits), playing it without sound\n", fmt, bits);
      }
    }
    pos += 8 + sz + (sz & 1);
  }
  return false;
}

// sound: convert a block of 16-bit PCM (mono or stereo, any rate) to the speaker format (24 kHz mono) and queue it
static void videoAudioFeed(const int16_t* in, size_t frames) {
  static int16_t mono[1026], out[3200];
  float ratio = (float)vidARate / 24000.0f;
  while (frames) {
    size_t n = frames > 1024 ? 1024 : frames;
    mono[0] = vidAPrev;
    for (size_t i = 0; i < n; i++) mono[i + 1] = vidACh == 2 ? (int16_t)(((int)in[2 * i] + in[2 * i + 1]) / 2) : in[i];
    size_t k = 0;
    while (vidAPhase < (float)n && k < 3190) {
      int i = (int)vidAPhase; float f = vidAPhase - i;
      out[k++] = (int16_t)((mono[i] * (1.0f - f) + mono[i + 1] * f) * MUSIC_GAIN);
      vidAPhase += ratio;
    }
    vidAPhase -= (float)n; if (vidAPhase < 0) vidAPhase = 0;
    vidAPrev = mono[n];
    if (k) { spkPush((const uint8_t*)out, k * 2); vidAThis += (uint32_t)k * 2; }
    in += n * vidACh; frames -= n;
  }
}
static void videoAudioPump() {                                 // keeps about half a second of sound queued, reading the sound chunks of the file
  if (!vidHasAudio || !vidAFile || vidAEnd) return;
  static int16_t abuf[2048];
  for (int guard = 0; guard < 60 && spkRing.avail() < VID_AHEAD; guard++) {
    if (vidAPos + 8 > vidMoviEnd) {                            // end of the sound: start the next round at once, so the loop has no gap
      if (vidAThis == 0) { vidAEnd = true; return; }
      vidALoopBytes = vidAThis; vidAThis = 0; vidALoops++; vidAPos = vidMoviStart; vidAPhase = 0; vidAPrev = 0; continue;
    }
    uint8_t c[8];
    if (!vidAFile.seek(vidAPos) || vidAFile.read(c, 8) != 8) { vidAEnd = true; return; }
    uint32_t sz = le32(c + 4);
    if (!memcmp(c, "LIST", 4) || !memcmp(c, "RIFF", 4)) { vidAPos += 12; continue; }
    uint32_t next = vidAPos + 8 + sz + (sz & 1);
    if (c[2] == 'w' && c[3] == 'b' && sz > 0) {
      uint32_t left = sz;
      uint32_t unit = 2u * vidACh;
      while (left >= unit) {
        uint32_t want = left > sizeof(abuf) ? sizeof(abuf) : left;
        want -= want % unit;
        if (vidAFile.read((uint8_t*)abuf, want) != (int)want) { vidAEnd = true; return; }
        videoAudioFeed(abuf, want / unit);
        left -= want;
      }
    }
    vidAPos = next;
  }
}
static void videoAudioRestart() {                              // the video starts again from the first frame: so does the sound
  if (!vidHasAudio) return;
  vidClock = false;
  if (vidALoops > 0) { vidALoops--; vidABase += vidALoopBytes; return; }       // the sound already started the new round by itself
  vidAPos = vidMoviStart; vidAEnd = false; vidAPhase = 0; vidAPrev = 0; vidAThis = 0;
  vidABase = spkRing.tail.load() + spkRing.avail();            // otherwise: where the first sound of the new round will be in the speaker counter
}

// next video frame: load = copy it into vidBuf, otherwise just skip it. Returns its size (0 = trouble). wrapped = it started again from the first frame.
static uint32_t videoReadFrame(bool load, bool& wrapped) {
  wrapped = false;
  for (int guard = 0; guard < 200; guard++) {
    if (vidPos + 8 > vidMoviEnd) { vidPos = vidMoviStart; wrapped = true; }
    uint8_t c[8];
    if (!vidFile.seek(vidPos) || vidFile.read(c, 8) != 8) return 0;
    uint32_t sz = le32(c + 4);
    if (!memcmp(c, "LIST", 4) || !memcmp(c, "RIFF", 4)) { vidPos += 12; continue; }
    uint32_t next = vidPos + 8 + sz + (sz & 1);
    if (c[2] == 'd' && (c[3] == 'c' || c[3] == 'b') && sz > 0) {
      if (load && (sz > VID_BUF || vidFile.read(vidBuf, sz) != (int)sz)) { vidPos = next; return 0; }
      vidPos = next; return sz;
    }
    vidPos = next;
  }
  return 0;
}

struct VidCb { static int draw(JPEGDRAW* p) {                  // copies each decoded block into the 360x360 picture, row by row
  for (int y = 0; y < p->iHeight; y++) {
    int dy = p->y + y;
    if (dy < 0 || dy >= 360 || p->x < 0 || p->x + p->iWidth > 360) continue;
    memcpy(vidPix + dy * 360 + p->x, p->pPixels + y * p->iWidth, p->iWidth * 2);
  }
  return 1;
} };

static void videoClose() {
  if (vidFile) vidFile.close();
  if (vidAFile) vidAFile.close();
  if (vidHasAudio) { spkFlushReq = true; if (!songPlaying) musicOn = false; }
  vidHasAudio = false; vidPlaying = false;
}

static void videoOpen(int i) {
  musicHalt();                                                 // the card is used by one thing at a time
  if (!vidBuf) vidBuf = (uint8_t*)ps_malloc(VID_BUF);
  if (!vidPix) vidPix = (uint16_t*)ps_malloc(360 * 360 * 2);
  if (!vidBuf || !vidPix) { Serial.println("video: out of memory"); sadTones(); return; }
  String p = String("/video/") + vidName[i];
  if (vidFile) vidFile.close();
  if (vidAFile) vidAFile.close();
  vidFile = sdOpen(p.c_str());
  if (!vidFile || !videoParse()) {
    Serial.printf("video: cannot read %s (it must be an .avi with Motion-JPEG video, see the README)\n", p.c_str());
    sadTones(); if (vidFile) vidFile.close(); return;
  }
  if (vidHasAudio) {
    vidAFile = sdOpen(p.c_str());
    if (!vidAFile) vidHasAudio = false;
  }
  memset(vidPix, 0, 360 * 360 * 2);
  vidPos = vidMoviStart; vidFrameNo = 0; vidT0 = millis(); vidBad = 0; vidClock = false;
  vidAPos = vidMoviStart; vidAEnd = false; vidAPhase = 0; vidAPrev = 0; vidAThis = 0; vidALoopBytes = 0; vidALoops = 0;
  if (vidHasAudio) {
    musicOn = true;                                            // he does not listen while the sound plays
    spkFlushReq = true;
    for (uint32_t w0 = millis(); spkFlushReq && millis() - w0 < 150; ) delay(2);
    vidABase = spkRing.tail.load() + spkRing.avail();
    videoAudioPump();                                          // queue the first half second of sound
  }
  vidPlaying = true; menuOpen = false; card.until = 0; emo = EMO_NONE; activity();
  Serial.printf("video: playing %s (%.1f fps, %s; he skips frames if the card or the chip cannot keep up)\n", vidName[i], 1000000.0f / vidUs,
                vidHasAudio ? "with sound" : "no sound");
}

static void videoStep(uint32_t now) {                          // called from the screen drawing: shows the frame that is due
  if (vidStopReq) { vidStopReq = false; if (vidPlaying) { videoClose(); Serial.println("video: stopped"); } return; }
  if (vidReq >= 0) { int i = vidReq; vidReq = -1; videoOpen(i); }
  if (!vidPlaying) return;
  lastActivity = now;
  videoAudioPump();
  if (vidHasAudio && !vidClock && vidAEnd && spkRing.avail() == 0) {      // the sound is over before the picture: finish by the clock
    vidClock = true; vidT0 = now - (uint32_t)(((uint64_t)vidFrameNo * vidUs) / 1000ULL);
  }
  uint32_t tgt;
  if (vidHasAudio && !vidClock) {                              // the sound is the clock: the picture follows what the speaker has played
    int32_t d = (int32_t)(spkRing.tail.load() - vidABase);
    uint64_t us = d > 0 ? (uint64_t)d * 1000000ULL / 48000ULL : 0;
    us = us > VID_SYNC_US ? us - VID_SYNC_US : 0;
    tgt = (uint32_t)(us / vidUs);
  } else tgt = (uint32_t)(((uint64_t)(now - vidT0) * 1000ULL) / vidUs);
  if (vidFrameNo > tgt) return;                                // not time for the next frame yet
  bool wrapped = false;
  for (int skipped = 0; vidFrameNo < tgt && skipped < 60; skipped++) {      // behind: skip frames without decoding them
    videoReadFrame(false, wrapped);
    if (wrapped) { vidT0 = now; vidFrameNo = 0; tgt = 0; videoAudioRestart(); break; }
    vidFrameNo++;
  }
  uint32_t sz = videoReadFrame(true, wrapped);
  if (wrapped) { vidT0 = now; vidFrameNo = 0; videoAudioRestart(); }
  vidFrameNo++;
  if (!sz || !jdec.openRAM(vidBuf, sz, VidCb::draw)) {
    if (++vidBad > 30) { Serial.println("video: the file cannot be read, stopping"); videoClose(); sadTones(); }
    return;
  }
  vidBad = 0;
  jdec.setPixelType(RGB565_LITTLE_ENDIAN);
  int w = jdec.getWidth(), h = jdec.getHeight(), sc = 0, div = 1;
  if (w > 360 * 2 || h > 360 * 2) { sc = JPEG_SCALE_QUARTER; div = 4; }
  else if (w > 360 || h > 360) { sc = JPEG_SCALE_HALF; div = 2; }
  jdec.decode((360 - w / div) / 2, (360 - h / div) / 2, sc);
  jdec.close();
  gfx->draw16bitRGBBitmap(0, 0, vidPix, 360, 360);
}
#endif

// ============================================================ setup / loop
void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\nRobit robot starting");
  pinMode(PIN_BOOT_BTN, INPUT_PULLUP);

  spkMux = xSemaphoreCreateMutex();
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL, 400000);
  lcdResetViaExpander();
  if (!gfx->begin(LCD_SPEED)) Serial.println("display init failed (is PSRAM set to OPI PSRAM?)");
  prefs.begin("robit", false);
  blAwake = prefs.getInt("bl", BL_AWAKE);
  spkVolume = prefs.getFloat("vol", SPK_VOLUME);
  ttsSpeed = prefs.getFloat("speed", TTS_SPEED);
  sleepAfterSec = prefs.getUInt("sleep", SLEEP_AFTER_SEC);
  reactionsOn = prefs.getBool("react", REACTIONS);
  { String l = prefs.getString("lang", LANGUAGE); if (l == "es" || l == "en" || l == "auto") { strlcpy(langMode, l.c_str(), sizeof(langMode)); lastSpanish = l != "en"; } }
  ledcAttach(PIN_LCD_BL, 5000, 8);
  setBacklight(blAwake);
  gfx->fillScreen(C_BLACK); flushScreen();
  lastActivity = millis();

  if (!micRing.init(128 * 1024) || !spkRing.init(4 * 1024 * 1024)) Serial.println("audio buffers: out of memory (enable PSRAM)");

  pcaOk = pcaInit();
#if USE_SD_MUSIC
  sdMusicInit();
#elif defined(SD_LIB_MISSING)
  Serial.println("songs: install the library 'libhelix' (Sketch > Include Library > Manage Libraries) to play MP3 songs from the SD card");
#endif
  Serial.println(pcaOk ? "servo driver found" : "servo driver (PCA9685) NOT found on I2C 0x40 - movements disabled");
  if (pcaOk) for (int i = 0; i < NS; i++) { servoWrite(i, curAng[i]); lastSent[i] = curAng[i]; }

#if USE_IMU
  Serial.println(imuInit() ? "motion sensor found (QMI8658)" : "motion sensor NOT found - shake / lift / upside-down reactions disabled");
#endif
#if USE_TOUCH
  Wire1.begin(TP_SDA, TP_SCL, 400000);
  for (int tries = 0; tries < 3 && !touchOk; tries++) {
    Wire1.beginTransmission(TOUCH_ADDR);
    touchOk = (Wire1.endTransmission() == 0);
    if (!touchOk) delay(30);
  }
  if (touchOk) { Wire1.beginTransmission(TOUCH_ADDR); Wire1.write(0xFE); Wire1.write(0xFF); Wire1.endTransmission(); }     // keep the touch chip from sleeping
  Serial.println(touchOk ? "touch screen found (CST816)" : "touch screen NOT found - tap reactions disabled");
#endif

  i2sMic.setPins(PIN_MIC_SCK, PIN_MIC_WS, -1, PIN_MIC_SD);
  if (!i2sMic.begin(I2S_MODE_STD, MIC_RATE, I2S_DATA_BIT_WIDTH_32BIT, I2S_SLOT_MODE_STEREO, I2S_STD_SLOT_BOTH)) Serial.println("mic I2S failed");
  i2sSpk.setPins(PIN_SPK_BCK, PIN_SPK_LRCK, PIN_SPK_DIN);
  if (!i2sSpk.begin(I2S_MODE_STD, SPK_RATE, I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_STEREO, I2S_STD_SLOT_BOTH)) Serial.println("speaker I2S failed");
  xTaskCreatePinnedToCore(micTask, "mic", 6144, NULL, 5, NULL, 1);
  xTaskCreatePinnedToCore(spkTask, "spk", 6144, NULL, 5, NULL, 1);
#if USE_SD_MUSIC
  xTaskCreatePinnedToCore(songTask, "song", 16384, NULL, 2, NULL, 0);
#endif

  // startup beep: two short tones, so you can check the speaker without the server
  {
    static int16_t beep[2400];                       // 0.1 s at 24 kHz
    for (int rep = 0; rep < 2; rep++) {
      int hz = rep == 0 ? 660 : 880;
      for (int i = 0; i < 2400; i++) beep[i] = (int16_t)(7000.0f * sinf(2.0f * 3.14159265f * hz * i / SPK_RATE));
      spkRing.write((const uint8_t*)beep, sizeof(beep));
    }
    Serial.println("startup beep sent to the speaker");
  }

#if STANDALONE
  uiQ = xQueueCreate(24, sizeof(UiMsg));
  capBuf = (int16_t*)ps_malloc(UTT_MAX_SAMPLES * 2);
  jobBuf = (int16_t*)ps_malloc(UTT_MAX_SAMPLES * 2);
  if (!capBuf || !jobBuf) Serial.println("recording buffers: out of memory (enable PSRAM)");
  { String n = prefs.getString("name", ""); if (n.length() >= 2) robotName = n; }
  memLoad();
  autoMode = prefs.getBool("auto", LISTEN_AUTO);
#if WAKE_TEST
  autoMode = true;
#endif
  if (!strncmp(OPENAI_KEY, "sk-your", 7) || !strncmp(ANTHROPIC_KEY, "sk-ant-your", 11)) Serial.println("!!! put your OpenAI and Anthropic keys in the settings at the top of the sketch");
  Serial.printf("standalone mode: name %s, listening %s\n", robotName.c_str(), autoMode ? "always" : "with the BOOT button");
#endif
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.setAutoReconnect(true);
  wifiMulti.addAP(WIFI_SSID, WIFI_PASS);
  if (WIFI_SSID2[0]) wifiMulti.addAP(WIFI_SSID2, WIFI_PASS2);
  if (WIFI_SSID3[0]) wifiMulti.addAP(WIFI_SSID3, WIFI_PASS3);
  loadSavedWifi();                                      // networks added through the setup page
  wifiMulti.run(8000);

#if !STANDALONE
  webSocket.onEvent(wsEvent);
  webSocket.setReconnectInterval(2000);
  webSocket.enableHeartbeat(15000, 4000, 2);
#endif
}

void loop() {
  uint32_t now = millis();

  if (WiFi.status() != WL_CONNECTED) {                 // lost the network or not found yet: look for any known one
    static uint32_t nextTry = 0;
    if (now > nextTry && !portalOn) { nextTry = now + 10000; wifiMulti.run(4000); }
    if (!portalAutoDone && now > 60000 && !portalOn) { portalAutoDone = true; portalBegin(); }   // nothing found in a minute: offer the setup page
  }

#if STANDALONE
  {
    static bool wasUp = false;
    bool wifiOk = WiFi.status() == WL_CONNECTED;
    if (wifiOk && !wasUp) {
      wasUp = true; wsUp = true;
      Serial.printf("Wi-Fi ok, ip %s\n", WiFi.localIP().toString().c_str());
      if (!wsStarted) { wsStarted = true; startStandalone(); }
      beep(880, 70); beep(1175, 90);
    } else if (!wifiOk && wasUp) {
      wasUp = false; wsUp = false;
    }
  }
#else
  if (WiFi.status() == WL_CONNECTED) {
    if (!wsStarted) {
      wsStarted = true;
      Serial.printf("Wi-Fi ok, ip %s -> ws://%s:%d\n", WiFi.localIP().toString().c_str(), SERVER_HOST, SERVER_PORT);
      webSocket.begin(SERVER_HOST, SERVER_PORT, "/");
    }
    webSocket.loop();
  }
#endif

  {                                                    // Serial Monitor test: type  face happy   or   faces   (cycles through all) or  face idle
    static String sb; static bool demo = false; static int di = 1; static uint32_t demoAt = 0;
    while (Serial.available()) {
      char ch = (char)Serial.read();
      if (ch != '\n' && ch != '\r') { if (sb.length() < 40) sb += ch; continue; }
      sb.trim(); sb.toLowerCase();
      if (sb == "faces") { demo = true; di = 1; demoAt = 0; Serial.println("faces: showing every expression, 3 s each (type face idle to stop)"); }
      else if (sb.startsWith("face ")) {
        demo = false; int em = emotionByName(sb.c_str() + 5);
        if (em < 0) Serial.println("faces: happy sad angry sleep dizzy confused confident surprised scared excited love wink laugh sleepy shy bored cry idle");
        else { if (em == EMO_NONE) emo = EMO_NONE; else setEmotion(em, 15000); Serial.printf("face: %s\n", EMO_NAME[em]); }
      }
      sb = "";
    }
    if (demo && now >= demoAt) {
      if (di >= EMO_COUNT) { demo = false; emo = EMO_NONE; Serial.println("faces: done"); }
      else { setEmotion(di, 3000); Serial.printf("face: %s\n", EMO_NAME[di]); sleeping = false; di++; demoAt = now + 3000; }
    }
  }
  handleButton(now);
  portalTick(now);
  menuTick(now);
  if (menuReq) {
    int r = menuReq; menuReq = 0;
    if (r == 7) { if (menuOpen) { menuOpen = false; menuScreen = M_MAIN; } }
#if USE_MAP
    else if (r == 8) mapOpenReq = true;
#endif
    else {
      openMenu();
#if USE_VIDEO
      if (vidPlaying) videoStop();
#endif
      if (r == 2) { exprPage = 0; menuScreen = M_EXPR; }
      else if (r == 3) menuScreen = M_LANG;
      else if (r == 4) { songPage = 0; menuScreen = M_SONGS; }
      else if (r == 5) { vidPage = 0; menuScreen = M_VIDEOS; }
      else if (r == 6) menuScreen = M_SET;
    }
  }
#if USE_MAP
  if (mapOpenReq) { mapOpenReq = false; menuOpen = true; menuScreen = M_MAP; menuTouchAt = now; mapDirty = true; activity(); }
#endif
  updateStates(now);
#if STANDALONE
  timerTick(now);
  cannedTick(now);
  captureMic(now);
  drainUi();
#else
  pumpMic();
#endif
  runActionQueue();
  servoTick(now);
  idleMotion(now);
  ultrasonic(now);
#if USE_IMU
  imuTick(now);
#endif
#if USE_TOUCH
  touchTick(now);
#endif

  static uint32_t lastFrame = 0;
  if (now - lastFrame >= (sleeping ? 120u : 1000u / FACE_FPS)) {
    lastFrame = now;
    drawFace(now);
#if STANDALONE
    if ((int32_t)(errUntil - now) > 0 && !menuOpen && !videoOn()) {                                   // last problem, small, at the bottom
      String t = errNote; const int W = 34;
      gfx->setTextSize(1); gfx->setTextColor(gfx->color565(255, 210, 80));
      for (int ln = 0; ln < 3 && t.length(); ln++) {
        String part = t.substring(0, W); t = t.length() > (size_t)W ? t.substring(W) : String("");
        gfx->setCursor(180 - (int)part.length() * 3, 296 + ln * 11); gfx->print(part.c_str());
      }
    }
#endif
    flushScreen();
  }
}
