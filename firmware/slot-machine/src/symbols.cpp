#include "symbols.h"
#include "palette.h"
#include <cmath>

uint16_t blend565(uint16_t a, uint16_t b, uint8_t mixB) {
    int ar = (a >> 11) & 0x1F, ag = (a >> 5) & 0x3F, ab = a & 0x1F;
    int br = (b >> 11) & 0x1F, bg = (b >> 5) & 0x3F, bb = b & 0x1F;
    int rr = ar + (((br - ar) * mixB) >> 8);
    int rg = ag + (((bg - ag) * mixB) >> 8);
    int rb = ab + (((bb - ab) * mixB) >> 8);
    return (uint16_t)((rr << 11) | (rg << 5) | rb);
}

namespace {

using namespace Palette;

void drawCherry(TFT_eSprite &s, int cx, int cy, uint8_t glow) {
    uint16_t red = blend565(CHERRY_RED, WIN_FLASH, glow);
    int lx = cx - 7, ly = cy + 7;
    int rx = cx + 7, ry = cy + 5;

    // stems curving up to a shared point
    s.drawWideLine(cx - 1, cy - 15, cx - 4, cy - 2, 1.6f, LEAF_DARK);
    s.drawWideLine(cx - 4, cy - 2, lx, ly - 8, 1.6f, LEAF_DARK);
    s.drawWideLine(cx - 1, cy - 15, cx + 3, cy - 3, 1.6f, LEAF_DARK);
    s.drawWideLine(cx + 3, cy - 3, rx, ry - 8, 1.6f, LEAF_DARK);

    // leaf
    s.fillTriangle(cx - 1, cy - 15, cx - 9, cy - 12, cx - 2, cy - 8, LEAF_GREEN);
    s.drawWideLine(cx - 1, cy - 15, cx - 5, cy - 11, 1.0f, LEAF_DARK);

    // two cherries
    s.fillSmoothCircle(lx, ly, 8, red);
    s.fillSmoothCircle(rx, ry, 8, red);
    s.fillSmoothCircle(lx - 3, ly - 3, 2, blend565(CHERRY_SHINE, WHITE, glow));
    s.fillSmoothCircle(rx - 3, ry - 3, 2, blend565(CHERRY_SHINE, WHITE, glow));
}

void drawLemon(TFT_eSprite &s, int cx, int cy, uint8_t glow) {
    uint16_t yellow = blend565(LEMON_YELLOW, WIN_FLASH, glow);
    s.fillEllipse(cx, cy, 10, 14, LEMON_DARK);
    s.fillEllipse(cx, cy, 9, 13, yellow);
    s.fillTriangle(cx - 2, cy - 14, cx + 2, cy - 14, cx, cy - 18, LEMON_DARK);
    s.fillTriangle(cx - 2, cy + 14, cx + 2, cy + 14, cx, cy + 17, LEMON_DARK);
    s.fillEllipse(cx - 3, cy - 5, 3, 5, blend565(yellow, WHITE, 140));
}

void drawBell(TFT_eSprite &s, int cx, int cy, uint8_t glow) {
    uint16_t gold = blend565(BELL_GOLD, WIN_FLASH, glow);
    s.drawWideLine(cx, cy - 17, cx, cy - 13, 2.0f, GOLD_SHADOW);
    s.drawSmoothCircle(cx, cy - 13, 2, GOLD_SHADOW, WINDOW_BG_LO);
    s.fillSmoothCircle(cx, cy - 4, 10, BELL_DARK);
    s.fillSmoothRoundRect(cx - 12, cy - 5, 24, 11, 4, BELL_DARK);
    s.fillSmoothCircle(cx - 2, cy - 6, 8, gold);
    s.fillSmoothRoundRect(cx - 12, cy - 5, 21, 9, 4, gold);
    s.fillSmoothRoundRect(cx - 14, cy + 8, 28, 4, 2, blend565(BELL_GOLD, WHITE, glow));
    s.fillSmoothCircle(cx, cy + 15, 3, BELL_DARK);
    s.fillSmoothCircle(cx - 4, cy - 9, 2, blend565(STAR_WHITE, WHITE, glow));
}

void drawStar(TFT_eSprite &s, int cx, int cy, uint8_t glow) {
    uint16_t gold = blend565(STAR_GOLD, WIN_FLASH, glow);
    const float outerR = 14.5f, innerR = 6.0f;
    float px[10], py[10];
    for (int i = 0; i < 10; i++) {
        float r = (i % 2 == 0) ? outerR : innerR;
        float a = -kPi / 2.0f + i * kPi / 5.0f;
        px[i] = cx + r * cosf(a);
        py[i] = cy + r * sinf(a);
    }
    for (int i = 0; i < 10; i++) {
        int j = (i + 1) % 10;
        s.fillTriangle(cx, cy, (int)px[i], (int)py[i], (int)px[j], (int)py[j], gold);
    }
    s.fillSmoothCircle((int)px[0], (int)py[0] + 2, 2, blend565(STAR_WHITE, WHITE, glow));
}

void drawBar(TFT_eSprite &s, int cx, int cy, uint8_t glow) {
    uint16_t gold = blend565(BAR_GOLD, WIN_FLASH, glow);
    s.fillSmoothRoundRect(cx - 16, cy - 10, 32, 20, 4, gold);
    s.fillSmoothRoundRect(cx - 14, cy - 8, 28, 16, 3, BAR_BLACK);
    s.setTextDatum(MC_DATUM);
    s.setTextColor(gold, BAR_BLACK);
    s.drawString("BAR", cx, cy + 1, 2);
}

void drawSeven(TFT_eSprite &s, int cx, int cy, uint8_t glow) {
    uint16_t red = blend565(SEVEN_RED, WIN_FLASH, glow);
    s.setTextDatum(MC_DATUM);
    s.setTextColor(SEVEN_SHADOW, WINDOW_BG_LO);
    s.drawString("7", cx + 1, cy + 2, 4);
    s.setTextColor(red, WINDOW_BG_LO);
    s.drawString("7", cx, cy, 4);
}

void drawDiamond(TFT_eSprite &s, int cx, int cy, uint8_t glow) {
    uint16_t blue = blend565(DIAMOND_BLUE, WIN_FLASH, glow);
    s.fillTriangle(cx, cy - 15, cx - 12, cy - 1, cx + 12, cy - 1, DIAMOND_DARK);
    s.fillTriangle(cx, cy + 15, cx - 12, cy - 1, cx + 12, cy - 1, DIAMOND_DARK);
    s.fillTriangle(cx, cy - 12, cx - 9, cy - 1, cx + 9, cy - 1, blue);
    s.fillTriangle(cx, cy + 12, cx - 9, cy - 1, cx + 9, cy - 1, blend565(DIAMOND_DARK, blue, 180));
    s.fillTriangle(cx, cy - 12, cx - 4, cy - 3, cx + 2, cy - 5, blend565(DIAMOND_LIGHT, WHITE, glow));
}

} // namespace

void drawSymbol(TFT_eSprite &spr, SymbolId id, int cx, int cy, uint8_t glow) {
    switch (id) {
        case SymbolId::CHERRY:  drawCherry(spr, cx, cy, glow); break;
        case SymbolId::LEMON:   drawLemon(spr, cx, cy, glow); break;
        case SymbolId::BELL:    drawBell(spr, cx, cy, glow); break;
        case SymbolId::STAR:    drawStar(spr, cx, cy, glow); break;
        case SymbolId::BAR:     drawBar(spr, cx, cy, glow); break;
        case SymbolId::SEVEN:   drawSeven(spr, cx, cy, glow); break;
        case SymbolId::DIAMOND: drawDiamond(spr, cx, cy, glow); break;
        default: break;
    }
}
