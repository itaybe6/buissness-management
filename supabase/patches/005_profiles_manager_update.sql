-- Allow business managers to update employee profiles (role, department, pay, active)
-- Run once in Supabase Dashboard → SQL Editor if not applied via schema.sql

drop policy if exists "profiles_manager_update" on public.profiles;
create policy "profiles_manager_update" on public.profiles
  for update using (
    business_id = public.auth_business_id() and public.auth_role() = 'manager'
  ) with check (
    business_id = public.auth_business_id()
  );
