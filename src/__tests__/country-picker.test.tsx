import "@/i18n";

import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { CountryPicker } from "@/components/CountryPicker";

// The device is mocked as en-CH in jest.setup.ts: the picker is in English.
async function renderPicker(suggested: string | null) {
  await render(
    <CountryPicker
      title="Country of residence"
      visible
      value={suggested}
      suggested={suggested}
      onSelect={jest.fn()}
      onClose={jest.fn()}
    />
  );
}

/** The rendered rows: country name and space below the row. */
function rows() {
  return screen.getAllByRole("radio").map((row) => ({
    name: within(row).getAllByText(/./)[0].props.children as string,
    gap: StyleSheet.flatten(row.props.style).marginBottom ?? 0
  }));
}

describe("CountryPicker", () => {
  it("lists Switzerland and its neighbours first, then the other countries by name", async () => {
    await renderPicker("CH");
    const list = rows();
    expect(list.slice(0, 8).map((r) => r.name)).toEqual([
      "Switzerland",
      "Austria",
      "France",
      "Germany",
      "Italy",
      "Liechtenstein",
      "Afghanistan",
      "Åland Islands"
    ]);
    // A gap below the first group only.
    expect(list.map((r) => r.gap > 0)).toEqual(list.map((_, index) => index === 5));
  });

  it("keeps the groups while searching, with the gap only between two groups", async () => {
    await renderPicker("CH");
    await fireEvent.changeText(screen.getByTestId("country-search"), "fr");
    const found = rows();
    expect(found[0]).toMatchObject({ name: "France" });
    expect(found[0].gap).toBeGreaterThan(0);
    expect(found.slice(1).map((r) => r.name)).toContain("South Africa");

    await fireEvent.changeText(screen.getByTestId("country-search"), "switzerland");
    expect(rows()).toEqual([{ name: "Switzerland", gap: 0 }]);
  });
});
