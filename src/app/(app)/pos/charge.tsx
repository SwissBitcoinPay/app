import { useFocusEffect, useNavigation, useRouter } from "expo-router";
import type { TFunction } from "i18next";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type Ref
} from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View, type ViewInstance } from "react-native";
import Animated from "react-native-reanimated";

import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { AmountBlock, SatsAmount } from "@/components/ui/AmountBlock";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { CodePlate } from "@/components/ui/CodePlate";
import { Countdown } from "@/components/ui/Countdown";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Icon, type IconName } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/StatusPill";
import { WaitingIndicator } from "@/components/ui/WaitingIndicator";
import { AutoReturnRing } from "@/features/terminal/AutoReturnRing";
import { BoltCardReader } from "@/features/terminal/BoltCardReader";
import type { CardRefusal } from "@/features/terminal/card-refusal";
import { CardRefusalVeil } from "@/features/terminal/CardRefusalVeil";
import {
  ArrivalStage,
  isWaitingPhase,
  useCodeVeil,
  usePaidArrival,
  type OutcomeArrival,
  type WaitingLeave
} from "@/features/terminal/PaidArrival";
import {
  PosFrame,
  POS_COLUMN_WIDTH,
  posColumn,
  type HeaderAction
} from "@/features/terminal/PosFrame";
import { SaleNote } from "@/features/terminal/SaleNote";
import { ReceivedTransactions } from "@/features/onchain/ReceivedTransactions";
import { UnderpaidChain } from "@/features/onchain/UnderpaidChain";
import { usePointOfSale, usePos, type InvoiceWait, type Sale } from "@/features/terminal/pos";
import { useBusinessRegistry } from "@/features/terminal/registry-key";
import { useSaleAcceptance } from "@/features/terminal/useSaleAcceptance";
import { useClockOffset } from "@/features/terminal/useClockOffset";
import { acceptsOnchain } from "@/config/onchain";
import { useSaleRecord } from "@/features/team/useSaleRecord";
import { useTakerKey } from "@/features/team/useTakerKey";
import { INVOICE_EXPIRY_SECONDS } from "@/features/terminal/invoice";
import { EndedRequest, LateCountdown, SettlingPayment } from "@/features/terminal/LateCheck";
import { addressPoolOf, type OnchainUnavailable } from "@/features/terminal/onchain-pool";
import { usePosOptions, type PosOptions } from "@/features/terminal/options";
import { useCharge, type ChargeState, type PaymentMethod } from "@/features/terminal/useCharge";
import { usePaymentLink, type PaymentOffer } from "@/features/terminal/usePaymentLink";
import { formatDate } from "@/lib/locale/date";
import { formatInteger } from "@/lib/locale/format";
import { issuerSeconds } from "@/lib/clock";
import { paymentUri } from "@/lib/onchain/bip21";
import { explorerName } from "@/lib/onchain/tx-page";
import { payerNodeOf, type BitcoinNode } from "@/lib/onchain/node";
import { saleRegistry, takerTag } from "@/lib/registry/registry";
import { secureRandomBytes } from "@/lib/random";
import { currentRelays } from "@/lib/relays/current";
import { fiatToSats, formatFiat, formatSatsGrouped, splitFiat } from "@/lib/terminal/amount";
import { isMemberProfile } from "@/lib/terminal/model";
import {
  makeStyles,
  palette,
  type PaymentState,
  proseLineHeight,
  qr,
  radius,
  sans,
  tracked,
  type,
  useTheme
} from "@/theme";

/** The paid screen goes back to the keypad on its own after this delay. */
export const AUTO_RETURN_MS = 10_000;

const QR_MOBILE = 216;
const QR_DESKTOP = 340;

/** The paid and expired screens: the outcome's disc, and its icon. */
const DISC = { mobile: { size: 96, icon: 38 }, desktop: { size: 112, icon: 44 } };
/** The waiting screen, mobile: the space between its rows. */
const WAITING_GAP = 16;

type WaitingState = Extract<ChargeState, { phase: "creating" | "open" | "checking" }>;

function isWaiting(state: ChargeState): state is WaitingState {
  return isWaitingPhase(state.phase);
}

/** What the waiting screen shows of `state` (its state is a new object at each render). */
function shownKey(state: WaitingState, sats: bigint): string {
  switch (state.phase) {
    case "creating":
      return `creating|${state.waitingForRate}|${sats}`;
    case "checking":
      return `checking|${state.bitcoin}|${state.paymentSeen}|${state.lateUntil}|${state.settling}|${sats}`;
    case "open":
      return `open|${state.invoice?.pr ?? ""}|${state.address ?? ""}|${state.onchainUnavailable}|${state.endsAt}|${sats}`;
  }
}

/**
 * Waiting for payment, payment detected, expiry, underpayment: the invoice of the
 * sale fixed on the keypad, its payment, or its end. Its QR carries both networks when the device
 * has an on-chain address left (BIP-21, src/features/terminal/onchain-pool.ts), else Lightning
 * only, Bitcoin not named under it. An on-chain payment shows "Confirming" until 3 blocks deep;
 * the screen stays there, without going back on its own.
 * Past the invoice's end, "Expired" waits for the 2 minutes a payment may still be reported in
 * ("Request expired" meanwhile), and until the address was read unpaid. Underpaid, the rest is
 * payable until the sale's end; past it, the sale stays "Underpaid".
 *
 * No "Cancel": a Lightning invoice cannot be revoked, it
 * stays open, payable, for its 10 minutes whatever the screen shows. "Back" only leaves this
 * screen, for the one the sale was charged from (the keypad, the scan, the basket); the invoice's
 * outcome shows in "Wallet" or "My activity".
 */
export default function ChargeScreen() {
  const { sale } = usePos();
  // A reload of the web app, a link, a sale paid while another destination showed: no sale to
  // charge.
  if (!sale) return <BackToKeypad />;
  return <Charge sale={sale} />;
}

/**
 * The frame of every phase of the sale: in the mobile layout, the point of sale's column (a
 * tablet); on desktop, its own layouts. One frame, so that a new phase cannot leave it out.
 */
function ChargeFrame(props: Omit<ComponentProps<typeof PosFrame>, "contentStyle">) {
  const desktop = useIsDesktop();
  return <PosFrame {...props} contentStyle={desktop ? undefined : posColumn} />;
}

/**
 * Back to the keypad once this screen shows. Not `Redirect`: its `replace` puts a second keypad in
 * place of this screen, over the one below.
 */
function BackToKeypad() {
  const router = useRouter();
  useFocusEffect(() => {
    router.dismissTo("/pos");
  });
  return null;
}

/**
 * Whether a sale in this phase was paid, even in part (every phase listed: a new one must be
 * placed); undefined while a payment is checked, the sale then as it was before.
 */
