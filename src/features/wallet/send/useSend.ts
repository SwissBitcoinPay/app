import { useCallback, useEffect, useRef, useState } from "react";

import { FOLLOW_FOR_MS, FOLLOW_INTERVAL_MS } from "@/config/wallet";
import { confirmAccountPasskey } from "@/features/account/wallet-access";
import { toUnlockFailure, type UnlockFailure } from "@/features/account/usePasskeyAccount";
import { usePos } from "@/features/terminal/pos";
import { SendError, type SendErrorCode } from "@/lib/breez/errors";
import type {
  OnchainSpeed,
  SendDestination,
  SendQuote,
  SentPayment,
  Wallet,
  WalletPayment
} from "@/lib/breez/types";
import { getWalletPayment, parseSendInput, prepareSend, sendPrepared } from "@/lib/breez/wallet";
import { logFailure } from "@/lib/log/log";
import { randomUuid } from "@/lib/random";
import { currencyDigits, fiatToSats } from "@/lib/terminal/amount";

import { convertAmountText, parseFiatMinor, parseSats, satsText, type AmountUnit } from "./amount";

/** A pause in typing before the recipient is read (the SDK may ask an LNURL server). */
export const PARSE_DELAY_MS = 350;
/** A pause in typing before the payment is prepared again (its fees). */
export const QUOTE_DELAY_MS = 400;
export { FOLLOW_FOR_MS, FOLLOW_INTERVAL_MS };
/**
 * A quote with an end (SendQuote.expiresAt: an on-chain fee quote, an LNURL service's invoice) is
 * prepared again this long before it, while no attempt to send it was made; never sooner than
 * QUOTE_MIN_LIFE_SEC after it came, so that a device clock off by minutes cannot prepare it again
 * and again.
 */
export const QUOTE_RENEW_MARGIN_SEC = 30;
export const QUOTE_MIN_LIFE_SEC = 60;
/** setTimeout's longest delay (2^31 − 1 ms): a longer one fires at once. */
const MAX_TIMER_MS = 2_147_483_647;

export type RecipientState =
  | { state: "empty" }
  | { state: "reading" }
  /** `seq`: which read gave it, so that a quote is never taken for another read's. */
  | { state: "read"; destination: SendDestination; seq: number }
  | { state: "invalid"; code: SendErrorCode | "failed" };

/** Why the amount cannot be sent as it is (an instruction under the field). */
export type AmountIssue =
  | { kind: "invalid" }
  | { kind: "belowMin"; sats: bigint }
  | { kind: "aboveMax"; sats: bigint }
  | { kind: "aboveBalance" }
  | { kind: "feesAboveBalance" };

export type QuoteState =
  | { state: "none" }
  | { state: "preparing" }
  /**
   * `key`: the idempotency key of this quote, the same for each attempt to send it. `renewAt`
   * (epoch ms): when it is prepared again, null when it has no end.
   */
  | { state: "ready"; quote: SendQuote; key: string; renewAt: number | null }
  | { state: "failed" };

export type SendFailure =
  | { kind: "passkey"; failure: UnlockFailure }
  | { kind: "noRate" }
  /** What must be written before it leaves could not be (SendSource.beforeSend): nothing left. */
  | { kind: "record" }
  | { kind: "send" };

export type SendPhase = "edit" | "confirming" | "sending" | "done";

/**
 * The wallet a payment leaves: what reads its recipient, prepares it, sends it and follows it, and
 * the passkey asked before it leaves. The account's ("Wallet", ACCOUNT_SEND_SOURCE), or a card's
 * (cardSendSource, src/features/card/card-wallet.ts: "Send" of a card holder's card).
 */
export type SendSource = Pick<
  Wallet,
  "parseSendInput" | "prepareSend" | "prepareDrain" | "sendPrepared" | "getPayment"
> & {
  /** The passkey, asked again before the payment leaves (confirmAccountPasskey). */
  confirm: () => Promise<void>;
  /**
   * After the passkey, before the payment leaves with the idempotency key `key` (its id: send/mod.rs
   * of spark-sdk 0.28.4) to `destination`: a card's withdrawal noted on the account's relays
   * (cardSendSource). Rejects when it could not be: nothing leaves then.
   */
  beforeSend?: (key: string, destination: SendDestination) => Promise<void>;
};

