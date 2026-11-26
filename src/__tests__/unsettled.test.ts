import { bytesToHex } from "@noble/hashes/utils.js";

import { DEFAULT_RELAYS } from "@/config/relays";
import { closeAccount, getAccountBackupKey, getAccountSettings } from "@/features/account/session";
import { linkHolders, publishOwnerFinal } from "@/features/payment-link/owner-finals";
import { followRelaysMove } from "@/features/relays/moved-notice";
import { recordSale, recordSaleVerdict } from "@/features/team/member";
import {
  ownerDeviceKeys,
  ownerDevicesShared,
  registerOwnerDevice,
  resetOwnerDeviceCache
} from "@/features/team/owner-device";
import {
  MAX_SALE_INVOICE_SECONDS,
  SALE_CLOCK_TOLERANCE_SECONDS,
  findUnsettled
} from "@/features/team/unsettled";
import { EXPIRY_GRACE_SECONDS, INVOICE_EXPIRY_SECONDS } from "@/features/terminal/invoice";
import { FINAL_DELAY_SECONDS, type Settlement } from "@/features/terminal/useSale";
import { encodeWalletSecret } from "@/lib/breez/secret";
import { walletSecret } from "@/lib/breez/seed";
import { decodeBolt11 } from "@/lib/lightning/bolt11";
import type { Invoice } from "@/lib/lightning/lnurl";
import { randomNostrKeys } from "@/lib/nostr/keys";
import { publishToRelays } from "@/lib/nostr/pool";
import {
  createPaymentLink,
  finalLinkEvent,
  publishLinkEvent,
  publishPaymentLink
} from "@/lib/payment-link/link";
import type { PaymentLinkPayload } from "@/lib/payment-link/payload";
import { savePendingLink } from "@/lib/payment-link/pending";
import { currentRelays } from "@/lib/relays/current";
import { fetchMoved, movedEvent } from "@/lib/relays/moved";
import type { TeamMember } from "@/lib/team/roster";
import {
  deriveLinkOwner,
  deriveMemberKeys,
  deriveRegistryKey,
  deriveRegistryReader,
  deriveTeamKeys,
  memberSecret,
  ownerDevicesSecret
} from "@/lib/team/keys";
import {
  fetchSales,
  linkEvent,
  publishMemberRecord,
  saleEvent,
  type MemberSale
} from "@/lib/team/member-records";
import type { SavedTerminalProfile } from "@/lib/terminal/model";

import { TEST_WALLET_ID, openTestAccount, testSeed } from "../../jest/account";
import { taprootAddress } from "../../jest/bitcoin";
import { makeInvoice, metadataHash, preimagePair } from "../../jest/lightning";
import type * as RelaysFake from "../../jest/nostr-relays";

// Mainnet: invoices of "bc" (the app config has no network under Jest).
jest.mock("../lib/breez/config", () => ({
  ...jest.requireActual("../lib/breez/config"),
  getBreezNetwork: () => "mainnet"
}));

const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

// A BIP-39 test mnemonic (all-zero entropy), never a real wallet's.
const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const team = deriveTeamKeys(encodeWalletSecret({ mnemonic: MNEMONIC }));
const member: TeamMember = {
  id: "0123456789abcdef0123456789abcdef",
  name: "Alice",
  role: "employee",
  invitedAt: 1789990000
};
const keys = deriveMemberKeys(memberSecret(team, member.id));
const holders = linkHolders(team, [member], []);
const ADDRESS = "sattleme02c6047f94@breez.tips";
const METADATA = `[["text/plain","Fine Bakery"],["text/identifier","${ADDRESS}"]]`;
const ORIGIN = "https://web.example";
/** 13:10:30 UTC: the sale starts, its invoice ends at 13:20:30. */
const START = Date.UTC(2026, 9, 3, 13, 10, 30) / 1000;
const END = START + 600;
const FIAT = { minor: 2450, digits: 2, currency: "CHF" };

