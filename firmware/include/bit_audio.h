// Microphone capture (I2S input) and speaker playback (I2S output,
// PCM5101) for BIT.
#pragma once

#include <cstddef>
#include <cstdint>

namespace bit_audio {

constexpr uint32_t kSampleRateHz = 16000;
// 20ms @ 16kHz mono 16-bit — matches the Hub's VAD frame size
// (bit_hub/backend/voice/audio.py: VAD_FRAME_SAMPLES).
constexpr size_t kCaptureFrameSamples = 320;
constexpr size_t kCaptureFrameBytes = kCaptureFrameSamples * sizeof(int16_t);

void begin();

// Result of one update() call: freshly captured PCM16 mono samples
// ready to send to the Hub, or a null/zero-length result if a full
// frame hasn't been captured yet this call.
struct CaptureResult {
  const uint8_t* data = nullptr;
  size_t length = 0;
};

// Reads from the I2S mic into the internal buffer. Must be polled
// regularly from loop(). Resets its own bookkeeping (lastBytesRead,
// inputSampleCount) at the top of every call — a previous version of
// this function let stale values from an earlier call leak into the
// next one, which caused old audio to be resent to the Hub after a gap.
// Do not remove that reset without understanding why it's there.
CaptureResult update();

// Queues PCM16 mono audio for playback over the PCM5101. Non-blocking:
// returns immediately, playback happens via the I2S DMA buffer.
void playback(const uint8_t* pcm, size_t length);

bool isPlaying();

}  // namespace bit_audio
