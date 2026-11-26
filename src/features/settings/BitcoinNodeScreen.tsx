import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Keyboard, ScrollView, Text, View } from "react-native";

import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Icon } from "@/components/ui/Icon";
import { OptionCard } from "@/components/ui/OptionCard";
import { Sheet } from "@/components/ui/Sheet";
import { Switch } from "@/components/ui/Switch";
import { TextField } from "@/components/ui/TextField";
import { useUnlocked } from "@/features/navigation/lock";
import { testBitcoinNode, type NodeTest } from "@/features/onchain/node-test";
import { usePos } from "@/features/terminal/pos";
import { formatInteger } from "@/lib/locale/format";
import {
  isPayersNode,
  isPlainHttp,
  normalizeNodeUrl,
  sameBitcoinNode,
  type BitcoinNode,
  type NodeFallback
} from "@/lib/onchain/node";
import { isCardHolderProfile, isMemberProfile } from "@/lib/terminal/model";
import { makeStyles, proseLineHeight, sans, space, type, useTheme } from "@/theme";

import { changeBitcoinNode } from "./account-settings";
import { SettingBlock } from "./fields";
import {
  SettingsCard,
  SettingsPage,
  SettingsRow,
  useLanguageTag,
  useSettingsFailure,
  useSettingsSaved
} from "./parts";
import { useAccountSettings } from "./useAccountSettings";

/*
 * "Bitcoin node" ("Network" holds its row, this page its choice): mempool.space or the merchant's
 * own
 * mempool, its address, what to do while it does not answer, whether the payers' pages read it too
 * (an HTTPS node of the Internet only, off by default). "Test the connection" asks the node
 * from this device (node-test.ts); "Save" tests it first when it was not, and asks before
 * saving a node that did not answer well (it may answer from the business's network only). Saved
 * in the account's settings (changeBitcoinNode): the owner's devices, the employees' and the
 * account's wallet follow. A merchant's only: a card holder's account and an employee's device have
 * no point of sale whose payments it follows. A phone shows it on a page of its own
 * (/settings/node), a computer in a dialog of "Network" (BitcoinNodeDialog), as the relays: a link
 * to the page there leads back to "Settings".
 */

export function BitcoinNodeScreen() {
  const desktop = useIsDesktop();
  const { profile } = usePos();
  const settings = useAccountSettings();
  const unlocked = useUnlocked(isMemberProfile(profile) ? "" : profile.walletId);
  if (
    desktop ||
    isMemberProfile(profile) ||
    isCardHolderProfile(profile) ||
    !unlocked ||
    !settings ||
    settings.signUp !== "done"
  ) {
    return <Redirect href="/settings" />;
  }
  return <BitcoinNodePage saved={settings.bitcoinNode} />;
}

/** A phone: the page over the whole window, back to "Network". */
function BitcoinNodePage({ saved }: { saved: BitcoinNode | null }) {
  const { t } = useTranslation();
  const router = useRouter();
  const back = () => {
    Keyboard.dismiss();
    if (router.canGoBack()) router.back();
    else router.replace("/settings");
  };
  const store = useNodeStore(saved, back);
  return (
    <SettingsPage title={t("settings.node.title")} testID="settings-page-node">
      <NodeForm saved={saved} store={store} framed="page" onCancel={back} />
      <NodeConfirm store={store} />
    </SettingsPage>
  );
}

/**
 * A computer: the same settings in a dialog of "Settings",
 * "Network", as the relays' (RelaysDialog). Its draft starts from the saved node at each opening
 * (Sheet mounts its children while it shows); it stays while a node is saved.
 */
export function BitcoinNodeDialog({
  visible,
  onClose,
  saved
}: {
  visible: boolean;
  onClose: () => void;
  saved: BitcoinNode | null;
}) {
  const { t } = useTranslation();
  const store = useNodeStore(saved, onClose);
  return (
    <Sheet
      title={t("settings.node.title")}
      closeLabel={t("settings.close")}
      visible={visible}
      onClose={onClose}
      dismissible={!store.saving}
      dialogWidth={560}
      // Drawn while asked only, as every panel over this one (Sheet's `over`).
      over={store.confirming ? <NodeConfirm store={store} /> : undefined}
      testID="node-dialog"
    >
      <NodeForm saved={saved} store={store} framed="dialog" onCancel={onClose} />
    </Sheet>
  );
}

