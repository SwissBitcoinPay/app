#!/usr/bin/env bash
# Builds a release APK locally, without EAS, to check that the native build works.
#
# Usage: scripts/build-android-local.sh staging|production   (no default: like app.config.ts,
#        nothing resolves to production unless explicitly asked for)
# Env:   ANDROID_HOME   required (see scripts/setup-android-sdk.sh)
#        ANDROID_ABIS   optional, e.g. "arm64-v8a" for a faster build (default: all four ABIs)
#
# The APK is signed with the Android DEBUG key: it is for testing only and can
# never be uploaded to a store. Store builds are made by EAS Build.
set -euo pipefail

variant="${1:-}"
case "$variant" in
  staging | production) ;;
  *)
    echo "Usage: $0 staging|production" >&2
    exit 1
    ;;
esac
: "${ANDROID_HOME:?Set ANDROID_HOME first (run scripts/setup-android-sdk.sh)}"

cd "$(dirname "$0")/.."
export APP_VARIANT="$variant"
version="$(node -p "require('./package.json').version")"

# `npm run android` (expo run:android) only runs prebuild when android/ is missing:
# it would silently reuse this project, with the production application id. Warn on
# every exit from here on, including a failed prebuild or Gradle build (set -e).
warn_native_project() {
  echo "android/ now holds the $variant native project: run 'rm -rf android' before 'npm run android'."
}
if [ "$variant" != "staging" ]; then
  trap warn_native_project EXIT
fi

# Regenerate the native project from app.config.ts (android/ is not committed).
npx expo prebuild --platform android --clean --no-install

gradle_args=(--no-daemon assembleRelease)
if [ -n "${ANDROID_ABIS:-}" ]; then
  gradle_args+=("-PreactNativeArchitectures=$ANDROID_ABIS")
fi
(cd android && ./gradlew "${gradle_args[@]}")

mkdir -p build
out="build/sattle-me-$variant-$version.apk"
cp android/app/build/outputs/apk/release/app-release.apk "$out"
echo "APK: $out"
