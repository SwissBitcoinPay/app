import {
  fetchLegacyAccount,
  logInLegacy,
  logOutLegacy,
  migrateLegacyAccount,
  parseLegacyAccount,
  passwordChecks,
  refreshLegacySession,
  requestLegacyPasswordReset,
  resetLegacyPassword
} from "@/lib/legacy-v2/server";

/*
 * The v2 server's routes the migration asks, as the v2 server serves them: TrailBase's
 * native auth (`/api/auth/v1/refresh`, `login`, `logout`) and `GET /account`, whose answer with the
 * owner's session is the full account (snake_case and camelCase, the bank
 * details read from its payout provider), and the routes it has for sattle.me: the password's reset
 * and the account's migration.
 */

const ACCOUNT_ID = "0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b";
const JWT = "eyJhbGciOiJFZERTQSJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJlX29mX3RoZV90b2tlbg";
const NEW_JWT = "eyJhbGciOiJFZERTQSJ9.eyJzdWIiOiJ5In0.bmV3X3NpZ25hdHVyZV9vZl90aGVfdG9rZW4";
const REFRESH = "rT0k3n_of-the-v2_session.0123456789";
/** A valid Swiss IBAN (the checksum holds). */
const IBAN = "CH9300762011623852957";

function answering(status: number, body: unknown) {
  return jest.fn(
    async (_url: RequestInfo | URL, _init?: RequestInit) =>
      ({
        ok: status >= 200 && status < 300,
        status,
        text: async () => (typeof body === "string" ? body : JSON.stringify(body))
      }) as Response
  );
}

/** The full answer of GET /account for an owner paid half in bitcoin, half to a bank. */
function fullAccount(fields: Record<string, unknown> = {}) {
  return {
    id: ACCOUNT_ID,
    type: "merchant",
    name: "Lakeside Bakery",
    currency: "CHF",
    bank_currency: "EUR",
    btc_percent: 50,
    is_onchain_available: true,
    deposit_address: "zpub6r…",
    iban_list: [IBAN],
    iban: IBAN,
    bank_reference: "Till 1",
    owner_name: "Carol Smith",
    owner_address: "1 Lake Street",
    owner_complement: null,
    owner_city: "Lausanne",
    owner_country: "CH",
    owner_zip: "1003",
    btcPercent: 50,
    ...fields
  };
}

describe("parseLegacyAccount", () => {
  it("takes the payout of the account: its split, currencies and bank account", () => {
    expect(parseLegacyAccount(fullAccount())).toEqual({
      id: ACCOUNT_ID,
      name: "Lakeside Bakery",
      email: null,
      migratedAt: null,
      currency: "CHF",
      bankCurrency: "EUR",
      bitcoinPercent: 50,
      onchain: true,
      bank: {
        iban: IBAN,
        holderName: "Carol Smith",
        address: "1 Lake Street",
        addressComplement: null,
        postalCode: "1003",
        city: "Lausanne",
        country: "CH",
        transferReference: "Till 1"
      },
      localWallets: null
    });
  });

  it("takes no bank account the server could not read, nor an IBAN whose checksum fails", () => {
    expect(parseLegacyAccount(fullAccount({ error_bank: true }))?.bank).toBeNull();
    expect(parseLegacyAccount(fullAccount({ iban: "CH9300762011623852958" }))?.bank).toBeNull();
    expect(parseLegacyAccount(fullAccount({ iban: null }))?.bank).toBeNull();
  });

  it("leaves a field out of shape unsaid, and refuses an answer without an id", () => {
    const account = parseLegacyAccount(
      fullAccount({ btc_percent: 50.5, currency: 7, owner_country: "Switzerland" })
    );
    expect(account).toMatchObject({ bitcoinPercent: null, currency: null });
    expect(account?.bank?.country).toBeNull();
    expect(parseLegacyAccount(fullAccount({ btc_percent: 101 }))?.bitcoinPercent).toBeNull();
    expect(parseLegacyAccount({ name: "x" })).toBeNull();
    expect(parseLegacyAccount("nope")).toBeNull();
  });
});

describe("the owner's e-mail and the migration's date", () => {
  it("takes the e-mail its owner logs in with, and when the account was migrated", () => {
    expect(
      parseLegacyAccount(fullAccount({ mail: "marie@example.com", migrated_at: 1_793_000_000 }))
    ).toMatchObject({ email: "marie@example.com", migratedAt: 1_793_000_000 });
  });

  it("says neither when out of shape: never a migration it did not read", () => {
    for (const migrated of [0, -5, 1.5, "1793000000", true, null]) {
      expect(parseLegacyAccount(fullAccount({ migrated_at: migrated }))?.migratedAt).toBeNull();
    }
    for (const mail of ["marie", "a b@example.com", "@", 7]) {
      expect(parseLegacyAccount(fullAccount({ mail }))?.email).toBeNull();
    }
  });
});

