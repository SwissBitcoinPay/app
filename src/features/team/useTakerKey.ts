import { useEffect, useState } from "react";

import { logFailure } from "@/lib/log/log";
import { profileAccount, type TerminalProfile } from "@/lib/terminal/model";

import { takerKeyOf } from "./member";

/**
 * The key this device marks its sales' declarations with (takerKeyOf), for `profile`'s account:
 * undefined while it is read, null without one. Keyed by the account, as the business's registry
 * (useAccountRecord): a profile refreshed meanwhile (its name, its currency) reads the same key, and
 * a sale shown keeps its registry.
 */
export function useTakerKey(profile: TerminalProfile): Uint8Array | null | undefined {
  const account = profileAccount(profile);
  const [read, setRead] = useState<{ account: string; key: Uint8Array | null } | null>(null);
  useEffect(() => {
    let alive = true;
    takerKeyOf(profile).then(
      (key) => {
        if (alive) setRead({ account, key });
      },
      (error: unknown) => {
        logFailure("Reading this device's taker key failed", error);
        if (alive) setRead({ account, key: null });
      }
    );
    return () => {
      alive = false;
    };
    // Keyed by the account: another profile of it reads the same key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);
  return read?.account === account ? read.key : undefined;
}
