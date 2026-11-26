// The App Store and Google Play screenshots, made from the app itself: its web build, with a
// fictitious business (Lumen Café), in a browser that reaches nothing outside this machine.
//
//   npm run store-screenshots                    every screenshot, every language
//   npm run store-screenshots -- --lang fr       one language
//   npm run store-screenshots -- --skip-build    reuse the last build
//   npm run store-screenshots -- --only qr --device iphone    one screen, one device
//   npm run store-screenshots -- --debug         the page's console and requests, printed
//
// Writes .expo/store-screenshots/out/<lang>/<format>/<number>-<screen>.png (git-ignored), at the
// pixel sizes the stores accept (FORMATS), and Google Play's feature graphic,
// out/<lang>/play-feature/feature-graphic.png (`--only feature-graphic`: it alone). Nothing is
// uploaded: the stores' listings are a human's job.
//
// How:
// - The web app is exported with ./metro.config.js, which swaps the Breez SDK's loader for a fake
//   wallet (./web-sdk.ts): a fixed passkey output, so always the same fictitious account. The
//   page must report that fake (FAKE_MARKER), or the capture stops.
// - Playwright, which is not one of the project's dependencies (pre-installed in Claude Code's
//   cloud containers; elsewhere `npm install --no-save playwright && npx playwright install
//   chromium`), opens it at each device's size. Every request leaving the page is
//   answered here or refused: the Nostr relays by ./relays.js, the merchant's Lightning address
//   by ./breez-tips.js, CoinGecko by a fixed rate, mempool.space as for addresses never paid,
//   every other host refused and reported.
// - The browser's clock starts at CLOCK_START, so that dates and times shown are the same at every
//   run.
// - The page is told the device's safe area (its status bar and home indicator), which the app
//   lays itself out around as on the device; ./compose.html draws the status bar's time and icons
//   over it.
// - Each screen is reached as a user does, through the app's own buttons (the labels from the
//   app's translations, src/i18n/locales/). What the screenshots leave out (LEFT_OUT: what only
//   the web app shows, what would date them) is taken out of the page before the capture.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import { createRequire, register } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import de from "../../src/i18n/locales/de.ts";
import en from "../../src/i18n/locales/en.ts";
import es from "../../src/i18n/locales/es.ts";
import fi from "../../src/i18n/locales/fi.ts";
import fr from "../../src/i18n/locales/fr.ts";
import it from "../../src/i18n/locales/it.ts";
import pt from "../../src/i18n/locales/pt.ts";
import { CAPTIONS } from "./captions.js";
import { FakeBreezTips } from "./breez-tips.js";
import { FakeRelays } from "./relays.js";

// The Swiss German translations import a module without its extension (./ts-resolve.mjs).
register("./ts-resolve.mjs", import.meta.url);
const { default: deCH } = await import("../../src/i18n/locales/de-CH.ts");

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(HERE, "..", "..");
const WORK_DIR = path.join(PROJECT_ROOT, ".expo", "store-screenshots");
const WEB_DIR = path.join(WORK_DIR, "web");
const OUT_DIR = path.join(WORK_DIR, "out");

/** As in ./web-sdk.ts. */
const FAKE_MARKER = "__sattleStoreScreenshotsFakeWallet";

/**
 * The build's settings. The passkey's RP ID is a reserved example domain (RFC 2606): the fake
 * wallet never uses it, and the app's real one is never written in the repository. The Breez API
 * key is a placeholder for the same reason: the app refuses to open a wallet without one.
 */
const BUILD_ENV = {
  APP_VARIANT: "production",
  PASSKEY_RP_ID: "passkeys.example.com",
  EXPO_PUBLIC_BREEZ_API_KEY: "store-screenshots-placeholder",
  EXPO_OVERRIDE_METRO_CONFIG: path.join(HERE, "metro.config.js")
};

/** A Tuesday afternoon in Zurich: the time every screenshot is taken at. */
const CLOCK_START = Date.parse("2026-11-24T14:32:00+01:00");

/** The chain's height at CLOCK_START, as mempool.space tells it: about that of late 2026. */
const TIP_HEIGHT = 977_000;

/** Price of 1 BTC, per currency, at every hour: 18.40 CHF is then exactly 23,000 sats. */
const RATES = { chf: 80_000 };

/**
 * The app's languages captured (src/i18n/languages.ts), each with the device locale it runs under:
 * its language (the app picks German's variant by the region: de-DE gives "de", de-CH "de-CH"),
 * its numbers and dates. French, as the business, in Switzerland; the others in their main store
 * region.
 */
const LANGUAGES = {
  fr: { lang: "fr", locale: "fr-CH", strings: fr },
  en: { lang: "en", locale: "en-GB", strings: en },
  de: { lang: "de", locale: "de-DE", strings: de },
  "de-CH": { lang: "de-CH", locale: "de-CH", strings: deCH },
  it: { lang: "it", locale: "it-IT", strings: it },
  es: { lang: "es", locale: "es-ES", strings: es },
  pt: { lang: "pt", locale: "pt-PT", strings: pt },
  fi: { lang: "fi", locale: "fi-FI", strings: fi }
};

/**
 * The devices the app is shown on: the screen's size in points (CSS pixels), its safe area's top
 * (status bar) and bottom (home indicator), the capture's scale, and how it reads a BoltCard
 * (`cardReading`, as src/lib/nfc/boltcard.ts tells it in the apps: an iPhone on a tap, Android on
 * its own, an iPad none), which ./boltcard.ts gives the point of sale.
 */
