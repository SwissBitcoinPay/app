/*
 * The web app does not run in another site's frame: in one, the page only shows a link that opens
 * the app in a tab of its own, and the bundle stops.
 */

const saved = (["document", "window"] as const).map(
  (name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const
);

afterEach(() => {
  for (const [name, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete (globalThis as Record<string, unknown>)[name];
  }
});

/** Loads frame-guard.web.ts in a page whose top window is `top` (the page's own when absent). */
function loadIn(top?: object) {
  const shown: { href?: string; target?: string; rel?: string; textContent?: string }[] = [];
  const page: Record<string, unknown> = {
    location: { href: "https://app.example/pos", host: "app.example" }
  };
  page.self = page;
  page.top = top ?? page;
  Object.defineProperty(globalThis, "window", { value: page, configurable: true });
  Object.defineProperty(globalThis, "document", {
    value: {
      createElement: () => ({}),
      body: { replaceChildren: (...children: (typeof shown)[number][]) => shown.push(...children) }
    },
    configurable: true
  });
  let error: unknown = null;
  jest.isolateModules(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded afresh, as the page loads
      require("@/lib/frame-guard.web");
    } catch (thrown) {
      error = thrown;
    }
  });
  return { shown, error };
}

describe("the web app in a frame", () => {
  it("runs as the page of its own tab", () => {
    const { shown, error } = loadIn();
    expect(error).toBeNull();
    expect(shown).toEqual([]);
  });

  it("stops, and only links to itself in a tab of its own, in another page's frame", () => {
    const { shown, error } = loadIn({});
    expect(error).toBeInstanceOf(Error);
    expect(shown).toEqual([
      {
        href: "https://app.example/pos",
        target: "_blank",
        rel: "noopener noreferrer",
        textContent: "app.example"
      }
    ]);
  });
});
