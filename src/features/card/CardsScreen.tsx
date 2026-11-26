import {
  useIsFocused,
  useLocalSearchParams,
  useNavigation,
  usePathname,
  useRouter
} from "expo-router";
import type { TFunction } from "i18next";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Platform, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { CardPayArt, CardProgramArt, CardRechargeArt } from "@/components/illustrations/cards";
import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { Arrival } from "@/components/ui/Arrival";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Icon, type IconName } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";
import { outOfReach } from "@/components/ui/reach";
import { escapeRichText } from "@/components/ui/RichText";
import { LoadingScene, useLoadingScene } from "@/components/ui/LoadingScene";
import { Spinner } from "@/components/ui/Spinner";
import { StepGuide } from "@/components/ui/StepGuide";
import { Switch } from "@/components/ui/Switch";
import { OtherAccountError, getAccountWalletId } from "@/features/account/session";
import { guideStep } from "@/features/empty-states/guide";
import { toUnlockFailure, unlockFailureMessage } from "@/features/account/usePasskeyAccount";
import { DockScrollView } from "@/features/navigation/dock-area";
import { destinationOf } from "@/features/navigation/destinations";
import { useHeaderNavigation } from "@/features/navigation/header-navigation";
import { useNotifications } from "@/features/notifications/NotificationsProvider";
import { SettingsGroup, SettingsRow } from "@/features/settings/parts";
import { PosFrame, type HeaderAction } from "@/features/terminal/PosFrame";
import { useCardHolder, useMainBalanceOffered, usePos } from "@/features/terminal/pos";
import { useWalletFormat } from "@/features/wallet/format";
import { recoverCardFunds } from "@/features/wallet/funds-recovery-sync";
import { formatSats } from "@/features/wallet/send/amount";
import { PasskeyError } from "@/lib/breez/errors";
import { browserDevice } from "@/lib/browser-device";
import { NewerRecordError } from "@/lib/nostr/record";
import type { CardState } from "@/lib/card/card-record";
import { sameCardWallet } from "@/lib/card/keys";
import { cardOfPrintedNumber, printedScanOf } from "@/lib/card/legacy-link";
import { formatInteger } from "@/lib/locale/format";
import { logFailure } from "@/lib/log/log";
import { probeAvailable } from "@/lib/card/probe-store";
import {
  AMOUNT_EM,
  control,
  gutter,
  makeStyles,
  proseLineHeight,
  radius,
  sans,
  space,
  TITLE_EM,
  tracked,
  tracking,
  type,
  useTheme
} from "@/theme";

import { AddCardDialog } from "./AddCardDialog";
import { AppStoreLink, pairOnPhoneKey, storePhoneOf } from "./AppStoreLink";
import { CardCarousel, CarouselDots, type CarouselCard } from "./CardCarousel";
import { CardOrderSheet } from "./CardOrderSheet";
import { CardShop } from "./CardShop";
import { CardFaceView, CardUnderFace } from "./CardFaceView";
import { CardHistoryList } from "./CardHistoryScreen";
import { cardLabel, cardOfLabel } from "./card-label";
import {
  AdvancedRow,
  Group,
  Row,
  RowIcon,
  RowTexts,
  RowsCard,
  Separator,
  WholeSeparators,
  rowStyle
} from "./CardRows";
import { LimitsPreview, useCardLimitLog, type CardLimitRead } from "./LimitsPanel";
import { CardSheet, type CardTask } from "./CardSheet";
import { CardThumbnails } from "./CardThumbnails";
import { NothingToReturnError, type CardWalletOf } from "./card-wallet";
import {
  useCardWallets,
  useHeldAccountWallet,
  type CardWalletLoaded,
  type HeldCardWallet
} from "./CardWalletPanel";
import { ErasedDrainSheet } from "./ErasedDrainSheet";
import { resetWallets, returnErasedFunds, type ErasedFunds } from "./erased-funds";
import { recordCardMovementsDaily } from "./history-sync";
import { setCardSuspended } from "./manage";
import { PairingError } from "./pairing";
import type { ChannelSync } from "./relay-sync";
import { withCurrentIds } from "./reorder";
import { saveCardOrder, withCardAccess } from "./states";
import { useCards } from "./useCards";
import { useErasedFunds } from "./useErasedFunds";
import { readsCards, useReadsCards } from "./useReadsCards";
import { wakeJournalShown } from "./wake-report";

/**
 * "Cards", a destination of the navigation ("Manage"): the account's cards in a carousel, then the
 * one chosen: its balance, what moves it ("Top up", "Withdraw", "History"), "Security" ("Pause",
 * "Limits"), "Card" ("Customize"), "Advanced settings" ("Payments without confirmation", "Relay and
 * programming", in its panel), "Delete the card"; the carousel's last place adds a card. On the web
 * app too, from the account's relays: all of it but what needs the card held to the phone, which it
 * says to do there, as the app does on a device that reads no card (an iPad, useReadsCards.ts). On
 * a desktop, its page: the cards side by side, then the one chosen with its balance and its whole
 * history, its settings in a column on the right; its panels open as dialogs.
 */
