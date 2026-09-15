// AUTO-GENERATED — do not edit. Run `npm run gen:types` to refresh.
//
// Coercion bool ↔ int :
// SQLite stocke les booléens comme INTEGER (0/1). Les colonnes
// listées dans BOOL_COLUMNS — détectées au build par scan des
// migrations sur le pattern `CHECK(<col> IN (0, 1))` — sont
// converties à la frontière du SDK :
//   - écriture (create/createBulk/update) : true/false → 1/0
//   - lecture  (read/list)                : 1/0 → true/false
// Côté types, les .select/.insert/.update.ts émettent déjà
// `boolean` (au lieu de `number`) pour ces colonnes — patch
// JSON Schema appliqué par scripts/gen-frontend-types.sh.
// Compat : si un caller passe un nombre (0/1) en écriture, on
// le laisse passer tel quel (test `typeof === "boolean"`).
//
// Conversion BLOB UUID → UUID dashed :
// TrailBase renvoie les colonnes BLOB en base64url +pad. On
// post-process toutes les responses (read/list/subscribe) pour
// convertir les BLOB 16 bytes en UUID dashed canonique. Cohérent
// avec le format accepté en input par TrailBase, donc un id
// reçu peut être re-injecté tel quel dans n'importe quel call.
import type {
  Client,
  RecordApi,
  RecordId,
  ListOpts,
  FilterOrComposite,
  ListResponse,
  ListOperation,
  ReadOpts,
  ReadOperation,
  CreateOperation,
  UpdateOperation,
  DeleteOperation,
  SubscribeOpts,
  SubscribeFilterOpts,
  ChangeEvent,
} from "trailbase";
import { createCustomApis, type CustomApis } from "./api/custom_endpoints.js";

import type { AccountsSelect } from "./accounts.select.js";
import type { AccountsInsert } from "./accounts.insert.js";
import type { AccountsUpdate } from "./accounts.update.js";
import type { ApipaymentsSelect } from "./apipayments.select.js";
import type { ApipaymentsInsert } from "./apipayments.insert.js";
import type { ApipaymentsUpdate } from "./apipayments.update.js";
import type { AutoExportListSelect } from "./auto_export_list.select.js";
import type { AutoExportListInsert } from "./auto_export_list.insert.js";
import type { AutoExportListUpdate } from "./auto_export_list.update.js";
import type { BusinessDataSelect } from "./business_data.select.js";
import type { BusinessDataInsert } from "./business_data.insert.js";
import type { BusinessDataUpdate } from "./business_data.update.js";
import type { CardsSelect } from "./cards.select.js";
import type { CardsInsert } from "./cards.insert.js";
import type { CardsUpdate } from "./cards.update.js";
import type { CdnFilesSelect } from "./cdn_files.select.js";
import type { CdnFilesInsert } from "./cdn_files.insert.js";
import type { CdnFilesUpdate } from "./cdn_files.update.js";
import type { FeesSelect } from "./fees.select.js";
import type { FeesInsert } from "./fees.insert.js";
import type { FeesUpdate } from "./fees.update.js";
import type { InvoiceDataSelect } from "./invoice_data.select.js";
import type { InvoiceDataInsert } from "./invoice_data.insert.js";
import type { InvoiceDataUpdate } from "./invoice_data.update.js";
import type { LnAddressesSelect } from "./ln_addresses.select.js";
import type { LnAddressesInsert } from "./ln_addresses.insert.js";
import type { LnAddressesUpdate } from "./ln_addresses.update.js";
import type { PushSubscriptionsSelect } from "./push_subscriptions.select.js";
import type { PushSubscriptionsInsert } from "./push_subscriptions.insert.js";
import type { PushSubscriptionsUpdate } from "./push_subscriptions.update.js";
import type { WalletsSelect } from "./wallets.select.js";
import type { WalletsInsert } from "./wallets.insert.js";
import type { WalletsUpdate } from "./wallets.update.js";

