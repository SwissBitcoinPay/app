/**
 * `run` of each of `items`, `size` at a time, in their order: a big team's reads and writes on the
 * relays (up to MAX_TEAM_MEMBERS members and MAX_OWNER_DEVICES devices, src/config/team.ts) do not
 * open as many connections to each relay at once. Null as soon as one gives null (the relays did
 * not answer): the batches after it are not run.
 */
export async function inBatches<I, T>(
  items: readonly I[],
  size: number,
  run: (item: I) => Promise<T | null>
): Promise<T[] | null> {
  const results: T[] = [];
  for (let start = 0; start < items.length; start += size) {
    const batch = await Promise.all(items.slice(start, start + size).map(run));
    for (const result of batch) {
      if (result === null) return null;
      results.push(result);
    }
  }
  return results;
}
