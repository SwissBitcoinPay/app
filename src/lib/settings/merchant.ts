import { MAX_VAT_BASIS_POINTS } from "@/config/invoices";
import { MAX_OWNER_DEVICES } from "@/config/team";
import { readPayeeMetadata } from "@/lib/lightning/metadata";
import { parseBitcoinNode, type BitcoinNode } from "@/lib/onchain/node";
import { toleranceOf } from "@/lib/onchain/tolerance";
import { parseOptionalImageRef, type ImageRef } from "@/lib/media/image";
import { parseRelayList } from "@/lib/relays/list";

/**
 * The sign-up steps after the passkey (the screens of src/app/onboarding/), in path order. An
 * unfinished sign-up resumes at the step it saved.
 */
export const SIGN_UP_STEPS = ["usage", "split", "bank", "card"] as const;

export type SignUpStep = (typeof SIGN_UP_STEPS)[number];

/**
 * What the account is for, chosen on the welcome screen ("Create my account", "A BoltCard");
 * an account of an earlier version chose it on its usage step.
 */
export type AccountUsage = "merchant" | "card";

/**
 * The state of an account: what the merchant chose at sign-up, and how far the sign-up went. Saved
 * on the device as soon as the account is created, then at each step,
 * one file per wallet (see store.ts), and backed up encrypted on Nostr relays (src/lib/backup/).
 * No account API for these.
 */
