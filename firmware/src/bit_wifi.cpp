#include "bit_wifi.h"

#include <WiFi.h>

namespace bit_wifi {

namespace {
const char* g_ssid = nullptr;
const char* g_password = nullptr;

bool g_was_connected = false;
uint32_t g_connected_at_ms = 0;

uint32_t g_last_attempt_ms = 0;
uint32_t g_backoff_ms = 1000;
constexpr uint32_t kMaxBackoffMs = 30000;

void start_connect_attempt() {
  WiFi.disconnect();
  WiFi.begin(g_ssid, g_password);
  g_last_attempt_ms = millis();
}
}  // namespace

void begin(const char* ssid, const char* password) {
  g_ssid = ssid;
  g_password = password;
  WiFi.mode(WIFI_STA);
  start_connect_attempt();
}

void update() {
  const bool connected_now = WiFi.status() == WL_CONNECTED;

  if (connected_now && !g_was_connected) {
    g_connected_at_ms = millis();
    g_backoff_ms = 1000;  // reset backoff on a successful connection
  }

  if (!connected_now && g_was_connected) {
    // Just dropped — the next block will retry on its own backoff timer.
  }

  g_was_connected = connected_now;

  if (!connected_now) {
    const uint32_t now = millis();
    if (now - g_last_attempt_ms >= g_backoff_ms) {
      start_connect_attempt();
      g_backoff_ms = min(g_backoff_ms * 2, kMaxBackoffMs);
    }
  }
}

bool wifiConnected() {
  return WiFi.status() == WL_CONNECTED;
}

uint32_t msSinceConnected() {
  if (!wifiConnected()) return 0;
  return millis() - g_connected_at_ms;
}

}  // namespace bit_wifi