function paidIn(phase: ChargeState["phase"]): boolean | undefined {
  switch (phase) {
    // An on-chain payment being confirmed: the customer has paid.
    case "paid":
    case "unconfirmed":
      return true;
    // Paid in part, before or past its end: charging its whole amount again would charge the
    // customer too much.
    case "underpaid":
    case "underpaidEnded":
      return true;
    // A payment came, which another sale declared too: charging again could charge it twice.
    case "disputed":
      return true;
    case "checking":
      return undefined;
    case "creating":
    case "open":
    case "expired":
    case "failed":
      return false;
  }
}

/** What a sale in this phase still waits for (every phase listed: a new one must be placed). */
function invoiceWaitOf(phase: ChargeState["phase"]): InvoiceWait {
  switch (phase) {
    case "creating":
    case "open":
    case "checking":
    case "underpaid":
      return "open";
    // Paid on-chain, not confirmed yet: its transaction may still be replaced (RBF).
    case "unconfirmed":
      return "unconfirmed";
    // Past its end, nothing is asked any more: a transaction may still come, nothing waits for it.
    // Disputed: nothing is asked any more, the owner settles it.
    case "disputed":
    case "underpaidEnded":
    case "paid":
    case "expired":
    case "failed":
      return null;
  }
}

function Charge({ sale }: { sale: Sale }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const desktop = useIsDesktop();
  const {
    profile,
    digits,
    languageTag,
    rate,
    setSale,
    setMinor,
    setBasket,
    setNote,
    setInvoiceWait,
    reset
  } = usePointOfSale();
  const [attempt, setAttempt] = useState(0);
  const [rateMissing, setRateMissing] = useState(false);
  const business = useBusinessRegistry(profile);
  // Who takes the sale, for the owner: its declarations say it.
  const takerKey = useTakerKey(profile);
  // The sale's keys, derived once: undefined while the device's registry and its key that marks
  // who took the sale are read, null without a registry.
  const registry = useMemo(() => {
    if (business === undefined || business === null || takerKey === undefined) {
      return business === null ? null : undefined;
    }
    const keys = saleRegistry(business, sale.key, sale.relays);
    return takerKey === null
      ? keys
      : { ...keys, taker: takerTag(takerKey, keys.saleKeys.nostr.publicKey) };
  }, [business, takerKey, sale.key, sale.relays]);
  // The sale's start on the issuer's clock: it follows the correction an invoice's date brings.
  const offset = useClockOffset();
  const startedAt = issuerSeconds(sale.tappedAt, offset);
  // The business's choice of on-chain payments ("On-chain payments", its settings) and its
  // tolerance of on-chain underpayments, held for the sale once read: a change meanwhile (an
  // employee's channel read again) neither drops the address the sale shows, which a payer may
  // have paid, nor gives it one, nor changes how its payment is judged (a sale keeps the
  // tolerance of its creation, src/lib/onchain/tolerance.ts). "Create the request again" follows them.
  const optionsNow = usePosOptions(profile);
  const saleId = `${sale.tappedAt}|${attempt}`;
  const [optionsHeld, setOptionsHeld] = useState<{ sale: string; options: PosOptions } | null>(
    null
  );
  if (optionsNow !== undefined && optionsHeld?.sale !== saleId) {
    setOptionsHeld({ sale: saleId, options: optionsNow });
  }
  const options = optionsHeld?.sale === saleId ? optionsHeld.options : optionsNow;
  const onchain = options?.onchain;
  const tolerance = options?.onchainTolerance ?? 0;
  // The merchant's node this device reads the chain on (null: mempool.space), held with the sale's
  // options: its transactions' links lead to their pages there (TxLink).
  const chainNode = options?.bitcoinNode ?? null;
  // The owner's wallet's addresses, or the lot the owner gave an employee (src/features/team/);
  // none when the business accepts Lightning only, nor while its choice is read: the explorer is
  // not even asked about the pool's next address (useCharge).
  const pool = useMemo(
    () => (onchain === true ? addressPoolOf(profile) : null),
    [onchain, profile]
  );
  const { state, reached, now, dueNow, settlement, lightningProofs } = useCharge({
    pool,
    lightningAddress: profile.lightningAddress,
    fiat: { minor: sale.minor, digits, currency: profile.currency },
    note: sale.note,
    attempt,
    tappedAt: sale.tappedAt,
    startedAt,
    rate:
      rate.rate !== undefined && rate.hour !== undefined
        ? { hour: rate.hour, rate: rate.rate }
        : null,
    // Nothing asked before the business's choice of on-chain payments is read either: the first
    // invoice would take an address of the pool meanwhile.
    registry: onchain === undefined ? undefined : registry,
    tolerance
  });
  // What the screen asks for, and what "Share" shares (offerOf).
  const offer = offerOf(state, startedAt + INVOICE_EXPIRY_SECONDS);
  // The code shown last for this sale (its invoice, or an underpayment's rest): kept, blurred under
  // the spinner (on mobile, after VEIL_DELAY_MS sharp: useCodeVeil), while a payment seen is being
  // checked (Waiting).
  const shownCode = offer?.uri ?? null;
  const [lastCode, setLastCode] = useState<{ sale: number; uri: string } | null>(null);
  if (shownCode !== null && (lastCode?.sale !== sale.tappedAt || lastCode.uri !== shownCode)) {
    setLastCode({ sale: sale.tappedAt, uri: shownCode });
  }
  const keptCode = lastCode?.sale === sale.tappedAt ? lastCode.uri : null;
  // The amount shown: due at the point of the hour, what was paid once it is, else the amount of
  // the hour the sale was charged in, until the next hour's is known.
  const sats =
    state.phase === "open"
      ? state.sats
      : state.phase === "paid" || state.phase === "unconfirmed"
        ? state.received
        : state.phase === "underpaidEnded"
          ? state.due
          : (dueNow ?? sale.sats);

  // The paid screen arriving (mobile, PaidArrival.tsx): the waiting screen leaves as it was last
  // shown (adjusted while rendering).
  const arrival = usePaidArrival(state.phase, desktop);
  const [shown, setShown] = useState<{ key: string; state: WaitingState; sats: bigint } | null>(
    null
  );
  if (isWaiting(state)) {
    const key = shownKey(state, sats);
    if (key !== shown?.key) setShown({ key, state, sats });
  }

  // Paid, even in part (paidIn): the keypad underneath (or the basket, for a sale charged from it)
  // starts afresh at once, and the sale is dropped once this screen is left, so that leaving it any
  // way (system back, swipe, then the browser's "forward") can never charge the same sale again.
  // A payment's transaction may still be replaced before it confirms (RBF): the sale then goes back
  // to its invoice, and the keypad gets its amount back (the basket its lines), as if it had never
  // been paid. While a payment is checked, the sale stays as it was.
  const paidNow = paidIn(state.phase);
  const [paidHeld, setPaidHeld] = useState(false);
  if (paidNow !== undefined && paidNow !== paidHeld) setPaidHeld(paidNow);
  const paid = paidNow ?? paidHeld;
  const counted = useRef(false);
  useEffect(() => {
    if (paid === counted.current) return;
    counted.current = paid;
    // A basket's sale leaves the keypad's amount as it was: not part of it.
    if (sale.basket === null) setMinor(paid ? 0 : sale.minor);
    else setBasket(paid ? [] : sale.basket);
    setNote(paid ? "" : sale.note);
  }, [paid, sale.minor, sale.basket, sale.note, setMinor, setBasket, setNote]);
  useEffect(
    () => () => {
      if (counted.current) setSale(null);
    },
    [setSale]
  );

  // The owner's acceptance of the sale, looked for while it shows "Underpaid" (useSaleAcceptance):
  // on the sale's relays, signed by the owner's key of the sale (its business's link owner key).
  const acceptance = useSaleAcceptance(
    business ? { saleKey: sale.key, owner: business.owner, relays: sale.relays } : null,
    state.phase === "underpaid" || state.phase === "underpaidEnded"
  );
  const accepted =
    acceptance !== null &&
    (state.phase === "underpaid" || state.phase === "underpaidEnded") &&
    state.received >= acceptance.received;
  // What its sale still waits for: the navigation's dot on "Charge", seen from another
  // destination (an invoice left open there shows again as it was); nothing once accepted.
  const wait = accepted ? null : invoiceWaitOf(state.phase);
  useEffect(() => {
    setInvoiceWait(wait);
  }, [wait, setInvoiceWait]);
  useEffect(() => () => setInvoiceWait(null), [setInvoiceWait]);

  const amount = formatFiat(sale.minor, digits, languageTag);
  const satsLine = formatSatsGrouped(sats);
  const satsLabel = t("pos.satsLabel", { sats: formatInteger(sats, languageTag) });
  // To the keypad, past the scan and the basket the sale may have been charged from.
  const backToKeypad = () =>
    router.canGoBack() ? router.dismissTo("/pos") : router.replace("/pos");
  // "Back": back to the screen the sale was charged from, the keypad, the scan or the basket,
  // as it was left (an article forgotten is scanned, the sale charged again).
  // A sale paid, even in part, is over (its basket emptied above): the next
  // one starts at the keypad; its invoice shows in "Wallet" or "My activity".
  const leave = () =>
    paid ? backToKeypad() : router.canGoBack() ? router.back() : router.replace("/pos");

  const afterPayment = () => {
    reset();
    // Left for another destination (desktop side bar) meanwhile: the merchant stays there; without
    // a sale, this screen gives way to the keypad when the point of sale is shown again.
    if (navigation.isFocused()) backToKeypad();
  };

  /** A new sale of the same fiat amount, from now, at the point of the hour. */
  const recreate = () => {
    const current = rate.current();
    if (current === undefined) {
      setRateMissing(true);
      return;
    }
    setRateMissing(false);
    setSale({
      ...sale,
      sats: fiatToSats(sale.minor, digits, current),
      tappedAt: Date.now(),
      key: secureRandomBytes(32),
      relays: currentRelays()
    });
    setAttempt((a) => a + 1);
  };

  const paymentLink = usePaymentLink({
    offer,
    sale,
    profile,
    digits,
    business: business ?? null,
    taker: registry?.taker ?? null,
    // The merchant's node, when the owner passes it on to the payers' pages.
    payerNode: payerNodeOf(chainNode),
    tolerance,
    settlement
  });
  useSaleRecord({
    // What the payments reached: a disputed payment is shown, the records stay as they were.
    state: reached,
    sale,
    profile,
    digits,
    startsAt: startedAt,
    endsAt: startedAt + INVOICE_EXPIRY_SECONDS,
    tolerance,
    declared: registry !== undefined && registry !== null,
    taker: registry?.taker ?? null,
    lightningProofs
  });

  // The header keeps the point of sale's own lines: the sale's note shows under its amount
  // (SaleNote).
  const subtitle = t("pos.subtitle");
  const back: HeaderAction = {
    icon: "arrow-left",
    label: t("common.back"),
    onPress: leave,
    testID: "charge-back"
  };
  const share: HeaderAction = {
    icon: "share-nodes",
    label: t("pos.share"),
    onPress: paymentLink.share,
    testID: "share"
  };
  const waitingScreen = (waiting: WaitingState, waitingSats: bigint) => (
    <Waiting
      state={waiting}
      now={now}
      endsAt={startedAt + INVOICE_EXPIRY_SECONDS}
      kept={keptCode}
      desktop={desktop}
      amount={amount}
      currency={profile.currency}
      satsLine={formatSatsGrouped(waitingSats)}
      satsLabel={t("pos.satsLabel", { sats: formatInteger(waitingSats, languageTag) })}
      note={sale.note}
      member={isMemberProfile(profile)}
      explorer={explorerName(chainNode)}
      plateRef={arrival.plateRef}
      leaving={arrival.waiting}
    />
  );

  // Paid short, and the owner accepted what it received: paid, at
  // that, while it still reaches what the sale had received when accepted.
  if (accepted && (state.phase === "underpaid" || state.phase === "underpaidEnded")) {
    const receivedMinor = splitFiat(sale.minor, acceptance.due, state.received).receivedMinor;
    return (
      <ChargeFrame
        subtitle={subtitle}
        leading={{ icon: "arrow-left", label: t("common.back"), onPress: backToKeypad }}
      >
        <Outcome
          desktop={desktop}
          state="settled"
          icon="check"
          pill={t("pos.paid.pill")}
          pillOnDesktop
          amount={formatFiat(receivedMinor, digits, languageTag)}
          currency={profile.currency}
          note={sale.note}
          satsLine={formatSatsGrouped(state.received)}
          satsLabel={t("pos.satsLabel", { sats: formatInteger(state.received, languageTag) })}
          notice={t("pos.accepted.notice")}
          // Paid: the sale ends, as after a payment (its basket emptied).
          actions={[{ label: t("pos.backToPos"), onPress: afterPayment, primary: true }]}
        />
      </ChargeFrame>
    );
  }

  switch (state.phase) {
    case "creating":
    case "open":
    case "checking":
      return (
        <ChargeFrame
          subtitle={subtitle}
          leading={back}
          trailing={state.phase === "open" ? share : undefined}
          // Desktop: the header has no actions, "Share" is a button on its right.
          desktopAside={
            state.phase === "open" ? (
              <Button
                variant="secondary"
                icon="share-nodes"
                fullWidth={false}
                onPress={paymentLink.share}
                accessibilityHint={t("pos.shareLink.hint")}
                testID="share"
              >
                {t("pos.shareLink.button")}
              </Button>
            ) : undefined
          }
        >
          {desktop ? (
            waitingScreen(state, sats)
          ) : (
            <ArrivalStage
              stage={arrival.stage}
              stageRef={arrival.stageRef}
              waiting={waitingScreen(state, sats)}
            />
          )}
        </ChargeFrame>
      );
    case "paid": {
      const outcome = (
        <Outcome
          desktop={desktop}
          state="settled"
          icon="check"
          pill={t("pos.paid.pill")}
          amount={amount}
          currency={profile.currency}
          note={sale.note}
          satsLine={satsLine}
          satsLabel={satsLabel}
          detail={
            <PaidLine method={state.method} paidAt={state.paidAt} languageTag={languageTag} />
          }
          footer={<AutoReturnButton onReturn={afterPayment} label={t("pos.backToPos")} />}
          arrival={arrival.active ? arrival.outcome : undefined}
        />
      );
      // Arriving (mobile): the waiting screen leaves over it, with its header's actions.
      const leaving = arrival.active ? shown : null;
      return (
        <ChargeFrame
          subtitle={subtitle}
          leading={leaving ? back : undefined}
          trailing={leaving?.state.phase === "open" ? share : undefined}
          leavingActions={leaving ? arrival.header : undefined}
        >
          {desktop ? (
            outcome
          ) : (
            <ArrivalStage
              stage={arrival.stage}
              stageRef={arrival.stageRef}
              outcome={outcome}
              waiting={leaving ? waitingScreen(leaving.state, leaving.sats) : null}
              check={<Icon name="check" size={DISC.mobile.icon} color={colors.state.settled.fg} />}
            />
          )}
        </ChargeFrame>
      );
    }
    case "unconfirmed":
      return (
        <ChargeFrame subtitle={subtitle}>
          <Outcome
            desktop={desktop}
            state="unconfirmed"
            icon="hourglass-half"
            pill={t("pos.unconfirmed.pill")}
            // Desktop too: its mined chain shows the wait.
            pillOnDesktop
            amount={amount}
            currency={profile.currency}
            note={sale.note}
            satsLine={satsLine}
            satsLabel={satsLabel}
            detail={
              <PaidLine method={state.method} paidAt={state.detectedAt} languageTag={languageTag} />
            }
            notice={t("pos.unconfirmed.notice")}
            // Without a ring: the screen waits for the confirmations.
            footer={
              <Button onPress={afterPayment} testID="back-to-pos">
                {t("pos.backToPos")}
              </Button>
            }
          />
        </ChargeFrame>
      );
    case "underpaid":
      return (
        <ChargeFrame
          subtitle={subtitle}
          leading={back}
          trailing={share}
          desktopAside={
            <Button
              variant="secondary"
              icon="share-nodes"
              fullWidth={false}
              onPress={paymentLink.share}
              accessibilityHint={t("pos.shareLink.hint")}
              testID="share"
            >
              {t("pos.shareLink.button")}
            </Button>
          }
        >
          <Underpaid
            state={state}
            now={now}
            endsAt={startedAt + INVOICE_EXPIRY_SECONDS}
            desktop={desktop}
            minor={sale.minor}
            sats={dueNow}
            digits={digits}
            languageTag={languageTag}
            amount={amount}
            currency={profile.currency}
            note={sale.note}
            chainNode={chainNode}
          />
        </ChargeFrame>
      );
    case "expired":
      return (
        <ChargeFrame
          subtitle={subtitle}
          leading={{ icon: "arrow-left", label: t("common.back"), onPress: leave }}
        >
          <Outcome
            desktop={desktop}
            state="expired"
            icon="hourglass-end"
            pill={t("pos.expired.pill")}
            amount={amount}
            currency={profile.currency}
            note={sale.note}
            notice={t("pos.expired.notice")}
            error={rateMissing ? t("pos.rateUnavailable") : null}
            actions={[
              { label: t("pos.expired.recreate"), onPress: recreate, primary: true },
              { label: t("pos.backToPos"), onPress: backToKeypad }
            ]}
          />
        </ChargeFrame>
      );
    case "underpaidEnded":
      return (
        <ChargeFrame
          subtitle={subtitle}
          leading={{ icon: "arrow-left", label: t("common.back"), onPress: leave }}
        >
          <Outcome
            desktop={desktop}
            state="underpaid"
            icon="circle-half-stroke"
            pill={t("pos.underpaidEnded.pill")}
            pillOnDesktop
            amount={amount}
            currency={profile.currency}
            note={sale.note}
            satsLine={satsLine}
            satsLabel={satsLabel}
            detail={
              <View style={[styles.endedCards, desktop && styles.endedCardsDesktop]}>
                <UnderpaidChain
                  received={state.received}
                  rest={state.due - state.received}
                  sats={state.due}
                  fiat={{ minor: sale.minor, digits, currency: profile.currency }}
                  languageTag={languageTag}
                  ended
                  node={chainNode}
                />
                <ReceivedTransactions
                  transactions={state.transactions}
                  lightning={state.lightning}
                  languageTag={languageTag}
                  node={chainNode}
                />
              </View>
            }
            notice={t("pos.underpaidEnded.notice", {
              missing: formatInteger(state.due - state.received, languageTag)
            })}
            // A new request of the whole amount would charge too much.
            actions={[{ label: t("pos.backToPos"), onPress: backToKeypad, primary: true }]}
          />
        </ChargeFrame>
      );
    case "disputed":
      // Another sale declared the payment too (SaleState "disputed"): received, never "Waiting for
      // the payment" nor a new code.
      return (
        <ChargeFrame
          subtitle={subtitle}
          leading={{ icon: "arrow-left", label: t("common.back"), onPress: leave }}
        >
          <Outcome
            desktop={desktop}
            state="underpaid"
            icon="triangle-exclamation"
            pill={t("pos.disputed.pill")}
            pillOnDesktop
            amount={amount}
            currency={profile.currency}
            note={sale.note}
            notice={t(
              isMemberProfile(profile) ? "pos.disputed.noticeMember" : "pos.disputed.notice"
            )}
            actions={[{ label: t("pos.backToPos"), onPress: backToKeypad, primary: true }]}
          />
        </ChargeFrame>
      );
    case "failed":
      return (
        <ChargeFrame
          subtitle={subtitle}
          leading={{ icon: "arrow-left", label: t("common.back"), onPress: leave }}
        >
          <Outcome
            desktop={desktop}
            state="canceled"
            icon="circle-exclamation"
            amount={amount}
            currency={profile.currency}
            note={sale.note}
            notice={failureNotice(
              state,
              isMemberProfile(profile),
              explorerName(chainNode),
              t,
              languageTag
            )}
            error={rateMissing ? t("pos.rateUnavailable") : null}
            actions={
              // Out of the bounds, another try asks the same: unless an address may come then.
              state.failure === "limits" && (state.onchain ?? "none") === "none"
                ? [{ label: t("pos.backToPos"), onPress: backToKeypad, primary: true }]
                : [
                    { label: t("pos.failed.retry"), onPress: recreate, primary: true },
                    { label: t("pos.backToPos"), onPress: backToKeypad }
                  ]
            }
          />
        </ChargeFrame>
      );
  }
}

