#!/bin/sh
# Copies the Breez SDK's Rust core for Swift (breez_sdk_sparkFFI.framework, a dynamic framework) into
# the app's Frameworks folder, for the card notification extension: the extension links it, the app
# does not (it has its own static build of that core, from the React Native package; linking both
# in one binary could mix the two). Apple wants an extension's frameworks in its app; CocoaPods 1.16
# puts them there only for an extension built with frameworks (installer/analyzer.rb,
# embedded_target_pod_targets_by_host), and Expo's iOS builds use static libraries.
#
# Run by the app's "[sattle.me] Embed Breez framework" phase (plugins/card-notification-extension).
# Modelled on CocoaPods' own "[CP] Embed Pods Frameworks" (install_framework, code_sign_if_enabled).
set -eu

source="${PODS_XCFRAMEWORKS_BUILD_DIR}/SattlemeBreezSdkSparkFFI/breez_sdk_sparkFFI.framework"
destination="${TARGET_BUILD_DIR}/${FRAMEWORKS_FOLDER_PATH}"

if [ ! -d "$source" ]; then
  echo "error: $source is missing (the extension's pods are not installed)" >&2
  exit 1
fi

framework="$destination/breez_sdk_sparkFFI.framework"
mkdir -p "$destination"
rm -rf "$framework"
cp -R "$source" "$framework"
# What only a build against it needs.
rm -rf "$framework/Headers" "$framework/PrivateHeaders" "$framework/Modules"

if [ -n "${EXPANDED_CODE_SIGN_IDENTITY:-}" ] && [ "${CODE_SIGNING_REQUIRED:-}" != "NO" ] &&
  [ "${CODE_SIGNING_ALLOWED:-}" != "NO" ]; then
  # shellcheck disable=SC2086 # OTHER_CODE_SIGN_FLAGS holds several flags, as in CocoaPods.
  /usr/bin/codesign --force --sign "$EXPANDED_CODE_SIGN_IDENTITY" ${OTHER_CODE_SIGN_FLAGS:-} \
    --preserve-metadata=identifier,entitlements "$framework"
fi
