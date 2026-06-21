-- Compute the signed-in user's current consecutive check-in streak.
-- A streak requires at least one check-in today, then counts contiguous
-- local Charlotte nightlife dates backwards.
create or replace function public.get_user_streak(user_id uuid)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  first_missed_day_offset int;
begin
  with distinct_check_in_days as (
    select distinct (created_at at time zone 'America/New_York')::date as check_in_day
    from public.check_ins
    where public.check_ins.user_id = get_user_streak.user_id
  ),
  candidate_days as (
    select
      day::date as check_in_day,
      row_number() over (order by day desc) - 1 as day_offset
    from generate_series(
      (now() at time zone 'America/New_York')::date,
      (now() at time zone 'America/New_York')::date - interval '365 days',
      interval '-1 day'
    ) as day
  )
  select min(candidate_days.day_offset)
  into first_missed_day_offset
  from candidate_days
  where not exists (
    select 1
    from distinct_check_in_days
    where distinct_check_in_days.check_in_day = candidate_days.check_in_day
  );

  return coalesce(first_missed_day_offset, 366);
end;
$$;

grant execute on function public.get_user_streak(uuid) to authenticated;
