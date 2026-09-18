from bit_hub.backend.voice.end_of_utterance import EndOfUtteranceDetector

FRAME_MS = 20


def test_no_trigger_without_speech():
    d = EndOfUtteranceDetector(silence_ms=100, min_speech_ms=40)
    for _ in range(20):
        assert d.update(False, FRAME_MS) is False
    assert d.speech_started is False


def test_requires_min_speech_before_arming():
    d = EndOfUtteranceDetector(silence_ms=100, min_speech_ms=40)
    assert d.update(True, FRAME_MS) is False  # 20ms speech: not armed yet
    assert d.speech_started is False
    assert d.update(True, FRAME_MS) is False  # 40ms total: now armed
    assert d.speech_started is True


def test_silence_after_speech_triggers_end():
    d = EndOfUtteranceDetector(silence_ms=60, min_speech_ms=20)
    d.update(True, FRAME_MS)  # armed
    assert d.speech_started is True
    assert d.update(False, FRAME_MS) is False  # 20ms silence
    assert d.update(False, FRAME_MS) is False  # 40ms silence
    assert d.update(False, FRAME_MS) is True  # 60ms silence -> end of utterance


def test_speech_resets_silence_run():
    d = EndOfUtteranceDetector(silence_ms=60, min_speech_ms=20)
    d.update(True, FRAME_MS)
    d.update(False, FRAME_MS)
    d.update(False, FRAME_MS)
    d.update(True, FRAME_MS)  # speech again resets the silence counter
    assert d.update(False, FRAME_MS) is False
    assert d.update(False, FRAME_MS) is False


def test_reset_clears_state():
    d = EndOfUtteranceDetector(silence_ms=60, min_speech_ms=20)
    d.update(True, FRAME_MS)
    assert d.speech_started is True
    d.reset()
    assert d.speech_started is False
    assert d.update(False, FRAME_MS) is False
