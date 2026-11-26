// sattle.me Checkout: the payment provider (Payment Provider service plugin), in the file Wix makes
// for it. Its work is in backend/sattleme-plugin.js.

import {
  connectAccount as connect,
  createTransaction as create,
  refundTransaction as refund
} from "../../../sattleme-plugin.js";

export const connectAccount = async (options) => connect(options);

export const createTransaction = async (options) => create(options);

export const refundTransaction = async () => refund();
