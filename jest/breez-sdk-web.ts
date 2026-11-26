/**
 * Fake of the web build of the Breez SDK for Jest (@breeztech/breez-sdk-spark/web and its
 * passkey-prf-provider module), handed to the *.web.ts files through a mock of
 * src/lib/breez/web-sdk.ts. Only what the app uses, with the shapes of the 0.28.4 typings.
 *
 * `PasskeyClient` mimics the web bindings (crates/breez-sdk/wasm): they call the provider as is,
 * and hand its errors back as a plain `Error` whose message is the Rust one. The browser provider
 * delegates to `platform`, which tests drive; by default the browser evaluates PRF at creation,
 * and the PRF output of a salt depends on the salt only.
 */

import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

/** Salt of the passkey identity (crates/breez-sdk/core/src/passkey/derivation.rs). */
export const ACCOUNT_MASTER_SALT = "4e594f415354525453414f594e";

export class PasskeyAlreadyExistsError extends Error {
  name = "PasskeyAlreadyExistsError";
}
export class PasskeyTimedOutError extends Error {
  name = "PasskeyTimedOutError";
}
export class PasskeyCredentialNotFoundError extends Error {
  name = "PasskeyCredentialNotFoundError";
}
export class PasskeyUserCancelledError extends Error {
  name = "PasskeyUserCancelledError";
}

/** Fake PRF output: 32 bytes that only depend on the salt. */
export function prfOutput(salt: string): Uint8Array {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < salt.length; i++) {
    bytes[i % 32] = (bytes[i % 32] * 31 + salt.charCodeAt(i)) % 256;
  }
  return bytes;
}

export const CREDENTIAL_ID = new Uint8Array([1, 2, 3, 4]);

type DeriveOptions = { allowCredentials?: Uint8Array[] };

const defaults = {
  isSupported: async () => true,
  createPasskey: async (
    excludeCredentials: Uint8Array[],
    salts: string[]
  ): Promise<{
    credential: {
      credentialId: Uint8Array;
      userId: Uint8Array;
      aaguid: null;
      backupEligible: null;
    };
    seeds: Uint8Array[] | null;
  }> => ({
    credential: {
      credentialId: CREDENTIAL_ID,
      userId: new Uint8Array([9, 9]),
      aaguid: null,
      backupEligible: null
    },
    seeds: salts.map(prfOutput)
  }),
  deriveSeeds: async (
    salts: string[],
    options?: DeriveOptions
  ): Promise<{ seeds: Uint8Array[]; credentialId: Uint8Array | null }> => ({
    seeds: salts.map(prfOutput),
    credentialId: CREDENTIAL_ID
  })
};

/** WebAuthn in the browser, as tests drive it. */
export const platform = {
  isSupported: jest.fn(defaults.isSupported),
  createPasskey: jest.fn(defaults.createPasskey),
  deriveSeeds: jest.fn(defaults.deriveSeeds)
};

/** Back to the defaults, dropping calls and queued `…Once` behaviours. */
export function resetPlatform(): void {
  for (const [name, implementation] of Object.entries(defaults)) {
    platform[name as keyof typeof platform].mockReset();
    (platform[name as keyof typeof platform] as jest.Mock).mockImplementation(implementation);
  }
  PasskeyProvider.mockClear();
  PasskeyClient.instances = [];
  connect.mockClear();
}

/** The browser `PasskeyProvider` of the passkey-prf-provider module. */
export const PasskeyProvider = jest.fn(function (
  this: Record<string, unknown>,
  options: Record<string, unknown>
) {
  this.options = options;
  this.isSupported = () => platform.isSupported();
  this.supportsImmediateMediation = async () => false;
  this.createPasskey = (excludeCredentials: Uint8Array[] = [], salts: string[] = []) =>
    platform.createPasskey(excludeCredentials, salts);
  this.deriveSeeds = (salts: string[], options?: DeriveOptions) =>
    platform.deriveSeeds(salts, options);
  // Only the parent-domain rule, as in 0.28.4: the web app is on another host than the RP ID.
  this.checkDomainAssociation = async () => ({
    kind: "NotAssociated",
    source: "WebAuthn rpId scope check",
    reason: "not a registrable suffix"
  });
});

/** Messages of the Rust `PrfProviderError`s the bindings map from the provider's error classes. */
function rustMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error);
  switch (name) {
    case "PasskeyUserCancelledError":
      return "PRF error: User cancelled authentication";
    case "PasskeyTimedOutError":
      return "PRF error: Authenticator timed out";
    case "PasskeyCredentialNotFoundError":
      return `PRF error: Credential not found: ${message}`;
    case "PasskeyAlreadyExistsError":
      return `PRF error: Credential already exists: ${message}`;
    default:
      return `PRF error: Passkey error: ${message}`;
  }
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

type HostPrfProvider = {
  deriveSeeds: (
    salts: string[],
    options?: DeriveOptions
  ) => Promise<{ seeds: Uint8Array[]; credentialId?: Uint8Array | null }>;
  isSupported: () => Promise<boolean>;
};

export class PasskeyClient {
  static instances: PasskeyClient[] = [];

  readonly free = jest.fn();

  constructor(
    readonly provider: HostPrfProvider,
    readonly breezApiKey?: string | null,
    readonly config?: unknown
  ) {
    PasskeyClient.instances.push(this);
  }

  /** The bindings never forward the domain check to the provider: always "skipped". */
  async checkAvailability() {
    const supported = await this.provider.isSupported().catch((error: unknown) => {
      throw new Error(rustMessage(error));
    });
    if (!supported) return { type: "prfUnsupported" };
    return { type: "skipped", reason: "Provider does not verify domain association" };
  }

