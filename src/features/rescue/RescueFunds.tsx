import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Lead, ScreenTitle } from "@/components/ui/Heading";
import { Sheet } from "@/components/ui/Sheet";
import { Spinner } from "@/components/ui/Spinner";
import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { settingsHaveMainWallet } from "@/features/account/main-wallet";
import { useOwnerActivity } from "@/features/activity/useActivity";
import { CardDrain } from "@/features/card/CardDrain";
import { useCardWallet } from "@/features/card/CardWalletPanel";
import { usePos } from "@/features/terminal/pos";
import { ExportSheet } from "@/features/wallet/export/ExportSheet";
import { useWalletFormat } from "@/features/wallet/format";
import { formatSats } from "@/features/wallet/send/amount";
import { logFailure } from "@/lib/log/log";
import { makeStyles, radius, sans, space, type } from "@/theme";

import {
  readRescueCardFunds,
  readRescueCards,
  readRescueWalletFunds,
  rescueCardSource,
  rescueWalletSource,
  type RescueCardWallet,
  type RescueFunds as Funds,
  type RescueOpening
} from "./rescue";

/*
 * "Your funds" of "Open with my 12 words": what each wallet of the words holds, once synced, and
 * "Empty",
 * which sends its whole balance to one recipient (CardDrain, the fees taken from it). Each wallet
 * is emptied on its own, its figures shown before it leaves: a single "Send everything"
 * would send several payments on one press, one of which may fail while the others leave. A
 * wallet not read yet is never said empty. "Export the history" opens "Wallet"'s export, for a
 * merchant's account.
 */

/** A wallet's line: the account's own, or a card's. */
type Line = { key: string; kind: "wallet" } | { key: string; kind: "card"; card: RescueCardWallet };

/** What a line's wallet holds: being read, read, or not read (never "empty" then). */
type Held = { state: "reading" } | { state: "read"; funds: Funds } | { state: "unread" };

type Cards =
  | { state: "reading" }
  | { state: "read"; wallets: RescueCardWallet[]; conclusive: boolean }
  | { state: "failed" };

const WALLET_KEY = "wallet";

function cardKey({ wallet }: RescueCardWallet): string {
  return `${wallet.cardId}/${wallet.walletGeneration}`;
}

