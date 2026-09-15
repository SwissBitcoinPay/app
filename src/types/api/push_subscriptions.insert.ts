// AUTO-GENERATED — do not edit. Run `npm run gen:types` to refresh.

export interface PushSubscriptionsInsert {
  card_id?: null | string;
  created_at?: number;
  data: Data;
  id?: string;
  type: string;
  user_id?: null | string;
  [k: string]: unknown;
}
/**
 * This interface was referenced by `PushSubscriptionsInsert`'s JSON-Schema
 * via the `definition` "data".
 */
export interface Data {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    auth: string;
    p256dh: string;
  };
}
