import "@/i18n";

import { router } from "expo-router";
import { act, fireEvent, renderRouter, screen, waitFor, within } from "expo-router/testing-library";
import { Platform, StyleSheet, TextInput } from "react-native";

import AppLayout from "@/app/(app)/_layout";
import ArticlesRoute from "@/app/(app)/articles";
import AmountScreen from "@/app/(app)/pos/index";
import PosLayout from "@/app/(app)/pos/_layout";
import LaunchScreen from "@/app/index";
import { DEFAULT_RELAYS } from "@/config/relays";
import {
  closeAccount,
  getAccountBackupKey,
  getAccountSettings,
  getAccountTeamKeys,
  updateAccount
} from "@/features/account/session";
import { imageUri, resetImages } from "@/features/media/images";
import { PickImageError, type SquaringImage } from "@/features/media/pick-image";
import { resetTerminalProfileCache } from "@/features/terminal/profile-cache";
import { markNotificationsOffered } from "@/features/notification-offer/offer";
import {
  articleEvent,
  fetchArticles,
  newArticleId,
  publishArticle,
  type Article
} from "@/lib/catalog/article";
import { deriveCatalogKeys, deriveRosterKeys } from "@/lib/team/keys";
import type { SavedTerminalProfile } from "@/lib/terminal/model";
import { readLog } from "@/lib/log/log";
import { saveTerminalProfile } from "@/lib/terminal/profile";

import { TEST_WALLET_ID, openTestAccount } from "../../jest/account";
import type * as AudioFake from "../../jest/expo-audio";
import type * as CameraFake from "../../jest/expo-camera";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as RelaysFake from "../../jest/nostr-relays";
import { keyboardFields } from "../../jest/soft-keyboard";

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
jest.mock("../features/terminal/useRate", () => ({
  useRate: () => ({
    rate: 50000,
    hour: jest
      .requireActual<typeof import("../lib/rates/sources")>("../lib/rates/sources")
      .pointHourOf(Math.floor(Date.now() / 1000)),
    loading: false,
    current: () => 50000
  })
}));
jest.mock("../lib/breez/config", () => ({
  ...jest.requireActual("../lib/breez/config"),
  getBreezNetwork: () => "mainnet"
}));
// The system's photo library or camera (pickImageToSquare): the photo picked, then its square
// JPEG being made, as pick-image.ts gives them.
const PHOTO = new Uint8Array(400).fill(4);
/** A photo picked whose square JPEG is `bytes`: made at once by default. */
function picked(bytes: Uint8Array | Promise<Uint8Array> = PHOTO): SquaringImage {
  return { bytes: Promise.resolve(bytes) };
}
const mockPick = jest.fn<Promise<SquaringImage | null>, [use?: string, source?: string]>(async () =>
  picked()
);
jest.mock("../features/media/pick-image", () => ({
  ...jest.requireActual("../features/media/pick-image"),
  pickImageToSquare: (use?: string, source?: string) => mockPick(use, source)
}));
// A scanned product's photo, downloaded and made square (product-photo.ts).
const SCANNED_PHOTO = new Uint8Array(300).fill(7);
const mockProductPhoto = jest.fn(
  async (_url: string, _userAgent: string): Promise<Uint8Array | null> => SCANNED_PHOTO
);
jest.mock("../features/catalog/product-photo", () => ({
  productPhoto: (url: string, userAgent: string) => mockProductPhoto(url, userAgent)
}));
jest.mock("../lib/app-info", () => ({
  ...jest.requireActual("../lib/app-info"),
  getAppInfo: () => ({
    variant: "staging",
    version: "3.0.0",
    buildNumber: "3000000",
    commit: "f82ecab",
    updates: null
  })
}));
const mockDesktop = jest.fn(() => false);
jest.mock("@/components/layout/useIsDesktop", () => ({
  ...jest.requireActual("@/components/layout/useIsDesktop"),
  useIsDesktop: () => mockDesktop()
}));

const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const camera = jest.requireMock<typeof CameraFake>("expo-camera");
const audio = jest.requireMock<typeof AudioFake>("expo-audio");
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");

const routes = {
  index: LaunchScreen,
  "(app)/_layout": AppLayout,
  "(app)/pos/_layout": PosLayout,
  "(app)/pos/index": AmountScreen,
  "(app)/articles": ArticlesRoute
};

/** The owner's device, unlocked: its account open (done), its point of sale prepared. */
async function ownerDevice() {
  await openTestAccount({ usage: "merchant", signUp: "done", displayCurrency: "CHF" });
  const profile: SavedTerminalProfile = {
    version: 2,
    walletId: TEST_WALLET_ID,
    backupKey: getAccountBackupKey()!,
    lightningAddress: "sattleme02c6047f94@breez.tips",
    businessName: getAccountSettings()?.businessName ?? "",
    currency: "CHF"
  };
  await saveTerminalProfile(profile);
  resetTerminalProfileCache();
}

/** The articles the relays hold, as another of the owner's devices would read them. */
async function storedArticles() {
  const keys = deriveCatalogKeys(getAccountTeamKeys()!);
  const read = await fetchArticles(keys, {
    relays: DEFAULT_RELAYS,
    channel: "account",
    timeoutMs: 1000,
    authKey: keys.nostr.secretKey
  });
  return read.articles;
}

/** An article already on the relays, as another of the owner's devices published it. */
async function seedArticle(
  name: string,
  minor: number,
  currency = "CHF",
  barcode: string | null = null
) {
  const keys = deriveCatalogKeys(getAccountTeamKeys()!);
  const article: Article = {
    version: 1,
    id: newArticleId(),
    name,
    description: "",
    price: { minor, digits: 2, currency },
    image: null,
    barcode,
    createdAt: 1_790_000_000,
    updatedAt: 1_790_000_000
  };
  await publishArticle(articleEvent(keys, article), {
    relays: DEFAULT_RELAYS,
    channel: "account",
    timeoutMs: 1000,
    authKey: keys.nostr.secretKey
  });
  return article;
}

async function open() {
  await renderRouter(routes, { initialUrl: "/articles" });
}

/** The spinners: decorative, hidden from screen readers (Spinner). */
const hidden = { includeHiddenElements: true };

/** A promise resolved (or rejected) by the test, when it chooses. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return { promise, resolve, reject };
}

/** Open Food Facts' answer (API v3) for the Rivella of the scans. */
function rivellaAnswer(): Response {
  return {
    status: 200,
    ok: true,
    json: async () => ({
      status: "success",
      product: {
        product_name: "Rivella Red 50 cl",
        lang: "de",
        selected_images: {
          front: {
            display: {
              de: "https://images.openfoodfacts.org/front_de.400.jpg",
              en: "https://images.openfoodfacts.org/front_en.400.jpg"
            }
          }
        }
      }
    })
  } as Response;
}

/**
 * TextInput's `focus`, its calls from this test only: React Native's fake already makes it a mock
 * function, which spyOn returns as it is and restoreAllMocks leaves with its calls.
 */
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

type HostNode = { props: { source?: { uri?: unknown } }; children: readonly (HostNode | string)[] };

/** The data URI of the photo the form's tile shows; null without one. */
function tilePhoto(): string | null {
  const find = (node: HostNode | string): string | null => {
    if (typeof node === "string") return null;
    const uri = node.props.source?.uri;
    if (typeof uri === "string") return uri;
    for (const child of node.children) {
      const found = find(child);
      if (found) return found;
    }
    return null;
  };
  return find(screen.getByTestId("article-photo") as unknown as HostNode);
}

