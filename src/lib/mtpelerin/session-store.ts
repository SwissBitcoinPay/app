import * as SecureStore from "expo-secure-store";

import {
  MTPELERIN_SESSION_KEY,
  NewerMtpSessionError,
  emptyMtpSession,
  isRecordOf,
  parseMtpSession,
  serializeMtpSession,
  type MtpDeviceRecord,
  type MtpSessionOwner
} from "./session-format";

/*
 * This device's copy of the Mt Pelerin session (session-format.ts), in the secure storage: without
 * biometrics, out of the iCloud and Google backups (THIS_DEVICE_ONLY): a restored device takes the
 * session from the relays, the account open (session-sync.ts), or logs in again by SMS. Gone
 * with "Log out" (wipeDevice); "Log out of Mt Pelerin" drops its token. Same API on
 * the web: session-store.web.ts.
 */

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY
};

/** One change at a time: each reads the record the previous one wrote. */
let queue: Promise<unknown> = Promise.resolve();

function serial<T>(run: () => Promise<T>): Promise<T> {
  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
}

async function read(): Promise<MtpDeviceRecord | null | "newer"> {
  return parseMtpSession(await SecureStore.getItemAsync(MTPELERIN_SESSION_KEY, OPTIONS));
}

/** `owner`'s record, empty when there is none of it (another account's or Mt Pelerin's, a newer
 * app's too). */
export async function loadMtpSession(owner: MtpSessionOwner): Promise<MtpDeviceRecord> {
  const stored = await read();
  return stored !== "newer" && isRecordOf(stored, owner) ? stored : emptyMtpSession(owner);
}

/**
 * Changes `owner`'s record (another's is replaced: one Mt Pelerin session at a time, the other
 * Mt Pelerin's back from the relays once chosen again);
 * resolves with what was written. A newer app's is never written over (NewerMtpSessionError).
 */
export function changeMtpSession(
  owner: MtpSessionOwner,
  update: (record: MtpDeviceRecord) => MtpDeviceRecord
): Promise<MtpDeviceRecord> {
  return serial(async () => {
    const stored = await read();
    if (stored === "newer") throw new NewerMtpSessionError();
    const next = update(isRecordOf(stored, owner) ? stored : emptyMtpSession(owner));
    await SecureStore.setItemAsync(MTPELERIN_SESSION_KEY, serializeMtpSession(next), OPTIONS);
    return next;
  });
}

/** Removes the whole record, any account's. */
export function forgetMtpSession(): Promise<void> {
  return serial(() => SecureStore.deleteItemAsync(MTPELERIN_SESSION_KEY, OPTIONS));
}
