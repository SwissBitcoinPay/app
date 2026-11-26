/*
 * atob and btoa as the HTML standard has them (forgiving-base64 decode and encode, "Base64 utility
 * methods"), for JavaScriptCore, which has neither: whatwg-url-minimum reads its tables with atob
 * as it loads (runtime/index.ts). The app's own base64.ts is stricter (one spelling per value), as
 * its records need: this one reads what a browser reads.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function invalidCharacter(message: string): Error {
  const error = new Error(message);
  error.name = "InvalidCharacterError";
  return error;
}

export function webAtob(input: unknown): string {
  // ASCII whitespace: TAB, LF, FF, CR, SPACE.
  let data = String(input).replace(/[\t\n\f\r ]/g, "");
  if (data.length % 4 === 0) data = data.replace(/={1,2}$/, "");
  if (data.length % 4 === 1 || /[^A-Za-z0-9+/]/.test(data)) {
    throw invalidCharacter("The string to be decoded is not correctly encoded.");
  }
  let output = "";
  let buffer = 0;
  let bits = 0;
  for (const char of data) {
    buffer = (buffer << 6) | ALPHABET.indexOf(char);
    bits += 6;
    if (bits === 24) {
      output += String.fromCharCode((buffer >> 16) & 0xff, (buffer >> 8) & 0xff, buffer & 0xff);
      buffer = 0;
      bits = 0;
    }
  }
  if (bits === 12) output += String.fromCharCode((buffer >> 4) & 0xff);
  else if (bits === 18) {
    output += String.fromCharCode((buffer >> 10) & 0xff, (buffer >> 2) & 0xff);
  }
  return output;
}

export function webBtoa(input: unknown): string {
  const data = String(input);
  for (let index = 0; index < data.length; index++) {
    if (data.charCodeAt(index) > 0xff) {
      throw invalidCharacter("The string to be encoded contains characters outside of Latin-1.");
    }
  }
  let output = "";
  for (let index = 0; index < data.length; index += 3) {
    const a = data.charCodeAt(index);
    const b = index + 1 < data.length ? data.charCodeAt(index + 1) : NaN;
    const c = index + 2 < data.length ? data.charCodeAt(index + 2) : NaN;
    const chunk = (a << 16) | ((b || 0) << 8) | (c || 0);
    output += ALPHABET[(chunk >> 18) & 63] + ALPHABET[(chunk >> 12) & 63];
    output += Number.isNaN(b) ? "=" : ALPHABET[(chunk >> 6) & 63];
    output += Number.isNaN(c) ? "=" : ALPHABET[chunk & 63];
  }
  return output;
}
