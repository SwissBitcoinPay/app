import { act, renderHook } from "@testing-library/react-native";

import { useHeldThroughFade } from "@/features/navigation/motion";

type Props = { value: string | null; shown: boolean };

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

async function renderHeld(initialProps: Props) {
  return renderHook(({ value, shown }: Props) => useHeldThroughFade(value, shown, 320), {
    initialProps
  });
}

describe("useHeldThroughFade", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("follows the value while shown", async () => {
    const { result, rerender } = await renderHeld({ value: null, shown: true });
    expect(result.current).toBeNull();
    await rerender({ value: "open", shown: true });
    expect(result.current).toBe("open");
  });

  it("holds the last value shown through the fade-out, then none", async () => {
    const { result, rerender } = await renderHeld({ value: "open", shown: true });
    await rerender({ value: "open", shown: false });
    expect(result.current).toBe("open");
    // Nor does a change during the fade-out show.
    await rerender({ value: null, shown: false });
    expect(result.current).toBe("open");
    await advance(319);
    expect(result.current).toBe("open");
    await advance(1);
    expect(result.current).toBeNull();
  });

  it("shows nothing that comes as it hides", async () => {
    const { result, rerender } = await renderHeld({ value: null, shown: true });
    await rerender({ value: "open", shown: false });
    expect(result.current).toBeNull();
    await advance(320);
    expect(result.current).toBeNull();
  });

  it("is none at once when it was never shown", async () => {
    const { result } = await renderHeld({ value: "open", shown: false });
    expect(result.current).toBeNull();
  });

  it("follows the value again when shown during the fade-out", async () => {
    const { result, rerender } = await renderHeld({ value: "open", shown: true });
    await rerender({ value: "open", shown: false });
    await advance(200);
    await rerender({ value: "unconfirmed", shown: true });
    await advance(500);
    expect(result.current).toBe("unconfirmed");
  });
});
