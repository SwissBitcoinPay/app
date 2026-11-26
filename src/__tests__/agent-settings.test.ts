// .claude/settings.json is committed: Claude Code runs its hooks without asking, in every session
// of a folder its user trusted once (trust is kept per repository, not per branch) and in every
// `claude -p` run. A hook is code that runs with the maintainer's own access, so each one is a
// script of this repository, in .claude/hooks/, reviewed by its code owners (.github/CODEOWNERS):
// never a third party's binary nor a download (AGENTS.md).

const fs = jest.requireActual<{
  readFileSync(path: string, encoding: "utf8"): string;
  existsSync(path: string): boolean;
}>("fs");

type Hook = { type: string; command?: string };
type Settings = {
  hooks?: Record<string, { matcher?: string; hooks: Hook[] }[]>;
  permissions?: { allow?: string[]; deny?: string[] };
};

const settings = JSON.parse(fs.readFileSync(".claude/settings.json", "utf8")) as Settings;
const hooks = Object.entries(settings.hooks ?? {}).flatMap(([event, groups]) =>
  groups.flatMap((group) => group.hooks.map((hook) => ({ event, ...hook })))
);

describe(".claude/settings.json", () => {
  it("runs only the session start hook", () => {
    expect(hooks.map((hook) => hook.event)).toEqual(["SessionStart"]);
  });

  it.each(hooks)("runs a committed script of .claude/hooks/ ($event)", (hook) => {
    expect(hook.type).toBe("command");
    const script = /^"\$CLAUDE_PROJECT_DIR"\/(\.claude\/hooks\/[a-z0-9-]+\.sh)$/.exec(
      hook.command ?? ""
    );
    expect(script).not.toBeNull();
    expect(fs.existsSync(script![1])).toBe(true);
  });

  it("installs dependencies in cloud sessions only, without the native binaries", () => {
    const script = fs.readFileSync(".claude/hooks/session-start.sh", "utf8");
    // Cloud sessions only: on a maintainer's machine, `npm install` would run the branch's scripts.
    expect(script).toMatch(/if \[ "\$\{CLAUDE_CODE_REMOTE:-\}" != "true" \]; then\n\s+exit 0\nfi/);
    expect(script).toContain("EXPO_PUBLIC_SKIP_POSTINSTALL=1 npm install");
  });

  it("keeps the deny rules of releases and secrets", () => {
    const deny = settings.permissions?.deny ?? [];
    for (const rule of ["Bash(eas *)", "Bash(npm publish*)", "Bash(gh release create *)"]) {
      expect(deny).toContain(rule);
    }
    expect(deny).toContain("Read(.env*)");
  });
});
