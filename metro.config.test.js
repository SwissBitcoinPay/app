const { resolver } = require("./metro.config");

// Fake Metro resolver: only knows the modules listed in `existing`.
const makeContext = (existing) => {
  const resolveRequest = jest.fn((_context, moduleName) => {
    if (existing.includes(moduleName)) {
      return { type: "sourceFile", filePath: `/app/${moduleName}` };
    }
    throw new Error(`Unable to resolve module ${moduleName}`);
  });
  return { resolveRequest };
};

describe("metro resolver.resolveRequest", () => {
  it("retries without `.js` when a relative `.js` import is not found", () => {
    const context = makeContext(["./client"]);

    expect(resolver.resolveRequest(context, "./client.js", "ios")).toEqual({
      type: "sourceFile",
      filePath: "/app/./client"
    });
    expect(context.resolveRequest).toHaveBeenLastCalledWith(
      context,
      "./client",
      "ios"
    );
  });

  it("also retries for a parent relative import (`../x.js`)", () => {
    const context = makeContext(["../shared/foo"]);

    expect(
      resolver.resolveRequest(context, "../shared/foo.js", "android").filePath
    ).toBe("/app/../shared/foo");
  });

  it("does not retry a relative import without `.js`", () => {
    // Without this guard, `./abc` would become `./` and resolve the folder index.
    const context = makeContext(["./"]);

    expect(() => resolver.resolveRequest(context, "./abc", "ios")).toThrow(
      "Unable to resolve module ./abc"
    );
    expect(context.resolveRequest).toHaveBeenCalledTimes(1);
  });

  it("keeps the `.js` file when it exists, without a second attempt", () => {
    const context = makeContext(["../lib/legacy.js", "../lib/legacy"]);

    expect(
      resolver.resolveRequest(context, "../lib/legacy.js", "android").filePath
    ).toBe("/app/../lib/legacy.js");
    expect(context.resolveRequest).toHaveBeenCalledTimes(1);
  });

  it("rethrows the original error when both attempts fail", () => {
    const context = makeContext([]);

    expect(() =>
      resolver.resolveRequest(context, "./missing.js", "ios")
    ).toThrow("Unable to resolve module ./missing.js");
  });

  it("leaves non-relative imports untouched", () => {
    const context = makeContext(["some-package"]);

    expect(() =>
      resolver.resolveRequest(context, "some-package/index.js", "ios")
    ).toThrow("Unable to resolve module some-package/index.js");
    expect(context.resolveRequest).toHaveBeenCalledTimes(1);
  });
});
