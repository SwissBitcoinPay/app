import type { BreezNetwork } from "@/lib/breez/config";

import {
  ONCHAIN_POOL_KEY,
  REGISTRY_RECORD_KEY,
  TERMINAL_OPTIONS_KEY,
  BRANDING_RECORD_KEY,
  CATALOG_RECORD_KEY,
  PASSKEY_RECORD_KEY,
  TERMINAL_PROFILE_KEY,
  parseOnchainPool,
  parseRegistryRecord,
  parseTerminalOptions,
  parseBrandingRecord,
  parseCatalogRecord,
  parsePasskeyRecord,
  parseTerminalProfile,
  type OnchainPool,
  type RegistryRecord,
  type TerminalOptions,
  type BrandingRecord,
  type CatalogRecord,
  type PasskeyRecord,
  type TerminalProfile
} from "./model";

/**
 * Same API as profile.ts, in the browser's `localStorage`: the web has no secure storage, and the
 * profile holds no secret (a public key and a Lightning address). In this browser only, gone with
 * the site data (Safari clears it after 7 days without a visit, as the merchant settings).
 */

export async function loadTerminalProfile(): Promise<TerminalProfile | null> {
  try {
    const stored = localStorage.getItem(TERMINAL_PROFILE_KEY);
    return stored === null ? null : parseTerminalProfile(JSON.parse(stored));
  } catch {
    return null;
  }
}

export async function saveTerminalProfile(profile: TerminalProfile): Promise<void> {
  localStorage.setItem(TERMINAL_PROFILE_KEY, JSON.stringify(profile));
}

export async function clearTerminalProfile(): Promise<void> {
  localStorage.removeItem(TERMINAL_PROFILE_KEY);
}

export async function loadOnchainPool(network: BreezNetwork): Promise<OnchainPool | null> {
  try {
    const stored = localStorage.getItem(ONCHAIN_POOL_KEY);
    return stored === null ? null : parseOnchainPool(JSON.parse(stored), network);
  } catch {
    return null;
  }
}

export async function saveOnchainPool(pool: OnchainPool): Promise<void> {
  localStorage.setItem(ONCHAIN_POOL_KEY, JSON.stringify(pool));
}

export async function loadRegistryRecord(): Promise<RegistryRecord | null> {
  try {
    const stored = localStorage.getItem(REGISTRY_RECORD_KEY);
    return stored === null ? null : parseRegistryRecord(JSON.parse(stored));
  } catch {
    return null;
  }
}

export async function saveRegistryRecord(record: RegistryRecord): Promise<void> {
  localStorage.setItem(REGISTRY_RECORD_KEY, JSON.stringify(record));
}

export async function loadTerminalOptions(): Promise<TerminalOptions | null> {
  try {
    const stored = localStorage.getItem(TERMINAL_OPTIONS_KEY);
    return stored === null ? null : parseTerminalOptions(JSON.parse(stored));
  } catch {
    return null;
  }
}

export async function saveTerminalOptions(options: TerminalOptions): Promise<void> {
  localStorage.setItem(TERMINAL_OPTIONS_KEY, JSON.stringify(options));
}

/** The business's logo and the user's photo saved in this browser (model.ts), null when none. */
export async function loadBrandingRecord(): Promise<BrandingRecord | null> {
  try {
    const stored = localStorage.getItem(BRANDING_RECORD_KEY);
    return stored === null ? null : parseBrandingRecord(JSON.parse(stored));
  } catch {
    return null;
  }
}

export async function saveBrandingRecord(record: BrandingRecord): Promise<void> {
  localStorage.setItem(BRANDING_RECORD_KEY, JSON.stringify(record));
}

export async function loadCatalogRecord(): Promise<CatalogRecord | null> {
  try {
    const stored = localStorage.getItem(CATALOG_RECORD_KEY);
    return stored === null ? null : parseCatalogRecord(JSON.parse(stored));
  } catch {
    return null;
  }
}

export async function saveCatalogRecord(record: CatalogRecord): Promise<void> {
  localStorage.setItem(CATALOG_RECORD_KEY, JSON.stringify(record));
}

export async function loadPasskeyRecord(): Promise<PasskeyRecord | null> {
  try {
    const stored = localStorage.getItem(PASSKEY_RECORD_KEY);
    return stored === null ? null : parsePasskeyRecord(JSON.parse(stored));
  } catch {
    return null;
  }
}

export async function savePasskeyRecord(record: PasskeyRecord): Promise<void> {
  localStorage.setItem(PASSKEY_RECORD_KEY, JSON.stringify(record));
}
