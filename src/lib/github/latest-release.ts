import { getWithTimeout } from "@/lib/http";

/*
 * A file of a GitHub repository's latest release (neither a draft nor a pre-release), which a step
 * downloads itself instead of sending the merchant to the release's page: the Claude Desktop bundle
 * of the assistant (src/lib/assistant/desktop-bundle.ts), a plugin's archive (GuideStep's
 * `link.release`, src/features/integrations/guides.ts). Its version is read on GitHub's API when
 * that step shows; the file's name is the one the repository's release workflow gives it for that
 * version.
 *
 * GitHub is a third party: the request sends it the device's IP address, nothing else, and only
 * once the merchant opened that step. Its answer is untrusted: the version must be plain digits
 * and the release must carry that very file, else the step keeps the release's page, which always
 * works. The file's address is built from the version and the name, never taken from the answer.
 */

/** A step must not wait on a slow network: past this, it keeps the release's page. */
const TIMEOUT_MS = 10_000;

/** A release's tag as the release workflows write it: `v` and a version, no suffix. */
const RELEASE_TAG = /^v((?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5}))$/;

/** A repository's file published in each of its releases. */
export type ReleaseFile = {
  /** The repository on GitHub, `owner/name`. */
  repository: string;
  /** The file's name in release `v<version>` (its release workflow's). */
  name: (version: string) => string;
};

/** The file of the latest release. */
export type ReleaseDownload = {
  /** The release's version, `1.0.2`. */
  version: string;
  /** The file's own download, on github.com. */
  url: string;
};

/** GitHub's API for a repository's latest release. */
export function latestReleaseApi(repository: string): string {
  return `https://api.github.com/repos/${repository}/releases/latest`;
}

/** Where release `v<version>` serves its file `name` (GitHub's address of a release's asset). */
export function releaseFileUrl(repository: string, version: string, name: string): string {
  return `https://github.com/${repository}/releases/download/v${version}/${name}`;
}

/**
 * The file of the repository's latest release. Rejects on any failure: HTTP error (GitHub's rate
 * limit included), timeout, unexpected body, a release without that file.
 */
export function fetchReleaseDownload(
  file: ReleaseFile,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = TIMEOUT_MS
): Promise<ReleaseDownload> {
  const api = latestReleaseApi(file.repository);
  return getWithTimeout(api, fetchImpl, timeoutMs, async (response) => {
    if (!response.ok) throw new Error(`GET ${api} failed with HTTP ${response.status}`);
    const body = (await response.json()) as unknown;
    const release =
      typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
    const tag = typeof release.tag_name === "string" ? RELEASE_TAG.exec(release.tag_name) : null;
    const version = tag?.[1];
    if (!version) throw new Error(`GET ${api}: unexpected release tag`);
    const name = file.name(version);
    const carried =
      Array.isArray(release.assets) &&
      release.assets.some(
        (asset: unknown) =>
          typeof asset === "object" && asset !== null && (asset as { name?: unknown }).name === name
      );
    if (!carried) throw new Error(`GET ${api}: the release has no file ${name}`);
    return { version, url: releaseFileUrl(file.repository, version, name) };
  });
}
