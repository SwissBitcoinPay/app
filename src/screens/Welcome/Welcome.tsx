import { Text } from "react-native";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@components/Router";
import {
  Image,
  Blur,
  Button,
  PageContainer,
  Pressable,
  ComponentStack
} from "@components";
import {
  faAt,
  faListOl,
  faQrcode,
  faUserPlus
} from "@fortawesome/free-solid-svg-icons";
// @ts-ignore
import AnimatedLinearGradient from "react-native-animated-linear-gradient";
import { colors } from "./gradient-config";
import { useWindowDimensions } from "react-native";
import { useTheme } from "styled-components";
import { useMemo } from "react";
import { PlaceholderPresets } from "@components/QRCamera/data";
import { useVersionTag } from "@hooks";
import * as S from "./styled";

export const Welcome = () => {
  const { t } = useTranslation(undefined, { keyPrefix: "screens.welcome" });
  const navigate = useNavigate();
  const versionTag = useVersionTag();
  const theme = useTheme();
  const { height, width } = useWindowDimensions();

  const higherWindowSize = useMemo(
    () => (height > width ? height : width),
    [height, width]
  );

  const introTextParts = useMemo(
    () => t("introTitle").split("{{bitcoin}}"),
    [t]
  );

  return (
    <>
      <AnimatedLinearGradient customColors={colors} speed={6000} />
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

      <PageContainer noVerticalPadding>
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
            {introTextParts[0]}{" "}
            <Text style={{ color: theme.colors.bitcoin }}>Bitcoin</Text>
            {introTextParts[1] ? ` ${introTextParts[1]}` : ""}.
          </S.TagLine>

          <S.SubTagLine>😎 {t("easily")}.</S.SubTagLine>
          <S.SubTagLine>🌎 {t("worldwide")}.</S.SubTagLine>
          <S.SubTagLine>🔒 {t("nonCustodial")}.</S.SubTagLine>
          <S.SubTagLine>🛡️ {t("noKyc")}.</S.SubTagLine>
          <S.SubTagLine>⚡ {t("in1minute")}.</S.SubTagLine>
        </S.FirstPart>
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
            onPress={() => {
              navigate("/qr-scanner", {
                state: {
                  title: t("scanActivationQRcode"),
                  placeholderPreset: PlaceholderPresets.activationQrCode
                }
              });
            }}
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
              title={t("12words")}
              icon={faListOl}
              onPress="/signature-login"
            />
          </ComponentStack>
        </ComponentStack>

        <S.PressableVersion onPress="https://github.com/SwissBitcoinPay/app">
          <S.VersionText h5 weight={600}>
            {versionTag}
          </S.VersionText>
        </S.PressableVersion>
      </PageContainer>
    </>
  );
};
