import { matchesFilter } from "@/lib/nostr/relay-bounds";

const EVENT = {
  id: "1".repeat(64),
  pubkey: "a".repeat(64),
  created_at: 1_790_000_000,
  kind: 30078,
  tags: [
    ["e", "x"],
    ["d", "address"],
    ["a", `30078:${"a".repeat(64)}:address`]
  ],
  content: "",
  sig: "0".repeat(128)
};

describe("what a relay sends, against the filter asked (NIP-01)", () => {
  it("matches an event every condition of the filter holds for, none asked included", () => {
    expect(matchesFilter(EVENT, {})).toBe(true);
    expect(
      matchesFilter(EVENT, {
        ids: ["0".repeat(64), EVENT.id],
        kinds: [1, 30078],
        authors: ["b".repeat(64), EVENT.pubkey],
        "#d": ["other", "address"],
        "#a": [`30078:${"a".repeat(64)}:address`],
        since: EVENT.created_at,
        until: EVENT.created_at,
        limit: 1
      })
    ).toBe(true);
  });

  it("refuses an event one condition fails for", () => {
    expect(matchesFilter(EVENT, { ids: ["0".repeat(64)] })).toBe(false);
    expect(matchesFilter(EVENT, { kinds: [1] })).toBe(false);
    expect(matchesFilter(EVENT, { authors: ["b".repeat(64)] })).toBe(false);
    expect(matchesFilter(EVENT, { "#d": ["other"] })).toBe(false);
    // A tag's value only, under its own name: the `e` tag's "x" is no `d` tag.
    expect(matchesFilter(EVENT, { "#d": ["x"] })).toBe(false);
    expect(matchesFilter(EVENT, { "#a": ["address"] })).toBe(false);
    expect(matchesFilter(EVENT, { since: EVENT.created_at + 1 })).toBe(false);
    expect(matchesFilter(EVENT, { until: EVENT.created_at - 1 })).toBe(false);
  });

  it("refuses what is no event the filter can tell, whatever its shape", () => {
    for (const value of [null, undefined, "event", 42, [], [EVENT]]) {
      expect(matchesFilter(value, {})).toBe(false);
    }
    expect(matchesFilter({ ...EVENT, kind: "30078" }, { kinds: [30078] })).toBe(false);
    expect(matchesFilter({ ...EVENT, pubkey: 1 }, { authors: [EVENT.pubkey] })).toBe(false);
    expect(matchesFilter({ ...EVENT, id: null }, { ids: [EVENT.id] })).toBe(false);
    expect(matchesFilter({ ...EVENT, created_at: "1790000000" }, { since: 0 })).toBe(false);
    expect(matchesFilter({ ...EVENT, tags: "d address" }, { "#d": ["address"] })).toBe(false);
    expect(matchesFilter({ ...EVENT, tags: [null, "d", ["d"]] }, { "#d": ["address"] })).toBe(
      false
    );
    expect(matchesFilter({ ...EVENT, tags: [["d", ["address"]]] }, { "#d": ["address"] })).toBe(
      false
    );
  });
});
