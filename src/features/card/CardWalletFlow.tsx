import * as Clipboard from "expo-clipboard";
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction
} from "react";
import { useTranslation } from "react-i18next";
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";

import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { CodePlate } from "@/components/ui/CodePlate";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Icon, type IconName } from "@/components/ui/Icon";
import { SheetPages } from "@/components/ui/sheet-pages";
import { Spinner } from "@/components/ui/Spinner";
import { TextField } from "@/components/ui/TextField";
import { UnitSwitch } from "@/components/ui/UnitSwitch";
import { useHover } from "@/components/ui/useHover";
import { CARD_INVOICE_POLL_MS } from "@/config/card";
import { hasMainWallet } from "@/features/account/main-wallet";
import { OtherAccountError } from "@/features/account/session";
import { toUnlockFailure, unlockFailureMessage } from "@/features/account/usePasskeyAccount";
import { useNotifications } from "@/features/notifications/NotificationsProvider";
import { useCardHolder, usePos } from "@/features/terminal/pos";
import { useWalletFormat } from "@/features/wallet/format";
import { fiatPlaceholder, formatSats } from "@/features/wallet/send/amount";
import { SendForm } from "@/features/wallet/send/SendSheet";
import { QUOTE_DELAY_MS } from "@/features/wallet/send/useSend";
import { MAX_DEPOSIT_CLAIM_FEE_SATS } from "@/lib/breez/config";
import { PasskeyError } from "@/lib/breez/errors";
import type { CardState } from "@/lib/card/card-record";
import { formatDate } from "@/lib/locale/date";
import { formatInteger } from "@/lib/locale/format";
import { logFailure } from "@/lib/log/log";
import { shareWithSystem } from "@/lib/system-ui";
import type { KeypadKey } from "@/lib/terminal/amount";
import {
  AMOUNT_EM,
  control,
  makeStyles,
  mono,
  proseLineHeight,
  radius,
  sans,
  space,
  stroke,
  TITLE_EM,
  tracked,
  tracking,
  type,
  useTheme
} from "@/theme";

import {
  EMPTY_ENTRY,
  entrySats,
  entryText,
  pressEntryKey,
  pressSatsKey,
  readEntryText,
  sameEntry,
  switchedEntry,
  type AmountEntry
} from "./amount-entry";
import { AmountEntryView } from "./AmountEntryView";
import { CardDrain } from "./CardDrain";
import { CardMini } from "./CardFaceView";
import { useHeldAccountWallet } from "./CardWalletPanel";
import {
  InsufficientCardBalanceError,
  InsufficientMainBalanceError,
  NothingToReturnError,
  cardDepositAddress,
  cardInvoice,
  cardInvoicePayment,
  cardLightningAddress,
  prepareRecharge,
  prepareReturn,
  readMainBalance,
  type CardInvoice,
  type CardTransfer,
  type CardWalletLease
} from "./card-wallet";
import { drainable } from "./useDrain";
import { cardWithdrawalSource } from "./withdrawal-source";

/*
 * "Top up" and "Withdraw to my main balance" of a card's wallet. "Top up" opens on the keypad when
 * the main balance holds sats (the amount, its source, "Change"), else on the means of any other
 * wallet (the card's Lightning address first, an invoice, an on-chain address), never saying the
 * main balance is empty; unread (offline, too slow), the means with "From my main balance" on top,
 * which reads it again, and the keypad as soon as a read too slow for its wait ends with sats. The
 * account's wallet stays connected while the main balance's path shows. An invoice is payable 24
 * hours, its payment said as soon as the card's wallet has it, of that invoice only; "Invoice
 * expired" once a read after its time found it unpaid, that time counted on this device. "Withdraw"
 * sends to any other wallet, as "Send" (SendForm), each withdrawal noted first
 * (withdrawal-source.ts), or the whole card to one ("Empty the card"); a merchant finds "To my main
 * balance" under it: an amount back, or the whole card ("Empty the card"), as "Delete the card"
 * opens it. Every transfer is shown again exactly, then asks the passkey; once it went, the panel
 * closes and a notification says what became of it, a failure in the panel. What was typed stays
 * when a step goes back to its keypad. The steps scroll within the panel on a small screen.
 *
 * On a desktop, as "Send": the amount is typed in a field, and the transfer is prepared as it is
 * typed, its fee and what the card holds after it shown under it before it goes (never before it is
 * prepared), "Top up 20,000 sats" asking the passkey at once; its confirmation shows only to try
 * again. The codes stand beside their amount.
 */

/** A permanent address's code (25 modules of 8 px). */
const CODE_SIZE = 200;
/**
 * An invoice's, its amount above it, and the card's address under "From my main balance" (25
 * modules of 7 px).
 */
const SMALL_CODE_SIZE = 176;
/** An invoice's code beside its amount on a desktop (a plate of 196 px). */
const BESIDE_CODE_SIZE = 160;
/**
 * A permanent address's code on a desktop (a plate of 204 px, its quiet zone of 18 kept).
 */
const DESKTOP_CODE_SIZE = 168;
/** A line with nothing to say keeps its height: no jump when it says something. */
const NBSP = " ";

/** The panel's header while a step shows: its title (null: the task's) and its way back. */
export type WalletHeader = { title: string | null; back: (() => void) | null };

const NO_HEADER: WalletHeader = { title: null, back: null };

type Action = "recharge" | "return";

type Step =
  /**
   * "Top up": the main balance being read, which decides where it opens; `again`, asked again from
   * "From my main balance".
   */
  | { kind: "reading"; again: boolean }
  /** "Top up": an amount from the main balance, which held `main` sats once synced. */
  | { kind: "amount"; main: bigint }
  /**
   * From any other wallet: `back`, the keypad it came from ("Change"), null when it opened on it;
   * `unread`, the main balance could not be read: "From my main balance"; `failed`, nor when asked
   * again.
   */
  | { kind: "other"; back: Step | null; unread: boolean; failed: boolean }
  /** "Lightning invoice": its amount. */
  | { kind: "invoiceAmount"; back: Step }
  /** "Lightning invoice": the invoice, its payment awaited (`paid`: said). */
  | { kind: "invoice"; invoice: CardInvoice; back: Step; paid?: true }
  /** "Bitcoin address". */
  | { kind: "bitcoin"; back: Step }
  /**
   * Back to the main balance: an amount, or the whole card. `back`: "Withdraw" it came from ("To my
   * main balance"), null when it opened on it ("Delete the card").
   */
  | { kind: "returnAmount"; back: Step | null }
  /**
   * "Withdraw": an amount to anyone, as "Wallet"'s "Send" (SendForm), from the card's wallet (a
   * merchant also finds "To my main balance" there).
   */
  /** `recipient`: the one typed there before "Empty the card", kept on its way back. */
  | { kind: "send"; recipient?: string }
  /**
   * "Empty the card" to any other wallet (CardDrain): `back`, "Withdraw" it came from; `recipient`,
   * the one read there (offered once one is read).
   */
  | { kind: "drain"; back: Step | null; recipient?: string }
  /** `error`: why the last attempt did not go (asked again, the same transfer: sent once). */
  | {
      kind: "confirm";
      action: Action;
      transfer: CardTransfer;
      error: string | null;
      back: Step;
    }
  /** Sending: the panel cannot close. */
  | { kind: "working"; action: Action }
  /** `back`: the step "Back" goes back to; null, it closes the panel. */
  | { kind: "failed"; message: string; back: Step | null };

/**
 * "Top up" (`start: "recharge"`) or back to the main balance (`"return"`; `"drain"`, "Empty the
 * card" chosen: "Delete the card", which asks the card emptied first) for the card `card` (its
 * label `label`), whose wallet `lease` held `balanceSats` as last read. `onDone(changed)`: the panel
 * closes, the balance read again when it may have changed. `onEnded`: a transfer ended (sent, left,
 * or nothing to send), its notification shown: the panel closes, the balance read again, never
 * shown as it was meanwhile (its sats moved). `onBusy`: a transfer is being sent, the panel must not
 * close. `onHeader`: the panel's title and way back for the step shown.
 */
