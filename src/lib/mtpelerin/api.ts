import { DEVICE_PLATFORM } from "@/config/mtpelerin";

import { MtPelerinError, placed } from "./errors";
import {
  readAccount,
  readAccounts,
  readBalances,
  readConfig,
  readDevice,
  readEstimate,
  readLightningInvoice,
  readOrdersPage,
  readPerson,
  readReferral,
  readSellOrder,
  readSmsSent,
  readTokens,
  readTransactionStatus
} from "./guards";
import type {
  MtpAccount,
  MtpBalances,
  MtpBankAccountChange,
  MtpConfig,
  MtpDevice,
  MtpEstimate,
  MtpLightningInvoice,
  MtpNewBankAccount,
  MtpNewLightningAccount,
  MtpNewSellOrder,
  MtpOrdersPage,
  MtpPerson,
  MtpPersonFields,
  MtpReferral,
  MtpSellOrder,
  MtpTokens,
  MtpTransactionStatus
} from "./types";

/*
 * Mt Pelerin's API as "Sell" uses it: one method per call, its request as Mt Pelerin documents it,
 * its answer through its guard (guards.ts).
 * Over a transport (MtpTransport): HTTPS to this build's Mt Pelerin (transport.ts,
 * environment.ts); in Jest, an API in memory (jest/mtpelerin.ts).
 */

/**
 * `amount` in millisatoshis: `1000` = 1 sat, and the amount must be exactly that. A JSON
 * number of a constant: never computed.
 */
export const VALIDATION_INVOICE_MSAT = 1000;

/** A request, as Mt Pelerin documents it. `path` never holds a token nor a code. */
export type MtpRequest = {
  method: "GET" | "POST" | "PUT" | "PATCH";
  /** "/devices/{id}/sms", its ids filled in; its query in `query`. */
  path: string;
  /** Query parameters (`filter` as JSON). */
  query?: Record<string, string>;
  body?: unknown;
  /** The access token of an authenticated endpoint, absent for a public endpoint. */
  token?: string;
};

/** The answer: its status and its JSON body (null when it had none, or none that parses). */
export type MtpResponse = { status: number; body: unknown };

/**
 * Sends `request`, resolves with Mt Pelerin's answer, whatever its status; rejects only when there
 * is none (offline, a timeout): MtPelerinError "offline".
 */
export type MtpTransport = (request: MtpRequest) => Promise<MtpResponse>;

/** A sell's estimate, of `amountIn` sats of `currencyIn` on `networkIn`. */
export type MtpSellEstimateRequest = {
  currencyIn: string;
  networkIn: string;
  currencyOut: string;
  amountIn: string;
};

/** The orders' list's query: a period (ISO 8601 days) and a page; `orderId`: that order only. */
export type MtpOrdersQuery = { fromDate: string; toDate: string; skip: number; orderId?: string };

export type MtPelerinApi = {
  /** Registers this device with `phone` (E.164). */
  addPhoneDevice(phone: string, version: string): Promise<MtpDevice>;
  /** Registers this device with an EVM wallet's `address` (dev/test only here). */
  addWalletDevice(address: string, version: string): Promise<MtpDevice>;
  /** Mt Pelerin sends its SMS. */
  sendSms(deviceId: string): Promise<void>;
  /** The SMS's 6-digit code, or the wallet login's signature, base64. Never logged. */
  authenticate(deviceId: string, code: string): Promise<MtpTokens>;
  /** A new pair of tokens from the refresh token. */
  refresh(refreshToken: string): Promise<MtpTokens>;
  /** The profile, null for its 404 (none yet: not an error). */
  findPerson(token: string): Promise<MtpPerson | null>;
  /** A one-shot call, 409 when the profile exists. */
  createPerson(
    token: string,
    fields: MtpPersonFields & { type: MtpPerson["type"] }
  ): Promise<MtpPerson>;
  /** Changes the profile. */
  updatePerson(token: string, personId: string, fields: MtpPersonFields): Promise<MtpPerson>;
  /** Posted right before `createPerson`. */
  createReferral(token: string, phone: string, code: string): Promise<MtpReferral>;
  /** Public. */
  config(): Promise<MtpConfig>;
  /** The profile's accounts, with its `where` filter. */
  listAccounts(token: string, where: Record<string, unknown>): Promise<MtpAccount[]>;
  /** Creates a bank account or the Lightning account. */
  createAccount(
    token: string,
    account: MtpNewLightningAccount | MtpNewBankAccount
  ): Promise<MtpAccount>;
  /**
   * A bank account's holder and address changed (`PATCH /accounts/{id}`, undocumented:
   * MtpBankAccountChange), the account as Mt Pelerin answers it. Its refusal of the account (a 401
   * "Authorization Required", as dev/test answered another profile's account)
   * rejects as "forbidden": the session is not refreshed nor lost for it.
   */
  updateBankAccount(
    token: string,
    accountId: string,
    change: MtpBankAccountChange
  ): Promise<MtpAccount>;
  /**
   * The 1-sat invoice that validates the Lightning account, public: always of 1000 millisatoshis
   * (the amount must be exactly that), tied to the account by `extra`.
   */
  validationInvoice(request: {
    comment: string;
    scopeId: string;
    accountId: string;
  }): Promise<MtpLightningInvoice>;
  /** Exactly one of `amount_in` / `amount_out`, here `amount_in`. */
  estimateSell(token: string, request: MtpSellEstimateRequest): Promise<MtpEstimate>;
  /** A sell order on Lightning: the order and the invoice to pay. */
  createSellOrder(token: string, order: MtpNewSellOrder): Promise<MtpSellOrder>;
  /**
   * An order's progress, with the profile's `scopeId` (`scope_id`) besides `orderId`: production
   * refuses the call without it (400 "scopeId must be provided"), though Mt Pelerin documents none.
   */
  transactionStatus(token: string, orderId: string, scopeId: string): Promise<MtpTransactionStatus>;
  /** A page of at most 20 orders. */
  listOrders(token: string, query: MtpOrdersQuery): Promise<MtpOrdersPage>;
  /** What Mt Pelerin holds for the bank account `beneficiaryId` from its deferred sells. */
  balances(token: string, beneficiaryId: string): Promise<MtpBalances>;
};

