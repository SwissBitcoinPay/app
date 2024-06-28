import { useEffect } from "react";
import { useTheme } from "styled-components";
import { useTranslation } from "react-i18next";
import { ComponentStack, FieldDescription, Text } from "@components";
import ScreenGuardModule from "react-native-screenguard";
import { StepProps } from "../../CreateWalletModal";
import { generateBtcAddress, getRandomNumber } from "@utils";
import { Word } from "../Word";
import { ActivityIndicator, Platform } from "react-native";
import * as S from "./styled";
import { platform } from "@config";

const { isWeb } = platform;

export const Step3 = ({ setIsValid, setValue, watch }: StepProps) => {
  const { t } = useTranslation(undefined, {
    keyPrefix: "createWalletModal.step3"
  });
  const { colors } = useTheme();

  const words = watch("words");

  useEffect(() => {
    if (Platform.OS === "web") {
    }
  }, []);

  useEffect(() => {
    setIsValid(false);
    (async () => {
      const {
        words: newWords,
        zPub,
        firstAddress,
        firstAddressPrivateKey
      } = await generateBtcAddress();
      setValue("words", newWords);
      setValue("zPub", zPub);
      setValue("firstAddress", firstAddress);
      setValue("firstAddressPrivateKey", firstAddressPrivateKey);

      const verifyIndexes: number[] = [];

      for (; verifyIndexes.length < 3; ) {
        const rand = getRandomNumber(1, newWords.length);

        if (!verifyIndexes.includes(rand)) {
          verifyIndexes.push(rand);
        }
      }

      setValue("verifyIndexes", verifyIndexes);
      setIsValid(true);
    })();
  }, []);

  useEffect(() => {
    if (!isWeb) {
      ScreenGuardModule.register("#000000");

      return () => {
        ScreenGuardModule.unregister();
      };
    } else {
      const noPrintFn = (e: KeyboardEvent) => {
        if (e.ctrlKey && e.key === "p") {
          // eslint-disable-next-line no-alert
          alert(
            "You can't print or take screenshot of your private key. Write it down on paper!"
          );
          e.cancelBubble = true;
          e.preventDefault();
          e.stopImmediatePropagation();
        } else if (e.key === "PrintScreen") {
          navigator.clipboard.writeText("");
          // eslint-disable-next-line no-alert
          alert(
            "You can't print or take screenshot of your private key. Write it down on paper!"
          );
        }
      };

      document.addEventListener("keydown", noPrintFn);
      document.addEventListener("keyup", noPrintFn);

      return () => {
        document.removeEventListener("keydown", noPrintFn);
        document.removeEventListener("keyup", noPrintFn);
      };
    }
  }, []);

  return (
    <ComponentStack>
      {words && (
        <S.CenteredFieldDescription>
          ✍️ {t("instructions1")}
        </S.CenteredFieldDescription>
      )}
      {words && (
        <S.CenteredFieldDescription color={colors.warning}>
          🔢 {t("instructions2")}
        </S.CenteredFieldDescription>
      )}
      {words ? (
        <S.WordsContainer id="no-print">
          <S.WordsColumn>
            {words.slice(0, 6).map((word, index) => (
              <Word key={index} index={index + 1} word={word} />
            ))}
          </S.WordsColumn>
          <S.WordsColumn>
            {words.slice(6).map((word, index) => (
              <Word key={index} index={index + 7} word={word} />
            ))}
          </S.WordsColumn>
          <S.ConfidentialText>🔒 {t("confidential")}</S.ConfidentialText>
        </S.WordsContainer>
      ) : (
        <S.CenteredStackComponent gapSize={6}>
          <ActivityIndicator size="large" color={colors.white} />
          <Text h4 weight={600} color={colors.white}>
            {t("generatingYourWallet")}
          </Text>
        </S.CenteredStackComponent>
      )}
      {words && <FieldDescription>🔒 {t("instructions3")}</FieldDescription>}
    </ComponentStack>
  );
};
