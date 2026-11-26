import { MAX_VAT_BASIS_POINTS } from "@/config/invoices";
import { copyExportEpoch } from "@/lib/team/export-epoch";
import { ownerDevicesSecret } from "@/lib/team/keys";
import { TOLERANCE_STEP } from "@/config/onchain";
import {
  getAccountSettings,
  getAccountTeamKeys,
  getAccountWalletId,
  updateAccount,
  whenAccountSynced,
  whenBackedUp,
  type BackupOutcome
} from "@/features/account/session";
import { copyCardMonths, copyCardRecords } from "@/features/card/relays-move";
import { copyCatalog } from "@/features/catalog/catalog";
import { copyInvoices, copyLateInvoices } from "@/features/invoices/invoices";
import { settlingHolders } from "@/features/payment-link/owner-finals";
import { noteRelaysMove } from "@/features/settings/declarations-copy";
import { findIntegrationPending } from "@/features/team/integration-pending";
import { moveTeam, relayCall, syncTeamChannels } from "@/features/team/owner";
import { readRoster } from "@/features/team/roster";
import { findUnsettled } from "@/features/team/unsettled";
import { refreshTerminalDetails } from "@/features/terminal/activate";
import { syncAddressDescription } from "@/features/terminal/address-description";
import { saveBranding } from "@/features/terminal/branding";
import { savePosOptions } from "@/features/terminal/options";
import { copyPaymentRates } from "@/features/wallet/payment-rates";
import { copyMtpSales } from "@/features/sell/sale-records";
import { copyWalletSends } from "@/features/wallet/wallet-sends";
import { copyLegacyHistory } from "@/features/migration/history-import";
import { holdActivity } from "@/lib/activity";
import { inBatches } from "@/lib/batches";
import { logFailure } from "@/lib/log/log";
import { copyImageTo, createImage, publishImageToMajority, type ImageRef } from "@/lib/media/image";
import { parseBitcoinNode, type BitcoinNode } from "@/lib/onchain/node";
import { MAX_ONCHAIN_TOLERANCE } from "@/lib/onchain/tolerance";
import { nowUnix } from "@/lib/rates/snapshot";
import { parseRelayList, sameRelayList } from "@/lib/relays/list";
import { liveRelays, replaceRetiredRelays } from "@/lib/relays/retired";
import {
  BUSINESS_ADDRESS_FIELD_MAX_LENGTH,
  BUSINESS_NUMBER_MAX_LENGTH,
  type BusinessAddress,
  type MerchantSettings,
  type SettingsPatch
} from "@/lib/settings/merchant";

/*
 * The owner's changes in "Settings", saved live: each one is
 * saved in the account's settings (on the device, then backed up on the relays, session.ts). It is
 * saved once a relay took its backup (the screen shows its loader
 * until then, then says so); then this device's point of sale follows it (its profile, options and
 * branding), and so do the employees' devices, through their channels (src/features/team/owner.ts),
 * in the background. When no relay took it, the change is cancelled: what it wrote is put back.
 */

/** Longest business name: it shares the header and the side bar's card with other details. */
export const BUSINESS_NAME_MAX_LENGTH = 60;

export type SettingsErrorCode =
  /** No finished account is open. */
  | "noAccount"
  | "invalid"
  /**
   * The relays did not answer: none took the image (the logo: its reference would lead nowhere),
   * or they could not tell whether the business's sales are final (a change of relays).
   */
  | "unreachable"
  /** A change of relays while a sale of the business is not final yet (unsettled.ts). */
  | "salesInProgress"
  /**
   * A change of relays while an integration has a payment not final yet: an order whose address
   * is leased, or a payment being confirmed (integration-pending.ts).
   */
  | "integrationsPending"
  /** No relay took the change's backup: the change is cancelled. */
  | "unpublished"
  /** A backup of a newer format is on the relays (never published over): the change is cancelled. */
  | "newerBackup";

export class SettingsError extends Error {
  readonly code: SettingsErrorCode;

