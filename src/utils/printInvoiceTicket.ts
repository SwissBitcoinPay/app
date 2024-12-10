import { InvoiceType } from "@screens/Invoice/Invoice";
import { Printer } from "./Printer";
import { MarkOptional } from "ts-essentials";

export const printInvoiceTicket = ({
  id,
  amount
}: MarkOptional<Pick<InvoiceType, "id" | "amount">, "id">) => {
  if (true) {
    // Print logo
  } else {
    Printer.printText("My shop");
  }

  Printer.printText("");
  Printer.printText("");
  Printer.printLabelValue("Amount", "amount");

  // Footer
  const QR_SIZE = 180;
  Printer.printQrCode(
    id
      ? `https://app.swiss-bitcoin-pay.ch/invoice/${id}`
      : "https://swiss-bitcoin-pay.ch",
    QR_SIZE,
    QR_SIZE
  );
};
