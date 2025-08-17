import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { bech32 } from "bech32";
import axios from "axios";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate, useLocation } from "@components/Router";
import { Pie } from "react-native-progress";
import useWebSocket, { ReadyState } from "react-use-websocket";
import {
  Loader,
  BitcoinIcon,
  Button,
  Text,
  BitcoinLoader,
  ComponentStack,
  Icon,
  QR,
  CountdownCircleTimer,
  Pressable,
  Modal,
  View,
  Blur,
  Image
} from "@components";
import {
  faArrowLeft,
  faArrowUpRightFromSquare,
  faBolt,
  faCheck,
  faCircleDown,
  faClock,
  faFileDownload,
  faGlobe,
  faHandPointer,
  faIdCard,
  faPen,
  faPrint,
  faQrcode,
  faWallet
} from "@fortawesome/free-solid-svg-icons";
import { useToast } from "react-native-toast-notifications";
import { faBitcoin } from "@fortawesome/free-brands-svg-icons";
import { platform } from "../../config/platform";
import {
  useIsScreenSizeMin,
  useNfc,
  useSafeAreaInsets,
  useTimer,
  useVersionTag,
  usePrintInvoiceTicket
} from "@hooks";
import { ActivityIndicator, Vibration } from "react-native";
import { useTheme } from "styled-components";
import { FooterLine } from "./components/FooterLine";
import {
  DEFAULT_DECIMALS,
  apiRootDomain,
  apiRootUrl,
  appRootUrl,
  currencies,
  rateUpdateDelay
} from "@config";
import LottieView from "lottie-react-native";
import * as S from "./styled";
import { XOR } from "ts-essentials";
import {
  numberWithSpaces,
  Linking,
  getFormattedUnit,
  isApiError,
  AsyncStorage,
  formatSecondsToMMSS
} from "@utils";
import {
  keyStoreTicketsAutoPrint,
  keyStoreTransactionsHistory
} from "@config/settingsKeys";
import { useSpring, easings } from "@react-spring/native";
import { useSafeAreaFrame } from "react-native-safe-area-context";
import { AmlInfoStatus } from "@screens/Aml/components/AmlStatus/AmlStatus";

const getTrue = () => true;

const { springAnimationDelay, isWeb, isIos, isBitcoinize } = platform;

type Status =
  | "draft"
  | "open"
  | "unconfirmed"
  | "underpaid"
  | "settled"
  | "canceled"
  | "expired"
  | "reserved"
  | "paying";

type OnchainTx = {
  network: "onchain";
  address: string;
  txId?: string;
  amount?: number;
  vout_index?: number;
  confirmations?: number;
  minConfirmations?: number;
};

type PaymentDetail = XOR<
  {
    network: "lightning";
    paymentRequest: string;
    hash: string;
    preimage?: string;
  },
  OnchainTx
> & {
  amount?: number;
  paidAt?: number;
};

type FiatUnits = (typeof currencies)[number]["value"];

type Input = {
  unit: FiatUnits;
  amount: number;
};

type Device = {
  name: string;
  type: "mobile" | "tablet" | "desktop";
};

export type InvoiceType = {
  id: string;
  merchantName: string;
  tag: string;
  title: string;
  createdAt: number;
  description: string;
  expiry: number;
  delay: number;
  amount: number;
  grossAmount?: number;
  status: Status;
  paidAt: number;

  input: Input;
  paymentDetails: PaymentDetail[];
  device?: Device;
  redirectAfterPaid?: `http://${string}`;
  amlInfoStatus?: AmlInfoStatus;
};

const truncate = (str: string, length: number, separator = "...") => {
  const pad = Math.round(length - separator.length) / 2;
  const start = str.substr(0, pad);
  const end = str.substr(str.length - pad);

  return [start, separator, end].join("");
};

const formatDecimalComponents = (input: number) => {
  const divisor = 100000000;
  const whole = Math.floor(input / divisor);
  const decimal = (input % divisor).toString().padStart(8, "0");

  const formattedDecimal =
    decimal.slice(0, 2) + " " + decimal.slice(2, 5) + " " + decimal.slice(5);

  const result = [...whole.toString(), ".", ...formattedDecimal].map((char) =>
    char === " " ? " " : isNaN(char) ? char : Number(char)
  );

  return result;
};

const TEXT_ICON_SIZE = 16;
const STATUS_ICON_SIZE = 120;
const MAX_QR_SIZE = 320;
const FOOTER_VALUE_ITEMS_SIZE = 18;

const REDIRECT_DELAY = 60 * 1000;

