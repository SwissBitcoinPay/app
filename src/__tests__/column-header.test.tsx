import "@/i18n";

import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { StyleSheet, Text, View, type ViewInstance } from "react-native";

import { ColumnHeader } from "@/components/ui/ColumnHeader";
import { Popover, placePopover } from "@/components/ui/Popover";
import { useTableView, type ViewColumn } from "@/components/ui/useTableView";
import type { TableFilters } from "@/lib/table";
import { motion } from "@/theme";

type Sale = { id: string; who: string; minor: number };

const SALES: Sale[] = [
  { id: "s1", who: "Erin", minor: 1200 },
  { id: "s2", who: "Bob", minor: 500 },
  { id: "s3", who: "Ágnes", minor: 1200 },
  { id: "s4", who: "Bob", minor: 9000 }
];

const COLUMNS: ViewColumn<Sale>[] = [
  {
    id: "who",
    label: "By",
    sort: { kind: "text", key: (sale) => sale.who },
    value: (sale) => ({ key: sale.who, label: sale.who }),
    renderValue: (sale) => <Text testID={`face-${sale.id}`}>{`☺ ${sale.who}`}</Text>
  },
  {
    id: "amount",
    label: "Amount",
    sort: { kind: "number", key: (sale) => BigInt(sale.minor) },
    value: (sale) => ({ key: String(sale.minor), label: `${sale.minor / 100} CHF` })
  },
  { id: "rank", label: "Rank", sort: { kind: "number", key: (sale) => sale.minor } },
  { id: "note", label: "Note" }
];

function Table({ rows = SALES, hidden }: { rows?: Sale[]; hidden?: TableFilters }) {
  const table = useTableView(rows, COLUMNS, "fr-CH", hidden);
  return (
    <View>
      {COLUMNS.map((column) => (
        <ColumnHeader key={column.id} control={table.header(column)} testID={column.id} />
      ))}
      {table.rows.filter(table.shown).map((sale) => (
        <Text key={sale.id} testID="row">
          {sale.id}
        </Text>
      ))}
      {table.filtering ? (
        <Text onPress={table.clearFilters} testID="clear">
          Clear
        </Text>
      ) : null}
    </View>
  );
}

/** Bob's sales, hidden by default. */
const BOB: TableFilters = { who: ["Bob"] };

const rows = () => screen.queryAllByTestId("row").map((row) => String(row.props.children));
const header = (id: string) => screen.getByTestId(id);
const menu = (id: string) => within(screen.getByTestId(`${id}-menu`));
/** The layer around the panel: not an element for screen readers (the panel is modal for them). */
const outside = (id: string) =>
  screen.getByTestId(`${id}-menu-outside`, { includeHiddenElements: true });

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

