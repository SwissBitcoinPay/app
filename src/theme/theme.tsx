import { createContext, use } from "react";
import { StyleSheet } from "react-native";

import {
  darkColors,
  darkShadow,
  lightColors,
  lightShadow,
  type ColorScheme,
  type ThemeColors,
  type ThemeShadow
} from "./tokens";

/**
 * The theme a screen draws in (tokens.ts): its colours and shadows, light or dark. Provided by
 * ThemeProvider (src/features/appearance/) from this device's "Theme"; outside it (a test
 * rendering one component), the light theme.
 */
export type Theme = {
  scheme: ColorScheme;
  colors: ThemeColors;
  shadow: ThemeShadow;
};

export const lightTheme: Theme = { scheme: "light", colors: lightColors, shadow: lightShadow };
export const darkTheme: Theme = { scheme: "dark", colors: darkColors, shadow: darkShadow };

export const THEMES: Readonly<Record<ColorScheme, Theme>> = { light: lightTheme, dark: darkTheme };

export const ThemeContext = createContext<Theme>(lightTheme);

/** The theme in use: a component that reads it draws again in the other one when it changes. */
export function useTheme(): Theme {
  return use(ThemeContext);
}

/** What `StyleSheet.create` takes: named styles. */
type NamedStyles = Parameters<typeof StyleSheet.create>[0];

/**
 * A component's styles drawn from the theme: `const useStyles = makeStyles(({ colors }) => ({…}))`
 * beside the component, `const styles = useStyles()` in it. Each theme's sheet is created once,
 * the first time a component draws in it, then shared: changing the theme costs no new sheet. The
 * styles that take no colour stay in a plain `StyleSheet.create`.
 */
export function makeStyles<S extends NamedStyles>(
  create: (theme: Theme) => S & NamedStyles
): () => Readonly<S> {
  const sheets: Partial<Record<ColorScheme, Readonly<S>>> = {};
  return function useStyles(): Readonly<S> {
    const theme = useTheme();
    const made = sheets[theme.scheme];
    if (made !== undefined) return made;
    const sheet = StyleSheet.create(create(theme));
    sheets[theme.scheme] = sheet;
    return sheet;
  };
}
