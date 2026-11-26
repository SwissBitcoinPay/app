import { router } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import {
  WalletFollowArt,
  WalletReceiveArt,
  WalletTakeArt
} from "@/components/illustrations/wallet";
import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { AmountBlock } from "@/components/ui/AmountBlock";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { useLoadingScene, type LoadingSceneSpec } from "@/components/ui/LoadingScene";
import { DiscreetProvider, Masked, spokenAmount, useDiscreet } from "@/components/ui/Discreet";
import { Icon } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";
import { StepGuide } from "@/components/ui/StepGuide";
import { useActivityFormat, type ActivityFormat } from "@/features/activity/format";
import { OWNER_FOLLOW_UPS, type ActivityItem } from "@/features/activity/model";
import { Failed, SectionTitle, Waiting } from "@/features/activity/parts";
import { useOwnerActivity } from "@/features/activity/useActivity";
import { DesktopActivity, MobileActivity } from "@/features/activity/views";
import { unlockFailureMessage } from "@/features/account/usePasskeyAccount";
import { isAccountWalletOpen } from "@/features/account/wallet-access";
import { guideStep } from "@/features/empty-states/guide";
import { AssistantAlertDialog } from "@/features/invoices/AssistantAlertDialog";
import { useLegacyWalletNotice } from "@/features/migration/useLegacyWalletNotice";
import { usePushOnce } from "@/features/navigation/push-once";
import { useAmountUnit } from "@/features/settings/amount-unit";
import { useAccountSettings } from "@/features/settings/useAccountSettings";
import type { AmountUnit } from "@/features/settings/amount-unit-format";
import type { MtpSaleRecord } from "@/lib/mtpelerin/sale-record";
import { PosFrame } from "@/features/terminal/PosFrame";
import { usePos } from "@/features/terminal/pos";
import { SELL_MIN_BALANCE_SATS } from "@/config/mtpelerin";
import { noteWalletKept, walletKept } from "@/features/recovery-check/holdings";
import { saleOrderTarget } from "@/features/sell/sale-detail";
import { SellSheet } from "@/features/sell/SellSheet";
import { useSplitSale } from "@/features/sell/SplitSale";
import { MAX_DEPOSIT_CLAIM_FEE_SATS } from "@/lib/breez/config";
import { formatInteger } from "@/lib/locale/format";
import { makeStyles, palette, sans, space, tracked, type, useTheme } from "@/theme";

import { ExportSheet } from "./export/ExportSheet";
import { LIST_LIMIT, pendingBalanceSats } from "./model";
import { SendSheet } from "./send/SendSheet";
import { useDiscreetChoice } from "./useDiscreet";
import { usePaymentRates } from "./usePaymentRates";
import { useWalletSends } from "./useWalletSends";
import type { WalletData } from "./useWalletData";

/**
 * "Wallet", the owner's (its activity merged into it): the balance and "Send", "To follow up"
 * (payment links open or underpaid, transfers being confirmed), then everything the business took
 * and moved: the point of sale's sales and its payment links, by whom, and the wallet's transfers
 * (src/features/activity/), by day as a card's history (each day's net). A state of "To follow up"
 * chosen keeps the list to its rows. Francs first, sats second, unless this device chose the sats
 * first ("Currency shown first"). "Send" opens SendSheet. Until the wallet synced with the network
 * (useWalletData), the screen says it is syncing (SyncStatus) over this device's copy of the
 * wallet, and past a minute that it may be incomplete (SyncLateNotice).
 * "Discreet" masks the screen's amounts (Masked), in francs and in sats:
 * the balance, "To follow up" and the movements, their details included; not "Send", where the
 * merchant types and checks an amount. Remembered on the device (useDiscreetChoice), for this
 * screen only. "Export" opens ExportSheet (src/features/wallet/export/):
 * the transactions done of a period, as a PDF or a CSV, once the wallet synced with the network;
 * "Discreet" leaves the file alone, which the merchant asks for. While it shows the wallet, it
 * records the price of bitcoin at each of its payments done (usePaymentRates), which the export
 * tells. "Sell" opens SellSheet (src/features/sell/), Mt Pelerin's sale to the bank. The list holds
 * the newest LIST_LIMIT movements, the history copied from the v2 account among them; "Show more"
 * under it adds LIST_LIMIT more.
 */
