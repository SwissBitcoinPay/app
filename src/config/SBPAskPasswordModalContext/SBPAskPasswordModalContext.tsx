import {
  ComponentStack,
  FieldDescription,
  Modal,
  TextField,
  Url,
  Text
} from "@components";
import { AccountConfigType } from "@types";
import { PropsWithChildren, createContext, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "react-native-toast-notifications";
import * as S from "./styled";
import { useIsBiometrySupported } from "@hooks";

type PartialAccountConfig = Pick<AccountConfigType, "name" | "mail">;

export type AskWordsPassword = (
  accountConfig?: PartialAccountConfig
) => Promise<string | undefined>;

type SBPAskPasswordModalContextType = {
  askPassword?: AskWordsPassword;
};

export const SBPAskPasswordModalContext =
  createContext<SBPAskPasswordModalContextType>({});

export const SBPAskPasswordModalContextProvider = ({
  children
}: PropsWithChildren) => {
  const toast = useToast();
  const { t: tRoot } = useTranslation();
  const { t } = useTranslation(undefined, { keyPrefix: "askPasswordModal" });
  const [promiseData, setPromiseData] = useState<{
    resolve: Promise<string>;
    reject: () => void;
  }>();
  const [isOpen, setIsOpen] = useState(false);
  const [value, setValue] = useState<string>();
  const [partialAccountConfig, setPartialAccountConfig] =
    useState<PartialAccountConfig>();

  const askPassword = useCallback(
    async (accountConfig?: PartialAccountConfig) => {
      if (accountConfig) {
        setPartialAccountConfig(accountConfig);
      }
      const promise = new Promise<string>((resolve, reject) => {
        setPromiseData({ resolve, reject });
      });

      setIsOpen(true);

      try {
        return await promise;
      } catch (e) {
        toast.show(t("errorGettingPassword"), { type: "error" });
      }
      setIsOpen(false);
    },
    [toast]
  );

  const onSubmit = useCallback(() => {
    if (promiseData?.resolve) {
      setIsOpen(false);
      promiseData?.resolve(value);
      setTimeout(() => {
        setValue(undefined);
      }, 500);
    }
  }, [promiseData?.resolve, value]);

  const isBiometrySupported = useIsBiometrySupported();

  return (
    <SBPAskPasswordModalContext.Provider
      value={{ askPassword: !isBiometrySupported ? askPassword : undefined }}
    >
      {children}
      {!isBiometrySupported && (
        <Modal
          title={t("enterPassword")}
          isOpen={isOpen}
          onClose={() => {
            setIsOpen(false);
            if (promiseData?.reject) {
              promiseData.reject();
            }
          }}
          submitButton={{
            type: "bitcoin",
            title: t("login"),
            onPress: onSubmit
          }}
        >
          <ComponentStack>
            {partialAccountConfig && (
              <>
                <FieldDescription isHighlighted>
                  {t("accountName")}
                </FieldDescription>
                <FieldDescription>
                  {partialAccountConfig?.name}
                </FieldDescription>
              </>
            )}
            {partialAccountConfig && (
              <>
                <FieldDescription isHighlighted>
                  {t("accountEmail")}
                </FieldDescription>
                <FieldDescription>
                  {partialAccountConfig?.mail}
                </FieldDescription>
              </>
            )}
            <TextField
              onSubmitEditing={onSubmit}
              label={t("password")}
              secureTextEntry
              textContentType="password"
              value={value}
              onChangeText={setValue}
            />
            <Url
              as={S.ForgotPasswordText}
              href="https://dashboard.swiss-bitcoin-pay.ch/reset-password"
              title={tRoot("screens.emailLogin.forgotPassword")}
            />
          </ComponentStack>
        </Modal>
      )}
    </SBPAskPasswordModalContext.Provider>
  );
};
