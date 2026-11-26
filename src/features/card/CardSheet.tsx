import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Platform, StyleSheet, View } from "react-native";

import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { escapeRichText } from "@/components/ui/RichText";
import { Sheet } from "@/components/ui/Sheet";
import { SheetPages } from "@/components/ui/sheet-pages";
import { Spinner } from "@/components/ui/Spinner";
import { getAccountWalletId } from "@/features/account/session";
import { useNotifications } from "@/features/notifications/NotificationsProvider";
import { useCardHolder } from "@/features/terminal/pos";
import type { CardImageSource } from "@/features/media/card-image";
import { holdActivity } from "@/lib/activity";
import type { CardState } from "@/lib/card/card-record";
import { cardLimitUsage } from "@/lib/card/card-limits";
import { logFailure } from "@/lib/log/log";
import { space } from "@/theme";

import { cardLabel, cardOfLabel } from "./card-label";
import { PayeesRow, RelayRow, RowsCard } from "./CardRows";
import { CardImageFramer, CardImageFramerDialog, type FramedImage } from "./CardImageFramer";
import { CardWalletFlow, type WalletHeader } from "./CardWalletFlow";
import { useCardWallet } from "./CardWalletPanel";
import {
  CustomizePanel,
  customizeDraftOf,
  draftWithImage,
  type CustomizeDraft
} from "./CustomizePanel";
import { DeleteCardPanel } from "./DeleteCardPanel";
import { DeleteCardSteps } from "./DeleteCardSteps";
import { LIMIT_TITLES, LimitEditor, LimitsOverview, type CardLimitRead } from "./LimitsPanel";
import { cardNameOf, type CardLimit } from "./manage";
import { PairingError, type PairingFailure } from "./pairing";
import { PayeesPanel, payeesPageTitle, type PayeesPage } from "./PayeesPanel";
import type { ChannelSync } from "./relay-sync";
import { RelayMoveSteps } from "./RelayMoveSteps";
import { RelayChangeForm, RelayStatus } from "./RelayPanel";
import { RelayChangeOnPhone, RelayOnComputer } from "./RelayWebPanel";
import { useCardDeletion, type DeletionOutcome } from "./useCardDeletion";
import { useReadsCards } from "./useReadsCards";
import { useRelayMove } from "./useRelayMove";

/**
 * What "Cards" opens a card's panel on (CardsScreen.tsx). `empty`: back to the main balance with
 * "Empty the card" chosen, from "Delete the card" (emptied first). `advanced`: "Advanced settings",
 * which leads to "Payments without confirmation" and "Relay and programming".
 */
export type CardTask =
  "limits" | "customize" | "advanced" | "recharge" | "return" | "empty" | "delete";

type Mode =
  /** "Limits": its three limits, each opening its form (LimitsPanel.tsx). */
  | { kind: "limits" }
  | { kind: "limit"; limit: CardLimit }
  /** "Customize": its name and its look (CustomizePanel.tsx). */
  | { kind: "customize" }
  /** "Advanced settings": the two rows below, each opening its pages in the panel. */
  | { kind: "advanced" }
  /** "Payments without confirmation" (PayeesPanel.tsx): its list, "Change mode", a merchant. */
  | { kind: "payees"; page: PayeesPage }
  /** "Relay and programming": the card's state, then "Change relay" (RelayPanel.tsx). */
  | { kind: "relay" }
  | { kind: "relayForm" }
  /** The card's own wallet (CardWalletPanel.tsx): "Top up", "Withdraw to my main balance". */
  | { kind: "wallet"; start: "recharge" | "return" | "drain" }
  /** "Delete the card" (DeleteCardPanel.tsx), its steps over it (DeleteCardSteps.tsx). */
  | { kind: "delete" }
  /** `retry` runs the operation again (one interrupted goes on from where it stopped). */
  | { kind: "failed"; reason: PairingFailure; retry: (() => void) | null };

function modeOf(task: CardTask): Mode {
  switch (task) {
    case "recharge":
    case "return":
      return { kind: "wallet", start: task };
    case "empty":
      return { kind: "wallet", start: "drain" };
    default:
      return { kind: task };
  }
}

