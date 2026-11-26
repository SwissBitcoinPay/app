import i18n from "@/i18n";
import { LANGUAGES } from "@/i18n/languages";

import {
  SDK_LANGUAGES,
  SHOP_PLATFORMS,
  isIntegrationOptionId,
  sourceCodeUrl
} from "@/config/integration-catalog";
import {
  GRANDNODE_PLUGIN_ARCHIVE,
  GRANDNODE_PLUGIN_URL
} from "@/features/integrations/guide-grandnode";
import {
  WOOCOMMERCE_PLUGIN_URL,
  WOOCOMMERCE_PLUGIN_ZIP
} from "@/features/integrations/guide-woocommerce";
import {
  NOPCOMMERCE_PLUGIN_ARCHIVE,
  NOPCOMMERCE_PLUGIN_URL
} from "@/features/integrations/guide-nopcommerce";
import {
  SMARTSTORE_PLUGIN_PACKAGE,
  SMARTSTORE_PLUGIN_URL
} from "@/features/integrations/guide-smartstore";
import {
  PRESTASHOP_MODULE_URL,
  PRESTASHOP_MODULE_ZIP
} from "@/features/integrations/guide-prestashop";
import { MAGENTO_MODULE_URL } from "@/features/integrations/guide-magento";
import { GUIDES, type GuideStep } from "@/features/integrations/guides";
import { checkedFile } from "@/features/integrations/plugin-file-check";
import { WIX_PLUGIN, wixPluginOf } from "@/features/integrations/wix-plugin";
import {
  INTEGRATION_LOGOS,
  INTEGRATION_LOGOS_DARK,
  integrationLogo,
  scopeLogoIds
} from "@/features/integrations/logos";
import { isPlatform } from "@/lib/team/roster";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

// Jest makes every image the number 1: each screenshot here is its file's path instead, under
// GUIDE_IMAGES, to be read.
jest.mock("../../assets/images/guides/bebop/menu.png", () => "bebop/menu.png");
jest.mock("../../assets/images/guides/bebop/key.png", () => "bebop/key.png");
jest.mock("../../assets/images/guides/bebop/test.png", () => "bebop/test.png");
jest.mock("../../assets/images/guides/bebop/preferences.png", () => "bebop/preferences.png");
jest.mock("../../assets/images/guides/bebop/checkout.png", () => "bebop/checkout.png");
jest.mock("../../assets/images/guides/pretix/menu.png", () => "pretix/menu.png");
jest.mock("../../assets/images/guides/pretix/plugins.png", () => "pretix/plugins.png");
jest.mock("../../assets/images/guides/pretix/payment.png", () => "pretix/payment.png");
jest.mock("../../assets/images/guides/pretix/key.png", () => "pretix/key.png");
jest.mock("../../assets/images/guides/pretix/channels.png", () => "pretix/channels.png");
jest.mock("../../assets/images/guides/pretix/checkout.png", () => "pretix/checkout.png");
jest.mock("../../assets/images/guides/nopcommerce/menu.png", () => "nopcommerce/menu.png");
jest.mock("../../assets/images/guides/nopcommerce/upload.png", () => "nopcommerce/upload.png");
jest.mock("../../assets/images/guides/nopcommerce/restart.png", () => "nopcommerce/restart.png");
jest.mock("../../assets/images/guides/nopcommerce/install.png", () => "nopcommerce/install.png");
jest.mock(
  "../../assets/images/guides/nopcommerce/configure.png",
  () => "nopcommerce/configure.png"
);
jest.mock("../../assets/images/guides/nopcommerce/key.png", () => "nopcommerce/key.png");
jest.mock("../../assets/images/guides/nopcommerce/checkout.png", () => "nopcommerce/checkout.png");
jest.mock("../../assets/images/guides/grandnode/menu.png", () => "grandnode/menu.png");
jest.mock("../../assets/images/guides/grandnode/upload.png", () => "grandnode/upload.png");
jest.mock("../../assets/images/guides/grandnode/install.png", () => "grandnode/install.png");
jest.mock("../../assets/images/guides/grandnode/configure.png", () => "grandnode/configure.png");
jest.mock("../../assets/images/guides/grandnode/key.png", () => "grandnode/key.png");
jest.mock("../../assets/images/guides/grandnode/checkout.png", () => "grandnode/checkout.png");
jest.mock("../../assets/images/guides/smartstore/menu.png", () => "smartstore/menu.png");
jest.mock("../../assets/images/guides/smartstore/upload.png", () => "smartstore/upload.png");
jest.mock("../../assets/images/guides/smartstore/reload.png", () => "smartstore/reload.png");
jest.mock("../../assets/images/guides/smartstore/install.png", () => "smartstore/install.png");
jest.mock("../../assets/images/guides/smartstore/execute.png", () => "smartstore/execute.png");
jest.mock("../../assets/images/guides/smartstore/configure.png", () => "smartstore/configure.png");
jest.mock("../../assets/images/guides/smartstore/key.png", () => "smartstore/key.png");
jest.mock("../../assets/images/guides/smartstore/activate.png", () => "smartstore/activate.png");
jest.mock("../../assets/images/guides/smartstore/checkout.png", () => "smartstore/checkout.png");
jest.mock("../../assets/images/guides/woocommerce/upload.png", () => "woocommerce/upload.png");
jest.mock("../../assets/images/guides/wix/dev-mode.png", () => "wix/dev-mode.png");
jest.mock("../../assets/images/guides/wix/packages.png", () => "wix/packages.png");
jest.mock("../../assets/images/guides/wix/install.png", () => "wix/install.png");
jest.mock("../../assets/images/guides/wix/files.png", () => "wix/files.png");
jest.mock("../../assets/images/guides/wix/secrets.png", () => "wix/secrets.png");
jest.mock("../../assets/images/guides/wix/save.png", () => "wix/save.png");
jest.mock("../../assets/images/guides/wix/publish.png", () => "wix/publish.png");
jest.mock("../../assets/images/guides/wix/status.png", () => "wix/status.png");
jest.mock("../../assets/images/guides/wix/connect.png", () => "wix/connect.png");
jest.mock("../../assets/images/guides/wix/check.png", () => "wix/check.png");
jest.mock("../../assets/images/guides/woocommerce/activate.png", () => "woocommerce/activate.png");
jest.mock("../../assets/images/guides/woocommerce/settings.png", () => "woocommerce/settings.png");
jest.mock("../../assets/images/guides/woocommerce/key.png", () => "woocommerce/key.png");
jest.mock("../../assets/images/guides/woocommerce/checkout.png", () => "woocommerce/checkout.png");
jest.mock("../../assets/images/guides/prestashop/upload.png", () => "prestashop/upload.png");
jest.mock("../../assets/images/guides/prestashop/drop.png", () => "prestashop/drop.png");
jest.mock("../../assets/images/guides/prestashop/installed.png", () => "prestashop/installed.png");
jest.mock("../../assets/images/guides/prestashop/key.png", () => "prestashop/key.png");
jest.mock("../../assets/images/guides/prestashop/cron.png", () => "prestashop/cron.png");
jest.mock("../../assets/images/guides/prestashop/checkout.png", () => "prestashop/checkout.png");
jest.mock("../../assets/images/guides/magento/settings.png", () => "magento/settings.png");
jest.mock("../../assets/images/guides/magento/key.png", () => "magento/key.png");
jest.mock("../../assets/images/guides/magento/checkout.png", () => "magento/checkout.png");

