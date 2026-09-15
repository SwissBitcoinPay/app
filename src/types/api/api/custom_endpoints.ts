// Wrappers typés pour les endpoints JS custom (non couverts par la
// Record API native TrailBase). Source de vérité unique : ce fichier est
// copié tel quel dans le front-end par scripts/gen-frontend-types.sh,
// puis mergé dans `createApis(client)` pour que le caller appelle
// `api.<domain>.<method>()` indistinctement, qu'il s'agisse d'une route
// Record API ou d'un endpoint JS.
//
// Convention : les clés top-level matchent les noms de Record APIs
// (`accounts`, `cards`, `wallets`, …) — le générateur les fusionne avec
// les méthodes typed CRUD au moment d'émettre `apis.ts`. Pour les
// domaines purement custom (`auth`, `rates`, `settings`), aucune Record
// API n'est mergée : ils existent uniquement ici.
//
// Frontend-only : exclu du build TS backend
// (cf. tsconfig.json `exclude`). Importe des types générés côté front
// (`../accounts.select.js`) qui n'existent qu'après `npm run gen:types`.

import type { Client } from "trailbase";
import type { GetAccountBankResponse } from "./v1_accounts_bank.js";
import type { AccountReadResponse } from "./get_account.js";

export type { AccountReadResponse } from "./get_account.js";

type Init = RequestInit & { headers?: Record<string, string> };

async function fetchJson<T>(
  client: Client,
  path: string,
  init?: Init,
): Promise<T> {
  const res = await client.fetch(path, init);
  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      /* swallow */
    }
    throw new Error(
      `${init?.method ?? "GET"} ${path} failed: ${res.status} ${detail.slice(0, 200)}`,
    );
  }
  return (await res.json()) as T;
}

async function fetchBlob(
  client: Client,
  path: string,
  init?: Init,
): Promise<Blob> {
  const res = await client.fetch(path, init);
  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      /* swallow */
    }
    throw new Error(
      `${init?.method ?? "GET"} ${path} failed: ${res.status} ${detail.slice(0, 200)}`,
    );
  }
  return await res.blob();
}

// Extrait le filename d'un header Content-Disposition. Gère les formes
// `filename="x"` et `filename=x;` (le backend émet la forme quotée).
function filenameFromContentDisposition(cd: string | null): string | null {
  if (!cd) return null;
  const m = /filename="?([^";]+)"?/i.exec(cd);
  return m?.[1]?.trim() ?? null;
}

// Comme fetchBlob, mais remonte aussi le filename du Content-Disposition
// (le serveur expose ce header via Access-Control-Expose-Headers).
async function fetchBlobNamed(
  client: Client,
  path: string,
  init?: Init,
): Promise<{ blob: Blob; filename: string | null }> {
  const res = await client.fetch(path, init);
  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      /* swallow */
    }
    throw new Error(
      `${init?.method ?? "GET"} ${path} failed: ${res.status} ${detail.slice(0, 200)}`,
    );
  }
  const filename = filenameFromContentDisposition(
    res.headers.get("content-disposition"),
  );
  return { blob: await res.blob(), filename };
}

async function fetchVoid(
  client: Client,
  path: string,
  init?: Init,
): Promise<void> {
  const res = await client.fetch(path, init);
  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      /* swallow */
    }
    throw new Error(
      `${init?.method ?? "GET"} ${path} failed: ${res.status} ${detail.slice(0, 200)}`,
    );
  }
}

function postJson<T>(
  client: Client,
  path: string,
  body: unknown,
  headers?: Record<string, string>,
): Promise<T> {
  const init: Init = {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...(headers ?? {}) },
  };
  return fetchJson<T>(client, path, init);
}

function postVoidJson(
  client: Client,
  path: string,
  body: unknown,
  headers?: Record<string, string>,
): Promise<void> {
  const init: Init = {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...(headers ?? {}) },
  };
  return fetchVoid(client, path, init);
}

function postNoBody<T>(
  client: Client,
  path: string,
  headers?: Record<string, string>,
): Promise<T> {
  const init: Init = { method: "POST" };
  if (headers) init.headers = headers;
  return fetchJson<T>(client, path, init);
}

// Mode card : header `card-id` (hex 32) + optionnel `pin-code` si la
// carte a un PIN configuré. Pas de session cookie — l'identification
// d'une carte se fait toujours par header (cohérence avec le legacy et
// avec le fait que les cartes ne sont pas des `_user` TrailBase).
export type CardAuth = {
  cardId: string;
  pinCode?: string;
};

function cardAuthHeaders(auth?: CardAuth): Record<string, string> | undefined {
  if (!auth) return undefined;
  const h: Record<string, string> = { "card-id": auth.cardId };
  if (auth.pinCode !== undefined) h["pin-code"] = auth.pinCode;
  return h;
}

// Auth dual-mode pour endpoints qui acceptent api-key OU JWT (cf.
// resolveMerchant côté backend). Si `apiKey` est fourni, le header
// `api-key` est injecté pour ce call uniquement — le SDK trailbase
// continue d'utiliser ses cookies/JWT pour les autres call-sites.
export type ApiKeyAuth = {
  apiKey?: string;
};

function apiKeyHeaders(auth?: ApiKeyAuth): Record<string, string> | undefined {
  if (!auth?.apiKey) return undefined;
  return { "api-key": auth.apiKey };
}

function withHeaders(
  headers: Record<string, string> | undefined,
): Init | undefined {
  return headers ? { headers } : undefined;
}

// ─── Réponses ────────────────────────────────────────────────────────────

// POST /v1/cards/anonymous-ln-address
export type AnonymousLnAddress = {
  name: string;
  address: string;
  wallet_id: string;
  created_at: number;
  expires_at: number;
};

// GET /v1/wallets/balance
export type WalletBalance = {
  balance: number;
  fiatBalances?: Record<string, number>;
};

// GET /v1/rates/current — dernier rate par devise (BTC base).
// `rates[CCY]` = prix d'1 BTC dans la devise.
export type RatesCurrent = {
  time: number;
  rates: Record<string, number>;
};

// GET /vapidPublicKey — l'endpoint TrailBase renvoie { publicKey }.
export type VapidPublicKey = { publicKey: string };

// POST /v1/push-subscription { action } — payload de souscription web-push
// tel que produit par `PushSubscription.toJSON()` côté navigateur (cf.
// SubscriptionSchema serveur).
export type WebPushSubscription = {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
};

// POST /v1/push-subscription { action: "subscribe" } — `id` présent
// uniquement sur une création effective (absent si déjà enregistrée).
export type PushSubscribeResult = {
  id?: string;
  result: string;
};

// GET /v1/push-subscription?endpoint=… — statut web-push d'un device
// (couple card-id + endpoint). `exists` = ce device est abonné ;
// `nbRegistered` = nb total de devices abonnés pour la card.
export type PushDeviceStatus = {
  exists: boolean;
  nbRegistered: number;
};