export function RescueFundsView({
  opening,
  onClose
}: {
  opening: RescueOpening;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const styles = useStyles();
  const { walletId } = opening;
  // The words' own wallet: a merchant's account's, or the wallet alone when no relay holds the
  // account (a card holder's account never has one, main-wallet.ts).
  const ownWallet = opening.kind === "walletOnly" || settingsHaveMainWallet(opening.settings);
  const [cards, setCards] = useState<Cards>(() =>
    opening.kind === "account"
      ? { state: "reading" }
      : { state: "read", wallets: [], conclusive: true }
  );
  const [held, setHeld] = useState<ReadonlyMap<string, Held>>(new Map());
  const [draining, setDraining] = useState<Line | null>(null);
  const [exporting, setExporting] = useState(false);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    []
  );

  const note = useCallback((key: string, value: Held) => {
    if (alive.current) setHeld((current) => new Map(current).set(key, value));
  }, []);

  const readLine = useCallback(
    async (line: Line) => {
      note(line.key, { state: "reading" });
      try {
        const funds =
          line.kind === "wallet"
            ? await readRescueWalletFunds(walletId)
            : await readRescueCardFunds(line.card.wallet);
        note(line.key, funds ? { state: "read", funds } : { state: "unread" });
      } catch (error) {
        logFailure("Reading a wallet of the rescue failed", error);
        note(line.key, { state: "unread" });
      }
    },
    [note, walletId]
  );

  // The words' own wallet, read once.
  useEffect(() => {
    if (ownWallet) void readLine({ key: WALLET_KEY, kind: "wallet" });
  }, [ownWallet, readLine]);

  // The cards, from a majority of the account's relays, then each of their wallets in turn (one
  // SDK connection at a time).
  const [cardsRound, setCardsRound] = useState(0);
  useEffect(() => {
    if (opening.kind !== "account") return;
    let current = true;
    void (async () => {
      let read: { wallets: RescueCardWallet[]; conclusive: boolean };
      try {
        read = await readRescueCards();
      } catch (error) {
        logFailure("Reading the cards of the rescue failed", error);
        if (current && alive.current) setCards({ state: "failed" });
        return;
      }
      if (!current || !alive.current) return;
      setCards({ state: "read", ...read });
      for (const card of read.wallets) {
        if (!current || !alive.current) return;
        await readLine({ key: cardKey(card), kind: "card", card });
      }
    })();
    return () => {
      current = false;
    };
  }, [opening.kind, cardsRound, readLine]);

  const lines: Line[] = [
    ...(ownWallet ? [{ key: WALLET_KEY, kind: "wallet" as const }] : []),
    ...(cards.state === "read"
      ? cards.wallets
          // A former wallet of a card shows only when it holds something, or could not be read.
          .filter((card) => {
            if (card.current) return true;
            const known = held.get(cardKey(card));
            return (
              known === undefined ||
              known.state !== "read" ||
              known.funds.sats > 0n ||
              known.funds.arrivingSats > 0n
            );
          })
          .map((card) => ({ key: cardKey(card), kind: "card" as const, card }))
      : [])
  ];

  const closeDrain = (changed: boolean) => {
    const line = draining;
    setDraining(null);
    if (changed && line) void readLine(line);
  };

  return (
    <View style={styles.section} testID="rescue-funds">
      <View style={styles.badge} testID="rescue-badge">
        <View style={styles.badgeDot} />
        <Text style={styles.badgeText}>{t("rescue.badge")}</Text>
      </View>
      <ScreenTitle>{t("rescue.funds.title")}</ScreenTitle>
      <Lead>
        {t(opening.kind === "account" ? "rescue.funds.lead" : "rescue.funds.leadWalletOnly")}
      </Lead>
      {cards.state === "failed" ? (
        <View style={styles.failed}>
          <Callout tone="error" testID="rescue-cards-failed">
            {t("rescue.funds.cardsFailed")}
          </Callout>
          <Button
            variant="secondary"
            size="md"
            fullWidth={false}
            onPress={() => {
              setCards({ state: "reading" });
              setCardsRound((round) => round + 1);
            }}
            testID="rescue-cards-retry"
          >
            {t("rescue.funds.retry")}
          </Button>
        </View>
      ) : cards.state === "read" && !cards.conclusive ? (
        <Callout tone="warning" testID="rescue-cards-unread">
          {t("rescue.funds.cardsUnread")}
        </Callout>
      ) : null}
      <View style={styles.card}>
        {lines.map((line, index) => (
          <FundsLine
            key={line.key}
            line={line}
            held={held.get(line.key) ?? { state: "reading" }}
            first={index === 0}
            onDrain={() => setDraining(line)}
            onRetry={() => void readLine(line)}
          />
        ))}
        {cards.state === "reading" ? (
          <View style={[styles.reading, lines.length > 0 && styles.divided]}>
            <Spinner size={15} />
          </View>
        ) : null}
      </View>
      {opening.kind === "account" && ownWallet ? (
        <Button
          variant="secondary"
          icon="download"
          onPress={() => setExporting(true)}
          testID="rescue-export"
        >
          {t("rescue.funds.export")}
        </Button>
      ) : null}
      <Button variant="secondary" onPress={onClose} testID="rescue-close">
        {t("rescue.funds.close")}
      </Button>
      <Text style={styles.note}>{t("rescue.funds.closeNote")}</Text>
      <DrainSheet line={draining} walletId={walletId} onClose={closeDrain} />
      {exporting ? <RescueExport onClose={() => setExporting(false)} /> : null}
    </View>
  );
}

