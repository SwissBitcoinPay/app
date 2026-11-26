import "@/i18n";

import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { Slot } from "expo-router";
import { act, fireEvent, renderRouter, screen, waitFor, within } from "expo-router/testing-library";
import { Linking, StyleSheet } from "react-native";

import LaunchScreen from "@/app/index";
import PaymentLinkScreen, { COPIED_MS } from "@/app/pay";
import ChargeScreen from "@/app/(app)/pos/charge";
import AmountScreen from "@/app/(app)/pos/index";
import AppLayout from "@/app/(app)/_layout";
import PosLayout from "@/app/(app)/pos/_layout";
import { DEFAULT_RELAYS as PAYMENT_LINK_RELAYS } from "@/config/relays";
import { ThemeProvider } from "@/features/appearance/ThemeProvider";
import { parseThemePreference, THEME_KEY } from "@/features/appearance/theme-format";
import { LINK_FIRST_CHECK_TIMEOUT_MS } from "@/features/payment-link/useSharedInvoice";
import { EXPIRY_GRACE_SECONDS, resetPayRequests } from "@/features/terminal/invoice";
import { DECLARATIONS_INTERVAL_MS } from "@/features/terminal/useSale";
import { bytesToBase64Url } from "@/lib/base64";
import { decodeBolt11 } from "@/lib/lightning/bolt11";
import { formatDate } from "@/lib/locale/date";
import type { Invoice } from "@/lib/lightning/lnurl";
import { copyText, openUri } from "@/lib/payment-link/device";
import { darkColors, lightColors, motion } from "@/theme";
import {
  createPaymentLink,
  finalLinkEvent,
  ownerFinalLinkEvent,
  publishLinkEvent,
  publishPaymentLink,
  type PaymentLink
} from "@/lib/payment-link/link";
import type { FinalPayload } from "@/lib/payment-link/final";
import { saleOwnerSecretKey } from "@/lib/payment-link/owner-key";
import { SALE_ACCEPTANCE_POLL_MS } from "@/features/terminal/useSaleAcceptance";
import { deriveKey } from "@/lib/nostr/keys";
import { publishToRelays } from "@/lib/nostr/pool";
import { sealRecord } from "@/lib/nostr/record";
import {
  publishSaleAcceptance,
  saleAcceptanceAddress,
  saleAcceptanceEvent
} from "@/lib/registry/sale-acceptance";
import type { PaymentLinkPayload } from "@/lib/payment-link/payload";
import {
  declareInvoice,
  fetchDeclaredInvoices,
  ownerDeclarations,
  saleRegistry,
  type DeclaredSale,
  type Registry
} from "@/lib/registry/registry";
import { encodeWalletSecret } from "@/lib/breez/secret";
import { deriveRegistryReader, deriveTeamKeys } from "@/lib/team/keys";
import { loadTerminalProfile, saveTerminalProfile } from "@/lib/terminal/profile";

import { taprootAddress } from "../../jest/bitcoin";
import { makeInvoice, metadataHash, preimagePair } from "../../jest/lightning";
import type * as MempoolFake from "../../jest/mempool";
import type * as RelaysFake from "../../jest/nostr-relays";
import { MEMPOOL_API_URL } from "../config/onchain";

jest.mock("../lib/breez/config", () => ({
  ...jest.requireActual("../lib/breez/config"),
  getBreezNetwork: () => "mainnet"
}));
// The browser's clipboard and wallet handoff.
jest.mock("../lib/payment-link/device", () => ({
  canCopyText: () => true,
  copyText: jest.fn(async () => undefined),
  openUri: jest.fn(async () => undefined),
  shareUrl: jest.fn()
}));

// The point of each hour (src/lib/rates/ is tested on its own): 50 000 CHF per bitcoin unless a
// test sets another. A point prices from 5 minutes after its hour, for an hour (pointHourOf).
const mockPoints = new Map<number, number>();
const mockPointOf = (hour: number) => mockPoints.get(hour) ?? 50000;
/** CoinGecko does not answer. */
let mockPointsDown = false;
const mockSources = () =>
  jest.requireActual<typeof import("../lib/rates/sources")>("../lib/rates/sources");
// The app's clock, corrected by the invoices' dates (src/lib/clock.ts), as the real useRate reads it.
const mockClock = () => jest.requireActual<typeof import("../lib/clock")>("../lib/clock");
const mockHourNow = () => mockSources().pointHourOf(mockClock().nowUnix());
const mockRateReads = jest.fn<void, [string | null]>();
jest.mock("../features/terminal/useRate", () => {
  /* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories are synchronous */
  const { useEffect, useState } = require("react") as typeof import("react");
  /* eslint-enable @typescript-eslint/no-require-imports */
  return {
    // The point that prices the present, on the test's clock: read again when its period ends.
    useRate: (currency: string | null) => {
      mockRateReads(currency);
      const [, setTick] = useState(0);
      const hour = mockHourNow();
      useEffect(() => {
        const timer = setTimeout(
          () => setTick((tick) => tick + 1),
          (mockSources().pointEnd(hour) - mockClock().nowUnix()) * 1000
        );
        return () => clearTimeout(timer);
      }, [hour]);
      // Read again when the clock is corrected, as the real useRate.
      useEffect(() => mockClock().subscribeClock(() => setTick((tick) => tick + 1)), []);
      const known = currency !== null && !mockPointsDown;
      return {
        rate: known ? mockPointOf(hour) : undefined,
        hour: known ? hour : undefined,
        loading: false,
        current: () => (known ? mockPointOf(mockHourNow()) : undefined)
      };
    }
  };
});
// The points of past hours, for the payments made then and the hours since.
jest.mock("../lib/rates/sources", () => ({
  ...jest.requireActual("../lib/rates/sources"),
  fetchHourPoint: async (_currency: string, hour: number) => {
    if (mockPointsDown) throw new Error("CoinGecko: HTTP 429");
    return mockPointOf(hour);
  },
  fetchHourPoints: async (_currency: string, from: number, to: number) => {
    if (mockPointsDown) throw new Error("CoinGecko: HTTP 429");
    const points = new Map<number, number>();
    for (let hour = from; hour <= to; hour += 3600) points.set(hour, mockPointOf(hour));
    return points;
  }
}));

/**
 * 13:10:30 UTC, priced by the point of 13:00 until 14:05 (54 min 30 s left). Every test starts
 * then, unless it says otherwise.
 */
const START = Date.UTC(2026, 9, 3, 13, 10, 30);
/** The next hour: its point prices from 14:05 (PERIOD_END). */
const HOUR_END = Date.UTC(2026, 9, 3, 14) / 1000;
const PERIOD_END = HOUR_END + 300;

/** The test's clock, at `time`: renderRouter keeps it (fake timers). */
function setClock(time: number) {
  jest.useFakeTimers();
  jest.setSystemTime(time);
}

/** The fragment of the link the next `openLink` opens. */
let fragment = "";

// The code's content, readable: the plate draws it as squares.
jest.mock("@/components/ui/QrPlate", () => {
  /* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories are synchronous */
  const { createElement } = require("react") as typeof import("react");
  const { Text } = require("react-native") as typeof import("react-native");
  /* eslint-enable @typescript-eslint/no-require-imports */
  return {
    QrPlate: ({ value }: { value: string }) => createElement(Text, { testID: "qr-value" }, value)
  };
});

// The in-memory relays and chain of jest.setup.ts.
const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const mempool = jest.requireMock<typeof MempoolFake>("../lib/onchain/esplora");

const ORIGIN = "https://web.example";
const ADDRESS = "sattleme02c6047f94@breez.tips";

const routes = {
  index: LaunchScreen,
  "(app)/_layout": AppLayout,
  "(app)/pos/_layout": PosLayout,
  "(app)/pos/index": AmountScreen,
  "(app)/pos/charge": ChargeScreen,
  pay: PaymentLinkScreen
};

/** Invoices the LNURL server marked as paid, by payment hash. */
const settled = new Set<string>();
/** Invoices the page asked the LNURL server for, in order. */
const asked: URL[] = [];
/** The preimages of the invoices the LNURL server made, by payment hash. */
const preimages = new Map<string, string>();
/** The invoices the LNURL server made, by payment hash: its verify answers name them (`pr`). */
const made = new Map<string, string>();
/** The LNURL server refuses to make invoices, with this reason. */
let refusal: string | null = null;
/** How late its verify endpoint answers (ms of the test's clock): a slow network. */
let verifyDelayMs = 0;
/** How late its pay request answers (ms of the test's clock): a slow network. */
let payRequestDelayMs = 0;
/** The most its pay request accepts (msat). */
let maxSendableMsat = 4_000_000_000;

const METADATA = `[["text/plain","Fine Bakery"],["text/identifier","${ADDRESS}"]]`;

/**
 * The Breez LNURL server of the link's Lightning address, over a fake fetch: its parameters, the
 * invoices the page asks (the n-th made with preimage pair 100 + n), and its verify endpoint.
 */
function verifyService() {
  asked.length = 0;
  preimages.clear();
  made.clear();
  refusal = null;
  verifyDelayMs = 0;
  payRequestDelayMs = 0;
  maxSendableMsat = 4_000_000_000;
  jest.mocked(globalThis.fetch).mockImplementation(async (input) => {
    const url = new URL(String(input));
    const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
    if (url.pathname === "/.well-known/lnurlp/sattleme02c6047f94") {
      if (payRequestDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, payRequestDelayMs));
      }
      return json({
        tag: "payRequest",
        callback: "https://breez.tips/lnurlp/sattleme02c6047f94/invoice",
        minSendable: 1000,
        maxSendable: maxSendableMsat,
        metadata: METADATA,
        commentAllowed: 255
      });
    }
    if (url.pathname === "/lnurlp/sattleme02c6047f94/invoice") {
      if (refusal !== null) return json({ status: "ERROR", reason: refusal });
      const { preimage, paymentHash } = preimagePair(100 + asked.length);
      asked.push(url);
      preimages.set(paymentHash, preimage);
      const pr = makeInvoice({
        amountMsat: BigInt(url.searchParams.get("amount")!),
        paymentHash,
        descriptionHash: metadataHash(METADATA),
        timestamp: Math.floor(Date.now() / 1000),
        expirySeconds: Number(url.searchParams.get("expiry"))
      });
      made.set(paymentHash, pr);
      return json({ pr, verify: `https://breez.tips/lnurlpay/verify/${paymentHash}` });
    }
    if (!url.pathname.startsWith("/lnurlpay/verify/")) throw new TypeError("Network failed");
    if (verifyDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, verifyDelayMs));
    const hash = url.pathname.slice("/lnurlpay/verify/".length);
    const preimage = settled.has(hash) ? (preimages.get(hash) ?? null) : null;
    return json({ status: "OK", settled: preimage !== null, preimage, pr: made.get(hash) });
  });
}

