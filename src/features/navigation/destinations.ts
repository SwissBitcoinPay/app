import type { Href } from "expo-router";

import type { IconName } from "@/components/ui/Icon";

/**
 * The app's destinations. "Invoices" is merged into "Wallet": the business's sales and payment
 * links are listed there. "Cards" is one, in "Manage". Only the point of sale and "Settings" open
 * in till mode, the latter as a reduced version (TILL_MODE_DESTINATIONS): every other
 * destination needs the passkey. A stored dock that still holds a former destination (the
 * referral page, "Invoices") is the default again (parseDock).
 */
export const DESTINATIONS = [
  "pos",
  "wallet",
  "cards",
  "articles",
  "employees",
  "integrations",
  "settings"
] as const;

export type Destination = (typeof DESTINATIONS)[number];

/**
 * What opens in till mode, without the passkey: the point of sale, and "Settings" as a reduced
 * version, the account's settings greyed (LockedSettings.tsx).
 */
export const TILL_MODE_DESTINATIONS: readonly Destination[] = ["pos", "settings"];

/**
 * The kind of an owner's device: a point of sale ("merchant"), or a card holder's (an account
 * opened to manage cards has "Cards" and "Settings" only,
 * no point of sale nor wallet of its own).
 */
export type ShellKind = "merchant" | "cardHolder";

/** A card holder's device: "Cards", then "Settings". */
export const CARD_HOLDER_DESTINATIONS: readonly Destination[] = ["cards", "settings"];

/** The destinations of a device of `kind`. */
export function destinationsOf(kind: ShellKind): readonly Destination[] {
  return kind === "cardHolder" ? CARD_HOLDER_DESTINATIONS : DESTINATIONS;
}

/**
 * Where a device of `kind` opens, and goes back to when it locks: the point of sale, or "Cards"
 * on a card holder's (which asks the passkey there, LockedCards.tsx).
 */
export function homeOf(kind: ShellKind): Destination {
  return kind === "cardHolder" ? "cards" : "pos";
}

/**
 * Whether `destination` (a destination's or a tab's name) opens in till mode on a device of
 * `kind`: on a card holder's, both of its destinations do, "Cards" as a screen that asks the
 * passkey (nothing of the cards shows before it), "Settings" reduced, as an owner's.
 */
export function opensInTillMode(destination: string, kind: ShellKind = "merchant"): boolean {
  const open = kind === "cardHolder" ? CARD_HOLDER_DESTINATIONS : TILL_MODE_DESTINATIONS;
  return (open as readonly string[]).includes(destination);
}

export const DESTINATION_ICONS: Record<Destination, IconName> = {
  pos: "calculator",
  wallet: "wallet",
  cards: "credit-card",
  articles: "tags",
  employees: "users",
  integrations: "plug",
  settings: "gear"
};

export const DESTINATION_HREFS: Record<Destination, Href> = {
  pos: "/pos",
  wallet: "/wallet",
  cards: "/cards",
  articles: "/articles",
  employees: "/employees",
  integrations: "/integrations",
  settings: "/settings"
};

/** The destination of a pathname: its first segment ("/pos/charge" is the point of sale). */
export function destinationOf(pathname: string): Destination | null {
  const first = pathname.split("/").find((segment) => segment !== "") ?? "";
  return DESTINATIONS.find((destination) => DESTINATION_HREFS[destination] === `/${first}`) ?? null;
}

/**
 * Screens over the whole window, without the side bar nor the dock: a
 * phone's rubrics of "Settings" (a computer shows them as tabs),
 * the split and the bank account (the sign-up's steps, from the settings, with their step header, as
 * "Create my merchant profile"'s), the list of relays on mobile, the recovery phrase, what
 * "Cards" opens (each with its own way back, as when it was in "Settings"), and the point of
 * sale's basket (with its own way back; the scan is a view of the point of sale).
 */
