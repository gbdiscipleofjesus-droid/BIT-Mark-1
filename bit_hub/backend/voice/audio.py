"""Core audio types shared across the BIT Hub voice pipeline.

Audio contract with the firmware (see docs/PROTOCOL.md): binary WebSocket
frames carry raw PCM16 little-endian, mono, 16 kHz samples with no extra
framing. Text frames carry JSON control messages.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from enum import Enum

SAMPLE_RATE = 16_000
SAMPLE_WIDTH_BYTES = 2
CHANNELS = 1

# openWakeWord expects frames that are multiples of 80 ms (1280 samples).
OWW_FRAME_MS = 80
OWW_FRAME_SAMPLES = SAMPLE_RATE * OWW_FRAME_MS // 1000  # 1280
OWW_FRAME_BYTES = OWW_FRAME_SAMPLES * SAMPLE_WIDTH_BYTES  # 2560

# webrtcvad only accepts 10/20/30 ms frames. BIT Hub standardizes on 20 ms.
VAD_FRAME_MS = 20
VAD_FRAME_SAMPLES = SAMPLE_RATE * VAD_FRAME_MS // 1000  # 320
VAD_FRAME_BYTES = VAD_FRAME_SAMPLES * SAMPLE_WIDTH_BYTES  # 640


class VoiceState(str, Enum):
    """Mirrors the firmware states reported over /ws/stream."""

    WAITING_WAKE_WORD = "WAITING_WAKE_WORD"
    LISTENING = "LISTENING"
    PROCESSING = "PROCESSING"


class AudioDecodeError(ValueError):
    """Raised when an inbound binary WebSocket frame is not valid PCM16."""


@dataclass(frozen=True, slots=True)
class AudioFrame:
    """A chunk of PCM16 mono audio received from a BIT device."""

    pcm: bytes
    sample_rate: int = SAMPLE_RATE
    received_at: float = 0.0

    @property
    def num_samples(self) -> int:
        return len(self.pcm) // SAMPLE_WIDTH_BYTES

    @property
    def duration_seconds(self) -> float:
        return self.num_samples / self.sample_rate


def decode_audio_packet(data: bytes) -> AudioFrame:
    """Validate and wrap a raw binary WebSocket payload as an AudioFrame.

    Raises AudioDecodeError if the payload is not a whole number of
    16-bit samples (an odd byte count can never be valid PCM16).
    """
    if not isinstance(data, (bytes, bytearray)):
        raise AudioDecodeError(f"expected bytes, got {type(data).__name__}")
    if len(data) == 0:
        raise AudioDecodeError("empty audio packet")
    if len(data) % SAMPLE_WIDTH_BYTES != 0:
        raise AudioDecodeError(
            f"packet length {len(data)} is not a multiple of "
            f"{SAMPLE_WIDTH_BYTES} bytes (not valid PCM16)"
        )
    return AudioFrame(pcm=bytes(data), sample_rate=SAMPLE_RATE, received_at=time.monotonic())
