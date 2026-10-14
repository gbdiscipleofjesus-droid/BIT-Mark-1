// microWakeWord detector for Arduino (ESP32-S3). Same pipeline as ESPHome's micro_wake_word component:
//   16 kHz mono int16 audio -> TFLite microfrontend (30 ms window, 10 ms step, 40 features) -> streaming int8 model -> sliding average.
// The same file is compiled on a PC to test it with wav files (see ../wakeword_test_pc/).
#pragma once
#include <stdint.h>
#include <stddef.h>
#include <stdlib.h>
#include <string.h>
#include <algorithm>
#include <tensorflow/lite/micro/micro_mutable_op_resolver.h>
#include <tensorflow/lite/micro/micro_interpreter.h>
#include <tensorflow/lite/micro/micro_allocator.h>
#include <tensorflow/lite/micro/micro_resource_variable.h>
#include <tensorflow/lite/micro/micro_error_reporter.h>
#include <tensorflow/lite/schema/schema_generated.h>
#include <tensorflow/lite/experimental/microfrontend/lib/frontend.h>
#include <tensorflow/lite/experimental/microfrontend/lib/frontend_util.h>
#ifdef ARDUINO
#include <esp_heap_caps.h>
#endif

class MicroWakeWord {
 public:
  static const int FEATURES = 40;                 // features per 10 ms slice (all microWakeWord models)
  static const int MIN_SLICES_BEFORE_DETECTION = 100;   // ~1 s of warm-up, like ESPHome

  // model: the .tflite bytes (must stay valid). cutoff: 0..1 (the "probability_cutoff" of the model's .json). window: "sliding_window_size" of the .json.
  // arenaBytes: "tensor_arena_size" of the .json (a bit more is safer: we add 4 KB).
  bool begin(const uint8_t* model, float cutoff, int window, size_t arenaBytes) {
    cutoff_ = (uint8_t)(cutoff * 255.0f + 0.5f);
    window_ = window < 1 ? 1 : (window > MAXW ? MAXW : window);
    const tflite::Model* m = tflite::GetModel(model);
    if (m->version() != TFLITE_SCHEMA_VERSION) { err_ = "model schema not supported"; return false; }

    FrontendConfig fc;
    fc.window.size_ms = 30;
    fc.window.step_size_ms = 10;
    fc.filterbank.num_channels = FEATURES;
    fc.filterbank.lower_band_limit = 125.0f;
    fc.filterbank.upper_band_limit = 7500.0f;
    fc.noise_reduction.smoothing_bits = 10;
    fc.noise_reduction.even_smoothing = 0.025f;
    fc.noise_reduction.odd_smoothing = 0.06f;
    fc.noise_reduction.min_signal_remaining = 0.05f;
    fc.pcan_gain_control.enable_pcan = 1;
    fc.pcan_gain_control.strength = 0.95f;
    fc.pcan_gain_control.offset = 80.0f;
    fc.pcan_gain_control.gain_bits = 21;
    fc.log_scale.enable_log = 1;
    fc.log_scale.scale_shift = 6;
    if (!FrontendPopulateState(&fc, &fs_, 16000)) { err_ = "frontend init failed"; return false; }

    arenaSize_ = arenaBytes + 4096;
    arena_ = (uint8_t*)allocMem(arenaSize_);
    varArena_ = (uint8_t*)allocMem(4096);
    if (!arena_ || !varArena_) { err_ = "out of memory"; return false; }
    ma_ = tflite::MicroAllocator::Create(varArena_, 4096, &rep_);
    mrv_ = tflite::MicroResourceVariables::Create(ma_, 20);

    if (ops_.AddCallOnce() || ops_.AddVarHandle() || ops_.AddReshape() || ops_.AddReadVariable() || ops_.AddStridedSlice() ||
        ops_.AddConcatenation() || ops_.AddAssignVariable() || ops_.AddConv2D() || ops_.AddMul() || ops_.AddAdd() || ops_.AddMean() ||
        ops_.AddFullyConnected() || ops_.AddLogistic() || ops_.AddQuantize() || ops_.AddDepthwiseConv2D() || ops_.AddAveragePool2D() ||
        ops_.AddMaxPool2D() || ops_.AddPad() || ops_.AddPack() || ops_.AddSplitV()) { err_ = "op registration failed"; return false; }

    interp_ = new tflite::MicroInterpreter(m, ops_, arena_, arenaSize_, &rep_, mrv_);
    if (interp_->AllocateTensors() != kTfLiteOk) { err_ = "AllocateTensors failed (arena too small? raise tensor_arena_size)"; return false; }
    TfLiteTensor* in = interp_->input(0);
    if (in->dims->size != 3 || in->dims->data[0] != 1 || in->dims->data[2] != FEATURES || in->type != kTfLiteInt8) { err_ = "not a microWakeWord streaming model (input must be int8 [1,N,40])"; return false; }
    TfLiteTensor* out = interp_->output(0);
    if (out->type != kTfLiteUInt8) { err_ = "model output must be uint8"; return false; }
    stride_ = in->dims->data[1];
    arenaUsed_ = interp_->arena_used_bytes();
    resetProbs();
    ok_ = true;
    return true;
  }

