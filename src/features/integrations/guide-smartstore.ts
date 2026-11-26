import type { TFunction } from "i18next";

import type { ReleaseFile } from "@/lib/github/latest-release";

import type { GuideStep } from "./guides";

/**
 * The plugin's package, an asset of each of its GitHub releases: the plugin's README points there
 * (each release carries the package and its SHA256SUMS). Its name is the plugin's release
 * workflow's (sattleme/checkout-smartstore, `.github/workflows/release.yml`:
 * `Smartstore.Module.Sattleme.Bitcoin.<version>.zip`, in release `v<version>`). The guide's button
 * downloads the latest release's package itself (src/lib/github/latest-release.ts). The guide's
 * texts name the Smartstore version that release supports
 * (`integrations.guides.smartstore.download.body`): a release for another Smartstore version
 * changes them too.
 */
export const SMARTSTORE_PLUGIN_PACKAGE: ReleaseFile = {
  repository: "sattleme/checkout-smartstore",
  name: (version) => `Smartstore.Module.Sattleme.Bitcoin.${version}.zip`
};

/**
 * The plugin's latest release on GitHub: where the guide's button leads until GitHub said which
 * package to download, or when it cannot say.
 */
export const SMARTSTORE_PLUGIN_URL =
  "https://github.com/sattleme/checkout-smartstore/releases/latest";

/**
 * Smartstore's guide (sattleme/checkout-smartstore, whose README it follows), from Smartstore's
 * administration: the plugin's package is downloaded from its GitHub releases, then uploaded in
 * "Manage plugins" ("Upload plugin" uploads it as soon as it is chosen). Smartstore lists an
 * uploaded plugin only once it has restarted ("Edit" → "Reload list of plugins"); its "Install" only
 * queues the installation, which "Execute tasks" runs, restarting Smartstore again. The method is
 * then offered at checkout only once activated in "Payment methods". Smartstore shows times in the
 * store's time zone, else its server's (UTC in its Docker image): a step says where it is set, the
 * payment page's time to pay being read in it.
 * Its texts name Smartstore's labels, and the plugin's, in English in every language of the app, as
 * Smartstore's English administration shows them in the screenshots.
 * Smartstore cancels no unpaid order on its own (none of its scheduled tasks does: the plugin's
 * README, "Deadlines"): no setting to change there.
 * Screenshots: Smartstore 6.4.0 (its Docker image, on SQLite) with its sample data and the plugin
 * 1.0.0 (its release's package, checked against its SHA256SUMS), its administrator's account; for
 * the checkout, the method activated with the plugin's test-only fake of the SDK (its e2e/FakeSdk)
 * and its test key instead of a real integration's key; the key's field shows that test key, as
 * typed, unsaved. The admin area 1024 px wide (its desktop layout), the shop's checkout 480 px wide
 * (its narrow layout), at 2×, cropped to the step, the element to use framed in orange, then 128
 * colours.
 */
export function smartstoreGuide(t: TFunction): readonly GuideStep[] {
  return [
    {
      kind: "text",
      title: t("integrations.guides.smartstore.download.title"),
      body: t("integrations.guides.smartstore.download.body"),
      link: {
        label: t("integrations.guides.smartstore.download.link"),
        url: SMARTSTORE_PLUGIN_URL,
        release: {
          file: SMARTSTORE_PLUGIN_PACKAGE,
          label: (version) => t("integrations.guides.smartstore.download.file", { version })
        }
      }
    },
    {
      kind: "text",
      title: t("integrations.guides.smartstore.plugins.title"),
      body: t("integrations.guides.smartstore.plugins.body"),
      image: {
        source: require("../../../assets/images/guides/smartstore/menu.png"),
        width: 576,
        height: 516,
        label: t("integrations.guides.smartstore.plugins.image")
      }
    },
    {
      kind: "text",
      title: t("integrations.guides.smartstore.upload.title"),
      body: t("integrations.guides.smartstore.upload.body"),
      image: {
        source: require("../../../assets/images/guides/smartstore/upload.png"),
        width: 1840,
        height: 328,
        label: t("integrations.guides.smartstore.upload.image")
      }
    },
    {
      kind: "text",
      title: t("integrations.guides.smartstore.reload.title"),
      body: t("integrations.guides.smartstore.reload.body"),
      image: {
        source: require("../../../assets/images/guides/smartstore/reload.png"),
        width: 1064,
        height: 328,
        label: t("integrations.guides.smartstore.reload.image")
      }
    },
    {
      kind: "text",
      title: t("integrations.guides.smartstore.install.title"),
      body: t("integrations.guides.smartstore.install.body"),
      image: {
        source: require("../../../assets/images/guides/smartstore/install.png"),
        width: 916,
        height: 600,
        label: t("integrations.guides.smartstore.install.image")
      }
    },
    {
      kind: "text",
      title: t("integrations.guides.smartstore.execute.title"),
      body: t("integrations.guides.smartstore.execute.body"),
      image: {
        source: require("../../../assets/images/guides/smartstore/execute.png"),
        width: 1840,
        height: 328,
        label: t("integrations.guides.smartstore.execute.image")
      }
    },
    {
      kind: "text",
      title: t("integrations.guides.smartstore.open.title"),
      body: t("integrations.guides.smartstore.open.body"),
      image: {
        source: require("../../../assets/images/guides/smartstore/configure.png"),
        width: 916,
        height: 724,
        label: t("integrations.guides.smartstore.open.image")
      }
    },
    // Its settings open, their field for the key shown.
    { kind: "key" },
    {
      kind: "text",
      title: t("integrations.guides.smartstore.save.title"),
      body: t("integrations.guides.smartstore.save.body"),
      image: {
        source: require("../../../assets/images/guides/smartstore/key.png"),
        width: 1840,
        height: 776,
        label: t("integrations.guides.smartstore.save.image")
      }
    },
    {
      kind: "text",
      title: t("integrations.guides.smartstore.activate.title"),
      body: t("integrations.guides.smartstore.activate.body"),
      image: {
        source: require("../../../assets/images/guides/smartstore/activate.png"),
        width: 916,
        height: 624,
        label: t("integrations.guides.smartstore.activate.image")
      }
    },
    {
      kind: "text",
      title: t("integrations.guides.smartstore.timezone.title"),
      body: t("integrations.guides.smartstore.timezone.body")
    },
    {
      kind: "text",
      title: t("integrations.guides.smartstore.check.title"),
      body: t("integrations.guides.smartstore.check.body"),
      image: {
        source: require("../../../assets/images/guides/smartstore/checkout.png"),
        width: 928,
        height: 728,
        label: t("integrations.guides.smartstore.check.image")
      }
    }
  ];
}
