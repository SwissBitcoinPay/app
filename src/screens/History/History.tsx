import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  AsyncStorage,
  getFormattedUnit,
  isMinUserType,
  numberWithSpaces
} from "@utils";
import { startOfDay } from "date-fns";
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
  faPen,
  faCashRegister
} from "@fortawesome/free-solid-svg-icons";
import { SBPContext, settingsKeys } from "@config";
import { useTheme } from "styled-components";
import { Switch } from "react-native";
import { useAccountConfig, useRates } from "@hooks";
import { ListItemValueText } from "@components/ItemsList/components/ListItem/ListItem";
import { UserType, api, type ApipaymentsSelect } from "@types";
import * as S from "./styled";

const SPECIAL_TAG_GAP = 4;

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "long",
  timeStyle: "short"
});

type LocalInvoice = {
  id: string;
  status: string;
  created_at: number;
  amount_sat: number;
  input?: { amount: number; unit: string };
  description?: string | null;
  device?: { name?: string; type?: string; appVersion?: string };
  tag?: string | null;
  title?: string | null;
  lnurl?: string;
};

type HistoryItem = ApipaymentsSelect | LocalInvoice;

const getDevice = (item: HistoryItem) =>
  (item as { device?: { name?: string; type?: string } }).device;

const getCreatedAt = (item: HistoryItem) =>
  (item as { created_at?: number; createdAt?: number }).created_at ??
  (item as { createdAt?: number }).createdAt ??
  0;

export const History = () => {
  const { t: tRoot } = useTranslation();
  const { t } = useTranslation(undefined, {
    keyPrefix: "screens.history"
  });
  const { accountConfig } = useAccountConfig({ refresh: true });
  const { userType } = useContext(SBPContext);
  const { colors } = useTheme();
  const rates = useRates();

  const [isLoading, setIsLoading] = useState(true);
  const [isLocal, setIsLocal] = useState(true);
  const [localIds, setLocalIds] = useState<string[]>([]);
  const [transactions, setTransactions] = useState<HistoryItem[]>([]);

  const getTransactions = useCallback(async () => {
    const localTransactionsIds: string[] = JSON.parse(
      (await AsyncStorage.getItem(settingsKeys.keyStoreLocalTransactionsIds)) ||
        "[]"
    );

    setLocalIds(localTransactionsIds);

    try {
      const { records } = await api.apipayments.list({
        pagination: { limit: 100 }
      });

      if (
        isMinUserType({ userType, minUserType: UserType.Admin }) &&
        localTransactionsIds.length === 0
      ) {
        setIsLocal(false);
      }

      setTransactions(
        records.filter(
          ({ tag, amount_sat }) =>
            tag === "invoice-tpos" || (accountConfig?.is_atm && amount_sat < 0)
        )
      );
    } catch (e) {}
    setIsLoading(false);
  }, [accountConfig?.is_atm, userType]);

  useEffect(() => {
    getTransactions();
  }, []);

  const onSwitchChange = useCallback(() => {
    setIsLocal(!isLocal);
  }, [isLocal]);

  const todayReceive = useMemo(() => {
    if (rates && accountConfig?.currency) {
      const startOfToday = startOfDay(new Date()).getTime() / 1000;
      const satsTotal = transactions.reduce((result, transaction) => {
        if (
          getCreatedAt(transaction) < startOfToday ||
          transaction.amount_sat <= 0 ||
          transaction.status !== "settled"
        ) {
          return result;
        }
        return result + transaction.amount_sat;
      }, 0);

      return {
        fiat: getFormattedUnit(
          (rates[accountConfig.currency] * satsTotal) / 100000000,
          accountConfig.currency
        ),
        sats: satsTotal
      };
    }
  }, [accountConfig?.currency, rates, transactions]);

  console.log({ localIds, transactions });

  return (
    <PageContainer
      header={{ title: t("title"), left: { icon: faArrowLeft, onPress: -1 } }}
    >
      {!isLoading ? (
        <ComponentStack>
          {todayReceive?.sats > 0 && (
            <ComponentStack fullWidth>
              <S.CashedListItem
                title={t("cashedToday")}
                icon={faCashRegister}
                iconColor={colors.white}
                tags={[
                  {
                    value: `${numberWithSpaces(todayReceive.sats)} sats (~${
                      todayReceive.fiat
                    })`,
                    color: "transparent"
                  }
                ]}
                disabled
              />
            </ComponentStack>
          )}
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
                  transaction.input?.amount || 0,
                  transaction.input?.unit
                );

                const device = getDevice(transaction);
                const deviceType = device?.type;
                const deviceName = device?.name;
                const lnurl = (transaction as LocalInvoice).lnurl;

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
                  title: `${timeFormatter.format(getCreatedAt(transaction) * 1000)}`,
                  disabled:
                    (isPaid && transaction.tag === "withdraw") ||
                    isExpired ||
                    (accountConfig?.is_atm && !isLocal),
                  onPress: [
                    `/invoice/${lnurl || transaction.id}`,
                    {
                      state: {
                        isLocalInvoice: !isPaid && !isExpired,
                        unit: transaction.input?.unit,
                        decimalFiat: transaction.input?.amount,
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