// GET /v1/cards/me — payload card-auth read.
export type CardMe = {
  id: string;
  wallet_id: string;
  invoice_key: string;
  currency: string | null;
  language: string | null;
  locked: boolean;
  deposit_address: string;
  recovery_email: string | null;
  web_push_id: string | null;
  two_fa_notification_threshold: number | null;
  // has_pin : la carte est protégée par un PIN. Si true, le header `pin-code`
  // était requis pour obtenir ce payload (gate côté getCardMe).
  has_pin: boolean;
  // front/back = asset_id base64url du visuel (cdn_files), résolu via le design
  // (card_design_id → card_designs). null si pas de design ou visuel en attente.
  front: string | null;
  back: string | null;
  // Métadonnées de rendu, portées par le design.
  front_is_white_content: boolean;
  back_is_white_content: boolean;
  back_is_onchain: boolean;
  force_dark_mode: boolean;
  bg_color: string | null;
  is_lightning_version: boolean;
  is_white_version: boolean;
  // Alias Lightning anonyme courant du wallet (row ln_addresses) ou null.
  ln_random_alias: {
    id: string;
    name: string;
    wallet_id: string;
    remaining_uses: number | null;
    enabled: boolean;
    anonymous: boolean;
    expires_at: number | null;
    created_at: number;
    updated_at: number;
  } | null;
  // Adresse Lightning custom (enregistrée payante, anonymous=0, enabled=1) du
  // wallet, ou null. Pendant permanent de `ln_random_alias` — cf. legacy
  // GET /account qui exposait `lnAlias` (custom) ET `lnRandomAlias` (anonyme).
  ln_alias: {
    id: string;
    name: string;
    wallet_id: string;
    remaining_uses: number | null;
    enabled: boolean;
    anonymous: boolean;
    expires_at: number | null;
    created_at: number;
    updated_at: number;
  } | null;
  created_at: number;
  updated_at: number;
};

// PATCH /v1/cards/me — body card-auth update. `pin_code`/`recovery_email` sont
// refusés sur la variante JWT `PATCH /v1/cards/{id}` (elle ne prouve pas la
// possession de la carte).
export type CardUpdateMeBody = {
  locked?: boolean;
  // null = second facteur désarmé, 0 = 2FA sur toute dépense, N = au-delà de N.
  two_fa_notification_threshold?: number | null;
  currency?: string;
  // PIN : string pour définir/changer, null pour supprimer. Le pin actuel
  // (header pin-code via CardAuth) est re-vérifié serveur pour ces deux ops.
  // Définir/changer impose `recovery_email` dans le MÊME body et passe par le
  // double opt-in email (202). `{pin_code: null}` supprime PIN + email de
  // récupération immédiatement (204).
  pin_code?: string | null;
  recovery_email?: string | null;
};

// Réponse `PATCH /v1/cards/me`, même contrat que `AccountPatchResponse` :
// `{otp_required: true}` (HTTP 202) = rien n'est appliqué tant que le
// magic-link envoyé à la nouvelle adresse de récupération n'a pas été cliqué.
export type CardUpdateMeResponse =
  | { otp_required: false }
  | { otp_required: true };

// Entrée de `payment_details` (colonne apipayment_payment_details). Une entrée
// par tx observée (LN ou on-chain) attachée à la facture. `network` seul est
// garanti ; les autres champs sont posés au fil du cycle de vie (LN au
// checkout, on-chain au scan des dépôts).
export type ApipaymentDetail = {
  network: "lightning" | "onchain";
  paymentRequest?: string;
  hash?: string;
  preimage?: string;
  address?: string;
  paidAt?: number;
  amount?: number;
  confirmations?: number;
  minConfirmations?: number;
  txId?: string;
  vout_index?: number;
};

// GET /v1/apipayments/by-card — liste des paiements du wallet d'une card.
//
// Unités explicites :
//   amount_sat  = sats signés (positif = encaissement, négatif = sortie).
//   fee_msat    = frais de routage Lightning en millisats (≥ 0). La
//                 précision sub-sat est nécessaire pour la réconciliation
//                 LND (`fee_msat` natif gRPC).
export type ApipaymentsByCardResponse = {
  payments: Array<{
    id: string;
    amount_sat: number;
    fee_msat: number;
    title: string | null;
    description: string | null;
    tag: string | null;
    status: string;
    payment_details: ApipaymentDetail[] | null;
    created_at: number;
    paid_at: number | null;
  }>;
  limit: number;
  offset: number;
};

// GET /v1/rates/history — série historique BTC pour une devise donnée.
// GET /v1/transactions/by-address/{address} — types alignés sur l'ancien
// payload `https://stats.swiss-bitcoin-pay.ch/txs/{addr|xpub}`.
export type TxVout = {
  n: number;
  // SATOSHIS ENTIERS, comme `WalletTransaction.value` : toute la réponse a une
  // seule unité. L'index Bitcoin rend des BTC décimaux (`getrawtransaction`
  // verbeux) ; le serveur convertit chaque sortie avant de répondre, celles
  // d'un tiers comprises. Le client ne multiplie plus par 1e8.
  value: number;
  // `hex` est TOUJOURS présent (bitcoind le rend pour toute sortie) ;
  // `address` manque sur un script non standard. C'est donc `hex` qui sert à
  // reconnaître nos propres sorties, côté serveur comme côté client.
  scriptPubKey: { address?: string; hex?: string; [k: string]: unknown };
  // Présent uniquement si le SCRIPT de la vout appartient au wallet
  // (xpub dérivé ou address de la query). Permet au front de distinguer
  // les vouts à nous (et de marquer les change addresses) sans avoir à
  // re-dériver les addresses côté client.
  ourAddressConfig?: {
    index: number;
    change: boolean;
    isSpent: boolean;
  };
};

export type TxVin = {
  txid?: string;
  vout?: number;
  [k: string]: unknown;
};

export type WalletTransaction = {
  txid: string;
  // Sérialisation brute, prise dans la réponse VERBEUSE de l'index — qui la
  // porte déjà, en mempool comme confirmée. Sert à signer côté hardware wallet.
  hex: string;
  // Net pour le wallet, en SATOSHIS ENTIERS : Σ(sorties à nous) − Σ(entrées à
  // nous, résolues par cross-référence sur les tx du résultat). Positif si le
  // wallet a reçu, négatif s'il a dépensé. Chaque terme est converti depuis le
  // BTC décimal de l'index par une fonction dédiée, et la somme est entière —
  // deux sorties de 0,1 et 0,2 BTC font 30000000, jamais 0.30000000000000004.
  // Même unité que `vout[].value`.
  value: number;
  time?: number;
  blocktime?: number;
  in_active_chain: boolean;
  vin: TxVin[];
  vout: TxVout[];
};

export type AddressDetail = { address: string; index: number };

export type TransactionsByAddressResponse = {
  txs: WalletTransaction[];
  // `null` quand la query est faite avec une address simple (pas de
  // notion de prochaine adresse libre dans ce mode).
  nextInternalAddress: AddressDetail | null;
  nextChangeAddress: AddressDetail | null;
  // `false` quand le balayage d'une clé étendue a buté sur une borne (500 index
  // par chaîne, ou son budget de temps) : ce qui est listé est juste, ce sont
  // les index les plus hauts qui manquent.
  //
  // Toujours `true` pour une adresse simple : son historique n'a AUCUNE borne de
  // volume et est lu en entier, quel qu'en soit le nombre de transactions
  // (arbitrage du propriétaire, #577). Ce qui est borné, c'est le rythme — les
  // transactions sont lues par lots sur une connexion réservée aux vues
  // publiques, derrière une file à un seul balayage actif, pour qu'une adresse
  // très chargée ne retarde plus un reversement marchand. Une adresse chargée
  // peut donc répondre lentement ; ce qu'elle ne peut pas, c'est répondre à
  // moitié.
  //
  // Deux échecs distincts, deux statuts — un client qui réessaie doit traiter
  // les deux : une lecture interrompue CÔTÉ RELAIS sort en 503
  // `chain_unavailable` ; une adresse assez chargée pour dépasser le budget de
  // la route sort, elle, en 500 nu et sans clé i18n, l'hôte coupant l'appel
  // avant que le code d'erreur soit choisi.
  complete: boolean;
};

export type RatesHistoryResponse = {
  unit: string;
  points: Array<{ time: number; price: number }>;
};

export type RatesHistoryQuery = {
  start?: number;
  end?: number;
  unit?: string;
};

