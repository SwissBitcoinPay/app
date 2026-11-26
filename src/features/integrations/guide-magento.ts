import type { TFunction } from "i18next";

import type { GuideStep } from "./guides";

/**
 * The module's page on Packagist (sattleme/checkout-magento, distributed there as
 * `sattleme/module-payment`, which Composer reads by default): its versions and its install
 * command.
 */
export const MAGENTO_MODULE_URL = "https://packagist.org/packages/sattleme/module-payment";

/**
 * Magento's guide (sattleme/checkout-magento, whose README it follows): the module is installed
 * with Composer from Packagist on the shop's server, from Magento's root, and enabled with Magento's
 * own commands (the guide gives them to copy); then configured in Magento's admin, under "Stores" →
 * "Configuration" → "Sales" → "Payment Methods" → "Bitcoin (sattle.me)", with the integration's key,
 * which the module checks when it is saved. The module checks payments in the background through
 * Magento's cron (its README, "Requirements"), which a production Magento already runs: a step gives
 * Magento's command that sets it up when it does not.
 * Its texts name Magento's labels, and the module's, in English in every language of the app, as
 * Magento's English admin shows them in the screenshots; in French, German and Italian, the
 * languages the module translates, they also give the module's own labels there.
 * Screenshots: Magento Open Source 2.4.9 in English (its Luma theme), the module 1.0.0 installed
 * with `composer require sattleme/module-payment` from Packagist; for the key and the checkout, the
 * module's test-only fake of the SDK (Test/E2e in its repository) and its test key instead of a real
 * integration's key; the key's field shows that test key, as typed, unsaved. The admin 1024 px wide,
 * the shop's checkout 480 px wide (its narrow layout), at 2×, cropped to the step, the element to
 * use framed in orange, then 128 colours.
 */
export function magentoGuide(t: TFunction): readonly GuideStep[] {
  return [
    {
      kind: "text",
      title: t("integrations.guides.magento.install.title"),
      body: t("integrations.guides.magento.install.body"),
      code: [
        "composer require sattleme/module-payment",
        "bin/magento module:enable Sattleme_Payment",
        "bin/magento setup:upgrade",
        "bin/magento setup:di:compile",
        "bin/magento setup:static-content:deploy",
        "bin/magento cache:flush"
      ].join("\n"),
      link: {
        label: t("integrations.guides.magento.install.link"),
        url: MAGENTO_MODULE_URL
      }
    },
    {
      kind: "text",
      title: t("integrations.guides.magento.open.title"),
      body: t("integrations.guides.magento.open.body"),
      image: {
        source: require("../../../assets/images/guides/magento/settings.png"),
        width: 1812,
        height: 274,
        label: t("integrations.guides.magento.open.image")
      }
    },
    // Its settings open, their field for the key shown.
    { kind: "key" },
    {
      kind: "text",
      title: t("integrations.guides.magento.save.title"),
      body: t("integrations.guides.magento.save.body"),
      image: {
        source: require("../../../assets/images/guides/magento/key.png"),
        width: 1308,
        height: 700,
        label: t("integrations.guides.magento.save.image")
      }
    },
    {
      kind: "text",
      title: t("integrations.guides.magento.cron.title"),
      body: t("integrations.guides.magento.cron.body"),
      code: "bin/magento cron:install"
    },
    {
      kind: "text",
      title: t("integrations.guides.magento.check.title"),
      body: t("integrations.guides.magento.check.body"),
      image: {
        source: require("../../../assets/images/guides/magento/checkout.png"),
        width: 960,
        height: 400,
        label: t("integrations.guides.magento.check.image")
      }
    }
  ];
}
