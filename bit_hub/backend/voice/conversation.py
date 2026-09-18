"""Follow-up conversation window: lets BIT keep listening for a short time
after answering, without requiring the wake word again.

Fixes the timeout bug identified in the Phase 7 handoff notes: the
original design checked window expiry only by letting
`asyncio.wait_for(websocket.receive(), timeout=window.remaining)` raise
TimeoutError. Under continuous audio streaming, receive() keeps resolving
before that timeout ever elapses, so the window could stay open
indefinitely. `ConversationWindow` now exposes `expired` as a plain,
wall-clock property that the caller must poll explicitly on every loop
iteration — it does not depend on any particular asyncio call actually
timing out. `should_close()` additionally guarantees a phrase already in
progress is never cut off just because the window's clock ran out; the
EndOfUtteranceDetector is the only thing allowed to end an in-progress
utterance.
"""

from __future__ import annotations

import time

DEFAULT_FOLLOWUP_SECONDS = 8.0

# Upper bound used by callers for asyncio.wait_for(...) polling so the
# expiry check in the receive loop runs at least this often even while
# packets keep arriving back-to-back.
MAX_POLL_INTERVAL_SECONDS = 1.0


class ConversationWindow:
    def __init__(self, duration_seconds: float = DEFAULT_FOLLOWUP_SECONDS) -> None:
        self.duration_seconds = duration_seconds
        self._deadline: float | None = None

    def open(self, duration_seconds: float | None = None) -> None:
        """(Re)open the window, resetting the deadline from now."""
        if duration_seconds is not None:
            self.duration_seconds = duration_seconds
        self._deadline = time.monotonic() + self.duration_seconds

    def close(self) -> None:
        self._deadline = None

    @property
    def is_open(self) -> bool:
        return self._deadline is not None and time.monotonic() < self._deadline

    @property
    def armed(self) -> bool:
        """True whenever a deadline is set, expired or not. Callers must
        gate the "should we still be polling/checking this window" logic
        on `armed`, not on `is_open` — once the deadline passes, `is_open`
        correctly flips to False, but that must not stop the caller from
        noticing the expiry and closing the window. Gating on `is_open`
        instead was the original bug: it made the close-check keep
        running only while the window *hadn't* expired yet, so nothing
        ever ran the check that fires exactly once it has."""
        return self._deadline is not None

    @property
    def expired(self) -> bool:
        """True once the wall-clock deadline has passed. Does not close
        the window by itself — callers decide via should_close()."""
        return self._deadline is not None and time.monotonic() >= self._deadline

    @property
    def remaining(self) -> float:
        if self._deadline is None:
            return 0.0
        return max(0.0, self._deadline - time.monotonic())

    def poll_timeout(self) -> float:
        """Timeout to pass to asyncio.wait_for(...) so the caller wakes up
        and re-checks expiry at least every MAX_POLL_INTERVAL_SECONDS,
        even mid-stream."""
        return min(self.remaining, MAX_POLL_INTERVAL_SECONDS) if self.armed else 0.0

    def should_close(self, utterance_in_progress: bool) -> bool:
        """Whether the window should be closed right now.

        Never returns True while an utterance is in progress — a phrase
        that has already started must be allowed to finish; the
        EndOfUtteranceDetector is what ends it, not the follow-up clock.
        """
        if utterance_in_progress:
            return False
        return self.expired