  constructor(code: SettingsErrorCode, message: string) {
    super(message);
    this.name = "SettingsError";
    this.code = code;
  }
}

/** The open account's settings, once its sign-up is done: SettingsError "noAccount" otherwise. */
function openSettings(): MerchantSettings {
  const settings = getAccountSettings();
  if (!settings || settings.signUp !== "done") {
    throw new SettingsError("noAccount", "No finished account is open");
  }
  return settings;
}

/**
 * Brings this device's point of sale in step with the account's settings: its profile (business
 * name and currency), its options (on-chain payments, their tolerance, the Bitcoin node) and its
 * branding (the logo). Never rejects.
 */
export async function applyToThisDevice(settings: MerchantSettings): Promise<void> {
  const walletId = getAccountWalletId();
  if (!walletId) return;
  try {
    await refreshTerminalDetails(settings);
    await savePosOptions(walletId, {
      onchain: settings.onchainPayments,
      onchainTolerance: settings.onchainTolerance,
      bitcoinNode: settings.bitcoinNode
    });
    await saveBranding(walletId, { logo: settings.logo, avatar: null });
  } catch (error) {
    logFailure("Applying the settings to this device failed", error);
  }
}

/**
 * After a change saved or cancelled: this device follows the account's settings as they are now,
 * not the copy the change saved (another change, saved after it, may have been cancelled since),
 * then the employees' channels in the background.
 */
async function applied(): Promise<void> {
  const settings = getAccountSettings();
  if (settings) await applyToThisDevice(settings);
  void syncTeamChannels();
}

/**
 * Saves a change of the open account, from the settings as the relays left them, once a relay took
 * its backup; when none did, puts back what it wrote (undo) and rejects (unpublishedError).
 */
async function save(
  patch: (settings: MerchantSettings) => SettingsPatch
): Promise<MerchantSettings> {
  openSettings();
  await whenAccountSynced();
  const walletId = getAccountWalletId();
  // The values the change replaced, read in the same write.
  let replaced: SettingsPatch = {};
  const saved = await updateAccount((current) => {
    const change = patch(current);
    replaced = Object.fromEntries(
      (Object.keys(change) as (keyof SettingsPatch)[]).map((key) => [key, current[key]])
    );
    return change;
  });
  const outcome = await whenBackedUp(saved);
  if (outcome !== "published") {
    // Closed: its keys are wiped, the change is published at the account's next opening.
    if (outcome !== "closed") await undo(walletId, saved, replaced);
    throw unpublishedError(outcome);
  }
  await applied();
  return saved;
}

/**
 * Puts back `replaced`, the values a change that saved `saved` replaced, when no majority of the
 * relays took its backup (the change is cancelled). Only the fields still as it
 * wrote them: another change made since stays. Then this device and the employees' channels follow
 * the settings put back (applied: another change, taken by a relay meanwhile, may have carried
 * this one).
 * The settings put back are backed up in the background, as any change: at the latest at the
 * account's next opening (session.ts), dated after a copy of the change a relay took too late.
 */
async function undo(
  walletId: string | null,
  saved: MerchantSettings,
  replaced: SettingsPatch
): Promise<void> {
  const keys = Object.keys(replaced) as (keyof SettingsPatch)[];
  const asSaved = (settings: MerchantSettings) =>
    keys.filter((key) => Object.is(settings[key], saved[key]));
  const current = getAccountSettings();
  // Another account opened meanwhile: never written there.
  if (!current || getAccountWalletId() !== walletId) {
    throw new SettingsError("noAccount", "The account closed before its change was cancelled");
  }
  if (asSaved(current).length > 0) {
    await updateAccount(
      (latest) =>
        Object.fromEntries(asSaved(latest).map((key) => [key, replaced[key]])) as SettingsPatch
    );
  }
  await applied();
}