/** Whether `task` shows the card's wallet: it is connected for those only. */
function showsWallet(task: CardTask): boolean {
  return task === "recharge" || task === "return" || task === "empty";
}

const TITLES: Record<CardTask, string> = {
  limits: "cards.home.limits",
  customize: "cards.customize.title",
  advanced: "cards.home.advanced",
  recharge: "cards.wallet.recharge",
  return: "cards.home.withdraw",
  empty: "cards.home.withdraw",
  delete: "cards.home.delete"
};

/**
 * A panel's dialog on a desktop, as wide as its content. A task as wide as the pages it leads to,
 * so that the dialog keeps its width from one to the other: "Advanced settings" as its pages, the
 * three limits of "Limits" as a limit's form (480, not the Sheet's 440). A width that changed with
 * the page would be taken at once, its height with it (sheet-layout.web.ts eases a height only at
 * the same width), the page left laid out again at the new width as it fades.
 */
function dialogWidthOf(mode: Mode): number | undefined {
  switch (mode.kind) {
    case "wallet":
    case "advanced":
    case "payees":
    case "relay":
    case "relayForm":
    case "delete":
      return 560;
    case "limits":
    case "limit":
    case "customize":
      return 480;
    default:
      return undefined;
  }
}

/**
 * A card's panel of "Cards", opened on one of its tasks (CardsScreen.tsx): its limits, its name,
 * its relay, its wallet's top-up or return, its deletion (its history is a screen of its own,
 * CardHistoryScreen.tsx). Being migrated from v2, a card shows its wallet and nothing that takes it
 * out of the list: its wallet always in sight, as a payment the v2 server makes late would reach a
 * wallet no screen shows. The panel cannot be closed while an operation runs.
 */
