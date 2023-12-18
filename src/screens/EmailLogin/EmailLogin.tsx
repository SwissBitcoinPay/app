import { useCallback, useContext, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { SBPContext } from "@config";
import { Controller, SubmitHandler, useForm } from "react-hook-form";
import { TextField, Url, LoginView } from "@components";
import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";
import { validate as isEmail } from "email-validator";
import { isApiError } from "@utils";
import { useToast } from "react-native-toast-notifications";
import { UserType } from "@types";
import { TextInput } from "react-native";
import { useAccountConfig } from "@hooks";
import * as S from "./styled";

type EmailLoginForm = {
  email: string;
  password: string;
};

export const EmailLogin = () => {
  const { t: tRoot } = useTranslation();
  const { t } = useTranslation(undefined, { keyPrefix: "screens.emailLogin" });
  const toast = useToast();
  const { setUserType } = useContext(SBPContext);
  const { onAuthLogin } = useAccountConfig({ refresh: false });
  const { control, handleSubmit, formState, setError } =
    useForm<EmailLoginForm>({
      mode: "onTouched"
    });

  const [isSubmitting, setIsSubmiting] = useState(false);

  const onSubmit = useCallback<SubmitHandler<EmailLoginForm>>(
    async (values) => {
      const { email, password } = values;

      if (!email || !password) return;

      setIsSubmiting(true);

      try {
        const emailLoginData = {
          UserId: email,
          Password: password
        };

        await onAuthLogin(emailLoginData);

        setUserType(UserType.Admin);
      } catch (e) {
        if (isApiError(e)) {
          let errorMessage;
          if (e.response.status === 401) {
            errorMessage = t("error.invalidCredentials");
          } else {
            const errorField = e.response.data.field as keyof EmailLoginForm;
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
    [onAuthLogin, setError, setUserType, t, tRoot, toast]
  );

  const validateEmail = useCallback(
    (input = "") => {
      if (isEmail(input)) {
        return true;
      }
      return t("emailInvalid");
    },
    [t]
  );

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
        <Controller
          name="email"
          control={control}
          rules={{
            required: true,
            validate: validateEmail
          }}
          render={({
            field: { onChange, onBlur, value },
            fieldState: { error }
          }) => {
            return (
              <TextField
                label={t("email")}
                value={value}
                autoFocus
                autoCapitalize="none"
                importantForAutofill="yesExcludeDescendants"
                keyboardType="email-address"
                onChangeText={onChange}
                returnKeyType="next"
                onBlur={onBlur}
                error={error?.message}
                {...getInputProps(0)}
              />
            );
          }}
        />
        <Controller
          name="password"
          control={control}
          rules={{
            required: true
          }}
          render={({
            field: { onChange, onBlur, value },
            fieldState: { error }
          }) => {
            return (
              <TextField
                label={t("password")}
                value={value}
                importantForAutofill="yesExcludeDescendants"
                secureTextEntry
                onChangeText={onChange}
                onBlur={onBlur}
                autoCapitalize="none"
                returnKeyType="done"
                error={error?.message}
                {...getInputProps(1)}
                onSubmitEditing={handleSubmit(onSubmit)}
              />
            );
          }}
        />
        <Url
          as={S.ForgotPasswordText}
          href="https://dashboard.swiss-bitcoin-pay.ch/reset-password"
          title={t("forgotPassword")}
        />
      </LoginView>
    </S.StyledPageContainer>
  );
};
