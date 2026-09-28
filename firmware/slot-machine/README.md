# T-Dongle-S3 Slot Machine

A hand-drawn, single-button casino slot machine for the [LilyGO T-Dongle-S3](https://github.com/Xinyuan-LilyGO/T-Dongle-S3) —
its 0.96" 160x80 screen becomes a three-reel cabinet, and the BOOT button is
the roll lever. No image assets: every symbol (cherry, lemon, bell, star,
BAR, seven, diamond) is drawn live with anti-aliased vector primitives, so
the whole game fits in a few hundred KB of flash and runs completely
offline, no Wi-Fi or companion app needed.

## Controls

The BOOT button is the entire interface:

| Action | Effect |
|---|---|
| single click | spin the reels (costs the current bet) |
| double click | cycle the bet: 1 → 5 → 10 → 25 → 1 ... |
| long press (~0.6s) | +100 bonus credits (never a dead end if you bust) |

## How it plays

Reels are decided the way a real slot machine decides them: the RNG picks
the outcome first (using the hardware TRNG via Arduino's `random()`), *then*
the reels are animated — accelerate, cruise, decelerate — to land on that
result. Reel 2 spins a little longer than reel 1, and reel 3 longer still,
for the classic tick... tick... tick stop.

Three symbols across the single payline pay out at the bet multiplied by
the symbol's tier (cherry 4x up to diamond 100x); any two matching pays
your stake back as a consolation "push." The onboard APA102 RGB LED
mirrors the game state: a slow amber breathe at idle, a fast rainbow spin
while the reels are moving, gold pulses on a win, and a full strobe for the
jackpot.

## Hardware

Nothing to wire up — it only uses what's already on the board:

| Peripheral | Pins |
|---|---|
| ST7735 LCD, 160x80 | MOSI 3, SCLK 5, CS 4, DC 2, RST 1, backlight 38 (active low) |
| APA102 RGB LED | data 40, clock 39 |
| Roll button | BOOT button, GPIO 0 |

These come from LilyGO's own `examples/TFT_eSPI` and `examples/led` sketches
in the T-Dongle-S3 repo, and `boards/dongles3.json` here is copied verbatim
from there too, so PlatformIO gets the right 16MB flash layout and
native-USB flags automatically.

## Build & flash

Requires [PlatformIO](https://platformio.org/) (the CLI, or the VS Code
extension):

```bash
cd firmware/slot-machine
pio run                 # build
pio run -t upload       # flash over USB (put the board in the dongle/USB port)
pio device monitor      # serial log, if you want it
```

First build downloads the ESP32-S3 toolchain and three libraries
(TFT_eSPI, FastLED, OneButton) from PlatformIO's registry, so it needs
internet access once; after that it's fully offline.

If `pio run -t upload` can't find the port, hold the board's BOOT button
while plugging it in to force bootloader mode, or pass the port explicitly
with `pio run -t upload --upload-port /dev/ttyACM0` (or `COMx` on Windows).

## Layout

```
platformio.ini          build config — TFT_eSPI is configured entirely via
                         build_flags, no hand-edited User_Setup.h needed
boards/dongles3.json     LilyGO's own board definition (16MB flash, no PSRAM)
include/pins.h            onboard peripheral pins not covered by TFT_eSPI's flags
include/layout.h          every screen coordinate, in one place
include/palette.h         RGB565 colour palette + the blend565() helper
include/symbols.h         SymbolId enum + drawSymbol() declaration
src/symbols.cpp           the seven hand-drawn casino icons
include/reel.h            a single reel: strip, spin physics, landing bounce
src/reel.cpp
include/slotmachine.h     credits, bet, paytable, RNG-first outcome decision
src/slotmachine.cpp
include/ledfx.h           APA102 mood lighting (idle/spin/win/jackpot)
src/ledfx.cpp
include/ui.h              HUD bar, gold bezel with twinkling bulbs, message bar
src/ui.cpp
src/main.cpp              wires it all together: button callbacks, game
                          state machine, ~30fps sprite-buffered render loop
```

## Tuning it

* **Odds / paytable** — `src/reel.cpp`'s `STRIP[]` sets each symbol's real
  odds (repeat it more often to make it more common); `src/slotmachine.cpp`'s
  `kTable[]` must be kept in sync (it mirrors those odds for the RNG) and
  `payoutMultiplier()` sets what each triple pays.
* **Spin feel** — `include/reel.h`'s `tAccelMs_` / `tDecelMs_` / `vMax_`
  control the accelerate/cruise/decelerate motion profile.
* **Colours** — everything lives in `include/palette.h`.
* **Screen geometry** — everything lives in `include/layout.h`; change it and
  the HUD, bezel and all three reels follow automatically.

## A note on testing

This was built and reviewed against LilyGO's own T-Dongle-S3 example code
and schematics (pin numbers, display driver/tab config, LED chipset) and
the exact library APIs it depends on (TFT_eSPI's smooth-drawing calls,
FastLED's APA102 controller, OneButton's callback API), all cross-checked
against the real library sources. It has **not** been compiled or run on
real hardware — this sandbox's network policy blocks PlatformIO's package
registry, so `pio run` couldn't be exercised here. Please flash it and let
me know if anything misbehaves; the usual suspects for a first bring-up are
the display staying blank (check `TFT_RST`/backlight wiring assumptions
above, both onboard) or a `pio run` dependency resolution hiccup.
