import { ComponentProps, useCallback } from "react";
import { Button, Checkbox, CheckboxField } from "@components";
import { BaseFieldProps } from "@components/BaseField";
import { useTranslation } from "react-i18next";
import { AsyncStorage } from "@utils";
import { useAccountConfig, usePrintInvoiceTicket } from "@hooks";
import { faPrint } from "@fortawesome/free-solid-svg-icons";
import { keyStoreDeviceName } from "@config/settingsKeys";

export type CheckboxEventData = {
  value: boolean;
};

type CheckboxProps = ComponentProps<typeof Checkbox>;

type PrinterFieldProps = CheckboxProps & {
  onChange?: (e: { nativeEvent: CheckboxEventData }) => void;
} & Pick<BaseFieldProps, "label" | "left" | "right" | "error" | "disabled">;

export const PrinterField = (props: PrinterFieldProps) => {
  const { t } = useTranslation(undefined, {
    keyPrefix: "screens.settings"
  });
  const printInvoiceTicket = usePrintInvoiceTicket();
  const { accountConfig } = useAccountConfig({ refresh: false });
  const testPrint = useCallback(async () => {
    const now = new Date().getTime() / 1000;

    const deviceName = await AsyncStorage.getItem(keyStoreDeviceName);

    void printInvoiceTicket({
      id: "26da573c-4316-481b-a0c8-d5e6810776e6",
      description: "2 Pizzas",
      amount: 21,
      paidAt: now,
      input: {
        unit: accountConfig?.currency,
        amount: 21
      },
      paymentDetails: [
        {
          network: "lightning",
          hash: "XrQOtHY3NRizVcam20XcqepOFBa5fCE+H2M1JM6nSUI=",
          paidAt: now
        }
      ],
      device: {
        name: deviceName
      }
    });
  }, [accountConfig?.currency, printInvoiceTicket]);

  return (
    <>
      <CheckboxField {...props} />
      <Button icon={faPrint} title={t("testPrint")} onPress={testPrint} />
    </>
  );
};