/**
 * Why the sale could not be charged. Above the most the Lightning address accepts, the sale is paid
 * on-chain only: failed so, it says why no address could be shown,
 * as OnchainWarning does.
 */
function failureNotice(
  state: Extract<ChargeState, { phase: "failed" }>,
  member: boolean,
  /** The explorer the device reads the chain on, as named (explorerName). */
  explorer: string,
  t: TFunction,
  languageTag: string
): string {
  if (state.failure !== "limits" || !state.limits) {
    return t(state.failure === "network" ? "pos.failed.network" : "pos.failed.invalid");
  }
  const min = formatInteger(state.limits.min, languageTag);
  const max = formatInteger(state.limits.max, languageTag);
  switch (state.onchain) {
    case undefined:
      return t("pos.failed.limits", { min, max });
    case "none":
      return t("pos.failed.onchainOnly.none", { max });
    case "explorer":
      return t("pos.failed.onchainOnly.explorer", { max, explorer });
    case "empty":
      return t(member ? "pos.failed.onchainOnly.lot" : "pos.failed.onchainOnly.pool", { max });
    case "error":
      return t("pos.failed.onchainOnly.error", { max });
  }
}

/**
 * The QR of an open sale: both networks in one BIP-21 URI, Lightning alone, or its address alone
 * above the most the Lightning address accepts. Null when there is neither (never so: useSale).
 */
