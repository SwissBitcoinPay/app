import { useRouter } from "expo-router";

import { finishedSignUp, useOnboarding } from "./state";
import { useSaveStep } from "./useSaveStep";

/**
 * "Start accepting payments": saves the merchant settings of the open account, sign-up done, then
 * opens the setup screen (src/app/onboarding/setup.tsx), which prepares this device's point of
 * sale (useAccountSetup) and opens it. Also returns the `save` of the step (useSaveStep), which
 * shares its state. A failure
 * to save is shown on the step until the next tap; a step left while it saves leads nowhere
 * (useSaveStep).
 */
export function useFinishSignUp() {
  const router = useRouter();
  const onboarding = useOnboarding();
  const step = useSaveStep();

  return {
    ...step,
    /** `payoutAccountId`: the Mt Pelerin bank account of a fiat share (its id), none without. */
    finish: (payoutAccountId: string | null = null) =>
      step.save(
        finishedSignUp(onboarding, payoutAccountId),
        () => {
          if (step.mounted.current) router.push("/onboarding/setup");
        },
        { always: true }
      )
  };
}
