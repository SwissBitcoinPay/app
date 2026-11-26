import { getPaymentLinkOrigin } from "./payment-links";

/**
 * An invitation can be used for 48 hours (until it is used, its link is a bearer secret), and only
 * once. Each invitation's record carries its own end (`expiresAt`, src/lib/team/invite.ts), which
 * is what counts; the owner's screens read it there (fetchInviteEnds), this value is only an
 * invitation's end when no relay gives its record. Past it, every invitation of that date has
 * ended: an invitation removed before then is closed (src/features/team/owner.ts, publishRemoval).
 */
export const INVITE_VALIDITY_SECONDS = 48 * 60 * 60;

/** Path of the invitation page (src/app/join.tsx); the invitation follows in the fragment. */
export const INVITE_PATH = "/join";

/**
 * Where an invitation link opens: the web app of the build's variant, as payment links (the apps
 * open these links themselves). Null in a build without a web app (no RP ID:
 * local, CI): its owners cannot invite there.
 */
export function getInviteOrigin(): string | null {
  return getPaymentLinkOrigin();
}

/** Longest name of an employee (shown in the owner's list and on the employee's device). */
export const MEMBER_NAME_MAX_LENGTH = 40;

/**
 * Most employees an account keeps, invitations included. A removed employee no longer counts.
 * Counted on the roster a majority of the relays gave
 * (src/features/team/owner.ts): two of the owner's devices inviting at once may go one past it.
 */
export const MAX_TEAM_MEMBERS = 100;

/**
 * Most of the owner's own devices an account keeps (`MerchantSettings.devices`): one is added at
 * each first opening of the account on a device (after "Log out" too), the oldest goes past
 * this.
 */
export const MAX_OWNER_DEVICES = 50;

/**
 * Most integrations an account keeps (docs/integrations.md), apart from its
 * employees. A removed one no longer counts; counted as the employees (MAX_TEAM_MEMBERS).
 */
export const MAX_INTEGRATIONS = 20;

/**
 * Changes of the account's relays an integration's server follows from the relays its key names
 * (MAX_RELAY_MOVES of sattleme/checkout-node; SPEC.md, "Constants"): each list left
 * keeps a channel naming the next one. Past them, the key no longer finds its channel, and the key
 * is never shown again with the current relays (it is shown once): the relays'
 * editor says so (useIntegrationsRelaysNotice).
 */
export const INTEGRATION_RELAY_MOVES = 3;

/**
 * How long after its removal a declaration of an employee or an integration still counts in
 * "Wallet", by the wallet's date of the payment: an invoice it
 * showed before cannot be revoked. No invoice of the business lasts longer than an hour (the point
 * of sale's and the links' end within their rate point's period, fitsItsPeriod of
 * src/lib/registry/registry.ts; an integration's 3600 s at most, docs/integrations.md), its payment
 * is reported up to 2 minutes after its end (EXPIRY_GRACE_SECONDS of
 * src/features/terminal/invoice.ts), the owner's device dated the removal on its own clock (5
 * minutes for it), and an integration's server sees the removal when it reads its channel again,
 * every 5 minutes at most (docs/integrations.md): an invoice it made meanwhile is its own.
 */
export const REMOVED_SEAT_GRACE_SECONDS = 3600 + 120 + 5 * 60 + 5 * 60;

/**
 * On-chain addresses each employee's device holds, from the owner's wallet: the owner gives each
 * employee its own lot, filled again to this size as soon as
 * one is missing, when the owner logs in or unlocks, and once an employee is invited
 * (src/features/team/owner-addresses.ts).
 */
export const MEMBER_LOT_SIZE = 20;

/**
 * On-chain addresses of an assistant's lot, as many as an
 * integration's (INTEGRATION_LOT_SIZE): each invoice of its MCP server takes one, paid over
 * Lightning or not, until the owner's app fills the lot again
 * (src/features/team/owner-addresses.ts). A lot of more than MEMBER_LOT_SIZE addresses is of the
 * lot's version 2 (src/lib/team/onchain-lot.ts), which an employee's device never takes: it keeps
 * its lot in its secure store (src/lib/team/member-lot.ts).
 */
export const ASSISTANT_LOT_SIZE = 100;

/**
 * Most assistants an account keeps, apart from its employees and
 * its integrations. A removed one no longer counts; counted as the employees (MAX_TEAM_MEMBERS).
 */
export const MAX_ASSISTANTS = 10;

/**
 * How long after its removal an assistant's copy of the shared counter of the invoices' numbers
 * may still count (src/lib/invoice/counter.ts), until the owner's copy holds it: numbers start
 * again each year, and its last number must never be given again in that year. A year and a day:
 * whatever the calendars' gaps. It counts too among the writers a channel names
 * (MAX_COUNTER_WRITERS) while it may be named.
 */
export const REMOVED_WRITER_SECONDS = 366 * 24 * 60 * 60;

/**
 * How far above the writer's own copies of the shared counter (the owner's copy and its counter of
 * format 1, or an assistant's own) another writer's copy, or a number of `floor`, may be and still
 * count (src/lib/invoice/counter.ts): one further above is a key's
 * holder making the numbers jump, left out rather than followed. Followed, a copy near the end of
 * safe integers would make every next number fail its invoice, for every writer, until the year
 * ends. No business numbers a million invoices a year: an honest writer is never that far ahead.
 */
export const MAX_NUMBER_JUMP = 1_000_000;

/**
 * "Wallet" warns the owner of an assistant whose copy of the shared counter is more than
 * this many numbers above its last invoice of the year (src/features/invoices/assistant-alerts.ts):
 * numbers taken without an invoice. An honest assistant loses one
 * now and then (an invoice no majority of the relays took); ten in a year is a skip.
 */
export const ASSISTANT_JUMP_ALERT = 10;

/**
 * "Wallet" warns the owner of an assistant that made more than ASSISTANT_BURST_INVOICES
 * invoices within ASSISTANT_BURST_SECONDS: such an assistant may be flooding the business's
 * series with invoices.
 */
export const ASSISTANT_BURST_INVOICES = 100;
export const ASSISTANT_BURST_SECONDS = 24 * 60 * 60;
