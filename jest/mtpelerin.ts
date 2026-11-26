/**
 * Mt Pelerin's API under Jest, in place of src/lib/mtpelerin/transport.ts (jest.setup.ts): an API
 * in memory (jest/mtpelerin-fake/server.ts) for each of the app's Mt Pelerin, started afresh before
 * each test (jest.after-env.ts) without any profile, and handed to the test to seed it, drive what
 * Mt Pelerin does on its side and read the requests it got: `mtPelerin()` the production app's
 * (its login by SMS), `testMtPelerin()` the staging app's dev/test environment (its login by
 * signature). Tests never reach Mt Pelerin.
 */
import type { MtpTransport } from "../src/lib/mtpelerin/api";
import { appMtpEnvironment, type MtpEnvironment } from "../src/lib/mtpelerin/environment";
import type * as Scenarios from "./mtpelerin-fake/scenarios";
import type * as Server from "./mtpelerin-fake/server";

const { FakeMtPelerin } = jest.requireActual<typeof Server>("./mtpelerin-fake/server");
const { scenarioServer } = jest.requireActual<typeof Scenarios>("./mtpelerin-fake/scenarios");

let server: Server.FakeMtPelerin = new FakeMtPelerin();
let testServer: Server.FakeMtPelerin = new FakeMtPelerin();

/** The production app's Mt Pelerin. */
export function mtPelerin(): Server.FakeMtPelerin {
  return server;
}

/** The staging app's: Mt Pelerin's dev/test environment. */
export function testMtPelerin(): Server.FakeMtPelerin {
  return testServer;
}

/** The production app's Mt Pelerin as `scenario` sets it up for `lightningAddress`'s merchant. */
export function startScenario(
  scenario: Scenarios.Scenario,
  lightningAddress: string
): Server.FakeMtPelerin {
  server = scenarioServer(scenario, lightningAddress);
  return server;
}

/** Mt Pelerin without any profile (jest.after-env.ts). */
export function resetMtPelerin(): void {
  server = new FakeMtPelerin();
  testServer = new FakeMtPelerin();
}

// The API of src/lib/mtpelerin/transport.ts.

export function mtPelerinTransport(
  environment: MtpEnvironment = appMtpEnvironment()
): MtpTransport {
  return (request) => (environment === "production" ? server : testServer).handle(request);
}
