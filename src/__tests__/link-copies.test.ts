import { bytesToHex } from "@noble/hashes/utils.js";

import { DEFAULT_RELAYS } from "@/config/relays";
import { closeAccount, getAccountTeamKeys } from "@/features/account/session";
import { closeAccountWallet } from "@/features/account/wallet-access";
import { ARCHIVE_REFRESH_SECONDS, archiveDeclarations } from "@/features/activity/archive";
import { refreshLinks } from "@/features/payment-link/link-refresh";
import { resetDeviceRelays } from "@/features/relays/device-relays";
import { declarationsCopied } from "@/features/settings/declarations-copy";
import { signEvent, type NostrEvent } from "@/lib/nostr/event";
import { nostrKeys, randomNostrKeys } from "@/lib/nostr/keys";
import { nip44Decrypt } from "@/lib/nostr/nip44";
import { sealRecord } from "@/lib/nostr/record";
import { finalPayload } from "@/lib/payment-link/final";
import {
  PAYMENT_LINK_KIND,
  createPaymentLink,
  fetchPaymentLink,
  finalLinkEvent,
  ownerFinalAddress,
  ownerFinalLinkEvent,
  publishLinkEvent,
  publishPaymentLink,
  saleLinkAddress
} from "@/lib/payment-link/link";
import { saleOwnerPublicKey, saleOwnerSecretKey } from "@/lib/payment-link/owner-key";
import type { PaymentLinkPayload } from "@/lib/payment-link/payload";
import { openLinkKey, sealLinkKey } from "@/lib/payment-link/sealed-key";
import { archiveOf, archivedMonth, fetchArchiveAnswers, partAddress } from "@/lib/registry/archive";
import {
  deriveArchiveKeys,
  deriveLinkOwner,
  deriveMemberKeys,
  deriveRegistryKey,
  deriveRegistryReader,
  memberSecret,
  type TeamKeys
} from "@/lib/team/keys";
import {
  fetchLinks,
  fetchMemberRecords,
  linkEvent,
  publishMemberRecord
} from "@/lib/team/member-records";
import type { TeamMember } from "@/lib/team/roster";

import { openTestAccount } from "../../jest/account";
import type * as BreezFake from "../../jest/breez-sdk";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as SecureStoreFake from "../../jest/expo-secure-store";
import type * as RelaysFake from "../../jest/nostr-relays";
import { publishMember } from "../../jest/roster";

/*
 * The payment links of the owner's copy of a month (src/lib/registry/archive.ts,
 * src/features/payment-link/link-refresh.ts): the device seals the link's key for the owner in its
 * record, the owner copies the month's links once a year old, then signs their versions again each
 * year, the same, at the same address: a payer opens a link years later, past the 3 years strfry
 * keeps an event.
 */

jest.mock("../lib/breez/config", () => ({
  ...jest.requireActual("../lib/breez/config"),
  getWalletConfig: () => ({ network: "mainnet", apiKey: "test-api-key" }),
  // Mainnet: invoices of "bc" (the app config has no network under Jest).
  getBreezNetwork: () => "mainnet"
}));

const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const sdk = jest.requireMock<typeof BreezFake>("@breeztech/breez-sdk-spark-react-native");
const secureStore = jest.requireMock<typeof SecureStoreFake>("expo-secure-store");
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");

jest.setTimeout(30_000);

const ADDRESS = "sattleme02c6047f94@breez.tips";
const ORIGIN = "https://web.example";
/** 3 October 2026, 13:10:30 UTC: the link's month, October 2026. */
const START = Date.UTC(2026, 9, 3, 13, 10, 30) / 1000;
/** Past 1 November 2027: October 2026 is over a year old. */
const LATER = Date.UTC(2027, 10, 2, 9, 0, 0) / 1000;
const FIAT = { minor: 2450, digits: 2, currency: "CHF" };
const MEMBER = "0123456789abcdef0123456789abcdef";
const alice: TeamMember = { id: MEMBER, name: "Alice", role: "employee", invitedAt: START - 600 };

/** Its sale ended with nothing received: its final version needs no point. */
function expiredFinal(author: string) {
  return finalPayload({
    status: "expired",
    received: 0n,
    due: null,
    point: null,
    lightning: [],
    onchain: null,
    link: author
  });
}

