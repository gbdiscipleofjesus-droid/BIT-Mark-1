#include "bit_audio.h"

#include <Arduino.h>
#include <driver/i2s.h>

#include "pins.h"

namespace bit_audio {

namespace {
constexpr i2s_port_t kMicPort = I2S_NUM_0;
constexpr i2s_port_t kSpeakerPort = I2S_NUM_1;

uint8_t g_capture_buffer[kCaptureFrameBytes];
bool g_playing = false;

void configure_mic() {
  const i2s_config_t config = {
      .mode = static_cast<i2s_mode_t>(I2S_MODE_MASTER | I2S_MODE_RX),
      .sample_rate = kSampleRateHz,
      .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
      .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
      .communication_format = I2S_COMM_FORMAT_STAND_I2S,
      .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
      .dma_buf_count = 4,
      .dma_buf_len = kCaptureFrameSamples,
      .use_apll = false,
      .tx_desc_auto_clear = false,
      .fixed_mclk = 0,
  };
  const i2s_pin_config_t pin_config = {
      .bck_io_num = bit_pins::MIC_SCK,
      .ws_io_num = bit_pins::MIC_WS,
      .data_out_num = I2S_PIN_NO_CHANGE,
      .data_in_num = bit_pins::MIC_SD,
  };
  i2s_driver_install(kMicPort, &config, 0, nullptr);
  i2s_set_pin(kMicPort, &pin_config);
}

void configure_speaker() {
  const i2s_config_t config = {
      .mode = static_cast<i2s_mode_t>(I2S_MODE_MASTER | I2S_MODE_TX),
      .sample_rate = kSampleRateHz,
      .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
      .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
      .communication_format = I2S_COMM_FORMAT_STAND_I2S,
      .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
      .dma_buf_count = 4,
      .dma_buf_len = kCaptureFrameSamples,
      .use_apll = false,
      .tx_desc_auto_clear = true,
      .fixed_mclk = 0,
  };
  const i2s_pin_config_t pin_config = {
      .bck_io_num = bit_pins::SPK_BCK,
      .ws_io_num = bit_pins::SPK_LRCK,
      .data_out_num = bit_pins::SPK_DIN,
      .data_in_num = I2S_PIN_NO_CHANGE,
  };
  i2s_driver_install(kSpeakerPort, &config, 0, nullptr);
  i2s_set_pin(kSpeakerPort, &pin_config);
}
}  // namespace

void begin() {
  configure_mic();
  configure_speaker();
}

CaptureResult update() {
  // Reset every call. Without this, a call that reads 0 fresh bytes
  // (mic momentarily idle / DMA underrun) could fall through and report
  // whatever was left over from a previous call, sending stale audio to
  // the Hub as if it were new.
  size_t lastBytesRead = 0;
  size_t inputSampleCount = 0;

  esp_err_t err = i2s_read(kMicPort, g_capture_buffer, kCaptureFrameBytes, &lastBytesRead, 0);

  CaptureResult result;
  if (err == ESP_OK && lastBytesRead == kCaptureFrameBytes) {
    inputSampleCount = lastBytesRead / sizeof(int16_t);
    result.data = g_capture_buffer;
    result.length = lastBytesRead;
  }
  // inputSampleCount is currently only used for the freshness invariant
  // above; kept as a named local (rather than folded into the if) so a
  // future caller that needs the sample count doesn't have to
  // re-derive it and risk skipping the reset-at-top-of-call discipline.
  (void)inputSampleCount;
  return result;
}

void playback(const uint8_t* pcm, size_t length) {
  if (pcm == nullptr || length == 0) return;
  g_playing = true;
  size_t bytes_written = 0;
  i2s_write(kSpeakerPort, pcm, length, &bytes_written, portMAX_DELAY);
  g_playing = false;
}

bool isPlaying() { return g_playing; }

}  // namespace bit_audio
