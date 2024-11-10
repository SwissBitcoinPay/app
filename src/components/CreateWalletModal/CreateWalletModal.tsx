import React, { ComponentProps, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@components";
import { Signer } from "bip322-js";
import { faList12 } from "@fortawesome/free-solid-svg-icons";
import {
  Control,
  UseFormSetValue,
  UseFormWatch,
  useForm
} from "react-hook-form";
import { Step1, Step2, Step3, Step4, Step5 } from "./components";
import { useToast } from "react-native-toast-notifications";
import axios from "axios";
import { AsyncStorage, sleep } from "@utils";
import {
  keyStoreMnemonicWords,
  keyStoreUserType,
  keyStoreWalletType,
  keyStoreZpub
} from "@config/settingsKeys";
import { ACCESS_CONTROL } from "react-native-keychain";
import { UserType } from "@types";
import { apiRootUrl } from "@config";
import { SignatureData } from "@components/PayoutConfig/components/BitcoinSettings/BitcoinSettings";

type CreateWalletForm = {
  words: string[];
  verifyIndexes: number[];
  zPub: string;
  firstAddress: string;
  firstAddressPrivateKey: string;
};

type CreateWalletModalProps = Omit<
  ComponentProps<typeof Modal>,
  "children" | "onClose"
> & {
  onClose: (signatureData?: SignatureData) => void;
};

export type StepProps = {
  setIsValid: (value: boolean) => void;

  onNextStep: () => void;

  control: Control<CreateWalletForm>;
  watch: UseFormWatch<CreateWalletForm>;
  setValue: UseFormSetValue<CreateWalletForm>;
};

export const CreateWalletModal = ({
  onClose,
  ...props
}: CreateWalletModalProps) => {
  const toast = useToast();
  const { t } = useTranslation(undefined, { keyPrefix: "createWalletModal" });

  const steps = useMemo<
    {
      component: React.ElementType<StepProps>;
      buttonProps?: Omit<
        ComponentProps<typeof Modal>["submitButton"],
        "onPress"
      >;
    }[]
  >(
    () => [
      {
        component: Step1,
        buttonProps: { title: t("continue") }
      },
      {
        component: Step2,
        buttonProps: { title: t("showMySeedPhrase"), icon: faList12 }
      },
      { component: Step3, buttonProps: { title: t("IwroteMyWords") } },
      { component: Step4, buttonProps: { title: t("validateWords") } },
      { component: Step5, buttonProps: { title: t("returnToForm") } }
    ],
    [t]
  );

  const { control, watch, setValue, reset } = useForm<CreateWalletForm>({
    mode: "onTouched"
  });

  const [step, setStep] = useState(0);
  const [isValid, setIsValid] = useState(true);
  const [isButtonLoading, setIsButtonLoading] = useState(false);

  const { component: Component, buttonProps = {} } = useMemo(
    () => steps[step],
    [steps, step]
  );

  const handleOnClose = useCallback(
    async (withData = false) => {
      if (withData === true) {
        setIsButtonLoading(true);
        const data = watch();

        try {
          const { data: verifyData } = await axios.post<{
            message: string;
            signAddress?: string;
          }>(`${apiRootUrl}/verify-address`, {
            depositAddress: data.zPub
          });

          const message = verifyData.message;

          const signature = Signer.sign(
            data.firstAddressPrivateKey,
            data.firstAddress,
            message
          ) as string;

          await axios.post(`${apiRootUrl}/verify-signature`, {
            message,
            signature
          });

          await AsyncStorage.setItem(
            keyStoreZpub,
            data.zPub,
            ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE
          );
          await AsyncStorage.setItem(
            keyStoreMnemonicWords,
            data.words.join(" "),
            ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE
          );
          await AsyncStorage.setItem(keyStoreUserType, UserType.Wallet);
          await AsyncStorage.setItem(keyStoreWalletType, "local");

          onClose({ zPub: data.zPub, message, signature, walletType: "local" });
        } catch (e) {
          toast.show(t("autoSignatureError"));
        }
      } else {
        onClose();
      }
      await sleep(500);
      reset();
      setStep(0);
      setIsButtonLoading(false);
    },
    [onClose, reset, t, toast, watch]
  );

  const onNextStep = useCallback(() => {
    if (step + 1 < steps.length) {
      setStep(step + 1);
    } else {
      // Steps finished
      handleOnClose(true);
    }
  }, [handleOnClose, step, steps.length]);

  return (
    <Modal
      {...props}
      onClose={handleOnClose}
      submitButton={{
        ...buttonProps,
        isLoading: isButtonLoading,
        disabled: !isValid,
        onPress: onNextStep
      }}
      noScrollView={step === 3}
    >
      <Component
        setIsValid={setIsValid}
        onNextStep={onNextStep}
        control={control}
        watch={watch}
        setValue={setValue}
      />
    </Modal>
  );
};
