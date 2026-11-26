/**
 * Fake Expo push API (`https://exp.host/--/api/v2/push/send`) over the tests' fetch, as Expo's docs
 * describe it ("Send notifications with the Expo Push Service"): one message gives one ticket,
 * `{"data":{"status":"ok","id":…}}`; a message Expo refuses, `{"data":{"status":"error",…}}`; a
 * request it refuses whole, an HTTP error with `errors`. `serveExpoPush()` installs it on the global
 * fetch in front of what the test installed before (serveBreezTips); `expoPush.messages` holds what
 * was sent, `expoPush.answer` how it answers.
 */
export const EXPO_PUSH_HOST = "exp.host";

type Answer = "ok" | "deviceNotRegistered" | "tooManyRequests" | "unreachable";

export const expoPush = {
  messages: [] as Record<string, unknown>[],
  answer: "ok" as Answer
};

export function resetExpoPush(): void {
  expoPush.messages = [];
  expoPush.answer = "ok";
}

function json(body: unknown, status = 200): Response {
  return {
    ok: status < 400,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as Response;
}

export async function expoPushFetch(url: URL, init: RequestInit = {}): Promise<Response> {
  if (expoPush.answer === "unreachable") throw new TypeError("Network request failed");
  if (url.pathname !== "/--/api/v2/push/send" || init.method !== "POST") {
    return json({ errors: [{ code: "NOT_FOUND", message: "Not found" }] }, 404);
  }
  const message = JSON.parse(String(init.body)) as Record<string, unknown>;
  expoPush.messages.push(message);
  switch (expoPush.answer) {
    case "deviceNotRegistered":
      return json({
        data: {
          status: "error",
          message: `"${String(message.to)}" is not a registered push notification recipient`,
          details: { error: "DeviceNotRegistered" }
        }
      });
    case "tooManyRequests":
      return json({ errors: [{ code: "TOO_MANY_REQUESTS", message: "Too many requests" }] }, 429);
    default:
      return json({
        data: { status: "ok", id: `0000000${expoPush.messages.length}-0000-4000-8000-000000000000` }
      });
  }
}

export function serveExpoPush(): void {
  resetExpoPush();
  const fetchMock = jest.mocked(globalThis.fetch);
  const before = fetchMock.getMockImplementation();
  fetchMock.mockImplementation(async (...args: Parameters<typeof fetch>) => {
    const [input, init] = args;
    const url = new URL(
      typeof input === "string" ? input : String((input as Request).url ?? input)
    );
    if (url.host === EXPO_PUSH_HOST) return expoPushFetch(url, init);
    if (before) return before(...args);
    throw new TypeError("Network request failed");
  });
}
