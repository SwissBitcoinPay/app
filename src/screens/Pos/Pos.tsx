import axios from "axios";
import {
  KeyboardEvent,
  MutableRefObject,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { getFormattedUnit, AsyncStorage } from "@utils";
import { Keyboard, Text, Loader, TextField, PageContainer } from "@components";
import { NumberInput } from "./components";
import { useTranslation } from "react-i18next";
import {
  faAngleDown,
  faCog,
  faListCheck,
  faPen,
  faShop,
  faUser
} from "@fortawesome/free-solid-svg-icons";
import {
  useSafeAreaInsets,
  useAccountConfig,
  usePostInvoice,
  useModalInput
} from "@hooks";
import { SBPContext, apiRootUrl, currencies, platform } from "@config";
import { keyStoreDeviceName, keyStoreIsGuest } from "@config/settingsKeys";
import { useToast } from "react-native-toast-notifications";
import { useTheme } from "styled-components";
import { TextInput, TouchableOpacity } from "react-native";
import * as S from "./styled";

const DEL_REF_INDEX = 10;
const OK_REF_INDEX = 11;

const {
  isWeb,
  deviceName: platformDeviceName,
  deviceIcon,
  deviceType
} = platform;

export const Pos = () => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { t } = useTranslation(undefined, { keyPrefix: "screens.pos" });

  const postInvoice = usePostInvoice();

  const { preferredCurrency, setPreferredCurrency } = useContext(SBPContext);

  const { accountConfig, isLoading } = useAccountConfig();
  const {
    isAtm,
    currency: accountCurrency,
    name,
    hasKyc
  } = accountConfig || {};

  const unit = useMemo(
    () => preferredCurrency || accountCurrency,
    [accountCurrency, preferredCurrency]
  );

  const isBackgroundLoading = useMemo(
    () => !!accountConfig && isLoading,
    [accountConfig, isLoading]
  );

  const [isGuestMode, setIsGuestMode] = useState(false);

  const [fiatAmount, setFiatAmount] = useState(0);
  const [maxFiatAmount, setMaxFiatAmount] = useState<number>();
  const [deviceName, setDeviceName] = useState<string>();
  const [description, setDescription] = useState<string>();

  const decimalFiat = useMemo(() => fiatAmount / 100, [fiatAmount]);
  const isActionButtonsDisabled = useMemo(() => fiatAmount === 0, [fiatAmount]);
  const haveDecimals = useMemo(
    () => !!currencies.find((c) => c.value === unit && !c.noDecimals),
    [unit]
  );

  const fiatUnitPickerItems = useMemo(
    () => [{ label: "sats", value: "sat" }, ...currencies],
    []
  );

  useEffect(() => {
    (async () => {
      setIsGuestMode((await AsyncStorage.getItem(keyStoreIsGuest)) === "true");
    })();
  }, []);

  const requestInvoice = useCallback(async () => {
    await postInvoice({
      amount: decimalFiat,
      unit,
      description,
      deviceName,
      deviceType
    });
  }, [postInvoice, decimalFiat, unit, description, deviceName]);

  const clearAmount = useCallback(() => {
    setFiatAmount(0);
  }, []);

  const delAmount = useCallback(() => {
    setFiatAmount((v) => {
      if (v <= 9) {
        return 0;
      }
      return parseInt(v.toString().slice(0, -1));
    });
  }, []);

  const saveMaxFiatAmount = useCallback(async () => {
    if (unit && !hasKyc) {
      const { data: getTransactionLimitData } = await axios.get<number>(
        `${apiRootUrl}/transaction-limit/${unit}`
      );

      setMaxFiatAmount(getTransactionLimitData);
    }
  }, [unit, hasKyc]);

  useEffect(() => {
    saveMaxFiatAmount();
  }, [saveMaxFiatAmount]);

  const configureDeviceName = useCallback(async (newDeviceName: string) => {
    setDeviceName(newDeviceName);
    await AsyncStorage.setItem(keyStoreDeviceName, newDeviceName);
    return true;
  }, []);

  useEffect(() => {
    (async () => {
      const deviceNameSettings = await AsyncStorage.getItem(keyStoreDeviceName);
      if (deviceNameSettings) {
        setDeviceName(deviceNameSettings);
      } else {
        configureDeviceName(platformDeviceName);
      }
    })();
  }, []);

  const { modal: deviceNameModal, onPressElement: onPressDeviceName } =
    useModalInput({
      element: <TextField autoFocus right={{ icon: deviceIcon }} />,
      label: t("deviceName"),
      defaultValue: deviceName,
      description: t("deviceNameDescription"),
      onChange: configureDeviceName,
      validate: (v) => v.length < 30
    });

  const descriptionInputRef = useRef<TextInput>(null);

  const onPressNumber = useCallback(
    (newNumber: number) => {
      const newFiatAmount =
        fiatAmount * 10 + newNumber * (haveDecimals ? 1 : 100);

      if (!maxFiatAmount || newFiatAmount / 100 <= maxFiatAmount) {
        setFiatAmount(newFiatAmount);
      } else {
        toast.show(
          t("cannotGoHigher", {
            maxAmount: getFormattedUnit(maxFiatAmount, unit || "")
          }),
          {
            type: "error"
          }
        );
      }
    },
    [unit, fiatAmount, haveDecimals, maxFiatAmount, t, toast]
  );

  useEffect(() => {
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
      descriptionInputRef.current?.blur?.();
    });

    return () => hideSubscription.remove();
  }, []);

  const inputRef = useRef<TouchableOpacity[]>([]);

  const handleKeyPress = useCallback<EventListener>(
    // @ts-ignore
    (e: KeyboardEvent) => {
      const pressedKey = parseInt(e?.nativeEvent?.key);
      const refs = inputRef as unknown as MutableRefObject<HTMLButtonElement[]>;
      if (Number.isInteger(pressedKey)) {
        refs.current[pressedKey]?.click?.();
      } else if (e?.nativeEvent?.code === "Backspace") {
        refs.current[DEL_REF_INDEX]?.click?.();
      } else if (e?.nativeEvent?.code === "Enter") {
        refs.current[OK_REF_INDEX]?.click?.();
      }
    },
    []
  );

  useEffect(() => {
    if (isWeb) {
      document.addEventListener("keydown", handleKeyPress, false);
      return () => {
        document.removeEventListener("keydown", handleKeyPress, false);
      };
    }
  }, [handleKeyPress]);

  const registerRef = useCallback(
    (index: number) => (ref: TouchableOpacity) =>
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      (inputRef.current[index] = ref),
    []
  );

  return accountConfig ? (
    <PageContainer
      header={{
        title: name || "",
        subTitle: {
          icon: deviceName ? deviceIcon : faPen,
          text: deviceName || t("enterDeviceName"),
          isSecondary: true,
          onPress: onPressDeviceName
        },
        left: {
          icon: faListCheck,
          onPress: "/history"
        },
        right: {
          icon: faCog,
          onPress: "/settings"
        }
      }}
      noPadding
      noBottomMargin
    >
      {deviceNameModal}
      <S.InfosContainer>
        {isAtm && (
          <S.ATMButton
            secondaryColor={colors.primary}
            disabled
            size="small"
            title={t("atmAccount")}
            icon={faShop}
          />
        )}
        {isGuestMode && (
          <S.ATMButton
            secondaryColor={colors.primary}
            disabled
            size="small"
            title={t("guestMode")}
            icon={faUser}
          />
        )}
        {isBackgroundLoading && <S.BackgroundLoader size={20} />}
        <S.FiatAmountComponentStack direction="horizontal" gapSize={10}>
          <Text color={colors.white} h2 weight={700}>
            {getFormattedUnit(
              decimalFiat,
              unit || "",
              decimalFiat === 0 || !haveDecimals ? 0 : 2
            )}
          </Text>
          <S.FiatAmountDropdownIcon icon={faAngleDown} color={colors.grey} />
          <S.FiatUnitPicker
            value={unit}
            items={fiatUnitPickerItems}
            placeholder={{}}
            onValueChange={(value: string | null) => {
              if (value) {
                clearAmount();
                setPreferredCurrency(value);
              }
            }}
          />
        </S.FiatAmountComponentStack>
        <S.DescriptionContainer>
          <S.DescriptionInput
            blurOnSubmit
            textAlign="center"
            inputMode="text"
            returnKeyType="done"
            value={description}
            ref={descriptionInputRef}
            placeholder={t("note")}
            placeholderTextColor={colors.primaryLight}
            onChangeText={setDescription}
            onSubmitEditing={() => {
              if (!isActionButtonsDisabled) {
                requestInvoice();
              }
            }}
          />
          <S.DescriptionIcon icon={faPen} size={20} />
        </S.DescriptionContainer>
      </S.InfosContainer>
      <S.PadContainer>
        {[[1, 2, 3], [4, 5, 6], [7, 8, 9], [0]].map((rowValue, rowIndex) => (
          <S.PadLine key={rowIndex}>
            {rowValue.map((columnValue, columnIndex) => (
              <NumberInput
                key={columnIndex}
                ref={registerRef(columnValue)}
                value={columnValue.toString()}
                onPress={() => onPressNumber(columnValue)}
              />
            ))}
          </S.PadLine>
        ))}
        <S.PadLine style={{ position: "relative", top: 0 }}>
          <NumberInput
            value="C"
            customColor={colors.error}
            disabled={isActionButtonsDisabled}
            onPress={clearAmount}
            noBorderRadius
            rounded="left"
            paddingBottom={insets.bottom}
          />
          <NumberInput
            value="DEL"
            ref={registerRef(DEL_REF_INDEX)}
            customColor={colors.bitcoin}
            disabled={isActionButtonsDisabled}
            onPress={delAmount}
            noBorderRadius
            paddingBottom={insets.bottom}
          />
          <NumberInput
            value="OK"
            ref={registerRef(OK_REF_INDEX)}
            customColor={colors.success}
            disabled={isActionButtonsDisabled}
            onPress={requestInvoice}
            noBorderRadius
            rounded="right"
            paddingBottom={insets.bottom}
          />
        </S.PadLine>
      </S.PadContainer>
    </PageContainer>
  ) : (
    <Loader />
  );
};
