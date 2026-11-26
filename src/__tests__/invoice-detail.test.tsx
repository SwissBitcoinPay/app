import "@/i18n";

import { router as appRouter } from "expo-router";
import { act, fireEvent, renderRouter, screen, waitFor, within } from "expo-router/testing-library";
import { Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AppLayout from "@/app/(app)/_layout";
import AmountScreen from "@/app/(app)/pos/index";
import PosLayout from "@/app/(app)/pos/_layout";
import WalletLayout from "@/app/(app)/wallet/_layout";
import WalletRoute from "@/app/(app)/wallet/index";
import InvoiceScreen from "@/app/(app)/wallet/invoice/[id]";
import NewInvoice from "@/app/(app)/wallet/invoice/new";
import LaunchScreen from "@/app/index";
import { DEFAULT_RELAYS } from "@/config/relays";
import { closeAccount, getAccountWalletId } from "@/features/account/session";
import type { ActivityItem } from "@/features/activity/model";
import { invoicePhase, invoiceTimelineEvents } from "@/features/invoices/InvoiceDetail";
import { linesLayout, NAME_MIN_WIDTH, TABLE_MIN_WIDTH } from "@/features/invoices/LinesCard";
import {
  defaultDueDate,
  loadInvoices,
  saveDraft,
  sendInvoice,
  type InvoiceForm
} from "@/features/invoices/invoices";
import { refreshInvoices } from "@/features/invoices/store";
import { signInWithPasskey } from "@/lib/breez/passkey";
import type { Invoice } from "@/lib/invoice/record";
import { fetchPaymentLink, parsePaymentLinkFragment } from "@/lib/payment-link/link";
import type { MerchantSettings } from "@/lib/settings/merchant";
import { saveMerchantSettings } from "@/lib/settings/store";
import type { OwnerTerminalProfile } from "@/lib/terminal/model";
import { saveTerminalProfile } from "@/lib/terminal/profile";
import { resetPayRequests } from "@/features/terminal/invoice";

import { TEST_WALLET_ID, testBackupKey, testSeed } from "../../jest/account";
import { lightningAddresses } from "../../jest/breez-sdk";
import { breezTipsFetch, resetBreezTips } from "../../jest/breez-tips";
import { setCoingeckoPrice } from "../../jest/coingecko";
import { bottomInsetOf } from "../../jest/layout";
import type * as RelaysFake from "../../jest/nostr-relays";
import { walletScreens } from "../../jest/router";
import type * as MailComposerFake from "../../jest/expo-mail-composer";
import * as printFake from "../../jest/expo-print";
import * as sharingFake from "../../jest/expo-sharing";

/*
 * An invoice's details from "Wallet": the amount
 * in its band, the state its link's row has, the action that follows it, the others behind the
 * three dots (mobile) or in the right column (desktop).
 */

jest.mock("../lib/breez/config", () => ({
  ...jest.requireActual("../lib/breez/config"),
  getWalletConfig: () => ({ network: "mainnet", apiKey: "test-api-key" }),
  getBreezNetwork: () => "mainnet"
}));
jest.mock("../lib/breez/passkey", () => ({
  createPasskeyWallet: jest.fn(),
  preparePasskeys: jest.fn(async () => undefined),
  passkeysReady: jest.fn(() => true),
  signInWithPasskey: jest.fn()
}));
jest.mock("../features/terminal/useRate", () => ({
  useRate: () => ({ rate: 100000, loading: false, current: () => 100000 })
}));
jest.mock("expo-clipboard", () => ({
  getStringAsync: jest.fn(),
  setStringAsync: jest.fn(async () => true)
}));
jest.mock("../config/payment-links", () => ({
  ...jest.requireActual("../config/payment-links"),
  getPaymentLinkOrigin: () => "https://web.example"
}));
const mockDesktop = jest.fn(() => false);
jest.mock("@/components/layout/useIsDesktop", () => ({
  ...jest.requireActual("@/components/layout/useIsDesktop"),
  useIsDesktop: () => mockDesktop()
}));

const signIn = jest.mocked(signInWithPasskey);
const relays = jest.requireMock<typeof RelaysFake>("../lib/nostr/relay");
const mailComposer = jest.requireMock<typeof MailComposerFake>("expo-mail-composer");

const settings: MerchantSettings = {
  version: 18,
  recoveryCheck: { verifiedAt: null, dueSince: null },
  bitcoinNode: null,
  productLookup: true,
  splitSince: 1790000000,
  legacyTransfers: [],
  businessAddress: null,
  companyNumber: "",
  vatNumber: "",
  vatRate: null,
  onchainTolerance: 0,
  formerAddressMetadata: [],
  updatedAt: 1790000000,
  signUp: "done",
  businessName: "Fine Bakery",
  usage: "merchant",
  bitcoinPercent: 100,
  payoutCurrency: "CHF",
  displayCurrency: "CHF",
  detectedCountry: "CH",
  payoutAccountId: null,
  onchainPayments: false,
  relays: [...DEFAULT_RELAYS],
  devices: [],
  logo: null
};

const profile: OwnerTerminalProfile & { backupKey: string } = {
  version: 2,
  walletId: TEST_WALLET_ID,
  backupKey: testBackupKey(),
  lightningAddress: "sattleme02c6047f94@breez.tips",
  businessName: "Fine Bakery",
  currency: "CHF"
};

const routes = {
  index: LaunchScreen,
  "(app)/_layout": AppLayout,
  "(app)/pos/_layout": PosLayout,
  "(app)/pos/index": AmountScreen,
  "(app)/wallet/_layout": WalletLayout,
  "(app)/wallet/index": WalletRoute,
  "(app)/wallet/invoice/new": NewInvoice,
  "(app)/wallet/invoice/[id]": InvoiceScreen
};

/** An invoice of 319.51 CHF to Bastion Coffee LLC. */
function form(patch: Partial<InvoiceForm> = {}): InvoiceForm {
  return {
    recipient: {
      name: "Bastion Coffee LLC",
      street: "12 Station Road",
      postalCode: "1204",
      city: "Geneva",
      country: "CH",
      reference: ""
    },
    currency: { code: "CHF", digits: 2 },
    lines: [
      { name: "Sourdough bread 800 g", quantity: 2400, unitMinor: 650, vatRate: 260 },
      { name: "Butter croissants", quantity: 6000, unitMinor: 180, vatRate: 260 },
      { name: "Delivery fee", quantity: 100, unitMinor: 4500, vatRate: 810 }
    ],
    dueDate: defaultDueDate(),
    terms: "Payment within 30 days net, no discount.",
    legal: "",
    redirectUrl: null,
    ...patch
  };
}

/** The app of a prepared device, unlocked, on "Wallet". */
async function openWallet() {
  await saveTerminalProfile(profile);
  const router = await renderRouter(routes, { initialUrl: "/" });
  await waitFor(() => expect(router.getPathname()).toBe("/pos"));
  await fireEvent.press(screen.getByTestId(mockDesktop() ? "sidebar-wallet" : "dock-unlock"));
  await waitFor(() => expect(getAccountWalletId()).toBe(TEST_WALLET_ID));
  if (!mockDesktop()) await fireEvent.press(await screen.findByLabelText("Wallet"));
  await waitFor(() => expect(router.getPathname()).toBe("/wallet"));
  return { router };
}

/** An invoice sent from this device, listed. */
async function sent(): Promise<Invoice> {
  const invoice = await act(() =>
    sendInvoice({
      form: form(),
      saved: null,
      known: [],
      profile,
      prepared: null,
      onPrepared: () => undefined,
      note: (number) => `Invoice ${number}`
    })
  );
  await act(() => refreshInvoices());
  return invoice;
}

async function show(invoice: Invoice) {
  await act(() => appRouter.push({ pathname: "/wallet/invoice/[id]", params: { id: invoice.id } }));
}

jest.setTimeout(30_000);

/** The tests' fetch as jest.setup.ts gives it (CoinGecko's fake among others). */
const DEFAULT_FETCH = jest.mocked(globalThis.fetch).getMockImplementation()!;

describe("an invoice's details", () => {
  beforeEach(async () => {
    closeAccount();
    relays.resetRelays();
    // An invoice sent without an on-chain address is checked against the Lightning address's
    // bounds (breez.tips: 1 BTC at most) at the present point (50 000 CHF per bitcoin).
    resetPayRequests();
    resetBreezTips();
    lightningAddresses.set("sattleme02c6047f94", "Fine Bakery");
    jest
      .mocked(globalThis.fetch)
      .mockImplementation((input, init) =>
        new URL(String(input)).host === "breez.tips"
          ? breezTipsFetch(input)
          : DEFAULT_FETCH(input, init)
      );
    const hour = Math.floor(Date.now() / 1000 / 3600) * 3600;
    for (let at = hour - 3 * 3600; at <= hour + 3 * 3600; at += 3600) {
      setCoingeckoPrice("CHF", at, 50_000);
    }
    mockDesktop.mockReturnValue(false);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    signIn.mockReset().mockResolvedValue({ seed: testSeed(), credentialId: null });
    await saveMerchantSettings(TEST_WALLET_ID, settings);
  });

  afterEach(() => {
    lightningAddresses.delete("sattleme02c6047f94");
    jest.mocked(globalThis.fetch).mockImplementation(DEFAULT_FETCH);
  });

  it('shows an invoice sent: its amount, its state once read, "Send a reminder by email"', async () => {
    const { router } = await openWallet();
    const invoice = await sent();
    await show(invoice);
    await waitFor(() => expect(router.getPathname()).toBe(`/wallet/invoice/${invoice.id}`));

    const number = `${invoice.number.year}-0001`;
    expect(await screen.findByText(`Invoice ${number}`)).toBeTruthy();
    const band = screen.getByTestId("invoice-detail-band");
    expect(within(band).getByText("Total due")).toBeTruthy();
    expect(within(band).getByText("319.51")).toBeTruthy();
    expect(within(band).getByText("Due date")).toBeTruthy();
    // Its link's row read: open.
    expect(await within(band).findByText("Open", undefined, { timeout: 10_000 })).toBeTruthy();
    // The invoice as sent: its recipient, its lines, its totals rate by rate.
    expect(screen.getByText("Bastion Coffee LLC")).toBeTruthy();
    expect(screen.getByText("Butter croissants")).toBeTruthy();
    expect(
      within(screen.getByTestId("invoice-detail-lines-totals")).getByText("319.51 CHF")
    ).toBeTruthy();
    // No dock over it.
    expect(screen.queryByLabelText("Wallet")).toBeNull();

    await fireEvent.press(screen.getByTestId("invoice-remind"));
    await waitFor(() => expect(mailComposer.mail.composed).toHaveLength(1));
    expect(mailComposer.mail.composed[0]!.body).toContain(invoice.sent!.link.url);
    expect(mailComposer.mail.composed[0]!.attachments).toEqual([
      expect.stringMatching(new RegExp(`/cache/Invoice-${invoice.number.year}-0001\\.pdf$`))
    ]);

    await fireEvent.press(screen.getByTestId("invoice-detail-back"));
    await waitFor(() => expect(router.getPathname()).toBe("/wallet"));
  });

  it("keeps its actions on the bottom safe area, counted once", async () => {
    // An iPhone's home indicator: the shell's band below the dock, hidden over the details.
    const insets = jest.mocked(useSafeAreaInsets);
    const original = insets.getMockImplementation();
    insets.mockReturnValue({ top: 47, right: 0, bottom: 34, left: 0 });
    try {
      const { router } = await openWallet();
      const invoice = await sent();
      await show(invoice);
      await waitFor(() => expect(router.getPathname()).toBe(`/wallet/invoice/${invoice.id}`));
      // The last of its actions, "Send a reminder by email".
      await waitFor(() =>
        expect(bottomInsetOf(screen.getByTestId("invoice-remind"))).toBe(34 + 12)
      );
    } finally {
      insets.mockImplementation(original);
    }
  });

  it("cancels an invoice nothing paid: its link says so, its pill too", async () => {
    await openWallet();
    const invoice = await sent();
    await show(invoice);
    const band = await screen.findByTestId("invoice-detail-band");
    await within(band).findByText("Open", undefined, { timeout: 10_000 });

    await fireEvent.press(screen.getByTestId("invoice-detail-more"));
    const menu = await screen.findByTestId("invoice-detail-menu");
    expect(within(menu).getByText("Copy the payment link")).toBeTruthy();
    expect(within(menu).getByText("Download the PDF")).toBeTruthy();
    expect(within(menu).getByText("Duplicate")).toBeTruthy();
    await fireEvent.press(within(menu).getByTestId("invoice-action-cancel"));
    expect(await screen.findByText(`Cancel invoice ${invoice.number.year}-0001?`)).toBeTruthy();
    // While the relays take its cancellation: a spinner, "Keep the invoice" disabled, the dialog
    // kept.
    const release = relays.holdPublishes();
    try {
      await fireEvent.press(screen.getByTestId("invoice-confirm-action"));
      await waitFor(() =>
        expect(screen.getByTestId("invoice-confirm-action").props.accessibilityState).toMatchObject(
          { busy: true, disabled: true }
        )
      );
      const keep = screen.getByRole("button", { name: "Keep the invoice" });
      expect(keep.props.accessibilityState).toMatchObject({ disabled: true });
      await fireEvent.press(keep);
      expect(screen.getByTestId("invoice-confirm")).toBeTruthy();
      expect(screen.queryByText("Invoice canceled")).toBeNull();
    } finally {
      release();
    }

    expect(await screen.findByText("Invoice canceled")).toBeTruthy();
    // Done: the dialog closed.
    await waitFor(() => expect(screen.queryByTestId("invoice-confirm")).toBeNull());
    expect(within(screen.getByTestId("invoice-detail-band")).getByText("Canceled")).toBeTruthy();
    // Paid or not, nothing to remind any more: "Duplicate" instead, which makes no document:
    // no language at its end.
    expect(screen.queryByTestId("invoice-remind")).toBeNull();
    expect(screen.getByTestId("invoice-duplicate")).toBeTruthy();
    expect(screen.queryByTestId("invoice-language")).toBeNull();
    const ref = parsePaymentLinkFragment(new URL(invoice.sent!.link.url).hash);
    let better: unknown = null;
    await act(async () => {
      await fetchPaymentLink(ref!, "bc", {
        onBetter: (copy) => {
          better = copy;
        }
      });
    });
    await waitFor(() =>
      expect(better).toMatchObject({ kind: "sale", sale: { final: { status: "canceled" } } })
    );
  });

  it("makes the PDF from the three dots", async () => {
    await openWallet();
    const invoice = await sent();
    await show(invoice);
    await fireEvent.press(await screen.findByTestId("invoice-detail-more"));
    await fireEvent.press(await screen.findByTestId("invoice-action-pdf"));
    await waitFor(() => expect(printFake.files).toHaveLength(1));
    const [{ html }] = printFake.files;
    expect(html).toContain("Bastion Coffee LLC");
    expect(html).toContain("319.51");
    // Shared under the invoice's name.
    await waitFor(() => expect(sharingFake.shared).toHaveLength(1));
    expect(sharingFake.shared[0]!.url).toMatch(
      new RegExp(`/cache/Invoice-${invoice.number.year}-0001\\.pdf$`)
    );
  });

  it("writes its mail and its PDF in the language picked beside them, the app's at first", async () => {
    await openWallet();
    const invoice = await sent();
    await show(invoice);
    const number = `${invoice.number.year}-0001`;
    // The app's language at first, at the end of "Send a reminder by email" (a split button),
    // named for what it is the language of.
    const chip = await screen.findByTestId("invoice-language");
    // Its code, then a chevron (an icon's glyph).
    expect(within(chip).getByText("EN")).toBeTruthy();
    expect(chip.props.accessibilityLabel).toBe("Email language: English. Change");
    expect(chip.props.accessibilityState).toMatchObject({ expanded: false });
    await fireEvent.press(chip);
    const menu = await screen.findByTestId("invoice-language-menu");
    expect(within(menu).getByText("Email language")).toBeTruthy();
    expect(screen.getByTestId("invoice-language").props.accessibilityState).toMatchObject({
      expanded: true
    });
    // Each language by its own name, the app's said to be the merchant's.
    for (const name of ["Français", "English", "Deutsch", "Deutsch (Schweiz)", "Suomi"]) {
      expect(within(menu).getByText(name)).toBeTruthy();
    }
    expect(within(menu).getByText("Your language")).toBeTruthy();
    expect(within(menu).getByTestId("invoice-language-en")).toBeChecked();

    // Swiss German: the mail, its PDF attached, Switzerland's words and spelling.
    await fireEvent.press(within(menu).getByTestId("invoice-language-de-CH"));
    await waitFor(() => expect(screen.queryByTestId("invoice-language-menu")).toBeNull());
    expect(within(screen.getByTestId("invoice-language")).getByText("DE-CH")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("invoice-remind"));
    await waitFor(() => expect(mailComposer.mail.composed).toHaveLength(1));
    const swiss = mailComposer.mail.composed[0]!;
    expect(swiss.subject).toBe(`Rechnung ${number} · Fine Bakery`);
    expect(swiss.body).toMatch(/^Guten Tag\n\nNachstehend finden Sie die Rechnung/);
    expect(swiss.body).toContain("Freundliche Grüsse");
    // Its amount as Switzerland writes it.
    expect(swiss.body).toMatch(/über 319\.51 CHF/);
    expect(swiss.attachments).toEqual([
      expect.stringMatching(new RegExp(`/cache/Rechnung-${number}\\.pdf$`))
    ]);
    expect(swiss.attached[0]).toContain('<html lang="de-CH">');
    expect(swiss.attached[0]).toContain("MWST");

    // German: Germany's words, its PDF from the three dots in the same language (one choice).
    await fireEvent.press(screen.getByTestId("invoice-language"));
    await fireEvent.press(await screen.findByTestId("invoice-language-de"));
    await fireEvent.press(await screen.findByTestId("invoice-detail-more"));
    const pdfChip = await screen.findByTestId("invoice-action-pdf-language");
    expect(within(pdfChip).getByText("DE")).toBeTruthy();
    // Beside "Download the PDF", the PDF's language.
    expect(pdfChip.props.accessibilityLabel).toBe("PDF language: Deutsch. Change");
    await fireEvent.press(screen.getByTestId("invoice-action-pdf"));
    // The mail's attachment was the first PDF made.
    await waitFor(() => expect(printFake.files).toHaveLength(2));
    const { html } = printFake.files[1]!;
    expect(html).toContain('<html lang="de">');
    expect(html).toContain("MwSt.");
    expect(html).toContain("Gesamtbetrag");
    // On a Swiss phone, German writes its numbers as Germany does.
    expect(html).toContain("319,51");
    await waitFor(() => expect(sharingFake.shared).toHaveLength(1));
    expect(sharingFake.shared[0]!.url).toMatch(new RegExp(`/cache/Rechnung-${number}\\.pdf$`));
    // The screen itself stays in the app's language.
    expect(screen.getAllByText(`Invoice ${number}`).length).toBeGreaterThan(0);
    expect(screen.queryByText(`Rechnung ${number}`)).toBeNull();
  });

  it('opens a draft from "To follow up": "Edit the draft", or removes it', async () => {
    const { router } = await openWallet();
    const draft = await act(() => saveDraft(form({ lines: [] }), null, []));
    await act(() => refreshInvoices());
    // Its row, among those to follow.
    await fireEvent.press(
      await screen.findByText("Bastion Coffee LLC", undefined, { timeout: 10_000 })
    );
    await waitFor(() => expect(router.getPathname()).toBe(`/wallet/invoice/${draft.id}`));
    const band = await screen.findByTestId("invoice-detail-band");
    expect(within(band).getByText("Draft")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("invoice-edit"));
    await waitFor(() => expect(router.getPathname()).toBe("/wallet/invoice/new"));
    expect(await screen.findByDisplayValue("Bastion Coffee LLC")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("invoice-back"));
    await waitFor(() => expect(router.getPathname()).toBe(`/wallet/invoice/${draft.id}`));

    await fireEvent.press(await screen.findByTestId("invoice-detail-more"));
    await fireEvent.press(await screen.findByTestId("invoice-action-remove"));
    await fireEvent.press(await screen.findByTestId("invoice-confirm-action"));
    expect(await screen.findByText("Draft deleted")).toBeTruthy();
    await waitFor(() => expect(router.getPathname()).toBe("/wallet"));
    const { invoices } = await act(() => loadInvoices());
    expect(invoices).toEqual([]);
  });

  it('saves a draft finished from its details, then shows "Wallet", not its details', async () => {
    const { router } = await openWallet();
    const draft = await act(() => saveDraft(form({ lines: [] }), null, []));
    await act(() => refreshInvoices());
    await fireEvent.press(
      await screen.findByText("Bastion Coffee LLC", undefined, { timeout: 10_000 })
    );
    await waitFor(() => expect(router.getPathname()).toBe(`/wallet/invoice/${draft.id}`));
    await fireEvent.press(await screen.findByTestId("invoice-edit"));
    await waitFor(() => expect(router.getPathname()).toBe("/wallet/invoice/new"));
    await fireEvent.changeText(
      await screen.findByDisplayValue("Bastion Coffee LLC"),
      "Lakeview Hotel"
    );
    await fireEvent.press(screen.getByTestId("invoice-save-draft"));

    expect(await screen.findByText("Invoice saved as a draft")).toBeTruthy();
    await waitFor(() => expect(router.getPathname()).toBe("/wallet"));
    expect(walletScreens(router)).toEqual(["index"]);
    const { invoices } = await act(() => loadInvoices());
    expect(invoices).toMatchObject([
      { id: draft.id, status: "draft", recipient: { name: "Lakeview Hotel" } }
    ]);
  });

  it('opens one wizard on a double tap on "Edit"', async () => {
    const { router } = await openWallet();
    const draft = await act(() => saveDraft(form({ lines: [] }), null, []));
    await act(() => refreshInvoices());
    await fireEvent.press(
      await screen.findByText("Bastion Coffee LLC", undefined, { timeout: 10_000 })
    );
    await waitFor(() => expect(router.getPathname()).toBe(`/wallet/invoice/${draft.id}`));
    const button = await screen.findByTestId("invoice-edit");
    // Both taps before the navigation renders again.
    await act(async () => {
      button.props.onClick();
      button.props.onClick();
    });
    await waitFor(() => expect(router.getPathname()).toBe("/wallet/invoice/new"));
    expect(walletScreens(router)).toEqual(["index", "invoice/[id]", "invoice/new"]);
  });

  it("lays out the actions, the recipient and the follow-up beside it on desktop", async () => {
    mockDesktop.mockReturnValue(true);
    const { router } = await openWallet();
    const invoice = await sent();
    await show(invoice);
    const number = `${invoice.number.year}-0001`;
    expect(await screen.findByText(` · invoice ${number}`)).toBeTruthy();
    expect(screen.getByRole("header", { name: "Bastion Coffee LLC" })).toBeTruthy();
    expect(screen.getByTestId("invoice-remind")).toBeTruthy();
    expect(screen.getByTestId("invoice-action-copy")).toBeTruthy();
    expect(screen.getByTestId("invoice-action-cancel")).toBeTruthy();
    expect(screen.getByText("Timeline")).toBeTruthy();
    expect(screen.getByText("Created")).toBeTruthy();
    expect(screen.getByText("Sent")).toBeTruthy();
    expect(screen.getByText("Payment within 30 days net, no discount.")).toBeTruthy();
    // The side bar stays.
    expect(screen.getByTestId("sidebar-wallet")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("invoice-detail-back"));
    await waitFor(() => expect(router.getPathname()).toBe("/wallet"));
  });

  it("lays out its lines by the card's own width on desktop, never the window's", async () => {
    mockDesktop.mockReturnValue(true);
    await openWallet();
    await show(await sent());
    const rows = await screen.findByTestId("invoice-detail-lines-rows");
    const lines = screen.getByTestId("invoice-detail-lines");
    const layout = (width: number) =>
      fireEvent(rows, "layout", { nativeEvent: { layout: { x: 0, y: 0, width, height: 200 } } });
    const table = () => within(lines).queryByText("Qty") !== null;
    const stacked = () => within(lines).queryAllByText(/· VAT /).length === 3;

    // Not measured yet: stacked, readable at any width.
    expect(within(lines).getByText("Butter croissants")).toBeTruthy();
    expect([table(), stacked()]).toEqual([false, true]);
    // Too narrow for the names beside the figures (an iPad in portrait, beside the side bar and
    // the actions): each line's figures under its name.
    await layout(TABLE_MIN_WIDTH - 1);
    expect([table(), stacked()]).toEqual([false, true]);
    // Wide enough: the table, its columns named.
    await layout(TABLE_MIN_WIDTH);
    expect([table(), stacked()]).toEqual([true, false]);
    expect(within(lines).getByText("Butter croissants")).toBeTruthy();
    // A screen under another one measures 0 on the web: the table stays.
    await layout(0);
    expect([table(), stacked()]).toEqual([true, false]);
    await layout(TABLE_MIN_WIDTH - 1);
    expect([table(), stacked()]).toEqual([false, true]);
    expect(
      within(screen.getByTestId("invoice-detail-lines-totals")).getByText("319.51 CHF")
    ).toBeTruthy();
  });

  it('leads "Wallet" to "Wallet", not to the invoice duplicated before', async () => {
    mockDesktop.mockReturnValue(true);
    const { router } = await openWallet();
    const first = await sent();
    await show(first);
    await fireEvent.press(await screen.findByTestId("invoice-action-duplicate"));
    await waitFor(() => expect(router.getPathname()).toBe("/wallet/invoice/new"));
    expect(await screen.findByDisplayValue("Bastion Coffee LLC")).toBeTruthy();
    for (let step = 0; step < 4; step++) {
      await fireEvent.press(screen.getByTestId("invoice-continue"));
    }
    expect(await screen.findByText("Check the invoice")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("invoice-create"));
    await fireEvent.press(
      await screen.findByTestId("invoice-sent-view", undefined, { timeout: 10_000 })
    );
    await waitFor(() =>
      expect(router.getPathname()).toMatch(/^\/wallet\/invoice\/(?!new$)[0-9a-f]{32}$/)
    );
    expect(router.getPathname()).not.toBe(`/wallet/invoice/${first.id}`);
    // The first invoice's details are still below the copy's: going back would show them.
    expect(walletScreens(router)).toEqual(["index", "invoice/[id]", "invoice/[id]"]);

    await fireEvent.press(await screen.findByTestId("invoice-detail-back"));
    await waitFor(() => expect(router.getPathname()).toBe("/wallet"));
    expect(walletScreens(router)).toEqual(["index"]);
  });

  it("says when the invoice is not there", async () => {
    await openWallet();
    await act(() =>
      appRouter.push({ pathname: "/wallet/invoice/[id]", params: { id: "ab".repeat(16) } })
    );
    expect(
      await screen.findByText(
        "This invoice cannot be found. It may have been deleted on another device."
      )
    ).toBeTruthy();
  });
});

describe("an invoice's phase", () => {
  const base = {
    version: 1,
    id: "ab".repeat(16),
    number: { year: 2026, sequence: 1 },
    recipient: { name: "", street: "", postalCode: "", city: "", country: "CH", reference: "" },
    currency: { code: "CHF", digits: 2 },
    lines: [],
    dueDate: null,
    dueAt: null,
    terms: "",
    legal: "",
    redirectUrl: null,
    createdAt: 1,
    updatedAt: 1
  } satisfies Omit<Invoice, "status" | "sent">;
  const draft: Invoice = { ...base, status: "draft", sent: null };
  const sentOne: Invoice = {
    ...base,
    status: "sent",
    sent: { at: 1, link: { id: "cd".repeat(32), key: "ef".repeat(32), relays: [], url: "" } }
  };
  const row = (state: ActivityItem["state"]) => ({ state }) as ActivityItem;

  it("is never one the rows did not prove", () => {
    expect(invoicePhase(draft, null, false)).toBe("draft");
    expect(invoicePhase(sentOne, null, false)).toBe("unknown");
    expect(invoicePhase(sentOne, row(null), false)).toBe("paid");
    expect(invoicePhase(sentOne, row("open"), false)).toBe("open");
    expect(invoicePhase(sentOne, row("underpaid"), false)).toBe("underpaid");
    expect(invoicePhase(sentOne, row("unconfirmed"), false)).toBe("unconfirmed");
    expect(invoicePhase(sentOne, row("expired"), false)).toBe("expired");
    expect(invoicePhase(sentOne, row("canceled"), false)).toBe("canceled");
    // A transfer's states are never a link's.
    expect(invoicePhase(sentOne, row("failed"), false)).toBe("unknown");
    // Canceled here, before the next read says so.
    expect(invoicePhase(sentOne, row("open"), true)).toBe("canceled");
  });
});

describe("an invoice's desktop follow-up", () => {
  const invoice = {
    dueDate: "2026-11-28",
    sent: { at: 1790000000 }
  } as Pick<Invoice, "dueDate" | "sent">;

  it("keeps the deadline only until payment", () => {
    expect(invoiceTimelineEvents(invoice, false)).toEqual(["created", "sent", "due"]);
    expect(invoiceTimelineEvents(invoice, true)).toEqual(["created", "sent", "paid"]);
  });
});

describe("an invoice's lines' layout", () => {
  it("is a table only on desktop, where the names keep their column", () => {
    // The names' column keeps about twenty characters beside the four figures' columns.
    expect(NAME_MIN_WIDTH).toBe(160);
    expect(TABLE_MIN_WIDTH).toBe(618);
    expect(linesLayout(true, TABLE_MIN_WIDTH)).toBe("table");
    expect(linesLayout(true, 1400)).toBe("table");
    expect(linesLayout(true, TABLE_MIN_WIDTH - 1)).toBe("stacked");
    expect(linesLayout(true, 282)).toBe("stacked");
    // Not measured yet.
    expect(linesLayout(true, 0)).toBe("stacked");
    // A phone or an iPad in a narrow window, whatever its width.
    expect(linesLayout(false, 0)).toBe("stacked");
    expect(linesLayout(false, 1400)).toBe("stacked");
  });
});
