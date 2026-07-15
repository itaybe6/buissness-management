-- 040: עובדים יכולים לעדכן כמויות מלאי (inventory_counts); עריכת קטלוג למנהלים בלבד

-- inventory_items
drop policy if exists "inv_items_tenant" on public.inventory_items;
drop policy if exists "inv_items_read" on public.inventory_items;
drop policy if exists "inv_items_manager_insert" on public.inventory_items;
drop policy if exists "inv_items_manager_update" on public.inventory_items;
drop policy if exists "inv_items_manager_delete" on public.inventory_items;

create policy "inv_items_read" on public.inventory_items
  for select using (public.can_access(business_id));

create policy "inv_items_manager_insert" on public.inventory_items
  for insert with check (
    public.can_access(business_id)
    and public.auth_role() in ('manager', 'shift_manager', 'office_manager')
  );

create policy "inv_items_manager_update" on public.inventory_items
  for update using (
    public.can_access(business_id)
    and public.auth_role() in ('manager', 'shift_manager', 'office_manager')
  ) with check (
    public.can_access(business_id)
    and public.auth_role() in ('manager', 'shift_manager', 'office_manager')
  );

create policy "inv_items_manager_delete" on public.inventory_items
  for delete using (
    public.can_access(business_id)
    and public.auth_role() in ('manager', 'shift_manager', 'office_manager')
  );

-- inventory_counts
drop policy if exists "inv_counts_tenant" on public.inventory_counts;
drop policy if exists "inv_counts_read" on public.inventory_counts;
drop policy if exists "inv_counts_insert" on public.inventory_counts;

create policy "inv_counts_read" on public.inventory_counts
  for select using (public.can_access(business_id));

create policy "inv_counts_insert" on public.inventory_counts
  for insert with check (public.can_access(business_id));

-- inventory_logs
drop policy if exists "inv_logs_tenant" on public.inventory_logs;
drop policy if exists "inv_logs_read" on public.inventory_logs;
drop policy if exists "inv_logs_insert" on public.inventory_logs;

create policy "inv_logs_read" on public.inventory_logs
  for select using (public.can_access(business_id));

create policy "inv_logs_insert" on public.inventory_logs
  for insert with check (public.can_access(business_id));
