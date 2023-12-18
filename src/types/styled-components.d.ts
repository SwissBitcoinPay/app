import { theme } from "@config/themes/theme";

type SBPTheme = typeof theme;

declare module "styled-components" {
  interface DefaultTheme extends SBPTheme {}
}