/**
 * Picks the form's photo as the owner does in the apps: the photo pressed, then `source` in its
 * menu; the picker opens once the menu is gone.
 */
async function pickPhoto(source: "library" | "camera" = "library") {
  const calls = mockPick.mock.calls.length;
  await fireEvent.press(screen.getByTestId("article-photo"));
  await fireEvent.press(await screen.findByTestId(`article-photo-${source}`));
  await waitFor(() => expect(mockPick).toHaveBeenCalledTimes(calls + 1));
  await waitFor(() => expect(screen.queryByTestId("article-photo-menu", hidden)).toBeNull());
}

jest.setTimeout(30_000);

// "Stay informed" answered on this device, as on any past its first opening: its panel would
// cover this file's screens (notifications-offer.test.tsx tests it).
beforeEach(async () => {
  await markNotificationsOffered(0);
});

beforeEach(() => {
  closeAccount();
  relays.resetRelays();
  fileSystem.resetFileSystem();
  resetImages();
  mockDesktop.mockReturnValue(false);
  // Its calls and a photo or failure held by a test that stopped before taking it.
  mockPick.mockReset().mockImplementation(async () => picked());
  // Its calls and a photo held by a test that stopped before taking it (mockImplementationOnce).
  mockProductPhoto.mockReset().mockImplementation(async () => SCANNED_PHOTO);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("Items, mobile", () => {
  it("draws its loading scene while the relays are read, then what it read in its place", async () => {
    await ownerDevice();
    const release = relays.holdQueries();
    await open();
    // The words of the wait, which screen readers read; the scene itself is decorative.
    expect(await screen.findByRole("progressbar", { name: "Loading your items…" })).toBeTruthy();
    expect(screen.getByTestId("articles-loading", hidden)).toBeTruthy();
    // "Not read yet" is never "none yet".
    expect(screen.queryByTestId("articles-empty")).toBeNull();

    await act(async () => release());
    expect(await screen.findByTestId("articles-empty")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("says there is none yet, then adds one: photo, name, description, price", async () => {
    await ownerDevice();
    await open();
    // What the catalogue does, in three steps.
    const guide = await screen.findByTestId("articles-empty");
    expect(within(guide).getByRole("header", { name: "Sell in a few taps" })).toBeTruthy();
    expect(within(guide).getByLabelText(/^1\. Create your items, /)).toBeTruthy();
    // The point of sale's mode named as it shows there.
    expect(
      within(guide).getByLabelText(
        /^2\. Tap them at the point of sale, Switch to “Items”: .* scan their barcode\.$/
      )
    ).toBeTruthy();
    expect(within(guide).getByLabelText(/^3\. Charge the basket, /)).toBeTruthy();

    // The team's roster read again meanwhile, in the background: the catalogue's key of now.
    const roster = deriveRosterKeys(getAccountTeamKeys()!).nostr.publicKey;
    const rosterReads = () =>
      relays.calls.filter(
        ({ operation, filter }) => operation === "query" && filter?.authors?.includes(roster)
      ).length;
    const before = rosterReads();
    await fireEvent.press(screen.getByTestId("add-article"));
    expect(await screen.findByTestId("article-sheet")).toBeTruthy();
    expect(screen.getByText("New item")).toBeTruthy();
    expect(rosterReads()).toBeGreaterThan(before);
    // Name and price are required.
    expect(screen.getByTestId("article-save")).toBeDisabled();

    await pickPhoto();
    expect(mockPick).toHaveBeenCalledWith("article", "library");
    await fireEvent.changeText(screen.getByTestId("article-name"), "Chocolate croissant");
    await fireEvent.changeText(screen.getByTestId("article-price"), "2,2");
    // The description opens with "Add a description" (an optional field).
    expect(screen.queryByTestId("article-description")).toBeNull();
    await fireEvent.press(screen.getByTestId("article-add-description"));
    await fireEvent.changeText(
      screen.getByTestId("article-description"),
      "Two bars of dark chocolate in an all-butter puff pastry."
    );
    await fireEvent.press(screen.getByTestId("article-save"));

    expect(await screen.findByText("Item saved")).toBeTruthy();
    const [saved] = await storedArticles();
    expect(saved).toMatchObject({
      name: "Chocolate croissant",
      description: "Two bars of dark chocolate in an all-butter puff pastry.",
      // Exact: 2.2 francs are 220 centimes.
      price: { minor: 220, digits: 2, currency: "CHF" },
      barcode: null
    });
    expect(saved?.image).not.toBeNull();
    // Listed with its price in the device's format.
    expect(await screen.findByTestId(`article-${saved!.id}`)).toHaveTextContent(
      /Chocolate croissant.*Two bars.*2[.,]20 CHF/
    );
  });

  it("refuses a price that is not one, at its field", async () => {
    await ownerDevice();
    await open();
    await fireEvent.press(await screen.findByTestId("add-article"));
    await fireEvent.changeText(await screen.findByTestId("article-name"), "Espresso");
    await fireEvent.changeText(screen.getByTestId("article-price"), "3,605");
    expect(screen.getByText("Enter a price such as 4.80")).toBeTruthy();
    expect(screen.getByTestId("article-save")).toBeDisabled();
  });

  it("lists the articles of the relays, the newest first, and keeps nothing when none takes one", async () => {
    await ownerDevice();
    const keys = deriveCatalogKeys(getAccountTeamKeys()!);
    const call = {
      relays: DEFAULT_RELAYS,
      channel: "account" as const,
      timeoutMs: 1000,
      authKey: keys.nostr.secretKey
    };
    for (const [name, createdAt] of [
      ["Espresso", 1_790_000_000],
      ["Cappuccino", 1_790_000_100]
    ] as const) {
      await publishArticle(
        articleEvent(keys, {
          version: 1,
          id: `${createdAt}`.padStart(32, "0"),
          name,
          description: "",
          price: { minor: 360, digits: 2, currency: "CHF" },
          image: null,
          barcode: null,
          createdAt,
          updatedAt: createdAt
        }),
        call
      );
    }
    await open();
    await waitFor(() => expect(screen.getAllByText(/^(Espresso|Cappuccino)$/)).toHaveLength(2));
    expect(
      screen.getAllByText(/^(Espresso|Cappuccino)$/).map((node) => node.props.children)
    ).toEqual(["Cappuccino", "Espresso"]);
    // Without a photo: the name's initials.
    expect(screen.getByText("C")).toBeTruthy();
    expect(screen.getByText("E")).toBeTruthy();

    // No relay takes the next one: nothing listed, the sheet stays, a notification says so.
    for (const relay of DEFAULT_RELAYS) relays.readOnly.add(relay);
    await fireEvent.press(screen.getByTestId("add-article"));
    await fireEvent.changeText(await screen.findByTestId("article-name"), "Homemade iced tea");
    await fireEvent.changeText(screen.getByTestId("article-price"), "4,20");
    await fireEvent.press(screen.getByTestId("article-save"));
    expect(await screen.findByText("Item not saved")).toBeTruthy();
    expect(screen.getByTestId("article-sheet")).toBeTruthy();
    expect(screen.queryByText("Homemade iced tea", { exact: true })).toBeNull();
  });

  it("saves an article once a majority of the relays took it; saved again, the same one, never twice", async () => {
    await ownerDevice();
    await open();
    expect(await screen.findByTestId("articles-empty")).toBeTruthy();
    // 2 of the 5 relays take it, fewer than a majority. Read as usual.
    for (const relay of DEFAULT_RELAYS.slice(2)) relays.readOnly.add(relay);
    await fireEvent.press(screen.getByTestId("add-article"));
    await fireEvent.changeText(await screen.findByTestId("article-name"), "Homemade iced tea");
    await fireEvent.changeText(screen.getByTestId("article-price"), "4,20");
    await fireEvent.press(screen.getByTestId("article-save"));
    expect(await screen.findByText("Item not saved")).toBeTruthy();
    expect(
      screen.getByText("Too few relays answered. Check the connection, then try again")
    ).toBeTruthy();
    expect(screen.getByTestId("article-sheet")).toBeTruthy();
    expect(screen.queryByText("Homemade iced tea", { exact: true })).toBeNull();
    // Those 2 relays hold it.
    const [partial] = await storedArticles();
    expect(partial).toMatchObject({ name: "Homemade iced tea", price: { minor: 420 } });

    // Saved again: the same article, dated after, so that those relays replace their copy.
    relays.readOnly.clear();
    await fireEvent.changeText(screen.getByTestId("article-price"), "4,50");
    await fireEvent.press(screen.getByTestId("article-save"));
    expect(await screen.findByText("Item saved")).toBeTruthy();
    const stored = await storedArticles();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      id: partial!.id,
      createdAt: partial!.createdAt,
      price: { minor: 450 }
    });
    expect(stored[0]!.updatedAt).toBeGreaterThan(partial!.updatedAt);
  });

  it("scans a barcode: back to the form at once, then the name and the photo from Open Food Facts, never the price", async () => {
    await ownerDevice();
    const answer = deferred<Response>();
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockImplementation(() => answer.promise);
    // Open Food Facts' lookups (the owner's unlock also reads the business's name on breez.tips).
    const lookups = () =>
      fetchSpy.mock.calls.filter(([url]) => String(url).includes("/api/v3/product/"));
    const photo = deferred<Uint8Array | null>();
    mockProductPhoto.mockImplementationOnce(() => photo.promise);
    await open();
    await fireEvent.press(await screen.findByTestId("add-article"));
    await fireEvent.press(await screen.findByTestId("article-scan"));
    expect(await screen.findByTestId("barcode-scanner")).toBeTruthy();
    expect(screen.getByText("Aim at the barcode")).toBeTruthy();

    // A QR code is not a product's barcode: ignored, without a beep.
    await act(async () => camera.scan("https://example.com"));
    expect(lookups()).toEqual([]);
    expect(audio.plays()).toEqual([]);
    await act(async () => camera.scan("7610097111072"));
    // A till's beep at once, Open Food Facts not answered yet; never while
    // the device is silenced, over the music playing.
    expect(audio.plays()).toEqual([
      {
        source: expect.anything(),
        from: 0,
        mode: expect.objectContaining({
          playsInSilentMode: false,
          interruptionMode: "mixWithOthers"
        })
      }
    ]);

    // The form shows again at once, Open Food Facts not answered yet:
    // the name and the photo greyed with a spinner, and in words what they wait for.
    expect(lookups()).toHaveLength(1);
    expect(await screen.findByTestId("article-sheet")).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId("barcode-scanner")).toBeNull());
    expect(screen.getByTestId("article-name-searching", hidden)).toBeTruthy();
    expect(screen.getByTestId("article-photo-searching", hidden)).toBeTruthy();
    expect(screen.getByText("7610097111072")).toBeTruthy();
    expect(screen.getByText("· looking it up on Open Food Facts")).toBeTruthy();
    expect(screen.getByTestId("article-name")).toHaveDisplayValue("");
    expect(screen.getByTestId("article-name")).toBeDisabled();
    expect(screen.getByTestId("article-photo")).toBeDisabled();
    // The price is typed meanwhile.
    await fireEvent.changeText(screen.getByTestId("article-price"), "3,50");

    await act(async () => answer.resolve(rivellaAnswer()));
    await waitFor(() =>
      expect(screen.getByTestId("article-name")).toHaveDisplayValue("Rivella Red 50 cl")
    );
    expect(screen.queryByTestId("article-name-searching", hidden)).toBeNull();
    expect(screen.getByTestId("article-name")).toBeEnabled();
    // Its photo is still being downloaded.
    expect(screen.getByTestId("article-photo-searching", hidden)).toBeTruthy();
    expect(screen.getByTestId("article-photo")).toBeDisabled();
    expect(mockProductPhoto).toHaveBeenCalledWith(
      "https://images.openfoodfacts.org/front_en.400.jpg",
      "sattle.me/3.0.0 (+https://github.com/sattleme/app)"
    );

    await act(async () => photo.resolve(SCANNED_PHOTO));
    await waitFor(() => expect(screen.queryByTestId("article-photo-searching", hidden)).toBeNull());
    expect(tilePhoto()).toBe(imageUri(SCANNED_PHOTO));
    expect(screen.getByTestId("article-photo")).toBeEnabled();
    expect(screen.getByText("· from Open Food Facts")).toBeTruthy();
    expect(screen.getByTestId("article-price")).toHaveDisplayValue("3,50");

    await fireEvent.press(screen.getByTestId("article-save"));
    expect(await screen.findByText("Item saved")).toBeTruthy();
    const [saved] = await storedArticles();
    expect(saved).toMatchObject({
      name: "Rivella Red 50 cl",
      price: { minor: 350, digits: 2, currency: "CHF" },
      barcode: "7610097111072"
    });
    expect(saved?.image).not.toBeNull();
  });

  it("never asks Open Food Facts once the owner turned the product lookup off", async () => {
    await ownerDevice();
    await updateAccount({ productLookup: false });
    const fetchSpy = jest.spyOn(globalThis, "fetch");
    fetchSpy.mockClear();
    const lookups = () =>
      fetchSpy.mock.calls.filter(([url]) => String(url).includes("/api/v3/product/"));
    await open();
    await fireEvent.press(await screen.findByTestId("add-article"));
    await fireEvent.press(await screen.findByTestId("article-scan"));
    // What follows the scan, said as it is.
    expect(
      await screen.findByText("You will enter the name, the photo and the price.")
    ).toBeTruthy();
    expect(screen.queryByText(/from Open Food Facts/)).toBeNull();

    await act(async () => camera.scan("7610097111072"));
    expect(await screen.findByTestId("article-sheet")).toBeTruthy();
    // The barcode kept, the name to type: nothing asked, nothing waited for.
    expect(screen.getByText("7610097111072")).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("article-name")).toBeEnabled());
    expect(screen.queryByTestId("article-name-searching", hidden)).toBeNull();
    expect(screen.queryByText("· looking it up on Open Food Facts")).toBeNull();
    expect(lookups()).toEqual([]);
    expect(mockProductPhoto).not.toHaveBeenCalled();
  });

  it("takes neither a name nor a photo while Open Food Facts is asked for them", async () => {
    await ownerDevice();
    const answer = deferred<Response>();
    jest.spyOn(globalThis, "fetch").mockImplementation(() => answer.promise);
    await open();
    await fireEvent.press(await screen.findByTestId("add-article"));
    await fireEvent.press(await screen.findByTestId("article-scan"));
    await act(async () => camera.scan("7610097111072"));
    expect(await screen.findByTestId("article-name-searching", hidden)).toBeTruthy();

    // Greyed: neither typed in nor pressed.
    await fireEvent.changeText(screen.getByTestId("article-name"), "Rivella maison");
    await fireEvent.press(screen.getByTestId("article-photo"));
    expect(screen.getByTestId("article-name")).toHaveDisplayValue("");
    expect(screen.queryByTestId("article-photo-menu", hidden)).toBeNull();
    expect(mockPick).not.toHaveBeenCalled();

    await act(async () => answer.resolve(rivellaAnswer()));
    await waitFor(() => expect(screen.queryByTestId("article-photo-searching", hidden)).toBeNull());
    expect(screen.getByTestId("article-name")).toHaveDisplayValue("Rivella Red 50 cl");
    expect(tilePhoto()).toBe(imageUri(SCANNED_PHOTO));
    // Both editable again: the owner may change what was read.
    await fireEvent.changeText(screen.getByTestId("article-name"), "Rivella maison");
    expect(screen.getByTestId("article-name")).toHaveDisplayValue("Rivella maison");
    await pickPhoto();
  });

  it("takes the product's photo over one picked before the scan, for a new article", async () => {
    await ownerDevice();
    jest.spyOn(globalThis, "fetch").mockImplementation(async () => rivellaAnswer());
    await open();
    await fireEvent.press(await screen.findByTestId("add-article"));
    expect(await screen.findByTestId("article-sheet")).toBeTruthy();
    await pickPhoto();
    await waitFor(() => expect(tilePhoto()).toBe(imageUri(PHOTO)));

    await fireEvent.press(screen.getByTestId("article-scan"));
    await act(async () => camera.scan("7610097111072"));
    // Only an article changed keeps its photo.
    await waitFor(() => expect(tilePhoto()).toBe(imageUri(SCANNED_PHOTO)));
    expect(mockProductPhoto).toHaveBeenCalledTimes(1);
  });

  it("gives the photo back to the owner when the product's photo cannot be downloaded", async () => {
    await ownerDevice();
    jest.spyOn(globalThis, "fetch").mockImplementation(async () => rivellaAnswer());
    mockProductPhoto.mockImplementationOnce(async () => {
      throw new Error("The cache could not be written");
    });
    await open();
    await fireEvent.press(await screen.findByTestId("add-article"));
    await fireEvent.press(await screen.findByTestId("article-scan"));
    await act(async () => camera.scan("7610097111072"));
    await waitFor(() =>
      expect(screen.getByTestId("article-name")).toHaveDisplayValue("Rivella Red 50 cl")
    );
    await waitFor(() => expect(screen.queryByTestId("article-photo-searching", hidden)).toBeNull());
    expect(tilePhoto()).toBeNull();
    await pickPhoto();
  });

  // Android's photo picker offers no camera.
  it("takes the photo with the system's camera app, or picks it from the photo library", async () => {
    await ownerDevice();
    await open();
    await fireEvent.press(await screen.findByTestId("add-article"));
    expect(await screen.findByTestId("article-sheet")).toBeTruthy();

    // The menu first: nothing opens over it (iOS would close the camera with it).
    await fireEvent.press(screen.getByTestId("article-photo"));
    expect(await screen.findByText("Take a photo")).toBeTruthy();
    expect(screen.getByText("Choose from your photos")).toBeTruthy();
    expect(mockPick).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId("article-photo-camera"));
    await waitFor(() => expect(mockPick).toHaveBeenCalledWith("article", "camera"));
    expect(screen.queryByTestId("article-photo-menu", hidden)).toBeNull();
    await waitFor(() => expect(tilePhoto()).toBe(imageUri(PHOTO)));

    // Changed from the photo library.
    const other = new Uint8Array(500).fill(9);
    mockPick.mockImplementationOnce(async () => picked(other));
    await pickPhoto("library");
    expect(mockPick).toHaveBeenLastCalledWith("article", "library");
    await waitFor(() => expect(tilePhoto()).toBe(imageUri(other)));
    expect(mockPick).toHaveBeenCalledTimes(2);
  });

  it("opens nothing when the photo's menu is closed without a choice", async () => {
    await ownerDevice();
    await open();
    await fireEvent.press(await screen.findByTestId("add-article"));
    expect(await screen.findByTestId("article-sheet")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("article-photo"));
    await fireEvent.press(await screen.findByTestId("article-photo-menu-outside", hidden));
    await waitFor(() => expect(screen.queryByTestId("article-photo-menu", hidden)).toBeNull());
    expect(mockPick).not.toHaveBeenCalled();
    expect(tilePhoto()).toBeNull();
    // The form stays, the photo can be taken.
    await pickPhoto("camera");
    await waitFor(() => expect(tilePhoto()).toBe(imageUri(PHOTO)));
  });

  it("says when the camera does not open, the form kept", async () => {
    await ownerDevice();
    mockPick.mockImplementationOnce(async () => {
      throw new PickImageError("cameraDenied", "The camera was not allowed");
    });
    await open();
    await fireEvent.press(await screen.findByTestId("add-article"));
    expect(await screen.findByTestId("article-sheet")).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId("article-name"), "Butter braid");
    await pickPhoto("camera");
    expect(
      await screen.findByText(
        "The camera does not open. Allow it in the device settings, then try again."
      )
    ).toBeTruthy();
    expect(tilePhoto()).toBeNull();
    expect(screen.getByTestId("article-name")).toHaveDisplayValue("Butter braid");
    // The photo library still can.
    await pickPhoto("library");
    await waitFor(() => expect(tilePhoto()).toBe(imageUri(PHOTO)));
    expect(screen.queryByText(/The camera does not open/)).toBeNull();
  });

  it("opens the browser's file picker at once on the web, with no menu", async () => {
    jest.replaceProperty(Platform, "OS", "web");
    await ownerDevice();
    await open();
    await fireEvent.press(await screen.findByTestId("add-article"));
    expect(await screen.findByTestId("article-sheet")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("article-photo"));
    expect(mockPick).toHaveBeenCalledWith("article", undefined);
    expect(screen.queryByTestId("article-photo-menu", hidden)).toBeNull();
    await waitFor(() => expect(tilePhoto()).toBe(imageUri(PHOTO)));
  });

  it('saves a photo picked only once it is prepared: "Save" waits for it', async () => {
    await ownerDevice();
    await open();
    await fireEvent.press(await screen.findByTestId("add-article"));
    expect(await screen.findByTestId("article-sheet")).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId("article-name"), "Cappuccino");
    await fireEvent.changeText(screen.getByTestId("article-price"), "4,50");
    expect(screen.getByTestId("article-save")).toBeEnabled();
    // Picked, its square JPEG still being made (cropped, resized, compressed).
    const square = deferred<Uint8Array>();
    mockPick.mockImplementationOnce(async () => picked(square.promise));
    await pickPhoto();

    // Said in words in the photo's place; "Save" waits, and no other photo nor scan meanwhile.
    expect(await screen.findByText("Preparing the photo…")).toBeTruthy();
    expect(screen.getByTestId("article-photo-preparing", hidden)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Preparing the photo…" })).toBeDisabled();
    expect(screen.getByTestId("article-save")).toBeDisabled();
    expect(screen.getByTestId("article-scan")).toBeDisabled();
    await fireEvent.press(screen.getByTestId("article-save"));
    expect(screen.queryByText("Item saved")).toBeNull();
    expect(await storedArticles()).toEqual([]);

    await act(async () => square.resolve(PHOTO));
    await waitFor(() => expect(tilePhoto()).toBe(imageUri(PHOTO)));
    expect(screen.queryByText("Preparing the photo…")).toBeNull();
    expect(screen.queryByTestId("article-photo-preparing", hidden)).toBeNull();
    expect(screen.getByTestId("article-photo")).toBeEnabled();
    expect(screen.getByTestId("article-save")).toBeEnabled();
    await fireEvent.press(screen.getByTestId("article-save"));
    expect(await screen.findByText("Item saved")).toBeTruthy();
    const [saved] = await storedArticles();
    expect(saved).toMatchObject({ name: "Cappuccino", price: { minor: 450, currency: "CHF" } });
    expect(saved?.image).not.toBeNull();
  });

  it("says a photo that cannot be prepared, in the journal too, the form kept", async () => {
    await ownerDevice();
    await open();
    await fireEvent.press(await screen.findByTestId("add-article"));
    expect(await screen.findByTestId("article-sheet")).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId("article-name"), "Cappuccino");
    await fireEvent.changeText(screen.getByTestId("article-price"), "4,50");
    const square = deferred<Uint8Array>();
    mockPick.mockImplementationOnce(async () => picked(square.promise));
    await pickPhoto();
    expect(await screen.findByText("Preparing the photo…")).toBeTruthy();

    await act(async () =>
      square.reject(new PickImageError("unreadable", "The image could not be made small enough"))
    );
    expect(await screen.findByText("This image cannot be used. Choose another one.")).toBeTruthy();
    expect(readLog().entries.map((entry) => entry.event)).toContain(
      "Preparing an item's photo failed"
    );
    // No photo, said so: the owner saves without one, or picks another.
    expect(screen.queryByText("Preparing the photo…")).toBeNull();
    expect(tilePhoto()).toBeNull();
    expect(screen.getByTestId("article-name")).toHaveDisplayValue("Cappuccino");
    expect(screen.getByTestId("article-save")).toBeEnabled();
    await pickPhoto();
    await waitFor(() => expect(tilePhoto()).toBe(imageUri(PHOTO)));
    expect(screen.queryByText(/This image cannot be used/)).toBeNull();
  });

  it("takes no photo into another form once its own was closed while it was prepared", async () => {
    await ownerDevice();
    await open();
    await fireEvent.press(await screen.findByTestId("add-article"));
    expect(await screen.findByTestId("article-sheet")).toBeTruthy();
    const square = deferred<Uint8Array>();
    mockPick.mockImplementationOnce(async () => picked(square.promise));
    await pickPhoto();
    expect(await screen.findByText("Preparing the photo…")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));

    await fireEvent.press(screen.getByTestId("add-article"));
    expect(await screen.findByTestId("article-sheet")).toBeTruthy();
    await act(async () => square.resolve(PHOTO));
    expect(tilePhoto()).toBeNull();
    expect(screen.queryByText("Preparing the photo…")).toBeNull();
    expect(screen.getByRole("button", { name: "Add a photo" })).toBeEnabled();
  });

  it("saves nothing while Open Food Facts is asked", async () => {
    await ownerDevice();
    const answer = deferred<Response>();
    jest.spyOn(globalThis, "fetch").mockImplementation(() => answer.promise);
    await open();
    await fireEvent.press(await screen.findByTestId("add-article"));
    await fireEvent.changeText(await screen.findByTestId("article-name"), "Tartlet");
    await fireEvent.press(screen.getByTestId("article-scan"));
    await act(async () => camera.scan("7610097111072"));
    await fireEvent.changeText(await screen.findByTestId("article-price"), "4,20");
    // Name and price there, but what Open Food Facts fills would be lost.
    expect(screen.getByTestId("article-save")).toBeDisabled();

    await act(async () =>
      answer.resolve({ status: 404, ok: false, json: async () => ({}) } as Response)
    );
    expect(await screen.findByText("Product not found")).toBeTruthy();
    expect(screen.getByTestId("article-save")).toBeEnabled();
  });

  it("beeps from its start at each barcode read; a beep that cannot play stops nothing", async () => {
    await ownerDevice();
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        async () => ({ status: 404, ok: false, json: async () => ({}) }) as Response
      );
    // fetch is a mock function already (jest.setup.ts): spyOn gives it with earlier tests' calls.
    fetchSpy.mockClear();
    await open();
    await fireEvent.press(await screen.findByTestId("add-article"));
    for (const barcode of ["7610097111072", "7610097111089"]) {
      await fireEvent.press(await screen.findByTestId("article-scan"));
      await act(async () => camera.scan(barcode));
      expect(await screen.findByTestId("article-sheet")).toBeTruthy();
    }
    expect(audio.plays().map(({ from }) => from)).toEqual([0, 0]);

    audio.breakAudio();
    await fireEvent.press(await screen.findByTestId("article-scan"));
    await act(async () => camera.scan("7610097111096"));
    expect(await screen.findByTestId("article-sheet")).toBeTruthy();
    // Open Food Facts asked for each of the three.
    const lookups = fetchSpy.mock.calls.filter(([url]) => String(url).includes("/api/v3/product/"));
    expect(lookups).toHaveLength(3);
    expect(audio.plays()).toHaveLength(2);
  });

  it("fills nothing once the form was closed before Open Food Facts answered", async () => {
    await ownerDevice();
    const answer = deferred<Response>();
    jest.spyOn(globalThis, "fetch").mockImplementation(() => answer.promise);
    await open();
    await fireEvent.press(await screen.findByTestId("add-article"));
    await fireEvent.press(await screen.findByTestId("article-scan"));
    await act(async () => camera.scan("7610097111072"));
    expect(await screen.findByTestId("article-name-searching", hidden)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));

    await fireEvent.press(screen.getByTestId("add-article"));
    await act(async () => answer.resolve(rivellaAnswer()));
    expect(await screen.findByTestId("article-name")).toHaveDisplayValue("");
    expect(screen.queryByTestId("article-name-searching", hidden)).toBeNull();
    expect(screen.queryByTestId("article-photo-searching", hidden)).toBeNull();
    expect(screen.queryByTestId("article-barcode")).toBeNull();
    expect(mockProductPhoto).not.toHaveBeenCalled();
  });

  it("keeps the barcode of a product Open Food Facts does not know, or cannot tell", async () => {
    // Saved without its barcode, such an article would be "unknown" at the point of sale's scan.
    await ownerDevice();
    const answers = [
      { status: 404, ok: false, json: async () => ({}) },
      { status: 503, ok: false, json: async () => ({}) }
    ] as Response[];
    jest.spyOn(globalThis, "fetch").mockImplementation(async () => answers.shift()!);
    await open();
    for (const [barcode, name] of [
      ["7610097111072", "Tartlet"],
      ["7610097111089", "Muffin"]
    ] as const) {
      await fireEvent.press(await screen.findByTestId("add-article"));
      await fireEvent.press(await screen.findByTestId("article-scan"));
      await act(async () => camera.scan(barcode));
      await waitFor(() => expect(screen.getByTestId("article-name")).toBeEnabled());
      // The code stays in the form; Open Food Facts filled nothing, so it is not named.
      expect(within(screen.getByTestId("article-barcode")).getByText(barcode)).toBeTruthy();
      expect(screen.queryByText("· from Open Food Facts")).toBeNull();
      await fireEvent.changeText(screen.getByTestId("article-name"), name);
      await fireEvent.changeText(screen.getByTestId("article-price"), "4,20");
      await fireEvent.press(screen.getByTestId("article-save"));
      await waitFor(async () =>
        expect((await storedArticles()).find((article) => article.name === name)).toMatchObject({
          barcode
        })
      );
    }
  });

  it("gives the point of sale an article added at once: its scan finds it, before any new read", async () => {
    await ownerDevice();
    await seedArticle("Rivella Red 50 cl", 350, "CHF", "7610097111072");
    jest
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        async () => ({ status: 404, ok: false, json: async () => ({}) }) as Response
      );
    await renderRouter(routes, { initialUrl: "/pos" });
    // The point of sale read its catalogue: its article shows in "Items".
    await fireEvent.press(await screen.findByTestId("pos-mode-articles"));
    expect(await screen.findByText("Rivella Red 50 cl")).toBeTruthy();

    await act(() => router.push("/articles"));
    await fireEvent.press(await screen.findByTestId("add-article"));
    await fireEvent.press(await screen.findByTestId("article-scan"));
    await act(async () => camera.scan("7613035974685"));
    await waitFor(() => expect(screen.getByTestId("article-name")).toBeEnabled());
    await fireEvent.changeText(screen.getByTestId("article-name"), "Iced tea");
    await fireEvent.changeText(screen.getByTestId("article-price"), "4,50");
    await fireEvent.press(screen.getByTestId("article-save"));
    expect(await screen.findByText("Item saved")).toBeTruthy();

    // No relay answers any more: only what this device saved can tell the article.
    for (const relay of DEFAULT_RELAYS) relays.unreachable.add(relay);
    await act(() => router.push("/pos"));
    await fireEvent.press(await screen.findByTestId("pos-mode-scan"));
    await act(async () => camera.scan("7613035974685"));
    expect(within(screen.getByTestId("scan-card")).getByText("Iced tea")).toBeTruthy();
  });

  it("goes back to the form when the product is unknown", async () => {
    await ownerDevice();
    jest
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        async () => ({ status: 404, ok: false, json: async () => ({}) }) as Response
      );
    await open();
    await fireEvent.press(await screen.findByTestId("add-article"));
    await fireEvent.changeText(await screen.findByTestId("article-name"), "Tartlet");
    await fireEvent.press(screen.getByTestId("article-scan"));
    await act(async () => camera.scan("7610097111072"));
    expect(await screen.findByText("Product not found")).toBeTruthy();
    // What was typed stays.
    expect(await screen.findByTestId("article-name")).toHaveDisplayValue("Tartlet");
    expect(mockProductPhoto).not.toHaveBeenCalled();
  });

  it.each([
    ["is unknown", 404, "Product not found"],
    ["cannot be looked up", 503, "Product lookup failed"]
  ])(
    "moves the cursor from the price to the name when the product %s",
    async (_, status, title) => {
      await ownerDevice();
      const answer = deferred<Response>();
      jest.spyOn(globalThis, "fetch").mockImplementation(() => answer.promise);
      const focus = focusSpy();
      await open();
      await fireEvent.press(await screen.findByTestId("add-article"));
      await fireEvent.press(await screen.findByTestId("article-scan"));
      await act(async () => camera.scan("7610097111072"));
      // The form shown again (its Modal's onShow): the cursor on the price, the name awaited.
      await fireEvent(await screen.findByTestId("article-sheet"), "show");
      expect(focusedFields(focus)).toEqual(["article-price"]);
      expect(keyboardFields()).toEqual(["article-price"]);

      await act(async () =>
        answer.resolve({ status, ok: false, json: async () => ({}) } as Response)
      );
      expect(await screen.findByText(title)).toBeTruthy();
      expect(focusedFields(focus)).toEqual(["article-price", "article-name"]);
      expect(keyboardFields()).toEqual(["article-price", "article-name"]);
    }
  );

  it("opens the price's keyboard once the form shows again after a scan, the product found", async () => {
    // Android: the price would have its cursor, not its keyboard. The form's Modal
    // takes the window's focus only after its onShow, the scanner's Modal closing meanwhile: the
    // keyboard is asked for again for when it does (src/components/ui/soft-keyboard.ts).
    await ownerDevice();
    const answer = deferred<Response>();
    jest.spyOn(globalThis, "fetch").mockImplementation(() => answer.promise);
    const focus = focusSpy();
    await open();
    await fireEvent.press(await screen.findByTestId("add-article"));
    await fireEvent(await screen.findByTestId("article-sheet"), "show");
    expect(keyboardFields()).toEqual(["article-name"]);
    await fireEvent.press(screen.getByTestId("article-scan"));
    focus.mockClear();
    await act(async () => camera.scan("7610097111072"));
    await fireEvent(await screen.findByTestId("article-sheet"), "show");
    expect(focusedFields(focus)).toEqual(["article-price"]);
    expect(keyboardFields()).toEqual(["article-name", "article-price"]);

    // The name filled by Open Food Facts: the cursor and the keyboard stay on the price.
    await act(async () => answer.resolve(rivellaAnswer()));
    await waitFor(() =>
      expect(screen.getByTestId("article-name")).toHaveDisplayValue("Rivella Red 50 cl")
    );
    expect(focusedFields(focus)).toEqual(["article-price"]);
    expect(keyboardFields()).toEqual(["article-name", "article-price"]);
  });

  it("focuses the description opened, and the price over it after a scan", async () => {
    // The description, open before the scan, must not take the cursor and the keyboard from the
    // price as the form shows again.
    await ownerDevice();
    jest.spyOn(globalThis, "fetch").mockImplementation(async () => rivellaAnswer());
    const focus = focusSpy();
    await open();
    await fireEvent.press(await screen.findByTestId("add-article"));
    await fireEvent(await screen.findByTestId("article-sheet"), "show");
    await fireEvent.press(screen.getByTestId("article-add-description"));
    expect(focusedFields(focus)).toEqual(["article-name", "article-description"]);
    expect(keyboardFields()).toEqual(["article-name", "article-description"]);
    await fireEvent.changeText(screen.getByTestId("article-description"), "Nicely chilled");

    await fireEvent.press(screen.getByTestId("article-scan"));
    focus.mockClear();
    await act(async () => camera.scan("7610097111072"));
    await fireEvent(await screen.findByTestId("article-sheet"), "show");
    await waitFor(() =>
      expect(screen.getByTestId("article-name")).toHaveDisplayValue("Rivella Red 50 cl")
    );
    expect(screen.getByTestId("article-description")).toHaveDisplayValue("Nicely chilled");
    expect(focusedFields(focus)).toEqual(["article-price"]);
    expect(keyboardFields()).toEqual(["article-name", "article-description", "article-price"]);
  });

  it("leaves the cursor on the price when a name was typed before the scan", async () => {
    await ownerDevice();
    jest
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        async () => ({ status: 404, ok: false, json: async () => ({}) }) as Response
      );
    const focus = focusSpy();
    await open();
    await fireEvent.press(await screen.findByTestId("add-article"));
    await fireEvent.changeText(await screen.findByTestId("article-name"), "Tartlet");
    await fireEvent.press(screen.getByTestId("article-scan"));
    focus.mockClear();
    await act(async () => camera.scan("7610097111072"));
    await fireEvent(await screen.findByTestId("article-sheet"), "show");
    expect(await screen.findByText("Product not found")).toBeTruthy();
    expect(focusedFields(focus)).toEqual(["article-price"]);
  });

  it("leaves the cursor in the price being typed when the product is unknown", async () => {
    await ownerDevice();
    const answer = deferred<Response>();
    jest.spyOn(globalThis, "fetch").mockImplementation(() => answer.promise);
    const focus = focusSpy();
    await open();
    await fireEvent.press(await screen.findByTestId("add-article"));
    await fireEvent.press(await screen.findByTestId("article-scan"));
    await act(async () => camera.scan("7610097111072"));
    await fireEvent(await screen.findByTestId("article-sheet"), "show");
    // The price typed while Open Food Facts is asked (no switch).
    await fireEvent.changeText(screen.getByTestId("article-price"), "3,5");

    await act(async () =>
      answer.resolve({ status: 404, ok: false, json: async () => ({}) } as Response)
    );
    expect(await screen.findByText("Product not found")).toBeTruthy();
    expect(focusedFields(focus)).toEqual(["article-price"]);
    expect(screen.getByTestId("article-name")).toBeEnabled();
  });

  it("moves the cursor to the name when the product found has a photo but no name", async () => {
    await ownerDevice();
    const answer = deferred<Response>();
    jest.spyOn(globalThis, "fetch").mockImplementation(() => answer.promise);
    const focus = focusSpy();
    await open();
    await fireEvent.press(await screen.findByTestId("add-article"));
    await fireEvent.press(await screen.findByTestId("article-scan"));
    await act(async () => camera.scan("7610097111072"));
    await fireEvent(await screen.findByTestId("article-sheet"), "show");
    expect(focusedFields(focus)).toEqual(["article-price"]);

    const named = rivellaAnswer();
    const body = (await named.json()) as { product: Record<string, unknown> };
    delete body.product.product_name;
    await act(async () => answer.resolve({ ...named, json: async () => body } as Response));
    await waitFor(() => expect(screen.queryByTestId("article-photo-searching", hidden)).toBeNull());
    expect(focusedFields(focus)).toEqual(["article-price", "article-name"]);
    expect(screen.getByTestId("article-name")).toHaveDisplayValue("");
    expect(tilePhoto()).toBe(imageUri(SCANNED_PHOTO));
  });
});