export function WalletScreen() {
  const styles = useStyles();
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  const [listLimit, setListLimit] = useState(LIST_LIMIT);
  const { wallet, items, exportSources, listedFrom, more, loadingMore, refreshAcceptances } =
    useOwnerActivity(listLimit);
  const { profile, languageTag } = usePos();
  const format = useActivityFormat();
  const name = t("navigation.destinations.wallet");
  // The data effect clears it a render after the wallet disconnects: never shown meanwhile.
  const read = wallet.connected ? wallet.data : null;
  // Before the first sync, a device without any of the wallet in its storage (its first visit, or
  // its storage cleared) reads a balance of 0 and no payment: shown, the wallet would look empty
  // until the sync. The screen waits for the sync instead.
  const blank =
    read !== null && !wallet.synced && read.balanceSats === 0n && read.payments.length === 0;
  const data = blank ? null : read;
  const syncing = !wallet.synced;
  // Past its wait, no sync that reached the network yet: what shows may be incomplete.
  const syncNotice =
    data && wallet.syncLate && syncing ? (
      <SyncLateNotice retrying={wallet.retryingSync} onRetry={wallet.retrySync} />
    ) : null;
  // The v2 wallet (Swiss Bitcoin Pay) still on this phone: what its service paid it since the
  // migration, to move here (src/features/migration/).
  const legacyNotice = useLegacyWalletNotice({
    enabled: data !== null,
    currency: profile.currency,
    openWallet: async () => {
      await wallet.open();
      return isAccountWalletOpen();
    }
  });
  // "Sell": Mt Pelerin buys the sats, wires francs; every step in its panel (SellSheet), which goes
  // with the wallet too.
  const [selling, setSelling] = useState(false);
  if (selling && !wallet.connected) setSelling(false);
  // A sale of the list followed ("Track the sale"): "Sell" opens on its order's progress. Null: on
  // the sale.
  const [sellOrder, setSellOrder] = useState<{ orderId: string; fromMs: number } | null>(null);
  // The split's sale (src/features/sell/SplitSale.tsx): the fiat share of what the wallet received
  // since the last one, proposed once its data shows, synced (a receipt the device does not hold
  // yet would not be counted).
  const split = useSplitSale({
    enabled: data !== null && wallet.synced,
    openWallet: async () => wallet.open(),
    onSold: wallet.refresh,
    openSell: () => {
      setSellOrder(null);
      setSelling(true);
    }
  });
  // What the wallet keeps, for the check of the recovery phrase (holdings.ts): its balance once
  // synced, less the split's share still to sell.
  const settings = useAccountSettings();
  const kept =
    wallet.synced && read
      ? walletKept(read.balanceSats, settings?.bitcoinPercent ?? 100, split.dueSats)
      : null;
  useEffect(() => {
    if (kept !== null) noteWalletKept(kept);
  }, [kept]);
  const notices = [syncNotice, split.notice, legacyNotice].filter((shown) => shown !== null);
  const notice =
    notices.length > 1 ? (
      <View style={styles.notices}>
        {syncNotice}
        {split.notice}
        {legacyNotice}
      </View>
    ) : (
      (notices[0] ?? null)
    );
  // The price of bitcoin at each payment done, recorded once (payment-rates.ts): "Export" reads it.
  // Once the wallet is synced, its payments read then.
  usePaymentRates(wallet.synced ? read : null, profile.currency);
  // Each payment it sent, published as soon as it is done (wallet-sends.ts): the assistants allowed
  // to export the transactions read them.
  useWalletSends(wallet.synced ? read : null);
  const [sending, setSending] = useState(false);
  const discreet = useDiscreetChoice();
  const mode = { hidden: discreet.hidden, label: t("wallet.hiddenAmount") };
  const discreetToggle = <DiscreetToggle {...discreet} overhang={!desktop} />;
  // "Export" (as v2's export of the dashboard's activity): its sheet.
  const [exporting, setExporting] = useState(false);
  // The wallet closed (screen left, till mode): "Send" and "Export" do not come back with it.
  if (sending && !wallet.connected) setSending(false);
  if (exporting && !wallet.connected) setExporting(false);
  const openSend = () => setSending(true);
  // Once the wallet synced with the network (useWalletData): the export reads its payments of the
  // period, newer ones included.
  const canExport = !syncing && exportSources !== null;
  const openExport = () => setExporting(true);
  // The screens it opens go on top of it (stack): one per tap, while it is the screen shown.
  const open = usePushOnce();
  // "New invoice".
  const openNewInvoice = () => open(() => router.push("/wallet/invoice/new"));
  const openSell = () => {
    setSellOrder(null);
    setSelling(true);
  };
  const followSale = (sale: MtpSaleRecord) => {
    setSellOrder(saleOrderTarget(sale));
    setSelling(true);
  };
  // Under its label while grayed: "from 10 sats", the threshold in the device's digits.
  const sellFrom = t("wallet.sellFrom", {
    amount: formatInteger(SELL_MIN_BALANCE_SATS, languageTag)
  });
  // An invoice's row: a draft goes on in the wizard, a sent one shows its details.
  const openInvoice = (item: ActivityItem): boolean => {
    const { invoice } = item;
    if (!invoice) return false;
    // A draft too: its details offer to finish it or to remove it.
    open(() => router.push({ pathname: "/wallet/invoice/[id]", params: { id: invoice.id } }));
    return true;
  };
  // Only over the wallet's data: they go with the wallet (screen left, till mode).
  const sheet = (
    <>
      <SendSheet
        visible={sending && data !== null}
        onClose={() => setSending(false)}
        balanceSats={data?.balanceSats ?? 0n}
        onSent={wallet.refresh}
      />
      <ExportSheet
        visible={exporting && data !== null}
        onClose={() => setExporting(false)}
        sources={exportSources}
      />
      <SellSheet
        visible={selling && data !== null}
        onClose={() => setSelling(false)}
        openWallet={async () => wallet.open()}
        onSold={wallet.refresh}
        order={sellOrder}
      />
      {split.sheet}
      {/* An assistant abusing the business's numbers or flooding it with invoices
          (src/features/invoices/assistant-alerts.ts). */}
      <AssistantAlertDialog />
    </>
  );

  let body: ReactNode = null;
  // What the screen waits for: its loading scene (useLoadingScene), which fades out once read.
  let waiting: LoadingSceneSpec | null = null;
  if (!wallet.connected) {
    // Connecting (no passkey: the open account's seed), or "Try again" after a failure.
    if (wallet.failure) {
      body = (
        <Failed
          desktop={desktop}
          message={unlockFailureMessage(wallet.failure, t)}
          onRetry={wallet.open}
          testID="wallet-open-failed"
          retryTestID="wallet-open-retry"
        />
      );
    } else {
      waiting = { scene: "wallet", label: t("wallet.opening"), testID: "wallet-opening" };
    }
  } else if (!data) {
    // A blank storage waits for the sync. When the read after it failed (a storage error), the
    // screen says so with "Try again"; the read is also tried again on its own meanwhile. Past its
    // wait without a sync that reached the network, it says so too, "Try again" syncing.
    if ((!read && wallet.loadFailed) || (blank && wallet.syncFailed)) {
      body = <Failed desktop={desktop} message={t("wallet.loadFailed")} onRetry={wallet.reload} />;
    } else if (blank && wallet.syncLate) {
      body = (
        <Failed
          desktop={desktop}
          message={t("wallet.syncLateBlank")}
          onRetry={wallet.retrySync}
          retrying={wallet.retryingSync}
          testID="wallet-sync-late"
          retryTestID="wallet-sync-retry"
        />
      );
    } else {
      waiting = { scene: "wallet", label: t("wallet.syncingWallet"), testID: "wallet-loading" };
    }
  } else if (!items) {
    // The registry and the employees' records, read once before the list shows: its rows would
    // otherwise regroup under a finger.
    waiting = { scene: "wallet", label: t("activity.reading"), testID: "activity-reading" };
  }
  const loading = useLoadingScene(waiting);
  // The scene in one place, waiting and leaving: the same scene that fades out.
  if (body === null && loading.scene) body = <Waiting desktop={desktop} {...loading.scene} />;
  const waited = loading.waited;
  const shown = body === null && data !== null ? items : null;
  // Asked again while its rows are read: nothing more (the button waits meanwhile).
  const showMore =
    shown && more
      ? {
          loading: loadingMore,
          onPress: () => {
            if (!loadingMore) setListLimit((limit) => limit + LIST_LIMIT);
          }
        }
      : null;

  if (desktop) {
    return (
      <>
        <DiscreetProvider value={mode}>
          <DesktopActivity
            arrival={waited}
            title={name}
            aside={
              data ? <DesktopBalance data={data} onSend={openSend} toggle={discreetToggle} /> : null
            }
            notice={notice}
            listAction={
              // At the right of "All transactions", small, after "Export".
              <View style={styles.listActions}>
                <Button
                  variant="secondary"
                  size="sm"
                  icon="download"
                  fullWidth={false}
                  disabled={!canExport}
                  onPress={openExport}
                  testID="wallet-export-open"
                >
                  {t("walletExport.open")}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon="landmark"
                  fullWidth={false}
                  disabled={!canSell(data)}
                  caption={data && !canSell(data) ? sellFrom : undefined}
                  onPress={openSell}
                  testID="wallet-sell"
                >
                  {t("wallet.sell")}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon="plus"
                  fullWidth={false}
                  onPress={openNewInvoice}
                  testID="wallet-new-invoice"
                >
                  {t("invoices.newInvoice")}
                </Button>
              </View>
            }
            items={shown}
            states={OWNER_FOLLOW_UPS}
            rootTitle={t("activity.allMovements")}
            showBy
            syncing={syncing}
            format={format}
            onOpen={openInvoice}
            emptyGuide={<WalletGuide desktop />}
            more={showMore}
            onAccepted={refreshAcceptances}
            onFollowSale={followSale}
          >
            {body}
          </DesktopActivity>
        </DiscreetProvider>
        {sheet}
      </>
    );
  }
  return (
    <>
      <PosFrame title={name} desktopTitle={name}>
        {shown && data ? (
          <DiscreetProvider value={mode}>
            <MobileActivity
              arrival={waited}
              items={shown}
              states={OWNER_FOLLOW_UPS}
              rootTitle={t("activity.movements")}
              showBy
              syncing={syncing}
              format={format}
              onOpen={openInvoice}
              onAccepted={refreshAcceptances}
              onFollowSale={followSale}
              emptyGuide={<WalletGuide desktop={false} />}
              // The days' nets once synced with the network: before, newer payments may come, a day
              // shown in part.
              listedFrom={syncing ? null : listedFrom}
              more={showMore}
              top={
                <>
                  <MobileBalance data={data} toggle={discreetToggle} />
                  {notice ? <View style={styles.mobileNotice}>{notice}</View> : null}
                </>
              }
              listAction={
                // At the right of "Transactions", an icon as "Discreet": the footer's two buttons
                // are the screen's actions.
                <IconButton
                  icon="download"
                  label={t("walletExport.title")}
                  overhang="right"
                  disabled={!canExport}
                  onPress={openExport}
                  testID="wallet-export-open"
                />
              }
              footer={
                <View style={styles.footer}>
                  {/* "Sell" beside "Invoice" (one word: half the width): grayed under
                      SELL_MIN_BALANCE_SATS, "from 10 sats" in it. */}
                  <View style={styles.footerRow}>
                    <Button
                      variant="secondary"
                      size="md"
                      icon="plus"
                      onPress={openNewInvoice}
                      fullWidth={false}
                      style={styles.footerHalf}
                      testID="wallet-new-invoice"
                    >
                      {t("invoices.newInvoiceShort")}
                    </Button>
                    <Button
                      variant="secondary"
                      size="md"
                      icon="landmark"
                      disabled={!canSell(data)}
                      caption={data && !canSell(data) ? sellFrom : undefined}
                      onPress={openSell}
                      fullWidth={false}
                      style={styles.footerHalf}
                      testID="wallet-sell"
                    >
                      {t("wallet.sell")}
                    </Button>
                  </View>
                  <Button
                    icon="paper-plane"
                    disabled={!canSend(data)}
                    onPress={openSend}
                    testID="wallet-send"
                  >
                    {t("wallet.send")}
                  </Button>
                </View>
              }
            />
          </DiscreetProvider>
        ) : (
          body
        )}
      </PosFrame>
      {sheet}
    </>
  );
}

