import { router, usePathname, useRouter } from "expo-router";
import { StackActions } from "expo-router/react-navigation";
import { TabSlot, useTabsWithTriggers, type TabsSlotRenderOptions } from "expo-router/ui";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AppState, Linking, Platform, View } from "react-native";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming
} from "react-native-reanimated";

import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { NAV_EASING } from "@/components/ui/easing";
import { CARD_ADDING_PATH, CARDS_PATH } from "@/config/card";
import { useAppLockCovered } from "@/features/app-lock/AppLock";
import { NotificationsOffer } from "@/features/notification-offer/NotificationsOffer";
import { useNotificationArea } from "@/features/notifications/NotificationsProvider";
import { RecoveryCheckFrame } from "@/features/recovery-check/RecoveryCheckBanner";
import { useWhatsNewOnArrival } from "@/features/release-notes/useWhatsNewOnArrival";
import { WhatsNewSheet } from "@/features/release-notes/WhatsNewSheet";
import { subscribeReminderTaps } from "@/features/recovery-check/reminders";
import { useRecoveryReminders } from "@/features/recovery-check/useRecoveryReminders";
import { idleMs, reportActivity } from "@/lib/activity";
import { legacyCardLinkNumber } from "@/lib/card/legacy-link";
import { logFailure } from "@/lib/log/log";
import { isCardHolderProfile, type AccountProfile } from "@/lib/terminal/model";
import { makeStyles, motion } from "@/theme";

import { AUTO_LOCK_AFTER_MS, useAutoLock } from "./auto-lock";
import { DockAreaProvider, ShellMain } from "./dock-area";
import {
  CARD_HOLDER_DESTINATIONS,
  DESTINATIONS,
  DESTINATION_HREFS,
  MEMBER_DESTINATIONS,
  destinationOf,
  destinationsOf,
  homeOf,
  isFullScreenRoute,
  isMobileEdgeToEdgeRoute,
  isMobileFullScreenRoute,
  opensInTillMode,
  type Destination,
  type ShellKind
} from "./destinations";
import { HeaderNavigationContext } from "./header-navigation";
import { endLaunchUnlock, launchUnlockPending } from "./launch-unlock";
import { accountUnlocked, lockTerminal, useUnlock, useUnlocked } from "./lock";
import { MemberNavigation } from "./MemberNavigation";
import { MobileNavigation } from "./MobileNavigation";
import { Sidebar, SIDEBAR_WIDTH } from "./Sidebar";
import { ShellUnlockContext } from "./unlock-context";

/** One tab per destination: each keeps its screen (the keypad's amount) while another shows. */
function triggersOf(destinations: readonly Destination[]) {
  return destinations.map((name) => ({
    type: "internal" as const,
    name,
    href: DESTINATION_HREFS[name]
  }));
}

const TRIGGERS = triggersOf(DESTINATIONS);
const MEMBER_TRIGGERS = triggersOf(MEMBER_DESTINATIONS);
const CARD_HOLDER_TRIGGERS = triggersOf(CARD_HOLDER_DESTINATIONS);

/** The link the app was opened with was taken already: a shell mounted again asks nothing. */
let launchLinkTaken = false;

/** Forgets the link the app was opened with was taken (tests: a new app each time). */
export function forgetLaunchLink(): void {
  launchLinkTaken = false;
}

/**
 * The paths of the codes a computer shows for the phone ("Add a card", AddCardDialog.tsx;
 * "Cards", OnPhoneSteps.tsx): their links ask the passkey at once in till mode, as the link
 * printed on a v2 card does (`https://sbpc.ch/<number>`, legacy-link.ts: "Cards" on that card),
 * a code too, on the card in its holder's hand. Any other link to a
 * destination locked then (a web page, another app, a checkout's return address) leads to the till,
 * nothing asked without a press in the app.
 */
const CODE_PATHS: readonly string[] = [CARDS_PATH, CARD_ADDING_PATH];

/**
 * The destination the link of a code leads to (CODE_PATHS, or a v2 card's printed link); null for
 * another or none.
 */
function codeDestination(url: string): Destination | null {
  if (legacyCardLinkNumber(url) !== null) return "cards";
  try {
    const { pathname } = new URL(url);
    return CODE_PATHS.includes(pathname) ? destinationOf(pathname) : null;
  } catch {
    return null;
  }
}

