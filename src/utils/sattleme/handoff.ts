// Le relais vers sattle.me (migration du 26.11.2026, SwissBitcoinPay/new-app :
// `src/lib/legacy-v2/handoff.ts` et docs/etude-migration-v2.md, « Les apps web
// v2 »). L'app web v2 envoie ses utilisateurs sur l'app web de sattle.me avec ce
// que ce navigateur gardait, comme la v3 le relit du trousseau sur un
// téléphone. Toujours dans le FRAGMENT de l'adresse (jamais envoyé à un
// serveur, absent de tout journal), en trois temps :
//
//   1. cette app demande, sans rien de ses données :  https://app.sattle.me/#sbp-from=app
//   2. sattle.me garde un nonce dans son onglet et renvoie ici :  /sattleme#n=<nonce>
//   3. cette app répond, avec ce nonce :  https://app.sattle.me/#sbp=<base64url sans
//      remplissage du JSON UTF-8>
//   { "v": 1, "nonce": "<celui du 2>", "role": "owner" | "employee",
//     "account"?: { "id", "name"?, "currency"?, "is_onchain_available"?, "mail"? },
//     "token"?: "<jeton court du serveur v2, une heure ; propriétaire seulement>" }
//
// sattle.me ne prend une réponse qu'avec le nonce que son onglet attend : une
// adresse fabriquée ailleurs (celle où la page d'une facture renvoie son payeur,
// au choix du marchand, comprise) ne peut pas le connaître. Jamais le jeton de
// renouvellement (30 jours), la clé d'API, l'IBAN ni les 12 mots : une adresse
// reste dans l'historique du navigateur.
//
// IRRÉVERSIBLE : le format est lu par sattle.me tel que publié ; les vecteurs
// communs aux trois dépôts sont dans `migration-relais-v2.json` (copie de
// SwissBitcoinPay/new-app, docs/migration-relais-v2.json).

import {
  keyStoreAccountConfig,
  keyStoreMnemonicWords,
  keyStoreUserType
} from "@config/settingsKeys";

export const HANDOFF_PREFIX = "#sbp=";
export const HANDOFF_REQUEST = "#sbp-from=app";
export const HANDOFF_VERSION = 1;

// La page qui répond (temps 3) : le chemin que sattle.me vise.
export const HANDOFF_PATH = "/sattleme";

// Un nonce de sattle.me : 16 octets aléatoires, base64url.
const NONCE = /^[A-Za-z0-9_-]{22}$/;

// Le nonce d'une page qui répond (`#n=<nonce>`) ; undefined sinon.
export const nonceOf = (hash: string): string | undefined => {
  const nonce = hash.startsWith("#n=") ? hash.slice(3) : "";
  return NONCE.test(nonce) ? nonce : undefined;
};

// Le nom des jetons de TrailBase dans ce navigateur (`src/types/client.ts`).
export const TOKENS_KEY = "tb_tokens";

export type HandoffRole = "owner" | "employee";

export type HandoffAccount = {
  id: string;
  name?: string;
  currency?: string;
  is_onchain_available?: boolean;
  mail?: string;
};

export type HandoffPayload = {
  v: typeof HANDOFF_VERSION;
  nonce: string;
  role: HandoffRole;
  account?: HandoffAccount;
  token?: string;
};

type ReadStorage = { getItem: (key: string) => string | null };

// Ce que ce navigateur garde de l'app v2, lu sans rien demander.
export type V2BrowserState = {
  role: HandoffRole | null;
  account: HandoffAccount | undefined;
  // Le jeton de renouvellement de la session du propriétaire : jamais
  // transmis, il sert seulement à obtenir un jeton court juste avant le départ.
  refreshToken: string | undefined;
  // Le portefeuille créé dans l'app web v2 : ses 12 mots (chiffrés) sont ici.
  hasWalletWords: boolean;
};

