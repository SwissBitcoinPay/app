import { describe, expect, it, jest } from "@jest/globals";

// Order in which index.js loads the modules mocked below.
const mockLoadOrder: string[] = [];

jest.mock("react-native-get-random-values", () => {
  mockLoadOrder.push("react-native-get-random-values");
  return {};
});

jest.mock("@bacons/text-decoder/install", () => {
  mockLoadOrder.push("TextDecoder polyfill");
  return {};
});

jest.mock("node-libs-react-native/globals.js", () => {
  mockLoadOrder.push("node-libs-react-native globals");
  return {};
});

jest.mock("react-native", () => ({
  AppRegistry: { registerComponent: jest.fn() },
  LogBox: { ignoreAllLogs: jest.fn(), ignoreLogs: jest.fn() }
}));

jest.mock("./src/Root", () => {
  mockLoadOrder.push("app");
  return { __esModule: true, default: () => null };
});

describe("native entry point", () => {
  // Hermes has no TextDecoder, and bitcoinjs-lib's dependencies call
  // `new TextDecoder()` as soon as they load: without the polyfill, opening
  // the Payouts screen crashed the app with "Property 'TextDecoder' doesn't
  // exist".
  it("installs the TextDecoder polyfill before loading the app", () => {
    // Required here rather than imported: the mock factories above run when
    // index.js loads, and they need `mockLoadOrder` to be initialized. Loaded
    // in an isolated registry so that every test records a fresh load order.
    mockLoadOrder.length = 0;
    jest.isolateModules(() => {
      require("./index");
    });

    expect(mockLoadOrder).toContain("TextDecoder polyfill");
    expect(mockLoadOrder).toContain("app");
    expect(mockLoadOrder.indexOf("TextDecoder polyfill")).toBeLessThan(
      mockLoadOrder.indexOf("app")
    );
  });
});
