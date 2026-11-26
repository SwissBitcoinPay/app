import { copyCardRecords } from "@/features/card/relays-move";
import { copyCatalog } from "@/features/catalog/catalog";
import { copyLateInvoices } from "@/features/invoices/invoices";
import { copyLegacyHistory } from "@/features/migration/history-import";
import { copyMtpSales } from "@/features/sell/sale-records";
import { copyLinkRecords } from "@/features/team/owner";
import { readRoster } from "@/features/team/roster";
import { copyPaymentRates } from "@/features/wallet/payment-rates";
import { copyWalletSends } from "@/features/wallet/wallet-sends";
import { copyImageTo } from "@/lib/media/image";
import type { MerchantSettings } from "@/lib/settings/merchant";
import { copyExportEpoch } from "@/lib/team/export-epoch";
import { ownerDevicesSecret, type TeamKeys } from "@/lib/team/keys";

/*
 * The account's records a change of its relays copies once saved (changeRelays), made again from
 * the list it left: a change may be made by itself at the
 * account's opening (src/features/relays/retired-relays.ts), and the auto-lock closes the account
 * while it copies, so that copies cut short are made again at its next opening, until they are
 * whole (declarations-copy.ts keeps each change until then, src/lib/registry/moves.ts).
 *
 * Each record goes as it is (publishCopies): a relay keeps the newest of an address, so a copy
 * made again never replaces what the account wrote on its list since. What is copied before the
 * change is saved (the cards' months, the invoices with their counter, the v2 history, the team's
 * roster and channels), or written again by the devices (the cards' states, the employees' own
 * records), is not here. Nor are the taps and movements of the cards within their 90 days, which
 * the account's devices write again too (src/features/card/relays-move.ts).
 */

/**
 * Copies the records of the account (`team`, its `settings`) from the relays `left` (those of the
 * list a change left that sattle.me did not retire) to its list: the catalogue and its photos, the
 * logo, the rates of the payments, the wallet's sendings, the sales to Mt Pelerin, the v2 history,
 * the cards' records and images, the invoices, and the records of every holder's payment links. One after the other, all
 * of them even when one fails. Resolves with whether every one is whole on the account's list.
 * Never rejects.
 */
export async function copyMovedRecords(
  team: TeamKeys,
  settings: MerchantSettings,
  left: readonly string[]
): Promise<boolean> {
  const next = settings.relays;
  const copies: (() => Promise<boolean>)[] = [
    () => copyCatalog(team, left, next),
    async () => (settings.logo ? copyImageTo(settings.logo, next, left) : true),
    () => copyExportEpoch(ownerDevicesSecret(team), left, next),
    () => copyPaymentRates(team, left, next),
    () => copyWalletSends(team, left, next),
    () => copyMtpSales(team, left, next),
    () => copyLegacyHistory(team, left, next),
    () => copyCardRecords(left, next, { later: [] }),
    // The roster first: the invoices' writers are its assistants, as this device knows it.
    async () => {
      const roster = await readRoster(team, next).catch(() => null);
      if (roster?.status !== "read") return false;
      const invoices = await copyLateInvoices(team, left, next, new Map());
      const links = await copyLinkRecords(team, roster.roster, settings.devices, left, next);
      return invoices && links;
    }
  ];
  let whole = true;
  for (const copy of copies) {
    if (!(await copy())) whole = false;
  }
  return whole;
}