/** What the side bar and the dock need from the app. */
export type NavigationProps = {
  /** A point of sale's navigation, or a card holder's ("Cards", "Settings"). */
  kind: ShellKind;
  /** The destination shown, null on a route outside the navigation. */
  current: Destination | null;
  unlocked: boolean;
  unlocking: boolean;
  /** Web: the SDK is still loading, the unlock buttons wait for it (a spinner, no tap). */
  preparing: boolean;
  /**
   * The point of sale's invoice is the screen shown: the dock hides, and "Charge" shows no
   * dot of its invoice (only seen from another screen).
   */
  invoiceShown: boolean;
  /** A screen over the whole window (isFullScreenRoute): the dock hides, as for the invoice. */
  fullScreen: boolean;
  navigate: (destination: Destination) => void;
  /**
   * The system passkey prompt, directly. Once it opened the account, `destination` shows (the
   * side bar's locked row chosen); with none (the till's padlock), the screen shown stays.
   */
  unlock: (destination: Destination | null) => void;
  /** "Switch to till mode" ("Lock the app" on a card holder's device). */
  lock: () => void;
};

/**
 * The navigation around the app's screens: the side bar on desktop, the
 * floating dock on mobile. Till mode first: only the point of sale renders until the passkey
 * opened this device's account (lock.ts), and "Settings" as a reduced version
 * (TILL_MODE_DESTINATIONS); again after a while without activity (auto-lock.tsx). A card holder's
 * device (CardHolderProfile) has "Cards" and "Settings" only,
 * no dock on a phone: each leads to the other from its header
 * (header-navigation.ts), the auto-lock locks it again. Locked, "Cards" asks the passkey
 * (LockedCards.tsx), at once as the phone's app opens (launch-unlock.ts), and "Settings" shows
 * reduced; a link to another destination leads to "Cards".
 */
