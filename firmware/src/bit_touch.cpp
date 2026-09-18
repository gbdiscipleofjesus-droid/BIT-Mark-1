#include "bit_touch.h"

#include <Arduino.h>
#include <Wire.h>

#include "pins.h"

namespace bit_touch {

namespace {
// CST816S/CST816T standard I2C address, per the family's widely-used
// open-source drivers. Not yet cross-checked against this specific
// board's schematic — verify once the physical unit is in hand (per
// project rule: no "hardware ready" claims before real-board testing).
constexpr uint8_t kI2cAddr = 0x15;

// Register layout used by common CST816 drivers:
//   0x02            number of touch points
//   0x03            XH: bits[3:0] = X high nibble (bits[7:6] = event flag, unused here)
//   0x04            XL: X low byte
//   0x05            YH: Y high nibble
//   0x06            YL: Y low byte
// TOUCH_RST lives behind the board's IO expander (EXIO1), so a real
// reset pulse needs that expander's driver — not wired up here yet (same
// gap as the display panel's TODO; see bit_display.cpp). Without a
// reset pulse the controller may still work if it powered up in a sane
// default state, but this is unverified until real hardware is in hand.
bool read_registers(uint8_t reg, uint8_t* out, size_t len) {
  Wire.beginTransmission(kI2cAddr);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return false;

  size_t got = Wire.requestFrom(static_cast<int>(kI2cAddr), static_cast<int>(len));
  if (got != len) return false;
  for (size_t i = 0; i < len; i++) out[i] = Wire.read();
  return true;
}
}  // namespace

void begin() {
  Wire.begin(bit_pins::TOUCH_SDA, bit_pins::TOUCH_SCL);
  pinMode(bit_pins::TOUCH_INT, INPUT);
}

TouchPoint read() {
  TouchPoint point;

  uint8_t buf[5];
  if (!read_registers(0x02, buf, sizeof(buf))) return point;

  const uint8_t finger_num = buf[0];
  if (finger_num == 0) return point;

  const uint8_t xh = buf[1] & 0x0F;
  const uint8_t xl = buf[2];
  const uint8_t yh = buf[3] & 0x0F;
  const uint8_t yl = buf[4];

  point.pressed = true;
  point.x = (static_cast<uint16_t>(xh) << 8) | xl;
  point.y = (static_cast<uint16_t>(yh) << 8) | yl;
  return point;
}

}  // namespace bit_touch
