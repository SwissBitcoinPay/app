import "@/i18n";

import * as Clipboard from "expo-clipboard";
import { Stack, router as expoRouter } from "expo-router";
import { act, fireEvent, renderRouter, screen, waitFor, within } from "expo-router/testing-library";
import { Platform, ScrollView, StyleSheet } from "react-native";

import { bytesToHex } from "@noble/hashes/utils.js";

import AppLayout from "@/app/(app)/_layout";
import EmployeesRoute from "@/app/(app)/employees";
import WalletRoute from "@/app/(app)/wallet";
import AmountScreen from "@/app/(app)/pos/index";
import PosLayout from "@/app/(app)/pos/_layout";
import LaunchScreen from "@/app/index";
import NotFound from "@/app/+not-found";
import JoinScreen from "@/app/join";
import PaymentLinkScreen from "@/app/pay";
import { DEFAULT_RELAYS as TEAM_RELAYS } from "@/config/relays";
import { INVITE_VALIDITY_SECONDS, MAX_TEAM_MEMBERS } from "@/config/team";
import {
  closeAccount,
  getAccountBackupKey,
  getAccountSettings,
  getAccountTeamKeys
} from "@/features/account/session";
import { changeLogo } from "@/features/settings/account-settings";
import { leaveBusiness } from "@/features/settings/sign-out";
import {
  JOIN_RECHECK_MS,
  JoinError,
  LeaveError,
  getRemovalNotice,
  joinTeam,
  previewInvite,
  recordSale,
  resetMembershipCache,
  syncMembership
} from "@/features/team/member";
import * as cancelLinksModule from "@/features/team/cancel-links";
import * as owner from "@/features/team/owner";
import * as ownerAddresses from "@/features/team/owner-addresses";
import * as unsettledModule from "@/features/team/unsettled";
import {
  TeamError,
  inviteEmployee,
  loadTeam,
  removeEmployee,
  showInvite,
  syncTeamChannels
} from "@/features/team/owner";
import { loadOnchainPayments, loadPosOptions } from "@/features/terminal/options";
import { initialsOf } from "@/features/team/EmployeesScreen";
import { formatDate } from "@/lib/locale/date";
import { getDeviceLocale } from "@/lib/locale/device";
import { resetTerminalProfileCache } from "@/features/terminal/profile-cache";
import { loadBusinessRegistry } from "@/features/terminal/registry-key";
import { getWalletId } from "@/lib/breez/wallet";
import { resetImages } from "@/features/media/images";
import {
  createPaymentLink,
  fetchOwnerFinalCopies,
  publishPaymentLink
} from "@/lib/payment-link/link";
import { publishToRelays } from "@/lib/nostr/pool";
import { channelCatalogOf } from "@/lib/catalog/reader";
import { setCurrentRelays } from "@/lib/relays/current";
import { sealRecord } from "@/lib/nostr/record";
import { channelEvent, fetchChannel } from "@/lib/team/channel";
import { closedInviteEvent, fetchInvite, inviteLinkOf } from "@/lib/team/invite";
import {
  deriveBusinessRegistry,
  deriveCatalogReader,
  deriveIssueKey,
  deriveMemberKeys,
  deriveRosterKeys,
  inviteAddress,
  inviteAuthor,
  memberSecret,
  newMemberId
} from "@/lib/team/keys";
import {
  deviceEvent,
  fetchSales,
  linkEvent,
  publishMemberRecord,
  saleEvent
} from "@/lib/team/member-records";
import { memberOf, seatAddress, type TeamMember } from "@/lib/team/roster";
import { loadMembership } from "@/lib/team/membership-store";
import { TEAM_TIMEOUT_MS } from "@/lib/team/shared";
import { issueTag } from "@/lib/team/onchain-lot";
import type { SavedTerminalProfile } from "@/lib/terminal/model";
import {
  loadCatalogRecord,
  loadTerminalProfile,
  saveTerminalProfile
} from "@/lib/terminal/profile";

import { openTestAccount } from "../../jest/account";
import { publishMember, publishRemoved, rosterOn } from "../../jest/roster";
import { taprootAddress } from "../../jest/bitcoin";
import type * as CameraFake from "../../jest/expo-camera";
import type * as FileSystemFake from "../../jest/expo-file-system";
import type * as SecureStoreFake from "../../jest/expo-secure-store";
import type * as RelaysFake from "../../jest/nostr-relays";
import { settlements as mockSettlements } from "../../jest/sale-settler";

jest.mock("../lib/breez/wallet", () => ({
  checkWalletConfig: jest.fn(),
  connectWallet: jest.fn(),
  disconnectWallet: jest.fn(),
  getWalletId: jest.fn(),
  getWalletLightningAddress: jest.fn()
}));
// As the app config under Jest (none) unless a test sets it: "My activity" reads the payment
// links of the build's network.
const mockNetwork = jest.fn((): string => {
  throw new Error("No network in the app config under Jest");
});
jest.mock("../lib/breez/config", () => ({
  ...jest.requireActual("../lib/breez/config"),
  getBreezNetwork: () => mockNetwork()
}));
jest.mock("../lib/breez/passkey", () => ({
  createPasskeyWallet: jest.fn(),
  preparePasskeys: jest.fn(async () => undefined),
  passkeysReady: jest.fn(() => true),
  signInWithPasskey: jest.fn()
}));
// The staging web app receives the invitation links (the app config has no variant under Jest).
const mockOrigin = jest.fn<string | null, []>(() => "https://web.example");
jest.mock("../config/team", () => ({
  ...jest.requireActual("../config/team"),
  getInviteOrigin: () => mockOrigin()
}));
jest.mock("../features/terminal/useRate", () => ({
  useRate: () => ({
    rate: 50000,
    // The point that prices the present (src/lib/rates/), on the test's clock.
    hour: jest
      .requireActual<typeof import("../lib/rates/sources")>("../lib/rates/sources")
      .pointHourOf(Math.floor(Date.now() / 1000)),
    loading: false,
    current: () => 50000
  })
}));
const mockDesktop = jest.fn(() => false);
jest.mock("@/components/layout/useIsDesktop", () => ({
  ...jest.requireActual("@/components/layout/useIsDesktop"),
  useIsDesktop: () => mockDesktop()
}));
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn(async () => true) }));
// Whether a share sheet opens: always in the apps; not in a browser without one (Firefox on desktop).
const mockCanShare = jest.fn(() => true);
jest.mock("../lib/payment-link/device", () => ({
  ...jest.requireActual("../lib/payment-link/device"),
  canShareUrl: () => mockCanShare()
}));
// What following a sale finds, for the tests that say it (jest/sale-settler.tsx).
jest.mock("../features/payment-link/SaleSettler", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- a factory, as jest.setup.ts's
  require("../../jest/sale-settler")
);

const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const secureStore = jest.requireMock<typeof SecureStoreFake>("expo-secure-store");
const camera = jest.requireMock<typeof CameraFake>("expo-camera");
const fileSystem = jest.requireMock<typeof FileSystemFake>("expo-file-system");

/** The owner's wallet (public key of the key 2). */
const WALLET = "02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";
const ADDRESS = "sattleme02c6047f94@breez.tips";

/** A destination these tests never open: its route only, which the app's tabs point to. */
const Elsewhere = () => null;

const routes = {
  index: LaunchScreen,
  join: JoinScreen,
  "+not-found": NotFound,
  "(app)/_layout": AppLayout,
  "(app)/pos/_layout": PosLayout,
  "(app)/pos/index": AmountScreen,
  "(app)/employees": EmployeesRoute,
  "(app)/wallet": WalletRoute,
  // Since Expo Router 58, each tab of the app's navigation must point to a route of its layout
  // (AppShell's triggers, destinations.ts): as in the app, every destination has one.
  "(app)/cards/index": Elsewhere,
  "(app)/articles": Elsewhere,
  "(app)/integrations": Elsewhere,
  "(app)/settings/index": Elsewhere,
  pay: PaymentLinkScreen
};

/** The owner's device: its account open (done), its point of sale prepared. */
async function ownerDevice(): Promise<SavedTerminalProfile> {
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
  return profile;
}

/** How an invitation link is copied: a secret (src/lib/secret-clipboard.ts). */
const SECRET_COPY = {
  android: { isSensitive: true },
  ios: { expiresAt: expect.any(Date) }
};

/** Another device, never prepared: the relays stay, nothing of this device's storage does. */
function newDevice() {
  closeAccount();
  fileSystem.resetFileSystem();
  secureStore.resetSecureStore();
  resetTerminalProfileCache();
  resetMembershipCache();
}

/**
 * The owner invites Bob, then Alice; both join from their devices, Alice's then leaves the
 * business ("Leave the business"). Back on the owner's device: returns the members.
 */
async function oneLeftOneStayed() {
  await ownerDevice();
  const { url: bobUrl, member: bob } = await inviteEmployee("Bob");
  const { url: aliceUrl, member: alice } = await inviteEmployee("Alice");
  const ownerProfile = await loadTerminalProfile();
  for (const url of [bobUrl, aliceUrl]) {
    // Each device: the same storage under Jest, the owner's profile set aside.
    secureStore.resetSecureStore();
    resetTerminalProfileCache();
    resetMembershipCache();
    await joinTeam(await previewInvite(inviteLinkOf(url)!));
  }
  await leaveBusiness();
  await expect(loadMembership()).resolves.toBeNull();
  await saveTerminalProfile(ownerProfile as SavedTerminalProfile);
  resetTerminalProfileCache();
  return { bob, alice };
}

/** Until `check` passes: background publications take a few turns of the event loop. */
async function eventually(check: () => Promise<void>) {
  await waitFor(check);
}

/** Where "Invite an employee" lays its name out in what scrolls (Jest has no layout). */
const NAME_AREA_LAYOUT = { nativeEvent: { layout: { x: 0, y: 96, width: 390, height: 110 } } };

/**
 * ScrollView's `scrollTo`: React Native's fake makes it a mock function shared by its instances,
 * which spyOn returns as it is. `scrolledBody` counts its calls on the invitation's body only, from
 * here.
 */
function spyInviteScroll() {
  const scrollTo = jest.spyOn(ScrollView.prototype, "scrollTo");
  scrollTo.mockClear();
  const scrolledBody = () =>
    scrollTo.mock.instances.filter(
      (view) => (view as unknown as { props: { testID?: string } }).props.testID === "invite-body"
    ).length;
  return { scrollTo, scrolledBody };
}

/** What "Invite an employee" shows, in screen order. */
function inviteInOrder(): string[] {
  const ids = ["invite-lead", "invite-name", "invite-rights", "invite-notice", "invite-create"];
  const found: string[] = [];
  const visit = (node: typeof screen.container) => {
    const id = node.props.testID;
    if (typeof id === "string" && ids.includes(id) && !found.includes(id)) found.push(id);
    for (const child of node.children) if (typeof child !== "string") visit(child);
  };
  visit(screen.getByTestId("invite-sheet"));
  return found;
}

/** The account's employees, as their records on the relays hold them (any device reads them so). */
async function employees(): Promise<TeamMember[]> {
  const { active } = await rosterOn(getAccountTeamKeys()!);
  return active.filter(({ role }) => role === "employee").map(memberOf);
}

/** The account's removed employees, as their records on `list` hold them. */
async function removedEmployees(list: readonly string[] = TEAM_RELAYS) {
  const { removed } = await rosterOn(getAccountTeamKeys()!, list);
  return removed.filter(({ role }) => role === "employee");
}

/**
 * Alice, invited a day past her invitation's 48 hours from another of the owner's devices: her
 * invitation ended unused (no relay holds its record any more).
 */
async function expiredInvitation(): Promise<TeamMember> {
  const member: TeamMember = {
    id: newMemberId(),
    name: "Alice",
    role: "employee",
    invitedAt: Math.floor(Date.now() / 1000) - INVITE_VALIDITY_SECONDS - 24 * 60 * 60
  };
  await publishMember(getAccountTeamKeys()!, member);
  return member;
}

jest.setTimeout(20_000);

/**
 * A payment link of the employee whose keys are `keys`, shared at `now` for 10 minutes and
 * recorded for the owner, as its device leaves it.
 */
async function employeeLink(
  keys: ReturnType<typeof deriveMemberKeys>,
  now: number,
  onchainAddress: string | null = null,
  onchainTag: string | null = null
) {
  const registry = deriveBusinessRegistry(getAccountTeamKeys()!);
  const saleKey = new Uint8Array(32).fill(12);
  const link = createPaymentLink(
    {
      version: 3,
      businessName: "Fine Bakery",
      lightningAddress: ADDRESS,
      fiat: { minor: 2450, digits: 2, currency: "CHF" },
      note: "",
      onchainAddress,
      endsAt: now + 540,
      registryKey: bytesToHex(registry.key),
      registryReader: registry.reader,
      owner: registry.owner
    },
    "https://web.example",
    now - 60,
    saleKey
  );
  await publishPaymentLink(link);
  await publishMemberRecord(
    keys,
    linkEvent(keys, {
      version: 1,
      link: link.id,
      saleKey: bytesToHex(saleKey),
      createdAt: now - 60,
      onchainTag,
      relays: [...TEAM_RELAYS],
      sealedKey: "A".repeat(200)
    }),
    TEAM_RELAYS
  );
  return link;
}