// Node's types are not loaded (see app-config.test.ts): only what this test needs is typed here.
declare const __dirname: string;
const { readdirSync, readFileSync, statSync } = jest.requireActual<{
  readdirSync(dir: string, options: { recursive: true }): string[];
  readFileSync(file: string): Uint8Array;
  statSync(file: string): { isFile(): boolean };
}>("fs");
const { join } = jest.requireActual<{ join(...segments: string[]): string }>("path");

const OPTIONS = [...SHOP_PLATFORMS, ...SDK_LANGUAGES];
const GUIDE_IMAGES = join(__dirname, "../../assets/images/guides");
/** The copy of a Wix plugin release Jest reads (jest.config.js): the app's is fetched at bundling. */
const WIX_FILES = join(__dirname, "../../jest/wix-plugin");
const WIX_RELEASE = JSON.parse(
  new TextDecoder().decode(readFileSync(join(WIX_FILES, "release.json")))
) as { version: string; files: { name: string; sha256: string }[] };

/** Every file under a directory, as paths relative to it. */
function filesIn(dir: string): string[] {
  return readdirSync(dir, { recursive: true })
    .filter((path) => statSync(join(dir, path)).isFile())
    .sort();
}

/** A PNG's size in pixels, from its header (IHDR, the first chunk). */
function pngSize(file: string): { width: number; height: number } {
  const png = readFileSync(file);
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(String.fromCharCode(...png.subarray(12, 16))).toBe("IHDR");
  const header = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: header.getUint32(16), height: header.getUint32(20) };
}

/** Each guide's steps in each language of the app. */
function guidesInEveryLanguage(): (readonly [string, string, readonly GuideStep[]])[] {
  return LANGUAGES.flatMap((language) =>
    Object.entries(GUIDES).flatMap(([platform, guide]) =>
      guide ? [[platform, language, guide(i18n.getFixedT(language))] as const] : []
    )
  );
}