const DEVICES = {
  iphone: {
    width: 402,
    height: 874,
    top: 62,
    bottom: 34,
    scale: 3,
    statusBar: "ios",
    time: "9:41",
    radius: 55,
    cardReading: "tap"
  },
  android: {
    width: 412,
    height: 915,
    top: 40,
    bottom: 24,
    scale: 3,
    statusBar: "android",
    time: "9:30",
    radius: 34,
    cardReading: "auto"
  },
  ipad: {
    width: 1032,
    height: 1376,
    top: 24,
    bottom: 20,
    scale: 2,
    statusBar: "ipad",
    time: "9:41",
    radius: 18,
    cardReading: "none"
  }
};

/**
 * The stores' formats: App Store Connect's iPhone 6.9" and 6.3" and iPad 13" sizes, Google
 * Play's phone 9:16 (each side 320 to 3,840 px, the longer at most 2.3 times the shorter).
 */
const FORMATS = {
  "iphone-6.9": { width: 1320, height: 2868, device: "iphone" },
  "iphone-6.3": { width: 1206, height: 2622, device: "iphone" },
  "ipad-13": { width: 2064, height: 2752, device: "ipad" },
  "play-phone": { width: 1080, height: 1920, device: "android" }
};

/** The status bar's colour in each theme: the app's text (src/theme/tokens.ts). */
const STATUS_BAR_COLOURS = { light: "#0B1A33", dark: "#F4EFE6" };

/** The fictitious business every screenshot shows, and its address (its invoices show it). */
const BUSINESS_NAME = "Lumen Café";
const BUSINESS_ADDRESS = { street: "Rue des Lumières 7", postalCode: "1003", city: "Lausanne" };

/**
 * What the screenshots leave out, removed from the page before the capture: an element by its
 * test ID (`testId`), or by its text (`key` of the app's translations, any value in place of its
 * {{…}} placeholders) and `levelsUp` parents.
 * Each must be found where `required` says the screen shows it, so that a change of the app does
 * not let it through unnoticed.
 */
const LEFT_OUT = [
  // Shown by the web app only (`Platform.OS === "web"`), not by the iOS and Android apps: the
  // point of sale's hint about the computer's keyboard (src/app/(app)/pos/index.tsx), its row
  // being the text's parent.
  {
    key: "pos.keyboardHint",
    levelsUp: 1,
    required: (deviceName, screen) => deviceName === "ipad" && screen.name === "pos"
  },
  // The side bar's version and commit (src/features/navigation/Sidebar.tsx): they would date the
  // screenshots. The split's screen is a step of its own, without the side bar.
  {
    testId: "sidebar-version",
    required: (deviceName, screen) => deviceName === "ipad" && screen.name !== "split"
  },
  // The split's fees card (src/features/onboarding/SplitFees.tsx, the parent of sattle.me's fee
  // row): rates and a waiver with an end date, which the stores advise against in screenshots.
  {
    testId: "sattle-fee",
    levelsUp: 1,
    required: (_deviceName, screen) => screen.name === "split"
  }
];

/** A string of the app's translations, by its key ("common.startCharging"). */
function t(strings, key) {
  const value = key.split(".").reduce((node, part) => node?.[part], strings);
  if (typeof value !== "string") throw new Error(`No translation for ${key}`);
  return value;
}

// ---------------------------------------------------------------------------------------------
// Screens

/**
 * Moves the mouse to the screen's top left corner, over nothing that reacts: a pointer over the
 * notifications holds them (NotificationsProvider), which a finger on a phone never does.
 */
async function releasePointer(page) {
  await page.mouse.move(1, 1);
}

/**
 * Opens a destination of the navigation, as the merchant does: its row of the side bar (a large
 * screen; a locked one asks the passkey first), else its button of the dock by its name, behind
 * the dock's "More" when the dock does not hold it, after unlocking the till (the passkey) when
 * the app locked itself to the point of sale (5 minutes without activity).
 */
async function navigate(page, strings, destination) {
  const row = page.getByTestId(`sidebar-${destination}`).filter({ visible: true });
  if ((await row.count()) > 0) {
    await row.click();
    return;
  }
  const name = t(strings, `navigation.destinations.${destination}`);
  const button = () =>
    page.getByRole("button", { name, exact: true, disabled: false }).filter({ visible: true });
  // Locked: the till's dock shows "Unlock", enabled (the dock of the open account stays in the
  // page meanwhile, hidden: its buttons do not tell).
  const unlock = page.getByTestId("dock-unlock").filter({ visible: true });
  if ((await unlock.count()) > 0 && (await unlock.isEnabled())) {
    await unlock.click();
    // Unlocked (the passkey answered): "Unlock" stays in the page, disabled.
    const end = Date.now() + 30_000;
    while (await unlock.isEnabled()) {
      if (Date.now() > end) throw new Error("The till did not unlock");
      await page.waitForTimeout(200);
    }
  }
  if ((await button().count()) === 0) await page.getByTestId("dock-more").click();
  await button().first().click();
}

/**
 * The business's items, in the order they are created: a name per language, an exact price in
 * CHF as typed in the field, and a photo of ./photos/ (CC0, ./photos/README.md).
 */