/** `limit`: pagination (default 20, max 20). */
export const ORDERS_PAGE_SIZE = 20;

/** What the server named in an error's body, lowercase, for 401s and 409s (errors.ts). */
function reasonOf(body: unknown): string | null {
  if (body === null || typeof body !== "object") return null;
  const v = body as Record<string, unknown>;
  const nested =
    v.error !== null && typeof v.error === "object" ? (v.error as Record<string, unknown>) : null;
  const texts = [v.exp, v.message, nested?.message, nested?.exp, v.error].filter(
    (value): value is string => typeof value === "string"
  );
  return texts.length > 0 ? texts.join(" ").slice(0, 200).toLowerCase() : null;
}

/** The error of a status other than 2xx. */
function statusError(status: number, body: unknown): MtPelerinError {
  const reason = reasonOf(body);
  if (status === 401) {
    // As soon as a call returns `401` with `exp: "token expired"`.
    return new MtPelerinError(
      reason?.includes("token expired") ? "tokenExpired" : "unauthorized",
      status,
      reason
    );
  }
  if (status === 403) return new MtPelerinError("forbidden", status, reason);
  if (status === 404) return new MtPelerinError("notFound", status, reason);
  if (status === 409) return new MtPelerinError("conflict", status, reason);
  if (status >= 500) return new MtPelerinError("server", status, reason);
  return new MtPelerinError("refused", status, reason);
}

