import { invoiceNetwork } from "@/features/terminal/invoice";
import { getAppInfo } from "@/lib/app-info";
import { getBreezApiKey } from "@/lib/breez/config";
import {
  forgetSentProbe,
  MAX_PROBE_INVOICE_LENGTH,
  prepareProbe,
  prepareRuntimeProbe,
  probeAvailable,
  ProbeUnavailableError,
  recordSentProbe,
  type ProbeMode,
  type ProbeProfile,
  type ProbeRun
} from "@/lib/card/probe-store";
import { fetchPayRequest, requestInvoice, sendableSats } from "@/lib/lightning/lnurl";
import { randomUuid } from "@/lib/random";
import { currentRelays } from "@/lib/relays/current";

import { CARD_TEXT_TEST_KEY } from "./paid-notice";
import { cardPushToken } from "./push";

export { CARD_TEXT_TEST_KEY };

/*
 * The test of the iOS notification service extension, staging on an iPhone: the app sends itself a
 * notification through Expo Push, as the card relay sends a tap, asking the extension to start the test wallet and use
 * it (plugins/card-notification-extension/ios/CardProbe.swift); the extension records how it went
 * in the container both share (src/lib/card/probe-store.ts), which the test's screen reads.
 */

/**
 * Expo's push API (Expo's docs, "Send notifications with the Expo Push Service"), no access token.
 */
export const EXPO_PUSH_SEND_URL = "https://exp.host/--/api/v2/push/send";
const PUSH_TIMEOUT_MS = 15_000;

/** What a payment test pays: an invoice of the account's own Lightning address, as a till's. */
export const PROBE_PAY_SATS = 1n;
/** Past this, an address's smallest invoice is not paid: the test wallet holds a few sats. */
export const PROBE_MAX_PAY_SATS = 10n;
/** How long the invoice of a payment test stays payable. */
const PROBE_INVOICE_SECONDS = 600;
/** As the extension's request asks (ProbeRequest, `sattlemeProbe`). */
const PROBE_REQUEST_VERSION = 1;
/**
 * How long Expo and Apple may hold the notification for a phone out of reach: a test is about now,
 * a notification delivered hours later would measure nothing useful.
 */
export const PROBE_TTL_SECONDS = 300;

export type ProbeFailure =
  /** No extension in this build or on this device. */
  | "unavailable"
  /** The build has no Breez API key: the test wallet could not start. */
  | "noApiKey"
  /** The shared keychain group or container refused. */
  | "storage"
  /** Notifications refused. */
  | "notifications"
  /** No push token: no network to Expo, or a build without push credentials (APNs). */
  | "pushToken"
  /** No invoice from the account's Lightning address (a payment test). */
  | "invoice"
  /** Expo did not take the notification. */
  | "push";

export type ProbeLaunch =
  | { status: "sent"; run: string }
  | { status: "failed"; reason: ProbeFailure; detail: string | null };

/** What the notification says until the extension writes its result over it. */
export type ProbeNotificationText = { title: string; body: string };

/**
 * An invoice of PROBE_PAY_SATS, or of the address's smallest amount up to PROBE_MAX_PAY_SATS, from
 * the account's own Lightning address (LUD-06), checked as a till checks it (requestInvoice).
 */
export async function probeInvoice(lightningAddress: string): Promise<string> {
  const pay = await fetchPayRequest(lightningAddress);
  const { min, max } = sendableSats(pay);
  const amountSats = min > PROBE_PAY_SATS ? min : PROBE_PAY_SATS;
  if (amountSats > PROBE_MAX_PAY_SATS || amountSats > max) {
    throw new Error(`The address takes ${min} to ${max} sats`);
  }
  const invoice = await requestInvoice(pay, {
    amountSats,
    expirySeconds: PROBE_INVOICE_SECONDS,
    network: invoiceNetwork()
  });
  if (invoice.pr.length > MAX_PROBE_INVOICE_LENGTH) throw new Error("The invoice is too long");
  return invoice.pr;
}

type PushTicket = { ok: true; id: string } | { ok: false; error: string };

/** Expo's answer to one message: its ticket, or why it refused (bounded: shown as is). */
export function parsePushTicket(status: number, json: unknown): PushTicket {
  const body = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
  const ticket =
    body.data && typeof body.data === "object" ? (body.data as Record<string, unknown>) : null;
  if (status >= 200 && status < 300 && ticket?.status === "ok" && typeof ticket.id === "string") {
    return { ok: true, id: ticket.id.slice(0, 64) };
  }
  const details =
    ticket?.details && typeof ticket.details === "object"
      ? (ticket.details as Record<string, unknown>)
      : null;
  const errors = Array.isArray(body.errors) ? (body.errors as unknown[]) : [];
  const first =
    errors[0] && typeof errors[0] === "object" ? (errors[0] as Record<string, unknown>) : null;
  const reason = [details?.error, ticket?.message, first?.code, first?.message].find(
    (value): value is string => typeof value === "string" && value.length > 0
  );
  return { ok: false, error: (reason ?? `HTTP ${status}`).slice(0, 120) };
}

