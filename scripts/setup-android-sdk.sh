#!/usr/bin/env bash
# Installs a headless Android SDK (no Android Studio) so that
# `npm run build:android:local` can produce an APK on Linux — typically in a
# fresh CI runner or a Claude Code cloud container.
#
# Usage: scripts/setup-android-sdk.sh            (installs into $ANDROID_HOME or ~/android-sdk)
# Then:  export ANDROID_HOME=~/android-sdk
#
# Versions follow what React Native 0.86 / Expo SDK 57 / Breez SDK Spark expect.
# Gradle downloads any other missing SDK component on its own, since the
# licenses are accepted below.
set -euo pipefail

ANDROID_HOME="${ANDROID_HOME:-$HOME/android-sdk}"
# cmdline-tools 22.0: last release whose `sdkmanager` is the classic tool (23.0
# turned it into a shim over the new `android` CLI).
CMDLINE_TOOLS_ZIP="commandlinetools-linux-15859902_latest.zip"
CMDLINE_TOOLS_SHA1="040d3996a65543d22ec4bf73e4c37aa37a8d4af4"
PACKAGES=(
  "platform-tools"
  "platforms;android-36"
  "build-tools;36.0.0"
  "build-tools;35.0.0"
  "ndk;27.1.12297006"
  "cmake;3.22.1"
)

if [ ! -x "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]; then
  echo "Installing Android command-line tools into $ANDROID_HOME"
  tmp="$(mktemp -d)"
  # Also clean up when the download, checksum or unzip fails (set -e exits early).
  trap 'rm -rf "$tmp"' EXIT
  curl -fsSL "https://dl.google.com/android/repository/$CMDLINE_TOOLS_ZIP" -o "$tmp/tools.zip"
  echo "$CMDLINE_TOOLS_SHA1  $tmp/tools.zip" | sha1sum -c -
  mkdir -p "$ANDROID_HOME/cmdline-tools"
  unzip -q "$tmp/tools.zip" -d "$tmp"
  rm -rf "$ANDROID_HOME/cmdline-tools/latest"
  mv "$tmp/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
fi

sdkmanager="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
# `yes` gets SIGPIPE once sdkmanager exits: that is expected, not an error.
(set +o pipefail; yes | "$sdkmanager" --sdk_root="$ANDROID_HOME" --licenses >/dev/null)
# Progress bars are written to a log file to keep the console (and agent context) readable.
log="$ANDROID_HOME/sdkmanager-install.log"
if ! "$sdkmanager" --sdk_root="$ANDROID_HOME" --install "${PACKAGES[@]}" >"$log" 2>&1; then
  tail -n 20 "$log"
  exit 1
fi

echo
echo "Android SDK ready. Add to your shell:"
echo "  export ANDROID_HOME=$ANDROID_HOME"
