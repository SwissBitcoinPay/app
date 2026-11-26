import { isName, isPublicKey, isUnixSeconds } from "./shared";

/**
 * What an employee's device keeps of its team, next to its point of
 * sale's profile (src/lib/terminal/): the team's public key, which every channel must be signed by,
 * and the member's secret, from which its keys derive. The secret can neither spend nor read the
 * owner's settings: it opens this member's channel and signs its sales. Saved by membership-store.ts
 * (secure storage in the apps, `localStorage` on the web).
 */
export type Membership = {
  /** Format of this record. A change of format needs a new version and a migration. */
  version: 1;
  /** The team's public key (hex). */
  team: string;
  /** The member's secret (hex). */
  secret: string;
  /** The member's name, as the owner typed it. */
  name: string;
  /** This device's id in the team (MemberDevice). */
  deviceId: string;
  joinedAt: number;
};

export const MEMBERSHIP_VERSION = 1;

/** Storage key, on the device only. Never rename it: installed apps keep their data there. */
export const MEMBERSHIP_KEY = "team-membership";

/** Validates a stored membership; anything else counts as none. */
export function parseMembership(value: unknown): Membership | null {
  if (value === null || typeof value !== "object") return null;
  const m = value as Record<string, unknown>;
  if (
    m.version !== MEMBERSHIP_VERSION ||
    !isPublicKey(m.team) ||
    typeof m.secret !== "string" ||
    !/^[0-9a-f]{64}$/.test(m.secret) ||
    !isName(m.name) ||
    typeof m.deviceId !== "string" ||
    !/^[0-9a-f]{32}$/.test(m.deviceId) ||
    !isUnixSeconds(m.joinedAt)
  ) {
    return null;
  }
  return {
    version: MEMBERSHIP_VERSION,
    team: m.team,
    secret: m.secret,
    name: m.name,
    deviceId: m.deviceId,
    joinedAt: m.joinedAt
  };
}
