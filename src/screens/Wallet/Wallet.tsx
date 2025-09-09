import { useCallback, useEffect, useMemo, useState } from "react";
import { View } from "react-native";
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
import { getFormattedUnit, sleep } from "@utils";
// @ts-ignore
import BIP84 from "bip84";
import {
  faArrowLeft,
  faArrowUpRightFromSquare,
  faBuildingColumns,
  faClock,
  faPaperPlane,
  faPlus,
  faQrcode
} from "@fortawesome/free-solid-svg-icons";
import { AsyncStorage } from "@utils";
import { keyStoreZpub } from "@config/settingsKeys";
import axios from "axios";
import { useTheme } from "styled-components";
import * as S from "./styled";
import { useAccountConfig, useRates } from "@hooks";
import { SendModal } from "./components";
import { useToast } from "react-native-toast-notifications";
import { Platform, RefreshControl } from "react-native";
import { ConfirmedWithBlockTime, MempoolTX } from "@types";

export const ADDRESS_GAP = 1;

export type AddressDetail = {
  address: string;
  index: number;
};

type Vout = {
  n: number;
  value: number;
  scriptPubKey: {
    address: string;
    hex: string;
  };
  ourAddressConfig?: {
    index: number;
    change: boolean;
    isSpent: boolean;
  };
};

export type WalletTransaction = {
  txid: string;
  hex: string;
  value: number;
  time?: number;
  vout: Vout[];
} & ConfirmedWithBlockTime;

export type FormattedUtxo = {
  txid: string;
  rawTx?: string;
  address: string;
  scriptPubKeyHex: string;
  value: number;
  vIndex: number;
  addressIndex: number;
  change: boolean;
};

