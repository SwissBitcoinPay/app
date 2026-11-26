/**
 * A lone surrogate: half of a UTF-16 pair without its other half (a string cut in a pair, a forged
 * record). UTF-8 cannot carry it: `encodeURIComponent` throws on it, `TextEncoder` writes U+FFFD.
 */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** `text` with each lone surrogate as U+FFFD, as a UTF-8 encoder writes it. */
export function wellFormed(text: string): string {
  return text.replace(LONE_SURROGATE, "�");
}

/** Whether `text` holds a lone surrogate: a text UTF-8 cannot carry. */
export function hasLoneSurrogate(text: string): boolean {
  // U+FFFD in place of a surrogate changes the text exactly when there is one.
  return wellFormed(text) !== text;
}
