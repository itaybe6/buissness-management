-- תפקידים מרובים לעובד (employee_positions)
--
-- עובד יכול להיות גם אחראי משמרת (שעתי 45 ₪) וגם מלצר (טיפים, מינימום 35 ₪).
-- כל תפקיד נושא הרשאה (role), מחלקה, סוג שכר, תעריף ואחוז קופה משלו.
-- בהחתמת כניסה העובד בוחר באיזה תפקיד הוא נכנס — הבחירה נשמרת על שורת
-- הנוכחות (attendance.position_id) וזורמת לטיפים ולתוספות הקופה, וכך עמוד
-- השכר ודוח האקסל מציגים שורה נפרדת לכל תפקיד.
--
-- שדות profiles.role / department_id / wage_type / hourly_rate / bonus_pct
-- ממשיכים להתקיים כ"תפקיד ראשי" (מסונכרן אוטומטית ע"י טריגר) — הם קובעים את
-- הרשאת הגישה למערכת ומשמשים fallback לקוד ישן.

create table if not exists public.employee_positions (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  employee_id   uuid not null references public.profiles(id) on delete cascade,
  role          public.user_role not null default 'employee',
  department_id uuid references public.departments(id) on delete set null,
  wage_type     text not null default 'hourly' check (wage_type in ('hourly', 'tips')),
  hourly_rate   numeric(10,2) not null default 35.4,
  bonus_pct     numeric(5,2) not null default 0,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_employee_positions_business on public.employee_positions(business_id);
create index if not exists idx_employee_positions_employee on public.employee_positions(employee_id, sort_order);

comment on table public.employee_positions is 'תפקידי העובד — כל תפקיד עם הרשאה, מחלקה וסוג שכר משלו. עובד יכול להחזיק כמה תפקידים.';

drop trigger if exists trg_employee_positions_updated on public.employee_positions;
create trigger trg_employee_positions_updated
  before update on public.employee_positions
  for each row execute function public.set_updated_at();

-- קישור כל שורת נוכחות / טיפ / תוספת קופה לתפקיד שבו נעבדה המשמרת
alter table public.attendance
  add column if not exists position_id uuid references public.employee_positions(id) on delete set null;
alter table public.tips
  add column if not exists position_id uuid references public.employee_positions(id) on delete set null;
alter table public.shift_bonuses
  add column if not exists position_id uuid references public.employee_positions(id) on delete set null;

create index if not exists idx_attendance_position on public.attendance(position_id);
create index if not exists idx_tips_position on public.tips(position_id);
create index if not exists idx_shift_bonuses_position on public.shift_bonuses(position_id);

-- ----------------------------------------------------------------------------
-- דירוג הרשאות: התפקיד עם הדירוג הנמוך ביותר הוא הראשי וקובע את profiles.role
-- ----------------------------------------------------------------------------
create or replace function public.position_role_rank(r public.user_role)
returns integer language sql immutable as $$
  select case r
    when 'super_admin'    then 0
    when 'manager'        then 1
    when 'office_manager' then 2
    when 'shift_manager'  then 3
    when 'event_manager'  then 4
    when 'employee'       then 5
    when 'maintenance'    then 6
    else 9
  end
$$;

-- סנכרון שדות התפקיד הראשי אל profiles אחרי כל שינוי בתפקידים
create or replace function public.sync_profile_from_positions(p_employee_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
begin
  select * into p
  from public.employee_positions
  where employee_id = p_employee_id
  order by public.position_role_rank(role), sort_order, created_at
  limit 1;

  if p is null then
    return;
  end if;

  update public.profiles
  set role = p.role,
      department_id = p.department_id,
      wage_type = p.wage_type,
      hourly_rate = p.hourly_rate,
      bonus_pct = p.bonus_pct
  where id = p_employee_id
    and (
      role is distinct from p.role
      or department_id is distinct from p.department_id
      or wage_type is distinct from p.wage_type
      or hourly_rate is distinct from p.hourly_rate
      or bonus_pct is distinct from p.bonus_pct
    );
end $$;

create or replace function public.handle_employee_position_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.sync_profile_from_positions(old.employee_id);
    return old;
  end if;
  perform public.sync_profile_from_positions(new.employee_id);
  return new;
end $$;

drop trigger if exists trg_employee_positions_sync on public.employee_positions;
create trigger trg_employee_positions_sync
  after insert or update or delete on public.employee_positions
  for each row execute function public.handle_employee_position_change();

-- ----------------------------------------------------------------------------
-- משתמש חדש: יצירת תפקיד ראשי מתוך המטא-דאטה (הלקוח יכול להחליף אותו ברשימה מלאה)
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_business_id uuid := (new.raw_user_meta_data->>'business_id')::uuid;
  v_role public.user_role := coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'employee');
  v_department_id uuid := (new.raw_user_meta_data->>'department_id')::uuid;
  v_hourly_rate numeric := coalesce((new.raw_user_meta_data->>'hourly_rate')::numeric, 35.4);
  v_wage_type text := coalesce(new.raw_user_meta_data->>'wage_type', 'hourly');
begin
  insert into public.profiles (id, email, full_name, business_id, role, department_id, phone, hourly_rate, wage_type, pension_active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    v_business_id,
    v_role,
    v_department_id,
    new.raw_user_meta_data->>'phone',
    v_hourly_rate,
    v_wage_type,
    coalesce((new.raw_user_meta_data->>'pension_active')::boolean, false)
  );

  if v_business_id is not null and v_role <> 'super_admin' then
    insert into public.employee_positions (business_id, employee_id, role, department_id, wage_type, hourly_rate, bonus_pct, sort_order)
    values (v_business_id, new.id, v_role, v_department_id, v_wage_type, v_hourly_rate, 0, 0);
  end if;

  return new;
end; $$;

-- ----------------------------------------------------------------------------
-- Backfill: תפקיד אחד לכל עובד קיים מתוך שדות הפרופיל, וקישור הנתונים ההיסטוריים
-- ----------------------------------------------------------------------------
insert into public.employee_positions (business_id, employee_id, role, department_id, wage_type, hourly_rate, bonus_pct, sort_order)
select p.business_id, p.id, p.role, p.department_id, p.wage_type, coalesce(p.hourly_rate, 35.4), coalesce(p.bonus_pct, 0), 0
from public.profiles p
where p.business_id is not null
  and p.role <> 'super_admin'
  and not exists (select 1 from public.employee_positions ep where ep.employee_id = p.id);

update public.attendance a
set position_id = ep.id
from public.employee_positions ep
where a.position_id is null
  and ep.employee_id = a.employee_id
  and ep.business_id = a.business_id
  and (select count(*) from public.employee_positions x where x.employee_id = a.employee_id) = 1;

update public.tips t
set position_id = ep.id
from public.employee_positions ep
where t.position_id is null
  and ep.employee_id = t.employee_id
  and ep.business_id = t.business_id
  and (select count(*) from public.employee_positions x where x.employee_id = t.employee_id) = 1;

update public.shift_bonuses b
set position_id = ep.id
from public.employee_positions ep
where b.position_id is null
  and ep.employee_id = b.employee_id
  and ep.business_id = b.business_id
  and (select count(*) from public.employee_positions x where x.employee_id = b.employee_id) = 1;

-- ----------------------------------------------------------------------------
-- RLS: כל חברי העסק קוראים; מנהל / מנהלת משרד / סופר-אדמין עורכים
-- ----------------------------------------------------------------------------
alter table public.employee_positions enable row level security;

drop policy if exists "employee_positions_read" on public.employee_positions;
create policy "employee_positions_read" on public.employee_positions
  for select using (public.can_access(business_id));

drop policy if exists "employee_positions_manage" on public.employee_positions;
create policy "employee_positions_manage" on public.employee_positions
  for all using (
    public.can_access(business_id)
    and (public.is_super_admin() or public.auth_role() in ('manager', 'office_manager'))
  ) with check (
    public.can_access(business_id)
    and (public.is_super_admin() or public.auth_role() in ('manager', 'office_manager'))
  );