const payload: PaymentLinkPayload = {
  version: 3,
  businessName: "Fine Bakery",
  lightningAddress: ADDRESS,
  fiat: FIAT,
  note: "Table 4",
  onchainAddress: null,
  endsAt: END,
  registryKey: bytesToHex(deriveRegistryKey(team)),
  registryReader: deriveRegistryReader(team).publicKey,
  owner: deriveLinkOwner(team).publicKey
};

function invoice(n: number): Invoice {
  const { paymentHash } = preimagePair(n);
  const pr = makeInvoice({
    amountMsat: 49_000_000n,
    paymentHash,
    descriptionHash: metadataHash(METADATA),
    timestamp: START,
    expirySeconds: 600
  });
  return { pr, decoded: decodeBolt11(pr)!, verifyUrl: `https://breez.tips/verify/${paymentHash}` };
}

function sale(n: number, paidAt: number | null): MemberSale {
  const shown = invoice(n);
  return {
    version: 1,
    paymentHash: shown.decoded.paymentHash,
    sats: "49000",
    fiat: FIAT,
    note: "",
    verifyUrl: shown.verifyUrl,
    createdAt: START,
    expiresAt: END,
    paidAt,
    onchainAddress: null,
    onchainTag: null,
    sale: "e1".repeat(32)
  };
}

/** A link of Alice's sale, published, and her record of it. */
async function recordedLink(byte: number) {
  const link = createPaymentLink(payload, ORIGIN, START + 30, new Uint8Array(32).fill(byte));
  await publishPaymentLink(link);
  await publishMemberRecord(
    keys,
    linkEvent(keys, {
      version: 1,
      link: link.id,
      saleKey: bytesToHex(link.key),
      createdAt: START + 30,
      onchainTag: null,
      relays: [...DEFAULT_RELAYS],
      sealedKey: "A".repeat(200)
    })
  );
  return link;
}

