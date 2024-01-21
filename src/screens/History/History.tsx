import axios from "axios";
import { useCallback, useContext, useEffect, useState } from "react";
import {
  AsyncStorage,
  getFormattedUnit,
  isApiError,
  isMinUserType
} from "@utils";
import { bech32 } from "bech32";
import {
  Loader,
  PageContainer,
  ItemsList,
  ComponentStack,
  Icon
} from "@components";
import { useTranslation } from "react-i18next";
import {
  faArrowLeft,
  faCheckCircle,
  faTimesCircle,
  faCircleQuestion,
  faDesktopAlt,
  faMobileAlt,
  faTabletAlt,
  faPen
} from "@fortawesome/free-solid-svg-icons";
import { SBPContext, apiRootUrl, settingsKeys } from "@config";
import { useTheme } from "styled-components";
import { Switch } from "react-native";
import { useAccountConfig } from "@hooks";
import { ListItemValueText } from "@components/ItemsList/components/ListItem/ListItem";
import { UserType } from "@types";
import * as S from "./styled";

const SPECIAL_TAG_GAP = 4;

type ApiPaymentsType = {
  extra: {
    originalHash: string;
    fiatAmount: number;
    isExpired?: boolean;
    fiatUnit: string;
    deviceType: "mobile" | "tablet" | "desktop";
    deviceName: string;
    customNote?: string;
    tag: "invoice-tpos";
  };
  pending: boolean;
  amount: number;
  time: number;
  payment_hash?: string;
};

type StoreTransactionType = {
  id: string;
  isExpired: boolean;
  isPaid?: boolean;
  createdAt: number;
  fiatUnit: string;
  fiatAmount: number;
  amount?: number;
  customNote?: string;
};

type TransactionType = {
  description?: string;
  delay?: number;
  isWithdraw?: boolean;
  extra?: {
    deviceType: "mobile" | "tablet" | "desktop";
    deviceName: string;
    customNote?: string;
  };
} & StoreTransactionType;

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "long",
  timeStyle: "short"
});

