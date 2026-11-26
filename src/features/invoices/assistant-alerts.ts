import {
  ASSISTANT_BURST_INVOICES,
  ASSISTANT_BURST_SECONDS,
  ASSISTANT_JUMP_ALERT
} from "@/config/team";
import { getAccountSettings, getAccountTeamKeys } from "@/features/account/session";
import { readWriterCopies, type WriterCopy } from "@/features/team/numbering";
import { readRoster } from "@/features/team/roster";
import type { Invoice } from "@/lib/invoice/record";
import { makesInvoices, type Assistant } from "@/lib/team/roster";
import { TEAM_TIMEOUT_MS } from "@/lib/team/shared";

import type { InvoiceAuthor } from "./invoices";

/*
 * "Wallet" warns the owner of an assistant that abuses the business's series of numbers, and
 * offers to remove it:
 * - "jump": its copy of the shared counter is more than ASSISTANT_JUMP_ALERT numbers above its
 *   last invoice of that year (numbers taken without invoices: the series skips them);
 * - "blocked": its copy is of a format this app cannot read, and no number is given over it;
 * - "burst": more than ASSISTANT_BURST_INVOICES invoices of it within ASSISTANT_BURST_SECONDS.
 * Only the assistants in the team: a removed one takes no number any more (numbering.ts). Told
 * only from a majority of the relays (the roster, the copies) and the invoices as listed: nothing
 * read is never a warning. The owner answers "This is expected" once per warning (its key, on this
 * device: alert-dismissals.ts); a jump further than the one answered warns again.
 */

export type AssistantAlert =
  | { kind: "jump"; assistant: Assistant; year: number; from: number; to: number }
  | { kind: "blocked"; assistant: Assistant }
  | { kind: "burst"; assistant: Assistant; count: number };

/** The key the owner's "This is expected" is kept under (alert-dismissals.ts). */
export function assistantAlertKey(alert: AssistantAlert): string {
  switch (alert.kind) {
    case "jump":
      return `${alert.assistant.id}:jump:${alert.year}:${alert.to}`;
    case "blocked":
      return `${alert.assistant.id}:blocked`;
    case "burst":
      return `${alert.assistant.id}:burst`;
  }
}

/** The most invoices of `times` (unix seconds) within any span of `span` seconds. */
function busiestSpan(times: readonly number[], span: number): number {
  const sorted = [...times].sort((a, b) => a - b);
  let most = 0;
  let start = 0;
  for (let end = 0; end < sorted.length; end++) {
    while (sorted[end]! - sorted[start]! >= span) start++;
    most = Math.max(most, end - start + 1);
  }
  return most;
}

/**
 * The warnings about `assistants` (those in the team that make invoices), from their copies of the
 * shared counter (`copies`, by id) and the business's invoices (`invoices`, each assistant's by
 * `authors`), in the device's `year`. One per assistant at most, the most serious first: blocked,
 * jump, burst.
 */
export function assistantAlerts({
  assistants,
  copies,
  invoices,
  authors,
  year
}: {
  assistants: readonly Assistant[];
  copies: ReadonlyMap<string, WriterCopy>;
  invoices: readonly Invoice[];
  authors: ReadonlyMap<string, InvoiceAuthor>;
  year: number;
}): AssistantAlert[] {
  const alerts: AssistantAlert[] = [];
  for (const assistant of assistants) {
    const own = invoices.filter((invoice) => authors.get(invoice.id)?.id === assistant.id);
    const copy = copies.get(assistant.id);
    if (copy?.status === "newer") {
      alerts.push({ kind: "blocked", assistant });
      continue;
    }
    if (copy?.status === "read" && copy.counter.year >= year) {
      const counter = copy.counter;
      const last = own.reduce(
        (highest, { number }) =>
          number.year === counter.year ? Math.max(highest, number.sequence) : highest,
        0
      );
      if (counter.last - last > ASSISTANT_JUMP_ALERT) {
        alerts.push({ kind: "jump", assistant, year: counter.year, from: last, to: counter.last });
        continue;
      }
    }
    const count = busiestSpan(
      own.map(({ createdAt }) => createdAt),
      ASSISTANT_BURST_SECONDS
    );
    if (count > ASSISTANT_BURST_INVOICES) alerts.push({ kind: "burst", assistant, count });
  }
  const rank = { blocked: 0, jump: 1, burst: 2 } as const;
  return alerts.sort((a, b) => rank[a.kind] - rank[b.kind]);
}

/**
 * The warnings about the open account's assistants, `invoices` and `authors` as "Wallet"
 * lists them (useInvoices): the roster and the assistants' copies read on a majority of the
 * relays. None when no account is open, no assistant makes invoices, or the relays could not tell
 * (never a warning from what was not read). Never rejects.
 */
export async function checkAssistants(
  invoices: readonly Invoice[],
  authors: ReadonlyMap<string, InvoiceAuthor>,
  year: number = new Date().getFullYear()
): Promise<AssistantAlert[]> {
  const team = getAccountTeamKeys();
  const settings = getAccountSettings();
  if (!team || !settings) return [];
  const read = await readRoster(team, settings.relays, TEAM_TIMEOUT_MS.background);
  if (read.status !== "read") return [];
  const assistants = read.roster.assistants.filter(makesInvoices);
  if (assistants.length === 0) return [];
  const copies = await readWriterCopies(
    team,
    assistants.map(({ id }) => id),
    settings.relays,
    TEAM_TIMEOUT_MS.background
  );
  if (!copies) return [];
  return assistantAlerts({ assistants, copies, invoices, authors, year });
}
