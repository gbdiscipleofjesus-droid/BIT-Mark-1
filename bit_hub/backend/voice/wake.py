"""openWakeWord-based wake word detection ("Hey BIT").

Runs inside the bit-voice:mark1 Docker image (Python 3.11), never in the
Hub's own Python 3.12 venv — openWakeWord depends on tflite-runtime, which
has no compatible wheel for Linux cp312. See bit_hub/Dockerfile.voice.

IMPORTANT: hey_bit.onnx is a trained artifact, not something this
codebase can generate. It must be produced by openWakeWord's training
pipeline (see https://github.com/dscripka/openWakeWord) and placed at
DEFAULT_MODEL_PATH before wake detection can run at all. Until then,
`WakeWordDetector.load()` returns False and the caller stays in
WAITING_WAKE_WORD forever (fails safe, never guesses).

Likewise the activation threshold (BIT_WAKE_THRESHOLD) is deliberately
*not* hardcoded to a default like 0.5: per the openWakeWord README, the
right value depends on measuring false-positive/false-negative rates
against real recordings of "Hey BIT" plus room noise. Until that
env var is set, `triggered()` always returns False — scores are still
computed and logged so the calibration data can be collected.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

import numpy as np

logger = logging.getLogger("bit_hub.voice.wake")

DEFAULT_MODEL_PATH = Path(__file__).resolve().parent.parent / "models" / "wake" / "hey_bit.onnx"
THRESHOLD_ENV_VAR = "BIT_WAKE_THRESHOLD"


def _read_threshold_from_env() -> float | None:
    raw = os.environ.get(THRESHOLD_ENV_VAR)
    if raw is None or raw.strip() == "":
        return None
    try:
        value = float(raw)
    except ValueError:
        logger.warning("%s=%r is not a valid float; ignoring", THRESHOLD_ENV_VAR, raw)
        return None
    if not 0.0 < value <= 1.0:
        logger.warning("%s=%s is outside (0, 1]; ignoring", THRESHOLD_ENV_VAR, value)
        return None
    return value


class WakeWordDetector:
    def __init__(
        self,
        model_path: Path | str = DEFAULT_MODEL_PATH,
        threshold: float | None = None,
    ) -> None:
        self.model_path = Path(model_path)
        # Explicit constructor arg wins; otherwise fall back to the env var
        # so ops can calibrate without a code change/redeploy.
        self.threshold = threshold if threshold is not None else _read_threshold_from_env()
        self._model = None
        self._loaded = False

    @property
    def loaded(self) -> bool:
        return self._loaded

    def load(self) -> bool:
        """Load the ONNX model if present. Never raises; returns False on
        any failure (missing file, corrupt model, import error) so the
        pipeline can stay in WAITING_WAKE_WORD instead of crashing."""
        if not self.model_path.is_file():
            logger.warning("wake model not found at %s; wake word disabled", self.model_path)
            self._loaded = False
            return False

        try:
            from openwakeword.model import Model
        except ImportError:
            logger.exception("openwakeword is not installed in this environment")
            self._loaded = False
            return False

        try:
            self._model = Model(
                wakeword_models=[str(self.model_path)],
                inference_framework="onnx",
            )
        except Exception:
            logger.exception("failed to load wake model %s", self.model_path)
            self._loaded = False
            return False

        self._loaded = True
        if self.threshold is None:
            logger.warning(
                "wake model loaded but %s is not set; scores will be logged "
                "but the wake word will never auto-trigger until a threshold "
                "is chosen from measured data",
                THRESHOLD_ENV_VAR,
            )
        return True

    def reset(self) -> None:
        """Clear the model's internal prediction buffer between sessions
        so leftover audio state from a previous utterance can't bleed
        into the next wake attempt."""
        if self._model is not None and hasattr(self._model, "reset"):
            self._model.reset()

    def feed(self, pcm: bytes) -> dict[str, float]:
        """Run one chunk of PCM16 mono audio through the model.

        Returns the raw {label: score} dict from openWakeWord, whatever
        the actual label key turns out to be for this model file.
        """
        if not self._loaded or self._model is None:
            return {}
        samples = np.frombuffer(pcm, dtype=np.int16)
        return dict(self._model.predict(samples))

    def best_prediction(self, pcm: bytes) -> tuple[str | None, float]:
        """(label, score) of the highest-scoring model output, with no
        threshold applied — purely descriptive, for logging/calibration."""
        scores = self.feed(pcm)
        if not scores:
            return None, 0.0
        label = max(scores, key=scores.get)
        return label, scores[label]

    def triggered(self, pcm: bytes) -> tuple[bool, str | None, float]:
        """(did_trigger, label, score). did_trigger is only ever True when
        a calibrated threshold has been configured via BIT_WAKE_THRESHOLD
        (or passed explicitly) and the score meets it."""
        label, score = self.best_prediction(pcm)
        if self.threshold is None or label is None:
            return False, label, score
        return score >= self.threshold, label, score
