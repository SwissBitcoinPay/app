import { useIsFocused, useRouter } from "expo-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Platform, ScrollView, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { AmountBlock } from "@/components/ui/AmountBlock";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Keypad, KEYPAD_HEIGHT, KEYPAD_MIN_HEIGHT } from "@/components/ui/Keypad";
import { outOfReach } from "@/components/ui/reach";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { DESTINATION_ICONS } from "@/features/navigation/destinations";
import { ArticlesPad } from "@/features/terminal/ArticlesPad";
import {
  NOTE_MAX_LENGTH,
  NoteCaption,
  type NoteCaptionHandle
} from "@/features/terminal/NoteCaption";
import { HEADER_HEIGHT, PosFrame, POS_COLUMN_WIDTH, posColumn } from "@/features/terminal/PosFrame";
import { usePos } from "@/features/terminal/pos";
import type { PosMode } from "@/features/terminal/pos-mode-format";
import { ScanPad } from "@/features/terminal/ScanPad";
import { useBasketSale } from "@/features/terminal/useBasketSale";
import { formatInteger } from "@/lib/locale/format";
import { secureRandomBytes } from "@/lib/random";
import { currentRelays } from "@/lib/relays/current";
import {
  fiatToSats,
  formatFiat,
  formatSatsGrouped,
  pressKey,
  type KeypadKey
} from "@/lib/terminal/amount";
import { makeStyles, motion, sans, space, type, useTheme } from "@/theme";

export { NOTE_MAX_LENGTH };

const KEYBOARD_KEYS: Record<string, KeypadKey> = {
  "0": "0",
  "1": "1",
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
  "6": "6",
  "7": "7",
  "8": "8",
  "9": "9",
  Backspace: "del",
  Delete: "del"
};

/**
 * Amount entry. The keypad is the terminal's home: the total is composed live in tabular
 * figures, its sats follow at the current rate. The note is optional, written in place under the
 * amount (NoteCaption). "Charge" fixes the amount in sats and shows the invoice.
 *
 * One selector "Amount" / "Items" / "Scan" in the
 * header's centre, in place of the business's name, with the views offered (posViewsOf: on the
 * owner's device always, on an employee's with an article; "Scan" in the apps, which have a
 * camera). "Items" shows the catalogue's tiles (ArticlesPad), the basket's total and "View
 * basket"; "Scan" the camera and what it read (ScanPad), the same basket. On desktop the
 * selector is at the header's right. "Scan" has its camera under the selector, and "Items" has its
 * note in the basket.
 */
