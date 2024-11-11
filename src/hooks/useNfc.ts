import { platform } from "@config";
import { bech32 } from "bech32";
import { useCallback, useEffect, useState } from "react";
import { NFC } from "@utils";
import { useToast } from "react-native-toast-notifications";
import { useTranslation } from "react-i18next";
import axios, { AxiosError } from "axios";

const { isWeb, isNative, isIos, getIsNfcSupported } = platform;

const getError = (message: string) =>
  // @ts-ignore
  new AxiosError(undefined, undefined, undefined, undefined, {
    data: { reason: message }
  });

export const useNfc = () => {
  const toast = useToast();
  const { t } = useTranslation();
  const [isNfcAvailable, setIsNfcAvailable] = useState(false);
  const [isNfcLoading, setIsNfcLoading] = useState(false);
  const [isNfcNeedsTap, setIsNfcNeedsTap] = useState(false);
  const [isNfcNeedsPermission, setIsNfcNeedsPermission] = useState(false);

  const setupNfc = useCallback(async () => {
    if (await getIsNfcSupported()) {
      try {
        await NFC.init();
      } catch (e) {}

      if (isWeb) {
        let nfcStatus = {} as PermissionStatus;

        try {
          nfcStatus = await navigator.permissions.query({
            name: "nfc" as PermissionName
          });
        } catch (e) {}

        if (nfcStatus?.state === "granted") {
          setIsNfcNeedsTap(false);
          setIsNfcNeedsPermission(false);
          setIsNfcAvailable(true);
        } else {
          setIsNfcNeedsPermission(true);
          setIsNfcNeedsTap(true);
        }
      } else if (isNative) {
        setIsNfcNeedsTap(isIos);
        setIsNfcAvailable(true);
      }
    }
  }, []);

  const readingNfcLoop = useCallback(
    async (
      pr:
        | string
        | { callback: string; k1: string; title: string; amount: number }
    ) => {
      await NFC.stopRead();

      NFC.startRead(async (nfcMessage) => {
        setIsNfcLoading(true);
        const lightingPrefix = "lightning:";
        const lnurlwPrefix = "lnurlw://";
        const lnurlEncodingPrefix = "lnurl";

        if (
          !nfcMessage.toLowerCase().startsWith(lnurlwPrefix) &&
          (nfcMessage.toLowerCase().startsWith(lightingPrefix) ||
            nfcMessage.toLowerCase().startsWith(lnurlEncodingPrefix))
        ) {
          nfcMessage = nfcMessage.toLowerCase();
        } else if (!nfcMessage.startsWith(lnurlwPrefix)) {
          toast.show(t("errors.invalidLightningTag"), {
            type: "error"
          });

          if (!isIos) {
            readingNfcLoop(pr);
          } else {
            setIsNfcAvailable(false);
          }

          setIsNfcLoading(false);
          return;
        }

        let cardData = "";

        if (nfcMessage.startsWith(lightingPrefix)) {
          nfcMessage = nfcMessage.slice(lightingPrefix.length);
        }

        if (nfcMessage.startsWith(lnurlwPrefix)) {
          nfcMessage = nfcMessage.replace("lnurlw", "https");
        }

        if (nfcMessage.startsWith(lnurlEncodingPrefix)) {
          const lnurl = nfcMessage;

          const { words: dataPart } = bech32.decode(lnurl, 2000);
          const requestByteArray = bech32.fromWords(dataPart);
          cardData = Buffer.from(requestByteArray).toString();
        } else {
          cardData = nfcMessage;
        }

        if (cardData.startsWith(lnurlwPrefix)) {
          cardData = cardData.replace("lnurlw", "https");
        }

        let debitCardData;
        let error;
        try {
          if (typeof pr === "string") {
            const { data: cardDataResponse } = await axios.get<{
              tag: "withdrawRequest";
              callback: string;
              k1: string;
            }>(cardData);

            if (cardDataResponse.tag !== "withdrawRequest") {
              throw { response: { data: cardDataResponse } };
            }

            const { data: callbackResponseData } = await axios.get<{
              reason?: string;
              status: "OK";
            }>(cardDataResponse.callback, {
              params: {
                k1: cardDataResponse.k1,
                pr
              }
            });

            debitCardData = callbackResponseData;
          } else {
            const { callback, k1, title, amount } = pr;
            const { data: cardRequest } = await axios.get<{ payLink?: string }>(
              cardData
            );
            if (!cardRequest.payLink) throw getError("Invalid tag. No payLink");
            let finalUrl = cardRequest.payLink;
            if (finalUrl.startsWith("lnurlp://")) {
              finalUrl = finalUrl.replace("lnurlp", "https");
            }
            const { data: finalUrlRequest } = await axios.get<{
              tag?: string;
              callback?: string;
              minSendable?: number;
              maxSendable?: number;
              commentAllowed?: number;
            }>(finalUrl);
            if (finalUrlRequest.tag !== "payRequest")
              throw getError("Invalid tag. tag is not payRequest");
            if (!finalUrlRequest.callback)
              throw getError("Invalid tag. No callback");
            if (
              !finalUrlRequest.minSendable ||
              finalUrlRequest.minSendable > amount
            )
              throw getError("Invalid tag. minSendable undefined or too high");
            if (
              !finalUrlRequest.maxSendable ||
              finalUrlRequest.maxSendable < amount
            )
              throw getError("Invalid tag. maxSendable undefined or too low");

            const { data: callbackRequest } = await axios.get<{ pr?: string }>(
              `${finalUrlRequest.callback}?amount=${(amount || 0) / 1000}${
                (finalUrlRequest.commentAllowed || 0) >= title.length
                  ? `&comment=${title}`
                  : ""
              }`
            );
            if (!callbackRequest.pr)
              throw getError("Invalid tag. No pr defined");
            const { data: withdrawCallbackRequest } = await axios.get<{
              status?: string;
            }>(callback, {
              params: {
                pr: callbackRequest.pr,
                k1: k1
              }
            });
            if (withdrawCallbackRequest.status !== "OK")
              throw getError("Impossible to top-up card.");
            debitCardData = withdrawCallbackRequest;
          }
        } catch (e) {
          error = e?.response?.data;
        }

        await NFC.stopRead();

        if (debitCardData?.status !== "OK" || error) {
          setIsNfcLoading(false);
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          toast.show((error || debitCardData)?.reason || t("errors.unknown"), {
            type: "error"
          });

          if (!isIos) {
            readingNfcLoop(pr);
          }
        }

        if (isIos) {
          setIsNfcAvailable(false);
          return;
        }
      });
    },
    [toast, t]
  );

  useEffect(() => {
    return () => {
      NFC.stopRead();
    };
  }, []);

  return {
    isNfcAvailable,
    isNfcLoading,
    isNfcNeedsTap,
    isNfcNeedsPermission,
    setupNfc,
    readingNfcLoop
  };
};
