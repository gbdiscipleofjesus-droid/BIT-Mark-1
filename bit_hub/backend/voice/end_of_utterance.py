"""Detects the natural end of a spoken utterance from VAD decisions.

An utterance ends when the detector has seen at least `min_speech_ms` of
speech, followed by `silence_ms` of continuous non-speech.
"""

from __future__ import annotations

DEFAULT_SILENCE_MS = 700
DEFAULT_MIN_SPEECH_MS = 100


class EndOfUtteranceDetector:
    def __init__(
        self,
        silence_ms: int = DEFAULT_SILENCE_MS,
        min_speech_ms: int = DEFAULT_MIN_SPEECH_MS,
    ) -> None:
        self.silence_ms = silence_ms
        self.min_speech_ms = min_speech_ms
        self._speech_started = False
        self._silence_run_ms = 0
        self._speech_run_ms = 0

    @property
    def speech_started(self) -> bool:
        return self._speech_started

    def update(self, is_speech: bool, frame_ms: int) -> bool:
        """Feed one VAD decision for a frame of the given duration.

        Returns True exactly once, the frame end-of-utterance is detected.
        """
        if is_speech:
            self._speech_run_ms += frame_ms
            self._silence_run_ms = 0
            if not self._speech_started and self._speech_run_ms >= self.min_speech_ms:
                self._speech_started = True
            return False

        if not self._speech_started:
            # Silence before any real speech was seen — not an utterance end.
            return False

        self._silence_run_ms += frame_ms
        return self._silence_run_ms >= self.silence_ms

    def reset(self) -> None:
        self._speech_started = False
        self._silence_run_ms = 0
        self._speech_run_ms = 0
