import { MTPELERIN_TEST_URL } from "@/config/mtpelerin";
import { createMtPelerinApi } from "@/lib/mtpelerin/api";
import { MTP_TIMEOUT_MS, httpTransport, requestUrl } from "@/lib/mtpelerin/http-transport";

/*
 * Mt Pelerin's API over HTTPS (http-transport.ts), for its dev/test environment: what goes out
 * (URL, headers, JSON body) and what comes back, over a fake `fetch`: tests never
 * reach Mt Pelerin.
 */

type Call = { url: string; init: RequestInit };

/** A `fetch` that answers `status` and `text`, recording each call. */
function fakeFetch(status = 200, text = "{}") {
  const calls: Call[] = [];
  const fetchImpl = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    // A 204 has no body at all (Response refuses even an empty one).
    return new Response(text === "" ? null : text, { status });
  });
  return { calls, fetchImpl: fetchImpl as unknown as typeof fetch };
}

afterEach(() => {
  jest.useRealTimers();
});

describe("Mt Pelerin's API over HTTPS (http-transport.ts)", () => {
  it("talks to Mt Pelerin's dev/test environment", () => {
    expect(MTPELERIN_TEST_URL).toBe("https://api-dev.smex.tech");
    expect(
      requestUrl(MTPELERIN_TEST_URL, {
        path: "/orders/status",
        query: { fromDate: "2026-01-01", toDate: "2026-10-27", skip: "0", limit: "20" }
      })
    ).toBe(
      "https://api-dev.smex.tech/orders/status?fromDate=2026-01-01&toDate=2026-10-27&skip=0&limit=20"
    );
    expect(
      requestUrl(MTPELERIN_TEST_URL, {
        path: "/accounts",
        query: { filter: JSON.stringify({ where: { type: "external" } }) }
      })
    ).toBe(
      "https://api-dev.smex.tech/accounts?filter=%7B%22where%22%3A%7B%22type%22%3A%22external%22%7D%7D"
    );
  });

  it("sends JSON with the access token as a bearer, and reads the answer whatever its status", async () => {
    const { calls, fetchImpl } = fakeFetch(409, '{"error":{"message":"Duplicate account"}}');
    const transport = httpTransport("https://mtp.example", fetchImpl);
    await expect(
      transport({ method: "PUT", path: "/accounts", body: { type: "lightning" }, token: "jwt" })
    ).resolves.toEqual({ status: 409, body: { error: { message: "Duplicate account" } } });
    expect(calls[0]?.url).toBe("https://mtp.example/accounts");
    expect(calls[0]?.init).toMatchObject({
      method: "PUT",
      body: '{"type":"lightning"}',
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: "Bearer jwt"
      }
    });
    // A public endpoint: no token, no body.
    await transport({ method: "GET", path: "/forms/mtp-config" });
    expect(calls[1]?.init.headers).toEqual({ Accept: "application/json" });
    expect(calls[1]?.init.body).toBeUndefined();
  });

  it("reads an empty answer, or one that is not JSON, as no body", async () => {
    await expect(
      httpTransport(
        "https://mtp.example",
        fakeFetch(204, "").fetchImpl
      )({
        method: "POST",
        path: "/devices/x/sms"
      })
    ).resolves.toEqual({ status: 204, body: null });
    await expect(
      httpTransport(
        "https://mtp.example",
        fakeFetch(502, "<html>Bad gateway</html>").fetchImpl
      )({
        method: "GET",
        path: "/forms/mtp-config"
      })
    ).resolves.toEqual({ status: 502, body: null });
  });

  it("gives up without an answer in its time: offline, nothing decided", async () => {
    jest.useFakeTimers();
    const fetchImpl = jest.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("Aborted")));
        })
    ) as unknown as typeof fetch;
    const api = createMtPelerinApi(httpTransport("https://mtp.example", fetchImpl));
    const config = api.config();
    jest.advanceTimersByTime(MTP_TIMEOUT_MS);
    await expect(config).rejects.toMatchObject({ code: "offline" });
    // No network at all: the same.
    const down = jest.fn(async () => {
      throw new TypeError("Network request failed");
    }) as unknown as typeof fetch;
    await expect(
      createMtPelerinApi(httpTransport("https://x", down)).config()
    ).rejects.toMatchObject({ code: "offline" });
  });
});
