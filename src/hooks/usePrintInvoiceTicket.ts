import { InvoiceType } from "@screens/Invoice/Invoice";
import { MarkOptional } from "ts-essentials";
import {
  NyxAlign,
  NyxFontStyle
} from "react-native-nyx-printer/src/NyxTextFormat";
import {
  AsyncStorage,
  getImageSize,
  scaleDimensions,
  base64ToBitmapArray,
  base64ToHex,
  getFormattedUnit,
  Printer,
  FS
} from "@utils";
import { keyStoreAccountConfig } from "@config/settingsKeys";
import { AccountConfigType } from "@types";
import ImageResizer from "@bam.tech/react-native-image-resizer";
import axios from "axios";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

type PrintInvoiceTicketParam = MarkOptional<
  Pick<
    InvoiceType,
    | "id"
    | "description"
    | "input"
    | "status"
    | "paymentDetails"
    | "paidAt"
    | "device"
    | "amount"
  >,
  "id"
>;

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short"
});

const shortTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "short",
  timeStyle: "short"
});

const FOOTER_VALUE_TEXT_STYLE = { align: NyxAlign.center, textSize: 20 };
const FOOTER_LABEL_TEXT_STYLE = {
  ...FOOTER_VALUE_TEXT_STYLE,
  style: NyxFontStyle.bold
};

export const usePrintInvoiceTicket = () => {
  const { t } = useTranslation(undefined, { keyPrefix: "printTicket" });

  return useCallback(
    async ({
      id,
      description,
      input,
      amount,
      paymentDetails,
      paidAt,
      device
    }: PrintInvoiceTicketParam) => {
      let accountConfig: AccountConfigType;

      try {
        accountConfig = JSON.parse(
          await AsyncStorage.getItem(keyStoreAccountConfig)
        );
        if (accountConfig.logoUrl) {
          const response = await axios.get<ArrayBuffer>(accountConfig.logoUrl, {
            responseType: "arraybuffer"
          });

          const buffer = response.data;

          const imageData = `data:image/png;base64,${Buffer.from(
            buffer
          ).toString("base64")}`;

          const { width: initialWidth, height: initialHeight } =
            await getImageSize(imageData);

          const { width: finalWidth, height: finalHeight } = scaleDimensions(
            initialWidth,
            initialHeight,
            360,
            250
          );

          const resizedImage = await ImageResizer.createResizedImage(
            imageData,
            finalWidth,
            finalHeight,
            "WEBP",
            50
          );

          const resizedImagePath = resizedImage.uri.replace("file://", "");
          const resizedBuffer = await FS.readFile(resizedImagePath, "base64");

          const inputBytes = new Uint8Array(
            Buffer.from(resizedBuffer, "base64")
          );

          await Printer.printBitmap(Array.from(inputBytes));
          await Printer.printText("");
        } else if (accountConfig.name) {
          await Printer.printText(accountConfig.name, {
            align: NyxAlign.center,
            style: NyxFontStyle.bold
          });
        }
      } catch (e) {
        console.error(e);
      }

      if (device?.name) {
        await Printer.printText(device.name, { align: NyxAlign.center });
      }

      await Printer.printText("");
      await Printer.printText(t("paidInBitcoin"), { align: NyxAlign.center });
      await Printer.printText("");

      await Printer.printLabelValue(
        t("amount"),
        `${(amount / 100000000).toFixed(8)} BTC`
      );

      if (!["BTC", "sat", undefined].includes(input.unit)) {
        await Printer.printLabelValue(
          t("fiatAmount"),
          getFormattedUnit(input.amount, input.unit)
        );
      }

      const payment = paymentDetails.find((v) => !!v.paidAt);

      await Printer.printLabelValue(
        t("paidVia"),
        payment?.network === "lightning" ? "Lightning" : "Onchain"
      );
      await Printer.printLabelValue(
        t("paidAt"),
        shortTimeFormatter.format(paidAt * 1000)
      );

      await Printer.printText("");

      if (description) {
        await Printer.printText(t("note"), FOOTER_LABEL_TEXT_STYLE);
        await Printer.printText(description, FOOTER_VALUE_TEXT_STYLE);
        await Printer.printText("");
      }

      // Footer
      const QR_SIZE = 200;
      await Printer.printQrCode(
        id
          ? `https://app.swiss-bitcoin-pay.ch/invoice/${id}`
          : "https://swiss-bitcoin-pay.ch",
        QR_SIZE,
        QR_SIZE
      );

      await Printer.printText("");
      await Printer.printText(t("invoiceId"), FOOTER_LABEL_TEXT_STYLE);
      await Printer.printText(id, FOOTER_VALUE_TEXT_STYLE);
      await Printer.printText("");

      if (payment?.hash) {
        await Printer.printText("Lightning hash", FOOTER_LABEL_TEXT_STYLE);
        await Printer.printText(
          base64ToHex(payment.hash),
          FOOTER_VALUE_TEXT_STYLE
        );
        await Printer.printText("");
      } else if (payment?.txId) {
        await Printer.printText("Onchain TXID", FOOTER_LABEL_TEXT_STYLE);
        await Printer.printText(payment.txId, FOOTER_VALUE_TEXT_STYLE);
        await Printer.printText("");
      }

      await Printer.printText(
        timeFormatter.format(new Date().getTime()),
        FOOTER_VALUE_TEXT_STYLE
      );
      await Printer.printText("");
      await Printer.printText(t("thanks"), FOOTER_VALUE_TEXT_STYLE);
      await Printer.printText("");
      await Printer.printText(t("poweredBy"), FOOTER_LABEL_TEXT_STYLE);
      await Printer.printBitmap(SBP_LOGO_BITMAP);

      await Printer.paperOut();
    },
    [t]
  );
};

const SBP_LOGO_BASE64 =
  "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";
const SBP_LOGO_BITMAP = base64ToBitmapArray(SBP_LOGO_BASE64);