export function CardWalletFlow({
  card,
  label,
  lease,
  balanceSats,
  start,
  onDone,
  onEnded,
  onBusy,
  onHeader
}: {
  card: Pick<CardState, "cardId" | "look" | "issuer">;
  label: string;
  lease: CardWalletLease;
  balanceSats: bigint;
  start: Action | "drain";
  onDone: (changed: boolean) => void;
  onEnded: () => void;
  onBusy: (busy: boolean) => void;
  onHeader: (header: WalletHeader) => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { notify } = useNotifications();
  const { languageTag } = usePos();
  const desktop = useIsDesktop();
  // A card holder's account has no main balance (main-wallet.ts): "Top up" opens on the means of
  // any other wallet, nothing of the account's wallet read, and "Withdraw" never offers it.
  // "Withdraw" opens on any other wallet, a merchant's with "To my main balance" under it; "Delete
  // the card" empties a merchant's card to the main balance, a card holder's anywhere.
  const cardHolder = useCardHolder();
  const [mainWallet] = useState(() => !cardHolder && hasMainWallet());
  const [step, setStep] = useState<Step>(() =>
    start === "recharge"
      ? mainWallet
        ? { kind: "reading", again: false }
        : { kind: "other", back: null, unread: false, failed: false }
      : start === "drain"
        ? mainWallet
          ? { kind: "returnAmount", back: null }
          : { kind: "drain", back: null }
        : { kind: "send" }
  );
  // The card's wallet the payments to anyone leave (its lease, the flow's own), each noted first.
  const [cardSource] = useState(() => cardWithdrawalSource(lease));
  // Something may have left the card ("Send"): its balance is read again once done.
  const sentFromCard = useRef(false);
  // What was typed on each keypad, kept when a step goes back to it ("Cancel", "Back").
  const [rechargeEntry, setRechargeEntry] = useState<AmountEntry>(EMPTY_ENTRY);
  const [invoiceEntry, setInvoiceEntry] = useState<AmountEntry>(EMPTY_ENTRY);
  const [returnSats, setReturnSats] = useState(start === "drain" ? balanceSats : 0n);
  // A desktop's return to the main balance, typed in its field: sats, or the account's currency.
  const [returnEntry, setReturnEntry] = useState<AmountEntry>(
    start === "drain" ? { unit: "sats", sats: balanceSats, minor: 0 } : EMPTY_ENTRY
  );
  // What the card holds: as last read, or as read again by a transfer prepared from it.
  const [cardHeld, setCardHeld] = useState(balanceSats);
  // The step shown, for an answer that comes once it was left (read in callbacks only).
  const shown = useRef(step);
  // The transfer prepared and not sent: given up when the panel leaves it (cancel()).
  const prepared = useRef<CardTransfer | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      const transfer = prepared.current;
      prepared.current = null;
      void transfer?.cancel();
    };
  }, []);

  const busy = step.kind === "working";
  useEffect(() => {
    onBusy(busy);
    // Never left busy once the flow is gone.
    return () => onBusy(false);
  }, [busy, onBusy]);

  // The account's wallet held while the main balance's path shows: read again, then prepared and
  // sent, without a connection anew each time (on a slow network, each read would outlast its
  // wait). So too while a desktop's return to the main balance shows: its transfer, prepared as it
  // is typed, would otherwise connect it anew for each amount, and disconnect it with each given
  // up. Disconnected again once the path is left, if nothing else held it.
  const wantsMain =
    mainWallet &&
    (step.kind === "reading" ||
      step.kind === "amount" ||
      (step.kind === "other" && step.unread) ||
      ((step.kind === "confirm" || step.kind === "working") && step.action === "recharge") ||
      (desktop &&
        (step.kind === "returnAmount" ||
          ((step.kind === "confirm" || step.kind === "working") && step.action === "return"))));
  // Its reads and transfers say its failure on their own ("From my main balance", the fee).
  useHeldAccountWallet(wantsMain);

  const go = (next: Step) => {
    shown.current = next;
    setStep(next);
  };
  /** `next`, if `from` still shows: an answer that comes once it was left goes nowhere. */
  const goFrom = (from: Step, next: Step): boolean => {
    if (!alive.current || shown.current !== from) return false;
    go(next);
    return true;
  };
  const giveUp = () => {
    const transfer = prepared.current;
    prepared.current = null;
    void transfer?.cancel();
  };
  const fail = (from: Step, error: unknown, fallback: string, back: Step | null) => {
    logFailure("A card wallet's operation failed", error);
    // The passkey's own failures say so; anything else is the operation's.
    const unlock = passkeyFailure(error) ? toUnlockFailure(error) : null;
    goFrom(from, {
      kind: "failed",
      message: unlock ? unlockFailureMessage(unlock, t) : fallback,
      back
    });
  };

  /**
   * A transfer's outcome, if `from` still shows: the panel closes, said by a notification (no page
   * of the panel after it), its balance read again.
   */
  const finish = (from: Step, tone: "success" | "warning", message: string) => {
    if (!alive.current || shown.current !== from) return;
    notify({ tone, title: message, key: "card-wallet-transfer" });
    onEnded();
  };

  // The panel's header follows the step.
  const headerOf = (of: Step): WalletHeader => {
    const back = (to: Step) => () => {
      giveUp();
      go(to);
    };
    switch (of.kind) {
      case "other":
        return of.back ? { title: t("cards.wallet.otherWallet"), back: back(of.back) } : NO_HEADER;
      case "invoiceAmount":
        return { title: t("cards.wallet.invoice"), back: back(of.back) };
      case "invoice":
        // Paid, a desktop's dialog has no way back.
        return {
          title: t("cards.wallet.invoice"),
          back: desktop && of.paid ? null : back(of.back)
        };
      case "bitcoin":
        return { title: t("cards.wallet.onchain"), back: back(of.back) };
      case "send":
        return { title: t("cards.home.withdraw"), back: null };
      case "returnAmount":
        // From "Withdraw": its way back, the main balance named.
        return of.back ? { title: t("cards.wallet.return"), back: back(of.back) } : NO_HEADER;
      case "drain":
        return { title: t("cards.wallet.emptyCard"), back: of.back ? back(of.back) : null };
      case "confirm":
      case "working":
        // A desktop's dialog keeps its title: its confirmation is the same dialog, to try again.
        // On a phone, its way back leads to the amount as typed, the transfer given up (in
        // place of "Cancel"); none while it is being sent.
        return desktop
          ? NO_HEADER
          : {
              title: t(
                of.action === "recharge" ? "cards.wallet.confirmRecharge" : "cards.wallet.return"
              ),
              back: of.kind === "confirm" ? back(of.back) : null
            };
      default:
        return NO_HEADER;
    }
  };
  const announce = useEffectEvent((of: Step) => onHeader(headerOf(of)));
  useEffect(() => announce(step), [step]);

  // "Top up": the main balance first, which decides where it opens.
  const readMain = useEffectEvent((from: Extract<Step, { kind: "reading" }>) => {
    const unread: Step = { kind: "other", back: null, unread: true, failed: from.again };
    readMainBalance((late) => {
      // Read past its wait: the keypad (or the means without the main balance), if the page it
      // left for still shows.
      goFrom(
        unread,
        late > 0n
          ? { kind: "amount", main: late }
          : { kind: "other", back: null, unread: false, failed: false }
      );
    }).then(
      (main) =>
        goFrom(
          from,
          main === null
            ? unread
            : main > 0n
              ? { kind: "amount", main }
              : { kind: "other", back: null, unread: false, failed: false }
        ),
      (error: unknown) => {
        logFailure("Reading the main balance failed", error);
        goFrom(from, unread);
      }
    );
  });
  useEffect(() => {
    if (step.kind === "reading") readMain(step);
  }, [step]);

  const confirm = (from: Step, action: Action, transfer: CardTransfer) => {
    if (goFrom(from, { kind: "confirm", action, transfer, error: null, back: from })) {
      prepared.current = transfer;
    } else {
      void transfer.cancel();
    }
  };

  const send = (current: Extract<Step, { kind: "confirm" }>) => {
    const { transfer, action } = current;
    const working: Step = { kind: "working", action };
    go(working);
    transfer.send().then(
      (sent) => {
        prepared.current = null;
        const amount = formatSats(transfer.quote.amountSats, languageTag);
        // What the SDK says of it, never more: failed (nothing moved), left, or arrived.
        if (sent.status === "failed") {
          goFrom(working, {
            kind: "failed",
            message: t("cards.wallet.transferRefused"),
            back: null
          });
        } else if (sent.status === "pending") {
          finish(
            working,
            "warning",
            t(
              action === "recharge" ? "cards.wallet.rechargePending" : "cards.wallet.returnPending",
              { amount }
            )
          );
        } else {
          finish(
            working,
            "success",
            t(action === "recharge" ? "cards.wallet.recharged" : "cards.wallet.returned", {
              amount
            })
          );
        }
      },
      (error: unknown) => {
        logFailure("A card wallet's transfer failed", error);
        // Back to its confirmation, the transfer as prepared: its idempotency key sends it once,
        // however many attempts (it may have left all the same when the network failed).
        const unlock = passkeyFailure(error) ? toUnlockFailure(error) : null;
        goFrom(working, {
          ...current,
          // The prompt dismissed: nothing said.
          error: !passkeyFailure(error)
            ? t("cards.wallet.transferFailed")
            : unlock
              ? unlockFailureMessage(unlock, t)
              : null
        });
      }
    );
  };

  // A desktop's transfer, shown as it would go before "Top up" or "Withdraw": sent at once, its
  // confirmation showing only to try again (a passkey dismissed, a network failed).
  const sendNow = (from: Step, action: Action, transfer: CardTransfer) => {
    const current: Extract<Step, { kind: "confirm" }> = {
      kind: "confirm",
      action,
      transfer,
      error: null,
      back: from
    };
    if (!goFrom(from, current)) {
      void transfer.cancel();
      return;
    }
    prepared.current = transfer;
    send(current);
  };

  // Each step fades into the next (Sheet's pages), this flow and what was typed kept. A card
  // holder's "Send" and "Empty the card" scroll on their own (their scanner fills the panel).
  const page = pageOf(step);
  if (step.kind === "send") {
    return (
      <SheetPages page={page}>
        <SendForm
          desktop={desktop}
          balanceSats={cardHeld}
          source={cardSource}
          underTitle={false}
          initialRecipient={step.recipient}
          onSent={() => {
            sentFromCard.current = true;
          }}
          onClose={() => onDone(sentFromCard.current)}
          onLock={onBusy}
          aside={
            mainWallet ? (
              // The main balance under the means of any other wallet, as "From my main balance" is
              // a way of "Top up".
              <Button
                variant="text"
                size="md"
                icon="right-left"
                fullWidth={!desktop}
                onPress={() => go({ kind: "returnAmount", back: step })}
                testID="card-wallet-to-main"
              >
                {t("cards.wallet.toMain")}
              </Button>
            ) : null
          }
          // "Empty the card" once a recipient is read that can take the whole balance (without a
          // recipient it means nothing), to that recipient.
          readAside={({ destination, recipientText }) =>
            drainable(destination) ? (
              <Button
                variant="text"
                size="md"
                icon="arrow-up"
                fullWidth={!desktop}
                onPress={() =>
                  go({
                    kind: "drain",
                    back: { kind: "send", recipient: recipientText },
                    recipient: recipientText
                  })
                }
                testID="card-wallet-drain"
              >
                {t("cards.wallet.emptyCard")}
              </Button>
            ) : null
          }
        />
      </SheetPages>
    );
  }
  if (step.kind === "drain") {
    return (
      <SheetPages page={page}>
        <CardDrain
          source={cardSource}
          initialRecipient={step.recipient}
          readBalance={() => lease.wallet.getBalance(true)}
          desktop={desktop}
          onBusy={onBusy}
          onDone={(changed) => onDone(changed || sentFromCard.current)}
        />
      </SheetPages>
    );
  }

  let content: ReactNode;
  switch (step.kind) {
    case "reading":
      content = <Waiting text={t("cards.wallet.readingMain")} testID="card-wallet-reading-main" />;
      break;
    case "amount":
      content = desktop ? (
        <RechargeDesktop
          card={card}
          label={label}
          main={step.main}
          entry={rechargeEntry}
          onEntry={setRechargeEntry}
          prepare={(amount) => prepareRecharge(lease, amount)}
          onChange={() => go({ kind: "other", back: step, unread: false, failed: false })}
          onShort={(main) => {
            if (main !== step.main) goFrom(step, { kind: "amount", main });
          }}
          onSend={(transfer) => sendNow(step, "recharge", transfer)}
          onCancel={() => onDone(false)}
        />
      ) : (
        <RechargeAmount
          main={step.main}
          entry={rechargeEntry}
          onEntry={setRechargeEntry}
          onChange={() => go({ kind: "other", back: step, unread: false, failed: false })}
          submit={async (amount) => {
            confirm(step, "recharge", await prepareRecharge(lease, amount));
          }}
          // Short of the amount and its fee once synced: what it holds, said in place.
          onShort={(main) => goFrom(step, { kind: "amount", main })}
          onFail={(error) => fail(step, error, t("cards.wallet.prepareFailed"), step)}
        />
      );
      break;
    case "other":
      content = (
        <OtherWallet
          lease={lease}
          desktop={desktop}
          unread={step.unread}
          failed={step.failed}
          onFromMain={() => go({ kind: "reading", again: true })}
          onInvoice={() => go({ kind: "invoiceAmount", back: step })}
          onBitcoin={() => go({ kind: "bitcoin", back: step })}
        />
      );
      break;
    case "invoiceAmount":
      content = desktop ? (
        <InvoiceAmountDesktop
          entry={invoiceEntry}
          onEntry={setInvoiceEntry}
          submit={async (amount) => {
            const invoice = await cardInvoice(lease, amount, t("cards.wallet.invoiceDescription"));
            goFrom(step, { kind: "invoice", invoice, back: step });
          }}
          onFail={(error) => fail(step, error, t("cards.wallet.receiveFailed"), step)}
          onCancel={() => onDone(false)}
        />
      ) : (
        <InvoiceAmount
          entry={invoiceEntry}
          onEntry={setInvoiceEntry}
          submit={async (amount) => {
            const invoice = await cardInvoice(lease, amount, t("cards.wallet.invoiceDescription"));
            goFrom(step, { kind: "invoice", invoice, back: step });
          }}
          onFail={(error) => fail(step, error, t("cards.wallet.receiveFailed"), step)}
        />
      );
      break;
    case "invoice":
      content = (
        <InvoiceView
          key={step.invoice.invoice}
          lease={lease}
          desktop={desktop}
          invoice={step.invoice}
          onPaid={() => goFrom(step, { ...step, paid: true })}
          onNew={() => go(step.back)}
          onDone={() => onDone(true)}
        />
      );
      break;
    case "bitcoin":
      content = <BitcoinAddress lease={lease} desktop={desktop} />;
      break;
    case "returnAmount":
      content = desktop ? (
        <ReturnDesktop
          card={card}
          label={label}
          held={cardHeld}
          entry={returnEntry}
          onEntry={setReturnEntry}
          prepare={(amount, all) => prepareReturn(lease, all ? undefined : amount)}
          onHeld={setCardHeld}
          onNothing={() => finish(step, "warning", t("cards.wallet.nothingToReturn"))}
          onSend={(transfer) => sendNow(step, "return", transfer)}
          onCancel={() => onDone(false)}
        />
      ) : (
        <ReturnAmount
          label={label}
          held={cardHeld}
          sats={returnSats}
          onSats={setReturnSats}
          onHeld={setCardHeld}
          submit={async (amount, all) => {
            const transfer = await prepareReturn(lease, all ? undefined : amount);
            setCardHeld(transfer.cardBalanceSats);
            // "Empty the card": what it holds now, whatever was read before.
            if (all) setReturnSats(transfer.cardBalanceSats);
            confirm(step, "return", transfer);
          }}
          onFail={(error) => {
            if (error instanceof NothingToReturnError) {
              finish(step, "warning", t("cards.wallet.nothingToReturn"));
            } else {
              fail(step, error, t("cards.wallet.prepareFailed"), step);
            }
          }}
        />
      );
      break;
    case "confirm":
      content = (
        <Confirmation
          card={card}
          label={label}
          desktop={desktop}
          step={step}
          onSend={() => send(step)}
          onCancel={() => {
            giveUp();
            go(step.back);
          }}
        />
      );
      break;
    case "working":
      content = <Waiting text={t("cards.wallet.working")} testID="card-wallet-working" />;
      break;
    case "failed": {
      const { back } = step;
      content = (
        <View style={styles.content}>
          <Callout tone="error" title={t("cards.sheet.failedTitle")} testID="card-wallet-error">
            {step.message}
          </Callout>
          <View style={desktop ? styles.dialogActions : null}>
            <Button
              variant="secondary"
              size="md"
              fullWidth={!desktop}
              style={desktop ? styles.dialogCancel : undefined}
              onPress={() => (back ? go(back) : onDone(true))}
              testID="card-wallet-back"
            >
              {t("cards.sheet.back")}
            </Button>
          </View>
        </View>
      );
      break;
    }
  }
  return (
    <SheetPages page={page}>
      <ScrollView
        style={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {content}
      </ScrollView>
    </SheetPages>
  );
}

