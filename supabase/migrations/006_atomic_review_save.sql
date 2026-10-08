create or replace function public.save_review(
    p_workspace_id uuid,
    p_word_id uuid,
    p_rating text,
    p_new_state text,
    p_stability numeric,
    p_difficulty numeric,
    p_due_at timestamptz,
    p_reviewed_at timestamptz,
    p_reps integer,
    p_lapses integer,
    p_previous_state text,
    p_previous_due_at timestamptz
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
    if auth.uid() is null then
        raise exception 'You must be signed in.' using errcode = '42501';
    end if;

    if p_rating not in ('forgot', 'hard', 'good', 'easy') then
        raise exception 'Invalid review rating.' using errcode = '22023';
    end if;

    if p_new_state not in ('new', 'learning', 'review', 'mastered') then
        raise exception 'Invalid card state.' using errcode = '22023';
    end if;

    if not exists (
        select 1
        from public.words
        where id = p_word_id
          and user_id = auth.uid()
          and workspace_id = p_workspace_id
    ) then
        raise exception 'Word not found in this workspace.' using errcode = 'P0002';
    end if;

    insert into public.word_progress as existing_progress (
        user_id,
        workspace_id,
        word_id,
        state,
        stability,
        difficulty,
        due_at,
        last_review_at,
        reps,
        lapses,
        updated_at
    ) values (
        auth.uid(),
        p_workspace_id,
        p_word_id,
        p_new_state,
        p_stability,
        p_difficulty,
        p_due_at,
        p_reviewed_at,
        p_reps,
        p_lapses,
        now()
    )
    on conflict (word_id) do update set
        state = excluded.state,
        stability = excluded.stability,
        difficulty = excluded.difficulty,
        due_at = excluded.due_at,
        last_review_at = excluded.last_review_at,
        reps = excluded.reps,
        lapses = excluded.lapses,
        updated_at = excluded.updated_at
    where existing_progress.user_id = auth.uid()
      and existing_progress.workspace_id = p_workspace_id;

    if not found then
        raise exception 'Review progress could not be updated.' using errcode = '42501';
    end if;

    insert into public.review_logs (
        user_id,
        workspace_id,
        word_id,
        rating,
        reviewed_at,
        previous_state,
        new_state,
        previous_due_at,
        new_due_at
    ) values (
        auth.uid(),
        p_workspace_id,
        p_word_id,
        p_rating,
        p_reviewed_at,
        p_previous_state,
        p_new_state,
        p_previous_due_at,
        p_due_at
    );
end;
$$;

revoke all on function public.save_review(uuid, uuid, text, text, numeric, numeric, timestamptz, timestamptz, integer, integer, text, timestamptz) from public;
grant execute on function public.save_review(uuid, uuid, text, text, numeric, numeric, timestamptz, timestamptz, integer, integer, text, timestamptz) to authenticated;