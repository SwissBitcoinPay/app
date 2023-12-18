import { useCallback, useEffect } from "react";
import { useNavigate } from "@components/Router";
import { Deeplink } from "@utils";
import { appRootUrl } from "@config";

export const useDeepLink = () => {
  const navigate = useNavigate();

  const handleDeepLinking = useCallback(async () => {
    const deepLinkHandler = (url: string) => {
      const arr = url.replace(`${appRootUrl}/`, "").split("/");
      const route = arr[0];

      if (route === "connect") {
        navigate("/", { state: { qrValue: url } });
      } else {
        navigate(`/${arr.join("/")}`);
      }
    };

    const deepLinkListener = Deeplink.addEventListener("url", (e) => {
      deepLinkHandler(e.url);
    });

    const url = await Deeplink.getInitialURL();

    if (url) {
      deepLinkHandler(url);
    }

    return () => deepLinkListener.remove();
  }, [navigate]);

  useEffect(() => {
    void handleDeepLinking();
  }, []);

  return null;
};