const ARTICLES = [
  {
    photo: "cappuccino.jpg",
    price: "4.90",
    name: {
      fr: "Cappuccino",
      en: "Cappuccino",
      de: "Cappuccino",
      "de-CH": "Cappuccino",
      it: "Cappuccino",
      es: "Capuchino",
      pt: "Cappuccino",
      fi: "Cappuccino"
    }
  },
  {
    photo: "espresso.jpg",
    price: "3.80",
    name: {
      fr: "Espresso",
      en: "Espresso",
      de: "Espresso",
      "de-CH": "Espresso",
      it: "Espresso",
      es: "Café solo",
      pt: "Expresso",
      fi: "Espresso"
    }
  },
  {
    photo: "sourdough-loaf.jpg",
    price: "6.50",
    name: {
      fr: "Pain au levain",
      en: "Sourdough",
      de: "Sauerteigbrot",
      "de-CH": "Sauerteigbrot",
      it: "Pane",
      es: "Pan rústico",
      pt: "Pão rústico",
      fi: "Juuresleipä"
    }
  },
  {
    photo: "chocolate-cookie.jpg",
    price: "2.50",
    name: {
      fr: "Cookie",
      en: "Cookie",
      de: "Cookie",
      "de-CH": "Cookie",
      it: "Biscotto",
      es: "Galleta",
      pt: "Bolacha",
      fi: "Keksi"
    }
  },
  {
    photo: "garden-salad.jpg",
    price: "13.50",
    name: {
      fr: "Salade",
      en: "Salad",
      de: "Salat",
      "de-CH": "Salat",
      it: "Insalata",
      es: "Ensalada",
      pt: "Salada",
      fi: "Salaatti"
    }
  },
  {
    photo: "homemade-lemonade.jpg",
    price: "4.50",
    name: {
      fr: "Limonade",
      en: "Lemonade",
      de: "Limonade",
      "de-CH": "Limonade",
      it: "Limonata",
      es: "Limonada",
      pt: "Limonada",
      fi: "Limonadi"
    }
  },
  {
    photo: "gelato.jpg",
    price: "4.20",
    name: {
      fr: "Glace",
      en: "Gelato",
      de: "Eis",
      "de-CH": "Glace",
      it: "Gelato",
      es: "Helado",
      pt: "Gelado",
      fi: "Jäätelö"
    }
  },
  {
    photo: "sparkling-water.jpg",
    price: "3.50",
    name: {
      fr: "Eau gazeuse",
      en: "Soda water",
      de: "Mineralwasser",
      "de-CH": "Mineralwasser",
      it: "Acqua gassata",
      es: "Agua con gas",
      pt: "Água com gás",
      fi: "Kivennäisvesi"
    }
  }
];

/** Creates ARTICLES through "Items", as the merchant does, then goes back to the point of sale. */
async function addArticles(page, strings, lang) {
  await navigate(page, strings, "articles");
  for (const [index, article] of ARTICLES.entries()) {
    // A minute apart, as a person creates them: the list's order (the newest first) is then
    // their order of creation, not that of their random ids within one second.
    if (index > 0) await page.clock.fastForward(60_000);
    await page.getByTestId("add-article").filter({ visible: true }).first().click();
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByTestId("article-photo").filter({ visible: true }).click()
    ]);
    await chooser.setFiles(path.join(HERE, "photos", article.photo));
    // The photo shown in the form: prepared (cropped, compressed). "Save" waits for it, disabled
    // meanwhile; waited for here too, so that a photo that could not be made stops the capture.
    await page.getByTestId("article-sheet").locator("img").first().waitFor({ timeout: 30_000 });
    await page.getByTestId("article-name").fill(article.name[lang]);
    await page.getByTestId("article-price").fill(article.price);
    await page.getByTestId("article-save").click();
    await page.getByTestId("article-sheet").waitFor({ state: "detached", timeout: 30_000 });
  }
  // The notifications of the items saved, gone by themselves.
  await releasePointer(page);
  await page
    .getByText(t(strings, "articles.saved.title"), { exact: true })
    .first()
    .waitFor({ state: "detached", timeout: 30_000 });
  await navigate(page, strings, "pos");
  await page.getByTestId("key-1").waitFor({ timeout: 30_000 });
}

/**
 * A new account, through the welcome screen and the sign-up, named BUSINESS_NAME in its
 * settings, back on the point of sale.
 */
async function openAccount(page, strings) {
  await page.getByTestId("create-account").click();
  await page
    .getByText(t(strings, "common.startCharging"), { exact: true })
    .click({ timeout: 30_000 });
  await page.getByTestId("key-1").waitFor({ timeout: 30_000 });
  await navigate(page, strings, "settings");
  // The business rubric: a tab beside the others on a large screen, a card to open on a phone.
  await page
    .getByTestId(/^settings-(tab|card)-business$/)
    .filter({ visible: true })
    .first()
    .click();
  const field = page.getByTestId("business-name-field").filter({ visible: true });
  await field.fill(BUSINESS_NAME);
  await field.blur();
  await page.getByTestId("business-name-saving").waitFor({ state: "detached", timeout: 30_000 });
  for (const [key, value] of Object.entries(BUSINESS_ADDRESS)) {
    const input = page.getByTestId(`business-address-${key}`).filter({ visible: true });
    await input.fill(value);
    await input.blur();
  }
  // Their notifications, gone by themselves (they cover the top of a phone's screen).
  await releasePointer(page);
  for (const key of ["settings.nameSavedTitle", "settings.address.savedTitle"]) {
    await page
      .getByText(t(strings, key), { exact: true })
      .first()
      .waitFor({ state: "detached", timeout: 30_000 });
  }
  // On a phone, the rubric is a page of its own, without the dock: back to the settings first.
  const back = page
    .getByRole("button", { name: t(strings, "common.back"), exact: true, disabled: false })
    .filter({ visible: true });
  if ((await back.count()) > 0) await back.first().click();
  await navigate(page, strings, "pos");
  await page.getByTestId("key-1").waitFor({ timeout: 30_000 });
}

