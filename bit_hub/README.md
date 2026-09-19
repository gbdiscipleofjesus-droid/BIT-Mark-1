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
applied covers both, mirroring what the Docker image installs — **must
be Python 3.11**, not whatever `python3` defaults to. `openwakeword`
depends on `tflite-runtime`, which has no wheel at all for Python
>=3.12 (confirmed: it fails the same way on 3.14 as on 3.12). Check
what's available first:

```bash
python3.11 --version || sudo apt-get update && sudo apt-get install -y python3.11 python3.11-venv
python3.11 -m venv .venv-bit-voice
.venv-bit-voice/bin/pip install "setuptools>=69,<81" wheel
.venv-bit-voice/bin/pip install -r requirements.txt -r requirements-voice.txt
.venv-bit-voice/bin/python -m pytest backend/tests -q
```

If installing Python 3.11 isn't an option, use `bit-voice:mark1`
(Docker, above) instead — same effect, guaranteed Python 3.11 inside
the container regardless of the host's default.

## Phase 8 — Gemini Live, and testing without a wake word

The wake word has no trained model yet, so `{"type": "force_listen"}` is
the temporary stand-in for triggering LISTENING (see `docs/PROTOCOL.md`
and `backend/main.py`'s module docstring) — swap it for real wake-word
gating once `hey_bit.onnx` exists and a threshold is calibrated; nothing
else needs to change.

Set `GEMINI_API_KEY` and `GEMINI_LIVE_MODEL` (copy `.env.example` to
`.env` — gitignored) before PROCESSING will actually get a spoken
response; without them it just logs a warning and falls through to the
follow-up window, same as before Phase 8 existed. `GEMINI_LIVE_MODEL`
has no built-in default on purpose — get the current Live API model ID
from Google's docs, not from stale code.

Quick manual smoke test against a running Hub, no firmware/hardware
needed (needs `websockets`, already a transitive dep). The real
`webrtcvad` is doing the listening here — silence never arms
`min_speech_ms`, so you need actual speech, not zero bytes: record a
few seconds of yourself talking as 16-bit PCM, mono, 16 kHz raw (e.g.
`ffmpeg -i in.wav -f s16le -ar 16000 -ac 1 speech.raw`), then:

```python
import asyncio, json
from pathlib import Path
from websockets.asyncio.client import connect

async def main():
    pcm = Path("speech.raw").read_bytes()
    async with connect("ws://localhost:8000/ws/stream?device_id=test") as ws:
        print(await ws.recv())                          # WAITING_WAKE_WORD
        await ws.send(json.dumps({"type": "force_listen"}))
        print(await ws.recv())                          # LISTENING
        for i in range(0, len(pcm), 640):                # 20ms chunks
            await ws.send(pcm[i:i + 640])
        await ws.send(b"\x00\x00" * 320 * 40)             # ~800ms silence to trip end-of-utterance
        while True:
            print(await ws.recv())                       # PROCESSING, audio chunks (if Gemini configured), LISTENING

asyncio.run(main())
```

## Layout

```
bit_hub/
  backend/
    main.py            FastAPI app, /ws/stream, voice state machine
    device.py           DeviceRegistry + per-connection VoiceSession
    ai/
      gemini_live.py     Phase 8: per-utterance Gemini Live client
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
  requirements.txt       Hub venv (3.12): fastapi, uvicorn, webrtcvad, numpy, google-genai
  requirements-voice.txt Extra layer for Dockerfile.voice: openwakeword
```
