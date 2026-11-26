import { render } from "@testing-library/react-native";

import { IntegrationAvatar } from "@/features/integrations/IntegrationAvatar";
import { IntegrationLogo } from "@/features/integrations/IntegrationLogo";

import { drawn } from "../../jest/svg";

/**
 * Each drawing's gradients (their names), and the gradients its shapes paint with, in the order
 * drawn.
 */
function gradientsOf(testID: string, screen: Awaited<ReturnType<typeof render>>) {
  const root = screen.getByTestId(testID, { includeHiddenElements: true });
  return {
    names: drawn("RNSVGLinearGradient", root).map((node) => String(node.props.name)),
    painted: drawn("RNSVGPath", root)
      .map((node) => (node.props.fill as { brushRef?: string } | undefined)?.brushRef)
      .filter((ref): ref is string => ref !== undefined)
  };
}

describe("an integration's logo", () => {
  // On the web, every SVG of the page shares one namespace of ids, and a reference resolves to the
  // first element of that id: a copy in a screen kept mounted but hidden would take the gradients
  // of every later one.
  it("gives each drawing of GrandNode's logo gradients of its own, painted inside it", async () => {
    const screen = await render(
      <>
        <IntegrationLogo id="grandnode" />
        <IntegrationAvatar size={40} platform="grandnode" />
      </>
    );
    const tile = gradientsOf("integration-logo-grandnode", screen);
    const avatar = gradientsOf("integration-avatar-grandnode", screen);
    for (const drawing of [tile, avatar]) {
      expect(drawing.names).toHaveLength(2);
      expect(drawing.painted.length).toBeGreaterThan(0);
      for (const ref of drawing.painted) expect(drawing.names).toContain(ref);
    }
    expect(tile.names.filter((name) => avatar.names.includes(name))).toEqual([]);
  });

  // Each component scopes its own drawings: two tiles, and two avatars (a list row and a sale's).
  it.each([
    ["tiles", "integration-logo-grandnode"],
    ["avatars", "integration-avatar-grandnode"]
  ])("gives two %s of the same logo different gradients", async (_, testID) => {
    const screen = await render(
      testID === "integration-logo-grandnode" ? (
        <>
          <IntegrationLogo id="grandnode" />
          <IntegrationLogo id="grandnode" />
        </>
      ) : (
        <>
          <IntegrationAvatar size={40} platform="grandnode" />
          <IntegrationAvatar size={40} platform="grandnode" />
        </>
      )
    );
    const [first, second] = screen.getAllByTestId(testID, { includeHiddenElements: true });
    const names = (root: typeof first) =>
      drawn("RNSVGLinearGradient", root).map((node) => String(node.props.name));
    expect(names(first)).toHaveLength(2);
    expect(names(second)).toHaveLength(2);
    expect(names(first).filter((name) => names(second).includes(name))).toEqual([]);
  });
});
