import {
  beyondDefaults,
  collatorOf,
  columnValues,
  compareSortKeys,
  hidesRows,
  rowFilter,
  sortRows,
  withValues,
  type TableColumn
} from "@/lib/table";

type Row = { id: string; name: string; sats: bigint | null; at: number; kind: "a" | "b" };

const ROWS: Row[] = [
  { id: "1", name: "Table 10", sats: 500n, at: 300, kind: "a" },
  { id: "2", name: "table 9", sats: null, at: 100, kind: "b" },
  { id: "3", name: "Åsa", sats: 20n, at: 200, kind: "a" },
  { id: "4", name: "Zoë", sats: 500n, at: 400, kind: "b" },
  { id: "5", name: "", sats: 9_007_199_254_740_993n, at: 100, kind: "a" }
];

const name: TableColumn<Row> = {
  id: "name",
  label: "Name",
  sort: { kind: "text", key: (row) => row.name || null },
  value: (row) => (row.name ? { key: row.name, label: row.name } : { key: "", label: "—" })
};
const sats: TableColumn<Row> = {
  id: "sats",
  label: "sats",
  sort: { kind: "number", key: (row) => row.sats },
  value: (row) => ({ key: String(row.sats), label: String(row.sats) })
};
const at: TableColumn<Row> = {
  id: "at",
  label: "Date",
  sort: { kind: "date", key: (row) => row.at },
  value: (row) => ({ key: String(row.at), label: `t${row.at}` }),
  valuesOrder: "descending"
};
const kind: TableColumn<Row> = {
  id: "kind",
  label: "Type",
  value: (row) => ({ key: row.kind, label: row.kind === "a" ? "Alpha" : "Beta" })
};

const en = collatorOf("en-CH");
const ids = (rows: readonly Row[]) => rows.map((row) => row.id);

describe("table", () => {
  it("sorts text by the locale, its digits as numbers, the empty cells last both ways", () => {
    expect(ids(sortRows(ROWS, name, "ascending", en))).toEqual(["3", "2", "1", "4", "5"]);
    expect(ids(sortRows(ROWS, name, "descending", en))).toEqual(["4", "1", "2", "3", "5"]);
  });

  it("sorts bigints exactly, ties in the rows' own order", () => {
    // 2^53 + 1 sats: beyond a number's precision.
    expect(ids(sortRows(ROWS, sats, "descending", en))).toEqual(["5", "1", "4", "3", "2"]);
    expect(ids(sortRows(ROWS, sats, "ascending", en))).toEqual(["3", "1", "4", "5", "2"]);
    expect(ids(sortRows(ROWS, at, "ascending", en))).toEqual(["2", "5", "3", "1", "4"]);
  });

  it("leaves the rows as they are without a sortable column", () => {
    expect(sortRows(ROWS, kind, "ascending", en)).toBe(ROWS);
    expect(sortRows(ROWS, undefined, "descending", en)).toBe(ROWS);
  });

  it("compares a number and a bigint exactly", () => {
    expect(compareSortKeys(2, 3n, "ascending", en)).toBe(-1);
    expect(compareSortKeys(3n, 3, "descending", en) === 0).toBe(true);
    expect(compareSortKeys(null, 1, "descending", en)).toBe(1);
    expect(compareSortKeys(null, null, "ascending", en)).toBe(0);
  });

  it("lists each value once, with its count, in its rows' order", () => {
    // With the first row of each value, to draw it.
    expect(
      columnValues(ROWS, kind, {}, en).map(({ row, ...value }) => ({ ...value, row: row.id }))
    ).toEqual([
      { key: "a", label: "Alpha", count: 3, shown: true, row: "1" },
      { key: "b", label: "Beta", count: 2, shown: true, row: "2" }
    ]);
    // A date's values, the most recent first.
    expect(columnValues(ROWS, at, {}, en).map(({ key, count }) => [key, count])).toEqual([
      ["400", 1],
      ["300", 1],
      ["200", 1],
      ["100", 2]
    ]);
    // The empty value last.
    expect(
      columnValues(ROWS, name, { name: ["Zoë"] }, en).map(({ label, shown }) => [label, shown])
    ).toEqual([
      ["Åsa", true],
      ["table 9", true],
      ["Table 10", true],
      ["Zoë", false],
      ["—", true]
    ]);
  });

  it("hides the rows of the values unchecked, in the columns shown only", () => {
    const filters = withValues(withValues({}, "kind", ["b"], false), "sats", ["20"], false);
    expect(filters).toEqual({ kind: ["b"], sats: ["20"] });
    expect(ids(ROWS.filter(rowFilter([kind, sats], filters)))).toEqual(["1", "5"]);
    // "sats" left out of a narrower table: its filter waits.
    expect(ids(ROWS.filter(rowFilter([kind], filters)))).toEqual(["1", "3", "5"]);
    expect(hidesRows(ROWS, kind, filters)).toBe(true);
    // A value no row shows any more hides nothing.
    expect(hidesRows(ROWS.slice(0, 1), kind, filters)).toBe(false);
  });

  it("shows a value again, and forgets a column whose values are all shown", () => {
    const filters = withValues({}, "kind", ["a", "b"], false);
    expect(ROWS.filter(rowFilter([kind], filters))).toEqual([]);
    expect(withValues(filters, "kind", ["a"], true)).toEqual({ kind: ["b"] });
    expect(withValues(filters, "kind", ["a", "b"], true)).toEqual({});
  });

  it("tells what filters hide beyond the defaults, column by column", () => {
    const defaults = { kind: ["b"] };
    expect(beyondDefaults(defaults, defaults)).toEqual({});
    expect(beyondDefaults({}, defaults)).toEqual({});
    expect(beyondDefaults({ kind: ["a", "b"], sats: ["20"] }, defaults)).toEqual({
      kind: ["a"],
      sats: ["20"]
    });
    expect(beyondDefaults({ sats: ["20"] }, {})).toEqual({ sats: ["20"] });
  });

  it("falls back to the default locale for a malformed tag", () => {
    expect(() => collatorOf("en-US@posix")).not.toThrow();
    expect(collatorOf("en-US@posix").compare("a", "b")).toBe(-1);
  });
});