export function AppShell({ profile }: { profile: AccountProfile }) {
  // Left out of the React Compiler: `NavigationContent` (useTabsWithTriggers) hands the tabs'
  // state to `TabSlot`, and must be rendered again at every render of this component. Memoized,
  // its element stayed the same when nothing else in it changed (desktop, a screen pushed within
  // a tab: /pos → /pos/charge), and the screen shown never changed.
  "use no memo";
  const styles = useStyles();
  const desktop = useIsDesktop();
  const pathname = usePathname();
  const kind: ShellKind = isCardHolderProfile(profile) ? "cardHolder" : "merchant";
  const home = homeOf(kind);
  // A destination of another kind of device (a link, the browser's history) renders nothing while
  // it leads home (below): a card holder's device has no point of sale.
  const shown = destinationOf(pathname);
  const away = shown !== null && !destinationsOf(kind).includes(shown);
  const current = away ? null : shown;
  const unlocked = useUnlocked(profile.walletId);
  // The check of the 12 words told by the phone too, the app closed
  // (src/features/recovery-check/reminders.ts).
  useRecoveryReminders(unlocked);
  const { unlock, unlocking, preparing } = useUnlock(profile);
  // The app's own lock, over everything (app-lock/): a code's link waits until it is lifted.
  const covered = useAppLockCovered();
  const fullScreen = isFullScreenRoute(pathname) || (!desktop && isMobileFullScreenRoute(pathname));
  // Desktop: the notifications centre on the content, beside the side bar.
  useNotificationArea(desktop && !fullScreen ? SIDEBAR_WIDTH : 0);
  const { NavigationContent, navigation } = useTabsWithTriggers({
    triggers: kind === "cardHolder" ? CARD_HOLDER_TRIGGERS : TRIGGERS,
    backBehavior: "history"
  });
  // Another destination: its tab as it was left (the point of sale's invoice included). Not
  // `router.navigate` nor `router.replace`: they open the tab's first screen on top of it, a second
  // keypad over the invoice, which stayed mounted below (its checks running, its sale's next
  // invoice requested).
  const show = (destination: Destination) => navigation.jumpTo(destination);

  // The destination to show once the passkey opened the account: the locked row chosen last while
  // it was asked. A destination chosen meanwhile ("Charge") drops it,
  // and so do a lock and leaving the app: no navigation from a shell no longer shown.
  const asked = useRef<Destination | null>(null);
  useEffect(
    () => () => {
      asked.current = null;
    },
    []
  );

  // Till mode: a locked destination (a link, the browser's history, a lock) leads to the till.
  // `usePathname` follows the navigation a render late: after a lock from another destination,
  // this runs once the till is shown already, where a `replace` would drop its invoice.
  const lockedAway = !unlocked && current !== null && !opensInTillMode(current, kind);
  useEffect(() => {
    if (lockedAway) navigation.jumpTo(home);
  }, [lockedAway, navigation, home]);
  // Not a destination of this device: home, in place of it (no tab of this navigation has it). By
  // this tree's router, not the global one: Expo Router 58's is unavailable until the first render
  // has finished, which a link opened at launch is part of.
  const treeRouter = useRouter();
  useEffect(() => {
    if (away) treeRouter.replace(DESTINATION_HREFS[home]);
  }, [away, home, treeRouter]);

  // "Settings" back to its first screen at once, before the account closes: what it opened on top
  // is guarded by the lock (Stack.Protected, its layout). Since Expo Router 58, a guarded screen
  // stays in its stack's history and, a render after the lock, redirects to that first screen:
  // "Settings" would show again instead of the till.
  const closeSettingsOnTop = () => {
    const settings = navigation.getState().routes.find((route) => route.name === "settings");
    const stack = settings?.state;
    if (stack?.key !== undefined && (stack.index ?? 0) > 0) {
      navigation.dispatchSync({ ...StackActions.popToTop(), target: stack.key });
    }
  };

  // Back to till mode: "Switch to till mode", or the auto-lock after a while without activity.
  // Locked already, nothing to do: the auto-lock, run a moment after a code's link locked for it
  // (below), leaves the destination its passkey is asked for.
  const lock = () => {
    if (!accountUnlocked(profile.walletId)) return;
    asked.current = null;
    closeSettingsOnTop();
    lockTerminal().catch((error: unknown) => {
      logFailure("Disconnecting the wallet failed", error);
    });
    if (current !== home) show(home);
  };
  useAutoLock(unlocked, lock, kind === "cardHolder");

  // The system passkey prompt; once it opened the account, `destination` shows (null: the screen
  // shown stays). Another asked while the prompt is open: the last wins.
  const unlockTo = (destination: Destination | null) => {
    asked.current = destination;
    void unlock().then((opened) => {
      const next = asked.current;
      if (!opened || next === null) return;
      asked.current = null;
      // The account is open already (session.ts tells it before `openAccount` resolves): the
      // destination renders, and the till's redirect (`lockedAway`) does not send it back.
      show(next);
    });
  };

  // A card holder's phone asks the passkey as the app opens, without a press (launch-unlock.ts),
  // once it is in front (the system's prompt needs it); such a device has no lock of the app's own
  // (AppLock.tsx). Refused, "Cards" stays locked, asked again at a press only. Not on the web
  // (never called there, below): browsers ask no passkey without a press.
  const takeLaunch = useRef<() => void>(() => undefined);
  useEffect(() => {
    takeLaunch.current = () => {
      if (!launchUnlockPending() || AppState.currentState !== "active") return;
      endLaunchUnlock();
      if (kind !== "cardHolder" || accountUnlocked(profile.walletId)) return;
      // A code's link asked already keeps its destination (the last wins otherwise).
      unlockTo(asked.current);
    };
  });

  // The link of a computer's code (CODE_PATHS), the app opened with it or getting it, taken once the
  // app is in front (a system prompt needs it; the link comes before). The
  // account closed, or about to be (the auto-lock due: it locks first, as the auto-lock would), the
  // till shows (lockedAway) and the passkey is asked at once, as that destination's row asks it; it
  // shows once the account is open, the screen the link named in it. Refused: the till stays. The
  // account open, the router shows that screen, and the scan counts as activity. Phones and tablets
  // only: on the web, the page's own address, and browsers ask no passkey without a press.
  const linked = useRef<Destination | null>(null);
  const takeLink = useRef<() => void>(() => undefined);
  useEffect(() => {
    takeLink.current = () => {
      const destination = linked.current;
      // Under the app's lock (app-lock/), the passkey would meet the system's biometric prompt:
      // taken once it is lifted (below).
      if (destination === null || AppState.currentState !== "active" || covered) return;
      linked.current = null;
      if (accountUnlocked(profile.walletId)) {
        if (idleMs() < AUTO_LOCK_AFTER_MS) {
          reportActivity();
          return;
        }
        lock();
      }
      unlockTo(destination);
    };
  });
  useEffect(() => {
    if (!covered) takeLink.current();
  }, [covered]);

  // A notification of the check of the 12 words tapped: "Check your 12 words" once the account is
  // open, the passkey asked at once as a code's link asks it
  // (above: "Settings", then the check over it). Refused, it waits for the next unlock of this
  // run: the owner tapped it.
  const checkTapped = useRef(false);
  const [checkTaps, setCheckTaps] = useState(0);
  useEffect(
    () =>
      subscribeReminderTaps(() => {
        checkTapped.current = true;
        setCheckTaps((taps) => taps + 1);
        linked.current = "settings";
        takeLink.current();
      }),
    []
  );
  useEffect(() => {
    if (!unlocked || !checkTapped.current) return;
    checkTapped.current = false;
    treeRouter.push("/settings/recovery-check");
  }, [unlocked, checkTaps, treeRouter]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    takeLaunch.current();
    // The last link wins: another one (a payment link, a page) drops a code's still waiting.
    const received = (url: string | null | undefined) => {
      if (!url) return;
      linked.current = codeDestination(url);
      takeLink.current();
    };
    if (!launchLinkTaken) {
      launchLinkTaken = true;
      Linking.getInitialURL().then(received, (error: unknown) =>
        logFailure("Reading the app's link failed", error)
      );
    }
    const links = Linking.addEventListener("url", ({ url }) => received(url));
    const states = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        takeLaunch.current();
        takeLink.current();
      } else if (state === "background") {
        // Left before it was in front: no longer its launch.
        endLaunchUnlock();
      }
    });
    return () => {
      links.remove();
      states.remove();
    };
  }, []);

  const invoiceShown = pathname.startsWith("/pos/charge");
  // "What's new" by itself, once per device, as a merchant's device reaches the point of sale's
  // keypad, in till mode too: never over an invoice, under the app's lock, nor over "Stay
  // informed", which waits for it in turn (useWhatsNewOnArrival.ts). Never a card holder's.
  const [offerShown, setOfferShown] = useState(false);
  const whatsNew = useWhatsNewOnArrival(
    kind === "merchant" && pathname === DESTINATION_HREFS.pos && !covered && !offerShown
  );
  const props: NavigationProps = {
    kind,
    current,
    unlocked,
    unlocking,
    preparing,
    invoiceShown,
    fullScreen,
    navigate: (destination) => {
      asked.current = null;
      if (destination !== current) show(destination);
      // The destination shown, from a screen further in (the invoice of the point of sale): back
      // to its first one, as its own back button would. `navigate` would push another on top.
      else if (pathname !== DESTINATION_HREFS[destination])
        router.dismissTo(DESTINATION_HREFS[destination]);
    },
    // Another row clicked while the passkey is asked (its prompt already open): the last wins.
    unlock: unlockTo,
    lock
  };

  // A card holder's phone: no dock, the headers lead from one destination to the other. The
  // context's value stays the same function (the latest `navigate` behind it): a new one at each of
  // this shell's renders would render every screen reading it again.
  const docked = !desktop && kind !== "cardHolder";
  const latestNavigate = useRef(props.navigate);
  useEffect(() => {
    latestNavigate.current = props.navigate;
  });
  const [headerNavigate] = useState(
    () => (destination: Destination) => latestNavigate.current(destination)
  );
  const slot = away ? null : (
    <TabSlot
      style={styles.slot}
      // The screens are plain views (ScreenTransition), not react-native-screens' Screen.
      detachInactiveScreens={false}
      renderFn={(descriptor, options) =>
        renderScreen(descriptor.route.name, descriptor.render(), options, unlocked, kind)
      }
    />
  );

  return (
    <NavigationContent>
      <ShellUnlockContext.Provider value={{ unlock: unlockTo, unlocking, preparing }}>
        {/* One tree for both layouts: the screens keep their place when the window crosses the
          desktop width (resized, a tablet turned), so they are never mounted again (an invoice
          shown would be requested anew, and a payment of the first one never seen). */}
        {/* Mobile: the dock floats over the bottom of the screens (dock-area.tsx). */}
        <DockAreaProvider docked={docked} hidden={invoiceShown || fullScreen}>
          <View style={desktop ? styles.desktop : styles.mobile}>
            {desktop && !fullScreen ? <Sidebar {...props} /> : null}
            <HeaderNavigationContext.Provider
              value={!desktop && kind === "cardHolder" ? headerNavigate : null}
            >
              <ShellMain
                style={styles.main}
                toWindowEdge={!desktop && isMobileEdgeToEdgeRoute(pathname)}
              >
                {/* The check of the 12 words due: its banner over
                    every screen, the app unlocked only (never in till mode), not over the check's
                    own screens. */}
                <RecoveryCheckFrame
                  shown={unlocked && !pathname.startsWith("/settings/recovery")}
                  onCheck={() => treeRouter.push("/settings/recovery-check")}
                >
                  {slot}
                </RecoveryCheckFrame>
              </ShellMain>
            </HeaderNavigationContext.Provider>
            {docked ? <MobileNavigation {...props} /> : null}
          </View>
        </DockAreaProvider>
        {/* "Stay informed", once the app is set up: the apps
            only, unlocked, never in till mode, before a customer, nor under the app's lock, nor
            while "What's new" opens by itself. */}
        <NotificationsOffer
          open={Platform.OS !== "web" && unlocked && !covered && !whatsNew.holding}
          onShownChange={setOfferShown}
        />
        <WhatsNewSheet visible={whatsNew.visible} onClose={whatsNew.close} fresh={whatsNew.fresh} />
      </ShellUnlockContext.Provider>
    </NavigationContent>
  );
}

