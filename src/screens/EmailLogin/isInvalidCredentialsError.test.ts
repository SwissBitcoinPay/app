import { describe, expect, it } from "@jest/globals";
import { FetchError } from "trailbase";
import { isInvalidCredentialsError } from "./isInvalidCredentialsError";

describe("isInvalidCredentialsError", () => {
  it("reconnaît un refus de connexion du serveur d'API", () => {
    expect(
      isInvalidCredentialsError(new FetchError(401, "Unauthorized"))
    ).toBe(true);
  });

  it("ne masque pas les autres erreurs du serveur d'API", () => {
    expect(
      isInvalidCredentialsError(new FetchError(500, "Internal Server Error"))
    ).toBe(false);
  });

  it("ne confond pas une erreur arbitraire avec un refus de connexion", () => {
    expect(isInvalidCredentialsError({ status: 401 })).toBe(false);
  });
});
