import { useWindowDimensions } from "react-native";

/** Width from which the desktop layouts are used. */
export const DESKTOP_MIN_WIDTH = 1024;

export function useIsDesktop(): boolean {
  return useWindowDimensions().width >= DESKTOP_MIN_WIDTH;
}
