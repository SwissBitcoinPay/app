import type { TFunction } from "i18next";
import type { ComponentType } from "react";
import { StyleSheet, View } from "react-native";

import { StepGuide, type GuideStep } from "@/components/ui/StepGuide";
import { space } from "@/theme";

/*
 * What the screens' guides share: each step's texts under one path of the translations, and, for
 * the lists ("Items", "Employees", "Integrations"), the guide in place of the list.
 */

/** Every step of the guides: where its title and caption are (`<path>.title`, `<path>.caption`). */
export type GuideStepPath =
  | `wallet.guide.${"take" | "receive" | "follow"}`
  | `cards.home.steps.${"program" | "recharge" | "pay"}`
  | `articles.guide.${"create" | "tap" | "cash"}`
  | `team.guide.${"invite" | "activate" | "sales"}`
  | `integrations.guide.${"create" | "key" | "pay"}`;

/** A step of a guide: its texts at `path`, its drawing. */
export function guideStep(
  t: TFunction,
  path: GuideStepPath,
  Art: ComponentType<{ size: number }>
): GuideStep {
  return { key: path, title: t(`${path}.title`), caption: t(`${path}.caption`), Art };
}

/**
 * A list's guide while it has nothing yet: on a phone, under the screen's header, its button under
 * it (the screen's); on a desktop, its steps side by side, its button in the header.
 */
export function ListGuide({
  title,
  lead,
  steps,
  desktop,
  testID
}: {
  title: string;
  lead: string;
  steps: readonly GuideStep[];
  desktop: boolean;
  testID: string;
}) {
  return (
    <View style={desktop ? null : styles.phone}>
      <StepGuide title={title} lead={lead} steps={steps} wide={desktop} testID={testID} />
    </View>
  );
}

const styles = StyleSheet.create({
  phone: { paddingTop: space[2], paddingBottom: space[5] }
});
