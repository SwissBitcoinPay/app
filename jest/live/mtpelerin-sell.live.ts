/**
 * "Sell" with the app's own code against Mt Pelerin's REAL dev/test environment
 * (`https://api-dev.smex.tech`): the login by signature with a key of its own, the profile, the
 * Lightning address as an account and its 1-sat invoice, a bank account, not twice, its holder and
 * address changed (`PATCH /accounts/{id}`, undocumented), an estimate, the orders'
 * list, and an order, which Mt Pelerin can create although the address is not proven yet: the app
 * checks it as it would before paying it (sale.ts), and pays nothing. Every answer goes through the
 * app's guards (guards.ts): an answer they refuse fails the test.
 *
 * Run by hand only: its name is no test's, so `npm run check` and the CI never run it, as tests
 * never reach the network.
 *
 *   npx jest --testMatch '<rootDir>/jest/live/mtpelerin-sell.live.ts'
 *
 * `MTP_LIVE_LOG=<file>` writes each request's method and path, and each answer's status and body,
 * tokens left out, to that file. The environment is shared and unprotected ("never put real
 * personal data in it"): what this test sends is fictitious. Each run logs in with a new key, so
 * a new profile. Nothing is paid. The requests go through `curl`: Jest's `fetch` is the tests' fake
 * (jest.setup.ts), and curl reads the machine's proxy settings.
 */
import { MTPELERIN_TEST_URL, MTPELERIN_WID } from "@/config/mtpelerin";
import { SellFlow, type SaleQuoteRead, type SellPayer } from "@/features/sell/flow";
import { bytesToBase64 } from "@/lib/base64";
import { createMtPelerinApi, type MtpTransport } from "@/lib/mtpelerin/api";
import { isMtpError } from "@/lib/mtpelerin/errors";
import { evmAddress, personalSign, type EvmSigner } from "@/lib/mtpelerin/evm-login";
import { httpTransport } from "@/lib/mtpelerin/http-transport";
import { periodStarts } from "@/lib/mtpelerin/limits";
import { isLightningSale, saleProgress, sellAssetOf } from "@/lib/mtpelerin/sale";
import { createMtpSession } from "@/lib/mtpelerin/session";
import { splitCheckpointOf, splitOid } from "@/lib/mtpelerin/split";
import { secureRandomBytes } from "@/lib/random";
import { secp256k1 } from "@noble/curves/secp256k1.js";

// Node's own modules, typed with what is used (the project has no Node types).
type ExecFile = (
  file: string,
  args: string[],
  options: { maxBuffer: number },
  callback: (error: Error | null, stdout: string, stderr: string) => void
) => void;
const { execFile } = jest.requireActual<{ execFile: ExecFile }>("child_process");
const { appendFileSync } = jest.requireActual<{
  appendFileSync(path: string, data: string): void;
}>("fs");

jest.setTimeout(240_000);

/** A fictitious Swiss IBAN of the bank `08781`, its check digits computed (ISO 13616). */
function fictitiousIban(serial: number): string {
  const bban = `08781${String(serial).padStart(12, "0")}`;
  let remainder = 0;
  for (const digit of `${bban}121700`) remainder = (remainder * 10 + Number(digit)) % 97;
  return `CH${String(98 - remainder).padStart(2, "0")}${bban}`;
}

/** The app's `fetch`, through curl: a JSON body as it is. */
async function curlFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const url = String(input);
  if (!url.startsWith(`${MTPELERIN_TEST_URL}/`)) throw new Error(`Not Mt Pelerin's dev: ${url}`);
  const args = ["-sS", "-m", "60", "-X", init.method ?? "GET", "-w", "\n%{http_code}"];
  for (const [name, value] of Object.entries((init.headers ?? {}) as Record<string, string>)) {
    args.push("-H", `${name}: ${value}`);
  }
  if (typeof init.body === "string") args.push("--data-binary", init.body);
  args.push(url);
  return new Promise((resolve, reject) => {
    execFile("curl", args, { maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => {
      if (error) return reject(new TypeError("Network request failed"));
      const at = stdout.lastIndexOf("\n");
      const status = Number(stdout.slice(at + 1));
      const text = stdout.slice(0, at);
      resolve(new Response(status === 204 || text === "" ? null : text, { status }));
    });
  });
}

