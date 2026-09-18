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
