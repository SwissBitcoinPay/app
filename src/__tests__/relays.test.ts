import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

import { DEFAULT_RELAYS, MAX_RELAYS } from "@/config/relays";
import {
  loadDeviceRelays,
  resetDeviceRelays,
  saveDeviceRelays,
  clearDeviceRelays
} from "@/features/relays/device-relays";
import { currentRelays, hasOwnRelays } from "@/lib/relays/current";
import {
  MAX_URL_LENGTH,
  decodeRelayList,
  encodeRelayList,
  mayBeOnLocalNetwork,
  normalizeRelayUrl,
  parseRelayList,
  relayUrlError,
  unionRelays
} from "@/lib/relays/list";
import { RELAYS_KEY } from "@/lib/relays/stored";

import type * as SecureStoreFake from "../../jest/expo-secure-store";

import relayUrls from "./fixtures/checkout-spec/relay-urls.json";

const secureStore = jest.requireMock<typeof SecureStoreFake>("expo-secure-store");

// Node's types are not loaded (tsconfig `types` only lists jest): only what this test needs.
declare const __dirname: string;
const fs = jest.requireActual<{ readFileSync(path: string): Uint8Array }>("fs");
const { join } = jest.requireActual<{ join(...segments: string[]): string }>("path");

describe("relay addresses", () => {
  it("are written one way: wss://, the host in lower case, no trailing slash", () => {
    expect(normalizeRelayUrl("relay.bakery.example")).toBe("wss://relay.bakery.example");
    expect(normalizeRelayUrl("  WSS://Relay.Bakery.EXAMPLE/  ")).toBe("wss://relay.bakery.example");
    expect(normalizeRelayUrl("relay.example.com:4443/nostr/")).toBe(
      "wss://relay.example.com:4443/nostr"
    );
    // A path keeps its case.
    expect(normalizeRelayUrl("relay.example.com/Inbox")).toBe("wss://relay.example.com/Inbox");
  });

  it("refuses what is not a complete address of a secure relay", () => {
    for (const input of [
      "",
      "relay",
      "ws://relay.example.com",
      "https://relay.example.com",
      "relay example.com",
      "relay.example.com?x=1",
      "relay.example.com#a",
      "relay.example.com/a,b",
      "relay.example.com:0",
      "relay.example.com:70000",
      `${"a".repeat(MAX_URL_LENGTH)}.ch`
    ]) {
      expect(normalizeRelayUrl(input)).toBeNull();
    }
  });

  it("tells why one cannot be added", () => {
    const list = ["wss://nos.lol"];
    expect(relayUrlError("  ", list)).toBe("empty");
    expect(relayUrlError("relay", list)).toBe("incomplete");
    expect(relayUrlError("NOS.LOL/", list)).toBe("duplicate");
    expect(relayUrlError("relay.bakery.example", list)).toBeNull();
    // The device itself (RFC 6761): an integration's server refuses it (checkout-spec SPEC.md §9).
    expect(relayUrlError("relay.localhost", list)).toBe("local");
    expect(relayUrlError("wss://a.relay.localhost:6379", list)).toBe("local");
    expect(relayUrlError("localhost.relay.example", list)).toBeNull();
    // Kept when read: nothing saved with one becomes unreadable.
    expect(parseRelayList(["wss://relay.localhost"])).toEqual(["wss://relay.localhost"]);
  });

  /*
   * What a merchant may add, in its one spelling, is a relay address of checkout-spec 0.1.0
   * (SPEC.md §9; its vectors/relay-urls.json, copied byte for byte): the integration's key carries
   * the list, which its servers read.
   */
  describe("relay-urls.json", () => {
    it("is checkout-spec's vectors/relay-urls.json", () => {
      const bytes = fs.readFileSync(
        join(__dirname, "fixtures", "checkout-spec", "relay-urls.json")
      );
      expect(bytesToHex(sha256(bytes))).toBe(
        "5353ed3556f7a30f8da276ca8370137aee6a331ff7b2905c8f959cfbbaaf7eb6"
      );
    });

    it.each(relayUrls.cases)("$url", ({ url, valid }) => {
      expect(relayUrlError(url, []) === null && normalizeRelayUrl(url) === url).toBe(valid);
    });
  });

  // "Test the connection" asks the browser for local network access for
  // these only (relay-test.ts).
  it("may be counted as local by a browser: Tailscale's names and names of the local network", () => {
    for (const relay of [
      "wss://umbrel-1.tail1234.ts.net:8443",
      "wss://umbrel-1.tail1234.ts.net/nostr",
      "wss://umbrel.local:4848",
      "wss://relay.home.arpa",
      "wss://relay.internal",
      "wss://nas.lan",
      "wss://nas.home",
      "wss://relay.localdomain"
    ]) {
      expect(mayBeOnLocalNetwork(relay)).toBe(true);
    }
    for (const relay of [
      "wss://nos.lol",
      "wss://ts.net",
      "wss://ts.net.example.com",
      "wss://relay.example.com:4443/relay.local",
      "wss://fritz.box",
      "wss://relay.localhost"
    ]) {
      expect(mayBeOnLocalNetwork(relay)).toBe(false);
    }
  });
});

