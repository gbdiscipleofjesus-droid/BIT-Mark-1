from bit_hub.backend.voice import conversation as conv_module
from bit_hub.backend.voice.conversation import ConversationWindow


class FakeClock:
    def __init__(self, start: float = 0.0):
        self.t = start

    def __call__(self) -> float:
        return self.t

    def advance(self, seconds: float) -> None:
        self.t += seconds


def test_closed_by_default():
    w = ConversationWindow()
    assert w.is_open is False
    assert w.expired is False
    assert w.remaining == 0.0


def test_open_and_expiry(monkeypatch):
    clock = FakeClock()
    monkeypatch.setattr(conv_module.time, "monotonic", clock)
    w = ConversationWindow(duration_seconds=8.0)
    w.open()
    assert w.is_open is True
    assert w.expired is False
    clock.advance(7.99)
    assert w.expired is False
    clock.advance(0.02)
    assert w.expired is True
    assert w.is_open is False


def test_should_close_never_cuts_active_utterance(monkeypatch):
    clock = FakeClock()
    monkeypatch.setattr(conv_module.time, "monotonic", clock)
    w = ConversationWindow(duration_seconds=1.0)
    w.open()
    clock.advance(10.0)  # window is long expired
    assert w.expired is True
    assert w.should_close(utterance_in_progress=True) is False
    assert w.should_close(utterance_in_progress=False) is True


def test_poll_timeout_bounded_even_with_long_window(monkeypatch):
    """Regression test for the streaming-starves-the-timeout bug: the
    caller must never be told to wait_for() longer than
    MAX_POLL_INTERVAL_SECONDS, even early in a long follow-up window,
    so expiry is re-checked on a real clock instead of only via a
    wait_for() timeout that continuous audio keeps preempting."""
    clock = FakeClock()
    monkeypatch.setattr(conv_module.time, "monotonic", clock)
    w = ConversationWindow(duration_seconds=8.0)
    w.open()
    assert w.poll_timeout() <= conv_module.MAX_POLL_INTERVAL_SECONDS
    clock.advance(7.5)
    assert w.poll_timeout() == 0.5


def test_armed_stays_true_past_expiry_unlike_is_open(monkeypatch):
    """Regression test for the actual root-cause bug found via the live
    E2E test: gating the close-check on `is_open` meant that once the
    window actually expired, callers stopped noticing it needed closing
    at all (is_open flips to False exactly when the close-check should
    start firing, not before). `armed` must stay True until close()."""
    clock = FakeClock()
    monkeypatch.setattr(conv_module.time, "monotonic", clock)
    w = ConversationWindow(duration_seconds=1.0)
    w.open()
    assert w.armed is True
    assert w.is_open is True
    clock.advance(2.0)  # well past expiry
    assert w.expired is True
    assert w.is_open is False
    assert w.armed is True  # still armed -> caller keeps checking should_close()
    assert w.poll_timeout() == 0.0  # no reason to wait further, but still armed
    w.close()
    assert w.armed is False


def test_close_clears_window():
    w = ConversationWindow(duration_seconds=8.0)
    w.open()
    w.close()
    assert w.is_open is False
    assert w.expired is False
    assert w.should_close(utterance_in_progress=False) is False
