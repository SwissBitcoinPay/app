import { MEMBERSHIP_KEY, parseMembership, type Membership } from "./membership";

/**
 * Same API as membership-store.ts, in the browser's `localStorage` (the web has no secure
 * storage), like the point of sale's profile. In this browser only, gone with the site data:
 * Safari clears it after 7 days without a visit, except for a web app added to the home screen.
 */

export async function loadMembership(): Promise<Membership | null> {
  try {
    const stored = localStorage.getItem(MEMBERSHIP_KEY);
    return stored === null ? null : parseMembership(JSON.parse(stored));
  } catch {
    return null;
  }
}

export async function saveMembership(membership: Membership): Promise<void> {
  localStorage.setItem(MEMBERSHIP_KEY, JSON.stringify(membership));
}

export async function clearMembership(): Promise<void> {
  localStorage.removeItem(MEMBERSHIP_KEY);
}
