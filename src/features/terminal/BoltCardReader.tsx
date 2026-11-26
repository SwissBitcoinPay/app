import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Image, Pressable, Text, View } from "react-native";

import { CARD_POS_WAIT_MS } from "@/config/card";
import { useBoltCardImage } from "@/features/card/boltcard-image";
import {
  fetchWithdrawRequest,
  lnurlToUrl,
  submitWithdraw,
  type Invoice
} from "@/lib/lightning/lnurl";
import { logFailure } from "@/lib/log/log";
import {
  getCardReading,
  isReadCancelled,
  readCard,
  type CardRead,
  type CardReading
} from "@/lib/nfc/boltcard";
import { makeStyles, sans, tracked, type } from "@/theme";

import { cardRefusalOf, type CardRefusal } from "./card-refusal";

type Status = "idle" | "reading" | "paying" | "sent" | "failed";

/**
 * Pause before listening again after a failed card: the same card, still against the phone, is not
 * read again at once (its refusal shows over the code meanwhile, CardRefusalVeil.tsx).
 */
const RETRY_DELAY_MS = 2500;
/**
 * A card's service accepted the request but the invoice is still unpaid this long after (no route,
 * not enough funds): the card can be presented again.
 */
const SENT_TIMEOUT_MS = 20_000;

/**
 * "Or tap the BoltCard": a BoltCard is an LNURL-withdraw on an NFC tag. Its
 * tap asks the card's service to pay the invoice shown (LUD-03); the payment is then seen like any
 * other, by the invoice's checks. Android listens on its own while the invoice is shown; iOS and
 * the web need a tap on the line to open their reader. Hidden without an NFC reader.
 *
 * `stopped`: the sale was paid and its screen is leaving (PaidArrival.tsx), still shown: the line
 * keeps what it showed, but reads no card any more and a card being read no longer pays.
 *
 * `onRefusal`: why a card did not pay (card-refusal.ts), for the screen to show it over the code;
 * null once another card is read. The line itself then invites a card
 * again, as before any.
 */
export function BoltCardReader({
  invoice,
  stopped = false,
  onRefusal
}: {
  invoice: Invoice;
  stopped?: boolean;
  onRefusal?: (refusal: CardRefusal | null) => void;
}) {
  const styles = useStyles();
  const boltCard = useBoltCardImage();
  const { t } = useTranslation();
  const [reading, setReading] = useState<CardReading | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const current = useRef<CardRead | null>(null);
  // Whether a card may still pay the invoice: mounted, and not stopped.
  const alive = useRef(!stopped);

  // Stopped, then shown again (the sale no longer counted as paid): listening starts over.
  const [wasStopped, setWasStopped] = useState(stopped);
  if (stopped !== wasStopped) {
    setWasStopped(stopped);
    if (!stopped) setStatus("idle");
  }

  useEffect(() => {
    if (stopped) return;
    alive.current = true;
    void getCardReading().then((mode) => {
      if (alive.current) setReading(mode);
    });
    return () => {
      alive.current = false;
      current.current?.cancel();
    };
  }, [stopped]);

  const readOnce = async () => {
    if (current.current || !alive.current) return;
    const read = readCard({ alertMessage: t("pos.boltcard.alert") });
    current.current = read;
    setStatus("reading");
    try {
      const lnurl = await read.lnurl;
      if (!alive.current) return;
      setStatus("paying");
      // A card read: an earlier one's refusal no longer stands.
      onRefusal?.(null);
      const url = lnurlToUrl(lnurl);
      if (!url) throw new Error("Not an LNURL");
      const withdraw = await fetchWithdrawRequest(url);
      // Left meanwhile (cancelled, expired, paid otherwise): nothing watches this invoice any more,
      // the card must not pay it.
      if (!alive.current) return;
      // The card's service may wait for its holder's answer before it answers (the card relay: a
      // minute to confirm, CARD_RELAY_WAIT_MS in all): "Card payment in progress…" meanwhile,
      // never a refusal before it answered.
      await submitWithdraw(withdraw, invoice, { timeoutMs: CARD_POS_WAIT_MS });
      if (alive.current) setStatus("sent");
    } catch (error) {
      if (!alive.current) return;
      // The reading sheet closed by the payer or the merchant (iOS): not a card failure.
      if (reading === "tap" && isReadCancelled(error)) {
        setStatus("idle");
        return;
      }
      logFailure("BoltCard payment failed", error);
      setStatus("failed");
      onRefusal?.(cardRefusalOf(error, t));
    } finally {
      current.current = null;
    }
  };

  // "Sent" only means the card's service accepted: without a payment meanwhile (which closes this
  // screen), the card can be presented again. Not shown as a refusal: the payment may still land,
  // and paying this same invoice twice is impossible (one payment hash, one payment).
  useEffect(() => {
    if (status !== "sent") return;
    const timer = setTimeout(() => setStatus("idle"), SENT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [status]);

  // Android: listens as soon as the invoice is shown, and again after a failed card. Keyed on the
  // status only: the invoice's countdown re-renders this line every second, which must not restart
  // the retry delay (longer than a second, it would then never end).
  useEffect(() => {
    if (
      stopped ||
      reading !== "auto" ||
      status === "reading" ||
      status === "paying" ||
      status === "sent"
    ) {
      return;
    }
    const timer = setTimeout(() => void readOnce(), status === "failed" ? RETRY_DELAY_MS : 0);
    return () => clearTimeout(timer);
    // readOnce reads the invoice, fixed for this line's life (a new invoice mounts a new one).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reading, status, stopped]);

  if (reading === null || reading === "none") return null;

  const label =
    status === "paying"
      ? t("pos.boltcard.paying")
      : status === "sent"
        ? t("pos.boltcard.sent")
        : reading === "tap"
          ? t("pos.boltcard.tap")
          : t("pos.boltcard.approach");

  const content = (
    <>
      <Image source={boltCard} style={styles.card} accessibilityIgnoresInvertColors />
      <Text style={styles.label} accessibilityLiveRegion="polite">
        {label}
      </Text>
    </>
  );

  if (reading === "tap" && (status === "idle" || status === "failed")) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => void readOnce()}
        style={styles.row}
        testID="boltcard"
      >
        {content}
      </Pressable>
    );
  }
  return (
    <View style={styles.row} testID="boltcard">
      {content}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 11,
    minHeight: 44
  },
  card: { width: 32, height: 32 },
  label: {
    ...sans(500),
    fontSize: type.label,
    letterSpacing: tracked.label,
    color: colors.text.secondary,
    flexShrink: 1,
    textAlign: "center"
  }
}));
