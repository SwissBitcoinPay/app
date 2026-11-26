import {
  declineMessage,
  MAX_DECLINE_MESSAGE_LENGTH,
  type CardDeclineCause
} from "@/features/card/decline-message";
import i18n from "@/i18n";
import { LANGUAGES } from "@/i18n/languages";

// Every cause the phone answers a point of sale with (payment.ts): its failures, and the holder's
// own answers.
const CAUSES: readonly CardDeclineCause[] = [
  "unreachable",
  "ended",
  "invalidInvoice",
  "noAmount",
  "outOfBounds",
  "otherNetwork",
  "expired",
  "suspended",
  "aboveLimit",
  "alreadyPaid",
  "dayLimit",
  "hourLimit",
  "notYourCard",
  "replayed",
  "unlock",
  "insufficientBalance",
  "sendFailed",
  "uncertain",
  "otherInvoice",
  "settled",
  "newPayee",
  "unidentifiedPayee",
  "unconfirmed",
  "late",
  "newerApp",
  "failed",
  "refused",
  "closed",
  "superseded"
];

describe("declineMessage", () => {
  test("every cause has a sentence in every language, within what the card relay forwards", () => {
    for (const language of LANGUAGES) {
      const t = i18n.getFixedT(language);
      for (const cause of CAUSES) {
        const message = declineMessage(cause, t);
        // Not a key left untranslated, nor an empty answer.
        expect(message).not.toMatch(/^card\.decline\./);
        expect(message.trim()).not.toBe("");
        // String length counts UTF-16 code units, as the relay cuts.
        expect(message.length).toBeLessThanOrEqual(MAX_DECLINE_MESSAGE_LENGTH);
      }
    }
  });

  test("written in the language of the holder's phone", () => {
    expect(declineMessage("insufficientBalance", i18n.getFixedT("it"))).toBe(
      "Saldo della carta insufficiente."
    );
    expect(declineMessage("insufficientBalance", i18n.getFixedT("de"))).toBe(
      "Guthaben der Karte nicht ausreichend."
    );
    expect(declineMessage("newPayee", i18n.getFixedT("en"))).toBe(
      "New merchant: the cardholder must approve it in their sattle.me app, then present the card again."
    );
  });

  test("causes of the same sense share their sentence", () => {
    const t = i18n.getFixedT("fr");
    expect(declineMessage("unlock", t)).toBe(declineMessage("closed", t));
    expect(declineMessage("otherNetwork", t)).toBe(declineMessage("invalidInvoice", t));
    expect(declineMessage("settled", t)).toBe(declineMessage("alreadyPaid", t));
    expect(declineMessage("replayed", t)).toBe(declineMessage("notYourCard", t));
    // The payment may still arrive: not told as a failure.
    expect(declineMessage("uncertain", t)).not.toBe(declineMessage("sendFailed", t));
  });
});
