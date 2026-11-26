import { router } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";

import { Arrival } from "@/components/ui/Arrival";
import { useLoadingScene } from "@/components/ui/LoadingScene";
import { Button } from "@/components/ui/Button";
import { INVOICE_LIGHTNING_MARGIN_PERCENT } from "@/config/invoices";
import { getAccountSettings } from "@/features/account/session";
import { Failed, Waiting } from "@/features/activity/parts";
import { useNotifications } from "@/features/notifications/NotificationsProvider";
import { NewIntegrationSheet } from "@/features/integrations/NewIntegrationSheet";
import { usePos } from "@/features/terminal/pos";
import type { Invoice } from "@/lib/invoice/record";
import { getDeviceLocale } from "@/lib/locale/device";
import { formatDate } from "@/lib/locale/date";
import { formatInteger, formatPercent } from "@/lib/locale/format";
import { logFailure } from "@/lib/log/log";
import { ownerProfile } from "@/lib/terminal/model";
import { currencyDigits } from "@/lib/terminal/amount";

import { DueStep } from "./DueStep";
import { formOf, newWizardState, readLines, wizardStateOf, type WizardState } from "./form";
import {
  InvoiceError,
  defaultVatRate,
  isDueDateOffered,
  isRecipientComplete,
  saveDraft,
  sendInvoice,
  type InvoiceErrorCode,
  type PreparedInvoice
} from "./invoices";
import { createLineSaves, useLineSaving } from "./line-saves";
import { linesReady, LinesStep } from "./LinesStep";
import { RecipientStep } from "./RecipientStep";
import { ReviewStep } from "./ReviewStep";
import { SentScreen } from "./SentScreen";
import { rememberInvoice, useInvoices } from "./store";
import { redirectValid, TermsStep } from "./TermsStep";
import { WizardFrame } from "./WizardFrame";

/** What the wizard starts from: nothing, a draft to finish, or an invoice to duplicate. */
export type WizardStart =
  { kind: "new" } | { kind: "draft"; id: string } | { kind: "copy"; id: string };

const WALLET = "/wallet";

/**
 * "New invoice" (in "Wallet", the owner's only): five steps with dots, the same on mobile and
 * desktop, then the invoice made. "Save as draft" from every step saves it as it is and goes back
 * to "Wallet" with a green notification. "Create the invoice" (the only way to finish) gives it its
 * number, makes its payment link and saves it sent; the next screen offers to send it by mail, copy
 * its link, share it or download its PDF.
 */
export function InvoiceWizard({ start }: { start: WizardStart }) {
  const { t } = useTranslation();
  const invoices = useInvoices();
  // Its loading scene (useLoadingScene): it fades out once read, then the wizard fades in.
  const loading = useLoadingScene(
    start.kind !== "new" && invoices.status === "loading"
      ? { scene: "invoice", label: t("invoices.detail.reading"), testID: "invoice-reading" }
      : null
  );
  const waited = loading.waited;
  if (start.kind === "new") return <Wizard source={null} copy={false} />;
  if (loading.scene) return <Waiting desktop={false} {...loading.scene} />;
  // Read meanwhile: its scene shows (above). For the types, which cannot tell.
  if (invoices.status === "loading") return null;
  if (invoices.status === "failed") {
    return (
      <Failed
        desktop={false}
        message={t("invoices.detail.readFailed")}
        onRetry={invoices.retry}
        testID="invoice-read-failed"
      />
    );
  }
  const source = invoices.invoices.find((invoice) => invoice.id === start.id) ?? null;
  // A draft sent or removed meanwhile on another device: a new invoice instead.
  const usable = source && (start.kind === "copy" || source.status === "draft") ? source : null;
  return (
    <Arrival key={start.id} fade={waited} style={arrivalStyles.arrival}>
      <Wizard source={usable} copy={start.kind === "copy"} />
    </Arrival>
  );
}

