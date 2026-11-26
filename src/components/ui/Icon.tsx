import { StyleSheet, Text, type StyleProp, type TextStyle } from "react-native";

import { useTheme } from "@/theme";

/**
 * Font Awesome 6 Free glyphs, drawn from the self-hosted font files (the
 * design system's only icon set). Codepoints come from Font Awesome 6.5.2
 * `metadata/icons.yml`. Add a glyph here before using it.
 */
const GLYPHS = {
  android: { code: 0xf17b, face: "brands" },
  apple: { code: 0xf179, face: "brands" },
  "arrow-down": { code: 0xf063, face: "solid" },
  "arrow-down-1-9": { code: 0xf162, face: "solid" },
  "arrow-down-9-1": { code: 0xf886, face: "solid" },
  "arrow-down-a-z": { code: 0xf15d, face: "solid" },
  "arrow-down-short-wide": { code: 0xf884, face: "solid" },
  "arrow-down-wide-short": { code: 0xf160, face: "solid" },
  "arrow-down-z-a": { code: 0xf881, face: "solid" },
  "arrow-left": { code: 0xf060, face: "solid" },
  "arrow-right": { code: 0xf061, face: "solid" },
  "arrow-right-from-bracket": { code: 0xf08b, face: "solid" },
  "arrow-right-arrow-left": { code: 0xf0ec, face: "solid" },
  "arrow-rotate-right": { code: 0xf01e, face: "solid" },
  "arrow-up": { code: 0xf062, face: "solid" },
  "arrow-up-right-from-square": { code: 0xf08e, face: "solid" },
  "arrows-left-right": { code: 0xf07e, face: "solid" },
  "arrows-rotate": { code: 0xf021, face: "solid" },
  "arrows-up-down": { code: 0xf07d, face: "solid" },
  at: { code: 0x40, face: "solid" },
  "bag-shopping": { code: 0xf290, face: "solid" },
  ban: { code: 0xf05e, face: "solid" },
  barcode: { code: 0xf02a, face: "solid" },
  bell: { code: 0xf0f3, face: "solid" },
  bitcoin: { code: 0xf379, face: "brands" },
  "bitcoin-sign": { code: 0xe0b4, face: "solid" },
  bolt: { code: 0xf0e7, face: "solid" },
  bookmark: { code: 0xf02e, face: "solid" },
  calculator: { code: 0xf1ec, face: "solid" },
  "calendar-day": { code: 0xf783, face: "solid" },
  camera: { code: 0xf030, face: "solid" },
  check: { code: 0xf00c, face: "solid" },
  "chevron-down": { code: 0xf078, face: "solid" },
  "chevron-left": { code: 0xf053, face: "solid" },
  "chevron-right": { code: 0xf054, face: "solid" },
  "chevron-up": { code: 0xf077, face: "solid" },
  "circle-check": { code: 0xf058, face: "solid" },
  "circle-exclamation": { code: 0xf06a, face: "solid" },
  "circle-half-stroke": { code: 0xf042, face: "solid" },
  "circle-info": { code: 0xf05a, face: "solid" },
  "circle-nodes": { code: 0xe4e2, face: "solid" },
  "circle-xmark": { code: 0xf057, face: "solid" },
  clone: { code: 0xf24d, face: "solid" },
  clock: { code: 0xf017, face: "solid" },
  "clock-regular": { code: 0xf017, face: "regular" },
  "clock-rotate-left": { code: 0xf1da, face: "solid" },
  code: { code: 0xf121, face: "solid" },
  coins: { code: 0xf51e, face: "solid" },
  copy: { code: 0xf0c5, face: "solid" },
  "copy-regular": { code: 0xf0c5, face: "regular" },
  "credit-card": { code: 0xf09d, face: "solid" },
  "delete-left": { code: 0xf55a, face: "solid" },
  download: { code: 0xf019, face: "solid" },
  ellipsis: { code: 0xf141, face: "solid" },
  envelope: { code: 0xf0e0, face: "solid" },
  exclamation: { code: 0x21, face: "solid" },
  eye: { code: 0xf06e, face: "solid" },
  "eye-slash": { code: 0xf070, face: "solid" },
  "file-export": { code: 0xf56e, face: "solid" },
  "file-invoice": { code: 0xf570, face: "solid" },
  "file-pdf": { code: 0xf1c1, face: "solid" },
  filter: { code: 0xf0b0, face: "solid" },
  fingerprint: { code: 0xf577, face: "solid" },
  "floppy-disk": { code: 0xf0c7, face: "solid" },
  gauge: { code: 0xf624, face: "solid" },
  gear: { code: 0xf013, face: "solid" },
  github: { code: 0xf09b, face: "brands" },
  globe: { code: 0xf0ac, face: "solid" },
  grip: { code: 0xf58d, face: "solid" },
  "grip-lines-vertical": { code: 0xf7a5, face: "solid" },
  "grip-vertical": { code: 0xf58e, face: "solid" },
  hand: { code: 0xf256, face: "solid" },
  "hourglass-end": { code: 0xf253, face: "solid" },
  "hourglass-half": { code: 0xf252, face: "solid" },
  image: { code: 0xf03e, face: "solid" },
  key: { code: 0xf084, face: "solid" },
  keyboard: { code: 0xf11c, face: "solid" },
  landmark: { code: 0xf66f, face: "solid" },
  link: { code: 0xf0c1, face: "solid" },
  lock: { code: 0xf023, face: "solid" },
  "lock-open": { code: 0xf3c1, face: "solid" },
  "magnifying-glass": { code: 0xf002, face: "solid" },
  map: { code: 0xf279, face: "solid" },
  minus: { code: 0xf068, face: "solid" },
  "mobile-screen-button": { code: 0xf3cd, face: "solid" },
  "money-bill": { code: 0xf0d6, face: "solid" },
  moon: { code: 0xf186, face: "solid" },
  palette: { code: 0xf53f, face: "solid" },
  "paper-plane": { code: 0xf1d8, face: "solid" },
  paste: { code: 0xf0ea, face: "solid" },
  pause: { code: 0xf04c, face: "solid" },
  pen: { code: 0xf304, face: "solid" },
  "piggy-bank": { code: 0xf4d3, face: "solid" },
  plug: { code: 0xf1e6, face: "solid" },
  plus: { code: 0x2b, face: "solid" },
  print: { code: 0xf02f, face: "solid" },
  qrcode: { code: 0xf029, face: "solid" },
  receipt: { code: 0xf543, face: "solid" },
  "right-left": { code: 0xf362, face: "solid" },
  rocket: { code: 0xf135, face: "solid" },
  "scale-balanced": { code: 0xf24e, face: "solid" },
  server: { code: 0xf233, face: "solid" },
  "share-nodes": { code: 0xf1e0, face: "solid" },
  "shield-halved": { code: 0xf3ed, face: "solid" },
  sliders: { code: 0xf1de, face: "solid" },
  store: { code: 0xf54e, face: "solid" },
  sun: { code: 0xf185, face: "solid" },
  tags: { code: 0xf02c, face: "solid" },
  "trash-can": { code: 0xf2ed, face: "solid" },
  "triangle-exclamation": { code: 0xf071, face: "solid" },
  "user-lock": { code: 0xf502, face: "solid" },
  "user-minus": { code: 0xf503, face: "solid" },
  "user-plus": { code: 0xf234, face: "solid" },
  users: { code: 0xf0c0, face: "solid" },
  wallet: { code: 0xf555, face: "solid" },
  "wand-magic-sparkles": { code: 0xe2ca, face: "solid" },
  xmark: { code: 0xf00d, face: "solid" }
} as const;

export type IconName = keyof typeof GLYPHS;

const FAMILIES = {
  solid: "FontAwesome6Free-Solid",
  regular: "FontAwesome6Free-Regular",
  brands: "FontAwesome6Brands-Regular"
} as const;

type IconProps = {
  name: IconName;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
};

export function Icon({ name, size = 15, color, style }: IconProps) {
  const { colors } = useTheme();
  const glyph = GLYPHS[name];
  return (
    <Text
      accessible={false}
      importantForAccessibility="no"
      allowFontScaling={false}
      style={[
        styles.icon,
        {
          fontFamily: FAMILIES[glyph.face],
          fontSize: size,
          lineHeight: size * 1.15,
          color: color ?? colors.text.primary
        },
        style
      ]}
    >
      {String.fromCodePoint(glyph.code)}
    </Text>
  );
}

const styles = StyleSheet.create({
  icon: { textAlign: "center", includeFontPadding: false }
});