/**
 * The page of `step`, for the fade from one to the next: the main balance read is the keypad's
 * wait; an invoice paid, a new balance on the keypad stay on their page.
 */
function pageOf(step: Step): string {
  return step.kind === "reading" ? "amount" : step.kind;
}

/** A failure of the passkey's prompt, or a passkey of another account. */
function passkeyFailure(error: unknown): boolean {
  return error instanceof PasskeyError || error instanceof OtherAccountError;
}

function Waiting({ text, testID }: { text: string; testID: string }) {
  const styles = useStyles();
  return (
    <View style={styles.waiting} testID={testID}>
      <Spinner />
      <Text style={styles.waitingText}>{text}</Text>
    </View>
  );
}

/** Copies `text`, said by a notification. */
function useCopy(): (text: string) => void {
  const { t } = useTranslation();
  const { notify } = useNotifications();
  return (text) => {
    const fail = () =>
      notify({ tone: "error", title: t("cards.wallet.copyFailed"), key: "card-wallet" });
    Clipboard.setStringAsync(text).then(
      (copied) =>
        copied
          ? notify({ tone: "success", title: t("cards.wallet.copied"), key: "card-wallet" })
          : fail(),
      fail
    );
  };
}

/** Whether a share sheet opens here: in the apps, and in a browser that has one. */
function canShare(): boolean {
  return (
    Platform.OS !== "web" ||
    (typeof navigator !== "undefined" && typeof navigator.share === "function")
  );
}

/** Opens the system's share sheet with `text`, within the tap (a browser asks a gesture). */
function share(text: string): void {
  shareWithSystem({ message: text }).catch((error: unknown) => {
    // Dismissed in a browser (a DOMException, not an Error in every browser): nothing to say.
    if ((error as { name?: unknown } | null)?.name === "AbortError") return;
    logFailure("Sharing a card's payment code failed", error);
  });
}

/** "Copy" and "Share" of a code's text (`null`: not there yet). */
function CopyShare({ value }: { value: string | null }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const copy = useCopy();
  return (
    <View style={styles.pair}>
      <View style={styles.half}>
        <Button
          variant="secondary"
          size="md"
          icon="copy"
          disabled={value === null}
          onPress={() => {
            if (value !== null) copy(value);
          }}
          testID="card-wallet-copy"
        >
          {t("cards.wallet.copy")}
        </Button>
      </View>
      {canShare() ? (
        <View style={styles.half}>
          <Button
            variant="secondary"
            size="md"
            icon="share-nodes"
            disabled={value === null}
            onPress={() => {
              if (value !== null) share(value);
            }}
            testID="card-wallet-share"
          >
            {t("cards.wallet.share")}
          </Button>
        </View>
      ) : null}
    </View>
  );
}

/** A means of another wallet, in the accent's ink ("Lightning invoice"…). */
function MeansLink({
  icon,
  label,
  onPress,
  testID
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  testID: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      testID={testID}
      {...hoverProps}
      style={styles.link}
    >
      {({ pressed }) => {
        const color = pressed
          ? colors.button.text.labelActive
          : hovered
            ? colors.button.text.labelHover
            : colors.button.text.label;
        return (
          <>
            <Icon name={icon} size={12} color={color} />
            <Text style={[styles.linkLabel, { color }]}>{label}</Text>
          </>
        );
      }}
    </Pressable>
  );
}

/**
 * The disc before a source's texts: the accent's fill and white for the main balance ("Top up"),
 * the surface in a hairline for where sats go back (to the main balance).
 */
function SourceIcon({ name, tone }: { name: IconName; tone: "accent" | "plain" }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={[styles.sourceIcon, tone === "accent" ? styles.sourceAccent : styles.sourcePlain]}>
      <Icon
        name={name}
        size={13}
        color={tone === "accent" ? colors.text.onAccent : colors.text.primary}
      />
    </View>
  );
}

/**
 * The keypad's entry (`entry`, kept by the flow: `setEntry`): sats, or the account's currency while
 * a rate is known (sats alone without).
 */
function useEntry(entry: AmountEntry, setEntry: Dispatch<SetStateAction<AmountEntry>>) {
  const { t } = useTranslation();
  const { digits, languageTag, rate } = usePos();
  const format = useWalletFormat();
  const amount = entrySats(entry, digits, rate.rate);
  const fiat = amount !== null && amount > 0n ? format.fiat(amount) : null;
  // Its value in the other unit, or why it has none.
  const sub =
    amount === null
      ? t("pos.rateUnavailable")
      : amount === 0n
        ? NBSP
        : entry.unit === "fiat"
          ? formatSats(amount, languageTag)
          : (fiat ?? NBSP);
  return {
    entry,
    /** Its sats at the rate shown; null for fiat without a rate. */
    amount,
    sub,
    // Fiat offered while a rate is known; once chosen, kept to go back to sats.
    fiatAllowed: rate.rate !== undefined || entry.unit === "fiat",
    press: (key: KeypadKey) => setEntry((current) => pressEntryKey(current, key, digits)),
    setUnit: (unit: AmountEntry["unit"]) => setEntry({ ...EMPTY_ENTRY, unit })
  };
}

/** The sats of an entry fixed now: fiat at the rate of this very instant, rounded up (or null). */
function useFixedAmount(): (entry: AmountEntry) => bigint | null {
  const { digits, rate } = usePos();
  return (entry) => entrySats(entry, digits, rate.current());
}

/** "From my main balance", what it holds, and "Change" for another wallet. */
function MainSource({
  available,
  disabled,
  onChange
}: {
  available: bigint;
  disabled: boolean;
  onChange: () => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { languageTag } = usePos();
  const { hovered, hoverProps } = useHover();
  const availableText = t("cards.wallet.mainAvailable", {
    amount: formatSats(available, languageTag)
  });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        t("cards.wallet.fromMain"),
        availableText,
        t("cards.wallet.change")
      ].join(", ")}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onChange}
      {...hoverProps}
      style={({ pressed }) => [
        styles.source,
        (pressed || hovered) && !disabled && styles.sourceActive
      ]}
      testID="card-wallet-change"
    >
      <SourceIcon name="right-left" tone="accent" />
      <View style={styles.sourceTexts}>
        <Text style={styles.sourceTitle}>{t("cards.wallet.fromMain")}</Text>
        <Text style={styles.sourceCaption}>{availableText}</Text>
      </View>
      <Text style={styles.change}>{t("cards.wallet.change")}</Text>
    </Pressable>
  );
}

/** A transfer of what is typed on a desktop, as it would go (useTransferQuote). */
type TransferQuote =
  /** Nothing that could go is typed. */
  | { state: "none" }
  | { state: "preparing" }
  | { state: "ready"; transfer: CardTransfer }
  | { state: "failed"; error: unknown };

/**
 * On a desktop, the transfer of what is typed, prepared as it is typed (as "Send"'s quote,
 * once it stays QUOTE_DELAY_MS): `key` names what it is prepared for (null: nothing to prepare). A
 * transfer prepared for another key, or not taken, is given up as soon as it is replaced (the
 * wallets it holds let go); `take()` hands the ready one over, to be sent or given up by the flow.
 * Failures `expected` names are what the screen says (a balance short of it), the others go to the
 * journal.
 */
