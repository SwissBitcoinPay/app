import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import vectors from "./migration-relais-v2.json";
import {
  answerUrl,
  destinationOf,
  handoffAccountOf,
  handoffFragment,
  nonceOf,
  readV2BrowserState,
  requestUrl,
  welcomeUrl,
  type HandoffPayload
} from "./handoff";
import { freshToken } from "./freshToken";
import { revealWalletWords } from "./walletWords";
import { sattlemeOrigin } from "../../config/sattlemeUrl";

const ID = "0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b";
const TOKEN =
  "eyJhbGciOiJFZERTQSJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJlX29mX3RoZV90b2tlbg";
const REFRESH = "rT0k3n_of-the-v2_session.0123456789";
const WORDS =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

const storageOf = (values: Record<string, string>) => ({
  getItem: (key: string) => values[key] ?? null
});

// La copie du compte que l'app v2 range (réponse de GET /account, avec la
// clé d'API et le reste, qui ne doivent jamais partir).
const accountConfig = (fields: Record<string, unknown> = {}) =>
  JSON.stringify({
    id: ID,
    name: "Boulangerie du Lac",
    currency: "CHF",
    is_onchain_available: true,
    mail: "marie@example.ch",
    invoice_key: "k".repeat(32),
    apiKey: "k".repeat(32),
    iban_list: ["CH9300762011623852957"],
    hmac_secret: true,
    ...fields
  });

const NONCE = vectors.nonce;
const ORIGIN = "https://app.sattle.me";

describe("le relais vers sattle.me", () => {
  it("est celui des vecteurs communs aux trois dépôts, à chacun de ses temps", () => {
    expect(requestUrl(ORIGIN)).toBe(`${ORIGIN}/${vectors.requests.app}`);
    expect(vectors.fetchPath).toBe("/sattleme");
    expect(vectors.vectors.length).toBeGreaterThanOrEqual(4);
    for (const vector of vectors.vectors) {
      expect(handoffFragment(vector.payload as HandoffPayload)).toBe(
        vector.fragment
      );
    }
  });

  it("répond au propriétaire avec sa copie du compte et un jeton court, rien d'autre", () => {
    const state = readV2BrowserState(
      storageOf({
        "settings.userType": "admin",
        "settings.accountConfig": accountConfig(),
        tb_tokens: JSON.stringify({
          auth_token: "old",
          refresh_token: REFRESH,
          csrf_token: "c"
        })
      })
    );
    expect(state).toEqual({
      role: "owner",
      account: {
        id: ID,
        name: "Boulangerie du Lac",
        currency: "CHF",
        is_onchain_available: true,
        mail: "marie@example.ch"
      },
      refreshToken: REFRESH,
      hasWalletWords: false
    });
    const url = answerUrl(ORIGIN, NONCE, "owner", state.account, TOKEN);
    expect(url).toBe(`${ORIGIN}/${vectors.vectors[0].fragment}`);
    // Ni le jeton de renouvellement, ni la clé d'API, ni l'IBAN.
    const decoded = Buffer.from(url.split("#sbp=")[1], "base64url").toString();
    expect(decoded).not.toContain(REFRESH);
    expect(decoded).not.toContain("k".repeat(32));
    expect(decoded).not.toContain("CH93");
  });

  it("répond pour une caisse avec sa copie du compte, sans e-mail ni jeton", () => {
    const state = readV2BrowserState(
      storageOf({
        "settings.userType": "employee",
        "settings.accountConfig": accountConfig({
          name: "Café Zürich – Bahnhof",
          currency: "EUR",
          is_onchain_available: false
        }),
        tb_tokens: JSON.stringify({ auth_token: TOKEN, refresh_token: REFRESH })
      })
    );
    expect(state.role).toBe("employee");
    expect(state.refreshToken).toBeUndefined();
    expect(answerUrl(ORIGIN, NONCE, "employee", state.account, TOKEN)).toBe(
      `${ORIGIN}/${vectors.vectors[2].fragment}`
    );
  });

  it("prend une copie du compte sans rôle rangé pour une caisse, comme l'app v2", () => {
    expect(
      readV2BrowserState(
        storageOf({ "settings.accountConfig": accountConfig() })
      ).role
    ).toBe("employee");
    expect(readV2BrowserState(storageOf({})).role).toBeNull();
    expect(
      readV2BrowserState(storageOf({ "settings.accountConfig": "{oops" })).role
    ).toBeNull();
  });

  it("ne garde de la copie du compte que des valeurs de la bonne forme", () => {
    expect(handoffAccountOf({ name: "Sans id" }, "owner")).toBeUndefined();
    expect(handoffAccountOf(null, "owner")).toBeUndefined();
    expect(
      handoffAccountOf(
        {
          id: ID,
          name: 42,
          currency: "",
          isOnchainAvailable: false,
          mail: "x@y.ch"
        },
        "employee"
      )
    ).toEqual({
      id: ID,
      name: undefined,
      currency: undefined,
      is_onchain_available: false,
      mail: undefined
    });
  });

  it("n'emmène pas un jeton qui ne pourrait pas aller dans un en-tête", () => {
    expect(
      answerUrl(ORIGIN, NONCE, "owner", undefined, `${TOKEN}\r\nX: y`)
    ).toBe(`${ORIGIN}/${vectors.vectors[1].fragment}`);
  });

  it("ne prend pour nonce que celui de sattle.me", () => {
    expect(nonceOf(`#n=${NONCE}`)).toBe(NONCE);
    for (const hash of ["", "#n=", "#n=short", `#x=${NONCE}`, `#n=${NONCE}x`]) {
      expect(nonceOf(hash)).toBeUndefined();
    }
  });
});

