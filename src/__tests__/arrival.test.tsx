import { act, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { Arrival } from "@/components/ui/Arrival";
import { LoadingScene, useLoadingScene } from "@/components/ui/LoadingScene";
import { motion } from "@/theme";

import { getAnimatedStyle } from "../../jest/animated-style";

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

/** A screen: its loading scene while `waiting`, then its content, as the screens draw them. */
function Screen({ waiting }: { waiting: boolean }) {
  const { scene, waited } = useLoadingScene(
    waiting ? { scene: "cards", label: "Loading your cards…", testID: "scene" } : null
  );
  return scene ? (
    <LoadingScene {...scene} />
  ) : (
    <Arrival fade={waited} testID="content">
      <Text>Content</Text>
    </Arrival>
  );
}

const sceneOpacity = () => Number(getAnimatedStyle(screen.getByRole("progressbar")).opacity);
const contentOpacity = () => Number(getAnimatedStyle(screen.getByTestId("content")).opacity);

describe("a loading scene's exit and its content's arrival", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("fades the scene out once read, then fades the content in", async () => {
    const { rerender } = await render(<Screen waiting />);
    await advance(motion.loadingDelay + motion.loadingEnter + 50);
    expect(sceneOpacity()).toBe(1);

    await rerender(<Screen waiting={false} />);
    // Read: the scene stays, fading out; the content waits for it.
    expect(screen.getByRole("progressbar", { name: "Loading your cards…" })).toBeTruthy();
    expect(screen.queryByTestId("content")).toBeNull();
    // Seen at once: half gone within a quarter of its time, faint long before it is removed.
    await advance(motion.loadingExit / 4);
    expect(sceneOpacity()).toBeGreaterThan(0);
    expect(sceneOpacity()).toBeLessThan(0.5);
    await advance(motion.loadingExit / 2);
    expect(sceneOpacity()).toBeLessThan(0.05);
    expect(screen.queryByTestId("content")).toBeNull();

    await advance(motion.loadingExit / 4 + 10);
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(contentOpacity()).toBe(0);
    await advance(motion.loadingArrival + 10);
    expect(contentOpacity()).toBe(1);
  });

  it("shows the content without a fade out after a wait too short to show the scene", async () => {
    const { rerender } = await render(<Screen waiting />);
    await advance(motion.loadingDelay / 2);
    await rerender(<Screen waiting={false} />);
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByTestId("content")).toBeTruthy();
  });

  it("shows at once what the device had at hand: no scene, no fade", async () => {
    await render(<Screen waiting={false} />);
    expect(contentOpacity()).toBe(1);
  });

  it("keeps the scene when the screen waits again while it fades out", async () => {
    const { rerender } = await render(<Screen waiting />);
    await advance(motion.loadingDelay + motion.loadingEnter + 50);
    await rerender(<Screen waiting={false} />);
    await advance(motion.loadingExit / 2);
    await rerender(<Screen waiting />);
    await advance(motion.loadingExit * 2);
    expect(sceneOpacity()).toBe(1);
    expect(screen.queryByTestId("content")).toBeNull();
  });

  it("fades the content in only as it arrives: a later change of `fade` changes nothing", async () => {
    const { rerender } = await render(
      <Arrival fade={false} testID="content">
        <Text>Content</Text>
      </Arrival>
    );
    await rerender(
      <Arrival fade testID="content">
        <Text>Content</Text>
      </Arrival>
    );
    await advance(10);
    expect(contentOpacity()).toBe(1);
  });
});
