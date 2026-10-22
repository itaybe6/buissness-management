-- שעות משמרת לפי יום בשבוע (0 = ראשון … 6 = שבת).
-- יום בלי שורה = המשמרת לא רצה ביום הזה.
-- משמרת בלי אף שורה ממשיכה לרוץ כל השבוע לפי start_time/end_time שלה.

create table if not exists public.shift_template_days (
  shift_template_id uuid not null references public.shift_templates(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  primary key (shift_template_id, day_of_week)
);

alter table public.shift_template_days enable row level security;

drop policy if exists "shift_template_days_tenant" on public.shift_template_days;
create policy "shift_template_days_tenant" on public.shift_template_days
  for all
  using (
    exists (
      select 1 from public.shift_templates st
      where st.id = shift_template_id and public.can_access(st.business_id)
    )
  )
  with check (
    exists (
      select 1 from public.shift_templates st
      where st.id = shift_template_id and public.can_access(st.business_id)
    )
  );

-- משמרות מוגדרות ידנית לכל מחלקה. אין יותר זריעה אוטומטית של בוקר/צהריים/ערב/לילה.
create or replace function public.seed_default_shift_templates(p_business_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  return;
end;
$$;
