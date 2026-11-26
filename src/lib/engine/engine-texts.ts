import type { TFunction } from "i18next";

import { FALLBACK_LANGUAGE, toLanguage } from "@/i18n/languages";

import texts from "./engine-texts.json";

/*
 * The app's words in the iOS extension's engine: the point of sale's sentences of a declined card
 * payment (decline-message.ts) and the notification of a card payment (card-notices.ts). The app's
 * own translations (src/i18n/locales/) of ENGINE_TEXT_KEYS, copied into engine-texts.json, which the
 * engine bundles instead of every translation of the app (1.8 MB). Equal to them in every
 * language, and each text equal to what i18next writes of it (interpolation, plurals):
 * extension-engine.test.ts.
 */

/** The translations the engine holds: each key with what it holds under it. */
export const ENGINE_TEXT_KEYS = [
  "card.decline",
  "card.notice",
  "card.payment.failure",
  "card.payment.delay",
  "card.payee.quoted",
  "card.payee.unnamed",
  "card.payee.node",
  "cards.unnamed"
] as const;

type Tree = { [key: string]: string | Tree };

/** The text at `key` (dotted) in `tree`, null for none. */
function textAt(tree: Tree | undefined, key: string): string | null {
  let node: string | Tree | undefined = tree;
  for (const part of key.split(".")) {
    if (typeof node !== "object") return null;
    node = node[part];
  }
  return typeof node === "string" ? node : null;
}

/** `{{name}}` in `text` replaced by the value given, as i18next does (no escaping, as the app's). */
function interpolate(text: string, values: Record<string, unknown>): string {
  return text.replace(/\{\{\s*([^{}\s]+)\s*\}\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : whole
  );
}

/**
 * The `t` of the engine in `language` (a BCP 47 tag, as the app reads one: toLanguage): a key of
 * ENGINE_TEXT_KEYS in that language, else in English (the app's fallback), else the key itself; a
 * `count` picks its plural (`_one`, `_other`: Intl.PluralRules, as i18next).
 */
export function engineT(language: string): TFunction {
  const code = toLanguage(language);
  const all = texts as unknown as Record<string, Tree>;
  const find = (key: string) => textAt(all[code], key) ?? textAt(all[FALLBACK_LANGUAGE], key);
  const t = (key: string, values: Record<string, unknown> = {}) => {
    let text: string | null = null;
    if (typeof values.count === "number") {
      text = find(`${key}_${new Intl.PluralRules(code).select(values.count)}`);
    }
    text ??= find(key);
    return text === null ? key : interpolate(text, values);
  };
  return t as unknown as TFunction;
}
