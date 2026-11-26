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
import NewInvoice from "@/app/(app)/wallet/invoice/new";
import LaunchScreen from "@/app/index";
import { DEFAULT_RELAYS } from "@/config/relays";
import * as catalog from "@/features/catalog/catalog";
import { closeAccount, getAccountWalletId } from "@/features/account/session";
import {
  calendarDate,
  defaultDueDate,
  loadInvoices,
  saveDraft
} from "@/features/invoices/invoices";
import { refreshInvoices } from "@/features/invoices/store";
import { signInWithPasskey } from "@/lib/breez/passkey";
import { fetchPaymentLink, parsePaymentLinkFragment } from "@/lib/payment-link/link";
import type { MerchantSettings } from "@/lib/settings/merchant";
import { saveMerchantSettings } from "@/lib/settings/store";
import { formatInteger, formatPercent } from "@/lib/locale/format";
import { saveTerminalProfile } from "@/lib/terminal/profile";
import { motion, space } from "@/theme";

import { resetPayRequests } from "@/features/terminal/invoice";

import { TEST_WALLET_ID, testBackupKey, testSeed } from "../../jest/account";
import { lightningAddresses } from "../../jest/breez-sdk";
import { breezTipsFetch, resetBreezTips } from "../../jest/breez-tips";
import { setCoingeckoPrice } from "../../jest/coingecko";
import type * as DatePickerFake from "../../jest/datetimepicker";
import type * as MailComposerFake from "../../jest/expo-mail-composer";
import { bottomInsetOf } from "../../jest/layout";
import type * as MempoolFake from "../../jest/mempool";
import type * as RelaysFake from "../../jest/nostr-relays";
import { walletScreens } from "../../jest/router";

/*
 * "New invoice" from "Wallet": the five steps, a draft saved from any of them, and the invoice
 * created:
 * its payment link made, then the mail written in the mail form when asked, its PDF attached.
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
const mempool = jest.requireMock<typeof MempoolFake>("../lib/onchain/esplora");
const mailComposer = jest.requireMock<typeof MailComposerFake>("expo-mail-composer");
const datePicker = jest.requireMock<typeof DatePickerFake>(
  "@react-native-community/datetimepicker"
);

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
  onchainPayments: true,
  relays: [...DEFAULT_RELAYS],
  devices: [],
  logo: null
};

const routes = {
  index: LaunchScreen,
  "(app)/_layout": AppLayout,
  "(app)/pos/_layout": PosLayout,
  "(app)/pos/index": AmountScreen,
  "(app)/wallet/_layout": WalletLayout,
  "(app)/wallet/index": WalletRoute,
  "(app)/wallet/invoice/new": NewInvoice
};

/** The app of a prepared device, unlocked, on "Wallet". */
async function openWallet() {
  await saveTerminalProfile({
    version: 2,
    walletId: TEST_WALLET_ID,
    backupKey: testBackupKey(),
    lightningAddress: "sattleme02c6047f94@breez.tips",
    businessName: "Fine Bakery",
    currency: "CHF"
  });
  const router = await renderRouter(routes, { initialUrl: "/" });
  await waitFor(() => expect(router.getPathname()).toBe("/pos"));
  await fireEvent.press(screen.getByTestId(mockDesktop() ? "sidebar-wallet" : "dock-unlock"));
  await waitFor(() => expect(getAccountWalletId()).toBe(TEST_WALLET_ID));
  if (!mockDesktop()) await fireEvent.press(await screen.findByLabelText("Wallet"));
  await waitFor(() => expect(router.getPathname()).toBe("/wallet"));
  return { router };
}

async function type(testID: string, text: string) {
  await fireEvent.changeText(screen.getByTestId(testID), text);
}

/** Step 1, filled: Bastion Coffee LLC, in Geneva. */
async function fillRecipient() {
  await type("invoice-recipient-name", "Bastion Coffee LLC");
  await type("invoice-recipient-street", "12 Golden Cross Street");
  await type("invoice-recipient-postalCode", "1204");
  await type("invoice-recipient-city", "Geneva");
}

/** A line typed in the line being changed. */
async function typeLine(name: string, quantity: string, price: string, vat?: string) {
  await type("invoice-line-name", name);
  await type("invoice-line-quantity", quantity);
  await type("invoice-line-price", price);
  if (vat !== undefined) await type("invoice-line-vat", vat);
}

jest.setTimeout(30_000);

