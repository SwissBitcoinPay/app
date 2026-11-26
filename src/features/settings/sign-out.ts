import { resetCardStates } from "@/features/card/states";
import { resetImages } from "@/features/media/images";
import { lockTerminal } from "@/features/navigation/lock";
import { clearDeviceRelays } from "@/features/relays/device-relays";
import { resetRelayStatuses } from "@/features/relays/relay-test";
import { departTeam } from "@/features/team/member";
import { resetOwnerDeviceCache } from "@/features/team/owner-device";
import { publishTerminalProfile } from "@/features/terminal/profile-cache";
import { forgetCardPayees } from "@/lib/card/payees";
import { logFailure } from "@/lib/log/log";
import { setCurrentRelays } from "@/lib/relays/current";

import { wipeDevice } from "./device-wipe";

/**
 * "Log out" of the owner: the account closes and the wallet
 * disconnects (as "Switch to till mode"), then everything the app keeps on this device is
 * removed (device-wipe.ts), and the app goes back to the welcome screen (no profile any more). The
 * passkey opens the account again at the next login, its settings from the relays. Rejects when
 * something could not be removed: what was removed stays removed, the welcome screen shows anyway.
 */
export async function signOut(): Promise<void> {
  await lockTerminal().catch((error: unknown) => {
    // Destroyed anyway (connection.ts).
    logFailure("Disconnecting the wallet failed", error);
  });
  try {
    await wipeDevice();
  } finally {
    setCurrentRelays(null);
    resetOwnerDeviceCache();
    resetImages();
    resetRelayStatuses();
    // What the session read of the account's cards (the web app keeps them in memory only).
    resetCardStates();
    forgetCardPayees();
    publishTerminalProfile(null);
  }
}

/**
 * "Leave the business" of an employee: the owner is told first, on the
 * business's relays (departTeam: "Employees" lists the employee as gone, until the owner removes
 * it), then the device forgets the business (membership, lot of on-chain addresses, point of sale)
 * and its relays, and goes back to the welcome screen. Rejects with LeaveError "unreachable" when
 * no majority of the relays took the departure: nothing is forgotten.
 */
export async function leaveBusiness(): Promise<void> {
  await departTeam();
  await clearDeviceRelays();
  resetImages();
  resetRelayStatuses();
}
