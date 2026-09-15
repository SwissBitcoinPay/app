import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  SBPContext,
  appRootUrl,
  dashboardUrl,
  getEnabledCurrencies,
  getRuntimeCurrencies,
  platform
} from "@config";
import {
  ComponentStack,
  Loader,
  PageContainer,
  SelectField,
  Text,
  TextField,
  CheckboxField,
  Icon,
  Button,
  Modal,
  FieldDescription,
  Callout,
  ItemsList,
  PrinterField
} from "@components";
import { useNavigate } from "@components/Router";
import {
  faArrowLeft,
  faChain,
  faCoins,
  faCopy,
  faDollarSign,
  faEnvelope,
  faReceipt,
  faRightFromBracket,
  faShareNodes,
  faStore,
  faTableColumns,
  faUser,
  faUserTie,
  faWallet
} from "@fortawesome/free-solid-svg-icons";
import {
  useAccountConfig,
  useIsScreenSizeMin,
  useModalInput,
  useVersionTag
} from "@hooks";
import { useTranslation } from "react-i18next";
import {
  UserType,
  api,
  client,
  type AccountsUpdate,
  type AccountConfigType
} from "@types";
import { useTheme } from "styled-components";
import { AsyncStorage, isMinUserType } from "@utils";
import { useToast } from "react-native-toast-notifications";
import { ModalInputDescription } from "@hooks/useModalInput/useModalInput";
import * as S from "./styled";
import {
  keyStoreIsGuest,
  keyStoreTicketsAutoPrint
} from "@config/settingsKeys";
import { Share } from "react-native";

const { isIos, isWeb, isBitcoinize, isShareAvailable } = platform;

