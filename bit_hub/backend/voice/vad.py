"""WebRTC VAD wrapper for the BIT Hub voice pipeline.

webrtcvad only accepts 10/20/30 ms frames at 8/16/32/48 kHz. BIT Hub
standardizes on 20 ms frames (320 samples / 640 bytes) at 16 kHz mono.

Runs inside the bit-voice:mark1 Docker image (Python 3.11). Requires
`setuptools>=69,<81` at install time — newer setuptools breaks webrtcvad's
legacy build backend. Do not bump this pin without re-verifying the build.
"""

from __future__ import annotations

from collections.abc import Iterator

import webrtcvad

from .audio import SAMPLE_RATE, VAD_FRAME_BYTES

DEFAULT_AGGRESSIVENESS = 2


class VadError(ValueError):
    """Raised when audio handed to the VAD isn't a valid 20 ms frame."""


class VoiceActivityDetector:
    def __init__(self, aggressiveness: int = DEFAULT_AGGRESSIVENESS) -> None:
        if not 0 <= aggressiveness <= 3:
            raise ValueError("aggressiveness must be between 0 and 3")
        self._vad = webrtcvad.Vad(aggressiveness)

    def is_speech(self, frame: bytes) -> bool:
        if len(frame) != VAD_FRAME_BYTES:
            raise VadError(
                f"VAD frame must be exactly {VAD_FRAME_BYTES} bytes "
                f"(20 ms @ {SAMPLE_RATE} Hz mono PCM16), got {len(frame)}"
            )
        return self._vad.is_speech(frame, SAMPLE_RATE)

    @staticmethod
    def iter_frames(pcm: bytes) -> Iterator[bytes]:
        """Split a PCM buffer into fixed 20 ms frames.

        Any trailing partial frame (shorter than VAD_FRAME_BYTES) is
        dropped rather than padded, since it does not represent a real
        20 ms window yet.
        """
        usable = len(pcm) - (len(pcm) % VAD_FRAME_BYTES)
        for offset in range(0, usable, VAD_FRAME_BYTES):
            yield pcm[offset : offset + VAD_FRAME_BYTES]