// Colonnes int-bool par table (scan migrations `CHECK(col IN (0,1))`).
export const BOOL_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  accounts: ["is_checkout_secure", "is_lightning_available", "is_onchain_available", "is_swiss"],
  cards: ["locked"],
  ln_addresses: ["anonymous", "enabled"],
  wallets: ["banned"],
} as const;

// Colonnes BLOB UUID par table (scan migrations `BLOB` + is_uuid_v7/REFERENCES).
// typed() ré-encode les valeurs de filtre `list` de ces colonnes (UUID
// dashed → base64url 16 bytes) avant l'envoi : le filtre BLOB côté serveur
// base64url-décode la valeur brute et ne reconnaît pas un UUID dashed.
export const BLOB_UUID_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  accounts: ["id", "logo_asset_id", "referred_by", "wallet_id"],
  apipayments: ["id", "wallet_id"],
  auto_export_list: ["account_id", "id"],
  business_data: ["account_id"],
  cards: ["card_design_id", "id", "user_id", "wallet_id"],
  cdn_files: ["id", "uploaded_by"],
  fees: ["id"],
  invoice_data: ["account_id", "payment_id"],
  ln_addresses: ["id", "wallet_id"],
  push_subscriptions: ["card_id", "id", "user_id"],
  wallets: ["id", "user_id"],
} as const;

// CRUD typé : Select pour list/read, Insert pour create, Update pour update.
export interface TypedRecordApi<S, I, U> {
  list(opts?: ListOpts): Promise<ListResponse<S>>;
  listOp(opts?: ListOpts): ListOperation<S>;

  read(id: RecordId, opt?: ReadOpts): Promise<S>;
  readOp(id: RecordId, opt?: ReadOpts): ReadOperation<S>;

  create(record: I): Promise<RecordId>;
  createOp(record: I): CreateOperation<I>;
  createBulk(records: I[]): Promise<RecordId[]>;

  update(id: RecordId, record: Partial<U>): Promise<void>;
  updateOp(id: RecordId, record: Partial<U>): UpdateOperation;

  delete(id: RecordId): Promise<void>;
  deleteOp(id: RecordId): DeleteOperation;

  subscribe(
    id: RecordId,
    opts?: SubscribeOpts,
  ): Promise<ReadableStream<ChangeEvent>>;
  subscribeAll(
    opts?: SubscribeOpts & SubscribeFilterOpts,
  ): Promise<ReadableStream<ChangeEvent>>;
}

// Sérialise true/false → 1/0 sur les colonnes listées. Les autres
// valeurs (incluant un nombre 0/1 passé directement) sont inchangées.
function serializeBools(
  input: unknown,
  cols: readonly string[],
): unknown {
  if (input == null || typeof input !== "object" || cols.length === 0) {
    return input;
  }
  const src = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(src)) {
    const v = src[k];
    out[k] = cols.includes(k) && typeof v === "boolean" ? (v ? 1 : 0) : v;
  }
  return out;
}

// Désérialise 1/0 → true/false sur les colonnes listées. Préserve
// `null` (colonnes nullable) et toute valeur non-numérique.
function deserializeBools<T>(input: T, cols: readonly string[]): T {
  if (input == null || typeof input !== "object" || cols.length === 0) {
    return input;
  }
  const src = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(src)) {
    const v = src[k];
    out[k] = cols.includes(k) && (v === 0 || v === 1) ? Boolean(v) : v;
  }
  return out as T;
}

// Détection conservative d'un BLOB UUID 16 bytes encodé en base64url +pad
// par TrailBase : exactement 22 chars de base64url suivis de `==`. Un BLOB
// non-UUID de 16 bytes (clé AES, hash MD5) matche aussi syntaxiquement —
// faux positif acceptable puisque la conversion en UUID dashed reste
// idempotente côté serveur (`strict_parse_string_to_sqlite_value` accepte
// les deux formats en input).
const BLOB_UUID_RE = /^[A-Za-z0-9_-]{22}==$/;

