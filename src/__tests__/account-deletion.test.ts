import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { Platform } from "react-native";

import { DEFAULT_CARD_RELAY_HOST } from "@/config/card";
import { TEAM_TIMEOUT_MS } from "@/lib/team/shared";
import { DEFAULT_RELAYS } from "@/config/relays";
import {
  closeAccount,
  getAccountBackupKey,
  getAccountSettings,
  getAccountTeamKeys,
  openAccount,
  subscribeAccountDeletion,
  updateAccount,
  whenAccountSynced
} from "@/features/account/session";
import { cardLightningAddress, leaseCardWallet } from "@/features/card/card-wallet";
import {
  knownCardState,
  recordCardState,
  resetCardStates,
  withCardAccess
} from "@/features/card/states";
import { addArticle, refreshCatalogEpoch } from "@/features/catalog/catalog";
import { saveDraft } from "@/features/invoices/invoices";
import {
  DeletionError,
  DELETION_WALLET_TIMEOUT_MS,
  checkAccountDeletion,
  deleteAccount,
  type DeletionStep
} from "@/features/settings/account-deletion";
import { changeLogo } from "@/features/settings/account-settings";
import {
  checkDeletedElsewhere,
  getDeletedAccountNotice
} from "@/features/settings/deleted-elsewhere";
import {
  getRemovalNotice,
  joinTeam,
  previewInvite,
  resetMembershipCache,
  syncMembership
} from "@/features/team/member";
import {
  createAssistant,
  createIntegration,
  inviteEmployee,
  removeEmployee
} from "@/features/team/owner";
import { getTerminalProfile, resetTerminalProfileCache } from "@/features/terminal/profile-cache";
import { accountDeletionOf, fetchAccountDeletion } from "@/lib/backup/deletion";
import { deriveBackupKeys } from "@/lib/backup/keys";
import { backupEvent } from "@/lib/backup/settings-backup";
import { walletSecret } from "@/lib/breez/seed";
import { disconnectWallet } from "@/lib/breez/wallet";
import {
  CARD_STATE_VERSION,
  cardRecordAddress,
  cardStateValue,
  deriveCardRecordKeys,
  type CardState
} from "@/lib/card/card-record";
import { loadDeviceKey } from "@/lib/card/device-key";
import { deriveHistoryRecordKeys } from "@/lib/card/history-records";
import { cardIdOf, channelSecretOf, deriveCardRoot } from "@/lib/card/keys";
import { deriveMonthPartKeys } from "@/lib/card/history-months";
import { derivePayeeRecordKeys } from "@/lib/card/payee-records";
import { putChannel } from "@/lib/card/relay-client";
import { deriveAssistantKeys } from "@/lib/assistant/keys";
import { deriveIntegrationKeys } from "@/lib/integrations/keys";
import { sharedCounterEvent, sharedCounterKeys } from "@/lib/invoice/counter";
import { decodeBolt11 } from "@/lib/lightning/bolt11";
import type { Invoice } from "@/lib/lightning/lnurl";
import { createImage, imageAuthor, publishImageToMajority } from "@/lib/media/image";
import { deletionRequests, eventAddress } from "@/lib/nostr/deletion";
import type { NostrEvent } from "@/lib/nostr/event";
import { nostrKeys, randomNostrKeys } from "@/lib/nostr/keys";
import { publishToRelays } from "@/lib/nostr/pool";
import { RECORD_KIND, sealRecord } from "@/lib/nostr/record";
import { saleOwnerSecretKey } from "@/lib/payment-link/owner-key";
import { currentRelays } from "@/lib/relays/current";
import { monthPartEvent, monthParts } from "@/lib/registry/archive";
import { deriveMtpSessionKeys, sharedSessionEvent } from "@/lib/mtpelerin/shared-session";
import { declareOnchainPayment } from "@/lib/registry/onchain-payments";
import { declarationEvent, deriveSaleKeys, saleRegistry } from "@/lib/registry/registry";
import { fetchChannel } from "@/lib/team/channel";
import { paymentRateEvent } from "@/lib/rates/payment-rates";
import { pointHourOf } from "@/lib/rates/sources";
import { inviteLinkOf } from "@/lib/team/invite";
import { fundsRecoveriesEvent } from "@/lib/recovery/record";
import {
  assistantSecretKey,
  deriveArchiveKeys,
  deriveBusinessRegistry,
  deriveCatalogKeys,
  deriveFundsRecoveryKeys,
  deriveInvoiceKeys,
  deriveLinkOwner,
  deriveMemberKeys,
  derivePaymentRateKeys,
  deriveTeamKeys,
  integrationSecretKey,
  invoiceCounterKey,
  memberSecret,
  newMemberId
} from "@/lib/team/keys";
import {
  linkEvent,
  profileEvent,
  publishMemberRecord,
  saleEvent,
  saleTxEvent
} from "@/lib/team/member-records";
import { loadMembership } from "@/lib/team/membership-store";
import type { TeamMember } from "@/lib/team/roster";
import type { MerchantSettings } from "@/lib/settings/merchant";
import { saveMerchantSettings } from "@/lib/settings/store";
import type { OwnerTerminalProfile, SavedTerminalProfile } from "@/lib/terminal/model";
import { loadTerminalProfile, saveTerminalProfile } from "@/lib/terminal/profile";

import { OTHER_TEST_MNEMONIC, TEST_WALLET_ID, openTestAccount, testSeed } from "../../jest/account";
import { taprootAddress } from "../../jest/bitcoin";
import { addRelay } from "../../jest/card-relay";
import { publishMember, publishRemoved, rosterOn } from "../../jest/roster";
import type * as BreezFake from "../../jest/breez-sdk";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as SecureStoreFake from "../../jest/expo-secure-store";
import { makeInvoice, preimagePair } from "../../jest/lightning";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * "Delete account" (account-deletion.ts, account-erasure.ts): the wallet layer is the real
 * one, over the fake SDK; the relays are the fake ones, which delete as strfry does.
 */

jest.mock("../lib/breez/config", () => ({
  ...jest.requireActual("../lib/breez/config"),
  getWalletConfig: () => ({ network: "mainnet", apiKey: "test-api-key" }),
  // Mainnet: invoices of "bc" (the app config has no network under Jest).
  getBreezNetwork: () => "mainnet"
}));
jest.mock("../config/team", () => ({
  ...jest.requireActual("../config/team"),
  getInviteOrigin: () => "https://web.example"
}));

const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const sdk = jest.requireMock<typeof BreezFake>("@breeztech/breez-sdk-spark-react-native");
const secureStore = jest.requireMock<typeof SecureStoreFake>("expo-secure-store");
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");

const USERNAME = "sattleme02c6047f94";
/** A relay only a payment link names. */
const LINK_RELAY = "wss://relay.link.ch";
const team = deriveTeamKeys(walletSecret(testSeed()));
const FIAT = { minor: 2450, digits: 2, currency: "CHF" };

const now = () => Math.floor(Date.now() / 1000);

/** The owner's device: its account open (done), its point of sale prepared, its address there. */
async function ownerDevice(): Promise<SavedTerminalProfile> {
  await openTestAccount({ usage: "merchant", signUp: "done", businessName: "Fine Bakery" });
  sdk.lightningAddresses.set(USERNAME, "Fine Bakery");
  const profile: SavedTerminalProfile = {
    version: 2,
    walletId: TEST_WALLET_ID,
    backupKey: getAccountBackupKey()!,
    lightningAddress: `${USERNAME}@breez.tips`,
    businessName: "Fine Bakery",
    currency: "CHF"
  };
  await saveTerminalProfile(profile);
  resetTerminalProfileCache();
  return profile;
}

function invoice(n: number, at: number): Invoice {
  const { paymentHash } = preimagePair(n);
  const pr = makeInvoice({
    amountMsat: 49_000_000n,
    paymentHash,
    descriptionHash: "00".repeat(32),
    timestamp: at,
    expirySeconds: 600
  });
  return { pr, decoded: decodeBolt11(pr)!, verifyUrl: `https://breez.tips/verify/${paymentHash}` };
}

