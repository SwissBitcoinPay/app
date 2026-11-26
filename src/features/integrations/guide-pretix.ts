import type { TFunction } from "i18next";

import type { GuideStep } from "./guides";

/**
 * pretix's guide (sattleme/checkout-pretix, whose README it follows), from pretix's backend: the
 * plugin is offered by pretix's marketplace, nothing to install by hand. Its texts name pretix's
 * labels as pretix 2026.9 shows them in each language of the app (pt: pretix's "pt-pt"), English
 * where pretix has no translation; the plugin's labels as its own translations give them (German,
 * French, Italian), English elsewhere. Its screenshots show pretix in English.
 * Screenshots: pretix 2026.9.1 (its Docker image) with the plugin 1.0.0, an organizer's account
 * (not a pretix administrator's), 480 px wide (pretix's narrow layout, its menu open) at 2×, the
 * element to use framed in orange, then 128 colours (docs/integrations.md).
 */
export function pretixGuide(t: TFunction): readonly GuideStep[] {
  return [
    {
      kind: "text",
      title: t("integrations.guides.pretix.plugins.title"),
      body: t("integrations.guides.pretix.plugins.body"),
      image: {
        source: require("../../../assets/images/guides/pretix/menu.png"),
        width: 960,
        height: 484,
        label: t("integrations.guides.pretix.plugins.image")
      }
    },
    {
      kind: "text",
      title: t("integrations.guides.pretix.enable.title"),
      body: t("integrations.guides.pretix.enable.body"),
      image: {
        source: require("../../../assets/images/guides/pretix/plugins.png"),
        width: 904,
        height: 696,
        label: t("integrations.guides.pretix.enable.image")
      }
    },
    {
      kind: "text",
      title: t("integrations.guides.pretix.open.title"),
      body: t("integrations.guides.pretix.open.body"),
      image: {
        source: require("../../../assets/images/guides/pretix/payment.png"),
        width: 904,
        height: 452,
        label: t("integrations.guides.pretix.open.image")
      }
    },
    // Its settings open, their field for the key shown.
    { kind: "key" },
    {
      kind: "text",
      title: t("integrations.guides.pretix.save.title"),
      body: t("integrations.guides.pretix.save.body"),
      image: {
        source: require("../../../assets/images/guides/pretix/key.png"),
        width: 904,
        height: 1834,
        label: t("integrations.guides.pretix.save.image")
      }
    },
    {
      kind: "text",
      title: t("integrations.guides.pretix.channels.title"),
      body: t("integrations.guides.pretix.channels.body"),
      image: {
        source: require("../../../assets/images/guides/pretix/channels.png"),
        width: 904,
        height: 256,
        label: t("integrations.guides.pretix.channels.image")
      }
    },
    {
      kind: "text",
      title: t("integrations.guides.pretix.check.title"),
      body: t("integrations.guides.pretix.check.body"),
      image: {
        source: require("../../../assets/images/guides/pretix/checkout.png"),
        width: 960,
        height: 580,
        label: t("integrations.guides.pretix.check.image")
      }
    }
  ];
}