  /** The fast path (with a label): one derive of the identity and label salts, no label store. */
  async signIn(request: { label?: string; allowCredentials?: Uint8Array[] }) {
    if (request.label === undefined) throw new Error("The fake only models the fast path");
    const salts = [ACCOUNT_MASTER_SALT, request.label];
    const options: DeriveOptions = request.allowCredentials?.length
      ? { allowCredentials: request.allowCredentials }
      : {};
    const output = await this.provider.deriveSeeds(salts, options).catch((error: unknown) => {
      throw new Error(rustMessage(error));
    });
    if (output.seeds.length !== salts.length) throw new Error("PRF error: wrong number of outputs");
    return {
      // Stands for the mnemonic the SDK derives from the label's PRF output.
      wallet: {
        seed: { type: "mnemonic", mnemonic: `mnemonic of ${hex(output.seeds[1])}` },
        label: request.label
      },
      labels: [],
      credential: output.credentialId ? { credentialId: output.credentialId } : undefined
    };
  }
}

export const defaultConfig = (network: string) => ({
  network,
  apiKey: undefined,
  syncIntervalSecs: 60
});

/** Lightning addresses registered on the fake LNURL server, by username. */
export const lightningAddresses = new Map<string, string>();

/** As in jest/breez-sdk.ts: deposit addresses handed out, the taproot addresses of jest/bitcoin.ts. */
export const depositAddresses = { handedOut: 0 };

function depositAddress(fill: number): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- the fake is required by tests
  return (require("./bitcoin") as typeof import("./bitcoin")).taprootAddress(fill);
}

/** A chain service of the web SDK (`newRestChainService`), every method a mock. */
export function fakeChainService() {
  return {
    getAddressUtxos: jest.fn(async (_address: string) => [
      { txid: "aa".repeat(32), vout: 0, value: 1000 }
    ]),
    getAddressTxos: jest.fn(async (_address: string) => [] as unknown[]),
    getTransactionStatus: jest.fn(async (_txid: string) => ({ confirmed: false })),
    tipHeight: jest.fn(async () => 900_000),
    getTransactionHex: jest.fn(async (_txid: string) => "00"),
    getOutspend: jest.fn(async (_txid: string, _vout: number) => ({ type: "unspent" })),
    broadcastTransaction: jest.fn(async (_tx: string) => undefined),
    recommendedFees: jest.fn(async () => ({ fastestFee: 2 }))
  };
}

export const newRestChainService = jest.fn(
  async (_url: string, _network: string, _apiType: string, _credentials?: unknown) =>
    fakeChainService()
);

/**
 * The web SDK's builder: its methods take the builder and give it back (wasm-bindgen moves it);
 * `build` goes through the `connect` mock below, as in jest/breez-sdk.ts.
 */
export class SdkBuilder {
  static last: SdkBuilder | null = null;
  storageDir: string | undefined;
  chainService: unknown;
  private constructor(
    readonly config: unknown,
    readonly seed: unknown
  ) {}
  static new(config: unknown, seed: unknown): SdkBuilder {
    SdkBuilder.last = new SdkBuilder(config, seed);
    return SdkBuilder.last;
  }
  async withDefaultStorage(storageDir: string): Promise<SdkBuilder> {
    this.storageDir = storageDir;
    return this;
  }
  withChainService(chainService: unknown): SdkBuilder {
    this.chainService = chainService;
    return this;
  }
  build() {
    return connect({ config: this.config, seed: this.seed, storageDir: this.storageDir });
  }
}

/**
 * An SDK object as the web bindings give it (wasm-bindgen 0.2.120): each async call borrows it
 * until it settles; `free()` throws while one does (the real object is then never freed); calls on
 * a freed object throw (the real ones never settle, and throw outside the call). A test replacing
 * a method's implementation wraps it in `call`, so that it borrows the object too.
 */
function sdkObject(methods: Record<string, (...args: never[]) => Promise<unknown>>) {
  let borrows = 0;
  let freed = false;
  const call =
    <T>(implementation: (...args: never[]) => Promise<T>) =>
    (...args: never[]): Promise<T> => {
      if (freed) throw new Error("null pointer passed to rust");
      borrows++;
      return implementation(...args).finally(() => {
        borrows--;
      });
    };
  const object: Record<string, unknown> = {
    call,
    free: jest.fn(() => {
      if (freed) throw new Error("null pointer passed to rust");
      if (borrows > 0) {
        throw new Error("attempted to take ownership of Rust value while it was borrowed");
      }
      freed = true;
    })
  };
  for (const [name, method] of Object.entries(methods)) object[name] = jest.fn(call(method));
  return object;
}

/** The identity of the account's wallet in this fake (`getInfo`), whatever its seed. */
export const FAKE_WEB_IDENTITY = "02ab";

/**
 * The account's identity in use: FAKE_WEB_IDENTITY, unless `setAccountIdentity` set another one
 * (the store screenshots' wallet, scripts/store-screenshots/web-sdk.ts: the point of sale's
 * on-chain addresses are kept for a wallet whose identity is a full public key). Back to
 * FAKE_WEB_IDENTITY at `resetFakeWallet()`.
 */
let accountIdentity = FAKE_WEB_IDENTITY;

export function setAccountIdentity(identity: string): void {
  accountIdentity = identity;
}

/** As in jest/breez-sdk.ts: the identity a wallet gets from its words (a card's). */
export function fakeIdentityOf(mnemonic: string): string {
  return `02${bytesToHex(sha256(utf8ToBytes(mnemonic)))}`;
}

