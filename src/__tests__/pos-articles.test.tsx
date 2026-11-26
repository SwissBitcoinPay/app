import "@/i18n";

import { bytesToHex } from "@noble/hashes/utils.js";
import { act, fireEvent, renderRouter, screen, waitFor, within } from "expo-router/testing-library";
import { AppState, Pressable, Text, TextInput, type AppStateStatus } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AppLayout from "@/app/(app)/_layout";
import BasketScreen from "@/app/(app)/pos/basket";
import AmountScreen from "@/app/(app)/pos/index";
import PosLayout from "@/app/(app)/pos/_layout";
import LaunchScreen from "@/app/index";
import { DEFAULT_RELAYS } from "@/config/relays";
import * as teamConfig from "@/config/team";
import {
  closeAccount,
  getAccountBackupKey,
  getAccountTeamKeys,
  getAccountWalletId,
  updateAccount
} from "@/features/account/session";
import {
  joinTeam,
  previewInvite,
  resetMembershipCache,
  syncMembership
} from "@/features/team/member";
import { inviteEmployee } from "@/features/team/owner";
import { resetOwnerDeviceCache } from "@/features/team/owner-device";
import { saveCatalogKeys } from "@/features/terminal/catalog-key";
import { posViewsOf, usePos } from "@/features/terminal/pos";
import { SCAN_REPEAT_GAP_MS } from "@/features/terminal/ScanPad";
import { POS_MODE_STORE_KEY, parseStoredPosMode } from "@/features/terminal/pos-mode-format";
import { resetTerminalProfileCache } from "@/features/terminal/profile-cache";
import {
  articleEvent,
  fetchArticles,
  newArticleId,
  publishArticle,
  type Article
} from "@/lib/catalog/article";
import { PasskeyError } from "@/lib/breez/errors";
import { signInWithPasskey } from "@/lib/breez/passkey";
import { channelCatalogOf } from "@/lib/catalog/reader";
import { inviteLinkOf } from "@/lib/team/invite";
import {
  deriveCatalogKeys,
  deriveCatalogReader,
  deriveCatalogWriter,
  deriveTeamKeys,
  ownerDevicesSecret,
  type TeamKeys
} from "@/lib/team/keys";
import { saveOwnerDeviceRecord } from "@/lib/team/owner-device-store";
import { encodeWalletSecret } from "@/lib/breez/secret";
import { loadCatalogRecord, saveTerminalProfile } from "@/lib/terminal/profile";
import { space } from "@/theme";

import { TEST_WALLET_ID, openTestAccount, testSeed } from "../../jest/account";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as AudioFake from "../../jest/expo-audio";
import type * as CameraFake from "../../jest/expo-camera";
import type * as SecureStoreFake from "../../jest/expo-secure-store";
import { bottomInsetOf } from "../../jest/layout";
import type * as RelaysFake from "../../jest/nostr-relays";

jest.mock("../lib/nostr/local-network", () => ({
  askLocalNetworkAccess: jest.fn(async () => null)
}));
jest.mock("../lib/breez/passkey", () => ({
  createPasskeyWallet: jest.fn(),
  preparePasskeys: jest.fn(async () => undefined),
  passkeysReady: jest.fn(() => true),
  signInWithPasskey: jest.fn()
}));
jest.mock("../lib/breez/wallet", () => ({
  checkWalletConfig: jest.fn(),
  connectWallet: jest.fn(),
  disconnectWallet: jest.fn(async () => undefined),
  getWalletId: jest.fn(),
  getWalletLightningAddress: jest.fn(),
  newDepositAddress: jest.fn(),
  isWalletConnected: () => false,
  getWalletConnectionId: () => null,
  subscribeWallet: () => () => undefined
}));
/** An article's count on its tile: hidden from screen readers (the tile's hint says it), so asked with them. */
function countOf(article: Article) {
  return screen.queryByTestId(`article-${article.id}-quantity`, { includeHiddenElements: true });
}

// One hour's points: 47,500 CHF and 50,000 EUR per bitcoin (1 EUR = 0.95 CHF); no USD rate.

const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");
const mockRates: Record<string, number> = { CHF: 47500, EUR: 50000 };
jest.mock("../features/terminal/useRate", () => ({
  useRate: (currency: string | null) => {
    const rate = currency === null ? undefined : mockRates[currency];
    return {
      rate,
      hour:
        rate === undefined
          ? undefined
          : jest
              .requireActual<typeof import("../lib/rates/sources")>("../lib/rates/sources")
              .pointHourOf(Math.floor(Date.now() / 1000)),
      loading: false,
      current: () => rate
    };
  }
}));
jest.mock("../lib/breez/config", () => ({
  ...jest.requireActual("../lib/breez/config"),
  getBreezNetwork: () => "mainnet"
}));
// The web app's camera module (camera-available.web.ts) while `mockWeb.on`: the scan where the
// browser lists a camera (`camera.device.listed`).
const mockWeb = { on: false };
jest.mock("@/features/catalog/camera-available", () => {
  const native = jest.requireActual<Record<string, unknown>>("@/features/catalog/camera-available");
  const web = jest.requireActual<Record<string, unknown>>(
    "@/features/catalog/camera-available.web"
  );
  return new Proxy({}, { get: (_, key: string) => (mockWeb.on ? web : native)[key] });
});
const mockDesktop = jest.fn(() => false);
jest.mock("@/components/layout/useIsDesktop", () => ({
  ...jest.requireActual("@/components/layout/useIsDesktop"),
  useIsDesktop: () => mockDesktop()
}));

const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const camera = jest.requireMock<typeof CameraFake>("expo-camera");
const audio = jest.requireMock<typeof AudioFake>("expo-audio");
const secureStore = jest.requireMock<typeof SecureStoreFake>("expo-secure-store");
const signIn = jest.mocked(signInWithPasskey);

/** The invoice screen, as the point of sale hands it its sale: its amount and sats. */
function ChargeProbe() {
  const { sale, setBasket } = usePos();
  return (
    <>
      <Text testID="charged">{sale ? `${sale.minor} ${sale.sats}` : "none"}</Text>
      {/* What the invoice screen does once its basket's sale is paid (charge.tsx). */}
      <Pressable testID="charge-paid" onPress={() => setBasket([])} />
    </>
  );
}

const routes = {
  index: LaunchScreen,
  "(app)/_layout": AppLayout,
  "(app)/pos/_layout": PosLayout,
  "(app)/pos/index": AmountScreen,
  "(app)/pos/basket": BasketScreen,
  "(app)/pos/charge": ChargeProbe
};

