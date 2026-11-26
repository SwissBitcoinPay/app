import { devicePasskeyOf } from "@/features/account/device-passkey";
import {
  OtherAccountError,
  getAccountWalletId,
  seedHasBackupKey
} from "@/features/account/session";
import { toUnlockFailure } from "@/features/account/usePasskeyAccount";
import { confirmAccountPasskey } from "@/features/account/wallet-access";
import { refuseOverduePaymentOf } from "@/features/recovery-check/overdue";
import { getTerminalProfile } from "@/features/terminal/profile-cache";
import i18n from "@/i18n";
import { signInWithPasskey } from "@/lib/breez/passkey";
import { loadCardPasses } from "@/lib/card/card-pass-store";
import { loadDeviceKey } from "@/lib/card/device-key";
import { approveCardPayee, loadCardPayees, loadPayeeBooks, noteCardPayee } from "@/lib/card/payees";
import { loadCardPayments, logCardPayment } from "@/lib/card/payment-log";
import { accountProfile } from "@/lib/terminal/model";

import { syncCardPasses } from "./card-passes";
import { leaseCardWallet } from "./card-wallet";
import { publishCardHistory } from "./history-sync";
import {
  CardPaymentCore,
  type CardPaymentOptions,
  type CardPaymentPorts,
  type CardTapContext,
  type CardTapRequest
} from "./payment-core";
import { refreshCardPayees } from "./payees-sync";
import { refillCardChannel, refillCardChannelWithPass } from "./relay-sync";
import {
  cardStatesOnDevice,
  cardStatesOnDeviceOf,
  recordCardState,
  recordCardStateOnDevice,
  refreshCardStates,
  withCardAccess,
  withCardAccessOf
} from "./states";

/*
 * A card payment in the app (payment-core.ts): its rules, with the app's storage, wallet, account
 * and passkey. Each port calls the app's module at the time of the call.
 */

export {
  cardAnswerMs,
  type CardPaid,
  type CardPaymentFailure,
  type CardPaymentOptions,
  type CardPaymentView,
  type CardTapContext,
  type CardTapRequest,
  type PaidCard
} from "./payment-core";

/** The app's ports of a card payment. */
export const CARD_PAYMENT_PORTS: CardPaymentPorts = {
  // Read at each use: the holder may change the app's language meanwhile.
  get t() {
    return i18n.t;
  },
  log: {
    load: () => loadCardPayments(),
    write: (entry) => logCardPayment(entry)
  },
  payees: {
    load: (walletId, card) => loadCardPayees(walletId, card),
    loadBooks: (walletId) => loadPayeeBooks(walletId),
    note: (walletId, card, payee, now) => noteCardPayee(walletId, card, payee, now)
  },
  passes: { load: (walletId) => loadCardPasses(walletId) },
  states: {
    onDeviceOf: (walletId) => cardStatesOnDeviceOf(walletId),
    recordOnDevice: (walletId, state, now, options) =>
      recordCardStateOnDevice(walletId, state, now, options)
  },
  leaseWallet: (source, card) => leaseCardWallet(source, card),
  refillWithPass: async (walletId, pass, state) =>
    refillCardChannelWithPass(walletId, pass, state, await loadDeviceKey()),
  unlockFailure: (error) => toUnlockFailure(error),
  account: {
    openWalletId: () => getAccountWalletId(),
    withCardAccess: (run) => withCardAccess(run),
    withCardAccessOf: (seed, walletId, run) => withCardAccessOf(seed, walletId, run),
    refreshStates: (access, options) => refreshCardStates(access, options),
    refreshPayees: (access, options) => refreshCardPayees(access, options),
    statesOnDevice: (access) => cardStatesOnDevice(access),
    recordState: (access, state, now, options) => recordCardState(access, state, now, options),
    approvePayee: (walletId, card, payee, now) => approveCardPayee(walletId, card, payee, now),
    confirmPasskey: (options) => confirmAccountPasskey(options),
    refuseOverduePayment: (walletId) => refuseOverduePaymentOf(walletId),
    signIn: async (walletId) => signInWithPasskey(await devicePasskeyOf(walletId)),
    checkSeed: async (seed, walletId) => {
      const profile = accountProfile(await getTerminalProfile());
      if (!profile || profile.walletId.toLowerCase() !== walletId.toLowerCase()) {
        throw new OtherAccountError();
      }
      if (!seedHasBackupKey(seed, profile.backupKey)) throw new OtherAccountError();
    },
    refillChannel: async (access, state) => refillCardChannel(access, state, await loadDeviceKey()),
    publishHistory: (access, now) => publishCardHistory(access, now),
    syncPasses: (access, states, options) => syncCardPasses(access, states, options)
  }
};

/** One tap of a card, paid by the app (payment-core.ts). */
export class CardPayment extends CardPaymentCore {
  constructor(request: CardTapRequest, context: CardTapContext, options: CardPaymentOptions = {}) {
    super(request, context, CARD_PAYMENT_PORTS, options);
  }
}
