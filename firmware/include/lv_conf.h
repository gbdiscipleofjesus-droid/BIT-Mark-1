// Minimal LVGL 8.4 configuration for BIT's face UI.
// Trimmed from lvgl's lv_conf_template.h to what this firmware actually
// uses: a round 360x360 16-bit color display, basic obj/anim widgets,
// no filesystem/extra-widget features it doesn't need.
#ifndef LV_CONF_H
#define LV_CONF_H

#include <stdint.h>

#define LV_COLOR_DEPTH 16
#define LV_COLOR_16_SWAP 0

#define LV_MEM_CUSTOM 0
#define LV_MEM_SIZE (48U * 1024U)

#define LV_TICK_CUSTOM 1
#if LV_TICK_CUSTOM
#include <Arduino.h>
#define LV_TICK_CUSTOM_INCLUDE "Arduino.h"
#define LV_TICK_CUSTOM_SYS_TIME_EXPR (millis())
#endif

#define LV_DISP_DEF_REFR_PERIOD 30
#define LV_INDEV_DEF_READ_PERIOD 30

#define LV_USE_LOG 0

#define LV_USE_ASSERT_NULL 1
#define LV_USE_ASSERT_MALLOC 1

/* Widgets used by bit_display.cpp */
#define LV_USE_ARC 1
#define LV_USE_LABEL 1
#define LV_USE_OBJ 1

/* Not used yet — kept off to keep the build lean until a given phase
 * actually needs them (apps/touch UI in Phase 3, camera preview in
 * Phase 9, etc.). Flip on when that phase's code needs the widget. */
#define LV_USE_BTN 0
#define LV_USE_IMG 0
#define LV_USE_LIST 0
#define LV_USE_TABLE 0
#define LV_USE_CHART 0

#define LV_USE_ANIMIMG 0
#define LV_USE_FLEX 1
#define LV_USE_GRID 0

#define LV_FONT_MONTSERRAT_14 1
#define LV_FONT_DEFAULT &lv_font_montserrat_14

#define LV_USE_THEME_DEFAULT 1
#define LV_THEME_DEFAULT_DARK 1
#define LV_THEME_DEFAULT_GROW 1
#define LV_THEME_DEFAULT_TRANSITION_TIME 80

#endif  // LV_CONF_H
