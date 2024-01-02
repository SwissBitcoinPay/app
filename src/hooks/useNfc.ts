import { platform } from "@config";
import { bech32 } from "bech32";
import { useCallback, useEffect, useState } from "react";
import { NFC, isApiError } from "@utils";
import { useToast } from "react-native-toast-notifications";
import { useTranslation } from "react-i18next";
import axios from "axios";

const { isWeb, isNative, isIos, getIsNfcSupported } = platform;

export const useNfc = () => {
  const toast = useToast();
  const { t } = useTranslation();
  const [isNfcAvailable, setIsNfcAvailable] = useState(false);
  const [isNfcLoading, setIsNfcLoading] = useState(false);
  const [isNfcNeedsTap, setIsNfcNeedsTap] = useState(false);
  const [isNfcNeedsPermission, setIsNfcNeedsPermission] = useState(false);

  const setupNfc = useCallback(async () => {
    if (isIos || (await getIsNfcSupported())) {
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
          setIsNfcAvailable(true);
          setIsNfcNeedsTap(false);
          setIsNfcNeedsPermission(false);
        } else {
          setIsNfcNeedsPermission(true);
          setIsNfcNeedsTap(true);
        }
      } else if (isNative) {
        setIsNfcAvailable(true);
        setIsNfcNeedsTap(isIos);
      }
    }
  }, []);

  const readingNfcLoop = useCallback(
    async (pr: string) => {
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
          if (true) {
            const { data: cardDataResponse } = await axios.get<{
              tag: "withdrawRequest";
              callback: string;
              k1: string;
            }>(cardData);

            const { data: callbackResponseData } = await axios.get<{
              reason: { detail: string };
              status: "OK";
            }>(cardDataResponse.callback, {
              params: {
                k1: cardDataResponse.k1,
                pr
              }
            });

            debitCardData = callbackResponseData;
          } else {
            // const { data: cardRequest } = await axios.get<{ payLink?: string }>(
            //   lnHttpsRequest
            // );
            // if (!cardRequest.payLink) throw getError("Invalid tag. No payLink");
            // let finalUrl = cardRequest.payLink;
            // if (finalUrl.startsWith("lnurlp://")) {
            //   finalUrl = finalUrl.replace("lnurlp", "https");
            // }
            // const { data: finalUrlRequest } = await axios.get<{
            //   tag?: string;
            //   callback?: string;
            //   minSendable?: number;
            //   maxSendable?: number;
            //   commentAllowed?: number;
            // }>(finalUrl);
            // if (finalUrlRequest.tag !== "payRequest")
            //   throw getError("Invalid tag. tag is not payRequest");
            // if (!finalUrlRequest.callback)
            //   throw getError("Invalid tag. No callback");
            // if (
            //   !finalUrlRequest.minSendable ||
            //   finalUrlRequest.minSendable / 1000 > amount
            // )
            //   throw getError("Invalid tag. minSendable undefined or too high");
            // if (
            //   !finalUrlRequest.maxSendable ||
            //   finalUrlRequest.maxSendable / 1000 < amount
            // )
            //   throw getError("Invalid tag. maxSendable undefined or too low");
            // const fullTitle = `${title || ""}${
            //   description ? `- ${description}` : ""
            // }`;
            // const { data: callbackRequest } = await axios.get<{ pr?: string }>(
            //   `${finalUrlRequest.callback}?amount=${(amount || 0) * 1000}${
            //     (finalUrlRequest.commentAllowed || 0) >= fullTitle.length
            //       ? `&comment=${fullTitle}`
            //       : ""
            //   }`
            // );
            // if (!callbackRequest.pr) throw getError("Invalid tag. No pr defined");
            // const { data: withdrawCallbackRequest } = await axios.get<{
            //   status?: string;
            // }>(withdrawCallbackData.callback, {
            //   params: {
            //     pr: callbackRequest.pr,
            //     k1: withdrawCallbackData.k1
            //   }
            // });
            // if (withdrawCallbackRequest.status !== "OK")
            //   throw getError("Impossible to top-up card.");
            // setIsPaid(true);
            // debitCardData = withdrawCallbackRequest;
          }
        } catch (e) {
          if (isApiError(e)) {
            error = e.response.data;
          }
        }

        await NFC.stopRead();

        if (debitCardData?.status !== "OK" || error) {
          setIsNfcLoading(false);
          toast.show(error?.reason?.detail || t("errors.unknown"), {
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
