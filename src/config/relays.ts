/**
 * The relays a device starts with, until its user chooses others ("Advanced settings" before the
 * sign-in, "Nostr relays" in the settings). Only a starting value: the
 * list in force is the device's (src/lib/relays/), which the owner's account and the employees'
 * channels carry, and which can replace every one of these, down to a single relay of the
 * business's own. Nothing else of the app uses this list.
 *
 * Public relays, free, with no published retention policy (no `retention` in their NIP-11
 * document): nothing guarantees they keep an event, nor that they delete one (NIP-09 deletion
 * requests are best effort). Each one, as measured:
 * - free and open to writes from a new key (no payment, web of trust, whitelist, NIP-05, proof of
 *   work nor country filter), and still holding kind 30078 events (NIP-78) over a year old;
 * - takes a 55 KB record (the app's largest, src/lib/media/image.ts) and serves it unchanged to an
 *   anonymous reader, and confirmed a write within 8 s in 23 or 24 of 24 tries over 2 hours;
 * - behaves as src/lib/nostr/ expects of strfry, which they all run: an older version of a record
 *   refused with "replaced:", of two in one second the lower id kept, an event dated 600 s ahead
 *   taken, a NIP-09 deletion honoured; and sends 100 events of a filter or more (PAGE_FLOOR);
 * - one operator each, and no hosting network with more than two of them (relay.nostr.net and
 *   relay.coinos.io behind Cloudflare, nostr.oxtr.dev and relay.nostrfeed.com at Hetzner on two
 *   servers, no.str.cr in Costa Rica): no single outage takes away the majority every decision
 *   reads (3 of 5).
 * A relay that fails one of these (writes not confirmed in time, connections refused, events
 * deleted after a while or kept in memory only, every version of a record kept, a new key's
 * writes or kind 30078 refused, a payment asked) is not a default.
 * The list only applies to new accounts and devices: an account keeps the list of its settings,
 * which its owner changes in "Nostr relays", and where a relay sattle.me retired is replaced by
 * itself (RETIRED_RELAYS). relay.nostr.net and nostr.oxtr.dev, in the list before, still find the
 * backup of an account that never changed it, at a sign-in on a new device.
 *
 * The journal "Contact support" deposits goes to this list, whatever the device's
 * (src/features/support/deposit.ts): support's reader reads this declaration in git, at the
 * version or commit the mail names (scripts/support-journal.mjs, `relaysAt`). Keep it here, a
 * literal list of strings, one per line or all on its line (support-journal.test.ts).
 */
export const DEFAULT_RELAYS: readonly string[] = [
  "wss://relay.nostr.net",
  "wss://nostr.oxtr.dev",
  "wss://relay.coinos.io",
  "wss://relay.nostrfeed.com",
  "wss://no.str.cr"
];

/**
 * The relays sattle.me retired, each with the relay that takes its place: an account whose list
 * holds one moves to the list where each
 * is replaced, by itself, without its owner seeing anything, at the next opening of the account on
 * one of the owner's devices (src/features/relays/retired-relays.ts). Only relays named here are
 * replaced: one the merchant chose stays. A relay is retired here by the maintainers, never by the
 * app because it failed to answer: an outage of the merchant's network or of a relay moves nothing.
 *
 * A relay retired is taken as dead: the move reads and writes the relays of the list it leaves
 * that are not retired (`keptRelays`), and needs a majority of them; whatever only the retired
 * relays held stays there. So replace at most a minority of DEFAULT_RELAYS in one release: a new
 * device of an account not moved yet still finds its backup on the default relays. Never put a
 * retired relay back in DEFAULT_RELAYS, nor make one a replacement (relays-retired.test.ts); keep
 * an entry for as long as an account may still hold it: one opened only months later moves then.
 * Empty at first: the accounts created before the default list last changed keep theirs.
 */
export const RETIRED_RELAYS: ReadonlyMap<string, string> = new Map<string, string>([]);

/**
 * Most relays a list holds: every record goes to each of them, and the list travels in the URLs
 * of invitations and payment links (their QR codes grow with it).
 */
export const MAX_RELAYS = 10;

/** Per relay, connection included, for "Test the connection". */
export const RELAY_TEST_TIMEOUT_MS = 8000;

/**
 * Web: how long "Test the connection" waits for the merchant's answer to the browser's request
 * for local network access (src/lib/nostr/local-network.web.ts) before it tests anyway.
 */
export const LOCAL_NETWORK_PROMPT_TIMEOUT_MS = 60_000;

/**
 * At a change of the business's relays, a device that follows it copies its records (sales,
 * payment links) from the list left to the new one, from the change's date less this: the sales
 * started between the owner's check that none is open (unsettled.ts) and
 * the change, then until the device follows, are where the owner reads them.
 */
export const MOVE_RECORDS_MARGIN_SECONDS = 60 * 60;
