import { useNavigate } from "@components/Router";
import { useAccountConfig } from "./useAccountConfig";
import { useCallback } from "react";

export const useQrLoginScan = () => {
  const { onQrLogin } = useAccountConfig({ refresh: false });
  const navigate = useNavigate();

  const onScan = useCallback(
    async (value: string) => {
      if (await onQrLogin?.(value)) {
        navigate("/");
      }
    },
    [navigate, onQrLogin]
  );

  return onScan;
};
