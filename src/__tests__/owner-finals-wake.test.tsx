import { renderHook } from "@testing-library/react-native";

import { DEFAULT_RELAYS } from "@/config/relays";
import type { ActivityItem, LinkInfo } from "@/features/activity/model";
import { useAskOwnerFinals } from "@/features/activity/useActivity";
import {
  OWNER_FINALS_ASK_GAP_MS,
  askOwnerFinals,
  onOwnerFinalsAsked,
  resetOwnerFinalsAsks
} from "@/features/payment-link/finals-wake";

/*
 * "Wallet" asks the owner's device for its final versions as soon as it shows a link paid
 * without one (finals-wake.ts): an assistant's invoice paid over Lightning would otherwise stay
 * "Confirming" until the owner's next round, 6 hours later.
 */

const T0 = 1_780_000_000_000;

beforeEach(() => {
  resetOwnerFinalsAsks();
});

describe("askOwnerFinals", () => {
  it("asks at once for a link, then not again within the gap, then again past it", () => {
    const asked = jest.fn();
    const stop = onOwnerFinalsAsked(asked);
    try {
      expect(askOwnerFinals(["l1"], T0)).toBe(true);
      expect(asked).toHaveBeenCalledTimes(1);
      // Each read of the list (every minute) asks again: let through once per gap.
      expect(askOwnerFinals(["l1"], T0 + 60_000)).toBe(false);
      expect(askOwnerFinals(["l1"], T0 + OWNER_FINALS_ASK_GAP_MS - 1)).toBe(false);
      expect(asked).toHaveBeenCalledTimes(1);
      // Its round could not settle it yet (an on-chain payment being confirmed): asked again.
      expect(askOwnerFinals(["l1"], T0 + OWNER_FINALS_ASK_GAP_MS)).toBe(true);
      expect(asked).toHaveBeenCalledTimes(2);
    } finally {
      stop();
    }
  });

  it("asks at once for a link paid since, whatever was asked for another one", () => {
    const asked = jest.fn();
    const stop = onOwnerFinalsAsked(asked);
    try {
      askOwnerFinals(["l1"], T0);
      expect(askOwnerFinals(["l1", "l2"], T0 + 1000)).toBe(true);
      expect(asked).toHaveBeenCalledTimes(2);
      // Both asked within the gap: nothing more.
      expect(askOwnerFinals(["l2", "l1"], T0 + 2000)).toBe(false);
      expect(askOwnerFinals([], T0 + 3000)).toBe(false);
      expect(asked).toHaveBeenCalledTimes(2);
    } finally {
      stop();
    }
  });

  it("tells nobody once removed", () => {
    const asked = jest.fn();
    onOwnerFinalsAsked(asked)();
    askOwnerFinals(["l1"], T0);
    expect(asked).not.toHaveBeenCalled();
  });
});

describe("useAskOwnerFinals", () => {
  const link = (id: string, over: Partial<LinkInfo> = {}): LinkInfo => ({
    id,
    saleAuthor: `sale-${id}`,
    key: new Uint8Array(32),
    relays: DEFAULT_RELAYS,
    createdAt: 0,
    fiat: { minor: 108, digits: 2, currency: "CHF" },
    note: "",
    endsAt: 0,
    final: null,
    by: null,
    ...over
  });
  const row = (id: string, state: ActivityItem["state"]): ActivityItem => ({
    id: `link:${id}`,
    source: "link",
    timestamp: 0,
    note: "",
    fiat: { minor: 108, digits: 2, currency: "CHF" },
    sats: 1881n,
    state,
    rest: null,
    by: null,
    payments: [],
    link: { id, endsAt: 0, key: new Uint8Array(32), relays: DEFAULT_RELAYS }
  });

  it("asks for the links paid without a final version while the list shows, at each read", async () => {
    jest.useFakeTimers({ now: T0 });
    const asked = jest.fn();
    const stop = onOwnerFinalsAsked(asked);
    try {
      const items = [row("l1", "unconfirmed"), row("l2", "open")];
      const { rerender } = await renderHook(
        ({ links, active }: { links: LinkInfo[]; active: boolean }) =>
          useAskOwnerFinals(items, links, active),
        { initialProps: { links: [link("l1"), link("l2")], active: false } }
      );
      // Not shown (another screen focused): nothing asked.
      expect(asked).not.toHaveBeenCalled();
      await rerender({ links: [link("l1"), link("l2")], active: true });
      expect(asked).toHaveBeenCalledTimes(1);
      // The next read of the links, a minute later: within the gap.
      jest.setSystemTime(T0 + 60_000);
      await rerender({ links: [link("l1"), link("l2")], active: true });
      expect(asked).toHaveBeenCalledTimes(1);
      // A read past the gap, the link still without its final version: asked again.
      jest.setSystemTime(T0 + OWNER_FINALS_ASK_GAP_MS);
      await rerender({ links: [link("l1"), link("l2")], active: true });
      expect(asked).toHaveBeenCalledTimes(2);
    } finally {
      stop();
      jest.useRealTimers();
    }
  });

  it("asks for nothing before the list is built, nor for a link whose final version is there", async () => {
    const asked = jest.fn();
    const stop = onOwnerFinalsAsked(asked);
    try {
      const paid = {
        status: "paid" as const,
        received: 1881n,
        due: 1881n,
        lightning: [],
        transactions: []
      };
      await renderHook(() => useAskOwnerFinals(null, [link("l1")], true));
      await renderHook(() =>
        useAskOwnerFinals([row("l1", "unconfirmed")], [link("l1", { final: paid })], true)
      );
      expect(asked).not.toHaveBeenCalled();
    } finally {
      stop();
    }
  });
});
