import { useEffect, useState } from "react";
import { Loader } from "@components";
import { Clipboard } from "@utils";
import axios from "axios";
import { apiRootUrl } from "@config";
import { useTranslation } from "react-i18next";
import * as S from "./styled";

export type AmlInfoStatus = "draft" | "submitted" | "accepted" | "rejected";

type MessageType = {
  data: {
    status: "approved" | "rejected";
    manualStatus: "waiting" | "approved";
    autoSuspected: boolean;
    manualSuspected: boolean;
  };
};

type PayerKycProps = {
  kycId?: string;
  invoiceId: string;
  onSuccess: () => void;
};

export const PayerKyc = ({ kycId, invoiceId, onSuccess }: PayerKycProps) => {
  const [authToken, setAuthToken] = useState(kycId?.split("pending:")?.[1]);
  const { i18n } = useTranslation();

  useEffect(() => {
    if (authToken) {
      const receiveMessage = (event: MessageType) => {
        if (!event?.data) return;
        if (
          event.data.status === "approved" &&
          event.data.manualStatus === "approved" &&
          !event.data.autoSuspected &&
          !event.data.manualSuspected
        ) {
          onSuccess();
        }
      };
      window.addEventListener("message", receiveMessage);

      return () => {
        window.removeEventListener("message", receiveMessage);
      };
    } else {
      (async () => {
        try {
          const { data } = await axios.get<{ authToken: string }>(
            `${apiRootUrl}/kyc-aml-link`,
            {
              params: { invoiceId }
            }
          );
          setAuthToken(data.authToken);
        } catch (e) {}
      })();
    }
  }, [authToken]);

  return authToken ? (
    <S.PayerKycIframe
      allowFullScreen
      allow="camera"
      src={`https://ui.idenfy.com/?authToken=${authToken}&lang=${i18n.language?.split?.("-")?.[0] || "en"}`}
    />
  ) : (
    <Loader />
  );
};