/**
 * Past WALLET_SYNC_LATE_MS without a sync that reached the network (useWalletData): the balance and
 * the movements shown are this device's, maybe incomplete: a warning Callout, "Try again" under it,
 * secondary ("Send" is the screen's filled button), waiting while the sync it asked for runs.
 */
function SyncLateNotice({ retrying, onRetry }: { retrying: boolean; onRetry: () => void }) {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <View style={styles.syncLate}>
      <Callout tone="warning" testID="wallet-sync-late">
        {t("wallet.syncLate")}
      </Callout>
      <Button
        variant="secondary"
        size="sm"
        fullWidth={false}
        loading={retrying}
        onPress={onRetry}
        testID="wallet-sync-retry"
      >
        {t("wallet.retry")}
      </Button>
    </View>
  );
}

/**
 * The owner's list without a movement (synced with the network): how movements come, in three steps
 * under the list's title; on a phone, under the balance, its drawings smaller; on a desktop, in the
 * table's card, side by side once they fit.
 */
function WalletGuide({ desktop }: { desktop: boolean }) {
  const { t } = useTranslation();
  return (
    <StepGuide
      lead={t("wallet.guide.lead")}
      label={t("wallet.guide.label")}
      steps={[
        guideStep(t, "wallet.guide.take", WalletTakeArt),
        guideStep(t, "wallet.guide.receive", WalletReceiveArt),
        guideStep(t, "wallet.guide.follow", WalletFollowArt)
      ]}
      wide={desktop}
      bare={desktop}
      compact={!desktop}
      testID="wallet-empty"
    />
  );
}

