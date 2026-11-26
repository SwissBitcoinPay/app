import type { ImageSourcePropType } from "react-native";

import { useTheme } from "@/theme";

/** The BoltCard logo as published: its contactless waves in black. */
const LIGHT: ImageSourcePropType = require("../../../assets/images/boltcard.png");

/**
 * The same logo for the dark theme: its black waves (every pixel darker than 90 on each channel)
 * drawn in the dark theme's text colour, #F4EFE6, their alpha kept; nothing else changed. Black on
 * the dark theme's ink measures 1.21:1: the waves would not show.
 */
const DARK: ImageSourcePropType = require("../../../assets/images/boltcard-dark.png");

/** The BoltCard logo for the theme in use ("A BoltCard", the till's reader). */
export function useBoltCardImage(): ImageSourcePropType {
  const { scheme } = useTheme();
  return scheme === "dark" ? DARK : LIGHT;
}
