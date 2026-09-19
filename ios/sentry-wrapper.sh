#!/bin/bash

# Fix by https://github.com/getsentry/sentry-react-native/issues/5168#issuecomment-3307421119

set -e

# GlitchTip with SENTRY_DSN only: no org/project/token for sentry-cli, so skip
# the source maps upload (otherwise this phase fails and breaks the archive).
export SENTRY_DISABLE_AUTO_UPLOAD=true

exec ../node_modules/@sentry/react-native/scripts/sentry-xcode.sh ../node_modules/react-native/scripts/react-native-xcode.sh
