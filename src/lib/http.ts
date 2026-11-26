/** Options of a GET (getWithTimeout). */
export type GetOptions = {
  /**
   * Refuse to follow a redirect: the answer must come from `url` itself. Asked of fetch
   * (`redirect: "error"`: browsers and expo/fetch, the app's fetch on iOS and Android, honour it),
   * and checked on the response (`redirected`) for a fetch that followed it all the same.
   */
  noRedirect?: boolean;
};

/**
 * GET `url` asking for JSON, then `read` the response. Past `timeoutMs` the request is aborted and
 * the call rejects: the timeout also covers the body, which `read` reads (awaited here).
 */
export async function getWithTimeout<T>(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  read: (response: Response) => Promise<T>,
  { noRedirect = false }: GetOptions = {}
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
      ...(noRedirect ? { redirect: "error" as const } : {})
    });
    if (noRedirect && response.redirected === true) throw new Error("Redirected");
    return await read(response);
  } finally {
    clearTimeout(timer);
  }
}