export type MerchantSettings = {
  /**
   * Format version of the stored file. This one is read, and 17 to 12 converted to it
   * (`parseMerchantSettings`: the bank details dropped, the recovery phrase's check, the split's
   * start and the v2 wallet's transfers, the Bitcoin node and the product lookup, the business's
   * address and numbers); settings of an older format are invalid (no data of before is kept),
   * those of a newer one are never replaced.
   */
  version: 18;
  /**
   * Last change, in Unix seconds, strictly increasing (`touchSettings`): the newest of the device's
   * copy and the backup wins.
   */
  updatedAt: number;
  /**
   * The step an unfinished sign-up resumes at, or "done" once "Start accepting payments" saved it,
   * or the card's pairing ended (the card holder gets this app).
   */
  signUp: SignUpStep | "done";
  /**
   * Generated when the account is created (`businessName()`), then changed in "Settings". Its
   * employees' devices get it in their channel.
   */
  businessName: string;
  /** null until chosen (src/app/index.tsx; resumed as a merchant's: onboarding/steps.ts). */
  usage: AccountUsage | null;
  /** Share of each payment kept in bitcoin, integer 0–100. */
  bitcoinPercent: number;
  /**
   * ISO 4217 code of the fiat share, detected when the account is created (the device is not asked
   * again), or picked on the split screen during the sign-up or in "Settings" ("Split").
   */
  payoutCurrency: string;
  /**
   * ISO 4217 code of the point of sale ("Reference currency"): the payout currency at sign-up,
   * then changed in "Settings". Its employees' devices get it in their channel.
   */
  displayCurrency: string;
  /**
   * ISO 3166-1 alpha-2 code of the country detected with the payout currency (see detectCountry):
   * the country of residence until the merchant picks one. null when nothing told it.
   */
  detectedCountry: string | null;
  /**
   * Where the fiat share is wired: the id of the Mt Pelerin bank account its sale goes to
   * (`beneficiary_id`), an opaque reference. The account's IBAN, holder
   * and address are Mt Pelerin's, read from its API whenever shown, never kept by the app, on a
   * device or the relays (format 18: format 17's bank details are dropped). Saved by "Start
   * accepting payments" and "Settings › Bank account": null during the
   * sign-up and at 100 % bitcoin; with a fiat share, null only for an account of format 17, whose
   * account is to choose again (its split's sale then goes to its first account in the payout
   * currency, SalePage.tsx `saleAccount`).
   */
  payoutAccountId: string | null;
  /**
   * Whether the point of sale also offers an on-chain address ("On-chain payments" of "Settings":
   * "Accepted at the point of sale, on top of Lightning" / "Lightning only at the point of sale"),
   * on the owner's devices and the employees' (their channel carries it,
   * src/lib/team/channel.ts). The point of sale's only: the
   * invoices, the owner's and the assistants', and the integrations' orders offer on-chain
   * whatever it says. True for a new account. Changed in "Settings".
   */
  onchainPayments: boolean;
  /**
   * The account's Nostr relays: its backups, its employees' records and
   * channels, its payment links and its registry go there, on all its devices (each keeps them as
   * its own list, src/features/relays/device-relays.ts). Chosen at sign-up from the device's list,
   * then in "Settings", without any transition (the change is refused while a sale is not final,
   * src/features/team/unsettled.ts).
   */
  relays: string[];
  /** The business's logo (src/lib/media/image.ts), null for the initials. */
  logo: ImageRef | null;
  /**
   * The business's postal address ("Business address" of "Settings"), written under its name on
   * its invoices' PDF; null until a field of it is typed.
   * Format 14.
   */
  businessAddress: BusinessAddress | null;
  /**
   * The business's identification number ("UID number" in Switzerland, "SIRET number" in
   * France…: src/features/invoices/business-details.ts names it by the business's country), as
   * typed (trimmed), "" when none; written on its invoices. Format 14.
   */
  companyNumber: string;
  /** The business's VAT number, as `companyNumber` ("VAT number", "USt-IdNr."…). Format 14. */
  vatNumber: string;
  /**
   * The owner's own devices that took payments for the account, in the
   * order they were added: each publishes its sales and payment links as an employee does, under
   * keys derived from its id (src/lib/team/keys.ts), so that the owner sees, from any of its
   * devices, whether a sale of the business is not final yet. At most MAX_OWNER_DEVICES.
   */
  devices: OwnerDevice[];
  /**
   * The VAT rate an invoice's lines start with ("New invoice"), in
   * basis points (810: 8.1 %), changed in "Settings"; null until then: the standard rate of the
   * country the account was created in (`detectedCountry`, standardVatRate of
   * src/config/invoices.ts). The rest of an invoice is not kept from one to the next.
   */
  vatRate: number | null;
  /**
   * The tolerance of on-chain underpayments ("Underpayment tolerance",
   * src/lib/onchain/tolerance.ts), in basis points from 0 (none) to
   * MAX_ONCHAIN_TOLERANCE: a sale paid on-chain short of its amount by no more than it is paid,
   * at the owner's point of sale, its employees' (their channel carries it) and its
   * integrations' (their channel too, checkout-spec SPEC.md §31). Changed in "Settings", by the
   * owner alone; a sale keeps the one of its creation. Sensitive: never shown to an employee nor
   * sent to a payer. 0 for a new account.
   */
  onchainTolerance: number;
  /**
   * The LUD-06 metadata the account's Lightning address served before each change of its
   * description (src/features/terminal/address-description.ts: the description follows the
   * business name), exactly as served,
   * oldest first, at most MAX_FORMER_ADDRESS_METADATA. An invoice's description hash is the
   * SHA-256 of the metadata of its time: an invoice made under a former name stays an invoice of
   * the merchant's address (checkDeclaredInvoice, src/lib/registry/registry.ts). Empty for a new
   * account.
   */
  formerAddressMetadata: string[];
  /**
   * The merchant's own Bitcoin node ("Bitcoin node" of "Settings", src/lib/onchain/node.ts), where
   * the owner's devices, the employees' and the
   * integrations' servers (their channels carry it) read the chain, and the account's wallet too;
   * null for mempool.space. Format 15, null for an account of before.
   */
  bitcoinNode: BitcoinNode | null;
  /**
   * Whether a product scanned into the catalogue is looked up on Open Food Facts for its name and
   * photo ("Look up scanned products"): the service gets
   * the barcode and the device's IP address. Format 15, true for an account of before (it always
   * did).
   */
  productLookup: boolean;
  /**
   * Since when (Unix seconds) the split's sale counts what the wallet receives
   * (src/lib/mtpelerin/split.ts): the account's creation, then each change of
   * `bitcoinPercent` (touchSettings: a new share starts from nothing, what came under the former
   * one is never sold at the new one). Format 16: for an account of before, its last change of
   * then (`updatedAt`), which no change of its share came after.
   */
  splitSince: number;
  /**
   * The transactions that moved the v2 wallet's coins to this account's wallet (lowercase hex,
   * src/features/migration/transfer.ts), the oldest first, at most MAX_LEGACY_TRANSFERS: the
   * split's sale never counts them, on any of the owner's devices. Format 16, none for an account
   * of before.
   */
  legacyTransfers: string[];
  /**
   * The yearly check of the recovery phrase (src/features/recovery-check/): its owner has 30 days
   * to type the 12 words back once the account
   * keeps more than 1000 CHF, then each year while it still does. Format 17, nothing done nor due
   * for an account of before.
   */
  recoveryCheck: RecoveryCheck;
};

