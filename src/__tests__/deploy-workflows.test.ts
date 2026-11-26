// The deploy workflows: .github/workflows/deploy-staging.yml and release-production.yml, and the
// EAS workflows they start (.eas/workflows/). What keeps the Expo tokens away from the project's
// packages, gates a release, and keeps the store's app from coming before the web app that serves
// its passkeys' files must not erode unnoticed.
// Read as text, job by job: no YAML parser is a dependency of the project.

import { IOS_APP_URL } from "@/config/app-stores";

const fs = jest.requireActual<{
  readFileSync(path: string, encoding: "utf8"): string;
  readdirSync(path: string): string[];
  existsSync(path: string): boolean;
}>("fs");
const { PUBLIC_EXPORT_VARIABLES } = jest.requireActual<{
  PUBLIC_EXPORT_VARIABLES: { name: string; required: boolean }[];
}>("../../scripts/eas-public-env.js");

/** A workflow's text without its comments, which may name what its commands must not run. */
function code(workflow: string): string {
  return workflow
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
}

/**
 * The text of each job of a workflow, by its id (the keys of `jobs:`, indented by two spaces),
 * comments left out. GitHub's ids may hold hyphens, EAS's underscores.
 */
function jobsOf(workflow: string): Record<string, string> {
  const lines = code(workflow).split("\n");
  const start = lines.indexOf("jobs:");
  const result: Record<string, string> = {};
  let current: string | null = null;
  for (const line of lines.slice(start + 1)) {
    const id = /^ {2}([a-z][a-z0-9_-]*):\s*$/.exec(line);
    if (id) {
      current = id[1];
      result[current] = "";
    } else if (current !== null) {
      result[current] += `${line}\n`;
    }
  }
  return result;
}

const read = (path: string) => fs.readFileSync(path, "utf8");
const staging = read(".github/workflows/deploy-staging.yml");
const release = read(".github/workflows/release-production.yml");
const easStaging = read(".eas/workflows/deploy-staging.yml");
const easRelease = read(".eas/workflows/release-production.yml");
const stagingJob = jobsOf(staging);
const releaseJob = jobsOf(release);
const easStagingJob = jobsOf(easStaging);
const easReleaseJob = jobsOf(easRelease);
const eas = JSON.parse(read("eas.json")) as {
  submit: { production: { android: Record<string, string>; ios: Record<string, string> } };
};

/** The app's two platforms: each one has the same jobs on EAS, on its own. */
const PLATFORMS = ["android", "ios"] as const;

/** What runs the project's packages (or their scripts) in a job. */
const RUNS_PACKAGES = /\bnpm (ci|install|i|run|exec|test)\b|\bnpx\b|\byarn\b|\bpnpm\b|\bbunx?\b/;

/** What hands a job a secret: a secret, or the workflow's own GitHub token. */
const HOLDS_A_SECRET = /\bsecrets\.|\bgithub\.token\b/;

describe("every GitHub workflow", () => {
  const workflows = fs
    .readdirSync(".github/workflows")
    .filter((file) => file.endsWith(".yml"))
    .map((file) => ({ file, jobs: jobsOf(read(`.github/workflows/${file}`)) }));

  // A package that reads a token can use it: a token is never where the project's packages run.
  it("never runs the project's packages in a job that holds a secret", () => {
    expect(workflows.map(({ file }) => file)).toEqual(
      expect.arrayContaining(["deploy-staging.yml", "release-production.yml"])
    );
    for (const { file, jobs } of workflows) {
      for (const [id, job] of Object.entries(jobs)) {
        if (HOLDS_A_SECRET.test(job)) {
          expect({ file, id, runsPackages: RUNS_PACKAGES.test(job) }).toEqual({
            file,
            id,
            runsPackages: false
          });
        }
      }
    }
  });

  // EAS CLI reads the project's id with the config's plugins (eas env:pull, eas deploy): where
  // the token is, without the packages, app.config.ts leaves them out. Never where packages run,
  // nor on EAS, where a config without its plugins would make another app.
  it("leaves the config's plugins out where EAS CLI runs without the packages, only there", () => {
    const flag = 'APP_CONFIG_WITHOUT_PLUGINS: "1"';
    for (const { file, jobs } of workflows) {
      for (const [id, job] of Object.entries(jobs)) {
        const readsTheConfig = /\beas (env:pull|deploy)\b/.test(job);
        expect({ file, id, flag: job.includes(flag) }).toEqual({ file, id, flag: readsTheConfig });
        if (job.includes("APP_CONFIG_WITHOUT_PLUGINS")) expect(job).not.toMatch(RUNS_PACKAGES);
      }
    }
    for (const workflow of [easStaging, easRelease]) {
      expect(workflow).not.toContain("APP_CONFIG_WITHOUT_PLUGINS");
    }
  });

  // The action raises the runner's inotify limit with sudo by default, which a runner without sudo
  // refuses (a warning on every run); no job here runs a watcher (Metro).
  it("never has expo-github-action patch the runner's watchers", () => {
    for (const { file } of workflows) {
      const text = code(read(`.github/workflows/${file}`));
      const uses = text.match(/uses: expo\/expo-github-action@/g)?.length ?? 0;
      const off = text.match(/\n {10}patch-watchers: false\n/g)?.length ?? 0;
      expect({ file, off }).toEqual({ file, off: uses });
    }
  });

  it("pins every action by commit", () => {
    for (const { file } of workflows) {
      for (const [, ref] of code(read(`.github/workflows/${file}`)).matchAll(
        /uses: [^.@\s][^@\s]*@(\S+)/g
      )) {
        expect(ref).toMatch(/^[0-9a-f]{40}$/);
      }
    }
  });
});

