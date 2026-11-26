import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Sheet } from "@/components/ui/Sheet";
import { TextField } from "@/components/ui/TextField";
import { LEGACY_PIN } from "@/lib/legacy-v2/card-history";
import { makeStyles, sans, type } from "@/theme";

import type { LegacyCopyOutcome } from "./legacy-history";
import type { LegacyCopyPhase } from "./useCardHistory";

/*
 * What "History" says of the copy of a card's v2 history when it could not be made by itself
 * (useCardHistory, legacy-history.ts: a card with a PIN asks it of its holder): its PIN on the v2
 * portal to give ("Get the history", a panel), or a failure to try again. Nothing otherwise: the
 * rows of its v2 history show among the others, without saying where they come from. A callout and
 * a panel of the design system's.
 */
export function LegacyHistoryOffer({
  phase,
  copy
}: {
  phase: LegacyCopyPhase;
  copy: (pin: string | null) => Promise<LegacyCopyOutcome>;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const [asking, setAsking] = useState(false);
  if (phase === "pin") {
    return (
      <View style={styles.block}>
        <Callout tone="warning" testID="card-history-legacy-pin">
          {t("cards.history.legacy.pinNeeded")}
        </Callout>
        <Button
          variant="secondary"
          icon="key"
          onPress={() => setAsking(true)}
          testID="card-history-legacy-open"
        >
          {t("cards.history.legacy.open")}
        </Button>
        <Sheet
          title={t("cards.history.legacy.title")}
          closeLabel={t("common.cancel")}
          visible={asking}
          onClose={() => setAsking(false)}
          testID="card-history-legacy-sheet"
        >
          <PinForm copy={copy} onCopied={() => setAsking(false)} />
        </Sheet>
      </View>
    );
  }
  if (phase === "failed") {
    return (
      <View style={styles.block}>
        <Callout tone="warning" testID="card-history-legacy-failed">
          {t("cards.history.legacy.failed")}
        </Callout>
        <Button
          variant="secondary"
          onPress={() => void copy(null)}
          testID="card-history-legacy-retry"
        >
          {t("cards.retry")}
        </Button>
      </View>
    );
  }
  return null;
}

/** Why the PIN given did not copy the history, as its field says it. */
type PinFailure = "pinInvalid" | "pinLocked" | "failed";

/**
 * The card's PIN on the v2 portal, given once: sent to the v2 server with the copy's read, then
 * forgotten (never kept, logged nor written). Its field is cleared after each try.
 */
function PinForm({
  copy,
  onCopied
}: {
  copy: (pin: string | null) => Promise<LegacyCopyOutcome>;
  onCopied: () => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const [pin, setPin] = useState("");
  const [checking, setChecking] = useState(false);
  const [failure, setFailure] = useState<PinFailure | null>(null);
  // A ref: a double tap must not send the PIN twice before the re-render.
  const running = useRef(false);
  const valid = LEGACY_PIN.test(pin);

  const submit = async () => {
    if (running.current || !valid) return;
    running.current = true;
    setChecking(true);
    setFailure(null);
    try {
      const outcome = await copy(pin);
      // Forgotten as soon as it served, whatever came of it.
      setPin("");
      if (outcome === "copied" || outcome === "unknownCard") {
        onCopied();
        return;
      }
      setFailure(
        outcome === "pinInvalid" || outcome === "pinRequired"
          ? "pinInvalid"
          : outcome === "pinLocked"
            ? "pinLocked"
            : "failed"
      );
    } finally {
      running.current = false;
      setChecking(false);
    }
  };

  return (
    <View style={styles.form}>
      <Text style={styles.text}>{t("cards.history.legacy.lead")}</Text>
      <TextField
        label={t("cards.history.legacy.pin")}
        value={pin}
        onChangeText={setPin}
        icon="key"
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
        disabled={checking}
        error={failure ? t(`cards.history.legacy.errors.${failure}`) : null}
        testID="card-history-legacy-pin-field"
      />
      <Button
        icon="arrow-right"
        onPress={() => void submit()}
        loading={checking}
        disabled={!valid}
        testID="card-history-legacy-submit"
      >
        {t("cards.history.legacy.submit")}
      </Button>
      <Text style={styles.note}>{t("cards.history.legacy.note")}</Text>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  block: { gap: 12 },
  form: { gap: 14 },
  text: {
    ...sans(500),
    fontSize: type.prose,
    lineHeight: type.prose * 1.45,
    color: colors.text.primary
  },
  note: {
    ...sans(500),
    fontSize: type.caption,
    lineHeight: type.caption * 1.5,
    color: colors.text.secondary
  }
}));
