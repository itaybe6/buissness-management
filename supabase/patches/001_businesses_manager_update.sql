-- Allow business managers to update their own business row (location, etc.)
-- Run once in Supabase Dashboard → SQL Editor if not applied via schema.sql

drop policy if exists "businesses_manager_update" on public.businesses;
create policy "businesses_manager_update" on public.businesses
  for update using (
    id = public.auth_business_id() and public.auth_role() = 'manager'
  ) with check (id = public.auth_business_id());
