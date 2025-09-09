import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import {
  Image,
  Button,
  PageContainer,
  Pressable,
  ComponentStack
} from "@components";
import {
  faAt,
  faKey,
  faQrcode,
  faUserPlus
} from "@fortawesome/free-solid-svg-icons";
// @ts-ignore
import AnimatedLinearGradient from "react-native-animated-linear-gradient";
import { colors } from "./gradient-config";
import { useTheme } from "styled-components";
import { useMemo } from "react";
import {
  useIsScreenSizeMin,
  useQrLoginScan,
  useScanQr,
  useVersionTag
} from "@hooks";
import FinmaSvg from "@assets/images/finma.svg";
import * as S from "./styled";

export const Welcome = () => {
  const { t } = useTranslation(undefined, { keyPrefix: "screens.welcome" });
  const versionTag = useVersionTag();
  const theme = useTheme();
  const qrLoginScan = useQrLoginScan();
  const startQrScan = useScanQr({ onScan: qrLoginScan });
  const isLarge = useIsScreenSizeMin("large");

  const introTextParts = useMemo(
    () => t("introTitle").split("{{bitcoin}}"),
    [t]
  );

  const finmaSizes /* hopefully never too big */ = useMemo(() => {
    const ORIGINAL_LOGO_SIZE = [192.25, 80];
    if (isLarge) {
      return {
        container: { style: { marginBottom: 14 } },
        textsContainer: {
          style: { marginTop: 1, marginRight: 6 }
        },
        text: { h5: true },
        logo: {
          width: ORIGINAL_LOGO_SIZE[0] / 1.13,
          height: ORIGINAL_LOGO_SIZE[1] / 1.13
        }
      };
    } else {
      return {
        container: { style: { marginBottom: 12 } },
        textsContainer: { style: { marginRight: 3 } },
        text: { h8: true },
        logo: {
          width: ORIGINAL_LOGO_SIZE[0] / 1.8,
          height: ORIGINAL_LOGO_SIZE[1] / 1.8
        }
      };
    }
  }, [isLarge]);

  return (
    <>
      <AnimatedLinearGradient customColors={colors} speed={6000} />
      {/* {!isIos && (
        <S.BlurContainer>
          <S.LightningAnimation
            loop
            autoPlay
            resizeMode="contain"
            size={higherWindowSize}
            source={require("@assets/animations/lightning.json")}
          />
          <Blur blurRadius={24} />
        </S.BlurContainer>
      )} */}

      <PageContainer noVerticalPadding>
        <View>
        <Pressable onPress="https://swiss-bitcoin-pay.ch">
          <Image
            style={{
              height: 28,
              aspectRatio: "55/7"
            }}
            source={require("@assets/images/logo-white.png")}
          />
        </Pressable>
        <S.FirstPart>
          <S.TagLine h2 weight={700}>
            {introTextParts[0]}
            <Text style={{ color: theme.colors.bitcoin, margin: 0 }}>
              Bitcoin
            </Text>
            {introTextParts[1]}.
          </S.TagLine>
          <S.SubTagLine>👍 {t("easily")}.</S.SubTagLine>
          <S.SubTagLine>🌎 {t("worldwide")}.</S.SubTagLine>
          <S.SubTagLine>🔒 {t("nonCustodial")}.</S.SubTagLine>
          <S.SubTagLine>🛡️ {t("noKyc")}.</S.SubTagLine>
          <S.SubTagLine>⚡ {t("in1minute")}.</S.SubTagLine>
        </S.FirstPart>
        <S.FinmaContainer {...finmaSizes.container}>
          <S.FinmaTextsContainer {...finmaSizes.textsContainer}>
            <S.FinmaText {...finmaSizes.text}>
              {t("licensedBy")} FINMA
            </S.FinmaText>
            <S.FinmaText {...finmaSizes.text}>{t("finma")}</S.FinmaText>
          </S.FinmaTextsContainer>
          <FinmaSvg {...finmaSizes.logo} />
        </S.FinmaContainer>
        <Button
          title={t("createAccount")}
          icon={faUserPlus}
          size="large"
          type="bitcoin"
          onPress="/signup"
        />
        <S.SeparatorLine />
        <S.ConnectText h4 weight={700}>
          {t("orConnectBy")}...
        </S.ConnectText>
        <ComponentStack>
          <Button
            icon={faQrcode}
            title={t("scanActivationQRcode")}
            onPress={startQrScan}
          />
          <ComponentStack direction="horizontal" gapSize={12}>
            <Button
              style={{ flex: 1 }}
              size="small"
              title={t("email")}
              icon={faAt}
              onPress={"/email-login"}
            />
            <Button
              style={{ flex: 1 }}
              size="small"
              title={t("signature")}
              icon={faKey}
              onPress="/signature-login"
            />
          </ComponentStack>
        </ComponentStack>

        <S.PressableVersion onPress="https://github.com/SwissBitcoinPay/app">
          <S.VersionText h5 weight={600}>
            {versionTag}
          </S.VersionText>
        </S.PressableVersion>
        </View>
      </PageContainer>
    </>
  );
};
