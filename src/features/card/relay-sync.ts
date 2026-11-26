import { hexToBytes } from "@noble/hashes/utils.js";

import { CARD_HASHES_AHEAD, CARD_HASHES_REFILL_BELOW, CARD_RELAY_MAX_PENDING } from "@/config/card";
import type { CardState } from "@/lib/card/card-record";
import {
  cardSocketListenHash,
  cardSocketStatus,
  type CardSocketRelay
} from "@/lib/card/card-socket";
import type { DeviceKey } from "@/lib/card/device-key";
import { tapEntries } from "@/lib/card/hashes";
import { isPassOf, type CardPass } from "@/lib/card/card-pass";
import { cardKeysOf, channelSecretOf, wipeCardKeys } from "@/lib/card/keys";
import { loadPushMarks, markPushToken } from "@/lib/card/push-marks";
import {
  RelayError,
  deleteChannel,
  fetchChannel,
  fetchRelayInfo,
  patchHashes,
  postHashes,
  putChannel,
  type ChannelState,
  type RelayInfo
} from "@/lib/card/relay-client";
import { MAX_COUNTER } from "@/lib/card/sun";
import { logFailure } from "@/lib/log/log";

import { cardSocketListensTo, cardSocketOffered, cardSocketOn, listenToRelays } from "./socket";
import {
  cardStatesOnDevice,
  recordCardState,
  recordCardStateOnDevice,
  type CardAccess
} from "./states";

/*
 * A paired card's channel on its relay, kept in step from the phone (relay contract v2,
 * docs/card-relay.md): this phone's public key, and about a thousand entries of the card's next
 * taps, each a hash with the phone's push token sealed for that tap (push-seal.ts; none on Android,
 * whose card socket wakes it). The relay never gets the token in clear: it opens one only when its
 * tap comes. At the pairing (anew: the channel deleted first), then at each app start once the
 * account is open: when the phone's token changed since it was sealed (push-marks.ts), every entry
 * still waiting gets the new one (PATCH).
 */

export type ChannelSync =
  /**
   * The channel holds this phone's key, enough hashes, and a way to wake this phone at a tap: its
   * push token sealed in them (iOS), or its card socket's hash (socket.ts, Android).
   */
  | { status: "ready"; pending: number }
  /**
   * Nothing wakes this phone at a tap: no push token (notifications off, or none given), and no
   * card socket listening on that relay (turned off by its holder, a relay without `/v1/listen`).
   * The hashes carry no token, the relay notifies no tap; the card is paid in open-app mode
   * (useCardWakes.ts reads the pending packets while the app shows). Null when the channel could
   * not be read.
   */
  | { status: "noPush"; pending: number | null }
  /** The relay did not answer: nothing is known of the channel. */
  | { status: "unreachable" }
  /** The relay refused (another reason than being down): its answer, for the diagnosis. */
  | { status: "refused"; error: RelayError };

/** The counters whose hashes to leave now, from what the relay holds. */
export function refillRange(
  state: Pick<CardState, "lastCounter" | "depositedThrough">,
  channel: ChannelState,
  fresh: boolean
): { first: number; count: number } | null {
  // A new channel holds none of the hashes left before: from the next tap on.
  const first = (fresh ? state.lastCounter : state.depositedThrough) + 1;
  if (!fresh && channel.pending >= CARD_HASHES_REFILL_BELOW) return null;
  const count = Math.min(
    CARD_HASHES_AHEAD - channel.pending,
    CARD_RELAY_MAX_PENDING - channel.pending,
    MAX_COUNTER - first + 1
  );
  return count > 0 ? { first, count } : null;
}

/**
 * This phone, as a card's channel knows it: its key (device-key.ts), and its push token (iOS; null
 * without notifications, and on Android, whose card socket wakes it).
 */
export type CardDevice = { key: DeviceKey; pushToken: string | null };

/** How long what a relay announced is trusted before `/v1/info` is asked again. */
export const RELAY_INFO_TTL_MS = 60 * 60_000;

type Announced = Pick<RelayInfo, "listen">;

