import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import { getAccountTeamKeys, getAccountWalletId, closeAccount } from "@/features/account/session";
import {
  deviceEpochSettled,
  holdOwnerEpochs,
  noteOwnerEpoch,
  ownerEpoch,
  ownerEpochSettled,
  resetExportEpochs
} from "@/features/team/export-epochs";
import { invoiceEvent, openInvoiceRecord, INVOICE_VERSION } from "@/lib/invoice/record";
import { nip44Decrypt } from "@/lib/nostr/nip44";
import { EPOCH_ENVELOPE_VERSION, EPOCH_PART_BYTES, openRecord } from "@/lib/nostr/record";
import { resetEpochHolders } from "@/lib/nostr/epochs";
import {
  MAX_PART_BYTES,
  monthPartEvent,
  monthParts,
  parseMonthPart,
  type ArchivedSale
} from "@/lib/registry/archive";
import { exportEpochKey, exportEpochSeed, raiseExportEpoch } from "@/lib/team/export-epoch";
import {
  deriveArchiveKeys,
  deriveInvoiceKeys,
  deriveMemberKeys,
  deriveTeamKeys,
  deriveWalletSendKeys,
  ownerDeviceSecret,
  ownerDevicesSecret
} from "@/lib/team/keys";
import { saleEvent } from "@/lib/team/member-records";
import { walletSendEvent, type WalletSend } from "@/lib/wallet-sends/record";
import { currentRelays } from "@/lib/relays/current";

import { openMerchantAccount } from "../../jest/account";
import { resetRelays, unreachable } from "../../jest/nostr-relays";

const team = deriveTeamKeys(new Uint8Array(32).fill(5));
const shared = ownerDevicesSecret(team);
const ACCOUNT = "02" + "ab".repeat(32);
const NOW = 1790000000;
const DEVICE = "0f".repeat(16);

/** What a record's content says outside, with its own key: its value, or an envelope. */
function outside(content: string, key: Uint8Array): { version: number; epoch?: number } {
  return (JSON.parse(nip44Decrypt(content, key).trim()) as { v: { version: number } }).v;
}

function sendOf(payment: string): WalletSend {
  return {
    payment,
    at: NOW,
    sats: 1000n,
    feeSats: 2n,
    network: "lightning" as const,
    reference: payment,
    text: null
  };
}

beforeEach(() => resetRelays());

/** Holds `account` again once every holder was forgotten (resetEpochHolders). */
function holdOwnerEpochsAfterReset(account: string, secret: Uint8Array) {
  resetExportEpochs();
  holdOwnerEpochs(account, secret, []);
}

