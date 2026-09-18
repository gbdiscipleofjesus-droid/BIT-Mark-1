// Wi-Fi connection manager for BIT.
//
// Naming note: the real API used across this project is
// `wifiConnected()`, not `isWiFiConnected()` — keep it that way; a past
// pass on this file used the wrong name and it broke callers.
#pragma once

#include <cstdint>

namespace bit_wifi {

// Starts the connection attempt (non-blocking) and begins the internal
// reconnect-with-backoff loop that `update()` drives.
void begin(const char* ssid, const char* password);

// Call every loop() iteration. Handles reconnect backoff; does nothing
// expensive when already connected.
void update();

bool wifiConnected();

// Milliseconds since the last time we transitioned from disconnected to
// connected. Useful for UI ("reconnected Xs ago") and for gating the
// WebSocket client's own reconnect attempts.
uint32_t msSinceConnected();

}  // namespace bit_wifi
