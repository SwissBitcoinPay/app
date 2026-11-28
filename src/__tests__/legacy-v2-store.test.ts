import {
  LEGACY_KEYS,
  parseLegacyAccountCopy,
  parseLegacyRole,
  parseLegacyTokens,
  parseLegacyWords
} from "@/lib/legacy-v2/data";
import {
  forgetLegacySession,
  hasLegacyWallet,
  readLegacyState,
  readLegacyWords
} from "@/lib/legacy-v2/store";

import { keychain, putLegacyValue } from "../../jest/react-native-keychain";

/*
 * What the v2 app (SwissBitcoinPay/app 2.x) left on a device updated to this app, as its own code
 * wrote it: every value in the keychain under the service of its name, the 12 words behind the
 * biometrics (Signup.tsx: BIOMETRY_CURRENT_SET).
 */

/** The BIP-39 test vector of 12 words (trezor/python-mnemonic, vectors.json). */
const WORDS =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const ACCOUNT_ID = "0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b";
const JWT = "eyJhbGciOiJFZERTQSJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJlX29mX3RoZV90b2tlbg";
const REFRESH = "rT0k3n_of-the-v2_session.0123456789";

/** The v2 app 2.7's copy of the account (GET /account: snake_case and camelCase). */
function accountCopy(fields: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: ACCOUNT_ID,
    name: "Lakeside Bakery",
    invoice_key: "k".repeat(32),
    currency: "CHF",
    is_onchain_available: true,
    mail: "carol@example.ch",
    apiKey: "k".repeat(32),
    isOnchainAvailable: true,
    ...fields
  });
}

describe("the v2 app's values", () => {
  it("tells the owner from a till by the role the v2 app saved", () => {
    expect(parseLegacyRole("admin")).toBe("owner");
    expect(parseLegacyRole("wallet")).toBe("owner");
    expect(parseLegacyRole("employee")).toBe("employee");
    expect(parseLegacyRole("guest")).toBeNull();
    expect(parseLegacyRole(null)).toBeNull();
  });

  it("reads the copy of the account of the current server and of the former one", () => {
    expect(parseLegacyAccountCopy(accountCopy())).toEqual({
      id: ACCOUNT_ID,
      name: "Lakeside Bakery",
      currency: "CHF",
      onchain: true,
      email: "carol@example.ch"
    });
    // The former server's (camelCase only).
    const former = JSON.stringify({
      id: ACCOUNT_ID.toUpperCase(),
      apiKey: "k".repeat(32),
      name: "  Studio  ",
      currency: "EUR",
      isOnchainAvailable: false
    });
    expect(parseLegacyAccountCopy(former)).toEqual({
      id: ACCOUNT_ID,
      name: "Studio",
      currency: "EUR",
      onchain: false,
      email: null
    });
  });

  it("takes a field out of shape as unsaid, and a copy without an id as none", () => {
    expect(parseLegacyAccountCopy(accountCopy({ name: "", currency: "chf" }))).toMatchObject({
      name: null,
      currency: null
    });
    expect(parseLegacyAccountCopy(accountCopy({ name: "x".repeat(201) }))?.name).toBeNull();
    expect(parseLegacyAccountCopy(accountCopy({ mail: "no at sign" }))?.email).toBeNull();
    expect(parseLegacyAccountCopy(accountCopy({ mail: 42 }))?.email).toBeNull();
    expect(
      parseLegacyAccountCopy(
        accountCopy({ is_onchain_available: "yes", isOnchainAvailable: undefined })
      )?.onchain
    ).toBeNull();
    expect(parseLegacyAccountCopy(accountCopy({ id: "1" }))).toBeNull();
    expect(parseLegacyAccountCopy("{not json")).toBeNull();
    expect(parseLegacyAccountCopy("[]")).toBeNull();
    expect(parseLegacyAccountCopy(null)).toBeNull();
  });

  it("reads the v2 server's session, never a token that could not go in a header", () => {
    const tokens = JSON.stringify({ auth_token: JWT, refresh_token: REFRESH, csrf_token: "c" });
    expect(parseLegacyTokens(tokens)).toEqual({ authToken: JWT, refreshToken: REFRESH });
    expect(parseLegacyTokens(JSON.stringify({ auth_token: JWT }))).toEqual({
      authToken: JWT,
      refreshToken: null
    });
    expect(parseLegacyTokens(JSON.stringify({ auth_token: `${JWT}\r\nX: y` }))).toBeNull();
    expect(
      parseLegacyTokens(JSON.stringify({ auth_token: JWT, refresh_token: 'a"b'.repeat(8) }))
    ).toBeNull();
    expect(parseLegacyTokens(JSON.stringify({ refresh_token: REFRESH }))).toBeNull();
    expect(parseLegacyTokens("")).toBeNull();
  });

  it("takes for words only 12 BIP-39 words whose checksum holds", () => {
    expect(parseLegacyWords(WORDS)).toEqual(WORDS.split(" "));
    expect(parseLegacyWords(` ${WORDS}\n`)).toEqual(WORDS.split(" "));
    // The checksum's last word changed.
    expect(parseLegacyWords(WORDS.replace(/about$/, "abandon"))).toBeNull();
    // 24 words: not what the v2 app generated.
    expect(
      parseLegacyWords(
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art"
      )
    ).toBeNull();
    expect(parseLegacyWords("not words")).toBeNull();
  });
});