/** The recovery phrase's check (`MerchantSettings.recoveryCheck`), in Unix seconds. */
export type RecoveryCheck = {
  /** When its owner last typed the 12 words back right, null never. */
  verifiedAt: number | null;
  /**
   * Since when a check is due (the account seen keeping more than the threshold, a year after the
   * last check or never checked), null when none is due: the 30 days count from it.
   */
  dueSince: number | null;
  /**
   * When the account was seen keeping more than the threshold, for the invitation to check the
   * words a year after their last check (each time the account is seen above it, one invitation
   * at most; one always under it never gets any). After
   * `verifiedAt` (or the words never checked): first seen so since. Equal to `verifiedAt`: seen so
   * before that check, carried by it once (policy.ts verifiedCheck). Absent, or before
   * `verifiedAt`: not seen since.
   */
  aboveThresholdAt?: number;
};

/** No check done nor due: a new account's, and one of before format 17. */
export const NO_RECOVERY_CHECK: RecoveryCheck = { verifiedAt: null, dueSince: null };

/**
 * Transfers of the v2 wallet's coins kept (`legacyTransfers`): the oldest go first. A transfer is
 * one transaction that empties the v2 wallet, up to LEGACY_WALLET_MAX_INPUTS (500) of its coins at
 * once, never one per v2 sale: a wallet of hundreds of v2 sales migrates in one or two. Another
 * follows only when the v2 wallet is paid again after a migration (the v2 service's last payouts).
 */
export const MAX_LEGACY_TRANSFERS = 64;

/**
 * Former metadata kept (`formerAddressMetadata`): the oldest go first. An invoice is declared for a
 * sale of its own period (an hour), and a renamed business keeps the last ones.
 */
export const MAX_FORMER_ADDRESS_METADATA = 32;
/** Longest metadata kept: breez.tips serves a description of 255 characters at most. */
const MAX_ADDRESS_METADATA_LENGTH = 2048;

/** One of the owner's own devices (`MerchantSettings.devices`). */
export type OwnerDevice = {
  /** 32 hex digits, random: its secret, and so all its keys, derive from it (deviceSecret). */
  id: string;
  /** Unix seconds: when the account first opened on it. */
  addedAt: number;
};

/**
 * The business's postal address, each line typed on its own and saved as typed (trimmed), "" when
 * empty; `country` (ISO 3166-1 alpha-2) the account's detected country until another is picked,
 * null when none is known.
 */
export type BusinessAddress = {
  street: string;
  postalCode: string;
  city: string;
  country: string | null;
};

/** Longest line of the business's address: as long as an invoice recipient's. */
export const BUSINESS_ADDRESS_FIELD_MAX_LENGTH = 120;

/**
 * Longest company or VAT number: twice the longest known ("CHE-123.456.789 MWST", 20; a SIRET
 * typed with its spaces, 17), room for a register's name typed with it.
 */
export const BUSINESS_NUMBER_MAX_LENGTH = 40;

/** A change of the settings: `version` and `updatedAt` are never patched (see touchSettings). */
export type SettingsPatch = Partial<Omit<MerchantSettings, "version" | "updatedAt">>;

const CURRENCY_CODE = /^[A-Z]{3}$/;
const COUNTRY_CODE = /^[A-Z]{2}$/;

function isFilled(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/** A Mt Pelerin id (src/lib/mtpelerin/guards.ts `id`): letters, digits and `-`, 128 at most. */
function isMtpId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9-]{1,128}$/.test(value);
}

function isAddressLine(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= BUSINESS_ADDRESS_FIELD_MAX_LENGTH &&
    value === value.trim()
  );
}

export function isBusinessNumber(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= BUSINESS_NUMBER_MAX_LENGTH &&
    value === value.trim()
  );
}

export function isBusinessAddress(value: unknown): value is BusinessAddress {
  if (typeof value !== "object" || value === null) return false;
  const address = value as Record<string, unknown>;
  return (
    isAddressLine(address.street) &&
    isAddressLine(address.postalCode) &&
    isAddressLine(address.city) &&
    (address.country === null ||
      (typeof address.country === "string" && COUNTRY_CODE.test(address.country)))
  );
}

function isOwnerDevice(value: unknown): value is OwnerDevice {
  if (typeof value !== "object" || value === null) return false;
  const device = value as Record<string, unknown>;
  return (
    typeof device.id === "string" &&
    /^[0-9a-f]{32}$/.test(device.id) &&
    isUnixSeconds(device.addedAt)
  );
}

