import type { TFunction } from "i18next";

import type { GuideStep } from "./guides";

/**
 * be-BOP's guide, from be-BOP's administration: sattle.me is one of be-BOP's own payment
 * processors (src/lib/payment-processors/sattleme/ in be-BOP-io-SA/be-BOP), nothing to install
 * beyond be-BOP itself. Its Lightning method and its on-chain one ("sattleme-onchain") share the
 * settings of one page, and one key. Its texts name be-BOP's labels as be-BOP shows them in each
 * language of the app (es: be-BOP's "es-sv"), English where be-BOP has no translation (fi). Its
 * screenshots show be-BOP in English.
 * Screenshots: be-BOP with its sattle.me processor, built from its sources, an administrator's
 * account and its test product. The administration's menu 1024 px wide (its desktop layout), the
 * settings and the checkout 480 px wide (their narrow layout), at 2×, cropped to the step, the
 * element to use framed in orange, then 128 colours. The key saved for them is a dummy: none of
 * these steps makes an invoice.
 */
export function bebopGuide(t: TFunction): readonly GuideStep[] {
  return [
    {
      kind: "text",
      title: t("integrations.guides.bebop.open.title"),
      body: t("integrations.guides.bebop.open.body"),
      image: {
        source: require("../../../assets/images/guides/bebop/menu.png"),
        width: 512,
        height: 768,
        label: t("integrations.guides.bebop.open.image")
      }
    },
    // Its settings open, their field for the key shown.
    { kind: "key" },
    {
      kind: "text",
      title: t("integrations.guides.bebop.save.title"),
      body: t("integrations.guides.bebop.save.body"),
      image: {
        source: require("../../../assets/images/guides/bebop/key.png"),
        width: 960,
        height: 792,
        label: t("integrations.guides.bebop.save.image")
      }
    },
    {
      kind: "text",
      title: t("integrations.guides.bebop.test.title"),
      body: t("integrations.guides.bebop.test.body"),
      image: {
        source: require("../../../assets/images/guides/bebop/test.png"),
        width: 960,
        height: 298,
        label: t("integrations.guides.bebop.test.image")
      }
    },
    {
      kind: "text",
      title: t("integrations.guides.bebop.prefer.title"),
      body: t("integrations.guides.bebop.prefer.body"),
      image: {
        source: require("../../../assets/images/guides/bebop/preferences.png"),
        width: 960,
        height: 978,
        label: t("integrations.guides.bebop.prefer.image")
      }
    },
    {
      kind: "text",
      title: t("integrations.guides.bebop.check.title"),
      body: t("integrations.guides.bebop.check.body"),
      image: {
        source: require("../../../assets/images/guides/bebop/checkout.png"),
        width: 960,
        height: 304,
        label: t("integrations.guides.bebop.check.image")
      }
    }
  ];
}