/**
 * The jobs of a web deploy: `config` reads the export's public values with the token, the export
 * runs the packages without it, the deploy job deploys that export with the token.
 */
function expectWebDeploy(
  jobs: Record<string, string>,
  {
    environment,
    easEnvironment,
    variant,
    artifact,
    deployJob,
    deployCommand
  }: Record<string, string>
) {
  // config: the token and EAS CLI, the EAS environment's values handed on as outputs.
  expect(jobs.config).toContain(`environment: ${environment}`);
  expect(jobs.config).toContain("token: ${{ secrets.EXPO_TOKEN }}");
  expect(jobs.config).toContain(`eas env:pull --environment ${easEnvironment} --path`);
  expect(jobs.config).toContain('node scripts/eas-public-env.js "$RUNNER_TEMP/eas.env"');
  expect(jobs.config).toContain('rm -f "$RUNNER_TEMP/eas.env"');

  // export-web: no secret, no environment; the packages, then the export with its files.
  const exportJob = jobs["export-web"];
  expect(exportJob).toContain("needs: config");
  expect(exportJob).not.toMatch(HOLDS_A_SECRET);
  expect(exportJob).not.toContain("environment:");
  expect(exportJob).toContain(`APP_VARIANT: ${variant}`);
  for (const { name } of PUBLIC_EXPORT_VARIABLES) {
    expect(jobs.config).toContain(`${name}: \${{ steps.values.outputs.${name} }}`);
    expect(exportJob).toContain(`${name}: \${{ needs.config.outputs.${name} }}`);
  }
  const steps = [
    "run: npm ci",
    "run: node scripts/passkey-association.js\n",
    "run: npm run export:web",
    "uses: actions/upload-artifact@"
  ].map((step) => exportJob.indexOf(step));
  expect(steps.every((index) => index >= 0)).toBe(true);
  expect(steps).toEqual([...steps].sort((a, b) => a - b));
  // The passkeys' files are in dist/.well-known/, a hidden directory.
  expect(exportJob).toMatch(
    new RegExp(`name: ${artifact}\\n {10}path: dist/\\n {10}include-hidden-files: true\\n`)
  );

  // The deploy: the token, EAS CLI and the export, its passkeys' files there.
  const deploy = jobs[deployJob];
  expect(deploy).toContain("needs: export-web");
  expect(deploy).toContain(`environment: ${environment}`);
  expect(deploy).toMatch(new RegExp(`name: ${artifact}\\n {10}path: dist\\n`));
  expect(deploy).toContain("test -f dist/.well-known/apple-app-site-association");
  expect(deploy).toContain("test -f dist/.well-known/assetlinks.json");
  expect(deploy).toContain(`${deployCommand} --export-dir dist --non-interactive`);
}

