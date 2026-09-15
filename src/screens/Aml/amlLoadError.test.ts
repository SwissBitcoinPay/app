import { AxiosError, AxiosHeaders } from "axios";
import { describe, expect, it } from "@jest/globals";
import { getAmlLoadError, isValidAmlInvoiceId } from "./amlLoadError";

const axiosError = (status?: number, error?: string) =>
  new AxiosError(
    "Request failed",
    undefined,
    undefined,
    undefined,
    status
      ? {
          data: error ? { error } : {},
          status,
          statusText: "",
          headers: {},
          config: { headers: new AxiosHeaders() }
        }
      : undefined
  );

describe("isValidAmlInvoiceId", () => {
  it("accepts canonical and compact UUIDs", () => {
    expect(isValidAmlInvoiceId("00000000-0000-7000-8000-000000000000")).toBe(
      true
    );
    expect(isValidAmlInvoiceId("00000000000070008000000000000000")).toBe(true);
  });

  it("rejects missing and malformed identifiers", () => {
    expect(isValidAmlInvoiceId()).toBe(false);
    expect(isValidAmlInvoiceId("not-a-real-id")).toBe(false);
    expect(isValidAmlInvoiceId("00000000-0000-7000-8000-00000000000g")).toBe(
      false
    );
  });
});

describe("getAmlLoadError", () => {
  it.each([400, 404])("treats HTTP %i as an invalid link", (status) => {
    expect(getAmlLoadError(axiosError(status))).toBe("notFound");
  });

  it("recognizes the backend not-found reason", () => {
    expect(getAmlLoadError(axiosError(500, "aml_info_not_found"))).toBe(
      "notFound"
    );
  });

  it.each([undefined, 500, 503])(
    "treats a network or HTTP %s failure as temporary",
    (status) => {
      expect(getAmlLoadError(axiosError(status))).toBe("unavailable");
    }
  );
});
