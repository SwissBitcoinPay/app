import { currencies } from "@config";

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
  verifiedAddresses?: string[];
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
