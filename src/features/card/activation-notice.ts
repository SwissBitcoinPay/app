import type { ChannelSync } from "./relay-sync";

export type ActivationNotice = {
  message: "card.activationNoPush" | "card.activationPending";
  testID: "card-activation-no-push" | "card-activation-pending";
};

/**
 * What a card just paired or programmed again tells its holder of its relay channel: nothing when
 * ready; "noPush" (no push token, and no card socket listening to its relay: an Android phone
 * whose socket is off, an iPhone without a token): it pays, but only while the app shows;
 * otherwise (the relay did not take it yet): it does not pay until an app start activates it. Null
 * for a card paired before this screen (the app start keeps it in step).
 */
export function activationNotice(activation: ChannelSync | null): ActivationNotice | null {
  if (activation === null || activation.status === "ready") return null;
  return activation.status === "noPush"
    ? { message: "card.activationNoPush", testID: "card-activation-no-push" }
    : { message: "card.activationPending", testID: "card-activation-pending" };
}
