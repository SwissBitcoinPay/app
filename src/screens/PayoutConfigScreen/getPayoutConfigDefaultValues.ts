import type { WalletConfig } from "@components/ConnectWalletModal/ConnectWalletModal";
import type {
  PayoutConfigForm,
  WalletType
} from "@components/PayoutConfig/PayoutConfig";
import { currencyToCountry } from "@config/currencyToCountry";
import type { AccountConfigType } from "@types";

export const getPayoutConfigDefaultValues = (
  accountConfig: AccountConfigType
): PayoutConfigForm => {
  const currentVerifiedAddress = accountConfig.verified_addresses?.find(
    ({ address }) => address === accountConfig.deposit_address
  );
  const walletConfig = currentVerifiedAddress?.walletConfig as
    | WalletConfig
    | undefined;
  const currency = accountConfig.currency;
  const defaultOwnerCountry =
    currency && currency in currencyToCountry
      ? currencyToCountry[currency as keyof typeof currencyToCountry]
      : undefined;

  return {
    btcPercent: accountConfig.btc_percent ?? 0,
    depositAddress: accountConfig.deposit_address ?? undefined,
    btcAddressTypes: {
      onchain: false,
      lightning: false,
      xpub: false
    },
    ownerCountry: accountConfig.owner_country ?? defaultOwnerCountry,
    iban: accountConfig.iban ?? undefined,
    ownerName: accountConfig.owner_name ?? undefined,
    ownerAddress: accountConfig.owner_address ?? undefined,
    ownerComplement: accountConfig.owner_complement ?? undefined,
    ownerZip: accountConfig.owner_zip ?? undefined,
    ownerCity: accountConfig.owner_city ?? undefined,
    reference: accountConfig.bank_reference ?? undefined,
    walletType: walletConfig?.type as WalletType,
    walletConfig
  };
};
