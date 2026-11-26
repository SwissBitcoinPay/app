import { useRef, useState, type ReactNode, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import {
  ScrollView,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance
} from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Arrival } from "@/components/ui/Arrival";
import { Button } from "@/components/ui/Button";
import { QuietAction } from "@/components/ui/QuietAction";
import { DockActions, DockScrollView } from "@/features/navigation/dock-area";
import type { MtpSaleRecord } from "@/lib/mtpelerin/sale-record";
import { gutter, makeStyles, sans, space, TITLE_EM, tracking, type } from "@/theme";

import { useArrivals } from "./arrivals";
import { ArrivalsPill } from "./ArrivalsPill";
import type { ActivityFormat } from "./format";
import { followUpsOf, type ActivityItem, type FollowUp } from "./model";
import {
  ActivityList,
  ActivitySheet,
  ActivityTable,
  Breadcrumb,
  DESKTOP_TITLE_ROW,
  FollowUpCard,
  FollowUpTiles,
  ListTitle,
  SectionTitle,
  type FollowUpsView
} from "./parts";

/**
 * The state chosen in "To follow up", and the rows of each. A state left without rows (paid
 * meanwhile) is no longer chosen: the list shows everything again.
 */
function useFollowUps(items: readonly ActivityItem[], states: readonly FollowUp[]): FollowUpsView {
  const [filter, setFilter] = useState<FollowUp | null>(null);
  const groups = followUpsOf(items);
  const shown = filter !== null && states.includes(filter) && groups[filter].length > 0;
  if (filter !== null && !shown) setFilter(null);
  return {
    states,
    withRows: states.filter((state) => groups[state].length > 0),
    groups,
    filter: shown ? filter : null,
    onPick: setFilter
  };
}

/** Whether "To follow up" has a row to follow: the section shows only then. */
function hasFollowUps(view: FollowUpsView): boolean {
  return view.withRows.length > 0;
}

/** Mobile's expired invoices: left out of the list until shown (useExpired), and the button. */
type ExpiredView = {
  /** The list's rows: without the expired ones unless shown. */
  rows: readonly ActivityItem[];
  /** How many rows are expired. */
  count: number;
  shown: boolean;
  toggle: () => void;
};

/**
 * Expired invoices on mobile: left out of the list by default, until "Show expired" under it shows
 * them. The desktop table has none of it: it hides them by default, its normal state rather than a
 * filter, unchecked in "Status" (parts.tsx' EXPIRED_HIDDEN). An expired invoice received nothing
 * (payment-link/final.ts, model.ts' linkItem): leaving it out hides no money. Shown until the
 * screen is left, or until no row is expired any more. A list of expired rows only, hidden, never
 * says "No transactions yet.": the button under it is what shows.
 */
function useExpired(items: readonly ActivityItem[]): ExpiredView {
  const [shown, setShown] = useState(false);
  const kept = items.filter((item) => item.state !== "expired");
  const count = items.length - kept.length;
  if (shown && count === 0) setShown(false);
  return {
    rows: shown ? items : kept,
    count,
    shown,
    toggle: () => setShown((value) => !value)
  };
}

/**
 * "Show expired (2)", then "Hide expired", under the list: only while some row is expired and no
 * state of "To follow up" is chosen (its rows are none of them). Small and quiet: a QuietAction.
 */
function ExpiredToggle({ expired, filter }: { expired: ExpiredView; filter: FollowUp | null }) {
  const styles = useStyles();
  const { t } = useTranslation();
  if (expired.count === 0 || filter !== null) return null;
  return (
    <QuietAction
      label={
        expired.shown
          ? t("activity.hideExpired")
          : t("activity.showExpired", { count: expired.count })
      }
      onPress={expired.toggle}
      style={styles.expiredToggle}
      testID="activity-expired-toggle"
    />
  );
}

/** "Show more" under the list: older movements are left out of it (useOwnerActivity). */
export type ListMore = {
  /** What it asked for is being read: the button waits. */
  loading: boolean;
  onPress: () => void;
};

/**
 * "Show more", under the list: while older movements are left out and no state of "To follow up" is
 * chosen (its rows are all there). Secondary and small, centred: the screen's filled button is
 * "Send"; waiting while its rows are read.
 */