function isOwnerDevices(value: unknown): value is OwnerDevice[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_OWNER_DEVICES &&
    value.every(isOwnerDevice) &&
    new Set(value.map((device: OwnerDevice) => device.id)).size === value.length
  );
}

function isUnixSeconds(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPercent(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100;
}

function isSignUp(value: unknown): value is MerchantSettings["signUp"] {
  return value === "done" || SIGN_UP_STEPS.some((step) => step === value);
}

/** Whether the step, the usage, the share and the bank account go together. */
function isConsistent(settings: MerchantSettings): boolean {
  const { signUp, usage, bitcoinPercent, payoutAccountId } = settings;
  switch (signUp) {
    case "done":
      // Either path (the card's too: its holder gets the same app, and may choose a split in
      // "Settings" later): a bank account only when part of each payment is paid out in fiat
      // (none for format 17's, whose account is to choose again: `payoutAccountId`).
      return usage !== null && (bitcoinPercent < 100 || payoutAccountId === null);
    case "usage":
      return payoutAccountId === null;
    case "split":
      return usage === "merchant" && payoutAccountId === null;
    case "bank":
      return usage === "merchant" && bitcoinPercent < 100 && payoutAccountId === null;
    case "card":
      return usage === "card" && payoutAccountId === null;
  }
}

/** Metadata a payee's address served (readPayeeMetadata), each once, at most the limit kept. */
function isFormerAddressMetadata(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_FORMER_ADDRESS_METADATA &&
    new Set(value).size === value.length &&
    value.every(
      (metadata) =>
        typeof metadata === "string" &&
        metadata.length <= MAX_ADDRESS_METADATA_LENGTH &&
        readPayeeMetadata(metadata) !== null
    )
  );
}

/** Transactions the migration made (`legacyTransfers`): ids in lowercase hex, each once. */
function isLegacyTransfers(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_LEGACY_TRANSFERS &&
    new Set(value).size === value.length &&
    value.every((txid) => typeof txid === "string" && /^[0-9a-f]{64}$/.test(txid))
  );
}

/** Checks the settings before they are written, and what is read back (device, backup). */
export function isMerchantSettings(value: unknown): value is MerchantSettings {
  if (typeof value !== "object" || value === null) return false;
  const settings = value as Record<string, unknown>;
  const valid =
    settings.version === CURRENT_VERSION &&
    typeof settings.updatedAt === "number" &&
    Number.isSafeInteger(settings.updatedAt) &&
    settings.updatedAt >= 0 &&
    isSignUp(settings.signUp) &&
    isFilled(settings.businessName) &&
    (settings.usage === null || settings.usage === "merchant" || settings.usage === "card") &&
    isPercent(settings.bitcoinPercent) &&
    // The format only, not the list of src/config/payout-currencies.ts: a currency removed from it
    // later must not make saved settings unreadable.
    typeof settings.payoutCurrency === "string" &&
    CURRENCY_CODE.test(settings.payoutCurrency) &&
    typeof settings.displayCurrency === "string" &&
    CURRENCY_CODE.test(settings.displayCurrency) &&
    (settings.detectedCountry === null ||
      (typeof settings.detectedCountry === "string" &&
        COUNTRY_CODE.test(settings.detectedCountry))) &&
    (settings.payoutAccountId === null || isMtpId(settings.payoutAccountId)) &&
    // Never a bank account's details: Mt Pelerin's, read there.
    !("bank" in settings) &&
    typeof settings.onchainPayments === "boolean" &&
    parseRelayList(settings.relays) !== null &&
    parseOptionalImageRef(settings.logo) !== undefined &&
    (settings.businessAddress === null || isBusinessAddress(settings.businessAddress)) &&
    isBusinessNumber(settings.companyNumber) &&
    isBusinessNumber(settings.vatNumber) &&
    isOwnerDevices(settings.devices) &&
    (settings.vatRate === null ||
      (Number.isSafeInteger(settings.vatRate) &&
        (settings.vatRate as number) >= 0 &&
        (settings.vatRate as number) <= MAX_VAT_BASIS_POINTS)) &&
    // An integer of the tolerance's bounds: anything else (toleranceOf reads it as 0) is refused.
    typeof settings.onchainTolerance === "number" &&
    toleranceOf(settings.onchainTolerance) === settings.onchainTolerance &&
    isFormerAddressMetadata(settings.formerAddressMetadata) &&
    (settings.bitcoinNode === null || parseBitcoinNode(settings.bitcoinNode) !== null) &&
    typeof settings.productLookup === "boolean" &&
    isUnixSeconds(settings.splitSince) &&
    isLegacyTransfers(settings.legacyTransfers) &&
    isRecoveryCheck(settings.recoveryCheck);
  return valid && isConsistent(value as MerchantSettings);
}

