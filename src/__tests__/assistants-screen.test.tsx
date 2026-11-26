import "@/i18n";

import * as Clipboard from "expo-clipboard";
import { Linking } from "react-native";
import { fireEvent, renderRouter, screen, waitFor, within } from "expo-router/testing-library";

import AppLayout from "@/app/(app)/_layout";
import IntegrationsRoute from "@/app/(app)/integrations";
import AmountScreen from "@/app/(app)/pos/index";
import PosLayout from "@/app/(app)/pos/_layout";
import WalletLayout from "@/app/(app)/wallet/_layout";
import NewInvoice from "@/app/(app)/wallet/invoice/new";
import LaunchScreen from "@/app/index";
import type { AssistantConnections } from "@/config/assistants";
import { DEFAULT_RELAYS } from "@/config/relays";
import { ASSISTANT_LOT_SIZE, MAX_ASSISTANTS } from "@/config/team";
import {
  closeAccount,
  getAccountBackupKey,
  getAccountSettings,
  getAccountTeamKeys
} from "@/features/account/session";
import * as owner from "@/features/team/owner";
import { createAssistant, setAssistantExport } from "@/features/team/owner";
import { exportGrantFilter, exportGrantOf, grantedKeys } from "@/lib/assistant/export-grant";
import { queryRelays } from "@/lib/nostr/pool";
import { resetTerminalProfileCache } from "@/features/terminal/profile-cache";
import { deriveAssistantKeys, parseAssistantKey } from "@/lib/assistant/keys";
import {
  connectWallet,
  disconnectWallet,
  getWalletConnectionId,
  getWalletId,
  newDepositAddress,
  subscribeWallet
} from "@/lib/breez/wallet";
import { fetchChannel } from "@/lib/team/channel";
import { assistantSecretKey } from "@/lib/team/keys";
import { fetchLotStates } from "@/lib/team/onchain-lot";
import type { SavedTerminalProfile } from "@/lib/terminal/model";
import { saveTerminalProfile } from "@/lib/terminal/profile";

import { openTestAccount } from "../../jest/account";
import { taprootAddress } from "../../jest/bitcoin";
import { publishAssistant, rosterOn } from "../../jest/roster";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as RelaysFake from "../../jest/nostr-relays";

/*
 * "AI assistant": created from "New integration", its key shown once where the AI app asks it,
 * listed and removed in "Integrations", as the owner's app does it against the fake relays.
 */

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
// A build with a web app or without one (no RP ID: local, CI).
const mockWebApp = jest.fn<string | null, []>(() => "https://web.example");
jest.mock("../config/payment-links", () => ({
  ...jest.requireActual("../config/payment-links"),
  getPaymentLinkOrigin: () => mockWebApp()
}));
// The ways an AI app connects (src/config/assistants.ts): the hosted server, Claude Desktop and a
// server of one's own once released.
const mockConnections = jest.fn<AssistantConnections, []>(() => ({
  hosted: HOSTED,
  desktop: null,
  selfHosted: null
}));
// Allowing an assistant to export: on, unless a test suspends it.
const mockExportSuspended = jest.fn<boolean, []>(() => false);
jest.mock("../config/assistants", () => ({
  ...jest.requireActual("../config/assistants"),
  assistantConnections: () => mockConnections(),
  exportGrantsSuspended: () => mockExportSuspended()
}));
jest.mock("../features/terminal/useRate", () => ({
  useRate: () => ({ rate: 50000, hour: 0, loading: false, current: () => 50000 })
}));
jest.mock("@/components/layout/useIsDesktop", () => ({
  ...jest.requireActual("@/components/layout/useIsDesktop"),
  useIsDesktop: () => false
}));
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn(async () => true) }));

const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");

const WALLET = "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";
const HOSTED = "https://mcp.sattle.me";
const DESKTOP = "https://github.com/sattleme/mcp-server/releases/latest";
const SELF_HOSTED = "https://github.com/sattleme/mcp-server#self-hosted";

const routes = {
  index: LaunchScreen,
  "(app)/_layout": AppLayout,
  "(app)/pos/_layout": PosLayout,
  "(app)/pos/index": AmountScreen,
  "(app)/integrations": IntegrationsRoute,
  "(app)/wallet/_layout": WalletLayout,
  "(app)/wallet/invoice/new": NewInvoice
};