function base64UrlBlob16ToUuid(s: string): string | null {
  const std = s.replace(/-/g, "+").replace(/_/g, "/");
  let bin: string;
  try {
    bin = atob(std);
  } catch {
    return null;
  }
  if (bin.length !== 16) return null;
  let hex = "";
  for (let i = 0; i < 16; i++) {
    hex += bin.charCodeAt(i).toString(16).padStart(2, "0");
  }
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

// Walk récursif : convertit toutes les strings qui sont des BLOB UUID 16
// bytes en base64url +pad → UUID dashed (`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`).
// Préserve la structure (array / object / null / primitives autres). Le
// serveur accepte les deux formats en input (cf. TrailBase `strict_parse_
// string_to_sqlite_value` 36-char branch), donc on peut re-injecter le
// UUID dashed dans n'importe quel call API sans conversion inverse.
function convertBlobIdsToDashed(value: unknown): unknown {
  if (typeof value === "string") {
    if (BLOB_UUID_RE.test(value)) {
      const dashed = base64UrlBlob16ToUuid(value);
      if (dashed !== null) return dashed;
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(convertBlobIdsToDashed);
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = convertBlobIdsToDashed(v);
    }
    return out;
  }
  return value;
}

// Inverse de base64UrlBlob16ToUuid : UUID dashed (36 chars) → base64url
// (+pad canonique) des 16 bytes. C'est le SEUL format que le filtre BLOB
// `list` côté serveur sait matcher : il base64url-décode la valeur brute du
// query-param (pas de branche UUID-dashed, contrairement au parsing des
// bodies/ids). Retourne null si l'entrée n'est pas un UUID 16 bytes (valeur
// alors laissée inchangée — colonnes/valeurs non concernées).
const DASHED_UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function dashedUuidToBase64Url16(uuid: string): string | null {
  if (!DASHED_UUID_RE.test(uuid)) return null;
  const hex = uuid.replace(/-/g, "");
  let bin = "";
  for (let i = 0; i < 16; i++) {
    bin += String.fromCharCode(parseInt(hex.slice(i * 2, i * 2 + 2), 16));
  }
  // btoa conserve le padding `=` (le moteur URL_SAFE serveur l'exige) ; on
  // bascule juste vers l'alphabet url-safe.
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_");
}

// Ré-écrit les filtres `list` : pour chaque feuille dont la colonne est une
// colonne BLOB UUID (BLOB_UUID_COLUMNS), convertit la valeur dashed en
// base64url 16 bytes. Récursif sur les composites `$and`/`$or`. Les autres
// colonnes et les valeurs non-UUID restent inchangées.
function encodeBlobUuidFilters(
  filters: readonly FilterOrComposite[],
  blobCols: readonly string[],
): FilterOrComposite[] {
  return filters.map(function rewrite(f): FilterOrComposite {
    if ("and" in f) return { and: f.and.map(rewrite) };
    if ("or" in f) return { or: f.or.map(rewrite) };
    if (blobCols.includes(f.column)) {
      const enc = dashedUuidToBase64Url16(f.value);
      if (enc !== null) return { ...f, value: enc };
    }
    return f;
  });
}

function typed<S, I, U>(client: Client, name: string): TypedRecordApi<S, I, U> {
  // Le client TrailBase paramètre RecordApi<T> sur un seul T. On crée
  // l'instance avec S (Select = canonical read shape) et on cast pour les
  // méthodes write.
  const raw = client.records<S>(name);
  const cols = BOOL_COLUMNS[name] ?? [];
  const blobCols = BLOB_UUID_COLUMNS[name] ?? [];

  // Pipeline désérialisation : convertit d'abord les BLOB UUID 16 bytes en
  // UUID dashed (`convertBlobIdsToDashed`), puis applique la coercion 0/1
  // → boolean sur les colonnes listées. Ordre indifférent en pratique
  // (les deux opèrent sur des clés disjointes) mais on garde celui-ci pour
  // que le walk générique BLOB s'applique aussi aux objects renvoyés par
  // FK expansion (`{id, data: {...}}`).
  const deserializeRow = (rec: unknown): S => {
    const withUuids = convertBlobIdsToDashed(rec);
    return deserializeBools(withUuids as S, cols);
  };

  // Proxy de coercion sur les 6 méthodes CRUD + subscribe. Les *Op et
  // delete tombent sur Reflect.get avec `target` comme receiver pour que
  // `this._client` interne du SDK reste lié à l'instance brute.
  const handler: ProxyHandler<RecordApi<S>> = {
    get(target, prop) {
      switch (prop) {
        case "create":
          return (record: I): Promise<RecordId> =>
            target.create(serializeBools(record, cols) as never);
        case "createBulk":
          return (records: I[]): Promise<RecordId[]> =>
            target.createBulk(
              records.map((r) => serializeBools(r, cols)) as never[],
            );
        case "update":
          return (id: RecordId, record: Partial<U>): Promise<void> =>
            target.update(id, serializeBools(record, cols) as never);
        case "read":
          return async (id: RecordId, opts?: ReadOpts): Promise<S> => {
            const r = await target.read(id, opts);
            return deserializeRow(r);
          };
        case "list":
          return async (opts?: ListOpts): Promise<ListResponse<S>> => {
            const patched =
              opts?.filters && blobCols.length > 0
                ? {
                    ...opts,
                    filters: encodeBlobUuidFilters(opts.filters, blobCols),
                  }
                : opts;
            const r = await target.list(patched);
            return {
              ...r,
              records: r.records.map((rec) => deserializeRow(rec)),
            };
          };
        case "subscribe":
          return async (
            id: RecordId,
            opts?: SubscribeOpts,
          ): Promise<ReadableStream<ChangeEvent>> => {
            const stream = await target.subscribe(id, opts);
            return stream.pipeThrough(
              new TransformStream<ChangeEvent, ChangeEvent>({
                transform(ev, ctrl) {
                  ctrl.enqueue(convertBlobIdsToDashed(ev) as ChangeEvent);
                },
              }),
            );
          };
        case "subscribeAll":
          return async (
            opts?: SubscribeOpts & SubscribeFilterOpts,
          ): Promise<ReadableStream<ChangeEvent>> => {
            const stream = await target.subscribeAll(opts);
            return stream.pipeThrough(
              new TransformStream<ChangeEvent, ChangeEvent>({
                transform(ev, ctrl) {
                  ctrl.enqueue(convertBlobIdsToDashed(ev) as ChangeEvent);
                },
              }),
            );
          };
        default:
          return Reflect.get(target, prop, target);
      }
    },
  };
  return new Proxy(raw, handler) as unknown as TypedRecordApi<S, I, U>;
}

// Merge des Record APIs typées + endpoints JS custom (api/custom_endpoints.ts).
// `customSlice` retourne typé `CustomApis[K]` si K est un domaine déclaré,
// sinon un objet vide — préserve le typage strict des méthodes custom.
// `Record<never, never>` (PAS `Record<string, never>`) pour le cas vide :
// son `keyof` vaut `never`, donc le `Omit<T, keyof U>` de `merge` préserve
// les méthodes CRUD. `Record<string, never>` (keyof = string) les
// effacerait toutes → `api.<table sans slice custom>` deviendrait non typé.
function customSlice<K extends string>(
  custom: CustomApis,
  key: K,
): K extends keyof CustomApis ? CustomApis[K] : Record<never, never> {
  const slice = (custom as Record<string, unknown>)[key];
  return (slice ?? {}) as K extends keyof CustomApis
    ? CustomApis[K]
    : Record<never, never>;
}

// IMPORTANT : merge via Proxy, pas via `{ ...base, ...extra }`.
// `client.records(name)` retourne une instance de `RecordApiImpl` dont
// `list/read/create/update/delete/subscribe` vivent sur le prototype.
// Le spread ne copie que les propriétés own enumerable, donc supprime
// silencieusement toutes les méthodes du SDK (symptôme :
// `api.accounts.read is not a function`).
//
// Le `Reflect.get(target, prop, target)` (3e argument = receiver explicite
// sur l'instance, pas sur le proxy) est crucial : sans ça, les méthodes
// internes qui font `this._client.fetch(...)` recevraient le proxy comme
// `this` et casseraient les accès aux champs privés.
//
// Type signature : `Omit<T, keyof U> & U` reflète le comportement runtime
// du Proxy (extra écrase base sur les clés communes). Sans ça, une
// intersection `T & U` produit pour les méthodes en collision un overload
// flou — ex: `update` côté `accounts` perdrait son retour spécifique
// `Promise<AccountPatchResponse>` au profit de `Promise<void>` du SDK.
function merge<T extends object, U extends object>(
  base: T,
  extra: U,
): Omit<T, keyof U> & U {
  return new Proxy(base, {
    get: (target, prop) =>
      prop in extra
        ? (extra as Record<PropertyKey, unknown>)[prop as string]
        : Reflect.get(target, prop, target),
  }) as unknown as Omit<T, keyof U> & U;
}

export function createApis(client: Client) {
  const _custom = createCustomApis(client);
  return {
    accounts: merge(typed<AccountsSelect, AccountsInsert, AccountsUpdate>(client, "accounts"), customSlice(_custom, "accounts")),
    apipayments: merge(typed<ApipaymentsSelect, ApipaymentsInsert, ApipaymentsUpdate>(client, "apipayments"), customSlice(_custom, "apipayments")),
    auto_export_list: merge(typed<AutoExportListSelect, AutoExportListInsert, AutoExportListUpdate>(client, "auto_export_list"), customSlice(_custom, "auto_export_list")),
    business_data: merge(typed<BusinessDataSelect, BusinessDataInsert, BusinessDataUpdate>(client, "business_data"), customSlice(_custom, "business_data")),
    cards: merge(typed<CardsSelect, CardsInsert, CardsUpdate>(client, "cards"), customSlice(_custom, "cards")),
    cdn_files: merge(typed<CdnFilesSelect, CdnFilesInsert, CdnFilesUpdate>(client, "cdn_files"), customSlice(_custom, "cdn_files")),
    fees: merge(typed<FeesSelect, FeesInsert, FeesUpdate>(client, "fees"), customSlice(_custom, "fees")),
    invoice_data: merge(typed<InvoiceDataSelect, InvoiceDataInsert, InvoiceDataUpdate>(client, "invoice_data"), customSlice(_custom, "invoice_data")),
    ln_addresses: merge(typed<LnAddressesSelect, LnAddressesInsert, LnAddressesUpdate>(client, "ln_addresses"), customSlice(_custom, "ln_addresses")),
    push_subscriptions: merge(typed<PushSubscriptionsSelect, PushSubscriptionsInsert, PushSubscriptionsUpdate>(client, "push_subscriptions"), customSlice(_custom, "push_subscriptions")),
    wallets: merge(typed<WalletsSelect, WalletsInsert, WalletsUpdate>(client, "wallets"), customSlice(_custom, "wallets")),
    auth: customSlice(_custom, "auth"),
    config: customSlice(_custom, "config"),
    currencies: customSlice(_custom, "currencies"),
    rates: customSlice(_custom, "rates"),
    settings: customSlice(_custom, "settings"),
    transactions: customSlice(_custom, "transactions"),
  };
}

export type Apis = ReturnType<typeof createApis>;
