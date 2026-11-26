import {
  edgeScroll,
  FULL_SWAY_SPEED,
  moveId,
  pageScroll,
  swayOf,
  targetIndex,
  withCurrentIds
} from "@/features/card/reorder";

describe("a card moved in a line", () => {
  it("goes to its new place, the others keeping their order", () => {
    expect(moveId(["a", "b", "c", "d"], "a", 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveId(["a", "b", "c", "d"], "d", 0)).toEqual(["d", "a", "b", "c"]);
    expect(moveId(["a", "b", "c"], "b", 1)).toEqual(["a", "b", "c"]);
    // Clamped to the line; a card not in it changes nothing.
    expect(moveId(["a", "b", "c"], "a", 9)).toEqual(["b", "c", "a"]);
    expect(moveId(["a", "b", "c"], "c", -2)).toEqual(["c", "a", "b"]);
    expect(moveId(["a", "b"], "z", 0)).toEqual(["a", "b"]);
  });
});

describe("an order chosen while the cards change", () => {
  it("drops the cards gone and puts the cards added last", () => {
    expect(withCurrentIds(["c", "a", "b"], ["a", "b", "c"])).toEqual(["c", "a", "b"]);
    expect(withCurrentIds(["c", "a", "b"], ["a", "c"])).toEqual(["c", "a"]);
    expect(withCurrentIds(["b", "a"], ["a", "b", "d", "c"])).toEqual(["b", "a", "d", "c"]);
    expect(withCurrentIds([], ["a", "b"])).toEqual(["a", "b"]);
  });
});

describe("the place a dragged card points", () => {
  it("is the nearest one, within the line", () => {
    expect(targetIndex(0, 29, 60, 3)).toBe(0);
    expect(targetIndex(0, 31, 60, 3)).toBe(1);
    expect(targetIndex(0, 95, 60, 3)).toBe(2);
    expect(targetIndex(0, 500, 60, 3)).toBe(2);
    expect(targetIndex(2, -91, 60, 3)).toBe(0);
    expect(targetIndex(1, -500, 60, 3)).toBe(0);
    expect(targetIndex(0, 10, 60, 0)).toBe(0);
    expect(targetIndex(1, 10, 0, 3)).toBe(0);
  });
});

describe("a dragged card near an end of what shows", () => {
  it("scrolls the line back or on, not elsewhere", () => {
    // A card 156 long in 800 shown, within 72 of an end.
    expect(edgeScroll(71, 156, 800, 72, 14)).toBe(-14);
    expect(edgeScroll(-40, 156, 800, 72, 14)).toBe(-14);
    expect(edgeScroll(72, 156, 800, 72, 14)).toBe(0);
    expect(edgeScroll(572, 156, 800, 72, 14)).toBe(0);
    expect(edgeScroll(573, 156, 800, 72, 14)).toBe(14);
    // Not measured yet: nothing.
    expect(edgeScroll(0, 156, 0, 72, 14)).toBe(0);
  });
});

describe("an arrow of the row", () => {
  it("scrolls what shows of whole cards, one less, one at least", () => {
    expect(pageScroll(1116, 174)).toBe(5 * 174);
    expect(pageScroll(400, 174)).toBe(174);
    expect(pageScroll(100, 174)).toBe(174);
    expect(pageScroll(400, 0)).toBe(0);
  });
});

describe("how far a dragged card leans with its movement", () => {
  it("follows its speed, either way, up to the most", () => {
    expect(swayOf(0, 6)).toBe(0);
    expect(swayOf(FULL_SWAY_SPEED / 2, 6)).toBeCloseTo(3);
    expect(swayOf(-FULL_SWAY_SPEED / 2, 6)).toBeCloseTo(-3);
    expect(swayOf(10, 6)).toBe(6);
    expect(swayOf(-10, 6)).toBe(-6);
    // No lean asked, or a speed that is not one: none.
    expect(swayOf(1, 0)).toBe(0);
    expect(swayOf(Number.NaN, 6)).toBe(0);
    expect(swayOf(Number.POSITIVE_INFINITY, 6)).toBe(0);
  });
});
