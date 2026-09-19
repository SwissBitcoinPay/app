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
  faArrowUpRightFromSquare,
  faClock,
  faPaperPlane,
  faPlus
} from "@fortawesome/free-solid-svg-icons";
import { AsyncStorage } from "@utils";
import { keyStoreZpub } from "@config/settingsKeys";
import { dashboardUrl, getMempoolBaseUrl, SATS_PER_BTC } from "@config";
import { useTheme } from "styled-components";
import * as S from "./styled";
import { useAccountConfig, useRates } from "@hooks";
import { SendModal } from "./components";
import { Platform, RefreshControl } from "react-native";
import { ConfirmedWithBlockTime, MempoolTX, api } from "@types";

export const ADDRESS_GAP = 1;

export type AddressDetail = {
  address: string;
  index: number;
};

type Vin = {
  txid?: string;
  vout?: number;
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
  vin: Vin[];
  vout: Vout[];
} & ConfirmedWithBlockTime;

export type FormattedUtxo = {
  txid: string;
  // Serialized parent tx (`hex` from `api.transactions.byAddress`), used as
  // the input's `nonWitnessUtxo` when signing, without fetching it again.
  rawTx: string;
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
  const { accountConfig } = useAccountConfig();
  const mempoolBaseUrl = getMempoolBaseUrl();

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

    const walletData = await api.transactions.byAddress(zPub);

    // Le backend rend des sats entiers, pour `tx.value` comme pour
    // `vout[].value` : rien à convertir ici.
    const txs = walletData.txs;

    const currentBalance = txs.reduce((result, tx) => result + tx.value, 0);

    setTxs(txs as WalletTransaction[]);
    setBalance(currentBalance);
    setNextChangeAddress(walletData.nextInternalAddress ?? undefined);

    setIsInitialLoading(false);
    setIsRefreshing(false);
  }, [isInitialLoading, zPub]);

  useEffect(() => {
    void updateWallet();

    if (!zPub) {
      setZpub(accountConfig?.deposit_address ?? undefined);
    }
  }, [zPub, accountConfig?.deposit_address]);

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

  // `txid:n` → vout.value (sats). Permet de résoudre les vins de nos
  // tx d'envoi vers les vouts précédents (présents dans la même réponse,
  // car ils proviennent forcément de notre wallet) pour calculer
  // `Σ(vins) − Σ(vouts) = fee`.
  const prevoutValues = useMemo(() => {
    const map = new Map<string, number>();
    for (const tx of txs) {
      for (const vout of tx.vout) {
        map.set(`${tx.txid}:${vout.n}`, vout.value);
      }
    }
    return map;
  }, [txs]);

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
      {zPub && nextChangeAddress && (
        <SendModal
          isOpen={isSendModalOpen}
          utxos={utxos}
          nextChangeAddress={nextChangeAddress}
          onClose={onSendModalClose}
          zPub={zPub}
          currentBalance={balance}
        />
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
        <ComponentStack>
          <S.BalanceComponentStack gapSize={6}>
            <S.BalanceTitle h4 weight={500}>
              {t("balance")}
            </S.BalanceTitle>
            {!isInitialLoading ? (
              <>
                <S.Balance h2 weight={700}>
                  {balance / SATS_PER_BTC} BTC
                </S.Balance>
                {rates && fiatCurrency && (
                  <S.Balance h3 weight={600}>
                    {getFormattedUnit(
                      (balance * rates[fiatCurrency]) / SATS_PER_BTC,
                      fiatCurrency
                    )}
                  </S.Balance>
                )}
                {(pendingBalance || 0) > 0 && (
                  <ComponentStack direction="horizontal" gapSize={6}>
                    <Icon icon={faClock} color={colors.grey} size={16} />
                    <Text h4 weight={600} color={colors.grey}>
                      {t("pending")}: {pendingBalance / SATS_PER_BTC} BTC
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
              onPress={`${dashboardUrl}/wallet`}
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

                const voutIndex = tx.vout.findIndex((v) => !v.ourAddressConfig);

                const effectiveValue = isPositive
                  ? realValue
                  : tx.vout
                      .filter((v) => !v.ourAddressConfig)
                      .reduce((sum, v) => sum + v.value, 0);

                let fee = 0;
                if (!isPositive) {
                  let totalIn = 0;
                  let allVinsResolved = true;
                  for (const v of tx.vin) {
                    const value =
                      v.txid !== undefined && v.vout !== undefined
                        ? prevoutValues.get(`${v.txid}:${v.vout}`)
                        : undefined;
                    if (value === undefined) {
                      allVinsResolved = false;
                      break;
                    }
                    totalIn += value;
                  }
                  if (allVinsResolved) {
                    const totalOut = tx.vout.reduce(
                      (sum, v) => sum + v.value,
                      0
                    );
                    fee = totalIn - totalOut;
                  }
                }

                return {
                  ...(isPending
                    ? { component: <Loader color={colors.warning} /> }
                    : { icon: isPositive ? faPlus : faPaperPlane }),
                  tags: [
                    {
                      value: `${(effectiveValue / SATS_PER_BTC).toFixed(8)} BTC`,
                      color: isPending
                        ? colors.bitcoin
                        : isPositive
                          ? colors.success
                          : colors.primaryLight
                    },
                    ...(fee > 0
                      ? [
                          {
                            value: `${t("fees")}: ${(fee / SATS_PER_BTC).toFixed(8)} BTC`,
                            color: colors.grey
                          }
                        ]
                      : [])
                  ],
                  title: isPositive ? t("received") : t("sent"),
                  onPress: `${mempoolBaseUrl}/tx/${tx.txid}${
                    voutIndex !== undefined ? `#vout=${voutIndex}` : ""
                  }`
                };
              })}
          />
        </ComponentStack>
      </PageContainer>
    </>
  );
};
