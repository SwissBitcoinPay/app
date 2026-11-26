import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { lightColors as colors, palette } from "@/theme";

type Rubric = "business" | "charging" | "security" | "payouts";

const ITEMS: TabItem<Rubric>[] = [
  { value: "business", label: "Business", icon: "store", testID: "tab-business" },
  { value: "charging", label: "Payments", icon: "coins", testID: "tab-charging" },
  {
    value: "security",
    label: "Security",
    icon: "shield-halved",
    disabled: true,
    testID: "tab-security"
  },
  {
    value: "payouts",
    label: "Payouts",
    icon: "landmark",
    locked: true,
    testID: "tab-payouts"
  }
];

/** The colour of a tab's label (its icon has the same). */
function labelColor(label: string) {
  return StyleSheet.flatten(screen.getByText(label).props.style).color as string;
}

describe("Tabs", () => {
  it("names its list, and marks the chosen tab in bold ink", async () => {
    await render(
      <Tabs
        items={ITEMS}
        value="charging"
        onChange={() => undefined}
        label="Settings"
        testID="tabs"
      />
    );
    expect(screen.getByTestId("tabs").props).toMatchObject({
      accessibilityRole: "tablist",
      accessibilityLabel: "Settings"
    });
    expect(screen.getAllByRole("tab")).toHaveLength(4);
    expect(screen.getByTestId("tab-charging")).toBeSelected();
    // Chosen, still enabled: a screen reader does not read it as dimmed.
    expect(screen.getByTestId("tab-charging")).not.toBeDisabled();
    expect(screen.getByTestId("tab-business")).not.toBeSelected();
    expect(labelColor("Payments")).toBe(colors.text.primary);
    expect(labelColor("Business")).toBe(palette.slate);
  });

  it("changes on a press of another tab, never of the chosen one", async () => {
    const onChange = jest.fn();
    await render(<Tabs items={ITEMS} value="business" onChange={onChange} label="Settings" />);
    await fireEvent.press(screen.getByTestId("tab-charging"));
    expect(onChange).toHaveBeenCalledWith("charging");
    await fireEvent.press(screen.getByTestId("tab-business"));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("shows a disabled tab in stone, which a press does not choose", async () => {
    const onChange = jest.fn();
    await render(<Tabs items={ITEMS} value="business" onChange={onChange} label="Settings" />);
    expect(screen.getByTestId("tab-security")).toBeDisabled();
    expect(labelColor("Security")).toBe(colors.text.disabled);
    await fireEvent.press(screen.getByTestId("tab-security"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows a locked tab's padlock, names it locked, and hands its press over", async () => {
    const onChange = jest.fn();
    await render(<Tabs items={ITEMS} value="business" onChange={onChange} label="Settings" />);
    expect(screen.getByTestId("tab-payouts-padlock")).toBeTruthy();
    expect(screen.queryByTestId("tab-charging-padlock")).toBeNull();
    expect(screen.getByTestId("tab-payouts")).toHaveAccessibleName(
      "Payouts, locked: unlock with your passkey"
    );
    // Its label as the others' (the side bar's locked rows), its icon in light stone.
    expect(labelColor("Payouts")).toBe(palette.slate);
    expect(screen.getByTestId("tab-payouts")).toBeEnabled();
    await fireEvent.press(screen.getByTestId("tab-payouts"));
    expect(onChange).toHaveBeenCalledWith("payouts");
  });

  it("shows a locked tab disabled as any other", async () => {
    const onChange = jest.fn();
    const items = ITEMS.map((item) =>
      item.value === "payouts" ? { ...item, disabled: true } : item
    );
    await render(<Tabs items={items} value="business" onChange={onChange} label="Settings" />);
    expect(screen.getByTestId("tab-payouts")).toBeDisabled();
    expect(screen.getByTestId("tab-payouts-padlock")).toBeTruthy();
    expect(labelColor("Payouts")).toBe(colors.text.disabled);
    await fireEvent.press(screen.getByTestId("tab-payouts"));
    expect(onChange).not.toHaveBeenCalled();
  });
});
