import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
  useContext
} from "react";
import { bech32 } from "bech32";
import axios from "axios";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate, useLocation } from "@components/Router";
import useWebSocket from "react-use-websocket";
import {
  Loader,
  BitcoinIcon,
  Button,
  Text,
  BitcoinLoader,
  ComponentStack,
  Icon,
  QR,
  CircleProgress,
  Pressable,
  Modal
} from "@components";
import {
  faArrowLeft,
  faArrowUpRightFromSquare,
  faBolt,
  faCheck,
  faClock,
  faHandPointer,
  faPen,
  faQrcode,
  faWallet
} from "@fortawesome/free-solid-svg-icons";
import { useToast } from "react-native-toast-notifications";
import { faBitcoin } from "@fortawesome/free-brands-svg-icons";
import { platform } from "../../config/platform";
import { Linking, getFormattedUnit, isApiError } from "../../utils";
import {
  useIsScreenSizeMin,
  useNfc,
  useSafeAreaInsets,
  useTimer,
  useVersionTag
} from "@hooks";
import {
  ActivityIndicator,
  Vibration,
  useWindowDimensions
} from "react-native";
import { useTheme } from "styled-components";
import { FooterLine } from "./components/FooterLine";
import { SBPThemeContext, appRootUrl } from "@config";
import LottieView from "lottie-react-native";
import * as S from "./styled";

const PAID_ANIMATION_DURATION = 350;

const getTrue = () => true;

// const getError = (message: string) =>
//   new AxiosError(undefined, undefined, undefined, undefined, {
//     data: { reason: { detail: message } }
//   });

const numberWithSpaces = (nb: number) =>
  nb.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

const { isWeb, isIos } = platform;

export type InvoiceType = {
  isInit: boolean;
  title: string;
  description: string;
  createdAt: number;
  delay: number;
  pr: string;
  amount: number;
  btcAmount: string;
  unit: string;
  isPaid: boolean;
  isPending: boolean;
  isExpired: boolean;
  paymentMethod: "lightning" | "onchain";
  paidAt: number;
  hash: string;
  fiatAmount: number;
  fiatUnit: string;
  onChainAddr?: string;
  minConfirmations: number;
  confirmations: number;
  txId: string;
  redirectAfterPaid: `http://${string}`;
  extra?: {
    customNote: string;
  };
};

const truncate = (str: string, length: number, separator = "...") => {
  const pad = Math.round(length - separator.length) / 2;
  const start = str.substr(0, pad);
  const end = str.substr(str.length - pad);

  return [start, separator, end].join("");
};

const TEXT_ICON_SIZE = 16;
const STATUS_ICON_SIZE = 120;
const MAX_QR_SIZE = 320;
const FOOTER_VALUE_ITEMS_SIZE = 18;

