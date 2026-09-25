#include "bit_websocket.h"

#include <Arduino.h>
#include <WebSocketsClient.h>  // links2004/WebSockets @ 2.7.3 (pinned in platformio.ini)

#include <cstdlib>
#include <cstring>

namespace bit_websocket {

namespace {
WebSocketsClient g_ws;
bool g_connected = false;
StateCallback g_state_cb = nullptr;
PoseCallback g_pose_cb = nullptr;

// The Hub protocol (docs/PROTOCOL.md) is deliberately just two tiny,
// fixed-shape JSON messages: {"type":"state","value":"..."} and
// {"type":"pong"}. Pulling in a full JSON library for that would be
// more risk (an unpinned dependency the rest of this project hasn't
// vetted) than this handful of lines of hand-rolled parsing. If the
// protocol grows beyond flat string fields, switch to ArduinoJson with
// an explicit version pin instead of extending this.
bool extract_string_field(const char* json, const char* key, char* out, size_t out_size) {
  char needle[32];
  snprintf(needle, sizeof(needle), "\"%s\"", key);
  const char* key_pos = strstr(json, needle);
  if (key_pos == nullptr) return false;

  const char* colon = strchr(key_pos, ':');
  if (colon == nullptr) return false;

  const char* value_start = strchr(colon, '"');
  if (value_start == nullptr) return false;
  value_start++;

  const char* value_end = strchr(value_start, '"');
  if (value_end == nullptr) return false;

  size_t len = value_end - value_start;
  if (len >= out_size) len = out_size - 1;
  memcpy(out, value_start, len);
  out[len] = '\0';
  return true;
}

// Same hand-rolled-parser discipline as extract_string_field above: the
// pose message adds exactly one flat numeric field, still well short of
// "the protocol grew beyond flat fields," so this stays consistent with
// that comment's own threshold for switching to a real JSON library.
bool extract_number_field(const char* json, const char* key, float* out) {
  char needle[32];
  snprintf(needle, sizeof(needle), "\"%s\"", key);
  const char* key_pos = strstr(json, needle);
  if (key_pos == nullptr) return false;

  const char* colon = strchr(key_pos, ':');
  if (colon == nullptr) return false;

  char* end = nullptr;
  float value = strtof(colon + 1, &end);
  if (end == colon + 1) return false;  // no digits parsed at all
  *out = value;
  return true;
}

BitVoiceState parse_hub_state(const char* value) {
  if (strcmp(value, "WAITING_WAKE_WORD") == 0) return BitVoiceState::WAITING_WAKE_WORD;
  if (strcmp(value, "LISTENING") == 0) return BitVoiceState::LISTENING;
  if (strcmp(value, "PROCESSING") == 0) return BitVoiceState::PROCESSING;
  // Unknown value from a future Hub protocol version — fail safe rather
  // than guess; stay wherever BIT already was and let the caller notice
  // the mismatch in logs, rather than silently defaulting to IDLE.
  Serial.printf("[ws] unknown state from Hub: %s\n", value);
  return BitVoiceState::WAITING_WAKE_WORD;
}

void handle_text_message(const uint8_t* payload, size_t length) {
  char buf[256];
  size_t n = length < sizeof(buf) - 1 ? length : sizeof(buf) - 1;
  memcpy(buf, payload, n);
  buf[n] = '\0';

  char type[16];
  if (!extract_string_field(buf, "type", type, sizeof(type))) return;

  if (strcmp(type, "state") == 0) {
    char value[32];
    if (extract_string_field(buf, "value", value, sizeof(value)) && g_state_cb != nullptr) {
      g_state_cb(parse_hub_state(value));
    }
  } else if (strcmp(type, "pong") == 0) {
    // Heartbeat acknowledged — nothing to do.
  } else if (strcmp(type, "pose") == 0) {
    char joint[32];
    float angle_deg = 0.0f;
    if (g_pose_cb != nullptr && extract_string_field(buf, "joint", joint, sizeof(joint)) &&
        extract_number_field(buf, "angle_deg", &angle_deg)) {
      g_pose_cb(joint, angle_deg);
    }
  }
}

void event_handler(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      g_connected = true;
      Serial.println("[ws] connected to Hub");
      break;
    case WStype_DISCONNECTED:
      g_connected = false;
      Serial.println("[ws] disconnected from Hub");
      break;
    case WStype_TEXT:
      handle_text_message(payload, length);
      break;
    case WStype_BIN:
      // Reserved for a future phase (Gemini Live audio streamed back to
      // BIT). Not implemented yet — dropped, not buffered.
      break;
    default:
      break;
  }
}
}  // namespace

void begin(const char* host, uint16_t port, const char* device_id) {
  char path[96];
  snprintf(path, sizeof(path), "/ws/stream?device_id=%s", device_id);

  g_ws.begin(host, port, path);
  g_ws.onEvent(event_handler);
  g_ws.setReconnectInterval(2000);
}

void update() { g_ws.loop(); }

bool isConnected() { return g_connected; }

bool sendAudio(const uint8_t* pcm, size_t length) {
  if (!g_connected || pcm == nullptr || length == 0) return false;
  return g_ws.sendBIN(pcm, length);
}

void onHubState(StateCallback callback) { g_state_cb = callback; }

void onHubPose(PoseCallback callback) { g_pose_cb = callback; }

}  // namespace bit_websocket