/** Declares payment `n` for the sale of key `saleKey` on the account's relays, at `at`. */
async function declare(n: number, saleKey: Uint8Array, at: number) {
  const registry = saleRegistry(deriveBusinessRegistry(team), saleKey);
  await publishToRelays(declarationEvent(registry, invoice(n, at), { fiat: FIAT, note: "" }, at), {
    relays: DEFAULT_RELAYS,
    channel: "anonymous",
    timeoutMs: 1000,
    authKey: registry.saleKeys.nostr.secretKey
  });
}

/** A Lightning payment the wallet received, as the bindings give it. */
function received(id: string, paymentHash: string, at: number): Record<string, unknown> {
  return {
    id,
    paymentType: sdk.PaymentType.Receive,
    status: sdk.PaymentStatus.Completed,
    amount: BigInt(49_000),
    fees: BigInt(0),
    timestamp: BigInt(at),
    method: sdk.PaymentMethod.Lightning,
    details: {
      tag: sdk.PaymentDetails_Tags.Lightning,
      inner: {
        description: undefined,
        invoice: "lnbc1",
        destinationPubkey: "02ab",
        htlcDetails: { paymentHash }
      }
    }
  };
}

/** Every event the relays hold but deletion requests. */
function held(): NostrEvent[] {
  return [...relays.stored.values()].flat().filter((event) => event.kind !== 5);
}

/**
 * The business of every test that deletes: a logo, an article with its photo, Alice (her sale paid,
 * declared; a payment link of hers, older than a month, its payer's declaration and the owner's
 * final version; her photo), Bob removed, an integration whose sale the wallet received.
 */
async function business() {
  const profile = await ownerDevice();
  await changeLogo(new Uint8Array(500).fill(3));
  await addArticle(
    {
      name: "Croissant",
      description: "",
      priceMinor: 250,
      photo: new Uint8Array(500).fill(6),
      barcode: null
    },
    0,
    await refreshCatalogEpoch()
  );
  const alice = await inviteEmployee("Alice");
  const bob = await inviteEmployee("Bob");
  await removeEmployee(bob.member);
  const integration = await createIntegration("Shop", "node");
  const aliceKeys = deriveMemberKeys(memberSecret(team, alice.member.id));
  const at = now() - 7200;
  // Alice's sale, paid.
  const sale = invoice(1, at);
  await publishMemberRecord(
    aliceKeys,
    saleEvent(aliceKeys, {
      version: 1,
      paymentHash: sale.decoded.paymentHash,
      sats: "49000",
      fiat: FIAT,
      note: "",
      verifyUrl: sale.verifyUrl,
      createdAt: at,
      expiresAt: at + 600,
      paidAt: at + 60,
      onchainAddress: null,
      onchainTag: null,
      sale: "e1".repeat(32)
    }),
    DEFAULT_RELAYS
  );
  await declare(1, new Uint8Array(32).fill(11), at);
  // Another sale of hers, above the most the Lightning address accepts: its address alone, paid.
  // Only its transaction's declaration names its key.
  const aloneKey = new Uint8Array(32).fill(14);
  const aloneAddress = taprootAddress(7);
  const aloneTx = "a7".repeat(32);
  await publishMemberRecord(
    aliceKeys,
    saleEvent(aliceKeys, {
      version: 1,
      paymentHash: null,
      verifyUrl: null,
      hour: at - (at % 3600),
      sats: "4900000",
      fiat: FIAT,
      note: "",
      createdAt: at,
      expiresAt: at + 600,
      paidAt: at + 60,
      onchainAddress: aloneAddress,
      onchainTag: null,
      sale: deriveSaleKeys(aloneKey).nostr.publicKey
    }),
    DEFAULT_RELAYS
  );
  await publishMemberRecord(
    aliceKeys,
    saleTxEvent(aliceKeys, aloneAddress, aloneTx, at + 30),
    DEFAULT_RELAYS
  );
  await declareOnchainPayment(
    saleRegistry(deriveBusinessRegistry(team), aloneKey),
    { txid: aloneTx, address: aloneAddress },
    { fiat: FIAT, note: "" },
    { relays: DEFAULT_RELAYS }
  );
  // Her payment link, over a year ago (past the owner's reconciliation: not a sale in progress),
  // the payer's declaration, the owner's final version.
  const linkAt = now() - 400 * 24 * 3600;
  const linkSale = new Uint8Array(32).fill(12);
  await publishMemberRecord(
    aliceKeys,
    linkEvent(aliceKeys, {
      version: 1,
      link: randomNostrKeys().publicKey,
      saleKey: bytesToHex(linkSale),
      createdAt: linkAt,
      onchainTag: null,
      relays: [...DEFAULT_RELAYS, LINK_RELAY],
      sealedKey: "A".repeat(200)
    }),
    DEFAULT_RELAYS
  );
  // There, something the team signed (a copy anyone could have made).
  await publishToRelays(
    sealRecord({
      type: "test-copy",
      value: {},
      signer: team.secretKey,
      encryptionKey: new Uint8Array(32).fill(1),
      address: "copy",
      createdAt: linkAt
    }),
    { relays: [LINK_RELAY], channel: "account", timeoutMs: 1000, authKey: team.secretKey }
  );
  await declare(2, linkSale, linkAt);
  const ownerFinal = nostrKeys(saleOwnerSecretKey(deriveLinkOwner(team).secretKey, linkSale));
  await publishToRelays(
    sealRecord({
      type: "test-owner-final",
      value: {},
      signer: ownerFinal.secretKey,
      encryptionKey: new Uint8Array(32).fill(1),
      address: "final",
      createdAt: linkAt + 3600
    }),
    { relays: DEFAULT_RELAYS, channel: "anonymous", timeoutMs: 1000, authKey: ownerFinal.secretKey }
  );
  // Her photo, named by her profile.
  const photo = createImage(new Uint8Array(400).fill(8), at);
  await publishToRelays(photo.event, {
    relays: DEFAULT_RELAYS,
    channel: "account",
    timeoutMs: 1000,
    authKey: new Uint8Array(32).fill(2)
  });
  await publishMemberRecord(
    aliceKeys,
    profileEvent(aliceKeys, { version: 1, avatar: photo.ref, updatedAt: at }),
    DEFAULT_RELAYS
  );
  // The integration's sale, paid: only the wallet lists its payment.
  await declare(3, new Uint8Array(32).fill(13), at);
  // The owner's copy of a month of declarations over a year old (src/lib/registry/archive.ts).
  const archive = deriveArchiveKeys(team);
  await publishToRelays(monthPartEvent(archive, monthParts("2025-09", [])[0]!, at), {
    relays: DEFAULT_RELAYS,
    channel: "account",
    timeoutMs: 1000,
    authKey: archive.nostr.secretKey
  });
  // The account's Mt Pelerin session at the test environment (src/lib/mtpelerin/shared-session.ts).
  const mtp = deriveMtpSessionKeys(team, "test");
  await publishToRelays(
    sharedSessionEvent(mtp, { refreshToken: "fake.token", sessionAt: at, paidValidations: [] }, at),
    { relays: DEFAULT_RELAYS, channel: "account", timeoutMs: 1000, authKey: mtp.nostr.secretKey }
  );
  // The price of bitcoin at a payment of the wallet (src/lib/rates/payment-rates.ts).
  const rates = derivePaymentRateKeys(team);
  await publishToRelays(
    paymentRateEvent(rates, {
      payment: "p3",
      at: at + 30,
      currency: "CHF",
      hour: pointHourOf(at + 30),
      rate: 69_400
    }),
    { relays: DEFAULT_RELAYS, channel: "account", timeoutMs: 1000, authKey: rates.nostr.secretKey }
  );
  // The recovery of the wallet's funds that left its balance (src/lib/recovery/record.ts).
  const recovery = deriveFundsRecoveryKeys(team);
  await publishToRelays(
    fundsRecoveriesEvent(
      recovery,
      { subject: { kind: "account" }, walletId: TEST_WALLET_ID, destination: null, recoveries: [] },
      at
    ),
    {
      relays: DEFAULT_RELAYS,
      channel: "account",
      timeoutMs: 1000,
      authKey: recovery.nostr.secretKey
    }
  );
  // An invoice of "New invoice" (its client's details), and the counter of their numbers.
  await saveDraft(
    {
      recipient: {
        name: "Bastion Coffee LLC",
        street: "12 Gold Cross Street",
        postalCode: "1204",
        city: "Geneva",
        country: "CH",
        reference: ""
      },
      currency: { code: "CHF", digits: 2 },
      lines: [{ name: "Sourdough bread 800 g", quantity: 100, unitMinor: 650, vatRate: 260 }],
      dueDate: null,
      terms: "",
      legal: "",
      redirectUrl: null
    },
    null,
    []
  );
  sdk.fakeWallet.payments = [received("p3", invoice(3, at).decoded.paymentHash, at + 30)];
  return { profile, alice, aliceKeys, bob, integration };
}

