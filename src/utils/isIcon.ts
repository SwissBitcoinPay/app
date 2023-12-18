import { IconLookup } from "@fortawesome/fontawesome-svg-core";

export const isIcon = (icon: unknown): icon is IconLookup =>
  !!(icon as IconLookup)?.iconName;
