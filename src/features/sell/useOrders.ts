import { useCallback, useEffect, useState } from "react";

import { logFailure } from "@/lib/log/log";
import { limitsFrom, periodStarts } from "@/lib/mtpelerin/limits";
import type { SalePayment } from "@/lib/mtpelerin/sale";
import type { MtpOrder } from "@/lib/mtpelerin/types";

import type { SellFlow } from "./flow";

/**
 * The orders the limits count (from `limitsFrom`: the year's, and early in January the
 * month's of December too): while read, once read (null: too many to list; `readAt`: when, Unix
 * ms, what an order's state is told at), or failed. The year's alone: `ofTheYear`.
 */
export type OrdersRead =
  | { state: "loading" }
  | { state: "ready"; orders: MtpOrder[] | null; readAt: number }
  | { state: "failed" };

/**
 * The profile's orders the limits count, read as the screen shows ("Your sales", "Sale
 * limits"), again with `retry`. Their failure is the journal's, the screen says it.
 */
export function useOrders(flow: SellFlow): { read: OrdersRead; retry: () => void } {
  const [read, setRead] = useState<OrdersRead>({ state: "loading" });
  const [round, setRound] = useState(0);
  useEffect(() => {
    let live = true;
    flow.orders(limitsFrom(new Date()) * 1000).then(
      (orders) => live && setRead({ state: "ready", orders, readAt: Date.now() }),
      (error: unknown) => {
        logFailure("Reading the sales failed", error, false);
        if (live) setRead({ state: "failed" });
      }
    );
    return () => {
      live = false;
    };
  }, [flow, round]);
  const retry = useCallback(() => {
    setRead({ state: "loading" });
    setRound((value) => value + 1);
  }, []);
  return { read, retry };
}

/** The orders of `orders` made this year, as of `readAt` (Unix ms): "Your sales" lists them. */
export function ofTheYear(orders: readonly MtpOrder[], readAt: number): MtpOrder[] {
  const { year } = periodStarts(new Date(readAt));
  return orders.filter((order) => order.createdAt >= year);
}

/**
 * The wallet's payments of the invoices of `orders` Mt Pelerin tells no funds of yet, by payment
 * hash (flow.ts `walletPayments`): null while read. Its failure is the journal's: none known, the
 * sales as Mt Pelerin tells them.
 */
export function useWalletPayments(
  flow: SellFlow,
  orders: readonly MtpOrder[] | null
): ReadonlyMap<string, SalePayment> | null {
  const [read, setRead] = useState<{
    orders: readonly MtpOrder[];
    payments: ReadonlyMap<string, SalePayment>;
  } | null>(null);
  useEffect(() => {
    if (orders === null) return;
    let live = true;
    flow.walletPayments(orders).then(
      (payments) => live && setRead({ orders, payments }),
      (error: unknown) => {
        logFailure("Reading the wallet's payments of the sales failed", error, false);
        if (live) setRead({ orders, payments: new Map() });
      }
    );
    return () => {
      live = false;
    };
  }, [flow, orders]);
  // Those of these orders only: never an earlier read's.
  return read !== null && read.orders === orders ? read.payments : null;
}