/** The payment hash of the `n`-th invoice the page asked (from 0). */
const pageHash = (n = 0) => preimagePair(100 + n).paymentHash;

const ONCHAIN = taprootAddress(5);
const REGISTRY_KEY = "ab".repeat(32);
/** What declarations made by the tests themselves say of their sale. */
const DECLARED: DeclaredSale = { fiat: { minor: 2450, digits: 2, currency: "CHF" }, note: "" };
/** The business's reading key (deriveRegistryReader): any, the tests never read as the owner. */
const REGISTRY_READER = "52d64e4fbc5670d62bad80c169aac897172117ce88c4978506f0c7dd9675ff18";
/** The business's link owner key (deriveLinkOwner): its secret signs the owner's final versions. */
const OWNER_SECRET = new Uint8Array(32).fill(11);
const LINK_OWNER = bytesToHex(schnorr.getPublicKey(OWNER_SECRET));
/** The business's registry, as the point of sale holds it. */
const BUSINESS = { key: hexToBytes(REGISTRY_KEY), reader: REGISTRY_READER, owner: LINK_OWNER };

/**
 * A link of a 24.50 CHF sale (49 000 sats at 50 000 CHF/BTC) that ends in `endsIn` seconds (in the
 * past when negative); Lightning only unless it has an on-chain address.
 */
function newLink(
  onchainAddress: string | null = null,
  endsIn = 600,
  extra: Partial<PaymentLinkPayload> = {}
) {
  const endsAt = Math.floor(Date.now() / 1000) + endsIn;
  const payload: PaymentLinkPayload = {
    version: 3,
    businessName: "Fine Bakery",
    lightningAddress: ADDRESS,
    fiat: { minor: 2450, digits: 2, currency: "CHF" },
    note: "Table 4",
    onchainAddress,
    endsAt,
    registryKey: REGISTRY_KEY,
    registryReader: REGISTRY_READER,
    owner: LINK_OWNER,
    ...extra
  };
  const link = createPaymentLink(payload, ORIGIN);
  fragment = link.url.slice(link.url.indexOf("#"));
  return { link, payload };
}

/** The sale's registry, as the point of sale and the page derive it from the link's key. */
function registryOf(link: PaymentLink): Registry {
  return saleRegistry(BUSINESS, link.key);
}

/**
 * An invoice of the merchant's Lightning address made `age` seconds ago, as the point of sale asks
 * it (preimage pair `n`).
 */
function posInvoice(n: number, age = 0, expirySeconds = 600): Invoice {
  const { paymentHash, preimage } = preimagePair(n);
  preimages.set(paymentHash, preimage);
  const pr = makeInvoice({
    amountMsat: 49_000_000n,
    paymentHash,
    descriptionHash: metadataHash(METADATA),
    timestamp: Math.floor(Date.now() / 1000) - age,
    expirySeconds
  });
  made.set(paymentHash, pr);
  return {
    pr,
    decoded: decodeBolt11(pr)!,
    verifyUrl: `https://breez.tips/lnurlpay/verify/${paymentHash}`
  };
}

/** `seconds` (Unix) as the payment's details write when the request was made (en-CH, jest.setup). */
const createdOn = (seconds: number) =>
  formatDate(new Date(seconds * 1000), "en-CH", { dateStyle: "short", timeStyle: "short" });

/**
 * The accessible name of a transaction's link (TxLink), its id cut to 6 + 6 characters, on
 * `explorer`'s page (the merchant's node's host when the link names it).
 */
const txLinkLabel = (txid: string, explorer = "mempool.space") =>
  `View transaction ${txid.slice(0, 6)}…${txid.slice(-6)} on ${explorer}`;

/** The Lightning invoice in the code shown. */
function shownInvoice(): string {
  const code = String(screen.getByTestId("qr-value").props.children);
  return code.startsWith("lightning:")
    ? code.slice("lightning:".length)
    : code.split("lightning=")[1];
}

/** Opens `/pay` with the fragment of `fragment`, as a link does (Expo Router's "#" parameter). */
async function openLink() {
  const router = await renderRouter(routes, { initialUrl: `/pay${fragment}` });
  return { router };
}

/** The root layout's theme (src/app/_layout.tsx), around the routes. */
function ThemedRoot() {
  return (
    <ThemeProvider>
      <Slot />
    </ThemeProvider>
  );
}

const queries = () => relays.calls.filter((call) => call.operation === "query");

const WAIT = { timeout: 6000 };
const LONG_WAIT = { timeout: 15_000 };

// Several tests follow a sale hour by hour in fake time: seconds of real time each, more on a loaded
// machine (the whole suite in parallel, CI). Past Jest's default 5 s, a test stopped mid-act() left
// the act() environment broken for the tests after it (as in pos-flow.test.tsx).
jest.setTimeout(30_000);

