import { bytesToHex } from "@noble/hashes/utils.js";
import { useEffect } from "react";

import type { SettleResult } from "@/features/payment-link/SaleSettler";
import type { Settlement } from "@/features/terminal/useSale";

/*
 * SaleSettler for the tests that say what following a sale finds (`settlements`, by the sale's key
 * in hex): reported at once. Any other sale is followed for real. Registered with
 * `jest.mock("../features/payment-link/SaleSettler", () => require("../../jest/sale-settler"))`.
 */

const actual = jest.requireActual<typeof import("@/features/payment-link/SaleSettler")>(
  "@/features/payment-link/SaleSettler"
);

export const { SETTLE_TIMEOUT_MS } = actual;

/** What following each sale finds, by the sale's key (hex). */
export const settlements = new Map<string, Settlement>();

function Settled({
  settlement,
  onDone
}: {
  settlement: Settlement;
  onDone: (result: SettleResult) => void;
}) {
  useEffect(() => {
    onDone({ kind: "settled", settlement });
  }, [settlement, onDone]);
  return null;
}

export function SaleSettler(props: Parameters<typeof actual.SaleSettler>[0]) {
  const settlement = settlements.get(bytesToHex(props.saleKey));
  return settlement ? (
    <Settled settlement={settlement} onDone={props.onDone} />
  ) : (
    <actual.SaleSettler {...props} />
  );
}
