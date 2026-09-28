#pragma once
#include <TFT_eSPI.h>
#include <cstdint>

enum class SymbolId : uint8_t {
    CHERRY = 0,
    LEMON,
    BELL,
    STAR,
    BAR,
    SEVEN,
    DIAMOND,
    COUNT
};

// Every symbol is hand-drawn with TFT_eSPI's anti-aliased "smooth" primitives
// (no image assets, so the whole game fits in a few KB of flash) inside a
// roughly 34x34 box centred on (cx, cy). `glow` is 0..255 and brightens rim
// highlights for the win-flash animation.
void drawSymbol(TFT_eSprite &spr, SymbolId id, int cx, int cy, uint8_t glow = 0);

// Blend two RGB565 colours (for the glow highlight and shadow fades).
uint16_t blend565(uint16_t a, uint16_t b, uint8_t mixB);
