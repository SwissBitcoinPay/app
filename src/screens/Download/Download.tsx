import { useEffect } from "react";
import { platform } from "@config";
import { useNavigate } from "@components/Router";
import { Loader } from "@components";
import { Linking } from "@utils";

const { isWeb, isIos, isAndroid } = platform;

export const Download = () => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isWeb) {
      navigate("/");
    } else {
      if (isIos) {
        void Linking.openURL(
          "https://apps.apple.com/app/swiss-bitcoin-pay/id6444370155"
        );
      } else if (isAndroid) {
        void Linking.openURL(
          "https://play.google.com/store/apps/details?id=ch.swissbitcoinpay.checkout"
        );
      } else {
        navigate("/signup");
      }
    }
  }, []);

  return <Loader />;
};