// GET /v1/accounts/limits — limites légales + volume consommé sur les
// fenêtres glissantes (24 h / 30 j / 365 j). Les montants sont exprimés dans
// `currency`. Le tier (verified/unverified) est résolu côté serveur à
// partir du statut KYC et appliqué dans
// `current.{daily,monthly,yearly}.maxVolume`, mais l'état KYC lui-même est
// exposé séparément via GET /v1/accounts/kyc (auth requis).
//
// `current.{daily,monthly,yearly}.maxVolume` reflète le tier courant. Pour le
// tier `verified`, `daily` et `monthly` sont alignés sur `yearly` (pas de
// plafond journalier ni mensuel distinct côté réglementaire).
export type AccountLimits = {
  currency: string;
  tiers: {
    unverified: { daily: number; monthly: number; yearly: number };
    verified: { daily: number; monthly: number; yearly: number };
  };
  current: {
    daily: { currentVolume: number; maxVolume: number };
    monthly: { currentVolume: number; maxVolume: number };
    yearly: { currentVolume: number; maxVolume: number };
  };
};

// POST /v1/accounts/close — fermeture du compte par le merchant lui-même.
// `canceledInvoices` : les factures encore payables tuées par la fermeture,
// chez LND puis chez nous. Les factures déjà alimentées ne sont pas annulées —
// elles retiennent la fermeture (`409 account_has_pending_funds`).
export type CloseAccountResponse = {
  closed: boolean;
  canceledInvoices: number;
};

// GET /v1/accounts/referrals — synthèse des referrals du merchant.
export type AccountReferral = {
  referral_code: string;
  email: string;
  created_at: number;
  total_paid_sats: number;
};

export type AccountReferrals = {
  referrals: AccountReferral[];
  fees_from_referrals: number;
};

// GET /v1/accounts/check-referral-code?refCode=… — ce code de parrainage
// existe-t-il ? Un code inconnu n'est PAS une erreur HTTP : la réponse est
// 200 `{ valid: false }`. Le backend applique le même prédicat qu'à
// l'inscription (casse normalisée côté serveur), donc `valid: true` garantit
// que POST /v1/accounts/create acceptera ce `referred_by`.
export type ReferralCodeCheck = {
  valid: boolean;
};

// GET /v1/accounts/validate-xpub — validation structurelle d'un
// xpub/ypub/zpub (base58check + préfixe BIP32) + dérivation des 10
// premières adresses receive (`change=0`) si valide. `addresses` est
// absent quand `valid === false`. `reason` (i18n key) cause de
// l'invalidité : `invalid_encoding`, `unknown_prefix`,
// `derivation_failed`.
export type XpubValidation = {
  valid: boolean;
  reason?: string;
  addresses?: string[];
};

// GET /v1/accounts/xpub-balance — solde et nombre de transactions d'une clé
// publique étendue, lus sur la chaîne (notre index Electrum, via relay).
// C'est ce qui permet de montrer « 0.42 BTC • 17 transactions » à côté de
// chaque compte d'un wallet matériel, et « nouveau compte » quand
// `tx_count === 0`. Public, plafonné à 30 appels/min par IP.
//
// Montants en satoshis ENTIERS. `unconfirmed_sat` est le mempool, SIGNÉ : une
// dépense non confirmée d'une sortie confirmée le rend négatif. Au client de
// décider s'il l'additionne au confirmé.
//
// `complete: false` ⇒ une borne du balayage a été atteinte (500 index par
// chaîne, ou 10 s) : les chiffres sont un MINIMUM, à afficher avec un « ≥ ».
//
// Contrairement à `validateXpub`, une clé invalide est un 400 (`missing_xpub`,
// `invalid_encoding`, `unknown_prefix`) : la clé vient du wallet, pas d'une
// saisie. Chaîne injoignable ⇒ 503 `chain_unavailable`.
export type XpubBalance = {
  confirmed_sat: number;
  unconfirmed_sat: number;
  tx_count: number;
  complete: boolean;
};

// POST /v1/accounts/verify-address — challenge créé pour l'adresse.
export type VerifyAddressChallenge =
  | { kind: "onchain"; sign_address: string; message: string }
  | {
      kind: "xpub";
      sign_address: string;
      display_address: string;
      message: string;
    }
  | {
      kind: "lightning";
      sign_address: string;
      message: string;
      pr: string;
      hash: string;
    };

// POST /v1/accounts/verify-signature — état de vérification de la signature.
export type VerifySignatureResult = {
  verified: true;
  sign_address: string;
  display_address?: string;
};

// POST /v1/accounts/kyc/beneficiaries/{id}/reset — réponse contenant
// le nouveau token + lien iDenfy. Le beneficiary_id retourné remplace
// l'ancien dans `kyc.beneficiaries[]` (DELETE + ADD côté iDenfy).
export type ResetBeneficiaryKycResponse = {
  beneficiary_id: string;
  auth_token: string;
  verify_link: string;
};

// POST /v1/accounts/kyc — réponse iDenfy normalisée.
// `auth_token` = token_string utilisable directement par l'UI iDenfy.
// `company_id` n'est non-null que pour les KYB Business (formId iDenfy
// utilisé pour les appels /kyb/forms/{company_id}/beneficiaries/).
// `client_id` = kyc.id (uuid hex) renvoyé pour traçabilité côté caller.
export type CreateKycResponse = {
  auth_token: string;
  company_id: string | null;
  client_id: string;
};

// (Le wrapper `accounts.export` retourne un `Blob` directement — voir le
// type `AccountExportBody` plus bas pour le payload accepté par le
// backend. Pas de flow async download id/url.)

// POST /v1/wallets/withdraw-fiat — réponse MtPelerin sell order. Le
// `invoice` est une LN invoice payable par notre node ; `hash` est le
// payment_hash correspondant.
export type WithdrawFiatResponse = {
  order_id: string;
  invoice: string;
  hash: string;
  source_amount: number;
  status: "pending" | "settled" | "failed";
};

// POST /checkout — réponse legacy publique (apps prod consomment ce shape).
// Contrat figé bit-pour-bit (cf. docs/legacy-snapshots/).
export type CheckoutResponse = {
  id: string;
  pr: string;
  hash: string;
  checkoutUrl: string;
  expiry: number;
  onChainAddr?: string;
};

// POST /v1/apipayments/settle-underpaid
//
// `settled: false` reste possible : la facture part alors en `unconfirmed`
// parce qu'un dossier Travel Rule est en attente d'acceptation. Le type
// déclarait `true` littéral et omettait `status` — il mentait déjà sur le
// runtime avant que l'endpoint n'exige les confirmations.
//
// L'endpoint répond 409 `insufficient_confirmations` tant que le reçu n'a pas
// atteint le palier de confirmations de son montant.
export type SettleUnderpaidResponse = {
  settled: boolean;
  status: "settled" | "unconfirmed";
  payment_id: string;
};

// POST /v1/ln-addresses/register — register définitif (paiement requis).
export type LnAddressRegisterResponse =
  | { status: "OK" }
  | { checkoutUrl: string };

// ─── Bodies (input) ──────────────────────────────────────────────────────

// POST /v1/accounts/kyc — body iDenfy create-session. Seul `mode` est
// exposé au client : la nature du KYC (`individual` → personne physique,
// `business` → organisation). Tous les autres paramètres iDenfy (locale,
// callback, etc.) sont dérivés côté serveur à partir de l'account
// (langue, environnement, …).
export type CreateKycBody = {
  mode: "individual" | "business";
};

export type VerifySignatureBody = {
  message: string;
  signature: string;
};

export type VerifyAddressBody = {
  depositAddress: string;
};

