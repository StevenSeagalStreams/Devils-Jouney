#include "slotmachine.h"
#include <Arduino.h> // random() — on ESP32 this is backed by the hardware RNG
#include <algorithm>

namespace {

struct Weighted { SymbolId id; uint32_t weight; };

// Mirrors the visual reel strip's odds (reel.cpp) so what you see matches
// what you get: cherries common, diamond a 1-in-24 jackpot symbol.
constexpr Weighted kTable[] = {
    {SymbolId::CHERRY, 6}, {SymbolId::LEMON, 5}, {SymbolId::BELL, 4},
    {SymbolId::STAR, 3},   {SymbolId::BAR, 3},    {SymbolId::SEVEN, 2},
    {SymbolId::DIAMOND, 1},
};
constexpr uint32_t kTotalWeight = 6 + 5 + 4 + 3 + 3 + 2 + 1;

SymbolId pickWeightedSymbol() {
    uint32_t r = (uint32_t)random((long)kTotalWeight);
    for (const auto &w : kTable) {
        if (r < w.weight) return w.id;
        r -= w.weight;
    }
    return SymbolId::CHERRY; // unreachable
}

constexpr uint32_t kMaxCredits = 9999;

} // namespace

uint32_t payoutMultiplier(SymbolId id) {
    switch (id) {
        case SymbolId::DIAMOND: return 100;
        case SymbolId::SEVEN:   return 50;
        case SymbolId::BAR:     return 20;
        case SymbolId::STAR:    return 15;
        case SymbolId::BELL:    return 10;
        case SymbolId::LEMON:   return 6;
        case SymbolId::CHERRY:  return 4;
        default:                return 0;
    }
}

void SlotMachine::begin() {
    credits_ = 100;
    betIndex_ = 1;
    bet_ = kBets[betIndex_];
    phase = GamePhase::IDLE;
}

void SlotMachine::cycleBet() {
    if (phase != GamePhase::IDLE) return;
    betIndex_ = (betIndex_ + 1) % (sizeof(kBets) / sizeof(kBets[0]));
    bet_ = kBets[betIndex_];
}

void SlotMachine::grantBonus() {
    credits_ = std::min(credits_ + 100, kMaxCredits);
}

SpinResult SlotMachine::decideSpin() {
    SpinResult r;
    for (auto &s : r.symbols) s = pickWeightedSymbol();

    bool allThree = (r.symbols[0] == r.symbols[1]) && (r.symbols[1] == r.symbols[2]);
    bool anyPair = !allThree && (r.symbols[0] == r.symbols[1] ||
                                  r.symbols[1] == r.symbols[2] ||
                                  r.symbols[0] == r.symbols[2]);

    if (allThree) {
        r.tier = (r.symbols[0] == SymbolId::DIAMOND) ? WinTier::JACKPOT : WinTier::TRIPLE;
        r.payout = bet_ * payoutMultiplier(r.symbols[0]);
    } else if (anyPair) {
        r.tier = WinTier::PAIR;
        r.payout = bet_; // stake back — keeps a near-miss from being a total loss
    } else {
        r.tier = WinTier::NONE;
        r.payout = 0;
    }
    return r;
}

void SlotMachine::applyResult(const SpinResult &r) {
    credits_ -= bet_;
    credits_ = std::min(credits_ + r.payout, kMaxCredits);
}
