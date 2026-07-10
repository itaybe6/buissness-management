-- ============================================================================
-- 034: רק מנהל העסק יכול ליצור משימות חדשות ותבניות קבועות
-- עובדים עדיין יכולים ל-materialize משימה קבועה (template_id + assigned_to = self)
-- אחראי משמרת יכול לעדכן סטטוס בלוח השבועי
-- ============================================================================

drop policy if exists "task_templates_tenant" on public.task_templates;
drop policy if exists "tasks_tenant" on public.tasks;

-- task_templates: כולם קוראים, רק מנהל כותב
create policy "task_templates_read" on public.task_templates
  for select using (public.can_access(business_id));

create policy "task_templates_manager_write" on public.task_templates
  for all using (
    public.can_access(business_id) and public.auth_role() = 'manager'
  ) with check (
    public.can_access(business_id) and public.auth_role() = 'manager'
  );

-- tasks: כולם קוראים
create policy "tasks_read" on public.tasks
  for select using (public.can_access(business_id));

-- tasks: מנהל יוצר משימות חדשות; עובד materialize משימה קבועה משלו
create policy "tasks_insert" on public.tasks
  for insert with check (
    public.can_access(business_id)
    and (
      public.auth_role() = 'manager'
      or (
        template_id is not null
        and assigned_to = auth.uid()
      )
    )
  );

-- tasks: מנהל / אחראי משמרת / המשויך מעדכנים
create policy "tasks_update" on public.tasks
  for update using (
    public.can_access(business_id)
    and (
      public.auth_role() in ('manager', 'shift_manager')
      or assigned_to = auth.uid()
    )
  ) with check (public.can_access(business_id));

-- tasks: רק מנהל מוחק
create policy "tasks_delete" on public.tasks
  for delete using (
    public.can_access(business_id) and public.auth_role() = 'manager'
  );
