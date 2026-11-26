import { useState, type ReactNode } from "react";

import {
  beyondDefaults,
  collatorOf,
  columnValues,
  hidesRows,
  rowFilter,
  sortRows,
  withValues,
  type ListedValue,
  type SortDirection,
  type SortKind,
  type TableColumn,
  type TableFilters,
  type TableSort
} from "@/lib/table";

/**
 * A table's column (src/lib/table.ts) and how its filter draws a value (`renderValue`), from the
 * first row that shows it, as the table draws it (its icon, its avatar, its pill); its label in plain text without it.
 */
export type ViewColumn<Row> = TableColumn<Row> & { renderValue?: (row: Row) => ReactNode };

/** A value of a column's filter, as its menu lists it. */
export type ColumnEntry = Omit<ListedValue<unknown>, "row"> & { view: ReactNode | null };

/** What a column's header shows of the table's order and filters, and what its menu changes. */
export type ColumnControl = {
  id: string;
  label: string;
  /** How its orders are named; null: not sortable. */
  sortKind: SortKind | null;
  filterable: boolean;
  /** Its order, when the table is sorted by it. */
  sorted: SortDirection | null;
  /** Its filter hides one of the rows, beyond what the table hides by default. */
  filtered: boolean;
  /**
   * Its values, with their counts and how its filter draws each (`view`: the column's
   * `renderValue`, null for its label as text): read when asked (its menu shows).
   */
  values: () => ColumnEntry[];
  /** Sorts the table by it; null: the rows' own order again. */
  sortBy: (direction: SortDirection | null) => void;
  /** Shows (or hides) the rows of these values. */
  show: (keys: readonly string[], shown: boolean) => void;
};

export type TableView<Row> = {
  /** In the order chosen. */
  rows: readonly Row[];
  /** Whether a row passes the filters. */
  shown: (row: Row) => boolean;
  /** A filter hides one of the rows, beyond what the table hides by default. */
  filtering: boolean;
  /** Back to the table's normal state: what it hides by default only. */
  clearFilters: () => void;
  /** The header's control of one of the table's columns. */
  header: (column: ViewColumn<Row>) => ColumnControl;
};

/** No value hidden by default. */
const NO_FILTERS: TableFilters = {};

/**
 * Sorting and filtering a table by its columns: one column's order at a
 * time, the values each column hides (src/lib/table.ts). Only the `columns` shown count: a column
 * left out of a narrower table keeps its order and filter for when it shows again, without them
 * applying meanwhile (nothing hidden by what cannot be seen). Kept while the screen stays mounted;
 * new rows show unless their value was unchecked. Text compares in `languageTag`, the device's.
 * `defaultFilters` (a constant): the values the table hides by default, its normal state, not a
 * filter (no expired invoice in "Wallet"'s table): unchecked in
 * their menu, but no header says "filtered" for them, and "Clear filters" leaves them
 * hidden. Checked, they show until the table is mounted again.
 */
export function useTableView<Row>(
  rows: readonly Row[],
  columns: readonly ViewColumn<Row>[],
  languageTag: string,
  defaultFilters: TableFilters = NO_FILTERS
): TableView<Row> {
  const [sort, setSort] = useState<TableSort>(null);
  const [filters, setFilters] = useState<TableFilters>(defaultFilters);
  const collator = collatorOf(languageTag);
  const sortedBy = sort ? columns.find((column) => column.id === sort.column && column.sort) : null;
  const sorted = sort && sortedBy ? sortRows(rows, sortedBy, sort.direction, collator) : rows;
  const beyond = beyondDefaults(filters, defaultFilters);
  const filtered = new Set(
    columns.filter((column) => hidesRows(rows, column, beyond)).map(({ id }) => id)
  );

  const header = (column: ViewColumn<Row>): ColumnControl => ({
    id: column.id,
    label: column.label,
    sortKind: column.sort?.kind ?? null,
    filterable: column.value !== undefined,
    sorted: sortedBy?.id === column.id && sort ? sort.direction : null,
    filtered: filtered.has(column.id),
    values: () =>
      columnValues(rows, column, filters, collator).map(({ row, ...value }) => ({
        ...value,
        view: column.renderValue ? column.renderValue(row) : null
      })),
    sortBy: (direction) => setSort(direction ? { column: column.id, direction } : null),
    show: (keys, shown) => setFilters((current) => withValues(current, column.id, keys, shown))
  });

  return {
    rows: sorted,
    shown: rowFilter(columns, filters),
    filtering: filtered.size > 0,
    clearFilters: () => setFilters(defaultFilters),
    header
  };
}
