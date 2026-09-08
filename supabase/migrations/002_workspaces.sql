create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

alter table public.folders add column workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.words add column workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.word_progress add column workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.review_logs add column workspace_id uuid references public.workspaces(id) on delete cascade;

insert into public.workspaces (owner_id, name)
select id, coalesce(nullif(username, ''), 'My workspace') from public.profiles;

insert into public.workspace_members (workspace_id, user_id, role)
select id, owner_id, 'owner' from public.workspaces;

update public.folders f set workspace_id = w.id from public.workspaces w where w.owner_id = f.user_id and f.workspace_id is null;
update public.words w set workspace_id = ws.id from public.workspaces ws where ws.owner_id = w.user_id and w.workspace_id is null;
update public.word_progress p set workspace_id = ws.id from public.workspaces ws where ws.owner_id = p.user_id and p.workspace_id is null;
update public.review_logs l set workspace_id = ws.id from public.workspaces ws where ws.owner_id = l.user_id and l.workspace_id is null;

alter table public.folders alter column workspace_id set not null;
alter table public.words alter column workspace_id set not null;
alter table public.word_progress alter column workspace_id set not null;
alter table public.review_logs alter column workspace_id set not null;

create index workspaces_owner_id_idx on public.workspaces(owner_id);
create index workspace_members_user_id_idx on public.workspace_members(user_id);
create index folders_workspace_id_idx on public.folders(workspace_id);
create index words_workspace_id_idx on public.words(workspace_id);
create index word_progress_workspace_due_idx on public.word_progress(workspace_id, due_at);
create index review_logs_workspace_reviewed_idx on public.review_logs(workspace_id, reviewed_at);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace_id and user_id = auth.uid()
  );
$$;

create policy "Members can read workspaces" on public.workspaces for select using (public.is_workspace_member(id));
create policy "Owners manage workspaces" on public.workspaces for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "Members can read membership" on public.workspace_members for select using (user_id = auth.uid() or public.is_workspace_member(workspace_id));
create policy "Owners manage membership" on public.workspace_members for all using (exists (select 1 from public.workspaces where id = workspace_id and owner_id = auth.uid())) with check (exists (select 1 from public.workspaces where id = workspace_id and owner_id = auth.uid()));

drop policy "Users manage own folders" on public.folders;
drop policy "Users manage own words" on public.words;
drop policy "Users manage own progress" on public.word_progress;
drop policy "Users manage own review logs" on public.review_logs;

create policy "Members manage workspace folders" on public.folders for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id) and auth.uid() = user_id);
create policy "Members manage workspace words" on public.words for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id) and auth.uid() = user_id);
create policy "Members manage workspace progress" on public.word_progress for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id) and auth.uid() = user_id);
create policy "Members manage workspace review logs" on public.review_logs for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id) and auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  new_workspace_id uuid;
begin
  insert into public.profiles (id, username) values (new.id, split_part(coalesce(new.email, 'learner'), '@', 1));
  insert into public.workspaces (owner_id, name) values (new.id, 'My workspace') returning id into new_workspace_id;
  insert into public.workspace_members (workspace_id, user_id, role) values (new_workspace_id, new.id, 'owner');
  return new;
end;
$$;
