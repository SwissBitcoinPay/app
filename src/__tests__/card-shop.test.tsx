import "@/i18n";

import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Dimensions, Linking } from "react-native";

import { CardShop } from "@/features/card/CardShop";

/*
 * The shop where cards are ordered (CardShop.tsx): what it says, the cards it draws on a phone and
 * on a desktop's page, and its button, which opens the shop in the browser. Where it shows:
 * cards-screen.test.tsx, add-card-steps.test.tsx, add-card-dialog.test.tsx.
 */

// The tests' window, given back after each test.
const WINDOW = { window: Dimensions.get("window"), screen: Dimensions.get("screen") };

async function windowOf(width: number, height: number) {
  await act(async () =>
    Dimensions.set({
      window: { ...WINDOW.window, width, height },
      screen: { ...WINDOW.screen, width, height }
    })
  );
}

afterEach(async () => {
  await act(async () => Dimensions.set(WINDOW));
});

/** The cards drawn: decoration, hidden from screen readers. */
function cardsDrawn() {
  return screen.getByTestId("card-shop-cards", { includeHiddenElements: true }).props.source;
}

describe("The shop where cards are ordered", () => {
  it("on a phone, draws two cards standing beside its words, its button under them", async () => {
    await windowOf(390, 844);
    await render(<CardShop />);
    expect(screen.getByRole("header", { name: "Choose your card" })).toBeTruthy();
    expect(screen.getByText("Several designs, to order from the sattle.me shop.")).toBeTruthy();
    expect(cardsDrawn()).toBe(require("../../assets/images/card-shop-pair.webp"));
    // The cards are decoration: screen readers read the words only.
    expect(screen.queryByTestId("card-shop-cards")).toBeNull();
  });

  it("on a desktop's page, draws two cards lying beside its words", async () => {
    await windowOf(1280, 800);
    await render(<CardShop />);
    expect(screen.getByRole("header", { name: "Choose your card" })).toBeTruthy();
    expect(cardsDrawn()).toBe(require("../../assets/images/card-shop-duo.webp"));
  });

  it.each([
    [390, 844],
    [1280, 800]
  ])(
    "opens the shop in the browser, nothing of the account in its address (%i px)",
    async (w, h) => {
      await windowOf(w, h);
      const opened = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
      try {
        await render(<CardShop />);
        await fireEvent.press(screen.getByRole("button", { name: "Order cards" }));
        expect(opened).toHaveBeenCalledTimes(1);
        expect(opened).toHaveBeenCalledWith("https://shop.sattle.me");
      } finally {
        opened.mockRestore();
      }
    }
  );
});
