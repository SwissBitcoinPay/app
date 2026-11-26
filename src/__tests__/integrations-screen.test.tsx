import "@/i18n";

import * as Clipboard from "expo-clipboard";
import { act, fireEvent, renderRouter, screen, waitFor, within } from "expo-router/testing-library";
import { Dimensions, Linking, StyleSheet } from "react-native";

import AppLayout from "@/app/(app)/_layout";
import IntegrationsRoute from "@/app/(app)/integrations";
import AmountScreen from "@/app/(app)/pos/index";
import PosLayout from "@/app/(app)/pos/_layout";
import LaunchScreen from "@/app/index";
import { SDK_LANGUAGES, SHOP_PLATFORMS } from "@/config/integration-catalog";
import { DEFAULT_RELAYS } from "@/config/relays";
import { MAX_INTEGRATIONS } from "@/config/team";
import type { Guide } from "@/features/integrations/guides";
import { resetCheckedFiles } from "@/features/integrations/PluginFiles";
import {
  closeAccount,
  getAccountBackupKey,
  getAccountSettings,
  getAccountTeamKeys
} from "@/features/account/session";
import * as owner from "@/features/team/owner";
import { createIntegration } from "@/features/team/owner";
import { resetTerminalProfileCache } from "@/features/terminal/profile-cache";
import { INTEGRATION_LOT_SIZE } from "@/config/onchain";
import {
  connectWallet,
  disconnectWallet,
  getWalletConnectionId,
  getWalletId,
  newDepositAddress,
  subscribeWallet
} from "@/lib/breez/wallet";
import { deriveIntegrationKeys, parseIntegrationKey } from "@/lib/integrations/keys";
import { fetchIntegrationLots } from "@/lib/integrations/onchain-lot";
import { fetchChannel } from "@/lib/team/channel";
import { deriveBusinessRegistry, integrationSecretKey } from "@/lib/team/keys";
import type { SavedTerminalProfile } from "@/lib/terminal/model";
import { saveTerminalProfile } from "@/lib/terminal/profile";
import { witnessAddress, witnessEvent } from "@/lib/integrations/onchain-witness";
import { publishToRelays } from "@/lib/nostr/pool";
import { sealRecord } from "@/lib/nostr/record";
import { leaseEvent, withdrawalEvent } from "@/lib/registry/onchain";
import { saleRegistry } from "@/lib/registry/registry";
import { readLog } from "@/lib/log/log";

import { openTestAccount } from "../../jest/account";
import { taprootAddress } from "../../jest/bitcoin";
import { publishAssistant, publishIntegration, rosterOn } from "../../jest/roster";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as RelaysFake from "../../jest/nostr-relays";

jest.mock("../lib/breez/wallet", () => ({
  checkWalletConfig: jest.fn(),
  connectWallet: jest.fn(),
  disconnectWallet: jest.fn(),
  getWalletConnectionId: jest.fn(),
  getWalletId: jest.fn(),
  getWalletLightningAddress: jest.fn(),
  newDepositAddress: jest.fn(),
  subscribeWallet: jest.fn()
}));
jest.mock("../lib/breez/config", () => ({
  ...jest.requireActual("../lib/breez/config"),
  getBreezNetwork: () => "mainnet"
}));
jest.mock("../lib/breez/passkey", () => ({
  createPasskeyWallet: jest.fn(),
  preparePasskeys: jest.fn(async () => undefined),
  passkeysReady: jest.fn(() => true),
  signInWithPasskey: jest.fn()
}));
// A build with a web app or without one (no RP ID: local, CI): integrations need none.
const mockWebApp = jest.fn<string | null, []>(() => "https://web.example");
jest.mock("../config/payment-links", () => ({
  ...jest.requireActual("../config/payment-links"),
  getPaymentLinkOrigin: () => mockWebApp()
}));
jest.mock("../features/terminal/useRate", () => ({
  useRate: () => ({ rate: 50000, hour: 0, loading: false, current: () => 50000 })
}));
const mockDesktop = jest.fn(() => false);
jest.mock("@/components/layout/useIsDesktop", () => ({
  ...jest.requireActual("@/components/layout/useIsDesktop"),
  useIsDesktop: () => mockDesktop()
}));
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn(async () => true) }));

/** How a key is copied: a secret (src/lib/secret-clipboard.ts). */
const SECRET_COPY = {
  android: { isSensitive: true },
  ios: { expiresAt: expect.any(Date) }
};
// Every shop has its guide (guides.ts): a test takes one away (null, "Coming soon"), or gives
// WooCommerce one in place of its own.
const mockGuides = jest.fn<Record<string, Guide | null>, []>(() => ({}));
jest.mock("../features/integrations/guides", () => {
  const actual = jest.requireActual("../features/integrations/guides");
  // Read when the sheet renders, never as modules load (before mockGuides exists).
  return Object.defineProperty({ __esModule: true, ...actual }, "GUIDES", {
    enumerable: true,
    get: () => ({ ...actual.GUIDES, ...mockGuides() })
  });
});

// Jest makes every bundled file the number 1: each of the Wix plugin's is its file's name instead,
// which the fake reader reads from the copy of a release Jest reads (jest/wix-plugin/, Node's fs), as
// the app reads its own copy.
jest.mock("../../assets/plugins/wix/sattleme-plugin.js.txt", () => "sattleme-plugin.js.txt");
jest.mock("../../assets/plugins/wix/http-functions.js.txt", () => "http-functions.js.txt");
jest.mock("../../assets/plugins/wix/events.js.txt", () => "events.js.txt");
jest.mock("../../assets/plugins/wix/jobs.config.txt", () => "jobs.config.txt");
jest.mock("../../assets/plugins/wix/sattlemeCheckout.js.txt", () => "sattlemeCheckout.js.txt");
jest.mock(
  "../../assets/plugins/wix/sattlemeCheckout-config.js.txt",
  () => "sattlemeCheckout-config.js.txt"
);
// Node's types are not loaded (see app-config.test.ts): only what this test needs is typed here.
declare const __dirname: string;
const { readFileSync: mockReadFileSync } = jest.requireActual<{
  readFileSync(file: string): Uint8Array;
}>("fs");
const { join: mockJoin } = jest.requireActual<{ join(...segments: string[]): string }>("path");
/** A bundled Wix file's bytes, as the app reads them. */
const wixFile = (name: string): Uint8Array =>
  Uint8Array.from(mockReadFileSync(mockJoin(__dirname, "../../jest/wix-plugin", name)));
const mockReadBundledFile = jest.fn(async (source: number | string) => wixFile(String(source)));
jest.mock("../features/integrations/plugin-files", () => ({
  readBundledFile: (source: number | string) => mockReadBundledFile(source)
}));

const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");

/** The owner's wallet (public key of the key 2). */
const WALLET = "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";
const ADDRESS = "sattleme02c6047f94@breez.tips";
/** The guide shown without an integration: its title. */
const EMPTY = "Take payments in your online shop";

const routes = {
  index: LaunchScreen,
  "(app)/_layout": AppLayout,
  "(app)/pos/_layout": PosLayout,
  "(app)/pos/index": AmountScreen,
  "(app)/integrations": IntegrationsRoute
};

/** The owner's device: its account open (done), its point of sale prepared. */
async function ownerDevice(): Promise<void> {
  await openTestAccount({ usage: "merchant", signUp: "done" });
  const profile: SavedTerminalProfile = {
    version: 2,
    walletId: WALLET,
    backupKey: getAccountBackupKey()!,
    lightningAddress: ADDRESS,
    businessName: getAccountSettings()?.businessName ?? "",
    currency: "CHF"
  };
  await saveTerminalProfile(profile);
  resetTerminalProfileCache();
}

/** The account's integrations, as its records on the relays hold them. */
async function integrations() {
  const { active } = await rosterOn(getAccountTeamKeys()!);
  return active.filter(({ role }) => role === "integration");
}

/** The integration's lot of on-chain addresses, as its server reads it. */
async function lotOf(id: string) {
  const team = getAccountTeamKeys()!;
  const keys = deriveIntegrationKeys(integrationSecretKey(team, id));
  const found = await fetchIntegrationLots(team, [{ id, keys }], "mainnet", {
    relays: DEFAULT_RELAYS,
    channel: "account",
    timeoutMs: 1000,
    authKey: team.secretKey
  });
  return found?.get(id)?.lot ?? null;
}

/** The integration's channel, as its server reads it. */
function channelOf(id: string) {
  const team = getAccountTeamKeys()!;
  return fetchChannel(
    team.publicKey,
    deriveIntegrationKeys(integrationSecretKey(team, id)),
    1000,
    DEFAULT_RELAYS
  );
}

/** "Create an integration", then the SDK of Node.js (the one published): its key's step. */
async function openKeyStep(): Promise<void> {
  await fireEvent.press(await screen.findByTestId("create-integration"));
  await fireEvent.press(screen.getByTestId("integration-developers"));
  await fireEvent.press(screen.getByTestId("integration-option-node"));
}

/** The header's "Source code": its title and label as measured off screen, in px. */
async function measureSource(title: number, label: number): Promise<void> {
  for (const [part, width] of [
    ["title", title],
    ["label", label]
  ] as const) {
    await fireEvent(
      screen.getByTestId(`integration-source-measure-${part}`, { includeHiddenElements: true }),
      "layout",
      { nativeEvent: { layout: { x: 0, y: 0, width, height: 20 } } }
    );
  }
}

/** A plugin's guide: the key at its third step. */
const GUIDE: Guide = () => [
  {
    kind: "text",
    title: "Install the plugin",
    body: "From the shop's administration.",
    code: "shop plugin install sattleme\nshop cache flush",
    link: { label: "Plugin page", url: "https://plugins.example/sattleme" }
  },
  { kind: "text", title: "Open its settings", body: "Settings, then Payments." },
  { kind: "key" },
  { kind: "text", title: "Paste the key and save", body: "In the key's field." }
];

/** With its no-break space before "→", as the guides write it. */
const noBreak = (text: string) => text.replace(/ →/g, "\u00a0→");

jest.setTimeout(20_000);

