import type { EngineRuntimeHost, HostResponse } from "../host";

import type { EngineAbortSignal } from "./abort";

/*
 * fetch over the host's HTTP (EngineRuntimeHost.fetch), as the app uses it (http.ts,
 * payee-proof.ts, lnurl.ts): a URL, a method, headers as an object or pairs, a text body, a signal,
 * `redirect` "follow" or "error"; a response's `status`, `ok`, `url`, `redirected`, `headers.get`,
 * and its body read once, as `text()` or `json()`. Anything else is refused, never ignored.
 */

type Init = {
  method?: string;
  headers?: Record<string, string> | [string, string][];
  body?: unknown;
  signal?: EngineAbortSignal | null;
  redirect?: string;
};

export class EngineHeaders {
  private readonly values: [string, string][];

  constructor(pairs: [string, string][]) {
    this.values = pairs.map(([name, value]) => [name.toLowerCase(), value]);
  }

  /** Its values joined, as the web's: null when absent. */
  get(name: string): string | null {
    const found = this.values.filter(([key]) => key === name.toLowerCase());
    return found.length === 0 ? null : found.map(([, value]) => value).join(", ");
  }

  has(name: string): boolean {
    return this.get(name) !== null;
  }
}

export class EngineResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly statusText = "";
  readonly url: string;
  readonly redirected: boolean;
  readonly headers: EngineHeaders;
  private body: string | null;

  constructor(response: HostResponse) {
    this.status = response.status;
    this.ok = response.status >= 200 && response.status <= 299;
    this.url = response.url;
    this.redirected = response.redirected;
    this.headers = new EngineHeaders(response.headers);
    this.body = response.body;
  }

  get bodyUsed(): boolean {
    return this.body === null;
  }

  async text(): Promise<string> {
    const body = this.body;
    if (body === null) throw new TypeError("The response's body was read already");
    this.body = null;
    return body;
  }

  async json(): Promise<unknown> {
    return JSON.parse(await this.text()) as unknown;
  }
}

function headersOf(headers: Init["headers"]): [string, string][] {
  if (headers === undefined) return [];
  const pairs = Array.isArray(headers) ? headers : Object.entries(headers);
  for (const pair of pairs) {
    if (
      !Array.isArray(pair) ||
      pair.length !== 2 ||
      pair.some((part) => typeof part !== "string")
    ) {
      throw new TypeError("Headers are text pairs here");
    }
  }
  return pairs.map(([name, value]) => [name, value]);
}

export function engineFetch(host: EngineRuntimeHost) {
  return (input: unknown, init: Init = {}): Promise<EngineResponse> => {
    const url = typeof input === "string" ? input : String((input as { href?: unknown })?.href);
    if (!/^https:\/\//i.test(url)) return Promise.reject(new TypeError("HTTPS URLs only here"));
    const redirect = init.redirect ?? "follow";
    if (redirect !== "follow" && redirect !== "error") {
      return Promise.reject(new TypeError(`redirect "${redirect}" is not supported here`));
    }
    if (init.body !== undefined && init.body !== null && typeof init.body !== "string") {
      return Promise.reject(new TypeError("Text bodies only here"));
    }
    let headers: [string, string][];
    try {
      headers = headersOf(init.headers);
    } catch (error) {
      return Promise.reject(error);
    }
    const signal = init.signal ?? null;
    if (signal?.aborted) return Promise.reject(signal.reason);
    return new Promise<EngineResponse>((resolve, reject) => {
      let settled = false;
      const onAbort = () => {
        if (settled) return;
        settled = true;
        host.cancelFetch(id);
        reject(signal?.reason);
      };
      const id = host.fetch(
        {
          url,
          method: (init.method ?? "GET").toUpperCase(),
          headers,
          body: typeof init.body === "string" ? init.body : null,
          noRedirect: redirect === "error"
        },
        (response, error) => {
          if (settled) return;
          settled = true;
          signal?.removeEventListener("abort", onAbort);
          if (response) resolve(new EngineResponse(response));
          else reject(new TypeError(error ?? "Network request failed"));
        }
      );
      signal?.addEventListener("abort", onAbort);
    });
  };
}
