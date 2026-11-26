import i18n from "@/i18n";

import { act, renderHook } from "@testing-library/react-native";
import { AccessibilityInfo, Platform, type KeyDownEvent, type ViewInstance } from "react-native";

import { useKeyboardMoves } from "@/features/card/useKeyboardMoves";

const LABELS: Record<string, string> = { a: "Shop", b: "Counter", c: "Bar" };

/** The props of each card of `ids` along `axis`, and what they moved. */
async function moves(axis: "x" | "y", { enabled = true, ids = ["a", "b", "c"] } = {}) {
  const onMove = jest.fn<void, [string[]]>();
  const { result } = await renderHook(() =>
    useKeyboardMoves({
      axis,
      ids,
      enabled,
      onMove,
      labelOf: (id) => LABELS[id] ?? "",
      t: i18n.t
    })
  );
  return { propsOf: result.current, onMove };
}

function action(actionName: string) {
  return { nativeEvent: { actionName } } as never;
}

/** A key pressed, as react-native-web hands it: the browser's event in `nativeEvent`. */
function key(name: string) {
  return { nativeEvent: { key: name }, preventDefault: jest.fn() } as unknown as KeyDownEvent & {
    preventDefault: jest.Mock;
  };
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("a card moved without dragging", () => {
  it("is named with its place, its actions those of its axis, within the line", async () => {
    const column = (await moves("y")).propsOf;
    expect(column("a").accessible).toBe(true);
    expect(column("a").accessibilityLabel).toBe("Shop, 1 of 3");
    expect(column("a").accessibilityActions).toEqual([{ name: "moveDown", label: "Move down" }]);
    expect(column("b").accessibilityActions).toEqual([
      { name: "moveUp", label: "Move up" },
      { name: "moveDown", label: "Move down" }
    ]);
    expect(column("c").accessibilityActions).toEqual([{ name: "moveUp", label: "Move up" }]);

    const row = (await moves("x")).propsOf;
    expect(row("a").accessibilityActions).toEqual([{ name: "moveRight", label: "Move right" }]);
    expect(row("c").accessibilityActions).toEqual([{ name: "moveLeft", label: "Move left" }]);
    // Alone: nowhere to go.
    expect((await moves("x", { ids: ["a"] })).propsOf("a").accessibilityActions).toEqual([]);
  });

  it("moves by a screen reader's action, announced, keeping the focus", async () => {
    jest.useFakeTimers();
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    const { propsOf, onMove } = await moves("y");
    const focus = jest.fn();
    const props = propsOf("c");
    props.ref({ focus } as unknown as ViewInstance);
    props.onAccessibilityAction(action("moveUp"));
    expect(onMove).toHaveBeenCalledWith(["a", "c", "b"]);
    expect(announce).toHaveBeenCalledWith("Bar, now 2 of 3");
    // Drawn again at its new place: the focus comes back to it.
    expect(focus).not.toHaveBeenCalled();
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it("takes no action out of the line, nor of the other axis", async () => {
    const { propsOf, onMove } = await moves("y");
    propsOf("a").onAccessibilityAction(action("moveUp"));
    propsOf("c").onAccessibilityAction(action("moveDown"));
    propsOf("b").onAccessibilityAction(action("moveLeft"));
    propsOf("b").onAccessibilityAction(action("activate"));
    expect(onMove).not.toHaveBeenCalled();
  });

  it("moves nothing while it may not (being saved)", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    const { propsOf, onMove } = await moves("x", { enabled: false });
    propsOf("a").onAccessibilityAction(action("moveRight"));
    expect(onMove).not.toHaveBeenCalled();
    expect(announce).not.toHaveBeenCalled();
  });

  it("has no keys outside the web", async () => {
    const { propsOf } = await moves("x");
    expect(propsOf("a").onKeyDown).toBeUndefined();
    expect(propsOf("a").tabIndex).toBeUndefined();
  });

  it("moves on the web by the arrow keys of its axis only, within the line", async () => {
    jest.replaceProperty(Platform, "OS", "web");
    const { propsOf, onMove } = await moves("x");
    expect(propsOf("b").tabIndex).toBe(0);
    const left = key("ArrowLeft");
    propsOf("b").onKeyDown!(left);
    expect(left.preventDefault).toHaveBeenCalled();
    expect(onMove).toHaveBeenLastCalledWith(["b", "a", "c"]);
    propsOf("b").onKeyDown!(key("ArrowRight"));
    expect(onMove).toHaveBeenLastCalledWith(["a", "c", "b"]);
    onMove.mockClear();
    // The other axis' keys, any other key, a step out of the line: left to the page.
    for (const [id, name] of [
      ["b", "ArrowUp"],
      ["b", "ArrowDown"],
      ["b", "Enter"],
      ["a", "ArrowLeft"],
      ["c", "ArrowRight"]
    ] as const) {
      const event = key(name);
      propsOf(id).onKeyDown!(event);
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
    expect(onMove).not.toHaveBeenCalled();

    const column = await moves("y");
    column.propsOf("a").onKeyDown!(key("ArrowDown"));
    expect(column.onMove).toHaveBeenCalledWith(["b", "a", "c"]);
  });
});
