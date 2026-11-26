import { sameImageRef, type ImageRef } from "@/lib/media/image";
import { BRANDING_RECORD_VERSION, type TerminalProfile } from "@/lib/terminal/model";
import { loadBrandingRecord, saveBrandingRecord } from "@/lib/terminal/profile";

import {
  accountRecord,
  loadAccountRecord,
  saveAccountRecord,
  useAccountRecord
} from "./account-record";

/*
 * What this device shows of the business and of its user: the business's
 * logo, and an employee's own photo. The owner's device saves the logo from the account's settings
 * once the account is open and at each change (src/features/team/useTeamSync.ts, "Settings"), an
 * employee's from its channel, its photo when it picks one (src/features/team/member.ts). None, or
 * another account's: the initials.
 */

export type Branding = { logo: ImageRef | null; avatar: ImageRef | null };

const branding = accountRecord<Branding>({
  read: async () => {
    const saved = await loadBrandingRecord();
    return saved
      ? { account: saved.account, value: { logo: saved.logo, avatar: saved.avatar } }
      : null;
  },
  write: (account, value) =>
    saveBrandingRecord({ version: BRANDING_RECORD_VERSION, account, ...value }),
  same: (a, b) => sameImageRef(a.logo, b.logo) && sameImageRef(a.avatar, b.avatar)
});

/** Saves the branding of `account` (profileAccount), unless it is the one saved. */
export function saveBranding(account: string, value: Branding): Promise<void> {
  return saveAccountRecord(branding, account, value);
}

/** The branding saved for `account`, null when none (or another account's). */
export async function loadBrandingOf(account: string): Promise<Branding | null> {
  const saved = await branding.read();
  return saved && saved.account === account ? saved.value : null;
}

/** The branding of `profile`'s account, null when none. */
export function loadBranding(profile: TerminalProfile): Promise<Branding | null> {
  return loadAccountRecord(branding, profile);
}

/** The branding of `profile`'s account: undefined while it is read, null without one. */
export function useBranding(profile: TerminalProfile): Branding | null | undefined {
  return useAccountRecord(branding, profile);
}
