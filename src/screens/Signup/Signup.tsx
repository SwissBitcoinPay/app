import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  faArrowLeft,
  faAt,
  faCheckCircle,
  faDollar,
  faLock,
  faShop,
  faTimesCircle,
  faUserFriends
} from "@fortawesome/free-solid-svg-icons";
import { useTranslation } from "react-i18next";
import { AsyncStorage, Linking, bcrypt, isApiError } from "@utils";
import {
  SBPContext,
  apiRootUrl,
  bankCurrencyMap,
  currencies,
  fiatCurrencies,
  platform
} from "@config";
import LocaleCurrency from "locale-currency";
import {
  ComponentStack,
  FieldContainer,
  FieldDescription,
  Icon,
  PageContainer,
  PayoutConfig,
  SelectField,
  Text,
  TextField,
  Url
} from "@components";
import axios from "axios";
import { validate as isEmail } from "email-validator";
import { useSearchParams } from "../../components/Router";
import {
  Controller,
  ControllerProps,
  SubmitHandler,
  useForm
} from "react-hook-form";
import { keyStoreRefCode } from "@config/settingsKeys";
import { PayoutConfigForm } from "@components/PayoutConfig/PayoutConfig";
import { useToast } from "react-native-toast-notifications";
import { useTheme } from "styled-components";
import { AccountConfigType, UserType } from "@types";
import { useAccountConfig, useIsScreenSizeMin } from "@hooks";
import * as S from "./styled";

const { deviceLocale, isDesktop } = platform;

const accentedCharacters =
  "àèìòùÀÈÌÒÙáéíóúýÁÉÍÓÚÝâêîôûÂÊÎÔÛãñõÃÑÕäëïöüÿÄËÏÖÜŸçÇßØøÅåÆæœ";

const letterRegex = /[a-zA-Z]+/g;
const numberRegex = /\d+/g;

type SignupForm = {
  name?: string;
  email?: string;
  password?: string;
  currency?: AccountConfigType["currency"];
  referralCode?: string;
} & PayoutConfigForm;

