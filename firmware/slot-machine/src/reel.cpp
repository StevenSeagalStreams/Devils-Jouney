#include "reel.h"
#include "palette.h"
#include <cmath>

namespace {

// The virtual reel strip. Repeats set each symbol's odds: cherries are
// common and cheap, the diamond is a single-in-24 jackpot symbol. Order is
// interleaved by hand so the same symbol never clumps together.
constexpr SymbolId STRIP[] = {
    SymbolId::CHERRY, SymbolId::LEMON,  SymbolId::BELL,  SymbolId::CHERRY,
    SymbolId::STAR,   SymbolId::LEMON,  SymbolId::BAR,   SymbolId::CHERRY,
    SymbolId::BELL,   SymbolId::LEMON,  SymbolId::SEVEN, SymbolId::CHERRY,
    SymbolId::STAR,   SymbolId::LEMON,  SymbolId::BELL,  SymbolId::BAR,
    SymbolId::CHERRY, SymbolId::DIAMOND, SymbolId::LEMON, SymbolId::BAR,
    SymbolId::BELL,   SymbolId::CHERRY, SymbolId::STAR,  SymbolId::SEVEN,
};
constexpr int kStripLen = sizeof(STRIP) / sizeof(STRIP[0]);

SymbolId symbolAt(int index) {
    int m = index % kStripLen;
    if (m < 0) m += kStripLen;
    return STRIP[m];
}

} // namespace

void Reel::begin(int x, int y, int w, int h, int restIndex) {
    x_ = x; y_ = y; w_ = w; h_ = h;
    state_ = State::IDLE;
    startIndex_ = restIndex;
    landIndex_ = restIndex;
    distance_ = 0;
}

void Reel::startSpin(SymbolId target, uint32_t nowMs, uint32_t startDelayMs, int loops) {
    int base = landIndex_ + loops * kStripLen;
    int idx = base;
    while (symbolAt(idx) != target) idx++;

    startIndex_ = landIndex_;
    landIndex_ = idx;
    distTotal_ = (float)(landIndex_ - startIndex_) * kCellH;

    distAccel_ = 0.5f * vMax_ * tAccelMs_;
    float distDecel = 0.5f * vMax_ * tDecelMs_;
    float cruiseDist = distTotal_ - distAccel_ - distDecel;
    if (cruiseDist < 0) cruiseDist = 0; // shouldn't happen with loops >= 1
    distCruise_ = cruiseDist;
    tCruiseMs_ = (uint32_t)(cruiseDist / vMax_);

    spinStartMs_ = nowMs + startDelayMs;
    distance_ = 0;
    state_ = State::WAITING;
}

float Reel::distanceAt(uint32_t elapsedMs) const {
    if (elapsedMs <= tAccelMs_) {
        float t = (float)elapsedMs;
        return vMax_ * t * t / (2.0f * tAccelMs_);
    }
    uint32_t e2 = elapsedMs - tAccelMs_;
    if (e2 <= tCruiseMs_) {
        return distAccel_ + vMax_ * e2;
    }
    uint32_t e3 = e2 - tCruiseMs_;
    if (e3 <= tDecelMs_) {
        float t = (float)e3;
        return distAccel_ + distCruise_ + vMax_ * t - (vMax_ * t * t) / (2.0f * tDecelMs_);
    }
    return distTotal_;
}

void Reel::update(uint32_t nowMs) {
    lastNowMs_ = nowMs;
    if (state_ == State::IDLE || state_ == State::DONE) return;

    if (nowMs < spinStartMs_) {
        state_ = State::WAITING;
        return;
    }

    uint32_t elapsed = nowMs - spinStartMs_;
    uint32_t totalMs = tAccelMs_ + tCruiseMs_ + tDecelMs_;

    if (elapsed <= tAccelMs_) state_ = State::ACCEL;
    else if (elapsed - tAccelMs_ <= tCruiseMs_) state_ = State::CRUISE;
    else state_ = State::DECEL;

    distance_ = distanceAt(elapsed);

    if (elapsed >= totalMs) {
        distance_ = distTotal_;
        state_ = State::DONE;
        landedAtMs_ = nowMs;
    }
}

void Reel::draw(TFT_eSprite &spr, uint8_t glow) {
    int centerY = y_ + h_ / 2;

    // a small elastic settle right after the reel lands, purely cosmetic
    float renderDistance = distance_;
    if (state_ == State::DONE) {
        float age = (float)(lastNowMs_ - landedAtMs_);
        if (age < 160.0f) {
            renderDistance += 5.0f * expf(-age / 45.0f) * sinf(age / 15.5f);
        }
    }

    int baseK = startIndex_ + (int)(renderDistance / (float)kCellH);

    // background gradient for the reel window
    for (int row = 0; row < h_; row++) {
        uint8_t mix = (uint8_t)((row * 255) / h_);
        uint16_t c = blend565(Palette::WINDOW_BG_LO, Palette::WINDOW_BG_HI, mix);
        spr.drawFastHLine(x_, y_ + row, w_, c);
    }

    spr.setViewport(x_, y_, w_, h_, false);
    for (int k = baseK - 1; k <= baseK + 2; k++) {
        float screenY = centerY + (float)(k - startIndex_) * kCellH - renderDistance;
        if (screenY < y_ - kCellH * 0.7f || screenY > y_ + h_ + kCellH * 0.7f) continue;
        drawSymbol(spr, symbolAt(k), x_ + w_ / 2, (int)screenY, glow);
    }
    spr.resetViewport();

    // subtle top/bottom vignette so symbols fade into the bezel
    spr.fillRect(x_, y_, w_, 3, Palette::WINDOW_BG_LO);
    spr.fillRect(x_, y_ + h_ - 3, w_, 3, Palette::WINDOW_BG_LO);
}
