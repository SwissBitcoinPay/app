import { Platform } from "react-native";

import { outOfReach } from "@/components/ui/reach";

describe("outOfReach", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("hides from the screen readers of the apps, without `inert`", () => {
    expect(outOfReach(true)).toEqual({
      accessibilityElementsHidden: true,
      importantForAccessibility: "no-hide-descendants"
    });
    expect(outOfReach(false)).toEqual({
      accessibilityElementsHidden: false,
      importantForAccessibility: "auto"
    });
  });

  it("adds `inert` on the web: out of the tab order and of clicks too", () => {
    jest.replaceProperty(Platform, "OS", "web");
    expect(outOfReach(true)).toMatchObject({ inert: true });
    expect(outOfReach(false)).toMatchObject({ inert: false });
  });
});
