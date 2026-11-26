#!/bin/bash
# SessionStart hook for Claude Code on the web: installs npm dependencies so
# lint, typecheck and tests work right away. Local sessions are left untouched.
# settings.json limits it to startup/resume/fork: /clear and compaction keep the
# same container, so re-installing there would only delay Claude's next reply.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Skip the Breez SDK native binaries download (~100 MB): lint/typecheck/tests
# don't need them, and `expo prebuild` fetches them when building an APK.
# SessionStart stdout is injected into Claude's context: send npm's output to stderr.
EXPO_PUBLIC_SKIP_POSTINSTALL=1 npm install --no-audit --no-fund >&2

# Reuse an Android SDK installed by scripts/setup-android-sdk.sh, if any.
if [ -d "$HOME/android-sdk" ] && [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export ANDROID_HOME=\"$HOME/android-sdk\"" >> "$CLAUDE_ENV_FILE"
fi