export const Settings = () => {
  const { colors } = useTheme();
  const versionTag = useVersionTag();
  const toast = useToast();
  const { t } = useTranslation(undefined, {
    keyPrefix: "screens.settings"
  });
  const { t: tRoot } = useTranslation();
  const navigate = useNavigate();
  const isLarge = useIsScreenSizeMin("large");
  const { accountConfig, setAccountConfig } = useAccountConfig();
  const { clearContext, userType } = useContext(SBPContext);
  const currencies = getRuntimeCurrencies();
  const availableCurrencies = useMemo(
    () =>
      getEnabledCurrencies().filter(
        ({ value }) => !["sat", "BTC"].includes(value)
      ),
    []
  );

  const settingsValues = useMemo(() => {
    return {
      currency: currencies.find((c) => c.value === accountConfig?.currency)
    };
  }, [accountConfig?.currency, currencies]);

  const onPatchSetting = useCallback(
    <K extends keyof AccountsUpdate>(setting: K) =>
      async (value: AccountsUpdate[K]) => {
        if (!accountConfig?.id) return false;
        try {
          const patchData = { [setting]: value } as Partial<AccountsUpdate>;

          await api.accounts.update(accountConfig.id, patchData);

          toast.show(t("patchSettingSuccessful"), {
            type: "success"
          });
          setAccountConfig(patchData as Partial<AccountConfigType>);

          return true;
        } catch (e) {
          toast.show(t("patchSettingError"), {
            type: "error"
          });
          return false;
        }
      },
    [accountConfig?.id, setAccountConfig, t, toast]
  );

  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isLogoutLoading, setIsLogoutLoading] = useState(false);

  const [isGuestMode, setIsGuestMode] = useState(false);
  const [isTicketsPrinted, setIsTicketsPrinted] = useState(false);

  const onLogout = useCallback(async () => {
    try {
      setIsLogoutLoading(true);
      try {
        await client.logout();
      } catch (e) {}
      await AsyncStorage.clear();
      clearContext();
      toast.show(t("logoutSuccessful"), {
        type: "success"
      });
      navigate("/");
    } catch (e) {}
    setIsLogoutLoading(false);
    return true;
  }, [clearContext, navigate, t, toast]);

  const { modal: merchantNameModal, onPressElement: onPressMerchantName } =
    useModalInput({
      element: <TextField autoFocus right={{ icon: faStore }} />,
      defaultValue: accountConfig?.name,
      label: t("merchantName"),
      description: t("merchantNameDescription"),
      onChange: onPatchSetting("name"),
      validate: (v) => v.length < 30
    });

  const { modal: currencyModal, onPressElement: onPressCurrency } =
    useModalInput({
      element: (
        <SelectField
          items={availableCurrencies}
          right={{ icon: faDollarSign }}
          onValueChange={() => {}}
          placeholder={{}}
        />
      ),
      defaultValue: accountConfig?.currency ?? undefined,
      label: t("currency"),
      description: (
        <ComponentStack gapSize={10}>
          <ModalInputDescription>
            {t("currencyDescription")}
          </ModalInputDescription>
          {(accountConfig?.btc_percent || 0) < 100 && (
            <Callout>
              {t("currencyChangeWarning", {
                fiatPercent: 100 - (accountConfig?.btc_percent || 0),
                currency: accountConfig?.currency
              })}
            </Callout>
          )}
        </ComponentStack>
      ),
      onChange: (value: string | number | boolean) =>
        onPatchSetting("currency")(value as string)
    });

  const { modal: onchainModal, onPressElement: onPressOnChain } = useModalInput(
    {
      element: <CheckboxField />,
      defaultValue: accountConfig?.is_onchain_available || false,
      label: t("onchainAvailable"),
      description: t("onchainAvailableDescription"),
      onChange: onPatchSetting("is_onchain_available")
    }
  );

  const onUpdateTicket = useCallback(
    (newValue: boolean) => {
      setIsTicketsPrinted(newValue);
      void AsyncStorage.setItem(keyStoreTicketsAutoPrint, newValue.toString());
      toast.show(t("patchSettingSuccessful"), {
        type: "success"
      });
      return true;
    },
    [t, toast]
  );

  const { modal: ticketsModal, onPressElement: onPressTickets } = useModalInput(
    {
      element: <PrinterField />,
      defaultValue: isTicketsPrinted,
      label: t("ticketsPrinting"),
      description: t("ticketsPrintingDescription"),
      onChange: onUpdateTicket
    }
  );

  const formattedBtcPayout = useMemo(() => {
    const { btc_percent, currency } = accountConfig || {};

    if (btc_percent !== undefined && btc_percent !== null) {
      if (btc_percent === 100) {
        return t("allInBtc");
      } else if (btc_percent === 0) {
        return t("allInFiat", { currency });
      } else {
        return t("percentInBtcAndFiat", {
          btcPercent: btc_percent,
          fiatPercent: 100 - btc_percent,
          currency
        });
      }
    }
  }, [t, accountConfig]);

  const activationCodeData = useMemo<`https://${string}`>(
    () =>
      `${
        window?.location?.origin || appRootUrl
      }/connect/${accountConfig?.invoice_key}`,
    [accountConfig?.invoice_key]
  );

  useEffect(() => {
    (async () => {
      setIsGuestMode((await AsyncStorage.getItem(keyStoreIsGuest)) === "true");
      setIsTicketsPrinted(
        (await AsyncStorage.getItem(keyStoreTicketsAutoPrint)) === "true"
      );
    })();
  }, []);

  const isMinAdmin = useMemo(
    () => isMinUserType({ userType, minUserType: UserType.Admin }),
    [userType]
  );

  const [shareMessageShort, shareMessageFull] = useMemo(() => {
    const initialShareMessageText = t("invitationText", {
      merchantName: accountConfig?.name
    });
    return [
      initialShareMessageText,
      [initialShareMessageText, "", activationCodeData].join("\n")
    ];
  }, [accountConfig?.name, activationCodeData, t]);

  const shareActivationLink = useCallback(async () => {
    await Share.share({
      title: t("acceptBitcoinPayments"),
      ...(isIos
        ? {
            message: shareMessageShort,
            url: activationCodeData
          }
        : {
            message: shareMessageFull
          })
    });
  }, [activationCodeData, shareMessageFull, shareMessageShort, t]);

  return (
    <PageContainer
      header={{
        title: t("title"),
        left: { icon: faArrowLeft, onPress: -1 }
      }}
    >
      <S.FlexComponentStack>
        {accountConfig ? (
          !accountConfig.is_atm &&
          !accountConfig.is_checkout_secure &&
          !isGuestMode && (
            <S.FlexComponentStack>
              <Text centered h3 weight={700} color={colors.white}>
                {t("activationCode")}
              </Text>
              <S.QRPressable onPress={activationCodeData} disabled={!isWeb}>
                <S.QR
                  size={220}
                  value={activationCodeData}
                  image={{
                    source: require("@assets/images/logo-square-rounded.png")
                  }}
                />
              </S.QRPressable>
              <Text centered weight={600} color={colors.white}>
                {t("scanOtherColleagues")}{" "}
                <Text centered weight={600} color={colors.bitcoin}>
                  {accountConfig.name}
                </Text>
              </Text>
              <Button
                size="small"
                style={{ alignSelf: "center", flexGrow: 0, flex: 0 }}
                {...(isShareAvailable
                  ? {
                      icon: faShareNodes,
                      title: t("shareMyLink"),
                      onPress: shareActivationLink
                    }
                  : {
                      icon: faCopy,
                      title: t("copyMyLink"),
                      copyContent: shareMessageFull
                    })}
              />
              {(isMinAdmin || isBitcoinize) && (
                <ItemsList
                  headerComponent={
                    <S.EditableLine>
                      <S.EditText
                        ellipsizeMode="tail"
                        numberOfLines={1}
                        h3
                        weight={600}
                      >
                        {t("editableSettings")}
                      </S.EditText>
                    </S.EditableLine>
                  }
                  items={[
                    ...(isBitcoinize
                      ? [
                          {
                            icon: faReceipt,
                            title: t("tickets"),
                            tags: [{ value: isTicketsPrinted }],
                            onPress: onPressTickets
                          }
                        ]
                      : []),
                    ...(isMinAdmin
                      ? [
                          {
                            icon: faStore,
                            title: t("merchantName"),
                            tags: [{ value: accountConfig.name }],
                            onPress: onPressMerchantName
                          },
                          {
                            icon: faDollarSign,
                            title: t("currency"),
                            tags: [{ value: settingsValues.currency?.label }],
                            onPress: onPressCurrency
                          },
                          {
                            icon: faChain,
                            title: t("onchainAvailable"),
                            tags: [
                              { value: accountConfig.is_onchain_available }
                            ],
                            onPress: onPressOnChain
                          },
                          {
                            icon: faEnvelope,
                            title: t("email"),
                            tags: [{ value: accountConfig.mail }],
                            onPress: () => null,
                            disabled: true
                          },
                          {
                            icon: faCoins,
                            title: t("payout"),
                            tags: [{ value: formattedBtcPayout }],
                            onPress: "/payout-config"
                          },
                          ...(isMinUserType({
                            userType,
                            minUserType: UserType.Wallet
                          })
                            ? [
                                {
                                  icon: faWallet,
                                  title: t("wallet"),
                                  tags: [{ value: t("accessWallet") }],
                                  onPress: "/wallet" as const
                                }
                              ]
                            : [])
                        ]
                      : [])
                  ]}
                />
              )}
              <S.ConnectedAsContainer>
                <S.ConnectedAsText h5 weight={600}>
                  {t("connectedAs")}
                </S.ConnectedAsText>
                <S.ConnectedAsContainerLine direction="horizontal" gapSize={4}>
                  <Icon
                    color={colors.primary}
                    icon={
                      userType === UserType.Wallet
                        ? faWallet
                        : userType === UserType.Admin
                          ? faUserTie
                          : faUser
                    }
                    size={12}
                  />
                  <S.UserTypeText h5 weight={600}>
                    {tRoot(`common.${userType}`)}
                  </S.UserTypeText>
                </S.ConnectedAsContainerLine>
              </S.ConnectedAsContainer>
              <>
                {ticketsModal}
                {merchantNameModal}
                {currencyModal}
                {onchainModal}
              </>
            </S.FlexComponentStack>
          )
        ) : (
          <Loader reason={t("loading")} style={{ alignSelf: "center" }} />
        )}
        <Modal
          isOpen={isLogoutModalOpen}
          title={t("confirmLogout")}
          onClose={() => {
            setIsLogoutModalOpen(false);
          }}
          submitButton={{
            title: t("logout"),
            isLoading: isLogoutLoading,
            type: "error",
            onPress: onLogout
          }}
        >
          <FieldDescription>{t("confirmLogoutDescription")}</FieldDescription>
        </Modal>
        <Button
          title={t("dashboard")}
          icon={faTableColumns}
          onPress={dashboardUrl}
        />
        <ComponentStack direction={isLarge ? "horizontal" : "vertical"}>
          <Button
            title={t("contactSupport")}
            mode="outline"
            icon={faEnvelope}
            onPress="mailto:hello@swiss-bitcoin-pay.ch?subject=Question"
          />
          <Button
            title={t("logout")}
            icon={faRightFromBracket}
            type="error"
            onPress={() => {
              setIsLogoutModalOpen(true);
            }}
          />
        </ComponentStack>
        <S.PressableVersion onPress="https://github.com/SwissBitcoinPay/app">
          <S.VersionText>{versionTag}</S.VersionText>
        </S.PressableVersion>
      </S.FlexComponentStack>
    </PageContainer>
  );
};
