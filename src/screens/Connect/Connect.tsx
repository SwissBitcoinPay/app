import { useEffect } from "react";
import { appRootUrl } from "@config";
import { useLocation, useNavigate } from "@components/Router";
import { Loader } from "@components";
import { useAccountConfig } from "@hooks";

export const Connect = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { onQrLogin } = useAccountConfig({ refresh: false });

  useEffect(() => {
    if (onQrLogin) {
      (async () => {
        const finalUrl = `${appRootUrl}${pathname}`;
        if (await onQrLogin(finalUrl)) {
          navigate("/");
        }
      })();
    }
  }, [!!onQrLogin]);

  return <Loader />;
};