describe("où mène chaque page", () => {
  const nothing = readV2BrowserState(storageOf({}));
  const owner = readV2BrowserState(
    storageOf({
      "settings.userType": "admin",
      "settings.wallet.mnemonicWords": "c2FsdA=="
    })
  );
  const till = readV2BrowserState(
    storageOf({ "settings.userType": "employee" })
  );

  it("garde les pages des payeurs, quoi que ce navigateur garde", () => {
    for (const path of [
      "/invoice",
      "/invoice/0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b",
      "/Invoice/abc",
      "/aml",
      "/aml/abc"
    ]) {
      expect(destinationOf(path, "", owner, false)).toEqual({ kind: "stay" });
      expect(destinationOf(path, "", nothing, true)).toEqual({ kind: "stay" });
    }
  });

  it("demande le relais pour un navigateur qui a un rôle, l'accueil sinon", () => {
    for (const path of [
      "/",
      "/settings",
      "/history",
      "/wallet",
      "/signup",
      "/email-login",
      "/invoices",
      "/amlx"
    ]) {
      expect(destinationOf(path, "", owner, false)).toEqual({
        kind: "request",
        activation: false
      });
      expect(destinationOf(path, "", nothing, false)).toEqual({
        kind: "welcome"
      });
    }
  });

  it("répond à sattle.me sur sa page, avec son nonce, après les mots du propriétaire", () => {
    expect(destinationOf("/sattleme", `#n=${NONCE}`, owner, false)).toEqual({
      kind: "answer",
      nonce: NONCE,
      role: "owner",
      askWords: true
    });
    expect(destinationOf("/sattleme", `#n=${NONCE}`, till, false)).toEqual({
      kind: "answer",
      nonce: NONCE,
      role: "employee",
      askWords: false
    });
    // Sans nonce, ou sans rien de l'app v2 : l'accueil.
    expect(destinationOf("/sattleme", "", owner, false)).toEqual({
      kind: "welcome"
    });
    expect(destinationOf("/sattleme", `#n=${NONCE}`, nothing, false)).toEqual({
      kind: "welcome"
    });
    // Une caisse n'a jamais de mots à noter.
    expect(
      readV2BrowserState(
        storageOf({
          "settings.userType": "employee",
          "settings.wallet.mnemonicWords": "c2FsdA=="
        })
      ).hasWalletWords
    ).toBe(false);
  });

  it("mène un lien d'activation de caisse à l'écran des employés", () => {
    expect(destinationOf("/connect/abc", "", nothing, false)).toEqual({
      kind: "request",
      activation: true
    });
    expect(destinationOf("/sattleme", `#n=${NONCE}`, nothing, true)).toEqual({
      kind: "answer",
      nonce: NONCE,
      role: "employee",
      askWords: false
    });
    // Ce que ce navigateur garde passe avant.
    expect(destinationOf("/connect/abc", "", owner, false)).toEqual({
      kind: "request",
      activation: false
    });
  });

  it("mène sattle.me à son accueil sans rien d'autre", () => {
    expect(welcomeUrl(ORIGIN)).toBe(`${ORIGIN}/`);
  });
});

describe("l'adresse de sattle.me", () => {
  it("est l'app web de production, sauf une autre origine https donnée", () => {
    expect(sattlemeOrigin(undefined)).toBe("https://app.sattle.me");
    expect(sattlemeOrigin("")).toBe("https://app.sattle.me");
    expect(sattlemeOrigin("https://example.test/path?x#y")).toBe(
      "https://example.test"
    );
    expect(sattlemeOrigin("http://example.test")).toBe("https://app.sattle.me");
    expect(sattlemeOrigin("https://u:p@example.test")).toBe(
      "https://app.sattle.me"
    );
    expect(sattlemeOrigin("not a url")).toBe("https://app.sattle.me");
  });
});

