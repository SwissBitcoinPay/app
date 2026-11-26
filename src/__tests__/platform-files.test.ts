import ts from "typescript";

// Platform files (AGENTS.md, "Layout"): `foo.web.ts` stands for `foo.ts` on the web, and so on.
// Metro resolves "./foo" to the platform's file first, so from `foo.web.ts` itself, "./foo" is
// `foo.web.ts`: an import of itself, whose values are undefined (report-fonts.web.ts taking its
// weights so made "Simple (PDF)" fail on the web; Jest, which resolves "./foo" to `foo.ts`, does
// not see it). What both versions share goes in a module of its own, without a
// platform version; a type alone may come from the other version (the compiler drops it).

// Node's types are not loaded (see app-config.test.ts): only what this test needs is typed here.
declare const __dirname: string;
const { readdirSync, readFileSync } = jest.requireActual<{
  readdirSync(dir: string, options: { recursive: true }): string[];
  readFileSync(file: string, encoding: "utf8"): string;
}>("fs");
const { dirname, join, resolve } = jest.requireActual<{
  dirname(path: string): string;
  join(...segments: string[]): string;
  resolve(...segments: string[]): string;
}>("path");

const ROOT = join(__dirname, "..", "..");

/** `foo` of `foo.web.ts`: the path a platform file stands for, without its platform. */
const PLATFORM_FILE = /^(.+)\.(?:web|native|ios|android)\.[jt]sx?$/;

/** The platform files Metro bundles: the app's and its own native modules' code. */
function platformFiles(): { path: string; base: string }[] {
  return ["src", "modules"].flatMap((top) =>
    readdirSync(join(ROOT, top), { recursive: true }).flatMap((relative) => {
      const path = join(ROOT, top, relative);
      const match = PLATFORM_FILE.exec(path);
      return match && !relative.includes("node_modules") && !relative.includes("__tests__")
        ? [{ path, base: match[1]! }]
        : [];
    })
  );
}

/** Where `specifier` points from `file`, without an extension; null for a package. */
function target(file: string, specifier: string): string | null {
  // tsconfig.json's paths: "@/assets/*" is the root's assets/, every other "@/*" is src/.
  if (specifier.startsWith("@/assets/")) return join(ROOT, specifier.slice(2));
  if (specifier.startsWith("@/")) return join(ROOT, "src", specifier.slice(2));
  if (specifier.startsWith(".")) return resolve(dirname(file), specifier);
  return null;
}

/**
 * The modules `text`, of `file`, takes a value from: imports and re-exports but of types only,
 * `import x = require(…)`, and `require(…)` / `import(…)` wherever they are called.
 */
function valueImports(file: string, text: string): string[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest);
  const specifiers: string[] = [];
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      const values =
        !clause ||
        (!clause.isTypeOnly &&
          (clause.name !== undefined ||
            (clause.namedBindings !== undefined &&
              (ts.isNamespaceImport(clause.namedBindings) ||
                clause.namedBindings.elements.some((element) => !element.isTypeOnly)))));
      if (values && ts.isStringLiteral(statement.moduleSpecifier)) {
        specifiers.push(statement.moduleSpecifier.text);
      }
    } else if (ts.isExportDeclaration(statement) && statement.moduleSpecifier) {
      const clause = statement.exportClause;
      const values =
        !statement.isTypeOnly &&
        (!clause ||
          ts.isNamespaceExport(clause) ||
          clause.elements.some((element) => !element.isTypeOnly));
      if (values && ts.isStringLiteral(statement.moduleSpecifier)) {
        specifiers.push(statement.moduleSpecifier.text);
      }
    } else if (
      ts.isImportEqualsDeclaration(statement) &&
      !statement.isTypeOnly &&
      ts.isExternalModuleReference(statement.moduleReference) &&
      ts.isStringLiteral(statement.moduleReference.expression)
    ) {
      specifiers.push(statement.moduleReference.expression.text);
    }
  }
  const calls = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require")) &&
      node.arguments[0] !== undefined &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
    }
    ts.forEachChild(node, calls);
  };
  calls(source);
  return specifiers;
}

