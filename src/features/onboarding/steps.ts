import type { Href } from "expo-router";

import type { ProgressDotsProps } from "@/components/ui/ProgressDots";
import { SIGN_UP_STEPS, type MerchantSettings, type SignUpStep } from "@/lib/settings/merchant";

import { hasFiatShare, type Usage } from "./state";

/*
 * The sign-up's steps after the passkey: no usage step.
 * "Create my account" on the welcome screen creates a merchant's account, on to the split (then,
 * with a fiat share, Mt Pelerin and the bank details); "A BoltCard" a card holder's, on to the
 * card's pairing (src/app/index.tsx). The saved step "usage" stays in the settings' format: it is
 * a new account's until the welcome screen's answer is saved (usePasskeyAccount), and settings an
 * earlier app saved may still hold it; it resumes on its path's first step.
 */

/** The sign-up steps that are screens of src/app/onboarding/ ("usage" has no screen). */
export type OnboardingRoute = Exclude<SignUpStep, "usage">;

export function isOnboardingRoute(segment: string | undefined): segment is OnboardingRoute {
  return segment !== "usage" && SIGN_UP_STEPS.some((route) => route === segment);
}

/** The steps before `step` on its path, then `step`: the history of a sign-up that resumes. */
const PATHS: Record<OnboardingRoute, readonly Href[]> = {
  split: ["/onboarding/split"],
  bank: ["/onboarding/split", "/onboarding/bank"],
  card: ["/onboarding/card"]
};

/**
 * Where an account opens once its sign-up is done: the point of sale, or
 * "Cards" for whoever chose to manage a card (what they chose to
 * do, where their sign-up ends already).
 */
export function accountHome({ usage }: Pick<MerchantSettings, "usage">): Href {
  return usage === "card" ? "/cards" : "/pos";
}

/**
 * Where an opened account goes: the step its sign-up stopped at, after the steps before it (so
 * that "back" leads to them), else its home once the sign-up is done (accountHome), which needs
 * this device's point of sale prepared first (activateTerminal). Stopped before any step (saved
 * "usage"): its path's first one, a merchant's unless it chose the card.
 */
export function accountRoutes(
  settings: Pick<MerchantSettings, "signUp" | "usage">
): readonly Href[] {
  const { signUp, usage } = settings;
  if (signUp === "done") return [accountHome(settings)];
  if (signUp === "usage") return PATHS[usage === "card" ? "card" : "split"];
  return PATHS[signUp];
}

/**
 * The history of the setup screen for a sign-up done on another device (useSaveStep): the steps of
 * its path, then the setup screen, so that its "back", once the setup failed, leads to the last
 * step: the merchant's split all in bitcoin, the bank details with a fiat share.
 */
export function setupRoutes({
  usage,
  bitcoinPercent
}: Pick<MerchantSettings, "usage" | "bitcoinPercent">): Href[] {
  const last = usage === "card" ? "card" : hasFiatShare(bitcoinPercent) ? "bank" : "split";
  return [...PATHS[last], "/onboarding/setup"];
}

/** Dots of the merchant path: the split, then the bank details only when some fiat is chosen. */
export function merchantSteps(bitcoinPercent: number, current: number): ProgressDotsProps {
  return { count: hasFiatShare(bitcoinPercent) ? 2 : 1, current };
}

/**
 * The setup screen (src/app/onboarding/setup.tsx), after "Start accepting payments" or the card's
 * pairing: the dots of the path, its last one current, and the step "back" leads to once the setup
 * failed.
 */
export function setupStep({
  usage,
  bitcoinPercent
}: {
  usage: Usage | null;
  bitcoinPercent: number;
}): {
  steps: ProgressDotsProps;
  backFallback: Href;
} {
  if (usage === "card") return { steps: cardSteps(), backFallback: "/onboarding/card" };
  const fiat = hasFiatShare(bitcoinPercent);
  return {
    steps: merchantSteps(bitcoinPercent, fiat ? 1 : 0),
    backFallback: fiat ? "/onboarding/bank" : "/onboarding/split"
  };
}

/** Dots of the card path: its pairing alone. */
export function cardSteps(): ProgressDotsProps {
  return { count: 1, current: 0 };
}

/**
 * What the header shows on a step: the dots of the current path, and where its back button leads
 * when there is no history (web reload, deep link): the path's first step, to the welcome screen.
 */
export function onboardingStep(
  route: OnboardingRoute,
  { usage, bitcoinPercent }: { usage: Usage | null; bitcoinPercent: number }
): { steps: ProgressDotsProps; backFallback: Href } {
  switch (route) {
    case "split":
      return { steps: merchantSteps(bitcoinPercent, 0), backFallback: "/" };
    case "bank":
      // Without a fiat share, the bank screen redirects to the split (bank.tsx): the header
      // already shows the split's dots, which have no second step to point at.
      if (!hasFiatShare(bitcoinPercent)) return onboardingStep("split", { usage, bitcoinPercent });
      return { steps: merchantSteps(bitcoinPercent, 1), backFallback: "/onboarding/split" };
    case "card":
      return { steps: cardSteps(), backFallback: "/" };
  }
}
