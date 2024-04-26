import { useCallback, useContext, useMemo, useState } from "react";
import {
  SBPContext,
  apiRootUrl,
  appRootUrl,
  currencies,
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
  ItemsList
} from "@components";
import { useNavigate } from "@components/Router";
import {
  faArrowLeft,
  faChain,
  faCoins,
  faDollarSign,
  faEnvelope,
  faRightFromBracket,
  faStore,
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
import { AccountConfigType, UserType } from "@types";
import { useTheme } from "styled-components";
import axios from "axios";
import { AsyncStorage, isMinUserType } from "@utils";
import { useToast } from "react-native-toast-notifications";
import { ModalInputDescription } from "@hooks/useModalInput/useModalInput";
import * as S from "./styled";

const { isWeb } = platform;

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

  const settingsValues = useMemo(() => {
    return {
      currency: currencies.find((c) => c.value === accountConfig?.currency)
    };
  }, [accountConfig?.currency]);

  const onPatchSetting = useCallback(
    (setting: keyof AccountConfigType) =>
      async (value: string | number | boolean) => {
        try {
          const patchData = { [setting]: value };

          await axios.patch(`${apiRootUrl}/account`, patchData, {
            withCredentials: true
          });

          toast.show(t("patchSettingSuccessful"), {
            type: "success"
          });
          setAccountConfig(patchData);

          return true;
        } catch (e) {
          toast.show(t("patchSettingError"), {
            type: "error"
          });
          return false;
        }
      },
    [setAccountConfig, t, toast]
  );

  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isLogoutLoading, setIsLogoutLoading] = useState(false);

  const onLogout = useCallback(async () => {
    try {
      setIsLogoutLoading(true);
      try {
        await axios.post(`${apiRootUrl}/auth`, null, { withCredentials: true });
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
          items={currencies}
          right={{ icon: faDollarSign }}
          onValueChange={() => {}}
          placeholder={{}}
        />
      ),
      defaultValue: accountConfig?.currency,
      label: t("currency"),
      description: (
        <ComponentStack gapSize={10}>
          <ModalInputDescription>
            {t("currencyDescription")}
          </ModalInputDescription>
          {(accountConfig?.btcPercent || 0) < 100 && (
            <Callout>
              {t("currencyChangeWarning", {
                fiatPercent: 100 - (accountConfig?.btcPercent || 0),
                currency: accountConfig?.currency
              })}
            </Callout>
          )}
        </ComponentStack>
      ),
      onChange: onPatchSetting("currency")
    });

  const { modal: onOnchainModal, onPressElement: onPressOnChain } =
    useModalInput({
      element: <CheckboxField />,
      defaultValue: accountConfig?.isOnchainAvailable || false,
      label: t("onchainAvailable"),
      description: t("onchainAvailableDescription"),
      onChange: onPatchSetting("isOnchainAvailable")
    });

  const formattedBtcPayout = useMemo(() => {
    const { btcPercent, currency } = accountConfig || {};

    if (btcPercent !== undefined) {
      if (btcPercent === 100) {
        return t("allInBtc");
      } else if (btcPercent === 0) {
        return t("allInFiat", { currency });
      } else {
        return t("percentInBtcAndFiat", {
          btcPercent,
          fiatPercent: 100 - btcPercent,
          currency
        });
      }
    }
  }, [t, accountConfig]);

  const activationCodeData = useMemo<`https://${string}`>(
    () => `${appRootUrl}/connect/${accountConfig?.apiKey}`,
    [accountConfig?.apiKey]
  );

  return (
    <PageContainer
      header={{
        title: t("title"),
        left: { icon: faArrowLeft, onPress: -1 }
      }}
    >
      <S.FlexComponentStack>
        {accountConfig ? (
          !accountConfig.isAtm &&
          !accountConfig.isCheckoutSecure && (
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
              {isMinUserType({ userType, minUserType: UserType.Admin }) && (
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
                      tags: [{ value: accountConfig.isOnchainAvailable }],
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
                {merchantNameModal}
                {currencyModal}
                {onOnchainModal}
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
