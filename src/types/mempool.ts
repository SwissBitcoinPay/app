import { XOR } from "ts-essentials";

export type ConfirmedWithBlockTime = XOR<
  { confirmed: true; block_time: number },
  { confirmed: false }
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
