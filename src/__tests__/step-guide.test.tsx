import { fireEvent, render, screen, within } from "@testing-library/react-native";
import type { ComponentType } from "react";
import { StyleSheet } from "react-native";

import {
  ArticleCashArt,
  ArticleCreateArt,
  ArticleTapArt
} from "@/components/illustrations/articles";
import { CardPayArt, CardProgramArt, CardRechargeArt } from "@/components/illustrations/cards";
import {
  IntegrationCreateArt,
  IntegrationKeyArt,
  IntegrationPayArt
} from "@/components/illustrations/integrations";
import { TeamActivateArt, TeamInviteArt, TeamSellsArt } from "@/components/illustrations/team";
import {
  WalletFollowArt,
  WalletReceiveArt,
  WalletTakeArt
} from "@/components/illustrations/wallet";
import { StepGuide, type GuideStep } from "@/components/ui/StepGuide";

import { drawn, svgColour } from "../../jest/svg";

const styleOf = (element: { props: { style?: unknown } }) =>
  StyleSheet.flatten(element.props.style as never) as Record<string, unknown>;

const STEPS: GuideStep[] = [
  { key: "invite", title: "Invite", caption: "Choose their name.", Art: TeamInviteArt },
  { key: "activate", title: "Set up", caption: "They scan the code.", Art: TeamActivateArt },
  { key: "sales", title: "Follow", caption: "Their sales come in.", Art: TeamSellsArt }
];

describe("StepGuide", () => {
  it("says what the screen is for, then each step as one item: its number, title and text", async () => {
    await render(
      <StepGuide title="Take payments as a team" lead="One phone each." steps={STEPS} testID="g" />
    );
    expect(screen.getByRole("header", { name: "Take payments as a team" })).toBeTruthy();
    expect(screen.getByText("One phone each.")).toBeTruthy();
    const list = screen.getByTestId("g-steps");
    expect(list.props.accessibilityRole).toBe("list");
    // Named by the title when no label is given.
    expect(list.props.accessibilityLabel).toBe("Take payments as a team");
    expect(screen.getByLabelText("1. Invite, Choose their name.")).toBeTruthy();
    expect(screen.getByLabelText("2. Set up, They scan the code.")).toBeTruthy();
    expect(screen.getByLabelText("3. Follow, Their sales come in.")).toBeTruthy();
    // Items of the list: on the web, a list without items is read as empty.
    expect(screen.getByLabelText("1. Invite, Choose their name.").props.role).toBe("listitem");
    // Each number in its disc, at any text size.
    expect(within(list).getByText("2").props.maxFontSizeMultiplier).toBe(1);
  });

  it("hides its drawings from screen readers: the steps' words say it all", async () => {
    await render(<StepGuide title="Title" steps={STEPS} testID="g" />);
    const arts = screen.getAllByTestId("g-art", { includeHiddenElements: true });
    expect(arts).toHaveLength(3);
    for (const art of arts) {
      expect(art.props.importantForAccessibility).toBe("no-hide-descendants");
      expect(art.props.accessibilityElementsHidden).toBe(true);
    }
    expect(screen.queryByTestId("g-art")).toBeNull();
  });

  it("on a phone: one card, the steps one under the other, each drawing joined to the next", async () => {
    await render(<StepGuide title="Title" steps={STEPS} testID="g" />);
    expect(styleOf(screen.getByTestId("g-steps")).flexDirection).toBeUndefined();
    expect(styleOf(screen.getByTestId("g-steps")).backgroundColor).toBe("#FFFFFF");
    expect(screen.getAllByTestId("g-joint")).toHaveLength(2);
    expect(screen.queryByTestId("g-next")).toBeNull();
    // Each line drawn as tall as its place, never longer: its drawing's bitmap is its size.
    const joint = screen.getAllByTestId("g-joint")[0]!;
    expect(joint.children[0]).toMatchObject({ props: { width: "100%", height: "100%" } });
  });

  it("without a title (the wallet's list has its own): its lead, the list named by its label", async () => {
    await render(<StepGuide lead="Here is how." label="How" steps={STEPS} testID="g" />);
    expect(screen.queryByRole("header")).toBeNull();
    expect(screen.getByText("Here is how.")).toBeTruthy();
    expect(screen.getByTestId("g-steps").props.accessibilityLabel).toBe("How");
  });

  it("on a desktop: side by side, each in its card, a chevron between two, until they no longer fit", async () => {
    await render(<StepGuide title="Title" steps={STEPS} wide testID="g" />);
    expect(styleOf(screen.getByTestId("g-steps")).flexDirection).toBe("row");
    expect(screen.getAllByTestId("g-next")).toHaveLength(2);
    expect(screen.queryByTestId("g-joint")).toBeNull();

    // Three cards of 220 px and two gaps of 32: 724 px. Narrower, one under the other again.
    await fireEvent(screen.getByTestId("g"), "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 723, height: 600 } }
    });
    expect(styleOf(screen.getByTestId("g-steps")).flexDirection).toBeUndefined();
    expect(screen.queryByTestId("g-next")).toBeNull();
    expect(screen.getAllByTestId("g-joint")).toHaveLength(2);

    await fireEvent(screen.getByTestId("g"), "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 724, height: 400 } }
    });
    expect(styleOf(screen.getByTestId("g-steps")).flexDirection).toBe("row");
  });

  it("in a card already (the wallet's table): side by side without cards nor chevrons", async () => {
    await render(<StepGuide lead="Here." steps={STEPS} wide bare testID="g" />);
    expect(styleOf(screen.getByTestId("g-steps")).flexDirection).toBe("row");
    expect(styleOf(screen.getByTestId("g-steps")).backgroundColor).toBeUndefined();
    expect(screen.queryByTestId("g-next")).toBeNull();
    expect(screen.queryByTestId("g-joint")).toBeNull();
  });
});

