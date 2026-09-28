#pragma once
#include <TFT_eSPI.h>
#include "symbols.h"

// A single slot reel: an endless weighted strip of symbols, animated with a
// deterministic accelerate -> cruise -> decelerate motion profile so it
// always lands exactly on the pre-decided result symbol, however far away
// that lands on the strip.
class Reel {
public:
    void begin(int x, int y, int w, int h, int restIndex = 0);

    // Kick off a spin that will land on `target`. `startDelayMs` staggers
    // when this reel starts moving and `loops` sets how many full trips
    // around the strip it makes before landing — reel 2 and 3 get more
    // loops than reel 1, so they naturally keep spinning (and stop) later
    // for that classic tick...tick...tick suspense.
    void startSpin(SymbolId target, uint32_t nowMs, uint32_t startDelayMs, int loops);

    void update(uint32_t nowMs);
    void draw(TFT_eSprite &spr, uint8_t glow = 0);

    bool isSpinning() const { return state_ != State::IDLE && state_ != State::DONE; }
    bool isDone() const { return state_ == State::DONE; }

private:
    enum class State { IDLE, WAITING, ACCEL, CRUISE, DECEL, DONE };

    static constexpr int kCellH = 44;

    int x_ = 0, y_ = 0, w_ = 0, h_ = 0;
    State state_ = State::IDLE;

    uint32_t landedAtMs_ = 0;    // when this spin settled, for the little landing bounce
    uint32_t lastNowMs_ = 0;

    uint32_t spinStartMs_ = 0;   // when ACCEL begins (after the stagger delay)
    uint32_t tAccelMs_ = 150;
    uint32_t tCruiseMs_ = 0;
    uint32_t tDecelMs_ = 480;
    float vMax_ = 1.6f;          // px per ms

    float distAccel_ = 0, distCruise_ = 0, distTotal_ = 0;
    int startIndex_ = 0;         // strip index shown before this spin began
    float distance_ = 0;         // px travelled along the strip so far

    float distanceAt(uint32_t elapsedMs) const;
    int landIndex_ = 0;
};
