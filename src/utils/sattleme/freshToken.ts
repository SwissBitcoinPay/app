import { isToken } from "./handoff";

// Délai d'attente du renouvellement : passé, le propriétaire part sans jeton
// et sattle.me lui demande son mot de passe (rien n'est perdu).
export const REFRESH_TIMEOUT_MS = 8_000;

// Un jeton court (une heure) de la session du propriétaire, renouvelé juste
// avant le départ pour sattle.me (`POST /api/auth/v1/refresh` de TrailBase,
// comme le SDK de cette app) : le jeton de renouvellement, lui, ne quitte
// jamais ce site. `undefined` quand il n'a pas pu l'être (session expirée,
// réseau, réponse hors forme) : jamais d'erreur.
export const freshToken = async (
  apiRoot: string,
  refreshToken: string | undefined,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = REFRESH_TIMEOUT_MS
): Promise<string | undefined> => {
  if (!refreshToken) return undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${apiRoot}/api/auth/v1/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
      signal: controller.signal
    });
    if (!response.ok) return undefined;
    const body = (await response.json()) as { auth_token?: unknown } | null;
    return isToken(body?.auth_token) ? body.auth_token : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
};
