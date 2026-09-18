// Copy this file to secrets.h (gitignored — never commit real
// credentials) and fill in real values before building.
#pragma once

constexpr const char* kWifiSsid = "YOUR_WIFI_SSID";
constexpr const char* kWifiPassword = "YOUR_WIFI_PASSWORD";

// BIT Hub's address on the local network.
constexpr const char* kHubHost = "192.168.1.100";
constexpr uint16_t kHubPort = 8000;

// Stable per-device identifier the Hub uses to key its device registry.
// Derive from the ESP32's MAC address in production; a fixed string is
// fine for single-unit bring-up/testing.
constexpr const char* kDeviceId = "bit-mark1-001";
