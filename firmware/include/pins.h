// Pin map for the Waveshare ESP32-S3-Touch-LCD-1.85 (SKU 28514, base/
// original variant), verified against Waveshare's official documentation
// (https://docs.waveshare.com/ESP32-S3-Touch-LCD-1.85).
//
// Do not change these to fix a build warning or "because it seems
// right" — cross-check the real doc/hardware first. Board is 55x55mm,
// ESP32-S3R8, 16MB flash, 8MB PSRAM.
#pragma once

#include <cstdint>

namespace bit_pins {

// --- LCD (QSPI), ST77916 controller, 360x360 round panel ---
constexpr int LCD_D0 = 46;
constexpr int LCD_D1 = 45;
constexpr int LCD_D2 = 42;
constexpr int LCD_D3 = 41;
constexpr int LCD_SCK = 40;
constexpr int LCD_CS = 21;
constexpr int LCD_TE = 18;
constexpr int LCD_BACKLIGHT = 5;
// EXIO pins are behind the board's IO expander, not native ESP32 GPIOs.
constexpr int LCD_RST_EXIO = 2;

// --- Touch (CST816, I2C) ---
constexpr int TOUCH_SDA = 1;
constexpr int TOUCH_SCL = 3;
constexpr int TOUCH_INT = 4;
constexpr int TOUCH_RST_EXIO = 1;

// --- TF / microSD ---
constexpr int TF_MISO = 16;
constexpr int TF_MOSI = 17;
constexpr int TF_SCK = 14;
constexpr int TF_CS_EXIO = 3;

// --- IMU (QMI8658, 6-axis) — shares the I2C bus with the RTC ---
constexpr int IMU_SCL = 10;
constexpr int IMU_SDA = 11;
constexpr int IMU_INT1_EXIO = 5;
constexpr int IMU_INT2_EXIO = 4;

// --- RTC (PCF85063) — same I2C bus as the IMU ---
constexpr int RTC_SCL = 10;
constexpr int RTC_SDA = 11;
constexpr int RTC_INT = 9;

// --- Microphone (I2S input) ---
constexpr int MIC_WS = 2;
constexpr int MIC_SCK = 15;
constexpr int MIC_SD = 39;

// --- Speaker output (PCM5101, I2S) ---
constexpr int SPK_DIN = 47;
constexpr int SPK_LRCK = 38;
constexpr int SPK_BCK = 48;

// --- Motion (10x servo, via PCA9685 PWM driver over I2C) ---
// Every native GPIO on this board is already claimed by display/touch/
// TF/IMU/RTC/mic/speaker above (verified against Waveshare's own docs -
// see this file's header). Rather than guess at an unclaimed pin without
// a real board to check against, motion reuses the existing IMU/RTC I2C
// bus (2 wires, no new GPIO) and talks to a PCA9685 servo driver board
// at its default address. Confirm no address collision with the IMU
// (QMI8658) or RTC (PCF85063) on real hardware before trusting this.
constexpr int SERVO_SCL = IMU_SCL;
constexpr int SERVO_SDA = IMU_SDA;
constexpr uint8_t SERVO_PCA9685_ADDR = 0x40;  // PCA9685 default; verify no clash with IMU/RTC addrs on real hardware.

}  // namespace bit_pins
