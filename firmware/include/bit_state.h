// BIT's local voice/connection state. The Hub is the source of truth for
// WAITING_WAKE_WORD / LISTENING / PROCESSING (pushed over /ws/stream as
// {"type":"state","value":...} — see docs/PROTOCOL.md); IDLE is a
// firmware-local state for "not usefully connected" (booting, no Wi-Fi,
// Hub unreachable, WebSocket error) that never comes from the Hub.
#pragma once

enum class BitVoiceState {
  IDLE,               // Boot, no Wi-Fi, or Hub unreachable — face shows a neutral/offline look.
  WAITING_WAKE_WORD,   // Connected to the Hub, waiting for "Hey BIT".
  LISTENING,           // Hub is actively capturing an utterance (fresh or follow-up).
  PROCESSING,          // Hub is producing a response.
};

inline const char* bit_voice_state_name(BitVoiceState state) {
  switch (state) {
    case BitVoiceState::IDLE:
      return "IDLE";
    case BitVoiceState::WAITING_WAKE_WORD:
      return "WAITING_WAKE_WORD";
    case BitVoiceState::LISTENING:
      return "LISTENING";
    case BitVoiceState::PROCESSING:
      return "PROCESSING";
  }
  return "UNKNOWN";
}
