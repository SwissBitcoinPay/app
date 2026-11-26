import { Platform } from "react-native";

import i18n from "@/i18n";
import { INVOICE_MARGINS, invoiceFileName, invoiceHtml } from "@/features/invoices/invoice-html";
import { sharePdf, writePdf } from "@/features/invoices/pdf";
import { A4_POINTS, marginsInPoints, withPage } from "@/features/invoices/pdf-page";
import { fontFace } from "@/features/wallet/export/report-font-face";
import type { Invoice } from "@/lib/invoice/record";
import type { BusinessDetails } from "@/features/invoices/business-details";
import type { BusinessAddress } from "@/lib/settings/merchant";
import type { Language } from "@/i18n/languages";

import type * as PrintFake from "../../jest/expo-print";

/*
 * An invoice's PDF and the page of the app's PDFs: A4,
 * its margins set once, by iOS's option or by the HTML's `@page` rule.
 */

const print = jest.requireMock<typeof PrintFake>("expo-print");
const t = i18n.t.bind(i18n);

const LINK = "https://web.example/pay#author.key.relays";

function invoice(patch: Partial<Invoice> = {}): Invoice {
  return {
    version: 1,
    id: "0123456789abcdef0123456789abcdef",
    number: { year: 2026, sequence: 42 },
    status: "sent",
    recipient: {
      name: "Bastion Coffee LLC",
      street: "12 Golden Cross Street",
      postalCode: "1204",
      city: "Geneva",
      country: "CH",
      reference: "Order 118"
    },
    currency: { code: "CHF", digits: 2 },
    lines: [
      { name: "Sourdough bread 800 g", quantity: 2400, unitMinor: 650, vatRate: 260 },
      { name: "Butter croissants", quantity: 6000, unitMinor: 180, vatRate: 260 },
      { name: "Delivery fee", quantity: 100, unitMinor: 4500, vatRate: 810 }
    ],
    dueDate: "2026-11-14",
    dueAt: 1794700799,
    terms: "Payment within 30 days net, no discount.",
    legal: "UID CHE-123.456.789 MWST\n4 Market Street, 1204 Geneva",
    redirectUrl: null,
    createdAt: 1793318400,
    updatedAt: 1793318400,
    sent: {
      at: 1793318400,
      link: { id: "a".repeat(64), key: "b".repeat(64), relays: [], url: LINK }
    },
    ...patch
  };
}

/** The business's details, none typed, in Switzerland. */
const NO_DETAILS: BusinessDetails = {
  businessAddress: null,
  companyNumber: "",
  vatNumber: "",
  detectedCountry: "CH"
};

function html(
  value: Invoice = invoice(),
  fontFaces?: string,
  businessAddress: BusinessAddress | null = null,
  details: Partial<BusinessDetails> = {},
  locale: { language: Language; languageTag: string } = { language: "en", languageTag: "en-CH" }
): string {
  return invoiceHtml(value, {
    businessName: "Fine Bakery",
    ...locale,
    t,
    business: { ...NO_DETAILS, businessAddress, ...details },
    fontFaces
  });
}

/** The document's body, without its head (its title and its CSS). */
function body(document: string): string {
  return document.slice(document.indexOf("<body>"));
}

