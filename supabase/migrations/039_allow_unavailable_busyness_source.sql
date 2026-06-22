alter table public.venue_signals
  drop constraint if exists venue_signals_busyness_source_check;

alter table public.venue_signals
  add constraint venue_signals_busyness_source_check
  check (
    busyness_source is null
    or busyness_source in ('live', 'forecast', 'crowd', 'unavailable')
  );

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'venues'
      and column_name = 'busyness_source'
  ) then
    alter table public.venues
      drop constraint if exists venues_busyness_source_check;

    alter table public.venues
      add constraint venues_busyness_source_check
      check (
        busyness_source is null
        or busyness_source in ('live', 'forecast', 'crowd', 'unavailable')
      );
  end if;
end $$;