beforeEach(() => {
  closeAccount();
  relays.resetRelays();
  resetOwnerDeviceCache();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("the sales not final yet", () => {
  it("count an invoice not paid until its end and its checks, none once paid", async () => {
    await publishMemberRecord(keys, saleEvent(keys, sale(1, null)));
    await expect(findUnsettled(team, holders, { thisDevice: false }, END - 60)).resolves.toEqual({
      invoices: 1,
      links: 0
    });
    // Its checks after its end: a payment may still be reported.
    await expect(
      findUnsettled(team, holders, { thisDevice: false }, END + EXPIRY_GRACE_SECONDS - 1)
    ).resolves.toEqual({ invoices: 1, links: 0 });
    await expect(
      findUnsettled(team, holders, { thisDevice: false }, END + EXPIRY_GRACE_SECONDS)
    ).resolves.toEqual({ invoices: 0, links: 0 });
    // Paid: final for a sale without a link.
    await publishMemberRecord(keys, saleEvent(keys, sale(1, START + 120)));
    await expect(findUnsettled(team, holders, { thisDevice: false }, END - 60)).resolves.toEqual({
      invoices: 0,
      links: 0
    });
  });

  it("count an hour shown with the address alone as an invoice", async () => {
    const alone = (paidAt: number | null): MemberSale => ({
      version: 1,
      paymentHash: null,
      verifyUrl: null,
      hour: START - (START % 3600),
      sats: "4900000",
      fiat: FIAT,
      note: "",
      createdAt: START,
      expiresAt: END,
      paidAt,
      onchainAddress: taprootAddress(1),
      onchainTag: null,
      sale: "e2".repeat(32)
    });
    await publishMemberRecord(keys, saleEvent(keys, alone(null)));
    await expect(findUnsettled(team, holders, { thisDevice: false }, END - 60)).resolves.toEqual({
      invoices: 1,
      links: 0
    });
    await publishMemberRecord(keys, saleEvent(keys, alone(START + 120)));
    await expect(findUnsettled(team, holders, { thisDevice: false }, END - 60)).resolves.toEqual({
      invoices: 0,
      links: 0
    });
  });

  it("count an invoice no longer than a point of sale's can last, whatever its record claims", async () => {
    // Whoever holds an employee's keys (its invitation opened before the employee) records an
    // invoice not paid that would end in ten years: it blocks a removal, a change of relays and the
    // account's deletion only for as long as a real invoice could last.
    const longest = MAX_SALE_INVOICE_SECONDS + SALE_CLOCK_TOLERANCE_SECONDS;
    await publishMemberRecord(
      keys,
      saleEvent(keys, { ...sale(1, null), expiresAt: START + 10 * 365 * 24 * 3600 })
    );
    const at = (now: number) => findUnsettled(team, holders, { thisDevice: false }, now);
    await expect(at(START + longest + EXPIRY_GRACE_SECONDS - 1)).resolves.toEqual({
      invoices: 1,
      links: 0
    });
    await expect(at(START + longest + EXPIRY_GRACE_SECONDS)).resolves.toEqual({
      invoices: 0,
      links: 0
    });
    // Nor one dated past this device's clock, which would otherwise count for the day it is read.
    await publishMemberRecord(
      keys,
      saleEvent(keys, {
        ...sale(2, null),
        createdAt: START + 20 * 3600,
        expiresAt: START + 21 * 3600
      })
    );
    await expect(at(START + longest + EXPIRY_GRACE_SECONDS)).resolves.toEqual({
      invoices: 0,
      links: 0
    });
    // Within the clocks' tolerance, it counts.
    await expect(at(START + 20 * 3600 - SALE_CLOCK_TOLERANCE_SECONDS)).resolves.toEqual({
      invoices: 1,
      links: 0
    });
  });

  it("count a payment link until its final version, the link's own or the owner's", async () => {
    const later = END + FINAL_DELAY_SECONDS + 24 * 3600;
    const own = await recordedLink(1);
    const owners = await recordedLink(2);
    await expect(findUnsettled(team, holders, { thisDevice: false }, later)).resolves.toEqual({
      invoices: 0,
      links: 2
    });
    // The device's own final version.
    await publishLinkEvent(
      finalLinkEvent(own, own.event.created_at, {
        status: "expired",
        received: "0",
        due: null,
        point: null,
        lightning: [],
        onchain: null,
        link: own.id
      }),
      own.secretKey
    );
    await expect(findUnsettled(team, holders, { thisDevice: false }, later)).resolves.toEqual({
      invoices: 0,
      links: 1
    });
    // The owner's.
    const expired: Settlement = {
      status: "expired",
      received: 0n,
      accepted: false,
      due: null,
      point: null,
      lightning: [],
      onchain: null,
      finalFrom: END + FINAL_DELAY_SECONDS
    };
    const sharedSale = { ...payload, final: null, registryKey: deriveRegistryKey(team) };
    await expect(
      publishOwnerFinal(
        team,
        {
          id: owners.id,
          saleKey: owners.key,
          sale: sharedSale as never,
          linkEvent: owners.event,
          onchainVerified: false,
          relays: DEFAULT_RELAYS,
          tolerance: 0
        },
        expired,
        later
      )
    ).resolves.toBe("published");
    await expect(findUnsettled(team, holders, { thisDevice: false }, later)).resolves.toEqual({
      invoices: 0,
      links: 0
    });
  });

  it("count a recorded link no relay holds yet: its device publishes it later", async () => {
    const link = createPaymentLink(payload, ORIGIN, START + 30, new Uint8Array(32).fill(3));
    await publishMemberRecord(
      keys,
      linkEvent(keys, {
        version: 1,
        link: link.id,
        saleKey: bytesToHex(link.key),
        createdAt: START + 30,
        onchainTag: null,
        relays: [...DEFAULT_RELAYS],
        sealedKey: "A".repeat(200)
      })
    );
    await expect(findUnsettled(team, holders, { thisDevice: false }, END)).resolves.toEqual({
      invoices: 0,
      links: 1
    });
  });

  it("count a recorded link no relay holds only while a point of sale's link may still be paid", async () => {
    // Whoever holds an employee's keys (its invitation opened before the employee) records a link
    // that never existed: it holds nothing back for longer than a link of the point of sale (the
    // only one recorded before it is published) may be paid.
    const longest = INVOICE_EXPIRY_SECONDS + FINAL_DELAY_SECONDS + SALE_CLOCK_TOLERANCE_SECONDS;
    await publishMemberRecord(
      keys,
      linkEvent(keys, {
        version: 1,
        link: "ab".repeat(32),
        saleKey: "cd".repeat(32),
        createdAt: START,
        onchainTag: null,
        relays: [...DEFAULT_RELAYS],
        sealedKey: "A".repeat(200)
      })
    );
    const at = (now: number) => findUnsettled(team, holders, { thisDevice: false }, now);
    await expect(at(START + longest - 1)).resolves.toEqual({ invoices: 0, links: 1 });
    await expect(at(START + longest)).resolves.toEqual({ invoices: 0, links: 0 });
    // Nor one dated past this device's clock.
    await publishMemberRecord(
      keys,
      linkEvent(keys, {
        version: 1,
        link: "ef".repeat(32),
        saleKey: "cd".repeat(32),
        createdAt: START + 300 * 24 * 3600,
        onchainTag: null,
        relays: [...DEFAULT_RELAYS],
        sealedKey: "A".repeat(200)
      })
    );
    await expect(at(START + longest)).resolves.toEqual({ invoices: 0, links: 0 });
  });

  it("leave out a recorded link none of whose relays answer, outside the account's relays", async () => {
    // Its relays never answer (none exists): no payer can open it either.
    relays.unreachable.add("wss://nowhere.example");
    await publishMemberRecord(
      keys,
      linkEvent(keys, {
        version: 1,
        link: "ab".repeat(32),
        saleKey: "cd".repeat(32),
        createdAt: START + 30,
        onchainTag: null,
        relays: ["wss://nowhere.example"],
        sealedKey: "A".repeat(200)
      })
    );
    await expect(findUnsettled(team, holders, { thisDevice: false }, END)).resolves.toEqual({
      invoices: 0,
      links: 0
    });
  });

  it("cannot tell while a recorded link's relays among the account's do not answer", async () => {
    // One of the account's relays out of reach a moment, the others answering: never taken for a
    // link nobody can open.
    const [down] = DEFAULT_RELAYS;
    await publishMemberRecord(
      keys,
      linkEvent(keys, {
        version: 1,
        link: "ab".repeat(32),
        saleKey: "cd".repeat(32),
        createdAt: START + 30,
        onchainTag: null,
        relays: [down!],
        sealedKey: "A".repeat(200)
      })
    );
    relays.unreachable.add(down!);
    await expect(findUnsettled(team, holders, { thisDevice: false }, END)).resolves.toBeNull();
  });

  it("count a removed employee's records made before its removal only, as long as a point of sale's", async () => {
    // Alice removed 70 s after her link (and its grace): what her keys sign later is not hers.
    const removed = [{ ...holders[0]!, until: START + 100 }];
    const at = (now: number) => findUnsettled(team, removed, { thisDevice: false }, now);
    await recordedLink(1);
    // Her link counts while a link of the point of sale may still be paid, final or not.
    const longest = INVOICE_EXPIRY_SECONDS + FINAL_DELAY_SECONDS + SALE_CLOCK_TOLERANCE_SECONDS;
    await expect(at(START + 30 + longest - 1)).resolves.toEqual({ invoices: 0, links: 1 });
    await expect(at(START + 30 + longest)).resolves.toEqual({ invoices: 0, links: 0 });
    // A sale and a link recorded after her removal never count.
    await publishMemberRecord(keys, saleEvent(keys, { ...sale(2, null), createdAt: START + 200 }));
    await publishMemberRecord(
      keys,
      linkEvent(keys, {
        version: 1,
        link: "ab".repeat(32),
        saleKey: "cd".repeat(32),
        createdAt: START + 200,
        onchainTag: null,
        relays: [...DEFAULT_RELAYS],
        sealedKey: "A".repeat(200)
      })
    );
    await expect(at(START + 300)).resolves.toEqual({ invoices: 0, links: 1 });
  });

  it("count this device's pending links when asked", async () => {
    const link = createPaymentLink(payload, ORIGIN, START + 30, new Uint8Array(32).fill(4));
    await publishPaymentLink(link);
    await savePendingLink(link);
    await expect(findUnsettled(team, [], { thisDevice: true }, END)).resolves.toEqual({
      invoices: 0,
      links: 1
    });
    await expect(findUnsettled(team, [], { thisDevice: false }, END)).resolves.toEqual({
      invoices: 0,
      links: 0
    });
  });

  it("cannot tell while the relays do not answer", async () => {
    for (const relay of DEFAULT_RELAYS) relays.unreachable.add(relay);
    await expect(findUnsettled(team, holders, { thisDevice: false }, END)).resolves.toBeNull();
  });
});

describe("the owner's devices", () => {
  /** The owner's device: its account open (done), its point of sale prepared. */
  async function ownerDevice(): Promise<SavedTerminalProfile> {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    return {
      version: 2,
      walletId: TEST_WALLET_ID,
      backupKey: getAccountBackupKey()!,
      lightningAddress: ADDRESS,
      businessName: getAccountSettings()?.businessName ?? "",
      currency: "CHF"
    };
  }

  it("are added to the account once, and publish their sales for the owner", async () => {
    const profile = await ownerDevice();
    await registerOwnerDevice();
    await registerOwnerDevice();
    const settings = getAccountSettings()!;
    expect(settings.devices).toEqual([{ id: expect.any(String), addedAt: expect.any(Number) }]);
    const deviceKeys = (await ownerDeviceKeys(TEST_WALLET_ID))!;
    expect(deviceKeys).not.toBeNull();
    // Another account's device signs nothing for this one.
    await expect(ownerDeviceKeys("03".padEnd(66, "a"))).resolves.toBeNull();
    // It keeps the secret the owner's devices share, as every other derives it from the passkey.
    await expect(ownerDevicesShared(TEST_WALLET_ID)).resolves.toEqual(
      ownerDevicesSecret(deriveTeamKeys(walletSecret(testSeed())))
    );
    await expect(ownerDevicesShared("03".padEnd(66, "a"))).resolves.toBeNull();

    // In till mode too: the keys stay on the device.
    closeAccount();
    const { version: _version, onchainTag: _tag, ...shown } = sale(5, null);
    recordSale(profile, shown);
    await eventually(async () => {
      await expect(fetchSales(deviceKeys, 0)).resolves.toHaveLength(1);
    });
    // The owner reads it from any of its devices: not final until its end and its checks.
    const owner = deriveTeamKeys(walletSecret(testSeed()));
    const accountHolders = linkHolders(owner, [], settings.devices);
    await expect(
      findUnsettled(owner, accountHolders, { thisDevice: false }, END - 60)
    ).resolves.toEqual({ invoices: 1, links: 0 });
  });

  it("move to the account's new relays from a notice its backup key signed, never another's", async () => {
    await ownerDevice();
    await registerOwnerDevice();
    const backupKey = getAccountBackupKey()!;
    closeAccount();
    const shared = (await ownerDevicesShared(TEST_WALLET_ID))!;
    // A notice someone else signed at the same address (even knowing the shared secret): never
    // followed.
    const forger = randomNostrKeys();
    await publishToRelays(movedEvent(forger.secretKey, shared, ["wss://pirate.example"], END), {
      relays: DEFAULT_RELAYS,
      channel: "account",
      timeoutMs: 1000,
      authKey: forger.secretKey
    });
    await expect(fetchMoved(backupKey, shared, DEFAULT_RELAYS)).resolves.toEqual({
      status: "notFound"
    });
    await followRelaysMove(TEST_WALLET_ID, backupKey);
    expect(currentRelays()).toEqual(DEFAULT_RELAYS);
  });
});

/** Until `check` passes: background publications take a few turns of the event loop. */
describe("with relays that stay connected without answering", () => {
  it("cannot tell from fewer than a majority's answers: a sale or a link may be on the others", async () => {
    for (const relay of DEFAULT_RELAYS.slice(2)) relays.unreachable.add(relay);
    await expect(findUnsettled(team, holders, { thisDevice: false }, END)).resolves.toBeNull();
    await expect(fetchSales(keys, 0)).resolves.toBeNull();
  });

  it("publish a sale shown again until a majority holds it, the owner then counting it", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    const profile: SavedTerminalProfile = {
      version: 2,
      walletId: TEST_WALLET_ID,
      backupKey: getAccountBackupKey()!,
      lightningAddress: ADDRESS,
      businessName: getAccountSettings()?.businessName ?? "",
      currency: "CHF"
    };
    await registerOwnerDevice();
    const deviceKeys = (await ownerDeviceKeys(TEST_WALLET_ID))!;
    // Two relays of five take it: no majority, published again later.
    for (const relay of DEFAULT_RELAYS.slice(2)) relays.unreachable.add(relay);
    jest.useFakeTimers({ now: Date.now(), doNotFake: ["queueMicrotask", "nextTick"] });
    try {
      const { version: _version, onchainTag: _tag, ...shown } = sale(5, null);
      recordSale(profile, shown);
      await jest.advanceTimersByTimeAsync(1000);
      const ofDevice = (relay: string) =>
        (relays.stored.get(relay) ?? []).some(
          (event) => event.pubkey === deviceKeys.nostr.publicKey
        );
      expect(DEFAULT_RELAYS.map(ofDevice)).toEqual([true, true, false, false, false]);
      relays.unreachable.clear();
      // Its next try, 30 s later: on every relay.
      await jest.advanceTimersByTimeAsync(30_000);
      expect(DEFAULT_RELAYS.map(ofDevice)).toEqual(DEFAULT_RELAYS.map(() => true));
    } finally {
      jest.useRealTimers();
    }
    await expect(fetchSales(deviceKeys, 0)).resolves.toHaveLength(1);
  });

  it("count the relays that hold a sale's verdict since as holding the sale: tried no more", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    const profile: SavedTerminalProfile = {
      version: 2,
      walletId: TEST_WALLET_ID,
      backupKey: getAccountBackupKey()!,
      lightningAddress: ADDRESS,
      businessName: getAccountSettings()?.businessName ?? "",
      currency: "CHF"
    };
    await registerOwnerDevice();
    const deviceKeys = (await ownerDeviceKeys(TEST_WALLET_ID))!;
    for (const relay of DEFAULT_RELAYS.slice(2)) relays.unreachable.add(relay);
    jest.useFakeTimers({ now: Date.now(), doNotFake: ["queueMicrotask", "nextTick"] });
    try {
      const { version: _version, onchainTag: _tag, ...shown } = sale(5, null);
      recordSale(profile, shown);
      await jest.advanceTimersByTimeAsync(1000);
      relays.unreachable.clear();
      // Paid meanwhile: its verdict, a newer record at its address, on every relay.
      const { version: _paidVersion, onchainTag: _paidTag, ...paid } = sale(5, START + 60);
      const verdict = recordSaleVerdict(profile, paid);
      await jest.advanceTimersByTimeAsync(1000);
      await expect(verdict).resolves.toBe("published");
      // Its next try, 30 s later: every relay holds newer, the sale is held. Then no other try.
      await jest.advanceTimersByTimeAsync(13 * 60_000);
      const tries = relays.calls.filter(
        ({ operation, event }) =>
          operation === "publish" &&
          event?.pubkey === deviceKeys.nostr.publicKey &&
          event.created_at === START
      );
      expect(tries).toHaveLength(2 * DEFAULT_RELAYS.length);
    } finally {
      jest.useRealTimers();
    }
    await expect(fetchSales(deviceKeys, 0)).resolves.toEqual([
      expect.objectContaining({ paidAt: START + 60 })
    ]);
  });
});

async function eventually(check: () => Promise<void>): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await check();
      return;
    } catch (error) {
      if (attempt >= 200) throw error;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
}