/**
 * An employee's device (minimal navigation): "Charge", "My activity" and "Settings"
 * (MEMBER_DESTINATIONS), never locked: the device holds no passkey of the account, nor anything of
 * its wallet. The side bar on desktop, its own dock on mobile (MemberNavigation), neither over a
 * screen of the whole window (isFullScreenRoute). The same tabs as the owner's: each screen stays
 * mounted.
 */
export function MemberAppShell() {
  // As AppShell: left out of the React Compiler for `NavigationContent`.
  "use no memo";
  const styles = useStyles();
  const desktop = useIsDesktop();
  const pathname = usePathname();
  // Only this shell's destinations: an owner's one (a link, the browser's history) renders nothing
  // while MemberShell leads it to the point of sale (the side bar has no row for it).
  const shown = destinationOf(pathname);
  const away = shown !== null && !MEMBER_DESTINATIONS.includes(shown);
  const current = away ? null : shown;
  const fullScreen = isFullScreenRoute(pathname);
  useNotificationArea(desktop && !fullScreen ? SIDEBAR_WIDTH : 0);
  const { NavigationContent, navigation } = useTabsWithTriggers({
    triggers: MEMBER_TRIGGERS,
    backBehavior: "history"
  });
  const invoiceShown = pathname.startsWith("/pos/charge");
  const props: NavigationProps = {
    kind: "merchant",
    current,
    unlocked: true,
    unlocking: false,
    preparing: false,
    invoiceShown,
    fullScreen,
    navigate: (destination) => {
      if (destination !== current) navigation.jumpTo(destination);
      else if (pathname !== DESTINATION_HREFS[destination])
        router.dismissTo(DESTINATION_HREFS[destination]);
    },
    unlock: () => undefined,
    lock: () => undefined
  };
  return (
    <NavigationContent>
      <DockAreaProvider docked={!desktop} hidden={invoiceShown || fullScreen}>
        <View style={desktop ? styles.desktop : styles.mobile}>
          {desktop && !fullScreen ? <Sidebar {...props} member /> : null}
          <ShellMain style={styles.main}>
            {away ? null : (
              <TabSlot
                style={styles.slot}
                detachInactiveScreens={false}
                renderFn={(descriptor, options) =>
                  renderScreen(descriptor.route.name, descriptor.render(), options, true)
                }
              />
            )}
          </ShellMain>
          {desktop ? null : <MemberNavigation {...props} />}
        </View>
      </DockAreaProvider>
    </NavigationContent>
  );
}

