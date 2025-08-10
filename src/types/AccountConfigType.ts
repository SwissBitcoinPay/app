import { currencies } from "@config";

type VerifiedAddress = {
  address: string;
  walletConfig: {
    walletType: string;
    label: string;
    account: string;
    path: string;
    fingerprint: string;
  };
};

export type AccountConfigType = {
  // Visible by all users
  id: string;
  apiKey: string;
  name: string;
  currency: (typeof currencies)[number]["value"];
  isOnchainAvailable: boolean;
  isAtm: boolean;
  hasKyc: boolean;
  logoUrl?: string;

  // Visible by admin only
  createdAt?: number;
  mail?: string;
  verifiedAddresses?: VerifiedAddress[];
  btcPercent?: number;
  hmacSecret?: string;
  isCheckoutSecure?: boolean;
  // Btc settings
  depositAddress?: string;
  // Bank settings
  iban?: string;
  ownerName?: string;
  ownerAddress?: string;
  ownerComplement?: string;
  ownerZip?: string;
  ownerCity?: string;
  ownerCountry?: string;
  reference?: string;
};
