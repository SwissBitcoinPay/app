import { inBatches } from "@/lib/batches";

describe("inBatches", () => {
  it("runs a few items at a time, gives their results in order, and stops at a null", async () => {
    const items = Array.from({ length: 12 }, (_, index) => index);
    const started: number[] = [];
    let running = 0;
    let most = 0;
    const run = async (item: number) => {
      started.push(item);
      running += 1;
      most = Math.max(most, running);
      await Promise.resolve();
      running -= 1;
      return item === 7 ? null : item * 10;
    };

    expect(await inBatches(items.slice(0, 7), 5, run)).toEqual([0, 10, 20, 30, 40, 50, 60]);
    expect(most).toBe(5);

    started.length = 0;
    expect(await inBatches(items, 5, run)).toBeNull();
    // The batch holding the null ran whole; the one after it never started.
    expect(started).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

    expect(await inBatches([], 5, run)).toEqual([]);
  });
});