describe("readLegacyState", () => {
  it("finds nothing on a device the v2 app never used", async () => {
    await expect(readLegacyState()).resolves.toBeNull();
  });

  it("finds the owner's account, session and wallet without asking anything", async () => {
    putLegacyValue(LEGACY_KEYS.userType, "admin");
    putLegacyValue(LEGACY_KEYS.accountConfig, accountCopy());
    putLegacyValue(LEGACY_KEYS.tokens, JSON.stringify({ auth_token: JWT, refresh_token: REFRESH }));
    putLegacyValue(LEGACY_KEYS.mnemonic, WORDS, true);

    await expect(readLegacyState()).resolves.toEqual({
      role: "owner",
      account: {
        id: ACCOUNT_ID,
        name: "Lakeside Bakery",
        currency: "CHF",
        onchain: true,
        email: "carol@example.ch"
      },
      tokens: { authToken: JWT, refreshToken: REFRESH },
      hasWallet: true
    });
    // The words were looked for, not read: no biometric prompt.
    expect(keychain.prompts).toEqual([]);
  });

  it("takes a device with an account but no role nor session for a till, as the v2 app did", async () => {
    putLegacyValue(LEGACY_KEYS.accountConfig, accountCopy());
    await expect(readLegacyState()).resolves.toMatchObject({ role: "employee", tokens: null });
  });

  it("takes a device with an account and a session but no role for its owner's", async () => {
    // A till's activation logs the session out: a session left is an owner's login.
    putLegacyValue(LEGACY_KEYS.accountConfig, accountCopy());
    putLegacyValue(LEGACY_KEYS.tokens, JSON.stringify({ auth_token: JWT, refresh_token: REFRESH }));
    await expect(readLegacyState()).resolves.toMatchObject({
      role: "owner",
      tokens: { authToken: JWT, refreshToken: REFRESH }
    });
  });

  it("keeps the role the v2 app saved, a session beside it or not", async () => {
    putLegacyValue(LEGACY_KEYS.userType, "employee");
    putLegacyValue(LEGACY_KEYS.accountConfig, accountCopy());
    putLegacyValue(LEGACY_KEYS.tokens, JSON.stringify({ auth_token: JWT, refresh_token: REFRESH }));
    await expect(readLegacyState()).resolves.toMatchObject({ role: "employee" });
  });

  it("takes a session out of shape for none: a till's, without a role", async () => {
    putLegacyValue(LEGACY_KEYS.accountConfig, accountCopy());
    putLegacyValue(LEGACY_KEYS.tokens, "not json");
    await expect(readLegacyState()).resolves.toMatchObject({ role: "employee", tokens: null });
  });

  it("migrates nothing from a session alone, without an account nor a role", async () => {
    putLegacyValue(LEGACY_KEYS.tokens, JSON.stringify({ auth_token: JWT, refresh_token: REFRESH }));
    await expect(readLegacyState()).resolves.toBeNull();
  });

  it('leaves the words alone to "Wallet": no migration without a role nor an account', async () => {
    putLegacyValue(LEGACY_KEYS.mnemonic, WORDS, true);
    await expect(readLegacyState()).resolves.toBeNull();
    await expect(hasLegacyWallet()).resolves.toBe(true);
  });

  it("takes a keychain it cannot open for one holding nothing", async () => {
    putLegacyValue(LEGACY_KEYS.userType, "admin");
    keychain.broken = true;
    await expect(readLegacyState()).resolves.toBeNull();
  });
});

describe("readLegacyWords", () => {
  const prompt = { title: "Open your old wallet", cancel: "Cancel" };

  it("reads the words behind the biometrics, with the app's prompt", async () => {
    putLegacyValue(LEGACY_KEYS.mnemonic, WORDS, true);
    await expect(readLegacyWords(prompt)).resolves.toEqual({
      status: "read",
      words: WORDS.split(" ")
    });
    expect(keychain.prompts).toEqual([{ service: LEGACY_KEYS.mnemonic, ...prompt }]);
  });

  it("says there are none, or that they could not be read", async () => {
    await expect(readLegacyWords(prompt)).resolves.toEqual({ status: "absent" });
    expect(keychain.prompts).toEqual([]);

    putLegacyValue(LEGACY_KEYS.mnemonic, WORDS, true);
    for (const biometrics of ["dismissed", "lost"] as const) {
      keychain.biometrics = biometrics;
      await expect(readLegacyWords(prompt)).resolves.toEqual({ status: "unreadable" });
    }
    keychain.biometrics = "granted";
    putLegacyValue(LEGACY_KEYS.mnemonic, "twelve words that are not a phrase at all ok", true);
    await expect(readLegacyWords(prompt)).resolves.toEqual({ status: "unreadable" });
  });
});

describe("forgetLegacySession", () => {
  it("forgets the session, the account and the role, never the wallet's words", async () => {
    putLegacyValue(LEGACY_KEYS.userType, "admin");
    putLegacyValue(LEGACY_KEYS.accountConfig, accountCopy());
    putLegacyValue(LEGACY_KEYS.tokens, JSON.stringify({ auth_token: JWT }));
    putLegacyValue(LEGACY_KEYS.mnemonic, WORDS, true);

    await forgetLegacySession();

    expect([...keychain.entries.keys()]).toEqual([LEGACY_KEYS.mnemonic]);
    await expect(readLegacyState()).resolves.toBeNull();
  });
});