/** "Send" is disabled while the balance is 0 sats: nothing could be sent. */
function canSend(data: WalletData): boolean {
  return data.balanceSats > 0n;
}

/**
 * "Sell" from SELL_MIN_BALANCE_SATS: Mt Pelerin's 1-sat invoice that proves the Lightning address,
 * its fees, then a sale.
 */
function canSell(data: WalletData | null): boolean {
  return data !== null && data.balanceSats >= SELL_MIN_BALANCE_SATS;
}

/**
 * "Discreet": masks the screen's amounts, or shows them again. Its icon alone: the eye while they
 * show, the eye struck through while they are masked; for screen readers, a switch named
 * "Discreet". On mobile its 44 px target overhangs the gutter, its glyph on the content's edge.
 */
function DiscreetToggle({
  hidden,
  toggle,
  overhang
}: {
  hidden: boolean;
  toggle: () => void;
  overhang: boolean;
}) {
  const { t } = useTranslation();
  return (
    <IconButton
      icon={hidden ? "eye-slash" : "eye"}
      label={t("wallet.discreet")}
      checked={hidden}
      overhang={overhang ? "right" : undefined}
      onPress={toggle}
      testID="wallet-discreet"
    />
  );
}

/**
 * Mobile: "Balance", a section's title, centred, with "Discreet" on the row's right edge, above the
 * balance, centred: its two amounts in the order "Currency shown first" chooses (balanceAmounts),
 * the first large (AmountBlock), the other under it (SmallAmount), both in Plus Jakarta Sans (not
 * JetBrains Mono, as SatsAmount writes sats). Without a rate, its sats alone, large.
 */
