import { render, screen } from "@testing-library/react-native";

import { SaleNote } from "@/features/terminal/SaleNote";

/** The pen's glyph (Icon's "pen", Font Awesome's U+F304). */
const PEN = String.fromCodePoint(0xf304);

describe("SaleNote", () => {
  it("shows nothing without a note", async () => {
    await render(<SaleNote note="" testID="note" />);
    expect(screen.queryByTestId("note")).toBeNull();
    expect(screen.queryByText(PEN)).toBeNull();
    await render(<SaleNote note={undefined} testID="note" />);
    expect(screen.queryByTestId("note")).toBeNull();
  });

  it("shows the note after a pen, on three lines at most", async () => {
    await render(<SaleNote note="Table 12" testID="note" />);
    expect(screen.getByTestId("note")).toHaveTextContent("Table 12", { exact: true });
    expect(screen.getByTestId("note").props.numberOfLines).toBe(3);
    // A sign, as every icon (Icon): screen readers read the note alone.
    expect(screen.getByText(PEN).props.accessible).toBe(false);
  });
});
