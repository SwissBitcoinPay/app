import * as Clipboard from "expo-clipboard";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, StyleSheet, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { SUPPORT_EMAIL, SUPPORT_JOURNAL_KEY } from "@/config/support";
import { useNotifications } from "@/features/notifications/NotificationsProvider";
import { SettingBlock } from "@/features/settings/fields";
import { SettingsCard, SettingsRow } from "@/features/settings/parts";
import { logEvent, logFailure, readLog } from "@/lib/log/log";

import {
  journalLine,
  prepareJournalDeposit,
  publishJournalDeposit,
  type JournalDeposit
} from "./deposit";
import {
  downloadSupportReport,
  openSupportMail,
  shareSupportReport,
  shareSupportText
} from "./mail";
import { REPORT_FILE_NAME, supportReport, supportSignature } from "./report";
import { useCrashReportsSwitch } from "./useCrashReportsSwitch";

/*
 * "Contact support" in "Settings", the owner's and an employee's: a mail to support, written by
 * the app, with the journal of the app unless the holder unticks "Attach the app's log"
 * (src/lib/log/). The journal is deposited encrypted for support on the build's default relays
 * and the mail gives its reference (deposit.ts); when it cannot be (no support key, offline, fewer
 * than a majority of those relays), it is attached instead. The apps deposit it before the mail
 * opens; the web opens the mail from the tap (a browser opens a mail client only right after one),
 * the deposit under way, and downloads the journal if it then fails.
 * Without a mail form (iOS without an account in Mail): the address copied, said, and the mail's
 * text (journal deposited) or the journal handed to the share sheet, where the holder picks the
 * app that sends it. The web says where to send it, in case no mail client opens. Then, on the
 * apps, the section "Send crash reports" (`CrashReportsBlock`), greyed in till mode
 * (`reportsEditable`).
 */

/** Long enough to read the address a notification gives (a notification has no close button). */
const ADDRESS_NOTICE_MS = 10_000;

/** The journal sealed for support; null without a support key, or when it fails (attached then). */
function sealForSupport(report: string): JournalDeposit | null {
  if (SUPPORT_JOURNAL_KEY === null) return null;
  try {
    return prepareJournalDeposit(report, { supportKey: SUPPORT_JOURNAL_KEY, now: new Date() });
  } catch (error) {
    logFailure("Sealing the journal for support failed", error);
    return null;
  }
}

/** Whether a majority of its relays took every record of `deposit`; a failure noted. */
async function deposited(deposit: JournalDeposit): Promise<boolean> {
  try {
    await publishJournalDeposit(deposit);
    return true;
  } catch (error) {
    logFailure("Depositing the journal for support failed", error);
    return false;
  }
}

/** What goes without a mail form: the mail's text (the journal deposited), or the journal. */
type Unsent = { text: string } | { report: string | null };