/** Types an amount on the point of sale's keypad, key by key. */
async function typeAmount(page, digits) {
  for (const key of digits) await page.getByTestId(`key-${key}`).click();
}

/**
 * Pays the last invoice breez.tips made, as a customer's wallet would: breez.tips tells it settled
 * with its preimage (LUD-21, what the point of sale proves the sale with), and the payment arrives
 * in the merchant's wallet (the fake's balance and payments, as the web SDK gives them: a Lightning
 * receipt of that very invoice, then its event).
 */
async function pay(world) {
  const invoice = world.breezTips.settleLast();
  await world.page.evaluate(
    ([marker, received]) => {
      const { fake, identity } = globalThis[marker];
      const now = Math.floor(Date.now() / 1000);
      const payment = {
        id: `received-${received.paymentHash.slice(0, 16)}`,
        paymentType: "receive",
        status: "completed",
        amount: BigInt(received.sats),
        fees: BigInt(0),
        timestamp: now,
        method: "lightning",
        details: {
          type: "lightning",
          invoice: received.pr,
          destinationPubkey: identity,
          htlcDetails: {
            paymentHash: received.paymentHash,
            preimage: received.preimage,
            expiryTime: now + 600,
            status: "preimageShared"
          }
        }
      };
      fake.fakeWallet.balanceSats += received.sats;
      fake.fakeWallet.payments = [payment, ...fake.fakeWallet.payments];
      fake.emitSdkEvent(fake.fakeWallet, "paymentSucceeded", payment);
    },
    [
      FAKE_MARKER,
      {
        pr: invoice.pr,
        preimage: invoice.preimage,
        paymentHash: invoice.paymentHash,
        sats: Number(invoice.amountMsat / 1000n)
      }
    ]
  );
}

/**
 * A sale on the point of sale: the amount typed, its note, "Charge", the customer paying (`pay`),
 * the paid screen, back to the point of sale.
 */
async function sell(page, strings, world, { digits, note }) {
  await typeAmount(page, digits);
  if (note) {
    await page.getByTestId("add-note").filter({ visible: true }).click();
    await page.getByTestId("note-field").fill(note);
    await page.getByTestId("note-field").press("Enter");
  }
  const before = world.breezTips.invoices.size;
  await page.getByTestId("charge").filter({ visible: true }).click();
  await expectPoll(() => world.breezTips.invoices.size > before, "an invoice of the sale");
  await page.waitForTimeout(1_000);
  await pay(world);
  await page.getByTestId("back-to-pos").filter({ visible: true }).click({ timeout: 30_000 });
  await page.getByTestId("key-1").waitFor({ timeout: 30_000 });
}

/** A decimal written "18.50" as a person types it in `locale` ("18,50" in fr-CH). */
function localDecimal(value, locale) {
  const separator = new Intl.NumberFormat(locale)
    .formatToParts(1.5)
    .find((part) => part.type === "decimal").value;
  return value.replace(".", separator);
}

