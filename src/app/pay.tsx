import type { TFunction } from "i18next";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Logo } from "@/components/layout/Logo";
import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { AmountBlock } from "@/components/ui/AmountBlock";
import { Arrival } from "@/components/ui/Arrival";
import { Button } from "@/components/ui/Button";
import { CodePlate } from "@/components/ui/CodePlate";
import { Countdown } from "@/components/ui/Countdown";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Icon, type IconName } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";
import { LoadingScene, useLoadingScene, type LoadingSceneSpec } from "@/components/ui/LoadingScene";
import { outOfReach } from "@/components/ui/reach";
import { StatusPill } from "@/components/ui/StatusPill";
import { WaitingIndicator } from "@/components/ui/WaitingIndicator";
import { ThemeSwitch } from "@/features/appearance/ThemeSwitch";
import { useUrlFragment } from "@/features/linking/useUrlFragment";
import {
  REDIRECT_DELAY_MS,
  useCheckoutLink,
  type CheckoutState
} from "@/features/payment-link/useCheckoutLink";
import {
  useSharedInvoice,
  type PaymentCheck,
  type SharedInvoiceState
} from "@/features/payment-link/useSharedInvoice";
import { ReceivedTransactions } from "@/features/onchain/ReceivedTransactions";
import { TxLink } from "@/features/onchain/TxLink";
import { UnderpaidChain } from "@/features/onchain/UnderpaidChain";
import type { DetailTransaction, PaymentDetails } from "@/features/payment-link/details";
import { AutoReturnRing } from "@/features/terminal/AutoReturnRing";
import { INVOICE_EXPIRY_SECONDS } from "@/features/terminal/invoice";
import type { PaymentMethod } from "@/features/terminal/useSale";
import { EndedRequest, LateCountdown } from "@/features/terminal/LateCheck";
import { SaleNote } from "@/features/terminal/SaleNote";
import { getDeviceLocale } from "@/lib/locale/device";
import { formatDate } from "@/lib/locale/date";
import { formatInteger } from "@/lib/locale/format";
import { acceptsOnchain, REQUIRED_CONFIRMATIONS } from "@/config/onchain";
import { formatBtcAmount, paymentUri } from "@/lib/onchain/bip21";
import type { PayerNode } from "@/lib/onchain/node";
import { parseCheckoutFragment } from "@/lib/payment-link/checkout";
import {
  canCopyText,
  copyText,
  openRedirect,
  openUri,
  rememberRedirect,
  wasRedirected
} from "@/lib/payment-link/device";
import { isLongSale, type LinkFiat, type SharedInvoice } from "@/lib/payment-link/payload";
import { formatFiat, formatFiatPlain, formatSatsGrouped, splitFiat } from "@/lib/terminal/amount";
import {
  control,
  gutter,
  makeStyles,
  mono,
  palette,
  type PaymentState,
  proseLineHeight,
  radius,
  sans,
  stroke,
  tracked,
  type,
  useTheme
} from "@/theme";

const QR_MOBILE = 216;
const QR_DESKTOP = 260;

/**
 * The payer's page of a payment link (`/pay#<id>.<key>`, src/lib/payment-link/): the sale a point
 * of sale shared, read from the Nostr relays with the id and key of the URL fragment, which the web
 * app's host never receives, and the invoice of the hour, which the page asks itself
 * (useSharedInvoice). Or an integration's checkout link (`/pay#c.<author>.<key>.<relays>`,
 * src/lib/payment-link/checkout.ts): the invoice an online shop's server declared, whose payment
 * the page checks before it sends the payer back to the shop (useCheckoutLink). Composed of the point
 * of sale's pieces. Opens without an account, and shows nothing of the
 * device's own (profile, settings).
 */
export default function PaymentLinkScreen() {
  const fragment = useUrlFragment();
  // Another link pasted in this tab only changes the fragment: it starts afresh.
  if (parseCheckoutFragment(fragment).status !== "other") {
    return <CheckoutPage key={fragment} fragment={fragment} />;
  }
  return <SharedInvoicePage key={fragment} fragment={fragment} />;
}

/** The page's frame: its logo, then `children`, laid out for a phone or a desktop. */
function PageFrame({ children }: { children: (desktop: boolean) => ReactNode }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const desktop = useIsDesktop();
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.body,
        {
          paddingTop: insets.top + (desktop ? 40 : 20),
          paddingBottom: Math.max(insets.bottom, desktop ? 40 : 24)
        }
      ]}
    >
      <View style={styles.column}>
        {/* The logo centred, the switch of theme on its right. */}
        <View style={styles.header}>
          <View style={styles.headerSide} />
          <Logo width={desktop ? 168 : 150} />
          <View style={[styles.headerSide, styles.headerEnd]}>
            <ThemeSwitch />
          </View>
        </View>
        {children(desktop)}
      </View>
    </ScrollView>
  );
}

function SharedInvoicePage({ fragment }: { fragment: string }) {
  const { t } = useTranslation();
  const { state, now, retry } = useSharedInvoice(fragment);
  const label =
    state.phase === "checking"
      ? waitingLabel(t, state)
      : state.phase === "loading"
        ? t("paymentLink.loading")
        : state.phase === "creating"
          ? t("pos.creating")
          : state.phase === "updating"
            ? t("paymentLink.updatingRate")
            : null;
  return (
    <PageFrame>
      {(desktop) => (
        <WaitThen label={label}>
          <Content state={state} now={now} desktop={desktop} onRetry={retry} />
        </WaitThen>
      )}
    </PageFrame>
  );
}

/**
 * The page's loading scene while `label` (what it waits for: whether a payment request exists,
 * or was paid, is not known yet; never the invoice, nor "Request expired"), then `children`. Once
 * read, the scene fades out, then `children` fade in (useLoadingScene, Arrival.tsx).
 */
function WaitThen({ label, children }: { label: string | null; children: ReactNode }) {
  const styles = useStyles();
  const spec: LoadingSceneSpec | null =
    label === null ? null : { scene: "payment", label, testID: "loading-spinner" };
  const { scene, waited } = useLoadingScene(spec);
  if (scene) {
    return (
      <View style={styles.loading}>
        <LoadingScene {...scene} />
      </View>
    );
  }
  return (
    <Arrival fade={waited} style={styles.arrival}>
      {children}
    </Arrival>
  );
}

function CheckoutPage({ fragment }: { fragment: string }) {
  const { t } = useTranslation();
  const { state, now, id, retry } = useCheckoutLink(fragment);
  const label =
    state.phase === "loading"
      ? t("paymentLink.loading")
      : state.phase === "checking"
        ? t("pos.checkingPayment")
        : null;
  return (
    <PageFrame>
      {(desktop) => (
        <WaitThen label={label}>
          <CheckoutContent state={state} now={now} id={id} desktop={desktop} onRetry={retry} />
        </WaitThen>
      )}
    </PageFrame>
  );
}