function MobileBalance({ data, toggle }: { data: WalletData; toggle: ReactNode }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const format = useActivityFormat();
  const { languageTag } = usePos();
  const unit = useAmountUnit();
  const { first, second } = balanceAmounts(data.balanceSats, unit, format, languageTag);
  return (
    <View style={styles.balance} testID="wallet-balance">
      <View style={styles.balanceHead}>
        <SectionTitle>{t("wallet.balance")}</SectionTitle>
        <View style={styles.balanceToggle}>{toggle}</View>
      </View>
      <View style={styles.balanceAmounts}>
        <AmountBlock amount={first.figure} currency={first.unit} />
        {second ? <SmallAmount amount={second} testID="wallet-balance-second" /> : null}
      </View>
      <PendingBalance data={data} format={format} centered />
    </View>
  );
}

/** An amount written as its figure, then its unit: "0.61" "CHF", "911" "sats". */
type BalanceAmount = { figure: string; unit: string; sats: boolean };

/**
 * The balance's amounts, in the order "Currency shown first" chooses (settings/amount-unit.ts, the
 * display currency by default): its value at the current rate, and its sats, in the device's digits
 * as the movements write them ("911 sats"). Without a rate, its sats alone.
 */
function balanceAmounts(
  sats: bigint,
  unit: AmountUnit,
  format: ActivityFormat,
  languageTag: string
): { first: BalanceAmount; second: BalanceAmount | null } {
  const inSats: BalanceAmount = {
    figure: formatInteger(sats, languageTag),
    unit: "sats",
    sats: true
  };
  const figure = format.fiatFigure(sats);
  if (figure === null) return { first: inSats, second: null };
  const inFiat: BalanceAmount = { figure, unit: format.currency, sats: false };
  return unit === "sats" ? { first: inSats, second: inFiat } : { first: inFiat, second: inSats };
}

