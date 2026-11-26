import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  DocumentLanguageButton,
  DocumentLanguageChip,
  type DocumentKind
} from "@/components/DocumentLanguage";
import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { Arrival } from "@/components/ui/Arrival";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Icon, type IconName } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";
import { useLoadingScene } from "@/components/ui/LoadingScene";
import { Sheet } from "@/components/ui/Sheet";
import { StatusPill, StatusPillBox, type PillSign } from "@/components/ui/StatusPill";
import { useHover } from "@/components/ui/useHover";
import { acceptanceTexts, useAcceptDialog } from "@/features/activity/AcceptAction";
import { PILL_SIGNS, paidSign } from "@/features/activity/format";
import type { ActivityItem } from "@/features/activity/model";
import { Failed, Waiting } from "@/features/activity/parts";
import { useOwnerActivity } from "@/features/activity/useActivity";
import { usePushOnce } from "@/features/navigation/push-once";
import { useNotifications } from "@/features/notifications/NotificationsProvider";
import { usePos } from "@/features/terminal/pos";
import type { Language } from "@/i18n/languages";
import { getCountryName } from "@/lib/countries";
import { invoiceTotals } from "@/lib/invoice/amounts";
import { formatInvoiceNumber, type Invoice } from "@/lib/invoice/record";
import { getDeviceLocale } from "@/lib/locale/device";
import { logFailure } from "@/lib/log/log";
import { ownerProfile } from "@/lib/terminal/model";
import {
  AMOUNT_EM,
  gutter,
  makeStyles,
  mono,
  palette,
  proseLineHeight,
  radius,
  sans,
  stroke,
  TITLE_EM,
  tracked,
  tracking,
  type,
  useTheme,
  type PaymentState
} from "@/theme";

import { useInvoiceActions } from "./actions";
import { dueDateLabel, momentLabel, money } from "./format";
import { cancelInvoice, InvoiceError, removeDraft } from "./invoices";
import { LinesCard } from "./LinesCard";
import { useInvoiceRow } from "./rows";
import { forgetInvoice } from "./store";

const WALLET = "/wallet";

/**
 * "Wallet" itself, as its name in the breadcrumb says: not the screen before, which may be another
 * invoice ("Duplicate" or "Edit the draft", then "View the invoice", leave the first one below).
 * Not `replace`: it would stack a second "Wallet" over the first.
 */
function toWallet() {
  if (router.canGoBack()) router.dismissTo(WALLET);
  else router.replace(WALLET);
}

/**
 * Where an invoice stands. A sent invoice's state is its payment link's row, as "Wallet" judges it
 * (useOwnerActivity: the link's final version, the wallet's payments, the registry); "unknown"
 * until that row is read: never "Open" on a guess. "canceled" too once this screen canceled it (its
 * final version published), before the next read says so.
 */
export type InvoicePhase =
  "draft" | "unknown" | "open" | "underpaid" | "unconfirmed" | "paid" | "expired" | "canceled";

export type InvoiceTimelineEvent = "created" | "sent" | "paid" | "due";

/** The deadline has no meaning once a payment proves the invoice settled. */
export function invoiceTimelineEvents(
  invoice: Pick<Invoice, "sent" | "dueDate">,
  paid: boolean
): readonly InvoiceTimelineEvent[] {
  return [
    "created",
    ...(invoice.sent ? (["sent"] as const) : []),
    ...(paid ? (["paid"] as const) : []),
    ...(!paid && invoice.dueDate ? (["due"] as const) : [])
  ];
}

export function invoicePhase(
  invoice: Invoice,
  row: ActivityItem | null,
  canceledHere: boolean
): InvoicePhase {
  if (invoice.status === "draft") return "draft";
  if (canceledHere) return "canceled";
  if (!row) return "unknown";
  switch (row.state) {
    case null:
      return "paid";
    case "open":
    case "underpaid":
    case "unconfirmed":
    case "expired":
    case "canceled":
      return row.state;
    default:
      // A transfer's states: never a link's row.
      return "unknown";
  }
}

const PILLS: Record<Exclude<InvoicePhase, "unknown">, PaymentState> = {
  draft: "draft",
  open: "open",
  underpaid: "underpaid",
  unconfirmed: "unconfirmed",
  paid: "settled",
  expired: "expired",
  canceled: "canceled"
};