export function CardsScreen() {
  const styles = useStyles();
  const { t } = useTranslation();
  const router = useRouter();
  const desktop = useIsDesktop();
  // Of this screen's own route: "Cards" stays mounted while another destination shows (AppShell),
  // whose route the router's setParams would change.
  const navigation = useNavigation<{
    setParams: (params: AddedParams | PrintedParams) => void;
  }>();
  const focused = useIsFocused();
  const visits = useVisits();
  // A card "Add a card" just added (PairCardScreen.tsx), once: the parameters go once shown, a
  // later visit opening nothing. So does the card a v2 card's printed link names.
  const { added, open, at, printed, scan } = useLocalSearchParams<AddedParams & PrintedParams>();
  // Left before it showed (another destination chosen while the cards were read): it shows nothing,
  // never a panel at a later visit, nor "Add a card".
  useEffect(() => {
    if (!focused && added !== undefined) {
      navigation.setParams({ added: undefined, open: undefined, at: undefined });
    }
  }, [focused, added, navigation]);
  useEffect(() => {
    if (!focused && printed !== undefined) {
      navigation.setParams({ printed: undefined, scan: undefined });
    }
  }, [focused, printed, navigation]);
  // Cards are programmed by the phone, held to it: the web app has no NFC, nor has an iPad
  // (useReadsCards).
  const native = Platform.OS !== "web";
  const reads = useReadsCards();
  // On a computer's web app, the header's "Add a card" opens its dialog (CardsHome), asked anew at
  // each press; so does the app's on a device that reads no card, as found when pressed.
  const [addAsked, setAddAsked] = useState(0);
  const askAdding = () => setAddAsked((count) => count + 1);
  const add = native
    ? () => {
        void readsCards().then((present) => {
          if (present) router.push("/cards/pair");
          else askAdding();
        });
      }
    : null;
  const addFromHeader = add ?? (desktop ? askAdding : null);
  const ordering = useCardOrdering();
  // "Organise": from two cards. On a phone, its panel (CardOrderSheet.tsx, asked anew at each
  // press); on a desktop, the row of cards itself, "Cancel" and "Save" in the header meanwhile.
  const orderable = ordering.wallets.length >= 2;
  // A card holder's phone, without a dock: "Settings" on the right, "Organise" on the left.
  const headerNavigation = useHeaderNavigation();
  // The merchant map (MerchantMapScreen.tsx): a map's icon in the header, whatever the cards shown
  // (none yet included). On a phone, beside the header's other action, which keeps the edge; on a
  // desktop, first of the header's actions, as tall as its buttons.
  const openMerchantMap = () => router.push("/cards/map");
  const merchantMap: HeaderAction = {
    icon: "map",
    label: t("cards.map.title"),
    onPress: openMerchantMap,
    testID: "cards-merchant-map"
  };
  const [orderAsked, setOrderAsked] = useState(0);
  const [draft, setDraft] = useState<string[] | null>(null);
  // Left (another destination) or a phone's window: the row's order not saved is dropped.
  if (draft !== null && (!focused || !desktop)) setDraft(null);
  const organizing = draft !== null && desktop;
  const header = organizing ? (
    <View style={styles.headerActions}>
      <Button
        variant="secondary"
        size="md"
        fullWidth={false}
        disabled={ordering.saving}
        onPress={() => setDraft(null)}
        testID="cards-order-cancel"
      >
        {t("cards.order.cancel")}
      </Button>
      <Button
        size="md"
        fullWidth={false}
        loading={ordering.saving}
        onPress={() => {
          // The order as it was: nothing to save (as the phone's panel).
          if (ordering.unchanged(draft)) {
            setDraft(null);
            return;
          }
          void ordering.save(draft).then((saved) => {
            if (saved) setDraft(null);
          });
        }}
        testID="cards-order-save-header"
      >
        {t("cards.order.save")}
      </Button>
    </View>
  ) : (
    <View style={styles.headerActions}>
      <IconButton
        icon="map"
        label={t("cards.map.title")}
        tone="outline"
        size={18}
        onPress={openMerchantMap}
        style={styles.headerIcon}
        testID="cards-merchant-map-header"
      />
      {orderable ? (
        <Button
          variant="secondary"
          // Left and right: on a desktop, the row of cards is ordered in place (the phone's panel,
          // a column: up and down).
          icon="arrows-left-right"
          size="md"
          fullWidth={false}
          onPress={() => setDraft(ordering.wallets.map(({ cardId }) => cardId))}
          testID="cards-organize-header"
        >
          {t("cards.order.organize")}
        </Button>
      ) : null}
      {addFromHeader ? (
        // Filled beside the chosen card's "Top up": an exception to one filled primary button a
        // screen.
        <Button
          icon="plus"
          size="md"
          fullWidth={false}
          onPress={addFromHeader}
          testID="cards-add-header"
        >
          {t("cards.add")}
        </Button>
      ) : null}
    </View>
  );
  const organize: HeaderAction | undefined =
    orderable && !desktop
      ? {
          icon: "arrows-up-down",
          label: t("cards.order.organizeA11y"),
          onPress: () => setOrderAsked((count) => count + 1),
          testID: "cards-organize"
        }
      : undefined;
  const headerEdge = headerNavigation?.settings ?? organize;
  return (
    <PosFrame
      title={t("cards.title")}
      desktopTitle={t("cards.title")}
      subtitle={organizing ? t("cards.order.rowLead") : undefined}
      desktopAside={header}
      leading={headerNavigation ? organize : undefined}
      trailing={headerEdge ? [merchantMap, headerEdge] : merchantMap}
      // On a phone, the gutter inside the scroll view (its sections, the notices), the carousel's
      // cards beside the chosen one up to the screen's edges.
      flush="mobile"
      // The page from its top, as wide as the window: not the frame's centred body.
      contentStyle={desktop ? styles.desktopContent : undefined}
    >
      <CardsHome
        // Each visit reads the cards afresh, as when it was opened from "Settings": their states
        // and whom they pay read again (what another device changed meanwhile).
        key={visits}
        added={focused && added && at ? { cardId: added, recharge: open === "recharge", at } : null}
        onAddedShown={() =>
          navigation.setParams({ added: undefined, open: undefined, at: undefined })
        }
        printed={focused ? printedScanOf(printed, scan) : null}
        onPrintedShown={() => navigation.setParams({ printed: undefined, scan: undefined })}
        onAddPrinted={addFromHeader}
        onAdd={add}
        addAsked={addAsked}
        onFinishMigration={
          native && reads !== false
            ? (cardId) => router.push({ pathname: "/cards/pair", params: { finish: cardId } })
            : null
        }
        onHistory={(cardId) =>
          router.push({ pathname: "/cards/history/[id]", params: { id: cardId } })
        }
        onProbe={() => router.push("/cards/extension-test")}
        onWakes={() => router.push("/cards/wake-journal")}
        onWallets={ordering.onWallets}
        orderAsked={orderAsked}
        onSaveOrder={ordering.save}
        organizing={organizing ? { ids: draft, onMove: setDraft, saving: ordering.saving } : null}
      />
    </PosFrame>
  );
}

/**
 * The cards' order saved from "Cards" ("Organise"): the cards' wallets "Cards" shows, as CardsHome
 * tells them (`onWallets`, a key: `cardId:generation`, comma-separated), and `save`, which saves
 * `ids` (first to last; the cards shown it does not name after them, as they are), says it in a
 * notification, and resolves whether it was saved.
 */
function useCardOrdering(): {
  wallets: CardWalletOf[];
  onWallets: (key: string) => void;
  saving: boolean;
  save: (ids: readonly string[]) => Promise<boolean>;
  /** Whether `ids` (completed as `save` does) is the order shown now. */
  unchanged: (ids: readonly string[]) => boolean;
} {
  const { t } = useTranslation();
  const { notify } = useNotifications();
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const wallets = walletsOfKey(key);
  const shownIds = wallets.map(({ cardId }) => cardId);
  const unchanged = (ids: readonly string[]) =>
    withCurrentIds(ids, shownIds).join() === shownIds.join();
  const save = async (ids: readonly string[]) => {
    const byId = new Map(wallets.map((wallet) => [wallet.cardId, wallet]));
    const order = withCurrentIds(ids, shownIds).map((id) => byId.get(id)!);
    // No card shown (read again meanwhile): nothing to order, never an empty order written.
    if (order.length === 0) return false;
    setSaving(true);
    try {
      await withCardAccess((access) => saveCardOrder(access, order));
      notify({ tone: "success", title: t("cards.order.saved"), key: "card-order" });
      return true;
    } catch (error) {
      logFailure("Saving the cards' order failed", error);
      notify({
        tone: "error",
        title: t("cards.order.failedTitle"),
        body: t(error instanceof NewerRecordError ? "cards.order.newer" : "cards.order.unsaved"),
        key: "card-order"
      });
      return false;
    } finally {
      setSaving(false);
    }
  };
  return { wallets, onWallets: setKey, saving, save, unchanged };
}

/** The cards' wallets of their key (useCardOrdering): `cardId:generation`, comma-separated. */
function walletsOfKey(key: string): CardWalletOf[] {
  if (key === "") return [];
  return key.split(",").map((wallet) => {
    const [cardId, generation] = wallet.split(":");
    return { cardId: cardId!, walletGeneration: Number(generation) };
  });
}

/** "Cards" opened on a card just added: chosen, its "Top up" open (`open`). */
type AddedParams = { added?: string; open?: string; at?: string };

/**
 * "Cards" opened by the link printed on a v2 card (src/app/+native-intent.ts, printedCardHref): its
 * printed number (`printed`), and which scan of this run of the app (`scan`). Untrusted, a list
 * when given twice: read through printedScanOf.
 */
type PrintedParams = { printed?: string | string[]; scan?: string | string[] };

/**
 * How many times "Cards" was shown again from another destination: its screen stays mounted while
 * another shows (AppShell). Not when the screens it opens close (a pairing, the tests): what they
 * changed shows already (useCards follows the states written).
 */
function useVisits(): number {
  const shown = destinationOf(usePathname()) === "cards";
  const [visits, setVisits] = useState({ shown, count: 0 });
  if (visits.shown !== shown) setVisits({ shown, count: visits.count + (shown ? 1 : 0) });
  return visits.count;
}

/** What keeps a card from paying, as its pill says it ("Paused"). */
type CardStatusMark = {
  kind: "migrating" | "suspended";
  label: string;
  icon: IconName;
};

/** What keeps a card from paying, null when nothing does. */
function statusOf(card: CardState, t: TFunction): CardStatusMark | null {
  if (card.status === "migrating") {
    return { kind: "migrating", label: t("cards.status.migrating"), icon: "hourglass-half" };
  }
  if (card.suspended) {
    return { kind: "suspended", label: t("cards.status.suspended"), icon: "pause" };
  }
  return null;
}

/** What a card's wallet holds as "Cards" shows it: its balance, and its deposits on their way. */
type CardHeld = { sats: bigint; arrivingSats: bigint };

const NOTHING_HELD: CardHeld = { sats: 0n, arrivingSats: 0n };

/**
 * The tasks that may move the card's sats: its balance is read again once their panel closes,
 * quietly (what it showed stays shown meanwhile), unless the panel said its sats moved
 * (`onWalletChange`).
 */
