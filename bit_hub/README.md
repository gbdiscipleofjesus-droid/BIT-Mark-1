# BIT Hub

FastAPI backend that BIT (the ESP32-S3 firmware) streams audio to over a
WebSocket. See `../docs/PROTOCOL.md` for the wire protocol and
`backend/main.py` for the voice state machine.

## Two ways to run it

**`.venv-bit-hub` (Python 3.12) — fast local dev/test.** FastAPI,
uvicorn and webrtcvad all install cleanly here. openWakeWord does not
(it needs `tflite-runtime`, which has no cp312 wheel on Linux), so the
Hub still runs but the wake word detector stays disabled — useful for
iterating on VAD/state-machine/follow-up logic without a model file.

```bash
cd bit_hub
python3.12 -m venv ../.venv-bit-hub   # any recent 3.x works for tests; 3.12 for the real deploy target
../.venv-bit-hub/bin/pip install -r requirements.txt
../.venv-bit-hub/bin/python -m compileall -q backend
../.venv-bit-voice/bin/python -m pytest backend/tests -q   # see below for this venv
```

**`bit-voice:mark1` (Docker, Python 3.11) — the real thing.** Adds
openWakeWord on top, so the wake word actually works. Build and run from
the repo root:

```bash
docker build -f bit_hub/Dockerfile.voice -t bit-voice:mark1 .
docker run --rm -p 8000:8000 -e BIT_WAKE_THRESHOLD=0.5 bit-voice:mark1
```

`BIT_WAKE_THRESHOLD` is unset by default and the wake word never
auto-triggers until it's set from measured data — see
`backend/models/wake/README.md`.

## Running the full test suite locally (without Docker)

The unit tests exercise `vad.py` and `wake.py`, which need `webrtcvad`
and `openwakeword` importable. A dedicated venv with the setuptools pin
applied covers both, mirroring what the Docker image installs:

```bash
python3 -m venv .venv-bit-voice
.venv-bit-voice/bin/pip install "setuptools>=69,<81" wheel
.venv-bit-voice/bin/pip install -r requirements.txt -r requirements-voice.txt
.venv-bit-voice/bin/python -m pytest backend/tests -q
```

## Layout

```
bit_hub/
  backend/
    main.py            FastAPI app, /ws/stream, voice state machine
    device.py           DeviceRegistry + per-connection VoiceSession
    voice/
      audio.py          AudioFrame, decode_audio_packet, PCM/frame constants
      stream.py         AudioStreamBuffer (pre-roll + utterance capture)
      vad.py             WebRTC VAD wrapper (20ms frames)
      end_of_utterance.py  Silence-based utterance-end detection
      conversation.py   Follow-up window (see docstring for the timeout fix)
      wake.py            openWakeWord wrapper, env-configurable threshold
    models/wake/        hey_bit.onnx goes here (not committed)
    tests/              pytest unit tests for everything above
  Dockerfile.voice
  requirements.txt       Hub venv (3.12): fastapi, uvicorn, webrtcvad, numpy
  requirements-voice.txt Extra layer for Dockerfile.voice: openwakeword
```
