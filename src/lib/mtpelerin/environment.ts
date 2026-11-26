import { getAppInfo } from "@/lib/app-info";

/*
 * The Mt Pelerin of each app: the production app talks to Mt Pelerin
 * itself, its login by SMS only; every other build (the staging app)
 * to Mt Pelerin's dev/test environment, its login by the account's signature (the SMS
 * does not exist there). Each keeps its own session, on the device and on the account's relays
 * (session-sync.ts): a token of one is never sent to the other.
 */

export const MTP_ENVIRONMENTS = ["test", "production"] as const;

export type MtpEnvironment = (typeof MTP_ENVIRONMENTS)[number];

export function isMtpEnvironment(value: unknown): value is MtpEnvironment {
  return typeof value === "string" && (MTP_ENVIRONMENTS as readonly string[]).includes(value);
}

/** This build's Mt Pelerin: production in the production app only, never by default. */
export function appMtpEnvironment(): MtpEnvironment {
  return getAppInfo().variant === "production" ? "production" : "test";
}
