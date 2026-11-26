import type { TFunction } from "i18next";

import type { ReleaseFile } from "@/lib/github/latest-release";

import type { GuideStep } from "./guides";

/**
 * The plugin's archive, an asset of each of its GitHub releases (sattleme/checkout-nopcommerce,
 * `.github/workflows/release.yml`: `Payments.Sattleme-<version>.zip`, in release `v<version>`),
 * the archive nopCommerce takes as it is (`uploadedItems.json` beside the folder
 * `Payments.Sattleme`). The guide's button downloads the latest release's archive itself
 * (src/lib/github/latest-release.ts). A release without it (v1.0.1 carries zips of the archive,
 * not the archive) leaves the button on the marketplace's page. The guide's texts name the
 * nopCommerce version that release supports (`integrations.guides.nopcommerce.download.body`): a
 * release for another nopCommerce version changes them too.
 */
export const NOPCOMMERCE_PLUGIN_ARCHIVE: ReleaseFile = {
  repository: "sattleme/checkout-nopcommerce",
  name: (version) => `Payments.Sattleme-${version}.zip`
};

/**
 * The plugin's page on nopCommerce's marketplace, which offers the same archive: where the guide's
 * button leads until GitHub said which archive to download, or when it cannot say. The
 * marketplace, not the GitHub release's page: it always holds an archive to upload as it is.
 */
export const NOPCOMMERCE_PLUGIN_URL =
  "https://www.nopcommerce.com/bitcoin-payments-sattleme-lightning-and-on-chain";

/**
 * nopCommerce's guide (sattleme/checkout-nopcommerce, whose README it follows), from nopCommerce's
 * administration: the plugin's archive is downloaded from its latest GitHub release (or nopCommerce's
 * marketplace), then uploaded in the admin area. nopCommerce 5.00 lists an uploaded plugin only once it has restarted, then
 * installs it at a second restart. nopCommerce ships its admin area in English only (other
 * languages are packs a shop installs): its texts name nopCommerce's labels, and the plugin's, in
 * English in every language of the app, as the screenshots show them.
 * Screenshots: nopCommerce 5.00.1 (its Docker image) with its sample data and the plugin 1.0.0, its
 * administrator's account. The admin area 1024 px wide (its desktop layout), the plugin's settings
 * and the shop's checkout 480 px wide (their narrow layout), at 2×, cropped to the step, the
 * element to use framed in orange, then 128 colours.
 */
export function nopcommerceGuide(t: TFunction): readonly GuideStep[] {
  return [
    {
      kind: "text",
      title: t("integrations.guides.nopcommerce.download.title"),
      body: t("integrations.guides.nopcommerce.download.body"),
      link: {
        label: t("integrations.guides.nopcommerce.download.link"),
        url: NOPCOMMERCE_PLUGIN_URL,
        release: {
          file: NOPCOMMERCE_PLUGIN_ARCHIVE,
          label: (version) => t("integrations.guides.nopcommerce.download.file", { version })
        }
      }
    },
    {
      kind: "text",
      title: t("integrations.guides.nopcommerce.plugins.title"),
      body: t("integrations.guides.nopcommerce.plugins.body"),
      image: {
        source: require("../../../assets/images/guides/nopcommerce/menu.png"),
        width: 500,
        height: 408,
        label: t("integrations.guides.nopcommerce.plugins.image")
      }
    },
    {
      kind: "text",
      title: t("integrations.guides.nopcommerce.upload.title"),
      body: t("integrations.guides.nopcommerce.upload.body"),
      image: {
        source: require("../../../assets/images/guides/nopcommerce/upload.png"),
        width: 1000,
        height: 818,
        label: t("integrations.guides.nopcommerce.upload.image")
      }
    },
    {
      kind: "text",
      title: t("integrations.guides.nopcommerce.restart.title"),
      body: t("integrations.guides.nopcommerce.restart.body"),
      image: {
        source: require("../../../assets/images/guides/nopcommerce/restart.png"),
        width: 596,
        height: 210,
        label: t("integrations.guides.nopcommerce.restart.image")
      }
    },
    {
      kind: "text",
      title: t("integrations.guides.nopcommerce.install.title"),
      body: t("integrations.guides.nopcommerce.install.body"),
      image: {
        source: require("../../../assets/images/guides/nopcommerce/install.png"),
        width: 902,
        height: 768,
        label: t("integrations.guides.nopcommerce.install.image")
      }
    },
    {
      kind: "text",
      title: t("integrations.guides.nopcommerce.open.title"),
      body: t("integrations.guides.nopcommerce.open.body"),
      image: {
        source: require("../../../assets/images/guides/nopcommerce/configure.png"),
        width: 908,
        height: 872,
        label: t("integrations.guides.nopcommerce.open.image")
      }
    },
    // Its settings open, their field for the key shown.
    { kind: "key" },
    {
      kind: "text",
      title: t("integrations.guides.nopcommerce.save.title"),
      body: t("integrations.guides.nopcommerce.save.body"),
      image: {
        source: require("../../../assets/images/guides/nopcommerce/key.png"),
        width: 890,
        height: 1000,
        label: t("integrations.guides.nopcommerce.save.image")
      }
    },
    {
      kind: "text",
      title: t("integrations.guides.nopcommerce.check.title"),
      body: t("integrations.guides.nopcommerce.check.body"),
      image: {
        source: require("../../../assets/images/guides/nopcommerce/checkout.png"),
        width: 864,
        height: 922,
        label: t("integrations.guides.nopcommerce.check.image")
      }
    },
    {
      kind: "text",
      title: t("integrations.guides.nopcommerce.autoCancel.title"),
      body: t("integrations.guides.nopcommerce.autoCancel.body")
    }
  ];
}