const MOVES_SATS: readonly CardTask[] = ["recharge", "return", "empty", "delete"];

/** No card's wallet held: "Cards" not shown, or its cards not read yet. */
const NO_CARDS: readonly CardState[] = [];

function CardsHome({
  added,
  onAddedShown,
  printed,
  onPrintedShown,
  onAddPrinted,
  onAdd,
  addAsked,
  onFinishMigration,
  onHistory,
  onProbe,
  onWakes,
  onWallets,
  orderAsked,
  onSaveOrder,
  organizing
}: {
  /** A card just added: chosen, its "Top up" open when asked (`recharge`); `at` tells each. */
  added: { cardId: string; recharge: boolean; at: string } | null;
  onAddedShown: () => void;
  /** The printed number of a v2 card's link, and which scan it is: its card chosen. */
  printed: { number: string; scan: string } | null;
  onPrintedShown: () => void;
  /**
   * "Add a card" for a printed link whose card the account does not have (as the header's; null
   * where the page has none: the web app on a phone).
   */
  onAddPrinted: (() => void) | null;
  /**
   * "Add a card" in the app (PairCardScreen.tsx, or its dialog on a device that reads no card);
   * null: the web app, which cannot.
   */
  onAdd: (() => void) | null;
  /**
   * Bumped by the header's "Add a card" on a computer's web app, and by the app's on a device that
   * reads no card: its dialog opens.
   */
  addAsked: number;
  /**
   * "Finish the migration" of a v2 card left half-done (PairCardScreen.tsx); null: the web, a
   * device that reads no card.
   */
  onFinishMigration: ((cardId: string) => void) | null;
  /** "History" of the card (CardHistoryScreen.tsx), a screen of its own. */
  onHistory: (cardId: string) => void;
  onProbe: () => void;
  onWakes: () => void;
  /** The cards' wallets shown, in their order, as a key (useCardOrdering): "Organise" saves it. */
  onWallets: (key: string) => void;
  /** Bumped by the phone's header's "Organise": its panel opens (CardOrderSheet.tsx). */
  orderAsked: number;
  /** Saves the cards' order (useCardOrdering); resolves whether it was saved. */
  onSaveOrder: (ids: readonly string[]) => Promise<boolean>;
  /** A desktop's "Organise": the row's order being chosen, null otherwise. */
  organizing: { ids: readonly string[]; onMove: (ids: string[]) => void; saving: boolean } | null;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  const wide = useWindowDimensions().width >= COLUMNS_MIN_WIDTH;
  const { view, syncs, reload, accept } = useCards();
  // The header's "Organise" follows the cards shown (two at least), in their order.
  const walletsKey =
    view.phase === "ready"
      ? view.cards.map((card) => `${card.cardId}:${card.walletGeneration}`).join()
      : "";
  useEffect(() => onWallets(walletsKey), [walletsKey, onWallets]);
  // The phone's "Card order", opened anew at each press of "Organise".
  const [ordering, setOrdering] = useState(false);
  const [orderSeen, setOrderSeen] = useState(orderAsked);
  if (orderSeen !== orderAsked) {
    setOrderSeen(orderAsked);
    setOrdering(true);
  }
  // By id, not by place: a card added or gone moves the others.
  const [chosen, setChosen] = useState<string | null>(null);
  // The panel open over "Cards": its card and its task (CardSheet.tsx).
  const [panel, setPanel] = useState<{ cardId: string; task: CardTask } | null>(null);
  // "Add a card" on a computer's web app, or in the app on a device that reads no card
  // (AddCardDialog): from the header or the place beside the cards (`addAsked` in the app), or the
  // page without a card.
  const reads = useReadsCards();
  const [adding, setAdding] = useState(false);
  const [asked, setAsked] = useState(addAsked);
  if (asked !== addAsked) {
    setAsked(addAsked);
    setAdding(true);
  }
  // A card added from the carousel's last place ("Add a card") is the one chosen.
  const ids = view.phase === "ready" ? view.cards.map((card) => card.cardId) : null;
  const [seen, setSeen] = useState<readonly string[] | null>(ids);
  if (ids !== null && (seen === null || ids.join() !== seen.join())) {
    setSeen(ids);
    const added = seen === null ? undefined : ids.find((id) => !seen.includes(id));
    if (added && chosen === ADD) setChosen(added);
    // The card chosen gone (deleted here or elsewhere): the one in its place, the next, or the one
    // before it when it was the last.
    const was =
      seen !== null && chosen !== null && !ids.includes(chosen) ? seen.indexOf(chosen) : -1;
    const instead = was >= 0 ? ids[Math.min(was, ids.length - 1)] : undefined;
    if (instead !== undefined) setChosen(instead);
  }
  // The card the phone added while the dialog showed (AddCardDialog): chosen, the dialog closed,
  // once in service. A v2 card being migrated there is not yet (its state is published before its
  // balance moves and it is programmed): the dialog stays, its reads go on.
  const active =
    view.phase === "ready"
      ? view.cards.filter((card) => card.status === "active").map((card) => card.cardId)
      : null;
  const [seenActive, setSeenActive] = useState<readonly string[] | null>(active);
  if (active !== null && (seenActive === null || active.join() !== seenActive.join())) {
    setSeenActive(active);
    const activated =
      seenActive === null ? undefined : active.find((id) => !seenActive.includes(id));
    if (activated && adding) {
      setChosen(activated);
      setAdding(false);
    }
  }
  // The account's wallet connected as soon as "Cards" shows a card to top up: its SDK syncs
  // meanwhile, and "Top up" opens on the main balance at once rather than after a connection and a
  // first sync of its own. Only while the screen shows, as "Wallet"'s: it stays mounted under
  // another destination (AppShell). Never a card holder's account's, which has none
  // (useHeldAccountWallet).
  const focused = useIsFocused();
  const cardHolder = useCardHolder();
  useHeldAccountWallet(
    !cardHolder &&
      focused &&
      view.phase === "ready" &&
      view.cards.some((card) => card.status === "active")
  );
  // Every card's wallet connected and read as soon as "Cards" shows its cards, then followed: a
  // card chosen shows its balance at once, its wallet neither connected nor read again for it. Only
  // while the screen shows, as "Wallet"'s: it stays mounted under another destination (AppShell),
  // which needs no card's wallet. Each payment a card's wallet receives meanwhile told, as its
  // balance follows it: its amount, exact, and the card it reached.
  const { notify } = useNotifications();
  const { languageTag } = usePos();
  const walletOf = useCardWallets(
    focused && view.phase === "ready" ? view.cards : NO_CARDS,
    (wallet, payments) => {
      const card =
        view.phase === "ready"
          ? view.cards.find((each) => sameCardWallet(each, wallet))
          : undefined;
      if (!card) return;
      for (const payment of payments) {
        notify({
          tone: "success",
          title: t("cards.home.received", { amount: formatSats(payment.amountSats, languageTag) }),
          body: cardOfLabel(card, t),
          key: `card-received-${card.cardId}-${payment.id}`
        });
      }
    }
  );
  // The card's mode read again under "Advanced settings" once its panel closed.
  const [payeesRound, setPayeesRound] = useState(0);
  // A card being deleted or reprogrammed from its panel: the wallets no card shows wait
  // (ErasedFundsNotice).
  const [writing, setWriting] = useState(false);
  // The card just added, once in the list: chosen, its "Top up" open when asked.
  const [arrived, setArrived] = useState<string | null>(null);
  if (
    added !== null &&
    arrived !== added.at &&
    view.phase === "ready" &&
    view.cards.some((card) => card.cardId === added.cardId)
  ) {
    setArrived(added.at);
    setChosen(added.cardId);
    if (added.recharge) {
      setPanel({ cardId: added.cardId, task: "recharge" });
    }
  }
  // Its parameters cleared once per addition shown, however often the screen renders after.
  const cleared = useRef<string | null>(null);
  useEffect(() => {
    if (arrived === null || cleared.current === arrived) return;
    cleared.current = arrived;
    onAddedShown();
  }, [arrived, onAddedShown]);

  // The card a v2 card's printed link names (legacy-link.ts), once per scan: chosen as soon as the
  // list shows it. Not in it, "Add a card" only once a majority of the relays proved the account
  // has no such card (`conclusive`): read from the device alone, it may have been added elsewhere,
  // and the scan waits for a list that shows it (never "absent" on what was not read). "Add a card"
  // then finds what the card is: blank, a v2 card to migrate, the account's own whose number its
  // record lacks.
  const [scanned, setScanned] = useState<{ scan: string; missing: boolean } | null>(null);
  if (printed !== null && scanned?.scan !== printed.scan && view.phase === "ready") {
    const named = cardOfPrintedNumber(view.cards, printed.number);
    if (named) {
      setScanned({ scan: printed.scan, missing: false });
      setChosen(named.cardId);
    } else if (view.conclusive) {
      setScanned({ scan: printed.scan, missing: true });
    }
  }
  // Its parameters cleared, and "Add a card" opened, once per scan.
  const scanTaken = useRef<string | null>(null);
  useEffect(() => {
    if (scanned === null || scanTaken.current === scanned.scan) return;
    scanTaken.current = scanned.scan;
    onPrintedShown();
    if (scanned.missing) onAddPrinted?.();
  }, [scanned, onPrintedShown, onAddPrinted]);

  const cards = view.phase === "ready" ? view.cards : NO_CARDS;
  const found = cards.findIndex((card) => card.cardId === chosen);
  // The first card until one is chosen; the last place ("Add a card") without any.
  const index = chosen === ADD ? cards.length : Math.max(found, 0);
  const current = cards[index] ?? null;
  // Looked up among every state: a card reset (or on its way to new keys) leaves the list, not its
  // panel, which shows how the operation ends.
  const opened =
    panel && view.phase === "ready"
      ? (view.states.find((card) => card.cardId === panel.cardId) ?? null)
      : null;
  // The payments "Limits" counts, read once for its tiles under the card and its panel
  // (LimitsPanel.tsx), while the screen shows (it stays mounted under another destination,
  // AppShell): its panel's card's while it shows, else the card chosen's where it shows "Limits"
  // (in service). Read again, what was read shown meanwhile (`again`), once the chosen card's
  // balance moved (CardHome: a payment of the card's) and as its panel opens: what it says is read
  // anew, as when the panel read on its own.
  const [again, setAgain] = useState(0);
  const readAgain = () => setAgain((round) => round + 1);
  const limitCard = !focused
    ? null
    : opened && panel?.task === "limits"
      ? opened
      : current?.status === "active"
        ? current
        : null;
  const limits = useCardLimitLog(limitCard, again);
  const shownLimits: CardLimitRead =
    current && limitCard && sameCardWallet(current, limitCard)
      ? limits
      : { ...limits, log: { phase: "reading" } };

  // Opened from the header whatever the page shows, the cards not read yet included; its reads end
  // a failure the page shows (useCards). Second in each fragment the page renders, whatever the
  // phase: the page read meanwhile never closes and opens it again.
  const addDialog =
    reads === false ? (
      <AddCardDialog visible={adding} onClose={() => setAdding(false)} onRead={accept} />
    ) : null;

  // Its loading scene (useLoadingScene): it fades out once read, then the page fades in.
  const waitScene = useLoadingScene(
    view.phase === "loading" ? { scene: "cards", label: t("cards.loading") } : null
  );
  const waited = waitScene.waited;
  if (waitScene.scene) {
    return (
      <>
        <View style={styles.center} testID="cards-loading">
          <LoadingScene {...waitScene.scene} />
        </View>
        {addDialog}
      </>
    );
  }
  // Read meanwhile: its scene shows (above). For the types, which cannot tell.
  if (view.phase === "loading") return addDialog;
  if (view.phase === "failed") {
    return (
      <>
        <View style={styles.failed}>
          <Callout tone="error" testID="cards-failed">
            {t(`cards.failed.${view.reason}`)}
          </Callout>
          <Button variant="secondary" onPress={reload} testID="cards-retry">
            {t("cards.retry")}
          </Button>
        </View>
        {addDialog}
      </>
    );
  }

  const marks = cards.map((card) => statusOf(card, t));
  const items: CarouselCard[] = cards.map((card, position) => ({
    card,
    label: cardLabel(card, t),
    status: marks[position]?.label ?? null,
    paused: marks[position]?.kind === "suspended"
  }));
  const status = marks[index] ?? null;
  const choose = (next: number) => setChosen(cards[next]?.cardId ?? ADD);
  const home = current ? (
    <CardHome
      key={current.cardId}
      card={current}
      desktop={desktop ? (wide ? "columns" : "column") : null}
      status={status}
      sync={syncs.get(current.cardId)}
      wallet={walletOf(current)}
      payeesRound={payeesRound}
      limits={shownLimits}
      onBalanceMoved={readAgain}
      onFinishMigration={onFinishMigration ? () => onFinishMigration(current.cardId) : null}
      onHistory={() => onHistory(current.cardId)}
      onPanel={(task) => {
        setPanel({ cardId: current.cardId, task });
        if (task === "limits") readAgain();
      }}
    />
  ) : (
    <AddCard first={cards.length === 0} onAdd={onAdd} desktop={desktop} />
  );
  // The staging app's tests: the iOS notification service extension's on an iPhone, the card wakes'
  // journal on Android (background-wake.ts); never both on one phone.
  const probes =
    probeAvailable() || wakeJournalShown() ? (
      <SettingsGroup label={t("cards.probe.group")}>
        {probeAvailable() ? (
          <SettingsRow
            icon="paper-plane"
            label={t("cards.probe.row")}
            onPress={onProbe}
            testID="cards-probe"
          />
        ) : (
          <SettingsRow
            icon="clock-rotate-left"
            label={t("cards.wakes.row")}
            onPress={onWakes}
            testID="cards-wakes"
          />
        )}
      </SettingsGroup>
    ) : null;
  const panels = (
    <>
      <CardOrderSheet
        visible={ordering && !desktop}
        cards={items}
        onSave={onSaveOrder}
        onClose={() => setOrdering(false)}
      />
      <CardSheet
        onWriting={setWriting}
        card={opened}
        task={panel?.task ?? "limits"}
        sync={panel ? syncs.get(panel.cardId) : undefined}
        limits={limits}
        others={cards
          .filter((card) => card.cardId !== panel?.cardId)
          .map((card) => cardLabel(card, t))}
        // The panel's card's balance read again once its sats moved (a recharge, a return).
        onWalletChange={() => {
          if (opened) void walletOf(opened).refresh();
        }}
        onClose={() => {
          // However it was closed (its button, the scrim, the system's back): read again.
          if (opened && panel && MOVES_SATS.includes(panel.task)) {
            void walletOf(opened).refresh({ quiet: true });
          }
          // "Advanced settings": its mode, which its panel may have changed, read again.
          if (panel?.task === "advanced") setPayeesRound((round) => round + 1);
          setPanel(null);
        }}
      />
    </>
  );

  if (desktop) {
    // The page scrolls in its frame (PosFrame): no scroll of its own.
    return (
      <>
        <Arrival fade={waited} style={styles.desktopPage} testID="cards-screen">
          <ErasedFundsNotice states={view.states} paused={writing} desktop />
          {/* Without a card, no row: the guide under the header's "Add a card". */}
          {cards.length > 0 ? (
            <CardThumbnails cards={items} index={index} onSelect={choose} organizing={organizing} />
          ) : null}
          {/* While the row is organized, the rest of the page waits under a veil: nothing of it
              changes meanwhile. */}
          <View
            {...outOfReach(organizing !== null)}
            style={[styles.desktopRest, { pointerEvents: organizing ? "none" : "auto" }]}
          >
            {home}
            {probes}
            {organizing ? <View style={styles.veil} testID="cards-order-veil" /> : null}
          </View>
          {panels}
        </Arrival>
        {addDialog}
      </>
    );
  }
  return (
    <>
      <Arrival fade={waited} style={styles.arrival}>
        <DockScrollView contentContainerStyle={styles.body} testID="cards-screen">
          <ErasedFundsNotice states={view.states} paused={writing} desktop={false} />
          {/* Each card's status under its face's right (CardUnderFace), not in a pill here: a
            pill moved what follows it from one card to the next. Without a card, the guide
            (FirstCardGuide) in place of the carousel's empty place: its button adds one. */}
          {cards.length > 0 ? (
            <>
              <CardCarousel cards={items} index={index} onSelect={choose} />
              <CarouselDots count={cards.length} index={index} />
            </>
          ) : null}
          <View style={styles.sections}>
            {home}
            {probes}
          </View>
          {panels}
        </DockScrollView>
      </Arrival>
      {addDialog}
    </>
  );
}

/** The pill's height (StatusChip), which the desktop's page balances under the balance. */
const CHIP_HEIGHT = 28;

/**
 * What keeps the chosen card from paying, in its pill beside its balance on a desktop
 * ("Paused").
 */
function StatusChip({ status }: { status: CardStatusMark }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.chip} testID="card-status">
      <Icon name={status.icon} size={11} color={colors.warning.fg} />
      <Text style={styles.chipLabel}>{status.label}</Text>
    </View>
  );
}