// GET /v1/accounts/kyc — état complet de la dernière session KYC du
// merchant. `beneficiaries` est non-null uniquement pour les KYC type=
// 'business' (KYB) et seulement après réception du webhook COMPANY_SUBMIT
// (snapshot des UBOs fetché une fois sur /kyb/forms/{companyId}/beneficiaries/).
// Le `status` par beneficiary est tenu en sync par les webhooks
// `externalRef='beneficiary'`.
export type KycBeneficiary = {
  id: string;
  name: string;
  surname: string;
  email: string;
  // Rôle KYC du beneficiary côté iDenfy. `UBO` (Ultimate Beneficial Owner) >
  // `ABO` (Active Beneficial Owner) > `SHAREHOLDER`. Si un beneficiary cumule
  // plusieurs rôles, le plus prioritaire est stocké. Les autres rôles
  // iDenfy (DIRECTOR, etc.) ne sont pas soumis à KYC et sont exclus du
  // snapshot.
  beneficiary_type: "UBO" | "ABO" | "SHAREHOLDER";
  status:
    | "not_started"
    | "pending_verification"
    | "accepted"
    | "rejected"
    | "expired";
  // Unix seconds du dernier envoi d'invitation KYC à ce beneficiary. Absent
  // tant qu'aucun mail n'a été envoyé (pas d'email / pas de scanRef / échec).
  email_sent_at?: number;
};

export type KycResponse = {
  id: string;
  type: "individual" | "business";
  status: "initiated" | "submitted" | "accepted" | "rejected" | "expired";
  provider: "idenfy" | "self";
  // Token UI iDenfy (https://ui.idenfy.com/?authToken=...). Mutable :
  // regénéré à chaque re-init de session active.
  token_string: string | null;
  // KYB only : formId iDenfy (NULL pour KYC type='individual').
  company_id: string | null;
  beneficiaries: KycBeneficiary[] | null;
  created_at: number;
  updated_at: number;
};

// POST /v1/accounts/export — body du download. Source de vérité :
// `ExportSchema` côté backend (endpoints/accounts.ts).
// `exportType` détermine le format renvoyé :
//   - `"detailed"` : CSV brut localisé
//   - `"simple"` (défaut) : PDF résumé
export type AccountExportBody = {
  startTime: number;
  endTime: number;
  exportType?: "detailed" | "simple";
  exportCurrency?: string;
  lng?: string;
  timezone?: string;
  keys?: string[];
};

// POST /v1/wallets/withdraw-fiat — création d'un order MtPelerin off-ramp.
export type WithdrawFiatBody = {
  amount: number;
  currency: string;
};

// POST /checkout — payload public partenaires (figé legacy). Voir
// `CheckoutSchema` côté backend (endpoints/checkout.ts) pour la source
// de vérité — toute extension doit y être ajoutée d'abord.
export type CheckoutDevice = {
  name?: string;
  type?: string;
  appVersion?: string;
  // Le backend `passthrough()` accepte les champs supplémentaires.
  [k: string]: unknown;
};

export type CheckoutWebhook =
  | string
  | {
      url: string;
      headers?: Record<string, string>;
      body?: unknown;
    };

export type CheckoutBody = {
  amount: number | string;
  unit?: "sat" | "BTC" | "EUR" | "USD" | "CHF" | string;
  title?: string;
  description?: string;
  tag?: string;
  device?: CheckoutDevice;
  extra?: Record<string, unknown>;
  onChain?: boolean;
  delay?: number;
  webhook?: CheckoutWebhook;
  redirectAfterPaid?: string;
  // ── champs facture à plat (anciennement sous `invoiceData`) ──
  issuerName?: string;
  issuerAddress?: unknown;
  issuerRegistrationNumber?: string;
  issuerVatNumber?: string;
  issuerEmail?: string;
  receiverName?: string;
  receiverAddress?: unknown;
  receiverVatNumber?: string;
  receiverEmail?: string;
  receiverEmailLanguage?: string;
  externalReference?: string;
  invoiceDescription?: string;
  items?: unknown[];
  conditions?: string;
  legalMentions?: string;
};

export type SettleUnderpaidBody = {
  payment_id: string;
};

export type LnAddressRegisterBody = {
  ln_name: string;
};

// POST /v1/settings/validate — utilisable par users `accounts` ET `cards`.
// `id` est le code OTP/email-verification associé au flow settings sensibles.
export type SettingsValidateBody = {
  id: string;
};

// GET /v1/config — config publique consommée par le front au bootstrap
// (réseau Bitcoin, environnement, CDN, gating de version client).
// Public, sans auth.
export type AppConfig = {
  // `regtest` ne peut sortir que d'une pile de tests locale (e2e/). Il est
  // listé ici parce que le type doit décrire ce que le back-end peut rendre,
  // pas ce qu'on souhaite qu'il rende — un front qui traite ce champ par
  // exhaustivité doit voir le cas plutôt que le découvrir à l'exécution.
  bitcoin_network: "mainnet" | "signet" | "regtest";
  environment: "production" | "staging" | "dev";
  version: string;
  cdn_endpoint: string;
  min_client_version: string;
  ln_address_domains: string[];
};

// GET /v1/currencies — devises servies et précision de chacune. Public, sans
// auth : un montant s'affiche avant tout login.
//
// `sat` et `BTC` figurent dans la même liste que le fiat, en tête, bien qu'ils
// ne soient pas des lignes de la table `currencies`. C'est la source unique du
// nombre de décimales d'un montant : le front ne doit plus porter sa propre
// table (`src/config/currencies.ts`), qui diverge de la norme dès qu'une devise
// change d'exposant.
export type CurrencyInfo = {
  // Code ISO 4217, ou `sat` / `BTC`.
  code: string;
  // Nombre de décimales de la sous-unité : 2 pour un franc, 0 pour un yen,
  // 3 pour un dinar koweïtien, 8 pour un bitcoin.
  decimals: number;
  // `false` = la devise reste lisible sur les paiements passés mais ne peut
  // plus être choisie.
  enabled: boolean;
  // La devise est vendue en direct par l'off-ramp (virement bancaire).
  offramp: boolean;
};

export type CurrenciesResponse = {
  currencies: CurrencyInfo[];
};

// PATCH /v1/accounts/{id} — body envoyé par le merchant pour modifier
// son account. Tous les champs sont optionnels (PATCH partiel). Le
// backend route automatiquement chaque champ vers "allowed" (UPDATE
// direct) ou "sensitive" (snapshot dans `_settings_otp_codes` + email
// magic-link). Cf. merchants.ts pour la liste exacte.
export type AccountPatchBody = {
  // Allowed
  name?: string;
  currency?: string;
  language?: string;
  logo_asset_id?: string;
  is_onchain_available?: boolean;
  default_vat?: number;
  // Migration allowed↔sensitive selon hmac_secret existant
  hmac_secret?: string;
  is_checkout_secure?: boolean;
  // Sensible
  btc_percent?: number;
  deposit_address?: string;
  deposit_rate?: "daily" | "weekly" | "monthly" | "instant";
  iban?: string;
  bank_reference?: string;
  owner_name?: string;
  owner_address?: string;
  owner_complement?: string;
  owner_zip?: string;
  owner_city?: string;
  owner_country?: string;
  // Wallet config (allowed)
  wallet_config?: {
    zpub?: string;
    type?: string;
    label?: string;
    path?: string;
    account?: string;
    fingerprint?: string;
    onchainAddress?: string;
  };
  // Sign_message à consommer pour un changement de deposit_address
  message?: string;
};

// Réponse `PATCH /v1/accounts/{id}` :
// - succès direct (que des allowed) → `{otp_required: false}` (HTTP 204)
// - champs sensibles présents → `{otp_required: true}` (HTTP 202). Le
//   code OTP n'est PAS renvoyé dans la réponse — il vit uniquement dans
//   le magic-link envoyé à l'email du merchant. Le caller affiche un
//   "vérifie ton mail" ; le clic sur le magic-link redirige sur
//   `/validate-settings?id=<otp>` qui appelle `settings.validate({id})`.
export type AccountPatchResponse =
  | { otp_required: false }
  | { otp_required: true };

