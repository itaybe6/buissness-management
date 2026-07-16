-- Enforce Israeli weekly day-off: max 6 distinct assigned calendar days per Sunday–Saturday week.

create or replace function public.enforce_shift_assignment_weekly_day_off()
returns trigger
language plpgsql
as $$
declare
  wk date;
  week_end date;
  distinct_days integer;
begin
  -- Match client weekStart(): Sunday = 0 (PostgreSQL DOW).
  wk := new.shift_date - extract(dow from new.shift_date)::integer;
  week_end := wk + 6;

  select count(*)::integer into distinct_days
  from (
    select sa.shift_date
    from public.shift_assignments sa
    where sa.employee_id = new.employee_id
      and sa.shift_date >= wk
      and sa.shift_date <= week_end
      and sa.id is distinct from new.id
    union
    select new.shift_date
  ) as days;

  if distinct_days > 6 then
    raise exception 'WEEKLY_DAY_OFF_REQUIRED'
      using hint = 'Employee cannot be assigned more than 6 distinct days in a week';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_shift_assignment_weekly_day_off on public.shift_assignments;

create trigger trg_shift_assignment_weekly_day_off
  before insert or update of employee_id, shift_date
  on public.shift_assignments
  for each row
  execute function public.enforce_shift_assignment_weekly_day_off();
