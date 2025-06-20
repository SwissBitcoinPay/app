# Generates a release APK by running:
#
# docker build . -o sbp-output
#
# If command fails (because of containerized environment), export the app as Tar archive :
# docker build . --output type=tar,dest=sbp-output.tar
#

ARG SBP_CHECKOUT_UPLOAD_STORE_FILE=sbp.keystore
ARG SBP_CHECKOUT_UPLOAD_KEY_ALIAS=sbp
ARG SBP_CHECKOUT_UPLOAD_STORE_PASSWORD=unsecure_storepass
ARG SBP_CHECKOUT_UPLOAD_KEY_PASSWORD=unsecure_keypass

FROM joostdecock/keytool AS keystore-generator

ARG SBP_CHECKOUT_UPLOAD_STORE_FILE
ARG SBP_CHECKOUT_UPLOAD_KEY_ALIAS
ARG SBP_CHECKOUT_UPLOAD_STORE_PASSWORD
ARG SBP_CHECKOUT_UPLOAD_KEY_PASSWORD

ENV SBP_CHECKOUT_UPLOAD_STORE_FILE=$SBP_CHECKOUT_UPLOAD_STORE_FILE
ENV SBP_CHECKOUT_UPLOAD_KEY_ALIAS=$SBP_CHECKOUT_UPLOAD_KEY_ALIAS
ENV SBP_CHECKOUT_UPLOAD_STORE_PASSWORD=$SBP_CHECKOUT_UPLOAD_STORE_PASSWORD
ENV SBP_CHECKOUT_UPLOAD_KEY_PASSWORD=$SBP_CHECKOUT_UPLOAD_KEY_PASSWORD

RUN keytool -genkeypair -v -keystore $SBP_CHECKOUT_UPLOAD_STORE_FILE -storepass $SBP_CHECKOUT_UPLOAD_STORE_PASSWORD -alias $SBP_CHECKOUT_UPLOAD_KEY_ALIAS -keypass $SBP_CHECKOUT_UPLOAD_KEY_PASSWORD -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=, OU=, O=, L=, ST=, C="

FROM node:18.18-alpine AS builder

ARG SBP_CHECKOUT_UPLOAD_STORE_FILE
ARG SBP_CHECKOUT_UPLOAD_KEY_ALIAS
ARG SBP_CHECKOUT_UPLOAD_STORE_PASSWORD
ARG SBP_CHECKOUT_UPLOAD_KEY_PASSWORD

ENV SBP_CHECKOUT_UPLOAD_STORE_FILE=$SBP_CHECKOUT_UPLOAD_STORE_FILE
ENV SBP_CHECKOUT_UPLOAD_KEY_ALIAS=$SBP_CHECKOUT_UPLOAD_KEY_ALIAS
ENV SBP_CHECKOUT_UPLOAD_STORE_PASSWORD=$SBP_CHECKOUT_UPLOAD_STORE_PASSWORD
ENV SBP_CHECKOUT_UPLOAD_KEY_PASSWORD=$SBP_CHECKOUT_UPLOAD_KEY_PASSWORD

ARG SDK_VERSION=commandlinetools-linux-11076708_latest.zip
ARG ANDROID_BUILD_VERSION=34
ARG ANDROID_TOOLS_VERSION=34.0.0
ARG NDK_VERSION=26.1.10909125

ENV ANDROID_HOME=/opt/android
ENV ANDROID_SDK_ROOT=${ANDROID_HOME}
ENV ANDROID_NDK_HOME=${ANDROID_HOME}/ndk/$NDK_VERSION

ENV PATH=${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/emulator:${ANDROID_HOME}/platform-tools:${ANDROID_HOME}/tools:${ANDROID_HOME}/tools/bin:${PATH}

WORKDIR /app

COPY . .

COPY --from=keystore-generator $SBP_CHECKOUT_UPLOAD_STORE_FILE ./android/app

RUN apk update \
    && apk add --no-cache \
    curl \
    libc6-compat \
    gcompat \
    fontconfig \
    ttf-dejavu \
    freetype \
    file \
    gcc \
    git \
    g++ \
    gnupg \
    libstdc++ \
    mesa-gl \
    make \
    openssh-client \
    patch \
    python3 \
    python3-dev \
    rsync \
    ruby \
    ruby-dev \
    tzdata \
    unzip \
    sudo \
    ninja \
    zip \
    ccache \
    icu-dev \
    jq \
    shellcheck \
    build-base \
    openjdk17 \
    && curl -sS https://dl.google.com/android/repository/$SDK_VERSION -o /tmp/sdk.zip \
    && mkdir -p ${ANDROID_HOME}/cmdline-tools \
    && unzip -q -d ${ANDROID_HOME}/cmdline-tools /tmp/sdk.zip \
    && mv ${ANDROID_HOME}/cmdline-tools/cmdline-tools ${ANDROID_HOME}/cmdline-tools/latest \
    && rm /tmp/sdk.zip \
    && yes | sdkmanager --licenses \
    && yes | sdkmanager "platform-tools" \
        "platforms;android-$ANDROID_BUILD_VERSION" \
        "build-tools;$ANDROID_TOOLS_VERSION" \
        "ndk;$NDK_VERSION" \
    && chmod 777 -R /opt/android \
    && npm install \
    && npm remove react-native-vision-camera \
    && npm run bundle:android \
    && cd android && ./gradlew -q app:assembleRelease \
    && npm cache clear --force \
    && rm -rf ${ANDROID_HOME}

FROM scratch

COPY --from=builder /app/android/app/build/outputs/apk/release/app-release.apk .
