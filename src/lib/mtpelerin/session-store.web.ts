import {
  emptyMtpSession,
  isRecordOf,
  type MtpDeviceRecord,
  type MtpSessionOwner
} from "./session-format";

/*
 * Same API as session-store.ts, in the browser: in this page's memory only. A refresh token is a
 * credential, and a browser has no storage its page's scripts cannot read (`localStorage` is
 * theirs): kept there, any script running in the page could take the session. Each visit takes it
 * from the relays instead, the account open (session-sync.ts), as the account's other devices do;
 * without a session there, it logs in by SMS.
 */

let memory: MtpDeviceRecord | null = null;

const copy = (record: MtpDeviceRecord): MtpDeviceRecord => ({
  ...record,
  paidValidations: [...record.paidValidations]
});

export async function loadMtpSession(owner: MtpSessionOwner): Promise<MtpDeviceRecord> {
  return isRecordOf(memory, owner) ? copy(memory) : emptyMtpSession(owner);
}

export async function changeMtpSession(
  owner: MtpSessionOwner,
  update: (record: MtpDeviceRecord) => MtpDeviceRecord
): Promise<MtpDeviceRecord> {
  memory = update(isRecordOf(memory, owner) ? copy(memory) : emptyMtpSession(owner));
  return copy(memory);
}

export async function forgetMtpSession(): Promise<void> {
  memory = null;
}
