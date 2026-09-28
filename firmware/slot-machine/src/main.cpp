// T-Dongle-S3 Slot Machine
//
// The BOOT button is the whole interface:
//   single click  -> spin (costs the current bet)
//   double click  -> change the bet (1 / 5 / 10 / 25)
//   long press    -> +100 bonus credits, any time you're not spinning
//
// Outcomes are decided the way a real slot machine decides them: the result
// is picked first (weighted RNG), then the reels are animated to land on
// it, staggered reel-to-reel for the classic tick...tick...tick stop.

#include <Arduino.h>
#include <TFT_eSPI.h>
#include <OneButton.h>
#include <cstdio>
#include <cstring>
#include <cmath>

#include "pins.h"
#include "layout.h"
#include "palette.h"
#include "symbols.h"
#include "reel.h"
#include "slotmachine.h"
#include "ledfx.h"
#include "ui.h"

namespace {

TFT_eSPI tft;
TFT_eSprite frame(&tft);
OneButton button(PIN_BUTTON, true, true);

Reel reels[3];
SlotMachine game;
LedFx ledfx;

SpinResult pendingResult;
uint32_t resultStartMs = 0;
constexpr uint32_t kResultHoldMs = 2200;
constexpr uint32_t kJackpotHoldMs = 3200;

char transientMsg[24] = "";
uint16_t transientColor = Palette::CREAM;
uint32_t transientUntilMs = 0;

void setTransient(const char *msg, uint16_t color, uint32_t durationMs) {
    strncpy(transientMsg, msg, sizeof(transientMsg) - 1);
    transientMsg[sizeof(transientMsg) - 1] = '\0';
    transientColor = color;
    transientUntilMs = millis() + durationMs;
}

void beginSpin() {
    if (game.phase != GamePhase::IDLE) return;
    if (!game.canSpin()) {
        setTransient("NOT ENOUGH CREDITS", Palette::WARN_RED, 900);
        return;
    }
    pendingResult = game.decideSpin();
    uint32_t now = millis();
    reels[0].startSpin(pendingResult.symbols[0], now, 0, 2);
    reels[1].startSpin(pendingResult.symbols[1], now, 120, 3);
    reels[2].startSpin(pendingResult.symbols[2], now, 240, 4);
    game.phase = GamePhase::SPINNING;
}

void onClick() { beginSpin(); }

void onDoubleClick() {
    if (game.phase != GamePhase::IDLE) return;
    game.cycleBet();
    char buf[24];
    snprintf(buf, sizeof(buf), "BET SET TO %lu", (unsigned long)game.bet());
    setTransient(buf, Palette::GOLD_HI, 800);
}

void onLongPress() {
    if (game.phase != GamePhase::IDLE) return;
    game.grantBonus();
    setTransient("+100 BONUS CREDITS", Palette::WIN_TEXT, 1000);
}

uint8_t winGlow(uint32_t nowMs) {
    if (game.phase != GamePhase::RESULT || pendingResult.tier == WinTier::NONE) return 0;
    float base = (pendingResult.tier == WinTier::JACKPOT) ? 255.0f
                : (pendingResult.tier == WinTier::TRIPLE)  ? 200.0f
                                                            : 120.0f;
    float phase = (float)(nowMs - resultStartMs) / 220.0f * kTwoPi;
    float m = 0.5f + 0.5f * sinf(phase);
    return (uint8_t)(base * m);
}

LedMood currentMood(uint32_t nowMs) {
    if (game.phase == GamePhase::SPINNING) return LedMood::SPINNING;
    if (game.phase == GamePhase::RESULT) {
        if (pendingResult.tier == WinTier::JACKPOT) return LedMood::JACKPOT;
        if (pendingResult.tier != WinTier::NONE) return LedMood::WIN;
    }
    if (nowMs < transientUntilMs && transientColor == Palette::WARN_RED) return LedMood::NO_CREDIT;
    return LedMood::IDLE;
}

void resultMessage(char *buf, size_t n, uint16_t &color) {
    switch (pendingResult.tier) {
        case WinTier::JACKPOT:
            snprintf(buf, n, "JACKPOT!! +%lu", (unsigned long)pendingResult.payout);
            color = Palette::WIN_TEXT;
            break;
        case WinTier::TRIPLE:
            snprintf(buf, n, "WINNER +%lu", (unsigned long)pendingResult.payout);
            color = Palette::WIN_TEXT;
            break;
        case WinTier::PAIR:
            snprintf(buf, n, "PUSH +%lu", (unsigned long)pendingResult.payout);
            color = Palette::GOLD_HI;
            break;
        default:
            snprintf(buf, n, "TRY AGAIN");
            color = Palette::LOSE_TEXT;
            break;
    }
}

} // namespace

