import { compactIban, formatIban, isValidIban } from "@/lib/iban";

describe("iban", () => {
  it("accepts valid IBANs, with or without spaces and in any case", () => {
    // Example IBANs published by the respective banking associations.
    expect(isValidIban("CH93 0076 2011 6238 5295 7")).toBe(true);
    expect(isValidIban("de89370400440532013000")).toBe(true);
    expect(isValidIban("GB29 NWBK 6016 1331 9268 19")).toBe(true);
    expect(isValidIban("NO9386011117947")).toBe(true);
  });

  it("rejects wrong check digits and malformed values", () => {
    expect(isValidIban("CH94 0076 2011 6238 5295 7")).toBe(false);
    expect(isValidIban("CH93")).toBe(false);
    expect(isValidIban("")).toBe(false);
    expect(isValidIban("1234 5678 9012 3456")).toBe(false);
  });

  it("formats by groups of four", () => {
    expect(formatIban("ch9300762011623852957")).toBe("CH93 0076 2011 6238 5295 7");
    expect(compactIban(" CH93 0076 ")).toBe("CH930076");
  });
});