const parseJson = (text: string | null): unknown => {
  if (text === null) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

// Un jeton tel qu'il peut aller dans un en-tête HTTP (même règle que sattle.me).
const TOKEN = /^[A-Za-z0-9._~+/=-]{16,4096}$/;
export const isToken = (value: unknown): value is string =>
  typeof value === "string" && TOKEN.test(value);

// Ce que sattle.me reprend de la copie du compte (réponse de `GET /account`),
// dans cet ordre (les vecteurs en dépendent), sans la clé d'API ni rien
// d'autre. `mail` pour le propriétaire seulement.
export const handoffAccountOf = (
  value: unknown,
  role: HandoffRole
): HandoffAccount | undefined => {
  if (!isObject(value) || typeof value.id !== "string" || value.id === "") {
    return undefined;
  }
  const onchain =
    value.is_onchain_available !== undefined
      ? value.is_onchain_available
      : value.isOnchainAvailable;
  const text = (field: unknown) =>
    typeof field === "string" && field !== "" ? field : undefined;
  return {
    id: value.id,
    name: text(value.name),
    currency: text(value.currency),
    is_onchain_available: typeof onchain === "boolean" ? onchain : undefined,
    mail: role === "owner" ? text(value.mail) : undefined
  };
};

// Le rôle comme l'app v2 le range : `admin` (e-mail) et `wallet` (signature)
// sont le propriétaire, `employee` une caisse ; sans rôle rangé, une caisse
// quand une copie du compte est là (le défaut de l'app v2, `SBPContext`).
export const readV2BrowserState = (storage: ReadStorage): V2BrowserState => {
  const userType = storage.getItem(keyStoreUserType);
  const accountConfig = parseJson(storage.getItem(keyStoreAccountConfig));
  const tokens = parseJson(storage.getItem(TOKENS_KEY));
  const words = storage.getItem(keyStoreMnemonicWords);
  const role: HandoffRole | null =
    userType === "admin" || userType === "wallet"
      ? "owner"
      : userType === "employee" || isObject(accountConfig)
        ? "employee"
        : null;
  const refreshToken =
    role === "owner" && isObject(tokens) && isToken(tokens.refresh_token)
      ? tokens.refresh_token
      : undefined;
  return {
    role,
    account: role ? handoffAccountOf(accountConfig, role) : undefined,
    refreshToken,
    hasWalletWords: role === "owner" && !!words
  };
};

// Les pages des payeurs restent servies par l'app web v2 : le paiement d'une
// facture (boutiques en ligne, factures PDF, jusqu'au 31.12.2026) et les
// formulaires des payeurs. Le routeur compare sans la casse.
const PAYER_PAGES = /^\/(invoice|aml)(\/|$)/i;

export type Destination =
  // Une page de payeur : l'app v2 la sert.
  | { kind: "stay" }
  // Temps 1 : la demande à sattle.me (ce navigateur a un rôle), ou son accueil.
  | { kind: "request" }
  | { kind: "welcome" }
  // Temps 3 : la réponse, après l'écran des 12 mots pour un propriétaire dont
  // ce navigateur les garde ; sans rôle, l'accueil de sattle.me.
  | { kind: "answer"; nonce: string; role: HandoffRole; askWords: boolean };

// Où mène une page de cette app : `pathname` et `hash` de son adresse. Un
// navigateur qui ne garde rien de l'app v2 n'a rien à relayer, quelle que soit
// la page (un lien d'activation `/connect/…` compris : n'importe qui peut en
// faire ouvrir un, il ne prouve aucune caisse) : l'accueil de sattle.me.
export const destinationOf = (
  pathname: string,
  hash: string,
  state: V2BrowserState
): Destination => {
  if (PAYER_PAGES.test(pathname)) return { kind: "stay" };
  if (pathname === HANDOFF_PATH) {
    const nonce = nonceOf(hash);
    return nonce && state.role
      ? {
          kind: "answer",
          nonce,
          role: state.role,
          askWords: state.hasWalletWords
        }
      : { kind: "welcome" };
  }
  return state.role ? { kind: "request" } : { kind: "welcome" };
};

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/[=]+$/, "");
};

export const handoffFragment = (payload: HandoffPayload): string =>
  HANDOFF_PREFIX +
  toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));

// Les adresses de sattle.me : sa demande (temps 1), son accueil, et la réponse
// (temps 3) avec ce que ce navigateur garde.
export const requestUrl = (origin: string): string =>
  `${origin}/${HANDOFF_REQUEST}`;

export const welcomeUrl = (origin: string): string => `${origin}/`;

export const answerUrl = (
  origin: string,
  nonce: string,
  role: HandoffRole,
  account: HandoffAccount | undefined,
  token: string | undefined
): string => {
  const payload: HandoffPayload = {
    v: HANDOFF_VERSION,
    nonce,
    role,
    account,
    token: role === "owner" && isToken(token) ? token : undefined
  };
  return `${origin}/${handoffFragment(payload)}`;
};
