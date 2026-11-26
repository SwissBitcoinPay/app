import { useEffect, useState } from "react";

import {
  getAccountSettings,
  getAccountTeamKeys,
  whenAccountSynced
} from "@/features/account/session";
import { useUnlocked } from "@/features/navigation/lock";
import { readWallet } from "@/features/settings/declarations-copy";
import { readRoster } from "@/features/team/roster";
import type { InvoiceProof } from "@/features/terminal/invoice";
import { logFailure } from "@/lib/log/log";

import { onOwnerFinalsAsked } from "./finals-wake";
import {
  findOwnerFinalJobs,
  settlingHolders,
  publishOwnerFinal,
  walletProof,
  type OwnerFinalJob
} from "./owner-finals";
import { SaleSettler, type SettleResult } from "./SaleSettler";

/** While the account stays open, the employees' links are reconciled again this often. */
export const OWNER_FINALS_INTERVAL_MS = 6 * 3600 * 1000;

/** A job of the owner (owner-finals.ts), with the proof of its round: the wallet as it was read. */
type Queued = { job: OwnerFinalJob; proof: InvoiceProof };

/**
 * The owner's device, once this device's account is open: the payment links of the employees'
 * sales, of the assistants' invoices and of the owner's devices' that still have no final version
 * get the owner's (owner-finals.ts), one sale after the other, then again every 6 hours while the
 * account stays open, and as soon as "Wallet" shows a link paid without its final version
 * (finals-wake.ts). Their payments are told by the owner's wallet (walletProof), connected for that
 * only when a link waits: never by the LNURL server alone, which may no longer know an invoice of a
 * year ago. Renders nothing.
 */
export function OwnerLinksFinalizer({
  walletId,
  lightningAddress
}: {
  walletId: string;
  lightningAddress: string;
}) {
  const unlocked = useUnlocked(walletId);
  const [queue, setQueue] = useState<Queued[]>([]);
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (!unlocked) return;
    const next = () => setRound((count) => count + 1);
    const timer = setInterval(next, OWNER_FINALS_INTERVAL_MS);
    // A link paid while the account stays open: settled now, not at the next interval.
    const stop = onOwnerFinalsAsked(next);
    return () => {
      clearInterval(timer);
      stop();
    };
  }, [unlocked]);

  useEffect(() => {
    // Locked meanwhile: what is left waits for the next opening, which looks again.
    if (!unlocked) return;
    let alive = true;
    void (async () => {
      try {
        await whenAccountSynced();
        const team = getAccountTeamKeys();
        const settings = getAccountSettings();
        if (!team || !settings) return;
        // The employees' links (the roster as the relays and this device know it: those of a
        // round without it wait for the next one), those removed within the year included (their
        // removal never waits for them), and those of the owner's devices (one may never come
        // back).
        const roster = await readRoster(team, settings.relays);
        const holders = settlingHolders(team, roster.roster, settings.devices);
        if (holders.length === 0) return;
        const jobs = await findOwnerFinalJobs(team, holders, lightningAddress);
        if (!alive || !jobs || jobs.length === 0) return;
        // What the wallet received: the proof of every job of the round.
        const received = await readWallet();
        if (!alive || received === null) return;
        const proof = walletProof(received);
        const queued = jobs.map((job) => ({ job, proof }));
        // A round still running keeps its queue, this round's other links after it: a link paid
        // meanwhile (an asked round, finals-wake.ts) must not wait for the next interval.
        setQueue((last) =>
          last.length === 0
            ? queued
            : [...last, ...queued.filter(({ job }) => !last.some((each) => each.job.id === job.id))]
        );
      } catch (error) {
        // The account closed meanwhile (its keys wiped): nothing to reconcile.
        logFailure("Reconciling the employees' payment links failed", error);
      }
    })();
    return () => {
      alive = false;
    };
  }, [unlocked, lightningAddress, round]);

  const first = queue[0];
  if (!unlocked || !first) return null;
  const { job, proof } = first;

  const onDone = (result: SettleResult) => {
    void (async () => {
      const team = getAccountTeamKeys();
      if (result.kind === "settled" && team) {
        try {
          await publishOwnerFinal(team, job, result.settlement);
        } catch (error) {
          logFailure("Publishing the owner's final version failed", error);
        }
      }
      setQueue((last) => (last[0]?.job.id === job.id ? last.slice(1) : last));
    })();
  };

  return (
    <SaleSettler
      key={job.id}
      sale={job.sale}
      saleKey={job.saleKey}
      relays={job.relays}
      proof={proof}
      tolerance={job.tolerance}
      onDone={onDone}
    />
  );
}
