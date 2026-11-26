import { gcm } from "@noble/ciphers/aes.js";
import { p256 } from "@noble/curves/nist.js";
import { schnorr } from "@noble/curves/secp256k1.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

import { bytesToBase64Url } from "@/lib/base64";
import { tapHashes } from "@/lib/card/hashes";
import { verifySun } from "@/lib/card/sun";
import { openWakePacket, parseWakePacket } from "@/lib/card/wake-packet";
import { decodeSignedBolt11 } from "@/lib/lightning/bolt11";
import { isValidEvent, signEvent, type NostrEvent } from "@/lib/nostr/event";
import { conversationKey, nip44Decrypt, nip44Encrypt } from "@/lib/nostr/nip44";
import { secureRandomBytes } from "@/lib/random";

import type { EngineHost } from "./host";

/*
 * The measure of the extension's JavaScript engine (the "JS engine" test of "iOS extension test",
 * staging): the app's own code of a card payment made with the app closed, run in the iOS
 * notification service extension's JavaScriptCore, whose interpreter has no JIT. Each step is
 * what that payment does, about as often, on made-up data: the relay's wake-up packet opened,
 * the card's records read from the Nostr relays (their signatures checked and their content
 * decrypted), the till's invoice read with the node that signed it, the tap checked, and the
 * card's next taps' hashes computed for the relay. The extension records each step's time and
 * memory (host.step). Throws at the first result that is not the expected one.
 */

/** The records a payment reads (state and payees of the card, a few versions on each relay). */
export const NOSTR_EVENTS = 10;
/** The next taps' hashes a refill computes (relay-sync.ts: up to CARD_HASHES_AHEAD at once). */
export const REFILL_TAPS = 500;

/** A BoltCard test vector (card-sun.test.ts): K1, K2, the UID and its tap of counter 3. */
const SUN = {
  k1: "0c3b25d92b38ae443229dd59ad34b85d",
  k2: "b45775776cb224c75bcde7ca3704e933",
  uid: "04996c6a926980",
  p: "4E2E289D945A66BB13377A728884E867",
  c: "E19CCB1FED8892CE",
  counter: 3
};

/**
 * An invoice of 12 500 sats signed by the test node of seed 7 (jest/lightning.ts, makeInvoice
 * and testNode), and that node's key.
 */
const INVOICE =
  "lnbc125u1p45n5sqpp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygshp5yg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3qxqzjcn8jxuff06vauhvagp35qcp8x3ke4gs6peq90pv0cezmgrzycdsypayr9av5a473u2c7vpsrv4rdfjtrkqk0g60m7hljhlj9aswkd3usq8qqz3s";
const INVOICE_NODE = "02989c0b76cb563971fdc9bef31ec06c3560f3249d6ee9e5d83c57625596e05f6f";

function expect(condition: boolean, what: string): void {
  if (!condition) throw new Error(`Engine probe: ${what}`);
}

/** A packet as the relay sends it to a phone (sattleme/relay, crypto.ts `seal`), base64url. */
function sealPacket(
  phonePublicKey: Uint8Array,
  text: string
): { epk: string; iv: string; ct: string } {
  const ephemeral = secureRandomBytes(32);
  try {
    const epk = p256.getPublicKey(ephemeral, false);
    const shared = p256.getSharedSecret(ephemeral, phonePublicKey, true).slice(1);
    const key = hkdf(sha256, shared, epk, utf8ToBytes("card-relay v2"), 32);
    const iv = secureRandomBytes(12);
    const ct = gcm(key, iv).encrypt(utf8ToBytes(text));
    return {
      epk: bytesToBase64Url(epk),
      iv: bytesToBase64Url(iv),
      ct: bytesToBase64Url(ct)
    };
  } finally {
    ephemeral.fill(0);
  }
}

/** Runs every step, each recorded by the host once done. */
export function runEngineProbe(host: Pick<EngineHost, "step">): { steps: number } {
  // The phone's device key and a packet for it, made before the measure.
  const deviceKey = secureRandomBytes(32);
  const wake = {
    p: SUN.p,
    c: SUN.c,
    session: "0123456789abcdef0123456789abcdef",
    wsToken: "fedcba9876543210fedcba9876543210",
    relay: "relay.example.com"
  };
  const packet = sealPacket(p256.getPublicKey(deviceKey, false), JSON.stringify(wake));
  // The card's records: signed and encrypted by a key, for another, as the own copies are.
  const author = secureRandomBytes(32);
  const reader = secureRandomBytes(32);
  host.step("prepare");

  const parsed = parseWakePacket(packet);
  const opened = parsed && openWakePacket(deviceKey, parsed);
  expect(opened?.session === wake.session && opened.wsToken === wake.wsToken, "packet");
  host.step("packet");

  const key = conversationKey(author, bytesToHex(schnorr.getPublicKey(reader)));
  const events: NostrEvent[] = [];
  for (let i = 0; i < NOSTR_EVENTS; i++) {
    events.push(
      signEvent(
        {
          created_at: 1_800_000_000 + i,
          kind: 30078,
          tags: [["d", bytesToHex(sha256(Uint8Array.of(i)))]],
          content: nip44Encrypt(JSON.stringify({ version: 1, index: i, pad: "x".repeat(400) }), key)
        },
        author
      )
    );
  }
  host.step("nostrPrepare");

  for (const event of events) expect(isValidEvent(event), "event signature");
  host.step("nostrVerify");

  const readerKey = conversationKey(reader, bytesToHex(schnorr.getPublicKey(author)));
  for (const [index, event] of events.entries()) {
    const content = JSON.parse(nip44Decrypt(event.content, readerKey)) as { index: number };
    expect(content.index === index, "event content");
  }
  host.step("nostrDecrypt");

  const decoded = decodeSignedBolt11(INVOICE);
  expect(decoded?.invoice.amountMsat === 12_500_000n, "invoice amount");
  expect(decoded?.signer() === INVOICE_NODE, "invoice signer");
  host.step("invoice");

  const k1 = hexToBytes(SUN.k1);
  const k2 = hexToBytes(SUN.k2);
  const tap = verifySun(k1, k2, hexToBytes(SUN.p), hexToBytes(SUN.c));
  expect(tap?.counter === SUN.counter && bytesToHex(tap.uid) === SUN.uid, "tap");
  host.step("tap");

  const hashes = tapHashes(k2, hexToBytes(SUN.uid), SUN.counter + 1, REFILL_TAPS);
  expect(hashes.length === REFILL_TAPS, "refill");
  host.step("refill");

  deviceKey.fill(0);
  author.fill(0);
  reader.fill(0);
  return { steps: 8 };
}