function useTransferQuote(
  key: string | null,
  prepare: () => Promise<CardTransfer>,
  expected: (error: unknown) => boolean
) {
  const [round, setRound] = useState(0);
  const [result, setResult] = useState<{ for: string; quote: TransferQuote } | null>(null);
  const forKey = key === null ? null : `${key}#${round}`;
  // The ready transfer still held here, not handed over.
  const held = useRef<CardTransfer | null>(null);
  const prepareNow = useEffectEvent(prepare);
  const unexpected = useEffectEvent((error: unknown) => !expected(error));
  useEffect(() => {
    if (forKey === null) return;
    let current = true;
    const timer = setTimeout(() => {
      prepareNow().then(
        (transfer) => {
          if (!current) {
            void transfer.cancel();
            return;
          }
          held.current = transfer;
          setResult({ for: forKey, quote: { state: "ready", transfer } });
        },
        (error: unknown) => {
          if (!current) return;
          if (unexpected(error)) logFailure("Preparing a card's transfer failed", error);
          setResult({ for: forKey, quote: { state: "failed", error } });
        }
      );
    }, QUOTE_DELAY_MS);
    return () => {
      current = false;
      clearTimeout(timer);
      const transfer = held.current;
      held.current = null;
      void transfer?.cancel();
      // What it said goes with its transfer: the same amount typed again is prepared anew, never
      // shown ready on a transfer given up (its button would do nothing).
      setResult((shown) => (shown?.for === forKey ? null : shown));
    };
  }, [forKey]);
  const quote: TransferQuote =
    forKey === null
      ? { state: "none" }
      : result?.for === forKey
        ? result.quote
        : { state: "preparing" };
  return {
    quote,
    /** The ready transfer, now the caller's; null when there is none (or it was taken). */
    take: (): CardTransfer | null => {
      if (quote.state !== "ready" || held.current !== quote.transfer) return null;
      held.current = null;
      return quote.transfer;
    },
    /** After a failure: prepared again, as it is typed. */
    retry: () => setRound((count) => count + 1)
  };
}

/**
 * The amount on a desktop, typed in its field as "Send"'s: the phone keypad's entry
 * (amount-entry.ts), sats or the
 * account's currency while a rate is known (its unit at the field's end switches them, the amount
 * carried over at the rate of the instant; switched back unedited, the text typed, not a conversion
 * of a conversion); what does not read as an amount is refused as typed. Its value in the other
 * unit, or why it cannot go, under it.
 */
