import type { TFunction } from "i18next";

import type { ReleaseFile } from "@/lib/github/latest-release";

import type { GuideStep } from "./guides";

/**
 * The module's ZIP, an asset of each of its GitHub releases (sattleme/checkout-prestashop, whose
 * README distributes it there only: `sattleme.zip` and its `SHA256SUMS`, in release
 * `v<version>`), the archive PrestaShop's "Upload a module" installs as it is. Its name carries no
 * version: the module's tools/build.sh names it after the module. The guide's button downloads the latest
 * release's ZIP itself (src/lib/github/latest-release.ts); a release without it leaves the button on
 * the release's page. The guide's texts name the PrestaShop and PHP versions that release supports
 * (`integrations.guides.prestashop.download.body`): a release for other versions changes them too.
 */
export const PRESTASHOP_MODULE_ZIP: ReleaseFile = {
  repository: "sattleme/checkout-prestashop",
  name: () => "sattleme.zip"
};

/**
 * The module's latest release on GitHub: where the guide's button leads until GitHub said which ZIP
 * to download, or when it cannot say.
 */
export const PRESTASHOP_MODULE_URL =
  "https://github.com/sattleme/checkout-prestashop/releases/latest";

/**
 * PrestaShop's guide (sattleme/checkout-prestashop, whose README it follows), from PrestaShop's back
 * office: the module's ZIP is downloaded from its GitHub release, uploaded in "Module Manager"
 * ("Upload a module" installs it as soon as it is dropped), then configured with the integration's
 * key on its settings page, which checks the key when it is saved. The module checks payments in
 * the background only through a URL the server's cron calls every minute (its README, "Background
 * checks"): a step says where its settings page gives that line.
 * Its texts name PrestaShop's labels, and the module's, in English in every language of the app, as
 * PrestaShop's English back office shows them in the screenshots; in French, German and Italian, the
 * languages the module translates, they also give the module's own labels there.
 * Screenshots: PrestaShop 9.2.1 (its release ZIP, its demo data, its default theme Hummingbird) in
 * English, the module 1.0.0 uploaded through "Upload a module" from its release's ZIP (checked
 * against its SHA256SUMS); for the key and the checkout, the module's test-only fake of the SDK
 * (tests/Fake in its repository) and its test key instead of a real integration's key, whose
 * business is "My Shop"; the key's field shows that test key, as typed, unsaved. The back office
 * 1024 px wide, the shop's checkout 480 px wide (its narrow layout), at 2×, cropped to the step, the
 * element to use framed in orange, then 128 colours.
 */
export function prestashopGuide(t: TFunction): readonly GuideStep[] {
  return [
    {
      kind: "text",
      title: t("integrations.guides.prestashop.download.title"),
      body: t("integrations.guides.prestashop.download.body"),
      link: {
        label: t("integrations.guides.prestashop.download.link"),
        url: PRESTASHOP_MODULE_URL,
        release: {
          file: PRESTASHOP_MODULE_ZIP,
          label: (version) => t("integrations.guides.prestashop.download.file", { version })
        }
      }
    },
    {
      kind: "text",
      title: t("integrations.guides.prestashop.upload.title"),
      body: t("integrations.guides.prestashop.upload.body"),
      image: {
        source: require("../../../assets/images/guides/prestashop/upload.png"),
        width: 1632,
        height: 176,
        label: t("integrations.guides.prestashop.upload.image")
      }
    },
    {
      kind: "text",
      title: t("integrations.guides.prestashop.drop.title"),
      body: t("integrations.guides.prestashop.drop.body"),
      image: {
        source: require("../../../assets/images/guides/prestashop/drop.png"),
        width: 1352,
        height: 774,
        label: t("integrations.guides.prestashop.drop.image")
      }
    },
    {
      kind: "text",
      title: t("integrations.guides.prestashop.open.title"),
      body: t("integrations.guides.prestashop.open.body"),
      image: {
        source: require("../../../assets/images/guides/prestashop/installed.png"),
        width: 1352,
        height: 738,
        label: t("integrations.guides.prestashop.open.image")
      }
    },
    // Its settings open, their field for the key shown.
    { kind: "key" },
    {
      kind: "text",
      title: t("integrations.guides.prestashop.save.title"),
      body: t("integrations.guides.prestashop.save.body"),
      image: {
        source: require("../../../assets/images/guides/prestashop/key.png"),
        width: 1568,
        height: 450,
        label: t("integrations.guides.prestashop.save.image")
      }
    },
    {
      kind: "text",
      title: t("integrations.guides.prestashop.cron.title"),
      body: t("integrations.guides.prestashop.cron.body"),
      image: {
        source: require("../../../assets/images/guides/prestashop/cron.png"),
        width: 1568,
        height: 750,
        label: t("integrations.guides.prestashop.cron.image")
      }
    },
    {
      kind: "text",
      title: t("integrations.guides.prestashop.check.title"),
      body: t("integrations.guides.prestashop.check.body"),
      image: {
        source: require("../../../assets/images/guides/prestashop/checkout.png"),
        width: 960,
        height: 416,
        label: t("integrations.guides.prestashop.check.image")
      }
    }
  ];
}