describe("the staging deploy (GitHub)", () => {
  it("deploys the web app beside the app's update, from main only", () => {
    expect(Object.keys(stagingJob)).toEqual(["config", "export-web", "deploy-web", "app"]);
    for (const id of ["config", "app"]) {
      expect(stagingJob[id]).toContain("if: github.ref == 'refs/heads/main'");
    }
    // The app's update does not wait for the web app, nor the other way round.
    expect(stagingJob.app).not.toContain("needs:");
    expect(stagingJob.app).toContain("environment: staging");
    expect(stagingJob.app).toContain(
      "eas workflow:run .eas/workflows/deploy-staging.yml --non-interactive --no-wait"
    );
  });

  it("exports the web app without any token, and deploys that export", () => {
    expectWebDeploy(stagingJob, {
      environment: "staging",
      easEnvironment: "preview",
      variant: "staging",
      artifact: "web-staging",
      deployJob: "deploy-web",
      deployCommand: "eas deploy --alias staging"
    });
  });

  // Only staging's own changes deploy staging.
  it("does not deploy staging when only the release changes", () => {
    expect(staging).toContain('- ".github/workflows/release-production.yml"');
    expect(staging).toContain('- ".eas/workflows/release-production.yml"');
  });
});

describe("the production release (GitHub)", () => {
  it("runs for a release tag only, one at a time", () => {
    expect(release).toMatch(/\non:\n {2}push:\n {4}tags: \["v\*\.\*\.\*"\]\n\n/);
    expect(release).not.toContain("workflow_dispatch");
    expect(release).toMatch(
      /\nconcurrency:\n {2}group: release-production\n {2}cancel-in-progress: false\n {2}queue: max\n/
    );
  });

  it("re-runs the CI and checks the tag before asking for an approval", () => {
    expect(Object.keys(releaseJob)).toEqual([
      "checks",
      "verify-tag",
      "config",
      "export-web",
      "release"
    ]);
    expect(releaseJob.checks).toContain("uses: ./.github/workflows/ci.yml");
    expect(releaseJob["verify-tag"]).toContain("Tag must match package.json version");
    expect(releaseJob["verify-tag"]).toContain("git merge-base --is-ancestor HEAD origin/main");
    expect(releaseJob["verify-tag"]).not.toContain("if:");
    expect(releaseJob.config).toContain("needs: [checks, verify-tag]");
    // The token only where a reviewer approved (environment production).
    expect(code(release).match(/secrets\.EXPO_TOKEN/g)).toHaveLength(2);
    for (const id of ["config", "release"]) {
      expect(releaseJob[id]).toContain("environment: production");
    }
  });

  it("exports the web app without any token, and deploys that export to production", () => {
    expectWebDeploy(releaseJob, {
      environment: "production",
      easEnvironment: "production",
      variant: "production",
      artifact: "web-production",
      deployJob: "release",
      deployCommand: "eas deploy --prod"
    });
  });

  // The web app that serves the passkeys' files goes first, then the app's build and submission.
  it("starts the app's release on EAS once the web app is deployed", () => {
    const deploy = releaseJob.release.indexOf("eas deploy --prod");
    const start = releaseJob.release.indexOf(
      "eas workflow:run .eas/workflows/release-production.yml --non-interactive --no-wait"
    );
    expect(deploy).toBeGreaterThanOrEqual(0);
    expect(start).toBeGreaterThan(deploy);
    expect(releaseJob.release).toContain('-F "commit=$(git rev-parse HEAD)"');
  });
});