/**
 * Alice's link of October 2026, finalized expired by her device (or left to the owner, `owner`),
 * its record with its key sealed for the owner, or for another business when `sealed` is false (a
 * key the owner cannot open).
 */
async function aliceLink(
  team: TeamKeys,
  { sealed = true, n = 1, owner = false }: { sealed?: boolean; n?: number; owner?: boolean } = {}
) {
  const saleKey = new Uint8Array(32).fill(40 + n);
  const payload: PaymentLinkPayload = {
    version: 3,
    businessName: "Fine Bakery",
    lightningAddress: ADDRESS,
    fiat: FIAT,
    note: `Table ${n}`,
    onchainAddress: null,
    endsAt: START + 600,
    registryKey: bytesToHex(deriveRegistryKey(team)),
    registryReader: deriveRegistryReader(team).publicKey,
    owner: deriveLinkOwner(team).publicKey
  };
  const link = createPaymentLink(payload, ORIGIN, START + 30, saleKey, DEFAULT_RELAYS);
  await publishPaymentLink(link);
  let final: NostrEvent;
  if (owner) {
    const ownerSecret = deriveLinkOwner(team).secretKey;
    final = ownerFinalLinkEvent(
      ownerSecret,
      link.id,
      saleKey,
      payload,
      expiredFinal(link.id),
      START + 4 * 3600 + 3600
    );
    await publishLinkEvent(final, saleOwnerSecretKey(ownerSecret, saleKey), DEFAULT_RELAYS);
  } else {
    final = finalLinkEvent(link, link.event.created_at, expiredFinal(link.id), START + 4 * 3600);
    await publishLinkEvent(final, link.secretKey, DEFAULT_RELAYS);
  }
  const keys = deriveMemberKeys(memberSecret(team, MEMBER));
  await publishMemberRecord(
    keys,
    linkEvent(keys, {
      version: 1,
      link: link.id,
      saleKey: bytesToHex(saleKey),
      createdAt: START + 30,
      onchainTag: null,
      relays: [...DEFAULT_RELAYS],
      sealedKey: sealLinkKey(
        link.secretKey,
        sealed ? deriveRegistryReader(team).publicKey : randomNostrKeys().publicKey
      )
    }),
    DEFAULT_RELAYS
  );
  return { link, saleKey, final };
}

/** The events `relays` hold at `address` by `author`. */
function held(address: string, author: string): NostrEvent[][] {
  return DEFAULT_RELAYS.map((relay) =>
    (relays.stored.get(relay) ?? []).filter(
      (event) => event.pubkey === author && event.tags.some(([, value]) => value === address)
    )
  );
}

/** The value a link's record holds (opened with the sale's key). */
const valueOf = (event: NostrEvent, saleKey: Uint8Array) =>
  JSON.parse(nip44Decrypt(event.content, saleKey)).v;

/** The month as the relays alone tell it (no device's memory). */
async function monthOnRelays(team: TeamKeys, month: string) {
  const keys = deriveArchiveKeys(team);
  const answers = archiveOf(
    keys,
    await fetchArchiveAnswers(keys, {
      relays: DEFAULT_RELAYS,
      channel: "account",
      timeoutMs: 1000,
      authKey: keys.nostr.secretKey
    })
  );
  return archivedMonth(keys, month, answers.parts, answers.newer);
}

/** An account opened first at START (its sign-up), with Alice in its team. */
async function newAccount(): Promise<TeamKeys> {
  await openTestAccount({ usage: "merchant", signUp: "done" });
  const team = getAccountTeamKeys()!;
  await archiveDeclarations(() => START, true);
  await publishMember(team, alice);
  return team;
}

