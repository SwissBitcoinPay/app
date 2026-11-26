import { TeamError } from "@/features/team/owner";
import { logFailure } from "@/lib/log/log";

/** What a failed action on integrations says (`integrations.errors.<…>`). */
export type Failure =
  | "noAccount"
  | "tooMany"
  | "invalidName"
  | "unreachable"
  | "removeUnreachable"
  | "removeFailed"
  | "removalUnsaved"
  | "exportNewer";

const TEAM_FAILURES = new Set<string>([
  "noAccount",
  "tooMany",
  "invalidName",
  "unreachable",
  "removalUnsaved",
  "exportNewer"
]);

/** The failure an error stands for, `otherwise` for any other error. */
export function codeOf(error: unknown, otherwise: Failure): Failure {
  if (error instanceof TeamError && TEAM_FAILURES.has(error.code)) return error.code as Failure;
  // An assistant's invoice of a newer format (removeAssistant): what "exportNewer" says too, a
  // newer app changed this assistant, update the app to change it.
  if (error instanceof TeamError && error.code === "invoicesNewer") return "exportNewer";
  logFailure("Integration action failed", error);
  return otherwise;
}
