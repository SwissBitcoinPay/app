import "@/i18n";

import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { SendWaiting } from "@/features/wallet/send/SendWaiting";
import { control, type } from "@/theme";

const styleOf = (element: { props: { style?: unknown } }) =>
  StyleSheet.flatten(element.props.style as never) as Record<string, unknown>;

describe("SendWaiting", () => {
  it.each([
    ["confirming", "Confirm with your passkey…"],
    ["sending", "Sending…"]
  ] as const)("says the %s phase, centred in the button's place", async (phase, text) => {
    await render(<SendWaiting phase={phase} testID="waiting" />);
    const row = screen.getByTestId("waiting");
    expect(row).toHaveTextContent(text);
    expect(styleOf(row)).toMatchObject({
      flexDirection: "row",
      justifyContent: "center",
      minHeight: control.lg
    });
    // One size wherever it shows ("Send", "Empty the card").
    expect(styleOf(screen.getByText(text)).fontSize).toBe(type.label);
  });
});