beforeEach(() => {
  closeAccount();
  fileSystem.resetFileSystem();
  secureStore.resetSecureStore();
  resetDeviceRelays();
  relays.resetRelays();
  sdk.resetFakeWallet();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(async () => {
  await declarationsCopied();
  await closeAccountWallet();
  jest.restoreAllMocks();
});

describe("a link's key sealed for the owner", () => {
  it("opens with the business's reading key only, and only as that link's key", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done" });
    const team = getAccountTeamKeys()!;
    const reader = deriveRegistryReader(team);
    const link = randomNostrKeys();
    const sealed = sealLinkKey(link.secretKey, reader.publicKey);
    expect(openLinkKey(sealed, reader, link.publicKey)).toEqual(link.secretKey);
    // Another link's author, another reading key, anything else: nothing.
    expect(openLinkKey(sealed, reader, randomNostrKeys().publicKey)).toBeNull();
    expect(openLinkKey(sealed, nostrKeys(new Uint8Array(32).fill(9)), link.publicKey)).toBeNull();
    expect(openLinkKey("not a payload", reader, link.publicKey)).toBeNull();
    // The key never shows in the record's clear text.
    expect(sealed).not.toContain(bytesToHex(link.secretKey));
  });

  it("goes in the link's record, under the links' own author, an older app's record left aside", async () => {
    const team = await newAccount();
    const { link } = await aliceLink(team);
    const keys = deriveMemberKeys(memberSecret(team, MEMBER));
    const [record] = (await fetchLinks(keys, 0, DEFAULT_RELAYS))!;
    expect(record?.link).toBe(link.id);
    expect(openLinkKey(record!.sealedKey, deriveRegistryReader(team), link.id)).toEqual(
      link.secretKey
    );
    // A link's record signed by the member's own key (an app from before): never read.
    await publishMemberRecord(
      keys,
      sealRecord({
        type: "team-link",
        value: { ...record, link: "c3".repeat(32) },
        signer: keys.nostr.secretKey,
        encryptionKey: keys.records.encryptionKey,
        address: "a".repeat(64),
        createdAt: START + 60
      }),
      DEFAULT_RELAYS
    );
    await expect(fetchLinks(keys, 0, DEFAULT_RELAYS)).resolves.toEqual([record]);
  });
});

describe("the links of the owner's copy of a month", () => {
  it("are copied with their key once the month is a year old, their final version signed again, the same", async () => {
    const team = await newAccount();
    const { link, saleKey, final } = await aliceLink(team);

    await expect(archiveDeclarations(() => LATER, true)).resolves.toMatchObject({
      copied: ["2026-10"],
      through: "2026-10"
    });

    const month = await monthOnRelays(team, "2026-10");
    expect(month.copied).toBe(true);
    expect([...month.links.values()]).toEqual([
      {
        link: link.id,
        saleKey: bytesToHex(saleKey),
        key: bytesToHex(link.secretKey),
        relays: [...DEFAULT_RELAYS]
      }
    ]);
    // Every relay holds the link's final version again, dated then, the same.
    for (const events of held(saleLinkAddress(saleKey), link.id)) {
      expect(events).toHaveLength(1);
      expect(events[0]!.created_at).toBe(LATER);
      expect(valueOf(events[0]!, saleKey)).toEqual(valueOf(final, saleKey));
    }
    // The payer's page takes it.
    const opened = await fetchPaymentLink(
      { kind: "sale", author: link.id, key: saleKey, relays: DEFAULT_RELAYS },
      "bc"
    );
    expect(opened).toMatchObject({
      status: "found",
      value: { kind: "sale", sale: { note: "Table 1", final: { status: "expired" } } }
    });
  });

  it("are signed again at each yearly refresh of the copy", async () => {
    const team = await newAccount();
    const { link, saleKey } = await aliceLink(team);
    await archiveDeclarations(() => LATER, true);
    const after = LATER + ARCHIVE_REFRESH_SECONDS + 86_400;

    await archiveDeclarations(() => after, true);

    for (const events of held(saleLinkAddress(saleKey), link.id)) {
      expect(events.map(({ created_at }) => created_at)).toEqual([after]);
    }
  });

  it("never hold the copy's yearly refresh back while their own relays give no majority", async () => {
    const team = await newAccount();
    const { link, saleKey } = await aliceLink(team);
    await archiveDeclarations(() => LATER, true);
    const after = LATER + ARCHIVE_REFRESH_SECONDS + 86_400;
    // The links' relays out of reach for their records alone (a list the account left, gone).
    const answer = relays.queryEvents;
    jest.spyOn(relays, "queryEvents").mockImplementation(async (url, filter, options) => {
      if (filter.authors?.includes(link.id) && DEFAULT_RELAYS.slice(0, 3).includes(url)) {
        throw new Error(`${url}: no answer in time`);
      }
      return answer(url, filter, options);
    });

    await archiveDeclarations(() => after, true);

    // The copy of the month, which decides its sales, signed again all the same.
    const keys = deriveArchiveKeys(team);
    const answers = archiveOf(
      keys,
      await fetchArchiveAnswers(keys, {
        relays: DEFAULT_RELAYS,
        channel: "account",
        timeoutMs: 1000,
        authKey: keys.nostr.secretKey
      })
    );
    expect(answers.parts.get(partAddress(keys, "2026-10", 0))?.event.created_at).toBe(after);
    // The link, read from too few of its relays, is not signed again.
    for (const events of held(saleLinkAddress(saleKey), link.id)) {
      expect(events.map(({ created_at }) => created_at)).toEqual([LATER]);
    }
  });

  it("sign the owner's final version again with the owner's key of its sale", async () => {
    const team = await newAccount();
    const { link, saleKey, final } = await aliceLink(team, { owner: true, sealed: false });
    const signer = saleOwnerPublicKey(deriveLinkOwner(team).publicKey, saleKey);
    expect(final.pubkey).toBe(signer);

    await archiveDeclarations(() => LATER, true);

    for (const events of held(ownerFinalAddress(link.id), signer)) {
      expect(events).toHaveLength(1);
      expect(events[0]!.created_at).toBe(LATER);
      expect(valueOf(events[0]!, saleKey)).toEqual(valueOf(final, saleKey));
    }
    // Without its key, the link itself is given again as it is, to a relay that lost it.
    const month = await monthOnRelays(team, "2026-10");
    expect(month.links.get(link.id)?.key).toBeNull();
    for (const events of held(saleLinkAddress(saleKey), link.id)) {
      expect(events.map(({ id }) => id)).toEqual([link.event.id]);
    }
  });

  it("are read and signed again as their own authors, where relays give an author's events to that author only", async () => {
    const team = await newAccount();
    const first = await aliceLink(team);
    const second = await aliceLink(team, { n: 2, owner: true });
    for (const relay of DEFAULT_RELAYS) {
      relays.authorReads.add(relay);
      relays.authorOnly.add(relay);
    }
    // The member's records: each author read as itself.
    const keys = deriveMemberKeys(memberSecret(team, MEMBER));
    const records = await fetchMemberRecords(keys, 0, DEFAULT_RELAYS);
    expect(records?.links.map(({ link }) => link).sort()).toEqual(
      [first.link.id, second.link.id].sort()
    );

    const archived = ({ link, saleKey }: typeof first) => ({
      link: link.id,
      saleKey: bytesToHex(saleKey),
      key: bytesToHex(link.secretKey),
      relays: [...DEFAULT_RELAYS]
    });
    // The first link's final version; the second link, and the owner's final version of it.
    await expect(refreshLinks(team, [archived(first), archived(second)], LATER)).resolves.toBe(3);
    const signer = saleOwnerPublicKey(deriveLinkOwner(team).publicKey, second.saleKey);
    for (const events of [
      ...held(saleLinkAddress(first.saleKey), first.link.id),
      ...held(saleLinkAddress(second.saleKey), second.link.id),
      ...held(ownerFinalAddress(second.link.id), signer)
    ]) {
      expect(events.map(({ created_at }) => created_at)).toEqual([LATER]);
    }
  });

  it("give a link without its key back, as it is, to a relay that lost it", async () => {
    const team = await newAccount();
    const { link, saleKey, final } = await aliceLink(team, { sealed: false });
    const lost = DEFAULT_RELAYS[4]!;
    relays.stored.set(
      lost,
      (relays.stored.get(lost) ?? []).filter((event) => event.id !== final.id)
    );

    await archiveDeclarations(() => LATER, true);

    for (const events of held(saleLinkAddress(saleKey), link.id)) {
      expect(events.map(({ id }) => id)).toEqual([final.id]);
    }
  });

  it("sign again or give again only what was asked, whatever else a relay sends", async () => {
    const team = await newAccount();
    const { link, saleKey } = await aliceLink(team);
    // Signed by the link's key, at an address the refresh did not ask for.
    const elsewhere = signEvent(
      { kind: PAYMENT_LINK_KIND, created_at: START, tags: [["d", "elsewhere"]], content: "" },
      link.secretKey
    );
    const answer = relays.queryEvents;
    jest
      .spyOn(relays, "queryEvents")
      .mockImplementation(async (url, filter, options) => [
        ...(await answer(url, filter, options)),
        elsewhere
      ]);
    const archived = {
      link: link.id,
      saleKey: bytesToHex(saleKey),
      key: bytesToHex(link.secretKey),
      relays: [...DEFAULT_RELAYS]
    };

    // The link's final version only.
    await expect(refreshLinks(team, [archived], LATER)).resolves.toBe(1);
    expect(held("elsewhere", link.id).flat()).toEqual([]);
  });

  it("never sign a link again over its final version, read from fewer than a majority", async () => {
    const team = await newAccount();
    const { link, saleKey, final } = await aliceLink(team);
    // The final version only on a, b and c: d and e lost it, and hold the link.
    for (const relay of DEFAULT_RELAYS.slice(3)) {
      relays.stored.set(relay, [
        ...(relays.stored.get(relay) ?? []).filter((event) => event.id !== final.id),
        link.event
      ]);
    }
    const archived = {
      link: link.id,
      saleKey: bytesToHex(saleKey),
      key: bytesToHex(link.secretKey),
      relays: [...DEFAULT_RELAYS]
    };
    // a, b and c out of reach: d and e alone answer, with the link only. Nothing is signed again.
    for (const relay of DEFAULT_RELAYS.slice(0, 3)) relays.unreachable.add(relay);
    await expect(refreshLinks(team, [archived], LATER)).resolves.toBeNull();
    for (const events of held(saleLinkAddress(saleKey), link.id).slice(3)) {
      expect(events.map(({ id }) => id)).toEqual([link.event.id]);
    }
    // c answers again: a majority, the final version among its answers, signed again over the link.
    relays.unreachable.delete(DEFAULT_RELAYS[2]!);
    await expect(refreshLinks(team, [archived], LATER)).resolves.toBe(1);
    for (const events of held(saleLinkAddress(saleKey), link.id).slice(2)) {
      expect(events).toHaveLength(1);
      expect(events[0]!.created_at).toBe(LATER);
      expect(valueOf(events[0]!, saleKey)).toEqual(valueOf(final, saleKey));
    }
  });

  it("are left for a later round while a majority of the relays does not give the records", async () => {
    const team = await newAccount();
    await aliceLink(team);
    // The roster and the copies read first, then the records out of reach on three relays.
    const answer = relays.queryEvents;
    jest.spyOn(relays, "queryEvents").mockImplementation(async (url, filter, options) => {
      const keys = deriveMemberKeys(memberSecret(team, MEMBER));
      if (
        filter.authors?.includes(keys.links.publicKey) &&
        DEFAULT_RELAYS.slice(0, 3).includes(url)
      ) {
        throw new Error(`${url}: no answer in time`);
      }
      return answer(url, filter, options);
    });

    await expect(archiveDeclarations(() => LATER, true)).resolves.toMatchObject({
      copied: [],
      // Every month since the state's: none can be told without its links.
      left: expect.arrayContaining(["2025-10", "2026-10"]),
      through: "2025-09"
    });
    expect((await monthOnRelays(team, "2026-10")).copied).toBe(false);
  });

  it("are left for a later round while a majority of the relays stops answering mid-read", async () => {
    const team = await newAccount();
    await aliceLink(team);
    // Three of five relays answer the first page of each month's records only.
    const answer = relays.queryEvents;
    const pages = new Map<string, number>();
    jest.spyOn(relays, "queryEvents").mockImplementation(async (url, filter, options) => {
      const keys = deriveMemberKeys(memberSecret(team, MEMBER));
      if (
        filter.authors?.includes(keys.links.publicKey) &&
        DEFAULT_RELAYS.slice(0, 3).includes(url)
      ) {
        const read = `${url}:${filter.since}`;
        pages.set(read, (pages.get(read) ?? 0) + 1);
        if (pages.get(read)! > 1) throw new Error(`${url}: no answer in time`);
      }
      return answer(url, filter, options);
    });

    // The months without a link are read whole: only October 2026 waits.
    await expect(archiveDeclarations(() => LATER, true)).resolves.toMatchObject({
      copied: [],
      left: ["2026-10"],
      through: "2026-09"
    });
    expect((await monthOnRelays(team, "2026-10")).copied).toBe(false);

    jest.restoreAllMocks();
    await expect(archiveDeclarations(() => LATER, true)).resolves.toMatchObject({
      copied: ["2026-10"]
    });
  });

  it("never copy a month without payments nor links", async () => {
    const team = await newAccount();
    await expect(archiveDeclarations(() => LATER, true)).resolves.toMatchObject({
      copied: [],
      left: [],
      through: "2026-10"
    });
    expect((await monthOnRelays(team, "2026-10")).copied).toBe(false);
  });
});
