alter table public.daily_reminder_settings
    drop constraint if exists daily_reminder_settings_daily_goal_check;

alter table public.daily_reminder_settings
    add constraint daily_reminder_settings_daily_goal_check
    check (daily_goal > 0);