export const Invoice = () => {
  const navigate = useNavigate();
  const { colors, gridSize } = useTheme();
  const toast = useToast();
  const versionTag = useVersionTag();
  const printInvoiceTicket = usePrintInvoiceTicket();
  const { t, i18n } = useTranslation(undefined, {
    keyPrefix: "screens.invoice"
  });
  const { t: tRoot } = useTranslation();
  const { bottom: bottomInset } = useSafeAreaInsets();
  const { width: frameWidth, height: frameHeight } = useSafeAreaFrame();
  const params = useParams<{ id: string }>();
  const location = useLocation<{ isLocalInvoice?: boolean }>();
  const isLarge = useIsScreenSizeMin("large");
  const {
    isNfcAvailable,
    isNfcLoading,
    isNfcNeedsTap,
    isNfcNeedsPermission,
    setupNfc,
    readingNfcLoop
  } = useNfc();

  const invoiceId = useMemo(() => params.id || "loading", [params.id]);

  const isExternalInvoice = useMemo(
    () => !location?.state?.isLocalInvoice,
    [location.state]
  );

  const [isInit, setIsInit] = useState(false);
  const [title, setTitle] = useState<string>();
  const [description, setDescription] = useState<string>();
  const [createdAt, setCreatedAt] = useState<number>();
  const [delay, setDelay] = useState<number>();
  const [amount, setAmount] = useState<number>();
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetail[]>();
  const [pr, setPr] = useState<string>();
  const [onChainAddr, setOnChainAddr] = useState<string>();
  const [invoiceCurrency, setInvoiceCurrency] = useState<string>();
  const [device, setDevice] = useState<Device>();
  const [amlDecision, setAmlDescision] = useState(true);
  const [invoiceFiatAmount, setInvoiceFiatAmount] = useState(0);
  const [isInvalidInvoice, setIsInvalidInvoice] = useState(false);
  const [redirectAfterPaid, setRedirectAfterPaid] =
    useState<`http://${string}`>();
  const [readingNfcData, setReadingNfcData] =
    useState<Parameters<typeof readingNfcLoop>[0]>();

  const [isInitialPaid, setIsInitialPaid] = useState(false);
  const [isTimerPaused, setIsTimerPaused] = useState(false);

  const [progress, setProgress] = useState<number>(1);
  const [updateRateTime, setUpdateRateTime] = useState<number>(rateUpdateDelay);

  const updateProgressAndUpdateRateTime = useCallback(() => {
    const now = Math.round(Date.now() / 1000);
    const timeElapsed = now - (createdAt || 0);
    const newProgress = timeElapsed / (delay || 1);
    setProgress(1 - newProgress);

    const remainder = timeElapsed % rateUpdateDelay;
    setUpdateRateTime(remainder === 0 ? 0 : rateUpdateDelay - remainder);
  }, [createdAt, delay]);

  useEffect(() => {
    if (isInit && !isTimerPaused) {
      updateProgressAndUpdateRateTime();
      const intervalId = setInterval(() => {
        updateProgressAndUpdateRateTime();
      }, 1000);

      return () => {
        clearInterval(intervalId);
      };
    }
  }, [isInit, isTimerPaused, updateProgressAndUpdateRateTime]);

  // Paid data
  const [status, setStatus] = useState<Status>("draft");
  const [paymentMethod, setPaymentMethod] = useState<"onchain" | "lightning">();
  const [paidAt, setPaidAt] = useState<number>();

  // Onchain data
  const [onChainTxs, setOnchainTxs] = useState<OnchainTx[]>();

  const isAlive = useMemo(
    () => !["settled", "expired", "unconfirmed"].includes(status),
    [status]
  );

  const timer = useTimer({ createdAt, delay, stop: !isAlive || isTimerPaused });

  const isWithdraw = useMemo(
    () => invoiceId?.startsWith("LNURL") || false,
    [invoiceId]
  );

  const isInvoiceLoading = useMemo(() => invoiceId === "loading", [invoiceId]);

  const { sendJsonMessage, lastJsonMessage, readyState } =
    useWebSocket<InvoiceType>(
      `wss://${apiRootDomain}/invoice`,
      {
        shouldReconnect: getTrue
      },
      !isWithdraw && !isInvoiceLoading
    );

  const loadingMessage = useMemo(
    () =>
      invoiceId === "loading"
        ? t("creatingInvoice")
        : !isInit
          ? t("fetchingInvoice")
          : null,
    [invoiceId, t, isInit]
  );

  useEffect(() => {
    if (readyState === ReadyState.CONNECTING) {
      sendJsonMessage({ id: invoiceId });
    }
  }, [readyState]);

  const unitDecimals = useMemo(() => {
    return (
      currencies.find((c) => c.value === invoiceCurrency)?.decimals ??
      DEFAULT_DECIMALS
    );
  }, [invoiceCurrency]);

  const getFiatSatAmountComponent = useCallback(
    (isSuccessScreen = false) => {
      const elements = formatDecimalComponents((amount || 0) / 1000).reduce(
        (result, v) => {
          const currentIsEnabled =
            result[result.length - 1]?.isEnabled ||
            (typeof v === "number" && v !== 0);
          return [
            ...result,
            {
              value: v,
              isEnabled: currentIsEnabled
            }
          ];
        },
        [] as { value: string | number; isEnabled: boolean }[]
      );

      const isSatBtcInvoice =
        invoiceCurrency && ["sat", "BTC"].includes(invoiceCurrency);

      return (
        <>
          <S.AmountText>
            {!isSatBtcInvoice &&
              getFormattedUnit(
                invoiceFiatAmount,
                invoiceCurrency || "",
                unitDecimals
              )}
          </S.AmountText>
          {isAlive && (
            <S.BtcSatsContainer
              style={{ transform: [{ scale: isSatBtcInvoice ? 1.5 : 1 }] }}
              gapSize={8}
              direction="horizontal"
            >
              <BitcoinIcon size={20} />
              <>
                {elements.map((element) => (
                  <Text
                    weight={700}
                    h4
                    color={
                      element.isEnabled
                        ? colors.white
                        : isSuccessScreen
                          ? colors.successLight
                          : colors.grey
                    }
                  >
                    {element.value}
                  </Text>
                ))}
              </>
              <S.AmountText subAmount>sats</S.AmountText>
            </S.BtcSatsContainer>
          )}
          {isExternalInvoice &&
            createdAt &&
            delay &&
            isAlive &&
            delay > rateUpdateDelay && (
              <ComponentStack
                direction="horizontal"
                gapSize={4}
                style={{ marginTop: 6 }}
              >
                <Text color={colors.grey} h6 weight={600}>
                  {t("rateUpdatedIn")} {formatSecondsToMMSS(updateRateTime)}
                </Text>
                <Pie
                  useNativeDriver
                  progress={updateRateTime / rateUpdateDelay}
                  color={colors.primaryLight}
                  size={14}
                  unfilledColor="transparent"
                  animationType="spring"
                  style={{ position: "relative", top: -1 }}
                />
              </ComponentStack>
            )}
        </>
      );
    },
    [
      invoiceFiatAmount,
      invoiceCurrency,
      unitDecimals,
      amount,
      isExternalInvoice,
      createdAt,
      delay,
      isAlive,
      colors.grey,
      colors.primaryLight,
      t,
      updateRateTime
    ]
  );

  const successLottieRef = useRef<LottieView>(null);

  const [greenCircleProps, greenCircleApi] = useSpring(
    () => ({
      from: { width: 0, height: 0 }
    }),
    []
  );

  const [redirectProgressProps, redirectProgressApi] = useSpring(
    () => ({
      from: { left: "-100%" }
    }),
    []
  );

  const [toTerminalTimeout, setToTerminalTimeout] = useState<NodeJS.Timeout>();

  const onFullScreenPaid = useCallback(
    (invoiceData: InvoiceType) => {
      Vibration.vibrate(50);

      setIsQrModalOpen(false);
      setIsTimerPaused(true);
      successLottieRef.current?.reset();
      const maxSize = frameWidth > frameHeight ? frameWidth : frameHeight;
      const circleSize = Math.round(maxSize * 1.55);
      if (isBitcoinize) {
        AsyncStorage.getItem(keyStoreTicketsAutoPrint).then((value) => {
          if (value === "true") {
            void printInvoiceTicket(invoiceData);
          }
        });
      }

      greenCircleApi.start({
        to: { width: circleSize, height: circleSize },
        config: { duration: 800, easing: easings.easeOutQuad },
        delay: springAnimationDelay
      });

      redirectProgressApi.start({
        to: { left: "0%" },
        config: { duration: REDIRECT_DELAY }
      });

      setToTerminalTimeout(
        setTimeout(() => {
          redirect?.();
        }, REDIRECT_DELAY)
      );

      setTimeout(() => {
        successLottieRef.current?.play();
      }, 200);
    },
    [
      frameWidth,
      frameHeight,
      greenCircleApi,
      redirectProgressApi,
      printInvoiceTicket,
      redirect
    ]
  );

  const onPaid = useCallback(() => {
    setTimeout(() => {
      successLottieRef.current?.play();
    }, 0);
  }, [successLottieRef]);

  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    (async () => {
      if (isWithdraw) {
        try {
          const { words: dataPart } = bech32.decode(invoiceId || "", 2000);
          const requestByteArray = bech32.fromWords(dataPart);
          const lnurl = Buffer.from(requestByteArray).toString();

          const { data: lnurlData } = await axios.get<{
            defaultDescription: string;
            maxWithdrawable: number;
            callback: string;
            k1: string;
          }>(lnurl);

          const { unit, decimalFiat, customNote } = (location.state || {}) as {
            unit: string;
            decimalFiat: number;
            customNote: string;
          };

          const withdrawAmount = lnurlData.maxWithdrawable;
          setPr(invoiceId || "");
          setTitle(lnurlData.defaultDescription);
          setDescription(customNote);
          setInvoiceFiatAmount(decimalFiat);
          setInvoiceCurrency(unit);
          setAmount(withdrawAmount);
          setIsInit(true);
          const readData = {
            callback: lnurlData.callback,
            k1: lnurlData.k1,
            title: `${lnurlData.defaultDescription || ""}${
              customNote ? `- ${customNote}` : ""
            }`,
            amount: withdrawAmount * 1000
          };
          setReadingNfcData(readData);
          if (!isNfcNeedsTap) {
            void readingNfcLoop(readData);
          }

          intervalId = setInterval(async () => {
            try {
              const { data } = await axios.get(lnurl);

              if (data.status === "settled") {
                clearInterval(intervalId);
                setStatus("settled");
                onPaid();
              }
            } catch (_e) {}
          }, 2 * 1000);
        } catch (e) {
          navigate("/");
          if (isApiError(e)) {
            toast.show(e?.response?.data.reason || tRoot("errors.unknown"), {
              type: "error"
            });
          }
        }
      }
    })();

    return () => {
      clearInterval(intervalId);
    };
  }, [isNfcAvailable, readingNfcLoop, invoiceId]);

  const btcAmount = useMemo(() => (amount || 0) / 1000 / 100000000, [amount]);

  const updateInvoice = useCallback(
    (getInvoiceData: InvoiceType, isInitialData?: boolean) => {
      try {
        const _amlStatus = getInvoiceData.amlInfoStatus;
        const _amlDecision = !_amlStatus || _amlStatus === "accepted";
        setAmlDescision(_amlDecision);
        if (isExternalInvoice && !_amlDecision) {
          navigate(`/aml/${invoiceId}`);
          return;
        }

        const lightningPayments = getInvoiceData.paymentDetails.filter(
          (p) => p.network === "lightning"
        );

        const onchainPayments = getInvoiceData.paymentDetails.filter(
          (p) => p.network === "onchain"
        );

        const lightningPaymentDetails =
          lightningPayments.find((p) => !!p.paidAt) || lightningPayments[0];

        const _pr = lightningPaymentDetails?.paymentRequest;

        const unpaidOnchain = onchainPayments.find((p) => !p.paidAt);

        const _paymentMethod = getInvoiceData.paymentDetails.find(
          (p) => p.paidAt
        )?.network;

        if (getInvoiceData.redirectAfterPaid) {
          setRedirectAfterPaid(
            getInvoiceData.redirectAfterPaid.includes("://")
              ? getInvoiceData.redirectAfterPaid
              : `http://${getInvoiceData.redirectAfterPaid}`
          );
        }

        if (getInvoiceData.description) {
          // don't remove description if it already stored
          setDescription(getInvoiceData.description);
        }

        const amountInSats = Math.round(getInvoiceData.amount * 1000);

        setAmount(amountInSats);
        setPaidAt(getInvoiceData.paidAt);
        setInvoiceCurrency(getInvoiceData.input.unit || "CHF");
        setInvoiceFiatAmount(getInvoiceData.input.amount);
        setPaymentDetails(getInvoiceData.paymentDetails);
        setDevice(getInvoiceData.device);

        if (
          getInvoiceData.status === "settled" &&
          status !== "settled" &&
          !isExternalInvoice
        ) {
          onFullScreenPaid({ ...getInvoiceData, amount: amountInSats });
          AsyncStorage.getItem(keyStoreTransactionsHistory).then(
            (transactionsHistory = "[]") => {
              let localTransactionsHistory: InvoiceType[] =
                JSON.parse(transactionsHistory);

              const invoiceIndex = localTransactionsHistory.findIndex(
                (i) => i.id === getInvoiceData.id
              );

              if (~invoiceIndex) {
                localTransactionsHistory[invoiceIndex] = getInvoiceData;
              }

              AsyncStorage.setItem(
                keyStoreTransactionsHistory,
                JSON.stringify(localTransactionsHistory)
              );
            }
          );

          return;
        }

        setTitle(getInvoiceData.title);
        setCreatedAt(getInvoiceData.createdAt);
        setDelay(getInvoiceData.delay);
        setPr(_pr);
        setReadingNfcData(_pr);
        setOnChainAddr(unpaidOnchain?.address);
        setStatus(getInvoiceData.status);
        setPaymentMethod(_paymentMethod);
        setOnchainTxs(onchainPayments.filter((p) => !!p.paidAt));

        setIsInit(true);

        if (status === "settled" && isInitialData) {
          setIsInitialPaid(true);
        }

        if (status === "expired") {
          return;
        }
      } catch (e) {
        setIsInvalidInvoice(true);
        return;
      }
    },
    [status, isExternalInvoice, navigate, invoiceId, onFullScreenPaid]
  );

  const [isInitial, setIsInitial] = useState(true);

  useEffect(() => {
    if (lastJsonMessage && !isWithdraw) {
      updateInvoice(lastJsonMessage, isInitial);
      if (isInitial) {
        setIsInitial(false);
      }
    }
  }, [lastJsonMessage, isWithdraw]);

  useEffect(() => {
    if (amlDecision) {
      setupNfc();
    }
  }, [amlDecision]);

  useEffect(() => {
    if (isNfcAvailable && pr && !isNfcNeedsTap && !isWithdraw && amlDecision) {
      void readingNfcLoop(pr);
    }
  }, [isNfcAvailable, pr, readingNfcLoop]);

  const { bitcoinBase, fullUrl } = useMemo(() => {
    if (amlDecision) {
      const _bitcoinBase = onChainAddr
        ? `bitcoin:${onChainAddr}?amount=${
            btcAmount.toFixed(8) || ""
          }&label=${encodeURIComponent(title || "")}${description ? `&message=${encodeURIComponent(description)}` : ""}`
        : undefined;

      const _fullUrl: `bitcoin:${string}` | `lightning:${string}` = _bitcoinBase
        ? `${_bitcoinBase}${pr ? `&lightning=${pr}` : ""}`
        : pr
          ? `lightning:${pr || ""}`
          : "";

      return { bitcoinBase: _bitcoinBase, fullUrl: _fullUrl };
    } else {
      return { bitcoinBase: "", fullUrl: `${appRootUrl}/aml/${invoiceId}` };
    }
  }, [amlDecision, onChainAddr, btcAmount, title, description, pr, invoiceId]);

  const [openWalletUrl, setOpenWalletUrl] = useState<string | null>();

  useEffect(() => {
    if (fullUrl && isExternalInvoice) {
      (async () => {
        if (await Linking.canOpenURL(fullUrl)) {
          setOpenWalletUrl(fullUrl);
        } else if (bitcoinBase && (await Linking.canOpenURL(bitcoinBase))) {
          setOpenWalletUrl(bitcoinBase);
        } else {
          setOpenWalletUrl(null);
        }
      })();
    }
  }, [fullUrl, bitcoinBase, isExternalInvoice]);

  const qrCodeSize = useMemo(() => {
    const size = isLarge ? MAX_QR_SIZE : frameWidth - gridSize * 3.5;
    return size > MAX_QR_SIZE ? MAX_QR_SIZE : size;
  }, [isLarge, frameWidth, gridSize]);

  const isLoading = useMemo(
    () => isInvalidInvoice || !isInit,
    [isInit, isInvalidInvoice]
  );

  const redirect = useMemo(() => {
    if (!isExternalInvoice) {
      return () => {
        if (toTerminalTimeout) {
          clearTimeout(toTerminalTimeout);
        }
        navigate("/");
      };
    } else if (redirectAfterPaid) {
      return () => {
        void Linking.openURL(redirectAfterPaid);
      };
    }
  }, [isExternalInvoice, navigate, redirectAfterPaid, toTerminalTimeout]);

  const alreadyPaidAmount = useMemo(
    () => onChainTxs?.reduce((result, o) => result + (o.amount || 0), 0) || 0,
    [onChainTxs]
  );

  const { confirmations, minConfirmations } = useMemo(
    () =>
      (onChainTxs || []).reduce(
        (result, o) => (o.confirmations < result.confirmations ? o : result),
        { confirmations: 100, minConfirmations: 0 }
      ),
    [onChainTxs]
  );

  const [isQrModalOpen, setIsQrModalOpen] = useState(false);

  const onOpenQrModal = useCallback(() => {
    setIsQrModalOpen(true);
  }, []);

  const onCloseQrModal = useCallback(() => {
    setIsQrModalOpen(false);
  }, []);

  const printReceipt = useCallback(() => {
    void printInvoiceTicket({
      id: invoiceId,
      description: description,
      amount: amount,
      paidAt: paidAt,
      input: {
        unit: invoiceCurrency,
        amount: invoiceFiatAmount
      },
      paymentDetails,
      device
    });
  }, [
    amount,
    description,
    device,
    invoiceCurrency,
    invoiceFiatAmount,
    invoiceId,
    paidAt,
    paymentDetails,
    printInvoiceTicket
  ]);

  const downloadPdfLink = useMemo(
    () =>
      `${apiRootUrl}/pdf/${invoiceId}?tz=${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
    [invoiceId]
  );

  const getPageContainerProps = useCallback(
    (isSuccessScreen = false) => {
      return {
        header: {
          title: title || "",
          ...(description
            ? {
                subTitle: {
                  icon: faPen,
                  text: description || "",
                  color: isSuccessScreen ? colors.white : undefined
                }
              }
            : {}),
          ...(!isSuccessScreen && location.key !== "default"
            ? {
                left: {
                  onPress: -1,
                  icon: faArrowLeft
                }
              }
            : {}),
          ...(!isInvoiceLoading && !isSuccessScreen
            ? {
                right: {
                  onPress: onOpenQrModal,
                  icon: faQrcode
                }
              }
            : {}),
          backgroundOpacity: 0,
          ...(isSuccessScreen ? { blurRadius: 0 } : {})
        },
        isLoading
      };
    },
    [
      title,
      description,
      colors.white,
      location.key,
      isInvoiceLoading,
      onOpenQrModal,
      isLoading
    ]
  );

  const mainContentStackSize = useMemo(
    () => qrCodeSize + gridSize * 1.25,
    [qrCodeSize, gridSize]
  );

  const redirectDuration = useMemo(() => {
    if (!isExternalInvoice) {
      return REDIRECT_DELAY / 1000;
    }
    return 7;
  }, [isExternalInvoice]);

  return (
    <>
      <Modal
        isOpen={isQrModalOpen}
        title={t("invoiceQrTitle")}
        onClose={onCloseQrModal}
      >
        <ComponentStack>
          <S.InvoiceQR
            value={`${appRootUrl}/invoice/${invoiceId}`}
            size={200}
          />
          <Text h4 weight={600} centered color={colors.white}>
            {t("invoiceQr")}
          </Text>
        </ComponentStack>
      </Modal>
      <S.PaidInvoicePageContainerWrapper style={greenCircleProps}>
        <S.PaidInvoicePageContainer
          style={{ width: frameWidth, height: frameHeight }}
        >
          <S.InvoicePageContainer {...getPageContainerProps(true)}>
            <S.SectionsContainer gapSize={2}>
              {!isWithdraw && (
                <S.InvoiceDownloadContainer isLarge={isLarge}>
                  <QR
                    value={downloadPdfLink}
                    size={S.INVOICE_DOWNLOAD_QR}
                    icon={faCircleDown}
                    ecl="M"
                    backgroundColor={colors.white}
                    logoBackgroundColor={colors.white}
                    color={colors.success}
                    logoColor={colors.success}
                  />
                  <Text centered weight={600} color={colors.success} h4>
                    {t("receipt")}
                  </Text>
                </S.InvoiceDownloadContainer>
              )}
              <S.Section grow>
                <>
                  <S.TypeText color="transparent">_</S.TypeText>
                  <S.TypeText color="transparent">_</S.TypeText>
                </>
                <S.MainContentStack
                  size={mainContentStackSize}
                  borderColor="transparent"
                >
                  <S.SuccessLottie
                    ref={successLottieRef}
                    loop={false}
                    source={require("@assets/animations/success.json")}
                    size={STATUS_ICON_SIZE}
                  />
                  <Text h3 weight={700} color={colors.white}>
                    {!isWithdraw ? t("invoicePaid") : t("withdrawSuccess")}
                  </Text>
                </S.MainContentStack>
                {getFiatSatAmountComponent(true)}
              </S.Section>
            </S.SectionsContainer>
          </S.InvoicePageContainer>
          <S.TapAnywhereCatcher
            onPress={redirect}
            style={{ paddingBottom: gridSize + bottomInset }}
          >
            <S.TapAnywhereStack>
              <Button
                icon={faHandPointer}
                mode="outline"
                size="large"
                title={t("tapAnywhereToSkip")}
                onPress={redirect}
                android_ripple={null}
              >
                <S.ProgressToTerminal style={redirectProgressProps} />
              </Button>
              {isBitcoinize && (
                <Button
                  icon={faPrint}
                  mode="normal"
                  noShadow
                  size="large"
                  title={t("printReceipt")}
                  onPress={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    printReceipt();
                  }}
                />
              )}
            </S.TapAnywhereStack>
          </S.TapAnywhereCatcher>
        </S.PaidInvoicePageContainer>
      </S.PaidInvoicePageContainerWrapper>
      <S.InvoicePageContainer {...getPageContainerProps(false)}>
        {isLoading ? (
          <>
            {isInvalidInvoice ? <></> : <BitcoinLoader />}
            <S.LoaderText>
              {isInvalidInvoice ? t("invalidInvoiceId") : loadingMessage}
            </S.LoaderText>
          </>
        ) : (
          <S.SectionsContainer gapSize={2} gapColor={colors.grey}>
            <S.Section grow>
              {isAlive && (
                <>
                  <S.TypeText>
                    {!amlDecision && (
                      <S.PayByIcon
                        icon={faIdCard}
                        color={colors.white}
                        size={TEXT_ICON_SIZE}
                      />
                    )}
                    {t(
                      !isWithdraw
                        ? amlDecision
                          ? "scanToPayIn"
                          : "scanToVerify"
                        : "scanToWithdraw"
                    )}
                  </S.TypeText>
                  <S.TypeText>
                    {pr && (
                      <S.PayByIcon
                        icon={faBolt}
                        color={colors.lightning}
                        size={TEXT_ICON_SIZE}
                      />
                    )}
                    {pr ? "Lightning" : ""}
                    {pr && onChainAddr ? ` ${t("or")}` : ""}
                    {onChainAddr && (
                      <>
                        <S.PayByIcon>
                          <BitcoinIcon
                            size={TEXT_ICON_SIZE}
                            color={colors.bitcoin}
                          />
                        </S.PayByIcon>
                        Onchain
                      </>
                    )}
                  </S.TypeText>
                </>
              )}
              <S.MainContentStack
                size={mainContentStackSize}
                borderColor={
                  status === "settled"
                    ? "transparent"
                    : status === "unconfirmed"
                      ? colors.warning
                      : status === "expired"
                        ? colors.grey
                        : undefined
                }
              >
                {status !== "expired" &&
                  (isAlive ? (
                    <>
                      <QR
                        value={fullUrl}
                        size={qrCodeSize}
                        {...(amlDecision
                          ? {
                              image: {
                                source: require("@assets/images/bitcoin-white-border.png")
                              }
                            }
                          : {
                              icon: faGlobe
                            })}
                        ecl="M"
                      />
                      {isNfcLoading && (
                        <>
                          <Blur
                            realBlur
                            blurRadius={6}
                            backgroundColor="rgba(0, 0, 0, 0.25)"
                          />
                          <ComponentStack
                            direction="vertical"
                            gapSize={8}
                            style={{
                              position: "absolute",
                              width: "100%",
                              height: "100%",
                              alignItems: "center",
                              justifyContent: "center"
                            }}
                          >
                            <Text
                              h2
                              style={{ fontSize: 26 }}
                              color={colors.white}
                              weight={700}
                            >
                              {t("readingBoltCard")}
                            </Text>
                            <View
                              style={{
                                height: 80,
                                width: 80,
                                alignItems: "center",
                                justifyContent: "center"
                              }}
                            >
                              <Loader
                                thickness={6}
                                color={colors.white}
                                size={80}
                              />
                              <View
                                style={{
                                  position: "absolute",
                                  height: 58,
                                  width: 58,
                                  backgroundColor: colors.bitcoin,
                                  borderRadius: 100
                                }}
                              />
                              <Image
                                style={{
                                  position: "absolute",
                                  width: 52,
                                  height: 52,
                                  transform: [{ translateY: 2 }]
                                }}
                                source={require("@assets/images/bolt-card-white.png")}
                              />
                            </View>
                          </ComponentStack>
                        </>
                      )}
                    </>
                  ) : null)}
                {status === "unconfirmed" &&
                confirmations !== undefined &&
                minConfirmations ? (
                  <S.ConfirmationsCircle
                    progress={confirmations / minConfirmations}
                    borderWidth={0}
                    thickness={12}
                    unfilledColor={colors.grey}
                    color={colors.warning}
                    size={STATUS_ICON_SIZE}
                  >
                    <S.ConfirmationsText>
                      {confirmations}/{minConfirmations}
                    </S.ConfirmationsText>
                  </S.ConfirmationsCircle>
                ) : status === "expired" ? (
                  <Icon
                    icon={faClock}
                    color={colors.grey}
                    size={STATUS_ICON_SIZE}
                  />
                ) : status === "settled" ? (
                  <S.SuccessLottie
                    ref={successLottieRef}
                    autoPlay
                    speed={isInitialPaid ? 10000 : 1}
                    loop={false}
                    source={require("@assets/animations/success.json")}
                    size={STATUS_ICON_SIZE}
                  />
                ) : null}
                {!isAlive && (
                  <ComponentStack direction="horizontal" gapSize={8}>
                    {status === "unconfirmed" && (
                      <Loader color={colors.warning} />
                    )}
                    <Text
                      h3
                      weight={700}
                      color={
                        status === "unconfirmed"
                          ? colors.warning
                          : status === "settled"
                            ? colors.success
                            : status === "expired"
                              ? colors.grey
                              : colors.white
                      }
                    >
                      {status === "unconfirmed"
                        ? t("pendingConfirmations")
                        : status === "expired"
                          ? t("invoiceExpired")
                          : !isWithdraw
                            ? t("invoicePaid")
                            : t("withdrawSuccess")}
                    </Text>
                  </ComponentStack>
                )}
                {isBitcoinize && !isAlive && (
                  <Button
                    icon={faPrint}
                    mode="outline"
                    title={t("printReceipt")}
                    onPress={printReceipt}
                  />
                )}
              </S.MainContentStack>
              {status === "settled" && !isInitialPaid && redirect && (
                <ComponentStack direction="horizontal" gapSize={8}>
                  <Text h3 weight={600} color={colors.white}>
                    {t("redirectingYou")}
                  </Text>
                  <CountdownCircleTimer
                    isGrowing
                    isPlaying
                    duration={redirectDuration}
                    strokeWidth={5}
                    size={STATUS_ICON_SIZE / 4}
                    colors={colors.white}
                    trailColor={colors.grey}
                    onComplete={redirect}
                  />
                </ComponentStack>
              )}
              <>
                {(isNfcAvailable || isNfcNeedsTap) &&
                  isAlive &&
                  amlDecision && (
                    <S.NFCWrapper>
                      <S.AskButton
                        disabled={!isNfcNeedsTap}
                        isLightOpacity={isNfcNeedsPermission}
                        onPress={async () => {
                          if (isWeb) {
                            await setupNfc();
                          } else if (isIos && readingNfcData) {
                            await readingNfcLoop(readingNfcData);
                          }
                        }}
                      >
                        <S.NFCImage
                          source={
                            isNfcNeedsPermission
                              ? require("@assets/images/bolt-card-white.png")
                              : isNfcNeedsTap
                                ? require("@assets/images/bolt-card-black.png")
                                : require("@assets/images/bolt-card.png")
                          }
                        />
                        {isNfcNeedsPermission && (
                          <S.NFCSwitchContainer>
                            <S.NFCSwitchContainerCircle />
                          </S.NFCSwitchContainer>
                        )}
                        <Text
                          style={{
                            position: "absolute",
                            bottom: -10.5,
                            lineHeight: 7,
                            textAlign: "center"
                          }}
                          h9
                          weight={600}
                          color={colors.grey}
                        >
                          {t("boltcardSupported")}
                        </Text>
                      </S.AskButton>
                    </S.NFCWrapper>
                  )}
                {getFiatSatAmountComponent()}
                {alreadyPaidAmount > 0 && status === "underpaid" && (
                  <>
                    <S.BitcoinSlotText subAmount color={colors.warning}>
                      <S.BitcoinSlotImage
                        source={require("@assets/images/bitcoin-to-slot.png")}
                      />
                      {t("alreadyPaid")}: {numberWithSpaces(alreadyPaidAmount)}{" "}
                      sats
                    </S.BitcoinSlotText>
                    <S.BitcoinSlotText
                      subAmount
                      color={colors.warning}
                      style={{ marginTop: 6 }}
                    >
                      {t("payTheRest", {
                        sats: numberWithSpaces(
                          amount / 1000 - alreadyPaidAmount
                        )
                      })}
                    </S.BitcoinSlotText>
                  </>
                )}
              </>
              {status === "settled" && redirectAfterPaid && isInitialPaid && (
                <Button
                  title={t("returnToWebsite")}
                  icon={faArrowUpRightFromSquare}
                  onPress={redirectAfterPaid}
                />
              )}
              {isAlive && isExternalInvoice && (
                <ComponentStack
                  gapSize={14}
                  style={{ flex: 1, justifyContent: "flex-end" }}
                >
                  <S.ActionButton
                    style={{ flexGrow: 0 }}
                    icon={faWallet}
                    title={t(
                      openWalletUrl !== null
                        ? "openWallet"
                        : "noAvailableWallet"
                    )}
                    onPress={openWalletUrl}
                    disabled={openWalletUrl === null}
                    type="bitcoin"
                  />
                  <ComponentStack
                    direction={isLarge ? "horizontal" : "vertical"}
                    gapSize={14}
                  >
                    <S.ActionButton
                      icon={faBolt}
                      title={t("copyLightning")}
                      copyContent={pr}
                    />
                    {onChainAddr && (
                      <S.ActionButton
                        icon={faBitcoin}
                        title={t("copyBtc")}
                        copyContent={onChainAddr}
                      />
                    )}
                  </ComponentStack>
                </ComponentStack>
              )}
              {status === "settled" && !isWithdraw && (
                <View
                  style={{
                    flex: 1,
                    justifyContent: "flex-end",
                    width: "100%"
                  }}
                >
                  <Button
                    icon={faFileDownload}
                    title={t("downloadReceipt")}
                    onPress={downloadPdfLink}
                  />
                </View>
              )}
              {createdAt && delay && isAlive && !isExternalInvoice && (
                <S.ProgressBar
                  progress={progress}
                  text={timer}
                  colorConfig={{
                    10: colors.error,
                    30: colors.warning
                  }}
                />
              )}
            </S.Section>
            {(isExternalInvoice || isInitialPaid) && (
              <S.Section gapSize={3}>
                <FooterLine
                  label={t("status")}
                  {...(status === "settled"
                    ? {
                        value: tRoot("common.paid"),
                        color: colors.success,
                        prefixIcon: { icon: faCheck }
                      }
                    : status === "unconfirmed"
                      ? {
                          prefixComponent: (
                            <ActivityIndicator
                              color={colors.warning}
                              size="small"
                            />
                          ),
                          value: tRoot("common.pending"),
                          color: colors.warning
                        }
                      : status === "expired"
                        ? {
                            value: tRoot("common.expired"),
                            color: colors.greyLight
                          }
                        : {
                            value: t("awaitingPayment")
                          })}
                />
                {btcAmount && (
                  <FooterLine
                    label={t("amount")}
                    value={btcAmount.toLocaleFixed(8)}
                    valueSuffix=" BTC"
                    copyable={btcAmount.toFixed(8)}
                  />
                )}
                {isExternalInvoice && createdAt && delay && isAlive && (
                  <FooterLine
                    label={t("timeLeft")}
                    prefixComponent={<ActivityIndicator size="small" />}
                    value={timer}
                    color={colors.white}
                  />
                )}
                {status === "settled" && (
                  <FooterLine
                    label={t("paidWith")}
                    {...(paymentMethod === "onchain"
                      ? {
                          prefixComponent: (
                            <BitcoinIcon size={FOOTER_VALUE_ITEMS_SIZE} />
                          )
                        }
                      : {
                          prefixIcon: {
                            icon: faBolt,
                            color: colors.warningLight
                          }
                        })}
                    value={
                      paymentMethod === "onchain" ? "Onchain" : "Lightning"
                    }
                  />
                )}
                {paidAt && (
                  <FooterLine
                    label={t("paidOn")}
                    value={new Intl.DateTimeFormat(undefined, {
                      dateStyle: "long",
                      timeStyle: "medium"
                    })
                      .format(paidAt * 1000)
                      .toString()}
                  />
                )}
                {onChainTxs?.map((tx) => {
                  const success = tx.confirmations >= tx.minConfirmations;
                  const color = success ? colors.success : colors.warning;

                  return (
                    <>
                      {tx.txId && (
                        <FooterLine
                          label={t("transactionId")}
                          {...(success
                            ? { prefixIcon: { icon: faCheck, color } }
                            : {
                                color: color,
                                prefixComponent: <Loader size={22} />
                              })}
                          url={`https://mempool.space/tx/${tx.txId}${
                            tx.vout_index !== undefined
                              ? `#vout=${tx.vout_index}`
                              : ""
                          }`}
                          value={truncate(tx.txId, 16)}
                        />
                      )}
                    </>
                  );
                })}
              </S.Section>
            )}
          </S.SectionsContainer>
        )}
        {isLarge && !isLoading && (
          <S.PoweredContainer gapSize={6}>
            <Text h5 weight={700} color={colors.white}>
              Powered by
            </Text>
            <Pressable onPress="https://swiss-bitcoin-pay.ch">
              <S.PoweredBySBP
                source={require("@assets/images/logo-white.png")}
              />
            </Pressable>
            <Pressable onPress="https://github.com/SwissBitcoinPay/app">
              <Text weight={500} h6 color={colors.grey}>
                {versionTag}
              </Text>
            </Pressable>
          </S.PoweredContainer>
        )}
      </S.InvoicePageContainer>
    </>
  );
};
