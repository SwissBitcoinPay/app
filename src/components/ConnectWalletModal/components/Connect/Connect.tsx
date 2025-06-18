import { useContext } from "react";
import { useTranslation } from "react-i18next";
import { ComponentStack, Loader } from "@components";
import { platform } from "@config";
import * as ConnectStyled from "../../styled";
import { MobileBitbox } from "./MobileBitbox";
import { hardwareNames } from "@utils";
import { SBPHardwareWalletContext } from "@wallets";

const { isNative } = platform;

export const Connect = () => {
  const { t } = useTranslation(undefined, {
    keyPrefix: "connectWalletModal.connect"
  });

  const { hardwareType } = useContext(SBPHardwareWalletContext);

  return isNative && hardwareType === "bitbox02" ? (
    <MobileBitbox />
  ) : (
    <ComponentStack gapSize={10} style={{ alignItems: "center" }}>
      <ConnectStyled.Title>
        {t("title", { hardwareWallet: hardwareNames[hardwareType] })}
      </ConnectStyled.Title>
      <Loader
        reason={t("connecting", {
          hardwareWallet: hardwareNames[hardwareType]
        })}
      />
    </ComponentStack>
  );
};