async function ownerDevice(): Promise<void> {
  await openTestAccount({ usage: "merchant", signUp: "done" });
  const profile: SavedTerminalProfile = {
    version: 2,
    walletId: WALLET,
    backupKey: getAccountBackupKey()!,
    lightningAddress: "sattleme02c6047f94@breez.tips",
    businessName: getAccountSettings()?.businessName ?? "",
    currency: "CHF"
  };
  await saveTerminalProfile(profile);
  resetTerminalProfileCache();
}

/** The account's assistants, as their records on the relays hold them. */
async function assistants() {
  const { active } = await rosterOn(getAccountTeamKeys()!);
  return active.filter(({ role }) => role === "assistant");
}

/** The assistant's channel, as its MCP server reads it. */
function channelOf(id: string) {
  const team = getAccountTeamKeys()!;
  return fetchChannel(
    team.publicKey,
    deriveAssistantKeys(assistantSecretKey(team, id)).member,
    1000,
    DEFAULT_RELAYS
  );
}

/**
 * The assistant's lot of on-chain addresses, as the owner reads it (its MCP server reads the same
 * record: assistant-vectors.test.ts).
 */
async function lotOf(id: string) {
  const team = getAccountTeamKeys()!;
  const keys = deriveAssistantKeys(assistantSecretKey(team, id)).member;
  const states = await fetchLotStates(
    team,
    [{ id, keys }],
    "mainnet",
    team.secretKey,
    DEFAULT_RELAYS
  );
  return states?.get(id)?.lot ?? null;
}

/** What the assistant `id` may export (its grant), as its MCP server reads it: null when nothing. */
async function grantOf(id: string) {
  const team = getAccountTeamKeys()!;
  const keys = deriveAssistantKeys(assistantSecretKey(team, id)).exportGrant;
  const answers = await queryRelays(exportGrantFilter(team.publicKey, keys), {
    relays: DEFAULT_RELAYS,
    timeoutMs: 1000,
    channel: "anonymous"
  });
  return grantedKeys(exportGrantOf(answers, team.publicKey, keys));
}

/** "Create an integration", then "AI assistant". */
async function openAssistant(): Promise<void> {
  await fireEvent.press(await screen.findByTestId("create-integration"));
  await fireEvent.press(screen.getByTestId("integration-assistant"));
}

jest.setTimeout(20_000);