beforeEach(() => {
  mockSettlements.clear();
  closeAccount();
  relays.resetRelays();
  fileSystem.resetFileSystem();
  mockOrigin.mockReturnValue("https://web.example");
  mockDesktop.mockReturnValue(false);
  mockCanShare.mockReturnValue(true);
  jest.mocked(getWalletId).mockResolvedValue(WALLET);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("team", () => {
  it("draws an avatar's initials from the first two words of the name", () => {
    expect(initialsOf("Erin Grant")).toBe("EG");
    expect(initialsOf("  dave   example  smith ")).toBe("DE");
    expect(initialsOf("Alice")).toBe("A");
    expect(initialsOf("Åsa Öberg")).toBe("ÅÖ");
  });

  // A busy label of its own ran out of the button.
  it('waits on a spinner in place of "Create the link", the button as it was', async () => {
    await ownerDevice();
    await renderRouter(routes, { initialUrl: "/employees" });
    await screen.findByTestId("invite-employee");
    const invite = owner.inviteEmployee;
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    const spy = jest.spyOn(owner, "inviteEmployee").mockImplementation(async (...args) => {
      await held;
      return invite(...args);
    });

    await fireEvent.press(screen.getByTestId("invite-employee"));
    await fireEvent.changeText(screen.getByTestId("invite-name"), "Alice");
    const spinner = () =>
      screen.queryByTestId("invite-create-spinner", { includeHiddenElements: true });
    expect(spinner()).toBeNull();
    await fireEvent.press(screen.getByTestId("invite-create"));

    // The same label, which keeps the button's width, under a spinner; pressed again, nothing.
    expect(spinner()).toBeTruthy();
    const button = screen.getByTestId("invite-create");
    expect(within(button).getByText("Create the link")).toBeTruthy();
    expect(screen.queryByText(/^Creating/)).toBeNull();
    expect(button.props.accessibilityState).toMatchObject({ disabled: true, busy: true });
    await fireEvent.press(button);

    release();
    expect(await screen.findByTestId("invite-link")).toBeTruthy();
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('invites an employee from "Employees": a QR code, saved in the account', async () => {
    const profile = await ownerDevice();
    await renderRouter(routes, { initialUrl: "/employees" });
    // The account open: the business's registry key is saved on the device (src/lib/registry/).
    const registry = deriveBusinessRegistry(getAccountTeamKeys()!);
    await eventually(async () => {
      await expect(loadBusinessRegistry(profile)).resolves.toEqual(registry);
    });
    // Without anyone yet: what a team does, in three steps.
    const guide = await screen.findByTestId("team-empty");
    expect(within(guide).getByRole("header", { name: "Take payments as a team" })).toBeTruthy();
    expect(within(guide).getByLabelText(/^1\. Invite, /)).toBeTruthy();
    expect(within(guide).getByLabelText(/^2\. Set up their phone, /)).toBeTruthy();
    expect(within(guide).getByLabelText(/^3\. Follow their sales, /)).toBeTruthy();

    await fireEvent.press(screen.getByTestId("invite-employee"));
    await fireEvent.changeText(screen.getByTestId("invite-name"), "  Alice ");
    await fireEvent.press(screen.getByTestId("invite-create"));
    const link = await screen.findByTestId("invite-link");
    // Shown on mobile without its scheme, its host and path whole, then its fragment's start and
    // "…" (an iPhone, left to cut it, showed only the host's start); read in full by
    // screen readers. Not selectable while short: selected, it would open nothing.
    const url = String(link.props.accessibilityLabel);
    expect(url).toMatch(
      /^https:\/\/web\.example\/join#[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]+$/
    );
    expect(link.props.children).toBe(`${url.slice("https://".length, url.indexOf("#") + 7)}…`);
    expect(link.props.children).toMatch(/^web\.example\/join#[A-Za-z0-9_-]{6}…$/);
    expect(link.props.selectable).toBe(false);
    expect(screen.getByText("Invitation for Alice")).toBeTruthy();
    expect(screen.getByTestId("invite-share")).toBeTruthy();
    // The link copied from its row, as the secret it holds (src/lib/secret-clipboard.ts).
    await fireEvent.press(screen.getByTestId("invite-copy"));
    expect(jest.mocked(Clipboard.setStringAsync)).toHaveBeenCalledWith(url, SECRET_COPY);
    expect(await screen.findByText("Link copied")).toBeTruthy();
    // Its record in the roster (never in the settings), the channel and invitation published.
    const [alice] = await employees();
    expect(alice).toMatchObject({ name: "Alice", role: "employee" });
    expect(getAccountSettings()).not.toHaveProperty("team");
    for (const relay of TEAM_RELAYS) {
      expect(relays.stored.get(relay)?.length).toBeGreaterThanOrEqual(2);
    }
    await fireEvent.press(screen.getByTestId("invite-done"));
    // Among the invitations, with the day its link was made.
    expect(await screen.findByText("Pending invitations")).toBeTruthy();
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByText(/^Link created on /)).toBeTruthy();
  });

  it('asks the name last on desktop, next to "Create the link", scrolled to the end as a keyboard shrinks it', async () => {
    mockDesktop.mockReturnValue(true);
    const scrollToEnd = jest.spyOn(ScrollView.prototype, "scrollToEnd");
    scrollToEnd.mockClear();
    const { scrolledBody } = spyInviteScroll();
    await ownerDevice();
    await renderRouter(routes, { initialUrl: "/employees" });
    await screen.findByTestId("invite-employee");
    // A majority refuses the record: nobody is created.
    for (const relay of TEAM_RELAYS.slice(0, 3)) relays.readOnly.add(relay);
    await fireEvent.press(screen.getByTestId("invite-employee"));
    const body = await screen.findByTestId("invite-body");
    // The name before the lists is the mobile sheet's only.
    expect(inviteInOrder()).toEqual([
      "invite-lead",
      "invite-rights",
      "invite-notice",
      "invite-name",
      "invite-create"
    ]);
    // An iPad's keyboard shrinks the dialog: the name, last, comes into sight.
    await fireEvent(screen.getByTestId("invite-name-area"), "layout", NAME_AREA_LAYOUT);
    await fireEvent(screen.getByTestId("invite-name"), "focus");
    await fireEvent(body, "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 520, height: 300 } }
    });
    expect(
      scrollToEnd.mock.instances.filter(
        (view) => (view as unknown as { props: { testID?: string } }).props.testID === "invite-body"
      )
    ).toHaveLength(1);
    expect(scrollToEnd).toHaveBeenLastCalledWith({ animated: false });
    // Refused: its error under the field, next to the button pressed; nothing scrolls.
    await fireEvent.changeText(screen.getByTestId("invite-name"), "Alice");
    await fireEvent.press(screen.getByTestId("invite-create"));
    expect(
      await screen.findByText(
        "The invitation could not be published. Check your internet connection, then try again."
      )
    ).toBeTruthy();
    expect(scrolledBody()).toBe(0);
  });

  it("asks the name first on mobile, then says what the device, an employee's or a till, will and will not do", async () => {
    await ownerDevice();
    await renderRouter(routes, { initialUrl: "/employees" });
    await fireEvent.press(await screen.findByTestId("invite-employee"));
    await screen.findByTestId("invite-rights");
    expect(
      screen.getByText(
        "With this link, another device takes payments for your business: an employee's phone or a shared till. Payments go straight to your wallet."
      )
    ).toBeTruthy();
    const can = within(screen.getByTestId("invite-can"));
    expect(can.getByRole("header", { name: "This device will be able to" })).toBeTruthy();
    const cannot = within(screen.getByTestId("invite-cannot"));
    expect(cannot.getByRole("header", { name: "This device will not be able to" })).toBeTruthy();
    // Each line read with its list's title: a line of "This device will not be able to" read alone would say
    // the opposite.
    for (const line of [
      "Take payments: amount, items and scan",
      "Accept Lightning, on-chain or card payments",
      "Send a payment link to a customer",
      "See its own sales"
    ]) {
      expect(can.getByLabelText(`This device will be able to, ${line}`)).toBeTruthy();
      expect(cannot.queryByText(line)).toBeNull();
    }
    for (const line of [
      "See your balance or send funds",
      "Change your items, prices or settings",
      "See the sales of other employees or tills",
      "Manage the team, cards or integrations"
    ]) {
      expect(cannot.getByLabelText(`This device will not be able to, ${line}`)).toBeTruthy();
      expect(can.queryByText(line)).toBeNull();
    }
    // Lists of list items: on the web, a name is read only on an element with a role.
    // The list is no accessibility element of its own (on iOS, it would read its lines as one):
    // its role is on the view around them.
    for (const list of [can, cannot]) {
      const items = list.getAllByRole("listitem");
      expect(items).toHaveLength(4);
      for (const item of items) expect(item.parent?.props.role).toBe("list");
    }
    expect(screen.getByText("You can remove its access at any time.")).toBeTruthy();
    // Its name, a person's or a till's: an example of each, and where it shows.
    const name = screen.getByTestId("invite-name");
    expect(within(screen.getByTestId("invite-body")).getByText("Name")).toBeTruthy();
    expect(name.props.placeholder).toBe("E.g. Alice or Till 1");
    expect(screen.getByText("It shows next to its sales in your wallet.")).toBeTruthy();
    // What it says scrolls, "Create the link" out of it: always in sight. On mobile, the name under
    // what the link is for, before the lists, what its link allows last, next to the button that
    // makes it.
    const body = within(screen.getByTestId("invite-body"));
    expect(body.getByTestId("invite-name")).toBeTruthy();
    expect(body.queryByTestId("invite-create")).toBeNull();
    expect(screen.getByTestId("invite-create")).toBeTruthy();
    expect(inviteInOrder()).toEqual([
      "invite-lead",
      "invite-name",
      "invite-rights",
      "invite-notice",
      "invite-create"
    ]);
  });

  it("scrolls the name into sight as the keyboard shrinks the panel, not before it is focused", async () => {
    const { scrollTo, scrolledBody } = spyInviteScroll();
    await ownerDevice();
    await renderRouter(routes, { initialUrl: "/employees" });
    await fireEvent.press(await screen.findByTestId("invite-employee"));
    const body = await screen.findByTestId("invite-body");
    // Jest has no layout: the name laid out under the text that says what the link is for.
    await fireEvent(screen.getByTestId("invite-name-area"), "layout", NAME_AREA_LAYOUT);
    const tall = { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 420 } } };
    // The panel laid out, the field not focused: the text is read from its start.
    await fireEvent(body, "layout", tall);
    expect(scrolledBody()).toBe(0);
    // The field focused, the keyboard shrinks the panel: the name comes to the top of what shows.
    await fireEvent(screen.getByTestId("invite-name"), "focus");
    await fireEvent(body, "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 180 } }
    });
    expect(scrolledBody()).toBe(1);
    expect(scrollTo).toHaveBeenLastCalledWith({
      y: NAME_AREA_LAYOUT.nativeEvent.layout.y,
      animated: false
    });
    // The field left: a later layout leaves the scroll where the owner put it.
    await fireEvent(screen.getByTestId("invite-name"), "blur");
    await fireEvent(body, "layout", tall);
    expect(scrolledBody()).toBe(1);
  });

  it("opens again from the start of what it says, though its field was focused when it closed", async () => {
    const { scrolledBody } = spyInviteScroll();
    await ownerDevice();
    await renderRouter(routes, { initialUrl: "/employees" });
    await fireEvent.press(await screen.findByTestId("invite-employee"));
    await screen.findByTestId("invite-body");
    // Focused, then closed without its blur reaching it (a field unmounted while focused).
    await fireEvent(screen.getByTestId("invite-name"), "focus");
    await fireEvent.press(
      within(screen.getByTestId("invite-sheet")).getByRole("button", { name: "Close" })
    );
    await waitFor(() => expect(screen.queryByTestId("invite-body")).toBeNull());
    await fireEvent.press(await screen.findByTestId("invite-employee"));
    const body = await screen.findByTestId("invite-body");
    await fireEvent(body, "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 420 } }
    });
    expect(scrolledBody()).toBe(0);
  });

  it("says at the creation, and wherever its link shows, that it works once, until its end, for the employee only", async () => {
    await ownerDevice();
    await renderRouter(routes, { initialUrl: "/employees" });
    await fireEvent.press(await screen.findByTestId("invite-employee"));
    // Before the link exists: its 48 hours, its single use, and who may open it.
    expect(
      await screen.findByText(
        "The link will be valid for 48 hours and works only once. Give it only to the intended employee or till: the first person to open it can take their place."
      )
    ).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId("invite-name"), "Alice");
    await fireEvent.press(screen.getByTestId("invite-create"));
    await screen.findByTestId("invite-link");
    // Who scans it: the device that will take payments, an employee's phone or a till.
    expect(
      screen.getByText(
        "Scan this code with the device that will take payments, or send the link to that device."
      )
    ).toBeTruthy();
    const [alice] = await employees();
    // Its end to the minute, in the device's locale: 48 hours after its creation.
    const end = formatDate(
      new Date((alice!.invitedAt + 48 * 60 * 60) * 1000),
      getDeviceLocale().languageTag,
      { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }
    );
    const notice = `This link works only once and expires on ${end}. It is meant for Alice only: the first person to open it can take their place.`;
    expect(screen.getByText(notice)).toBeTruthy();
    // Shown again from its row: said again.
    await fireEvent.press(screen.getByTestId("invite-done"));
    await waitFor(() => expect(screen.queryByText(notice)).toBeNull());
    await fireEvent.press(await screen.findByTestId(`show-${alice!.id}`));
    expect(await screen.findByText(notice)).toBeTruthy();
  });

  it("copies the link first where no share sheet opens, without a second copy beside it", async () => {
    mockCanShare.mockReturnValue(false);
    await ownerDevice();
    const { member } = await inviteEmployee("Alice");
    await renderRouter(routes, { initialUrl: "/employees" });
    await fireEvent.press(await screen.findByTestId(`show-${member.id}`));
    const url = String((await screen.findByTestId("invite-link")).props.accessibilityLabel);
    expect(screen.queryByTestId("invite-share")).toBeNull();
    expect(screen.queryByText("Share the link")).toBeNull();
    expect(screen.getAllByTestId("invite-copy")).toHaveLength(1);
    await fireEvent.press(screen.getByText("Copy the link"));
    expect(jest.mocked(Clipboard.setStringAsync)).toHaveBeenCalledWith(url, SECRET_COPY);
    expect(await screen.findByText("Link copied")).toBeTruthy();
  });

  it("shows the whole link, selectable, once copying it failed on mobile", async () => {
    mockCanShare.mockReturnValue(false);
    await ownerDevice();
    const { member } = await inviteEmployee("Alice");
    await renderRouter(routes, { initialUrl: "/employees" });
    await fireEvent.press(await screen.findByTestId(`show-${member.id}`));
    const url = String((await screen.findByTestId("invite-link")).props.accessibilityLabel);
    expect(String(screen.getByTestId("invite-link").props.children)).toMatch(/…$/);
    jest.mocked(Clipboard.setStringAsync).mockResolvedValueOnce(false);
    await fireEvent.press(screen.getByText("Copy the link"));
    expect(
      await screen.findByText("The link could not be copied. Select it, then copy it")
    ).toBeTruthy();
    // What "Select it" means: the link itself, whole, not its short form.
    const link = screen.getByTestId("invite-link");
    expect(link.props.children).toBe(url);
    expect(link.props.selectable).toBe(true);
  });

  it("says it beside the link and its QR code on desktop too", async () => {
    mockDesktop.mockReturnValue(true);
    await ownerDevice();
    const { member, expiresAt } = await inviteEmployee("Alice");
    await renderRouter(routes, { initialUrl: "/employees" });
    await fireEvent.press(await screen.findByTestId(`show-${member.id}`));
    const end = formatDate(new Date(expiresAt * 1000), getDeviceLocale().languageTag, {
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit"
    });
    expect(
      await screen.findByText(
        `This link works only once and expires on ${end}. It is meant for Alice only: the first person to open it can take their place.`
      )
    ).toBeTruthy();
    expect(screen.getByTestId("invite-copy")).toBeTruthy();
  });

  it("deletes an invitation after its confirmation, and only then", async () => {
    await ownerDevice();
    const { member } = await inviteEmployee("Alice");
    await renderRouter(routes, { initialUrl: "/employees" });

    await fireEvent.press(await screen.findByTestId(`remove-${member.id}`));
    expect(await screen.findByText("Delete Alice's invitation?")).toBeTruthy();
    // "Back": nothing changes.
    await fireEvent.press(screen.getByText("Back"));
    expect(await employees()).toEqual([expect.objectContaining({ id: member.id })]);

    await fireEvent.press(screen.getByTestId(`remove-${member.id}`));
    await fireEvent.press(await screen.findByTestId("confirm-remove"));
    // Deleted for good, and said so.
    await eventually(async () => {
      expect(await employees()).toEqual([]);
    });
    expect(await screen.findByText("Invitation link disabled")).toBeTruthy();
    expect(screen.getByText(/^Alice can no longer join /)).toBeTruthy();
    // Gone from the list; the invitation closed on the relays.
    expect(await screen.findByTestId("team-empty")).toBeTruthy();
    const owner = getAccountTeamKeys()!;
    const keys = deriveMemberKeys(memberSecret(owner, member.id));
    await expect(fetchChannel(owner.publicKey, keys)).resolves.toMatchObject({
      channel: { status: "removed" }
    });
  });

  it("keeps the removal's dialog on a spinner until the relays took it, then closes it", async () => {
    await ownerDevice();
    const { member } = await inviteEmployee("Alice");
    await renderRouter(routes, { initialUrl: "/employees" });
    await fireEvent.press(await screen.findByTestId(`remove-${member.id}`));
    expect(await screen.findByText("Delete Alice's invitation?")).toBeTruthy();
    const remove = jest.spyOn(owner, "removeEmployee");

    const release = relays.holdPublishes();
    try {
      await fireEvent.press(screen.getByTestId("confirm-remove"));
      const confirm = screen.getByTestId("confirm-remove");
      expect(confirm.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
      // Its label keeps its room under the spinner; "Back" disabled, the dialog kept.
      expect(
        screen.queryByTestId("confirm-remove-spinner", { includeHiddenElements: true })
      ).toBeTruthy();
      expect(confirm).toHaveTextContent("Delete the invitation");
      const back = screen.getByRole("button", { name: "Back" });
      expect(back.props.accessibilityState).toMatchObject({ disabled: true });
      await fireEvent.press(back);
      // Pressed again: one removal.
      await fireEvent.press(confirm);
      expect(screen.getByTestId("remove-member")).toBeTruthy();
      expect(screen.queryByText("Invitation link disabled")).toBeNull();
    } finally {
      release();
    }

    expect(await screen.findByText("Invitation link disabled")).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId("remove-member")).toBeNull());
    expect(remove).toHaveBeenCalledTimes(1);
    remove.mockRestore();
    expect(await employees()).toEqual([]);
  });

  it("keeps the employee when no majority of the relays takes its removal", async () => {
    await ownerDevice();
    const { member } = await inviteEmployee("Alice");
    await renderRouter(routes, { initialUrl: "/employees" });
    await fireEvent.press(await screen.findByTestId(`remove-${member.id}`));
    // Read, but four of the seven relays take nothing: once deleted, nothing would publish it.
    const publishEvent = relays.publishEvent;
    const refuse = jest.spyOn(relays, "publishEvent").mockImplementation(async (url, ...rest) => {
      if (TEAM_RELAYS.slice(0, 4).includes(url)) throw new Error("Refused");
      return publishEvent(url, ...rest);
    });
    try {
      await fireEvent.press(await screen.findByTestId("confirm-remove"));
      expect(
        await screen.findByText(
          "The removal could not be published. Check your internet connection, then try again"
        )
      ).toBeTruthy();
    } finally {
      refuse.mockRestore();
    }
    // Its outcome came: the dialog closed, the failure said over the screen.
    await waitFor(() => expect(screen.queryByTestId("remove-member")).toBeNull());
    expect(await employees()).toEqual([expect.objectContaining({ id: member.id })]);
    expect(screen.queryByText("Invitation link disabled")).toBeNull();
  });

  it("asks again before removing an employee whose sales are not final, then cancels them", async () => {
    mockNetwork.mockReturnValue("mainnet");
    try {
      await ownerDevice();
      const { member } = await inviteEmployee("Alice");
      const owner = getAccountTeamKeys()!;
      const keys = deriveMemberKeys(memberSecret(owner, member.id));
      // An invoice its device shows now, not paid.
      const now = Math.floor(Date.now() / 1000);
      await publishMemberRecord(
        keys,
        saleEvent(keys, {
          version: 1,
          paymentHash: "cd".repeat(32),
          sats: "46918",
          fiat: { minor: 2450, digits: 2, currency: "CHF" },
          note: "",
          verifyUrl: `https://breez.tips/lnurlpay/verify/${"cd".repeat(32)}`,
          createdAt: now - 60,
          expiresAt: now + 540,
          paidAt: null,
          onchainAddress: null,
          onchainTag: null,
          sale: "e1".repeat(32)
        }),
        TEAM_RELAYS
      );
      // And a payment link it shared, which received nothing (no invoice declared for it yet).
      const link = await employeeLink(keys, now);

      await renderRouter(routes, { initialUrl: "/employees" });
      await fireEvent.press(await screen.findByTestId(`remove-${member.id}`));
      await fireEvent.press(await screen.findByTestId("confirm-remove"));
      // Not final: a second confirmation says what canceling does, nothing removed meanwhile.
      expect(await screen.findByText("Cancel Alice's invoices?")).toBeTruthy();
      expect(
        screen.getByText(
          "Some of Alice's invoices are not final yet. Their payment links that have received nothing yet will be canceled: their page will no longer show a code to pay. Those that were paid will be finalized. The invoices shown on their device will be canceled: the device stops showing them as soon as it receives the removal of their access. A customer who already scanned or copied an invoice can still pay it: the payment reaches the wallet. Alice's access is then removed."
        )
      ).toBeTruthy();
      // The same dialog, waiting no more: its new confirmation can be pressed, "Back" too.
      expect(screen.getByTestId("confirm-remove").props.accessibilityState).toMatchObject({
        busy: false,
        disabled: false
      });
      expect(screen.getByRole("button", { name: "Back" }).props.accessibilityState).toMatchObject({
        disabled: false
      });
      expect(await employees()).toEqual([expect.objectContaining({ id: member.id })]);
      await expect(fetchChannel(owner.publicKey, keys)).resolves.toMatchObject({
        channel: { status: "active" }
      });

      await fireEvent.press(screen.getByText("Cancel and remove"));
      await eventually(async () => expect(await employees()).toEqual([]));
      await expect(fetchChannel(owner.publicKey, keys)).resolves.toMatchObject({
        channel: { status: "removed" }
      });
      await waitFor(() => expect(screen.queryByTestId("remove-member")).toBeNull());
      // Its link canceled by the owner: the payer's page no longer offers to pay.
      const finals = await fetchOwnerFinalCopies(
        [{ author: link.id, key: link.key, owner: deriveBusinessRegistry(owner).owner }],
        "bc"
      );
      expect(finals?.get(link.id)?.link).toMatchObject({
        sale: { final: { status: "canceled", received: 0n } }
      });
    } finally {
      mockNetwork.mockReset().mockImplementation(() => {
        throw new Error("No network in the app config under Jest");
      });
    }
  });

  it("removes an employee at once whose only open sale claims to last longer than an invoice can", async () => {
    await ownerDevice();
    const { member } = await inviteEmployee("Alice");
    const owner = getAccountTeamKeys()!;
    const keys = deriveMemberKeys(memberSecret(owner, member.id));
    // Recorded with Alice's keys by whoever opened her invitation first: an
    // invoice not paid, shown an hour and a half ago, that would end in a year.
    const now = Math.floor(Date.now() / 1000);
    await publishMemberRecord(
      keys,
      saleEvent(keys, {
        version: 1,
        paymentHash: "cd".repeat(32),
        sats: "46918",
        fiat: { minor: 2450, digits: 2, currency: "CHF" },
        note: "",
        verifyUrl: `https://breez.tips/lnurlpay/verify/${"cd".repeat(32)}`,
        createdAt: now - 5400,
        expiresAt: now + 365 * 24 * 3600,
        paidAt: null,
        onchainAddress: null,
        onchainTag: null,
        sale: "e2".repeat(32)
      }),
      TEAM_RELAYS
    );
    // No second confirmation: nothing is open.
    await removeEmployee(member);
    expect(await employees()).toEqual([]);
  });

  it("removes an employee whose payment link no relay can give, at once, and also once confirmed again", async () => {
    mockNetwork.mockReturnValue("mainnet");
    try {
      await ownerDevice();
      const { member } = await inviteEmployee("Alice");
      const { member: bob } = await inviteEmployee("Bob");
      const owner = getAccountTeamKeys()!;
      for (const [of, link] of [
        [member, "ab"],
        [bob, "ef"]
      ] as const) {
        const keys = deriveMemberKeys(memberSecret(owner, of.id));
        relays.unreachable.add("wss://nowhere.example");
        // Recorded with the employee's keys by whoever opened its invitation first: a payment
        // link on a relay that does not exist, which nobody can open; and one
        // no relay holds, recorded a moment ago.
        await publishMemberRecord(
          keys,
          linkEvent(keys, {
            version: 1,
            link: link.repeat(32),
            saleKey: "cd".repeat(32),
            createdAt: Math.floor(Date.now() / 1000) - 60,
            onchainTag: null,
            relays: of === member ? ["wss://nowhere.example"] : [...TEAM_RELAYS],
            sealedKey: "A".repeat(200)
          }),
          TEAM_RELAYS
        );
      }
      // The first one holds nothing back: the employee is removed at once.
      await removeEmployee(member);
      // The second one may still be published by its device: asked again, then removed.
      await expect(removeEmployee(bob)).rejects.toMatchObject({ code: "salesInProgress" });
      await removeEmployee(bob, { cancelOpen: true });
      expect(await employees()).toEqual([]);
    } finally {
      mockNetwork.mockReset().mockImplementation(() => {
        throw new Error("No network in the app config under Jest");
      });
    }
  });

  it("finalizes a link already paid, then removes the employee", async () => {
    mockNetwork.mockReturnValue("mainnet");
    try {
      await ownerDevice();
      const { member } = await inviteEmployee("Alice");
      const owner = getAccountTeamKeys()!;
      const keys = deriveMemberKeys(memberSecret(owner, member.id));
      const now = Math.floor(Date.now() / 1000);
      // Paid on-chain to an address the owner gave Alice, the sale not finalized by her device.
      const address = taprootAddress(13);
      const link = await employeeLink(
        keys,
        now,
        address,
        issueTag(deriveIssueKey(owner), member.id, address)
      );
      const txid = jest
        .requireMock<typeof import("../../jest/mempool")>("../lib/onchain/esplora")
        .pay(address, 49_000n);
      const hour = now - (now % 3600);
      mockSettlements.set(bytesToHex(link.key), {
        status: "paid",
        received: 49_000n,
        accepted: false,
        due: 49_000n,
        point: { hour, rate: 50_000 },
        lightning: [],
        onchain: {
          address,
          transactions: [{ txid, receivedAt: now * 1000, sats: 49_000n }],
          sats: 49_000n
        },
        finalFrom: now
      });

      await renderRouter(routes, { initialUrl: "/employees" });
      await fireEvent.press(await screen.findByTestId(`remove-${member.id}`));
      await fireEvent.press(await screen.findByTestId("confirm-remove"));
      await fireEvent.press(await screen.findByText("Cancel and remove"));
      await eventually(async () => expect(await employees()).toEqual([]));

      // Its final version says it was paid: neither canceled nor left without one.
      const finals = await fetchOwnerFinalCopies(
        [{ author: link.id, key: link.key, owner: deriveBusinessRegistry(owner).owner }],
        "bc"
      );
      expect(finals?.get(link.id)?.link).toMatchObject({
        sale: { final: { status: "paid", received: 49_000n } }
      });
    } finally {
      mockNetwork.mockReset().mockImplementation(() => {
        throw new Error("No network in the app config under Jest");
      });
    }
  });

  it("removes nothing when the second confirmation is declined", async () => {
    await ownerDevice();
    const { member } = await inviteEmployee("Alice");
    const owner = getAccountTeamKeys()!;
    const keys = deriveMemberKeys(memberSecret(owner, member.id));
    const now = Math.floor(Date.now() / 1000);
    await publishMemberRecord(
      keys,
      saleEvent(keys, {
        version: 1,
        paymentHash: "cd".repeat(32),
        sats: "46918",
        fiat: { minor: 2450, digits: 2, currency: "CHF" },
        note: "",
        verifyUrl: `https://breez.tips/lnurlpay/verify/${"cd".repeat(32)}`,
        createdAt: now - 60,
        expiresAt: now + 540,
        paidAt: null,
        onchainAddress: null,
        onchainTag: null,
        sale: "e3".repeat(32)
      }),
      TEAM_RELAYS
    );
    await renderRouter(routes, { initialUrl: "/employees" });
    await fireEvent.press(await screen.findByTestId(`remove-${member.id}`));
    await fireEvent.press(await screen.findByTestId("confirm-remove"));
    // Only its invoices shown at a point of sale: they cannot be canceled, the dialog says so.
    expect(
      await screen.findByText(
        "Some of Alice's invoices are not final yet. The invoices shown on their device will be canceled: the device stops showing them as soon as it receives the removal of their access. A customer who already scanned or copied an invoice can still pay it: the payment reaches the wallet. Alice's access is then removed."
      )
    ).toBeTruthy();
    await fireEvent.press(screen.getByText("Back"));
    await waitFor(() => expect(screen.queryByText("Cancel Alice's invoices?")).toBeNull());
    expect(await employees()).toEqual([expect.objectContaining({ id: member.id })]);
    await expect(fetchChannel(owner.publicKey, keys)).resolves.toMatchObject({
      channel: { status: "active" }
    });
  });

  it("removes an employee whose paid link is not final yet once confirmed again, its link left to settle", async () => {
    await ownerDevice();
    const { member } = await inviteEmployee("Alice");
    const owner = getAccountTeamKeys()!;
    const keys = deriveMemberKeys(memberSecret(owner, member.id));
    mockNetwork.mockReturnValue("mainnet");
    try {
      const now = Math.floor(Date.now() / 1000);
      // A link whose on-chain address was paid: its outcome is not final. Its address is not one
      // the owner gave the employee, so the owner can never vouch for it: whoever holds the
      // employee's keys makes such a link for nothing (any address that ever received a payment),
      // which would otherwise hold back its removal for good.
      const address = taprootAddress(11);
      await employeeLink(keys, now, address);
      jest
        .requireMock<typeof import("../../jest/mempool")>("../lib/onchain/esplora")
        .pay(address, 20_000n);
      // Asked to confirm again, with what is not final.
      await expect(removeEmployee(member)).rejects.toMatchObject({
        code: "salesInProgress",
        unsettled: { invoices: 0, links: 1 }
      });
      expect(await employees()).toEqual([expect.objectContaining({ id: member.id })]);
      // Confirmed: removed, the link left as it is (its sale is settled later, owner-finals.ts).
      await expect(removeEmployee(member, { cancelOpen: true })).resolves.toBe("linksLeft");
      expect(await employees()).toEqual([]);
      await expect(fetchChannel(owner.publicKey, keys)).resolves.toMatchObject({
        channel: { status: "removed" }
      });
    } finally {
      mockNetwork.mockReset().mockImplementation(() => {
        throw new Error("No network in the app config under Jest");
      });
    }
  });

  it("removes an employee whose sales cannot be told, once confirmed again", async () => {
    await ownerDevice();
    const { member } = await inviteEmployee("Alice");
    const owner = getAccountTeamKeys()!;
    const keys = deriveMemberKeys(memberSecret(owner, member.id));
    // A link record naming one of the account's relays, out of reach: whether it is final cannot
    // be told (a relay that answers nothing about it holds the removal back alike).
    const [down, ...up] = TEAM_RELAYS;
    await publishMemberRecord(
      keys,
      linkEvent(keys, {
        version: 1,
        link: "ab".repeat(32),
        saleKey: "cd".repeat(32),
        createdAt: Math.floor(Date.now() / 1000) - 60,
        onchainTag: null,
        relays: [down!],
        sealedKey: "A".repeat(200)
      }),
      TEAM_RELAYS
    );
    relays.unreachable.add(down!);
    await expect(removeEmployee(member)).rejects.toMatchObject({
      code: "salesInProgress",
      unsettled: null
    });
    // The other relays, a majority, take its removal.
    await expect(removeEmployee(member, { cancelOpen: true })).resolves.toBe("linksLeft");
    await expect(rosterOn(owner, up)).resolves.toMatchObject({
      active: [],
      removed: [expect.objectContaining({ id: member.id })]
    });
  });

  it("never waits on an employee's sales nor on canceling its links longer than their deadlines", async () => {
    await ownerDevice();
    const { member } = await inviteEmployee("Alice");
    // Thousands of records naming relays that never answer: reads that never end, here.
    const never = () => new Promise<never>(() => undefined);
    const reading = jest.spyOn(unsettledModule, "findUnsettled").mockImplementation(never);
    const canceling = jest.spyOn(cancelLinksModule, "cancelOpenLinks").mockImplementation(never);
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
    try {
      const asked = removeEmployee(member).catch((error: unknown) => error);
      await jest.advanceTimersByTimeAsync(owner.REMOVAL_READ_MS);
      await expect(asked).resolves.toMatchObject({ code: "salesInProgress", unsettled: null });
      const removal = removeEmployee(member, { cancelOpen: true });
      await jest.advanceTimersByTimeAsync(owner.REMOVAL_READ_MS + owner.REMOVAL_CANCEL_MS);
      await expect(removal).resolves.toBe("linksLeft");
    } finally {
      jest.useRealTimers();
      reading.mockRestore();
      canceling.mockRestore();
    }
    expect(await employees()).toEqual([]);
  });

  it("asks again before removing an employee whose sales cannot be told, then says what is left", async () => {
    await ownerDevice();
    const { member } = await inviteEmployee("Alice");
    const owner = getAccountTeamKeys()!;
    const keys = deriveMemberKeys(memberSecret(owner, member.id));
    const [down] = TEAM_RELAYS;
    await publishMemberRecord(
      keys,
      linkEvent(keys, {
        version: 1,
        link: "ab".repeat(32),
        saleKey: "cd".repeat(32),
        createdAt: Math.floor(Date.now() / 1000) - 60,
        onchainTag: null,
        relays: [down!],
        sealedKey: "A".repeat(200)
      }),
      TEAM_RELAYS
    );
    relays.unreachable.add(down!);
    await renderRouter(routes, { initialUrl: "/employees" });
    await fireEvent.press(await screen.findByTestId(`remove-${member.id}`));
    await fireEvent.press(await screen.findByTestId("confirm-remove"));
    expect(await screen.findByText("Cancel Alice's invoices?")).toBeTruthy();
    expect(
      screen.getByText(
        /^The state of Alice's invoices could not be checked\. Their payment links that have received nothing yet will be canceled/
      )
    ).toBeTruthy();
    await fireEvent.press(screen.getByText("Cancel and remove"));
    // An invitation not used yet (no device joined): its own title, with what is left.
    expect(await screen.findByText("Invitation link disabled")).toBeTruthy();
    expect(
      screen.getByText(
        `Alice is no longer part of ${getAccountSettings()?.businessName}'s team. Their payment links that could not be canceled can still be paid until they end: their payments reach the wallet`
      )
    ).toBeTruthy();
    await eventually(async () => expect(await employees()).toEqual([]));
  });

  it("records a removal another of the owner's devices made in the channel alone, at the next sync", async () => {
    await ownerDevice();
    const { member } = await inviteEmployee("Alice");
    const owner = getAccountTeamKeys()!;
    const keys = deriveMemberKeys(memberSecret(owner, member.id));
    // Removed on another device, which did not record it in the roster (it stopped meanwhile).
    const removedAt = Math.floor(Date.now() / 1000) + 1;
    await publishToRelays(
      channelEvent(owner, keys, { version: 1, status: "removed", updatedAt: removedAt }),
      { relays: TEAM_RELAYS, channel: "account", timeoutMs: 1000, authKey: owner.secretKey }
    );
    await syncTeamChannels();
    expect(await employees()).toEqual([]);
    // Recorded from its channel's date, its name kept for "Wallet".
    expect(await removedEmployees()).toEqual([
      { role: "employee", id: member.id, name: "Alice", since: member.invitedAt, removedAt }
    ]);
    await expect(loadTeam()).resolves.toMatchObject({ members: [] });
    // Its removal stays: a removed member is never made active again.
    await expect(fetchChannel(owner.publicKey, keys)).resolves.toMatchObject({
      channel: { status: "removed" }
    });
  });

  it("keeps both employees two of the owner's devices invite at once", async () => {
    await ownerDevice();
    // Bob invited on another of the owner's devices, at the same time as Alice here: each has its
    // own record, neither is lost (the settings, the newest copy winning whole, lost one).
    const bob: TeamMember = {
      id: newMemberId(),
      name: "Bob",
      role: "employee",
      invitedAt: Math.floor(Date.now() / 1000)
    };
    await Promise.all([inviteEmployee("Alice"), publishMember(getAccountTeamKeys()!, bob)]);
    expect((await employees()).map(({ name }) => name).sort()).toEqual(["Alice", "Bob"]);
    await expect(loadTeam()).resolves.toMatchObject({
      roster: "read",
      members: expect.arrayContaining([
        expect.objectContaining({ member: expect.objectContaining({ name: "Bob" }) }),
        expect.objectContaining({ member: expect.objectContaining({ name: "Alice" }) })
      ])
    });
  });

  it("removes an employee this device never read, as the screen listed it", async () => {
    await ownerDevice();
    // Invited on another of the owner's devices: its record, its channel.
    const member = await expiredInvitation();
    await removeEmployee(member);
    expect(await employees()).toEqual([]);
    const owner = getAccountTeamKeys()!;
    const keys = deriveMemberKeys(memberSecret(owner, member.id));
    const found = await fetchChannel(owner.publicKey, keys);
    expect(found).toMatchObject({ channel: { status: "removed" } });
    // Recorded as removed from its channel's date.
    expect(await removedEmployees()).toEqual([
      expect.objectContaining({
        id: member.id,
        name: "Alice",
        removedAt: found.status === "found" ? found.channel.updatedAt : -1
      })
    ]);
  });

  it("never makes active again a removal another device made, whatever this one shows", async () => {
    await ownerDevice();
    const { member } = await inviteEmployee("Alice");
    const owner = getAccountTeamKeys()!;
    // Removed on another of the owner's devices, its record first.
    const removedAt = member.invitedAt + 60;
    await publishRemoved(owner, member, removedAt);
    // This device knew her active: showing her invitation again republishes her record, dated by
    // her invitation, which no relay holding the removal takes.
    await showInvite(member.id).catch(() => undefined);
    expect(await employees()).toEqual([]);
    expect(await removedEmployees()).toEqual([expect.objectContaining({ removedAt })]);
    // Nor does its sync: the removal read, nothing active is published for her.
    await syncTeamChannels();
    expect(await removedEmployees()).toEqual([expect.objectContaining({ removedAt })]);
    await expect(loadTeam()).resolves.toMatchObject({ members: [] });
  });

  it("keeps listing an employee whose record's removal no majority took, and the sync records it", async () => {
    await ownerDevice();
    const { member } = await inviteEmployee("Alice");
    const owner = getAccountTeamKeys()!;
    const roster = deriveRosterKeys(owner).nostr.publicKey;
    await renderRouter(routes, { initialUrl: "/employees" });
    await fireEvent.press(await screen.findByTestId(`remove-${member.id}`));
    // Every relay takes its channel's removal, none its record's.
    const publishEvent = relays.publishEvent;
    const refuse = jest
      .spyOn(relays, "publishEvent")
      .mockImplementation(async (url, event, options) => {
        if (event.pubkey === roster) throw new Error("Refused");
        return publishEvent(url, event, options);
      });
    try {
      await fireEvent.press(await screen.findByTestId("confirm-remove"));
      expect(
        await screen.findByText(
          "This employee's access is cut off, but their removal could not be saved. Try again: it will also be saved the next time you open your account"
        )
      ).toBeTruthy();
      expect(screen.getByText("Cannot connect")).toBeTruthy();
    } finally {
      refuse.mockRestore();
    }
    // It stopped (its channel says so), and is still listed: its record is.
    const keys = deriveMemberKeys(memberSecret(owner, member.id));
    const found = await fetchChannel(owner.publicKey, keys);
    expect(found).toMatchObject({ channel: { status: "removed" } });
    expect(await employees()).toEqual([expect.objectContaining({ id: member.id })]);
    // The next sync records it, from its channel's date.
    await syncTeamChannels();
    expect(await employees()).toEqual([]);
    expect(await removedEmployees()).toEqual([
      expect.objectContaining({
        id: member.id,
        removedAt: found.status === "found" ? found.channel.updatedAt : -1
      })
    ]);
  });

  it("fills the lot of on-chain addresses of an employee once its invitation shows", async () => {
    await ownerDevice();
    const expired = await expiredInvitation();
    await renderRouter(routes, { initialUrl: "/employees" });
    await screen.findByText(/^Link expired on /);
    const fill = jest.spyOn(ownerAddresses, "syncEmployeeAddresses");
    const filled = () => fill.mock.calls.filter(([options]) => options?.again === true).length;
    try {
      // Invited: a filling after any running, which read the roster before it.
      await fireEvent.press(screen.getByTestId("invite-employee"));
      await fireEvent.changeText(screen.getByTestId("invite-name"), "Bob");
      await fireEvent.press(screen.getByTestId("invite-create"));
      await screen.findByTestId("invite-link");
      expect(filled()).toBe(1);
      await fireEvent.press(screen.getByTestId("invite-done"));

      // Renewed, and shown again (a filling may have missed it: offline, the wallet busy).
      await fireEvent.press(await screen.findByTestId(`reinvite-${expired.id}`));
      expect(await screen.findByText("Invitation for Alice")).toBeTruthy();
      expect(filled()).toBe(2);
      await fireEvent.press(screen.getByTestId("invite-done"));
      const [bob] = (await employees()).filter(({ name }) => name === "Bob");
      await fireEvent.press(await screen.findByTestId(`show-${bob!.id}`));
      expect(await screen.findByText("Invitation for Bob")).toBeTruthy();
      expect(filled()).toBe(3);
    } finally {
      fill.mockRestore();
    }
  });

  it("renews an invitation that ended unused from its share action", async () => {
    await ownerDevice();
    // Invited a day past its 48 hours: over.
    const member = await expiredInvitation();
    await renderRouter(routes, { initialUrl: "/employees" });
    expect(await screen.findByText(/^Link expired on /)).toBeTruthy();

    await fireEvent.press(screen.getByTestId(`reinvite-${member.id}`));
    expect(await screen.findByText("Invitation for Alice")).toBeTruthy();
    // A new member for a new link; the expired one removed.
    const team = await employees();
    expect(team).toEqual([expect.objectContaining({ name: "Alice" })]);
    expect(team[0]?.id).not.toBe(member.id);
    const link = screen.getByTestId("invite-link");
    await expect(
      fetchInvite(inviteLinkOf(String(link.props.accessibilityLabel))!, Date.now() / 1000)
    ).resolves.toMatchObject({ status: "open" });
  });

  it("lists an invitation of 48 hours as ended once they are over", async () => {
    await ownerDevice();
    const { member } = await inviteEmployee("Alice");
    const now = Math.floor(Date.now() / 1000);
    await expect(loadTeam(now + INVITE_VALIDITY_SECONDS - 1)).resolves.toMatchObject({
      members: [{ status: "invited", expiresAt: member.invitedAt + 48 * 60 * 60 }]
    });
    await expect(loadTeam(member.invitedAt + INVITE_VALIDITY_SECONDS)).resolves.toMatchObject({
      members: [{ status: "expired", expiresAt: member.invitedAt + 48 * 60 * 60 }]
    });
  });

  it("renews no invitation while offline, where an employee who joined shows as expired", async () => {
    await ownerDevice();
    const member = await expiredInvitation();
    // Read once since the account opened: shown offline as this device knew it, and said so.
    await loadTeam();
    for (const relay of TEAM_RELAYS) relays.unreachable.add(relay);
    await renderRouter(routes, { initialUrl: "/employees" });
    expect(
      await screen.findByText(
        "No relay answered: the list of employees could not be read. Check the connection, then come back to this screen."
      )
    ).toBeTruthy();
    expect(screen.getByText(/^Link expired on /)).toBeTruthy();
    // Renewing would remove the member, who may have joined.
    expect(screen.queryByTestId(`reinvite-${member.id}`)).toBeNull();
    // Its trash says what it does whatever the member's state.
    await fireEvent.press(screen.getByTestId(`remove-${member.id}`));
    expect(await screen.findByText("Remove Alice?")).toBeTruthy();
    relays.unreachable.clear();
    expect(await employees()).toEqual([expect.objectContaining({ id: member.id })]);
  });

  it("never shows an empty team while no relay answers, nor before its first read", async () => {
    await ownerDevice();
    await expiredInvitation();
    for (const relay of TEAM_RELAYS) relays.unreachable.add(relay);
    await renderRouter(routes, { initialUrl: "/employees" });
    expect(
      await screen.findByText(
        "No relay answered: the list of employees could not be read. Check the connection, then come back to this screen."
      )
    ).toBeTruthy();
    expect(screen.queryByTestId("team-empty")).toBeNull();
    expect(screen.queryByText(/^Link expired on /)).toBeNull();
  });

  it("says when not every relay gave the team, and when a newer app wrote a member", async () => {
    await ownerDevice();
    const member = await expiredInvitation();
    const owner = getAccountTeamKeys()!;
    // Another member's record, written by a newer version of the app: never shown nor written over.
    const roster = deriveRosterKeys(owner);
    await publishToRelays(
      sealRecord({
        type: "team-seat",
        value: { version: 5, role: "employee", id: "f".repeat(32) },
        signer: roster.nostr.secretKey,
        encryptionKey: roster.encryptionKey,
        address: seatAddress(roster, { role: "employee", id: "f".repeat(32) }),
        createdAt: 1790000000
      }),
      { relays: TEAM_RELAYS, channel: "account", timeoutMs: 1000, authKey: roster.nostr.secretKey }
    );
    for (const relay of TEAM_RELAYS.slice(0, 3)) relays.unreachable.add(relay);
    await renderRouter(routes, { initialUrl: "/employees" });
    expect(
      await screen.findByText("Not every relay answered: the list of employees may be incomplete.")
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Some employees come from a newer version of the app: update the app to see them."
      )
    ).toBeTruthy();
    expect(screen.getByTestId(`remove-${member.id}`)).toBeTruthy();
    expect(screen.queryAllByTestId(/^remove-/)).toHaveLength(1);
  });

  it("lists invitations and employees in a table on desktop", async () => {
    mockDesktop.mockReturnValue(true);
    await ownerDevice();
    const { url } = await inviteEmployee("Alice");
    await inviteEmployee("Bob");
    const ownerProfile = await loadTerminalProfile();
    // Alice's device joins.
    secureStore.resetSecureStore();
    resetTerminalProfileCache();
    await joinTeam(await previewInvite(inviteLinkOf(url)!));
    await saveTerminalProfile(ownerProfile as SavedTerminalProfile);
    resetTerminalProfileCache();

    await renderRouter(routes, { initialUrl: "/employees" });
    expect(await screen.findByText("Active")).toBeTruthy();
    for (const label of ["Name", "Status", "Date", "Pending"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByText(/^Joined on /)).toBeTruthy();
    // Desktop: the invitation's QR code, then "Copy the link".
    const bob = (await employees()).find(({ name }) => name === "Bob");
    await fireEvent.press(screen.getByTestId(`show-${bob!.id}`));
    expect(await screen.findByText("Invitation link")).toBeTruthy();
    expect(String(screen.getByTestId("invite-link").props.children)).toMatch(/^https:\/\//);
    await fireEvent.press(screen.getByTestId("invite-copy"));
    expect(await screen.findByText("Link copied")).toBeTruthy();
  });

  it("sorts the desktop table by a column and filters it by its values", async () => {
    mockDesktop.mockReturnValue(true);
    await ownerDevice();
    const { url } = await inviteEmployee("Bob");
    await inviteEmployee("Alice");
    const ownerProfile = await loadTerminalProfile();
    // Bob's device joins.
    secureStore.resetSecureStore();
    resetTerminalProfileCache();
    await joinTeam(await previewInvite(inviteLinkOf(url)!));
    await saveTerminalProfile(ownerProfile as SavedTerminalProfile);
    resetTerminalProfileCache();
    const byName = new Map((await employees()).map(({ id, name }) => [name, `member-${id}`]));
    const [bob, alice] = [byName.get("Bob"), byName.get("Alice")];

    await renderRouter(routes, { initialUrl: "/employees" });
    expect(await screen.findByText("Active")).toBeTruthy();
    const order = () => screen.getAllByTestId(/^member-/).map(({ props }) => props.testID);
    // The invitations first, then the employees.
    expect(order()).toEqual([alice, bob]);

    // "Name": its name alone, neither sorted nor filtered.
    expect(screen.queryByRole("button", { name: "Name" })).toBeNull();
    expect(screen.getByText("Name")).toBeTruthy();
    // "Active" before "Pending".
    await fireEvent.press(screen.getByTestId("team-column-state"));
    await fireEvent.press(screen.getByTestId("team-column-state-menu-ascending"));
    expect(order()).toEqual([bob, alice]);
    await fireEvent.press(
      screen.getByTestId("team-column-state-menu-outside", { includeHiddenElements: true })
    );

    await fireEvent.press(screen.getByTestId("team-column-state"));
    const states = within(screen.getByTestId("team-column-state-menu"));
    expect(states.getByLabelText("Pending, 1")).toBeTruthy();
    await fireEvent.press(states.getByLabelText("Active, 1"));
    expect(order()).toEqual([alice]);
    expect(screen.getByTestId("team-column-state")).toHaveProp(
      "accessibilityLabel",
      "Status, sorted: A to Z, filtered"
    );
    await fireEvent.press(states.getByLabelText("Pending, 1"));
    expect(screen.queryAllByTestId(/^member-/)).toEqual([]);
    expect(screen.getByText("No employees match the filters.")).toBeTruthy();
    await fireEvent.press(
      screen.getByTestId("team-column-state-menu-outside", { includeHiddenElements: true })
    );
    await fireEvent.press(screen.getByTestId("team-clear-filters"));
    // The filters gone, the order stays.
    expect(order()).toEqual([bob, alice]);
    // "Date": periods (both of today), "Status": its pills.
    await fireEvent.press(screen.getByTestId("team-column-date"));
    const dates = within(screen.getByTestId("team-column-date-menu")).getAllByRole("checkbox");
    expect(dates.slice(1).map(({ props }) => props.testID)).toEqual([
      "team-column-date-menu-value-today"
    ]);
    expect(dates[1]!.props.accessibilityLabel).toMatch(/, 2$/);
  });

  it.each([
    ["on a phone", false],
    ["on desktop", true]
  ])("lists each group by the date its rows show, the latest first, %s", async (_, desktop) => {
    mockDesktop.mockReturnValue(desktop);
    await ownerDevice();
    const team = getAccountTeamKeys()!;
    const now = Math.floor(Date.now() / 1000);
    const hour = 60 * 60;
    const day = 24 * hour;
    /** Invited `invitedAgo` seconds ago; its device, if any, joined (and left) that long ago. */
    const seat = async (
      name: string,
      invitedAgo: number,
      device?: { joinedAgo: number; leftAgo?: number }
    ) => {
      const member: TeamMember = {
        id: newMemberId(),
        name,
        role: "employee",
        invitedAt: now - invitedAgo
      };
      await publishMember(team, member);
      if (device) {
        const keys = deriveMemberKeys(memberSecret(team, member.id));
        await publishMemberRecord(
          keys,
          deviceEvent(keys, {
            version: 1,
            deviceId: "f".repeat(32),
            platform: "ios",
            joinedAt: now - device.joinedAgo,
            ...(device.leftAgo === undefined ? {} : { leftAt: now - device.leftAgo })
          }),
          TEAM_RELAYS
        );
      }
      return `member-${member.id}`;
    };
    // In each group, the order of their invitations is the other way round.
    const ann = await seat("Ann", 10 * day, { joinedAgo: hour });
    const ben = await seat("Ben", 5 * day, { joinedAgo: 4 * day });
    const cid = await seat("Cid", 20 * day, { joinedAgo: 19 * day, leftAgo: 2 * day });
    const dee = await seat("Dee", 15 * day, { joinedAgo: 14 * day, leftAgo: 10 * day });
    // Its link still valid; the other one's ended an hour ago, after the first was made.
    const eve = await seat("Eve", 30 * hour);
    const fay = await seat("Fay", INVITE_VALIDITY_SECONDS + hour);
    const latestFirst = [fay, eve, ann, ben, cid, dee];
    const order = () => screen.getAllByTestId(/^member-/).map(({ props }) => props.testID);

    await renderRouter(routes, { initialUrl: "/employees" });
    expect(await screen.findByText("Fay")).toBeTruthy();
    expect(within(screen.getByTestId(fay)).getByText(/^Link expired on /)).toBeTruthy();
    expect(within(screen.getByTestId(cid)).getByText(/^Left on /)).toBeTruthy();
    expect(order()).toEqual(latestFirst);
  });

  it("keeps the business's choice of on-chain payments for this device once the account is open", async () => {
    const profile = await ownerDevice();
    const { updateAccount } = jest.requireActual<typeof import("@/features/account/session")>(
      "@/features/account/session"
    );
    await updateAccount({ onchainPayments: false });
    await renderRouter(routes, { initialUrl: "/employees" });
    await eventually(async () => {
      await expect(loadOnchainPayments(profile)).resolves.toBe(false);
    });
  });

  it("keeps an employee whose invitation no relay took, and publishes it again from the list", async () => {
    await ownerDevice();
    await renderRouter(routes, { initialUrl: "/employees" });
    await screen.findByTestId("invite-employee");
    // The relays take its record, and nothing else.
    const roster = deriveRosterKeys(getAccountTeamKeys()!).nostr.publicKey;
    const publishEvent = relays.publishEvent;
    const refuse = jest
      .spyOn(relays, "publishEvent")
      .mockImplementation(async (url, event, options) => {
        if (event.pubkey !== roster) throw new Error("Refused");
        return publishEvent(url, event, options);
      });
    try {
      await fireEvent.press(screen.getByTestId("invite-employee"));
      await fireEvent.changeText(screen.getByTestId("invite-name"), "Alice");
      await fireEvent.press(screen.getByTestId("invite-create"));
      expect(
        await screen.findByText(
          "The employee is added to the list, but their invitation could not be published. Share their link from the list to try again"
        )
      ).toBeTruthy();
    } finally {
      refuse.mockRestore();
    }
    // Created once: no second Alice when trying again.
    const [alice, ...others] = await employees();
    expect(others).toEqual([]);
    await fireEvent.press(await screen.findByTestId(`show-${alice!.id}`));
    // Shown once a relay took the channel and the invitation.
    expect(await screen.findByTestId("invite-link")).toBeTruthy();
    const owner = getAccountTeamKeys()!;
    await expect(
      fetchChannel(owner.publicKey, deriveMemberKeys(memberSecret(owner, alice!.id)))
    ).resolves.toMatchObject({ channel: { status: "active" } });
  });

  it("keeps the name in the sheet when nothing was created, to try again", async () => {
    await ownerDevice();
    await renderRouter(routes, { initialUrl: "/employees" });
    await screen.findByTestId("invite-employee");
    // A majority refuses the record: nobody is created.
    for (const relay of TEAM_RELAYS.slice(0, 3)) relays.readOnly.add(relay);

    const { scrollTo, scrolledBody } = spyInviteScroll();
    await fireEvent.press(screen.getByTestId("invite-employee"));
    await fireEvent(await screen.findByTestId("invite-name-area"), "layout", NAME_AREA_LAYOUT);
    await fireEvent.changeText(screen.getByTestId("invite-name"), "Alice");
    expect(scrolledBody()).toBe(0);
    await fireEvent.press(screen.getByTestId("invite-create"));
    expect(
      await screen.findByText(
        "The invitation could not be published. Check your internet connection, then try again."
      )
    ).toBeTruthy();
    // Said under the field, at the top of what scrolls: brought back into sight, the owner may
    // have scrolled down to the lists before pressing "Create the link".
    expect(scrolledBody()).toBe(1);
    expect(scrollTo).toHaveBeenLastCalledWith({
      y: NAME_AREA_LAYOUT.nativeEvent.layout.y,
      animated: true
    });
    expect(screen.getByTestId("invite-name").props.value).toBe("Alice");
    expect(screen.queryByText(/is added to the list/)).toBeNull();
    expect(await employees()).toEqual([]);

    // The relays back: pressed again, Alice is invited once.
    relays.readOnly.clear();
    await fireEvent.press(screen.getByTestId("invite-create"));
    expect(await screen.findByTestId("invite-link")).toBeTruthy();
    expect((await employees()).map(({ name }) => name)).toEqual(["Alice"]);
  });

  // Relays that stay connected without answering, or write 40 s late.
  describe("with a relay that never answers", () => {
    /** Whether `task` settles within `ms` of the fake clock, advanced 100 ms at a time. */
    async function settlesWithin(task: Promise<unknown>, ms: number): Promise<boolean> {
      let settled = false;
      const done = () => {
        settled = true;
      };
      task.then(done, done);
      for (let spent = 0; spent < ms && !settled; spent += 100) {
        await jest.advanceTimersByTimeAsync(100);
      }
      return settled;
    }

    beforeEach(() => {
      jest.useFakeTimers({
        now: Date.now(),
        doNotFake: ["nextTick", "setImmediate", "queueMicrotask"]
      });
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it("invites without waiting for the sync's copies to it", async () => {
      jest.useRealTimers();
      await ownerDevice();
      await inviteEmployee("Alice");
      const team = getAccountTeamKeys()!;
      const [mute] = TEAM_RELAYS.slice(-1);
      relays.latency.set(mute!, Infinity);
      relays.calls.length = 0;
      jest.useFakeTimers({
        now: Date.now(),
        doNotFake: ["nextTick", "setImmediate", "queueMicrotask"]
      });

      // The sync at unlock gives Alice's channel to the relay that did not answer its read.
      const sync = syncTeamChannels();
      await expect(settlesWithin(sync, 3000)).resolves.toBe(false);
      const copies = () =>
        relays.calls.filter(
          ({ relay, operation, event }) =>
            relay === mute && operation === "publish" && event?.pubkey === team.publicKey
        );
      expect(copies()).not.toEqual([]);
      // Meanwhile, an invitation does not wait for that relay's timeout.
      const bob = inviteEmployee("Bob");
      await expect(settlesWithin(bob, 5000)).resolves.toBe(true);
      await expect(bob).resolves.toMatchObject({ member: { name: "Bob" } });
      await jest.advanceTimersByTimeAsync(TEAM_TIMEOUT_MS.background);
      await expect(sync).resolves.toBeUndefined();

      relays.latency.clear();
      jest.useRealTimers();
      expect((await employees()).map(({ name }) => name).sort()).toEqual(["Alice", "Bob"]);
    });

    it("gives its copies to it within one of its timeouts, however many employees", async () => {
      jest.useRealTimers();
      await ownerDevice();
      // More than the copies made at once elsewhere (COPIES_AT_ONCE): each channel lacks on it.
      for (const name of ["Alice", "Bob", "Erin", "Frank", "Heidi", "Grace"])
        await inviteEmployee(name);
      const team = getAccountTeamKeys()!;
      const [mute] = TEAM_RELAYS.slice(-1);
      relays.latency.set(mute!, Infinity);
      relays.calls.length = 0;
      jest.useFakeTimers({
        now: Date.now(),
        doNotFake: ["nextTick", "setImmediate", "queueMicrotask"]
      });

      const sync = syncTeamChannels();
      // Its reads, then one timeout of the relay that never answers: the copies go out together.
      await expect(settlesWithin(sync, TEAM_TIMEOUT_MS.background + 4000)).resolves.toBe(true);
      const copied = relays.calls.filter(
        ({ relay, operation, event }) =>
          relay === mute && operation === "publish" && event?.pubkey === team.publicKey
      );
      expect(copied).toHaveLength(6);
      relays.latency.clear();
    });

    it("tells at once that nobody was created, its record withdrawn where it went, even late", async () => {
      jest.useRealTimers();
      await ownerDevice();
      jest.useFakeTimers({
        now: Date.now(),
        doNotFake: ["nextTick", "setImmediate", "queueMicrotask"]
      });
      // Two relays whose writes stopped, one whose writes queue up 40 s: the record reaches two.
      const [first, second, late] = TEAM_RELAYS;
      relays.writeLatency.set(first!, Infinity);
      relays.writeLatency.set(second!, Infinity);
      relays.writeLatency.set(late!, 40_000);

      const invite = inviteEmployee("Alice").catch((error: unknown) => error);
      // Told once the relays that never answer passed their timeout, not that again for the
      // record's withdrawal.
      await expect(settlesWithin(invite, TEAM_TIMEOUT_MS.background + 3000)).resolves.toBe(true);
      await expect(invite).resolves.toMatchObject({ code: "unreachable" });
      // The slow relay takes the record late, then its withdrawal: nobody shows later, never
      // invited.
      await jest.advanceTimersByTimeAsync(2 * 40_000);
      relays.writeLatency.clear();
      jest.useRealTimers();
      expect(await employees()).toEqual([]);
      const { active, removed } = await rosterOn(getAccountTeamKeys()!, [late!]);
      expect(active).toEqual([]);
      expect(removed).toEqual([expect.objectContaining({ name: "Alice" })]);
    });
  });

  it("invites nobody while no majority of the relays gives the team or takes the record", async () => {
    await ownerDevice();
    // Fewer than a majority answer: the limit cannot be told.
    for (const relay of TEAM_RELAYS.slice(0, 3)) relays.unreachable.add(relay);
    await expect(inviteEmployee("Alice")).rejects.toMatchObject({ code: "unreachable" });
    relays.unreachable.clear();
    // A majority answers, a minority takes the record: nothing is created, and the record it
    // took is withdrawn there (else it would show later, never invited).
    for (const relay of TEAM_RELAYS.slice(0, 3)) relays.readOnly.add(relay);
    await expect(inviteEmployee("Alice")).rejects.toMatchObject({ code: "unreachable" });
    relays.readOnly.clear();
    expect(await employees()).toEqual([]);
    const owner = getAccountTeamKeys()!;
    expect(relays.calls.filter(({ event }) => event?.pubkey === owner.publicKey)).toEqual([]);
  });

  it("invites at most MAX_TEAM_MEMBERS employees, counted on the roster", async () => {
    await ownerDevice();
    const owner = getAccountTeamKeys()!;
    for (let index = 0; index < MAX_TEAM_MEMBERS; index += 1) {
      await publishMember(owner, {
        id: index.toString(16).padStart(32, "0"),
        name: `Employee ${index}`,
        role: "employee",
        invitedAt: 1790000000
      });
    }
    await expect(inviteEmployee("Alice")).rejects.toMatchObject({ code: "tooMany" });
    // One removed no longer counts.
    await publishRemoved(
      owner,
      { id: "0".repeat(32), name: "Employee 0", role: "employee", invitedAt: 1790000000 },
      1790000060
    );
    await expect(inviteEmployee("Alice")).resolves.toMatchObject({
      member: expect.objectContaining({ name: "Alice" })
    });
  });

  it("shows an invitation again, whatever the relays already hold of it", async () => {
    await ownerDevice();
    const { url, member } = await inviteEmployee("Alice");
    // Signed again with its first date, each copy has another id: a relay holding the first one
    // refuses it half of the time, as strfry does. Still shown, every time.
    for (let shown = 0; shown < 8; shown += 1) {
      await expect(showInvite(member.id)).resolves.toMatchObject({ url });
    }
    // The channel dated again since (the owner's sync after 30 days): newer than the one shown.
    const owner = getAccountTeamKeys()!;
    const keys = deriveMemberKeys(memberSecret(owner, member.id));
    const found = await fetchChannel(owner.publicKey, keys);
    if (found.status !== "found") throw new Error("No channel");
    await publishToRelays(
      channelEvent(owner, keys, { ...found.channel, updatedAt: member.invitedAt + 60 }),
      { relays: TEAM_RELAYS, channel: "account", timeoutMs: 1000, authKey: owner.secretKey }
    );
    await expect(showInvite(member.id)).resolves.toMatchObject({ url });
  });

  it("joins from the link, after showing the business, and only once", async () => {
    await ownerDevice();
    const business = getAccountSettings()?.businessName ?? "";
    const registry = deriveBusinessRegistry(getAccountTeamKeys()!);
    const { url } = await inviteEmployee("Alice");

    // Alice's phone opens the link: the app shows the business before using the invitation.
    newDevice();
    const router = await renderRouter(routes, {
      initialUrl: `/join${url.slice(url.indexOf("#"))}`
    });
    expect(await screen.findByTestId("join-business")).toBeTruthy();
    expect(screen.getByText(business)).toBeTruthy();
    expect(screen.getByText(`You will take payments for ${business} as Alice.`)).toBeTruthy();
    await fireEvent.press(screen.getByTestId("join-confirm"));
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));

    // A point of sale for the team: the business's address, never the wallet.
    await expect(loadTerminalProfile()).resolves.toEqual({
      version: 3,
      team: expect.stringMatching(/^[0-9a-f]{64}$/),
      memberName: "Alice",
      lightningAddress: ADDRESS,
      businessName: business,
      currency: "CHF"
    });
    expect(JSON.stringify(await loadTerminalProfile())).not.toContain(WALLET);
    await expect(loadMembership()).resolves.toMatchObject({ name: "Alice", version: 1 });
    // The business's registry, from the channel: the device declares its sales with it.
    await expect(loadBusinessRegistry((await loadTerminalProfile())!)).resolves.toEqual(registry);
    // No navigation, no padlock: the point of sale only.
    expect(screen.queryByTestId("dock-unlock")).toBeNull();
    // Closed in this device's name.
    await expect(fetchInvite(inviteLinkOf(url)!, Math.floor(Date.now() / 1000))).resolves.toEqual({
      status: "closed",
      device: (await loadMembership())?.deviceId
    });
  });

  it("opens the point of sale on an employee's device launched on a link to an owner's screen", async () => {
    await ownerDevice();
    const { url } = await inviteEmployee("Alice");
    newDevice();
    await joinTeam(await previewInvite(inviteLinkOf(url)!));

    // "Employees" is the owner's: as the app starts on it (a link, the browser's history), the
    // point of sale in its place (MemberShell), no error.
    const router = await renderRouter(routes, { initialUrl: "/employees" });
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    expect(screen.queryByTestId("dock-unlock")).toBeNull();
  });

  it("shows the business's logo before joining, read on the business's relays", async () => {
    await ownerDevice();
    await changeLogo(new Uint8Array(500).fill(7));
    const { url } = await inviteEmployee("Alice");

    // Alice's phone works with another list ("Advanced settings"): the logo is not there.
    newDevice();
    resetImages();
    setCurrentRelays(["wss://elsewhere.example"]);
    await renderRouter(routes, { initialUrl: `/join${url.slice(url.indexOf("#"))}` });
    expect(
      await screen.findByTestId("join-logo-image", { includeHiddenElements: true })
    ).toBeTruthy();
    expect(screen.getByTestId("join-business")).toBeTruthy();
  });

  it("shows the shop's icon before joining a business without a logo", async () => {
    await ownerDevice();
    const { url } = await inviteEmployee("Alice");
    newDevice();
    await renderRouter(routes, { initialUrl: `/join${url.slice(url.indexOf("#"))}` });
    expect(await screen.findByTestId("join-business")).toBeTruthy();
    // Beside the name, hidden from screen readers (BusinessMark).
    expect(screen.getByTestId("join-store", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId("join-store")).toBeNull();
    expect(screen.queryByTestId("join-logo", { includeHiddenElements: true })).toBeNull();
  });

  it("keeps one device of two that use the invitation at once", async () => {
    await ownerDevice();
    const { url } = await inviteEmployee("Alice");
    // Alice opened the link on her phone and on her tablet, and confirmed on both at once.
    newDevice();
    const [phone, tablet] = [
      await previewInvite(inviteLinkOf(url)!),
      await previewInvite(inviteLinkOf(url)!)
    ];
    const results = await Promise.allSettled([joinTeam(phone), joinTeam(tablet)]);

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const refused = results.find(({ status }) => status === "rejected") as PromiseRejectedResult;
    expect(refused.reason).toBeInstanceOf(JoinError);
    expect((refused.reason as JoinError).code).toBe("closed");
    // The one the relays keep.
    await expect(fetchInvite(inviteLinkOf(url)!, Math.floor(Date.now() / 1000))).resolves.toEqual({
      status: "closed",
      device: (await loadMembership())?.deviceId
    });
  });

  it("leaves when the relays kept another device's use of the invitation", async () => {
    await ownerDevice();
    const { url, member } = await inviteEmployee("Alice");
    const owner = getAccountTeamKeys()!;
    const business = getAccountSettings()?.businessName;
    const keys = deriveMemberKeys(memberSecret(owner, member.id));
    newDevice();
    await joinTeam(await previewInvite(inviteLinkOf(url)!));
    const mine = (await loadMembership())!.deviceId;

    // Another device used it at the same time and wrote after this one checked: the relays keep
    // its closed invitation (dated alike, with a lower event id).
    const kept = relays.stored
      .get(TEAM_RELAYS[0])!
      .find((event) => event.pubkey === keys.invite.nostr.publicKey)!;
    let other = kept;
    while (other.id >= kept.id) {
      other = closedInviteEvent(keys, {
        team: owner.publicKey,
        expiresAt: member.invitedAt + INVITE_VALIDITY_SECONDS,
        openedAt: member.invitedAt,
        closedAt: kept.created_at,
        device: "0f".repeat(16)
      });
    }
    for (const relay of TEAM_RELAYS) {
      relays.stored.set(relay, [
        ...(relays.stored.get(relay) ?? []).filter((event) => event.id !== kept.id),
        other
      ]);
    }
    expect(mine).not.toBe("0f".repeat(16));

    await expect(syncMembership()).resolves.toBe("removed");
    await expect(loadTerminalProfile()).resolves.toBeNull();
    expect(getRemovalNotice()).toBe(business);
  });

  it("stays when someone holding only the link names another device in the invitation", async () => {
    await ownerDevice();
    const { url, member } = await inviteEmployee("Alice");
    const owner = getAccountTeamKeys()!;
    newDevice();
    const link = inviteLinkOf(url)!;
    await joinTeam(await previewInvite(link));
    const joined = relays.stored
      .get(TEAM_RELAYS[0])!
      .find((event) => event.pubkey === inviteAuthor(link.key).publicKey)!;

    // Whoever saw the QR code later (the invitation used, its secret gone) signs as its author, and
    // writes a closed invitation of its own, newer, naming another device and never ending, with a
    // proof it cannot compute (deviceProof needs the member's secret).
    const forged = sealRecord({
      type: "team-invite",
      value: {
        version: 1,
        state: "closed",
        team: owner.publicKey,
        expiresAt: member.invitedAt + INVITE_VALIDITY_SECONDS,
        device: "0f".repeat(16),
        proof: "ab".repeat(32)
      },
      signer: inviteAuthor(link.key).secretKey,
      encryptionKey: link.key,
      address: inviteAddress(link.id),
      createdAt: joined.created_at + 60
    });
    await publishToRelays(forged, {
      relays: TEAM_RELAYS,
      channel: "account",
      timeoutMs: 1000,
      authKey: inviteAuthor(link.key).secretKey
    });

    await expect(syncMembership()).resolves.toBe("active");
    await expect(loadTerminalProfile()).resolves.not.toBeNull();
  });

  it("leaves on its own seconds after joining, when the relays kept another device's use", async () => {
    await ownerDevice();
    const { url, member } = await inviteEmployee("Alice");
    const owner = getAccountTeamKeys()!;
    const keys = deriveMemberKeys(memberSecret(owner, member.id));
    newDevice();
    jest.useFakeTimers();
    try {
      await joinTeam(await previewInvite(inviteLinkOf(url)!));
      expect(await loadTerminalProfile()).not.toBeNull();

      // The other device's closed invitation reaches the relays a few seconds later, with a lower
      // event id: the relays keep it.
      const kept = relays.stored
        .get(TEAM_RELAYS[0])!
        .find((event) => event.pubkey === keys.invite.nostr.publicKey)!;
      let other = kept;
      while (other.id >= kept.id) {
        other = closedInviteEvent(keys, {
          team: owner.publicKey,
          expiresAt: member.invitedAt + INVITE_VALIDITY_SECONDS,
          openedAt: member.invitedAt,
          closedAt: kept.created_at,
          device: "0f".repeat(16)
        });
      }
      for (const relay of TEAM_RELAYS) {
        relays.stored.set(relay, [
          ...(relays.stored.get(relay) ?? []).filter((event) => event.id !== kept.id),
          other
        ]);
      }

      // Without a launch nor a return to the foreground: read again JOIN_RECHECK_MS after joining.
      await jest.advanceTimersByTimeAsync(JOIN_RECHECK_MS - 1000);
      expect(await loadTerminalProfile()).not.toBeNull();
      await jest.advanceTimersByTimeAsync(1000);
      await eventually(async () => expect(await loadTerminalProfile()).toBeNull());
    } finally {
      jest.useRealTimers();
    }
  });

  it("tells a second phone that the invitation was used", async () => {
    await ownerDevice();
    const { url } = await inviteEmployee("Alice");
    newDevice();
    await joinTeam(await previewInvite(inviteLinkOf(url)!));

    newDevice();
    await renderRouter(routes, { initialUrl: `/join${url.slice(url.indexOf("#"))}` });
    expect(
      await screen.findByText("This invitation has already been used. Ask the owner for a new one.")
    ).toBeTruthy();
    await expect(loadTerminalProfile()).resolves.toBeNull();
  });

  it("joins with a QR code scanned in the app, after the employee confirms", async () => {
    await ownerDevice();
    const { url } = await inviteEmployee("Bob");
    newDevice();
    const router = await renderRouter(routes, { initialUrl: "/" });
    // "An invitation · Join by invitation" under "Log in", with the QR code's icon on
    // a phone (the link's on a computer: welcome-join.test.tsx).
    const join = await screen.findByTestId("join-team");
    expect(within(join).getByText("An invitation")).toBeTruthy();
    expect(within(join).getByText("Join by invitation")).toBeTruthy();
    expect(within(join).getByText(String.fromCodePoint(0xf029))).toBeTruthy(); // qrcode
    // Rows of "I already have", above the 44 px touch floor.
    for (const row of [join, screen.getByTestId("login")]) {
      const content = row.children[0];
      if (typeof content === "string") throw new Error("A row's content is a view");
      expect(StyleSheet.flatten(content.props.style)).toMatchObject({ minHeight: 62 });
    }
    await fireEvent.press(join);
    await waitFor(() => expect(router.getPathname()).toBe("/join"));

    // Something else in front of the camera first.
    await act(async () => camera.scan("https://example.com/menu"));
    expect(
      await screen.findByText("This is not an invitation link. Check that it was copied in full.")
    ).toBeTruthy();
    await act(async () => camera.scan(url));
    expect(await screen.findByTestId("join-business")).toBeTruthy();
    // Cancelled: nothing used, the scanner again.
    await fireEvent.press(screen.getByTestId("join-cancel"));
    expect(await screen.findByTestId("invite-camera")).toBeTruthy();
    await expect(fetchInvite(inviteLinkOf(url)!, 0)).resolves.toMatchObject({ status: "open" });

    // A link pasted works the same.
    await fireEvent.changeText(screen.getByTestId("join-link"), url);
    await fireEvent.press(screen.getByTestId("join-submit"));
    await fireEvent.press(await screen.findByTestId("join-confirm"));
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
  });

  it("never publishes over a removal made while the channels sync", async () => {
    await ownerDevice();
    const { member } = await inviteEmployee("Alice");
    const owner = getAccountTeamKeys()!;
    const keys = deriveMemberKeys(memberSecret(owner, member.id));
    // The sync of a month later (its channel dated again) reads the relays slowly; the owner
    // removes Alice meanwhile.
    let answer!: () => void;
    const slow = new Promise<void>((resolve) => (answer = resolve));
    const queryEvents = relays.queryEvents;
    // Only the sync's reads are slow: the removal's own reads (its sales, its channel) answer.
    let holding = true;
    const spy = jest.spyOn(relays, "queryEvents").mockImplementation(async (...args) => {
      if (holding) await slow;
      return queryEvents(...args);
    });
    const sync = syncTeamChannels(() => member.invitedAt + 31 * 24 * 60 * 60);
    await eventually(async () => expect(spy).toHaveBeenCalled());
    holding = false;
    await removeEmployee(member);
    spy.mockRestore();
    answer();
    await sync;

    const found = await fetchChannel(owner.publicKey, keys);
    expect(found.status === "found" && found.channel.status).toBe("removed");
  });

  it("dates an active channel again only from what most relays hold", async () => {
    await ownerDevice();
    const { member } = await inviteEmployee("Alice");
    const owner = getAccountTeamKeys()!;
    const keys = deriveMemberKeys(memberSecret(owner, member.id));
    const before = await fetchChannel(owner.publicKey, keys);
    // Two relays answer: another of the owner's devices may have removed Alice on the others.
    for (const relay of TEAM_RELAYS.slice(0, 3)) relays.unreachable.add(relay);
    await syncTeamChannels(() => member.invitedAt + 31 * 24 * 60 * 60);
    relays.unreachable.clear();
    const after = await fetchChannel(owner.publicKey, keys);
    expect(after.status === "found" && after.channel.updatedAt).toBe(
      before.status === "found" && before.channel.updatedAt
    );
    // Most of them: dated again.
    for (const relay of TEAM_RELAYS.slice(0, 2)) relays.unreachable.add(relay);
    await syncTeamChannels(() => member.invitedAt + 31 * 24 * 60 * 60);
    relays.unreachable.clear();
    const dated = await fetchChannel(owner.publicKey, keys);
    expect(dated.status === "found" && dated.channel.updatedAt).toBe(
      member.invitedAt + 31 * 24 * 60 * 60
    );
  });

  it("keeps every employee invited at once", async () => {
    await ownerDevice();
    await Promise.all([inviteEmployee("Alice"), inviteEmployee("Bob")]);
    expect((await employees()).map(({ name }) => name).sort()).toEqual(["Alice", "Bob"]);
  });

  it("shows the owner who joined, and removes an employee from its device", async () => {
    await ownerDevice();
    const { url, member } = await inviteEmployee("Alice");
    const owner = getAccountTeamKeys();
    const ownerProfile = await loadTerminalProfile();

    // Alice's device (the same storage under Jest: the owner's profile set aside).
    secureStore.resetSecureStore();
    resetTerminalProfileCache();
    const preview = await previewInvite(inviteLinkOf(url)!);
    expect(preview.channel).toMatchObject({ status: "active", name: "Alice" });
    await joinTeam(preview);

    await eventually(async () => {
      const team = await loadTeam();
      expect(team.online).toBe(true);
      expect(team.members).toEqual([
        expect.objectContaining({
          status: "joined",
          device: expect.objectContaining({ platform: "ios" })
        })
      ]);
    });

    // Its point of sale lists the business's articles with the keys its channel carries.
    await expect(syncMembership()).resolves.toBe("active");
    expect((await loadCatalogRecord())?.reader).toEqual(
      channelCatalogOf(deriveCatalogReader(owner!, 0), 0)
    );

    await removeEmployee(member);
    // The sync of the channels the removal starts on the owner's device, over before Alice's device
    // reads (the same storage under Jest: its till mode's catalogue keys are saved there).
    await syncTeamChannels();
    expect(await employees()).toEqual([]);
    await expect(loadTeam()).resolves.toMatchObject({ members: [] });
    const keys = deriveMemberKeys(memberSecret(owner!, member.id));
    await expect(fetchChannel(owner!.publicKey, keys)).resolves.toMatchObject({
      channel: { status: "removed" }
    });

    // Alice's device reads its channel: it forgets the business.
    await expect(syncMembership()).resolves.toBe("removed");
    await expect(loadTerminalProfile()).resolves.toBeNull();
    await expect(loadMembership()).resolves.toBeNull();
    // Nor the catalogue's keys: nothing of the business's articles stays on it.
    expect((await loadCatalogRecord())?.reader ?? null).toBeNull();
    expect(getRemovalNotice()).toBe(ownerProfile?.businessName);
    await renderRouter(routes, { initialUrl: "/" });
    expect(
      await screen.findByText(
        `This device is no longer part of the ${ownerProfile?.businessName} team.`
      )
    ).toBeTruthy();
  });

  it("lists an employee who left from its device after those still there, with the date it left", async () => {
    const { bob, alice } = await oneLeftOneStayed();
    // (Invited in the same second: the roster has no order between them but their ids.)
    const team = await loadTeam();
    expect(team.online).toBe(true);
    expect(team.members).toHaveLength(2);
    expect(team.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          member: expect.objectContaining({ id: alice.id }),
          status: "left",
          device: expect.objectContaining({ leftAt: expect.any(Number) })
        }),
        expect.objectContaining({
          member: expect.objectContaining({ id: bob.id }),
          status: "joined"
        })
      ])
    );

    await renderRouter(routes, { initialUrl: "/employees" });
    const details = await screen.findAllByText(/^(Joined|Left) on /);
    // Among the employees, Alice after Bob although invited after him; no invitation left.
    expect(details.map((node) => String(node.props.children))).toEqual([
      expect.stringMatching(/^Joined on /),
      expect.stringMatching(/^Left on /)
    ]);
    expect(screen.queryByText("Pending invitations")).toBeNull();

    // Listed until the owner removes it from the list: it has no access left to remove.
    const trash = screen.getByTestId(`remove-${alice.id}`);
    expect(trash.props.accessibilityLabel).toBe("Remove from the list");
    expect(screen.getByTestId(`remove-${bob.id}`).props.accessibilityLabel).toBe("Remove access");
    await fireEvent.press(trash);
    expect(await screen.findByText("Remove Alice from the list?")).toBeTruthy();
    const left = String(details[1].props.children).replace(/^Left on /, "");
    expect(
      screen.getByText(
        `Alice left ${getAccountSettings()?.businessName} on ${left}. Their past payments stay in the wallet, under their name.`
      )
    ).toBeTruthy();
    expect(screen.queryByText(/will no longer be able to take payments/)).toBeNull();
    expect(screen.getByText("Remove from the list")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("confirm-remove"));
    await eventually(async () => expect((await employees()).map(({ id }) => id)).toEqual([bob.id]));
    await waitFor(() => expect(screen.queryByText(/^Left on /)).toBeNull());
    // Its own confirmation: neither an access removed nor an invitation disabled.
    expect(await screen.findByText("Removed from the list")).toBeTruthy();
    expect(
      screen.getByText(
        `Alice no longer appears among ${getAccountSettings()?.businessName}'s employees`
      )
    ).toBeTruthy();
    expect(screen.queryByText("Access removed")).toBeNull();
    expect(screen.queryByText("Invitation link disabled")).toBeNull();
  });

  it("shows the owner the platform and the day each employee's device joined", async () => {
    const { bob, alice } = await oneLeftOneStayed();
    const team = await loadTeam();
    const joinedAt = team.members.find(({ member }) => member.id === bob.id)!.device!.joinedAt;
    const day = formatDate(new Date(joinedAt * 1000), getDeviceLocale().languageTag, {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
    await renderRouter(routes, { initialUrl: "/employees" });
    // Jest runs as iOS: the devices' records say so.
    const detail = await screen.findByTestId(`detail-${bob.id}`);
    expect(detail.props.accessibilityLabel).toBe(`Joined on ${day}, on iPhone or iPad`);
    expect(within(detail).getByText(`Joined on ${day}`)).toBeTruthy();
    expect(screen.getByTestId(`platform-${bob.id}-ios`)).toBeTruthy();
    // Gone, its device's platform still said, with the day it left.
    expect(screen.getByTestId(`platform-${alice.id}-ios`)).toBeTruthy();
    expect(screen.getByTestId(`detail-${alice.id}`).props.accessibilityLabel).toMatch(
      /^Left on .+, on iPhone or iPad$/
    );
  });

  it("shows no platform for an invitation not used yet, and shows it in the desktop table", async () => {
    mockDesktop.mockReturnValue(true);
    const { bob } = await oneLeftOneStayed();
    const { member: erin } = await inviteEmployee("Erin");
    await renderRouter(routes, { initialUrl: "/employees" });
    expect(await screen.findByTestId(`platform-${bob.id}-ios`)).toBeTruthy();
    expect(screen.getByTestId(`detail-${erin.id}`).props.accessibilityLabel).toMatch(
      /^Link created on [^,]+$/
    );
    expect(screen.queryByTestId(new RegExp(`^platform-${erin.id}-`))).toBeNull();
  });

  it('shows an employee who left as "Left" in the desktop table', async () => {
    mockDesktop.mockReturnValue(true);
    await oneLeftOneStayed();
    await renderRouter(routes, { initialUrl: "/employees" });
    expect(await screen.findByText("Left")).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText(/^Left on /)).toBeTruthy();
  });

  it("stays in the team while no relay takes its departure", async () => {
    await ownerDevice();
    const { url } = await inviteEmployee("Alice");
    const ownerProfile = await loadTerminalProfile();
    secureStore.resetSecureStore();
    resetTerminalProfileCache();
    await joinTeam(await previewInvite(inviteLinkOf(url)!));

    for (const relay of TEAM_RELAYS) relays.unreachable.add(relay);
    await expect(leaveBusiness()).rejects.toThrow(LeaveError);
    // Nothing forgotten: the owner would not know.
    await expect(loadMembership()).resolves.not.toBeNull();
    await expect(loadTerminalProfile()).resolves.toMatchObject({ memberName: "Alice" });
    relays.unreachable.clear();
    await saveTerminalProfile(ownerProfile as SavedTerminalProfile);
    await expect(loadTeam()).resolves.toMatchObject({ members: [{ status: "joined" }] });
  });

  it("stays in the team while only a minority of the relays takes its departure", async () => {
    await ownerDevice();
    const { url } = await inviteEmployee("Alice");
    const ownerProfile = await loadTerminalProfile();
    secureStore.resetSecureStore();
    resetTerminalProfileCache();
    await joinTeam(await previewInvite(inviteLinkOf(url)!));

    // 2 relays of 5 answer: not a majority, as for a removal.
    for (const relay of TEAM_RELAYS.slice(2)) relays.unreachable.add(relay);
    await expect(leaveBusiness()).rejects.toThrow(LeaveError);
    await expect(loadMembership()).resolves.not.toBeNull();
    await expect(loadTerminalProfile()).resolves.toMatchObject({ memberName: "Alice" });
    // The 2 relays that took the departure got the arrival back: the owner still sees Alice.
    relays.unreachable.clear();
    const memberProfile = await loadTerminalProfile();
    await saveTerminalProfile(ownerProfile as SavedTerminalProfile);
    resetTerminalProfileCache();
    await expect(loadTeam()).resolves.toMatchObject({ members: [{ status: "joined" }] });
    await saveTerminalProfile(memberProfile as SavedTerminalProfile);
    resetTerminalProfileCache();

    // Tried again once most of them answer: the device leaves, the owner sees it.
    relays.unreachable.clear();
    for (const relay of TEAM_RELAYS.slice(0, 2)) relays.unreachable.add(relay);
    await leaveBusiness();
    await expect(loadMembership()).resolves.toBeNull();
    relays.unreachable.clear();
    await saveTerminalProfile(ownerProfile as SavedTerminalProfile);
    await expect(loadTeam()).resolves.toMatchObject({ members: [{ status: "left" }] });
  });

  it("follows the business's details, and changes nothing while no relay answers", async () => {
    const ownerProfile = await ownerDevice();
    const { url } = await inviteEmployee("Alice");
    secureStore.resetSecureStore();
    resetTerminalProfileCache();
    const joined = await joinTeam(await previewInvite(inviteLinkOf(url)!));
    // Saved with the membership: the device declares the business's sales from its first one.
    await expect(loadBusinessRegistry(joined)).resolves.toEqual(
      deriveBusinessRegistry(getAccountTeamKeys()!)
    );

    // The owner's device, back with its profile: the business got a new currency.
    await saveTerminalProfile(ownerProfile);
    resetTerminalProfileCache();
    const { updateAccount } = jest.requireActual<typeof import("@/features/account/session")>(
      "@/features/account/session"
    );
    await updateAccount({ displayCurrency: "EUR", onchainPayments: false });
    await syncTeamChannels();

    // Alice's device again.
    await saveTerminalProfile({
      version: 3,
      team: getAccountTeamKeys()!.publicKey,
      memberName: "Alice",
      lightningAddress: ADDRESS,
      businessName: ownerProfile.businessName,
      currency: "CHF"
    });
    resetTerminalProfileCache();
    for (const relay of TEAM_RELAYS) relays.unreachable.add(relay);
    await expect(syncMembership()).resolves.toBe("unchanged");
    await expect(loadTerminalProfile()).resolves.toMatchObject({ currency: "CHF" });
    await expect(loadOnchainPayments(joined)).resolves.toBe(true);
    relays.unreachable.clear();
    await expect(syncMembership()).resolves.toBe("active");
    await expect(loadTerminalProfile()).resolves.toMatchObject({ currency: "EUR" });
    // Lightning only ("On-chain payments" off), kept beside the profile, whose format stays.
    await expect(loadOnchainPayments(joined)).resolves.toBe(false);
    expect(await loadTerminalProfile()).not.toHaveProperty("onchain");
  });

  it("carries the business's tolerance of on-chain underpayments to its devices, beside the profile", async () => {
    const ownerProfile = await ownerDevice();
    const { updateAccount } = jest.requireActual<typeof import("@/features/account/session")>(
      "@/features/account/session"
    );
    await updateAccount({ onchainTolerance: 500 });
    const { url, member } = await inviteEmployee("Alice");
    const team = getAccountTeamKeys()!;
    const keys = deriveMemberKeys(memberSecret(team, member.id));
    const found = await fetchChannel(team.publicKey, keys);
    if (found.status !== "found" || found.channel.status !== "active") {
      throw new Error("No channel");
    }
    // In the channel, never in the profile the point of sale shows.
    expect(found.channel.onchainTolerance).toBe(500);
    expect(found.channel.profile).not.toHaveProperty("onchainTolerance");

    secureStore.resetSecureStore();
    resetTerminalProfileCache();
    const joined = await joinTeam(await previewInvite(inviteLinkOf(url)!));
    // Held from the first sale, beside the profile, whose format stays.
    await expect(loadPosOptions(joined)).resolves.toEqual({
      onchain: true,
      onchainTolerance: 500,
      bitcoinNode: null
    });
    expect(await loadTerminalProfile()).not.toHaveProperty("onchainTolerance");

    // The owner's device, back with its profile: none from now on.
    await saveTerminalProfile(ownerProfile);
    resetTerminalProfileCache();
    await updateAccount({ onchainTolerance: 0 });
    await syncTeamChannels();
    const after = await fetchChannel(team.publicKey, keys);
    // None: absent, as in the channels of before.
    expect(after.status === "found" && after.channel).not.toHaveProperty("onchainTolerance");

    // Alice's device again: it follows.
    await saveTerminalProfile({
      version: 3,
      team: team.publicKey,
      memberName: "Alice",
      lightningAddress: ADDRESS,
      businessName: ownerProfile.businessName,
      currency: "CHF"
    });
    resetTerminalProfileCache();
    await expect(syncMembership()).resolves.toBe("active");
    await expect(loadPosOptions(joined)).resolves.toEqual({
      onchain: true,
      onchainTolerance: 0,
      bitcoinNode: null
    });
  });

  it("carries the merchant's own Bitcoin node to its employees' devices, beside the profile", async () => {
    const ownerProfile = await ownerDevice();
    const { updateAccount } = jest.requireActual<typeof import("@/features/account/session")>(
      "@/features/account/session"
    );
    const node = { url: "http://192.168.1.20:3006", fallback: "none", payers: false } as const;
    await updateAccount({ bitcoinNode: node });
    const { url, member } = await inviteEmployee("Alice");
    const team = getAccountTeamKeys()!;
    const keys = deriveMemberKeys(memberSecret(team, member.id));
    const found = await fetchChannel(team.publicKey, keys);
    if (found.status !== "found" || found.channel.status !== "active") {
      throw new Error("No channel");
    }
    // In the channel, never in the profile the point of sale shows.
    expect(found.channel.bitcoinNode).toEqual(node);
    expect(found.channel.profile).not.toHaveProperty("bitcoinNode");

    secureStore.resetSecureStore();
    resetTerminalProfileCache();
    const joined = await joinTeam(await previewInvite(inviteLinkOf(url)!));
    await expect(loadPosOptions(joined)).resolves.toEqual({
      onchain: true,
      onchainTolerance: 0,
      bitcoinNode: node
    });
    expect(await loadTerminalProfile()).not.toHaveProperty("bitcoinNode");

    // The owner's device, back with its profile: mempool.space from now on.
    await saveTerminalProfile(ownerProfile);
    resetTerminalProfileCache();
    await updateAccount({ bitcoinNode: null });
    await syncTeamChannels();
    const after = await fetchChannel(team.publicKey, keys);
    // mempool.space: absent, as in the channels of before.
    expect(after.status === "found" && after.channel).not.toHaveProperty("bitcoinNode");

    // Alice's device again: it follows.
    await saveTerminalProfile({
      version: 3,
      team: team.publicKey,
      memberName: "Alice",
      lightningAddress: ADDRESS,
      businessName: ownerProfile.businessName,
      currency: "CHF"
    });
    resetTerminalProfileCache();
    await expect(syncMembership()).resolves.toBe("active");
    await expect(loadPosOptions(joined)).resolves.toEqual({
      onchain: true,
      onchainTolerance: 0,
      bitcoinNode: null
    });
  });

  it("never joins without a relay taking the closed invitation", async () => {
    await ownerDevice();
    const { url } = await inviteEmployee("Alice");
    newDevice();
    const preview = await previewInvite(inviteLinkOf(url)!);
    for (const relay of TEAM_RELAYS) relays.unreachable.add(relay);
    await expect(joinTeam(preview)).rejects.toThrow(JoinError);
    await expect(loadTerminalProfile()).resolves.toBeNull();
    await expect(loadMembership()).resolves.toBeNull();
    relays.unreachable.clear();
    // The invitation can still be used.
    await expect(joinTeam(await previewInvite(inviteLinkOf(url)!))).resolves.toMatchObject({
      memberName: "Alice"
    });
  });

  it("never joins while only a minority of the relays takes the closed invitation, then joins once tried again", async () => {
    await ownerDevice();
    const { url } = await inviteEmployee("Alice");
    const link = inviteLinkOf(url)!;
    newDevice();
    const preview = await previewInvite(link);
    // Three relays of five answer but take nothing: two hold the closed invitation.
    const missed = TEAM_RELAYS.slice(2);
    for (const relay of missed) relays.readOnly.add(relay);
    await expect(joinTeam(preview)).rejects.toMatchObject({ code: "unreachable" });
    // Nothing saved: the device does not take payments.
    await expect(loadTerminalProfile()).resolves.toBeNull();
    await expect(loadMembership()).resolves.toBeNull();
    // A relay that missed the closed invitation still gives the open one, the secret with it:
    // the device must not count on it.
    await expect(
      fetchInvite({ ...link, relays: [missed[0]!] }, Math.floor(Date.now() / 1000))
    ).resolves.toMatchObject({ status: "open" });

    // Tried again (the link opened again): this device's own closed invitation is no "already used".
    relays.readOnly.clear();
    await expect(joinTeam(await previewInvite(link))).resolves.toMatchObject({
      memberName: "Alice"
    });
    const deviceId = (await loadMembership())?.deviceId;
    for (const relay of TEAM_RELAYS) {
      await expect(
        fetchInvite({ ...link, relays: [relay] }, Math.floor(Date.now() / 1000))
      ).resolves.toEqual({ status: "closed", device: deviceId });
    }
  });

  it("gives its closed invitation, at its syncs, to the relays that missed it", async () => {
    await ownerDevice();
    const { url } = await inviteEmployee("Alice");
    const link = inviteLinkOf(url)!;
    newDevice();
    const preview = await previewInvite(link);
    // A majority takes it: the device joins; two relays missed it and still give the secret.
    const missed = TEAM_RELAYS.slice(3);
    for (const relay of missed) relays.readOnly.add(relay);
    await joinTeam(preview);
    const deviceId = (await loadMembership())?.deviceId;
    const now = () => Math.floor(Date.now() / 1000);
    for (const relay of missed) {
      await expect(fetchInvite({ ...link, relays: [relay] }, now())).resolves.toMatchObject({
        status: "open"
      });
    }
    relays.readOnly.clear();
    await expect(syncMembership()).resolves.toBe("active");
    for (const relay of TEAM_RELAYS) {
      await expect(fetchInvite({ ...link, relays: [relay] }, now())).resolves.toEqual({
        status: "closed",
        device: deviceId
      });
    }
  });

  it("refuses an invitation on a device that already takes payments, and a removed member's", async () => {
    await ownerDevice();
    const { url, member } = await inviteEmployee("Alice");
    await expect(previewInvite(inviteLinkOf(url)!)).rejects.toMatchObject({ code: "alreadySetUp" });
    await removeEmployee(member);
    newDevice();
    await expect(previewInvite(inviteLinkOf(url)!)).rejects.toMatchObject({ code: "closed" });
  });

  it("publishes the employee's sales, readable by the employee and the owner", async () => {
    await ownerDevice();
    const { url, member } = await inviteEmployee("Alice");
    const owner = getAccountTeamKeys()!;
    secureStore.resetSecureStore();
    resetTerminalProfileCache();
    await joinTeam(await previewInvite(inviteLinkOf(url)!));

    const sale = {
      paymentHash: "ab".repeat(32),
      sats: "46918",
      fiat: { minor: 2450, digits: 2, currency: "CHF" },
      note: "Table 4",
      verifyUrl: `https://breez.tips/lnurlpay/verify/${"ab".repeat(32)}`,
      createdAt: 1790000000,
      expiresAt: 1790000600,
      onchainAddress: taprootAddress(7),
      sale: "e4".repeat(32)
    };
    const profile = (await loadTerminalProfile())!;
    recordSale(profile, { ...sale, paidAt: null });
    const keys = deriveMemberKeys(memberSecret(owner, member.id));
    await eventually(async () => {
      await expect(fetchSales(keys, 0)).resolves.toEqual([
        // No lot on this device: its tag is unknown.
        { version: 1, ...sale, paidAt: null, onchainTag: null }
      ]);
    });
    recordSale(profile, { ...sale, paidAt: 1790000030 });
    await eventually(async () => {
      await expect(fetchSales(keys, 0)).resolves.toEqual([
        { version: 1, ...sale, paidAt: 1790000030, onchainTag: null }
      ]);
    });
  });

  it("cannot invite without a web app for the links, nor without a name", async () => {
    await ownerDevice();
    await expect(inviteEmployee("   ")).rejects.toMatchObject({ code: "invalidName" });
    mockOrigin.mockReturnValue(null);
    await expect(inviteEmployee("Alice")).rejects.toThrow(TeamError);
    await expect(inviteEmployee("Alice")).rejects.toMatchObject({ code: "noWebApp" });
    expect(await employees()).toEqual([]);
  });

  it("sends an employee's device away from the owner's screens", async () => {
    await saveTerminalProfile({
      version: 3,
      team: "a".repeat(64),
      memberName: "Alice",
      lightningAddress: ADDRESS,
      businessName: "Fine Bakery",
      currency: "CHF"
    });
    const router = await renderRouter(routes, { initialUrl: "/employees" });
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    expect(screen.queryByTestId("employees")).toBeNull();
  });

  it("sends an employee's desktop away from the owner's screens, its side bar without their rows", async () => {
    mockDesktop.mockReturnValue(true);
    await saveTerminalProfile({
      version: 3,
      team: "a".repeat(64),
      memberName: "Alice",
      lightningAddress: ADDRESS,
      businessName: "Fine Bakery",
      currency: "CHF"
    });
    const router = await renderRouter(routes, { initialUrl: "/employees" });
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    expect(screen.getByTestId("sidebar-pos").props.accessibilityState.selected).toBe(true);
    // Its three destinations, "My activity" and "Settings" beside the point of sale.
    expect(screen.getByTestId("sidebar-wallet").props.accessibilityLabel).toBe("My activity");
    expect(screen.getByTestId("sidebar-settings")).toBeTruthy();
    expect(screen.queryByTestId("sidebar-employees")).toBeNull();
  });

  it('gives an employee\'s device "My activity": its own sales, read back from its records', async () => {
    mockNetwork.mockReturnValue("mainnet");
    try {
      await ownerDevice();
      const { url, member } = await inviteEmployee("Alice Martin");
      const keys = deriveMemberKeys(memberSecret(getAccountTeamKeys()!, member.id));
      newDevice();
      await joinTeam(await previewInvite(inviteLinkOf(url)!));
      const now = Math.floor(Date.now() / 1000);
      recordSale((await loadTerminalProfile())!, {
        paymentHash: "cd".repeat(32),
        sats: "46918",
        fiat: { minor: 2450, digits: 2, currency: "CHF" },
        note: "Table 4",
        verifyUrl: `https://breez.tips/lnurlpay/verify/${"cd".repeat(32)}`,
        createdAt: now - 120,
        expiresAt: now + 480,
        paidAt: now - 60,
        onchainAddress: null,
        sale: "e5".repeat(32)
      });
      // Published in the background: on the relays before the screen reads them.
      await eventually(async () => {
        expect((await fetchSales(keys, 0))?.[0]?.paidAt).toBe(now - 60);
      });

      const router = await renderRouter(routes, { initialUrl: "/pos" });
      // The employee's dock: "Charge" and "My activity", no padlock.
      expect(await screen.findByLabelText("My activity")).toBeTruthy();
      expect(screen.queryByTestId("dock-unlock")).toBeNull();
      await fireEvent.press(screen.getByLabelText("My activity"));
      await waitFor(() => expect(router.getPathname()).toBe("/wallet"));

      expect(await screen.findByTestId("activity-identity")).toHaveTextContent(
        /Alice Martin.*View limited to your own transactions/
      );
      expect(await screen.findByText("Table 4")).toBeTruthy();
      expect(screen.getByText("Your transactions")).toBeTruthy();
      // Neither the balance nor "Send"; no "To follow up" either: its sale is paid, nothing to
      // follow.
      expect(screen.queryByText("Balance")).toBeNull();
      expect(screen.queryByTestId("wallet-send")).toBeNull();
      expect(screen.queryByText("To follow up")).toBeNull();
      expect(screen.queryByTestId("activity-follow-ups")).toBeNull();

      // A payment link Alice shared, not paid yet: "To follow up" shows once the screen reads it
      // again (shown again), with its links open, never "Confirming" (no wallet here).
      const registry = (await loadBusinessRegistry((await loadTerminalProfile())!))!;
      const saleKey = new Uint8Array(32).fill(8);
      const link = createPaymentLink(
        {
          version: 3,
          businessName: "Fine Bakery",
          lightningAddress: ADDRESS,
          fiat: { minor: 25000, digits: 2, currency: "CHF" },
          note: "Bastion Coffee",
          onchainAddress: null,
          endsAt: now + 3600,
          registryKey: bytesToHex(registry.key),
          registryReader: registry.reader,
          owner: registry.owner
        },
        "https://web.example",
        now - 60,
        saleKey
      );
      await publishPaymentLink(link);
      await publishMemberRecord(
        keys,
        linkEvent(keys, {
          version: 1,
          link: link.id,
          saleKey: bytesToHex(saleKey),
          createdAt: now - 60,
          onchainTag: null,
          relays: [...TEAM_RELAYS],
          sealedKey: "A".repeat(200)
        })
      );
      // And an invoice her point of sale shows, not paid yet: "Open" until its end.
      recordSale((await loadTerminalProfile())!, {
        paymentHash: "ef".repeat(32),
        sats: "23000",
        fiat: { minor: 1200, digits: 2, currency: "CHF" },
        note: "Table 9",
        verifyUrl: `https://breez.tips/lnurlpay/verify/${"ef".repeat(32)}`,
        createdAt: now - 30,
        expiresAt: now + 570,
        paidAt: null,
        onchainAddress: null,
        sale: "e6".repeat(32)
      });
      // And a sale her point of sale saw paid: its row's line is its time alone, on one line,
      // never where it comes from, nobody named in her own view.
      recordSale((await loadTerminalProfile())!, {
        paymentHash: "ed".repeat(32),
        sats: "9000",
        fiat: { minor: 500, digits: 2, currency: "CHF" },
        note: "Table 3",
        verifyUrl: `https://breez.tips/lnurlpay/verify/${"ed".repeat(32)}`,
        createdAt: now - 120,
        expiresAt: now + 480,
        paidAt: now - 90,
        onchainAddress: null,
        sale: "e5".repeat(32)
      });
      await eventually(async () => {
        expect((await fetchSales(keys, 0))?.map((sale) => sale.paymentHash)).toEqual(
          expect.arrayContaining(["ef".repeat(32), "ed".repeat(32)])
        );
      });
      await fireEvent.press(screen.getByTestId("dock-slot-0"));
      await waitFor(() => expect(router.getPathname()).toBe("/pos"));
      await fireEvent.press(screen.getByLabelText("My activity"));
      await waitFor(() => expect(router.getPathname()).toBe("/wallet"));
      expect(await screen.findByText("Bastion Coffee")).toBeTruthy();
      expect(screen.getByText("To follow up")).toBeTruthy();
      expect(within(screen.getByTestId("activity-follow-up-open")).getByText("2")).toBeTruthy();
      const shown = screen.getByTestId(`activity-row-sale:${"ef".repeat(32)}`);
      expect(within(shown).getByText("Table 9")).toBeTruthy();
      expect(within(shown).getByText(/ · Open$/)).toBeTruthy();
      const paid = screen.getByTestId(`activity-row-sale:${"ed".repeat(32)}`);
      expect(within(paid).getByText("Table 3")).toBeTruthy();
      expect(within(paid).getByText(/^\d\d:\d\d$/).props.numberOfLines).toBe(1);
      expect(within(paid).queryByText(/Point of sale/)).toBeNull();
      // Its records are never known whole: no day's net.
      expect(screen.queryByLabelText(/^Day's net/)).toBeNull();
      // Only the states that have a row.
      expect(screen.queryByTestId("activity-follow-up-underpaid")).toBeNull();
      expect(screen.queryByTestId("activity-follow-up-unconfirmed")).toBeNull();
    } finally {
      mockNetwork.mockReset().mockImplementation(() => {
        throw new Error("No network in the app config under Jest");
      });
    }
  });

  it("keeps Android's keyboards from learning the invitation link pasted", async () => {
    const os = jest.replaceProperty(Platform, "OS", "android");
    try {
      await renderRouter(routes, { initialUrl: "/join" });
      expect((await screen.findByTestId("join-link")).props.keyboardType).toBe("visible-password");
    } finally {
      os.restore();
    }
  });

  it("leads an address without a screen to the start", async () => {
    const router = await renderRouter(routes, { initialUrl: "/no/such/page" });
    await waitFor(() => expect(router.getPathname()).toBe("/"));
    expect(await screen.findByTestId("join-team")).toBeTruthy();
  });

  // Last: with the app's root stack, the router's state outlives these tests.
  it("leaves nothing to go back to once the device joined", async () => {
    await ownerDevice();
    const { url } = await inviteEmployee("Alice");
    newDevice();
    // The welcome screen, then "Join by invitation", in the app's root stack.
    const router = await renderRouter(
      { ...routes, _layout: () => <Stack screenOptions={{ headerShown: false }} /> },
      { initialUrl: "/" }
    );
    await fireEvent.press(await screen.findByTestId("join-team"));
    await waitFor(() => expect(router.getPathname()).toBe("/join"));
    await fireEvent.changeText(screen.getByTestId("join-link"), url);
    await fireEvent.press(screen.getByTestId("join-submit"));
    await fireEvent.press(await screen.findByTestId("join-confirm"));
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));

    // "Back" (Android, a swipe, the browser): neither the invitation nor the welcome screen.
    expect(expoRouter.canGoBack()).toBe(false);
  });

  it("lets an employee's device open a payment link", async () => {
    await saveTerminalProfile({
      version: 3,
      team: "a".repeat(64),
      memberName: "Alice",
      lightningAddress: ADDRESS,
      businessName: "Fine Bakery",
      currency: "CHF"
    });
    // A root stack, as the app's: the screens below the one shown stay mounted, and render again.
    const router = await renderRouter(
      { ...routes, _layout: () => <Stack screenOptions={{ headerShown: false }} /> },
      { initialUrl: "/pos" }
    );
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
    // A payment link, opened in the app (universal link) over its point of sale: the payer's page
    // is open to anyone, it stays.
    await act(async () => expoRouter.push("/pay"));
    await waitFor(() => expect(router.getPathname()).toBe("/pay"));
    // Still there once the screens had their turn (the shell sent it back to /pos at once).
    await act(async () => undefined);
    await act(async () => undefined);
    expect(router.getPathname()).toBe("/pay");
    // Back to the point of sale below it (the router's state outlives the test otherwise).
    await act(async () => expoRouter.back());
    await waitFor(() => expect(router.getPathname()).toBe("/pos"));
  });
});