async function sendPush(message: Record<string, unknown>): Promise<PushTicket> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PUSH_TIMEOUT_MS);
  try {
    const response = await fetch(EXPO_PUSH_SEND_URL, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(message),
      signal: controller.signal
    });
    let json: unknown = null;
    try {
      json = await response.json();
    } catch {
      // Not JSON: the status says the rest.
    }
    return parsePushTicket(response.status, json);
  } catch {
    return { ok: false, error: "unreachable" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Asks the extension for a run: prepares the test wallet, then sends this phone the notification
 * that starts it, as an alert the extension may change (`mutableContent`), the way a card's tap
 * would come. `lightningAddress` (the account's) gives a payment test its invoice.
 */
export async function launchProbe({
  mode,
  profile,
  lightningAddress,
  text,
  channelName
}: {
  mode: ProbeMode;
  profile: ProbeProfile;
  lightningAddress: string | null;
  text: ProbeNotificationText;
  channelName: string;
}): Promise<ProbeLaunch> {
  const failed = (reason: ProbeFailure, detail: string | null = null): ProbeLaunch => ({
    status: "failed",
    reason,
    detail
  });
  if (!probeAvailable()) return failed("unavailable");
  // The engine's tests start no wallet: neither the test wallet's seed nor the Breez API key. The
  // runtime's reads the device's relays.
  if (mode === "runtime") {
    try {
      prepareRuntimeProbe(currentRelays());
    } catch (error) {
      return failed(error instanceof ProbeUnavailableError ? "unavailable" : "storage");
    }
  } else if (mode !== "engine") {
    const apiKey = getBreezApiKey();
    if (apiKey === null) return failed("noApiKey");
    try {
      await prepareProbe(apiKey);
    } catch (error) {
      return failed(error instanceof ProbeUnavailableError ? "unavailable" : "storage");
    }
  }
  const token = await cardPushToken(channelName, { ask: true });
  if (token.status === "denied") return failed("notifications");
  if (token.status !== "granted") return failed("pushToken");

  let invoice: string | null = null;
  if (mode === "pay" || mode === "enginePay") {
    if (!lightningAddress) return failed("invoice");
    try {
      invoice = await probeInvoice(lightningAddress);
    } catch (error) {
      return failed("invoice", error instanceof Error ? error.message.slice(0, 120) : null);
    }
  }

  const run = randomUuid();
  // Noted before the notification goes: the extension runs only a run the app noted (anyone with
  // the push token can send one), and may run before Expo answers.
  const sentAt = Date.now();
  try {
    recordSentProbe({ run, mode, profile, sentAt, ticket: null });
  } catch {
    return failed("storage");
  }
  const ticket = await sendPush({
    to: token.token,
    title: text.title,
    body: text.body,
    sound: "default",
    priority: "high",
    ttl: PROBE_TTL_SECONDS,
    // The extension runs only for an alert it may change (Apple, "Modifying content in newly
    // delivered notifications").
    mutableContent: true,
    data: {
      sattlemeProbe: PROBE_REQUEST_VERSION,
      run,
      mode,
      profile,
      ...(invoice ? { invoice } : {})
    }
  });
  if (!ticket.ok) {
    try {
      forgetSentProbe(run);
    } catch {
      // Left as a run never recorded: its id is known to this app alone.
    }
    return failed("push", ticket.error);
  }
  try {
    recordSentProbe({ run, mode, profile, sentAt, ticket: ticket.id });
  } catch {
    // Sent all the same: noted without Expo's ticket.
  }
  return { status: "sent", run };
}

/** The relay's own title of a wake-up (sattleme/relay, `NOTIFICATION_TITLE`): no language. */
export const RELAY_WAKE_TITLE = "sattle.me";

export type CardTextTestLaunch =
  | { status: "sent" }
  | { status: "failed"; reason: "notifications" | "pushToken" | "push"; detail: string | null };

/**
 * Sends this phone a notification as the card relay sends a tap's wake-up (its title, `sattle.me`,
 * and `mutableContent`), without a packet: the extension writes its title in the app's language
 * (CardPushText.swift). Shown with `sattle.me`, the extension did not process it.
 */
export async function launchCardTextTest(channelName: string): Promise<CardTextTestLaunch> {
  const token = await cardPushToken(channelName, { ask: true });
  if (token.status === "denied") return { status: "failed", reason: "notifications", detail: null };
  if (token.status !== "granted") return { status: "failed", reason: "pushToken", detail: null };
  const ticket = await sendPush({
    to: token.token,
    title: RELAY_WAKE_TITLE,
    sound: "default",
    priority: "high",
    ttl: PROBE_TTL_SECONDS,
    mutableContent: true,
    data: { [CARD_TEXT_TEST_KEY]: true }
  });
  return ticket.ok
    ? { status: "sent" }
    : { status: "failed", reason: "push", detail: ticket.error };
}

function megabytes(bytes: number | null): number | null {
  return bytes === null ? null : Math.round((bytes / 1_048_576) * 10) / 10;
}

/**
 * The runs as one JSON text, to copy and hand over (sats as strings: exact), with the build that
 * ran them. No secret: the test wallet's seed and the API key stay out.
 */
export function probeReport(runs: ProbeRun[], exportedAt: Date): string {
  const app = getAppInfo();
  return JSON.stringify(
    {
      report: "sattleme-ios-notification-extension",
      version: 1,
      exportedAt: exportedAt.toISOString(),
      app: {
        variant: app.variant,
        version: app.version,
        buildNumber: app.buildNumber,
        commit: app.commit
      },
      runs: runs.map(({ record, ...run }) => ({
        ...run,
        sentAt: run.sentAt === null ? null : new Date(run.sentAt).toISOString(),
        record: record && {
          ...record,
          startedAt: new Date(record.startedAt).toISOString(),
          peakMB: megabytes(record.peakFootprintBytes),
          limitEstimateMB: megabytes(record.limitEstimateBytes),
          balanceSats: record.balanceSats?.toString() ?? null,
          feeSats: record.feeSats?.toString() ?? null
        }
      }))
    },
    null,
    2
  );
}
