import { theme } from "@config/themes/theme";

type SBPTheme = typeof theme;

declare module "styled-components" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface DefaultTheme extends SBPTheme {}
}
