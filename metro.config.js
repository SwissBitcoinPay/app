const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const {
  withSentryConfig
} = require("@sentry/react-native/metro");

const defaultConfig = getDefaultConfig(__dirname);

const config = {
  resolver: {
    assetExts: [...defaultConfig.resolver.assetExts, "lottie"],
    extraNodeModules: require("node-libs-react-native")
  },
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true
      }
    })
  }
};

module.exports = withSentryConfig(mergeConfig(defaultConfig, config));