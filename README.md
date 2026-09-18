# BIT Mark 1

A physical robot/companion for a table demo (target: 15 Oct 2026):
ESP32-S3 handles the face, touch, audio I/O and sensors; **BIT Hub**
(a FastAPI backend on a computer) does the heavy lifting — wake word,
voice activity detection, conversation state, and eventually Gemini
Live, vision, memory and controlled tools.

```
BIT (ESP32-S3)  --Wi-Fi + WebSocket-->  BIT Hub  --API/streaming-->  AI/services
firmware/                                bit_hub/                    Gemini Live (phase 8)
display+touch+mic+audio                  FastAPI /ws/stream          Vision (phase 9)
IMU+RTC+TF                                openWakeWord + WebRTC VAD
```

See `docs/PROTOCOL.md` for the exact wire protocol between the two.

## Status

| # | Phase | Status |
|---|-------|--------|
| 1 | Foundation | Done |
| 2 | Display + face | Software done / hardware untested |
| 3 | Touch + Apps | Software done / hardware untested |
| 4 | Audio | Software done / hardware untested |
| 5 | Wi-Fi + Bluetooth | Software done / hardware untested |
| 6 | BIT Hub / OmniBot | Software done |
| 7 | Wake word + natural listening | **In progress** — see below |
| 8 | Gemini Live | Not started |
| 9-17 | Vision, personality, memory, tools, reactions, offline, release | Not started |

"Software done" never means "hardware verified" — the Waveshare board
hasn't been physically tested in this project yet (see
`firmware/README.md`). Don't let a passing build stand in for that.

### Phase 7 — what's actually done vs. still open

Done: audio transport Hub-side, `AudioStreamBuffer` pre-roll,
WebRTC VAD, end-of-utterance detection, the follow-up conversation
window (including a real bug found and fixed via a live end-to-end
test — see `bit_hub/backend/voice/conversation.py`'s docstring),
reconnection handling, and a full `wake.py` wrapper around openWakeWord.

Still open: **`hey_bit.onnx` doesn't exist** — it's a trained artifact
that has to come from openWakeWord's own training pipeline (see
`bit_hub/backend/models/wake/README.md`), not something this codebase
can generate. Until it's placed and its scores are measured on real
audio, `BIT_WAKE_THRESHOLD` stays unset and the wake word never
auto-triggers — by design, not as a bug.

## Repo layout

```
bit_hub/       FastAPI Hub backend — see bit_hub/README.md
firmware/      ESP32-S3 firmware (PlatformIO) — see firmware/README.md
docs/          PROTOCOL.md: the BIT <-> Hub wire protocol
reference_omnibot/   Notes on the (not-cloned) OmniBot reference — see its README
```

## Quickstart

```bash
# Hub backend — fast local dev/test, no wake word (see bit_hub/README.md)
cd bit_hub
python3 -m venv ../.venv-bit-hub && ../.venv-bit-hub/bin/pip install -r requirements.txt
../.venv-bit-hub/bin/python -m compileall -q backend

# Full test suite (needs webrtcvad + openwakeword — see bit_hub/README.md)
python3 -m venv ../.venv-bit-voice
../.venv-bit-voice/bin/pip install "setuptools>=69,<81" wheel
../.venv-bit-voice/bin/pip install -r requirements.txt -r requirements-voice.txt
../.venv-bit-voice/bin/python -m pytest backend/tests -q

# Firmware (needs a PlatformIO-registry-reachable environment)
cd firmware && pio run
```

## Ground rules carried over from the project's own dossier

- Never claim a physical function works because it compiled — only
  because it ran on the real Waveshare board.
- Don't change pins, pinned dependency versions, or the firmware/Hub
  split without a demonstrated reason.
- Gemini/API keys live in the Hub's environment only — never in
  firmware, never committed to Git.
- Wake word and any heavy AI inference live in the Hub, never the ESP32.
