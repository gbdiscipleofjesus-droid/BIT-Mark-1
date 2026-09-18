# BIT <-> Hub WebSocket protocol

Endpoint: `ws://<hub-host>:8000/ws/stream?device_id=<id>`

`device_id` is a required query parameter — a stable identifier for the
physical unit (e.g. derived from the ESP32's MAC address). The Hub keys
its `DeviceRegistry` by this value.

## Frame types

The connection carries two kinds of WebSocket frames, distinguished by
their native binary/text framing (no extra header/envelope byte):

### Binary frames — audio

Raw **PCM16 little-endian, mono, 16 kHz** samples. No header, no
metadata — just sample bytes, sent in whatever chunk size the firmware's
I2S read loop produces (the Hub does not assume a fixed packet size; it
regroups into 20 ms VAD frames and 80 ms wake-word frames internally,
dropping any partial trailing frame within a given packet).

Firmware sends audio continuously while connected; the Hub decides what
to do with it based on the current voice state (see below) — it is the
Hub's job to ignore/act on frames appropriately, not the firmware's.

### Text frames — control, JSON

```jsonc
// Hub -> BIT: voice state changed
{"type": "state", "value": "WAITING_WAKE_WORD" | "LISTENING" | "PROCESSING"}

// BIT -> Hub: keepalive
{"type": "ping"}
// Hub -> BIT
{"type": "pong"}
```

The Hub pushes a `state` message immediately on connect and again on
every transition. Firmware uses it to drive its own local state (button
LEDs, face expression, mic gating) — the Hub is the source of truth for
voice state, not the firmware.

## Voice state machine (Hub-side)

```
WAITING_WAKE_WORD --[wake word triggered]--> LISTENING
LISTENING --[VAD: ~700ms silence after speech]--> PROCESSING
PROCESSING --[response ready]--> LISTENING (follow-up window open, default 8s)
LISTENING (follow-up, no new speech) --[window expires]--> WAITING_WAKE_WORD
```

An utterance already in progress (VAD has seen speech, no end-of-utterance
yet) is never cut off by the follow-up window expiring — the window only
closes a *quiet* follow-up. See `bit_hub/backend/voice/conversation.py`.

## Reconnection

The firmware is expected to retry the WebSocket connection with backoff
if it drops, and the Hub tears down that device's `VoiceSession` on
disconnect (`DeviceRegistry.unregister`) — a fresh connection starts a
fresh session in `WAITING_WAKE_WORD`, no state carries over.
