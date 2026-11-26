/**
 * Sorting and filtering a table by its columns: each column says what a
 * row shows in it, to sort by (`sort`) and to filter by (`value`). A column sorts and filters by
 * what it shows. Pure: no React, no network (how a menu draws a value: useTableView's `ViewColumn`).
 */

export type SortDirection = "ascending" | "descending";

/** How a sortable column names its orders ("A to Z", "Newest to oldest"…). */
export type SortKind = "text" | "number" | "date";

/** The table's order: one column, one direction; null: the rows' own order. */
export type TableSort = { column: string; direction: SortDirection } | null;

/**
 * What a row shows in a column, to sort by: text (compared by the locale's collator), a number or
 * a bigint (amounts in sats, hard rule 3), a date as Unix seconds. null: an empty cell, last in
 * both directions.
 */
export type SortKey = string | number | bigint | null;

/** A value of a column, as its filter lists it. */
export type ColumnValue = {
  /** Tells the values apart: the rows of one key show the same value. */
  key: string;
  /** As the column shows it. */
  label: string;
  /** For screen readers, when the label alone does not say it ("—": "Empty"). */
  spoken?: string;
};

export type TableColumn<Row> = {
  id: string;
  /** Its name, as its header shows it. */
  label: string;
  /** Sortable: what a row shows in it, and how its orders are named. */
  sort?: { kind: SortKind; key: (row: Row) => SortKey };
  /** Filterable by its values: the one a row shows. */
  value?: (row: Row) => ColumnValue;
  /**
   * The order of its values in its filter, by their rows' `sort` keys (the first row of each):
   * ascending unless said (a date's: the most recent first). By label without `sort`.
   */
  valuesOrder?: SortDirection;
};

/** Per column, the keys of the values its filter hides (absent: it hides none). */
export type TableFilters = Readonly<Record<string, readonly string[]>>;

/**
 * A value of a column's filter: how many rows show it, whether they are shown, and the first row
 * that shows it (to draw it: useTableView's `renderValue`).
 */
export type ListedValue<Row> = ColumnValue & { count: number; shown: boolean; row: Row };

const collators = new Map<string, Intl.Collator>();

/**
 * The collator of `languageTag` (shared: creating one is slow, on Hermes above all), comparing
 * digits as numbers ("Table 9" before "Table 10"). A malformed tag: the default locale's.
 */
export function collatorOf(languageTag: string): Intl.Collator {
  let collator = collators.get(languageTag);
  if (!collator) {
    try {
      collator = new Intl.Collator(languageTag, { numeric: true });
    } catch {
      collator = new Intl.Collator(undefined, { numeric: true });
    }
    collators.set(languageTag, collator);
  }
  return collator;
}

/** How two keys of a column compare, in ascending order; neither empty. */
function compareKeys(
  a: string | number | bigint,
  b: string | number | bigint,
  collator: Intl.Collator
) {
  if (typeof a === "string" || typeof b === "string") return collator.compare(String(a), String(b));
  // A number and a bigint compare exactly (no conversion).
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * How two sort keys compare in `direction`: the empty ones last whatever the direction (a "—"
 * never comes first), ties 0.
 */
export function compareSortKeys(
  a: SortKey,
  b: SortKey,
  direction: SortDirection,
  collator: Intl.Collator
): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  const order = compareKeys(a, b, collator);
  return direction === "ascending" ? order : -order;
}

/**
 * The rows in the order of `column` (stable: rows that tie keep their own order); as they are
 * without a sortable column.
 */
export function sortRows<Row>(
  rows: readonly Row[],
  column: TableColumn<Row> | undefined,
  direction: SortDirection,
  collator: Intl.Collator
): readonly Row[] {
  const sort = column?.sort;
  if (!sort) return rows;
  return rows
    .map((row, index) => ({ row, index, key: sort.key(row) }))
    .sort((a, b) => compareSortKeys(a.key, b.key, direction, collator) || a.index - b.index)
    .map(({ row }) => row);
}

/**
 * Whether a row passes the filters of `columns`: each filterable column shows its value. The
 * filters of other columns (left out of a narrower table) are not applied.
 */
export function rowFilter<Row>(
  columns: readonly TableColumn<Row>[],
  filters: TableFilters
): (row: Row) => boolean {
  const applied = columns.flatMap((column) => {
    const hidden = filters[column.id];
    return column.value && hidden && hidden.length > 0
      ? [{ value: column.value, hidden: new Set(hidden) }]
      : [];
  });
  return (row) => applied.every(({ value, hidden }) => !hidden.has(value(row).key));
}

/**
 * The values `column` shows in `rows`, once each, with how many rows show it and whether its
 * filter shows them; in its rows' order (`valuesOrder`, the empty values last), else by label.
 */
export function columnValues<Row>(
  rows: readonly Row[],
  column: TableColumn<Row>,
  filters: TableFilters,
  collator: Intl.Collator
): ListedValue<Row>[] {
  const { value, sort } = column;
  if (!value) return [];
  const hidden = new Set(filters[column.id] ?? []);
  const found = new Map<string, { value: ColumnValue; count: number; key: SortKey; row: Row }>();
  for (const row of rows) {
    const shown = value(row);
    const entry = found.get(shown.key);
    if (entry) entry.count += 1;
    else {
      found.set(shown.key, {
        value: shown,
        count: 1,
        key: sort ? sort.key(row) : shown.label,
        row
      });
    }
  }
  const direction = column.valuesOrder ?? "ascending";
  return [...found.values()]
    .sort((a, b) => compareSortKeys(a.key, b.key, direction, collator))
    .map(({ value: listed, count, row }) => ({
      ...listed,
      count,
      shown: !hidden.has(listed.key),
      row
    }));
}

/** Whether `column`'s filter hides one of `rows`. */
export function hidesRows<Row>(
  rows: readonly Row[],
  column: TableColumn<Row>,
  filters: TableFilters
): boolean {
  const hidden = filters[column.id];
  const { value } = column;
  if (!value || !hidden || hidden.length === 0) return false;
  const keys = new Set(hidden);
  return rows.some((row) => keys.has(value(row).key));
}

/**
 * What `filters` hides beyond `defaults` (a table's normal state, not a filter: useTableView's
 * `defaultFilters`), column by column; the columns that hide nothing more left out.
 */
export function beyondDefaults(filters: TableFilters, defaults: TableFilters): TableFilters {
  return Object.fromEntries(
    Object.entries(filters).flatMap(([column, hidden]) => {
      const normal = new Set(defaults[column] ?? []);
      const more = hidden.filter((key) => !normal.has(key));
      return more.length > 0 ? [[column, more]] : [];
    })
  );
}

/** `filters` with `keys` of `column` shown (`shown`) or hidden. */
export function withValues(
  filters: TableFilters,
  column: string,
  keys: readonly string[],
  shown: boolean
): TableFilters {
  const hidden = new Set(filters[column] ?? []);
  for (const key of keys) {
    if (shown) hidden.delete(key);
    else hidden.add(key);
  }
  const others = Object.fromEntries(Object.entries(filters).filter(([id]) => id !== column));
  return hidden.size === 0 ? others : { ...others, [column]: [...hidden] };
}