export const History = () => {
  const { t: tRoot } = useTranslation();
  const { t } = useTranslation(undefined, {
    keyPrefix: "screens.history"
  });
  const { accountConfig } = useAccountConfig();
  const { userType } = useContext(SBPContext);
  const { colors } = useTheme();

  const [isLoading, setIsLoading] = useState(true);
  const [isLocal, setIsLocal] = useState(true);
  const [localIds, setLocalIds] = useState<string[]>([]);
  const [transactions, setTransactions] = useState<TransactionType[]>([]);

  const getTransactions = useCallback(async () => {
    let transactionsDetails: TransactionType[] = [];

    const localTransactionsHistory: StoreTransactionType[] = JSON.parse(
      (await AsyncStorage.getItem(settingsKeys.keyStoreTransactionsHistory)) ||
        "[]"
    );

    setLocalIds(localTransactionsHistory.map((item) => item.id));

    if (!accountConfig?.isAtm) {
      transactionsDetails = (
        await Promise.all(
          localTransactionsHistory.map((transaction) =>
            !transaction.isExpired && !transaction.isPaid
              ? axios.get(`${apiRootUrl}/checkout/${transaction.id}`)
              : { data: transaction }
          )
        )
      )
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        .map(({ data: { id = null, hash = id, ...data } }) => ({
          ...data,
          id: hash
        }));
    } else {
      const lnurlList = localTransactionsHistory.map((v) => {
        if (!v.isPaid) {
          const { words: dataPart } = bech32.decode(v.id, 2000);
          const requestByteArray = bech32.fromWords(dataPart);
          return Buffer.from(requestByteArray).toString();
        } else {
          return { data: v };
        }
      });

      transactionsDetails = (
        await Promise.all(
          lnurlList.map((lnurl, index) =>
            typeof lnurl === "string"
              ? axios.get(lnurl).catch((e) => {
                  if (isApiError(e)) {
                    return {
                      data: {
                        isPaid: e.response.status === 404,
                        defaultDescription: t("withdrawSuccess"),
                        minWithdrawable:
                          localTransactionsHistory[index].amount || 0
                      }
                    };
                  } else {
                    return {};
                  }
                })
              : lnurl
          )
        )
      ).map(({ data = {} }, index) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return {
          ...data,
          title: data.defaultDescription,
          isPending: data.tag === "withdrawRequest",
          createdAt: localTransactionsHistory[index].createdAt || 0,
          amount:
            localTransactionsHistory[index].amount || data.minWithdrawable,
          fiatAmount: localTransactionsHistory[index].fiatAmount || 0,
          fiatUnit: localTransactionsHistory[index].fiatUnit,
          isExpired: false,
          id: localTransactionsHistory[index].id,
          isWithdraw: true,
          customNote: localTransactionsHistory[index].customNote,
          extra: {
            customNote: localTransactionsHistory[index].customNote
          }
        };
      });
    }

    AsyncStorage.setItem(
      settingsKeys.keyStoreTransactionsHistory,
      JSON.stringify(transactionsDetails)
    );

    if (isMinUserType({ userType, minUserType: UserType.Admin })) {
      if (localTransactionsHistory.length === 0) {
        setIsLocal(false);
      }
      const { data: payments } = await axios.get<ApiPaymentsType[]>(
        `${apiRootUrl}/payments`,
        {
          withCredentials: true,
          headers: {
            "api-key": accountConfig?.apiKey
          }
        }
      );

      transactionsDetails = [
        ...payments
          .filter(({ extra }) => extra.tag === "invoice-tpos")
          .map((transaction) => {
            const id =
              transaction.extra.originalHash || transaction.payment_hash || "";
            const localTx = transactionsDetails.find((tx) => tx.id === id);

            return (
              localTx || {
                id,
                hash: transaction.payment_hash,
                isExpired: transaction.extra.isExpired || false,
                isPaid: !transaction.pending && !transaction.extra.isExpired,
                createdAt: transaction.time,
                fiatUnit: transaction.extra.fiatUnit,
                fiatAmount: transaction.extra.fiatAmount,
                extra: {
                  deviceName: transaction.extra.deviceName,
                  deviceType: transaction.extra.deviceType,
                  customNote: transaction.extra.customNote
                }
              }
            );
          }),
        ...localTransactionsHistory.filter(
          (transaction) => transaction.isExpired
        )
      ].reverse();
    }

    setTransactions([...transactionsDetails].reverse());
    setIsLoading(false);
  }, [accountConfig?.apiKey, accountConfig?.isAtm, t, userType]);

  useEffect(() => {
    getTransactions();
  }, []);

  const onSwitchChange = useCallback(() => {
    setIsLocal(!isLocal);
  }, [isLocal]);

  return (
    <PageContainer
      header={{ title: t("title"), left: { icon: faArrowLeft, onPress: -1 } }}
    >
      {!isLoading ? (
        <ComponentStack>
          {isMinUserType({ userType, minUserType: UserType.Admin }) && (
            <S.SwitchContainerStack direction="horizontal" gapSize={10}>
              <S.SwitchLabel>{t("myEmployees")}</S.SwitchLabel>
              <Switch value={isLocal} onValueChange={onSwitchChange} />
              <S.SwitchLabel isRight>{t("me")}</S.SwitchLabel>
            </S.SwitchContainerStack>
          )}
          <ItemsList
            items={transactions
              .filter(
                (transaction) =>
                  (!isLocal && !localIds.includes(transaction.id)) ||
                  (isLocal && localIds.includes(transaction.id))
              )
              .map((transaction) => {
                const isPaid = transaction.isPaid;
                const isExpired = transaction.isExpired;

                const color = isPaid
                  ? colors.success
                  : isExpired
                  ? colors.primaryLight
                  : colors.warning;
                const valueBase = getFormattedUnit(
                  transaction.fiatAmount,
                  transaction.fiatUnit
                );
                const customNote = transaction.extra?.customNote;
                const deviceType = transaction.extra?.deviceType;
                const deviceName = transaction.extra?.deviceName;

                const lastTags = [
                  ...(isMinUserType({
                    userType,
                    minUserType: UserType.Admin
                  })
                    ? [
                        {
                          value: (
                            <ComponentStack
                              direction="horizontal"
                              gapSize={SPECIAL_TAG_GAP}
                            >
                              <Icon
                                icon={
                                  deviceType === "mobile"
                                    ? faMobileAlt
                                    : deviceType === "tablet"
                                    ? faTabletAlt
                                    : deviceType === "desktop"
                                    ? faDesktopAlt
                                    : faCircleQuestion
                                }
                                color={colors.white}
                                size={13}
                              />
                              <ListItemValueText>
                                {deviceName}
                              </ListItemValueText>
                            </ComponentStack>
                          ),
                          color
                        }
                      ]
                    : []),
                  ...(customNote
                    ? [
                        {
                          value: (
                            <ComponentStack
                              direction="horizontal"
                              gapSize={SPECIAL_TAG_GAP}
                            >
                              <Icon
                                icon={faPen}
                                color={colors.white}
                                size={13}
                              />
                              <ListItemValueText>
                                {customNote}
                              </ListItemValueText>
                            </ComponentStack>
                          ),
                          color
                        }
                      ]
                    : [])
                ];

                return {
                  title: `${timeFormatter.format(
                    transaction.createdAt * 1000
                  )}`,
                  disabled: isPaid && transaction.isWithdraw,
                  onPress: [
                    `/invoice/${transaction.id}`,
                    {
                      state: {
                        isLocalInvoice: !isPaid && !isExpired,
                        unit: transaction.fiatUnit,
                        decimalFiat: transaction.fiatAmount,
                        customNote: transaction.extra?.customNote
                      }
                    }
                  ],
                  ...(isPaid
                    ? {
                        tags: [
                          { value: valueBase, color: color },
                          {
                            value: tRoot("common.paid"),
                            color: color
                          },
                          ...lastTags
                        ],
                        icon: faCheckCircle,
                        iconColor: color
                      }
                    : isExpired
                    ? {
                        titleColor: colors.grey,
                        tags: [
                          { value: valueBase, color },
                          {
                            value: tRoot("common.expired"),
                            color
                          },
                          ...lastTags
                        ],
                        icon: faTimesCircle,
                        iconColor: color
                      }
                    : {
                        tags: [
                          { value: valueBase, color },
                          {
                            value: tRoot("common.inProgress"),
                            color
                          },
                          ...lastTags
                        ],
                        component: <Loader size={26} color={color} />
                      })
                };
              })}
          />
        </ComponentStack>
      ) : (
        <Loader />
      )}
    </PageContainer>
  );
};