  // Feed 16 kHz mono int16 samples (any amount). Returns true when the wake word was just heard.
  bool feed(const int16_t* s, size_t n) {
    if (!ok_) return false;
    bool heard = false;
    while (n > 0) {
      size_t read = 0;
      FrontendOutput fo = FrontendProcessSamples(&fs_, s, n, &read);
      s += read; n -= read;
      if (fo.size != FEATURES) continue;
      int8_t f[FEATURES];
      for (int i = 0; i < FEATURES; i++) {           // same scaling as ESPHome: (value*256 + 333)/666 - 128
        int32_t v = ((int32_t)fo.values[i] * 256 + 333) / 666 + INT8_MIN;
        f[i] = (int8_t)std::max<int32_t>(INT8_MIN, std::min<int32_t>(INT8_MAX, v));
      }
      if (push(f)) heard = true;
    }
    return heard;
  }

  uint8_t lastProb() const { return recent_[idx_]; }                // 0..255
  uint8_t avgProb() const { uint32_t s = 0; for (int i = 0; i < window_; i++) s += recent_[i]; return (uint8_t)(s / window_); }
  uint8_t maxProb() const { uint8_t m = 0; for (int i = 0; i < window_; i++) m = std::max(m, recent_[i]); return m; }
  uint8_t cutoff() const { return cutoff_; }
  size_t arenaUsed() const { return arenaUsed_; }
  uint32_t inferences() const { return inferences_; }
  const char* error() const { return err_; }
  bool ready() const { return ok_; }

 private:
  static const int MAXW = 16;
  bool push(const int8_t f[FEATURES]) {
    TfLiteTensor* in = interp_->input(0);
    stepPos_ %= stride_;
    memcpy(in->data.int8 + FEATURES * stepPos_, f, FEATURES);
    stepPos_++;
    bool heard = false;
    if (stepPos_ >= stride_) {
      if (interp_->Invoke() != kTfLiteOk) return false;
      inferences_++;
      idx_ = (idx_ + 1) % window_;
      recent_[idx_] = interp_->output(0)->data.uint8[0];
      if (ignore_ >= 0) {                             // warm-up finished: check the average
        uint32_t sum = 0; for (int i = 0; i < window_; i++) sum += recent_[i];
        if (sum > (uint32_t)cutoff_ * window_) { heard = true; resetProbs(); }
      }
    }
    if (recent_[idx_] < cutoff_) ignore_ = std::min(ignore_ + 1, 0);   // cool-off, like ESPHome
    return heard;
  }
  void resetProbs() { for (int i = 0; i < MAXW; i++) recent_[i] = 0; ignore_ = -MIN_SLICES_BEFORE_DETECTION; }
  static void* allocMem(size_t n) {
#ifdef ARDUINO
    void* p = heap_caps_malloc(n, MALLOC_CAP_8BIT | MALLOC_CAP_INTERNAL);      // internal RAM is faster
    return p ? p : heap_caps_malloc(n, MALLOC_CAP_8BIT);
#else
    return aligned_alloc(16, (n + 15) & ~(size_t)15);
#endif
  }

  FrontendState fs_{};
  uint8_t *arena_ = nullptr, *varArena_ = nullptr;
  size_t arenaSize_ = 0, arenaUsed_ = 0;
  tflite::MicroAllocator* ma_ = nullptr;
  tflite::MicroResourceVariables* mrv_ = nullptr;
  tflite::MicroMutableOpResolver<20> ops_;
  tflite::MicroErrorReporter rep_;
  tflite::MicroInterpreter* interp_ = nullptr;
  uint8_t recent_[MAXW] = {0};
  int idx_ = 0, window_ = 5, stride_ = 3, stepPos_ = 0;
  int ignore_ = -MIN_SLICES_BEFORE_DETECTION;
  uint8_t cutoff_ = 247;
  uint32_t inferences_ = 0;
  bool ok_ = false;
  const char* err_ = "";
};
