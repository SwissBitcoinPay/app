/**
 * IBAN structural check (ISO 13616): country code, check digits and the
 * mod-97 checksum. It does not prove the account exists.
 */

/** Removes spaces and uppercases: "ch93 0076 2011…" -> "CH9300762011…". */
export function compactIban(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

/** Groups by four for display: "CH9300762011623852957" -> "CH93 0076 2011 6238 5295 7". */
export function formatIban(value: string): string {
  return compactIban(value)
    .replace(/(.{4})/g, "$1 ")
    .trim();
}

export function isValidIban(value: string): boolean {
  const iban = compactIban(value);
  // 2 letters + 2 digits + up to 30 alphanumerics; the shortest IBAN (Norway) has 15 characters.
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  // Letters become 10..35; the remainder is computed digit by digit to stay within integer range.
  let remainder = 0;
  for (const char of rearranged) {
    const digits = /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of digits) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }
  return remainder === 1;
}