/** A wallet, what it holds, and "Empty" once it holds something. */
function FundsLine({
  line,
  held,
  first,
  onDrain,
  onRetry
}: {
  line: Line;
  held: Held;
  first: boolean;
  onDrain: () => void;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const styles = useStyles();
  const figure = useFigure();
  const label =
    line.kind === "wallet"
      ? t("rescue.funds.wallet")
      : line.card.current
        ? line.card.name
          ? t("rescue.funds.card", { name: line.card.name })
          : t("rescue.funds.cardUnnamed")
        : line.card.name
          ? t("rescue.funds.former", { name: line.card.name })
          : t("rescue.funds.formerUnnamed");
  const testID = `rescue-line-${line.key}`;
  return (
    <View style={[styles.line, !first && styles.divided]} testID={testID}>
      <View style={styles.lineText}>
        <Text style={styles.lineLabel}>{label}</Text>
        {held.state === "reading" ? (
          <Text style={styles.lineCaption}>{t("rescue.funds.reading")}</Text>
        ) : held.state === "unread" ? (
          <Text style={styles.lineCaption} testID={`${testID}-unread`}>
            {t("rescue.funds.unread")}
          </Text>
        ) : held.funds.sats === 0n && held.funds.arrivingSats === 0n ? (
          <Text style={styles.lineCaption} testID={`${testID}-empty`}>
            {t("rescue.funds.empty")}
          </Text>
        ) : (
          <>
            {held.funds.sats > 0n ? (
              <Text style={styles.lineAmount} testID={`${testID}-amount`}>
                {figure(held.funds.sats)}
              </Text>
            ) : null}
            {held.funds.arrivingSats > 0n ? (
              <Text style={styles.lineCaption} testID={`${testID}-arriving`}>
                {t("rescue.funds.arriving", { amount: figure(held.funds.arrivingSats) })}
              </Text>
            ) : null}
          </>
        )}
      </View>
      {held.state === "unread" ? (
        <Button
          variant="secondary"
          size="sm"
          fullWidth={false}
          onPress={onRetry}
          testID={`${testID}-retry`}
        >
          {t("rescue.funds.retry")}
        </Button>
      ) : held.state === "read" && held.funds.sats > 0n ? (
        <Button
          variant="secondary"
          size="sm"
          fullWidth={false}
          icon="arrow-up"
          onPress={onDrain}
          testID={`${testID}-drain`}
        >
          {t("rescue.funds.send")}
        </Button>
      ) : null}
    </View>
  );
}

/** An amount in the display currency with its exact sats, else in sats alone (no rate). */
function useFigure(): (sats: bigint) => string {
  const format = useWalletFormat();
  const { languageTag } = usePos();
  return (sats) => {
    const exact = formatSats(sats, languageTag);
    const fiat = format.fiat(sats);
    return fiat === null ? exact : `${fiat} · ${exact}`;
  };
}

/** "Empty" of a line: its whole balance to one recipient (CardDrain). */
function DrainSheet({
  line,
  walletId,
  onClose
}: {
  line: Line | null;
  walletId: string;
  onClose: (changed: boolean) => void;
}) {
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  // The payment running: the sheet cannot be closed.
  const [busy, setBusy] = useState(false);
  return (
    <Sheet
      title={line?.kind === "card" ? t("cards.wallet.emptyCard") : t("rescue.drain.title")}
      closeLabel={t("cards.sheet.close")}
      visible={line !== null}
      onClose={() => onClose(false)}
      dismissible={!busy}
      dialogWidth={560}
      testID="rescue-drain-sheet"
    >
      {line?.kind === "card" ? (
        <CardWalletDrain card={line.card} onBusy={setBusy} onDone={onClose} />
      ) : line ? (
        <CardDrain
          source={rescueWalletSource(walletId)}
          readBalance={async () => (await readRescueWalletFunds(walletId)).sats}
          desktop={desktop}
          onBusy={setBusy}
          onDone={onClose}
          subject="wallet"
        />
      ) : null}
    </Sheet>
  );
}

/** A card's wallet, connected while its panel shows, emptied as "Empty the card" does. */
function CardWalletDrain({
  card,
  onBusy,
  onDone
}: {
  card: RescueCardWallet;
  onBusy: (busy: boolean) => void;
  onDone: (changed: boolean) => void;
}) {
  const { t } = useTranslation();
  const styles = useStyles();
  const desktop = useIsDesktop();
  const { loaded, retry } = useCardWallet(card.wallet);
  if (loaded.status === "ready") {
    return (
      <CardDrain
        key={`${loaded.lease.cardId}/${loaded.lease.generation}`}
        source={rescueCardSource(loaded.lease, card.current)}
        readBalance={() => loaded.lease.wallet.getBalance(true)}
        desktop={desktop}
        onBusy={onBusy}
        onDone={onDone}
      />
    );
  }
  if (loaded.status === "failed") {
    return (
      <View style={styles.failed}>
        <Callout tone="error" testID="rescue-drain-failed">
          {t("cards.wallet.failed")}
        </Callout>
        <Button variant="secondary" onPress={retry} testID="rescue-drain-retry">
          {t("card.retry")}
        </Button>
      </View>
    );
  }
  return (
    <View style={styles.reading} testID="rescue-drain-loading">
      <Spinner size={18} />
    </View>
  );
}

/**
 * "Export the history": "Wallet"'s export (ExportSheet), over the account's activity
 * read while it shows (useOwnerActivity, its wallet connected for it). Mounted while it shows.
 */
function RescueExport({ onClose }: { onClose: () => void }) {
  const { exportSources } = useOwnerActivity();
  return <ExportSheet visible onClose={onClose} sources={exportSources} />;
}

const useStyles = makeStyles(({ colors, shadow }) => ({
  section: { gap: 16 },
  badge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 28,
    paddingHorizontal: space[5],
    borderRadius: radius.pill,
    backgroundColor: colors.warning.bg
  },
  badgeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.warning.solid },
  badgeText: { ...sans(700), fontSize: type.caption, color: colors.warning.fg },
  failed: { gap: 10, alignItems: "flex-start" },
  card: {
    borderRadius: radius.lg,
    backgroundColor: colors.background.surface,
    boxShadow: shadow.card,
    paddingHorizontal: space[6]
  },
  line: {
    minHeight: 64,
    paddingVertical: space[5],
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  divided: { borderTopWidth: 1, borderTopColor: colors.border.subtle },
  lineText: { flex: 1, gap: 2 },
  lineLabel: { ...sans(700), fontSize: type.body, color: colors.text.primary },
  lineAmount: { ...sans(600), fontSize: type.label, color: colors.text.primary },
  lineCaption: { ...sans(500), fontSize: type.caption, color: colors.text.secondary },
  reading: { alignItems: "center", paddingVertical: 20 },
  note: {
    ...sans(500),
    fontSize: type.caption,
    lineHeight: type.caption * 1.5,
    color: colors.text.secondary,
    textAlign: "center"
  }
}));
