import { PlaceholderPresets } from "@components/QRCamera/data";
import { useNavigate } from "@components/Router";
import { useTranslation } from "react-i18next";

export type UseScanQrProps = {
  onScan?: (value: string) => void;
};

export const useScanQr = (_: UseScanQrProps) => {
  const { t } = useTranslation(undefined, { keyPrefix: "screens.welcome" });
  const navigate = useNavigate();

  return () => {
    navigate("/qr-scanner", {
      state: {
        title: t("scanActivationQRcode"),
        placeholderPreset: PlaceholderPresets.activationQrCode
      }
    });
  };
};
