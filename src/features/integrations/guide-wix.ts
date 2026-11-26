import type { TFunction } from "i18next";

import type { Guide } from "./guides";
import type { WixFilePlace, WixPlugin, WixPluginFile } from "./wix-plugin";

/** Where each kind of file is made in Wix's code panel, short. */
const WHERE = {
  js: "integrations.guides.wix.files.where.js",
  file: "integrations.guides.wix.files.where.file",
  servicePlugin: "integrations.guides.wix.files.where.servicePlugin",
  servicePluginConfig: "integrations.guides.wix.files.where.servicePluginConfig"
} as const satisfies Record<WixFilePlace, string>;

/**
 * What a site that has the file already of its own does instead: the code of `http-functions.js`
 * and `events.js` pasted under its own (an `import` is valid anywhere at a module's top level), the
 * job of `jobs.config` added to its list.
 */
const SHARED = {
  code: "integrations.guides.wix.files.sharedCode",
  jobs: "integrations.guides.wix.files.sharedJobs"
} as const satisfies Record<NonNullable<WixPluginFile["shared"]>, string>;

/** How each kind of file is made and filled. */
const HOW = {
  js: "integrations.guides.wix.files.how.js",
  file: "integrations.guides.wix.files.how.file",
  servicePlugin: "integrations.guides.wix.files.how.servicePlugin",
  servicePluginConfig: "integrations.guides.wix.files.how.servicePluginConfig"
} as const satisfies Record<WixFilePlace, string>;

/**
 * Wix's guide (sattleme/checkout-wix, whose README's "Installation" it follows), in the Wix Editor
 * with Dev Mode on, from a computer: two of Wix's npm packages, the plugin's six files made in the
 * site's backend and filled from the app (the plugin bundled with it: wix-plugin.ts), the key and the status page's token in
 * the site's Secrets Manager, one publication, the status page opened (it keeps the site's address,
 * without which every payment is refused), then the connection in the site's payment settings,
 * whose first field takes the secret's name, never the key. Everything is said in the app, in the
 * user's language, nothing sent to the plugin's README. Each step but the key's shows its screen,
 * taken on a Wix development site in Wix's English interface (the classic Wix Editor and its
 * dashboard, drawn at 2× through a CSS transform and put together, cropped to what the step names,
 * the elements to use framed in orange, then 128 colours); the plugin's own pages as the plugin
 * shows them. No secret's value is shown, nor the payment page's invoice, QR code or address. Wix
 * Studio's screens differ: the guide says so.
 * Its texts name Wix's labels: in English as Wix's English interface shows them, in French as its
 * French interface does (both seen on a Wix site); the other languages name the English ones, which
 * were not checked against Wix's own translations.
 */
export function wixGuide(plugin: WixPlugin): Guide {
  return (t: TFunction) => [
    {
      kind: "text",
      title: t("integrations.guides.wix.editor.title"),
      body: t("integrations.guides.wix.editor.body"),
      image: {
        source: require("../../../assets/images/guides/wix/dev-mode.png"),
        width: 1060,
        height: 600,
        label: t("integrations.guides.wix.editor.image")
      }
    },
    {
      kind: "text",
      title: t("integrations.guides.wix.packages.title"),
      body: t("integrations.guides.wix.packages.body"),
      image: {
        source: require("../../../assets/images/guides/wix/packages.png"),
        width: 592,
        height: 502,
        label: t("integrations.guides.wix.packages.image")
      }
    },
    {
      kind: "text",
      title: t("integrations.guides.wix.install.title"),
      body: t("integrations.guides.wix.install.body"),
      image: {
        source: require("../../../assets/images/guides/wix/install.png"),
        width: 1360,
        height: 616,
        label: t("integrations.guides.wix.install.image")
      }
    },
    {
      kind: "files",
      title: t("integrations.guides.wix.files.title"),
      body: t("integrations.guides.wix.files.body", { version: plugin.version }),
      files: plugin.files.map((file) => ({
        name: file.name,
        source: file.source,
        sha256: file.sha256,
        where: t(WHERE[file.place]),
        how: [
          t(HOW[file.place], { name: file.name }),
          ...(file.shared ? [t(SHARED[file.shared], { name: file.name })] : [])
        ].join(" ")
      })),
      image: {
        source: require("../../../assets/images/guides/wix/files.png"),
        width: 1048,
        height: 682,
        label: t("integrations.guides.wix.files.image")
      }
    },
    {
      kind: "text",
      title: t("integrations.guides.wix.secrets.title"),
      body: t("integrations.guides.wix.secrets.body"),
      image: {
        source: require("../../../assets/images/guides/wix/secrets.png"),
        width: 1680,
        height: 820,
        label: t("integrations.guides.wix.secrets.image")
      }
    },
    // The Secrets Manager's second secret open, its value's field shown.
    { kind: "key" },
    {
      kind: "text",
      title: t("integrations.guides.wix.save.title"),
      body: t("integrations.guides.wix.save.body"),
      image: {
        source: require("../../../assets/images/guides/wix/save.png"),
        width: 1024,
        height: 848,
        label: t("integrations.guides.wix.save.image")
      }
    },
    {
      kind: "text",
      title: t("integrations.guides.wix.publish.title"),
      body: t("integrations.guides.wix.publish.body"),
      image: {
        source: require("../../../assets/images/guides/wix/publish.png"),
        width: 760,
        height: 120,
        label: t("integrations.guides.wix.publish.image")
      }
    },
    {
      kind: "text",
      title: t("integrations.guides.wix.status.title"),
      body: t("integrations.guides.wix.status.body", { version: plugin.version }),
      image: {
        source: require("../../../assets/images/guides/wix/status.png"),
        width: 1400,
        height: 548,
        label: t("integrations.guides.wix.status.image")
      }
    },
    {
      kind: "text",
      title: t("integrations.guides.wix.connect.title"),
      body: t("integrations.guides.wix.connect.body"),
      image: {
        source: require("../../../assets/images/guides/wix/connect.png"),
        width: 1388,
        height: 1100,
        label: t("integrations.guides.wix.connect.image")
      }
    },
    {
      kind: "text",
      title: t("integrations.guides.wix.check.title"),
      body: t("integrations.guides.wix.check.body"),
      image: {
        source: require("../../../assets/images/guides/wix/check.png"),
        width: 1000,
        height: 496,
        label: t("integrations.guides.wix.check.image")
      }
    }
  ];
}
