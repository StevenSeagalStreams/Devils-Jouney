#pragma once

// Every screen coordinate in one place, sized for the T-Dongle-S3's 160x80
// landscape panel. Change these and the HUD, bezel and reels all follow.
namespace Layout {
constexpr int SCREEN_W = 160;
constexpr int SCREEN_H = 80;

constexpr int HUD_H = 12;   // top bar: CREDITS / BET
constexpr int MSG_H = 17;   // bottom bar: status / win message

constexpr int REEL_Y = HUD_H + 1;                 // 13
constexpr int REEL_H = SCREEN_H - MSG_H - REEL_Y; // 50

constexpr int BEZEL_MARGIN = 3;
constexpr int REEL_GAP = 3;
constexpr int REEL_AREA_X = BEZEL_MARGIN;
constexpr int REEL_AREA_W = SCREEN_W - 2 * BEZEL_MARGIN;
constexpr int REEL_W = (REEL_AREA_W - 2 * REEL_GAP) / 3;

inline int reelX(int i) { return REEL_AREA_X + i * (REEL_W + REEL_GAP); }

constexpr int MSG_Y = SCREEN_H - MSG_H;
} // namespace Layout
