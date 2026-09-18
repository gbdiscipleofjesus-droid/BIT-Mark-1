import pytest

from bit_hub.backend.voice.audio import AudioDecodeError, decode_audio_packet


def test_decode_valid_packet():
    pcm = (b"\x00\x01") * 100
    frame = decode_audio_packet(pcm)
    assert frame.num_samples == 100
    assert frame.sample_rate == 16_000
    assert frame.duration_seconds == pytest.approx(100 / 16_000)


def test_decode_rejects_odd_length():
    with pytest.raises(AudioDecodeError):
        decode_audio_packet(b"\x00\x01\x02")


def test_decode_rejects_empty():
    with pytest.raises(AudioDecodeError):
        decode_audio_packet(b"")


def test_decode_rejects_non_bytes():
    with pytest.raises(AudioDecodeError):
        decode_audio_packet("not bytes")
