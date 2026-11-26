import type { AccountProgress } from "@/features/account/usePasskeyAccount";

/** What the passkey's flow is doing, as the welcome screen says it (`account.progress`). */
export function migrationProgressKey({ action, step }: AccountProgress) {
  switch (step) {
    case "passkey":
      return action === "create" ? "account.progress.creating" : "account.progress.signingIn";
    case "account":
      return action === "create" ? "account.progress.preparing" : "account.progress.restoring";
    case "terminal":
      return "account.progress.terminal";
  }
}
