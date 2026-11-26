import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type ViewStyle
} from "react-native";
import Animated, {
  cancelAnimation,
  clamp,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { Notification, withoutFinalPeriod } from "@/components/ui/Notification";
import { OverModalsContext } from "@/components/ui/overlay";
import { useEased } from "@/features/navigation/motion";
import { motion, space } from "@/theme";

import {
  addEntry,
  dropEntry,
  leaveEntry,
  NOTIFICATION_DURATION,
  stackOffsets,
  swipeAxis,
  swipeDismisses,
  type NotificationEntry,
  type NotificationInput,
  type SwipeAxis
} from "./stack";

// In with an ease-out, out with an ease-in (CSS `ease-in`).
const IN_EASING = Easing.bezier(0.2, 0.7, 0.3, 1);
const OUT_EASING = Easing.bezier(0.42, 0, 1, 1);
/** How far a notification slides in from its edge, and back towards it on its way out. */
const IN_SHIFT = 12;
const OUT_SHIFT = 8;
/** Width of a notification: 420 on desktop, the screen's width on a phone. */
const MAX_WIDTH = 420;
/** Mobile: just under the status bar, 12 pt from the screen's sides. */
const MOBILE_TOP = space[3];
const MOBILE_SIDE = space[5];
/** Desktop: above the window's bottom edge, centred on the content area. */
const DESKTOP_BOTTOM = space[8];
/** Left after a pointer leaves the stack, at least, so that nothing vanishes under the eyes. */
const RESUME_AT_LEAST = 1200;
/**
 * In a browser, a finger on a notification slides it, never the page under it (without it, the
 * browser takes the touch for the page's scroll and cancels the slide); two fingers still zoom.
 * Web only (read as it renders): React Native's types list no such style.
 */
const NO_PAN = { touchAction: "pinch-zoom" } as unknown as ViewStyle;
/** A finger held still this long before it lifts flings nothing: its last speed is past. */
const FLING_WINDOW = 100;

type NotificationsApi = {
  /** Shows a notification; returns its id (that of the one it updated, with the same `key`). */
  notify: (notification: NotificationInput) => number;
  dismiss: (id: number) => void;
};

const NotificationsContext = createContext<NotificationsApi | null>(null);
const AreaContext = createContext<(left: number) => void>(() => undefined);
/** Called by a panel's layer while the panel shows (`OverModals`); returns its release. */
const ClaimContext = createContext<(host: string) => () => void>(() => () => undefined);
/** The panel whose Modal draws the stack (none: the app does), and the stack. */
const PlacedContext = createContext<{ host: string | undefined; stack: ReactNode }>({
  host: undefined,
  stack: null
});

export function useNotifications(): NotificationsApi {
  const api = useContext(NotificationsContext);
  if (!api) throw new Error("useNotifications needs a NotificationsProvider");
  return api;
}

/**
 * Desktop: the content area starts `left` points from the window's left edge (the side bar), and
 * the notifications centre on it while the calling screen is mounted.
 */
export function useNotificationArea(left: number) {
  const setLeft = useContext(AreaContext);
  useEffect(() => {
    setLeft(left);
    return () => setLeft(0);
  }, [left, setLeft]);
}

type Timer = { handle?: ReturnType<typeof setTimeout>; left: number; since: number };

/**
 * The app's notifications, over every screen: at the top on mobile,
 * at the bottom and centred on the content on desktop. They stack, the newest at the edge:
 * five at most, a sixth sends the oldest out (one that stays until dismissed last, `addEntry`).
 * Each leaves after its duration, once its action is pressed, or swiped away (sideways, or towards
 * its edge); a pointer over the stack, or a finger sliding one, holds them.
 *
 * Above the panels too (Sheet, ConfirmDialog): a Modal covers whatever is drawn outside it, so
 * while panels show, the stack is drawn inside the Modal of the one shown last (`OverModals`), over
 * its scrim, and goes back to the app once none shows. Moved, a notification already in place
 * shows at once, where it was.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<NotificationEntry[]>([]);
  const [heights, setHeights] = useState<Record<number, number>>({});
  const [areaLeft, setAreaLeft] = useState(0);
  // The panels shown, in the order they opened: the last one draws the stack.
  const [hosts, setHosts] = useState<string[]>([]);
  // The notifications that came in: drawn again elsewhere, they show at once.
  const [entered, setEntered] = useState<ReadonlySet<number>>(new Set());
  // The stack as last set, for `notify` to know synchronously which entry it made or updated.
  const current = useRef<NotificationEntry[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, Timer>());
  const held = useRef(false);

  const update = useCallback((next: NotificationEntry[]) => {
    current.current = next;
    setEntries(next);
  }, []);

  const stopTimer = useCallback((id: number) => {
    clearTimeout(timers.current.get(id)?.handle);
    timers.current.delete(id);
  }, []);

  const dismiss = useCallback(
    (id: number) => {
      stopTimer(id);
      update(leaveEntry(current.current, id));
    },
    [stopTimer, update]
  );

  const startTimer = useCallback(
    (id: number, ms: number) => {
      clearTimeout(timers.current.get(id)?.handle);
      const timer: Timer = { left: ms, since: Date.now() };
      if (!held.current) timer.handle = setTimeout(() => dismiss(id), ms);
      timers.current.set(id, timer);
    },
    [dismiss]
  );

  const notify = useCallback(
    (notification: NotificationInput) => {
      const next = addEntry(current.current, nextId.current + 1, notification);
      const entry = next.find((e) => e.notification === notification)!;
      if (entry.id > nextId.current) nextId.current = entry.id;
      // The oldest, sent out by this one.
      for (const e of next) if (e.leaving) stopTimer(e.id);
      update(next);
      const duration =
        notification.duration === undefined ? NOTIFICATION_DURATION : notification.duration;
      // Until dismissed: no timer, also when it updates one that had one.
      if (duration === null) stopTimer(entry.id);
      else startTimer(entry.id, duration);
      if (Platform.OS !== "web") {
        // On the web, the card's role (status / alert) has it read.
        const title =
          notification.titleLabel ??
          (typeof notification.title === "string" ? notification.title : undefined);
        const body =
          notification.bodyLabel ??
          (typeof notification.body === "string" ? notification.body : undefined);
        AccessibilityInfo.announceForAccessibility(
          [title, body]
            .filter((text): text is string => Boolean(text))
            .map(withoutFinalPeriod)
            .join(". ")
        );
      }
      return entry.id;
    },
    [startTimer, stopTimer, update]
  );

  const hold = useCallback(
    (on: boolean) => {
      if (held.current === on) return;
      held.current = on;
      for (const [id, timer] of timers.current) {
        if (on) {
          clearTimeout(timer.handle);
          const now = Date.now();
          timers.current.set(id, { left: timer.left - (now - timer.since), since: now });
        } else startTimer(id, Math.max(timer.left, RESUME_AT_LEAST));
      }
    },
    [startTimer]
  );

  const drop = useCallback(
    (id: number) => {
      update(dropEntry(current.current, id));
      setHeights(({ [id]: _gone, ...rest }) => rest);
      setEntered((all) => {
        if (!all.has(id)) return all;
        const rest = new Set(all);
        rest.delete(id);
        return rest;
      });
    },
    [update]
  );

  const enter = useCallback((id: number) => {
    setEntered((all) => (all.has(id) ? all : new Set(all).add(id)));
  }, []);

  const claim = useCallback((host: string) => {
    setHosts((all) => [...all.filter((h) => h !== host), host]);
    return () => setHosts((all) => all.filter((h) => h !== host));
  }, []);

  const measure = useCallback((id: number, height: number) => {
    setHeights((all) => (all[id] === height ? all : { ...all, [id]: height }));
  }, []);

  useEffect(() => {
    const all = timers.current;
    return () => all.forEach((timer) => clearTimeout(timer.handle));
  }, []);

  const api = useMemo(() => ({ notify, dismiss }), [notify, dismiss]);

  const stack = useMemo(
    () => (
      <NotificationStack
        entries={entries}
        heights={heights}
        areaLeft={areaLeft}
        entered={entered}
        onHeight={measure}
        onEntered={enter}
        onDismiss={dismiss}
        onExited={drop}
        onHold={hold}
      />
    ),
    [entries, heights, areaLeft, entered, measure, enter, dismiss, drop, hold]
  );
  const host = hosts.at(-1);
  const placed = useMemo(() => ({ host, stack }), [host, stack]);

  return (
    <NotificationsContext.Provider value={api}>
      <AreaContext.Provider value={setAreaLeft}>
        <ClaimContext.Provider value={claim}>
          <PlacedContext.Provider value={placed}>
            <OverModalsContext.Provider value={overModals}>
              {children}
              {host === undefined && stack}
            </OverModalsContext.Provider>
          </PlacedContext.Provider>
        </ClaimContext.Provider>
      </AreaContext.Provider>
    </NotificationsContext.Provider>
  );
}

const overModals = (open: boolean) => <NotificationsOverModal open={open} />;

/**
 * In the Modal of a panel (`OverModals`): the stack, while this panel is the one shown last. Claimed
 * before the screen is painted, so that a notification never shows a frame under the scrim.
 */
function NotificationsOverModal({ open }: { open: boolean }) {
  const claim = useContext(ClaimContext);
  const { host, stack } = useContext(PlacedContext);
  const id = useId();
  useLayoutEffect(() => (open ? claim(id) : undefined), [open, claim, id]);
  return host === id ? stack : null;
}

type StackProps = {
  entries: NotificationEntry[];
  heights: Record<number, number>;
  areaLeft: number;
  entered: ReadonlySet<number>;
  onHeight: (id: number, height: number) => void;
  onEntered: (id: number) => void;
  onDismiss: (id: number) => void;
  onExited: (id: number) => void;
  onHold: (on: boolean) => void;
};

function NotificationStack({
  entries,
  heights,
  areaLeft,
  entered,
  onHeight,
  onEntered,
  onDismiss,
  onExited,
  onHold
}: StackProps) {
  const desktop = useIsDesktop();
  const insets = useSafeAreaInsets();
  const offsets = stackOffsets(entries, heights);
  // The stack's own height, so that every shown notification sits inside it (Android only
  // delivers touches inside a view's bounds).
  let extent = 0;
  for (const e of entries)
    if (!e.leaving) extent = Math.max(extent, (offsets.get(e.id) ?? 0) + (heights[e.id] ?? 0));

  return (
    <View style={[StyleSheet.absoluteFill, styles.layer]}>
      <View
        style={[
          styles.area,
          desktop
            ? { left: areaLeft, right: 0, bottom: insets.bottom + DESKTOP_BOTTOM }
            : { left: MOBILE_SIDE, right: MOBILE_SIDE, top: insets.top + MOBILE_TOP }
        ]}
      >
        <View style={[styles.stack, { height: extent }]}>
          {entries.map((entry) => (
            <StackedNotification
              key={entry.id}
              entry={entry}
              offset={offsets.get(entry.id)}
              edge={desktop ? "bottom" : "top"}
              entered={entered.has(entry.id)}
              onHeight={onHeight}
              onEntered={onEntered}
              onDismiss={onDismiss}
              onExited={onExited}
              onHold={onHold}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

type ItemProps = {
  entry: NotificationEntry;
  /** From the stack's edge; undefined while it leaves. */
  offset: number | undefined;
  edge: "top" | "bottom";
  /** Came in already, before the stack moved (into a panel's Modal, or back): shown at once. */
  entered: boolean;
  onHeight: (id: number, height: number) => void;
  onEntered: (id: number) => void;
  /** Its action was pressed, or it was swiped away. */
  onDismiss: (id: number) => void;
  onExited: (id: number) => void;
  onHold: (on: boolean) => void;
};

/** Where a finger went down on a notification, and how it moved since: the gesture's only. */
type Touch = {
  x: number;
  y: number;
  /** The axis it slides on once it follows the finger; null while it is a tap still. */
  axis: SwipeAxis | null;
  /** The last move, and the speed it came at (points per ms), for a fling. */
  last: { x: number; y: number; at: number };
  velocity: { x: number; y: number };
};

/**
 * One notification of the stack: fades in sliding 12 pt from its edge once measured,
 * slides to its place when the stack changes, leaves fading and sliding 8 pt back towards its
 * edge. With Reduce Motion, only the fades stay.
 *
 * It follows a finger sliding it sideways, or towards its edge, fading as it goes: let go far
 * enough or flung, it leaves that way; otherwise it slides
 * back. A tap stays its action's.
 */
function StackedNotification({
  entry,
  offset,
  edge,
  entered,
  onHeight,
  onEntered,
  onDismiss,
  onExited,
  onHold
}: ItemProps) {
  const { id, notification, revision, leaving } = entry;
  const reduceMotion = useReducedMotion();
  const [measured, setMeasured] = useState(false);
  // Leaving, it stays where it was while the others close the gap.
  const [place, setPlace] = useState(offset ?? 0);
  if (offset !== undefined && offset !== place) setPlace(offset);
  const placed = useEased(place, { duration: motion.notificationMove, animate: !reduceMotion });
  // Its first value only: drawn again elsewhere, a notification that came in shows at once.
  const shown = useSharedValue(entered ? 1 : 0);
  const flash = useSharedValue(1);
  // Its revision when drawn: drawn again elsewhere, an earlier update is not marked again.
  const [drawnRevision] = useState(revision);

  useEffect(() => {
    if (!measured) return;
    if (!leaving) onEntered(id);
    shown.set(
      leaving
        ? withTiming(
            0,
            {
              duration: motion.notificationOut,
              easing: OUT_EASING,
              reduceMotion: ReduceMotion.Never
            },
            (finished) => {
              if (finished) scheduleOnRN(onExited, id);
            }
          )
        : withTiming(1, {
            duration: motion.notificationIn,
            easing: IN_EASING,
            reduceMotion: ReduceMotion.Never
          })
    );
    return () => cancelAnimation(shown);
  }, [measured, leaving, id, onEntered, onExited, shown]);

  // Never measured (left before its first layout): nothing to play.
  useEffect(() => {
    if (leaving && !measured) onExited(id);
  }, [leaving, measured, id, onExited]);

  // Whether the pointer is over it, and whether a finger slides it: either holds the stack. One
  // leaving while held (its action pressed, swiped away, sent out by a sixth, dismissed) gets no
  // pointerleave (pointerEvents "none", then unmounted): it releases the hold itself, or every
  // later notification would stay until another one is hovered.
  const holding = useRef({ hover: false, drag: false });
  const hold = (kind: "hover" | "drag", on: boolean) => {
    const before = holding.current.hover || holding.current.drag;
    holding.current[kind] = on;
    const after = holding.current.hover || holding.current.drag;
    if (before !== after) onHold(after);
  };
  useEffect(() => {
    if (!leaving) return;
    const held = holding.current.hover || holding.current.drag;
    holding.current = { hover: false, drag: false };
    if (held) onHold(false);
  }, [leaving, onHold]);
  // Nor does one drawn again elsewhere (the stack moved into a panel's Modal, or back).
  useEffect(
    () => () => {
      if (holding.current.hover || holding.current.drag) onHold(false);
    },
    [onHold]
  );

  const toEdge = edge === "top" ? -1 : 1;
  // Where the finger slid it, and its size, to fade it as it goes and send it out of sight.
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const size = useSharedValue({ width: 0, height: 0 });
  // Swiped away: it leaves the way it was slid, not towards its edge.
  const swiped = useSharedValue(false);
  const touch = useRef<Touch | null>(null);
  const slideBack = () => {
    const back = { duration: motion.notificationMove, easing: IN_EASING };
    dragX.set(reduceMotion ? 0 : withTiming(0, back));
    dragY.set(reduceMotion ? 0 : withTiming(0, back));
  };
  const endSlide = (event: GestureResponderEvent | null) => {
    const from = touch.current;
    touch.current = null;
    hold("drag", false);
    if (!from?.axis || !event) return slideBack();
    const { pageX, pageY } = event.nativeEvent;
    const x = from.axis === "x";
    const distance = x ? pageX - from.x : pageY - from.y;
    const still = Date.now() - from.last.at > FLING_WINDOW;
    const velocity = still ? 0 : x ? from.velocity.x : from.velocity.y;
    if (!swipeDismisses(from.axis, distance, velocity, toEdge)) return slideBack();
    swiped.set(true);
    // Out of sight the way it went, while it fades (`leaving`); with Reduce Motion, it fades where
    // it was let go.
    if (!reduceMotion) {
      const out = { duration: motion.notificationOut, easing: OUT_EASING };
      const { width, height } = size.get();
      if (x) dragX.set(withTiming(Math.sign(distance) * width, out));
      else dragY.set(withTiming(toEdge * height, out));
    }
    onDismiss(id);
  };
  const gesture = {
    // Never takes a touch as it begins (a tap is its action's), only notes where it began. A second
    // finger while it follows the first keeps the first's start (it would jump).
    onStartShouldSetResponderCapture: (event: GestureResponderEvent) => {
      if (touch.current?.axis) return false;
      const { pageX: x, pageY: y } = event.nativeEvent;
      touch.current = {
        x,
        y,
        axis: null,
        last: { x, y, at: Date.now() },
        velocity: { x: 0, y: 0 }
      };
      return false;
    },
    // Asked before its action (a press): a slide sideways or towards the edge is the card's.
    onMoveShouldSetResponderCapture: (event: GestureResponderEvent) => {
      const from = touch.current;
      if (!from || leaving) return false;
      from.axis = swipeAxis(
        event.nativeEvent.pageX - from.x,
        event.nativeEvent.pageY - from.y,
        toEdge
      );
      return from.axis !== null;
    },
    onResponderGrant: () => {
      hold("drag", true);
      // True: the screen's native scroll (Android's) never takes the slide over (as CardCarousel).
      return true;
    },
    onResponderTerminationRequest: () => false,
    onResponderMove: (event: GestureResponderEvent) => {
      const from = touch.current;
      if (!from?.axis) return;
      const { pageX, pageY } = event.nativeEvent;
      const at = Date.now();
      const elapsed = at - from.last.at;
      if (elapsed > 0)
        from.velocity = { x: (pageX - from.last.x) / elapsed, y: (pageY - from.last.y) / elapsed };
      from.last = { x: pageX, y: pageY, at };
      if (from.axis === "x") dragX.set(pageX - from.x);
      // Towards its edge only: away from it, it stays.
      else dragY.set(toEdge * Math.max(0, toEdge * (pageY - from.y)));
    },
    onResponderRelease: (event: GestureResponderEvent) => endSlide(event),
    onResponderTerminate: () => endSlide(null)
  };

  // Updated in place by a notification with the same key: a short fade marks it.
  useEffect(() => {
    if (revision === drawnRevision) return;
    flash.set(
      withSequence(
        withTiming(0.55, { duration: 0, reduceMotion: ReduceMotion.Never }),
        withTiming(1, { duration: motion.notificationIn, reduceMotion: ReduceMotion.Never })
      )
    );
  }, [revision, drawnRevision, flash]);

  const style = useAnimatedStyle(() => {
    const progress = clamp(shown.get(), 0, 1);
    const shift =
      reduceMotion || swiped.get() ? 0 : (1 - progress) * (leaving ? OUT_SHIFT : IN_SHIFT) * toEdge;
    const { width, height } = size.get();
    const slid = Math.max(
      width > 0 ? Math.abs(dragX.get()) / width : 0,
      height > 0 ? Math.abs(dragY.get()) / height : 0
    );
    return {
      opacity: progress * flash.get() * (1 - clamp(slid, 0, 1)),
      transform: [
        { translateX: dragX.get() },
        { translateY: -toEdge * placed.get() + shift + dragY.get() }
      ]
    };
  }, [reduceMotion, leaving, toEdge]);

  const action = notification.action;
  return (
    <Animated.View
      testID="notification"
      // An error, or a warning (time is running out): read at once.
      role={notification.tone === "error" || notification.tone === "warning" ? "alert" : "status"}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        if (height <= 0) return;
        size.set({ width, height });
        onHeight(id, height);
        setMeasured(true);
      }}
      onPointerEnter={() => hold("hover", true)}
      onPointerLeave={() => hold("hover", false)}
      {...gesture}
      style={[
        styles.item,
        edge === "top" ? styles.fromTop : styles.fromBottom,
        Platform.OS === "web" && NO_PAN,
        { pointerEvents: leaving ? "none" : "auto" },
        style
      ]}
    >
      <Notification
        tone={notification.tone}
        title={notification.title}
        body={notification.body}
        action={
          action && {
            ...action,
            onPress: () => {
              // Leaving first: an action that shows a notification with the same key at once (a
              // "Try again" failing again) stacks a new one instead of updating this one, which
              // would then leave with its news.
              onDismiss(id);
              action.onPress();
            }
          }
        }
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Clipped to the screen: one slid out of sight widens no page (web).
  layer: { pointerEvents: "box-none", zIndex: 1000, overflow: "hidden" },
  area: { position: "absolute", alignItems: "center", pointerEvents: "box-none" },
  stack: { width: "100%", maxWidth: MAX_WIDTH, pointerEvents: "box-none" },
  // A mouse sliding a notification (web) selects none of its text.
  item: { position: "absolute", left: 0, right: 0, userSelect: "none" },
  fromTop: { top: 0 },
  fromBottom: { bottom: 0 }
});
