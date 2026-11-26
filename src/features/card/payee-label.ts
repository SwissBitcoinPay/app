import type { TFunction } from "i18next";

import type { CardPayeeView } from "@/lib/card/payee-decision";

/*
 * A merchant identified by the node its invoice pays (payee-proof.ts) is named by the alias it
 * announces (src/lib/lightning/node-alias.ts), its key shortened under it; without one (a private
 * node, mempool.space out of reach), its key shortened is its name for the holder, beside the mark
 * of how it is identified (PayeeMark.tsx).
 */

/** How a merchant is identified: its Lightning address (the point of sale's proof), or its node. */
export type PayeeKind = "address" | "node";

/** Hex digits shown at each end of a node's key: more than anyone can match at both by chance. */
const NODE_DIGITS = 8;

/** "030936e7…44270d8a": a node's key, shortened (the whole key is what approves it). */
export function shortNode(node: string): string {
  return `${node.slice(0, NODE_DIGITS)}…${node.slice(-NODE_DIGITS)}`;
}

/** "Node 030936e7…44270d8a": a merchant identified by its node, as named to the holder. */
export function nodeName(node: string, t: TFunction): string {
  return t("card.payee.node", { node: shortNode(node) });
}

/** How it is identified, in words ("identified by its Lightning address"). */
export function payeeKindText(kind: PayeeKind, t: TFunction): string {
  return t(`card.payee.by.${kind}`);
}

/** Its name: the one it declared, its node's for a node, else "Unknown name". */
export function payeeName(payee: Pick<CardPayeeView, "name" | "node">, t: TFunction): string {
  return payee.name ?? (payee.node === null ? t("card.payee.unnamed") : nodeName(payee.node, t));
}
