/**
 * A UUID version 4 (RFC 9562) of 16 random bytes, formatted (random.ts, random.engine.ts:
 * `randomUuid`). The bytes are changed in place.
 */
export function uuidV4(bytes: Uint8Array): string {
  if (bytes.length !== 16) throw new Error("A UUID takes 16 bytes");
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
