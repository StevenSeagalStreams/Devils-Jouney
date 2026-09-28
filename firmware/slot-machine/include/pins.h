#pragma once

// T-Dongle-S3 onboard peripherals not covered by the TFT_eSPI build flags.
// Source: LilyGO/T-Dongle-S3 examples/TFT_eSPI/TFT_eSPI.ino and examples/led.

#define PIN_BUTTON   0   // BOOT button, active LOW, internal pull-up
#define PIN_TFT_BL   38  // LCD backlight, active LOW on this board

#define PIN_LED_DATA 40  // APA102 (DotStar) data
#define PIN_LED_CLK  39  // APA102 (DotStar) clock
#define NUM_LEDS     1
