import "@/i18n";

import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { router as expoRouter } from "expo-router";
import { act, fireEvent, renderRouter, screen, waitFor, within } from "expo-router/testing-library";
import {
  AppState,
  Keyboard,
  Linking,
  Share,
  StyleSheet,
  type AppStateStatus,
  type StyleProp,
  type TextStyle,
  type ViewStyle
} from "react-native";
import { KeyboardEvents } from "react-native-keyboard-controller";

import LaunchScreen from "@/app/index";
import BasketScreen from "@/app/(app)/pos/basket";
import ChargeScreen from "@/app/(app)/pos/charge";
import AmountScreen from "@/app/(app)/pos/index";
import { KEY_HEIGHT, KEYPAD_HEIGHT, KEYPAD_MIN_HEIGHT } from "@/components/ui/Keypad";
import { POS_COLUMN_WIDTH } from "@/features/terminal/PosFrame";
import AppLayout from "@/app/(app)/_layout";
import IntegrationsScreen from "@/app/(app)/integrations";
import PosLayout from "@/app/(app)/pos/_layout";
import { MEMPOOL_API_URL, ONCHAIN_RESYNC_INTERVAL_MS } from "@/config/onchain";
import { closeAccount } from "@/features/account/session";
import { DEFAULT_RELAYS as PAYMENT_LINK_RELAYS } from "@/config/relays";
import { FINALIZE_INTERVAL_MS } from "@/features/payment-link/PendingLinksFinalizer";
import { VEIL_DELAY_MS } from "@/features/terminal/PaidArrival";
import { SALES_FOLLOW_INTERVAL_MS } from "@/features/terminal/SalesFollower";
import { applyLot, lotAddresses } from "@/features/team/member-addresses";
import { saveCatalogKeys } from "@/features/terminal/catalog-key";
import type { NostrEvent } from "@/lib/nostr/event";
import { EXPIRY_GRACE_SECONDS, resetPayRequests } from "@/features/terminal/invoice";
import { resetLinkedAddresses } from "@/features/terminal/onchain-pool";
import { savePosOptions } from "@/features/terminal/options";
import { publishTerminalProfile } from "@/features/terminal/profile-cache";
import { saveBusinessRegistry } from "@/features/terminal/registry-key";
import { receivedRetryMs } from "@/features/onchain/ask-again";
import { DECLARATIONS_INTERVAL_MS, UNIQUENESS_SLOW_SECONDS } from "@/features/terminal/useSale";
import { decodeBolt11 } from "@/lib/lightning/bolt11";
import { onchainPaymentAddress } from "@/lib/registry/onchain-payments";
import { articleEvent, newArticleId, publishArticle, type Article } from "@/lib/catalog/article";
import { channelCatalogOf } from "@/lib/catalog/reader";
import { publishToRelays } from "@/lib/nostr/pool";
import { openRecord, sealRecord } from "@/lib/nostr/record";
import type { Invoice } from "@/lib/lightning/lnurl";
import {
  fetchPaymentLink,
  parsePaymentLinkFragment,
  saleLinkAddress
} from "@/lib/payment-link/link";
import { loadPendingLinks } from "@/lib/payment-link/pending";
import { clockOffsetSeconds } from "@/lib/clock";
import { signEvent } from "@/lib/nostr/event";
import { nostrKeys } from "@/lib/nostr/keys";
import {
  declarationEvent,
  declareInvoice,
  deriveSaleKeys,
  fetchDeclaredInvoices,
  outerKey,
  ownerDeclarations,
  registryAddress,
  saleRegistry,
  takerTag,
  type DeclaredSale,
  type Registry
} from "@/lib/registry/registry";
import { encodeWalletSecret } from "@/lib/breez/secret";
import { openLinkKey } from "@/lib/payment-link/sealed-key";
import { channelEvent } from "@/lib/team/channel";
import {
  deriveBusinessRegistry,
  deriveCatalogReader,
  deriveCatalogWriter,
  deriveMemberKeys,
  deriveLinkOwner,
  deriveRegistryReader,
  deriveTeamKeys,
  memberSecret,
  ownerDeviceSecret,
  ownerDevicesSecret,
  ownerTakerKey
} from "@/lib/team/keys";
import { fetchLinks, fetchSales } from "@/lib/team/member-records";
import { saveMembership } from "@/lib/team/membership-store";
import { saveOwnerDeviceRecord } from "@/lib/team/owner-device-store";
import { resetOwnerDeviceCache } from "@/features/team/owner-device";
import { loadMemberActivity, readOwnerRecords } from "@/features/activity/load";
import { readOnchainSales } from "@/features/activity/onchain-sales";
import { NO_SEATS, type Seats } from "@/features/activity/takers";
import { memberActivity, ownerActivity } from "@/features/activity/model";
import { loadFollowedSales } from "@/features/terminal/sale-follow";
import { SALE_ACCEPTANCE_POLL_MS } from "@/features/terminal/useSaleAcceptance";
import { saleOwnerSecretKey } from "@/lib/payment-link/owner-key";
import { publishSaleAcceptance, saleAcceptanceEvent } from "@/lib/registry/sale-acceptance";
import type { WalletPayment } from "@/lib/breez/types";
import { loadOnchainPool, saveOnchainPool, saveTerminalProfile } from "@/lib/terminal/profile";
import { gutter, lightColors as colors, sans } from "@/theme";

import { openTestAccount } from "../../jest/account";
import { taprootAddress } from "../../jest/bitcoin";
import { makeInvoice, metadataHash, preimagePair } from "../../jest/lightning";
import { posScreens } from "../../jest/router";
import type * as CameraFake from "../../jest/expo-camera";
import type * as MempoolFake from "../../jest/mempool";
import type * as RelaysFake from "../../jest/nostr-relays";

// The point of each hour (src/lib/rates/ is tested on its own): 50 000 CHF per bitcoin unless a
// test sets another. A point prices from 5 minutes after its hour, for an hour (pointHourOf).
const mockPoints = new Map<number, number>();
const mockPointOf = (hour: number) => mockPoints.get(hour) ?? 50000;
const mockSources = () =>
  jest.requireActual<typeof import("../lib/rates/sources")>("../lib/rates/sources");
// The app's clock, corrected by the invoices' dates (src/lib/clock.ts), as the real useRate reads it.
const mockClock = () => jest.requireActual<typeof import("../lib/clock")>("../lib/clock");
const mockHourNow = () => mockSources().pointHourOf(mockClock().nowUnix());
jest.mock("../features/terminal/useRate", () => {
  /* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories are synchronous */
  const { useEffect, useState } = require("react") as typeof import("react");
  /* eslint-enable @typescript-eslint/no-require-imports */
  return {
    // The point that prices the present, on the test's clock: read again when its period ends.
    useRate: () => {
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
      return {
        rate: mockPointOf(hour),
        hour,
        loading: false,
        current: () => mockPointOf(mockHourNow())
      };
    }
  };
});
// The points of past hours, for the payments made then and the hours since.
jest.mock("../lib/rates/sources", () => ({
  ...jest.requireActual("../lib/rates/sources"),
  fetchHourPoint: async (_currency: string, hour: number) => mockPointOf(hour),
  fetchHourPoints: async (_currency: string, from: number, to: number) => {
    const points = new Map<number, number>();
    for (let hour = from; hour <= to; hour += 3600) points.set(hour, mockPointOf(hour));
    return points;
  }
}));
jest.mock("../lib/breez/config", () => ({
  ...jest.requireActual("../lib/breez/config"),
  getBreezNetwork: () => "mainnet"
}));
// The staging web app receives the payment links (the app config has no variant under Jest).
const mockLinkOrigin = jest.fn<string | null, []>(() => "https://web.example");
jest.mock("../config/payment-links", () => ({
  ...jest.requireActual("../config/payment-links"),
  getPaymentLinkOrigin: () => mockLinkOrigin()
}));
// Mobile layouts, unless a test asks for the desktop ones.
const mockDesktop = jest.fn(() => false);
jest.mock("@/components/layout/useIsDesktop", () => ({
  ...jest.requireActual("@/components/layout/useIsDesktop"),
  useIsDesktop: () => mockDesktop()
}));
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
// No NFC reader under Jest, unless a test gives one (`mockNfc`): the BoltCard line is hidden. A
// reader reads `mockNfc.lnurl` once, then waits for a card that never comes.
const mockNfc = { reading: "none", lnurl: "", read: 0 };
jest.mock("../lib/nfc/boltcard", () => ({
  getCardReading: async () => mockNfc.reading,
  isReadCancelled: () => false,
  readCard: () => ({
    lnurl: mockNfc.read++ === 0 ? Promise.resolve(mockNfc.lnurl) : new Promise<string>(() => {}),
    cancel: () => undefined
  })
}));
afterEach(() => {
  mockNfc.reading = "none";
  mockNfc.read = 0;
});

// The in-memory relays and Bitcoin chain of jest.setup.ts.
const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const mempool = jest.requireMock<typeof MempoolFake>("../lib/onchain/esplora");
const camera = jest.requireMock<typeof CameraFake>("expo-camera");

const WALLET = "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";
const ADDRESS = "sattleme02c6047f94@breez.tips";
/** The profile's backup key: any, the point of sale never checks it. */
const BACKUP_KEY = "ab".repeat(32);
const METADATA = `[["text/plain","Fine Bakery"],["text/identifier","${ADDRESS}"]]`;

const routes = {
  index: LaunchScreen,
  "(app)/_layout": AppLayout,
  "(app)/pos/_layout": PosLayout,
  "(app)/pos/index": AmountScreen,
  "(app)/pos/charge": ChargeScreen,
  "(app)/pos/basket": BasketScreen,
  // A destination to leave the point of sale for (unlocked).
  "(app)/integrations": IntegrationsScreen
};

type Service = {
  /** Invoices asked, with their query. */
  asked: URL[];
  settled: Set<string>;
  /** Seconds the invoices are already old when issued, by the server's clock. */
  age: number;
  /** How far ahead of the test's clock the server dates its invoices, a fraction of a second. */
  skew: number;
  /** Lifetime of the invoices, instead of the one asked (to see them expire). */
  expiry?: number;
  /** The verify endpoint answers an error (an invoice it no longer knows). */
  verifyRefused?: boolean;
  /** The verify endpoint answers "settled" without the preimage (no proof of payment). */
  settledWithoutProof?: boolean;
  /** The verify endpoint fails as breez.tips does on a database error. */
  verifyFails?: boolean;
  /** Out of reach once it made this many invoices. */
  downAfter?: number;
  /** The payRequest's bounds (msat). */
  minSendable: number;
  maxSendable: number;
  /** An invoice of this server for `sats`, asked elsewhere (the payer's page): preimage pair `n`. */
  make: (sats: bigint, n: number) => Invoice;
};

/** The Breez LNURL server, answering over a fake fetch. */
function lnurlService(): Service {
  const pairs = new Map<string, string>();
  // The invoice the server made under each payment hash: LUD-21 verify answers name it (`pr`).
  const made = new Map<string, string>();
  const service: Service = {
    asked: [],
    settled: new Set(),
    age: 0,
    skew: 0,
    minSendable: 1000,
    maxSendable: 4_000_000_000,
    make: (sats, n) => {
      const { preimage, paymentHash } = preimagePair(n);
      pairs.set(paymentHash, preimage);
      const pr = makeInvoice({
        amountMsat: sats * 1000n,
        paymentHash,
        descriptionHash: metadataHash(METADATA),
        timestamp: Math.floor(Date.now() / 1000 + service.skew) - service.age,
        expirySeconds: 600
      });
      made.set(paymentHash, pr);
      return {
        pr,
        decoded: decodeBolt11(pr)!,
        verifyUrl: `https://breez.tips/verify/${paymentHash}`
      };
    }
  };
  let next = 1;
  jest.mocked(globalThis.fetch).mockImplementation(async (input) => {
    const url = new URL(String(input));
    const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
    if (url.pathname === "/.well-known/lnurlp/sattleme02c6047f94") {
      return json({
        tag: "payRequest",
        callback: "https://breez.tips/lnurlp/sattleme02c6047f94/invoice",
        minSendable: service.minSendable,
        maxSendable: service.maxSendable,
        metadata: METADATA,
        commentAllowed: 255
      });
    }
    if (url.pathname === "/lnurlp/sattleme02c6047f94/invoice") {
      if (service.downAfter !== undefined && service.asked.length >= service.downAfter) {
        throw new TypeError("Network request failed");
      }
      service.asked.push(url);
      const { preimage, paymentHash } = preimagePair(next++);
      pairs.set(paymentHash, preimage);
      const pr = makeInvoice({
        amountMsat: BigInt(url.searchParams.get("amount")!),
        paymentHash,
        descriptionHash: metadataHash(METADATA),
        timestamp: Math.floor(Date.now() / 1000 + service.skew) - service.age,
        expirySeconds: service.expiry ?? Number(url.searchParams.get("expiry"))
      });
      made.set(paymentHash, pr);
      return json({ pr, verify: `https://breez.tips/verify/${paymentHash}` });
    }
    if (url.pathname.startsWith("/verify/") && service.verifyFails) {
      return json({ status: "ERROR", reason: "Internal server error" });
    }
    if (url.pathname.startsWith("/verify/") && service.verifyRefused) {
      return json({ status: "ERROR", reason: "Not found" });
    }
    if (url.pathname.startsWith("/verify/") && service.settledWithoutProof) {
      const pr = made.get(url.pathname.slice("/verify/".length));
      return json({ status: "OK", settled: true, preimage: null, pr });
    }
    if (url.pathname.startsWith("/verify/")) {
      const hash = url.pathname.slice("/verify/".length);
      const settled = service.settled.has(hash);
      const pr = made.get(hash);
      return json({ status: "OK", settled, preimage: settled ? pairs.get(hash) : null, pr });
    }
    throw new TypeError("Network request failed");
  });
  return service;
}

function lastPaymentHash(service: Service): string {
  // The verify URL ends with the payment hash of the last invoice: the n-th preimage pair.
  return preimagePair(service.asked.length).paymentHash;
}

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

/** The business's registry key (src/lib/registry/). */
const REGISTRY_KEY = hexToBytes("cd".repeat(32));
/** What declarations made by the tests themselves say of their sale. */
const DECLARED: DeclaredSale = { fiat: { minor: 2450, digits: 2, currency: "CHF" }, note: "" };
/** The business's reading key (deriveRegistryReader): any, the tests never read as the owner. */
const REGISTRY_READER = "52d64e4fbc5670d62bad80c169aac897172117ce88c4978506f0c7dd9675ff18";
/** The business's link owner key (deriveLinkOwner), its public half: of the same test team. */
const LINK_OWNER = "755748c663a1eb5ab3e6810507b1bbd0bcbd2acd02dcd2eb9cf3b5acba99e426";
/** The business's registry on the device. */
const BUSINESS = { key: REGISTRY_KEY, reader: REGISTRY_READER, owner: LINK_OWNER };

/**
 * The owner's device, at `at`: with the business's registry key (saved once its account was open),
 * unless `registry` is false.
 */
async function openPos(at = START, { registry = true }: { registry?: boolean } = {}) {
  setClock(at);
  await saveTerminalProfile({
    version: 2,
    walletId: WALLET,
    backupKey: BACKUP_KEY,
    lightningAddress: ADDRESS,
    businessName: "Fine Bakery",
    currency: "CHF"
  });
  if (registry) {
    await saveBusinessRegistry(WALLET, BUSINESS);
  }
  const router = await renderRouter(routes, { initialUrl: "/" });
  await waitFor(() => expect(router.getPathname()).toBe("/pos"));
  // Not the router itself: an async function would unwrap the promise it also is.
  return { router };
}

async function type(...keys: string[]) {
  for (const key of keys) await fireEvent.press(screen.getByTestId(`key-${key}`));
}

/** Writes the note under the amount, then "OK" on the keyboard. */
async function writeNote(note: string) {
  await fireEvent.press(screen.getByTestId("add-note"));
  await fireEvent.changeText(screen.getByTestId("note-field"), note);
  await fireEvent(screen.getByTestId("note-field"), "submitEditing");
}

/** The font family a text is drawn in. */
function fontOf(node: ReturnType<typeof screen.getByText>): unknown {
  return StyleSheet.flatten(node.props.style as StyleProp<TextStyle>)?.fontFamily;
}

/** This device's account open (unlocked): the other destinations open. Closed before each test. */
async function unlockPos() {
  await act(() =>
    openTestAccount(undefined, async () => ({ payoutCurrency: "CHF", detectedCountry: "CH" }))
  );
}

/** The dot of "Charge" in the side bar (decorative: found with the hidden elements only). */
const sidebarDot = () =>
  screen.queryByTestId("sidebar-pos-pending", { includeHiddenElements: true });
const sidebarLabel = () => screen.getByTestId("sidebar-pos").props.accessibilityLabel;

// Several tests wait out an invoice's end in fake time: seconds of real time each, more on a loaded
// machine (the whole suite in parallel, CI). Past Jest's default 5 s, a test stopped mid-act() left
// the act() environment broken for the tests after it.
jest.setTimeout(30_000);

const WAIT = { timeout: 6000 };

/**
 * Past an invoice's end and the 2 minutes its payment may still be reported (invoice.ts): until
 * then, the screen says nothing about an ended invoice.
 */
async function pastGrace() {
  await act(async () => jest.advanceTimersByTimeAsync((EXPIRY_GRACE_SECONDS + 5) * 1000));
}