describe("the v2 app's wallets among the payout destinations", () => {
  const ZPUB =
    "zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs";

  it("takes the on-chain wallets the v2 app created, never a hardware wallet's nor Lightning", () => {
    const account = parseLegacyAccount(
      fullAccount({
        verified_addresses: [
          { address: "marie@wallet.example", walletConfig: { type: "local" } },
          { address: ZPUB, walletConfig: { type: "local", zpub: ZPUB, path: "m/84'/0'/0'" } },
          {
            address:
              "xpub6CatWdiZiodmUeTDp8LT5or8nmbKNcuyvz7WyksVFkKB4RHwCD3XyuvPEbvqAQY3rAPshWcMLoP2fMFMKHPJ4ZeZXYVUhLv1VMrjPC7PW6V",
            walletConfig: { type: "ledger" }
          },
          { address: "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu" },
          {
            address: "bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g",
            walletConfig: { type: "local", zpub: ZPUB }
          }
        ]
      })
    );
    expect(account?.localWallets).toEqual([{ key: ZPUB }, { key: ZPUB }]);
  });

  it("says none when the merchant never had one, and unknown when the answer has no list", () => {
    expect(parseLegacyAccount(fullAccount({ verified_addresses: [] }))?.localWallets).toEqual([]);
    expect(parseLegacyAccount(fullAccount())?.localWallets).toBeNull();
    expect(parseLegacyAccount(fullAccount({ verified_addresses: "[]" }))?.localWallets).toBeNull();
    // The former server's camelCase name.
    expect(
      parseLegacyAccount(
        fullAccount({ verifiedAddresses: [{ address: ZPUB, walletConfig: { type: "local" } }] })
      )?.localWallets
    ).toEqual([{ key: ZPUB }]);
  });
});

describe("the v2 server's session", () => {
  it("reads the account with the session in the header alone, never the v2 app's cookies", async () => {
    const fetchImpl = answering(200, fullAccount());
    await expect(
      fetchLegacyAccount({ authToken: JWT, refreshToken: REFRESH }, { fetchImpl })
    ).resolves.toMatchObject({ id: ACCOUNT_ID, bitcoinPercent: 50 });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.swiss-bitcoin-pay.ch/account");
    expect(init).toMatchObject({
      method: "GET",
      credentials: "omit",
      headers: { Authorization: `Bearer ${JWT}` }
    });
    // No API key: with one, the server answers the till's few fields.
    expect(Object.keys(init!.headers as object)).not.toContain("api-key");
  });

  it("says a session refused, and an answer out of shape", async () => {
    const session = { authToken: JWT, refreshToken: REFRESH };
    await expect(
      fetchLegacyAccount(session, { fetchImpl: answering(401, { error: "unauthorized" }) })
    ).rejects.toMatchObject({ name: "LegacyServerError", code: "refused" });
    await expect(
      fetchLegacyAccount(session, { fetchImpl: answering(200, { name: "x" }) })
    ).rejects.toMatchObject({ code: "invalidResponse" });
    await expect(
      fetchLegacyAccount(session, { fetchImpl: answering(500, "oops") })
    ).rejects.toMatchObject({ code: "network" });
    const down = jest.fn(async () => {
      throw new TypeError("Network request failed");
    });
    await expect(fetchLegacyAccount(session, { fetchImpl: down })).rejects.toMatchObject({
      code: "network"
    });
  });

  it("renews the short-lived token as TrailBase's client does", async () => {
    const fetchImpl = answering(200, { auth_token: NEW_JWT, csrf_token: "csrf" });
    await expect(refreshLegacySession(REFRESH, { fetchImpl })).resolves.toEqual({
      authToken: NEW_JWT,
      refreshToken: REFRESH
    });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.swiss-bitcoin-pay.ch/api/auth/v1/refresh");
    expect(init).toMatchObject({ method: "POST" });
    expect(JSON.parse(init!.body as string)).toEqual({ refresh_token: REFRESH });

    await expect(
      refreshLegacySession(REFRESH, { fetchImpl: answering(401, null) })
    ).rejects.toMatchObject({ code: "refused" });
    await expect(
      refreshLegacySession(REFRESH, { fetchImpl: answering(200, { auth_token: "a b" }) })
    ).rejects.toMatchObject({ code: "invalidResponse" });
  });

  it("logs in with the e-mail and password, and tells a refusal from a second factor", async () => {
    const fetchImpl = answering(200, {
      auth_token: JWT,
      refresh_token: REFRESH,
      csrf_token: "csrf"
    });
    await expect(logInLegacy("marie@example.com", "secret", { fetchImpl })).resolves.toEqual({
      authToken: JWT,
      refreshToken: REFRESH
    });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.swiss-bitcoin-pay.ch/api/auth/v1/login");
    expect(JSON.parse(init!.body as string)).toEqual({
      email: "marie@example.com",
      password: "secret"
    });

    await expect(
      logInLegacy("marie@example.com", "wrong", { fetchImpl: answering(401, null) })
    ).rejects.toMatchObject({ code: "refused" });
    await expect(
      logInLegacy("marie@example.com", "secret", {
        fetchImpl: answering(403, { mfa_token: "m" })
      })
    ).rejects.toMatchObject({ code: "secondFactor" });
  });

  it("closes the session, and never fails for it", async () => {
    const fetchImpl = answering(200, null);
    await logOutLegacy({ authToken: JWT, refreshToken: REFRESH }, { fetchImpl });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.swiss-bitcoin-pay.ch/api/auth/v1/logout");
    expect(JSON.parse(init!.body as string)).toEqual({ refresh_token: REFRESH });

    const down = jest.fn(async () => {
      throw new TypeError("Network request failed");
    });
    await expect(
      logOutLegacy({ authToken: JWT, refreshToken: REFRESH }, { fetchImpl: down })
    ).resolves.toBeUndefined();
    // Without a refresh token there is nothing to close.
    const unused = answering(200, null);
    await logOutLegacy({ authToken: JWT, refreshToken: null }, { fetchImpl: unused });
    expect(unused).not.toHaveBeenCalled();
  });
});

