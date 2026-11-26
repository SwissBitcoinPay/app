import { openSupportMail, shareSupportReport, supportMailto } from "@/features/support/mail.web";
import type { LogEntry } from "@/lib/log/entry";
import * as webJournal from "@/lib/log/journal.web";
import { logUncaughtErrors } from "@/lib/log/crashes.web";
import { readLog } from "@/lib/log/log";

/*
 * "Contact support" and the journal in the web app: no file can go with a `mailto:` link, the
 * journal's copy is downloaded first; the journal of a page is kept in its memory only. Jest has no
 * DOM: the page's pieces the code uses are faked here.
 */

// The web's: the mail opens in this tab (window.location).
jest.mock("@/lib/payment-link/device", () => jest.requireActual("@/lib/payment-link/device.web"));

type Link = { href: string; download: string; rel: string; click: jest.Mock; remove: jest.Mock };

const links: Link[] = [];
const blobs = new Map<string, Blob>();
const assign = jest.fn();
const revoke = jest.fn();
const listeners = new Map<string, (event: Record<string, unknown>) => void>();
const steps: string[] = [];

const saved = (["document", "window"] as const).map(
  (name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const
);

beforeAll(() => {
  Object.defineProperty(globalThis, "document", {
    value: {
      createElement: () => {
        const link: Link = {
          href: "",
          download: "",
          rel: "",
          click: jest.fn(() => steps.push(`download ${link.download}`)),
          remove: jest.fn()
        };
        links.push(link);
        return link;
      },
      body: { appendChild: () => undefined }
    },
    configurable: true
  });
  Object.defineProperty(globalThis, "window", {
    value: {
      location: { assign: (uri: string) => (steps.push("mail"), assign(uri)) },
      addEventListener: (type: string, listener: (event: Record<string, unknown>) => void) =>
        listeners.set(type, listener)
    },
    configurable: true
  });
});

afterAll(() => {
  for (const [name, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete (globalThis as Record<string, unknown>)[name];
  }
});

beforeEach(() => {
  links.length = 0;
  blobs.clear();
  steps.length = 0;
  assign.mockClear();
  revoke.mockClear();
  jest.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    const url = `blob:test-${blobs.size}`;
    blobs.set(url, blob as Blob);
    return url;
  });
  jest.spyOn(URL, "revokeObjectURL").mockImplementation(revoke);
});

afterEach(() => {
  jest.useRealTimers();
});

describe("the mail to support on the web", () => {
  it("downloads the journal's copy, then opens the mail written, the copy's name in it", async () => {
    jest.useFakeTimers();
    const report = JSON.stringify({ report: "sattleme-app-log", version: 1, entries: [] });
    await expect(
      openSupportMail({
        subject: "Support sattle.me",
        body: "Hello,\n\nYour question:\n\n--\nsattle.me v3.0.0",
        report
      })
    ).resolves.toBe("opened");
    expect(steps).toEqual(["download sattle-me-journal.json", "mail"]);
    expect(links[0]).toMatchObject({ download: "sattle-me-journal.json", rel: "noopener" });
    expect(links[0]!.remove).toHaveBeenCalled();
    await expect(blobs.get(links[0]!.href)!.text()).resolves.toBe(report);
    expect(assign).toHaveBeenCalledWith(
      "mailto:support@sattle.me?subject=Support%20sattle.me&body=" +
        "Hello%2C%0D%0A%0D%0AYour%20question%3A%0D%0A%0D%0A--%0D%0Asattle.me%20v3.0.0"
    );
    // The download's object freed once the browser took it.
    expect(revoke).not.toHaveBeenCalled();
    jest.advanceTimersByTime(60_000);
    expect(revoke).toHaveBeenCalledWith(links[0]!.href);
  });

  it("downloads nothing without the journal", async () => {
    await openSupportMail({ subject: "S", body: "B", report: null });
    expect(links).toEqual([]);
    expect(steps).toEqual(["mail"]);
  });

  it("writes spaces as %20, never +, which mail clients would show", () => {
    expect(supportMailto("a b+c", "x y")).toBe(
      "mailto:support@sattle.me?subject=a%20b%2Bc&body=x%20y"
    );
  });

  it("has no share sheet for the journal", async () => {
    await expect(shareSupportReport("{}", "Journal")).rejects.toThrow();
  });
});

describe("the journal of a page", () => {
  const entry = (n: number): LogEntry => ({
    at: n,
    level: "info",
    event: "App in the foreground",
    error: null,
    build: null,
    skipped: 0
  });

  afterEach(() => webJournal.clearLogEntries());

  it(`keeps its last ${webJournal.MAX_LOG_ENTRIES} entries in memory`, () => {
    for (let n = 0; n < webJournal.MAX_LOG_ENTRIES + 5; n += 1) webJournal.appendLogEntry(entry(n));
    const entries = webJournal.readLogEntries();
    expect(entries).toHaveLength(webJournal.MAX_LOG_ENTRIES);
    expect(entries[0]!.at).toBe(5);
    webJournal.clearLogEntries();
    expect(webJournal.readLogEntries()).toEqual([]);
  });

  it("writes no file", () => {
    expect(() => webJournal.writeLogExport("sattle-me-journal.json", "{}")).toThrow();
  });

  it("notes the page's uncaught errors and the promises rejected with nothing to catch them", () => {
    logUncaughtErrors();
    listeners.get("error")!({ error: new TypeError("x is not a function"), message: "ignored" });
    listeners.get("error")!({ error: null, message: "Script error." });
    listeners.get("unhandledrejection")!({ reason: new Error("No answer in time") });
    expect(readLog().entries).toEqual([
      expect.objectContaining({
        level: "error",
        event: "An uncaught error",
        error: expect.objectContaining({ kind: "TypeError", message: "x is not a function" })
      }),
      expect.objectContaining({
        event: "An uncaught error",
        error: expect.objectContaining({ kind: "string", message: "Script error." })
      }),
      expect.objectContaining({
        event: "A promise rejected with nothing to catch it",
        error: expect.objectContaining({ message: "No answer in time" })
      })
    ]);
  });
});
