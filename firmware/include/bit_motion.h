// 10-servo motion (shoulders, elbows, hips, knees, toes x2) over a
// PCA9685 PWM driver board on the shared IMU/RTC I2C bus (see pins.h).
//
// Status: NOT verified on real hardware. Joint routing, angle clamping
// and state tracking below are real; the actual write-to-PCA9685 call
// in bit_motion.cpp is a TODO (same discipline as bit_display.cpp's
// panel_flush_to_hardware()) because this project doesn't fabricate a
// library's API surface without inspecting the real, installed version
// first — see that TODO for what has to happen before this moves a
// real servo.
#pragma once

#include <cstdint>

namespace bit_motion {

enum class Joint : uint8_t {
  LEFT_SHOULDER,
  RIGHT_SHOULDER,
  LEFT_ELBOW,
  RIGHT_ELBOW,
  LEFT_HIP,
  RIGHT_HIP,
  LEFT_KNEE,
  RIGHT_KNEE,
  LEFT_TOE,
  RIGHT_TOE,
  kCount,
};

// Matches the wire names used in docs/PROTOCOL.md's {"type":"pose",...}
// message. Returns false (and leaves *out untouched) if name doesn't
// match any known joint — callers must fail safe, not guess.
bool jointFromName(const char* name, Joint* out);

void begin();

// Clamps to [0, 180] degrees — the generic safe bound for a standard
// hobby PWM servo, NOT this robot's real per-joint mechanical range.
// Each joint's actual safe range (shoulders/elbows/hips/knees/toes all
// differ) must be measured on the real board during bring-up
// (firmware/README.md's checklist) before this can be trusted beyond
// "doesn't immediately break something."
void setJointAngle(Joint joint, float degrees);

float currentAngle(Joint joint);

}  // namespace bit_motion