describe("the password's reset", () => {
  it("asks for a link to this app, in the device's language, and takes the same answer for any e-mail", async () => {
    const fetchImpl = answering(204, "");
    await requestLegacyPasswordReset("marie@example.com", "fr", { fetchImpl });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.swiss-bitcoin-pay.ch/v1/auth/reset-password/request");
    expect(init!.method).toBe("POST");
    expect(JSON.parse(init!.body as string)).toEqual({
      email: "marie@example.com",
      lang: "fr",
      target: "sattleme"
    });
    // Never a session nor a cookie: the reset is anonymous.
    expect((init!.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(init!.credentials).toBe("omit");
  });

  it("says an e-mail out of the server's rules apart from a server down", async () => {
    await expect(
      requestLegacyPasswordReset("x", "fr", { fetchImpl: answering(400, { error: "validation" }) })
    ).rejects.toMatchObject({ code: "rejected" });
    await expect(
      requestLegacyPasswordReset("marie@example.com", "fr", { fetchImpl: answering(502, "") })
    ).rejects.toMatchObject({ code: "network" });
  });

  it("sets the new password with the link's code", async () => {
    const fetchImpl = answering(204, "");
    await resetLegacyPassword("0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b", "new-1", { fetchImpl });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.swiss-bitcoin-pay.ch/v1/auth/reset-password");
    expect(JSON.parse(init!.body as string)).toEqual({
      id: "0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b",
      new_password: "new-1"
    });
  });

  it("tells a link no longer valid from a password refused", async () => {
    for (const error of ["code_invalid_or_expired", "invalid_id"]) {
      await expect(
        resetLegacyPassword("c", "new-1", { fetchImpl: answering(400, { error }) })
      ).rejects.toMatchObject({ code: "expired" });
    }
    await expect(
      resetLegacyPassword("c", "court", { fetchImpl: answering(400, { error: "validation" }) })
    ).rejects.toMatchObject({ code: "rejected" });
    await expect(
      resetLegacyPassword("c", "new-1", { fetchImpl: answering(500, { error: "internal" }) })
    ).rejects.toMatchObject({ code: "network" });
  });

  it("checks the server's rules as they are typed", () => {
    expect(passwordChecks("")).toEqual({ length: false, letter: false, digit: false });
    expect(passwordChecks("abcdefg1")).toEqual({ length: true, letter: true, digit: true });
    expect(passwordChecks("12345678")).toEqual({ length: true, letter: false, digit: true });
    expect(passwordChecks("a1".repeat(129)).length).toBe(false);
  });
});

describe("the account's migration", () => {
  const session = { authToken: JWT, refreshToken: REFRESH };

  it("asks with the owner's session and the new account's Lightning address", async () => {
    const fetchImpl = answering(200, {
      migrated: true,
      lightning_address: "sattleme02c6@breez.tips",
      migrated_at: 1_793_000_000,
      payout: "sent"
    });
    await expect(
      migrateLegacyAccount(session, "sattleme02c6@breez.tips", { fetchImpl })
    ).resolves.toEqual({ payout: "sent" });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.swiss-bitcoin-pay.ch/v1/accounts/migrate");
    expect(init!.method).toBe("POST");
    expect((init!.headers as Record<string, string>).Authorization).toBe(`Bearer ${JWT}`);
    expect(JSON.parse(init!.body as string)).toEqual({
      lightning_address: "sattleme02c6@breez.tips"
    });
  });

  it("never takes an answer that does not say the account is migrated", async () => {
    for (const body of [{}, { migrated: "true" }, null]) {
      await expect(
        migrateLegacyAccount(session, "a@breez.tips", { fetchImpl: answering(200, body) })
      ).rejects.toMatchObject({ code: "invalidResponse" });
    }
  });

  it.each([
    [409, "conflict"],
    [401, "refused"],
    // 400: also an address its LNURL server did not answer in time: tried again.
    [400, "network"],
    [403, "rejected"],
    [503, "network"]
  ])("says HTTP %i as %s", async (status, code) => {
    await expect(
      migrateLegacyAccount(session, "a@breez.tips", {
        fetchImpl: answering(status, { error: "x" })
      })
    ).rejects.toMatchObject({ code });
  });
});
