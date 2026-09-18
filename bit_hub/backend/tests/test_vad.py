import pytest

from bit_hub.backend.voice.audio import VAD_FRAME_BYTES
from bit_hub.backend.voice.vad import VadError, VoiceActivityDetector


def test_rejects_wrong_frame_size():
    vad = VoiceActivityDetector()
    with pytest.raises(VadError):
        vad.is_speech(b"\x00" * (VAD_FRAME_BYTES - 2))


def test_silence_is_not_speech():
    vad = VoiceActivityDetector()
    silence = b"\x00" * VAD_FRAME_BYTES
    assert vad.is_speech(silence) is False


def test_invalid_aggressiveness_rejected():
    with pytest.raises(ValueError):
        VoiceActivityDetector(aggressiveness=4)


def test_iter_frames_splits_and_drops_partial_tail():
    pcm = b"\x00" * (VAD_FRAME_BYTES * 3 + 10)
    frames = list(VoiceActivityDetector.iter_frames(pcm))
    assert len(frames) == 3
    assert all(len(f) == VAD_FRAME_BYTES for f in frames)


def test_iter_frames_empty_for_short_input():
    pcm = b"\x00" * (VAD_FRAME_BYTES - 1)
    assert list(VoiceActivityDetector.iter_frames(pcm)) == []