/** Waits until `ready()` is true, for at most `ms`. */
async function expectPoll(ready, what, ms = 30_000) {
  const end = Date.now() + ms;
  while (!ready()) {
    if (Date.now() > end) throw new Error(`Not there in ${ms} ms: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/**
 * The sales of the afternoon, in order: the amount's keys, the note, and the minutes the clock
 * moves on before it (the page's clock, CLOCK_START first).
 */
const SALES = [
  {
    digits: ["2", "4", "6", "0"],
    note: {
      fr: "Table 4",
      en: "Table 4",
      de: "Tisch 4",
      "de-CH": "Tisch 4",
      it: "Tavolo 4",
      es: "Mesa 4",
      pt: "Mesa 4",
      fi: "Pöytä 4"
    },
    after: 0
  },
  {
    digits: ["8", "0", "0"],
    note: {
      fr: "À emporter",
      en: "Takeaway",
      de: "Zum Mitnehmen",
      "de-CH": "Take-away",
      it: "Da asporto",
      es: "Para llevar",
      pt: "Para levar",
      fi: "Mukaan"
    },
    after: 13
  },
  {
    digits: ["1", "8", "4", "0"],
    note: {
      fr: "Table 7",
      en: "Table 7",
      de: "Tisch 7",
      "de-CH": "Tisch 7",
      it: "Tavolo 7",
      es: "Mesa 7",
      pt: "Mesa 7",
      fi: "Pöytä 7"
    },
    after: 18
  },
  {
    digits: ["3", "1", "2", "0"],
    note: {
      fr: "Terrasse",
      en: "Terrace",
      de: "Terrasse",
      "de-CH": "Terrasse",
      it: "Terrazza",
      es: "Terraza",
      pt: "Esplanada",
      fi: "Terassi"
    },
    after: 16
  },
  {
    digits: ["1", "2", "3", "0"],
    note: {
      fr: "Table 2",
      en: "Table 2",
      de: "Tisch 2",
      "de-CH": "Tisch 2",
      it: "Tavolo 2",
      es: "Mesa 2",
      pt: "Mesa 2",
      fi: "Pöytä 2"
    },
    after: 21
  }
];

/** An invoice of the business, through "New invoice": its recipient and lines. */
const INVOICE = {
  recipient: {
    name: "Atelier Horizon Sàrl",
    street: "Rue des Vergers 4",
    postalCode: "1950",
    city: "Sion"
  },
  lines: [
    {
      name: {
        fr: "Apéritif",
        en: "Buffet",
        de: "Apéro",
        "de-CH": "Apéro",
        it: "Aperitivo",
        es: "Aperitivo",
        pt: "Aperitivo",
        fi: "Tarjoilu"
      },
      quantity: "40",
      price: "18.50"
    },
    {
      name: {
        fr: "Boissons",
        en: "Drinks",
        de: "Getränke",
        "de-CH": "Getränke",
        it: "Bevande",
        es: "Bebidas",
        pt: "Bebidas",
        fi: "Juomat"
      },
      quantity: "40",
      price: "4.50"
    },
    {
      name: {
        fr: "Terrasse",
        en: "Terrace",
        de: "Terrasse",
        "de-CH": "Terrasse",
        it: "Terrazza",
        es: "Terraza",
        pt: "Esplanada",
        fi: "Terassi"
      },
      quantity: "1",
      price: "250.00"
    }
  ]
};

/**
 * The business's employees, in the order they are invited, and whether each joins (opens its
 * invitation on its own phone) before the screenshot.
 */
const EMPLOYEES = [
  { name: "Léa", joins: true, photo: "employee-lea.jpg" },
  { name: "Marco", joins: true, photo: "employee-marco.jpg" },
  { name: "Sofia", joins: false }
];

/**
 * Invites an employee from "Employees" and, when it `joins`, opens the invitation on another
 * phone (its own browser context, on the same relays) and joins, as the employee does.
 */
async function inviteEmployee(page, strings, world, { name, joins, photo }) {
  await page.getByTestId("invite-employee").filter({ visible: true }).first().click();
  await page.getByTestId("invite-name").fill(name);
  await page.getByTestId("invite-create").click();
  // The link as the owner sends it: copied (a phone shows it shortened).
  await page.getByTestId("invite-copy").filter({ visible: true }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  if (!link.includes("/join#")) throw new Error(`Not an invitation link: ${link}`);
  await page.getByTestId("invite-done").filter({ visible: true }).click();
  if (!joins) return;
  // The link names the RP ID's host (a placeholder in this build): its fragment is the
  // invitation, opened on this build's own host.
  const peer = await world.openPeer();
  try {
    const origin = new URL(world.page.url()).origin;
    await peer.page.goto(`${origin}/join${link.slice(link.indexOf("#"))}`);
    await peer.page.getByTestId("join-confirm").click({ timeout: 60_000 });
    await peer.page.getByTestId("key-1").waitFor({ timeout: 60_000 });
    if (photo) {
      // The employee's photo, picked in its own "Settings" (Your profile), as the employee does.
      await navigate(peer.page, strings, "settings");
      await peer.page
        .getByTestId(/^settings-(tab|card)-profile$/)
        .filter({ visible: true })
        .first()
        .click();
      const [chooser] = await Promise.all([
        peer.page.waitForEvent("filechooser"),
        peer.page.getByTestId("pick-photo").filter({ visible: true }).click()
      ]);
      await chooser.setFiles(path.join(HERE, "photos", photo));
      await peer.page
        .getByText(t(strings, "settings.photoSavedTitle"), { exact: true })
        .first()
        .waitFor({ timeout: 60_000 });
    }
  } finally {
    await peer.context.close();
  }
}

/** The afternoon's sales (SALES) charged and paid, then "Wallet". */
async function showWallet(page, strings, world) {
  await openAccount(page, strings);
  for (const sale of SALES) {
    if (sale.after > 0) await page.clock.fastForward(sale.after * 60_000);
    await sell(page, strings, world, { digits: sale.digits, note: sale.note[world.lang] });
  }
  await navigate(page, strings, "wallet");
  await page.waitForTimeout(3_000);
}

/**
 * The screenshots, in their order on the stores: each one reaches its screen from a new account
 * (`page` freshly opened on the welcome screen).
 */
const SCREENS = [
  {
    name: "pos",
    theme: "light",
    async show(page, strings) {
      await openAccount(page, strings);
      await typeAmount(page, ["1", "8", "4", "0"]);
    }
  },
  {
    name: "qr",
    theme: "light",
    async show(page, strings) {
      await openAccount(page, strings);
      await typeAmount(page, ["1", "8", "4", "0"]);
      await page.getByTestId("charge").filter({ visible: true }).click();
      // A phone offers its BoltCard reader under the code; an iPad reads no card.
      if (page.viewportSize().width < 1024) {
        await page.getByTestId("boltcard").filter({ visible: true }).waitFor({ timeout: 30_000 });
      }
      await page.waitForTimeout(8_000);
    }
  },
  {
    name: "split",
    theme: "light",
    async show(page, strings) {
      await openAccount(page, strings);
      await navigate(page, strings, "settings");
      await page
        .getByTestId(/^settings-(tab|card)-payouts$/)
        .filter({ visible: true })
        .first()
        .click();
      await page.getByTestId("split-row").filter({ visible: true }).first().click();
      // 40 % in bitcoin, 60 % in francs, through the slider's own keys (ARIA slider: PageDown is
      // 10 % less bitcoin), as a keyboard does.
      const slider = page.getByTestId("split-slider").filter({ visible: true });
      await slider.focus();
      for (let step = 0; step < 6; step++) await slider.press("PageDown");
      await slider.blur();
      await page.waitForTimeout(1_000);
    }
  },
  { name: "wallet", theme: "light", show: showWallet },
  {
    name: "articles",
    theme: "light",
    async show(page, strings, world) {
      await openAccount(page, strings);
      await addArticles(page, strings, world.lang);
      await page.getByTestId("pos-mode-articles").filter({ visible: true }).click();
      // A basket: two cappuccinos, a cookie and a lemonade (16.80 CHF).
      for (const index of [0, 0, 3, 5]) {
        await page
          .getByText(ARTICLES[index].name[world.lang], { exact: true })
          .filter({ visible: true })
          .first()
          .click();
      }
    }
  },
  {
    name: "team",
    theme: "light",
    async show(page, strings, world) {
      await openAccount(page, strings);
      await navigate(page, strings, "employees");
      for (const employee of EMPLOYEES) await inviteEmployee(page, strings, world, employee);
      // The list read again, as when the owner comes back to it.
      await navigate(page, strings, "pos");
      await navigate(page, strings, "employees");
      await page.waitForTimeout(5_000);
    }
  },
  {
    name: "invoice",
    theme: "light",
    async show(page, strings, world) {
      await openAccount(page, strings);
      await navigate(page, strings, "wallet");
      await page.getByTestId("wallet-new-invoice").filter({ visible: true }).first().click();
      for (const [key, value] of Object.entries(INVOICE.recipient)) {
        await page.getByTestId(`invoice-recipient-${key}`).fill(value);
      }
      await page.getByTestId("invoice-continue").click();
      for (const line of INVOICE.lines) {
        await page.getByTestId("invoice-add-line").click();
        await page.getByTestId("invoice-picker-manual").click();
        await page.getByTestId("invoice-line-name").last().fill(line.name[world.lang]);
        await page.getByTestId("invoice-line-quantity").last().fill(line.quantity);
        await page
          .getByTestId("invoice-line-price")
          .last()
          .fill(localDecimal(line.price, world.locale));
      }
      // Due date, notes, then the review.
      for (let step = 0; step < 3; step++) await page.getByTestId("invoice-continue").click();
      await page.getByTestId("invoice-create").click();
      await page.getByTestId("invoice-sent-view").click({ timeout: 60_000 });
      await page.getByTestId("invoice-detail").waitFor({ timeout: 60_000 });
      await page.waitForTimeout(3_000);
    }
  }
];

// ---------------------------------------------------------------------------------------------
// The browser's world

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".wav": "audio/wav",
  ".webmanifest": "application/manifest+json"
};

/** Serves the web export as its host does: a file if it exists, else the app's page (`single`). */
function serve(root) {
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    let file = path.join(root, pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      file = path.join(root, "index.html");
    }
    response.writeHead(200, {
      "content-type": CONTENT_TYPES[path.extname(file)] ?? "application/octet-stream"
    });
    fs.createReadStream(file).pipe(response);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

/**
 * CoinGecko's answer at `nowMs` (the page's time), at the fixed rates: the points of every hour of
 * the last two days up to now, and, ending the 5-minute series, the live price at `nowMs`, as
 * CoinGecko gives it (the app takes the time from it: src/lib/rates/sources.ts, lastLivePrice).
 */
function coingeckoAnswer(url, nowMs) {
  const price = RATES[url.searchParams.get("vs_currency") ?? ""];
  if (price === undefined) return null;
  const hour = 3_600_000;
  const prices = [];
  for (let time = Math.floor(nowMs / hour) * hour - 48 * hour; time <= nowMs; time += hour) {
    prices.push([time, price]);
  }
  if (url.pathname.endsWith("/market_chart")) prices.push([nowMs, price]);
  return { prices };
}

/** A JSON answer the page may read from its origin (CORS). */
function json(route, status, body) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify(body)
  });
}

/**
 * The page's world for one device and language: a browser context (the page's size, the locale,
 * the theme), its page with the clock and the safe area set, and every request routed: the relays
 * (`relays`), breez.tips (`breezTips`), CoinGecko; `refused` collects what the page asked outside
 * this machine besides.
 */
async function openWorld(
  browser,
  origin,
  deviceName,
  device,
  language,
  theme,
  debug,
  relays = new FakeRelays()
) {
  const context = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    deviceScaleFactor: device.scale,
    locale: language.locale,
    timezoneId: "Europe/Zurich",
    colorScheme: theme,
    reducedMotion: "reduce"
  });
  // The clipboard, for the links the app copies (read back by the capture, `inviteEmployee`).
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
  const page = await context.newPage();
  if (debug) {
    page.on("console", async (message) => {
      // Each argument, as the console shows it (an error's message and stack, not "%s").
      const parts = await Promise.all(
        message
          .args()
          .map((argument) =>
            argument
              .evaluate((value) => (value instanceof Error ? value.stack : String(value)))
              .catch(() => message.text())
          )
      );
      console.log(`  [console.${message.type()}] ${parts.join(" ")}`);
    });
  }
  const breezTips = new FakeBreezTips({
    // What the fake wallet registered for the username (jest/breez-sdk-web.ts, exposed by
    // ./web-sdk.ts).
    descriptionOf: (username) =>
      page.evaluate(
        ([marker, name]) => globalThis[marker].fake.lightningAddresses.get(name),
        [FAKE_MARKER, username]
      ),
    nowSeconds: () => page.evaluate(() => Math.floor(Date.now() / 1000))
  });
  const refused = [];
  await context.routeWebSocket(/.*/, (route) => {
    // mempool.space's live feed of the addresses watched (src/lib/onchain/mempool-socket.ts):
    // open, and silent, as for addresses nothing pays. Every other socket is a Nostr relay.
    if (new URL(route.url()).host === "mempool.space") {
      route.onMessage(() => undefined);
      return;
    }
    relays.serve(route);
  });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    if (debug) console.log(`  [request] ${route.request().method()} ${url.href}`);
    if (url.protocol === "https:" && url.host === "api.coingecko.com") {
      const body = coingeckoAnswer(url, await page.evaluate(() => Date.now()));
      if (body) return json(route, 200, body);
    }
    // mempool.space, the explorer (Esplora's API): every address of the fake wallet is new, never
    // paid (its transactions: none), and the chain is at TIP_HEIGHT.
    if (url.protocol === "https:" && url.host === "mempool.space") {
      if (/^\/api\/address\/[a-z0-9]+\/txs$/.test(url.pathname)) return json(route, 200, []);
      if (url.pathname === "/api/blocks/tip/height") {
        return route.fulfill({
          status: 200,
          contentType: "text/plain",
          headers: { "access-control-allow-origin": "*" },
          body: String(TIP_HEIGHT)
        });
      }
    }
    if (FakeBreezTips.serves(url) && route.request().method() === "GET") {
      const { status, body } = await breezTips.answer(url);
      return json(route, status, body);
    }
    refused.push(`${route.request().method()} ${url.origin}${url.pathname}`);
    return route.abort("blockedbyclient");
  });
  // The device's safe area, read by the app through CSS env(safe-area-inset-*)
  // (react-native-safe-area-context on the web).
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", {
    insets: { top: device.top, bottom: device.bottom, left: 0, right: 0 }
  });
  await page.clock.install({ time: CLOCK_START });
  await page.clock.resume();
  // How the device reads a BoltCard (./boltcard.ts), before the app loads.
  await page.addInitScript((reading) => {
    globalThis.__sattleStoreScreenshotsCardReading = reading;
  }, device.cardReading);
  return {
    context,
    page,
    relays,
    breezTips,
    refused,
    lang: language.lang,
    locale: language.locale,
    deviceName,
    /** Another phone, on the same relays (an employee's). */
    openPeer: () =>
      openWorld(browser, origin, "iphone", DEVICES.iphone, language, theme, debug, relays)
  };
}

/** Takes the screenshot of `screen` on `device`: the page's PNG, in points `width` × `height`. */
async function captureScreen(browser, origin, screen, deviceName, device, language, file, debug) {
  const world = await openWorld(browser, origin, deviceName, device, language, screen.theme, debug);
  const { context, page, relays, refused } = world;
  try {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${origin}/`);
    await page.getByTestId("create-account").waitFor({ timeout: 60_000 });
    if ((await page.evaluate((marker) => typeof globalThis[marker], FAKE_MARKER)) !== "object") {
      throw new Error("The page does not run the fake wallet: is EXPO_OVERRIDE_METRO_CONFIG read?");
    }
    await screen.show(page, language.strings, world);
    await removeLeftOut(page, deviceName, screen, language.strings);
    // No pointer over a key or a button, the fonts loaded and nothing moving.
    await page.mouse.move(0, 0);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1_500);
    await page.screenshot({ path: file, animations: "disabled", caret: "hide" });
    if (errors.length > 0) throw new Error(`The page failed: ${errors.join(" | ")}`);
    if (relays.errors.length > 0) throw new Error(`Malformed relay messages: ${relays.errors}`);
    return { refused };
  } catch (error) {
    // What the page showed when the step failed, next to where the screenshot would have been.
    const failure = file.replace(/\.png$/, ".failed.png");
    await page.screenshot({ path: failure }).catch(() => undefined);
    throw new Error(`${path.basename(file)}: ${error.message} (page: ${failure})`, {
      cause: error
    });
  } finally {
    await context.close();
  }
}