/** By host: what its `/v1/info` announced (`/v1/listen`), and when (ms). */
const announced = new Map<string, Announced & { at: number }>();

/** Forgets what the relays announced (tests). */
export function resetRelayInfo(): void {
  announced.clear();
}

/**
 * What `host` announces, asked at most once per RELAY_INFO_TTL_MS; null when it cannot tell
 * (unreachable, out of shape), not kept: asked again at the next sync.
 */
async function announcedBy(host: string): Promise<Announced | null> {
  const known = announced.get(host);
  if (known && Date.now() - known.at < RELAY_INFO_TTL_MS) return known;
  try {
    const { listen } = await fetchRelayInfo(host);
    announced.set(host, { listen, at: Date.now() });
    return { listen };
  } catch (error) {
    logFailure("Reading what a card relay announces failed", error);
    return null;
  }
}

/**
 * Whether `host` serves the card socket (`/v1/listen`), and its heartbeat, as last announced; null
 * when it does not, undefined when it cannot tell (unreachable, out of shape). Asked only where the
 * card socket is offered (socket.ts).
 */
async function relayListenOf(host: string): Promise<RelayInfo["listen"] | undefined> {
  if (!cardSocketOffered()) return null;
  const announced = await announcedBy(host);
  return announced === null ? undefined : announced.listen;
}

/**
 * Gives the card socket the relays to listen to (socket.ts): those of the account's active cards
 * (`states`, else as this phone keeps them) that announce `/v1/listen`, each once, with its
 * heartbeat. After each full sync (sync.ts), and each change of the active cards made on this phone
 * (pairing, programming, deletion, reset): a card's relay is listened to from its pairing on, not
 * from the next sync. A relay that cannot tell (offline, restarting) keeps what the service had for
 * it: only its answer takes it out, never its silence, which would stop the service and, with it,
 * the cards' passes (card-passes.ts) until an online sync. Never rejects: a failure is logged, and
 * the next sync gives them again.
 */
export async function listenForCards(
  access: CardAccess,
  states?: readonly CardState[]
): Promise<void> {
  if (!cardSocketOffered()) return;
  try {
    const listening = new Map(
      (cardSocketStatus()?.relays ?? []).map((relay) => [relay.host, relay] as const)
    );
    const relays = new Map<string, CardSocketRelay>();
    for (const { status, relayHost } of states ?? (await cardStatesOnDevice(access))) {
      if (status !== "active" || relays.has(relayHost)) continue;
      const listen = await relayListenOf(relayHost);
      const kept = listen === undefined ? listening.get(relayHost) : undefined;
      if (listen) {
        relays.set(relayHost, { host: relayHost, heartbeatSeconds: listen.heartbeatSeconds });
      } else if (kept) {
        relays.set(relayHost, kept);
      }
    }
    await listenToRelays([...relays.values()]);
  } catch (error) {
    logFailure("Giving the card socket its relays failed", error);
  }
}

/**
 * What a card's channel on `host` is told of the card socket (`PUT /v1/channel` `listen`): this
 * phone's listening token's hash while the socket is on, null when it is off (the relay stops
 * sending this phone the channel's taps), nothing for a relay that does not serve `/v1/listen`,
 * cannot tell, where the socket's state or token cannot be read now, or where it is not offered
 * (no field: the relay keeps what it had).
 */
async function listenFieldFor(host: string): Promise<string | null | undefined> {
  if (!(await relayListenOf(host))) return undefined;
  let on: boolean;
  try {
    on = cardSocketOn();
  } catch (error) {
    // Its state unreadable for now: never told "off", the relay keeps what it had.
    logFailure("Reading the card socket's state failed", error);
    return undefined;
  }
  if (!on) return null;
  try {
    return await cardSocketListenHash(host);
  } catch (error) {
    // The token unreadable for now (the Keystore, the storage): the channel's sync goes on, the
    // relay keeps what it had, and the next sync tries again.
    logFailure("Reading the card socket's listening token failed", error);
    return undefined;
  }
}

