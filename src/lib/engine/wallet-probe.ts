import type { Wallet } from "@/lib/breez/types";
import { within } from "@/lib/within";

import type { EngineRuntimeHost } from "./host";
import type { RuntimeStep } from "./runtime-probe";
import { engineProbeSeed, engineWallet } from "./wallet";

/*
 * The extension's probe of the engine's wallet (iOS extension test, "enginePay" mode): the
 * probe's test wallet, connected through the engine's wallet (wallet.ts) over the host's Breez SDK,
 * as a card payment connects a card's wallet, then the invoice of the test's notification paid
 * the way the card payment core pays (parse, prepare, send, its payment read). Each step's time,
 * outcome and what it said written down; the first failure ends the run, the wallet disconnected
 * in any case. The host bounds what it sends (EngineWallet.swift, `maxSendSats`), and so does this.
 */

/** The probe's test wallet's SDK storage, below the extension's own (EngineWallet.swift). */
export const PROBE_WALLET_STORAGE = "probe";

/** How long the wallet's first sync with the network may take (a card payment's own wait). */
const SYNC_MS = 15_000;

class ProbeStepError extends Error {}

/**
 * Connects the test wallet, pays `invoice` (at most `maxSats`, fee included; `run` its idempotency
 * key) and disconnects it. Never throws: a failure is the record's.
 */
export async function runEngineWalletProbe(
  host: EngineRuntimeHost,
  invoice: string,
  run: string,
  maxSats: number,
  wallet: Wallet = engineWallet(PROBE_WALLET_STORAGE)
): Promise<{ steps: RuntimeStep[] }> {
  const steps: RuntimeStep[] = [];
  const step = async (name: string, work: () => Promise<string>): Promise<boolean> => {
    const start = performance.now();
    let ok = true;
    let detail: string;
    try {
      detail = await work();
    } catch (error) {
      ok = false;
      detail = error instanceof Error ? error.message.slice(0, 200) : "failed";
    }
    host.step(name);
    steps.push({ name, ok, ms: Math.round(performance.now() - start), detail });
    return ok;
  };
  const bound = BigInt(maxSats);
  let paymentId = "";
  const sequence: [string, () => Promise<string>][] = [
    [
      "connect",
      async () => {
        await wallet.connect(engineProbeSeed());
        return "connected";
      }
    ],
    [
      "synced",
      async () => {
        if ((await within(wallet.waitNetworkSync(), SYNC_MS)) === null) {
          throw new ProbeStepError(`No sync within ${SYNC_MS / 1000} s`);
        }
        return "synced";
      }
    ],
    ["balance", async () => `${await wallet.getBalance(false)} sats`],
    [
      "pay",
      async () => {
        const destination = await wallet.parseSendInput(invoice);
        if (destination.kind !== "bolt11" || destination.amountSats === null) {
          throw new ProbeStepError("Not an invoice of its own amount");
        }
        const quote = await wallet.prepareSend(destination, null);
        if (quote.fees.onchain || quote.amountSats + quote.fees.feeSats > bound) {
          throw new ProbeStepError("Over what the test may send");
        }
        const sent = await wallet.sendPrepared(quote, {
          speed: "fast",
          idempotencyKey: run,
          untilSent: true
        });
        paymentId = sent.id;
        return `${quote.amountSats} sats, fee ${quote.fees.feeSats}, ${sent.status}`;
      }
    ],
    [
      "payment",
      async () => {
        const payment = await wallet.getPayment(paymentId);
        if (!payment) throw new ProbeStepError("Not found");
        return `${payment.status}, preimage ${payment.preimage ? "present" : "absent"}`;
      }
    ]
  ];
  try {
    for (const [name, work] of sequence) {
      if (!(await step(name, work))) break;
    }
  } finally {
    // Whatever happened: its SDK object, which holds its keys, let go (connection.ts).
    await step("disconnect", async () => {
      await wallet.disconnect();
      return "disconnected";
    });
  }
  return { steps };
}
