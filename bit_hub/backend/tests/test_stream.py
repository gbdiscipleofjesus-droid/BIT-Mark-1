from bit_hub.backend.voice.audio import AudioFrame
from bit_hub.backend.voice.stream import AudioStreamBuffer


def frame(n_bytes: int, fill: int = 0) -> AudioFrame:
    return AudioFrame(pcm=bytes([fill]) * n_bytes)


def test_preroll_capped_to_capacity():
    # 500ms @16kHz*2bytes = 16000 bytes capacity
    buf = AudioStreamBuffer(preroll_ms=500)
    for _ in range(20):
        buf.push(frame(2000))
    assert len(buf.preroll_bytes) <= buf._preroll_capacity_bytes


def test_start_recording_seeds_from_preroll():
    buf = AudioStreamBuffer(preroll_ms=500)
    buf.push(frame(100, fill=1))
    buf.push(frame(100, fill=2))
    buf.start_recording()
    buf.push(frame(100, fill=3))
    data = buf.stop_recording()
    # Pre-roll content (fill=1,2) should be included ahead of the new frame (fill=3)
    assert data == bytes([1]) * 100 + bytes([2]) * 100 + bytes([3]) * 100


def test_stop_recording_clears_utterance_but_not_preroll():
    buf = AudioStreamBuffer(preroll_ms=500)
    buf.start_recording()
    buf.push(frame(50))
    buf.stop_recording()
    assert buf.is_recording is False
    assert buf.stop_recording() == b""


def test_utterance_capped_to_max_duration():
    buf = AudioStreamBuffer(preroll_ms=100, max_utterance_ms=200)
    buf.start_recording()
    for _ in range(50):
        buf.push(frame(2000))
    data = buf.stop_recording()
    assert len(data) <= buf._max_utterance_bytes


def test_reset_clears_everything():
    buf = AudioStreamBuffer()
    buf.start_recording()
    buf.push(frame(100))
    buf.reset()
    assert buf.is_recording is False
    assert buf.preroll_bytes == b""
