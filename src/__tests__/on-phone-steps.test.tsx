import "@/i18n";

import { act, render, screen, within } from "@testing-library/react-native";
import { Platform } from "react-native";

import { OnPhoneSteps } from "@/features/card/OnPhoneSteps";
import { readsCards } from "@/features/card/useReadsCards";

import type * as NfcFake from "../../jest/nfc-manager";

// eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are synchronous
jest.mock("react-native-nfc-manager", () => require("../../jest/nfc-manager"));
const nfc = jest.requireMock<typeof NfcFake>("react-native-nfc-manager");

// The code's content, readable: the plate draws it as squares.
jest.mock("@/components/ui/QrPlate", () => {
  /* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories are synchronous */
  const { createElement } = require("react") as typeof import("react");
  const { Text } = require("react-native") as typeof import("react-native");
  /* eslint-enable @typescript-eslint/no-require-imports */
  return {
    QrPlate: ({ value, accessibilityLabel }: { value: string; accessibilityLabel?: string }) =>
      createElement(Text, { testID: "qr-value", accessibilityLabel }, value)
  };
});
// The variant's web app (read through `?.`: the module loads before this file sets it).
const mockOrigin: { value: string | null } = { value: null };
jest.mock("@/config/card", () => ({
  ...jest.requireActual<typeof import("@/config/card")>("@/config/card"),
  getCardAddingOrigin: () => mockOrigin?.value ?? null
}));
const mockDesktop = jest.fn(() => true);
jest.mock("@/components/layout/useIsDesktop", () => ({
  useIsDesktop: () => mockDesktop()
}));

function renderSteps() {
  return render(
    <OnPhoneSteps
      path="Everyday › Delete the card"
      pathCaption="“I have the card with me” stays checked."
      holdCaption="When the app asks for it."
    />
  );
}

beforeEach(() => {
  nfc.resetNfcManager();
  mockOrigin.value = "https://web.example";
  mockDesktop.mockReturnValue(true);
});

describe("what the web app leaves to the phone, the card in hand", () => {
  let web: jest.ReplaceProperty<typeof Platform.OS>;
  beforeEach(() => {
    web = jest.replaceProperty(Platform, "OS", "web");
  });
  afterEach(() => web.restore());

  it('says the way there on the phone, a code beside it that opens "Cards" in the app', async () => {
    await renderSteps();
    const list = screen.getByTestId("card-on-phone-steps");
    expect(list.props.accessibilityRole).toBe("list");
    expect(list.props.accessibilityLabel).toBe("On your phone");
    const steps = within(list);
    expect(
      steps.getByLabelText(
        "1. Open sattle.me on your phone, Or scan this code with it: it opens “Cards” in the app."
      )
    ).toBeTruthy();
    expect(
      steps.getByLabelText(
        "2. Everyday › Delete the card, “I have the card with me” stays checked."
      )
    ).toBeTruthy();
    expect(
      steps.getByLabelText("3. Hold the card to the phone, When the app asks for it.")
    ).toBeTruthy();
    // "Cards" of the variant's web app, whose links the phone's app opens itself.
    const code = screen.getByTestId("qr-value");
    expect(code).toHaveTextContent(/^https:\/\/web\.example\/cards$/);
    expect(code.props.accessibilityLabel).toBe(
      "QR code that opens “Cards” in the app on your phone"
    );
  });

  it("gives no code where the build has no web app for the phone to open (no RP ID)", async () => {
    mockOrigin.value = null;
    await renderSteps();
    expect(screen.queryByTestId("qr-value")).toBeNull();
    // Nothing said of a code that is not there.
    expect(screen.getByLabelText("1. Open sattle.me on your phone")).toBeTruthy();
    expect(screen.queryByText(/scan/)).toBeNull();
  });

  it("gives no code on a phone's browser, which cannot scan its own screen", async () => {
    mockDesktop.mockReturnValue(false);
    await renderSteps();
    expect(screen.queryByTestId("qr-value")).toBeNull();
    expect(screen.getByLabelText("1. Open sattle.me on your phone")).toBeTruthy();
  });
});

describe("what the app leaves to the phone", () => {
  it("gives the code at any width on a device that reads no card (an iPad): the phone scans it", async () => {
    nfc.removeNfc();
    mockDesktop.mockReturnValue(false);
    await renderSteps();
    expect(await screen.findByTestId("qr-value")).toHaveTextContent(
      /^https:\/\/web\.example\/cards$/
    );
    expect(
      screen.getByLabelText(
        "1. Open sattle.me on your phone, Or scan this code with it: it opens “Cards” in the app."
      )
    ).toBeTruthy();
  });

  it("gives none on a phone, which scans no screen of its own", async () => {
    mockDesktop.mockReturnValue(false);
    await renderSteps();
    // Once its NFC is known.
    await act(async () => {
      await readsCards();
    });
    expect(screen.queryByTestId("qr-value")).toBeNull();
    expect(screen.getByLabelText("1. Open sattle.me on your phone")).toBeTruthy();
  });
});
