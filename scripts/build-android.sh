#!/bin/bash

cd $(dirname $0)
cd ..

source .env

npm remove react-native-vision-camera

npm run bundle:android

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