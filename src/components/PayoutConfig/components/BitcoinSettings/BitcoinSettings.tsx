import { useTranslation } from "react-i18next";
import {
  Button,
  Loader,
  ComponentStack,
  TextField,
  Lottie,
  Icon,
  FieldDescription,
  CreateWalletModal,
  FieldContainer,
  Text
} from "@components";
import {
  faAdd,
  faCheck,
  faCheckCircle,
  faEnvelopeOpenText,
  faKey,
  faListOl,
  faTimesCircle,
  faWallet
} from "@fortawesome/free-solid-svg-icons";
// @ts-ignore
import { decodelnurl } from "js-lnurl";
// @ts-ignore
import xpubConverter from "xpub-converter";
import { Controller } from "react-hook-form";
import { validate as isEmail } from "email-validator";
import { useTheme } from "styled-components";
import {
  ComponentProps,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import { getFormattedUnit, validateBitcoinAddress } from "@utils";
import axios from "axios";
import { ScrollView } from "react-native";
import { faCircle } from "@fortawesome/free-regular-svg-icons";
import useWebSocket, { ReadyState } from "react-use-websocket";
import { SBPContext, apiRootUrl } from "@config";
import { DescriptionLine } from "../DescriptionLine";
import { BitcoinFiatFormSettings } from "@components/PayoutConfig/PayoutConfig";
import * as S from "./styled";

export const BitcoinSettings = ({
  rates,
  currency,
  setValue,
  resetField,
  watch,
  control
}: BitcoinFiatFormSettings) => {
  const { t } = useTranslation(undefined, {
    keyPrefix: "screens.payoutConfig"
  });
  const { t: tRoot } = useTranslation();
  const theme = useTheme();
  const { accountConfig } = useContext(SBPContext);

  // Address validation
  const depositAddress = watch("depositAddress");
  const btcAddressTypes = watch("btcAddressTypes");
  const nextAddresses = watch("nextAddresses");
  const finalDepositAddress = watch("finalDepositAddress");
  const isLocalWallet = watch("isLocalWallet");

  // Signature stuff
  const messageToSign = watch("messageToSign");
  const signWithAddress = watch("signWithAddress");
  const prToPay = watch("prToPay");
  const hash = watch("hash");
  const isPrPaid = watch("isPrPaid");
  const signature = watch("signature");

  const alreadyVerifiedAddresses = useMemo(
    () => accountConfig?.verifiedAddresses || [],
    [accountConfig?.verifiedAddresses]
  );

  const isAddressAlreadyVerified = useMemo(
    () => !!alreadyVerifiedAddresses.includes(depositAddress || ""),
    [alreadyVerifiedAddresses, depositAddress]
  );

  const { step1, step2 } = useMemo(() => {
    if (rates) {
      const btcPriceInChf = rates.CHF;
      const btcPriceInCurrency = rates[currency];

      return {
        step1: getFormattedUnit(
          (100 * btcPriceInCurrency) / btcPriceInChf,
          currency,
          0
        ),
        step2: getFormattedUnit(
          (1000 * btcPriceInCurrency) / btcPriceInChf,
          currency,
          0
        )
      };
    }
    return { step1: null, step2: null };
  }, [rates, currency]);

  useEffect(() => {
    if (finalDepositAddress && !messageToSign && !isAddressAlreadyVerified) {
      (async () => {
        const { data } = await axios.post<{
          message: string;
          displayAddress?: string;
          signAddress?: string;
          pr?: string;
          hash?: string;
        }>(`${apiRootUrl}/verify-address`, {
          depositAddress: finalDepositAddress
        });

        if (btcAddressTypes.xpub) {
          setValue("signWithAddress", data.signAddress, {
            shouldValidate: false
          });
        }
        setValue("prToPay", data.pr, { shouldValidate: false });
        setValue("hash", data.hash, { shouldValidate: false });
        setValue("messageToSign", data.message, { shouldValidate: false });

        setValue(
          "btcAddressTypes",
          {
            ...btcAddressTypes,
            [btcAddressTypes.onchain
              ? "onchain"
              : btcAddressTypes.xpub
              ? "xpub"
              : "lightning"]: true
          },
          { shouldValidate: false }
        );
      })();
    } else {
    }
  }, [finalDepositAddress]);

  const onChangeDepositAddress = useCallback(() => {
    setValue("isLocalWallet", false);
    setValue("signature", undefined);
    setValue("messageToSign", undefined);
    setValue("nextAddresses", undefined);
    setValue("btcAddressTypes", {
      onchain: false,
      xpub: false,
      lightning: false
    });
    setValue("signWithAddress", undefined);
    setValue("prToPay", undefined);
    setValue("hash", undefined);
    setValue("finalDepositAddress", undefined);
    setValue("isLocalWallet", undefined);

    resetField("signature");
    resetField("messageToSign");
    resetField("btcAddressTypes");
    resetField("nextAddresses");
    resetField("signWithAddress");
    resetField("prToPay");
    resetField("hash");
    resetField("finalDepositAddress");
    resetField("isLocalWallet");
  }, [resetField, setValue]);

  const validateDepositAddress = useCallback(
    async (value = "") => {
      const isNewAddressAlreadyVerified =
        !!alreadyVerifiedAddresses.includes(value);

      if (validateBitcoinAddress(value)) {
        setValue("btcAddressTypes", {
          onchain: isNewAddressAlreadyVerified || "loading",
          xpub: false,
          lightning: false
        });
        setValue("finalDepositAddress", value);
        return true;
      } else if (
        value.startsWith("xpub") ||
        value.startsWith("ypub") ||
        value.startsWith("zpub")
      ) {
        setValue(
          "btcAddressTypes",
          {
            onchain: false,
            xpub: isNewAddressAlreadyVerified || "loading",
            lightning: false
          },
          { shouldValidate: false }
        );
        try {
          const { data } = await axios.get<{ address: string }[]>(
            `${apiRootUrl}/valid-xpub?xpub=${value}`
          );
          if (data) {
            setValue(
              "nextAddresses",
              data.slice(0, 3).map((d) => d.address),
              { shouldValidate: false }
            );
            setValue(
              "btcAddressTypes",
              {
                onchain: false,
                xpub: true,
                lightning: false
              },
              { shouldValidate: false }
            );
            setValue("finalDepositAddress", value, { shouldValidate: false });
            return true;
          }
        } catch (e) {}
        setValue("btcAddressTypes", {
          onchain: false,
          xpub: "error",
          lightning: false
        });
      } else if (isEmail(value) || value.toLowerCase().startsWith("lnurl")) {
        setValue("btcAddressTypes", {
          onchain: false,
          xpub: false,
          lightning: isNewAddressAlreadyVerified || "loading"
        });

        try {
          let domain = "";
          let username = "";
          let url = "";

          if (value.toLowerCase().startsWith("lnurl")) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call
            url = decodelnurl(value);
            const urlObj = new URL(url);
            domain = urlObj.hostname;
            const pathname = urlObj.pathname.replace("/.well-known", "");
            if (!pathname.startsWith("/lnurlp/")) {
              throw new Error("");
            }
            const pathnameParts = pathname.split("/");
            username = pathnameParts[pathnameParts.length - 1];
            if (urlObj.pathname.startsWith("/.well-known")) {
              value = `${username}@${domain}`;
            } else {
              value = value.toLowerCase();
            }
          } else {
            username = value.split("@")[0];
            domain = value.split("@")[1];
            url = `https://${domain}/.well-known/lnurlp/${username}`;
          }

          const { data } = await axios.get(url);

          if (
            data.tag === "payRequest" &&
            domain !== "swiss-bitcoin-pay.ch" &&
            domain !== "sbpc.ch"
          ) {
            if (!isNewAddressAlreadyVerified) {
              setValue("finalDepositAddress", value);
            }
            return true;
          }
        } catch (e) {}
        setValue("btcAddressTypes", {
          onchain: false,
          xpub: false,
          lightning: "error"
        });
      }
      return tRoot("common.errors.invalidBitcoinAddress");
    },
    [alreadyVerifiedAddresses, setValue, tRoot]
  );

  const validateSignature = useCallback(
    async (value?: string) => {
      if (signature === "paid") return true;
      try {
        await axios.post(`${apiRootUrl}/verify-signature`, {
          message: messageToSign,
          signature: value
        });
        return true;
      } catch (e) {}
      return t("invalidSignature");
    },
    [messageToSign, t, signature]
  );

  const { sendMessage, lastMessage, readyState } = useWebSocket(
    `wss://${apiRootUrl.replace("https://", "")}/invoice/ln`,
    {
      shouldReconnect: () => true
    },
    !!hash
  );

  useEffect(() => {
    if (lastMessage?.data && lastMessage.data !== "undefined") {
      const messageData = JSON.parse(lastMessage.data as string);
      if (messageData.settled) {
        setValue("isPrPaid", true);
        setTimeout(() => {
          setValue("signature", "paid", { shouldValidate: true });
        }, 0);
      }
    }
  }, [lastMessage]);

  useEffect(() => {
    if (readyState === ReadyState.OPEN && hash) {
      sendMessage(
        JSON.stringify({
          hash: hash.replaceAll("+", "-").replaceAll("/", "_")
        })
      );
    }
  }, [readyState, hash]);

  const [isCreateWalletModalOpen, setIsCreateWalletModalOpen] = useState(false);

  const onCreateWalletModalClose = useCallback<
    ComponentProps<typeof CreateWalletModal>["onClose"]
  >(
    (signatureData) => {
      if (signatureData) {
        setValue("isLocalWallet", true);
        setValue("depositAddress", signatureData.zPub, {
          shouldValidate: false
        });
        setValue("messageToSign", signatureData.message);
        setValue("signature", signatureData.signature);
      }
      setIsCreateWalletModalOpen(false);
    },
    [setValue]
  );

  return (
    <>
      <CreateWalletModal
        title={t("createYourBitcoinWallet")}
        isOpen={isCreateWalletModalOpen}
        onClose={onCreateWalletModalClose}
      />
      <ComponentStack>
        <ComponentStack gapSize={14}>
          <FieldDescription>💶 {t("feesDetails1")}</FieldDescription>
          <ComponentStack gapSize={4}>
            <DescriptionLine>
              <FieldDescription>
                {t("feesDetailsBelow", {
                  amount: step1
                })}
              </FieldDescription>
              <FieldDescription>0%</FieldDescription>
            </DescriptionLine>
            <DescriptionLine>
              <FieldDescription>
                {t("feesDetailsBelow", {
                  amount: step2
                })}
              </FieldDescription>
              <FieldDescription>0.21%</FieldDescription>
            </DescriptionLine>
            <DescriptionLine>
              <FieldDescription>
                {t("feesDetailsAbove", {
                  amount: step2
                })}
              </FieldDescription>
              <FieldDescription>1%</FieldDescription>
            </DescriptionLine>
          </ComponentStack>
          <FieldDescription>
            🔐 {t("receiveInBtcDescription1")}
          </FieldDescription>
          <FieldDescription>
            💵 {t("receiveInBtcDescription2")}
          </FieldDescription>
          <FieldDescription>
            {btcAddressTypes.lightning
              ? `⚡ ${t("receiveInBtcDescription3Lightning")}`
              : `🕒 ${t("receiveInBtcDescription3")}`}
          </FieldDescription>
          <FieldDescription>
            🔑 {t("receiveInBtcDescription4")}
          </FieldDescription>
        </ComponentStack>
        <Controller
          name="depositAddress"
          control={control}
          rules={{
            required: true,
            onChange: onChangeDepositAddress,
            validate: async (value = "", formValues) => {
              if (
                formValues.messageToSign ||
                Object.values(formValues.btcAddressTypes).some((v) => v)
              )
                return true;

              return await validateDepositAddress(value);
            }
          }}
          render={({ field: { onChange, value }, fieldState: { error } }) => {
            return (
              <ComponentStack>
                <FieldContainer
                  icon={faWallet}
                  title={t("yourWallet")}
                  buttonProps={{
                    title: t("createWallet"),
                    icon: faAdd,
                    onPress: () => {
                      setIsCreateWalletModalOpen(true);
                    }
                  }}
                >
                  <TextField
                    label={t("bitcoinPayoutWallet")}
                    value={isLocalWallet ? t("localWallet") : value}
                    onChangeText={(newValue) => {
                      if (newValue) {
                        onChange(
                          newValue
                            .replace("bitcoin:", "")
                            .replace("lightning:", "")
                        );
                      }
                    }}
                    autoCorrect={false}
                    error={
                      error?.type === "validate" ? error?.message : undefined
                    }
                    disabled={isLocalWallet}
                    qrScannable
                    pastable
                  />
                  {alreadyVerifiedAddresses.filter(
                    (address) => address !== value
                  ).length > 0 && (
                    <ComponentStack gapSize={10}>
                      <Text h4 weight={600} color={theme.colors.white}>
                        {t("alreadyVerifiedAddresses")}
                      </Text>
                      <ScrollView horizontal>
                        <ComponentStack direction="horizontal">
                          {alreadyVerifiedAddresses
                            .filter((address) => address !== value)
                            .map((address, index) => (
                              <Button
                                key={index}
                                title={address}
                                size="small"
                                onPress={() => {
                                  onChangeDepositAddress();
                                  setValue("depositAddress", address, {
                                    shouldDirty: true
                                  });
                                }}
                              />
                            ))}
                        </ComponentStack>
                      </ScrollView>
                    </ComponentStack>
                  )}
                </FieldContainer>
                {!isLocalWallet && (
                  <ComponentStack direction="horizontal" gapSize={10}>
                    {[
                      {
                        value: btcAddressTypes.onchain,
                        label: "Onchain"
                      },
                      {
                        value: btcAddressTypes.xpub,
                        label: "x/y/zPub"
                      },
                      {
                        value: btcAddressTypes.lightning,
                        label: t("lightningAddress")
                      }
                    ].map(({ value: addressTypeValue, label }) => {
                      const isLoading = addressTypeValue === "loading";

                      const color =
                        addressTypeValue === false
                          ? theme.colors.primary
                          : addressTypeValue === "error"
                          ? theme.colors.error
                          : isLoading
                          ? theme.colors.warning
                          : theme.colors.success;

                      return (
                        <S.PassCheckContainer key={label}>
                          {isLoading ? (
                            <Loader size={58} />
                          ) : (
                            <Icon
                              color={
                                !addressTypeValue ? theme.colors.grey : color
                              }
                              icon={
                                addressTypeValue === false
                                  ? faCircle
                                  : addressTypeValue === "error"
                                  ? faTimesCircle
                                  : faCheckCircle
                              }
                              size={20}
                            />
                          )}
                          <S.PassCheckText
                            h4
                            color={
                              !addressTypeValue ? theme.colors.grey : color
                            }
                            weight={600}
                          >
                            {label}
                          </S.PassCheckText>
                        </S.PassCheckContainer>
                      );
                    })}
                  </ComponentStack>
                )}
                {!isLocalWallet && btcAddressTypes.xpub === true && (
                  <ComponentStack>
                    <ComponentStack direction="horizontal" gapSize={10}>
                      {[
                        {
                          label: `Bech32 (${t("recommended")})`,
                          value: "zpub"
                        },
                        {
                          label: "Segwit",
                          value: "ypub"
                        },
                        {
                          label: "Legacy",
                          value: "xpub"
                        }
                      ].map(({ label, value: xPubType }) => {
                        const isSelected =
                          watch("depositAddress")?.startsWith(xPubType);

                        return (
                          <Button
                            key={label}
                            size="small"
                            mode={!isSelected ? "outline" : "normal"}
                            onPress={() => {
                              if (isSelected) return;
                              try {
                                // eslint-disable-next-line @typescript-eslint/no-unsafe-call
                                const newAddress: string = xpubConverter(
                                  value,
                                  xPubType
                                );

                                onChange(newAddress);
                              } catch (e) {}
                            }}
                            title={label}
                          />
                        );
                      })}
                    </ComponentStack>
                    <FieldContainer icon={faListOl} title={t("nextAddresses")}>
                      <S.NextAddressesContainer>
                        {nextAddresses?.map((nextAddr) => (
                          <S.NextAddress key={nextAddr}>
                            {nextAddr}
                          </S.NextAddress>
                        ))}
                      </S.NextAddressesContainer>
                    </FieldContainer>
                  </ComponentStack>
                )}
              </ComponentStack>
            );
          }}
        />
        {messageToSign && !prToPay && !isLocalWallet && (
          <ComponentStack>
            {signWithAddress && (
              <FieldContainer
                icon={faWallet}
                title={t("signWithAddressDetails")}
              >
                <TextField
                  label={t("signWithAddress")}
                  value={signWithAddress}
                  disabled
                  copyable
                  qrDisplayable
                />
              </FieldContainer>
            )}
            <FieldContainer icon={faKey} title={t("messageToSignDetails")}>
              <TextField
                label={t("messageToSign")}
                value={messageToSign}
                multiline
                disabled
                copyable
                qrDisplayable
                qrDisplayValue={`signmessage m/84h/0h/0h/0/0 ascii:${messageToSign}`}
              />
            </FieldContainer>
          </ComponentStack>
        )}
        {!isLocalWallet && !isAddressAlreadyVerified && (
          <Controller
            name="signature"
            control={control}
            rules={{
              required: true,
              validate: validateSignature
            }}
            render={({
              field: { onChange, onBlur, value },
              fieldState: { error, isDirty, invalid },
              formState: { isValidating }
            }) => {
              if (!messageToSign && !prToPay) return <></>;
              const isSignatureValid = isDirty && !invalid;

              if (prToPay) {
                return (
                  <>
                    {!isPrPaid ? (
                      <ComponentStack>
                        <S.PayInvoiceText>
                          {t("payInvoiceToCertify")}
                        </S.PayInvoiceText>
                        <S.PayInvoiceQr size={300} value={prToPay} />
                        <Button
                          title={t("openWallet")}
                          icon={faWallet}
                          onPress={`lightning:${prToPay}`}
                        />
                      </ComponentStack>
                    ) : (
                      <ComponentStack>
                        <S.PayInvoiceText color={theme.colors.success}>
                          {t("invoicePaid")}
                        </S.PayInvoiceText>
                        <Lottie
                          autoPlay
                          loop={false}
                          style={{ height: 120 }}
                          source={require("@assets/animations/success.json")}
                        />
                      </ComponentStack>
                    )}
                  </>
                );
              } else {
                return (
                  <FieldContainer
                    icon={faEnvelopeOpenText}
                    title={t("yourSignatureDetails")}
                  >
                    <TextField
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      label={t("yourSignature")}
                      error={error?.message}
                      pastable
                      qrScannable
                      {...(isSignatureValid
                        ? {
                            right: isValidating ? (
                              <S.LoaderContainer>
                                <Loader size={60} />
                              </S.LoaderContainer>
                            ) : (
                              { icon: faCheck, color: theme.colors.success }
                            )
                          }
                        : {})}
                    />
                  </FieldContainer>
                );
              }
            }}
          />
        )}
      </ComponentStack>
    </>
  );
};
