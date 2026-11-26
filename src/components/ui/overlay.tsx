import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
// The only Modal of the app's code: every panel goes through OverlayModal (eslint.config.js).
// eslint-disable-next-line no-restricted-imports
import { Modal, StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  clamp,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type EasingFunction,
  type EasingFunctionFactory,
  type SharedValue
} from "react-native-reanimated";
import { SafeAreaInsetsContext, type EdgeInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import { makeStyles, motion } from "@/theme";

import { ModalShownContext } from "./modal-shown";
import { outOfReach } from "./reach";

type Ease = EasingFunction | EasingFunctionFactory;

/** How a panel comes in (`in`) and leaves (`out`). */
export type OverlayEasing = { in: Ease; out: Ease };

/**
 * A panel centred over the screen (Sheet on desktop, ConfirmDialog) fades in while rising this far
 * (points), and sinks back as it fades out.
 */
export const DIALOG_RISE = 16;
export const DIALOG_EASING: OverlayEasing = {
  in: Easing.out(Easing.cubic),
  out: Easing.in(Easing.cubic)
};

/**
 * The life of a panel over the screen, in a Modal (Sheet, ConfirmDialog, Popover): `mounted` while
 * `visible` and through its exit, so that the modal closes once the panel is out of sight;
 * `progress` goes to 1 as it comes in, once `ready` (a sheet measured), and back to 0 as it leaves,
 * over `duration` (motion.sheet unless said). It runs with Reduce Motion too: the panels drop their
 * movement, not their fade. `easing` is a constant: another one starts the animation again.
 * `onHidden`: once the exit is done, the panel out of sight.
 */
export function useOverlay(
  visible: boolean,
  easing: OverlayEasing,
  ready = true,
  duration: number = motion.sheet,
  onHidden?: () => void
): { mounted: boolean; progress: SharedValue<number> } {
  const progress = useSharedValue(0);
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);
  // The latest `onHidden`, read when the exit ends: a new one each render does not restart it.
  const hidden = useRef(onHidden);
  useEffect(() => {
    hidden.current = onHidden;
  }, [onHidden]);

  useEffect(() => {
    if (!mounted || (visible && !ready)) return;
    const hide = () => {
      setMounted(false);
      hidden.current?.();
    };
    progress.set(
      withTiming(
        visible ? 1 : 0,
        {
          duration,
          easing: visible ? easing.in : easing.out,
          reduceMotion: ReduceMotion.Never
        },
        (finished) => {
          if (finished && !visible) scheduleOnRN(hide);
        }
      )
    );
    return () => cancelAnimation(progress);
  }, [mounted, visible, ready, easing, duration, progress]);

  return { mounted, progress };
}

/** The scrim under a panel, fading with it. */
export function Scrim({ progress }: { progress: SharedValue<number> }) {
  const styles = useStyles();
  // Clamped: on the web, the first frame of an animation can come out slightly below 0.
  const style = useAnimatedStyle(() => ({ opacity: clamp(progress.get(), 0, 1) }));
  return <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, style]} />;
}

const useStyles = makeStyles(({ colors }) => ({
  scrim: { backgroundColor: colors.scrim }
}));

/**
 * Drawn last inside the Modal of every panel (Sheet, ConfirmDialog), over its scrim and its panel:
 * what must show above the panels, the notifications (`NotificationsProvider`). A Modal is a window
 * of its own on iOS and Android, and a layer over the whole page on the web (fixed, z-index 9999,
 * the focus kept inside it): nothing drawn outside it can show above it. `open` while the panel is
 * shown, not through its exit.
 */
export const OverModalsContext = createContext<((open: boolean) => ReactNode) | null>(null);

/**
 * Drawn over everything in the Modal of every panel, while the app hides behind its own lock
 * (src/features/app-lock/AppLock.tsx, the same cover as over the screens): the panel stays as it
 * was under it, out of reach, and the system's back does not close it. null: nothing over it.
 */
export const ModalCoverContext = createContext<ReactNode>(null);

/** In a panel's Modal, after its content: see `OverModalsContext`. */
function OverModals({ open }: { open: boolean }) {
  const layer = useContext(OverModalsContext);
  return layer?.(open) ?? null;
}

/**
 * The window's own safe area, where a screen gets another (the recovery check's banner over the
 * app's screens takes the status bar's room: RecoveryCheckBanner.tsx). A panel is a window of its
 * own: it takes the window's again.
 */
export const WindowInsetsContext = createContext<EdgeInsets | null>(null);

/**
 * The Modal of a panel over the screen (Sheet, ConfirmDialog, Popover), the app's only one: shown
 * while `mounted` (useOverlay), transparent, without the platform's animation (the panel animates
 * itself). It tells its fields when it has been shown (ModalShownContext: in the apps, a field
 * focused before that gets no keyboard), and draws the notifications over its content while
 * `visible` (OverModals), and the app's lock over all of it while the app hides (ModalCoverContext).
 */
export function OverlayModal({
  mounted,
  visible,
  onRequestClose,
  children
}: {
  mounted: boolean;
  /** The panel shown, not leaving: the notifications show over it only then. */
  visible: boolean;
  /** The system's back (Android), Escape (web). */
  onRequestClose: () => void;
  children: ReactNode;
}) {
  const [shown, setShown] = useState(false);
  const cover = useContext(ModalCoverContext);
  const windowInsets = useContext(WindowInsetsContext);
  // Shown again at the next opening: a new Modal window.
  if (!mounted && shown) setShown(false);
  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={cover === null ? onRequestClose : () => undefined}
      onShow={() => setShown(true)}
    >
      {/* Out of reach under the app's lock; its props change while the Modal shows: never
          flattened by Fabric (Android: addViewAt failed). */}
      <View collapsable={false} style={StyleSheet.absoluteFill} {...outOfReach(cover !== null)}>
        <ModalShownContext.Provider value={shown}>
          {windowInsets ? (
            <SafeAreaInsetsContext.Provider value={windowInsets}>
              {children}
            </SafeAreaInsetsContext.Provider>
          ) : (
            children
          )}
        </ModalShownContext.Provider>
        <OverModals open={visible} />
      </View>
      {cover}
    </Modal>
  );
}
