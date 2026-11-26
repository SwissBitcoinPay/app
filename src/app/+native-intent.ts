import {
  isLegacyCardLinkHost,
  legacyCardLinkNumber,
  printedCardHref
} from "@/lib/card/legacy-link";
import { logFailure } from "@/lib/log/log";

/*
 * Not a screen: Expo Router's file of the links the apps are opened with or get, read before it
 * routes them (`redirectSystemPath`, native only: the web app routes its page's own address). Every
 * link goes on as it came but the one printed on the v2 cards (`https://sbpc.ch/<number>`,
 * src/lib/card/legacy-link.ts): "Cards" on that card
 * (src/features/card/CardsScreen.tsx). Another address of that host is no screen of the app's: the
 * start (as +not-found.tsx).
 */

/** The printed links read in this run of the app: each one's own number (printedCardHref). */
let scans = 0;

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  // Expo Router: a throw here may stop the app. Nothing below should; the start if it ever did.
  try {
    const number = legacyCardLinkNumber(path);
    if (number !== null) {
      scans += 1;
      return printedCardHref(number, scans);
    }
    if (isLegacyCardLinkHost(path)) return "/";
    return path;
  } catch (error) {
    logFailure("Reading the app's link failed", error);
    return "/";
  }
}