/** As in jest/breez-sdk.ts: the Spark address of the fake wallet of `identity`. */
export function fakeSparkAddress(identity: string): string {
  return `spark1${identity}`;
}

/** As in jest/breez-sdk.ts, on the web build's shapes (`balanceSats` a `number`). */
export type FakeCardWallet = {
  balanceSats: number;
  payments: Record<string, unknown>[];
  unclaimedDeposits: Record<string, unknown>[];
  identity: string | null;
  username: string | null;
  invoices: string[];
  invoiceExpirySecs: number | null;
  incoming: number[];
  recovery: FakeRecovery;
};

/**
 * As in jest/breez-sdk.ts, on the web build's shapes (sats as numbers): a leaf of a fake wallet
 * that left its balance, and the leaves whose recovery the SDK saw in a block.
 */
export type FakeRecoveryLeaf = {
  leafId: string;
  valueSats: number;
  method: "cooperative" | "unilateral";
  takenFeeSats: number;
  stage?: "timelock" | "refund" | "sweep";
  needsFunding?: boolean;
  feeLadder?: boolean;
  operatorsFail?: boolean;
};
export type FakeRecovery = { leaves: FakeRecoveryLeaf[]; recovered: Set<string> };

function emptyRecovery(): FakeRecovery {
  return { leaves: [], recovered: new Set() };
}

/** As in jest/breez-sdk.ts: the network's fee rates (`recommendedFees`), numbers. */
export const fakeChainFees: { hourFee: number; ratesError: Error | null } = {
  hourFee: 2,
  ratesError: null
};

/** As in jest/breez-sdk.ts. */
export const FAKE_RECOVERY_VBYTES = { cooperative: 111, refund: 120, sweep: 100 } as const;

/** As in jest/breez-sdk.ts: every recovery built, its wallet's state and response. */
export const fakeRecoveryBuilds: { state: object; response: Record<string, unknown> }[] = [];

function recoverableSats(recovery: FakeRecovery): number {
  return recovery.leaves
    .filter(({ leafId }) => !recovery.recovered.has(leafId))
    .reduce((sum, { valueSats }) => sum + valueSats, 0);
}

function fakeLeafFeeSats(leaf: FakeRecoveryLeaf, rate: number): number {
  if (leaf.method === "cooperative")
    return leaf.takenFeeSats + rate * FAKE_RECOVERY_VBYTES.cooperative;
  return leaf.stage === "sweep"
    ? leaf.takenFeeSats
    : leaf.takenFeeSats + rate * FAKE_RECOVERY_VBYTES.refund;
}

function fakeRecoveryTxid(what: string): string {
  return bytesToHex(sha256(utf8ToBytes(what)));
}

function fakeRecoveryTxHex(txid: string): string {
  return `0200000001${txid}${txid}00000000`;
}

function fakeRecoveryTotals(leaves: FakeRecoveryLeaf[], rate: number) {
  const cooperative = leaves.filter(({ method }) => method === "cooperative");
  const unilateral = leaves.filter(({ method }) => method === "unilateral");
  const sum = (list: FakeRecoveryLeaf[]) =>
    list.reduce((total, leaf) => total + fakeLeafFeeSats(leaf, rate), 0);
  const cooperativeFeeSats = sum(cooperative);
  const refundFeeSats = sum(unilateral);
  const sweepFeeSats = unilateral.length > 0 ? rate * FAKE_RECOVERY_VBYTES.sweep : 0;
  const cpfpFeeSats = unilateral.some(({ needsFunding }) => needsFunding) ? rate * 200 : 0;
  return {
    recoverableValueSats: leaves.reduce((total, { valueSats }) => total + valueSats, 0),
    totalFeeSats: cooperativeFeeSats + refundFeeSats + sweepFeeSats + cpfpFeeSats,
    cooperativeFeeSats,
    cpfpFeeSats,
    fanoutFeeSats: 0,
    refundFeeSats,
    sweepFeeSats
  };
}

function fakeRecoveryLeafRecord(leaf: FakeRecoveryLeaf) {
  return { leafId: leaf.leafId, valueSats: leaf.valueSats, method: leaf.method };
}

/** As in jest/breez-sdk.ts (`prepareRecoverFunds`), on the web build's shapes. */
function prepareFakeRecovery(
  recovery: FakeRecovery,
  request: {
    feeRateSatPerVbyte: number;
    fundingKind?: unknown;
    destination: string;
    selection: { type: string; leafIds?: string[] };
  }
) {
  const rate = request.feeRateSatPerVbyte;
  const open = recovery.leaves.filter(({ leafId }) => !recovery.recovered.has(leafId));
  let leaves: FakeRecoveryLeaf[];
  const skipped: { leafId: string; valueSats: number; reason: { type: string } }[] = [];
  if (request.selection.type === "specific") {
    const named = new Set(request.selection.leafIds ?? []);
    leaves = open.filter(({ leafId }) => named.has(leafId));
  } else {
    leaves = [];
    for (const leaf of open) {
      if (leaf.valueSats > fakeLeafFeeSats(leaf, rate)) leaves.push(leaf);
      else skipped.push({ ...leaf, reason: { type: "feeExceedsValue" } });
    }
  }
  const needsFunding = leaves.some(
    ({ method, needsFunding: funded }) => method === "unilateral" && funded
  );
  if (needsFunding && request.fundingKind === undefined) {
    throw new Error(
      "A funding kind is needed: a transaction of a unilateral exit in the selection has a " +
        "CPFP child"
    );
  }
  return {
    leaves: leaves.map(fakeRecoveryLeafRecord),
    skipped: skipped.map(({ leafId, valueSats, reason }) => ({ leafId, valueSats, reason })),
    ...fakeRecoveryTotals(leaves, rate),
    funding: needsFunding ? { singleUtxoSats: 5000, perBranch: [] } : undefined,
    feeRateSatPerVbyte: rate,
    destination: request.destination,
    exitChainState: { nodes: [], refunds: [] }
  };
}

