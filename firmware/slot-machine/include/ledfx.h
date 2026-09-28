#pragma once
#include <cstdint>

enum class LedMood : uint8_t { IDLE, SPINNING, WIN, JACKPOT, NO_CREDIT };

// Drives the onboard APA102 pixel. Kept tiny and self-contained so main.cpp
// just tells it the current mood every frame.
class LedFx {
public:
    void begin();
    void update(uint32_t nowMs, LedMood mood);

private:
    uint32_t moodStartMs_ = 0;
    LedMood lastMood_ = LedMood::IDLE;
};
