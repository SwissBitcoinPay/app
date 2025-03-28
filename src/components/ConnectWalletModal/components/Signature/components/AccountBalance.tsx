import { Loader } from "@components/Loader";
import { apiRootUrl } from "@config";
import axios from "axios";
import { useEffect, useState } from "react";
import * as S from "./styled";
import { useTranslation } from "react-i18next";
import { faPlus } from "@fortawesome/free-solid-svg-icons";

type AccountBalanceProps = {
  xpub: string;
};

export const AccountBalance = ({ xpub }: AccountBalanceProps) => {
  const [balance, setBalance] = useState<number>();
  const [txs, setTxs] = useState<number>();
  const { t } = useTranslation(undefined, {
    keyPrefix: "connectWalletModal.signature.accountBalance"
  });

  useEffect(() => {
    (async () => {
      const { data: balances } = await axios.get<
        { balance: number; txs: number }[]
      >(`${apiRootUrl}/valid-xpub?xpub=${xpub}&withBalance=true`, {
        timeout: 5 * 60 * 1000
      });

      const { _balance, _txs } = balances.reduce(
        (result, value) => ({
          _balance: result._balance + value.balance,
          _txs: result._txs + value.txs
        }),
        { _balance: 0, _txs: 0 }
      );
      setBalance(_balance / 100000000);
      setTxs(_txs);
    })();
  }, [xpub]);

  return balance === undefined ? (
    <Loader size={16} />
  ) : balance !== undefined && txs > 0 ? (
    <S.AccountBalance numberOfLines={1}>
      {balance} BTC • {t("transactions", { txs })}
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