/**
 * The balance's second amount, under the first: its figure in ink, its unit in grey, as the first
 * one's; its sats after the bitcoin sign (orange: a fill), as they were. Read as one amount; its
 * figure masked in the discreet mode (Masked), the unit staying.
 */
function SmallAmount({ amount, testID }: { amount: BalanceAmount; testID: string }) {
  const styles = useStyles();
  const discreet = useDiscreet();
  return (
    <View
      style={styles.smallAmount}
      accessible
      accessibilityLabel={spokenAmount(discreet, `${amount.figure} ${amount.unit}`)}
      testID={testID}
    >
      {amount.sats ? <Icon name="bitcoin" size={type.sats + 3.5} color={palette.orange} /> : null}
      <Masked>
        <Text numberOfLines={1} style={styles.smallFigure}>
          {amount.figure}
        </Text>
      </Masked>
      <Text numberOfLines={1} style={styles.smallUnit}>
        {amount.unit}
      </Text>
    </View>
  );
}

/**
 * Desktop: "Discreet", then the balance on the header's right, then "Send", the screen's one
 * primary. "New invoice" is at the right of "All transactions". The balance's amounts as on a phone
 * (balanceAmounts):
 * the one "Currency shown first" chooses on top, the other after "Balance", both in Plus Jakarta
 * Sans.
 */