/** As in jest/breez-sdk.ts (`recoverFunds`), on the web build's shapes. */
function buildFakeRecovery(recovery: FakeRecovery, prepared: Record<string, unknown>) {
  if (prepared.funding !== undefined) throw new Error("InsufficientCpfpFunds: no funding given");
  const rate = prepared.feeRateSatPerVbyte as number;
  const destination = prepared.destination as string;
  const ids = (prepared.leaves as { leafId: string }[]).map(({ leafId }) => leafId);
  const quoted = recovery.leaves.filter(({ leafId }) => ids.includes(leafId));
  const failed = quoted
    .filter(({ method, operatorsFail }) => method === "cooperative" && operatorsFail)
    .map(({ leafId }) => ({
      leafId,
      outputTxid: fakeRecoveryTxid(`exit/${leafId}`),
      outputVout: 0,
      error: { type: "operatorsUnavailable", message: "Operators unreachable" }
    }));
  const leaves = quoted.filter(({ leafId }) => !failed.some((entry) => entry.leafId === leafId));
  const transactions: Record<string, unknown>[] = [];
  for (const leaf of leaves.filter(({ method }) => method === "cooperative")) {
    const txid = fakeRecoveryTxid(`cooperative/${leaf.leafId}/${destination}/${rate}`);
    transactions.push({
      kind: "cooperative",
      nodeId: leaf.leafId,
      txid,
      txHex: fakeRecoveryTxHex(txid),
      dependsOn: [],
      status: { type: "ready" }
    });
  }
  const unilateral = leaves.filter(({ method }) => method === "unilateral");
  const refunds: string[] = [];
  for (const leaf of unilateral) {
    const txid = fakeRecoveryTxid(`refund/${leaf.leafId}`);
    refunds.push(txid);
    transactions.push({
      kind: "refund",
      nodeId: leaf.leafId,
      txid,
      txHex: fakeRecoveryTxHex(txid),
      // As in jest/breez-sdk.ts: a refund received with the fee ladder, with its child.
      cpfpTxHex:
        leaf.feeLadder && leaf.stage !== "sweep"
          ? fakeRecoveryTxHex(fakeRecoveryTxid(`child/${txid}`))
          : undefined,
      csvTimelockBlocks: 2000,
      dependsOn: [],
      status:
        leaf.stage === "timelock"
          ? { type: "waitingForTimelock", spendableAtHeight: 902_000 }
          : leaf.stage === "sweep"
            ? { type: "confirmed", blockHeight: 899_000 }
            : { type: "ready" }
    });
  }
  if (unilateral.length > 0) {
    const txid = fakeRecoveryTxid(`sweep/${refunds.join(",")}/${destination}/${rate}`);
    transactions.push({
      kind: "sweep",
      txid,
      txHex: fakeRecoveryTxHex(txid),
      dependsOn: refunds,
      status: unilateral.every(({ stage }) => stage === "sweep")
        ? { type: "ready" }
        : { type: "waitingForDependencies" }
    });
  }
  return {
    ...fakeRecoveryTotals(leaves, rate),
    leaves: leaves.map(fakeRecoveryLeafRecord),
    failed,
    transactions,
    fundingInputs: [],
    feeRateSatPerVbyte: rate,
    destination
  };
}

/** The card wallets of the fake, by their path (`<card id>/<generation>`). */
export const fakeCardWallets = new Map<string, FakeCardWallet>();

/** The card's wallet of `cardId` at `generation`, made empty when the fake has none yet. */
export function fakeCardWallet(cardId: string, generation = 1): FakeCardWallet {
  return cardWalletAt(`${cardId}/${generation}`);
}

function cardWalletAt(path: string): FakeCardWallet {
  let found = fakeCardWallets.get(path);
  if (!found) {
    found = {
      balanceSats: 0,
      payments: [],
      unclaimedDeposits: [],
      identity: null,
      username: null,
      invoices: [],
      invoiceExpirySecs: null,
      incoming: [],
      recovery: emptyRecovery()
    };
    fakeCardWallets.set(path, found);
  }
  return found;
}

const accountIncoming: number[] = [];

/** The card's wallet whose storage is named `storageDir`, null for the account's. */
function cardWalletOf(storageDir: string | undefined): FakeCardWallet | null {
  const prefix = "breez-sdk-spark-cards/";
  return storageDir?.startsWith(prefix) ? cardWalletAt(storageDir.slice(prefix.length)) : null;
}

function cardUsernames(): Set<string> {
  return new Set(
    [...fakeCardWallets.values()].flatMap(({ username }) => (username ? [username] : []))
  );
}

function accountUsername(): string | undefined {
  const cards = cardUsernames();
  return [...lightningAddresses.keys()].find((username) => !cards.has(username));
}

function claimTransfers(
  state: { balanceSats: number; payments: Record<string, unknown>[] },
  incoming: number[]
): void {
  for (const amount of incoming.splice(0)) {
    state.balanceSats += amount;
    state.payments = [
      {
        id: `received-${state.payments.length + 1}`,
        paymentType: "receive",
        status: "completed",
        amount: BigInt(amount),
        fees: BigInt(0),
        timestamp: Math.floor(Date.now() / 1000),
        method: "spark",
        details: { type: "spark" }
      },
      ...state.payments
    ];
  }
}

