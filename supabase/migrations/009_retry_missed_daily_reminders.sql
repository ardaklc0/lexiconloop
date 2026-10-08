create or replace function public.claim_due_daily_reminders()
returns table (user_id uuid, time_zone text, daily_goal smallint, local_date date)
language sql
security definer
set search_path = public, pg_temp
as $$
    with clock as materialized (
        select statement_timestamp() as checked_at
    ), candidates as (
        select
            settings.user_id,
            settings.time_zone,
            settings.daily_goal,
            settings.reminder_time,
            (clock.checked_at at time zone settings.time_zone)::date as local_date,
            date_trunc('minute', clock.checked_at at time zone settings.time_zone)::time as local_time,
            ((clock.checked_at at time zone settings.time_zone)::date::timestamp at time zone settings.time_zone) as local_day_start,
            ((clock.checked_at at time zone settings.time_zone)::date + 1)::timestamp at time zone settings.time_zone as local_day_end
        from public.daily_reminder_settings as settings
        cross join clock
        where settings.enabled
    ), due as (
        select candidates.*
        from candidates
        where candidates.local_time >= date_trunc('minute', candidates.reminder_time)::time
          and exists (
              select 1
              from public.push_subscriptions as subscriptions
              where subscriptions.user_id = candidates.user_id
          )
          and (
              select count(*)
              from public.review_logs as logs
              where logs.user_id = candidates.user_id
                and logs.reviewed_at >= candidates.local_day_start
                and logs.reviewed_at < candidates.local_day_end
          ) < candidates.daily_goal
    ), claimed as (
        update public.daily_reminder_settings as settings
        set last_sent_on = due.local_date,
            updated_at = statement_timestamp()
        from due
        where settings.user_id = due.user_id
          and settings.last_sent_on is distinct from due.local_date
        returning settings.user_id, settings.time_zone, settings.daily_goal, settings.last_sent_on as local_date
    )
    select claimed.user_id, claimed.time_zone, claimed.daily_goal, claimed.local_date
    from claimed;
$$;

revoke all on function public.claim_due_daily_reminders() from public, anon, authenticated;
grant execute on function public.claim_due_daily_reminders() to service_role;