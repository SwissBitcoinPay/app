/*
 * Asking about transactions until it is told when they were sent (mempool.space's first sight or
 * BlockCypher, src/lib/onchain/broadcast-time.ts): BlockCypher without a token takes a hundred
 * requests an hour from an IP address, so what could not be told is asked again soon, then less and
 * less often. Shared by the point of sale's sale (useOnchainTimes) and the checkout page
 * (useCheckoutLink), each deciding what an answer means.
 */

/** Delay before the `attempt`-th new read of when a transaction was received: 5 s, 10 s… 10 min. */
export function receivedRetryMs(attempt: number): number {
  return Math.min(5000 * 2 ** attempt, 10 * 60 * 1000);
}

/**
 * Runs `ask` for each of `items` in turn, then again, after receivedRetryMs, for those it answered
 * `true` (not told yet) or that failed, until none is left or the returned function is called.
 * `alive()` tells `ask`, after its request, whether its answer is still wanted.
 */
export function askUntilTold<T>(
  items: readonly T[],
  ask: (item: T, alive: () => boolean) => Promise<boolean>,
  onError: (error: unknown) => void = () => {}
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0;
  const alive = () => !stopped;
  const run = async (pending: readonly T[]) => {
    const again: T[] = [];
    for (const item of pending) {
      if (stopped) return;
      try {
        if (await ask(item, alive)) again.push(item);
      } catch (error) {
        onError(error);
        again.push(item);
      }
    }
    if (!stopped && again.length > 0) {
      timer = setTimeout(() => void run(again), receivedRetryMs(attempt++));
    }
  };
  void run(items);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

/**
 * Whether what was not told for `key` is to be asked again: within `forMs` of the first time it was
 * not (kept in `since`, Date.now()).
 */
export function stillAskingSince(since: Map<string, number>, key: string, forMs: number): boolean {
  const first = since.get(key) ?? Date.now();
  since.set(key, first);
  return Date.now() - first < forMs;
}