void setup() {
    button.attachClick(onClick);
    button.attachDoubleClick(onDoubleClick);
    button.attachLongPressStart(onLongPress);
    button.setPressMs(650);
    button.setClickMs(220); // keep the spin button snappy; double-click still works, just quicker

    pinMode(PIN_TFT_BL, OUTPUT);
    digitalWrite(PIN_TFT_BL, HIGH); // backlight off until the first frame is ready

    tft.init();
    tft.setRotation(1);
    tft.fillScreen(TFT_BLACK);

    frame.setColorDepth(16);
    frame.createSprite(Layout::SCREEN_W, Layout::SCREEN_H);

    // Slightly different rest symbols so the machine doesn't boot looking
    // like it already paid out a triple.
    reels[0].begin(Layout::reelX(0), Layout::REEL_Y, Layout::REEL_W, Layout::REEL_H, 0);
    reels[1].begin(Layout::reelX(1), Layout::REEL_Y, Layout::REEL_W, Layout::REEL_H, 7);
    reels[2].begin(Layout::reelX(2), Layout::REEL_Y, Layout::REEL_W, Layout::REEL_H, 14);

    game.begin();
    ledfx.begin();

    digitalWrite(PIN_TFT_BL, LOW); // backlight on
}

void loop() {
    uint32_t now = millis();
    button.tick();

    for (auto &r : reels) r.update(now);

    if (game.phase == GamePhase::SPINNING &&
        reels[0].isDone() && reels[1].isDone() && reels[2].isDone()) {
        game.applyResult(pendingResult);
        game.phase = GamePhase::RESULT;
        resultStartMs = now;
    }

    if (game.phase == GamePhase::RESULT) {
        uint32_t hold = (pendingResult.tier == WinTier::JACKPOT) ? kJackpotHoldMs : kResultHoldMs;
        if (now - resultStartMs > hold) {
            game.phase = GamePhase::IDLE;
        }
    }

    static uint32_t lastFrameMs = 0;
    if (now - lastFrameMs < 33) return; // ~30 fps
    lastFrameMs = now;

    uint8_t glow = winGlow(now);
    bool hudFlash = now < transientUntilMs;

    Ui::drawBackground(frame);
    Ui::drawHud(frame, game.credits(), game.bet(), hudFlash);
    Ui::drawBezel(frame, now, glow);
    for (auto &r : reels) r.draw(frame, glow);
    if (pendingResult.tier == WinTier::TRIPLE || pendingResult.tier == WinTier::JACKPOT) {
        Ui::drawPayline(frame, glow);
    }

    if (now < transientUntilMs) {
        Ui::drawMessage(frame, transientMsg, transientColor);
    } else if (game.phase == GamePhase::SPINNING) {
        Ui::drawMessage(frame, "GOOD LUCK...", Palette::CREAM);
    } else if (game.phase == GamePhase::RESULT) {
        char buf[24];
        uint16_t color;
        resultMessage(buf, sizeof(buf), color);
        Ui::drawMessage(frame, buf, color);
    } else if (!game.canSpin()) {
        Ui::drawMessage(frame, "HOLD FOR BONUS", Palette::WARN_RED);
    } else {
        Ui::drawMessage(frame, "PRESS TO SPIN", Palette::CREAM);
    }

    frame.pushSprite(0, 0);
    ledfx.update(now, currentMood(now));
}
