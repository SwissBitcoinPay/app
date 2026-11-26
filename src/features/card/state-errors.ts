/*
 * The errors of the cards' states (states.ts), in a module of their own, without import: the card
 * payment's core (payment-core.ts) tells them apart in the iOS extension's engine too
 * (scripts/extension-engine.js).
 */

/** Thrown when no account is open: nothing of the cards can be derived. */
export class NoAccountError extends Error {
  constructor() {
    super("No account is open");
    this.name = "NoAccountError";
  }
}

/**
 * Thrown when a tap's counter is recorded (`tap: true`) but the device already keeps that counter
 * or a later one for the card, or other keys or another wallet of it: the tap was checked against
 * an older state, and another tap (the same one, sent again under another session) was recorded
 * since. Nothing is recorded: that tap pays nothing.
 */
export class TapAlreadySeenError extends Error {
  constructor() {
    super("The card's tap was already seen");
    this.name = "TapAlreadySeenError";
  }
}
