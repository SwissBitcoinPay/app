/**
 * `jest.fn` in the browser, for the Jest fake of the Breez SDK's web build (jest/breez-sdk-web.ts),
 * which the store screenshots' build runs as its wallet (./web-sdk.ts). Only what that fake uses:
 * a function that calls its implementation, records its calls, and whose implementation can be
 * replaced (`mockImplementation`), forgotten (`mockReset`) or its calls dropped (`mockClear`).
 * Imported for its side effect, before the fake: it defines the global `jest` the fake reads.
 */

type Implementation = (...args: unknown[]) => unknown;

type FakeMock = Implementation & {
  mock: { calls: unknown[][] };
  mockImplementation(implementation: Implementation): FakeMock;
  mockReset(): FakeMock;
  mockClear(): FakeMock;
};

function fn(implementation?: Implementation): FakeMock {
  let current = implementation;
  const mock = function (this: unknown, ...args: unknown[]) {
    mock.mock.calls.push(args);
    return current?.apply(this, args);
  } as FakeMock;
  mock.mock = { calls: [] };
  mock.mockImplementation = (next) => {
    current = next;
    return mock;
  };
  mock.mockReset = () => {
    current = undefined;
    mock.mock.calls = [];
    return mock;
  };
  mock.mockClear = () => {
    mock.mock.calls = [];
    return mock;
  };
  return mock;
}

(globalThis as unknown as { jest: { fn: typeof fn } }).jest = { fn };