export type RequestResetPasswordBody = {
  email: string;
  lang?: string;
};

export type ResetPasswordBody = {
  id: string;
  newPassword: string;
};

export type RequestResetPincodeBody = {
  cardId: string;
  email: string;
  lang?: string;
};

export type ResetPincodeBody = {
  id: string;
  newPincode: string;
};

export type ResetPincodeResponse = {
  cardId: string;
};

export type ChangePasswordBody = {
  oldPassword: string;
  newPassword: string;
};

// POST /v1/auth/change-email — changement immédiat (pas de lien de
// confirmation, sémantique legacy) ; notification envoyée à l'ancienne
// adresse. 409 `email_already_used` si l'email appartient à un autre
// compte. 403 `account_suspended` si le compte est gelé, 404
// `account_not_found` s'il est fermé : l'adresse est l'identifiant de la
// relation d'affaires et le canal des avis de conformité (issue #258).
export type ChangeEmailBody = {
  currentPassword: string;
  newEmail: string;
};

export type ChangeEmailResponse = {
  email: string;
};

// POST /v1/accounts/create — création de compte merchant. Remplace
// l'ancienne route /signup. Le challenge sign_messages doit avoir été
// vérifié au préalable via /v1/accounts/verify-signature pour les flows
// non-ATM avec btc_percent > 0.
export type CreateAccountBody = {
  name: string;
  email: string;
  password: string;
  currency: string;
  language: string;
  timezone?: string;
  btc_percent: number;
  is_atm?: boolean;
  address?: string;
  iban?: string;
  bank_currency?: string;
  bank_reference?: string;
  owner_name?: string;
  owner_address?: string;
  owner_complement?: string;
  owner_zip?: string;
  owner_city?: string;
  owner_country?: string;
  message?: string;
  signature?: string;
  wallet_config?: {
    zpub?: string;
    type?: string;
    label?: string;
    path?: string;
    account?: string;
    fingerprint?: string;
  };
  referred_by?: string;
};

export type CreateAccountResponse = {
  machine_name: string;
  invoice_key: string;
};

// GET /v1/webhook-events — ce que le back-end a tenté de livrer au merchant.
//
// Un événement par transition de statut d'un paiement portant une config
// webhook ; une `WebhookAttempt` par appel HTTP réellement effectué.
//
// `attempt_count` est le compteur porté par l'événement (colonne `attempts`),
// `attempts` la liste des tentatives : les deux peuvent diverger, une tentative
// en cours n'ayant pas encore sa ligne d'audit.
//
// Timestamps en secondes Unix. `response_body` est tronqué à 500 caractères à
// l'écriture. `http_status` et `error` s'excluent : une réponse HTTP OU une
// panne réseau, jamais les deux.
export type WebhookAttempt = {
  attempt_number: number;
  started_at: number;
  completed_at: number | null;
  duration_ms: number | null;
  http_status: number | null;
  response_body: string | null;
  error: string | null;
};

export type WebhookEvent = {
  id: string;
  payment_id: string;
  event_type: string;
  url: string;
  status: "pending" | "in_progress" | "delivered" | "failed" | "abandoned";
  attempt_count: number;
  max_attempts: number;
  next_retry_at: number;
  created_at: number;
  updated_at: number;
  delivered_at: number | null;
  // Les VALEURS sont masquées (`"***"`) quand l'appel est authentifié par
  // api-key — elles portent les jetons configurés par le merchant. Les noms
  // restent visibles. En session (JWT), elles sont complètes.
  headers: Record<string, string> | null;
  // Corps notifié, en JSON natif. Sa forme suit celle du webhook sortant.
  payload: unknown;
  attempts: WebhookAttempt[];
};

export type WebhookEventsResponse = {
  events: WebhookEvent[];
  // À repasser en `cursor` pour la page suivante. `null` en fin de liste.
  next_cursor: string | null;
};

// ─── Wrappers ────────────────────────────────────────────────────────────

