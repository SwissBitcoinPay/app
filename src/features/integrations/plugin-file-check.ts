import { bytesToUtf8 } from "@noble/ciphers/utils.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

/** A plugin's file read and checked: its text, and the number of the line it ends on. */
export type CheckedFile = { text: string; lastLine: number };

/**
 * The text of a plugin's file whose bytes hash to `sha256` (hex), as a code editor numbers its
 * lines: a file ending with a line break ends on an empty line, one more than its line breaks (Wix's
 * editor shows 17 748 for the 17 747 line breaks of the Wix plugin 1.0.0's own file). Null for any other
 * bytes: nothing of them is copied.
 */
export function checkedFile(bytes: Uint8Array, expected: string): CheckedFile | null {
  if (bytesToHex(sha256(bytes)) !== expected.toLowerCase()) return null;
  const text = bytesToUtf8(bytes);
  let breaks = 0;
  for (let index = text.indexOf("\n"); index !== -1; index = text.indexOf("\n", index + 1)) {
    breaks += 1;
  }
  return { text, lastLine: breaks + 1 };
}
