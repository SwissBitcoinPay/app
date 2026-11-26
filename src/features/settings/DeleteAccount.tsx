import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { clamp, useAnimatedStyle, useReducedMotion } from "react-native-reanimated";

import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  DIALOG_EASING,
  DIALOG_RISE,
  OverlayModal,
  Scrim,
  useOverlay
} from "@/components/ui/overlay";
import { Spinner } from "@/components/ui/Spinner";
import { toUnlockFailure, unlockFailureMessage } from "@/features/account/usePasskeyAccount";
import { signInWithAccountPasskey } from "@/features/account/wallet-access";
import { useNotifications } from "@/features/notifications/NotificationsProvider";
import { getDeviceLocale } from "@/lib/locale/device";
import { formatInteger } from "@/lib/locale/format";
import { logFailure } from "@/lib/log/log";
import { makeStyles, proseLineHeight, radius, sans, space, tracked, type } from "@/theme";

import {
  DeletionError,
  checkAccountDeletion,
  deleteAccount,
  type DeletionCheck,
  type DeletionStep
} from "./account-deletion";
import { noteAccountDeleted } from "./deleted-here";

/*
 * "Delete account": the checks first (the button
 * waits), then a confirmation for the employees when there are some, another for the integrations,
 * another for the AI assistants, then the deletion's own, then the passkey; then a panel says how
 * far the deletion is, and cannot
 * be closed. Once it is done, the device is wiped: the app shows its welcome screen, with a
 * notification that the account is deleted (deleted-here.ts). Each failure
 * is a notification, saying what to do. A card holder's account (`cardHolder`) has no wallet of
 * its own, nor team: its texts speak of its cards only.
 */

type Stage =
  | { stage: "idle" }
  | { stage: "checking" }
  | { stage: "employees"; check: DeletionCheck }
  | { stage: "integrations"; check: DeletionCheck }
  | { stage: "assistants"; check: DeletionCheck }
  | { stage: "confirm"; check: DeletionCheck }
  | { stage: "passkey" }
  | { stage: "deleting"; step: DeletionStep };

/** The confirmation after the employees': the integrations', else the assistants', else the last. */
function afterEmployees(check: DeletionCheck): Stage {
  return check.integrations > 0 ? { stage: "integrations", check } : afterIntegrations(check);
}

/** The confirmation after the integrations': the assistants' (when some), else the last. */
function afterIntegrations(check: DeletionCheck): Stage {
  return check.assistants > 0 ? { stage: "assistants", check } : { stage: "confirm", check };
}