export function createCustomApis(client: Client) {
  return {
    accounts: {
      // GET /account — account du merchant courant résolu par auth context
      // (api-key OU JWT). Mode `api-key` → payload partiel (10 champs +
      // aliases legacy). Mode JWT → payload complet (mail, bank, kyc
      // détaillé, etc.). Le caller fait le narrowing par présence de
      // champs JWT-only (ex: `if (account.mail !== undefined)`).
      //
      // Nommé `me()` plutôt que `read()` pour ne pas collider avec le
      // `read(id)` Record API (qui est JWT-only par design TrailBase).
      me: (auth?: ApiKeyAuth): Promise<AccountReadResponse> =>
        fetchJson(client, "/account", withHeaders(apiKeyHeaders(auth))),

      // GET /v1/accounts/bank — fetch on-demand des infos beneficiary
      // MTPelerin du merchant courant. Cf. endpoints/merchants.ts.
      bank: (): Promise<GetAccountBankResponse> =>
        fetchJson(client, "/v1/accounts/bank"),

      // PATCH /v1/accounts/{id} — modifie l'account du merchant courant.
      // OVERRIDE le `update()` Record API natif : ce dernier est désactivé
      // côté backend (acl `[READ]` only) parce qu'il bypasse la logique
      // business. Le wrapper `apis.ts` merge ce `update` custom sur celui
      // du Record API ; le Proxy renvoie toujours cette implémentation.
      //
      // - Champs "allowed" → UPDATE direct → 204 → {otp_required: false}
      // - Champs "sensitive" présents → snapshot + email magic-link →
      //   202 → {otp_required: true}. Le code OTP n'est PAS exposé en
      //   réponse, il vit uniquement dans l'email. Le caller affiche
      //   "vérifie ton mail". Le clic sur le magic-link mène à
      //   `/validate-settings?id=<otp>` qui appelle `settings.validate`.
      //
      // `hmac_secret` et `is_checkout_secure` migrent dynamiquement :
      // - account sans hmac → allowed (premier set, pas d'OTP)
      // - account avec hmac → sensitive (re-modification, OTP requis)
      update: async (
        id: string,
        body: AccountPatchBody,
      ): Promise<AccountPatchResponse> => {
        const res = await client.fetch(`/v1/accounts/${id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
          headers: { "Content-Type": "application/json" },
        });
        if (res.status === 202) {
          return { otp_required: true };
        }
        if (!res.ok) {
          let detail = "";
          try {
            detail = await res.text();
          } catch {
            /* swallow */
          }
          throw new Error(
            `PATCH /v1/accounts/${id} failed: ${res.status} ${detail.slice(0, 200)}`,
          );
        }
        return { otp_required: false };
      },

      // POST /v1/accounts/create — crée un compte merchant. Remplace
      // l'ancienne route /signup (qui restera supprimée). Le challenge
      // sign_messages doit avoir été vérifié au préalable via
      // /v1/accounts/verify-signature pour les flows non-ATM.
      create: (body: CreateAccountBody): Promise<CreateAccountResponse> =>
        postJson(client, "/v1/accounts/create", body),

      // POST /v1/accounts/close — le merchant ferme son propre compte.
      // Remplace la route de suppression NATIVE du back-end, désormais fermée
      // au bord : celle-ci détruisait le dossier d'identification que la LBA
      // impose de conserver dix ans. Rien n'est supprimé, le compte est marqué
      // fermé et cesse d'encaisser (issue #224).
      //
      // Rejette en `409 account_has_pending_funds` tant que des encaissements
      // de payeurs sont en vol : ils doivent être versés au merchant avant la
      // fermeture. Un compte gelé est refusé en `403 account_suspended`.
      close: (): Promise<CloseAccountResponse> =>
        postJson(client, "/v1/accounts/close", {}),

      // GET /v1/accounts/limits — limites journalières/hebdo/mensuelles
      // courantes. Remplace GET /account-limits (legacy).
      limits: (): Promise<AccountLimits> =>
        fetchJson(client, "/v1/accounts/limits"),

      // POST /v1/accounts/kyc — créé une session KYC iDenfy.
      // Remplace POST /create-kyc-account (legacy).
      createKyc: (body: CreateKycBody): Promise<CreateKycResponse> =>
        postJson(client, "/v1/accounts/kyc", body),

      // GET /v1/accounts/referrals — liste des merchants parrainés + stats.
      referrals: (): Promise<AccountReferrals> =>
        fetchJson(client, "/v1/accounts/referrals"),

      // GET /v1/accounts/check-referral-code?refCode=… — le code de parrainage
      // existe-t-il ? Public (no auth) : appelé pendant la saisie du
      // formulaire d'inscription, donc avant qu'un compte existe.
      // Un code INCONNU n'est pas une erreur : il résout sur `{ valid: false }`,
      // à lire explicitement. Rejette en revanche sur erreur réseau/serveur et
      // sur un `refCode` vide ou de plus de 64 caractères (400 côté backend :
      // c'est une requête malformée, pas une réponse métier) — n'appeler
      // qu'avec une saisie non vide.
      checkReferralCode: (refCode: string): Promise<ReferralCodeCheck> =>
        fetchJson(
          client,
          `/v1/accounts/check-referral-code?refCode=${encodeURIComponent(refCode)}`,
        ),

      // POST /v1/accounts/verify-signature — vérifie la signature d'un
      // challenge précédemment retourné par verify-address. Public (no auth).
      verifySignature: (
        body: VerifySignatureBody,
      ): Promise<VerifySignatureResult> =>
        postJson(client, "/v1/accounts/verify-signature", body),

      // POST /v1/accounts/verify-address — créé un challenge à signer pour
      // prouver la possession d'une adresse onchain/xpub/LN. Public.
      verifyAddress: (
        body: VerifyAddressBody,
      ): Promise<VerifyAddressChallenge> =>
        postJson(client, "/v1/accounts/verify-address", body),

      // GET /v1/accounts/validate-xpub?xpub=… — valide la structure d'un xpub
      // sans déclencher de side-effect (pas d'inscription en DB).
      validateXpub: (xpub: string): Promise<XpubValidation> =>
        fetchJson(
          client,
          `/v1/accounts/validate-xpub?xpub=${encodeURIComponent(xpub)}`,
        ),

      // GET /v1/accounts/xpub-balance?xpub=… — solde on-chain et nombre de
      // transactions du compte, pour l'énumération des comptes d'un wallet
      // matériel. Une clé par appel. Public.
      xpubBalance: (xpub: string): Promise<XpubBalance> =>
        fetchJson(
          client,
          `/v1/accounts/xpub-balance?xpub=${encodeURIComponent(xpub)}`,
        ),

      // POST /v1/accounts/export — télécharge un export des paiements
      // settled du merchant courant. Format selon `body.exportType` :
      // CSV (`detailed`) ou PDF résumé (`simple`, défaut). Backend
      // renvoie directement le blob avec `Content-Disposition:
      // attachment; filename="..."` (filename localisé dispo via
      // `res.headers.get(...)` côté caller). Pas de flow async.
      export: (body: AccountExportBody): Promise<Blob> =>
        fetchBlob(client, "/v1/accounts/export", {
          method: "POST",
          body: JSON.stringify(body),
          headers: { "Content-Type": "application/json" },
        }),

      // GET /v1/accounts/kyc — dernière row `kyc` du merchant (incluant
      // le `token_string` pour reprendre une session en cours et le
      // snapshot `beneficiaries` pour les KYB). Renvoie `null` si aucune
      // session KYC n'a été créée (200 avec body `null`, pas 404). Pas de
      // fetch live iDenfy — la row est tenue en sync via les webhooks
      // iDenfy. Auth merchant JWT requis. Coexiste avec `createKyc` (POST
      // sur le même path).
      getKyc: (): Promise<KycResponse | null> =>
        fetchJson(client, "/v1/accounts/kyc"),

      // POST /v1/accounts/kyc/beneficiaries/{id}/reset — reset un
      // beneficiary KYB (typiquement expiré ou rejeté). Re-fait DELETE +
      // ADD_NEW_BENEFICIARY côté iDenfy, met à jour le snapshot avec le
      // nouvel id et envoie un mail au beneficiary. Refuse si le status
      // est déjà `accepted` (409) ou si l'email du beneficiary est vide.
      resetBeneficiaryKyc: (
        beneficiaryId: string,
      ): Promise<ResetBeneficiaryKycResponse> =>
        postNoBody(
          client,
          `/v1/accounts/kyc/beneficiaries/${encodeURIComponent(beneficiaryId)}/reset`,
        ),
    },

    wallets: {
      // GET /v1/wallets/balance — solde du wallet courant (sat) +
      // équivalents fiat optionnels. Mode card supporté.
      balance: (auth?: CardAuth): Promise<WalletBalance> =>
        fetchJson(
          client,
          "/v1/wallets/balance",
          withHeaders(cardAuthHeaders(auth)),
        ),

      // POST /v1/wallets/withdraw-fiat — déclenche un withdraw fiat via
      // MtPelerin (beneficiary IBAN).
      withdrawFiat: (body: WithdrawFiatBody): Promise<WithdrawFiatResponse> =>
        postJson(client, "/v1/wallets/withdraw-fiat", body),
    },

    apipayments: {
      // POST /checkout — PATH LEGACY INCHANGÉ (public, partenaires en prod).
      // Crée une invoice paiement et retourne {pr, checkoutUrl, …}.
      // Auth dual-mode (cf. resolveMerchant côté backend) : si `auth.apiKey`
      // est fourni, le header `api-key` est injecté pour ce call ; sinon
      // le SDK utilise ses cookies/JWT.
      checkout: (
        body: CheckoutBody,
        auth?: ApiKeyAuth,
      ): Promise<CheckoutResponse> =>
        postJson(client, "/checkout", body, apiKeyHeaders(auth)),

      // POST /v1/apipayments/settle-underpaid — settle admin manuel d'une
      // invoice underpaid (le merchant accepte le reliquat). Auth merchant.
      settleUnderpaid: (
        body: SettleUnderpaidBody,
      ): Promise<SettleUnderpaidResponse> =>
        postJson(client, "/v1/apipayments/settle-underpaid", body),

      // GET /v1/apipayments/by-card — liste des paiements du wallet d'une
      // card (auth via header `card-id`). Pagination simple `limit`
      // (max 200, défaut 50) / `offset`.
      byCard: (
        cardAuth: CardAuth,
        opts?: { limit?: number; offset?: number; search?: string },
      ): Promise<ApipaymentsByCardResponse> => {
        const qs = new URLSearchParams();
        if (opts?.limit !== undefined) qs.set("limit", String(opts.limit));
        if (opts?.offset !== undefined) qs.set("offset", String(opts.offset));
        // Recherche LIKE côté serveur (title/description/extra/tag).
        if (opts?.search) qs.set("q", opts.search);
        const suffix = qs.toString();
        return fetchJson(
          client,
          `/v1/apipayments/by-card${suffix ? `?${suffix}` : ""}`,
          withHeaders(cardAuthHeaders(cardAuth)),
        );
      },

      // GET /transaction-limit/{currency} — équivalent de 1000 CHF
      // converti dans la devise demandée. Supporte les fiats listées
      // dans `rates.current().rates`, plus "BTC" et "sat" (case-sensitive,
      // legacy). Renvoie un nombre brut (BTC sans arrondi, fiats/sat
      // arrondis à l'entier).
      limit: ({ currency }: { currency: string }): Promise<number> =>
        fetchJson(client, `/transaction-limit/${encodeURIComponent(currency)}`),
    },

    webhook_events: {
      // GET /v1/webhook-events — historique de livraison des notifications du
      // merchant courant, résolu par auth context (api-key OU JWT). Même
      // population sur les deux canaux ; seules les valeurs d'en-tête diffèrent
      // (masquées par api-key, cf. `WebhookEvent.headers`).
      //
      // Pagination par curseur : repasser `next_cursor` en `cursor` pour la
      // page suivante, s'arrêter quand il vaut `null`. Pas d'`offset` — des
      // événements s'insèrent en permanence, et un offset dériverait.
      //
      // `paymentId` accepte les trois graphies d'uuid (canonique, hex nu,
      // base64url). Une facture inconnue ou appartenant à un autre merchant
      // rend une liste vide, pas une erreur.
      list: (
        opts?: {
          cursor?: string;
          limit?: number;
          paymentId?: string;
          status?: WebhookEvent["status"];
        },
        auth?: ApiKeyAuth,
      ): Promise<WebhookEventsResponse> => {
        const qs = new URLSearchParams();
        if (opts?.cursor !== undefined) qs.set("cursor", opts.cursor);
        if (opts?.limit !== undefined) qs.set("limit", String(opts.limit));
        if (opts?.paymentId !== undefined) qs.set("payment_id", opts.paymentId);
        if (opts?.status !== undefined) qs.set("status", opts.status);
        const suffix = qs.toString();
        return fetchJson(
          client,
          `/v1/webhook-events${suffix ? `?${suffix}` : ""}`,
          withHeaders(apiKeyHeaders(auth)),
        );
      },
    },

    ln_addresses: {
      // POST /v1/ln-addresses/register — register définitif (paiement
      // requis si solde < seuil). Mode card uniquement : le backend résout la
      // card via le header `card-id` (+ `pin-code`), passés par CardAuth.
      register: (
        body: LnAddressRegisterBody,
        cardAuth: CardAuth,
      ): Promise<LnAddressRegisterResponse> =>
        postJson(
          client,
          "/v1/ln-addresses/register",
          body,
          cardAuthHeaders(cardAuth),
        ),
    },

    invoice_data: {
      // GET /v1/invoices/{id}/pdf — PDF de la facture (public, accès via
      // uuid v7 capability token). Renvoie un Blob. `tz` (IANA timezone,
      // ex: "Europe/Zurich") et `lng` (code 2 lettres) sont optionnels et
      // overrident respectivement la timezone du rendu et la langue
      // (sinon Accept-Language puis fallback "en").
      pdf: (
        id: string,
        opts?: { tz?: string; lng?: string },
      ): Promise<{ blob: Blob; filename: string | null }> => {
        const qs = new URLSearchParams();
        if (opts?.tz) qs.set("tz", opts.tz);
        if (opts?.lng) qs.set("lng", opts.lng);
        const suffix = qs.toString();
        return fetchBlobNamed(
          client,
          `/v1/invoices/${encodeURIComponent(id)}/pdf${suffix ? `?${suffix}` : ""}`,
        );
      },
    },

    push_subscriptions: {
      // GET /vapidPublicKey — PATH LEGACY INCHANGÉ (consommé par le SW
      // browser). Renvoie la clef publique VAPID.
      vapidPublicKey: (): Promise<VapidPublicKey> =>
        fetchJson(client, "/vapidPublicKey"),

      // POST /v1/push-subscription { action: "subscribe" } — enregistre la
      // souscription web-push du device courant (mode card : header
      // `card-id`). Le flow card n'a pas de JWT et les souscriptions ont
      // user_id NULL → la Record API create (acl_authenticated +
      // create_access_rule `_REQ_.user_id = _USER_.id`) ne peut pas servir ;
      // on passe par cet endpoint card-auth dédié.
      subscribe: (
        auth: CardAuth,
        subscription: WebPushSubscription,
      ): Promise<PushSubscribeResult> =>
        postJson(
          client,
          "/v1/push-subscription",
          { action: "subscribe", subscription },
          cardAuthHeaders(auth),
        ),

      // GET /v1/push-subscription?endpoint=… — statut web-push du device
      // courant (mode card : header `card-id`). Le flow card n'a pas de JWT
      // et les souscriptions ont user_id NULL → la Record API list ne les
      // voit pas ; on passe donc par cet endpoint card-auth dédié.
      deviceStatus: (
        auth: CardAuth,
        endpoint: string,
      ): Promise<PushDeviceStatus> =>
        fetchJson(
          client,
          `/v1/push-subscription?endpoint=${encodeURIComponent(endpoint)}`,
          withHeaders(cardAuthHeaders(auth)),
        ),

      // DELETE /v1/push-subscription — efface TOUTES les souscriptions de
      // la card (header `card-id`) et reset web_push_id +
      // two_fa_notification_threshold côté cards.
      clear: (auth: CardAuth): Promise<void> => {
        const init: Init = { method: "DELETE" };
        const headers = cardAuthHeaders(auth);
        if (headers) init.headers = headers;
        return fetchVoid(client, "/v1/push-subscription", init);
      },
    },

    cards: {
      // GET /v1/cards/me — payload de la card identifiée par le header
      // `card-id`. Mode card-auth (pas besoin du JWT user). Pendant
      // card-auth de `accounts.me()` côté merchants.
      me: (auth: CardAuth): Promise<CardMe> =>
        fetchJson(client, "/v1/cards/me", withHeaders(cardAuthHeaders(auth))),

      // PATCH /v1/cards/me — update les champs mutables de la card en
      // mode card-auth.
      //
      // - `locked` / `currency` / `two_fa_notification_threshold`, et la
      //   SUPPRESSION du PIN (`{pin_code: null}`) → 204 → `{otp_required:
      //   false}`.
      // - définir ou changer le PIN → exige `recovery_email` dans le même
      //   body → 202 → `{otp_required: true}`. Un magic-link part vers la
      //   NOUVELLE adresse de récupération ; rien n'est appliqué avant le
      //   clic (`/validate-settings?id=<otp>` → `settings.validate({id})`).
      //   Le caller doit afficher « vérifie ta boîte mail », PAS « PIN
      //   modifié ».
      updateMe: async (
        auth: CardAuth,
        body: CardUpdateMeBody,
      ): Promise<CardUpdateMeResponse> => {
        const res = await client.fetch("/v1/cards/me", {
          method: "PATCH",
          body: JSON.stringify(body),
          headers: {
            "Content-Type": "application/json",
            ...(cardAuthHeaders(auth) ?? {}),
          },
        });
        if (res.status === 202) return { otp_required: true };
        if (!res.ok) {
          let detail = "";
          try {
            detail = await res.text();
          } catch {
            /* swallow */
          }
          throw new Error(
            `PATCH /v1/cards/me failed: ${res.status} ${detail.slice(0, 200)}`,
          );
        }
        return { otp_required: false };
      },

      // POST /v1/cards/anonymous-ln-address — émet une lightning address
      // anonyme éphémère (TTL 7 jours) liée au wallet de la carte. La
      // carte est identifiée par le header `card-id` (hex 32). Throttle
      // 24h entre deux régénérations pour le même wallet.
      anonymousLnAddress: (auth: CardAuth): Promise<AnonymousLnAddress> =>
        postNoBody(
          client,
          "/v1/cards/anonymous-ln-address",
          cardAuthHeaders(auth) ?? {},
        ),
    },

    // ─── Domaines custom-only (pas de Record API associée) ────────────

    settings: {
      // POST /v1/settings/validate — valide un code OTP/email-verification
      // pour un flow settings sensibles. Utilisable par users `accounts`
      // ET `cards` (pas de rattachement à un domaine spécifique).
      validate: (body: SettingsValidateBody): Promise<void> =>
        postVoidJson(client, "/v1/settings/validate", body),
    },

    auth: {
      // POST /v1/auth/reset-password/request — déclenche l'envoi du mail
      // de reset password (best-effort, toujours 204 pour éviter
      // l'énumération).
      requestResetPassword: (body: RequestResetPasswordBody): Promise<void> =>
        postVoidJson(client, "/v1/auth/reset-password/request", body),

      // POST /v1/auth/reset-password — applique le nouveau mot de passe
      // après vérification du code envoyé par mail. Toutes les sessions
      // existantes sont révoquées (compte potentiellement compromis).
      resetPassword: (body: ResetPasswordBody): Promise<void> =>
        postVoidJson(client, "/v1/auth/reset-password", {
          id: body.id,
          new_password: body.newPassword,
        }),

      // POST /v1/auth/reset-pincode/request — mode card : envoie un mail
      // avec le lien de reset PIN.
      requestResetPincode: (body: RequestResetPincodeBody): Promise<void> =>
        postVoidJson(client, "/v1/auth/reset-pincode/request", {
          card_id: body.cardId,
          email: body.email,
          lang: body.lang,
        }),

      // POST /v1/auth/reset-pincode — mode card : applique le nouveau PIN.
      // Retourne `{cardId}` (UUID v7 hex) pour permettre au caller de
      // chaîner sur l'identité de la card touchée (ex: redirect login).
      resetPincode: (body: ResetPincodeBody): Promise<ResetPincodeResponse> =>
        postJson(client, "/v1/auth/reset-pincode", {
          id: body.id,
          new_pincode: body.newPincode,
        }),

      // POST /v1/auth/change-password — change le mot de passe (auth user).
      // Toutes les sessions sont révoquées, y compris la courante (les
      // access tokens déjà émis restent valides jusqu'à expiration,
      // `auth_token_ttl_sec`) — l'utilisateur doit se re-loguer ensuite.
      // Le backend attend un wire format snake_case — mapping ici pour
      // garder un body camelCase côté front.
      changePassword: (body: ChangePasswordBody): Promise<void> =>
        postVoidJson(client, "/v1/auth/change-password", {
          old_password: body.oldPassword,
          new_password: body.newPassword,
        }),

      // POST /v1/auth/change-email — change l'email du compte (auth user,
      // mot de passe courant requis). Changement immédiat + notification
      // à l'ancienne adresse. Retourne le nouvel email ; le token courant
      // embarque l'ancien email, le caller doit re-loguer / rafraîchir sa
      // session après un changement réussi. Un compte gelé (403
      // `account_suspended`) ou fermé (404 `account_not_found`) est refusé.
      changeEmail: (body: ChangeEmailBody): Promise<ChangeEmailResponse> =>
        postJson(client, "/v1/auth/change-email", {
          current_password: body.currentPassword,
          new_email: body.newEmail,
        }),
    },

    transactions: {
      // GET /v1/transactions/by-address/{address} — drop-in replacement
      // de l'ancien `https://stats.swiss-bitcoin-pay.ch/txs/{addr|xpub}`.
      // Accepte une adresse on-chain OU un xpub/ypub/zpub/tpub/upub/vpub
      // (auto-détection serveur). Pour un xpub, le serveur balaye les
      // addresses dérivées avec gap limit 20 — celui de BIP44 et des
      // applications de wallets, partagé avec `xpub-balance` — et retourne les
      // `nextInternal`/`nextChange` (prochaine adresse libre receive / change).
      // Pour une address simple, ces deux champs sont `null` et la vue est
      // TOUJOURS complète : tout l'historique de l'adresse est lu, sans plafond
      // de volume, à un rythme borné par lots et isolé des traitements métier
      // (#577). Une adresse très chargée répond donc lentement, jamais à moitié.
      //
      // Chaque tx est enrichie côté serveur avec :
      //   - `hex`     : raw hex (utilisé pour signer côté hardware wallet)
      //   - `value`   : net pour le wallet en SATOSHIS ENTIERS
      //     (Σ sorties à nous − Σ entrées à nous)
      //   - `vout[].value` : converti en SATOSHIS ENTIERS lui aussi. Toute la
      //     réponse est en sats, rien ne se reconvertit côté client.
      //   - `vout[].ourAddressConfig` (si le SCRIPT de la vout appartient
      //     au wallet) : `{index, change, isSpent}`. `isSpent` est calculé
      //     en cross-référence sur l'ensemble des tx du résultat.
      //
      // `complete: false` signale un balayage arrêté sur une borne.
      byAddress: (address: string): Promise<TransactionsByAddressResponse> =>
        fetchJson(
          client,
          `/v1/transactions/by-address/${encodeURIComponent(address)}`,
        ),

      // POST /v1/transactions/broadcast — broadcast d'une (ou plusieurs)
      // tx hex via Electrum/Fulcrum. `hex` polymorphique :
      //   - string  → response `{ txid: string }`
      //   - string[] → response `{ txids: string[] }` (iteration séquentielle,
      //     pas atomique : si un broadcast échoue, les précédents restent
      //     sur le mempool).
      broadcast: ((hex: string | string[]) =>
        postJson(client, "/v1/transactions/broadcast", { hex })) as {
        (hex: string): Promise<{ txid: string }>;
        (hex: string[]): Promise<{ txids: string[] }>;
      },

      // POST /v1/transactions/test-accept — testmempoolaccept multi-tx via
      // bitcoind. `rawtxs` 1..25 hex strings.
      testAccept: (rawtxs: string[]): Promise<{ results: unknown[] }> =>
        postJson(client, "/v1/transactions/test-accept", { rawtxs }),

      // POST /v1/transactions/broadcast-core — fallback broadcast direct
      // via bitcoind RPC (utile quand Electrum/Fulcrum est down). Mêmes
      // signatures polymorphiques que `broadcast`.
      broadcastCore: ((hex: string | string[]) =>
        postJson(client, "/v1/transactions/broadcast-core", { hex })) as {
        (hex: string): Promise<{ txid: string }>;
        (hex: string[]): Promise<{ txids: string[] }>;
      },
    },

    config: {
      // GET /v1/config — config publique du backend (réseau Bitcoin,
      // environnement, CDN, version min client). Public, no auth — à
      // appeler au bootstrap du front.
      get: (): Promise<AppConfig> => fetchJson(client, "/v1/config"),
    },

    currencies: {
      // GET /v1/currencies — devises servies et nombre de décimales de
      // chacune, `sat` et `BTC` compris. Public, no auth.
      list: (): Promise<CurrenciesResponse> =>
        fetchJson(client, "/v1/currencies"),
    },

    rates: {
      // GET /v1/rates/current — dernier rate par devise (public, no auth).
      current: (): Promise<RatesCurrent> =>
        fetchJson(client, "/v1/rates/current"),

      // GET /v1/rates/history — série historique BTC pour une devise.
      // Tous les params sont optionnels (défaut last 30j en CHF).
      // Window max 5 ans côté backend ; au-delà 400 `window_too_large`.
      history: (q?: RatesHistoryQuery): Promise<RatesHistoryResponse> => {
        const qs = new URLSearchParams();
        if (q?.start !== undefined) qs.set("start", String(q.start));
        if (q?.end !== undefined) qs.set("end", String(q.end));
        if (q?.unit !== undefined) qs.set("unit", q.unit);
        const suffix = qs.toString();
        return fetchJson(
          client,
          `/v1/rates/history${suffix ? `?${suffix}` : ""}`,
        );
      },
    },
  };
}

export type CustomApis = ReturnType<typeof createCustomApis>;