type NodeStore = {
  saving: boolean;
  /** The node to save although its test did not pass, while the owner is asked. */
  confirming: BitcoinNode | null;
  ask: (node: BitcoinNode) => void;
  cancel: () => void;
  /** Saves the node (null: mempool.space), says so, then `done`; nothing to save: `done` only. */
  store: (node: BitcoinNode | null) => Promise<void>;
};

/** Saving, for the page and the dialog alike: held by their frame, which shows the confirmation. */
function useNodeStore(saved: BitcoinNode | null, done: () => void): NodeStore {
  const { t } = useTranslation();
  const notifySaved = useSettingsSaved();
  const fail = useSettingsFailure();
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState<BitcoinNode | null>(null);
  const store = async (node: BitcoinNode | null) => {
    setConfirming(null);
    if (sameBitcoinNode(node, saved)) {
      done();
      return;
    }
    setSaving(true);
    try {
      await changeBitcoinNode(node);
      notifySaved(
        "settings-node",
        t("settings.node.savedTitle"),
        t(node ? "settings.node.savedOwn" : "settings.node.savedMempool")
      );
      done();
    } catch (error) {
      fail(error, "settings-node");
    } finally {
      setSaving(false);
    }
  };
  return {
    saving,
    confirming,
    ask: setConfirming,
    cancel: () => setConfirming(null),
    store
  };
}

/** "Save this node?": a node that did not answer well may answer from the business's network. */
function NodeConfirm({ store }: { store: NodeStore }) {
  const { t } = useTranslation();
  const { confirming } = store;
  return (
    <ConfirmDialog
      visible={confirming !== null}
      title={t("settings.node.confirmTitle")}
      body={t("settings.node.confirmBody")}
      confirmLabel={t("settings.node.confirmAction")}
      tone="primary"
      cancelLabel={t("common.cancel")}
      onConfirm={() => {
        if (confirming) void store.store(confirming);
      }}
      onCancel={store.cancel}
      testID="node-confirm"
      confirmTestID="node-confirm-save"
    />
  );
}

type Tested = { url: string; result: NodeTest };

/**
 * The settings, the page's or the dialog's (`framed`): the page scrolls them itself and ends on its
 * full-width "Save"; the dialog scrolls them within its height, "Cancel" and
 * "Save" under them, as the relays' dialog.
 */