function incomingOf(identity: string): number[] | null {
  if (identity === accountIdentity) return accountIncoming;
  for (const card of fakeCardWallets.values()) {
    if (card.identity === identity) return card.incoming;
  }
  return null;
}

const invoicesMade = { count: 1 };

/** As in jest/breez-sdk.ts: the account's identity, whatever the words; `free` frees them. */
export const signersMade: { count: number; freed: number; handlesFreed: number } = {
  count: 0,
  freed: 0,
  handlesFreed: 0
};

/** As in jest/breez-sdk.ts: how many times the account's own wallet was connected. */
export const accountConnections: { count: number } = { count: 0 };
export const defaultExternalSigners = jest.fn(
  (mnemonic: string, _passphrase: string | null | undefined, _network: string) => {
    if (typeof mnemonic !== "string" || mnemonic.trim() === "") throw new Error("No mnemonic");
    signersMade.count += 1;
    let freed = false;
    return {
      // As wasm-bindgen's getter: a handle of its own at each read, freed apart.
      get sparkSigner() {
        let handleFreed = false;
        return {
          getIdentityPublicKey: jest.fn(async () => {
            if (freed || handleFreed) throw new Error("null pointer passed to rust");
            return { bytes: Array.from(hexToBytes(accountIdentity)) };
          }),
          free: jest.fn(() => {
            if (!handleFreed) signersMade.handlesFreed += 1;
            handleFreed = true;
          })
        };
      },
      breezSigner: {},
      free: jest.fn(() => {
        if (!freed) signersMade.freed += 1;
        freed = true;
      })
    };
  }
);

