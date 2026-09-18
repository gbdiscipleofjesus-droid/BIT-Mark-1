#include "bit_display.h"

#include <Arduino.h>
#include <lvgl.h>

#include "pins.h"

namespace bit_display {

namespace {
constexpr uint16_t kHorRes = 360;
constexpr uint16_t kVerRes = 360;

lv_disp_draw_buf_t g_draw_buf;
lv_color_t g_buf1[kHorRes * 40];
lv_disp_drv_t g_disp_drv;

lv_obj_t* g_eye_left = nullptr;
lv_obj_t* g_eye_right = nullptr;
lv_obj_t* g_mouth = nullptr;
lv_anim_t g_processing_anim;

// ---------------------------------------------------------------------
// Panel bring-up: THIS IS A STUB.
//
// The real ST77916 QSPI panel + CST816 touch on this board are meant to
// be brought up through Waveshare's ESP32_Display_Panel /
// ESP32_IO_Expander libraries (see platformio.ini lib_deps and the
// dossier's pinned versions: ESP32_Display_Panel 1.0.5,
// ESP32_IO_Expander 1.1.1). This file does not call into that library
// yet because its exact API surface hasn't been inspected against the
// installed version in this environment — the project's own rule is
// "no inventar firmas" (don't fabricate API calls you haven't verified
// against the real installed library). Wire panel_flush_to_hardware()
// up to the real library once it's available to inspect (e.g. once
// PlatformIO can fetch it, or once running inside the Codespaces/dev
// environment that has it), following Waveshare's official example for
// ESP32-S3-Touch-LCD-1.85. Until then, LVGL renders into the frame
// buffer correctly but nothing reaches the physical screen.
void panel_flush_to_hardware(const lv_area_t* /*area*/, lv_color_t* /*color_p*/) {
  // TODO(hardware bring-up): push `color_p` for `area` to the ST77916
  // panel via ESP32_Display_Panel. Do not stub this out permanently —
  // see the comment above.
}

void disp_flush_cb(lv_disp_drv_t* disp, const lv_area_t* area, lv_color_t* color_p) {
  panel_flush_to_hardware(area, color_p);
  lv_disp_flush_ready(disp);
}

void build_face() {
  lv_obj_t* screen = lv_scr_act();
  lv_obj_set_style_bg_color(screen, lv_color_black(), 0);
  lv_obj_set_style_bg_opa(screen, LV_OPA_COVER, 0);

  auto make_eye = [&](lv_coord_t x_offset) {
    lv_obj_t* eye = lv_obj_create(screen);
    lv_obj_set_size(eye, 48, 48);
    lv_obj_set_style_radius(eye, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_bg_color(eye, lv_palette_main(LV_PALETTE_CYAN), 0);
    lv_obj_set_style_bg_opa(eye, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(eye, 0, 0);
    lv_obj_align(eye, LV_ALIGN_CENTER, x_offset, -40);
    return eye;
  };
  g_eye_left = make_eye(-60);
  g_eye_right = make_eye(60);

  g_mouth = lv_obj_create(screen);
  lv_obj_set_size(g_mouth, 100, 10);
  lv_obj_set_style_radius(g_mouth, LV_RADIUS_CIRCLE, 0);
  lv_obj_set_style_bg_color(g_mouth, lv_palette_main(LV_PALETTE_CYAN), 0);
  lv_obj_set_style_bg_opa(g_mouth, LV_OPA_COVER, 0);
  lv_obj_set_style_border_width(g_mouth, 0, 0);
  lv_obj_align(g_mouth, LV_ALIGN_CENTER, 0, 70);
}

void set_mouth_height_anim_cb(void* obj, int32_t height) {
  lv_obj_set_height(static_cast<lv_obj_t*>(obj), height);
  lv_obj_align(static_cast<lv_obj_t*>(obj), LV_ALIGN_CENTER, 0, 70);
}

void stop_processing_anim() { lv_anim_del(g_mouth, set_mouth_height_anim_cb); }
}  // namespace

void begin() {
  lv_init();
  lv_disp_draw_buf_init(&g_draw_buf, g_buf1, nullptr, kHorRes * 40);

  lv_disp_drv_init(&g_disp_drv);
  g_disp_drv.hor_res = kHorRes;
  g_disp_drv.ver_res = kVerRes;
  g_disp_drv.flush_cb = disp_flush_cb;
  g_disp_drv.draw_buf = &g_draw_buf;
  lv_disp_drv_register(&g_disp_drv);

  build_face();
  setVoiceState(BitVoiceState::IDLE);
}

void tick() { lv_timer_handler(); }

void setVoiceState(BitVoiceState state) {
  stop_processing_anim();

  switch (state) {
    case BitVoiceState::IDLE:
      lv_obj_set_style_bg_color(g_eye_left, lv_palette_darken(LV_PALETTE_GREY, 2), 0);
      lv_obj_set_style_bg_color(g_eye_right, lv_palette_darken(LV_PALETTE_GREY, 2), 0);
      lv_obj_set_height(g_mouth, 10);
      lv_obj_align(g_mouth, LV_ALIGN_CENTER, 0, 70);
      break;

    case BitVoiceState::WAITING_WAKE_WORD:
      lv_obj_set_style_bg_color(g_eye_left, lv_palette_main(LV_PALETTE_CYAN), 0);
      lv_obj_set_style_bg_color(g_eye_right, lv_palette_main(LV_PALETTE_CYAN), 0);
      lv_obj_set_height(g_mouth, 10);
      lv_obj_align(g_mouth, LV_ALIGN_CENTER, 0, 70);
      break;

    case BitVoiceState::LISTENING:
      lv_obj_set_style_bg_color(g_eye_left, lv_palette_main(LV_PALETTE_GREEN), 0);
      lv_obj_set_style_bg_color(g_eye_right, lv_palette_main(LV_PALETTE_GREEN), 0);
      lv_obj_set_height(g_mouth, 40);
      lv_obj_align(g_mouth, LV_ALIGN_CENTER, 0, 70);
      break;

    case BitVoiceState::PROCESSING:
      lv_obj_set_style_bg_color(g_eye_left, lv_palette_main(LV_PALETTE_ORANGE), 0);
      lv_obj_set_style_bg_color(g_eye_right, lv_palette_main(LV_PALETTE_ORANGE), 0);
      lv_anim_init(&g_processing_anim);
      lv_anim_set_var(&g_processing_anim, g_mouth);
      lv_anim_set_values(&g_processing_anim, 10, 30);
      lv_anim_set_time(&g_processing_anim, 400);
      lv_anim_set_playback_time(&g_processing_anim, 400);
      lv_anim_set_repeat_count(&g_processing_anim, LV_ANIM_REPEAT_INFINITE);
      lv_anim_set_exec_cb(&g_processing_anim, set_mouth_height_anim_cb);
      lv_anim_start(&g_processing_anim);
      break;
  }
}

}  // namespace bit_display
