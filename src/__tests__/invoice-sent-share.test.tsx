import "@/i18n";

import { fireEvent, render, screen } from "@testing-library/react-native";

import { NotificationsProvider } from "@/features/notifications/NotificationsProvider";
import { SentScreen } from "@/features/invoices/SentScreen";
import type { Invoice } from "@/lib/invoice/record";
import { canShareUrl } from "@/lib/payment-link/device.web";

/*
 * "Share" on the invoice created, in the web app: a browser without a
 * share sheet (Firefox on desktop) would only copy the link, as "Copy the link"
 * does beside it, so the screen leaves it out. The apps always show it (invoice-flow.test.tsx).
 */

// The web app's: the browser's share sheet (Web Share API), else the clipboard.
jest.mock("@/lib/payment-link/device", () => jest.requireActual("@/lib/payment-link/device.web"));

const URL = "https://web.example/pay#x";

const invoice: Invoice = {
  version: 1,
  id: "0123456789abcdef0123456789abcdef",
  number: { year: 2026, sequence: 42 },
  status: "sent",
  recipient: {
    name: "Bastion Coffee LLC",
    street: "12 Gold Cross Street",
    postalCode: "1204",
    city: "Geneva",
    country: "CH",
    reference: ""
  },
  currency: { code: "CHF", digits: 2 },
  lines: [{ name: "Sourdough bread 800 g", quantity: 2400, unitMinor: 650, vatRate: 260 }],
  dueDate: "2026-11-08",
  dueAt: Date.UTC(2026, 10, 8, 23, 0, 0) / 1000,
  terms: "",
  legal: "",
  redirectUrl: null,
  createdAt: 1790000000,
  updatedAt: 1790000000,
  sent: {
    at: 1790000000,
    link: { id: "ab".repeat(32), key: "cd".repeat(32), relays: [], url: URL }
  }
};

const navigatorBefore = Object.getOwnPropertyDescriptor(globalThis, "navigator");

function browser(value: Record<string, unknown> | undefined) {
  Object.defineProperty(globalThis, "navigator", { value, configurable: true });
}

afterEach(() => {
  if (navigatorBefore) Object.defineProperty(globalThis, "navigator", navigatorBefore);
  else delete (globalThis as { navigator?: unknown }).navigator;
});

describe("canShareUrl in a browser", () => {
  it("is false without the Web Share API, or without a page", () => {
    browser({ clipboard: { writeText: jest.fn() } });
    expect(canShareUrl(URL)).toBe(false);
    browser(undefined);
    expect(canShareUrl(URL)).toBe(false);
  });

  it("asks canShare about the link when the browser has it", () => {
    const canShare = jest.fn(() => true);
    browser({ share: jest.fn(), canShare });
    expect(canShareUrl(URL)).toBe(true);
    expect(canShare).toHaveBeenCalledWith({ url: URL });

    browser({ share: jest.fn(), canShare: () => false });
    expect(canShareUrl(URL)).toBe(false);
    browser({
      share: jest.fn(),
      canShare: () => {
        throw new TypeError("Illegal invocation");
      }
    });
    expect(canShareUrl(URL)).toBe(false);
  });

  it("is true with share alone, in a browser older than canShare", () => {
    browser({ share: jest.fn() });
    expect(canShareUrl(URL)).toBe(true);
  });
});

describe("the invoice created, in the web app", () => {
  const renderSent = () =>
    render(
      <NotificationsProvider>
        <SentScreen
          invoice={invoice}
          businessName="Fine Bakery"
          onClose={jest.fn()}
          onNew={jest.fn()}
          onView={jest.fn()}
        />
      </NotificationsProvider>
    );

  it('leaves "Share" out where the browser has no share sheet: "Copy the link" stays', async () => {
    browser({ clipboard: { writeText: jest.fn(async () => undefined) } });
    await renderSent();
    expect(screen.getByTestId("invoice-sent-copy")).toBeTruthy();
    expect(screen.queryByTestId("invoice-sent-share")).toBeNull();
    expect(screen.queryByText("Share")).toBeNull();
    expect(screen.getByTestId("invoice-sent-mail")).toBeTruthy();
    expect(screen.getByTestId("invoice-sent-pdf")).toBeTruthy();
  });

  it('shows "Share" where it opens the share sheet of the browser, with the payment link', async () => {
    const share = jest.fn(async () => undefined);
    browser({ share, canShare: () => true, clipboard: { writeText: jest.fn() } });
    await renderSent();
    expect(screen.getByTestId("invoice-sent-copy")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("invoice-sent-share"));
    expect(share).toHaveBeenCalledWith({ url: URL });
  });
});
