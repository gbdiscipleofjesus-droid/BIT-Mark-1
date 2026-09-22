# Wake word model

This directory is where the trained "Hey BIT" model belongs:

```
bit_hub/backend/models/wake/hey_bit.onnx
```

It is **not** committed to the repository — it's a trained binary
artifact, not source code, and this codebase has no way to fabricate one.

## Producing it

Train (or fine-tune) a custom wake word model with openWakeWord's own
training pipeline: https://github.com/dscripka/openWakeWord

Export it in ONNX format (`voice/wake.py` loads models with
`inference_framework="onnx"`). Place the resulting file at the path
above.

## After placing the model

1. Start the Hub with the voice image (`bit-voice:mark1`, see
   `bit_hub/Dockerfile.voice`) so `openwakeword` is actually importable —
   `WakeWordDetector.load()` returns `False` in the plain `.venv-bit-hub`
   dev venv, by design.
2. Say "Hey BIT" and talk over background noise while watching the
   `wake label=... score=...` debug logs from `bit_hub/backend/main.py`.
   Do **not** assume the label is `hey_bit` — it's derived from whatever
   filename/class mapping the trained model actually uses.
3. Pick `BIT_WAKE_THRESHOLD` from the false-positive/false-negative
   tradeoff you observe in those logs, per openWakeWord's own
   recommendation. There is no default — the detector never triggers
   until this env var is set (see `voice/wake.py`).

## Note: microWakeWord is a different, incompatible artifact

As of 2026-09-22 a "Hey BIT" model is also being trained on
microWakeWord's own official training page (hardware for the real
board arrives 2026-09-25; demo target 2026-10-15). Don't confuse the
two:

- **openWakeWord** (this directory): a `.onnx` model scored **Hub-side**
  in Python, against continuously streamed raw audio. This is what
  `voice/wake.py` and the state machine in `backend/main.py` implement
  today.
- **microWakeWord**: a `.tflite` model meant to run **on the ESP32
  itself** via TFLite Micro, with the firmware only notifying the Hub
  once "Hey BIT" is heard locally — a genuinely different split of
  responsibility, not a drop-in file swap.

The project's own ground rule (top-level `README.md`) is "wake word and
any heavy AI inference live in the Hub, never the ESP32," so adopting a
microWakeWord model as the real trigger would mean deliberately
revisiting that rule — firmware would need on-device feature
extraction + TFLite Micro inference, and the Hub/firmware protocol
would need a new message (something like `{"type": "wake_detected"}`)
in place of continuous raw-audio wake scoring. That's real engineering
work, not something to speculatively half-build before a trained
`.tflite` file and real hardware exist to test it against.

**Until a microWakeWord model is actually trained and there's hardware
to validate it on**, this directory and `voice/wake.py`'s openWakeWord
path remain the live plan; `force_listen` (see `docs/PROTOCOL.md`)
keeps standing in for both. Revisit this decision once a trained
`.tflite` file exists — don't guess the wiring before then.