export default function AmountScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useStyles();
  const router = useRouter();
  const desktop = useIsDesktop();
  const pos = usePos();
  const { profile, digits, languageTag, rate, minor, setMinor, note, setNote, setSale } = pos;
  const { catalog, mode, views, setMode, basket } = pos;
  const basketSale = useBasketSale();
  const articles = mode === "articles";
  const scanning = mode === "scan";
  const [editingNote, setEditingNote] = useState(false);
  const noteCaption = useRef<NoteCaptionHandle>(null);
  // Mobile: while the note is written, the keypad and "Charge" fade out, out of reach, for the
  // keyboard over them. The desktop layout keeps them: no keyboard over them there.
  const keypadHidden = editingNote && !desktop && mode === "amount";
  const keypadShown = useSharedValue(1);
  useEffect(() => {
    keypadShown.set(withTiming(keypadHidden ? 0 : 1, { duration: motion.noteKeypad }));
  }, [keypadHidden, keypadShown]);
  const keypadFade = useAnimatedStyle(() => ({ opacity: keypadShown.get() }));
  // The keypad stays mounted under the invoice (stack): it acts only while it is the screen shown.
  const focused = useIsFocused();
  // A ref: a double tap must not push a second invoice before the navigation re-renders.
  const charging = useRef(false);
  useEffect(() => {
    if (focused) charging.current = false;
  }, [focused]);

  const sats = rate.rate !== undefined && minor > 0 ? fiatToSats(minor, digits, rate.rate) : null;
  const canCharge = sats !== null && sats > 0n;
  // Nothing typed yet: "0", without decimals (they come with the first key: 0,02).
  const amount =
    minor === 0 ? formatInteger(0, languageTag) : formatFiat(minor, digits, languageTag);
  // Every digit and both separators (12 345 678,90): the animated figure measures them ahead.
  const glyphs = formatFiat(1234567890, digits, languageTag);

  const press = (key: KeypadKey) => setMinor(pressKey(minor, key, digits));
  const charge = () => {
    if (!canCharge || sats === null || !focused || charging.current) return;
    // Never fixed from another hour's point (requireFreshRate): the shown one may have ended since.
    if (rate.current() === undefined) return;
    charging.current = true;
    // A note still being written goes with the sale, as written (a tablet's hardware keyboard:
    // "Charge" taken without "OK"), and its writing ends.
    const saleNote = noteCaption.current?.end() ?? note;
    setSale({
      minor,
      sats,
      note: saleNote,
      tappedAt: Date.now(),
      key: secureRandomBytes(32),
      relays: currentRelays(),
      basket: null
    });
    router.push("/pos/charge");
  };

  // Desktop and web keyboards: digits, delete, Enter, for the keypad only.
  useEffect(() => {
    if (
      Platform.OS !== "web" ||
      !focused ||
      editingNote ||
      mode !== "amount" ||
      typeof document === "undefined"
    ) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "Enter") {
        // A focused button (a key, "Charge", the note) acts on Enter itself: charging as well
        // would push a second invoice, or charge instead of the key.
        if (target?.closest?.('button, a, [role="button"], [role="link"]')) return;
        event.preventDefault();
        charge();
        return;
      }
      const key = KEYBOARD_KEYS[event.key];
      if (key) {
        event.preventDefault();
        press(key);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const satsLine = sats !== null ? formatSatsGrouped(sats) : undefined;
  const rateMessage =
    rate.rate === undefined ? t(rate.loading ? "pos.rateLoading" : "pos.rateUnavailable") : null;

  const amountBlock = (
    <View style={styles.amount}>
      <AmountBlock
        amount={amount}
        minor={minor}
        glyphs={glyphs}
        currency={profile.currency}
        sats={satsLine}
        satsLabel={
          sats !== null ? t("pos.satsLabel", { sats: formatInteger(sats, languageTag) }) : undefined
        }
        size="display"
        bold
      />
      {rateMessage ? (
        <Text style={styles.rateMessage} accessibilityLiveRegion="polite">
          {rateMessage}
        </Text>
      ) : minor === 0 ? (
        // Keeps the sats line's height: nothing moves when the first key is pressed.
        <View style={styles.satsPlaceholder} />
      ) : null}
    </View>
  );

  const noteAction = (
    <NoteCaption
      ref={noteCaption}
      note={note}
      onChange={setNote}
      maxLength={NOTE_MAX_LENGTH}
      languageTag={languageTag}
      onEditingChange={setEditingNote}
    />
  );

  const chargeButton = (
    <Button
      onPress={charge}
      disabled={!canCharge}
      amount={canCharge ? `${amount} ${profile.currency}` : undefined}
      testID="charge"
    >
      {t("pos.charge")}
    </Button>
  );

  const keypad = (fit: boolean) => (
    <Keypad onPress={press} deleteLabel={t("pos.deleteKey")} fit={fit} />
  );

  // "Items": the basket's total at the rates shown, "Charge" fixing it (useBasketSale).
  const { total } = basketSale;
  const basketMinor = total.status === "ok" ? total.minor : 0;
  const basketUnits = total.status === "ok" ? total.units : 0;
  const basketAmount =
    basketMinor === 0
      ? formatInteger(0, languageTag)
      : formatFiat(basketMinor, digits, languageTag);
  const basketMessage =
    total.status === "noRate"
      ? t(rate.loading ? "pos.rateLoading" : "pos.rateUnavailable")
      : total.status === "tooLarge"
        ? t("pos.basket.tooLarge")
        : rateMessage;
  const chargeBasket = () => {
    noteCaption.current?.end();
    if (basketSale.charge()) router.push("/pos/charge");
  };
  const openBasket = () => router.push("/pos/basket");

  const articlesAmount = (
    <View style={styles.amount}>
      <AmountBlock
        amount={basketAmount}
        minor={basketMinor}
        glyphs={glyphs}
        currency={profile.currency}
        sats={basketSale.sats !== null ? formatSatsGrouped(basketSale.sats) : undefined}
        satsLabel={
          basketSale.sats !== null
            ? t("pos.satsLabel", { sats: formatInteger(basketSale.sats, languageTag) })
            : undefined
        }
        size="display"
        bold
      />
      {basketMessage ? (
        <Text style={styles.rateMessage} accessibilityLiveRegion="polite">
          {basketMessage}
        </Text>
      ) : basketSale.sats === null ? (
        <View style={styles.satsPlaceholder} />
      ) : null}
    </View>
  );

  // Under the total, as tall as the note: the way to the basket, or what a tap on a tile does.
  const basketRow = (
    <View style={styles.basketRow}>
      {basket.length > 0 ? (
        <Button variant="text" size="md" onPress={openBasket} testID="open-basket">
          {t("pos.basket.open")}
        </Button>
      ) : catalog.articles.length > 0 ? (
        <Text style={styles.basketHint}>{t("pos.articles.hint")}</Text>
      ) : null}
    </View>
  );

  const articlesChargeButton = (
    <Button
      onPress={chargeBasket}
      disabled={!basketSale.canCharge}
      amount={basketSale.canCharge ? `${basketAmount} ${profile.currency}` : undefined}
      testID="charge"
    >
      {basketUnits > 0 ? t("pos.basket.charge", { count: basketUnits }) : t("pos.charge")}
    </Button>
  );

  // The icons of the point of sale's and "Items"'s destinations, and
  // the scan's barcode.
  const viewOptions = {
    amount: { value: "amount", label: t("pos.mode.amount"), icon: DESTINATION_ICONS.pos },
    articles: {
      value: "articles",
      label: t("pos.mode.articles"),
      icon: DESTINATION_ICONS.articles
    },
    scan: { value: "scan", label: t("pos.mode.scan"), icon: "barcode" }
  } as const;
  const modeSwitch =
    views.length > 1 ? (
      <SegmentedControl<PosMode>
        options={views.map((view) => viewOptions[view])}
        value={mode}
        onChange={(next) => {
          noteCaption.current?.end();
          setMode(next);
        }}
        label={t("pos.mode.label")}
        // Mobile: in the header, between its actions. Larger text sizes leave labels out rather than
        // overflow it. Desktop: at the header's right, with room to spare.
        fit={desktop ? undefined : { maxHeight: HEADER_HEIGHT }}
        testID="pos-mode"
      />
    ) : null;

  // Apps: a tap elsewhere than the note being written keeps it, as on the web, where the field
  // loses the focus by itself. Keys and buttons take their own taps (their responder is deeper);
  // the keypad faded out of reach lets them through. A plain responder, not a Pressable: a disabled
  // Pressable would mark the whole screen disabled for screen readers (aria-disabled on the web).
  // Always there: the screen is not mounted again when the writing starts.
  const outside = (frame: ReactNode) => (
    <View
      style={styles.outside}
      onStartShouldSetResponder={() => editingNote && Platform.OS !== "web"}
      onResponderRelease={() => noteCaption.current?.end()}
      testID="note-outside"
    >
      {frame}
    </View>
  );

  if (desktop) {
    const aside = modeSwitch ?? undefined;
    if (scanning) {
      return outside(
        <PosFrame subtitle={t("pos.subtitle")} desktopAside={aside}>
          <ScanPad wide />
        </PosFrame>
      );
    }
    if (articles) {
      return outside(
        <PosFrame subtitle={t("pos.subtitle")} desktopAside={aside}>
          <View style={styles.desktopColumn}>
            {articlesAmount}
            {basketRow}
            <View style={styles.desktopPad}>
              <ArticlesPad priceOf={basketSale.priceOf} columns={4} />
            </View>
            {articlesChargeButton}
          </View>
        </PosFrame>
      );
    }
    return outside(
      <PosFrame subtitle={t("pos.subtitle")} desktopAside={aside}>
        <View style={styles.desktopColumn}>
          {amountBlock}
          {noteAction}
          {keypad(false)}
          {chargeButton}
          {Platform.OS === "web" ? (
            <View style={styles.keyboardHint}>
              <Icon name="keyboard" size={14} color={colors.text.secondary} />
              <Text style={styles.keyboardHintText}>{t("pos.keyboardHint")}</Text>
            </View>
          ) : null}
        </View>
      </PosFrame>
    );
  }

  // Two views, not one: the keypad and "Charge" stay apart (mobileContent's space-between).
  const givingWay = (child: ReactNode, style?: StyleProp<ViewStyle>) => (
    <Animated.View
      style={[style, keypadFade, { pointerEvents: keypadHidden ? "none" : "auto" }]}
      {...outOfReach(keypadHidden)}
    >
      {child}
    </Animated.View>
  );

  const title = modeSwitch ?? profile.businessName;
  if (scanning) {
    return outside(
      <PosFrame title={title} contentStyle={posColumn}>
        <ScanPad wide={false} />
      </PosFrame>
    );
  }
  if (articles) {
    return outside(
      <PosFrame title={title} contentStyle={[posColumn, styles.articlesContent]}>
        <View style={styles.mobileAmount}>{articlesAmount}</View>
        {basketRow}
        <ArticlesPad priceOf={basketSale.priceOf} columns={3} />
        {articlesChargeButton}
      </PosFrame>
    );
  }
  // The keypad's keys keep their height while the screen has room, and give way down to the touch
  // floor where it has less (a phone as short as an iPhone SE, a larger text size, a phone's
  // browser): "Charge" stays above the dock. Shorter still, the screen scrolls, as the
  // invoice's does. Taps are the screen's own (`outside`): the scroll view takes none of them, nor
  // closes the keyboard of the note being written.
  return outside(
    <PosFrame title={title} contentStyle={posColumn}>
      <ScrollView
        style={styles.fitScroll}
        contentContainerStyle={styles.mobileContent}
        keyboardShouldPersistTaps="always"
        alwaysBounceVertical={false}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.mobileAmount}>{amountBlock}</View>
        {noteAction}
        {givingWay(keypad(true), styles.mobileKeypad)}
        {givingWay(chargeButton)}
      </ScrollView>
    </PosFrame>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  outside: { flex: 1 },
  amount: { alignItems: "center", width: "100%" },
  rateMessage: {
    ...sans(500),
    fontSize: type.caption,
    color: colors.text.secondary,
    marginTop: 11,
    textAlign: "center"
  },
  // The sats line of AmountBlock: 11 px gap + an 18 px row.
  satsPlaceholder: { height: 29 },
  fitScroll: { flex: 1, minHeight: 0 },
  // At least the screen's height (flexGrow), its rows spread over it. Shorter, the keypad gives way
  // first (mobileKeypad); the gap keeps them apart once nothing is left to spread.
  mobileContent: {
    flexGrow: 1,
    justifyContent: "space-between",
    gap: space[2],
    paddingBottom: 12
  },
  // As tall as its design while there is room, as the space-between spreads what is left over.
  mobileKeypad: { flexGrow: 1, minHeight: KEYPAD_MIN_HEIGHT, maxHeight: KEYPAD_HEIGHT },
  mobileAmount: { paddingTop: 22, paddingBottom: 6 },
  articlesContent: { gap: space[5], paddingBottom: 12 },
  basketRow: { height: 56, alignItems: "center", justifyContent: "center" },
  basketHint: {
    ...sans(500),
    fontSize: type.caption,
    color: colors.text.secondary,
    textAlign: "center"
  },
  desktopColumn: { width: POS_COLUMN_WIDTH, maxWidth: "100%", gap: 18 },
  desktopPad: { height: 360 },
  keyboardHint: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  keyboardHintText: { ...sans(500), fontSize: type.caption, color: colors.text.secondary }
}));
