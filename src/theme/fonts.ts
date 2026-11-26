/**
 * Font files of the design system. The design system ships woff2 only, which iOS and Android
 * cannot read: these are the same families as TTF (JetBrains Mono from Google Fonts, Font Awesome
 * Free 6.5.2 as in the design system), and Plus Jakarta Sans, the sattle.me brand kit's font, in
 * place of the design system's Poppins (Google Fonts' static TTFs,
 * version 2.071, as @expo-google-fonts/plus-jakarta-sans 0.4.2 ships them). Licenses sit next to
 * the files in assets/fonts/. Loaded by `useAppFonts` (`useAppFonts.ts`, `useAppFonts.web.ts`).
 *
 * Plus Jakarta Sans' files are modified (the OFL allows it, the font has no reserved name): their
 * line, as published, rises 1038 units above the baseline and falls 222 below, its middle 36
 * units above the middle of the capitals (745 high), so text centred in a box (a button's label)
 * sat low. Their vertical metrics (`hhea` and `OS/2` typo) are 1122 above and 378 below, with no
 * line gap: a line of 1.5 em, Poppins' own on iOS and the web, in the middle of which the
 * capitals sit, as they did in Poppins. Nothing else changes but the version string, which ends in
 * "sattle.me vertical metrics". font-metrics.test.ts checks each file.
 */
export const fontAssets = {
  "PlusJakartaSans-Medium": require("../../assets/fonts/PlusJakartaSans-Medium.ttf"),
  "PlusJakartaSans-SemiBold": require("../../assets/fonts/PlusJakartaSans-SemiBold.ttf"),
  "PlusJakartaSans-Bold": require("../../assets/fonts/PlusJakartaSans-Bold.ttf"),
  "PlusJakartaSans-ExtraBold": require("../../assets/fonts/PlusJakartaSans-ExtraBold.ttf"),
  "JetBrainsMono-Regular": require("../../assets/fonts/JetBrainsMono-Regular.ttf"),
  "JetBrainsMono-Medium": require("../../assets/fonts/JetBrainsMono-Medium.ttf"),
  "JetBrainsMono-Bold": require("../../assets/fonts/JetBrainsMono-Bold.ttf"),
  "FontAwesome6Free-Solid": require("../../assets/fonts/fa-solid-900.ttf"),
  "FontAwesome6Free-Regular": require("../../assets/fonts/fa-regular-400.ttf"),
  "FontAwesome6Brands-Regular": require("../../assets/fonts/fa-brands-400.ttf")
} as const;

export type FontName = keyof typeof fontAssets;

/**
 * Web only: the fonts loaded before the first render, those the welcome screen draws (checked by
 * src/__tests__/fonts.test.tsx). Every font loaded at startup is one more request to the web host
 * on each page load; the others are only downloaded when a screen first draws them.
 */
export const webStartupFonts = [
  "PlusJakartaSans-SemiBold",
  "PlusJakartaSans-Bold",
  "PlusJakartaSans-ExtraBold",
  "JetBrainsMono-Regular",
  "FontAwesome6Free-Solid"
] as const satisfies readonly FontName[];
