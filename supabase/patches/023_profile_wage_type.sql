-- 023: סוג שכר לעובד — שעתי (hourly) או טיפים (tips).
-- עובד שעתי: שעות × תעריף. עובד טיפים: מקבל מהקופה המשותפת,
-- כשהתעריף השעתי שלו (hourly_rate) הוא רצפת המינימום לכל משמרת.

alter table public.profiles
  add column if not exists wage_type text not null default 'hourly';

alter table public.profiles
  drop constraint if exists profiles_wage_type_check;

alter table public.profiles
  add constraint profiles_wage_type_check check (wage_type in ('hourly', 'tips'));

-- מירור הטריגר ליצירת משתמש כך שיקרא wage_type מה-metadata
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, business_id, role, department_id, phone, hourly_rate, wage_type)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    (new.raw_user_meta_data->>'business_id')::uuid,
    coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'employee'),
    (new.raw_user_meta_data->>'department_id')::uuid,
    new.raw_user_meta_data->>'phone',
    coalesce((new.raw_user_meta_data->>'hourly_rate')::numeric, 0),
    coalesce(new.raw_user_meta_data->>'wage_type', 'hourly')
  );
  return new;
end; $$;
