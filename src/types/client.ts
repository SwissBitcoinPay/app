// AUTO-GENERATED — do not edit. Run `npm run gen:types` to refresh.
//
// Wrapper runtime au-dessus du client `trailbase`. Tous les consommateurs
// front passent par `api` / `client` (proxies deferred-init), `createWithFiles`
// (upload base64), `handleApiError` (parse + i18n des erreurs FetchError).
//
// Pré-requis côté front : `npm i trailbase i18next`.

import {
  FetchError,
  initClient,
  type Client,
  type Tokens,
} from "trailbase";
import type { TFunction } from "i18next";
import { createApis, type Apis } from "./api/apis.js";

export { FetchError };

// `process.env` est injecté par le bundler (vite/webpack/next) côté front.
// Déclaration ambient locale pour ne pas exiger `@types/node` sur le repo
// consommateur.
declare const process: { env: Record<string, string | undefined> };

// Type local matching la shape schema-derived de `std.FileUpload` côté
// TrailBase backend (cf. schemas/cdn_files.*.json). DIFFÈRE du `FileUpload`
// exporté par le package `trailbase` npm (qui décrit la shape READ retournée
// par l'objectstore après upload — `objectstore_path` requis, pas `filename`).
// On utilise CETTE shape pour la détection des champs file dans `FileFields<T>`,
// qui s'aligne sur les types générés depuis nos schemas.
export interface FileUpload {
  content_type?: string | null;
  filename: string;
  id?: string;
  mime_type?: string | null;
  original_filename?: string | null;
}

// Adapter de stockage persistant pour les tokens d'auth. Compatible
// avec `window.localStorage` (browser, sync), `AsyncStorage`
// (React Native, async), ou tout custom : Expo SecureStore, MMKV, etc.
// Les méthodes peuvent être sync ou async — `initApi()` await tout.
//
// Pourquoi un storage explicite : le backend trailbase NE POSE PAS de
// cookies en mode JSON (branche `if is_json` dans
// `crates/core/src/auth/api/login.rs`). Le SDK reçoit les tokens en
// JSON et les garde en mémoire uniquement — perdus au reload. À
// nous de persister via ce storage.
export type Storage = {
  getItem: (key: string) => string | null | Promise<string | null>;
  setItem: (key: string, value: string) => void | Promise<void>;
  removeItem: (key: string) => void | Promise<void>;
};

const TOKENS_KEY = "tb_tokens";

let _client: Client | undefined;
let _api: Apis | undefined;
let _ready: Promise<void> | undefined;

// Singleton promise : deux appels parallèles avant résolution se
// branchent sur la MÊME init (pas deux bootstraps en vol). Idempotent
// une fois résolue (early-return via le test `_client && _api`).
//
// Pas d'auto-fire : le bootstrap dépend du `storage` que seul le
// consommateur sait choisir (localStorage en browser, AsyncStorage en
// RN, etc.). À appeler explicitement avant tout usage de `api` /
// `client` (typiquement dans le bootstrap UI : `await initApi({storage})`
// avant le mount du root component).
export const initApi = (opts: { storage: Storage }): Promise<void> => {
  if (_client && _api) return Promise.resolve();
  if (_ready) return _ready;
  _ready = (async () => {
    const raw = await opts.storage.getItem(TOKENS_KEY);
    let initial: Tokens | undefined;
    if (raw) {
      try {
        initial = JSON.parse(raw) as Tokens;
      } catch {
        // Storage corrompu (rare) : on repart à blanc, le user
        // re-loggera. Pas de throw — on ne veut pas casser le boot.
      }
    }
    _client = initClient(process.env.API_ENDPOINT, {
      tokens: initial,
      onAuthChange: (c) => {
        const t = c.tokens();
        if (t) void opts.storage.setItem(TOKENS_KEY, JSON.stringify(t));
        else void opts.storage.removeItem(TOKENS_KEY);
      },
    });
    _api = createApis(_client);

    // Housekeeping fire-and-forget : si on avait des tokens persistés,
    // on déclenche un refresh en background pour valider la session.
    // Sur 401 (refresh expiré côté serveur), le SDK clear via
    // `onAuthChange(undefined)` → storage nettoyé, UI re-renderera en
    // logged-out. Pas await — `initApi()` résout sans attendre, comme
    // l'admin UI trailbase upstream.
    if (_client.tokens() !== undefined) {
      _client.refreshAuthToken().catch((err) => {
        if (err instanceof FetchError && err.status === 401) {
          // 401 attendu si refresh token invalide : le SDK a déjà
          // clearé l'état via onAuthChange. Rien à faire de plus.
          return;
        }
        // Autres erreurs (réseau, 5xx) : on log mais on n'invalide pas
        // les tokens — le prochain fetch retentera via shouldRefresh.
        console.debug("initApi: background refresh failed", err);
      });
    }
  })();
  return _ready;
};