function invoiceUri(open: Extract<ChargeState, { phase: "open" }>): string | null {
  if (open.address) {
    return paymentUri({ address: open.address, sats: open.sats, invoice: open.invoice?.pr });
  }
  return open.invoice ? `lightning:${open.invoice.pr}` : null;
}

/**
 * The QR of an underpaid sale: the rest over Lightning when the service made an invoice of it, and
 * on-chain from `MIN_ONCHAIN_SATS`. Null while there is
 * nothing to show (a small rest whose invoice is being asked).
 */
function restUri(underpaid: Extract<ChargeState, { phase: "underpaid" }>): string | null {
  // The next hour's point is not known yet: nothing to ask.
  if (underpaid.rest === null) return null;
  if (underpaid.address !== null && acceptsOnchain(underpaid.rest)) {
    return paymentUri({
      address: underpaid.address,
      sats: underpaid.rest,
      invoice: underpaid.topUp?.pr
    });
  }
  return underpaid.topUp ? `lightning:${underpaid.topUp.pr}` : null;
}

/**
 * What "Share" shares: the screen's request, while it shows one. `endsAt` is the sale's own
 * end. The link carries the sale, not the invoice shown: the payer's page asks its own
 * (useSharedInvoice.ts).
 */
function offerOf(state: ChargeState, endsAt: number): PaymentOffer | null {
  switch (state.phase) {
    case "open":
      return { address: state.address, endsAt, uri: invoiceUri(state) };
    case "underpaid":
      return { address: state.address, endsAt, uri: restUri(state) };
    default:
      return null;
  }
}

