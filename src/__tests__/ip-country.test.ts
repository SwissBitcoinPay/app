import { IP_COUNTRY_URL, fetchIpCountry } from "@/lib/ip-country";

function respond(status: number, body?: unknown) {
  return jest
    .fn()
    .mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body });
}

describe("fetchIpCountry", () => {
  it("returns the country of the caller's IP address, and only that", async () => {
    const fetchMock = respond(200, { ip: "192.0.2.1", country: "CH" });

    await expect(fetchIpCountry(fetchMock)).resolves.toBe("CH");
    expect(fetchMock).toHaveBeenCalledWith(IP_COUNTRY_URL, {
      headers: { Accept: "application/json" },
      signal: expect.any(AbortSignal)
    });
  });

  it("returns null when the service has no data for the IP address", async () => {
    await expect(fetchIpCountry(respond(404))).resolves.toBeNull();
  });

  it("rejects on an HTTP error or an unexpected body", async () => {
    await expect(fetchIpCountry(respond(429))).rejects.toThrow(/429/);
    await expect(fetchIpCountry(respond(200, { ip: "192.0.2.1" }))).rejects.toThrow(/unexpected/);
    await expect(fetchIpCountry(respond(200, { country: "che" }))).rejects.toThrow(/unexpected/);
  });

  it("gives up when the service does not answer in time", async () => {
    const hanging = jest.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new Error("Aborted")));
        })
    );

    await expect(fetchIpCountry(hanging as unknown as typeof fetch, 10)).rejects.toThrow(/Aborted/);
  });
});
