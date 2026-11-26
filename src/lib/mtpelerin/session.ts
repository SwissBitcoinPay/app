import type { MtPelerinApi } from "./api";
import { MtPelerinError, isMtpError } from "./errors";
import type { MtpSessionStore } from "./session-sync";

/*
 * A Mt Pelerin session: its access token in memory only (1 hour), its refresh token kept by the
 * open account (session-sync.ts: on this device, and on the relays for the account's other
 * devices). A call that gets a 401 refreshes the pair, then retries the original call,
 * once; calls meanwhile share the refresh. Within 30 days the same refresh token comes back, past
 * them a new pair: kept at once, the old one being permanently consumed. A refresh token
 * refused is looked for again among the account's (another device may have rotated it, or logged in
 * since), and tried once more; without a newer one the session is lost (MtpSessionLostError): the
 * flow logs in by SMS again. No answer (offline) loses nothing. The tokens are never logged:
 * the journal gets MtPelerinError's kind only.
 */

/** The session is gone (none, or its refresh token refused): log in by SMS again. */
export class MtpSessionLostError extends Error {
  constructor() {
    super("The Mt Pelerin session is lost");
    this.name = "MtpSessionLostError";
  }
}

export type MtpSession = {
  /** Whether a refresh token is held: not proven valid until a call uses it. */
  readonly open: () => boolean;
  /** The code typed, then the pair kept. Never logged. */
  login: (deviceId: string, code: string) => Promise<void>;
  /** Runs `call` with an access token, refreshed once on a 401. */
  authed: <T>(call: (accessToken: string) => Promise<T>) => Promise<T>;
  /** "Log out of Mt Pelerin": its tokens forgotten, on every device of the account. */
  logout: () => Promise<void>;
};

/** Whether `error` says the session's token is refused (401, 403) rather than unreachable. */
function refusesToken(error: unknown): boolean {
  return (
    isMtpError(error, "tokenExpired") ||
    isMtpError(error, "unauthorized") ||
    isMtpError(error, "forbidden") ||
    isMtpError(error, "refused") ||
    isMtpError(error, "notFound")
  );
}

/** The session kept by `store`, from its refresh token (`stored`, null for none). */
export function createMtpSession(
  api: MtPelerinApi,
  store: Pick<MtpSessionStore, "keep" | "refused">,
  stored: string | null
): MtpSession {
  let refreshToken = stored;
  let accessToken: string | null = null;
  let refreshing: Promise<string> | null = null;

  /** `token` refused: the account's newer one, else none (the session lost). */
  const refusedToken = async (token: string): Promise<string | null> => {
    const newer = await store.refused(token).catch(() => null);
    // Logged out or in meanwhile: that session stays.
    if (refreshToken !== token) throw new MtpSessionLostError();
    refreshToken = newer;
    accessToken = null;
    return newer;
  };

  const refresh = (): Promise<string> => {
    refreshing ??= (async () => {
      let current = refreshToken;
      // The token held, then the account's newer one if it is refused: once.
      for (let attempt = 0; current !== null && attempt < 2; attempt++) {
        try {
          const pair = await api.refresh(current);
          // Logged out meanwhile: nothing is kept.
          if (refreshToken !== current) throw new MtpSessionLostError();
          accessToken = pair.accessToken;
          if (pair.refreshToken !== current) {
            refreshToken = pair.refreshToken;
            await store.keep(pair.refreshToken);
          }
          return pair.accessToken;
        } catch (error) {
          if (error instanceof MtpSessionLostError || !refusesToken(error)) throw error;
          current = await refusedToken(current);
        }
      }
      refreshToken = null;
      accessToken = null;
      throw new MtpSessionLostError();
    })().finally(() => {
      refreshing = null;
    });
    return refreshing;
  };

  return {
    open: () => refreshToken !== null,
    async login(deviceId, code) {
      const pair = await api.authenticate(deviceId, code);
      accessToken = pair.accessToken;
      refreshToken = pair.refreshToken;
      await store.keep(pair.refreshToken);
    },
    async authed(call) {
      const token = accessToken ?? (await refresh());
      try {
        return await call(token);
      } catch (error) {
        if (!isMtpError(error, "tokenExpired") && !isMtpError(error, "unauthorized")) throw error;
        // Refreshed (unless another call did meanwhile), then the call once more.
        if (accessToken === token) accessToken = null;
        const next = accessToken ?? (await refresh());
        try {
          return await call(next);
        } catch (again) {
          // Refused with a fresh token too: the session is not this profile's any more, here.
          if (isMtpError(again, "unauthorized") || isMtpError(again, "tokenExpired")) {
            if (refreshToken !== null) await refusedToken(refreshToken).catch(() => null);
            refreshToken = null;
            accessToken = null;
            throw new MtpSessionLostError();
          }
          throw again;
        }
      }
    },
    async logout() {
      refreshToken = null;
      accessToken = null;
      await store.keep(null);
    }
  };
}

/** Whether `error` is a failure of Mt Pelerin or of its session (for the flow's messages). */
export function isMtpFailure(error: unknown): error is MtPelerinError | MtpSessionLostError {
  return error instanceof MtPelerinError || error instanceof MtpSessionLostError;
}