function ShowMore({ more, filter }: { more: ListMore | null; filter: FollowUp | null }) {
  const styles = useStyles();
  const { t } = useTranslation();
  if (more === null || filter !== null) return null;
  return (
    <Button
      variant="secondary"
      size="sm"
      fullWidth={false}
      loading={more.loading}
      onPress={more.onPress}
      style={styles.more}
      testID="activity-more"
    >
      {t("activity.showMore")}
    </Button>
  );
}

/**
 * The row opened, read again from each new list (closed for good once no longer listed). `items` is
 * the whole list, expired rows included: a link reaching its end while its details show stays open,
 * hidden from the list or not. A row the screen opens itself (`onOpen` returns true: an invoice of
 * "New invoice") opens no sheet.
 */
function useOpened(items: readonly ActivityItem[], onOpen?: (item: ActivityItem) => boolean) {
  const [openId, setOpenId] = useState<string | null>(null);
  const opened = items.find((item) => item.id === openId) ?? null;
  if (openId !== null && opened === null) setOpenId(null);
  return {
    opened,
    open: (item: ActivityItem) => {
      if (!onOpen?.(item)) setOpenId(item.id);
    },
    close: () => setOpenId(null)
  };
}

/**
 * Whether the list's top is out of sight (scrolled down past it): what arrives then is kept out of
 * the list (arrivals.ts), nothing moves under the eyes or the finger. `listLayout` measures where
 * the list starts in the scroll view's content; `onScroll` follows the scroll; `toTop` scrolls back
 * up to the list ("N new transactions"), `room` above it (its title), the rows kept out coming in
 * meanwhile.
 */
function useListInSight(scroll: RefObject<ScrollViewInstance | null>, room: number) {
  const reduceMotion = useReducedMotion();
  const [listTop, setListTop] = useState(0);
  const [away, setAway] = useState(false);
  return {
    away,
    listLayout: (event: LayoutChangeEvent) => setListTop(event.nativeEvent.layout.y),
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) =>
      setAway(event.nativeEvent.contentOffset.y > listTop),
    toTop: () => {
      setAway(false);
      scroll.current?.scrollTo({ y: Math.max(0, listTop - room), animated: !reduceMotion });
    }
  };
}

/** How often a scroll view tells its scroll (ms): each frame, to keep the list's top in sight. */
const SCROLL_THROTTLE_MS = 16;

type ActivityViewProps = {
  items: readonly ActivityItem[];
  /** The states of "To follow up" the screen follows. */
  states: readonly FollowUp[];
  /** "Transactions", or "Your transactions" / "All your transactions" (an employee). */
  rootTitle: string;
  /** The owner's view: who took each sale (the desktop's "By", the details). */
  showBy: boolean;
  /** The wallet's first sync is not done: newer payments may come (the owner's view). */
  syncing: boolean;
  format: ActivityFormat;
  /** A row the screen opens itself: true when it did (no sheet then). */
  onOpen?: (item: ActivityItem) => boolean;
  /** Without a movement, in place of "No transactions yet." (the owner's guide). */
  emptyGuide?: ReactNode;
  /**
   * Mobile: since when (Unix seconds) the list holds every movement, for its days' nets
   * (ActivityList); null or absent, no net is told.
   */
  listedFrom?: number | null;
  /** Older movements are left out: "Show more" under the list. Null or absent: none is. */
  more?: ListMore | null;
  /**
   * The owner's list: its rows "Underpaid" offer "Accept the amount received", and this reads the
   * acceptances again once one is made (ActivitySheet).
   */
  onAccepted?: () => void;
  /** The owner's list: a sale to Mt Pelerin's "Track the sale" (ActivitySheet). */
  onFollowSale?: (sale: MtpSaleRecord) => void;
};

/**
 * Mobile: what heads the screen (`top`: the balance, or the employee), "To follow up" when it has a
 * row to follow, then the list by day under its title (each day's rows in a card, its net beside
 * it), `listAction` at the title's right ("Export", an icon), all scrolling together under `footer`
 * ("Send") and the dock, both floating over it (DockScrollView, DockActions). The scrolling part
 * spans the screen's width, out of the frame's gutter (PosFrame), each part taking it back
 * (`guttered`, the list's `inset`).
 */
