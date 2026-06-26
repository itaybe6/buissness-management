-- ============================================================================
-- הרצה חד-פעמית אחרי schema.sql — משחזר את Itay + עסק + מודולים
-- Supabase Dashboard → SQL Editor → Run
-- ============================================================================

-- עסק
insert into public.businesses (id, name, active, created_by)
values (
  '044389b9-62b4-4f8b-ab05-6b069b9a2d3e',
  'עסק של Itay',
  true,
  'b5e8fca3-e777-4638-892c-d2e5eb62a541'
)
on conflict (id) do update set name = excluded.name;

-- מודולים פעילים (הכל)
insert into public.business_features (business_id, feature_key, enabled) values
  ('044389b9-62b4-4f8b-ab05-6b069b9a2d3e', 'agreements', true),
  ('044389b9-62b4-4f8b-ab05-6b069b9a2d3e', 'forms', true),
  ('044389b9-62b4-4f8b-ab05-6b069b9a2d3e', 'shifts', true),
  ('044389b9-62b4-4f8b-ab05-6b069b9a2d3e', 'payroll', true),
  ('044389b9-62b4-4f8b-ab05-6b069b9a2d3e', 'attendance', true),
  ('044389b9-62b4-4f8b-ab05-6b069b9a2d3e', 'inventory', true),
  ('044389b9-62b4-4f8b-ab05-6b069b9a2d3e', 'faults', true),
  ('044389b9-62b4-4f8b-ab05-6b069b9a2d3e', 'events', true),
  ('044389b9-62b4-4f8b-ab05-6b069b9a2d3e', 'tasks', true)
on conflict (business_id, feature_key) do update set enabled = excluded.enabled;

-- פרופיל Itay (מנהל)
insert into public.profiles (id, email, full_name, role, business_id)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'full_name', 'Itay Ben Yair'),
  'manager'::public.user_role,
  '044389b9-62b4-4f8b-ab05-6b069b9a2d3e'::uuid
from auth.users u
where u.email = 'itaybenyair99@gmail.com'
on conflict (id) do update set
  role = 'manager',
  business_id = '044389b9-62b4-4f8b-ab05-6b069b9a2d3e',
  full_name = coalesce(excluded.full_name, public.profiles.full_name);

-- פרופיל Liron (מנהלת משרד) — חייב business_id כדי להופיע במסך משתמשים
insert into public.profiles (id, email, full_name, role, business_id)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'full_name', 'Liron Huri'),
  'office_manager'::public.user_role,
  '044389b9-62b4-4f8b-ab05-6b069b9a2d3e'::uuid
from auth.users u
where u.email = 'lironhuri123@gmail.com'
on conflict (id) do update set
  role = 'office_manager',
  business_id = '044389b9-62b4-4f8b-ab05-6b069b9a2d3e',
  full_name = coalesce(excluded.full_name, public.profiles.full_name);

-- מחלקות לדוגמה
insert into public.departments (business_id, name, color, sort_order) values
  ('044389b9-62b4-4f8b-ab05-6b069b9a2d3e', 'מטבח', '#ef4444', 0),
  ('044389b9-62b4-4f8b-ab05-6b069b9a2d3e', 'בר', '#2563eb', 1),
  ('044389b9-62b4-4f8b-ab05-6b069b9a2d3e', 'מלצרות', '#7c3aed', 2);

-- משמרות ברירת מחדל (נוצרות אוטומטית גם בטריגר; כאן לעסק Itay)
select public.seed_default_shift_templates('044389b9-62b4-4f8b-ab05-6b069b9a2d3e'::uuid);

-- RLS: מנהל יכול לעדכן הגדרות עסק (מיקום)
drop policy if exists "businesses_manager_update" on public.businesses;
create policy "businesses_manager_update" on public.businesses
  for update using (
    id = public.auth_business_id() and public.auth_role() = 'manager'
  ) with check (id = public.auth_business_id());