/** Why a change whose backup no majority of the relays took is not saved (save, changeRelays). */
function unpublishedError(outcome: Exclude<BackupOutcome, "published">): SettingsError {
  switch (outcome) {
    case "frozen":
      return new SettingsError("newerBackup", "A backup of a newer format is on the relays");
    case "closed":
      return new SettingsError("noAccount", "The account closed before its backup went out");
    case "unreachable":
      return new SettingsError("unpublished", "No majority of the relays took the backup");
  }
}

/** The business name as saved: trimmed, at most BUSINESS_NAME_MAX_LENGTH characters. */
export function normalizeBusinessName(name: string): string {
  return name.trim().slice(0, BUSINESS_NAME_MAX_LENGTH);
}

/**
 * "Business name". Once saved, the description of the account's Lightning address follows it in
 * the background (address-description.ts): the name payers and card holders see. Its failure never
 * undoes the rename; it is tried again at the next unlock.
 */
export function changeBusinessName(name: string): Promise<MerchantSettings> {
  const businessName = normalizeBusinessName(name);
  if (businessName === "") return Promise.reject(new SettingsError("invalid", "No name"));
  return save(() => ({ businessName })).then((settings) => {
    void syncAddressDescription();
    return settings;
  });
}

/** A line of the business's address as saved: trimmed, at most its longest length. */
export function normalizeAddressLine(line: string): string {
  // Trimmed again once cut: a line ending in a space where it is cut is no valid line.
  return line.trim().slice(0, BUSINESS_ADDRESS_FIELD_MAX_LENGTH).trim();
}

/**
 * "Business address", one line at a time: the street, the
 * postal code, the city (`typed` trimmed; "" empties it) or the country (an ISO 3166-1 alpha-2
 * code). Merged into the address as the relays left it, so that a line changed on another device
 * stays; the first line typed starts it, in the account's detected country.
 */
export function changeBusinessAddress(
  line: keyof BusinessAddress,
  typed: string
): Promise<MerchantSettings> {
  const value = line === "country" ? typed : normalizeAddressLine(typed);
  if (line === "country" && !/^[A-Z]{2}$/.test(value)) {
    return Promise.reject(new SettingsError("invalid", "Not a country code"));
  }
  return save((current) => {
    const address: BusinessAddress = current.businessAddress ?? {
      street: "",
      postalCode: "",
      city: "",
      country: current.detectedCountry
    };
    return { businessAddress: { ...address, [line]: value } };
  });
}

/**
 * The business's company number or VAT number, named by its
 * country (src/features/invoices/business-details.ts): `typed` trimmed, at most
 * BUSINESS_NUMBER_MAX_LENGTH characters; "" removes it.
 */
export function changeBusinessNumber(
  which: "companyNumber" | "vatNumber",
  typed: string
): Promise<MerchantSettings> {
  const value = typed.trim().slice(0, BUSINESS_NUMBER_MAX_LENGTH).trim();
  return save(() => ({ [which]: value }));
}

/** "Reference currency": what the point of sale counts in, on every device of the business. */
export function changeDisplayCurrency(currency: string): Promise<MerchantSettings> {
  if (!/^[A-Z]{3}$/.test(currency)) {
    return Promise.reject(new SettingsError("invalid", "Not a currency code"));
  }
  return save(() => ({ displayCurrency: currency }));
}

/**
 * "On-chain payments": whether the point of sale's invoices (the owner's devices' and the
 * employees') also offer an on-chain address; never the invoices of "New invoice", the
 * assistants' nor the integrations' orders.
 */
export function changeOnchainPayments(onchainPayments: boolean): Promise<MerchantSettings> {
  return save(() => ({ onchainPayments }));
}

/**
 * "Underpayment tolerance" (src/lib/onchain/tolerance.ts): in basis
 * points, by tenths of a percent (TOLERANCE_STEP) from 0 (none) to MAX_ONCHAIN_TOLERANCE. It
 * applies to the sales created afterwards, on every device of the business and for its
 * integrations (their channels carry it).
 */
