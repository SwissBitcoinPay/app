import type { TFunction } from "i18next";

import type { ReleaseFile } from "@/lib/github/latest-release";

import type { GuideStep } from "./guides";

/** The plugin's repository on GitHub, whose releases carry its archive. */
export const GRANDNODE_PLUGIN_REPOSITORY = "sattleme/checkout-grandnode";

/**
 * The plugin's archive, an asset of each of its GitHub releases: GrandNode has no marketplace, and
 * the plugin's README points there (each release carries the archive and its SHA256SUMS). Its name
 * is the plugin's release workflow's (sattleme/checkout-grandnode, `.github/workflows/release.yml`:
 * `Payments.Sattleme-<version>.zip`, in release `v<version>`). The guide's button downloads the
 * latest release's archive itself (src/lib/github/latest-release.ts). The guide's texts name the
 * GrandNode version that release supports (`integrations.guides.grandnode.download.body`): a release
 * for another GrandNode version changes them too.
 */
export const GRANDNODE_PLUGIN_ARCHIVE: ReleaseFile = {
  repository: GRANDNODE_PLUGIN_REPOSITORY,
  name: (version) => `Payments.Sattleme-${version}.zip`
};

/**
 * The plugin's latest release on GitHub: where the guide's button leads until its archive is
 * known, or when it cannot be.
 */
export const GRANDNODE_PLUGIN_URL = `https://github.com/${GRANDNODE_PLUGIN_REPOSITORY}/releases/latest`;

/**
 * GrandNode's guide (sattleme/checkout-grandnode, whose README it follows), from GrandNode's
 * administration: the plugin's archive is downloaded from its latest GitHub release, uploaded in the
 * admin area, then installed. GrandNode 2.4 stops itself after the upload and after the
 * installation, for its host to start it again (IIS on the next request; a container or service
 * only with a restart policy). Its page comes back at once ("Plugin uploaded", an empty list): the
 * steps say to reload it until the list shows again, and to restart GrandNode if it no longer
 * answers.
 * Its texts name GrandNode's labels, and the plugin's, in English in every language of the app, as
 * GrandNode's English administration shows them in the screenshots (GrandNode ships English only).
 * The plugin translates its own labels in French, German and Italian: the save step names those
 * too, in those languages.
 * GrandNode keeps unpaid orders unless its "Cancel unpaid and pending orders" task is enabled, and
 * the plugin refuses that cancellation while a payment may still come (its README, "Deadlines"):
 * no setting to change there.
 * Screenshots: GrandNode 2.4.1 (its Docker image, on LiteDB) with its sample data and the plugin
 * 1.0.0 (its release's archive), its administrator's account; for the checkout, the method enabled
 * with the plugin's test-only gateway (its e2e/FakeSdk) instead of a real integration's key. The
 * admin's "Plugins" menu 1024 px wide (its desktop layout), the other admin screens and the shop's
 * checkout 480 px wide (their narrow layout, the admin's menu closed), at 2×, cropped to the step,
 * the element to use framed in orange, then 128 colours.
 */
export function grandnodeGuide(t: TFunction): readonly GuideStep[] {
  return [
    {
      kind: "text",
      title: t("integrations.guides.grandnode.download.title"),
      body: t("integrations.guides.grandnode.download.body"),
      link: {
        label: t("integrations.guides.grandnode.download.link"),
        url: GRANDNODE_PLUGIN_URL,
        release: {
          file: GRANDNODE_PLUGIN_ARCHIVE,
          label: (version) => t("integrations.guides.grandnode.download.file", { version })
        }
      }
    },
    {
      kind: "text",
      title: t("integrations.guides.grandnode.plugins.title"),
      body: t("integrations.guides.grandnode.plugins.body"),
      image: {
        source: require("../../../assets/images/guides/grandnode/menu.png"),
        width: 560,
        height: 380,
        label: t("integrations.guides.grandnode.plugins.image")
      }
    },
    {
      kind: "text",
      title: t("integrations.guides.grandnode.upload.title"),
      body: t("integrations.guides.grandnode.upload.body"),
      image: {
        source: require("../../../assets/images/guides/grandnode/upload.png"),
        width: 896,
        height: 528,
        label: t("integrations.guides.grandnode.upload.image")
      }
    },
    {
      kind: "text",
      title: t("integrations.guides.grandnode.install.title"),
      body: t("integrations.guides.grandnode.install.body"),
      image: {
        source: require("../../../assets/images/guides/grandnode/install.png"),
        width: 848,
        height: 640,
        label: t("integrations.guides.grandnode.install.image")
      }
    },
    {
      kind: "text",
      title: t("integrations.guides.grandnode.open.title"),
      body: t("integrations.guides.grandnode.open.body"),
      image: {
        source: require("../../../assets/images/guides/grandnode/configure.png"),
        width: 848,
        height: 640,
        label: t("integrations.guides.grandnode.open.image")
      }
    },
    // Its settings open, their field for the key shown.
    { kind: "key" },
    {
      kind: "text",
      title: t("integrations.guides.grandnode.save.title"),
      body: t("integrations.guides.grandnode.save.body"),
      image: {
        source: require("../../../assets/images/guides/grandnode/key.png"),
        width: 960,
        height: 992,
        label: t("integrations.guides.grandnode.save.image")
      }
    },
    {
      kind: "text",
      title: t("integrations.guides.grandnode.check.title"),
      body: t("integrations.guides.grandnode.check.body"),
      image: {
        source: require("../../../assets/images/guides/grandnode/checkout.png"),
        width: 904,
        height: 688,
        label: t("integrations.guides.grandnode.check.image")
      }
    }
  ];
}