export const connect = jest.fn(async (request?: unknown) => {
  // The wallet of the storage connected: a card's (its identity from its words), else the
  // account's.
  const { seed, storageDir } = (request ?? {}) as {
    seed?: { mnemonic?: unknown };
    storageDir?: string;
  };
  const card = cardWalletOf(storageDir);
  if (!card) accountConnections.count += 1;
  if (card) {
    if (typeof seed?.mnemonic !== "string") throw new Error("A card's wallet needs its words");
    card.identity = fakeIdentityOf(seed.mnemonic);
  }
  const state = card ?? fakeWallet;
  const identity = card?.identity ?? accountIdentity;
  const incoming = card?.incoming ?? accountIncoming;
  // Connecting syncs: what other wallets sent it meanwhile is claimed.
  if (sparkReachable) claimTransfers(state, incoming);
  // Its listeners, until removed or until it disconnects (as jest/breez-sdk.ts).
  const listeners = new Map<string, FakeEventListener>();
  const instances = eventListeners.get(state) ?? new Set();
  instances.add(listeners);
  eventListeners.set(state, instances);
  let gone = false;
  // As jest/breez-sdk.ts: a sync that reached the Spark operators is heard as `synced`.
  const tellSynced = () => {
    if (gone || !sparkReachable) return;
    for (const listener of [...listeners.values()]) listener.onEvent({ type: "synced" });
  };
  return sdkObject({
    disconnect: async () => {
      gone = true;
      listeners.clear();
      instances.delete(listeners);
    },
    addEventListener: async (listener: FakeEventListener) => {
      const id = `listener-${++listenersMade}`;
      listeners.set(id, listener);
      // As jest/breez-sdk.ts: the first, the wallet layer's own; its first sync ends then.
      if (!ownListeners.has(listeners)) {
        ownListeners.set(listeners, id);
        void Promise.resolve().then(tellSynced);
      }
      return id;
    },
    removeEventListener: async (id: string) => listeners.delete(id),
    receivePayment: async ({
      paymentMethod
    }: {
      paymentMethod: {
        type: string;
        newAddress?: boolean;
        amountSats?: number;
        description?: string;
        expirySecs?: number;
      };
    }) => {
      if (paymentMethod.type === "sparkAddress") {
        return { paymentRequest: fakeSparkAddress(identity), fee: BigInt(0) };
      }
      if (paymentMethod.type === "bolt11Invoice") {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- as depositAddress
        const lightning = require("./lightning") as typeof import("./lightning");
        const { amountSats } = paymentMethod;
        const invoice = lightning.makeInvoice({
          amountMsat: amountSats === undefined ? undefined : BigInt(amountSats) * BigInt(1000),
          paymentHash: lightning.preimagePair(invoicesMade.count++).paymentHash,
          description: paymentMethod.description,
          expirySeconds: paymentMethod.expirySecs ?? card?.invoiceExpirySecs ?? undefined
        });
        card?.invoices.push(invoice);
        return { paymentRequest: invoice, fee: BigInt(0) };
      }
      if (paymentMethod.newAddress || depositAddresses.handedOut === 0) {
        depositAddresses.handedOut += 1;
      }
      return { paymentRequest: depositAddress(depositAddresses.handedOut), fee: BigInt(0) };
    },
    getLightningAddress: async () => {
      const username = card ? (card.username ?? undefined) : accountUsername();
      return username === undefined
        ? undefined
        : { lightningAddress: `${username}@breez.tips`, username, description: "" };
    },
    checkLightningAddressAvailable: async ({ username }: { username: string }) =>
      !lightningAddresses.has(username),
    deleteLightningAddress: async () => {
      const username = card ? (card.username ?? undefined) : accountUsername();
      if (username === undefined) throw new Error("No lightning address registered");
      lightningAddresses.delete(username);
      if (card) card.username = null;
    },
    listUnclaimedDeposits: async (_request: Record<string, never>) => ({
      deposits: [...state.unclaimedDeposits]
    }),
    registerLightningAddress: async ({
      username,
      description
    }: {
      username: string;
      description: string | undefined;
    }) => {
      // Without a description, the server's own, which the SDK returns (spark-sdk 0.28.4:
      // lnurl/src/user.rs `shown_description`, core/src/sdk/lightning_address.rs).
      const shown = description ?? `Pay to ${username}@breez.tips`;
      lightningAddresses.set(username, shown);
      if (card) card.username = username;
      return {
        lightningAddress: `${username}@breez.tips`,
        username,
        description: shown
      };
    },
    getInfo: async () => ({
      identityPubkey: identity,
      balanceSats: state.balanceSats,
      // As in jest/breez-sdk.ts.
      recoverableFundsSats: recoverableSats(state.recovery)
    }),
    recommendedFees: async () => {
      if (fakeChainFees.ratesError) throw fakeChainFees.ratesError;
      const { hourFee } = fakeChainFees;
      return {
        fastestFee: hourFee * 2,
        halfHourFee: hourFee + 1,
        hourFee,
        economyFee: hourFee,
        minimumFee: 1
      };
    },
    prepareRecoverFunds: async (request: {
      feeRateSatPerVbyte: number;
      fundingKind?: unknown;
      destination: string;
      selection: { type: string; leafIds?: string[] };
    }) => prepareFakeRecovery(state.recovery, request),
    recoverFunds: async (
      request: { prepared: Record<string, unknown>; fundingInputs?: unknown[] },
      _signer?: unknown
    ) => {
      const response = buildFakeRecovery(state.recovery, request.prepared);
      fakeRecoveryBuilds.push({ state, response });
      return response;
    },
    parse: async (input: string) => webInput(input),
    // Claims what other wallets sent it by Spark and tells `synced`, when the Spark operators
    // answer (as jest/breez-sdk.ts).
    syncWallet: async (_request: Record<string, never>) => {
      if (sparkReachable) {
        claimTransfers(state, incoming);
        tellSynced();
      }
      return {};
    },
    prepareLnurlPay: async ({
      amount,
      payRequest,
      feePolicy
    }: {
      amount: bigint;
      payRequest: unknown;
      feePolicy?: string;
    }) => {
      // As jest/breez-sdk.ts (spark-sdk 0.28.4, `prepare_fees_included`): the whole is spent, the
      // service's invoice asks it less the fee, which must leave something.
      const included = feePolicy === "feesIncluded";
      const fee = fakeSend.lightningFeeSats;
      if (included && Number(amount) <= fee) {
        throw new Error("InvalidInput: Amount too small for fees");
      }
      return {
        amountSats: Number(amount),
        payRequest,
        feeSats: fee,
        // The LNURL service's invoice, valid 10 minutes.
        invoiceDetails: {
          timestamp: Math.floor(Date.now() / 1000),
          expiry: 600,
          amountMsat: included ? (Number(amount) - fee) * 1000 : undefined
        },
        feePolicy: included ? "feesIncluded" : "feesExcluded"
      };
    },
    lnurlPay: async ({
      prepareResponse,
      idempotencyKey
    }: {
      prepareResponse: { amountSats: number; feeSats: number; feePolicy?: string };
      idempotencyKey?: string;
    }) => ({
      payment: sendWeb(
        idempotencyKey,
        // FeesIncluded: what is sent is the whole less the fee (the wallet spends the whole).
        prepareResponse.feePolicy === "feesIncluded"
          ? prepareResponse.amountSats - prepareResponse.feeSats
          : prepareResponse.amountSats,
        prepareResponse.feeSats,
        "lightning",
        { type: "lightning", htlcDetails: { paymentHash: "1111" } },
        state
      )
    }),
    prepareSendPayment: async ({
      paymentRequest,
      amount,
      feePolicy
    }: {
      paymentRequest: { input: string };
      amount?: bigint;
      feePolicy?: string;
    }) => {
      const parsed = webInput(paymentRequest.input);
      const included = feePolicy === "feesIncluded";
      // As spark-sdk 0.28.4 (prepare/bolt11.rs): an invoice of its own amount takes no FeesIncluded.
      if (included && parsed.type === "bolt11Invoice" && parsed.amountMsat !== undefined) {
        throw new Error(
          "InvalidInput: FeesIncluded is not supported for invoices with a fixed amount"
        );
      }
      if (parsed.type === "sparkAddress") {
        if (amount === undefined) throw new Error("InvalidInput: Amount is required");
        // As spark-sdk 0.28.4: a Spark transfer, its fee 0 (a `bigint` in the web build).
        return {
          paymentMethod: { type: "sparkAddress", address: parsed.address, fee: fakeSend.sparkFee },
          amount,
          // The policy asked (prepare/spark_address.rs): the fee is 0 either way.
          feePolicy: included ? "feesIncluded" : "feesExcluded"
        };
      }
      if (parsed.type === "bolt11Invoice") {
        const invoiceSats =
          parsed.amountMsat === undefined ? amount : BigInt(parsed.amountMsat as number) / 1000n;
        if (invoiceSats === undefined) throw new Error("InvalidInput: amount required");
        return {
          paymentMethod: {
            type: "bolt11Invoice",
            invoiceDetails: parsed,
            lightningFeeSats: fakeSend.lightningFeeSats
          },
          amount: invoiceSats,
          feePolicy: "feesExcluded"
        };
      }
      if (amount === undefined) throw new Error("InvalidInput: amount required");
      // FeesIncluded (prepare/bitcoin_address.rs): what is left after the slowest fee is no dust.
      if (included && Number(amount) - 400 - 340 < 330) {
        throw new Error("InvalidInput: Amount below dust after lowest fees");
      }
      return {
        paymentMethod: {
          type: "bitcoinAddress",
          address: parsed,
          feeQuote: {
            id: "quote",
            expiresAt: 0,
            speedFast: { userFeeSat: 1500, l1BroadcastFeeSat: 340 },
            speedMedium: { userFeeSat: 900, l1BroadcastFeeSat: 340 },
            speedSlow: { userFeeSat: 400, l1BroadcastFeeSat: 340 },
            isEstimate: false
          }
        },
        amount,
        feePolicy: included ? "feesIncluded" : "feesExcluded"
      };
    },
    sendPayment: async ({
      prepareResponse,
      options,
      idempotencyKey
    }: {
      prepareResponse: { amount: bigint; paymentMethod: { type: string }; feePolicy?: string };
      options?: { type: string; confirmationSpeed?: "fast" | "medium" | "slow" };
      idempotencyKey?: string;
    }) => {
      if (prepareResponse.paymentMethod.type === "sparkAddress") {
        const { address, fee } = prepareResponse.paymentMethod as unknown as {
          address: string;
          fee: string;
        };
        const repeated = idempotencyKey !== undefined && sentByKey.has(idempotencyKey);
        const amount = Number(prepareResponse.amount);
        const payment = sendWeb(
          idempotencyKey,
          amount,
          Number(fee),
          "spark",
          { type: "spark" },
          state
        );
        // Delivered to the wallet of the address (once per key), claimed at its next sync.
        if (!repeated) incomingOf(address.slice("spark1".length))?.push(amount);
        return { payment };
      }
      const onchain = prepareResponse.paymentMethod.type === "bitcoinAddress";
      const fee = onchain
        ? { fast: 1840, medium: 1240, slow: 740 }[options?.confirmationSpeed ?? "fast"]
        : fakeSend.lightningFeeSats;
      return {
        payment: sendWeb(
          idempotencyKey,
          // FeesIncluded (send/bitcoin_address.rs): the whole less this speed's fee is sent.
          prepareResponse.feePolicy === "feesIncluded"
            ? Number(prepareResponse.amount) - fee
            : Number(prepareResponse.amount),
          fee,
          onchain ? "withdraw" : "lightning",
          onchain
            ? {
                type: "withdraw",
                txId: "ab".repeat(32),
                vout: 0,
                // The address paid, as spark-sdk 0.28.4 records it.
                destinationAddress: (
                  prepareResponse.paymentMethod as unknown as { address: { address: string } }
                ).address.address
              }
            : { type: "lightning", htlcDetails: { paymentHash: "2222" } },
          state
        )
      };
    },
    getPayment: async ({ paymentId }: { paymentId: string }) => {
      const payment = state.payments.find((p) => p.id === paymentId);
      if (!payment) throw new Error("Payment not found");
      return { payment };
    },
    // Newest first, as the SDK's default order.
    listPayments: async ({
      fromTimestamp,
      offset,
      limit
    }: {
      fromTimestamp?: number;
      offset?: number;
      limit?: number;
    }) => {
      const payments = state.payments
        .filter((p) => fromTimestamp === undefined || (p.timestamp as number) >= fromTimestamp)
        .slice(offset ?? 0);
      return { payments: limit === undefined ? payments : payments.slice(0, limit) };
    }
  });
});

