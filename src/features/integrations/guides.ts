import type { TFunction } from "i18next";
import type { ImageSourcePropType } from "react-native";

import type { ShopPlatformId } from "@/config/integration-catalog";
import type { ReleaseFile } from "@/lib/github/latest-release";

import { bebopGuide } from "./guide-bebop";
import { grandnodeGuide } from "./guide-grandnode";
import { magentoGuide } from "./guide-magento";
import { nopcommerceGuide } from "./guide-nopcommerce";
import { prestashopGuide } from "./guide-prestashop";
import { pretixGuide } from "./guide-pretix";
import { smartstoreGuide } from "./guide-smartstore";
import { wixGuide } from "./guide-wix";
import { woocommerceGuide } from "./guide-woocommerce";
import { WIX_PLUGIN } from "./wix-plugin";

/**
 * A screenshot of the platform at a step, bundled with the app (assets/images/guides/<platform>/):
 * never requested from a site. Taken at twice the size it is drawn at most, cropped to what the step
 * names; drawn as wide as the step, at its own aspect ratio.
 */
export type GuideImage = {
  /** Its PNG, `require`d where the guide is written. */
  source: ImageSourcePropType;
  /** Its size in pixels (integration-catalog.test.ts compares it with the file's). */
  width: number;
  height: number;
  /** What it shows, for a screen reader, in the user's language. */
  label: string;
};

/**
 * A file the merchant makes in the platform and pastes the content of (Wix: wix-plugin.ts), its
 * content bundled with the app and copied from the guide.
 */
export type GuideFile = {
  /** Its name in the platform, which the merchant types (and can copy). */
  name: string;
  /** The bundled file (Metro's asset: its module id in the apps, its URL on the web). */
  source: number | string;
  /** SHA-256 of its bytes, hex: the content is copied only when it matches. */
  sha256: string;
  /** Where it is made in the platform, short: under its name. */
  where: string;
  /** How to make it and paste its content, shown when its row is open. */
  how: string;
};

/** A step of a plugin's installation guide, in the user's language. */
export type GuideStep =
  | {
      kind: "text";
      title: string;
      body: string;
      /** Commands to type on the shop's server, one a line, shown as they are typed. */
      code?: string;
      /** The platform's screen at this step. */
      image?: GuideImage;
      /** A page outside the app (the plugin's download), opened in the browser. */
      link?: {
        label: string;
        url: string;
        /**
         * The file that page offers, in the repository's latest release: once GitHub's API said
         * which (src/lib/github/latest-release.ts, read when the step shows), the link downloads
         * that file itself, its `label` naming the version; the page until then, or when it
         * cannot say.
         */
        release?: { file: ReleaseFile; label: (version: string) => string };
      };
    }
  /**
   * Where the integration's key is created: at the step where the plugin's field for it is open,
   * since the key shows once (createIntegration) and the app locks after 5 minutes without
   * activity, time spent in another app included (docs/integrations.md).
   */
  | { kind: "key" }
  /**
   * Files to make in the platform and fill, one row each, checked off as they are pasted: each
   * row copies the file's name and its content (PluginFiles.tsx).
   */
  | {
      kind: "files";
      title: string;
      body: string;
      files: readonly GuideFile[];
      /** The platform's screen where the files are made. */
      image?: GuideImage;
    };

/** A plugin's installation guide: its steps in the user's language, its key's step among them. */
export type Guide = (t: TFunction) => readonly GuideStep[];

/**
 * Each platform's installation guide, its texts in
 * src/i18n/locales/(`integrations.guides.<platform>`), exactly one `key` step in each
 * (integration-catalog.test.ts). A platform without its guide shows "Coming soon" and cannot be
 * chosen, its plugin not being released for this app either. Each guide follows its plugin's first
 * release (be-BOP's: the be-BOP release with its sattle.me processor). Wix's needs the plugin's
 * files, bundled with the app (wix-plugin.ts).
 */
export const GUIDES: Record<ShopPlatformId, Guide | null> = {
  woocommerce: woocommerceGuide,
  wix: WIX_PLUGIN && wixGuide(WIX_PLUGIN),
  bebop: bebopGuide,
  pretix: pretixGuide,
  grandnode: grandnodeGuide,
  nopcommerce: nopcommerceGuide,
  smartstore: smartstoreGuide,
  prestashop: prestashopGuide,
  magento: magentoGuide
};
