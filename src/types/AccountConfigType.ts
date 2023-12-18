import { currencies } from "@config";

export type AccountConfigType = {
  // Visible by all users
  apiKey: string;
  name: string;
  currency: (typeof currencies)[number]["value"];
  isOnchainAvailable: boolean;
  isAtm: boolean;

  // Visible by admin only
  mail?: string;
  verifiedAddresses?: string[];
  btcPercent?: number;
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