describe("the empty screens' drawings", () => {
  const ARTS: Record<string, ComponentType<{ size: number }>> = {
    WalletTakeArt,
    WalletReceiveArt,
    WalletFollowArt,
    CardProgramArt,
    CardRechargeArt,
    CardPayArt,
    ArticleCreateArt,
    ArticleTapArt,
    ArticleCashArt,
    TeamInviteArt,
    TeamActivateArt,
    TeamSellsArt,
    IntegrationCreateArt,
    IntegrationKeyArt,
    IntegrationPayArt
  };

  it.each(Object.entries(ARTS))("draws %s at the size asked, without a word", async (_, Art) => {
    const { toJSON } = await render(<Art size={88} />);
    const svg = toJSON() as { props: Record<string, unknown> } | null;
    expect(svg?.props).toMatchObject({ width: 88, height: 88 });
    // Wordless: nothing to translate.
    expect(screen.queryAllByText(/./, { includeHiddenElements: true })).toHaveLength(0);
  });

  it.each([
    ["WalletTakeArt", WalletTakeArt],
    ["WalletReceiveArt", WalletReceiveArt],
    ["CardRechargeArt", CardRechargeArt],
    ["ArticleCashArt", ArticleCashArt],
    ["TeamSellsArt", TeamSellsArt]
  ] as const)(
    "pays in %s with the Bitcoin logo: its orange disc, its white sign",
    async (_, Art) => {
      await render(<Art size={88} />);
      const paths = drawn("RNSVGPath");
      // The published logo's own paths (parts.tsx, BITCOIN_DISC and BITCOIN_SIGN).
      const discs = paths.filter((path) => String(path.props.d).startsWith("m63.033,39.744"));
      const signs = paths.filter((path) => String(path.props.d).startsWith("m46.103,27.444"));
      expect(discs).toHaveLength(1);
      expect(svgColour(discs[0]!.props.fill).rgb).toBe("#F7931A");
      expect(signs).toHaveLength(1);
      expect(svgColour(signs[0]!.props.fill).rgb).toBe("#FFFFFF");
    }
  );
});