describe("ColumnHeader", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("sorts the table by its column either way, and back to the rows' own order", async () => {
    await render(<Table />);
    expect(header("who")).toHaveProp("accessibilityLabel", "By");
    await fireEvent.press(header("who"));
    expect(header("who")).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ expanded: true })
    );
    expect(menu("who").getByText("Sort")).toBeTruthy();
    expect(menu("who").getByText("A to Z")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("who-menu-descending"));
    expect(rows()).toEqual(["s1", "s2", "s4", "s3"]);
    expect(screen.getByTestId("who-menu-descending")).toBeChecked();
    expect(header("who")).toHaveProp("accessibilityLabel", "By, sorted: Z to A");

    await fireEvent.press(screen.getByTestId("who-menu-ascending"));
    // The locale's order ("Ágnes" first), ties in the rows' own order.
    expect(rows()).toEqual(["s3", "s2", "s4", "s1"]);
    // The order chosen, chosen again: the rows' own order.
    await fireEvent.press(screen.getByTestId("who-menu-ascending"));
    expect(rows()).toEqual(["s1", "s2", "s3", "s4"]);
    expect(screen.getByTestId("who-menu-ascending")).not.toBeChecked();

    // One column's order at a time.
    await fireEvent.press(screen.getByTestId("who-menu-descending"));
    await fireEvent.press(header("amount"));
    expect(menu("amount").getByText("Largest to smallest")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("amount-menu-descending"));
    expect(rows()).toEqual(["s4", "s1", "s3", "s2"]);
    expect(header("who")).toHaveProp("accessibilityLabel", "By");
  });

  it("lists its values with their counts, and hides the rows of those unchecked", async () => {
    await render(<Table />);
    await fireEvent.press(header("amount"));
    const values = menu("amount").getAllByRole("checkbox");
    // "Select all", then the values in the column's order.
    expect(values.map((value) => value.props.accessibilityLabel)).toEqual([
      undefined,
      "5 CHF, 1",
      "12 CHF, 2",
      "90 CHF, 1"
    ]);
    const all = screen.getByTestId("amount-menu-all");
    expect(all).toBeChecked();

    await fireEvent.press(screen.getByTestId("amount-menu-value-1200"));
    expect(rows()).toEqual(["s2", "s4"]);
    expect(screen.getByTestId("amount-menu-value-1200")).not.toBeChecked();
    expect(all).toHaveProp("accessibilityState", expect.objectContaining({ checked: "mixed" }));
    expect(header("amount")).toHaveProp("accessibilityLabel", "Amount, filtered");

    // Filters add up, column by column.
    await fireEvent.press(header("who"));
    await fireEvent.press(screen.getByTestId("who-menu-value-Bob"));
    expect(rows()).toEqual([]);
    await fireEvent.press(screen.getByTestId("who-menu-value-Bob"));

    await fireEvent.press(all);
    expect(rows()).toEqual(["s1", "s2", "s3", "s4"]);
    expect(all).toBeChecked();
    await fireEvent.press(all);
    expect(rows()).toEqual([]);
    expect(all).not.toBeChecked();
    await fireEvent.press(screen.getByTestId("clear"));
    expect(rows()).toEqual(["s1", "s2", "s3", "s4"]);
  });

  it("shows the new rows unless their value was unchecked", async () => {
    const view = await render(<Table />);
    await fireEvent.press(header("who"));
    await fireEvent.press(screen.getByTestId("who-menu-value-Bob"));
    await view.rerender(
      <Table
        rows={[
          ...SALES,
          { id: "s5", who: "Zoë", minor: 100 },
          { id: "s6", who: "Bob", minor: 100 }
        ]}
      />
    );
    expect(rows()).toEqual(["s1", "s3", "s5"]);
  });

  it('hides the values given by default, unchecked but not "filtered", until shown', async () => {
    const view = await render(<Table hidden={BOB} />);
    expect(rows()).toEqual(["s1", "s3"]);
    expect(header("who")).toHaveProp("accessibilityLabel", "By");
    expect(screen.queryByTestId("clear")).toBeNull();
    await fireEvent.press(header("who"));
    expect(screen.getByTestId("who-menu-value-Bob")).not.toBeChecked();
    await fireEvent.press(screen.getByTestId("who-menu-value-Bob"));
    expect(rows()).toEqual(["s1", "s2", "s3", "s4"]);
    expect(header("who")).toHaveProp("accessibilityLabel", "By");
    // Read once: given again, they stay shown.
    await view.rerender(<Table hidden={BOB} />);
    expect(rows()).toEqual(["s1", "s2", "s3", "s4"]);
  });

  it('says "filtered" for the others only, "Clear" going back to the defaults', async () => {
    await render(<Table hidden={BOB} />);
    await fireEvent.press(header("who"));
    await fireEvent.press(screen.getByTestId("who-menu-value-Erin"));
    expect(rows()).toEqual(["s3"]);
    expect(header("who")).toHaveProp("accessibilityLabel", "By, filtered");
    await fireEvent.press(outside("who"));

    await fireEvent.press(screen.getByTestId("clear"));
    expect(rows()).toEqual(["s1", "s3"]);
    expect(header("who")).toHaveProp("accessibilityLabel", "By");
    expect(screen.queryByTestId("clear")).toBeNull();
  });

  it("closes its menu from outside", async () => {
    await render(<Table />);
    await fireEvent.press(header("who"));
    await fireEvent.press(outside("who"));
    expect(header("who")).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ expanded: false })
    );
    await advance(motion.popover + 100);
    expect(screen.queryByTestId("who-menu")).toBeNull();
  });

  it("leaves a column neither sortable nor filterable its name alone", async () => {
    await render(<Table />);
    expect(screen.getByText("Note")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Note" })).toBeNull();
  });

  it("draws each value as its column draws it, read by its words", async () => {
    await render(<Table />);
    await fireEvent.press(header("who"));
    // The first row of each value draws it; "Bob" once, for its two rows.
    const value = screen.getByTestId("who-menu-value-Bob");
    expect(within(value).getByTestId("face-s2", { includeHiddenElements: true })).toHaveTextContent(
      "☺ Bob"
    );
    expect(screen.queryByTestId("face-s4", { includeHiddenElements: true })).toBeNull();
    expect(value.props.accessibilityLabel).toBe("Bob, 2");
    // Without a drawing, its label.
    await fireEvent.press(outside("who"));
    await fireEvent.press(header("amount"));
    expect(
      within(screen.getByTestId("amount-menu-value-500")).getByText("5 CHF", {
        includeHiddenElements: true
      })
    ).toBeTruthy();
  });

  it('offers only "Sort" for a column sorted but not filtered', async () => {
    await render(<Table />);
    await fireEvent.press(header("rank"));
    expect(menu("rank").getByText("Sort")).toBeTruthy();
    expect(menu("rank").queryByText("Show")).toBeNull();
    expect(screen.queryByTestId("rank-menu-all")).toBeNull();
    await fireEvent.press(screen.getByTestId("rank-menu-descending"));
    expect(rows()).toEqual(["s4", "s1", "s3", "s2"]);
  });
});

