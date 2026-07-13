-- Allow office_manager to update employee profiles in their business (same as manager)
drop policy if exists "profiles_manager_update" on public.profiles;

create policy "profiles_manager_update" on public.profiles
  for update using (
    business_id = public.auth_business_id()
    and public.auth_role() in ('manager', 'office_manager')
  ) with check (
    business_id = public.auth_business_id()
  );