describe("invoiceHtml", () => {
  it("lays out the business, the recipient, the invoice, its lines, its notices, then the payment", () => {
    const page = body(html());
    const order = [
      "Fine Bakery",
      "Billed to",
      "Bastion Coffee LLC",
      "Invoice <span>2026-0042</span>",
      "30.10.2026",
      "14.11.2026",
      "Order 118",
      "Sourdough bread 800 g",
      "319.51 CHF",
      "Payment terms",
      "Legal notices",
      "Pay in bitcoin"
    ].map((part) => page.indexOf(part));
    expect(order).not.toContain(-1);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("writes the business's address under its name, once a line of it is typed", () => {
    const address = {
      street: "4 Market Street",
      postalCode: "1204",
      city: "Geneva",
      country: "CH"
    };
    const page = body(html(invoice(), undefined, address));
    expect(page).toContain(
      '<div class="business">Fine Bakery</div><p class="from">4 Market Street<br>1204 Geneva<br>Switzerland</p>'
    );
    // Beside the recipient's, before it.
    expect(page.indexOf("4 Market Street")).toBeLessThan(page.indexOf("Billed to"));
    // Lines not typed are left out.
    expect(body(html(invoice(), undefined, { ...address, street: "", country: null }))).toContain(
      '<p class="from">1204 Geneva</p>'
    );
    // None, or a country alone: no address.
    for (const none of [null, { street: "", postalCode: "", city: "", country: "CH" }]) {
      const without = body(html(invoice(), undefined, none));
      expect(without).not.toContain('class="from"');
      expect(without).toContain('<div class="business">Fine Bakery</div></header>');
    }
    // Escaped as everything typed.
    expect(
      body(html(invoice(), undefined, { ...address, street: "<b>Street</b> & Co" }))
    ).toContain("&lt;b&gt;Street&lt;/b&gt; &amp; Co");
  });

  it("writes the business's numbers under its address, named as its country names them", () => {
    const address = {
      street: "4 Market Street",
      postalCode: "1204",
      city: "Geneva",
      country: "CH"
    };
    const number = (label: string, value: string) =>
      `<div class="number"><span class="label">${label}</span>${value}</div>`;
    // Each under its name in small capitals, after the address.
    const swiss = { companyNumber: "CHE-123.456.789", vatNumber: "" };
    expect(body(html(invoice(), undefined, address, swiss))).toContain(
      `<p class="from">4 Market Street<br>1204 Geneva<br>Switzerland</p><div class="numbers">${number("UID number", "CHE-123.456.789")}</div>`
    );
    // In Switzerland, the VAT number alone when it repeats the UID.
    expect(
      body(html(invoice(), undefined, address, { ...swiss, vatNumber: "CHE-123.456.789 MWST" }))
    ).toContain(`<div class="numbers">${number("VAT number", "CHE-123.456.789 MWST")}</div>`);
    // In France: the SIRET and the intra-EU VAT number; without an address, the country detected.
    const french = { companyNumber: "123 456 789 00012", vatNumber: "FR12123456789" };
    expect(body(html(invoice(), undefined, null, { ...french, detectedCountry: "FR" }))).toContain(
      `</div><div class="numbers">${number("SIRET number", "123 456 789 00012")}${number("VAT identification number", "FR12123456789")}</div></header>`
    );
    // None typed: no block.
    expect(body(html(invoice(), undefined, address))).not.toContain('class="numbers"');
    // Escaped as everything typed.
    expect(body(html(invoice(), undefined, null, { companyNumber: "<i>1</i>" }))).toContain(
      "&lt;i&gt;1&lt;/i&gt;"
    );
  });

  it("names the business once: never again over the recipient's address", () => {
    expect(body(html()).split("Fine Bakery")).toHaveLength(2);
  });

  it("draws everything in Plus Jakarta Sans when its faces are given, figures included", () => {
    const fontFaces = fontFace(500, "data:font/ttf;base64,AAAA");
    const document = html(invoice(), fontFaces);
    expect(document).toContain(fontFaces);
    expect(document).toContain('font-family: "Plus Jakarta Sans"');
    expect(document).toContain("font-variant-numeric: tabular-nums");
    // No monospace font for the dates and amounts.
    expect(document).not.toMatch(/monospace|SFMono|Menlo|Consolas/);
  });

  it("writes every amount in pure black, as the rest of the text, none dimmed", () => {
    const document = html();
    expect(document).toContain("color: #000;");
    // Not the brand's ink.
    expect(document).not.toMatch(/#0B1A33|11, 26, 51/i);
    const page = body(document);
    expect(page).not.toContain("muted");
    expect(page).toContain('<td class="num">2.6%</td>');
    expect(page).toContain('<td class="num">309.00</td>');
    expect(page).toContain('<td class="num">6.86</td>');
  });

  it("writes the narrow no-break space of fr-FR amounts as a no-break space, which the font has", () => {
    const page = body(
      html(
        invoice({ lines: [{ name: "Catering", quantity: 100, unitMinor: 123450, vatRate: 0 }] }),
        undefined,
        null,
        {},
        { language: "fr", languageTag: "fr-FR" }
      )
    );
    expect(page).toContain("1 234,50 CHF");
    expect(page).not.toContain(" ");
  });

  it("shows the payment link's QR code at 50 mm, the Bitcoin logo after its title, no due date again", () => {
    const document = html();
    expect(document).toContain("width: 50mm; height: 50mm");
    const pay = body(document).slice(body(document).indexOf('<section class="pay">'));
    expect(pay).toContain("<svg");
    // The real logo, on the right of "Pay in bitcoin".
    expect(pay).toMatch(/<h2>Pay in bitcoin<svg class="btc"[^>]*>.*fill="#f7931a".*<\/svg><\/h2>/);
    expect(pay).toContain("Scan the QR code, or open the link.");
    expect(pay).not.toContain("November");
  });

  it("links the payment link's text to it, an https link only", () => {
    expect(body(html())).toContain(`<p class="link"><a href="${LINK}">${LINK}</a></p>`);
    const sent = invoice().sent!;
    const odd = body(
      html(invoice({ sent: { ...sent, link: { ...sent.link, url: "javascript:alert(1)" } } }))
    );
    expect(odd).not.toContain("<a ");
    expect(odd).toContain('<p class="link">javascript:alert(1)</p>');
  });

  it("titles the notices typed, and only those", () => {
    const termsOnly = body(html(invoice({ legal: "  " })));
    expect(termsOnly).toContain("<h3>Payment terms</h3>");
    expect(termsOnly).not.toContain("Legal notices");

    const legalOnly = body(html(invoice({ terms: "" })));
    expect(legalOnly).not.toContain("Payment terms");
    expect(legalOnly).toContain("<h3>Legal notices</h3>");
    expect(legalOnly).toContain("UID CHE-123.456.789 MWST<br>4 Market Street, 1204 Geneva");

    const none = body(html(invoice({ terms: "", legal: "" })));
    expect(none).not.toContain('class="notices"');
  });

  it("writes each date under its label, without a rule: only the lines' head has one", () => {
    expect(body(html())).toContain(
      '<div class="facts"><div><span class="label">Date</span><span class="value">30.10.2026</span></div><div><span class="label">Due date</span><span class="value">14.11.2026</span></div><div><span class="label">Your reference</span><span class="value">Order 118</span></div></div>'
    );
    expect(html()).not.toMatch(/\.facts[^{]*\{[^}]*border/);
  });

  it("leaves out the payment without a link, and the reference without one", () => {
    const page = body(
      html(
        invoice({
          status: "draft",
          sent: null,
          recipient: { ...invoice().recipient, reference: "" }
        })
      )
    );
    expect(page).not.toContain('class="pay"');
    expect(page).not.toContain("Your reference");
  });

  it("escapes what was typed", () => {
    const page = body(
      html(invoice({ recipient: { ...invoice().recipient, name: '<img src=x onerror="1">' } }))
    );
    expect(page).toContain("&lt;img src=x onerror=&quot;1&quot;&gt;");
    expect(page).not.toContain("<img");
  });

  it("names its file after its title", () => {
    expect(invoiceFileName(invoice(), t)).toBe("Invoice-2026-0042.pdf");
  });
});

describe("the PDF's page", () => {
  const os = Platform.OS;
  afterEach(() => {
    Platform.OS = os;
  });

  it("adds an A4 page to a document, at the end of its head", () => {
    expect(
      withPage("<html><head><title>x</title></head><body></body></html>", INVOICE_MARGINS)
    ).toBe(
      "<html><head><title>x</title><style>@page { size: A4; margin: 16mm 18mm 15mm 18mm; }</style>\n</head><body></body></html>"
    );
    expect(withPage("<p>x</p>")).toBe(
      "<style>@page { size: A4; margin: 0mm 0mm 0mm 0mm; }</style><p>x</p>"
    );
  });

  it("makes an A4 PDF on iOS, its margins given to the printing, none in the HTML", async () => {
    Platform.OS = "ios";
    await writePdf(html(), "Invoice-2026-0042.pdf", INVOICE_MARGINS);
    const [file] = print.files;
    expect(file!.page).toEqual({
      width: 595,
      height: 842,
      margins: marginsInPoints(INVOICE_MARGINS)
    });
    expect(file!.page.margins!.left).toBeCloseTo(51.02, 2);
    expect(file!.html).toContain("@page { size: A4; margin: 0mm 0mm 0mm 0mm; }");
  });

  it("makes an A4 PDF on Android, its margins in the HTML (Android reads no margins option)", async () => {
    Platform.OS = "android";
    await sharePdf(html(), "Invoice 2026-0042", "Invoice-2026-0042.pdf", INVOICE_MARGINS);
    const [file] = print.files;
    expect(file!.page).toEqual({ ...A4_POINTS, margins: undefined });
    expect(Number.isInteger(file!.page.width) && Number.isInteger(file!.page.height)).toBe(true);
    expect(file!.html).toContain("@page { size: A4; margin: 16mm 18mm 15mm 18mm; }");
  });
});