beforeEach(() => {
  closeAccount();
  relays.resetRelays();
  fileSystem.resetFileSystem();
  mockWebApp.mockReturnValue("https://web.example");
  mockConnections.mockReturnValue({ hosted: HOSTED, desktop: null, selfHosted: null });
  jest.mocked(getWalletId).mockResolvedValue(WALLET);
  jest.mocked(getWalletConnectionId).mockReturnValue(null);
  jest.mocked(subscribeWallet).mockImplementation((listener) => {
    const timer = setTimeout(listener, 0);
    return () => clearTimeout(timer);
  });
  jest.mocked(Clipboard.setStringAsync).mockReset().mockResolvedValue(true);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe('"AI assistant" in "New integration"', () => {
  it("opens in a build without a web app too (no RP ID: local, CI)", async () => {
    // Never "Coming soon"; the channel names no web app until the
    // build has one (invoicingBaseOf), which the owner's app then writes there.
    mockWebApp.mockReturnValue(null);
    await ownerDevice();
    await renderRouter(routes, { initialUrl: "/integrations" });
    await fireEvent.press(await screen.findByTestId("create-integration"));
    const row = screen.getByTestId("integration-assistant");
    expect(row.props.accessibilityLabel).toBe("AI assistant");
    expect(within(row).queryByText("Coming soon")).toBeNull();
    await fireEvent.press(row);
    expect(screen.getByTestId("assistant-steps-hosted")).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId("integration-name"), "Carol's assistant");
    await fireEvent.press(screen.getByTestId("integration-create"));
    await screen.findByTestId("integration-key");
    const [assistant] = await assistants();
    await expect(channelOf(assistant.id)).resolves.toMatchObject({
      status: "found",
      channel: { role: "assistant", invoicing: { linkOrigin: null } }
    });
  });

  it("connects an AI app: the address, then the key created where the sattle.me page asks it", async () => {
    await ownerDevice();
    await renderRouter(routes, { initialUrl: "/integrations" });
    // One way released: straight to its steps.
    await openAssistant();
    const steps = screen.getByTestId("assistant-steps-hosted");
    expect(within(steps).getByTestId("assistant-address").props.children).toBe(HOSTED);
    await fireEvent.press(within(steps).getByTestId("assistant-copy-address"));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(HOSTED);
    expect(await screen.findByText("Address copied")).toBeTruthy();
    // What its holder may do, each chosen before the key exists, and what it never does.
    const permissions = screen.getByTestId("assistant-permissions");
    expect(within(permissions).getByText("Make invoices")).toBeTruthy();
    expect(
      within(permissions).getByText(
        /^By turning it on, you allow this AI assistant to make invoices in your business's name/
      )
    ).toBeTruthy();
    expect(within(permissions).getByText("Access to your sales and payments sent")).toBeTruthy();
    expect(
      within(screen.getByTestId("assistant-key-power")).getByText("It can never spend")
    ).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId("integration-name"), "  Carol's assistant ");
    await fireEvent.press(screen.getByTestId("integration-create"));
    const shown = await screen.findByTestId("integration-key");
    const secretKey = String(shown.props.children);
    const [assistant] = await assistants();
    expect(assistant).toMatchObject({ name: "Carol's assistant" });
    expect(parseAssistantKey(secretKey)).toEqual({
      teamPublicKey: getAccountTeamKeys()!.publicKey,
      key: assistantSecretKey(getAccountTeamKeys()!, assistant.id),
      relays: DEFAULT_RELAYS
    });
    expect(screen.getByText("Key for Carol's assistant")).toBeTruthy();
    expect(screen.getByTestId("integration-key-once").props.children).toMatch(
      /remove the assistant and create another one\.$/
    );
    expect(screen.getByTestId("assistant-paste").props.children).toMatch(
      /^Paste it into the sattle\.me page\./
    );
    // Closed by "Done" only, as an integration's key.
    const sheet = screen.getByTestId("integration-create-sheet");
    expect(within(sheet).getByLabelText("Close")).toBeDisabled();
    // Its channel, with what its invoices need: its server finds it at once.
    await expect(channelOf(assistant.id)).resolves.toMatchObject({
      status: "found",
      channel: { status: "active", role: "assistant", name: "Carol's assistant" }
    });

    await fireEvent.press(screen.getByTestId("integration-done"));
    // Listed, never its key again.
    const row = await screen.findByTestId(`integration-${assistant.id}`);
    expect(within(row).getByText("Carol's assistant")).toBeTruthy();
    expect(within(row).getByText(/^AI assistant · created on /)).toBeTruthy();
    expect(within(row).getByTestId(`assistant-avatar-${assistant.id}`)).toBeTruthy();
    expect(screen.queryByText(secretKey)).toBeNull();
  });

  it('opens from "New invoice", straight on its steps, and closes back on the invoice', async () => {
    await ownerDevice();
    await renderRouter(routes, { initialUrl: "/wallet/invoice/new" });
    await fireEvent.press(await screen.findByTestId("invoice-assistant"));
    const sheet = await screen.findByTestId("integration-create-sheet");
    expect(within(sheet).getByText("AI assistant")).toBeTruthy();
    expect(screen.getByTestId("assistant-steps-hosted")).toBeTruthy();
    // Opened there: no way back to the integrations' list.
    expect(screen.queryByTestId("sheet-back")).toBeNull();
    await fireEvent.changeText(screen.getByTestId("integration-name"), "Carol's assistant");
    await fireEvent.press(screen.getByTestId("integration-create"));
    await screen.findByTestId("integration-key");
    expect(await assistants()).toHaveLength(1);
    await fireEvent.press(screen.getByTestId("integration-done"));
    // Back on the invoice's first step, as it was.
    await waitFor(() => expect(screen.queryByTestId("integration-key")).toBeNull());
    expect(screen.getByTestId("invoice-step-1")).toBeTruthy();
  });

  it("fills the new assistant's lot of on-chain addresses at once, not at the next unlock", async () => {
    await ownerDevice();
    await renderRouter(routes, { initialUrl: "/integrations" });
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

    await openAssistant();
    await fireEvent.changeText(screen.getByTestId("integration-name"), "Carol's assistant");
    await fireEvent.press(screen.getByTestId("integration-create"));
    await screen.findByTestId("integration-key");
    const [assistant] = await assistants();

    // Its MCP server takes addresses before the lot is full: published every 10 (version 2 of the
    // lot's format), then whole.
    await waitFor(async () =>
      expect((await lotOf(assistant.id))?.addresses).toEqual(
        Array.from({ length: ASSISTANT_LOT_SIZE }, (_, i) => taprootAddress(i + 1))
      )
    );
    expect((await lotOf(assistant.id))?.version).toBe(2);
    await waitFor(() => expect(connected).toBe(false));
  });

  it("chooses between an AI app and Claude Desktop when both are released", async () => {
    mockConnections.mockReturnValue({ hosted: HOSTED, desktop: DESKTOP, selfHosted: null });
    await ownerDevice();
    await renderRouter(routes, { initialUrl: "/integrations" });
    await openAssistant();
    expect(screen.getByTestId("assistant-choice")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("assistant-desktop"));
    const steps = screen.getByTestId("assistant-steps-desktop");
    expect(within(steps).getByText("The extension on github.com")).toBeTruthy();
    expect(within(steps).queryByTestId("assistant-address")).toBeNull();
    // Back to the choice, not to the list.
    await fireEvent.press(screen.getByTestId("sheet-back"));
    expect(screen.getByTestId("assistant-choice")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("assistant-desktop"));
    await fireEvent.changeText(screen.getByTestId("integration-name"), "Carol's assistant");
    await fireEvent.press(screen.getByTestId("integration-create"));
    await screen.findByTestId("integration-key");
    expect(screen.getByTestId("assistant-paste").props.children).toMatch(
      /^Paste it into Claude Desktop's “Assistant key” field\./
    );
  });

  it("offers its three ways in their order, each with its own steps, back to the choice", async () => {
    mockConnections.mockReturnValue({ hosted: HOSTED, desktop: DESKTOP, selfHosted: SELF_HOSTED });
    await ownerDevice();
    await renderRouter(routes, { initialUrl: "/integrations" });
    await openAssistant();
    const choice = screen.getByTestId("assistant-choice");
    expect(
      within(choice)
        .getAllByRole("button")
        .map((row) => row.props.testID)
    ).toEqual(["assistant-hosted", "assistant-desktop", "assistant-selfHosted"]);
    expect(
      within(screen.getByTestId("assistant-hosted")).getByText("In Claude, ChatGPT…")
    ).toBeTruthy();
    expect(
      within(screen.getByTestId("assistant-desktop")).getByText("The key stays on your computer")
    ).toBeTruthy();
    const selfHosted = screen.getByTestId("assistant-selfHosted");
    expect(within(selfHosted).getByText("On your own server")).toBeTruthy();
    expect(within(selfHosted).getByText("Its open-source code, on GitHub")).toBeTruthy();
    // Discreet labels: the simplest way first, the experts' last; Claude Desktop's has none.
    expect(within(screen.getByTestId("assistant-hosted")).getByText("The simplest")).toBeTruthy();
    expect(within(selfHosted).getByText("For experts")).toBeTruthy();
    expect(screen.queryByTestId("assistant-desktop-badge")).toBeNull();
    for (const via of ["hosted", "desktop", "selfHosted"]) {
      await fireEvent.press(screen.getByTestId(`assistant-${via}`));
      expect(screen.getByTestId(`assistant-steps-${via}`)).toBeTruthy();
      await fireEvent.press(screen.getByTestId("sheet-back"));
      expect(screen.getByTestId("assistant-choice")).toBeTruthy();
    }
  });

  it("adds the connector to Claude with its install link, and to ChatGPT with its address", async () => {
    jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    await ownerDevice();
    await renderRouter(routes, { initialUrl: "/integrations" });
    await openAssistant();
    const steps = screen.getByTestId("assistant-steps-hosted");
    // Claude's dialog, filled in with the connector's name and address: the merchant confirms there.
    await fireEvent.press(within(steps).getByText("Add to Claude"));
    expect(Linking.openURL).toHaveBeenLastCalledWith(
      "https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=sattle.me&connectorUrl=https%3A%2F%2Fmcp.sattle.me"
    );
    // ChatGPT fills nothing in: its page, and the address to paste as it is.
    expect(
      within(steps).getByText(
        "In ChatGPT or another AI app, add a custom connector (MCP server) with this address, exactly as it is:"
      )
    ).toBeTruthy();
    expect(within(steps).getByTestId("assistant-address").props.children).toBe(HOSTED);
    await fireEvent.press(within(steps).getByText("Open ChatGPT"));
    expect(Linking.openURL).toHaveBeenLastCalledWith("https://chatgpt.com/plugins");
    // Neither creates a key: it is created last, where the sattle.me page asks it.
    expect(await assistants()).toEqual([]);
    expect(
      screen.getByText("Do it when the sattle.me page asks for it: it is shown only once.")
    ).toBeTruthy();
    expect(
      within(screen.getByTestId("assistant-key-power")).getByText(
        "Paste it only into the sattle.me page, never into a conversation."
      )
    ).toBeTruthy();
  });

  it("runs on a server of one's own: its code on GitHub, what it sees, then the same key", async () => {
    mockConnections.mockReturnValue({ hosted: HOSTED, desktop: null, selfHosted: SELF_HOSTED });
    jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    await ownerDevice();
    await renderRouter(routes, { initialUrl: "/integrations" });
    await openAssistant();
    await fireEvent.press(screen.getByTestId("assistant-selfHosted"));
    const steps = screen.getByTestId("assistant-steps-selfHosted");
    expect(within(steps).queryByTestId("assistant-address")).toBeNull();
    expect(within(steps).queryByText("Add to Claude")).toBeNull();
    expect(within(steps).getByText(/^The same MCP server as sattle\.me's,/)).toBeTruthy();
    await fireEvent.press(within(steps).getByText("sattleme/mcp-server on github.com"));
    expect(Linking.openURL).toHaveBeenCalledWith(SELF_HOSTED);
    // Before a key exists: whoever runs the server sees it and the invoices, and how it ends.
    const trust = within(steps).getByTestId("assistant-self-hosted-trust");
    expect(within(trust).getByText("This server sees your invoices")).toBeTruthy();
    expect(within(trust).getByText(/remove the assistant: it stops at once\.$/)).toBeTruthy();
    expect(
      screen.getByText("Do it when your server's page asks for it: it is shown only once.")
    ).toBeTruthy();
    expect(
      within(screen.getByTestId("assistant-key-power")).getByText(
        "Paste it only into your server's page, never into a conversation."
      )
    ).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId("integration-name"), "Carol's assistant");
    await fireEvent.press(screen.getByTestId("integration-create"));
    const shown = await screen.findByTestId("integration-key");
    // The same assistant as any other way's: its key reads the same channel.
    const [assistant] = await assistants();
    expect(parseAssistantKey(String(shown.props.children))?.key).toEqual(
      assistantSecretKey(getAccountTeamKeys()!, assistant.id)
    );
    expect(screen.getByTestId("assistant-paste").props.children).toMatch(
      /^Paste it into your server's page\. Then ask, for example: “Make an invoice/
    );
  });

  it("links Claude Desktop's steps to the latest release's bundle itself", async () => {
    mockConnections.mockReturnValue({ hosted: HOSTED, desktop: DESKTOP, selfHosted: null });
    const fetchMock = jest.mocked(globalThis.fetch);
    const network = fetchMock.getMockImplementation();
    let release: (body: unknown) => void = () => undefined;
    fetchMock.mockImplementation((input, init) =>
      String(input) === "https://api.github.com/repos/sattleme/mcp-server/releases/latest"
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
      await openAssistant();
      await fireEvent.press(screen.getByTestId("assistant-desktop"));
      // Until GitHub answers: the release's page.
      await fireEvent.press(screen.getByTestId("assistant-bundle-page"));
      expect(opened).toHaveBeenLastCalledWith(DESKTOP);

      release({
        tag_name: "v0.1.2",
        assets: [{ name: "sattleme-assistant-0.1.2.mcpb" }, { name: "SHA256SUMS" }]
      });
      const link = await screen.findByTestId("assistant-bundle-download");
      expect(within(link).getByText("Download version 0.1.2")).toBeTruthy();
      await fireEvent.press(link);
      expect(opened).toHaveBeenLastCalledWith(
        "https://github.com/sattleme/mcp-server/releases/download/v0.1.2/sattleme-assistant-0.1.2.mcpb"
      );
    } finally {
      fetchMock.mockImplementation(network);
      opened.mockRestore();
    }
  });

  it("keeps the release's page when GitHub's answer has no bundle", async () => {
    mockConnections.mockReturnValue({ hosted: HOSTED, desktop: DESKTOP, selfHosted: null });
    const fetchMock = jest.mocked(globalThis.fetch);
    const network = fetchMock.getMockImplementation();
    let answered = false;
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input) !== "https://api.github.com/repos/sattleme/mcp-server/releases/latest") {
        return network!(input, init);
      }
      answered = true;
      return {
        ok: true,
        status: 200,
        json: async () => ({ tag_name: "v0.1.2", assets: [] })
      } as unknown as Response;
    });
    try {
      await ownerDevice();
      await renderRouter(routes, { initialUrl: "/integrations" });
      await openAssistant();
      await fireEvent.press(screen.getByTestId("assistant-desktop"));
      await waitFor(() => expect(answered).toBe(true));
      await waitFor(() =>
        expect(jest.mocked(console.warn)).toHaveBeenCalledWith(
          "Reading the assistant's latest release failed",
          expect.objectContaining({ message: expect.stringMatching(/has no file/) })
        )
      );
      expect(screen.getByTestId("assistant-bundle-page")).toBeTruthy();
      expect(screen.queryByTestId("assistant-bundle-download")).toBeNull();
    } finally {
      fetchMock.mockImplementation(network);
    }
  });

  it("says when the account already has its assistants, and creates none", async () => {
    await ownerDevice();
    const team = getAccountTeamKeys()!;
    for (let index = 0; index < MAX_ASSISTANTS; index += 1) {
      await publishAssistant(team, {
        id: index.toString(16).padStart(32, "0"),
        name: `Assistant ${index}`,
        createdAt: 1_792_000_000 + index
      });
    }
    await renderRouter(routes, { initialUrl: "/integrations" });
    await openAssistant();
    await fireEvent.changeText(screen.getByTestId("integration-name"), "One too many");
    await fireEvent.press(screen.getByTestId("integration-create"));
    expect(
      await screen.findByText(
        `Your account already has ${MAX_ASSISTANTS} assistants. Remove one to create another.`
      )
    ).toBeTruthy();
    expect(screen.queryByTestId("integration-key")).toBeNull();
    expect(await assistants()).toHaveLength(MAX_ASSISTANTS);
  });
});

