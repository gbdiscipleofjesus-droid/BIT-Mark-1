"""End-to-end test of the /ws/stream pipeline against a real, live Hub
server, mirroring the Phase 7 acceptance scenario (dossier section 10.1):

  1. connect -> WAITING_WAKE_WORD
  2. "Hey BIT" (forced trigger, no real model in tests) -> LISTENING
  3. speech then >=700ms silence -> PROCESSING -> (stub response) -> LISTENING (follow-up)
  4. a second utterance starts within the follow-up window, no wake word needed
  5. follow-up window expires with no speech -> WAITING_WAKE_WORD
  6. disconnect/reconnect recovers cleanly at WAITING_WAKE_WORD (no stale state)

This runs a real uvicorn server in a background thread and connects with a
real WebSocket client (not Starlette's TestClient ASGI shim) specifically
because step 5 needs to observe the server pushing a state change on its
own, driven purely by a wall-clock timeout with no further client input —
exactly the scenario the follow-up-timeout bug fix targets. Starlette's
TestClient relays frames in lockstep with client actions and never
delivers a message with no corresponding client send, so it can't
exercise this path; a real socket can.

No real openWakeWord model is loaded here (hey_bit.onnx doesn't exist yet
per the dossier) — the wake trigger is forced by monkeypatching the
session's WakeWordDetector directly, exactly like real calibrated
`triggered()` behavior once BIT_WAKE_THRESHOLD is set.
"""

from __future__ import annotations

import json
import socket
import threading
import time

import pytest
import uvicorn
from websockets.sync.client import connect as ws_connect

from bit_hub.backend import main as main_module
from bit_hub.backend.voice.audio import VAD_FRAME_BYTES, VoiceState

RECV_TIMEOUT = 5.0


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture()
def live_server():
    port = _free_port()
    config = uvicorn.Config(main_module.app, host="127.0.0.1", port=port, log_level="warning")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()

    deadline = time.time() + 5.0
    while not server.started and time.time() < deadline:
        time.sleep(0.01)
    assert server.started, "Hub server did not start in time"

    yield f"ws://127.0.0.1:{port}"

    server.should_exit = True
    thread.join(timeout=5.0)


def recv_json(ws) -> dict:
    return json.loads(ws.recv(timeout=RECV_TIMEOUT))


def silence(n_frames: int) -> bytes:
    return b"\x00" * (VAD_FRAME_BYTES * n_frames)


def force_wake_trigger(device_id: str) -> None:
    session = main_module.registry.get(device_id)
    session.wake.triggered = lambda pcm: (True, "hey_bit", 0.99)


def force_speech(device_id: str, speech_frames: int) -> None:
    """Make the session's VAD report `speech_frames` speech decisions
    then silence forever after, regardless of the actual (silent) PCM
    bytes sent — only the VAD *decisions* drive the state machine here,
    not real audio content."""
    session = main_module.registry.get(device_id)
    remaining = [speech_frames]

    def fake_is_speech(_frame: bytes) -> bool:
        if remaining[0] > 0:
            remaining[0] -= 1
            return True
        return False

    session.vad.is_speech = fake_is_speech


def test_full_wake_to_followup_expiry_cycle(live_server):
    device_id = "test-device-1"
    with ws_connect(f"{live_server}/ws/stream?device_id={device_id}") as ws:
        assert recv_json(ws) == {"type": "state", "value": "WAITING_WAKE_WORD"}

        # 2. Wake word triggers.
        force_wake_trigger(device_id)
        ws.send(silence(1))
        assert recv_json(ws) == {"type": "state", "value": "LISTENING"}

        session = main_module.registry.get(device_id)
        assert session.state == VoiceState.LISTENING
        assert session.stream.is_recording is True

        # 3. Speech (5 frames = 100ms, arms min_speech_ms) then enough
        # silence frames to cross the 700ms/20ms = 35 frame threshold.
        force_speech(device_id, speech_frames=5)
        ws.send(silence(45))

        assert recv_json(ws) == {"type": "state", "value": "PROCESSING"}
        # The stub immediately finishes the (not-yet-implemented) Gemini
        # Live response and reopens the follow-up window.
        assert recv_json(ws) == {"type": "state", "value": "LISTENING"}
        assert session.window.is_open is True

        # 4. A second utterance starts inside the follow-up window with
        # no wake word required.
        force_speech(device_id, speech_frames=5)
        ws.send(silence(45))
        assert recv_json(ws) == {"type": "state", "value": "PROCESSING"}
        assert recv_json(ws) == {"type": "state", "value": "LISTENING"}

        # 5. This time nobody speaks again; shrink the window so the test
        # doesn't wait out a real 8s clock, then let it expire on its
        # own — no further send() from the client at all.
        force_speech(device_id, speech_frames=0)
        session.window.duration_seconds = 0.2
        session.window.open()
        assert recv_json(ws) == {"type": "state", "value": "WAITING_WAKE_WORD"}
        assert session.window.is_open is False

    # Session is torn down cleanly on disconnect.
    deadline = time.time() + 2.0
    while main_module.registry.get(device_id) is not None and time.time() < deadline:
        time.sleep(0.01)
    assert main_module.registry.get(device_id) is None


def test_utterance_in_progress_is_never_cut_by_a_short_window(live_server):
    """Direct regression test for the dossier's stated risk: an
    utterance that's still being spoken must not be interrupted just
    because the follow-up window's clock ran out."""
    device_id = "test-device-cut"
    with ws_connect(f"{live_server}/ws/stream?device_id={device_id}") as ws:
        recv_json(ws)  # initial WAITING_WAKE_WORD
        force_wake_trigger(device_id)
        ws.send(silence(1))
        recv_json(ws)  # LISTENING

        session = main_module.registry.get(device_id)
        # Get into a follow-up LISTENING with a window that's already expired.
        force_speech(device_id, speech_frames=5)
        ws.send(silence(45))
        recv_json(ws)  # PROCESSING
        recv_json(ws)  # LISTENING (follow-up)
        session.window.duration_seconds = 0.01
        session.window.open()
        time.sleep(0.05)  # window is now definitely expired on the wall clock

        # New speech starts. Even though the window is expired, this must
        # NOT bounce back to WAITING_WAKE_WORD mid-utterance — it must
        # ride the utterance through to PROCESSING.
        force_speech(device_id, speech_frames=5)
        ws.send(silence(45))
        assert recv_json(ws) == {"type": "state", "value": "PROCESSING"}
        assert recv_json(ws) == {"type": "state", "value": "LISTENING"}


def test_reconnect_starts_fresh_no_stale_state(live_server):
    device_id = "test-device-2"
    with ws_connect(f"{live_server}/ws/stream?device_id={device_id}") as ws:
        assert recv_json(ws)["value"] == "WAITING_WAKE_WORD"
        force_wake_trigger(device_id)
        ws.send(silence(1))
        assert recv_json(ws)["value"] == "LISTENING"

    deadline = time.time() + 2.0
    while main_module.registry.get(device_id) is not None and time.time() < deadline:
        time.sleep(0.01)
    assert main_module.registry.get(device_id) is None

    # Fresh connection with the same device_id must not resume LISTENING.
    with ws_connect(f"{live_server}/ws/stream?device_id={device_id}") as ws:
        assert recv_json(ws) == {"type": "state", "value": "WAITING_WAKE_WORD"}


def test_ping_pong_control_frame(live_server):
    device_id = "test-device-3"
    with ws_connect(f"{live_server}/ws/stream?device_id={device_id}") as ws:
        recv_json(ws)
        ws.send(json.dumps({"type": "ping"}))
        assert recv_json(ws) == {"type": "pong"}
