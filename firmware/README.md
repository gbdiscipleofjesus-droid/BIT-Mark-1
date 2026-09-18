# BIT firmware

C++/Arduino-ESP32 firmware for the Waveshare ESP32-S3-Touch-LCD-1.85
(SKU 28514). Owns display, touch, mic/speaker I/O, Wi-Fi and the
WebSocket client to BIT Hub — see `../docs/PROTOCOL.md` for the wire
protocol and `include/bit_state.h` for the local state machine.

## Status — be honest about what this is

This firmware has **not been built or flashed on real hardware**. The
dev sandbox this was written in has no network access to PlatformIO's
package registry (`api.registry.platformio.org` returns 403 — a
deliberate network policy, confirmed directly), so `pio run` has not
even been exercised here, let alone a real flash. Do not treat any of
this as "hardware ready." Validate in order:

1. `pio run` in an environment with registry access (GitHub Codespaces,
   per the dossier, or any machine with normal internet access).
2. Flash to the real board over USB-C and watch serial output.
3. Work through the bring-up checklist below before trusting any single
   subsystem.

A `.devcontainer/devcontainer.json` now installs PlatformIO's CLI
automatically when a Codespace is created/rebuilt on this repo. If
you're on a Codespace that predates that file (or `pio` still isn't
found), install it manually:

```bash
pip install --user platformio
pio run
```



## Two known gaps, deliberately left as TODOs

Both are marked `TODO` at the call site rather than guessed at, per this
project's "don't fabricate an API you haven't verified" rule:

- **`bit_display.cpp`**: `panel_flush_to_hardware()` doesn't yet call
  into `ESP32_Display_Panel` to push pixels to the real ST77916 panel.
  LVGL renders correctly into its own buffer; getting it onto the
  physical screen needs that library's real, installed API inspected
  first (`platformio.ini` pins `esp-arduino-libs/ESP32_Display_Panel @
  1.0.5` and `ESP32_IO_Expander @ 1.1.1`, matching the dossier's
  verified versions — the exact call signatures haven't been).
- **`bit_touch.cpp`**: reads the CST816 over I2C using the register
  layout common to most open-source CST816 drivers, but `TOUCH_RST`
  lives behind the board's IO expander (EXIO1), which also needs
  `ESP32_IO_Expander` wired in for a real reset pulse. Untested against
  this specific board's schematic.

## Building

```bash
cd firmware
cp include/secrets.example.h include/secrets.h   # fill in real Wi-Fi/Hub values; gitignored
pio run
```

Pinned versions (dossier section 7.2 — don't bump without re-verifying):
PlatformIO Core 6.2.0, `espressif32@53.3.11`, Arduino-ESP32 3.1.1, LVGL
8.4.0, `links2004/WebSockets@2.7.3` (resolves from a `^2.4.1`-style
declaration), `ESP32_Display_Panel@1.0.5`, `ESP32_IO_Expander@1.1.1`,
`esp-lib-utils@0.2.3`.

## Bring-up checklist (once hardware is in hand)

Mirrors the dossier's own checklist — don't skip straight to Wi-Fi/Hub
before confirming the board boots and the basics work in isolation:

1. Visual inspection: right board, USB-C cable, connectors intact.
2. Connect over USB only; confirm the port enumerates.
3. `pio run` with no changes.
4. Flash and watch serial logs.
5. Display: color, refresh, rotation, face renders.
6. Touch: coordinates land where you actually tap.
7. Microphone: fresh samples each read, not a repeated stale buffer
   (`bit_audio.cpp`'s per-call reset exists specifically for this).
8. Speaker: audio out via PCM5101 at a safe volume.
9. Wi-Fi + WebSocket: connects to the Hub, gets the initial
   `WAITING_WAKE_WORD` state, survives a Hub restart without a firmware
   reboot.
10. IMU / RTC / TF: stable readings, mount/read.
11. Only after all of the above: connect a battery, and only once its
    model/voltage/polarity/connector are verified against real specs —
    never on a visual guess.

## Layout

```
firmware/
  platformio.ini
  include/
    pins.h             Pin map, verified against Waveshare's official docs
    bit_state.h         Local voice state enum (IDLE + the 3 Hub-driven states)
    bit_wifi.h           Wi-Fi manager (wifiConnected(), not isWiFiConnected())
    bit_websocket.h      Hub WebSocket client
    bit_audio.h          I2S mic capture + speaker playback
    bit_display.h        LVGL face
    bit_touch.h           CST816 touch driver
    lv_conf.h             Trimmed LVGL 8.4 config
    secrets.example.h    Copy to secrets.h (gitignored) and fill in
  src/
    main.cpp              setup()/loop(), wires everything together
    bit_wifi.cpp
    bit_websocket.cpp
    bit_audio.cpp
    bit_display.cpp
    bit_touch.cpp
```