jest.setTimeout(30_000);

beforeEach(async () => {
  closeAccount();
  await disconnectWallet();
  relays.resetRelays();
  fileSystem.resetFileSystem();
  secureStore.resetSecureStore();
  resetTerminalProfileCache();
  resetMembershipCache();
  sdk.resetFakeWallet();
  sdk.lightningAddresses.clear();
  resetCardStates();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe('"Delete account"', () => {
  it("deletes what the account signed, its Lightning address, then everything on this device", async () => {
    const { aliceKeys, bob, integration } = await business();
    // Bob's channel (removed before), lost by every relay since: his device still finds the
    // deletion of its address.
    const bobKeys = deriveMemberKeys(memberSecret(team, bob.member.id));
    for (const [relay, events] of relays.stored) {
      relays.stored.set(
        relay,
        events.filter(
          (event) =>
            !event.tags.some(([name, value]) => name === "d" && value === bobKeys.channel.address)
        )
      );
    }
    await expect(checkAccountDeletion()).resolves.toEqual({
      employees: 1,
      integrations: 1,
      assistants: 0
    });
    const authors = new Set(held().map((event) => event.pubkey));
    // The backup, the team, the catalogue, Alice and her invitation, Bob's invitation, the images,
    // three sales and the owner's final version at least.
    expect(authors.size).toBeGreaterThanOrEqual(11);
    // The invoice, the counter of the numbers and the owner's copy of the counter it shares with
    // its assistants, under their own author.
    const invoiceAuthor = deriveInvoiceKeys(team).nostr.publicKey;
    const invoiceEvents = held().filter((event) => event.pubkey === invoiceAuthor);
    expect(new Set(invoiceEvents.map(({ id }) => id)).size).toBe(3);

    const steps: DeletionStep["step"][] = [];
    const outcome = await deleteAccount(testSeed(), (step) => {
      if (steps.at(-1) !== step.step) steps.push(step.step);
    });
    // The checks run again once nothing takes payments any more, before the relays.
    expect(steps).toEqual(["wallet", "team", "wallet", "relays", "device"]);
    expect(outcome.unconfirmed).toEqual([]);
    expect(outcome.named).toBeGreaterThanOrEqual(authors.size);
    // Nothing is left on any relay but the deletion requests.
    expect(held()).toEqual([]);
    expect(sdk.lightningAddresses.size).toBe(0);
    // This device: as after "Log out".
    expect(getAccountSettings()).toBeNull();
    expect([...secureStore.items.keys()]).toEqual([]);
    expect([...fileSystem.files.keys()]).toEqual([]);
    await expect(getTerminalProfile()).resolves.toBeNull();
    // The channels' devices and servers read them as deleted.
    for (const keys of [aliceKeys, bobKeys]) {
      await expect(fetchChannel(team.publicKey, keys, 1000, DEFAULT_RELAYS)).resolves.toEqual({
        status: "deleted"
      });
    }
    const integrationKeys = deriveIntegrationKeys(
      integrationSecretKey(team, integration.integration.id)
    );
    await expect(
      fetchChannel(team.publicKey, integrationKeys, 1000, DEFAULT_RELAYS)
    ).resolves.toEqual({ status: "deleted" });
  });

  it("reads what the account signed as its authors, where relays give an author's events to that author only", async () => {
    await business();
    await checkAccountDeletion();
    const answer = relays.queryEvents;
    const spy = jest
      .spyOn(relays, "queryEvents")
      .mockImplementation(async (url, filter, options) => {
        // Everything an author signed, read by its authors (readAuthors): to those authors only.
        if (filter.authors && !filter.kinds) {
          const authed = new Set(
            (options.authKeys ?? []).map(
              (key) => nostrKeys(typeof key === "function" ? key() : key).publicKey
            )
          );
          if (filter.authors.some((author) => !authed.has(author))) {
            throw new Error(`${url} closed the query: restricted: to its authors only`);
          }
        }
        return answer(url, filter, options);
      });
    try {
      const outcome = await deleteAccount(testSeed(), () => undefined);
      expect(outcome.unconfirmed).toEqual([]);
      expect(held()).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });

  it("is refused while the wallet holds sats, a payment is pending, a deposit is not claimed or funds come back", async () => {
    await ownerDevice();
    sdk.fakeWallet.balanceSats = BigInt(1234);
    await expect(checkAccountDeletion()).rejects.toMatchObject({
      code: "balance",
      balanceSats: 1234n
    });
    await expect(deleteAccount(testSeed())).rejects.toMatchObject({ code: "balance" });
    sdk.fakeWallet.balanceSats = BigInt(0);
    sdk.fakeWallet.payments = [
      { ...received("p1", "ab".repeat(32), now()), status: sdk.PaymentStatus.Pending }
    ];
    await expect(checkAccountDeletion()).rejects.toMatchObject({ code: "pendingPayments" });
    // A transfer the SDK cannot tell (spark-sdk 0.27.0 on), pending: just as much in flight.
    sdk.fakeWallet.payments = [
      sdk.unknownMethodPayment({
        id: "u1",
        status: sdk.PaymentStatus.Pending,
        amount: BigInt(2_000),
        timestamp: now()
      })
    ];
    await expect(checkAccountDeletion()).rejects.toMatchObject({ code: "pendingPayments" });
    sdk.fakeWallet.payments = [];
    sdk.fakeWallet.unclaimedDeposits = [
      { txid: "cd".repeat(32), vout: 0, amountSats: BigInt(20_000), isMature: false }
    ];
    await expect(checkAccountDeletion()).rejects.toMatchObject({ code: "unclaimedDeposits" });
    // Funds that left the balance, on their way back to it as a deposit (funds-recovery.ts).
    sdk.fakeWallet.unclaimedDeposits = [];
    sdk.fakeWallet.recovery.leaves = [
      { leafId: "leaf-1", valueSats: BigInt(5000), method: "cooperative", takenFeeSats: BigInt(0) }
    ];
    await expect(checkAccountDeletion()).rejects.toMatchObject({ code: "unclaimedDeposits" });
    // Nothing changed.
    expect(sdk.lightningAddresses.size).toBe(1);
    expect(getAccountSettings()).not.toBeNull();
  });

  it("is refused while no sync of the wallet reached the network, never on this device's copy", async () => {
    // The Spark operators unreachable: the SDK's syncs end, having read nothing (this device's copy
    // says the wallet is empty).
    sdk.setSparkReachable(false);
    await ownerDevice();
    jest.useFakeTimers({ advanceTimers: true });
    try {
      const checked = expect(checkAccountDeletion()).rejects.toMatchObject({
        code: "walletFailed"
      });
      await jest.advanceTimersByTimeAsync(DELETION_WALLET_TIMEOUT_MS);
      await checked;
      const deleted = expect(deleteAccount(testSeed())).rejects.toMatchObject({
        code: "walletFailed"
      });
      await jest.advanceTimersByTimeAsync(DELETION_WALLET_TIMEOUT_MS);
      await deleted;
      // Nothing changed.
      expect(sdk.lightningAddresses.size).toBe(1);
      expect(getAccountSettings()).not.toBeNull();
    } finally {
      jest.useRealTimers();
    }
    // Reachable again: a sync reaches the network, the checks pass.
    sdk.setSparkReachable(true);
    await expect(checkAccountDeletion()).resolves.toEqual({
      employees: 0,
      integrations: 0,
      assistants: 0
    });
  });

  it("is refused while a sale of the business is not final", async () => {
    await ownerDevice();
    const { member } = await inviteEmployee("Alice");
    const keys = deriveMemberKeys(memberSecret(team, member.id));
    const sale = invoice(9, now() - 60);
    await publishMemberRecord(
      keys,
      saleEvent(keys, {
        version: 1,
        paymentHash: sale.decoded.paymentHash,
        sats: "49000",
        fiat: FIAT,
        note: "",
        verifyUrl: sale.verifyUrl,
        createdAt: now() - 60,
        expiresAt: now() + 540,
        paidAt: null,
        onchainAddress: null,
        onchainTag: null,
        sale: "e2".repeat(32)
      }),
      DEFAULT_RELAYS
    );
    await expect(checkAccountDeletion()).rejects.toMatchObject({ code: "salesInProgress" });
    await expect(deleteAccount(testSeed())).rejects.toMatchObject({ code: "salesInProgress" });
    expect(sdk.lightningAddresses.size).toBe(1);
    expect((await rosterOn(getAccountTeamKeys()!)).active).toHaveLength(1);
    // Offline, nothing tells: refused too.
    for (const relay of DEFAULT_RELAYS) relays.unreachable.add(relay);
    await expect(checkAccountDeletion()).rejects.toMatchObject({ code: "unreachable" });
  });

  it("is not held back by an employee's sale that claims to last longer than an invoice can", async () => {
    await ownerDevice();
    const { member } = await inviteEmployee("Alice");
    const keys = deriveMemberKeys(memberSecret(team, member.id));
    // Recorded with Alice's keys by whoever opened her invitation first: an
    // invoice not paid, shown an hour and a half ago, that would end in a year.
    const sale = invoice(9, now() - 5400);
    await publishMemberRecord(
      keys,
      saleEvent(keys, {
        version: 1,
        paymentHash: sale.decoded.paymentHash,
        sats: "49000",
        fiat: FIAT,
        note: "",
        verifyUrl: sale.verifyUrl,
        createdAt: now() - 5400,
        expiresAt: now() + 365 * 24 * 3600,
        paidAt: null,
        onchainAddress: null,
        onchainTag: null,
        sale: "e3".repeat(32)
      }),
      DEFAULT_RELAYS
    );
    await expect(checkAccountDeletion()).resolves.toEqual({
      employees: 1,
      integrations: 0,
      assistants: 0
    });
  });

  it("is not held back by an employee's payment link that no relay can give", async () => {
    await ownerDevice();
    const { member } = await inviteEmployee("Alice");
    const keys = deriveMemberKeys(memberSecret(team, member.id));
    // Recorded with Alice's keys by whoever opened her invitation first: a
    // payment link on a relay that does not exist, which nobody can open.
    relays.unreachable.add("wss://nowhere.example");
    await publishMemberRecord(
      keys,
      linkEvent(keys, {
        version: 1,
        link: "ab".repeat(32),
        saleKey: "cd".repeat(32),
        createdAt: now() - 60,
        onchainTag: null,
        relays: ["wss://nowhere.example"],
        sealedKey: "A".repeat(200)
      }),
      DEFAULT_RELAYS
    );
    await expect(checkAccountDeletion()).resolves.toEqual({
      employees: 1,
      integrations: 0,
      assistants: 0
    });
  });

  it("is not held back by what a removed employee's keys sign after its removal", async () => {
    await ownerDevice();
    // Invited four hours ago, removed three hours ago: whoever kept her keys (her invitation opened
    // before her) records a sale shown now, not paid, and a payment link no relay holds.
    const member: TeamMember = {
      id: newMemberId(),
      name: "Alice",
      role: "employee",
      invitedAt: now() - 4 * 3600
    };
    await publishMember(team, member);
    await publishRemoved(team, member, now() - 3 * 3600);
    const keys = deriveMemberKeys(memberSecret(team, member.id));
    const sale = invoice(9, now() - 60);
    await publishMemberRecord(
      keys,
      saleEvent(keys, {
        version: 1,
        paymentHash: sale.decoded.paymentHash,
        sats: "49000",
        fiat: FIAT,
        note: "",
        verifyUrl: sale.verifyUrl,
        createdAt: now() - 60,
        expiresAt: now() + 540,
        paidAt: null,
        onchainAddress: null,
        onchainTag: null,
        sale: "e4".repeat(32)
      }),
      DEFAULT_RELAYS
    );
    await publishMemberRecord(
      keys,
      linkEvent(keys, {
        version: 1,
        link: "ab".repeat(32),
        saleKey: "cd".repeat(32),
        createdAt: now() - 60,
        onchainTag: null,
        relays: [...DEFAULT_RELAYS],
        sealedKey: "A".repeat(200)
      }),
      DEFAULT_RELAYS
    );
    await expect(checkAccountDeletion()).resolves.toEqual({
      employees: 0,
      integrations: 0,
      assistants: 0
    });
  });

  it("needs the account's own passkey and a finished account", async () => {
    await ownerDevice();
    await expect(deleteAccount(testSeed(OTHER_TEST_MNEMONIC))).rejects.toMatchObject({
      code: "otherAccount"
    });
    expect(sdk.lightningAddresses.size).toBe(1);
    expect(held().length).toBeGreaterThan(0);
    closeAccount();
    await expect(checkAccountDeletion()).rejects.toBeInstanceOf(DeletionError);
    await expect(deleteAccount(testSeed())).rejects.toMatchObject({ code: "noAccount" });
  });

  it("wipes nothing on this device while the relays do not confirm, and goes on at the next try", async () => {
    const { profile } = await business();
    const publish = relays.publishEvent;
    // The authors of the deletion requests sent.
    const requested = new Set<string>();
    const spy = jest
      .spyOn(relays, "publishEvent")
      .mockImplementation(async (url, event, options) => {
        // Relays that take no deletion request: the account's events stay.
        if (event.kind === 5) {
          requested.add(event.pubkey);
          throw new Error(`${url}: no answer in time`);
        }
        return publish(url, event, options);
      });
    try {
      await expect(deleteAccount(testSeed())).rejects.toMatchObject({ code: "notDeleted" });
    } finally {
      spy.mockRestore();
    }
    // The steps before are done: the Lightning address and the team are gone (their records say
    // so: every seat removed, Bob earlier, Alice and the integration now).
    expect(sdk.lightningAddresses.size).toBe(0);
    const team = await rosterOn(getAccountTeamKeys()!);
    expect(team.active).toEqual([]);
    expect(team.removed.map(({ name }) => name).sort()).toEqual(["Alice", "Bob", "Shop"]);
    // This device is as it was: the account open, its point of sale prepared.
    await expect(loadTerminalProfile()).resolves.toEqual(profile);
    expect(held().length).toBeGreaterThan(0);
    // The backup key's request was never sent: the account is whole for its other devices.
    const backupKey = deriveBackupKeys(walletSecret(testSeed())).publicKey;
    expect(requested.size).toBeGreaterThan(0);
    expect(requested.has(backupKey)).toBe(false);
    await expect(fetchAccountDeletion(backupKey, DEFAULT_RELAYS, 1000)).resolves.toBe("kept");

    await expect(deleteAccount(testSeed())).resolves.toMatchObject({ unconfirmed: [] });
    expect(held()).toEqual([]);
    expect(getAccountSettings()).toBeNull();
  });

  it("says the deletion is unfinished when only the backup's is not confirmed, and finishes it", async () => {
    const { profile } = await business();
    const backupKey = deriveBackupKeys(walletSecret(testSeed())).publicKey;
    const publish = relays.publishEvent;
    const spy = jest
      .spyOn(relays, "publishEvent")
      .mockImplementation(async (url, event, options) => {
        if (event.kind === 5 && event.pubkey === backupKey) {
          throw new Error(`${url}: no answer in time`);
        }
        return publish(url, event, options);
      });
    try {
      await expect(deleteAccount(testSeed())).rejects.toMatchObject({ code: "unfinished" });
    } finally {
      spy.mockRestore();
    }
    // Everything else is gone; the backup stays, this device too.
    expect(new Set(held().map((event) => event.pubkey))).toEqual(new Set([backupKey]));
    await expect(loadTerminalProfile()).resolves.toEqual(profile);
    expect(getAccountSettings()).not.toBeNull();

    await expect(deleteAccount(testSeed())).resolves.toMatchObject({ unconfirmed: [] });
    expect(held()).toEqual([]);
    await expect(fetchAccountDeletion(backupKey, DEFAULT_RELAYS, 1000)).resolves.toBe("deleted");
  });

  it("publishes no backup once its requests go out, though the settings change meanwhile", async () => {
    await ownerDevice();
    const publish = relays.publishEvent;
    const realNow = Date.now.bind(Date);
    let changed: Promise<unknown> | null = null;
    const spy = jest
      .spyOn(relays, "publishEvent")
      .mockImplementation(async (url, event, options) => {
        if (event.kind === 5 && !changed) {
          // Another flow's change (this device's record, a team sync), dated after the requests.
          jest.spyOn(Date, "now").mockImplementation(() => realNow() + 5000);
          changed = updateAccount({ businessName: "Another name" });
        }
        return publish(url, event, options);
      });
    try {
      await deleteAccount(testSeed());
      await changed;
    } finally {
      spy.mockRestore();
      jest.spyOn(Date, "now").mockRestore();
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
    // The backup of that change would outlive the deletion: the other devices would keep it.
    expect(held()).toEqual([]);
  });

  it("is done once a majority of the account's relays confirms it, the others told", async () => {
    await business();
    const [late, ...rest] = DEFAULT_RELAYS;
    const publish = relays.publishEvent;
    const spy = jest
      .spyOn(relays, "publishEvent")
      .mockImplementation(async (url, event, options) => {
        if (event.kind === 5 && url === late) throw new Error(`${url}: no answer in time`);
        return publish(url, event, options);
      });
    try {
      await expect(deleteAccount(testSeed())).resolves.toEqual({
        named: expect.any(Number),
        unconfirmed: [late]
      });
    } finally {
      spy.mockRestore();
    }
    expect(rest.every((relay) => (relays.stored.get(relay) ?? []).every((e) => e.kind === 5))).toBe(
      true
    );
  });
  it("is done without waiting for a relay that stays connected without answering", async () => {
    // Read and proven on a majority, the
    // requests going on to the others in the background.
    await business();
    const [late, ...rest] = DEFAULT_RELAYS;
    relays.latency.set(late, Infinity);
    jest.useFakeTimers({ now: Date.now(), doNotFake: ["queueMicrotask", "nextTick"] });
    try {
      let outcome: unknown = undefined;
      const startedAt = Date.now();
      void deleteAccount(testSeed()).then(
        (value) => (outcome = value),
        (error: unknown) => (outcome = error)
      );
      while (outcome === undefined && Date.now() - startedAt < 120_000) {
        await jest.advanceTimersByTimeAsync(100);
      }
      expect(outcome).toEqual({ named: expect.any(Number), unconfirmed: [late] });
      // About 1 s a read (its grace after the majority, QUORUM_GRACE_MIN_MS), some twenty reads in
      // all: before, each read and each write waited for the silent relay's 15 s, minutes in all.
      expect(Date.now() - startedAt).toBeLessThan(2 * TEAM_TIMEOUT_MS.background);
    } finally {
      jest.useRealTimers();
    }
    expect(rest.every((relay) => (relays.stored.get(relay) ?? []).every((e) => e.kind === 5))).toBe(
      true
    );
  });

  it("tells of a relay that missed the reads and holds what an author signed, though no request named it", async () => {
    await ownerDevice();
    const [late] = DEFAULT_RELAYS;
    // That relay alone holds the catalogue's event (nothing else of the account): the others never
    // sent it, so no request names its author.
    relays.stored.set(late, [
      sealRecord({
        type: "test-catalog",
        value: {},
        signer: deriveCatalogKeys(team).nostr.secretKey,
        encryptionKey: new Uint8Array(32).fill(1),
        address: "catalog",
        createdAt: now() - 60
      })
    ]);
    const query = relays.queryEvents;
    // It answers no read until the requests go out: then it answers the check.
    const spy = jest
      .spyOn(relays, "queryEvents")
      .mockImplementation(async (url, filter, options) => {
        const requested = [...relays.stored.values()].some((events) =>
          events.some((e) => e.kind === 5)
        );
        if (url === late && !requested) throw new Error(`${url}: no answer in time`);
        return query(url, filter, options);
      });
    try {
      await expect(deleteAccount(testSeed())).resolves.toMatchObject({ unconfirmed: [late] });
    } finally {
      spy.mockRestore();
    }
  });
});

describe('"Delete account" and the cards', () => {
  const root = deriveCardRoot(walletSecret(testSeed()));

  /** A card of the account, recorded on its relays as its phone does: its id. */
  async function card(
    uid: string,
    status: CardState["status"],
    settings: Partial<Pick<CardState, "name" | "look" | "issuer">> = {}
  ): Promise<string> {
    const cardId = cardIdOf(root, hexToBytes(uid));
    await withCardAccess((access) =>
      recordCardState(access, {
        cardId,
        uid,
        keyVersion: 1,
        status,
        relayHost: DEFAULT_CARD_RELAY_HOST,
        lastCounter: 5,
        depositedThrough: 1005,
        maxPaymentSats: 20_000n,
        maxDaySats: 50_000n,
        maxPaymentsPerHour: 5,
        suspended: false,
        name: "",
        look: null,
        issuer: null,
        ...settings,
        settingsAt: Date.now(),
        walletGeneration: 1
      })
    );
    return cardId;
  }

  /** The Lightning address of the card's wallet, registered now: its username. */
  async function cardAddress(cardId: string): Promise<string> {
    const address = await withCardAccess(async (access) => {
      const lease = await leaseCardWallet(access, { cardId, walletGeneration: 1 });
      try {
        return await cardLightningAddress(lease);
      } finally {
        await lease.release();
      }
    });
    return address.replace(/@breez\.tips$/, "");
  }

  it("is refused while a card's wallet holds anything, a reset card's included", async () => {
    await ownerDevice();
    const active = await card("04996c6a926980", "active");
    const reset = await card("04a39493cc8680", "reset");
    const fills: (() => void)[] = [
      () => (sdk.fakeCardWallet(active).balanceSats = 1n),
      () => (sdk.fakeCardWallet(reset).balanceSats = 2n),
      () =>
        (sdk.fakeCardWallet(active).payments = [
          { ...received("p9", "ef".repeat(32), now()), status: sdk.PaymentStatus.Pending }
        ]),
      () =>
        (sdk.fakeCardWallet(reset).unclaimedDeposits = [
          { txid: "cd".repeat(32), vout: 0, amountSats: 20_000n, isMature: false }
        ])
    ];
    for (const fill of fills) {
      fill();
      await expect(checkAccountDeletion()).rejects.toMatchObject({ code: "cardWallets" });
      await expect(deleteAccount(testSeed())).rejects.toMatchObject({ code: "cardWallets" });
      // Nothing changed: the wallet's address, this device.
      expect(sdk.lightningAddresses.has(USERNAME)).toBe(true);
      expect(getAccountSettings()).not.toBeNull();
      for (const cardId of [active, reset]) {
        const wallet = sdk.fakeCardWallet(cardId);
        wallet.balanceSats = 0n;
        wallet.payments = [];
        wallet.unclaimedDeposits = [];
      }
    }
    await expect(checkAccountDeletion()).resolves.toEqual({
      employees: 0,
      integrations: 0,
      assistants: 0
    });
  });

  it("is refused while a deleted card's wallet holds anything, or a card's earlier one", async () => {
    await ownerDevice();
    const deleted = await card("04996c6a926980", "deleted");
    // Deleted, then added again: it pays from its second wallet.
    const again = await card("04a39493cc8680", "active");
    await withCardAccess(async (access) => {
      const { updatedAt: _updatedAt, ...state } = knownCardState(TEST_WALLET_ID, again)!;
      await recordCardState(access, { ...state, keyVersion: 2, walletGeneration: 2 });
    });
    for (const wallet of [sdk.fakeCardWallet(deleted), sdk.fakeCardWallet(again, 1)]) {
      // Paid after the deletion: an invoice paid before it expired.
      wallet.balanceSats = 5n;
      await expect(checkAccountDeletion()).rejects.toMatchObject({ code: "cardWallets" });
      wallet.balanceSats = 0n;
    }
    await expect(checkAccountDeletion()).resolves.toEqual({
      employees: 0,
      integrations: 0,
      assistants: 0
    });
  });

  it("finds a card only this device knows, publishing nothing of it", async () => {
    await ownerDevice();
    // Paired while no relay answered: its record is on this device only.
    for (const url of currentRelays()) relays.unreachable.add(url);
    const cardId = await card("04996c6a926980", "active");
    relays.unreachable.clear();
    sdk.fakeCardWallet(cardId).balanceSats = 3n;
    await expect(checkAccountDeletion()).rejects.toMatchObject({ code: "cardWallets" });
    // Read only: still on no relay.
    const author = deriveCardRecordKeys(root).nostr.publicKey;
    expect(held().filter((event) => event.pubkey === author)).toEqual([]);
  });

  it("is refused for a card a newer app recorded, whose wallet it cannot check", async () => {
    await ownerDevice();
    const keys = deriveCardRecordKeys(root);
    const cardId = cardIdOf(root, hexToBytes("04996c6a926980"));
    const state: CardState = {
      cardId,
      uid: "04996c6a926980",
      keyVersion: 1,
      status: "active",
      relayHost: DEFAULT_CARD_RELAY_HOST,
      lastCounter: 5,
      depositedThrough: 1005,
      maxPaymentSats: 20_000n,
      maxDaySats: 50_000n,
      maxPaymentsPerHour: 5,
      suspended: false,
      name: "",
      look: null,
      issuer: null,
      settingsAt: Date.now(),
      walletGeneration: 1,
      updatedAt: now()
    };
    await publishToRelays(
      sealRecord({
        type: "card-state",
        value: { ...cardStateValue(state), version: CARD_STATE_VERSION + 1 },
        signer: keys.nostr.secretKey,
        encryptionKey: keys.encryptionKey,
        address: cardRecordAddress(keys, cardId),
        createdAt: now(),
        block: 512
      }),
      {
        relays: currentRelays(),
        channel: "account",
        timeoutMs: 1000,
        authKey: keys.nostr.secretKey
      }
    );
    await expect(checkAccountDeletion()).rejects.toMatchObject({ code: "newerApp" });
    await expect(deleteAccount(testSeed())).rejects.toMatchObject({ code: "newerApp" });
    expect(sdk.lightningAddresses.has(USERNAME)).toBe(true);
  });

  it("gives up the cards' Lightning addresses, then the wallet's", async () => {
    await ownerDevice();
    const username = await cardAddress(await card("04996c6a926980", "reset"));
    expect(sdk.lightningAddresses.has(username)).toBe(true);
    await deleteAccount(testSeed());
    expect(sdk.lightningAddresses.size).toBe(0);
    expect(getAccountSettings()).toBeNull();
  });

  /** A card holder's device: no wallet of its own, no address. */
  async function holderDevice() {
    await openTestAccount({ usage: "card", signUp: "done", businessName: "Merchant 9EE5" });
    await saveTerminalProfile({
      version: 4,
      walletId: TEST_WALLET_ID,
      backupKey: getAccountBackupKey()!,
      businessName: "Merchant 9EE5",
      currency: "CHF"
    });
    resetTerminalProfileCache();
  }

  it("deletes a card holder's account without ever connecting a wallet of its own", async () => {
    await holderDevice();
    const username = await cardAddress(await card("04996c6a926980", "active"));
    sdk.accountConnections.count = 0;
    await expect(checkAccountDeletion()).resolves.toEqual({
      employees: 0,
      integrations: 0,
      assistants: 0
    });

    const steps: DeletionStep["step"][] = [];
    const outcome = await deleteAccount(testSeed(), (step) => {
      if (steps.at(-1) !== step.step) steps.push(step.step);
    });

    expect(steps).toEqual(["wallet", "team", "wallet", "relays", "device"]);
    expect(outcome.unconfirmed).toEqual([]);
    // Its card's address given up; no other to give up.
    expect(sdk.lightningAddresses.has(username)).toBe(false);
    expect(sdk.accountConnections.count).toBe(0);
    expect(getAccountSettings()).toBeNull();
    expect([...secureStore.items.keys()]).toEqual([]);
    await expect(getTerminalProfile()).resolves.toBeNull();
  });

  it("is refused for a card holder while a card's wallet holds anything", async () => {
    await holderDevice();
    const active = await card("04996c6a926980", "active");
    sdk.accountConnections.count = 0;
    sdk.fakeCardWallet(active).balanceSats = 1n;
    await expect(checkAccountDeletion()).rejects.toMatchObject({ code: "cardWallets" });
    await expect(deleteAccount(testSeed())).rejects.toMatchObject({ code: "cardWallets" });
    expect(getAccountSettings()).not.toBeNull();
    expect(sdk.accountConnections.count).toBe(0);
  });

  it("erases the cards' records too: their states, the merchants they pay, their history and its copies", async () => {
    await ownerDevice();
    await card("04996c6a926980", "active");
    // A record of each other family, by its author: what it holds does not matter here.
    for (const keys of [
      derivePayeeRecordKeys(root),
      deriveHistoryRecordKeys(root),
      deriveMonthPartKeys(root)
    ]) {
      await publishToRelays(
        sealRecord({
          type: "test-card",
          value: {},
          signer: keys.nostr.secretKey,
          encryptionKey: new Uint8Array(32).fill(1),
          address: "test-card",
          createdAt: now()
        }),
        {
          relays: currentRelays(),
          channel: "account",
          timeoutMs: 1000,
          authKey: keys.nostr.secretKey
        }
      );
    }
    const authors = [
      deriveCardRecordKeys(root),
      derivePayeeRecordKeys(root),
      deriveHistoryRecordKeys(root),
      deriveMonthPartKeys(root)
    ].map((keys) => keys.nostr.publicKey);
    const byCards = () => held().filter((event) => authors.includes(event.pubkey));
    expect(new Set(byCards().map((event) => event.pubkey)).size).toBe(4);

    await deleteAccount(testSeed());
    expect(byCards()).toEqual([]);
    expect(held()).toEqual([]);
  });

  it("erases the images its cards name: an imported look, an issuer's visual", async () => {
    await ownerDevice();
    const look = createImage(new Uint8Array(300).fill(4), now());
    const visual = createImage(new Uint8Array(300).fill(5), now());
    for (const { event, ref } of [look, visual]) {
      await publishImageToMajority(event, ref, currentRelays());
    }
    await card("04996c6a926980", "active", {
      look: { kind: "image", image: look.ref, ink: "light" }
    });
    await card("04a39493cc8680", "active", {
      issuer: { image: visual.ref, number: "4821-0937-5530-1186", white: false }
    });
    const authors = [look.ref, visual.ref].map((ref) => imageAuthor(ref).publicKey);
    const images = () => held().filter((event) => authors.includes(event.pubkey));
    expect(new Set(images().map((event) => event.pubkey)).size).toBe(2);

    await deleteAccount(testSeed());
    expect(images()).toEqual([]);
    expect(held()).toEqual([]);
  });

  /** A channel of the card `cardId` on the default card relay, as its phone made it. */
  async function channel(cardId: string) {
    const relay = addRelay(DEFAULT_CARD_RELAY_HOST);
    const secret = channelSecretOf(root, cardId, DEFAULT_CARD_RELAY_HOST);
    await putChannel(DEFAULT_CARD_RELAY_HOST, secret, {
      publicKey: (await loadDeviceKey()).publicKey
    });
    expect(relay.channelOf(secret)).toBeDefined();
    return { relay, secret };
  }

  it("deletes the cards' channels on their relays from the phone, once the records are gone", async () => {
    await ownerDevice();
    const { relay, secret } = await channel(await card("04996c6a926980", "reset"));
    await deleteAccount(testSeed());
    // Its relay wakes this device no more for the card's taps.
    expect(relay.channelOf(secret)).toBeUndefined();
  });

  it("leaves the cards' channels from the web app, which no card relay answers", async () => {
    await ownerDevice();
    const { relay, secret } = await channel(await card("04996c6a926980", "active"));
    const asked = relay.requests.length;
    // This file restores no mock between tests: the next ones run on the phone again.
    const web = jest.replaceProperty(Platform, "OS", "web");
    try {
      await deleteAccount(testSeed());
    } finally {
      web.restore();
    }
    expect(relay.requests.slice(asked)).toEqual([]);
    expect(relay.channelOf(secret)).toBeDefined();
  });

  it("keeps the cards' channels when the relays did not confirm the deletion", async () => {
    await ownerDevice();
    const { relay, secret } = await channel(await card("04996c6a926980", "active"));
    // Relays that take no deletion request: the account stays whole, its cards pay on.
    const publish = relays.publishEvent;
    const spy = jest
      .spyOn(relays, "publishEvent")
      .mockImplementation(async (url, event, options) => {
        if (event.kind === 5) throw new Error(`${url}: no answer in time`);
        return publish(url, event, options);
      });
    try {
      await expect(deleteAccount(testSeed())).rejects.toMatchObject({ code: "notDeleted" });
    } finally {
      spy.mockRestore();
    }
    expect(relay.channelOf(secret)).toBeDefined();
  });

  it("goes no further when a card's address is not given up: the wallet's stays", async () => {
    await ownerDevice();
    const username = await cardAddress(await card("04996c6a926980", "active"));
    const remove = sdk.lightningAddresses.delete.bind(sdk.lightningAddresses);
    const spy = jest.spyOn(sdk.lightningAddresses, "delete").mockImplementation((name) => {
      if (name === username) throw new Error("Server down");
      return remove(name);
    });
    try {
      await expect(deleteAccount(testSeed())).rejects.toMatchObject({ code: "walletFailed" });
    } finally {
      spy.mockRestore();
    }
    // Not begun: the wallet's address, the relays and this device keep the account.
    expect(sdk.lightningAddresses.has(USERNAME)).toBe(true);
    expect(held().length).toBeGreaterThan(0);
    expect(getAccountSettings()).not.toBeNull();
  });
});

describe("an employee's device of a deleted account", () => {
  /** Alice's device joined (the same storage under Jest), the owner's account still open. */
  async function aliceJoined() {
    await ownerDevice();
    const { url, member } = await inviteEmployee("Alice");
    secureStore.resetSecureStore();
    resetTerminalProfileCache();
    resetMembershipCache();
    await joinTeam(await previewInvite(inviteLinkOf(url)!));
    return deriveMemberKeys(memberSecret(team, member.id));
  }

  it("forgets the business once the team deleted its channel, even where a relay still holds it", async () => {
    const keys = await aliceJoined();
    const [missed, ...rest] = DEFAULT_RELAYS;
    const address = eventAddress(RECORD_KIND, team.publicKey, keys.channel.address);
    const channels = (relays.stored.get(rest[0]!) ?? []).filter(
      (event) => event.pubkey === team.publicKey
    );
    for (const request of deletionRequests(team.secretKey, channels, now(), [address])) {
      await publishToRelays(request, {
        relays: rest,
        channel: "account",
        timeoutMs: 1000,
        authKey: team.secretKey
      });
    }
    // The relay that missed the deletion still sends the channel: the request is newer.
    await expect(fetchChannel(team.publicKey, keys, 1000, [missed!])).resolves.toMatchObject({
      status: "found"
    });
    await expect(syncMembership()).resolves.toBe("removed");
    await expect(loadMembership()).resolves.toBeNull();
    await expect(loadTerminalProfile()).resolves.toBeNull();
    expect(getRemovalNotice()).toBe("Fine Bakery");
  });

  it("stays when the channel is merely missing, or the request is older than the channel", async () => {
    const keys = await aliceJoined();
    const address = eventAddress(RECORD_KIND, team.publicKey, keys.channel.address);
    // A request of the team, older than a channel published again since.
    const [old] = deletionRequests(team.secretKey, [], now() - 120, [address]);
    for (const relay of DEFAULT_RELAYS) {
      const kept = (relays.stored.get(relay) ?? []).filter((e) => e.pubkey === team.publicKey);
      relays.stored.set(relay, [...(relays.stored.get(relay) ?? []), old!]);
      expect(kept.length).toBeGreaterThan(0);
    }
    await expect(syncMembership()).resolves.toBe("active");
    // No relay holds the channel, and no request names it: nothing changes.
    for (const relay of DEFAULT_RELAYS) relays.stored.set(relay, []);
    await expect(syncMembership()).resolves.toBe("unchanged");
    await expect(loadMembership()).resolves.not.toBeNull();
  });
});

describe('"Delete account" and the assistants', () => {
  it("deletes an assistant's channel, its invoices and its copy of the counter", async () => {
    await ownerDevice();
    const { assistant } = await createAssistant("Claude");
    const keys = deriveAssistantKeys(assistantSecretKey(team, assistant.id));
    const call = {
      relays: currentRelays(),
      channel: "account" as const,
      timeoutMs: 1000,
      authKey: keys.invoices.nostr.secretKey
    };
    // What its MCP server writes: its copy of the shared counter, an invoice (its record).
    const shared = sharedCounterKeys(invoiceCounterKey(team));
    await publishToRelays(
      sharedCounterEvent(shared, keys.invoices.nostr, { version: 1, year: 2026, last: 1 }, now()),
      call
    );
    await publishToRelays(
      sealRecord({
        type: "invoice",
        value: { version: 1, id: "ab".repeat(16) },
        signer: keys.invoices.nostr.secretKey,
        encryptionKey: keys.invoices.encryptionKey,
        address: "cd".repeat(32),
        createdAt: now()
      }),
      call
    );
    await expect(checkAccountDeletion()).resolves.toEqual({
      employees: 0,
      integrations: 0,
      assistants: 1
    });
    await expect(deleteAccount(testSeed())).resolves.toBeDefined();
    const authors = new Set(held().map((event) => event.pubkey));
    expect(authors.has(keys.invoices.nostr.publicKey)).toBe(false);
    // Its channel, signed by the team: gone with the team's events.
    expect(
      held().some((event) => event.tags.some(([, value]) => value === keys.member.channel.address))
    ).toBe(false);
  });
});

describe("the checks once nothing takes payments any more", () => {
  it("stop the deletion when a payment arrived between the first checks and the end of the address", async () => {
    await ownerDevice();
    const remove = sdk.lightningAddresses.delete.bind(sdk.lightningAddresses);
    // A customer pays an invoice of the address just before it is given up.
    const spy = jest.spyOn(sdk.lightningAddresses, "delete").mockImplementation((username) => {
      sdk.fakeWallet.balanceSats = BigInt(2100);
      return remove(username);
    });
    try {
      await expect(deleteAccount(testSeed())).rejects.toMatchObject({
        code: "balance",
        balanceSats: 2100n
      });
    } finally {
      spy.mockRestore();
    }
    // The address is given up, nothing else: the relays and this device keep the account.
    expect(sdk.lightningAddresses.size).toBe(0);
    expect(held().length).toBeGreaterThan(0);
    expect(getAccountSettings()).not.toBeNull();
  });
});

describe("another of the owner's devices", () => {
  const backupKey = deriveBackupKeys(walletSecret(testSeed()));

  /** Deleted on this device; then the other device, its copy and its point of sale as before. */
  async function deletedElsewhere(age = 0) {
    const saved = await ownerDevice();
    const profile = saved as OwnerTerminalProfile;
    const local = getAccountSettings()!;
    await deleteAccount(testSeed());
    expect(held()).toEqual([]);
    const copy: MerchantSettings = { ...local, updatedAt: local.updatedAt - age };
    await saveMerchantSettings(TEST_WALLET_ID, copy);
    await saveTerminalProfile(saved);
    resetTerminalProfileCache();
    return { profile, copy };
  }

  it("forgets the account in till mode once the relays tell its deletion", async () => {
    const { profile } = await deletedElsewhere();
    await expect(checkDeletedElsewhere(profile)).resolves.toBe(true);
    await expect(getTerminalProfile()).resolves.toBeNull();
    expect([...secureStore.items.keys()]).toEqual([]);
    expect([...fileSystem.files.keys()]).toEqual([]);
    expect(getDeletedAccountNotice()).toBe("Fine Bakery");
    expect(held()).toEqual([]);
    // Said until an account opens here again.
    await openTestAccount({ usage: "merchant", signUp: "done" });
    expect(getDeletedAccountNotice()).toBeNull();
  });

  it("closes the account as it opens there, publishing nothing again, even a month later", async () => {
    // A copy a month old: it would be dated again and published (session.ts, reconcile).
    const { profile } = await deletedElsewhere(40 * 24 * 3600);
    const told = jest.fn();
    const unsubscribe = subscribeAccountDeletion(told);
    try {
      await openAccount({
        seed: testSeed(),
        walletId: TEST_WALLET_ID,
        backupKey: profile.backupKey ?? undefined,
        created: false,
        detect: async () => ({ payoutCurrency: "CHF", detectedCountry: "CH" }),
        businessNameWord: "Merchant"
      });
      await waitUntil(() => told.mock.calls.length > 0);
    } finally {
      unsubscribe();
    }
    expect(told).toHaveBeenCalledWith(TEST_WALLET_ID);
    expect(getAccountSettings()).toBeNull();
    // Give its background a few turns: nothing is published.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(held()).toEqual([]);
  });

  it("starts a new account at a login with the passkey, never the deleted settings", async () => {
    const { copy } = await deletedElsewhere();
    fileSystem.resetFileSystem();
    secureStore.resetSecureStore();
    resetTerminalProfileCache();
    // A relay that missed the deletion still holds the last backup.
    const old = backupEvent(copy, backupKey);
    relays.stored.set(DEFAULT_RELAYS[0]!, [...(relays.stored.get(DEFAULT_RELAYS[0]!) ?? []), old]);
    const settings = await openAccount({
      seed: testSeed(),
      walletId: TEST_WALLET_ID,
      created: false,
      detect: async () => ({ payoutCurrency: "CHF", detectedCountry: "CH" }),
      businessNameWord: "Merchant"
    });
    expect(settings.signUp).not.toBe("done");
    expect(settings.businessName).not.toBe("Fine Bakery");
  });

  it("never takes back a deleted backup dated ahead of the new account", async () => {
    const { copy } = await deletedElsewhere();
    fileSystem.resetFileSystem();
    secureStore.resetSecureStore();
    resetTerminalProfileCache();
    // The last backup, by a device's clock ahead, deleted by a request as late (deletion.ts), on a
    // relay that still sends both.
    const old = backupEvent({ ...copy, updatedAt: now() + 300 }, backupKey);
    const [request] = deletionRequests(backupKey.secretKey, [old], now());
    relays.stored.set(DEFAULT_RELAYS[0]!, [
      ...(relays.stored.get(DEFAULT_RELAYS[0]!) ?? []),
      old,
      request!
    ]);
    await openAccount({
      seed: testSeed(),
      walletId: TEST_WALLET_ID,
      created: false,
      detect: async () => ({ payoutCurrency: "CHF", detectedCountry: "CH" }),
      businessNameWord: "Merchant"
    });
    await whenAccountSynced();
    expect(getAccountSettings()?.signUp).not.toBe("done");
    expect(getAccountSettings()?.businessName).not.toBe("Fine Bakery");
  });

  it("is told the account was created again since, and changes nothing while the relays do not answer", async () => {
    const { profile, copy } = await deletedElsewhere();
    for (const relay of DEFAULT_RELAYS) relays.unreachable.add(relay);
    await expect(checkDeletedElsewhere(profile)).resolves.toBe(false);
    await expect(fetchAccountDeletion(backupKey.publicKey, DEFAULT_RELAYS, 1000)).resolves.toBe(
      "unknown"
    );
    relays.unreachable.clear();
    await expect(getTerminalProfile()).resolves.not.toBeNull();
    // The same passkey made an account again, later: its backup is newer than the deletion.
    const again = backupEvent({ ...copy, updatedAt: now() + 60 }, backupKey);
    await publishToRelays(again, {
      relays: DEFAULT_RELAYS,
      channel: "account",
      timeoutMs: 1000,
      authKey: backupKey.secretKey
    });
    await expect(fetchAccountDeletion(backupKey.publicKey, DEFAULT_RELAYS, 1000)).resolves.toBe(
      "kept"
    );
    await expect(checkDeletedElsewhere(profile)).resolves.toBe(false);
  });

  it("counts only the account's own signed requests, as late as its newest record", () => {
    const address = eventAddress(RECORD_KIND, backupKey.publicKey, backupKey.address);
    const [request] = deletionRequests(backupKey.secretKey, [], now(), [address]);
    const backupThen = (at: number) =>
      sealRecord({
        type: "test",
        value: {},
        signer: backupKey.secretKey,
        encryptionKey: new Uint8Array(32).fill(1),
        address: backupKey.address,
        createdAt: at
      });
    expect(accountDeletionOf([request], backupKey.publicKey)).toBe("deleted");
    expect(accountDeletionOf([request, backupThen(now() - 60)], backupKey.publicKey)).toBe(
      "deleted"
    );
    expect(accountDeletionOf([request, backupThen(now() + 60)], backupKey.publicKey)).toBe("kept");
    // Forged (its signature broken), or another key's.
    expect(accountDeletionOf([{ ...request, created_at: now() + 1 }], backupKey.publicKey)).toBe(
      "kept"
    );
    const [other] = deletionRequests(randomNostrKeys().secretKey, [], now(), []);
    expect(accountDeletionOf([other], backupKey.publicKey)).toBe("kept");
    expect(accountDeletionOf([], backupKey.publicKey)).toBe("kept");
  });
});

/** Until `done()`: background work takes a few turns of the event loop. */
async function waitUntil(done: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 200 && !done(); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  expect(done()).toBe(true);
}
