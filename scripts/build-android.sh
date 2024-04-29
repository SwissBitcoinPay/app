#!/bin/bash

cd $(dirname $0)
cd ..

source .env

npm remove react-native-vision-camera

npx react-native bundle --minify --platform android --dev false --entry-file index.js --bundle-output android/app/src/main/assets/index.android.bundle --assets-dest android/app/src/main/res/merged/release/

cd android

buildMethod() {
    echo "START BUILDING $1"
    ./gradlew -q "$1"
}

buildMethod app:assembleRelease
mv app/build/outputs/apk/release/app-release.apk app/build/swiss-bitcoin-pay.apk

if [[ "$DEV" != "true" ]]
then
    sed -i'' -e "s/def enableSeparateBuildPerCPUArchitecture = false/def enableSeparateBuildPerCPUArchitecture = true/" app/build.gradle 
    buildMethod app:assembleRelease

    sed -i'' -e 's/<queries>/<uses-permission android:name="com.google.android.gms.permission.AD_ID" tools:node="remove" \/>\n<queries>/' app/src/main/AndroidManifest.xml
    buildMethod app:bundleRelease
fi

cd ..