describe('an assistant in "Integrations"', () => {
  it("is removed after its confirmation, its channel saying so to its server", async () => {
    await ownerDevice();
    const { assistant } = await createAssistant("Carol's assistant");
    await renderRouter(routes, { initialUrl: "/integrations" });

    await fireEvent.press(await screen.findByTestId(`remove-${assistant.id}`));
    expect(await screen.findByText("Remove Carol's assistant?")).toBeTruthy();
    expect(
      screen.getByText(/^Carol's assistant will make no more invoices for .+\. Those it made/)
    ).toBeTruthy();
    await fireEvent.press(screen.getByText("Back"));
    expect(await assistants()).toHaveLength(1);

    await fireEvent.press(screen.getByTestId(`remove-${assistant.id}`));
    await fireEvent.press(await screen.findByTestId("confirm-remove-integration"));
    expect(await screen.findByText("Assistant removed")).toBeTruthy();
    await waitFor(async () => expect(await assistants()).toEqual([]));
    await expect(channelOf(assistant.id)).resolves.toMatchObject({
      channel: { status: "removed" }
    });
  });

  it("is allowed to export the transactions after its confirmation, then withdrawn", async () => {
    await ownerDevice();
    const { assistant } = await createAssistant("Carol's assistant");
    await renderRouter(routes, { initialUrl: "/integrations" });

    const action = await screen.findByTestId(`export-${assistant.id}`);
    expect(action).toHaveAccessibleName("Allow exporting transactions");
    await fireEvent.press(action);
    expect(
      await screen.findByText("Allow Carol's assistant to export your transactions?")
    ).toBeTruthy();
    // What it gives, what it leaves out, and that a copy of its key keeps reading.
    expect(
      screen.getByText(
        /^Carol's assistant will be able to read the sales and the payments sent of .+ “Wallet › Export” does\. Payments received without a sale .+ could still read your sales recorded before\.$/
      )
    ).toBeTruthy();
    await fireEvent.press(screen.getByText("Back"));
    expect(await grantOf(assistant.id)).toBeNull();

    await fireEvent.press(screen.getByTestId(`export-${assistant.id}`));
    await fireEvent.press(await screen.findByTestId("confirm-assistant-export"));
    expect(await screen.findByText("Export allowed")).toBeTruthy();
    expect(await grantOf(assistant.id)).not.toBeNull();
    const row = await screen.findByTestId(`integration-${assistant.id}`);
    expect(await within(row).findByText(/· exports your transactions$/)).toBeTruthy();

    await fireEvent.press(within(row).getByLabelText("Stop exporting transactions"));
    expect(await screen.findByText("Stop Carol's assistant exporting?")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("confirm-assistant-export"));
    expect(await screen.findByText("Export stopped")).toBeTruthy();
    expect(await grantOf(assistant.id)).toBeNull();
  });

  it("keeps the export's dialog on a spinner until the relays took it, then closes it", async () => {
    await ownerDevice();
    const { assistant } = await createAssistant("Carol's assistant");
    await renderRouter(routes, { initialUrl: "/integrations" });
    await fireEvent.press(await screen.findByTestId(`export-${assistant.id}`));
    expect(
      await screen.findByText("Allow Carol's assistant to export your transactions?")
    ).toBeTruthy();
    const write = jest.spyOn(owner, "setAssistantExport");

    const release = relays.holdPublishes();
    try {
      await fireEvent.press(screen.getByTestId("confirm-assistant-export"));
      await waitFor(() =>
        expect(
          screen.getByTestId("confirm-assistant-export").props.accessibilityState
        ).toMatchObject({ busy: true, disabled: true })
      );
      const confirm = screen.getByTestId("confirm-assistant-export");
      expect(
        screen.queryByTestId("confirm-assistant-export-spinner", { includeHiddenElements: true })
      ).toBeTruthy();
      expect(confirm).toHaveTextContent("Allow");
      // "Back" disabled, the dialog kept; pressed again: one write.
      const back = screen.getByRole("button", { name: "Back" });
      expect(back.props.accessibilityState).toMatchObject({ disabled: true });
      await fireEvent.press(back);
      await fireEvent.press(confirm);
      expect(screen.getByTestId("assistant-export")).toBeTruthy();
      expect(screen.queryByText("Export allowed")).toBeNull();
    } finally {
      release();
    }

    expect(await screen.findByText("Export allowed")).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId("assistant-export")).toBeNull());
    expect(write).toHaveBeenCalledTimes(1);
    write.mockRestore();
    expect(await grantOf(assistant.id)).not.toBeNull();
  });

  it("closes the export's dialog on its failure, and says so", async () => {
    await ownerDevice();
    const { assistant } = await createAssistant("Carol's assistant");
    await renderRouter(routes, { initialUrl: "/integrations" });
    await fireEvent.press(await screen.findByTestId(`export-${assistant.id}`));
    const write = jest
      .spyOn(owner, "setAssistantExport")
      .mockRejectedValue(new owner.TeamError("unreachable", "No majority"));
    try {
      await fireEvent.press(await screen.findByTestId("confirm-assistant-export"));
      expect(await screen.findByText(/^The permission could not be published\./)).toBeTruthy();
      await waitFor(() => expect(screen.queryByTestId("assistant-export")).toBeNull());
    } finally {
      write.mockRestore();
    }
    // Its action waits no more: pressed, the dialog asks again, ready.
    await fireEvent.press(screen.getByTestId(`export-${assistant.id}`));
    expect(
      (await screen.findByTestId("confirm-assistant-export")).props.accessibilityState
    ).toMatchObject({ busy: false, disabled: false });
    expect(await grantOf(assistant.id)).toBeNull();
  });
});