describe("le jeton court", () => {
  type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
  const asFetch = (fn: Fetch) => fn as unknown as typeof fetch;
  const answer = (status: number, body: unknown) =>
    jest.fn<Fetch>(() =>
      Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(body)
      } as Response)
    );

  it("est renouvelé avec le jeton de renouvellement, qui reste ici", async () => {
    const fetchImpl = answer(200, { auth_token: TOKEN, csrf_token: "c" });
    await expect(
      freshToken("https://api.example", REFRESH, asFetch(fetchImpl))
    ).resolves.toBe(TOKEN);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.example/api/auth/v1/refresh",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ refresh_token: REFRESH })
      })
    );
  });

  it("n'est rien quand la session a expiré, le réseau manque ou la réponse est hors forme", async () => {
    await expect(
      freshToken("https://api.example", REFRESH, asFetch(answer(401, {})))
    ).resolves.toBeUndefined();
    await expect(
      freshToken(
        "https://api.example",
        REFRESH,
        asFetch(answer(200, { auth_token: "a\nb" }))
      )
    ).resolves.toBeUndefined();
    await expect(
      freshToken(
        "https://api.example",
        REFRESH,
        asFetch(jest.fn<Fetch>(() => Promise.reject(new TypeError("offline"))))
      )
    ).resolves.toBeUndefined();
    const never = answer(200, {});
    await expect(
      freshToken("https://api.example", undefined, asFetch(never))
    ).resolves.toBeUndefined();
    expect(never).not.toHaveBeenCalled();
  });

  it("n'attend pas au-delà de son délai", async () => {
    const hanging = jest.fn<Fetch>(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("aborted"))
          );
        })
    );
    await expect(
      freshToken("https://api.example", REFRESH, asFetch(hanging), 10)
    ).resolves.toBeUndefined();
  });
});

describe("les 12 mots gardés par ce navigateur", () => {
  it("sont montrés quand le mot de passe les déchiffre", async () => {
    await expect(
      revealWalletWords((password) => {
        if (password !== "secret") throw new Error("Cannot decrypt data");
        return Promise.resolve(WORDS);
      }, "secret")
    ).resolves.toEqual({ status: "words", words: WORDS.split(" ") });
  });

  it("disent un mauvais mot de passe, et ne montrent jamais autre chose que des mots", async () => {
    await expect(
      revealWalletWords(
        () => Promise.reject(new Error("Cannot decrypt data")),
        "wrong"
      )
    ).resolves.toEqual({ status: "wrongPassword" });
    await expect(
      revealWalletWords(() => Promise.resolve("bm90IHdvcmRz"), "x")
    ).resolves.toEqual({ status: "unreadable" });
    await expect(
      revealWalletWords(
        () => Promise.resolve(WORDS.replace(/about$/, "abandon")),
        "x"
      )
    ).resolves.toEqual({ status: "unreadable" });
    await expect(
      revealWalletWords(() => Promise.resolve(null), "x")
    ).resolves.toEqual({ status: "unreadable" });
  });

  it("se lisent aussi séparés par des virgules", async () => {
    await expect(
      revealWalletWords(() => Promise.resolve(WORDS.split(" ").join(",")), "x")
    ).resolves.toEqual({ status: "words", words: WORDS.split(" ") });
  });
});

describe("les 12 mots, chiffrés comme l'app web v2 les range", () => {
  const entries = new Map<string, string>();
  // L'implémentation web (`AsyncStorage.ts`), pas celle du téléphone que Jest
  // choisirait : PBKDF2 puis AES-GCM, dans le localStorage.
  const { AsyncStorage: webStorage } = jest.requireActual<{
    AsyncStorage: {
      setItem: (
        k: string,
        v: string,
        a?: unknown,
        key?: string
      ) => Promise<void>;
      getItem: (k: string, p?: unknown, key?: string) => Promise<string | null>;
    };
  }>("../AsyncStorage/AsyncStorage.ts");

  beforeAll(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => entries.get(key) ?? null,
        setItem: (key: string, value: string) => {
          entries.set(key, value);
        },
        removeItem: (key: string) => {
          entries.delete(key);
        }
      }
    });
  });

  afterAll(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it("s'ouvrent avec le mot de passe de leur création, et seulement lui", async () => {
    await webStorage.setItem(
      "settings.wallet.mnemonicWords",
      WORDS,
      undefined,
      "mot-de-passe-1"
    );
    expect(entries.get("settings.wallet.mnemonicWords")).not.toContain(
      "abandon"
    );
    const read = (password: string) =>
      webStorage.getItem("settings.wallet.mnemonicWords", undefined, password);
    await expect(revealWalletWords(read, "mot-de-passe-1")).resolves.toEqual({
      status: "words",
      words: WORDS.split(" ")
    });
    await expect(revealWalletWords(read, "autre")).resolves.toEqual({
      status: "wrongPassword"
    });
  });
});
