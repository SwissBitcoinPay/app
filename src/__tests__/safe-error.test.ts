import { LEFT_OUT_MESSAGE, MAX_FRAMES, safeErrorCopy } from "@/lib/log/safe-error";

// Values of the app that must never leave the device (clearly fake ones, as app-log.test.tsx's).
const INVOICE =
  "lnbc15u1p3xnhl2pp5jptserfk3zk4qy42tlucycrfwxhydvlemu9pqr93tuzlv9cc7g3sdqsvfhkcap3xyhx7un8cqzpgxqzjcsp5f8c52y2stc300gl6s4xswtjpc37hrnnr3c9wvtgjfuvqmpm35evq9qyyssqy4lgd8tj637qcjp05rdpxxykjenthxftej7a2zzmwrmrl70fyj9hvj0rewhzj7jfyuwkwcg9g2jpwtk3wkjtwnkdks84hsnu8xps5vsq4gj5hs";
const ADDRESS = "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq";
const KEY = "7f".repeat(32);
const LINK = "https://web.example/pay#v1.Zm9vYmFy";
const HOST = "relay.bakery.example";
const VALUES = [INVOICE, ADDRESS, KEY, LINK, HOST, "anna@example.com", "Alice Smith", "150000"];

/** A stack as Hermes writes it: the error as text first, then its frames. */
function hermesStack(header: string, frames: string[]): string {
  return [header, ...frames].join("\n");
}

const FRAMES = [
  "    at payInvoice (address at index.android.bundle:1:482113)",
  "    at anonymous (address at /data/user/0/ch.swissbitcoinpay.checkout.staging/files/.expo-internal/c0ffee.bundle:1:9921)",
  "    at call (native)",
  "    at ?anon_0_ (index.android.bundle:1:120)",
  "    ... skipping 3 frames"
];

/** Everything of the copy that reaches Observe and React Native's report (installErrorHandler). */
function sent(copy: Error): string {
  return [copy.name, copy.message, copy.stack ?? ""].join("\n");
}