export function changeOnchainTolerance(onchainTolerance: number): Promise<MerchantSettings> {
  if (
    !Number.isSafeInteger(onchainTolerance) ||
    onchainTolerance < 0 ||
    onchainTolerance > MAX_ONCHAIN_TOLERANCE ||
    onchainTolerance % TOLERANCE_STEP !== 0
  ) {
    return Promise.reject(new SettingsError("invalid", "Not a tolerance"));
  }
  return save(() => ({ onchainTolerance }));
}

/**
 * "Bitcoin node" (src/lib/onchain/node.ts): the merchant's own
 * node, where the owner's devices, the employees' and the integrations' servers (their channels
 * carry it) and the account's wallet read the chain; null for mempool.space. Only a node in its
 * one spelling is saved.
 */
export function changeBitcoinNode(bitcoinNode: BitcoinNode | null): Promise<MerchantSettings> {
  if (bitcoinNode !== null && parseBitcoinNode(bitcoinNode) === null) {
    return Promise.reject(new SettingsError("invalid", "Not a Bitcoin node"));
  }
  return save(() => ({
    bitcoinNode:
      bitcoinNode === null
        ? null
        : { url: bitcoinNode.url, fallback: bitcoinNode.fallback, payers: bitcoinNode.payers }
  }));
}

/**
 * "Look up scanned products": whether a product scanned
 * into the catalogue is looked up on Open Food Facts, on every device of the account.
 */
export function changeProductLookup(productLookup: boolean): Promise<MerchantSettings> {
  return save(() => ({ productLookup }));
}

/**
 * "Default VAT rate" (the only value of an invoice kept in the account): what a new line of an
 * invoice starts with, in basis points; null for the standard
 * rate of the account's country (config/invoices.ts).
 */
export function changeVatRate(vatRate: number | null): Promise<MerchantSettings> {
  if (
    vatRate !== null &&
    (!Number.isSafeInteger(vatRate) || vatRate < 0 || vatRate > MAX_VAT_BASIS_POINTS)
  ) {
    return Promise.reject(new SettingsError("invalid", "Not a VAT rate"));
  }
  return save(() => ({ vatRate }));
}

/**
 * "Split" and "Bank account": the share kept in bitcoin, the payout currency and the
 * Mt Pelerin bank account the fiat share is wired to (its id: null at 100 % bitcoin, required
 * below; its details stay Mt Pelerin's).
 */
export function changeSplit({
  bitcoinPercent,
  payoutCurrency,
  payoutAccountId
}: {
  bitcoinPercent: number;
  payoutCurrency: string;
  payoutAccountId: string | null;
}): Promise<MerchantSettings> {
  if ((bitcoinPercent === 100) !== (payoutAccountId === null)) {
    return Promise.reject(new SettingsError("invalid", "A bank account exactly below 100 %"));
  }
  return save(() => ({ bitcoinPercent, payoutCurrency, payoutAccountId }));
}

/**
 * "Create my merchant profile": a card holder's account
 * becomes a merchant's, with the split and the bank account of the merchant sign-up's steps (as
 * changeSplit), in one change, so that a relay takes both or neither (cancelled then: the account
 * stays a card holder's). For good: no way back to a card holder's account. Only then may its
 * wallet exist (main-wallet.ts): this device's point of sale is prepared by the caller
 * (activateTerminal), the account's other devices at their next unlock (device-kind.ts). An account
 * already a merchant's (a former attempt whose point of sale was not prepared) only changes its
 * split.
 */
export function becomeMerchant(answers: {
  bitcoinPercent: number;
  payoutCurrency: string;
  payoutAccountId: string | null;
}): Promise<MerchantSettings> {
  const { bitcoinPercent, payoutCurrency, payoutAccountId } = answers;
  if ((bitcoinPercent === 100) !== (payoutAccountId === null)) {
    return Promise.reject(new SettingsError("invalid", "A bank account exactly below 100 %"));
  }
  return save((current) =>
    current.usage === "card"
      ? { usage: "merchant", bitcoinPercent, payoutCurrency, payoutAccountId }
      : { bitcoinPercent, payoutCurrency, payoutAccountId }
  );
}

