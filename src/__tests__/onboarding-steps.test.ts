import {
  accountHome,
  accountRoutes,
  isOnboardingRoute,
  onboardingStep,
  setupRoutes,
  setupStep
} from "@/features/onboarding/steps";

/*
 * The sign-up's paths (no usage step, the welcome screen chooses):
 * the merchant's, the split then the bank details with a fiat share; the card holder's, the card's
 * pairing. Then the setup screen.
 */

describe("onboardingStep", () => {
  it("counts the bank details in the merchant path only with a fiat share", () => {
    expect(onboardingStep("split", { usage: "merchant", bitcoinPercent: 100 })).toEqual({
      steps: { count: 1, current: 0 },
      // The path's first step: back to the welcome screen.
      backFallback: "/"
    });
    expect(onboardingStep("split", { usage: "merchant", bitcoinPercent: 99 }).steps).toEqual({
      count: 2,
      current: 0
    });
    expect(onboardingStep("bank", { usage: "merchant", bitcoinPercent: 50 })).toEqual({
      steps: { count: 2, current: 1 },
      backFallback: "/onboarding/split"
    });
  });

  it("shows the split on the bank route without a fiat share, which redirects there", () => {
    expect(onboardingStep("bank", { usage: "merchant", bitcoinPercent: 100 })).toEqual(
      onboardingStep("split", { usage: "merchant", bitcoinPercent: 100 })
    );
  });

  it("shows the card's pairing as its path's one step, back to the welcome screen", () => {
    expect(onboardingStep("card", { usage: "card", bitcoinPercent: 50 })).toEqual({
      steps: { count: 1, current: 0 },
      backFallback: "/"
    });
  });

  it("shows the setup screen on the split's dot, all in bitcoin, its back to the split", () => {
    expect(setupStep({ usage: "merchant", bitcoinPercent: 100 })).toEqual({
      steps: { count: 1, current: 0 },
      backFallback: "/onboarding/split"
    });
  });

  it("keeps the bank details' dots on the setup screen of a fiat share, whose back leads there", () => {
    expect(setupStep({ usage: "merchant", bitcoinPercent: 40 })).toEqual({
      steps: onboardingStep("bank", { usage: "merchant", bitcoinPercent: 40 }).steps,
      backFallback: "/onboarding/bank"
    });
  });

  it("keeps the card path's dots on its setup screen, whose back leads to the pairing", () => {
    expect(setupStep({ usage: "card", bitcoinPercent: 100 })).toEqual({
      steps: onboardingStep("card", { usage: "card", bitcoinPercent: 100 }).steps,
      backFallback: "/onboarding/card"
    });
    expect(setupRoutes({ usage: "card", bitcoinPercent: 100 })).toEqual([
      "/onboarding/card",
      "/onboarding/setup"
    ]);
  });

  it("puts the merchant path's steps under the setup screen of a sign-up done elsewhere", () => {
    expect(setupRoutes({ usage: "merchant", bitcoinPercent: 100 })).toEqual([
      "/onboarding/split",
      "/onboarding/setup"
    ]);
    expect(setupRoutes({ usage: "merchant", bitcoinPercent: 40 })).toEqual([
      "/onboarding/split",
      "/onboarding/bank",
      "/onboarding/setup"
    ]);
  });

  it("only knows the sign-up steps that are screens: no usage step any more", () => {
    expect(isOnboardingRoute("setup")).toBe(false);
    expect(isOnboardingRoute("bank")).toBe(true);
    expect(isOnboardingRoute("split")).toBe(true);
    expect(isOnboardingRoute("card")).toBe(true);
    expect(isOnboardingRoute("usage")).toBe(false);
    expect(isOnboardingRoute("pending")).toBe(false);
    expect(isOnboardingRoute(undefined)).toBe(false);
  });
});

describe("accountRoutes", () => {
  it("opens a merchant's account on the point of sale once its sign-up is done", () => {
    expect(accountHome({ usage: "merchant" })).toBe("/pos");
    expect(accountRoutes({ signUp: "done", usage: "merchant" })).toEqual(["/pos"]);
  });

  it('opens a card holder\'s account on "Cards" once their sign-up is done', () => {
    expect(accountHome({ usage: "card" })).toBe("/cards");
    expect(accountRoutes({ signUp: "done", usage: "card" })).toEqual(["/cards"]);
  });

  it("opens an account without a usage on the point of sale, as before the choice existed", () => {
    expect(accountHome({ usage: null })).toBe("/pos");
  });

  it("resumes an unfinished sign-up at its step", () => {
    expect(accountRoutes({ signUp: "card", usage: "card" })).toEqual(["/onboarding/card"]);
    expect(accountRoutes({ signUp: "split", usage: "merchant" })).toEqual(["/onboarding/split"]);
    expect(accountRoutes({ signUp: "bank", usage: "merchant" })).toEqual([
      "/onboarding/split",
      "/onboarding/bank"
    ]);
  });

  it("resumes a sign-up saved before any step on its path's first one, a merchant's by default", () => {
    // An account created before the usage step was taken out.
    expect(accountRoutes({ signUp: "usage", usage: null })).toEqual(["/onboarding/split"]);
    expect(accountRoutes({ signUp: "usage", usage: "merchant" })).toEqual(["/onboarding/split"]);
    expect(accountRoutes({ signUp: "usage", usage: "card" })).toEqual(["/onboarding/card"]);
  });
});
