import "@/i18n";

import { hexToBytes } from "@noble/hashes/utils.js";
import { act, fireEvent, renderRouter, screen, waitFor, within } from "expo-router/testing-library";
import { Dimensions, Platform, StyleSheet } from "react-native";

import AppLayout from "@/app/(app)/_layout";
import CardsLayout from "@/app/(app)/cards/_layout";
import CardsRoute from "@/app/(app)/cards/index";
import LaunchScreen from "@/app/index";
import { DEFAULT_CARD_RELAY_HOST } from "@/config/card";
import { closeAccount, getAccountBackupKey, getAccountSettings } from "@/features/account/session";
import { resetCardPayments } from "@/features/card/payments";
import { recordCardState, resetCardStates, withCardAccess } from "@/features/card/states";
import { resetChannelSyncs } from "@/features/card/sync";
import { lockTerminal } from "@/features/navigation/lock";
import { resetTerminalProfileCache } from "@/features/terminal/profile-cache";
import { cardOrderEvent, cardOrderFilter, cardOrderOf } from "@/lib/card/card-order";
import { forgetDeviceKey } from "@/lib/card/device-key";
import { cardIdOf } from "@/lib/card/keys";
import { publishToRelays, queryRelays } from "@/lib/nostr/pool";
import { currentRelays } from "@/lib/relays/current";
import type { SavedTerminalProfile } from "@/lib/terminal/model";
import { saveTerminalProfile } from "@/lib/terminal/profile";
import { gutter } from "@/theme";

import { TEST_WALLET_ID, openTestAccount, testSeed } from "../../jest/account";
import { addRelay } from "../../jest/card-relay";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as NfcFake from "../../jest/nfc-manager";
import type * as RelaysFake from "../../jest/nostr-relays";
import { signInWithPasskey } from "@/lib/breez/passkey";

// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are synchronous
jest.mock("react-native-nfc-manager", () => require("../../jest/nfc-manager"));
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: { breezNetwork: "mainnet", eas: { projectId: "00000000-0000-4000-8000-000000000000" } }
    }
  }
}));
jest.mock("../lib/breez/passkey", () => ({
  createPasskeyWallet: jest.fn(),
  preparePasskeys: jest.fn(async () => undefined),
  passkeysReady: jest.fn(() => true),
  signInWithPasskey: jest.fn()
}));
const mockDesktop = jest.fn(() => false);
jest.mock("@/components/layout/useIsDesktop", () => ({
  ...jest.requireActual("@/components/layout/useIsDesktop"),
  useIsDesktop: () => mockDesktop()
}));

const nfc = jest.requireMock<typeof NfcFake>("react-native-nfc-manager");
const nostr = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");
const signIn = jest.mocked(signInWithPasskey);

const routes = {
  index: LaunchScreen,
  "(app)/_layout": AppLayout,
  "(app)/cards/_layout": CardsLayout,
  "(app)/cards/index": CardsRoute
};
/** The cards' screens read the relays and the cards' wallets: more than findBy's default second. */
const SLOW = { timeout: 8000 };

const PHONE_WINDOW = { window: Dimensions.get("window"), screen: Dimensions.get("screen") };

/** The owner's device, unlocked, prepared as a card holder's: a card holder's sign-up done. */
async function ownerDevice() {
  await openTestAccount({ usage: "card", signUp: "done" });
  const profile: SavedTerminalProfile = {
    version: 4,
    walletId: TEST_WALLET_ID,
    backupKey: getAccountBackupKey()!,
    businessName: getAccountSettings()?.businessName ?? "",
    currency: "CHF"
  };
  await saveTerminalProfile(profile);
  resetTerminalProfileCache();
}

/** A card in service named `name`, as its pairing records it; resolves with its id. */
async function activeCard(uid: string, name: string): Promise<string> {
  return withCardAccess(async (access) => {
    const cardId = cardIdOf(access.root, hexToBytes(uid));
    await recordCardState(access, {
      cardId,
      uid,
      keyVersion: 1,
      status: "active",
      relayHost: DEFAULT_CARD_RELAY_HOST,
      lastCounter: 0,
      depositedThrough: 0,
      maxPaymentSats: 20_000n,
      maxDaySats: 50_000n,
      maxPaymentsPerHour: 5,
      suspended: false,
      name,
      look: null,
      issuer: null,
      settingsAt: Date.now(),
      walletGeneration: 1
    });
    return cardId;
  });
}

