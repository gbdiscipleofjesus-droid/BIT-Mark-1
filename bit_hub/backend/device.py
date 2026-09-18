"""Tracks BIT devices currently connected to the Hub over /ws/stream."""

from __future__ import annotations

import time
from dataclasses import dataclass, field

from starlette.websockets import WebSocket

from .voice.audio import VoiceState
from .voice.conversation import ConversationWindow
from .voice.end_of_utterance import EndOfUtteranceDetector
from .voice.stream import AudioStreamBuffer
from .voice.vad import VoiceActivityDetector
from .voice.wake import WakeWordDetector


@dataclass
class VoiceSession:
    """Per-connection state for one BIT device's voice pipeline."""

    device_id: str
    websocket: WebSocket
    state: VoiceState = VoiceState.WAITING_WAKE_WORD
    connected_at: float = field(default_factory=time.monotonic)
    last_seen: float = field(default_factory=time.monotonic)

    stream: AudioStreamBuffer = field(default_factory=AudioStreamBuffer)
    vad: VoiceActivityDetector = field(default_factory=VoiceActivityDetector)
    eou: EndOfUtteranceDetector = field(default_factory=EndOfUtteranceDetector)
    window: ConversationWindow = field(default_factory=ConversationWindow)
    wake: WakeWordDetector = field(default_factory=WakeWordDetector)

    def touch(self) -> None:
        self.last_seen = time.monotonic()


class DeviceRegistry:
    """In-memory registry of connected devices. One Hub process, so a
    plain dict is enough — no cross-process coordination needed."""

    def __init__(self) -> None:
        self._sessions: dict[str, VoiceSession] = {}

    def register(self, session: VoiceSession) -> None:
        self._sessions[session.device_id] = session

    def get(self, device_id: str) -> VoiceSession | None:
        return self._sessions.get(device_id)

    def unregister(self, device_id: str) -> None:
        self._sessions.pop(device_id, None)

    def __contains__(self, device_id: str) -> bool:
        return device_id in self._sessions

    def __len__(self) -> int:
        return len(self._sessions)

    def all(self) -> list[VoiceSession]:
        return list(self._sessions.values())
