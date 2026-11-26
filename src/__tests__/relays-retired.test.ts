import { DEFAULT_RELAYS, MAX_RELAYS, RETIRED_RELAYS } from "@/config/relays";
import { normalizeRelayUrl } from "@/lib/relays/list";
import { keptRelays, replaceRetiredRelays } from "@/lib/relays/retired";

const TABLE = new Map([
  ["wss://dead.example.com", "wss://new.example.com"],
  ["wss://old.example.com", "wss://new.example.com"],
  ["wss://former.example.com", "wss://relay.nostr.net"]
]);

describe("the table of the relays sattle.me retired", () => {
  it("names relays in their one spelling, each replaced by a relay that is not retired", () => {
    for (const [retired, replacement] of RETIRED_RELAYS) {
      expect(normalizeRelayUrl(retired)).toBe(retired);
      expect(normalizeRelayUrl(replacement)).toBe(replacement);
      expect(replacement).not.toBe(retired);
      // One step only: a list replaced once holds no retired relay any more.
      expect(RETIRED_RELAYS.has(replacement)).toBe(false);
    }
  });

  it("is not in the default list: a new account never starts with a retired relay", () => {
    for (const relay of DEFAULT_RELAYS) expect(RETIRED_RELAYS.has(relay)).toBe(false);
  });
});

describe("a list's retired relays", () => {
  it("are replaced where they stood, the merchant's own relays untouched", () => {
    expect(
      replaceRetiredRelays(
        ["wss://relay.bakery.example", "wss://dead.example.com", "wss://nostr.oxtr.dev"],
        TABLE
      )
    ).toEqual(["wss://relay.bakery.example", "wss://new.example.com", "wss://nostr.oxtr.dev"]);
  });

  it("leave a list without any as it is (null: nothing to move)", () => {
    expect(replaceRetiredRelays(DEFAULT_RELAYS, TABLE)).toBeNull();
    expect(replaceRetiredRelays(["wss://relay.bakery.example"], TABLE)).toBeNull();
  });

  it("are dropped when their replacement is in the list already, before or after them", () => {
    expect(
      replaceRetiredRelays(
        ["wss://dead.example.com", "wss://a.example.com", "wss://new.example.com"],
        TABLE
      )
    ).toEqual(["wss://a.example.com", "wss://new.example.com"]);
    expect(
      replaceRetiredRelays(["wss://new.example.com", "wss://dead.example.com"], TABLE)
    ).toEqual(["wss://new.example.com"]);
    // Two retired for the same replacement: it comes once.
    expect(
      replaceRetiredRelays(["wss://dead.example.com", "wss://old.example.com"], TABLE)
    ).toEqual(["wss://new.example.com"]);
    // A replacement among the default relays the account kept.
    expect(
      replaceRetiredRelays(["wss://relay.nostr.net", "wss://former.example.com"], TABLE)
    ).toEqual(["wss://relay.nostr.net"]);
  });

  it("never make a list longer, nor an invalid one", () => {
    const full = Array.from({ length: MAX_RELAYS - 1 }, (_, n) => `wss://r${n}.example.com`);
    expect(replaceRetiredRelays([...full, "wss://dead.example.com"], TABLE)).toEqual([
      ...full,
      "wss://new.example.com"
    ]);
    // A damaged table moves nothing.
    expect(
      replaceRetiredRelays(["wss://dead.example.com"], new Map([["wss://dead.example.com", "x"]]))
    ).toBeNull();
  });

  it("are left out of what the move reads and writes on the list it leaves", () => {
    expect(
      keptRelays(
        ["wss://dead.example.com", "wss://a.example.com", "wss://former.example.com"],
        TABLE
      )
    ).toEqual(["wss://a.example.com"]);
    expect(keptRelays(["wss://dead.example.com"], TABLE)).toEqual([]);
  });
});
