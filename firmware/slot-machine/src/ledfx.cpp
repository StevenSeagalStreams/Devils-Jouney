#include "ledfx.h"
#include "pins.h"
#include "palette.h"
#include <FastLED.h>
#include <cmath>

namespace {
CRGB leds[NUM_LEDS];
}

void LedFx::begin() {
    FastLED.addLeds<APA102, PIN_LED_DATA, PIN_LED_CLK, BGR>(leds, NUM_LEDS);
    FastLED.setBrightness(180);
    leds[0] = CRGB::Black;
    FastLED.show();
}

void LedFx::update(uint32_t nowMs, LedMood mood) {
    if (mood != lastMood_) {
        lastMood_ = mood;
        moodStartMs_ = nowMs;
    }
    uint32_t elapsed = nowMs - moodStartMs_;

    switch (mood) {
        case LedMood::IDLE: {
            float phase = (float)(nowMs % 3000) / 3000.0f * kTwoPi;
            uint8_t val = (uint8_t)(40 + 45 * (0.5f + 0.5f * sinf(phase)));
            leds[0] = CHSV(32, 255, val); // warm amber breathing
            break;
        }
        case LedMood::SPINNING: {
            uint8_t hue = (uint8_t)((nowMs / 3) % 256);
            leds[0] = CHSV(hue, 230, 220); // fast rainbow chase feel
            break;
        }
        case LedMood::WIN: {
            float phase = (float)(elapsed % 300) / 300.0f * kTwoPi;
            uint8_t val = (uint8_t)(70 + 180 * (0.5f + 0.5f * sinf(phase)));
            leds[0] = CHSV(38, 235, val); // gold pulses
            break;
        }
        case LedMood::JACKPOT: {
            uint8_t hue = (uint8_t)((nowMs / 2) % 256);
            uint8_t val = ((nowMs / 60) % 2 == 0) ? 255 : 40; // strobe
            leds[0] = CHSV(hue, 255, val);
            break;
        }
        case LedMood::NO_CREDIT: {
            float phase = (float)(elapsed % 250) / 250.0f * kTwoPi;
            uint8_t val = (uint8_t)(30 + 120 * fabsf(sinf(phase)));
            leds[0] = CHSV(0, 255, val); // dim red pulse
            break;
        }
    }
    FastLED.show();
}
