import { cbc, cmac, ecb } from "@noble/ciphers/aes.js";
import { concatBytes, equalBytes } from "@noble/ciphers/utils.js";

import { truncateMac } from "./sun";

/*
 * NTAG 424 DNA secure messaging, AES mode (NT4H2421Gx data sheet §9.1, NXP AN12196 §4 and §5):
 * the cryptography of AuthenticateEV2First and of the commands sent in CommMode.MAC and
 * CommMode.Full afterwards. No I/O here: ntag424.ts sends the APDUs. Checked against the worked
 * examples of AN12196 (card-ntag424.test.ts).
 */

export const KEY_LENGTH = 16;
const BLOCK = 16;

/** A blank card's application keys: 16 zero bytes (data sheet §8.2.4.2). */
export const ZERO_KEY = new Uint8Array(KEY_LENGTH);

/** `bytes` rotated left by one byte: RndB' and RndA' of the authentication. */
export function rotateLeft(bytes: Uint8Array): Uint8Array {
  return concatBytes(bytes.subarray(1), bytes.subarray(0, 1));
}

/** AES-128-CBC without padding, the IV of 16 zeros unless given: the authentication's cipher. */
export function encryptBlocks(
  key: Uint8Array,
  data: Uint8Array,
  iv: Uint8Array = new Uint8Array(BLOCK)
): Uint8Array {
  return cbc(key, iv, { disablePadding: true }).encrypt(data);
}

export function decryptBlocks(
  key: Uint8Array,
  data: Uint8Array,
  iv: Uint8Array = new Uint8Array(BLOCK)
): Uint8Array {
  return cbc(key, iv, { disablePadding: true }).decrypt(data);
}

/** The 8-byte MAC of secure messaging: CMAC, truncated to its odd bytes (data sheet §9.1.3). */
export function macT(key: Uint8Array, data: Uint8Array): Uint8Array {
  return truncateMac(cmac(data, key));
}

/**
 * The session keys of an authentication (data sheet §9.1.7): CMAC with the key over
 * SV1 = A55A 0001 0080 || RndA[15..14] || (RndA[13..8] ⊕ RndB[15..10]) || RndB[9..0] || RndA[7..0]
 * (ENC) and the same with 5AA5 (MAC). Byte 15 is the first byte of a challenge.
 */
export function sessionKeys(
  key: Uint8Array,
  rndA: Uint8Array,
  rndB: Uint8Array
): { enc: Uint8Array; mac: Uint8Array } {
  const mixed = new Uint8Array(6);
  for (let i = 0; i < 6; i++) mixed[i] = rndA[2 + i] ^ rndB[i];
  const tail = concatBytes(rndA.subarray(0, 2), mixed, rndB.subarray(6, 16), rndA.subarray(8, 16));
  return {
    enc: cmac(concatBytes(Uint8Array.of(0xa5, 0x5a, 0x00, 0x01, 0x00, 0x80), tail), key),
    mac: cmac(concatBytes(Uint8Array.of(0x5a, 0xa5, 0x00, 0x01, 0x00, 0x80), tail), key)
  };
}

/** Padding method 2 of ISO/IEC 9797-1: always 80h, then zeros to a whole block. */
export function pad(data: Uint8Array): Uint8Array {
  const padded = new Uint8Array((Math.floor(data.length / BLOCK) + 1) * BLOCK);
  padded.set(data);
  padded[data.length] = 0x80;
  return padded;
}

/** `pad` undone; null when the padding is not method 2's. */
export function unpad(data: Uint8Array): Uint8Array | null {
  let end = data.length - 1;
  while (end >= 0 && data[end] === 0) end--;
  if (end < 0 || data[end] !== 0x80 || data.length - end > BLOCK) return null;
  return data.slice(0, end);
}

/**
 * CRC32NK of ChangeKey (data sheet §10.6.1): the IEEE 802.3 CRC-32 without its final inversion,
 * least significant byte first (AN12196 Table 25: 789DFADC for its new key).
 */
export function crc32nk(data: Uint8Array): Uint8Array {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return Uint8Array.of(crc & 0xff, (crc >>> 8) & 0xff, (crc >>> 16) & 0xff, (crc >>> 24) & 0xff);
}

/**
 * The state AuthenticateEV2First leaves on both sides: the transaction identifier, the command
 * counter and the session keys. The counter goes up by one for every command answered while
 * authenticated, whatever its communication mode (data sheet §9.1.2): `next()` after each.
 */
export class SecureSession {
  private counter = 0;

  constructor(
    readonly ti: Uint8Array,
    private readonly enc: Uint8Array,
    private readonly mac: Uint8Array
  ) {}

  get cmdCtr(): number {
    return this.counter;
  }

  /** Counts one command answered. Past FFFFh the card refuses any command (§9.1.2). */
  next(): void {
    if (this.counter >= 0xffff) throw new Error("Secure messaging counter exhausted");
    this.counter++;
  }

  private ctrBytes(counter: number): Uint8Array {
    return Uint8Array.of(counter & 0xff, (counter >> 8) & 0xff);
  }

  private iv(label: number[], counter: number): Uint8Array {
    const input = concatBytes(Uint8Array.from(label), this.ti, this.ctrBytes(counter));
    const block = new Uint8Array(BLOCK);
    block.set(input);
    return ecb(this.enc, { disablePadding: true }).encrypt(block);
  }

  /** CmdData of a CommMode.Full command, encrypted (padded first). */
  encryptCommand(data: Uint8Array): Uint8Array {
    return encryptBlocks(this.enc, pad(data), this.iv([0xa5, 0x5a], this.counter));
  }

  /** The MAC of a command: over Cmd || CmdCtr || TI || CmdHeader || CmdData. */
  commandMac(cmd: number, header: Uint8Array, data: Uint8Array): Uint8Array {
    return macT(
      this.mac,
      concatBytes(Uint8Array.of(cmd), this.ctrBytes(this.counter), this.ti, header, data)
    );
  }

  /**
   * Whether a response's MAC is the card's: over RC || CmdCtr || TI || RespData, the counter
   * already counting the command (call after `next()`).
   */
  responseMacValid(status: number, data: Uint8Array, mac: Uint8Array): boolean {
    const expected = macT(
      this.mac,
      concatBytes(Uint8Array.of(status), this.ctrBytes(this.counter), this.ti, data)
    );
    return mac.length === 8 && equalBytes(expected, mac);
  }

  /** RespData of a CommMode.Full response, decrypted and unpadded (after `next()`). */
  decryptResponse(data: Uint8Array): Uint8Array | null {
    if (data.length === 0 || data.length % BLOCK !== 0) return null;
    return unpad(decryptBlocks(this.enc, data, this.iv([0x5a, 0xa5], this.counter)));
  }
}
