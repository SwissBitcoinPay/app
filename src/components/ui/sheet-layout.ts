import { useMemo, type ComponentRef, type RefObject } from "react";
import type { View } from "react-native";
import { useGenericKeyboardHandler } from "react-native-keyboard-controller";
import {
  ReduceMotion,
  useSharedValue,
  withTiming,
  type LayoutAnimationFunction,
  type SharedValue
} from "react-native-reanimated";

import { motion } from "@/theme";

import { SHEET_EASING } from "./easing";

/**
 * How a panel (Sheet.tsx) follows a change of its layout. A change of
 * its size (its content changed: an amount, then its confirmation, then its outcome) eases to the
 * new one, its place with it (a bottom sheet's top edge moves, its bottom stays), motion.sheet long,
 * with the sheet's own deceleration. A change of its place alone, or any change while the keyboard
 * moves, is followed at once: the panel keeps up with the keyboard frame by frame. With
 * Reduce Motion, at once.
 */
export function resizeTransition(keyboardMoving: SharedValue<boolean>): LayoutAnimationFunction {
  return (values) => {
    "worklet";
    const target = {
      originX: values.targetOriginX,
      originY: values.targetOriginY,
      width: values.targetWidth,
      height: values.targetHeight
    };
    const resized =
      values.currentWidth !== values.targetWidth || values.currentHeight !== values.targetHeight;
    if (!resized || keyboardMoving.get()) {
      // At once, an animation under way included: Reanimated merges the animations it is given
      // into those running (layoutReanimation/animationsManager.native.ts, 4.7.1), which would go
      // on to their former target, the panel left where the keyboard was not. Animations of no length replace them: their one frame is the target, which
      // Reanimated applies from 4.6 on (react-native-reanimated#10171; 4.5 dropped it).
      const now = { duration: 0 };
      return {
        initialValues: target,
        animations: {
          originX: withTiming(target.originX, now),
          originY: withTiming(target.originY, now),
          width: withTiming(target.width, now),
          height: withTiming(target.height, now)
        }
      };
    }
    const config = {
      duration: motion.sheet,
      easing: SHEET_EASING.in,
      reduceMotion: ReduceMotion.System
    };
    return {
      initialValues: {
        originX: values.currentOriginX,
        originY: values.currentOriginY,
        width: values.currentWidth,
        height: values.currentHeight
      },
      animations: {
        originX: withTiming(target.originX, config),
        originY: withTiming(target.originY, config),
        width: withTiming(target.width, config),
        height: withTiming(target.height, config)
      }
    };
  };
}

/**
 * The panel's layout transition (resizeTransition), the keyboard's movement followed to tell it
 * apart from a change of the content (react-native-keyboard-controller, KeyboardProvider of the
 * root layout). Listens only: the generic handler leaves Android's soft input mode to the sheet's
 * KeyboardAvoidingView, which sets it while the sheet is mounted. `panel` is the web's
 * (sheet-layout.web.ts): here, Reanimated follows the panel's view itself.
 */
export function useSheetLayout(
  panel: RefObject<ComponentRef<typeof View> | null>
): LayoutAnimationFunction | undefined {
  const keyboardMoving = useSharedValue(false);
  useGenericKeyboardHandler(
    {
      onStart: () => {
        "worklet";
        keyboardMoving.set(true);
      },
      onInteractive: () => {
        "worklet";
        keyboardMoving.set(true);
      },
      onEnd: () => {
        "worklet";
        keyboardMoving.set(false);
      }
    },
    []
  );
  return useMemo(() => resizeTransition(keyboardMoving), [keyboardMoving]);
}
