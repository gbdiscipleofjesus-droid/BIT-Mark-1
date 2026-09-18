// CST816 capacitive touch driver (I2C), polled — no interrupt handling
// yet (TOUCH_INT is wired but unused for now; see bit_touch.cpp).
#pragma once

#include <cstdint>

namespace bit_touch {

struct TouchPoint {
  bool pressed = false;
  uint16_t x = 0;
  uint16_t y = 0;
};

void begin();

// Poll the controller over I2C. Call every loop() iteration (or on a
// throttled interval — the controller itself typically updates around
// 30-60Hz). Cheap when nothing changed.
TouchPoint read();

}  // namespace bit_touch
