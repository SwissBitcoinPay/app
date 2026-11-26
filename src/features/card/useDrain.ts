import { useCallback, useEffect, useRef, useState } from "react";

import { toUnlockFailure, type UnlockFailure } from "@/features/account/usePasskeyAccount";
import { PARSE_DELAY_MS, type SendSource } from "@/features/wallet/send/useSend";
import { SendError, type SendErrorCode } from "@/lib/breez/errors";
import {
  drainReceivedSats,
  type DrainQuote,
  type OnchainSpeed,
  type SendDestination,
  type SentPayment
} from "@/lib/breez/types";
import { holdActivity } from "@/lib/activity";
import { logFailure } from "@/lib/log/log";
import { randomUuid } from "@/lib/random";

/*
 * "Empty the card" of a card's wallet (a card holder's, which has no main balance to send it back
 * to, or a merchant's): the card's whole balance, once synced, to a Lightning address, a Bitcoin
 * address or a Spark address, the fees taken from it (prepareDrain, the SDK's FeesIncluded), so
 * that the card's wallet
 * holds nothing afterwards (a card is deleted empty only). What the recipient gets is shown before
 * anything leaves, exactly (DrainQuote); the passkey is asked, then it is sent once (one
 * idempotency key per quote: a retry after a failure, which may have left all the same, sends the
 * same one). A quote past its end that no attempt used is prepared again and shown again: nothing
 * leaves on figures the card holder did not see; one an attempt used is never renewed (its retry
 * keeps its key), the panel opened again starts afresh from the balance.
 */

/** The recipient: being read, read (a destination that can take a whole balance), or refused. */
export type DrainRecipient =
  | { state: "empty" }
  | { state: "reading" }
  | { state: "read"; destination: SendDestination; seq: number }
  | { state: "invalid"; code: SendErrorCode | "invoice" | "failed" };

export type DrainQuoteState =
  | { state: "none" }
  | { state: "preparing" }
  | { state: "ready"; quote: DrainQuote; key: string }
  /** `empty`: the card holds nothing (once synced); else the SDK refused it, or did not answer. */
  | { state: "failed"; empty: boolean };

export type DrainFailure =
  | { kind: "passkey"; failure: UnlockFailure }
  /** The withdrawal could not be noted before it leaves (SendSource.beforeSend): nothing left. */
  | { kind: "record" }
  | { kind: "send" };

export type DrainPhase = "edit" | "confirming" | "sending" | "done";

/**
 * Whether a recipient can take the card's whole balance. An invoice asks its own amount, or leaves
 * what its recipient gets unknown (DrainQuote); so does a BIP-21 URI naming an amount: the whole
 * balance is not what it asks.
 */
export function drainable(destination: SendDestination): boolean {
  return !(
    destination.kind === "bolt11" ||
    (destination.kind === "bitcoinAddress" && destination.amountSats !== null)
  );
}

/** How long before its end a quote is no longer sent, but prepared again (seconds). */
const QUOTE_MARGIN_SEC = 30;

