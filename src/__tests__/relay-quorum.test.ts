// Node's types are not loaded (tsconfig `types` only lists jest): only what this test needs, as
// dependencies.test.ts.
declare const __dirname: string;
const { readdirSync, readFileSync, statSync } = jest.requireActual<{
  readdirSync(dir: string): string[];
  readFileSync(file: string, encoding: "utf8"): string;
  statSync(path: string): { isDirectory(): boolean };
}>("fs");
const { join, relative } = jest.requireActual<{
  join(...segments: string[]): string;
  relative(from: string, to: string): string;
}>("path");

/*
 * No call of the app waits for every relay of its list: a relay that stays connected without
 * answering would hold it up to its timeout. The calls of src/lib/nostr/pool.ts wait for a
 * majority by default; "all" is left to "Test the connection" alone, which shows each relay's own
 * light. This reads the app's code (as dependencies.test.ts reads package.json): a new call that
 * waits for every relay fails here.
 */

const ROOT = join(__dirname, "..");

/** The pool's calls that take a quorum. */
const CALLS = [
  "queryRelays",
  "queryRelaysPaged",
  "publishToRelays",
  "publishAgain",
  "eachRelayAnswer"
];

/** Where "all" stays, and why: a light per relay, nothing decided on it. */
const ALL_ALLOWED = new Set(["features/relays/relay-test.ts"]);

/** The app's source files: src/ but its tests and the pool itself. */
function sources(dir: string = ROOT): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" ? [] : sources(path);
    return /\.tsx?$/.test(name) && relative(ROOT, path) !== join("lib", "nostr", "pool.ts")
      ? [path]
      : [];
  });
}

/** Each call of `name` in `text`, its arguments with it (parentheses matched). */
function callsOf(text: string, name: string): string[] {
  const found: string[] = [];
  const pattern = new RegExp(`\\b${name}\\(`, "g");
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    let depth = 1;
    let end = match.index + match[0].length;
    while (depth > 0 && end < text.length) {
      if (text[end] === "(") depth += 1;
      else if (text[end] === ")") depth -= 1;
      end += 1;
    }
    found.push(text.slice(match.index, end));
  }
  return found;
}

describe("the app's calls to the relays", () => {
  const files = sources();

  it("are found where they are: the check reads the app's code", () => {
    const counted = files.reduce(
      (count, file) =>
        count +
        CALLS.reduce((sum, name) => sum + callsOf(readFileSync(file, "utf8"), name).length, 0),
      0
    );
    // About a hundred and fifty calls: a broken scan would find none.
    expect(counted).toBeGreaterThan(100);
  });

  it('never wait for every relay, but "Test the connection"', () => {
    const waiting = files.flatMap((file) => {
      const text = readFileSync(file, "utf8");
      const where = relative(ROOT, file);
      return CALLS.flatMap((name) =>
        callsOf(text, name)
          .filter((call) => /quorum:\s*"all"/.test(call) && !ALL_ALLOWED.has(where))
          .map(() => `${where}: ${name}`)
      );
    });
    expect(waiting).toEqual([]);
  });

  it("wait for a majority unless they say otherwise", () => {
    const pool = readFileSync(join(ROOT, "lib", "nostr", "pool.ts"), "utf8");
    expect(pool).not.toMatch(/quorum = "all"/);
    expect(pool.match(/quorum = "majority"/g)?.length).toBe(CALLS.length);
  });
});