export const Signup = () => {
  const { t: tRoot } = useTranslation();
  const { t, i18n } = useTranslation(undefined, {
    keyPrefix: "screens.signup"
  });
  const toast = useToast();
  const isLarge = useIsScreenSizeMin("large");
  const { onAuthLogin } = useAccountConfig({ refresh: false });
  const { setUserType } = useContext(SBPContext);
  const { colors } = useTheme();
  const [searchParams] = useSearchParams();

  const isAtm = useMemo(() => false, []);

  const [isSubmiting, setIsSubmiting] = useState(false);

  const {
    control,
    handleSubmit,
    formState,
    watch,
    setValue,
    setError,
    resetField,
    getFieldState,
    trigger
  } = useForm<SignupForm>({
    mode: "onTouched",
    defaultValues: {
      currency: LocaleCurrency.getCurrency(
        deviceLocale
      ) as AccountConfigType["currency"],
      btcPercent: 100,
      btcAddressTypes: {
        onchain: false,
        lightning: false,
        xpub: false
      }
    }
  });

  const [passwordCheck1, setPasswordCheck1] = useState(false);
  const [passwordCheck2, setPasswordCheck2] = useState(false);
  const [passwordCheck3, setPasswordCheck3] = useState(false);

  const [isRefCodePrefilled, setIsRefCodePrefilled] = useState(false);

  useEffect(() => {
    const fn = async () => {
      const refCode =
        (await AsyncStorage.getItem(keyStoreRefCode)) ||
        searchParams.get("refCode");

      if (refCode) {
        setValue("referralCode", refCode);
        setIsRefCodePrefilled(true);
      }
    };
    fn();
  }, []);

  const walletType = watch("walletType");

  const onSubmit = useCallback<SubmitHandler<SignupForm>>(
    async (values) => {
      const {
        name,
        email,
        password,
        currency,
        referralCode,
        btcPercent,
        depositAddress,
        messageToSign,
        signature,
        iban,
        reference,
        ownerName,
        ownerAddress,
        ownerComplement,
        ownerZip,
        ownerCity,
        ownerCountry
      } = values;

      if (!name || !email || !password || !currency || btcPercent === undefined)
        return;

      setIsSubmiting(true);

      const salt = await bcrypt.getSalt(16);
      const hashedPassword = await bcrypt.hash(salt, password);

      const isReceiveBitcoin = btcPercent >= 1;
      const isReceiveFiat = btcPercent <= 99;

      const bankCurrency: (typeof fiatCurrencies)[number] =
        bankCurrencyMap[currency];

      try {
        const signupData = {
          name,
          email,
          currency,
          salt,
          hashedPassword,
          isAtm,
          language: i18n.language,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          btcPercent,
          referredBy: referralCode?.toUpperCase(),
          ...(isReceiveBitcoin
            ? { address: depositAddress, message: messageToSign, signature }
            : {}),
          ...(isReceiveFiat
            ? {
                iban,
                reference,
                ownerName,
                ownerAddress,
                ownerComplement,
                ownerZip,
                ownerCity,
                ownerCountry
              }
            : {}),
          ...(isReceiveFiat && bankCurrency ? { bankCurrency } : {})
        };

        const signupResponse = await axios.post<{
          invoiceKey?: string;
          errorCode?: string;
        }>(`${apiRootUrl}/signup`, signupData);

        const invoiceKey = signupResponse.data.invoiceKey;

        await AsyncStorage.removeItem(keyStoreRefCode);

        const emailLoginData = {
          UserId: email,
          Password: password
        };

        const goToPos = !isAtm && !isDesktop;

        await onAuthLogin(emailLoginData, goToPos, goToPos);

        if (!goToPos) {
          await Linking.openURL("https://dashboard.swiss-bitcoin-pay.ch");
        } else if (invoiceKey) {
          setUserType(walletType ? UserType.Wallet : UserType.Admin);
        } else {
          toast.show(tRoot("common.errors.unknown"), {
            type: "error"
          });
        }
      } catch (e) {
        if (isApiError(e)) {
          const errorField = e.response.data.field as keyof SignupForm;
          const errorKey = e.response.data.detail;

          const errorMessage = t(`error.${errorField}.${errorKey}`);

          setError(errorField, { message: errorMessage });

          toast.show(errorMessage, {
            type: "error"
          });
        } else {
          toast.show("error.unknown", {
            type: "error"
          });
        }
      }
      setIsSubmiting(false);
    },
    [
      i18n.language,
      isAtm,
      walletType,
      onAuthLogin,
      setError,
      setUserType,
      t,
      tRoot,
      toast
    ]
  );

  const validateName = useCallback(
    (input = "") => {
      if (input?.match(`^[A-Za-z${accentedCharacters}0-9_ '-]{3,29}$`)) {
        return true;
      }
      return t("accountNameInvalid");
    },
    [t]
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

  const validatePassword = useCallback(
    (input = "") => {
      const passTest1 = !!input.match(letterRegex);
      const passTest2 = !!input.match(numberRegex);
      const passTest3 = input.length >= 8 && input.length <= 64;

      setPasswordCheck1(passTest1);
      setPasswordCheck2(passTest2);
      setPasswordCheck3(passTest3);

      if (passTest1 && passTest2 && passTest3) {
        return true;
      }
      return t("passwordInvalid");
    },
    [t]
  );

  const NameField = useCallback<ControllerProps<SignupForm, "name">["render"]>(
    ({ field: { onChange, onBlur, value }, fieldState: { error } }) => {
      return (
        <TextField
          label={t("accountName")}
          value={value}
          onChangeText={onChange}
          onBlur={onBlur}
          error={error?.message}
          pastable
        />
      );
    },
    [t]
  );

  const EmailField = useCallback<
    ControllerProps<SignupForm, "email">["render"]
  >(
    ({ field: { onChange, onBlur, value }, fieldState: { error } }) => {
      return (
        <TextField
          label={t("email")}
          autoCapitalize="none"
          inputMode="email"
          value={value}
          onChangeText={onChange}
          onBlur={onBlur}
          error={error?.message}
          pastable
        />
      );
    },
    [t]
  );

  const PasswordField = useCallback<
    ControllerProps<SignupForm, "password">["render"]
  >(
    ({ field: { onChange, onBlur, value }, fieldState: { error } }) => {
      return (
        <TextField
          label={t("password")}
          value={value}
          autoCapitalize="none"
          secureTextEntry
          onChangeText={(v) => {
            onChange(v);
            validatePassword(v);
          }}
          onBlur={onBlur}
          error={error?.message}
        />
      );
    },
    [t, validatePassword]
  );

  const CurrencyField = useCallback<
    ControllerProps<SignupForm, "currency">["render"]
  >(
    ({ field: { onChange, value }, fieldState: { error } }) => {
      return (
        <SelectField
          value={value}
          key={value} // key is important to avoid a re-render bug on Android : https://github.com/lawnstarter/react-native-picker-select/issues/112#issuecomment-640180303
          label={t("currency")}
          items={currencies.filter((c) => !["sat", "BTC"].includes(c.value))}
          onValueChange={onChange}
          error={error?.message}
          placeholder={{}}
        />
      );
    },
    [t]
  );

  const ReferralCodeField = useCallback<
    ControllerProps<SignupForm, "referralCode">["render"]
  >(
    ({ field: { onChange, onBlur, value }, fieldState: { error } }) => {
      return (
        <TextField
          label={tRoot("common.optional")}
          value={value}
          onChangeText={(v) => onChange(v.toUpperCase())}
          onBlur={onBlur}
          autoCapitalize="characters"
          error={error?.message}
          disabled={isRefCodePrefilled}
          pastable
          deletable={() => {
            setIsRefCodePrefilled(false);
            void AsyncStorage.removeItem(keyStoreRefCode);
          }}
        />
      );
    },
    [isRefCodePrefilled, tRoot]
  );

  const passwordChecksComponent = useMemo(
    () =>
      [
        {
          value: passwordCheck1,
          label: t("letter")
        },
        {
          value: passwordCheck2,
          label: t("number")
        },
        {
          value: passwordCheck3,
          label: t("size8to64")
        }
      ].map(({ value, label: passLabel }, passIndex) => {
        const color = value
          ? colors.success
          : formState.errors.password
            ? colors.error
            : colors.grey;

        return (
          <ComponentStack key={passIndex} direction="horizontal" gapSize={6}>
            <Icon
              icon={value ? faCheckCircle : faTimesCircle}
              size={18}
              color={color}
            />
            <Text h5 color={color} weight={600}>
              {passLabel}
            </Text>
          </ComponentStack>
        );
      }),
    [
      colors.error,
      colors.grey,
      colors.success,
      formState.errors.password,
      passwordCheck1,
      passwordCheck2,
      passwordCheck3,
      t
    ]
  );

  return (
    <PageContainer
      header={{
        left: { icon: faArrowLeft, onPress: -1 },
        title: t("title")
      }}
      footerButton={{
        disabled: !formState.isValid,
        isLoading: isSubmiting,
        title: tRoot("common.submit"),
        onPress: handleSubmit(onSubmit)
      }}
    >
      <ComponentStack gapSize={32}>
        <FieldContainer icon={faShop} title={t("yourAccountName")}>
          <Controller
            name="name"
            control={control}
            rules={{
              required: true,
              validate: validateName
            }}
            render={NameField}
          />
        </FieldContainer>
        <>
          <FieldContainer icon={faAt} title={t("yourEmail")}>
            <Controller
              name="email"
              control={control}
              rules={{
                required: true,
                validate: validateEmail
              }}
              render={EmailField}
            />
          </FieldContainer>
          <FieldDescription style={{ marginTop: 8 }}>
            🔒 {t("emailDescription")}
          </FieldDescription>
        </>
        <>
          <FieldContainer icon={faLock} title={t("yourPassword")}>
            <Controller
              name="password"
              control={control}
              rules={{
                required: true,
                validate: validatePassword
              }}
              render={PasswordField}
            />
          </FieldContainer>
          <ComponentStack
            direction="horizontal"
            gapSize={12}
            style={{
              marginTop: 8,
              marginRight: 6,
              alignSelf: isLarge ? "flex-end" : "flex-start"
            }}
          >
            {passwordChecksComponent}
          </ComponentStack>
        </>
        <FieldContainer icon={faDollar} title={t("yourCurrency")}>
          <Controller
            name="currency"
            control={control}
            rules={{
              required: true
            }}
            render={CurrencyField}
          />
        </FieldContainer>
        {!isAtm && (
          <PayoutConfig
            control={control}
            watch={watch}
            setValue={setValue}
            setError={setError}
            resetField={resetField}
            trigger={trigger}
            getFieldState={getFieldState}
            currency={watch("currency") as AccountConfigType["currency"]}
          />
        )}
        {!isAtm && (
          <FieldContainer
            icon={faUserFriends}
            title={t("referralCode")}
            isOptionnal
            isDefaultOpen={isRefCodePrefilled}
          >
            <Controller
              name="referralCode"
              control={control}
              render={ReferralCodeField}
            />
          </FieldContainer>
        )}
        <S.TermsText>
          {t("submitDescription1")}{" "}
          <Url
            as={S.TermsText}
            title={t("termsAndConditions")}
            href="https://swiss-bitcoin-pay.ch/terms"
          />{" "}
          {t("submitDescription2")}{" "}
          <Url
            as={S.TermsText}
            title={t("privacyPolicy")}
            href="https://swiss-bitcoin-pay.ch/privacy"
          />
        </S.TermsText>
      </ComponentStack>
    </PageContainer>
  );
};
