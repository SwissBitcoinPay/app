#!/bin/bash

cd $(dirname $0)
cd ..

source .env

npm remove react-native-vision-camera

ANDROID_BUILD_ASSETS=android/app/src/main/assets

DEV=$DEV npm run bundle:android
# Sourcemaps uploading

node_modules/react-native/sdks/hermesc/osx-bin/hermesc \
  -O -emit-binary \
  -output-source-map \
  -out=$ANDROID_BUILD_ASSETS/index.android.bundle.hbc \
  $ANDROID_BUILD_ASSETS/index.android.bundle

rm -f $ANDROID_BUILD_ASSETS/index.android.bundle

mv $ANDROID_BUILD_ASSETS/index.android.bundle.hbc $ANDROID_BUILD_ASSETS/index.android.bundle
mv $ANDROID_BUILD_ASSETS/index.android.bundle.map $ANDROID_BUILD_ASSETS/index.android.bundle.packager.map

node \
  node_modules/react-native/scripts/compose-source-maps.js \
  $ANDROID_BUILD_ASSETS/index.android.bundle.packager.map \
  $ANDROID_BUILD_ASSETS/index.android.bundle.hbc.map \
  -o $ANDROID_BUILD_ASSETS/index.android.bundle.map

node \
  node_modules/@sentry/react-native/scripts/copy-debugid.js \
  $ANDROID_BUILD_ASSETS/index.android.bundle.packager.map $ANDROID_BUILD_ASSETS/index.android.bundle.map

rm -f $ANDROID_BUILD_ASSETS/index.android.bundle.packager.map

node_modules/@sentry/cli/bin/sentry-cli sourcemaps upload \
  --debug-id-reference \
  $ANDROID_BUILD_ASSETS/index.android.bundle $ANDROID_BUILD_ASSETS/index.android.bundle.map

###

cd android

buildMethod() {
    echo "START BUILDING $1"
    ./gradlew -q "$1"
}

buildMethod app:assembleRelease
mv app/build/outputs/apk/release/app-release.apk app/build/swiss-bitcoin-pay.apk

if [[ "$DEV" != "true" ]]
then
    buildMethod app:bundleRelease

    sed -i'' -e "s/def enableSeparateBuildPerCPUArchitecture = false/def enableSeparateBuildPerCPUArchitecture = true/" app/build.gradle 
    buildMethod app:assembleRelease
fi

cd ..