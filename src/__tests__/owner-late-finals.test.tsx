import { bytesToHex } from "@noble/hashes/utils.js";
import { act, render, renderHook, waitFor } from "@testing-library/react-native";

import { DEFAULT_RELAYS } from "@/config/relays";
import { closeAccount, getAccountTeamKeys } from "@/features/account/session";
import { closeAccountWallet } from "@/features/account/wallet-access";
import { askOwnerFinals, resetOwnerFinalsAsks } from "@/features/payment-link/finals-wake";
import { OwnerLinksFinalizer } from "@/features/payment-link/OwnerLinksFinalizer";
import {
  OWNER_FINALS_LOOKBACK_SECONDS,
  findOwnerFinalJobs,
  linkHolders,
  walletProof
} from "@/features/payment-link/owner-finals";
import type { SettleResult } from "@/features/payment-link/SaleSettler";
import { resetDeviceRelays } from "@/features/relays/device-relays";
import { declarationsCopied, type Received } from "@/features/settings/declarations-copy";
import {
  EXPIRY_GRACE_SECONDS,
  useInvoicesWatch,
  type InvoiceProof
} from "@/features/terminal/invoice";
import { isWalletConnected } from "@/lib/breez/wallet";
import { decodeBolt11 } from "@/lib/lightning/bolt11";
import * as lnurl from "@/lib/lightning/lnurl";
import type { Invoice } from "@/lib/lightning/lnurl";
import { createPaymentLink, publishPaymentLink } from "@/lib/payment-link/link";
import type { PaymentLinkPayload } from "@/lib/payment-link/payload";
import { nowUnix } from "@/lib/rates/snapshot";
import { declareInvoice, saleRegistry } from "@/lib/registry/registry";
import {
  deriveBusinessRegistry,
  deriveLinkOwner,
  deriveMemberKeys,
  deriveRegistryKey,
  deriveRegistryReader,
  memberSecret,
  type TeamKeys
} from "@/lib/team/keys";
import { linkEvent, publishMemberRecord } from "@/lib/team/member-records";
import type { TeamMember } from "@/lib/team/roster";

import { TEST_WALLET_ID, openTestAccount } from "../../jest/account";
import type * as BreezFake from "../../jest/breez-sdk";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as SecureStoreFake from "../../jest/expo-secure-store";
import { makeInvoice, metadataHash, preimagePair } from "../../jest/lightning";
import type * as RelaysFake from "../../jest/nostr-relays";
import { publishMember } from "../../jest/roster";

/*
 * The owner's final versions of links a device never finalized, up to a year after their sale
 * (owner-finals.ts, OwnerLinksFinalizer.tsx): their records read by the
 * links' own author, their payments told by the owner's wallet, never by the LNURL server alone.
 */

jest.mock("../lib/breez/config", () => ({
  ...jest.requireActual("../lib/breez/config"),
  getWalletConfig: () => ({ network: "mainnet", apiKey: "test-api-key" }),
  // Mainnet: invoices of "bc" (the app config has no network under Jest).
  getBreezNetwork: () => "mainnet"
}));

/** What each SaleSettler the finalizer renders was given, and what its proof told. */
const mockFollowed: { saleKey: string; told: Awaited<ReturnType<InvoiceProof>> | null }[] = [];
/** The invoice each followed sale is told about. */
const mockInvoices = new Map<string, Invoice>();
/** Sales whose follow does not end until released (mockRelease): a round still running. */
const mockHeld = new Set<string>();
const mockRelease = new Map<string, () => void>();

jest.mock("../features/payment-link/SaleSettler", () => {
  const { useEffect, useRef } = jest.requireActual<typeof import("react")>("react");
  const { bytesToHex: hex } =
    jest.requireActual<typeof import("@noble/hashes/utils.js")>("@noble/hashes/utils.js");
  return {
    SaleSettler: (props: {
      saleKey: Uint8Array;
      proof?: InvoiceProof | null;
      onDone: (result: SettleResult) => void;
    }) => {
      // As SaleSettler: one follow per mount (the finalizer keys it by link), reported once to the
      // latest `onDone`, whatever renders its parent makes meanwhile.
      const latest = useRef(props);
      useEffect(() => {
        latest.current = props;
      });
      useEffect(() => {
        void (async () => {
          const { saleKey: key, proof } = latest.current;
          const saleKey = hex(key);
          const invoice = mockInvoices.get(saleKey);
          const told = proof && invoice ? await proof(invoice) : null;
          mockFollowed.push({ saleKey, told });
          if (mockHeld.has(saleKey)) {
            await new Promise<void>((resolve) => mockRelease.set(saleKey, resolve));
          }
          latest.current.onDone({ kind: "pending", phase: "checking" });
        })();
      }, []);
      return null;
    }
  };
});

