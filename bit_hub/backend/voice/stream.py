"""Rolling audio buffer with pre-roll for the BIT Hub voice pipeline.

AudioStreamBuffer continuously keeps the last `preroll_ms` of audio even
while WAITING_WAKE_WORD, so that when LISTENING starts we can prepend the
audio spoken right up to (and slightly overlapping) the wake word instead
of starting from a hard cut.
"""

from __future__ import annotations

from collections import deque

from .audio import SAMPLE_RATE, SAMPLE_WIDTH_BYTES, AudioFrame

DEFAULT_PREROLL_MS = 500
DEFAULT_MAX_UTTERANCE_MS = 30_000


class AudioStreamBuffer:
    def __init__(
        self,
        preroll_ms: int = DEFAULT_PREROLL_MS,
        max_utterance_ms: int = DEFAULT_MAX_UTTERANCE_MS,
        sample_rate: int = SAMPLE_RATE,
    ) -> None:
        self.sample_rate = sample_rate
        self._preroll_capacity_bytes = self._ms_to_bytes(preroll_ms)
        self._max_utterance_bytes = self._ms_to_bytes(max_utterance_ms)

        self._preroll: deque[bytes] = deque()
        self._preroll_bytes = 0

        self._recording = False
        self._utterance: deque[bytes] = deque()
        self._utterance_bytes = 0

    def _ms_to_bytes(self, ms: int) -> int:
        samples = self.sample_rate * ms // 1000
        return samples * SAMPLE_WIDTH_BYTES

    @property
    def is_recording(self) -> bool:
        return self._recording

    def push(self, frame: AudioFrame) -> None:
        """Feed one frame of audio into the buffer.

        Always maintained in the pre-roll ring; also appended to the
        active utterance when recording has been started.
        """
        chunk = frame.pcm
        self._preroll.append(chunk)
        self._preroll_bytes += len(chunk)
        while self._preroll_bytes > self._preroll_capacity_bytes and self._preroll:
            dropped = self._preroll.popleft()
            self._preroll_bytes -= len(dropped)

        if self._recording:
            self._utterance.append(chunk)
            self._utterance_bytes += len(chunk)
            while self._utterance_bytes > self._max_utterance_bytes and self._utterance:
                dropped = self._utterance.popleft()
                self._utterance_bytes -= len(dropped)

    def start_recording(self) -> None:
        """Begin capturing an utterance, seeded with the current pre-roll."""
        self._utterance = deque(self._preroll)
        self._utterance_bytes = self._preroll_bytes
        self._recording = True

    def stop_recording(self) -> bytes:
        """Stop capturing and return the full utterance as raw PCM16 bytes."""
        self._recording = False
        data = b"".join(self._utterance)
        self._utterance.clear()
        self._utterance_bytes = 0
        return data

    @property
    def preroll_bytes(self) -> bytes:
        return b"".join(self._preroll)

    @property
    def utterance_duration_seconds(self) -> float:
        return (self._utterance_bytes // SAMPLE_WIDTH_BYTES) / self.sample_rate

    def reset(self) -> None:
        self._preroll.clear()
        self._preroll_bytes = 0
        self._recording = False
        self._utterance.clear()
        self._utterance_bytes = 0
