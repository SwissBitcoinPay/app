import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { escapeRichText } from "@/components/ui/RichText";
import { palette, motion, sans } from "@/theme";

function dialog(visible: boolean, onConfirm = jest.fn(), onCancel = jest.fn()) {
  return (
    <ConfirmDialog
      visible={visible}
      title="Leave Bakery?"
      body="This device will no longer accept payments for this business."
      confirmLabel="Leave the business"
      cancelLabel="Back"
      onConfirm={onConfirm}
      onCancel={onCancel}
      testID="dialog"
      confirmTestID="confirm"
    />
  );
}

/** The view that holds the scrim's Pressable and the card. */
function layer() {
  return screen.getByTestId("dialog", { includeHiddenElements: true }).parent!;
}

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

describe("ConfirmDialog", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("confirms and cancels", async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    await render(dialog(true, onConfirm, onCancel));
    expect(screen.getByRole("header", { name: "Leave Bakery?" })).toBeTruthy();
    await fireEvent.press(screen.getByTestId("confirm"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  // "Cancel the invoice": nothing showed while the relays answered.
  it("waits with a spinner while working: nothing closes it, nothing confirms it twice", async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const shown = (working: boolean) => (
      <ConfirmDialog
        visible
        title="Cancel invoice 2026-0003?"
        body="The payment link will no longer offer to pay."
        confirmLabel="Cancel the invoice"
        cancelLabel="Keep the invoice"
        onConfirm={onConfirm}
        working={working}
        onCancel={onCancel}
        testID="dialog"
        confirmTestID="confirm"
      />
    );
    const view = await render(shown(true));
    const confirm = screen.getByTestId("confirm");
    const keep = screen.getByRole("button", { name: "Keep the invoice" });
    expect(confirm.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    expect(keep.props.accessibilityState).toMatchObject({ disabled: true });
    // Its label keeps its room (the button's width), unseen behind the spinner, still its name.
    expect(confirm).toHaveTextContent("Cancel the invoice");

    await fireEvent.press(confirm);
    await fireEvent.press(keep);
    // The scrim, named as the way back (hidden from screen readers by the card's
    // accessibilityViewIsModal).
    await fireEvent.press(
      screen.getByLabelText("Keep the invoice", { includeHiddenElements: true })
    );
    // The system's back (Android), Escape (web).
    const [modal] = screen.container.queryAll(
      (node) => typeof node.props.onRequestClose === "function"
    );
    await act(async () => {
      modal!.props.onRequestClose();
    });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByTestId("dialog")).toBeTruthy();

    // Done waiting (a failure the caller told): every way back again.
    await view.rerender(shown(false));
    expect(screen.getByTestId("confirm").props.accessibilityState).toMatchObject({
      busy: false,
      disabled: false
    });
    await fireEvent.press(screen.getByRole("button", { name: "Keep the invoice" }));
    await act(async () => {
      modal!.props.onRequestClose();
    });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('tells what must come first with "Back" alone, while nothing can be confirmed', async () => {
    const onCancel = jest.fn();
    await render(
      <ConfirmDialog
        visible
        title="Empty Everyday first"
        body="27'500 sats are arriving on a Bitcoin address of this card."
        cancelLabel="Back"
        onCancel={onCancel}
        testID="dialog"
        confirmTestID="confirm"
      />
    );
    expect(screen.getByRole("header", { name: "Empty Everyday first" })).toBeTruthy();
    expect(screen.queryByTestId("confirm")).toBeNull();
    // Its one button: "Back".
    const buttons = within(screen.getByTestId("dialog")).getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveTextContent("Back");
    await fireEvent.press(buttons[0]!);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('sets its spans with `markup` ("Empty … first"), shows its texts as they are without', async () => {
    const shown = (markup: boolean) => (
      <ConfirmDialog
        visible
        markup={markup}
        title="Empty <accent>Everyday</accent> first"
        body="It still holds <strong>2'478 sats</strong>."
        cancelLabel="Back"
        onCancel={jest.fn()}
        testID="dialog"
      />
    );
    const view = await render(shown(true));
    expect(screen.getByRole("header", { name: "Empty Everyday first" })).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByText("Everyday").props.style).color).toBe(palette.orange);
    expect(StyleSheet.flatten(screen.getByText("2'478 sats").props.style)).toMatchObject(sans(700));
    expect(screen.getByTestId("dialog")).toHaveTextContent("It still holds 2'478 sats.", {
      exact: false
    });

    // Without it, its texts as they are.
    await view.rerender(shown(false));
    expect(
      screen.getByRole("header", { name: "Empty <accent>Everyday</accent> first" })
    ).toBeTruthy();
    expect(screen.getByText("It still holds <strong>2'478 sats</strong>.")).toBeTruthy();
  });

  it("shows a value escaped into its markup as it is, never as spans of its own", async () => {
    const name = "<strong>Q</strong> </accent><link>x</link>";
    await render(
      <ConfirmDialog
        visible
        markup
        title={`Empty <accent>${escapeRichText(name)}</accent> first`}
        body="It still holds <strong>2'478 sats</strong>."
        cancelLabel="Back"
        onCancel={jest.fn()}
      />
    );
    expect(screen.getByRole("header", { name: `Empty ${name} first` })).toBeTruthy();
    // The whole name in one orange span, no link in it.
    expect(StyleSheet.flatten(screen.getByText(name).props.style).color).toBe(palette.orange);
    expect(screen.queryByRole("link")).toBeNull();
  });

  // "Conservar el borrador", "Endgültig löschen": wider than the design's 112 + 210.
  it("widens a button to its label, never cuts it: a row too long wraps", async () => {
    await render(dialog(true));
    const confirm = screen.getByTestId("confirm");
    const cancel = StyleSheet.flatten(screen.getByRole("button", { name: "Back" }).props.style);
    expect(cancel).toMatchObject({ minWidth: 112 });
    expect(cancel.width).toBeUndefined();
    // No longer the design's 210: as wide as its label, up to the whole row (Button).
    expect(StyleSheet.flatten(confirm.props.style).maxWidth).toBe("100%");
    expect(StyleSheet.flatten(confirm.parent!.props.style).flexWrap).toBe("wrap");
  });

  it("keeps the confirm label's lines with `confirmWrap`, on one line otherwise", async () => {
    await render(dialog(true));
    expect(
      within(screen.getByTestId("confirm")).getByText("Leave the business").props.numberOfLines
    ).toBe(1);
    await render(
      <ConfirmDialog
        visible
        title="Erase without moving?"
        body="The 12 words will be erased."
        confirmLabel={"I have the 12 words,\nerase without moving"}
        confirmWrap
        cancelLabel="Back"
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
        confirmTestID="erase"
      />
    );
    const label = within(screen.getByTestId("erase")).getByText(
      "I have the 12 words,\nerase without moving"
    );
    expect(label.props.numberOfLines).toBeUndefined();
  });

  // Android: with pointerEvents "auto", the layer was flattened by Fabric; "none" on
  // closing made it a native view, and moving the Pressable and the card into it inside the Modal
  // stopped the app. Never flattened, closing only changes a prop of a view that exists.
  it("keeps its layer a native view while open and while it fades out", async () => {
    const view = await render(dialog(true));
    expect(layer().props.collapsable).toBe(false);
    expect(layer().props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ pointerEvents: "auto" })])
    );

    await view.rerender(dialog(false));
    // Still shown through its exit, no longer taking taps.
    expect(layer().props.collapsable).toBe(false);
    expect(layer().props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ pointerEvents: "none" })])
    );

    await advance(motion.sheet + 100);
    expect(screen.queryByTestId("dialog", { includeHiddenElements: true })).toBeNull();
  });
});
