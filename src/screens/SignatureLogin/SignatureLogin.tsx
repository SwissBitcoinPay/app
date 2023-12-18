import { useCallback, useContext, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { SBPContext, apiRootUrl } from "@config";
import { Controller, SubmitHandler, useForm } from "react-hook-form";
import { ComponentStack, FieldDescription, LoginView } from "@components";
import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";
import { Signer } from "bip322-js";
import { AsyncStorage, generateBtcAddress, isApiError } from "@utils";
import axios from "axios";
import { useToast } from "react-native-toast-notifications";
import { UserType } from "@types";
import { TextInput } from "react-native";
import { useTheme } from "styled-components";
import { useAccountConfig } from "@hooks";
import { keyStoreMnemonicWords, keyStoreZpub } from "@config/settingsKeys";
import { ACCESS_CONTROL } from "react-native-keychain";
import * as BIP39 from "bip39";
import * as S from "./styled";

const wordsList = BIP39.wordlists.english;

type SignatureLoginForm = {
  word1: string;
  word2: string;
  word3: string;
  word4: string;
  word5: string;
  word6: string;
  word7: string;
  word8: string;
  word9: string;
  word10: string;
  word11: string;
  word12: string;
};

const WORDS_LIST_SIZE = 12;

export const SignatureLogin = () => {
  const { t: tRoot } = useTranslation();
  const { t } = useTranslation(undefined, {
    keyPrefix: "screens.signatureLogin"
  });
  const toast = useToast();
  const { colors } = useTheme();
  const { setUserType } = useContext(SBPContext);
  const { onAuthLogin } = useAccountConfig({ refresh: false });
  const { control, handleSubmit, formState, setError, trigger } =
    useForm<SignatureLoginForm>({
      mode: "onTouched",
      reValidateMode: "onChange"
    });

  const [isSubmitting, setIsSubmiting] = useState(false);

  const onSubmit = useCallback<SubmitHandler<SignatureLoginForm>>(
    async (values) => {
      const {
        word1,
        word2,
        word3,
        word4,
        word5,
        word6,
        word7,
        word8,
        word9,
        word10,
        word11,
        word12
      } = values;

      if (
        !word1 ||
        !word2 ||
        !word3 ||
        !word4 ||
        !word5 ||
        !word6 ||
        !word7 ||
        !word8 ||
        !word9 ||
        !word10 ||
        !word11 ||
        !word12
      ) {
        await trigger();
        return;
      }

      setIsSubmiting(true);

      try {
        const { firstAddress, firstAddressPrivateKey, zPub, words } =
          await generateBtcAddress(Object.values(values).join(" "));

        const signatureAuthData = {
          signAddress: firstAddress
        };

        const signatureAuthResponse = await axios.get<{
          messageToSign: string;
        }>(`${apiRootUrl}/signature-auth`, { params: signatureAuthData });

        const messageToSign = signatureAuthResponse.data.messageToSign;

        const signature = Signer.sign(
          firstAddressPrivateKey,
          firstAddress,
          messageToSign
        ) as string;

        const signatureLoginData = {
          messageToSign,
          signature
        };

        await AsyncStorage.setItem(
          keyStoreZpub,
          zPub,
          ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE
        );
        await AsyncStorage.setItem(
          keyStoreMnemonicWords,
          words.join(" "),
          ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE
        );

        await onAuthLogin(signatureLoginData);

        setUserType(UserType.Wallet);
      } catch (e) {
        if (isApiError(e)) {
          let errorMessage;
          if (e.response.status === 401) {
            errorMessage = t("error.invalidSignature");
          } else {
            const errorField = e.response.data
              .field as keyof SignatureLoginForm;
            const errorKey = e.response.data.detail;

            errorMessage = t(`error.${errorField}.${errorKey}`);
            setError(errorField, { message: errorMessage });
          }

          toast.show(errorMessage, {
            type: "error"
          });
        } else {
          toast.show(tRoot("common.errors.unknown"), {
            type: "error"
          });
        }
      }
      setIsSubmiting(false);
    },
    [onAuthLogin, setError, setUserType, t, tRoot, toast, trigger]
  );

  const validateWord = useCallback(
    (word: string) => wordsList.includes(word) || t("error.invalidWord"),
    [t]
  );

  const getSuggestionList = useCallback((value = "") => {
    if (value.length > 0) {
      const ret = wordsList.filter((word) => word.startsWith(value));

      if (ret.length <= 5) {
        return ret;
      }
    }
    return [];
  }, []);

  const refs = useRef<TextInput[]>([]);

  const getInputProps = useCallback(
    (index: number) => ({
      blurOnSubmit: false,
      ref: (r: TextInput) => (refs.current[index] = r),
      onSubmitEditing: () => {
        refs?.current?.[index + 1]?.focus();
      }
    }),
    [refs]
  );

  return (
    <S.StyledPageContainer
      header={{
        left: { onPress: -1, icon: faArrowLeft },
        title: tRoot("common.login")
      }}
    >
      <LoginView
        title={t("title")}
        button={{
          type: "bitcoin",
          title: tRoot("common.submit"),
          disabled: !formState.isValid,
          onPress: handleSubmit(onSubmit),
          isLoading: isSubmitting,
          isWhiteBackground: true
        }}
      >
        <ComponentStack gapSize={12}>
          <FieldDescription color={colors.bitcoin}>
            🔑 {t("enter12wordsDescription1")}
          </FieldDescription>
          <FieldDescription color={colors.bitcoin}>
            ⚠️ {t("enter12wordsDescription2")}
          </FieldDescription>
          <FieldDescription color={colors.error}>
            🚨 {t("enter12wordsDescription3")}
          </FieldDescription>
          <></>
          {new Array(WORDS_LIST_SIZE).fill(0).map((_, index) => (
            <Controller
              key={index}
              name={`word${
                (index + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12
              }`}
              control={control}
              rules={{
                required: true,
                validate: validateWord
              }}
              render={({
                field: { onChange, onBlur, value },
                fieldState: { error }
              }) => {
                const isLast = index === WORDS_LIST_SIZE - 1;

                return (
                  <ComponentStack
                    key={index}
                    direction="horizontal"
                    gapSize={8}
                    style={{ zIndex: WORDS_LIST_SIZE - index }}
                  >
                    <S.IndexContainer enabled={validateWord(value) === true}>
                      <S.IndexText>{index + 1}</S.IndexText>
                    </S.IndexContainer>
                    <S.WordTextField
                      key={index}
                      autoCapitalize="none"
                      selectTextOnFocus
                      label={t("word", { number: index + 1 })}
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      error={error?.message}
                      suggestions={getSuggestionList(value)}
                      returnKeyType={!isLast ? "next" : "done"}
                      {...getInputProps(index)}
                      {...(isLast
                        ? { onSubmitEditing: handleSubmit(onSubmit) }
                        : {})}
                    />
                  </ComponentStack>
                );
              }}
            />
          ))}
        </ComponentStack>
      </LoginView>
    </S.StyledPageContainer>
  );
};
