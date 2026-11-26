import type { TFunction } from "i18next";

import type { ReleaseFile } from "@/lib/github/latest-release";

import type { GuideStep } from "./guides";

/**
 * The plugin's ZIP, an asset of its GitHub releases (sattleme/checkout-woocommerce,
 * `tools/build.sh`: `sattleme-for-woocommerce-<version>.zip`, in release `v<version>`), the
 * archive WordPress installs as it is. The guide's button downloads the latest release's ZIP itself
 * (src/lib/github/latest-release.ts); a release without it leaves the button on the release's
 * page. WordPress.org's plugin directory does not list the plugin yet: once it does, the guide can
 * search for it in WordPress instead.
 */
export const WOOCOMMERCE_PLUGIN_ZIP: ReleaseFile = {
  repository: "sattleme/checkout-woocommerce",
  name: (version) => `sattleme-for-woocommerce-${version}.zip`
};

/**
 * The plugin's latest release on GitHub: where the guide's button leads until GitHub said which
 * ZIP to download, or when it cannot say.
 */
export const WOOCOMMERCE_PLUGIN_URL =
  "https://github.com/sattleme/checkout-woocommerce/releases/latest";

/**
 * WooCommerce's guide (sattleme/checkout-woocommerce, whose README it follows), from WordPress's
 * administration: the plugin's ZIP is downloaded from its GitHub release, uploaded on WordPress's
 * Add Plugins screen, activated, then configured with the integration's key on its settings page
 * (WooCommerce's Payments settings), which checks the key when it is saved. WordPress and
 * WooCommerce translate their administration: each language names their labels as they are
 * translated there, and the plugin's own as the plugin translates them (French, German and
 * Italian; in English in the other languages).
 * Screenshots: WordPress 7.1.5 with WooCommerce 11.3.0 and the plugin 1.0.0 (its release's ZIP), in
 * English, WordPress's narrow layout (480 px wide) at 2×, cropped to the step, the element to use
 * framed in orange, then 128 colours. The settings and checkout were taken with the plugin's
 * test-only fake of its SDK (tools/e2e in its repository), whose business is "My Shop", so that no
 * real integration shows; its notice of a test site is hidden from them.
 */
export function woocommerceGuide(t: TFunction): readonly GuideStep[] {
  return [
    {
      kind: "text",
      title: t("integrations.guides.woocommerce.download.title"),
      body: t("integrations.guides.woocommerce.download.body"),
      link: {
        label: t("integrations.guides.woocommerce.download.link"),
        url: WOOCOMMERCE_PLUGIN_URL,
        release: {
          file: WOOCOMMERCE_PLUGIN_ZIP,
          label: (version) => t("integrations.guides.woocommerce.download.file", { version })
        }
      }
    },
    {
      kind: "text",
      title: t("integrations.guides.woocommerce.upload.title"),
      body: t("integrations.guides.woocommerce.upload.body"),
      image: {
        source: require("../../../assets/images/guides/woocommerce/upload.png"),
        width: 960,
        height: 592,
        label: t("integrations.guides.woocommerce.upload.image")
      }
    },
    {
      kind: "text",
      title: t("integrations.guides.woocommerce.activate.title"),
      body: t("integrations.guides.woocommerce.activate.body"),
      image: {
        source: require("../../../assets/images/guides/woocommerce/activate.png"),
        width: 960,
        height: 500,
        label: t("integrations.guides.woocommerce.activate.image")
      }
    },
    {
      kind: "text",
      title: t("integrations.guides.woocommerce.open.title"),
      body: t("integrations.guides.woocommerce.open.body"),
      image: {
        source: require("../../../assets/images/guides/woocommerce/settings.png"),
        width: 960,
        height: 540,
        label: t("integrations.guides.woocommerce.open.image")
      }
    },
    // Its settings open, their field for the key shown.
    { kind: "key" },
    {
      kind: "text",
      title: t("integrations.guides.woocommerce.save.title"),
      body: t("integrations.guides.woocommerce.save.body"),
      image: {
        source: require("../../../assets/images/guides/woocommerce/key.png"),
        width: 960,
        height: 928,
        label: t("integrations.guides.woocommerce.save.image")
      }
    },
    {
      kind: "text",
      title: t("integrations.guides.woocommerce.check.title"),
      body: t("integrations.guides.woocommerce.check.body"),
      image: {
        source: require("../../../assets/images/guides/woocommerce/checkout.png"),
        width: 960,
        height: 368,
        label: t("integrations.guides.woocommerce.check.image")
      }
    }
  ];
}
