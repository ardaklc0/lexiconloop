-- Repair records created before workspace scoping was fully applied.
-- A word belongs to the same workspace as its folder.
update public.words w
set workspace_id = f.workspace_id
from public.folders f
where w.folder_id = f.id
  and w.workspace_id is distinct from f.workspace_id;

update public.word_progress p
set workspace_id = w.workspace_id
from public.words w
where p.word_id = w.id
  and p.workspace_id is distinct from w.workspace_id;

update public.review_logs l
set workspace_id = w.workspace_id
from public.words w
where l.word_id = w.id
  and l.workspace_id is distinct from w.workspace_id;

create index if not exists words_folder_workspace_idx
  on public.words(folder_id, workspace_id);
