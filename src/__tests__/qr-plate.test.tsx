import { render } from "@testing-library/react-native";
import type { TestInstance } from "test-renderer";

import { QrPlate } from "@/components/ui/QrPlate";
import { qr, radius } from "@/theme";

const VALUE = "lightning:lnbc490u1p5test";

/** The plate's modules: the one view inside it. */
function modulesOf(plate: TestInstance | null): TestInstance {
  const [modules] = plate?.children ?? [];
  if (modules === undefined || typeof modules === "string") throw new Error("No modules drawn");
  return modules;
}

describe("QrPlate", () => {
  it("draws the code on its plate, inside its quiet zone", async () => {
    const { root } = await render(<QrPlate value={VALUE} size={200} />);
    expect(root).toHaveStyle({
      padding: qr.quietZone,
      borderRadius: radius.lg
    });
  });

  it("fades its modules alone, its plate as it is, for a code nobody can pay any more", async () => {
    const sharp = await render(<QrPlate value={VALUE} size={200} />);
    expect(modulesOf(sharp.root)).not.toHaveStyle({ opacity: 0.18 });
    sharp.unmount();

    const { root } = await render(<QrPlate value={VALUE} size={200} faded />);
    expect(root).not.toHaveStyle({ opacity: 0.18 });
    expect(modulesOf(root)).toHaveStyle({ opacity: 0.18 });
  });
});
