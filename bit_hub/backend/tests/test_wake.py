import numpy as np
import pytest

from bit_hub.backend.voice.wake import THRESHOLD_ENV_VAR, WakeWordDetector, _read_threshold_from_env


def test_load_returns_false_when_model_file_missing(tmp_path):
    detector = WakeWordDetector(model_path=tmp_path / "does_not_exist.onnx")
    assert detector.load() is False
    assert detector.loaded is False


def test_feed_and_best_prediction_are_empty_when_not_loaded():
    detector = WakeWordDetector(model_path="/nonexistent/hey_bit.onnx")
    assert detector.feed(b"\x00\x00" * 1280) == {}
    label, score = detector.best_prediction(b"\x00\x00" * 1280)
    assert label is None
    assert score == 0.0


def test_triggered_never_fires_without_threshold(monkeypatch, tmp_path):
    model_file = tmp_path / "hey_bit.onnx"
    model_file.write_bytes(b"fake")  # only existence is checked before import

    class FakeModel:
        def __init__(self, *args, **kwargs):
            pass

        def predict(self, x):
            return {"hey_bit": 0.99}

    monkeypatch.setattr("openwakeword.model.Model", FakeModel)

    detector = WakeWordDetector(model_path=model_file)  # no threshold set
    assert detector.load() is True
    triggered, label, score = detector.triggered(np.zeros(1280, dtype=np.int16).tobytes())
    assert triggered is False  # never guesses a default threshold
    assert label == "hey_bit"
    assert score == pytest.approx(0.99)


def test_triggered_fires_once_threshold_configured(monkeypatch, tmp_path):
    model_file = tmp_path / "hey_bit.onnx"
    model_file.write_bytes(b"fake")

    class FakeModel:
        def __init__(self, *args, **kwargs):
            pass

        def predict(self, x):
            return {"hey_bit": 0.8}

    monkeypatch.setattr("openwakeword.model.Model", FakeModel)

    detector = WakeWordDetector(model_path=model_file, threshold=0.7)
    assert detector.load() is True
    triggered, label, score = detector.triggered(np.zeros(1280, dtype=np.int16).tobytes())
    assert triggered is True
    assert label == "hey_bit"


def test_label_is_not_assumed_to_be_hey_bit(monkeypatch, tmp_path):
    """openWakeWord derives the label from the model filename; a
    differently-named export must still work without code changes."""
    model_file = tmp_path / "hey_bit.onnx"
    model_file.write_bytes(b"fake")

    class FakeModel:
        def __init__(self, *args, **kwargs):
            pass

        def predict(self, x):
            return {"some_other_label_v3": 0.55}

    monkeypatch.setattr("openwakeword.model.Model", FakeModel)

    detector = WakeWordDetector(model_path=model_file, threshold=0.5)
    triggered = detector.load()
    assert triggered is True
    did_trigger, label, score = detector.triggered(np.zeros(1280, dtype=np.int16).tobytes())
    assert label == "some_other_label_v3"
    assert did_trigger is True


@pytest.mark.parametrize(
    "raw,expected",
    [
        (None, None),
        ("", None),
        ("0.5", 0.5),
        ("not-a-number", None),
        ("0", None),  # out of (0, 1]
        ("1.5", None),  # out of (0, 1]
        ("1.0", 1.0),
    ],
)
def test_read_threshold_from_env(monkeypatch, raw, expected):
    if raw is None:
        monkeypatch.delenv(THRESHOLD_ENV_VAR, raising=False)
    else:
        monkeypatch.setenv(THRESHOLD_ENV_VAR, raw)
    assert _read_threshold_from_env() == expected
