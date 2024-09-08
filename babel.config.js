module.exports = {
  presets: ["module:@react-native/babel-preset"],
  plugins: [
    [
      "babel-plugin-module-resolver",
      {
        extensions: [".native.ts", ".native.js", ".tsx", ".ts", ".jsx", ".js"],
        root: ["."],
        alias: {
          "@components": "./src/components",
          "@screens": "./src/screens",
          "@config": "./src/config",
          "@assets": "./src/assets",
          "@hooks": "./src/hooks",
          "@utils": "./src/utils",
          "@types": "./src/types"
        }
      }
    ],
    [
      "module:react-native-dotenv",
      {
        safe: true,
        allowlist: ["CM_COMMIT", "COMMIT_REF", "SENTRY_DSN"]
      }
    ],
    "@babel/plugin-transform-export-namespace-from"
  ]
};
