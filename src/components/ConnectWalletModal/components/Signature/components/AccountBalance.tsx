import { Loader } from "@components/Loader";
import { useEffect, useState } from "react";
import * as S from "./styled";
import { useTranslation } from "react-i18next";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { api, type XpubBalance } from "@types";

type AccountBalanceProps = {
  xpub: string;
};

export const AccountBalance = ({ xpub }: AccountBalanceProps) => {
  // `undefined` = en cours, `null` = chaîne injoignable (on n'affiche alors
  // rien : annoncer "nouveau compte" ferait choisir le mauvais compte).
  const [balance, setBalance] = useState<XpubBalance | null>();
  const { t } = useTranslation(undefined, {
    keyPrefix: "connectWalletModal.signature.accountBalance"
  });

  useEffect(() => {
    (async () => {
      try {
        setBalance(await api.accounts.xpubBalance(xpub));
      } catch (e) {
        setBalance(null);
      }
    })();
  }, [xpub]);

  if (balance === undefined) {
    return <Loader size={16} />;
  }

  if (balance === null) {
    return null;
  }

  // `complete: false` : le balayage a buté sur une borne, les chiffres sont
  // un minimum — d'où le « ≥ ».
  return balance.tx_count > 0 ? (
    <S.AccountBalance numberOfLines={1}>
      {balance.complete ? "" : "≥ "}
      {(balance.confirmed_sat + balance.unconfirmed_sat) / 100000000} BTC •{" "}
      {t("transactions", { txs: balance.tx_count })}
    </S.AccountBalance>
  ) : (
    <S.AccountNewContainerWrapper>
      <S.AccountNewContainer>
        <S.AccountNewIcon icon={faPlus} />
        <S.AccountNew numberOfLines={1}>{t("newAccount")}</S.AccountNew>
      </S.AccountNewContainer>
    </S.AccountNewContainerWrapper>
  );
};
