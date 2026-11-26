import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { getDeviceLocale } from "@/lib/locale/device";
import { formatInteger } from "@/lib/locale/format";
import { currencyDigits, formatBtc } from "@/lib/terminal/amount";
import { formatSignedFiat, satsToFiatMinor } from "@/features/wallet/model";
import { useRate } from "@/features/terminal/useRate";

import {
  subscribeLegacyTransfers,
  transferLegacyWallet,
  transferTypedWords,
  typedLegacyWords,
  type LegacyTransferOutcome
} from "./transfer";

/** A transfer of the v2 wallet (transfer.ts) as a screen follows it. */
export type LegacyTransferPhase =
  | { phase: "idle" }
  /** The account's wallet connects, then the biometric prompt, the look, the transaction. */
  | { phase: "running" }
  | { phase: "done"; outcome: LegacyTransferOutcome }
  /**
   * The words typed ("Type my 12 words") are no wallet's (`words`: nothing connected nor asked),
   * not one the v2 server lists (`mismatch`), or a wallet's nothing ever paid (`unused`): not the
   * v2 wallet's, nothing kept.
   */
  | { phase: "invalid"; reason: "words" | "mismatch" | "unused" };

/**
 * Runs the v2 wallet's transfer from a screen (the migration's last screen, "Wallet", "Type my 12
 * words"): `openWallet` connects the account's wallet and says whether it is (the screen's own
 * connection, useAccountWallet), then transferLegacyWallet, the system's biometric prompt in the
 * app's language, or, given the words typed (`startTyped`), transferTypedWords. One at a time; an
 * outcome left on a screen that went is not shown.
 */
export function useLegacyTransfer(openWallet: () => Promise<boolean>) {
  const { t } = useTranslation();
  const [state, setState] = useState<LegacyTransferPhase>({ phase: "idle" });
  const running = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // A transfer another screen ran ("Type my 12 words" over this one) that moved or settled the
  // money: shown here too, never this screen's older outcome ("unreadable" while the money left).
  // Not one that failed or took no wallet: that screen says it, this one's stands.
  useEffect(
    () =>
      subscribeLegacyTransfers((outcome) => {
        if (running.current) return;
        if (["failed", "unused", "mismatch"].includes(outcome.status)) return;
        setState({ phase: "done", outcome });
      }),
    []
  );

  // `words`: typed (startTyped), else read from the v2 app's keychain.
  const run = useCallback(
    async (words: string[] | null) => {
      running.current = true;
      setState({ phase: "running" });
      try {
        let outcome: LegacyTransferOutcome;
        if (!(await openWallet())) {
          words?.fill("");
          outcome = { status: "failed" };
        } else if (words) {
          outcome = await transferTypedWords(words);
        } else {
          outcome = await transferLegacyWallet({
            title: t("migration.transfer.prompt"),
            cancel: t("common.cancel")
          });
        }
        if (!mounted.current) return;
        setState(
          outcome.status === "unused" || outcome.status === "mismatch"
            ? { phase: "invalid", reason: outcome.status }
            : { phase: "done", outcome }
        );
      } finally {
        running.current = false;
      }
    },
    [openWallet, t]
  );

  return {
    state,
    /** With the words on this device, behind its biometrics. */
    start: () => {
      if (!running.current) void run(null);
    },
    /**
     * With the words its owner typed: whether they are a wallet's words (typedLegacyWords) and the
     * transfer started. Words of no wallet connect nothing (`invalid`).
     */
    startTyped: (typed: string): boolean => {
      if (running.current) return false;
      const words = typedLegacyWords(typed);
      if (!words) {
        setState({ phase: "invalid", reason: "words" });
        return false;
      }
      void run(words);
      return true;
    }
  };
}

/**
 * An amount of bitcoin as the migration says it, in words a merchant reads: "0.0042 BTC (about 312
 * CHF)" in the device's number format, the francs at the rate of the hour of `currency` (the point
 * of sale's), without them while it is not known (never a stale rate). Exact: from the integer
 * sats.
 */
export function useMigrationAmount(currency: string) {
  const { t } = useTranslation();
  const [languageTag] = useState(() => getDeviceLocale().languageTag);
  const { rate } = useRate(currency);
  const digits = currencyDigits(currency);
  return (sats: bigint): string => {
    const btc = `${formatBtc(sats, languageTag)} BTC`;
    if (rate === undefined) return btc;
    const fiat = formatSignedFiat(satsToFiatMinor(sats, digits, rate), digits, languageTag, "");
    return t("migration.amount", { btc, fiat: `${fiat} ${currency}` });
  };
}

/**
 * An amount of the v2 wallet as the panel that offers its transfer says it: "84,210 sats" in the
 * device's number format, and "about CHF 52.40" at the rate
 * of the hour of `currency`, null while it is not known (never a stale rate). Exact: from the
 * integer sats.
 */
export function useMigrationSats(currency: string) {
  const { t } = useTranslation();
  const [languageTag] = useState(() => getDeviceLocale().languageTag);
  const { rate } = useRate(currency);
  const digits = currencyDigits(currency);
  return (sats: bigint): { sats: string; fiat: string | null } => ({
    sats: t("migration.transfer.sats", { sats: formatInteger(sats, languageTag) }),
    fiat:
      rate === undefined
        ? null
        : t("migration.transfer.fiat", {
            fiat: `${formatSignedFiat(satsToFiatMinor(sats, digits, rate), digits, languageTag, "")} ${currency}`
          })
  });
}