/** Another business: its catalogue, read with keys this device never holds. */
const otherTeam = deriveTeamKeys(encodeWalletSecret({ entropy: new Uint8Array(32).fill(0x11) }));

const WATER_CODE = "7610097111072";
const TEA_CODE = "7613035974685";

function makeArticle(
  name: string,
  minor: number,
  { currency = "CHF", barcode = null as string | null, createdAt = 1_790_000_000 } = {}
): Article {
  return {
    version: 1,
    id: newArticleId(),
    name,
    description: "",
    price: { minor, digits: 2, currency },
    image: null,
    barcode,
    createdAt,
    updatedAt: createdAt
  };
}

/** Articles on the relays, as the owner's "Items" published them. */
async function publishArticles(team: TeamKeys, articles: Article[], epoch = 0) {
  const keys = deriveCatalogWriter(team, epoch);
  for (const article of articles) {
    await publishArticle(articleEvent(keys, article), {
      relays: DEFAULT_RELAYS,
      channel: "account",
      timeoutMs: 1000,
      authKey: keys.nostr.secretKey
    });
  }
}

/** The owner's point of sale in till mode (its account closed), its profile saved. */
async function tillProfile(backupKey = "ab".repeat(32)) {
  await saveTerminalProfile({
    version: 2,
    walletId: TEST_WALLET_ID,
    backupKey,
    lightningAddress: "sattleme02c6047f94@breez.tips",
    businessName: "Fine Bakery",
    currency: "CHF"
  });
  resetTerminalProfileCache();
}

/** The owner's device in till mode, with the catalogue's keys its account left it. */
async function tillWithCatalog(team: TeamKeys, articles: Article[]) {
  await tillProfile();
  await saveCatalogKeys(TEST_WALLET_ID, channelCatalogOf(deriveCatalogReader(team, 0), 0));
  await publishArticles(team, articles);
}

async function open() {
  const router = await renderRouter(routes, { initialUrl: "/" });
  await waitFor(() => expect(router.getPathname()).toBe("/pos"));
  // Not the router itself: an async function would unwrap the promise it also is.
  return { router };
}

/**
 * An employee's device (Alice's), its owner's catalogue holding `articles`: nothing of the owner's
 * on it, only its channel's keys.
 */
async function employeeDevice(articles: Article[]) {
  jest.spyOn(teamConfig, "getInviteOrigin").mockReturnValue("https://pay.example");
  await openTestAccount({ usage: "merchant", signUp: "done", displayCurrency: "CHF" });
  await tillProfile(getAccountBackupKey()!);
  const ownTeam = getAccountTeamKeys()!;
  await publishArticles(ownTeam, articles);
  // Read before the account closes: its team keys are wiped then.
  const catalog = channelCatalogOf(deriveCatalogReader(ownTeam, 0), 0);
  const { url } = await inviteEmployee("Alice");
  closeAccount();
  secureStore.resetSecureStore();
  resetTerminalProfileCache();
  resetMembershipCache();
  await joinTeam(await previewInvite(inviteLinkOf(url)!));
  await expect(syncMembership()).resolves.toBe("active");
  return { catalog };
}

/** A team of its own for till mode tests: the test account's, without opening it. */
const team = deriveTeamKeys(encodeWalletSecret({ entropy: new Uint8Array(32).fill(0x22) }));

const water = makeArticle("Mineral water 50 cl", 350, {
  barcode: WATER_CODE,
  createdAt: 1_790_000_003
});
const tea = makeArticle("Iced tea", 450, { barcode: TEA_CODE, createdAt: 1_790_000_002 });
const croissant = makeArticle("Croissant", 260, { createdAt: 1_790_000_001 });

/** A product no article of the tests has. */
const OVO_CODE = "4006381333931";

/**
 * The owner's device, its account's catalogue holding `articles`, in till mode unless `unlocked`.
 * Gives what reads the catalogue as another of the owner's devices would (its keys derived before
 * the account closes, which wipes the team's).
 */
async function ownerDevice(articles: Article[], { unlocked = false } = {}) {
  await openTestAccount({ usage: "merchant", signUp: "done", displayCurrency: "CHF" });
  const ownTeam = getAccountTeamKeys()!;
  await tillProfile(getAccountBackupKey()!);
  await saveCatalogKeys(TEST_WALLET_ID, channelCatalogOf(deriveCatalogReader(ownTeam, 0), 0));
  await publishArticles(ownTeam, articles);
  const keys = deriveCatalogKeys(ownTeam);
  if (!unlocked) closeAccount();
  return async () =>
    (
      await fetchArticles(keys, {
        relays: DEFAULT_RELAYS,
        channel: "account",
        timeoutMs: 1000,
        authKey: keys.nostr.secretKey
      })
    ).articles;
}

/** Open Food Facts answers `answer` for every product; the other requests fail, as offline. */
function openFoodFacts(answer: () => Response): () => string[] {
  const spy = jest.spyOn(globalThis, "fetch");
  // fetch is a mock function already (jest.setup.ts): spyOn gives it with earlier tests' calls.
  spy.mockClear();
  spy.mockImplementation(async (url) => {
    if (String(url).includes("/api/v3/product/")) return answer();
    throw new Error("Network disabled in tests");
  });
  return () =>
    spy.mock.calls.map(([url]) => String(url)).filter((url) => url.includes("/api/v3/product/"));
}

/** Open Food Facts' answer (API v3) for a product of that name, without a photo. */
const productNamed = (name: string) => () =>
  ({
    status: 200,
    ok: true,
    json: async () => ({ status: "success", product: { product_name: name, lang: "fr" } })
  }) as Response;

const productUnknown = () => ({ status: 404, ok: false, json: async () => ({}) }) as Response;

/** TextInput's `focus`, its calls from this test only (as in articles-screen.test.tsx). */
function focusSpy(): jest.SpyInstance {
  const focus = jest.spyOn(TextInput.prototype, "focus");
  focus.mockClear();
  return focus;
}

/** The fields `focus` (a spy on TextInput's) was called on, by their testID, in order. */
function focusedFields(focus: jest.SpyInstance): unknown[] {
  return focus.mock.instances.map(
    (input) => (input as { props: { testID?: string } }).props.testID
  );
}