/**
 * Like expo-router's default tab slot: screens stay mounted once shown, hidden while another is.
 * In till mode, nothing of a locked destination renders (but those that open in it, `kind`'s).
 */
function renderScreen(
  name: string,
  screen: ReactNode,
  { isFocused, loaded }: TabsSlotRenderOptions,
  unlocked: boolean,
  kind: ShellKind = "merchant"
) {
  if (!unlocked && !opensInTillMode(name, kind)) return null;
  if (!loaded && !isFocused) return null;
  return (
    <ScreenTransition key={name} focused={isFocused}>
      {screen}
    </ScreenTransition>
  );
}

/**
 * A destination's screen fades in, rising slightly, each time it is chosen (not at launch). With
 * Reduce Motion, it only fades.
 */
function ScreenTransition({ focused, children }: { focused: boolean; children: ReactNode }) {
  const styles = useStyles();
  const reduceMotion = useReducedMotion();
  const shown = useSharedValue(1);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!focused) return;
    shown.set(0);
    shown.set(
      withTiming(1, {
        duration: motion.navScreen,
        easing: NAV_EASING,
        reduceMotion: ReduceMotion.Never
      })
    );
  }, [focused, shown]);
  const style = useAnimatedStyle(
    () => ({
      opacity: shown.get(),
      transform: [{ translateY: reduceMotion ? 0 : (1 - shown.get()) * 10 }]
    }),
    [reduceMotion]
  );
  return (
    <Animated.View style={[styles.screen, focused ? styles.focused : styles.hidden, style]}>
      {children}
    </Animated.View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  desktop: { flex: 1, flexDirection: "row", backgroundColor: colors.background.app },
  mobile: { flex: 1, backgroundColor: colors.background.app },
  main: { flex: 1, minWidth: 0 },
  slot: { flex: 1 },
  screen: { flex: 1 },
  focused: { display: "flex" },
  hidden: { display: "none" }
}));