describe("relay lists", () => {
  it("hold 1 to MAX_RELAYS addresses, each once and in its one spelling", () => {
    expect(parseRelayList([...DEFAULT_RELAYS])).toEqual(DEFAULT_RELAYS);
    expect(parseRelayList([])).toBeNull();
    expect(parseRelayList(["wss://nos.lol", "wss://nos.lol"])).toBeNull();
    expect(parseRelayList(["wss://NOS.lol"])).toBeNull();
    expect(parseRelayList("wss://nos.lol")).toBeNull();
    const eleven = Array.from({ length: MAX_RELAYS + 1 }, (_, i) => `wss://r${i}.example.com`);
    expect(parseRelayList(eleven)).toBeNull();
    expect(parseRelayList(eleven.slice(0, MAX_RELAYS))).toHaveLength(MAX_RELAYS);
  });

  it("travel in a URL fragment and come back the same, without a dot", () => {
    const list = ["wss://relay.bakery.example", "wss://relay.example.com:4443/nostr"];
    const text = encodeRelayList(list);
    expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeRelayList(text)).toEqual(list);
    expect(decodeRelayList(encodeRelayList(DEFAULT_RELAYS))).toEqual(DEFAULT_RELAYS);
    expect(decodeRelayList("")).toBeNull();
    expect(decodeRelayList("@@@")).toBeNull();
    // A list of the longest addresses stays below the Keychain's 2 KB once encoded.
    const longest = Array.from(
      { length: MAX_RELAYS },
      (_, i) => `wss://${String(i).padStart(2, "0")}${"a".repeat(MAX_URL_LENGTH - 13)}.ch`
    );
    expect(parseRelayList(longest)).toEqual(longest);
    expect(encodeRelayList(longest).length).toBeLessThan(1800);
  });

  it("join without repeating a relay", () => {
    expect(unionRelays(["wss://a.ch", "wss://b.ch"], ["wss://b.ch", "wss://c.ch"])).toEqual([
      "wss://a.ch",
      "wss://b.ch",
      "wss://c.ch"
    ]);
  });
});

describe("the device's relays", () => {
  beforeEach(() => resetDeviceRelays());

  it("are the default ones until the device has its own", async () => {
    await loadDeviceRelays();
    expect(hasOwnRelays()).toBe(false);
    expect(currentRelays()).toEqual(DEFAULT_RELAYS);
  });

  it('are saved on the device, read back at launch, and forgotten by "Log out"', async () => {
    const own = ["wss://relay.bakery.example"];
    await saveDeviceRelays(own);
    expect(currentRelays()).toEqual(own);
    expect(JSON.parse(secureStore.items.get(RELAYS_KEY)!)).toEqual({ version: 1, relays: own });

    resetDeviceRelays();
    expect(currentRelays()).toEqual(DEFAULT_RELAYS);
    await loadDeviceRelays();
    expect(currentRelays()).toEqual(own);

    await clearDeviceRelays();
    expect(currentRelays()).toEqual(DEFAULT_RELAYS);
    expect(secureStore.items.has(RELAYS_KEY)).toBe(false);
  });

  it("are five by default", () => {
    expect(DEFAULT_RELAYS).toEqual([
      "wss://relay.nostr.net",
      "wss://nostr.oxtr.dev",
      "wss://relay.coinos.io",
      "wss://relay.nostrfeed.com",
      "wss://no.str.cr"
    ]);
  });

  it("ignore a damaged record", async () => {
    secureStore.items.set(RELAYS_KEY, JSON.stringify({ version: 1, relays: ["http://x.ch"] }));
    await loadDeviceRelays();
    expect(currentRelays()).toEqual(DEFAULT_RELAYS);
  });
});
