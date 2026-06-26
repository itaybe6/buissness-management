-- Migrate shift_preferences / shift_assignments from period enum to shift_template_id
-- Required for the shifts UI which saves by template, not period.

-- shift_preferences
alter table public.shift_preferences
  add column if not exists shift_template_id uuid references public.shift_templates(id) on delete cascade;

-- Backfill any legacy rows (period -> template via shift_key)
update public.shift_preferences sp
set shift_template_id = st.id
from public.shift_templates st
where sp.shift_template_id is null
  and st.business_id = sp.business_id
  and st.shift_key = case sp.period::text
    when 'morning' then 'morning'
    when 'noon' then 'afternoon'
    when 'evening' then 'evening'
    else sp.period::text
  end;

alter table public.shift_preferences drop column if exists period;
alter table public.shift_preferences alter column shift_template_id set not null;

alter table public.shift_preferences
  drop constraint if exists shift_preferences_employee_id_shift_date_period_key;

alter table public.shift_preferences
  drop constraint if exists shift_preferences_employee_id_shift_date_shift_template_id_key;

alter table public.shift_preferences
  add constraint shift_preferences_employee_shift_unique
  unique (employee_id, shift_date, shift_template_id);

-- shift_assignments
alter table public.shift_assignments
  add column if not exists department_id uuid references public.departments(id) on delete cascade;

alter table public.shift_assignments
  add column if not exists shift_template_id uuid references public.shift_templates(id) on delete cascade;

update public.shift_assignments sa
set shift_template_id = st.id
from public.shift_templates st
where sa.shift_template_id is null
  and st.business_id = sa.business_id
  and st.shift_key = case sa.period::text
    when 'morning' then 'morning'
    when 'noon' then 'afternoon'
    when 'evening' then 'evening'
    else sa.period::text
  end;

alter table public.shift_assignments drop column if exists period;
alter table public.shift_assignments alter column shift_template_id set not null;

alter table public.shift_assignments
  drop constraint if exists shift_assignments_employee_id_shift_date_period_key;

alter table public.shift_assignments
  drop constraint if exists shift_assignments_employee_id_shift_date_shift_template_id_key;

alter table public.shift_assignments
  add constraint shift_assignments_employee_shift_unique
  unique (employee_id, shift_date, shift_template_id);
