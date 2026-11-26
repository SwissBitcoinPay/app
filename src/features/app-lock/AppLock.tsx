import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode
} from "react";
import { useTranslation } from "react-i18next";
import { AppState, BackHandler, Keyboard, Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { ModalCoverContext } from "@/components/ui/overlay";
import { outOfReach } from "@/components/ui/reach";
import { AUTO_LOCK_AFTER_MS } from "@/features/navigation/auto-lock";
import { useTerminalProfile } from "@/features/terminal/profile-cache";
import { CARD_PAUSE_MS, leavingForSystemUi } from "@/lib/system-ui";
import { ownerProfile } from "@/lib/terminal/model";
import { makeStyles, sans, space, TITLE_EM, tracking, useTheme } from "@/theme";

import { deviceLocked, proveHolder } from "./biometrics";
import { useAppLockChoice } from "./preference";

/*
 * The app's own lock: with "Ask for biometrics to unlock the app" on (preference.ts), the app
 * opens, and comes back from the background, hidden until the system's biometrics (or the device's
 * code) prove its holder, then shows as it was. On top of till mode, which it never changes: an
 * account open stays open until its own lock (auto-lock.tsx), one closed stays closed. The apps
 * only (never the web); on a business's device only: an employee's holds no account, and a card
 * holder's has its passkey asked as the app opens (navigation/launch-unlock.ts), which proves its
 * holder. Nothing of the account is involved: the system's own proof, asked again at each opening.
 *
 * Over the whole app (src/app/_layout.tsx): every screen, those a link opens outside the account's
 * (a step of the sign-up, a payment page) included, and every panel (ModalCoverContext); what
 * shows stays mounted under it, out of reach, the system's back closing nothing. Whether it hides
 * is the app's state, not a screen's (`hidden`): a screen mounted again (a link) stays hidden.
 *
 * Coming back from what the app opened over itself (the passkey, a photo, a permission, the share
 * sheet, the system's settings: src/lib/system-ui.ts) is not a departure, unless it lasted longer
 * than till mode's own delay (AUTO_LOCK_AFTER_MS): the holder may have left the device meanwhile.
 * Nor is the instant Android pauses the app to hand a card over (CARD_PAUSE_MS). Nothing to hide (no account on the device: the welcome screen, the sign-up;
 * the choice off; a device without any lock, which cannot ask) shows the app until the next
 * departure: the account a passkey then opens (signing in, the end of the sign-up) is not hidden,
 * the passkey proved its holder.
 */

/** Whether the app hides, for as long as it runs: from its start (just opened), and from each departure. */
let hidden = true;
const hiddenListeners = new Set<() => void>();

function setHidden(next: boolean): void {
  if (hidden === next) return;
  hidden = next;
  for (const listener of hiddenListeners) listener();
}

function subscribeHidden(listener: () => void): () => void {
  hiddenListeners.add(listener);
  return () => {
    hiddenListeners.delete(listener);
  };
}

/** The app just opened again (tests). */
export function resetAppLockState(): void {
  hidden = true;
  hiddenListeners.clear();
}

export type AppLockState = {
  /** The app hidden until its holder's proof. */
  covered: boolean;
  /** Whether this device can ask for it (a lock of its own); null until known. */
  available: boolean | null;
};

const AppLockContext = createContext<AppLockState>({ covered: false, available: null });

/** The app's lock, as it stands. */
export function useAppLock(): AppLockState {
  return useContext(AppLockContext);
}

/** Whether the app hides behind its lock now. */
export function useAppLockCovered(): boolean {
  return useContext(AppLockContext).covered;
}

/** The whole app under its lock (see above), for this device's point of sale's account. */
export function AppLock({ children }: { children: ReactNode }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const profile = useTerminalProfile();
  // A business's account in the apps, the only one with a lock (null: none); undefined while this
  // device's profile is read.
  const owner =
    Platform.OS === "web"
      ? null
      : profile === undefined
        ? undefined
        : (ownerProfile(profile)?.walletId ?? null);
  const choice = useAppLockChoice(owner ?? null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const locked = useSyncExternalStore(
    subscribeHidden,
    () => hidden,
    () => hidden
  );
  const [active, setActive] = useState(AppState.currentState === "active");
  // The proof refused or dismissed: asked again at the holder's press only.
  const [refused, setRefused] = useState(false);
  const enabled = typeof owner === "string" && choice === true && available === true;
  // Not known yet: hidden, so that nothing shows before the lock does.
  const known =
    owner === null ||
    (owner !== undefined && (choice === false || (choice === true && available !== null)));
  const covered = locked && (enabled || !known);
  // Nothing to hide: shown, until the next departure (turned on while it shows: from then).
  useEffect(() => {
    if (known && !enabled) setHidden(false);
  });

  const live = useRef(true);
  useEffect(
    () => () => {
      live.current = false;
    },
    []
  );

  // Whether the device has a lock of its own, read again each time the app comes to the front; also
  // with the choice off, which "Settings" cannot turn on without one (useAppLockSwitch).
  useEffect(() => {
    if (typeof owner !== "string" || !active) return;
    let current = true;
    void deviceLocked().then((value) => {
      if (current) setAvailable(value);
    });
    return () => {
      current = false;
    };
  }, [owner, active]);

  // One proof asked at a time (the system shows one prompt).
  const asking = useRef(false);

  const enabledNow = useRef(enabled);
  useEffect(() => {
    enabledNow.current = enabled;
  });
  // Since when the app is away for what it opened itself, if it is, and for how long at most.
  const trip = useRef<{ from: number; longest: number } | null>(null);
  useEffect(() => {
    const lock = () => {
      if (!enabledNow.current) return;
      setHidden(true);
      setRefused(false);
    };
    const states = AppState.addEventListener("change", (state) => {
      if (state === "background") {
        // Told at each departure (leavingForSystemUi forgets what it was announced once told).
        const departure = leavingForSystemUi();
        if (departure === null) lock();
        else {
          trip.current ??= {
            from: Date.now(),
            longest: departure === "trip" ? AUTO_LOCK_AFTER_MS : CARD_PAUSE_MS
          };
        }
      } else if (state === "active" && trip.current !== null) {
        const { from, longest } = trip.current;
        trip.current = null;
        // Not its own prompt, whose answer comes on its own.
        if (!asking.current && Date.now() - from >= longest) lock();
      }
      setActive(state === "active");
    });
    return () => states.remove();
  }, []);

  const ask = () => {
    if (asking.current) return;
    asking.current = true;
    void proveHolder({ prompt: t("appLock.prompt"), cancel: t("appLock.cancel") }).then((proof) => {
      asking.current = false;
      if (!live.current) return;
      if (proof === "refused") {
        setRefused(true);
        return;
      }
      if (proof === "impossible") setAvailable(false);
      setHidden(false);
    });
  };

  // Asked at once, the app in front (the system's prompt needs it), once each time it is hidden.
  useEffect(() => {
    if (covered && enabled && active && !refused) ask();
  });

  // Hidden: the system's back reaches nothing behind it, nor does the keyboard of a field left
  // focused under it.
  useEffect(() => {
    if (!covered) return;
    Keyboard.dismiss();
    const back = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => back.remove();
  }, [covered]);

  const cover = covered ? (
    <LockCover
      ready={enabled}
      onUnlock={() => {
        setRefused(false);
        ask();
      }}
    />
  ) : null;
  return (
    <AppLockContext.Provider value={{ covered, available }}>
      <ModalCoverContext.Provider value={cover}>
        {/* Its accessibility props change as it hides: never flattened by Fabric, which would
            move every view of the app, and close the panels' windows on Android. */}
        <View collapsable={false} style={styles.app} {...outOfReach(covered)}>
          {children}
        </View>
        {cover}
      </ModalCoverContext.Provider>
    </AppLockContext.Provider>
  );
}

/**
 * What shows over the app while it hides: "App locked" and "Unlock", which asks the proof again.
 * `ready` false: its choice not read yet, plain.
 */
function LockCover({ ready, onUnlock }: { ready: boolean; onUnlock: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityViewIsModal
      style={[
        StyleSheet.absoluteFill,
        styles.cover,
        { paddingTop: insets.top + space[6], paddingBottom: insets.bottom + space[6] }
      ]}
      testID="app-lock"
    >
      {ready ? (
        <>
          <View style={styles.middle}>
            <View style={styles.badge}>
              <Icon name="fingerprint" size={28} color={colors.text.primary} />
            </View>
            <Text accessibilityRole="header" style={styles.title}>
              {t("appLock.title")}
            </Text>
            <Text style={styles.body}>{t("appLock.body")}</Text>
          </View>
          <Button icon="fingerprint" onPress={onUnlock} testID="app-lock-unlock">
            {t("appLock.unlock")}
          </Button>
        </>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  app: { flex: 1 },
  cover: {
    paddingHorizontal: space[6],
    backgroundColor: colors.background.app,
    justifyContent: "space-between"
  },
  middle: { flex: 1, alignItems: "center", justifyContent: "center", gap: space[3] },
  badge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background.surface
  },
  title: {
    ...sans(700),
    fontSize: 22,
    letterSpacing: tracking(TITLE_EM, 22),
    color: colors.text.primary,
    textAlign: "center"
  },
  body: {
    ...sans(500),
    fontSize: 15,
    lineHeight: 22,
    color: colors.text.secondary,
    textAlign: "center"
  }
}));