describe("payment link page", () => {
  beforeEach(() => {
    setClock(START);
    mockPoints.clear();
    mockPointsDown = false;
    mockRateReads.mockClear();
    relays.resetRelays();
    resetPayRequests();
    settled.clear();
    fragment = "";
    jest.mocked(copyText).mockClear();
    jest.mocked(openUri).mockClear();
    verifyService();
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("shows the sale to a payer, with an invoice of its own declared before it is shown", async () => {
    const { link } = newLink();
    await publishPaymentLink(link);
    const { router } = await openLink();

    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
    expect(router.getPathname()).toBe("/pay");
    // Neither who asks nor their Lightning address: the amount and the code.
    expect(screen.queryByText("Fine Bakery")).toBeNull();
    expect(screen.queryByText(ADDRESS)).toBeNull();
    expect(screen.getByText("24.50")).toBeTruthy();
    expect(screen.getByLabelText("49'000 sats")).toBeTruthy();
    expect(screen.getByText("Table 4")).toBeTruthy();
    expect(screen.getByText(/^(09:5\d|10:00)$/)).toBeTruthy();

    // Asked of the merchant's Lightning address at the point of the hour, until the sale's end.
    expect(asked).toHaveLength(1);
    expect(asked[0].searchParams.get("amount")).toBe("49000000");
    expect(asked[0].searchParams.get("comment")).toBe("Table 4");
    expect(Number(asked[0].searchParams.get("expiry"))).toBeGreaterThan(590);
    expect(Number(asked[0].searchParams.get("expiry"))).toBeLessThanOrEqual(600);
    const invoice = shownInvoice();
    expect(decodeBolt11(invoice)?.paymentHash).toBe(pageHash(0));
    // Declared for the sale: the point of sale counts its payment.
    const declared = await fetchDeclaredInvoices(registryOf(link), "bc");
    expect(declared?.map((entry) => entry.pr)).toEqual([invoice]);

    await fireEvent.press(screen.getByTestId("open-wallet"));
    expect(openUri).toHaveBeenCalledWith(`lightning:${invoice}`);
    await fireEvent.press(screen.getByTestId("copy-invoice"));
    expect(copyText).toHaveBeenCalledWith(invoice);
    expect(await screen.findByLabelText("Invoice copied")).toBeTruthy();
    expect(screen.getByText("Copied")).toBeTruthy();
    // Lightning only: no address to copy.
    expect(screen.queryByTestId("copy-address")).toBeNull();
  });

  // Its header's switch: the page follows the payer's device, the
  // switch shows the other theme, saved in the payer's browser, the device's own again on return.
  it("switches to the other theme from its header, then back to the device's", async () => {
    const secureStore =
      jest.requireMock<typeof import("../../jest/expo-secure-store")>("expo-secure-store");
    const systemUi = jest.requireMock<typeof import("../../jest/expo-system-ui")>("expo-system-ui");
    const stored = () => parseThemePreference(secureStore.items.get(THEME_KEY) ?? null);
    const { link } = newLink();
    await publishPaymentLink(link);
    await renderRouter({ _layout: ThemedRoot, ...routes }, { initialUrl: `/pay${fragment}` });
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();

    const toDark = await screen.findByLabelText("Switch to the dark theme");
    expect(systemUi.rootBackground()).toBe(lightColors.background.app);
    await fireEvent.press(toDark);
    expect(await screen.findByLabelText("Switch to the light theme")).toBeTruthy();
    expect(stored()).toBe("dark");
    expect(systemUi.rootBackground()).toBe(darkColors.background.app);

    // Back to the light theme, the device's: "Automatic" again.
    await fireEvent.press(screen.getByLabelText("Switch to the light theme"));
    expect(await screen.findByLabelText("Switch to the dark theme")).toBeTruthy();
    expect(stored()).toBe("system");
    expect(systemUi.rootBackground()).toBe(lightColors.background.app);
  });

  it("declares its invoices with who took the sale, as the link says it", async () => {
    // The owner's reading key: the test team of team.test.ts, whose public half is REGISTRY_READER.
    const reader = deriveRegistryReader(
      deriveTeamKeys(
        encodeWalletSecret({
          mnemonic:
            "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
        })
      )
    );
    expect(reader.publicKey).toBe(REGISTRY_READER);
    const taker = "5a".repeat(16);
    const { link } = newLink(null, 600, { taker });
    await publishPaymentLink(link);
    await openLink();
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();

    const found = await ownerDeclarations(
      { key: hexToBytes(REGISTRY_KEY), reader },
      pageHash(0),
      "bc"
    );
    expect(found?.map((declaration) => declaration.taker)).toEqual([taker]);
  });

  it("shows no code when the relays cannot take its declaration", async () => {
    const { link } = newLink();
    await publishPaymentLink(link);
    // Four of the seven relays answer reads but refuse new events: a declaration needs four.
    const publishEvent = relays.publishEvent;
    const refusing = jest
      .spyOn(relays, "publishEvent")
      .mockImplementation(async (url, event, options) => {
        if (PAYMENT_LINK_RELAYS.slice(0, 4).includes(url)) throw new Error(`${url}: blocked`);
        return publishEvent(url, event, options);
      });
    try {
      await openLink();
      expect(await screen.findByText("Cannot connect", undefined, WAIT)).toBeTruthy();
      expect(asked).toHaveLength(1);
      expect(screen.queryByTestId("qr-value")).toBeNull();
    } finally {
      refusing.mockRestore();
    }

    await fireEvent.press(screen.getByTestId("retry"));
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
    expect(asked).toHaveLength(2);
    expect(decodeBolt11(shownInvoice())?.paymentHash).toBe(pageHash(1));
  });

  it("asks no invoice before a majority of the relays gave the sale's declarations", async () => {
    const { link } = newLink();
    await publishPaymentLink(link);
    // The link is found on the others; the declarations need four answers of seven.
    for (const relay of PAYMENT_LINK_RELAYS.slice(0, 4)) relays.unreachable.add(relay);
    await openLink();

    expect(await screen.findByText("Cannot connect", undefined, WAIT)).toBeTruthy();
    expect(asked).toHaveLength(0);

    // Read again meanwhile: the page goes on once they answer.
    relays.unreachable.clear();
    await act(async () => jest.advanceTimersByTimeAsync(DECLARATIONS_INTERVAL_MS));
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
    expect(asked).toHaveLength(1);
  });

  it("copies the amount in the unit shown, which goes BTC, sats, then the fiat amount", async () => {
    const { link } = newLink(ONCHAIN);
    await publishPaymentLink(link);
    await openLink();
    expect(await screen.findByText("Amount", undefined, WAIT)).toBeTruthy();
    // The receipt: the invoice and the address cut in their middle, then the amount.
    const invoice = shownInvoice();
    expect(screen.getByText(`${invoice.slice(0, 19)}…${invoice.slice(-5)}`)).toBeTruthy();
    expect(screen.getByText(`${ONCHAIN.slice(0, 16)}…${ONCHAIN.slice(-6)}`)).toBeTruthy();
    const amount = () => screen.getByTestId("receipt-amount").props.children;

    expect(amount()).toBe("0.00049");
    await fireEvent.press(screen.getByTestId("copy-amount"));
    expect(copyText).toHaveBeenLastCalledWith("0.00049");
    expect(await screen.findByLabelText("Amount copied")).toBeTruthy();
    expect(screen.getByText("Copied")).toBeTruthy();

    // Another unit: what was copied is not shown any more.
    await fireEvent.press(screen.getByLabelText("Unit: BTC, switch to sats"));
    expect(screen.queryByLabelText("Amount copied")).toBeNull();
    // Grouped as this device writes numbers, copied without grouping.
    expect(amount()).toBe("49'000");
    await fireEvent.press(screen.getByTestId("copy-amount"));
    expect(copyText).toHaveBeenLastCalledWith("49000");

    await fireEvent.press(screen.getByLabelText("Unit: sats, switch to CHF"));
    expect(amount()).toBe("24.50");
    await fireEvent.press(screen.getByTestId("copy-amount"));
    expect(copyText).toHaveBeenLastCalledWith("24.50");

    await fireEvent.press(screen.getByLabelText("Unit: CHF, switch to BTC"));
    expect(amount()).toBe("0.00049");

    // "Copied" for a moment, then the copy button again.
    await fireEvent.press(screen.getByTestId("copy-address"));
    expect(copyText).toHaveBeenLastCalledWith(ONCHAIN);
    expect(await screen.findByLabelText("Address copied")).toBeTruthy();
    expect(screen.queryByTestId("copy-address")).toBeNull();
    await act(async () => jest.advanceTimersByTime(COPIED_MS));
    expect(screen.queryByLabelText("Address copied")).toBeNull();
    expect(screen.getByTestId("copy-address")).toBeTruthy();
  });

  it("says when the browser refused to copy", async () => {
    const { link } = newLink();
    await publishPaymentLink(link);
    await openLink();
    expect(await screen.findByText("Amount", undefined, WAIT)).toBeTruthy();

    jest.mocked(copyText).mockRejectedValueOnce(new Error("Not allowed"));
    await fireEvent.press(screen.getByTestId("copy-amount"));
    expect(
      await screen.findByText(
        "The amount could not be copied. Open the request in your wallet or scan the code."
      )
    ).toBeTruthy();
    expect(screen.getByTestId("copy-amount")).toBeTruthy();
  });

  it("shows the sale on a device prepared for another account, without touching it", async () => {
    // This device takes payments for another merchant (another wallet, address, name, currency).
    const own = {
      version: 2 as const,
      walletId: "03aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899",
      backupKey: "aa".repeat(32),
      lightningAddress: "sattleme03aabbccdd@breez.tips",
      businessName: "Corner Coffee",
      currency: "EUR"
    };
    await saveTerminalProfile(own);
    const { link } = newLink();
    await publishPaymentLink(link);
    jest.mocked(globalThis.fetch).mockClear();
    const { router } = await openLink();

    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
    // Neither the point of sale nor anything of this device's merchant.
    expect(router.getPathname()).toBe("/pay");
    expect(screen.queryByText("Corner Coffee")).toBeNull();
    expect(screen.queryByText("EUR")).toBeNull();
    expect(screen.getByText("24.50")).toBeTruthy();
    expect(screen.getByText("CHF")).toBeTruthy();
    // The link's Lightning address only, never this device's.
    expect(jest.mocked(globalThis.fetch).mock.calls.length).toBeGreaterThan(0);
    for (const [input] of jest.mocked(globalThis.fetch).mock.calls) {
      expect(String(input)).not.toContain("sattleme03aabbccdd");
    }
    await expect(loadTerminalProfile()).resolves.toEqual(own);
  });

  it("shows the payment once its invoice is paid", async () => {
    const { link } = newLink();
    await publishPaymentLink(link);
    await openLink();
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();

    settled.add(pageHash(0));
    expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
    expect(screen.getByText("Fine Bakery has received your payment.")).toBeTruthy();
    expect(screen.getByLabelText("49'000 sats")).toBeTruthy();
    expect(screen.queryByTestId("open-wallet")).toBeNull();
    // Its title, and its details: who is paid, how, when the sale started;
    // no transaction, no time of payment.
    expect(screen.getByTestId("outcome-note")).toHaveTextContent("Table 4");
    const details = within(screen.getByTestId("payment-details"));
    expect(details.getByText("Fine Bakery")).toBeTruthy();
    expect(details.getByTestId("details-method")).toHaveTextContent("Lightning");
    expect(details.getByTestId("details-created")).toHaveTextContent(
      createdOn(Math.floor(START / 1000))
    );
    expect(details.queryByTestId("details-transaction")).toBeNull();
  });

  it("says until when an invoice is payable, then where to go once it is paid", async () => {
    // An invoice of "New invoice": a link of version 4, payable for 30 days.
    const now = Math.floor(Date.now() / 1000);
    const { link } = newLink(null, 30 * 86_400, {
      version: 4,
      startsAt: now,
      redirectUrl: "https://fine-bakery.example/thanks"
    });
    await publishPaymentLink(link);
    await openLink();
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
    // Its due date in place of a countdown.
    expect(screen.getByTestId("payable-until")).toHaveTextContent(/Payable until \d+/);

    settled.add(pageHash(0));
    expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
    // Its confirmation first; the payer goes on when they choose, the host named.
    const next = screen.getByTestId("paid-continue");
    expect(next).toHaveTextContent(/Continue to fine-bakery\.example$/);
    await fireEvent.press(next);
    expect(openUri).toHaveBeenCalledWith("https://fine-bakery.example/thanks");
  });

  it("offers nowhere to go once paid when the invoice names nothing", async () => {
    const { link } = newLink();
    await publishPaymentLink(link);
    await openLink();
    settled.add(pageHash(0));
    expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
    expect(screen.queryByTestId("paid-continue")).toBeNull();
  });

  it("shows the payment of the point of sale's invoice, which it declared for the sale", async () => {
    const { link } = newLink();
    await publishPaymentLink(link);
    await openLink();
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();

    // The customer paid the code of the point of sale's screen instead.
    const pos = posInvoice(7);
    await declareInvoice(registryOf(link), pos, DECLARED);
    settled.add(pos.decoded.paymentHash);
    await act(async () => jest.advanceTimersByTimeAsync(DECLARATIONS_INTERVAL_MS));
    expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
  });

  it("never counts an invoice dated before the sale, though declared for it", async () => {
    const { link } = newLink();
    await publishPaymentLink(link);
    await openLink();
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();

    // An invoice of two minutes before the sale started, paid for another one, declared for it.
    const older = posInvoice(7, 120);
    await declareInvoice(registryOf(link), older, DECLARED);
    settled.add(older.decoded.paymentHash);
    await act(async () => jest.advanceTimersByTimeAsync(DECLARATIONS_INTERVAL_MS));
    expect(screen.queryByText("Paid")).toBeNull();
    expect(screen.getByText("Waiting for the payment")).toBeTruthy();
  });

  it("shows a payment that another sale declared too as to check, never a code", async () => {
    const { link } = newLink();
    await publishPaymentLink(link);
    const pos = posInvoice(7);
    await declareInvoice(registryOf(link), pos, DECLARED);
    // The same payment, declared for another sale of the business.
    await declareInvoice(saleRegistry(BUSINESS, new Uint8Array(32).fill(9)), pos, DECLARED);
    settled.add(pos.decoded.paymentHash);
    await openLink();

    await waitFor(
      () =>
        expect(
          jest
            .mocked(globalThis.fetch)
            .mock.calls.some(([input]) => String(input).endsWith(pos.decoded.paymentHash))
        ).toBe(true),
      WAIT
    );
    await act(async () => jest.advanceTimersByTimeAsync(5000));
    // Received, to be checked by the business: never a code to pay it again.
    expect(await screen.findByText("To be checked", undefined, WAIT)).toBeTruthy();
    expect(screen.queryByText("Waiting for the payment")).toBeNull();
    expect(screen.queryByTestId("qr-value", { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByText("Paid")).toBeNull();
  });

  describe("while a payment is checked", () => {
    /** The page's code paid while most relays do not answer: its registry read is awaited. */
    async function payWhileRelaysSlow() {
      const { link } = newLink();
      await publishPaymentLink(link);
      await openLink();
      expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
      const code = String(screen.getByTestId("qr-value").props.children);
      for (const relay of PAYMENT_LINK_RELAYS.slice(0, 4)) relays.unreachable.add(relay);
      settled.add(pageHash(0));
      expect(await screen.findByText("Checking the payment…", undefined, WAIT)).toBeTruthy();
      return { link, code };
    }

    it("keeps the code blurred under a spinner, the countdown going, nothing to pay", async () => {
      const { code } = await payWhileRelaysSlow();
      // As at the point of sale: the code stays, blurred and out of screen
      // readers' reach, the spinner over it; never the whole page's loader.
      expect(screen.getByTestId("qr-value", { includeHiddenElements: true }).props.children).toBe(
        code
      );
      expect(screen.queryByTestId("qr-value")).toBeNull();
      expect(screen.getByTestId("qr-blurred", { includeHiddenElements: true })).toBeTruthy();
      expect(screen.getByTestId("qr-spinner", { includeHiddenElements: true })).toBeTruthy();
      expect(screen.queryByTestId("loading-spinner", { includeHiddenElements: true })).toBeNull();
      expect(screen.getByText("24.50")).toBeTruthy();
      // Nothing offers to pay again: the wallet's button is disabled, the receipt's copy buttons
      // hidden in their place; its rows stay to read.
      expect(screen.getByTestId("open-wallet").props.accessibilityState.disabled).toBe(true);
      await fireEvent.press(screen.getByTestId("open-wallet"));
      expect(openUri).not.toHaveBeenCalled();
      expect(screen.getByTestId("receipt-amount").props.children).toBe("0.00049");
      for (const what of ["invoice", "amount"]) {
        expect(screen.queryByTestId(`copy-${what}`)).toBeNull();
        expect(screen.getByTestId(`copy-${what}`, { includeHiddenElements: true })).toBeTruthy();
        expect(
          StyleSheet.flatten(
            screen.getByTestId(`copy-${what}-place`, { includeHiddenElements: true }).props.style
          )
        ).toMatchObject({ opacity: 0, pointerEvents: "none" });
      }
      // The sale's countdown goes on: never 00:00 before its end.
      expect(screen.queryByText("00:00")).toBeNull();
      const left = screen.getByText(/^09:\d\d$/).props.children as string;
      await act(async () => jest.advanceTimersByTimeAsync(20_000));
      expect(screen.getByText("Checking the payment…")).toBeTruthy();
      expect(screen.queryByText(left)).toBeNull();
      expect(screen.getByText(/^09:\d\d$/)).toBeTruthy();

      // The relays answer at the next read: the payment is this sale's only.
      relays.unreachable.clear();
      await act(async () => jest.advanceTimersByTimeAsync(10_000));
      expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
    });

    it("drops the code once the sale ends while its payment is checked", async () => {
      await payWhileRelaysSlow();

      // Past the sale's end, still checked: no code any more, the page's loader.
      await act(async () => jest.setSystemTime(START + 600_000));
      await act(async () => jest.advanceTimersByTimeAsync(2_000));
      expect(screen.getByText("Checking the payment…")).toBeTruthy();
      expect(screen.queryByTestId("qr-value", { includeHiddenElements: true })).toBeNull();
      expect(screen.getByTestId("loading-spinner", { includeHiddenElements: true })).toBeTruthy();

      // Made before the end, the payment still counts once the relays answer.
      relays.unreachable.clear();
      await act(async () => jest.advanceTimersByTimeAsync(30_000));
      expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
    });

    it("shows a payment another sale declared too as to check, never its code again", async () => {
      const { link } = newLink();
      await publishPaymentLink(link);
      await openLink();
      expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
      const code = String(screen.getByTestId("qr-value").props.children);
      // A forged page declared the page's invoice for another sale of the business, then paid it.
      const pr = shownInvoice();
      const invoice: Invoice = {
        pr,
        decoded: decodeBolt11(pr)!,
        verifyUrl: `https://breez.tips/lnurlpay/verify/${pageHash(0)}`
      };
      await declareInvoice(saleRegistry(BUSINESS, new Uint8Array(32).fill(9)), invoice, DECLARED);
      settled.add(pageHash(0));
      await act(async () => jest.advanceTimersByTimeAsync(5000));

      // It counts for no sale, and the payer is never asked to pay again: received, to be checked
      // by the business.
      expect(await screen.findByText("To be checked", undefined, WAIT)).toBeTruthy();
      expect(screen.queryByText("Paid")).toBeNull();
      expect(screen.queryByText("Waiting for the payment")).toBeNull();
      expect(screen.queryByTestId("qr-value", { includeHiddenElements: true })).toBeNull();
      expect(screen.queryByTestId("open-wallet", { includeHiddenElements: true })).toBeNull();
      expect(screen.queryByTestId("copy-invoice", { includeHiddenElements: true })).toBeNull();
      expect(code).not.toBe("");
    });
  });

  it("shows the payment of the point of sale's code, paid before the payer opened the link", async () => {
    const { link } = newLink();
    await publishPaymentLink(link);
    const pos = posInvoice(7);
    await declareInvoice(registryOf(link), pos, DECLARED);
    settled.add(pos.decoded.paymentHash);
    await openLink();

    expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
    expect(screen.queryByTestId("qr-value")).toBeNull();
  });

  it("shows a loader, never a code, until the LNURL server tells the payment of the point of sale's code", async () => {
    const { link } = newLink();
    await publishPaymentLink(link);
    const pos = posInvoice(7);
    await declareInvoice(registryOf(link), pos, DECLARED);
    settled.add(pos.decoded.paymentHash);
    verifyDelayMs = 2000;
    await openLink();

    expect(await screen.findByText("Checking the payment…", undefined, WAIT)).toBeTruthy();
    expect(screen.queryByTestId("qr-value", { includeHiddenElements: true })).toBeNull();
    await act(async () => jest.advanceTimersByTimeAsync(1000));
    expect(screen.queryByTestId("qr-value", { includeHiddenElements: true })).toBeNull();
    await act(async () => jest.advanceTimersByTimeAsync(1500));
    expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
    expect(screen.queryByTestId("qr-value", { includeHiddenElements: true })).toBeNull();
  });

  it("waits for the declarations, then their check, before a code (each slow, in turn)", async () => {
    const { link } = newLink();
    await publishPaymentLink(link);
    const pos = posInvoice(7);
    await declareInvoice(registryOf(link), pos, DECLARED);
    settled.add(pos.decoded.paymentHash);
    // The declarations are read with the pay request: 7 s, then the check of the point of sale's
    // invoice, 9 s more. Longer than either request alone may take; the page's own invoice is
    // made meanwhile.
    payRequestDelayMs = 7000;
    verifyDelayMs = 9000;
    await openLink();

    // Second by second: the page's requests follow one another.
    for (let second = 0; second < 15; second++) {
      await act(async () => jest.advanceTimersByTimeAsync(1000));
      expect(screen.queryByTestId("qr-value", { includeHiddenElements: true })).toBeNull();
      expect(screen.queryByText("Request expired")).toBeNull();
    }
    expect(screen.getByText("Checking the payment…")).toBeTruthy();
    await act(async () => jest.advanceTimersByTimeAsync(2000));
    expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
    expect(screen.queryByTestId("qr-value", { includeHiddenElements: true })).toBeNull();
  });

  it("never says a payment dated at the next point by another clock expired", async () => {
    // 14:04:40 on the payer's device: the point of 13:00 here. The point of sale's clock, a little
    // ahead, had its invoice dated 14:05:10 by the LNURL server: at the point of 14:00.
    setClock(PERIOD_END * 1000 - 20_000);
    const { link } = newLink();
    await publishPaymentLink(link);
    const pos = posInvoice(7, -30, 540);
    await declareInvoice(registryOf(link), pos, DECLARED);
    settled.add(pos.decoded.paymentHash);
    await openLink();

    expect(await screen.findByText("Checking the payment…", undefined, WAIT)).toBeTruthy();
    await act(async () => jest.advanceTimersByTimeAsync(5000));
    expect(screen.queryByText("Expired")).toBeNull();
    // 14:05 here too: the amount due at the point of 14:00, which the payment covers.
    await act(async () => jest.advanceTimersByTimeAsync(20_000));
    expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
  });

  it("shows the payment of an invoice paid at an earlier hour, after the sale's end", async () => {
    // Asked at 12:58:50 by the point of sale, at the point of 12:00, until 13:00, and paid then;
    // the sale ended at 13:08:50: the payer opens the link afterwards.
    const { link } = newLink(null, -100);
    const pos = posInvoice(7, 700, 70);
    await declareInvoice(registryOf(link), pos, DECLARED);
    settled.add(pos.decoded.paymentHash);
    await publishPaymentLink(link);
    await openLink();

    expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
    expect(screen.queryByText("Expired")).toBeNull();
    // The sale is over: no invoice asked.
    expect(asked).toHaveLength(0);
  });

  it("counts down the checks of its invoice once the sale ended unpaid, then says it expired", async () => {
    const { link } = newLink(null, 60);
    await publishPaymentLink(link);
    await openLink();
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();

    // Ended: no code nor anything to pay any more. Its invoice is still checked for 2 minutes, as at
    // the point of sale: the plate says so and the countdown counts them down (the page's loader
    // alone, once the countdown reached 00:00).
    await act(async () => jest.advanceTimersByTimeAsync(61_000));
    expect(screen.getByText("Request expired")).toBeTruthy();
    expect(screen.getByText("A payment sent at the last second may still arrive.")).toBeTruthy();
    expect(screen.getByText("Check ends in")).toBeTruthy();
    expect(screen.getByText("01:59")).toBeTruthy();
    expect(screen.getByText("Checking the payment…")).toBeTruthy();
    // The amount and the note the payer saw stay.
    expect(screen.getByLabelText(/^49'000 sats$/)).toBeTruthy();
    expect(screen.getByText("Table 4")).toBeTruthy();
    expect(screen.queryByTestId("qr-value", { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByTestId("qr-spinner", { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByTestId("loading-spinner", { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByTestId("open-wallet")).toBeNull();
    expect(screen.queryByTestId("copy-invoice")).toBeNull();
    await act(async () => jest.advanceTimersByTimeAsync(30_000));
    expect(screen.getByText("01:29")).toBeTruthy();

    await act(async () => jest.advanceTimersByTimeAsync(95_000));
    expect(await screen.findByText("Expired", undefined, WAIT)).toBeTruthy();
    expect(screen.queryByText("Request expired")).toBeNull();
  });

  it("still shows a payment of its invoice reported after the sale's end", async () => {
    const { link } = newLink(null, 60);
    await publishPaymentLink(link);
    await openLink();
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
    await act(async () => jest.advanceTimersByTimeAsync(61_000));
    expect(screen.getByText("Request expired")).toBeTruthy();

    // Paid in its last seconds, reported by the LNURL server within the 2 minutes.
    settled.add(pageHash(0));
    expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
    expect(screen.queryByText("Expired")).toBeNull();
  });

  it("says when the sale ended unpaid", async () => {
    const { link } = newLink(null, -200);
    await publishPaymentLink(link);
    await openLink();

    expect(await screen.findByText("Expired", undefined, WAIT)).toBeTruthy();
    expect(
      screen.getByText(
        "The time to pay is over and no payment was received. Ask Fine Bakery for a new link."
      )
    ).toBeTruthy();
    // Its title stays; no payment, no details.
    expect(screen.getByTestId("outcome-note")).toHaveTextContent("Table 4");
    expect(screen.queryByTestId("payment-details")).toBeNull();
    expect(asked).toHaveLength(0);
  });

  it("never says a sale ended unpaid before a majority of the relays gave its declarations", async () => {
    const { link } = newLink(null, -200);
    await publishPaymentLink(link);
    for (const relay of PAYMENT_LINK_RELAYS.slice(0, 4)) relays.unreachable.add(relay);
    await openLink();

    expect(await screen.findByText("Cannot connect", undefined, WAIT)).toBeTruthy();
    await act(async () => jest.advanceTimersByTimeAsync(5000));
    expect(screen.queryByText("Expired")).toBeNull();

    relays.unreachable.clear();
    await act(async () => jest.advanceTimersByTimeAsync(DECLARATIONS_INTERVAL_MS));
    expect(await screen.findByText("Expired", undefined, WAIT)).toBeTruthy();
  });

  it("says when no relay holds the link, after looking twice", async () => {
    // A link never published: its fragment is set, no relay has its event.
    newLink();
    await openLink();

    expect(await screen.findByText("Payment request not found", undefined, LONG_WAIT)).toBeTruthy();
    expect(
      screen.getByText(
        "This payment request does not exist or has expired. Ask the merchant for a new link."
      )
    ).toBeTruthy();
    expect(queries()).toHaveLength(PAYMENT_LINK_RELAYS.length * 2);
  });

  it("finds a link published just after the payer opened it", async () => {
    const { link } = newLink();
    await openLink();
    await waitFor(() => expect(queries()).toHaveLength(PAYMENT_LINK_RELAYS.length));
    // Still looking: a loading scene over the line that says so (decorative, hidden from screen
    // readers).
    expect(screen.getByText("Loading the payment request…")).toBeTruthy();
    expect(screen.queryByTestId("loading-spinner")).toBeNull();
    expect(screen.getByTestId("loading-spinner", { includeHiddenElements: true })).toBeTruthy();

    await publishPaymentLink(link);
    expect(await screen.findByText("Waiting for the payment", undefined, LONG_WAIT)).toBeTruthy();
    expect(screen.queryByTestId("loading-spinner", { includeHiddenElements: true })).toBeNull();
  });

  it.each([
    ["a fragment cut short", (fragment: string) => fragment.slice(0, -1)],
    ["no fragment", () => ""],
    ["no key", (fragment: string) => fragment.split(".")[0]],
    [
      "another id",
      (fragment: string) => fragment.replace(/^#[^.]+/, "#3f2a9c1e-1234-4abc-8def-0123456789ab")
    ]
  ])("says when the link is incomplete (%s), without asking the relays", async (_case, cut) => {
    const { link } = newLink();
    await publishPaymentLink(link);
    fragment = cut(fragment);
    await openLink();

    expect(
      await screen.findByText(
        "This link is incomplete. Check that it was copied in full, or ask the merchant for a new one."
      )
    ).toBeTruthy();
    expect(queries()).toHaveLength(0);
  });

  it("offers to try again when no relay answers", async () => {
    const { link } = newLink();
    await publishPaymentLink(link);
    for (const relay of PAYMENT_LINK_RELAYS) relays.unreachable.add(relay);
    await openLink();
    expect(await screen.findByText("Cannot connect", undefined, WAIT)).toBeTruthy();

    relays.unreachable.clear();
    await fireEvent.press(screen.getByTestId("retry"));
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
  });

  it("says when the merchant's service refuses to make the invoice", async () => {
    refusal = "Internal server error";
    const { link } = newLink();
    await publishPaymentLink(link);
    await openLink();

    expect(await screen.findByText("Payment request unavailable", undefined, WAIT)).toBeTruthy();
    expect(
      screen.getByText(
        "The merchant's payment service could not create the invoice. Try again in a moment, or ask the merchant for a new link."
      )
    ).toBeTruthy();

    refusal = null;
    await fireEvent.press(screen.getByTestId("retry"));
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
  });

  it("waits for the point of the hour before asking an invoice", async () => {
    mockPointsDown = true;
    const { link } = newLink();
    await publishPaymentLink(link);
    await openLink();

    expect(await screen.findByText("Updating to this hour's rate…", undefined, WAIT)).toBeTruthy();
    await act(async () => jest.advanceTimersByTimeAsync(5000));
    expect(asked).toHaveLength(0);
  });

  it("asks the next hour's invoice itself, at its point, with no point of sale online", async () => {
    // 14:04: the invoice until 14:05 at the point of 13:00, the sale until 14:14.
    setClock(Date.UTC(2026, 9, 3, 14, 4));
    mockPoints.set(HOUR_END, 40000);
    const { link } = newLink();
    await publishPaymentLink(link);
    await openLink();
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
    expect(screen.getByLabelText("49'000 sats")).toBeTruthy();
    expect(Number(asked[0].searchParams.get("expiry"))).toBeLessThanOrEqual(60);

    // 14:05: the invoice at the point of 14:00 (40 000 CHF/BTC): 61 250 sats, until 14:14.
    await act(async () => jest.advanceTimersByTimeAsync(PERIOD_END * 1000 + 1000 - Date.now()));
    await waitFor(() => expect(asked).toHaveLength(2), WAIT);
    expect(asked[1].searchParams.get("amount")).toBe("61250000");
    expect(await screen.findByLabelText("61'250 sats", undefined, WAIT)).toBeTruthy();
    expect(decodeBolt11(shownInvoice())?.paymentHash).toBe(pageHash(1));
    const declared = await fetchDeclaredInvoices(registryOf(link), "bc");
    expect(declared).toHaveLength(2);
  });

  describe("on-chain", () => {
    it("puts the address in the code, and follows its payment until it is deep enough", async () => {
      const { link } = newLink(ONCHAIN);
      await publishPaymentLink(link);
      await openLink();
      expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();

      const invoice = shownInvoice();
      expect(screen.getByTestId("qr-value").props.children).toBe(
        `bitcoin:${ONCHAIN}?amount=0.00049&lightning=${invoice}`
      );
      // Wallets open the code: a Lightning wallet pays the invoice, an on-chain one the address,
      // with the sale's note, which the QR does not carry (a denser code).
      await fireEvent.press(screen.getByTestId("open-wallet"));
      expect(openUri).toHaveBeenCalledWith(
        `bitcoin:${ONCHAIN}?amount=0.00049&label=Table%204&message=Table%204&lightning=${invoice}`
      );

      await act(async () => {
        mempool.pay(ONCHAIN, 49_000n);
      });
      expect(await screen.findByText("Confirming")).toBeTruthy();
      expect(
        screen.getByText(
          "Your payment has been sent. The network still has to confirm the transaction, allow about thirty minutes. You can close this page."
        )
      ).toBeTruthy();
      expect(screen.queryByTestId("qr-value")).toBeNull();

      await act(async () => mempool.mine(3));
      expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
      // When it was sent, from mempool.space alone: the payer's page tells BlockCypher nothing.
      expect(mempool.chain.firstSeenAsked).toHaveLength(1);
      expect(mempool.chain.receivedAsked).toEqual([]);
    });

    describe("on the merchant's node, when the link names it", () => {
      const NODE = "https://node.example.ch";

      it("follows the payment on the node alone while it answers", async () => {
        const { link } = newLink(ONCHAIN, 600, {
          bitcoinNode: { url: NODE, fallback: "mempool" }
        });
        await publishPaymentLink(link);
        await openLink();
        expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
        expect(mempool.chain.socketUrls).toEqual([
          ["wss://node.example.ch/api/v1/ws", "wss://mempool.space/api/v1/ws"]
        ]);

        let txid = "";
        await act(async () => {
          txid = mempool.pay(ONCHAIN, 49_000n);
        });
        expect(await screen.findByText("Confirming")).toBeTruthy();
        // Its transaction's link leads to its page on the node too, never mempool.space.
        const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
        const row = within(screen.getByTestId("details-transaction"));
        expect(row.getByLabelText(txLinkLabel(txid, "node.example.ch"))).toBeTruthy();
        await fireEvent.press(row.getByTestId("tx-link"));
        expect(openURL).toHaveBeenCalledWith(`${NODE}/tx/${txid}`);
        openURL.mockRestore();
        await act(async () => mempool.mine(3));
        expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
        expect(
          within(screen.getByTestId("details-transaction")).getByLabelText(
            txLinkLabel(txid, "node.example.ch")
          )
        ).toBeTruthy();
        const reads = mempool.chain.calls.filter(({ path }) => path.includes(ONCHAIN));
        expect(reads.length).toBeGreaterThan(0);
        expect(reads.every(({ base }) => base === `${NODE}/api`)).toBe(true);
      });

      it("reads mempool.space while the node does not answer, when the merchant allowed it", async () => {
        mempool.chain.down.add(`${NODE}/api`);
        const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
        try {
          const { link } = newLink(ONCHAIN, 600, {
            bitcoinNode: { url: NODE, fallback: "mempool" }
          });
          await publishPaymentLink(link);
          await openLink();
          expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
          await waitFor(() =>
            expect(mempool.chain.calls).toContainEqual({
              base: MEMPOOL_API_URL,
              path: `/address/${ONCHAIN}/txs`
            })
          );
        } finally {
          warn.mockRestore();
        }
      });

      it('never asks mempool.space for the address with "Lightning only"', async () => {
        mempool.chain.down.add(`${NODE}/api`);
        const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
        try {
          const { link } = newLink(ONCHAIN, 600, { bitcoinNode: { url: NODE, fallback: "none" } });
          await publishPaymentLink(link);
          await openLink();
          await waitFor(() =>
            expect(mempool.chain.calls).toContainEqual({
              base: `${NODE}/api`,
              path: "/blocks/tip/height"
            })
          );
          // Not read: neither paid nor unpaid, as when mempool.space does not answer; the code once
          // the page waited long enough.
          expect(await screen.findByText("Checking the payment…", undefined, WAIT)).toBeTruthy();
          await act(async () => jest.advanceTimersByTimeAsync(LINK_FIRST_CHECK_TIMEOUT_MS));
          expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
          expect(mempool.chain.socketUrls).toEqual([["wss://node.example.ch/api/v1/ws"]]);
          expect(
            mempool.chain.calls.some(
              ({ base, path }) => base === MEMPOOL_API_URL && path.includes(ONCHAIN)
            )
          ).toBe(false);
        } finally {
          warn.mockRestore();
        }
      });
    });

    it("shows the address alone above the most the Lightning address accepts, as the point of sale", async () => {
      // 10 000 sats at most over Lightning: the sale is 49 000.
      maxSendableMsat = 10_000_000;
      const { link } = newLink(ONCHAIN);
      await publishPaymentLink(link);
      await openLink();
      expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();

      expect(screen.getByTestId("qr-value").props.children).toBe(
        `bitcoin:${ONCHAIN}?amount=0.00049`
      );
      expect(asked).toHaveLength(0);
      await fireEvent.press(screen.getByTestId("open-wallet"));
      expect(openUri).toHaveBeenCalledWith(
        `bitcoin:${ONCHAIN}?amount=0.00049&label=Table%204&message=Table%204`
      );
      // The receipt gives the address and the amount, no invoice.
      expect(screen.queryByTestId("copy-invoice")).toBeNull();
      expect(screen.getByTestId("copy-address")).toBeTruthy();

      await act(async () => {
        mempool.pay(ONCHAIN, 49_000n);
      });
      expect(await screen.findByText("Confirming")).toBeTruthy();
      await act(async () => mempool.mine(3));
      expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
    });

    it("says why it cannot be paid above those bounds without an address, offering no other try", async () => {
      maxSendableMsat = 10_000_000;
      const { link } = newLink(null);
      await publishPaymentLink(link);
      await openLink();

      expect(await screen.findByText("Payment request unavailable", undefined, WAIT)).toBeTruthy();
      expect(
        screen.getByText(
          "This amount can only be paid on-chain, and this request offers no Bitcoin address. Ask Fine Bakery for another way to pay."
        )
      ).toBeTruthy();
      expect(screen.queryByTestId("retry")).toBeNull();
      expect(asked).toHaveLength(0);
    });

    it("shows each transaction's confirmations on its row, until the payment is paid", async () => {
      const { link } = newLink(ONCHAIN);
      await publishPaymentLink(link);
      await openLink();
      expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();

      let txid = "";
      await act(async () => {
        txid = mempool.pay(ONCHAIN, 49_000n);
      });
      expect(await screen.findByText("Confirming")).toBeTruthy();
      expect(screen.getByTestId("outcome-note")).toHaveTextContent("Table 4");
      const details = within(screen.getByTestId("payment-details"));
      expect(details.getByText("Fine Bakery")).toBeTruthy();
      expect(details.getByTestId("details-method")).toHaveTextContent("Bitcoin");
      expect(details.getByTestId("details-created")).toHaveTextContent(
        createdOn(Math.floor(START / 1000))
      );
      // One transaction: its pill on the left of its id, which links to mempool.space.
      const row = within(details.getByTestId("details-transaction"));
      expect(row.getByText("Transaction")).toBeTruthy();
      expect(row.getByLabelText("0 confirmations of 3")).toHaveTextContent("0/3");
      expect(row.getByLabelText(txLinkLabel(txid))).toBeTruthy();
      // Its pill turns: the mined chain is the page's pill's alone.
      expect(row.getByTestId("status-pill-spinner", { includeHiddenElements: true })).toBeTruthy();
      expect(row.queryByTestId("chain-track", { includeHiddenElements: true })).toBeNull();
      expect(screen.getAllByTestId("chain-track", { includeHiddenElements: true })).toHaveLength(1);

      await act(async () => mempool.mine(1));
      expect(
        await within(screen.getByTestId("details-transaction")).findByLabelText(
          "1 confirmation of 3"
        )
      ).toHaveTextContent("1/3");

      await act(async () => mempool.mine(2));
      expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
      const paid = within(screen.getByTestId("details-transaction"));
      expect(paid.getByLabelText("Confirmed")).toHaveTextContent(/3\/3$/);
      expect(paid.getByLabelText(txLinkLabel(txid))).toBeTruthy();
      expect(paid.queryByTestId("status-pill-spinner", { includeHiddenElements: true })).toBeNull();
    });

    it("asks for the rest over Lightning and on-chain, with an invoice of its own", async () => {
      const { link } = newLink(ONCHAIN);
      await publishPaymentLink(link);
      await openLink();
      expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();

      let txid = "";
      await act(async () => {
        txid = mempool.pay(ONCHAIN, 20_000n);
      });

      expect(await screen.findByTestId("underpaid-chain")).toBeTruthy();
      // No "Left" tag at the top: the chain card gives the rest.
      expect(screen.queryByText("Left")).toBeNull();
      expect(screen.getAllByLabelText("29'000 sats")).toHaveLength(1);
      expect(
        screen.getByText(
          "Your payment (20'000 sats) does not cover the whole amount. Pay the rest over Lightning or Bitcoin."
        )
      ).toBeTruthy();
      // The point of sale's chain card: 20 000 sats received (10.00 of the 24.50 CHF), 29 000 to
      // pay (14.50 CHF).
      const chain = within(screen.getByTestId("underpaid-chain"));
      expect(chain.getByText("Received")).toBeTruthy();
      expect(chain.getByLabelText("20'000 sats")).toBeTruthy();
      expect(chain.getByText("10.00 CHF")).toBeTruthy();
      expect(chain.getByText("Left to pay")).toBeTruthy();
      expect(chain.getByLabelText("29'000 sats")).toBeTruthy();
      expect(chain.getByText("14.50 CHF")).toBeTruthy();
      // Its transaction, when BlockCypher received it, linked to mempool.space.
      expect(
        chain.getByLabelText(
          `View transaction ${txid.slice(0, 4)}…${txid.slice(-4)} on mempool.space`
        )
      ).toBeTruthy();
      expect(await chain.findByText(/ ·$/, undefined, WAIT)).toBeTruthy();
      // Asked of the merchant's Lightning address after the invoice of the whole amount.
      await waitFor(() => expect(asked).toHaveLength(2));
      expect(asked[1].searchParams.get("amount")).toBe("29000000");
      expect(asked[1].searchParams.get("comment")).toBe("Table 4");
      await waitFor(() =>
        expect(screen.getByTestId("qr-value").props.children).toMatch(
          new RegExp(`^bitcoin:${ONCHAIN}\\?amount=0\\.00029&lightning=lnbc290u`)
        )
      );
      const rest = shownInvoice();
      await fireEvent.press(screen.getByTestId("open-wallet"));
      expect(openUri).toHaveBeenCalledWith(
        `bitcoin:${ONCHAIN}?amount=0.00029&label=Table%204&message=Table%204&lightning=${rest}`
      );
      await fireEvent.press(screen.getByTestId("copy-invoice"));
      expect(copyText).toHaveBeenCalledWith(rest);
      await fireEvent.press(screen.getByTestId("copy-address"));
      expect(copyText).toHaveBeenCalledWith(ONCHAIN);
      expect(await screen.findByLabelText("Address copied")).toBeTruthy();
      // The receipt gives the rest: 29 000 of the 49 000 sats, 14.50 of the 24.50 CHF.
      expect(screen.getAllByText("Left to pay")).toHaveLength(2);
      expect(screen.getByTestId("receipt-amount").props.children).toBe("0.00029");
      await fireEvent.press(screen.getByLabelText("Unit: BTC, switch to sats"));
      await fireEvent.press(screen.getByLabelText("Unit: sats, switch to CHF"));
      expect(screen.getByTestId("receipt-amount").props.children).toBe("14.50");
      // Declared too: the point of sale counts its payment.
      const declared = await fetchDeclaredInvoices(registryOf(link), "bc");
      expect(declared?.map((entry) => entry.pr)).toContain(rest);

      // Paid over Lightning: the on-chain part still has to confirm, then the sale is paid.
      settled.add(pageHash(1));
      expect(await screen.findByText("Confirming", undefined, WAIT)).toBeTruthy();
      await act(async () => mempool.mine(3));
      expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
    });

    it("takes the rest on-chain too", async () => {
      const { link } = newLink(ONCHAIN);
      await publishPaymentLink(link);
      await openLink();
      expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
      await act(async () => {
        mempool.pay(ONCHAIN, 20_000n);
      });
      expect(await screen.findByTestId("underpaid-chain")).toBeTruthy();

      await act(async () => {
        mempool.pay(ONCHAIN, 29_000n);
      });
      expect(await screen.findByText("Confirming")).toBeTruthy();
    });

    it("keeps the rest's screen, its code blurred, while the rest's payment is checked", async () => {
      const { link } = newLink(ONCHAIN);
      await publishPaymentLink(link);
      await openLink();
      expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
      await act(async () => {
        mempool.pay(ONCHAIN, 20_000n);
      });
      expect(await screen.findByTestId("underpaid-chain")).toBeTruthy();
      await waitFor(() =>
        expect(screen.getByTestId("qr-value").props.children).toMatch(/&lightning=lnbc290u/)
      );
      const code = String(screen.getByTestId("qr-value").props.children);

      // The rest paid over Lightning while most relays do not answer: its registry read is awaited.
      for (const relay of PAYMENT_LINK_RELAYS.slice(0, 4)) relays.unreachable.add(relay);
      settled.add(pageHash(1));
      expect(await screen.findByText("Checking the payment…", undefined, WAIT)).toBeTruthy();
      // The rest's screen stays, its code blurred under the spinner, nothing offering to pay again.
      expect(screen.getByTestId("underpaid-chain")).toBeTruthy();
      expect(screen.getByTestId("qr-value", { includeHiddenElements: true }).props.children).toBe(
        code
      );
      expect(screen.queryByTestId("qr-value")).toBeNull();
      expect(screen.getByTestId("qr-blurred", { includeHiddenElements: true })).toBeTruthy();
      expect(screen.getByTestId("open-wallet").props.accessibilityState.disabled).toBe(true);
      for (const what of ["invoice", "address", "amount"]) {
        expect(screen.queryByTestId(`copy-${what}`)).toBeNull();
      }
      expect(screen.queryByText("00:00")).toBeNull();

      // The relays answer at the next read: the rest is this sale's only, the on-chain part still
      // confirms.
      relays.unreachable.clear();
      await act(async () => jest.advanceTimersByTimeAsync(30_000));
      expect(await screen.findByText("Confirming", undefined, WAIT)).toBeTruthy();
    });

    it("stays underpaid past the sale's end, with what was received", async () => {
      const { link } = newLink(ONCHAIN);
      await publishPaymentLink(link);
      await openLink();
      expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
      await act(async () => {
        mempool.pay(ONCHAIN, 20_000n);
      });
      expect(await screen.findByTestId("underpaid-chain")).toBeTruthy();
      expect(screen.getByText("Expires in")).toBeTruthy();

      // Past the sale's end, and the 2 minutes its invoices' payments may still be reported:
      // "Underpaid", no code any more.
      await act(async () => jest.setSystemTime(START + 600_000));
      await act(async () => jest.advanceTimersByTimeAsync((EXPIRY_GRACE_SECONDS + 5) * 1000));
      expect(await screen.findByText("Underpaid", undefined, WAIT)).toBeTruthy();
      expect(
        screen.getByText(
          "The time to pay is over: your payment (20'000 sats) does not cover the whole amount, 29'000 sats are missing. Contact Fine Bakery about the difference."
        )
      ).toBeTruthy();
      expect(screen.queryByTestId("qr-value")).toBeNull();
      expect(within(screen.getByTestId("underpaid-chain")).getByText("Missing")).toBeTruthy();
      const received = within(screen.getByTestId("received-transactions"));
      expect(received.getAllByTestId("received-transaction")).toHaveLength(1);
      expect(received.getByLabelText("20'000 sats")).toBeTruthy();
      const count = asked.length;

      // A transaction received later still counts: 49 000 sats in all, at the point of its hour.
      await act(async () => {
        mempool.pay(ONCHAIN, 29_000n);
      });
      expect(await screen.findByText("Confirming", undefined, WAIT)).toBeTruthy();
      expect(asked).toHaveLength(count);
    });

    it("is paid once the business accepts what it received, its rest no longer asked", async () => {
      const { link } = newLink(ONCHAIN);
      await publishPaymentLink(link);
      await openLink();
      expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
      await act(async () => {
        mempool.pay(ONCHAIN, 20_000n);
      });
      expect(await screen.findByTestId("underpaid-chain")).toBeTruthy();
      expect(screen.getByTestId("qr-value")).toBeTruthy();

      // A payer holding the sale's key cannot accept it: signed by anyone but the owner's key of
      // the sale, nothing changes.
      const forged = sealRecord({
        type: "sale-accepted",
        value: { version: 1, received: "20000", due: "49000" },
        signer: registryOf(link).saleKeys.nostr.secretKey,
        encryptionKey: deriveKey(link.key, "sattle.me/sale-acceptance", "encryption-key/v1"),
        address: saleAcceptanceAddress(link.key),
        createdAt: Math.floor(Date.now() / 1000)
      });
      await act(async () => {
        await publishToRelays(forged, {
          relays: link.relays,
          channel: "anonymous",
          timeoutMs: 1000
        });
      });
      await act(async () => jest.advanceTimersByTimeAsync(SALE_ACCEPTANCE_POLL_MS));
      expect(screen.getByTestId("underpaid-chain")).toBeTruthy();

      // The owner accepts its 20 000 sats (sale-acceptance.ts): looked for while it is underpaid.
      await act(async () => {
        await publishSaleAcceptance(
          saleAcceptanceEvent(
            OWNER_SECRET,
            link.key,
            { received: 20_000n, due: 49_000n },
            Math.floor(Date.now() / 1000)
          ),
          saleOwnerSecretKey(OWNER_SECRET, link.key),
          link.relays
        );
      });
      await act(async () => jest.advanceTimersByTimeAsync(SALE_ACCEPTANCE_POLL_MS));
      expect(
        await screen.findByText(
          "Fine Bakery accepted the amount received: your payment is settled.",
          undefined,
          WAIT
        )
      ).toBeTruthy();
      expect(screen.getByText("Paid")).toBeTruthy();
      // Nothing to pay any more.
      expect(screen.queryByTestId("qr-value")).toBeNull();
      expect(screen.queryByTestId("underpaid-chain")).toBeNull();
    });

    it("asks a rest under 1000 sats over Lightning only", async () => {
      const { link } = newLink(ONCHAIN);
      await publishPaymentLink(link);
      await openLink();
      expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();

      await act(async () => {
        mempool.pay(ONCHAIN, 48_500n);
      });

      expect(await screen.findByTestId("underpaid-chain")).toBeTruthy();
      expect(
        screen.getByText(
          "Your payment (48'500 sats) does not cover the whole amount. Pay the rest over Lightning."
        )
      ).toBeTruthy();
      await waitFor(() =>
        expect(screen.getByTestId("qr-value").props.children).toMatch(/^lightning:lnbc5u/)
      );
      expect(screen.queryByTestId("copy-address")).toBeNull();
      expect(screen.getByTestId("copy-invoice")).toBeTruthy();
      expect(screen.getByTestId("receipt-amount").props.children).toBe("0.000005");
      await fireEvent.press(screen.getByTestId("open-wallet"));
      expect(openUri).toHaveBeenCalledWith(expect.stringMatching(/^lightning:lnbc5u/));
    });

    it("keeps the code's place while the invoice of a small rest is asked", async () => {
      const { link } = newLink(ONCHAIN);
      await publishPaymentLink(link);
      await openLink();
      expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
      // The LNURL service does not answer for the invoice of the rest yet.
      const verify = jest.mocked(globalThis.fetch).getMockImplementation()!;
      jest
        .mocked(globalThis.fetch)
        .mockImplementation((input, init) =>
          new URL(String(input)).pathname.endsWith("/invoice")
            ? new Promise<Response>(() => undefined)
            : verify(input, init)
        );

      await act(async () => {
        mempool.pay(ONCHAIN, 48_500n);
      });

      // Under 1000 sats: no address, and no invoice yet, so no code: a plate of its size waits.
      const plate = await screen.findByTestId("rest-plate");
      expect(StyleSheet.flatten(plate.props.style)).toMatchObject({ width: 252, height: 252 });
      expect(screen.getByTestId("qr-spinner", { includeHiddenElements: true })).toBeTruthy();
      expect(screen.queryByTestId("qr-value")).toBeNull();
    });

    it("never says a sale ended unpaid before its address was read", async () => {
      // Over for 100 s; the explorer does not answer yet.
      mempool.chain.down.add(MEMPOOL_API_URL);
      const { link } = newLink(ONCHAIN, -100);
      await publishPaymentLink(link);
      await openLink();
      await waitFor(() =>
        expect(mempool.chain.calls.some((call) => call.base === MEMPOOL_API_URL)).toBe(true)
      );
      await act(async () => jest.advanceTimersByTime(5000));
      expect(screen.queryByText("Expired")).toBeNull();
      // Its first answers awaited: a loader, never "Request expired" yet.
      expect(screen.getByText("Checking the payment…")).toBeTruthy();
      expect(screen.queryByText("Request expired")).toBeNull();
      expect(screen.queryByTestId("open-wallet")).toBeNull();
      // Waited long enough: what it knows, still checked, once the loader faded out.
      await act(async () => jest.advanceTimersByTime(LINK_FIRST_CHECK_TIMEOUT_MS));
      expect(screen.queryByText("Expired")).toBeNull();
      await act(async () => jest.advanceTimersByTime(motion.loadingExit));
      expect(screen.queryByText("Expired")).toBeNull();
      expect(screen.getByText("Checking the Bitcoin payment…")).toBeTruthy();
      // The request ended: the plate says so; no invoice of it checked, no countdown.
      expect(screen.getByText("Request expired")).toBeTruthy();
      expect(screen.queryByText("Check ends in")).toBeNull();
      expect(screen.queryByTestId("open-wallet")).toBeNull();

      // Read at the next minute's check: nothing paid it.
      mempool.chain.down.clear();
      await act(async () => jest.advanceTimersByTime(60_000));
      expect(await screen.findByText("Expired", undefined, WAIT)).toBeTruthy();
    });

    it('shows a loader, never "Request expired", until the explorer tells of a payment', async () => {
      const { link } = newLink(ONCHAIN, -100);
      mempool.pay(ONCHAIN, 49_000n);
      await publishPaymentLink(link);
      mempool.chain.slow.set(MEMPOOL_API_URL, 2000);
      await openLink();

      expect(await screen.findByText("Checking the payment…", undefined, WAIT)).toBeTruthy();
      expect(screen.queryByText("Request expired")).toBeNull();
      await act(async () => jest.advanceTimersByTimeAsync(1000));
      expect(screen.queryByText("Request expired")).toBeNull();
      await act(async () => jest.advanceTimersByTimeAsync(1500));
      expect(await screen.findByText("Confirming", undefined, WAIT)).toBeTruthy();
      expect(screen.queryByText("Request expired")).toBeNull();
    });

    it('says expired once the explorer answered without a payment, never "Request expired"', async () => {
      const { link } = newLink(ONCHAIN, -100);
      await publishPaymentLink(link);
      mempool.chain.slow.set(MEMPOOL_API_URL, 2000);
      await openLink();

      expect(await screen.findByText("Checking the payment…", undefined, WAIT)).toBeTruthy();
      expect(screen.queryByText("Request expired")).toBeNull();
      await act(async () => jest.advanceTimersByTimeAsync(2500));
      expect(await screen.findByText("Expired", undefined, WAIT)).toBeTruthy();
    });

    it("shows the code only once the explorer answered", async () => {
      const { link } = newLink(ONCHAIN);
      await publishPaymentLink(link);
      mempool.chain.slow.set(MEMPOOL_API_URL, 2000);
      await openLink();

      expect(await screen.findByText("Checking the payment…", undefined, WAIT)).toBeTruthy();
      expect(screen.queryByTestId("qr-value", { includeHiddenElements: true })).toBeNull();
      await act(async () => jest.advanceTimersByTimeAsync(2500));
      expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
      expect(screen.getByTestId("qr-value")).toBeTruthy();
    });

    it("shows the code without the explorer's answer once it waited long enough", async () => {
      mempool.chain.down.add(MEMPOOL_API_URL);
      const { link } = newLink(ONCHAIN);
      await publishPaymentLink(link);
      await openLink();

      expect(await screen.findByText("Checking the payment…", undefined, WAIT)).toBeTruthy();
      expect(screen.queryByTestId("qr-value", { includeHiddenElements: true })).toBeNull();
      await act(async () => jest.advanceTimersByTimeAsync(LINK_FIRST_CHECK_TIMEOUT_MS));
      expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
      expect(screen.getByTestId("qr-value")).toBeTruthy();
    });

    it("shows an on-chain payment that came after the sale's end", async () => {
      const { link } = newLink(ONCHAIN, -100);
      mempool.pay(ONCHAIN, 49_000n);
      await publishPaymentLink(link);
      await openLink();

      expect(await screen.findByText("Confirming", undefined, WAIT)).toBeTruthy();
      expect(screen.queryByText("Expired")).toBeNull();
    });

    it("asks the rest at the point of each hour, what was received counted in sats", async () => {
      // 14:04, the sale until 14:14. 40 000 CHF per bitcoin at the point of 14:00, from 14:05:
      // 24.50 CHF is 61 250 sats.
      setClock(Date.UTC(2026, 9, 3, 14, 4));
      mockPoints.set(HOUR_END, 40000);
      const { link } = newLink(ONCHAIN);
      await publishPaymentLink(link);
      await openLink();
      expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
      await act(async () => {
        mempool.pay(ONCHAIN, 20_000n);
      });

      // Until the end of the period of the point of 13:00 (14:05), at that point.
      await waitFor(() => expect(asked).toHaveLength(2));
      expect(asked[1].searchParams.get("amount")).toBe("29000000");
      expect(Number(asked[1].searchParams.get("expiry"))).toBeLessThanOrEqual(60);
      // The sale's own time left.
      expect(screen.getByText("Expires in")).toBeTruthy();

      // 14:05: 61 250 sats due, 41 250 of them still to pay, until the sale's end (14:14).
      await act(async () => jest.advanceTimersByTimeAsync(PERIOD_END * 1000 + 1000 - Date.now()));
      await waitFor(() => expect(asked).toHaveLength(3));
      expect(asked[2].searchParams.get("amount")).toBe("41250000");
      expect(Number(asked[2].searchParams.get("expiry"))).toBeLessThanOrEqual(540);
      await waitFor(() =>
        expect(screen.getByTestId("qr-value").props.children).toMatch(
          new RegExp(`^bitcoin:${ONCHAIN}\\?amount=0\\.0004125&lightning=lnbc`)
        )
      );
      expect(
        within(screen.getByTestId("underpaid-chain")).getByLabelText("41'250 sats")
      ).toBeTruthy();

      settled.add(pageHash(2));
      expect(await screen.findByText("Confirming", undefined, WAIT)).toBeTruthy();
    });
  });

  describe("final versions", () => {
    /** The final version of a sale paid with the point of sale's invoice, at 50 000 CHF/BTC. */
    function paidFinal(link: PaymentLink): FinalPayload {
      const invoice = posInvoice(7, 3600);
      return {
        status: "paid",
        received: "49000",
        due: "49000",
        point: { hour: HOUR_END - 2 * 3600, rate: 50000 },
        lightning: [{ invoice: invoice.pr, preimage: preimagePair(7).preimage }],
        onchain: null,
        link: link.event.pubkey
      };
    }

    it("shows a paid sale as its final version says, following nothing any more", async () => {
      // Made an hour ago, on-chain too: the address nothing paid is left out of the final version.
      const { link } = newLink(ONCHAIN, -3000);
      await publishPaymentLink(link);
      await publishLinkEvent(
        finalLinkEvent(link, link.event.created_at, paidFinal(link)),
        link.secretKey
      );
      jest.mocked(globalThis.fetch).mockClear();
      await openLink();

      expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
      await act(async () => jest.advanceTimersByTimeAsync(DECLARATIONS_INTERVAL_MS));
      // Neither the LNURL server, the explorers nor CoinGecko: the proofs are in the link.
      expect(jest.mocked(globalThis.fetch)).not.toHaveBeenCalled();
      expect(mempool.chain.calls).toHaveLength(0);
      expect(mockRateReads).not.toHaveBeenCalledWith("CHF");
      expect(asked).toHaveLength(0);
      expect(screen.queryByTestId("qr-value")).toBeNull();
    });

    it("shows the owner's final version of an expired sale", async () => {
      const { link, payload } = newLink(ONCHAIN, -4 * 3600);
      await publishPaymentLink(link);
      const expired: FinalPayload = {
        status: "expired",
        received: "0",
        due: null,
        point: null,
        lightning: [],
        onchain: null,
        link: link.event.pubkey
      };
      await publishLinkEvent(
        ownerFinalLinkEvent(OWNER_SECRET, link.id, link.key, payload, expired),
        saleOwnerSecretKey(OWNER_SECRET, link.key)
      );
      await openLink();

      expect(await screen.findByText("Expired", undefined, WAIT)).toBeTruthy();
      expect(mempool.chain.calls).toHaveLength(0);
    });

    it("shows a sale the owner canceled while it lasts, without any code to pay", async () => {
      // Still running: the owner removed the employee who made it.
      const { link, payload } = newLink(ONCHAIN, -60);
      await publishPaymentLink(link);
      const canceled: FinalPayload = {
        status: "canceled",
        received: "0",
        due: null,
        point: null,
        lightning: [],
        onchain: null,
        link: link.event.pubkey
      };
      await publishLinkEvent(
        ownerFinalLinkEvent(OWNER_SECRET, link.id, link.key, payload, canceled),
        saleOwnerSecretKey(OWNER_SECRET, link.key)
      );
      jest.mocked(globalThis.fetch).mockClear();
      await openLink();

      expect(await screen.findByText("Canceled", undefined, WAIT)).toBeTruthy();
      expect(
        screen.getByText(
          "Fine Bakery canceled this payment request: do not pay it. Ask Fine Bakery for a new link."
        )
      ).toBeTruthy();
      await act(async () => jest.advanceTimersByTimeAsync(DECLARATIONS_INTERVAL_MS));
      // Nothing followed nor asked any more: no invoice, no address.
      expect(asked).toHaveLength(0);
      expect(mempool.chain.calls).toHaveLength(0);
      expect(screen.queryByTestId("qr-value")).toBeNull();
    });

    it("shows its cancellation as soon as a relay takes it, without a reload", async () => {
      const { link, payload } = newLink();
      await publishPaymentLink(link);
      await openLink();
      expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
      expect(screen.getByTestId("qr-value")).toBeTruthy();
      // A subscription is open on each of the link's relays.
      expect(new Set([...relays.watches].map(({ relay }) => relay))).toEqual(
        new Set(PAYMENT_LINK_RELAYS)
      );
      const before = queries().length;

      // The owner cancels the sale while the page shows its code.
      await act(() =>
        publishLinkEvent(
          ownerFinalLinkEvent(OWNER_SECRET, link.id, link.key, payload, {
            status: "canceled",
            received: "0",
            due: null,
            point: null,
            lightning: [],
            onchain: null,
            link: link.event.pubkey
          }),
          saleOwnerSecretKey(OWNER_SECRET, link.key)
        )
      );
      await act(async () => jest.advanceTimersByTimeAsync(0));

      expect(screen.getByText("Canceled")).toBeTruthy();
      expect(screen.queryByTestId("qr-value")).toBeNull();
      expect(screen.queryByTestId("open-wallet")).toBeNull();
      // Nothing read the link again: the subscription brought it. Then nothing is followed.
      expect(
        queries()
          .slice(before)
          .filter(({ filter }) => filter?.authors?.includes(link.event.pubkey))
      ).toHaveLength(0);
      expect(relays.watches.size).toBe(0);
    });

    it("shows an underpaid sale as its final version says, with its transactions", async () => {
      const { link } = newLink(ONCHAIN, -4 * 3600);
      await publishPaymentLink(link);
      const underpaid: FinalPayload = {
        status: "underpaid",
        received: "20000",
        due: "49000",
        point: { hour: HOUR_END - 2 * 3600, rate: 50000 },
        lightning: [],
        onchain: {
          address: ONCHAIN,
          transactions: [
            { txid: "cd".repeat(32), receivedAt: Date.now() - 4 * 3600 * 1000, sats: "20000" }
          ],
          sats: "20000"
        },
        link: link.event.pubkey
      };
      await publishLinkEvent(
        finalLinkEvent(link, link.event.created_at, underpaid),
        link.secretKey
      );
      await openLink();

      expect(await screen.findByText("Underpaid", undefined, WAIT)).toBeTruthy();
      expect(
        within(screen.getByTestId("underpaid-chain")).getByLabelText("29'000 sats")
      ).toBeTruthy();
      const received = within(screen.getByTestId("received-transactions"));
      expect(received.getAllByTestId("received-transaction")).toHaveLength(1);
      expect(received.getByLabelText("20'000 sats")).toBeTruthy();
      expect(received.getByText("Confirmed")).toBeTruthy();
      // Following nothing any more.
      expect(mempool.chain.calls).toHaveLength(0);
      expect(asked).toHaveLength(0);
    });

    it("shows a sale the business accepted short of its amount as paid, never as underpaid", async () => {
      const { link } = newLink(ONCHAIN, -4 * 3600);
      await publishPaymentLink(link);
      // 5 % short on-chain, within the business's tolerance, which its final version never names.
      const accepted: FinalPayload = {
        status: "paid",
        received: "46550",
        due: "49000",
        point: { hour: HOUR_END - 2 * 3600, rate: 50000 },
        lightning: [],
        onchain: {
          address: ONCHAIN,
          transactions: [
            { txid: "cd".repeat(32), receivedAt: Date.now() - 4 * 3600 * 1000, sats: "46550" }
          ],
          sats: "46550"
        },
        link: link.event.pubkey,
        accepted: true
      };
      await publishLinkEvent(finalLinkEvent(link, link.event.created_at, accepted), link.secretKey);
      await openLink();

      expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
      expect(screen.queryByText("Underpaid")).toBeNull();
      expect(screen.queryByTestId("underpaid-chain")).toBeNull();
      expect(screen.queryByTestId("qr-value")).toBeNull();
      // Its transaction confirmed: a sale is paid on-chain only then.
      const details = within(screen.getByTestId("payment-details"));
      expect(details.getByTestId("details-method")).toHaveTextContent("Bitcoin");
      expect(details.getByLabelText("Confirmed")).toHaveTextContent(/3\/3$/);
      expect(details.getByLabelText(txLinkLabel("cd".repeat(32)))).toBeTruthy();
      // Following nothing any more.
      expect(mempool.chain.calls).toHaveLength(0);
    });

    it("shows no confirmations of a final version's transaction when its invoice paid it all", async () => {
      // Made 4 hours ago: paid by the point of sale's invoice, and on-chain too.
      const { link, payload } = newLink(ONCHAIN, -4 * 3600);
      await publishPaymentLink(link);
      const invoice = posInvoice(7, 4 * 3600 + 300);
      const paid: FinalPayload = {
        status: "paid",
        received: "54000",
        due: "49000",
        point: { hour: HOUR_END - 5 * 3600, rate: 50000 },
        lightning: [{ invoice: invoice.pr, preimage: preimagePair(7).preimage }],
        onchain: {
          address: ONCHAIN,
          transactions: [
            { txid: "cd".repeat(32), receivedAt: Date.now() - 4 * 3600 * 1000, sats: "5000" }
          ],
          sats: "5000"
        },
        link: link.event.pubkey
      };
      await publishLinkEvent(finalLinkEvent(link, link.event.created_at, paid), link.secretKey);
      await openLink();

      expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
      const details = within(screen.getByTestId("payment-details"));
      expect(details.getByTestId("details-method")).toHaveTextContent("Bitcoin + Lightning");
      // Published as soon as the invoice was paid: however deep its transaction was, not known.
      expect(details.getByLabelText(txLinkLabel("cd".repeat(32)))).toBeTruthy();
      expect(details.queryByTestId("tx-confirmations")).toBeNull();
      // The sale's start: 10 minutes before its end.
      expect(details.getByTestId("details-created")).toHaveTextContent(
        createdOn(payload.endsAt - 600)
      );
    });

    it("takes the final version a slower relay holds over the link it showed", async () => {
      const { link } = newLink(null, -3000);
      relays.stored.set(PAYMENT_LINK_RELAYS[0], [link.event]);
      relays.stored.set(PAYMENT_LINK_RELAYS[PAYMENT_LINK_RELAYS.length - 1], [
        finalLinkEvent(link, link.event.created_at, paidFinal(link))
      ]);
      await openLink();

      expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
    });
  });

  it("reads no link of version 1 or 2 any more: their URL named a UUID", async () => {
    fragment = `#3f2a9c1e-1234-8abc-8def-0123456789ab.${bytesToBase64Url(new Uint8Array(32).fill(42))}`;
    await openLink();
    expect(
      await screen.findByText(
        "This link is incomplete. Check that it was copied in full, or ask the merchant for a new one.",
        undefined,
        WAIT
      )
    ).toBeTruthy();
    expect(queries()).toHaveLength(0);
  });

  it("still sends the point of sale without a profile to the welcome screen", async () => {
    const router = await renderRouter(routes, { initialUrl: "/pos" });
    await waitFor(() => expect(router.getPathname()).toBe("/"));
  });
});
