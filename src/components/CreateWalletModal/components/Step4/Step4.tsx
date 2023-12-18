import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TextInput } from "react-native";
import { useTheme } from "styled-components";
import { useTranslation } from "react-i18next";
import * as BIP39 from "bip39";
import { ComponentStack, Dots, FieldDescription, TextField } from "@components";
import { StepProps } from "../../CreateWalletModal";
import { IndexContainer, IndexText } from "../Word/styled";
import * as S from "./styled";

const wordsList = BIP39.wordlists.english;

export const Step4 = ({ watch, setIsValid, onNextStep }: StepProps) => {
  const { t } = useTranslation(undefined, {
    keyPrefix: "createWalletModal.step4"
  });

  const { colors } = useTheme();

  const words = watch("words");
  const verifyIndexes = watch("verifyIndexes");

  const [indexStep, setIndexStep] = useState(0);
  const [indexToCheck, setIndexToCheck] = useState(verifyIndexes[indexStep]);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string>();
  const [isSuccess, setIsSuccess] = useState(false);

  const textInputRef = useRef<TextInput>(null);

  useEffect(() => {
    setIsValid(false);
  }, []);

  const onChangeText = useCallback(
    (newValue: string) => {
      setValue(newValue);

      if (wordsList.includes(newValue)) {
        // Word validation
        if (newValue === words[indexToCheck - 1]) {
          // Word is correct
          textInputRef.current?.blur();

          const newStep = indexStep + 1;
          if (newStep < verifyIndexes.length) {
            setIsSuccess(true);
            setIndexStep(newStep);
            setIndexToCheck(verifyIndexes[newStep]);
            setValue("");
            setTimeout(() => {
              textInputRef.current?.focus();
              setIsSuccess(false);
            }, 1500);
          } else {
            // All indexes validated
            onNextStep();
          }
        } else {
          setError(t("invalidWord"));
        }
      } else {
        setError(undefined);
      }
    },
    [words, indexToCheck, indexStep, verifyIndexes, onNextStep, t]
  );

  const suggestionList = useMemo(() => {
    if (value.length > 0) {
      const ret = wordsList.filter((word) => word.startsWith(value));

      if (ret.length <= 5) {
        return ret;
      }
    }
    return [];
  }, [value]);

  return (
    <ComponentStack gapSize={16}>
      <ComponentStack gapSize={6}>
        <S.CenteredFieldDescription>
          {t("instructions1")}
        </S.CenteredFieldDescription>
        <S.WordNumberContainer direction="horizontal" gapSize={8}>
          <FieldDescription
            h4
            color={isSuccess ? colors.success : colors.bitcoin}
          >
            {t("wordNumber")}
          </FieldDescription>
          {isSuccess ? (
            <S.LottieSuccess
              autoPlay
              loop={false}
              source={require("@assets/animations/small_success.json")}
            />
          ) : (
            <IndexContainer>
              <IndexText>{indexToCheck}</IndexText>
            </IndexContainer>
          )}
        </S.WordNumberContainer>
      </ComponentStack>
      <TextField
        ref={textInputRef}
        autoCapitalize="none"
        autoFocus
        suggestions={suggestionList}
        label={t("seedWord")}
        onChangeText={onChangeText}
        value={value}
        error={error}
      />
      <Dots step={indexStep} total={verifyIndexes.length} />
    </ComponentStack>
  );
};
