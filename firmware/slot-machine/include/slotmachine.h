#pragma once
#include <cstdint>
#include "symbols.h"

enum class GamePhase : uint8_t {
    IDLE,       // waiting for a spin
    SPINNING,   // reels in motion
    RESULT,     // reels stopped, payout just settled, showing message
};

enum class WinTier : uint8_t { NONE, PAIR, TRIPLE, JACKPOT };

struct SpinResult {
    SymbolId symbols[3];
    WinTier tier = WinTier::NONE;
    uint32_t payout = 0;
};

// Owns credits, bet size and the paytable. Knows nothing about drawing or
// the button — main.cpp wires those to it.
class SlotMachine {
public:
    void begin();

    bool canSpin() const { return credits_ >= bet_; }
    void cycleBet();            // called on double-click
    void grantBonus();          // called on long-press when short on credits

    // Pre-decides the outcome (this is how real slot machines work: the
    // result is chosen first, then the reels are animated to land on it).
    SpinResult decideSpin();
    void applyResult(const SpinResult &r); // deduct bet, add payout

    uint32_t credits() const { return credits_; }
    uint32_t bet() const { return bet_; }
    GamePhase phase = GamePhase::IDLE;

private:
    uint32_t credits_ = 100;
    uint32_t bet_ = 5;
    static constexpr uint32_t kBets[] = {1, 5, 10, 25};
    uint8_t betIndex_ = 1;
};

uint32_t payoutMultiplier(SymbolId id); // triple-match multiplier for a symbol