function AmountField({
  entry,
  onEntry,
  fiatAllowed,
  sub,
  warned = false,
  action
}: {
  entry: AmountEntry;
  onEntry: (entry: AmountEntry) => void;
  fiatAllowed: boolean;
  /** A no-break space when there is nothing to say: no jump. */
  sub: string;
  /** What is typed cannot go (beyond a balance): the line under it in the danger's colour. */
  warned?: boolean;
  /** At the end of the label's line (return to the main balance: "Empty the card"). */
  action?: { label: string; icon: IconName; onPress: () => void; testID: string };
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { profile, digits, languageTag, rate } = usePos();
  // As typed ("12," while its decimals come), as long as it reads as the entry shown: an entry set
  // otherwise ("Empty the card", a unit switched) is written anew.
  const [typed, setTyped] = useState<{ text: string; entry: AmountEntry } | null>(null);
  const text =
    typed !== null && sameEntry(typed.entry, entry)
      ? typed.text
      : entryText(entry, digits, languageTag);
  // The text before the last switch of unit and what it became (as "Send").
  const [switched, setSwitched] = useState<{
    before: { text: string; entry: AmountEntry };
    became: AmountEntry;
  } | null>(null);
  const switchUnit = () => {
    if (switched !== null && sameEntry(switched.became, entry)) {
      // Back to the unit it was typed in, unedited since: its own text.
      setTyped(switched.before);
      setSwitched(null);
      onEntry(switched.before.entry);
      return;
    }
    const became = switchedEntry(entry, digits, rate.current());
    setTyped(null);
    setSwitched({ before: { text, entry }, became });
    onEntry(became);
  };
  const currency = profile.currency;
  return (
    <View style={styles.field}>
      <TextField
        label={t("cards.wallet.amountField")}
        labelAction={action}
        value={text}
        onChangeText={(next) => {
          const read = readEntryText(next, entry.unit, digits);
          if (read === null) return;
          setTyped({ text: next, entry: read });
          onEntry(read);
        }}
        placeholder={entry.unit === "fiat" ? fiatPlaceholder(digits, languageTag) : "0"}
        keyboardType={entry.unit === "fiat" ? "decimal-pad" : "number-pad"}
        inputMode={entry.unit === "fiat" ? "decimal" : "numeric"}
        trailing={
          <UnitSwitch
            unit={entry.unit === "fiat" ? currency : "sats"}
            label={
              entry.unit === "fiat"
                ? t("wallet.sendSheet.switchToSats")
                : t("wallet.sendSheet.switchToFiat", { currency })
            }
            enabled={fiatAllowed}
            onPress={switchUnit}
            testID="card-amount-unit"
          />
        }
        testID="card-amount-field"
      />
      <Text style={[styles.fieldSub, warned && styles.fieldSubWarned]} testID="card-amount-sub">
        {sub}
      </Text>
    </View>
  );
}

/** A transfer's line on a desktop: what, then its value, a hairline under it. */
function DialogRow({
  label,
  last = false,
  children
}: {
  label: string;
  last?: boolean;
  children: ReactNode;
}) {
  const styles = useStyles();
  return (
    <View style={[styles.dialogRow, !last && styles.rowSeparated]}>
      <Text style={styles.dialogRowLabel}>{label}</Text>
      {children}
    </View>
  );
}

/** The card in miniature before its name, as a transfer's line says where it goes or comes from. */
function CardValue({
  card,
  label
}: {
  card: Pick<CardState, "cardId" | "look" | "issuer">;
  label: string;
}) {
  const styles = useStyles();
  return (
    <View style={styles.cardValue}>
      <CardMini card={card} />
      <Text style={styles.dialogRowValue} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/**
 * The transfer's fee and what the card holds after it, as prepared (never said before: "Calculating
 * fees…" meanwhile, nothing once it failed).
 */
function useQuoteLines(quote: TransferQuote, action: Action) {
  const { t } = useTranslation();
  const { languageTag } = usePos();
  if (quote.state !== "ready") {
    return {
      fee: quote.state === "preparing" ? t("wallet.sendSheet.feePreparing") : "—",
      after: "—",
      known: false
    };
  }
  const { quote: prepared, cardBalanceSats } = quote.transfer;
  const after =
    action === "recharge"
      ? cardBalanceSats + prepared.amountSats
      : cardBalanceSats - prepared.amountSats - prepared.feeSats;
  return {
    fee:
      prepared.feeSats === 0n ? t("cards.wallet.noFee") : formatSats(prepared.feeSats, languageTag),
    after: formatSats(after, languageTag),
    known: true
  };
}

/** The quote's failure, other than a balance short of it (said in place), and "Try again". */
function QuoteFailed({ onRetry }: { onRetry: () => void }) {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <View style={styles.quoteFailed}>
      <ErrorMessage testID="card-wallet-quote-failed">
        {t("wallet.sendSheet.quoteFailed")}
      </ErrorMessage>
      <Button
        variant="secondary"
        size="md"
        fullWidth={false}
        onPress={onRetry}
        testID="card-wallet-quote-retry"
      >
        {t("card.retry")}
      </Button>
    </View>
  );
}

/**
 * "Top up" from the main balance on a desktop, as "Send": its source and "Change", the amount in
 * its field, then the transfer as it would go, prepared as it is typed (to the card, its fee, what
 * the card holds after it), "Cancel" and "Top up 20,000 sats", which asks the passkey (`onSend`).
 * Short of it once synced: what the main balance holds, said in place (`onShort`).
 */
function RechargeDesktop({
  card,
  label,
  main,
  entry: typed,
  onEntry,
  prepare,
  onChange,
  onShort,
  onSend,
  onCancel
}: {
  card: Pick<CardState, "cardId" | "look" | "issuer">;
  label: string;
  main: bigint;
  entry: AmountEntry;
  onEntry: Dispatch<SetStateAction<AmountEntry>>;
  prepare: (amount: bigint) => Promise<CardTransfer>;
  onChange: () => void;
  onShort: (main: bigint) => void;
  onSend: (transfer: CardTransfer) => void;
  onCancel: () => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { languageTag, rate } = usePos();
  const entry = useEntry(typed, onEntry);
  const fixed = useFixedAmount();
  const over = entry.amount !== null && entry.amount > main;
  const sats = entry.amount !== null && entry.amount >= 1n && !over ? entry.amount : null;
  // Typed in the currency, its sats are the hour's: a new hour, prepared anew.
  const { quote, take, retry } = useTransferQuote(
    sats === null ? null : `${sats}@${typed.unit === "fiat" ? rate.hour : "sats"}`,
    () => prepare(sats ?? 0n),
    (error) => error instanceof InsufficientMainBalanceError
  );
  const shortOf = quote.state === "failed" && quote.error instanceof InsufficientMainBalanceError;
  const failure = quote.state === "failed" ? quote.error : null;
  const tellShort = useEffectEvent(onShort);
  useEffect(() => {
    if (failure instanceof InsufficientMainBalanceError) tellShort(failure.balanceSats);
  }, [failure]);
  const lines = useQuoteLines(quote, "recharge");
  const transfer = quote.state === "ready" ? quote.transfer : null;
  return (
    <View style={styles.content} testID="card-wallet-amount-recharge">
      <MainSource available={main} disabled={false} onChange={onChange} />
      <AmountField
        entry={typed}
        onEntry={onEntry}
        fiatAllowed={entry.fiatAllowed}
        sub={over || shortOf ? t("cards.wallet.mainShort") : entry.sub}
        warned={over || shortOf}
      />
      <View>
        <DialogRow label={t("cards.wallet.rowTo")}>
          <CardValue card={card} label={label} />
        </DialogRow>
        <DialogRow label={t("cards.wallet.rowFee")}>
          <Text
            style={[styles.dialogRowValue, !lines.known && styles.dialogRowPending]}
            testID="card-wallet-fee"
          >
            {lines.fee}
          </Text>
        </DialogRow>
        <DialogRow label={t("cards.wallet.rowAfter")} last>
          <Text
            style={[styles.dialogRowValue, !lines.known && styles.dialogRowPending]}
            testID="card-wallet-after"
          >
            {lines.after}
          </Text>
        </DialogRow>
      </View>
      {failure !== null && !shortOf ? <QuoteFailed onRetry={retry} /> : null}
      <View style={styles.dialogActions}>
        <Button
          variant="secondary"
          size="md"
          fullWidth={false}
          style={styles.dialogCancel}
          onPress={onCancel}
          testID="card-wallet-cancel"
        >
          {t("common.cancel")}
        </Button>
        <Button
          icon="key"
          size="md"
          fullWidth={false}
          style={styles.dialogGo}
          disabled={transfer === null}
          onPress={() => {
            // Fixed again at this instant: an amount of an hour gone is prepared anew first.
            if (transfer === null || fixed(entry.entry) !== transfer.quote.amountSats) return;
            const taken = take();
            if (taken) onSend(taken);
          }}
          testID="card-wallet-send"
        >
          {sats !== null
            ? t("cards.wallet.rechargeAmount", { amount: formatSats(sats, languageTag) })
            : t("cards.wallet.recharge")}
        </Button>
      </View>
    </View>
  );
}

/**
 * Back to the main balance on a desktop: where the sats go and what the card holds (`held`, as last
 * read; again by a transfer it was short for: `onHeld`), the amount in its field with "Empty the
 * card", then the transfer as it would go (from the card, to the main balance, its fee, what the
 * card holds after it), "Cancel" and "Withdraw 10,000 sats", which asks the passkey. "Empty the
 * card" sends what the card holds when it goes (`all`), the amount following what a transfer
 * prepared finds on the card.
 */
function ReturnDesktop({
  card,
  label,
  held,
  entry: typed,
  onEntry,
  prepare,
  onHeld,
  onNothing,
  onSend,
  onCancel
}: {
  card: Pick<CardState, "cardId" | "look" | "issuer">;
  label: string;
  held: bigint;
  entry: AmountEntry;
  onEntry: Dispatch<SetStateAction<AmountEntry>>;
  prepare: (amount: bigint, all: boolean) => Promise<CardTransfer>;
  onHeld: (held: bigint) => void;
  /** The card holds nothing to send back (said by the transfer). */
  onNothing: () => void;
  onSend: (transfer: CardTransfer) => void;
  onCancel: () => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { languageTag, rate } = usePos();
  const format = useWalletFormat();
  const entry = useEntry(typed, onEntry);
  const fixed = useFixedAmount();
  const sats = entry.amount;
  const all = sats !== null && sats > 0n && sats === held;
  const over = sats !== null && sats > held;
  const going = sats !== null && sats >= 1n && !over ? sats : null;
  // The whole card goes whatever it holds: prepared once, whatever the amount it follows.
  const { quote, take, retry } = useTransferQuote(
    going === null ? null : all ? "all" : `${going}@${typed.unit === "fiat" ? rate.hour : "sats"}`,
    () => prepare(going ?? 0n, all),
    (error) =>
      error instanceof InsufficientCardBalanceError || error instanceof NothingToReturnError
  );
  const failure = quote.state === "failed" ? quote.error : null;
  const tellHeld = useEffectEvent(onHeld);
  const tellNothing = useEffectEvent(onNothing);
  useEffect(() => {
    if (failure instanceof InsufficientCardBalanceError) tellHeld(failure.balanceSats);
    else if (failure instanceof NothingToReturnError) tellNothing();
  }, [failure]);
  const lines = useQuoteLines(quote, "return");
  const transfer = quote.state === "ready" ? quote.transfer : null;
  // What the card holds as the transfer was prepared: "Empty the card", what it holds now, whatever
  // was read before (as on a phone).
  const follow = useEffectEvent((prepared: CardTransfer) => {
    const now = prepared.cardBalanceSats;
    if (now === held) return;
    onHeld(now);
    if (all && typed.unit === "sats") onEntry({ unit: "sats", sats: now, minor: 0 });
  });
  useEffect(() => {
    if (transfer !== null) follow(transfer);
  }, [transfer]);
  const fiat = sats !== null && sats > 0n ? format.fiat(sats) : null;
  // Its value in the other unit, as "Top up": what the card holds after it is the transfer's line,
  // its fee counted.
  const sub = over
    ? t("cards.wallet.cardHoldsOnly", { amount: formatSats(held, languageTag) })
    : all
      ? fiat
        ? t("cards.wallet.allOf", { fiat })
        : t("cards.wallet.wholeBalance")
      : entry.sub;
  // What goes: as prepared ("Empty the card": what the card holds then, less its fee), else typed.
  const amount = transfer ? transfer.quote.amountSats : going;
  return (
    <View style={styles.content} testID="card-wallet-amount-return">
      <View style={[styles.source, styles.sourceTall]}>
        <SourceIcon name="arrow-up" tone="plain" />
        <View style={styles.sourceTexts}>
          <Text style={styles.sourceTitle}>{t("cards.wallet.toMain")}</Text>
          <Text style={styles.sourceCaption}>
            {t("cards.wallet.fromCard", { name: label, amount: formatSats(held, languageTag) })}
          </Text>
        </View>
      </View>
      <AmountField
        entry={typed}
        onEntry={onEntry}
        fiatAllowed={entry.fiatAllowed}
        sub={sub}
        warned={over}
        // Gone once chosen.
        action={
          all
            ? undefined
            : {
                label: t("cards.wallet.emptyCard"),
                icon: "trash-can",
                onPress: () => onEntry({ unit: "sats", sats: held, minor: 0 }),
                testID: "card-wallet-empty"
              }
        }
      />
      <View>
        <DialogRow label={t("cards.wallet.rowFrom")}>
          <CardValue card={card} label={label} />
        </DialogRow>
        <DialogRow label={t("cards.wallet.rowTo")}>
          <Text style={styles.dialogRowValue}>{t("cards.wallet.mainBalance")}</Text>
        </DialogRow>
        <DialogRow label={t("cards.wallet.rowFee")}>
          <Text
            style={[styles.dialogRowValue, !lines.known && styles.dialogRowPending]}
            testID="card-wallet-fee"
          >
            {lines.fee}
          </Text>
        </DialogRow>
        <DialogRow label={t("cards.wallet.rowAfter")} last>
          <Text
            style={[styles.dialogRowValue, !lines.known && styles.dialogRowPending]}
            testID="card-wallet-after"
          >
            {lines.after}
          </Text>
        </DialogRow>
      </View>
      {failure !== null &&
      !(failure instanceof InsufficientCardBalanceError) &&
      !(failure instanceof NothingToReturnError) ? (
        <QuoteFailed onRetry={retry} />
      ) : null}
      <View style={styles.dialogActions}>
        <Button
          variant="secondary"
          size="md"
          fullWidth={false}
          style={styles.dialogCancel}
          onPress={onCancel}
          testID="card-wallet-cancel"
        >
          {t("common.cancel")}
        </Button>
        <Button
          icon="key"
          size="md"
          fullWidth={false}
          style={styles.dialogGo}
          disabled={transfer === null}
          onPress={() => {
            // Fixed again at this instant (typed in the currency): an hour gone, prepared anew.
            if (transfer === null || (typed.unit === "fiat" && fixed(entry.entry) !== going)) {
              return;
            }
            const taken = take();
            if (taken) onSend(taken);
          }}
          testID="card-wallet-send"
        >
          {amount !== null
            ? t("cards.wallet.returnAmount", { amount: formatSats(amount, languageTag) })
            : t("cards.home.withdraw")}
        </Button>
      </View>
    </View>
  );
}

/**
 * "Lightning invoice" on a desktop: the amount in its field, which its payer cannot change, then
 * "Cancel" and "Create the invoice".
 */
function InvoiceAmountDesktop({
  entry: typed,
  onEntry,
  submit,
  onFail,
  onCancel
}: {
  entry: AmountEntry;
  onEntry: Dispatch<SetStateAction<AmountEntry>>;
  submit: (amount: bigint) => Promise<void>;
  onFail: (error: unknown) => void;
  onCancel: () => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const entry = useEntry(typed, onEntry);
  const fixed = useFixedAmount();
  const [running, setRunning] = useState(false);
  const ok = entry.amount !== null && entry.amount >= 1n;
  return (
    // Its parts 16 apart.
    <View style={[styles.content, styles.contentWider]} testID="card-wallet-amount-invoice">
      <AmountField
        entry={typed}
        onEntry={onEntry}
        fiatAllowed={entry.fiatAllowed}
        sub={entry.sub}
      />
      <View style={styles.dialogActions}>
        <Button
          variant="secondary"
          size="md"
          fullWidth={false}
          style={styles.dialogCancel}
          disabled={running}
          onPress={onCancel}
          testID="card-wallet-cancel"
        >
          {t("common.cancel")}
        </Button>
        <Button
          icon="bolt"
          size="md"
          fullWidth={false}
          style={styles.dialogGo}
          disabled={!ok}
          loading={running}
          onPress={() => {
            const value = fixed(entry.entry);
            if (value === null || value < 1n) return;
            setRunning(true);
            submit(value).then(
              () => setRunning(false),
              (failure: unknown) => {
                setRunning(false);
                onFail(failure);
              }
            );
          }}
          testID="card-wallet-invoice-create"
        >
          {t("cards.wallet.invoiceCreate")}
        </Button>
      </View>
    </View>
  );
}

/**
 * "Copy the address", "Copy the invoice" on a desktop: one button of 44 px, no share sheet; centred
 * under its code, or as wide as its column (`fullWidth`).
 */
function CopyButton({
  value,
  label,
  fullWidth = false
}: {
  value: string | null;
  label: string;
  fullWidth?: boolean;
}) {
  const styles = useStyles();
  const copy = useCopy();
  return (
    <Button
      variant="secondary"
      size="sm"
      icon="copy"
      fullWidth={fullWidth}
      style={fullWidth ? undefined : styles.centredButton}
      disabled={value === null}
      onPress={() => {
        if (value !== null) copy(value);
      }}
      testID="card-wallet-copy"
    >
      {label}
    </Button>
  );
}

/**
 * "Top up" from the main balance: an amount, which held `main` sats as last read (again by a
 * transfer it was short for: `onShort`); "Change" for another wallet.
 */
function RechargeAmount({
  main,
  entry: typed,
  onEntry,
  onChange,
  submit,
  onShort,
  onFail
}: {
  main: bigint;
  entry: AmountEntry;
  onEntry: Dispatch<SetStateAction<AmountEntry>>;
  onChange: () => void;
  submit: (amount: bigint) => Promise<void>;
  onShort: (main: bigint) => void;
  onFail: (error: unknown) => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const entry = useEntry(typed, onEntry);
  const fixed = useFixedAmount();
  const [running, setRunning] = useState(false);
  const available = main;
  // Short of the amount and its fee (said by the transfer), until the amount changes.
  const [short, setShort] = useState(false);
  const over = short || (entry.amount !== null && entry.amount > available);
  const ok = entry.amount !== null && entry.amount >= 1n && !over;
  return (
    <View style={styles.content} testID="card-wallet-amount-recharge">
      <MainSource available={available} disabled={running} onChange={onChange} />
      <AmountEntryView
        entry={entry.entry}
        sub={over ? t("cards.wallet.mainShort") : entry.sub}
        warned={over}
        fiatAllowed={entry.fiatAllowed}
        onKey={(key) => {
          setShort(false);
          entry.press(key);
        }}
        onUnit={(unit) => {
          setShort(false);
          entry.setUnit(unit);
        }}
      />
      <Button
        disabled={!ok}
        loading={running}
        onPress={() => {
          const value = fixed(entry.entry);
          if (value === null || value < 1n || value > available) return;
          setRunning(true);
          submit(value).then(
            () => setRunning(false),
            (failure: unknown) => {
              setRunning(false);
              if (failure instanceof InsufficientMainBalanceError) {
                onShort(failure.balanceSats);
                setShort(true);
              } else {
                onFail(failure);
              }
            }
          );
        }}
        testID="card-wallet-continue"
      >
        {t("cards.wallet.continue")}
      </Button>
    </View>
  );
}

/**
 * "Top up" from any other wallet: the card's Lightning address first, then an invoice or an
 * on-chain address; with "From my main balance" on top when that was not read.
 */
function OtherWallet({
  lease,
  desktop,
  unread,
  failed,
  onFromMain,
  onInvoice,
  onBitcoin
}: {
  lease: CardWalletLease;
  /** A desktop: "Copy the address" alone. */
  desktop: boolean;
  unread: boolean;
  failed: boolean;
  onFromMain: () => void;
  onInvoice: () => void;
  onBitcoin: () => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const [attempt, setAttempt] = useState(0);
  const [read, setRead] = useState<{ attempt: number; address: string | null } | null>(null);
  useEffect(() => {
    let current = true;
    cardLightningAddress(lease).then(
      (address) => {
        if (current) setRead({ attempt, address });
      },
      (error: unknown) => {
        logFailure("A card's Lightning address could not be read", error);
        if (current) setRead({ attempt, address: null });
      }
    );
    return () => {
      current = false;
    };
  }, [lease, attempt]);
  // This attempt's: being read (undefined), failed (null), or the address.
  const address = read?.attempt === attempt ? read.address : undefined;
  return (
    <View style={[styles.content, !desktop && styles.contentWide]} testID="card-wallet-other">
      {unread ? (
        <>
          <Button icon="right-left" onPress={onFromMain} testID="card-wallet-from-main">
            {t("cards.wallet.fromMain")}
          </Button>
          {failed ? (
            // Asked again, read again in vain: never silent.
            <Callout tone="warning" testID="card-wallet-main-unread">
              {t("cards.wallet.mainUnread")}
            </Callout>
          ) : null}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>{t("cards.wallet.orAnyWallet")}</Text>
            <View style={styles.dividerLine} />
          </View>
        </>
      ) : null}
      {address === null ? (
        <>
          <Callout tone="error" testID="card-wallet-address-failed">
            {t("cards.wallet.receiveFailed")}
          </Callout>
          <Button
            variant="secondary"
            size="md"
            onPress={() => setAttempt((count) => count + 1)}
            testID="card-wallet-address-retry"
          >
            {t("card.retry")}
          </Button>
        </>
      ) : (
        <>
          <View style={[styles.code, desktop && styles.codeDesktop]}>
            <CodePlate
              value={address ?? null}
              size={desktop ? DESKTOP_CODE_SIZE : unread ? SMALL_CODE_SIZE : CODE_SIZE}
              testID="card-wallet-code"
            />
            {address ? (
              <Text
                selectable
                style={[styles.address, desktop && styles.addressDesktop]}
                testID="card-wallet-code-text"
              >
                {address}
              </Text>
            ) : null}
            <Text style={[styles.codeNote, desktop && styles.codeNoteDesktop]}>
              {t("cards.wallet.addressNote")}
            </Text>
          </View>
          {desktop ? (
            <CopyButton value={address ?? null} label={t("cards.wallet.copyAddress")} />
          ) : (
            <CopyShare value={address ?? null} />
          )}
        </>
      )}
      <View style={styles.links}>
        <MeansLink
          icon="bolt"
          label={t("cards.wallet.invoice")}
          onPress={onInvoice}
          testID="card-wallet-invoice"
        />
        <MeansLink
          icon="bitcoin-sign"
          label={t("cards.wallet.onchain")}
          onPress={onBitcoin}
          testID="card-wallet-onchain"
        />
      </View>
    </View>
  );
}

/** "Lightning invoice": its amount on the keypad, which its payer cannot change. */
function InvoiceAmount({
  entry: typed,
  onEntry,
  submit,
  onFail
}: {
  entry: AmountEntry;
  onEntry: Dispatch<SetStateAction<AmountEntry>>;
  submit: (amount: bigint) => Promise<void>;
  onFail: (error: unknown) => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const entry = useEntry(typed, onEntry);
  const fixed = useFixedAmount();
  const [running, setRunning] = useState(false);
  const ok = entry.amount !== null && entry.amount >= 1n;
  return (
    <View style={styles.content} testID="card-wallet-amount-invoice">
      <AmountEntryView
        entry={entry.entry}
        sub={entry.sub}
        fiatAllowed={entry.fiatAllowed}
        onKey={entry.press}
        onUnit={entry.setUnit}
      />
      <Button
        icon="bolt"
        disabled={!ok}
        loading={running}
        onPress={() => {
          const value = fixed(entry.entry);
          if (value === null || value < 1n) return;
          setRunning(true);
          submit(value).then(
            () => setRunning(false),
            (failure: unknown) => {
              setRunning(false);
              onFail(failure);
            }
          );
        }}
        testID="card-wallet-invoice-create"
      >
        {t("cards.wallet.invoiceCreate")}
      </Button>
    </View>
  );
}

/** "18 October at 10:42", in the device locale. */
function dayAndTime(seconds: number, languageTag: string): string {
  return formatDate(new Date(seconds * 1000), languageTag, {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit"
  });
}

/** An invoice's start and end in one line (17 characters, "…", its last 7). */
function shortened(invoice: string): string {
  return invoice.length > 25 ? `${invoice.slice(0, 17)}…${invoice.slice(-7)}` : invoice;
}

/**
 * A figure and its unit (the amount of an invoice, of a transfer, of a payment); `tone` success: a
 * payment received, on a desktop.
 */
function Figure({
  value,
  size,
  tone = "plain"
}: {
  value: string;
  size: "large" | "beside" | "medium";
  tone?: "plain" | "success";
}) {
  const styles = useStyles();
  const success = tone === "success" ? styles.figureSuccess : null;
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${value} sats`}
      style={[styles.figureLine, FIGURE_SIZES[size].line]}
    >
      <Text style={[styles.figure, FIGURE_SIZES[size].figure, success]}>{value}</Text>
      <Text style={[styles.figureUnit, FIGURE_SIZES[size].unit, success]}>sats</Text>
    </View>
  );
}

/**
 * "Lightning invoice": the invoice, its payment awaited, the card's wallet connected, and said as
 * soon as the wallet has it ("Invoice paid"); past its time, "Invoice expired".
 */
function InvoiceView({
  lease,
  desktop,
  invoice,
  onPaid,
  onNew,
  onDone
}: {
  lease: CardWalletLease;
  /** A desktop: the code beside its amount. */
  desktop: boolean;
  invoice: CardInvoice;
  /** Its payment seen. */
  onPaid: () => void;
  onNew: () => void;
  onDone: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const { languageTag } = usePos();
  const format = useWalletFormat();
  const [paid, setPaid] = useState<bigint | null>(null);
  // Past its time by this device's clock (its deadline: counted from when the wallet gave it), and
  // read since without its payment: never said on the time alone.
  const [lapsed, setLapsed] = useState(false);
  const expired = paid === null && lapsed;
  const tellPaid = useEffectEvent(onPaid);
  // Its payment looked for until it comes, also once expired (one on its way at the end).
  useEffect(() => {
    if (paid !== null) return;
    let current = true;
    let reading = false;
    let logged = false;
    const look = () => {
      if (reading) return;
      reading = true;
      const startedAt = Date.now();
      cardInvoicePayment(lease, invoice)
        .then(
          (payment) => {
            if (!current) return;
            if (payment) {
              setPaid(payment.amountSats);
              tellPaid();
            } else if (startedAt >= invoice.deadline) {
              setLapsed(true);
            }
          },
          (error: unknown) => {
            // Once: it is read again every few seconds.
            if (!logged) logFailure("Reading a card's invoice payment failed", error);
            logged = true;
          }
        )
        .finally(() => {
          reading = false;
        });
    };
    look();
    const timer = setInterval(look, CARD_INVOICE_POLL_MS);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [lease, invoice, paid]);
  // Said to screen readers as it comes (the web: the live region below).
  const paidText = paid === null ? null : t("cards.wallet.invoicePaid");
  useEffect(() => {
    if (paidText !== null && Platform.OS !== "web") {
      AccessibilityInfo.announceForAccessibility(paidText);
    }
  }, [paidText]);

  if (paid !== null) {
    return (
      <View style={desktop ? styles.paidContent : styles.content} testID="card-wallet-invoice-paid">
        {/* On a desktop, smaller, its amount in the success's colour. */}
        <View accessibilityLiveRegion="polite" style={[styles.paid, desktop && styles.paidDesktop]}>
          <View style={[styles.paidIcon, desktop && styles.paidIconDesktop]}>
            <Icon name="check" size={desktop ? 26 : 30} color={colors.success.fg} />
          </View>
          <Text style={[styles.paidTitle, desktop && styles.paidTitleDesktop]}>{paidText}</Text>
          <Figure
            value={`+${formatInteger(paid, languageTag)}`}
            size={desktop ? "beside" : "medium"}
            tone={desktop ? "success" : "plain"}
          />
          <Text style={styles.paidCaption}>{t("cards.wallet.invoiceAdded")}</Text>
        </View>
        <View style={desktop ? styles.dialogActions : null}>
          <Button
            size={desktop ? "md" : "lg"}
            fullWidth={!desktop}
            style={desktop ? styles.dialogGo : undefined}
            onPress={onDone}
            testID="card-wallet-finish"
          >
            {t("cards.wallet.finish")}
          </Button>
        </View>
      </View>
    );
  }
  const fiat = format.fiat(invoice.amountSats);
  const amount = (
    <View style={desktop ? styles.summaryStart : styles.summarySmall}>
      <Figure
        value={formatInteger(invoice.amountSats, languageTag)}
        size={desktop ? "beside" : "medium"}
      />
      {fiat ? <Text style={desktop ? styles.fiatBeside : styles.fiatSmall}>{fiat}</Text> : null}
    </View>
  );
  if (expired) {
    const faded = (
      <View style={styles.code}>
        {/* Faded whole on a phone, its modules alone on a desktop. */}
        <View
          style={desktop ? null : styles.faded}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <CodePlate
            value={`lightning:${invoice.invoice}`}
            size={desktop ? BESIDE_CODE_SIZE : SMALL_CODE_SIZE}
            faded={desktop}
          />
        </View>
        {/* Over the faded code ("Invoice expired"). */}
        <View style={styles.expiredLayer} pointerEvents="box-none">
          <View accessibilityLiveRegion="polite" style={styles.expiredPill}>
            <Icon name="clock" size={13} color={colors.warning.fg} />
            <Text style={styles.expiredText}>{t("cards.wallet.invoiceExpired")}</Text>
          </View>
        </View>
      </View>
    );
    const note = t("cards.wallet.invoiceExpiredNote", {
      date: dayAndTime(invoice.expiresAt, languageTag)
    });
    if (desktop) {
      return (
        <View style={styles.beside} testID="card-wallet-invoice-expired">
          {faded}
          <View style={[styles.besideTexts, styles.besideTextsWide]}>
            {amount}
            <Text style={styles.expiredNoteStart}>{note}</Text>
            <Button icon="bolt" size="md" onPress={onNew} testID="card-wallet-invoice-new">
              {t("cards.wallet.newInvoice")}
            </Button>
          </View>
        </View>
      );
    }
    return (
      <View style={[styles.content, styles.contentWider]} testID="card-wallet-invoice-expired">
        {faded}
        <Text style={styles.expiredNote}>{note}</Text>
        <Button icon="bolt" onPress={onNew} testID="card-wallet-invoice-new">
          {t("cards.wallet.newInvoice")}
        </Button>
      </View>
    );
  }
  const waiting = (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.waitingPill, desktop && styles.waitingPillStart]}
    >
      <Spinner size={16} />
      <Text style={styles.waitingPillText}>{t("cards.wallet.invoiceWaiting")}</Text>
    </View>
  );
  const hint = t("cards.wallet.invoiceHint", { date: dayAndTime(invoice.expiresAt, languageTag) });
  if (desktop) {
    return (
      <View style={styles.beside} testID="card-wallet-invoice-code">
        <CodePlate
          value={`lightning:${invoice.invoice}`}
          size={BESIDE_CODE_SIZE}
          testID="card-wallet-code"
        />
        <View style={styles.besideTexts}>
          {amount}
          {waiting}
          <Text
            accessibilityLabel={invoice.invoice}
            style={styles.invoiceTextBeside}
            testID="card-wallet-code-text"
          >
            {shortened(invoice.invoice)}
          </Text>
          <CopyButton value={invoice.invoice} label={t("cards.wallet.copyInvoice")} fullWidth />
          <Text style={styles.noteStart}>{hint}</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.content} testID="card-wallet-invoice-code">
      {amount}
      <View style={styles.codeTight}>
        <CodePlate
          value={`lightning:${invoice.invoice}`}
          size={SMALL_CODE_SIZE}
          testID="card-wallet-code"
        />
        <Text
          accessibilityLabel={invoice.invoice}
          style={styles.invoiceText}
          testID="card-wallet-code-text"
        >
          {shortened(invoice.invoice)}
        </Text>
      </View>
      {waiting}
      <CopyShare value={invoice.invoice} />
      <Text style={styles.note}>{hint}</Text>
    </View>
  );
}

/** "Bitcoin address": a new address of the card's wallet, and what a deposit implies. */
function BitcoinAddress({ lease, desktop }: { lease: CardWalletLease; desktop: boolean }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { languageTag } = usePos();
  const [attempt, setAttempt] = useState(0);
  const [made, setMade] = useState<{ attempt: number; address: string | null } | null>(null);
  useEffect(() => {
    let current = true;
    cardDepositAddress(lease).then(
      (address) => {
        if (current) setMade({ attempt, address });
      },
      (error: unknown) => {
        logFailure("A card's deposit address could not be made", error);
        if (current) setMade({ attempt, address: null });
      }
    );
    return () => {
      current = false;
    };
  }, [lease, attempt]);
  // This attempt's: being made (undefined), failed (null), or the address.
  const address = made?.attempt === attempt ? made.address : undefined;
  // In two lines: easier to check by halves. On one line on a desktop, in the phone's size rather
  // than its 15 px: the SDK's taproot address (62 characters)
  // stays on one line within the dialog.
  const half = address ? Math.ceil(address.length / 2) : 0;
  return (
    <View
      style={[styles.content, desktop ? styles.contentApart : styles.contentWide]}
      testID="card-wallet-onchain-code"
    >
      {address === null ? (
        <>
          <Callout tone="error" testID="card-wallet-address-failed">
            {t("cards.wallet.receiveFailed")}
          </Callout>
          <Button
            variant="secondary"
            size="md"
            onPress={() => setAttempt((count) => count + 1)}
            testID="card-wallet-address-retry"
          >
            {t("card.retry")}
          </Button>
        </>
      ) : (
        <View style={desktop ? styles.codeGroupDesktop : styles.codeGroup}>
          <View style={[styles.code, desktop && styles.codeDesktop]}>
            <CodePlate
              value={address ? `bitcoin:${address}` : null}
              size={desktop ? DESKTOP_CODE_SIZE : CODE_SIZE}
              testID="card-wallet-code"
            />
            {address ? (
              <Text
                selectable
                accessibilityLabel={address}
                style={styles.bitcoinText}
                testID="card-wallet-code-text"
              >
                {desktop ? address : `${address.slice(0, half)}\n${address.slice(half)}`}
              </Text>
            ) : null}
          </View>
          {desktop ? (
            <CopyButton value={address ?? null} label={t("cards.wallet.copyAddress")} />
          ) : (
            <CopyShare value={address ?? null} />
          )}
        </View>
      )}
      <View style={[styles.facts, desktop && styles.factsDesktop]}>
        <Fact icon="clock" desktop={desktop}>
          {t("cards.wallet.onchainConfirmations")}
        </Fact>
        <Fact icon="money-bill" desktop={desktop}>
          {t("cards.wallet.onchainFee", {
            fee: formatSats(MAX_DEPOSIT_CLAIM_FEE_SATS, languageTag)
          })}
        </Fact>
        <Fact icon="credit-card" desktop={desktop}>
          {t(desktop ? "cards.wallet.onchainOpenHere" : "cards.wallet.onchainOpen")}
        </Fact>
      </View>
    </View>
  );
}

/** A line of what an on-chain top-up implies, after its sign (`desktop`: on a desktop). */
function Fact({ icon, desktop, children }: { icon: IconName; desktop: boolean; children: string }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={[styles.fact, desktop && styles.factDesktop]}>
      <View style={[styles.factIcon, desktop && styles.factIconDesktop]}>
        <Icon name={icon} size={11} color={colors.text.accent} />
      </View>
      <Text style={[styles.factText, desktop && styles.factTextDesktop]}>{children}</Text>
    </View>
  );
}

/**
 * Back to the main balance: an amount (`sats`, kept by the flow) from the card, which holds `held`
 * as last read
 * (again by a transfer it was short for: `onHeld`), to the main balance, or the whole card.
 */
function ReturnAmount({
  label,
  held,
  sats,
  onSats,
  onHeld,
  submit,
  onFail
}: {
  label: string;
  held: bigint;
  sats: bigint;
  onSats: Dispatch<SetStateAction<bigint>>;
  onHeld: (held: bigint) => void;
  submit: (amount: bigint, all: boolean) => Promise<void>;
  onFail: (error: unknown) => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const { languageTag } = usePos();
  const format = useWalletFormat();
  const [running, setRunning] = useState(false);
  const all = sats > 0n && sats === held;
  const over = sats > held;
  const ok = sats >= 1n && !over;
  const fiat = sats > 0n ? format.fiat(sats) : null;
  const sub = over
    ? t("cards.wallet.cardHoldsOnly", { amount: formatSats(held, languageTag) })
    : sats === 0n
      ? NBSP
      : all
        ? fiat
          ? t("cards.wallet.allOf", { fiat })
          : t("cards.wallet.wholeBalance")
        : fiat
          ? t("cards.wallet.partOf", { fiat, left: formatSats(held - sats, languageTag) })
          : t("cards.wallet.partOfSats", { left: formatSats(held - sats, languageTag) });
  return (
    <View style={styles.content} testID="card-wallet-amount-return">
      <View style={styles.source}>
        <SourceIcon name="arrow-up" tone="plain" />
        <View style={styles.sourceTexts}>
          <Text style={styles.sourceTitle}>{t("cards.wallet.toMain")}</Text>
          <Text style={styles.sourceCaption}>
            {t("cards.wallet.fromCard", { name: label, amount: formatSats(held, languageTag) })}
          </Text>
        </View>
      </View>
      <AmountEntryView
        entry={{ unit: "sats", sats, minor: 0 }}
        sub={sub}
        warned={over}
        fiatAllowed={false}
        onKey={(key) => onSats((value) => pressSatsKey(value, key))}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: all }}
          onPress={() => onSats(held)}
          style={({ pressed }) => [
            styles.emptyCard,
            all ? styles.emptyCardOn : pressed && styles.emptyCardPressed
          ]}
          testID="card-wallet-empty"
        >
          <Icon name={all ? "check" : "trash-can"} size={11} color={colors.text.primary} />
          <Text style={styles.emptyCardLabel}>{t("cards.wallet.emptyCard")}</Text>
        </Pressable>
      </AmountEntryView>
      <Button
        disabled={!ok}
        loading={running}
        onPress={() => {
          if (!ok) return;
          setRunning(true);
          submit(sats, all).then(
            () => setRunning(false),
            (failure: unknown) => {
              setRunning(false);
              if (failure instanceof InsufficientCardBalanceError) onHeld(failure.balanceSats);
              else onFail(failure);
            }
          );
        }}
        testID="card-wallet-continue"
      >
        {t("cards.wallet.continue")}
      </Button>
    </View>
  );
}

/**
 * "Confirm the top-up", "Withdraw to my main balance": the transfer exactly as it
 * goes, from where to where (the card in miniature before its name), its fee, and what the card
 * will hold after it (from its balance read as the transfer was prepared), then the passkey.
 */
function Confirmation({
  card,
  label,
  desktop,
  step,
  onSend,
  onCancel
}: {
  card: Pick<CardState, "cardId" | "look" | "issuer">;
  label: string;
  /**
   * A desktop, which shows it only to try again (a passkey dismissed, a network failed): its
   * buttons as the dialog's that sent it ("Cancel", "Top up 20,000 sats").
   */
  desktop: boolean;
  step: Extract<Step, { kind: "confirm" }>;
  onSend: () => void;
  /** A desktop's "Cancel": back to its dialog. */
  onCancel: () => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { languageTag } = usePos();
  const format = useWalletFormat();
  const { quote, cardBalanceSats } = step.transfer;
  const recharge = step.action === "recharge";
  const after = recharge
    ? cardBalanceSats + quote.amountSats
    : cardBalanceSats - quote.amountSats - quote.feeSats;
  const fiat = format.fiat(quote.amountSats);
  const cardValue = (
    <View style={styles.cardValue}>
      <CardMini card={card} />
      <Text style={styles.rowValue} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
  const main = <Text style={styles.rowValue}>{t("cards.wallet.mainBalance")}</Text>;
  return (
    <View style={[styles.content, styles.contentWider]} testID="card-wallet-confirm">
      <View style={styles.summary}>
        <Figure value={formatInteger(quote.amountSats, languageTag)} size="large" />
        {fiat ? <Text style={styles.fiat}>{fiat}</Text> : null}
      </View>
      <View style={styles.rows}>
        <Row label={t("cards.wallet.rowFrom")}>{recharge ? main : cardValue}</Row>
        <Row label={t("cards.wallet.rowTo")}>{recharge ? cardValue : main}</Row>
        <Row label={t("cards.wallet.rowFee")}>
          <Text style={styles.rowValue}>
            {quote.feeSats === 0n
              ? t("cards.wallet.noFee")
              : formatSats(quote.feeSats, languageTag)}
          </Text>
        </Row>
        <Row label={t("cards.wallet.rowAfter")} last>
          <Text style={styles.rowValue} testID="card-wallet-after">
            {formatSats(after, languageTag)}
          </Text>
        </Row>
      </View>
      {step.error !== null ? (
        <Callout tone="error" testID="card-wallet-send-failed">
          {step.error}
        </Callout>
      ) : null}
      {desktop ? (
        <View style={styles.dialogActions}>
          <Button
            variant="secondary"
            size="md"
            fullWidth={false}
            style={styles.dialogCancel}
            onPress={onCancel}
            testID="card-wallet-cancel"
          >
            {t("common.cancel")}
          </Button>
          <Button
            icon="key"
            size="md"
            fullWidth={false}
            style={styles.dialogGo}
            onPress={onSend}
            testID="card-wallet-send"
          >
            {t(recharge ? "cards.wallet.rechargeAmount" : "cards.wallet.returnAmount", {
              amount: formatSats(quote.amountSats, languageTag)
            })}
          </Button>
        </View>
      ) : (
        // No "Cancel" on a phone: the header's way back to the amount, or the panel's close,
        // gives it up.
        <View style={styles.actions}>
          <Button icon="key" onPress={onSend} testID="card-wallet-send">
            {t("cards.wallet.confirmPasskey")}
          </Button>
        </View>
      )}
    </View>
  );
}

/** A line of a transfer's summary: what, then its value. */
function Row({
  label,
  last = false,
  children
}: {
  label: string;
  last?: boolean;
  children: ReactNode;
}) {
  const styles = useStyles();
  return (
    <View style={[styles.row, !last && styles.rowSeparated]}>
      <Text style={styles.rowLabel}>{label}</Text>
      {children}
    </View>
  );
}

/**
 * A figure's sizes: a transfer's summary, an invoice's beside its code on a desktop (34 px), an
 * invoice's on a phone (30 px, 6 px from its unit).
 */
const FIGURE_SIZES = {
  large: {
    line: { gap: 8 },
    figure: { fontSize: 44, letterSpacing: tracking(AMOUNT_EM, 44) },
    unit: { fontSize: 17 }
  },
  beside: {
    line: { gap: 6 },
    figure: { fontSize: 34, letterSpacing: tracking(AMOUNT_EM, 34) },
    unit: { fontSize: 17 }
  },
  medium: {
    line: { gap: 6 },
    figure: { fontSize: 30, letterSpacing: tracking(AMOUNT_EM, 30) },
    unit: { fontSize: 15 }
  }
} as const;

const useStyles = makeStyles(({ colors }) => ({
  // Within the panel's height on a small screen (as "Send").
  scroll: { flexGrow: 0, flexShrink: 1 },
  // The gaps: 12 for the keypads, 14 for the codes, 16 for a summary.
  content: { gap: space[5] },
  contentWide: { gap: 14 },
  contentWider: { gap: space[6] },
  actions: { gap: space[2] },
  waiting: { alignItems: "center", gap: space[4], paddingVertical: space[4] },
  waitingText: {
    ...sans(500),
    fontSize: type.prose,
    lineHeight: proseLineHeight,
    textAlign: "center",
    color: colors.text.secondary
  },
  note: {
    ...sans(500),
    fontSize: type.caption,
    lineHeight: 18,
    textAlign: "center",
    color: colors.text.secondary
  },
  // On a desktop: from the dialog's left edge, its buttons at its right end.
  noteStart: {
    ...sans(500),
    fontSize: type.caption,
    lineHeight: 18,
    color: colors.text.secondary
  },
  // As "Send"'s on a desktop (SendSheet.tsx): "Cancel" and the dialog's action.
  dialogActions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 12 },
  dialogCancel: { minWidth: 150 },
  dialogGo: { minWidth: 250 },
  centredButton: { alignSelf: "center" },
  field: { gap: space[4] },
  fieldSub: {
    ...sans(500),
    fontSize: type.caption,
    fontVariant: ["tabular-nums"],
    color: colors.text.secondary
  },
  fieldSubWarned: { color: colors.danger.fg },
  dialogRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  dialogRowLabel: {
    ...sans(500),
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.text.secondary
  },
  dialogRowValue: {
    ...sans(600),
    flexShrink: 1,
    fontSize: type.label,
    letterSpacing: tracked.label,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
    color: colors.text.primary
  },
  dialogRowPending: { ...sans(500), color: colors.text.secondary },
  quoteFailed: { alignItems: "flex-start", gap: space[4] },
  // The code beside its amount.
  beside: { flexDirection: "row", alignItems: "center", gap: 22 },
  besideTexts: { flex: 1, minWidth: 0, gap: 12 },
  besideTextsWide: { gap: 14 },
  waitingPillStart: { alignSelf: "flex-start" },
  summaryStart: { alignItems: "flex-start", gap: 2 },
  fiatBeside: { ...sans(500), fontSize: type.prose, color: colors.text.secondary },
  invoiceTextBeside: { ...mono(500), fontSize: 14, lineHeight: 20, color: colors.text.primary },
  expiredNoteStart: {
    ...sans(500),
    fontSize: type.prose,
    lineHeight: 21,
    color: colors.text.secondary
  },
  source: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: colors.background.app
  },
  sourceActive: { backgroundColor: colors.background.subtle },
  sourceTall: { minHeight: 68, paddingVertical: 8 },
  sourceIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  },
  sourceAccent: { backgroundColor: colors.background.accent },
  sourcePlain: {
    backgroundColor: colors.background.surface,
    boxShadow: `inset 0 0 0 1px ${colors.border.subtle}`
  },
  sourceTexts: { flex: 1, gap: 1 },
  sourceTitle: { ...sans(600), fontSize: type.prose, color: colors.text.primary },
  sourceCaption: {
    ...sans(500),
    fontSize: type.caption,
    fontVariant: ["tabular-nums"],
    color: colors.text.secondary
  },
  change: { ...sans(600), fontSize: 13, color: colors.text.accent },
  divider: { flexDirection: "row", alignItems: "center", gap: 12 },
  dividerLine: { flex: 1, height: stroke.hairline, backgroundColor: colors.border.subtle },
  dividerText: { ...sans(600), fontSize: type.caption, color: colors.text.secondary },
  code: { alignItems: "center", gap: 10 },
  // On a desktop: 12 between a code, its text and its note; 18 before an on-chain code's facts.
  codeDesktop: { gap: 12 },
  codeGroup: { gap: 14 },
  codeGroupDesktop: { gap: 12 },
  contentApart: { gap: 18 },
  codeTight: { alignItems: "center", gap: 8 },
  address: {
    ...sans(600),
    fontSize: type.prose,
    textAlign: "center",
    color: colors.text.primary
  },
  addressDesktop: { fontSize: type.body },
  codeNote: {
    ...sans(500),
    maxWidth: 320,
    fontSize: type.caption,
    lineHeight: 18,
    textAlign: "center",
    color: colors.text.secondary
  },
  codeNoteDesktop: { maxWidth: 360, fontSize: 13, lineHeight: 19 },
  pair: { flexDirection: "row", gap: 8 },
  half: { flex: 1 },
  links: { flexDirection: "row", justifyContent: "center", gap: space[8] },
  link: { minHeight: control.min, flexDirection: "row", alignItems: "center", gap: 6 },
  linkLabel: { ...sans(600), fontSize: type.label, letterSpacing: tracked.label },
  // #3A332D is no token: the primary text.
  invoiceText: { ...mono(500), fontSize: type.caption, color: colors.text.primary },
  bitcoinText: {
    ...mono(500),
    fontSize: type.label,
    lineHeight: 20,
    textAlign: "center",
    color: colors.text.primary
  },
  waitingPill: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.background.app
  },
  waitingPillText: { ...sans(600), fontSize: 13, color: colors.text.primary },
  summary: { alignItems: "center", gap: space[1], paddingVertical: space[2] },
  summarySmall: { alignItems: "center", gap: space[1] },
  figureLine: { flexDirection: "row", alignItems: "baseline" },
  figure: { ...sans(700), fontVariant: ["tabular-nums"], color: colors.text.primary },
  figureUnit: { ...sans(600), color: colors.text.secondary },
  figureSuccess: { color: colors.success.fg },
  fiat: {
    ...sans(500),
    fontSize: type.prose,
    textAlign: "center",
    color: colors.text.secondary
  },
  fiatSmall: { ...sans(500), fontSize: 13, color: colors.text.secondary },
  rows: {
    borderRadius: radius.lg,
    backgroundColor: colors.background.app,
    paddingVertical: space[2],
    paddingHorizontal: space[6]
  },
  row: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  rowSeparated: { borderBottomWidth: stroke.hairline, borderBottomColor: colors.border.subtle },
  rowLabel: { ...sans(500), fontSize: type.prose, color: colors.text.secondary },
  rowValue: {
    ...sans(600),
    flexShrink: 1,
    fontSize: type.prose,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
    color: colors.text.primary
  },
  cardValue: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  paid: { alignItems: "center", gap: 10, paddingTop: 34, paddingBottom: space[7] },
  paidContent: { gap: 18 },
  paidDesktop: { paddingTop: 18, paddingBottom: 8 },
  paidIcon: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.success.bg,
    alignItems: "center",
    justifyContent: "center"
  },
  paidTitle: {
    ...sans(700),
    fontSize: 22,
    letterSpacing: tracking(TITLE_EM, 22),
    color: colors.text.primary
  },
  paidIconDesktop: { width: 64, height: 64 },
  paidTitleDesktop: { fontSize: 19, letterSpacing: tracking(TITLE_EM, 19) },
  paidCaption: { ...sans(500), fontSize: type.prose, color: colors.text.secondary },
  faded: { opacity: 0.18 },
  expiredLayer: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  expiredPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 40,
    paddingHorizontal: space[6],
    borderRadius: radius.pill,
    backgroundColor: colors.warning.bg
  },
  expiredText: { ...sans(700), fontSize: type.prose, color: colors.warning.fg },
  expiredNote: {
    ...sans(500),
    fontSize: type.prose,
    lineHeight: 21,
    textAlign: "center",
    color: colors.text.secondary
  },
  facts: {
    gap: 8,
    paddingVertical: space[5],
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: colors.background.app
  },
  fact: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  factsDesktop: { gap: 12, paddingVertical: 14 },
  factDesktop: { gap: 12 },
  factIconDesktop: { width: 26, height: 26 },
  factTextDesktop: { paddingTop: 0, color: colors.text.note },
  factIcon: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.background.accentSubtle,
    alignItems: "center",
    justifyContent: "center"
  },
  factText: {
    ...sans(500),
    flex: 1,
    paddingTop: 2,
    fontSize: 13,
    lineHeight: 19,
    color: colors.text.primary
  },
  emptyCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: control.min,
    marginTop: space[2],
    paddingHorizontal: space[6],
    borderRadius: radius.pill,
    borderWidth: stroke.control,
    borderColor: colors.border.subtle,
    backgroundColor: colors.background.surface
  },
  emptyCardOn: {
    borderColor: colors.border.accent,
    backgroundColor: colors.background.accentSubtleStrong
  },
  emptyCardPressed: { backgroundColor: colors.background.subtle },
  emptyCardLabel: { ...sans(600), fontSize: 13, color: colors.text.primary }
}));
