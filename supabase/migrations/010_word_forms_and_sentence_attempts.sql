-- Grammar forms (article, plural, verb tenses, inflected surface forms) filled in lazily by the app.
-- Nullable on purpose: words added without it (for example from the Kobo page) keep working.
alter table public.words
  add column if not exists forms jsonb;

-- Sentences the learner wrote with a word, plus the AI feedback they received.
create table if not exists public.sentence_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  word_id uuid not null references public.words(id) on delete cascade,
  sentence text not null,
  corrected text,
  is_natural boolean,
  cefr_estimate text check (cefr_estimate is null or cefr_estimate in ('A1', 'A2', 'B1', 'B2', 'C1')),
  errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.sentence_attempts enable row level security;

create policy "Users manage own sentence attempts" on public.sentence_attempts
  for all using (auth.uid() = user_id and public.is_workspace_member(workspace_id))
  with check (auth.uid() = user_id and public.is_workspace_member(workspace_id));

create index if not exists sentence_attempts_word_idx on public.sentence_attempts(word_id, created_at desc);
create index if not exists sentence_attempts_workspace_idx on public.sentence_attempts(workspace_id, created_at desc);