/** The order a majority of the relays hold, as another device reads it. */
async function orderOnRelays() {
  return withCardAccess(async ({ keys }) =>
    cardOrderOf(
      keys,
      await queryRelays(cardOrderFilter(keys), {
        relays: currentRelays(),
        channel: "account",
        timeoutMs: 1_000
      })
    )
  );
}

/** The cards' ids in the order the carousel (or the desktop's row) shows them. */
function slots(): string[] {
  return screen
    .getAllByTestId(/^card-slot-/)
    .map((slot) => (slot.props.testID as string).replace("card-slot-", ""))
    .filter((id) => id !== "add");
}

async function open() {
  await renderRouter(routes, { initialUrl: "/cards" });
  await screen.findByTestId("cards-screen", {}, SLOW);
}

/** Three cards of the account, "A", "B" and "C". */
async function threeCards() {
  byName = {
    A: await activeCard("04000000000001", "A"),
    B: await activeCard("04000000000002", "B"),
    C: await activeCard("04000000000003", "C")
  };
  byId = Object.values(byName).sort();
}

/** The account's cards (threeCards). */
let byName: Record<"A" | "B" | "C", string>;
/** The cards' ids as "Cards" shows them without an order: by id. */
let byId: string[];

jest.setTimeout(30_000);

beforeEach(async () => {
  closeAccount();
  process.env.EXPO_PUBLIC_BREEZ_API_KEY = "test-api-key";
  signIn.mockReset().mockResolvedValue({ seed: testSeed(), credentialId: null });
  nostr.resetRelays();
  fileSystem.resetFileSystem();
  nfc.resetNfcManager();
  resetCardStates();
  resetChannelSyncs();
  resetCardPayments();
  forgetDeviceKey();
  mockDesktop.mockReturnValue(false);
  addRelay(DEFAULT_CARD_RELAY_HOST);
  await ownerDevice();
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(async () => {
  resetCardPayments();
  await lockTerminal();
  await act(async () => Dimensions.set(PHONE_WINDOW));
  jest.restoreAllMocks();
});

describe('"Organise" on a phone', () => {
  it("is offered from two cards only", async () => {
    await activeCard("04000000000009", "Only");
    await open();
    await screen.findAllByTestId(/^card-slot-/, {}, SLOW);
    expect(screen.queryByTestId("cards-organize")).toBeNull();
  });

  it("orders the cards in its panel, a screen reader's actions included, then saves them for every device", async () => {
    await threeCards();
    await open();
    await waitFor(() => expect(slots()).toEqual(byId), SLOW);
    const organize = await screen.findByTestId("cards-organize", {}, SLOW);
    expect(organize).toHaveProp("accessibilityLabel", "Organise cards");
    // A card holder's phone has no dock: "Organise" on the header's left, the merchant map then
    // "Settings" on its right.
    expect(screen.queryByTestId("dock")).toBeNull();
    const header = screen.getAllByRole("button").map((button) => button.props.testID as string);
    expect(header.slice(0, 3)).toEqual(["cards-organize", "cards-merchant-map", "header-settings"]);
    await fireEvent.press(organize);
    const panel = within(await screen.findByTestId("card-order-sheet", {}, SLOW));
    expect(panel.getByText("Card order")).toBeTruthy();

    // The first row: "Move down" only; the last: "Move up" only.
    const [first, , last] = byId;
    const firstRow = panel.getByTestId(`card-order-row-${first}`);
    expect(firstRow.props.accessibilityActions).toEqual([{ name: "moveDown", label: "Move down" }]);
    expect(panel.getByTestId(`card-order-row-${last}`).props.accessibilityActions).toEqual([
      { name: "moveUp", label: "Move up" }
    ]);
    // The last card up twice: first.
    await fireEvent(panel.getByTestId(`card-order-row-${last}`), "accessibilityAction", {
      nativeEvent: { actionName: "moveUp" }
    });
    await fireEvent(panel.getByTestId(`card-order-row-${last}`), "accessibilityAction", {
      nativeEvent: { actionName: "moveUp" }
    });
    const label = (id: string) =>
      panel.getByTestId(`card-order-row-${id}`).props.accessibilityLabel as string;
    const nameOf = (id: string) => Object.entries(byName).find(([, value]) => value === id)![0];
    expect(label(last!)).toBe(`${nameOf(last!)}, 1 of 3`);
    expect(label(first!)).toBe(`${nameOf(first!)}, 2 of 3`);

    await fireEvent.press(panel.getByTestId("card-order-save"));
    expect(await screen.findByText("Card order saved", {}, SLOW)).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId("card-order-sheet")).toBeNull(), SLOW);
    const ordered = [last!, first!, byId[1]!];
    await waitFor(() => expect(slots()).toEqual(ordered), SLOW);
    expect((await orderOnRelays()).order?.cards).toEqual(
      ordered.map((cardId) => ({ cardId, walletGeneration: 1 }))
    );
  });

  it("moves a row dragged by its handle, the others making room", async () => {
    await threeCards();
    await open();
    await fireEvent.press(await screen.findByTestId("cards-organize", {}, SLOW));
    const panel = within(await screen.findByTestId("card-order-sheet", {}, SLOW));
    const [first, second, third] = byId;
    const grip = panel.getByTestId(`card-order-grip-${first}`);
    // The list takes the panel's padding, its rows take it back: a row taken (wider, its shadow
    // around it) is never clipped by the scroll (Android).
    const inset = StyleSheet.flatten(panel.getByTestId("card-order-bleed").props.style);
    expect(inset.marginHorizontal).toBe(-gutter);
    const content = StyleSheet.flatten(
      panel.getByTestId("card-order-list-scroll").props.contentContainerStyle
    );
    expect(content.paddingHorizontal).toBe(gutter);
    // Taken, then down past the next row's middle (60 pt each), then let go.
    await fireEvent(grip, "responderGrant", { nativeEvent: { pageY: 300 } });
    // Taken, its shadow is the layer under it, faded in by the track (sortable-track.test.tsx):
    // never the row's own, which would show at once.
    const layer = panel.getByTestId(`card-order-row-shadow-${first}`);
    expect(StyleSheet.flatten(layer.props.style).boxShadow).toBeTruthy();
    expect(StyleSheet.flatten(layer.parent?.props.style).boxShadow).toBeUndefined();
    expect(StyleSheet.flatten(layer.parent?.props.style).marginHorizontal).toBe(-8);
    await fireEvent(grip, "responderMove", { nativeEvent: { pageY: 340 } });
    await fireEvent(grip, "responderRelease", { nativeEvent: { pageY: 340 } });
    const label = (id: string) =>
      panel.getByTestId(`card-order-row-${id}`).props.accessibilityLabel as string;
    await waitFor(() => expect(label(first!)).toMatch(/, 2 of 3$/));
    expect(label(second!)).toMatch(/, 1 of 3$/);
    expect(label(third!)).toMatch(/, 3 of 3$/);
    // Nothing saved yet.
    expect((await orderOnRelays()).order).toBeNull();
  });

  it("closes without writing when nothing changed", async () => {
    await threeCards();
    await open();
    await fireEvent.press(await screen.findByTestId("cards-organize", {}, SLOW));
    const panel = within(await screen.findByTestId("card-order-sheet", {}, SLOW));
    await fireEvent.press(panel.getByTestId("card-order-save"));
    await waitFor(() => expect(screen.queryByTestId("card-order-sheet")).toBeNull(), SLOW);
    expect((await orderOnRelays()).order).toBeNull();
    expect(screen.queryByText("Card order saved")).toBeNull();
  });

  it("stays open, the order kept, when the relays did not take it", async () => {
    await threeCards();
    await open();
    await fireEvent.press(await screen.findByTestId("cards-organize", {}, SLOW));
    const panel = within(await screen.findByTestId("card-order-sheet", {}, SLOW));
    const last = byId[2]!;
    await fireEvent(panel.getByTestId(`card-order-row-${last}`), "accessibilityAction", {
      nativeEvent: { actionName: "moveUp" }
    });
    for (const relay of currentRelays()) nostr.readOnly.add(relay);
    await fireEvent.press(panel.getByTestId("card-order-save"));
    expect(await screen.findByText("Order not saved", {}, SLOW)).toBeTruthy();
    expect(
      screen.getByText(
        "Your account's relays did not answer: check your connection, then try again"
      )
    ).toBeTruthy();
    expect(screen.getByTestId("card-order-sheet")).toBeTruthy();
    expect(panel.getByTestId(`card-order-row-${last}`).props.accessibilityLabel).toMatch(
      /, 2 of 3$/
    );
    expect(slots()).toEqual(byId);
  });

  it("shows the cards in the order another device saved", async () => {
    await threeCards();
    const ordered = [byName.C, byName.A, byName.B];
    await withCardAccess(async ({ keys }) => {
      await publishToRelays(
        cardOrderEvent(keys, {
          cards: ordered.map((cardId) => ({ cardId, walletGeneration: 1 })),
          updatedAt: Math.floor(Date.now() / 1000)
        }),
        {
          relays: currentRelays(),
          channel: "account",
          timeoutMs: 1_000,
          authKey: keys.nostr.secretKey
        }
      );
    });
    // This device knows nothing of it yet.
    resetCardStates();
    await open();
    await waitFor(() => expect(slots()).toEqual(ordered), SLOW);
  });
});

