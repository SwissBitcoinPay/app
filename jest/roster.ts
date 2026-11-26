/**
 * The team's roster for the tests (src/lib/team/roster.ts): its records published to the in-memory
 * relays (jest/nostr-relays.ts) as one of the owner's devices publishes them, for a test that needs
 * an employee, an integration or an assistant without inviting or creating it through the screens.
 */
import { DEFAULT_RELAYS } from "../src/config/relays";
import { publishToRelays } from "../src/lib/nostr/pool";
import { deriveRosterKeys, type TeamKeys } from "../src/lib/team/keys";
import {
  assistantSeat,
  employeeSeat,
  fetchRosterAnswers,
  integrationSeat,
  isRemovedSeat,
  rosterOf,
  seatEvent,
  type Assistant,
  type Integration,
  type Seat,
  type TeamMember
} from "../src/lib/team/roster";

type Options = {
  /** The relays it goes to: the default list (the test account's) unless said. */
  relays?: readonly string[];
  /** Its event's date: its creation, or its removal, unless said. */
  createdAt?: number;
};

/** Publishes `seat`'s record; resolves with the relays that took it. */
export function publishSeat(
  team: TeamKeys,
  seat: Seat,
  { relays = DEFAULT_RELAYS, createdAt }: Options = {}
): Promise<string[]> {
  const keys = deriveRosterKeys(team);
  return publishToRelays(seatEvent(keys, seat, createdAt ?? seat.removedAt ?? seat.since), {
    relays,
    timeoutMs: 1000,
    channel: "account",
    authKey: keys.nostr.secretKey
  });
}

/** Publishes an employee's record, in the team. */
export function publishMember(team: TeamKeys, member: TeamMember, options?: Options) {
  return publishSeat(team, employeeSeat(member), options);
}

/** Publishes an integration's record, in the team. */
export function publishIntegration(team: TeamKeys, integration: Integration, options?: Options) {
  return publishSeat(team, integrationSeat(integration), options);
}

/** Publishes an assistant's record, in the team, or removed on `removedAt`. */
export function publishAssistant(
  team: TeamKeys,
  assistant: Assistant,
  { removedAt = null, ...options }: Options & { removedAt?: number | null } = {}
) {
  return publishSeat(team, { ...assistantSeat(assistant), removedAt }, options);
}

/** Publishes the removal of `member` or `integration` on `removedAt`. */
export function publishRemoved(
  team: TeamKeys,
  seat: TeamMember | Integration,
  removedAt: number,
  options?: Options
) {
  const base = "invitedAt" in seat ? employeeSeat(seat) : integrationSeat(seat);
  return publishSeat(team, { ...base, removedAt }, options);
}

/**
 * The seats the relays `relays` hold, each by its newest record, as a reader that knows nothing
 * else finds them (no device's memory): those in the team, and those removed.
 */
export async function rosterOn(
  team: TeamKeys,
  relays: readonly string[] = DEFAULT_RELAYS
): Promise<{ active: Seat[]; removed: Seat[] }> {
  const keys = deriveRosterKeys(team);
  const answers = await fetchRosterAnswers(keys, {
    relays,
    timeoutMs: 1000,
    channel: "account",
    authKey: keys.nostr.secretKey
  });
  const seats = [...rosterOf(keys, answers).seats.values()]
    .map(({ seat }) => seat)
    .sort((a, b) => a.since - b.since || (a.id < b.id ? -1 : 1));
  return {
    active: seats.filter((seat) => !isRemovedSeat(seat)),
    removed: seats.filter(isRemovedSeat)
  };
}
