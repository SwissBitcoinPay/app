import { MTPELERIN_TEST_URL, MTPELERIN_URL } from "@/config/mtpelerin";

import type { MtpTransport } from "./api";
import { appMtpEnvironment, type MtpEnvironment } from "./environment";
import { httpTransport } from "./http-transport";

/*
 * The transport of the app's Mt Pelerin API (api.ts): HTTPS to this build's Mt Pelerin
 * (environment.ts). In Jest, jest/mtpelerin.ts: tests never reach Mt Pelerin.
 */
export function mtPelerinTransport(
  environment: MtpEnvironment = appMtpEnvironment()
): MtpTransport {
  return httpTransport(environment === "production" ? MTPELERIN_URL : MTPELERIN_TEST_URL);
}
