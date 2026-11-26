import { useSegments } from "expo-router";
import { useState } from "react";

import { StepHeader } from "@/components/layout/StepHeader";

import { useOnboarding } from "./state";
import { isOnboardingRoute, onboardingStep, setupStep, type OnboardingRoute } from "./steps";
import { useBack } from "./useBack";

/**
 * The step header of the sign-up, drawn once by the onboarding layout above its stack: it follows
 * the current route instead of being part of each step, so it stays in place and its dots animate
 * when the step changes.
 */
export function OnboardingHeader() {
  const segments: readonly string[] = useSegments();
  const { usage, bitcoinPercent, setupFailed, backBlocked } = useOnboarding();
  const segment = segments[0] === "onboarding" ? segments[1] : undefined;
  const route: OnboardingRoute | "setup" | null =
    isOnboardingRoute(segment) || segment === "setup" ? segment : null;
  // Leaving the sign-up (back to the welcome screen, on to the point of sale), the route is no
  // longer a step while the steps slide out of sight: the header keeps the last one, the setup
  // screen's included.
  const [lastRoute, setLastRoute] = useState<OnboardingRoute | "setup">(route ?? "split");
  if (route && route !== lastRoute) setLastRoute(route);
  const shown = route ?? lastRoute;
  // The setup screen after the last step: its dots stay those of the last step; "back" waits for
  // the point of sale's preparation, and leads to that step once it failed.
  const setup = shown === "setup";
  const step = setup
    ? setupStep({ usage, bitcoinPercent })
    : onboardingStep(shown, { usage, bitcoinPercent });
  const back = useBack(step.backFallback);

  return (
    <StepHeader
      steps={step.steps}
      onBack={back}
      backDisabled={(setup && !setupFailed) || backBlocked}
    />
  );
}
