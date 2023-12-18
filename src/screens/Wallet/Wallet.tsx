import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  ComponentStack,
  Icon,
  ItemsList,
  Loader,
  Modal,
  PageContainer,
  Text
} from "@components";
import { getFormattedUnit } from "@utils";
// @ts-ignore
import BIP84 from "bip84";
import {
  faArrowLeft,
  faClock,
  faPaperPlane,
  faPlus,
  faQrcode
} from "@fortawesome/free-solid-svg-icons";
import { AsyncStorage } from "@utils";
import { keyStoreZpub } from "@config/settingsKeys";
import axios from "axios";
import { useTheme } from "styled-components";
import { XOR } from "ts-essentials";
import * as S from "./styled";
import { useAccountConfig, useRates } from "@hooks";

const ADDRESS_GAP = 3;

type ConfirmedWithBlockTime = XOR<
  { confirmed: true; block_time: number },
  { confirmed: false }
>;

type MempoolTX = {
  txid: string;
  status: ConfirmedWithBlockTime;
  vout: { scriptpubkey_address: string; value: number }[];
  vin: {
    txid: string;
    prevout: { scriptpubkey_address: string; value: number };
  }[];
};

type TransactionUTXO = {
  txid: string;
  value: number;
} & ConfirmedWithBlockTime;

export const Wallet = () => {
  const { t } = useTranslation(undefined, {
    keyPrefix: "screens.wallet"
  });
  const { colors } = useTheme();
  const { accountConfig } = useAccountConfig();

  const [isLoading, setIsLoading] = useState(true);
  const rates = useRates();

  const [nextAddress, setNextAddress] = useState<string>();
  const [utxos, setUtxos] = useState<TransactionUTXO[]>([]);
  const [balance, setBalance] = useState(0);
  const [pendingBalance, setPendingBalance] = useState(0);

  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);

  useEffect(() => {
    (async () => {
      let currentBalance = 0;
      let currentPendingBalance = 0;

      const currentUtxos: TransactionUTXO[] = [];

      let receiveAddressIndex = 0;
      let changeAddressIndex = 0;

      const zPub = await AsyncStorage.getItem(keyStoreZpub);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const account = new BIP84.fromZPub(zPub);

      for (let index = 0; index < ADDRESS_GAP; index++) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        const address: string = account.getAddress(receiveAddressIndex);

        const { data: addressUtxos } = await axios.get<MempoolTX[]>(
          `https://mempool.space/api/address/${address}/txs`
        );

        if (addressUtxos.length) {
          addressUtxos.forEach((utxo) => {
            const value =
              utxo.vout.find((v) => v.scriptpubkey_address === address)
                ?.value ||
              (utxo.vin.find((v) => v.prevout.scriptpubkey_address === address)
                ?.prevout.value || 0) * -1;

            if (utxo.status.confirmed || value < 0) {
              currentBalance += value;
            } else {
              currentPendingBalance += value;
            }

            currentUtxos.push({
              txid: utxo.txid,
              value,
              ...(utxo.status.confirmed
                ? { confirmed: true, block_time: utxo.status.block_time || 0 }
                : { confirmed: false })
            });
          });
          index = -1;
        } else if (index === 0) {
          setNextAddress(address);
        }

        receiveAddressIndex++;
      }

      for (let index = 0; index < ADDRESS_GAP; index++) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        const address: string = account.getAddress(changeAddressIndex, true);

        const { data: addressUtxos } = await axios.get<MempoolTX[]>(
          `https://mempool.space/api/address/${address}/txs`
        );

        if (addressUtxos.length) {
          addressUtxos.forEach((utxo) => {
            const value =
              utxo.vout.find((v) => v.scriptpubkey_address === address)
                ?.value ||
              (utxo.vin.find((v) => v.prevout.scriptpubkey_address === address)
                ?.prevout.value || 0) * -1;

            if (utxo.status.confirmed || value < 0) {
              currentBalance += value;
            } else {
              currentPendingBalance += value;
            }

            currentUtxos.push({
              txid: utxo.txid,
              value,
              ...(utxo.status.confirmed
                ? { confirmed: true, block_time: utxo.status.block_time || 0 }
                : { confirmed: false })
            });
          });
          index = -1;
        }

        changeAddressIndex++;
      }

      setBalance(currentBalance);
      setPendingBalance(currentPendingBalance);
      setUtxos(currentUtxos);
      setIsLoading(false);
    })();
  }, []);

  const onReceive = useCallback(() => {
    setIsReceiveModalOpen(true);
  }, []);

  const fiatCurrency = useMemo(
    () => accountConfig?.currency,
    [accountConfig?.currency]
  );

  return (
    <>
      <Modal
        isOpen={isReceiveModalOpen}
        title={t("receive")}
        onClose={() => {
          setIsReceiveModalOpen(false);
        }}
      >
        <ComponentStack>
          <S.ReceiveQR size={200} data={nextAddress} />
          <Button title={nextAddress} copyContent={nextAddress} />
          <Text h4 weight={600} color={colors.white}>
            {t("receiveInfo")}
          </Text>
        </ComponentStack>
      </Modal>
      <PageContainer
        header={{ left: { onPress: -1, icon: faArrowLeft }, title: t("title") }}
      >
        <ComponentStack>
          <S.BalanceComponentStack gapSize={6}>
            <S.BalanceTitle h4 weight={500}>
              {t("balance")}
            </S.BalanceTitle>
            {!isLoading ? (
              <>
                <S.Balance h2 weight={700}>
                  {balance / 100000000} sats
                </S.Balance>
                {rates && fiatCurrency && (
                  <S.Balance h3 weight={600}>
                    {getFormattedUnit(
                      (balance * rates[`BTC${fiatCurrency}`]?.[fiatCurrency]) /
                        100000000,
                      fiatCurrency
                    )}
                  </S.Balance>
                )}
                {(pendingBalance || 0) > 0 && (
                  <ComponentStack direction="horizontal" gapSize={6}>
                    <Icon icon={faClock} color={colors.grey} size={16} />
                    <Text h4 weight={600} color={colors.grey}>
                      {t("pending")}: {pendingBalance / 100000000} sats
                    </Text>
                  </ComponentStack>
                )}
              </>
            ) : (
              <Loader />
            )}
          </S.BalanceComponentStack>
          <S.ActionButtonsContainer direction="horizontal">
            <Button
              title={t("send")}
              type="bitcoin"
              onPress={() => null}
              icon={faPaperPlane}
              disabled
            />
            <Button
              title={t("receive")}
              onPress={onReceive}
              icon={faQrcode}
              disabled={isLoading}
            />
          </S.ActionButtonsContainer>
          <ItemsList
            items={utxos.map((utxo) => {
              const isPositive = utxo.value > 0;

              return {
                icon: isPositive ? faPlus : faPaperPlane,
                tags: [
                  {
                    value: `${Math.abs(utxo.value) / 100000000} BTC`,
                    color: isPositive ? colors.success : colors.primaryLight
                  }
                ],
                title: isPositive ? t("received") : t("sent"),
                onPress: `https://mempool.space/tx/${utxo.txid}`
              };
            })}
          />
        </ComponentStack>
      </PageContainer>
    </>
  );
};