/**
 * An integration's checkout link: the invoice, as the payment link of a sale shows it (QR, the
 * payer's wallet, the receipt, the time left), then its outcome. Paid, or enough sent on-chain in
 * time and being confirmed, with a redirect URL: the button back to the shop, which goes there on
 * its own (RedirectButton). Expired or not proven: never.
 */
function CheckoutContent({
  state,
  now,
  id,
  desktop,
  onRetry
}: {
  state: CheckoutState;
  now: number;
  id: string | null;
  desktop: boolean;
  onRetry: () => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  switch (state.phase) {
    case "loading":
    case "checking":
      // Its page draws its loading scene instead (WaitThen).
      return null;
    case "invalid":
    case "notFound":
      return (
        <Outcome
          state="canceled"
          icon="circle-exclamation"
          title={t("paymentLink.notFound.title")}
          notice={t(
            state.phase === "invalid"
              ? "paymentLink.notFound.invalid"
              : "paymentLink.notFound.notice"
          )}
        />
      );
    case "newer":
      return (
        <Outcome
          state="canceled"
          icon="arrows-rotate"
          title={t("paymentLink.checkout.newer.title")}
          notice={t("paymentLink.checkout.newer.notice")}
        />
      );
    case "unreachable":
      return (
        <Outcome
          state="canceled"
          icon="circle-exclamation"
          title={t("paymentLink.unreachable.title")}
          notice={t("paymentLink.unreachable.notice")}
          footer={
            <Button onPress={onRetry} icon="arrows-rotate" testID="retry">
              {t("paymentLink.retry")}
            </Button>
          }
        />
      );
    case "open": {
      const { record } = state;
      const { invoice, onchainAddress: address } = record;
      // One code for both, as a payment link's (BIP-21, SPEC.md §31); the wallet's button opens
      // it too, with the order's note (see Waiting).
      const code = codeOf(address, record.sats, invoice?.pr ?? null);
      const wallet = codeOf(address, record.sats, invoice?.pr ?? null, record.note);
      const secondsLeft = Math.max(0, record.expiresAt - now);
      const lifetime = record.expiresAt - record.createdAt;
      return (
        <View style={styles.waiting}>
          <Amount fiat={record.fiat} sats={record.sats} />
          <SaleNote note={record.note} />
          <View style={styles.qr}>
            <CodePlate value={code} size={desktop ? QR_DESKTOP : QR_MOBILE} />
          </View>
          <PayActions
            checking={false}
            wallet={wallet}
            receipt={
              <Receipt
                invoice={invoice?.pr ?? null}
                address={address}
                sats={record.sats}
                fiat={record.fiat}
                amountLabel={t("paymentLink.receipt.amount")}
                withheld={false}
              />
            }
          />
          <Countdown
            label={t("pos.expiresIn")}
            seconds={secondsLeft}
            progress={lifetime > 0 ? Math.min(1, secondsLeft / lifetime) : 0}
          />
          <WaitingIndicator label={t("pos.waiting")} />
        </View>
      );
    }
    case "ended": {
      // Its end passed, its payment not proven: still checked, a payment of its last seconds may
      // be reported late (as a sale's, Ended above).
      const { record } = state;
      return (
        <View style={styles.waiting}>
          <Amount fiat={record.fiat} sats={record.sats} />
          <SaleNote note={record.note} />
          <View style={styles.qr}>
            <CodePlate
              value={null}
              size={desktop ? QR_DESKTOP : QR_MOBILE}
              ended={<EndedRequest desktop={desktop} />}
            />
          </View>
          <LateCountdown lateUntil={state.lateUntil} now={now} />
          <WaitingIndicator label={t("pos.checkingPayment")} />
        </View>
      );
    }
    case "underpaid":
      return <CheckoutUnderpaid state={state} now={now} desktop={desktop} />;
    case "underpaidEnded":
      return <CheckoutUnderpaidEnded state={state} />;
    case "unconfirmed": {
      // Enough sent on-chain in time, being confirmed: back to the shop already, as once paid
      // (the payer would otherwise wait half an hour on this page).
      // The redirection proves nothing either way: the shop's server checks the payment, which it
      // tells `unconfirmed` until it is 3 deep (SPEC.md §22, §31).
      const { record } = state;
      const { redirectUrl, redirectShown } = record;
      const redirect = redirectUrl !== null && redirectShown !== null && id !== null;
      return (
        <Outcome
          state="unconfirmed"
          icon="hourglass-half"
          pill={t("pos.unconfirmed.pill")}
          view={{ fiat: record.fiat, sats: record.sats, note: record.note }}
          // Never "You can close this page" when the page leaves on its own.
          notice={t(
            redirect ? "paymentLink.checkout.unconfirmed.notice" : "paymentLink.unconfirmed.notice"
          )}
          details={{
            details: state.details,
            businessName: record.businessName,
            node: record.bitcoinNode
          }}
          footer={
            redirect ? (
              <RedirectButton id={id} url={redirectUrl} shown={redirectShown} />
            ) : undefined
          }
        />
      );
    }
    case "paid": {
      const { record } = state;
      return (
        <Outcome
          state="settled"
          icon="check"
          pill={t("paymentLink.paid.pill")}
          view={{ fiat: record.fiat, sats: record.sats, note: record.note }}
          notice={t("paymentLink.paid.notice", { business: record.businessName })}
          details={{
            details: state.details,
            businessName: record.businessName,
            node: record.bitcoinNode
          }}
          footer={
            record.redirectUrl !== null && record.redirectShown !== null && id !== null ? (
              <RedirectButton id={id} url={record.redirectUrl} shown={record.redirectShown} />
            ) : undefined
          }
        />
      );
    }
    case "expired":
      return (
        <Outcome
          state="expired"
          icon="hourglass-end"
          pill={t("paymentLink.expired.pill")}
          // An order priced in sats has no other figure than its invoice's.
          view={{
            fiat: state.record.fiat,
            sats: state.record.fiat ? null : state.record.sats,
            note: state.record.note
          }}
          // A payment came after the lease's end: never "no payment was received".
          notice={t(
            state.late
              ? "paymentLink.checkout.expired.late"
              : "paymentLink.checkout.expired.notice",
            { business: state.record.businessName }
          )}
        />
      );
  }
}

/**
 * Less than the amount received in time for a checkout link's invoice (SPEC.md §30, §31): the rest,
 * until the invoice's end, as a payment link's Underpaid below shows it (the chain card, the
 * receipt of the rest, the time left): in Lightning with the invoice of the rest the integration's
 * server published (the page cannot make one), and on-chain to the same address from
 * MIN_ONCHAIN_SATS, in one code (as at the point of sale);
 * below, in Lightning only, the plate's spinner until its invoice comes. A link whose record names
 * no rest keys (its server shows no invoice of the rest) takes the rest on-chain only, whatever it
 * is.
 * While an invoice of the rest that came is not told yet (`checking`), the code stays blurred and
 * nothing offers to pay, as a payment link's.
 */
function CheckoutUnderpaid({
  state,
  now,
  desktop
}: {
  state: Extract<CheckoutState, { phase: "underpaid" }>;
  now: number;
  desktop: boolean;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const [languageTag] = useState(() => getDeviceLocale().languageTag);
  const { record, received, rest, restInvoice, checking } = state;
  // Its state exists only with an address (something was received there).
  const address = record.rest === null || acceptsOnchain(rest) ? record.onchainAddress! : null;
  // The wallet's button opens this code too, with the order's note, as for the whole amount (see
  // Waiting).
  const code = codeOf(address, rest, restInvoice?.pr ?? null);
  const wallet = codeOf(address, rest, restInvoice?.pr ?? null, record.note);
  const { fiat, sats } = record;
  // The rest's share of the fiat amount, as the point of sale shows it (rounded up).
  const restFiat = fiat
    ? { ...fiat, minor: splitFiat(fiat.minor, sats, received).restMinor }
    : null;
  const secondsLeft = Math.max(0, record.expiresAt - now);
  const lifetime = record.expiresAt - record.createdAt;
  return (
    <View style={styles.waiting}>
      <Amount fiat={fiat} sats={sats} />
      <SaleNote note={record.note} />
      <View style={styles.qr}>
        {/* Without a code (the invoice of a small rest not come yet), the plate's spinner. */}
        <CodePlate
          value={code}
          size={desktop ? QR_DESKTOP : QR_MOBILE}
          blurred={checking}
          testID="rest-plate"
        />
      </View>
      <PayActions
        checking={checking}
        wallet={wallet}
        notice={
          <Notice
            state="underpaid"
            text={t(
              record.rest === null
                ? "paymentLink.checkout.underpaid.notice"
                : address !== null
                  ? "paymentLink.underpaid.notice"
                  : "paymentLink.underpaid.noticeLightning",
              { received: formatInteger(received, languageTag) }
            )}
          />
        }
        receipt={
          <Receipt
            invoice={restInvoice?.pr ?? null}
            address={address}
            sats={rest}
            fiat={restFiat}
            amountLabel={t("pos.underpaid.restToPay")}
            withheld={checking}
          />
        }
      />
      <UnderpaidChain
        received={received}
        rest={rest}
        sats={sats}
        fiat={fiat}
        languageTag={languageTag}
        receipts={state.receipts}
        now={now}
        node={record.bitcoinNode}
      />
      <Countdown
        label={t("pos.expiresIn")}
        seconds={secondsLeft}
        progress={lifetime > 0 ? Math.min(1, secondsLeft / lifetime) : 0}
      />
      <WaitingIndicator label={t(checking ? "pos.checkingPayment" : "pos.waiting")} />
    </View>
  );
}

/**
 * A checkout link's invoice ended with less than its amount received in time: it stays so, as a
 * payment link's UnderpaidEnded below (what was received, what is missing, each transaction and
 * the invoices of the rest paid); no redirection.
 */
function CheckoutUnderpaidEnded({
  state
}: {
  state: Extract<CheckoutState, { phase: "underpaidEnded" }>;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const [languageTag] = useState(() => getDeviceLocale().languageTag);
  const { record, received } = state;
  const missing = record.sats - received;
  return (
    <Outcome
      state="underpaid"
      icon="circle-half-stroke"
      pill={t("pos.underpaidEnded.pill")}
      view={{ fiat: record.fiat, sats: record.sats, note: record.note }}
      notice={t("paymentLink.underpaidEnded.notice", {
        received: formatInteger(received, languageTag),
        missing: formatInteger(missing, languageTag),
        business: record.businessName
      })}
      footer={
        <View style={styles.endedCards}>
          <UnderpaidChain
            received={received}
            rest={missing}
            sats={record.sats}
            fiat={record.fiat}
            languageTag={languageTag}
            ended
            node={record.bitcoinNode}
          />
          <ReceivedTransactions
            transactions={state.transactions}
            lightning={state.lightning}
            languageTag={languageTag}
            node={record.bitcoinNode}
          />
        </View>
      }
    />
  );
}

/** Sends the payer to `url`, remembered for the link `id` names (wasRedirected). */
function sendBack(id: string, url: string): void {
  rememberRedirect(id);
  void openRedirect(url).catch(() => undefined);
}

/**
 * Back to the shop, once the invoice is proven paid or enough was sent on-chain in time:
 * "Continue", with where it leads in small ("Redirecting to shop.example", or the app's
 * scheme), and the auto-return ring of the point of sale, which empties over
 * REDIRECT_DELAY_MS and then goes there on its own; a tap goes there at once. On its own once per tab (wasRedirected): a payer who comes back sees the
 * receipt and the button, without the ring. A browser may not open an app without a tap: the
 * button stays for one.
 */
function RedirectButton({ id, url, shown }: { id: string; url: string; shown: string }) {
  const { t } = useTranslation();
  const [counting, setCounting] = useState(() => !wasRedirected(id));
  const [secondsLeft, setSecondsLeft] = useState(REDIRECT_DELAY_MS / 1000);
  const go = () => {
    setCounting(false);
    sendBack(id, url);
  };

  useEffect(() => {
    if (!counting) return;
    const started = Date.now();
    const timer = setInterval(() => {
      const left = Math.max(0, Math.ceil((REDIRECT_DELAY_MS - (Date.now() - started)) / 1000));
      setSecondsLeft(left);
      if (left === 0) {
        clearInterval(timer);
        setCounting(false);
        sendBack(id, url);
      }
    }, 250);
    return () => clearInterval(timer);
  }, [counting, id, url]);

  return (
    <Button
      onPress={go}
      caption={t("paymentLink.checkout.redirectTo", { target: shown })}
      accessory={
        counting
          ? (color) => (
              <AutoReturnRing
                durationMs={REDIRECT_DELAY_MS}
                secondsLeft={secondsLeft}
                color={color}
              />
            )
          : undefined
      }
      testID="redirect"
    >
      {t("paymentLink.checkout.continue")}
    </Button>
  );
}

function Content({
  state,
  now,
  desktop,
  onRetry
}: {
  state: SharedInvoiceState;
  now: number;
  desktop: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  switch (state.phase) {
    case "loading":
    case "creating":
    case "updating":
    case "checking":
      // Its page draws its loading scene instead (WaitThen).
      return null;
    case "invalid":
    case "notFound":
      return (
        <Outcome
          state="canceled"
          icon="circle-exclamation"
          title={t("paymentLink.notFound.title")}
          notice={t(
            state.phase === "invalid"
              ? "paymentLink.notFound.invalid"
              : "paymentLink.notFound.notice"
          )}
        />
      );
    case "unreachable":
      return (
        <Outcome
          state="canceled"
          icon="circle-exclamation"
          title={t("paymentLink.unreachable.title")}
          notice={t("paymentLink.unreachable.notice")}
          footer={
            <Button onPress={onRetry} icon="arrows-rotate" testID="retry">
              {t("paymentLink.retry")}
            </Button>
          }
        />
      );
    case "failed":
      // Above the most the merchant's Lightning address accepts, with no address to pay on-chain:
      // another try asks the same (as at the point of sale).
      return state.onchainOnly ? (
        <Outcome
          state="canceled"
          icon="circle-exclamation"
          title={t("paymentLink.failed.title")}
          notice={t("paymentLink.failed.onchainOnly", { business: state.businessName })}
        />
      ) : (
        <Outcome
          state="canceled"
          icon="circle-exclamation"
          title={t("paymentLink.failed.title")}
          notice={t("paymentLink.failed.notice")}
          footer={
            <Button onPress={onRetry} icon="arrows-rotate" testID="retry">
              {t("paymentLink.retry")}
            </Button>
          }
        />
      );
    case "ended":
      return <Ended state={state} now={now} desktop={desktop} />;
    case "open":
      return (
        <Waiting
          invoice={state.invoice}
          checking={state.checking ?? null}
          now={now}
          desktop={desktop}
        />
      );
    case "unconfirmed":
      return (
        <Outcome
          state="unconfirmed"
          icon="hourglass-half"
          pill={t("pos.unconfirmed.pill")}
          view={state.view}
          notice={t("paymentLink.unconfirmed.notice")}
          details={{
            details: state.details,
            businessName: state.view.businessName,
            node: state.view.bitcoinNode
          }}
        />
      );
    case "underpaid":
      return <Underpaid state={state} now={now} desktop={desktop} />;
    case "underpaidEnded":
      return <UnderpaidEnded state={state} />;
    case "paid":
      return (
        <Outcome
          state="settled"
          icon="check"
          pill={t("paymentLink.paid.pill")}
          view={state.view}
          notice={t("paymentLink.paid.notice", { business: state.view.businessName })}
          details={{
            details: state.details,
            businessName: state.view.businessName,
            node: state.view.bitcoinNode
          }}
          footer={state.view.redirectUrl ? <Continue url={state.view.redirectUrl} /> : undefined}
        />
      );
    case "accepted":
      // Paid short, the business accepted what it received.
      return (
        <Outcome
          state="settled"
          icon="check"
          pill={t("paymentLink.paid.pill")}
          view={state.view}
          notice={t("paymentLink.accepted.notice", { business: state.view.businessName })}
          footer={state.view.redirectUrl ? <Continue url={state.view.redirectUrl} /> : undefined}
        />
      );
    case "expired":
      return (
        <Outcome
          state="expired"
          icon="hourglass-end"
          pill={t("paymentLink.expired.pill")}
          view={state.view}
          notice={t("paymentLink.expired.notice", { business: state.view.businessName })}
        />
      );
    case "canceled":
      return (
        <Outcome
          state="canceled"
          icon="ban"
          pill={t("paymentLink.canceled.pill")}
          view={state.view}
          notice={t("paymentLink.canceled.notice", { business: state.view.businessName })}
        />
      );
    // A payment came, which another sale declared too: the business checks it, the payer is never
    // asked to pay again.
    case "disputed":
      return (
        <Outcome
          state="underpaid"
          icon="triangle-exclamation"
          pill={t("paymentLink.disputed.pill")}
          view={state.view}
          notice={t("paymentLink.disputed.notice", { business: state.view.businessName })}
        />
      );
  }
}

/**
 * The sale ended with less than due received: it stays so, with what was
 * received and what is missing (the point of sale's chain card) and each payment received; no code,
 * nothing asked any more.
 */
function UnderpaidEnded({
  state
}: {
  state: Extract<SharedInvoiceState, { phase: "underpaidEnded" }>;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const [languageTag] = useState(() => getDeviceLocale().languageTag);
  const missing = state.due - state.received;
  return (
    <Outcome
      state="underpaid"
      icon="circle-half-stroke"
      pill={t("pos.underpaidEnded.pill")}
      view={state.view}
      notice={t("paymentLink.underpaidEnded.notice", {
        received: formatInteger(state.received, languageTag),
        missing: formatInteger(missing, languageTag),
        business: state.view.businessName
      })}
      footer={
        <View style={styles.endedCards}>
          <UnderpaidChain
            received={state.received}
            rest={missing}
            sats={state.due}
            fiat={state.view.fiat}
            languageTag={languageTag}
            ended
            node={state.view.bitcoinNode}
          />
          <ReceivedTransactions
            transactions={state.transactions}
            lightning={state.lightning}
            languageTag={languageTag}
            node={state.view.bitcoinNode}
          />
        </View>
      }
    />
  );
}

/**
 * The fiat amount asked and its sats, when known, in this device's number format. Without a fiat
 * amount (a checkout link's order priced in sats): the sats alone, as the figure.
 */
function Amount({ fiat, sats }: { fiat: LinkFiat | null; sats: bigint | null }) {
  const { t } = useTranslation();
  const [languageTag] = useState(() => getDeviceLocale().languageTag);
  if (!fiat) {
    return sats === null ? null : (
      <AmountBlock amount={formatInteger(sats, languageTag)} currency="sats" />
    );
  }
  return (
    <AmountBlock
      amount={formatFiat(fiat.minor, fiat.digits, languageTag)}
      currency={fiat.currency}
      sats={sats === null ? undefined : formatSatsGrouped(sats)}
      satsLabel={
        sats === null ? undefined : t("pos.satsLabel", { sats: formatInteger(sats, languageTag) })
      }
    />
  );
}

/**
 * The invoice to pay: QR, the payer's wallet, the receipt (what to copy), the time left. The QR
 * carries the on-chain address too when the link has one (BIP-21), as at the point of sale, and
 * the wallet's button opens that same code: a Lightning wallet pays its
 * `lightning` parameter, an on-chain-only wallet the address. A `lightning:` URI would open a
 * wallet that claims the scheme without paying invoices (Sparrow reads it as LNURL-auth only).
 * The button's code also carries the sale's note, which wallets show when
 * paid on-chain (paymentUri); a `lightning:` URI, of a sale without an address, has no room for it.
 * Above the most the merchant's Lightning address accepts, the code is the address alone, as at the
 * point of sale. While a payment seen is checked (`checking`), the code stays blurred under the spinner and the
 * countdown goes on, as at the point of sale; nothing offers to pay meanwhile (`PayActions`).
 */
function Waiting({
  invoice,
  checking,
  now,
  desktop
}: {
  invoice: SharedInvoice;
  checking: PaymentCheck | null;
  now: number;
  desktop: boolean;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  // Above the most the merchant's Lightning address accepts, its address alone (useSale.ts).
  const pr = invoice.invoice?.pr ?? null;
  const code = codeOf(invoice.onchainAddress, invoice.sats, pr);
  const wallet = codeOf(invoice.onchainAddress, invoice.sats, pr, invoice.note);
  // The end of the sale, whatever invoice of the hour is shown.
  const secondsLeft = Math.max(0, invoice.endsAt - now);
  const lifetime = INVOICE_EXPIRY_SECONDS;

  return (
    <View style={styles.waiting}>
      <Amount fiat={invoice.fiat} sats={invoice.sats} />
      <SaleNote note={invoice.note} />
      {/* The plate aligns itself to the start: centred by its row. */}
      <View style={styles.qr}>
        <CodePlate
          value={code}
          size={desktop ? QR_DESKTOP : QR_MOBILE}
          blurred={checking !== null}
        />
      </View>
      <PayActions
        checking={checking !== null}
        wallet={wallet}
        receipt={
          <Receipt
            invoice={pr}
            address={invoice.onchainAddress}
            sats={invoice.sats}
            fiat={invoice.fiat}
            amountLabel={t("paymentLink.receipt.amount")}
            withheld={checking !== null}
          />
        }
      />
      {isLongSale(invoice) ? (
        <PayableUntil endsAt={invoice.endsAt} />
      ) : (
        <Countdown
          label={t("pos.expiresIn")}
          seconds={secondsLeft}
          progress={lifetime > 0 ? Math.min(1, secondsLeft / lifetime) : 0}
        />
      )}
      <WaitingIndicator label={waitingLabel(t, checking)} />
    </View>
  );
}

/**
 * The sale ended with nothing received, while its invoices are still checked for a payment reported
 * late, as at the point of sale (not the page's loader alone, once the countdown reached 00:00):
 * the amount, the plate saying the request expired, the time left of those checks
 * (LateCheck.tsx). Nothing to pay any more: neither the wallet's button nor the receipt.
 */
function Ended({
  state,
  now,
  desktop
}: {
  state: Extract<SharedInvoiceState, { phase: "ended" }>;
  now: number;
  desktop: boolean;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { view } = state;
  return (
    <View style={styles.waiting}>
      <Amount fiat={view.fiat} sats={view.sats} />
      <SaleNote note={view.note} />
      <View style={styles.qr}>
        <CodePlate
          value={null}
          size={desktop ? QR_DESKTOP : QR_MOBILE}
          ended={<EndedRequest desktop={desktop} />}
        />
      </View>
      <LateCountdown lateUntil={state.lateUntil} now={now} />
      <WaitingIndicator label={t(state.bitcoin ? "pos.checking" : "pos.checkingPayment")} />
    </View>
  );
}

/**
 * The code of `sats`: on-chain to `address` (null for a Lightning only sale, or the rest of an
 * underpayment below MIN_ONCHAIN_SATS) and over Lightning with `invoice` (null while none came, or
 * an order paid on-chain only), in one code (BIP-21); null while there is neither. `title`, for the
 * wallet's button only (see Waiting): the sale's note.
 */
function codeOf(
  address: string | null,
  sats: bigint,
  invoice: string | null,
  title?: string
): string | null {
  if (address) return paymentUri({ address, sats, invoice, title });
  return invoice ? `lightning:${invoice}` : null;
}

/**
 * Less than asked was paid on-chain: the rest, over Lightning (an invoice of the rest this page
 * asked the merchant's Lightning address for) and, from `MIN_ONCHAIN_SATS`, on-chain to the same
 * address, in one code; the receipt gives the rest, and the
 * point of sale's chain card what was received and what is missing.
 * Until the sale's end, as at the point of sale. While a payment seen is
 * checked (`state.checking`), as `Waiting`.
 */
function Underpaid({
  state,
  now,
  desktop
}: {
  state: Extract<SharedInvoiceState, { phase: "underpaid" }>;
  now: number;
  desktop: boolean;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const [languageTag] = useState(() => getDeviceLocale().languageTag);
  // On-chain from MIN_ONCHAIN_SATS, when the sale has an address.
  const address = acceptsOnchain(state.rest) ? state.address : null;
  const onchain = address !== null;
  // The wallet's button opens this code too, with the sale's note, as for the whole amount (see
  // Waiting).
  const code = codeOf(address, state.rest, state.restInvoice?.pr ?? null);
  const wallet = codeOf(address, state.rest, state.restInvoice?.pr ?? null, state.view.note);
  const size = desktop ? QR_DESKTOP : QR_MOBILE;
  const { fiat } = state.view;
  const sats = state.due;
  // The rest's share of the fiat amount, as the point of sale shows it (rounded up).
  const { restMinor } = splitFiat(fiat.minor, sats, sats - state.rest);
  const secondsLeft = Math.max(0, Math.min(INVOICE_EXPIRY_SECONDS, state.view.endsAt - now));

  return (
    <View style={styles.waiting}>
      <Amount fiat={fiat} sats={sats} />
      <View style={styles.qr}>
        {/* Without a code (the invoice of a small rest being asked), the plate's spinner in its
            place: nothing moves when the code comes, and it fades in as at the point of sale. */}
        <CodePlate
          value={code}
          size={size}
          blurred={state.checking !== undefined}
          testID="rest-plate"
        />
      </View>
      <PayActions
        checking={state.checking !== undefined}
        wallet={wallet}
        notice={
          // Right under the wallet's button: why there is something left to pay.
          <Notice
            state="underpaid"
            text={t(
              onchain ? "paymentLink.underpaid.notice" : "paymentLink.underpaid.noticeLightning",
              { received: formatInteger(state.received, languageTag) }
            )}
          />
        }
        receipt={
          <Receipt
            invoice={state.restInvoice?.pr ?? null}
            address={address}
            sats={state.rest}
            fiat={{ ...fiat, minor: restMinor }}
            amountLabel={t("pos.underpaid.restToPay")}
            withheld={state.checking !== undefined}
          />
        }
      />
      <UnderpaidChain
        received={state.received}
        rest={state.rest}
        sats={sats}
        fiat={fiat}
        languageTag={languageTag}
        receipts={state.receipts}
        now={now}
        node={state.view.bitcoinNode}
      />
      {isLongSale(state.view) ? (
        <PayableUntil endsAt={state.view.endsAt} />
      ) : (
        <Countdown
          label={t("pos.expiresIn")}
          seconds={secondsLeft}
          progress={secondsLeft / INVOICE_EXPIRY_SECONDS}
        />
      )}
      <WaitingIndicator label={waitingLabel(t, state.checking ?? null)} />
    </View>
  );
}

/**
 * An invoice of "New invoice" (a link of version 4): payable until its due date, months
 * away, in place of the point of sale's countdown of 10 minutes (the line of "Payable until" of
 * the invoice's due date step).
 */
function PayableUntil({ endsAt }: { endsAt: number }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const [languageTag] = useState(() => getDeviceLocale().languageTag);
  // The sale ends at the end of the due date (a second before midnight where it was made).
  const date = formatDate(new Date((endsAt - 1) * 1000), languageTag, { dateStyle: "long" });
  return (
    <View style={styles.payableUntil} testID="payable-until">
      <Icon name="clock-regular" size={13} color={colors.text.secondary} />
      <Text style={styles.payableUntilText}>{t("paymentLink.payableUntil", { date })}</Text>
    </View>
  );
}

/** What the screen with a code waits for: the payment, or the check of a payment seen. */
function waitingLabel(t: TFunction, checking: PaymentCheck | null): string {
  if (!checking) return t("pos.waiting");
  return t(checking.bitcoin ? "pos.checking" : "pos.checkingPayment");
}

/**
 * The payer's wallet, then what to copy (`receipt`), with a `notice` between them. While a payment
 * seen is checked (`checking`), the wallet's button is disabled (the receipt withholds its copy
 * buttons too): nothing offers to pay again.
 */
function PayActions({
  checking,
  wallet,
  notice,
  receipt
}: {
  checking: boolean;
  /** What the wallet opens; null while there is nothing to open. */
  wallet: string | null;
  notice?: ReactNode;
  receipt: ReactNode;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <View style={styles.actions}>
      <Button
        icon="wallet"
        disabled={checking || wallet === null}
        // On the web, a link the browser follows: browser wallets (Alby) open it themselves.
        href={wallet ?? undefined}
        onPress={() => {
          if (wallet) void openUri(wallet).catch(() => undefined);
        }}
        testID="open-wallet"
      >
        {t("paymentLink.openWallet")}
      </Button>
      {notice}
      {receipt}
    </View>
  );
}

/** The units of the receipt's amount, in the order its unit button goes through them. */
type Unit = "btc" | "sats" | "fiat";
const NEXT_UNIT: Record<Unit, Unit> = { btc: "sats", sats: "fiat", fiat: "btc" };

/** The unit after `unit`: without a fiat amount, BTC and sats only. */
function nextUnit(unit: Unit, fiat: LinkFiat | null): Unit {
  const next = NEXT_UNIT[unit];
  return next === "fiat" && !fiat ? NEXT_UNIT[next] : next;
}

type Copyable = "invoice" | "address" | "amount";

/** How long a row says "Copied" before its copy button comes back. */
export const COPIED_MS = 2500;

/** What is shown, and copied, of `sats` (or of its fiat amount) in `unit`. */
function amountIn(
  unit: Unit,
  sats: bigint,
  fiat: LinkFiat | null,
  languageTag: string
): { shown: string; copied: string; unit: string } {
  if (unit === "fiat") {
    if (!fiat) return amountIn("sats", sats, fiat, languageTag);
    return {
      shown: formatFiat(fiat.minor, fiat.digits, languageTag),
      copied: formatFiatPlain(fiat.minor, fiat.digits, languageTag),
      unit: fiat.currency
    };
  }
  switch (unit) {
    case "btc": {
      // As in the payment code: a dot, whatever the locale.
      const btc = formatBtcAmount(sats);
      return { shown: btc, copied: btc, unit: "BTC" };
    }
    case "sats":
      return { shown: formatInteger(sats, languageTag), copied: sats.toString(), unit: "sats" };
  }
}

/** A long code cut in its middle, its start and end kept (react-native-web has no middle ellipsis). */
function middle(text: string, head: number, tail: number): string {
  return text.length <= head + tail + 1 ? text : `${text.slice(0, head)}…${text.slice(-tail)}`;
}

/**
 * The receipt: for a wallet that can neither scan the code nor open the
 * link, the Lightning invoice, the Bitcoin address and the amount, each copied with its button; the
 * amount's unit (a tappable unit) goes BTC → sats → fiat with a tap, and what is copied is what
 * is shown (sats without grouping, fiat without grouping, BTC with a dot). Rows without a value
 * (no address, an invoice being asked) are left out. Without a clipboard, nothing to copy.
 * `withheld`, while a payment seen is checked: the copy buttons are hidden and out of reach in
 * their place (a second payment could go to the address), so that nothing moves; the rows stay to
 * read.
 */
function Receipt({
  invoice,
  address,
  sats,
  fiat,
  amountLabel,
  withheld
}: {
  invoice: string | null;
  address: string | null;
  sats: bigint;
  /** Null for an amount in sats alone (a checkout link's order priced in sats). */
  fiat: LinkFiat | null;
  amountLabel: string;
  withheld: boolean;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const [languageTag] = useState(() => getDeviceLocale().languageTag);
  const [unit, setUnit] = useState<Unit>("btc");
  const [copy, setCopy] = useState<{ what: Copyable; outcome: "copied" | "failed" } | null>(null);
  const copyable = canCopyText();
  const amount = amountIn(unit, sats, fiat, languageTag);
  const next = amountIn(nextUnit(unit, fiat), sats, fiat, languageTag);

  // "Copied" for a moment, then the button again; a failure stays until the next copy.
  useEffect(() => {
    if (copy?.outcome !== "copied") return;
    const timer = setTimeout(() => setCopy(null), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copy]);

  const copyOf = (what: Copyable, text: string) => () => {
    copyText(text).then(
      () => setCopy({ what, outcome: "copied" }),
      () => setCopy({ what, outcome: "failed" })
    );
  };
  const copied = (what: Copyable) => copy?.what === what && copy.outcome === "copied";
  const copyButton = (what: Copyable, text: string, label: string) =>
    copyable ? (
      <View
        style={withheld ? styles.withheld : undefined}
        {...outOfReach(withheld)}
        testID={`copy-${what}-place`}
      >
        <CopyButton
          label={label}
          copied={copied(what)}
          copiedLabel={t(
            what === "invoice"
              ? "paymentLink.receipt.invoiceCopied"
              : what === "address"
                ? "paymentLink.receipt.addressCopied"
                : "paymentLink.receipt.amountCopied"
          )}
          copiedHint={t(
            what === "invoice"
              ? "paymentLink.copied"
              : what === "address"
                ? "paymentLink.addressCopied"
                : "paymentLink.amountCopied"
          )}
          onPress={copyOf(what, text)}
          testID={`copy-${what}`}
        />
      </View>
    ) : null;

  const rows: ReactNode[] = [];
  if (invoice) {
    rows.push(
      <View key="invoice" style={styles.receiptRow}>
        <View style={styles.receiptText}>
          <View style={styles.receiptLabelRow}>
            <Icon name="bolt" size={12} color={palette.orange} />
            <Text style={styles.receiptLabel}>{t("paymentLink.receipt.invoice")}</Text>
          </View>
          <Text style={styles.receiptCode} numberOfLines={1}>
            {middle(invoice, 19, 5)}
          </Text>
        </View>
        {copyButton("invoice", invoice, t("paymentLink.copyInvoice"))}
      </View>
    );
  }
  if (address) {
    rows.push(
      <View key="address" style={styles.receiptRow}>
        <View style={styles.receiptText}>
          <View style={styles.receiptLabelRow}>
            <Icon name="bitcoin" size={12} color={palette.orange} />
            <Text style={styles.receiptLabel}>{t("paymentLink.receipt.address")}</Text>
          </View>
          <Text style={styles.receiptCode} numberOfLines={1}>
            {middle(address, 16, 6)}
          </Text>
        </View>
        {copyButton("address", address, t("paymentLink.copyAddress"))}
      </View>
    );
  }
  rows.push(
    <View key="amount" style={[styles.receiptRow, styles.receiptAmountRow]}>
      <View style={styles.receiptText}>
        <Text style={styles.receiptLabel}>{amountLabel}</Text>
        <View style={styles.receiptAmountLine}>
          <Text style={styles.receiptAmount} numberOfLines={1} testID="receipt-amount">
            {amount.shown}
          </Text>
          <UnitButton
            unit={amount.unit}
            label={t("paymentLink.receipt.unit", { unit: amount.unit, next: next.unit })}
            onPress={() => {
              setUnit(nextUnit(unit, fiat));
              // What was copied is not what is shown any more.
              if (copy?.what === "amount") setCopy(null);
            }}
          />
        </View>
      </View>
      {copyButton("amount", amount.copied, t("paymentLink.receipt.copyAmount"))}
    </View>
  );

  return (
    <View style={styles.receiptBlock}>
      <View style={styles.receipt}>
        {rows.flatMap((row, i) =>
          i === 0 ? [row] : [<View key={`rule-${i}`} style={styles.receiptRule} />, row]
        )}
      </View>
      {/* Withheld, there is no copy button: no failure of one either. */}
      {copy?.outcome === "failed" && !withheld ? (
        <ErrorMessage>
          {t(
            copy.what === "invoice"
              ? "paymentLink.copyFailed"
              : copy.what === "address"
                ? "paymentLink.addressCopyFailed"
                : "paymentLink.amountCopyFailed"
          )}
        </ErrorMessage>
      ) : null}
    </View>
  );
}

/** A row's copy button, or "Copied" in its place for a moment. */
function CopyButton({
  label,
  copied,
  copiedLabel,
  copiedHint,
  onPress,
  testID
}: {
  label: string;
  copied: boolean;
  copiedLabel: string;
  /** The whole sentence, for screen readers ("Invoice copied"). */
  copiedHint: string;
  onPress: () => void;
  testID: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  if (copied) {
    return (
      <View
        style={styles.copiedPill}
        accessible
        accessibilityLabel={copiedHint}
        accessibilityLiveRegion="polite"
        testID={`${testID}-done`}
      >
        <Icon name="check" size={12} color={colors.state.settled.fg} />
        <Text style={styles.copiedLabel}>{copiedLabel}</Text>
      </View>
    );
  }
  return (
    <IconButton
      icon="copy-regular"
      label={label}
      color={colors.text.accent}
      onPress={onPress}
      testID={testID}
    />
  );
}

/** The amount's unit, in umber: a tap goes to the next one. */
function UnitButton({
  unit,
  label,
  onPress
}: {
  unit: string;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.unit, pressed && styles.unitPressed]}
      testID="amount-unit"
    >
      <Text style={styles.unitLabel}>{unit}</Text>
      {/* Two opposite arrows, upright: a swap mark. */}
      <Icon
        name="arrow-right-arrow-left"
        size={12}
        color={colors.text.accent}
        style={styles.unitIcon}
      />
    </Pressable>
  );
}

/** What a state means, tinted with its colours. */
function Notice({ state, text }: { state: PaymentState; text: string }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={[styles.notice, { backgroundColor: colors.state[state].bg }]}>
      <Icon name="circle-info" size={15} color={colors.state[state].fg} style={styles.noticeIcon} />
      <Text style={[styles.noticeText, { color: colors.state[state].fg }]}>{text}</Text>
    </View>
  );
}

/**
 * An invoice paid that names where to go next ("Redirect URL"): the payer goes there when they choose, in this tab, the page's confirmation
 * seen first; its host is written on the button, so that nobody is sent somewhere unnamed.
 */
function Continue({ url }: { url: string }) {
  const { t } = useTranslation();
  const host = hostOf(url);
  if (host === null) return null;
  return (
    <Button
      variant="secondary"
      icon="arrow-right"
      onPress={() => void openUri(url).catch(() => undefined)}
      testID="paid-continue"
    >
      {t("paymentLink.paid.continue", { host })}
    </Button>
  );
}

/** "corner-bakery.example": the host of an https URL, null for anything else. */
function hostOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.host !== "" ? parsed.host : null;
  } catch {
    return null;
  }
}

/**
 * A state of the link: a tinted disc, the state, the amount when known with the request's title (its
 * note, as the code's screen shows it), what it means, then the payment's
 * details when there is one (PaymentDetailsCard).
 */
function Outcome({
  state,
  icon,
  pill,
  title,
  view,
  notice,
  details,
  footer
}: {
  state: PaymentState;
  icon: IconName;
  pill?: string;
  title?: string;
  /** The amount shown: a sale's, or a checkout link's (its fiat amount null for sats alone). */
  view?: { fiat: LinkFiat | null; sats: bigint | null; note?: string };
  notice: string;
  /**
   * The payment's details (PaymentDetailsCard); `node`: the merchant's node the page reads the chain
   * on, where its transactions' links lead (null: mempool.space).
   */
  details?: { details: PaymentDetails; businessName: string; node: PayerNode | null };
  footer?: ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.outcome}>
      <View style={[styles.disc, { backgroundColor: colors.state[state].bg }]}>
        <Icon name={icon} size={38} color={colors.state[state].fg} />
      </View>
      {pill ? <StatusPill state={state} label={pill} /> : null}
      {title ? (
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
      ) : null}
      {view ? <Amount fiat={view.fiat} sats={view.sats} /> : null}
      <SaleNote note={view?.note} testID="outcome-note" />
      <Notice state={state} text={notice} />
      {details ? (
        <PaymentDetailsCard
          details={details.details}
          businessName={details.businessName}
          node={details.node}
        />
      ) : null}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
}

/** The label of each way to pay, and its sign (as the point of sale's paid line). */
const METHODS = {
  lightning: { label: "paymentLink.details.methods.lightning", icon: "bolt" },
  onchain: { label: "paymentLink.details.methods.onchain", icon: "bitcoin" },
  mixed: { label: "paymentLink.details.methods.mixed", icon: "bitcoin" }
} as const satisfies Record<PaymentMethod, { label: string; icon: IconName }>;

/**
 * The payer's receipt: who is paid, how, when the request was
 * made, and each transaction that paid its address, its confirmations in a pill on the left of its
 * id ("1/3", a tick once confirmed; none when not known), its id linked to its page on the
 * explorer the page reads, the merchant's `node` else mempool.space (TxLink; cut to 6 + 6
 * characters: a row of a 360 px phone). No time of payment: nothing
 * proves one of a Lightning payment.
 */
function PaymentDetailsCard({
  details,
  businessName,
  node
}: {
  details: PaymentDetails;
  businessName: string;
  node: PayerNode | null;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const [languageTag] = useState(() => getDeviceLocale().languageTag);
  const { method, transactions } = details;
  // A record's time is only a safe integer (checkout.ts): one no date can be is not shown.
  const createdDate = new Date(details.createdAt * 1000);
  const created = Number.isNaN(createdDate.getTime())
    ? null
    : formatDate(createdDate, languageTag, { dateStyle: "short", timeStyle: "short" });
  const rows: ReactNode[] = [
    <DetailRow key="business" label={t("paymentLink.details.business")}>
      <Text style={styles.detailValue} numberOfLines={1}>
        {businessName}
      </Text>
    </DetailRow>
  ];
  if (method !== null) {
    rows.push(
      <DetailRow key="method" label={t("paymentLink.details.method")}>
        <Icon name={METHODS[method].icon} size={13} color={palette.orange} />
        <Text style={styles.detailValue} testID="details-method">
          {t(METHODS[method].label)}
        </Text>
      </DetailRow>
    );
  }
  if (created !== null) {
    rows.push(
      <DetailRow key="created" label={t("paymentLink.details.createdAt")}>
        <Text style={styles.detailFigure} testID="details-created">
          {created}
        </Text>
      </DetailRow>
    );
  }
  transactions.forEach((tx, index) => {
    rows.push(
      <DetailRow
        key={`tx-${tx.txid}`}
        label={
          transactions.length > 1
            ? t("paymentLink.details.transactionNumber", { number: index + 1 })
            : t("paymentLink.details.transaction")
        }
        testID="details-transaction"
      >
        <Confirmations transaction={tx} />
        <TxLink txid={tx.txid} node={node} cut={6} fontSize={type.caption} />
      </DetailRow>
    );
  });
  return (
    <View style={styles.details} testID="payment-details">
      <Text accessibilityRole="header" style={styles.detailsTitle}>
        {t("paymentLink.details.title")}
      </Text>
      {rows.flatMap((row, i) =>
        i === 0 ? [row] : [<View key={`rule-${i}`} style={styles.detailRule} />, row]
      )}
    </View>
  );
}

/** A row of the payment's details: its label, then its value on the right. */
function DetailRow({
  label,
  testID,
  children
}: {
  label: string;
  testID?: string;
  children: ReactNode;
}) {
  const styles = useStyles();
  return (
    <View style={styles.detailRow} testID={testID}>
      <Text style={styles.receiptLabel}>{label}</Text>
      <View style={styles.detailValueBox}>{children}</View>
    </View>
  );
}

/**
 * How deep a transaction is: "1/3" being confirmed (Spinner in the state's blue, not its mined
 * chain), "3/3" with a tick once the payment counts (the watch's "paid":
 * every transaction that deep); nothing when it is not known. Read aloud as a sentence.
 */
function Confirmations({ transaction }: { transaction: DetailTransaction }) {
  const { t } = useTranslation();
  const { confirmations, confirmed } = transaction;
  if (confirmations === null) return null;
  return (
    <View
      accessible
      accessibilityLabel={
        confirmed
          ? t("paymentLink.details.confirmed")
          : t("paymentLink.details.confirmations", {
              count: confirmations,
              required: REQUIRED_CONFIRMATIONS
            })
      }
      testID="tx-confirmations"
    >
      <StatusPill
        state={confirmed ? "settled" : "unconfirmed"}
        label={`${confirmations}/${REQUIRED_CONFIRMATIONS}`}
        sign={confirmed ? "check" : "spinner"}
        size="sm"
      />
    </View>
  );
}

const useStyles = makeStyles(({ colors, shadow }) => ({
  screen: { flex: 1, backgroundColor: colors.background.app },
  body: { flexGrow: 1, alignItems: "center", paddingHorizontal: gutter },
  column: { width: 440, maxWidth: "100%", flexGrow: 1 },
  // What takes the loading scene's place: the column's rest, as its content had unwrapped.
  arrival: { flexGrow: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 28
  },
  // As wide as the switch on both sides: the logo stays in the middle.
  headerSide: { width: control.min },
  headerEnd: { alignItems: "flex-end" },
  loading: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    paddingBottom: 80
  },
  waiting: { alignItems: "center", gap: 18 },
  // As the countdown's label, which it takes the place of.
  payableUntil: { flexDirection: "row", alignItems: "center", gap: 7, alignSelf: "stretch" },
  payableUntilText: { ...sans(500), fontSize: type.caption, color: colors.text.secondary },
  qr: { alignSelf: "stretch", flexDirection: "row", justifyContent: "center" },
  actions: { alignSelf: "stretch", gap: 14 },
  withheld: { opacity: 0, pointerEvents: "none" },
  receiptBlock: { gap: 10 },
  receipt: {
    backgroundColor: colors.background.surface,
    borderRadius: radius.lg,
    boxShadow: shadow.card,
    paddingVertical: 4,
    paddingLeft: 18,
    paddingRight: 6
  },
  receiptRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  receiptAmountRow: { paddingVertical: 6 },
  receiptText: { flex: 1, minWidth: 0, gap: 2 },
  receiptLabelRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  receiptLabel: { ...sans(600), fontSize: 12, color: colors.text.secondary },
  receiptCode: { ...mono(500), fontSize: type.label, color: colors.text.primary },
  receiptRule: { height: stroke.hairline, marginRight: 12, backgroundColor: colors.border.faint },
  receiptAmountLine: { height: 30, flexDirection: "row", alignItems: "center", gap: 2 },
  receiptAmount: { ...mono(700), flexShrink: 1, fontSize: type.body, color: colors.text.primary },
  // 44 px tall on a 30 px line: the touch floor without spacing the row out.
  unit: {
    height: control.min,
    marginVertical: -(control.min - 30) / 2,
    paddingHorizontal: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: radius.sm
  },
  unitPressed: { opacity: 0.6 },
  unitLabel: {
    ...sans(700),
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.text.accent
  },
  unitIcon: { transform: [{ rotate: "90deg" }] },
  copiedPill: {
    height: 32,
    marginRight: 6,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.state.settled.bg
  },
  copiedLabel: { ...sans(700), fontSize: type.caption, color: colors.state.settled.fg },
  outcome: { alignItems: "center", gap: 20 },
  disc: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center"
  },
  title: {
    ...sans(700),
    fontSize: type.title,
    letterSpacing: tracked.title,
    color: colors.text.primary,
    textAlign: "center"
  },
  notice: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderRadius: 16,
    paddingVertical: 15,
    paddingHorizontal: 17
  },
  noticeIcon: { marginTop: (proseLineHeight - 15 * 1.15) / 2 },
  noticeText: { ...sans(600), flex: 1, fontSize: type.prose, lineHeight: proseLineHeight },
  footer: { alignSelf: "stretch" },
  endedCards: { gap: 12 },
  // As the receipt (Receipt): the same card, its rows' rules, labels and figures.
  details: {
    alignSelf: "stretch",
    backgroundColor: colors.background.surface,
    borderRadius: radius.lg,
    boxShadow: shadow.card,
    paddingTop: 14,
    paddingBottom: 4,
    paddingLeft: 18,
    paddingRight: 18
  },
  detailsTitle: {
    ...sans(700),
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.text.primary,
    marginBottom: 2
  },
  detailRule: { height: stroke.hairline, backgroundColor: colors.border.faint },
  detailRow: {
    minHeight: control.min,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  detailValueBox: {
    flexShrink: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8
  },
  detailValue: {
    ...sans(600),
    flexShrink: 1,
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.text.primary
  },
  detailFigure: { ...mono(500), fontSize: type.label, color: colors.text.primary }
}));
