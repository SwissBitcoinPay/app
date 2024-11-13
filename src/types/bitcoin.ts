export type Bip84Account = {
  getPublicKey: (index: number, change?: boolean) => string;
  getAddress: (index: number, change?: boolean) => string;
};

export type Bip84PrivateAccount = Bip84Account & {
  getPrivateKey: (index: number, change?: boolean) => string;
};