/** The carousel's last place, chosen. */
const ADD = "add";

/** Without a card, FirstCardGuide; with some, "New card", "Add a card", then the shop. */
function AddCard({
  first,
  onAdd,
  desktop
}: {
  first: boolean;
  onAdd: (() => void) | null;
  /**
   * The desktop's page: the header's "Add a card" adds it, the page's one primary button.
   */
  desktop: boolean;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  // On a phone's browser, its own app and its store (AppStoreLink.tsx).
  const phone = storePhoneOf(browserDevice());
  if (first) return <FirstCardGuide onAdd={onAdd} desktop={desktop} />;
  return (
    <View style={[styles.add, desktop && styles.addDesktop]} testID="cards-add">
      <Text accessibilityRole="header" style={styles.addTitle}>
        {t("cards.home.newCard")}
      </Text>
      <Text style={[styles.addLead, desktop && styles.addLeadDesktop]}>
        {t("cards.home.addLead")}
      </Text>
      {desktop ? null : onAdd ? (
        <View style={styles.addAction}>
          <Button size="lg" icon="plus" onPress={onAdd} testID="cards-pair">
            {t("cards.add")}
          </Button>
        </View>
      ) : (
        <>
          <Text style={styles.addLead} testID="cards-pair-phone">
            {t(pairOnPhoneKey(phone))}
          </Text>
          {phone ? <AppStoreLink phone={phone} /> : null}
        </>
      )}
      <CardShop />
    </View>
  );
}

/**
 * Without a card: what a card does, in three steps, then "Add a card" on a phone, or, on a web app
 * that cannot program one, where to do it; in the header on a desktop. Then the shop
 * (CardShop.tsx).
 */
function FirstCardGuide({ onAdd, desktop }: { onAdd: (() => void) | null; desktop: boolean }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const phone = storePhoneOf(browserDevice());
  return (
    <View style={styles.firstCard} testID="cards-add">
      <StepGuide
        title={t("cards.home.firstCard")}
        lead={t("cards.home.addLead")}
        steps={[
          guideStep(t, "cards.home.steps.program", CardProgramArt),
          guideStep(t, "cards.home.steps.recharge", CardRechargeArt),
          guideStep(t, "cards.home.steps.pay", CardPayArt)
        ]}
        wide={desktop}
      />
      {desktop ? null : onAdd ? (
        <Button size="lg" icon="plus" onPress={onAdd} testID="cards-pair">
          {t("cards.add")}
        </Button>
      ) : (
        <>
          <Text style={[styles.prose, styles.proseStart]} testID="cards-pair-phone">
            {t(pairOnPhoneKey(phone))}
          </Text>
          {phone ? <AppStoreLink phone={phone} /> : null}
        </>
      )}
      <CardShop />
    </View>
  );
}

/**
 * The sats that reached a wallet no card shows any more (erased-funds.ts), above the cards: what
 * each holds and receives, and "Withdraw to my main balance" once its sats are added, the passkey
 * asked as for any "Withdraw": what a card's deletion cannot prevent (an invoice paid before it
 * expires, its Bitcoin address), said where the cards are; and the balance of a card whose
 * programming stopped, out of the list until added again. Nothing shows of a wallet not read yet,
 * nor of one that could not be read. A card holder's account has no main balance: its sats go
 * elsewhere, "Empty the card" of that wallet (ErasedDrainSheet).
 */
function ErasedFundsNotice({
  states,
  paused,
  desktop
}: {
  states: readonly CardState[];
  /** A card is being deleted or reprogrammed: no wallet read meanwhile (useErasedFunds). */
  paused: boolean;
  /** On the desktop's page, whose frame has its margins already. */
  desktop: boolean;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { languageTag } = usePos();
  const { notify } = useNotifications();
  const { funds, reread } = useErasedFunds(states, paused);
  const cardHolder = useCardHolder();
  // A card holder's account has no main balance: its texts say where the sats go instead.
  const texts = cardHolder ? "cards.erasedFunds.card" : "cards.erasedFunds";
  // The wallet whose sats are being sent back; the last failure, under its notice.
  const [returning, setReturning] = useState<CardWalletOf | null>(null);
  const [failure, setFailure] = useState<{ wallet: CardWalletOf; message: string } | null>(null);
  // A card holder's: the wallet being emptied elsewhere (its sheet).
  const [draining, setDraining] = useState<CardWalletOf | null>(null);
  const drainSheet = cardHolder ? (
    <ErasedDrainSheet
      wallet={draining}
      noted={
        draining !== null && resetWallets(states).some((reset) => sameCardWallet(reset, draining))
      }
      onClose={(changed) => {
        if (changed && draining) reread(draining);
        setDraining(null);
      }}
    />
  ) : null;
  if (funds.length === 0) return drainSheet;
  const sendBack = ({ wallet }: ErasedFunds) => {
    setReturning(wallet);
    setFailure(null);
    // Prepared anew at each press, from the wallet's balance once synced: what a failed attempt may
    // have sent all the same is no longer in it, and went to the account's own wallet.
    withCardAccess((access) => returnErasedFunds(access, wallet))
      .then(
        ({ sats, status }) => {
          // What the SDK says of it, never more: failed (nothing moved), left, or arrived.
          if (status === "failed") {
            setFailure({ wallet, message: t("cards.wallet.transferRefused") });
            return;
          }
          notify({
            tone: status === "pending" ? "warning" : "success",
            title: t(
              status === "pending"
                ? "cards.erasedFunds.returnPending"
                : "cards.erasedFunds.returned",
              { amount: formatSats(sats, languageTag) }
            ),
            key: "card-erased-funds"
          });
          reread(wallet);
        },
        (error: unknown) => {
          // Emptied meanwhile (from another device): what it holds now, read again.
          if (error instanceof NothingToReturnError) {
            reread(wallet);
            return;
          }
          logFailure("Sending a deleted card's sats back failed", error);
          if (error instanceof PasskeyError || error instanceof OtherAccountError) {
            // The prompt dismissed: nothing said.
            const unlock = toUnlockFailure(error);
            if (unlock) setFailure({ wallet, message: unlockFailureMessage(unlock, t) });
          } else {
            setFailure({ wallet, message: t("cards.erasedFunds.failed") });
          }
        }
      )
      .finally(() => setReturning(null));
  };
  return (
    <View style={desktop ? styles.erasedDesktop : styles.erased} testID="cards-erased-funds">
      {funds.map((held) => {
        const amount = formatSats(held.sats, languageTag);
        const arriving = formatSats(held.arrivingSats, languageTag);
        const failed =
          failure !== null && sameCardWallet(failure.wallet, held.wallet) ? failure.message : null;
        const busy = returning !== null && sameCardWallet(returning, held.wallet);
        return (
          <View
            key={`${held.wallet.cardId}/${held.wallet.walletGeneration}`}
            style={styles.erasedItem}
          >
            <Callout
              tone="warning"
              title={
                held.stopped
                  ? t("cards.erasedFunds.stoppedTitle", { card: cardLabel(held.stopped, t) })
                  : t(
                      held.sats > 0n ? "cards.erasedFunds.title" : "cards.erasedFunds.titleArriving"
                    )
              }
              testID="cards-erased-funds-note"
            >
              {held.stopped
                ? // Shown with sats in it only (useErasedFunds).
                  held.arrivingSats > 0n
                  ? t(`${texts}.stoppedBodyArriving`, { amount, arriving })
                  : t(`${texts}.stoppedBody`, { amount })
                : held.sats === 0n
                  ? t(`${texts}.arrivingOnly`, { arriving })
                  : held.arrivingSats > 0n
                    ? t(`${texts}.bodyArriving`, { amount, arriving })
                    : t(`${texts}.body`, { amount })}
            </Callout>
            {failed ? (
              <ErrorMessage testID="cards-erased-funds-error">{failed}</ErrorMessage>
            ) : null}
            {/* Its sats on their way are sent back once they are added: nothing to send yet. */}
            {held.sats > 0n && cardHolder ? (
              <Button
                variant="secondary"
                icon="arrow-up"
                onPress={() => setDraining(held.wallet)}
                testID="cards-erased-funds-drain"
              >
                {t("cards.wallet.emptyCard")}
              </Button>
            ) : held.sats > 0n ? (
              <Button
                variant="secondary"
                icon="key"
                loading={busy}
                disabled={returning !== null && !busy}
                onPress={() => sendBack(held)}
                testID="cards-erased-funds-return"
              >
                {t("cards.wallet.return")}
              </Button>
            ) : null}
          </View>
        );
      })}
      {drainSheet}
    </View>
  );
}

/** The chosen card: its balance, what moves it, its settings. */
function CardHome({
  card,
  desktop,
  status,
  sync,
  wallet,
  payeesRound,
  limits,
  onBalanceMoved,
  onFinishMigration,
  onHistory,
  onPanel
}: {
  card: CardState;
  /**
   * The desktop's page: its balance beside its face, then its history, its settings aside
   * (`columns`) or, in a narrower window, between the two.
   * Null: the phone's column.
   */
  desktop: "columns" | "column" | null;
  /** What keeps it from paying: in its balance's block on the desktop's page (the phone's pill). */
  status: CardStatusMark | null;
  sync: ChannelSync | undefined;
  /** Its wallet, held by "Cards" with every card's (useCardWallets). */
  wallet: HeldCardWallet;
  /** Bumped when "Advanced settings" closes: the card's mode read again under its row. */
  payeesRound: number;
  /** The payments its "Limits" counts (useCardLimitLog), as "Cards" read them. */
  limits: CardLimitRead;
  /** Its balance shown changed from what it was (not as it first shows): its payments read again. */
  onBalanceMoved: () => void;
  onFinishMigration: (() => void) | null;
  onHistory: () => void;
  onPanel: (task: CardTask) => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { languageTag } = usePos();
  const { notify } = useNotifications();
  const cardHolder = useCardHolder();
  // "Withdraw" names the main balance among its ways where it is offered (CardWalletFlow.tsx).
  const mainWallet = useMainBalanceOffered();
  // A card holder's account has no main balance: the card is emptied elsewhere (its texts).
  const drainTexts = cardHolder ? "cards.delete.card" : "cards.delete";
  const active = card.status === "active";
  const migrating = card.status === "migrating";
  const task = (next: CardTask) => () => onPanel(next);
  // What its wallet holds as shown under it, its deposits on their way included (null while unread,
  // or read again, quietly too): "Delete the card" asks it emptied first, and waits, greyed, while
  // it is not known: its panel only for a card known empty. Its deletion checks it again before
  // anything changes (manage.ts): sats may reach it meanwhile. The dialog says what it was opened
  // on.
  const shown = wallet.loaded.status === "ready" && !wallet.rereading ? wallet.loaded.view : null;
  const held: CardHeld | null = shown
    ? {
        sats: shown.balanceSats,
        arrivingSats: shown.pending.reduce((sum, deposit) => sum + deposit.amountSats, 0n)
      }
    : null;
  const heldSats = held?.sats ?? null;
  const heldArriving = held?.arrivingSats ?? null;
  // The desktop's history read again once the balance shown changed from what it was (not when it
  // first shows: the history reads itself as it mounts).
  const [historyRound, setHistoryRound] = useState(0);
  const heldBefore = useRef<CardHeld | null>(null);
  useEffect(() => {
    if (heldSats === null || heldArriving === null) return;
    const before = heldBefore.current;
    heldBefore.current = { sats: heldSats, arrivingSats: heldArriving };
    if (before !== null && (before.sats !== heldSats || before.arrivingSats !== heldArriving)) {
      setHistoryRound((round) => round + 1);
      onBalanceMoved();
    }
  }, [heldSats, heldArriving, onBalanceMoved]);
  const [draining, setDraining] = useState<CardHeld | null>(null);
  const drain = draining ?? NOTHING_HELD;
  const amount = formatSats(drain.sats, languageTag);
  const arriving = formatSats(drain.arrivingSats, languageTag);
  // The value being saved, shown meanwhile: the switch waits. The pill under the card says the
  // state saved only.
  const [suspending, setSuspending] = useState<boolean | null>(null);
  const suspend = (suspended: boolean) => {
    setSuspending(suspended);
    setCardSuspended(card.cardId, suspended)
      .catch((error: unknown) => {
        // Back to the saved value: on the web app, no majority of the relays took it.
        logFailure("Pausing a card failed", error);
        const reason = error instanceof PairingError ? error.reason : "failed";
        notify({
          tone: "error",
          title: t("settings.saveFailedTitle"),
          // A reason of its own said as it is; anything else, the change's (never the pairing's).
          body: reason === "failed" ? t("cards.sheet.changeFailed") : t(`card.failure.${reason}`),
          key: "card-suspend"
        });
      })
      .finally(() => setSuspending(null));
  };
  const migration = migrating ? (
    <View style={styles.migration}>
      <Callout tone="warning" testID="card-migrating-note">
        {t("cards.home.migratingNote")}
      </Callout>
      {/* On the desktop's page, from its left edge as the rest of it. */}
      {onFinishMigration ? (
        <Button
          size="lg"
          icon="credit-card"
          fullWidth={desktop === null}
          onPress={onFinishMigration}
          testID="card-finish-migration"
        >
          {t("cards.home.finishMigration")}
        </Button>
      ) : (
        <Text
          style={[styles.prose, desktop !== null && styles.proseStart]}
          testID="card-finish-on-phone"
        >
          {t("cards.home.finishOnPhone")}
        </Text>
      )}
    </View>
  ) : null;
  // On the desktop's page, the card's face beside its balance (the phone's carousel shows it
  // above), and its whole history under them: no "History" to open.
  const page: BalancePage | null =
    desktop !== null
      ? {
          face: (
            <View>
              <CardFaceView
                card={card}
                label={cardLabel(card, t)}
                width={PAGE_CARD_WIDTH}
                paused={status?.kind === "suspended"}
                // The "Paused" pill beside it says the pause.
                pauseBadge={false}
                testID="card-page-face"
              />
              <CardUnderFace number={card.issuer?.number ?? null} width={PAGE_CARD_WIDTH} />
            </View>
          ),
          status: status ? <StatusChip status={status} /> : null
        }
      : null;
  const actions: BalanceActions = {
    onRecharge: active ? task("recharge") : null,
    // A row of "Card", on the phone as on the desktop's page (never as big as "Top up"), but for a
    // card being migrated: it has no "Card", its balance's only way out.
    onReturn: migrating ? task("return") : null,
    returnPrimary: !active && !(migrating && onFinishMigration)
  };
  // On a desktop, the card's history shows under its balance (but for a card being migrated): it
  // records its movements as it reads them (useCardHistory), "Cards" does not again.
  const historyShown = desktop !== null && !migrating;
  // Its top-ups and returns recorded with their value, once a day (history-sync.ts), once its
  // wallet is read: one no "History" showed would otherwise miss the copy of its month. Its history
  // shown beside records them already: never read twice.
  const { cardId, walletGeneration } = card;
  const read = wallet.loaded.status === "ready";
  useEffect(() => {
    const walletId = getAccountWalletId();
    if (!historyShown && read && walletId) {
      void recordCardMovementsDaily(walletId, { cardId, walletGeneration });
    }
  }, [historyShown, read, cardId, walletGeneration]);
  // The funds that left its wallet's balance, back to it (funds-recovery-sync.ts), once read.
  useEffect(() => {
    const walletId = getAccountWalletId();
    if (read && walletId) void recoverCardFunds(walletId, { cardId, walletGeneration });
  }, [read, cardId, walletGeneration]);
  const balance = (
    <CardBalance
      loaded={wallet.loaded}
      refreshing={wallet.refreshing}
      onRetry={wallet.retry}
      page={page}
      {...actions}
    />
  );
  const security = active ? (
    <Group label={t("cards.home.security")}>
      <View style={rowStyle}>
        <RowIcon icon="pause" />
        <RowTexts title={t("cards.home.pause")} caption={t("cards.home.pauseCaption")} />
        <Switch
          value={suspending ?? card.suspended}
          onValueChange={suspend}
          loading={suspending !== null}
          label={t("cards.home.pause")}
          testID="card-suspend"
        />
        <Separator />
      </View>
      <LimitsPreview card={card} limits={limits} onPress={task("limits")} />
    </Group>
  ) : null;
  // "Payments without confirmation" and "Relay and programming" in a panel of their own, its row
  // saying what they hold and carrying their warnings (AdvancedRow).
  const advanced = active ? (
    <RowsCard>
      <AdvancedRow card={card} sync={sync} round={payeesRound} onPress={task("advanced")} />
    </RowsCard>
  ) : null;
  // On the phone, "History" first of "Card"; on the desktop's page, the history shows under the
  // balance. "Withdraw" last of "Card" on both (a row under "Customize", never a button as big as
  // "Top up"), greyed while the balance is unread, or nothing is on the card.
  const phone = desktop === null;
  const view = wallet.loaded.status === "ready" ? wallet.loaded.view : null;
  const settings = migrating ? null : (
    <Group label={t("cards.home.card")}>
      {phone ? (
        <Row
          icon="clock-rotate-left"
          title={t("cards.home.history")}
          caption={t("cards.home.historyCaption")}
          onPress={onHistory}
          separated
          testID="card-history"
        />
      ) : null}
      <Row
        icon="pen"
        title={t("cards.home.customize")}
        caption={t(card.issuer ? "cards.home.customizeIssuer" : "cards.home.customizeCaption")}
        onPress={task("customize")}
        separated
        testID="card-customize"
      />
      <Row
        icon="arrow-up"
        title={t("cards.home.withdraw")}
        caption={
          wallet.loaded.status === "failed"
            ? t("cards.home.deleteUnread")
            : view === null
              ? t("cards.home.reading")
              : view.balanceSats === 0n
                ? t("cards.home.withdrawEmpty")
                : t(mainWallet ? "cards.home.sendCaptionMain" : "cards.home.sendCaption")
        }
        disabled={view === null || view.balanceSats === 0n}
        onPress={task("return")}
        testID="card-wallet-return"
      />
    </Group>
  );
  const deletion = migrating ? null : (
    <RowsCard>
      <Row
        icon="trash-can"
        title={t("cards.home.delete")}
        // Not known: being read, or unread ("Try again" under the balance).
        caption={
          held !== null
            ? t("cards.home.deleteCaption")
            : wallet.loaded.status === "failed"
              ? t("cards.home.deleteUnread")
              : t("cards.home.reading")
        }
        danger
        disabled={held === null}
        onPress={() => {
          if (held === null) return;
          if (held.sats > 0n || held.arrivingSats > 0n) setDraining(held);
          else task("delete")();
        }}
        testID="card-delete"
      />
    </RowsCard>
  );
  const drainDialog = (
    <ConfirmDialog
      visible={draining !== null}
      title={t("cards.delete.drainTitle", { name: escapeRichText(cardLabel(card, t)) })}
      // The card's name in orange, its amounts in bold; the name, typed by a user, as it is
      // (escapeRichText).
      markup
      body={
        drain.arrivingSats === 0n
          ? t(`${drainTexts}.drainBody`, { amount })
          : drain.sats > 0n
            ? t(`${drainTexts}.drainBodyArriving`, { amount, arriving })
            : t(`${drainTexts}.drainBodyArrivingOnly`, { arriving })
      }
      // Nothing to send back until its sats on their way are added: "Back" alone.
      confirmLabel={
        drain.sats > 0n
          ? t(cardHolder ? "cards.wallet.emptyCard" : "cards.delete.drainConfirm")
          : undefined
      }
      // The key on a phone, "Withdraw"'s arrow on a desktop (web).
      confirmIcon={desktop !== null ? "arrow-up" : "key"}
      tone="primary"
      cancelLabel={t("cards.sheet.back")}
      onConfirm={() => {
        setDraining(null);
        // "Withdraw", "Empty the card" chosen, sent after the passkey; emptied, "Delete the card"
        // opens its panel.
        onPanel("empty");
      }}
      onCancel={() => setDraining(null)}
      testID="card-delete-drain"
      confirmTestID="card-delete-drain-return"
    />
  );
  if (desktop !== null) {
    // A card being migrated has paid nothing yet. Read again once its balance shown moved (what it
    // paid, received, sent back): the page shows it all along.
    const history = !historyShown ? null : (
      <View style={styles.desktopHistory}>
        <Text accessibilityRole="header" style={styles.desktopHistoryTitle}>
          {t("cards.home.history")}
        </Text>
        <CardHistoryList card={card} refreshKey={historyRound} />
      </View>
    );
    const options = (
      <WholeSeparators.Provider value>
        {security}
        {settings}
        {advanced}
        {deletion}
      </WholeSeparators.Provider>
    );
    if (desktop === "column") {
      // Its settings before its history, which may be long.
      return (
        <View style={styles.desktopColumn}>
          {migration}
          {balance}
          {options}
          {history}
          {drainDialog}
        </View>
      );
    }
    return (
      <View style={styles.desktopColumns}>
        <View style={styles.desktopMain}>
          {migration}
          {balance}
          {history}
        </View>
        <View style={styles.desktopAside} testID="cards-page-aside">
          {options}
        </View>
        {drainDialog}
      </View>
    );
  }
  return (
    <>
      {migration}
      {balance}
      {security}
      {settings}
      {advanced}
      {deletion}
      {drainDialog}
    </>
  );
}

/** The card's face, on the desktop's page, beside its balance. */
const PAGE_CARD_WIDTH = 280;

/**
 * From this window width, the desktop's page in two columns (CardHome): beside the side bar, the
 * card's face beside its balance and its settings aside. Narrower (an iPad, a small window), its
 * settings under its balance: there the face would crowd the balance out.
 */
const COLUMNS_MIN_WIDTH = 1366;

/** On the desktop's page: the card's face beside its balance, what keeps it from paying above. */
type BalancePage = { face: ReactNode; status: ReactNode };

type BalanceActions = {
  /** Null: nothing goes on the card (one being migrated). */
  onRecharge: (() => void) | null;
  /** Null: not under the balance ("Card" has it, CardHome): but for a card being migrated. */
  onReturn: (() => void) | null;
  /**
   * "Withdraw" filled: the block's one primary action, neither "Top up" nor "Finish the migration"
   * beside it (one filled primary button a screen).
   */
  returnPrimary: boolean;
};

/**
 * The card's balance (never shown before its wallet is read: "Reading the balance…"), its value at
 * the hour's rate (none during a rate outage: the sats alone, never a former rate), what is on its
 * way on-chain, then "Top up" once the balance is read, a small button, or "Withdraw" for a card
 * nothing goes on (being migrated). On the desktop's page (`page`), a block of its own: the card's
 * face, the balance beside it, its small button under it.
 */
function CardBalance({
  loaded,
  refreshing,
  onRetry,
  page,
  onRecharge,
  onReturn,
  returnPrimary
}: {
  loaded: CardWalletLoaded;
  refreshing: boolean;
  onRetry: () => void;
  page: BalancePage | null;
} & BalanceActions) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { languageTag } = usePos();
  const withdrawLabel = t("cards.home.withdraw");
  const withdrawA11y = t("cards.home.withdrawA11y");
  const format = useWalletFormat();
  const view = loaded.status === "ready" ? loaded.view : null;
  const pending = view?.pending.reduce((sum, deposit) => sum + deposit.amountSats, 0n) ?? 0n;
  const fiat = view ? format.fiat(view.balanceSats) : null;
  const balance = (
    <View style={page ? styles.balancePage : styles.balance} testID="card-balance">
      <Text style={page ? styles.balanceLabelPage : styles.balanceLabel}>
        {t("cards.wallet.balance")}
      </Text>
      {loaded.status === "failed" ? (
        <View style={styles.balanceFailed}>
          <Text style={styles.prose} testID="card-wallet-failed">
            {t("cards.wallet.failed")}
          </Text>
          <Button variant="secondary" size="md" onPress={onRetry} testID="card-wallet-retry">
            {t("card.retry")}
          </Button>
        </View>
      ) : view === null || refreshing ? (
        <View style={styles.reading} testID="card-balance-reading">
          <Spinner size={18} />
          <Text style={styles.readingLabel}>{t("cards.home.reading")}</Text>
        </View>
      ) : (
        <>
          <Text
            style={page ? styles.amountPage : styles.amount}
            accessibilityLabel={t("cards.home.balanceA11y", {
              amount: formatInteger(view.balanceSats, languageTag)
            })}
            testID="card-balance-sats"
          >
            {formatInteger(view.balanceSats, languageTag)}
            <Text style={page ? styles.unitPage : styles.unit}> sats</Text>
          </Text>
          {fiat ? (
            <Text style={styles.fiat} testID="card-balance-fiat">
              {fiat}
            </Text>
          ) : null}
          {pending > 0n ? (
            <Text style={page ? styles.pendingPage : styles.pending} testID="card-balance-pending">
              {t("cards.wallet.pendingDeposit", {
                amount: `${formatInteger(pending, languageTag)} sats`
              })}
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
  // One small button under the balance, as the phone's: on the desktop's page too, under its fiat
  // value, from the balance's left edge.
  const action = onRecharge ? (
    <Button
      icon="arrow-down"
      size="sm"
      fullWidth={false}
      accessibilityLabel={t("cards.home.rechargeA11y")}
      disabled={view === null}
      onPress={onRecharge}
      style={page ? styles.pageAction : styles.homeAction}
      testID="card-wallet-recharge"
    >
      {t("cards.wallet.recharge")}
    </Button>
  ) : onReturn ? (
    <Button
      variant={returnPrimary ? "primary" : "secondary"}
      icon="arrow-up"
      size="sm"
      fullWidth={false}
      accessibilityLabel={withdrawA11y}
      disabled={view === null || view.balanceSats === 0n}
      onPress={onReturn}
      style={page ? styles.pageAction : styles.homeAction}
      testID="card-wallet-return"
    >
      {withdrawLabel}
    </Button>
  ) : null;
  if (page) {
    return (
      <View style={styles.pageBalance}>
        <View style={styles.pageBalanceTop}>
          {page.face}
          <View style={styles.pageBalanceTexts}>
            {page.status ? <View style={styles.pageStatus}>{page.status}</View> : null}
            {balance}
            {action}
            {/* As tall as the pill above: the balance stays centred on the face, where it is
                without the pill (a paused card's text no longer moves down). */}
            {page.status ? (
              <View style={styles.pageStatusBalance} testID="card-status-balance" />
            ) : null}
          </View>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.home}>
      {balance}
      {action}
    </View>
  );
}

const useStyles = makeStyles(({ colors, shadow }) => ({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  // The page's scroll fills the screen, as it does unwrapped.
  arrival: { flex: 1 },
  failed: { paddingHorizontal: gutter, paddingTop: space[4], gap: space[5] },
  body: { paddingBottom: space[6] },
  erased: { paddingHorizontal: gutter, paddingTop: space[4], gap: space[5] },
  erasedItem: { gap: space[4] },
  // The desktop's page: from the frame's top, its whole width.
  desktopContent: {
    alignItems: "stretch",
    justifyContent: "flex-start",
    paddingTop: space[8],
    paddingBottom: space[10]
  },
  desktopPage: { gap: 24 },
  desktopRest: { gap: 24 },
  veil: {
    ...StyleSheet.absoluteFill,
    margin: -space[4],
    borderRadius: radius.lg,
    backgroundColor: colors.veil
  },
  headerActions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 },
  headerIcon: { width: control.md, height: control.md, borderRadius: radius.pill },
  erasedDesktop: { gap: space[5] },
  desktopColumns: { flexDirection: "row", alignItems: "flex-start", gap: space[9] },
  desktopColumn: { gap: space[8] },
  desktopMain: { flex: 1, minWidth: 0, gap: space[8] },
  desktopAside: { width: 380, gap: space[8] },
  desktopHistory: { gap: space[2] },
  desktopHistoryTitle: {
    ...sans(700),
    paddingVertical: 15,
    fontSize: type.title,
    letterSpacing: tracked.title,
    lineHeight: 26,
    color: colors.text.primary
  },
  pageBalance: {
    backgroundColor: colors.background.surface,
    borderRadius: radius.lg,
    boxShadow: shadow.card,
    padding: space[9]
  },
  pageBalanceTop: { flexDirection: "row", alignItems: "center", gap: space[10] },
  pageBalanceTexts: { flex: 1, minWidth: 0, gap: 10 },
  pageStatus: { alignItems: "flex-start" },
  pageStatusBalance: { height: CHIP_HEIGHT },
  // 18 under the balance with the column's gap, as the phone's (home).
  pageAction: { marginTop: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: CHIP_HEIGHT,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.warning.bg
  },
  chipLabel: { ...sans(600), fontSize: type.caption, color: colors.warning.fg },
  sections: { paddingHorizontal: gutter, gap: gutter, marginTop: 18 },
  migration: { gap: space[5] },
  home: { alignItems: "center", gap: 18 },
  balance: { alignItems: "center", gap: 2 },
  balanceLabel: { ...sans(600), fontSize: type.caption, color: colors.text.secondary },
  balancePage: { alignItems: "flex-start", gap: 2 },
  balanceLabelPage: { ...sans(600), fontSize: 13, color: colors.text.secondary },
  amount: {
    ...sans(600),
    fontSize: 34,
    letterSpacing: tracking(AMOUNT_EM, 34),
    lineHeight: 46,
    fontVariant: ["tabular-nums"],
    color: colors.text.primary
  },
  unit: { ...sans(600), fontSize: 16, color: colors.text.secondary },
  amountPage: {
    ...sans(700),
    fontSize: 34,
    letterSpacing: tracking(AMOUNT_EM, 34),
    lineHeight: 46,
    fontVariant: ["tabular-nums"],
    color: colors.text.primary
  },
  unitPage: { ...sans(600), fontSize: 17, color: colors.text.secondary },
  fiat: {
    ...sans(500),
    fontSize: 15,
    fontVariant: ["tabular-nums"],
    color: colors.text.secondary
  },
  pending: {
    ...sans(500),
    marginTop: 4,
    maxWidth: 300,
    textAlign: "center",
    fontSize: type.caption,
    lineHeight: 18,
    color: colors.text.secondary
  },
  pendingPage: {
    ...sans(500),
    maxWidth: 320,
    fontSize: type.caption,
    lineHeight: 18,
    color: colors.text.secondary
  },
  reading: { height: 46, flexDirection: "row", alignItems: "center", gap: 10 },
  readingLabel: { ...sans(600), fontSize: 13.5, color: colors.text.secondary },
  balanceFailed: { alignItems: "center", gap: space[4], paddingTop: space[3] },
  homeAction: { alignSelf: "center" },
  add: { alignItems: "center", gap: 12, paddingTop: 6 },
  addTitle: {
    ...sans(700),
    fontSize: 19,
    letterSpacing: tracking(TITLE_EM, 19),
    color: colors.text.primary
  },
  addLead: {
    ...sans(500),
    maxWidth: 320,
    textAlign: "center",
    fontSize: type.prose,
    lineHeight: proseLineHeight,
    color: colors.text.secondary
  },
  addAction: { alignSelf: "stretch", marginTop: 14 },
  addDesktop: { alignItems: "flex-start", paddingTop: 0 },
  addLeadDesktop: { maxWidth: 480, textAlign: "left" },
  firstCard: { gap: 22 },
  prose: {
    ...sans(500),
    textAlign: "center",
    fontSize: type.prose,
    lineHeight: proseLineHeight,
    color: colors.text.secondary
  },
  proseStart: { textAlign: "left" }
}));