describe("the export of a new assistant", () => {
  it("is off unless turned on, and allowed with its key when it is", async () => {
    await ownerDevice();
    await renderRouter(routes, { initialUrl: "/integrations" });
    await openAssistant();
    const exportSwitch = screen.getByTestId("assistant-export-switch");
    expect(exportSwitch.props.accessibilityState).toMatchObject({ checked: false });
    await fireEvent.press(exportSwitch);
    await fireEvent.changeText(screen.getByTestId("integration-name"), "Carol's assistant");
    await fireEvent.press(screen.getByTestId("integration-create"));
    await screen.findByTestId("integration-key");
    const [assistant] = await assistants();
    expect(await grantOf(assistant.id)).not.toBeNull();
  });

  it("is not allowed when left off", async () => {
    await ownerDevice();
    await renderRouter(routes, { initialUrl: "/integrations" });
    await openAssistant();
    await fireEvent.changeText(screen.getByTestId("integration-name"), "Claude");
    await fireEvent.press(screen.getByTestId("integration-create"));
    await screen.findByTestId("integration-key");
    const [assistant] = await assistants();
    expect(await grantOf(assistant.id)).toBeNull();
  });
});

describe("the export of an assistant when suspended again", () => {
  beforeEach(() => mockExportSuspended.mockReturnValue(true));
  afterEach(() => mockExportSuspended.mockReturnValue(false));

  it("cannot be turned on for a new assistant, which says why", async () => {
    await ownerDevice();
    await renderRouter(routes, { initialUrl: "/integrations" });
    await openAssistant();
    const exportSwitch = screen.getByTestId("assistant-export-switch");
    expect(exportSwitch).toBeDisabled();
    expect(screen.getByText(/^Temporarily unavailable: giving AI assistants access/)).toBeTruthy();
    await fireEvent.press(exportSwitch);
    await fireEvent.changeText(screen.getByTestId("integration-name"), "Carol's assistant");
    await fireEvent.press(screen.getByTestId("integration-create"));
    await screen.findByTestId("integration-key");
    const [assistant] = await assistants();
    expect(await grantOf(assistant.id)).toBeNull();
  });

  it('is not offered to allow in "Integrations", but still to withdraw', async () => {
    await ownerDevice();
    const { assistant } = await createAssistant("Carol's assistant");
    const other = (await createAssistant("Accountant")).assistant;
    mockExportSuspended.mockReturnValue(false);
    await setAssistantExport(other, true);
    mockExportSuspended.mockReturnValue(true);
    await renderRouter(routes, { initialUrl: "/integrations" });

    const allowed = await screen.findByTestId(`export-${other.id}`);
    expect(allowed).toHaveAccessibleName("Stop exporting transactions");
    expect(screen.queryByTestId(`export-${assistant.id}`)).toBeNull();
  });
});