/**
 * One sync per card's programming (its relay, its keys' version) at a time: a second call shares
 * the first. A card moved meanwhile has its new channel synced apart, never told the former's.
 */
const running = new Map<string, Promise<ChannelSync>>();

/**
 * Resolves once the channel syncs running now have ended, however they end: one that began before
 * the card socket was turned on or off may have told its relay the former state, and a sync asked
 * meanwhile would share it (sync.ts, switchCardSocket).
 */
export async function settleCardSyncs(): Promise<void> {
  await Promise.allSettled([...running.values()]);
}

/**
 * What a sync of a card's channel needs of the card's keys: the open account's (any card), or one
 * card's pass (a refill after a payment with the app closed, card-passes.ts).
 */
type ChannelKeys = {
  walletId: string;
  /** The card's channel's secret on its relay (a copy: wiped by the caller). */
  channelSecret(state: CardState): Uint8Array;
  /** The card's K2 at its keys' version (a copy: wiped by the caller). */
  k2(state: CardState): Uint8Array;
  /** Keeps the card's state with the last counter whose hash was deposited. */
  recordDeposited(state: Omit<CardState, "updatedAt">): Promise<unknown>;
};

function keysOfAccess(access: CardAccess): ChannelKeys {
  return {
    walletId: access.walletId,
    channelSecret: (state) => channelSecretOf(access.root, state.cardId, state.relayHost),
    k2: (state) => {
      const uid = hexToBytes(state.uid);
      const keys = cardKeysOf(access.root, uid, state.keyVersion);
      const k2 = keys.k2.slice();
      wipeCardKeys(keys);
      uid.fill(0);
      return k2;
    },
    recordDeposited: (state) => recordCardState(access, state)
  };
}

/** Its pass's keys, for its card only: the device keeps the state, the account's sync publishes it. */
function keysOfPass(walletId: string, pass: CardPass): ChannelKeys {
  const own = (state: CardState) => {
    if (
      !isPassOf(pass, state) ||
      state.keyVersion !== pass.keyVersion ||
      state.relayHost !== pass.relayHost ||
      state.uid !== pass.uid
    ) {
      throw new Error("Another card's pass");
    }
  };
  return {
    walletId,
    channelSecret: (state) => {
      own(state);
      return pass.channelSecret.slice();
    },
    k2: (state) => {
      own(state);
      return pass.k2.slice();
    },
    recordDeposited: (state) => recordCardStateOnDevice(walletId, state)
  };
}

function shared(
  access: ChannelKeys,
  state: CardState,
  run: () => Promise<ChannelSync>
): Promise<ChannelSync> {
  const key = `${access.walletId}:${state.cardId}:${state.relayHost}:${state.keyVersion}`;
  let sync = running.get(key);
  if (!sync) {
    sync = run().finally(() => running.delete(key));
    running.set(key, sync);
  }
  return sync;
}

/**
 * After a card payment: the entries of the card's next taps deposited again when fewer than
 * CARD_HASHES_REFILL_BELOW wait, sealed with the token the channel already
 * holds (push-marks.ts); the channel's key and token are not touched (the next app start does).
 */
export async function refillCardChannel(
  access: CardAccess,
  state: CardState,
  key: DeviceKey
): Promise<ChannelSync> {
  const keys = keysOfAccess(access);
  const sealed = (await loadPushMarks()).get(state.cardId) ?? null;
  return shared(keys, state, () => doSync(keys, state, key, sealed, false, false));
}

/**
 * As refillCardChannel, the account closed, with the card's pass (a payment with the app closed):
 * the last counter deposited kept on the device, published by the account's next sync.
 */
export async function refillCardChannelWithPass(
  walletId: string,
  pass: CardPass,
  state: CardState,
  key: DeviceKey
): Promise<ChannelSync> {
  const keys = keysOfPass(walletId, pass);
  const sealed = (await loadPushMarks()).get(state.cardId) ?? null;
  return shared(keys, state, () => doSync(keys, state, key, sealed, false, false));
}

