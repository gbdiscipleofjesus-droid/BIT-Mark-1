"""BIT Hub backend: FastAPI app exposing the /ws/stream WebSocket endpoint
that BIT (ESP32-S3 firmware) connects to.

Voice state machine (see docs/PROTOCOL.md):

    WAITING_WAKE_WORD -> wake.best_prediction(frame) -> [triggered] -> LISTENING
    LISTENING -> VAD -> EndOfUtteranceDetector -> PROCESSING
    PROCESSING -> finish_voice_response() -> ConversationWindow.open() -> LISTENING
    LISTENING (follow-up) -> window expired, no utterance in progress -> WAITING_WAKE_WORD

Runs in the Hub's own Python 3.12 venv (bit_hub/requirements.txt:
FastAPI + uvicorn only). openWakeWord/webrtcvad run inside the separate
bit-voice:mark1 Docker image (Python 3.11) — see bit_hub/Dockerfile.voice
and voice/wake.py, voice/vad.py for why they can't share this venv.

Wake word detection has no trained model yet (bit_hub/backend/models/wake/
is empty — see its README), so entering LISTENING currently requires a
client-sent `{"type": "force_listen"}` control message instead of a real
"Hey BIT" trigger (see handle_control). Swap this for real wake-word
gating once hey_bit.onnx exists and a threshold is calibrated — nothing
else in this state machine needs to change.
"""

from __future__ import annotations

import asyncio
import json
import logging

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from .device import DeviceRegistry, VoiceSession
from .voice.audio import VoiceState, AudioDecodeError, decode_audio_packet
from .voice.vad import VoiceActivityDetector

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("bit_hub.main")

app = FastAPI(title="BIT Hub", version="0.1.0")
registry = DeviceRegistry()

VAD_FRAME_MS = 20


@app.get("/healthz")
async def healthz() -> dict:
    return {"status": "ok", "connected_devices": len(registry)}


async def set_voice_state(session: VoiceSession, state: VoiceState, *, reason: str = "") -> None:
    """Single choke point for every state transition: updates the
    session, logs it, and pushes the `{"type": "state", ...}` message to
    the device. Every transition in this module goes through here so the
    Hub and the firmware's view of the state can never drift apart."""
    session.state = state
    logger.info("device=%s -> %s%s", session.device_id, state.value, f" ({reason})" if reason else "")
    await session.websocket.send_text(json.dumps({"type": "state", "value": state.value}))


async def begin_listening(session: VoiceSession) -> None:
    """Wake word (or a fresh follow-up utterance) triggers active listening."""
    session.eou.reset()
    session.wake.reset()
    session.window.close()
    session.stream.start_recording()
    await set_voice_state(session, VoiceState.LISTENING)


async def begin_processing(session: VoiceSession) -> None:
    """End of utterance detected: hand the captured audio off to Gemini
    Live and stream the spoken response back over the WebSocket as
    binary frames (see docs/PROTOCOL.md — binary frames are
    bidirectional: device->Hub is mic audio, Hub->device is response
    audio during PROCESSING)."""
    utterance = session.stream.stop_recording()
    logger.info(
        "device=%s captured utterance: %d bytes, %.2fs",
        session.device_id, len(utterance), len(utterance) / 2 / 16000,
    )
    await set_voice_state(session, VoiceState.PROCESSING)

    if not session.gemini.available:
        logger.warning(
            "device=%s GEMINI_API_KEY/GEMINI_LIVE_MODEL not set; "
            "skipping response synthesis",
            session.device_id,
        )
    else:
        try:
            chunk_count = 0
            response_bytes = 0
            async for chunk in session.gemini.respond(utterance):
                await session.websocket.send_bytes(chunk.data)
                chunk_count += 1
                response_bytes += len(chunk.data)
            logger.info(
                "device=%s Gemini response: %d chunks, %d bytes",
                session.device_id, chunk_count, response_bytes,
            )
        except Exception:
            # A Gemini/network failure must not take down the voice
            # session — log it and fall through to reopening the
            # follow-up window, same as if there were simply no reply.
            logger.exception("device=%s Gemini Live request failed", session.device_id)

    await finish_voice_response(session)


async def finish_voice_response(session: VoiceSession) -> None:
    """Response delivered (or, today, stubbed): open the follow-up window
    and return to LISTENING so the user doesn't have to repeat the wake
    word for a quick follow-up."""
    session.window.open()
    # The previous utterance is fully done; without this reset,
    # eou.speech_started would stay True from the utterance that just
    # finished PROCESSING, so should_close() would see every future
    # follow-up as "mid-utterance" and the window would never expire.
    session.eou.reset()
    await set_voice_state(session, VoiceState.LISTENING, reason="follow-up window open")


