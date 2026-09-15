import { describe, expect, it } from "@jest/globals";
import {
  getAccountApiAuth,
  getAccountRefreshApiKey
} from "./getAccountApiAuth";

describe("getAccountApiAuth", () => {
  it("force la validation avec la clé du lien d'activation", () => {
    expect(getAccountApiAuth("not-a-valid-activation-code")).toEqual({
      apiKey: "not-a-valid-activation-code"
    });
  });

  it("laisse le client utiliser la session JWT sans clé explicite", () => {
    expect(getAccountApiAuth()).toBeUndefined();
  });

  it("privilégie la session JWT lors d'un rafraîchissement", () => {
    expect(getAccountRefreshApiKey("invoice-key", true)).toBeUndefined();
  });

  it("réutilise la clé d'encaissement sans session JWT", () => {
    expect(getAccountRefreshApiKey("invoice-key", false)).toBe("invoice-key");
  });
});
