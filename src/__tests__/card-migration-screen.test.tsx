import "@/i18n";

import { hexToBytes } from "@noble/hashes/utils.js";
import { fireEvent, renderRouter, screen, waitFor, within } from "expo-router/testing-library";

import CardScreen from "@/app/onboarding/card";
import OnboardingLayout from "@/app/onboarding/_layout";
import PendingScreen from "@/app/pending";
import SetupScreen from "@/app/onboarding/setup";
import { DEFAULT_CARD_RELAY_HOST, LEGACY_CARD_IMAGE_HOST } from "@/config/card";
import { closeAccount, getAccountSettings } from "@/features/account/session";
import { refreshCardStates, resetCardStates, withCardAccess } from "@/features/card/states";
import { connectWallet, disconnectWallet } from "@/lib/breez/wallet";
import { forgetDeviceKey } from "@/lib/card/device-key";
import { cardIdOf } from "@/lib/card/keys";
import { readLog } from "@/lib/log/log";
import { palette } from "@/theme";

import { fakeCardWallet } from "../../jest/breez-sdk";
import { openTestAccount, testSeed } from "../../jest/account";
import { addRelay } from "../../jest/card-relay";
import { imageFake, resetImageFake } from "../../jest/image-manipulator";
import {
  addLegacyServer,
  holdCallback,
  imageRequests,
  serveLegacyImage,
  type FakeLegacyServer
} from "../../jest/legacy-card-server";
import type * as NfcFake from "../../jest/nfc-manager";
import type * as RelaysFake from "../../jest/nostr-relays";
import { legacyNtag424 } from "../../jest/ntag424";

/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories are synchronous */
jest.mock("react-native-nfc-manager", () => require("../../jest/nfc-manager"));
jest.mock("expo-image-manipulator", () => require("../../jest/image-manipulator"));
/* eslint-enable @typescript-eslint/no-require-imports */
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: { breezNetwork: "mainnet", eas: { projectId: "00000000-0000-4000-8000-000000000000" } }
    }
  }
}));

const nfc = jest.requireMock<typeof NfcFake>("react-native-nfc-manager");
const nostr = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");

const SLOW = { timeout: 8000 };
const HIDDEN = { includeHiddenElements: true };

const V2_HOST = "api.swiss-bitcoin-pay.ch";
const UID = "04aabbccddeeff";
const MASTER = "000102030405060708090a0b0c0d0e0f";
const META = "0f0e0d0c0b0a09080706050403020100";
const FILE = "a0a1a2a3a4a5a6a7a8a9aaabacadaeaf";

const routes = {
  index: PendingScreen,
  pending: PendingScreen,
  "cards/index": PendingScreen,
  "onboarding/_layout": OnboardingLayout,
  "onboarding/card": CardScreen,
  "onboarding/setup": SetupScreen
};

let server: FakeLegacyServer;
let formerApiKey: string | undefined;

function v2Card() {
  return legacyNtag424({
    uid: UID,
    host: V2_HOST,
    master: hexToBytes(MASTER),
    meta: hexToBytes(META),
    file: hexToBytes(FILE)
  });
}

/** The step titled `title`, as screen readers say it: its title, its state, then its caption. */
function stepSaid(title: string): string {
  return String(screen.getByLabelText(new RegExp(`^${title}: `)).props.accessibilityLabel);
}

/** The sign-up's card step, "Start" pressed: the card held to the phone is read. */
async function startOnCardStep() {
  const router = await renderRouter(routes, { initialUrl: "/onboarding/card" });
  await fireEvent.press(await screen.findByTestId("add-card-start", {}, SLOW));
  // Not the router itself: an async function would unwrap the promise it also is.
  return { router };
}

beforeEach(async () => {
  nostr.resetRelays();
  nfc.resetNfcManager();
  resetCardStates();
  resetImageFake();
  forgetDeviceKey();
  formerApiKey = process.env.EXPO_PUBLIC_BREEZ_API_KEY;
  process.env.EXPO_PUBLIC_BREEZ_API_KEY = "test-api-key";
  addRelay(DEFAULT_CARD_RELAY_HOST);
  server = addLegacyServer(V2_HOST);
  // The v2 keys live on the v2 server only (legacy-reset.ts): the fake one holds them.
  server.v2Keys = { master: hexToBytes(MASTER), meta: hexToBytes(META), file: hexToBytes(FILE) };
  await openTestAccount({ usage: "card", signUp: "card" });
});

afterEach(async () => {
  closeAccount();
  await disconnectWallet();
  if (formerApiKey === undefined) delete process.env.EXPO_PUBLIC_BREEZ_API_KEY;
  else process.env.EXPO_PUBLIC_BREEZ_API_KEY = formerApiKey;
});