/** The value imports of `file` (its `text`) that Metro resolves to `file` itself. */
function selfImports(file: string, base: string, text = readFileSync(file, "utf8")): string[] {
  const self = file.replace(/\.[jt]sx?$/, "");
  return valueImports(file, text).filter((specifier) => {
    const path = target(file, specifier);
    // A directory is its index: from `dir/index.web.ts`, "." and "../dir" are itself too.
    return path !== null && (path === base || path === self || join(path, "index") === base);
  });
}

describe("platform files", () => {
  it("finds the app's platform files", () => {
    const files = platformFiles().map(({ path }) => path);
    expect(files).toContain(join(ROOT, "src/features/wallet/export/report-fonts.web.ts"));
    expect(files).toContain(join(ROOT, "src/features/invoices/pdf.web.ts"));
  });

  it("never take a value from the file they stand for: on their platform, it is themselves", () => {
    const found = platformFiles().flatMap(({ path, base }) =>
      selfImports(path, base).map((specifier) => `${path.slice(ROOT.length + 1)}: ${specifier}`)
    );
    expect(found).toEqual([]);
  });

  it("tells a value taken from itself, however written, from a type", () => {
    const file = join(ROOT, "src/features/wallet/export/report-fonts.web.ts");
    const base = join(ROOT, "src/features/wallet/export/report-fonts");
    const found = (text: string) => selfImports(file, base, text);
    // The import that failed on the web.
    expect(found('import { REPORT_WEIGHTS, fontFace } from "./report-fonts";')).toEqual([
      "./report-fonts"
    ]);
    expect(found('import { fontFace, type FontName } from "./report-fonts";')).toHaveLength(1);
    expect(found('import fonts from "./report-fonts";')).toHaveLength(1);
    expect(found('import * as fonts from "./report-fonts";')).toHaveLength(1);
    expect(found('import "./report-fonts";')).toHaveLength(1);
    expect(found('export { fontFace } from "./report-fonts";')).toHaveLength(1);
    expect(found('export * from "./report-fonts";')).toHaveLength(1);
    expect(found('import { fontFace } from "@/features/wallet/export/report-fonts";')).toHaveLength(
      1
    );
    expect(found('import { fontFace } from "../export/report-fonts.web";')).toHaveLength(1);
    expect(found('import fonts = require("./report-fonts");')).toHaveLength(1);
    expect(found('const fonts = require("./report-fonts");')).toHaveLength(1);
    expect(found('async function f() { return import("./report-fonts"); }')).toHaveLength(1);
    // Types only, as mail.web.ts takes them from mail.ts: the compiler drops the import.
    expect(found('import type { FontName } from "./report-fonts";')).toEqual([]);
    expect(found('import { type FontName } from "./report-fonts";')).toEqual([]);
    expect(found('export type { FontName } from "./report-fonts";')).toEqual([]);
    // Another module, or a package.
    expect(found('import { fontFace } from "./report-font-face";')).toEqual([]);
    expect(found('import { fontFace } from "report-fonts";')).toEqual([]);
    expect(found('const font = require("../../../../assets/fonts/x.ttf");')).toEqual([]);
  });

  it("resolves a directory to its index and the assets alias to the root's assets/", () => {
    const index = join(ROOT, "src/lib/thing/index.web.ts");
    const indexBase = join(ROOT, "src/lib/thing/index");
    expect(selfImports(index, indexBase, 'import { a } from ".";')).toHaveLength(1);
    expect(selfImports(index, indexBase, 'import { a } from "../thing";')).toHaveLength(1);
    expect(selfImports(index, indexBase, 'import { a } from "@/lib/thing";')).toHaveLength(1);
    const asset = join(ROOT, "assets/thing.web.ts");
    const assetBase = join(ROOT, "assets/thing");
    expect(selfImports(asset, assetBase, 'import { a } from "@/assets/thing";')).toHaveLength(1);
    expect(selfImports(asset, assetBase, 'import { a } from "@/thing";')).toEqual([]);
  });
});
