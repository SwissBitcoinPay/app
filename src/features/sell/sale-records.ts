import { majority } from "@/config/registry";
import { openTeam } from "@/features/team/owner";
import { logFailure } from "@/lib/log/log";
import {
  fetchMtpSales,
  mtpSaleEvent,
  mtpSalesFilter,
  type MtpSaleRecord
} from "@/lib/mtpelerin/sale-record";
import { copyEveryEvent, publishAgainToQuorum, type RelayCall } from "@/lib/nostr/pool";
import { sameRelayList } from "@/lib/relays/list";
import { deriveMtpSaleKeys, type TeamKeys } from "@/lib/team/keys";
import { TEAM_TIMEOUT_MS } from "@/lib/team/shared";

/*
 * The records of the sales to Mt Pelerin (src/lib/mtpelerin/sale-record.ts) on the account's
 * relays: written before each sale's payment leaves (flow.ts `paySale`: no majority, nothing
 * paid), read by "Wallet" for the payments it lists (its row
 * "Sale in CHF" and its details), copied by a change of the account's relays
 * (moved-records.ts) and deleted with the account (account-erasure.ts).
 */

/** No majority of the account's relays took the sale's record: its payment never leaves. */
export class SaleRecordError extends Error {
  constructor() {
    super("No majority of the relays took the sale's record");
    this.name = "SaleRecordError";
  }
}

/** A call to `relays` as the sales' author: a relay gives and takes its events from it only. */
function salesCall(team: TeamKeys, relays: readonly string[], timeoutMs: number): RelayCall {
  return {
    relays,
    timeoutMs,
    channel: "account",
    authKey: () => deriveMtpSaleKeys(team).nostr.secretKey
  };
}

/**
 * Writes `sale` to a majority of the open account's relays. Rejects with SaleRecordError when no
 * majority took it, with TeamError "noAccount" without the open account.
 */
export async function recordMtpSale(sale: MtpSaleRecord): Promise<void> {
  const { team, settings } = openTeam();
  const call = salesCall(team, settings.relays, TEAM_TIMEOUT_MS.waiting);
  const taken = await publishAgainToQuorum(
    mtpSaleEvent(deriveMtpSaleKeys(team), sale),
    call,
    majority(call.relays.length)
  );
  if (!taken) throw new SaleRecordError();
}

/**
 * The records of the sales whose invoices have `paymentHashes`, by payment hash, from the open
 * account's relays. `complete`: a majority of them answered, so a hash without a record has none
 * (it was written to a majority before its payment left); else read again later. A hash without a
 * record is a payment as the wallet has it (any other sending): never a sale guessed. Rejects with
 * TeamError "noAccount" without the open account.
 */
export async function readMtpSales(
  paymentHashes: readonly string[]
): Promise<{ sales: ReadonlyMap<string, MtpSaleRecord>; complete: boolean }> {
  const { team, settings } = openTeam();
  const read = await fetchMtpSales(
    deriveMtpSaleKeys(team),
    salesCall(team, settings.relays, TEAM_TIMEOUT_MS.background),
    paymentHashes
  );
  return { sales: read.sales, complete: read.answered >= majority(settings.relays.length) };
}

/**
 * Copies the sales' records to the relays `next` after a change of the account's relays
 * (copyMovedRecords), each as it is (copyEveryEvent). Resolves with whether a majority of `next`
 * holds every record. Never rejects.
 */
export async function copyMtpSales(
  team: TeamKeys,
  before: readonly string[],
  next: readonly string[]
): Promise<boolean> {
  if (sameRelayList(before, next)) return true;
  try {
    const copied = await copyEveryEvent(
      mtpSalesFilter(deriveMtpSaleKeys(team)),
      salesCall(team, before, TEAM_TIMEOUT_MS.background),
      next
    );
    if (!copied)
      logFailure("Copying the Mt Pelerin sales: not every record reached the new relays");
    return copied;
  } catch (error) {
    // The account closed meanwhile (its team keys wiped): copied again at its next opening.
    logFailure("Copying the Mt Pelerin sales to the new relays failed", error);
    return false;
  }
}
