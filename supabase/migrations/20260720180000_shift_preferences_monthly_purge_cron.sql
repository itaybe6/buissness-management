-- Monthly purge: delete shift constraints (shift_preferences) from the previous calendar month.
-- Scheduled via pg_cron on the 1st of each month at 00:00 UTC (03:00 Israel).

create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

create or replace function public.purge_previous_month_shift_preferences()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  month_start date := date_trunc('month', current_date)::date;
  prev_month_start date := (month_start - interval '1 month')::date;
  deleted_count integer;
begin
  delete from public.shift_preferences
  where shift_date >= prev_month_start
    and shift_date < month_start;

  get diagnostics deleted_count = row_count;

  raise log 'purge_previous_month_shift_preferences: deleted % rows (shift_date % .. %)',
    deleted_count, prev_month_start, month_start - 1;

  return deleted_count;
end;
$$;

revoke all on function public.purge_previous_month_shift_preferences() from public;
grant execute on function public.purge_previous_month_shift_preferences() to postgres;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'purge-previous-month-shift-preferences') then
    perform cron.unschedule('purge-previous-month-shift-preferences');
  end if;
end $$;

select cron.schedule(
  'purge-previous-month-shift-preferences',
  '0 0 1 * *',
  $$select public.purge_previous_month_shift_preferences();$$
);
