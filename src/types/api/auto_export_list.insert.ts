// AUTO-GENERATED — do not edit. Run `npm run gen:types` to refresh.

/**
 * @minItems 1
 *
 * This interface was referenced by `AutoExportListInsert`'s JSON-Schema
 * via the `definition` "keys".
 */
export type Keys = [string, ...string[]];

export interface AutoExportListInsert {
  account_id: string;
  created_at?: number;
  email: string;
  export_currency?: string;
  export_type: string;
  id?: string;
  keys: Keys;
  lng: string;
  period: string;
  updated_at?: number;
  [k: string]: unknown;
}