type Action = {
  key: string;
  icon: IconName;
  label: string;
  onPress: () => void;
  danger?: boolean;
};

/**
 * An invoice's details: the top answers "how much, and has it arrived": the amount in a sand band
 * (its label, the figure, the due date or the payment's date under a hairline), the same on mobile
 * and desktop. Below, the invoice as it was sent: the recipient, the lines, the VAT rate by rate.
 * The action that follows its state is the one filled button: "Send a reminder by email" while it
 * can be paid, "Download the PDF" once paid, "Duplicate" once it cannot be paid any more, "Edit the
 * draft" for a draft. The others are behind the three dots on mobile and in the right column on
 * desktop. No extension of the due date (a payment link's end is part of what its payer's page
 * checks: a later end needs a new link format) and no resending to another address (the mail is
 * written in the device's mail client: "Send a reminder by email" does it). The sand band over
 * white cards on the cream makes three backgrounds on purpose.
 */
export function InvoiceDetail({ id }: { id: string }) {
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  const { profile } = usePos();
  const owner = ownerProfile(profile);
  // This screen judges the rows as "Wallet" does (it is focused, the list is not); until its first
  // read, the row the list judged last.
  const { items, invoices } = useOwnerActivity();
  const remembered = useInvoiceRow(owner?.walletId ?? null, id);
  const row = items ? (items.find((item) => item.invoice?.id === id) ?? null) : remembered;
  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace(WALLET);
  };
  // Its loading scene (useLoadingScene): it fades out once read, then the invoice fades in.
  const loading = useLoadingScene(
    invoices.status === "loading"
      ? { scene: "invoice", label: t("invoices.detail.reading"), testID: "invoice-detail-reading" }
      : null
  );
  const waited = loading.waited;

  if (loading.scene) {
    return (
      <Frame title="" onBack={leave}>
        <Waiting desktop={desktop} {...loading.scene} />
      </Frame>
    );
  }
  const invoice =
    invoices.status === "ready" ? (invoices.invoices.find((each) => each.id === id) ?? null) : null;
  if (!invoice || !owner) {
    return (
      <Frame title="" onBack={leave}>
        <Failed
          desktop={desktop}
          message={t(
            invoices.status === "failed" ? "invoices.detail.readFailed" : "invoices.detail.notFound"
          )}
          onRetry={invoices.retry}
          testID="invoice-detail-failed"
          retryTestID="invoice-detail-retry"
        />
      </Frame>
    );
  }
  return (
    <Detail
      key={invoice.id}
      invoice={invoice}
      row={row}
      businessName={owner.businessName}
      arrival={waited}
    />
  );
}