/**
 * The waiting screen: amount, QR, networks, BoltCard, then the countdown (without a cancel
 * button). "Share", in the header, sends the payer a payment link; what became of it shows as a
 * notification (usePaymentLink). While the invoice is being created, the plate shows a spinner
 * instead of a code. Once the sale ended with nothing received (`checking` without `paymentSeen`),
 * the plate says the request expired, and the countdown counts down the 2 minutes its invoices are
 * still checked for a payment reported late (`lateUntil`, `LateCountdown`), then gives way
 * while the sale is still checked (the address or the declarations not read, the LNURL server
 * failing). A payment seen but not counted yet, before the sale's end (`checking` with
 * `paymentSeen`: the registry read, when a transaction was sent…), keeps the code shown last,
 * blurred under the spinner (on mobile, after VEIL_DELAY_MS sharp: useCodeVeil), and the countdown
 * goes on: the sale goes on if the payment does not count (a BoltCard's payment checked must not
 * empty the plate nor set the countdown to 00:00). On mobile, its
 * rows are grouped so that the code and the rest leave apart (`leaving`, PaidArrival.tsx). A sale
 * that should offer Bitcoin and shows no address says why under the networks (OnchainWarning).
 * A card that did not pay says why over the code, blurred, for a few seconds (CardRefusalVeil);
 * a payment seen blurs the code its own way, and prevails.
 */