const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const sdk = jest.requireMock<typeof BreezFake>("@breeztech/breez-sdk-spark-react-native");
const secureStore = jest.requireMock<typeof SecureStoreFake>("expo-secure-store");
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");

jest.setTimeout(30_000);

const ADDRESS = "sattleme02c6047f94@breez.tips";
const METADATA = `[["text/plain","Fine Bakery"],["text/identifier","${ADDRESS}"]]`;
const ORIGIN = "https://web.example";
const FIAT = { minor: 2450, digits: 2, currency: "CHF" };
const MEMBER = "0123456789abcdef0123456789abcdef";
const DAY = 86_400;

function invoice(n: number, at: number): Invoice {
  const { paymentHash } = preimagePair(n);
  const pr = makeInvoice({
    amountMsat: 49_000_000n,
    paymentHash,
    descriptionHash: metadataHash(METADATA),
    timestamp: at,
    expirySeconds: 600
  });
  return { pr, decoded: decodeBolt11(pr)!, verifyUrl: `https://breez.tips/verify/${paymentHash}` };
}

/**
 * A link Alice's device made `ago` seconds ago, then never finalized (the device never came back):
 * its invoice declared, the link published, its record under the links' author.
 */
async function forgottenLink(team: TeamKeys, ago: number, n = 1) {
  const start = nowUnix() - ago;
  const saleKey = new Uint8Array(32).fill(n);
  const shown = invoice(n, start);
  const business = deriveBusinessRegistry(team);
  await declareInvoice(saleRegistry(business, saleKey), shown, { fiat: FIAT, note: "Table 4" });
  const payload: PaymentLinkPayload = {
    version: 3,
    businessName: "Fine Bakery",
    lightningAddress: ADDRESS,
    fiat: FIAT,
    note: "Table 4",
    onchainAddress: null,
    endsAt: start + 600,
    registryKey: bytesToHex(deriveRegistryKey(team)),
    registryReader: deriveRegistryReader(team).publicKey,
    owner: deriveLinkOwner(team).publicKey
  };
  const link = createPaymentLink(payload, ORIGIN, start + 30, saleKey);
  await publishPaymentLink(link);
  const keys = deriveMemberKeys(memberSecret(team, MEMBER));
  await publishMemberRecord(
    keys,
    linkEvent(keys, {
      version: 1,
      link: link.id,
      saleKey: bytesToHex(saleKey),
      createdAt: start + 30,
      onchainTag: null,
      relays: [...DEFAULT_RELAYS],
      sealedKey: "A".repeat(200)
    }),
    DEFAULT_RELAYS
  );
  mockInvoices.set(bytesToHex(saleKey), shown);
  return { link, shown, saleKey, start };
}

/** A payment the fake wallet received, shaped as the bindings give it. */
function received(hash: string, at: number, preimage?: string): Record<string, unknown> {
  return {
    id: `p-${hash.slice(0, 8)}`,
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
        htlcDetails: { paymentHash: hash, preimage }
      }
    }
  };
}

