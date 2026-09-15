import axios from "axios";

export type AmlLoadError = "notFound" | "unavailable";

const UUID_PATTERN =
  /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export const isValidAmlInvoiceId = (invoiceId?: string) =>
  !!invoiceId && UUID_PATTERN.test(invoiceId);

export const getAmlLoadError = (error: unknown): AmlLoadError => {
  if (!axios.isAxiosError<{ error?: string }>(error)) {
    return "unavailable";
  }

  const status = error.response?.status;
  const reason = error.response?.data?.error;

  return status === 400 || status === 404 || reason === "aml_info_not_found"
    ? "notFound"
    : "unavailable";
};