/**
 * What the fake wallet holds, shaped as the web build gives it (`balanceSats` a `number`,
 * `Payment` with `bigint` amounts, a `number` timestamp, string unions), the newest first. Tests
 * set it; `resetFakeWallet()` empties it.
 */
export const fakeWallet: {
  balanceSats: number;
  payments: Record<string, unknown>[];
  /** On-chain deposits not claimed yet (`DepositInfo`, `listUnclaimedDeposits`). */
  unclaimedDeposits: Record<string, unknown>[];
  /** As in jest/breez-sdk.ts. */
  recovery: FakeRecovery;
} = {
  balanceSats: 0,
  payments: [],
  unclaimedDeposits: [],
  recovery: emptyRecovery()
};

type FakeEventListener = { onEvent(event: { type: string; payment?: unknown }): void };

/** The listeners of each SDK instance connected, by the state of its wallet (as jest/breez-sdk.ts). */
const eventListeners = new Map<object, Set<Map<string, FakeEventListener>>>();
/** The first listener of each instance: the wallet layer's own (as jest/breez-sdk.ts). */
const ownListeners = new WeakMap<Map<string, FakeEventListener>, string>();
let listenersMade = 0;

/**
 * The SDK of the wallet whose state is `state` (`fakeWallet`, or a card's: fakeCardWallet) tells
 * its listeners the event `type` (`SdkEvent["type"]`, 0.28.4), as the SDK does once it stored what
 * the event says; `payment`: the one a payment's event carries (as the web build gives it).
 */
export function emitSdkEvent(state: object, type: string, payment?: unknown): void {
  const event = payment === undefined ? { type } : { type, payment };
  for (const listeners of eventListeners.get(state) ?? []) {
    for (const listener of [...listeners.values()]) listener.onEvent(event);
  }
}

/**
 * How many listeners the SDK instances of the wallet whose state is `state` hold now, besides the
 * wallet layer's own (as jest/breez-sdk.ts).
 */
export function sdkListenerCount(state: object): number {
  let count = 0;
  for (const listeners of eventListeners.get(state) ?? []) {
    const own = ownListeners.get(listeners);
    count += listeners.size - (own !== undefined && listeners.has(own) ? 1 : 0);
  }
  return count;
}

/** Whether the Spark operators answer (setSparkReachable). */
let sparkReachable = true;

