/**
 * In-memory fake of expo-secure-store (Keychain / Keystore under Jest), emptied before each test.
 * An item is its key in the app's own service (`items`); an item of another keychain service or
 * access group (iOS: another item, as the keychain keeps it) is in `sharedItems`, by
 * `service|group|key`.
 */
export const AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY = 5;

export const items = new Map<string, string>();
export const sharedItems = new Map<string, string>();

export function resetSecureStore(): void {
  items.clear();
  sharedItems.clear();
}

type Options = {
  keychainAccessible?: number;
  requireAuthentication?: boolean;
  keychainService?: string;
  accessGroup?: string;
};

function storeOf(key: string, options?: Options): [Map<string, string>, string] {
  if (!options?.keychainService && !options?.accessGroup) return [items, key];
  return [sharedItems, `${options.keychainService ?? "app"}|${options.accessGroup ?? ""}|${key}`];
}

export const getItemAsync = jest.fn(async (key: string, options?: Options) => {
  const [store, id] = storeOf(key, options);
  return store.get(id) ?? null;
});

export const setItemAsync = jest.fn(async (key: string, value: string, options?: Options) => {
  const [store, id] = storeOf(key, options);
  store.set(id, value);
});

export const deleteItemAsync = jest.fn(async (key: string, options?: Options) => {
  const [store, id] = storeOf(key, options);
  store.delete(id);
});