/** Format of the settings this version of the app writes. */
const CURRENT_VERSION = 18;

/**
 * A RecoveryCheck: its times each null or Unix seconds, `aboveThresholdAt` Unix seconds or absent,
 * nothing else in it.
 */
function isRecoveryCheck(value: unknown): value is RecoveryCheck {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const check = value as Record<string, unknown>;
  const seen = "aboveThresholdAt" in check;
  return (
    Object.keys(check).length === (seen ? 3 : 2) &&
    (check.verifiedAt === null || isUnixSeconds(check.verifiedAt)) &&
    (check.dueSince === null || isUnixSeconds(check.dueSince)) &&
    (!seen || isUnixSeconds(check.aboveThresholdAt))
  );
}

/**
 * Settings of format 12 as format 13: format 13 only said the bank account's holder otherwise, and
 * format 18 keeps no bank details (fromFormat17). Anything else is left as it is, for the
 * validator to judge.
 */
function fromFormat12(value: Record<string, unknown>): Record<string, unknown> {
  return { ...value, version: 13 };
}

/**
 * Settings of format 13 as format 14: the same, without the business's address nor its numbers
 * (none typed then). Any of them in format 13 is none it ever wrote: refused; anything else, the
 * validator judges.
 */
function fromFormat13(value: Record<string, unknown>): Record<string, unknown> {
  return "businessAddress" in value || "companyNumber" in value || "vatNumber" in value
    ? { ...value, version: 14, businessAddress: undefined }
    : { ...value, version: 14, businessAddress: null, companyNumber: "", vatNumber: "" };
}

/**
 * Settings of format 14 as format 15: the same, with mempool.space as the explorer and the product
 * lookup on, as the app did then. Either of them in format 14 is none it ever wrote: refused;
 * anything else, the validator judges.
 */
function fromFormat14(value: Record<string, unknown>): Record<string, unknown> {
  return "bitcoinNode" in value || "productLookup" in value
    ? { ...value, version: 15, productLookup: undefined }
    : { ...value, version: 15, bitcoinNode: null, productLookup: true };
}

/**
 * Settings of format 15 as format 16: the same, the split counted from their last change (no
 * change of the share came after it) and no transfer of the v2 wallet's coins known. Either of
 * them in format 15 is none it ever wrote: refused; anything else, the validator judges.
 */
function fromFormat15(value: Record<string, unknown>): Record<string, unknown> {
  return "splitSince" in value || "legacyTransfers" in value
    ? { ...value, version: 16, splitSince: undefined }
    : { ...value, version: 16, splitSince: value.updatedAt, legacyTransfers: [] };
}

/**
 * Settings of format 16 as format 17: the same, no check of the recovery phrase done nor due. A
 * check in format 16 is none it ever wrote: refused; anything else, the validator judges.
 */
function fromFormat16(value: Record<string, unknown>): Record<string, unknown> {
  return "recoveryCheck" in value
    ? { ...value, version: 17, recoveryCheck: undefined }
    : { ...value, version: 17, recoveryCheck: { ...NO_RECOVERY_CHECK } };
}

/**
 * Settings of format 17 as format 18: the same without the bank details (`bank`: Mt Pelerin's
 * data is read from its API, never kept), and no Mt Pelerin account
 * chosen yet (`payoutAccountId`: the account is chosen again). An account in format 17 is none it
 * ever wrote: refused; anything else, the validator judges.
 */
function fromFormat17(value: Record<string, unknown>): Record<string, unknown> {
  const { bank: _bank, ...rest } = value;
  return "payoutAccountId" in value
    ? { ...rest, version: 18, payoutAccountId: undefined }
    : { ...rest, version: 18, payoutAccountId: null };
}

/**
 * Settings saved by a newer version of the app, in a format this one cannot read (staging gets
 * OTA updates, which can be rolled back): never replace them, they would be lost.
 */
export class NewerSettingsFormatError extends Error {
  constructor() {
    super("Merchant settings of a newer format");
    this.name = "NewerSettingsFormatError";
  }
}

