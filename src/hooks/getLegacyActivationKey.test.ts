import { describe, expect, it } from "@jest/globals";
import { getLegacyActivationKey } from "./getLegacyActivationKey";

describe("getLegacyActivationKey", () => {
  it("rend la clé d'un enregistrement antérieur à la 2.7", () => {
    expect(
      getLegacyActivationKey({
        apiKey: "legacy-key",
        isAtm: false,
        name: "Caisse"
      })
    ).toBe("legacy-key");
  });

  it("ignore un enregistrement au nouveau format, même s'il porte l'alias", () => {
    expect(
      getLegacyActivationKey({ invoice_key: "invoice-key", apiKey: "alias" })
    ).toBeUndefined();
  });

  it("ignore un enregistrement sans clé exploitable", () => {
    expect(getLegacyActivationKey({})).toBeUndefined();
    expect(getLegacyActivationKey({ apiKey: "" })).toBeUndefined();
    expect(getLegacyActivationKey({ apiKey: 42 })).toBeUndefined();
    expect(getLegacyActivationKey(null)).toBeUndefined();
    expect(getLegacyActivationKey("legacy-key")).toBeUndefined();
  });

  it("reprend l'ancienne clé quand `invoice_key` est vide", () => {
    expect(
      getLegacyActivationKey({ invoice_key: "", apiKey: "legacy-key" })
    ).toBe("legacy-key");
  });
});
