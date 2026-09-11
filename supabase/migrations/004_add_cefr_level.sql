alter table public.words
  add column if not exists cefr_level text;

alter table public.words
  add constraint words_cefr_level_check
  check (cefr_level is null or cefr_level in ('A1', 'A2', 'B1', 'B2', 'C1'));