function DesktopBalance({
  data,
  onSend,
  toggle
}: {
  data: WalletData;
  onSend: () => void;
  toggle: ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const format = useActivityFormat();
  const { languageTag } = usePos();
  const unit = useAmountUnit();
  const { first, second } = balanceAmounts(data.balanceSats, unit, format, languageTag);
  return (
    <View style={styles.aside}>
      {toggle}
      <View style={styles.desktopBalance} testID="wallet-balance">
        <Masked>
          <Text numberOfLines={1} style={styles.desktopBalanceFirst}>
            {`${first.figure} ${first.unit}`}
          </Text>
        </Masked>
        <View style={styles.desktopBalanceLine}>
          <Text style={styles.desktopBalanceLabel}>{t("wallet.balance")}</Text>
          {second ? (
            <Masked color={colors.text.secondary}>
              <Text
                numberOfLines={1}
                style={styles.desktopBalanceSecond}
                testID="wallet-balance-second"
              >
                {`${second.figure} ${second.unit}`}
              </Text>
            </Masked>
          ) : null}
        </View>
        <PendingBalance data={data} format={format} compact />
      </View>
      <Button
        variant="primary"
        size="md"
        icon="paper-plane"
        fullWidth={false}
        style={styles.send}
        disabled={!canSend(data)}
        onPress={onSend}
        testID="wallet-send"
      >
        {t("wallet.send")}
      </Button>
    </View>
  );
}

/**
 * Under the balance: the least the balance will gain from what the wallet received on-chain,
 * confirmed, but has not credited yet (pendingBalanceSats: net of the most each claim may take), in
 * the warning's ochre after a clock, as only time is needed: "at least +1.41 CHF not in balance
 * yet", in sats without a rate. Nothing while there is none, or while the deposits are not read.
 * Read as one sentence; its amount masked in the discreet mode, as the balance.
 */
function PendingBalance({
  data,
  format,
  compact = false,
  centered = false
}: {
  data: WalletData;
  format: ActivityFormat;
  compact?: boolean;
  /** Under the balance centred (mobile): centred as it is. */
  centered?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const { languageTag } = usePos();
  const discreet = useDiscreet();
  const sats = pendingBalanceSats(data.deposits, MAX_DEPOSIT_CLAIM_FEE_SATS);
  if (sats === null || sats === 0n) return null;
  // A minimum: its francs rounded down, never above what it is worth at today's rate.
  const amount = format.fiat(sats, "+", "down") ?? `+${formatInteger(sats, languageTag)} sats`;
  const atLeast = t("wallet.atLeast");
  const label = t("activity.pendingCredit.awaiting");
  const textStyle = [styles.pendingText, compact && styles.pendingTextCompact];
  return (
    <View
      style={[styles.pending, centered && styles.pendingCentered]}
      accessible
      accessibilityLabel={`${atLeast} ${spokenAmount(discreet, amount)} ${label}`}
      testID="wallet-pending-balance"
    >
      <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Icon name="clock-regular" size={compact ? 11 : 14} color={colors.warning.fg} />
      </View>
      <Text numberOfLines={1} style={textStyle}>
        {atLeast}
      </Text>
      <Masked color={colors.warning.fg}>
        <Text numberOfLines={1} style={textStyle}>
          {amount}
        </Text>
      </Masked>
      <Text numberOfLines={1} style={[textStyle, styles.shrink]}>
        {label}
      </Text>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  balance: { gap: 10, paddingTop: 6 },
  // "Balance" centred on the column's width, as the amounts under it.
  balanceHead: { alignItems: "center" },
  // "Discreet" out of the flow, on the right edge, so it does not push "Balance" off the centre.
  // Its 44 px target taller than "Balance", centred on it: the row keeps the title's height.
  balanceToggle: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
    marginVertical: -12,
    justifyContent: "center"
  },
  // Centred: the first amount over the second, AmountBlock's gap.
  balanceAmounts: { alignItems: "center", gap: 11 },
  smallAmount: { flexDirection: "row", alignItems: "center", gap: space[4], maxWidth: "100%" },
  smallFigure: {
    ...sans(700),
    fontSize: type.sats,
    fontVariant: ["tabular-nums"],
    color: colors.text.primary
  },
  smallUnit: { ...sans(600), fontSize: type.sats - 1, color: colors.text.secondary },
  aside: { flexDirection: "row", alignItems: "center", gap: 26 },
  footer: { gap: 10 },
  footerRow: { flexDirection: "row", gap: 10 },
  footerHalf: { flex: 1 },
  syncLate: { gap: 10, alignItems: "flex-start" },
  notices: { gap: 16 },
  // Under the balance, as "To follow up"'s title is (views.tsx).
  mobileNotice: { paddingTop: 26 },
  listActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  desktopBalance: { alignItems: "flex-end", gap: 4 },
  desktopBalanceFirst: {
    ...sans(700),
    fontSize: 24,
    lineHeight: 24,
    fontVariant: ["tabular-nums"],
    color: colors.text.primary
  },
  desktopBalanceLine: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  desktopBalanceLabel: { ...sans(500), fontSize: 13, color: colors.text.secondary },
  desktopBalanceSecond: {
    ...sans(600),
    fontSize: 13,
    fontVariant: ["tabular-nums"],
    color: colors.text.secondary
  },
  send: { minWidth: 176 },
  pending: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
  pendingCentered: { justifyContent: "center" },
  pendingText: {
    ...sans(600),
    fontSize: type.label,
    letterSpacing: tracked.label,
    fontVariant: ["tabular-nums"],
    color: colors.warning.fg
  },
  pendingTextCompact: { fontSize: 12 },
  shrink: { flexShrink: 1, minWidth: 0 }
}));