describe("the owner's records at an export epoch", () => {
  it("are sealed as before at epoch 0", () => {
    holdOwnerEpochs(ACCOUNT, shared, [deriveWalletSendKeys(team).encryptionKey]);
    const keys = deriveWalletSendKeys(team);
    const event = walletSendEvent(keys, sendOf("p1"));
    expect(outside(event.content, keys.encryptionKey).version).toBe(1);
  });

  it("are sealed at the epoch known for the families held, opened by the holder only", () => {
    const keys = deriveWalletSendKeys(team);
    holdOwnerEpochs(ACCOUNT, shared, [keys.encryptionKey]);
    noteOwnerEpoch(ACCOUNT, 2);
    expect(ownerEpoch(ACCOUNT)).toEqual({ epoch: 2, read: false });
    const event = walletSendEvent(keys, sendOf("p2"));
    expect(outside(event.content, keys.encryptionKey)).toMatchObject({
      version: EPOCH_ENVELOPE_VERSION,
      epoch: 2
    });
    // A family this device does not write (an assistant's invoices): as before.
    const invoices = deriveInvoiceKeys(team);
    const entry = { version: INVOICE_VERSION, id: "ab".repeat(16), removed: true, updatedAt: NOW };
    const invoice = invoiceEvent(invoices, entry as never);
    expect(outside(invoice.content, invoices.encryptionKey).version).toBe(INVOICE_VERSION);
    // Without the holder: a record of a newer format, as an app before epochs reads it.
    const opened = openRecord(event, {
      type: "wallet-send",
      encryptionKey: keys.encryptionKey,
      address: () => true,
      parse: (value) => value
    });
    expect(opened?.status).toBe("ok");
    resetEpochHolders();
    expect(
      openRecord(event, {
        type: "wallet-send",
        encryptionKey: keys.encryptionKey,
        address: () => true,
        parse: (value) => value
      })?.status
    ).toBe("newer");
    // With the key of its epoch alone, as a grant written then gives it.
    expect(
      openRecord(event, {
        type: "wallet-send",
        encryptionKey: keys.encryptionKey,
        address: () => true,
        parse: (value) => value,
        epochKey: (epoch) => exportEpochKey(exportEpochSeed(shared, epoch), keys.encryptionKey)
      })?.status
    ).toBe("ok");
  });

  it("opens an invoice of an epoch for the owner, of a newer format for an older app", () => {
    const keys = deriveInvoiceKeys(team);
    holdOwnerEpochs(ACCOUNT, shared, [keys.encryptionKey]);
    noteOwnerEpoch(ACCOUNT, 1);
    const entry = { version: INVOICE_VERSION, id: "cd".repeat(16), removed: true, updatedAt: NOW };
    const event = invoiceEvent(keys, entry as never);
    expect(openInvoiceRecord(keys, event)).toMatchObject({ status: "ok", value: entry });
    resetEpochHolders();
    expect(openInvoiceRecord(keys, event)?.status).toBe("newer");
  });

  it("holds two accounts at once, and reads another account's epoch as a newer format", () => {
    const other = deriveTeamKeys(new Uint8Array(32).fill(6));
    const OTHER = "02" + "cd".repeat(32);
    const keys = deriveWalletSendKeys(team);
    holdOwnerEpochs(ACCOUNT, shared, [keys.encryptionKey]);
    holdOwnerEpochs(OTHER, ownerDevicesSecret(other), []);
    noteOwnerEpoch(ACCOUNT, 2);
    noteOwnerEpoch(OTHER, 5);
    expect(ownerEpoch(ACCOUNT)?.epoch).toBe(2);
    const event = walletSendEvent(keys, sendOf("p4"));
    const open = () =>
      openRecord(event, {
        type: "wallet-send",
        encryptionKey: keys.encryptionKey,
        address: () => true,
        parse: (value) => value
      })?.status;
    expect(open()).toBe("ok");
    // Only the other account held: its keys do not open it, never taken for invalid.
    resetEpochHolders();
    holdOwnerEpochsAfterReset(OTHER, ownerDevicesSecret(other));
    expect(open()).toBe("newer");
  });

  it("never lowers the epoch known", () => {
    holdOwnerEpochs(ACCOUNT, shared, []);
    noteOwnerEpoch(ACCOUNT, 3);
    noteOwnerEpoch(ACCOUNT, 1);
    noteOwnerEpoch("02" + "cd".repeat(32), 9);
    expect(ownerEpoch(ACCOUNT)?.epoch).toBe(3);
    expect(ownerEpoch("02" + "cd".repeat(32))).toBeNull();
  });
});

describe("a month's copy at an export epoch", () => {
  const keys = deriveArchiveKeys(team);
  const FIAT = { minor: 2450, digits: 2, currency: "CHF" };
  const many: ArchivedSale[] = Array.from({ length: 900 }, (_, i) => ({
    hash: bytesToHex(sha256(utf8ToBytes(`payment ${i}`))),
    sale: "ab".repeat(32),
    fiat: FIAT,
    note: "x".repeat(60),
    by: { role: "owner" }
  }));

  it("is cut in parts that stay under 64 kB sealed twice", () => {
    holdOwnerEpochs(ACCOUNT, shared, [keys.encryptionKey]);
    noteOwnerEpoch(ACCOUNT, MAX_SEED_TEST_EPOCH);
    const parts = monthParts("2026-10", many, [], [], EPOCH_PART_BYTES);
    expect(parts.length).toBeGreaterThan(2);
    for (const part of parts) {
      const event = monthPartEvent(keys, part, NOW);
      expect(utf8ToBytes(JSON.stringify(event)).length).toBeLessThan(60_000);
      expect(outside(event.content, keys.encryptionKey).version).toBe(EPOCH_ENVELOPE_VERSION);
    }
  });

  it("signs a part cut before epochs again as it was sealed, too long to seal twice", () => {
    holdOwnerEpochs(ACCOUNT, shared, [keys.encryptionKey]);
    noteOwnerEpoch(ACCOUNT, 1);
    const [first] = monthParts("2026-10", many, [], [], MAX_PART_BYTES);
    const event = monthPartEvent(keys, first!, NOW);
    expect(utf8ToBytes(JSON.stringify(event)).length).toBeLessThan(65_536);
    const value = outside(event.content, keys.encryptionKey);
    expect(value.version).not.toBe(EPOCH_ENVELOPE_VERSION);
    expect(parseMonthPart(value)).not.toBeNull();
  });
});