/** Removes from the page what the screenshots leave out (LEFT_OUT). */
async function removeLeftOut(page, deviceName, screen, strings) {
  for (const { key, testId, levelsUp = 0, required } of LEFT_OUT) {
    const removed = await page.evaluate(
      ({ pattern, testId, levelsUp }) => {
        const text = pattern === null ? null : new RegExp(pattern);
        const matches =
          testId === undefined
            ? [...document.querySelectorAll("body *")].filter(
                (element) => element.childElementCount === 0 && text.test(element.textContent)
              )
            : [...document.querySelectorAll(`[data-testid="${testId}"]`)];
        for (const match of matches) {
          let target = match;
          for (let level = 0; level < levelsUp; level++) target = target.parentElement;
          target.remove();
        }
        return matches.length;
      },
      { pattern: key === undefined ? null : textPattern(t(strings, key)), testId, levelsUp }
    );
    if (removed === 0 && required(deviceName, screen)) {
      throw new Error(`Not found on ${deviceName}, to leave out: ${key ?? testId}`);
    }
  }
}

/** A translation as the whole of a text, any value in place of its {{…}} placeholders. */
function textPattern(translation) {
  const parts = translation
    .split(/\{\{[^}]*\}\}/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return `^${parts.join(".+")}$`;
}

