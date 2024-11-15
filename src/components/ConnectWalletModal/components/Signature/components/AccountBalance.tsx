import { Loader } from "@components/Loader";
import { apiRootUrl } from "@config";
import axios from "axios";
import { useEffect, useState } from "react";
import * as S from "./styled";

type AccountBalanceProps = {
  xpub: string;
};

export const AccountBalance = ({ xpub }: AccountBalanceProps) => {
  const [balance, setBalance] = useState<number>();

  useEffect(() => {
    (async () => {
      const { data: balances } = await axios.get<{ value: number }[]>(
        `${apiRootUrl}/valid-xpub?xpub=${xpub}&withUtxosOnly=true`,
        { timeout: 5 * 60 * 1000 }
      );
      setBalance(balances.reduce((r, v) => r + v.value, 0) / 100000000);
    })();
  }, [xpub]);

  return balance === undefined ? (
    <Loader size={16} />
  ) : (
    <S.AccountBalance>
      {balance !== undefined ? `${balance} BTC` : ""}
    </S.AccountBalance>
  );
};
