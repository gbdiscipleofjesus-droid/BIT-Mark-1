// BIT's face: a circular LVGL UI on the 360x360 round panel.
#pragma once

#include "bit_state.h"

namespace bit_display {

void begin();

// Call every loop() iteration to service LVGL's timer/animation engine.
void tick();

// Drives the face's expression from the current voice state.
void setVoiceState(BitVoiceState state);

}  // namespace bit_display