beforeEach(() => {
  closeAccount();
  relays.resetRelays();
  fileSystem.resetFileSystem();
  resetCheckedFiles();
  mockGuides.mockReturnValue({});
  mockWebApp.mockReturnValue("https://web.example");
  mockDesktop.mockReturnValue(false);
  jest.mocked(getWalletId).mockResolvedValue(WALLET);
  // The wallet gives no connection (the integrations' lots stay as they are), unless a test says.
  jest.mocked(getWalletConnectionId).mockReturnValue(null);
  jest.mocked(subscribeWallet).mockImplementation((listener) => {
    const timer = setTimeout(listener, 0);
    return () => clearTimeout(timer);
  });
  // Reset, not cleared: a once-answer an earlier test left unused (it failed first) is not this one's.
  jest.mocked(Clipboard.setStringAsync).mockReset().mockResolvedValue(true);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe('"Integrations"', () => {
  it("creates an integration with a name, then shows its secret key, never the address", async () => {
    await ownerDevice();
    await renderRouter(routes, { initialUrl: "/integrations" });
    expect(await screen.findByText(EMPTY)).toBeTruthy();
    // What an integration does, in three steps.
    const guide = screen.getByTestId("integrations-empty");
    expect(within(guide).getByLabelText(/^1\. Create the integration, /)).toBeTruthy();
    expect(within(guide).getByLabelText(/^2\. Hand over the secret key, /)).toBeTruthy();
    expect(within(guide).getByLabelText(/^3\. Your customers pay, /)).toBeTruthy();

    await openKeyStep();
    expect(screen.getByText("It shows next to its sales in your wallet.")).toBeTruthy();
    // One shop per integration, said before the key exists (checkout-spec SPEC.md §8).
    const oneShop = screen.getByTestId("integration-one-shop");
    expect(within(oneShop).getByText("One key for one shop only")).toBeTruthy();
    expect(
      within(oneShop).getByText(
        /^The servers of one shop share its key; two shops, never: their orders would mix/
      )
    ).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId("integration-name"), "  Shopify Store ");
    await fireEvent.press(screen.getByTestId("integration-create"));

    // Its secret key, in full, for the shop's server.
    const shown = await screen.findByTestId("integration-key");
    const secretKey = String(shown.props.children);
    const [integration] = await integrations();
    // Its record names the language it was created for.
    expect(integration).toMatchObject({ name: "Shopify Store", platform: "node" });
    expect(parseIntegrationKey(secretKey)).toEqual({
      teamPublicKey: getAccountTeamKeys()!.publicKey,
      key: integrationSecretKey(getAccountTeamKeys()!, integration.id),
      relays: DEFAULT_RELAYS
    });
    expect(screen.getByText("Key for Shopify Store")).toBeTruthy();
    expect(
      screen.getByText(
        /^Keep it secret, on that shop's servers only: never in a web page, in an app nor for another shop\./
      )
    ).toBeTruthy();
    // Shown this once, which it says; closed by "Done" only, never by a tap beside it nor a
    // step back to the list (both disabled).
    expect(screen.getByTestId("integration-key-once").props.children).toMatch(
      /^It is shown only once: copy it now\./
    );
    const sheet = screen.getByTestId("integration-create-sheet");
    expect(within(sheet).getByLabelText("Close")).toBeDisabled();
    expect(within(sheet).getByTestId("sheet-back")).toBeDisabled();
    expect(screen.queryByTestId("integration-unpublished")).toBeNull();
    // Never the business's Lightning address: its server reads it from
    // the channel.
    expect(screen.queryByText(/sattleme02c6047f94|breez\.tips/)).toBeNull();
    await expect(channelOf(integration.id)).resolves.toMatchObject({
      status: "found",
      channel: { status: "active", role: "integration", profile: { lightningAddress: ADDRESS } }
    });

    // "Copy the key" right under the key, before "copy it now" and how to keep it, in the order
    // drawn.
    const drawn = JSON.stringify(screen.toJSON());
    const key = drawn.indexOf('"integration-key"');
    const button = drawn.indexOf('"integration-copy"');
    const once = drawn.indexOf('"integration-key-once"');
    const keep = drawn.indexOf("Keep it secret");
    expect(key).toBeGreaterThan(-1);
    expect(button).toBeGreaterThan(key);
    expect(once).toBeGreaterThan(button);
    expect(keep).toBeGreaterThan(once);
    // Copied as a secret (src/lib/secret-clipboard.ts), never shared through the system's sheet.
    expect(screen.queryByTestId("integration-share")).toBeNull();
    await fireEvent.press(screen.getByTestId("integration-copy"));
    expect(jest.mocked(Clipboard.setStringAsync)).toHaveBeenLastCalledWith(secretKey, SECRET_COPY);
    expect(await screen.findByText("Key copied")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("integration-done"));
    // In the list, with the day it was created.
    const row = await screen.findByTestId(`integration-${integration.id}`);
    expect(within(row).getByText("Shopify Store")).toBeTruthy();
    expect(within(row).getByText(/^Created on /)).toBeTruthy();
    // Node.js's logo where its avatar goes, not the code icon.
    expect(
      within(row).getByTestId("integration-avatar-node", { includeHiddenElements: true })
    ).toBeTruthy();
    expect(
      within(row).queryByTestId("integration-avatar", { includeHiddenElements: true })
    ).toBeNull();
    // Its key is gone for good: nothing shows it again.
    expect(screen.queryByTestId("integration-key")).toBeNull();
    expect(within(row).queryByTestId(`show-${integration.id}`)).toBeNull();
  });

  // No busy label of its own, which would not fit the button.
  it('waits on a spinner in place of "Create the key", the button as it was', async () => {
    await ownerDevice();
    await renderRouter(routes, { initialUrl: "/integrations" });
    expect(await screen.findByText(EMPTY)).toBeTruthy();
    const create = owner.createIntegration;
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    const spy = jest
      .spyOn(owner, "createIntegration")
      .mockImplementation(async (name, platform) => {
        await held;
        return create(name, platform);
      });

    await openKeyStep();
    await fireEvent.changeText(screen.getByTestId("integration-name"), "Shopify Store");
    const spinner = () =>
      screen.queryByTestId("integration-create-spinner", { includeHiddenElements: true });
    expect(spinner()).toBeNull();
    await fireEvent.press(screen.getByTestId("integration-create"));

    // The same label, which keeps the button's width, under a spinner; pressed again, nothing.
    expect(spinner()).toBeTruthy();
    const button = screen.getByTestId("integration-create");
    expect(within(button).getByText("Create the key")).toBeTruthy();
    expect(screen.queryByText(/^Creating/)).toBeNull();
    expect(button.props.accessibilityState).toMatchObject({ disabled: true, busy: true });
    await fireEvent.press(button);
    // Neither closed nor left for the list while the key is being created.
    const sheet = screen.getByTestId("integration-create-sheet");
    expect(within(sheet).getByLabelText("Close")).toBeDisabled();
    expect(within(sheet).getByTestId("sheet-back")).toBeDisabled();

    release();
    expect(await screen.findByTestId("integration-key")).toBeTruthy();
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("fills the new integration's lot of on-chain addresses at once, not at the next unlock", async () => {
    await ownerDevice();
    await renderRouter(routes, { initialUrl: "/integrations" });
    expect(await screen.findByText(EMPTY)).toBeTruthy();
    // The wallet, connected in the background for the lot, handing out taprootAddress(1), (2), …
    let connected = false;
    let given = 0;
    jest.mocked(connectWallet).mockImplementation(async () => {
      connected = true;
    });
    jest.mocked(disconnectWallet).mockImplementation(async () => {
      connected = false;
    });
    jest.mocked(getWalletConnectionId).mockImplementation(() => (connected ? 1 : null));
    jest.mocked(newDepositAddress).mockImplementation(async () => {
      given += 1;
      return taprootAddress(given);
    });

    await openKeyStep();
    await fireEvent.changeText(screen.getByTestId("integration-name"), "Shopify Store");
    await fireEvent.press(screen.getByTestId("integration-create"));
    await screen.findByTestId("integration-key");
    const [integration] = await integrations();

    await waitFor(async () =>
      expect((await lotOf(integration.id))?.addresses).toEqual(
        Array.from({ length: INTEGRATION_LOT_SIZE }, (_, i) => taprootAddress(i + 1))
      )
    );
    await waitFor(() => expect(connected).toBe(false));
  });

  it("never shows a key again: a row only removes its integration", async () => {
    await ownerDevice();
    const { integration, secretKey } = await createIntegration("Shopify Store", "node");
    await renderRouter(routes, { initialUrl: "/integrations" });

    const row = await screen.findByTestId(`integration-${integration.id}`);
    expect(within(row).getByTestId(`remove-${integration.id}`)).toBeTruthy();
    expect(within(row).queryByTestId(`show-${integration.id}`)).toBeNull();
    expect(screen.queryByLabelText("Show the key")).toBeNull();
    expect(screen.queryByText(secretKey)).toBeNull();
    expect(screen.queryByTestId("integration-key")).toBeNull();
  });

  it("removes an integration after its confirmation, and only then", async () => {
    await ownerDevice();
    const { integration } = await createIntegration("Shopify Store", "node");
    await renderRouter(routes, { initialUrl: "/integrations" });

    await fireEvent.press(await screen.findByTestId(`remove-${integration.id}`));
    expect(await screen.findByText("Remove Shopify Store?")).toBeTruthy();
    await fireEvent.press(screen.getByText("Back"));
    expect(await integrations()).toEqual([expect.objectContaining({ id: integration.id })]);

    await fireEvent.press(screen.getByTestId(`remove-${integration.id}`));
    await fireEvent.press(await screen.findByTestId("confirm-remove-integration"));
    expect(await screen.findByText("Integration removed")).toBeTruthy();
    expect(
      screen.getByText("The key of Shopify Store no longer creates payment requests")
    ).toBeTruthy();
    expect(await screen.findByText(EMPTY)).toBeTruthy();
    expect(await integrations()).toEqual([]);
    await expect(channelOf(integration.id)).resolves.toMatchObject({
      channel: { status: "removed" }
    });
  });

  it("keeps the removal's dialog on a spinner until the relays took it, then closes it", async () => {
    await ownerDevice();
    const { integration } = await createIntegration("Shopify Store", "node");
    await renderRouter(routes, { initialUrl: "/integrations" });
    await fireEvent.press(await screen.findByTestId(`remove-${integration.id}`));
    expect(await screen.findByText("Remove Shopify Store?")).toBeTruthy();
    const remove = jest.spyOn(owner, "removeIntegration");

    const release = relays.holdPublishes();
    try {
      await fireEvent.press(screen.getByTestId("confirm-remove-integration"));
      await waitFor(() =>
        expect(
          screen.getByTestId("confirm-remove-integration").props.accessibilityState
        ).toMatchObject({ busy: true, disabled: true })
      );
      const confirm = screen.getByTestId("confirm-remove-integration");
      expect(
        screen.queryByTestId("confirm-remove-integration-spinner", { includeHiddenElements: true })
      ).toBeTruthy();
      // "Back" disabled, the dialog kept; pressed again: one removal.
      const back = screen.getByRole("button", { name: "Back" });
      expect(back.props.accessibilityState).toMatchObject({ disabled: true });
      await fireEvent.press(back);
      await fireEvent.press(confirm);
      expect(screen.getByTestId("remove-integration")).toBeTruthy();
      expect(screen.queryByText("Integration removed")).toBeNull();
    } finally {
      release();
    }

    expect(await screen.findByText("Integration removed")).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId("remove-integration")).toBeNull());
    expect(remove).toHaveBeenCalledTimes(1);
    remove.mockRestore();
    expect(await integrations()).toEqual([]);
  });

  it("closes the removal's dialog on its failure, and says so", async () => {
    await ownerDevice();
    const { integration } = await createIntegration("Shopify Store", "node");
    await renderRouter(routes, { initialUrl: "/integrations" });
    await fireEvent.press(await screen.findByTestId(`remove-${integration.id}`));
    const remove = jest
      .spyOn(owner, "removeIntegration")
      .mockRejectedValue(new owner.TeamError("unreachable", "No majority"));
    try {
      await fireEvent.press(await screen.findByTestId("confirm-remove-integration"));
      expect(await screen.findByText(/^The removal could not be published/)).toBeTruthy();
      await waitFor(() => expect(screen.queryByTestId("remove-integration")).toBeNull());
    } finally {
      remove.mockRestore();
    }
    // Its trash waits no more: pressed, the dialog asks again, ready.
    await fireEvent.press(screen.getByTestId(`remove-${integration.id}`));
    expect(
      (await screen.findByTestId("confirm-remove-integration")).props.accessibilityState
    ).toMatchObject({ busy: false, disabled: false });
    expect(await integrations()).toEqual([expect.objectContaining({ id: integration.id })]);
  });

  it("never removes an integration with a payment pending: a modal says what, then tries again", async () => {
    await ownerDevice();
    const { integration } = await createIntegration("Shopify Store", "node");
    const team = getAccountTeamKeys()!;
    const keys = deriveIntegrationKeys(integrationSecretKey(team, integration.id));
    const address = taprootAddress(7);
    const now = Math.floor(Date.now() / 1000);
    // An order of it leases an address (its server's witness names the address): open 5 minutes.
    const registry = saleRegistry(deriveBusinessRegistry(team), new Uint8Array(32).fill(9));
    await publishToRelays(
      leaseEvent(
        registry,
        {
          address,
          sats: 49_000n,
          invoice: null,
          createdAt: now - 60,
          expiresAt: now + 300,
          confirmed: true
        },
        { fiat: { minor: 2450, digits: 2, currency: "CHF" }, note: "Order 1" },
        now - 60
      ),
      { relays: DEFAULT_RELAYS, channel: "anonymous", timeoutMs: 1000 }
    );
    const late = {
      address,
      txid: "ab".repeat(32),
      sale: null,
      sats: 49_000n,
      inputs: [],
      replacement: false,
      expiresAt: null
    };
    await publishToRelays(witnessEvent(keys, late, now), {
      relays: DEFAULT_RELAYS,
      channel: "account",
      timeoutMs: 1000,
      authKey: keys.seen.nostr.secretKey
    });
    await renderRouter(routes, { initialUrl: "/integrations" });

    await fireEvent.press(await screen.findByTestId(`remove-${integration.id}`));
    await fireEvent.press(await screen.findByTestId("confirm-remove-integration"));
    expect(await screen.findByText("Shopify Store has payments in progress")).toBeTruthy();
    // The dialog gave way to the modal once the check answered.
    await waitFor(() => expect(screen.queryByTestId("remove-integration")).toBeNull());
    expect(
      screen.getByText(/^1 payment request still open, until \d{2}:\d{2} at the latest\.$/)
    ).toBeTruthy();
    // Still there: nothing was removed.
    expect(await integrations()).toEqual([expect.objectContaining({ id: integration.id })]);
    await expect(channelOf(integration.id)).resolves.toMatchObject({
      channel: { status: "active" }
    });

    // The order paid over Lightning withdrew its lease: "Try again" removes it.
    await publishToRelays(withdrawalEvent(registry, address, now), {
      relays: DEFAULT_RELAYS,
      channel: "anonymous",
      timeoutMs: 1000
    });
    await fireEvent.press(screen.getByTestId("integration-pending-retry"));
    expect(await screen.findByText("Integration removed")).toBeTruthy();
    expect(await integrations()).toEqual([]);
  });

  it("removes an integration all the same once confirmed again in the modal, whatever its records say", async () => {
    await ownerDevice();
    const { integration } = await createIntegration("Shopify Store", "node");
    const team = getAccountTeamKeys()!;
    const keys = deriveIntegrationKeys(integrationSecretKey(team, integration.id));
    // Whoever holds its key (a key that leaked) writes a witness of a newer format: whether its
    // payments are final cannot be told.
    await publishToRelays(
      sealRecord({
        type: "integration-onchain-seen",
        value: { version: 99 },
        signer: keys.seen.nostr.secretKey,
        encryptionKey: keys.channel.encryptionKey,
        address: witnessAddress(keys, taprootAddress(7), "aa".repeat(32), null),
        createdAt: Math.floor(Date.now() / 1000) - 300
      }),
      {
        relays: DEFAULT_RELAYS,
        channel: "account",
        timeoutMs: 1000,
        authKey: keys.seen.nostr.secretKey
      }
    );
    await renderRouter(routes, { initialUrl: "/integrations" });

    await fireEvent.press(await screen.findByTestId(`remove-${integration.id}`));
    await fireEvent.press(await screen.findByTestId("confirm-remove-integration"));
    // Never said to be pending: not told.
    expect(await screen.findByText("Shopify Store's payments could not be checked")).toBeTruthy();
    expect(screen.queryByTestId("integration-pending-line")).toBeNull();
    expect(await integrations()).toEqual([expect.objectContaining({ id: integration.id })]);

    await fireEvent.press(screen.getByTestId("integration-pending-force"));
    expect(await screen.findByText("Integration removed")).toBeTruthy();
    expect(await integrations()).toEqual([]);
    await expect(channelOf(integration.id)).resolves.toMatchObject({
      channel: { status: "removed" }
    });
  });

  it("shows the key of an integration whose channel no majority took yet, and says so", async () => {
    await ownerDevice();
    await renderRouter(routes, { initialUrl: "/integrations" });
    await openKeyStep();
    await fireEvent.changeText(screen.getByTestId("integration-name"), "Shop");
    // Its record is taken, its channel (signed by the team) is not.
    const team = getAccountTeamKeys()!;
    const publishEvent = relays.publishEvent;
    const refuse = jest
      .spyOn(relays, "publishEvent")
      .mockImplementation(async (url, event, options) => {
        if (event.pubkey === team.publicKey && DEFAULT_RELAYS.slice(0, 4).includes(url)) {
          throw new Error("Refused");
        }
        return publishEvent(url, event, options);
      });
    try {
      await fireEvent.press(screen.getByTestId("integration-create"));
      // Created (its record on a majority): its key now, the only time it shows.
      expect(await screen.findByTestId("integration-key")).toBeTruthy();
    } finally {
      refuse.mockRestore();
    }
    const [integration] = await integrations();
    expect(
      parseIntegrationKey(String(screen.getByTestId("integration-key").props.children))
    ).not.toBeNull();
    expect(screen.getByTestId("integration-unpublished")).toHaveTextContent(
      /The integration Shop could not be published to your relays yet\. It will be at the next unlock/
    );
    await fireEvent.press(screen.getByTestId("integration-done"));
    expect(await screen.findByTestId(`integration-${integration!.id}`)).toBeTruthy();
    expect(screen.queryByTestId("integration-key")).toBeNull();
  });

  it("creates nothing while no majority of the relays takes its record, and says so", async () => {
    await ownerDevice();
    await renderRouter(routes, { initialUrl: "/integrations" });
    await openKeyStep();
    await fireEvent.changeText(screen.getByTestId("integration-name"), "Shop");
    for (const relay of DEFAULT_RELAYS.slice(0, 3)) relays.readOnly.add(relay);
    await fireEvent.press(screen.getByTestId("integration-create"));
    expect(
      await screen.findByText(
        /^The integration could not be published\. Check your internet connection/
      )
    ).toBeTruthy();
    // Still in the sheet, the name kept: creating again makes one integration.
    expect(screen.getByTestId("integration-name").props.value).toBe("Shop");
    relays.readOnly.clear();
    expect(await integrations()).toEqual([]);
  });

  it("never shows an empty list while no relay answers", async () => {
    await ownerDevice();
    for (const relay of DEFAULT_RELAYS) relays.unreachable.add(relay);
    await renderRouter(routes, { initialUrl: "/integrations" });
    expect(
      await screen.findByText(
        "No relay answered: the list of integrations could not be read. Check the connection, then come back to this screen."
      )
    ).toBeTruthy();
    expect(screen.queryByText(EMPTY)).toBeNull();
  });

  it("says when not every relay answered, and shows what those that did hold", async () => {
    await ownerDevice();
    const team = getAccountTeamKeys()!;
    await publishIntegration(team, {
      id: "ab".repeat(16),
      name: "Shop",
      createdAt: 1790000000,
      platform: "node"
    });
    for (const relay of DEFAULT_RELAYS.slice(0, 3)) relays.unreachable.add(relay);
    await renderRouter(routes, { initialUrl: "/integrations" });
    expect(await screen.findByTestId("integrations-partial")).toBeTruthy();
    expect(await screen.findByTestId(`integration-${"ab".repeat(16)}`)).toBeTruthy();
  });

  // The logo of the platform each one was created for.
  it("draws each one's logo where its avatar goes, the code icon for a platform it does not know", async () => {
    await ownerDevice();
    const team = getAccountTeamKeys()!;
    const at = 1790000000;
    // Created from Python, and from an option of a newer app.
    await publishIntegration(team, {
      id: "b2".repeat(16),
      name: "Python Site",
      createdAt: at + 1,
      platform: "python"
    });
    await publishIntegration(team, {
      id: "c3".repeat(16),
      name: "Newer",
      createdAt: at + 2,
      platform: "shopify"
    });
    await renderRouter(routes, { initialUrl: "/integrations" });
    const avatarOf = async (id: string) =>
      within(await screen.findByTestId(`integration-${id}`))
        .getAllByTestId(/^integration-avatar/, { includeHiddenElements: true })
        .map((node) => node.props.testID as string);
    expect(await avatarOf("b2".repeat(16))).toEqual(["integration-avatar-python"]);
    expect(await avatarOf("c3".repeat(16))).toEqual(["integration-avatar"]);
    // Drawn, never read: the name next to it says which one it is.
    const python = screen.getByTestId("integration-avatar-python", { includeHiddenElements: true });
    expect(python.props["aria-hidden"]).toBe(true);
    expect(
      within(screen.getByTestId(`integration-${"b2".repeat(16)}`)).getByText("Python Site")
    ).toBeTruthy();
  });

  it.each([
    ["on a phone", false],
    ["on desktop", true]
  ])(
    "lists integrations and assistants in one list, the latest created first, %s",
    async (_, desktop) => {
      mockDesktop.mockReturnValue(desktop);
      await ownerDevice();
      const team = getAccountTeamKeys()!;
      const at = 1790000000;
      // Published out of order, each kind of seat apart in the roster.
      await publishIntegration(team, {
        id: "a1".repeat(16),
        name: "Oldest",
        createdAt: at,
        platform: "node"
      });
      await publishAssistant(team, {
        id: "b2".repeat(16),
        name: "Latest",
        createdAt: at + 3 * 86400
      });
      await publishIntegration(team, {
        id: "c3".repeat(16),
        name: "Second",
        createdAt: at + 2 * 86400,
        platform: "python"
      });
      await publishAssistant(team, { id: "d4".repeat(16), name: "Third", createdAt: at + 86400 });
      const latestFirst = ["b2", "c3", "d4", "a1"].map((id) => `integration-${id.repeat(16)}`);
      const order = () =>
        screen.getAllByTestId(/^integration-[0-9a-f]{32}$/).map(({ props }) => props.testID);

      await renderRouter(routes, { initialUrl: "/integrations" });
      expect(await screen.findByText("Oldest")).toBeTruthy();
      expect(order()).toEqual(latestFirst);
    }
  );

  it("says how many integrations an account keeps", async () => {
    await ownerDevice();
    // Created on another of the owner's devices: the roster counts them.
    for (let index = 0; index < MAX_INTEGRATIONS; index += 1) {
      await publishIntegration(getAccountTeamKeys()!, {
        id: index.toString(16).padStart(32, "0"),
        name: `Integration ${index}`,
        createdAt: 1790000000,
        platform: "node"
      });
    }
    await renderRouter(routes, { initialUrl: "/integrations" });
    await openKeyStep();
    await fireEvent.changeText(screen.getByTestId("integration-name"), "Shop");
    await fireEvent.press(screen.getByTestId("integration-create"));
    expect(
      await screen.findByText(
        "Your account already has 20 integrations. Remove one to create another."
      )
    ).toBeTruthy();
  });

  it("creates them in a build without a web app too: their server needs no page", async () => {
    mockWebApp.mockReturnValue(null);
    await ownerDevice();
    await renderRouter(routes, { initialUrl: "/integrations" });
    await openKeyStep();
    await fireEvent.changeText(screen.getByTestId("integration-name"), "Shop");
    await fireEvent.press(screen.getByTestId("integration-create"));
    expect(await screen.findByTestId("integration-key")).toBeTruthy();
    expect(await integrations()).toHaveLength(1);
  });

  it("lists them in a table on desktop, their key copied with the dialog's button", async () => {
    mockDesktop.mockReturnValue(true);
    await ownerDevice();
    const { integration, secretKey } = await createIntegration("Shopify Store", "node");
    await renderRouter(routes, { initialUrl: "/integrations" });

    const row = await screen.findByTestId(`integration-${integration.id}`);
    expect(within(row).getByText(/^Created on /)).toBeTruthy();
    expect(
      within(row).getByTestId("integration-avatar-node", { includeHiddenElements: true })
    ).toBeTruthy();
    expect(screen.getByTestId("integrations-column-name")).toBeTruthy();
    expect(screen.getByTestId("integrations-column-date")).toBeTruthy();

    expect(within(row).queryByTestId(`show-${integration.id}`)).toBeNull();
    expect(screen.queryByText(secretKey)).toBeNull();

    // A new one: its key in the dialog, copied with its button, then gone.
    await openKeyStep();
    await fireEvent.changeText(screen.getByTestId("integration-name"), "Till Tool");
    await fireEvent.press(screen.getByTestId("integration-create"));
    const shown = String((await screen.findByTestId("integration-key")).props.children);
    expect(screen.getByTestId("integration-key-once")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("integration-copy"));
    expect(jest.mocked(Clipboard.setStringAsync)).toHaveBeenLastCalledWith(shown, SECRET_COPY);
    await fireEvent.press(screen.getByTestId("integration-done"));
    expect(await screen.findByText("Till Tool")).toBeTruthy();
    expect(screen.queryByTestId("integration-key")).toBeNull();
  });

  it('creates one integration for two taps in a row on "Create the key", and shows its key', async () => {
    await ownerDevice();
    await renderRouter(routes, { initialUrl: "/integrations" });
    await openKeyStep();
    await fireEvent.changeText(screen.getByTestId("integration-name"), "Shop");
    const create = screen.getByTestId("integration-create");
    await act(async () => {
      fireEvent.press(create);
      fireEvent.press(create);
    });
    const shown = String((await screen.findByTestId("integration-key")).props.children);
    // Never a second one, whose key would have taken the first one's place before it showed.
    const created = await integrations();
    expect(created).toHaveLength(1);
    expect(parseIntegrationKey(shown)?.key).toEqual(
      integrationSecretKey(getAccountTeamKeys()!, created[0]!.id)
    );
  });

  it("says when the key could not be copied, and journals it without the key", async () => {
    await ownerDevice();
    await renderRouter(routes, { initialUrl: "/integrations" });
    await openKeyStep();
    await fireEvent.changeText(screen.getByTestId("integration-name"), "Shop");
    await fireEvent.press(screen.getByTestId("integration-create"));
    const shown = String((await screen.findByTestId("integration-key")).props.children);
    const failures = () =>
      readLog().entries.filter(({ event }) => event === "Copying the integration's key failed");
    // Plain words, which the journal keeps of other errors: never of this one, its kind only.
    jest.mocked(Clipboard.setStringAsync).mockRejectedValueOnce(new Error("permission denied"));
    await fireEvent.press(screen.getByTestId("integration-copy"));
    // A notification, its final period left out.
    expect(
      await screen.findByText("The key could not be copied. Select it, then copy it")
    ).toBeTruthy();
    expect(failures()).toEqual([
      expect.objectContaining({ error: { kind: "Error", code: null, message: null, cause: null } })
    ]);
    // Not copied without an error (the web's legacy copy): journaled too.
    jest.mocked(Clipboard.setStringAsync).mockResolvedValueOnce(false);
    await fireEvent.press(screen.getByTestId("integration-copy"));
    await waitFor(() => expect(failures()).toHaveLength(2));
    expect(failures()[1]).toMatchObject({ error: null });
    expect(JSON.stringify(readLog())).not.toContain(shown);
  });
});

describe('"New integration"', () => {
  it('lists the online shops, "Coming soon" until their guide, then the SDKs, folded', async () => {
    // Magento without its guide, as a shop before its plugin's first release.
    mockGuides.mockReturnValue({ magento: null });
    await ownerDevice();
    await renderRouter(routes, { initialUrl: "/integrations" });
    await fireEvent.press(await screen.findByTestId("create-integration"));
    const catalog = screen.getByTestId("integration-catalog");
    expect(
      within(catalog).getByText(
        "Make your invoices with an AI, take payments on your online shop or from your own website."
      )
    ).toBeTruthy();
    expect(within(catalog).getByText("Online shops")).toBeTruthy();

    // Their guide written, WooCommerce, Wix, be-BOP, pretix, GrandNode, nopCommerce, Smartstore and PrestaShop are tiles of the
    // shops' grid, in the catalogue's order, each a button, its logo above its name.
    expect(
      within(screen.getByTestId("integration-shops-grid"))
        .getAllByTestId(/^integration-option-/)
        .map((tile) => tile.props.testID)
    ).toEqual([
      "integration-option-woocommerce",
      "integration-option-wix",
      "integration-option-bebop",
      "integration-option-pretix",
      "integration-option-grandnode",
      "integration-option-nopcommerce",
      "integration-option-smartstore",
      "integration-option-prestashop"
    ]);
    const woocommerce = within(catalog).getByTestId("integration-option-woocommerce");
    expect(woocommerce.props.accessibilityRole).toBe("button");
    expect(woocommerce.props.accessibilityLabel).toBe("WooCommerce");
    expect(within(woocommerce).getByText("WooCommerce")).toBeTruthy();
    expect(within(woocommerce).queryByText("Coming soon")).toBeNull();
    expect(
      within(woocommerce).getByTestId("integration-logo-woocommerce", {
        includeHiddenElements: true
      })
    ).toBeTruthy();
    const grandnode = within(catalog).getByTestId("integration-option-grandnode");
    expect(grandnode.props.accessibilityRole).toBe("button");
    expect(grandnode.props.accessibilityLabel).toBe("GrandNode");
    expect(within(grandnode).getByText("GrandNode")).toBeTruthy();
    expect(within(grandnode).queryByText("Coming soon")).toBeNull();
    expect(
      within(grandnode).getByTestId("integration-logo-grandnode", { includeHiddenElements: true })
    ).toBeTruthy();
    const bebop = within(catalog).getByTestId("integration-option-bebop");
    expect(bebop.props.accessibilityRole).toBe("button");
    expect(bebop.props.accessibilityLabel).toBe("be-BOP");
    expect(within(bebop).getByText("be-BOP")).toBeTruthy();
    expect(within(bebop).queryByText("Coming soon")).toBeNull();
    expect(
      within(bebop).getByTestId("integration-logo-bebop", { includeHiddenElements: true })
    ).toBeTruthy();
    const nopcommerce = within(catalog).getByTestId("integration-option-nopcommerce");
    expect(nopcommerce.props.accessibilityRole).toBe("button");
    expect(nopcommerce.props.accessibilityLabel).toBe("nopCommerce");
    expect(within(nopcommerce).getByText("nopCommerce")).toBeTruthy();
    expect(within(nopcommerce).queryByText("Coming soon")).toBeNull();
    expect(
      within(nopcommerce).getByTestId("integration-logo-nopcommerce", {
        includeHiddenElements: true
      })
    ).toBeTruthy();
    const pretix = within(catalog).getByTestId("integration-option-pretix");
    expect(
      within(screen.getByTestId("integration-shops-grid")).getByTestId("integration-option-pretix")
    ).toBe(pretix);
    expect(pretix.props.accessibilityRole).toBe("button");
    expect(pretix.props.accessibilityLabel).toBe("pretix");
    expect(within(pretix).getByText("pretix")).toBeTruthy();
    expect(within(pretix).queryByText("Coming soon")).toBeNull();
    expect(
      within(pretix).getByTestId("integration-logo-pretix", { includeHiddenElements: true })
    ).toBeTruthy();

    // Without a guide yet, the other shops are chips under one "Coming soon", in the catalogue's
    // order, each its logo and name, and a press opens nothing.
    const soon = within(catalog).getByTestId("integration-shops-soon");
    expect(within(soon).getByText("Coming soon")).toBeTruthy();
    expect(within(pretix).queryByTestId("integration-shops-soon")).toBeNull();
    const upcoming = SHOP_PLATFORMS.filter(
      (shop) =>
        shop.id !== "woocommerce" &&
        shop.id !== "wix" &&
        shop.id !== "bebop" &&
        shop.id !== "pretix" &&
        shop.id !== "grandnode" &&
        shop.id !== "nopcommerce" &&
        shop.id !== "smartstore" &&
        shop.id !== "prestashop"
    );
    expect(
      within(soon)
        .getAllByTestId(/^integration-option-/)
        .map((chip) => chip.props.testID)
    ).toEqual(upcoming.map(({ id }) => `integration-option-${id}`));
    for (const platform of upcoming) {
      const chip = within(soon).getByTestId(`integration-option-${platform.id}`);
      expect(within(chip).getByText(platform.name)).toBeTruthy();
      expect(
        within(chip).getByTestId(`integration-logo-${platform.id}`, { includeHiddenElements: true })
      ).toBeTruthy();
      expect(chip.props.accessibilityLabel).toBe(`${platform.name}: coming soon`);
      expect(chip.props.accessibilityState).toEqual({ disabled: true });
      expect(chip.props.accessibilityRole).toBeUndefined();
      await fireEvent.press(chip);
    }
    expect(screen.getByText("New integration")).toBeTruthy();
    expect(screen.queryByTestId("integration-option")).toBeNull();

    // The SDKs, under one row until it is opened.
    const developers = screen.getByTestId("integration-developers");
    expect(within(developers).getByText("SDK: Node.js, Python, PHP and 5 others")).toBeTruthy();
    expect(developers.props.accessibilityState).toMatchObject({ expanded: false });
    expect(screen.queryByTestId("integration-option-node")).toBeNull();
    expect(screen.queryByTestId("integration-languages-soon")).toBeNull();
    await fireEvent.press(developers);
    expect(screen.getByTestId("integration-developers").props.accessibilityState).toMatchObject({
      expanded: true
    });
    // Every language is published: each a tile of the languages' grid (its registry on its page),
    // and no "Coming soon" under them (the shops' one above shows how an unpublished option is
    // drawn).
    const languagesGrid = screen.getByTestId("integration-languages-grid");
    expect(screen.queryByTestId("integration-languages-soon")).toBeNull();
    for (const language of SDK_LANGUAGES) {
      expect([language.id, language.package !== null]).toEqual([language.id, true]);
      const option = screen.getByTestId(`integration-option-${language.id}`);
      expect(within(option).getByText(language.name)).toBeTruthy();
      expect(option.props.accessibilityRole).toBe("button");
      expect(option.props.accessibilityLabel).toBe(language.name);
      expect(within(languagesGrid).getByTestId(`integration-option-${language.id}`)).toBe(option);
    }
    await fireEvent.press(screen.getByTestId("integration-developers"));
    expect(screen.queryByTestId("integration-option-node")).toBeNull();
  });

  it("shows the same grid on desktop: what can be chosen in tiles, in the catalogue's order", async () => {
    mockDesktop.mockReturnValue(true);
    mockGuides.mockReturnValue({ woocommerce: GUIDE });
    await ownerDevice();
    await renderRouter(routes, { initialUrl: "/integrations" });
    await fireEvent.press(await screen.findByTestId("create-integration"));

    const catalog = screen.getByTestId("integration-catalog");
    // WooCommerce (this test's guide), Wix, be-BOP, pretix, GrandNode, nopCommerce, Smartstore,
    // PrestaShop and Magento, tiles in the catalogue's order, and no "Coming soon".
    expect(
      within(catalog)
        .getAllByRole("button")
        .map((row) => row.props.testID)
        .filter((id: string) => /^integration-option-/.test(id))
    ).toEqual([
      "integration-option-woocommerce",
      "integration-option-wix",
      "integration-option-bebop",
      "integration-option-pretix",
      "integration-option-grandnode",
      "integration-option-nopcommerce",
      "integration-option-smartstore",
      "integration-option-prestashop",
      "integration-option-magento"
    ]);
    expect(within(catalog).queryByTestId("integration-shops-soon")).toBeNull();

    // A tile opens its guide; back, the list again.
    await fireEvent.press(screen.getByTestId("integration-option-woocommerce"));
    expect(screen.getByTestId("integration-guide")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("sheet-back"));
    expect(screen.getByTestId("integration-catalog")).toBeTruthy();
  });

  it("puts three tiles a row, two where three would cut the longest names", async () => {
    mockGuides.mockReturnValue(
      Object.fromEntries(SHOP_PLATFORMS.map((platform) => [platform.id, GUIDE]))
    );
    await ownerDevice();
    await renderRouter(routes, { initialUrl: "/integrations" });
    await fireEvent.press(await screen.findByTestId("create-integration"));
    const widths = () =>
      SHOP_PLATFORMS.map(
        ({ id }) =>
          StyleSheet.flatten(screen.getByTestId(`integration-cell-${id}`).props.style).width
      );
    const third = `${100 / 3}%`;
    // Not measured yet: the window's width (Jest's, 750 px): three a row.
    expect(new Set(widths())).toEqual(new Set([third]));
    const layout = (width: number) =>
      fireEvent(screen.getByTestId("integration-shops-grid"), "layout", {
        nativeEvent: { layout: { x: 0, y: 0, width, height: 400 } }
      });
    // A 390 px phone's grid (346 px, and its cells' padding: 356 px): three a row.
    await layout(356);
    expect(new Set(widths())).toEqual(new Set([third]));
    // A 375 px phone's: two a row, the last cells too.
    await layout(341);
    expect(new Set(widths())).toEqual(new Set(["50%"]));
    // The desktop's dialog: three again.
    await layout(562);
    expect(new Set(widths())).toEqual(new Set([third]));
  });

  it("draws two tiles a row from the first frame on a narrow phone, before any measure", async () => {
    mockGuides.mockReturnValue(
      Object.fromEntries(SHOP_PLATFORMS.map((platform) => [platform.id, GUIDE]))
    );
    const before = Dimensions.get("window");
    // A 375 px phone: its sheet as wide as the window, never three a row then two.
    Dimensions.set({ window: { ...before, width: 375 }, screen: Dimensions.get("screen") });
    try {
      await ownerDevice();
      await renderRouter(routes, { initialUrl: "/integrations" });
      await fireEvent.press(await screen.findByTestId("create-integration"));
      expect(
        StyleSheet.flatten(screen.getByTestId("integration-cell-woocommerce").props.style).width
      ).toBe("50%");
    } finally {
      Dimensions.set({ window: before, screen: Dimensions.get("screen") });
    }
  });

  it('shows no "Coming soon" once every shop has its guide', async () => {
    mockGuides.mockReturnValue(
      Object.fromEntries(SHOP_PLATFORMS.map((platform) => [platform.id, GUIDE]))
    );
    await ownerDevice();
    await renderRouter(routes, { initialUrl: "/integrations" });
    await fireEvent.press(await screen.findByTestId("create-integration"));
    expect(screen.queryByTestId("integration-shops-soon")).toBeNull();
    for (const platform of SHOP_PLATFORMS) {
      expect(screen.getByTestId(`integration-option-${platform.id}`).props.accessibilityRole).toBe(
        "button"
      );
    }
  });

  it("opens a published SDK's page on its registry, and goes back to the list", async () => {
    await ownerDevice();
    jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    await renderRouter(routes, { initialUrl: "/integrations" });
    await openKeyStep();

    expect(screen.getByText("Node.js")).toBeTruthy();
    expect(
      screen.getByText(
        "The Node.js SDK creates the invoice of each order on your server and checks its payment."
      )
    ).toBeTruthy();
    const link = screen.getByTestId("integration-package");
    expect(within(link).getByText("@sattleme/checkout")).toBeTruthy();
    expect(within(link).getByText("Open on npmjs.com")).toBeTruthy();
    expect(link.props.accessibilityLabel).toBe("Open @sattleme/checkout on npmjs.com");
    await fireEvent.press(link);
    expect(Linking.openURL).toHaveBeenCalledWith(
      "https://www.npmjs.com/package/@sattleme/checkout"
    );
    expect(
      screen.getByText(
        "Your server reads it from an environment variable, never from a web page or a code repository. It will be shown only once."
      )
    ).toBeTruthy();
    expect(screen.getByText("Name of the site or tool")).toBeTruthy();

    // Back to the list: nothing was created.
    await fireEvent.press(screen.getByTestId("sheet-back"));
    expect(screen.getByTestId("integration-catalog")).toBeTruthy();
    expect(screen.getByText("New integration")).toBeTruthy();
    expect(screen.queryByTestId("integration-name")).toBeNull();
    expect(await integrations()).toEqual([]);

    // Python's, on PyPI.
    await fireEvent.press(screen.getByTestId("integration-option-python"));
    expect(
      screen.getByText(
        "The Python SDK creates the invoice of each order on your server and checks its payment."
      )
    ).toBeTruthy();
    const python = screen.getByTestId("integration-package");
    expect(within(python).getByText("sattleme-checkout")).toBeTruthy();
    expect(within(python).getByText("Open on pypi.org")).toBeTruthy();
    expect(python.props.accessibilityLabel).toBe("Open sattleme-checkout on pypi.org");
    await fireEvent.press(python);
    expect(Linking.openURL).toHaveBeenLastCalledWith("https://pypi.org/project/sattleme-checkout/");

    // PHP's, on Packagist.
    await fireEvent.press(screen.getByTestId("sheet-back"));
    await fireEvent.press(screen.getByTestId("integration-option-php"));
    expect(
      screen.getByText(
        "The PHP SDK creates the invoice of each order on your server and checks its payment."
      )
    ).toBeTruthy();
    const php = screen.getByTestId("integration-package");
    expect(within(php).getByText("sattleme/checkout")).toBeTruthy();
    expect(within(php).getByText("Open on packagist.org")).toBeTruthy();
    expect(php.props.accessibilityLabel).toBe("Open sattleme/checkout on packagist.org");
    await fireEvent.press(php);
    expect(Linking.openURL).toHaveBeenLastCalledWith(
      "https://packagist.org/packages/sattleme/checkout"
    );

    // Rust's, on crates.io.
    await fireEvent.press(screen.getByTestId("sheet-back"));
    await fireEvent.press(screen.getByTestId("integration-option-rust"));
    expect(
      screen.getByText(
        "The Rust SDK creates the invoice of each order on your server and checks its payment."
      )
    ).toBeTruthy();
    const rust = screen.getByTestId("integration-package");
    expect(within(rust).getByText("sattleme-checkout")).toBeTruthy();
    expect(within(rust).getByText("Open on crates.io")).toBeTruthy();
    expect(rust.props.accessibilityLabel).toBe("Open sattleme-checkout on crates.io");
    await fireEvent.press(rust);
    expect(Linking.openURL).toHaveBeenLastCalledWith("https://crates.io/crates/sattleme-checkout");

    // .NET's, on NuGet.
    await fireEvent.press(screen.getByTestId("sheet-back"));
    await fireEvent.press(screen.getByTestId("integration-option-dotnet"));
    expect(
      screen.getByText(
        "The .NET SDK creates the invoice of each order on your server and checks its payment."
      )
    ).toBeTruthy();
    const dotnet = screen.getByTestId("integration-package");
    expect(within(dotnet).getByText("Sattleme.Checkout")).toBeTruthy();
    expect(within(dotnet).getByText("Open on nuget.org")).toBeTruthy();
    expect(dotnet.props.accessibilityLabel).toBe("Open Sattleme.Checkout on nuget.org");
    await fireEvent.press(dotnet);
    expect(Linking.openURL).toHaveBeenLastCalledWith(
      "https://www.nuget.org/packages/Sattleme.Checkout"
    );

    // Ruby's, on RubyGems.org.
    await fireEvent.press(screen.getByTestId("sheet-back"));
    await fireEvent.press(screen.getByTestId("integration-option-ruby"));
    expect(
      screen.getByText(
        "The Ruby SDK creates the invoice of each order on your server and checks its payment."
      )
    ).toBeTruthy();
    const ruby = screen.getByTestId("integration-package");
    expect(within(ruby).getByText("sattleme-checkout")).toBeTruthy();
    expect(within(ruby).getByText("Open on rubygems.org")).toBeTruthy();
    expect(ruby.props.accessibilityLabel).toBe("Open sattleme-checkout on rubygems.org");
    await fireEvent.press(ruby);
    expect(Linking.openURL).toHaveBeenLastCalledWith("https://rubygems.org/gems/sattleme-checkout");

    // Go's, its latest release on GitHub.
    await fireEvent.press(screen.getByTestId("sheet-back"));
    await fireEvent.press(screen.getByTestId("integration-option-go"));
    expect(
      screen.getByText(
        "The Go SDK creates the invoice of each order on your server and checks its payment."
      )
    ).toBeTruthy();
    const go = screen.getByTestId("integration-package");
    expect(within(go).getByText("github.com/sattleme/checkout-go")).toBeTruthy();
    expect(within(go).getByText("Open on github.com")).toBeTruthy();
    expect(go.props.accessibilityLabel).toBe("Open github.com/sattleme/checkout-go on github.com");
    await fireEvent.press(go);
    expect(Linking.openURL).toHaveBeenLastCalledWith(
      "https://github.com/sattleme/checkout-go/releases/latest"
    );

    // Java's, in its own Maven repository.
    await fireEvent.press(screen.getByTestId("sheet-back"));
    await fireEvent.press(screen.getByTestId("integration-option-java"));
    expect(
      screen.getByText(
        "The Java SDK creates the invoice of each order on your server and checks its payment."
      )
    ).toBeTruthy();
    const java = screen.getByTestId("integration-package");
    expect(within(java).getByText("me.sattle:checkout")).toBeTruthy();
    expect(within(java).getByText("Open on maven.sattle.me")).toBeTruthy();
    expect(java.props.accessibilityLabel).toBe("Open me.sattle:checkout on maven.sattle.me");
    await fireEvent.press(java);
    expect(Linking.openURL).toHaveBeenLastCalledWith("https://maven.sattle.me/");
    expect(await integrations()).toEqual([]);
  });

  it("links each shop's guide and each language's page to its source code, in the header", async () => {
    await ownerDevice();
    jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    await renderRouter(routes, { initialUrl: "/integrations" });
    await fireEvent.press(await screen.findByTestId("create-integration"));
    // Not on the list.
    expect(screen.queryByTestId("integration-source")).toBeNull();

    const shops = {
      woocommerce: "https://github.com/sattleme/checkout-woocommerce",
      wix: "https://github.com/sattleme/checkout-wix",
      // be-BOP's processor is part of be-BOP itself: no repository of sattle.me's.
      bebop: null,
      pretix: "https://github.com/sattleme/checkout-pretix",
      grandnode: "https://github.com/sattleme/checkout-grandnode",
      nopcommerce: "https://github.com/sattleme/checkout-nopcommerce",
      smartstore: "https://github.com/sattleme/checkout-smartstore",
      prestashop: "https://github.com/sattleme/checkout-prestashop",
      magento: "https://github.com/sattleme/checkout-magento"
    };
    const languages = {
      node: "https://github.com/sattleme/checkout-node",
      python: "https://github.com/sattleme/checkout-python",
      php: "https://github.com/sattleme/checkout-php",
      rust: "https://github.com/sattleme/checkout-rust",
      java: "https://github.com/sattleme/checkout-java",
      dotnet: "https://github.com/sattleme/checkout-dotnet",
      ruby: "https://github.com/sattleme/checkout-ruby",
      go: "https://github.com/sattleme/checkout-go"
    };
    const check = async (name: string, url: string | null) => {
      if (url === null) {
        expect([name, screen.queryByTestId("integration-source")]).toEqual([name, null]);
        return;
      }
      await measureSource(70, 77);
      const source = screen.getByTestId("integration-source");
      expect(source.props.accessibilityRole).toBe("link");
      expect(source.props.accessibilityLabel).toBe(`${name}: source code on GitHub`);
      expect(within(source).getByText("Source code")).toBeTruthy();
      await fireEvent.press(source);
      expect([name, jest.mocked(Linking.openURL).mock.lastCall]).toEqual([name, [url]]);
    };
    for (const { id, name } of SHOP_PLATFORMS) {
      await fireEvent.press(screen.getByTestId(`integration-option-${id}`));
      expect(screen.getByText(name)).toBeTruthy();
      await check(name, shops[id]);
      await fireEvent.press(screen.getByTestId("sheet-back"));
    }
    await fireEvent.press(screen.getByTestId("integration-developers"));
    for (const { id, name } of SDK_LANGUAGES) {
      await fireEvent.press(screen.getByTestId(`integration-option-${id}`));
      expect(screen.getByTestId("integration-sdk")).toBeTruthy();
      await check(name, languages[id]);
      await fireEvent.press(screen.getByTestId("sheet-back"));
    }
    // Back on the list: none.
    expect(screen.getByTestId("integration-catalog")).toBeTruthy();
    expect(screen.queryByTestId("integration-source")).toBeNull();

    // "AI assistant": none, neither on the choice of its way nor on its steps.
    await fireEvent.press(screen.getByTestId("integration-assistant"));
    expect(screen.getByTestId("assistant-choice")).toBeTruthy();
    expect(screen.queryByTestId("integration-source")).toBeNull();
    await fireEvent.press(screen.getByTestId("assistant-hosted"));
    expect(screen.getByTestId("assistant-steps-hosted")).toBeTruthy();
    expect(screen.queryByTestId("integration-source")).toBeNull();
    expect(await integrations()).toEqual([]);
  });

  it("shows GitHub's mark alone where the title and its label would not both fit", async () => {
    const before = Dimensions.get("window");
    const resize = (width: number) =>
      act(async () => {
        Dimensions.set({ window: { ...before, width }, screen: Dimensions.get("screen") });
      });
    const labelled = () => {
      const source = screen.getByTestId("integration-source");
      // Its name for a screen reader, label or not.
      expect(source.props.accessibilityLabel).toBe("WooCommerce: source code on GitHub");
      return within(source).queryByText("Source code") !== null;
    };
    try {
      await ownerDevice();
      await renderRouter(routes, { initialUrl: "/integrations" });
      await fireEvent.press(await screen.findByTestId("create-integration"));
      await fireEvent.press(screen.getByTestId("integration-option-woocommerce"));
      // Not measured yet: the mark alone, never a title cut for a frame.
      expect(labelled()).toBe(false);
      // The texts off screen, hidden from screen readers.
      expect(screen.queryByText("WooCommerce", { includeHiddenElements: false })).not.toBeNull();
      expect(
        screen.getByTestId("integration-source-measure-title", { includeHiddenElements: true })
      ).toBeTruthy();
      expect(screen.queryByTestId("integration-source-measure-title")).toBeNull();
      // "WooCommerce" and "Source code" as the web app draws them (144 and 77 px), on a 375 px
      // phone: 331 px for the header, 103 of them for the arrow, the cross and the link's own.
      await resize(375);
      await measureSource(144, 77);
      expect(labelled()).toBe(true);
      // A 360 px phone: no room.
      await resize(360);
      expect(labelled()).toBe(false);
      // A larger system text, on a 375 px phone: no room; on a 430 px one: room.
      await resize(375);
      await measureSource(166, 89);
      expect(labelled()).toBe(false);
      await resize(430);
      expect(labelled()).toBe(true);
      // A hidden view of the web app reports 0: the widths measured stay.
      await measureSource(0, 0);
      expect(labelled()).toBe(true);
      // The desktop's dialog: always.
      mockDesktop.mockReturnValue(true);
      await resize(1024);
      await measureSource(400, 400);
      expect(labelled()).toBe(true);
    } finally {
      await act(async () => {
        Dimensions.set({ window: before, screen: Dimensions.get("screen") });
      });
    }
  });

  it("starts from the list at each opening", async () => {
    await ownerDevice();
    await renderRouter(routes, { initialUrl: "/integrations" });
    await openKeyStep();
    await fireEvent.changeText(screen.getByTestId("integration-name"), "Shop");
    await fireEvent.press(
      within(screen.getByTestId("integration-create-sheet")).getByLabelText("Close")
    );
    await waitFor(() => expect(screen.queryByTestId("integration-create-sheet")).toBeNull());

    await fireEvent.press(screen.getByTestId("create-integration"));
    expect(await screen.findByTestId("integration-catalog")).toBeTruthy();
    expect(screen.queryByTestId("integration-option-node")).toBeNull();
    expect(screen.queryByTestId("integration-name")).toBeNull();
    expect(await integrations()).toEqual([]);
  });

  it("creates the key at its step of a plugin's guide, then the guide goes on", async () => {
    mockGuides.mockReturnValue({ woocommerce: GUIDE });
    await ownerDevice();
    jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    await renderRouter(routes, { initialUrl: "/integrations" });
    await fireEvent.press(await screen.findByTestId("create-integration"));

    // Its guide written: WooCommerce can be chosen, as every shop now.
    const row = screen.getByTestId("integration-option-woocommerce");
    expect(row.props.accessibilityRole).toBe("button");
    expect(screen.queryByTestId("integration-shops-soon")).toBeNull();
    await fireEvent.press(row);

    // Its steps in their order, the key at the third, numbered with the others.
    const guide = screen.getByTestId("integration-guide");
    expect(
      within(guide)
        .getAllByText(
          /^(Install the plugin|Open its settings|Create this shop's key|Paste the key and save)$/
        )
        .map((node) => node.props.children)
    ).toEqual([
      "Install the plugin",
      "Open its settings",
      "Create this shop's key",
      "Paste the key and save"
    ]);
    expect(within(guide).getByText("1")).toBeTruthy();
    expect(within(guide).getByText("2")).toBeTruthy();
    expect(within(guide).queryByText("3")).toBeNull();
    expect(within(guide).getByText("4")).toBeTruthy();
    // Its commands as they are typed, selectable; its page in the browser.
    const code = within(guide).getByTestId("integration-guide-code-0");
    expect(code.props.children).toBe("shop plugin install sattleme\nshop cache flush");
    expect(code.props.selectable).toBe(true);
    await fireEvent.press(within(guide).getByText("Plugin page"));
    expect(Linking.openURL).toHaveBeenCalledWith("https://plugins.example/sattleme");

    const step = within(guide).getByTestId("integration-key-step");
    expect(
      within(step).getByText(
        "Do it when the key's field is open in WooCommerce: it will be shown only once."
      )
    ).toBeTruthy();
    expect(within(step).getByText("Shop name")).toBeTruthy();
    expect(within(step).getByTestId("integration-one-shop")).toBeTruthy();
    await fireEvent.changeText(within(step).getByTestId("integration-name"), "Lakeside Shop");
    await fireEvent.press(within(step).getByTestId("integration-create"));

    // The key in the guide, at its step; the next steps still there, the sheet closed by
    // "Done" only.
    const shown = String((await screen.findByTestId("integration-key")).props.children);
    const [integration] = await integrations();
    expect(integration).toMatchObject({ name: "Lakeside Shop", platform: "woocommerce" });
    expect(parseIntegrationKey(shown)).not.toBeNull();
    expect(within(guide).getByText("Key for Lakeside Shop")).toBeTruthy();
    expect(within(guide).getByText("Paste the key and save")).toBeTruthy();
    const sheet = screen.getByTestId("integration-create-sheet");
    expect(within(sheet).getByLabelText("Close")).toBeDisabled();
    expect(within(sheet).getByTestId("sheet-back")).toBeDisabled();
    // Listed already, behind the sheet.
    expect(await screen.findByTestId(`integration-${integration.id}`)).toBeTruthy();

    await fireEvent.press(screen.getByTestId("integration-done"));
    // Sliding away empty: the key is gone at once, the close button and the step back staying
    // disabled meanwhile.
    const leaving = screen.getByTestId("integration-create-sheet");
    expect(within(leaving).queryByTestId("integration-key")).toBeNull();
    expect(within(leaving).getByLabelText("Close")).toBeDisabled();
    expect(within(leaving).getByTestId("sheet-back")).toBeDisabled();
    await waitFor(() => expect(screen.queryByTestId("integration-create-sheet")).toBeNull());
  });

  it("opens pretix's guide: pretix's backend, its screenshots, then the key", async () => {
    await ownerDevice();
    await renderRouter(routes, { initialUrl: "/integrations" });
    await fireEvent.press(await screen.findByTestId("create-integration"));
    await fireEvent.press(screen.getByTestId("integration-option-pretix"));

    expect(within(screen.getByTestId("integration-create-sheet")).getByText("pretix")).toBeTruthy();
    const guide = screen.getByTestId("integration-guide");
    expect(
      within(guide)
        .getAllByText(
          /^(Open your event's plugins|Enable the plugin|Open its settings|Create this shop's key|Paste the key and save|Choose the sales channels|Check your shop)$/
        )
        .map((node) => node.props.children)
    ).toEqual([
      "Open your event's plugins",
      "Enable the plugin",
      "Open its settings",
      "Create this shop's key",
      "Paste the key and save",
      "Choose the sales channels",
      "Check your shop"
    ]);
    // Numbered with the key's step, which shows its key instead.
    for (const number of ["1", "2", "3", "5", "6", "7"]) {
      expect(within(guide).getByText(number)).toBeTruthy();
    }
    expect(within(guide).queryByText("4")).toBeNull();

    // Nothing to type: the plugin comes from pretix's marketplace.
    expect(within(guide).queryByTestId(/^integration-guide-code-/)).toBeNull();
    expect(
      within(guide).getByText(
        noBreak("In pretix's backend, open your event, then, in its menu, “Settings” → “Plugins”.")
      )
    ).toBeTruthy();
    expect(within(guide).getByText("Search for “sattle.me”, then click “Enable”.")).toBeTruthy();

    // pretix's screens, at their own aspect ratio, never wider than half their pixels, each told
    // to a screen reader.
    const shots: [number, number, number, string][] = [
      [0, 960, 484, "Screenshot of pretix: the event's menu, “Plugins” framed under “Settings”"],
      [
        1,
        904,
        696,
        "Screenshot of pretix: the plugins, searched for “sattle.me”, its “Enable” button framed"
      ],
      [
        2,
        904,
        452,
        "Screenshot of pretix: the payment providers, the “Settings” button of “Bitcoin (sattle.me)” framed"
      ],
      [
        4,
        904,
        1834,
        "Screenshot of pretix: the settings of Bitcoin (sattle.me), the “Enable payment method” box and the “Integration key” field framed"
      ],
      [
        5,
        904,
        256,
        "Screenshot of pretix: “Restrict to specific sales channels”, its “Online shop” box framed"
      ],
      [6, 960, 580, "Screenshot of a pretix shop: “Bitcoin” at the payment step"]
    ];
    for (const [index, width, height, label] of shots) {
      // Its box bounds the width; its frame inside holds the ratio of that bounded width, never a
      // `maxWidth` of its own (Yoga would take the height from the width before bounding it).
      const box = within(guide).getByTestId(`integration-guide-image-${index}`);
      expect(StyleSheet.flatten(box.props.style)).toMatchObject({
        width: "100%",
        maxWidth: width / 2
      });
      expect(StyleSheet.flatten(box.props.style).aspectRatio).toBeUndefined();
      const frame = within(box).getByTestId(`integration-guide-image-${index}-frame`);
      const frameStyle = StyleSheet.flatten(frame.props.style);
      expect(frameStyle).toMatchObject({ width: "100%", aspectRatio: width / height });
      expect(frameStyle.maxWidth).toBeUndefined();
      // The image fills it, its colours kept under Smart Invert.
      const image = within(frame).getByLabelText(noBreak(label));
      expect(image.props.accessibilityRole).toBe("image");
      expect(image.props.accessibilityIgnoresInvertColors).toBe(true);
      expect(StyleSheet.flatten(image.props.style)).toMatchObject({
        width: "100%",
        height: "100%"
      });
    }
    for (const index of [3]) {
      expect(within(guide).queryByTestId(`integration-guide-image-${index}`)).toBeNull();
    }

    // The key, once pretix's field for it shows.
    const step = within(guide).getByTestId("integration-key-step");
    expect(
      within(step).getByText(
        "Do it when the key's field is open in pretix: it will be shown only once."
      )
    ).toBeTruthy();
  });

  it("opens nopCommerce's guide: the plugin's download, nopCommerce's screens, then the key", async () => {
    await ownerDevice();
    await renderRouter(routes, { initialUrl: "/integrations" });
    await fireEvent.press(await screen.findByTestId("create-integration"));
    await fireEvent.press(screen.getByTestId("integration-option-nopcommerce"));

    expect(
      within(screen.getByTestId("integration-create-sheet")).getByText("nopCommerce")
    ).toBeTruthy();
    const guide = screen.getByTestId("integration-guide");
    expect(
      within(guide)
        .getAllByText(
          /^(Download the plugin|Open the local plugins|Upload the archive|Restart nopCommerce|Install the plugin|Open its settings|Create this shop's key|Paste the key and save|Check your shop|Exclude Bitcoin from auto-canceling)$/
        )
        .map((node) => node.props.children)
    ).toEqual([
      "Download the plugin",
      "Open the local plugins",
      "Upload the archive",
      "Restart nopCommerce",
      "Install the plugin",
      "Open its settings",
      "Create this shop's key",
      "Paste the key and save",
      "Check your shop",
      "Exclude Bitcoin from auto-canceling"
    ]);
    // Numbered with the key's step, which shows its key instead.
    for (const number of ["1", "2", "3", "4", "5", "6", "8", "9", "10"]) {
      expect(within(guide).getByText(number)).toBeTruthy();
    }
    expect(within(guide).queryByText("7")).toBeNull();

    // The plugin's archive, from its page on nopCommerce's marketplace; nothing to type.
    expect(within(guide).queryByTestId(/^integration-guide-code-/)).toBeNull();
    expect(within(guide).getByText("Open nopCommerce's marketplace")).toBeTruthy();
    expect(
      within(guide).getByText(
        noBreak("In nopCommerce's administration, open “Configuration” → “Local plugins”.")
      )
    ).toBeTruthy();

    // nopCommerce's screens, at their own aspect ratio, never wider than half their pixels, each
    // told to a screen reader.
    const shots: [number, number, number, string][] = [
      [1, 500, 408, "Screenshot of nopCommerce: the administration's menu, “Local plugins” framed"],
      [
        2,
        1000,
        818,
        "Screenshot of nopCommerce: the “Upload plugin or theme” window, the archive chosen, its “Upload plugin or theme” button framed"
      ],
      [
        3,
        596,
        210,
        "Screenshot of nopCommerce: “Local plugins”, its “Restart application to apply changes” button framed"
      ],
      [
        4,
        902,
        768,
        "Screenshot of nopCommerce: the plugin Bitcoin (sattle.me) in the list, its “Install” button framed"
      ],
      [
        5,
        908,
        872,
        "Screenshot of nopCommerce: the plugin Bitcoin (sattle.me), installed, its “Configure” button framed"
      ],
      [
        7,
        890,
        1000,
        "Screenshot of nopCommerce: the settings of Bitcoin (sattle.me), the “Enabled” box and the “Integration key” field framed"
      ],
      [8, 864, 922, "Screenshot of a nopCommerce shop: “Bitcoin” at the payment step"]
    ];
    for (const [index, width, height, label] of shots) {
      const box = within(guide).getByTestId(`integration-guide-image-${index}`);
      expect(StyleSheet.flatten(box.props.style)).toMatchObject({
        width: "100%",
        maxWidth: width / 2
      });
      const frame = within(box).getByTestId(`integration-guide-image-${index}-frame`);
      expect(StyleSheet.flatten(frame.props.style)).toMatchObject({
        width: "100%",
        aspectRatio: width / height
      });
      const image = within(frame).getByLabelText(noBreak(label));
      expect(image.props.accessibilityRole).toBe("image");
    }
    for (const index of [0, 6, 9]) {
      expect(within(guide).queryByTestId(`integration-guide-image-${index}`)).toBeNull();
    }

    // The key, once nopCommerce's field for it shows.
    const step = within(guide).getByTestId("integration-key-step");
    expect(
      within(step).getByText(
        "Do it when the key's field is open in nopCommerce: it will be shown only once."
      )
    ).toBeTruthy();
  });

  it("opens be-BOP's guide: sattle.me's settings in be-BOP, the key, then be-BOP's screens", async () => {
    await ownerDevice();
    await renderRouter(routes, { initialUrl: "/integrations" });
    await fireEvent.press(await screen.findByTestId("create-integration"));
    await fireEvent.press(screen.getByTestId("integration-option-bebop"));

    expect(within(screen.getByTestId("integration-create-sheet")).getByText("be-BOP")).toBeTruthy();
    const guide = screen.getByTestId("integration-guide");
    expect(
      within(guide)
        .getAllByText(
          /^(Open sattle\.me's settings|Create this shop's key|Paste the key and save|Test the connection|Put sattle\.me first|Check your shop)$/
        )
        .map((node) => node.props.children)
    ).toEqual([
      "Open sattle.me's settings",
      "Create this shop's key",
      "Paste the key and save",
      "Test the connection",
      "Put sattle.me first",
      "Check your shop"
    ]);
    // Numbered with the key's step, which shows its key instead.
    for (const number of ["1", "3", "4", "5", "6"]) {
      expect(within(guide).getByText(number)).toBeTruthy();
    }
    expect(within(guide).queryByText("2")).toBeNull();

    // sattle.me comes with be-BOP: nothing to download, nothing to type.
    expect(within(guide).queryByTestId(/^integration-guide-code-/)).toBeNull();
    expect(
      within(guide).getByText(
        noBreak(
          "In be-BOP's administration, open “Payment Settings” → “sattle.me”. If it is not in the list, update be-BOP first."
        )
      )
    ).toBeTruthy();

    // be-BOP's screens, at their own aspect ratio, never wider than half their pixels, each told to
    // a screen reader.
    const shots: [number, number, number, string][] = [
      [
        0,
        512,
        768,
        "Screenshot of be-BOP: the administration's menu, “sattle.me” framed under “Payment Settings”"
      ],
      [
        2,
        960,
        792,
        "Screenshot of be-BOP: the settings of sattle.me, the “Integration key” field, the “Also take on-chain payments” box and the “Save” button framed"
      ],
      [
        3,
        960,
        298,
        "Screenshot of be-BOP: the settings of sattle.me, the “Test connection” button framed"
      ],
      [
        4,
        960,
        978,
        "Screenshot of be-BOP: “Payment processor preferences”, sattleme-onchain and sattleme chosen and framed"
      ],
      [
        5,
        960,
        304,
        "Screenshot of a be-BOP shop: “Lightning” as the “Payment method” at the payment step"
      ]
    ];
    for (const [index, width, height, label] of shots) {
      const box = within(guide).getByTestId(`integration-guide-image-${index}`);
      expect(StyleSheet.flatten(box.props.style)).toMatchObject({
        width: "100%",
        maxWidth: width / 2
      });
      const frame = within(box).getByTestId(`integration-guide-image-${index}-frame`);
      expect(StyleSheet.flatten(frame.props.style)).toMatchObject({
        width: "100%",
        aspectRatio: width / height
      });
      const image = within(frame).getByLabelText(noBreak(label));
      expect(image.props.accessibilityRole).toBe("image");
    }
    expect(within(guide).queryByTestId("integration-guide-image-1")).toBeNull();

    // The key, once be-BOP's field for it shows.
    const step = within(guide).getByTestId("integration-key-step");
    expect(
      within(step).getByText(
        "Do it when the key's field is open in be-BOP: it will be shown only once."
      )
    ).toBeTruthy();
  });

  it("opens GrandNode's guide: the plugin's download, GrandNode's screens, then the key", async () => {
    await ownerDevice();
    await renderRouter(routes, { initialUrl: "/integrations" });
    await fireEvent.press(await screen.findByTestId("create-integration"));
    await fireEvent.press(screen.getByTestId("integration-option-grandnode"));

    expect(
      within(screen.getByTestId("integration-create-sheet")).getByText("GrandNode")
    ).toBeTruthy();
    const guide = screen.getByTestId("integration-guide");
    expect(
      within(guide)
        .getAllByText(
          /^(Download the plugin|Open the local plugins|Upload the archive|Install the plugin|Open its settings|Create this shop's key|Paste the key and save|Check your shop)$/
        )
        .map((node) => node.props.children)
    ).toEqual([
      "Download the plugin",
      "Open the local plugins",
      "Upload the archive",
      "Install the plugin",
      "Open its settings",
      "Create this shop's key",
      "Paste the key and save",
      "Check your shop"
    ]);
    // Numbered with the key's step, which shows its key instead.
    for (const number of ["1", "2", "3", "4", "5", "7", "8"]) {
      expect(within(guide).getByText(number)).toBeTruthy();
    }
    expect(within(guide).queryByText("6")).toBeNull();

    // The plugin's archive, from its GitHub releases; nothing to type.
    expect(within(guide).queryByTestId(/^integration-guide-code-/)).toBeNull();
    expect(within(guide).getByText("Open the plugin's GitHub page")).toBeTruthy();
    expect(
      within(guide).getByText(
        noBreak("In GrandNode's administration, open “Plugins” → “Local plugins”.")
      )
    ).toBeTruthy();

    // GrandNode's screens, at their own aspect ratio, never wider than half their pixels, each told
    // to a screen reader.
    const shots: [number, number, number, string][] = [
      [
        1,
        560,
        380,
        "Screenshot of GrandNode: the administration's “Plugins” menu, “Local plugins” framed"
      ],
      [
        2,
        896,
        528,
        "Screenshot of GrandNode: the “Upload” window, the archive chosen, its “Upload” button framed"
      ],
      [
        3,
        848,
        640,
        "Screenshot of GrandNode: the plugin Bitcoin (sattle.me) in the list, its “Install” button framed"
      ],
      [
        4,
        848,
        640,
        "Screenshot of GrandNode: the plugin Bitcoin (sattle.me), installed, its “Configure” button framed"
      ],
      [
        6,
        960,
        992,
        "Screenshot of GrandNode: the settings of Bitcoin (sattle.me), “Enabled”, the “Integration key” field and “Save” framed"
      ],
      [7, 904, 688, "Screenshot of a GrandNode shop: the bitcoin payment at the payment step"]
    ];
    for (const [index, width, height, label] of shots) {
      const box = within(guide).getByTestId(`integration-guide-image-${index}`);
      expect(StyleSheet.flatten(box.props.style)).toMatchObject({
        width: "100%",
        maxWidth: width / 2
      });
      const frame = within(box).getByTestId(`integration-guide-image-${index}-frame`);
      expect(StyleSheet.flatten(frame.props.style)).toMatchObject({
        width: "100%",
        aspectRatio: width / height
      });
      const image = within(frame).getByLabelText(noBreak(label));
      expect(image.props.accessibilityRole).toBe("image");
    }
    for (const index of [0, 5]) {
      expect(within(guide).queryByTestId(`integration-guide-image-${index}`)).toBeNull();
    }

    // The key, once GrandNode's field for it shows.
    const step = within(guide).getByTestId("integration-key-step");
    expect(
      within(step).getByText(
        "Do it when the key's field is open in GrandNode: it will be shown only once."
      )
    ).toBeTruthy();
  });
  it("downloads GrandNode's plugin itself: the latest release's archive once GitHub says which", async () => {
    const fetchMock = jest.mocked(globalThis.fetch);
    const network = fetchMock.getMockImplementation();
    let release: (body: unknown) => void = () => undefined;
    fetchMock.mockImplementation((input, init) =>
      String(input) === "https://api.github.com/repos/sattleme/checkout-grandnode/releases/latest"
        ? new Promise((resolve) => {
            release = (body) =>
              resolve({ ok: true, status: 200, json: async () => body } as Response);
          })
        : network!(input, init)
    );
    const opened = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    try {
      await ownerDevice();
      await renderRouter(routes, { initialUrl: "/integrations" });
      await fireEvent.press(await screen.findByTestId("create-integration"));
      await fireEvent.press(screen.getByTestId("integration-option-grandnode"));
      const guide = screen.getByTestId("integration-guide");
      // Until GitHub answers: the release's page.
      const page = within(guide).getByTestId("integration-guide-release-0-page");
      expect(within(page).getByText("Open the plugin's GitHub page")).toBeTruthy();
      await fireEvent.press(page);
      expect(opened).toHaveBeenLastCalledWith(
        "https://github.com/sattleme/checkout-grandnode/releases/latest"
      );

      release({
        tag_name: "v1.0.0",
        assets: [{ name: "Payments.Sattleme-1.0.0.zip" }, { name: "SHA256SUMS" }]
      });
      const link = await within(guide).findByTestId("integration-guide-release-0-download");
      expect(within(link).getByText("Download version 1.0.0")).toBeTruthy();
      expect(within(guide).queryByTestId("integration-guide-release-0-page")).toBeNull();
      await fireEvent.press(link);
      expect(opened).toHaveBeenLastCalledWith(
        "https://github.com/sattleme/checkout-grandnode/releases/download/v1.0.0/Payments.Sattleme-1.0.0.zip"
      );
    } finally {
      fetchMock.mockImplementation(network);
      opened.mockRestore();
    }
  });

  it("keeps GrandNode's release page when GitHub's answer has no archive", async () => {
    const fetchMock = jest.mocked(globalThis.fetch);
    const network = fetchMock.getMockImplementation();
    let answered = false;
    fetchMock.mockImplementation(async (input, init) => {
      if (
        String(input) !== "https://api.github.com/repos/sattleme/checkout-grandnode/releases/latest"
      ) {
        return network!(input, init);
      }
      answered = true;
      return {
        ok: true,
        status: 200,
        json: async () => ({ tag_name: "v1.0.0", assets: [{ name: "SHA256SUMS" }] })
      } as unknown as Response;
    });
    try {
      await ownerDevice();
      await renderRouter(routes, { initialUrl: "/integrations" });
      await fireEvent.press(await screen.findByTestId("create-integration"));
      await fireEvent.press(screen.getByTestId("integration-option-grandnode"));
      await waitFor(() => expect(answered).toBe(true));
      await waitFor(() =>
        expect(jest.mocked(console.warn)).toHaveBeenCalledWith(
          "Reading a plugin's latest release failed",
          expect.objectContaining({ message: expect.stringMatching(/has no file/) })
        )
      );
      const guide = screen.getByTestId("integration-guide");
      expect(within(guide).getByTestId("integration-guide-release-0-page")).toBeTruthy();
      expect(within(guide).queryByTestId("integration-guide-release-0-download")).toBeNull();
    } finally {
      fetchMock.mockImplementation(network);
    }
  });

  it("downloads nopCommerce's plugin itself, the marketplace's page until GitHub says which", async () => {
    const fetchMock = jest.mocked(globalThis.fetch);
    const network = fetchMock.getMockImplementation();
    let release: (body: unknown) => void = () => undefined;
    fetchMock.mockImplementation((input, init) =>
      String(input) === "https://api.github.com/repos/sattleme/checkout-nopcommerce/releases/latest"
        ? new Promise((resolve) => {
            release = (body) =>
              resolve({ ok: true, status: 200, json: async () => body } as Response);
          })
        : network!(input, init)
    );
    const opened = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    try {
      await ownerDevice();
      await renderRouter(routes, { initialUrl: "/integrations" });
      await fireEvent.press(await screen.findByTestId("create-integration"));
      await fireEvent.press(screen.getByTestId("integration-option-nopcommerce"));
      const guide = screen.getByTestId("integration-guide");
      const page = within(guide).getByTestId("integration-guide-release-0-page");
      expect(within(page).getByText("Open nopCommerce's marketplace")).toBeTruthy();
      await fireEvent.press(page);
      expect(opened).toHaveBeenLastCalledWith(
        "https://www.nopcommerce.com/bitcoin-payments-sattleme-lightning-and-on-chain"
      );

      release({
        tag_name: "v1.0.2",
        assets: [{ name: "Payments.Sattleme-1.0.2.zip" }, { name: "SHA256SUMS" }]
      });
      const link = await within(guide).findByTestId("integration-guide-release-0-download");
      expect(within(link).getByText("Download version 1.0.2")).toBeTruthy();
      await fireEvent.press(link);
      expect(opened).toHaveBeenLastCalledWith(
        "https://github.com/sattleme/checkout-nopcommerce/releases/download/v1.0.2/Payments.Sattleme-1.0.2.zip"
      );
    } finally {
      fetchMock.mockImplementation(network);
      opened.mockRestore();
    }
  });

  it("opens Smartstore's guide: the plugin's download, Smartstore's screens, then the key", async () => {
    await ownerDevice();
    await renderRouter(routes, { initialUrl: "/integrations" });
    await fireEvent.press(await screen.findByTestId("create-integration"));
    await fireEvent.press(screen.getByTestId("integration-option-smartstore"));

    expect(
      within(screen.getByTestId("integration-create-sheet")).getByText("Smartstore")
    ).toBeTruthy();
    const guide = screen.getByTestId("integration-guide");
    expect(
      within(guide)
        .getAllByText(
          /^(Download the plugin|Open the plugins|Upload the package|Reload the list of plugins|Install the plugin|Run the installation|Open its settings|Create this shop's key|Paste the key and save|Activate the payment method|Set your shop's time zone|Check your shop)$/
        )
        .map((node) => node.props.children)
    ).toEqual([
      "Download the plugin",
      "Open the plugins",
      "Upload the package",
      "Reload the list of plugins",
      "Install the plugin",
      "Run the installation",
      "Open its settings",
      "Create this shop's key",
      "Paste the key and save",
      "Activate the payment method",
      "Set your shop's time zone",
      "Check your shop"
    ]);
    // Numbered with the key's step, which shows its key instead.
    for (const number of ["1", "2", "3", "4", "5", "6", "7", "9", "10", "11", "12"]) {
      expect(within(guide).getByText(number)).toBeTruthy();
    }
    expect(within(guide).queryByText("8")).toBeNull();

    // The plugin's package, from its GitHub releases; nothing to type.
    expect(within(guide).queryByTestId(/^integration-guide-code-/)).toBeNull();
    expect(within(guide).getByText("Open the plugin's GitHub page")).toBeTruthy();
    expect(
      within(guide).getByText(
        noBreak("In Smartstore's administration, open “Plugins” → “Manage plugins”.")
      )
    ).toBeTruthy();

    // Smartstore's screens, at their own aspect ratio, never wider than half their pixels, each
    // told to a screen reader.
    const shots: [number, number, number, string][] = [
      [
        1,
        576,
        516,
        "Screenshot of Smartstore: the administration's “Plugins” menu, “Manage plugins” framed"
      ],
      [
        2,
        1840,
        328,
        "Screenshot of Smartstore: the plugins page, its “Upload plugin” button framed"
      ],
      [3, 1064, 328, "Screenshot of Smartstore: the “Edit” menu, “Reload list of plugins” framed"],
      [
        4,
        916,
        600,
        "Screenshot of Smartstore: the plugin Bitcoin (sattle.me) in the list, its “Install” button framed"
      ],
      [
        5,
        1840,
        328,
        "Screenshot of Smartstore: the plugins page, its “Execute tasks” button framed"
      ],
      [
        6,
        916,
        724,
        "Screenshot of Smartstore: the plugin Bitcoin (sattle.me), installed, its gear and “Configure” framed"
      ],
      [
        8,
        1840,
        776,
        "Screenshot of Smartstore: the settings of Bitcoin (sattle.me), the “Integration key” field and “Save” framed"
      ],
      [
        9,
        916,
        624,
        "Screenshot of Smartstore: the payment methods, the “Activate” button of Bitcoin framed"
      ],
      [11, 928, 728, "Screenshot of a Smartstore shop: “Bitcoin” at the payment step"]
    ];
    for (const [index, width, height, label] of shots) {
      const box = within(guide).getByTestId(`integration-guide-image-${index}`);
      expect(StyleSheet.flatten(box.props.style)).toMatchObject({
        width: "100%",
        maxWidth: width / 2
      });
      const frame = within(box).getByTestId(`integration-guide-image-${index}-frame`);
      expect(StyleSheet.flatten(frame.props.style)).toMatchObject({
        width: "100%",
        aspectRatio: width / height
      });
      const image = within(frame).getByLabelText(noBreak(label));
      expect(image.props.accessibilityRole).toBe("image");
    }
    for (const index of [0, 7, 10]) {
      expect(within(guide).queryByTestId(`integration-guide-image-${index}`)).toBeNull();
    }

    // The key, once Smartstore's field for it shows.
    const step = within(guide).getByTestId("integration-key-step");
    expect(
      within(step).getByText(
        "Do it when the key's field is open in Smartstore: it will be shown only once."
      )
    ).toBeTruthy();
  });
  it("opens PrestaShop's guide: the module's download, PrestaShop's screens, its cron, then the key", async () => {
    await ownerDevice();
    await renderRouter(routes, { initialUrl: "/integrations" });
    await fireEvent.press(await screen.findByTestId("create-integration"));
    await fireEvent.press(screen.getByTestId("integration-option-prestashop"));

    expect(
      within(screen.getByTestId("integration-create-sheet")).getByText("PrestaShop")
    ).toBeTruthy();
    const guide = screen.getByTestId("integration-guide");
    expect(
      within(guide)
        .getAllByText(
          /^(Download the module|Open the Module Manager|Upload the file|Open its settings|Create this shop's key|Paste the key and save|Set up the background checks|Check your shop)$/
        )
        .map((node) => node.props.children)
    ).toEqual([
      "Download the module",
      "Open the Module Manager",
      "Upload the file",
      "Open its settings",
      "Create this shop's key",
      "Paste the key and save",
      "Set up the background checks",
      "Check your shop"
    ]);
    // Numbered with the key's step, which shows its key instead.
    for (const number of ["1", "2", "3", "4", "6", "7", "8"]) {
      expect(within(guide).getByText(number)).toBeTruthy();
    }
    expect(within(guide).queryByText("5")).toBeNull();

    // The module's ZIP, from its GitHub releases; nothing to type.
    expect(within(guide).queryByTestId(/^integration-guide-code-/)).toBeNull();
    expect(within(guide).getByText("Open the module's GitHub page")).toBeTruthy();
    expect(
      within(guide).getByText(
        noBreak(
          "In PrestaShop's back office, open “Modules” → “Module Manager”, then click “Upload a module” at the top of the page."
        )
      )
    ).toBeTruthy();

    // PrestaShop's screens, at their own aspect ratio, never wider than half their pixels, each
    // told to a screen reader.
    const shots: [number, number, number, string][] = [
      [
        1,
        1632,
        176,
        "Screenshot of PrestaShop: the Module Manager, its “Upload a module” button framed"
      ],
      [
        2,
        1352,
        774,
        "Screenshot of PrestaShop: the “Upload a module” window, its area for the file framed"
      ],
      [
        3,
        1352,
        738,
        "Screenshot of PrestaShop: “Module installed!”, its “Configure” button framed"
      ],
      [
        5,
        1568,
        450,
        "Screenshot of PrestaShop: the settings of sattle.me, “Accept bitcoin payments” and the “Integration key” field framed"
      ],
      [
        6,
        1568,
        750,
        "Screenshot of PrestaShop: the settings of sattle.me saved, the crontab line under “Background checks” framed"
      ],
      [7, 960, 416, "Screenshot of a PrestaShop shop: “Pay with bitcoin” at the payment step"]
    ];
    for (const [index, width, height, label] of shots) {
      const box = within(guide).getByTestId(`integration-guide-image-${index}`);
      expect(StyleSheet.flatten(box.props.style)).toMatchObject({
        width: "100%",
        maxWidth: width / 2
      });
      const frame = within(box).getByTestId(`integration-guide-image-${index}-frame`);
      expect(StyleSheet.flatten(frame.props.style)).toMatchObject({
        width: "100%",
        aspectRatio: width / height
      });
      const image = within(frame).getByLabelText(noBreak(label));
      expect(image.props.accessibilityRole).toBe("image");
    }
    for (const index of [0, 4]) {
      expect(within(guide).queryByTestId(`integration-guide-image-${index}`)).toBeNull();
    }

    // The key, once PrestaShop's field for it shows.
    const step = within(guide).getByTestId("integration-key-step");
    expect(
      within(step).getByText(
        "Do it when the key's field is open in PrestaShop: it will be shown only once."
      )
    ).toBeTruthy();
  });
  it("opens WooCommerce's guide: the plugin's download, WordPress's screens, then the key", async () => {
    await ownerDevice();
    await renderRouter(routes, { initialUrl: "/integrations" });
    await fireEvent.press(await screen.findByTestId("create-integration"));
    await fireEvent.press(screen.getByTestId("integration-option-woocommerce"));

    expect(
      within(screen.getByTestId("integration-create-sheet")).getByText("WooCommerce")
    ).toBeTruthy();
    const guide = screen.getByTestId("integration-guide");
    expect(
      within(guide)
        .getAllByText(
          /^(Download the plugin|Upload the file|Activate the plugin|Open its settings|Create this shop's key|Paste the key and save|Check your shop)$/
        )
        .map((node) => node.props.children)
    ).toEqual([
      "Download the plugin",
      "Upload the file",
      "Activate the plugin",
      "Open its settings",
      "Create this shop's key",
      "Paste the key and save",
      "Check your shop"
    ]);
    // Numbered with the key's step, which shows its key instead.
    for (const number of ["1", "2", "3", "4", "6", "7"]) {
      expect(within(guide).getByText(number)).toBeTruthy();
    }
    expect(within(guide).queryByText("5")).toBeNull();

    // The plugin's ZIP, from its GitHub releases; nothing to type.
    expect(within(guide).queryByTestId(/^integration-guide-code-/)).toBeNull();
    expect(within(guide).getByText("Open the plugin's GitHub page")).toBeTruthy();
    expect(
      within(guide).getByText(
        noBreak(
          "In WordPress's administration, open “Plugins” → “Add Plugin”, click “Upload Plugin” at the top of the page, choose the file, then click “Install Now”."
        )
      )
    ).toBeTruthy();

    // WordPress's screens, at their own aspect ratio, never wider than half their pixels, each told
    // to a screen reader.
    const shots: [number, number, number, string][] = [
      [
        1,
        960,
        592,
        "Screenshot of WordPress: “Upload Plugin” and the file chosen, its “Upload Plugin” and “Install Now” buttons framed"
      ],
      [
        2,
        960,
        500,
        "Screenshot of WordPress: the plugin installed, its “Activate Plugin” button framed"
      ],
      [
        3,
        960,
        540,
        "Screenshot of WordPress: the plugin sattle.me for WooCommerce in the list of plugins, its “Settings” link framed"
      ],
      [
        5,
        960,
        928,
        "Screenshot of WordPress: the settings of sattle.me (Bitcoin) saved, “Connected to” and the ticked box framed"
      ],
      [6, 960, 368, "Screenshot of a WooCommerce shop: the bitcoin payment at the payment step"]
    ];
    for (const [index, width, height, label] of shots) {
      const box = within(guide).getByTestId(`integration-guide-image-${index}`);
      expect(StyleSheet.flatten(box.props.style)).toMatchObject({
        width: "100%",
        maxWidth: width / 2
      });
      const frame = within(box).getByTestId(`integration-guide-image-${index}-frame`);
      expect(StyleSheet.flatten(frame.props.style)).toMatchObject({
        width: "100%",
        aspectRatio: width / height
      });
      const image = within(frame).getByLabelText(noBreak(label));
      expect(image.props.accessibilityRole).toBe("image");
    }
    for (const index of [0, 4]) {
      expect(within(guide).queryByTestId(`integration-guide-image-${index}`)).toBeNull();
    }

    // The key, once WooCommerce's field for it shows.
    const step = within(guide).getByTestId("integration-key-step");
    expect(
      within(step).getByText(
        "Do it when the key's field is open in WooCommerce: it will be shown only once."
      )
    ).toBeTruthy();
  });
  it("opens Wix's guide: each file's name and content copied from the app, checked off once pasted", async () => {
    await ownerDevice();
    await renderRouter(routes, { initialUrl: "/integrations" });
    await fireEvent.press(await screen.findByTestId("create-integration"));
    await fireEvent.press(screen.getByTestId("integration-option-wix"));
    const guide = screen.getByTestId("integration-guide");
    // Each step shows Wix's screen, but the key's (the app's own); no page outside the app.
    expect(
      within(guide).getByLabelText(/^Wix's “Packages & Apps” panel: the cube icon/)
    ).toBeTruthy();
    for (const index of [0, 1, 2, 3, 4, 6, 7, 8, 9, 10]) {
      expect(within(guide).getByTestId(`integration-guide-image-${index}`)).toBeTruthy();
    }
    expect(within(guide).queryByTestId("integration-guide-image-5")).toBeNull();
    expect(within(guide).queryByRole("link")).toBeNull();
    const files = within(guide).getByTestId("integration-files");
    // The files' screen shows in their step, above the rows.
    expect(within(files).getByTestId("integration-guide-image-3")).toBeTruthy();
    expect(within(files).getAllByTestId(/^integration-file-\d+$/)).toHaveLength(6);
    // Read from the app's own files, each checked, before anything can be copied.
    await waitFor(() => expect(mockReadBundledFile).toHaveBeenCalledTimes(6));
    expect(mockReadBundledFile.mock.calls.map(([source]) => source)).toEqual([
      "sattleme-plugin.js.txt",
      "http-functions.js.txt",
      "events.js.txt",
      "jobs.config.txt",
      "sattlemeCheckout.js.txt",
      "sattlemeCheckout-config.js.txt"
    ]);

    // The plugin's own file first, open: where and how it is made, the line its content ends on
    // (grouped as the device's locale, en-CH, groups).
    const first = within(files).getByTestId("integration-file-0");
    expect(within(first).getByText("sattleme-plugin.js")).toBeTruthy();
    expect(within(first).getByText("Backend › + › Add .js file")).toBeTruthy();
    expect(
      within(first).getByText(/^Name it sattleme-plugin\.js, then paste its content\./)
    ).toBeTruthy();
    expect(await within(first).findByText("Once pasted, it ends on line 17'748.")).toBeTruthy();
    expect(within(files).queryByTestId("integration-file-1-how")).toBeNull();
    expect(within(files).getByText("Pasted: 0 of 6")).toBeTruthy();

    // "Copy the content": the release's file, whole, then the button says it is copied.
    const copyFirst = within(first).getByTestId("integration-file-0-copy");
    expect(copyFirst.props.accessibilityState).toMatchObject({ disabled: false });
    await fireEvent.press(copyFirst);
    const plugin = new TextDecoder().decode(wixFile("sattleme-plugin.js.txt"));
    expect(jest.mocked(Clipboard.setStringAsync)).toHaveBeenLastCalledWith(plugin);
    expect(await screen.findByText("Content of sattleme-plugin.js copied")).toBeTruthy();
    expect(within(first).getByText("Content copied")).toBeTruthy();

    // The name's button copies the name alone.
    await fireEvent.press(within(files).getByTestId("integration-file-1-name"));
    expect(jest.mocked(Clipboard.setStringAsync)).toHaveBeenLastCalledWith("http-functions.js");
    expect(await screen.findByText("Name copied: http-functions.js")).toBeTruthy();

    // "Pasted" checks it and opens the next: a file a site may have of its own says so.
    await fireEvent.press(within(first).getByTestId("integration-file-0-pasted"));
    expect(within(files).getByText("Pasted: 1 of 6")).toBeTruthy();
    expect(within(files).queryByTestId("integration-file-0-how")).toBeNull();
    const second = within(files).getByTestId("integration-file-1-how");
    expect(
      within(second).getByText(
        "Name it http-functions.js. Wix puts an example in it: select all (Ctrl+A, or ⌘A on a Mac), then paste. Your site already has its own http-functions.js? Don't replace it: paste the copied content at the very end of yours, below its lines."
      )
    ).toBeTruthy();
    expect(within(second).getByText("Once pasted, it ends on line 23.")).toBeTruthy();
    expect(
      within(files)
        .getAllByRole("checkbox")
        .map((box) => box.props.accessibilityState.checked)
    ).toEqual([true, false, false, false, false, false]);

    // A row opens and closes by its name; the key comes after the files.
    await fireEvent.press(within(files).getByTestId("integration-file-4-toggle"));
    expect(within(files).getByTestId("integration-file-4-how")).toBeTruthy();
    expect(within(files).queryByTestId("integration-file-1-how")).toBeNull();
    await fireEvent.press(within(files).getByTestId("integration-file-4-toggle"));
    expect(within(files).queryByTestId(/^integration-file-\d+-how$/)).toBeNull();
    expect(within(guide).getByTestId("integration-key-step")).toBeTruthy();

    // Opened again, the guide copies what was read and checked, without reading it again.
    await fireEvent.press(screen.getByTestId("sheet-back"));
    await fireEvent.press(screen.getByTestId("integration-option-wix"));
    const again = screen.getByTestId("integration-file-0-copy");
    expect(again.props.accessibilityState).toMatchObject({ disabled: false });
    expect(mockReadBundledFile).toHaveBeenCalledTimes(6);
  });

  it("copies nothing of a Wix file that does not read or is not the release's, and says what failed", async () => {
    mockReadBundledFile.mockImplementation(async (source) => {
      if (source === "jobs.config.txt") throw new Error("not found");
      const bytes = wixFile(String(source));
      if (source === "events.js.txt") bytes[0] = bytes[0]! ^ 1;
      return bytes;
    });
    const journaled = (event: string) =>
      readLog().entries.filter((entry) => entry.event === event).length;
    try {
      await ownerDevice();
      await renderRouter(routes, { initialUrl: "/integrations" });
      await fireEvent.press(await screen.findByTestId("create-integration"));
      await fireEvent.press(screen.getByTestId("integration-option-wix"));
      const files = screen.getByTestId("integration-files");
      for (const index of [2, 3]) {
        expect(await within(files).findByTestId(`integration-file-${index}-failed`)).toBeTruthy();
        const copy = within(files).getByTestId(`integration-file-${index}-copy`);
        expect(copy.props.accessibilityState).toMatchObject({ disabled: true });
        await fireEvent.press(copy);
      }
      expect(
        within(files).getAllByText(
          "The app could not read this file: close the guide, then open it again."
        )
      ).toHaveLength(2);
      expect(jest.mocked(Clipboard.setStringAsync)).not.toHaveBeenCalled();
      expect(journaled("A bundled plugin file does not match its SHA-256")).toBe(1);
      expect(journaled("Reading a bundled plugin file failed")).toBe(1);

      // A copy the clipboard refuses, or does not make: said, journaled, never "copied".
      const copy = within(files).getByTestId("integration-file-1-copy");
      await waitFor(() => expect(copy.props.accessibilityState).toMatchObject({ disabled: false }));
      jest.mocked(Clipboard.setStringAsync).mockRejectedValueOnce(new Error("too large"));
      await fireEvent.press(copy);
      expect(await screen.findByText("It could not be copied. Try again")).toBeTruthy();
      jest.mocked(Clipboard.setStringAsync).mockResolvedValueOnce(false);
      await fireEvent.press(copy);
      await waitFor(() => expect(journaled("Copying a plugin file failed")).toBe(2));
      expect(within(files).queryByText("Content copied")).toBeNull();
    } finally {
      mockReadBundledFile.mockImplementation(async (source) => wixFile(String(source)));
    }
  });
});