export const Invoice = () => {
  const navigate = useNavigate();
  const { colors, gridSize } = useTheme();
  const toast = useToast();
  const versionTag = useVersionTag();
  const { t } = useTranslation(undefined, { keyPrefix: "screens.invoice" });
  const { t: tRoot } = useTranslation();
  const { bottom: bottomInset } = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { setBackgroundColor } = useContext(SBPThemeContext);
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
  const [btcAmount, setBtcAmount] = useState<string>();
  const [pr, setPr] = useState<string>();
  const [onChainAddr, setOnChainAddr] = useState<string>();
  const [invoiceCurrency, setInvoiceCurrency] = useState<string>();
  const [invoiceFiatAmount, setInvoiceFiatAmount] = useState(0);
  const [isExpired, setIsExpired] = useState(false);
  const [isInvalidInvoice, setIsInvalidInvoice] = useState(false);
  const [redirectUrl, setRedirectUrl] = useState<`http://${string}`>();
  const [extra, setExtra] = useState<InvoiceType["extra"]>();
  const [readingNfcData, setReadingNfcData] =
    useState<Parameters<typeof readingNfcLoop>[0]>();

  const [isInitialPaid, setIsInitialPaid] = useState(false);

  // Paid data
  const [isPending, setIsPending] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"onchain" | "lightning">();
  const [paidAt, setPaidAt] = useState<number>();

  // Onchain data
  const [txId, setTxId] = useState<string>();
  const [confirmations, setConfirmations] = useState<number>();
  const [minConfirmations, setMinConfirmations] = useState<number>();

  const isAlive = useMemo(
    () => !isPaid && !isExpired && !isPending,
    [isPaid, isExpired, isPending]
  );

  const timer = useTimer({ createdAt, delay, stop: !isAlive });

  const isWithdraw = useMemo(
    () => invoiceId?.startsWith("LNURL") || false,
    [invoiceId]
  );

  const isInvoiceLoading = useMemo(() => invoiceId === "loading", [invoiceId]);

  const { sendJsonMessage, lastJsonMessage } = useWebSocket<InvoiceType>(
    "wss://api.swiss-bitcoin-pay.ch/invoice",
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
    if (!isInvoiceLoading) {
      sendJsonMessage({ id: invoiceId });
    }
  }, [isInvoiceLoading]);

  const successLottieRef = useRef<LottieView>(null);

  const onPaid = useCallback(() => {
    Vibration.vibrate(50);
    setIsPaid(true);
    if (!isExternalInvoice) {
      setBackgroundColor(colors.success, PAID_ANIMATION_DURATION);
    }
    setTimeout(
      () => {
        successLottieRef.current?.play();
      },
      isExternalInvoice ? 0 : 350
    );
  }, [colors.success, isExternalInvoice, setBackgroundColor]);

  useEffect(() => {
    const fn = async () => {
      if (isNfcAvailable && isWithdraw) {
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

          const withdrawAmount = lnurlData.maxWithdrawable / 1000;
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
            amount: withdrawAmount
          };
          setReadingNfcData(readData);
          if (!isNfcNeedsTap) {
            void readingNfcLoop(readData);
          }

          const intervalId = setInterval(async () => {
            try {
              await axios.get(lnurl);
            } catch (e) {
              if (isApiError(e)) {
                if (e.response.status === 404) {
                  clearInterval(intervalId);
                  onPaid();
                }
              }
            }
          }, 2 * 1000);

          return () => {
            clearInterval(intervalId);
          };
        } catch (e) {
          navigate("/");
          if (isApiError(e)) {
            toast.show(e?.response?.data?.detail || tRoot("errors.unknown"), {
              type: "error"
            });
          }
        }
      }
    };

    void fn();
  }, [isNfcAvailable, readingNfcLoop, invoiceId]);

  const updateInvoice = useCallback(
    async (getInvoiceData: InvoiceType, isInitialData?: boolean) => {
      try {
        setIsInit(getInvoiceData.isInit);
        if (!getInvoiceData.isInit) {
          return;
        }

        setTitle(getInvoiceData.title);
        setDescription(getInvoiceData.description);
        setCreatedAt(getInvoiceData.createdAt);
        setDelay(getInvoiceData.delay);
        setPr(getInvoiceData.pr);
        setReadingNfcData(getInvoiceData.pr);
        setOnChainAddr(getInvoiceData.onChainAddr);
        setAmount(getInvoiceData.amount);
        setBtcAmount(getInvoiceData.btcAmount);
        setInvoiceCurrency(getInvoiceData.fiatUnit || "CHF");
        setInvoiceFiatAmount(getInvoiceData.fiatAmount);
        setIsPending(getInvoiceData.isPending);
        setPaymentMethod(getInvoiceData.paymentMethod);
        setTxId(getInvoiceData.txId);
        setMinConfirmations(getInvoiceData.minConfirmations);
        setConfirmations(getInvoiceData.confirmations);
        setPaidAt(getInvoiceData.paidAt);
        setIsExpired(getInvoiceData.isExpired);
        setExtra(getInvoiceData.extra);
        if (getInvoiceData.isPaid && !isPaid) {
          onPaid();
        }

        if (getInvoiceData.redirectAfterPaid) {
          setRedirectUrl(
            getInvoiceData.redirectAfterPaid.includes("://")
              ? getInvoiceData.redirectAfterPaid
              : `http://${getInvoiceData.redirectAfterPaid}`
          );
        }

        if (isInitialData) {
          if (getInvoiceData.isPaid) {
            setIsInitialPaid(true);
          }
        }

        if (getInvoiceData.isExpired) {
          return;
        }

        if (getInvoiceData.paymentMethod === "onchain") {
          try {
            const { data: txDetails } = await axios.get(
              `https://mempool.space/api/tx/${getInvoiceData.txId}`
            );
            const { data: blockHeight } = await axios.get(
              "https://mempool.space/api/blocks/tip/height"
            );
            setConfirmations(blockHeight - txDetails.status.block_height + 1);
          } catch (e) {}
        }
      } catch (e) {
        setIsInvalidInvoice(true);
        return;
      }
    },
    [isPaid, onPaid]
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
    setupNfc();
  }, []);

  useEffect(() => {
    if (isNfcAvailable && pr && !isNfcNeedsTap && !isWithdraw) {
      void readingNfcLoop(pr);
    }
  }, [isNfcAvailable, pr, readingNfcLoop]);

  const qrData = useMemo<`bitcoin:${string}` | `lightning:${string}`>(
    () =>
      onChainAddr
        ? `bitcoin:${onChainAddr}?amount=${
            btcAmount || ""
          }&label=${encodeURIComponent(title || "")}&lightning=${pr || ""}`
        : `lightning:${pr || ""}`,
    [pr, onChainAddr, btcAmount, title]
  );

  const qrCodeSize = useMemo(() => {
    const size = isLarge ? MAX_QR_SIZE : windowWidth - gridSize * 3.5;
    return size > MAX_QR_SIZE ? MAX_QR_SIZE : size;
  }, [isLarge, windowWidth, gridSize]);

  const isLoading = useMemo(
    () => isInvalidInvoice || !isInit,
    [isInit, isInvalidInvoice]
  );

  const redirect = useMemo(() => {
    if (!isExternalInvoice) {
      return () => {
        navigate("/");
        setBackgroundColor(colors.primary, 0);
      };
    } else if (redirectUrl) {
      return () => {
        void Linking.openURL(redirectUrl);
      };
    }
  }, [
    colors.primary,
    isExternalInvoice,
    navigate,
    redirectUrl,
    setBackgroundColor
  ]);

  const isFullScreenSuccess = useMemo(
    () => isPaid && !isExternalInvoice,
    [isExternalInvoice, isPaid]
  );

  const [isQrModalOpen, setIsQrModalOpen] = useState(false);

  const onOpenQrModal = useCallback(() => {
    setIsQrModalOpen(true);
  }, []);

  const onCloseQrModal = useCallback(() => {
    setIsQrModalOpen(false);
  }, []);

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
      <S.InvoicePageContainer
        header={{
          title: title || "",
          ...(description
            ? {
                subTitle: {
                  icon: extra?.customNote ? faPen : faClock,
                  text: description || "",
                  color: isPaid && !isExternalInvoice ? colors.white : undefined
                }
              }
            : {}),
          ...(!isFullScreenSuccess && !isExternalInvoice
            ? {
                left: {
                  onPress: -1,
                  icon: faArrowLeft
                }
              }
            : {}),
          ...(!isInvoiceLoading && !isFullScreenSuccess
            ? {
                right: {
                  onPress: onOpenQrModal,
                  icon: faQrcode
                }
              }
            : {}),
          backgroundOpacity: 0
        }}
        isLoading={isLoading}
      >
        {isLoading ? (
          <>
            {isInvalidInvoice ? <></> : <BitcoinLoader />}
            <S.LoaderText>
              {isInvalidInvoice ? t("invalidInvoiceId") : loadingMessage}
            </S.LoaderText>
          </>
        ) : (
          <S.SectionsContainer gapSize={2} gapColor={colors.grey}>
            <S.Section>
              {isAlive && (
                <>
                  <S.TypeText>
                    {t(!isWithdraw ? "scanToPayIn" : "scanToWithdraw")}
                  </S.TypeText>
                  <S.TypeText>
                    <S.PayByIcon
                      icon={faBolt}
                      color={colors.lightning}
                      size={TEXT_ICON_SIZE}
                    />
                    Lightning{onChainAddr ? ` ${t("or")}` : ""}
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
                size={qrCodeSize + gridSize * 1.25}
                borderColor={
                  isPaid
                    ? "transparent"
                    : isPending
                    ? colors.warning
                    : isExpired
                    ? colors.grey
                    : undefined
                }
              >
                {!isExpired &&
                  (isAlive ? (
                    <QR
                      value={qrData}
                      size={qrCodeSize}
                      image={{
                        source: require("@assets/images/bitcoin-white-border.png")
                      }}
                      ecl="M"
                    />
                  ) : null)}
                {isPending &&
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
                ) : isExpired ? (
                  <Icon
                    icon={faClock}
                    color={colors.grey}
                    size={STATUS_ICON_SIZE}
                  />
                ) : isPaid ? (
                  <S.SuccessLottie
                    ref={successLottieRef}
                    {...(isInitialPaid
                      ? {
                          autoPlay: true,
                          speed: 100
                        }
                      : {})}
                    loop={false}
                    source={require("@assets/animations/success.json")}
                    size={STATUS_ICON_SIZE}
                  />
                ) : null}
                {!isAlive && (
                  <ComponentStack direction="horizontal">
                    {isPending && <Loader color={colors.warning} />}
                    <Text
                      h3
                      weight={700}
                      color={
                        isPending
                          ? colors.warning
                          : isPaid && isExternalInvoice
                          ? colors.success
                          : isExpired
                          ? colors.grey
                          : colors.white
                      }
                    >
                      {isPending
                        ? t("pendingConfirmations")
                        : isExpired
                        ? t("invoiceExpired")
                        : !isWithdraw
                        ? t("invoicePaid")
                        : t("withdrawSuccess")}
                    </Text>
                  </ComponentStack>
                )}
              </S.MainContentStack>
              {isPaid && !isInitialPaid && redirect && (
                <ComponentStack direction="horizontal" gapSize={8}>
                  <Text h3 weight={600} color={colors.white}>
                    {t(
                      isExternalInvoice
                        ? "redirectingYou"
                        : "returningToTerminal"
                    )}
                  </Text>
                  <CircleProgress
                    isGrowing
                    isPlaying
                    duration={7}
                    strokeWidth={5}
                    size={STATUS_ICON_SIZE / 4}
                    {...(isExternalInvoice
                      ? {
                          colors: colors.white,
                          trailColor: colors.grey
                        }
                      : {
                          colors: colors.white,
                          trailColor: colors.successLight
                        })}
                    onComplete={redirect}
                  />
                </ComponentStack>
              )}
              <>
                {(isNfcAvailable || isNfcNeedsTap) && isAlive && (
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
                      {isNfcLoading ? (
                        <ActivityIndicator
                          size="large"
                          color={isNfcNeedsTap ? colors.primary : colors.white}
                        />
                      ) : (
                        <S.NFCImage
                          source={
                            isNfcNeedsPermission
                              ? require("@assets/images/bolt-card-white.png")
                              : isNfcNeedsTap
                              ? require("@assets/images/bolt-card-black.png")
                              : require("@assets/images/bolt-card.png")
                          }
                        />
                      )}
                      {isNfcNeedsPermission && (
                        <S.NFCSwitchContainer>
                          <S.NFCSwitchContainerCircle />
                        </S.NFCSwitchContainer>
                      )}
                    </S.AskButton>
                  </S.NFCWrapper>
                )}
                <S.AmountText>
                  {getFormattedUnit(
                    invoiceFiatAmount,
                    invoiceCurrency || "",
                    !invoiceFiatAmount || invoiceFiatAmount % 1 === 0 ? 0 : 2
                  )}
                </S.AmountText>
                <S.AmountText subAmount>
                  {amount ? numberWithSpaces(amount) : ""} sats
                </S.AmountText>
              </>
              {isPaid && isExternalInvoice && redirectUrl && isInitialPaid && (
                <Button
                  title={t("returnToWebsite")}
                  icon={faArrowUpRightFromSquare}
                  onPress={redirectUrl}
                />
              )}
              {isAlive && isExternalInvoice && (
                <ComponentStack gapSize={14}>
                  <S.ActionButton
                    icon={faWallet}
                    title={t("openWallet")}
                    onPress={qrData}
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
              {createdAt && delay && isAlive && !isExternalInvoice && (
                <S.ProgressBar
                  createdAt={createdAt}
                  delay={delay}
                  timer={timer}
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
                  {...(isPaid
                    ? {
                        value: tRoot("common.paid"),
                        color: colors.success,
                        prefixIcon: { icon: faCheck }
                      }
                    : isPending
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
                    : isExpired
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
                    value={btcAmount}
                    valueSuffix=" BTC"
                    copyable
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
                {isPaid && (
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
                {txId && (
                  <FooterLine
                    label={t("transactionId")}
                    url={`https://mempool.space/tx/${txId}`}
                    value={truncate(txId, 16)}
                  />
                )}
                {confirmations !== undefined && (
                  <FooterLine
                    label={t("confirmations")}
                    value={confirmations.toString()}
                    {...(isPending ? { color: colors.warning } : {})}
                  />
                )}
              </S.Section>
            )}
          </S.SectionsContainer>
        )}
        {isExternalInvoice && !isLoading && (
          <S.PoweredContainer gapSize={6}>
            <Text h5 weight={700} color={colors.white}>
              Powered by
            </Text>
            <Pressable onPress="https://swiss-bitcoin-pay.ch">
              <S.PoweredBySBP
                source={require("@assets/images/logo-white.png")}
              />
            </Pressable>
            <Text weight={500} h6 color={colors.grey}>
              {versionTag}
            </Text>
          </S.PoweredContainer>
        )}
      </S.InvoicePageContainer>
      {isFullScreenSuccess && (
        <S.TapAnywhereCatcher
          onPress={redirect}
          style={{ paddingBottom: gridSize + bottomInset }}
        >
          <S.TapAnywhereStack gapSize={40}>
            <S.TapAnywhereAction direction="horizontal" gapSize={12}>
              <Icon icon={faHandPointer} color={colors.white} size={24} />
              <Text weight={600} color={colors.white}>
                {t("tapAnywhereToSkip")}
              </Text>
            </S.TapAnywhereAction>
          </S.TapAnywhereStack>
        </S.TapAnywhereCatcher>
      )}
    </>
  );
};
