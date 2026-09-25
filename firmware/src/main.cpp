// BIT Mark 1 firmware entry point: owns the device's local voice state
// and wires together Wi-Fi, the Hub WebSocket client, audio capture, the
// face display and touch. Heavy lifting (wake word, VAD, Gemini) lives
// in BIT Hub — this file stays deliberately thin.
#include <Arduino.h>

#include "bit_audio.h"
#include "bit_display.h"
#include "bit_motion.h"
#include "bit_state.h"
#include "bit_touch.h"
#include "bit_websocket.h"
#include "bit_wifi.h"
#include "secrets.h"

namespace {

BitVoiceState g_state = BitVoiceState::IDLE;

// Single choke point for local state changes, mirroring the Hub's own
// set_voice_state() pattern (bit_hub/backend/main.py) — every transition
// goes through here so logging and the display never drift out of sync.
void set_voice_state(BitVoiceState state) {
  if (state == g_state) return;
  g_state = state;
  Serial.printf("[state] -> %s\n", bit_voice_state_name(state));
  bit_display::setVoiceState(state);
}

// The Hub is the source of truth for WAITING_WAKE_WORD/LISTENING/
// PROCESSING (docs/PROTOCOL.md) — BIT never decides those on its own.
void on_hub_state(BitVoiceState state) { set_voice_state(state); }

// {"type":"pose",...} from the Hub — see docs/PROTOCOL.md and
// bit_motion.h. Unknown joint names are logged and dropped rather than
// guessed at.
void on_hub_pose(const char* joint, float angle_deg) {
  bit_motion::Joint j;
  if (!bit_motion::jointFromName(joint, &j)) {
    Serial.printf("[motion] unknown joint from Hub: %s\n", joint);
    return;
  }
  bit_motion::setJointAngle(j, angle_deg);
}

bool g_ws_started = false;
bool g_was_wifi_connected = false;
bool g_was_ws_connected = false;

}  // namespace

void setup() {
  Serial.begin(115200);
  set_voice_state(BitVoiceState::IDLE);

  bit_display::begin();
  bit_touch::begin();
  bit_audio::begin();
  bit_motion::begin();
  bit_websocket::onHubState(on_hub_state);
  bit_websocket::onHubPose(on_hub_pose);

  bit_wifi::begin(kWifiSsid, kWifiPassword);
}

void loop() {
  bit_wifi::update();
  bit_display::tick();

  const bool wifi_now = bit_wifi::wifiConnected();

  if (!wifi_now) {
    if (g_was_wifi_connected) {
      set_voice_state(BitVoiceState::IDLE);
    }
    g_was_wifi_connected = false;
    g_was_ws_connected = false;
    return;  // bit_wifi::update() already drives its own reconnect/backoff.
  }
  g_was_wifi_connected = true;

  if (!g_ws_started) {
    bit_websocket::begin(kHubHost, kHubPort, kDeviceId);
    g_ws_started = true;
  }
  bit_websocket::update();

  const bool ws_now = bit_websocket::isConnected();
  if (ws_now && !g_was_ws_connected) {
    set_voice_state(BitVoiceState::WAITING_WAKE_WORD);
  } else if (!ws_now && g_was_ws_connected) {
    set_voice_state(BitVoiceState::IDLE);
  }
  g_was_ws_connected = ws_now;

  if (ws_now) {
    bit_audio::CaptureResult capture = bit_audio::update();
    if (capture.data != nullptr && capture.length > 0) {
      bit_websocket::sendAudio(capture.data, capture.length);
    }
  }

  bit_touch::TouchPoint touch = bit_touch::read();
  if (touch.pressed) {
    // TODO(Phase 3 - Touch + Apps): route to the local app/nav system.
    // Logged for now so touch bring-up is observable on a real board
    // without needing the full app layer built first.
    Serial.printf("[touch] x=%u y=%u\n", touch.x, touch.y);
  }
}
