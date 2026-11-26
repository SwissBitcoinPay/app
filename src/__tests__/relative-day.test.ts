import { relativeDayWord as webWord } from "@/lib/locale/relative-day.web";

type Native = { relativeDay: jest.Mock };

/** relative-day.ts loaded afresh with `native` as the app's module (null: absent). */
function loadNative(native: Native | null) {
  let word!: typeof import("@/lib/locale/relative-day").relativeDayWord;
  jest.isolateModules(() => {
    jest.doMock("expo", () => ({ requireOptionalNativeModule: () => native }));
    type Module = typeof import("@/lib/locale/relative-day");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const loaded = require("@/lib/locale/relative-day") as Module;
    word = loaded.relativeDayWord;
  });
  return word;
}

afterEach(() => {
  jest.dontMock("expo");
});

describe("relativeDayWord (web)", () => {
  it("writes the browser's own word, as at the start of a sentence", () => {
    // Intl.RelativeTimeFormat with Node's ICU, as a browser's: CLDR's words, capitalised.
    expect(webWord("es-ES", 0)).toBe("Hoy");
    expect(webWord("es-ES", -1)).toBe("Ayer");
    expect(webWord("de-CH", 0)).toBe("Heute");
    expect(webWord("de-CH", -1)).toBe("Gestern");
    expect(webWord("it-CH", 0)).toBe("Oggi");
    expect(webWord("fi-FI", 0)).toBe("Tänään");
    expect(webWord("en-US", -1)).toBe("Yesterday");
  });

  it("falls back on the default locale for a malformed tag", () => {
    const expected = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(0, "day");
    expect(webWord("en-US@posix", 0)?.toLowerCase()).toBe(expected.toLowerCase());
  });
});

describe("relativeDayWord (native)", () => {
  it("asks the app's native module once per locale and day", () => {
    const native = { relativeDay: jest.fn((tag: string, offset: number) => `${tag}:${offset}`) };
    const word = loadNative(native);
    expect(word("de-CH", 0)).toBe("de-CH:0");
    expect(word("de-CH", 0)).toBe("de-CH:0");
    expect(word("de-CH", -1)).toBe("de-CH:-1");
    expect(word("fr-CH", 0)).toBe("fr-CH:0");
    expect(native.relativeDay.mock.calls).toEqual([
      ["de-CH", 0],
      ["de-CH", -1],
      ["fr-CH", 0]
    ]);
  });

  it("gives none without the module, the app's translations then", () => {
    expect(loadNative(null)("fr-CH", 0)).toBeNull();
  });

  it("gives none when the module writes none or fails, and asks again next time", () => {
    const native = {
      relativeDay: jest
        .fn()
        .mockReturnValueOnce(null)
        .mockImplementationOnce(() => {
          throw new Error("native");
        })
        .mockReturnValueOnce("")
        .mockReturnValue("Heute")
    };
    const word = loadNative(native);
    expect(word("de-CH", 0)).toBeNull();
    expect(word("de-CH", 0)).toBeNull();
    expect(word("de-CH", 0)).toBeNull();
    expect(word("de-CH", 0)).toBe("Heute");
    expect(word("de-CH", 0)).toBe("Heute");
    expect(native.relativeDay).toHaveBeenCalledTimes(4);
  });
});