/** An epoch whose seed hashes down from far: the seeds' cost and the parts' size alike. */
const MAX_SEED_TEST_EPOCH = 7;

describe("the epoch of the open account", () => {
  afterEach(() => closeAccount());

  it("is read from the account's relays before its records are sealed", async () => {
    await openMerchantAccount();
    const open = getAccountTeamKeys()!;
    const walletId = getAccountWalletId()!;
    await ownerEpochSettled();
    expect(ownerEpoch(walletId)).toEqual({ epoch: 0, read: true });
    expect((await raiseExportEpoch(ownerDevicesSecret(open), currentRelays(), NOW)).epoch).toBe(1);
    // Read less than OWNER_EPOCH_MAX_AGE_MS ago: not read again.
    await ownerEpochSettled();
    expect(ownerEpoch(walletId)?.epoch).toBe(0);
    noteOwnerEpoch(walletId, 1);
    const keys = deriveWalletSendKeys(open);
    expect(outside(walletSendEvent(keys, sendOf("p3")).content, keys.encryptionKey)).toMatchObject({
      version: EPOCH_ENVELOPE_VERSION,
      epoch: 1
    });
  });

  it("is held from the account's opening: its records of any epoch open before it is read", async () => {
    await openMerchantAccount();
    const open = getAccountTeamKeys()!;
    const walletId = getAccountWalletId()!;
    expect(ownerEpoch(walletId)).toEqual({ epoch: 0, read: false });
    const keys = deriveInvoiceKeys(open);
    const entry = { version: INVOICE_VERSION, id: "ef".repeat(16), removed: true, updatedAt: NOW };
    // Sealed at epoch 3 (another of the owner's devices raised it): opened on this one.
    noteOwnerEpoch(walletId, 3);
    const sealed = invoiceEvent(keys, entry as never);
    expect(outside(sealed.content, keys.encryptionKey)).toMatchObject({ epoch: 3 });
    expect(openInvoiceRecord(keys, sealed)).toMatchObject({ status: "ok", value: entry });
  });

  it("keeps what it knew when the relays do not answer", async () => {
    await openMerchantAccount();
    const walletId = getAccountWalletId()!;
    for (const relay of currentRelays()) unreachable.add(relay);
    await ownerEpochSettled();
    expect(ownerEpoch(walletId)).toEqual({ epoch: 0, read: false });
  });
});

describe("a device's own records in till mode", () => {
  it("are sealed at the epoch read from the device's relays", async () => {
    const keys = deriveMemberKeys(ownerDeviceSecret(team, DEVICE));
    await raiseExportEpoch(shared, currentRelays(), NOW);
    await raiseExportEpoch(shared, currentRelays(), NOW);
    await deviceEpochSettled(ACCOUNT, shared, [keys.records.encryptionKey], null);
    expect(ownerEpoch(ACCOUNT)).toEqual({ epoch: 2, read: true });
    const sale = saleEvent(keys, {
      version: 1,
      id: "aa".repeat(16),
      invoice: null,
      onchainAddress: null
    } as never);
    expect(outside(sale.content, keys.records.encryptionKey)).toMatchObject({ epoch: 2 });
  });
});
