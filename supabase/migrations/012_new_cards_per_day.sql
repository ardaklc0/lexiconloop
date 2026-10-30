-- How many new words may start per day. Reviews are never limited; new words beyond the limit wait.
-- null means no limit. Existing rows get the default of 10.
alter table public.daily_reminder_settings
  add column if not exists new_cards_per_day smallint default 10
  check (new_cards_per_day is null or new_cards_per_day between 0 and 500);
