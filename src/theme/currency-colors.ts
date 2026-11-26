import type { PayoutCurrency } from "@/config/payout-currencies";

/**
 * The colour of each payout currency on the split screen: its block of the bar and its tag
 * (`fill`, under white text), its icon on white (`ink`, a darker tone of the same hue).
 *
 * CHF and EUR are the design system's (OKLCH values). The others were
 * picked for this app (one colour per currency), around the
 * hue wheel away from bitcoin's orange; each `ink` is its `fill` 0.07 darker. Not design system
 * tokens. White text on every `fill` stays above 4.5:1 (checked by payout-currencies.test.ts).
 */
export const currencyColors: Readonly<Record<PayoutCurrency, { fill: string; ink: string }>> = {
  AUD: { fill: "#076B6F", ink: "#085559" }, // oklch(0.48 0.08 200) / oklch(0.41 0.067 200)
  CAD: { fill: "#921F3C", ink: "#760F2C" }, // oklch(0.44 0.15 12) / oklch(0.37 0.135 12)
  CHF: { fill: "#C9302D", ink: "#A92321" }, // oklch(0.55 0.19 27) / oklch(0.48 0.17 27)
  CZK: { fill: "#5D52B4", ink: "#4B4095" }, // oklch(0.5 0.15 285) / oklch(0.43 0.135 285)
  DKK: { fill: "#0D556C", ink: "#064153" }, // oklch(0.42 0.075 225) / oklch(0.35 0.063 225)
  EUR: { fill: "#2A61B1", ink: "#1E5099" }, // oklch(0.5 0.14 258) / oklch(0.44 0.13 258)
  GBP: { fill: "#643B9A", ink: "#4F2B7E" }, // oklch(0.45 0.15 300) / oklch(0.38 0.135 300)
  HKD: { fill: "#8E35A1", ink: "#742685" }, // oklch(0.5 0.18 320) / oklch(0.43 0.162 320)
  HUF: { fill: "#475408", ink: "#354003" }, // oklch(0.42 0.095 120) / oklch(0.35 0.081 120)
  JPY: { fill: "#B12B6E", ink: "#941D5A" }, // oklch(0.52 0.18 355) / oklch(0.45 0.162 355)
  MXN: { fill: "#034A2E", ink: "#043420" }, // oklch(0.36 0.08 160) / oklch(0.29 0.062 160)
  NOK: { fill: "#682226", ink: "#4F1218" }, // oklch(0.36 0.1 20) / oklch(0.29 0.09 20)
  NZD: { fill: "#26365C", ink: "#172545" }, // oklch(0.34 0.07 265) / oklch(0.27 0.063 265)
  PLN: { fill: "#7B2564", ink: "#62164F" }, // oklch(0.42 0.14 340) / oklch(0.35 0.126 340)
  SEK: { fill: "#07618F", ink: "#034D73" }, // oklch(0.47 0.105 240) / oklch(0.4 0.09 240)
  SGD: { fill: "#016A5D", ink: "#025449" }, // oklch(0.47 0.085 180) / oklch(0.4 0.072 180)
  USD: { fill: "#0B703F", ink: "#055931" }, // oklch(0.48 0.115 155) / oklch(0.41 0.099 155)
  ZAR: { fill: "#326402", ink: "#274E05" } // oklch(0.45 0.13 135) / oklch(0.38 0.107 135)
};
