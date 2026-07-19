-- Only the employee may insert/update their own agreement signature.
-- Managers retain read access for status tracking.

drop policy if exists "agr_signatures_tenant" on public.agreement_signatures;

create policy "agr_signatures_select" on public.agreement_signatures
  for select using (
    public.can_access(business_id)
    and (
      public.auth_role() in ('manager', 'office_manager', 'shift_manager')
      or employee_id = auth.uid()
    )
  );

create policy "agr_signatures_insert" on public.agreement_signatures
  for insert with check (
    public.can_access(business_id)
    and employee_id = auth.uid()
  );

create policy "agr_signatures_update" on public.agreement_signatures
  for update using (
    public.can_access(business_id)
    and employee_id = auth.uid()
  ) with check (
    public.can_access(business_id)
    and employee_id = auth.uid()
  );
