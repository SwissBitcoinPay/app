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
  ConnectWalletModal,
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
import { Controller, ControllerProps, Validate } from "react-hook-form";
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
import {
  validateBitcoinAddress,
  isNewAccount as _isNewAccount,
  hardwareNames
} from "@utils";
import axios from "axios";
import { ScrollView } from "react-native";
import { faCircle } from "@fortawesome/free-regular-svg-icons";
import useWebSocket, { ReadyState } from "react-use-websocket";
import { SBPContext, apiRootUrl, platform } from "@config";
import { DescriptionLine } from "../DescriptionLine";
import {
  BitcoinFiatFormSettings,
  PayoutConfigForm,
  WalletType
} from "@components/PayoutConfig/PayoutConfig";
import * as S from "./styled";
import { faBluetooth, faUsb } from "@fortawesome/free-brands-svg-icons";
import { useToast } from "react-native-toast-notifications";
import { useIsScreenSizeMin } from "@hooks";

const { isIos } = platform;

export type SignatureData = {
  zPub: string;
  words?: string;
  message: string;
  signature: string;
  walletType: WalletType;
};

export const BitcoinSettings = ({
  setValue,
  resetField,
  watch,
  control
}: BitcoinFiatFormSettings) => {
  const isLarge = useIsScreenSizeMin("large");
  const { t } = useTranslation(undefined, {
    keyPrefix: "screens.payoutConfig"
  });
  const { t: tRoot } = useTranslation();
  const toast = useToast();
  const theme = useTheme();
  const { accountConfig } = useContext(SBPContext);

  // Address validation
  const depositAddress = watch("depositAddress");
  const btcAddressTypes = watch("btcAddressTypes");
  const nextAddresses = watch("nextAddresses");
  const finalDepositAddress = watch("finalDepositAddress");
  const walletType = watch("walletType");

  // Signature stuff
  const messageToSign = watch("messageToSign");
  const signWithAddress = watch("signWithAddress");
  const prToPay = watch("prToPay");
  const hash = watch("hash");
  const isPrPaid = watch("isPrPaid");
  const signature = watch("signature");

  const btcPercent = watch("btcPercent");

  const alreadyVerifiedAddresses = useMemo(
    () => accountConfig?.verifiedAddresses || [],
    [accountConfig?.verifiedAddresses]
  );

  const isAddressAlreadyVerified = useMemo(
    () => !!alreadyVerifiedAddresses.includes(depositAddress || ""),
    [alreadyVerifiedAddresses, depositAddress]
  );

  const isNewAccount = useMemo(
    () => _isNewAccount(accountConfig?.createdAt),
    [accountConfig?.createdAt]
  );

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
    setValue("walletType", undefined);

    resetField("signature");
    resetField("messageToSign");
    resetField("btcAddressTypes");
    resetField("nextAddresses");
    resetField("signWithAddress");
    resetField("prToPay");
    resetField("hash");
    resetField("finalDepositAddress");
    resetField("walletType");
  }, [resetField, setValue]);

  const onPressConnectWallet = useCallback(() => {
    setIsConnectWalletModalOpen(true);
  }, []);

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
            const actualDepositAddress = watch("depositAddress");
            if (
              !isNewAddressAlreadyVerified &&
              actualDepositAddress === value
            ) {
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
    [alreadyVerifiedAddresses, setValue, tRoot, watch]
  );

  const validateSignature = useCallback(
    async (value?: string | { message: string; signature: string }) => {
      if (signature === "paid") return true;
      if (value) {
        try {
          let message: string;
          let _signature: string;

          if (typeof value === "object") {
            message = value.message;
            _signature = value.signature;
          } else {
            message = messageToSign;
            _signature = value;
          }

          await axios.post(`${apiRootUrl}/verify-signature`, {
            message,
            signature: _signature
          });
          return true;
        } catch (e) {}
      }
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
  const [isConnectWalletModalOpen, setIsConnectWalletModalOpen] =
    useState(false);

  const onWalletModalsClose = useCallback<
    ComponentProps<typeof CreateWalletModal>["onClose"]
  >(
    (signatureData) => {
      if (signatureData) {
        if (signatureData.words) {
          setValue("words", signatureData.words);
        }

        setValue("walletType", signatureData.walletType);
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

  const onBitboxWalletModalClose = useCallback<
    ComponentProps<typeof CreateWalletModal>["onClose"]
  >(
    async (signatureData) => {
      setIsConnectWalletModalOpen(false);
      if (signatureData) {
        const verifySignatureData = await validateSignature(signatureData);

        if (verifySignatureData === true) {
          toast.show(
            t("hardwareConnectSuccess", {
              hardwareWallet: hardwareNames[signatureData.walletType]
            }),
            {
              type: "success"
            }
          );
        } else {
          toast.show(verifySignatureData, {
            type: "error"
          });
        }

        onWalletModalsClose(signatureData);
      }
    },
    [onWalletModalsClose, t, toast, validateSignature]
  );

  const validateDepositAddressField = useCallback<
    Validate<string, PayoutConfigForm>
  >(
    async (value = "", formValues) => {
      if (
        formValues.messageToSign ||
        Object.values(formValues.btcAddressTypes).some((v) => v)
      )
        return true;

      return await validateDepositAddress(value);
    },
    [validateDepositAddress]
  );

  const walletTypeInfoComponent = useMemo(
    () => (
      <ComponentStack
        style={{ marginTop: 8 }}
        direction="horizontal"
        gapSize={10}
      >
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
                  color={!addressTypeValue ? theme.colors.grey : color}
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
                color={!addressTypeValue ? theme.colors.grey : color}
                weight={600}
              >
                {label}
              </S.PassCheckText>
            </S.PassCheckContainer>
          );
        })}
      </ComponentStack>
    ),
    [
      btcAddressTypes.lightning,
      btcAddressTypes.onchain,
      btcAddressTypes.xpub,
      t,
      theme.colors.error,
      theme.colors.grey,
      theme.colors.primary,
      theme.colors.success,
      theme.colors.warning
    ]
  );

  const DepositAddressField = useCallback<
    ControllerProps<PayoutConfigForm, "depositAddress">["render"]
  >(
    ({ field: { onChange, value }, fieldState: { error } }) => {
      return (
        <ComponentStack gapSize={8}>
          <FieldContainer icon={faWallet} title={t("yourWallet")}>
            <TextField
              label={t("bitcoinPayoutWallet")}
              value={
                walletType === "local"
                  ? t("localWallet")
                  : walletType === "bitbox02"
                    ? "BitBox02"
                    : walletType === "ledger"
                      ? "Ledger"
                      : value
              }
              onChangeText={(newValue) => {
                if (newValue !== undefined && newValue !== null) {
                  onChange(
                    newValue.replace("bitcoin:", "").replace("lightning:", "")
                  );
                }
              }}
              autoCorrect={false}
              error={error?.type === "validate" ? error?.message : undefined}
              disabled={!!walletType}
              qrScannable
              pastable
            />
            {alreadyVerifiedAddresses.filter((address) => address !== value)
              .length > 0 && (
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
          <ComponentStack
            gapSize={8}
            direction={isLarge ? "horizontal" : "vertical"}
          >
            <Button
              title={t("createWallet")}
              type="bitcoin"
              icon={faAdd}
              onPress={() => {
                setIsCreateWalletModalOpen(true);
              }}
            />
            <Button
              title={tRoot("connectWalletModal.title")}
              icon={isIos ? faBluetooth : faUsb}
              onPress={onPressConnectWallet}
            />
          </ComponentStack>
          {!walletType && walletTypeInfoComponent}
          {!walletType && btcAddressTypes.xpub === true && (
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
                    <S.NextAddress key={nextAddr}>{nextAddr}</S.NextAddress>
                  ))}
                </S.NextAddressesContainer>
              </FieldContainer>
            </ComponentStack>
          )}
        </ComponentStack>
      );
    },
    [
      alreadyVerifiedAddresses,
      btcAddressTypes.xpub,
      isLarge,
      nextAddresses,
      onChangeDepositAddress,
      onPressConnectWallet,
      setValue,
      t,
      tRoot,
      theme.colors.white,
      walletType,
      walletTypeInfoComponent,
      watch
    ]
  );

  const SignatureField = useCallback<
    ControllerProps<PayoutConfigForm, "signature">["render"]
  >(
    ({
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
                <S.PayInvoiceText>{t("payInvoiceToCertify")}</S.PayInvoiceText>
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
    },
    [isPrPaid, messageToSign, prToPay, t, theme.colors.success]
  );

  return (
    <>
      <CreateWalletModal
        title={t("createYourBitcoinWallet")}
        isOpen={isCreateWalletModalOpen}
        onClose={onWalletModalsClose}
      />
      <ConnectWalletModal
        isOpen={isConnectWalletModalOpen}
        onClose={onBitboxWalletModalClose}
      />
      <ComponentStack>
        <ComponentStack gapSize={14}>
          <FieldDescription>💶 {t("feesDetails1")}</FieldDescription>
          <ComponentStack gapSize={2}>
            <DescriptionLine>
              <FieldDescription isHighlighted={isNewAccount}>
                {t("feesFirstYear")}
              </FieldDescription>
              <FieldDescription isHighlighted={isNewAccount}>
                0.21%
              </FieldDescription>
            </DescriptionLine>
            <DescriptionLine>
              <FieldDescription isHighlighted={!isNewAccount}>
                {t("feesAfterwards")}
              </FieldDescription>
              <FieldDescription isHighlighted={!isNewAccount}>
                1%
              </FieldDescription>
            </DescriptionLine>
          </ComponentStack>
          <FieldDescription>
            🔐 {t("receiveInBtcDescription1", { percent: btcPercent })}
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
            validate: validateDepositAddressField
          }}
          render={DepositAddressField}
        />
        {messageToSign && !prToPay && !walletType && (
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
            <FieldContainer
              icon={faKey}
              title={t("messageToSignDetails")}
              multiline
            >
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
        {!walletType && !isAddressAlreadyVerified && (
          <Controller
            name="signature"
            control={control}
            rules={{
              required: true,
              validate: validateSignature
            }}
            render={SignatureField}
          />
        )}
      </ComponentStack>
    </>
  );
};