/** As jest/breez-sdk.ts: the Spark operators reachable or not. Reachable again at the next reset. */
export function setSparkReachable(reachable: boolean): void {
  sparkReachable = reachable;
}

export function resetFakeWallet(): void {
  accountIdentity = FAKE_WEB_IDENTITY;
  eventListeners.clear();
  sparkReachable = true;
  fakeWallet.balanceSats = 0;
  fakeWallet.payments = [];
  fakeWallet.unclaimedDeposits = [];
  fakeWallet.recovery = emptyRecovery();
  fakeChainFees.hourFee = 2;
  fakeChainFees.ratesError = null;
  fakeRecoveryBuilds.splice(0);
  fakeCardWallets.clear();
  accountIncoming.splice(0);
  // As jest/breez-sdk.ts: the usernames registered go with the test.
  lightningAddresses.clear();
  signersMade.count = 0;
  signersMade.freed = 0;
  signersMade.handlesFreed = 0;
  accountConnections.count = 0;
}

/**
 * As in jest/breez-sdk.ts, on the web build's shapes (`method: "unknown"`, `bigint` amounts, a
 * `number` timestamp in Unix seconds): a transfer of a type the SDK does not know, as spark-sdk
 * stores it from 0.27.0 on, by default with a Lightning receipt's details.
 */
export function unknownMethodPayment({
  id,
  send = false,
  status = "completed",
  amount,
  fees = 0,
  timestamp,
  details = {
    type: "lightning",
    description: "Recharge",
    invoice: "lnbc1fake",
    destinationPubkey: "02ab",
    htlcDetails: { paymentHash: "e".repeat(64), preimage: "d".repeat(64) }
  }
}: {
  id: string;
  send?: boolean;
  status?: "completed" | "pending" | "failed";
  amount: number;
  fees?: number;
  timestamp: number;
  details?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    id,
    paymentType: send ? "send" : "receive",
    status,
    amount: BigInt(amount),
    fees: BigInt(fees),
    timestamp,
    method: "unknown",
    details
  };
}

/**
 * As in jest/breez-sdk.ts, on the web build's shapes: what `parse` reads (an `InputType` with
 * `type`, its millisats and times as numbers), and the fee of a Lightning payment.
 */
export const fakeSend: {
  inputs: Map<string, Record<string, unknown>>;
  lightningFeeSats: number;
  /** The fee a Spark transfer quotes, a `bigint` as in the web build: 0, as spark-sdk 0.28.4. */
  sparkFee: bigint;
  /** As in jest/breez-sdk.ts: the Lightning addresses `parse` asked cash.app for. */
  cashtagsAsked: string[];
} = {
  inputs: new Map(),
  lightningFeeSats: 3,
  sparkFee: BigInt(0),
  cashtagsAsked: []
};

export function resetFakeSend(): void {
  fakeSend.inputs = new Map();
  fakeSend.lightningFeeSats = 3;
  fakeSend.sparkFee = BigInt(0);
  fakeSend.cashtagsAsked = [];
  sentByKey.clear();
  invoicesMade.count = 1;
}

const sentByKey = new Map<string, Record<string, unknown>>();

function webInput(input: string): Record<string, unknown> & { type: string } {
  // A Spark address of a fake wallet (fakeSparkAddress): its owner's identity, on mainnet.
  if (/^spark1[0-9a-f]+$/.test(input)) {
    return {
      type: "sparkAddress",
      address: input,
      identityPublicKey: input.slice("spark1".length),
      network: "bitcoin",
      source: {}
    };
  }
  // As in jest/breez-sdk.ts: a cashtag is the Lightning address it names at cash.app.
  const cashtag = cashAppAddress(input);
  if (cashtag !== null) fakeSend.cashtagsAsked.push(cashtag);
  const parsed = fakeSend.inputs.get(cashtag ?? input);
  if (!parsed) throw new Error("InvalidInput: not a payment request");
  return parsed as Record<string, unknown> & { type: string };
}

/** As in jest/breez-sdk.ts: the Lightning address spark-sdk 0.28.4 reads in a cashtag. */
function cashAppAddress(input: string): string | null {
  if (!input.startsWith("$")) return null;
  const tag = input.slice(1);
  const at = tag.indexOf("@");
  const user = at === -1 ? tag : tag.slice(0, at);
  if (at !== -1 && tag.slice(at + 1).toLowerCase() !== "cash.app") return null;
  return /^(?=.*[a-z])[a-z0-9]{1,20}$/i.test(user) ? `${user}@cash.app` : null;
}

/** As in jest/breez-sdk.ts: a payment sent by `state` (the account's wallet unless a card's). */
function sendWeb(
  key: string | undefined,
  amount: number,
  fees: number,
  method: string,
  details: Record<string, unknown>,
  state: { balanceSats: number; payments: Record<string, unknown>[] } = fakeWallet
) {
  const already = key === undefined ? undefined : sentByKey.get(key);
  if (already) return already;
  if (state !== fakeWallet && state.balanceSats < amount + fees) {
    throw new Error("InsufficientFunds");
  }
  const payment = {
    // As spark-sdk 0.28.4: a payment sent with an idempotency key is known by it (its transfer id,
    // send/mod.rs `get_payment_by_id(idempotency_key)`).
    id: key ?? `sent-${state.payments.length + 1}`,
    paymentType: "send",
    status: "completed",
    amount: BigInt(amount),
    fees: BigInt(fees),
    timestamp: Math.floor(Date.now() / 1000),
    method,
    details
  };
  state.balanceSats -= amount + fees;
  state.payments = [payment, ...state.payments];
  if (key !== undefined) sentByKey.set(key, payment);
  return payment;
}