describe("Popover", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("follows its anchor while shown, wherever it moves", async () => {
    // The anchor's box in the window; Jest's own views never measure.
    const box = { x: 400, y: 100, width: 80, height: 44 };
    const measureInWindow = jest.fn(
      (callback: (x: number, y: number, width: number, height: number) => void) =>
        callback(box.x, box.y, box.width, box.height)
    );
    const anchor = { current: { measureInWindow } as unknown as ViewInstance };
    await render(
      <Popover visible anchor={anchor} label="Menu" onClose={jest.fn()} testID="panel">
        <Text>Contenu</Text>
      </Popover>
    );
    const top = () => StyleSheet.flatten(screen.getByTestId("panel").props.style).top;
    await advance(20);
    expect(top()).toBe(148);
    // Rows read again above the table push its header down: the panel follows, no render asked.
    box.y = 180;
    await advance(20);
    expect(top()).toBe(228);
    // Nothing moved: no new box, the panel stays.
    const calls = measureInWindow.mock.calls.length;
    await advance(50);
    expect(measureInWindow.mock.calls.length).toBeGreaterThan(calls);
    expect(top()).toBe(228);
  });

  it("stops measuring once closed", async () => {
    const measureInWindow = jest.fn(
      (callback: (x: number, y: number, width: number, height: number) => void) =>
        callback(10, 10, 80, 44)
    );
    const anchor = { current: { measureInWindow } as unknown as ViewInstance };
    const panel = (visible: boolean) => (
      <Popover visible={visible} anchor={anchor} label="Menu" onClose={jest.fn()}>
        <Text>Contenu</Text>
      </Popover>
    );
    const view = await render(panel(true));
    await advance(50);
    await view.rerender(panel(false));
    await advance(motion.popover + 100);
    const calls = measureInWindow.mock.calls.length;
    await advance(200);
    expect(measureInWindow.mock.calls.length).toBe(calls);
  });

  // The photo's menu of an article opens the camera then (ArticleSheet): never over its Modal.
  it("tells once it is closed, its Modal gone, at each closing", async () => {
    const measureInWindow = jest.fn(
      (callback: (x: number, y: number, width: number, height: number) => void) =>
        callback(10, 10, 80, 44)
    );
    const anchor = { current: { measureInWindow } as unknown as ViewInstance };
    const onClosed = jest.fn();
    const panel = (visible: boolean) => (
      <Popover
        visible={visible}
        anchor={anchor}
        label="Menu"
        onClose={jest.fn()}
        onClosed={onClosed}
        testID="panel"
      >
        <Text>Contenu</Text>
      </Popover>
    );
    // Not as it mounts closed, nor while it shows.
    const view = await render(panel(false));
    await view.rerender(panel(true));
    await advance(motion.popover + 100);
    expect(onClosed).not.toHaveBeenCalled();

    // Not while it leaves: its Modal is still there.
    await view.rerender(panel(false));
    await advance(motion.popover / 2);
    expect(screen.queryByTestId("panel")).not.toBeNull();
    expect(onClosed).not.toHaveBeenCalled();
    await advance(motion.popover);
    expect(screen.queryByTestId("panel")).toBeNull();
    expect(onClosed).toHaveBeenCalledTimes(1);
    await advance(200);
    expect(onClosed).toHaveBeenCalledTimes(1);

    await view.rerender(panel(true));
    await advance(motion.popover + 100);
    await view.rerender(panel(false));
    await advance(motion.popover + 100);
    expect(onClosed).toHaveBeenCalledTimes(2);
  });
});

describe("placePopover", () => {
  const frame = { width: 1280, height: 800 };

  it("drops under its anchor, from its start or to its end", () => {
    const anchor = { x: 400, y: 100, width: 80, height: 44 };
    expect(placePopover(anchor, 288, "start", frame)).toEqual({
      left: 400,
      top: 148,
      maxHeight: 800 - 148 - 12,
      above: false
    });
    expect(placePopover(anchor, 288, "end", frame)).toMatchObject({ left: 480 - 288 });
  });

  it("stays inside the window", () => {
    expect(placePopover({ x: 1200, y: 100, width: 60, height: 44 }, 288, "start", frame).left).toBe(
      1280 - 288 - 12
    );
    expect(placePopover({ x: 4, y: 100, width: 60, height: 44 }, 288, "end", frame).left).toBe(12);
  });

  it("opens above its anchor when the room under it is short and there is more above", () => {
    expect(placePopover({ x: 400, y: 640, width: 80, height: 44 }, 288, "start", frame)).toEqual({
      left: 400,
      bottom: 800 - 640 + 4,
      maxHeight: 640 - 4 - 12,
      above: true
    });
  });
});
