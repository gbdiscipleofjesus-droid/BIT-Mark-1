#include "bit_motion.h"

#include <Arduino.h>
#include <cstring>

#include "pins.h"

namespace bit_motion {

namespace {

constexpr int kJointCount = static_cast<int>(Joint::kCount);
float g_angle[kJointCount] = {};

struct JointName {
  Joint joint;
  const char* name;
};

// Wire names deliberately match the enum, snake_case, per
// docs/PROTOCOL.md's {"type":"pose","joint":"...","angle_deg":...}.
constexpr JointName kJointNames[kJointCount] = {
    {Joint::LEFT_SHOULDER, "left_shoulder"},
    {Joint::RIGHT_SHOULDER, "right_shoulder"},
    {Joint::LEFT_ELBOW, "left_elbow"},
    {Joint::RIGHT_ELBOW, "right_elbow"},
    {Joint::LEFT_HIP, "left_hip"},
    {Joint::RIGHT_HIP, "right_hip"},
    {Joint::LEFT_KNEE, "left_knee"},
    {Joint::RIGHT_KNEE, "right_knee"},
    {Joint::LEFT_TOE, "left_toe"},
    {Joint::RIGHT_TOE, "right_toe"},
};

float clampDegrees(float degrees) {
  if (degrees < 0.0f) return 0.0f;
  if (degrees > 180.0f) return 180.0f;
  return degrees;
}

}  // namespace

bool jointFromName(const char* name, Joint* out) {
  if (name == nullptr || out == nullptr) return false;
  for (const auto& entry : kJointNames) {
    if (strcmp(name, entry.name) == 0) {
      *out = entry.joint;
      return true;
    }
  }
  return false;
}

void begin() {
  // TODO(motion bring-up): initialize the PCA9685 over I2C
  // (bit_pins::SERVO_SDA/SERVO_SCL, bit_pins::SERVO_PCA9685_ADDR) and
  // set its PWM frequency for standard analog servos (~50Hz). Left
  // unimplemented rather than guessing at a servo driver library's
  // real API/version without registry access to verify it against
  // (same reasoning as platformio.ini's earlier espressif32 pin
  // mistake) — pick and pin a real, checked library version first
  // (e.g. search PlatformIO's registry from an environment with
  // access, the way espressif32@7.1.3 was verified), then wire the
  // actual driver calls in here.
  Serial.println("[motion] begin() stubbed: no PCA9685 driver wired in yet, see TODO");
  for (float& angle : g_angle) angle = 90.0f;  // assume a neutral midpoint until calibrated
}

void setJointAngle(Joint joint, float degrees) {
  const int index = static_cast<int>(joint);
  if (index < 0 || index >= kJointCount) return;

  const float clamped = clampDegrees(degrees);
  g_angle[index] = clamped;

  // TODO(motion bring-up): translate `clamped` into a PCA9685 PWM pulse
  // and actually move the servo. Until begin()'s driver init is real,
  // this only updates local state so the rest of the pipeline (protocol
  // parsing, joint routing) can be exercised before hardware exists.
  Serial.printf("[motion] set %s = %.1f deg (not yet sent to hardware)\n",
                kJointNames[index].name, clamped);
}

float currentAngle(Joint joint) {
  const int index = static_cast<int>(joint);
  if (index < 0 || index >= kJointCount) return 0.0f;
  return g_angle[index];
}

}  // namespace bit_motion