beforeEach(() => {
  closeAccount();
  relays.resetRelays();
  signIn.mockReset();
  mockDesktop.mockReturnValue(false);
  mockWeb.on = false;
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("point of sale's views", () => {
  const owner = { version: 2 } as const;
  const member = { version: 3 } as const;
  const cardHolder = { version: 4 } as const;
  const views = (profile: { version: number }, articles: number, canScan: boolean) =>
    posViewsOf(profile as Parameters<typeof posViewsOf>[0], articles, canScan);

  it("offers every view on the owner's device, articles or not; the scan where it has a camera", () => {
    expect(views(owner, 0, true)).toEqual(["amount", "articles", "scan"]);
    expect(views(owner, 3, true)).toEqual(["amount", "articles", "scan"]);
    expect(views(owner, 0, false)).toEqual(["amount", "articles"]);
  });

  it("offers the articles and the scan on an employee's device with an article only", () => {
    expect(views(member, 0, true)).toEqual(["amount"]);
    expect(views(member, 1, true)).toEqual(["amount", "articles", "scan"]);
    expect(views(member, 1, false)).toEqual(["amount", "articles"]);
  });

  it("offers the keypad alone to a card holder's device", () => {
    expect(views(cardHolder, 2, true)).toEqual(["amount"]);
  });
});

describe("point of sale's articles", () => {
  it('offers "Items" and "Scan" on the owner\'s device without any article', async () => {
    await tillWithCatalog(team, []);
    await open();
    await waitFor(() => expect(screen.getByTestId("pos-mode-scan")).toBeTruthy());
    expect(screen.getByTestId("pos-mode-amount")).toBeTruthy();
    expect(screen.getByTestId("pos-mode-articles")).toBeTruthy();
    // The selector in place of the business's name.
    expect(screen.queryByText("Fine Bakery")).toBeNull();

    // "Items": read without any article, it says where to add them.
    await fireEvent.press(screen.getByTestId("pos-mode-articles"));
    await waitFor(() => expect(screen.getByTestId("articles-empty-read")).toBeTruthy());
    expect(screen.getByText("No items yet")).toBeTruthy();
    expect(
      screen.getByText("Scan a product with “Scan” to create it, or add your items in “Items”.")
    ).toBeTruthy();
    // No "Tap an item to add it" without an article to touch.
    expect(screen.queryByText("Tap an item to add it")).toBeNull();
    expect(screen.getByTestId("charge").props.accessibilityState?.disabled).toBe(true);

    // "Scan": a code read is of no article, read and proven so.
    await fireEvent.press(screen.getByTestId("pos-mode-scan"));
    await act(async () => camera.scan(WATER_CODE));
    expect(screen.getByTestId("scan-unknown")).toBeTruthy();
  });

  it('never says "no items" while the owner\'s catalogue cannot be read', async () => {
    await tillWithCatalog(team, [water]);
    for (const relay of DEFAULT_RELAYS) relays.unreachable.add(relay);
    await open();
    await fireEvent.press(await screen.findByTestId("pos-mode-articles"));
    await waitFor(() => expect(screen.getByTestId("articles-empty-unreadable")).toBeTruthy());
    expect(screen.getByText("Items not read yet")).toBeTruthy();
    expect(screen.queryByText("No items yet")).toBeNull();

    // A code read then is not "unknown", nor offered as a new article: it may be one.
    await fireEvent.press(screen.getByTestId("pos-mode-scan"));
    await act(async () => camera.scan(WATER_CODE));
    expect(screen.getByTestId("scan-not-read")).toBeTruthy();
    expect(screen.queryByTestId("scan-unknown")).toBeNull();
    expect(screen.queryByTestId("article-sheet")).toBeNull();
    expect(screen.getByTestId("scan-charge").props.accessibilityState?.disabled).toBe(true);
  });

  it("lists another business's articles never: only the catalogue of the keys it holds", async () => {
    await tillProfile();
    await saveCatalogKeys(TEST_WALLET_ID, channelCatalogOf(deriveCatalogReader(team, 0), 0));
    await publishArticles(otherTeam, [water]);
    await open();
    await fireEvent.press(await screen.findByTestId("pos-mode-articles"));
    await waitFor(() => expect(screen.getByTestId("articles-empty-read")).toBeTruthy());
    expect(screen.queryByText(water.name)).toBeNull();
  });

  it('offers neither "Items" nor "Scan" on an employee\'s device without an article', async () => {
    await employeeDevice([]);
    await open();
    await act(async () => undefined);
    // The keypad, with the business's name over it.
    expect(screen.getByTestId("key-9")).toBeTruthy();
    expect(screen.queryByTestId("pos-mode-amount")).toBeNull();
    expect(screen.queryByTestId("pos-mode-articles")).toBeNull();
    expect(screen.queryByTestId("pos-mode-scan")).toBeNull();
  });

  it("lists the articles in till mode, adds them with a tap, and charges the basket", async () => {
    await tillWithCatalog(team, [water, tea, croissant]);
    await open();
    await waitFor(() => expect(screen.getByTestId("pos-mode-articles")).toBeTruthy());
    expect(screen.getByTestId("pos-mode-scan")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("pos-mode-articles"));
    // Remembered on this device.
    expect(parseStoredPosMode(secureStore.items.get(POS_MODE_STORE_KEY) ?? null)).toBe("articles");
    expect(screen.getByTestId("charge").props.accessibilityState?.disabled).toBe(true);

    await fireEvent.press(screen.getByTestId(`article-${water.id}`));
    await fireEvent.press(screen.getByTestId(`article-${water.id}`));
    await fireEvent.press(screen.getByTestId(`article-${croissant.id}`));
    expect(countOf(water)).toHaveTextContent("2", { exact: true });
    // 2 × 3.50 + 2.60 = 9.60 CHF: "Charge · 3 items".
    expect(screen.getByText("Charge · 3 items")).toBeTruthy();
    expect(screen.getAllByText("9.60 CHF").length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByTestId("charge"));
    // 9.60 CHF at 47,500 CHF per bitcoin: 20,210.5 sats, rounded up to 20,211.
    await waitFor(() => expect(screen.getByTestId("charged")).toHaveTextContent("960 20211"));
  });

  // A "−" beside an article's count, on its tile.
  it('takes one off with the "−" beside an article\'s count, the article leaving the basket at 0', async () => {
    await tillWithCatalog(team, [water, tea, croissant]);
    await open();
    await waitFor(() => expect(screen.getByTestId("pos-mode-articles")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("pos-mode-articles"));
    // No "−" for an article not in the basket.
    expect(screen.queryByTestId(`article-${water.id}-less`)).toBeNull();

    await fireEvent.press(screen.getByTestId(`article-${water.id}`));
    await fireEvent.press(screen.getByTestId(`article-${water.id}`));
    await fireEvent.press(screen.getByTestId(`article-${croissant.id}`));
    expect(screen.getByText("Charge · 3 items")).toBeTruthy();

    const less = screen.getByTestId(`article-${water.id}-less`);
    expect(less.props.accessibilityLabel).toBe("Decrease the quantity of Mineral water 50 cl");
    await fireEvent.press(less);
    // One off, none added: 3.50 + 2.60 = 6.10 CHF.
    expect(countOf(water)).toHaveTextContent("1", { exact: true });
    expect(screen.getByText("Charge · 2 items")).toBeTruthy();
    expect(screen.getAllByText("6.10 CHF").length).toBeGreaterThan(0);

    await fireEvent.press(screen.getByTestId(`article-${croissant.id}-less`));
    expect(countOf(croissant)).toBeNull();
    expect(screen.queryByTestId(`article-${croissant.id}-less`)).toBeNull();
    await fireEvent.press(screen.getByTestId(`article-${water.id}-less`));
    // The basket empty: nothing to charge, the hint back.
    expect(countOf(water)).toBeNull();
    expect(screen.getByTestId("charge").props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByText("Tap an item to add it")).toBeTruthy();

    // A tap on the tile adds again, as before.
    await fireEvent.press(screen.getByTestId(`article-${tea.id}`));
    expect(countOf(tea)).toHaveTextContent("1", { exact: true });
  });

  it("opens on the mode chosen last, and on the keypad without articles", async () => {
    secureStore.items.set(POS_MODE_STORE_KEY, JSON.stringify({ version: 1, mode: "articles" }));
    await tillWithCatalog(team, [water]);
    await open();
    await waitFor(() => expect(screen.getByTestId("articles-pad")).toBeTruthy());
    expect(screen.getByTestId("pos-mode-articles").props.accessibilityState).toEqual({
      checked: true,
      disabled: false
    });
  });

  it("saves the catalogue's keys once the owner's account opens, for till mode", async () => {
    await openTestAccount({ usage: "merchant", signUp: "done", displayCurrency: "CHF" });
    await tillProfile(getAccountBackupKey()!);
    const ownTeam = getAccountTeamKeys()!;
    await open();
    await waitFor(async () =>
      expect((await loadCatalogRecord())?.reader).toEqual(
        channelCatalogOf(deriveCatalogReader(ownTeam, 0), 0)
      )
    );
    expect((await loadCatalogRecord())?.account).toBe(TEST_WALLET_ID);
  });

  it("lists the articles sealed again after a removal in till mode, from the secret the owner's devices share", async () => {
    // Its account closed before another of the owner's devices removed an employee: its record
    // still holds epoch 0's keys, the articles are sealed with epoch 1's.
    await tillWithCatalog(team, []);
    await publishArticles(team, [water], 1);
    await saveOwnerDeviceRecord({
      version: 1,
      account: TEST_WALLET_ID.toLowerCase(),
      id: "ab".repeat(16),
      secret: "01".repeat(32),
      shared: bytesToHex(ownerDevicesSecret(team))
    });
    resetOwnerDeviceCache();
    await open();
    await waitFor(() => expect(screen.getByTestId("pos-mode-articles")).toBeTruthy());
  });

  it("lists no article sealed with a key the device was never given", async () => {
    // Without the owner's devices' secret (an employee's device, or a removed one): epoch 0 only.
    await tillWithCatalog(team, []);
    await publishArticles(team, [water], 1);
    await open();
    await fireEvent.press(await screen.findByTestId("pos-mode-articles"));
    await waitFor(() => expect(screen.getByTestId("articles-empty-read")).toBeTruthy());
    expect(screen.queryByText(water.name)).toBeNull();
  });

  it("lists the articles on an employee's device, with the keys of its channel", async () => {
    const { catalog } = await employeeDevice([water]);
    expect((await loadCatalogRecord())?.reader).toEqual(catalog);
    await open();
    await waitFor(() => expect(screen.getByTestId("pos-mode-articles")).toBeTruthy());
    expect(screen.getByTestId("pos-mode-scan")).toBeTruthy();
  });

  it("converts an article priced in another currency, at the same hour's rates", async () => {
    const euro = makeArticle("Salted crisps", 300, { currency: "EUR", barcode: TEA_CODE });
    const dollar = makeArticle("Gum", 100, { currency: "USD" });
    await tillWithCatalog(team, [euro, dollar]);
    await open();
    await waitFor(() => expect(screen.getByTestId("pos-mode-articles")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("pos-mode-articles"));
    // 3.00 EUR × 0.95 = 2.85 CHF; no USD rate: no price, no amount fixed with it.
    await waitFor(() => expect(screen.getByText("2.85")).toBeTruthy());
    expect(screen.getByText("—")).toBeTruthy();
    await fireEvent.press(screen.getByTestId(`article-${euro.id}`));
    await fireEvent.press(screen.getByTestId("charge"));
    await waitFor(() => expect(screen.getByTestId("charged")).toHaveTextContent(/^285 /));
  });

  it("charges nothing with an article of a currency without a rate in the basket", async () => {
    const dollar = makeArticle("Gum", 100, { currency: "USD" });
    await tillWithCatalog(team, [dollar, water]);
    await open();
    await waitFor(() => expect(screen.getByTestId("pos-mode-articles")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("pos-mode-articles"));
    await fireEvent.press(screen.getByTestId(`article-${water.id}`));
    await fireEvent.press(screen.getByTestId(`article-${dollar.id}`));
    expect(screen.getByTestId("charge").props.accessibilityState?.disabled).toBe(true);
  });

  it("changes and removes lines in the basket, with the sale's note", async () => {
    await tillWithCatalog(team, [water, croissant]);
    const { router } = await open();
    await waitFor(() => expect(screen.getByTestId("pos-mode-articles")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("pos-mode-articles"));
    await fireEvent.press(screen.getByTestId(`article-${water.id}`));
    await fireEvent.press(screen.getByTestId(`article-${croissant.id}`));
    await fireEvent.press(screen.getByTestId("open-basket"));
    expect(router.getPathname()).toBe("/pos/basket");
    expect(screen.getByTestId("basket-total")).toHaveTextContent("6.10 CHF");
    await fireEvent.press(screen.getByTestId(`basket-quantity-${water.id}-more`));
    expect(screen.getByTestId("basket-total")).toHaveTextContent("9.60 CHF");
    await fireEvent.press(screen.getByTestId(`basket-quantity-${croissant.id}-less`));
    expect(screen.queryByTestId(`basket-line-${croissant.id}`)).toBeNull();
    expect(screen.getByTestId("basket-total")).toHaveTextContent("7.00 CHF");
    await fireEvent.press(screen.getByTestId("add-note"));
    await fireEvent.changeText(screen.getByTestId("note-field"), "Table 4");
    await fireEvent(screen.getByTestId("note-field"), "submitEditing");
    await fireEvent.press(screen.getByTestId("basket-charge"));
    await waitFor(() => expect(screen.getByTestId("charged")).toHaveTextContent(/^700 /));
  });

  it('keeps "Charge" on the bottom safe area, counted once', async () => {
    // An iPhone's home indicator: the shell's band below the dock, hidden over the basket.
    const insets = jest.mocked(useSafeAreaInsets);
    const original = insets.getMockImplementation();
    insets.mockReturnValue({ top: 47, right: 0, bottom: 34, left: 0 });
    try {
      await tillWithCatalog(team, [water]);
      const { router } = await open();
      await waitFor(() => expect(screen.getByTestId("pos-mode-articles")).toBeTruthy());
      await fireEvent.press(screen.getByTestId("pos-mode-articles"));
      await fireEvent.press(screen.getByTestId(`article-${water.id}`));
      await fireEvent.press(screen.getByTestId("open-basket"));
      expect(router.getPathname()).toBe("/pos/basket");
      await waitFor(() =>
        expect(bottomInsetOf(screen.getByTestId("basket-charge"))).toBe(34 + space[6])
      );
    } finally {
      insets.mockImplementation(original);
    }
  });
});

describe("point of sale's scan", () => {
  /** The device's clock moved on by `ms` (renderRouter keeps fake timers, their clock with them). */
  const later = (ms: number) => jest.setSystemTime(Date.now() + ms);

  /** "Scan" chosen in the point of sale's selector. */
  async function openScan() {
    const { router } = await open();
    await fireEvent.press(await screen.findByTestId("pos-mode-scan"));
    expect(screen.getByTestId("pos-scan")).toBeTruthy();
    expect(router.getPathname()).toBe("/pos");
    return { router };
  }

  it('has no scan in a browser without a camera: "Amount" and "Items" only', async () => {
    mockWeb.on = true;
    camera.device.listed = false;
    await tillWithCatalog(team, [water, tea]);
    await open();
    await waitFor(() => expect(screen.getByTestId("pos-mode-articles")).toBeTruthy());
    await act(async () => undefined);
    expect(screen.queryByTestId("pos-mode-scan")).toBeNull();
  });

  it("scans in a browser with a camera, a computer's webcam included", async () => {
    mockWeb.on = true;
    mockDesktop.mockReturnValue(true);
    await tillWithCatalog(team, [water, tea]);
    await open();
    await fireEvent.press(await screen.findByTestId("pos-mode-scan"));
    await act(async () => camera.scan(TEA_CODE));
    expect(within(screen.getByTestId("scan-card")).getByText(tea.name)).toBeTruthy();
    expect(screen.getByText("Charge · 1 item")).toBeTruthy();
  });

  it("scans on an employee's device with articles that have no barcode", async () => {
    await employeeDevice([croissant]);
    await openScan();
    // A code read is of no article: said so, nothing added.
    await act(async () => camera.scan(WATER_CODE));
    expect(screen.getByTestId("scan-unknown")).toBeTruthy();
    expect(screen.getByTestId("scan-charge").props.accessibilityState?.disabled).toBe(true);
  });

  it("says so when the camera cannot start, as on a device without one", async () => {
    await tillWithCatalog(team, [water]);
    camera.device.cameraFails = true;
    await openScan();
    expect(await screen.findByTestId("barcode-camera-unavailable")).toBeTruthy();
    expect(
      screen.getByText("The camera could not start. This device may not have one.")
    ).toBeTruthy();
  });

  it("is remembered: the app left on the scan opens on it again", async () => {
    await tillWithCatalog(team, [water]);
    await open();
    await fireEvent.press(await screen.findByTestId("pos-mode-scan"));
    expect(parseStoredPosMode(secureStore.items.get(POS_MODE_STORE_KEY) ?? null)).toBe("scan");
    await act(async () => screen.unmount());

    // The app opened again: on the scan, its camera reading.
    await open();
    await waitFor(() => expect(screen.getByTestId("pos-scan")).toBeTruthy());
    expect(screen.getByTestId("pos-mode-scan").props.accessibilityState).toMatchObject({
      checked: true
    });
    await act(async () => camera.scan(WATER_CODE));
    expect(within(screen.getByTestId("scan-card")).getByText(water.name)).toBeTruthy();
  });

  it("opens on the keypad when the scan was remembered but is not offered (no camera)", async () => {
    mockWeb.on = true;
    camera.device.listed = false;
    secureStore.items.set(POS_MODE_STORE_KEY, JSON.stringify({ version: 2, mode: "scan" }));
    await tillWithCatalog(team, [water]);
    await open();
    await waitFor(() => expect(screen.getByTestId("pos-mode-amount")).toBeTruthy());
    expect(screen.getByTestId("pos-mode-amount").props.accessibilityState).toMatchObject({
      checked: true
    });
    expect(screen.queryByTestId("pos-scan")).toBeNull();
  });

  it("adds each article read, with a beep, its card shown until the next one", async () => {
    await tillWithCatalog(team, [water, tea]);
    await openScan();
    expect(screen.getByTestId("scan-charge").props.accessibilityState?.disabled).toBe(true);
    await act(async () => camera.scan(WATER_CODE));
    expect(within(screen.getByTestId("scan-card")).getByText("Mineral water 50 cl")).toBeTruthy();
    expect(screen.getByTestId("scan-quantity-count")).toHaveTextContent("1");
    await waitFor(() => expect(audio.plays()).toHaveLength(1));
    // Still in sight: the camera reports it at every frame, it counts once.
    later(200);
    await act(async () => camera.scan(WATER_CODE));
    expect(screen.getByTestId("scan-quantity-count")).toHaveTextContent("1");
    // Out of sight long enough, then read again: one more.
    later(SCAN_REPEAT_GAP_MS + 1);
    await act(async () => camera.scan(WATER_CODE));
    expect(screen.getByTestId("scan-quantity-count")).toHaveTextContent("2");
    await fireEvent.press(screen.getByTestId("scan-quantity-more"));
    expect(screen.getByTestId("scan-quantity-count")).toHaveTextContent("3");
    await act(async () => camera.scan(TEA_CODE));
    expect(within(screen.getByTestId("scan-card")).getByText("Iced tea")).toBeTruthy();
    // 3 × 3.50 + 4.50 = 15.00 CHF.
    expect(screen.getByText("Charge · 4 items")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("scan-charge"));
    await waitFor(() => expect(screen.getByTestId("charged")).toHaveTextContent(/^1500 /));
  });

  it("finds the article of a code read without its leading zero, as iOS reads it", async () => {
    // Its EAN-13 as Android reads it; iOS gives the UPC-A of 12 digits (expo-camera drops the 0).
    const cocoa = makeArticle("Cocoa", 590, { barcode: "0012345678905" });
    await tillWithCatalog(team, [cocoa]);
    await openScan();
    await act(async () => camera.scan("012345678905"));
    expect(within(screen.getByTestId("scan-card")).getByText("Cocoa")).toBeTruthy();
    expect(screen.queryByTestId("scan-unknown")).toBeNull();
  });

  it("says a code of no article on an employee's device, adds nothing and asks Open Food Facts nothing", async () => {
    const lookups = openFoodFacts(productNamed("Ovomaltine 500 g"));
    jest.spyOn(teamConfig, "getInviteOrigin").mockReturnValue("https://pay.example");
    await openTestAccount({ usage: "merchant", signUp: "done", displayCurrency: "CHF" });
    await tillProfile(getAccountBackupKey()!);
    await publishArticles(getAccountTeamKeys()!, [water]);
    const { url } = await inviteEmployee("Alice");
    // Alice's own device: nothing of the owner's on it.
    closeAccount();
    secureStore.resetSecureStore();
    resetTerminalProfileCache();
    resetMembershipCache();
    await joinTeam(await previewInvite(inviteLinkOf(url)!));
    await expect(syncMembership()).resolves.toBe("active");
    await openScan();

    await act(async () => camera.scan(OVO_CODE));
    expect(screen.getByTestId("scan-unknown")).toBeTruthy();
    expect(screen.getByText(OVO_CODE)).toBeTruthy();
    expect(screen.getByTestId("scan-charge").props.accessibilityState?.disabled).toBe(true);
    // An employee's device writes no article: no form, no third party asked.
    await act(async () => undefined);
    expect(screen.queryByTestId("article-sheet")).toBeNull();
    expect(lookups()).toEqual([]);
  });

  it("asks Open Food Facts nothing in till mode once the owner turned the product lookup off", async () => {
    await ownerDevice([water], { unlocked: true });
    await updateAccount({ productLookup: false });
    // Till mode: the choice is read from the settings saved on the device.
    closeAccount();
    try {
      const lookups = openFoodFacts(productNamed("Ovomaltine 500 g"));
      await openScan();

      await act(async () => camera.scan(OVO_CODE));
      await fireEvent(await screen.findByTestId("article-sheet"), "show");
      expect(within(screen.getByTestId("article-barcode")).getByText(OVO_CODE)).toBeTruthy();
      await waitFor(() => expect(screen.getByTestId("article-name")).toBeEnabled());
      expect(screen.getByTestId("article-name")).toHaveDisplayValue("");
      expect(lookups()).toEqual([]);
    } finally {
      // The settings saved on the device outlive the test (this file resets no file system): the
      // next tests' accounts must not read the lookup off.
      fileSystem.resetFileSystem();
    }
  });

  it("adds a code of no article to the catalogue in till mode: Open Food Facts, the price, the passkey, open while the scan shows", async () => {
    const stored = await ownerDevice([water]);
    const lookups = openFoodFacts(productNamed("Ovomaltine 500 g"));
    signIn.mockResolvedValue({ seed: testSeed(), credentialId: null });
    const focus = focusSpy();
    await openScan();

    await act(async () => camera.scan(OVO_CODE));
    expect(screen.getByTestId("scan-unknown")).toBeTruthy();
    // "New item" at once (its Modal's onShow), the cursor on the price.
    await fireEvent(await screen.findByTestId("article-sheet"), "show");
    expect(focusedFields(focus)).toEqual(["article-price"]);
    expect(within(screen.getByTestId("article-barcode")).getByText(OVO_CODE)).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByTestId("article-name")).toHaveDisplayValue("Ovomaltine 500 g")
    );
    expect(lookups()).toEqual([expect.stringContaining(`/api/v3/product/${OVO_CODE}?`)]);
    expect(screen.getByText("· from Open Food Facts")).toBeTruthy();
    // In the point of sale's currency. No passkey until "Save the item".
    expect(within(screen.getByTestId("article-sheet")).getByText("CHF")).toBeTruthy();
    expect(signIn).not.toHaveBeenCalled();
    expect(focusedFields(focus)).toEqual(["article-price"]);

    await fireEvent.changeText(screen.getByTestId("article-price"), "7.90");
    await fireEvent.press(screen.getByTestId("article-save"));
    expect(await screen.findByText("Item saved")).toBeTruthy();
    expect(signIn).toHaveBeenCalledTimes(1);
    // In the basket, as if it had been read.
    expect(within(screen.getByTestId("scan-card")).getByText("Ovomaltine 500 g")).toBeTruthy();
    expect(screen.getByTestId("scan-quantity-count")).toHaveTextContent("1");
    expect(screen.getByText("Charge · 1 item")).toBeTruthy();
    // The account stays open while the scan shows.
    expect(getAccountWalletId()).toBe(TEST_WALLET_ID);
    expect((await stored()).find(({ barcode }) => barcode === OVO_CODE)).toMatchObject({
      name: "Ovomaltine 500 g",
      price: { minor: 790, digits: 2, currency: "CHF" },
      barcode: OVO_CODE
    });

    // For the next time: read again, it is found, Open Food Facts not asked again.
    later(SCAN_REPEAT_GAP_MS + 1);
    await act(async () => camera.scan(OVO_CODE));
    expect(screen.getByTestId("scan-quantity-count")).toHaveTextContent("2");
    expect(lookups()).toHaveLength(1);

    // Another code of no article: saved without the passkey again.
    await act(async () => camera.scan(TEA_CODE));
    await waitFor(() => expect(screen.getByTestId("article-name")).toBeEnabled());
    await fireEvent.changeText(screen.getByTestId("article-name"), "Iced tea");
    await fireEvent.changeText(screen.getByTestId("article-price"), "4.50");
    await fireEvent.press(screen.getByTestId("article-save"));
    await waitFor(() =>
      expect(within(screen.getByTestId("scan-card")).getByText("Iced tea")).toBeTruthy()
    );
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(getAccountWalletId()).toBe(TEST_WALLET_ID);

    // The scan left for the basket: till mode again, the basket kept.
    await fireEvent.press(screen.getByTestId("scan-basket"));
    await waitFor(() => expect(getAccountWalletId()).toBeNull());
    // 2 × 7.90 + 4.50 = 20.30 CHF.
    expect(screen.getByTestId("basket-total")).toHaveTextContent("20.30 CHF");
    await fireEvent.press(screen.getByTestId("basket-charge"));
    await waitFor(() => expect(screen.getByTestId("charged")).toHaveTextContent(/^2030 /));
  });

  it("keeps an article saved here until a majority of the relays told it, and drops it once they tell its removal", async () => {
    // The app back to the front: the point of sale reads its catalogue again.
    const listeners = new Set<(state: AppStateStatus) => void>();
    jest.spyOn(AppState, "addEventListener").mockImplementation((type, listener) => {
      if (type !== "change") return { remove: () => undefined };
      const changed = listener as (state: AppStateStatus) => void;
      listeners.add(changed);
      return { remove: () => listeners.delete(changed) };
    });
    const readAgain = async () => {
      await act(async () => {
        for (const listener of listeners) listener("active");
      });
      await act(async () => undefined);
    };
    const stored = await ownerDevice([water], { unlocked: true });
    openFoodFacts(productNamed("Ovomaltine 500 g"));
    // Taken by the 3 first relays only: a majority of the 5.
    const [first, second, third, ...others] = DEFAULT_RELAYS;
    for (const relay of others) relays.readOnly.add(relay);
    await openScan();
    await act(async () => camera.scan(OVO_CODE));
    await waitFor(() =>
      expect(screen.getByTestId("article-name")).toHaveDisplayValue("Ovomaltine 500 g")
    );
    await fireEvent.changeText(screen.getByTestId("article-price"), "7.90");
    await fireEvent.press(screen.getByTestId("article-save"));
    expect(await screen.findByText("Item saved")).toBeTruthy();
    const saved = (await stored()).find(({ barcode }) => barcode === OVO_CODE)!;

    // Read again where only the 2 others answer: they do not hold it, it stays.
    relays.readOnly.clear();
    for (const relay of [first!, second!, third!]) relays.unreachable.add(relay);
    await readAgain();
    later(SCAN_REPEAT_GAP_MS + 1);
    await act(async () => camera.scan(OVO_CODE));
    expect(screen.getByTestId("scan-quantity-count")).toHaveTextContent("2");

    // Removed on another of the owner's devices; a majority answers: it is gone.
    relays.unreachable.clear();
    await publishArticle(
      articleEvent(deriveCatalogWriter(getAccountTeamKeys()!, 0), {
        version: 1,
        id: saved.id,
        removed: true,
        updatedAt: saved.updatedAt + 60
      }),
      {
        relays: DEFAULT_RELAYS,
        channel: "account",
        timeoutMs: 1000,
        authKey: deriveCatalogKeys(getAccountTeamKeys()!).nostr.secretKey
      }
    );
    await readAgain();
    await waitFor(() => expect(screen.queryByTestId("scan-card")).toBeNull());
    expect(screen.getByTestId("scan-charge").props.accessibilityState?.disabled).toBe(true);
  });

  it("locks again once the scan is left for another view, the account opened there", async () => {
    await ownerDevice([water]);
    openFoodFacts(productNamed("Ovomaltine 500 g"));
    signIn.mockResolvedValue({ seed: testSeed(), credentialId: null });
    await openScan();
    await act(async () => camera.scan(OVO_CODE));
    await waitFor(() =>
      expect(screen.getByTestId("article-name")).toHaveDisplayValue("Ovomaltine 500 g")
    );
    await fireEvent.changeText(screen.getByTestId("article-price"), "7.90");
    await fireEvent.press(screen.getByTestId("article-save"));
    expect(await screen.findByText("Item saved")).toBeTruthy();
    expect(getAccountWalletId()).toBe(TEST_WALLET_ID);

    await fireEvent.press(screen.getByTestId("pos-mode-amount"));
    await waitFor(() => expect(getAccountWalletId()).toBeNull());
    // The article saved stays in the basket.
    await fireEvent.press(screen.getByTestId("pos-mode-articles"));
    expect(screen.getByText("Charge · 1 item")).toBeTruthy();
  });

  it("closes the account a passkey opened once the scan was left, and saves nothing", async () => {
    const stored = await ownerDevice([water]);
    openFoodFacts(productNamed("Ovomaltine 500 g"));
    let answer: (value: Awaited<ReturnType<typeof signInWithPasskey>>) => void = () => undefined;
    signIn.mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        })
    );
    await openScan();
    await act(async () => camera.scan(OVO_CODE));
    await waitFor(() =>
      expect(screen.getByTestId("article-name")).toHaveDisplayValue("Ovomaltine 500 g")
    );
    await fireEvent.changeText(screen.getByTestId("article-price"), "7.90");
    await fireEvent.press(screen.getByTestId("article-save"));
    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));

    // The scan left while the prompt shows; the passkey answers afterwards.
    await fireEvent.press(screen.getByTestId("pos-mode-amount"));
    expect(screen.queryByTestId("pos-scan")).toBeNull();
    await act(async () => answer({ seed: testSeed(), credentialId: null }));
    await waitFor(() => expect(getAccountWalletId()).toBeNull());
    expect((await stored()).map(({ name }) => name)).toEqual([water.name]);
  });

  it("leaves the account open on leaving the scan when it was open before", async () => {
    await ownerDevice([water], { unlocked: true });
    await openScan();
    await fireEvent.press(screen.getByTestId("pos-mode-amount"));
    await act(async () => undefined);
    expect(getAccountWalletId()).toBe(TEST_WALLET_ID);
  });

  it("saves nothing when the passkey is dismissed, keeps the form, and adds no code read meanwhile", async () => {
    const stored = await ownerDevice([water]);
    openFoodFacts(productNamed("Ovomaltine 500 g"));
    signIn.mockRejectedValue(new PasskeyError("cancelled", "Dismissed"));
    await openScan();
    await act(async () => camera.scan(OVO_CODE));
    await waitFor(() =>
      expect(screen.getByTestId("article-name")).toHaveDisplayValue("Ovomaltine 500 g")
    );
    // The camera reads on behind the form: nothing joins the basket.
    later(SCAN_REPEAT_GAP_MS + 1);
    await act(async () => camera.scan(WATER_CODE));
    expect(screen.queryByTestId("scan-card")).toBeNull();
    expect(audio.plays()).toHaveLength(1);

    await fireEvent.changeText(screen.getByTestId("article-price"), "7.90");
    await fireEvent.press(screen.getByTestId("article-save"));
    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId("article-save")).toHaveTextContent("Save the item")
    );
    // A dismissed prompt is no error: the form stays as it was, nothing saved.
    expect(screen.queryByText("Item not saved")).toBeNull();
    expect(screen.getByTestId("article-price")).toHaveDisplayValue("7.90");
    expect(getAccountWalletId()).toBeNull();
    expect((await stored()).map(({ name }) => name)).toEqual([water.name]);

    // Closed: the code stays unknown, the basket empty.
    await fireEvent.press(
      within(screen.getByTestId("article-sheet")).getByRole("button", { name: "Close" })
    );
    expect(screen.getByTestId("scan-unknown")).toBeTruthy();
    expect(screen.getByTestId("scan-charge").props.accessibilityState?.disabled).toBe(true);
    // Read again once the form is gone: it shows again.
    later(SCAN_REPEAT_GAP_MS + 1);
    await act(async () => camera.scan(OVO_CODE));
    await waitFor(() =>
      expect(screen.getByTestId("article-name")).toHaveDisplayValue("Ovomaltine 500 g")
    );
    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it("asks no passkey on the owner's device unlocked, which stays so; a product unknown is named by hand", async () => {
    const stored = await ownerDevice([water], { unlocked: true });
    openFoodFacts(productUnknown);
    await openScan();
    await act(async () => camera.scan(OVO_CODE));
    expect(await screen.findByText("Product not found")).toBeTruthy();
    // No "from Open Food Facts": it filled nothing.
    expect(within(screen.getByTestId("article-barcode")).getByText(OVO_CODE)).toBeTruthy();
    expect(screen.queryByText("· from Open Food Facts")).toBeNull();
    await fireEvent.changeText(screen.getByTestId("article-name"), "Ovomaltine");
    await fireEvent.changeText(screen.getByTestId("article-price"), "7.90");
    await fireEvent.press(screen.getByTestId("article-save"));
    expect(await screen.findByText("Item saved")).toBeTruthy();
    expect(signIn).not.toHaveBeenCalled();
    expect(within(screen.getByTestId("scan-card")).getByText("Ovomaltine")).toBeTruthy();
    expect(getAccountWalletId()).toBe(TEST_WALLET_ID);
    expect((await stored()).find(({ barcode }) => barcode === OVO_CODE)).toMatchObject({
      name: "Ovomaltine",
      price: { minor: 790, digits: 2, currency: "CHF" }
    });
  });

  it("ignores the amount typed at the keypad", async () => {
    await tillWithCatalog(team, [water]);
    await open();
    await fireEvent.press(screen.getByTestId("key-9"));
    await fireEvent.press(await screen.findByTestId("pos-mode-scan"));
    await act(async () => camera.scan(WATER_CODE));
    await fireEvent.press(screen.getByTestId("scan-charge"));
    await waitFor(() => expect(screen.getByTestId("charged")).toHaveTextContent(/^350 /));
  });

  it('shares its basket with "Items": changing the view keeps it, the camera off', async () => {
    await tillWithCatalog(team, [water, tea]);
    await openScan();
    await act(async () => camera.scan(WATER_CODE));
    await fireEvent.press(screen.getByTestId("pos-mode-articles"));
    // The camera stopped with the scan's view: nothing read meanwhile joins the basket.
    expect(() => camera.scan(TEA_CODE)).toThrow("No camera is scanning");
    expect(countOf(water)).toHaveTextContent("1", { exact: true });
    await fireEvent.press(screen.getByTestId(`article-${tea.id}`));

    await fireEvent.press(screen.getByTestId("pos-mode-amount"));
    await fireEvent.press(screen.getByTestId("pos-mode-scan"));
    expect(screen.getByText("Charge · 2 items")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("scan-charge"));
    await waitFor(() => expect(screen.getByTestId("charged")).toHaveTextContent(/^800 /));
  });

  it("shows the basket from the scan, and goes back to it", async () => {
    await tillWithCatalog(team, [water]);
    const { router } = await openScan();
    await act(async () => camera.scan(WATER_CODE));
    await fireEvent.press(screen.getByTestId("scan-basket"));
    expect(router.getPathname()).toBe("/pos/basket");
    expect(screen.getByTestId("basket-total")).toHaveTextContent("3.50 CHF");
    // The scan under the basket has no camera: nothing read meanwhile joins the basket.
    expect(() => camera.scan(WATER_CODE)).toThrow("No camera is scanning");
    await fireEvent.press(screen.getByTestId("basket-scan-more"));
    expect(router.getPathname()).toBe("/pos");
    // The card read last is still shown.
    expect(within(screen.getByTestId("scan-card")).getByText("Mineral water 50 cl")).toBeTruthy();
  });

  /*
   * The scan is a view of the point of sale, over the dock as the keypad: its "Charge" stands
   * where the keypad's does, the bottom safe area counted once (the shell's, below the dock).
   */
  it('keeps "Charge" where the keypad\'s stands, over the dock', async () => {
    const insets = jest.mocked(useSafeAreaInsets);
    const original = insets.getMockImplementation();
    insets.mockReturnValue({ top: 47, right: 0, bottom: 34, left: 0 });
    try {
      await tillWithCatalog(team, [water]);
      await open();
      const keypad = bottomInsetOf(await screen.findByTestId("charge"));
      await fireEvent.press(await screen.findByTestId("pos-mode-scan"));
      expect(bottomInsetOf(screen.getByTestId("scan-charge"))).toBe(keypad);
    } finally {
      insets.mockImplementation(original);
    }
  });
});