function Detail({
  invoice,
  row,
  businessName,
  arrival
}: {
  invoice: Invoice;
  row: ActivityItem | null;
  businessName: string;
  /** The screen waited on its loading scene: the invoice fades in (Arrival.tsx). */
  arrival: boolean;
}) {
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const desktop = useIsDesktop();
  const { notify } = useNotifications();
  const [languageTag] = useState(() => getDeviceLocale().languageTag);
  const actions = useInvoiceActions(invoice, businessName);
  const [canceledHere, setCanceledHere] = useState(false);
  const [menu, setMenu] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const phase = invoicePhase(invoice, row, canceledHere);
  // "Accept the amount received": an invoice "Underpaid"'s.
  const accept = useAcceptDialog(
    row,
    acceptanceTexts(
      (fiat) => `${money(fiat.minor, fiat.digits, languageTag)} ${fiat.currency}`,
      languageTag
    )
  );
  // Accepted: paid at what it received (its row's amount), the difference told.
  const accepted = row?.acceptance?.status === "accepted" ? row.acceptance : null;
  const number = formatInvoiceNumber(invoice.number);
  const { currency, recipient } = invoice;
  const { totalMinor } = invoiceTotals(invoice.lines);
  const draft = phase === "draft";
  const payable = phase === "unknown" || phase === "open" || phase === "underpaid";

  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace(WALLET);
  };
  // One wizard per tap, as from "Wallet": a second one would show once the first left.
  const open = usePushOnce();
  const duplicate = () =>
    open(() => router.push({ pathname: "/wallet/invoice/new", params: { copy: invoice.id } }));
  const edit = () =>
    open(() => router.push({ pathname: "/wallet/invoice/new", params: { draft: invoice.id } }));

  const confirm = () => {
    if (working) return;
    setWorking(true);
    if (draft) {
      removeDraft(invoice).then(
        () => {
          forgetInvoice(invoice.id);
          setWorking(false);
          setConfirming(false);
          notify({ tone: "success", title: t("invoices.draftDetail.removed"), key: "invoice" });
          leave();
        },
        (error: unknown) => {
          if (!(error instanceof InvoiceError)) logFailure("Removing the draft failed", error);
          setWorking(false);
          setConfirming(false);
          notify({ tone: "error", title: t("invoices.errors.unreachable"), key: "invoice" });
        }
      );
      return;
    }
    cancelInvoice(invoice).then(
      (outcome) => {
        setWorking(false);
        setConfirming(false);
        if (outcome === "canceled") {
          setCanceledHere(true);
          notify({ tone: "success", title: t("invoices.detail.canceled"), key: "invoice" });
        } else {
          notify({
            tone: "error",
            title: t(
              outcome === "received"
                ? "invoices.detail.cancelReceived"
                : "invoices.detail.cancelFailed"
            ),
            key: "invoice"
          });
        }
      },
      (error: unknown) => {
        logFailure("Canceling the invoice failed", error);
        setWorking(false);
        setConfirming(false);
        notify({ tone: "error", title: t("invoices.detail.cancelFailed"), key: "invoice" });
      }
    );
  };

  // The secondary actions, in order; then the destructive one, in red.
  const list: Action[] = [];
  if (draft) {
    list.push({ key: "edit", icon: "pen", label: t("invoices.draftDetail.edit"), onPress: edit });
  }
  if (payable) {
    list.push({
      key: "copy",
      icon: "copy",
      label: t("invoices.detail.copyLink"),
      onPress: () => void actions.copy()
    });
  }
  if (!draft) {
    list.push({
      key: "pdf",
      icon: "download",
      label: t("invoices.detail.pdf"),
      onPress: actions.pdf
    });
  }
  list.push({
    key: "duplicate",
    icon: "clone",
    label: t("invoices.detail.duplicate"),
    onPress: duplicate
  });
  if (draft) {
    list.push({
      key: "remove",
      icon: "trash-can",
      label: t("invoices.draftDetail.remove"),
      onPress: () => setConfirming(true),
      danger: true
    });
  } else if (accept.acceptance) {
    list.push({
      key: "accept",
      icon: "circle-check",
      label: t("activity.accept.action"),
      onPress: accept.open
    });
  } else if (phase === "open") {
    // Only while nothing paid it (cancelLink checks it again): a payment received stays.
    list.push({
      key: "cancel",
      icon: "ban",
      label: t("invoices.detail.cancel"),
      onPress: () => setConfirming(true),
      danger: true
    });
  }

  // The filled button, and on mobile the one beside it; the document it makes, if it makes one.
  const primary: {
    icon: IconName;
    label: string;
    onPress: () => void;
    testID: string;
    document?: DocumentKind;
  } = draft
    ? { icon: "pen", label: t("invoices.draftDetail.edit"), onPress: edit, testID: "invoice-edit" }
    : payable
      ? {
          icon: "paper-plane",
          label: t("invoices.detail.remind"),
          onPress: actions.mail,
          testID: "invoice-remind",
          document: "mail"
        }
      : phase === "paid" || phase === "unconfirmed"
        ? {
            icon: "file-pdf",
            label: t("invoices.detail.pdf"),
            onPress: actions.pdf,
            testID: "invoice-pdf",
            document: "pdf"
          }
        : {
            icon: "clone",
            label: t("invoices.detail.duplicate"),
            onPress: duplicate,
            testID: "invoice-duplicate"
          };
  const withDuplicate = phase === "paid" || phase === "unconfirmed";
  // The language of its mail and PDF, one for both: at the end of the filled button when it sends
  // the mail or makes the PDF (a split button), and beside "Download the PDF" among the actions.
  const primaryButton = (desktop: boolean) => {
    const loading = primary.testID === "invoice-pdf" && actions.pdfBusy;
    return primary.document ? (
      <DocumentLanguageButton
        size={desktop ? "md" : "lg"}
        fullWidth={!desktop}
        icon={primary.icon}
        onPress={primary.onPress}
        loading={loading}
        testID={primary.testID}
        document={primary.document}
        language={actions.language}
        onLanguageChange={actions.setLanguage}
        languageTestID="invoice-language"
      >
        {primary.label}
      </DocumentLanguageButton>
    ) : (
      <Button
        size={desktop ? "md" : "lg"}
        fullWidth={!desktop}
        icon={primary.icon}
        onPress={primary.onPress}
        loading={loading}
        testID={primary.testID}
      >
        {primary.label}
      </Button>
    );
  };
  const pdfLanguage = (action: Action) =>
    action.key === "pdf" ? (
      <DocumentLanguageChip
        value={actions.language}
        onChange={actions.setLanguage}
        document="pdf"
        testID="invoice-action-pdf-language"
      />
    ) : undefined;

  const pill =
    phase === "unknown" ? null : (
      <StatusPill
        state={PILLS[phase]}
        label={phase === "paid" ? t("activity.done.paid") : t(`activity.states.${phase}`)}
        sign={phase === "paid" ? paidSign(row) : (PILL_SIGNS[phase] as PillSign | undefined)}
        size={desktop ? "md" : "sm"}
      />
    );
  const paid = phase === "paid" && row !== null;
  const rest = phase === "underpaid" && row?.rest ? row.rest.minor : null;
  const dateLine = paid
    ? { label: t("invoices.detail.paidOn"), value: momentLabel(row.timestamp, languageTag) }
    : invoice.dueDate
      ? {
          label: t("invoices.detail.due"),
          value: dueDateLabel(invoice.dueDate, languageTag, "numeric")
        }
      : null;
  const amount = (
    <View style={styles.amountRow}>
      <Text style={[styles.amount, desktop && styles.amountDesktop]} testID="invoice-detail-amount">
        {money(accepted && row?.fiat ? row.fiat.minor : totalMinor, currency.digits, languageTag)}
      </Text>
      <Text style={[styles.currency, desktop && styles.currencyDesktop]}>{currency.code}</Text>
    </View>
  );
  const amountLabel = (
    <Text style={styles.bandLabel}>
      {t(paid ? "invoices.detail.paid" : "invoices.detail.totalDue")}
    </Text>
  );
  const restLine =
    rest !== null ? (
      <View style={styles.bandLine}>
        <Text style={styles.bandLineLabel}>{t("invoices.detail.rest")}</Text>
        <Text style={styles.bandLineValue} testID="invoice-detail-rest">
          {money(rest, currency.digits, languageTag)}
        </Text>
      </View>
    ) : accepted?.fiat && row?.fiat ? (
      // Where the rest was: the difference the owner accepted.
      <View style={styles.bandLine}>
        <Text style={styles.bandLineLabel}>{t("activity.detail.difference")}</Text>
        <Text style={styles.bandLineValue} testID="invoice-detail-difference">
          {money(accepted.fiat.minor - row.fiat.minor, currency.digits, languageTag)}
        </Text>
      </View>
    ) : null;
  const address = [
    recipient.street,
    [recipient.postalCode, recipient.city].filter(Boolean).join(" "),
    getCountryName(recipient.country, i18n.language as Language)
  ].filter(Boolean);
  const lines = (
    <LinesCard
      lines={invoice.lines}
      currency={currency}
      languageTag={languageTag}
      desktop={desktop}
      columns
      testID="invoice-detail-lines"
    />
  );
  const dialog = (
    <ConfirmDialog
      visible={confirming}
      title={t(
        draft ? "invoices.draftDetail.removeDialog.title" : "invoices.detail.cancelDialog.title",
        { number }
      )}
      body={t(
        draft ? "invoices.draftDetail.removeDialog.body" : "invoices.detail.cancelDialog.body"
      )}
      confirmLabel={t(
        draft ? "invoices.draftDetail.removeDialog.confirm" : "invoices.detail.cancelDialog.confirm"
      )}
      cancelLabel={t(
        draft ? "invoices.draftDetail.removeDialog.keep" : "invoices.detail.cancelDialog.keep"
      )}
      onConfirm={confirm}
      working={working}
      onCancel={() => setConfirming(false)}
      testID="invoice-confirm"
      confirmTestID="invoice-confirm-action"
    />
  );

  if (desktop) {
    const timeline = invoiceTimelineEvents(invoice, paid).map((event) => {
      switch (event) {
        case "created":
          return {
            event,
            label: t("invoices.detail.created"),
            date: momentLabel(invoice.createdAt, languageTag)
          };
        case "sent":
          return {
            event,
            label: t("invoices.detail.sent"),
            date: momentLabel(invoice.sent!.at, languageTag)
          };
        case "paid":
          return {
            event,
            label: t("invoices.detail.paidEvent"),
            date: momentLabel(row!.timestamp, languageTag)
          };
        case "due":
          return {
            event,
            label: t("invoices.detail.due"),
            date: dueDateLabel(invoice.dueDate!, languageTag, "numeric")
          };
      }
    });
    const notices = [invoice.terms, invoice.legal].filter((text) => text !== "");
    return (
      <Frame
        arrival={arrival}
        title={recipient.name || number}
        breadcrumb={t("invoices.detail.breadcrumb", { number })}
        pill={pill}
        onBack={leave}
        aside={
          <>
            {withDuplicate ? (
              <Button
                variant="secondary"
                size="md"
                icon="clone"
                fullWidth={false}
                onPress={duplicate}
                testID="invoice-duplicate"
              >
                {t("invoices.detail.duplicate")}
              </Button>
            ) : null}
            {primaryButton(true)}
          </>
        }
      >
        <ScrollView contentContainerStyle={styles.desktopBody} testID="invoice-detail">
          <View style={styles.desktopMain}>
            <View style={[styles.band, styles.bandDesktop]} testID="invoice-detail-band">
              <View style={styles.bandStart}>
                {amountLabel}
                {amount}
              </View>
              <View style={styles.bandEnd}>
                <Text style={styles.bandLineLabel}>{t("invoices.detail.createdBy")}</Text>
                {restLine}
                {dateLine ? (
                  <View style={styles.bandLine}>
                    <Text style={styles.bandLineLabel}>{dateLine.label}</Text>
                    <Text style={styles.bandLineValue}>{dateLine.value}</Text>
                  </View>
                ) : null}
              </View>
            </View>
            {lines}
            {notices.length > 0 ? (
              <View style={[styles.card, styles.notices]}>
                <Text style={styles.cardLabel}>{t("invoices.detail.conditions")}</Text>
                {notices.map((text, index) => (
                  <Text key={index} style={styles.notice}>
                    {text}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
          <View style={styles.desktopAside}>
            <View style={styles.actionsCard}>
              {list.map((action, index) => (
                <View key={action.key}>
                  {action.danger && index > 0 ? <View style={styles.actionsDivider} /> : null}
                  <ActionRow action={action} desktop accessory={pdfLanguage(action)} />
                </View>
              ))}
            </View>
            <View style={[styles.card, styles.asideCard]}>
              <Text style={[styles.cardLabel, styles.asideLabel]}>
                {t("invoices.detail.recipient")}
              </Text>
              <Text style={styles.recipientName}>{recipient.name}</Text>
              {recipient.reference ? (
                <Text style={styles.secondary}>{recipient.reference}</Text>
              ) : null}
              {address.map((line, index) => (
                <Text key={index} style={styles.secondary}>
                  {line}
                </Text>
              ))}
            </View>
            <View style={[styles.card, styles.asideCard, styles.timeline]}>
              <Text style={styles.cardLabel}>{t("invoices.detail.followUp")}</Text>
              {timeline.map((event, index) => (
                <View key={event.label} style={styles.event}>
                  {index < timeline.length - 1 ? (
                    <View style={[styles.eventRail, paid && styles.eventRailPaid]} />
                  ) : null}
                  <View style={[styles.eventDot, paid && styles.eventDotPaid]} />
                  <Text style={styles.eventLabel}>{event.label}</Text>
                  <Text style={styles.eventDate}>{event.date}</Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
        {dialog}
        {accept.dialog}
      </Frame>
    );
  }

  return (
    <Frame
      arrival={arrival}
      title={t("invoices.detail.title", { number })}
      onBack={leave}
      onMore={() => setMenu(true)}
      footer={
        <View style={styles.footer}>
          {withDuplicate ? (
            <Button
              variant="secondary"
              size="md"
              icon="clone"
              onPress={duplicate}
              testID="invoice-duplicate"
            >
              {t("invoices.detail.duplicate")}
            </Button>
          ) : null}
          {primaryButton(false)}
        </View>
      }
    >
      <ScrollView
        contentContainerStyle={styles.mobileBody}
        showsVerticalScrollIndicator={false}
        testID="invoice-detail"
      >
        <View style={styles.band} testID="invoice-detail-band">
          <View style={styles.bandHead}>
            {amountLabel}
            {pill}
          </View>
          {amount}
          {restLine}
          {dateLine ? (
            <View style={[styles.bandLine, styles.bandRule]}>
              <Text style={styles.bandLineLabel}>{dateLine.label}</Text>
              <Text style={styles.bandLineValue}>{dateLine.value}</Text>
            </View>
          ) : null}
        </View>
        <View style={[styles.card, styles.recipient]}>
          <Text style={styles.recipientName}>{recipient.name}</Text>
          {address.length > 0 ? <Text style={styles.secondary}>{address.join(" · ")}</Text> : null}
          {recipient.reference ? <Text style={styles.secondary}>{recipient.reference}</Text> : null}
        </View>
        <View style={styles.mobileLines}>{lines}</View>
      </ScrollView>
      <Sheet
        title={t("invoices.detail.title", { number })}
        closeLabel={t("navigation.close")}
        visible={menu}
        onClose={() => setMenu(false)}
        testID="invoice-detail-menu"
      >
        <View>
          {list.map((action, index) => (
            <View key={action.key}>
              {index > 0 ? <View style={styles.sheetDivider} /> : null}
              <ActionRow
                action={{
                  ...action,
                  onPress: () => {
                    setMenu(false);
                    action.onPress();
                  }
                }}
                desktop={false}
                accessory={pdfLanguage(action)}
              />
            </View>
          ))}
        </View>
      </Sheet>
      {dialog}
      {accept.dialog}
    </Frame>
  );
}

/** A row of the actions: its glyph and its name, in red for the destructive one. */
/** An action; `accessory` beside it (a document's language), its own button. */
function ActionRow({
  action,
  desktop,
  accessory
}: {
  action: Action;
  desktop: boolean;
  accessory?: ReactNode;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { hovered, hoverProps } = useHover();
  const tint = action.danger ? colors.danger.fg : colors.text.secondary;
  const row = (
    <Pressable
      accessibilityRole="button"
      onPress={action.onPress}
      testID={`invoice-action-${action.key}`}
      {...hoverProps}
      style={({ pressed }) => [
        desktop ? styles.actionDesktop : styles.action,
        (pressed || hovered) &&
          (action.danger && desktop ? styles.actionDanger : styles.actionPressed)
      ]}
    >
      <Icon name={action.icon} size={desktop ? 14 : 15} color={tint} style={styles.actionIcon} />
      <Text style={[styles.actionLabel, action.danger && styles.actionLabelDanger]}>
        {action.label}
      </Text>
    </Pressable>
  );
  if (!accessory) return row;
  return (
    <View style={styles.actionLine}>
      <View style={styles.actionMain}>{row}</View>
      {accessory}
    </View>
  );
}

/**
 * The screen's frame. Mobile: a 64 px header (back, "Invoice 2026-0042", the three dots), the
 * content, the actions pinned to the bottom; no dock (src/features/navigation/destinations.ts).
 * Desktop: the side bar stays; "Wallet · invoice 2026-0042" ("Wallet" goes there), the recipient as
 * the title with the state's pill, the actions on the right, over a hairline.
 */
function Frame({
  title,
  breadcrumb,
  pill,
  aside,
  onBack,
  onMore,
  footer,
  arrival = false,
  children
}: {
  /** What the screen shows fades in under its header, its loading scene shown (Arrival.tsx). */
  arrival?: boolean;
  title: string;
  breadcrumb?: string;
  pill?: ReactNode;
  aside?: ReactNode;
  onBack: () => void;
  onMore?: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  const insets = useSafeAreaInsets();

  if (desktop) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.desktopHeader}>
          <View style={styles.desktopTitles}>
            <View style={styles.breadcrumb}>
              <Pressable
                accessibilityRole="link"
                onPress={toWallet}
                hitSlop={10}
                testID="invoice-detail-back"
              >
                <Text style={[styles.breadcrumbText, styles.breadcrumbLink]}>
                  {t("navigation.destinations.wallet")}
                </Text>
              </Pressable>
              {breadcrumb ? <Text style={styles.breadcrumbText}>{` · ${breadcrumb}`}</Text> : null}
            </View>
            {title ? (
              <View style={styles.desktopTitleRow}>
                <Text accessibilityRole="header" numberOfLines={1} style={styles.desktopTitle}>
                  {title}
                </Text>
                {/* Whole beside a long title: the title ends in "…", never the pill. */}
                {pill ? <StatusPillBox whole>{pill}</StatusPillBox> : null}
              </View>
            ) : null}
          </View>
          {aside ? <View style={styles.desktopAsideActions}>{aside}</View> : null}
        </View>
        <Arrival fade={arrival} style={styles.flex}>
          {children}
        </Arrival>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <IconButton
          icon="arrow-left"
          label={t("invoices.back")}
          color={colors.text.primary}
          size={19}
          overhang="left"
          onPress={onBack}
          testID="invoice-detail-back"
        />
        <View style={styles.headerTitle}>
          <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>
            {title}
          </Text>
        </View>
        {onMore ? (
          <IconButton
            icon="ellipsis"
            label={t("invoices.detail.more")}
            size={17}
            overhang="right"
            onPress={onMore}
            testID="invoice-detail-more"
          />
        ) : (
          <View style={styles.spacer} />
        )}
      </View>
      <Arrival fade={arrival} style={styles.flex}>
        {children}
      </Arrival>
      {footer ? (
        <Arrival fade={arrival} style={styles.footerBox}>
          {footer}
        </Arrival>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  screen: { flex: 1, backgroundColor: colors.background.app },
  flex: { flex: 1, minHeight: 0 },
  header: {
    height: 64,
    paddingHorizontal: gutter,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  headerTitle: { flex: 1, alignItems: "center", paddingHorizontal: 8 },
  title: {
    ...sans(600),
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.text.secondary
  },
  spacer: { width: 44 },
  mobileBody: { paddingHorizontal: gutter, paddingBottom: 12 },
  // Its margin only: the bottom safe area is the shell's band below the dock, hidden over this
  // screen (isMobileFullScreenRoute, ShellMain).
  footerBox: { paddingHorizontal: gutter, paddingTop: 12, paddingBottom: 12 },
  footer: { gap: 10 },
  actionLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  actionMain: { flex: 1, minWidth: 0 },
  band: {
    marginTop: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.background.subtle,
    paddingVertical: 18,
    paddingHorizontal: 20,
    gap: 14
  },
  // Its dates under the amount where the main column is too narrow for both side by side (an iPad
  // in portrait, beside the side bar and the actions), still on the right (bandEnd grows).
  bandDesktop: {
    marginTop: 0,
    paddingVertical: 24,
    paddingHorizontal: 26,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    justifyContent: "space-between"
  },
  bandHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  bandStart: { gap: 10 },
  bandEnd: { flexGrow: 1, alignItems: "flex-end", gap: 10 },
  bandLabel: {
    ...sans(600),
    fontSize: type.fieldLabel,
    color: colors.text.secondary
  },
  amountRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  amount: {
    ...mono(700),
    fontSize: 44,
    lineHeight: 48,
    letterSpacing: tracking(AMOUNT_EM, 44),
    color: colors.text.primary
  },
  amountDesktop: {
    ...mono(600),
    fontSize: type.amountLarge,
    lineHeight: 56,
    letterSpacing: tracking(AMOUNT_EM, type.amountLarge)
  },
  currency: { ...sans(600), fontSize: 20, color: colors.text.secondary },
  currencyDesktop: { fontSize: 22 },
  bandLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  bandRule: {
    paddingTop: 12,
    borderTopWidth: stroke.hairline,
    borderTopColor: colors.border.subtle
  },
  bandLineLabel: {
    ...sans(500),
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.text.secondary
  },
  bandLineValue: {
    ...sans(700),
    fontSize: type.label,
    letterSpacing: tracked.label,
    fontVariant: ["tabular-nums"],
    color: colors.text.primary
  },
  card: {
    backgroundColor: colors.background.surface,
    borderWidth: stroke.hairline,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg
  },
  recipient: { marginTop: 14, paddingVertical: 16, paddingHorizontal: 18, gap: 4 },
  recipientName: {
    ...sans(700),
    fontSize: type.body,
    color: colors.text.primary
  },
  secondary: {
    ...sans(500),
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.text.secondary
  },
  mobileLines: { marginTop: 12 },
  sheetDivider: { height: 1, backgroundColor: colors.border.subtle },
  action: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 4
  },
  actionDesktop: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    borderRadius: radius.md
  },
  actionPressed: { backgroundColor: colors.hoverOverlay },
  actionDanger: { backgroundColor: colors.danger.bg },
  actionIcon: { width: 20, textAlign: "center" },
  actionLabel: {
    ...sans(600),
    fontSize: type.body,
    color: colors.text.primary
  },
  actionLabelDanger: { color: colors.danger.fg },
  desktopHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 24,
    paddingTop: 30,
    paddingHorizontal: 38,
    paddingBottom: 22,
    borderBottomWidth: stroke.hairline,
    borderBottomColor: colors.border.subtle
  },
  desktopTitles: { flexShrink: 1, minWidth: 0, gap: 8 },
  breadcrumb: { flexDirection: "row", alignItems: "center" },
  breadcrumbText: { ...sans(500), fontSize: 13, color: colors.text.secondary },
  breadcrumbLink: { color: colors.text.accent },
  desktopTitleRow: { flexDirection: "row", alignItems: "center", gap: 14, minWidth: 0 },
  desktopTitle: {
    ...sans(700),
    fontSize: 26,
    letterSpacing: tracking(TITLE_EM, 26),
    color: colors.text.primary,
    flexShrink: 1
  },
  desktopAsideActions: { flexDirection: "row", alignItems: "center", gap: 14, flexShrink: 0 },
  desktopBody: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 26,
    paddingVertical: 26,
    paddingHorizontal: 38
  },
  desktopMain: { flex: 1, minWidth: 0, gap: 18 },
  desktopAside: { width: 340, gap: 18 },
  notices: { paddingVertical: 20, paddingHorizontal: 26, gap: 10 },
  cardLabel: {
    ...sans(600),
    fontSize: type.fieldLabel,
    color: colors.text.secondary
  },
  notice: {
    ...sans(500),
    fontSize: type.label,
    letterSpacing: tracked.label,
    lineHeight: proseLineHeight,
    color: colors.text.secondary,
    maxWidth: 620
  },
  actionsCard: {
    backgroundColor: colors.background.surface,
    borderWidth: stroke.hairline,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    paddingVertical: 8,
    paddingHorizontal: 10
  },
  actionsDivider: {
    height: 1,
    backgroundColor: colors.border.subtle,
    marginVertical: 6,
    marginHorizontal: 12
  },
  asideCard: { paddingVertical: 20, paddingHorizontal: 22, gap: 5 },
  asideLabel: { paddingBottom: 6 },
  timeline: { gap: 0 },
  event: {
    position: "relative",
    minHeight: 34,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingLeft: 18
  },
  eventRail: {
    position: "absolute",
    top: 10,
    bottom: 0,
    left: 3,
    width: stroke.hairline,
    backgroundColor: colors.border.subtle
  },
  eventRailPaid: { backgroundColor: colors.success.solid },
  eventDot: {
    position: "absolute",
    top: 3,
    left: 0,
    width: 7,
    height: 7,
    borderRadius: radius.pill,
    backgroundColor: palette.orange
  },
  eventDotPaid: { backgroundColor: colors.success.solid },
  eventLabel: {
    ...sans(600),
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.text.primary,
    flex: 1
  },
  eventDate: {
    ...sans(500),
    fontSize: 13,
    fontVariant: ["tabular-nums"],
    color: colors.text.secondary
  }
}));