describe("migrating a v2 card at the sign-up's card step", () => {
  it("says what it holds, in sats only (no point of sale yet), then migrates on confirmation", async () => {
    server.balanceMsat = BigInt(30_000_000);
    const card = v2Card();
    nfc.holdCard(card);
    await startOnCardStep();

    // The screen tells the holder what will be transferred, and waits for confirmation.
    const confirm = await screen.findByTestId("card-migrate", {}, SLOW);
    expect(screen.getByText("Swiss Bitcoin Pay card detected")).toBeTruthy();
    expect(screen.getByTestId("legacy-card-amount")).toHaveTextContent(/^30.000 sats$/);
    // The sign-up has no rate yet: nothing in a currency.
    expect(screen.queryByTestId("legacy-card-fiat")).toBeNull();
    // Its server gave no visual: two lines of what will happen.
    expect(screen.queryByText("It keeps its visual and its number.")).toBeNull();
    // Not transferred nor erased yet.
    expect(card.keyVersions).toEqual([1, 1, 1, 0, 0]);
    expect(server.submitted).toHaveLength(0);

    await fireEvent.press(confirm);

    // Migrated: the card re-encoded, its balance in its new wallet.
    await waitFor(
      () => expect(screen.getByTestId("card-steps-title")).toHaveTextContent("Card migrated"),
      SLOW
    );
    expect(stepSaid("Balance transferred")).toMatch(
      /^Balance transferred: done, 30.000 sats received$/
    );
    expect(stepSaid("Card held a second time")).toMatch(/: done$/);
    expect(stepSaid("Card erased and programmed")).toMatch(/: done$/);
    expect(stepSaid("Card activated")).toMatch(/: done$/);
    expect(screen.getByText("Done")).toBeTruthy();
    expect(card.keyVersions).toEqual([1, 1, 1, 1, 1]);
    const cardId = await withCardAccess(async (access) => cardIdOf(access.root, hexToBytes(UID)));
    expect(fakeCardWallet(cardId).balanceSats).toBe(BigInt(30_000));
    expect(server.submitted).toHaveLength(1);
  });

  it("migrates a v2 card with no balance without asking", async () => {
    server.balanceMsat = BigInt(0);
    const card = v2Card();
    nfc.holdCard(card);
    await startOnCardStep();

    // No confirmation step: straight to a re-encoded card.
    await waitFor(
      () => expect(screen.getByTestId("card-steps-title")).toHaveTextContent("Card migrated"),
      SLOW
    );
    expect(screen.queryByTestId("card-migrate")).toBeNull();
    expect(stepSaid("Card recognized")).toBe("Card recognized: done, No balance to transfer");
    expect(card.keyVersions).toEqual([1, 1, 1, 1, 1]);
    expect(server.submitted).toHaveLength(0);
  });

  it("never erases a v2 card above its 24-hour cap: says why, nothing transferred", async () => {
    // 30 000 sats, of which 10 000 may still be spent today: the v2 server refuses the transfer
    // (no exemption for a migration).
    server.balanceMsat = BigInt(30_000_000);
    server.remaining24hMsat = BigInt(10_000_000);
    const card = v2Card();
    nfc.holdCard(card);
    await startOnCardStep();
    await fireEvent.press(await screen.findByTestId("card-migrate", {}, SLOW));

    await waitFor(
      () =>
        expect(screen.getByTestId("card-steps-title")).toHaveTextContent(
          "The migration did not go through"
        ),
      SLOW
    );
    expect(stepSaid("Balance not transferred")).toMatch(
      /^Balance not transferred: failed, This transfer is above the card's limit: CHF 1,000 per 24 hours/
    );
    expect(server.submitted).toHaveLength(0);
    expect(server.balanceMsat).toBe(BigInt(30_000_000));
    // Still the v2 card, its keys untouched.
    expect(card.keyVersions).toEqual([1, 1, 1, 0, 0]);
  });

  it('goes back to the steps to come on "Cancel", nothing transferred nor erased', async () => {
    server.balanceMsat = BigInt(30_000_000);
    const card = v2Card();
    nfc.holdCard(card);
    await startOnCardStep();

    await screen.findByTestId("card-migrate", {}, SLOW);
    await fireEvent.press(screen.getByTestId("card-migrate-cancel"));
    expect(await screen.findByTestId("add-card-start", {}, SLOW)).toBeTruthy();
    expect(server.submitted).toHaveLength(0);
    expect(server.balanceMsat).toBe(BigInt(30_000_000));
    expect(card.keyVersions).toEqual([1, 1, 1, 0, 0]);
  });

  it("shows the card found with its printed visual, its number under it, the CDN asked once for both the screen and the migration, then the visual alone once migrated", async () => {
    const image = `https://${LEGACY_CARD_IMAGE_HOST}/api/records/v1/cdn_files/AZoZx2Qk/file/content`;
    server.visual = { front_image: image, card_id: "4821-0937-5530-1186", is_white: true };
    serveLegacyImage(image, Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a));
    server.balanceMsat = BigInt(30_000_000);
    nfc.holdCard(v2Card());
    await startOnCardStep();

    await screen.findByTestId("card-migrate", {}, SLOW);
    const face = screen.getByTestId("legacy-card-face");
    expect(face.props.accessibilityLabel).toMatch(/, 4821-0937-5530-1186$/);
    expect(screen.getByText("It keeps its visual and its number.")).toBeTruthy();
    // Its printed visual, before the holder confirms: the card's shape cut from the CDN's image,
    // nothing written over it (neither "Card 2883" nor its number), its number small under it.
    const visual = await within(face).findByTestId("legacy-card-visual-image", {}, SLOW);
    expect(visual.props.source.uri).toMatch(/^data:image\/jpeg;base64,/);
    expect(imageFake.rendered.at(-1)).toMatchObject({ width: 640, height: 404 });
    expect(within(face).queryByTestId("legacy-card-visual-label")).toBeNull();
    expect(within(face).getByTestId("card-printed-number")).toHaveTextContent(
      "4821-0937-5530-1186"
    );
    expect(
      within(screen.getByTestId("legacy-card-visual")).queryByText("4821-0937-5530-1186")
    ).toBeNull();
    expect(imageRequests).toEqual([image]);

    await fireEvent.press(screen.getByTestId("card-migrate"));
    await waitFor(
      () => expect(screen.getByTestId("card-steps-title")).toHaveTextContent("Card migrated"),
      SLOW
    );
    expect(screen.getByTestId("card-steps-subtitle")).toHaveTextContent(
      "It keeps its visual and its number, and now pays from its own wallet, within its limits."
    );
    // Its visual is its design: neither its name nor its number written over it.
    expect(screen.getByTestId("hold-stage-face-image", HIDDEN)).toBeTruthy();
    expect(screen.queryByTestId("hold-stage-face-label", HIDDEN)).toBeNull();
    expect(
      within(screen.getByTestId("hold-stage", HIDDEN)).queryByText("4821-0937-5530-1186", HIDDEN)
    ).toBeNull();
    // The migration kept the very image the screen showed: never downloaded again.
    expect(imageRequests).toEqual([image]);
    const kept = await withCardAccess(refreshCardStates);
    expect(kept.states[0]?.issuer).toMatchObject({ number: "4821-0937-5530-1186", white: true });
  });

  it("draws the card with its printed visual while its balance moves, never in a colour drawn for it", async () => {
    const image = `https://${LEGACY_CARD_IMAGE_HOST}/api/records/v1/cdn_files/AZoZx2Qk/file/content`;
    server.visual = { front_image: image, card_id: "4821-0937-5530-1186", is_white: true };
    serveLegacyImage(image, Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a));
    server.balanceMsat = BigInt(30_000_000);
    nfc.holdCard(v2Card());
    await startOnCardStep();
    await within(await screen.findByTestId("legacy-card-face", {}, SLOW)).findByTestId(
      "legacy-card-visual-image",
      {},
      SLOW
    );
    // The transfer in flight: "Transferring the balance" until the v2 server answers.
    const release = holdCallback(server);
    await fireEvent.press(screen.getByTestId("card-migrate"));
    await waitFor(
      () =>
        expect(screen.getByTestId("card-steps-title")).toHaveTextContent(
          "Transferring the balance"
        ),
      SLOW
    );
    const face = await screen.findByTestId("hold-stage-face-image", HIDDEN, SLOW);
    expect(face.props.source.uri).toMatch(/^data:image\/(jpeg|png);base64,/);
    expect(screen.queryByTestId("hold-stage-face-label", HIDDEN)).toBeNull();
    release();
    await waitFor(
      () => expect(screen.getByTestId("card-steps-title")).toHaveTextContent("Card migrated"),
      SLOW
    );
    expect(screen.getByTestId("hold-stage-face-image", HIDDEN)).toBeTruthy();
    // The very image the screen showed: never downloaded again.
    expect(imageRequests).toEqual([image]);
  });

  it("draws nothing over a v2 card's visual while the phone waits for it a second time, not even the waves", async () => {
    const image = `https://${LEGACY_CARD_IMAGE_HOST}/api/records/v1/cdn_files/AZoZx2Qk/file/content`;
    server.visual = { front_image: image, card_id: "4821-0937-5530-1186", is_white: true };
    serveLegacyImage(image, Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a));
    server.balanceMsat = BigInt(30_000_000);
    const card = v2Card();
    nfc.holdCard(card);
    await startOnCardStep();
    await within(await screen.findByTestId("legacy-card-face", {}, SLOW)).findByTestId(
      "legacy-card-visual-image",
      {},
      SLOW
    );
    // Taken away once read: the phone waits for its second tap.
    nfc.holdCard(null);
    nfc.waitForCard();
    await fireEvent.press(screen.getByTestId("card-migrate"));
    await waitFor(() => expect(nfc.awaitingCard()).toBe(true), SLOW);
    expect(screen.getByTestId("card-steps-title")).toHaveTextContent(
      "Hold the card to the phone a second time"
    );
    await screen.findByTestId("hold-stage-face-image", HIDDEN, SLOW);
    expect(screen.queryByTestId("hold-stage-face-label", HIDDEN)).toBeNull();
    expect(screen.queryByTestId("hold-stage-waves", HIDDEN)).toBeNull();

    nfc.holdCard(card);
    await waitFor(
      () => expect(screen.getByTestId("card-steps-title")).toHaveTextContent("Card migrated"),
      SLOW
    );
    expect(card.keyVersions).toEqual([1, 1, 1, 1, 1]);
  });

  it("keeps the waves on a v2 card without a visual while the phone waits for it a second time", async () => {
    server.balanceMsat = BigInt(30_000_000);
    const card = v2Card();
    nfc.holdCard(card);
    await startOnCardStep();
    await screen.findByTestId("card-migrate", {}, SLOW);
    nfc.holdCard(null);
    nfc.waitForCard();
    await fireEvent.press(screen.getByTestId("card-migrate"));
    await waitFor(() => expect(nfc.awaitingCard()).toBe(true), SLOW);
    expect(screen.getByTestId("card-steps-title")).toHaveTextContent(
      "Hold the card to the phone a second time"
    );
    expect(screen.queryByTestId("hold-stage-face-image", HIDDEN)).toBeNull();
    expect(screen.getByTestId("hold-stage-waves", HIDDEN)).toBeTruthy();

    nfc.holdCard(card);
    await waitFor(
      () => expect(screen.getByTestId("card-steps-title")).toHaveTextContent("Card migrated"),
      SLOW
    );
  });

  it("shows the card found in its colour with its number when the CDN does not serve its visual", async () => {
    const image = `https://${LEGACY_CARD_IMAGE_HOST}/api/records/v1/cdn_files/AZoZx2Qk/file/content`;
    server.visual = { front_image: image, card_id: "4821-0937-5530-1186", is_white: true };
    serveLegacyImage(image, new Uint8Array(0), 404);
    server.balanceMsat = BigInt(30_000_000);
    nfc.holdCard(v2Card());
    await startOnCardStep();

    await screen.findByTestId("card-migrate", {}, SLOW);
    await waitFor(() => expect(imageRequests).toEqual([image]), SLOW);
    await waitFor(
      () =>
        expect(readLog().entries.map((entry) => entry.event)).toContain(
          "A v2 card's visual could not be shown"
        ),
      SLOW
    );
    const face = screen.getByTestId("legacy-card-face");
    expect(within(face).queryByTestId("legacy-card-visual-image")).toBeNull();
    // Its colour, its label and the number in white over it, as before any visual.
    expect(within(face).getByText("4821-0937-5530-1186")).toHaveStyle({ color: palette.white });
    expect(within(face).getByTestId("legacy-card-visual-label")).toHaveStyle({
      color: palette.white
    });
    expect(within(face).queryByTestId("card-printed-number")).toBeNull();

    // The migration goes on, and asks the CDN once more for the visual it keeps.
    serveLegacyImage(image, Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a));
    await fireEvent.press(screen.getByTestId("card-migrate"));
    await waitFor(
      () => expect(screen.getByTestId("card-steps-title")).toHaveTextContent("Card migrated"),
      SLOW
    );
    expect(imageRequests).toEqual([image, image]);
  });

  it('ends the sign-up on "Done": the setup screen, then "Cards"', async () => {
    server.balanceMsat = BigInt(0);
    nfc.holdCard(v2Card());
    // As after the account's creation: its wallet connected, which the setup screen needs.
    await connectWallet(testSeed());
    const { router } = await startOnCardStep();

    await fireEvent.press(await screen.findByText("Done", {}, SLOW));
    expect(getAccountSettings()).toMatchObject({ usage: "card", signUp: "done" });
    await waitFor(() => expect(router.getPathname()).toBe("/cards"), SLOW);
  });
});
