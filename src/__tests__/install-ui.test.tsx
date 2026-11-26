import "@/i18n";

import { render } from "@testing-library/react-native";
import { act, fireEvent, renderRouter, screen, waitFor, within } from "expo-router/testing-library";

import LaunchScreen from "@/app/index";
import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { InstallSetting } from "@/features/install/InstallSetting";
import { dismissInstallBanner, startInstall } from "@/features/install/install-offer";
import type { InstallOffer } from "@/features/install/install-target";

/*
 * "Install the app": the welcome screen's banner and the block of "Settings › Display". What the
 * browser offers comes from install-offer.web.ts (its own test): set here by each test.
 */
let mockOffer: InstallOffer | null = null;
let mockDismissed = false;
jest.mock("@/features/install/install-offer", () => ({
  followInstallPrompt: jest.fn(),
  useInstallOffer: () => mockOffer,
  startInstall: jest.fn(),
  readInstallBannerDismissed: () => mockDismissed,
  dismissInstallBanner: jest.fn()
}));
jest.mock("@/components/layout/useIsDesktop", () => ({
  ...jest.requireActual("@/components/layout/useIsDesktop"),
  useIsDesktop: jest.fn(() => false)
}));

afterEach(() => {
  jest.clearAllMocks();
  mockOffer = null;
  mockDismissed = false;
  jest.mocked(useIsDesktop).mockReset().mockReturnValue(false);
});

const IPHONE: InstallOffer = { target: "appStore", device: "iphone" };
const IPAD: InstallOffer = { target: "appStore", device: "ipad" };
const ANDROID: InstallOffer = { target: "googlePlay", device: "android" };
const CHROME: InstallOffer = { target: "prompt", device: "other" };
const SAFARI: InstallOffer = { target: "dock", device: "other" };

async function welcome(offer: InstallOffer | null, desktop = false) {
  mockOffer = offer;
  jest.mocked(useIsDesktop).mockReturnValue(desktop);
  await renderRouter({ index: LaunchScreen }, { initialUrl: "/" });
  await screen.findByTestId("create-account");
}

describe("the welcome screen's banner", () => {
  const PLACES = [
    [IPHONE, "The app for iPhone, on the App Store", "Get"],
    [IPAD, "The app for iPad, on the App Store", "Get"],
    [ANDROID, "The app for Android, on Google Play", "Get"],
    [CHROME, "In a window of its own, like an app", "Install"],
    [SAFARI, "In a window of its own, like an app", "Add to Dock"]
  ] as const;

  it.each(
    PLACES.flatMap(([offer, place, action]) =>
      [false, true].map((desktop) => ({ ...offer, offer, place, action, desktop }))
    )
  )(
    "tells where the app is ($target, $device, desktop: $desktop)",
    async ({ offer, place, action, desktop }) => {
      await welcome(offer, desktop);
      const banner = screen.getByTestId("install-banner");
      expect(within(banner).getByText("sattle.me")).toBeTruthy();
      expect(within(banner).getByTestId("install-banner-place")).toHaveTextContent(place);
      expect(within(banner).getByText(action)).toBeTruthy();
    }
  );

  // Its words on two lines (a phone): the button in the middle of the banner's height, as the
  // cross and the icon, not at its top.
  it("centres its button in the banner's height", async () => {
    await welcome(IPHONE);
    expect(screen.getByTestId("install-banner-action")).toHaveStyle({ alignSelf: "center" });
  });

  it.each([IPHONE, ANDROID, CHROME])("installs where the offer leads ($target)", async (offer) => {
    await welcome(offer);
    await fireEvent.press(screen.getByTestId("install-banner-action"));
    expect(startInstall).toHaveBeenCalledWith(offer.target);
  });

  // Safari on a Mac: no prompt a page can open, the steps instead.
  it("shows Safari on a Mac how to add the app to the Dock", async () => {
    await welcome(SAFARI, true);
    await fireEvent.press(screen.getByTestId("install-banner-action"));
    const sheet = await screen.findByTestId("install-dock");
    expect(within(sheet).getByText("Add sattle.me to the Dock")).toBeTruthy();
    expect(within(sheet).getByText(/File > Add to Dock/)).toBeTruthy();
    expect(within(sheet).getByTestId("install-dock-passkey")).toHaveTextContent(
      /log in again with your passkey/
    );
    expect(startInstall).not.toHaveBeenCalled();
    await fireEvent.press(within(sheet).getByTestId("install-dock-done"));
    await waitFor(() => expect(screen.queryByTestId("install-dock")).toBeNull());
  });

  it("closes for good on this device", async () => {
    await welcome(IPHONE);
    await fireEvent.press(screen.getByLabelText("Close, don't offer again"));
    expect(dismissInstallBanner).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("install-banner")).toBeNull();
    // The rest of the welcome screen stays.
    expect(screen.getByTestId("create-account")).toBeTruthy();
  });

  it("shows nothing when there is nothing to install", async () => {
    await welcome(null);
    expect(screen.queryByTestId("install-banner")).toBeNull();
  });

  it("shows nothing once closed on this device", async () => {
    mockDismissed = true;
    await welcome(IPHONE);
    expect(screen.queryByTestId("install-banner")).toBeNull();
  });
});

describe('"Install the app" in "Settings › Display"', () => {
  it.each([
    [IPHONE, "The sattle.me app for iPhone, on the App Store.", "App Store"],
    [IPAD, "The sattle.me app for iPad, on the App Store.", "App Store"],
    [ANDROID, "The sattle.me app for Android, on Google Play.", "Google Play"],
    [CHROME, "sattle.me on this computer, in a window of its own, like an app.", "Install"],
    [SAFARI, "sattle.me in this Mac's Dock, in a window of its own, like an app.", "Add to Dock"]
  ])("says where the app is and leads there ($target, $device)", async (offer, text, label) => {
    mockOffer = offer;
    await render(<InstallSetting />);
    const block = screen.getByTestId("install-block");
    expect(within(block).getByText("Install the app")).toBeTruthy();
    expect(within(block).getByText(text)).toBeTruthy();
    const action = within(block).getByTestId("install-action");
    expect(action).toHaveTextContent(new RegExp(label));
    await fireEvent.press(action);
    if (offer.target === "dock") {
      expect(await screen.findByTestId("install-dock")).toBeTruthy();
      expect(startInstall).not.toHaveBeenCalled();
    } else {
      expect(startInstall).toHaveBeenLastCalledWith(offer.target);
    }
  });

  it("shows nothing when there is nothing to install", async () => {
    await render(<InstallSetting />);
    expect(screen.queryByTestId("install-block")).toBeNull();
  });

  it("follows the offer as the browser's prompt comes and goes", async () => {
    mockOffer = CHROME;
    await render(<InstallSetting />);
    expect(screen.getByTestId("install-block")).toBeTruthy();
    mockOffer = null;
    await act(async () => {
      screen.rerender(<InstallSetting />);
    });
    expect(screen.queryByTestId("install-block")).toBeNull();
  });
});