describe("safeErrorCopy", () => {
  it("keeps an error's kind, its plain message and its stack's frames", () => {
    const error = new TypeError("Cannot read properties of undefined");
    error.stack = hermesStack("TypeError: Cannot read properties of undefined", FRAMES);
    const copy = safeErrorCopy(error);

    expect(copy).toBeInstanceOf(Error);
    expect(copy).not.toBe(error);
    expect(copy.name).toBe("TypeError");
    expect(copy.message).toBe("Cannot read properties of undefined");
    expect(copy.stack).toBe(hermesStack("TypeError: Cannot read properties of undefined", FRAMES));
  });

  it("never carries a value of the app's, whatever the error says, in any of its lines", () => {
    for (const value of VALUES) {
      // The message on several lines, one shaped like a frame: the stack repeats it whole.
      const message = `Cannot pay ${value}\n    at ${value} (address at x:1:1)`;
      const error = new Error(message);
      error.stack = hermesStack(`Error: ${message}`, FRAMES);
      const copy = safeErrorCopy(error);

      expect(copy.message).toBe(LEFT_OUT_MESSAGE);
      expect(copy.stack).toBe(hermesStack(`Error: ${LEFT_OUT_MESSAGE}`, FRAMES));
      expect([value, sent(copy).includes(value)]).toEqual([value, false]);
    }
  });

  it("keeps no line of a stack that does not start with the error as it is now", () => {
    const error = new Error("Not found");
    // A message changed once the error was made: the stack kept the first one, which may hold a
    // value on a line shaped like a frame.
    error.stack = hermesStack(`Error: Unknown sale\n    at ${KEY} (address at x:1:1)`, FRAMES);
    const copy = safeErrorCopy(error);

    expect(copy.stack).toBe("Error: Not found");
    expect(sent(copy)).not.toContain(KEY);
    // Its first words only: a longer first line is no header of it.
    error.stack = hermesStack(`Error: Not found for ${KEY}`, FRAMES);
    expect(safeErrorCopy(error).stack).toBe("Error: Not found");
  });

  it("keeps the frames of an error named once its stack was, as a subclass names itself", () => {
    class WalletError extends Error {
      constructor(message: string) {
        super(message);
        this.name = "WalletError";
      }
    }
    const error = new WalletError("Wallet not connected");
    error.stack = hermesStack("Error: Wallet not connected", FRAMES);

    expect(safeErrorCopy(error).stack).toBe(
      hermesStack("WalletError: Wallet not connected", FRAMES)
    );
  });

  it("keeps a code, and what caused the error, as the journal does", () => {
    const sdk = Object.assign(new Error(`Generic error ${INVOICE}`), { tag: "Generic" });
    const error = Object.assign(new Error("request failed"), {
      name: "WalletError",
      code: "requestFailed",
      cause: sdk
    });
    const copy = safeErrorCopy(error);

    expect(copy.name).toBe("WalletError");
    expect(copy.message).toBe("requestFailed: request failed (caused by Error: Generic)");
    expect(sent(copy)).not.toContain(INVOICE);
  });

  it("carries nothing else of the error: React's component stack, its own properties", () => {
    const error = Object.assign(new Error("Rendering failed"), {
      componentStack: `\n    in Invoice (created by ${ADDRESS})`,
      invoice: INVOICE,
      isComponentError: true
    });
    const copy = safeErrorCopy(error) as Error & Record<string, unknown>;

    // Its name, its message and its stack, as an Error made here has: nothing of the error's.
    expect(Object.getOwnPropertyNames(copy).sort()).toEqual(["message", "name", "stack"]);
    expect(copy.componentStack).toBeUndefined();
    expect(copy.cause).toBeUndefined();
    expect(sent(copy)).not.toMatch(/lnbc|bc1q/);
  });

  it(`keeps the ${MAX_FRAMES} innermost frames of a long stack`, () => {
    const frames = Array.from({ length: MAX_FRAMES + 10 }, (_, n) => `    at f${n} (b.js:1:${n})`);
    const error = new Error("Too deep");
    error.stack = hermesStack("Error: Too deep", frames);

    expect(safeErrorCopy(error).stack).toBe(
      hermesStack("Error: Too deep", frames.slice(0, MAX_FRAMES))
    );
  });

  it("copies what is thrown that is no error: its type, and a text when it is plain words", () => {
    expect(safeErrorCopy("No answer in time")).toMatchObject({
      name: "string",
      message: "No answer in time",
      stack: "string: No answer in time"
    });
    expect(safeErrorCopy(`Invalid invoice ${INVOICE}`)).toMatchObject({
      name: "string",
      message: LEFT_OUT_MESSAGE
    });
    expect(safeErrorCopy({ invoice: INVOICE })).toMatchObject({
      name: "Error",
      message: LEFT_OUT_MESSAGE,
      stack: `Error: ${LEFT_OUT_MESSAGE}`
    });
    expect(safeErrorCopy(undefined)).toMatchObject({ name: "Error", message: LEFT_OUT_MESSAGE });
    expect(safeErrorCopy(42)).toMatchObject({ name: "number", message: LEFT_OUT_MESSAGE });
  });

  it("names a kind only when it is one word: never a value", () => {
    const error = Object.assign(new Error("Failed"), { name: `Invoice ${INVOICE}` });

    expect(safeErrorCopy(error).name).toBe("Error");
  });

  it("copies an error that cannot be read as saying nothing, never throwing", () => {
    const unreadable = new Proxy(new Error(INVOICE), {
      get: () => {
        throw new Error(INVOICE);
      }
    });
    const { proxy: revoked, revoke } = Proxy.revocable({}, {});
    revoke();

    for (const error of [unreadable, revoked]) {
      const copy = safeErrorCopy(error);
      expect(copy).toMatchObject({ name: "Error", message: LEFT_OUT_MESSAGE });
      expect(sent(copy)).toBe(["Error", LEFT_OUT_MESSAGE, `Error: ${LEFT_OUT_MESSAGE}`].join("\n"));
    }
  });

  it("keeps the frames of an error made in Jest (V8 writes them as Hermes does)", () => {
    const copy = safeErrorCopy(new RangeError("Out of range"));
    const lines = (copy.stack ?? "").split("\n");

    expect(lines[0]).toBe("RangeError: Out of range");
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[1]).toMatch(/^ {4}at .*safe-error\.test\.ts:\d+:\d+\)$/);
  });
});
