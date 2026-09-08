create extension if not exists "pgcrypto";

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text not null default '',
  color text not null default '#D9A441',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.words (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  folder_id uuid references public.folders(id) on delete set null,
  word text not null,
  meaning text not null default '',
  example_sentence text,
  source_language text not null default 'German',
  target_language text not null default 'Turkish',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.word_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  word_id uuid not null unique references public.words(id) on delete cascade,
  state text not null default 'new' check (state in ('new', 'learning', 'review', 'mastered')),
  stability numeric not null default 0.25,
  difficulty numeric not null default 5,
  due_at timestamptz not null default now(),
  last_review_at timestamptz,
  reps integer not null default 0,
  lapses integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.review_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  word_id uuid not null references public.words(id) on delete cascade,
  rating text not null check (rating in ('forgot', 'know')),
  reviewed_at timestamptz not null default now(),
  previous_state text,
  new_state text,
  previous_due_at timestamptz,
  new_due_at timestamptz
);

alter table public.profiles enable row level security;
alter table public.folders enable row level security;
alter table public.words enable row level security;
alter table public.word_progress enable row level security;
alter table public.review_logs enable row level security;

create policy "Users manage own profile" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "Users manage own folders" on public.folders for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own words" on public.words for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own progress" on public.word_progress for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own review logs" on public.review_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index words_user_id_idx on public.words(user_id);
create index words_folder_id_idx on public.words(folder_id);
create index word_progress_user_due_idx on public.word_progress(user_id, due_at);
create index review_logs_user_reviewed_idx on public.review_logs(user_id, reviewed_at);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username) values (new.id, split_part(coalesce(new.email, 'learner'), '@', 1));
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
