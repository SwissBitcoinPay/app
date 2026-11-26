import { toUnlockFailure } from "@/features/account/usePasskeyAccount";
import { confirmAccountPasskey, isAccountWalletOpen } from "@/features/account/wallet-access";
import type { SendQuote } from "@/lib/breez/types";
import { readWalletPayments } from "@/features/wallet/payments-history";
import { getWalletBalance, parseSendInput, prepareSend, sendPrepared } from "@/lib/breez/wallet";
import { salePayments } from "@/lib/mtpelerin/sale";
import { randomUuid } from "@/lib/random";

import type { SellPayer } from "./flow";

/*
 * Mt Pelerin's invoices paid from the account's own wallet (the 1-sat proof, each sale's), as
 * "Send" pays (src/features/wallet/send/useSend.ts): the invoice read by the SDK and prepared
 * (its fees), the balance read now, the passkey asked again (confirmAccountPasskey: before each
 * payment sent, AGENTS.md), then sent once per invoice (its idempotency key). The invoice was
 * checked before (invoice.ts, sale.ts: this network, exactly the amount agreed, not expired); the
 * SDK's reading is checked again here, and anything else is never paid. The wallet is connected
 * while "Wallet" shows, "Sell"'s panel over it (SellSheet.tsx).
 */

/** The wallet did not open for the payment (`openWallet` failed, or the screen was left). */
export class PaymentWalletClosedError extends Error {
  constructor() {
    super("The wallet is not open for Mt Pelerin's payment");
    this.name = "PaymentWalletClosedError";
  }
}

/** The SDK's reading of the invoice is not the Lightning invoice checked: nothing is paid. */
export class UnexpectedInvoiceError extends Error {
  constructor() {
    super("The invoice is not the one checked");
    this.name = "UnexpectedInvoiceError";
  }
}

/** The payer of the account's wallet; `openWallet` connects it ("Wallet"'s connection). */
export function walletPayer({ openWallet }: { openWallet: () => Promise<void> }): SellPayer {
  /** Each invoice's quote and idempotency key: a retry of its payment leaves at most once. */
  const prepared = new Map<string, { quote: SendQuote; key: string }>();
  /**
   * The connection under way, awaited by every call meanwhile: `openWallet` (useAccountWallet's
   * `open`) returns at once while one runs, before the wallet is open.
   */
  let opening: Promise<void> | null = null;

  const ready = async () => {
    if (!isAccountWalletOpen()) {
      opening ??= openWallet().finally(() => {
        opening = null;
      });
      await opening;
    }
    if (!isAccountWalletOpen()) throw new PaymentWalletClosedError();
  };

  return {
    async quote(invoice) {
      await ready();
      const destination = await parseSendInput(invoice.pr);
      if (destination.kind !== "bolt11" || destination.amountSats !== invoice.amountSats) {
        throw new UnexpectedInvoiceError();
      }
      const quote = await prepareSend(destination, null);
      if (quote.amountSats !== invoice.amountSats || quote.fees.onchain) {
        throw new UnexpectedInvoiceError();
      }
      // The same invoice prepared again keeps its key: its payment may have left already.
      const key = prepared.get(invoice.pr)?.key ?? randomUuid();
      prepared.set(invoice.pr, { quote, key });
      return { amountSats: quote.amountSats, feeSats: quote.fees.feeSats };
    },
    async covers(quote) {
      await ready();
      return (await getWalletBalance(false)) >= quote.amountSats + quote.feeSats;
    },
    async balance() {
      await ready();
      return getWalletBalance(false);
    },
    async paidSince(since) {
      await ready();
      return salePayments(await readWalletPayments(since));
    },
    async confirm() {
      try {
        await confirmAccountPasskey();
        return true;
      } catch (error) {
        // Its prompt dismissed: nothing left, the same confirmation stays.
        if (toUnlockFailure(error) === null) return false;
        throw error;
      }
    },
    async pay(quote) {
      const entry = prepared.get(quote.invoice.pr);
      if (!entry) throw new UnexpectedInvoiceError();
      await ready();
      const sent = await sendPrepared(entry.quote, { speed: "medium", idempotencyKey: entry.key });
      if (sent.status === "failed") throw new Error("Mt Pelerin's payment failed");
    }
  };
}
