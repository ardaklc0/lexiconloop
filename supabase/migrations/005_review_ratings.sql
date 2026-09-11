alter table public.review_logs
  drop constraint if exists review_logs_rating_check;

update public.review_logs
set rating = 'good'
where rating = 'know';

alter table public.review_logs
  add constraint review_logs_rating_check
  check (rating in ('forgot', 'hard', 'good', 'easy'));
