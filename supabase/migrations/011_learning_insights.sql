-- Cached AI data per word. Both nullable: words without it keep working.
alter table public.words
  add column if not exists word_family jsonb,
  add column if not exists cloze_sentences jsonb;

-- One row per typed answer in the review (reverse, fill-the-gap and grammar questions).
-- Feeds the weekly summary ("most mistakes are with articles").
create table if not exists public.grammar_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  word_id uuid not null references public.words(id) on delete cascade,
  mode text not null check (mode in ('reverse', 'cloze', 'form')),
  form_kind text check (form_kind is null or form_kind in ('article', 'plural', 'perfect', 'pastSimple', 'prefix')),
  grade text not null check (grade in ('exact', 'accent', 'close', 'wrong')),
  skipped boolean not null default false,
  created_at timestamptz not null default now()
);

-- AI weekly summary, cached so it is generated at most once per week unless refreshed.
create table if not exists public.weekly_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  week_start date not null,
  summary jsonb not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, week_start)
);

alter table public.grammar_attempts enable row level security;
alter table public.weekly_summaries enable row level security;

create policy "Users manage own grammar attempts" on public.grammar_attempts
  for all using (auth.uid() = user_id and public.is_workspace_member(workspace_id))
  with check (auth.uid() = user_id and public.is_workspace_member(workspace_id));

create policy "Users manage own weekly summaries" on public.weekly_summaries
  for all using (auth.uid() = user_id and public.is_workspace_member(workspace_id))
  with check (auth.uid() = user_id and public.is_workspace_member(workspace_id));

create index if not exists grammar_attempts_workspace_idx on public.grammar_attempts(workspace_id, created_at desc);
create index if not exists grammar_attempts_word_idx on public.grammar_attempts(word_id);
create index if not exists weekly_summaries_workspace_idx on public.weekly_summaries(workspace_id, week_start desc);
