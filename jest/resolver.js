// How Jest finds a module: Reanimated's resolver first, then the jest-expo preset's own (React
// Native's, which lets `react-native/…` subpaths be mocked).
//
// Reanimated's modules that differ under Jest come in `.native` and web variants. Jest, resolving
// for a native platform, would take the `.native` ones, and importing Reanimated would throw
// ("`setCSSEventHandler` is not available in JSReanimated"). Its resolver (4.7.0,
// software-mansion/react-native-reanimated#10377, docs "Testing with Jest") takes the web variant
// of those modules, and of react-native-worklets's; everything else resolves as usual.
const { resolver: presetResolverPath } = require("jest-expo/jest-preset");
const reanimatedResolver = require("react-native-reanimated/jest/resolver");

const presetResolver = require(presetResolverPath);

/** @type {import('jest-resolve').SyncResolver} */
module.exports = (request, options) =>
  reanimatedResolver(request, {
    ...options,
    // Where Reanimated's resolver would end with Jest's own, the preset's resolver goes first.
    defaultResolver: (path, resolverOptions) =>
      presetResolver(path, { ...resolverOptions, defaultResolver: options.defaultResolver })
  });
