-- מנהל מחלקה סוגר קופה (כותב טיפים ותוספות), אבל לא קורא שכר של עובדים אחרים.
-- קריאה נשארת למנהל, למנהלת משרד, ולעובד על השורות של עצמו.

drop policy if exists "tips_tenant" on public.tips;
drop policy if exists "tips_select" on public.tips;
drop policy if exists "tips_insert" on public.tips;
drop policy if exists "tips_update" on public.tips;
drop policy if exists "tips_delete" on public.tips;

create policy "tips_select" on public.tips
  for select using (
    public.can_access(business_id)
    and (
      public.is_super_admin()
      or public.auth_role() in ('manager', 'office_manager')
      or employee_id = auth.uid()
    )
  );
create policy "tips_insert" on public.tips
  for insert with check (
    public.can_access(business_id)
    and (
      public.is_super_admin()
      or public.auth_role() in ('manager', 'office_manager', 'department_manager')
    )
  );
create policy "tips_update" on public.tips
  for update using (
    public.can_access(business_id)
    and (public.is_super_admin() or public.auth_role() in ('manager', 'office_manager'))
  ) with check (
    public.can_access(business_id)
    and (public.is_super_admin() or public.auth_role() in ('manager', 'office_manager'))
  );
create policy "tips_delete" on public.tips
  for delete using (
    public.can_access(business_id)
    and (
      public.is_super_admin()
      or public.auth_role() in ('manager', 'office_manager', 'department_manager')
    )
  );

drop policy if exists "shift_bonuses_tenant" on public.shift_bonuses;
drop policy if exists "shift_bonuses_select" on public.shift_bonuses;
drop policy if exists "shift_bonuses_insert" on public.shift_bonuses;
drop policy if exists "shift_bonuses_update" on public.shift_bonuses;
drop policy if exists "shift_bonuses_delete" on public.shift_bonuses;

create policy "shift_bonuses_select" on public.shift_bonuses
  for select using (
    public.can_access(business_id)
    and (
      public.is_super_admin()
      or public.auth_role() in ('manager', 'office_manager')
      or employee_id = auth.uid()
    )
  );
create policy "shift_bonuses_insert" on public.shift_bonuses
  for insert with check (
    public.can_access(business_id)
    and (
      public.is_super_admin()
      or public.auth_role() in ('manager', 'office_manager', 'department_manager')
    )
  );
create policy "shift_bonuses_update" on public.shift_bonuses
  for update using (
    public.can_access(business_id)
    and (public.is_super_admin() or public.auth_role() in ('manager', 'office_manager'))
  ) with check (
    public.can_access(business_id)
    and (public.is_super_admin() or public.auth_role() in ('manager', 'office_manager'))
  );
create policy "shift_bonuses_delete" on public.shift_bonuses
  for delete using (
    public.can_access(business_id)
    and (
      public.is_super_admin()
      or public.auth_role() in ('manager', 'office_manager', 'department_manager')
    )
  );

drop policy if exists "payroll_tenant" on public.payroll_records;
drop policy if exists "payroll_records_select" on public.payroll_records;
drop policy if exists "payroll_records_write" on public.payroll_records;

create policy "payroll_records_select" on public.payroll_records
  for select using (
    public.can_access(business_id)
    and (
      public.is_super_admin()
      or public.auth_role() in ('manager', 'office_manager')
      or employee_id = auth.uid()
    )
  );
create policy "payroll_records_write" on public.payroll_records
  for all using (
    public.can_access(business_id)
    and (public.is_super_admin() or public.auth_role() in ('manager', 'office_manager'))
  ) with check (
    public.can_access(business_id)
    and (public.is_super_admin() or public.auth_role() in ('manager', 'office_manager'))
  );

drop policy if exists "payroll_month_adj_tenant" on public.payroll_month_adjustments;
drop policy if exists "payroll_month_adj_select" on public.payroll_month_adjustments;
drop policy if exists "payroll_month_adj_write" on public.payroll_month_adjustments;

create policy "payroll_month_adj_select" on public.payroll_month_adjustments
  for select using (
    public.can_access(business_id)
    and (
      public.is_super_admin()
      or public.auth_role() in ('manager', 'office_manager')
      or employee_id = auth.uid()
    )
  );
create policy "payroll_month_adj_write" on public.payroll_month_adjustments
  for all using (
    public.can_access(business_id)
    and (public.is_super_admin() or public.auth_role() in ('manager', 'office_manager'))
  ) with check (
    public.can_access(business_id)
    and (public.is_super_admin() or public.auth_role() in ('manager', 'office_manager'))
  );