export function CardSheet({
  card,
  task,
  sync,
  others = [],
  limits,
  onWalletChange,
  onWriting,
  onClose
}: {
  card: CardState | null;
  task: CardTask;
  /**
   * The card's payments as "Cards" read them for its "Limits" (useCardLimitLog): its limits' panel
   * counts the same, read once for both.
   */
  limits: CardLimitRead;
  /** How the card's channel was last synced with its relay: "Advanced settings" says it. */
  sync?: ChannelSync;
  /** The labels of the account's other cards: "Customize" says a name one of them shows. */
  others?: readonly string[];
  /**
   * Sats may have moved in or out of the card's wallet (a transfer of its panel ended, sent or
   * not): "Cards" reads its balance again, the panel open or closed after.
   */
  onWalletChange: () => void;
  /**
   * Whether a card is being written to, as it starts and ends: deleted (held to the phone or not),
   * or programmed for another relay. Its record says it deleted or reset meanwhile.
   */
  onWriting?: (writing: boolean) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { notify } = useNotifications();
  const desktop = useIsDesktop();
  // Not known yet: as a device that reads cards, whose steps say it when it reads none.
  const reads = useReadsCards() !== false;
  const [busy, setBusy] = useState(false);
  // Each opening starts on its task, counted (`round`): what an operation of an earlier one comes
  // to never changes a later one (setModeOf). Set while rendering, as React advises for state that
  // follows a prop: the panel keeps what it showed while it slides away.
  const opening = card ? `${card.cardId}/${task}` : null;
  const [shown, setShown] = useState(() => ({ opening, round: 0, mode: modeOf(task) }));
  if (opening !== shown.opening) {
    setShown({
      opening,
      round: shown.round + 1,
      mode: opening !== null ? modeOf(task) : shown.mode
    });
  }
  const { round, mode } = shown;
  const setModeOf = (of: number) => (next: Mode) =>
    setShown((current) => (current.round === of ? { ...current, mode: next } : current));
  const setMode = setModeOf(round);
  // The opening shown now, for an operation of an earlier one that would close the panel when over.
  const current = useRef(round);
  useEffect(() => {
    current.current = round;
  }, [round]);
  const closeOf = (of: number) => () => {
    if (current.current === of) onClose();
  };
  // "Change relay": its form in the panel, then its steps over it, from the card on.
  const relay = useRelayMove(round);
  const { move } = relay;
  const relaySteps =
    move.phase === "running" || move.phase === "done" || move.phase === "failed" ? move : null;
  // "Delete the card": held to the phone, its steps over the panel; without it, its dialog over it
  // first. "I have the card with me" chosen at first (on the web: the phone's steps).
  const deletion = useCardDeletion(round);
  const { run } = deletion;
  const deletionSteps =
    run.phase === "running" || ((run.phase === "done" || run.phase === "failed") && run.inHand)
      ? run
      : null;
  const [choice, setChoice] = useState({ round, inHand: true, asking: false });
  const deleteChoice = choice.round === round ? choice : { round, inHand: true, asking: false };
  const setDeleteChoice = (next: Partial<Omit<typeof deleteChoice, "round">>) =>
    setChoice({ ...deleteChoice, ...next });
  const deleting = run.phase === "deleting" || run.phase === "running";
  // The auto-lock never closes the account while the card is deleted (held to the phone or not).
  useEffect(() => (deleting ? holdActivity() : undefined), [deleting]);
  // From the move's checks: its card is recorded reset as it is asked for, in the same render as
  // its steps show, a render before "Cards" would hear of a phase set then.
  const writing = deleting || move.phase === "checking" || move.phase === "running";
  useEffect(() => {
    if (!writing) return;
    onWriting?.(true);
    return () => onWriting?.(false);
  }, [writing, onWriting]);
  // Deleted: the panel closes, "Cards" says so (and shows the card in its place); held to the
  // phone, once "Done"; without it, at once, unless the panel was opened again meanwhile. Its
  // deletion not taken by a majority of the relays yet, or its data not all proven erased: said
  // too, as its steps do.
  const deletedOf =
    (of: number) =>
    (done: CardState, { erased, pending }: DeletionOutcome) => {
      if (current.current !== of) return;
      notify({
        tone: erased && !pending ? "success" : "warning",
        title: t("cards.delete.done", { name: cardLabel(done, t) }),
        body: pending
          ? t("cards.delete.pendingCaption")
          : erased
            ? undefined
            : t("cards.delete.steps.erasedLaterCaption"),
        key: "card-deleted"
      });
      onClose();
    };
  // "Customize"'s draft, and the image being framed: the framing shows over the panel, in a Modal
  // nested in the panel's (Sheet's `over`: iOS shows no Modal opened beside one that leaves), the
  // draft kept for its return. On a desktop, in the panel's dialog itself: its close button, the
  // scrim and Escape go back to "Customize".
  const [customizing, setCustomizing] = useState<{ round: number; draft: CustomizeDraft } | null>(
    null
  );
  const [framing, setFraming] = useState<{ round: number; source: CardImageSource } | null>(null);
  // An earlier opening's framing is let go: its decoded image freed (the effect below).
  if (framing !== null && framing.round !== round) setFraming(null);
  const draft =
    customizing?.round === round ? customizing.draft : card ? customizeDraftOf(card) : null;
  const setDraft = (next: CustomizeDraft) => setCustomizing({ round, draft: next });
  const framed = framing?.round === round ? framing.source : null;
  const framedHere = desktop && framed !== null;
  const frameLabel =
    (draft ? cardNameOf(draft.name) : null) || (card ? cardLabel({ ...card, name: "" }, t) : "");
  const useFramed = (image: FramedImage) => {
    if (draft) setDraft(draftWithImage(draft, image));
    setFraming(null);
  };
  // The image decoded for the framing is freed once it is left, or the panel is.
  useEffect(() => {
    if (!framing) return;
    const { source } = framing;
    return () => source.release();
  }, [framing]);
  const cardHolder = useCardHolder();
  // The card's wallet's step: its title and way back (CardWalletFlow.tsx), told with the visit of
  // the wallet they are of (its mode, a new one each time): never an earlier visit's.
  const [walletHeader, setWalletHeader] = useState<{ of: Mode; header: WalletHeader } | null>(null);
  const walletStep = walletHeader?.of === mode ? walletHeader.header : null;
  const walletBack = walletStep?.back ?? null;
  // The wallet's dialogs on a desktop: "Top up Daily", "Withdraw" (to any other wallet, the main
  // balance one of its ways), "Withdraw to my main balance" to empty a merchant's card before its
  // deletion.
  const walletTitle =
    mode.kind !== "wallet"
      ? null
      : mode.start !== "recharge"
        ? cardHolder
          ? // No main balance: "Withdraw", "Empty the card".
            t(mode.start === "drain" ? "cards.wallet.emptyCard" : "cards.home.withdraw")
          : t(desktop && mode.start === "drain" ? "cards.wallet.return" : "cards.home.withdraw")
        : desktop && card
          ? t("cards.wallet.rechargeCard", { name: escapeRichText(cardLabel(card, t)) })
          : t("cards.wallet.recharge");
  // "Top up Daily": the card's name in orange; the name, typed by a user, as it is
  // (escapeRichText). A step's own title has none.
  const walletTitleMarkup =
    mode.kind === "wallet" && mode.start === "recharge" && desktop && card !== null;
  // A limit's form: its title, and the way back to the three limits.
  const limit = mode.kind === "limit" ? mode.limit : null;
  const title = framedHere
    ? t("cards.frame.title")
    : limit
      ? t(LIMIT_TITLES[limit])
      : walletTitle !== null
        ? (walletStep?.title ?? walletTitle)
        : mode.kind === "relayForm"
          ? t("cards.relay.change")
          : mode.kind === "relay"
            ? t("cards.home.relay")
            : mode.kind === "payees"
              ? payeesPageTitle(mode.page, t)
              : mode.kind === "delete" && card
                ? t("cards.delete.title", {
                    name: cardLabel(run.phase === "idle" ? card : run.card, t)
                  })
                : t(TITLES[task] as "cards.home.limits");
  const held = busy || deleting;
  // "Advanced settings"'s pages lead back to it; it says the card it is of, as "Payments without
  // confirmation" does (but on a merchant's page, whose name is the title).
  const toAdvanced =
    task === "advanced"
      ? { label: t("cards.sheet.back"), onPress: () => setMode({ kind: "advanced" }) }
      : undefined;
  const subtitle =
    card && (mode.kind === "advanced" || (mode.kind === "payees" && mode.page.kind !== "payee"))
      ? cardOfLabel(card, t)
      : undefined;
  return (
    <Sheet
      title={title}
      subtitle={subtitle}
      // Only the wallet's own title carries `<accent>`: no other title (a step's included) has it.
      titleMarkup={walletTitleMarkup && title === walletTitle}
      closeLabel={t("cards.sheet.close")}
      visible={card !== null}
      onClose={framedHere ? () => setFraming(null) : onClose}
      dismissible={!held}
      dialogWidth={framedHere ? 560 : dialogWidthOf(mode)}
      // While held, shown disabled (Sheet).
      back={
        framedHere
          ? undefined
          : limit
            ? { label: t("cards.limits.back"), onPress: () => setMode({ kind: "limits" }) }
            : walletBack
              ? { label: t("cards.sheet.back"), onPress: walletBack }
              : mode.kind === "relayForm"
                ? {
                    label: t("cards.sheet.back"),
                    onPress: () => {
                      // Its checks under way are let go: they ask nothing of the card.
                      relay.leave();
                      setMode({ kind: "relay" });
                    }
                  }
                : mode.kind === "payees" && mode.page.kind !== "list"
                  ? {
                      label: t("cards.sheet.back"),
                      onPress: () => setMode({ kind: "payees", page: { kind: "list" } })
                    }
                  : mode.kind === "payees" || mode.kind === "relay"
                    ? toAdvanced
                    : undefined
      }
      over={
        framed && !framedHere ? (
          <CardImageFramer
            source={framed}
            label={frameLabel}
            onUse={useFramed}
            onCancel={() => setFraming(null)}
          />
        ) : card && relaySteps ? (
          <RelayMoveSteps
            card={card}
            move={relaySteps}
            onRetry={() => relay.retry(card)}
            onLeave={() => {
              if (relay.leave()) onClose();
            }}
            onFinish={() => {
              notify({
                tone: "success",
                title: t("cards.relay.moved", { host: relaySteps.host }),
                key: "card-relay-moved"
              });
              onClose();
            }}
          />
        ) : deletionSteps ? (
          <DeleteCardSteps
            run={deletionSteps}
            onRetry={() => deletion.retry()}
            onLeave={() => {
              if (deletion.leave()) onClose();
            }}
            onNoCard={() => {
              // Back to the panel, its dialog without the card over it.
              if (deletion.leave()) setDeleteChoice({ inHand: false, asking: true });
            }}
            onFinish={() =>
              deletedOf(round)(
                deletionSteps.card,
                deletionSteps.phase === "done"
                  ? deletionSteps.outcome
                  : { erased: true, pending: false }
              )
            }
          />
        ) : card && deleteChoice.asking ? (
          // Drawn while asked only, as every panel over this one: one drawn here hides the panel
          // from screen readers (Sheet's `over`).
          <ConfirmDialog
            visible
            title={t("cards.delete.withoutTitle", { name: cardLabel(card, t) })}
            body={t("cards.delete.withoutBody")}
            confirmLabel={t("cards.delete.withoutConfirm")}
            confirmIcon="trash-can"
            cancelLabel={t("cards.sheet.back")}
            onConfirm={() => {
              setDeleteChoice({ asking: false });
              deletion.start(card, false, deletedOf(round));
            }}
            onCancel={() => setDeleteChoice({ asking: false })}
            testID="card-delete-without"
            confirmTestID="card-delete-without-confirm"
          />
        ) : null
      }
      // The framing over "Customize" on a desktop, the deletion, the card's tasks (CardPanel's own
      // pages): one fades into the other.
      page={framedHere ? "framer" : card && mode.kind === "delete" ? "delete" : `card:${round}`}
      testID="card-sheet"
    >
      {framedHere ? (
        <CardImageFramerDialog
          source={framed}
          label={frameLabel}
          onUse={useFramed}
          onCancel={() => setFraming(null)}
          onBusy={setBusy}
        />
      ) : card && mode.kind === "delete" ? (
        <DeleteCardPanel
          run={run}
          card={card}
          canHold={reads}
          inHand={deleteChoice.inHand}
          onInHand={(inHand) => setDeleteChoice({ inHand })}
          onDelete={() => {
            // Where no card is read (the web app, an iPad), "I don't have it" is its confirmation:
            // deleted at once.
            if (!reads) deletion.start(card, false, deletedOf(round));
            else if (deleteChoice.inHand) deletion.start(card, true);
            else setDeleteChoice({ asking: true });
          }}
          onRetry={() => deletion.retry(deletedOf(round))}
          onClose={onClose}
        />
      ) : card ? (
        <CardPanel
          key={round}
          card={card}
          task={task}
          mode={mode}
          setMode={setMode}
          onBusy={setBusy}
          onWalletChange={onWalletChange}
          onWalletHeader={(header) => setWalletHeader({ of: mode, header })}
          onClose={closeOf(round)}
          others={others}
          draft={draft}
          onDraft={setDraft}
          onFrame={(source) => setFraming({ round, source })}
          relay={relay}
          sync={sync}
          limits={limits}
        />
      ) : null}
    </Sheet>
  );
}

function CardPanel({
  card,
  task,
  mode,
  setMode,
  onBusy,
  onWalletChange,
  onWalletHeader,
  onClose,
  others,
  draft,
  onDraft,
  onFrame,
  relay,
  sync,
  limits
}: {
  card: CardState;
  task: CardTask;
  mode: Mode;
  setMode: (mode: Mode) => void;
  onBusy: (busy: boolean) => void;
  onWalletChange: () => void;
  /** The card's wallet's step: the panel's title and way back. */
  onWalletHeader: (header: WalletHeader) => void;
  onClose: () => void;
  others: readonly string[];
  draft: CustomizeDraft | null;
  onDraft: (draft: CustomizeDraft) => void;
  onFrame: (source: CardImageSource) => void;
  /** "Change relay" (useRelayMove.ts), kept by the sheet that shows its steps. */
  relay: ReturnType<typeof useRelayMove>;
  sync: ChannelSync | undefined;
  limits: CardLimitRead;
}) {
  const { t } = useTranslation();
  const reads = useReadsCards() !== false;
  // The card's wallet, connected while a task that shows it does; a transfer sending keeps it open.
  const wallet = useCardWallet(showsWallet(task) ? card : null);
  const [walletBusy, setWalletBusy] = useState(false);
  // A form saving: its panel stays as it is until it is done (a limit's passkey is asked over it).
  const [formBusy, setFormBusy] = useState(false);
  // A relay change, from the card on (its steps over the panel): the card is asked for, then
  // written to. Its checks before can be left: the attempt left then asks nothing of the card
  // (useRelayMove.ts).
  const moving = relay.move.phase === "running";
  const busy = walletBusy || formBusy || moving;
  useEffect(() => {
    onBusy(busy);
    // Never left busy once it is gone ("Frame the image" takes its place on a desktop).
    return () => onBusy(false);
  }, [busy, onBusy]);
  // A transfer of its wallet's flow ended (its passkey, then its payment: the panel was held):
  // told as it ends, whichever way the panel closes after (its notification, its button, the scrim).
  const transferring = useRef(false);
  useEffect(() => {
    if (walletBusy) {
      transferring.current = true;
    } else if (transferring.current) {
      transferring.current = false;
      onWalletChange();
    }
  }, [walletBusy, onWalletChange]);
  // The auto-lock never closes the account while the card is checked for, or programmed.
  const held = busy || relay.move.phase === "checking";
  useEffect(() => (held ? holdActivity() : undefined), [held]);
  /** Back to where the task began; a limit's form, to the three limits. */
  const back = () => setMode(modeOf(task));

  const fail = (error: unknown, retry: (() => void) | null = null) => {
    logFailure("A card operation failed", error);
    setMode({
      kind: "failed",
      reason: error instanceof PairingError ? error.reason : "failed",
      retry
    });
  };

  // Its tasks' pages fade into each other, this panel and its card's wallet held throughout; the
  // three limits and a limit's form are one task's (LimitsTask: its pages, its payments read once).
  const content = (): ReactNode => {
    switch (mode.kind) {
      case "limits":
      case "limit":
        return (
          <LimitsTask
            card={card}
            limit={mode.kind === "limit" ? mode.limit : null}
            limits={limits}
            onEdit={(limit) => setMode({ kind: "limit", limit })}
            onBusy={setFormBusy}
            onBack={back}
            onClose={onClose}
            onFail={fail}
          />
        );
      case "customize":
        return (
          <CustomizePanel
            card={card}
            others={others}
            draft={draft ?? customizeDraftOf(card)}
            onDraft={onDraft}
            onFrame={onFrame}
            onBusy={setFormBusy}
            onDone={onClose}
          />
        );
      case "advanced":
        return (
          <RowsCard ringed>
            <PayeesRow
              card={card}
              round={0}
              separated
              onPress={() => setMode({ kind: "payees", page: { kind: "list" } })}
            />
            <RelayRow card={card} sync={sync} onPress={() => setMode({ kind: "relay" })} />
          </RowsCard>
        );
      case "payees": {
        // Its books are the account's: "Cards" shows nothing of a card without it.
        const walletId = getAccountWalletId();
        return walletId === null ? null : (
          <PayeesPanel
            walletId={walletId}
            card={card}
            panel={mode.page}
            onPanel={(page) => setMode({ kind: "payees", page })}
            onBusy={setFormBusy}
          />
        );
      }
      case "relay":
      case "relayForm":
        // A card is programmed held to the phone: the web app, which reads no card, shows its relay
        // and leads "Change relay" to the phone.
        if (Platform.OS === "web") {
          return mode.kind === "relay" ? (
            <RelayOnComputer card={card} onChange={() => setMode({ kind: "relayForm" })} />
          ) : (
            <RelayChangeOnPhone card={card} />
          );
        }
        // No new keys from "Relay and programming": a card in doubt is emptied, deleted and added
        // again.
        if (mode.kind === "relay") {
          return (
            <RelayStatus
              card={card}
              onChange={() => {
                relay.clear();
                setMode({ kind: "relayForm" });
              }}
            />
          );
        }
        // A device that reads no card (an iPad) leads "Change relay" to the phone as the web
        // app does, and says why; the card's state on it is checked as on a phone, which syncs its
        // cards the same (sync.ts).
        if (!reads) {
          return <RelayChangeOnPhone card={card} note={t("cards.relay.deviceNote")} />;
        }
        return (
          <RelayChangeForm
            card={card}
            move={relay.move}
            onProgram={(host) => relay.start(card, host)}
            onEdit={relay.clear}
          />
        );
      case "wallet":
        if (wallet.loaded.status === "failed") {
          return (
            <View style={styles.content}>
              <Callout tone="error" testID="card-wallet-failed">
                {t("cards.wallet.failed")}
              </Callout>
              <Button variant="secondary" onPress={wallet.retry} testID="card-wallet-retry">
                {t("card.retry")}
              </Button>
            </View>
          );
        }
        if (wallet.loaded.status === "loading") {
          return (
            <View style={styles.waiting} testID="card-wallet-loading">
              <Spinner size={18} />
            </View>
          );
        }
        return (
          <CardWalletFlow
            card={card}
            label={cardLabel(card, t)}
            lease={wallet.loaded.lease}
            balanceSats={wallet.loaded.view.balanceSats}
            start={mode.start}
            onBusy={setWalletBusy}
            onHeader={onWalletHeader}
            // What its transfers moved was told as each ended (above); what reached it meanwhile is
            // read as the panel closes ("Cards").
            onDone={onClose}
            // A transfer ended closes the panel at once: what it moved read again all the same, as
            // a transfer ended in the panel is (the panel gone, its effect above never runs).
            onEnded={() => {
              onWalletChange();
              onClose();
            }}
          />
        );
      case "delete":
        // Drawn by the sheet itself (DeleteCardPanel.tsx), its steps and dialog over it.
        return null;
      case "failed":
        return (
          <View style={styles.content}>
            <Callout tone="error" title={t("cards.sheet.failedTitle")} testID="card-failed">
              {/* A limit not saved: a reason of its own said as it is, anything else the change's
                (never the pairing's failure). */}
              {mode.reason === "failed"
                ? t("cards.sheet.changeFailed")
                : t(`card.failure.${mode.reason}`)}
            </Callout>
            <View style={styles.actions}>
              {mode.retry ? (
                <Button onPress={mode.retry} testID="card-retry">
                  {t("card.retry")}
                </Button>
              ) : null}
              <Button
                variant={mode.retry ? "text" : "secondary"}
                size={mode.retry ? "md" : undefined}
                onPress={back}
                testID="card-back"
              >
                {t("cards.sheet.back")}
              </Button>
            </View>
          </View>
        );
    }
  };
  return <SheetPages page={pageOf(mode)}>{content()}</SheetPages>;
}

/** CardPanel's page of `mode`: a limit's form is the limits' task's (its own pages). */
function pageOf(mode: Mode): string {
  switch (mode.kind) {
    case "limit":
      return "limits";
    case "wallet":
      return `wallet:${mode.start}`;
    default:
      return mode.kind;
  }
}

/**
 * "Limits": the three limits (`limit` null), or the form of one, the card's payments read once for
 * both, and for "Cards"'s "Limits" (`limits`, LimitsPanel.tsx).
 */
function LimitsTask({
  card,
  limit,
  limits,
  onEdit,
  onBusy,
  onBack,
  onClose,
  onFail
}: {
  card: CardState;
  limit: CardLimit | null;
  limits: CardLimitRead;
  onEdit: (limit: CardLimit) => void;
  onBusy: (busy: boolean) => void;
  onBack: () => void;
  onClose: () => void;
  onFail: (error: unknown) => void;
}) {
  const { log, now, retry } = limits;
  // The three limits and a limit's form fade into each other, the payments read once.
  return (
    <SheetPages page={limit ?? "overview"}>
      {limit === null ? (
        <LimitsOverview
          card={card}
          limitLog={log}
          now={now}
          onEdit={onEdit}
          onRetry={retry}
          onClose={onClose}
        />
      ) : (
        <LimitEditor
          card={card}
          limit={limit}
          usage={log.phase === "ready" ? cardLimitUsage(card, log.log, now) : null}
          onBusy={onBusy}
          onDone={onBack}
          onFail={onFail}
        />
      )}
    </SheetPages>
  );
}

const styles = StyleSheet.create({
  content: { gap: space[5] },
  actions: { gap: 10 },
  waiting: { alignItems: "center", paddingVertical: space[4] }
});
