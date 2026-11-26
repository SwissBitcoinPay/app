import { WalletError } from "./errors";
import type { RecoveryBuild, RecoveryLeaf, RecoveryMethod, RecoveryTransaction } from "./types";

/*
 * What both wallet layers (wallet.ts, wallet.web.ts) check the same of a recovery of funds that
 * left the balance (spark-sdk 0.28.4, `prepareRecoverFunds` / `recoverFunds`): the SDK's answers
 * are read field by field, as its payments are, and refused whole when out of shape: the app
 * broadcasts these transactions and records them on the relays (src/features/wallet/
 * funds-recovery.ts).
 */

/** A Bitcoin transaction id, as the SDK writes it: 32 bytes, hex. */
const TXID = /^[0-9a-f]{64}$/i;
const HEX = /^[0-9a-f]+$/i;
/** A signed transaction's bytes: at least a transaction's least (60), at most a standard one's. */
const MIN_TX_BYTES = 60;
const MAX_TX_BYTES = 400_000;

function isTxHex(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length % 2 === 0 &&
    value.length >= 2 * MIN_TX_BYTES &&
    value.length <= 2 * MAX_TX_BYTES &&
    HEX.test(value)
  );
}
/** A tree node's id, as the SDK gives them (a UUID so far): visible ASCII, bounded. */
const LEAF_ID = /^[\x21-\x7e]{1,128}$/;

/**
 * The highest fee rate the app asks a recovery at, in sat/vB: far above any the network asked so
 * far. A rate above it from the SDK's chain service is out of shape, never paid.
 */
export const MAX_RECOVERY_FEE_RATE = 10_000n;

function outOfShape(what: string): WalletError {
  return new WalletError("requestFailed", `Unexpected recovery from the wallet: ${what}`);
}

/**
 * Sats from the SDK, a `bigint` (native) or a `number` (web) taken only when an exact integer
 * (hard rule 3); throws when out of shape.
 */
export function recoverySats(value: unknown, what: string): bigint {
  let sats: bigint;
  if (typeof value === "bigint") sats = value;
  else if (typeof value === "number" && Number.isSafeInteger(value)) sats = BigInt(value);
  else throw outOfShape(what);
  if (sats < 0n) throw outOfShape(what);
  return sats;
}

/** A fee rate the network asks (`recommendedFees`), in whole sat/vB: at least 1, at most the max. */
export function recoveryFeeRate(value: unknown): bigint {
  const rate = recoverySats(value, "fee rate");
  if (rate < 1n || rate > MAX_RECOVERY_FEE_RATE) throw outOfShape("fee rate");
  return rate;
}

/** A leaf of a recovery; throws when out of shape. */
export function recoveryLeaf(
  leafId: unknown,
  valueSats: unknown,
  method: RecoveryMethod | null
): RecoveryLeaf {
  if (typeof leafId !== "string" || !LEAF_ID.test(leafId)) throw outOfShape("leaf id");
  const value = recoverySats(valueSats, "leaf value");
  if (value === 0n || method === null) throw outOfShape("leaf");
  return { leafId, valueSats: value, method };
}

/** The leaves of a recovery, each once; throws when out of shape. */
export function recoveryLeaves(leaves: readonly RecoveryLeaf[]): RecoveryLeaf[] {
  if (new Set(leaves.map(({ leafId }) => leafId)).size !== leaves.length) {
    throw outOfShape("a leaf twice");
  }
  return [...leaves];
}

/** A transaction of a recovery, its txid lowercase; throws when out of shape. */
export function recoveryTransaction(fields: {
  txid: unknown;
  hex: unknown;
  kind: RecoveryTransaction["kind"] | null;
  nodeId: unknown;
  status: RecoveryTransaction["status"] | null;
  /** Its CPFP child (`cpfpTxHex`), undefined when it goes alone. */
  childHex: unknown;
}): RecoveryTransaction {
  const { txid, hex, kind, nodeId, status, childHex } = fields;
  if (typeof txid !== "string" || !TXID.test(txid)) throw outOfShape("txid");
  if (!isTxHex(hex)) throw outOfShape("transaction");
  if (childHex !== undefined && !isTxHex(childHex)) throw outOfShape("child transaction");
  if (kind === null || status === null) throw outOfShape("transaction kind or status");
  let leafId: string | null = null;
  if (kind === "cooperative" || kind === "refund") {
    if (typeof nodeId !== "string" || !LEAF_ID.test(nodeId)) throw outOfShape("transaction leaf");
    leafId = nodeId;
  }
  return {
    txid: txid.toLowerCase(),
    hex: hex.toLowerCase(),
    kind,
    leafId,
    status,
    childHex: childHex === undefined ? null : childHex.toLowerCase()
  };
}

/**
 * A built recovery, checked whole: each transaction once, and each that names a leaf names one of
 * its leaves; throws when out of shape.
 */
export function recoveryBuild(
  leaves: readonly RecoveryLeaf[],
  transactions: readonly RecoveryTransaction[],
  failedLeafIds: readonly unknown[]
): RecoveryBuild {
  const checked = recoveryLeaves(leaves);
  const ids = new Set(checked.map(({ leafId }) => leafId));
  if (new Set(transactions.map(({ txid }) => txid)).size !== transactions.length) {
    throw outOfShape("a transaction twice");
  }
  for (const { leafId } of transactions) {
    if (leafId !== null && !ids.has(leafId)) throw outOfShape("a transaction of another leaf");
  }
  const failed = failedLeafIds.map((id) => {
    if (typeof id !== "string" || !LEAF_ID.test(id)) throw outOfShape("failed leaf");
    return id;
  });
  return { leaves: checked, transactions: [...transactions], failedLeafIds: failed };
}

/** A quote refused for funding (RecoveryQuote.needsFunding): the app never funds a recovery. */
export function fundingRefused(): WalletError {
  return new WalletError("requestFailed", "A recovery that needs funding is never built");
}
