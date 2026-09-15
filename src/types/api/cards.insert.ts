// AUTO-GENERATED — do not edit. Run `npm run gen:types` to refresh.

export interface CardsInsert {
  card_design_id?: null | string;
  created_at?: number;
  currency?: null | string;
  deposit_address: string;
  id?: string;
  language?: null | string;
  locked?: boolean;
  recovery_email?: null | string;
  two_fa_notification_threshold?: null | number;
  unique_hash?: null | string;
  updated_at?: number;
  used?: number;
  user_id: string;
  wallet_id: string;
  web_push_id?: null | string;
  [k: string]: unknown;
}