describe('"Organise" on a desktop', () => {
  beforeEach(async () => {
    mockDesktop.mockReturnValue(true);
    await act(async () =>
      Dimensions.set({
        window: { ...PHONE_WINDOW.window, width: 1440, height: 900 },
        screen: { ...PHONE_WINDOW.screen, width: 1440, height: 900 }
      })
    );
  });

  it("orders the row itself, then saves it from the header", async () => {
    await threeCards();
    await open();
    await waitFor(() => expect(slots()).toEqual(byId), SLOW);
    expect(screen.queryByTestId("cards-organize")).toBeNull();
    // A row ordered in place: its icon points left and right (Font Awesome arrows-left-right).
    const organize = await screen.findByTestId("cards-organize-header", {}, SLOW);
    expect(within(organize).getByText(String.fromCodePoint(0xf07e))).toBeTruthy();
    await fireEvent.press(organize);

    // The header's actions are the mode's, the rest of the page veiled, "Add" gone.
    expect(screen.getByTestId("cards-order-save-header")).toBeTruthy();
    expect(screen.getByTestId("cards-order-cancel")).toBeTruthy();
    expect(screen.queryByTestId("cards-add-header")).toBeNull();
    expect(
      screen.getByText("Drag a card to its place (or ← →). The first one shows on opening.")
    ).toBeTruthy();
    // Out of reach of screen readers, as all it covers.
    expect(screen.getByTestId("cards-order-veil", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId("card-slot-add")).toBeNull();

    const [first, second, third] = byId;
    const slot = screen.getByTestId(`card-order-slot-${first}`);
    expect(slot.props.accessibilityActions).toEqual([{ name: "moveRight", label: "Move right" }]);
    await fireEvent(slot, "accessibilityAction", { nativeEvent: { actionName: "moveRight" } });
    expect(screen.getByTestId(`card-order-slot-${first}`).props.accessibilityLabel).toMatch(
      /, 2 of 3$/
    );

    await fireEvent.press(screen.getByTestId("cards-order-save-header"));
    expect(await screen.findByText("Card order saved", {}, SLOW)).toBeTruthy();
    await waitFor(
      () =>
        expect(
          screen.queryByTestId("cards-order-veil", { includeHiddenElements: true })
        ).toBeNull(),
      SLOW
    );
    expect(screen.getByTestId("cards-add-header")).toBeTruthy();
    expect(slots()).toEqual([second, first, third]);
    expect((await orderOnRelays()).order?.cards.map(({ cardId }) => cardId)).toEqual([
      second,
      first,
      third
    ]);
  });

  it("drags a card along the row, and moves one with the arrow keys on the web", async () => {
    await threeCards();
    await open();
    const organize = await screen.findByTestId("cards-organize-header", {}, SLOW);
    await waitFor(() => expect(slots()).toEqual(byId), SLOW);
    // Not organized: no shadow drawn behind the faces.
    expect(screen.queryByTestId(`card-order-shadow-${byId[0]}`)).toBeNull();
    await fireEvent.press(organize);
    const [first, second, third] = byId;
    // Organized, each face has its shadow behind it (faded in by the track once taken).
    for (const id of byId) expect(screen.getByTestId(`card-order-shadow-${id}`)).toBeTruthy();
    // Dragged one place and a half to the right (174 px a place): after the second.
    const slot = screen.getByTestId(`card-order-slot-${first}`);
    await fireEvent(slot, "responderGrant", { nativeEvent: { pageX: 400 } });
    await fireEvent(slot, "responderMove", { nativeEvent: { pageX: 600 } });
    await fireEvent(slot, "responderRelease", { nativeEvent: { pageX: 600 } });
    const label = (id: string) =>
      screen.getByTestId(`card-order-slot-${id}`).props.accessibilityLabel as string;
    await waitFor(() => expect(label(first!)).toMatch(/, 2 of 3$/));

    // The row as the web app draws it: ← → on the card that has the focus.
    jest.replaceProperty(Platform, "OS", "web");
    await fireEvent.press(screen.getByTestId("cards-order-cancel"));
    await fireEvent.press(await screen.findByTestId("cards-organize-header"));
    const keyed = screen.getByTestId(`card-order-slot-${third}`);
    expect(keyed.props.tabIndex).toBe(0);
    const event = { nativeEvent: { key: "ArrowLeft" }, preventDefault: jest.fn() };
    await fireEvent(keyed, "keyDown", event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(label(third!)).toMatch(/, 2 of 3$/);
    expect(label(second!)).toMatch(/, 3 of 3$/);
    // Other keys (Tab to move on) are left to the browser.
    const tab = { nativeEvent: { key: "Tab" }, preventDefault: jest.fn() };
    await fireEvent(keyed, "keyDown", tab);
    expect(tab.preventDefault).not.toHaveBeenCalled();
  });

  it('drops the order chosen on "Cancel": nothing written', async () => {
    await threeCards();
    await open();
    await fireEvent.press(await screen.findByTestId("cards-organize-header", {}, SLOW));
    await fireEvent(screen.getByTestId(`card-order-slot-${byId[0]}`), "accessibilityAction", {
      nativeEvent: { actionName: "moveRight" }
    });
    await fireEvent.press(screen.getByTestId("cards-order-cancel"));
    await waitFor(() => expect(slots()).toEqual(byId), SLOW);
    expect((await orderOnRelays()).order).toBeNull();
  });

  it('leaves the mode on "Save" with the order as it was: nothing written', async () => {
    await threeCards();
    await open();
    await fireEvent.press(await screen.findByTestId("cards-organize-header", {}, SLOW));
    await fireEvent.press(screen.getByTestId("cards-order-save-header"));
    await waitFor(
      () =>
        expect(
          screen.queryByTestId("cards-order-veil", { includeHiddenElements: true })
        ).toBeNull(),
      SLOW
    );
    expect(screen.queryByText("Card order saved")).toBeNull();
    expect((await orderOnRelays()).order).toBeNull();
  });

  it("keeps the row on one line, arrows over its ends while cards are hidden there", async () => {
    await threeCards();
    await open();
    await screen.findByTestId(`card-slot-${byId[0]}`, {}, SLOW);
    const scroll = screen.getByTestId("cards-thumbnails-scroll");
    // Three cards and "Add" (4 × 174 − 18 + 2 × 38 = 754 px) in 500 px: some hidden after.
    await fireEvent(scroll, "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 500, height: 151 } }
    });
    expect(await screen.findByTestId("cards-thumbnails-next")).toBeTruthy();
    expect(screen.queryByTestId("cards-thumbnails-previous")).toBeNull();
    // Scrolled to its end: hidden before only.
    await fireEvent.scroll(scroll, {
      nativeEvent: {
        contentOffset: { x: 254, y: 0 },
        contentSize: { width: 754, height: 151 },
        layoutMeasurement: { width: 500, height: 151 }
      }
    });
    expect(await screen.findByTestId("cards-thumbnails-previous")).toBeTruthy();
    expect(screen.queryByTestId("cards-thumbnails-next")).toBeNull();
    // Wide enough for all: no arrow.
    await fireEvent(scroll, "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 1200, height: 151 } }
    });
    await fireEvent.scroll(scroll, {
      nativeEvent: {
        contentOffset: { x: 0, y: 0 },
        contentSize: { width: 754, height: 151 },
        layoutMeasurement: { width: 1200, height: 151 }
      }
    });
    await waitFor(() => expect(screen.queryByTestId("cards-thumbnails-previous")).toBeNull());
    expect(screen.queryByTestId("cards-thumbnails-next")).toBeNull();
  });
});
