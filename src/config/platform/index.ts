import {
  faCircleQuestion,
  faDesktop,
  faMobileAlt,
  faTabletScreenButton
} from "@fortawesome/free-solid-svg-icons";
import { platform as rootPlatform } from "./platform";

const { isMobile, isTablet, isDesktop } = rootPlatform;

const platform = {
  ...rootPlatform,
  deviceType: isMobile
    ? ("mobile" as const)
    : isTablet
    ? ("tablet" as const)
    : isDesktop
    ? ("desktop" as const)
    : ("unknown" as const),
  deviceIcon: isMobile
    ? faMobileAlt
    : isTablet
    ? faTabletScreenButton
    : isDesktop
    ? faDesktop
    : faCircleQuestion
};

export { platform };