export const Wallet = () => {
  const { t: tRoot } = useTranslation();
  const { t } = useTranslation(undefined, {
    keyPrefix: "screens.wallet"
  });
  const { colors } = useTheme();
  const toast = useToast();
  const { accountConfig } = useAccountConfig();

  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const rates = useRates();

  const [zPub, setZpub] = useState<string>();

  const [nextAddress, setNextAddress] = useState<AddressDetail>();
  const [nextChangeAddress, setNextChangeAddress] = useState<AddressDetail>();
  const [txs, setTxs] = useState<WalletTransaction[]>([]);
  const [balance, setBalance] = useState(0);
  const [pendingBalance, setPendingBalance] = useState(0);

  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
  const [isSendModalOpen, setIsSendModalOpen] = useState(false);

  const updateWallet = useCallback(async () => {
    if (!zPub) {
      return;
    }
    if (!isInitialLoading) {
      setIsRefreshing(true);
    }

    const { data: walletData } = await axios.get<{
      nextChangeAddress: AddressDetail;
      txs: WalletTransaction[];
    }>(`https://stats.swiss-bitcoin-pay.ch/txs/${zPub}`);

    const currentBalance = walletData.txs.reduce(
      (result, value) => result + value.value,
      0
    );

    setTxs(walletData.txs);
    setBalance(currentBalance);
    setNextChangeAddress(walletData.nextChangeAddress);

    setIsInitialLoading(false);
    setIsRefreshing(false);
  }, [isInitialLoading, toast, zPub, t]);

  useEffect(() => {
    void updateWallet();

    if (!zPub) {
      (async () => {
        setZpub(accountConfig?.depositAddress);
      })();
    }
  }, [zPub]);

  const onReceive = useCallback(() => {
    setIsReceiveModalOpen(true);
  }, []);

  const onSend = useCallback(() => {
    setIsSendModalOpen(true);
  }, []);

  const onSendModalClose = useCallback(
    async (success: boolean) => {
      setIsSendModalOpen(false);
      if (success) {
        await sleep(4000);
        void updateWallet();
      }
    },
    [updateWallet]
  );

  const fiatCurrency = useMemo(
    () => accountConfig?.currency,
    [accountConfig?.currency]
  );

  const utxos = useMemo(
    () =>
      (txs || [])
        .filter((e) => e.blocktime)
        .reduce((result, tx) => {
          const ourUtxos = tx.vout.filter(
            (vout) => vout.ourAddressConfig && !vout.ourAddressConfig.isSpent
          );

          const all = ourUtxos.map(
            (vout) =>
              ({
                txid: tx.txid,
                rawTx: tx.hex,
                vIndex: vout.n,
                addressIndex: vout.ourAddressConfig?.index,
                change: vout.ourAddressConfig?.change,
                address: vout.scriptPubKey.address,
                value: vout.value,
                scriptPubKeyHex: vout.scriptPubKey.hex
              }) as FormattedUtxo
          );
          return [...result, ...all];
        }, [] as FormattedUtxo[]),
    [txs]
  );

  return (
    <>
      {nextAddress && (
        <Modal
          isOpen={isReceiveModalOpen}
          title={t("receiveBitcoins")}
          onClose={() => {
            setIsReceiveModalOpen(false);
          }}
        >
          <ComponentStack>
            <S.ReceiveQR size={200} value={nextAddress.address} />
            <Button
              title={nextAddress.address}
              copyContent={nextAddress.address}
            />
            <Text h4 weight={600} color={colors.white}>
              {t("receiveInfo")}
            </Text>
          </ComponentStack>
        </Modal>
      )}
      {zPub && nextChangeAddress && (
        <SendModal
          isOpen={isSendModalOpen}
          utxos={utxos}
          nextChangeAddress={nextChangeAddress}
          onClose={onSendModalClose}
          zPub={zPub}
          currentBalance={balance / 100000000}
        >
          <></>
        </SendModal>
      )}
      <PageContainer
        header={{ left: { onPress: -1, icon: faArrowLeft }, title: t("title") }}
        {...(Platform.OS !== "web"
          ? {
              refreshControl: (
                <RefreshControl
                  onRefresh={updateWallet}
                  refreshing={isRefreshing}
                  progressViewOffset={100}
                />
              )
            }
          : {})}
      >
        <View>
        <ComponentStack>
          <S.BalanceComponentStack gapSize={6}>
            <S.BalanceTitle h4 weight={500}>
              {t("balance")}
            </S.BalanceTitle>
            {!isInitialLoading ? (
              <>
                <S.Balance h2 weight={700}>
                  {balance / 100000000} BTC
                </S.Balance>
                {rates && fiatCurrency && (
                  <S.Balance h3 weight={600}>
                    {getFormattedUnit(
                      (balance * rates[fiatCurrency]) / 100000000,
                      fiatCurrency
                    )}
                  </S.Balance>
                )}
                {(pendingBalance || 0) > 0 && (
                  <ComponentStack direction="horizontal" gapSize={6}>
                    <Icon icon={faClock} color={colors.grey} size={16} />
                    <Text h4 weight={600} color={colors.grey}>
                      {t("pending")}: {pendingBalance / 100000000} BTC
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
              onPress={onSend}
              icon={faPaperPlane}
              disabled={isInitialLoading}
            />
            <Button
              title={t("sell")}
              onPress="https://dashboard.swiss-bitcoin-pay.ch/wallet"
              icon={faArrowUpRightFromSquare}
              disabled={isInitialLoading}
            />
          </S.ActionButtonsContainer>
          <ItemsList
            items={txs
              // .filter((tx) => !tx.change || tx.value < 0)
              .sort(
                (a, b) => (b.blocktime || Infinity) - (a.blocktime || Infinity)
              )
              .map((tx) => {
                const isPending = !tx.blocktime;
                const realValue = tx.value;
                const isPositive = realValue > 0;

                const voutIndex = tx.vout.find((v) => v.ourAddressConfig)?.n;

                return {
                  ...(isPending
                    ? { component: <Loader color={colors.warning} /> }
                    : { icon: isPositive ? faPlus : faPaperPlane }),
                  tags: [
                    {
                      value: `${Math.abs(realValue) / 100000000} BTC`,
                      color: isPending
                        ? colors.bitcoin
                        : isPositive
                          ? colors.success
                          : colors.primaryLight
                    }
                  ],
                  title: isPositive ? t("received") : t("sent"),
                  onPress: `https://mempool.space/tx/${tx.txid}${
                    voutIndex !== undefined ? `#vout=${voutIndex}` : ""
                  }`
                };
              })}
          />
        </ComponentStack>
        </View>
      </PageContainer>
    </>
  );
};