describe("Items, changing and removing", () => {
  it("opens an article to change it: its fields filled, its own currency kept", async () => {
    await ownerDevice();
    // Priced in euros before the display currency became the franc: never reinterpreted.
    const espresso = await seedArticle("Espresso", 360, "EUR");
    await open();
    await fireEvent.press(await screen.findByTestId(`article-${espresso.id}`));

    expect(await screen.findByText("Edit the item")).toBeTruthy();
    expect(screen.getByTestId("article-name")).toHaveDisplayValue("Espresso");
    expect(screen.getByTestId("article-price")).toHaveDisplayValue(/^3[.,]60$/);
    expect(screen.getByText("EUR")).toBeTruthy();
    // Nothing changed yet: the same price written otherwise neither.
    expect(screen.getByTestId("article-save")).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId("article-price"), "3,6");
    expect(screen.getByTestId("article-save")).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId("article-name"), "Double espresso");
    expect(screen.getByTestId("article-save")).toBeEnabled();
    await fireEvent.changeText(screen.getByTestId("article-price"), "3,80");
    await fireEvent.press(screen.getByTestId("article-save"));

    expect(await screen.findByText("Item updated")).toBeTruthy();
    const [saved] = await storedArticles();
    expect(saved).toMatchObject({
      id: espresso.id,
      name: "Double espresso",
      price: { minor: 380, digits: 2, currency: "EUR" },
      createdAt: espresso.createdAt
    });
    expect(saved!.updatedAt).toBeGreaterThan(espresso.updatedAt);
    expect(await screen.findByTestId(`article-${espresso.id}`)).toHaveTextContent(
      /Double espresso.*3[.,]80 EUR/
    );
  });

  // The article is sealed with the catalogue's key of now, which a removal made on another of the
  // owner's devices changes; "Save" waits for the relays to tell it.
  it("keeps Save loading until the relays told the team's roster, added or changed", async () => {
    await ownerDevice();
    const espresso = await seedArticle("Espresso", 360);
    await open();
    await screen.findByTestId(`article-${espresso.id}`);
    const roster = deriveRosterKeys(getAccountTeamKeys()!).nostr.publicKey;
    // The roster's reads held until released.
    let release = () => undefined as void;
    const query = relays.queryEvents;
    jest.spyOn(relays, "queryEvents").mockImplementation(async (url, filter, options) => {
      if (filter.authors?.includes(roster)) {
        await new Promise<void>((resolve) => {
          const before = release;
          release = () => {
            before();
            resolve();
          };
        });
      }
      return query(url, filter, options);
    });
    const save = () => screen.getByTestId("article-save");

    await fireEvent.press(screen.getByTestId("add-article"));
    await fireEvent.changeText(await screen.findByTestId("article-name"), "Croissant");
    await fireEvent.changeText(screen.getByTestId("article-price"), "2,6");
    expect(save().props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    // A spinner in place of its label, which stays as it was.
    expect(within(save()).getByText("Save the item")).toBeTruthy();
    expect(
      screen.getByTestId("article-save-spinner", { includeHiddenElements: true })
    ).toBeTruthy();
    await fireEvent.press(save());
    expect(screen.queryByText("Item saved")).toBeNull();
    await act(async () => release());
    await waitFor(() => expect(save().props.accessibilityState.busy).toBe(false));
    await fireEvent.press(save());
    expect(await screen.findByText("Item saved")).toBeTruthy();

    // An article opened to change it: the same.
    await fireEvent.press(await screen.findByTestId(`article-${espresso.id}`));
    await fireEvent.changeText(await screen.findByTestId("article-name"), "Double espresso");
    expect(save().props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    await act(async () => release());
    await waitFor(() => expect(save().props.accessibilityState.busy).toBe(false));
    await fireEvent.press(save());
    expect(await screen.findByText("Item updated")).toBeTruthy();
    expect((await storedArticles()).map(({ name }) => name).sort()).toEqual([
      "Croissant",
      "Double espresso"
    ]);
  });

  it("saves nothing while no majority of the relays told the team's roster", async () => {
    await ownerDevice();
    await open();
    expect(await screen.findByTestId("articles-empty")).toBeTruthy();
    for (const relay of DEFAULT_RELAYS.slice(2)) relays.unreachable.add(relay);
    await fireEvent.press(screen.getByTestId("add-article"));
    await fireEvent.changeText(await screen.findByTestId("article-name"), "Croissant");
    await fireEvent.changeText(screen.getByTestId("article-price"), "2,6");
    await waitFor(() => expect(screen.getByTestId("article-save")).toBeEnabled());
    await fireEvent.press(screen.getByTestId("article-save"));
    expect(await screen.findByText("Item not saved")).toBeTruthy();
    expect(screen.getByTestId("article-sheet")).toBeTruthy();
    relays.unreachable.clear();
    expect(await storedArticles()).toEqual([]);
    // The roster read again meanwhile: the next "Save" saves it.
    await waitFor(() => expect(screen.getByTestId("article-save")).toBeEnabled());
    await fireEvent.press(screen.getByTestId("article-save"));
    expect(await screen.findByText("Item saved")).toBeTruthy();
  });

  it("keeps the photo of an article changed when a known product is scanned", async () => {
    await ownerDevice();
    jest.spyOn(globalThis, "fetch").mockImplementation(async () => rivellaAnswer());
    await open();
    // An article with its photo (the photo library's).
    await fireEvent.press(await screen.findByTestId("add-article"));
    expect(await screen.findByTestId("article-sheet")).toBeTruthy();
    await pickPhoto();
    await fireEvent.changeText(await screen.findByTestId("article-name"), "Rivella");
    await fireEvent.changeText(screen.getByTestId("article-price"), "3,50");
    await waitFor(() => expect(tilePhoto()).toBe(imageUri(PHOTO)));
    await fireEvent.press(screen.getByTestId("article-save"));
    expect(await screen.findByText("Item saved")).toBeTruthy();
    const [added] = await storedArticles();
    expect(added?.image).not.toBeNull();

    await fireEvent.press(screen.getByTestId(`article-${added!.id}`));
    expect(await screen.findByText("Edit the item")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("article-scan"));
    await act(async () => camera.scan("7610097111072"));
    // Not awaited, never downloaded: the article's photo stays.
    expect(screen.queryByTestId("article-photo-searching", hidden)).toBeNull();
    await waitFor(() =>
      expect(screen.getByTestId("article-name")).toHaveDisplayValue("Rivella Red 50 cl")
    );
    expect(mockProductPhoto).not.toHaveBeenCalled();
    expect(tilePhoto()).toBe(imageUri(PHOTO));

    await fireEvent.press(screen.getByTestId("article-save"));
    expect(await screen.findByText("Item updated")).toBeTruthy();
    const [changed] = await storedArticles();
    expect(changed).toMatchObject({ name: "Rivella Red 50 cl", barcode: "7610097111072" });
    expect(changed?.image).toEqual(added?.image);
  });

  it('removes an article once confirmed, and keeps it on "Back"', async () => {
    await ownerDevice();
    const espresso = await seedArticle("Espresso", 360);
    const croissant = await seedArticle("Butter croissant", 190);
    await open();

    await fireEvent.press(await screen.findByTestId(`article-${espresso.id}`));
    await fireEvent.press(await screen.findByTestId("article-remove"));
    expect(await screen.findByText("Delete Espresso?")).toBeTruthy();
    await fireEvent.press(screen.getByText("Back"));
    await waitFor(() => expect(screen.queryByText("Delete Espresso?")).toBeNull());
    expect(await storedArticles()).toHaveLength(2);

    await fireEvent.press(screen.getByTestId(`article-${espresso.id}`));
    await fireEvent.press(await screen.findByTestId("article-remove"));
    await fireEvent.press(await screen.findByTestId("confirm-remove-article"));
    expect(await screen.findByText("Item deleted")).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId(`article-${espresso.id}`)).toBeNull());
    expect((await storedArticles()).map(({ id }) => id)).toEqual([croissant.id]);
  });

  it("keeps an article no relay could remove", async () => {
    await ownerDevice();
    const espresso = await seedArticle("Espresso", 360);
    await open();
    await fireEvent.press(await screen.findByTestId(`article-${espresso.id}`));
    await fireEvent.press(await screen.findByTestId("article-remove"));
    for (const relay of DEFAULT_RELAYS) relays.readOnly.add(relay);
    await fireEvent.press(await screen.findByTestId("confirm-remove-article"));
    expect(await screen.findByText("Item not deleted")).toBeTruthy();
    expect(screen.getByTestId(`article-${espresso.id}`)).toBeTruthy();
  });

  it('changes an article from its card on desktop, "Delete the item" in the dialog', async () => {
    mockDesktop.mockReturnValue(true);
    await ownerDevice();
    const pie = await seedArticle("Apple pie", 450);
    await open();
    await fireEvent.press(await screen.findByTestId(`article-${pie.id}`));
    expect(await screen.findByText("Edit the item")).toBeTruthy();
    expect(screen.getByTestId("article-remove")).toBeTruthy();
    expect(screen.getByTestId("article-save")).toBeDisabled();
    await fireEvent.press(screen.getByTestId("article-add-description"));
    // An empty description opened changes nothing.
    expect(screen.getByTestId("article-save")).toBeDisabled();
    await fireEvent.changeText(
      screen.getByTestId("article-description"),
      "Valais apples on shortcrust pastry, sold by the slice."
    );
    await fireEvent.press(screen.getByTestId("article-save"));
    expect(await screen.findByText("Item updated")).toBeTruthy();
    const [saved] = await storedArticles();
    expect(saved?.description).toBe("Valais apples on shortcrust pastry, sold by the slice.");
  });
});

