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
import { getFormattedUnit, sleep } from "@utils";
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

export type WalletTransaction = {
  txid: string;
  voutIndex: number;
  vinIndex: number;
  scriptPubKey: string;
  address: string;
  addressIndex: number;
  receiveValue?: number;
  value: number;
  isSpent: boolean;
  change: boolean;
  fees: number;
} & ConfirmedWithBlockTime;

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
    let currentBalance = 0;
    let currentPendingBalance = 0;

    const currentTxs: WalletTransaction[] = [];

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const account = new BIP84.fromZPub(zPub);

    let txsByAddress: {
      [k in string]: {
        addressIndex: number;
        change: boolean;
        txs: MempoolTX[];
      };
    } = {};

    try {
      for (const change of [false, true]) {
        let addressIndex = 0;

        for (let gapIndex = 0; gapIndex < ADDRESS_GAP; gapIndex++) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          const address: string = account.getAddress(addressIndex, change);

          const { data: addressTxs } = await axios.get<MempoolTX[]>(
            `https://mempool.space/api/address/${address}/txs`
          );

          txsByAddress = {
            ...txsByAddress,
            [address]: { addressIndex, change, txs: addressTxs }
          };
          if (addressTxs.length) {
            gapIndex = -1;
          } else if (gapIndex === 0) {
            if (!change) {
              setNextAddress({ address, index: addressIndex });
            } else {
              setNextChangeAddress({ address, index: addressIndex });
            }
          }

          addressIndex++;
        }
      }

      const ourAddresses = Object.keys(txsByAddress);

      ourAddresses.forEach((address) => {
        const { txs: addressTxs, change, addressIndex } = txsByAddress[address];
        for (const tx of addressTxs) {
          const voutIndex = tx.vout.findIndex(
            (v) => v.scriptpubkey_address === address
          );

          const vinIndex = tx.vin.findIndex(
            (v) => v.prevout.scriptpubkey_address === address
          );

          const isSelfSend =
            vinIndex !== -1 &&
            tx.vout.every((v) => ourAddresses.includes(v.scriptpubkey_address));

          const isMultipleInputs =
            vinIndex !== -1 && !!currentTxs.find((v) => v.txid === tx.txid);

          let receiveValue: number;
          let value: number;
          let fees = 0;

          if (voutIndex !== -1) {
            value = tx.vout[voutIndex].value;
          } else {
            const totalInputAmount = tx.vin.reduce(
              (result, v) => result + v.prevout.value,
              0
            );

            fees = Math.abs(
              totalInputAmount -
                tx.vout.reduce((result, v) => result + v.value, 0)
            );

            const sentValue = Math.abs(
              totalInputAmount -
                fees -
                tx.vout
                  .filter(
                    (v) =>
                      ourAddresses.includes(v.scriptpubkey_address) ||
                      isSelfSend
                  )
                  .reduce((result, v) => result + v.value, 0)
            );

            value = -sentValue;
          }

          const scriptPubKey =
            voutIndex !== -1
              ? tx.vout[voutIndex].scriptpubkey
              : vinIndex !== -1
                ? tx.vin[vinIndex].prevout.scriptpubkey
                : undefined;

          const isSpent = !!addressTxs.find((_tx) =>
            _tx.vin.find((vin) => vin.txid === tx.txid)
          );

          if ((isSelfSend && value > 0) || isMultipleInputs) {
            continue;
          }

          const confirmed = tx.status.confirmed;

          if (!change || (change && value < 0)) {
            if (confirmed || value < 0) {
              currentBalance += value - fees;
            } else {
              currentPendingBalance += value - fees;
            }
          }

          currentTxs.push({
            txid: tx.txid,
            voutIndex,
            vinIndex,
            scriptPubKey,
            address,
            change,
            isSelfSend,
            addressIndex,
            isSpent,
            receiveValue,
            value,
            fees,
            confirmed,
            ...(confirmed
              ? {
                  block_time: tx.status.block_time || 0
                }
              : {})
          });
        }
      });

      setBalance(currentBalance);
      setPendingBalance(currentPendingBalance);
      setTxs(currentTxs);
    } catch (e) {
      toast.show(t("errorFetchingWallet"), { type: "error" });
    }
    setIsInitialLoading(false);
    setIsRefreshing(false);
  }, [isInitialLoading, toast, zPub, t]);

  useEffect(() => {
    void updateWallet();

    if (!zPub) {
      (async () => {
        setZpub(
          await AsyncStorage.getItem(keyStoreZpub, {
            title: t("unlockYourWallet"),
            cancel: tRoot("common.cancel")
          })
        );
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
      <SendModal
        isOpen={isSendModalOpen}
        txs={txs}
        nextChangeAddress={nextChangeAddress}
        onClose={onSendModalClose}
        zPub={zPub}
        currentBalance={balance / 100000000}
      />
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
              title={t("receive")}
              onPress={onReceive}
              icon={faQrcode}
              disabled={isInitialLoading}
            />
          </S.ActionButtonsContainer>
          <ItemsList
            items={txs
              .filter((tx) => !tx.change || tx.value < 0)
              .sort(
                (a, b) =>
                  (b.block_time || Infinity) - (a.block_time || Infinity)
              )
              .map((tx) => {
                const isPending = !tx.confirmed;
                const realValue = tx.receiveValue || tx.value;
                const isPositive = realValue > 0;

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
                    tx.voutIndex !== -1 ? `#vout=${tx.voutIndex}` : ""
                  }`
                };
              })}
          />
        </ComponentStack>
      </PageContainer>
    </>
  );
};
