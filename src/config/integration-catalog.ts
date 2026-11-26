/**
 * What "New integration" offers: first the online shops, whose plugin is installed with a guide,
 * then, for developers, the SDK of each language, in this order. Names are brands: never
 * translated, written as their owners write them ("pretix"). Their logos:
 * src/features/integrations/logos.ts. Each one's `repository`: its source code, a public
 * repository of github.com/sattleme (`owner/name`), which the header of its page links to
 * (sourceCodeUrl); null where sattle.me publishes none.
 *
 * Ids are written in the record of each integration created from them (its platform,
 * src/lib/team/roster.ts): never change nor reuse one once released. A new
 * option gets an id of its own, of the shape isPlatform accepts.
 */

export const SHOP_PLATFORMS = [
  { id: "woocommerce", name: "WooCommerce", repository: "sattleme/checkout-woocommerce" },
  { id: "wix", name: "Wix", repository: "sattleme/checkout-wix" },
  // be-BOP's sattle.me processor is part of be-BOP itself (be-BOP-io-SA/be-BOP), not of a
  // repository of sattle.me's.
  { id: "bebop", name: "be-BOP", repository: null },
  { id: "pretix", name: "pretix", repository: "sattleme/checkout-pretix" },
  { id: "grandnode", name: "GrandNode", repository: "sattleme/checkout-grandnode" },
  { id: "nopcommerce", name: "nopCommerce", repository: "sattleme/checkout-nopcommerce" },
  { id: "smartstore", name: "Smartstore", repository: "sattleme/checkout-smartstore" },
  { id: "prestashop", name: "PrestaShop", repository: "sattleme/checkout-prestashop" },
  { id: "magento", name: "Magento", repository: "sattleme/checkout-magento" }
] as const;

export type ShopPlatformId = (typeof SHOP_PLATFORMS)[number]["id"];

/** A language's SDK as its registry publishes it. */
export type SdkPackage = {
  /** The registry's site, as its link says it ("Open on npmjs.com"). */
  site: string;
  /** The package's name on it. */
  name: string;
  /** Its page there (https). */
  url: string;
};

export type SdkLanguage = {
  id: "node" | "python" | "php" | "rust" | "java" | "dotnet" | "ruby" | "go";
  name: string;
  /** Its source code (sattleme/checkout-<language>), `owner/name` on GitHub. */
  repository: string;
  /**
   * Null until a maintainer has published it ("Coming soon"): an SDK whose repository has no
   * release is never offered (sattleme/checkout-<language>).
   */
  package: SdkPackage | null;
};

export const SDK_LANGUAGES: readonly SdkLanguage[] = [
  {
    id: "node",
    name: "Node.js",
    repository: "sattleme/checkout-node",
    // Published on npm as @sattleme/checkout.
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
    // Published on PyPI.
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
    // Published on Packagist.
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
    // Published on crates.io as sattleme-checkout (1.0.0).
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
    // Published as me.sattle:checkout in its own Maven repository, https://maven.sattle.me, not on Maven Central.
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
    // Published on NuGet as Sattleme.Checkout.
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
    // Published on RubyGems.org as sattleme-checkout.
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
    // The module github.com/sattleme/checkout-go on Go's module proxy: Go
    // has no registry page of its own, so its tile opens the repository's latest
    // GitHub release (its notes: the install command and the changelog of that version).
    package: {
      site: "github.com",
      name: "github.com/sattleme/checkout-go",
      url: "https://github.com/sattleme/checkout-go/releases/latest"
    }
  }
];

export type SdkLanguageId = SdkLanguage["id"];

/** Every option of "New integration", each with its logo. */
export type IntegrationOptionId = ShopPlatformId | SdkLanguageId;

const OPTIONS = [...SHOP_PLATFORMS, ...SDK_LANGUAGES];

const OPTION_IDS: ReadonlySet<string> = new Set(OPTIONS.map(({ id }) => id));

/** An option's source code on GitHub (its `repository`), or null where it has none. */
export function sourceCodeUrl(id: IntegrationOptionId): string | null {
  const repository = OPTIONS.find((option) => option.id === id)?.repository ?? null;
  return repository === null ? null : `https://github.com/${repository}`;
}

/**
 * Whether an integration's platform, as its record names it, is an option of this build: not one
 * of a newer app's catalogue.
 */
export function isIntegrationOptionId(id: string): id is IntegrationOptionId {
  return OPTION_IDS.has(id);
}