function Waiting({
  state,
  now,
  endsAt,
  kept,
  desktop,
  amount,
  currency,
  satsLine,
  satsLabel,
  note,
  member,
  explorer,
  plateRef,
  leaving
}: {
  state: WaitingState;
  now: number;
  /** Unix seconds: the end of the sale, whatever invoice of the hour is shown. */
  endsAt: number;
  /** The code shown last for the sale (the open invoice's while it shows), null before any. */
  kept: string | null;
  desktop: boolean;
  amount: string;
  currency: string;
  satsLine: string;
  satsLabel: string;
  /** The sale's note, under its amount (SaleNote); "" without one. */
  note: string;
  /** An employee's device: its addresses come from the lot the owner gives it. */
  member: boolean;
  /** The explorer the device reads the chain on, as named (explorerName). */
  explorer: string;
  /** The code's plate (mobile), whose place the paid screen's arrival starts from. */
  plateRef?: Ref<ViewInstance>;
  /** Mobile: the screen leaving while the paid screen arrives (`active`), at rest otherwise. */
  leaving?: WaitingLeave;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const open = state.phase === "open" ? state : null;
  const checking = state.phase === "checking";
  // A payment seen whose check lasts (`settling`): the plate says it was received, without a code.
  const settling = state.phase === "checking" && state.settling;
  const verifying = state.phase === "checking" && state.paymentSeen && now < endsAt && !settling;
  // Ended with nothing received: the plate says so, and the countdown counts down the checks of a
  // payment reported late.
  const late = state.phase === "checking" && !state.paymentSeen ? state : null;
  const updating = state.phase === "creating" && state.waitingForRate;
  const end = open ? open.endsAt : endsAt;
  const secondsLeft =
    checking && !verifying ? 0 : Math.max(0, Math.min(INVOICE_EXPIRY_SECONDS, end - now));
  const size = desktop ? QR_DESKTOP : QR_MOBILE;
  const value = open !== null || verifying ? kept : null;
  const veiled = useCodeVeil(verifying, value !== null, desktop, leaving?.active ?? false);
  // The last card's refusal, for the invoice it was tapped for: another invoice shows none.
  const [refused, setRefused] = useState<{ pr: string; refusal: CardRefusal; at: number } | null>(
    null
  );
  const pr = open?.invoice?.pr ?? null;
  const refusal = refused !== null && refused.pr === pr ? refused : null;

  const code = (
    // Centred by its row: the plate aligns itself to the start (QrPlate).
    <View style={styles.qrRow}>
      <CodePlate
        value={value}
        size={size}
        blurred={veiled}
        ended={
          late ? (
            <EndedRequest desktop={desktop} />
          ) : settling ? (
            <SettlingPayment desktop={desktop} />
          ) : undefined
        }
        notice={
          refusal ? (
            <CardRefusalVeil
              key={refusal.at}
              refusal={refusal.refusal}
              desktop={desktop}
              onDone={() => setRefused(null)}
            />
          ) : undefined
        }
        plateRef={plateRef}
      />
    </View>
  );
  const networks = (
    <Invitation
      shown={open !== null}
      lightning={open?.invoice !== null}
      bitcoin={open?.address != null}
    />
  );
  const warning = open ? (
    <OnchainWarning
      reason={open.onchainUnavailable}
      member={member}
      explorer={explorer}
      desktop={desktop}
    />
  ) : null;
  // Leaving (the sale paid): the line stays as it was, but no card pays the invoice any more.
  // A card pays an invoice: none above the most the Lightning address accepts.
  const cardInvoice = open?.invoice ?? null;
  const card = cardInvoice ? (
    <BoltCardReader
      invoice={cardInvoice}
      stopped={leaving?.active}
      onRefusal={(next) =>
        setRefused(next ? { pr: cardInvoice.pr, refusal: next, at: Date.now() } : null)
      }
    />
  ) : null;
  const countdown = late ? (
    <LateCountdown lateUntil={late.lateUntil} now={now} />
  ) : (
    <Countdown
      label={t("pos.expiresIn")}
      seconds={secondsLeft}
      progress={secondsLeft / INVOICE_EXPIRY_SECONDS}
      hidden={settling}
    />
  );
  const waiting = (
    <WaitingIndicator
      label={t(
        open
          ? "pos.waiting"
          : checking
            ? state.bitcoin
              ? "pos.checking"
              : "pos.checkingPayment"
            : updating
              ? "pos.updatingRate"
              : "pos.creating"
      )}
    />
  );
  if (desktop) {
    return (
      <View style={styles.desktopRow}>
        <View style={styles.desktopLeft}>
          <View style={styles.amountWithNote}>
            <AmountBlock
              amount={amount}
              currency={currency}
              sats={satsLine}
              satsLabel={satsLabel}
              align="left"
              bold
            />
            <SaleNote note={note} align="left" testID="sale-note" />
          </View>
          {countdown}
          {waiting}
        </View>
        <View style={styles.desktopRight}>
          {code}
          {networks}
          {warning}
          {card}
        </View>
      </View>
    );
  }

  return (
    // As laid out while it fits; scrolled otherwise, as the outcomes (a warning on a small phone,
    // OnchainWarning: the countdown would leave the screen).
    <ScrollView
      style={styles.waitingScroll}
      contentContainerStyle={styles.waitingContent}
      alwaysBounceVertical={false}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View style={[styles.waitingGroup, leaving?.others]}>
        <AmountBlock
          amount={amount}
          currency={currency}
          sats={satsLine}
          satsLabel={satsLabel}
          bold
        />
        <SaleNote note={note} testID="sale-note" />
      </Animated.View>
      <Animated.View style={[styles.waitingGroup, leaving?.code]}>{code}</Animated.View>
      <Animated.View style={[styles.waitingGroup, leaving?.others]}>
        {networks}
        {warning}
        {card}
      </Animated.View>
      <View style={styles.push} />
      <Animated.View style={[styles.waitingGroup, leaving?.others]}>
        {countdown}
        {waiting}
      </Animated.View>
    </ScrollView>
  );
}

/**
 * Under the QR: how to pay it, then the networks its
 * code carries, "Lightning or Bitcoin". A network out of the code (under `MIN_ONCHAIN_SATS`, no
 * address left, an invoice of the rest being asked, Lightning above the most its address accepts)
 * is not named. While no code is shown, the lines keep their place, hidden: nothing moves when the
 * code comes.
 */
function Invitation({
  shown,
  lightning,
  bitcoin
}: {
  shown: boolean;
  lightning: boolean;
  bitcoin: boolean;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const networks: { icon: IconName; name: string }[] = [];
  if (lightning || !shown) networks.push({ icon: "bolt", name: t("pos.networks.lightning") });
  if (bitcoin && shown) networks.push({ icon: "bitcoin", name: t("pos.networks.bitcoin") });
  const or = t("pos.networks.or");
  return (
    <View
      style={[styles.invitation, !shown && styles.hidden]}
      aria-hidden={!shown}
      testID="invitation"
    >
      <Text style={styles.invitationText}>{t("pos.networks.scan")}</Text>
      {networks.length > 0 ? (
        <View
          style={styles.networks}
          accessible
          accessibilityLabel={networks.map((network) => network.name).join(` ${or} `)}
          testID="networks"
        >
          {networks.map((network, i) => (
            <View key={network.icon} style={styles.networksPart}>
              {i > 0 ? <Text style={styles.invitationText}>{or}</Text> : null}
              <View style={styles.network}>
                <Icon
                  name={network.icon}
                  size={network.icon === "bitcoin" ? 15 : 14}
                  color={palette.orange}
                />
                <Text style={styles.networkName}>{network.name}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Why a sale that should offer Bitcoin shows no address, in the
 * underpaid ochre, under the networks the code carries: only the causes the merchant can act on.
 * The explorer out of reach (mempool.space, or the merchant's node, named: the address's watch
 * reads it alone, no other one stands in), or no address left on the device: the owner's are
 * prepared at each unlocking, then after each address taken while the account stays open
 * (onchain-pool.ts, syncOnchainPool), an employee's lot is given when the owner invites it and
 * filled again when the owner unlocks the owner's app (owner-addresses.ts); the device reads it
 * again when a sale finds it empty (readEmptyLot). Stored addresses that could not be read or
 * written are not said: nothing the merchant can do about it. Never asked again for the sale
 * (useSale.ts): its code, and a link shared of it, would change. A Callout, as wide as the code's
 * plate on desktop.
 */
function OnchainWarning({
  reason,
  member,
  explorer,
  desktop
}: {
  reason: OnchainUnavailable | null;
  member: boolean;
  /** The explorer the device reads the chain on, as named (explorerName). */
  explorer: string;
  desktop: boolean;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  let text: string;
  switch (reason) {
    case "explorer":
      text = t("pos.onchainUnavailable.explorer", { explorer });
      break;
    case "empty":
      text = t(member ? "pos.onchainUnavailable.lot" : "pos.onchainUnavailable.pool");
      break;
    case "error":
    case null:
      return null;
  }
  return (
    <View style={desktop ? styles.warningDesktop : styles.warning}>
      <Callout tone="warning" testID="onchain-unavailable">
        {text}
      </Callout>
    </View>
  );
}

type Action = { label: string; onPress: () => void; primary?: boolean };

/** The paid and expired screens: a tinted disc, the state, the amount, then what to do. */
function Outcome({
  desktop,
  state,
  icon,
  pill,
  pillOnDesktop = false,
  amount,
  currency,
  satsLine,
  satsLabel,
  note,
  notice,
  error,
  actions,
  detail,
  footer,
  arrival
}: {
  desktop: boolean;
  state: PaymentState;
  icon: IconName;
  /** The state's pill, on mobile; on desktop too with `pillOnDesktop`. */
  pill?: string;
  pillOnDesktop?: boolean;
  amount: string;
  currency: string;
  satsLine?: string;
  satsLabel?: string;
  /** The sale's note, under its amount (SaleNote). */
  note: string;
  notice?: string;
  error?: string | null;
  actions?: Action[];
  /** Under the amount, above the notice (how and when it was paid). */
  detail?: ReactNode;
  /** In place of `actions`. */
  footer?: ReactNode;
  /** Mobile, paid: the screen arriving (PaidArrival.tsx). */
  arrival?: OutcomeArrival;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const disc = DISC[desktop ? "desktop" : "mobile"];
  const actionButtons = actions ? (
    <View style={desktop ? styles.actionsRow : styles.actionsColumn}>
      {(desktop ? [...actions].reverse() : actions).map((action) => (
        <Button
          key={action.label}
          variant={action.primary ? "primary" : "text"}
          size={action.primary && !desktop ? "lg" : "md"}
          icon={action.primary && state === "expired" ? "arrows-rotate" : undefined}
          fullWidth={!desktop}
          onPress={action.onPress}
          style={desktop ? styles.actionDesktop : undefined}
        >
          {action.label}
        </Button>
      ))}
    </View>
  ) : footer ? (
    <Animated.View style={[desktop ? styles.footerDesktop : styles.actionsColumn, arrival?.footer]}>
      {footer}
    </Animated.View>
  ) : null;

  const body = (
    <>
      <Animated.View style={arrival?.disc}>
        <View
          ref={arrival?.discRef}
          onLayout={arrival?.onDiscLayout}
          style={[
            styles.disc,
            {
              width: disc.size,
              height: disc.size,
              borderRadius: disc.size / 2,
              backgroundColor: colors.state[state].bg
            }
          ]}
        >
          <Icon name={icon} size={disc.icon} color={colors.state[state].fg} />
        </View>
      </Animated.View>
      {pill && (!desktop || pillOnDesktop) ? (
        <Animated.View style={[styles.pill, arrival?.pill]}>
          <StatusPill state={state} label={pill} />
        </Animated.View>
      ) : null}
      <Animated.View
        style={[styles.outcomeAmount, { marginTop: desktop ? 30 : 24 }, arrival?.amount]}
      >
        <AmountBlock
          amount={amount}
          currency={currency}
          sats={satsLine}
          satsLabel={satsLabel}
          bold
        />
        <SaleNote note={note} testID="sale-note" />
      </Animated.View>
      {detail ? (
        <Animated.View style={[styles.detail, arrival?.detail]}>{detail}</Animated.View>
      ) : null}
      {notice ? (
        <View
          style={[
            styles.notice,
            { backgroundColor: colors.state[state].bg },
            desktop && styles.noticeDesktop
          ]}
        >
          <Icon
            name="circle-info"
            size={15}
            color={colors.state[state].fg}
            style={styles.noticeIcon}
          />
          <Text style={[styles.noticeText, { color: colors.state[state].fg }]}>{notice}</Text>
        </View>
      ) : null}
    </>
  );

  if (desktop) {
    return (
      <View style={styles.outcomeDesktop}>
        {body}
        {error ? <ErrorMessage style={styles.outcomeError}>{error}</ErrorMessage> : null}
        {actionButtons ? <View style={{ marginTop: 38 }}>{actionButtons}</View> : null}
      </View>
    );
  }
  return (
    <View style={styles.outcome}>
      {/* Centred while it fits, scrolled otherwise (an underpaid sale's payments, a small phone). */}
      <ScrollView
        style={styles.outcomeScroll}
        contentContainerStyle={styles.outcomeBody}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.push} />
        {body}
        <View style={styles.push} />
      </ScrollView>
      {error ? <ErrorMessage style={styles.outcomeError}>{error}</ErrorMessage> : null}
      {actionButtons}
    </View>
  );
}

const PAID_LINES = {
  lightning: "pos.paid.line",
  onchain: "pos.paid.onchainLine",
  mixed: "pos.paid.mixedLine"
} as const;

/** "Lightning · 14:32:07": how, and when the payment was seen. */
function PaidLine({
  method,
  paidAt,
  languageTag
}: {
  method: PaymentMethod;
  paidAt: Date;
  languageTag: string;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const time = formatDate(paidAt, languageTag, { timeStyle: "medium" });
  return (
    <View style={styles.paidLine}>
      <Icon name={method === "lightning" ? "bolt" : "bitcoin"} size={13} color={palette.orange} />
      <Text style={styles.paidText}>{t(PAID_LINES[method], { time })}</Text>
    </View>
  );
}

/**
 * Less than asked was paid on-chain. The amount and the code keep their place of the waiting
 * screen; the code asks for the rest (the same address, and an invoice of the rest when the service
 * makes one); the ochre tag gives the rest in sats; the chain below links what was received to
 * what is missing. Payable until the sale's end, no longer, without "Cancel".
 */
function Underpaid({
  state,
  now,
  endsAt,
  desktop,
  minor,
  sats,
  digits,
  languageTag,
  amount,
  currency,
  note,
  chainNode
}: {
  state: Extract<ChargeState, { phase: "underpaid" }>;
  now: number;
  /** Unix seconds: the end of the sale, which ends its rest too. */
  endsAt: number;
  desktop: boolean;
  minor: number;
  /** The amount due at the point of the hour, null until it is known. */
  sats: bigint | null;
  digits: number;
  languageTag: string;
  amount: string;
  currency: string;
  /** The sale's note, under the rest (SaleNote). */
  note: string;
  /** The merchant's node this device reads the chain on; null for mempool.space. */
  chainNode: BitcoinNode | null;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  // Null at the start of an hour, until its point is known: neither the rest nor its code yet.
  const rest = state.rest;
  const secondsLeft = Math.max(0, Math.min(INVOICE_EXPIRY_SECONDS, endsAt - now));
  const size = desktop ? QR_DESKTOP : QR_MOBILE;

  const head = (
    <View style={[styles.underpaidHead, desktop && styles.underpaidHeadDesktop]}>
      <AmountBlock
        amount={amount}
        currency={currency}
        size="large"
        align={desktop ? "left" : "center"}
        bold
      />
      {rest !== null ? (
        <View style={styles.restTag}>
          <Text style={styles.restTagLabel}>{t("pos.underpaid.rest")}</Text>
          <SatsAmount
            value={formatSatsGrouped(rest)}
            size={13.5}
            accessibilityLabel={t("pos.satsLabel", { sats: formatInteger(rest, languageTag) })}
          />
        </View>
      ) : null}
      <SaleNote note={note} align={desktop ? "left" : "center"} testID="sale-note" />
    </View>
  );
  const code = (
    <View style={styles.qrRow}>
      <CodePlate value={restUri(state)} size={size} />
    </View>
  );
  const networks = (
    <Invitation
      shown={restUri(state) !== null}
      // Not named while the invoice of the rest is asked (or asked again).
      lightning={state.topUp !== null}
      bitcoin={rest !== null && state.address !== null && acceptsOnchain(rest)}
    />
  );
  const chain =
    rest !== null && sats !== null ? (
      <UnderpaidChain
        received={state.received}
        rest={rest}
        sats={sats}
        fiat={{ minor, digits, currency }}
        languageTag={languageTag}
        receipts={state.receipts}
        now={now}
        node={chainNode}
      />
    ) : null;
  const countdown = (
    <Countdown
      label={t("pos.expiresIn")}
      seconds={secondsLeft}
      progress={secondsLeft / INVOICE_EXPIRY_SECONDS}
    />
  );

  if (desktop) {
    return (
      <View style={styles.desktopRow}>
        <View style={styles.desktopLeft}>
          {head}
          {chain}
          {countdown}
        </View>
        <View style={styles.desktopRight}>
          {code}
          {networks}
        </View>
      </View>
    );
  }
  return (
    <View style={styles.waiting}>
      {head}
      {code}
      {networks}
      <View style={styles.push} />
      {chain}
      {countdown}
    </View>
  );
}

/** "Back to the Point of Sale", which goes back on its own once its ring is empty. */
function AutoReturnButton({ onReturn, label }: { onReturn: () => void; label: string }) {
  const [secondsLeft, setSecondsLeft] = useState(AUTO_RETURN_MS / 1000);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => {
      const left = Math.max(0, Math.ceil((AUTO_RETURN_MS - (Date.now() - started)) / 1000));
      setSecondsLeft(left);
      if (left === 0) {
        clearInterval(timer);
        onReturn();
      }
    }, 250);
    return () => clearInterval(timer);
    // Started once, when the payment is seen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Button
      onPress={onReturn}
      accessibilityHint={label}
      accessory={(color) => (
        <AutoReturnRing durationMs={AUTO_RETURN_MS} secondsLeft={secondsLeft} color={color} />
      )}
      testID="back-to-pos"
    >
      {label}
    </Button>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  waiting: { flex: 1, alignItems: "center", gap: WAITING_GAP, paddingTop: 6, paddingBottom: 4 },
  waitingScroll: { flex: 1, minHeight: 0 },
  waitingContent: {
    flexGrow: 1,
    alignItems: "center",
    gap: WAITING_GAP,
    paddingTop: 6,
    paddingBottom: 4
  },
  // Laid out as the rows were without it.
  waitingGroup: { alignSelf: "stretch", alignItems: "center", gap: WAITING_GAP },
  push: { flex: 1, minHeight: 4 },
  qrRow: { alignSelf: "stretch", flexDirection: "row", justifyContent: "center" },
  invitation: { alignItems: "center", gap: 3 },
  hidden: { opacity: 0 },
  invitationText: {
    ...sans(500),
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.text.secondary
  },
  networks: { flexDirection: "row", alignItems: "center", gap: 7 },
  networksPart: { flexDirection: "row", alignItems: "center", gap: 7 },
  network: { flexDirection: "row", alignItems: "center", gap: 5 },
  networkName: {
    ...sans(600),
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.text.primary
  },
  warning: { alignSelf: "stretch" },
  // As wide as the code's plate (CodePlate: the code and its quiet zone).
  warningDesktop: { width: QR_DESKTOP + qr.quietZone * 2 },
  desktopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 72,
    flexWrap: "wrap"
  },
  desktopLeft: { width: 360, gap: 26 },
  amountWithNote: { gap: WAITING_GAP },
  desktopRight: { alignItems: "center", gap: 20 },
  outcome: { flex: 1, alignItems: "center", paddingBottom: 4 },
  outcomeScroll: { alignSelf: "stretch" },
  outcomeBody: { flexGrow: 1, alignItems: "center" },
  endedCards: { marginTop: 20, alignSelf: "stretch", gap: 12 },
  endedCardsDesktop: { alignSelf: "center", width: 440, maxWidth: "100%" },
  outcomeDesktop: { width: POS_COLUMN_WIDTH, maxWidth: "100%", alignItems: "center" },
  // As wide as the column, not as its figure: on the web, the amount is scaled down to that width
  // (AmountBlock) instead of passing the screen's edge.
  // The note under the amount (SaleNote) as far from it as the waiting screen's rows.
  outcomeAmount: { alignSelf: "stretch", gap: WAITING_GAP },
  disc: { alignItems: "center", justifyContent: "center" },
  pill: { marginTop: 22 },
  // Laid out as the detail was without it (centred, or stretched: an underpaid sale's cards).
  detail: { alignSelf: "stretch", alignItems: "center" },
  notice: {
    marginTop: 24,
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderRadius: 16,
    paddingVertical: 15,
    paddingHorizontal: 17
  },
  noticeDesktop: { width: 440, marginTop: 28 },
  noticeIcon: { marginTop: (proseLineHeight - 15 * 1.15) / 2 },
  noticeText: { ...sans(600), flex: 1, fontSize: type.prose, lineHeight: proseLineHeight },
  footerDesktop: { width: 320 },
  paidLine: { marginTop: 14, flexDirection: "row", alignItems: "center", gap: 7 },
  paidText: { ...sans(500), fontSize: type.caption, color: colors.text.secondary },
  actionsColumn: { width: "100%", gap: 10 },
  actionsRow: { flexDirection: "row", gap: 12 },
  actionDesktop: { minWidth: 270 },
  outcomeError: { marginTop: 16, marginBottom: 12, alignSelf: "stretch" },
  underpaidHead: { alignItems: "center", gap: 11 },
  underpaidHeadDesktop: { alignItems: "flex-start" },
  restTag: {
    height: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    backgroundColor: colors.warning.bg
  },
  restTagLabel: {
    ...sans(700),
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.warning.fg
  }
}));
