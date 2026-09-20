import pytest
from google.genai import types

from bit_hub.backend.ai.gemini_live import (
    INPUT_CHUNK_BYTES,
    GeminiLiveClient,
    GeminiNotConfiguredError,
)


class FakeSession:
    def __init__(self, messages):
        self._messages = messages
        self.sent_audio: list[bytes] = []
        self.sent_flags: list[str] = []

    async def send_realtime_input(self, **kwargs):
        if kwargs.get("audio") is not None:
            self.sent_audio.append(kwargs["audio"].data)
        if kwargs.get("audio_stream_end"):
            self.sent_flags.append("audio_stream_end")
        if kwargs.get("activity_start") is not None:
            self.sent_flags.append("activity_start")
        if kwargs.get("activity_end") is not None:
            self.sent_flags.append("activity_end")

    async def receive(self):
        for message in self._messages:
            yield message


class _ConnectCM:
    def __init__(self, session, live):
        self._session = session
        self._live = live

    async def __aenter__(self):
        return self._session

    async def __aexit__(self, *exc):
        return False


class FakeLive:
    def __init__(self, session):
        self._session = session
        self.captured_model = None
        self.captured_config = None

    def connect(self, *, model, config):
        self.captured_model = model
        self.captured_config = config
        return _ConnectCM(self._session, self)


class FakeAio:
    def __init__(self, session):
        self.live = FakeLive(session)


class FakeGenaiClient:
    def __init__(self, session):
        self.aio = FakeAio(session)


def audio_response(data: bytes, mime_type: str, turn_complete: bool = True):
    return types.LiveServerMessage(
        server_content=types.LiveServerContent(
            model_turn=types.Content(
                parts=[types.Part(inline_data=types.Blob(data=data, mime_type=mime_type))]
            ),
            turn_complete=turn_complete,
        )
    )


def resumption_update(handle: str, resumable: bool = True):
    return types.LiveServerMessage(
        session_resumption_update=types.LiveServerSessionResumptionUpdate(
            new_handle=handle, resumable=resumable
        )
    )


def test_unavailable_without_api_key_and_model():
    assert GeminiLiveClient(api_key=None, model=None).available is False
    assert GeminiLiveClient(api_key="key-only", model=None).available is False
    assert GeminiLiveClient(api_key=None, model="model-only").available is False


def test_available_with_both_set():
    assert GeminiLiveClient(api_key="k", model="m").available is True


@pytest.mark.asyncio
async def test_respond_raises_when_not_configured():
    client = GeminiLiveClient(api_key=None, model=None)
    with pytest.raises(GeminiNotConfiguredError):
        async for _ in client.respond(b"\x00\x00"):
            pass


@pytest.mark.asyncio
async def test_respond_streams_audio_and_captures_resumption_handle():
    fake_session = FakeSession(
        [
            resumption_update("handle-1"),
            audio_response(b"hello-audio", "audio/pcm;rate=24000"),
        ]
    )
    client = GeminiLiveClient(api_key="k", model="m")
    client._client = FakeGenaiClient(fake_session)  # bypass real network client construction

    chunks = [c async for c in client.respond(b"\x01\x02" * 100)]

    assert len(chunks) == 1
    assert chunks[0].data == b"hello-audio"
    assert chunks[0].mime_type == "audio/pcm;rate=24000"
    assert client._resumption_handle == "handle-1"
    assert b"".join(fake_session.sent_audio) == b"\x01\x02" * 100
    # AutomaticActivityDetection.disabled requires explicit activity
    # signals — audio_stream_end alone does not tell Gemini a turn
    # happened at all, which is exactly the bug this regression-tests.
    assert fake_session.sent_flags == ["activity_start", "activity_end"]


@pytest.mark.asyncio
async def test_respond_chunks_large_input():
    fake_session = FakeSession([audio_response(b"ok", "audio/pcm;rate=24000")])
    client = GeminiLiveClient(api_key="k", model="m")
    client._client = FakeGenaiClient(fake_session)

    pcm = b"\x00\x01" * (INPUT_CHUNK_BYTES * 3)  # spans multiple chunks
    async for _ in client.respond(pcm):
        pass

    assert len(fake_session.sent_audio) > 1
    assert all(len(c) <= INPUT_CHUNK_BYTES for c in fake_session.sent_audio)
    assert b"".join(fake_session.sent_audio) == pcm


@pytest.mark.asyncio
async def test_connect_config_disables_automatic_activity_detection():
    fake_session = FakeSession([audio_response(b"ok", "audio/pcm;rate=24000")])
    client = GeminiLiveClient(api_key="k", model="gemini-live-test")
    fake_genai_client = FakeGenaiClient(fake_session)
    client._client = fake_genai_client

    async for _ in client.respond(b"\x00\x00"):
        pass

    config = fake_genai_client.aio.live.captured_config
    assert fake_genai_client.aio.live.captured_model == "gemini-live-test"
    assert config["realtime_input_config"]["automatic_activity_detection"]["disabled"] is True
    assert types.Modality.AUDIO in config["response_modalities"]


@pytest.mark.asyncio
async def test_resumption_handle_reused_on_next_call():
    client = GeminiLiveClient(api_key="k", model="m")

    session1 = FakeSession([resumption_update("first-handle"), audio_response(b"a", "audio/pcm;rate=24000")])
    fake_client_1 = FakeGenaiClient(session1)
    client._client = fake_client_1
    async for _ in client.respond(b"\x00\x00"):
        pass
    assert client._resumption_handle == "first-handle"

    session2 = FakeSession([audio_response(b"b", "audio/pcm;rate=24000")])
    fake_client_2 = FakeGenaiClient(session2)
    client._client = fake_client_2
    async for _ in client.respond(b"\x00\x00"):
        pass

    assert fake_client_2.aio.live.captured_config["session_resumption"]["handle"] == "first-handle"


@pytest.mark.asyncio
async def test_stops_after_turn_complete_even_with_more_messages_queued():
    fake_session = FakeSession(
        [
            audio_response(b"first", "audio/pcm;rate=24000", turn_complete=True),
            audio_response(b"should-not-be-yielded", "audio/pcm;rate=24000"),
        ]
    )
    client = GeminiLiveClient(api_key="k", model="m")
    client._client = FakeGenaiClient(fake_session)

    chunks = [c async for c in client.respond(b"\x00\x00")]

    assert [c.data for c in chunks] == [b"first"]