const notReady = (name: string): never => {
  throw new Error(
    `\`${name}\` accessed before \`initApi()\` resolved. Bootstrap must await initApi() before rendering.`
  );
};

// Bind methods to the real instance so internal `this` mutations (e.g. token
// state inside `client.login`) land on `_client`, not on the proxy target.
const bindForwarder = <T extends object>(
  resolve: () => T
): ProxyHandler<T> => ({
  get: (_, prop) => {
    const target = resolve();
    const value = target[prop as keyof T];
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(target)
      : value;
  }
});

export const client = new Proxy<Client>(
  {} as Client,
  bindForwarder(() => _client ?? notReady("client"))
);

export const api = new Proxy<Apis>(
  {} as Apis,
  bindForwarder(() => _api ?? notReady("api"))
);

// Domaines avec une méthode `create` (Record APIs typées) — exclut les
// custom-only (`auth`, `rates`, `settings`).
type RecordApiKey = {
  [K in keyof Apis]: Apis[K] extends { create: (record: never) => unknown }
    ? K
    : never;
}[keyof Apis];

type InsertOf<K extends RecordApiKey> = Parameters<Apis[K]["create"]>[0];

// Remplace les champs typés `FileUpload` (schema-derived) par `File | null | undefined`
// dans une shape Insert. Les autres champs sont inchangés.
type FileFields<T> = {
  [P in keyof T]: [Extract<T[P], FileUpload>] extends [never]
    ? T[P]
    : NonNullable<T[P]> extends FileUpload
      ? null extends T[P]
        ? File | null | undefined
        : undefined extends T[P]
          ? File | null | undefined
          : File
      : T[P];
};

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

export type ApiErrorInfo = {
  field?: string;
  code?: string;
  status?: number;
  message: string;
};

// Parse les FetchError au format SBP `field:code` ou `code`, traduit via
// i18next la clé `errors.<code>` (fallback `errors.<fallbackKey>`).
export const handleApiError = (
  e: unknown,
  t: TFunction,
  fallbackKey = "default"
): ApiErrorInfo => {
  if (e instanceof FetchError) {
    const raw = e.message?.trim() ?? "";
    const [a, b] = raw.split(":");
    const field = b ? a : undefined;
    const code = b ?? a;
    const key = code ? `errors.${code}` : `errors.${fallbackKey}`;
    const fallback = t(`errors.${fallbackKey}`);
    const translated = t(key, { defaultValue: fallback });
    return { field, code, status: e.status, message: translated };
  }
  return { message: t(`errors.${fallbackKey}`) };
};

// Crée un record en convertissant les champs `File` en payloads
// `{filename, content_type, data}` (base64). Pour les Record APIs ayant
// au moins un champ `std.FileUpload` (typiquement `cdn_files`).
export const createWithFiles = async <K extends RecordApiKey>(
  apiName: K,
  record: FileFields<InsertOf<K>>
): Promise<string> => {
  const payload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record as Record<string, unknown>)) {
    if (v == null) continue;
    if (v instanceof File) {
      payload[k] = {
        filename: v.name,
        content_type: v.type || null,
        data: await fileToBase64(v)
      };
    } else {
      payload[k] = v;
    }
  }
  const res = await client.fetch(`/api/records/v1/${String(apiName)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const { ids } = (await res.json()) as { ids: string[] };
  return ids[0];
};
