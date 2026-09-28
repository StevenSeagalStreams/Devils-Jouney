#pragma once
#include <TFT_eSPI.h>
#include <cstdint>

namespace Ui {

void drawBackground(TFT_eSprite &spr);
void drawHud(TFT_eSprite &spr, uint32_t credits, uint32_t bet, bool hudFlash);
void drawBezel(TFT_eSprite &spr, uint32_t nowMs, uint8_t winGlow);
void drawMessage(TFT_eSprite &spr, const char *text, uint16_t color);

// Flashing gold line drawn over a payline once a win lands.
void drawPayline(TFT_eSprite &spr, uint8_t glow);

} // namespace Ui