export function MobileActivity({
  items,
  states,
  rootTitle,
  showBy,
  syncing,
  format,
  onOpen,
  emptyGuide,
  listedFrom = null,
  more = null,
  top,
  footer,
  listAction,
  onAccepted,
  onFollowSale,
  arrival = false
}: ActivityViewProps & {
  top: ReactNode;
  footer?: ReactNode;
  listAction?: ReactNode;
  /** The screen waited on its loading scene: the view fades in (Arrival.tsx). */
  arrival?: boolean;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const scroll = useRef<ScrollViewInstance>(null);
  const sight = useListInSight(scroll, MOBILE_TITLE_ROOM);
  // The rows shown: those arrived while the list's top is out of sight wait (arrivals.ts).
  const { rows, arriving, held } = useArrivals(items, sight.away);
  const view = useFollowUps(rows, states);
  const expired = useExpired(rows);
  const { opened, open, close } = useOpened(items, onOpen);
  return (
    <Arrival fade={arrival} style={styles.mobile}>
      <DockScrollView
        ref={scroll}
        style={[styles.scroll, styles.fullWidth]}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={sight.onScroll}
        scrollEventThrottle={SCROLL_THROTTLE_MS}
        testID="activity-scroll"
      >
        <View style={styles.guttered}>
          {top}
          {hasFollowUps(view) ? (
            <>
              <View style={styles.followUpTitle}>
                <SectionTitle>{t("activity.followUp")}</SectionTitle>
              </View>
              <FollowUpCard view={view} format={format} />
            </>
          ) : null}
          <View style={[styles.listTitle, listAction ? styles.listTitleRow : null]}>
            <View style={styles.listTitleText}>
              <ListTitle root={rootTitle} view={view} syncing={syncing} />
            </View>
            {/* Its 44 px target taller than the title: the row keeps the title's height. */}
            {listAction ? <View style={styles.listAction}>{listAction}</View> : null}
          </View>
          {format.hasRate ? null : <Text style={styles.noRate}>{t("wallet.noRate")}</Text>}
        </View>
        <View onLayout={sight.listLayout}>
          <ActivityList
            items={expired.rows}
            filter={view.filter}
            format={format}
            onOpen={open}
            empty={!syncing && expired.count === 0}
            emptyGuide={emptyGuide}
            inset={gutter}
            listedFrom={listedFrom}
            arriving={arriving}
          />
        </View>
        <ShowMore more={more} filter={view.filter} />
        <ExpiredToggle expired={expired} filter={view.filter} />
      </DockScrollView>
      <ArrivalsPill count={held} onPress={sight.toTop} top={space[4]} />
      {footer ? <DockActions style={styles.footer}>{footer}</DockActions> : null}
      <ActivitySheet
        item={opened}
        format={format}
        showBy={showBy}
        onClose={close}
        onAccepted={onAccepted}
        onFollowSale={onFollowSale}
      />
    </Arrival>
  );
}

/**
 * Desktop: the header (the title, and `aside`: the balance and "Send", or the employee), `notice`
 * under it (what the wallet's sync could not prove, useWalletData), "To follow up" in tiles when it
 * has a row to follow, then the table under its breadcrumb, `listAction` at the breadcrumb's right
 * ("New invoice"). `items` null:
 * `children` instead (loading, a failure). `arrival`: the screen waited on its loading scene, the
 * table fades in under the header (Arrival.tsx).
 */
export function DesktopActivity({
  title,
  aside,
  notice,
  items,
  children,
  arrival = false,
  ...props
}: Omit<ActivityViewProps, "items"> & {
  title: string;
  aside: ReactNode;
  notice?: ReactNode;
  items: readonly ActivityItem[] | null;
  listAction?: ReactNode;
  children?: ReactNode;
  arrival?: boolean;
}) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.desktop, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {aside}
      </View>
      {notice ? <View style={styles.notice}>{notice}</View> : null}
      {items ? (
        <Arrival fade={arrival} style={styles.arrival}>
          <DesktopBody items={items} {...props} />
        </Arrival>
      ) : (
        children
      )}
    </View>
  );
}

