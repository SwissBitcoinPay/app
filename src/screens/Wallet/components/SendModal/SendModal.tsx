import { ComponentProps, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import queryString from "query-string";
import {
  CheckboxField,
  ComponentStack,
  ConnectWalletModal,
  Modal,
  Text,
  TextField
} from "@components";
import {
  getFormattedUnit,
  hardwareNames,
  prepareTransaction,
  sleep,
  useErrorBoundary,
  validateBitcoinAddress
} from "@utils";
import { AsyncStorage } from "@utils";
import {
  keyStoreLedgerBluetoothId,
  keyStoreWalletType
} from "@config/settingsKeys";
import { CreateTransactionReturn } from "@utils/wallet/types";
import axios from "axios";
import { useTheme } from "styled-components";
import { XOR } from "ts-essentials";
import * as S from "./styled";
import { useAccountConfig, useIsScreenSizeMin, useRates } from "@hooks";
import { AddressDetail, WalletTransaction } from "@screens/Wallet/Wallet";
import { Controller, SubmitHandler, useForm } from "react-hook-form";
import { useToast } from "react-native-toast-notifications";
import { HardwareReadyFunctionParams } from "@components/ConnectWalletModal/ConnectWalletModal";
import { PrepareTransactionParams } from "@utils/wallet/prepare-transaction";
import { Platform } from "react-native";
import { faBluetooth, faUsb } from "@fortawesome/free-brands-svg-icons";
import { WalletType } from "@components/PayoutConfig/PayoutConfig";

type SendForm = {
  address: string;
  feeRate: string;
} & XOR<XOR<{ btcAmount: string }, { isMax: true }>, { fiatAmount: string }>;

type FeeOptionType = {
  label: string;
  value: number;
};

const isValidIntegerOrFloat = (value: string) =>
  (!isNaN(parseInt(value)) || !isNaN(parseFloat(value))) &&
  !value.endsWith(".") &&
  parseFloat(value) > 0;

const decimalsNb = (num: string) => (num.split(".")[1] || []).length;

const isValidBitcoinAmount = (value: string) =>
  isValidIntegerOrFloat(value) && decimalsNb(value) <= 8;

const isValidFiatAmount = (value: string) =>
  isValidIntegerOrFloat(value) && decimalsNb(value) <= 2;

type SendModalProps = Omit<ComponentProps<typeof Modal>, "onClose"> & {
  txs: WalletTransaction[];
  nextChangeAddress: AddressDetail;
  zPub: string;
  onClose: (success: boolean) => void;
  currentBalance: number;
};

export const SendModal = ({
  txs,
  isOpen,
  nextChangeAddress,
  onClose,
  zPub,
  currentBalance,
  ...props
}: SendModalProps) => {
  const rates = useRates();
  const toast = useToast();
  const { accountConfig: { currency: accountCurrency } = {} } =
    useAccountConfig({ refresh: false });
  const { colors } = useTheme();
  const { t: tRoot } = useTranslation();
  const { t } = useTranslation(undefined, {
    keyPrefix: "screens.wallet.sendModal"
  });
  const isMedium = useIsScreenSizeMin("medium");
  const [isLoading, setIsLoading] = useState(false);
  const setError = useErrorBoundary();

  const [wallet, setWallet] = useState<{
    type: WalletType;
    transport?: string;
  }>();
  const [feesOptions, setFeesOptions] = useState<FeeOptionType[]>([]);

  const { control, formState, setValue, reset, handleSubmit, watch, trigger } =
    useForm<SendForm>({
      mode: "onTouched",
      defaultValues: {
        isMax: false
      }
    });

  const { isValid } = formState;

  const isMax = watch("isMax");

  const [customWalletFunction, setCustomWalletFunction] =
    useState<
      (walletReadyProps: HardwareReadyFunctionParams) => Promise<string>
    >();

  const onCloseBitboxModal = useCallback(() => {
    setCustomWalletFunction(undefined);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      setWallet({
        type: (await AsyncStorage.getItem(keyStoreWalletType)) || "local",
        transport: (await AsyncStorage.getItem(keyStoreLedgerBluetoothId))
          ? "bluetooth"
          : undefined
      });
    })();
  }, []);

  const awaitWalletTransaction = useCallback(
    async (params: PrepareTransactionParams) => {
      return new Promise<CreateTransactionReturn>((resolver, reject) => {
        const walletType = wallet?.type;
        if (walletType === "local") {
          prepareTransaction({
            walletType,
            ...params
          })
            .then(resolver)
            .catch(reject);
        } else if (walletType === "bitbox02" || walletType === "ledger") {
          setCustomWalletFunction(
            () => async (walletReadyProps: HardwareReadyFunctionParams) => {
              try {
                const result = await prepareTransaction({
                  walletType,
                  ...walletReadyProps,
                  ...params
                });
                resolver(result);
              } catch (e) {
                reject(e);
              }
            }
          );
        }
      });
    },
    [wallet?.type]
  );

  const onSend = useCallback<SubmitHandler<SendForm>>(
    async (data) => {
      setIsLoading(true);
      try {
        const utxos = txs.filter((tx) => tx.value > 0 && !tx.isSpent);

        const receiveAddress = data.address;
        const amount = Math.round((data.btcAmount || 0) * 100000000);

        const feeRate =
          feesOptions.find((v) => v.label === data.feeRate)?.value || 0;

        const tx = await awaitWalletTransaction({
          utxos,
          receiveAddress,
          amount,
          changeAddress: !data.isMax ? nextChangeAddress : undefined,
          feeRate,
          zPub
        });

        if (tx.txHex) {
          try {
            await axios.post("https://mempool.space/api/tx", tx.txHex);
            toast.show(t("transactionSent"), { type: "success" });
            onClose(true);
            await sleep(500);
            reset();
          } catch (e) {
            let errorMessage = e.response.data;
            try {
              errorMessage = JSON.parse(
                // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call
                errorMessage.replace("sendrawtransaction RPC error:", "")
              ).message;
            } catch (_e) {}
            toast.show(`${t("errorBroadcast")}: ${errorMessage}`, {
              type: "error"
            });
          }
        }
      } catch (e) {
        setError(e);
      }
      setIsLoading(false);
    },
    [
      awaitWalletTransaction,
      feesOptions,
      nextChangeAddress,
      onClose,
      reset,
      setError,
      t,
      toast,
      txs,
      zPub
    ]
  );

  useEffect(() => {
    (async () => {
      if (isOpen) {
        const {
          data: { minimumFee: _, ...feesOptionsData }
        } = await axios.get<{
          minimumFee: number;
          fastestFee: number;
          halfHourFee: number;
          hourFee: number;
          economyFee: number;
        }>("https://mempool.space/api/v1/fees/recommended");

        setFeesOptions([
          { label: t("economyFee"), value: feesOptionsData.economyFee },
          { label: t("hourFee"), value: feesOptionsData.hourFee },
          { label: t("halfHourFee"), value: feesOptionsData.halfHourFee },
          {
            label: t("fastestFee"),
            value:
              feesOptionsData.fastestFee +
              (Object.values(feesOptionsData).every((v, i, a) => a[0] === v)
                ? 1
                : 0)
          }
        ]);

        await sleep(1);

        setValue("feeRate", t("halfHourFee"), { shouldDirty: true });
      } else {
        await sleep(500);
        reset();
      }
    })();
  }, [isOpen]);

  const fiatToBtc = useCallback(
    (amount: string) => {
      if (rates && accountCurrency) {
        return (parseFloat(amount) / rates[accountCurrency]).toFixed(8);
      } else {
        return "";
      }
    },
    [accountCurrency, rates]
  );

  const btcToFiat = useCallback(
    (amount: string) => {
      if (rates && accountCurrency) {
        return (parseFloat(amount) * rates[accountCurrency]).toFixed(2);
      } else {
        return "";
      }
    },
    [accountCurrency, rates]
  );

  return (
    <>
      <Modal
        {...props}
        onClose={() => {
          onClose(false);
        }}
        isOpen={isOpen && !customWalletFunction}
        title={t("send")}
        noScrollView={Platform.OS === "web"}
        submitButton={{
          title: t("broadcast"),
          disabled: !isValid || currentBalance === 0,
          isLoading,
          onPress: handleSubmit(onSend),
          ...(wallet && wallet.type !== "local"
            ? {
                title: t("signWithHardware", {
                  hardwareWallet: hardwareNames[wallet.type]
                }),
                icon: wallet.transport === "bluetooth" ? faBluetooth : faUsb
              }
            : {})
        }}
      >
        <ComponentStack>
          <Text h4 weight={600} color={colors.white}>
            {t("sendInfo")}
          </Text>

          <Controller
            name="address"
            control={control}
            rules={{
              required: true,
              validate: (v) =>
                !validateBitcoinAddress(v)
                  ? tRoot("common.errors.invalidBitcoinAddress")
                  : undefined
            }}
            render={({
              field: { onChange, onBlur, value },
              fieldState: { error }
            }) => {
              return (
                <TextField
                  label={t("destinationAddress")}
                  autoCorrect={false}
                  onChangeText={(newValue) => {
                    if (newValue !== undefined && newValue !== null) {
                      let bitcoinAddress = newValue;
                      if (newValue.startsWith("bitcoin:")) {
                        const { url, query } = queryString.parseUrl(newValue);

                        bitcoinAddress = url.replace("bitcoin:", "");

                        if (query.amount) {
                          setValue("btcAmount", query.amount, {
                            shouldDirty: true
                          });
                          setValue("fiatAmount", btcToFiat(query.amount), {
                            shouldDirty: true
                          });
                          setValue("isMax", false);
                        }
                      }
                      onChange(bitcoinAddress);
                    }
                  }}
                  onBlur={onBlur}
                  value={value}
                  pastable
                  qrScannable
                  error={error?.message}
                />
              );
            }}
          />
          <ComponentStack gapSize={8}>
            <Text h4 weight={600} color={colors.white}>
              {t("amount")}
            </Text>
            <ComponentStack direction="horizontal" gapSize={10}>
              <Controller
                name="btcAmount"
                control={control}
                rules={{
                  required: !isMax,
                  validate: (v) =>
                    isMax ||
                    (isValidBitcoinAmount(v) && parseFloat(v) <= currentBalance)
                }}
                render={({
                  field: { onChange, onBlur, value = "" },
                  fieldState: { error }
                }) => {
                  return (
                    <TextField
                      label="Bitcoin"
                      charMask={/^\d*[.,]?\d{0,8}$/}
                      disabled={isMax}
                      inputMode="numeric"
                      onChangeText={(amount) => {
                        onChange(amount);
                        setValue("isMax", false);
                        const formattedAmount = amount.replace(",", ".");
                        if (
                          isValidBitcoinAmount(formattedAmount) &&
                          accountCurrency &&
                          rates
                        ) {
                          setValue("fiatAmount", btcToFiat(formattedAmount), {
                            shouldDirty: true
                          });
                        }
                      }}
                      onBlur={onBlur}
                      value={isMax ? t("max") : value}
                      pastable
                      error={error?.message}
                      style={{ flex: 1 }}
                    />
                  );
                }}
              />
              <Controller
                name="fiatAmount"
                control={control}
                rules={{
                  required: !isMax,
                  validate: (v) => isMax || isValidFiatAmount(v)
                }}
                render={({
                  field: { onChange, onBlur, value = "" },
                  fieldState: { error }
                }) => {
                  return (
                    <TextField
                      label={accountCurrency}
                      charMask={/^\d*[.,]?\d{0,2}$/}
                      disabled={isMax}
                      inputMode="numeric"
                      onChangeText={(amount) => {
                        onChange(amount);
                        setValue("isMax", false);
                        const formattedAmount = amount.replace(",", ".");
                        if (
                          isValidFiatAmount(formattedAmount) &&
                          accountCurrency &&
                          rates
                        ) {
                          setValue("btcAmount", fiatToBtc(formattedAmount), {
                            shouldDirty: true,
                            shouldValidate: true
                          });
                        }
                      }}
                      onBlur={onBlur}
                      value={isMax ? t("max") : value}
                      pastable
                      error={error?.message}
                      style={{ flex: 1 }}
                    />
                  );
                }}
              />
            </ComponentStack>
            <S.BelowAmountContainer
              direction={isMedium ? "horizontal" : "vertical"}
              gapSize={0}
            >
              <S.AmountDescription>
                {t("balance")} : {currentBalance} BTC (~{" "}
                {accountCurrency
                  ? getFormattedUnit(btcToFiat(currentBalance), accountCurrency)
                  : ""}
                )
              </S.AmountDescription>
              <Controller
                name="isMax"
                control={control}
                rules={{
                  required: false
                }}
                render={({
                  field: { onChange, value },
                  formState: _formState
                }) => {
                  return (
                    <CheckboxField
                      label={t("max")}
                      value={value}
                      style={{ marginVertical: 0, marginRight: 6 }}
                      onChange={(e) => {
                        const { value: newValue } = e.nativeEvent;
                        onChange(newValue);
                        if (newValue) {
                          setTimeout(() => {
                            trigger(["btcAmount", "fiatAmount"]);
                          }, 0);
                        }
                      }}
                    />
                  );
                }}
              />
            </S.BelowAmountContainer>
          </ComponentStack>
          <ComponentStack gapSize={8}>
            <Text h4 weight={600} color={colors.white}>
              {t("fees")}
            </Text>
            <ComponentStack
              direction={isMedium ? "horizontal" : "horizontal"}
              gapSize={0}
            >
              <Controller
                name="feeRate"
                control={control}
                rules={{
                  required: true
                }}
                render={({ field: { onChange, value } }) => {
                  return feesOptions.map((option, index) => (
                    <FeeOption
                      key={index}
                      option={option}
                      isFirst={index === 0}
                      isEnabled={value === option.label}
                      isLast={index === feesOptions.length - 1}
                      onSelect={onChange}
                    />
                  ));
                }}
              />
            </ComponentStack>
          </ComponentStack>
          <Text h4 weight={600} color={colors.grey}>
            🔒 {t("sendLastInfo")}
          </Text>
        </ComponentStack>
      </Modal>
      <ConnectWalletModal
        isOpen={!!customWalletFunction}
        customFunction={customWalletFunction}
        onClose={onCloseBitboxModal}
        walletType={wallet?.type}
      />
    </>
  );
};

type FeeOptionProps = {
  option: FeeOptionType;
  isFirst: boolean;
  isLast: boolean;
  isEnabled: boolean;
  onSelect: (value: number) => void;
};

const FeeOption = ({
  option,
  onSelect,
  isEnabled,
  ...props
}: FeeOptionProps) => {
  const isMedium = useIsScreenSizeMin("medium");

  const onPress = useCallback(() => {
    onSelect(option.label);
  }, [onSelect, option.label]);

  return (
    <S.FeesOptionContainer
      isMedium={isMedium}
      onPress={onPress}
      isEnabled={isEnabled}
      {...props}
    >
      <S.FeesLabelText
        weight={600}
        numberOfLines={1}
        {...(isMedium ? { h4: true } : { h6: true })}
      >
        {option.label}
      </S.FeesLabelText>
      <S.FeesValueText
        {...(isMedium ? { h5: true } : { h7: true })}
        weight={500}
        isEnabled={isEnabled}
      >
        {option.value} sat/vB
      </S.FeesValueText>
    </S.FeesOptionContainer>
  );
};