function NodeForm({
  saved,
  store,
  framed,
  onCancel
}: {
  saved: BitcoinNode | null;
  store: NodeStore;
  framed: "page" | "dialog";
  onCancel: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const languageTag = useLanguageTag();
  const [own, setOwn] = useState(saved !== null);
  const [text, setText] = useState(saved?.url ?? "");
  const [fallback, setFallback] = useState<NodeFallback>(saved?.fallback ?? "mempool");
  // "Pass my node on to the payers' pages": off by default.
  const [payers, setPayers] = useState(saved?.payers ?? false);
  // Shown once the address was checked ("Test", "Save"), until it is typed again.
  const [urlError, setUrlError] = useState<string | null>(null);
  const [tested, setTested] = useState<Tested | null>(null);
  const [testing, setTesting] = useState(false);
  const { saving } = store;

  const normalized = normalizeNodeUrl(text);
  // An address saved in http:// before HTTPS was required (src/lib/onchain/node.ts): shown as it
  // was, said to be no longer used, refused as it is (`insecure`) until another one is typed.
  const legacyHttp = own && saved !== null && isPlainHttp(saved.url) && text === saved.url;
  // The payers' browsers reach a node of the Internet only (isPayersNode): off, and not offered,
  // for any other address.
  const payersOffered = own && normalized.url !== null && isPayersNode(normalized.url);
  const result = tested !== null && tested.url === normalized.url ? tested.result : null;

  /** The address in its one spelling, or null with its error shown. */
  const checkedUrl = (): string | null => {
    if (normalized.url === null) {
      setUrlError(t(`settings.node.errors.${normalized.error}`));
      return null;
    }
    setUrlError(null);
    return normalized.url;
  };

  const runTest = async (url: string): Promise<NodeTest> => {
    setTesting(true);
    try {
      const outcome = await testBitcoinNode(url);
      setTested({ url, result: outcome });
      return outcome;
    } finally {
      setTesting(false);
    }
  };

  const test = () => {
    Keyboard.dismiss();
    const url = checkedUrl();
    if (url !== null) void runTest(url);
  };

  const save = async () => {
    Keyboard.dismiss();
    if (!own) {
      await store.store(null);
      return;
    }
    const url = checkedUrl();
    if (url === null) return;
    const node: BitcoinNode = { url, fallback, payers: payers && isPayersNode(url) };
    const outcome = result ?? (await runTest(url));
    if (outcome.status === "ok") await store.store(node);
    else store.ask(node);
  };

  const busy = testing || saving;
  // On a dialog's white, its cards ringed rather than raised (OptionCard's `outlined`, as the card
  // modes' dialog, PayeesPanel.tsx); the page's cream keeps its raised cards.
  const dialog = framed === "dialog";
  const settings = (
    <>
      <SettingBlock description={t("settings.node.description")}>
        <View style={styles.choices} accessibilityRole="radiogroup">
          <OptionCard
            title={t("settings.node.mempoolTitle")}
            description={t("settings.node.mempoolDescription")}
            leading={<Icon name="globe" size={18} color={colors.text.primary} />}
            selected={!own}
            outlined={dialog}
            disabled={busy}
            onPress={() => setOwn(false)}
            testID="node-mempool"
          />
          <OptionCard
            title={t("settings.node.ownTitle")}
            description={t("settings.node.ownDescription")}
            leading={<Icon name="server" size={18} color={colors.text.primary} />}
            selected={own}
            outlined={dialog}
            disabled={busy}
            onPress={() => setOwn(true)}
            testID="node-own"
          />
        </View>
      </SettingBlock>

      {own ? (
        <SettingBlock>
          <View style={styles.field}>
            <TextField
              label={t("settings.node.urlLabel")}
              value={text}
              onChangeText={(value) => {
                setText(value);
                setUrlError(null);
              }}
              placeholder="https://mempool.example.ch"
              monospace
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              keyboardType="url"
              inputMode="url"
              returnKeyType="done"
              onSubmitEditing={test}
              disabled={busy}
              error={urlError}
              testID="node-url"
            />
            <Text style={styles.hint}>{t("settings.node.urlHint")}</Text>
          </View>
          {result ? <TestOutcome result={result} languageTag={languageTag} /> : null}
          {legacyHttp ? (
            <Callout tone="error" title={t("settings.node.legacyHttpTitle")} testID="node-http">
              {t("settings.node.legacyHttpBody")}
            </Callout>
          ) : null}
          <View style={styles.buttonRow}>
            <Button
              variant="secondary"
              size="md"
              icon="plug"
              fullWidth={false}
              loading={testing}
              disabled={saving}
              onPress={test}
              testID="node-test"
            >
              {t("settings.node.test")}
            </Button>
          </View>
        </SettingBlock>
      ) : null}

      {own ? (
        <SettingBlock title={t("settings.node.fallbackTitle")}>
          <View style={styles.choices} accessibilityRole="radiogroup">
            <OptionCard
              outlined
              title={t("settings.node.fallbackMempool")}
              description={t("settings.node.fallbackMempoolDescription")}
              leading={<Icon name="globe" size={16} color={colors.text.primary} />}
              selected={fallback === "mempool"}
              disabled={busy}
              onPress={() => setFallback("mempool")}
              testID="node-fallback-mempool"
            />
            <OptionCard
              outlined
              title={t("settings.node.fallbackNone")}
              description={t("settings.node.fallbackNoneDescription")}
              leading={<Icon name="bolt" size={16} color={colors.text.primary} />}
              selected={fallback === "none"}
              disabled={busy}
              onPress={() => setFallback("none")}
              testID="node-fallback-none"
            />
          </View>
        </SettingBlock>
      ) : null}

      {own ? (
        <SettingBlock title={t("settings.node.payersTitle")}>
          <SettingsCard outlined={dialog} testID="node-payers-card">
            <SettingsRow
              icon="globe"
              label={t("settings.node.payersLabel")}
              caption={t(
                payersOffered ? "settings.node.payersCaption" : "settings.node.payersHttpsOnly"
              )}
              captionWarning={!payersOffered}
              trailing={
                <Switch
                  value={payersOffered && payers}
                  onValueChange={setPayers}
                  label={t("settings.node.payersLabel")}
                  disabled={!payersOffered || busy}
                  testID="node-payers-switch"
                />
              }
              wrap
              testID="node-payers-row"
            />
          </SettingsCard>
        </SettingBlock>
      ) : null}

      <Text style={styles.note}>
        {t(
          own && payersOffered && payers
            ? "settings.node.publicNotePayers"
            : "settings.node.publicNote"
        )}
      </Text>
    </>
  );

  if (framed === "page") {
    return (
      <>
        {settings}
        <Button
          variant="primary"
          loading={saving}
          disabled={testing}
          onPress={() => void save()}
          testID="node-save"
        >
          {t("settings.save")}
        </Button>
      </>
    );
  }
  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.dialogBody}
        keyboardShouldPersistTaps="handled"
        testID="node-dialog-body"
      >
        {settings}
      </ScrollView>
      <View style={styles.dialogActions}>
        <Button
          variant="secondary"
          size="sm"
          fullWidth={false}
          disabled={saving}
          onPress={onCancel}
          style={styles.cancel}
          testID="node-cancel"
        >
          {t("common.cancel")}
        </Button>
        <Button
          size="sm"
          fullWidth={false}
          loading={saving}
          disabled={testing}
          onPress={() => void save()}
          style={styles.save}
          testID="node-save"
        >
          {t("settings.save")}
        </Button>
      </View>
    </>
  );
}

