import type { MtpRequest, MtpResponse, MtpTransport } from "./api";

/*
 * Mt Pelerin's API over HTTPS: JSON bodies (`Content-Type: application/json`), the access token
 * as `Authorization: Bearer` for an authenticated endpoint.
 * Resolves with every answer, whatever its status (api.ts reads it); rejects only when there is
 * none: offline, or no answer within its time. Logs nothing: a request carries tokens and codes.
 */

/** A call's time, connection included. */
export const MTP_TIMEOUT_MS = 20_000;

/** The answer's body: its JSON, or null when it has none or none that parses. */
async function bodyOf(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** The URL of `request` at `baseUrl` (no trailing slash), its query encoded. */
export function requestUrl(baseUrl: string, request: Pick<MtpRequest, "path" | "query">): string {
  const query = request.query ? new URLSearchParams(request.query).toString() : "";
  return `${baseUrl}${request.path}${query ? `?${query}` : ""}`;
}

/** The transport to the API at `baseUrl` (https). `fetchImpl`: the tests'. */
export function httpTransport(
  baseUrl: string,
  fetchImpl: typeof fetch = (input, init) => fetch(input, init)
): MtpTransport {
  return async (request: MtpRequest): Promise<MtpResponse> => {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (request.token !== undefined) headers.Authorization = `Bearer ${request.token}`;
    let body: BodyInit | undefined;
    if (request.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(request.body);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MTP_TIMEOUT_MS);
    try {
      const response = await fetchImpl(requestUrl(baseUrl, request), {
        method: request.method,
        headers,
        body,
        signal: controller.signal
      });
      return { status: response.status, body: await bodyOf(response) };
    } finally {
      clearTimeout(timer);
    }
  };
}