/**
 * The business's logo: the image (a JPEG of MAX_AVATAR_BYTES at most) goes to the account's
 * relays first (one at least must take it, else SettingsError "unreachable" and nothing changes),
 * then its reference is saved (save). Null removes it (the initials again).
 */
export async function changeLogo(bytes: Uint8Array | null): Promise<MerchantSettings> {
  openSettings();
  // The relays as the sync left them: another device may have changed the account's list, where
  // the reference is saved (save) and where the devices look for the image.
  await whenAccountSynced();
  const settings = openSettings();
  let logo: ImageRef | null = null;
  if (bytes) {
    const image = createImage(bytes, nowUnix());
    try {
      await publishImageToMajority(image.event, image.ref, settings.relays);
    } catch {
      throw new SettingsError("unreachable", "No majority of the relays took the logo");
    }
    logo = image.ref;
  }
  return save(() => ({ logo }));
}

/**
 * "Nostr relays": the account's new list (1 to MAX_RELAYS relays), without any transition.
 * Refused while a sale of the business is not final yet, its employees'
 * and the owner's devices' included (SettingsError "salesInProgress"; "unreachable" when the
 * relays could not tell, unsettled.ts), or while an integration has a payment not final yet
 * ("integrationsPending", integration-pending.ts): nothing made on the list left is followed any
 * more. The
 * backup goes once to the list left too, with the notice of the move, where the owner's other
 * devices find the new one (session.ts); the logo and the articles are copied to the new relays.
 * So are the cards' records (src/features/card/relays-move.ts): the copies of their months first,
 * the history past its records' 90 days, before anything changes ("unreachable" when no majority
 * of the relays gives or takes them), the rest once the change is saved. And the invoices of
 * "New invoice" with the counter of their numbers (src/lib/invoice/upkeep.ts), before
 * anything changes too ("unreachable" likewise: read on the new list, an invoice missing would no
 * longer show, a counter missing would give the numbers given already again); what another of the
 * owner's devices writes on the list left meanwhile follows once the change is saved.
 *
 * The employees and the integrations follow (moveTeam): their records go to
 * the new relays first, then their channels name the new relays, on the list left, where their
 * devices read, and on the new one; nobody is removed. When the lists cannot take them, TeamError
 * "unreachable" and nothing changes.
 *
 * Saved once a relay took the backup, as any change (save); when none did, the team moves back
 * to the list left and the change is cancelled. When the team cannot move back (the relays out of
 * reach), the new list stays: TeamError "unreachable", its backup published at the account's next
 * opening.
 *
 * A relay sattle.me retired (src/lib/relays/retired.ts) is never saved: its replacement is, as the
 * account's opening would make it (replaceAccountRetiredRelays). One change of relays at a time.
 */
export async function changeRelays(next: readonly string[]): Promise<MerchantSettings> {
  const typed = parseRelayList([...next]);
  if (!typed) throw new SettingsError("invalid", "Not a valid list of relays");
  // A relay sattle.me retired is never saved again: its replacement is (retired.ts).
  const relays = replaceRetiredRelays(typed) ?? typed;
  // The records it copies to the new list may take minutes (a long history of the cards, a relay
  // out of reach): the auto-lock never closes the account meanwhile, as "Delete account".
  const release = holdActivity();
  try {
    return await oneChangeOfRelays(async () => {
      const before = openSettings();
      if (sameRelayList(before.relays, relays)) return before;
      return moveRelays(() => relays);
    });
  } finally {
    release();
  }
}

/**
 * The account's list with the relays sattle.me retired replaced (src/lib/relays/retired.ts), as
 * changeRelays makes a change, from the list the relays left (the
 * account synced): null when it holds none, nothing changed. Started by itself at the account's
 * opening, without its owner seeing anything (src/features/relays/retired-relays.ts): the activity
 * is not held, the auto-lock closes the account as ever, and a change it interrupts is made, or
 * made again, at the next opening. Rejects as changeRelays when it cannot be made now (a sale not
 * final yet, the relays not retired out of reach, the account closed): the caller tries again
 * later.
 */
