import { ASSISTANT_REPOSITORY } from "@/config/assistants";
import type { ReleaseFile } from "@/lib/github/latest-release";

/*
 * The Claude Desktop bundle of the assistant (`.mcpb`, sattleme/mcp-server): which file the steps
 * of "AI assistant › In Claude Desktop" download (the file itself, not the release's page), from
 * the latest release, read on GitHub's API when those steps show (src/lib/github/latest-release.ts).
 * Its name is the release workflow's (sattleme/mcp-server, `.github/workflows/release.yml`:
 * `sattleme-assistant-<version>.mcpb`, an asset of release `v<version>`). When it cannot be read,
 * the steps keep the release's page (ASSISTANT_CONNECTIONS.desktop), which always works.
 */

/** The bundle's file name in release `v<version>` (the server's release workflow). */
export function desktopBundleName(version: string): string {
  return `sattleme-assistant-${version}.mcpb`;
}

/** The bundle, a file of each of the server's releases. */
export const DESKTOP_BUNDLE: ReleaseFile = {
  repository: ASSISTANT_REPOSITORY,
  name: desktopBundleName
};