/**
 * Settings read back (device, backup). Throws NewerSettingsFormatError for a format newer than this
 * app's; formats 17 to 12 are converted (fromFormat17 to fromFormat12); null when the value is not
 * valid settings, those of a format before 12 included
 * (none is converted: no data of before is kept).
 */
export function parseMerchantSettings(value: unknown): MerchantSettings | null {
  const version = (value as { version?: unknown } | null)?.version;
  if (typeof version === "number" && version > CURRENT_VERSION) {
    throw new NewerSettingsFormatError();
  }
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  // Each format after `version`, in order, up to this app's.
  const steps: [number, (value: Record<string, unknown>) => Record<string, unknown>][] = [
    [12, fromFormat12],
    [13, fromFormat13],
    [14, fromFormat14],
    [15, fromFormat15],
    [16, fromFormat16],
    [17, fromFormat17]
  ];
  const current =
    typeof version === "number" && version >= 12 && version < CURRENT_VERSION
      ? steps.reduce(
          (converted, [from, step]) => (version <= from ? step(converted) : converted),
          record
        )
      : value;
  return isMerchantSettings(current) ? current : null;
}

/** Unix time in seconds, the unit of `updatedAt` (and of Nostr's `created_at`). */
export function unixSeconds(now: number = Date.now()): number {
  return Math.floor(now / 1000);
}

/**
 * The settings changed by `patch`, with an `updatedAt` after the previous one even when the
 * clock is behind it or two changes fall in the same second: the newest copy must always win.
 * A change of the share kept in bitcoin starts the split's count again (`splitSince`), at the
 * time of the change (`now`), unless the patch says since when itself.
 */
export function touchSettings(
  previous: MerchantSettings,
  patch: SettingsPatch,
  now: number = Date.now()
): MerchantSettings {
  const shareChanged =
    patch.bitcoinPercent !== undefined && patch.bitcoinPercent !== previous.bitcoinPercent;
  return {
    ...previous,
    ...patch,
    ...(shareChanged && patch.splitSince === undefined ? { splitSince: unixSeconds(now) } : {}),
    updatedAt: Math.max(unixSeconds(now), previous.updatedAt + 1)
  };
}

/** The newest of `copies` by `updatedAt`, the first one on a tie; null when there is none. */
export function newestSettings(...copies: (MerchantSettings | null)[]): MerchantSettings | null {
  return copies.reduce<MerchantSettings | null>(
    (best, copy) => (copy && (!best || copy.updatedAt > best.updatedAt) ? copy : best),
    null
  );
}

/**
 * The state of an account just created: nothing chosen yet, 100 % bitcoin, the payout currency
 * and country detected at creation (src/features/account/detection.ts), on the device's relays.
 */
export function initialSettings(
  {
    businessName,
    payoutCurrency,
    detectedCountry,
    relays
  }: Pick<MerchantSettings, "businessName" | "payoutCurrency" | "detectedCountry"> & {
    relays: readonly string[];
  },
  now: number = Date.now()
): MerchantSettings {
  return {
    version: 18,
    updatedAt: unixSeconds(now),
    signUp: "usage",
    businessName,
    usage: null,
    bitcoinPercent: 100,
    payoutCurrency,
    displayCurrency: payoutCurrency,
    detectedCountry,
    payoutAccountId: null,
    onchainPayments: true,
    relays: [...relays],
    logo: null,
    businessAddress: null,
    companyNumber: "",
    vatNumber: "",
    devices: [],
    vatRate: null,
    onchainTolerance: 0,
    formerAddressMetadata: [],
    bitcoinNode: null,
    productLookup: true,
    splitSince: unixSeconds(now),
    legacyTransfers: [],
    recoveryCheck: { ...NO_RECOVERY_CHECK }
  };
}

/**
 * The wallet id (see getWalletId) as it keys the stored settings, a file name on native and a
 * `localStorage` key on the web: hex digits only, so that it can never leave the settings
 * directory, and lowercase.
 */
export function settingsWalletId(walletId: string): string {
  if (!/^[0-9a-f]{2,130}$/i.test(walletId)) throw new Error("Invalid wallet id");
  return walletId.toLowerCase();
}

/**
 * Business name generated at sign-up, e.g. "Merchant 7F3A": `word` in
 * the app language, then the last 4 hex digits of the wallet id. They are stable for the account
 * and tell two accounts apart; the first digits would not (the id is a compressed public key,
 * which starts with 02 or 03).
 */
export function businessName(word: string, walletId: string): string {
  return `${word} ${walletId.slice(-4).toUpperCase()}`;
}
