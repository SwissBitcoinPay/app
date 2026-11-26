import "@/i18n";

import { renderRouter, screen, within } from "expo-router/testing-library";

import LaunchScreen from "@/app/index";
import { useIsDesktop } from "@/components/layout/useIsDesktop";
import { isHandheld } from "@/lib/handheld";
import { isHandheld as webIsHandheld } from "@/lib/handheld.web";

// The web app's answer, set by each test.
jest.mock("@/lib/handheld", () => ({ isHandheld: jest.fn() }));
jest.mock("@/components/layout/useIsDesktop", () => ({
  ...jest.requireActual("@/components/layout/useIsDesktop"),
  useIsDesktop: jest.fn()
}));

const QRCODE = String.fromCodePoint(0xf029);
const LINK = String.fromCodePoint(0xf0c1);

const matchMediaBefore = Object.getOwnPropertyDescriptor(globalThis, "matchMedia");

/** The browser's media queries: `coarse` answers `(pointer: coarse)`, nothing else matches. */
function primaryPointer(coarse: boolean) {
  const matchMedia = jest.fn((query: string) => ({
    matches: coarse && query === "(pointer: coarse)"
  }));
  Object.defineProperty(globalThis, "matchMedia", { value: matchMedia, configurable: true });
  return matchMedia;
}

afterEach(() => {
  if (matchMediaBefore) Object.defineProperty(globalThis, "matchMedia", matchMediaBefore);
  else delete (globalThis as { matchMedia?: unknown }).matchMedia;
  jest.mocked(isHandheld).mockReset();
  jest.mocked(useIsDesktop).mockReset();
});

/*
 * "Join by invitation": its icon follows the device, never the
 * window's width: the QR code on a phone or a tablet, the link on a computer.
 */
describe("joining a team from the welcome screen", () => {
  it.each([
    { device: "a phone or a tablet", handheld: true, desktop: false, icon: QRCODE, not: LINK },
    { device: "a tablet, wide", handheld: true, desktop: true, icon: QRCODE, not: LINK },
    { device: "a computer", handheld: false, desktop: true, icon: LINK, not: QRCODE },
    {
      device: "a computer, narrow window",
      handheld: false,
      desktop: false,
      icon: LINK,
      not: QRCODE
    }
  ])("shows the invitation's icon of $device", async ({ handheld, desktop, icon, not }) => {
    jest.mocked(isHandheld).mockReturnValue(handheld);
    jest.mocked(useIsDesktop).mockReturnValue(desktop);
    await renderRouter({ index: LaunchScreen }, { initialUrl: "/" });
    const join = await screen.findByTestId("join-team");
    expect(within(join).getByText("Join by invitation")).toBeTruthy();
    expect(within(join).getByText(icon)).toBeTruthy();
    expect(within(join).queryByText(not)).toBeNull();
  });
});

describe("telling a phone or a tablet from a computer in a browser", () => {
  it("takes a finger as the primary pointer for a phone or a tablet", () => {
    const matchMedia = primaryPointer(true);
    expect(webIsHandheld()).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith("(pointer: coarse)");
  });

  it("takes a mouse or a trackpad as the primary pointer for a computer", () => {
    primaryPointer(false);
    expect(webIsHandheld()).toBe(false);
  });

  it("takes a browser without media queries for a computer", () => {
    delete (globalThis as { matchMedia?: unknown }).matchMedia;
    expect(webIsHandheld()).toBe(false);
  });
});