function useContactSupport() {
  const { t } = useTranslation();
  const { notify } = useNotifications();
  const [attach, setAttach] = useState(true);
  const [busy, setBusy] = useState(false);
  // Two taps in the same frame both see `busy` false: the second never opens a second mail form.
  const working = useRef(false);

  const noMailApp = async (unsent: Unsent) => {
    const copied = await Clipboard.setStringAsync(SUPPORT_EMAIL).catch((error: unknown) => {
      logFailure("Copying the support's address failed", error);
      return false;
    });
    notify({
      tone: "warning",
      title: t("settings.support.noMailTitle"),
      body: t(copied ? "settings.support.addressCopied" : "settings.support.writeTo", {
        email: SUPPORT_EMAIL
      }),
      duration: ADDRESS_NOTICE_MS,
      key: "support"
    });
    const { text, report } = { text: null, report: null, ...unsent };
    if (text === null && report === null) return;
    try {
      if (text !== null) await shareSupportText(text);
      else if (report !== null) await shareSupportReport(report, t("settings.support.shareTitle"));
    } catch (error) {
      logFailure("Sharing the journal failed", error);
      notify({ tone: "error", title: t("settings.support.shareFailed"), key: "support-share" });
    }
  };

  const contact = async () => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      const report = attach ? supportReport(readLog(), new Date()) : null;
      const web = Platform.OS === "web";
      let deposit = report === null ? null : sealForSupport(report);
      // Under way from here: the apps wait for it, the web opens the mail first (above).
      const sending = deposit === null ? null : deposited(deposit);
      if (!web && sending !== null && !(await sending)) deposit = null;
      // What the mail attaches (the web: downloads): the journal, when it is not deposited.
      const attached = deposit === null ? report : null;
      const note =
        deposit !== null
          ? [t("settings.support.deposited"), ""]
          : attached !== null && web
            ? [t("settings.support.downloaded", { file: REPORT_FILE_NAME }), ""]
            : [];
      const body = [
        t("settings.support.body"),
        ...note,
        "--",
        supportSignature(),
        ...(deposit === null ? [] : [journalLine(deposit)])
      ].join("\n");
      // On the web, nothing awaited before: it opens the mail client from the tap.
      const outcome = await openSupportMail({
        subject: t("settings.support.subject"),
        body,
        report: attached
      });
      if (outcome === "noMailApp") {
        await noMailApp(deposit === null ? { report: attached } : { text: body });
        return;
      }
      logEvent("Mail to support opened");
      if (outcome === "openedWithoutReport") {
        notify({ tone: "warning", title: t("settings.support.notAttached"), key: "support" });
      } else if (web) {
        // A browser may have no mail client to open: where to write, and what to attach, said.
        notify({
          tone: "info",
          title: t("settings.support.writeTo", { email: SUPPORT_EMAIL }),
          body:
            attached === null
              ? undefined
              : t("settings.support.attachDownloaded", { file: REPORT_FILE_NAME }),
          duration: ADDRESS_NOTICE_MS,
          key: "support"
        });
        // The mail gives the reference of a deposit that failed: the journal to attach instead.
        if (report !== null && sending !== null && !(await sending)) {
          downloadSupportReport(report);
          notify({
            tone: "warning",
            title: t("settings.support.notDeposited"),
            body: t("settings.support.attachDownloaded", { file: REPORT_FILE_NAME }),
            duration: ADDRESS_NOTICE_MS,
            key: "support"
          });
        }
      }
    } catch (error) {
      logFailure("Opening the mail to support failed", error);
      notify({
        tone: "error",
        title: t("settings.support.failedTitle"),
        body: t("settings.support.writeTo", { email: SUPPORT_EMAIL }),
        key: "support"
      });
    } finally {
      working.current = false;
      setBusy(false);
    }
  };

  return { attach, setAttach, busy, contact: () => void contact() };
}

/**
 * "Help" of "Settings" (a computer's tab, a phone's page), the
 * owner's, a card holder's, an employee's and in till mode: "Support", what the mail joins then
 * the button, and "Send crash reports" (the apps; greyed in till mode,
 * `reportsEditable`).
 */
export function SupportPanel({ reportsEditable = true }: { reportsEditable?: boolean }) {
  const { t } = useTranslation();
  const { attach, setAttach, busy, contact } = useContactSupport();
  return (
    <>
      <SettingBlock
        title={t("settings.support.section")}
        description={t("settings.support.description")}
        testID="support-block"
      >
        <SettingsCard>
          <SettingsRow
            icon="circle-info"
            label={t("settings.support.attach")}
            caption={t("settings.support.attachCaption")}
            trailing={
              <Switch
                value={attach}
                onValueChange={setAttach}
                label={t("settings.support.attach")}
                testID="support-attach"
              />
            }
            // Whole, on several lines: cut, its caption would hide what the journal
            // leaves out.
            wrap
            testID="support-attach-row"
          />
        </SettingsCard>
        <View style={styles.buttonRow}>
          <Button
            variant="secondary"
            size="md"
            icon="envelope"
            fullWidth={false}
            onPress={contact}
            loading={busy}
            style={styles.button}
            testID="support-contact"
          >
            {t("settings.support.contact")}
          </Button>
        </View>
      </SettingBlock>
      <CrashReportsBlock editable={reportsEditable} />
    </>
  );
}

/**
 * "Send crash reports", a section of its own named as its switch: it has nothing to do with the
 * mail to support, whose journal is the switch above
 * the button. The apps only (`visible`).
 */
function CrashReportsBlock({ editable }: { editable: boolean }) {
  const { t } = useTranslation();
  const reports = useCrashReportsSwitch(editable);
  if (!reports.visible) return null;
  return (
    <SettingBlock title={t("settings.support.reports")} testID="support-reports-block">
      <SettingsCard>
        <SettingsRow
          icon="paper-plane"
          // The section says what it sends, the row what they hold; for screen readers, the
          // switch's own label says it too, and so does the row read as one when greyed (its switch
          // then out of reach).
          label={t("settings.support.reportsKinds")}
          accessibleLabel={[t("settings.support.reports"), t("settings.support.reportsKinds")].join(
            ", "
          )}
          caption={t("settings.support.reportsCaption")}
          trailing={reports.control}
          disabled={!editable}
          wrap
          testID="support-reports-row"
        />
      </SettingsCard>
    </SettingBlock>
  );
}

const styles = StyleSheet.create({
  buttonRow: { flexDirection: "row" },
  button: { minWidth: 220 }
});
