// WebSocket client connecting BIT to the Hub's /ws/stream endpoint.
// See docs/PROTOCOL.md for the wire format this implements.
#pragma once

#include <cstddef>
#include <cstdint>

#include "bit_state.h"

namespace bit_websocket {

// device_id should be stable across reboots (e.g. derived from the
// ESP32's MAC address) — the Hub keys its device registry by it.
void begin(const char* host, uint16_t port, const char* device_id);

// Pumps the WebSocket client. Call every loop() iteration.
void update();

bool isConnected();

// Sends one chunk of raw PCM16 mono 16kHz audio as a binary frame.
// No-op (and returns false) if not currently connected.
bool sendAudio(const uint8_t* pcm, size_t length);

// Registered once from main.cpp. Called whenever the Hub pushes a
// {"type":"state",...} message, i.e. this is the Hub driving BIT's
// voice state — BIT does not decide WAITING_WAKE_WORD/LISTENING/
// PROCESSING on its own.
using StateCallback = void (*)(BitVoiceState);
void onHubState(StateCallback callback);

// Registered once from main.cpp. Called whenever the Hub pushes a
// {"type":"pose","joint":"...","angle_deg":...} message (see
// docs/PROTOCOL.md). `joint` is the raw wire name — the caller resolves
// it via bit_motion::jointFromName, this layer doesn't know about
// bit_motion's Joint enum.
using PoseCallback = void (*)(const char* joint, float angle_deg);
void onHubPose(PoseCallback callback);

}  // namespace bit_websocket