function DesktopBody({
  items,
  states,
  rootTitle,
  showBy,
  syncing,
  format,
  onOpen,
  emptyGuide,
  more = null,
  listAction,
  onAccepted,
  onFollowSale
}: ActivityViewProps & { listAction?: ReactNode }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const scroll = useRef<ScrollViewInstance>(null);
  const sight = useListInSight(scroll, 0);
  // The rows shown: those arrived while the table's top is out of sight wait (arrivals.ts).
  const { rows, arriving, held } = useArrivals(items, sight.away);
  const view = useFollowUps(rows, states);
  const { opened, open, close } = useOpened(items, onOpen);
  return (
    <>
      {hasFollowUps(view) ? (
        <View style={styles.tilesArea}>
          <View style={styles.tilesTitle}>
            <SectionTitle>{t("activity.followUp")}</SectionTitle>
          </View>
          <FollowUpTiles view={view} format={format} />
        </View>
      ) : null}
      <View style={styles.tableTitle}>
        <View style={styles.tableTitleCrumb}>
          <Breadcrumb root={rootTitle} view={view} syncing={syncing} />
        </View>
        {listAction}
      </View>
      <View style={styles.scroll}>
        <ScrollView
          ref={scroll}
          style={styles.scroll}
          contentContainerStyle={styles.tableContent}
          showsVerticalScrollIndicator={false}
          onScroll={sight.onScroll}
          scrollEventThrottle={SCROLL_THROTTLE_MS}
          testID="activity-scroll"
        >
          {format.hasRate ? null : (
            <Text style={[styles.noRate, styles.noRateDesktop]}>{t("wallet.noRate")}</Text>
          )}
          <View onLayout={sight.listLayout}>
            <ActivityTable
              items={rows}
              filter={view.filter}
              format={format}
              showBy={showBy}
              onOpen={open}
              empty={!syncing}
              emptyGuide={emptyGuide}
              arriving={arriving}
            />
          </View>
          <ShowMore more={more} filter={view.filter} />
        </ScrollView>
        <ArrivalsPill count={held} onPress={sight.toTop} top={space[5]} />
      </View>
      <ActivitySheet
        item={opened}
        format={format}
        showBy={showBy}
        onClose={close}
        onAccepted={onAccepted}
        onFollowSale={onFollowSale}
      />
    </>
  );
}

/** Mobile: scrolled back up to the list, the room left above it for its title ("Transactions"). */
const MOBILE_TITLE_ROOM = 64;

const useStyles = makeStyles(({ colors }) => ({
  mobile: { flex: 1, minHeight: 0 },
  // The table and what is above it, under the header: the column's rest.
  arrival: { flex: 1, minHeight: 0 },
  scroll: { flex: 1, minHeight: 0 },
  // Above `footer` or the dock (DockScrollView).
  scrollContent: { paddingBottom: 16 },
  // Out of PosFrame's mobile gutter, which the content takes back (`guttered`, the list's `inset`).
  fullWidth: { marginHorizontal: -gutter },
  guttered: { paddingHorizontal: gutter },
  followUpTitle: { paddingTop: 26, paddingBottom: 12 },
  listTitle: { paddingTop: 28, paddingBottom: 2 },
  listTitleRow: { flexDirection: "row", alignItems: "center", gap: space[5] },
  listTitleText: { flex: 1, minWidth: 0 },
  listAction: { marginVertical: -12 },
  footer: { paddingTop: 12 },
  noRate: {
    ...sans(500),
    marginTop: 12,
    fontSize: type.caption,
    color: colors.text.secondary
  },
  // On the cream, above the table's card: 10 px between them, as under the breadcrumb.
  noRateDesktop: { paddingHorizontal: 22, marginBottom: 10 },
  // Under the list, centred.
  expiredToggle: { alignSelf: "center", marginTop: space[2] },
  // Under the list, centred, as "Show expired".
  more: { alignSelf: "center", marginTop: space[5] },

  desktop: { flex: 1, backgroundColor: colors.background.app },
  header: {
    height: 108,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 22,
    paddingTop: 30,
    paddingHorizontal: 38,
    paddingBottom: 22,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle
  },
  title: {
    ...sans(700),
    fontSize: 26,
    letterSpacing: tracking(TITLE_EM, 26),
    color: colors.text.primary
  },
  tilesArea: { paddingTop: 22, paddingHorizontal: 38 },
  // As "To follow up"'s tiles below it.
  notice: { paddingTop: 22, paddingHorizontal: 38 },
  // "To follow up" at the level of "All transactions" below: the breadcrumb's row.
  tilesTitle: { height: DESKTOP_TITLE_ROW, justifyContent: "center", marginBottom: 10 },
  // 10 below, then the table's card (its head's 44 px buttons, ColumnHeader, fill its 44 px).
  tableTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingTop: 22,
    paddingHorizontal: 38,
    paddingBottom: 10
  },
  tableTitleCrumb: { flex: 1, minWidth: 0 },
  tableContent: { paddingHorizontal: 38, paddingBottom: 24 }
}));