/**
 * Google Play's feature graphic: 1024 × 500, a JPEG or a 24-bit PNG without alpha, required to
 * publish a listing. It shows the first screenshot's caption (./feature.html).
 */
const FEATURE_GRAPHIC = { name: "feature-graphic", width: 1024, height: 500, dir: "play-feature" };

/** Draws `lang`'s feature graphic (./feature.html) and writes it. */
async function composeFeatureGraphic(browser, lang, file) {
  const { title, subtitle } = CAPTIONS[SCREENS[0].name][lang];
  const page = await browser.newPage({
    viewport: { width: FEATURE_GRAPHIC.width, height: FEATURE_GRAPHIC.height },
    deviceScaleFactor: 1
  });
  try {
    await page.goto(pathToFileURL(path.join(HERE, "feature.html")).href);
    await page.evaluate((input) => window.compose(input), {
      caption: { title: title.replace(/\n/g, " "), subtitle },
      logo: fs.readFileSync(path.join(PROJECT_ROOT, "assets", "images", "logo.svg"), "utf8")
    });
    await page.locator("#canvas").screenshot({ path: file, omitBackground: false });
  } finally {
    await page.close();
  }
}

/** Lays a captured page out at `format`'s exact size (./compose.html) and writes it. */
async function composeScreenshot(browser, shotFile, format, device, theme, caption, file) {
  const page = await browser.newPage({
    viewport: { width: format.width, height: format.height },
    deviceScaleFactor: 1
  });
  try {
    await page.goto(pathToFileURL(path.join(HERE, "compose.html")).href);
    await page.evaluate((input) => window.compose(input), {
      canvas: { width: format.width, height: format.height },
      device: { ...device, colour: STATUS_BAR_COLOURS[theme] },
      shot: { src: pathToFileURL(shotFile).href, width: device.width, height: device.height },
      caption
    });
    await page.locator("#canvas").screenshot({ path: file, omitBackground: false });
  } finally {
    await page.close();
  }
}