/** The wizard fills the screen, as it does unwrapped. */
const arrivalStyles = StyleSheet.create({ arrival: { flex: 1 } });

function Wizard({ source, copy }: { source: Invoice | null; copy: boolean }) {
  const { t } = useTranslation();
  const { notify } = useNotifications();
  const { profile } = usePos();
  const owner = ownerProfile(profile);
  const invoices = useInvoices();
  const known = invoices.status === "ready" ? invoices.invoices : [];
  const [languageTag] = useState(() => getDeviceLocale().languageTag);
  const settings = getAccountSettings();
  const [state, setState] = useState<WizardState>(() => {
    if (source) return wizardStateOf(source, languageTag, copy);
    const currency = settings?.displayCurrency ?? owner?.currency ?? "CHF";
    return newWizardState(
      { code: currency, digits: currencyDigits(currency) },
      settings?.detectedCountry ?? "CH"
    );
  });
  // The draft it was opened from (a copy is a new invoice): its id and number are kept. Saving a
  // draft leaves the wizard, so no other one is saved from here.
  const saved: Invoice | null = copy ? null : source;
  const [step, setStep] = useState(0);
  // "Save to my items": kept while the wizard shows, beyond the lines' step.
  const [lineSaves] = useState(createLineSaves);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [prepared, setPrepared] = useState<PreparedInvoice | null>(null);
  const [sent, setSent] = useState<Invoice | null>(null);
  // "AI assistant", opened from the first step of a new invoice.
  const [assistantOpen, setAssistantOpen] = useState(false);
  const busy = saving || creating;
  // A line saving to the catalogue keeps the lines' step (its answer, SameNameSheet, shows there).
  const lineSaving = useLineSaving(lineSaves);
  const { digits } = state.currency;
  const update = (patch: Partial<WizardState>) => setState((last) => ({ ...last, ...patch }));

  const fail = (error: unknown) => {
    const code: InvoiceErrorCode = error instanceof InvoiceError ? error.code : "unreachable";
    if (!(error instanceof InvoiceError)) logFailure("An invoice action failed", error);
    // Above Lightning's bounds less their margin, without an address: the most it may ask, in sats.
    const max =
      error instanceof InvoiceError && error.max !== null
        ? formatInteger(error.max, languageTag)
        : "";
    const margin = formatPercent(Number(INVOICE_LIGHTNING_MARGIN_PERCENT), languageTag);
    notify({
      tone: "error",
      title: t(`invoices.errors.${code}`, { max, margin }),
      key: "invoice-action"
    });
  };

  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace(WALLET);
  };
  // "Wallet" itself, past what the wizard was opened from (a draft's details) and anything pushed
  // twice (a second wizard, empty, would show under the notification). Not `replace`: it would
  // stack a second "Wallet" over the first.
  const toWallet = () => {
    if (router.canGoBack()) router.dismissTo(WALLET);
    else router.replace(WALLET);
  };

  const saveAsDraft = () => {
    if (busy || lineSaving) return;
    setSaving(true);
    saveDraft(formOf(state), saved, known, prepared).then(
      (draft) => {
        rememberInvoice(draft);
        setSaving(false);
        notify({
          tone: "success",
          title: t("invoices.draftSaved"),
          body: t("invoices.draftSavedBody"),
          key: "invoice-draft"
        });
        toWallet();
      },
      (error: unknown) => {
        setSaving(false);
        fail(error);
      }
    );
  };

  const create = () => {
    if (busy || !owner) return;
    setCreating(true);
    sendInvoice({
      form: formOf(state),
      saved,
      known,
      profile: owner,
      prepared,
      onPrepared: setPrepared,
      note: (number) => t("invoices.linkNote", { number })
    }).then(
      (invoice) => {
        rememberInvoice(invoice);
        setCreating(false);
        setSent(invoice);
      },
      (error: unknown) => {
        setCreating(false);
        fail(error);
      }
    );
  };

  if (sent && owner) {
    return (
      <SentScreen
        invoice={sent}
        businessName={owner.businessName}
        onClose={toWallet}
        onNew={() => router.replace("/wallet/invoice/new")}
        onView={() => router.replace(`/wallet/invoice/${sent.id}`)}
      />
    );
  }

  const ready = [
    isRecipientComplete(state.recipient),
    linesReady(state.lines, digits),
    state.dueDate !== null && isDueDateOffered(state.dueDate),
    redirectValid(state.redirectUrl),
    true
  ];
  const allReady = ready.every(Boolean);
  const next = () => {
    if (!ready[step] || lineSaving) return;
    setStep((current) => Math.min(current + 1, 4));
  };
  const back = () => {
    if (busy || lineSaving) return;
    if (step === 0) leave();
    else setStep(step - 1);
  };
  const today = formatDate(new Date(), languageTag, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });

  const footer =
    step < 4 ? (
      <Button
        onPress={next}
        disabled={!ready[step] || busy || lineSaving}
        testID="invoice-continue"
      >
        {t("common.continue")}
      </Button>
    ) : (
      <View style={styles.reviewFooter}>
        <Button
          variant="secondary"
          size="md"
          icon="floppy-disk"
          onPress={saveAsDraft}
          loading={saving}
          disabled={creating}
          testID="invoice-review-save-draft"
        >
          {t("invoices.saveDraft")}
        </Button>
        <Button
          onPress={create}
          loading={creating}
          disabled={!allReady || saving || !owner}
          testID="invoice-create"
        >
          {t("invoices.review.create")}
        </Button>
      </View>
    );

  let body;
  switch (step) {
    case 0:
      body = (
        <RecipientStep
          recipient={state.recipient}
          onChange={(patch) => update({ recipient: { ...state.recipient, ...patch } })}
          suggestedCountry={settings?.detectedCountry ?? null}
          businessName={owner?.businessName ?? settings?.businessName ?? ""}
          business={settings}
          today={today}
          disabled={busy}
          onAssistant={source === null ? () => setAssistantOpen(true) : null}
        />
      );
      break;
    case 1:
      body = (
        <LinesStep
          lines={state.lines}
          onChange={(lines) => update({ lines })}
          currency={state.currency}
          defaultVat={defaultVatRate(settings)}
          languageTag={languageTag}
          disabled={busy}
          saves={lineSaves}
        />
      );
      break;
    case 2:
      body = (
        <DueStep
          dueDate={state.dueDate}
          onChange={(dueDate) => update({ dueDate })}
          languageTag={languageTag}
          disabled={busy}
        />
      );
      break;
    case 3:
      body = (
        <TermsStep
          terms={state.terms}
          legal={state.legal}
          redirectUrl={state.redirectUrl}
          redirectOpen={state.redirectOpen}
          onChange={update}
          onOpenRedirect={() => update({ redirectOpen: true })}
          disabled={busy}
        />
      );
      break;
    default:
      body = (
        <ReviewStep
          recipient={state.recipient}
          lines={readLines(state.lines, digits)}
          currency={state.currency}
          dueDate={state.dueDate ?? ""}
          terms={state.terms}
          legal={state.legal}
          redirectUrl={state.redirectUrl}
          languageTag={languageTag}
          onEdit={setStep}
        />
      );
  }

  return (
    <WizardFrame
      step={step}
      onBack={back}
      onSaveDraft={saveAsDraft}
      saving={saving}
      busy={creating || lineSaving}
      footer={footer}
      testID={`invoice-step-${step + 1}`}
    >
      {body}
      <NewIntegrationSheet
        start="assistant"
        visible={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        // Listed in "Integrations", read there when it opens.
        onCreated={() => undefined}
      />
    </WizardFrame>
  );
}

const styles = StyleSheet.create({
  reviewFooter: { gap: 10 }
});
