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
import {
  getFormattedUnit,
  AsyncStorage,
  decimalSeparator,
  decimalSeparatorNameMapping,
  formattedUnitChanges,
  countConsecutiveStringParts,
  measureText,
  sleep,
  getUnitDecimalPower
} from "@utils";
import {
  Keyboard,
  Text,
  Loader,
  TextField,
  PageContainer,
  View
} from "@components";
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
  useModalInput,
  useAnimateAmount,
  useSymbolApi
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
import {
  TextInput,
  Touchable,
  TouchableOpacity,
  Text as RNText,
  ColorValue,
  useAnimatedValue,
  Animated,
  useWindowDimensions
} from "react-native";
import * as S from "./styled";
import { animated, easings, useSpring, useSprings } from "@react-spring/native";
import { diffStrings } from "@utils/diffStrings";
import { StringPart, AddActions, AnimationMode } from "@hooks/useAnimateAmount";

const { springAnimationDelay } = platform;

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

const PLUS_ANIMATION_CONFIG = {
  duration: 350,
  easing: easings.easeInOutQuad
};

const PLUS_ANIMATION_OPACITY_DURATION = PLUS_ANIMATION_CONFIG.duration / 6;
const PLUS_ANIMATION_DELAY = PLUS_ANIMATION_OPACITY_DURATION * 5;

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

  const [movingPlusAmount, setMovingPlusAmount] = useState<string>();
  const [plusFiatAmount, setPlusFiatAmount] = useState<number>(0);

  const [maxFiatAmount, setMaxFiatAmount] = useState<number>();
  const [deviceName, setDeviceName] = useState<string>();
  const [description, setDescription] = useState<string>();

  const totalAmount = useMemo(
    () => fiatAmount + plusFiatAmount,
    [fiatAmount, plusFiatAmount]
  );

  const { unitDecimals, unitDecimalPower } = useMemo(() => {
    const unitDecimals =
      currencies.find((c) => c.value === unit)?.decimals ?? DEFAULT_DECIMALS;
    const unitDecimalPower = getUnitDecimalPower(unit);
    return { unitDecimals, unitDecimalPower };
  }, [unit]);

  const decimalFiat = useMemo(
    () => totalAmount / unitDecimalPower,
    [totalAmount, unitDecimalPower]
  );

  const isActionButtonsDisabled = useMemo(
    () => totalAmount === 0,
    [totalAmount]
  );

  const haveDecimals = useMemo(() => unitDecimals !== 0, [unit]);

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

  const [parts, springs, animateAmount] = useAnimateAmount({
    unit,
    initialParts: initialValue,
    decimalCount
  });

  const [plusParts, plusSprings, animatePlusAmount, setPlusParts] =
    useAnimateAmount({
      unit,
      mode: AnimationMode.Plus,
      animationDelay: PLUS_ANIMATION_DELAY
    });

  const [totalParts, totalSprings, animateTotalAmount] = useAnimateAmount({
    unit,
    mode: AnimationMode.Plus
  });

  const numberRef = useRef<View[]>([]);

  const registerNumberRef = useCallback(
    (index: string) => (ref: View) =>
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      (numberRef.current[index] = ref),
    []
  );

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
    [toast, maxFiatAmount, unit, unitDecimalPower]
  );

  const updateTotalAmount = useCallback(
    async (newTotalFiatAmount: number) => {
      await animateTotalAmount(newTotalFiatAmount);
    },
    [animateTotalAmount]
  );

  const updateAmount = useCallback(
    async (newFiatAmount: number, add: AddActions) => {
      await animateAmount(newFiatAmount, add);
      setFiatAmount(newFiatAmount);
    },
    [animateAmount, updateTotalAmount]
  );

  const updatePlusAmount = useCallback(
    async (newPlusFiatAmount: number) => {
      await animatePlusAmount(newPlusFiatAmount);
      setPlusFiatAmount(newPlusFiatAmount);
    },
    [animatePlusAmount, fiatAmount]
  );

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
        void updateAmount(newFiatAmount, newNumber);
        if (plusFiatAmount > 0) {
          void updateTotalAmount(newFiatAmount + plusFiatAmount);
        }
      }
    },
    [
      updateAmount,
      fiatAmount,
      decimalCount,
      plusFiatAmount,
      isBelowMaxFiatAmount
    ]
  );

  const clearAmount = useCallback(() => {
    setDecimalCount(0);
    void updateAmount(0, "clear");

    if (plusFiatAmount > 0) {
      void updatePlusAmount(0);
      void updateTotalAmount(0);
      void symbolsApi(false);
    }
  }, [
    updateAmount,
    updatePlusAmount,
    updateTotalAmount,
    symbolsApi,
    plusFiatAmount
  ]);

  const delAmount = useCallback(() => {
    if (decimalCount > 0) {
      setDecimalCount(0);
    }
    if (fiatAmount <= 9) {
      void updateAmount(0, "clear");
      if (plusFiatAmount > 0) {
        void updateTotalAmount(plusFiatAmount);
      }
      setDecimalCount(0);
    } else {
      const newAmount = parseInt(fiatAmount.toString().slice(0, -1));
      void updateAmount(newAmount, "delete");
      if (plusFiatAmount > 0) {
        void updateTotalAmount(plusFiatAmount + newAmount);
      }
    }
  }, [
    fiatAmount,
    updateAmount,
    updateTotalAmount,
    decimalCount,
    plusFiatAmount
  ]);

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
    void updateAmount(fiatAmount * unitDecimalPower, "decimal");
    setDecimalCount(unitDecimals);
  }, [
    fiatAmount,
    unitDecimalPower,
    haveDecimals,
    plusFiatAmount,
    updateAmount,
    isBelowMaxFiatAmount
  ]);

  const [movingPlusProps, movingPlusApi] = useSpring(() => ({
    from: { top: 0, scale: 1, color: colors.white, opacity: 1 }
  }));

  const [symbolsProps, symbolsApi] = useSymbolApi();

  const onPlus = useCallback(async () => {
    const newPlusParts = parts.filter((p) => !p.remove);
    const currentParts = newPlusParts.map((e) => e.text).join("");
    setMovingPlusAmount(currentParts);

    await movingPlusApi.start(() => ({
      from: { top: 0, scale: 1, color: colors.white, opacity: 1 },
      to: {
        top: -(S.PLUS_TEXTS_TRANSLATE_Y + (isWeb ? 0 : 1.5)),
        scale: S.PLUS_TEXTS_SCALE,
        color: colors.greyLight
      },
      delay: springAnimationDelay,
      config: PLUS_ANIMATION_CONFIG
    }));

    if (plusFiatAmount > 0) {
      await movingPlusApi.start(() => ({
        from: { opacity: 1 },
        to: { opacity: 0 },
        delay: springAnimationDelay + PLUS_ANIMATION_DELAY,
        config: {
          ...PLUS_ANIMATION_CONFIG,
          duration: PLUS_ANIMATION_OPACITY_DURATION
        }
      }));
    }

    void updateAmount(0, "clear");
    setDecimalCount(0);

    const newPlusFiatAmount = plusFiatAmount + fiatAmount;
    setPlusFiatAmount(newPlusFiatAmount);

    if (plusFiatAmount === 0) {
      void symbolsApi(true);
      void updateTotalAmount(newPlusFiatAmount);
      await sleep(PLUS_ANIMATION_OPACITY_DURATION * 6);
      setPlusParts(newPlusParts);
      setMovingPlusAmount(undefined);
    } else {
      void updatePlusAmount(newPlusFiatAmount);
    }
  }, [
    movingPlusApi,
    plusFiatAmount,
    symbolsApi,
    fiatAmount,
    updateAmount,
    animatePlusAmount,
    parts,
    setPlusParts
  ]);

  const handleKeyPress = useCallback<EventListener>(
    // @ts-ignore
    (e: KeyboardEvent) => {
      const pressedKey = parseInt(e?.nativeEvent?.key);
      const refs = inputRef as unknown as MutableRefObject<HTMLButtonElement[]>;
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

  const renderParts = useMemo(
    () =>
      parts.map((part, index) => {
        const spring = springs[index];
        return (
          <animated.View
            key={part.id}
            style={{
              willChange: "transform, opacity, width",
              opacity: spring.opacity,
              width: spring.width,
              transform: [
                {
                  scale: spring.scale
                }
              ]
            }}
          >
            <S.AnimatedText style={{ width: part.width + 0.01 }}>
              {part.text}
            </S.AnimatedText>
          </animated.View>
        );
      }),
    [parts, springs]
  );

  const renderPlusParts = useMemo(
    () =>
      plusParts.map((part, index) => {
        const spring = plusSprings[index];

        return (
          <animated.View
            key={part.id}
            style={{
              willChange: "transform, opacity, width",
              opacity: spring.opacity,
              width: spring.width,
              transform: [
                {
                  scale: spring.scale
                }
              ]
            }}
          >
            <S.PlusText style={{ width: part.width }}>{part.text}</S.PlusText>
          </animated.View>
        );
      }),
    [plusParts, plusSprings]
  );

  const totalPartsComponents = useMemo(
    () =>
      totalParts.map((part, index) => {
        const spring = totalSprings[index];

        return (
          <animated.View
            key={part.id}
            style={{
              willChange: "transform, opacity, width",
              opacity: spring.opacity,
              width: spring.width,
              transform: [
                {
                  scale: spring.scale
                }
              ]
            }}
          >
            <S.PlusText style={{ width: part.width, color: colors.bitcoin }}>
              {part.text}
            </S.PlusText>
          </animated.View>
        );
      }),
    [totalParts, totalSprings, colors.bitcoin]
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
            {renderParts}
            <S.PlusTextsContainer isTop>{renderPlusParts}</S.PlusTextsContainer>
            <S.PlusTextsContainer
              style={{
                willChange: "opacity, transform",
                opacity: movingPlusProps.opacity,
                transform: [
                  { translateY: movingPlusProps.top },
                  { scale: movingPlusProps.scale }
                ]
              }}
            >
              <S.PlusText
                style={{ willChange: "color", color: movingPlusProps.color }}
              >
                {movingPlusAmount}
              </S.PlusText>
            </S.PlusTextsContainer>
            <S.SymbolText style={symbolsProps}>+</S.SymbolText>
            <S.SymbolText isBottom style={symbolsProps}>
              =
            </S.SymbolText>
            <S.PlusTextsContainer isBottom>
              {totalPartsComponents}
            </S.PlusTextsContainer>
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