/**
 * Brings the card's channel up to date: PUT with this phone's key (creates it when the relay lost
 * or never had it), the phone's token sealed again into the entries still waiting when it
 * changed, then entries deposited when fewer than CARD_HASHES_REFILL_BELOW wait, the card's state
 * recorded with the last counter deposited.
 */
export function syncCardChannel(
  access: CardAccess,
  state: CardState,
  device: CardDevice,
  { anew = false }: { anew?: boolean } = {}
): Promise<ChannelSync> {
  const keys = keysOfAccess(access);
  return shared(keys, state, () => doSync(keys, state, device.key, device.pushToken, anew, true));
}

/** The entries of counters `first` to `last` (none when `last < first`), sealed with `pushToken`. */
function entriesOf(
  access: ChannelKeys,
  state: CardState,
  first: number,
  last: number,
  pushToken: string | null
) {
  const uid = hexToBytes(state.uid);
  const k2 = access.k2(state);
  try {
    return tapEntries(k2, uid, first, Math.max(0, last - first + 1), pushToken);
  } finally {
    k2.fill(0);
    uid.fill(0);
  }
}

/** `update: false` (a payment's refill) only reads and refills. */
async function doSync(
  access: ChannelKeys,
  state: CardState,
  key: DeviceKey,
  pushToken: string | null,
  anew: boolean,
  update: boolean
): Promise<ChannelSync> {
  if (state.status !== "active") throw new Error("Only an active card has a channel");
  const secret = access.channelSecret(state);
  try {
    // A card programmed again keeps its id, so its channel: the hashes of its earlier keys, which
    // no tap gives any more, go with the old channel.
    if (anew) await deleteChannel(state.relayHost, secret);
    let fresh = anew;
    const full = update || anew;
    // Told by a full sync only: a refill, after a payment, asks nothing more of the relay
    // (`/v1/info`) nor of the Keystore.
    let listen: string | null | undefined;
    if (full) {
      listen = await listenFieldFor(state.relayHost);
      const put = await putChannel(state.relayHost, secret, {
        publicKey: key.publicKey,
        ...(listen === undefined ? {} : { listen })
      });
      fresh ||= put === "created";
    }
    const channel = await fetchChannel(state.relayHost, secret);
    // Deleted since it was made, or (a refill) no longer there: the next app start makes it.
    if (!channel) return { status: "unreachable" };
    fresh ||= channel.nextIdx === 0;
    let pending = channel.pending;
    // The token changed since it was sealed (or is not known): the entries still waiting take the
    // new one. The relay keeps only those still pending, and never adds one.
    const marks = await loadPushMarks();
    if (!fresh && update && (!marks.has(state.cardId) || marks.get(state.cardId) !== pushToken)) {
      const waiting = entriesOf(
        access,
        state,
        state.lastCounter + 1,
        state.depositedThrough,
        pushToken
      );
      if (waiting.length > 0) {
        pending = (await patchHashes(state.relayHost, secret, waiting)).pending;
      }
      await markPushToken(state.cardId, pushToken);
    }
    const range = refillRange(state, { ...channel, pending }, fresh);
    if (range) {
      const entries = entriesOf(
        access,
        state,
        range.first,
        range.first + range.count - 1,
        pushToken
      );
      pending = (await postHashes(state.relayHost, secret, entries)).pending;
      // A new channel holds this token only; an old one, this token or the one marked already.
      if (fresh) await markPushToken(state.cardId, pushToken);
      const { updatedAt: _updatedAt, ...rest } = state;
      await access.recordDeposited({
        ...rest,
        depositedThrough: range.first + range.count - 1
      });
    }
    // A hash given (or, for a refill, a relay the socket listens to): the relay sends this phone
    // its taps at once.
    const listened = full ? typeof listen === "string" : cardSocketListensTo(state.relayHost);
    return pushToken || listened ? { status: "ready", pending } : { status: "noPush", pending };
  } catch (error) {
    if (error instanceof RelayError) {
      if (error.code === "unreachable") return { status: "unreachable" };
      return { status: "refused", error };
    }
    throw error;
  } finally {
    secret.fill(0);
  }
}
