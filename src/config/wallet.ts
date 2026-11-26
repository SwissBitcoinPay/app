/*
 * Settings of the wallet's payments shared by its screens and the card payments
 * (src/features/wallet/send/useSend.ts, src/features/card/payment-core.ts). No import: the card
 * payment's core runs in the iOS extension's engine too (scripts/extension-engine.js).
 */

/** How often a payment that left pending is read again, and for how long at most. */
export const FOLLOW_INTERVAL_MS = 3000;
export const FOLLOW_FOR_MS = 120_000;