/** The answers, tokens left out, to MTP_LIVE_LOG when set. */
function logged(transport: MtpTransport): MtpTransport {
  const file = process.env.MTP_LIVE_LOG;
  if (!file) return transport;
  return async (request) => {
    const response = await transport(request);
    const body = JSON.stringify(response.body, (key, value: unknown) =>
      /token/i.test(key) ? "<token>" : value
    );
    appendFileSync(
      file,
      `${request.method} ${request.path} ${JSON.stringify(request.query ?? {})}\n` +
        `  -> ${response.status} ${body}\n`
    );
    return response;
  };
}

/** A key of this run's: never one that holds anything. */
function runSigner(): EvmSigner {
  const key = secureRandomBytes(32);
  return {
    address: evmAddress(secp256k1.getPublicKey(key, true)),
    signDevice: (deviceId) => bytesToBase64(personalSign(key, deviceId))
  };
}

/** Never pays. */
const noPayer: SellPayer = {
  quote: async (invoice) => ({ amountSats: invoice.amountSats, feeSats: 0n }),
  covers: async () => true,
  balance: async () => 0n,
  paidSince: async () => new Map(),
  confirm: async () => false,
  pay: () => Promise.reject(new Error("Nothing is paid by the live test"))
};

it("goes through \"Sell\"'s calls on Mt Pelerin's dev/test environment", async () => {
  const transport = logged(httpTransport(MTPELERIN_TEST_URL, curlFetch));
  const api = createMtPelerinApi(transport);
  let refreshToken: string | null = null;
  const sessions = {
    load: async () => ({ refreshToken, sessionAt: 0, paidValidations: [] }),
    keep: async (token: string | null) => {
      refreshToken = token;
    },
    refused: async () => null,
    recordPaid: async () => undefined,
    settled: async () => undefined
  };
  const flow = new SellFlow({
    api,
    sessions,
    lightningAddress: `live${secureRandomBytes(4).join("")}@breez.tips`,
    appVersion: "3.0.0",
    language: "fr",
    network: "bc",
    payer: noPayer,
    // Nothing is paid here: no sale is recorded either.
    recordSale: () => Promise.reject(new Error("No sale is paid live")),
    referralCode: "",
    walletLogin: runSigner()
  });

  await flow.start();
  expect(flow.getState().view.name).toBe("connect");
  await flow.connect();
  expect(flow.getState().view.name).toBe("profile");
  await flow.saveProfile({ email: "sell.live@example.com", phone: "+41790000000" });
  // The 1-sat invoice asked for and checked (invoice.ts): the step shows what it costs.
  expect(flow.getState()).toMatchObject({ view: { name: "validation" }, failure: null });

  const asset = sellAssetOf(await api.config());
  expect(asset).toEqual({ network: "lightning_mainnet", currency: "sat" });

  // The same profile's session for the calls the flow makes only once ready.
  const session = createMtpSession(api, sessions, refreshToken);
  const added = await flow.addBankAccount({
    holder: { kind: "company", name: "Example Studio" },
    // Each run its own: one IBAN is one profile's ("Duplicate account").
    iban: fictitiousIban(new DataView(secureRandomBytes(4).buffer).getUint32(0)),
    street: "1 Example Street",
    postcode: "1000",
    city: "Lausanne",
    country: "CH",
    currency: "CHF"
  });
  expect(added).toBe(true);
  // Not twice (dev/test takes the same IBAN again on one profile): refused by the app.
  const [first] = flow.bankAccounts() ?? [];
  expect(
    await flow.addBankAccount({
      holder: { kind: "company", name: "Example Studio" },
      iban: first!.iban,
      street: "2 New Street",
      postcode: "1000",
      city: "Lausanne",
      country: "CH",
      currency: "CHF"
    })
  ).toBe(false);
  expect(flow.getState().failure).toMatchObject({ kind: "accountKnown" });
  // Its holder and address changed (`PATCH /accounts/{id}`, undocumented), read again.
  const changed = await flow.updateBankAccount(first!, {
    holder: { kind: "person", firstname: "Dave", lastname: "Example" },
    street: "2 New Street",
    postcode: "1003",
    city: "Lausanne",
    country: "CH"
  });
  expect(changed).toBe(true);
  const banks = flow.bankAccounts() ?? [];
  expect(banks).toHaveLength(1);
  expect(banks[0]).toMatchObject({
    id: first!.id,
    iban: first!.iban,
    currency: "CHF",
    label: "Dave Example",
    owner: {
      name: { kind: "person", firstname: "Dave", lastname: "Example" },
      street: "2 New Street",
      postcode: "1003"
    }
  });

  const estimate = await flow.estimate(10_000n, "CHF");
  expect(estimate.destCurrency).toBe("CHF");

  const orders = await flow.orders(periodStarts(new Date()).year * 1000);
  expect(orders).toEqual([]);

  // The address not proven: Mt Pelerin refuses the order, or creates it, and then the
  // app checks it whole (its account, its estimate's sats, its invoice of exactly 10 000 sats).
  const quoted = await flow.quoteSale(10_000n, banks[0]!).catch((error: unknown) => error);
  const outcome = isMtpError(quoted)
    ? quoted.code
    : (quoted as SaleQuoteRead).ok
      ? (quoted as Extract<SaleQuoteRead, { ok: true }>).quote.payment.invoice.amountSats
      : (quoted as Extract<SaleQuoteRead, { ok: false }>).issue;
  expect([10_000n, "refused"]).toContain(outcome);

  // The order made, read back as "Your sales" and a sale's page read it: its row in the year's
  // list and by its id, its progress without funds (nothing was paid), and the integration's token
  // it carries (`wid`, which Mt Pelerin gives back under `options`).
  if (!isMtpError(quoted) && (quoted as SaleQuoteRead).ok) {
    const { order } = (quoted as Extract<SaleQuoteRead, { ok: true }>).quote;
    const year = periodStarts(new Date()).year * 1000;
    const listed = await flow.orders(year);
    expect(listed?.map(({ id }) => id)).toContain(order.id);
    const row = await flow.order(order.id, year);
    expect(row).toMatchObject({ id: order.id, destCurrency: "CHF" });
    expect(isLightningSale(row!, asset!)).toBe(true);
    const status = await flow.transactionStatus(order.id);
    expect(status).toMatchObject({ orderId: order.id, groupId: null });
    const progress = saleProgress(status, {
      expiresAt: order.expiresAt,
      nowSeconds: Math.floor(Date.now() / 1000)
    });
    expect(progress.outcome).toBe("awaitingPayment");
    const raw = await session.authed((token) =>
      transport({ method: "GET", path: "/orders/status", token, query: { orderId: order.id } })
    );
    const orders = (raw.body as { orders?: { options?: { wid?: unknown } }[] }).orders ?? [];
    expect(orders[0]?.options?.wid).toBe(MTPELERIN_WID);
  }

  // The split's sale (src/lib/mtpelerin/split.ts): a deferred sell whose reference carries
  // its checkpoint. Mt Pelerin's list gives that reference back, and the payment hash of its
  // invoice: how the sale is found again on every device. Nothing held for the bank account, since
  // nothing is paid, and a new profile is not identified.
  const checkpoint = Math.floor(Date.now() / 1000) - 60;
  const split = await flow
    .quoteSale(5_000n, banks[0]!, { oid: splitOid(checkpoint), deferred: true })
    .catch((error: unknown) => error);
  if (!isMtpError(split) && (split as SaleQuoteRead).ok) {
    const { quote } = split as Extract<SaleQuoteRead, { ok: true }>;
    expect(quote.payment.invoice.amountSats).toBe(5_000n);
    const row = await flow.order(quote.order.id, periodStarts(new Date()).year * 1000);
    expect(row).toMatchObject({
      type: "spot",
      oid: splitOid(checkpoint),
      paymentHash: quote.payment.invoice.paymentHash,
      transactionStatus: null
    });
    expect(splitCheckpointOf(row!.oid)).toBe(checkpoint);
  } else {
    expect(isMtpError(split) ? split.code : (split as { issue: string }).issue).toBe("refused");
  }
  await expect(flow.balances(banks[0]!)).resolves.toEqual([]);
  expect(flow.profile()?.person.kycLevel).toBe(0);

  await session.logout();
});