describe('the "New integration" catalogue', () => {
  it("names each shop and language once", () => {
    expect(new Set(OPTIONS.map((option) => option.id)).size).toBe(OPTIONS.length);
    expect(new Set(OPTIONS.map((option) => option.name)).size).toBe(OPTIONS.length);
    expect(SHOP_PLATFORMS.map((platform) => platform.name)).toEqual([
      "WooCommerce",
      "Wix",
      "be-BOP",
      "pretix",
      "GrandNode",
      "nopCommerce",
      "Smartstore",
      "PrestaShop",
      "Magento"
    ]);
    expect(SDK_LANGUAGES.map((language) => language.name)).toEqual([
      "Node.js",
      "Python",
      "PHP",
      "Rust",
      "Java",
      ".NET",
      "Ruby",
      "Go"
    ]);
  });

  it("never changes an option's id: each integration's record names the one it was made from", () => {
    expect(OPTIONS.map((option) => option.id)).toEqual([
      "woocommerce",
      "wix",
      "bebop",
      "pretix",
      "grandnode",
      "nopcommerce",
      "smartstore",
      "prestashop",
      "magento",
      "node",
      "python",
      "php",
      "rust",
      "java",
      "dotnet",
      "ruby",
      "go"
    ]);
    // Each one a platform the roster's records accept, known as an option of this build.
    for (const { id } of OPTIONS) {
      expect([id, isPlatform(id), isIntegrationOptionId(id)]).toEqual([id, true, true]);
    }
    // Anything else draws the code icon: a newer app's option, the names every object has.
    for (const id of ["shopify", "Node", "constructor", "toString", "__proto__", ""]) {
      expect([id, isIntegrationOptionId(id)]).toEqual([id, false]);
    }
  });

  it("offers a language only with its published package, on its registry's https page", () => {
    for (const { package: published } of SDK_LANGUAGES) {
      if (!published) continue;
      const url = new URL(published.url);
      expect(url.protocol).toBe("https:");
      expect([published.site, `www.${published.site}`]).toContain(url.hostname);
      expect(published.name).not.toBe("");
    }
    // The ones published (npm, PyPI, Packagist, NuGet, Go's module proxy: its GitHub release;
    // maven.sattle.me, RubyGems.org, crates.io): every language.
    expect(SDK_LANGUAGES.filter((language) => language.package)).toEqual([
      {
        id: "node",
        name: "Node.js",
        repository: "sattleme/checkout-node",
        package: {
          site: "npmjs.com",
          name: "@sattleme/checkout",
          url: "https://www.npmjs.com/package/@sattleme/checkout"
        }
      },
      {
        id: "python",
        name: "Python",
        repository: "sattleme/checkout-python",
        package: {
          site: "pypi.org",
          name: "sattleme-checkout",
          url: "https://pypi.org/project/sattleme-checkout/"
        }
      },
      {
        id: "php",
        name: "PHP",
        repository: "sattleme/checkout-php",
        package: {
          site: "packagist.org",
          name: "sattleme/checkout",
          url: "https://packagist.org/packages/sattleme/checkout"
        }
      },
      {
        id: "rust",
        name: "Rust",
        repository: "sattleme/checkout-rust",
        package: {
          site: "crates.io",
          name: "sattleme-checkout",
          url: "https://crates.io/crates/sattleme-checkout"
        }
      },
      {
        id: "java",
        name: "Java",
        repository: "sattleme/checkout-java",
        package: {
          site: "maven.sattle.me",
          name: "me.sattle:checkout",
          url: "https://maven.sattle.me/"
        }
      },
      {
        id: "dotnet",
        name: ".NET",
        repository: "sattleme/checkout-dotnet",
        package: {
          site: "nuget.org",
          name: "Sattleme.Checkout",
          url: "https://www.nuget.org/packages/Sattleme.Checkout"
        }
      },
      {
        id: "ruby",
        name: "Ruby",
        repository: "sattleme/checkout-ruby",
        package: {
          site: "rubygems.org",
          name: "sattleme-checkout",
          url: "https://rubygems.org/gems/sattleme-checkout"
        }
      },
      {
        id: "go",
        name: "Go",
        repository: "sattleme/checkout-go",
        package: {
          site: "github.com",
          name: "github.com/sattleme/checkout-go",
          url: "https://github.com/sattleme/checkout-go/releases/latest"
        }
      }
    ]);
  });

  it("links each option to its source code, a repository of sattleme on GitHub", () => {
    expect(Object.fromEntries(OPTIONS.map(({ id }) => [id, sourceCodeUrl(id)]))).toEqual({
      woocommerce: "https://github.com/sattleme/checkout-woocommerce",
      wix: "https://github.com/sattleme/checkout-wix",
      // Its processor is part of be-BOP itself.
      bebop: null,
      pretix: "https://github.com/sattleme/checkout-pretix",
      grandnode: "https://github.com/sattleme/checkout-grandnode",
      nopcommerce: "https://github.com/sattleme/checkout-nopcommerce",
      smartstore: "https://github.com/sattleme/checkout-smartstore",
      prestashop: "https://github.com/sattleme/checkout-prestashop",
      magento: "https://github.com/sattleme/checkout-magento",
      node: "https://github.com/sattleme/checkout-node",
      python: "https://github.com/sattleme/checkout-python",
      php: "https://github.com/sattleme/checkout-php",
      rust: "https://github.com/sattleme/checkout-rust",
      java: "https://github.com/sattleme/checkout-java",
      dotnet: "https://github.com/sattleme/checkout-dotnet",
      ruby: "https://github.com/sattleme/checkout-ruby",
      go: "https://github.com/sattleme/checkout-go"
    });
    // The very repository whose releases a guide downloads the plugin from.
    const shop = (id: string) => SHOP_PLATFORMS.find((platform) => platform.id === id)?.repository;
    for (const [id, file] of [
      ["woocommerce", WOOCOMMERCE_PLUGIN_ZIP],
      ["grandnode", GRANDNODE_PLUGIN_ARCHIVE],
      ["nopcommerce", NOPCOMMERCE_PLUGIN_ARCHIVE],
      ["smartstore", SMARTSTORE_PLUGIN_PACKAGE],
      ["prestashop", PRESTASHOP_MODULE_ZIP]
    ] as const) {
      expect([id, shop(id)]).toEqual([id, file.repository]);
    }
  });

  it("draws each one's logo from an SVG text SvgXml reads, with nothing to load", () => {
    expect(Object.keys(INTEGRATION_LOGOS).sort()).toEqual(
      OPTIONS.map((option) => option.id).sort()
    );
    const logos = [
      ...Object.entries(INTEGRATION_LOGOS),
      ...Object.entries(INTEGRATION_LOGOS_DARK).map(([id, svg]) => [`${id} (dark)`, svg ?? ""])
    ];
    for (const [id, svg] of logos) {
      const viewBox = /^<svg xmlns='http:\/\/www\.w3\.org\/2000\/svg' viewBox='([^']+)'>/.exec(svg);
      expect([id, viewBox?.[1].split(" ").map(Number).every(Number.isFinite)]).toEqual([id, true]);
      expect(svg.endsWith("</svg>")).toBe(true);
      // No stylesheet nor class (SvgXml reads neither), no script, link or handler.
      expect([id, /<style|class=|<script|href|\son\w+=/i.test(svg)]).toEqual([id, false]);
      // Each paint it refers to is defined in it.
      for (const [, ref] of svg.matchAll(/url\(#([^)]+)\)/g)) {
        expect(svg).toContain(`id='${ref}'`);
      }
    }
  });

  // On the web, every SVG of the page shares one namespace of ids: each drawing scopes its own.
  it("gives each drawing of a logo ids of its own, every reference kept inside it", () => {
    const logos = [
      ...Object.entries(INTEGRATION_LOGOS),
      ...Object.entries(INTEGRATION_LOGOS_DARK).map(([id, svg]) => [`${id} (dark)`, svg ?? ""])
    ];
    const ids = (svg: string) => [...svg.matchAll(/ id='([^']+)'/g)].map(([, id]) => id);
    for (const [id, svg] of logos) {
      const [first, second] = [scopeLogoIds(svg, "_r_1_"), scopeLogoIds(svg, "_r_2_")];
      if (ids(svg).length === 0) {
        expect([id, first]).toEqual([id, svg]);
        continue;
      }
      expect([id, ids(first)]).toEqual([id, ids(svg).map((name) => `${name}-_r_1_`)]);
      // Nothing else of the drawing changes.
      expect([id, first.replaceAll("-_r_1_", "")]).toEqual([id, svg]);
      expect([id, ids(first).filter((name) => ids(second).includes(name))]).toEqual([id, []]);
      for (const [, ref] of first.matchAll(/url\(#([^)]+)\)/g)) {
        expect([id, ids(first).includes(ref)]).toEqual([id, true]);
      }
    }
    // GrandNode's gradients: the logo these ids are for.
    expect(ids(INTEGRATION_LOGOS.grandnode)).toEqual(["gl-bar", "gl-fold"]);
  });

  // The dark theme: a brand's own version for dark backgrounds where it has one, the
  // colour logo otherwise, and the colour logo always in the light theme.
  it("draws each logo's own dark version in the dark theme, its colours elsewhere", () => {
    expect(Object.keys(INTEGRATION_LOGOS_DARK).sort()).toEqual(
      ["bebop", "dotnet", "pretix", "rust", "wix", "woocommerce"].sort()
    );
    for (const { id } of OPTIONS) {
      expect(integrationLogo(id, "light")).toBe(INTEGRATION_LOGOS[id]);
      expect(integrationLogo(id, "dark")).toBe(INTEGRATION_LOGOS_DARK[id] ?? INTEGRATION_LOGOS[id]);
    }
    // Never a black mark in the dark theme.
    for (const svg of Object.values(INTEGRATION_LOGOS_DARK)) {
      expect(svg).not.toMatch(/fill='#0{3}(0{3})?'/i);
    }
  });

  it("puts exactly one key step in each guide, its texts in every language, its links in https", () => {
    for (const [platform, language, steps] of guidesInEveryLanguage()) {
      const where = [platform, language];
      expect([...where, steps.filter((step) => step.kind === "key").length]).toEqual([...where, 1]);
      for (const step of steps) {
        if (step.kind === "files") {
          const texts = [
            step.title,
            step.body,
            ...step.files.flatMap((file) => [file.where, file.how]),
            ...(step.image ? [step.image.label] : [])
          ];
          for (const text of texts) {
            expect([...where, text]).not.toEqual([...where, ""]);
            expect([...where, text.includes("integrations.")]).toEqual([...where, false]);
            expect([...where, text.includes("{{")]).toEqual([...where, false]);
          }
          continue;
        }
        if (step.kind !== "text") continue;
        // A text missing from French would show as its key (the other languages are typed after it).
        for (const text of [step.title, step.body, step.link?.label, step.image?.label]) {
          if (text === undefined) continue;
          expect([...where, text]).not.toEqual([...where, ""]);
          expect([...where, text.startsWith("integrations.")]).toEqual([...where, false]);
        }
        if (step.code !== undefined) expect(step.code.trim()).not.toBe("");
        if (step.link) expect(new URL(step.link.url).protocol).toBe("https:");
      }
    }
  });

  it("draws each guide's screenshots at their PNG's own size, and bundles no other", () => {
    const used = new Set<string>();
    for (const [platform, language, steps] of guidesInEveryLanguage()) {
      for (const step of steps) {
        if (step.kind === "key" || !step.image) continue;
        const { source, width, height } = step.image;
        expect(typeof source).toBe("string");
        expect([platform, language, source, pngSize(join(GUIDE_IMAGES, String(source)))]).toEqual([
          platform,
          language,
          source,
          { width, height }
        ]);
        // Taken at 2×: drawn at half its pixels at most, whole pixels.
        expect([source, width % 2, height % 2]).toEqual([source, 0, 0]);
        used.add(String(source));
      }
    }
    expect([...used].sort()).toEqual(filesIn(GUIDE_IMAGES));
  });

  it("guides be-BOP's setup from its administration: sattle.me is one of its processors", () => {
    const steps = GUIDES.bebop!(i18n.getFixedT("en"));
    expect(steps.map((step) => (step.kind === "key" ? "key" : step.title))).toEqual([
      "Open sattle.me's settings",
      "key",
      "Paste the key and save",
      "Test the connection",
      "Put sattle.me first",
      "Check your shop"
    ]);
    // sattle.me comes with be-BOP itself: nothing to type, nothing to download, in any language.
    for (const language of LANGUAGES) {
      for (const step of GUIDES.bebop!(i18n.getFixedT(language))) {
        if (step.kind !== "text") continue;
        expect([language, step.title, step.code, step.link]).toEqual([
          language,
          step.title,
          undefined,
          undefined
        ]);
      }
    }
    // Each step in be-BOP's administration or shop shows be-BOP's screen.
    expect(
      steps.map((step) => (step.kind === "text" && step.image ? step.image.source : null))
    ).toEqual([
      "bebop/menu.png",
      null,
      "bebop/key.png",
      "bebop/test.png",
      "bebop/preferences.png",
      "bebop/checkout.png"
    ]);
  });

  it("guides pretix's setup from its backend, without a command, the key once its field shows", () => {
    const steps = GUIDES.pretix!(i18n.getFixedT("en"));
    expect(steps.map((step) => (step.kind === "key" ? "key" : step.title))).toEqual([
      "Open your event's plugins",
      "Enable the plugin",
      "Open its settings",
      "key",
      "Paste the key and save",
      "Choose the sales channels",
      "Check your shop"
    ]);
    // The plugin comes from pretix's marketplace: nothing to type, nothing to download.
    for (const step of steps) {
      if (step.kind !== "text") continue;
      expect([step.title, step.code, step.link]).toEqual([step.title, undefined, undefined]);
    }
    // Each step in pretix's backend or shop shows pretix's screen.
    expect(
      steps.map((step) => (step.kind === "text" && step.image ? step.image.source : null))
    ).toEqual([
      "pretix/menu.png",
      "pretix/plugins.png",
      "pretix/payment.png",
      null,
      "pretix/key.png",
      "pretix/channels.png",
      "pretix/checkout.png"
    ]);
  });

  it("guides nopCommerce's setup from its administration: the archive downloaded, uploaded, installed", () => {
    const steps = GUIDES.nopcommerce!(i18n.getFixedT("en"));
    expect(steps.map((step) => (step.kind === "key" ? "key" : step.title))).toEqual([
      "Download the plugin",
      "Open the local plugins",
      "Upload the archive",
      "Restart nopCommerce",
      "Install the plugin",
      "Open its settings",
      "key",
      "Paste the key and save",
      "Check your shop",
      "Exclude Bitcoin from auto-canceling"
    ]);
    // The archive itself, from the plugin's latest release on GitHub, its version named, in every
    // language; the marketplace's page until GitHub said which; nothing to type on the server.
    for (const language of LANGUAGES) {
      const [download, ...others] = GUIDES.nopcommerce!(i18n.getFixedT(language));
      const link = download.kind === "text" ? download.link : undefined;
      expect([language, link?.url, link?.release?.file]).toEqual([
        language,
        NOPCOMMERCE_PLUGIN_URL,
        NOPCOMMERCE_PLUGIN_ARCHIVE
      ]);
      expect([language, link?.release?.label("1.2.3")]).toEqual([
        language,
        expect.stringContaining("1.2.3")
      ]);
      for (const step of others) {
        if (step.kind !== "text") continue;
        expect([language, step.title, step.link, step.code]).toEqual([
          language,
          step.title,
          undefined,
          undefined
        ]);
      }
    }
    expect(new URL(NOPCOMMERCE_PLUGIN_URL).hostname).toBe("www.nopcommerce.com");
    // Each step in nopCommerce's administration or shop shows nopCommerce's screen.
    expect(
      steps.map((step) => (step.kind === "text" && step.image ? step.image.source : null))
    ).toEqual([
      null,
      "nopcommerce/menu.png",
      "nopcommerce/upload.png",
      "nopcommerce/restart.png",
      "nopcommerce/install.png",
      "nopcommerce/configure.png",
      null,
      "nopcommerce/key.png",
      "nopcommerce/checkout.png",
      null
    ]);
  });

  it("guides GrandNode's setup from its administration: the archive downloaded, uploaded, installed", () => {
    const steps = GUIDES.grandnode!(i18n.getFixedT("en"));
    expect(steps.map((step) => (step.kind === "key" ? "key" : step.title))).toEqual([
      "Download the plugin",
      "Open the local plugins",
      "Upload the archive",
      "Install the plugin",
      "Open its settings",
      "key",
      "Paste the key and save",
      "Check your shop"
    ]);
    // The archive itself, from the plugin's latest release on GitHub, its version named, in every
    // language; the release's page until GitHub said which; nothing to type on the server.
    for (const language of LANGUAGES) {
      const [download, ...others] = GUIDES.grandnode!(i18n.getFixedT(language));
      const link = download.kind === "text" ? download.link : undefined;
      expect([language, link?.url, link?.release?.file]).toEqual([
        language,
        GRANDNODE_PLUGIN_URL,
        GRANDNODE_PLUGIN_ARCHIVE
      ]);
      expect([language, link?.release?.label("1.2.3")]).toEqual([
        language,
        expect.stringContaining("1.2.3")
      ]);
      // The archive's name, which the merchant keeps as it is, said whichever link shows.
      expect([language, download.kind === "text" && download.body]).toEqual([
        language,
        expect.stringContaining("Payments.Sattleme-….zip")
      ]);
      for (const step of others) {
        if (step.kind !== "text") continue;
        expect([language, step.title, step.link, step.code]).toEqual([
          language,
          step.title,
          undefined,
          undefined
        ]);
      }
    }
    const url = new URL(GRANDNODE_PLUGIN_URL);
    expect([url.hostname, url.pathname]).toEqual([
      "github.com",
      "/sattleme/checkout-grandnode/releases/latest"
    ]);
    // Each step in GrandNode's administration or shop shows GrandNode's screen.
    expect(
      steps.map((step) => (step.kind === "text" && step.image ? step.image.source : null))
    ).toEqual([
      null,
      "grandnode/menu.png",
      "grandnode/upload.png",
      "grandnode/install.png",
      "grandnode/configure.png",
      null,
      "grandnode/key.png",
      "grandnode/checkout.png"
    ]);
  });
  it("guides Smartstore's setup from its administration: the package from GitHub, uploaded, installed, activated", () => {
    const steps = GUIDES.smartstore!(i18n.getFixedT("en"));
    expect(steps.map((step) => (step.kind === "key" ? "key" : step.title))).toEqual([
      "Download the plugin",
      "Open the plugins",
      "Upload the package",
      "Reload the list of plugins",
      "Install the plugin",
      "Run the installation",
      "Open its settings",
      "key",
      "Paste the key and save",
      "Activate the payment method",
      "Set your shop's time zone",
      "Check your shop"
    ]);
    // The package itself, from the plugin's latest release on GitHub, its version named, in every
    // language; the release's page until GitHub said which; nothing to type on the server.
    for (const language of LANGUAGES) {
      const [download, ...others] = GUIDES.smartstore!(i18n.getFixedT(language));
      const link = download.kind === "text" ? download.link : undefined;
      expect([language, link?.url, link?.release?.file]).toEqual([
        language,
        SMARTSTORE_PLUGIN_URL,
        SMARTSTORE_PLUGIN_PACKAGE
      ]);
      expect([language, link?.release?.label("1.2.3")]).toEqual([
        language,
        expect.stringContaining("1.2.3")
      ]);
      for (const step of others) {
        if (step.kind !== "text") continue;
        expect([language, step.title, step.link, step.code]).toEqual([
          language,
          step.title,
          undefined,
          undefined
        ]);
      }
    }
    const url = new URL(SMARTSTORE_PLUGIN_URL);
    expect([url.hostname, url.pathname]).toEqual([
      "github.com",
      "/sattleme/checkout-smartstore/releases/latest"
    ]);
    // Each step in Smartstore's administration or shop shows Smartstore's screen; the time zone's
    // is a setting among many, named in its text.
    expect(
      steps.map((step) => (step.kind === "text" && step.image ? step.image.source : null))
    ).toEqual([
      null,
      "smartstore/menu.png",
      "smartstore/upload.png",
      "smartstore/reload.png",
      "smartstore/install.png",
      "smartstore/execute.png",
      "smartstore/configure.png",
      null,
      "smartstore/key.png",
      "smartstore/activate.png",
      null,
      "smartstore/checkout.png"
    ]);
  });
  it("guides WooCommerce's setup from WordPress's administration: the ZIP from GitHub, uploaded, activated", () => {
    const steps = GUIDES.woocommerce!(i18n.getFixedT("en"));
    expect(steps.map((step) => (step.kind === "key" ? "key" : step.title))).toEqual([
      "Download the plugin",
      "Upload the file",
      "Activate the plugin",
      "Open its settings",
      "key",
      "Paste the key and save",
      "Check your shop"
    ]);
    // The ZIP itself, from the plugin's latest release on GitHub, its version named, in every
    // language; the release's page until GitHub said which; nothing to type on the server.
    for (const language of LANGUAGES) {
      const [download, ...others] = GUIDES.woocommerce!(i18n.getFixedT(language));
      const link = download.kind === "text" ? download.link : undefined;
      expect([language, link?.url, link?.release?.file]).toEqual([
        language,
        WOOCOMMERCE_PLUGIN_URL,
        WOOCOMMERCE_PLUGIN_ZIP
      ]);
      expect([language, link?.release?.label("1.2.3")]).toEqual([
        language,
        expect.stringContaining("1.2.3")
      ]);
      for (const step of others) {
        if (step.kind !== "text") continue;
        expect([language, step.title, step.link, step.code]).toEqual([
          language,
          step.title,
          undefined,
          undefined
        ]);
      }
    }
    const url = new URL(WOOCOMMERCE_PLUGIN_URL);
    expect([url.hostname, url.pathname]).toEqual([
      "github.com",
      "/sattleme/checkout-woocommerce/releases/latest"
    ]);
    // Each step in WordPress's administration or the shop shows its screen.
    expect(
      steps.map((step) => (step.kind === "text" && step.image ? step.image.source : null))
    ).toEqual([
      null,
      "woocommerce/upload.png",
      "woocommerce/activate.png",
      "woocommerce/settings.png",
      null,
      "woocommerce/key.png",
      "woocommerce/checkout.png"
    ]);
  });
  it("guides PrestaShop's setup from its back office: the ZIP from GitHub, uploaded, configured, its cron", () => {
    const steps = GUIDES.prestashop!(i18n.getFixedT("en"));
    expect(steps.map((step) => (step.kind === "key" ? "key" : step.title))).toEqual([
      "Download the module",
      "Open the Module Manager",
      "Upload the file",
      "Open its settings",
      "key",
      "Paste the key and save",
      "Set up the background checks",
      "Check your shop"
    ]);
    // The ZIP itself, from the module's latest release on GitHub, its version named, in every
    // language; the release's page until GitHub said which; nothing to type on the server here
    // (the cron's line is the module's settings page's, with its shop's secret URL).
    for (const language of LANGUAGES) {
      const [download, ...others] = GUIDES.prestashop!(i18n.getFixedT(language));
      const link = download.kind === "text" ? download.link : undefined;
      expect([language, link?.url, link?.release?.file]).toEqual([
        language,
        PRESTASHOP_MODULE_URL,
        PRESTASHOP_MODULE_ZIP
      ]);
      expect([language, link?.release?.label("1.2.3")]).toEqual([
        language,
        expect.stringContaining("1.2.3")
      ]);
      for (const step of others) {
        if (step.kind !== "text") continue;
        expect([language, step.title, step.link, step.code]).toEqual([
          language,
          step.title,
          undefined,
          undefined
        ]);
      }
    }
    // Each release names its ZIP sattleme.zip, whatever its version.
    expect([PRESTASHOP_MODULE_ZIP.name("1.0.0"), PRESTASHOP_MODULE_ZIP.name("2.3.4")]).toEqual([
      "sattleme.zip",
      "sattleme.zip"
    ]);
    const url = new URL(PRESTASHOP_MODULE_URL);
    expect([url.hostname, url.pathname]).toEqual([
      "github.com",
      "/sattleme/checkout-prestashop/releases/latest"
    ]);
    // Each step in PrestaShop's back office or the shop shows its screen.
    expect(
      steps.map((step) => (step.kind === "text" && step.image ? step.image.source : null))
    ).toEqual([
      null,
      "prestashop/upload.png",
      "prestashop/drop.png",
      "prestashop/installed.png",
      null,
      "prestashop/key.png",
      "prestashop/cron.png",
      "prestashop/checkout.png"
    ]);
  });
  it("guides Magento's setup: Composer from Packagist on the server, the admin's settings, its cron", () => {
    const steps = GUIDES.magento!(i18n.getFixedT("en"));
    expect(steps.map((step) => (step.kind === "key" ? "key" : step.title))).toEqual([
      "Install the module",
      "Open its settings",
      "key",
      "Paste the key and save",
      "Check Magento's cron",
      "Check your shop"
    ]);
    // Magento's own commands, the same in every language: Composer from Packagist, the module
    // enabled, then Magento's cron, set up where it is not yet; the module's page on Packagist.
    for (const language of LANGUAGES) {
      const [install, , , , cron] = GUIDES.magento!(i18n.getFixedT(language));
      expect([
        language,
        install.kind === "text" ? install.code : null,
        install.kind === "text" ? install.link?.url : null,
        cron.kind === "text" ? cron.code : null
      ]).toEqual([
        language,
        [
          "composer require sattleme/module-payment",
          "bin/magento module:enable Sattleme_Payment",
          "bin/magento setup:upgrade",
          "bin/magento setup:di:compile",
          "bin/magento setup:static-content:deploy",
          "bin/magento cache:flush"
        ].join("\n"),
        MAGENTO_MODULE_URL,
        "bin/magento cron:install"
      ]);
    }
    const url = new URL(MAGENTO_MODULE_URL);
    expect([url.protocol, url.hostname, url.pathname]).toEqual([
      "https:",
      "packagist.org",
      "/packages/sattleme/module-payment"
    ]);
    // Each step in Magento's admin or the shop shows its screen.
    expect(
      steps.map((step) => (step.kind === "text" && step.image ? step.image.source : null))
    ).toEqual([
      null,
      "magento/settings.png",
      null,
      "magento/key.png",
      null,
      "magento/checkout.png"
    ]);
  });
  it("guides Wix's setup in the site's editor, all of it in the app: two packages, the six files copied, the secrets, then the connection", () => {
    const steps = GUIDES.wix!(i18n.getFixedT("en"));
    expect(steps.map((step) => (step.kind === "key" ? "key" : step.title))).toEqual([
      "Open your site's code",
      "Open the packages",
      "Install two Wix packages",
      "Make the 6 files",
      "Open the Secrets Manager",
      "key",
      "Save the key",
      "Publish once",
      "Open the status page",
      "Connect the payment",
      "Test a payment"
    ]);
    const plugin = WIX_PLUGIN!;
    expect(plugin.version).toBe(WIX_RELEASE.version);
    // Each step shows its screen, in Wix's English interface or the plugin's own pages; not the
    // key's, which is the app's.
    expect(
      steps.map((step) => (step.kind !== "key" && step.image ? step.image.source : null))
    ).toEqual([
      "wix/dev-mode.png",
      "wix/packages.png",
      "wix/install.png",
      "wix/files.png",
      "wix/secrets.png",
      null,
      "wix/save.png",
      "wix/publish.png",
      "wix/status.png",
      "wix/connect.png",
      "wix/check.png"
    ]);
    for (const language of LANGUAGES) {
      const all = GUIDES.wix!(i18n.getFixedT(language));
      // Everything is said in the app: no page outside it.
      expect([language, all.filter((step) => step.kind === "text" && step.link).length]).toEqual([
        language,
        0
      ]);
      const files = all.find((step) => step.kind === "files");
      expect(files?.kind).toBe("files");
      if (files?.kind !== "files") continue;
      // Each file of the release, in the order they are made, with its hash; the three a site
      // may have already say what to do instead of replacing the site's own: the code pasted
      // under it, the job added to its list.
      expect(files.files.map((file) => [file.name, file.source, file.sha256])).toEqual(
        plugin.files.map((file) => [file.name, file.source, file.sha256])
      );
      const t = i18n.getFixedT(language);
      const said = (key: "sharedCode" | "sharedJobs") =>
        files.files
          .filter((file) =>
            file.how.includes(t(`integrations.guides.wix.files.${key}`, { name: file.name }))
          )
          .map((file) => file.name);
      expect([language, said("sharedCode"), said("sharedJobs")]).toEqual([
        language,
        ["http-functions.js", "events.js"],
        ["jobs.config"]
      ]);
      // The version the app copies, named where the guide says what is pasted and what the status
      // page shows.
      expect([language, files.body.includes(WIX_RELEASE.version)]).toEqual([language, true]);
    }
  });

  it("takes the Wix plugin's version and hashes from its release.json, in the guide's order, or offers no guide", () => {
    expect(WIX_PLUGIN!.files.map((file) => [file.name, file.sha256])).toEqual(
      WIX_RELEASE.files.map((file) => [file.name, file.sha256])
    );
    expect(WIX_PLUGIN!.files.map((file) => file.name)).toEqual([
      "sattleme-plugin.js",
      "http-functions.js",
      "events.js",
      "jobs.config",
      "sattlemeCheckout.js",
      "sattlemeCheckout-config.js"
    ]);
    // The copy Jest reads is a release's files, which match the hashes beside them.
    for (const file of WIX_RELEASE.files) {
      const bytes = readFileSync(join(WIX_FILES, `${file.name}.txt`));
      expect([file.name, bytesToHex(sha256(bytes))]).toEqual([file.name, file.sha256]);
    }
    expect(filesIn(WIX_FILES)).toEqual(
      [...WIX_RELEASE.files.map((file) => `${file.name}.txt`), "release.json"].sort()
    );
    // Anything else than a release.json of these six files: no guide.
    const [first, ...others] = WIX_RELEASE.files;
    for (const release of [
      null,
      "1.0.0",
      { ...WIX_RELEASE, version: "v1.0.0" },
      { ...WIX_RELEASE, version: 1 },
      { ...WIX_RELEASE, files: others },
      { ...WIX_RELEASE, files: [...others, first] },
      { ...WIX_RELEASE, files: [{ ...first, sha256: "ABC" }, ...others] },
      { ...WIX_RELEASE, files: [{ name: first!.name }, ...others] }
    ]) {
      expect(wixPluginOf(release)).toBeNull();
    }
    expect(wixPluginOf({ ...WIX_RELEASE, version: "2.10.3" })?.version).toBe("2.10.3");
  });

  it("copies a plugin's file only when its bytes are the release's, and says the line it ends on", () => {
    const [plugin, , events] = WIX_PLUGIN!.files;
    const bytes = readFileSync(join(WIX_FILES, `${plugin!.name}.txt`));
    const checked = checkedFile(bytes, plugin!.sha256);
    // Wix's editor numbers the plugin's own file to 17 748: its 17 747 line breaks, then the empty
    // line after the last.
    expect(checked?.lastLine).toBe(17_748);
    expect(checked?.text.startsWith("/* eslint-disable */")).toBe(true);
    expect(checked?.text.length).toBeGreaterThan(600_000);
    // The hash in capitals is the same hash.
    expect(checkedFile(bytes, plugin!.sha256.toUpperCase())?.lastLine).toBe(17_748);
    const small = readFileSync(join(WIX_FILES, `${events!.name}.txt`));
    expect(checkedFile(small, events!.sha256)?.lastLine).toBe(14);
    // Another file's bytes, one byte changed, none: never copied.
    expect(checkedFile(small, plugin!.sha256)).toBeNull();
    const changed = Uint8Array.from(small);
    changed[0] = changed[0]! ^ 1;
    expect(checkedFile(changed, events!.sha256)).toBeNull();
    expect(checkedFile(new Uint8Array(), events!.sha256)).toBeNull();
  });
});