describe("Items, desktop", () => {
  it("adds an article in a centred dialog, without a scan", async () => {
    mockDesktop.mockReturnValue(true);
    await ownerDevice();
    await open();
    // Its guide promises no scan where the form has none.
    const guide = await screen.findByTestId("articles-empty");
    expect(
      within(guide).getByLabelText("1. Create your items, A name, a price, a photo.")
    ).toBeTruthy();
    // The till's scan said everywhere, as the phone's: the till may be another device.
    expect(
      within(guide).getByLabelText(
        "2. Tap them at the point of sale, Switch to “Items”: each tap adds the item to the basket. In the app on a phone, you can also scan their barcode."
      )
    ).toBeTruthy();
    await fireEvent.press(await screen.findByTestId("add-article"));
    expect(await screen.findByText("Drop a photo here")).toBeTruthy();
    // A dialog in the middle of the window, not a panel of its height.
    const panel = StyleSheet.flatten(screen.getByTestId("article-sheet").props.style);
    expect(panel).toMatchObject({ maxWidth: 560, maxHeight: 640 });
    expect(panel.height).toBeUndefined();
    expect(screen.queryByTestId("article-scan")).toBeNull();
    await fireEvent.changeText(screen.getByTestId("article-name"), "Butter croissant");
    await fireEvent.changeText(screen.getByTestId("article-price"), "1.90");
    await fireEvent.press(screen.getByTestId("article-save"));
    expect(await screen.findByText("Item saved")).toBeTruthy();
    const [saved] = await storedArticles();
    expect(saved).toMatchObject({
      name: "Butter croissant",
      price: { minor: 190 },
      image: null
    });
  });

  it("waits for the photo chosen in the web app's file picker before saving", async () => {
    mockDesktop.mockReturnValue(true);
    jest.replaceProperty(Platform, "OS", "web");
    await ownerDevice();
    await open();
    await fireEvent.press(await screen.findByTestId("add-article"));
    expect(await screen.findByText("Drop a photo here")).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId("article-name"), "Butter croissant");
    await fireEvent.changeText(screen.getByTestId("article-price"), "1.90");
    const square = deferred<Uint8Array>();
    mockPick.mockImplementationOnce(async () => picked(square.promise));
    await fireEvent.press(screen.getByTestId("article-photo"));
    expect(mockPick).toHaveBeenCalledWith("article", undefined);

    // In the zone, in words; "Save the item" waits.
    expect(await screen.findByText("Preparing the photo…")).toBeTruthy();
    expect(screen.getByTestId("article-photo-preparing", hidden)).toBeTruthy();
    expect(screen.queryByText("Drop a photo here")).toBeNull();
    expect(screen.getByTestId("article-photo")).toBeDisabled();
    expect(screen.getByTestId("article-save")).toBeDisabled();

    await act(async () => square.resolve(PHOTO));
    await waitFor(() => expect(tilePhoto()).toBe(imageUri(PHOTO)));
    expect(screen.getByTestId("article-save")).toBeEnabled();
    await fireEvent.press(screen.getByTestId("article-save"));
    expect(await screen.findByText("Item saved")).toBeTruthy();
    const [saved] = await storedArticles();
    expect(saved).toMatchObject({ name: "Butter croissant", price: { minor: 190 } });
    expect(saved?.image).not.toBeNull();
  });

  it("loads no beep where nothing scans", async () => {
    mockDesktop.mockReturnValue(true);
    await ownerDevice();
    await open();
    await fireEvent.press(await screen.findByTestId("add-article"));
    expect(await screen.findByTestId("article-sheet")).toBeTruthy();
    expect(audio.playerCount()).toBe(0);
  });
});
