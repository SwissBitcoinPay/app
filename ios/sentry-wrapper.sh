#!/bin/bash

# Fix by https://github.com/getsentry/sentry-react-native/issues/5168#issuecomment-3307421119

set -e
exec ../node_modules/@sentry/react-native/scripts/sentry-xcode.sh ../node_modules/react-native/scripts/react-native-xcode.sh