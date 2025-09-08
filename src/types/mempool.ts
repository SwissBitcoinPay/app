import { XOR } from "ts-essentials";

export type ConfirmedWithBlockTime = XOR<
  { in_active_chain: true; blocktime: number },
  { in_active_chain: false }
>;

export type MempoolTX = {
  txid: string;
  status: ConfirmedWithBlockTime;
  vout: {
    scriptpubkey: string;
    scriptpubkey_address: string;
    value: number;
  }[];
  vin: {
    txid: string;
    prevout: {
      scriptpubkey: string;
      scriptpubkey_address: string;
      value: number;
    };
  }[];
};
