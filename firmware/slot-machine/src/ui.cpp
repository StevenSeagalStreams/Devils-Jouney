#include "ui.h"
#include "layout.h"
#include "palette.h"
#include "symbols.h"
#include <cmath>
#include <cstdio>

using namespace Layout;
using namespace Palette;

namespace Ui {

void drawBackground(TFT_eSprite &spr) {
    for (int row = 0; row < SCREEN_H; row++) {
        uint8_t mix = (uint8_t)((row * 255) / SCREEN_H);
        uint16_t c = blend565(CAB_MAROON, CAB_RED_LO, mix);
        spr.drawFastHLine(0, row, SCREEN_W, c);
    }
}

void drawHud(TFT_eSprite &spr, uint32_t credits, uint32_t bet, bool hudFlash) {
    spr.fillRect(0, 0, SCREEN_W, HUD_H, BAR_BLACK);
    spr.drawFastHLine(0, HUD_H - 1, SCREEN_W, GOLD_LO);

    char buf[16];
    spr.setTextDatum(ML_DATUM);
    spr.setTextColor(CREAM, BAR_BLACK);
    snprintf(buf, sizeof(buf), "CR%lu", (unsigned long)credits);
    spr.drawString(buf, 3, HUD_H / 2, 1);

    spr.setTextDatum(MR_DATUM);
    spr.setTextColor(hudFlash ? WIN_TEXT : GOLD, BAR_BLACK);
    snprintf(buf, sizeof(buf), "BET%lu", (unsigned long)bet);
    spr.drawString(buf, SCREEN_W - 3, HUD_H / 2, 1);
}

void drawBezel(TFT_eSprite &spr, uint32_t nowMs, uint8_t winGlow) {
    int x0 = reelX(0) - 2, y0 = REEL_Y - 2;
    int x1 = reelX(2) + REEL_W + 2, y1 = REEL_Y + REEL_H + 2;
    int w = x1 - x0, h = y1 - y0;

    spr.fillSmoothRoundRect(x0 - 1, y0 - 1, w + 2, h + 2, 5, GOLD_LO);
    spr.fillSmoothRoundRect(x0, y0, w, h, 4, GOLD);
    spr.drawFastHLine(x0 + 4, y0 + 1, w - 8, blend565(GOLD_HI, WHITE, winGlow));

    // twinkling marquee bulbs along the top edge
    const int kDots = 9;
    for (int i = 0; i < kDots; i++) {
        int dx = x0 + 4 + (int)((float)(w - 8) * i / (kDots - 1));
        float phase = (float)nowMs / 260.0f + i * 0.9f;
        uint8_t tw = (uint8_t)(90 + 90 * (0.5f + 0.5f * sinf(phase)));
        uint16_t c = blend565(GOLD_LO, GOLD_HI, tw);
        c = blend565(c, WHITE, winGlow / 2);
        spr.fillSmoothCircle(dx, y0, 1, c);
    }
}

void drawMessage(TFT_eSprite &spr, const char *text, uint16_t color) {
    spr.fillRect(0, MSG_Y, SCREEN_W, MSG_H, BAR_BLACK);
    spr.drawFastHLine(0, MSG_Y, SCREEN_W, GOLD_LO);
    spr.setTextDatum(MC_DATUM);
    spr.setTextColor(color, BAR_BLACK);
    spr.drawString(text, SCREEN_W / 2, MSG_Y + MSG_H / 2 + 1, 2);
}

void drawPayline(TFT_eSprite &spr, uint8_t glow) {
    if (glow == 0) return;
    int y = REEL_Y + REEL_H / 2;
    float width = 1.0f + 2.0f * (glow / 255.0f);
    uint16_t c = blend565(GOLD, WIN_FLASH, glow);
    spr.drawWideLine(reelX(0) + 2, y, reelX(2) + REEL_W - 2, y, width, c);
}

} // namespace Ui