describe("New invoice", () => {
  beforeEach(async () => {
    closeAccount();
    relays.resetRelays();
    mockDesktop.mockReturnValue(false);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    signIn.mockReset().mockResolvedValue({ seed: testSeed(), credentialId: null });
    await saveMerchantSettings(TEST_WALLET_ID, settings);
  });

  it("refuses to create an invoice above Lightning's bounds while no on-chain address is ready, saying why", async () => {
    // The link would have no address: the explorer out of reach, no address of the pool is proven
    // unpaid. "On-chain payments" off is never the reason: the invoices ignore it, the message does
    // not send the owner there.
    await saveMerchantSettings(TEST_WALLET_ID, { ...settings, onchainPayments: false });
    mempool.chain.down.add("https://mempool.space/api");
    // breez.tips takes 1 BTC at most; 50,000 CHF per bitcoin now.
    const defaultFetch = jest.mocked(globalThis.fetch).getMockImplementation()!;
    resetPayRequests();
    resetBreezTips();
    lightningAddresses.set("sattleme02c6047f94", "Fine Bakery");
    jest
      .mocked(globalThis.fetch)
      .mockImplementation((input, init) =>
        new URL(String(input)).host === "breez.tips"
          ? breezTipsFetch(input)
          : defaultFetch(input, init)
      );
    const hour = Math.floor(Date.now() / 1000 / 3600) * 3600;
    for (let at = hour - 3 * 3600; at <= hour + 3 * 3600; at += 3600) {
      setCoingeckoPrice("CHF", at, 50_000);
    }
    try {
      const { router } = await openWallet();
      await fireEvent.press(await screen.findByTestId("wallet-new-invoice"));
      await waitFor(() => expect(router.getPathname()).toBe("/wallet/invoice/new"));
      await fillRecipient();
      await fireEvent.press(screen.getByTestId("invoice-continue"));
      expect(await screen.findByText("What are you invoicing?")).toBeTruthy();
      await fireEvent.press(screen.getByTestId("invoice-add-line"));
      await fireEvent.press(await screen.findByTestId("invoice-picker-manual"));
      // 60,000.00 CHF: 1.2 BTC.
      await typeLine("Cargo bike", "1", "60000", "0");
      await fireEvent.press(screen.getByTestId("invoice-continue"));
      await fireEvent.press(screen.getByTestId("invoice-continue"));
      expect(await screen.findByText("Finally, the administrative notes")).toBeTruthy();
      await fireEvent.press(screen.getByTestId("invoice-continue"));
      expect(await screen.findByText("Check the invoice")).toBeTruthy();
      await fireEvent.press(screen.getByTestId("invoice-create"));

      expect(
        await screen.findByText(
          `Above ${formatInteger(80_000_000n, "en-CH")} sats (the Lightning ceiling less a ${formatPercent(20, "en-CH")} margin), an invoice needs an on-chain address, and no Bitcoin address is ready. Try again in a moment`,
          undefined,
          { timeout: 10_000 }
        )
      ).toBeTruthy();
      // Still on its review, nothing created nor numbered.
      expect(screen.getByText("Check the invoice")).toBeTruthy();
      expect((await act(() => loadInvoices())).invoices).toEqual([]);
    } finally {
      lightningAddresses.delete("sattleme02c6047f94");
      jest.mocked(globalThis.fetch).mockImplementation(defaultFetch);
    }
  });

  it("goes through the five steps, then creates the invoice: its link made, the mail on request", async () => {
    const { router } = await openWallet();
    await fireEvent.press(await screen.findByTestId("wallet-new-invoice"));
    await waitFor(() => expect(router.getPathname()).toBe("/wallet/invoice/new"));
    // The whole window: no dock over the wizard.
    expect(screen.queryByLabelText("Wallet")).toBeNull();

    // 1. The recipient: "Continue" once its name and address are typed. No group titles, no
    // client reference.
    expect(await screen.findByText("Who is the invoice for?")).toBeTruthy();
    expect(screen.getByTestId("invoice-continue")).toBeDisabled();
    expect(screen.queryByText("Client")).toBeNull();
    expect(screen.queryByText("Postal address")).toBeNull();
    expect(screen.queryByText(/client reference/i)).toBeNull();
    await fillRecipient();
    expect(screen.getByText("Switzerland")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("invoice-continue"));

    // 2. The lines: none yet.
    expect(await screen.findByText("What are you invoicing?")).toBeTruthy();
    expect(screen.getByText("No items on this invoice")).toBeTruthy();
    // The only way to add one is inside the empty list.
    expect(
      within(screen.getByTestId("invoice-lines-empty")).getByTestId("invoice-add-line")
    ).toBeTruthy();
    expect(screen.getByTestId("invoice-continue")).toBeDisabled();
    await fireEvent.press(screen.getByTestId("invoice-add-line"));
    await fireEvent.press(await screen.findByTestId("invoice-picker-manual"));
    // A line typed, at the country's rate (Switzerland: 8.1%), without a sentence saying so.
    expect(screen.getByTestId("invoice-line-vat").props.value).toBe("8.1");
    expect(screen.queryByText(/Prefilled/)).toBeNull();
    await typeLine("Sourdough bread 800 g", "24", "6.50", "2.6");
    await fireEvent.press(screen.getByTestId("invoice-add-line"));
    await fireEvent.press(await screen.findByTestId("invoice-picker-manual"));
    await typeLine("Butter croissants", "60", "1.80", "2.6");
    await fireEvent.press(screen.getByTestId("invoice-add-line"));
    await fireEvent.press(await screen.findByTestId("invoice-picker-manual"));
    await typeLine("Delivery fee", "1", "45");
    // The totals: 309.00 before VAT, 6.86 and 3.65 of VAT, 319.51 CHF.
    const totals = screen.getByTestId("invoice-totals");
    expect(within(totals).getByText("309.00")).toBeTruthy();
    expect(within(totals).getByText("6.86")).toBeTruthy();
    expect(within(totals).getByText("3.65")).toBeTruthy();
    expect(within(totals).getByText("319.51 CHF")).toBeTruthy();
    // A price that is not one: the line says what to type, the step waits.
    await type("invoice-line-price", "45.001");
    expect(screen.getByText("Enter a price")).toBeTruthy();
    expect(screen.getByTestId("invoice-continue")).toBeDisabled();
    await type("invoice-line-price", "45");
    await fireEvent.press(screen.getByTestId("invoice-continue"));

    // 3. The due date: in 30 days, from tomorrow to 9 months; another one in the device's picker.
    expect(await screen.findByText("The payment link stays open until the due date.")).toBeTruthy();
    const now = new Date();
    const chosen = calendarDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 45));
    // On iOS, Apple's button lies invisible over the field: a press opens Apple's calendar.
    expect(screen.getByTestId("invoice-due-picker").props.display).toBe("compact");
    await act(async () => {
      datePicker.pickDate(new Date(`${chosen}T12:00:00`));
    });
    expect(screen.getByTestId("invoice-due-picker").props.accessibilityLabel).toMatch(
      /^Due date, \d+ \S+ \d{4}$/
    );
    await fireEvent.press(screen.getByTestId("invoice-continue"));

    // 4. The notices: empty, a redirection that must be https, what it does said below it.
    expect(await screen.findByText("Finally, the administrative notes")).toBeTruthy();
    await type("invoice-terms", "Payment within 30 days net, no discount.");
    const redirectHint =
      "Once the invoice is paid, your customer can return to your website (thank-you page, order tracking…) in a single click.";
    expect(screen.queryByText(redirectHint)).toBeNull();
    await fireEvent.press(screen.getByTestId("invoice-add-redirect"));
    expect(screen.getByText(redirectHint)).toBeTruthy();
    await type("invoice-redirect", "http://fine-bakery.example");
    expect(screen.getByText("Enter an address starting with https://")).toBeTruthy();
    expect(screen.getByTestId("invoice-continue")).toBeDisabled();
    await type("invoice-redirect", "https://fine-bakery.example/thanks");
    await fireEvent.press(screen.getByTestId("invoice-continue"));

    // 5. The review: a card per step, each leading back to it; no number before the invoice is
    // created.
    expect(await screen.findByText("Check the invoice")).toBeTruthy();
    for (const [title, testID] of [
      ["Client", "invoice-review-recipient"],
      ["Items", "invoice-review-lines"],
      ["Due date", "invoice-review-due"],
      ["Administrative notes", "invoice-review-notices"]
    ]) {
      expect(within(screen.getByTestId(testID!)).getByText(title!)).toBeTruthy();
    }
    // The pen's action is a hint: a screen reader still reads what the card holds.
    const recipientCard = screen.getByTestId("invoice-review-recipient");
    expect(recipientCard.props.accessibilityHint).toBe("Edit the recipient");
    expect(recipientCard.props.accessibilityLabel).toBeUndefined();
    expect(screen.getByText("Bastion Coffee LLC")).toBeTruthy();
    expect(screen.getByText("Payment within 30 days net, no discount.")).toBeTruthy();
    expect(screen.queryByText(/\d{4}-\d{4}/)).toBeNull();
    expect(screen.queryByText(/Number/)).toBeNull();
    await fireEvent.press(screen.getByTestId("invoice-review-notices"));
    expect(await screen.findByText("Finally, the administrative notes")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("invoice-continue"));
    expect(await screen.findByText("Check the invoice")).toBeTruthy();
    // The one way to finish, beside the draft.
    expect(screen.queryByText("Send by email")).toBeNull();
    expect(screen.getByText("Create the invoice")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("invoice-create"));

    // Created: the number taken, the mail client left closed; then the four ways to pass it on.
    expect(
      await screen.findByText(/^Invoice \d{4}-0001 created$/, undefined, { timeout: 10_000 })
    ).toBeTruthy();
    expect(Linking.openURL).not.toHaveBeenCalled();
    for (const testID of [
      "invoice-sent-mail",
      "invoice-sent-copy",
      "invoice-sent-share",
      "invoice-sent-pdf"
    ]) {
      expect(screen.getByTestId(testID)).toBeTruthy();
    }
    // The mail form, the mail written and the invoice's PDF attached; once for two taps.
    const mailButton = screen.getByTestId("invoice-sent-mail");
    await act(async () => {
      void fireEvent.press(mailButton);
      void fireEvent.press(mailButton);
    });
    await waitFor(() => expect(mailComposer.mail.composed).toHaveLength(1));
    const mail = mailComposer.mail.composed[0]!;
    expect(mail.recipients).toBeUndefined();
    expect(mail.subject).toMatch(/^Invoice \d{4}-0001 · /);
    expect(mail.body).toContain("319.51 CHF");
    expect(mail.body).toContain("https://web.example/pay#");
    expect(mail.attachments).toEqual([expect.stringMatching(/\/cache\/Invoice-\d{4}-0001\.pdf$/)]);
    expect(mail.attached[0]).toContain("Bastion Coffee LLC");
    expect(Linking.openURL).not.toHaveBeenCalled();
    await act(async () => undefined);
    expect(mailComposer.mail.composed).toHaveLength(1);

    // Beside the mail and the PDF, their language: one choice for both, the app's at first.
    for (const testID of ["invoice-sent-mail-language", "invoice-sent-pdf-language"]) {
      expect(within(screen.getByTestId(testID)).getByText("EN")).toBeTruthy();
    }
    // Each named for what it is the language of.
    expect(screen.getByTestId("invoice-sent-mail-language").props.accessibilityLabel).toBe(
      "Email language: English. Change"
    );
    expect(screen.getByTestId("invoice-sent-pdf-language").props.accessibilityLabel).toBe(
      "PDF language: English. Change"
    );
    await fireEvent.press(screen.getByTestId("invoice-sent-pdf-language"));
    expect(
      within(await screen.findByTestId("invoice-sent-pdf-language-menu")).getByText("PDF language")
    ).toBeTruthy();
    await fireEvent.press(await screen.findByTestId("invoice-sent-pdf-language-it"));
    for (const testID of ["invoice-sent-mail-language", "invoice-sent-pdf-language"]) {
      expect(within(screen.getByTestId(testID)).getByText("IT")).toBeTruthy();
    }
    await fireEvent.press(screen.getByTestId("invoice-sent-mail"));
    await waitFor(() => expect(mailComposer.mail.composed).toHaveLength(2));
    const italian = mailComposer.mail.composed[1]!;
    expect(italian.subject).toMatch(/^Fattura \d{4}-0001 · /);
    expect(italian.body).toMatch(/^Buongiorno,/);
    // Italian on a Swiss phone: its amount as Switzerland writes it in Italian.
    expect(italian.body).toContain("319.51 CHF");
    expect(italian.attachments).toEqual([
      expect.stringMatching(/\/cache\/Fattura-\d{4}-0001\.pdf$/)
    ]);
    expect(italian.attached[0]).toContain('<html lang="it">');

    // Saved sent, with its link: version 4, its sale until the due date.
    const { invoices } = await act(() => loadInvoices());
    expect(invoices).toHaveLength(1);
    const [invoice] = invoices;
    expect(invoice).toMatchObject({
      status: "sent",
      dueDate: chosen,
      recipient: { name: "Bastion Coffee LLC", city: "Geneva", country: "CH" },
      terms: "Payment within 30 days net, no discount.",
      redirectUrl: "https://fine-bakery.example/thanks"
    });
    const ref = parsePaymentLinkFragment(new URL(invoice!.sent!.link.url).hash);
    const lookup = await fetchPaymentLink(ref!, "bc");
    expect(lookup).toMatchObject({
      status: "found",
      value: {
        kind: "sale",
        sale: {
          version: 4,
          fiat: { minor: 31_951, digits: 2, currency: "CHF" },
          endsAt: invoice!.dueAt,
          redirectUrl: "https://fine-bakery.example/thanks"
        }
      }
    });

    // "Close": back to "Wallet", the one it was opened from (not a second one on top).
    await fireEvent.press(screen.getByTestId("invoice-sent-close"));
    await waitFor(() => expect(router.getPathname()).toBe("/wallet"));
    expect(walletScreens(router)).toEqual(["index"]);
  });

  it('saves a draft from any step, numbered, and goes back to "Wallet"', async () => {
    const { router } = await openWallet();
    await fireEvent.press(await screen.findByTestId("wallet-new-invoice"));
    await screen.findByText("Who is the invoice for?");
    await type("invoice-recipient-name", "Lakeview Hotel");
    await fireEvent.press(screen.getByTestId("invoice-save-draft"));

    expect(await screen.findByText("Invoice saved as a draft")).toBeTruthy();
    await waitFor(() => expect(router.getPathname()).toBe("/wallet"));
    expect(walletScreens(router)).toEqual(["index"]);
    const { invoices } = await act(() => loadInvoices());
    expect(invoices).toMatchObject([
      { status: "draft", number: { sequence: 1 }, recipient: { name: "Lakeview Hotel" } }
    ]);
  });

  it('names its button "Invoice" on a phone, beside "Sell" in half the width', async () => {
    await openWallet();
    const button = await screen.findByTestId("wallet-new-invoice");
    expect(within(button).getByText("Invoice")).toBeTruthy();
    expect(within(button).queryByText("New invoice")).toBeNull();
  });

  it('names its button "New invoice" on desktop', async () => {
    mockDesktop.mockReturnValue(true);
    await openWallet();
    const button = await screen.findByTestId("wallet-new-invoice");
    expect(within(button).getByText("New invoice")).toBeTruthy();
  });

  it('opens one wizard on a double tap: the draft saved, "Wallet" shows', async () => {
    const { router } = await openWallet();
    const button = await screen.findByTestId("wallet-new-invoice");
    // Both taps before the navigation renders again (a phone busy opening the wizard: a second
    // wizard, empty, would show under the notification once the first saved its draft).
    await act(async () => {
      button.props.onClick();
      button.props.onClick();
    });
    await waitFor(() => expect(router.getPathname()).toBe("/wallet/invoice/new"));
    expect(walletScreens(router)).toEqual(["index", "invoice/new"]);
    await type("invoice-recipient-name", "Lakeview Hotel");
    await fireEvent.press(screen.getByTestId("invoice-save-draft"));
    expect(await screen.findByText("Invoice saved as a draft")).toBeTruthy();
    await waitFor(() => expect(router.getPathname()).toBe("/wallet"));
    expect(walletScreens(router)).toEqual(["index"]);
    expect(screen.queryByText("Who is the invoice for?")).toBeNull();
  });

  it("adds an article of the catalogue, read as the step shows: its name and price", async () => {
    await openWallet();
    await act(async () => {
      await catalog.addArticle(
        { name: "Cappuccino", description: "", priceMinor: 480, photo: null, barcode: null },
        0,
        await catalog.refreshCatalogEpoch()
      );
    });
    const loadCatalog = jest.spyOn(catalog, "loadCatalog");
    await fireEvent.press(await screen.findByTestId("wallet-new-invoice"));
    await screen.findByText("Who is the invoice for?");
    await fillRecipient();
    expect(loadCatalog).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId("invoice-continue"));
    // Read once the step shows, before "Add an item": listed as soon as it opens.
    await waitFor(() => expect(loadCatalog).toHaveBeenCalledTimes(1));
    await act(() => loadCatalog.mock.results[0]!.value);
    await fireEvent.press(await screen.findByTestId("invoice-add-line"));
    expect(screen.getByText("Cappuccino")).toBeTruthy();
    expect(screen.queryByText("Reading your items…")).toBeNull();
    expect(loadCatalog).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText("Cappuccino"));

    // Folded: one at its price, at the country's rate.
    await waitFor(() => expect(screen.queryByTestId("invoice-article-picker")).toBeNull());
    expect(screen.getByText("Cappuccino")).toBeTruthy();
    expect(screen.getByText(/1 × 4.80 · VAT 8.1/)).toBeTruthy();
    expect(within(screen.getByTestId("invoice-totals")).getByText("5.19 CHF")).toBeTruthy();
    expect(screen.getByTestId("invoice-continue")).toBeEnabled();

    // Picked again, its line untouched: one more on that line, no second line.
    await fireEvent.press(screen.getByTestId("invoice-add-line"));
    await fireEvent.press(
      within(screen.getByTestId("invoice-article-picker")).getByText("Cappuccino")
    );
    await waitFor(() => expect(screen.queryByTestId("invoice-article-picker")).toBeNull());
    expect(screen.getAllByText("Cappuccino")).toHaveLength(1);
    expect(screen.getByText(/2 × 4.80 · VAT 8.1/)).toBeTruthy();

    // Its price changed: the article comes on a line of its own.
    await fireEvent.press(screen.getByText("Cappuccino"));
    await type("invoice-line-price", "5");
    await fireEvent.press(screen.getByTestId("invoice-add-line"));
    await fireEvent.press(
      within(screen.getByTestId("invoice-article-picker")).getByText("Cappuccino")
    );
    await waitFor(() => expect(screen.queryByTestId("invoice-article-picker")).toBeNull());
    expect(screen.getAllByText("Cappuccino")).toHaveLength(2);
    expect(screen.getByText(/1 × 4.80 · VAT 8.1/)).toBeTruthy();
  });

  describe('"Save to my items"', () => {
    /** An article of the catalogue, added before the wizard opens (the account open). */
    async function addCatalogArticle(name: string, priceMinor: number) {
      await act(async () => {
        await catalog.addArticle(
          { name, description: "Large cup", priceMinor, photo: null, barcode: "7610000000017" },
          0,
          await catalog.refreshCatalogEpoch()
        );
      });
    }

    /** The lines' step, the catalogue read, a line typed by hand. */
    async function typedLine(name: string, price: string) {
      const loadCatalog = jest.spyOn(catalog, "loadCatalog");
      await fireEvent.press(await screen.findByTestId("wallet-new-invoice"));
      await screen.findByText("Who is the invoice for?");
      await fillRecipient();
      await fireEvent.press(screen.getByTestId("invoice-continue"));
      await waitFor(() => expect(loadCatalog).toHaveBeenCalledTimes(1));
      await act(() => loadCatalog.mock.results[0]!.value);
      await fireEvent.press(screen.getByTestId("invoice-add-line"));
      await fireEvent.press(await screen.findByTestId("invoice-picker-manual"));
      await type("invoice-line-name", name);
      // Not before the line is whole.
      expect(screen.queryByTestId("invoice-line-save")).toBeNull();
      await type("invoice-line-price", price);
    }

    async function articles() {
      return (await catalog.loadCatalog()).articles;
    }

    it("saves a line typed by hand at once, its name and price, then says so", async () => {
      await openWallet();
      await typedLine("  Chicken skewer ", "5");
      expect(screen.getByText("Save to my items")).toBeTruthy();
      await fireEvent.press(screen.getByTestId("invoice-line-save"));

      await screen.findByText("Saved to my items");
      expect(screen.queryByTestId("invoice-line-save")).toBeNull();
      expect(screen.queryByTestId("invoice-same-name")).toBeNull();
      const saved = await articles();
      expect(saved).toHaveLength(1);
      expect(saved[0]).toMatchObject({
        name: "Chicken skewer",
        description: "",
        price: { minor: 500, digits: 2, currency: "CHF" },
        image: null,
        barcode: null
      });

      // Changed after it was saved: offered again, as an article of the same name now.
      await type("invoice-line-price", "5.50");
      await fireEvent.press(screen.getByTestId("invoice-line-save"));
      expect(await screen.findByTestId("invoice-same-name")).toBeTruthy();
    });

    it("offers it under the line's fields on desktop too", async () => {
      mockDesktop.mockReturnValue(true);
      await openWallet();
      await typedLine("Chicken skewer", "5");
      await fireEvent.press(
        within(screen.getByTestId(/^invoice-line-editor-/)).getByTestId("invoice-line-save")
      );
      await screen.findByText("Saved to my items");
      expect(await articles()).toHaveLength(1);
    });

    it("offers nothing for a line picked from the catalogue, nor one the catalogue holds", async () => {
      await openWallet();
      await addCatalogArticle("Cappuccino", 480);
      await typedLine("cappuccino", "4.80");
      // The same article (its name whatever the case, its price): nothing to save.
      expect(screen.queryByTestId("invoice-line-save")).toBeNull();
      await fireEvent.press(screen.getByTestId("invoice-add-line"));
      await fireEvent.press(screen.getByTestId(/^invoice-picker-article-/));
      await waitFor(() => expect(screen.queryByTestId("invoice-article-picker")).toBeNull());
      await fireEvent.press(screen.getAllByText("Cappuccino").at(-1)!);
      await type("invoice-line-quantity", "3");
      expect(screen.queryByTestId("invoice-line-save")).toBeNull();
      // Its name typed again: a line typed by hand from then on.
      await type("invoice-line-name", "House cappuccino");
      expect(screen.getByTestId("invoice-line-save")).toBeTruthy();
    });

    it("shows the article of the same name, then updates its price, the rest kept", async () => {
      await openWallet();
      await addCatalogArticle("Cappuccino", 480);
      await typedLine("cappuccino", "5");
      await fireEvent.press(screen.getByTestId("invoice-line-save"));

      const sheet = await screen.findByTestId("invoice-same-name");
      expect(within(sheet).getByText("An item already has this name")).toBeTruthy();
      const preview = within(sheet).getByTestId("invoice-same-name-article");
      expect(within(preview).getByText("Cappuccino")).toBeTruthy();
      expect(within(preview).getByText("Large cup")).toBeTruthy();
      expect(within(preview).getByText("4.80 CHF")).toBeTruthy();
      expect(within(sheet).getByText("Line price: 5.00 CHF")).toBeTruthy();
      const [before] = await articles();

      await fireEvent.press(within(sheet).getByTestId("invoice-same-name-update"));
      await screen.findByText("Saved to my items");
      const after = await articles();
      expect(after).toHaveLength(1);
      expect(after[0]).toMatchObject({
        id: before!.id,
        name: "Cappuccino",
        description: "Large cup",
        price: { minor: 500, digits: 2, currency: "CHF" },
        barcode: "7610000000017",
        createdAt: before!.createdAt
      });
      expect(after[0]!.updatedAt).toBeGreaterThan(before!.updatedAt);
    });

    it("adds a second article of the same name when asked", async () => {
      await openWallet();
      await addCatalogArticle("Cappuccino", 480);
      await typedLine("Cappuccino", "5");
      await fireEvent.press(screen.getByTestId("invoice-line-save"));
      await fireEvent.press(await screen.findByTestId("invoice-same-name-duplicate"));

      await screen.findByText("Saved to my items");
      const saved = await articles();
      expect(saved.map(({ name, price }) => [name, price.minor]).sort()).toEqual([
        ["Cappuccino", 480],
        ["Cappuccino", 500]
      ]);
    });

    it("leaves the catalogue as it was when the sheet is closed", async () => {
      await openWallet();
      await addCatalogArticle("Cappuccino", 480);
      await typedLine("Cappuccino", "5");
      await fireEvent.press(screen.getByTestId("invoice-line-save"));
      await screen.findByTestId("invoice-same-name");
      await fireEvent.press(
        within(screen.getByTestId("invoice-same-name")).getByLabelText("Close")
      );
      await waitFor(() => expect(screen.queryByTestId("invoice-same-name")).toBeNull());
      expect(screen.getByTestId("invoice-line-save")).toBeTruthy();
      expect((await articles()).map(({ price }) => price.minor)).toEqual([480]);
    });

    it("says it failed when no majority of the relays takes the article, then saves the same one", async () => {
      await openWallet();
      await typedLine("Chicken skewer", "5");
      // Two relays of five take it: no majority, but those two hold it.
      for (const relay of DEFAULT_RELAYS.slice(2)) relays.readOnly.add(relay);
      await fireEvent.press(screen.getByTestId("invoice-line-save"));

      expect(await screen.findByText("Item not saved")).toBeTruthy();
      expect(
        screen.getByText("Too few relays answered. Check the connection, then try again")
      ).toBeTruthy();
      expect(screen.queryByText("Saved to my items")).toBeNull();
      expect(screen.getByTestId("invoice-line-save")).toBeEnabled();
      const partial = await articles();
      expect(partial).toHaveLength(1);

      // The step left and back (the wizard unmounts it): the line's next save is still that one.
      relays.readOnly.clear();
      await fireEvent.press(screen.getByTestId("invoice-continue"));
      await screen.findByText(/Payable until/);
      await fireEvent.press(screen.getByTestId("invoice-back"));
      await fireEvent.press(await screen.findByText("Chicken skewer"));
      await fireEvent.press(await screen.findByTestId("invoice-line-save"));
      await screen.findByText("Saved to my items");
      // The article some relays held, published again: never listed twice.
      const saved = await articles();
      expect(saved).toHaveLength(1);
      expect(saved[0]!.id).toBe(partial[0]!.id);
      expect(saved[0]!.updatedAt).toBeGreaterThan(partial[0]!.updatedAt);
    });

    it("shows it saving, no line added meanwhile", async () => {
      await openWallet();
      await typedLine("Chicken skewer", "5");
      const release = relays.holdPublishes();
      await fireEvent.press(screen.getByTestId("invoice-line-save"));
      // The spinner is decorative (hidden from screen readers).
      expect(
        await screen.findByTestId("invoice-line-saving", { includeHiddenElements: true })
      ).toBeTruthy();
      expect(screen.getByTestId("invoice-line-save")).toBeDisabled();

      // No other line meanwhile: the save's answer (SameNameSheet) never opens under the picker.
      expect(screen.getByTestId("invoice-add-line")).toBeDisabled();

      await act(async () => release());
      await screen.findByText("Saved to my items");
      expect(screen.getByTestId("invoice-add-line")).toBeEnabled();
      expect((await articles()).map(({ name }) => name)).toEqual(["Chicken skewer"]);
    });

    it("adds nothing unless a majority of the relays read the catalogue again", async () => {
      await openWallet();
      await typedLine("Chicken skewer", "5");
      for (const relay of DEFAULT_RELAYS.slice(2)) relays.unreachable.add(relay);
      await fireEvent.press(screen.getByTestId("invoice-line-save"));
      expect(
        await screen.findByText("Too few relays answered. Check the connection, then try again")
      ).toBeTruthy();
      expect(screen.queryByTestId("invoice-same-name")).toBeNull();
      relays.unreachable.clear();
      expect(await articles()).toEqual([]);
    });

    it("finds an article added elsewhere since the step showed", async () => {
      await openWallet();
      await typedLine("Cappuccino", "5");
      // Added on another of the owner's devices meanwhile.
      await addCatalogArticle("Cappuccino", 480);
      await fireEvent.press(screen.getByTestId("invoice-line-save"));
      expect(await screen.findByTestId("invoice-same-name")).toBeTruthy();
    });

    it("offers nothing while the catalogue is being read", async () => {
      await openWallet();
      await fireEvent.press(await screen.findByTestId("wallet-new-invoice"));
      await screen.findByText("Who is the invoice for?");
      await fillRecipient();
      const release = relays.holdQueries();
      await fireEvent.press(screen.getByTestId("invoice-continue"));
      await fireEvent.press(await screen.findByTestId("invoice-add-line"));
      await fireEvent.press(await screen.findByTestId("invoice-picker-manual"));
      await typeLine("Chicken skewer", "1", "5");
      expect(screen.queryByTestId("invoice-line-save")).toBeNull();
      await act(async () => release());
      expect(await screen.findByTestId("invoice-line-save")).toBeTruthy();
      // A name longer than an article's: never saved cut.
      await type("invoice-line-name", "x".repeat(61));
      expect(screen.queryByTestId("invoice-line-save")).toBeNull();
    });

    it("saves a line renamed after a failed update anew", async () => {
      await openWallet();
      await addCatalogArticle("Cappuccino", 480);
      await typedLine("Cappuccino", "5");
      await fireEvent.press(screen.getByTestId("invoice-line-save"));
      for (const relay of DEFAULT_RELAYS.slice(2)) relays.readOnly.add(relay);
      await fireEvent.press(await screen.findByTestId("invoice-same-name-update"));
      expect(await screen.findByText("Item not updated")).toBeTruthy();
      relays.readOnly.clear();

      await type("invoice-line-name", "Green tea");
      await type("invoice-line-price", "3");
      await fireEvent.press(screen.getByTestId("invoice-line-save"));
      await screen.findByText("Saved to my items");
      expect((await articles()).map(({ name, price }) => `${name} ${price.minor}`).sort()).toEqual([
        "Cappuccino 500",
        "Green tea 300"
      ]);
    });

    it("keeps the step and the line while the line saves", async () => {
      await openWallet();
      await typedLine("Chicken skewer", "5");
      const release = relays.holdPublishes();
      await fireEvent.press(screen.getByTestId("invoice-line-save"));
      // The step kept until the save answers (SameNameSheet may show here).
      expect(await screen.findByTestId("invoice-continue")).toBeDisabled();
      await fireEvent.press(screen.getByTestId("invoice-back"));
      expect(screen.getByText("What are you invoicing?")).toBeTruthy();
      expect(screen.getByTestId("invoice-save-draft")).toBeDisabled();
      // Still saving: not pressable a second time, the line as it is saved.
      expect(await screen.findByTestId("invoice-line-save")).toBeDisabled();
      expect(screen.getByTestId("invoice-line-name")).toBeDisabled();
      expect(screen.getByTestId("invoice-line-remove")).toBeDisabled();
      expect(
        screen.getByTestId("invoice-line-saving", { includeHiddenElements: true })
      ).toBeTruthy();
      await act(async () => release());
      await screen.findByText("Saved to my items");
      expect(await articles()).toHaveLength(1);
    });

    it("takes an identical article added elsewhere meanwhile for the line's", async () => {
      await openWallet();
      await typedLine("Cappuccino", "4.80");
      await addCatalogArticle("Cappuccino", 480);
      await fireEvent.press(screen.getByTestId("invoice-line-save"));
      await screen.findByText("Saved to my items");
      expect(screen.queryByTestId("invoice-same-name")).toBeNull();
      expect(await articles()).toHaveLength(1);
    });

    it("adds the line anew when the article a failed update changed was removed since", async () => {
      await openWallet();
      await addCatalogArticle("Cappuccino", 480);
      await typedLine("Cappuccino", "5");
      await fireEvent.press(screen.getByTestId("invoice-line-save"));
      // No relay takes the change: nothing of it is anywhere.
      for (const relay of DEFAULT_RELAYS) relays.readOnly.add(relay);
      await fireEvent.press(await screen.findByTestId("invoice-same-name-update"));
      expect(await screen.findByText("Item not updated")).toBeTruthy();
      relays.readOnly.clear();
      const [removed] = await articles();
      await act(async () => {
        await catalog.removeArticle(removed!);
      });

      await fireEvent.press(screen.getByTestId("invoice-line-save"));
      await screen.findByText("Saved to my items");
      const saved = await articles();
      expect(saved).toHaveLength(1);
      expect(saved[0]!.id).not.toBe(removed!.id);
      expect(saved[0]).toMatchObject({ name: "Cappuccino", description: "", barcode: null });
    });

    it("never retries a failed update on an article renamed elsewhere since", async () => {
      await openWallet();
      await addCatalogArticle("Cappuccino", 480);
      await typedLine("Cappuccino", "5");
      await fireEvent.press(screen.getByTestId("invoice-line-save"));
      for (const relay of DEFAULT_RELAYS) relays.readOnly.add(relay);
      await fireEvent.press(await screen.findByTestId("invoice-same-name-update"));
      expect(await screen.findByText("Item not updated")).toBeTruthy();
      relays.readOnly.clear();
      const [renamed] = await articles();
      await act(async () => {
        await catalog.updateArticle(
          renamed!,
          { name: "Espresso", description: "", priceMinor: 480, photo: null, barcode: null },
          await catalog.refreshCatalogEpoch()
        );
      });

      await fireEvent.press(screen.getByTestId("invoice-line-save"));
      await screen.findByText("Saved to my items");
      expect((await articles()).map(({ name, price }) => `${name} ${price.minor}`).sort()).toEqual([
        "Cappuccino 500",
        "Espresso 480"
      ]);
    });

    it("says a line is saved only while the catalogue holds it at its price", async () => {
      await openWallet();
      await typedLine("Cappuccino", "3");
      await fireEvent.press(screen.getByTestId("invoice-line-save"));
      await screen.findByText("Saved to my items");
      // Another line updates that article's price.
      await fireEvent.press(screen.getByTestId("invoice-add-line"));
      await fireEvent.press(await screen.findByTestId("invoice-picker-manual"));
      await typeLine("Cappuccino", "1", "4.50");
      await fireEvent.press(screen.getByTestId("invoice-line-save"));
      await fireEvent.press(await screen.findByTestId("invoice-same-name-update"));
      await screen.findByText("Saved to my items");
      await fireEvent.press(screen.getAllByText("Cappuccino")[0]!);
      expect(screen.queryByText("Saved to my items")).toBeNull();
      expect(screen.getByTestId("invoice-line-save")).toBeTruthy();
    });

    it("no longer says saved once a read of the majority misses the article", async () => {
      await openWallet();
      await typedLine("Cappuccino", "3");
      await fireEvent.press(screen.getByTestId("invoice-line-save"));
      await screen.findByText("Saved to my items");
      const [saved] = await articles();
      await act(async () => {
        await catalog.removeArticle(saved!);
      });
      await fireEvent.press(screen.getByTestId("invoice-add-line"));
      await fireEvent.press(await screen.findByTestId("invoice-picker-manual"));
      await typeLine("Green tea", "1", "4");
      await fireEvent.press(screen.getByTestId("invoice-line-save"));
      await screen.findByText("Saved to my items");
      await fireEvent.press(screen.getByText("Cappuccino"));
      expect(screen.queryByText("Saved to my items")).toBeNull();
      expect(screen.getByTestId("invoice-line-save")).toBeTruthy();
    });

    it("offers it when the step's read failed: the press reads again", async () => {
      await openWallet();
      await fireEvent.press(await screen.findByTestId("wallet-new-invoice"));
      await screen.findByText("Who is the invoice for?");
      await fillRecipient();
      for (const relay of DEFAULT_RELAYS) relays.unreachable.add(relay);
      await fireEvent.press(screen.getByTestId("invoice-continue"));
      await fireEvent.press(await screen.findByTestId("invoice-add-line"));
      expect(await screen.findByText(/Your items could not be read/)).toBeTruthy();
      await fireEvent.press(screen.getByTestId("invoice-picker-manual"));
      await typeLine("Chicken skewer", "1", "5");
      relays.unreachable.clear();
      await fireEvent.press(await screen.findByTestId("invoice-line-save"));
      await screen.findByText("Saved to my items");
      expect(await articles()).toHaveLength(1);
    });

    it("updates the article as it is when chosen, a change made meanwhile kept", async () => {
      await openWallet();
      await addCatalogArticle("Cappuccino", 480);
      await typedLine("Cappuccino", "5");
      await fireEvent.press(screen.getByTestId("invoice-line-save"));
      await screen.findByTestId("invoice-same-name");
      // Changed on another device while the sheet shows.
      const [shown] = await articles();
      await act(async () => {
        await catalog.updateArticle(
          shown!,
          {
            name: "Cappuccino",
            description: "XL cup",
            priceMinor: 480,
            photo: null,
            barcode: null
          },
          await catalog.refreshCatalogEpoch()
        );
      });
      await fireEvent.press(screen.getByTestId("invoice-same-name-update"));
      await screen.findByText("Saved to my items");
      const [after] = await articles();
      expect(after).toMatchObject({
        id: shown!.id,
        description: "XL cup",
        barcode: null,
        price: { minor: 500, currency: "CHF" }
      });
    });

    it("never writes over a failed save's article another device changed since", async () => {
      await openWallet();
      await typedLine("Coffee", "5");
      for (const relay of DEFAULT_RELAYS.slice(2)) relays.readOnly.add(relay);
      await fireEvent.press(screen.getByTestId("invoice-line-save"));
      expect(await screen.findByText("Item not saved")).toBeTruthy();
      relays.readOnly.clear();
      const [partial] = await articles();
      await act(async () => {
        await catalog.updateArticle(
          partial!,
          { name: "Espresso", description: "Strong", priceMinor: 450, photo: null, barcode: null },
          await catalog.refreshCatalogEpoch()
        );
      });

      await fireEvent.press(screen.getByTestId("invoice-line-save"));
      await screen.findByText("Saved to my items");
      const saved = await articles();
      expect(saved.map(({ name, price }) => `${name} ${price.minor}`).sort()).toEqual([
        "Coffee 500",
        "Espresso 450"
      ]);
      expect(saved.find(({ name }) => name === "Espresso")!.id).toBe(partial!.id);
    });

    it("takes an identical article added elsewhere after a failed add", async () => {
      await openWallet();
      await typedLine("Coffee", "5");
      for (const relay of DEFAULT_RELAYS.slice(2)) relays.readOnly.add(relay);
      await fireEvent.press(screen.getByTestId("invoice-line-save"));
      expect(await screen.findByText("Item not saved")).toBeTruthy();
      relays.readOnly.clear();
      // The same article, added on another device meanwhile.
      await addCatalogArticle("Coffee", 500);

      await fireEvent.press(screen.getByTestId("invoice-line-save"));
      await screen.findByText("Saved to my items");
      expect(screen.queryByTestId("invoice-same-name")).toBeNull();
    });

    it("asks about an article of the same name added after a failed add", async () => {
      await openWallet();
      await typedLine("Coffee", "5");
      for (const relay of DEFAULT_RELAYS) relays.readOnly.add(relay);
      await fireEvent.press(screen.getByTestId("invoice-line-save"));
      expect(await screen.findByText("Item not saved")).toBeTruthy();
      relays.readOnly.clear();
      await addCatalogArticle("Coffee", 450);

      await fireEvent.press(screen.getByTestId("invoice-line-save"));
      const sheet = await screen.findByTestId("invoice-same-name");
      expect(within(sheet).getByText("4.50 CHF")).toBeTruthy();
    });

    it("saves a failed duplicate again as the same article", async () => {
      await openWallet();
      await addCatalogArticle("Coffee", 450);
      await typedLine("Coffee", "5");
      await fireEvent.press(screen.getByTestId("invoice-line-save"));
      for (const relay of DEFAULT_RELAYS.slice(2)) relays.readOnly.add(relay);
      await fireEvent.press(await screen.findByTestId("invoice-same-name-duplicate"));
      expect(await screen.findByText("Item not saved")).toBeTruthy();
      relays.readOnly.clear();

      await fireEvent.press(screen.getByTestId("invoice-line-save"));
      await screen.findByText("Saved to my items");
      await waitFor(() => expect(screen.queryByTestId("invoice-same-name")).toBeNull());
      expect((await articles()).map(({ price }) => price.minor).sort()).toEqual([450, 500]);
    });

    it("gives a failed add's article the line's new price", async () => {
      await openWallet();
      await typedLine("Coffee", "5");
      for (const relay of DEFAULT_RELAYS.slice(2)) relays.readOnly.add(relay);
      await fireEvent.press(screen.getByTestId("invoice-line-save"));
      expect(await screen.findByText("Item not saved")).toBeTruthy();
      relays.readOnly.clear();
      const [partial] = await articles();

      await type("invoice-line-price", "5.50");
      await fireEvent.press(screen.getByTestId("invoice-line-save"));
      await screen.findByText("Saved to my items");
      expect(await articles()).toMatchObject([{ id: partial!.id, price: { minor: 550 } }]);
    });

    it("removes a failed duplicate once its line ends on the article it doubled", async () => {
      await openWallet();
      await addCatalogArticle("Coffee", 450);
      await typedLine("Coffee", "6");
      await fireEvent.press(screen.getByTestId("invoice-line-save"));
      for (const relay of DEFAULT_RELAYS.slice(2)) relays.readOnly.add(relay);
      await fireEvent.press(await screen.findByTestId("invoice-same-name-duplicate"));
      expect(await screen.findByText("Item not saved")).toBeTruthy();
      relays.readOnly.clear();
      expect(await articles()).toHaveLength(2);

      await type("invoice-line-price", "4.50");
      await fireEvent.press(screen.getByTestId("invoice-line-save"));
      await screen.findByText("Saved to my items");
      expect((await articles()).map(({ price }) => price.minor)).toEqual([450]);
    });

    it("removes a failed add once its line is renamed after an article that exists", async () => {
      await openWallet();
      await addCatalogArticle("Tea", 400);
      await typedLine("Coffee", "5");
      for (const relay of DEFAULT_RELAYS.slice(2)) relays.readOnly.add(relay);
      await fireEvent.press(screen.getByTestId("invoice-line-save"));
      expect(await screen.findByText("Item not saved")).toBeTruthy();
      relays.readOnly.clear();

      await type("invoice-line-name", "Tea");
      await type("invoice-line-price", "4");
      await fireEvent.press(screen.getByTestId("invoice-line-save"));
      await screen.findByText("Saved to my items");
      expect((await articles()).map(({ name }) => name)).toEqual(["Tea"]);
    });

    it("keeps a failed add it could not remove, the line not saved until it is", async () => {
      await openWallet();
      await addCatalogArticle("Tea", 400);
      await typedLine("Coffee", "5");
      for (const relay of DEFAULT_RELAYS.slice(2)) relays.readOnly.add(relay);
      await fireEvent.press(screen.getByTestId("invoice-line-save"));
      expect(await screen.findByText("Item not saved")).toBeTruthy();

      // Renamed after "Tea": its failed add must go first, and still cannot.
      await type("invoice-line-name", "Tea");
      await type("invoice-line-price", "4");
      await fireEvent.press(screen.getByTestId("invoice-line-save"));
      await waitFor(() => expect(screen.getByTestId("invoice-line-save")).toBeEnabled());
      expect(screen.queryByText("Saved to my items")).toBeNull();

      relays.readOnly.clear();
      await fireEvent.press(screen.getByTestId("invoice-line-save"));
      await screen.findByText("Saved to my items");
      expect((await articles()).map(({ name }) => name)).toEqual(["Tea"]);
    });

    it("takes the article another line saved for a line whose add failed", async () => {
      await openWallet();
      await typedLine("Coffee", "5");
      for (const relay of DEFAULT_RELAYS) relays.readOnly.add(relay);
      await fireEvent.press(screen.getByTestId("invoice-line-save"));
      expect(await screen.findByText("Item not saved")).toBeTruthy();
      relays.readOnly.clear();

      await fireEvent.press(screen.getByTestId("invoice-add-line"));
      await fireEvent.press(await screen.findByTestId("invoice-picker-manual"));
      await typeLine("Coffee", "1", "5");
      await fireEvent.press(screen.getByTestId("invoice-line-save"));
      await screen.findByText("Saved to my items");

      await fireEvent.press(screen.getAllByText("Coffee")[0]!);
      await fireEvent.press(await screen.findByTestId("invoice-line-save"));
      await screen.findByText("Saved to my items");
      expect(await articles()).toHaveLength(1);
    });

    it("never takes a failed update's article back at its old price for saved", async () => {
      await openWallet();
      await addCatalogArticle("Cappuccino", 480);
      await typedLine("Cappuccino", "5");
      await fireEvent.press(screen.getByTestId("invoice-line-save"));
      for (const relay of DEFAULT_RELAYS.slice(2)) relays.readOnly.add(relay);
      await fireEvent.press(await screen.findByTestId("invoice-same-name-update"));
      expect(await screen.findByText("Item not updated")).toBeTruthy();
      relays.readOnly.clear();

      // Back at the article's former price: the relays that took the change list 5.00.
      await type("invoice-line-price", "4.80");
      await fireEvent.press(screen.getByTestId("invoice-line-save"));
      const sheet = await screen.findByTestId("invoice-same-name");
      expect(within(sheet).getByText("5.00 CHF")).toBeTruthy();
      await fireEvent.press(within(sheet).getByTestId("invoice-same-name-update"));
      await screen.findByText("Saved to my items");
      expect((await articles()).map(({ price }) => price.minor)).toEqual([480]);
    });

    it("removes a failed add's article with its line", async () => {
      await openWallet();
      await typedLine("Coffee", "5");
      for (const relay of DEFAULT_RELAYS.slice(2)) relays.readOnly.add(relay);
      await fireEvent.press(screen.getByTestId("invoice-line-save"));
      expect(await screen.findByText("Item not saved")).toBeTruthy();
      relays.readOnly.clear();
      expect(await articles()).toHaveLength(1);

      const removeArticle = jest.spyOn(catalog, "removeArticle");
      removeArticle.mockClear();
      await fireEvent.press(screen.getByTestId("invoice-line-remove"));
      expect(screen.queryByTestId("invoice-line-name")).toBeNull();
      await waitFor(() => expect(removeArticle).toHaveBeenCalledTimes(1));
      await act(() => removeArticle.mock.results[0]!.value);
      expect(await articles()).toEqual([]);
    });

    it("says the catalogue is full", async () => {
      await openWallet();
      await typedLine("Chicken skewer", "5");
      jest
        .spyOn(catalog, "addArticle")
        .mockRejectedValueOnce(new catalog.CatalogError("tooMany", "Too many articles"));
      await fireEvent.press(screen.getByTestId("invoice-line-save"));
      expect(await screen.findByText("The catalogue is full: 500 items at most")).toBeTruthy();
      expect(screen.getByTestId("invoice-line-save")).toBeEnabled();
    });

    it("never updates an article of another currency: a duplicate only", async () => {
      await openWallet();
      await act(async () => {
        await catalog.addArticle(
          { name: "Cappuccino", description: "", priceMinor: 450, photo: null, barcode: null },
          0,
          await catalog.refreshCatalogEpoch(),
          { typedIn: { currency: "EUR" } }
        );
      });
      await typedLine("Cappuccino", "5");
      await fireEvent.press(screen.getByTestId("invoice-line-save"));

      const sheet = await screen.findByTestId("invoice-same-name");
      expect(within(sheet).getByText("4.50 EUR")).toBeTruthy();
      expect(
        within(sheet).getByText(
          "This item is sold in EUR: its price cannot take an amount in CHF. Create a second item with the same name."
        )
      ).toBeTruthy();
      expect(within(sheet).queryByTestId("invoice-same-name-update")).toBeNull();
      await fireEvent.press(within(sheet).getByTestId("invoice-same-name-duplicate"));
      await screen.findByText("Saved to my items");
      expect(
        (await articles()).map(({ price }) => `${price.minor} ${price.currency}`).sort()
      ).toEqual(["450 EUR", "500 CHF"]);
    });
  });

  it("shows the PDF's first page beside the form on desktop", async () => {
    mockDesktop.mockReturnValue(true);
    await openWallet();
    await fireEvent.press(await screen.findByTestId("wallet-new-invoice"));
    await screen.findByText("Who is the invoice for?");
    // A picture of the page, out of screen readers' reach (the fields say it all).
    const preview = screen.getByTestId("invoice-pdf-preview", { includeHiddenElements: true });
    expect(within(preview).getByText("PDF preview", { includeHiddenElements: true })).toBeTruthy();
    // Laid out as the PDF: the recipient under "Billed to".
    expect(within(preview).getByText("Billed to", { includeHiddenElements: true })).toBeTruthy();
    await type("invoice-recipient-name", "Bastion Coffee LLC");
    expect(
      within(preview).getByText("Bastion Coffee LLC", { includeHiddenElements: true })
    ).toBeTruthy();
    // No number on the page before the invoice is created.
    expect(within(preview).queryByText("—", { includeHiddenElements: true })).toBeNull();
    // The draft's action in the header, the side bar beside it.
    expect(screen.getByText("Save as draft")).toBeTruthy();
    expect(screen.getByTestId("sidebar-wallet")).toBeTruthy();
  });

  describe("on a phone", () => {
    /** An iPhone's home indicator. */
    const HOME_INDICATOR = 34;
    const insets = jest.mocked(useSafeAreaInsets);
    const original = insets.getMockImplementation();
    /** The tests' fetch as jest.setup.ts gives it. */
    const defaultFetch = jest.mocked(globalThis.fetch).getMockImplementation()!;

    beforeEach(() => {
      insets.mockReturnValue({ top: 47, right: 0, bottom: HOME_INDICATOR, left: 0 });
    });

    afterEach(() => {
      insets.mockImplementation(original);
      jest.mocked(globalThis.fetch).mockImplementation(defaultFetch);
    });

    /** The shell's band below the screens eases in as the dock leaves (dock-area.tsx). */
    async function settle() {
      await act(async () => {
        jest.advanceTimersByTime(motion.navDock * 2);
      });
    }

    /*
     * The dock hidden over the wizard, the shell keeps the bottom safe area below it (ShellMain):
     * the action stands its own margin above it, the safe area counted once.
     */
    it("keeps the wizard's action on the bottom safe area, counted once", async () => {
      const { router } = await openWallet();
      await fireEvent.press(await screen.findByTestId("wallet-new-invoice"));
      await waitFor(() => expect(router.getPathname()).toBe("/wallet/invoice/new"));
      await screen.findByText("Who is the invoice for?");
      await settle();
      expect(bottomInsetOf(screen.getByTestId("invoice-continue"))).toBe(HOME_INDICATOR + space[5]);
    });

    it("keeps the actions of the invoice created on the bottom safe area, counted once", async () => {
      // Without an on-chain address (the pool may be empty), checked against the Lightning
      // address's bounds at the present point: breez.tips and CoinGecko answer.
      const hour = Math.floor(Date.now() / 1000 / 3600) * 3600;
      for (let at = hour - 3 * 3600; at <= hour + 3 * 3600; at += 3600) {
        setCoingeckoPrice("CHF", at, 50_000);
      }
      resetPayRequests();
      resetBreezTips();
      lightningAddresses.set("sattleme02c6047f94", "Fine Bakery");
      jest
        .mocked(globalThis.fetch)
        .mockImplementation((input, init) =>
          new URL(String(input)).host === "breez.tips"
            ? breezTipsFetch(input)
            : defaultFetch(input, init)
        );
      await openWallet();
      // A draft ready to create: the five steps are already filled.
      const draft = await act(() =>
        saveDraft(
          {
            recipient: {
              name: "Bastion Coffee LLC",
              street: "12 Golden Cross Street",
              postalCode: "1204",
              city: "Geneva",
              country: "CH",
              reference: ""
            },
            currency: { code: "CHF", digits: 2 },
            lines: [{ name: "Delivery fee", quantity: 100, unitMinor: 4500, vatRate: 810 }],
            dueDate: defaultDueDate(),
            terms: "",
            legal: "",
            redirectUrl: null
          },
          null,
          []
        )
      );
      await act(() => refreshInvoices());
      await act(() =>
        appRouter.push({ pathname: "/wallet/invoice/new", params: { draft: draft.id } })
      );
      expect(await screen.findByDisplayValue("Bastion Coffee LLC")).toBeTruthy();
      for (let step = 0; step < 4; step++) {
        await fireEvent.press(screen.getByTestId("invoice-continue"));
      }
      expect(await screen.findByText("Check the invoice")).toBeTruthy();
      await fireEvent.press(screen.getByTestId("invoice-create"));
      await screen.findByTestId("invoice-sent", undefined, { timeout: 10_000 });
      await settle();
      expect(bottomInsetOf(screen.getByTestId("invoice-sent-view"))).toBe(
        HOME_INDICATOR + space[5]
      );
    });
  });
});
