import { REMOVED_SEAT_GRACE_SECONDS } from "@/config/team";
import type { Roster } from "@/features/team/roster";
import { deriveAssistantKeys } from "@/lib/assistant/keys";
import { deriveIntegrationKeys } from "@/lib/integrations/keys";
import type { ArchiveBy } from "@/lib/registry/archive";
import type { RemovedSeat, Seat } from "@/lib/team/roster";
import { takerTag } from "@/lib/registry/registry";
import {
  assistantSecretKey,
  integrationSecretKey,
  memberSecret,
  memberTakerKey,
  ownerDevicesSecret,
  ownerTakerKey,
  type TeamKeys
} from "@/lib/team/keys";

import type { Taker } from "./model";

/** The seats a declaration's mark may name: the roster's (src/features/team/roster.ts). */
export type Seats = Pick<Roster, "employees" | "integrations" | "assistants" | "removed">;

export const NO_SEATS: Seats = { employees: [], integrations: [], assistants: [], removed: [] };

/**
 * Who took a sale, from its declaration's mark (takerTag): the owner's devices, one of the roster's
 * employees, whose keys only the owner computes, or one of its integrations (docs/integrations.md:
 * its secret key, which its integrator's server holds, marks that server's declarations), or one of
 * its assistants (as a member, from its own secret; "By" tells it apart by the roster), or one of
 * its removed seats (whether its sale still counts is decided against the date of its removal,
 * model.ts). Null when it bears none, or one of nobody here: a forged one.
 */
export function takerResolver(
  team: TeamKeys,
  { employees, integrations, assistants, removed }: Seats
): (tag: string | null, saleAuthor: string) => Taker | null {
  const owner = ownerTakerKey(ownerDevicesSecret(team));
  const memberKey = (id: string) => ({
    taker: { kind: "member", id } as const,
    key: memberTakerKey(memberSecret(team, id))
  });
  const integrationKey = (id: string) => ({
    taker: { kind: "integration", id } as const,
    key: deriveIntegrationKeys(integrationSecretKey(team, id)).takerKey
  });
  const assistantKey = (id: string) => ({
    taker: { kind: "member", id } as const,
    key: deriveAssistantKeys(assistantSecretKey(team, id)).takerKey
  });
  const keyOf = ({ role, id }: Pick<RemovedSeat, "role" | "id">) =>
    role === "integration"
      ? integrationKey(id)
      : role === "assistant"
        ? assistantKey(id)
        : memberKey(id);
  const keys = [
    ...employees.map(({ id }) => memberKey(id)),
    ...integrations.map(({ id }) => integrationKey(id)),
    ...assistants.map(({ id }) => assistantKey(id)),
    ...removed.map(keyOf)
  ];
  return (tag, saleAuthor) => {
    if (tag === null) return null;
    if (takerTag(owner, saleAuthor) === tag) return { kind: "you" };
    return keys.find(({ key }) => takerTag(key, saleAuthor) === tag)?.taker ?? null;
  };
}

/**
 * Who the owner's copy of the declarations keeps as having taken a sale paid at `paidAt` (the
 * wallet's date), as "Wallet" vouches for it (model.ts, markVouches): the owner's devices; an
 * employee, an integration or an assistant of `seats` (a member's mark names an employee or an
 * assistant: the roster tells which); one removed since, when the payment came before its removal
 * (REMOVED_SEAT_GRACE_SECONDS). By the name the roster keeps. Null for anyone else: the copy keeps
 * nothing of that sale.
 */
export function archivedTaker(taker: Taker | null, paidAt: number, seats: Seats): ArchiveBy | null {
  if (taker === null) return null;
  if (taker.kind === "you") return { role: "owner" };
  const roles: readonly Seat["role"][] =
    taker.kind === "member" ? ["employee", "assistant"] : ["integration"];
  const named = (seat: Pick<Seat, "role" | "id">) =>
    roles.includes(seat.role) && seat.id === taker.id;
  const active = [
    ...seats.employees.map(({ id, name }) => ({ role: "employee" as const, id, name })),
    ...seats.assistants.map(({ id, name }) => ({ role: "assistant" as const, id, name })),
    ...seats.integrations.map(({ id, name }) => ({ role: "integration" as const, id, name }))
  ].find(named);
  if (active) return active;
  const removed = seats.removed.find(named);
  return removed && paidAt <= removed.removedAt + REMOVED_SEAT_GRACE_SECONDS
    ? { role: removed.role, id: removed.id, name: removed.name }
    : null;
}