// The link's author and the sale's key in the fragment: the web app's host never receives them.
const LINK = /^https:\/\/web\.example\/pay(#[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]+)$/;

function mockShare() {
  // The spy of an earlier test, if any: its calls are cleared.
  return jest
    .spyOn(Share, "share")
    .mockClear()
    .mockResolvedValue({ action: Share.sharedAction, activityType: undefined });
}

/** The link of the share sheet's `call`-th opening (iOS shares it as a URL). */
function sharedLink(share: ReturnType<typeof mockShare>, call = 0) {
  const { url } = share.mock.calls[call][0] as { url: string };
  const ref = parsePaymentLinkFragment(LINK.exec(url)?.[1] ?? "");
  if (ref?.kind !== "sale") throw new Error(`Not a payment link: ${url}`);
  return { url, ref, id: ref.author, key: ref.key };
}

/** Where the declarations of the first invoices of the LNURL server go (src/lib/registry/). */
const DECLARATION_ADDRESSES = new Set([
  ...Array.from({ length: 100 }, (_, i) =>
    registryAddress(REGISTRY_KEY, preimagePair(i + 1).paymentHash)
  ),
  // And of the transactions the fake chain makes (jest/mempool.ts: its txids count up), which the
  // point of sale declares once seen paying its sale's address (onchain-payments.ts).
  ...Array.from({ length: 100 }, (_, i) =>
    onchainPaymentAddress(REGISTRY_KEY, (i + 1).toString(16).padStart(64, "0"))
  )
]);

/** The `d` tag of an event. */
function dTag(event: NostrEvent | undefined): string | undefined {
  return event?.tags.find(([name]) => name === "d")?.[1];
}

function isDeclaration(event: NostrEvent | undefined): boolean {
  const address = event?.tags.find(([name]) => name === "d")?.[1];
  return address !== undefined && DECLARATION_ADDRESSES.has(address);
}

/** Publications of payment links. */
const publications = () =>
  relays.calls.filter((call) => call.operation === "publish" && !isDeclaration(call.event));
/** Publications of declarations. */
const declarations = () =>
  relays.calls.filter((call) => call.operation === "publish" && isDeclaration(call.event));
/** The payment links a relay holds. */
const storedLinks = (relay: string) =>
  (relays.stored.get(relay) ?? []).filter((event) => !isDeclaration(event));

/** The sale's registry, from its link's key (the sale's own). */
function registryOf(key: Uint8Array): Registry {
  return saleRegistry(BUSINESS, key);
}

/** The business whose catalogue the point of sale reads ("Items", the scan). */
const CATALOG_TEAM = deriveTeamKeys(encodeWalletSecret({ entropy: new Uint8Array(32).fill(0x22) }));
const WATER_CODE = "7610097111072";
const TEA_CODE = "7613035974685";
const SANDWICH_CODE = "4006381333931";

function barcodeArticle(name: string, minor: number, barcode: string, createdAt: number): Article {
  return {
    version: 1,
    id: newArticleId(),
    name,
    description: "",
    price: { minor, digits: 2, currency: "CHF" },
    image: null,
    barcode,
    createdAt,
    updatedAt: createdAt
  };
}

// 3.50 and 4.50 CHF at 50 000 CHF/BTC: 7 000 and 9 000 sats.
const water = barcodeArticle("Mineral water 50 cl", 350, WATER_CODE, 1_790_000_002);
const tea = barcodeArticle("Iced tea", 450, TEA_CODE, 1_790_000_001);

/** `articles` in the business's catalogue, and its keys on the device, for its point of sale. */
async function catalogOf(articles: Article[]) {
  await saveCatalogKeys(WALLET, channelCatalogOf(deriveCatalogReader(CATALOG_TEAM, 0), 0));
  const keys = deriveCatalogWriter(CATALOG_TEAM, 0);
  for (const article of articles) {
    await publishArticle(articleEvent(keys, article), {
      relays: PAYMENT_LINK_RELAYS,
      channel: "account",
      timeoutMs: 1000,
      authKey: keys.nostr.secretKey
    });
  }
}

/** "Scan" chosen in the point of sale's selector, `codes` read there. */
async function scanArticles(...codes: string[]) {
  await waitFor(() => expect(screen.getByTestId("pos-mode-scan")).toBeTruthy());
  await fireEvent.press(screen.getByTestId("pos-mode-scan"));
  for (const code of codes) await act(async () => camera.scan(code));
}

describe("point of sale", () => {
  beforeEach(() => {
    mockPoints.clear();
    closeAccount();
    resetPayRequests();
    // The addresses a shared sale kept are this session's (onchain-pool.ts).
    resetLinkedAddresses();
    relays.resetRelays();
    mockLinkOrigin.mockReturnValue("https://web.example");
    mockDesktop.mockReturnValue(false);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("composes the amount live, with its sats, and only charges a positive amount", async () => {
    await openPos();
    // The owner's device: the selector over the keypad, "Amount" chosen.
    expect(screen.getByTestId("pos-mode-amount").props.accessibilityState).toMatchObject({
      checked: true
    });
    // Nothing typed: "0", without decimals.
    expect(screen.getByLabelText("0 CHF")).toBeTruthy();
    expect(screen.queryByText("0.00")).toBeNull();
    expect(screen.getByTestId("charge").props.accessibilityState.disabled).toBe(true);

    await type("2");
    expect(screen.getByLabelText("0.02 CHF")).toBeTruthy();
    await type("4", "5", "0");

    expect(screen.getByText("24.50")).toBeTruthy();
    // The point of sale's amount in Bold (AmountBlock `bold`), its keys in SemiBold.
    expect(fontOf(screen.getByText("24.50"))).toBe(sans(700).fontFamily);
    expect(fontOf(screen.getByText("7"))).toBe(sans(600).fontFamily);
    // 24.50 CHF at 50 000 CHF/BTC: 49 000 sats.
    // Grouped as the device locale writes numbers (fr-CH: a narrow no-break space).
    expect(screen.getByLabelText("49'000 sats")).toBeTruthy();
    expect(screen.getByTestId("charge").props.accessibilityState.disabled).toBe(false);
    expect(screen.getByLabelText("Charge 24.50 CHF")).toBeTruthy();

    await type("del", "del", "del", "del");
    expect(screen.getByLabelText("0 CHF")).toBeTruthy();
  });

  it("shows the invoice, sees its payment, then goes back to a fresh keypad", async () => {
    const service = lnurlService();
    const { router } = await openPos();
    await type("2", "4", "5", "0");
    await writeNote("Table 12");
    await fireEvent.press(screen.getByTestId("charge"));

    expect(router.getPathname()).toBe("/pos/charge");
    expect(await screen.findByText("Waiting for the payment")).toBeTruthy();
    // The note under the amount, once: not in the header.
    expect(screen.getAllByText("Table 12")).toHaveLength(1);
    expect(screen.getByTestId("sale-note")).toHaveTextContent("Table 12");
    expect(fontOf(screen.getByText("24.50"))).toBe(sans(700).fontFamily);
    expect(service.asked).toHaveLength(1);
    expect(service.asked[0].searchParams.get("amount")).toBe("49000000");
    expect(service.asked[0].searchParams.get("comment")).toBe("Table 12");
    // The sale's 10 minutes, exactly: asked when the service dates it in the middle of a second.
    expect(service.asked[0].searchParams.get("expiry")).toBe("600");
    expect(screen.getByText(/^(09:5\d|10:00)$/)).toBeTruthy();

    service.settled.add(lastPaymentHash(service));
    expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
    expect(fontOf(screen.getByText("24.50"))).toBe(sans(700).fontFamily);
    // Paid too, under the amount.
    expect(screen.getAllByText("Table 12")).toHaveLength(1);
    expect(screen.getByTestId("sale-note")).toHaveTextContent("Table 12");

    await fireEvent.press(screen.getByTestId("back-to-pos"));
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    expect(screen.getByLabelText("0 CHF")).toBeTruthy();
    expect(screen.getByTestId("add-note")).toBeTruthy();
  });

  it("shows no note under the amount of a sale without one", async () => {
    lnurlService();
    await openPos();
    await type("5", "0", "0");
    await fireEvent.press(screen.getByTestId("charge"));
    expect(await screen.findByText("Waiting for the payment")).toBeTruthy();
    expect(screen.queryByTestId("sale-note")).toBeNull();
  });

  it("shows the note under the amount on desktop, the header keeping its own lines", async () => {
    const service = lnurlService();
    mockDesktop.mockReturnValue(true);
    await openPos();
    await type("5", "0", "0");
    await writeNote("Table 12");
    await fireEvent.press(screen.getByTestId("charge"));
    expect(await screen.findByText("Waiting for the payment")).toBeTruthy();
    expect(screen.getAllByText("Table 12")).toHaveLength(1);
    expect(screen.getByTestId("sale-note")).toHaveTextContent("Table 12");
    expect(screen.getByText("Accept bitcoin into your account quickly.")).toBeTruthy();

    service.settled.add(lastPaymentHash(service));
    expect(await screen.findByText(/^Lightning · /, undefined, WAIT)).toBeTruthy();
    expect(screen.getByTestId("sale-note")).toHaveTextContent("Table 12");
  });

  it("shows a spinner at once while the invoice is being created, then the code", async () => {
    lnurlService();
    await openPos();
    // The service answers once released.
    const answer = jest.mocked(globalThis.fetch).getMockImplementation()!;
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    jest.mocked(globalThis.fetch).mockImplementation(async (...args) => {
      await held;
      return answer(...args);
    });
    await type("5", "0", "0");
    await fireEvent.press(screen.getByTestId("charge"));

    expect(screen.getByText("Creating the request…")).toBeTruthy();
    // Decorative: the line above says what the screen waits for.
    expect(screen.queryByTestId("qr-spinner")).toBeNull();
    expect(screen.getByTestId("qr-spinner", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId("qr-code")).toBeNull();

    await act(async () => release());
    expect(await screen.findByText("Waiting for the payment")).toBeTruthy();
    expect(screen.getByTestId("qr-code")).toBeTruthy();
    await waitFor(() =>
      expect(screen.queryByTestId("qr-spinner", { includeHiddenElements: true })).toBeNull()
    );
  });

  it("says over the code why a card did not pay, in its service's words, then shows the code", async () => {
    lnurlService();
    // The card relay forwards the holder's app's sentence as it wrote it.
    const reason = "Insufficient card balance.";
    const answer = jest.mocked(globalThis.fetch).getMockImplementation()!;
    jest.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      if (url.host !== "relay.sattle.me") return answer(input, init);
      const body =
        url.pathname === "/w"
          ? {
              tag: "withdrawRequest",
              callback: "https://relay.sattle.me/cb/0123456789abcdef0123456789abcdef",
              k1: "a".repeat(64),
              minWithdrawable: 1000,
              maxWithdrawable: 100_000_000_000,
              payeeProof: true
            }
          : { status: "ERROR", reason };
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    mockNfc.reading = "auto";
    mockNfc.lnurl =
      "lnurlw://relay.sattle.me/w?p=00112233445566778899AABBCCDDEEFF&c=0011223344556677";
    await openPos();
    await type("5", "0", "0");
    await fireEvent.press(screen.getByTestId("charge"));
    expect(await screen.findByTestId("card-refusal-message", undefined, WAIT)).toHaveTextContent(
      reason
    );
    expect(screen.getByText("Card declined")).toBeTruthy();
    // Over the code, blurred: not offered while the refusal shows.
    expect(screen.queryByTestId("qr-code")).toBeNull();
    // The line under the code invites a card again.
    expect(screen.getByText("Or tap the BoltCard")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("card-refusal-show-code"));
    expect(screen.queryByTestId("card-refusal")).toBeNull();
    expect(screen.getByTestId("qr-code")).toBeTruthy();
  });

  it("leaves a fresh keypad behind a payment, however the paid screen is left", async () => {
    const service = lnurlService();
    const { router } = await openPos();
    await type("5", "0", "0");
    await fireEvent.press(screen.getByTestId("charge"));
    expect(await screen.findByText("Waiting for the payment")).toBeTruthy();
    service.settled.add(lastPaymentHash(service));
    expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();

    // The system's back (Android button, iOS swipe), not the screen's own button.
    await act(() => expoRouter.back());
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    expect(screen.getByLabelText("0 CHF")).toBeTruthy();
  });

  it("sees the payment of a sale whose note has a line break", async () => {
    const service = lnurlService();
    await openPos();
    await type("5", "0", "0");
    await writeNote("Table\n4");
    await fireEvent.press(screen.getByTestId("charge"));
    expect(await screen.findByText("Waiting for the payment")).toBeTruthy();
    await waitFor(() => expect(service.asked).toHaveLength(1));

    service.settled.add(lastPaymentHash(service));
    expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
  });

  describe("note written under the amount", () => {
    const field = () => screen.getByTestId("note-field");
    const editLabel = (note: string) => `Edit the note “${note}”`;

    it('is written in place, the keypad giving way to the keyboard, and kept with "OK"', async () => {
      const service = lnurlService();
      await openPos();
      await type("2", "4", "5", "0");
      await fireEvent.press(screen.getByTestId("add-note"));

      // No panel: the field takes the place of "Add a note", focused, the keyboard open.
      expect(field().props.autoFocus).toBe(true);
      expect(field().props.accessibilityLabel).toBe("Note for this payment");
      expect(field().props.placeholder).toBe("Table 12");
      expect(screen.getByText("0/100")).toBeTruthy();
      // Mobile: the keypad and "Charge" fade out of reach, under the keyboard.
      expect(screen.queryByTestId("key-7")).toBeNull();
      expect(screen.getByTestId("key-7", { includeHiddenElements: true })).toBeTruthy();
      expect(screen.queryByTestId("charge")).toBeNull();

      await fireEvent.changeText(field(), "Table 12");
      expect(screen.getByText("8/100")).toBeTruthy();
      await fireEvent(field(), "submitEditing");

      expect(screen.queryByTestId("note-field")).toBeNull();
      expect(screen.getByLabelText(editLabel("Table 12"))).toBeTruthy();
      expect(screen.getByText("Table 12")).toBeTruthy();
      await fireEvent.press(screen.getByTestId("charge"));
      expect(await screen.findByText("Waiting for the payment")).toBeTruthy();
      expect(service.asked[0].searchParams.get("comment")).toBe("Table 12");
    });

    it("keeps the note trimmed when the field is left, and clears it once emptied", async () => {
      await openPos();
      await fireEvent.press(screen.getByTestId("add-note"));
      await fireEvent.changeText(field(), "  Terrace  ");
      await fireEvent(field(), "blur");
      expect(screen.getByLabelText(editLabel("Terrace"))).toBeTruthy();
      expect(screen.getByTestId("key-7")).toBeTruthy();

      // Written again from the note itself, starting from it.
      await fireEvent.press(screen.getByTestId("note"));
      expect(field().props.value).toBe("Terrace");
      await fireEvent.changeText(field(), "   ");
      await fireEvent(field(), "submitEditing");
      expect(screen.queryByTestId("note")).toBeNull();
      expect(screen.getByTestId("add-note")).toBeTruthy();
    });

    it("counts once when OK and the field's blur both end the writing", async () => {
      await openPos();
      await fireEvent.press(screen.getByTestId("add-note"));
      const input = field();
      await fireEvent.changeText(input, "Table 4");
      await fireEvent(input, "submitEditing");
      // The field, taken away, then loses the focus: its last draft does not come back.
      await fireEvent(input, "blur");
      expect(screen.getByLabelText(editLabel("Table 4"))).toBeTruthy();
      expect(screen.queryByTestId("note-field")).toBeNull();
    });

    it("gives the note back as it was on Escape (web keyboards)", async () => {
      await openPos();
      await writeNote("Terrace");
      await fireEvent.press(screen.getByTestId("note"));
      await fireEvent.changeText(field(), "Table 4");
      await fireEvent(field(), "keyPress", { nativeEvent: { key: "Escape" } });
      expect(screen.queryByTestId("note-field")).toBeNull();
      expect(screen.getByLabelText(editLabel("Terrace"))).toBeTruthy();
    });

    it("takes 100 characters at most, the LNURL comment's room", async () => {
      await openPos();
      await fireEvent.press(screen.getByTestId("add-note"));
      expect(field().props.maxLength).toBe(100);
      await fireEvent.changeText(field(), "x".repeat(120));
      expect(screen.getByText("100/100")).toBeTruthy();
      await fireEvent(field(), "submitEditing");
      expect(screen.getByLabelText(editLabel("x".repeat(100)))).toBeTruthy();
    });

    /** The last listener of a keyboard event, as the field subscribed it. */
    const keyboardListener = (name: "keyboardDidShow" | "keyboardDidHide") => {
      const listener = jest
        .mocked(KeyboardEvents.addListener)
        .mock.calls.filter(([event]) => event === name)
        .at(-1)?.[1];
      expect(listener).toBeDefined();
      return () => act(async () => listener!({} as never));
    };

    it("ends the writing with the keyboard (Android's back leaves the field focused)", async () => {
      await openPos();
      await fireEvent.press(screen.getByTestId("add-note"));
      await fireEvent.changeText(field(), "Takeaway");
      await keyboardListener("keyboardDidShow")();
      await keyboardListener("keyboardDidHide")();
      expect(screen.queryByTestId("note-field")).toBeNull();
      expect(screen.getByLabelText(editLabel("Takeaway"))).toBeTruthy();
      expect(screen.getByTestId("key-7")).toBeTruthy();
    });

    it("is not ended by the keyboard of the writing before, still closing", async () => {
      await openPos();
      await writeNote("Terrace");
      // Pressed again at once: the keyboard closed by "OK" hides only now.
      await fireEvent.press(screen.getByTestId("note"));
      await keyboardListener("keyboardDidHide")();
      expect(field().props.value).toBe("Terrace");
      expect(screen.queryByTestId("key-7")).toBeNull();
    });

    it("gives the keypad back when the layout changes while writing", async () => {
      await openPos();
      await fireEvent.press(screen.getByTestId("add-note"));
      expect(screen.queryByTestId("key-7")).toBeNull();
      // Desktop then mobile again (window resized, tablet turned): the field is gone, not the keypad.
      mockDesktop.mockReturnValue(true);
      await act(async () => expoRouter.setParams({}));
      mockDesktop.mockReturnValue(false);
      await act(async () => expoRouter.setParams({}));
      expect(screen.queryByTestId("note-field")).toBeNull();
      expect(screen.getByTestId("add-note")).toBeTruthy();
      expect(screen.getByTestId("key-7")).toBeTruthy();
      expect(screen.getByTestId("charge")).toBeTruthy();
    });

    it('leaves the keypad and "Charge" in place on desktop', async () => {
      mockDesktop.mockReturnValue(true);
      await openPos();
      await type("5", "0", "0");
      await fireEvent.press(screen.getByTestId("add-note"));
      expect(field()).toBeTruthy();
      expect(screen.getByTestId("key-7")).toBeTruthy();
      expect(screen.getByTestId("charge")).toBeTruthy();
      await fireEvent.changeText(field(), "Table 12");
      await fireEvent(field(), "submitEditing");
      expect(screen.getByLabelText(editLabel("Table 12"))).toBeTruthy();
    });

    it("charges with the note still being written, as written (a tablet's hardware keyboard)", async () => {
      mockDesktop.mockReturnValue(true);
      const service = lnurlService();
      const dismiss = jest.spyOn(Keyboard, "dismiss");
      await openPos();
      await type("2", "4", "5", "0");
      await fireEvent.press(screen.getByTestId("add-note"));
      await fireEvent.changeText(field(), "  Table 12 ");
      // "Charge" taken without "OK": no blur came first.
      await fireEvent.press(screen.getByTestId("charge"));

      expect(await screen.findByText("Waiting for the payment")).toBeTruthy();
      await waitFor(() => expect(service.asked).toHaveLength(1));
      expect(service.asked[0].searchParams.get("comment")).toBe("Table 12");
      expect(screen.getByText("Table 12")).toBeTruthy();
      // The writing ended with it, its keyboard closed.
      expect(dismiss).toHaveBeenCalled();
      expect(screen.queryByTestId("note-field")).toBeNull();
      dismiss.mockRestore();
    });

    it("keeps the note on a tap elsewhere in the apps", async () => {
      const dismiss = jest.spyOn(Keyboard, "dismiss");
      await openPos();
      // Not writing: the screen takes no tap of its own.
      expect(screen.getByTestId("note-outside").props.onStartShouldSetResponder()).toBe(false);

      await fireEvent.press(screen.getByTestId("add-note"));
      await fireEvent.changeText(field(), "Terrace ");
      // A tap on the amount, or on the keypad faded out of reach (its taps go through).
      await fireEvent(screen.getByTestId("note-outside"), "responderRelease");
      expect(dismiss).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId("note-field")).toBeNull();
      expect(screen.getByLabelText(editLabel("Terrace"))).toBeTruthy();
      expect(screen.getByTestId("key-7")).toBeTruthy();
      dismiss.mockRestore();
    });

    it("keeps the note on a tap elsewhere on desktop too (a tablet)", async () => {
      mockDesktop.mockReturnValue(true);
      await openPos();
      await fireEvent.press(screen.getByTestId("add-note"));
      await fireEvent.changeText(field(), "Table 4");
      await fireEvent(screen.getByTestId("note-outside"), "responderRelease");
      expect(screen.queryByTestId("note-field")).toBeNull();
      expect(screen.getByLabelText(editLabel("Table 4"))).toBeTruthy();
    });
  });

  describe("on a short screen", () => {
    type HostNode = ReturnType<typeof screen.getByTestId>;
    const styleOf = (node: HostNode, prop: "style" | "contentContainerStyle" = "style") =>
      StyleSheet.flatten(node.props[prop] as StyleProp<ViewStyle>) ?? {};
    /** The views `node` is drawn in (host components), nearest first. */
    const around = (node: HostNode) => {
      const views: HostNode[] = [];
      for (let at = node.parent; at; at = at.parent) {
        if (typeof at.type === "string") views.push(at);
      }
      return views;
    };
    /** The row of the keypad's 7, 8 and 9. */
    const firstRow = () => around(screen.getByTestId("key-7"))[0]!;

    it("fits the keypad to the screen's height, never under the dock, and scrolls past its floor", async () => {
      await openPos();
      // Its keys keep KEY_HEIGHT while there is room, and give way down to the touch floor: the
      // keypad between the two, its rows sharing it (Jest has no layout: the web build measures it).
      expect(KEYPAD_HEIGHT).toBe(4 * KEY_HEIGHT + 3 * 4);
      expect((KEYPAD_MIN_HEIGHT - 3 * 4) / 4).toBe(44);
      expect(styleOf(firstRow())).toMatchObject({ flex: 1 });
      expect(styleOf(firstRow()).height).toBeUndefined();
      const views = around(firstRow());
      const keypad = views.find((view) => styleOf(view).maxHeight === KEYPAD_HEIGHT);
      expect(keypad && styleOf(keypad)).toMatchObject({
        flexGrow: 1,
        minHeight: KEYPAD_MIN_HEIGHT,
        maxHeight: KEYPAD_HEIGHT
      });
      // Shorter than its floor, the screen scrolls, "Charge" with it; at least the screen's
      // height, its rows spread over it.
      const scroll = views.find((view) => view.props.keyboardShouldPersistTaps !== undefined);
      expect(scroll).toBeDefined();
      expect(around(screen.getByTestId("charge"))).toContain(scroll);
      expect(styleOf(scroll!, "contentContainerStyle")).toMatchObject({
        flexGrow: 1,
        justifyContent: "space-between"
      });
      // Its taps are the screen's (`note-outside`): it neither takes one nor closes the keyboard of
      // the note being written.
      expect(scroll!.props.keyboardShouldPersistTaps).toBe("always");
      // On a tablet, the point of sale's column: no keypad across the whole screen.
      expect(views.some((view) => styleOf(view).maxWidth === POS_COLUMN_WIDTH + 2 * gutter)).toBe(
        true
      );
      // Pressed, the keys type as before.
      await type("7", "0", "0");
      expect(screen.getByText("7.00")).toBeTruthy();

      // The invoice in the same column.
      lnurlService();
      await fireEvent.press(screen.getByTestId("charge"));
      const waiting = await screen.findByText("Waiting for the payment");
      expect(
        around(waiting).some((view) => styleOf(view).maxWidth === POS_COLUMN_WIDTH + 2 * gutter)
      ).toBe(true);
    });

    it("keeps the keypad at its design height on desktop, where its column scrolls", async () => {
      mockDesktop.mockReturnValue(true);
      await openPos();
      expect(styleOf(firstRow())).toMatchObject({ height: KEY_HEIGHT });
      const views = around(firstRow());
      expect(views.some((view) => styleOf(view).maxHeight === KEYPAD_HEIGHT)).toBe(false);
      expect(views.some((view) => view.props.keyboardShouldPersistTaps === "always")).toBe(false);
      expect(views.some((view) => styleOf(view).maxWidth === POS_COLUMN_WIDTH + 2 * gutter)).toBe(
        false
      );
    });
  });

  it("charges once, however often the keypad's button is tapped", async () => {
    const service = lnurlService();
    const { router } = await openPos();
    await type("5", "0", "0");
    // The same button twice: a double tap lands before the invoice screen hides the keypad.
    const button = screen.getByTestId("charge");
    await fireEvent.press(button);
    await fireEvent.press(button);
    expect(await screen.findByText("Waiting for the payment")).toBeTruthy();
    expect(service.asked).toHaveLength(1);
    await waitFor(() => expect(router.getPathname()).toBe("/pos/charge"));
  });

  it("has no cancel: back leaves the screen, the amount kept, the invoice left open", async () => {
    lnurlService();
    const { router } = await openPos();
    await type("5", "0", "0");
    await fireEvent.press(screen.getByTestId("charge"));
    expect(await screen.findByText("Waiting for the payment")).toBeTruthy();

    // A Lightning invoice cannot be revoked: nothing claims to cancel it.
    expect(screen.queryByText("Cancel the transaction")).toBeNull();
    await fireEvent.press(screen.getByTestId("charge-back"));
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    expect(screen.getByText("5.00")).toBeTruthy();
  });

  // On desktop, compiled by the React Compiler, the side bar may keep the same props from one
  // screen of the point of sale to the other: the tab must not keep showing the keypad.
  it("shows the invoice on desktop too, then the keypad again after the browser's back", async () => {
    const service = lnurlService();
    mockDesktop.mockReturnValue(true);
    const { router } = await openPos();
    await type("5", "0", "0");
    await fireEvent.press(screen.getByTestId("charge"));

    expect(await screen.findByText("Waiting for the payment")).toBeTruthy();
    expect(service.asked).toHaveLength(1);

    // The desktop header has no back button: the browser's.
    await act(() => expoRouter.back());
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    expect(screen.queryByText("Waiting for the payment")).toBeNull();
    expect(screen.getByLabelText("Charge 5.00 CHF")).toBeTruthy();
  });

  it('puts a dot on "Charge" seen from another screen while the invoice waits', async () => {
    mockDesktop.mockReturnValue(true);
    const service = lnurlService();
    const { router } = await openPos();
    await unlockPos();
    expect(sidebarDot()).toBeNull();

    await type("5", "0", "0");
    await fireEvent.press(screen.getByTestId("charge"));
    expect(await screen.findByText("Waiting for the payment")).toBeTruthy();
    // The invoice shown: no dot.
    expect(sidebarDot()).toBeNull();
    expect(sidebarLabel()).toBe("Charge");

    await fireEvent.press(screen.getByTestId("sidebar-integrations"));
    await waitFor(() => expect(router.getPathname()).toBe("/integrations"));
    expect(sidebarDot()).toBeTruthy();
    expect(sidebarLabel()).toBe("Charge, invoice in progress");

    // Paid meanwhile: none.
    service.settled.add(lastPaymentHash(service));
    await waitFor(() => expect(sidebarDot()).toBeNull(), WAIT);
    expect(sidebarLabel()).toBe("Charge");
  });

  it("starts a fresh keypad and ends the sale shown when the currency changes", async () => {
    mockDesktop.mockReturnValue(true);
    lnurlService();
    const { router } = await openPos();
    await unlockPos();
    await type("5", "0", "0");
    await fireEvent.press(screen.getByTestId("charge"));
    expect(await screen.findByText("Waiting for the payment")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("sidebar-integrations"));
    await waitFor(() => expect(router.getPathname()).toBe("/integrations"));
    expect(sidebarDot()).toBeTruthy();

    // "Settings" (or the account's sync, an employee's channel): the profile's currency changes.
    await act(async () =>
      publishTerminalProfile({
        version: 2,
        walletId: WALLET,
        backupKey: BACKUP_KEY,
        lightningAddress: ADDRESS,
        businessName: "Fine Bakery",
        currency: "EUR"
      })
    );
    // The sale was charged in francs: it ends (no dot), its invoice's screen gives way to a fresh
    // keypad in euros, the screen shown and the navigation left as they were.
    expect(router.getPathname()).toBe("/integrations");
    await waitFor(() => expect(sidebarDot()).toBeNull());
    await fireEvent.press(screen.getByTestId("sidebar-pos"));
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    expect(posScreens(router)).toEqual(["index"]);
    expect(screen.queryByText("Waiting for the payment")).toBeNull();
    expect(screen.getByLabelText("0 EUR")).toBeTruthy();
    await type("5", "0", "0");
    expect(screen.getByLabelText("Charge 5.00 EUR")).toBeTruthy();
  });

  it("keeps the note under the amount once the invoice expired", async () => {
    const service = lnurlService();
    service.expiry = 1;
    await openPos();
    await type("5", "0", "0");
    await writeNote("Table 12");
    await fireEvent.press(screen.getByTestId("charge"));
    expect(await screen.findByText("Request expired", undefined, WAIT)).toBeTruthy();
    expect(screen.getByTestId("sale-note")).toHaveTextContent("Table 12");
    await pastGrace();
    expect(await screen.findByText("Expired", undefined, WAIT)).toBeTruthy();
    expect(screen.getAllByText("Table 12")).toHaveLength(1);
    expect(screen.getByTestId("sale-note")).toHaveTextContent("Table 12");
  });

  it("can be left once the invoice expired, the amount kept", async () => {
    const service = lnurlService();
    service.expiry = 1;
    const { router } = await openPos();
    await type("5", "0", "0");
    await fireEvent.press(screen.getByTestId("charge"));
    expect(await screen.findByText("Request expired", undefined, WAIT)).toBeTruthy();
    await pastGrace();
    expect(await screen.findByText("Expired", undefined, WAIT)).toBeTruthy();

    await fireEvent.press(screen.getByText("Back to the Point of Sale"));
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    expect(screen.getByText("5.00")).toBeTruthy();
  });

  it("goes back to the keypad from the invoice with the side bar's Charge row (desktop)", async () => {
    mockDesktop.mockReturnValue(true);
    lnurlService();
    const { router } = await openPos();
    await type("5", "0", "0");
    await fireEvent.press(screen.getByTestId("charge"));
    expect(await screen.findByText("Waiting for the payment")).toBeTruthy();
    expect(posScreens(router)).toEqual(["index", "charge"]);

    // Named as in the mobile dock (no dot on the invoice shown). The desktop header has no back
    // button: this row leads back.
    const row = screen.getByTestId("sidebar-pos");
    expect(row.props.accessibilityLabel).toBe("Charge");
    await fireEvent.press(row);
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    // As the back button: the invoice's screen is gone (not kept under another keypad), the
    // amount kept.
    expect(posScreens(router)).toEqual(["index"]);
    expect(screen.queryByText("Waiting for the payment")).toBeNull();
    expect(screen.getByText("5.00")).toBeTruthy();
    expect(screen.getByTestId("sidebar-pos").props.accessibilityLabel).toBe("Charge");

    // On the keypad, the row changes nothing.
    await fireEvent.press(screen.getByTestId("sidebar-pos"));
    expect(router.getPathname()).toBe("/pos");
    expect(posScreens(router)).toEqual(["index"]);
  });

  it("says when the invoice expired, and creates a new one for the same amount", async () => {
    const service = lnurlService();
    service.expiry = 1;
    await openPos();
    await type("5", "0", "0");
    await fireEvent.press(screen.getByTestId("charge"));

    // Ended: no code any more, the invoice still checked for 2 minutes, then "Expired". The plate
    // says the request expired, the countdown counts those 2 minutes down (a blank plate under a
    // spinner, at 00:00, would look stuck).
    expect(await screen.findByText("Request expired", undefined, WAIT)).toBeTruthy();
    expect(screen.getByText("A payment sent at the last second may still arrive.")).toBeTruthy();
    expect(screen.queryByTestId("qr-value")).toBeNull();
    expect(screen.queryByTestId("qr-spinner", { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByText("Expires in")).toBeNull();
    expect(screen.getByText("Check ends in")).toBeTruthy();
    expect(screen.getByText("02:00")).toBeTruthy();
    expect(screen.getByText("Checking the payment…")).toBeTruthy();
    await act(async () => jest.advanceTimersByTimeAsync(30_000));
    expect(screen.getByText("01:30")).toBeTruthy();
    expect(screen.getByText("Request expired")).toBeTruthy();
    await pastGrace();
    expect(await screen.findByText("Expired", undefined, WAIT)).toBeTruthy();
    expect(screen.getByText("The customer did not pay in time. Nothing was charged.")).toBeTruthy();

    service.expiry = undefined;
    await fireEvent.press(screen.getByText("Create the request again"));
    expect(await screen.findByText("Waiting for the payment")).toBeTruthy();
    expect(service.asked).toHaveLength(2);
    expect(service.asked[1].searchParams.get("amount")).toBe(
      service.asked[0].searchParams.get("amount")
    );
  });

  it("says the request expired on desktop too, while its invoice is still checked", async () => {
    mockDesktop.mockReturnValue(true);
    const service = lnurlService();
    service.expiry = 1;
    await openPos();
    await type("5", "0", "0");
    await fireEvent.press(screen.getByTestId("charge"));

    expect(await screen.findByText("Request expired", undefined, WAIT)).toBeTruthy();
    expect(screen.getByTestId("request-ended")).toBeTruthy();
    expect(screen.getByText("Check ends in")).toBeTruthy();
    expect(screen.getByText("02:00")).toBeTruthy();
    expect(screen.getByText("Checking the payment…")).toBeTruthy();
    // Nothing to share any more.
    expect(screen.queryByTestId("share")).toBeNull();
    await pastGrace();
    expect(
      await screen.findByText(
        "The customer did not pay in time. Nothing was charged.",
        undefined,
        WAIT
      )
    ).toBeTruthy();
    expect(screen.queryByTestId("request-ended")).toBeNull();
  });

  it("still sees a payment that lands just after the countdown ends", async () => {
    const service = lnurlService();
    service.expiry = 1;
    await openPos();
    await type("5", "0", "0");
    await fireEvent.press(screen.getByTestId("charge"));
    expect(await screen.findByText("Request expired", undefined, WAIT)).toBeTruthy();

    // Within the grace period after the end: the invoice is still being watched.
    service.settled.add(lastPaymentHash(service));
    expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
    expect(screen.queryByText("Expired")).toBeNull();
  });

  it("ends the wait when the service no longer knows the invoice after its end", async () => {
    const service = lnurlService();
    service.expiry = 1;
    service.verifyRefused = true;
    await openPos();
    await type("5", "0", "0");
    await fireEvent.press(screen.getByTestId("charge"));
    expect(await screen.findByText("Request expired", undefined, WAIT)).toBeTruthy();

    await pastGrace();
    expect(await screen.findByText("Expired", undefined, WAIT)).toBeTruthy();
  });

  it("keeps checking when the service fails past the end, without saying nothing was charged", async () => {
    const service = lnurlService();
    service.expiry = 1;
    service.verifyFails = true;
    await openPos();
    await type("5", "0", "0");
    await fireEvent.press(screen.getByTestId("charge"));
    expect(await screen.findByText("Request expired", undefined, WAIT)).toBeTruthy();

    // breez.tips answers "Internal server error" on a database error: never final.
    await pastGrace();
    expect(screen.queryByText("Expired")).toBeNull();
    expect(screen.getByText("Checking the payment…")).toBeTruthy();
    // The countdown at 00:00 while the last check may be answered, then out of sight, kept in
    // place: never stuck at zero while the sale is still checked.
    expect(screen.getByText("00:00")).toBeTruthy();
    await act(async () => jest.advanceTimersByTimeAsync(10_000));
    expect(screen.queryByText("00:00")).toBeNull();
    expect(screen.getByText("00:00", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText("Request expired")).toBeTruthy();
    expect(screen.getByText("Checking the payment…")).toBeTruthy();

    // Back: the invoice was paid before its end.
    service.verifyFails = false;
    service.settled.add(lastPaymentHash(service));
    expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
  });

  it("never says nothing was charged when the service says settled without proof", async () => {
    const service = lnurlService();
    service.expiry = 1;
    service.settledWithoutProof = true;
    await openPos();
    await type("5", "0", "0");
    await fireEvent.press(screen.getByTestId("charge"));
    expect(await screen.findByText("Request expired", undefined, WAIT)).toBeTruthy();

    // Past the grace period: still checking, never "Expired" ("Nothing was charged").
    await pastGrace();
    expect(screen.queryByText("Expired")).toBeNull();
    expect(screen.getByText("Checking the payment…")).toBeTruthy();
  });

  it("takes the time of the service that dates the invoices, from the first one", async () => {
    const service = lnurlService();
    // This device's clock is 10 minutes ahead of the service's: 13:30 here, 13:20 there.
    service.age = 600;
    await openPos(Date.UTC(2026, 9, 3, 13, 30));
    await type("5", "0", "0");
    await fireEvent.press(screen.getByTestId("charge"));

    expect(await screen.findByText("Waiting for the payment")).toBeTruthy();
    // The first one, asked until 13:40 here, ends at 13:30 there: not shown. Its date corrects the
    // clock (src/lib/clock.ts) and the sale's start (13:20 there): the second one ends exactly at
    // the end of its 10 minutes.
    expect(service.asked).toHaveLength(2);
    expect(service.asked[1].searchParams.get("expiry")).toBe("600");
    expect(clockOffsetSeconds()).toBeLessThanOrEqual(-599);
    expect(clockOffsetSeconds()).toBeGreaterThanOrEqual(-600);
    expect(screen.getByText(/^(09:5\d|10:00)$/)).toBeTruthy();
  });

  it("says the request failed after an invoice dated otherwise than asked", async () => {
    const service = lnurlService();
    // The first invoice is dated 10 minutes earlier than this device's clock (not shown, asked
    // again), then the service is out of reach.
    service.age = 600;
    service.downAfter = 1;
    await openPos(Date.UTC(2026, 9, 3, 13, 30));
    await type("5", "0", "0");
    await fireEvent.press(screen.getByTestId("charge"));

    expect(
      await screen.findByText(
        "The payment request could not be created. Check your internet connection, then try again.",
        undefined,
        WAIT
      )
    ).toBeTruthy();
    expect(service.asked).toHaveLength(1);
    service.downAfter = undefined;
    await fireEvent.press(screen.getByText("Try again"));
    expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
  });

  it("explains an amount under the least the service accepts, without another try", async () => {
    const service = lnurlService();
    // 20 000 sats at least: 5.00 CHF is 10 000 sats.
    service.minSendable = 20_000_000;
    await openPos();
    await type("5", "0", "0");
    await fireEvent.press(screen.getByTestId("charge"));

    expect(
      await screen.findByText(
        "This amount cannot be charged: only between 20'000 and 4'000'000 sats."
      )
    ).toBeTruthy();
    expect(service.asked).toHaveLength(0);
    // Another try would ask the same.
    expect(screen.queryByText("Try again")).toBeNull();
    expect(screen.getByText("Back to the Point of Sale")).toBeTruthy();
  });

  it("explains a network failure, and retries", async () => {
    jest.mocked(globalThis.fetch).mockRejectedValue(new TypeError("Network request failed"));
    await openPos();
    await type("5", "0", "0");
    await fireEvent.press(screen.getByTestId("charge"));
    expect(
      await screen.findByText(
        "The payment request could not be created. Check your internet connection, then try again."
      )
    ).toBeTruthy();

    lnurlService();
    await fireEvent.press(screen.getByText("Try again"));
    expect(await screen.findByText("Waiting for the payment")).toBeTruthy();
  });

  it("reads the service's parameters again after its callback failed", async () => {
    const service = lnurlService();
    const answer = jest.mocked(globalThis.fetch).getMockImplementation()!;
    let moved = true;
    let payRequests = 0;
    jest.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname.startsWith("/.well-known/lnurlp/")) payRequests++;
      if (moved && url.pathname === "/lnurlp/sattleme02c6047f94/invoice") {
        return { ok: false, status: 404, json: async () => null } as unknown as Response;
      }
      return answer(input, init);
    });
    await openPos();
    await type("5", "0", "0");
    await fireEvent.press(screen.getByTestId("charge"));
    expect(await screen.findByText("Try again")).toBeTruthy();

    moved = false;
    await fireEvent.press(screen.getByText("Try again"));
    expect(await screen.findByText("Waiting for the payment")).toBeTruthy();
    expect(payRequests).toBe(2);
    expect(service.asked).toHaveLength(1);
  });

  it("shows the selector in the owner's header, in place of the business's name, without naming the device", async () => {
    await openPos();
    // Always on the owner's device, articles or not.
    expect(await screen.findByTestId("pos-mode-articles")).toBeTruthy();
    expect(screen.queryByText("Fine Bakery")).toBeNull();
    // Employees have names ("Employees"): the device itself has none.
    expect(screen.queryByText("Name this device")).toBeNull();
  });

  it("sends a device without a profile to the welcome screen", async () => {
    const router = await renderRouter(routes, { initialUrl: "/pos" });
    await waitFor(() => expect(router.getPathname()).toBe("/"));
  });

  describe("payment link", () => {
    async function chargeAndWait() {
      await type("2", "4", "5", "0");
      await writeNote("Table 12");
      await fireEvent.press(screen.getByTestId("charge"));
      expect(await screen.findByText("Waiting for the payment")).toBeTruthy();
    }

    it("shares a private link to the sale, published on the relays", async () => {
      const service = lnurlService();
      const share = mockShare();
      await openPos();
      await chargeAndWait();

      await fireEvent.press(screen.getByTestId("share"));
      expect(share).toHaveBeenCalledTimes(1);
      const { url, ref, key } = sharedLink(share);
      expect(url).toMatch(LINK);
      await waitFor(() => expect(publications()).toHaveLength(PAYMENT_LINK_RELAYS.length));

      // The sale, not its invoice: the payer's page asks its own, hour by hour.
      const lookup = await fetchPaymentLink(ref, "bc");
      expect(lookup).toEqual({
        status: "found",
        value: {
          kind: "sale",
          sale: {
            // The point of sale's links stay of version 3: 10 minutes from their start.
            version: 3,
            businessName: "Fine Bakery",
            lightningAddress: ADDRESS,
            fiat: { minor: 2450, digits: 2, currency: "CHF" },
            note: "Table 12",
            onchainAddress: null,
            startsAt: expect.any(Number),
            endsAt: expect.any(Number),
            redirectUrl: null,
            registryKey: REGISTRY_KEY,
            registryReader: REGISTRY_READER,
            owner: LINK_OWNER,
            // This device was not added to the account yet: nothing tells who took the sale.
            taker: null,
            // No node passed on to the payers' pages (off by default): mempool.space.
            bitcoinNode: null,
            final: null
          }
        }
      });
      if (lookup.status !== "found" || lookup.value.kind !== "sale") return;
      expect(lookup.value.sale.endsAt - START / 1000).toBeGreaterThanOrEqual(600);
      expect(lookup.value.sale.endsAt - START / 1000).toBeLessThan(610);
      expect(lookup.value.sale.endsAt - lookup.value.sale.startsAt).toBe(600);
      // Its key is the sale's: the invoice shown was declared with it.
      const declared = await fetchDeclaredInvoices(registryOf(key), "bc");
      expect(declared?.map((invoice) => invoice.decoded.paymentHash)).toEqual([
        lastPaymentHash(service)
      ]);

      // Shared again: the same link, published once.
      await fireEvent.press(screen.getByTestId("share"));
      expect(share).toHaveBeenCalledTimes(2);
      expect(sharedLink(share, 1).url).toBe(url);
      expect(publications()).toHaveLength(PAYMENT_LINK_RELAYS.length);
    });

    it("names the merchant's node in the link only when the owner passes it on", async () => {
      lnurlService();
      const share = mockShare();
      const node = { url: "https://node.example.ch", fallback: "mempool" } as const;
      await savePosOptions(WALLET, {
        onchain: false,
        onchainTolerance: 0,
        bitcoinNode: { ...node, payers: true }
      });
      await openPos();
      await chargeAndWait();

      await fireEvent.press(screen.getByTestId("share"));
      const { ref } = sharedLink(share);
      await waitFor(() => expect(publications()).toHaveLength(PAYMENT_LINK_RELAYS.length));
      expect(await fetchPaymentLink(ref, "bc")).toMatchObject({
        status: "found",
        value: { kind: "sale", sale: { bitcoinNode: node } }
      });
    });

    it("says when no relay took the link, and publishes the same link again", async () => {
      lnurlService();
      const share = mockShare();
      await openPos();
      await chargeAndWait();
      for (const relay of PAYMENT_LINK_RELAYS) relays.unreachable.add(relay);

      await fireEvent.press(screen.getByTestId("share"));
      // Opened at once, while the link is published.
      expect(share).toHaveBeenCalledTimes(1);
      const message =
        "The link could not be put online: the customer would not find it. Check your internet connection, then share it again";
      expect(await screen.findByText(message)).toBeTruthy();
      // An error notification, whose "Try again" shares again.
      expect(screen.getByText("Link not online")).toBeTruthy();
      expect(screen.getByTestId("notification").props.role).toBe("alert");

      relays.unreachable.clear();
      await fireEvent.press(screen.getByTestId("share"));
      await waitFor(() => expect(screen.queryByText(message)).toBeNull());
      const { url, ref } = sharedLink(share, 1);
      expect(url).toBe(sharedLink(share).url);
      const ids = new Set(publications().map((call) => call.event?.id));
      expect(ids.size).toBe(1);
      // Not in waitFor: an async callback would overlap its act() calls.
      await waitFor(() => expect(storedLinks(PAYMENT_LINK_RELAYS[0])).toHaveLength(1));
      expect((await fetchPaymentLink(ref, "bc")).status).toBe("found");
    });

    it("shares the same link again from the notification's Try again", async () => {
      lnurlService();
      const share = mockShare();
      await openPos();
      await chargeAndWait();
      for (const relay of PAYMENT_LINK_RELAYS) relays.unreachable.add(relay);

      await fireEvent.press(screen.getByTestId("share"));
      expect(await screen.findByText("Link not online")).toBeTruthy();

      relays.unreachable.clear();
      // By its label: Jest keeps the animated card's first style (opacity 0), which hides it from
      // role queries.
      await fireEvent.press(screen.getByText("Try again"));
      expect(share).toHaveBeenCalledTimes(2);
      expect(sharedLink(share, 1).url).toBe(sharedLink(share).url);
      await waitFor(() => expect(screen.queryByText("Link not online")).toBeNull());
      await waitFor(() => expect(storedLinks(PAYMENT_LINK_RELAYS[0])).toHaveLength(1));
    });

    it("makes a new link for a new sale", async () => {
      const service = lnurlService();
      service.expiry = 1;
      const share = mockShare();
      await openPos();
      await type("5", "0", "0");
      await fireEvent.press(screen.getByTestId("charge"));
      expect(await screen.findByText("Waiting for the payment")).toBeTruthy();
      await fireEvent.press(screen.getByTestId("share"));

      await pastGrace();
      expect(await screen.findByText("Expired", undefined, WAIT)).toBeTruthy();
      expect(screen.queryByTestId("share")).toBeNull();
      service.expiry = undefined;
      await fireEvent.press(screen.getByText("Create the request again"));
      expect(await screen.findByText("Waiting for the payment")).toBeTruthy();
      await fireEvent.press(screen.getByTestId("share"));

      expect(sharedLink(share, 1).url).not.toBe(sharedLink(share).url);
      const { ref, key } = sharedLink(share, 1);
      await waitFor(() => expect(storedLinks(PAYMENT_LINK_RELAYS[0])).toHaveLength(2));
      expect((await fetchPaymentLink(ref, "bc")).status).toBe("found");
      // Another sale, other keys: only its own invoice is declared with them.
      const declared = await fetchDeclaredInvoices(registryOf(key), "bc");
      expect(declared?.map((invoice) => invoice.decoded.paymentHash)).toEqual([
        lastPaymentHash(service)
      ]);
    });

    it("marks its declarations and its link with who took the sale: one of the owner's devices", async () => {
      // The test team of team.test.ts, whose reading key is REGISTRY_READER.
      const team = deriveTeamKeys(
        encodeWalletSecret({
          mnemonic:
            "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
        })
      );
      expect(deriveRegistryReader(team).publicKey).toBe(REGISTRY_READER);
      // This device, added to the account: it keeps the secret the owner's devices share.
      await saveOwnerDeviceRecord({
        version: 1,
        account: WALLET.toLowerCase(),
        id: "ab".repeat(16),
        secret: "01".repeat(32),
        shared: bytesToHex(ownerDevicesSecret(team))
      });
      resetOwnerDeviceCache();
      const service = lnurlService();
      const share = mockShare();
      await openPos();
      await chargeAndWait();
      await fireEvent.press(screen.getByTestId("share"));
      const { ref, key, id } = sharedLink(share);
      // The link (this device's records of its sale and link go there too).
      await waitFor(() =>
        expect(storedLinks(PAYMENT_LINK_RELAYS[0]).some(({ pubkey }) => pubkey === id)).toBe(true)
      );

      const mark = takerTag(
        ownerTakerKey(ownerDevicesSecret(team)),
        deriveSaleKeys(key).nostr.publicKey
      );
      // The owner reads it in the invoice's declaration ("You" in "Wallet")…
      const found = await ownerDeclarations(
        { key: REGISTRY_KEY, reader: deriveRegistryReader(team) },
        lastPaymentHash(service),
        "bc"
      );
      expect(found?.map(({ taker }) => taker)).toEqual([mark]);
      // …and the link carries it, for the declarations of its payer's page.
      const lookup = await fetchPaymentLink(ref, "bc");
      expect(
        lookup.status === "found" && lookup.value.kind === "sale" && lookup.value.sale.taker
      ).toBe(mark);
      // …and this device's record of the link keeps the link's key, sealed for the owner alone
      // (sealed-key.ts): the owner signs its final version again each year.
      // Its records' keys derive from its own secret, the record's "01" bytes.
      const device = deriveMemberKeys(new Uint8Array(32).fill(1));
      await waitFor(async () => {
        const record = (await fetchLinks(device, 0, PAYMENT_LINK_RELAYS))?.find(
          ({ link }) => link === id
        );
        expect(openLinkKey(record?.sealedKey ?? "", deriveRegistryReader(team), id)).not.toBeNull();
      });
      resetOwnerDeviceCache();
    });

    it("publishes the link's final version once its sale is paid, then forgets the link", async () => {
      const service = lnurlService();
      const share = mockShare();
      await openPos();
      await chargeAndWait();
      await fireEvent.press(screen.getByTestId("share"));
      const { ref, id } = sharedLink(share);
      await waitFor(() => expect(publications()).toHaveLength(PAYMENT_LINK_RELAYS.length));
      // Kept on the device until then, also after a restart.
      expect((await loadPendingLinks("bc")).map((link) => link.id)).toEqual([id]);

      service.settled.add(lastPaymentHash(service));
      expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
      // Published to every relay, where it replaces the link.
      await waitFor(() => expect(publications()).toHaveLength(PAYMENT_LINK_RELAYS.length * 2));
      for (const relay of PAYMENT_LINK_RELAYS) expect(storedLinks(relay)).toHaveLength(1);
      const lookup = await fetchPaymentLink(ref, "bc");
      const final =
        lookup.status === "found" && lookup.value.kind === "sale" && lookup.value.sale.final;
      // The proofs: the invoice paid and its preimage, the point of 13:00 that fixed the amount.
      expect(final).toMatchObject({
        status: "paid",
        received: 49_000n,
        due: 49_000n,
        point: { hour: HOUR_END - 3600, rate: 50_000 },
        onchain: null
      });
      expect(final && final.lightning.map(({ preimage }) => preimage)).toEqual([
        preimagePair(1).preimage
      ]);
      await act(async () => undefined);
      expect(await loadPendingLinks("bc")).toEqual([]);
    });

    it("publishes the final version of a link whose sale was paid once its screen was left", async () => {
      const service = lnurlService();
      const share = mockShare();
      await openPos();
      await chargeAndWait();
      await fireEvent.press(screen.getByTestId("share"));
      const { ref } = sharedLink(share);
      await waitFor(() => expect(publications()).toHaveLength(PAYMENT_LINK_RELAYS.length));
      await fireEvent.press(screen.getByTestId("charge-back"));

      // Paid with the code the payer kept, nothing on screen follows the sale any more.
      service.settled.add(lastPaymentHash(service));
      await act(async () => jest.advanceTimersByTimeAsync(5 * 60 * 1000));
      expect(publications()).toHaveLength(PAYMENT_LINK_RELAYS.length);

      // The pending links' worker, past the sale's end.
      await act(async () => jest.advanceTimersByTimeAsync(FINALIZE_INTERVAL_MS));
      await waitFor(
        () => expect(publications()).toHaveLength(PAYMENT_LINK_RELAYS.length * 2),
        WAIT
      );
      expect(await fetchPaymentLink(ref, "bc")).toMatchObject({
        status: "found",
        value: { kind: "sale", sale: { final: { status: "paid", received: 49_000n } } }
      });
      expect(await loadPendingLinks("bc")).toEqual([]);
    });

    it("publishes the final version of a link paid in full while its sale still lasts", async () => {
      // Paid in full, settled at once, not at its end. The app comes back
      // to the front (a round of the pending links' worker) before the sale's 10 minutes are over.
      const listeners = new Set<(state: AppStateStatus) => void>();
      jest.spyOn(AppState, "addEventListener").mockImplementation((type, listener) => {
        if (type !== "change") return { remove: () => undefined };
        const changed = listener as (state: AppStateStatus) => void;
        listeners.add(changed);
        return { remove: () => listeners.delete(changed) };
      });
      const service = lnurlService();
      const share = mockShare();
      await openPos();
      await chargeAndWait();
      await fireEvent.press(screen.getByTestId("share"));
      const { ref } = sharedLink(share);
      await waitFor(() => expect(publications()).toHaveLength(PAYMENT_LINK_RELAYS.length));
      await fireEvent.press(screen.getByTestId("charge-back"));

      service.settled.add(lastPaymentHash(service));
      await act(async () => jest.advanceTimersByTimeAsync(60 * 1000));
      expect(publications()).toHaveLength(PAYMENT_LINK_RELAYS.length);
      // The next round, 15 minutes later, would come past the sale's end: the app's return to the
      // front settles it while it lasts.
      await act(async () => {
        for (const listener of [...listeners]) listener("active");
      });
      await waitFor(
        () => expect(publications()).toHaveLength(PAYMENT_LINK_RELAYS.length * 2),
        WAIT
      );
      const lookup = await fetchPaymentLink(ref, "bc");
      expect(lookup).toMatchObject({
        status: "found",
        value: { kind: "sale", sale: { final: { status: "paid", received: 49_000n } } }
      });
      // Before the sale's end.
      if (lookup.status === "found" && lookup.value.kind === "sale") {
        expect(Date.now() / 1000).toBeLessThan(lookup.value.sale.endsAt);
      }
      expect(await loadPendingLinks("bc")).toEqual([]);
    });

    it("puts a labelled button in the desktop header, which has no icon actions", async () => {
      lnurlService();
      mockDesktop.mockReturnValue(true);
      const share = mockShare();
      await openPos();
      await chargeAndWait();
      for (const relay of PAYMENT_LINK_RELAYS) relays.unreachable.add(relay);

      expect(screen.getAllByTestId("share")).toHaveLength(1);
      expect(screen.getByText("Share")).toBeTruthy();
      await fireEvent.press(screen.getByTestId("share"));
      expect(share).toHaveBeenCalledTimes(1);
      expect(
        await screen.findByText(
          "The link could not be put online: the customer would not find it. Check your internet connection, then share it again"
        )
      ).toBeTruthy();
    });

    it("shares the invoice itself in a build without a web app for its links", async () => {
      lnurlService();
      mockLinkOrigin.mockReturnValue(null);
      const share = mockShare();
      await openPos();
      await chargeAndWait();

      await fireEvent.press(screen.getByTestId("share"));
      expect(share).toHaveBeenCalledWith({ message: expect.stringMatching(/^lightning:lnbc/) });
      expect(publications()).toHaveLength(0);
    });

    it("shares the code itself while the device has no registry key", async () => {
      lnurlService();
      const share = mockShare();
      await openPos(START, { registry: false });
      await chargeAndWait();

      await fireEvent.press(screen.getByTestId("share"));
      expect(share).toHaveBeenCalledWith({ message: expect.stringMatching(/^lightning:lnbc/) });
      // Nothing published, nothing declared: the only reads look for a move of the account's
      // relays, signed by its backup key (src/features/relays/moved-notice.ts).
      expect(
        relays.calls.filter(
          ({ operation, filter }) =>
            operation !== "query" ||
            filter?.authors?.length !== 1 ||
            filter.authors[0] !== BACKUP_KEY
        )
      ).toEqual([]);
    });
  });

  describe("registry", () => {
    /** The invoice shown. */
    function shownInvoice(): Invoice {
      const pr = String(screen.getByTestId("qr-value").props.children).replace(/^lightning:/, "");
      const decoded = decodeBolt11(pr)!;
      return { pr, decoded, verifyUrl: `https://breez.tips/verify/${decoded.paymentHash}` };
    }

    it("declares each invoice on a majority of the relays before showing its code", async () => {
      const service = lnurlService();
      await openPos();
      // Four of the seven do not answer: three cannot hold a declaration every reader meets.
      for (const relay of PAYMENT_LINK_RELAYS.slice(0, 4)) relays.unreachable.add(relay);
      await type("2", "4", "5", "0");
      await fireEvent.press(screen.getByTestId("charge"));

      expect(
        await screen.findByText(
          "The payment request could not be created. Check your internet connection, then try again.",
          undefined,
          WAIT
        )
      ).toBeTruthy();
      expect(service.asked).toHaveLength(1);
      expect(screen.queryByTestId("qr-value")).toBeNull();

      relays.unreachable.clear();
      await fireEvent.press(screen.getByText("Try again"));
      expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
      const address = registryAddress(REGISTRY_KEY, lastPaymentHash(service));
      const holding = PAYMENT_LINK_RELAYS.filter((relay) =>
        (relays.stored.get(relay) ?? []).some((event) =>
          event.tags.some(([name, value]) => name === "d" && value === address)
        )
      );
      expect(holding).toHaveLength(PAYMENT_LINK_RELAYS.length);
      expect(declarations().length).toBeGreaterThanOrEqual(PAYMENT_LINK_RELAYS.length);
    });

    it("counts the payment of an invoice the payer's page made for the sale", async () => {
      const service = lnurlService();
      const share = mockShare();
      await openPos();
      await type("2", "4", "5", "0");
      await fireEvent.press(screen.getByTestId("charge"));
      expect(await screen.findByText("Waiting for the payment")).toBeTruthy();
      await fireEvent.press(screen.getByTestId("share"));
      const { key } = sharedLink(share);

      // The payer opened the link: its page asked an invoice of its own, declared it, and paid it.
      const page = service.make(49_000n, 90);
      await declareInvoice(registryOf(key), page, DECLARED);
      service.settled.add(page.decoded.paymentHash);
      await act(async () => jest.advanceTimersByTimeAsync(DECLARATIONS_INTERVAL_MS));
      expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
    });

    it("counts the page's invoice by the sale's start on the corrected clock", async () => {
      const service = lnurlService();
      const share = mockShare();
      // This device's clock is 3 minutes ahead of the service's: its first invoice corrects it,
      // and the sale's start with it (the first sale of the launch, tapped before any invoice).
      service.age = 180;
      await openPos();
      await type("2", "4", "5", "0");
      await fireEvent.press(screen.getByTestId("charge"));
      expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
      await waitFor(() => expect(clockOffsetSeconds()).toBeLessThanOrEqual(-179));
      await fireEvent.press(screen.getByTestId("share"));
      const { key } = sharedLink(share);

      // The payer's page, 30 s into the sale by the service's clock, made and paid its invoice.
      await act(async () => jest.advanceTimersByTimeAsync(30_000));
      const page = service.make(49_000n, 90);
      await declareInvoice(registryOf(key), page, DECLARED);
      service.settled.add(page.decoded.paymentHash);
      await act(async () => jest.advanceTimersByTimeAsync(DECLARATIONS_INTERVAL_MS));
      expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
    });

    it("never waits for an invoice declared for the sale after its end", async () => {
      const service = lnurlService();
      const share = mockShare();
      await openPos();
      await type("2", "4", "5", "0");
      await fireEvent.press(screen.getByTestId("charge"));
      expect(await screen.findByText("Waiting for the payment")).toBeTruthy();
      await fireEvent.press(screen.getByTestId("share"));
      const { key } = sharedLink(share);

      // 90 s after the sale's end, whoever holds the link declared a real invoice of the merchant
      // for it, never paid: the sale asks no invoice then, it does not wait for this one's outcome.
      await act(async () => jest.advanceTimersByTimeAsync((600 + 90) * 1000));
      await declareInvoice(registryOf(key), service.make(49_000n, 92), DECLARED);
      await act(async () => jest.advanceTimersByTimeAsync(DECLARATIONS_INTERVAL_MS));
      await pastGrace();
      expect(await screen.findByText("Expired", undefined, WAIT)).toBeTruthy();
    });

    it("never counts an invoice the LNURL server did not make, around a paid one's hash", async () => {
      const service = lnurlService();
      const share = mockShare();
      await openPos();
      await type("2", "4", "5", "0");
      await fireEvent.press(screen.getByTestId("charge"));
      expect(await screen.findByText("Waiting for the payment")).toBeTruthy();
      await fireEvent.press(screen.getByTestId("share"));
      const { key } = sharedLink(share);

      // Whoever holds the link paid 1 sat to an invoice of the server, then declared for the sale
      // an invoice written around its payment hash: 49 000 sats, the merchant's description, its
      // verify URL. Only the server's own invoice is behind that URL.
      const paid = service.make(1n, 91);
      service.settled.add(paid.decoded.paymentHash);
      const forged = makeInvoice({
        amountMsat: 49_000_000n,
        paymentHash: paid.decoded.paymentHash,
        descriptionHash: metadataHash(METADATA),
        timestamp: Math.floor(Date.now() / 1000),
        expirySeconds: 600
      });
      await declareInvoice(
        registryOf(key),
        { pr: forged, decoded: decodeBolt11(forged)!, verifyUrl: paid.verifyUrl },
        DECLARED
      );
      await act(async () => jest.advanceTimersByTimeAsync(DECLARATIONS_INTERVAL_MS));
      await act(async () => jest.advanceTimersByTimeAsync(5000));

      expect(screen.queryByText("Paid")).toBeNull();
      expect(screen.getByText("Waiting for the payment")).toBeTruthy();
    });

    it("counts a payment once, however its invoice is written", async () => {
      const service = lnurlService();
      const share = mockShare();
      await openPos();
      await type("2", "4", "5", "0");
      await fireEvent.press(screen.getByTestId("charge"));
      expect(await screen.findByText("Waiting for the payment")).toBeTruthy();
      await fireEvent.press(screen.getByTestId("share"));
      const { key } = sharedLink(share);

      // Half the amount, declared by whoever holds the link, and on two relays again in capitals
      // (BOLT11 is read in either case; a relay keeps one declaration per sale and payment), paid
      // once: 24 500 sats received, not 49 000.
      const half = service.make(24_500n, 90);
      await declareInvoice(registryOf(key), half, DECLARED);
      const capitals = declarationEvent(
        registryOf(key),
        { ...half, pr: half.pr.toUpperCase() },
        DECLARED
      );
      for (const relay of PAYMENT_LINK_RELAYS.slice(0, 2)) {
        relays.stored.set(relay, [
          ...(relays.stored.get(relay) ?? []).filter((event) => dTag(event) !== dTag(capitals)),
          capitals
        ]);
      }
      service.settled.add(half.decoded.paymentHash);
      await act(async () => jest.advanceTimersByTimeAsync(DECLARATIONS_INTERVAL_MS));
      await act(async () => jest.advanceTimersByTimeAsync(5000));

      expect(screen.queryByText("Paid")).toBeNull();
      expect(await screen.findByText("Left to pay")).toBeTruthy();
      const chain = within(screen.getByTestId("underpaid-chain"));
      expect(chain.getAllByLabelText("24'500 sats")).toHaveLength(2);
      // The rest over Lightning only: the sale has no address.
      await waitFor(() =>
        expect(String(screen.getByTestId("qr-value").props.children)).toMatch(/^lightning:lnbc245u/)
      );
    });

    it("counts a payment whatever someone without the registry key publishes at its address", async () => {
      const service = lnurlService();
      await openPos();
      await type("2", "4", "5", "0");
      await fireEvent.press(screen.getByTestId("charge"));
      expect(await screen.findByText("Waiting for the payment")).toBeTruthy();

      // A relay, or anyone watching them, saw the declaration's address and published there.
      const address = registryAddress(REGISTRY_KEY, lastPaymentHash(service));
      const stranger = signEvent(
        {
          kind: 30078,
          created_at: Math.floor(Date.now() / 1000),
          tags: [["d", address]],
          content: ""
        },
        new Uint8Array(32).fill(42)
      );
      for (const relay of PAYMENT_LINK_RELAYS) {
        relays.stored.set(relay, [...(relays.stored.get(relay) ?? []), stranger]);
      }
      service.settled.add(lastPaymentHash(service));
      expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
    });

    // Whoever holds the registry key (any payment link's payer, an
    // employee removed since) can declare a payment it saw at the till for another sale. Received,
    // it counts for none, and the point of sale never asks for it again.
    it("shows a payment that another sale declared too as to check, never asks it again", async () => {
      const service = lnurlService();
      await openPos();
      await type("2", "4", "5", "0");
      await fireEvent.press(screen.getByTestId("charge"));
      expect(await screen.findByText("Waiting for the payment")).toBeTruthy();

      // The payer declared this invoice for another sale of the business too (a forged page).
      const invoice = shownInvoice();
      await declareInvoice(saleRegistry(BUSINESS, new Uint8Array(32).fill(9)), invoice, DECLARED);
      service.settled.add(invoice.decoded.paymentHash);
      await act(async () => jest.advanceTimersByTimeAsync(10_000));

      expect(await screen.findByText("Payment to check", undefined, WAIT)).toBeTruthy();
      expect(
        screen.getByText(
          "A payment was received, but another sale claims it too. Do not ask for a new payment: check it in “Wallet”."
        )
      ).toBeTruthy();
      expect(screen.queryByText("Paid")).toBeNull();
      expect(screen.queryByText("Waiting for the payment")).toBeNull();
      // No code to pay again, and none asked, even past the sale's end.
      expect(screen.queryByTestId("qr-value", { includeHiddenElements: true })).toBeNull();
      await act(async () => jest.advanceTimersByTimeAsync(15 * 60_000));
      expect(service.asked).toHaveLength(1);
      expect(screen.getByText("Payment to check")).toBeTruthy();
      expect(screen.queryByText("Expired")).toBeNull();
      expect(screen.queryByText("Create the request again")).toBeNull();
    });

    it("shows as to check a payment declared with the registry key for anything else", async () => {
      const service = lnurlService();
      await openPos();
      await type("2", "4", "5", "0");
      await fireEvent.press(screen.getByTestId("charge"));
      expect(await screen.findByText("Waiting for the payment")).toBeTruthy();

      // Any content sealed with the registry key at d(H), under a throwaway author: the point of
      // sale cannot open it inside (the owner's reading key), it counts as another sale's.
      const invoice = shownInvoice();
      const address = registryAddress(REGISTRY_KEY, invoice.decoded.paymentHash);
      const stranger = new Uint8Array(32).fill(42);
      const junk = sealRecord({
        type: "registry-declaration",
        value: { sealed: "x" },
        signer: stranger,
        encryptionKey: outerKey(REGISTRY_KEY, address, nostrKeys(stranger).publicKey),
        address,
        createdAt: Math.floor(Date.now() / 1000)
      });
      relays.stored.set(PAYMENT_LINK_RELAYS[0], [
        ...(relays.stored.get(PAYMENT_LINK_RELAYS[0]) ?? []),
        junk
      ]);
      service.settled.add(invoice.decoded.paymentHash);

      expect(await screen.findByText("Payment to check", undefined, WAIT)).toBeTruthy();
      expect(screen.queryByText("Waiting for the payment")).toBeNull();
      expect(service.asked).toHaveLength(1);
    });

    it("keeps the code blurred under a spinner, and the countdown, while its payment is checked", async () => {
      const service = lnurlService();
      await openPos();
      await type("2", "4", "5", "0");
      await fireEvent.press(screen.getByTestId("charge"));
      expect(await screen.findByText("Waiting for the payment")).toBeTruthy();
      const code = String(screen.getByTestId("qr-value").props.children);
      expect(screen.queryByTestId("qr-blurred", { includeHiddenElements: true })).toBeNull();

      // Paid (a BoltCard, a wallet) while most relays do not answer: whether another sale declared
      // the payment is not known yet: the plate keeps the code, the countdown
      // goes on.
      for (const relay of PAYMENT_LINK_RELAYS.slice(0, 4)) relays.unreachable.add(relay);
      service.settled.add(lastPaymentHash(service));
      expect(await screen.findByText("Checking the payment…", undefined, WAIT)).toBeTruthy();
      // Sharp for VEIL_DELAY_MS first: most checks end before (useCodeVeil).
      expect(screen.getByTestId("qr-value").props.children).toBe(code);
      expect(screen.queryByTestId("qr-blurred", { includeHiddenElements: true })).toBeNull();
      expect(screen.queryByTestId("qr-spinner", { includeHiddenElements: true })).toBeNull();
      await act(async () => jest.advanceTimersByTimeAsync(VEIL_DELAY_MS));
      // The code stays, blurred and out of screen readers' reach, the spinner over it.
      expect(screen.getByTestId("qr-value", { includeHiddenElements: true }).props.children).toBe(
        code
      );
      expect(screen.queryByTestId("qr-value")).toBeNull();
      expect(screen.getByTestId("qr-blurred", { includeHiddenElements: true })).toBeTruthy();
      expect(screen.getByTestId("qr-spinner", { includeHiddenElements: true })).toBeTruthy();
      // The sale's countdown goes on: never 00:00 before its end.
      expect(screen.queryByText("00:00")).toBeNull();
      const left = screen.getByText(/^09:\d\d$/).props.children as string;
      await act(async () => jest.advanceTimersByTimeAsync(20_000));
      expect(screen.getByText("Checking the payment…")).toBeTruthy();
      expect(screen.queryByText(left)).toBeNull();
      expect(screen.getByText(/^09:\d\d$/)).toBeTruthy();
      expect(screen.queryByTestId("share")).toBeNull();

      // The relays answer at the next read: the payment is this sale's only.
      relays.unreachable.clear();
      await act(async () => jest.advanceTimersByTimeAsync(10_000));
      expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
    });

    it("brings the paid screen from the sharp code when its payment counts within the delay", async () => {
      const service = lnurlService();
      await openPos();
      await type("2", "4", "5", "0");
      await fireEvent.press(screen.getByTestId("charge"));
      expect(await screen.findByText("Waiting for the payment")).toBeTruthy();
      const code = String(screen.getByTestId("qr-value").props.children);

      // Paid, the registry being read: no blur in the paid animation.
      const release = relays.holdQueries();
      service.settled.add(lastPaymentHash(service));
      expect(await screen.findByText("Checking the payment…", undefined, WAIT)).toBeTruthy();
      await act(async () => jest.advanceTimersByTimeAsync(VEIL_DELAY_MS / 2));
      expect(screen.getByTestId("qr-value").props.children).toBe(code);
      expect(screen.queryByTestId("qr-blurred", { includeHiddenElements: true })).toBeNull();
      expect(screen.queryByTestId("qr-spinner", { includeHiddenElements: true })).toBeNull();

      // Counted within the delay: paid, the code never blurred (a blur still to come never comes
      // while the paid screen arrives, paid-arrival.test.tsx).
      release();
      expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
      expect(screen.queryByTestId("qr-blurred", { includeHiddenElements: true })).toBeNull();
    });

    // Events published at the payment's address by anyone, or relays that do not answer, must not
    // hold the point of sale on a bare spinner for good.
    it("says the payment received once its check lasts, and counts it once it ends", async () => {
      const service = lnurlService();
      await openPos();
      await type("2", "4", "5", "0");
      await fireEvent.press(screen.getByTestId("charge"));
      expect(await screen.findByText("Waiting for the payment")).toBeTruthy();

      for (const relay of PAYMENT_LINK_RELAYS.slice(0, 4)) relays.unreachable.add(relay);
      service.settled.add(lastPaymentHash(service));
      expect(await screen.findByText("Checking the payment…", undefined, WAIT)).toBeTruthy();
      expect(screen.queryByTestId("payment-settling")).toBeNull();

      // A minute on, still not known: received, being checked, before the sale's end.
      await act(async () => jest.advanceTimersByTimeAsync(UNIQUENESS_SLOW_SECONDS * 1000));
      expect(screen.getByTestId("payment-settling")).toBeTruthy();
      expect(screen.getByText("Payment received, being checked")).toBeTruthy();
      expect(screen.queryByTestId("qr-value", { includeHiddenElements: true })).toBeNull();
      expect(screen.queryByText(/^\d\d:\d\d$/)).toBeNull();
      expect(screen.queryByText("Paid")).toBeNull();

      relays.unreachable.clear();
      await act(async () => jest.advanceTimersByTimeAsync(30_000));
      expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
    });

    it("drops the blurred code and ends the countdown once the sale ends while its payment is checked", async () => {
      const service = lnurlService();
      await openPos();
      await type("2", "4", "5", "0");
      await fireEvent.press(screen.getByTestId("charge"));
      expect(await screen.findByText("Waiting for the payment")).toBeTruthy();

      for (const relay of PAYMENT_LINK_RELAYS.slice(0, 4)) relays.unreachable.add(relay);
      service.settled.add(lastPaymentHash(service));
      expect(await screen.findByText("Checking the payment…", undefined, WAIT)).toBeTruthy();
      await act(async () => jest.advanceTimersByTimeAsync(VEIL_DELAY_MS));
      expect(screen.getByTestId("qr-blurred", { includeHiddenElements: true })).toBeTruthy();

      // Past the sale's end, still checked: no code any more, the payment said received, no
      // countdown stuck at 00:00.
      await act(async () => jest.setSystemTime(START + 600_000));
      await act(async () => jest.advanceTimersByTimeAsync(2_000));
      expect(screen.getByText("Checking the payment…")).toBeTruthy();
      expect(screen.getByText("Payment received, being checked")).toBeTruthy();
      expect(screen.queryByText("00:00")).toBeNull();
      expect(screen.queryByTestId("qr-value", { includeHiddenElements: true })).toBeNull();
      expect(screen.queryByTestId("qr-blurred", { includeHiddenElements: true })).toBeNull();

      // Made before the end, the payment still counts once the relays answer.
      relays.unreachable.clear();
      await act(async () => jest.advanceTimersByTimeAsync(30_000));
      expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
    });
  });

  describe("charged from the scan or the basket", () => {
    it("goes back from the invoice to the scan, its basket kept, to charge an article forgotten", async () => {
      const service = lnurlService();
      await catalogOf([water, tea]);
      const { router } = await openPos();
      await scanArticles(WATER_CODE);
      await fireEvent.press(screen.getByTestId("scan-charge"));
      expect(await screen.findByText("Waiting for the payment")).toBeTruthy();
      await waitFor(() => expect(service.asked).toHaveLength(1));
      expect(service.asked[0].searchParams.get("amount")).toBe("7000000");

      // "Back": the scan as it was left, not the keypad.
      await fireEvent.press(screen.getByTestId("charge-back"));
      await waitFor(() => expect(router.getPathname()).toBe("/pos"));
      expect(posScreens(router)).toEqual(["index"]);
      expect(screen.getByTestId("pos-scan")).toBeTruthy();
      expect(within(screen.getByTestId("scan-card")).getByText("Mineral water 50 cl")).toBeTruthy();
      expect(screen.getByText("Charge · 1 item")).toBeTruthy();

      // The article forgotten, read now, joins the basket; the sale is charged again with it.
      await act(async () => camera.scan(TEA_CODE));
      expect(screen.getByText("Charge · 2 items")).toBeTruthy();
      await fireEvent.press(screen.getByTestId("scan-charge"));
      await waitFor(() => expect(router.getPathname()).toBe("/pos/charge"));
      expect(posScreens(router)).toEqual(["index", "charge"]);
      await waitFor(() => expect(service.asked).toHaveLength(2));
      expect(service.asked[1].searchParams.get("amount")).toBe("16000000");
      expect(await screen.findByText("Waiting for the payment")).toBeTruthy();
    });

    it("goes back from the invoice to the basket it was charged from, its lines kept", async () => {
      lnurlService();
      await catalogOf([water]);
      const { router } = await openPos();
      await scanArticles(WATER_CODE);
      await fireEvent.press(screen.getByTestId("scan-basket"));
      await fireEvent.press(screen.getByTestId("basket-charge"));
      expect(await screen.findByText("Waiting for the payment")).toBeTruthy();

      await fireEvent.press(screen.getByTestId("charge-back"));
      await waitFor(() => expect(router.getPathname()).toBe("/pos/basket"));
      expect(posScreens(router)).toEqual(["index", "basket"]);
      expect(screen.getByTestId("basket-total")).toHaveTextContent("3.50 CHF");
      // Opened from the scan, it still leads back to it.
      await fireEvent.press(screen.getByTestId("basket-scan-more"));
      expect(router.getPathname()).toBe("/pos");
      expect(screen.getByTestId("pos-scan")).toBeTruthy();
    });

    it("empties the basket of a sale paid, however its screen is left", async () => {
      const service = lnurlService();
      await catalogOf([water]);
      const { router } = await openPos();
      await scanArticles(WATER_CODE);
      await fireEvent.press(screen.getByTestId("scan-charge"));
      expect(await screen.findByText("Waiting for the payment")).toBeTruthy();
      service.settled.add(lastPaymentHash(service));
      expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();

      // The system's back (Android button, iOS swipe): the scan, whose basket is empty, so that the
      // articles paid can never be charged again.
      await act(() => expoRouter.back());
      await waitFor(() => expect(router.getPathname()).toBe("/pos"));
      expect(screen.getByTestId("scan-charge").props.accessibilityState?.disabled).toBe(true);
      expect(within(screen.getByTestId("scan-charge")).getByText("Charge")).toBeTruthy();
      expect(screen.queryByTestId("scan-basket")).toBeNull();
    });

    it("goes back to the scan once the sale is paid, its basket empty", async () => {
      const service = lnurlService();
      await catalogOf([water]);
      const { router } = await openPos();
      await scanArticles(WATER_CODE);
      await fireEvent.press(screen.getByTestId("scan-charge"));
      expect(await screen.findByText("Waiting for the payment")).toBeTruthy();
      service.settled.add(lastPaymentHash(service));
      expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();

      await fireEvent.press(screen.getByTestId("back-to-pos"));
      await waitFor(() => expect(router.getPathname()).toBe("/pos"));
      expect(posScreens(router)).toEqual(["index"]);
      // The scan still chosen, for the next customer, its basket empty.
      expect(screen.getByTestId("scan-charge").props.accessibilityState?.disabled).toBe(true);
      // A fresh basket: "Items" has nothing in it.
      await fireEvent.press(screen.getByTestId("pos-mode-articles"));
      expect(screen.getByTestId("charge").props.accessibilityState?.disabled).toBe(true);
    });
  });
});

describe("point of sale, on-chain", () => {
  // 5.00 CHF at 50 000 CHF/BTC: 10 000 sats, 0.0001 BTC.
  const SATS = 10_000n;
  const FIRST = taprootAddress(1);

  beforeEach(() => {
    mockPoints.clear();
    closeAccount();
    resetPayRequests();
    // The addresses a shared sale kept are this session's (onchain-pool.ts).
    resetLinkedAddresses();
    relays.resetRelays();
    mockLinkOrigin.mockReturnValue("https://web.example");
    mockDesktop.mockReturnValue(false);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  /** The device's on-chain addresses: taprootAddress(1), (2), … */
  async function fillPool(count = 3) {
    await saveOnchainPool({
      version: 1,
      walletId: WALLET,
      addresses: Array.from({ length: count }, (_, i) => taprootAddress(i + 1))
    });
  }

  async function chargeFive() {
    await type("5", "0", "0");
    await fireEvent.press(screen.getByTestId("charge"));
    expect(await screen.findByText("Waiting for the payment")).toBeTruthy();
  }

  function qrValue(options?: { includeHiddenElements: boolean }): string {
    return String(screen.getByTestId("qr-value", options).props.children);
  }

  /** The networks named under the QR: those its code carries. */
  function networks(): string {
    expect(screen.getByText("Scan with your wallet")).toBeTruthy();
    return screen.getByTestId("networks").props.accessibilityLabel;
  }

  /**
   * What the warning under the code says of a sale that should have offered Bitcoin and cannot
   * (an unavailable explorer told, not hidden), null without one.
   */
  function onchainWarning(): string | null {
    const callout = screen.queryByTestId("onchain-unavailable");
    return callout === null ? null : within(callout).getByText(/.+/).props.children;
  }

  const EXPLORER_WARNING =
    "Bitcoin on-chain unavailable for this sale: mempool.space could not check the Bitcoin address in time. The customer can pay over Lightning.";
  const POOL_WARNING =
    "Bitcoin on-chain unavailable for this sale: this device has no Bitcoin address ready. It prepares some at each unlock with your passkey, while connected to the internet. The customer can pay over Lightning.";
  const LOT_WARNING =
    "Bitcoin on-chain unavailable for this sale: this device has no Bitcoin address available. The business owner gives it some when unlocking their app with their passkey, while connected to the internet. The customer can pay over Lightning.";

  it("puts both networks in one code while the device has addresses left", async () => {
    lnurlService();
    await fillPool();
    await openPos();
    await chargeFive();

    expect(qrValue()).toMatch(new RegExp(`^bitcoin:${FIRST}\\?amount=0\\.0001&lightning=lnbc`));
    expect(networks()).toBe("Lightning or Bitcoin");
    expect(onchainWarning()).toBeNull();
    // Taken before it was shown: never shown again.
    expect((await loadOnchainPool("mainnet"))?.addresses).toEqual([
      taprootAddress(2),
      taprootAddress(3)
    ]);
  });

  it("prices an on-chain payment from mempool.space alone, never asking BlockCypher", async () => {
    lnurlService();
    await fillPool();
    await openPos();
    await chargeFive();
    let txid = "";
    await act(async () => {
      txid = mempool.pay(FIRST, SATS);
    });
    expect(await screen.findByText("Confirming")).toBeTruthy();
    await act(async () => mempool.mine(3));
    expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();

    // Sent at 13:10:30, far from a change of point (HH:05): mempool.space's first sight prices it
    // (broadcast-time.ts).
    expect(mempool.chain.firstSeenAsked).toEqual([txid]);
    expect(mempool.chain.receivedAsked).toEqual([]);
  });

  it("says why a sale is Lightning only once the device has no address left", async () => {
    lnurlService();
    await openPos();
    await chargeFive();

    expect(qrValue()).toMatch(/^lightning:lnbc/);
    expect(networks()).toBe("Lightning");
    // The merchant knows, and what brings addresses back (onchain-pool.ts, syncOnchainPool).
    expect(onchainWarning()).toBe(POOL_WARNING);
  });

  it("takes an employee's addresses from its lot, never from another account's pool", async () => {
    lnurlService();
    // Another account's addresses, left on the device: never shown for the team's sales.
    await fillPool();
    const team = "a".repeat(64);
    await saveTerminalProfile({
      version: 3,
      team,
      memberName: "Alice",
      lightningAddress: ADDRESS,
      businessName: "Fine Bakery",
      currency: "CHF"
    });
    // The lot the owner gave this employee (src/features/team/member-addresses.ts).
    await applyLot(team, {
      version: 1,
      addresses: [taprootAddress(11), taprootAddress(12)],
      tags: ["0".repeat(16), "1".repeat(16)],
      updatedAt: START / 1000
    });
    setClock(START);
    const router = await renderRouter(routes, { initialUrl: "/" });
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    await chargeFive();

    expect(qrValue()).toMatch(new RegExp(`^bitcoin:${taprootAddress(11)}\\?amount=`));
    expect(networks()).toBe("Lightning or Bitcoin");
    expect(onchainWarning()).toBeNull();
    expect(await lotAddresses(team)).toEqual([taprootAddress(12)]);
    expect((await loadOnchainPool("mainnet"))?.addresses).toHaveLength(3);
  });

  it("stays Lightning only on an employee's device when its channel says so", async () => {
    lnurlService();
    const team = "a".repeat(64);
    await saveTerminalProfile({
      version: 3,
      team,
      memberName: "Alice",
      lightningAddress: ADDRESS,
      businessName: "Fine Bakery",
      currency: "CHF"
    });
    await applyLot(team, {
      version: 1,
      addresses: [taprootAddress(11), taprootAddress(12)],
      tags: ["0".repeat(16), "1".repeat(16)],
      updatedAt: START / 1000
    });
    // From the channel (member.ts): the owner turned "On-chain payments" off.
    await savePosOptions(team, { onchain: false, onchainTolerance: 0, bitcoinNode: null });
    setClock(START);
    const router = await renderRouter(routes, { initialUrl: "/" });
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    await chargeFive();

    expect(qrValue()).toMatch(/^lightning:lnbc/);
    expect(networks()).toBe("Lightning");
    // The owner's choice: nothing to warn about.
    expect(onchainWarning()).toBeNull();
    expect(await lotAddresses(team)).toEqual([taprootAddress(11), taprootAddress(12)]);
  });

  it("stops an employee's invoice as soon as the owner's removal reaches a relay", async () => {
    lnurlService();
    const team = deriveTeamKeys(encodeWalletSecret({ mnemonic: "test test test" }));
    const secret = memberSecret(team, "0a".repeat(16));
    const keys = deriveMemberKeys(secret);
    await saveMembership({
      version: 1,
      team: team.publicKey,
      secret: bytesToHex(secret),
      name: "Alice",
      deviceId: "0b".repeat(16),
      joinedAt: START / 1000
    });
    await saveTerminalProfile({
      version: 3,
      team: team.publicKey,
      memberName: "Alice",
      lightningAddress: ADDRESS,
      businessName: "Fine Bakery",
      currency: "CHF"
    });
    setClock(START);
    const router = await renderRouter(routes, { initialUrl: "/" });
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    // No subscription while no invoice shows: the channel is read every 5 minutes.
    expect(relays.watches.size).toBe(0);
    await chargeFive();
    // While the invoice shows, one per relay, on the employee's channel.
    expect([...relays.watches].map(({ relay }) => relay).sort()).toEqual(
      [...PAYMENT_LINK_RELAYS].sort()
    );
    expect([...relays.watches][0].filter).toEqual({
      kinds: [30078],
      authors: [team.publicKey],
      "#d": [keys.channel.address]
    });

    // The owner removes Alice: one relay taking the removal is enough, at once.
    await act(async () => {
      await publishToRelays(
        channelEvent(team, keys, { version: 1, status: "removed", updatedAt: START / 1000 + 1 }),
        {
          relays: [PAYMENT_LINK_RELAYS[0]],
          channel: "account",
          timeoutMs: 1000,
          authKey: team.secretKey
        }
      );
    });
    await act(async () => jest.advanceTimersByTimeAsync(0));

    await waitFor(() => expect(router.getPathname()).toBe("/"));
    expect(screen.queryByText("Waiting for the payment")).toBeNull();
    expect(screen.getByText("This device is no longer part of the Fine Bakery team.")).toBeTruthy();
    expect(relays.watches.size).toBe(0);
  });

  it("says why a sale is Lightning only on an employee's device without a lot", async () => {
    lnurlService();
    await fillPool();
    await saveTerminalProfile({
      version: 3,
      team: "a".repeat(64),
      memberName: "Alice",
      lightningAddress: ADDRESS,
      businessName: "Fine Bakery",
      currency: "CHF"
    });
    setClock(START);
    const router = await renderRouter(routes, { initialUrl: "/" });
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    await chargeFive();

    expect(qrValue()).toMatch(/^lightning:lnbc/);
    expect(networks()).toBe("Lightning");
    // The owner gives the lots (owner-addresses.ts): the employee knows whom to ask.
    expect(onchainWarning()).toBe(LOT_WARNING);
    expect((await loadOnchainPool("mainnet"))?.addresses).toHaveLength(3);
  });

  it("says why a sale is Lightning only once an employee's lot is used up", async () => {
    lnurlService();
    const team = "a".repeat(64);
    await saveTerminalProfile({
      version: 3,
      team,
      memberName: "Alice",
      lightningAddress: ADDRESS,
      businessName: "Fine Bakery",
      currency: "CHF"
    });
    // Its only address left was paid since (a payer who kept its code): it leaves the lot.
    await applyLot(team, {
      version: 1,
      addresses: [taprootAddress(11)],
      tags: ["0".repeat(16)],
      updatedAt: START / 1000
    });
    mempool.pay(taprootAddress(11), 4_000n);
    setClock(START);
    const router = await renderRouter(routes, { initialUrl: "/" });
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    await chargeFive();

    expect(qrValue()).toMatch(/^lightning:lnbc/);
    expect(networks()).toBe("Lightning");
    expect(onchainWarning()).toBe(LOT_WARNING);
    expect(await lotAddresses(team)).toEqual([]);
  });

  it("stays Lightning only when the business accepts no on-chain payment", async () => {
    lnurlService();
    await fillPool();
    // "On-chain payments" off, saved once the account was open (useTeamSync.ts).
    await savePosOptions(WALLET, { onchain: false, onchainTolerance: 0, bitcoinNode: null });
    await openPos();
    await chargeFive();

    expect(qrValue()).toMatch(/^lightning:lnbc/);
    expect(networks()).toBe("Lightning");
    // The business's choice: nothing to warn about.
    expect(onchainWarning()).toBeNull();
    // No address taken from the pool.
    expect((await loadOnchainPool("mainnet"))?.addresses).toHaveLength(3);
  });

  it("keeps the address of the sale shown when on-chain payments are turned off meanwhile", async () => {
    lnurlService();
    await fillPool();
    await openPos();
    await chargeFive();
    expect(qrValue()).toMatch(new RegExp(`^bitcoin:${FIRST}\\?amount=`));
    // Saved while the sale shows (the owner's settings read again): a payer may have paid it.
    await act(async () => {
      await savePosOptions(WALLET, { onchain: false, onchainTolerance: 0, bitcoinNode: null });
    });

    expect(qrValue()).toMatch(new RegExp(`^bitcoin:${FIRST}\\?amount=`));
    expect(networks()).toBe("Lightning or Bitcoin");
  });

  it("offers on-chain addresses again for another account's options", async () => {
    lnurlService();
    await fillPool();
    // Options left by another account on this device: the defaults apply.
    await savePosOptions("b".repeat(64), {
      onchain: false,
      onchainTolerance: 0,
      bitcoinNode: null
    });
    await openPos();
    await chargeFive();

    expect(qrValue()).toMatch(new RegExp(`^bitcoin:${FIRST}\\?amount=`));
  });

  it("counts an on-chain payment short by no more than the business's tolerance as paid", async () => {
    lnurlService();
    await fillPool();
    // "Underpayment tolerance" of 5 %, saved once the account was open (useTeamSync.ts).
    await savePosOptions(WALLET, { onchain: true, onchainTolerance: 500, bitcoinNode: null });
    await openPos();
    await chargeFive();
    // The QR asks the whole amount: the tolerance is never shown.
    expect(qrValue()).toMatch(new RegExp(`^bitcoin:${FIRST}\\?amount=0\\.0001&lightning=lnbc`));

    await act(async () => {
      mempool.pay(FIRST, 9_500n);
    });
    expect(await screen.findByText("Confirming")).toBeTruthy();
    expect(screen.queryByText("Left to pay")).toBeNull();
    await act(async () => mempool.mine(3));
    expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
  });

  it("asks the whole rest of a payment short by more, a payment within the tolerance then paying it", async () => {
    const service = lnurlService();
    await fillPool();
    await savePosOptions(WALLET, { onchain: true, onchainTolerance: 500, bitcoinNode: null });
    await openPos();
    await chargeFive();

    // 10 % short: underpaid, as without the tolerance.
    await act(async () => {
      mempool.pay(FIRST, 9_000n);
    });
    expect(await screen.findByText("Left to pay")).toBeTruthy();
    // The whole rest, never only what the tolerance would leave (500 sats).
    expect(screen.getAllByLabelText("1'000 sats").length).toBeGreaterThan(0);
    await waitFor(() => expect(service.asked).toHaveLength(2));
    expect(service.asked[1].searchParams.get("amount")).toBe("1000000");
    await waitFor(() =>
      expect(qrValue()).toMatch(new RegExp(`^bitcoin:${FIRST}\\?amount=0\\.00001&lightning=lnbc`))
    );

    // 600 more: 9 600 of 10 000, within 5 %.
    await act(async () => {
      mempool.pay(FIRST, 600n);
    });
    expect(await screen.findByText("Confirming", undefined, WAIT)).toBeTruthy();
    await act(async () => mempool.mine(3));
    expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
  });

  it("keeps the note under the amount of a sale paid short", async () => {
    lnurlService();
    await fillPool();
    await openPos();
    await type("5", "0", "0");
    await writeNote("Table 12");
    await fireEvent.press(screen.getByTestId("charge"));
    expect(await screen.findByText("Waiting for the payment")).toBeTruthy();

    await act(async () => {
      mempool.pay(FIRST, 4_000n);
    });
    expect(await screen.findByText("Left to pay")).toBeTruthy();
    expect(screen.getAllByText("Table 12")).toHaveLength(1);
    expect(screen.getByTestId("sale-note")).toHaveTextContent("Table 12");
  });

  it("judges a sale with the tolerance of its start, a change meanwhile for the next sales", async () => {
    lnurlService();
    await fillPool();
    await openPos();
    await chargeFive();
    // Set while the sale shows: not this sale's.
    await act(async () => {
      await savePosOptions(WALLET, { onchain: true, onchainTolerance: 500, bitcoinNode: null });
    });
    await act(async () => {
      mempool.pay(FIRST, 9_500n);
    });
    expect(await screen.findByText("Left to pay")).toBeTruthy();
    expect(screen.getAllByLabelText("500 sats").length).toBeGreaterThan(0);
  });

  it("follows an on-chain payment until 3 blocks deep, without going back on its own", async () => {
    lnurlService();
    await fillPool();
    const { router } = await openPos();
    await chargeFive();

    await act(async () => {
      mempool.pay(FIRST, SATS);
    });
    expect(await screen.findByText("Confirming")).toBeTruthy();
    expect(
      screen.getByText(
        "The customer has paid. The network still has to confirm the transaction, allow about thirty minutes."
      )
    ).toBeTruthy();
    expect(screen.getByText(/^Bitcoin · /)).toBeTruthy();
    expect(screen.queryByText("Expires in")).toBeNull();

    await act(async () => mempool.mine(2));
    expect(screen.getByText("Confirming")).toBeTruthy();
    await act(async () => mempool.mine(1));
    expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
    expect(screen.getByText(/^Bitcoin · /)).toBeTruthy();

    await fireEvent.press(screen.getByTestId("back-to-pos"));
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    expect(screen.getByLabelText("0 CHF")).toBeTruthy();
  });

  it('turns the dot of "Charge" teal while the payment confirms, none once paid', async () => {
    mockDesktop.mockReturnValue(true);
    lnurlService();
    await fillPool();
    const { router } = await openPos();
    await unlockPos();
    await chargeFive();
    expect(sidebarDot()).toBeNull();
    await fireEvent.press(screen.getByTestId("sidebar-integrations"));
    await waitFor(() => expect(router.getPathname()).toBe("/integrations"));
    const color = () => StyleSheet.flatten(sidebarDot()!.props.style).backgroundColor;
    expect(color()).toBe(colors.state.open.dot);
    expect(sidebarLabel()).toBe("Charge, invoice in progress");

    await act(async () => {
      mempool.pay(FIRST, SATS);
    });
    await waitFor(() => expect(sidebarLabel()).toBe("Charge, payment confirming"));
    expect(color()).toBe(colors.state.unconfirmed.dot);

    await act(async () => mempool.mine(3));
    await waitFor(() => expect(sidebarDot()).toBeNull(), WAIT);
    expect(sidebarLabel()).toBe("Charge");
  });

  it("goes back to the invoice when the payment is replaced before it confirms (RBF)", async () => {
    lnurlService();
    await fillPool();
    const { router } = await openPos();
    await chargeFive();

    let txid = "";
    await act(async () => {
      txid = mempool.pay(FIRST, SATS);
    });
    expect(await screen.findByText("Confirming")).toBeTruthy();
    await act(async () => mempool.drop(txid));

    expect(await screen.findByText("Waiting for the payment")).toBeTruthy();
    // Unpaid again: leaving keeps the amount, as for any open invoice.
    await fireEvent.press(screen.getByTestId("charge-back"));
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    expect(screen.getByText("5.00")).toBeTruthy();
  });

  it("ends a basket's sale paid in part: its basket emptied, Back to the keypad", async () => {
    lnurlService();
    await fillPool();
    // 5.00 CHF: the sale's 10 000 sats.
    await catalogOf([barcodeArticle("Sandwich", 500, SANDWICH_CODE, 1_790_000_003)]);
    const { router } = await openPos();
    await scanArticles(SANDWICH_CODE);
    await fireEvent.press(screen.getByTestId("scan-charge"));
    expect(await screen.findByText("Waiting for the payment")).toBeTruthy();

    await act(async () => {
      mempool.pay(FIRST, 4_000n);
    });
    expect(await screen.findByText("Left to pay")).toBeTruthy();
    // Paid in part: charging the basket again would charge the customer too much.
    const scanCharge = screen.getByTestId("scan-charge", { includeHiddenElements: true });
    expect(scanCharge.props.accessibilityState?.disabled).toBe(true);
    await fireEvent.press(screen.getByTestId("charge-back"));
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    expect(posScreens(router)).toEqual(["index"]);
  });

  it("ends a keypad's sale paid in part: Back to a fresh keypad", async () => {
    lnurlService();
    await fillPool();
    const { router } = await openPos();
    await chargeFive();
    await act(async () => {
      mempool.pay(FIRST, 4_000n);
    });
    expect(await screen.findByText("Left to pay")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("charge-back"));
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    expect(screen.getByLabelText("0 CHF")).toBeTruthy();
  });

  it("shows each payment of an underpaid sale, its transaction linked to mempool.space", async () => {
    jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    lnurlService();
    await fillPool();
    await openPos();
    await chargeFive();
    let first = "";
    let second = "";
    await act(async () => {
      first = mempool.pay(FIRST, 3_000n);
    });
    expect(await screen.findByText("Left to pay")).toBeTruthy();
    await act(async () => {
      second = mempool.pay(FIRST, 1_000n);
    });
    // One "Received" step per payment: 3 000 then 1 000 of the 10 000 sats,
    // 1.50 and 0.50 of the 5.00 CHF; 6 000 sats, 3.00 CHF to pay.
    const chain = within(screen.getByTestId("underpaid-chain"));
    await waitFor(() => expect(chain.getAllByTestId("underpaid-received")).toHaveLength(2));
    const [one, two] = chain.getAllByTestId("underpaid-received").map((step) => within(step));
    expect(one.getByLabelText("3'000 sats")).toBeTruthy();
    expect(one.getByText("1.50 CHF")).toBeTruthy();
    expect(two.getByLabelText("1'000 sats")).toBeTruthy();
    expect(two.getByText("0.50 CHF")).toBeTruthy();
    expect(chain.getByLabelText("6'000 sats")).toBeTruthy();
    expect(chain.getByText("3.00 CHF")).toBeTruthy();
    // Each with when BlockCypher received it.
    await waitFor(() => expect(chain.getAllByText(/ ·$/)).toHaveLength(2));
    const label = (txid: string) =>
      `View transaction ${txid.slice(0, 4)}…${txid.slice(-4)} on mempool.space`;
    expect(one.getByLabelText(label(first))).toBeTruthy();
    await fireEvent.press(two.getByLabelText(label(second)));
    expect(Linking.openURL).toHaveBeenCalledWith(`https://mempool.space/tx/${second}`);
  });

  it("links a payment's transaction to the merchant's node when the point of sale reads it", async () => {
    jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    const NODE = "https://node.example.ch";
    // The account's node, as the owner's settings or an employee's channel give it (options.ts):
    // not passed on to the payers' pages, read by this device all the same.
    await savePosOptions(WALLET, {
      onchain: true,
      onchainTolerance: 0,
      bitcoinNode: { url: NODE, fallback: "none", payers: false }
    });
    lnurlService();
    await fillPool();
    await openPos();
    await chargeFive();
    let txid = "";
    await act(async () => {
      txid = mempool.pay(FIRST, 4_000n);
    });
    expect(await screen.findByText("Left to pay")).toBeTruthy();
    // The node is where this device reads the chain…
    const reads = mempool.chain.calls.filter(({ path }) => path.includes(FIRST));
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.every(({ base }) => base === `${NODE}/api`)).toBe(true);
    // …and where its transaction's link leads, never mempool.space ("Lightning only").
    const chain = within(screen.getByTestId("underpaid-chain"));
    await fireEvent.press(
      chain.getByLabelText(
        `View transaction ${txid.slice(0, 4)}…${txid.slice(-4)} on node.example.ch`
      )
    );
    expect(Linking.openURL).toHaveBeenCalledWith(`${NODE}/tx/${txid}`);
    expect(Linking.openURL).toHaveBeenCalledTimes(1);
  });

  it("gives the basket back when its payment is replaced before it confirms (RBF)", async () => {
    lnurlService();
    await fillPool();
    // 5.00 CHF: the sale's 10 000 sats.
    await catalogOf([barcodeArticle("Sandwich", 500, SANDWICH_CODE, 1_790_000_003)]);
    const { router } = await openPos();
    await scanArticles(SANDWICH_CODE);
    await fireEvent.press(screen.getByTestId("scan-charge"));
    expect(await screen.findByText("Waiting for the payment")).toBeTruthy();
    const scanCharge = () => screen.getByTestId("scan-charge", { includeHiddenElements: true });

    let txid = "";
    await act(async () => {
      txid = mempool.pay(FIRST, SATS);
    });
    expect(await screen.findByText("Confirming")).toBeTruthy();
    // Paid: the scan under the invoice has an empty basket.
    expect(scanCharge().props.accessibilityState?.disabled).toBe(true);
    await act(async () => mempool.drop(txid));

    expect(await screen.findByText("Waiting for the payment")).toBeTruthy();
    // Unpaid again: its articles back in the basket, as for any open invoice.
    expect(scanCharge().props.accessibilityState?.disabled).toBe(false);
    await fireEvent.press(screen.getByTestId("charge-back"));
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    expect(screen.getByText("Charge · 1 item")).toBeTruthy();
  });

  /** The explorer says the address is unused before the sale shows it, then answers no more. */
  function explorerDownOnceChecked() {
    const fetchAddressTxs = mempool.fetchAddressTxs;
    jest.spyOn(mempool, "fetchAddressTxs").mockImplementationOnce(async (base, address) => {
      const txs = await fetchAddressTxs(base, address);
      mempool.chain.down.add(MEMPOOL_API_URL);
      return txs;
    });
  }

  it("never says nothing was received before the explorer read the address", async () => {
    const service = lnurlService();
    service.expiry = 1;
    await fillPool();
    explorerDownOnceChecked();
    await openPos();
    await chargeFive();
    expect(qrValue()).toMatch(new RegExp(`^bitcoin:${FIRST}`));

    // Ended unpaid over Lightning, the address unread: no "Expired", and no code to pay any more.
    expect(await screen.findByText("Request expired", undefined, WAIT)).toBeTruthy();
    await pastGrace();
    expect(await screen.findByText("Checking the Bitcoin payment…", undefined, WAIT)).toBeTruthy();
    expect(screen.queryByText("Expired")).toBeNull();
    expect(screen.queryByTestId("qr-code")).toBeNull();
    expect(screen.getByText("Request expired")).toBeTruthy();
    expect(screen.queryByTestId("qr-spinner", { includeHiddenElements: true })).toBeNull();
    // The invoice's checks are over: no countdown, only the explorer is waited for.
    expect(screen.queryByText("00:00")).toBeNull();
    expect(screen.queryByTestId("share")).toBeNull();

    // The explorer answers at its next read (every minute): nothing paid the address.
    mempool.chain.down.delete(MEMPOOL_API_URL);
    await act(async () => jest.advanceTimersByTime(ONCHAIN_RESYNC_INTERVAL_MS));
    expect(await screen.findByText("Expired", undefined, WAIT)).toBeTruthy();
    expect(screen.getByText("The customer did not pay in time. Nothing was charged.")).toBeTruthy();
  });

  it("sees a payment made while the explorer could not be read, once it can", async () => {
    const service = lnurlService();
    service.expiry = 1;
    await fillPool();
    explorerDownOnceChecked();
    await openPos();
    await chargeFive();
    expect(qrValue()).toMatch(new RegExp(`^bitcoin:${FIRST}`));
    // Paid while the explorer answers no more and its socket tells nothing: only a later read of
    // the explorer can tell.
    const watchers = new Map(mempool.chain.watchers);
    mempool.chain.watchers.clear();
    mempool.pay(FIRST, SATS);
    for (const [address, handlers] of watchers) mempool.chain.watchers.set(address, handlers);
    await pastGrace();
    expect(await screen.findByText("Checking the Bitcoin payment…", undefined, WAIT)).toBeTruthy();

    mempool.chain.down.delete(MEMPOOL_API_URL);
    await act(async () => jest.advanceTimersByTime(ONCHAIN_RESYNC_INTERVAL_MS));
    expect(await screen.findByText("Confirming", undefined, WAIT)).toBeTruthy();
    expect(screen.queryByText("Expired")).toBeNull();
  });

  it("never shows an address paid already: it leaves the pool, the next one is shown", async () => {
    lnurlService();
    await fillPool();
    // Paid since it went back to the pool (a payer who kept its code).
    mempool.pay(FIRST, 4_000n);
    await openPos();
    await chargeFive();

    expect(qrValue()).toMatch(new RegExp(`^bitcoin:${taprootAddress(2)}\\?amount=`));
    expect((await loadOnchainPool("mainnet"))?.addresses).toEqual([taprootAddress(3)]);
  });

  it("names the merchant's node when it cannot tell, never mempool.space", async () => {
    const NODE = "https://node.example.ch";
    await savePosOptions(WALLET, {
      onchain: true,
      onchainTolerance: 0,
      bitcoinNode: { url: NODE, fallback: "none", payers: false }
    });
    lnurlService();
    await fillPool();
    mempool.chain.down.add(`${NODE}/api`);
    await openPos();
    await chargeFive();

    await waitFor(() => expect(qrValue()).toMatch(/^lightning:lnbc/));
    expect(onchainWarning()).toBe(
      "Bitcoin on-chain unavailable for this sale: node.example.ch could not check the Bitcoin address in time. The customer can pay over Lightning."
    );
    // "Lightning only": mempool.space was not asked in its place.
    expect(mempool.chain.calls.some(({ base }) => base === MEMPOOL_API_URL)).toBe(false);
  });

  it("says why a sale is Lightning only while the explorer cannot tell, keeping the address", async () => {
    lnurlService();
    await fillPool();
    mempool.chain.down.add(MEMPOOL_API_URL);
    await openPos();
    await chargeFive();

    await waitFor(() => expect(qrValue()).toMatch(/^lightning:lnbc/));
    expect(networks()).toBe("Lightning");
    // mempool.space failing does not go unnoticed.
    expect(onchainWarning()).toBe(EXPLORER_WARNING);
    expect((await loadOnchainPool("mainnet"))?.addresses).toHaveLength(3);

    // The explorer back: no second try for this sale, whose code (and a link shared of it) would
    // change. The sale stays Lightning only, and says so.
    mempool.chain.down.delete(MEMPOOL_API_URL);
    const code = qrValue();
    await act(async () => jest.advanceTimersByTimeAsync(ONCHAIN_RESYNC_INTERVAL_MS));
    expect(qrValue()).toBe(code);
    expect(onchainWarning()).toBe(EXPLORER_WARNING);
    expect((await loadOnchainPool("mainnet"))?.addresses).toHaveLength(3);
  });

  it("says why a sale is Lightning only on desktop too", async () => {
    mockDesktop.mockReturnValue(true);
    lnurlService();
    await fillPool();
    mempool.chain.down.add(MEMPOOL_API_URL);
    await openPos();
    await chargeFive();

    await waitFor(() => expect(qrValue()).toMatch(/^lightning:lnbc/));
    expect(onchainWarning()).toBe(EXPLORER_WARNING);
  });

  it("stays Lightning only under 1000 sats, without taking an address", async () => {
    lnurlService();
    await fillPool();
    await openPos();
    // 0.40 CHF: 800 sats.
    await type("4", "0");
    await fireEvent.press(screen.getByTestId("charge"));
    expect(await screen.findByText("Waiting for the payment")).toBeTruthy();

    await waitFor(() => expect(qrValue()).toMatch(/^lightning:lnbc8u/));
    expect(networks()).toBe("Lightning");
    // The on-chain floor (MIN_ONCHAIN_SATS): nothing to warn about.
    expect(onchainWarning()).toBeNull();
    // The pool's three addresses, untouched.
    expect((await loadOnchainPool("mainnet"))?.addresses).toHaveLength(3);
  });

  describe("above the most the Lightning address accepts", () => {
    /** 5 000 sats at most over Lightning: 5.00 CHF is 10 000 sats. */
    const MAX_MSAT = 5_000_000;
    const ADDRESS_ONLY = new RegExp(`^bitcoin:${FIRST}\\?amount=0\\.0001$`);

    it("shows the sale's address alone, without asking an invoice, and is paid on-chain", async () => {
      const service = lnurlService();
      service.maxSendable = MAX_MSAT;
      await fillPool();
      await openPos();
      await chargeFive();

      expect(qrValue()).toMatch(ADDRESS_ONLY);
      expect(networks()).toBe("Bitcoin");
      expect(onchainWarning()).toBeNull();
      // No invoice: no card can pay it either.
      expect(service.asked).toHaveLength(0);
      expect(screen.queryByTestId("boltcard")).toBeNull();
      expect(screen.getByText("Expires in")).toBeTruthy();
      // Taken before it was shown, as with an invoice.
      expect((await loadOnchainPool("mainnet"))?.addresses).toEqual([
        taprootAddress(2),
        taprootAddress(3)
      ]);

      await act(async () => {
        mempool.pay(FIRST, SATS);
      });
      expect(await screen.findByText("Confirming")).toBeTruthy();
      await act(async () => mempool.mine(3));
      expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
      expect(screen.getByText(/^Bitcoin · /)).toBeTruthy();
    });

    it("lays the address alone out on desktop too", async () => {
      mockDesktop.mockReturnValue(true);
      const service = lnurlService();
      service.maxSendable = MAX_MSAT;
      await fillPool();
      await openPos();
      await chargeFive();

      expect(qrValue()).toMatch(ADDRESS_ONLY);
      expect(networks()).toBe("Bitcoin");
    });

    it("refuses it, saying why, while the business accepts no on-chain payment", async () => {
      const service = lnurlService();
      service.maxSendable = MAX_MSAT;
      await fillPool();
      await savePosOptions(WALLET, { onchain: false, onchainTolerance: 0, bitcoinNode: null });
      await openPos();
      await type("5", "0", "0");
      await fireEvent.press(screen.getByTestId("charge"));

      expect(
        await screen.findByText(
          "Above 5'000 sats, this amount can only be paid on-chain, and on-chain payments are turned off."
        )
      ).toBeTruthy();
      // Another try would ask the same.
      expect(screen.queryByText("Try again")).toBeNull();
      expect(service.asked).toHaveLength(0);
      expect((await loadOnchainPool("mainnet"))?.addresses).toHaveLength(3);
    });

    it("refuses it while the device has no address, then shows one once there is", async () => {
      const service = lnurlService();
      service.maxSendable = MAX_MSAT;
      await openPos();
      await type("5", "0", "0");
      await fireEvent.press(screen.getByTestId("charge"));

      expect(
        await screen.findByText(
          "Above 5'000 sats, this amount can only be paid on-chain, and this device has no Bitcoin address ready. It prepares some at each unlock with your passkey, while connected to the internet."
        )
      ).toBeTruthy();
      expect(service.asked).toHaveLength(0);

      // Addresses prepared meanwhile: another try shows one.
      await fillPool();
      await fireEvent.press(screen.getByText("Try again"));
      expect(await screen.findByText("Waiting for the payment", undefined, WAIT)).toBeTruthy();
      expect(qrValue()).toMatch(ADDRESS_ONLY);
    });

    it("refuses it while the explorer cannot tell, keeping the address", async () => {
      const service = lnurlService();
      service.maxSendable = MAX_MSAT;
      await fillPool();
      mempool.chain.down.add(MEMPOOL_API_URL);
      await openPos();
      await type("5", "0", "0");
      await fireEvent.press(screen.getByTestId("charge"));

      expect(
        await screen.findByText(
          "Above 5'000 sats, this amount can only be paid on-chain, and mempool.space could not check the Bitcoin address in time. Try again.",
          undefined,
          WAIT
        )
      ).toBeTruthy();
      expect(screen.getByText("Try again")).toBeTruthy();
      expect(service.asked).toHaveLength(0);
      expect((await loadOnchainPool("mainnet"))?.addresses).toHaveLength(3);
    });

    it("names the merchant's node when it cannot tell", async () => {
      const NODE = "https://node.example.ch";
      await savePosOptions(WALLET, {
        onchain: true,
        onchainTolerance: 0,
        bitcoinNode: { url: NODE, fallback: "none", payers: false }
      });
      const service = lnurlService();
      service.maxSendable = MAX_MSAT;
      await fillPool();
      mempool.chain.down.add(`${NODE}/api`);
      await openPos();
      await type("5", "0", "0");
      await fireEvent.press(screen.getByTestId("charge"));

      expect(
        await screen.findByText(
          "Above 5'000 sats, this amount can only be paid on-chain, and node.example.ch could not check the Bitcoin address in time. Try again.",
          undefined,
          WAIT
        )
      ).toBeTruthy();
      expect(service.asked).toHaveLength(0);
    });

    it("refuses it on an employee's device without a lot, saying whom to ask", async () => {
      const service = lnurlService();
      service.maxSendable = MAX_MSAT;
      await saveTerminalProfile({
        version: 3,
        team: "a".repeat(64),
        memberName: "Alice",
        lightningAddress: ADDRESS,
        businessName: "Fine Bakery",
        currency: "CHF"
      });
      setClock(START);
      const router = await renderRouter(routes, { initialUrl: "/" });
      await waitFor(() => expect(router.getPathname()).toBe("/pos"));
      await type("5", "0", "0");
      await fireEvent.press(screen.getByTestId("charge"));

      expect(
        await screen.findByText(
          "Above 5'000 sats, this amount can only be paid on-chain, and this device has no Bitcoin address available. The business owner gives it some when unlocking their app with their passkey, while connected to the internet."
        )
      ).toBeTruthy();
    });

    it("shares a link with its address, whose payer's page shows it alone too", async () => {
      const service = lnurlService();
      service.maxSendable = MAX_MSAT;
      const share = mockShare();
      await fillPool();
      await openPos();
      await chargeFive();

      await fireEvent.press(screen.getByTestId("share"));
      const { ref } = sharedLink(share);
      await waitFor(() => expect(publications()).toHaveLength(PAYMENT_LINK_RELAYS.length));
      // The sale, with its address (payment-link-page.test.tsx: the page shows it alone above
      // the bounds, as here).
      expect(await fetchPaymentLink(ref, "bc")).toMatchObject({
        status: "found",
        value: { kind: "sale", sale: { onchainAddress: FIRST } }
      });
    });

    it("keeps both networks for an amount within the bounds", async () => {
      const service = lnurlService();
      // Exactly 10 000 sats: still accepted over Lightning.
      service.maxSendable = 10_000_000;
      await fillPool();
      await openPos();
      await chargeFive();

      expect(qrValue()).toMatch(new RegExp(`^bitcoin:${FIRST}\\?amount=0\\.0001&lightning=lnbc`));
      expect(networks()).toBe("Lightning or Bitcoin");
    });
  });

  it("asks a rest under 1000 sats over Lightning only", async () => {
    const service = lnurlService();
    await fillPool();
    await openPos();
    await chargeFive();
    await act(async () => {
      mempool.pay(FIRST, 9_500n);
    });
    expect(await screen.findByText("Left to pay")).toBeTruthy();

    await waitFor(() => expect(service.asked).toHaveLength(2));
    expect(service.asked[1].searchParams.get("amount")).toBe("500000");
    await waitFor(() => expect(qrValue()).toMatch(/^lightning:lnbc5u/));
    expect(networks()).toBe("Lightning");
    expect(onchainWarning()).toBeNull();

    // Paid over Lightning: the on-chain part still has to confirm.
    service.settled.add(lastPaymentHash(service));
    expect(await screen.findByText("Confirming", undefined, WAIT)).toBeTruthy();
  });

  it("puts the address back once the invoice is paid over Lightning", async () => {
    const service = lnurlService();
    await fillPool(1);
    await openPos();
    await chargeFive();
    expect((await loadOnchainPool("mainnet"))?.addresses).toEqual([]);

    service.settled.add(lastPaymentHash(service));
    expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
    expect(screen.getByText(/^Lightning · /)).toBeTruthy();
    await waitFor(async () =>
      expect((await loadOnchainPool("mainnet"))?.addresses).toEqual([FIRST])
    );
  });

  it("asks for the rest of an underpayment over both networks, until the sale's end", async () => {
    const service = lnurlService();
    await fillPool();
    await openPos();
    await chargeFive();

    await act(async () => {
      mempool.pay(FIRST, 4_000n);
    });
    expect(await screen.findByText("Left to pay")).toBeTruthy();
    expect(screen.getByText("Left")).toBeTruthy();
    expect(screen.getByText("Received")).toBeTruthy();
    // The sale's own time left, not a day more.
    expect(screen.getByText("Expires in")).toBeTruthy();
    // 4 000 of 10 000 sats: 2.00 of the 5.00 CHF.
    expect(screen.getByText("2.00 CHF")).toBeTruthy();
    expect(screen.getByText("3.00 CHF")).toBeTruthy();
    expect(screen.getAllByLabelText("6'000 sats").length).toBeGreaterThan(0);
    expect(screen.queryByText("Cancel the transaction")).toBeNull();

    // The rest over Lightning, at the point of the hour, until the sale's end (13:20:30).
    await waitFor(() => expect(service.asked).toHaveLength(2));
    expect(service.asked[1].searchParams.get("amount")).toBe("6000000");
    const expiry = Number(service.asked[1].searchParams.get("expiry"));
    expect(expiry).toBeLessThanOrEqual(600);
    expect(expiry).toBeGreaterThan(540);
    await waitFor(() =>
      expect(qrValue()).toMatch(new RegExp(`^bitcoin:${FIRST}\\?amount=0\\.00006&lightning=lnbc`))
    );
    expect(networks()).toBe("Lightning or Bitcoin");

    // Paid over Lightning: the on-chain part still has to confirm. Paid, both parts: 10 000 sats.
    service.settled.add(lastPaymentHash(service));
    expect(await screen.findByText("Confirming", undefined, WAIT)).toBeTruthy();
    expect(screen.getAllByLabelText("10'000 sats").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("4'000 sats")).toBeNull();
    expect(screen.getByText(/^Bitcoin \+ Lightning · /)).toBeTruthy();
    await act(async () => mempool.mine(3));
    expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
    expect(screen.getByText(/^Bitcoin \+ Lightning · /)).toBeTruthy();
  });

  it("still sees the rest paid in the last seconds of its invoice", async () => {
    const service = lnurlService();
    await fillPool();
    await openPos();
    await chargeFive();
    // A service that keeps its invoices a second only.
    service.expiry = 1;
    await act(async () => {
      mempool.pay(FIRST, 4_000n);
    });
    await waitFor(() => expect(service.asked).toHaveLength(2));
    const restHash = lastPaymentHash(service);

    // Ended: the code only gives the address, and the invoice is still checked, not replaced.
    await act(async () => jest.advanceTimersByTime(3000));
    await waitFor(() => expect(qrValue()).toBe(`bitcoin:${FIRST}?amount=0.00006`));
    expect(service.asked).toHaveLength(2);

    service.settled.add(restHash);
    expect(await screen.findByText("Confirming", undefined, WAIT)).toBeTruthy();
    expect(service.asked).toHaveLength(2);
  });

  it("makes a new invoice of the rest once the previous one ended unpaid", async () => {
    const service = lnurlService();
    await fillPool();
    await openPos();
    await chargeFive();
    service.expiry = 1;
    await act(async () => {
      mempool.pay(FIRST, 4_000n);
    });
    await waitFor(() => expect(service.asked).toHaveLength(2));

    // Asked again once the previous one ended and its payment can no longer be reported.
    await pastGrace();
    await waitFor(() => expect(service.asked).toHaveLength(3), WAIT);
    expect(service.asked[2].searchParams.get("amount")).toBe("6000000");
    await waitFor(() =>
      expect(qrValue()).toMatch(new RegExp(`^bitcoin:${FIRST}\\?amount=0\\.00006&lightning=lnbc`))
    );
  });

  it("never asks the whole amount again when the on-chain part vanishes after the rest", async () => {
    const service = lnurlService();
    await fillPool();
    await openPos();
    await chargeFive();
    let txid = "";
    await act(async () => {
      txid = mempool.pay(FIRST, 4_000n);
    });
    await waitFor(() => expect(service.asked).toHaveLength(2));
    service.settled.add(lastPaymentHash(service));
    expect(await screen.findByText("Confirming", undefined, WAIT)).toBeTruthy();

    // Spent elsewhere before it confirmed: the 6 000 sats of Lightning are all there is, the sale is
    // underpaid, its rest asked until its end.
    await act(async () => mempool.drop(txid));

    expect(await screen.findByText("Left to pay")).toBeTruthy();
    await waitFor(() => expect(service.asked).toHaveLength(3));
    expect(service.asked[2].searchParams.get("amount")).toBe("4000000");

    // Past its end: "Underpaid", with what came over Lightning.
    await act(async () => jest.setSystemTime(START + 600_000));
    await pastGrace();
    expect(await screen.findByText("Underpaid", undefined, WAIT)).toBeTruthy();
    const received = within(screen.getByTestId("received-transactions"));
    expect(received.queryAllByTestId("received-transaction")).toHaveLength(0);
    expect(received.getByLabelText("6'000 sats")).toBeTruthy();
    expect(screen.queryByText("Create the request again")).toBeNull();
  });

  it("takes the rest of an underpayment on-chain too", async () => {
    lnurlService();
    await fillPool();
    await openPos();
    await chargeFive();

    await act(async () => {
      mempool.pay(FIRST, 4_000n);
    });
    expect(await screen.findByText("Left to pay")).toBeTruthy();
    await act(async () => {
      mempool.pay(FIRST, 6_000n);
    });

    expect(await screen.findByText("Confirming")).toBeTruthy();
  });

  it('keeps an underpaid sale "Underpaid" past its end, with the transactions received', async () => {
    jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    const service = lnurlService();
    await fillPool();
    await openPos();
    await chargeFive();
    let txid = "";
    await act(async () => {
      txid = mempool.pay(FIRST, 4_000n);
    });
    expect(await screen.findByText("Left to pay")).toBeTruthy();

    // The sale's 10 minutes, no longer: past its end, and the 2 minutes its invoices' payments may
    // still be reported, it stays underpaid.
    await act(async () => jest.setSystemTime(START + 600_000));
    await pastGrace();
    expect(await screen.findByText("Underpaid", undefined, WAIT)).toBeTruthy();
    expect(screen.queryByText("Expired")).toBeNull();
    expect(screen.getByText("The time to pay is over: 6'000 sats are missing.")).toBeTruthy();
    const chain = within(screen.getByTestId("underpaid-chain"));
    expect(chain.getByText("Missing")).toBeTruthy();
    expect(chain.getByLabelText("6'000 sats")).toBeTruthy();
    const received = within(screen.getByTestId("received-transactions"));
    expect(received.getAllByTestId("received-transaction")).toHaveLength(1);
    expect(received.getByLabelText("4'000 sats")).toBeTruthy();
    expect(received.getByText("Confirming · 0/3")).toBeTruthy();
    // Its transaction, linked to mempool.space.
    await fireEvent.press(
      received.getByLabelText(
        `View transaction ${txid.slice(0, 8)}…${txid.slice(-8)} on mempool.space`
      )
    );
    expect(Linking.openURL).toHaveBeenCalledWith(`https://mempool.space/tx/${txid}`);
    // Nothing asked any more: no code, no new request of the whole amount (it would charge too much).
    expect(screen.queryByTestId("qr-code")).toBeNull();
    expect(screen.queryByText("Create the request again")).toBeNull();
    const asked = service.asked.length;

    // Its transaction confirms: shown so, nothing else changes.
    await act(async () => mempool.mine(3));
    expect(await received.findByText("Confirmed", undefined, WAIT)).toBeTruthy();
    expect(screen.getByText("Underpaid")).toBeTruthy();

    // A transaction received later still counts, at its own hour's point:
    // 4 000 + 6 000 sats cover the 10 000 of 13:00.
    await act(async () => {
      mempool.pay(FIRST, 6_000n);
    });
    expect(await screen.findByText("Confirming", undefined, WAIT)).toBeTruthy();
    expect(service.asked).toHaveLength(asked);
  });

  it("is paid once the owner accepts what it received, while its rest could still be paid", async () => {
    // The business's link owner key is of the test team.
    const team = deriveTeamKeys(
      encodeWalletSecret({
        mnemonic:
          "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
      })
    );
    const ownerSecret = deriveLinkOwner(team).secretKey;
    expect(deriveLinkOwner(team).publicKey).toBe(LINK_OWNER);
    lnurlService();
    await fillPool();
    const { router } = await openPos();
    await chargeFive();
    await act(async () => {
      mempool.pay(FIRST, 4_000n);
    });
    expect(await screen.findByText("Left to pay")).toBeTruthy();
    // The sale, as its device keeps it for its verdict from its first invoice: its own key.
    const followedSales = await loadFollowedSales();
    expect(followedSales).toHaveLength(1);
    const [followed] = followedSales;
    const saleKey = hexToBytes(followed!.saleKey);

    // The owner accepts its 4 000 of 10 000 sats (sale-acceptance.ts): looked for while underpaid.
    await act(async () => {
      await publishSaleAcceptance(
        saleAcceptanceEvent(
          ownerSecret,
          saleKey,
          { received: 4_000n, due: 10_000n },
          Math.floor(Date.now() / 1000)
        ),
        saleOwnerSecretKey(ownerSecret, saleKey),
        PAYMENT_LINK_RELAYS
      );
    });
    await act(async () => jest.advanceTimersByTimeAsync(SALE_ACCEPTANCE_POLL_MS));
    expect(
      await screen.findByText(
        "The owner accepted the amount received: the sale is paid.",
        undefined,
        WAIT
      )
    ).toBeTruthy();
    expect(screen.getByText("Paid")).toBeTruthy();
    // Nothing asked any more: no code of the rest.
    expect(screen.queryByTestId("qr-code")).toBeNull();
    expect(screen.queryByText("Left to pay")).toBeNull();
    // Back to the keypad, the sale over, as after a sale paid.
    await fireEvent.press(screen.getByText("Back to the Point of Sale"));
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
  });

  it("leaves a fresh keypad behind an underpaid sale past its end", async () => {
    lnurlService();
    await fillPool();
    const { router } = await openPos();
    await chargeFive();
    await act(async () => {
      mempool.pay(FIRST, 4_000n);
    });
    expect(await screen.findByText("Left to pay")).toBeTruthy();
    await act(async () => jest.setSystemTime(START + 600_000));
    await pastGrace();
    expect(await screen.findByText("Underpaid", undefined, WAIT)).toBeTruthy();

    // Its whole amount charged again would charge the customer too much.
    await fireEvent.press(screen.getByText("Back to the Point of Sale"));
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    expect(screen.getByLabelText("0 CHF")).toBeTruthy();
  });

  it("never counts an hour past an underpaid sale's end", async () => {
    // 9 700 sats at 13:10, 10 000 due: underpaid. At 14:00, after the sale's end (13:20:30), 5.00 CHF
    // is 9 616 sats: it would be covered then, but the sale's time is over.
    mockPoints.set(HOUR_END, 52000);
    lnurlService();
    await fillPool();
    await openPos();
    await chargeFive();
    await act(async () => {
      mempool.pay(FIRST, 9_700n);
    });
    expect(await screen.findByText("Left to pay")).toBeTruthy();

    await act(async () => jest.setSystemTime(Date.UTC(2026, 9, 3, 14, 10)));
    await act(async () => jest.advanceTimersByTimeAsync(5000));
    await pastGrace();
    expect(await screen.findByText("Underpaid", undefined, WAIT)).toBeTruthy();
    expect(screen.getByText("The time to pay is over: 300 sats are missing.")).toBeTruthy();
    expect(screen.queryByText("Confirming")).toBeNull();
  });

  it("shares a link with the address, which never expires nor changes once underpaid", async () => {
    lnurlService();
    const share = mockShare();
    await fillPool();
    await openPos();
    await chargeFive();

    await fireEvent.press(screen.getByTestId("share"));
    const { ref, id, key } = sharedLink(share);
    await waitFor(() => expect(publications()).toHaveLength(PAYMENT_LINK_RELAYS.length));
    const first = await fetchPaymentLink(ref, "bc");
    expect(first).toMatchObject({
      status: "found",
      value: { kind: "sale", sale: { onchainAddress: FIRST } }
    });
    // No end: the payer finds the page years later. At the address the
    // sale's key gives.
    expect(publications()[0].event?.tags).toEqual([["d", saleLinkAddress(key)]]);

    await act(async () => {
      mempool.pay(FIRST, 4_000n);
    });
    expect(await screen.findByText("Left to pay")).toBeTruthy();

    // Shared from this screen: the same link, not published again.
    await fireEvent.press(screen.getByTestId("share"));
    expect(sharedLink(share, 1).id).toBe(id);
    expect(publications()).toHaveLength(PAYMENT_LINK_RELAYS.length);
    expect(await fetchPaymentLink(ref, "bc")).toMatchObject({ status: "found" });
  });

  it("publishes an expired sale's final version 3 hours after its end, without its address", async () => {
    lnurlService();
    const share = mockShare();
    await fillPool();
    await openPos();
    await chargeFive();
    await fireEvent.press(screen.getByTestId("share"));
    const { ref, key } = sharedLink(share);
    await waitFor(() => expect(publications()).toHaveLength(PAYMENT_LINK_RELAYS.length));
    expect(publications()[0].event?.tags).toEqual([["d", saleLinkAddress(key)]]);
    await fireEvent.press(screen.getByTestId("charge-back"));

    // Expired at its end, but a payment may still be reported for 3 hours (Breez keeps an expired
    // invoice that long): no final version 2 hours after it. One act per step: React renders the
    // worker's rounds in between.
    const end = START + 600 * 1000;
    await act(async () => jest.setSystemTime(end + 2 * 3600 * 1000));
    await act(async () => jest.advanceTimersByTimeAsync(FINALIZE_INTERVAL_MS));
    for (let step = 0; step < 30; step += 1) {
      await act(async () => jest.advanceTimersByTimeAsync(5000));
    }
    expect(publications()).toHaveLength(PAYMENT_LINK_RELAYS.length);

    // Past those 3 hours: the next round publishes it.
    await act(async () => jest.setSystemTime(end + 3 * 3600 * 1000));
    await act(async () => jest.advanceTimersByTimeAsync(FINALIZE_INTERVAL_MS));
    await waitFor(() => expect(publications()).toHaveLength(PAYMENT_LINK_RELAYS.length * 2), WAIT);
    const lookup = await fetchPaymentLink(ref, "bc");
    // Nothing paid the address: it is left out, the payer's page shows it no more.
    expect(lookup).toMatchObject({
      status: "found",
      value: {
        kind: "sale",
        sale: { onchainAddress: null, final: { status: "expired", received: 0n, onchain: null } }
      }
    });
    expect(await loadPendingLinks("bc")).toEqual([]);
    // And it goes back to the pool, behind the others: the next sales may show it.
    expect((await loadOnchainPool("mainnet"))?.addresses).toEqual([
      taprootAddress(2),
      taprootAddress(3),
      FIRST
    ]);
  });

  it("publishes an underpaid sale's final version once its transactions are deep enough", async () => {
    lnurlService();
    const share = mockShare();
    await fillPool();
    await openPos();
    await chargeFive();
    await fireEvent.press(screen.getByTestId("share"));
    const { ref } = sharedLink(share);
    await waitFor(() => expect(publications()).toHaveLength(PAYMENT_LINK_RELAYS.length));
    await act(async () => {
      mempool.pay(FIRST, 4_000n);
    });
    expect(await screen.findByText("Left to pay")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("charge-back"));

    // 3 hours after its end, its transaction still unconfirmed: a replacement would make the final
    // version wrong, none yet.
    const end = START + 600 * 1000;
    await act(async () => jest.setSystemTime(end + 3 * 3600 * 1000));
    await act(async () => jest.advanceTimersByTimeAsync(FINALIZE_INTERVAL_MS));
    for (let step = 0; step < 30; step += 1) {
      await act(async () => jest.advanceTimersByTimeAsync(5000));
    }
    expect(publications()).toHaveLength(PAYMENT_LINK_RELAYS.length);

    // Deep enough: the next look, an hour later, publishes it, with the point of what was due.
    await act(async () => mempool.mine(3));
    await act(async () => jest.setSystemTime(end + 4 * 3600 * 1000 + 60_000));
    await act(async () => jest.advanceTimersByTimeAsync(FINALIZE_INTERVAL_MS));
    await waitFor(() => expect(publications()).toHaveLength(PAYMENT_LINK_RELAYS.length * 2), WAIT);
    expect(await fetchPaymentLink(ref, "bc")).toMatchObject({
      status: "found",
      value: {
        kind: "sale",
        sale: {
          onchainAddress: FIRST,
          final: {
            status: "underpaid",
            received: 4_000n,
            due: 10_000n,
            point: { rate: 50000 },
            onchain: { address: FIRST, sats: 4_000n, transactions: [{ sats: 4_000n }] }
          }
        }
      }
    });
    expect(await loadPendingLinks("bc")).toEqual([]);
    // Paid: the address never goes back to the pool.
    expect((await loadOnchainPool("mainnet"))?.addresses).toEqual([
      taprootAddress(2),
      taprootAddress(3)
    ]);
  });

  it("publishes a shared sale paid within the tolerance as accepted, never naming the tolerance", async () => {
    lnurlService();
    const share = mockShare();
    await fillPool();
    await savePosOptions(WALLET, { onchain: true, onchainTolerance: 500, bitcoinNode: null });
    await openPos();
    await chargeFive();
    await fireEvent.press(screen.getByTestId("share"));
    const { ref, id, key } = sharedLink(share);
    await waitFor(() => expect(publications()).toHaveLength(PAYMENT_LINK_RELAYS.length));
    // This device settles the sale with its tolerance, kept beside the link.
    expect(await loadPendingLinks("bc")).toMatchObject([{ id, tolerance: 500 }]);

    await act(async () => {
      mempool.pay(FIRST, 9_500n);
    });
    expect(await screen.findByText("Confirming")).toBeTruthy();
    await act(async () => mempool.mine(3));
    expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
    await waitFor(() => expect(publications()).toHaveLength(PAYMENT_LINK_RELAYS.length * 2), WAIT);
    expect(await fetchPaymentLink(ref, "bc")).toMatchObject({
      status: "found",
      value: {
        kind: "sale",
        sale: {
          final: {
            status: "paid",
            received: 9_500n,
            due: 10_000n,
            accepted: true,
            onchain: { address: FIRST, sats: 9_500n }
          }
        }
      }
    });
    // What its payer reads, the link and its final version as published: never the tolerance.
    const published = publications().map(({ event }) =>
      openRecord(event, {
        type: "payment-link",
        encryptionKey: key,
        address: saleLinkAddress(key),
        author: id,
        parse: (payload) => payload
      })
    );
    const payloads = published.map((opened) =>
      opened?.status === "ok" ? (opened.value as Record<string, unknown>) : null
    );
    expect(payloads.every((payload) => payload !== null)).toBe(true);
    for (const payload of payloads) expect(JSON.stringify(payload)).not.toMatch(/toleran/i);
    // The final version says only that the business accepted it.
    const final = payloads.find((payload) => payload?.final)?.final as Record<string, unknown>;
    expect(Object.keys(final).sort()).toEqual(
      ["accepted", "due", "lightning", "link", "onchain", "point", "received", "status"].sort()
    );
    expect(final.accepted).toBe(true);
    expect(await loadPendingLinks("bc")).toEqual([]);
  });

  it("settles a shared sale left open with its own tolerance, whatever the business sets since", async () => {
    lnurlService();
    const share = mockShare();
    await fillPool();
    await savePosOptions(WALLET, { onchain: true, onchainTolerance: 500, bitcoinNode: null });
    await openPos();
    await chargeFive();
    await fireEvent.press(screen.getByTestId("share"));
    const { ref } = sharedLink(share);
    await waitFor(() => expect(publications()).toHaveLength(PAYMENT_LINK_RELAYS.length));
    await fireEvent.press(screen.getByTestId("charge-back"));
    // The business sets none meanwhile: the sale keeps the one it was made with.
    await act(async () => {
      await savePosOptions(WALLET, { onchain: true, onchainTolerance: 0, bitcoinNode: null });
    });

    // Paid from its payer's page once the screen was left, 5 % short, deep enough.
    await act(async () => {
      mempool.pay(FIRST, 9_500n);
    });
    await act(async () => mempool.mine(3));
    const end = START + 600 * 1000;
    await act(async () => jest.setSystemTime(end + 4 * 3600 * 1000));
    await act(async () => jest.advanceTimersByTimeAsync(FINALIZE_INTERVAL_MS));
    await waitFor(() => expect(publications()).toHaveLength(PAYMENT_LINK_RELAYS.length * 2), WAIT);
    expect(await fetchPaymentLink(ref, "bc")).toMatchObject({
      status: "found",
      value: {
        kind: "sale",
        sale: { final: { status: "paid", received: 9_500n, due: 10_000n, accepted: true } }
      }
    });
    expect(await loadPendingLinks("bc")).toEqual([]);
  });

  it("keeps a shared sale's address used until its link's final version is out", async () => {
    const service = lnurlService();
    const share = mockShare();
    await fillPool(1);
    await openPos();
    await chargeFive();
    await fireEvent.press(screen.getByTestId("share"));
    const { id } = sharedLink(share);
    await waitFor(() => expect(publications()).toHaveLength(PAYMENT_LINK_RELAYS.length));

    // Paid over Lightning while no relay takes the link's final version: the payer's page still
    // shows the address, which stays out of the pool.
    const publish = relays.publishEvent;
    const refusing = jest
      .spyOn(relays, "publishEvent")
      .mockImplementation((url, event, options) =>
        event.pubkey === id ? Promise.reject(new Error("blocked")) : publish(url, event, options)
      );
    service.settled.add(lastPaymentHash(service));
    expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
    await act(async () => jest.advanceTimersByTimeAsync(30_000));
    expect(refusing.mock.calls.some(([, event]) => event.pubkey === id)).toBe(true);
    expect((await loadOnchainPool("mainnet"))?.addresses).toEqual([]);

    // The relays take it again: the pending links' worker (the paid screen went back to the keypad
    // on its own) publishes it, and the address goes back.
    refusing.mockRestore();
    expect(screen.queryByTestId("back-to-pos")).toBeNull();
    await act(async () => jest.advanceTimersByTimeAsync(FINALIZE_INTERVAL_MS));
    await waitFor(() => expect(publications()).toHaveLength(PAYMENT_LINK_RELAYS.length * 2), WAIT);
    await waitFor(async () =>
      expect((await loadOnchainPool("mainnet"))?.addresses).toEqual([FIRST])
    );
  });

  it("puts a shared sale's address back once, with the final version of its link", async () => {
    const service = lnurlService();
    mockShare();
    await fillPool(1);
    await openPos();
    await chargeFive();
    await fireEvent.press(screen.getByTestId("share"));
    await waitFor(() => expect(publications()).toHaveLength(PAYMENT_LINK_RELAYS.length));

    service.settled.add(lastPaymentHash(service));
    expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
    await waitFor(() => expect(publications()).toHaveLength(PAYMENT_LINK_RELAYS.length * 2), WAIT);
    await waitFor(async () =>
      expect((await loadOnchainPool("mainnet"))?.addresses).toEqual([FIRST])
    );

    // The next sale takes it; neither the screen nor the pending links' worker puts it back again.
    await fireEvent.press(screen.getByTestId("back-to-pos"));
    await chargeFive();
    expect((await loadOnchainPool("mainnet"))?.addresses).toEqual([]);
    for (let round = 0; round < 3; round += 1) {
      await act(async () => jest.advanceTimersByTimeAsync(FINALIZE_INTERVAL_MS));
    }
    expect((await loadOnchainPool("mainnet"))?.addresses).toEqual([]);
  });

  it("publishes a final version only once the address is read: paid on-chain and over Lightning", async () => {
    const service = lnurlService();
    const share = mockShare();
    await fillPool();
    await openPos();
    await chargeFive();
    await fireEvent.press(screen.getByTestId("share"));
    const { ref } = sharedLink(share);
    await waitFor(() => expect(publications()).toHaveLength(PAYMENT_LINK_RELAYS.length));
    await act(async () => {
      mempool.pay(FIRST, 4_000n);
    });
    expect(await screen.findByText("Left to pay")).toBeTruthy();
    await waitFor(() => expect(service.asked).toHaveLength(2));
    await fireEvent.press(screen.getByTestId("charge-back"));
    // The rest paid over Lightning once the screen was left, the on-chain part confirmed.
    service.settled.add(lastPaymentHash(service));
    await act(async () => mempool.mine(3));

    // The explorer out of reach when the worker looks: the Lightning part alone is never the
    // outcome ("Expired" with 6 000 sats, for good).
    mempool.chain.down.add(MEMPOOL_API_URL);
    const end = START + 600 * 1000;
    await act(async () => jest.setSystemTime(end + 4 * 3600 * 1000));
    await act(async () => jest.advanceTimersByTimeAsync(FINALIZE_INTERVAL_MS));
    for (let step = 0; step < 40; step += 1) {
      await act(async () => jest.advanceTimersByTimeAsync(2000));
    }
    expect(publications()).toHaveLength(PAYMENT_LINK_RELAYS.length);

    // Back: the next look publishes the outcome, paid on both networks.
    mempool.chain.down.clear();
    await act(async () => jest.setSystemTime(Date.now() + 3600 * 1000));
    await act(async () => jest.advanceTimersByTimeAsync(FINALIZE_INTERVAL_MS));
    await waitFor(() => expect(publications()).toHaveLength(PAYMENT_LINK_RELAYS.length * 2), WAIT);
    const lookup = await fetchPaymentLink(ref, "bc");
    expect(lookup).toMatchObject({
      status: "found",
      value: {
        kind: "sale",
        sale: {
          onchainAddress: FIRST,
          final: { status: "paid", received: 10_000n, onchain: { address: FIRST, sats: 4_000n } }
        }
      }
    });
  });

  it("makes a link from the screen of an underpayment", async () => {
    lnurlService();
    const share = mockShare();
    await fillPool();
    await openPos();
    await chargeFive();
    await act(async () => {
      mempool.pay(FIRST, 4_000n);
    });
    expect(await screen.findByText("Left to pay")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("share"));
    const { ref, key } = sharedLink(share);
    await waitFor(() => expect(publications()).toHaveLength(PAYMENT_LINK_RELAYS.length));
    expect(publications()[0].event?.tags).toEqual([["d", saleLinkAddress(key)]]);
    expect(await fetchPaymentLink(ref, "bc")).toMatchObject({
      status: "found",
      value: { kind: "sale", sale: { onchainAddress: FIRST } }
    });
  });

  it("shares the code itself in a build without a web app for its links", async () => {
    const service = lnurlService();
    mockLinkOrigin.mockReturnValue(null);
    const share = mockShare();
    await fillPool();
    await openPos();
    await chargeFive();

    await fireEvent.press(screen.getByTestId("share"));
    expect(share).toHaveBeenCalledWith({ message: qrValue() });
    expect(qrValue()).toMatch(/^bitcoin:/);

    // Underpaid: the rest.
    await act(async () => {
      mempool.pay(FIRST, 4_000n);
    });
    await waitFor(() => expect(service.asked).toHaveLength(2));
    await waitFor(() => expect(qrValue()).toMatch(/&lightning=lnbc/));
    await fireEvent.press(screen.getByTestId("share"));
    expect(share).toHaveBeenLastCalledWith({ message: qrValue() });
    expect(qrValue()).toMatch(new RegExp(`^bitcoin:${FIRST}\\?amount=0\\.00006&`));
    // No link published: only the invoices' declarations.
    expect(publications()).toHaveLength(0);
  });

  it("lays the on-chain screens out on desktop", async () => {
    mockDesktop.mockReturnValue(true);
    lnurlService();
    await fillPool();
    await openPos();
    await chargeFive();

    let txid = "";
    await act(async () => {
      txid = mempool.pay(FIRST, 4_000n);
    });
    expect(await screen.findByText("Left to pay")).toBeTruthy();
    expect(screen.getByTestId("share")).toBeTruthy();
    await act(async () => {
      mempool.pay(FIRST, 6_000n);
    });
    expect(await screen.findByText(/^Bitcoin · /)).toBeTruthy();
    // Its pill on desktop too, unlike the others.
    expect(screen.getByText("Confirming")).toBeTruthy();
    expect(txid).not.toBe("");

    await act(async () => mempool.mine(3));
    // Paid: no pill, as on the other desktop outcomes.
    await waitFor(() => expect(screen.queryByText("Confirming")).toBeNull(), WAIT);
    expect(screen.queryByText("Paid")).toBeNull();
    expect(screen.getByText(/^Bitcoin · /)).toBeTruthy();
  });

  describe("hour by hour", () => {
    /** 14:04:00 UTC: a minute left in the period of the point of 13:00. */
    const LATE = Date.UTC(2026, 9, 3, 14, 4);

    /** Until `time` (ms), in fake time: timers fire on the way. */
    async function until(time: number) {
      await act(async () => jest.advanceTimersByTimeAsync(time - Date.now()));
    }

    beforeEach(() => {
      // 50 000 CHF per bitcoin until 14:05, then the point of 14:00, 40 000: 5.00 CHF is 10 000
      // sats, then 12 500.
      mockPoints.set(HOUR_END, 40000);
    });

    it("asks a new invoice at HH:05, at the point of the hour, for the sale's time left", async () => {
      const service = lnurlService();
      await fillPool();
      await openPos(LATE);
      await chargeFive();

      // Until 14:05 only.
      expect(service.asked).toHaveLength(1);
      expect(service.asked[0].searchParams.get("amount")).toBe("10000000");
      expect(Number(service.asked[0].searchParams.get("expiry"))).toBeLessThanOrEqual(60);
      expect(qrValue()).toMatch(new RegExp(`^bitcoin:${FIRST}\\?amount=0\\.0001&lightning=lnbc`));

      // 14:05: the point of 14:00, until the end of the sale's 10 minutes (14:14).
      await until(PERIOD_END * 1000 + 1000);
      await waitFor(() => expect(service.asked).toHaveLength(2));
      expect(service.asked[1].searchParams.get("amount")).toBe("12500000");
      const expiry = Number(service.asked[1].searchParams.get("expiry"));
      expect(expiry).toBeLessThanOrEqual(540);
      expect(expiry).toBeGreaterThan(530);
      await waitFor(() =>
        expect(qrValue()).toMatch(
          new RegExp(`^bitcoin:${FIRST}\\?amount=0\\.000125&lightning=lnbc`)
        )
      );
      // The same address: one taken for the sale.
      expect((await loadOnchainPool("mainnet"))?.addresses).toEqual([
        taprootAddress(2),
        taprootAddress(3)
      ]);

      service.settled.add(lastPaymentHash(service));
      expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
    });

    it("shows the address alone from the hour its amount goes above the Lightning address's bounds", async () => {
      const service = lnurlService();
      // 11 000 sats at most: 10 000 until 14:05, then 12 500.
      service.maxSendable = 11_000_000;
      await fillPool();
      await openPos(LATE);
      await chargeFive();
      expect(qrValue()).toMatch(new RegExp(`^bitcoin:${FIRST}\\?amount=0\\.0001&lightning=lnbc`));

      await until(PERIOD_END * 1000 + 1000);
      // The same address, alone: no invoice asked for this hour.
      await waitFor(() =>
        expect(qrValue()).toMatch(new RegExp(`^bitcoin:${FIRST}\\?amount=0\\.000125$`))
      );
      expect(service.asked).toHaveLength(1);
      expect(networks()).toBe("Bitcoin");
      expect(screen.queryByTestId("boltcard")).toBeNull();
      expect((await loadOnchainPool("mainnet"))?.addresses).toEqual([
        taprootAddress(2),
        taprootAddress(3)
      ]);

      await act(async () => {
        mempool.pay(FIRST, 12_500n);
      });
      expect(await screen.findByText("Confirming")).toBeTruthy();
    });

    it("asks an invoice again from the hour its amount comes within the bounds", async () => {
      // 60 000 CHF per bitcoin from 14:05: 5.00 CHF is 8 334 sats.
      mockPoints.set(HOUR_END, 60000);
      const service = lnurlService();
      service.maxSendable = 9_000_000;
      await fillPool();
      await openPos(LATE);
      await chargeFive();
      expect(qrValue()).toMatch(new RegExp(`^bitcoin:${FIRST}\\?amount=0\\.0001$`));
      expect(service.asked).toHaveLength(0);

      await until(PERIOD_END * 1000 + 1000);
      await waitFor(() => expect(service.asked).toHaveLength(1));
      expect(service.asked[0].searchParams.get("amount")).toBe("8334000");
      // The sale's address, with the hour's invoice.
      await waitFor(() =>
        expect(qrValue()).toMatch(
          new RegExp(`^bitcoin:${FIRST}\\?amount=0\\.00008334&lightning=lnbc`)
        )
      );
      expect(networks()).toBe("Lightning or Bitcoin");

      service.settled.add(lastPaymentHash(service));
      expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
    });

    it("never shows an invoice dated in another period: asked again at the service's time", async () => {
      const service = lnurlService();
      await fillPool();
      // This device's clock is 30 s ahead of the service's: 14:05:20 here, 14:04:50 there, still
      // in the period of 13:00's point.
      service.age = 30;
      await openPos(PERIOD_END * 1000 + 20_000);
      await type("5", "0", "0");
      await fireEvent.press(screen.getByTestId("charge"));

      // Asked at 14:00's point, dated in 13:00's period: neither declared nor shown.
      await waitFor(() => expect(clockOffsetSeconds()).toBeLessThanOrEqual(-29));
      expect(clockOffsetSeconds()).toBeGreaterThanOrEqual(-30);
      expect(service.asked).toHaveLength(1);
      expect(service.asked[0].searchParams.get("amount")).toBe("12500000");
      expect(screen.queryByTestId("qr-value")).toBeNull();
      expect(declarations()).toHaveLength(0);

      // 8 s left in 13:00's period by the service's clock: too short for an invoice. At 14:05
      // there (14:05:30 here), 14:00's point: shown.
      await until(PERIOD_END * 1000 + 31_000);
      await waitFor(() => expect(service.asked).toHaveLength(2));
      expect(service.asked[1].searchParams.get("amount")).toBe("12500000");
      await waitFor(() =>
        expect(qrValue()).toMatch(
          new RegExp(`^bitcoin:${FIRST}\\?amount=0\\.000125&lightning=lnbc`)
        )
      );
      // Only the second one is declared.
      const declared = new Set(declarations().map((call) => dTag(call.event)));
      expect(declared).toEqual(
        new Set([registryAddress(REGISTRY_KEY, preimagePair(2).paymentHash)])
      );
    });

    it("asks a shorter invoice when the service's clock is ahead, ending at 14:05 exactly", async () => {
      const service = lnurlService();
      await fillPool();
      // This device's clock is 20 s behind the service's: 14:04:00 here, 14:04:20 there. Asked
      // until 14:05 here (60 s), the first invoice ends at 14:05:20: past its point's period.
      service.age = -20;
      await openPos(LATE);
      await type("5", "0", "0");
      await fireEvent.press(screen.getByTestId("charge"));

      // Asked again at once, the clock corrected: until 14:05:00 by the service's clock.
      await waitFor(() => expect(service.asked).toHaveLength(2));
      expect(service.asked[0].searchParams.get("expiry")).toBe("60");
      expect(service.asked[1].searchParams.get("expiry")).toBe("40");
      expect(service.asked[1].searchParams.get("amount")).toBe("10000000");
      await waitFor(() =>
        expect(qrValue()).toMatch(new RegExp(`^bitcoin:${FIRST}\\?amount=0\\.0001&lightning=lnbc`))
      );
      const declared = new Set(declarations().map((call) => dTag(call.event)));
      expect(declared).toEqual(
        new Set([registryAddress(REGISTRY_KEY, preimagePair(2).paymentHash)])
      );
    });

    // The service's clock a fraction of a second ahead, then behind: the first invoice, asked at
    // 14:04:00.5 here, is dated 14:04:01 (or 14:03:59) there and would end a second late (early).
    it.each([0.6, -0.6])(
      "asks again until the invoice ends exactly at 14:05:00 (service %p s ahead)",
      async (skew) => {
        const service = lnurlService();
        await fillPool();
        service.skew = skew;
        await openPos(LATE);
        await type("5", "0", "0");
        await fireEvent.press(screen.getByTestId("charge"));

        await waitFor(() => expect(service.asked).toHaveLength(2));
        await waitFor(() => expect(screen.getByTestId("qr-value")).toBeTruthy());
        const shown = decodeBolt11(qrValue().replace(/^.*lightning=/, ""))!;
        expect(shown.timestamp + shown.expirySeconds).toBe(PERIOD_END);
        expect(service.asked).toHaveLength(2);
      }
    );

    it("still sees the invoice of the past hour paid in its last seconds", async () => {
      const service = lnurlService();
      await fillPool();
      await openPos(LATE);
      await chargeFive();
      const first = lastPaymentHash(service);

      await until(PERIOD_END * 1000 + 5000);
      await waitFor(() => expect(service.asked).toHaveLength(2));
      // Paid at 14:04:59, seen during its grace period: 10 000 sats, at the point of 13:00.
      service.settled.add(first);
      expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
      expect(screen.getByText(/^Lightning · /)).toBeTruthy();
    });

    it("prices an on-chain payment at the hour BlockCypher received it", async () => {
      lnurlService();
      await fillPool();
      await openPos(LATE);
      await chargeFive();

      // Sent at 14:04, at the point of 13:00: enough, even once the point of 14:00 asks more.
      await act(async () => {
        mempool.pay(FIRST, SATS);
      });
      expect(await screen.findByText("Confirming")).toBeTruthy();
      await until(PERIOD_END * 1000 + 120_000);
      expect(screen.getByText("Confirming")).toBeTruthy();
      expect(screen.queryByText("Left to pay")).toBeNull();
    });

    it("keeps the hour of a payment a fee bump replaces (RBF)", async () => {
      lnurlService();
      await fillPool();
      await openPos(LATE);
      await chargeFive();

      // Sent at 14:04, at the point of 13:00; bumped at 14:07, when the point of 14:00 asks more.
      let txid = "";
      await act(async () => {
        txid = mempool.pay(FIRST, SATS);
      });
      expect(await screen.findByText("Confirming")).toBeTruthy();
      await until(PERIOD_END * 1000 + 120_000);
      await act(async () => void mempool.replace(txid, { more: [mempool.freshCoin()] }));
      await act(async () => jest.advanceTimersByTimeAsync(60_000));
      expect(screen.getByText("Confirming")).toBeTruthy();
      expect(screen.queryByText("Left to pay")).toBeNull();
    });

    it("counts a replacement paying more than the payment it replaces at its own hour", async () => {
      lnurlService();
      await fillPool();
      await openPos(LATE);
      await chargeFive();

      // 9 000 sats at 14:04, replaced at 14:07 by 11 000: what it adds came at 14:07, when the
      // point of 14:00 asks 12 500. 1 500 sats short.
      let txid = "";
      await act(async () => {
        txid = mempool.pay(FIRST, 9_000n);
      });
      expect(await screen.findByText("Left to pay")).toBeTruthy();
      await until(PERIOD_END * 1000 + 120_000);
      await act(async () => void mempool.replace(txid, { sats: 11_000n }));
      await act(async () => jest.advanceTimersByTimeAsync(60_000));
      expect(await screen.findByText("Left to pay", undefined, WAIT)).toBeTruthy();
      expect(screen.getAllByLabelText("1'500 sats").length).toBeGreaterThan(0);
    });

    it("asks the rest of a payment received after the hour, at that hour's point", async () => {
      const service = lnurlService();
      await fillPool();
      await openPos(LATE);
      await chargeFive();
      await until(PERIOD_END * 1000 + 1000);
      await waitFor(() => expect(service.asked).toHaveLength(2));

      // The amount of 13:00's code, sent at 14:05: 2 500 sats short at the point of 14:00.
      await act(async () => {
        mempool.pay(FIRST, SATS);
      });
      expect(await screen.findByText("Left to pay", undefined, WAIT)).toBeTruthy();
      expect(screen.getAllByLabelText("2'500 sats").length).toBeGreaterThan(0);
      await waitFor(() => expect(service.asked).toHaveLength(3));
      expect(service.asked[2].searchParams.get("amount")).toBe("2500000");
    });

    it("counts the lowest amount due since the payment, at hours this screen did not see", async () => {
      // 9 700 sats at 14:04, 10 000 due at the point of 13:00: underpaid. At 14:05, within the sale
      // (until 14:14), 5.00 CHF is 9 616 sats at the point of 14:00: covered then. At 15:00 it is
      // 10 417 again.
      mockPoints.set(HOUR_END, 52000);
      mockPoints.set(HOUR_END + 3600, 48000);
      lnurlService();
      await fillPool();
      await openPos(LATE);
      await chargeFive();
      await act(async () => {
        mempool.pay(FIRST, 9_700n);
      });
      expect(await screen.findByText("Left to pay")).toBeTruthy();

      // 15:10, the hours between not seen (the clock moved, no timer ran).
      await act(async () => jest.setSystemTime(Date.UTC(2026, 9, 3, 15, 10)));
      await act(async () => jest.advanceTimersByTime(1000));
      expect(await screen.findByText("Confirming", undefined, WAIT)).toBeTruthy();
    });

    it("asks BlockCypher again within seconds when it does not know the transaction yet", async () => {
      lnurlService();
      await fillPool();
      mempool.chain.receivedUnknown = true;
      // Near a change of point: BlockCypher tells when it was sent (broadcast-time.ts).
      await openPos(LATE);
      await chargeFive();
      await act(async () => {
        mempool.pay(FIRST, SATS);
      });
      expect(await screen.findByText("Checking the Bitcoin payment…")).toBeTruthy();
      // Before the sale's end: its code stays, blurred after the delay, and its countdown goes on.
      await act(async () => jest.advanceTimersByTimeAsync(VEIL_DELAY_MS));
      expect(qrValue({ includeHiddenElements: true })).toMatch(new RegExp(`^bitcoin:${FIRST}`));
      expect(screen.getByTestId("qr-blurred", { includeHiddenElements: true })).toBeTruthy();
      expect(screen.queryByText("00:00")).toBeNull();

      mempool.chain.receivedUnknown = false;
      // 5 s later, not a minute.
      await act(async () => jest.advanceTimersByTimeAsync(5000));
      expect(screen.getByText("Confirming")).toBeTruthy();
      // Then less and less often, up to every 10 minutes.
      expect([0, 1, 2, 3, 6, 7, 20].map(receivedRetryMs)).toEqual([
        5000, 10_000, 20_000, 40_000, 320_000, 600_000, 600_000
      ]);
    });

    it("never prices a payment before BlockCypher tells when it was received", async () => {
      lnurlService();
      await fillPool();
      mempool.chain.receivedUnknown = true;
      await openPos(LATE);
      await chargeFive();

      await act(async () => {
        mempool.pay(FIRST, SATS);
      });
      expect(await screen.findByText("Checking the Bitcoin payment…")).toBeTruthy();
      expect(screen.queryByText("Confirming")).toBeNull();

      // Read again a minute later.
      mempool.chain.receivedUnknown = false;
      await until(Date.now() + 60_000);
      expect(await screen.findByText("Confirming", undefined, WAIT)).toBeTruthy();
    });

    it("asks the rest at each hour's point, what was received counted in sats", async () => {
      const service = lnurlService();
      await fillPool();
      await openPos(LATE);
      await chargeFive();
      await act(async () => {
        mempool.pay(FIRST, 4_000n);
      });
      await waitFor(() => expect(service.asked).toHaveLength(2));
      expect(service.asked[1].searchParams.get("amount")).toBe("6000000");

      // 14:05: 5.00 CHF is 12 500 sats at the point of 14:00, 8 500 of them still due, until the
      // sale's end (14:14).
      await until(PERIOD_END * 1000 + 1000);
      await waitFor(() => expect(service.asked).toHaveLength(3));
      expect(service.asked[2].searchParams.get("amount")).toBe("8500000");
      const expiry = Number(service.asked[2].searchParams.get("expiry"));
      expect(expiry).toBeLessThanOrEqual(540);
      expect(expiry).toBeGreaterThan(530);
      await waitFor(() =>
        expect(qrValue()).toMatch(
          new RegExp(`^bitcoin:${FIRST}\\?amount=0\\.000085&lightning=lnbc`)
        )
      );
      expect(screen.getAllByLabelText("8'500 sats").length).toBeGreaterThan(0);

      // Paid on-chain at 14:05: 4 000 + 8 500 sats cover the point of 14:00.
      await act(async () => {
        mempool.pay(FIRST, 8_500n);
      });
      expect(await screen.findByText("Confirming", undefined, WAIT)).toBeTruthy();
    });

    it("still counts the rest of the past hour paid in its last seconds", async () => {
      const service = lnurlService();
      await fillPool();
      await openPos(LATE);
      await chargeFive();
      await act(async () => {
        mempool.pay(FIRST, 4_000n);
      });
      await waitFor(() => expect(service.asked).toHaveLength(2));
      const rest = lastPaymentHash(service);

      await until(PERIOD_END * 1000 + 5000);
      await waitFor(() => expect(service.asked).toHaveLength(3));
      // Paid in its last seconds: 4 000 + 6 000 sats cover the point of 13:00.
      service.settled.add(rest);
      expect(await screen.findByText("Confirming", undefined, WAIT)).toBeTruthy();
      await act(async () => mempool.mine(3));
      expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();
      expect(screen.getByText(/^Bitcoin \+ Lightning · /)).toBeTruthy();
    });
  });
});

describe("point of sale, an on-chain sale's verdict", () => {
  // 2.00 CHF at 69 400 CHF/BTC: 2 882 sats.
  const DUE = 2_882n;
  const FIRST = taprootAddress(1);
  // The test team of team.test.ts, and this device among the owner's devices.
  const TEAM = deriveTeamKeys(
    encodeWalletSecret({
      mnemonic:
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
    })
  );
  const DEVICE = "ab".repeat(16);

  beforeEach(async () => {
    mockPoints.clear();
    for (const hour of [HOUR_END - 7200, HOUR_END - 3600, HOUR_END, HOUR_END + 3600]) {
      mockPoints.set(hour, 69_400);
    }
    closeAccount();
    resetPayRequests();
    // The addresses a shared sale kept are this session's (onchain-pool.ts).
    resetLinkedAddresses();
    relays.resetRelays();
    mockLinkOrigin.mockReturnValue("https://web.example");
    mockDesktop.mockReturnValue(false);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    await saveOnchainPool({
      version: 1,
      walletId: WALLET,
      addresses: [taprootAddress(1), taprootAddress(2), taprootAddress(3)]
    });
    // One of the owner's devices: it signs its sales' records (member.ts, recordSigner).
    await saveOwnerDeviceRecord({
      version: 1,
      account: WALLET.toLowerCase(),
      id: DEVICE,
      secret: bytesToHex(ownerDeviceSecret(TEAM, DEVICE)),
      shared: bytesToHex(ownerDevicesSecret(TEAM))
    });
    resetOwnerDeviceCache();
  });

  afterEach(() => resetOwnerDeviceCache());

  /** The owner's device of the team, with the team's own registry (its declarations' keys). */
  async function openTeamPos() {
    await saveBusinessRegistry(WALLET, deriveBusinessRegistry(TEAM));
    return openPos(START, { registry: false });
  }

  /**
   * "Wallet" past the month its records are read: the registry's declarations of the
   * deposits' transactions alone (onchain-sales.ts), the wallet holding `payments`.
   */
  async function registryRows(payments: WalletPayment[], seats: Seats = NO_SEATS) {
    const now = Math.floor(Date.now() / 1000);
    const found = await readOnchainSales(
      TEAM,
      payments.map(({ txId, timestamp }) => ({ txid: txId!, at: timestamp })),
      { seats, relays: PAYMENT_LINK_RELAYS }
    );
    expect(found.retry).toEqual([]);
    const members = new Map(
      seats.employees.map(({ id, name }) => [id, { kind: "member" as const, id, name }])
    );
    return ownerActivity({
      payments,
      declarations: new Map(),
      onchainSales: found.sales,
      links: [],
      sales: [],
      members,
      now
    });
  }

  async function chargeTwo() {
    await type("2", "0", "0");
    await fireEvent.press(screen.getByTestId("charge"));
    expect(await screen.findByText("Waiting for the payment")).toBeTruthy();
  }

  /** A deposit the wallet claimed: `sats` of transaction `txid`. */
  const deposit = (txid: string, sats: bigint): WalletPayment => ({
    id: `deposit-${txid}`,
    direction: "receive",
    status: "completed",
    amountSats: sats,
    feeSats: 0n,
    timestamp: Math.floor(Date.now() / 1000),
    network: "bitcoin",
    txId: txid
  });

  /** "Wallet"'s rows, from what this device published, the wallet holding `payments`. */
  async function walletRows(payments: WalletPayment[]) {
    const now = Math.floor(Date.now() / 1000);
    const records = await readOwnerRecords(TEAM, [], now, null, [{ id: DEVICE, addedAt: 0 }]);
    return ownerActivity({
      payments,
      declarations: new Map(),
      links: records.links,
      sales: records.sales,
      now
    });
  }

  it('is paid with both its deposits once 3 blocks deep, though left "Confirming"', async () => {
    lnurlService();
    const { router } = await openTeamPos();
    await chargeTwo();

    let first = "";
    await act(async () => {
      first = mempool.pay(FIRST, 1_500n);
    });
    expect(await screen.findByText("Left to pay")).toBeTruthy();
    expect(screen.getAllByLabelText("1'382 sats").length).toBeGreaterThan(0);
    let second = "";
    await act(async () => {
      second = mempool.pay(FIRST, 1_382n);
    });
    expect(await screen.findByText("Confirming", undefined, WAIT)).toBeTruthy();

    // "Back to the Point of Sale": nothing shows the sale any more.
    await fireEvent.press(screen.getByTestId("back-to-pos"));
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    await act(async () => mempool.mine(3));
    await act(async () => jest.advanceTimersByTimeAsync(SALES_FOLLOW_INTERVAL_MS));

    // Followed out of sight, then recorded paid on a majority of the relays.
    const keys = deriveMemberKeys(ownerDeviceSecret(TEAM, DEVICE));
    await eventually(async () => {
      const sales = await fetchSales(keys, 0, PAYMENT_LINK_RELAYS);
      expect(sales?.filter((sale) => sale.paidAt !== null)).toHaveLength(1);
    });

    const payments = [deposit(second, 1_382n), deposit(first, 1_500n)];
    await eventually(async () => {
      const rows = await walletRows(payments);
      expect(rows).toEqual([
        expect.objectContaining({
          source: "pos",
          state: null,
          rest: null,
          fiat: { minor: 200, digits: 2, currency: "CHF" },
          sats: DUE,
          by: { kind: "you" },
          payments
        })
      ]);
    });
    // Past the month its records are read, its declarations in the registry tie its deposits.
    expect(await registryRows(payments)).toEqual([
      expect.objectContaining({
        source: "pos",
        state: null,
        sats: DUE,
        fiat: { minor: 200, digits: 2, currency: "CHF" },
        by: { kind: "you" },
        payments
      })
    ]);
  });

  /**
   * Until `check` holds, the clock going on a second at a time (at most a minute): what the relays
   * and the device's storage hold is read outside of React's act().
   */
  async function eventually(check: () => Promise<void>) {
    for (let second = 0; ; second += 1) {
      try {
        return await check();
      } catch (error) {
        if (second >= 60) throw error;
      }
      await act(async () => jest.advanceTimersByTimeAsync(1000));
    }
  }

  /** The records this device published, as "Wallet" reads them. */
  const deviceSales = () =>
    fetchSales(deriveMemberKeys(ownerDeviceSecret(TEAM, DEVICE)), 0, PAYMENT_LINK_RELAYS);

  it('records a sale that showed its address alone, open then paid, for "Wallet"', async () => {
    // 1 000 sats at most over Lightning: the address alone.
    const service = lnurlService();
    service.maxSendable = 1_000_000;
    const { router } = await openTeamPos();
    await chargeTwo();
    expect(String(screen.getByTestId("qr-value").props.children)).toBe(
      `bitcoin:${FIRST}?amount=0.00002882`
    );
    expect(service.asked).toHaveLength(0);

    // Recorded as soon as it shows, as an invoice is: the owner sees it open.
    await eventually(async () => {
      expect(await deviceSales()).toEqual([
        expect.objectContaining({
          paymentHash: null,
          verifyUrl: null,
          sats: "2882",
          paidAt: null,
          onchainAddress: FIRST
        })
      ]);
    });
    expect(await walletRows([])).toEqual([
      expect.objectContaining({ source: "pos", state: "open", by: { kind: "you" } })
    ]);

    let txid = "";
    await act(async () => {
      txid = mempool.pay(FIRST, DUE);
    });
    expect(await screen.findByText("Confirming", undefined, WAIT)).toBeTruthy();
    // Its screen gone: followed out of sight, then recorded paid on a majority of the relays.
    await fireEvent.press(screen.getByTestId("back-to-pos"));
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    await act(async () => mempool.mine(3));
    await act(async () => jest.advanceTimersByTimeAsync(SALES_FOLLOW_INTERVAL_MS));
    await eventually(async () => {
      expect(await deviceSales()).toEqual([
        expect.objectContaining({ paymentHash: null, paidAt: expect.any(Number) })
      ]);
    });
    expect(await loadFollowedSales()).toEqual([]);

    const payments = [deposit(txid, DUE)];
    const paid = expect.objectContaining({
      source: "pos",
      state: null,
      rest: null,
      fiat: { minor: 200, digits: 2, currency: "CHF" },
      by: { kind: "you" },
      payments
    });
    await eventually(async () => {
      expect(await walletRows(payments)).toEqual([paid]);
    });
    // Past the month its records are read, its declaration in the registry ties its deposit.
    expect(await registryRows(payments)).toEqual([paid]);
  });

  it('records an exact payment left "Confirming" paid once 3 blocks deep', async () => {
    lnurlService();
    const { router } = await openTeamPos();
    await chargeTwo();
    let txid = "";
    await act(async () => {
      txid = mempool.pay(FIRST, DUE);
    });
    expect(await screen.findByText("Confirming", undefined, WAIT)).toBeTruthy();
    // Kept on the device until its verdict is recorded.
    await eventually(async () => expect(await loadFollowedSales()).toHaveLength(1));
    await fireEvent.press(screen.getByTestId("back-to-pos"));
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));

    // Followed out of sight: not paid before 3 blocks.
    await act(async () => mempool.mine(2));
    await act(async () => jest.advanceTimersByTimeAsync(SALES_FOLLOW_INTERVAL_MS));
    expect((await deviceSales())?.some((sale) => sale.paidAt !== null)).toBe(false);
    await act(async () => mempool.mine(1));
    await act(async () => jest.advanceTimersByTimeAsync(SALES_FOLLOW_INTERVAL_MS));
    await eventually(async () => {
      expect((await deviceSales())?.filter((sale) => sale.paidAt !== null)).toHaveLength(1);
    });
    // Nothing more to follow.
    await eventually(async () => expect(await loadFollowedSales()).toEqual([]));
    // Its transaction recorded seen and declared once, by its screen: its follower's two looks
    // never published them again.
    const declaredAt = onchainPaymentAddress(deriveBusinessRegistry(TEAM).key, txid);
    const declarations = relays.calls.filter(
      ({ operation, event }) => operation === "publish" && dTag(event) === declaredAt
    );
    expect(declarations).toHaveLength(PAYMENT_LINK_RELAYS.length);

    const payments = [deposit(txid, DUE)];
    expect(await walletRows(payments)).toEqual([
      expect.objectContaining({ source: "pos", state: null, sats: DUE, payments })
    ]);
  });

  it("keeps the sale while no majority of the relays takes its verdict, never shown unproven", async () => {
    lnurlService();
    const { router } = await openTeamPos();
    await chargeTwo();
    let first = "";
    let second = "";
    await act(async () => {
      first = mempool.pay(FIRST, 1_500n);
    });
    expect(await screen.findByText("Left to pay")).toBeTruthy();
    await act(async () => {
      second = mempool.pay(FIRST, 1_382n);
    });
    expect(await screen.findByText("Confirming", undefined, WAIT)).toBeTruthy();
    const payments = [deposit(second, 1_382n), deposit(first, 1_500n)];
    // Both transactions recorded seen (team-sale-tx) before the relays refuse anything.
    await eventually(async () => {
      const rows = await walletRows(payments);
      expect(rows.map((row) => row.state)).toEqual(["unconfirmed"]);
    });
    await fireEvent.press(screen.getByTestId("back-to-pos"));
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));

    // Every relay refuses the verdict: the sale stays kept, "Wallet" says it is being
    // confirmed, never "Underpaid" nor paid on a guess.
    const [before] = await loadFollowedSales();
    for (const relay of PAYMENT_LINK_RELAYS) relays.readOnly.add(relay);
    await act(async () => mempool.mine(3));
    await act(async () => jest.advanceTimersByTimeAsync(SALES_FOLLOW_INTERVAL_MS));
    // Its verdict tried (its record's date moved on), refused: kept.
    await eventually(async () => {
      const kept = await loadFollowedSales();
      expect(kept).toHaveLength(1);
      expect(kept[0]!.recordedAt).toBeGreaterThan(before!.recordedAt);
    });
    const waiting = await walletRows(payments);
    expect(waiting).toEqual([
      expect.objectContaining({ source: "pos", state: "unconfirmed", rest: null, payments })
    ]);

    // They take it again: recorded at the next attempt, then forgotten.
    relays.readOnly.clear();
    await act(async () => jest.advanceTimersByTimeAsync(SALES_FOLLOW_INTERVAL_MS));
    await eventually(async () => expect(await loadFollowedSales()).toEqual([]));
    for (const relay of PAYMENT_LINK_RELAYS) {
      const sales = await fetchSales(deriveMemberKeys(ownerDeviceSecret(TEAM, DEVICE)), 0, [relay]);
      expect(sales?.some((sale) => sale.paidAt !== null)).toBe(true);
    }
    expect(await walletRows(payments)).toEqual([
      expect.objectContaining({ source: "pos", state: null, sats: DUE, payments })
    ]);
  });

  it("forgets a sale with an address that expired unpaid", async () => {
    lnurlService();
    await openTeamPos();
    await chargeTwo();
    await eventually(async () => expect(await loadFollowedSales()).toHaveLength(1));
    await act(async () => jest.setSystemTime(START + 600_000));
    await pastGrace();
    expect(await screen.findByText("Expired", undefined, WAIT)).toBeTruthy();
    await eventually(async () => expect(await loadFollowedSales()).toEqual([]));
  });

  it("records an employee's sale paid for the owner's Wallet and its My activity", async () => {
    lnurlService();
    const MEMBER = "0a".repeat(16);
    const secret = memberSecret(TEAM, MEMBER);
    const keys = deriveMemberKeys(secret);
    await saveMembership({
      version: 1,
      team: TEAM.publicKey,
      secret: bytesToHex(secret),
      name: "Alice",
      deviceId: "0b".repeat(16),
      joinedAt: START / 1000
    });
    await saveTerminalProfile({
      version: 3,
      team: TEAM.publicKey,
      memberName: "Alice",
      lightningAddress: ADDRESS,
      businessName: "Fine Bakery",
      currency: "CHF"
    });
    await saveBusinessRegistry(TEAM.publicKey, deriveBusinessRegistry(TEAM));
    await applyLot(TEAM.publicKey, {
      version: 1,
      addresses: [taprootAddress(11), taprootAddress(12)],
      tags: ["0".repeat(16), "1".repeat(16)],
      updatedAt: START / 1000
    });
    setClock(START);
    const router = await renderRouter(routes, { initialUrl: "/" });
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    await chargeTwo();
    const address = taprootAddress(11);
    let first = "";
    let second = "";
    await act(async () => {
      first = mempool.pay(address, 1_500n);
    });
    expect(await screen.findByText("Left to pay")).toBeTruthy();
    await act(async () => {
      second = mempool.pay(address, 1_382n);
    });
    expect(await screen.findByText("Confirming", undefined, WAIT)).toBeTruthy();
    await fireEvent.press(screen.getByTestId("back-to-pos"));
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    await act(async () => mempool.mine(3));
    await act(async () => jest.advanceTimersByTimeAsync(SALES_FOLLOW_INTERVAL_MS));
    await eventually(async () => {
      expect((await fetchSales(keys, 0))?.filter((sale) => sale.paidAt !== null)).toHaveLength(1);
    });

    // The owner's "Wallet": Alice's sale, paid, with both its deposits.
    const now = Math.floor(Date.now() / 1000);
    const alice = { id: MEMBER, name: "Alice", role: "employee" as const, invitedAt: 0 };
    const records = await readOwnerRecords(TEAM, [alice], now);
    const payments = [deposit(second, 1_382n), deposit(first, 1_500n)];
    expect(
      ownerActivity({
        payments,
        declarations: new Map(),
        links: records.links,
        sales: records.sales,
        now
      })
    ).toEqual([
      expect.objectContaining({
        source: "pos",
        state: null,
        sats: DUE,
        fiat: { minor: 200, digits: 2, currency: "CHF" },
        by: expect.objectContaining({ kind: "member", id: MEMBER, name: "Alice" }),
        payments
      })
    ]);
    // Removed from the team since: its records are no longer read, nothing of them ties the
    // deposits to a sale any more (they show as the wallet has them).
    const removed = await readOwnerRecords(TEAM, [], now);
    expect(
      ownerActivity({
        payments,
        declarations: new Map(),
        links: removed.links,
        sales: removed.sales,
        now
      }).map((row) => [row.source, row.fiat])
    ).toEqual([
      ["receive", null],
      ["receive", null]
    ]);
    // Past the month its records are read: its declarations, marked as Alice's.
    expect(await registryRows(payments, { ...NO_SEATS, employees: [alice] })).toEqual([
      expect.objectContaining({
        source: "pos",
        state: null,
        sats: DUE,
        by: { kind: "member", id: MEMBER, name: "Alice" },
        payments
      })
    ]);
    // Its "My activity": paid, never "Underpaid"; its sats are the owner's wallet's to tell.
    const own = await loadMemberActivity(now);
    const mine = memberActivity({ sales: own?.sales ?? [], links: own?.links ?? [], now });
    expect(mine.map((item) => [item.source, item.state, item.sats])).toEqual([["pos", null, null]]);
  });

  it("records the sale paid when its screen sees it paid after an underpayment", async () => {
    lnurlService();
    await openTeamPos();
    await chargeTwo();
    await act(async () => {
      mempool.pay(FIRST, 1_500n);
    });
    expect(await screen.findByText("Left to pay")).toBeTruthy();
    // The rest's invoice shown (its own record), then the rest paid on-chain.
    await waitFor(() =>
      expect(screen.getByTestId("qr-value").props.children).toMatch(/lightning=/)
    );
    await act(async () => {
      mempool.pay(FIRST, 1_382n);
    });
    expect(await screen.findByText("Confirming", undefined, WAIT)).toBeTruthy();
    await act(async () => mempool.mine(3));
    expect(await screen.findByText("Paid", undefined, WAIT)).toBeTruthy();

    const keys = deriveMemberKeys(ownerDeviceSecret(TEAM, DEVICE));
    await eventually(async () => {
      const sales = await fetchSales(keys, 0, PAYMENT_LINK_RELAYS);
      expect(sales?.some((sale) => sale.paidAt !== null)).toBe(true);
    });
  });
});
