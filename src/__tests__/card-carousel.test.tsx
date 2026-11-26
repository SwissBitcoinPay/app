import { act, render, screen } from "@testing-library/react-native";
import { Platform, StyleSheet } from "react-native";

import { CardCarousel, type CarouselCard } from "@/features/card/CardCarousel";
import type { CardState } from "@/lib/card/card-record";

/** What the carousel and a face read of a card (CardFaceView: its id, look and issuer). */
function carouselCard(cardId: string, label: string): CarouselCard {
  const card = { cardId, look: null, issuer: null } as unknown as CardState;
  return { card, label, status: null, paused: false };
}

const CARDS = [carouselCard("04a1b2c3d4e5f6", "Card A"), carouselCard("04f6e5d4c3b2a1", "Card B")];

type Handler = (event: { nativeEvent: { pageX: number; pageY: number } }) => unknown;

/** The carousel's responder handler `name`, called as React Native would, at (x, y). */
async function touch(name: string, x: number, y: number): Promise<unknown> {
  const handler = screen.getByTestId("cards-carousel").props[name] as Handler;
  let result: unknown;
  await act(async () => {
    result = handler({ nativeEvent: { pageX: x, pageY: y } });
  });
  return result;
}

describe('the carousel of "Cards"', () => {
  it("keeps a slide sideways from the screen's scroll, drifting up and down, and goes on a card", async () => {
    const onSelect = jest.fn();
    await render(<CardCarousel cards={CARDS} index={0} onSelect={onSelect} />);
    expect(await touch("onStartShouldSetResponderCapture", 200, 300)).toBe(false);
    // Sideways more than up: the row's.
    expect(await touch("onMoveShouldSetResponderCapture", 190, 296)).toBe(true);
    // Taken: the native scroll (Android's) is blocked for the rest of the slide (React Native's
    // responder blocks the host one when the grant returns true).
    expect(await touch("onResponderGrant", 190, 296)).toBe(true);
    expect(await touch("onResponderTerminationRequest", 150, 330)).toBe(false);
    // Drifting down on the way, it still slides the row: the next card.
    await touch("onResponderMove", 150, 330);
    await touch("onResponderRelease", 120, 340);
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("keeps where the first finger went down when a second one touches the row meanwhile", async () => {
    const onSelect = jest.fn();
    await render(<CardCarousel cards={CARDS} index={0} onSelect={onSelect} />);
    await touch("onStartShouldSetResponderCapture", 200, 300);
    expect(await touch("onMoveShouldSetResponderCapture", 180, 302)).toBe(true);
    await touch("onResponderGrant", 180, 302);
    // A second finger, further left: the slide is still measured from the first one's start.
    await touch("onStartShouldSetResponderCapture", 60, 300);
    await touch("onResponderMove", 120, 300);
    await touch("onResponderRelease", 120, 300);
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("leaves a slide up or down to the screen's scroll", async () => {
    const onSelect = jest.fn();
    await render(<CardCarousel cards={CARDS} index={0} onSelect={onSelect} />);
    await touch("onStartShouldSetResponderCapture", 200, 300);
    expect(await touch("onMoveShouldSetResponderCapture", 192, 280)).toBe(false);
    // A move of a few points, a tap's: neither.
    await touch("onStartShouldSetResponderCapture", 200, 300);
    expect(await touch("onMoveShouldSetResponderCapture", 196, 301)).toBe(false);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("lets a browser scroll the page up and down only, never sideways over it", async () => {
    // In the app, no such style (React Native has none).
    await render(<CardCarousel cards={CARDS} index={0} onSelect={() => {}} />);
    expect(StyleSheet.flatten(screen.getByTestId("cards-carousel").props.style)).not.toHaveProperty(
      "touchAction"
    );
    await screen.unmount();

    const os = jest.replaceProperty(Platform, "OS", "web");
    await render(<CardCarousel cards={CARDS} index={0} onSelect={() => {}} />);
    expect(StyleSheet.flatten(screen.getByTestId("cards-carousel").props.style)).toMatchObject({
      touchAction: "pan-y pinch-zoom"
    });
    os.restore();
  });
});