// ---------------------------------------------------------------------------------------------
// Run

function parseArguments(argv) {
  const options = {
    languages: Object.keys(LANGUAGES),
    screens: [...SCREENS.map((screen) => screen.name), FEATURE_GRAPHIC.name],
    devices: Object.keys(DEVICES),
    build: true,
    debug: false
  };
  const one = (name, value, allowed) => {
    if (!allowed.includes(value)) throw new Error(`${name}: one of ${allowed.join(", ")}`);
    return [value];
  };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === "--skip-build") options.build = false;
    else if (argument === "--debug") options.debug = true;
    else if (argument === "--lang") {
      options.languages = one(argument, argv[++index], Object.keys(LANGUAGES));
    } else if (argument === "--only") {
      options.screens = one(argument, argv[++index], options.screens);
    } else if (argument === "--device") {
      options.devices = one(argument, argv[++index], Object.keys(DEVICES));
    } else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function build() {
  console.log("Exporting the web app with the fake wallet…");
  const env = { ...process.env, ...BUILD_ENV };
  execFileSync(process.execPath, [path.join(PROJECT_ROOT, "scripts", "web-manifest.js")], {
    cwd: PROJECT_ROOT,
    env,
    stdio: "inherit"
  });
  fs.rmSync(WEB_DIR, { recursive: true, force: true });
  execFileSync("npx", ["expo", "export", "--platform", "web", "--output-dir", WEB_DIR], {
    cwd: PROJECT_ROOT,
    env,
    stdio: "inherit"
  });
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.build) build();
  if (!fs.existsSync(path.join(WEB_DIR, "index.html"))) {
    throw new Error(`No web build in ${WEB_DIR}: run without --skip-build`);
  }
  const server = await serve(WEB_DIR);
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const refused = new Set();
  try {
    const everything =
      options.screens.length === SCREENS.length + 1 &&
      options.devices.length === Object.keys(DEVICES).length;
    for (const lang of options.languages) {
      const language = LANGUAGES[lang];
      // A whole set replaces the language's: no screenshot of a screen since removed or renumbered.
      if (everything) fs.rmSync(path.join(OUT_DIR, lang), { recursive: true, force: true });
      for (const [index, screen] of SCREENS.entries()) {
        if (!options.screens.includes(screen.name)) continue;
        const number = String(index + 1).padStart(2, "0");
        const caption = CAPTIONS[screen.name][lang];
        for (const [deviceName, device] of Object.entries(DEVICES)) {
          if (!options.devices.includes(deviceName)) continue;
          const shotDir = path.join(OUT_DIR, lang, "raw");
          fs.mkdirSync(shotDir, { recursive: true });
          const shotFile = path.join(shotDir, `${number}-${screen.name}-${deviceName}.png`);
          const shot = await captureScreen(
            browser,
            origin,
            screen,
            deviceName,
            device,
            language,
            shotFile,
            options.debug
          );
          for (const request of shot.refused) refused.add(request);
          for (const [formatName, format] of Object.entries(FORMATS)) {
            if (format.device !== deviceName) continue;
            const dir = path.join(OUT_DIR, lang, formatName);
            fs.mkdirSync(dir, { recursive: true });
            const file = path.join(dir, `${number}-${screen.name}.png`);
            await composeScreenshot(browser, shotFile, format, device, screen.theme, caption, file);
            console.log(path.relative(PROJECT_ROOT, file));
          }
        }
      }
      if (options.screens.includes(FEATURE_GRAPHIC.name)) {
        const dir = path.join(OUT_DIR, lang, FEATURE_GRAPHIC.dir);
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, `${FEATURE_GRAPHIC.name}.png`);
        await composeFeatureGraphic(browser, lang, file);
        console.log(path.relative(PROJECT_ROOT, file));
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  if (refused.size > 0) {
    console.log("Requests refused (answered by nothing here):");
    for (const request of refused) console.log(`  ${request}`);
  }
}

// Run as a command; imported (an investigation of a screen), it exports its parts only.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export {
  DEVICES,
  LANGUAGES,
  SCREENS,
  addArticles,
  navigate,
  openAccount,
  openWorld,
  serve,
  t,
  typeAmount
};