export function isFullScreenRoute(pathname: string): boolean {
  return [
    "/settings/business",
    "/settings/display",
    "/settings/charging",
    "/settings/payouts",
    "/settings/security",
    "/settings/help",
    "/settings/profile",
    "/settings/network",
    "/settings/split",
    "/settings/bank",
    "/settings/merchant",
    "/settings/merchant-bank",
    "/settings/relays",
    "/settings/recovery",
    "/cards/pair",
    "/cards/history",
    "/cards/wake-journal",
    "/cards/extension-test",
    "/pos/basket"
  ].some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

/**
 * Screens over the whole window on mobile only, without the dock ("New invoice" and an invoice's
 * details have their own header and pinned actions; the cards' map is drawn from edge to edge);
 * the desktop side bar stays beside them.
 */
export function isMobileFullScreenRoute(pathname: string): boolean {
  return ["/wallet/invoice", "/cards/map"].some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

/**
 * Screens of the whole window on mobile that reach its bottom edge (the cards' map): the shell
 * keeps no band below them (ShellMain), what
 * they show keeps clear of the home indicator or the navigation bar itself. BTC Map's page does
 * (`viewport-fit=cover`, its bottom sheet and buttons above `env(safe-area-inset-bottom)`: read in
 * its page and styles), which iOS' WKWebView and Android's WebView (M144 and later,
 * Chromium's android_webview/docs/insets.md) give it as the system's insets over the view.
 */
export function isMobileEdgeToEdgeRoute(pathname: string): boolean {
  return pathname === "/cards/map";
}

/**
 * Desktop side bar: three groups, no customisation; "Wallet" in "Manage", then "Cards" (beside
 * the wallet, whose balance tops up the cards'), then "Items".
 */
export type SidebarGroup = { key: "sales" | "manage" | "account"; items: Destination[] };

export const SIDEBAR_GROUPS: SidebarGroup[] = [
  { key: "sales", items: ["pos"] },
  { key: "manage", items: ["wallet", "cards", "articles", "employees", "integrations"] },
  { key: "account", items: ["settings"] }
];

/**
 * An employee's device (a minimal navigation): the point of sale, "My activity", its own
 * operations, and "Settings". No padlock: the device holds no passkey of the account.
 */
export const MEMBER_DESTINATIONS: readonly Destination[] = ["pos", "wallet", "settings"];

/** A card holder's side bar (CARD_HOLDER_DESTINATIONS): no "Sales". */
export const CARD_HOLDER_SIDEBAR_GROUPS: SidebarGroup[] = [
  { key: "manage", items: ["cards"] },
  { key: "account", items: ["settings"] }
];

export const MEMBER_SIDEBAR_GROUPS: SidebarGroup[] = [
  { key: "sales", items: ["pos"] },
  { key: "manage", items: ["wallet"] },
  { key: "account", items: ["settings"] }
];

/** Mobile dock, unlocked: four free slots, then "More". */
export const DOCK_SLOTS = 4;

/**
 * The dock of a device that never customised it ("Invoices" being merged into "Wallet",
 * "Settings" takes its slot).
 */
export const DEFAULT_DOCK: readonly Destination[] = ["pos", "wallet", "employees", "settings"];

/** A stored dock: four distinct destinations, anything else counts as none (the default). */
export function parseDock(value: unknown): Destination[] | null {
  if (!Array.isArray(value) || value.length !== DOCK_SLOTS) return null;
  const isDestination = (item: unknown): item is Destination =>
    (DESTINATIONS as readonly unknown[]).includes(item);
  if (!value.every(isDestination) || new Set(value).size !== DOCK_SLOTS) return null;
  return [...value];
}

/** The destinations out of the dock, in their order: the "More" panel's grid. */
export function restOf(dock: readonly Destination[]): Destination[] {
  return DESTINATIONS.filter((destination) => !dock.includes(destination));
}

/**
 * The "More" grid after the dock changed from `before` to `after`, while the panel is open: the
 * destination that left the dock takes the place of the one that came in (nothing else moves).
 * Anything but such a swap gives the grid's usual order.
 */
export function keepPlaces(
  order: readonly Destination[],
  before: readonly Destination[],
  after: readonly Destination[]
): Destination[] {
  const rest = restOf(after);
  const left = before.filter((destination) => !after.includes(destination));
  const came = order.filter((destination) => after.includes(destination));
  const next =
    left.length === 1 && came.length === 1
      ? order.map((destination) => (destination === came[0] ? left[0]! : destination))
      : rest;
  return next.length === rest.length && rest.every((destination) => next.includes(destination))
    ? next
    : rest;
}

/** `slot` of the dock takes `destination`; one already in the dock swaps places with it. */
export function swapInDock(
  dock: readonly Destination[],
  slot: number,
  destination: Destination
): Destination[] {
  const next = [...dock];
  const from = next.indexOf(destination);
  if (from !== -1) next[from] = next[slot]!;
  next[slot] = destination;
  return next;
}