/** What "Test the connection" found (node-test.ts). */
function TestOutcome({ result, languageTag }: { result: NodeTest; languageTag: string }) {
  const { t } = useTranslation();
  switch (result.status) {
    case "ok":
      return (
        <Callout tone="success" title={t("settings.node.results.ok.title")} testID="node-result">
          {t("settings.node.results.ok.body", {
            height: formatInteger(result.height, languageTag)
          })}
        </Callout>
      );
    case "behind":
      return (
        <Callout
          tone="warning"
          title={t("settings.node.results.behind.title")}
          testID="node-result"
        >
          {t("settings.node.results.behind.body", {
            hours: formatInteger(Math.floor(result.ageSeconds / 3600), languageTag)
          })}
        </Callout>
      );
    default:
      return (
        <Callout
          tone="error"
          title={t(`settings.node.results.${result.status}.title`)}
          testID="node-result"
        >
          {t(`settings.node.results.${result.status}.body`)}
        </Callout>
      );
  }
}

const useStyles = makeStyles(({ colors }) => ({
  choices: { gap: space[5] },
  field: { gap: space[3] },
  hint: {
    ...sans(500),
    paddingHorizontal: 4,
    fontSize: type.caption,
    lineHeight: type.caption * 1.4,
    color: colors.text.secondary
  },
  buttonRow: { flexDirection: "row" },
  // Shrinks to what the dialog leaves it (640 px at most), then scrolls; its blocks as far apart
  // as the page's (SettingsPage).
  scroll: { flexGrow: 0, flexShrink: 1 },
  dialogBody: { gap: 30 },
  // As the relays' dialog (RelaysPanel.tsx): "Cancel" and "Save" on the right.
  dialogActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  cancel: { minWidth: 120 },
  save: { minWidth: 160 },
  note: {
    ...sans(500),
    fontSize: type.prose,
    lineHeight: proseLineHeight,
    color: colors.text.secondary
  }
}));