export function replaceAccountRetiredRelays(): Promise<MerchantSettings | null> {
  return oneChangeOfRelays(async () => {
    openSettings();
    await whenAccountSynced();
    if (!replaceRetiredRelays(openSettings().relays)) return null;
    return moveRelays((relays) => replaceRetiredRelays(relays));
  });
}

/** The change of the account's relays under way, the owner's or a replacement's: one at a time. */
let relaysChanges: Promise<unknown> = Promise.resolve();

/** Runs `change` once the changes of relays before it are over. */
function oneChangeOfRelays<T>(change: () => Promise<T>): Promise<T> {
  const run = relaysChanges.then(change);
  relaysChanges = run.catch(() => undefined);
  return run;
}

/**
 * Changes the account's relays to `nextOf` the list the relays left (the account synced); nothing
 * when it gives null or the same list. What is read and written on the list left is on its relays
 * sattle.me did not retire (liveRelays): a retired relay is taken as dead, so that the list it
 * leaves needs a majority of the others only. Another relay out of reach counts as ever: an
 * outage of the merchant's network or of a relay kept never moves the account.
 */
async function moveRelays(
  nextOf: (relays: readonly string[]) => readonly string[] | null
): Promise<MerchantSettings> {
  const before = openSettings();
  // The settings as the relays left them: their relays and the owner's devices.
  await whenAccountSynced();
  const team = getAccountTeamKeys();
  const settings = openSettings();
  if (!team) throw new SettingsError("noAccount", "No finished account is open");
  const next = nextOf(settings.relays);
  const relays = next && parseRelayList([...next]);
  if (!relays) {
    if (next) throw new SettingsError("invalid", "Not a valid list of relays");
    return settings;
  }
  if (sameRelayList(settings.relays, relays)) return settings;
  // Where the list left is read and written.
  const left = liveRelays(settings.relays);
  // Every employee: the roster a majority of the relays gave (one on the others could be missing).
  const roster = await readRoster(team, left);
  if (roster.status !== "read") {
    throw new SettingsError("unreachable", "No majority of the relays gave the roster");
  }
  // The new list answers, a majority of it: nothing written there could be read otherwise (every
  // write of the change, its backup included, waits for a majority of the list it goes to).
  // Before anything changes: a change half made would have to be undone on a list out of reach.
  if ((await readRoster(team, relays)).status !== "read") {
    throw new SettingsError("unreachable", "No majority of the new relays answered");
  }
  // Those removed within the year too: their removal no longer waits for their sales
  // (removeEmployee), which must not be left open on the list left any more than an employee's
  // still there (their records made after their removal never count, findUnsettled).
  const unsettled = await findUnsettled(
    team,
    settlingHolders(team, roster.roster, settings.devices),
    { thisDevice: true, relays: left }
  );
  if (unsettled === null) {
    throw new SettingsError("unreachable", "The relays could not tell whether the sales are final");
  }
  if (unsettled.invoices + unsettled.links > 0) {
    throw new SettingsError("salesInProgress", "A sale of the business is not final yet");
  }
  // An integration's open lease names no witness yet: it is not copied to the new list (declarations-
  // copy.ts), where a server would find its address free and lease it to another order: refused,
  // as the removal of an integration.
  const pending = await inBatches(roster.roster.integrations, 1, (integration) =>
    findIntegrationPending(team, integration, { ...relayCall(team), relays: left })
  );
  if (pending === null) {
    throw new SettingsError("unreachable", "The relays could not tell the integrations' payments");
  }
  if (pending.some(({ open, confirming }) => open + confirming > 0)) {
    throw new SettingsError("integrationsPending", "An integration has a payment not final yet");
  }
  // The copies of the cards' months: nothing else keeps their history past 90 days. On the new
  // list before anything changes, as "Wallet"'s copies
  // (moveTeam): copied again at the next try when the change does not go through.
  const cardMonths = await copyCardMonths(left, relays);
  if (!cardMonths) {
    throw new SettingsError(
      "unreachable",
      "No majority of the relays gave or took the cards' months"
    );
  }
  // The account's export epoch, likewise: on a list without it, a device would seal its records
  // as before the epoch, and an epoch raised there would serve its keys again.
  if (!(await copyExportEpoch(ownerDevicesSecret(team), left, relays))) {
    throw new SettingsError(
      "unreachable",
      "No majority of the relays gave or took the export epoch"
    );
  }
  // The invoices and the counter of their numbers, likewise: nothing else keeps them.
  const invoices = await copyInvoices(team, left, relays);
  if (!invoices) {
    throw new SettingsError("unreachable", "No majority of the relays gave or took the invoices");
  }
  // The history copied from the v2 account, likewise: nothing keeps it once the v2 service ends.
  if (!(await copyLegacyHistory(team, left, relays))) {
    throw new SettingsError("unreachable", "No majority of the relays gave or took the v2 history");
  }
  const walletId = getAccountWalletId();
  const moved = await moveTeam(relays, liveRelays);
  const outcome = await whenBackedUp(moved);
  if (outcome !== "published") {
    if (outcome === "closed" || getAccountWalletId() !== walletId) {
      // The account closed before the change went out or was cancelled: it stays saved on the
      // device, published at the account's next opening (session.ts). Its declarations are copied
      // then, unless the list left is the account's again (copyPendingDeclarations).
      void noteRelaysMove(walletId, left, moved.updatedAt);
    }
    if (outcome !== "closed") {
      if (getAccountWalletId() !== walletId) {
        throw new SettingsError("noAccount", "The account closed before its change was cancelled");
      }
      // The channels name the list left again, on both lists (moveTeam).
      try {
        await moveTeam(settings.relays);
      } catch (error) {
        // The new list stays: the devices and the logo follow it, as after a change taken.
        await applied();
        const now = getAccountSettings();
        if (now && !sameRelayList(now.relays, before.relays)) {
          if (now.logo) void copyImageTo(now.logo, now.relays, left);
          void copyCatalog(team, left, now.relays);
          void copyLateInvoices(team, left, now.relays, invoices);
          void copyPaymentRates(team, left, now.relays);
          void copyWalletSends(team, left, now.relays);
          void copyMtpSales(team, left, now.relays);
          void copyLegacyHistory(team, left, now.relays);
          void copyCardRecords(left, now.relays, cardMonths);
          void noteRelaysMove(walletId, left, now.updatedAt);
        }
        throw error;
      }
      await applied();
    }
    throw unpublishedError(outcome);
  }
  await applied();
  if (moved.logo) void copyImageTo(moved.logo, moved.relays, left);
  // The articles follow, as the logo ("Items").
  void copyCatalog(team, left, moved.relays);
  // What the list left got of the invoices since they were copied (another of the owner's devices).
  void copyLateInvoices(team, left, moved.relays, invoices);
  // The price of bitcoin at each payment, which "Export" reads (src/features/wallet/).
  void copyPaymentRates(team, left, moved.relays);
  // Each payment the wallet sent, which the assistants' export reads (wallet-sends.ts).
  void copyWalletSends(team, left, moved.relays);
  // Each sale to Mt Pelerin, which "Wallet" reads (src/features/sell/sale-records.ts).
  void copyMtpSales(team, left, moved.relays);
  // The history copied from the v2 account (src/features/migration/history-import.ts).
  void copyLegacyHistory(team, left, moved.relays);
  // The cards' other records, and their images.
  void copyCardRecords(left, moved.relays, cardMonths);
  // And the registry's declarations of the wallet's payments: "Wallet" reads them on the
  // account's list (declarations-copy.ts). From the list moveTeam left, as the relays gave it; kept
  // on the device until copied, and copied again once the transition is over.
  void noteRelaysMove(walletId, left, moved.updatedAt);
  return moved;
}