async def return_to_waiting(session: VoiceSession) -> None:
    session.window.close()
    session.stream.reset()
    session.wake.reset()
    session.eou.reset()
    await set_voice_state(session, VoiceState.WAITING_WAKE_WORD, reason="follow-up expired")


async def handle_audio(session: VoiceSession, data: bytes) -> None:
    try:
        frame = decode_audio_packet(data)
    except AudioDecodeError as exc:
        logger.warning("device=%s bad audio packet: %s", session.device_id, exc)
        return

    session.stream.push(frame)

    if session.state == VoiceState.WAITING_WAKE_WORD:
        triggered, label, score = session.wake.triggered(frame.pcm)
        logger.debug(
            "device=%s wake label=%s score=%.3f triggered=%s",
            session.device_id, label, score, triggered,
        )
        if triggered:
            await begin_listening(session)

    elif session.state == VoiceState.LISTENING:
        for vad_frame in VoiceActivityDetector.iter_frames(frame.pcm):
            is_speech = session.vad.is_speech(vad_frame)
            if session.eou.update(is_speech, VAD_FRAME_MS):
                await begin_processing(session)
                break

    # PROCESSING: audio arriving mid-response is dropped for now. A future
    # phase may buffer it for barge-in support.


async def handle_control(session: VoiceSession, text: str) -> None:
    try:
        message = json.loads(text)
    except json.JSONDecodeError:
        logger.warning("device=%s sent non-JSON text frame", session.device_id)
        return

    msg_type = message.get("type")
    if msg_type == "ping":
        await session.websocket.send_text(json.dumps({"type": "pong"}))
    elif msg_type == "force_listen":
        # Manual bypass for wake word detection — there's no trained
        # hey_bit.onnx yet (see voice/models/wake/README.md), so this is
        # how LISTENING gets triggered for now. Only valid while waiting;
        # ignored otherwise so it can't interrupt an in-progress turn.
        # Remove/gate this once real wake word detection is calibrated.
        if session.state == VoiceState.WAITING_WAKE_WORD:
            logger.info("device=%s force_listen (wake word bypass)", session.device_id)
            await begin_listening(session)
        else:
            logger.debug(
                "device=%s force_listen ignored, state=%s",
                session.device_id, session.state.value,
            )
    else:
        logger.debug("device=%s control message: %s", session.device_id, message)


@app.websocket("/ws/stream")
async def ws_stream(websocket: WebSocket, device_id: str) -> None:
    await websocket.accept()

    session = VoiceSession(device_id=device_id, websocket=websocket)
    session.wake.load()  # no-op / logs a warning if hey_bit.onnx isn't present yet
    registry.register(session)

    logger.info("device=%s connected", device_id)
    await set_voice_state(session, VoiceState.WAITING_WAKE_WORD, reason="connected")

    try:
        while True:
            # Bound the wait so a follow-up window's expiry is always
            # re-checked on a real clock, even while audio keeps arriving
            # back-to-back (see voice/conversation.py docstring).
            timeout = session.window.poll_timeout() if session.window.armed else None

            try:
                if timeout is not None and timeout > 0:
                    message = await asyncio.wait_for(websocket.receive(), timeout=timeout)
                else:
                    message = await websocket.receive()
            except asyncio.TimeoutError:
                message = None

            session.touch()

            if message is not None:
                if message["type"] == "websocket.disconnect":
                    break

                data = message.get("bytes")
                if data is not None:
                    await handle_audio(session, data)
                else:
                    text = message.get("text")
                    if text is not None:
                        await handle_control(session, text)

            # Re-check follow-up expiry *after* handling whatever message
            # (if any) just arrived. If that message was itself the start
            # of a new utterance, handle_audio() above already updated
            # eou.speech_started — checking expiry first would judge a
            # brand-new utterance against stale "nothing in progress"
            # state and could bounce straight back to WAITING_WAKE_WORD
            # on the very audio that should have cancelled the timeout.
            if session.window.armed:
                utterance_in_progress = (
                    session.state == VoiceState.LISTENING and session.eou.speech_started
                )
                if session.window.should_close(utterance_in_progress):
                    await return_to_waiting(session)

    except WebSocketDisconnect:
        pass
    finally:
        registry.unregister(device_id)
        logger.info("device=%s disconnected", device_id)
