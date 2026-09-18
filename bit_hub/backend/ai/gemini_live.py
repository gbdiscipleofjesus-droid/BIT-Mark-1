"""Gemini Live client: turns a captured utterance into a streamed audio
response. This is Phase 8 — the first piece of actual conversational AI
in the Hub.

Verified against the installed `google-genai` 2.24.0 SDK by inspecting
its real classes/signatures directly (`google.genai.live`,
`google.genai.types`) — this sandbox can't reach ai.google.dev to
cross-check the current docs (network egress blocked), so treat the
exact turn-boundary/resumption behavior below as "matches the SDK's
real, installed API surface" rather than "matches Google's current
documented guidance." Re-verify end-to-end the first time a real
GEMINI_API_KEY is used.

Design:
- One short-lived Live session per utterance, not one long-running
  session for the whole device connection. The Hub already does its
  own turn-taking (WebRTC VAD + EndOfUtteranceDetector, per the
  project's architecture — Gemini's own automatic activity detection is
  explicitly disabled below so the two don't fight over when a turn
  ends), so there's no need to hold a live audio stream open while BIT
  is in WAITING_WAKE_WORD.
- Session resumption (`session_resumption`) carries conversational
  context across those per-utterance connections, so this still reads
  as one ongoing conversation rather than resetting context every turn.
- The model ID has NO fabricated default. Google's model naming for
  Live API changes over time and this project's own rule is "no
  inventar... nombres de modelo" — GEMINI_LIVE_MODEL must be set
  explicitly from Google's current documentation.
"""

from __future__ import annotations

import logging
import os
from collections.abc import AsyncIterator
from dataclasses import dataclass

from google import genai
from google.genai import types

logger = logging.getLogger("bit_hub.ai.gemini_live")

# Gemini Live's documented input format for raw PCM audio: 16-bit
# little-endian, mono, 16kHz — matches what the Hub already captures
# (bit_hub/backend/voice/audio.py: SAMPLE_RATE). This convention has
# been stable across Live API versions; still worth a final check
# against current docs before relying on it.
INPUT_AUDIO_MIME_TYPE = "audio/pcm;rate=16000"
INPUT_CHUNK_BYTES = 4096

DEFAULT_SYSTEM_INSTRUCTION = (
    "You are BIT, a small voice-controlled companion robot. Keep replies "
    "short and conversational — you're spoken aloud through a robot's "
    "speaker, not read as text. This is a placeholder instruction; "
    "BIT's real personality is designed in Phase 10, not here."
)


class GeminiNotConfiguredError(RuntimeError):
    """Raised by respond() when GEMINI_API_KEY / GEMINI_LIVE_MODEL aren't set."""


@dataclass(frozen=True, slots=True)
class AudioChunk:
    data: bytes
    mime_type: str


class GeminiLiveClient:
    """One instance per BIT device session (see device.py). Holds the
    session-resumption handle so conversational context carries across
    turns within that device's connection lifetime."""

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        system_instruction: str = DEFAULT_SYSTEM_INSTRUCTION,
    ) -> None:
        self.api_key = api_key or os.environ.get("GEMINI_API_KEY")
        self.model = model or os.environ.get("GEMINI_LIVE_MODEL")
        self.system_instruction = system_instruction
        self._resumption_handle: str | None = None

        self._client: genai.Client | None = None
        if self.api_key and self.model:
            self._client = genai.Client(api_key=self.api_key)
        elif self.api_key or self.model:
            logger.warning(
                "GEMINI_API_KEY and GEMINI_LIVE_MODEL must both be set; "
                "only one was provided, so Gemini Live stays disabled."
            )

    @property
    def available(self) -> bool:
        return self._client is not None

    def _connect_config(self) -> dict:
        return {
            "response_modalities": [types.Modality.AUDIO],
            "system_instruction": self.system_instruction,
            # The Hub's own VAD/EndOfUtteranceDetector already decides
            # when an utterance ends (voice/end_of_utterance.py) — let
            # that be the single source of truth for turn boundaries
            # instead of also running Gemini's built-in VAD.
            "realtime_input_config": {
                "automatic_activity_detection": {"disabled": True},
            },
            "session_resumption": {"handle": self._resumption_handle},
        }

    async def respond(self, pcm16_mono_16khz: bytes) -> AsyncIterator[AudioChunk]:
        """Send one full captured utterance and stream back the audio
        response as it arrives. Raises GeminiNotConfiguredError if no
        API key/model is set; propagates any SDK/network error from the
        live session so the caller can decide how to degrade (the
        voice pipeline must not crash because Gemini is unreachable)."""
        if self._client is None:
            raise GeminiNotConfiguredError(
                "GEMINI_API_KEY and GEMINI_LIVE_MODEL must both be set to use Gemini Live"
            )

        async with self._client.aio.live.connect(
            model=self.model, config=self._connect_config()
        ) as session:
            for offset in range(0, len(pcm16_mono_16khz), INPUT_CHUNK_BYTES):
                chunk = pcm16_mono_16khz[offset : offset + INPUT_CHUNK_BYTES]
                await session.send_realtime_input(
                    audio=types.Blob(data=chunk, mime_type=INPUT_AUDIO_MIME_TYPE)
                )
            await session.send_realtime_input(audio_stream_end=True)

            async for message in session.receive():
                update = message.session_resumption_update
                if update is not None and update.resumable and update.new_handle:
                    self._resumption_handle = update.new_handle

                content = message.server_content
                if content is None:
                    continue
                for part in (content.model_turn.parts if content.model_turn else None) or []:
                    if part.inline_data is not None and part.inline_data.data:
                        yield AudioChunk(
                            data=part.inline_data.data,
                            mime_type=part.inline_data.mime_type or INPUT_AUDIO_MIME_TYPE,
                        )
                if content.turn_complete:
                    break
