import type { ImageStyle, TextStyle, ViewStyle } from "react-native";
import { getAnimatedStyle as reanimatedAnimatedStyle } from "react-native-reanimated";

/**
 * The style Reanimated's animations give a view now (Reanimated's `getAnimatedStyle`), typed as
 * Jest runs it. Reanimated 4.7.1's published types declare the web build's no-op
 * (`lib/typescript/jestUtils/index.d.ts`: no argument, nothing returned), while Jest, resolving
 * for a native platform, runs the native one (`jestUtils/index.native.ts`), typed here.
 */
export const getAnimatedStyle = reanimatedAnimatedStyle as unknown as (component: {
  props: Record<string, unknown>;
}) => ViewStyle | ImageStyle | TextStyle;
