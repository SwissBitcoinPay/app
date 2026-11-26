import { useEffect, useState } from "react";

import { profileAccount, type TerminalProfile } from "@/lib/terminal/model";

/*
 * A value this device keeps for one account beside the point of sale's profile (the business's
 * registry, the point of sale's options): saved with the account it belongs to (profileAccount),
 * and ignored for another account. The owner's device saves it once the account is open
 * (useTeamSync.ts), an employee's from its channel (member.ts). The screens that read it read it
 * again after each save.
 */

export type AccountRecord<T> = {
  /** The value saved and its account, null without one. */
  read: () => Promise<{ account: string; value: T } | null>;
  write: (account: string, value: T) => Promise<void>;
  same: (a: T, b: T) => boolean;
  /** The reads of the screens showing it, run again after each save. */
  listeners: Set<() => void>;
};

export function accountRecord<T>(spec: Omit<AccountRecord<T>, "listeners">): AccountRecord<T> {
  return { ...spec, listeners: new Set() };
}

/** Saves `value` for `account` (profileAccount), unless it is the one saved. */
export async function saveAccountRecord<T>(
  record: AccountRecord<T>,
  account: string,
  value: T
): Promise<void> {
  const saved = await record.read();
  if (saved?.account === account && record.same(saved.value, value)) return;
  await record.write(account, value);
  for (const listener of record.listeners) listener();
}

/** The value of `profile`'s account on this device, null when it has none. */
export async function loadAccountRecord<T>(
  record: AccountRecord<T>,
  profile: TerminalProfile
): Promise<T | null> {
  const saved = await record.read();
  return saved && saved.account === profileAccount(profile) ? saved.value : null;
}

/** The value of `profile`'s account: undefined while it is read, null without one. */
export function useAccountRecord<T>(
  record: AccountRecord<T>,
  profile: TerminalProfile
): T | null | undefined {
  const account = profileAccount(profile);
  const [held, setHeld] = useState<{ account: string; value: T | null } | null>(null);
  useEffect(() => {
    let alive = true;
    let reads = 0;
    const read = () => {
      // Only the latest read counts: an earlier one answered late would bring back an older value.
      const id = ++reads;
      void loadAccountRecord(record, profile).then((value) => {
        if (alive && id === reads) setHeld({ account, value });
      });
    };
    read();
    record.listeners.add(read);
    return () => {
      alive = false;
      record.listeners.delete(read);
    };
    // Keyed by the account: another profile of it reads the same value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, record]);
  return held?.account === account ? held.value : undefined;
}