async function ownerWithAlice(): Promise<TeamKeys> {
  await openTestAccount({ usage: "merchant", signUp: "done" });
  const team = getAccountTeamKeys()!;
  const alice: TeamMember = {
    id: MEMBER,
    name: "Alice",
    role: "employee",
    invitedAt: nowUnix() - 400 * DAY
  };
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
  sdk.connect.mockClear();
  mockFollowed.length = 0;
  mockInvoices.clear();
  mockHeld.clear();
  mockRelease.clear();
  resetOwnerFinalsAsks();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(async () => {
  await declarationsCopied();
  await closeAccountWallet();
  jest.restoreAllMocks();
});

describe("the owner's wallet as the proof of a payment", () => {
  const { preimage, paymentHash } = preimagePair(1);
  const shown = invoice(1, 1_790_000_000);
  const payment = (extra: Partial<Received> = {}): Received => ({
    hash: paymentHash,
    at: 1_790_000_100,
    completed: true,
    preimage,
    ...extra
  });
  const noLud21 = async () => null;

  it("tells a payment received, with its preimage and the wallet's date", async () => {
    await expect(walletProof([payment()], noLud21)(shown)).resolves.toEqual({
      status: "paid",
      preimage,
      paidAt: new Date(1_790_000_100 * 1000)
    });
  });

  it("tells an invoice the wallet never received as unpaid", async () => {
    await expect(walletProof([], noLud21)(shown)).resolves.toEqual({ status: "unpaid" });
  });

  it("proves nothing from a payment not completed, or without a preimage of its hash", async () => {
    await expect(walletProof([payment({ completed: false })], noLud21)(shown)).resolves.toEqual({
      status: "unknown"
    });
    await expect(
      walletProof([payment({ preimage: "02".repeat(32) })], noLud21)(shown)
    ).resolves.toEqual({ status: "unknown" });
    // Without the wallet's preimage, LUD-21's: still checked against the hash.
    await expect(
      walletProof([payment({ preimage: null })], async () => preimage)(shown)
    ).resolves.toMatchObject({ status: "paid", preimage });
    await expect(
      walletProof([payment({ preimage: null })], async () => "03".repeat(32))(shown)
    ).resolves.toEqual({ status: "unknown" });
  });

  it("replaces LUD-21 in the invoices' watch: paid, or expired past its grace", async () => {
    const lud21 = jest.spyOn(lnurl, "paidPreimage");
    const end = nowUnix() - EXPIRY_GRACE_SECONDS - 10;
    const entry = { id: "a", invoice: shown, expiresAt: end, since: end - 600, immediate: true };
    const paid = await renderHook(() =>
      useInvoicesWatch([entry], true, walletProof([payment()], noLud21))
    );
    await waitFor(() => expect(paid.result.current.get("a")?.preimage).toBe(preimage));
    await paid.unmount();
    const unpaid = await renderHook(() =>
      useInvoicesWatch([entry], true, walletProof([], noLud21))
    );
    await waitFor(() =>
      expect(unpaid.result.current.get("a")).toEqual({ paidAt: null, expired: true })
    );
    await unpaid.unmount();
    expect(lud21).not.toHaveBeenCalled();
  });

  it("keeps an invoice open within its grace, whatever the wallet holds", async () => {
    const end = nowUnix() + 60;
    const entry = { id: "a", invoice: shown, expiresAt: end, since: end - 600, immediate: true };
    const proof = jest.fn(walletProof([], noLud21));
    const watch = await renderHook(() => useInvoicesWatch([entry], true, proof));
    await waitFor(() => expect(proof).toHaveBeenCalled());
    await act(async () => undefined);
    // Checked, open: neither paid nor expired.
    expect(watch.result.current.get("a")).toEqual({ paidAt: null, expired: false });
    await watch.unmount();
  });

  it("tells nothing of an invoice before a check of it ended, then open even when it failed", async () => {
    const end = nowUnix() + 60;
    const entry = { id: "a", invoice: shown, expiresAt: end, since: end - 600, immediate: true };
    let fail: (error: Error) => void = () => undefined;
    const proof = jest.fn(
      () =>
        new Promise<Awaited<ReturnType<InvoiceProof>>>((_, reject) => {
          fail = reject;
        })
    );
    const watch = await renderHook(() => useInvoicesWatch([entry], true, proof));
    await waitFor(() => expect(proof).toHaveBeenCalled());
    await act(async () => undefined);
    expect(watch.result.current.get("a")).toBeUndefined();
    await act(async () => fail(new Error("Network failed")));
    expect(watch.result.current.get("a")).toEqual({ paidAt: null, expired: false });
    await watch.unmount();
  });
});

describe("the owner's final versions, a year after the sale", () => {
  it("find a link a device never finalized up to a year later, never past it", async () => {
    const team = await ownerWithAlice();
    const holders = linkHolders(
      team,
      [{ id: MEMBER, name: "Alice", role: "employee", invitedAt: 0 }],
      []
    );
    const { link, start } = await forgottenLink(team, 200 * DAY);
    await expect(findOwnerFinalJobs(team, holders, ADDRESS)).resolves.toEqual([
      expect.objectContaining({ id: link.id })
    ]);
    // Past the year: its record is no longer read.
    await expect(
      findOwnerFinalJobs(team, holders, ADDRESS, start + 30 + OWNER_FINALS_LOOKBACK_SECONDS + 1)
    ).resolves.toEqual([]);
  });

  it("read the links' records by their own author, never a year of the employee's sales", async () => {
    const team = await ownerWithAlice();
    const holders = linkHolders(
      team,
      [{ id: MEMBER, name: "Alice", role: "employee", invitedAt: 0 }],
      []
    );
    await forgottenLink(team, 200 * DAY);
    const keys = deriveMemberKeys(memberSecret(team, MEMBER));
    relays.calls.length = 0;
    await findOwnerFinalJobs(team, holders, ADDRESS);
    const authors = relays.calls.flatMap((call) =>
      call.operation === "query" ? (call.filter?.authors ?? []) : []
    );
    expect(authors).toContain(keys.links.publicKey);
    expect(authors).not.toContain(keys.nostr.publicKey);
  });

  it("connect the wallet only when a link waits, and tell its payment by the wallet", async () => {
    const team = await ownerWithAlice();
    const paid = await forgottenLink(team, 200 * DAY, 1);
    const unpaid = await forgottenLink(team, 150 * DAY, 2);
    const { preimage } = preimagePair(1);
    sdk.fakeWallet.payments = [received(paid.shown.decoded.paymentHash, paid.start + 60, preimage)];

    await render(<OwnerLinksFinalizer walletId={TEST_WALLET_ID} lightningAddress={ADDRESS} />);

    await waitFor(() => expect(mockFollowed).toHaveLength(2));
    expect(mockFollowed).toEqual(
      expect.arrayContaining([
        {
          saleKey: bytesToHex(paid.saleKey),
          told: { status: "paid", preimage, paidAt: new Date((paid.start + 60) * 1000) }
        },
        { saleKey: bytesToHex(unpaid.saleKey), told: { status: "unpaid" } }
      ])
    );
    // Connected once, for the round, then disconnected.
    expect(sdk.connect).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(isWalletConnected()).toBe(false));
  });

  it('settle a link at once when "Wallet" asks, not at the next round 6 hours later', async () => {
    const team = await ownerWithAlice();
    const first = await forgottenLink(team, 200 * DAY, 1);
    await render(<OwnerLinksFinalizer walletId={TEST_WALLET_ID} lightningAddress={ADDRESS} />);
    await waitFor(() => expect(mockFollowed).toHaveLength(1));

    // A link paid while the account stays open (an assistant's invoice): the list shows it
    // "Confirming" and asks (finals-wake.ts).
    const paid = await forgottenLink(team, 150 * DAY, 2);
    const { preimage } = preimagePair(2);
    sdk.fakeWallet.payments = [received(paid.shown.decoded.paymentHash, paid.start + 60, preimage)];
    await act(async () => {
      askOwnerFinals([paid.link.id]);
    });
    await waitFor(() =>
      expect(mockFollowed).toContainEqual({
        saleKey: bytesToHex(paid.saleKey),
        told: { status: "paid", preimage, paidAt: new Date((paid.start + 60) * 1000) }
      })
    );
    // The first link, still without its final version, is followed again in the same round.
    expect(
      mockFollowed.filter(({ saleKey }) => saleKey === bytesToHex(first.saleKey))
    ).toHaveLength(2);
  });

  it("follow a link asked for while a round still runs, once that round's links are through", async () => {
    const team = await ownerWithAlice();
    const first = await forgottenLink(team, 200 * DAY, 1);
    mockHeld.add(bytesToHex(first.saleKey));
    await render(<OwnerLinksFinalizer walletId={TEST_WALLET_ID} lightningAddress={ADDRESS} />);
    await waitFor(() => expect(mockRelease.has(bytesToHex(first.saleKey))).toBe(true));

    const paid = await forgottenLink(team, 150 * DAY, 2);
    await act(async () => {
      askOwnerFinals([paid.link.id]);
      // The asked round's reads (records, links, the wallet) end while the first sale is followed.
      await new Promise((resolve) => setTimeout(resolve, 500));
    });
    // One sale at a time: the first one's follow is not cut short.
    expect(mockFollowed.map(({ saleKey }) => saleKey)).toEqual([bytesToHex(first.saleKey)]);

    mockHeld.clear();
    await act(async () => {
      mockRelease.get(bytesToHex(first.saleKey))!();
    });
    await waitFor(() =>
      expect(mockFollowed.map(({ saleKey }) => saleKey)).toContain(bytesToHex(paid.saleKey))
    );
  });

  it("never connect the wallet while no link waits", async () => {
    await ownerWithAlice();
    await render(<OwnerLinksFinalizer walletId={TEST_WALLET_ID} lightningAddress={ADDRESS} />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });
    expect(mockFollowed).toEqual([]);
    expect(sdk.connect).not.toHaveBeenCalled();
  });
});
