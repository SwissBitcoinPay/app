import axios from "axios";
import {
  KeyboardEvent,
  RefObject,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  getFormattedUnit,
  AsyncStorage,
  decimalSeparator,
  decimalSeparatorNameMapping,
  getUnitDecimalPower
} from "@utils";
import { Keyboard, Loader, TextField, PageContainer } from "@components";
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
import {
  DEFAULT_DECIMALS,
  SBPContext,
  apiRootUrl,
  currencies,
  platform
} from "@config";
import { keyStoreDeviceName, keyStoreIsGuest } from "@config/settingsKeys";
import { useToast } from "react-native-toast-notifications";
import { useTheme } from "styled-components";
import { v4 as uuidv4 } from "uuid";
import { TextInput, Touchable, useWindowDimensions } from "react-native";
import * as S from "./styled";

const DECIMAL_REF_INDEX = 10;
const PLUS_REF_INDEX = 11;
const C_REF_INDEX = 12;
const DEL_REF_INDEX = 13;
const OK_REF_INDEX = 14;

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
  const { height: windowHeight } = useWindowDimensions();
  const isSmallHeight = useMemo(() => windowHeight <= 660, [windowHeight]);
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

  const initialValue = useMemo(
    () => (unit ? [{ id: uuidv4(), text: getFormattedUnit(0, unit, 0) }] : []),
    [unit]
  );

  const [plusFiatAmount, setPlusFiatAmount] = useState<number>(0);

  const [maxFiatAmount, setMaxFiatAmount] = useState<number>();
  const [deviceName, setDeviceName] = useState<string>();
  const [description, setDescription] = useState<string>();

  const totalFiatAmount = useMemo(
    () => fiatAmount + plusFiatAmount,
    [fiatAmount, plusFiatAmount]
  );

  const { unitDecimals, unitDecimalPower } = useMemo(() => {
    const _unitDecimals =
      currencies.find((c) => c.value === unit)?.decimals ?? DEFAULT_DECIMALS;
    const _unitDecimalPower = getUnitDecimalPower(unit);
    return { unitDecimals: _unitDecimals, unitDecimalPower: _unitDecimalPower };
  }, [unit]);

  const decimalFiat = useMemo(
    () => totalFiatAmount / unitDecimalPower,
    [totalFiatAmount, unitDecimalPower]
  );

  const isActionButtonsDisabled = useMemo(
    () => totalFiatAmount === 0,
    [totalFiatAmount]
  );

  const haveDecimals = useMemo(() => unitDecimals !== 0, [unitDecimals]);

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

  const [decimalCount, setDecimalCount] = useState(0);

  const isBelowMaxFiatAmount = useCallback(
    (newFiatAmount: number) => {
      if (maxFiatAmount && newFiatAmount / unitDecimalPower > maxFiatAmount) {
        toast.show(
          t("cannotGoHigher", {
            maxAmount: getFormattedUnit(maxFiatAmount, unit || "")
          }),
          {
            type: "error"
          }
        );
        return false;
      }
      return true;
    },
    [maxFiatAmount, unitDecimalPower, toast, t, unit]
  );

  const updateAmount = useCallback(async (newFiatAmount: number) => {
    setFiatAmount(newFiatAmount);
  }, []);

  const updatePlusAmount = useCallback(async (newPlusFiatAmount: number) => {
    setPlusFiatAmount(newPlusFiatAmount);
  }, []);

  const onPressNumber = useCallback(
    (newNumber: number) => {
      let newFiatAmount: number;
      if (decimalCount === 0) {
        newFiatAmount = fiatAmount * 10 + newNumber;
      } else {
        newFiatAmount =
          fiatAmount + newNumber * parseInt(`1${"0".repeat(decimalCount - 1)}`);
        setDecimalCount(decimalCount - 1);
      }

      if (isBelowMaxFiatAmount(newFiatAmount + plusFiatAmount)) {
        void updateAmount(newFiatAmount);
      }
    },
    [
      decimalCount,
      isBelowMaxFiatAmount,
      plusFiatAmount,
      fiatAmount,
      updateAmount
    ]
  );

  const clearAmount = useCallback(() => {
    setDecimalCount(0);
    void updateAmount(0);

    if (plusFiatAmount > 0) {
      void updatePlusAmount(0);
    }
  }, [updateAmount, updatePlusAmount, plusFiatAmount]);

  const delAmount = useCallback(() => {
    if (decimalCount > 0) {
      setDecimalCount(0);
    }
    if (fiatAmount <= 9) {
      void updateAmount(0);
      setDecimalCount(0);
    } else {
      const newAmount = parseInt(fiatAmount.toString().slice(0, -1));
      void updateAmount(newAmount);
    }
  }, [fiatAmount, updateAmount, decimalCount]);

  useEffect(() => {
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
      descriptionInputRef.current?.blur?.();
    });

    return () => hideSubscription.remove();
  }, []);

  const inputRef = useRef<Touchable[]>([]);

  const onDecimalSeparator = useCallback(async () => {
    if (
      fiatAmount.toString().length > 0 &&
      !isBelowMaxFiatAmount(plusFiatAmount + fiatAmount * unitDecimalPower)
    ) {
      return;
    }
    void updateAmount(fiatAmount * unitDecimalPower);
    setDecimalCount(unitDecimals);
  }, [
    fiatAmount,
    isBelowMaxFiatAmount,
    plusFiatAmount,
    unitDecimalPower,
    updateAmount,
    unitDecimals
  ]);

  const onPlus = useCallback(async () => {
    void updateAmount(0);
    setDecimalCount(0);

    const newPlusFiatAmount = plusFiatAmount + fiatAmount;
    setPlusFiatAmount(newPlusFiatAmount);

    if (plusFiatAmount !== 0) {
      void updatePlusAmount(newPlusFiatAmount);
    }
  }, [
    plusFiatAmount,
    updateAmount,
    fiatAmount,
    colors.white,
    colors.greyLight,
    updatePlusAmount
  ]);

  const handleKeyPress = useCallback<EventListener>(
    // @ts-ignore
    (e: KeyboardEvent) => {
      const pressedKey = parseInt(e?.nativeEvent?.key);
      const refs = inputRef as unknown as RefObject<HTMLButtonElement[]>;
      const pressCode = e?.nativeEvent?.code;
      if (Number.isInteger(pressedKey)) {
        refs.current[pressedKey]?.click?.();
      } else if (Object.keys(decimalSeparatorNameMapping).includes(pressCode)) {
        refs.current[DECIMAL_REF_INDEX]?.click?.();
      } else if (pressCode === "Plus") {
        refs.current[PLUS_REF_INDEX]?.click?.();
      } else if (pressCode === "Delete") {
        refs.current[C_REF_INDEX]?.click?.();
      } else if (pressCode === "Backspace") {
        refs.current[DEL_REF_INDEX]?.click?.();
      } else if (pressCode === "Enter") {
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

  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    clearAmount();
  }, [initialValue]);

  const formatToUnit = useCallback(
    (amount: number) =>
      getFormattedUnit(
        amount / unitDecimalPower,
        unit,
        amount !== 0 ? unitDecimals : undefined
      ),
    [unitDecimalPower, unit, unitDecimals]
  );

  return accountConfig ? (
    <PageContainer
      bounces={false}
      header={{
        title: name || "",
        subTitle: {
          icon: deviceName ? deviceIcon : faPen,
          text: deviceName || t("enterDeviceName"),
          isSecondary: true,
          onPress: onPressDeviceName
        },
        left: { icon: faListCheck, onPress: "/history" },
        right: { icon: faCog, onPress: "/settings" }
      }}
      noPadding
      noBottomMargin
    >
      {deviceNameModal}
      <S.InfosContainer isSmallHeight={isSmallHeight}>
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
        <S.FiatAmountComponentStack
          direction="horizontal"
          gapSize={10}
          style={{ overflow: "visible" }}
        >
          <S.AmountsContainer>
            <S.FiatAmountText>{formatToUnit(fiatAmount)}</S.FiatAmountText>
            {plusFiatAmount ? (
              <S.PlusTextsContainer isTop>
                <S.PlusText>{formatToUnit(plusFiatAmount)}</S.PlusText>
              </S.PlusTextsContainer>
            ) : null}
            {plusFiatAmount ? <S.SymbolText>+</S.SymbolText> : null}
            {plusFiatAmount ? <S.SymbolText isBottom>=</S.SymbolText> : null}
            {plusFiatAmount ? (
              <S.PlusTextsContainer isBottom>
                <S.PlusText style={{ color: colors.bitcoin }}>
                  {formatToUnit(totalFiatAmount)}
                </S.PlusText>
              </S.PlusTextsContainer>
            ) : null}
          </S.AmountsContainer>
          <S.FiatAmountDropdownIcon icon={faAngleDown} color={colors.grey} />
          <S.FiatUnitPicker
            value={unit}
            items={currencies}
            placeholder={{}}
            onValueChange={(value: string | null) => {
              if (value) {
                setPreferredCurrency(value);
              }
            }}
          />
        </S.FiatAmountComponentStack>
        <S.DescriptionContainer isSmallHeight={isSmallHeight}>
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
        {[
          [1, 2, 3],
          [4, 5, 6],
          [7, 8, 9],
          [haveDecimals ? decimalSeparator : undefined, 0, "+"]
        ].map((rowValue, rowIndex) => (
          <S.PadLine key={rowIndex}>
            {rowValue.map((columnValue, columnIndex) => (
              <NumberInput
                key={columnIndex}
                value={columnValue?.toString()}
                {...(typeof columnValue === "number"
                  ? {
                      ref: registerRef(columnValue),
                      onPress: () => onPressNumber(columnValue)
                    }
                  : columnValue === decimalSeparator
                    ? {
                        ref: registerRef(DECIMAL_REF_INDEX),
                        onPress: onDecimalSeparator,
                        disabled: decimalCount !== 0
                      }
                    : columnValue === "+"
                      ? {
                          ref: registerRef(PLUS_REF_INDEX),
                          onPress: onPlus,
                          disabled: fiatAmount === 0
                        }
                      : { disabled: true })}
              />
            ))}
          </S.PadLine>
        ))}
        <S.PadLine style={{ position: "relative", top: 0 }}>
          <NumberInput
            value="C"
            ref={registerRef(C_REF_INDEX)}
            customColor={colors.error}
            disabled={
              isActionButtonsDisabled &&
              decimalCount === 0 &&
              plusFiatAmount === 0
            }
            onPress={clearAmount}
            noBorderRadius
            rounded="left"
            paddingBottom={insets.bottom}
          />
          <NumberInput
            value="DEL"
            ref={registerRef(DEL_REF_INDEX)}
            customColor={colors.bitcoin}
            disabled={
              (isActionButtonsDisabled && decimalCount === 0) ||
              fiatAmount === 0
            }
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
