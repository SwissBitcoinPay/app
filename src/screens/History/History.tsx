import axios from "axios";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
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
import { InvoiceType } from "@screens/Invoice/Invoice";
import * as S from "./styled";

const SPECIAL_TAG_GAP = 4;

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
  const [transactions, setTransactions] = useState<InvoiceType[]>([]);

  const now = useMemo(() => new Date().getTime() / 1000, []);

  const getTransactions = useCallback(async () => {
    let transactionsDetails: InvoiceType[] = [];

    const localTransactionsHistory: InvoiceType[] = JSON.parse(
      (await AsyncStorage.getItem(settingsKeys.keyStoreTransactionsHistory)) ||
        "[]"
    );

    setLocalIds(localTransactionsHistory.map((item) => item.id));

    if (!accountConfig?.isAtm) {
      transactionsDetails = (
        await Promise.all(
          localTransactionsHistory.map((transaction) => {
            return !["settled", "canceled"].includes(transaction.status) &&
              transaction.expiry > now
              ? axios.get<InvoiceType>(
                  `${apiRootUrl}/checkout/${transaction.id}`
                )
              : { data: transaction };
          })
        )
      ).map(({ data }) => ({
        ...data,
        status: data.expiry <= now ? "expired" : data.status
      }));
    } else {
      const lnurlList = localTransactionsHistory.map((v) => {
        if (v.status !== "settled") {
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
        return {
          ...data,
          id: localTransactionsHistory[index].id,
          title: data.defaultDescription,
          status: data.tag === "withdraw" ? "unconfirmed" : "expired",
          time: localTransactionsHistory[index].time || 0,
          amount:
            localTransactionsHistory[index].amount || data.minWithdrawable,
          input: localTransactionsHistory[index].input,
          description: localTransactionsHistory[index].description
        } as InvoiceType;
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
      const { data: payments } = await axios.get<InvoiceType[]>(
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
          .filter(({ tag }) => tag === "invoice-tpos")
          .map((transaction) => {
            const id = transaction.id || "";
            const localTx = transactionsDetails.find((tx) => tx.id === id);

            return localTx || transaction;
          }),
        ...localTransactionsHistory
          .filter((transaction) => transaction.status === "expired")
          .reverse()
      ].reverse();
    }

    setTransactions([...transactionsDetails].reverse());
    setIsLoading(false);
  }, [accountConfig?.apiKey, accountConfig?.isAtm, now, t, userType]);

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
                const isPaid = transaction.status === "settled";
                const isExpired = transaction.status === "expired";

                const color = isPaid
                  ? colors.success
                  : isExpired
                  ? colors.primaryLight
                  : colors.warning;
                const valueBase = getFormattedUnit(
                  transaction.input.amount,
                  transaction.input.unit
                );

                const deviceType = transaction.device?.type;
                const deviceName = transaction.device?.name;

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
                  ...(transaction.description
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
                                {transaction.description}
                              </ListItemValueText>
                            </ComponentStack>
                          ),
                          color
                        }
                      ]
                    : [])
                ];

                return {
                  title: `${timeFormatter.format(transaction.time * 1000)}`,
                  disabled:
                    (isPaid && transaction.tag === "withdraw") || isExpired,
                  onPress: [
                    `/invoice/${transaction.id}`,
                    {
                      state: {
                        isLocalInvoice: !isPaid && !isExpired,
                        unit: transaction.input.unit,
                        decimalFiat: transaction.input.amount,
                        description: transaction.description
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