describe("the EAS workflows", () => {
  it("never deploy a web app: the GitHub workflows deploy what they exported without a token", () => {
    for (const workflow of [easStaging, easRelease]) {
      expect(code(workflow)).not.toMatch(/type: deploy\b|\beas deploy\b/);
    }
  });

  // Started by the GitHub release only: never on a push nor a pull request.
  it("release the app only when the GitHub release starts it, one release at a time", () => {
    expect(easRelease).toMatch(/\non:\n {2}workflow_dispatch:\n/);
    expect(easRelease).not.toMatch(/\n {2}(push|pull_request\w*|schedule):/);
    expect(easRelease).toMatch(/\nconcurrency:\n {2}group: release-production\n {2}queue: max\n/);
    expect(easStaging).not.toMatch(/\n {2}(push|pull_request\w*|schedule):/);
  });

  // The production web app serves the passkeys' association files on their RP ID's host: they are
  // checked where Apple and Android read them before each app goes to its store. Android and iOS
  // alike, neither waiting for the other.
  it("builds each app, then checks the passkey files and submits it", () => {
    expect(Object.keys(easReleaseJob)).toEqual([
      "build_android",
      "submit_android",
      "build_ios",
      "submit_ios"
    ]);
    for (const platform of PLATFORMS) {
      const build = easReleaseJob[`build_${platform}`];
      const submit = easReleaseJob[`submit_${platform}`];
      expect(build).toContain("type: build");
      expect(build).not.toContain("needs:");
      expect(build).toMatch(
        new RegExp(`params:\n {6}platform: ${platform}\n {6}profile: production\n`)
      );
      expect(build).toContain("EXPO_PUBLIC_GIT_COMMIT: ${{ inputs.commit }}");
      expect(submit).toContain(`needs: [build_${platform}]`);
      expect(submit).toContain("type: submit");
      expect(submit).toContain(`build_id: \${{ needs.build_${platform}.outputs.build_id }}`);
      expect(submit).toMatch(/\n {6}profile: production\n/);
      expect(submit).toContain("APP_VARIANT: production");
      expect(submit).toMatch(
        /before_submit:\n[\s\S]*run: node scripts\/passkey-association\.js --check\n/
      );
    }
  });

  // What the submissions do: neither reaches the stores' public. Android goes to the internal
  // track, from which a human promotes it; iOS goes to App Store Connect (TestFlight), where a human
  // submits it for review and releases it.
  it("submit each app where only a human releases it", () => {
    expect(eas.submit.production.android).toEqual({
      track: "internal",
      releaseStatus: "completed"
    });
    // The production app of the App Store, the v2's: the one the web app's install links name.
    const appStoreId = /\/id(\d+)$/.exec(IOS_APP_URL)?.[1];
    expect(appStoreId).toMatch(/^\d+$/);
    expect(eas.submit.production.ios).toEqual({ ascAppId: appStoreId });
  });

  // Staging: for each platform, an update when a build has the platform's fingerprint, a build
  // otherwise, signed with the credentials a hook writes (staging-*-credentials.js).
  it("deploy staging to each platform on its own", () => {
    expect(Object.keys(easStagingJob)).toEqual([
      "fingerprint",
      "get_build_android",
      "build_android",
      "update_android",
      "get_build_ios",
      "build_ios",
      "update_ios"
    ]);
    expect(easStagingJob.fingerprint).toContain("environment: preview");
    expect(easStagingJob.fingerprint).toContain("APP_VARIANT: staging");
    for (const platform of PLATFORMS) {
      const getBuild = easStagingJob[`get_build_${platform}`];
      const build = easStagingJob[`build_${platform}`];
      const update = easStagingJob[`update_${platform}`];
      expect(getBuild).toContain("needs: [fingerprint]");
      expect(getBuild).toMatch(
        new RegExp(`params:\n {6}platform: ${platform}\n {6}profile: staging\n`)
      );
      expect(getBuild).toContain(
        `runtime_version: \${{ needs.fingerprint.outputs.${platform}_fingerprint_hash }}`
      );
      expect(getBuild).toContain("wait_for_in_progress: true");

      expect(build).toContain(`needs: [get_build_${platform}]`);
      expect(build).toContain(`if: \${{ !needs.get_build_${platform}.outputs.build_id }}`);
      expect(build).toMatch(
        new RegExp(`params:\n {6}platform: ${platform}\n {6}profile: staging\n`)
      );
      expect(build).toContain("EXPO_PUBLIC_GIT_COMMIT: ${{ inputs.commit }}");

      expect(update).toContain(`needs: [get_build_${platform}]`);
      expect(update).toContain(`if: \${{ needs.get_build_${platform}.outputs.build_id }}`);
      expect(update).toContain("environment: preview");
      expect(update).toContain("APP_VARIANT: staging");
      expect(update).toMatch(new RegExp(`\n {6}branch: staging\n {6}platform: ${platform}\n`));
    }
    // The refresh needs credentials managed by EAS (Expo, "Internal distribution"): the staging
    // iOS app's are local (staging-ios-credentials.js), its profile made again by hand.
    expect(easStaging).not.toContain("refresh_ad_hoc_provisioning_profile");
  });

  // The app's build and submission go through EAS only: no other file builds, signs nor submits.
  it("leave no other way to build or submit the production app", () => {
    expect(fs.existsSync(".github/workflows/android-reproducible-build.yml")).toBe(false);
    expect(fs.existsSync(".eas/workflows/deploy-production-web.yml")).toBe(false);
    expect(code(release)).not.toMatch(/eas (build|submit)\b|ANDROID_UPLOAD_|jarsigner/);
  });
});
