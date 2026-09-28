#pragma once
#include <cstdint>

// Spelled out rather than relying on libm's M_PI, which isn't guaranteed by
// the C++ standard and is missing on some embedded toolchains.
constexpr float kPi = 3.14159265358979323846f;
constexpr float kTwoPi = 2.0f * kPi;

// Compile-time RGB888 -> RGB565 packer, used to build every colour in the
// palette below so nothing depends on a runtime tft.color565() call.
constexpr uint16_t rgb565(uint8_t r, uint8_t g, uint8_t b) {
    return (uint16_t)(((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3));
}

namespace Palette {

// Cabinet
constexpr uint16_t BLACK        = rgb565(0, 0, 0);
constexpr uint16_t CAB_RED_HI   = rgb565(176, 26, 34);
constexpr uint16_t CAB_RED_LO   = rgb565(70, 8, 14);
constexpr uint16_t CAB_MAROON   = rgb565(36, 4, 8);

// Gold trim / bezel
constexpr uint16_t GOLD_HI      = rgb565(255, 221, 122);
constexpr uint16_t GOLD         = rgb565(210, 162, 48);
constexpr uint16_t GOLD_LO      = rgb565(110, 78, 20);
constexpr uint16_t GOLD_SHADOW  = rgb565(56, 38, 10);

// Text / neutrals
constexpr uint16_t CREAM        = rgb565(255, 246, 222);
constexpr uint16_t WHITE        = rgb565(255, 255, 255);
constexpr uint16_t DIM_WHITE    = rgb565(170, 168, 160);

// Reel window
constexpr uint16_t WINDOW_BG_HI = rgb565(26, 28, 46);
constexpr uint16_t WINDOW_BG_LO = rgb565(8, 9, 18);

// Symbols
constexpr uint16_t CHERRY_RED    = rgb565(216, 26, 46);
constexpr uint16_t CHERRY_DARK   = rgb565(132, 8, 24);
constexpr uint16_t CHERRY_SHINE  = rgb565(255, 150, 160);
constexpr uint16_t LEAF_GREEN    = rgb565(58, 172, 78);
constexpr uint16_t LEAF_DARK     = rgb565(24, 96, 40);
constexpr uint16_t LEMON_YELLOW  = rgb565(246, 222, 62);
constexpr uint16_t LEMON_DARK    = rgb565(188, 158, 20);
constexpr uint16_t BELL_GOLD     = rgb565(255, 198, 64);
constexpr uint16_t BELL_DARK     = rgb565(164, 112, 14);
constexpr uint16_t STAR_GOLD     = rgb565(255, 214, 90);
constexpr uint16_t STAR_WHITE    = rgb565(255, 250, 232);
constexpr uint16_t SEVEN_RED     = rgb565(222, 32, 40);
constexpr uint16_t SEVEN_SHADOW  = rgb565(120, 10, 16);
constexpr uint16_t BAR_BLACK     = rgb565(20, 20, 24);
constexpr uint16_t BAR_GOLD      = rgb565(224, 178, 64);
constexpr uint16_t DIAMOND_BLUE  = rgb565(74, 176, 238);
constexpr uint16_t DIAMOND_LIGHT = rgb565(198, 238, 255);
constexpr uint16_t DIAMOND_DARK  = rgb565(20, 92, 150);

// Feedback
constexpr uint16_t WIN_FLASH    = rgb565(255, 228, 90);
constexpr uint16_t WIN_TEXT     = rgb565(255, 246, 160);
constexpr uint16_t LOSE_TEXT    = rgb565(150, 150, 160);
constexpr uint16_t WARN_RED     = rgb565(230, 60, 60);

} // namespace Palette
