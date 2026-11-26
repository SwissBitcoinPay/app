import { sameBitcoinNode, type BitcoinNode } from "@/lib/onchain/node";
import { TERMINAL_OPTIONS_VERSION, type TerminalProfile } from "@/lib/terminal/model";
import { loadTerminalOptions, saveTerminalOptions } from "@/lib/terminal/profile";

import {
  accountRecord,
  loadAccountRecord,
  saveAccountRecord,
  useAccountRecord
} from "./account-record";

/*
 * The business's choices that change what this device's point of sale offers ("Settings"):
 * whether its invoices also offer an on-chain address, the tolerance of on-chain underpayments
 * its sales are judged with (src/lib/onchain/tolerance.ts), and the merchant's own Bitcoin node it
 * reads the chain on (src/lib/onchain/node.ts). The owner's device saves them from the account's
 * settings once the account is open (account-settings.ts), an employee's from its channel
 * (member.ts). Until then, or for another account, the defaults apply: on-chain payments accepted,
 * as before the choice existed, without tolerance, on mempool.space.
 */

export type PosOptions = {
  onchain: boolean;
  /** Basis points, 0 for none: what a new sale holds (charge.tsx). */
  onchainTolerance: number;
  /** The merchant's own Bitcoin node; null for mempool.space (src/features/onchain/explorer.ts). */
  bitcoinNode: BitcoinNode | null;
};

/** Without saved options: on-chain payments accepted, the whole amount asked, mempool.space. */
const DEFAULT_OPTIONS: PosOptions = { onchain: true, onchainTolerance: 0, bitcoinNode: null };

const options = accountRecord<PosOptions>({
  read: async () => {
    const saved = await loadTerminalOptions();
    return saved
      ? {
          account: saved.account,
          value: {
            onchain: saved.onchain,
            onchainTolerance: saved.onchainTolerance ?? 0,
            bitcoinNode: saved.bitcoinNode ?? null
          }
        }
      : null;
  },
  write: (account, value) =>
    saveTerminalOptions({
      version: TERMINAL_OPTIONS_VERSION,
      account,
      onchain: value.onchain,
      ...(value.onchainTolerance > 0 ? { onchainTolerance: value.onchainTolerance } : {}),
      ...(value.bitcoinNode ? { bitcoinNode: value.bitcoinNode } : {})
    }),
  same: (a, b) =>
    a.onchain === b.onchain &&
    a.onchainTolerance === b.onchainTolerance &&
    sameBitcoinNode(a.bitcoinNode, b.bitcoinNode)
});

/** Saves the options of `account` (profileAccount), unless they are the ones saved. */
export function savePosOptions(account: string, value: PosOptions): Promise<void> {
  return saveAccountRecord(options, account, value);
}

/** Whether `profile`'s point of sale offers on-chain addresses: true without saved options. */
export async function loadOnchainPayments(profile: TerminalProfile): Promise<boolean> {
  return (await loadPosOptions(profile)).onchain;
}

/** `profile`'s point of sale's options: the defaults without saved ones. */
export async function loadPosOptions(profile: TerminalProfile): Promise<PosOptions> {
  return (await loadAccountRecord(options, profile)) ?? DEFAULT_OPTIONS;
}

/** `profile`'s point of sale's options (the defaults without saved ones): undefined while read. */
export function usePosOptions(profile: TerminalProfile): PosOptions | undefined {
  const saved = useAccountRecord(options, profile);
  return saved === undefined ? undefined : (saved ?? DEFAULT_OPTIONS);
}