/** The account's wallet (wallet-access.ts holds it open while "Wallet" shows). */
export const ACCOUNT_SEND_SOURCE: SendSource = {
  parseSendInput,
  prepareSend,
  prepareDrain: () => Promise.reject(new Error("The account's wallet is never drained")),
  sendPrepared,
  getPayment: getWalletPayment,
  confirm: () => confirmAccountPasskey()
};

/**
 * The state of "Send": the recipient alone first; once it is read, the form for its kind (an amount
 * for a Lightning or Bitcoin address and an invoice without one, the speed on-chain), the payment
 * prepared again at each change for its fees; then the passkey (asked before each payment), the
 * payment, and its outcome, followed while it is pending.
 */
export function useSend({
  balanceSats,
  onSent,
  source = ACCOUNT_SEND_SOURCE,
  initialRecipient = ""
}: {
  balanceSats: bigint;
  onSent: () => void;
  /** The wallet the payment leaves: the account's by default. */
  source?: SendSource;
  /** A recipient already typed (a form shown again): read at once, as if pasted. */
  initialRecipient?: string;
}) {
  // The wallet of the sheet's opening: its callbacks never change while it shows.
  const [wallet] = useState(source);
  const { digits, languageTag, rate, profile } = usePos();
  const rateNow = rate.rate;
  // The currency the francs typed are in: the display currency when they were typed. Another one
  // ("Settings", another device's change brought by the account's sync: the sheet stays open) never
  // relabels them: while the passkey or the payment runs, and on its outcome, they show in their
  // own currency (their sats pinned at the tap); back to the form, they are dropped.
  const [fiatCurrency, setFiatCurrency] = useState(profile.currency);

  const [recipientText, setRecipientText] = useState(initialRecipient);
  const [recipient, setRecipient] = useState<RecipientState>(() =>
    initialRecipient.trim() === "" ? { state: "empty" } : { state: "reading" }
  );
  const [unit, setUnit] = useState<AmountUnit>(rateNow === undefined ? "sats" : "fiat");
  const [amountText, setAmountText] = useState("");
  const [speed, setSpeed] = useState<OnchainSpeed>("medium");
  // The latest quote and what it was prepared for (`for`, quoteKey below): the quote shown is
  // derived from it, so that a change of recipient or amount drops it at once.
  const [quoteResult, setQuoteResult] = useState<{
    for: string;
    value: Extract<QuoteState, { state: "ready" | "failed" }>;
  } | null>(null);
  // Bumped to prepare the payment again while what it pays is unchanged: its quote nears its end,
  // or the merchant asks again after a quote failed.
  const [quoteRound, setQuoteRound] = useState(0);
  // The sats of francs being sent, fixed at the tap while the francs typed stay the same: a rate
  // refreshed during the passkey or the payment, or after a failed attempt, must not prepare another
  // payment (another idempotency key) for the same francs: the first may have left. Released when
  // nothing left (passkey dismissed or refused, rate gone) and when the quote is renewed.
  const [pinned, setPinned] = useState<{ seq: number; text: string; sats: bigint } | null>(null);
  // The idempotency key of the last quote an attempt was made with: never renewed (its retry must
  // keep its key, the payment leaving at most once).
  const [attemptedKey, setAttemptedKey] = useState<string | null>(null);
  // The text before the last switch of unit and what it became: switching back without an edit
  // gives the merchant's own text again, not a conversion of a conversion (1 005 sats → 1,01 CHF
  // → 1 010 sats).
  const [switched, setSwitched] = useState<{ to: AmountUnit; text: string; became: string } | null>(
    null
  );
  const [phase, setPhase] = useState<SendPhase>("edit");
  const [failure, setFailure] = useState<SendFailure | null>(null);
  const [sent, setSent] = useState<SentPayment | null>(null);
  // The payment whose following ended still pending (FOLLOW_FOR_MS): the sheet no longer updates.
  const [unfollowedId, setUnfollowedId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  // Only the latest read and quote count: an earlier answer arriving late is dropped.
  const parseSeq = useRef(0);
  const quoteSeq = useRef(0);
  const parseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A double tap must not ask for the passkey twice.
  const busy = useRef(false);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
      if (parseTimer.current) clearTimeout(parseTimer.current);
    },
    []
  );

  // Without a rate, sats only: francs typed in the form can no longer be converted, and must never
  // be read as sats (nor sats typed during the outage as francs once the rate is back). The field
  // starts again, in sats. Not while the passkey or the payment runs: their francs are pinned.
  if (rateNow === undefined && unit === "fiat" && phase === "edit") {
    setUnit("sats");
    setAmountText("");
    setSwitched(null);
  }
  // Another display currency: the francs typed (or kept to switch back to) are another currency's.
  if (fiatCurrency !== profile.currency && phase === "edit") {
    setFiatCurrency(profile.currency);
    if (unit === "fiat") setAmountText("");
    setSwitched(null);
  }
  const destination = recipient.state === "read" ? recipient.destination : null;
  const invoiceSats =
    destination?.kind === "bolt11" && destination.amountSats !== null
      ? destination.amountSats
      : null;
  const needsAmount = destination !== null && invoiceSats === null;

  const fiatDigits = currencyDigits(fiatCurrency);
  const typedFiatMinor = unit === "fiat" ? parseFiatMinor(amountText, fiatDigits) : null;
  const pinnedSats =
    pinned !== null &&
    recipient.state === "read" &&
    pinned.seq === recipient.seq &&
    pinned.text === amountText
      ? pinned.sats
      : null;
  let requestedSats: bigint | null = invoiceSats;
  if (needsAmount) {
    requestedSats =
      unit === "sats"
        ? parseSats(amountText)
        : (pinnedSats ??
          (typedFiatMinor !== null && rateNow !== undefined && fiatCurrency === profile.currency
            ? fiatToSats(typedFiatMinor, fiatDigits, rateNow)
            : null));
  }

  // What keeps the amount from being prepared, before any fee is known.
  let amountIssue: AmountIssue | null = null;
  if (needsAmount && amountText.trim() !== "" && (requestedSats === null || requestedSats <= 0n)) {
    amountIssue = { kind: "invalid" };
  } else if (destination && requestedSats !== null && requestedSats > 0n) {
    if (
      (destination.kind === "lightningAddress" || destination.kind === "lnurlPay") &&
      requestedSats < destination.minSats
    ) {
      amountIssue = { kind: "belowMin", sats: destination.minSats };
    } else if (
      (destination.kind === "lightningAddress" || destination.kind === "lnurlPay") &&
      requestedSats > destination.maxSats
    ) {
      amountIssue = { kind: "aboveMax", sats: destination.maxSats };
    } else if (requestedSats > balanceSats) {
      amountIssue = { kind: "aboveBalance" };
    }
  }

  // The payment, prepared again whenever what it pays changes (after a pause in typing). Not when
  // the phase changes: a send that failed is tried again with the same quote, so the same
  // idempotency key, and the payment leaves at most once (the form is locked meanwhile).
  const expired = destination?.kind === "bolt11" && destination.expiresAt <= now;
  const quoteFor =
    destination !== null &&
    !expired &&
    requestedSats !== null &&
    requestedSats > 0n &&
    amountIssue === null
      ? requestedSats
      : null;
  const quoteKey =
    recipient.state === "read" && quoteFor !== null
      ? `${recipient.seq}:${quoteFor}:${quoteRound}`
      : null;
  const quote: QuoteState =
    quoteKey === null
      ? { state: "none" }
      : quoteResult?.for === quoteKey
        ? quoteResult.value
        : { state: "preparing" };

  const readyQuote = quote.state === "ready" ? quote.quote : null;
  const renewAt = quote.state === "ready" ? quote.renewAt : null;
  const readyKey = quote.state === "ready" ? quote.key : null;
  const feeSats = readyQuote
    ? readyQuote.fees.onchain
      ? readyQuote.fees.bySpeed[speed]
      : readyQuote.fees.feeSats
    : null;
  if (!amountIssue && readyQuote && feeSats !== null) {
    if (readyQuote.amountSats + feeSats > balanceSats) amountIssue = { kind: "feesAboveBalance" };
  }

  // An invoice past its expiry while the sheet shows: it can no longer be paid.
  useEffect(() => {
    if (destination?.kind !== "bolt11" || phase === "done") return;
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, [destination, phase]);

  // A quote nearing its end, no attempt made with it: prepared again (a new idempotency key), with
  // the francs converted at the current rate again.
  useEffect(() => {
    if (renewAt === null || phase !== "edit" || readyKey === attemptedKey) return;
    const timer = setTimeout(
      () => {
        setPinned(null);
        setQuoteRound((round) => round + 1);
      },
      Math.min(Math.max(0, renewAt - Date.now()), MAX_TIMER_MS)
    );
    return () => clearTimeout(timer);
  }, [renewAt, phase, readyKey, attemptedKey]);

  /** After a quote failed: prepared again, as it is. */
  const retryQuote = useCallback(() => {
    setPinned(null);
    setQuoteRound((round) => round + 1);
  }, []);

  // The recipient's read `seq` (the latest only is kept): its destination, or why it is refused.
  const parse = useCallback(
    (text: string, seq: number) => {
      wallet.parseSendInput(text).then(
        (next) => {
          if (!alive.current || seq !== parseSeq.current) return;
          setRecipient({ state: "read", destination: next, seq });
          // A BIP-21 URI that names its amount: shown in sats, as it was given.
          if (next.kind === "bitcoinAddress" && next.amountSats !== null) {
            setUnit("sats");
            setAmountText(satsText(next.amountSats));
            setSwitched(null);
          }
        },
        (error: unknown) => {
          if (!alive.current || seq !== parseSeq.current) return;
          // Its messages may repeat what was typed: the error's kind and code only.
          logFailure("Reading the recipient failed", error, false);
          setRecipient({
            state: "invalid",
            code: error instanceof SendError ? error.code : "failed"
          });
        }
      );
    },
    [wallet]
  );

  const read = useCallback(
    (text: string) => {
      if (parseTimer.current) clearTimeout(parseTimer.current);
      const seq = ++parseSeq.current;
      setFailure(null);
      if (text.trim() === "") {
        setRecipient({ state: "empty" });
        return;
      }
      setRecipient({ state: "reading" });
      parse(text, seq);
    },
    [parse]
  );
  // The recipient given at the opening (already "reading"), read once at the mount.
  const [opening] = useState(initialRecipient);
  useEffect(() => {
    if (opening.trim() !== "") parse(opening, ++parseSeq.current);
  }, [opening, parse]);

  /** Typed: read after a pause. Pasted or scanned: `now`. */
  const changeRecipient = useCallback(
    (text: string, at: "later" | "now" = "later") => {
      setRecipientText(text);
      if (parseTimer.current) clearTimeout(parseTimer.current);
      if (at === "now") {
        read(text);
        return;
      }
      parseSeq.current++;
      setRecipient(text.trim() === "" ? { state: "empty" } : { state: "reading" });
      parseTimer.current = setTimeout(() => read(text), PARSE_DELAY_MS);
    },
    [read]
  );

  useEffect(() => {
    if (!destination || quoteFor === null || quoteKey === null) return;
    const seq = ++quoteSeq.current;
    const timer = setTimeout(() => {
      wallet.prepareSend(destination, invoiceSats === null ? quoteFor : null).then(
        (next) => {
          if (!alive.current || seq !== quoteSeq.current) return;
          setQuoteResult({
            for: quoteKey,
            value: { state: "ready", quote: next, key: randomUuid(), renewAt: quoteRenewTime(next) }
          });
        },
        (error: unknown) => {
          if (!alive.current || seq !== quoteSeq.current) return;
          logFailure("Preparing the payment failed", error);
          setQuoteResult({ for: quoteKey, value: { state: "failed" } });
        }
      );
    }, QUOTE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [destination, quoteFor, quoteKey, invoiceSats, wallet]);

  const switchUnit = useCallback(() => {
    if (rateNow === undefined) return;
    const next: AmountUnit = unit === "fiat" ? "sats" : "fiat";
    if (switched !== null && switched.to === unit && switched.became === amountText) {
      // Back to the unit it was typed in, unedited since: the merchant's own text.
      setAmountText(switched.text);
      setSwitched(null);
    } else {
      const became = convertAmountText(amountText, unit, {
        digits,
        languageTag,
        rate: rateNow,
        toSats: (minor) => fiatToSats(minor, digits, rateNow)
      });
      setAmountText(became);
      setSwitched({ to: next, text: amountText, became });
    }
    setUnit(next);
  }, [amountText, digits, unit, languageTag, rateNow, switched]);

  const canSend = phase === "edit" && quote.state === "ready" && amountIssue === null && !expired;

  const send = useCallback(async () => {
    // canSend: the quote result is the one of what the form shows now.
    if (
      busy.current ||
      !canSend ||
      quoteResult?.value.state !== "ready" ||
      recipient.state !== "read"
    ) {
      return;
    }
    const { quote: ready, key } = quoteResult.value;
    // Francs fix the amount: only with a rate that is still fresh, before the passkey (no prompt
    // for nothing) and after it.
    const rateGone = () => needsAmount && unit === "fiat" && rate.current() === undefined;
    if (rateGone()) {
      setFailure({ kind: "noRate" });
      return;
    }
    busy.current = true;
    setFailure(null);
    if (needsAmount && unit === "fiat") {
      setPinned({ seq: recipient.seq, text: amountText, sats: ready.amountSats });
    }
    setPhase("confirming");
    try {
      try {
        await wallet.confirm();
      } catch (error) {
        logFailure("Confirming the payment failed", error);
        if (!alive.current) return;
        // Nothing left: the francs follow the rate again.
        setPinned(null);
        setPhase("edit");
        const passkeyFailure = toUnlockFailure(error);
        // A dismissed prompt: back to the form, nothing said.
        if (passkeyFailure) setFailure({ kind: "passkey", failure: passkeyFailure });
        return;
      }
      if (rateGone()) {
        if (alive.current) {
          setPinned(null);
          setPhase("edit");
          setFailure({ kind: "noRate" });
        }
        return;
      }
      if (!alive.current) return;
      if (wallet.beforeSend) {
        try {
          await wallet.beforeSend(key, recipient.destination);
        } catch (error) {
          logFailure("Recording the payment before it leaves failed", error);
          if (alive.current) {
            // Nothing left: the francs follow the rate again.
            setPinned(null);
            setPhase("edit");
            setFailure({ kind: "record" });
          }
          return;
        }
        if (!alive.current) return;
      }
      setAttemptedKey(key);
      setPhase("sending");
      let result: SentPayment;
      try {
        result = await wallet.sendPrepared(ready, { speed, idempotencyKey: key });
      } catch (error) {
        logFailure("Sending the payment failed", error);
        // It may have left all the same: the list is read again.
        onSent();
        if (alive.current) {
          setPhase("edit");
          setFailure({ kind: "send" });
        }
        return;
      }
      onSent();
      if (!alive.current) return;
      setSent(result);
      setPhase("done");
    } finally {
      busy.current = false;
    }
  }, [amountText, canSend, needsAmount, onSent, quoteResult, rate, recipient, speed, unit, wallet]);

  // A payment that left pending is followed until it completes or fails (or for FOLLOW_FOR_MS).
  const sentId = sent?.id ?? null;
  const sentPending = sent?.status === "pending";
  useEffect(() => {
    if (!sentId || !sentPending) return;
    let stopped = false;
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > FOLLOW_FOR_MS) {
        clearInterval(timer);
        if (!stopped) setUnfollowedId(sentId);
        return;
      }
      wallet.getPayment(sentId).then(
        (payment: WalletPayment | null) => {
          if (stopped || !payment || payment.status === "pending") return;
          setSent({ id: sentId, status: payment.status });
          onSent();
        },
        (error: unknown) => {
          logFailure("Following the payment failed", error);
        }
      );
    }, FOLLOW_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [sentId, sentPending, onSent, wallet]);

  const balanceAfterSats =
    readyQuote && feeSats !== null ? balanceSats - readyQuote.amountSats - feeSats : null;

  return {
    balanceSats,
    balanceAfterSats,
    recipientText,
    recipient,
    changeRecipient,
    destination,
    expired,
    secondsLeft: destination?.kind === "bolt11" ? Math.max(0, destination.expiresAt - now) : 0,
    needsAmount,
    unit,
    /** The currency of the francs typed, and its decimal digits (`fiatCurrency` above). */
    fiatCurrency,
    fiatDigits,
    canSwitchUnit: rateNow !== undefined,
    switchUnit,
    amountText,
    setAmountText,
    typedFiatMinor,
    requestedSats,
    amountIssue,
    speed,
    setSpeed,
    quote,
    retryQuote,
    feeSats,
    phase,
    canSend,
    send,
    failure,
    sent,
    /**
     * The payment sent is still pending and no longer followed (FOLLOW_FOR_MS): its outcome will
     * only show in the wallet's list.
     */
    followEnded: sent !== null && sent.status === "pending" && unfollowedId === sent.id
  };
}

export type SendState = ReturnType<typeof useSend>;

/**
 * When a quote that came at `nowMs` is prepared again (epoch ms), null when it has no end: see
 * QUOTE_RENEW_MARGIN_SEC.
 */
export function quoteRenewTime(
  quote: Pick<SendQuote, "expiresAt">,
  nowMs = Date.now()
): number | null {
  if (quote.expiresAt === null || !Number.isFinite(quote.expiresAt)) return null;
  const nowSec = nowMs / 1000;
  const inSec = Math.max(QUOTE_MIN_LIFE_SEC, quote.expiresAt - QUOTE_RENEW_MARGIN_SEC - nowSec);
  return Math.round((nowSec + inSec) * 1000);
}