export function useDrain({
  source,
  readBalance,
  onSent,
  initialRecipient = ""
}: {
  /** The card's wallet (cardSendSource). */
  source: SendSource;
  /** The card's wallet's balance once synced: what the drain spends, exactly. */
  readBalance: () => Promise<bigint>;
  /** Something may have left: the card's balance is read again. */
  onSent: () => void;
  /** The recipient read in "Withdraw" (CardWalletFlow.tsx): read again at once, as if pasted. */
  initialRecipient?: string;
}) {
  // The card's wallet of the form's opening: its callbacks never change while it shows.
  const [wallet] = useState(source);
  const [balanceOf] = useState(() => readBalance);
  const [recipientText, setRecipientText] = useState(initialRecipient);
  const [recipient, setRecipient] = useState<DrainRecipient>(() =>
    initialRecipient.trim() === "" ? { state: "empty" } : { state: "reading" }
  );
  // The latest quote and what it was prepared for (`for`): another read or round drops it at once.
  const [quoteResult, setQuoteResult] = useState<{
    for: string;
    value: Extract<DrainQuoteState, { state: "ready" | "failed" }>;
  } | null>(null);
  const [speed, setSpeed] = useState<OnchainSpeed>("medium");
  const [phase, setPhase] = useState<DrainPhase>("edit");
  const [failure, setFailure] = useState<DrainFailure | null>(null);
  const [sent, setSent] = useState<{ payment: SentPayment; receivedSats: bigint } | null>(null);
  // Bumped to prepare it again (a quote past its end, a failed attempt, "Try again").
  const [round, setRound] = useState(0);
  const parseSeq = useRef(0);
  const quoteSeq = useRef(0);
  const parseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = useRef(false);
  const alive = useRef(true);
  // The idempotency key of the last quote an attempt was made with: never renewed. State, not a
  // ref: its speed is locked from then on (speedLocked), the SDK answering a retry with the first.
  const [attempted, setAttempted] = useState<string | null>(null);
  useEffect(
    () => () => {
      alive.current = false;
      if (parseTimer.current) clearTimeout(parseTimer.current);
    },
    []
  );

  // The recipient's read `seq` (the latest only is kept): its destination, or why it is refused.
  const parse = useCallback(
    (text: string, seq: number) => {
      wallet.parseSendInput(text).then(
        (destination) => {
          if (!alive.current || seq !== parseSeq.current) return;
          setRecipient(
            drainable(destination)
              ? { state: "read", destination, seq }
              : { state: "invalid", code: "invoice" }
          );
        },
        (error: unknown) => {
          if (!alive.current || seq !== parseSeq.current) return;
          // Its messages may repeat what was typed: the error's kind and code only.
          logFailure("Reading the drain's recipient failed", error, false);
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
  const changeRecipient = (text: string, at: "later" | "now" = "later") => {
    setRecipientText(text);
    if (parseTimer.current) clearTimeout(parseTimer.current);
    if (at === "now") {
      read(text);
      return;
    }
    parseSeq.current++;
    setRecipient(text.trim() === "" ? { state: "empty" } : { state: "reading" });
    parseTimer.current = setTimeout(() => read(text), PARSE_DELAY_MS);
  };

  // The drain, prepared as soon as the recipient is read, from the balance once synced; again for
  // each new read (`seq`) and round.
  const destination = recipient.state === "read" ? recipient.destination : null;
  const quoteFor = recipient.state === "read" ? `${recipient.seq}/${round}` : null;
  useEffect(() => {
    if (!destination || quoteFor === null) return;
    const seq = ++quoteSeq.current;
    void (async () => {
      let value: Extract<DrainQuoteState, { state: "ready" | "failed" }>;
      try {
        const balance = await balanceOf();
        value =
          balance <= 0n
            ? { state: "failed", empty: true }
            : {
                state: "ready",
                quote: await wallet.prepareDrain(destination, balance),
                key: randomUuid()
              };
      } catch (error) {
        logFailure("Preparing the drain failed", error);
        value = { state: "failed", empty: false };
      }
      if (alive.current && seq === quoteSeq.current) setQuoteResult({ for: quoteFor, value });
    })();
  }, [destination, quoteFor, wallet, balanceOf]);
  const quote: DrainQuoteState =
    quoteFor === null
      ? { state: "none" }
      : quoteResult?.for === quoteFor
        ? quoteResult.value
        : { state: "preparing" };

  const ready = quote.state === "ready" ? quote : null;
  // An attempt made with this quote may have left at its speed: a retry sends the same key, which
  // the SDK answers with that first payment, so another speed would show figures that never left.
  const speedLocked = ready !== null && attempted === ready.key;
  const receivedSats = ready ? drainReceivedSats(ready.quote, speed) : null;
  const canSend = phase === "edit" && ready !== null && receivedSats !== null;

  const send = async () => {
    if (busy.current || !ready || receivedSats === null || phase !== "edit") return;
    // Past its end (or about to be), no attempt made with it: prepared again, shown again, sent at
    // the next press.
    const now = Math.floor(Date.now() / 1000);
    if (
      attempted !== ready.key &&
      ready.quote.expiresAt !== null &&
      ready.quote.expiresAt - QUOTE_MARGIN_SEC <= now
    ) {
      setRound((count) => count + 1);
      return;
    }
    busy.current = true;
    setFailure(null);
    setPhase("confirming");
    // The user waits on the app: the auto-lock must not close the account under the payment.
    const release = holdActivity();
    try {
      try {
        await wallet.confirm();
      } catch (error) {
        logFailure("Confirming the drain failed", error);
        if (!alive.current) return;
        setPhase("edit");
        const passkey = toUnlockFailure(error);
        // A dismissed prompt: back to the form, nothing said.
        if (passkey) setFailure({ kind: "passkey", failure: passkey });
        return;
      }
      if (!alive.current) return;
      if (wallet.beforeSend && destination) {
        try {
          await wallet.beforeSend(ready.key, destination);
        } catch (error) {
          logFailure("Recording the drain before it leaves failed", error);
          if (alive.current) {
            setPhase("edit");
            setFailure({ kind: "record" });
          }
          return;
        }
        if (!alive.current) return;
      }
      setAttempted(ready.key);
      setPhase("sending");
      let payment: SentPayment;
      try {
        payment = await wallet.sendPrepared(ready.quote, { speed, idempotencyKey: ready.key });
      } catch (error) {
        logFailure("Sending the drain failed", error);
        // It may have left all the same: the card's balance is read again; another attempt sends
        // this very quote, with its key: it leaves at most once.
        onSent();
        if (alive.current) {
          setPhase("edit");
          setFailure({ kind: "send" });
        }
        return;
      }
      onSent();
      if (!alive.current) return;
      setSent({ payment, receivedSats });
      setPhase("done");
    } finally {
      release();
      busy.current = false;
    }
  };

  return {
    recipientText,
    recipient,
    destination,
    changeRecipient,
    quote,
    speed,
    setSpeed: (next: OnchainSpeed) => {
      if (!speedLocked) setSpeed(next);
    },
    speedLocked,
    receivedSats,
    canSend,
    phase,
    failure,
    sent,
    send: () => void send(),
    retry: () => setRound((count) => count + 1)
  };
}

export type DrainState = ReturnType<typeof useDrain>;