export function DeleteAccount({
  fullWidth,
  cardHolder = false,
  style
}: {
  fullWidth: boolean;
  cardHolder?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation();
  const { notify } = useNotifications();
  const [stage, setStage] = useState<Stage>({ stage: "idle" });
  // A ref: a double tap must not start two checks before the re-render.
  const running = useRef(false);
  // The deletion went past the checks: the Lightning address or the team may be gone already.
  const started = useRef(false);

  const fail = (body: string) =>
    notify({
      tone: "error",
      title: t("settings.delete.failedTitle"),
      body,
      key: "account-deletion"
    });

  const message = (error: unknown): string => {
    if (!(error instanceof DeletionError)) {
      return t(
        cardHolder ? "settings.delete.card.walletFailed" : "settings.delete.errors.walletFailed"
      );
    }
    // Past the Lightning address: the deletion is begun, the next attempt goes on from it.
    if (
      started.current &&
      (error.code === "unreachable" || error.code === "notDeleted" || error.code === "walletFailed")
    ) {
      return t(cardHolder ? "settings.delete.card.begun" : "settings.delete.errors.begun");
    }
    const reason = reasonOf(error);
    return started.current && error.code !== "unfinished"
      ? `${reason} ${t(cardHolder ? "settings.delete.card.alreadyRemoved" : "settings.delete.alreadyRemoved")}`
      : reason;
  };

  const reasonOf = (error: DeletionError): string => {
    switch (error.code) {
      case "balance":
        return t("settings.delete.errors.balance", {
          sats: formatInteger(error.balanceSats ?? 0n, getDeviceLocale().languageTag)
        });
      case "otherAccount":
        return t("navigation.lock.otherAccount");
      case "noAccount":
        return t("settings.errors.noAccount");
      case "cardWallets":
        return t(
          cardHolder ? "settings.delete.card.cardWallets" : "settings.delete.errors.cardWallets"
        );
      case "walletFailed":
        return t(
          cardHolder ? "settings.delete.card.walletFailed" : "settings.delete.errors.walletFailed"
        );
      default:
        return t(`settings.delete.errors.${error.code}`);
    }
  };

  const start = async () => {
    if (running.current) return;
    running.current = true;
    setStage({ stage: "checking" });
    try {
      const check = await checkAccountDeletion();
      setStage(check.employees > 0 ? { stage: "employees", check } : afterEmployees(check));
    } catch (error) {
      logFailure("Checking the account's deletion failed", error);
      setStage({ stage: "idle" });
      fail(message(error));
    } finally {
      running.current = false;
    }
  };

  const confirmed = async () => {
    if (running.current) return;
    running.current = true;
    started.current = false;
    setStage({ stage: "passkey" });
    try {
      let seed;
      try {
        // The open account's passkey only (deleteAccount checks the seed is the account's).
        ({ seed } = await signInWithAccountPasskey());
      } catch (error) {
        const failure = toUnlockFailure(error);
        // A dismissed prompt: nothing to say, nothing done.
        if (failure) fail(unlockFailureMessage(failure, t));
        setStage({ stage: "idle" });
        return;
      }
      await deleteAccount(seed, (step) => {
        if (step.step !== "wallet") started.current = true;
        setStage({ stage: "deleting", step });
      });
      // The device is wiped: the welcome screen shows, this screen goes; it says the deletion is
      // done (deleted-here.ts).
      noteAccountDeleted();
    } catch (error) {
      logFailure("Deleting the account failed", error);
      setStage({ stage: "idle" });
      fail(message(error));
    } finally {
      running.current = false;
    }
  };

  const cancel = () => setStage({ stage: "idle" });
  const check = "check" in stage ? stage.check : null;
  const busy = stage.stage === "checking" || stage.stage === "passkey";

  return (
    <>
      <Button
        variant="destructive"
        size="md"
        icon="trash-can"
        fullWidth={fullWidth}
        loading={busy || stage.stage === "deleting"}
        onPress={() => void start()}
        style={style}
        testID="delete-account"
      >
        {t("settings.delete.button")}
      </Button>
      <ConfirmDialog
        visible={stage.stage === "employees"}
        title={t("settings.delete.employeesTitle", { count: check?.employees ?? 0 })}
        body={t("settings.delete.employeesBody", { count: check?.employees ?? 0 })}
        confirmLabel={t("settings.delete.removeAndContinue")}
        cancelLabel={t("settings.back")}
        onConfirm={() => check && setStage(afterEmployees(check))}
        onCancel={cancel}
        testID="delete-employees-dialog"
        confirmTestID="delete-employees-confirm"
      />
      <ConfirmDialog
        visible={stage.stage === "integrations"}
        title={t("settings.delete.integrationsTitle", { count: check?.integrations ?? 0 })}
        body={t("settings.delete.integrationsBody", { count: check?.integrations ?? 0 })}
        confirmLabel={t("settings.delete.removeAndContinue")}
        cancelLabel={t("settings.back")}
        onConfirm={() => check && setStage(afterIntegrations(check))}
        onCancel={cancel}
        testID="delete-integrations-dialog"
        confirmTestID="delete-integrations-confirm"
      />
      <ConfirmDialog
        visible={stage.stage === "assistants"}
        title={t("settings.delete.assistantsTitle", { count: check?.assistants ?? 0 })}
        body={t("settings.delete.assistantsBody", { count: check?.assistants ?? 0 })}
        confirmLabel={t("settings.delete.removeAndContinue")}
        cancelLabel={t("settings.back")}
        onConfirm={() => check && setStage({ stage: "confirm", check })}
        onCancel={cancel}
        testID="delete-assistants-dialog"
        confirmTestID="delete-assistants-confirm"
      />
      <ConfirmDialog
        visible={stage.stage === "confirm"}
        title={t("settings.delete.confirmTitle")}
        body={t(cardHolder ? "settings.delete.card.confirmBody" : "settings.delete.confirmBody")}
        confirmLabel={t("settings.delete.confirm")}
        cancelLabel={t("settings.back")}
        onConfirm={() => void confirmed()}
        onCancel={cancel}
        testID="delete-confirm-dialog"
        confirmTestID="delete-confirm"
      />
      <DeletionProgress
        step={stage.stage === "deleting" ? stage.step : null}
        cardHolder={cardHolder}
      />
    </>
  );
}

/** What the deletion is doing: a card over the scrim, as ConfirmDialog's, without any button. */
function DeletionProgress({
  step,
  cardHolder
}: {
  step: DeletionStep | null;
  cardHolder: boolean;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const visible = step !== null;
  const { mounted, progress } = useOverlay(visible, DIALOG_EASING);
  // Its last step, through its exit animation.
  const [shown, setShown] = useState<DeletionStep>({ step: "wallet" });
  if (step && step !== shown) setShown(step);
  const cardStyle = useAnimatedStyle(() => {
    const at = clamp(progress.get(), 0, 1);
    return reduceMotion
      ? { opacity: at }
      : { opacity: at, transform: [{ translateY: (1 - at) * DIALOG_RISE }] };
  }, [reduceMotion]);
  const label =
    shown.step === "relays"
      ? t(`settings.delete.steps.${shown.phase}`, { done: shown.done, total: shown.total })
      : // A card holder's account: its cards' wallets checked, no team to remove.
        cardHolder && (shown.step === "wallet" || shown.step === "team")
        ? t("settings.delete.card.stepCards")
        : t(`settings.delete.steps.${shown.step}`);
  return (
    // Nothing closes it: the deletion goes on whatever the user does.
    <OverlayModal mounted={mounted} visible={visible} onRequestClose={() => {}}>
      <Scrim progress={progress} />
      {/* Never flattened, as ConfirmDialog's layer (Android: "addViewAt: failed to insert view"). */}
      <View collapsable={false} style={styles.layer}>
        <Animated.View
          testID="delete-progress"
          accessibilityViewIsModal
          accessibilityLiveRegion="polite"
          style={[styles.card, cardStyle]}
        >
          <Text accessibilityRole="header" style={styles.title}>
            {t("settings.delete.progressTitle")}
          </Text>
          <View style={styles.row}>
            <Spinner size={24} />
            <Text style={styles.body} testID="delete-progress-step">
              {label}
            </Text>
          </View>
          <Text style={styles.body}>{t("settings.delete.progressHint")}</Text>
        </Animated.View>
      </View>
    </OverlayModal>
  );
}

const useStyles = makeStyles(({ colors, shadow }) => ({
  layer: { flex: 1, alignItems: "center", justifyContent: "center", padding: space[8] },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: colors.background.surface,
    borderRadius: radius.lg,
    paddingTop: space[9],
    paddingHorizontal: 24,
    paddingBottom: space[7],
    boxShadow: shadow.card,
    gap: 14
  },
  title: {
    ...sans(700),
    fontSize: type.title,
    letterSpacing: tracked.title,
    color: colors.text.primary
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  body: {
    ...sans(500),
    flexShrink: 1,
    fontSize: type.prose,
    lineHeight: proseLineHeight,
    color: colors.text.secondary
  }
}));