describe("the invoices of a new assistant", () => {
  // Each permission chosen when the key is created.
  it("are on unless turned off: the assistant then only exports, for good", async () => {
    await ownerDevice();
    await renderRouter(routes, { initialUrl: "/integrations" });
    await openAssistant();
    const invoicing = screen.getByTestId("assistant-invoicing-switch");
    expect(invoicing.props.accessibilityState).toMatchObject({ checked: true });
    await fireEvent.press(invoicing);
    await fireEvent.press(screen.getByTestId("assistant-export-switch"));
    await fireEvent.changeText(screen.getByTestId("integration-name"), "Accountant");
    await fireEvent.press(screen.getByTestId("integration-create"));
    await screen.findByTestId("integration-key");
    // Its first request, for example, is an export.
    expect(screen.getByTestId("assistant-paste").props.children).toMatch(
      /“Export last month's transactions as a CSV for my accountant\.”$/
    );
    const [assistant] = await assistants();
    expect(assistant).toMatchObject({ name: "Accountant", invoicing: false });
    const found = await channelOf(assistant.id);
    expect(found).toMatchObject({ status: "found", channel: { version: 2, role: "assistant" } });
    expect(found.status === "found" && found.channel).not.toHaveProperty("invoicing");
    expect(await grantOf(assistant.id)).not.toBeNull();
    await fireEvent.press(screen.getByTestId("integration-done"));
    const row = await screen.findByTestId(`integration-${assistant.id}`);
    expect(
      await within(row).findByText(
        /^AI assistant · created on .* · exports your transactions, no invoices$/
      )
    ).toBeTruthy();
  });

  it("need at least one permission: none, no key", async () => {
    await ownerDevice();
    await renderRouter(routes, { initialUrl: "/integrations" });
    await openAssistant();
    await fireEvent.changeText(screen.getByTestId("integration-name"), "Nobody");
    expect(screen.queryByTestId("assistant-none-picked")).toBeNull();
    await fireEvent.press(screen.getByTestId("assistant-invoicing-switch"));
    expect(screen.getByTestId("assistant-none-picked")).toBeTruthy();
    expect(screen.getByTestId("integration-create")).toBeDisabled();
    await fireEvent.press(screen.getByTestId("integration-create"));
    expect(await assistants()).toEqual([]);
    // One turned on again: the key can be created.
    await fireEvent.press(screen.getByTestId("assistant-export-switch"));
    expect(screen.queryByTestId("assistant-none-picked")).toBeNull();
    expect(screen.getByTestId("integration-create")).not.toBeDisabled();
  });
});