/** Mt Pelerin's API over `transport`. */
export function createMtPelerinApi(transport: MtpTransport): MtPelerinApi {
  const send = async (request: MtpRequest): Promise<unknown> => {
    let response: MtpResponse;
    try {
      response = await transport(request);
    } catch (error) {
      if (error instanceof MtPelerinError) throw error;
      throw new MtPelerinError("offline");
    }
    if (response.status < 200 || response.status >= 300) {
      throw statusError(response.status, response.body);
    }
    return response.body;
  };
  /**
   * `request` sent and its answer read by `guard`: a failure names the method `call` (errors.ts
   * MtpErrorPlace), for the journal to tell which of Mt Pelerin's answers failed.
   */
  const ask = async <T>(
    call: keyof MtPelerinApi,
    request: MtpRequest,
    guard: (body: unknown) => T
  ): Promise<T> => {
    try {
      return guard(await send(request));
    } catch (error) {
      throw placed(error, { call });
    }
  };
  /** A 404 is no failure here: the entry does not exist yet. */
  const orNull = async <T>(read: () => Promise<T>): Promise<T | null> => {
    try {
      return await read();
    } catch (error) {
      if (error instanceof MtPelerinError && error.code === "notFound") return null;
      throw error;
    }
  };

  return {
    async addPhoneDevice(phone, version) {
      const body = {
        identifier_type: "phone",
        phone,
        deviceInfo: { platform: DEVICE_PLATFORM, version }
      };
      return ask("addPhoneDevice", { method: "POST", path: "/devices/add", body }, readDevice);
    },
    async addWalletDevice(address, version) {
      const body = {
        identifier_type: "address",
        address,
        deviceInfo: { platform: DEVICE_PLATFORM, version }
      };
      return ask("addWalletDevice", { method: "POST", path: "/devices/add", body }, readDevice);
    },
    async sendSms(deviceId) {
      await ask("sendSms", { method: "POST", path: `/devices/${deviceId}/sms` }, readSmsSent);
    },
    async authenticate(deviceId, code) {
      const path = `/devices/${deviceId}/authenticate`;
      return ask("authenticate", { method: "POST", path, body: { code } }, readTokens);
    },
    async refresh(refreshToken) {
      const body = { token: refreshToken };
      return ask("refresh", { method: "POST", path: "/tokens/refresh", body }, readTokens);
    },
    findPerson: (token) =>
      orNull(() =>
        ask("findPerson", { method: "GET", path: "/persons/findOne", token }, readPerson)
      ),
    async createPerson(token, fields) {
      return ask(
        "createPerson",
        { method: "PUT", path: "/persons", token, body: fields },
        readPerson
      );
    },
    async updatePerson(token, personId, fields) {
      const path = `/persons/${personId}`;
      return ask("updatePerson", { method: "PATCH", path, token, body: fields }, readPerson);
    },
    async createReferral(token, phone, code) {
      const body = { type: "phone", identifier: phone, code };
      const request: MtpRequest = { method: "POST", path: "/referrals/create", token, body };
      return ask("createReferral", request, readReferral);
    },
    async config() {
      return ask("config", { method: "GET", path: "/forms/mtp-config" }, readConfig);
    },
    async listAccounts(token, where) {
      const query = { filter: JSON.stringify({ where }) };
      return ask("listAccounts", { method: "GET", path: "/accounts", token, query }, readAccounts);
    },
    async createAccount(token, account) {
      const request: MtpRequest = { method: "PUT", path: "/accounts", token, body: account };
      return ask("createAccount", request, readAccount);
    },
    async updateBankAccount(token, accountId, change) {
      // An id as Mt Pelerin gives them (guards.ts): nothing of it can leave its path segment.
      const path = `/accounts/${encodeURIComponent(accountId)}`;
      try {
        const request: MtpRequest = { method: "PATCH", path, token, body: change };
        return await ask("updateBankAccount", request, readAccount);
      } catch (error) {
        // The refusal of the account ("Authorization Required" on dev/test), not of the
        // token: an expired one says "token expired", none "Unauthorized" (the same
        // day). Read as a 401 of the session, it would be refreshed, refused again and the session
        // dropped; read as a refusal, a token truly refused is found by the next call.
        if (
          error instanceof MtPelerinError &&
          error.code === "unauthorized" &&
          error.reason?.includes("authorization required") === true
        ) {
          throw new MtPelerinError("forbidden", error.status, error.reason, {
            call: "updateBankAccount"
          });
        }
        throw error;
      }
    },
    async validationInvoice({ comment, scopeId, accountId }) {
      const body = {
        amount: VALIDATION_INVOICE_MSAT,
        comment,
        extra: { uid: scopeId, from: accountId }
      };
      const request: MtpRequest = { method: "POST", path: "/ethereum/ln/pr", body };
      return ask("validationInvoice", request, readLightningInvoice);
    },
    async estimateSell(token, { currencyIn, networkIn, currencyOut, amountIn }) {
      // `source_network` for a crypto, none for a fiat.
      const body = {
        source_currency: currencyIn,
        source_network: networkIn,
        dest_currency: currencyOut,
        amount_in: amountIn
      };
      const request: MtpRequest = { method: "POST", path: "/orders/estimate", token, body };
      return ask("estimateSell", request, readEstimate);
    },
    async createSellOrder(token, order) {
      const request: MtpRequest = { method: "POST", path: "/orders/create", token, body: order };
      return ask("createSellOrder", request, readSellOrder);
    },
    async transactionStatus(token, orderId, scopeId) {
      // The `scopeId` too: production asks for it even with `orderId` (and checks no token:
      // without one, or a wrong one, it still answers by `scopeId`); dev/test asks for the token.
      const query = { orderId, scopeId };
      const request: MtpRequest = { method: "GET", path: "/transactions/status", token, query };
      return ask("transactionStatus", request, readTransactionStatus);
    },
    async listOrders(token, { fromDate, toDate, skip, orderId }) {
      const query = {
        ...(orderId === undefined ? {} : { orderId }),
        fromDate,
        toDate,
        skip: String(skip),
        limit: String(ORDERS_PAGE_SIZE)
      };
      return ask(
        "listOrders",
        { method: "GET", path: "/orders/status", token, query },
        readOrdersPage
      );
    },
    async balances(token, beneficiaryId) {
      // An id as Mt Pelerin gives them (guards.ts): nothing of it can leave its path segment.
      const path = `/orders/${encodeURIComponent(beneficiaryId)}/balances`;
      return ask("balances", { method: "GET", path, token }, readBalances);
    }
  };
}
