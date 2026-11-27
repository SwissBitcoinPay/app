// .github/CODEOWNERS: the paths a pull request may change only with a code owner's approval, once
// main's ruleset requires it. In a public repository anyone can open a pull request: what
// runs code on a maintainer's machine, an agent's session or CI, what builds or ships the app, and
// what instructs coding agents must not leave the list unnoticed.
// Read as text: GitHub's own syntax is a subset of .gitignore's (its docs, "About code owners").

const fs = jest.requireActual<{
  readFileSync(path: string, encoding: "utf8"): string;
  existsSync(path: string): boolean;
  statSync(path: string): { isDirectory(): boolean };
}>("fs");

type Rule = { pattern: string; owners: string[] };

const rules: Rule[] = fs
  .readFileSync(".github/CODEOWNERS", "utf8")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line !== "" && !line.startsWith("#"))
  .map((line) => {
    const [pattern, ...owners] = line.split(/\s+/);
    return { pattern, owners };
  });

/**
 * The owners of a path, as GitHub picks them: the last matching rule wins. Only the forms this
 * file uses are matched (an anchored file, or an anchored directory and all it holds); a rule in
 * another form fails the syntax test below.
 */
function ownersOf(path: string): string[] {
  let owners: string[] = [];
  for (const { pattern, owners: candidate } of rules) {
    const matches = pattern.endsWith("/") ? `/${path}`.startsWith(pattern) : `/${path}` === pattern;
    if (matches) owners = candidate;
  }
  return owners;
}

/** What must keep an owner: a file, or a directory (by a file within it). */
const GUARDED = [
  ".github/CODEOWNERS",
  ".github/workflows/ci.yml",
  ".github/workflows/release-production.yml",
  ".github/dependabot.yml",
  ".claude/settings.json",
  ".claude/hooks/session-start.sh",
  ".claude/skills/android-apk/SKILL.md",
  "AGENTS.md",
  "CLAUDE.md",
  ".mcp.json",
  ".eas/workflows/release-production.yml",
  "eas.json",
  "app.config.ts",
  "plugins/x.js",
  "modules/card-socket/x.ts",
  "fingerprint.config.js",
  "metro.config.js",
  "package.json",
  "package-lock.json",
  ".nvmrc",
  "scripts/x.js",
  "eslint.config.js",
  "jest.config.js",
  "jest.setup.ts",
  "jest.after-env.ts",
  "jest/x.ts",
  "SECURITY.md",
  "public/.well-known/security.txt"
];

describe("CODEOWNERS", () => {
  it("lives where GitHub looks first, under 3 MB", () => {
    expect(fs.existsSync(".github/CODEOWNERS")).toBe(true);
    // GitHub reads .github/, then the root, then docs/, and uses the first one it finds.
    expect(fs.existsSync("CODEOWNERS")).toBe(false);
    expect(fs.existsSync("docs/CODEOWNERS")).toBe(false);
    expect(fs.readFileSync(".github/CODEOWNERS", "utf8").length).toBeLessThan(3_000_000);
  });

  it("uses only anchored paths and named owners (GitHub skips a line it cannot read)", () => {
    expect(rules.length).toBeGreaterThan(0);
    for (const { pattern, owners } of rules) {
      expect(pattern).toMatch(/^\/[A-Za-z0-9._/-]+$/);
      expect(owners.length).toBeGreaterThan(0);
      for (const owner of owners) expect(owner).toMatch(/^@[A-Za-z0-9-]+(\/[A-Za-z0-9_.-]+)?$/);
    }
  });

  it.each(GUARDED)("gives %s an owner", (path) => {
    expect(ownersOf(path)).not.toEqual([]);
  });

  it("names only paths of the repository, so that a renamed one is noticed", () => {
    // `.mcp.json` does not exist yet: listed so that adding one needs an owner.
    const notYet = new Set(["/.mcp.json"]);
    for (const { pattern } of rules) {
      if (notYet.has(pattern)) continue;
      const path = pattern.slice(1);
      expect(fs.existsSync(path.endsWith("/") ? path.slice(0, -1) : path)).toBe(true);
      if (pattern.endsWith("/")) expect(fs.statSync(path).isDirectory()).toBe(true);
    }
  });
});
