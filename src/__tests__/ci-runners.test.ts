// Which runners run the workflows. In a public repository anyone can open a pull request: every
// job runs on GitHub's hosted runners, which start clean and hold no deploy secret. Read as text:
// no YAML parser is a dependency of the project.

const fs = jest.requireActual<{
  readFileSync(path: string, encoding: "utf8"): string;
  readdirSync(path: string): string[];
}>("fs");

const HOSTED_RUNNER = "ubuntu-24.04";

const workflows = fs
  .readdirSync(".github/workflows")
  .filter((file) => /\.ya?ml$/.test(file))
  .map((file) => ({
    file,
    // Comments left out: they may name what the workflow must not do.
    code: fs
      .readFileSync(`.github/workflows/${file}`, "utf8")
      .split("\n")
      .filter((line) => !/^\s*#/.test(line))
      .join("\n")
  }));

/** The workflow's `on:` block: its triggers. */
function triggersOf(code: string): string {
  const match = /^on:\n((?: {2}.*\n|\n)*)/m.exec(code);
  if (!match) throw new Error("no `on:` block");
  return match[1];
}

describe("pull requests' runners", () => {
  it("runs pull requests in ci.yml only", () => {
    const withPullRequests = workflows
      .filter(({ code }) => /^ {2}pull_request\b/m.test(triggersOf(code)))
      .map(({ file }) => file);
    expect(withPullRequests).toEqual(["ci.yml"]);
  });

  // pull_request_target runs the base branch's workflow with its secrets and without the approval
  // that external contributors' runs wait for (GitHub docs, "Approving workflow runs from forks").
  it("never uses pull_request_target nor workflow_run", () => {
    for (const { file, code } of workflows) {
      expect({ file, target: /pull_request_target|workflow_run/.test(code) }).toEqual({
        file,
        target: false
      });
    }
  });

  it("runs every job of every workflow on GitHub's hosted runners", () => {
    for (const { file, code } of workflows) {
      const jobs = code.slice(code.indexOf("\njobs:\n"));
      const names = [...jobs.matchAll(/^ {2}[a-z][a-z0-9_-]*:\s*$/gm)].length;
      const runners = [...jobs.matchAll(/^ {4}runs-on: (.*)$/gm)].map((match) => match[1]);
      const reusable = [...jobs.matchAll(/^ {4}uses: \.\/\.github\/workflows\//gm)].length;
      expect({ file, jobs: runners.length + reusable }).toEqual({ file, jobs: names });
      for (const runner of runners)
        expect({ file, runner }).toEqual({ file, runner: HOSTED_RUNNER });
    }
  });

  it("names no self-hosted runner", () => {
    for (const { file, code } of workflows) {
      expect({ file, selfHosted: /self-hosted/.test(code) }).toEqual({ file, selfHosted: false });
    }
  });
});
